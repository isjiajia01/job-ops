import * as api from "@client/api";
import type { CandidateKnowledgeBase, ResumeProfile } from "@shared/types";
import {
  bundleToProfileAndKnowledge,
  candidateProfileBundleSchema,
  profileAndKnowledgeToBundle,
} from "@shared/utils/profile";
import { useState } from "react";
import { toast } from "sonner";
import type {
  ExperienceFormItem,
  FactFormItem,
  ProjectFormItem,
  SkillFormItem,
} from "./types";

type Args = {
  currentFormProfile: ResumeProfile;
  currentKnowledge: CandidateKnowledgeBase;
  setBasics: React.Dispatch<
    React.SetStateAction<{
      name: string;
      headline: string;
      email: string;
      phone: string;
      locationCity: string;
      locationRegion: string;
      url: string;
    }>
  >;
  setSummary: React.Dispatch<React.SetStateAction<string>>;
  setSkills: React.Dispatch<React.SetStateAction<SkillFormItem[]>>;
  setExperience: React.Dispatch<React.SetStateAction<ExperienceFormItem[]>>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectFormItem[]>>;
  setKnowledgeDraft: React.Dispatch<React.SetStateAction<CandidateKnowledgeBase>>;
  setFacts: React.Dispatch<React.SetStateAction<FactFormItem[]>>;
  profileToSkillForm: (profile: ResumeProfile | null) => SkillFormItem[];
  profileToExperienceForm: (profile: ResumeProfile | null) => ExperienceFormItem[];
  profileToProjectForm: (profile: ResumeProfile | null) => ProjectFormItem[];
  knowledgeToFactForm: (knowledgeBase: CandidateKnowledgeBase) => FactFormItem[];
};

export function useProfileBundleIO(args: Args) {
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);

  const handleDownloadJson = () => {
    const bundle = profileAndKnowledgeToBundle(
      args.currentFormProfile,
      args.currentKnowledge,
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

      args.setBasics({
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
      args.setSummary(
        imported.profile.sections?.summary?.content ??
          imported.profile.basics?.summary ??
          "",
      );
      args.setSkills(args.profileToSkillForm(imported.profile));
      args.setExperience(args.profileToExperienceForm(imported.profile));
      args.setProjects(args.profileToProjectForm(imported.profile));
      args.setKnowledgeDraft(imported.knowledgeBase);
      args.setFacts(args.knowledgeToFactForm(imported.knowledgeBase));
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

  return {
    pendingImportJson,
    setPendingImportJson,
    handleDownloadJson,
    handleImportFile,
    confirmImport,
  };
}
