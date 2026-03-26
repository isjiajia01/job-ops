import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { useProfile } from "@client/hooks/useProfile";
import { queryKeys } from "@client/lib/queryKeys";
import type { CandidateKnowledgeBase, ResumeProfile } from "@shared/types";
import {
  bundleToProfileAndKnowledge,
  candidateProfileBundleSchema,
  profileAndKnowledgeToBundle,
} from "@shared/utils/profile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Import,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type ProjectFormItem = {
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
      .map((fact, _index) => ({
        id:
          fact.id ||
          previous.personalFacts[index]?.id ||
          createFormItemId("fact"),
        title: fact.title.trim(),
        detail: fact.detail.trim(),
      })),
  };
}

export const ProfileHubPage: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    profile,
    isLoading: effectiveProfileLoading,
    refreshProfile,
  } = useProfile();
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(
    null,
  );
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

  const internalProfileQuery = useQuery<ResumeProfile>({
    queryKey: [...queryKeys.profile.all, "internal"] as const,
    queryFn: api.getInternalProfile,
  });

  const knowledgeQuery = useQuery<CandidateKnowledgeBase>({
    queryKey: queryKeys.profile.knowledge(),
    queryFn: api.getCandidateKnowledgeBase,
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

  const handleDownloadJson = () => {
    const bundle = profileAndKnowledgeToBundle(
      currentFormProfile,
      currentKnowledge,
    );
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jobops-candidate-profile.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      candidateProfileBundleSchema.parse(JSON.parse(text));
      setPendingImportJson(text);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to parse JSON file",
      );
    }
  };

  const confirmImport = () => {
    if (!pendingImportJson) return;
    try {
      const bundle = candidateProfileBundleSchema.parse(
        JSON.parse(pendingImportJson),
      );
      const imported = bundleToProfileAndKnowledge(bundle);

      setBasics({
        name: imported.profile.basics?.name ?? "",
        headline:
          imported.profile.basics?.headline ??
          imported.profile.basics?.label ??
          "",
        email: imported.profile.basics?.email ?? "",
        phone: imported.profile.basics?.phone ?? "",
        locationCity: imported.profile.basics?.location?.city ?? "",
        locationRegion: imported.profile.basics?.location?.region ?? "",
        url: imported.profile.basics?.url ?? "",
      });
      setSummary(
        imported.profile.sections?.summary?.content ??
          imported.profile.basics?.summary ??
          "",
      );
      setSkills(profileToSkillForm(imported.profile));
      setExperience(profileToExperienceForm(imported.profile));
      setProjects(profileToProjectForm(imported.profile));
      setKnowledgeDraft((previous) => ({
        ...previous,
        personalFacts: imported.knowledgeBase.personalFacts,
      }));
      setFacts(knowledgeToFactForm(imported.knowledgeBase));
      setPendingImportJson(null);
      toast.success(
        "Imported JSON into the form. Review and click Save to apply it.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to import JSON",
      );
    }
  };

  return (
    <>
      <PageHeader
        icon={UserRound}
        title="Profile Hub"
        subtitle="Internal candidate profile and AI facts"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <Import className="mr-2 h-4 w-4" />
                Upload JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => void handleImportFile(event)}
                />
              </label>
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadJson}>
              <Download className="mr-2 h-4 w-4" />
              Download JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRefreshProfile()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Effective Profile
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              <Save className="mr-2 h-4 w-4" />
              Save Profile
            </Button>
          </div>
        }
      />

      <PageMain className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Full name"
                value={basics.name}
                onChange={(event) =>
                  setBasics((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Headline"
                value={basics.headline}
                onChange={(event) =>
                  setBasics((current) => ({
                    ...current,
                    headline: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Email"
                value={basics.email}
                onChange={(event) =>
                  setBasics((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Phone"
                value={basics.phone}
                onChange={(event) =>
                  setBasics((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="City"
                value={basics.locationCity}
                onChange={(event) =>
                  setBasics((current) => ({
                    ...current,
                    locationCity: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Region / Country"
                value={basics.locationRegion}
                onChange={(event) =>
                  setBasics((current) => ({
                    ...current,
                    locationRegion: event.target.value,
                  }))
                }
              />
              <Input
                className="sm:col-span-2"
                placeholder="Portfolio / LinkedIn URL"
                value={basics.url}
                onChange={(event) =>
                  setBasics((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="min-h-[160px]"
                placeholder="Write the core profile summary that AI and CV generation should use."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Skills</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSkills((current) => [
                    ...current,
                    {
                      id: createFormItemId("skill"),
                      name: "",
                      keywordsText: "",
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Skill Group
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {skills.map((item, _index) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border/60 p-3 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Skill group"
                      value={item.name}
                      onChange={(event) =>
                        setSkills((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setSkills((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Keywords, comma separated"
                    value={item.keywordsText}
                    onChange={(event) =>
                      setSkills((current) =>
                        current.map((entry, _entryIndex) =>
                          entry.id === item.id
                            ? { ...entry, keywordsText: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Experience</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setExperience((current) => [
                    ...current,
                    {
                      id: createFormItemId("experience"),
                      company: "",
                      position: "",
                      location: "",
                      date: "",
                      summary: "",
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Experience
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {experience.map((item, _index) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border/60 p-3 space-y-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Company"
                      value={item.company}
                      onChange={(event) =>
                        setExperience((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, company: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                    <Input
                      placeholder="Position"
                      value={item.position}
                      onChange={(event) =>
                        setExperience((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, position: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                    <Input
                      placeholder="Location"
                      value={item.location}
                      onChange={(event) =>
                        setExperience((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, location: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                    <Input
                      placeholder="Date range"
                      value={item.date}
                      onChange={(event) =>
                        setExperience((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, date: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <Textarea
                    placeholder="Summary / bullets"
                    value={item.summary}
                    onChange={(event) =>
                      setExperience((current) =>
                        current.map((entry, _entryIndex) =>
                          entry.id === item.id
                            ? { ...entry, summary: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className="min-h-[120px]"
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExperience((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        )
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Projects</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setProjects((current) => [
                    ...current,
                    {
                      id: createFormItemId("project"),
                      name: "",
                      date: "",
                      summary: "",
                      keywordsText: "",
                      url: "",
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Project
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.map((item, _index) => (
                <div
                  key={item.id}
                  className="rounded-md border border-border/60 p-3 space-y-3"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Project name"
                      value={item.name}
                      onChange={(event) =>
                        setProjects((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, name: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                    <Input
                      placeholder="Date range"
                      value={item.date}
                      onChange={(event) =>
                        setProjects((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, date: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                    <Input
                      className="sm:col-span-2"
                      placeholder="Project URL, optional"
                      value={item.url}
                      onChange={(event) =>
                        setProjects((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === item.id
                              ? { ...entry, url: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <Textarea
                    placeholder="Project summary"
                    value={item.summary}
                    onChange={(event) =>
                      setProjects((current) =>
                        current.map((entry, _entryIndex) =>
                          entry.id === item.id
                            ? { ...entry, summary: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className="min-h-[120px]"
                  />
                  <Textarea
                    placeholder="Keywords, comma separated"
                    value={item.keywordsText}
                    onChange={(event) =>
                      setProjects((current) =>
                        current.map((entry, _entryIndex) =>
                          entry.id === item.id
                            ? { ...entry, keywordsText: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setProjects((current) =>
                          current.filter((entry) => entry.id !== item.id),
                        )
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Facts</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFacts((current) => [
                    ...current,
                    { id: createFormItemId("fact"), title: "", detail: "" },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Fact
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {facts.map((fact, _index) => (
                <div
                  key={fact.id}
                  className="rounded-md border border-border/60 p-3 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Fact title"
                      value={fact.title}
                      onChange={(event) =>
                        setFacts((current) =>
                          current.map((entry, _entryIndex) =>
                            entry.id === fact.id
                              ? { ...entry, title: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
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
                        current.map((entry, _entryIndex) =>
                          entry.id === fact.id
                            ? { ...entry, detail: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Effective Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {effectiveProfileLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading effective profile...
                </div>
              ) : profile ? (
                <>
                  <div className="space-y-1">
                    <div className="text-lg font-semibold">
                      {profile.basics?.name || "Unnamed profile"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {profile.basics?.headline ||
                        profile.basics?.label ||
                        "No headline"}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {profile.basics?.email ? (
                        <span>{profile.basics.email}</span>
                      ) : null}
                      {profile.basics?.phone ? (
                        <span>{profile.basics.phone}</span>
                      ) : null}
                      {formatLocation(profile) ? (
                        <span>{formatLocation(profile)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm leading-6 text-foreground/90">
                    {profile.sections?.summary?.content ||
                      profile.basics?.summary ||
                      "No summary yet."}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Effective skill tags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        profile.sections?.skills?.items?.flatMap((item) =>
                          item.keywords?.length ? item.keywords : [item.name],
                        ) ?? []
                      )
                        .filter(Boolean)
                        .slice(0, 20)
                        .map((skill) => (
                          <Badge key={skill} variant="secondary">
                            {skill}
                          </Badge>
                        ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No effective profile is available yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Import Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Upload JSON expects a candidate-profile bundle with `basics`,
                `summary`, `skills`, `experience`, `projects`, and `facts`.
              </p>
              <p>
                Importing replaces the form values in this page only. Nothing is
                persisted until you click `Save Profile`.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageMain>

      <AlertDialog
        open={Boolean(pendingImportJson)}
        onOpenChange={(open) => !open && setPendingImportJson(null)}
      >
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Import profile JSON?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current form values with the uploaded JSON.
              It will not overwrite saved data until you click `Save Profile`.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[50vh] overflow-auto rounded-md border border-border/60 bg-muted/20 p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-foreground/90">
              {pendingImportJson}
            </pre>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingImportJson(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>
              Confirm Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
