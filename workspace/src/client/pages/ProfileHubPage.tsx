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
import { Textarea } from "@/components/ui/textarea";

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

type RadarMetric = {
  label: string;
  value: number;
};

function ProfileBundleRadar({ metrics }: { metrics: RadarMetric[] }) {
  const size = 220;
  const center = size / 2;
  const radius = 72;
  const levels = [0.25, 0.5, 0.75, 1];
  const angleStep = (Math.PI * 2) / metrics.length;
  const startAngle = -Math.PI / 2;

  const pointAt = (index: number, scale: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale,
    };
  };

  const polygonPoints = metrics
    .map((metric, index) => {
      const point = pointAt(index, Math.max(0.1, Math.min(1, metric.value)));
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Profile shape</div>
          <div className="text-xs text-muted-foreground">
            Lightweight overview of your current bundle coverage.
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-between">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-[220px] w-[220px] shrink-0">
          {levels.map((level) => (
            <polygon
              key={level}
              points={metrics.map((_, index) => {
                const point = pointAt(index, level);
                return `${point.x},${point.y}`;
              }).join(" ")}
              fill="none"
              stroke="currentColor"
              className="text-border/50"
              strokeWidth="1"
            />
          ))}
          {metrics.map((_, index) => {
            const point = pointAt(index, 1);
            return (
              <line
                key={index}
                x1={center}
                y1={center}
                x2={point.x}
                y2={point.y}
                stroke="currentColor"
                className="text-border/50"
                strokeWidth="1"
              />
            );
          })}
          <polygon
            points={polygonPoints}
            fill="currentColor"
            className="text-primary/20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {metrics.map((metric, index) => {
            const point = pointAt(index, Math.max(0.1, Math.min(1, metric.value)));
            return <circle key={metric.label} cx={point.x} cy={point.y} r="3.5" fill="currentColor" className="text-primary" />;
          })}
        </svg>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</div>
              <div className="mt-1 text-sm font-medium">{Math.round(metric.value * 100)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

  const radarMetrics = useMemo(
    () => [
      {
        label: "Positioning",
        value: headline.trim().length > 0 ? 1 : 0.2,
      },
      {
        label: "Projects",
        value: Math.min(1, projects.length / 5),
      },
      {
        label: "Facts",
        value: Math.min(1, facts.length / 6),
      },
      {
        label: "Rules",
        value: Math.min(1, preferences.length / 8),
      },
      {
        label: "Processed",
        value: pendingInbox.length > 0 ? Math.max(0.15, 1 - pendingInbox.length / 6) : 1,
      },
    ],
    [facts.length, headline, pendingInbox.length, preferences.length, projects.length],
  );

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

      <PageMain className="space-y-5">
        <section className="overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.25)] md:p-7">
          <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[280px_minmax(0,1fr)] xl:items-stretch">
            <div className="rounded-[24px] border border-border/60 bg-background/45 p-4 backdrop-blur-sm">
              <ProfileBundleRadar metrics={radarMetrics} />
              <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.8)]" />
                  AI ready
                </div>
                <div className="mt-1 text-xs text-emerald-100/70">
                  Ghostwriter can draft from this bundle immediately.
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
              <section className="rounded-[24px] border border-border/60 bg-card/40 p-5 backdrop-blur-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
                      Career Brain Console
                    </div>
                    <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                      {headline.trim() || "Define the career identity Ghostwriter should lead with."}
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                      Your compact application intelligence layer: identity, proof points, positioning facts, and AI guardrails in one place.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <label className="cursor-pointer">
                        <Upload className="mr-2 h-4 w-4" />
                        Import
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
                      Export
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

                <div className="mt-6 rounded-2xl border border-border/60 bg-background/35 p-3">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    Core identity
                  </div>
                  <Input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    className="border-0 bg-transparent px-0 text-xl font-medium shadow-none focus-visible:ring-0"
                  />
                </div>
              </section>

              <section className="rounded-[24px] border border-border/60 bg-card/35 p-5 backdrop-blur-sm">
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Profile health
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  {projects.length + facts.length + preferences.length}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  saved bundle signals
                </div>
                <div className="mt-5 space-y-3">
                  {radarMetrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                        <span>{metric.label}</span>
                        <span>{Math.round(metric.value * 100)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-background/70">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-orange-400 via-amber-300 to-orange-200"
                          style={{ width: `${Math.max(10, metric.value * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-border/60 bg-card/35 p-5 backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Fact book</div>
                    <div className="mt-1 text-sm text-muted-foreground">Positioning notes Ghostwriter can reuse.</div>
                  </div>
                  <Badge variant="outline">{facts.length} facts</Badge>
                </div>
                <div className="space-y-3">
                  {facts.length > 0 ? (
                    facts.slice(0, 8).map((fact) => (
                      <div key={fact.id} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/30 px-4 py-3">
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-300" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium leading-5">{fact.title}</div>
                          <div className="mt-1 text-sm leading-5 text-muted-foreground">{fact.detail}</div>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center text-muted-foreground hover:text-foreground"
                          onClick={() => setFacts((current) => current.filter((row) => row.id !== fact.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
                      No facts saved yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-border/60 bg-card/35 p-5 backdrop-blur-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Project portfolio</div>
                    <div className="mt-1 text-sm text-muted-foreground">Primary proof points that should anchor drafting.</div>
                  </div>
                  <Badge variant="outline">{projects.length} projects</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {projects.length > 0 ? (
                    projects.slice(0, 6).map((project) => (
                      <div key={project.id} className="group rounded-2xl border border-border/60 bg-background/30 p-4 transition-colors hover:border-orange-300/40 hover:bg-background/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium leading-5">{project.name}</div>
                            <div className="mt-2 text-sm leading-5 text-muted-foreground line-clamp-3">
                              {project.summary || project.impact || project.roleRelevance || "Saved project evidence."}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="inline-flex items-center text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 hover:text-foreground"
                            onClick={() => setProjects((current) => current.filter((row) => row.id !== project.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground sm:col-span-2">
                      No projects saved yet.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-border/60 bg-card/35 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Identity persona</div>
              <div className="mt-1 text-sm text-muted-foreground">
                AI-facing guardrails compressed into a lighter persona rail.
              </div>
            </div>
            <Badge variant="outline">{preferences.length} directives</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {preferences.length > 0 ? (
              preferences.map((rule) => (
                <Badge key={rule.id} variant="outline" className="rounded-full border-border/70 bg-background/25 px-3 py-1.5 text-[12px]">
                  [{rule.kind === "tone" ? "Tone" : rule.kind === "positioning" ? "Positioning" : rule.kind === "priority" ? "Priority" : rule.kind === "phrase" ? "Phrase" : "Guardrail"}: {rule.label}]
                </Badge>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No AI guardrails saved yet.</div>
            )}
          </div>
        </section>
      </PageMain>
    </>
  );
};
