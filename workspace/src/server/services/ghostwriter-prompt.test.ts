import { describe, expect, it } from "vitest";
import { buildGhostwriterSystemPrompt } from "./ghostwriter-prompt";

describe("buildGhostwriterSystemPrompt", () => {
  it("builds the prompt in a stable section order", () => {
    const prompt = buildGhostwriterSystemPrompt(
      {
        tone: "professional",
        formality: "medium",
        constraints: "Keep responses under 120 words",
        doNotUse: "synergy, leverage",
        languageMode: "manual",
        manualLanguage: "english",
      },
      {
        basics: {
          name: "Candidate Name",
          headline: "Planning Analytics Candidate",
          summary: "Planning-oriented analytical profile.",
        },
      },
    );

    const operatingScopeIndex = prompt.indexOf("Operating scope:");
    const taskRoutingIndex = prompt.indexOf("Task routing:");
    const outputContractIndex = prompt.indexOf("Output contract:");
    const qualityRubricIndex = prompt.indexOf("Quality rubric:");
    const languageRulesIndex = prompt.indexOf("Language rules:");
    const resumePatchRulesIndex = prompt.indexOf("Resume-patch rules:");
    const coverLetterRulesIndex = prompt.indexOf("Cover-letter rules:");
    const candidatePositioningIndex = prompt.indexOf(
      "Candidate-specific positioning:",
    );
    const antiGenericIndex = prompt.indexOf("Anti-generic style rules:");

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

  it("preserves key protocol and style instructions", () => {
    const prompt = buildGhostwriterSystemPrompt(
      {
        tone: "direct",
        formality: "high",
        constraints: "Keep responses under 120 words",
        doNotUse: "synergy, leverage",
        languageMode: "manual",
        manualLanguage: "german",
      },
      {
        basics: {
          name: "Test User",
          headline: "Full-stack engineer",
          summary: "I build production systems",
        },
      },
    );

    expect(prompt).toContain(
      'Always return valid JSON with this exact shape: {"response":"...","coverLetterDraft":null,"coverLetterKind":null,"resumePatch":null}.',
    );
    expect(prompt).toContain("Task routing:");
    expect(prompt).toContain("Quality rubric:");
    expect(prompt).toContain("Preflight self-check:");
    expect(prompt).toContain("Resume-patch rules:");
    expect(prompt).toContain("Cover-letter rules:");
    expect(prompt).toContain("Company-research rules:");
    expect(prompt).toContain("Evidence-pack rules:");
    expect(prompt).toContain(
      "Writing constraints: Keep responses under 120 words",
    );
    expect(prompt).toContain("Avoid these terms: synergy, leverage");
  });

  it("adds planning-track and denmark-local presets when the profile matches them", () => {
    const prompt = buildGhostwriterSystemPrompt(
      {
        tone: "professional",
        formality: "medium",
        constraints: "",
        doNotUse: "",
        languageMode: "manual",
        manualLanguage: "english",
      },
      {
        basics: {
          name: "Candidate Name",
          headline: "Planning Analytics Candidate in Denmark",
          summary:
            "DTU candidate focused on planning, forecasting-adjacent analysis, and operations research in Copenhagen.",
        },
      },
    );

    expect(prompt).toContain("Preset layer:");
    expect(prompt).toContain("Preset: general-track");
    expect(prompt).toContain("Preset: planning-track");
    expect(prompt).toContain("Preset: denmark-local");
  });

  it("keeps only the general preset for a neutral profile", () => {
    const prompt = buildGhostwriterSystemPrompt(
      {
        tone: "professional",
        formality: "medium",
        constraints: "",
        doNotUse: "",
        languageMode: "manual",
        manualLanguage: "english",
      },
      {
        basics: {
          name: "Alex",
          headline: "Software Engineer",
          summary: "Builds web applications and internal tools.",
        },
      },
    );

    expect(prompt).toContain("Preset: general-track");
    expect(prompt).not.toContain("Preset: planning-track");
    expect(prompt).not.toContain("Preset: denmark-local");
  });

  it("teaches the model how to use company research naturally", () => {
    const prompt = buildGhostwriterSystemPrompt(
      {
        tone: "professional",
        formality: "medium",
        constraints: "",
        doNotUse: "",
        languageMode: "manual",
        manualLanguage: "english",
      },
      {
        basics: {
          name: "Alex",
          headline: "Strategy Analyst",
          summary: "Operations and analytics profile.",
        },
      },
    );

    expect(prompt).toContain(
      "When reliable company research context is provided, weave 1-2 concrete observations about the employer's business, product, or operating priorities into the fit case naturally.",
    );
    expect(prompt).toContain(
      "For resume patches, use company understanding only to improve the tailored summary or headline when it helps position the candidate for this employer's real work.",
    );
  });
});
