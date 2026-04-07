import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { useProfile } from "@client/hooks/useProfile";
import { queryKeys } from "@client/lib/queryKeys";
import type {
  CandidateKnowledgeBase,
  LocalProjectCandidate,
  LocalProjectSource,
  ResumeProfile,
} from "@shared/types";
import { FIXED_FACT_SLOTS } from "./profile-hub/constants";
import { FixedFactSlotsSection } from "./profile-hub/FixedFactSlotsSection";
import { AdvancedProfileAccordions } from "./profile-hub/AdvancedProfileAccordions";
import { ProfileHubHeaderActions } from "./profile-hub/ProfileHubHeaderActions";
import { useProfileBundleIO } from "./profile-hub/useProfileBundleIO";
import {
  OverviewStatCard,
  ProfileHubHero,
  ProfileHubSnapshot,
} from "./profile-hub/ProfileHubOverview";
import { ProjectMaterialLibrarySection } from "./profile-hub/ProjectMaterialLibrarySection";
import type {
  ExperienceFormItem,
  FactFormItem,
  FixedFactSlot,
  ProjectFormItem,
  SkillFormItem,
} from "./profile-hub/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserRound } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ImportProfileDialog } from "./profile-hub/ImportProfileDialog";
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
import { Textarea } from "@/components/ui/textarea";


function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function createFormItemId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatLocation(profile: ResumeProfile | null): string {
  if (typeof profile?.basics?.location === "string") {
    return profile.basics.location;
  }
  return [profile?.basics?.location?.city, profile?.basics?.location?.region]
    .filter(Boolean)
    .join(", ");
}

function profileToSkillForm(profile: ResumeProfile | null): SkillFormItem[] {
  return (profile?.sections?.skills?.items ?? []).map((item) => ({
    id: item.id || createFormItemId("skill"),
    name: asText(item.name),
    keywordsText: (item.keywords ?? []).join(", "),
  }));
}

function profileToExperienceForm(
  profile: ResumeProfile | null,
): ExperienceFormItem[] {
  return (profile?.sections?.experience?.items ?? []).map((item) => ({
    id: item.id || createFormItemId("experience"),
    company: asText(item.company),
    position: asText(item.position),
    location: asText(item.location),
    date: asText(item.date ?? (item as { period?: unknown }).period),
    summary: asText(
      item.summary ?? (item as { description?: unknown }).description,
    ),
  }));
}

function profileToProjectForm(
  profile: ResumeProfile | null,
): ProjectFormItem[] {
  return (profile?.sections?.projects?.items ?? []).map((item) => ({
    id: item.id || createFormItemId("project"),
    name: asText(item.name),
    date: asText(item.date ?? (item as { period?: unknown }).period),
    summary: asText(
      item.summary ??
        item.description ??
        (item as { description?: unknown }).description,
    ),
    keywordsText: (item.keywords ?? []).join(", "),
    url: asText(
      item.url ?? (item as { website?: { url?: unknown } }).website?.url,
    ),
  }));
}

function knowledgeToFactForm(
  knowledgeBase: CandidateKnowledgeBase,
): FactFormItem[] {
  return knowledgeBase.personalFacts.map((fact) => ({
    id: fact.id,
    title: fact.title,
    detail: fact.detail,
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
  projects: ProjectFormItem[];
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
      summary: {
        content: args.summary,
      },
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
        items: args.projects
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

function factsToKnowledgeBase(
  facts: FactFormItem[],
  previous: CandidateKnowledgeBase,
): CandidateKnowledgeBase {
  return {
    ...previous,
    personalFacts: facts
      .filter((fact) => fact.title.trim() || fact.detail.trim())
      .map((fact, index) => ({
        id:
          fact.id ||
          previous.personalFacts[index]?.id ||
          createFormItemId("fact"),
        title: fact.title.trim(),
        detail: fact.detail.trim(),
      })),
  };
}

function normalizeFactTitle(title: string): string {
  return title.trim().toLowerCase();
}

function getFixedFactByTitle(title: string): FixedFactSlot | null {
  const normalized = normalizeFactTitle(title);
  return (
    FIXED_FACT_SLOTS.find((slot) => normalizeFactTitle(slot.title) === normalized) ??
    null
  );
}

function getFixedFactValue(facts: FactFormItem[], slot: FixedFactSlot): string {
  return (
    facts.find((fact) => normalizeFactTitle(fact.title) === normalizeFactTitle(slot.title))
      ?.detail ?? ""
  );
}

function upsertFixedFact(
  facts: FactFormItem[],
  slot: FixedFactSlot,
  detail: string,
): FactFormItem[] {
  const normalizedTitle = normalizeFactTitle(slot.title);
  const trimmedDetail = detail.trim();
  const existing = facts.find((fact) => normalizeFactTitle(fact.title) === normalizedTitle);

  if (!trimmedDetail) {
    return facts.filter((fact) => normalizeFactTitle(fact.title) !== normalizedTitle);
  }

  if (existing) {
    return facts.map((fact) =>
      normalizeFactTitle(fact.title) === normalizedTitle
        ? { ...fact, title: slot.title, detail }
        : fact,
    );
  }

  return [...facts, { id: createFormItemId("fact"), title: slot.title, detail }];
}

function isSoftPersonalNote(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return false;

  return [
    "working style",
    "human detail",
    "human detail 2",
    "soft personal note",
    "personality note",
  ].some((keyword) => normalized.includes(keyword));
}

function getCoreFactPriority(title: string): number {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return 999;

  const priorities: Array<[string[], number]> = [
    [["target role", "target roles"], 0],
    [["work authorization", "work authorisation", "visa"], 1],
    [["graduation timeline", "graduation"], 2],
    [["target geography", "location"], 3],
    [["preferred positioning", "positioning"], 4],
    [["core strengths", "strengths"], 5],
    [["tool strengths", "tools"], 6],
    [["education profile", "education"], 7],
    [["languages", "language"], 8],
    [["motivation pattern", "motivation"], 9],
    [["guardrail"], 10],
  ];

  for (const [keywords, priority] of priorities) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return priority;
    }
  }

  return 50;
}

export const ProfileHubPage: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    profile,
    isLoading: effectiveProfileLoading,
    refreshProfile,
  } = useProfile();
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
  const [projects, setProjects] = useState<ProjectFormItem[]>([]);
  const [facts, setFacts] = useState<FactFormItem[]>([]);
  const [knowledgeDraft, setKnowledgeDraft] = useState<CandidateKnowledgeBase>({
    personalFacts: [],
    projects: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [localSourceInput, setLocalSourceInput] = useState("");
  const [isScanningProjects, setIsScanningProjects] = useState(false);
  const [scannedProjects, setScannedProjects] = useState<LocalProjectCandidate[]>([]);

  const internalProfileQuery = useQuery<ResumeProfile>({
    queryKey: [...queryKeys.profile.all, "internal"] as const,
    queryFn: api.getInternalProfile,
  });

  const knowledgeQuery = useQuery<CandidateKnowledgeBase>({
    queryKey: queryKeys.profile.knowledge(),
    queryFn: api.getCandidateKnowledgeBase,
  });

  const localSourcesQuery = useQuery<LocalProjectSource[]>({
    queryKey: [...queryKeys.profile.all, "local-project-sources"] as const,
    queryFn: api.getLocalProjectSources,
  });

  useEffect(() => {
    const source =
      internalProfileQuery.data &&
      Object.keys(internalProfileQuery.data).length > 0
        ? internalProfileQuery.data
        : profile;
    if (!source) return;

    setBasics({
      name: source.basics?.name ?? "",
      headline: source.basics?.headline ?? source.basics?.label ?? "",
      email: source.basics?.email ?? "",
      phone: source.basics?.phone ?? "",
      locationCity: source.basics?.location?.city ?? "",
      locationRegion: source.basics?.location?.region ?? "",
      url: source.basics?.url ?? "",
    });
    setSummary(
      source.sections?.summary?.content ?? source.basics?.summary ?? "",
    );
    setSkills(profileToSkillForm(source));
    setExperience(profileToExperienceForm(source));
    setProjects(profileToProjectForm(source));
  }, [internalProfileQuery.data, profile]);

  useEffect(() => {
    if (!knowledgeQuery.data) return;
    setKnowledgeDraft(knowledgeQuery.data);
    setFacts(knowledgeToFactForm(knowledgeQuery.data));
  }, [knowledgeQuery.data]);

  const currentFormProfile = useMemo(
    () =>
      formToProfile({
        basics,
        summary,
        skills,
        experience,
        projects,
      }),
    [basics, summary, skills, experience, projects],
  );

  const currentKnowledge = useMemo(
    () => factsToKnowledgeBase(facts, knowledgeDraft),
    [facts, knowledgeDraft],
  );
  const groupedFacts = useMemo(
    () => ({
      core: facts
        .filter(
          (fact) =>
            !isSoftPersonalNote(fact.title) && !getFixedFactByTitle(fact.title),
        )
        .map((fact, index) => ({ fact, index }))
        .sort((a, b) => {
          const priorityDelta =
            getCoreFactPriority(a.fact.title) -
            getCoreFactPriority(b.fact.title);
          if (priorityDelta !== 0) return priorityDelta;
          return a.index - b.index;
        })
        .map(({ fact }) => fact),
      soft: facts.filter((fact) => isSoftPersonalNote(fact.title)),
    }),
    [facts],
  );
  const hasInternalProfile =
    Boolean(internalProfileQuery.data) &&
    Object.keys(internalProfileQuery.data ?? {}).length > 0;
  const localProjectSources = localSourcesQuery.data ?? [];
  const curatedProjects = currentKnowledge.projects.filter(
    (project) => !project.activeForDrafting,
  );
  const activeProjects = currentKnowledge.projects.filter(
    (project) => project.activeForDrafting,
  );

  const effectiveSkillTags =
    profile?.sections?.skills?.items?.flatMap((item) =>
      item.keywords?.length ? item.keywords : [item.name],
    ) ?? [];

  const handleRefreshProfile = async () => {
    try {
      await refreshProfile();
      toast.success("Effective profile refreshed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to refresh profile",
      );
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await Promise.all([
        api.saveInternalProfile(currentFormProfile),
        api.saveCandidateKnowledgeBase(currentKnowledge),
      ]);
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
      toast.success("Candidate profile saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save profile",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddLocalProjectSource = async () => {
    const nextPath = localSourceInput.trim();
    if (!nextPath) return;
    try {
      const nextSources = [...localProjectSources, { path: nextPath }];
      await api.saveLocalProjectSources(nextSources);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.profile.all, "local-project-sources"],
      });
      setLocalSourceInput("");
      toast.success("Local project source added");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to add local project source",
      );
    }
  };

  const handleRemoveLocalProjectSource = async (pathToRemove: string) => {
    try {
      await api.saveLocalProjectSources(
        localProjectSources.filter((item) => item.path !== pathToRemove),
      );
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.profile.all, "local-project-sources"],
      });
      toast.success("Local project source removed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove local project source",
      );
    }
  };

  const handleScanLocalProjects = async () => {
    try {
      setIsScanningProjects(true);
      const candidates = await api.scanLocalProjectCandidates();
      setScannedProjects(candidates);
      toast.success(`Scanned ${candidates.length} local project candidates`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to scan local projects",
      );
    } finally {
      setIsScanningProjects(false);
    }
  };

  const handleImportScannedProject = async (project: LocalProjectCandidate) => {
    try {
      await api.saveCandidateKnowledgeBase({
        ...currentKnowledge,
        projects: [
          ...currentKnowledge.projects,
          {
            id: project.id,
            name: project.name,
            summary: project.summary,
            keywords: project.keywords,
            role: project.role,
            impact: project.impact,
            activeForDrafting: false,
          },
        ],
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile.knowledge() });
      toast.success(`Imported ${project.name} into candidate knowledge`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to import project",
      );
    }
  };

  const handleToggleProjectActive = async (projectId: string) => {
    try {
      await api.saveCandidateKnowledgeBase({
        ...currentKnowledge,
        projects: currentKnowledge.projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                activeForDrafting: !project.activeForDrafting,
              }
            : project,
        ),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile.knowledge() });
      toast.success("Drafting project selection updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update project state",
      );
    }
  };

  const handleRemoveKnowledgeProject = async (projectId: string) => {
    try {
      await api.saveCandidateKnowledgeBase({
        ...currentKnowledge,
        projects: currentKnowledge.projects.filter((project) => project.id !== projectId),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile.knowledge() });
      toast.success("Project removed from knowledge");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove project",
      );
    }
  };

  const {
    pendingImportJson,
    setPendingImportJson,
    handleDownloadJson,
    handleImportFile,
    confirmImport,
  } = useProfileBundleIO({
    currentFormProfile,
    currentKnowledge,
    setBasics,
    setSummary,
    setSkills,
    setExperience,
    setProjects,
    setKnowledgeDraft,
    setFacts,
    profileToSkillForm,
    profileToExperienceForm,
    profileToProjectForm,
    knowledgeToFactForm,
  });

  const renderFactEditor = (
    fact: FactFormItem,
    options?: { pinned?: boolean },
  ) => (
    <div
      key={fact.id}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {isSoftPersonalNote(fact.title)
                ? "Soft personal note"
                : "Core fact"}
            </span>
            {options?.pinned ? <Badge variant="outline">Pinned</Badge> : null}
            {isSoftPersonalNote(fact.title) ? (
              <Badge variant="secondary">Soft personal note</Badge>
            ) : null}
          </div>
          <Input
            placeholder="Fact title"
            value={fact.title}
            onChange={(event) =>
              setFacts((current) =>
                current.map((entry) =>
                  entry.id === fact.id
                    ? { ...entry, title: event.target.value }
                    : entry,
                ),
              )
            }
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            setFacts((current) =>
              current.filter((entry) => entry.id !== fact.id),
            )
          }
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        placeholder="Fact detail"
        value={fact.detail}
        onChange={(event) =>
          setFacts((current) =>
            current.map((entry) =>
              entry.id === fact.id
                ? { ...entry, detail: event.target.value }
                : entry,
            ),
          )
        }
        className="min-h-[120px]"
      />
    </div>
  );

  return (
    <>
      <PageHeader
        icon={UserRound}
        title="Profile Hub"
        subtitle="Keep your source profile clean, editable, and ready for AI drafting"
        actions={
          <ProfileHubHeaderActions
            isSaving={isSaving}
            onImportFile={(event) => void handleImportFile(event)}
            onDownloadJson={handleDownloadJson}
            onRefreshProfile={() => void handleRefreshProfile()}
            onSave={() => void handleSave()}
          />
        }
      />

      <PageMain className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OverviewStatCard
            label="Profile Source"
            value={hasInternalProfile ? "Internal" : "Effective"}
            hint={
              hasInternalProfile
                ? "Editing your saved internal source profile"
                : "Showing the fallback effective profile"
            }
          />
          <OverviewStatCard
            label="Signal Facts"
            value={String(facts.filter((fact) => fact.title.trim()).length)}
            hint="Short reusable context blocks for AI drafting"
          />
          <OverviewStatCard
            label="Projects"
            value={String(projects.filter((item) => item.name.trim()).length)}
            hint="Imported proof points and portfolio-ready examples"
          />
          <OverviewStatCard
            label="Experience"
            value={String(
              experience.filter(
                (item) => item.company.trim() || item.position.trim(),
              ).length,
            )}
            hint="Background entries kept for tailoring"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
          <div className="space-y-6">
            <ProfileHubHero
              basics={basics}
              summary={summary}
              onBasicsChange={setBasics}
              onSummaryChange={setSummary}
            />

            <FixedFactSlotsSection
              facts={facts}
              extraFacts={groupedFacts.core}
              softFacts={groupedFacts.soft}
              getFixedFactValue={(slot) => getFixedFactValue(facts, slot)}
              onChangeFixedFact={(slot, value) =>
                setFacts((current) => upsertFixedFact(current, slot, value))
              }
              onAddExtraFact={() =>
                setFacts((current) => [
                  ...current,
                  { id: createFormItemId("fact"), title: "", detail: "" },
                ])
              }
              onAddSoftFact={() =>
                setFacts((current) => [
                  ...current,
                  {
                    id: createFormItemId("fact"),
                    title: "Soft personal note",
                    detail: "",
                  },
                ])
              }
              renderFactEditor={renderFactEditor}
            />

            <ProjectMaterialLibrarySection
              localSourceInput={localSourceInput}
              onLocalSourceInputChange={setLocalSourceInput}
              localProjectSources={localProjectSources}
              scannedProjects={scannedProjects}
              curatedProjects={curatedProjects}
              activeProjects={activeProjects}
              isScanningProjects={isScanningProjects}
              onAddSource={() => void handleAddLocalProjectSource()}
              onRemoveSource={(path) => void handleRemoveLocalProjectSource(path)}
              onScan={() => void handleScanLocalProjects()}
              onImportScannedProject={(project) => void handleImportScannedProject(project)}
              onToggleProjectActive={(projectId) => void handleToggleProjectActive(projectId)}
              onRemoveKnowledgeProject={(projectId) => void handleRemoveKnowledgeProject(projectId)}
            />

            <AdvancedProfileAccordions
              skills={skills}
              experience={experience}
              projects={projects}
              createFormItemId={createFormItemId}
              setSkills={setSkills}
              setExperience={setExperience}
              setProjects={setProjects}
            />
          </div>

          <div className="space-y-6">
            <ProfileHubSnapshot
              effectiveProfileLoading={effectiveProfileLoading}
              profile={profile}
              hasInternalProfile={hasInternalProfile}
              effectiveSkillTags={effectiveSkillTags}
              formatLocation={formatLocation}
            />
          </div>
        </div>
      </PageMain>

      <ImportProfileDialog
        pendingImportJson={pendingImportJson}
        onOpenChange={(open) => !open && setPendingImportJson(null)}
        onConfirm={confirmImport}
      />
    </>
  );
};
