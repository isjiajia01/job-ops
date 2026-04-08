import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { useProfile } from "@client/hooks/useProfile";
import { queryKeys } from "@client/lib/queryKeys";
import type {
  CandidateKnowledgeBase,
  CandidateKnowledgeInboxItem,
  CandidateKnowledgeProject,
  GhostwriterWritingPreference,
  ResumeProfile,
} from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ContactRound, Download, Loader2, Save, Trash2, Upload, Wand2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { ImportProfileDialog } from "./profile-hub/ImportProfileDialog";
import { useProfileBundleIO } from "./profile-hub/useProfileBundleIO";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FactItem = {
  id: string;
  title: string;
  detail: string;
};

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeBullet(text: string): string | null {
  const trimmed = text.replace(/^[-*•\d.\s]+/, "").trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[\s.;,:]+$/, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function parseBulletLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => normalizeBullet(line))
    .filter((line): line is string => Boolean(line))
    .slice(0, 8);
}

function bulletsToText(bullets?: string[]): string {
  return (bullets ?? []).join("\n");
}

function formatRelativeDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "—";
  const deltaHours = Math.max(1, Math.round((Date.now() - parsed) / 36e5));
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return `${Math.round(deltaHours / 24)}d ago`;
}


function inferPreferenceKind(
  item: Pick<
    CandidateKnowledgeInboxItem,
    "kind" | "title" | "summary" | "rawText" | "tags"
  >,
): GhostwriterWritingPreference["kind"] {
  const corpus = [item.title, item.summary, item.rawText, ...(item.tags ?? [])]
    .join(" ")
    .toLowerCase();

  if (/tone|direct|grounded|warm|modest|voice|sound/.test(corpus))
    return "tone";
  if (/avoid|do not|don't|never|no hype|no fluff|don't claim/.test(corpus)) {
    return "guardrail";
  }
  if (/priorit|lead with|focus on|highlight/.test(corpus)) return "priority";
  if (/phrase|wording|say|use/.test(corpus)) return "phrase";
  return "positioning";
}

function inferPreferenceStrength(
  text: string,
): GhostwriterWritingPreference["strength"] {
  return /must|always|never|do not|don't|avoid/.test(text.toLowerCase())
    ? "strong"
    : "normal";
}

function generateProjectCvBullets(input: {
  summary: string;
  impact?: string | null;
  role?: string | null;
  keywords?: string[];
}): string[] {
  return [
    input.role ? `${input.role}: ${input.summary}` : input.summary,
    input.impact ? `Impact: ${input.impact}` : null,
    input.keywords?.length
      ? `Tools / themes: ${input.keywords.slice(0, 5).join(", ")}`
      : null,
  ]
    .map((item) => (typeof item === "string" ? normalizeBullet(item) : null))
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function inboxItemToProject(
  item: CandidateKnowledgeInboxItem,
): CandidateKnowledgeProject {
  if (item.suggestedProject) {
    return {
      id: createId("knowledge-project"),
      name: item.suggestedProject.name,
      summary: item.suggestedProject.summary,
      keywords: item.suggestedProject.keywords,
      role: item.suggestedProject.role,
      impact: item.suggestedProject.impact,
      roleRelevance: item.suggestedProject.roleRelevance,
      cvBullets: generateProjectCvBullets({
        summary: item.suggestedProject.summary,
        impact: item.suggestedProject.impact,
        role: item.suggestedProject.role,
        keywords: item.suggestedProject.keywords,
      }),
    };
  }

  return {
    id: createId("knowledge-project"),
    name: item.title,
    summary: item.rawText,
    keywords: item.tags,
    role: null,
    impact: item.summary,
    roleRelevance: null,
    cvBullets: generateProjectCvBullets({
      summary: item.rawText,
      impact: item.summary,
      keywords: item.tags,
    }),
  };
}

function inboxItemToFact(item: CandidateKnowledgeInboxItem): FactItem {
  if (item.suggestedFact) {
    return {
      id: createId("fact"),
      title: item.suggestedFact.title,
      detail: item.suggestedFact.detail,
    };
  }
  return { id: createId("fact"), title: item.title, detail: item.rawText };
}

function inboxItemToPreference(
  item: CandidateKnowledgeInboxItem,
): GhostwriterWritingPreference {
  if (item.suggestedPreference) {
    return {
      id: createId("preference"),
      label: item.suggestedPreference.label,
      instruction: item.suggestedPreference.instruction,
      kind: item.suggestedPreference.kind,
      strength: item.suggestedPreference.strength,
    };
  }

  return {
    id: createId("preference"),
    label: item.title,
    instruction: item.rawText,
    kind: inferPreferenceKind(item),
    strength: inferPreferenceStrength(item.rawText),
  };
}

function toKnowledgeBase(input: {
  facts: FactItem[];
  projects: CandidateKnowledgeProject[];
  preferences: GhostwriterWritingPreference[];
  inboxItems: CandidateKnowledgeInboxItem[];
}): CandidateKnowledgeBase {
  return {
    personalFacts: input.facts
      .filter((item) => item.title.trim() || item.detail.trim())
      .map((item) => ({
        id: item.id,
        title: item.title.trim(),
        detail: item.detail.trim(),
      })),
    projects: input.projects
      .filter((item) => item.name.trim() || item.summary.trim())
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        summary: item.summary.trim(),
        keywords: item.keywords
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        role: item.role?.trim() || null,
        impact: item.impact?.trim() || null,
        roleRelevance: item.roleRelevance?.trim() || null,
        cvBullets: (item.cvBullets ?? [])
          .map((bullet) => bullet.trim())
          .filter(Boolean),
      })),
    companyResearchNotes: [],
    writingPreferences: input.preferences
      .filter((item) => item.label.trim() || item.instruction.trim())
      .map((item) => ({
        ...item,
        label: item.label.trim(),
        instruction: item.instruction.trim(),
      })),
    inboxItems: input.inboxItems,
  };
}

function updateInboxStatus(
  items: CandidateKnowledgeInboxItem[],
  id: string,
  status: CandidateKnowledgeInboxItem["status"],
): CandidateKnowledgeInboxItem[] {
  const now = new Date().toISOString();
  return items.map((item) =>
    item.id === id ? { ...item, status, updatedAt: now } : item,
  );
}

function autoApplyDigestedItems(args: {
  items: CandidateKnowledgeInboxItem[];
  facts: FactItem[];
  projects: CandidateKnowledgeProject[];
  preferences: GhostwriterWritingPreference[];
}) {
  const nextFacts = [...args.facts];
  const nextProjects = [...args.projects];
  const nextPreferences = [...args.preferences];

  for (const item of args.items) {
    if (item.suggestedProject || item.kind === "project") {
      nextProjects.unshift(inboxItemToProject(item));
      continue;
    }
    if (item.suggestedPreference || item.kind === "preference") {
      nextPreferences.unshift(inboxItemToPreference(item));
      continue;
    }
    nextFacts.unshift(inboxItemToFact(item));
  }

  return {
    facts: nextFacts,
    projects: nextProjects,
    preferences: nextPreferences,
  };
}

export const ProfileHubPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { profile, isLoading: profileLoading } = useProfile();
  const [captureText, setCaptureText] = useState("");
  const [captureSource, setCaptureSource] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [facts, setFacts] = useState<FactItem[]>([]);
  const [projects, setProjects] = useState<CandidateKnowledgeProject[]>([]);
  const [preferences, setPreferences] = useState<
    GhostwriterWritingPreference[]
  >([]);
  const [inboxItems, setInboxItems] = useState<CandidateKnowledgeInboxItem[]>(
    [],
  );
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDigesting, setIsDigesting] = useState(false);

  const internalProfileQuery = useQuery<ResumeProfile>({
    queryKey: [...queryKeys.profile.all, "internal"] as const,
    queryFn: api.getInternalProfile,
  });

  const knowledgeQuery = useQuery<CandidateKnowledgeBase>({
    queryKey: queryKeys.profile.knowledge(),
    queryFn: api.getCandidateKnowledgeBase,
  });

  const sourceProfile = useMemo(
    () => internalProfileQuery.data ?? profile ?? null,
    [internalProfileQuery.data, profile],
  );

  useEffect(() => {
    if (!sourceProfile) return;
    setHeadline(
      asText(sourceProfile.basics?.headline ?? sourceProfile.basics?.label),
    );
    setSummary(
      asText(
        sourceProfile.sections?.summary?.content ??
          sourceProfile.basics?.summary,
      ),
    );
  }, [sourceProfile]);

  useEffect(() => {
    const knowledge = knowledgeQuery.data;
    if (!knowledge) return;
    setFacts(
      (knowledge.personalFacts ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
      })),
    );
    setProjects(
      (knowledge.projects ?? []).map((item) => ({
        ...item,
        cvBullets: item.cvBullets ?? [],
      })),
    );
    setPreferences(knowledge.writingPreferences ?? []);
    setInboxItems(knowledge.inboxItems ?? []);
  }, [knowledgeQuery.data]);

  const isBootstrapping =
    profileLoading ||
    internalProfileQuery.isLoading ||
    knowledgeQuery.isLoading;

  const pendingInbox = useMemo(
    () => inboxItems.filter((item) => item.status === "pending"),
    [inboxItems],
  );

  useEffect(() => {
    if (!pendingInbox.length) {
      setSelectedInboxId(null);
      return;
    }
    setSelectedInboxId((current) =>
      current && pendingInbox.some((item) => item.id === current)
        ? current
        : (pendingInbox[0]?.id ?? null),
    );
  }, [pendingInbox]);

  const selectedInboxItem = useMemo(
    () => pendingInbox.find((item) => item.id === selectedInboxId) ?? null,
    [pendingInbox, selectedInboxId],
  );

  const activeKnowledgeBase = useMemo(
    () => toKnowledgeBase({ facts, projects, preferences, inboxItems }),
    [facts, projects, preferences, inboxItems],
  );

  const handleAttachFiles = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    try {
      const extractedParts = await Promise.all(
        files.map(async (file) => {
          const lowerName = file.name.toLowerCase();

          if (
            file.type.startsWith("text/") ||
            /\.(md|txt|json|csv|tsv|tex|yaml|yml)$/i.test(file.name)
          ) {
            const text = (await file.text()).trim();
            return text ? `# File: ${file.name}\n\n${text}` : `# File: ${file.name}\n\n[Empty file]`;
          }

          if (lowerName.endsWith(".docx")) {
            const mammoth = await import("mammoth-browser");
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            const text = result.value.trim();
            return text ? `# File: ${file.name}\n\n${text}` : `# File: ${file.name}\n\n[No extractable DOCX text found]`;
          }

          if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
            const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const pages: string[] = [];

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              const page = await pdf.getPage(pageNumber);
              const content = await page.getTextContent();
              const pageText = content.items
                .map((item) => ("str" in item ? item.str : ""))
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
              if (pageText) pages.push(pageText);
            }

            const text = pages.join("\n\n").trim();
            return text ? `# File: ${file.name}\n\n${text}` : `# File: ${file.name}\n\n[No extractable PDF text found]`;
          }

          return null;
        }),
      );

      const contents = extractedParts.filter((part): part is string => Boolean(part));
      const skippedCount = files.length - contents.length;

      if (!contents.length) {
        toast.error("No readable text found in the attached files.");
        return;
      }

      setCaptureText((current) => [current.trim(), ...contents].filter(Boolean).join("\n\n---\n\n"));
      if (!captureSource.trim()) {
        setCaptureSource(
          files.length === 1 ? files[0]?.name ?? "Attached file" : `${files.length} attached files`,
        );
      }
      if (skippedCount > 0) {
        toast.success(`Attached ${contents.length} file(s). Skipped ${skippedCount} unsupported file(s).`);
      } else {
        toast.success(`Attached ${contents.length} file(s) for AI analysis.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to read attached files");
    } finally {
      event.target.value = "";
    }
  };

  const handleDigest = async () => {
    const rawText = captureText.trim();
    if (!rawText) {
      toast.error(
        "Paste a project note, writing preference, or personal fact first",
      );
      return;
    }

    try {
      setIsDigesting(true);
      const result = await api.ingestProfileKnowledgeCapture({
        rawText,
        sourceLabel: captureSource || null,
      });
      const applied = autoApplyDigestedItems({
        items: result.items,
        facts,
        projects,
        preferences,
      });
      const nextKnowledgeBase = toKnowledgeBase({
        facts: applied.facts,
        projects: applied.projects,
        preferences: applied.preferences,
        inboxItems,
      });
      await api.saveCandidateKnowledgeBase(nextKnowledgeBase);
      setFacts(applied.facts);
      setProjects(applied.projects);
      setPreferences(applied.preferences);
      setCaptureText("");
      setCaptureSource("");
      toast.success(
        `AI organized and saved ${result.items.length} item${result.items.length === 1 ? "" : "s"} into your profile bundle.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to digest capture",
      );
    } finally {
      setIsDigesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await Promise.all([
        api.saveInternalProfile({
          basics: { headline, label: headline, summary },
          sections: { summary: { content: summary } },
        }),
        api.saveCandidateKnowledgeBase(activeKnowledgeBase),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.profile.all }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile.knowledge(),
        }),
      ]);
      toast.success("Profile Hub saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save Profile Hub",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const acceptInboxItem = (
    item: CandidateKnowledgeInboxItem,
    target: "project" | "fact" | "preference",
  ) => {
    if (target === "project") {
      setProjects((current) => [inboxItemToProject(item), ...current]);
    } else if (target === "fact") {
      setFacts((current) => [inboxItemToFact(item), ...current]);
    } else {
      setPreferences((current) => [inboxItemToPreference(item), ...current]);
    }
    setInboxItems((current) => updateInboxStatus(current, item.id, "accepted"));
    toast.success(
      target === "project"
        ? "Accepted as project and generated starter CV bullets"
        : target === "fact"
          ? "Accepted as fact"
          : "Accepted as writing rule",
    );
  };

  const archiveInboxItem = (id: string) => {
    setInboxItems((current) => updateInboxStatus(current, id, "archived"));
  };

  const updateSelectedInbox = (
    updater: (item: CandidateKnowledgeInboxItem) => CandidateKnowledgeInboxItem,
  ) => {
    if (!selectedInboxItem) return;
    setInboxItems((current) =>
      current.map((item) =>
        item.id === selectedInboxItem.id
          ? { ...updater(item), updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  };

  const {
    confirmImport,
    handleDownloadJson,
    handleImportFile,
    hasPendingImport,
    pendingImportCounts,
    setPendingImport,
  } = useProfileBundleIO({
    facts,
    headline,
    inboxItems,
    knowledgeBase: activeKnowledgeBase,
    preferences,
    projects,
    summary,
    onImport: ({
      facts: importedFacts,
      headline: importedHeadline,
      inboxItems: importedInboxItems,
      preferences: importedPreferences,
      projects: importedProjects,
      summary: importedSummary,
    }) => {
      setFacts(importedFacts);
      setHeadline(importedHeadline);
      setInboxItems(importedInboxItems ?? []);
      setPreferences(importedPreferences);
      setProjects(importedProjects);
      setSummary(importedSummary);
    },
  });

  if (isBootstrapping) {
    return (
      <>
        <PageHeader
          icon={ContactRound}
          title="Profile Hub"
          subtitle="Loading your application-writing workspace"
        />
        <PageMain>
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading Profile Hub…
          </div>
        </PageMain>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={ContactRound}
        title="Profile Hub"
        subtitle="One JSON-backed profile bundle for Ghostwriter"
      />

      <ImportProfileDialog
        isOpen={hasPendingImport}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
        onConfirm={confirmImport}
        {...pendingImportCounts}
      />

      <PageMain className="space-y-4">
        <section className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 bg-background/70">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Profile JSON</h2>
                  <p className="text-sm text-muted-foreground">
                    Import, export, and save the single profile file Ghostwriter should use.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{projects.length} projects</Badge>
                <Badge variant="outline">{facts.length} facts</Badge>
                <Badge variant="outline">{preferences.length} rules</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Import JSON
                  <input
                    type="file"
                    accept="application/json"
                    className="sr-only"
                    onChange={handleImportFile}
                  />
                </label>
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadJson}>
                <Download className="mr-2 h-4 w-4" />
                Export JSON
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm md:p-5">
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Profile overview</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                  {headline.trim() || "Define the professional identity Ghostwriter should lead with."}
                </h2>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {summary.trim() ||
                  "A compact candidate profile with core positioning, reusable proof points, and lightweight AI writing preferences."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{projects.length} projects</Badge>
                <Badge variant="outline">{facts.length} facts</Badge>
                <Badge variant="outline">{preferences.length} rules</Badge>
                <Badge variant="outline" className="text-muted-foreground">Ready for Ghostwriter</Badge>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Core identity</div>
                  <div className="mt-1 text-sm text-muted-foreground">Short headline used as the default career framing.</div>
                </div>
                <Input value={headline} onChange={(event) => setHeadline(event.target.value)} />
              </div>

              <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Persona snapshot</div>
                  <div className="mt-1 text-sm text-muted-foreground">A quick human-readable picture of the profile bundle.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {projects.slice(0, 3).map((project) => (
                    <Badge key={project.id} variant="secondary" className="px-3 py-1">
                      {project.name}
                    </Badge>
                  ))}
                  {facts.slice(0, 3).map((fact) => (
                    <Badge key={fact.id} variant="outline" className="px-3 py-1">
                      {fact.title}
                    </Badge>
                  ))}
                  {preferences.slice(0, 2).map((rule) => (
                    <Badge key={rule.id} variant="outline" className="px-3 py-1 text-muted-foreground">
                      {rule.label}
                    </Badge>
                  ))}
                  {projects.length + facts.length + preferences.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No profile signals saved yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-card/50 p-4 shadow-sm md:p-5">
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">AI profile assistant</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight">Talk to your profile and let AI file things for you</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Paste notes or attach text-like files. AI will analyze them, classify them, and write the result directly into your profile bundle.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Attach files
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={handleAttachFiles}
                  />
                </label>
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wand2 className="h-4 w-4 text-muted-foreground" />
                  AI organizer
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  Give it raw material like resumes, thesis notes, project README text, brag bullets, or writing preferences.
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4">
                <Input
                  value={captureSource}
                  onChange={(event) => setCaptureSource(event.target.value)}
                  placeholder="Source label, e.g. thesis README or old CV"
                />
                <textarea
                  value={captureText}
                  onChange={(event) => setCaptureText(event.target.value)}
                  placeholder="Paste free-form notes or attach files above. Example: project README, internship bullets, work authorization note, preferred tone examples..."
                  className="min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    Supported direct attachments here: txt, md, json, csv, tsv, tex, yaml, PDF, DOCX.
                  </div>
                  <Button onClick={handleDigest} disabled={isDigesting || !captureText.trim()}>
                    {isDigesting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="mr-2 h-4 w-4" />
                    )}
                    Analyze and update profile
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </PageMain>
    </>
  );
};
