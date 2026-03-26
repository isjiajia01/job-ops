import type { AppError } from "@infra/errors";
import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildJobChatPromptContext } from "./ghostwriter-context";

vi.mock("../repositories/jobs", () => ({
  getJobById: vi.fn(),
}));

vi.mock("./profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("./writing-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writing-style")>();

  return {
    ...actual,
    getWritingStyle: vi.fn(),
  };
});

import { getJobById } from "../repositories/jobs";
import { getProfile } from "./profile";
import { getWritingStyle } from "./writing-style";

describe("buildJobChatPromptContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
      languageMode: "manual",
      manualLanguage: "english",
    });
  });

  it("builds context with style directives and snapshots", async () => {
    const job = createJob({
      id: "job-ctx-1",
      title: "Software Engineer",
      employer: "JP Morgan",
      jobDescription: "A".repeat(5000),
    });

    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "direct",
      formality: "high",
      constraints: "Keep responses under 120 words",
      doNotUse: "synergy, leverage",
      languageMode: "manual",
      manualLanguage: "german",
    });
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Test User",
        headline: "Full-stack engineer",
        summary: "I build production systems",
      },
      sections: {
        skills: {
          name: "Skills",
          visible: true,
          id: "skills-1",
          items: [
            {
              id: "skill-1",
              visible: true,
              name: "TypeScript",
              description: "",
              level: 4,
              keywords: ["Node.js", "React"],
            },
          ],
        },
      },
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.style).toEqual({
      tone: "direct",
      formality: "high",
      constraints: "Keep responses under 120 words",
      doNotUse: "synergy, leverage",
      languageMode: "manual",
      manualLanguage: "german",
    });
    expect(context.systemPrompt).toContain("Writing style tone: direct.");
    expect(context.systemPrompt).toContain("Writing style formality: high.");
    expect(context.systemPrompt).toContain(
      "Follow the user's requested output language exactly when they specify one.",
    );
    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in German.",
    );
    expect(context.systemPrompt).toContain(
      'Always return valid JSON with this exact shape: {"response":"...","coverLetterDraft":null,"coverLetterKind":null,"resumePatch":null}.',
    );
    expect(context.systemPrompt).toContain("Task routing:");
    expect(context.systemPrompt).toContain(
      "Before writing, silently classify the user request as one of: direct_chat, cover_letter, application_email, resume_patch, or mixed.",
    );
    expect(context.systemPrompt).toContain(
      'Put all user-visible chat text inside "response". Keep it concise, direct, and useful.',
    );
    expect(context.systemPrompt).toContain("Quality rubric:");
    expect(context.systemPrompt).toContain(
      "Optimize every answer for five things: relevance to the specific job, concrete evidence from the supplied profile, disciplined claims, natural professional tone, and low fluff.",
    );
    expect(context.systemPrompt).toContain(
      "Use soft personal notes only to tune tone and emphasis, not as hard factual evidence.",
    );
    expect(context.systemPrompt).toContain("Preflight self-check:");
    expect(context.systemPrompt).toContain(
      "1. Overclaiming check: did you add any tool, ownership, scope, metric, seniority, or certainty that is not supported by the supplied job or profile context?",
    );
    expect(context.systemPrompt).toContain(
      "2. Specificity check: does each important claim have concrete support, or is it still generic?",
    );
    expect(context.systemPrompt).toContain(
      "3. Task-fit check: does the output match the user's actual request type, or did you drift into cover letter, CV rewrite, or strategy advice they did not ask for?",
    );
    expect(context.systemPrompt).toContain(
      "When suggesting a headline or job title, preserve the original wording instead of translating it.",
    );
    expect(context.systemPrompt).toContain("Resume-patch rules:");
    expect(context.systemPrompt).toContain(
      "For resume patches, prefer recruiter-facing, evidence-backed wording over biography or motivation language.",
    );
    expect(context.systemPrompt).toContain(
      "When writing a cover letter, use natural first-person cover-letter voice.",
    );
    expect(context.systemPrompt).toContain(
      "For cover letters, keep the draft targeted to the specific role and employer, usually within one page and 3-5 short paragraphs.",
    );
    expect(context.systemPrompt).toContain(
      "For cover letters, explain why this role and employer are a fit and support that case with 2-3 concrete examples from the provided profile.",
    );
    expect(context.systemPrompt).toContain(
      "For cover letters, each body paragraph should make one clear fit claim and support it with evidence from the provided profile.",
    );
    expect(context.systemPrompt).toContain(
      "For this candidate, default to an early-career, analytical, practical, and modest voice rather than a senior or highly promotional tone.",
    );
    expect(context.systemPrompt).toContain(
      'Avoid formulaic openings such as "I am writing to express my interest" unless the user explicitly asks for a more traditional letter style.',
    );
    expect(context.systemPrompt).toContain(
      'Avoid stock motivation phrases such as "I am looking for a role where..."',
    );
    expect(context.systemPrompt).toContain(
      "Prefer openings that start from the work, planning problem, business need, or operating context rather than from generic motivation language.",
    );
    expect(context.systemPrompt).toContain(
      "Writing constraints: Keep responses under 120 words",
    );
    expect(context.systemPrompt).toContain(
      "Avoid these terms: synergy, leverage",
    );
    expect(context.jobSnapshot).toContain('"id": "job-ctx-1"');
    expect(context.jobSnapshot.length).toBeLessThan(6000);
    expect(context.profileSnapshot).toContain("Name: Test User");
    expect(context.profileSnapshot).toContain("Skills:");
  });

  it("falls back to empty profile snapshot when profile loading fails", async () => {
    const job = createJob({ id: "job-ctx-2" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockRejectedValue(new Error("profile unavailable"));

    const context = await buildJobChatPromptContext(job.id);

    expect(context.job.id).toBe("job-ctx-2");
    expect(context.profileSnapshot).toContain("Name: Unknown");
    expect(context.systemPrompt).toContain("Writing style tone: professional.");
  });

  it("matches Ghostwriter language to detected resume language when configured", async () => {
    const job = createJob({ id: "job-ctx-3" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
      languageMode: "match-resume",
      manualLanguage: "english",
    });
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Claire",
        summary:
          "Je conçois des plateformes de données et je travaille avec des équipes produit et ingénierie.",
      },
      sections: {
        summary: {
          content:
            "Expérience en développement, livraison et accompagnement des équipes.",
        },
      },
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in French.",
    );
  });

  it("removes language instructions from global writing constraints", async () => {
    const job = createJob({ id: "job-ctx-4" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "Always respond in French. Keep responses under 120 words.",
      doNotUse: "",
      languageMode: "manual",
      manualLanguage: "english",
    });
    vi.mocked(getProfile).mockResolvedValue({});

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in English.",
    );
    expect(context.systemPrompt).toContain(
      "Writing constraints: Keep responses under 120 words",
    );
    expect(context.systemPrompt).not.toContain("Always respond in French");
  });

  it("throws not found for unknown job", async () => {
    vi.mocked(getJobById).mockResolvedValue(null);

    await expect(
      buildJobChatPromptContext("missing-job"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    } satisfies Partial<AppError>);
  });
});
