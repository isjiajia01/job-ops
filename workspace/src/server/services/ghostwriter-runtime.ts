import type { Job } from "@shared/types";
import type {
  GhostwriterExperienceModule,
  GhostwriterEvidencePack,
  JobChatPromptContext,
} from "./ghostwriter-context";

type GhostwriterTaskKind =
  | "direct_chat"
  | "memory_update"
  | "cover_letter"
  | "application_email"
  | "resume_patch"
  | "mixed";

export type GhostwriterRuntimeToolName =
  | "job_brief"
  | "profile_positioning"
  | "proof_point_bank"
  | "company_research"
  | "gap_watchouts"
  | "output_contract";

export type GhostwriterRuntimeToolResult = {
  name: GhostwriterRuntimeToolName;
  purpose: string;
  output: string;
};

export type GhostwriterRuntimePlan = {
  deliverable: string;
  executionNotes: string[];
  responseMode: "draft" | "brief" | "mixed" | "memory_update";
  role: string;
  selectedTools: GhostwriterRuntimeToolName[];
  taskKind: GhostwriterTaskKind;
};

export type GhostwriterRuntimeState = {
  plan: GhostwriterRuntimePlan;
  systemMessages: Array<{ role: "system"; content: string }>;
  toolResults: GhostwriterRuntimeToolResult[];
  executionTrace: Array<{ stage: string; summary: string }>;
};

function compactJoin(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n");
}

function truncate(value: string | null | undefined, max: number): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function describeDeliverable(taskKind: GhostwriterTaskKind, prompt: string): string {
  if (taskKind === "cover_letter") return "Produce a ready-to-send cover letter draft plus a short operator note.";
  if (taskKind === "application_email") return "Produce a concise application email draft plus a short operator note.";
  if (taskKind === "resume_patch") return "Produce a high-signal CV patch for this exact job, not a generic rewrite.";
  if (taskKind === "mixed") return "Produce aligned drafting outputs across cover-letter/email and CV patch surfaces.";
  if (/fit|score|worth applying|worth it|should i apply|am i a fit/i.test(prompt)) {
    return "Produce a tight fit brief with strongest reasons, evidence, and watchouts.";
  }
  return "Produce the most useful direct writing help for the request while staying evidence-backed.";
}

function chooseTools(taskKind: GhostwriterTaskKind, prompt: string): GhostwriterRuntimeToolName[] {
  const tools: GhostwriterRuntimeToolName[] = ["job_brief", "profile_positioning", "proof_point_bank"];
  if (taskKind === "cover_letter" || taskKind === "application_email" || taskKind === "mixed") {
    tools.push("company_research");
  }
  if (taskKind === "resume_patch" || taskKind === "mixed" || /fit|gap|risk|watchout/i.test(prompt)) {
    tools.push("gap_watchouts");
  }
  tools.push("output_contract");
  return Array.from(new Set(tools));
}

function summarizeModules(modules: GhostwriterExperienceModule[]): string {
  if (!modules.length) return "No high-signal proof-point modules selected.";
  return modules
    .slice(0, 4)
    .map((module, index) => {
      const strongestClaim = module.strongestClaims[0] ?? module.preferredFraming;
      return `${index + 1}. ${module.label} — ${strongestClaim}`;
    })
    .join("\n");
}

function buildJobBrief(job: Job, evidencePack: GhostwriterEvidencePack): string {
  return compactJoin([
    `Role: ${job.title} at ${job.employer}`,
    job.location ? `Location: ${job.location}` : null,
    evidencePack.targetRoleSummary
      ? `Target role summary: ${evidencePack.targetRoleSummary}`
      : null,
    evidencePack.targetRoleFamily
      ? `Role family: ${evidencePack.targetRoleFamily}`
      : null,
    evidencePack.recommendedAngle
      ? `Recommended angle: ${evidencePack.recommendedAngle}`
      : null,
    truncate(job.jobDescription, 900)
      ? `JD excerpt: ${truncate(job.jobDescription, 900)}`
      : null,
  ]);
}

function buildProfilePositioning(context: JobChatPromptContext): string {
  const facts = (context.knowledgeBase.personalFacts ?? [])
    .slice(0, 6)
    .map((fact) => `- ${fact.title}: ${truncate(fact.detail, 220)}`)
    .join("\n");
  const preferences = (context.knowledgeBase.writingPreferences ?? [])
    .slice(0, 4)
    .map((pref) => `- ${pref.label} (${pref.kind}/${pref.strength}): ${truncate(pref.instruction, 160)}`)
    .join("\n");

  return compactJoin([
    context.profile.basics?.headline
      ? `Headline: ${context.profile.basics.headline}`
      : null,
    context.profile.basics?.summary
      ? `Summary: ${truncate(context.profile.basics.summary, 320)}`
      : null,
    context.evidencePack.voiceProfile.length
      ? `Voice profile:\n- ${context.evidencePack.voiceProfile.join("\n- ")}`
      : null,
    facts ? `High-signal facts:\n${facts}` : null,
    preferences ? `Writing preferences:\n${preferences}` : null,
  ]);
}

function buildCompanyResearch(context: JobChatPromptContext): string {
  if (!context.companyResearchSnapshot?.trim()) {
    return "No company research snapshot available for this job.";
  }
  return truncate(context.companyResearchSnapshot, 1000);
}

function buildGapWatchouts(evidencePack: GhostwriterEvidencePack): string {
  return compactJoin([
    evidencePack.biggestGaps.length
      ? `Biggest gaps:\n- ${evidencePack.biggestGaps.join("\n- ")}`
      : null,
    evidencePack.forbiddenClaims.length
      ? `Forbidden claims:\n- ${evidencePack.forbiddenClaims.join("\n- ")}`
      : null,
    evidencePack.toneRecommendation
      ? `Tone recommendation: ${evidencePack.toneRecommendation}`
      : null,
  ]);
}

function buildOutputContract(taskKind: GhostwriterTaskKind): string {
  const base = [
    "Always stay inside the structured Ghostwriter response contract.",
    "Prefer ready-to-send wording over meta explanation.",
    "Every important claim must be traceable to supplied evidence.",
  ];

  if (taskKind === "cover_letter" || taskKind === "application_email") {
    base.push("Make the main artifact the drafted document body, not process commentary.");
  }
  if (taskKind === "resume_patch" || taskKind === "mixed") {
    base.push("Make resumePatch concrete and narrowly tailored to this job.");
  }
  return base.join("\n");
}

export function buildGhostwriterRuntimeState(args: {
  context: JobChatPromptContext;
  prompt: string;
  taskKind: GhostwriterTaskKind;
}): GhostwriterRuntimeState {
  const { context, prompt, taskKind } = args;
  const selectedTools = chooseTools(taskKind, prompt);

  const toolResults: GhostwriterRuntimeToolResult[] = selectedTools.map((name) => {
    if (name === "job_brief") {
      return {
        name,
        purpose: "Explain the exact role target and recommended angle.",
        output: buildJobBrief(context.job, context.evidencePack),
      };
    }
    if (name === "profile_positioning") {
      return {
        name,
        purpose: "Summarize how this candidate should be framed for the role.",
        output: buildProfilePositioning(context),
      };
    }
    if (name === "proof_point_bank") {
      return {
        name,
        purpose: "Surface the highest-signal proof points and narrative modules.",
        output: compactJoin([
          context.evidencePack.topFitReasons.length
            ? `Top fit reasons:\n- ${context.evidencePack.topFitReasons.join("\n- ")}`
            : null,
          context.evidencePack.topEvidence.length
            ? `Top evidence:\n- ${context.evidencePack.topEvidence.join("\n- ")}`
            : null,
          `Selected modules:\n${summarizeModules(context.evidencePack.experienceBank)}`,
        ]),
      };
    }
    if (name === "company_research") {
      return {
        name,
        purpose: "Provide concrete employer context when available.",
        output: buildCompanyResearch(context),
      };
    }
    if (name === "gap_watchouts") {
      return {
        name,
        purpose: "Keep the assistant honest about weak points and forbidden claims.",
        output: buildGapWatchouts(context.evidencePack),
      };
    }
    return {
      name,
      purpose: "Remind the assistant how to package output for the UI.",
      output: buildOutputContract(taskKind),
    };
  });

  const plan: GhostwriterRuntimePlan = {
    role: "Application Writing Strategist",
    taskKind,
    selectedTools,
    deliverable: describeDeliverable(taskKind, prompt),
    responseMode:
      taskKind === "memory_update"
        ? "memory_update"
        : taskKind === "direct_chat"
          ? "brief"
          : taskKind === "mixed"
            ? "mixed"
            : "draft",
    executionNotes: [
      "Lead with the recommended role angle rather than generic motivation.",
      "Use the strongest proof points first and leave weak evidence out.",
      "Treat the candidate as early-career but high-signal: analytical, practical, modest, and evidence-led.",
      "Do not invent ownership, metrics, stakeholder scope, or tools beyond supplied context.",
    ],
  };

  const systemMessages = [
    {
      role: "system" as const,
      content: compactJoin([
        "Ghostwriter Runtime Role:",
        `${plan.role} for this single job application.`,
        `Task kind: ${plan.taskKind}`,
        `Deliverable: ${plan.deliverable}`,
        `Response mode: ${plan.responseMode}`,
        "Execution notes:",
        ...plan.executionNotes.map((note) => `- ${note}`),
      ]),
    },
    {
      role: "system" as const,
      content: compactJoin([
        "Ghostwriter Runtime Tool Trace:",
        ...toolResults.map(
          (tool) =>
            `[${tool.name}] ${tool.purpose}\n${tool.output || "No output."}`,
        ),
      ]),
    },
  ];

  const executionTrace = [
    {
      stage: "plan",
      summary: `${plan.role} classified the task as ${plan.taskKind} and set the deliverable to ${plan.deliverable}`,
    },
    {
      stage: "select-tools",
      summary: `Selected ${plan.selectedTools.length} internal context tools: ${plan.selectedTools.join(", ")}`,
    },
    {
      stage: "synthesize-evidence",
      summary: "Condensed the strongest job context, profile positioning, proof points, and watchouts into a writing brief.",
    },
    {
      stage: plan.responseMode === "brief" ? "respond" : "draft-and-rank",
      summary:
        plan.responseMode === "brief"
          ? "Prepared a direct answer mode for concise advisory or wording help."
          : "Prepared draft-generation mode so the final response stays aligned with the runtime brief.",
    },
  ];

  return {
    plan,
    systemMessages,
    toolResults,
    executionTrace,
  };
}
