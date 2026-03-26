import type { JobSource } from "@shared/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PIPELINE_SOURCES,
  orderedSources,
  PIPELINE_SOURCES_STORAGE_KEY,
} from "./constants";

const THEHUB_DEFAULT_MIGRATION_KEY = "jobops.pipeline.thehub-default.v1";

const resolveAllowedSources = (enabledSources?: readonly JobSource[]) =>
  enabledSources && enabledSources.length > 0
    ? (enabledSources as JobSource[])
    : DEFAULT_PIPELINE_SOURCES;

const normalizeSources = (
  sources: JobSource[],
  allowedSources: JobSource[],
) => {
  const filtered = sources.filter((value) => allowedSources.includes(value));
  return filtered.length > 0 ? filtered : allowedSources.slice(0, 1);
};

const sourcesMatch = (left: JobSource[], right: JobSource[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const shouldAutoIncludeTheHub = (allowedSources: JobSource[]) =>
  allowedSources.includes("thehub") &&
  localStorage.getItem(THEHUB_DEFAULT_MIGRATION_KEY) !== "done";

export const usePipelineSources = (enabledSources?: readonly JobSource[]) => {
  const allowedSources = useMemo(
    () => resolveAllowedSources(enabledSources),
    [enabledSources],
  );
  const [pipelineSources, setPipelineSources] = useState<JobSource[]>(() => {
    try {
      const raw = localStorage.getItem(PIPELINE_SOURCES_STORAGE_KEY);
      if (!raw) return normalizeSources(allowedSources, allowedSources);
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed))
        return normalizeSources(allowedSources, allowedSources);
      const next = parsed.filter((value): value is JobSource =>
        orderedSources.includes(value as JobSource),
      );
      const normalized = normalizeSources(next, allowedSources);
      if (
        shouldAutoIncludeTheHub(allowedSources) &&
        !normalized.includes("thehub")
      ) {
        return [...normalized, "thehub"];
      }
      return normalized;
    } catch {
      return normalizeSources(allowedSources, allowedSources);
    }
  });

  useEffect(() => {
    setPipelineSources((current) => {
      const normalized = normalizeSources(current, allowedSources);
      return sourcesMatch(current, normalized) ? current : normalized;
    });
  }, [allowedSources]);

  useEffect(() => {
    if (!shouldAutoIncludeTheHub(allowedSources)) return;
    setPipelineSources((current) =>
      current.includes("thehub") ? current : [...current, "thehub"],
    );
    try {
      localStorage.setItem(THEHUB_DEFAULT_MIGRATION_KEY, "done");
    } catch {
      // Ignore localStorage errors
    }
  }, [allowedSources]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PIPELINE_SOURCES_STORAGE_KEY,
        JSON.stringify(pipelineSources),
      );
    } catch {
      // Ignore localStorage errors
    }
  }, [pipelineSources]);

  const toggleSource = useCallback(
    (source: JobSource, checked: boolean) => {
      if (!allowedSources.includes(source)) return;
      setPipelineSources((current) => {
        const next = checked
          ? Array.from(new Set([...current, source]))
          : current.filter((value) => value !== source);

        return next.length === 0 ? current : next;
      });
    },
    [allowedSources],
  );

  return { pipelineSources, setPipelineSources, toggleSource };
};
