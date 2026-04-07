import type { CandidateKnowledgeProject, Job } from "@shared/types";

export type ProjectProofPointRecommendation = {
  project: CandidateKnowledgeProject;
  score: number;
  reasons: string[];
};

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9+#.-]{3,}/g) ?? []).filter(Boolean);
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

export function parseSelectedProofPointIds(csv: string | null | undefined): string[] {
  return (csv ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function recommendProjectsForJob(
  job: Job | null | undefined,
  projects: CandidateKnowledgeProject[],
  limit = 3,
): ProjectProofPointRecommendation[] {
  if (!job || projects.length === 0) return [];

  const jobText = [
    job.title,
    job.employer,
    job.location,
    job.disciplines,
    job.skills,
    job.jobFunction,
    job.companyIndustry,
    job.jobDescription,
    job.documentStrategy,
  ]
    .filter(Boolean)
    .join("\n");

  const jobTokens = new Set(tokenize(jobText));
  const priorityTerms = unique(
    ((job.documentStrategy ?? "").match(/[A-Za-z][A-Za-z0-9+.#/-]{2,}/g) ?? []).map((term) =>
      term.toLowerCase(),
    ),
  );

  const selectedIds = new Set(parseSelectedProofPointIds(job.selectedProofPointProjectIds));

  return projects
    .map((project) => {
      const projectText = [
        project.name,
        project.summary,
        project.role,
        project.impact,
        project.keywords.join(" "),
      ]
        .filter(Boolean)
        .join("\n");
      const projectTokens = unique(tokenize(projectText));
      const keywordMatches = projectTokens.filter((token) => jobTokens.has(token));
      const strategicMatches = priorityTerms.filter((term) =>
        projectText.toLowerCase().includes(term),
      );

      let score = keywordMatches.length * 4 + strategicMatches.length * 7;
      if (project.activeForDrafting) score += 3;
      if (selectedIds.has(project.id)) score += 6;
      if (project.role && job.title.toLowerCase().includes(project.role.toLowerCase())) {
        score += 4;
      }

      const reasons: string[] = [];
      if (strategicMatches.length > 0) {
        reasons.push(`Matches strategy terms: ${strategicMatches.slice(0, 3).join(", ")}`);
      }
      if (keywordMatches.length > 0) {
        reasons.push(`Shares JD language: ${keywordMatches.slice(0, 4).join(", ")}`);
      }
      if (project.impact) {
        reasons.push("Has explicit impact statement you can reuse in applications");
      }
      if (selectedIds.has(project.id)) {
        reasons.push("Already selected for this job");
      }
      if (project.activeForDrafting) {
        reasons.push("Already active in drafting context");
      }

      return {
        project,
        score,
        reasons: reasons.slice(0, 3),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
