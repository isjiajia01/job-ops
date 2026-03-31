import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import type { Job } from "@shared/types";

const SOURCE_PRIORITY: Record<string, number> = {
  jobindex: 3,
  indeed: 2,
  linkedin: 1,
};

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameEmployerFamily(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function compareJobs(a: Job, b: Job): number {
  const scoreA = a.suitabilityScore ?? 0;
  const scoreB = b.suitabilityScore ?? 0;
  if (scoreA !== scoreB) return scoreB - scoreA;

  const prioA = SOURCE_PRIORITY[a.source] ?? 0;
  const prioB = SOURCE_PRIORITY[b.source] ?? 0;
  if (prioA !== prioB) return prioB - prioA;

  return a.discoveredAt < b.discoveredAt ? 1 : -1;
}

export async function suppressDuplicateDiscoveredJobs(): Promise<{
  kept: number;
  skipped: number;
}> {
  const jobs = await jobsRepo.getAllJobs(["discovered"]);
  const groups = new Map<string, Job[]>();

  for (const job of jobs) {
    const titleKey = normalize(job.title);
    if (!titleKey) continue;
    const bucket = groups.get(titleKey) ?? [];
    bucket.push(job);
    groups.set(titleKey, bucket);
  }

  let skipped = 0;
  let kept = 0;

  for (const bucket of groups.values()) {
    if (bucket.length === 0) continue;
    const clusters: Job[][] = [];

    for (const job of bucket) {
      const employerKey = normalize(job.employer);
      let matched = false;
      for (const cluster of clusters) {
        const clusterEmployer = normalize(cluster[0]?.employer);
        if (sameEmployerFamily(employerKey, clusterEmployer)) {
          cluster.push(job);
          matched = true;
          break;
        }
      }
      if (!matched) clusters.push([job]);
    }

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        kept += 1;
        continue;
      }

      const sorted = [...cluster].sort(compareJobs);
      kept += 1;
      for (const duplicate of sorted.slice(1)) {
        await jobsRepo.updateJob(duplicate.id, {
          status: "skipped",
          suitabilityReason:
            (duplicate.suitabilityReason ?? "") +
            " Duplicate listing suppressed in favor of a higher-priority equivalent job.",
        });
        skipped += 1;
        logger.info("Suppressed duplicate discovered job", {
          jobId: duplicate.id,
          title: duplicate.title,
          employer: duplicate.employer,
          source: duplicate.source,
        });
      }
    }
  }

  return { kept, skipped };
}
