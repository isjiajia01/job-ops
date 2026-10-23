import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "tsup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const extractorsRoot = path.join(repoRoot, "extractors");
const providersRoot = path.join(repoRoot, "visa-sponsor-providers");

const entries = (await readdir(extractorsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const name of entries) {
  const manifestCandidates = [
    path.join(extractorsRoot, name, "manifest.ts"),
    path.join(extractorsRoot, name, "src", "manifest.ts"),
  ];

  let manifestPath = null;
  for (const candidate of manifestCandidates) {
    try {
      await access(candidate);
      manifestPath = candidate;
      break;
    } catch {
      // Try the next candidate.
    }
  }

  if (!manifestPath) {
    console.log(`Skipped extractor without manifest build target: ${name}`);
    continue;
  }

  await build({
    entry: [manifestPath],
    outDir: path.join(extractorsRoot, name, "dist"),
    format: ["esm"],
    platform: "node",
    target: "node22",
    bundle: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    skipNodeModulesBundle: true,
    tsconfig: path.join(extractorsRoot, name, "tsconfig.json"),
    silent: true,
    outExtension: () => ({ js: ".mjs" }),
  });
  console.log(`Built extractor manifest: ${name}`);
}

const providerEntries = (await readdir(providersRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const name of providerEntries) {
  const manifestPath = path.join(providersRoot, name, "manifest.ts");
  try {
    await access(manifestPath);
  } catch {
    console.log(`Skipped provider without manifest build target: ${name}`);
    continue;
  }

  await build({
    entry: [manifestPath],
    outDir: path.join(providersRoot, name, "dist"),
    format: ["esm"],
    platform: "node",
    target: "node22",
    bundle: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    skipNodeModulesBundle: true,
    tsconfig: path.join(providersRoot, "tsconfig.json"),
    silent: true,
    outExtension: () => ({ js: ".mjs" }),
  });
  console.log(`Built visa sponsor provider manifest: ${name}`);
}
