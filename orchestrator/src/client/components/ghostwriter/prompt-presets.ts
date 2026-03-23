export type GhostwriterPromptPreset = {
  id: string;
  label: string;
  description: string;
  prompt: string;
};

export const COVER_LETTER_PROMPTS: GhostwriterPromptPreset[] = [
  {
    id: "cover-letter-standard",
    label: "Standard Cover Letter",
    description: "3-4 short paragraphs, tailored to the role and employer.",
    prompt:
      "Draft a tailored cover letter for this job. Keep it to 3-4 short paragraphs and under 300 words. Use natural first-person cover-letter voice, explain why this role and employer fit, and support that with 2-3 concrete examples from the provided profile. Do not invent experience, do not repeat the resume line by line, and avoid generic praise.",
  },
  {
    id: "cover-letter-denmark",
    label: "Concise Denmark Style",
    description:
      "Direct, modest, employer-need driven, and more restrained in tone.",
    prompt:
      "Draft a concise Denmark-style cover letter for this job. Keep it to 3 short paragraphs and under 220 words. Use natural first-person voice, but keep the tone direct, modest, practical, and employer-need driven. Focus on why this role fits, how my background can help, and 2 concrete examples from the provided profile. Avoid overselling, exaggerated enthusiasm, and generic praise. Do not invent experience or repeat the CV line by line.",
  },
  {
    id: "cover-letter-email",
    label: "Email Application",
    description:
      "Short email body for applying, assuming the CV is attached separately.",
    prompt:
      "Draft a short job-application email for this job. Keep it under 140 words. Assume the CV is attached separately. Use natural first-person email voice, mention the role, state why the fit is relevant in 1-2 concrete points from the provided profile, and close politely. Do not invent experience, do not sound like a template blast email, and do not include placeholder fields.",
  },
];
