import type { CandidateKnowledgeBase, GhostwriterAssistantPayload, ResumeProfile } from "@shared/types";
import { scoreGhostwriterCandidate } from "./ghostwriter-output-guard";

export function rankPayloadCandidates(args: {
  candidates: Array<GhostwriterAssistantPayload & { __variantName?: string }>;
  evidencePackSnapshot: string;
  profile: ResumeProfile;
  knowledgeBase: CandidateKnowledgeBase;
  evidenceSelection?: GhostwriterAssistantPayload["evidenceSelection"] | null;
}): {
  ranked: Array<{
    index: number;
    candidate: GhostwriterAssistantPayload & { __variantName?: string };
    evaluation: ReturnType<typeof scoreGhostwriterCandidate>;
  }>;
  winner: GhostwriterAssistantPayload & { __variantName?: string };
} {
  const ranked = args.candidates
    .map((candidate, index) => ({
      index,
      candidate,
      evaluation: scoreGhostwriterCandidate({
        payload: candidate,
        evidencePackText: args.evidencePackSnapshot,
        profile: args.profile,
        knowledgeBase: args.knowledgeBase,
        evidenceSelection: args.evidenceSelection,
      }),
    }))
    .sort((a, b) => b.evaluation.score - a.evaluation.score);

  return {
    ranked,
    winner: ranked[0]?.candidate ?? args.candidates[0],
  };
}
