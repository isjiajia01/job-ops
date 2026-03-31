import type { JobChatMessage, ResumeProfile } from "@shared/types";
import { getGhostwriterCoverLetterDraft } from "@shared/utils/ghostwriter";
import * as api from "@/client/api";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 56;
const BODY_FONT_SIZE = 11;
const META_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 22;
const SECTION_GAP = 12;

type PdfLine = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
};

type CoverLetterPdfInput = {
  personName: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  employer?: string | null;
  title?: string | null;
  jobLocation?: string | null;
  dateLabel?: string | null;
  content: string;
  fileName: string;
};

function sanitizePdfText(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .replace(/å/g, "a")
    .replace(/Å/g, "A")
    .replace(/[^\x20-\x7E]/g, "");
}

function formatLocation(profile: ResumeProfile | null): string {
  return [profile?.basics?.location?.city, profile?.basics?.location?.region]
    .filter(Boolean)
    .join(", ");
}

function createMeasureContext(
  fontSize: number,
): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = `${fontSize}px Helvetica, Arial, sans-serif`;
  return context;
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const normalized = sanitizePdfText(text).trim();
  if (!normalized) return [];

  const context = createMeasureContext(fontSize);
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = context
      ? context.measureText(candidate).width
      : candidate.length * fontSize * 0.54;

    if (width <= maxWidth || !current) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function toPdfTextHex(text: string): string {
  return sanitizePdfText(text)
    .split("")
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function buildPdfBlob(input: CoverLetterPdfInput): Blob {
  const pages: PdfLine[][] = [[]];
  let currentPage = pages[0];
  let y = MARGIN_TOP;
  const contentWidth = PAGE_WIDTH - MARGIN_X * 2;

  const ensureSpace = (height: number) => {
    if (y + height <= PAGE_HEIGHT - MARGIN_BOTTOM) return;
    currentPage = [];
    pages.push(currentPage);
    y = MARGIN_TOP;
  };

  const pushLine = (text: string, fontSize: number, x = MARGIN_X) => {
    ensureSpace(fontSize + 6);
    currentPage.push({ text, x, y, fontSize });
    y += fontSize + 4;
  };

  const pushParagraph = (text: string, fontSize = BODY_FONT_SIZE) => {
    const lines = wrapText(text, contentWidth, fontSize);
    for (const line of lines) {
      pushLine(line, fontSize);
    }
    y += SECTION_GAP;
  };

  pushLine(input.personName, TITLE_FONT_SIZE);
  for (const meta of [input.email, input.phone, input.location].filter(
    Boolean,
  )) {
    pushLine(meta ?? "", META_FONT_SIZE);
  }
  y += 8;

  for (const meta of [
    input.employer,
    input.title,
    input.jobLocation,
    input.dateLabel,
  ].filter(Boolean)) {
    pushLine(meta ?? "", META_FONT_SIZE);
  }
  y += 10;

  for (const paragraph of input.content
    .split(/\n\s*\n/)
    .map((part) => part.trim())) {
    if (!paragraph) continue;
    pushParagraph(paragraph);
  }

  const objects: string[] = [];
  const fontObjectId = pages.length * 2 + 3;

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const pageObjectIds = pages.map((_, index) => index * 2 + 3);
  objects.push(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );

  for (const [index, page] of pages.entries()) {
    const pageObjectId = index * 2 + 3;
    const contentObjectId = pageObjectId + 1;
    const commands = page
      .map((line) => {
        const pdfY = PAGE_HEIGHT - line.y - line.fontSize;
        return `BT /F1 ${line.fontSize} Tf 1 0 0 1 ${line.x.toFixed(2)} ${pdfY.toFixed(2)} Tm <${toPdfTextHex(line.text)}> Tj ET`;
      })
      .join("\n");
    const contentStream = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );
    objects.push(contentStream);
  }

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const parts: string[] = ["%PDF-1.4"];
  const offsets: number[] = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(parts.join("\n").length + 1);
    parts.push(`${index + 1} 0 obj\n${object}\nendobj`);
  }

  const xrefStart = parts.join("\n").length + 1;
  parts.push(`xref\n0 ${objects.length + 1}`);
  parts.push("0000000000 65535 f ");
  for (const offset of offsets.slice(1)) {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n `);
  }
  parts.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );

  return new Blob([parts.join("\n")], { type: "application/pdf" });
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadCoverLetterPdfForJob(
  jobId: string,
): Promise<void> {
  const [job, profile, data] = await Promise.all([
    api.getApplication(jobId),
    api.getProfile().catch(() => null),
    api.listApplicationGhostwriterMessages(jobId, { limit: 100 }),
  ]);

  const latestAssistant = [...data.messages]
    .reverse()
    .find((message: JobChatMessage) => message.role === "assistant");
  const content = latestAssistant
    ? getGhostwriterCoverLetterDraft(latestAssistant.content)
    : "";

  if (!content.trim()) {
    throw new Error("No cover letter draft found yet.");
  }

  const safeEmployer = (job.employer || "employer")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const safeTitle = (job.title || "job")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const blob = buildPdfBlob({
    personName: profile?.basics?.name || "Candidate Name",
    email: profile?.basics?.email || null,
    phone: profile?.basics?.phone || null,
    location: formatLocation(profile),
    employer: job.employer,
    title: job.title,
    jobLocation: job.location,
    dateLabel: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    content,
    fileName: `cover-letter-${safeEmployer}-${safeTitle}.pdf`,
  });

  triggerDownload(blob, `cover-letter-${safeEmployer}-${safeTitle}.pdf`);
}
