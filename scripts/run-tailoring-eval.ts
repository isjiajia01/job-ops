import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProfile } from "../orchestrator/src/server/services/profile";
import { generateTailoring } from "../orchestrator/src/server/services/summary";

type Fixture = {
  id: string;
  jobTitle: string;
  jobDescription: string;
  expected: {
    headline: string;
    requiredKeywords: string[];
    forbiddenKeywords: string[];
    shouldRewriteExperience: boolean;
    preferredSectionOrderPrefix: string[];
  };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(
  __dirname,
  "tailoring-eval-fixtures",
  "denmark-planning.json",
);

function containsKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function flattenTailoring(
  result: Awaited<ReturnType<typeof generateTailoring>>["data"],
): string {
  if (!result) return "";
  const skills = (result.skills ?? []).flatMap((group) => [
    group.name,
    ...(group.keywords ?? []),
  ]);
  const bullets = (result.experienceEdits ?? []).flatMap(
    (edit) => edit.bullets ?? [],
  );
  const directives = result.layoutDirectives?.sectionOrder ?? [];
  return [
    result.headline,
    result.summary,
    ...skills,
    ...bullets,
    ...directives,
  ].join("\n");
}

function scoreFixture(
  fixture: Fixture,
  data: NonNullable<Awaited<ReturnType<typeof generateTailoring>>["data"]>,
) {
  let score = 0;
  const notes: string[] = [];
  const blob = flattenTailoring(data);

  if (data.headline.trim() === fixture.expected.headline) {
    score += 2;
    notes.push("headline exact");
  } else if (containsKeyword(data.headline, fixture.expected.headline)) {
    score += 1;
    notes.push("headline partial");
  } else {
    notes.push("headline weak");
  }

  const requiredHits = fixture.expected.requiredKeywords.filter((kw) =>
    containsKeyword(blob, kw),
  );
  if (
    requiredHits.length >=
    Math.max(2, Math.ceil(fixture.expected.requiredKeywords.length / 2))
  ) {
    score += 2;
    notes.push(`required keywords ok (${requiredHits.length})`);
  } else if (requiredHits.length > 0) {
    score += 1;
    notes.push(`required keywords partial (${requiredHits.length})`);
  } else {
    notes.push("required keywords weak");
  }

  const forbiddenHits = fixture.expected.forbiddenKeywords.filter((kw) =>
    containsKeyword(blob, kw),
  );
  if (forbiddenHits.length === 0) {
    score += 2;
    notes.push("no forbidden claims");
  } else if (forbiddenHits.length === 1) {
    score += 1;
    notes.push(`one forbidden hit: ${forbiddenHits[0]}`);
  } else {
    notes.push(`forbidden hits: ${forbiddenHits.join(", ")}`);
  }

  const rewriteCount = data.experienceEdits?.length ?? 0;
  if (!fixture.expected.shouldRewriteExperience || rewriteCount > 0) {
    score += 2;
    notes.push(`experience edits: ${rewriteCount}`);
  } else {
    notes.push("missing experience rewrites");
  }

  const actualOrder = data.layoutDirectives?.sectionOrder ?? [];
  const expectedPrefix = fixture.expected.preferredSectionOrderPrefix;
  const prefixMatches = expectedPrefix.every(
    (value, index) => actualOrder[index] === value,
  );
  if (prefixMatches) {
    score += 2;
    notes.push("section order aligned");
  } else if (actualOrder.length > 0) {
    score += 1;
    notes.push(`section order partial: ${actualOrder.join(" > ")}`);
  } else {
    notes.push("missing section order");
  }

  const rationaleOk =
    Boolean(data.sectionRationale?.trim()) &&
    Boolean(data.omissionRationale?.trim());
  if (rationaleOk) {
    score += 2;
    notes.push("rationales present");
  } else {
    notes.push("missing rationale fields");
  }

  return { score, notes };
}

async function main(): Promise<void> {
  const raw = await readFile(fixturePath, "utf8");
  const fixtures = JSON.parse(raw) as Fixture[];
  const profile = await getProfile();

  for (const fixture of fixtures) {
    const result = await generateTailoring(
      {
        jobTitle: fixture.jobTitle,
        jobDescription: fixture.jobDescription,
      },
      profile,
    );
    console.log("---");
    console.log(fixture.id);
    if (!result.success || !result.data) {
      console.log("FAILED", result.error);
      continue;
    }
    const scored = scoreFixture(fixture, result.data);
    console.log("score=", scored.score, "/ 12");
    console.log("notes=", scored.notes.join(" | "));
    console.log("headline=", result.data.headline);
    console.log(
      "sectionOrder=",
      result.data.layoutDirectives?.sectionOrder ?? [],
    );
    console.log("experienceEdits=", result.data.experienceEdits?.length ?? 0);
  }
}

void main();
