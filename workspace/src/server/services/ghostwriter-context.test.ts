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

vi.mock("./company-research", () => ({
  getCompanyResearchNoteForJob: vi.fn(),
}));

vi.mock("./candidate-knowledge", () => ({
  getCandidateKnowledgeBase: vi.fn(),
}));

vi.mock("./writing-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writing-style")>();

  return {
    ...actual,
    getWritingStyle: vi.fn(),
  };
});

import { getJobById } from "../repositories/jobs";
import { getCandidateKnowledgeBase } from "./candidate-knowledge";
import { getCompanyResearchNoteForJob } from "./company-research";
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
    vi.mocked(getCompanyResearchNoteForJob).mockResolvedValue(null);
    vi.mocked(getCandidateKnowledgeBase).mockResolvedValue({
      personalFacts: [],
      projects: [],
      companyResearchNotes: [],
      writingPreferences: [],
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
      "Before writing, silently classify the user request as one of: direct_chat, memory_update, cover_letter, application_email, resume_patch, or mixed.",
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
      "For cover letters, keep the draft targeted to the specific role and employer, usually within one page and 3-4 short paragraphs.",
    );
    expect(context.systemPrompt).toContain(
      "For cover letters, prefer this default structure unless the user asks otherwise: salutation line, a concrete opening tied to the work, 1-2 short evidence paragraphs, and a concise closing with sign-off.",
    );
    expect(context.systemPrompt).toContain(
      "For cover letters, include a natural salutation at the top and a natural sign-off at the end unless the user explicitly asks for a no-salutation note or email-style output.",
    );
    expect(context.systemPrompt).toContain(
      "For cover letters, keep salutations and sign-offs simple, restrained, and modern rather than ceremonial or overly warm.",
    );
    expect(context.systemPrompt).toContain(
      "For Denmark-local cover letters, prefer clean sign-offs such as 'Best regards' over more ceremonial closings like 'Yours faithfully' or overly warm closings like 'Warm regards'.",
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
    expect(context.companyResearchSnapshot).toBe("");
    expect(context.evidencePackSnapshot).toContain("Target role summary:");
    expect(context.evidencePackSnapshot).toContain("Target role family:");
    expect(context.evidencePackSnapshot).toContain("Top fit reasons:");
    expect(Array.isArray(context.evidencePack.voiceProfile)).toBe(true);
    expect(Array.isArray(context.evidencePack.experienceFrames)).toBe(true);
    expect(Array.isArray(context.evidencePack.evidenceStory)).toBe(true);
    expect(Array.isArray(context.evidencePack.experienceBank)).toBe(true);
    expect(Array.isArray(context.evidencePack.selectedNarrative)).toBe(true);
    expect(context.evidencePack.recommendedAngle).toBeTruthy();
  });

  it("includes shared writing preferences in the profile snapshot", async () => {
    const job = createJob({
      id: "job-ctx-writing-prefs",
      title: "Planning Analyst",
      employer: "Mover",
    });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Test User",
      },
    });
    vi.mocked(getCandidateKnowledgeBase).mockResolvedValue({
      personalFacts: [],
      projects: [],
      companyResearchNotes: [],
      writingPreferences: [
        {
          id: "pref-1",
          label: "Frame thesis as collaboration",
          instruction:
            "Describe the DTU thesis as work done in collaboration with Mover and real operational planning constraints.",
          kind: "positioning",
          strength: "strong",
        },
      ],
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.profileSnapshot).toContain("Shared writing preferences:");
    expect(context.profileSnapshot).toContain(
      "Frame thesis as collaboration [positioning/strong]",
    );
    expect(context.evidencePackSnapshot).toContain(
      "Preferred experience framing:",
    );
    expect(context.evidencePackSnapshot).toContain("Evidence story plan:");
    expect(context.evidencePackSnapshot).toContain(
      "Selected narrative modules:",
    );
    expect(Array.isArray(context.evidencePack.experienceBank)).toBe(true);
  });

  it("selects a role-aware lead module and support module from the experience bank", async () => {
    const job = createJob({
      id: "job-ctx-narrative",
      title: "Planning Analyst",
      employer: "LEGO",
      jobDescription:
        "Planning role with operational constraints, analytics support, forecasting-adjacent work, and coordination across execution teams.",
    });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Test User",
        headline: "Planning and optimisation candidate",
      },
      sections: {
        experience: {
          items: [
            {
              id: "exp-1",
              visible: true,
              company: "DaJiao",
              position: "Business Analysis Intern",
              location: "",
              date: "2022 - 2023",
              summary:
                "Automated reporting workflows using Python and Excel and translated operational data into decision-ready materials.",
            },
          ],
        },
      },
    });
    vi.mocked(getCandidateKnowledgeBase).mockResolvedValue({
      personalFacts: [],
      projects: [
        {
          id: "project-mover-dtu-thesis",
          name: "Mover x DTU Master's Thesis",
          summary:
            "Optimization research in collaboration with Mover on rolling-horizon last-mile planning under operational constraints.",
          keywords: ["planning", "routing", "optimization", "delivery"],
          role: "Master's Thesis / Optimization Research (in collaboration with Mover)",
          impact:
            "Strong evidence for planning and decision-support roles in real operational contexts.",
          cvBullets: [
            "Working on a multi-day rolling-horizon planning problem in last-mile delivery.",
          ],
        },
      ],
      companyResearchNotes: [],
      writingPreferences: [
        {
          id: "pref-1",
          label: "Frame thesis as collaboration",
          instruction:
            "Treat the DTU thesis as operations-linked collaboration work, not a standalone school project.",
          kind: "positioning",
          strength: "strong",
        },
      ],
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.evidencePack.targetRoleFamily).toBe(
      "planning-and-operations",
    );
    expect(context.evidencePack.experienceBank[0]?.label).toContain("Mover");
    expect(context.evidencePack.selectedNarrative[0]).toContain("Lead module");
    expect(context.evidencePack.selectedNarrative.join(" ")).toContain(
      "Support module",
    );
  });

  it("regresses to internship-led narrative for analytics-heavy roles", async () => {
    const job = createJob({
      id: "job-ctx-analytics-narrative",
      title: "Analytics Specialist",
      employer: "ACME",
      jobDescription:
        "Analytics role focused on reporting, Python, Excel, SQL, dashboards, and decision support for business stakeholders.",
    });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Test User",
      },
      sections: {
        experience: {
          items: [
            {
              id: "exp-1",
              visible: true,
              company: "DaJiao",
              position: "Business Analysis Intern",
              location: "",
              date: "2022 - 2023",
              summary:
                "Automated reporting workflows using Python and Excel and translated operational data into decision-ready materials.",
            },
          ],
        },
      },
    });
    vi.mocked(getCandidateKnowledgeBase).mockResolvedValue({
      personalFacts: [],
      projects: [
        {
          id: "project-mover-dtu-thesis",
          name: "Mover x DTU Master's Thesis",
          summary:
            "Optimization research in collaboration with Mover on rolling-horizon last-mile planning under operational constraints.",
          keywords: ["planning", "routing", "optimization", "delivery"],
          role: "Master's Thesis / Optimization Research (in collaboration with Mover)",
          impact:
            "Strong evidence for planning and decision-support roles in real operational contexts.",
          roleRelevance:
            "Best used as lead evidence for planning and optimisation roles.",
          cvBullets: [
            "Working on a multi-day rolling-horizon planning problem in last-mile delivery.",
          ],
        },
      ],
      companyResearchNotes: [],
      writingPreferences: [],
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.evidencePack.targetRoleFamily).toBe(
      "analytics-and-decision-support",
    );
    expect(context.evidencePack.experienceBank[0]?.label).toContain(
      "Business Analysis Intern",
    );
  });

  it("includes company research snapshot when available", async () => {
    const job = createJob({
      id: "job-ctx-research",
      title: "Strategy Analyst",
      employer: "Novo Nordisk",
    });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(getCompanyResearchNoteForJob).mockResolvedValue({
      company: "Novo Nordisk",
      source: "https://www.novonordisk.com",
      summary:
        "Novo Nordisk focuses on chronic disease care, large-scale manufacturing, and evidence-driven improvement across global operations.",
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.companyResearchSnapshot).toContain("Company: Novo Nordisk");
    expect(context.companyResearchSnapshot).toContain(
      "Source: https://www.novonordisk.com",
    );
    expect(context.companyResearchSnapshot).toContain(
      "Research summary: Novo Nordisk focuses on chronic disease care",
    );
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

  it("keeps prompt sections in a stable high-level order", async () => {
    const job = createJob({ id: "job-ctx-5" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});

    const context = await buildJobChatPromptContext(job.id);

    const operatingScopeIndex =
      context.systemPrompt.indexOf("Operating scope:");
    const taskRoutingIndex = context.systemPrompt.indexOf("Task routing:");
    const outputContractIndex =
      context.systemPrompt.indexOf("Output contract:");
    const qualityRubricIndex = context.systemPrompt.indexOf("Quality rubric:");
    const languageRulesIndex = context.systemPrompt.indexOf("Language rules:");
    const resumePatchRulesIndex = context.systemPrompt.indexOf(
      "Resume-patch rules:",
    );
    const coverLetterRulesIndex = context.systemPrompt.indexOf(
      "Cover-letter rules:",
    );
    const candidatePositioningIndex = context.systemPrompt.indexOf(
      "Candidate-specific positioning:",
    );
    const antiGenericIndex = context.systemPrompt.indexOf(
      "Anti-generic style rules:",
    );

    expect(operatingScopeIndex).toBeGreaterThan(-1);
    expect(taskRoutingIndex).toBeGreaterThan(operatingScopeIndex);
    expect(outputContractIndex).toBeGreaterThan(taskRoutingIndex);
    expect(qualityRubricIndex).toBeGreaterThan(outputContractIndex);
    expect(languageRulesIndex).toBeGreaterThan(qualityRubricIndex);
    expect(resumePatchRulesIndex).toBeGreaterThan(languageRulesIndex);
    expect(coverLetterRulesIndex).toBeGreaterThan(resumePatchRulesIndex);
    expect(candidatePositioningIndex).toBeGreaterThan(coverLetterRulesIndex);
    expect(antiGenericIndex).toBeGreaterThan(candidatePositioningIndex);
  });
});
