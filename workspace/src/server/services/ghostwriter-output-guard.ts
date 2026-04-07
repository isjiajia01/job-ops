import type {
  CandidateKnowledgeBase,
  GhostwriterAssistantPayload,
  GhostwriterEvidenceSelectionSummary,
  GhostwriterResumePatch,
  GhostwriterSkillGroup,
  ResumeProfile,
} from "@shared/types";

const HIGH_RISK_PATCH_PATTERNS = [
  /\b(?:10\+|[1-9]\d+\+)\s+years?\b/i,
  /\b(?:led|owned|drove|managed)\s+(?:global|company-?wide|enterprise-?wide)\b/i,
  /\b(?:head of|director|vp|vice president|chief|principal|staff engineer|senior manager)\b/i,
  /\b(?:expert in|world-?class|industry-?leading|best-?in-?class)\b/i,
  /\b(?:sap ibp|kinaxis|o9|anaplan)\b/i,
];

const PROFILE_OVERLAP_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "role",
  "roles",
  "work",
  "team",
  "teams",
  "using",
  "used",
  "build",
  "built",
  "write",
  "writing",
  "strong",
  "stronger",
  "candidate",
  "support",
  "improve",
  "improved",
  "current",
  "draft",
]);

const COVER_LETTER_OPENING_PATTERNS = [
  /^\s*dear\s+(hiring manager|sir\/madam|sir or madam|recruiter|team)[,:-]?\s*/i,
  /^\s*i am writing to express my interest\b[^.]*\.?\s*/i,
  /^\s*i am excited to apply\b[^.]*\.?\s*/i,
  /^\s*i am very excited to apply\b[^.]*\.?\s*/i,
  /^\s*please accept my application\b[^.]*\.?\s*/i,
  /^\s*with great enthusiasm[, ]+i am applying\b[^.]*\.?\s*/i,
];

const COVER_LETTER_GENERIC_OPENING_PREFIXES = [
  "i am passionate about",
  "i am highly motivated to",
  "this role is a perfect fit",
  "i believe i am a strong fit",
  "i am confident that i would be a great fit",
];

const GENERIC_COVER_LETTER_PATTERNS = [
  /\bi am excited to apply\b/gi,
  /\bi am writing to express my interest\b/gi,
  /\bperfect fit\b/gi,
  /\bdynamic team\b/gi,
  /\bfast-paced environment\b/gi,
  /\bpassionate about\b/gi,
  /\bhighly motivated\b/gi,
  /\bthrilled to\b/gi,
  /\bsynergy\b/gi,
  /\bleverage\b/gi,
];

function containsHighRiskPatchLanguage(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  return HIGH_RISK_PATCH_PATTERNS.some((pattern) => pattern.test(value));
}

function tokenizeOverlapSource(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/g)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 4 &&
        !PROFILE_OVERLAP_STOPWORDS.has(token) &&
        /[a-z]/.test(token),
    );
}

function buildProfileEvidenceTokenSet(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
): Set<string> {
  const tokenSet = new Set<string>();
  const addTokens = (value: string | null | undefined) => {
    for (const token of tokenizeOverlapSource(value)) {
      tokenSet.add(token);
    }
  };

  addTokens(profile.basics?.headline);
  addTokens(profile.basics?.label);
  addTokens(profile.basics?.summary);
  addTokens(profile.sections?.summary?.content);

  for (const item of profile.sections?.skills?.items ?? []) {
    addTokens(item.name);
    addTokens(item.description);
    for (const keyword of item.keywords ?? []) addTokens(keyword);
  }

  for (const item of profile.sections?.experience?.items ?? []) {
    addTokens(item.company);
    addTokens(item.position);
    addTokens(item.location);
    addTokens(item.summary);
  }

  for (const item of profile.sections?.projects?.items ?? []) {
    addTokens(item.name);
    addTokens(item.description);
    addTokens(item.summary);
    for (const keyword of item.keywords ?? []) addTokens(keyword);
  }

  for (const fact of knowledgeBase.personalFacts ?? []) {
    addTokens(fact.title);
    addTokens(fact.detail);
  }

  for (const project of knowledgeBase.projects ?? []) {
    addTokens(project.name);
    addTokens(project.summary);
    addTokens(project.role);
    addTokens(project.impact);
    for (const keyword of project.keywords ?? []) addTokens(keyword);
  }

  for (const preference of knowledgeBase.writingPreferences ?? []) {
    addTokens(preference.label);
    addTokens(preference.instruction);
  }

  return tokenSet;
}

function hasEnoughProfileOverlap(
  value: string | null | undefined,
  tokenSet: Set<string>,
): boolean {
  if (!value) return true;

  const tokens = tokenizeOverlapSource(value);
  if (tokens.length === 0) return true;

  if (tokens.length <= 2) {
    return true;
  }

  if (tokens.length < 4) {
    return tokens.some((token) => tokenSet.has(token));
  }

  const overlapCount = tokens.filter((token) => tokenSet.has(token)).length;
  return overlapCount >= 2;
}

function countRegexMatches(value: string, patterns: RegExp[]): number {
  return patterns.reduce((total, pattern) => {
    const matches = value.match(pattern);
    return total + (matches?.length ?? 0);
  }, 0);
}

function countTokenOverlap(value: string, tokenSet: Set<string>): number {
  const unique = new Set(tokenizeOverlapSource(value));
  let overlap = 0;
  for (const token of unique) {
    if (tokenSet.has(token)) overlap += 1;
  }
  return overlap;
}

function countParagraphs(value: string): number {
  return value
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

export function lintCoverLetterDraft(draft: string | null | undefined): {
  sanitized: string | null;
  removedPatterns: string[];
} {
  if (!draft) return { sanitized: null, removedPatterns: [] };

  let next = draft.trim();
  const removedPatterns: string[] = [];

  for (const pattern of COVER_LETTER_OPENING_PATTERNS) {
    if (pattern.test(next)) {
      next = next.replace(pattern, "").trimStart();
      removedPatterns.push(`opening:${pattern.source}`);
    }
  }

  const firstParagraphBreak = next.search(/\n\s*\n/);
  const firstParagraph =
    firstParagraphBreak === -1 ? next : next.slice(0, firstParagraphBreak);
  const normalizedOpening = firstParagraph.trim().toLowerCase();

  for (const prefix of COVER_LETTER_GENERIC_OPENING_PREFIXES) {
    if (normalizedOpening.startsWith(prefix) && next.length > 280) {
      const remainder =
        firstParagraphBreak === -1
          ? ""
          : next.slice(firstParagraphBreak).trimStart();
      next = remainder || next;
      removedPatterns.push(`generic-opening:${prefix}`);
      break;
    }
  }

  const sanitized = next.trim();
  if (!sanitized || sanitized.length < 120) {
    return { sanitized: draft.trim(), removedPatterns: [] };
  }

  return {
    sanitized,
    removedPatterns,
  };
}

export function sanitizeResumePatch(args: {
  patch: GhostwriterResumePatch;
  profile: ResumeProfile;
  knowledgeBase: CandidateKnowledgeBase;
}): {
  sanitized: GhostwriterResumePatch | null;
  removedFields: string[];
} {
  const removedFields: string[] = [];
  const profileEvidenceTokens = buildProfileEvidenceTokenSet(
    args.profile,
    args.knowledgeBase,
  );

  let tailoredSummary = args.patch.tailoredSummary ?? null;
  if (containsHighRiskPatchLanguage(tailoredSummary)) {
    removedFields.push("tailoredSummary");
    tailoredSummary = null;
  } else if (!hasEnoughProfileOverlap(tailoredSummary, profileEvidenceTokens)) {
    removedFields.push("tailoredSummary:low-overlap");
    tailoredSummary = null;
  }

  let tailoredHeadline = args.patch.tailoredHeadline ?? null;
  if (containsHighRiskPatchLanguage(tailoredHeadline)) {
    removedFields.push("tailoredHeadline");
    tailoredHeadline = null;
  } else if (
    !hasEnoughProfileOverlap(tailoredHeadline, profileEvidenceTokens)
  ) {
    removedFields.push("tailoredHeadline:low-overlap");
    tailoredHeadline = null;
  }

  const tailoredSkills =
    args.patch.tailoredSkills?.filter((skill: GhostwriterSkillGroup) => {
      const combined = [skill.name, ...(skill.keywords ?? [])].join(" ");
      const isSafe =
        !containsHighRiskPatchLanguage(combined) &&
        hasEnoughProfileOverlap(combined, profileEvidenceTokens);
      if (!isSafe) {
        removedFields.push(
          containsHighRiskPatchLanguage(combined)
            ? `tailoredSkills:${skill.name}`
            : `tailoredSkills:${skill.name}:low-overlap`,
        );
      }
      return isSafe;
    }) ?? null;

  if (
    !tailoredSummary &&
    !tailoredHeadline &&
    (!tailoredSkills || tailoredSkills.length === 0)
  ) {
    return { sanitized: null, removedFields };
  }

  return {
    sanitized: {
      tailoredSummary,
      tailoredHeadline,
      tailoredSkills:
        tailoredSkills && tailoredSkills.length > 0 ? tailoredSkills : null,
    },
    removedFields,
  };
}

export function scoreGhostwriterCandidate(args: {
  payload: GhostwriterAssistantPayload;
  evidencePackText?: string | null;
  profile: ResumeProfile;
  knowledgeBase: CandidateKnowledgeBase;
  evidenceSelection?: GhostwriterEvidenceSelectionSummary | null;
}): {
  score: number;
  reasons: string[];
  coveredClaimIds: string[];
  mustClaimCoverage: number;
  evidenceCoverage: number;
  penalties: string[];
} {
  const reasons: string[] = [];
  const profileEvidenceTokens = buildProfileEvidenceTokenSet(
    args.profile,
    args.knowledgeBase,
  );
  const evidenceTokens = new Set(profileEvidenceTokens);

  for (const token of tokenizeOverlapSource(args.evidencePackText)) {
    evidenceTokens.add(token);
  }

  let score = 0;
  const coveredClaimIds: string[] = [];
  const penalties: string[] = [];
  const renderedText = [
    args.payload.response,
    args.payload.coverLetterDraft,
    args.payload.resumePatch?.tailoredSummary,
    args.payload.resumePatch?.tailoredHeadline,
    args.payload.resumePatch?.tailoredSkills?.map((skill) => [skill.name, ...(skill.keywords ?? [])].join(" ")).join(" "),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (args.payload.coverLetterDraft) {
    const draft = args.payload.coverLetterDraft;
    const overlap = countTokenOverlap(draft, evidenceTokens);
    const genericMatches = countRegexMatches(
      draft,
      GENERIC_COVER_LETTER_PATTERNS,
    );
    const paragraphCount = countParagraphs(draft);

    score += Math.min(overlap, 8) * 2;
    if (overlap > 0) reasons.push(`evidence-overlap:${overlap}`);

    if (paragraphCount >= 2 && paragraphCount <= 4) {
      score += 3;
      reasons.push(`paragraph-structure:${paragraphCount}`);
    }

    if (draft.length >= 170 && draft.length <= 320) {
      score += 2;
      reasons.push("good-length");
    }

    if (containsHighRiskPatchLanguage(draft)) {
      score -= 6;
      reasons.push("high-risk-language");
      penalties.push("high-risk-language");
    }

    if (genericMatches > 0) {
      score -= genericMatches * 2;
      reasons.push(`generic-phrases:${genericMatches}`);
      penalties.push(`generic-phrases:${genericMatches}`);
    }
  }

  if (args.payload.resumePatch) {
    const sanitizedPatch = sanitizeResumePatch({
      patch: args.payload.resumePatch,
      profile: args.profile,
      knowledgeBase: args.knowledgeBase,
    }).sanitized;

    if (sanitizedPatch?.tailoredSummary) {
      score +=
        3 +
        Math.min(
          countTokenOverlap(sanitizedPatch.tailoredSummary, evidenceTokens),
          4,
        );
      reasons.push("resume-summary");
    }

    if (sanitizedPatch?.tailoredHeadline) {
      score +=
        2 +
        Math.min(
          countTokenOverlap(sanitizedPatch.tailoredHeadline, evidenceTokens),
          2,
        );
      reasons.push("resume-headline");
    }

    if (sanitizedPatch?.tailoredSkills?.length) {
      score += sanitizedPatch.tailoredSkills.length * 2;
      reasons.push(`resume-skills:${sanitizedPatch.tailoredSkills.length}`);
    }
  }

  if (args.payload.claimPlan?.claims?.length) {
    for (const claim of args.payload.claimPlan.claims) {
      const evidenceMatched = claim.evidenceSnippets.some((snippet) => {
        const normalized = snippet.toLowerCase().trim();
        return normalized.length >= 10 && renderedText.includes(normalized.slice(0, Math.min(normalized.length, 48)));
      });
      const claimMatched = renderedText.includes(claim.claim.toLowerCase().slice(0, Math.min(claim.claim.length, 48)));
      if (evidenceMatched || claimMatched) {
        coveredClaimIds.push(claim.id);
        score += claim.priority === "must" ? 5 : claim.priority === "high" ? 3 : 2;
      } else if (claim.priority === "must") {
        score -= 4;
        penalties.push(`missed-must-claim:${claim.id}`);
      }
    }

    for (const excluded of args.payload.claimPlan.excludedClaims ?? []) {
      const normalized = excluded.toLowerCase().trim();
      if (normalized.length >= 8 && renderedText.includes(normalized.slice(0, Math.min(normalized.length, 48)))) {
        score -= 5;
        penalties.push(`excluded-claim:${normalized.slice(0, 24)}`);
      }
    }
  }

  if (args.evidenceSelection) {
    const approvedIds = new Set(args.evidenceSelection.allowedModuleIds);
    const approvedLabelText = args.evidenceSelection.allowedModuleLabels
      .join(" ")
      .toLowerCase();
    const unapprovedClaimHits = (args.payload.claimPlan?.claims ?? []).filter(
      (claim) => claim.evidenceIds.some((id) => !approvedIds.has(id)),
    );
    if (unapprovedClaimHits.length > 0) {
      score -= unapprovedClaimHits.length * 4;
      penalties.push(`unapproved-evidence-ids:${unapprovedClaimHits.length}`);
    }

    const suspiciousLabels = (args.knowledgeBase.projects ?? [])
      .map((project) => project.name)
      .filter((label) => {
        const normalized = label.toLowerCase();
        return (
          normalized.length >= 8 &&
          renderedText.includes(normalized) &&
          !approvedLabelText.includes(normalized)
        );
      });
    if (suspiciousLabels.length > 0) {
      score -= Math.min(6, suspiciousLabels.length * 2);
      penalties.push(`possible-unapproved-projects:${suspiciousLabels.length}`);
    }
  }

  score += Math.max(args.payload.response.trim().length > 0 ? 1 : 0, 0);

  const mustClaimCoverage = args.payload.claimPlan?.claims.filter((claim) => claim.priority === "must" && coveredClaimIds.includes(claim.id)).length ?? 0;
  const evidenceCoverage = coveredClaimIds.length;

  if (mustClaimCoverage > 0) reasons.push(`must-claims:${mustClaimCoverage}`);
  if (evidenceCoverage > 0) reasons.push(`claim-coverage:${evidenceCoverage}`);

  return { score, reasons, coveredClaimIds, mustClaimCoverage, evidenceCoverage, penalties };
}
