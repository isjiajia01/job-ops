import { logger } from "@infra/logger";

export function stripMarkdownCodeFences(content: string): string {
  return content
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
}

function extractBalancedJsonCandidate(content: string): string | null {
  const start = content.search(/[\[{]/);
  if (start === -1) return null;

  const opening = content[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opening) {
      depth += 1;
      continue;
    }

    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parseJsonContent<T>(content: string, jobId?: string): T {
  const stripped = stripMarkdownCodeFences(content);
  const candidates = [
    stripped,
    extractBalancedJsonCandidate(stripped),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error;
    }
  }

  logger.error("Failed to parse LLM JSON content", {
    jobId: jobId ?? "unknown",
    sample: stripped.substring(0, 200),
  });
  throw new Error(
    `Failed to parse JSON response: ${lastError instanceof Error ? lastError.message : "unknown"}`,
  );
}
