import type {
  CandidateKnowledgeBase,
  CandidateKnowledgeProject,
  GhostwriterWritingPreference,
} from "@shared/types";
import type { ChangeEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

type FactItem = {
  id: string;
  title: string;
  detail: string;
};

type ImportedProfileBundle = {
  knowledgeBase?: CandidateKnowledgeBase | null;
  profile?: {
    basics?: {
      headline?: string | null;
      label?: string | null;
      summary?: string | null;
    } | null;
  } | null;
};

type UseProfileBundleIOArgs = {
  facts: FactItem[];
  headline: string;
  inboxItems: CandidateKnowledgeBase["inboxItems"];
  knowledgeBase: CandidateKnowledgeBase;
  preferences: GhostwriterWritingPreference[];
  projects: CandidateKnowledgeProject[];
  summary: string;
  onImport: (payload: {
    facts: FactItem[];
    headline: string;
    inboxItems: CandidateKnowledgeBase["inboxItems"];
    preferences: GhostwriterWritingPreference[];
    projects: CandidateKnowledgeProject[];
    summary: string;
  }) => void;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function useProfileBundleIO({
  facts,
  headline,
  inboxItems,
  knowledgeBase,
  onImport,
  preferences,
  projects,
  summary,
}: UseProfileBundleIOArgs) {
  const [pendingImport, setPendingImport] = useState<ImportedProfileBundle | null>(
    null,
  );

  const handleDownloadJson = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            profile: { basics: { headline, summary } },
            knowledgeBase,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ghostwriter-memory.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [headline, knowledgeBase, summary]);

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as unknown;
        const bundle = asObject(parsed);
        if (!bundle) {
          throw new Error("Bundle must be a JSON object");
        }
        setPendingImport(bundle as ImportedProfileBundle);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to read Profile Hub bundle",
        );
      }
    },
    [],
  );

  const confirmImport = useCallback(() => {
    if (!pendingImport) return;

    const profile = asObject(pendingImport.profile);
    const basics = asObject(profile?.basics);
    const importedKnowledge: Partial<CandidateKnowledgeBase> =
      pendingImport.knowledgeBase ?? {};

    onImport({
      headline:
        asString(basics?.headline) || asString(basics?.label) || headline,
      summary: asString(basics?.summary) || summary,
      facts: importedKnowledge.personalFacts ?? facts,
      projects: importedKnowledge.projects ?? projects,
      preferences: importedKnowledge.writingPreferences ?? preferences,
      inboxItems: importedKnowledge.inboxItems ?? inboxItems,
    });

    setPendingImport(null);
    toast.success("Imported Profile Hub bundle into the current draft");
  }, [
    facts,
    headline,
    inboxItems,
    onImport,
    pendingImport,
    preferences,
    projects,
    summary,
  ]);

  const pendingImportCounts = useMemo(() => {
    const knowledge = pendingImport?.knowledgeBase;
    return {
      factsCount: knowledge?.personalFacts?.length ?? 0,
      inboxCount: knowledge?.inboxItems?.length ?? 0,
      preferencesCount: knowledge?.writingPreferences?.length ?? 0,
      projectsCount: knowledge?.projects?.length ?? 0,
    };
  }, [pendingImport]);

  return {
    confirmImport,
    handleDownloadJson,
    handleImportFile,
    hasPendingImport: Boolean(pendingImport),
    pendingImportCounts,
    setPendingImport,
  };
}
