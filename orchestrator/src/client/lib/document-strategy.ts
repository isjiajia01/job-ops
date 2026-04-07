import type { DocumentStrategy, Job } from "@shared/types.js";

export function parseDocumentStrategy(
  value: Pick<Job, "documentStrategy"> | string | null | undefined,
): DocumentStrategy | null {
  const raw = typeof value === "string" ? value : value?.documentStrategy;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as DocumentStrategy;
    if (
      typeof parsed?.roleAngle !== "string" ||
      !Array.isArray(parsed?.strongestEvidence) ||
      !Array.isArray(parsed?.priorityTerms) ||
      typeof parsed?.coverLetterAngle !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
