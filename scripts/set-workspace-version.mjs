import { readFileSync, writeFileSync } from "node:fs";

const nextVersion = process.argv[2]?.trim();

if (!nextVersion || !/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error("Usage: node ./scripts/set-workspace-version.mjs <x.y.z>");
  process.exit(1);
}

const workspacePackagePath = new URL("../workspace/package.json", import.meta.url);
const packageLockPath = new URL("../package-lock.json", import.meta.url);

const workspacePackage = JSON.parse(
  readFileSync(workspacePackagePath, "utf8"),
);

if (workspacePackage.version === nextVersion) {
  console.log(`workspace/package.json already at ${nextVersion}`);
} else {
  workspacePackage.version = nextVersion;
  writeFileSync(
    workspacePackagePath,
    `${JSON.stringify(workspacePackage, null, 2)}\n`,
  );
  console.log(`Updated workspace/package.json to ${nextVersion}`);
}

const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
if (!packageLock.packages?.workspace) {
  console.error("package-lock.json is missing packages.workspace");
  process.exit(1);
}

packageLock.packages.workspace.version = nextVersion;

writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
console.log(`Updated package-lock.json workspace entry to ${nextVersion}`);
