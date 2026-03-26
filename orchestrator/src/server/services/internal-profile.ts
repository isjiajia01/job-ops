import { settingsRegistry } from "@shared/settings-registry";
import type { ResumeProfile } from "@shared/types";
import {
  hasMeaningfulResumeProfile,
  resumeProfileSchema,
} from "@shared/utils/profile";
import * as settingsRepo from "../repositories/settings";

export async function getInternalProfile(): Promise<ResumeProfile | null> {
  const raw = await settingsRepo.getSetting("candidateResumeProfile");
  const parsed =
    settingsRegistry.candidateResumeProfile.parse(raw ?? undefined) ?? null;

  if (!parsed || !hasMeaningfulResumeProfile(parsed)) {
    return null;
  }

  return parsed;
}

export async function saveInternalProfile(
  input: ResumeProfile,
): Promise<ResumeProfile> {
  const normalized = resumeProfileSchema.parse(input) as ResumeProfile;
  await settingsRepo.setSetting(
    "candidateResumeProfile",
    settingsRegistry.candidateResumeProfile.serialize(normalized),
  );
  return normalized;
}
