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
      "Draft a tailored cover letter for this job. Keep it to 3-4 short paragraphs and under 300 words. Include a professional salutation at the top and a proper sign-off at the end. Make the language powerful, sincere, and concrete rather than generic. Use natural first-person cover-letter voice, explain why this role and employer fit, and support that with 2-3 specific examples from the provided profile. Do not invent experience, do not repeat the resume line by line, and avoid generic praise or empty enthusiasm.",
  },
  {
    id: "cover-letter-denmark",
    label: "Concise Denmark Style",
    description:
      "Work-first opening, concrete evidence, and a short Denmark-local closing.",
    prompt:
      "Draft a concise Denmark-style cover letter for this job. Treat it as a brief motivational letter in English, not a long explanatory cover letter. Keep it to about 180-230 words, with 3 short body paragraphs and a separate 1-2 sentence closing. Include a professional salutation at the top and a proper sign-off at the end. Use natural first-person voice, but keep the tone direct, modest, practical, employer-need driven, and sincere. Use this structure: (1) salutation, (2) a work-first opening tied to the role's planning, optimisation, or operating context, (3) one short paragraph with the strongest current evidence, (4) one short paragraph with supporting evidence from internship/project work if useful, and (5) a short useful closing plus sign-off. Prefer the most specific salutation available; use 'Dear Hiring Team' or a company-team variant only when no better option is available. Keep the greeting and sign-off restrained and low-drama. Prefer clean sign-offs such as 'Best regards' and avoid ceremonial or overly warm closings. Use concrete day-to-day planning or optimisation detail when it helps the letter feel real. Avoid overselling, exaggerated enthusiasm, generic praise, essay-style explanation, and CV repetition. If including a portfolio or website link, place it only in the closing or contact-style line, use the full URL, and prefer a clean closing line such as 'Selected project work is available at https://...'. Do not use hedging phrasing like 'If useful, I also share...'.",
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
