import type { FixedFactSlot } from "./types";

export const FIXED_FACT_SLOTS: FixedFactSlot[] = [
  {
    key: "target-roles",
    title: "Target roles",
    description: "What kinds of roles you want the AI to optimize toward.",
    placeholder:
      "e.g. Product-minded software engineer, AI application engineer, optimization/ML engineer",
  },
  {
    key: "positioning",
    title: "Positioning",
    description: "The most useful one-paragraph angle for how to frame you.",
    placeholder:
      "e.g. Builder who combines operations research, product thinking, and hands-on AI workflow design",
  },
  {
    key: "work-authorization",
    title: "Work authorization",
    description:
      "Visa, geography, and work eligibility details that should stay consistent.",
    placeholder:
      "e.g. Based in Denmark, open to EU relocation, needs sponsorship for UK full-time roles",
  },
  {
    key: "strongest-proof-points",
    title: "Strongest proof points",
    description:
      "The strongest evidence the writer should reuse across applications.",
    placeholder:
      "e.g. Built self-hosted job ops tooling, thesis with Mover, productized AI workflows end-to-end",
  },
  {
    key: "deal-breakers",
    title: "Deal breakers",
    description: "Constraints or filters the AI should respect.",
    placeholder:
      "e.g. Avoid pure maintenance roles, prefer builder-heavy environments, no roles requiring only native Danish",
  },
];
