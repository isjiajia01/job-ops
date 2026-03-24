import type { Job, JobChatMessage } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText } from "lucide-react";
import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/client/lib/queryKeys";
import { useProfile } from "../hooks/useProfile";
import * as api from "../api";

function normalizeCoverLetterContent(messages: JobChatMessage[]): string {
  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return latestAssistant?.content?.trim() || "";
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
  const coverLetter = normalizeCoverLetterContent(messagesQuery.data?.messages ?? []);
  const personName = profile?.basics?.name || "Jiajia Zhang";
  const email = profile?.basics?.email || "";
  const phone = profile?.basics?.phone || "";
  const location = [profile?.basics?.location?.city, profile?.basics?.location?.region]
    .filter(Boolean)
    .join(", ");

  React.useEffect(() => {
    if (!shouldPrint || !coverLetter) return;
    const timeout = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timeout);
  }, [shouldPrint, coverLetter]);

  const paragraphs = coverLetter
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <>
      <style>{`
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
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="mr-2 h-4 w-4" />
              Download Cover Letter PDF
            </Button>
          </div>
        </div>

        <article className="cover-letter-paper mx-auto flex max-w-4xl flex-col gap-8 rounded-2xl border border-stone-200 bg-white px-8 py-10 shadow-sm print:rounded-none print:border-none print:shadow-none">
          <header className="border-b border-stone-200 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
                  {personName}
                </h1>
                <p className="mt-2 text-sm text-stone-600">
                  Planning, supply chain, and analytics-focused early-career candidate
                </p>
              </div>
              <div className="space-y-1 text-right text-sm text-stone-600">
                {email ? <div>{email}</div> : null}
                {phone ? <div>{phone}</div> : null}
                {location ? <div>{location}</div> : null}
              </div>
            </div>
          </header>

          <section className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Cover Letter
              </div>
              <h2 className="text-2xl font-semibold leading-tight text-stone-900">
                {job?.title || "Cover Letter Draft"}
              </h2>
              <p className="text-sm text-stone-600">{job?.employer || ""}</p>
            </div>
            <div className="space-y-1 rounded-xl bg-stone-50 px-4 py-4 text-sm text-stone-600">
              {job?.location ? <div>{job.location}</div> : null}
              {job?.applicationLink ? <div>Application in progress</div> : null}
              <div>Generated from latest Ghostwriter draft</div>
            </div>
          </section>

          {coverLetter ? (
            <section className="space-y-5 text-[15px] leading-8 text-stone-800">
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
              ))}
            </section>
          ) : (
            <section className="rounded-xl border border-dashed border-stone-300 px-5 py-8 text-sm text-stone-500">
              No cover letter draft found yet. Generate one in Ghostwriter first, then return here to preview or download it as PDF.
            </section>
          )}

          <footer className="border-t border-stone-200 pt-6 text-xs text-stone-500">
            This PDF-ready template uses the latest Ghostwriter assistant draft for the selected job.
          </footer>
        </article>
      </main>
    </>
  );
};
