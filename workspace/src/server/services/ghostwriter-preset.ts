import type { ResumeProfile } from "@shared/types";

export type GhostwriterPromptPreset = {
  id: "general-track" | "planning-track" | "denmark-local";
  heading: string;
  lines: string[];
};

function collectProfileText(profile: ResumeProfile): string {
  return [
    profile.basics?.headline,
    profile.basics?.label,
    profile.basics?.summary,
    profile.sections?.summary?.content,
    ...(profile.sections?.skills?.items ?? []).flatMap((item) => [
      item.name,
      item.description,
      ...(item.keywords ?? []),
    ]),
    ...(profile.sections?.experience?.items ?? []).flatMap((item) => [
      item.company,
      item.position,
      item.location,
      item.summary,
    ]),
    ...(profile.sections?.projects?.items ?? []).flatMap((item) => [
      item.name,
      item.description,
      item.summary,
      ...(item.keywords ?? []),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function resolveGhostwriterPromptPresets(
  profile: ResumeProfile,
): GhostwriterPromptPreset[] {
  const profileText = collectProfileText(profile);
  const presets: GhostwriterPromptPreset[] = [
    {
      id: "general-track",
      heading: "Preset: general-track",
      lines: [
        "Default to clear, specific, employer-useful writing over broad self-description.",
        "Prefer practical contribution language over polished but generic candidate branding.",
      ],
    },
  ];

  if (
    /\b(planning|demand|supply chain|supply planning|logistics|operations research|optimization|forecasting)\b/.test(
      profileText,
    )
  ) {
    presets.push({
      id: "planning-track",
      heading: "Preset: planning-track",
      lines: [
        "Bias toward planning-oriented problem solving, operational analysis, forecasting-adjacent work, and decision support when supported by the profile.",
        "For this track, concrete process understanding, analytical structure, and execution detail matter more than broad strategy language.",
      ],
    });
  }

  if (/\b(denmark|dtu|copenhagen|søborg)\b/.test(profileText)) {
    presets.push({
      id: "denmark-local",
      heading: "Preset: denmark-local",
      lines: [
        "Keep tone restrained, direct, and employer-need driven rather than enthusiastic or sales-heavy.",
        "Prefer local, non-template openings and concise closings with practical contribution language.",
      ],
    });
  }

  return presets;
}
