export type GhostwriterPromptPreset = {
  id: string;
  label: string;
  description: string;
  prompt: string;
};

export const AI_ENTRY_PROMPTS: GhostwriterPromptPreset[] = [
  {
    id: "resume-refresh",
    label: "Refresh CV Draft",
    description:
      "Update the current tailored CV for this job and apply the new draft automatically.",
    prompt:
      "Update the current tailored CV for this job and apply the changes automatically. Refresh the tailored summary, headline, and skills so they match this role more sharply. Keep the writing truthful, specific, and employer-need driven. Strengthen the language, but do not overclaim or invent experience.",
  },
  {
    id: "resume-rewrite",
    label: "Rewrite Existing CV",
    description:
      "Improve the current job-specific CV draft without changing the core facts.",
    prompt:
      "Rewrite the current tailored CV draft for this job so it sounds sharper, more specific, and more persuasive while staying fully truthful. Keep the strongest evidence, remove generic phrasing, and return a resumePatch that updates the current tailored summary, headline, and skills.",
  },
  {
    id: "fit-brief",
    label: "Role Fit Brief",
    description:
      "Summarize the strongest evidence and any gaps before drafting documents.",
    prompt:
      "Based on this job and all available profile context, give me a concise role-fit brief: strongest fit evidence, likely weak points, and what angle the CV and cover letter should lean on.",
  },
];

export const COVER_LETTER_PROMPTS: GhostwriterPromptPreset[] = [
  {
    id: "cover-letter-standard",
    label: "Standard Cover Letter",
    description: "3-4 short paragraphs, tailored to the role and employer.",
    prompt:
      "Draft a tailored cover letter for this job. Keep it to 3-4 short paragraphs and under 300 words. Make the language powerful, sincere, and concrete rather than generic. Use natural first-person cover-letter voice, explain why this role and employer fit, and support that with 2-3 specific examples from the provided profile. Do not invent experience, do not repeat the resume line by line, and avoid generic praise or empty enthusiasm.",
  },
  {
    id: "cover-letter-denmark",
    label: "Concise Denmark Style",
    description:
      "Direct, modest, employer-need driven, and more restrained in tone.",
    prompt:
      "Draft a concise Denmark-style cover letter for this job. Keep it to 3 short paragraphs and under 220 words. Use natural first-person voice, but keep the tone direct, modest, practical, employer-need driven, and sincere. Start with a local, non-template opening and avoid generic salutations like 'Dear Hiring Team' unless no better option is possible. Focus on why this role fits, how my background can help, and 2 concrete examples from the provided profile. End with a short, useful closing that focuses on what I can contribute, not a long polite wrap-up. Use concrete day-to-day details from the provided profile or JD when they make the letter feel more real, but do not invent personal stories or unsupported life details. Avoid overselling, exaggerated enthusiasm, and generic praise. Do not invent experience or repeat the CV line by line.",
  },
  {
    id: "cover-letter-email",
    label: "Email Application",
    description:
      "Short email body for applying, assuming the CV is attached separately.",
    prompt:
      "Draft a short job-application email for this job. Keep it under 140 words. Assume the CV is attached separately. Use natural first-person email voice, mention the role, state why the fit is relevant in 1-2 concrete points from the provided profile, and close politely. Make it sound human, specific, and sincere, not like a mass template. Do not invent experience and do not include placeholder fields.",
  },
];
