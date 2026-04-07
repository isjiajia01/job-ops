import { promises as fs } from "node:fs";
import path from "node:path";
import { settingsRegistry } from "@shared/settings-registry";
import type { LocalProjectCandidate, LocalProjectSource } from "@shared/types";
import * as settingsRepo from "../repositories/settings";

const MAX_SCAN_DEPTH = 2;
const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "README.md",
  "readme.md",
];

function expandHome(input: string): string {
  if (input === "~") return process.env.HOME || input;
  if (input.startsWith("~/")) {
    return path.join(process.env.HOME || "", input.slice(2));
  }
  return input;
}

export async function getLocalProjectSources(): Promise<LocalProjectSource[]> {
  const raw = await settingsRepo.getSetting("localProjectSources");
  return (
    settingsRegistry.localProjectSources.parse(raw ?? undefined) ??
    settingsRegistry.localProjectSources.default()
  );
}

export async function saveLocalProjectSources(
  input: LocalProjectSource[],
): Promise<LocalProjectSource[]> {
  const normalized = settingsRegistry.localProjectSources.schema.parse(input);
  await settingsRepo.setSetting(
    "localProjectSources",
    settingsRegistry.localProjectSources.serialize(normalized),
  );
  return normalized;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readSnippet(filePath: string, max = 1200): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.slice(0, max);
  } catch {
    return "";
  }
}

function inferKeywordsFromText(text: string): string[] {
  const matches = text.match(/[A-Za-z][A-Za-z0-9+.#/-]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of matches) {
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(token);
    if (out.length >= 8) break;
  }
  return out;
}

async function summarizeProject(dir: string): Promise<LocalProjectCandidate | null> {
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) return null;

  const readmePath = (await exists(path.join(dir, "README.md")))
    ? path.join(dir, "README.md")
    : (await exists(path.join(dir, "readme.md")))
      ? path.join(dir, "readme.md")
      : null;
  const packageJsonPath = path.join(dir, "package.json");
  const pyprojectPath = path.join(dir, "pyproject.toml");
  const goModPath = path.join(dir, "go.mod");
  const cargoPath = path.join(dir, "Cargo.toml");

  const [readmeSnippet, pkgSnippet, pySnippet, goSnippet, cargoSnippet] =
    await Promise.all([
      readmePath ? readSnippet(readmePath, 1600) : Promise.resolve(""),
      readSnippet(packageJsonPath, 1000),
      readSnippet(pyprojectPath, 1000),
      readSnippet(goModPath, 400),
      readSnippet(cargoPath, 600),
    ]);

  if (!readmeSnippet && !pkgSnippet && !pySnippet && !goSnippet && !cargoSnippet) {
    return null;
  }

  let name = path.basename(dir);
  let summary = "";
  const evidence: string[] = [];

  if (pkgSnippet) {
    try {
      const pkg = JSON.parse(pkgSnippet);
      if (typeof pkg.name === "string" && pkg.name.trim()) name = pkg.name.trim();
      if (typeof pkg.description === "string" && pkg.description.trim()) {
        summary = pkg.description.trim();
      }
      evidence.push("package.json");
    } catch {
      // ignore
    }
  }

  if (!summary && readmeSnippet) {
    const lines = readmeSnippet
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .filter(Boolean);
    summary = lines.find((line) => line.length > 24) || lines[0] || "";
    evidence.push("README");
  }

  if (!summary && pySnippet) {
    summary = "Python project detected from pyproject.toml.";
    evidence.push("pyproject.toml");
  }
  if (!summary && goSnippet) {
    summary = "Go project detected from go.mod.";
    evidence.push("go.mod");
  }
  if (!summary && cargoSnippet) {
    summary = "Rust project detected from Cargo.toml.";
    evidence.push("Cargo.toml");
  }

  const keywords = inferKeywordsFromText(
    [summary, readmeSnippet, pkgSnippet, pySnippet, goSnippet, cargoSnippet].join("\n"),
  );

  return {
    id: `local-${Buffer.from(dir).toString("base64").replace(/=/g, "")}`,
    path: dir,
    name,
    summary: summary || "Local project candidate imported from filesystem.",
    keywords,
    role: null,
    impact: null,
    evidence,
    lastModifiedAt: stat.mtime.toISOString(),
  };
}

async function walk(dir: string, depth: number, results: string[]): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

  const fileNames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  if (MANIFEST_FILES.some((name) => fileNames.has(name))) {
    results.push(dir);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    await walk(path.join(dir, entry.name), depth + 1, results);
  }
}

export async function scanLocalProjectCandidates(): Promise<LocalProjectCandidate[]> {
  const sources = await getLocalProjectSources();
  const candidateDirs: string[] = [];

  for (const source of sources) {
    const resolved = expandHome(source.path.trim());
    if (!resolved) continue;
    await walk(resolved, 0, candidateDirs);
  }

  const uniqueDirs = Array.from(new Set(candidateDirs));
  const projects = await Promise.all(uniqueDirs.map((dir) => summarizeProject(dir)));
  return projects
    .filter((item): item is LocalProjectCandidate => Boolean(item))
    .sort((a, b) => (b.lastModifiedAt || "").localeCompare(a.lastModifiedAt || ""));
}
