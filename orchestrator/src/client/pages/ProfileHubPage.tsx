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
import {
  Brain,
  Check,
  ChevronsUpDown,
  ContactRound,
  Download,
  FolderKanban,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type SkillFormItem = {
  id: string;
  name: string;
  keywordsText: string;
};

type ExperienceFormItem = {
  id: string;
  company: string;
  position: string;
  location: string;
  date: string;
  summary: string;
};

type CanonicalProjectFormItem = {
  id: string;
  name: string;
  date: string;
  summary: string;
  keywordsText: string;
  url: string;
};

type FactFormItem = {
  id: string;
  title: string;
  detail: string;
};

type PreferenceFormItem = GhostwriterWritingPreference;

type ThemeDefinition = {
  label: string;
  keywords: string[];
  tone: "emerald" | "sky" | "amber" | "violet" | "rose";
};

const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    label: "Planning analytics",
    keywords: ["planning", "forecast", "forecasting", "scenario", "capacity"],
    tone: "emerald",
  },
  {
    label: "Decision support",
    keywords: ["decision support", "stakeholder", "reporting", "insight"],
    tone: "sky",
  },
  {
    label: "Operations research",
    keywords: ["optimization", "optimisation", "or-tools", "routing", "assignment"],
    tone: "violet",
  },
  {
    label: "Last-mile / logistics",
    keywords: ["last-mile", "delivery", "logistics", "route", "linehaul"],
    tone: "amber",
  },
  {
    label: "Practical Denmark-style writing",
    keywords: ["denmark", "direct", "modest", "practical", "sincere"],
    tone: "rose",
  },
];

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function hasMeaningfulProfile(profile: ResumeProfile | null | undefined): boolean {
  if (!profile) return false;
  const basics = profile.basics ?? {};
  const sections = profile.sections ?? {};

  return Boolean(
    basics.name ||
      basics.headline ||
      basics.summary ||
      sections.summary?.content ||
      sections.skills?.items?.length ||
      sections.experience?.items?.length ||
      sections.projects?.items?.length,
  );
}

function profileToSkillForm(profile: ResumeProfile | null): SkillFormItem[] {
  return (profile?.sections?.skills?.items ?? []).map((item) => ({
    id: item.id || createId("skill"),
    name: asText(item.name),
    keywordsText: (item.keywords ?? []).join(", "),
  }));
}

function profileToExperienceForm(profile: ResumeProfile | null): ExperienceFormItem[] {
  return (profile?.sections?.experience?.items ?? []).map((item) => ({
    id: item.id || createId("experience"),
    company: asText(item.company),
    position: asText(item.position),
    location: asText(item.location),
    date: asText(item.date),
    summary: asText(item.summary),
  }));
}

function profileToCanonicalProjectForm(
  profile: ResumeProfile | null,
): CanonicalProjectFormItem[] {
  return (profile?.sections?.projects?.items ?? []).map((item) => ({
    id: item.id || createId("project"),
    name: asText(item.name),
    date: asText(item.date),
    summary: asText(item.summary ?? item.description),
    keywordsText: (item.keywords ?? []).join(", "),
    url: asText(item.url),
  }));
}

function formToProfile(args: {
  basics: {
    name: string;
    headline: string;
    email: string;
    phone: string;
    locationCity: string;
    locationRegion: string;
    url: string;
  };
  summary: string;
  skills: SkillFormItem[];
  experience: ExperienceFormItem[];
  canonicalProjects: CanonicalProjectFormItem[];
}): ResumeProfile {
  return {
    basics: {
      name: args.basics.name,
      headline: args.basics.headline,
      label: args.basics.headline,
      email: args.basics.email,
      phone: args.basics.phone,
      url: args.basics.url,
      summary: args.summary,
      location: {
        city: args.basics.locationCity,
        region: args.basics.locationRegion,
      },
    },
    sections: {
      summary: { content: args.summary },
      skills: {
        items: args.skills
          .filter((item) => item.name.trim() || item.keywordsText.trim())
          .map((item) => ({
            id: item.id,
            name: item.name.trim(),
            description: item.name.trim(),
            level: 0,
            keywords: item.keywordsText
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            visible: true,
          })),
      },
      experience: {
        items: args.experience
          .filter((item) => item.company.trim() || item.position.trim())
          .map((item) => ({
            id: item.id,
            company: item.company.trim(),
            position: item.position.trim(),
            location: item.location.trim(),
            date: item.date.trim(),
            summary: item.summary.trim(),
            visible: true,
          })),
      },
      projects: {
        items: args.canonicalProjects
          .filter((item) => item.name.trim())
          .map((item) => ({
            id: item.id,
            name: item.name.trim(),
            description: item.summary.trim(),
            date: item.date.trim(),
            summary: item.summary.trim(),
            visible: true,
            keywords: item.keywordsText
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            url: item.url.trim(),
          })),
      },
    },
  };
}

function firstSentence(text: string): string {
  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find(Boolean);
  return sentence ?? text.trim();
}

function inboxItemToProject(item: CandidateKnowledgeInboxItem): CandidateKnowledgeProject {
  if (item.suggestedProject) {
    return {
      id: createId("knowledge-project"),
      name: item.suggestedProject.name,
      summary: item.suggestedProject.summary,
      keywords: item.suggestedProject.keywords,
      role: item.suggestedProject.role,
      impact: item.suggestedProject.impact,
    };
  }

  return {
    id: createId("knowledge-project"),
    name: item.title,
    summary: item.rawText,
    keywords: item.tags,
    role: null,
    impact: item.summary,
  };
}

function inboxItemToFact(item: CandidateKnowledgeInboxItem): FactFormItem {
  if (item.suggestedFact) {
    return {
      id: createId("fact"),
      title: item.suggestedFact.title,
      detail: item.suggestedFact.detail,
    };
  }

  return {
    id: createId("fact"),
    title: item.title,
    detail: item.rawText,
  };
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
    kind: item.kind === "preference" ? "guardrail" : "positioning",
    strength: /avoid|do not|don't|must|always/i.test(item.rawText)
      ? "strong"
      : "normal",
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

function collectThemeScores(textBlocks: string[]): Array<{
  label: string;
  score: number;
  tone: ThemeDefinition["tone"];
}> {
  const corpus = textBlocks.join(" \n ").toLowerCase();
  return THEME_DEFINITIONS.map((theme) => ({
    label: theme.label,
    tone: theme.tone,
    score: theme.keywords.reduce(
      (sum, keyword) => sum + (corpus.includes(keyword.toLowerCase()) ? 1 : 0),
      0,
    ),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function toneBadgeClass(tone: ThemeDefinition["tone"]): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "sky":
      return "border-sky-500/40 bg-sky-500/10 text-sky-200";
    case "amber":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    case "violet":
      return "border-violet-500/40 bg-violet-500/10 text-violet-200";
    case "rose":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    default:
      return "border-border/60 bg-muted/30 text-foreground";
  }
}

function formatRelativeDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  const deltaHours = Math.max(1, Math.round((Date.now() - parsed) / 36e5));
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const days = Math.round(deltaHours / 24);
  return `${days}d ago`;
}

function OverviewStatCard(props: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03] shadow-none backdrop-blur">
      <CardContent className="space-y-1 p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-white/45">
          {props.label}
        </div>
        <div className="text-2xl font-semibold tracking-tight text-white">
          {props.value}
        </div>
        <div className="text-sm text-white/55">{props.hint}</div>
      </CardContent>
    </Card>
  );
}

function SectionIntro(props: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-white">
          {props.title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-white/60">
          {props.description}
        </p>
      </div>
      {props.action}
    </div>
  );
}

function EmptyState(props: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm">
      <div className="font-medium text-white">{props.title}</div>
      <div className="mt-1 text-white/55">{props.description}</div>
      {props.action ? <div className="mt-4">{props.action}</div> : null}
    </div>
  );
}

export const ProfileHubPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { profile, isLoading: profileLoading } = useProfile();
  const [captureText, setCaptureText] = useState("");
  const [captureSource, setCaptureSource] = useState("");
  const [importText, setImportText] = useState("");
  const [quickRule, setQuickRule] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDigestingCapture, setIsDigestingCapture] = useState(false);
  const [isRefreshingBase, setIsRefreshingBase] = useState(false);
  const [basics, setBasics] = useState({
    name: "",
    headline: "",
    email: "",
    phone: "",
    locationCity: "",
    locationRegion: "",
    url: "",
  });
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState<SkillFormItem[]>([]);
  const [experience, setExperience] = useState<ExperienceFormItem[]>([]);
  const [canonicalProjects, setCanonicalProjects] = useState<
    CanonicalProjectFormItem[]
  >([]);
  const [facts, setFacts] = useState<FactFormItem[]>([]);
  const [knowledgeProjects, setKnowledgeProjects] = useState<
    CandidateKnowledgeProject[]
  >([]);
  const [preferences, setPreferences] = useState<PreferenceFormItem[]>([]);
  const [inboxItems, setInboxItems] = useState<CandidateKnowledgeInboxItem[]>([]);
  const [companyResearchNotes, setCompanyResearchNotes] = useState<
    NonNullable<CandidateKnowledgeBase["companyResearchNotes"]>
  >([]);

  const internalProfileQuery = useQuery<ResumeProfile>({
    queryKey: [...queryKeys.profile.all, "internal"] as const,
    queryFn: api.getInternalProfile,
  });

  const knowledgeQuery = useQuery<CandidateKnowledgeBase>({
    queryKey: queryKeys.profile.knowledge(),
    queryFn: api.getCandidateKnowledgeBase,
  });

  const sourceProfile = useMemo(() => {
    const internal = internalProfileQuery.data;
    if (hasMeaningfulProfile(internal)) return internal;
    return profile ?? null;
  }, [internalProfileQuery.data, profile]);

  useEffect(() => {
    if (!sourceProfile) return;
    setBasics({
      name: asText(sourceProfile.basics?.name),
      headline: asText(
        sourceProfile.basics?.headline ?? sourceProfile.basics?.label,
      ),
      email: asText(sourceProfile.basics?.email),
      phone: asText(sourceProfile.basics?.phone),
      locationCity: asText(sourceProfile.basics?.location?.city),
      locationRegion: asText(sourceProfile.basics?.location?.region),
      url: asText(sourceProfile.basics?.url),
    });
    setSummary(
      asText(sourceProfile.sections?.summary?.content ?? sourceProfile.basics?.summary),
    );
    setSkills(profileToSkillForm(sourceProfile));
    setExperience(profileToExperienceForm(sourceProfile));
    setCanonicalProjects(profileToCanonicalProjectForm(sourceProfile));
  }, [sourceProfile]);

  useEffect(() => {
    const knowledge = knowledgeQuery.data;
    if (!knowledge) return;
    setFacts(
      knowledge.personalFacts.map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
      })),
    );
    setKnowledgeProjects(knowledge.projects ?? []);
    setPreferences(knowledge.writingPreferences ?? []);
    setInboxItems(knowledge.inboxItems ?? []);
    setCompanyResearchNotes(knowledge.companyResearchNotes ?? []);
  }, [knowledgeQuery.data]);

  const isBootstrapping = profileLoading || internalProfileQuery.isLoading || knowledgeQuery.isLoading;

  const positioningBullets = useMemo(() => {
    const bullets = [
      basics.headline,
      summary,
      ...preferences
        .filter((item) => item.kind === "positioning" || item.kind === "priority")
        .map((item) => item.instruction),
      ...facts
        .filter((item) => /target|positioning|strength|motivation|authorization|language/i.test(item.title))
        .map((item) => `${item.title}: ${item.detail}`),
    ]
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(bullets)).slice(0, 5);
  }, [basics.headline, facts, preferences, summary]);

  const evidenceHighlights = useMemo(() => {
    const fromKnowledgeProjects = knowledgeProjects.map((item) => ({
      title: item.name,
      body: item.summary,
      source: item.role || "Knowledge project",
    }));
    const fromExperience = experience.map((item) => ({
      title: `${item.position || "Role"} · ${item.company || "Experience"}`,
      body: item.summary,
      source: item.date || "Experience",
    }));
    return [...fromKnowledgeProjects, ...fromExperience]
      .filter((item) => item.title.trim() || item.body.trim())
      .slice(0, 6);
  }, [experience, knowledgeProjects]);

  const guardrails = useMemo(() => {
    const fromPrefs = preferences
      .filter((item) => item.kind === "guardrail" || item.kind === "phrase")
      .map((item) => item.instruction);
    const fromFacts = facts
      .filter((item) => /guardrail|avoid|do not|overclaim/i.test(item.title + item.detail))
      .map((item) => item.detail);
    return Array.from(new Set([...fromPrefs, ...fromFacts])).slice(0, 6);
  }, [facts, preferences]);

  const recentAdditions = useMemo(
    () =>
      [...inboxItems]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [inboxItems],
  );

  const themeScores = useMemo(
    () =>
      collectThemeScores([
        basics.headline,
        summary,
        ...facts.flatMap((item) => [item.title, item.detail]),
        ...knowledgeProjects.flatMap((item) => [item.name, item.summary, item.keywords.join(" ")]),
        ...preferences.flatMap((item) => [item.label, item.instruction]),
      ]),
    [basics.headline, facts, knowledgeProjects, preferences, summary],
  );

  const pendingInboxItems = useMemo(
    () => inboxItems.filter((item) => item.status === "pending"),
    [inboxItems],
  );

  const activeKnowledgeBase = useMemo<CandidateKnowledgeBase>(
    () => ({
      personalFacts: facts
        .filter((item) => item.title.trim() || item.detail.trim())
        .map((item) => ({
          id: item.id || createId("fact"),
          title: item.title.trim(),
          detail: item.detail.trim(),
        })),
      projects: knowledgeProjects
        .filter((item) => item.name.trim() || item.summary.trim())
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          summary: item.summary.trim(),
          keywords: item.keywords.map((keyword) => keyword.trim()).filter(Boolean),
          role: item.role?.trim() || null,
          impact: item.impact?.trim() || null,
        })),
      companyResearchNotes,
      writingPreferences: preferences
        .filter((item) => item.label.trim() || item.instruction.trim())
        .map((item) => ({
          ...item,
          label: item.label.trim(),
          instruction: item.instruction.trim(),
        })),
      inboxItems,
    }),
    [companyResearchNotes, facts, inboxItems, knowledgeProjects, preferences],
  );

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const nextProfile = formToProfile({
        basics,
        summary,
        skills,
        experience,
        canonicalProjects,
      });
      await Promise.all([
        api.saveInternalProfile(nextProfile),
        api.saveCandidateKnowledgeBase(activeKnowledgeBase),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.profile.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.profile.knowledge() }),
      ]);
      toast.success("Ghostwriter Memory Studio saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile hub");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshBase = async () => {
    try {
      setIsRefreshingBase(true);
      const refreshed = await api.refreshProfile();
      setBasics({
        name: asText(refreshed.basics?.name),
        headline: asText(refreshed.basics?.headline ?? refreshed.basics?.label),
        email: asText(refreshed.basics?.email),
        phone: asText(refreshed.basics?.phone),
        locationCity: asText(refreshed.basics?.location?.city),
        locationRegion: asText(refreshed.basics?.location?.region),
        url: asText(refreshed.basics?.url),
      });
      setSummary(asText(refreshed.sections?.summary?.content ?? refreshed.basics?.summary));
      setSkills(profileToSkillForm(refreshed));
      setExperience(profileToExperienceForm(refreshed));
      setCanonicalProjects(profileToCanonicalProjectForm(refreshed));
      toast.success("Pulled the latest base resume into the studio");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh base resume");
    } finally {
      setIsRefreshingBase(false);
    }
  };

  const addCaptureToInbox = async () => {
    const trimmed = captureText.trim();
    if (!trimmed) {
      toast.error("Paste a project note, work update, or writing preference first");
      return;
    }

    try {
      setIsDigestingCapture(true);
      const result = await api.ingestProfileKnowledgeCapture({
        rawText: trimmed,
        sourceLabel: captureSource || null,
      });
      setInboxItems((current) => [...result.items, ...current]);
      setCaptureText("");
      setCaptureSource("");
      toast.success(
        `Added ${result.items.length} item${result.items.length === 1 ? "" : "s"} via ${
          result.mode === "llm" ? "AI ingestion" : "fallback digest"
        }`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to ingest capture");
    } finally {
      setIsDigestingCapture(false);
    }
  };

  const importBundle = () => {
    try {
      const parsed = JSON.parse(importText) as {
        profile?: ResumeProfile;
        knowledgeBase?: CandidateKnowledgeBase;
      };
      if (parsed.profile) {
        setBasics({
          name: asText(parsed.profile.basics?.name),
          headline: asText(parsed.profile.basics?.headline ?? parsed.profile.basics?.label),
          email: asText(parsed.profile.basics?.email),
          phone: asText(parsed.profile.basics?.phone),
          locationCity: asText(parsed.profile.basics?.location?.city),
          locationRegion: asText(parsed.profile.basics?.location?.region),
          url: asText(parsed.profile.basics?.url),
        });
        setSummary(
          asText(parsed.profile.sections?.summary?.content ?? parsed.profile.basics?.summary),
        );
        setSkills(profileToSkillForm(parsed.profile));
        setExperience(profileToExperienceForm(parsed.profile));
        setCanonicalProjects(profileToCanonicalProjectForm(parsed.profile));
      }
      if (parsed.knowledgeBase) {
        setFacts(
          (parsed.knowledgeBase.personalFacts ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            detail: item.detail,
          })),
        );
        setKnowledgeProjects(parsed.knowledgeBase.projects ?? []);
        setPreferences(parsed.knowledgeBase.writingPreferences ?? []);
        setInboxItems(parsed.knowledgeBase.inboxItems ?? []);
        setCompanyResearchNotes(parsed.knowledgeBase.companyResearchNotes ?? []);
      }
      setImportText("");
      toast.success("Imported studio JSON into the current draft");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON import");
    }
  };

  const downloadBundle = () => {
    const bundle = {
      profile: formToProfile({
        basics,
        summary,
        skills,
        experience,
        canonicalProjects,
      }),
      knowledgeBase: activeKnowledgeBase,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ghostwriter-memory-studio.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const acceptInboxItem = (
    item: CandidateKnowledgeInboxItem,
    target: "project" | "fact" | "preference",
  ) => {
    if (target === "project") {
      setKnowledgeProjects((current) => [inboxItemToProject(item), ...current]);
    } else if (target === "fact") {
      setFacts((current) => [inboxItemToFact(item), ...current]);
    } else {
      setPreferences((current) => [inboxItemToPreference(item), ...current]);
    }
    setInboxItems((current) => updateInboxStatus(current, item.id, "accepted"));
    toast.success(`Accepted into ${target === "project" ? "evidence projects" : target}`);
  };

  const archiveInboxItem = (id: string) => {
    setInboxItems((current) => updateInboxStatus(current, id, "archived"));
  };

  const addQuickRule = () => {
    const instruction = quickRule.trim();
    if (!instruction) return;
    setPreferences((current) => [
      {
        id: createId("preference"),
        label: firstSentence(instruction).slice(0, 80),
        instruction,
        kind: /avoid|do not|don't|never|without/i.test(instruction)
          ? "guardrail"
          : "positioning",
        strength: /must|always|never|do not|don't/i.test(instruction)
          ? "strong"
          : "normal",
      },
      ...current,
    ]);
    setQuickRule("");
    toast.success("Added a ghostwriter feedback rule");
  };

  if (isBootstrapping) {
    return (
      <>
        <PageHeader
          icon={ContactRound}
          title="Ghostwriter Memory Studio"
          subtitle="Loading your profile, evidence, and ghostwriter memory"
          badge="Phase 1–3"
        />
        <PageMain>
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Ghostwriter Memory Studio…
            </div>
          </div>
        </PageMain>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={ContactRound}
        title="Ghostwriter Memory Studio"
        subtitle="Visualize what Ghostwriter knows, ingest new evidence, and tune how it writes about you"
        badge="Phase 1–3"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadBundle}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshBase}
              disabled={isRefreshingBase}
            >
              {isRefreshingBase ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Pull base resume
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save studio
            </Button>
          </div>
        }
      />

      <PageMain className="bg-[#070b13] text-white">
        <div className="space-y-8">
          <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px] opacity-20" />
            <div className="relative grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="space-y-5">
                <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/10">
                  Ghostwriter-first profile management
                </Badge>
                <div className="space-y-3">
                  <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Make Ghostwriter’s internal model of you editable, inspectable,
                    and easy to evolve.
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-white/65 sm:text-lg">
                    This studio merges three jobs in one place: your canonical profile,
                    an evidence inbox for raw updates, and a visible Ghostwriter brain
                    that shows fit themes, guardrails, and active writing rules.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <OverviewStatCard
                    label="Canonical assets"
                    value={String(skills.length + experience.length + canonicalProjects.length)}
                    hint="Skills, experience, and core projects in the editable profile"
                  />
                  <OverviewStatCard
                    label="Evidence library"
                    value={String(knowledgeProjects.length + facts.length)}
                    hint="Projects and facts Ghostwriter can cite as proof"
                  />
                  <OverviewStatCard
                    label="Pending inbox"
                    value={String(pendingInboxItems.length)}
                    hint="Raw updates waiting to be promoted into memory"
                  />
                  <OverviewStatCard
                    label="Writing rules"
                    value={String(preferences.length)}
                    hint="Tone, positioning, and guardrails shaping Ghostwriter output"
                  />
                </div>
              </div>

              <Card className="border-white/10 bg-black/25 shadow-none backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Brain className="h-5 w-5 text-emerald-300" />
                    Current understanding snapshot
                  </CardTitle>
                  <CardDescription className="text-white/55">
                    The live summary Ghostwriter would use if it wrote for you now.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                      Current positioning
                    </div>
                    <div className="mt-2 text-base font-medium text-white">
                      {basics.headline || "No headline yet — add one in Canonical Profile."}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                      Top fit themes
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {themeScores.length ? (
                        themeScores.map((item) => (
                          <Badge key={item.label} className={toneBadgeClass(item.tone)}>
                            {item.label}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline" className="border-white/10 text-white/55">
                          Add profile and evidence to reveal top themes
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                      Primary guardrail
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-white/70">
                      {guardrails[0] ||
                        "No explicit guardrail yet. Add one in Ghostwriter Brain or Writing Rules."}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 md:grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="inbox">Evidence Inbox</TabsTrigger>
              <TabsTrigger value="library">Projects & Rules</TabsTrigger>
              <TabsTrigger value="brain">Ghostwriter Brain</TabsTrigger>
              <TabsTrigger value="canonical">Canonical Profile</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <Card className="border-white/10 bg-white/[0.03] shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Sparkles className="h-5 w-5 text-emerald-300" />
                      Understanding map
                    </CardTitle>
                    <CardDescription className="text-white/55">
                      The visible model Ghostwriter is currently using for fit, tone,
                      and evidence selection.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                        Positioning pillars
                      </div>
                      <div className="mt-3 grid gap-3">
                        {positioningBullets.length ? (
                          positioningBullets.map((item) => (
                            <div
                              key={item}
                              className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/75"
                            >
                              {item}
                            </div>
                          ))
                        ) : (
                          <EmptyState
                            title="No positioning yet"
                            description="Add a headline, summary, or positioning rule to define how Ghostwriter should introduce you."
                          />
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                        Strongest evidence on deck
                      </div>
                      <div className="mt-3 space-y-3">
                        {evidenceHighlights.length ? (
                          evidenceHighlights.map((item) => (
                            <div
                              key={`${item.title}-${item.source}`}
                              className="rounded-2xl border border-white/10 bg-black/20 p-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-medium text-white">{item.title}</div>
                                <Badge variant="outline" className="border-white/10 text-white/55">
                                  {item.source}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-white/65">
                                {item.body}
                              </p>
                            </div>
                          ))
                        ) : (
                          <EmptyState
                            title="No evidence loaded"
                            description="Drop project notes into the inbox or add experience entries to give Ghostwriter concrete proof points."
                          />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Shield className="h-5 w-5 text-rose-300" />
                        Guardrails and claims to avoid
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {guardrails.length ? (
                        guardrails.map((item) => (
                          <div
                            key={item}
                            className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4 text-sm leading-6 text-rose-100/90"
                          >
                            {item}
                          </div>
                        ))
                      ) : (
                        <EmptyState
                          title="No explicit guardrails yet"
                          description="Add preferences like ‘do not overclaim senior ownership’ so Ghostwriter stays inside safe boundaries."
                        />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Lightbulb className="h-5 w-5 text-sky-300" />
                        Recent additions
                      </CardTitle>
                      <CardDescription className="text-white/55">
                        New material flowing into the studio, including accepted and pending inbox items.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {recentAdditions.length ? (
                        recentAdditions.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-white/10 bg-black/20 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium text-white">{item.title}</div>
                              <Badge variant="outline" className="border-white/10 text-white/55">
                                {item.kind}
                              </Badge>
                              <Badge variant="outline" className="border-white/10 text-white/45">
                                {item.status}
                              </Badge>
                              <span className="text-xs text-white/40">
                                {formatRelativeDate(item.updatedAt)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-white/65">
                              {item.summary}
                            </p>
                          </div>
                        ))
                      ) : (
                        <EmptyState
                          title="No recent memory updates"
                          description="Use the Evidence Inbox to drop in new projects, wins, or writing preferences."
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="inbox" className="space-y-6">
              <SectionIntro
                title="Evidence Inbox"
                description="Paste raw notes, project writeups, JD fragments, or personal preferences. The studio digests them into draft evidence items you can accept into projects, facts, or writing rules."
                action={
                  <Badge className="border-white/10 bg-white/[0.04] text-white/65">
                    Pending {pendingInboxItems.length}
                  </Badge>
                }
              />

              <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <Card className="border-white/10 bg-white/[0.03] shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Wand2 className="h-5 w-5 text-emerald-300" />
                      Digest new material
                    </CardTitle>
                    <CardDescription className="text-white/55">
                      Drop anything here — recent project notes, rough bullets, or ‘Ghostwriter should…’ instructions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      value={captureSource}
                      onChange={(event) => setCaptureSource(event.target.value)}
                      placeholder="Source label (optional): JD, GitHub README, meeting notes, self-note"
                      className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
                    />
                    <Textarea
                      value={captureText}
                      onChange={(event) => setCaptureText(event.target.value)}
                      placeholder="Example: I recently built a route-planning simulator in Python + OR-Tools with rolling-horizon replanning, service windows, and capacity constraints…"
                      className="min-h-[220px] border-white/10 bg-black/20 text-white placeholder:text-white/30"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={addCaptureToInbox} disabled={isDigestingCapture}>
                        {isDigestingCapture ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="mr-2 h-4 w-4" />
                        )}
                        {isDigestingCapture ? "Digesting with AI…" : "Digest with AI"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCaptureText(
                            "I recently built a rolling-horizon route-planning simulator in Python and OR-Tools. It models assignment, routing, service windows, and repeated replanning under changing demand. I want Ghostwriter to use this as strong evidence for planning-heavy and logistics analytics roles.",
                          );
                          setCaptureSource("quick template");
                        }}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Load example
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/[0.03] shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Upload className="h-5 w-5 text-sky-300" />
                      Import studio JSON
                    </CardTitle>
                    <CardDescription className="text-white/55">
                      Bring in a previously exported memory studio snapshot to merge or replace your current draft.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={importText}
                      onChange={(event) => setImportText(event.target.value)}
                      placeholder='Paste JSON shaped like { "profile": { ... }, "knowledgeBase": { ... } }'
                      className="min-h-[220px] border-white/10 bg-black/20 text-white placeholder:text-white/30"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={importBundle}>
                        <Upload className="mr-2 h-4 w-4" />
                        Import JSON
                      </Button>
                      <Button variant="outline" onClick={downloadBundle}>
                        <Download className="mr-2 h-4 w-4" />
                        Export current draft
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-white/10 bg-white/[0.03] shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <FolderKanban className="h-5 w-5 text-amber-300" />
                    Pending inbox items
                  </CardTitle>
                  <CardDescription className="text-white/55">
                    Accept each item into the right memory layer instead of manually retyping it.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingInboxItems.length ? (
                    <Accordion type="multiple" className="space-y-3">
                      {pendingInboxItems.map((item) => (
                        <AccordionItem
                          key={item.id}
                          value={item.id}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4"
                        >
                          <AccordionTrigger className="py-4 text-left hover:no-underline">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-white">{item.title}</span>
                                <Badge variant="outline" className="border-white/10 text-white/55">
                                  {item.kind}
                                </Badge>
                                <Badge variant="outline" className="border-white/10 text-white/45">
                                  {item.confidence ?? "medium"} confidence
                                </Badge>
                                {item.sourceLabel ? (
                                  <Badge variant="outline" className="border-white/10 text-white/45">
                                    {item.sourceLabel}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-white/55">
                                {item.summary}
                              </p>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-4 pb-4">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/70">
                              {item.rawText}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.tags.map((tag) => (
                                <Badge key={tag} className="border-white/10 bg-white/[0.04] text-white/65">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                            {item.suggestedProject ? (
                              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-sm">
                                <div className="font-medium text-emerald-200">Suggested project</div>
                                <div className="mt-2 text-white">{item.suggestedProject.name}</div>
                                <p className="mt-2 leading-6 text-white/70">{item.suggestedProject.summary}</p>
                                {item.suggestedProject.roleRelevance ? (
                                  <p className="mt-2 text-white/55">
                                    <span className="text-white/75">Role relevance:</span> {item.suggestedProject.roleRelevance}
                                  </p>
                                ) : null}
                                {item.suggestedProject.impact ? (
                                  <p className="mt-1 text-white/55">
                                    <span className="text-white/75">Impact:</span> {item.suggestedProject.impact}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {item.suggestedFact ? (
                              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/5 p-4 text-sm">
                                <div className="font-medium text-sky-200">Suggested fact</div>
                                <div className="mt-2 text-white">{item.suggestedFact.title}</div>
                                <p className="mt-2 leading-6 text-white/70">{item.suggestedFact.detail}</p>
                              </div>
                            ) : null}
                            {item.suggestedPreference ? (
                              <div className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 text-sm">
                                <div className="font-medium text-violet-200">Suggested writing rule</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Badge variant="outline" className="border-white/10 text-white/55">
                                    {item.suggestedPreference.kind}
                                  </Badge>
                                  <Badge variant="outline" className="border-white/10 text-white/45">
                                    {item.suggestedPreference.strength}
                                  </Badge>
                                </div>
                                <div className="mt-2 text-white">{item.suggestedPreference.label}</div>
                                <p className="mt-2 leading-6 text-white/70">{item.suggestedPreference.instruction}</p>
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" onClick={() => acceptInboxItem(item, "project")}>
                                <Check className="mr-2 h-4 w-4" />
                                Accept as project
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acceptInboxItem(item, "fact")}
                              >
                                Accept as fact
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => acceptInboxItem(item, "preference")}
                              >
                                Accept as rule
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => archiveInboxItem(item.id)}
                              >
                                Archive
                              </Button>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  ) : (
                    <EmptyState
                      title="Inbox is clear"
                      description="Drop in new project notes, wins, or writing corrections and they will appear here for triage."
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="library" className="space-y-6">
              <SectionIntro
                title="Projects, facts, and writing rules"
                description="This is the reusable evidence library behind Ghostwriter. Keep canonical resume content separate from higher-signal evidence and long-term writing preferences."
              />

              <div className="grid gap-6 xl:grid-cols-3">
                <Card className="border-white/10 bg-white/[0.03] shadow-none xl:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-white">Evidence projects library</CardTitle>
                    <CardDescription className="text-white/55">
                      Add richer proof objects here than what a resume can usually hold.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {knowledgeProjects.map((project, index) => (
                      <div key={project.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="font-medium text-white">Project {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setKnowledgeProjects((current) =>
                                current.filter((item) => item.id !== project.id),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            value={project.name}
                            onChange={(event) =>
                              setKnowledgeProjects((current) =>
                                current.map((item) =>
                                  item.id === project.id
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Project name"
                            className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          />
                          <Input
                            value={project.role ?? ""}
                            onChange={(event) =>
                              setKnowledgeProjects((current) =>
                                current.map((item) =>
                                  item.id === project.id
                                    ? { ...item, role: event.target.value || null }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Role in project"
                            className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          />
                        </div>
                        <Textarea
                          value={project.summary}
                          onChange={(event) =>
                            setKnowledgeProjects((current) =>
                              current.map((item) =>
                                item.id === project.id
                                  ? { ...item, summary: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="What was built, changed, or proved?"
                          className="mt-3 min-h-[110px] border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                        />
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <Input
                            value={project.keywords.join(", ")}
                            onChange={(event) =>
                              setKnowledgeProjects((current) =>
                                current.map((item) =>
                                  item.id === project.id
                                    ? {
                                        ...item,
                                        keywords: event.target.value
                                          .split(",")
                                          .map((token) => token.trim())
                                          .filter(Boolean),
                                      }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Keywords"
                            className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          />
                          <Input
                            value={project.impact ?? ""}
                            onChange={(event) =>
                              setKnowledgeProjects((current) =>
                                current.map((item) =>
                                  item.id === project.id
                                    ? { ...item, impact: event.target.value || null }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Impact / why it matters"
                            className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() =>
                        setKnowledgeProjects((current) => [
                          {
                            id: createId("knowledge-project"),
                            name: "",
                            summary: "",
                            keywords: [],
                            role: null,
                            impact: null,
                          },
                          ...current,
                        ])
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add evidence project
                    </Button>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="text-white">Personal facts</CardTitle>
                      <CardDescription className="text-white/55">
                        Stable truths Ghostwriter can lean on repeatedly.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {facts.map((fact) => (
                        <div key={fact.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <Input
                              value={fact.title}
                              onChange={(event) =>
                                setFacts((current) =>
                                  current.map((item) =>
                                    item.id === fact.id
                                      ? { ...item, title: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="Fact title"
                              className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setFacts((current) => current.filter((item) => item.id !== fact.id))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <Textarea
                            value={fact.detail}
                            onChange={(event) =>
                              setFacts((current) =>
                                current.map((item) =>
                                  item.id === fact.id
                                    ? { ...item, detail: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="What should Ghostwriter remember?"
                            className="min-h-[90px] border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          />
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        onClick={() =>
                          setFacts((current) => [
                            { id: createId("fact"), title: "", detail: "" },
                            ...current,
                          ])
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add fact
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="text-white">Writing rules</CardTitle>
                      <CardDescription className="text-white/55">
                        Long-lived tone, positioning, and anti-overclaim rules.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {preferences.map((preference) => (
                        <div
                          key={preference.id}
                          className="rounded-2xl border border-white/10 bg-black/20 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <Input
                              value={preference.label}
                              onChange={(event) =>
                                setPreferences((current) =>
                                  current.map((item) =>
                                    item.id === preference.id
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="Rule label"
                              className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setPreferences((current) =>
                                  current.filter((item) => item.id !== preference.id),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="mb-3 grid gap-3 grid-cols-2">
                            <select
                              value={preference.kind}
                              onChange={(event) =>
                                setPreferences((current) =>
                                  current.map((item) =>
                                    item.id === preference.id
                                      ? {
                                          ...item,
                                          kind: event.target.value as PreferenceFormItem["kind"],
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="h-10 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white"
                            >
                              <option value="tone">tone</option>
                              <option value="positioning">positioning</option>
                              <option value="guardrail">guardrail</option>
                              <option value="phrase">phrase</option>
                              <option value="priority">priority</option>
                            </select>
                            <select
                              value={preference.strength}
                              onChange={(event) =>
                                setPreferences((current) =>
                                  current.map((item) =>
                                    item.id === preference.id
                                      ? {
                                          ...item,
                                          strength: event.target.value as PreferenceFormItem["strength"],
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="h-10 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-white"
                            >
                              <option value="normal">normal</option>
                              <option value="strong">strong</option>
                            </select>
                          </div>
                          <Textarea
                            value={preference.instruction}
                            onChange={(event) =>
                              setPreferences((current) =>
                                current.map((item) =>
                                  item.id === preference.id
                                    ? { ...item, instruction: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            placeholder="Example: Position me as planning-heavy and practical; do not overclaim direct ownership."
                            className="min-h-[90px] border-white/10 bg-white/[0.03] text-white placeholder:text-white/30"
                          />
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        onClick={() =>
                          setPreferences((current) => [
                            {
                              id: createId("preference"),
                              label: "",
                              instruction: "",
                              kind: "positioning",
                              strength: "normal",
                            },
                            ...current,
                          ])
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add writing rule
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="brain" className="space-y-6">
              <SectionIntro
                title="Ghostwriter Brain"
                description="A visible explanation layer for why Ghostwriter writes the way it does. Use this to audit the model, correct it quickly, and add long-term feedback rules."
              />

              <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
                <Card className="border-white/10 bg-white/[0.03] shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Brain className="h-5 w-5 text-emerald-300" />
                      Why Ghostwriter thinks this
                    </CardTitle>
                    <CardDescription className="text-white/55">
                      Derived from your headline, evidence projects, personal facts, and active rules.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                        Top inferred strengths
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {themeScores.length ? (
                          themeScores.map((item) => (
                            <Badge key={item.label} className={toneBadgeClass(item.tone)}>
                              {item.label} · {item.score}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="border-white/10 text-white/55">
                            No clear theme detected yet
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <Star className="h-4 w-4 text-amber-300" />
                          Evidence Ghostwriter is likely to reach for
                        </div>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-white/65">
                          {evidenceHighlights.slice(0, 4).map((item) => (
                            <li key={item.title}>• {item.title}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <Shield className="h-4 w-4 text-rose-300" />
                          Claims intentionally down-ranked
                        </div>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-white/65">
                          {(guardrails.length ? guardrails : ["Add a guardrail to make weak claims visible here."]).map(
                            (item) => (
                              <li key={item}>• {item}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <ChevronsUpDown className="h-4 w-4 text-sky-300" />
                        Recommended angle right now
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/70">
                        {positioningBullets[0] ||
                          "Add a sharper headline or positioning rule to reveal the recommended angle."}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Wand2 className="h-5 w-5 text-violet-300" />
                        Fast feedback loop
                      </CardTitle>
                      <CardDescription className="text-white/55">
                        When Ghostwriter writes something off-key, encode the correction here as a durable rule.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Textarea
                        value={quickRule}
                        onChange={(event) => setQuickRule(event.target.value)}
                        placeholder="Example: For medtech roles, position me as a junior analytical process/tool-support candidate, not as someone who already owns validated systems."
                        className="min-h-[130px] border-white/10 bg-black/20 text-white placeholder:text-white/30"
                      />
                      <Button onClick={addQuickRule}>
                        <Plus className="mr-2 h-4 w-4" />
                        Save as feedback rule
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="text-white">Rule stack preview</CardTitle>
                      <CardDescription className="text-white/55">
                        The highest-priority writing instructions active today.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {preferences.slice(0, 6).map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-white/10 bg-black/20 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-white">{item.label}</div>
                            <Badge variant="outline" className="border-white/10 text-white/55">
                              {item.kind}
                            </Badge>
                            <Badge variant="outline" className="border-white/10 text-white/45">
                              {item.strength}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-white/65">
                            {item.instruction}
                          </p>
                        </div>
                      ))}
                      {!preferences.length ? (
                        <EmptyState
                          title="No active rules yet"
                          description="Add feedback rules here or accept preference items from the inbox."
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="canonical" className="space-y-6">
              <SectionIntro
                title="Canonical profile"
                description="This is your editable source-of-truth profile. Keep it clean and stable; use the evidence library for richer details that do not belong in the core resume."
              />

              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <Card className="border-white/10 bg-white/[0.03] shadow-none">
                  <CardHeader>
                    <CardTitle className="text-white">Basics and summary</CardTitle>
                    <CardDescription className="text-white/55">
                      Canonical identity fields used across applications and PDF generation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input value={basics.name} onChange={(e) => setBasics((c) => ({ ...c, name: e.target.value }))} placeholder="Name" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                    <Input value={basics.headline} onChange={(e) => setBasics((c) => ({ ...c, headline: e.target.value }))} placeholder="Headline" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input value={basics.email} onChange={(e) => setBasics((c) => ({ ...c, email: e.target.value }))} placeholder="Email" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                      <Input value={basics.phone} onChange={(e) => setBasics((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input value={basics.locationCity} onChange={(e) => setBasics((c) => ({ ...c, locationCity: e.target.value }))} placeholder="City" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                      <Input value={basics.locationRegion} onChange={(e) => setBasics((c) => ({ ...c, locationRegion: e.target.value }))} placeholder="Region" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                    </div>
                    <Input value={basics.url} onChange={(e) => setBasics((c) => ({ ...c, url: e.target.value }))} placeholder="Primary URL" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                    <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Canonical summary" className="min-h-[180px] border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="text-white">Skills</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {skills.map((skill) => (
                        <div key={skill.id} className="grid gap-3 md:grid-cols-[0.9fr_1.1fr_auto]">
                          <Input value={skill.name} onChange={(e) => setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, name: e.target.value } : item))} placeholder="Skill name" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                          <Input value={skill.keywordsText} onChange={(e) => setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, keywordsText: e.target.value } : item))} placeholder="Keywords" className="border-white/10 bg-black/20 text-white placeholder:text-white/30" />
                          <Button variant="ghost" size="icon" onClick={() => setSkills((current) => current.filter((item) => item.id !== skill.id))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      <Button variant="outline" onClick={() => setSkills((current) => [{ id: createId("skill"), name: "", keywordsText: "" }, ...current])}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add skill
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-white/10 bg-white/[0.03] shadow-none">
                    <CardHeader>
                      <CardTitle className="text-white">Experience and canonical projects</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {experience.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="mb-3 grid gap-3 md:grid-cols-2">
                            <Input value={item.company} onChange={(e) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, company: e.target.value } : entry))} placeholder="Company" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                            <Input value={item.position} onChange={(e) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, position: e.target.value } : entry))} placeholder="Position" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                          </div>
                          <div className="mb-3 grid gap-3 md:grid-cols-2">
                            <Input value={item.location} onChange={(e) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, location: e.target.value } : entry))} placeholder="Location" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                            <Input value={item.date} onChange={(e) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, date: e.target.value } : entry))} placeholder="Date range" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                          </div>
                          <Textarea value={item.summary} onChange={(e) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, summary: e.target.value } : entry))} placeholder="Experience summary" className="min-h-[90px] border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                          <div className="mt-3 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setExperience((current) => current.filter((entry) => entry.id !== item.id))}>Remove</Button>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" onClick={() => setExperience((current) => [{ id: createId("experience"), company: "", position: "", location: "", date: "", summary: "" }, ...current])}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add experience
                      </Button>

                      <div className="my-2 h-px bg-white/10" />

                      {canonicalProjects.map((project) => (
                        <div key={project.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="mb-3 grid gap-3 md:grid-cols-2">
                            <Input value={project.name} onChange={(e) => setCanonicalProjects((current) => current.map((item) => item.id === project.id ? { ...item, name: e.target.value } : item))} placeholder="Project name" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                            <Input value={project.date} onChange={(e) => setCanonicalProjects((current) => current.map((item) => item.id === project.id ? { ...item, date: e.target.value } : item))} placeholder="Date" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                          </div>
                          <Textarea value={project.summary} onChange={(e) => setCanonicalProjects((current) => current.map((item) => item.id === project.id ? { ...item, summary: e.target.value } : item))} placeholder="Project summary" className="min-h-[90px] border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <Input value={project.keywordsText} onChange={(e) => setCanonicalProjects((current) => current.map((item) => item.id === project.id ? { ...item, keywordsText: e.target.value } : item))} placeholder="Keywords" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                            <Input value={project.url} onChange={(e) => setCanonicalProjects((current) => current.map((item) => item.id === project.id ? { ...item, url: e.target.value } : item))} placeholder="URL" className="border-white/10 bg-white/[0.03] text-white placeholder:text-white/30" />
                          </div>
                          <div className="mt-3 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setCanonicalProjects((current) => current.filter((item) => item.id !== project.id))}>Remove</Button>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" onClick={() => setCanonicalProjects((current) => [{ id: createId("project"), name: "", date: "", summary: "", keywordsText: "", url: "" }, ...current])}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add canonical project
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </PageMain>
    </>
  );
};
