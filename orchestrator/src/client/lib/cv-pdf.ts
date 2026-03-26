import type { ResumeProfile } from "@shared/types";
import { createEmptyResumeProfile } from "@shared/utils/profile";
import * as api from "@/client/api";
import { parseTailoredSkills } from "@/client/components/tailoring-utils";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 52;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 48;
const TITLE_FONT_SIZE = 22;
const META_FONT_SIZE = 10;
const SECTION_FONT_SIZE = 10;
const BODY_FONT_SIZE = 11;
const PARAGRAPH_GAP = 12;

type PdfLine = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
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

function toPdfTextHex(text: string): string {
  return sanitizePdfText(text)
    .split("")
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
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

function formatLocation(profile: ResumeProfile | null): string {
  return [profile?.basics?.location?.city, profile?.basics?.location?.region]
    .filter(Boolean)
    .join(", ");
}

function buildPdfBlob(input: {
  personName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  employer: string;
  title: string;
  skills: string[];
  experience: Array<{ title: string; date: string; body: string }>;
  projects: Array<{ title: string; date: string; body: string }>;
}): Blob {
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
    for (const line of wrapText(text, contentWidth, fontSize)) {
      pushLine(line, fontSize);
    }
    y += PARAGRAPH_GAP;
  };

  const pushSectionTitle = (text: string) => {
    ensureSpace(24);
    pushLine(text.toUpperCase(), SECTION_FONT_SIZE);
    y += 2;
  };

  pushLine(input.personName, TITLE_FONT_SIZE);
  if (input.headline) pushLine(input.headline, BODY_FONT_SIZE);
  for (const meta of [input.email, input.phone, input.location].filter(
    Boolean,
  )) {
    pushLine(meta, META_FONT_SIZE);
  }
  y += 8;

  if (input.title || input.employer) {
    pushSectionTitle("Target Role");
    if (input.title) pushLine(input.title, BODY_FONT_SIZE);
    if (input.employer) pushLine(input.employer, BODY_FONT_SIZE);
    y += 8;
  }

  if (input.summary) {
    pushSectionTitle("Summary");
    pushParagraph(input.summary);
  }

  if (input.skills.length > 0) {
    pushSectionTitle("Skills");
    pushParagraph(input.skills.join(", "));
  }

  if (input.experience.length > 0) {
    pushSectionTitle("Experience");
    for (const item of input.experience) {
      pushLine(item.title, BODY_FONT_SIZE);
      if (item.date) pushLine(item.date, META_FONT_SIZE);
      if (item.body) pushParagraph(item.body);
    }
  }

  if (input.projects.length > 0) {
    pushSectionTitle("Projects");
    for (const item of input.projects) {
      pushLine(item.title, BODY_FONT_SIZE);
      if (item.date) pushLine(item.date, META_FONT_SIZE);
      if (item.body) pushParagraph(item.body);
    }
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

export async function downloadCvPdfForJob(jobId: string): Promise<void> {
  const [job, profile] = await Promise.all([
    api.getJob(jobId),
    api.getProfile().catch(() => createEmptyResumeProfile() as ResumeProfile),
  ]);

  const safeEmployer = (job.employer || "employer")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const safeTitle = (job.title || "job")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  const tailoredSkills = parseTailoredSkills(job.tailoredSkills);
  const skills =
    tailoredSkills.length > 0
      ? tailoredSkills.flatMap((group) =>
          group.keywords.length > 0 ? group.keywords : [group.name],
        )
      : (profile.sections?.skills?.items ?? []).flatMap((item) =>
          item.keywords?.length ? item.keywords : [item.name],
        );

  const blob = buildPdfBlob({
    personName: profile.basics?.name || "Candidate",
    headline:
      job.tailoredHeadline ||
      profile.basics?.headline ||
      profile.basics?.label ||
      "",
    email: profile.basics?.email || "",
    phone: profile.basics?.phone || "",
    location: formatLocation(profile),
    summary:
      job.tailoredSummary ||
      profile.sections?.summary?.content ||
      profile.basics?.summary ||
      "",
    employer: job.employer,
    title: job.title,
    skills: skills.filter(Boolean),
    experience: (profile.sections?.experience?.items ?? []).map((item) => ({
      title: `${item.position} @ ${item.company}`,
      date: item.date,
      body: item.summary,
    })),
    projects: (profile.sections?.projects?.items ?? []).map((item) => ({
      title: item.name,
      date: item.date,
      body: item.summary,
    })),
  });

  triggerDownload(blob, `cv-${safeEmployer}-${safeTitle}.pdf`);
}
