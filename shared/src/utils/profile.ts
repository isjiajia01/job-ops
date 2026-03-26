import { z } from "zod";
import type { CandidateKnowledgeBase, ResumeProfile } from "../types";

export const resumeProfileSchema = z
  .object({
    basics: z
      .object({
        name: z.string().optional(),
        label: z.string().optional(),
        image: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        url: z.string().optional(),
        summary: z.string().optional(),
        headline: z.string().optional(),
        location: z
          .object({
            address: z.string().optional(),
            postalCode: z.string().optional(),
            city: z.string().optional(),
            countryCode: z.string().optional(),
            region: z.string().optional(),
          })
          .partial()
          .optional(),
        profiles: z
          .array(
            z
              .object({
                network: z.string().optional(),
                username: z.string().optional(),
                url: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
    sections: z
      .object({
        summary: z
          .object({
            id: z.string().optional(),
            visible: z.boolean().optional(),
            name: z.string().optional(),
            content: z.string().optional(),
          })
          .passthrough()
          .optional(),
        skills: z
          .object({
            id: z.string().optional(),
            visible: z.boolean().optional(),
            name: z.string().optional(),
            items: z
              .array(
                z
                  .object({
                    id: z.string(),
                    name: z.string().optional(),
                    description: z.string().optional(),
                    level: z.number().optional(),
                    keywords: z.array(z.string()).optional(),
                    visible: z.boolean().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
        projects: z
          .object({
            id: z.string().optional(),
            visible: z.boolean().optional(),
            name: z.string().optional(),
            items: z
              .array(
                z
                  .object({
                    id: z.string(),
                    name: z.string().optional(),
                    description: z.string().optional(),
                    date: z.string().optional(),
                    summary: z.string().optional(),
                    visible: z.boolean().optional(),
                    keywords: z.array(z.string()).optional(),
                    url: z.string().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
        experience: z
          .object({
            id: z.string().optional(),
            visible: z.boolean().optional(),
            name: z.string().optional(),
            items: z
              .array(
                z
                  .object({
                    id: z.string(),
                    company: z.string().optional(),
                    position: z.string().optional(),
                    location: z.string().optional(),
                    date: z.string().optional(),
                    summary: z.string().optional(),
                    visible: z.boolean().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown());

export type ResumeProfileInput = z.infer<typeof resumeProfileSchema>;

export function createEmptyResumeProfile(): ResumeProfileInput {
  return {
    basics: {
      name: "",
      headline: "",
      email: "",
      phone: "",
      summary: "",
      location: {
        city: "",
        region: "",
      },
    },
    sections: {
      summary: {
        content: "",
      },
      skills: {
        items: [],
      },
      experience: {
        items: [],
      },
      projects: {
        items: [],
      },
    },
  };
}

export function hasMeaningfulResumeProfile(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const profile = value as {
    basics?: Record<string, unknown>;
    sections?: Record<string, unknown>;
  };

  if (profile.basics && Object.values(profile.basics).some(Boolean)) {
    return true;
  }

  if (!profile.sections) return false;

  for (const section of Object.values(profile.sections)) {
    if (!section || typeof section !== "object") continue;
    if (Object.values(section as Record<string, unknown>).some(Boolean)) {
      return true;
    }
  }

  return false;
}

export const candidateProfileBundleSchema = z.object({
  basics: z
    .object({
      name: z.string().optional(),
      headline: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      summary: z.string().optional(),
      location: z
        .object({
          city: z.string().optional(),
          region: z.string().optional(),
        })
        .partial()
        .optional(),
      url: z.string().optional(),
    })
    .partial()
    .optional(),
  summary: z
    .object({
      content: z.string().optional(),
    })
    .partial()
    .optional(),
  skills: z
    .array(
      z.object({
        name: z.string(),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .optional(),
  experience: z
    .array(
      z.object({
        company: z.string(),
        position: z.string(),
        location: z.string().optional(),
        date: z.string().optional(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        date: z.string().optional(),
        summary: z.string().optional(),
        keywords: z.array(z.string()).default([]),
        url: z.string().optional(),
      }),
    )
    .optional(),
  facts: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
      }),
    )
    .optional(),
});

export type CandidateProfileBundle = z.infer<
  typeof candidateProfileBundleSchema
>;

export function bundleToProfileAndKnowledge(bundle: CandidateProfileBundle): {
  profile: ResumeProfile;
  knowledgeBase: CandidateKnowledgeBase;
} {
  const profile: ResumeProfile = createEmptyResumeProfile() as ResumeProfile;

  profile.basics = {
    ...profile.basics,
    name: bundle.basics?.name ?? "",
    headline: bundle.basics?.headline ?? "",
    email: bundle.basics?.email ?? "",
    phone: bundle.basics?.phone ?? "",
    summary: bundle.basics?.summary ?? "",
    url: bundle.basics?.url ?? "",
    location: {
      city: bundle.basics?.location?.city ?? "",
      region: bundle.basics?.location?.region ?? "",
    },
  };

  profile.sections = {
    ...profile.sections,
    summary: {
      content: bundle.summary?.content ?? bundle.basics?.summary ?? "",
    },
    skills: {
      items: (bundle.skills ?? []).map((skill, index) => ({
        id: `skill-${index + 1}`,
        name: skill.name,
        description: skill.name,
        level: 0,
        keywords: skill.keywords,
        visible: true,
      })),
    },
    experience: {
      items: (bundle.experience ?? []).map((item, index) => ({
        id: `experience-${index + 1}`,
        company: item.company,
        position: item.position,
        location: item.location ?? "",
        date: item.date ?? "",
        summary: item.summary ?? "",
        visible: true,
      })),
    },
    projects: {
      items: (bundle.projects ?? []).map((item, index) => ({
        id: `project-${index + 1}`,
        name: item.name,
        description: item.summary ?? "",
        date: item.date ?? "",
        summary: item.summary ?? "",
        visible: true,
        keywords: item.keywords,
        url: item.url ?? "",
      })),
    },
  };

  const knowledgeBase: CandidateKnowledgeBase = {
    personalFacts: (bundle.facts ?? []).map((fact, index) => ({
      id: `fact-${index + 1}`,
      title: fact.title,
      detail: fact.detail,
    })),
    projects: [],
  };

  return { profile, knowledgeBase };
}

export function profileAndKnowledgeToBundle(
  profile: ResumeProfile,
  knowledgeBase: CandidateKnowledgeBase,
): CandidateProfileBundle {
  return {
    basics: {
      name: profile.basics?.name ?? "",
      headline: profile.basics?.headline ?? profile.basics?.label ?? "",
      email: profile.basics?.email ?? "",
      phone: profile.basics?.phone ?? "",
      summary:
        profile.sections?.summary?.content ?? profile.basics?.summary ?? "",
      url: profile.basics?.url ?? "",
      location: {
        city: profile.basics?.location?.city ?? "",
        region: profile.basics?.location?.region ?? "",
      },
    },
    summary: {
      content:
        profile.sections?.summary?.content ?? profile.basics?.summary ?? "",
    },
    skills: (profile.sections?.skills?.items ?? []).map((item) => ({
      name: item.name,
      keywords: item.keywords,
    })),
    experience: (profile.sections?.experience?.items ?? []).map((item) => ({
      company: item.company,
      position: item.position,
      location: item.location,
      date: item.date,
      summary: item.summary,
    })),
    projects: (profile.sections?.projects?.items ?? []).map((item) => ({
      name: item.name,
      date: item.date,
      summary: item.summary,
      keywords: item.keywords ?? [],
      url: item.url ?? "",
    })),
    facts: knowledgeBase.personalFacts.map((fact) => ({
      title: fact.title,
      detail: fact.detail,
    })),
  };
}
