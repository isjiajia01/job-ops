import * as api from "@client/api";
import { ManualImportSheet } from "@client/components/ManualImportSheet";
import { PageHeader, PageMain } from "@client/components/layout";
import { StatusBadge } from "@client/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryKeys } from "@/client/lib/queryKeys";
import type { JobListItem, JobStatus } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, FilePlus2, Search } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const STATUS_LABELS: Record<JobStatus, string> = {
  discovered: "Needs review",
  processing: "Generating",
  ready: "Ready to apply",
  applied: "Applied",
  in_progress: "In progress",
  skipped: "Skipped",
  expired: "Archived",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function matchesQuery(job: JobListItem, query: string): boolean {
  if (!query) return true;
  const haystack = [job.title, job.employer, job.location, job.jobUrl]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export const ApplicationsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [manualImportOpen, setManualImportOpen] = useState(
    location.pathname === "/applications/new",
  );

  useEffect(() => {
    setManualImportOpen(location.pathname === "/applications/new");
  }, [location.pathname]);

  const applicationsQuery = useQuery({
    queryKey: queryKeys.applications.list({ view: "list" }),
    queryFn: () => api.getApplications({ view: "list" }),
  });

  const applications = useMemo(
    () => applicationsQuery.data?.jobs ?? [],
    [applicationsQuery.data],
  );

  const filteredApplications = useMemo(
    () => applications.filter((job) => matchesQuery(job, query)),
    [applications, query],
  );

  const stats = useMemo(() => {
    const active = applications.filter((job) =>
      ["ready", "applied", "in_progress"].includes(job.status),
    ).length;
    const drafts = applications.filter((job) => job.status === "discovered").length;
    const followUp = applications.filter((job) => job.status === "in_progress").length;
    const avgScoreSource = applications
      .map((job) => job.suitabilityScore)
      .filter((score): score is number => typeof score === "number");
    const avgScore =
      avgScoreSource.length > 0
        ? Math.round(
            avgScoreSource.reduce((sum, score) => sum + score, 0) /
              avgScoreSource.length,
          )
        : null;

    return { active, drafts, followUp, avgScore };
  }, [applications]);

  const handleOpenManualImport = () => {
    setManualImportOpen(true);
    navigate("/applications/new", { replace: location.pathname === "/applications/new" });
  };

  const handleManualImportChange = (open: boolean) => {
    setManualImportOpen(open);
    if (!open && location.pathname === "/applications/new") {
      navigate("/applications", { replace: true });
    }
  };

  return (
    <>
      <PageHeader
        icon={BriefcaseBusiness}
        title="Applications"
        subtitle="Paste JD, generate tailored materials, and track your work in one place"
        actions={
          <Button onClick={handleOpenManualImport} className="gap-2">
            <FilePlus2 className="h-4 w-4" />
            New Application
          </Button>
        }
      />

      <PageMain>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Active applications
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{stats.active}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Drafts to refine
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{stats.drafts}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Follow-ups / interviews
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{stats.followUp}</div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Avg fit score
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {stats.avgScore === null ? "—" : stats.avgScore}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-card/40 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Tracker</h2>
              <p className="text-sm text-muted-foreground">
                Existing jobs still power the data model for now, but the primary workflow is shifting to JD-first application drafting.
              </p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search company, role, location..."
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fit</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((job) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/applications/${job.id}`)}
                  >
                    <TableCell>
                      <div className="min-w-0">
                        <div className="font-medium">{job.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {job.employer}
                          {job.location ? ` · ${job.location}` : ""}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <StatusBadge status={job.status} />
                        <div className="text-[11px] text-muted-foreground">
                          {STATUS_LABELS[job.status]}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {typeof job.suitabilityScore === "number"
                          ? `${job.suitabilityScore}`
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(job.appliedAt)}</TableCell>
                    <TableCell>{formatDate(job.updatedAt)}</TableCell>
                  </TableRow>
                ))}
                {filteredApplications.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No applications match this search yet. Start by pasting a JD.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </PageMain>

      <ManualImportSheet
        open={manualImportOpen}
        onOpenChange={handleManualImportChange}
        onImported={(jobId) => {
          handleManualImportChange(false);
          navigate(`/applications/${jobId}`);
        }}
      />
    </>
  );
};
