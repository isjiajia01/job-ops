import * as api from "@client/api";
import {
  DurationSelector,
  type DurationValue,
} from "@client/components/charts";
import { PageHeader, PageMain } from "@client/components/layout";
import type {
  ApplicationListItem,
  JobSource,
  StageEvent,
} from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import type React from "react";
import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { queryKeys } from "@/client/lib/queryKeys";

const ApplicationsPerDayChart = lazy(() =>
  import("@client/components/charts/ApplicationsPerDayChart").then(
    (module) => ({ default: module.ApplicationsPerDayChart }),
  ),
);
const ConversionAnalytics = lazy(() =>
  import("@client/components/charts/ConversionAnalytics").then((module) => ({
    default: module.ConversionAnalytics,
  })),
);
const ResponseRateBySourceChart = lazy(() =>
  import("@client/components/charts/ResponseRateBySourceChart").then(
    (module) => ({ default: module.ResponseRateBySourceChart }),
  ),
);

const OverviewChartFallback: React.FC = () => (
  <div className="rounded-lg border border-border/60 px-4 py-8 text-sm text-muted-foreground">
    Loading chart…
  </div>
);

type JobWithEvents = {
  id: string;
  source: JobSource;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  events: StageEvent[];
};

const DURATION_OPTIONS = [7, 14, 30, 90] as const;
const DEFAULT_DURATION = 30;

export const HomePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial duration from URL
  const initialDuration: DurationValue = (() => {
    const value = Number(searchParams.get("duration"));
    return (
      (DURATION_OPTIONS as readonly number[]).includes(value)
        ? value
        : DEFAULT_DURATION
    ) as DurationValue;
  })();

  const [duration, setDuration] = useState<DurationValue>(initialDuration);

  const overviewQuery = useQuery({
    queryKey: queryKeys.applications.list({
      statuses: ["applied", "in_progress"],
      view: "list",
    }),
    queryFn: async () => {
      const response = await api.getApplications({
        statuses: ["applied", "in_progress"],
        view: "list",
      });
      const appliedDates = response.jobs.map((job) => job.appliedAt);
      const jobSummaries = response.jobs.map((job: ApplicationListItem) => ({
        id: job.id,
        source: job.source,
        datePosted: job.datePosted,
        discoveredAt: job.discoveredAt,
        appliedAt: job.appliedAt,
      }));

      const appliedJobs = jobSummaries.filter((job) => job.appliedAt);
      const results = await Promise.allSettled(
        appliedJobs.map((job) =>
          queryClient.fetchQuery({
            queryKey: queryKeys.applications.stageEvents(job.id),
            queryFn: () => api.getApplicationStageEvents(job.id),
            staleTime: 0,
          }),
        ),
      );
      const eventsMap = new Map<string, StageEvent[]>();

      results.forEach((result, index) => {
        const jobId = appliedJobs[index]?.id;
        if (!jobId) return;
        if (result.status !== "fulfilled") {
          eventsMap.set(jobId, []);
          return;
        }
        eventsMap.set(jobId, result.value);
      });

      const jobsWithEvents: JobWithEvents[] = jobSummaries
        .filter((job) => job.appliedAt)
        .map((job) => ({
          ...job,
          events: eventsMap.get(job.id) ?? [],
        }));

      return { jobsWithEvents, appliedDates };
    },
  });

  const jobsWithEvents = useMemo(
    () => overviewQuery.data?.jobsWithEvents ?? [],
    [overviewQuery.data],
  );
  const appliedDates = useMemo(
    () => overviewQuery.data?.appliedDates ?? [],
    [overviewQuery.data],
  );
  const error = overviewQuery.error
    ? overviewQuery.error instanceof Error
      ? overviewQuery.error.message
      : "Failed to load applications"
    : null;
  const isLoading = overviewQuery.isLoading;

  const handleDurationChange = useCallback(
    (newDuration: DurationValue) => {
      setDuration(newDuration);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (newDuration === DEFAULT_DURATION) {
          next.delete("duration");
        } else {
          next.set("duration", String(newDuration));
        }
        // Clean up old params
        next.delete("days");
        next.delete("conversionWindow");
        return next;
      });
    },
    [setSearchParams],
  );

  return (
    <>
      <PageHeader
        icon={ChartColumn}
        title="Overview"
        subtitle="Analytics & Insights"
        actions={
          <DurationSelector value={duration} onChange={handleDurationChange} />
        }
      />

      <PageMain>
        <Suspense fallback={<OverviewChartFallback />}>
          <ApplicationsPerDayChart
            appliedAt={appliedDates}
            isLoading={isLoading}
            error={error}
            daysToShow={duration}
          />
        </Suspense>

        <Suspense fallback={<OverviewChartFallback />}>
          <ConversionAnalytics
            jobsWithEvents={jobsWithEvents}
            error={error}
            daysToShow={duration}
          />
        </Suspense>

        <Suspense fallback={<OverviewChartFallback />}>
          <ResponseRateBySourceChart jobs={jobsWithEvents} error={error} />
        </Suspense>
      </PageMain>
    </>
  );
};
