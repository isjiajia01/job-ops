/**
 * Service for generating tailored resume content (Summary, Headline, Skills).
 */

import { logger } from "@infra/logger";
import type { CandidateKnowledgeBase, ResumeProfile } from "@shared/types";
import { LlmService } from "./llm/service";
import type { JsonSchemaDefinition } from "./llm/types";
import { resolveLlmModel } from "./modelSelection";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import {
  getWritingStyle,
  stripLanguageDirectivesFromConstraints,
} from "./writing-style";
import { getCandidateKnowledgeBase } from "./candidate-knowledge";

export interface TailoredData {
  summary: string;
  headline: string;
  skills: Array<{ name: string; keywords: string[] }>;
}

interface TailoringStrategy {
  roleAngle: string;
  strongestEvidence: string[];
  priorityTerms: string[];
  coverLetterAngle: string;
}

export interface TailoringResult {
  success: boolean;
  data?: TailoredData & { strategy: TailoringStrategy };
  error?: string;
}

export type TailoringJobInput =
  | string
  | {
      title?: string | null;
      employer?: string | null;
      location?: string | null;
      salary?: string | null;
      jobDescription?: string | null;
    };

/** JSON schema for resume tailoring response */
const STRATEGY_SCHEMA: JsonSchemaDefinition = {
  name: "resume_tailoring_strategy",
  schema: {
    type: "object",
    properties: {
      roleAngle: { type: "string" },
      strongestEvidence: {
        type: "array",
        items: { type: "string" },
      },
      priorityTerms: {
        type: "array",
        items: { type: "string" },
      },
      coverLetterAngle: { type: "string" },
    },
    required: ["roleAngle", "strongestEvidence", "priorityTerms", "coverLetterAngle"],
    additionalProperties: false,
  },
};

const TAILORING_SCHEMA: JsonSchemaDefinition = {
  name: "resume_tailoring",
  schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "Job title headline matching the JD exactly",
      },
      summary: {
        type: "string",
        description: "Tailored resume summary paragraph",
      },
      skills: {
        type: "array",
        description: "Skills sections with keywords tailored to the job",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Skill category name (e.g., Frontend, Backend)",
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "List of skills/technologies in this category",
            },
          },
          required: ["name", "keywords"],
          additionalProperties: false,
        },
      },
    },
    required: ["headline", "summary", "skills"],
    additionalProperties: false,
  },
};

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function normalizeJobInput(input: TailoringJobInput) {
  if (typeof input === "string") {
    return {
      title: null,
      employer: null,
      location: null,
      salary: null,
      jobDescription: input,
    };
  }

  return {
    title: input.title ?? null,
    employer: input.employer ?? null,
    location: input.location ?? null,
    salary: input.salary ?? null,
    jobDescription: input.jobDescription ?? "",
  };
}

async function loadCandidateKnowledge(): Promise<CandidateKnowledgeBase> {
  try {
    return await getCandidateKnowledgeBase();
  } catch (error) {
    logger.warn("Failed to load candidate knowledge for tailoring", { error });
    return {
      personalFacts: [],
      projects: [],
      companyResearchNotes: [],
    };
  }
}

/**
 * Generate tailored resume content (summary, headline, skills) for a job.
 */
export async function generateTailoring(
  jobInput: TailoringJobInput,
  profile: ResumeProfile,
): Promise<TailoringResult> {
  const normalizedJob = normalizeJobInput(jobInput);
  const [model, writingStyle, knowledgeBase] = await Promise.all([
    resolveLlmModel("tailoring"),
    getWritingStyle(),
    loadCandidateKnowledge(),
  ]);
  const llm = new LlmService();
  const strategyPrompt = buildTailoringStrategyPrompt(
    profile,
    knowledgeBase,
    normalizedJob,
    writingStyle,
  );
  const strategyResult = await llm.callJson<TailoringStrategy>({
    model,
    messages: [{ role: "user", content: strategyPrompt }],
    jsonSchema: STRATEGY_SCHEMA,
  });

  const strategy = strategyResult.success
    ? strategyResult.data
    : {
        roleAngle: "Position the candidate around the strongest truthful overlap with the JD.",
        strongestEvidence: [],
        priorityTerms: [],
        coverLetterAngle: "Explain fit through 2-3 concrete examples from the profile.",
      };

  const prompt = buildTailoringPrompt(
    profile,
    knowledgeBase,
    normalizedJob,
    writingStyle,
    strategy,
  );

  const result = await llm.callJson<TailoredData>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: TAILORING_SCHEMA,
  });

  if (!result.success) {
    const context = `provider=${llm.getProvider()} baseUrl=${llm.getBaseUrl()}`;
    if (result.error.toLowerCase().includes("api key")) {
      const message = `LLM API key not set, cannot generate tailoring. (${context})`;
      logger.warn(message);
      return { success: false, error: message };
    }
    return {
      success: false,
      error: `${result.error} (${context})`,
    };
  }

  const { summary, headline, skills } = result.data;

  if (!summary || !headline || !Array.isArray(skills)) {
    logger.warn("AI response missing required tailoring fields", result.data);
  }

  return {
    success: true,
    data: {
      summary: sanitizeText(summary || ""),
      headline: sanitizeText(headline || ""),
      skills: skills || [],
      strategy,
    },
  };
}

export async function generateSummary(
  jobInput: TailoringJobInput,
  profile: ResumeProfile,
): Promise<{ success: boolean; summary?: string; error?: string }> {
  const result = await generateTailoring(jobInput, profile);
  return {
    success: result.success,
    summary: result.data?.summary,
    error: result.error,
  };
}

function buildTailoringStrategyPrompt(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
  job: ReturnType<typeof normalizeJobInput>,
  writingStyle: Awaited<ReturnType<typeof getWritingStyle>>,
): string {
  const relevantFacts = (knowledgeBase.personalFacts ?? [])
    .slice(0, 10)
    .map((fact) => `${fact.title}: ${truncate(fact.detail, 180)}`);

  return `
You are preparing document strategy before writing a tailored CV and cover letter.
Read the JD and candidate evidence carefully, then produce a concise strategy object.

TARGET JOB:
${JSON.stringify(job, null, 2)}

CANDIDATE BASICS:
${JSON.stringify(
  {
    headline: profile.basics?.headline ?? profile.basics?.label,
    summary: truncate(profile.sections?.summary?.content ?? profile.basics?.summary, 900),
  },
  null,
  2,
)}

TOP EXPERIENCE:
${JSON.stringify((profile.sections?.experience?.items ?? []).slice(0, 5), null, 2)}

TOP PROJECTS:
${JSON.stringify((profile.sections?.projects?.items ?? []).slice(0, 6), null, 2)}

SHARED FACTS:
${JSON.stringify(relevantFacts, null, 2)}

INSTRUCTIONS:
- roleAngle: one sentence describing the strongest truthful positioning angle for this role.
- strongestEvidence: 2-4 bullet-like strings with the best evidence to reuse in CV and cover letter.
- priorityTerms: 4-8 JD terms or phrases worth reflecting in the CV when supported by the profile.
- coverLetterAngle: one sentence describing the narrative angle the cover letter should lean on.
- Be specific, evidence-backed, and recruiter-minded.
- Do not invent missing experience.
- Current writing tone is ${writingStyle.tone}, formality is ${writingStyle.formality}.
`;
}

function buildTailoringPrompt(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
  job: ReturnType<typeof normalizeJobInput>,
  writingStyle: Awaited<ReturnType<typeof getWritingStyle>>,
  strategy: TailoringStrategy,
): string {
  const resolvedLanguage = resolveWritingOutputLanguage({
    style: writingStyle,
    profile,
  });
  const outputLanguage = getWritingLanguageLabel(resolvedLanguage.language);
  const effectiveConstraints = stripLanguageDirectivesFromConstraints(
    writingStyle.constraints,
  );

  const relevantProfile = {
    basics: {
      name: profile.basics?.name,
      label: profile.basics?.label,
      headline: profile.basics?.headline,
      summary: truncate(
        profile.sections?.summary?.content ?? profile.basics?.summary,
        1200,
      ),
      location: profile.basics?.location,
    },
    skills: (profile.sections?.skills?.items ?? []).slice(0, 12).map((item) => ({
      name: item.name,
      keywords: (item.keywords ?? []).slice(0, 10),
      description: item.description,
    })),
    projects: (profile.sections?.projects?.items ?? [])
      .filter((p) => p.visible !== false)
      .slice(0, 8)
      .map((p) => ({
        name: p.name,
        summary: truncate(p.summary ?? p.description, 280),
        keywords: (p.keywords ?? []).slice(0, 8),
        date: p.date,
      })),
    experience: (profile.sections?.experience?.items ?? [])
      .filter((e) => e.visible !== false)
      .slice(0, 6)
      .map((e) => ({
        company: e.company,
        position: e.position,
        summary: truncate(e.summary, 320),
        date: e.date,
      })),
    personalFacts: (knowledgeBase.personalFacts ?? []).slice(0, 10).map((fact) => ({
      title: fact.title,
      detail: truncate(fact.detail, 220),
    })),
    extraProjects: (knowledgeBase.projects ?? []).slice(0, 6).map((project) => ({
      name: project.name,
      role: project.role,
      summary: truncate(project.summary, 220),
      impact: truncate(project.impact, 180),
      keywords: project.keywords.slice(0, 8),
    })),
  };

  return `
You are an expert resume and application writer tailoring a profile for a specific job application.
You must return a JSON object with exactly three fields: "headline", "summary", and "skills".

TARGET JOB:
${JSON.stringify(
  {
    title: job.title,
    employer: job.employer,
    location: job.location,
    salary: job.salary,
  },
  null,
  2,
)}

JOB DESCRIPTION (JD):
${job.jobDescription}

CANDIDATE PROFILE:
${JSON.stringify(relevantProfile, null, 2)}

PRIMARY GOAL:
Produce a materially stronger, more job-specific CV draft that improves both ATS match and recruiter quality.
This means the summary and skills should feel tightly aligned to the real work in the JD, while staying fully truthful to the supplied profile.

INSTRUCTIONS:

1. "headline" (String):
   - CRITICAL: this is the strongest ATS anchor.
   - Use the exact target job title wording from the JD when it is clear.
   - Do NOT translate, localize, or paraphrase the headline, even if the rest of the output is in ${outputLanguage}.

2. "summary" (String):
   - Write one compact recruiter-facing summary paragraph in ${outputLanguage}.
   - Aim for high quality rather than generic completeness: usually 70-110 words.
   - Start from the employer need and role fit, not from generic motivation.
   - Mirror the real work of the JD: domain, scope, tools, planning context, analytical work, stakeholder work, or execution style.
   - Ground every major claim in supplied evidence from experience, projects, or shared facts.
   - Use 2-4 concrete signals from the profile that are most relevant to this specific JD.
   - Prefer specific language over soft adjectives. Avoid empty phrases like "passionate", "hard-working", or "results-driven" unless the supplied evidence makes them concrete.
   - Do NOT invent experience, ownership, seniority, metrics, or tools.
   - Do NOT write a cover letter. This is CV summary text.

3. "skills" (Array of Objects):
   - Rebuild the skills groups so they better match the JD while remaining truthful.
   - Preserve the grouped structure: { "name": "...", "keywords": [...] }.
   - Keep categories crisp and recruiter-friendly.
   - Prioritize exact JD terminology, acronyms, and technology names where appropriate for ATS.
   - Remove weak filler keywords that are not helping for this job.
   - Reorder skill groups and keywords toward the strongest fit for this role.
   - Write user-visible skill text in ${outputLanguage} when natural, but keep exact JD terms and technology names when that improves matching.

DOCUMENT STRATEGY:
- Role angle: ${strategy.roleAngle}
- Strongest evidence to prioritize:
${strategy.strongestEvidence.map((item) => `  - ${item}`).join("\n")}
- Priority JD terms:
${strategy.priorityTerms.map((item) => `  - ${item}`).join("\n")}
- Cover-letter angle to stay aligned with: ${strategy.coverLetterAngle}

QUALITY BAR:
- The output should sound like a strong human editor read both the JD and the profile carefully.
- Prefer fewer, sharper claims over broad generic summaries.
- Use internships, thesis work, academic projects, and hands-on project evidence confidently when they are the best available evidence.
- If the JD suggests a stretch, position the candidate honestly as adjacent and capable rather than pretending perfect fit.
- Keep the CV summary aligned with the cover-letter angle so both documents tell the same story.

WRITING STYLE PREFERENCES:
- Tone: ${writingStyle.tone}
- Formality: ${writingStyle.formality}
- Output language for summary and skills: ${outputLanguage}
${effectiveConstraints ? `- Additional constraints: ${effectiveConstraints}` : ""}
${writingStyle.doNotUse ? `- Avoid these words or phrases: ${writingStyle.doNotUse}` : ""}

ATS SAFETY:
- Keep "headline" in the exact original target job-title wording from the JD.
- Do not translate the headline, even when summary and skills are written in ${outputLanguage}.

OUTPUT FORMAT (JSON):
{
  "headline": "...",
  "summary": "...",
  "skills": [
    { "name": "...", "keywords": ["...", "..."] }
  ]
}
`;
}

function sanitizeText(text: string): string {
  return text
    .replace(/\*\*[\s\S]*?\*\*/g, "")
    .trim();
}
