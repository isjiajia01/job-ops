import { describe, expect, it } from "vitest";
import { buildLocalWritingStrategy, buildStrategySnapshot } from "./ghostwriter-strategy";

describe("ghostwriter strategy", () => {
  it("builds a local fallback writing strategy from the evidence pack", () => {
    const strategy = buildLocalWritingStrategy({
      taskKind: "cover_letter",
      evidencePack: {
        recommendedAngle: "Operations + optimization bridge",
        selectedNarrative: ["Lead with fresh solver"],
        voiceProfile: ["direct"],
        topEvidence: ["Built practical optimization workflow"],
        evidenceStory: ["Turned results into decision-useful outputs"],
        biggestGaps: ["No long corporate tenure"],
        toneRecommendation: "Direct and grounded",
        targetRoleFamily: "analytics-and-decision-support",
      } as never,
    });

    expect(strategy.angle).toContain("optimization");
    expect(strategy.paragraphPlan.length).toBeGreaterThan(0);
    expect(strategy.tonePlan).toContain("Role family");
  });

  it("renders a readable strategy snapshot", () => {
    const snapshot = buildStrategySnapshot({
      angle: "Lead with operational proof point",
      strongestEvidence: ["fresh solver"],
      weakPoints: ["Avoid generic fit phrasing"],
      paragraphPlan: ["Open", "Evidence", "Close"],
      tonePlan: "Direct",
      requiresClarification: false,
      clarifyingQuestions: [],
    });

    expect(snapshot).toContain("Angle:");
    expect(snapshot).toContain("Paragraph plan");
  });
});
