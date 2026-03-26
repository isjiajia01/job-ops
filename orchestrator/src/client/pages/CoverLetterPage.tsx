import type { Job, JobChatMessage } from "@shared/types.js";
import { getGhostwriterCoverLetterDraft } from "@shared/utils/ghostwriter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { downloadCoverLetterPdfForJob } from "@/client/lib/cover-letter-pdf";
import { Button } from "@/components/ui/button";
import * as api from "../api";
import { useProfile } from "../hooks/useProfile";

function normalizeCoverLetterContent(messages: JobChatMessage[]): string {
  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return latestAssistant
    ? getGhostwriterCoverLetterDraft(latestAssistant.content)
    : "";
}

function splitCoverLetterSections(content: string): {
  greeting: string | null;
  body: string[];
  signoff: string | null;
  signature: string | null;
} {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return { greeting: null, body: [], signoff: null, signature: null };
  }

  let greeting: string | null = null;
  let signoff: string | null = null;
  let signature: string | null = null;
  const body = [...paragraphs];

  const first = body[0] ?? "";
  if (/^(dear|hello|hi|to )/i.test(first)) {
    greeting = body.shift() ?? null;
  }

  const last = body.at(-1) ?? "";
  if (/^(best regards|kind regards|sincerely|med venlig hilsen)/i.test(last)) {
    signoff = body.pop() ?? null;
    const maybeSignature = body.at(-1) ?? "";
    if (maybeSignature && !/[.!?]$/.test(maybeSignature)) {
      signature = body.pop() ?? null;
    }
  } else if (body.length >= 2) {
    const maybeSignoff = body.at(-2) ?? "";
    const maybeSignature = body.at(-1) ?? "";
    if (
      /^(best regards|kind regards|sincerely|med venlig hilsen)/i.test(
        maybeSignoff,
      ) &&
      maybeSignature &&
      !/[.!?]$/.test(maybeSignature)
    ) {
      body.pop();
      body.pop();
      signoff = maybeSignoff;
      signature = maybeSignature;
    }
  }

  return { greeting, body, signoff, signature };
}

export const CoverLetterPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shouldPrint = searchParams.get("print") === "1";
  const { profile } = useProfile();

  const jobQuery = useQuery<Job | null>({
    queryKey: ["jobs", "detail", id ?? null] as const,
    queryFn: () => (id ? api.getJob(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });

  const messagesQuery = useQuery<{ messages: JobChatMessage[] }>({
    queryKey: ["jobs", "cover-letter", id ?? null] as const,
    queryFn: () =>
      id
        ? api.listJobGhostwriterMessages(id, { limit: 100 })
        : Promise.resolve({ messages: [] }),
    enabled: Boolean(id),
  });

  const job = jobQuery.data ?? null;
  const coverLetter = normalizeCoverLetterContent(
    messagesQuery.data?.messages ?? [],
  );
  const personName = profile?.basics?.name || "Jiajia Zhang";
  const email = profile?.basics?.email || "";
  const phone = profile?.basics?.phone || "";
  const location = [
    profile?.basics?.location?.city,
    profile?.basics?.location?.region,
  ]
    .filter(Boolean)
    .join(", ");
  const todayLabel = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  React.useEffect(() => {
    if (!shouldPrint || !coverLetter) return;
    const timeout = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timeout);
  }, [shouldPrint, coverLetter]);

  const sections = splitCoverLetterSections(coverLetter);
  const handleDownloadPdf = React.useCallback(async () => {
    if (!id) return;
    await downloadCoverLetterPdfForJob(id);
  }, [id]);

  return (
    <>
      <style>{`
        @page {
          size: A4;
          margin: 18mm 16mm;
        }
        @media print {
          body {
            background: white !important;
          }
          .cover-letter-screen-only {
            display: none !important;
          }
          .cover-letter-paper {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            max-width: none !important;
            padding: 0 !important;
          }
          .cover-letter-print-grid {
            display: block !important;
          }
        }
      `}</style>

      <main className="min-h-screen bg-stone-100 px-4 py-6 print:bg-white print:px-0 print:py-0">
        <div className="cover-letter-screen-only mx-auto mb-4 flex max-w-4xl items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDownloadPdf()}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Cover Letter PDF
            </Button>
          </div>
        </div>

        <article className="cover-letter-paper mx-auto max-w-4xl rounded-2xl border border-stone-200 bg-white px-8 py-10 shadow-sm print:rounded-none print:border-none print:shadow-none">
          <div className="cover-letter-print-grid grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <header className="space-y-8">
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Cover Letter
                </div>
                <h1 className="font-serif text-4xl leading-tight text-stone-900">
                  {personName}
                </h1>
                <p className="max-w-sm text-sm leading-6 text-stone-600">
                  Planning, supply chain, and analytics-focused early-career
                  candidate
                </p>
              </div>

              <div className="space-y-1 text-sm leading-6 text-stone-700">
                {email ? <div>{email}</div> : null}
                {phone ? <div>{phone}</div> : null}
                {location ? <div>{location}</div> : null}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 text-sm leading-6 text-stone-700">
                <div className="font-medium text-stone-900">
                  {job?.employer || "Employer"}
                </div>
                <div>{job?.title || "Cover Letter Draft"}</div>
                {job?.location ? <div>{job.location}</div> : null}
                <div className="pt-3 text-stone-500">{todayLabel}</div>
              </div>
            </header>

            <section className="space-y-6">
              {sections.greeting ? (
                <p className="text-[15px] leading-8 text-stone-800">
                  {sections.greeting}
                </p>
              ) : null}

              {coverLetter ? (
                <div className="space-y-5 text-[15px] leading-8 text-stone-800">
                  {sections.body.map((paragraph, index) => (
                    <p key={`${index}-${paragraph.slice(0, 24)}`}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : (
                <section className="rounded-xl border border-dashed border-stone-300 px-5 py-8 text-sm text-stone-500">
                  No cover letter draft found yet. Generate one in Ghostwriter
                  first, then return here to preview or download it as PDF.
                </section>
              )}

              {(sections.signoff || sections.signature) && coverLetter ? (
                <div className="space-y-2 pt-4 text-[15px] leading-7 text-stone-800">
                  {sections.signoff ? <p>{sections.signoff}</p> : null}
                  {sections.signature ? (
                    <p className="font-medium text-stone-900">
                      {sections.signature}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!sections.signoff && !sections.signature && coverLetter ? (
                <div className="pt-4 text-[15px] leading-7 text-stone-800">
                  <p className="font-medium text-stone-900">{personName}</p>
                </div>
              ) : null}
            </section>
          </div>

          <footer className="mt-10 border-t border-stone-200 pt-5 text-xs text-stone-500">
            This PDF-ready template uses the latest Ghostwriter assistant draft
            for the selected job.
          </footer>
        </article>
      </main>
    </>
  );
};
