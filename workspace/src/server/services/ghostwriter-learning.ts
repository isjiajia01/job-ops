import type { CandidateKnowledgeBase, GhostwriterWritingPreference } from "@shared/types";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function upsertPreference(
  preferences: GhostwriterWritingPreference[],
  preference: GhostwriterWritingPreference,
): GhostwriterWritingPreference[] {
  const key = normalize(preference.label);
  const existingIndex = preferences.findIndex(
    (item) => normalize(item.label) === key,
  );
  if (existingIndex >= 0) {
    const next = [...preferences];
    next[existingIndex] = { ...next[existingIndex], ...preference };
    return next;
  }
  return [preference, ...preferences];
}

export function inferPreferenceFromEditedPrompt(args: {
  original: string;
  edited: string;
  knowledgeBase: CandidateKnowledgeBase;
}): CandidateKnowledgeBase | null {
  const original = args.original.toLowerCase();
  const edited = args.edited.toLowerCase();
  const delta = edited.replace(original, " ");

  const rawPreferenceCandidates: Array<GhostwriterWritingPreference | null> = [
    /less generic|more specific|less template|less templated/.test(edited) || /less generic|more specific/.test(delta)
      ? {
          id: "pref-editorial-less-generic",
          label: "Prefer less generic wording",
          instruction:
            "Prefer specific, evidence-backed wording over generic motivation language or templated phrasing.",
          kind: "guardrail",
          strength: "strong",
        }
      : null,
    /shorter|more concise|tighter/.test(edited) || /shorter|more concise|tighter/.test(delta)
      ? {
          id: "pref-editorial-concise",
          label: "Prefer concise drafts",
          instruction:
            "Keep drafts tight, concise, and free of unnecessary explanation when a shorter version will do.",
          kind: "tone",
          strength: "normal",
        }
      : null,
    /less formal|more natural|more conversational/.test(edited) || /less formal|more natural/.test(delta)
      ? {
          id: "pref-editorial-natural",
          label: "Prefer natural voice",
          instruction:
            "Prefer natural, restrained wording over stiff or overly formal language.",
          kind: "tone",
          strength: "normal",
        }
      : null,
    /more direct|more employer-need|more practical/.test(edited) || /more direct|more practical/.test(delta)
      ? {
          id: "pref-editorial-direct",
          label: "Prefer direct employer-need framing",
          instruction:
            "Open from the work, operating need, or contribution angle rather than generic motivation language.",
          kind: "priority",
          strength: "strong",
        }
      : null,
  ];
  const preferenceCandidates = rawPreferenceCandidates.filter(
    (item): item is GhostwriterWritingPreference => Boolean(item),
  );

  if (!preferenceCandidates.length) return null;

  return {
    ...args.knowledgeBase,
    personalFacts: [...(args.knowledgeBase.personalFacts ?? [])],
    projects: [...(args.knowledgeBase.projects ?? [])],
    companyResearchNotes: [...(args.knowledgeBase.companyResearchNotes ?? [])],
    inboxItems: [...(args.knowledgeBase.inboxItems ?? [])],
    writingPreferences: preferenceCandidates.reduce<GhostwriterWritingPreference[]>(
      (items, preference) => upsertPreference(items, preference),
      [...(args.knowledgeBase.writingPreferences ?? [])],
    ),
  };
}
