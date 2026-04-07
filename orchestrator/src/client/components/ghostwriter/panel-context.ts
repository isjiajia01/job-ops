import { parseDocumentStrategy } from "@/client/lib/document-strategy";
import { parseSelectedProofPointIds } from "@/client/lib/project-proof-points";
import type { CandidateKnowledgeProject, Job } from "@shared/types";

export function getSelectedProofPoints(
  job: Job,
  projects: CandidateKnowledgeProject[],
): CandidateKnowledgeProject[] {
  const selectedIds = new Set(
    parseSelectedProofPointIds(job.selectedProofPointProjectIds),
  );
  return projects.filter((project) => selectedIds.has(project.id));
}

export function buildGhostwriterSeedPrompt(args: {
  job: Job;
  projects: CandidateKnowledgeProject[];
}): string | null {
  const documentStrategy = parseDocumentStrategy(args.job);
  const selectedProofPoints = getSelectedProofPoints(args.job, args.projects);
  if (!documentStrategy && selectedProofPoints.length === 0) return null;

  const strategyBlock = documentStrategy
    ? (() => {
        const strongestEvidence = documentStrategy.strongestEvidence
          .map((item) => `- ${item}`)
          .join("\n");
        const priorityTerms = documentStrategy.priorityTerms.join(", ");
        return `Use the current saved job strategy for this role. Keep the output aligned to it.\n\nRole angle: ${documentStrategy.roleAngle}\nCover letter angle: ${documentStrategy.coverLetterAngle}\nStrongest evidence:\n${strongestEvidence}\nPriority JD terms: ${priorityTerms}`;
      })()
    : null;

  const proofPointBlock =
    selectedProofPoints.length > 0
      ? `Use these currently selected proof points for this job as the primary evidence base:\n${selectedProofPoints
          .map(
            (project) =>
              `- ${project.name}: ${project.summary}${project.impact ? ` | Impact: ${project.impact}` : ""}`,
          )
          .join("\n")}`
      : null;

  return [strategyBlock, proofPointBlock].filter(Boolean).join("\n\n");
}
