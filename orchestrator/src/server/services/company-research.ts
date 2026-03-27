import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { CompanyResearchNote } from "@shared/types";
import * as jobsRepo from "../repositories/jobs";
import { getCandidateKnowledgeBase } from "./candidate-knowledge";

function normalizeCompanyName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildSearchCandidates(job: {
  employer?: string | null;
  title?: string | null;
  jobUrl?: string | null;
}): string[] {
  const out = new Set<string>();
  if (job.employer?.trim()) {
    out.add(`${job.employer.trim()} company overview`);
    if (job.title?.trim()) {
      out.add(`${job.employer.trim()} ${job.title.trim()} team mission`);
    }
  }
  if (job.jobUrl?.trim()) {
    out.add(job.jobUrl.trim());
  }
  return [...out];
}

function toCompanyResearchSummary(raw: string, company: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const clipped = cleaned.slice(0, 900);
  return `${company}: ${clipped}`;
}

async function searchPublicWeb(query: string): Promise<{
  summary: string | null;
  source: string | null;
}> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return { summary: null, source: null };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    throw new Error(`Company research search failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    answer?: string;
    results?: Array<{ url?: string; content?: string }>;
  };

  const answer = payload.answer?.trim();
  if (answer) {
    return {
      summary: answer,
      source: payload.results?.[0]?.url?.trim() || null,
    };
  }

  const firstSnippet = payload.results?.find((item) => item.content?.trim());
  return {
    summary: firstSnippet?.content?.trim() || null,
    source: firstSnippet?.url?.trim() || null,
  };
}

export async function getCompanyResearchNoteForJob(
  jobId: string,
): Promise<CompanyResearchNote | null> {
  const job = await jobsRepo.getJobById(jobId);
  if (!job?.employer?.trim()) return null;

  const employer = job.employer.trim();
  const knowledgeBase = await getCandidateKnowledgeBase();
  const manualNote =
    knowledgeBase.companyResearchNotes?.find(
      (item) =>
        normalizeCompanyName(item.company) === normalizeCompanyName(employer),
    ) ?? null;
  if (manualNote) {
    return manualNote;
  }

  const queries = buildSearchCandidates(job);
  for (const query of queries) {
    try {
      const result = await searchPublicWeb(query);
      const summary = result.summary
        ? toCompanyResearchSummary(result.summary, employer)
        : null;
      if (summary) {
        return {
          company: employer,
          source: result.source,
          summary,
        };
      }
    } catch (error) {
      logger.warn("Company research lookup failed", {
        jobId,
        employer,
        query,
        error: sanitizeUnknown(error),
      });
    }
  }

  return null;
}
