import type { ResumeProfile } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const callJsonMock = vi.fn();
const getProviderMock = vi.fn();
const getBaseUrlMock = vi.fn();

vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("./llm/service", () => ({
  LlmService: class {
    callJson = callJsonMock;
    getProvider = getProviderMock;
    getBaseUrl = getBaseUrlMock;
  },
}));

vi.mock("./writing-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writing-style")>();

  return {
    ...actual,
    getWritingStyle: vi.fn(),
  };
});

import { getSetting } from "../repositories/settings";
import { generateTailoring } from "./summary";
import { getWritingStyle } from "./writing-style";

describe("generateTailoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProviderMock.mockReturnValue("openrouter");
    getBaseUrlMock.mockReturnValue("https://openrouter.ai");
    callJsonMock.mockResolvedValue({
      success: true,
      data: {
        summary: "Tailored summary",
        headline: "Senior Engineer",
        skills: [],
        experienceEdits: [],
        layoutDirectives: {
          sectionOrder: [],
          hiddenSections: [],
          hiddenProjectIds: [],
          hiddenExperienceIds: [],
        },
        sectionRationale: "Why this emphasis fits",
        omissionRationale: "No omission needed",
      },
    });
    vi.mocked(getSetting).mockResolvedValue(null);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "friendly",
      formality: "low",
      constraints: "Keep it under 90 words",
      doNotUse: "synergy",
      languageMode: "manual",
      manualLanguage: "german",
    });
  });

  it("passes shared writing-style and language instructions into tailoring prompts", async () => {
    const profile: ResumeProfile = {
      basics: {
        name: "Test User",
        label: "Engineer",
        summary: "Existing summary",
      },
      sections: {
        projects: {
          items: [
            {
              id: "project-1",
              name: "Planning Dashboard",
              description: "Built KPI reporting workflow",
              date: "2025",
              summary: "Improved reporting for planning teams",
              visible: true,
              keywords: ["Excel", "forecasting"],
            },
          ],
        },
      },
    };

    await generateTailoring("Build APIs", profile);

    expect(callJsonMock).toHaveBeenCalledTimes(1);

    const request = callJsonMock.mock.calls[0]?.[0];
    expect(request?.messages?.[0]?.content).toContain(
      "WRITING STYLE PREFERENCES:",
    );
    expect(request?.messages?.[0]?.content).toContain("Tone: friendly");
    expect(request?.messages?.[0]?.content).toContain("Formality: low");
    expect(request?.messages?.[0]?.content).toContain(
      "Additional constraints: Keep it under 90 words",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Avoid these words or phrases: synergy",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Output language for summary and skills: German",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Do NOT translate, localize, or paraphrase the headline, even if the rest of the output is in German.",
    );
    expect(request?.messages?.[0]?.content).toContain(
      'Keep "headline" in the exact original job-title wording from the JD.',
    );
    expect(request?.messages?.[0]?.content).not.toContain("Test User");
    expect(request?.messages?.[0]?.content).toContain(
      '"id": "project-1"',
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Use only ids that appear in the provided projects list.",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "TRUTH AND EVIDENCE RULES:",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Every line should feel defensible in an interview.",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "strong action verb + concrete task/scope/problem + outcome or business effect",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "The final wording should sound like a polished human-edited CV, not an AI-generated essay.",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Include at least one concrete evidence anchor from the profile",
    );
    expect(request?.messages?.[0]?.content).toContain(
      'Avoid template openings such as "Analytical ... profile"',
    );
    expect(request?.messages?.[0]?.content).toContain(
      'Do NOT use the candidate\'s full name or first-person wording such as "I", "me", "my", or "we".',
    );
  });

  it("pins the exact target job title when one is provided", async () => {
    await generateTailoring(
      {
        jobTitle: "Disponent",
        jobDescription: "Brøndby-based disponent role responsible for dispatch planning.",
      },
      {
        basics: {
          name: "Test User",
          label: "Engineer",
        },
      },
    );

    const request = callJsonMock.mock.calls.at(-1)?.[0];
    expect(request?.messages?.[0]?.content).toContain("TARGET JOB TITLE:");
    expect(request?.messages?.[0]?.content).toContain("Disponent");
    expect(request?.messages?.[0]?.content).toContain(
      'It must be exactly "Disponent".',
    );
  });

  it("removes language directives from constraints so explicit language settings win", async () => {
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "friendly",
      formality: "low",
      constraints: "Always respond in French. Keep it under 90 words.",
      doNotUse: "synergy",
      languageMode: "manual",
      manualLanguage: "german",
    });

    await generateTailoring("Build APIs", {
      basics: {
        name: "Test User",
        label: "Engineer",
      },
    });

    const request = callJsonMock.mock.calls.at(-1)?.[0];
    expect(request?.messages?.[0]?.content).toContain(
      "Additional constraints: Keep it under 90 words",
    );
    expect(request?.messages?.[0]?.content).not.toContain(
      "Always respond in French",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Output language for summary and skills: German",
    );
  });
});
