/**
 * Service for generating tailored resume content (Summary, Headline, Skills).
 */

import { logger } from "@infra/logger";
import type { ResumeProfile } from "@shared/types";
import { getSetting } from "../repositories/settings";
import { LlmService } from "./llm/service";
import type { JsonSchemaDefinition } from "./llm/types";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import {
  getWritingStyle,
  stripLanguageDirectivesFromConstraints,
} from "./writing-style";

export interface TailoredExperienceEdit {
  id: string;
  bullets: string[];
}

export interface TailoredLayoutDirectives {
  sectionOrder?: string[];
  hiddenSections?: string[];
  hiddenProjectIds?: string[];
  hiddenExperienceIds?: string[];
}

export interface TailoredData {
  summary: string;
  headline: string;
  skills: Array<{ name: string; keywords: string[] }>;
  experienceEdits: TailoredExperienceEdit[];
  layoutDirectives: TailoredLayoutDirectives;
  sectionRationale: string;
  omissionRationale: string;
}

export interface TailoringResult {
  success: boolean;
  data?: TailoredData;
  error?: string;
}

/** JSON schema for resume tailoring response */
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
      experienceEdits: {
        type: "array",
        description: "Structured rewrites for resume experience bullet lists keyed by experience id",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["id", "bullets"],
          additionalProperties: false,
        },
      },
      layoutDirectives: {
        type: "object",
        properties: {
          sectionOrder: { type: "array", items: { type: "string" } },
          hiddenSections: { type: "array", items: { type: "string" } },
          hiddenProjectIds: { type: "array", items: { type: "string" } },
          hiddenExperienceIds: { type: "array", items: { type: "string" } },
        },
        required: ["sectionOrder", "hiddenSections", "hiddenProjectIds", "hiddenExperienceIds"],
        additionalProperties: false,
      },
      sectionRationale: { type: "string", description: "Short explanation of why the chosen section ordering and emphasis fit this JD" },
      omissionRationale: { type: "string", description: "Short explanation of any hidden sections, projects, or experience items for this JD" },
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
    required: ["headline", "summary", "skills", "experienceEdits", "layoutDirectives", "sectionRationale", "omissionRationale"],
    additionalProperties: false,
  },
};

/**
 * Generate tailored resume content (summary, headline, skills) for a job.
 */
export async function generateTailoring(
  jobDescription: string,
  profile: ResumeProfile,
): Promise<TailoringResult> {
  const [overrideModel, overrideModelTailoring, writingStyle] =
    await Promise.all([
      getSetting("model"),
      getSetting("modelTailoring"),
      getWritingStyle(),
    ]);
  // Precedence: Tailoring-specific override > Global override > Env var > Default
  const model =
    overrideModelTailoring ||
    overrideModel ||
    process.env.MODEL ||
    "google/gemini-3-flash-preview";
  const prompt = buildTailoringPrompt(profile, jobDescription, writingStyle);

  const llm = new LlmService();
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

  const { summary, headline, skills, experienceEdits, layoutDirectives, sectionRationale, omissionRationale } = result.data;

  // Basic validation
  if (!summary || !headline || !Array.isArray(skills)) {
    logger.warn("AI response missing required tailoring fields", result.data);
  }

  return {
    success: true,
    data: {
      summary: sanitizeText(summary || ""),
      headline: sanitizeText(headline || ""),
      skills: skills || [],
      experienceEdits: sanitizeExperienceEdits(experienceEdits || []),
      layoutDirectives: sanitizeLayoutDirectives(layoutDirectives || {}),
      sectionRationale: sanitizeText(sectionRationale || ""),
      omissionRationale: sanitizeText(omissionRationale || ""),
    },
  };
}

/**
 * Backwards compatibility wrapper if needed, or alias.
 */
export async function generateSummary(
  jobDescription: string,
  profile: ResumeProfile,
): Promise<{ success: boolean; summary?: string; error?: string }> {
  // If we just need summary, we can discard the rest (or cache it? but here we just return summary)
  const result = await generateTailoring(jobDescription, profile);
  return {
    success: result.success,
    summary: result.data?.summary,
    error: result.error,
  };
}

function buildTailoringPrompt(
  profile: ResumeProfile,
  jd: string,
  writingStyle: Awaited<ReturnType<typeof getWritingStyle>>,
): string {
  const resolvedLanguage = resolveWritingOutputLanguage({
    style: writingStyle,
    profile,
  });
  const outputLanguage = getWritingLanguageLabel(resolvedLanguage.language);
  const effectiveConstraints = stripLanguageDirectivesFromConstraints(
    writingStyle.constraints,
  );

  // Extract only needed parts of profile to save tokens
  const relevantProfile = {
    basics: {
      name: profile.basics?.name,
      label: profile.basics?.label, // Original headline
      summary: profile.basics?.summary,
    },
    skills: profile.sections?.skills,
    projects: profile.sections?.projects?.items?.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      keywords: p.keywords,
    })),
    experience: profile.sections?.experience?.items?.map((e) => {
      const raw = e as unknown as Record<string, unknown>;
      return {
        id: e.id,
        company: e.company,
        position: e.position,
        summary: e.summary,
        description:
          typeof raw.description === "string" ? raw.description : undefined,
        bullets: extractExperienceBullets(raw),
      };
    }),
  };

  return `
You are an expert resume writer tailoring a full resume for a specific job application.
You must return a JSON object with seven fields: "headline", "summary", "skills", "experienceEdits", "layoutDirectives", "sectionRationale", and "omissionRationale".

JOB DESCRIPTION (JD):
${jd}

MY PROFILE:
${JSON.stringify(relevantProfile, null, 2)}

INSTRUCTIONS:

1. "headline" (String):
   - CRITICAL: This is the #1 ATS factor.
   - It must match the Job Title from the JD exactly (e.g., if JD says "Senior React Dev", use "Senior React Dev").
   - Do NOT translate, localize, or paraphrase the headline, even if the rest of the output is in ${outputLanguage}.

2. "summary" (String):
   - The Hook. Mirror the role's actual needs and foreground the strongest relevant evidence from the profile.
   - Keep it concise, direct, business-oriented, and specific.
   - Prefer 2-4 sentences and keep it under 90 words unless the writing-style constraints require otherwise.
   - Do NOT invent experience.
   - Use the profile to add context.
   - Avoid generic filler such as "passionate", "dynamic", "results-driven", "team player", or vague claims with no evidence.
   - Write the summary in ${outputLanguage}.

3. "experienceEdits" (Array of Objects):
   - You may rewrite experience bullets to better match the JD, but you must stay strictly truthful to the original evidence.
   - Only edit experience entries that clearly benefit from tailoring.
   - Use the provided experience item ids exactly.
   - Each edit must be shaped as: { "id": "...", "bullets": ["...", "..."] }.
   - Only rewrite 1-3 experience entries unless broader changes are clearly justified by the JD.
   - For each edited entry, return 2-4 bullets unless the source evidence is too thin.
   - Bullets should be concise, evidence-led, achievement-oriented where supported, and written in ${outputLanguage}.
   - Do NOT invent responsibilities, tools, metrics, or business ownership that are not supported by the original profile.
   - If a JD term is relevant but not stated verbatim in the source profile, you may use adjacent wording only when the evidence clearly supports it.

4. "layoutDirectives" (Object):
   - Use this to control resume organization, emphasis, and omissions.
   - sectionOrder: ordered list of section ids in the preferred reading order, using ids such as summary, experience, education, projects, skills, languages, profiles.
   - hiddenSections: section ids to hide completely when they are weakly relevant.
   - hiddenProjectIds: project ids to hide. Use only ids that appear in the provided projects list.
   - hiddenExperienceIds: experience ids to hide.
   - Use omissions conservatively: only hide content that is clearly distracting or off-target for this JD.

5. "sectionRationale" (String):
   - Explain briefly why the chosen section order and emphasis fit this JD.
   - Mention the most relevant evidence the resume should foreground.
   - Keep it to 1-2 sentences in ${outputLanguage}.

6. "omissionRationale" (String):
   - Explain what was hidden or deemphasized, or state clearly that no omission was necessary.
   - Keep it to 1-2 sentences in ${outputLanguage}.

7. "skills" (Array of Objects):
   - Review my existing skills section structure.
   - Keyword Stuffing: Swap synonyms to match the JD exactly (e.g. "TDD" -> "Unit Testing", "ReactJS" -> "React").
   - Keep my original skill levels and categories, just rename/reorder keywords to prioritize JD terms.
   - Prefer JD-relevant keywords that are already supported by the profile; do not pad categories with speculative tools.
   - Return the full "items" array for the skills section, preserving the structure: { "name": "Frontend", "keywords": [...] }.
   - Write user-visible skill text in ${outputLanguage} when natural, but keep exact JD terms, acronyms, and technology names when that helps ATS matching.

TRUTH AND EVIDENCE RULES:
- Every output field must be grounded in the supplied profile.
- Do not add seniority, ownership, domain depth, certifications, tools, or metrics that are not supported by the profile.
- If the profile is only adjacent to part of the JD, make that adjacency clear instead of pretending full direct experience.

WRITING STYLE PREFERENCES:
- Tone: ${writingStyle.tone}
- Formality: ${writingStyle.formality}
 - Output language for summary and skills: ${outputLanguage}
${effectiveConstraints ? `- Additional constraints: ${effectiveConstraints}` : ""}
${writingStyle.doNotUse ? `- Avoid these words or phrases: ${writingStyle.doNotUse}` : ""}

ATS SAFETY:
- Keep "headline" in the exact original job-title wording from the JD.
- Do not translate the headline, even when summary and skills are written in ${outputLanguage}.

OUTPUT FORMAT (JSON):
{
  "headline": "...",
  "summary": "...",
  "experienceEdits": [
    { "id": "experience-id", "bullets": ["bullet 1", "bullet 2"] }
  ],
  "layoutDirectives": {
    "sectionOrder": ["summary", "experience", "projects", "education", "skills"],
    "hiddenSections": [],
    "hiddenProjectIds": [],
    "hiddenExperienceIds": []
  },
  "sectionRationale": "Why this section order works",
  "omissionRationale": "What was hidden and why",
  "skills": [ ... ]
}
`;
}

function sanitizeText(text: string): string {
  return text
    .replace(/\*\*[\s\S]*?\*\*/g, "") // remove markdown bold
    .replace(/\s+/g, " ")
    .trim();
}


function stripHtmlToText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractExperienceBullets(item: Record<string, unknown>): string[] {
  const candidates = [item.summary, item.description].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  for (const candidate of candidates) {
    const matches = [...candidate.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
      .map((match) => stripHtmlToText(match[1]))
      .filter(Boolean);
    if (matches.length > 0) return matches;
  }
  const text = stripHtmlToText(candidates[0] ?? "");
  return text ? [text] : [];
}

function sanitizeExperienceEdits(
  edits: TailoredExperienceEdit[],
): TailoredExperienceEdit[] {
  const out: TailoredExperienceEdit[] = [];
  const seen = new Set<string>();
  for (const edit of edits) {
    const id = edit?.id?.trim();
    if (!id || seen.has(id)) continue;
    const bullets = Array.isArray(edit.bullets)
      ? edit.bullets
          .map((bullet) => sanitizeText(String(bullet || "")))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    if (bullets.length === 0) continue;
    seen.add(id);
    out.push({ id, bullets });
  }
  return out;
}


function sanitizeStringArray(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const item = raw.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function sanitizeLayoutDirectives(
  directives: TailoredLayoutDirectives,
): TailoredLayoutDirectives {
  return {
    sectionOrder: sanitizeStringArray(directives.sectionOrder, 20),
    hiddenSections: sanitizeStringArray(directives.hiddenSections, 20),
    hiddenProjectIds: sanitizeStringArray(directives.hiddenProjectIds, 50),
    hiddenExperienceIds: sanitizeStringArray(directives.hiddenExperienceIds, 50),
  };
}
