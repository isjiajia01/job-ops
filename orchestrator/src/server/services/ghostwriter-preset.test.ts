import { describe, expect, it } from "vitest";
import { resolveGhostwriterPromptPresets } from "./ghostwriter-preset";

describe("resolveGhostwriterPromptPresets", () => {
  it("returns planning-track and denmark-local for a matching profile", () => {
    const presets = resolveGhostwriterPromptPresets({
      basics: {
        name: "Candidate Name",
        headline: "Planning Analytics Candidate in Denmark",
        summary:
          "DTU candidate focused on planning, forecasting-adjacent analysis, and operations research in Copenhagen.",
      },
    });

    expect(presets.map((preset) => preset.id)).toEqual([
      "general-track",
      "planning-track",
      "denmark-local",
    ]);
  });

  it("returns only general-track for a neutral profile", () => {
    const presets = resolveGhostwriterPromptPresets({
      basics: {
        name: "Alex",
        headline: "Software Engineer",
        summary: "Builds web applications and internal tools.",
      },
    });

    expect(presets.map((preset) => preset.id)).toEqual(["general-track"]);
  });
});
