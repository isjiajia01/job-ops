import * as api from "@client/api";
import {
  DiscoveredPanel,
  FitAssessment,
  JobHeader,
  TailoredSummary,
} from "@client/components";
import { JobDetailsEditDrawer } from "@client/components/JobDetailsEditDrawer";
import { ReadyPanel } from "@client/components/ReadyPanel";
import { TailoringEditor } from "@client/components/TailoringEditor";
import {
  useMarkAsAppliedMutation,
  useSkipJobMutation,
  useUnapplyJobMutation,
} from "@client/hooks/queries/useJobMutations";
import { useProfile } from "@client/hooks/useProfile";
import { useSettings } from "@client/hooks/useSettings";
import type { Job, JobListItem } from "@shared/types.js";
import {
  CheckCircle2,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  FileText,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  Save,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { JobDescriptionMarkdown } from "@/client/components/JobDescriptionMarkdown";
import { parseDocumentStrategy } from "@/client/lib/document-strategy";
import { buildJobDecisionBrief } from "@/client/lib/job-decision";
import { getRenderableJobDescription } from "@/client/lib/jobDescription";
import {
  parseSelectedProofPointIds,
  recommendProjectsForJob,
} from "@/client/lib/project-proof-points";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trackProductEvent } from "@/lib/analytics";
import {
  copyTextToClipboard,
  formatJobForWebhook,
  getJobListingUrl,
  safeFilenamePart,
} from "@/lib/utils";
import type { FilterTab } from "./constants";

interface JobDetailPanelProps {
  activeTab: FilterTab;
  activeJobs: JobListItem[];
  selectedJob: Job | null;
  onSelectJobId: (jobId: string | null) => void;
  onJobUpdated: () => Promise<void>;
  onPauseRefreshChange?: (paused: boolean) => void;
}

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const JobDetailPanel: React.FC<JobDetailPanelProps> = ({
  activeTab,
  activeJobs,
  selectedJob,
  onSelectJobId,
  onJobUpdated,
  onPauseRefreshChange,
}) => {
  const [detailTab, setDetailTab] = useState<
    "overview" | "tailoring" | "description"
  >("overview");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [hasUnsavedTailoring, setHasUnsavedTailoring] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const saveTailoringRef = useRef<null | (() => Promise<void>)>(null);
  const previousSelectedJobIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const markAsAppliedMutation = useMarkAsAppliedMutation();
  const skipJobMutation = useSkipJobMutation();
  const unapplyJobMutation = useUnapplyJobMutation();

  const { personName } = useProfile();
  const { renderMarkdownInJobDescriptions } = useSettings();

  const handleTailoringDirtyChange = useCallback(
    (isDirty: boolean) => {
      setHasUnsavedTailoring(isDirty);
      onPauseRefreshChange?.(isDirty);
    },
    [onPauseRefreshChange],
  );

  useEffect(() => {
    const currentJobId = selectedJob?.id ?? null;
    if (previousSelectedJobIdRef.current === currentJobId) return;
    previousSelectedJobIdRef.current = currentJobId;
    setHasUnsavedTailoring(false);
    saveTailoringRef.current = null;
    onPauseRefreshChange?.(false);
  }, [selectedJob?.id, onPauseRefreshChange]);

  useEffect(() => {
    return () => onPauseRefreshChange?.(false);
  }, [onPauseRefreshChange]);

  const description = useMemo(() => {
    return getRenderableJobDescription(selectedJob?.jobDescription);
  }, [selectedJob]);

  useEffect(() => {
    if (!selectedJob) {
      setIsEditingDescription(false);
      setEditedDescription("");
      setIsEditDetailsOpen(false);
      return;
    }
    setIsEditingDescription(false);
    setEditedDescription(selectedJob.jobDescription || "");
    setIsEditDetailsOpen(false);
  }, [selectedJob?.id, selectedJob]);

  useEffect(() => {
    if (!selectedJob) return;
    if (!isEditingDescription) {
      setEditedDescription(selectedJob.jobDescription || "");
    }
  }, [selectedJob?.jobDescription, isEditingDescription, selectedJob]);

  const handleSaveDescription = async () => {
    if (!selectedJob) return;
    try {
      setIsSavingDescription(true);
      await api.updateJob(selectedJob.id, {
        jobDescription: editedDescription,
      });
      toast.success("Job description updated");
      setIsEditingDescription(false);
      await onJobUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update description";
      toast.error(message);
    } finally {
      setIsSavingDescription(false);
    }
  };

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.profile.knowledge(),
    queryFn: api.getCandidateKnowledgeBase,
  });

  const decisionBrief = useMemo(
    () => (selectedJob ? buildJobDecisionBrief(selectedJob) : null),
    [selectedJob],
  );
  const documentStrategy = useMemo(
    () => (selectedJob ? parseDocumentStrategy(selectedJob) : null),
    [selectedJob],
  );

  const recommendedProofPoints = useMemo(
    () => recommendProjectsForJob(selectedJob, knowledgeQuery.data?.projects ?? [], 3),
    [selectedJob, knowledgeQuery.data],
  );
  const selectedProofPointIds = useMemo(
    () => new Set(parseSelectedProofPointIds(selectedJob?.selectedProofPointProjectIds)),
    [selectedJob?.selectedProofPointProjectIds],
  );

  const tailoringAudit = useMemo(
    () => ({
      experienceEdits: parseJsonSafe<Array<{ id: string; bullets: string[] }>>(
        selectedJob?.tailoredExperienceEdits,
        [],
      ),
      layoutDirectives: parseJsonSafe<{
        sectionOrder?: string[];
        hiddenSections?: string[];
        hiddenProjectIds?: string[];
        hiddenExperienceIds?: string[];
      }>(selectedJob?.tailoredLayoutDirectives, {}),
      sectionRationale: selectedJob?.tailoredSectionRationale || "",
      omissionRationale: selectedJob?.tailoredOmissionRationale || "",
    }),
    [selectedJob],
  );

  const sectionOrder = tailoringAudit.layoutDirectives.sectionOrder ?? [];
  const hiddenSections = tailoringAudit.layoutDirectives.hiddenSections ?? [];
  const hiddenProjectIds =
    tailoringAudit.layoutDirectives.hiddenProjectIds ?? [];
  const hiddenExperienceIds =
    tailoringAudit.layoutDirectives.hiddenExperienceIds ?? [];

  const hasUnsavedDescription =
    !!selectedJob &&
    isEditingDescription &&
    editedDescription !== (selectedJob.jobDescription || "");

  const confirmAndSaveEdits = useCallback(
    async ({
      includeTailoring = true,
    }: {
      includeTailoring?: boolean;
    } = {}) => {
      const pendingDescription = hasUnsavedDescription;
      const pendingTailoring = includeTailoring && hasUnsavedTailoring;

      if (!pendingDescription && !pendingTailoring) return true;

      const parts = [];
      if (pendingDescription) parts.push("job description");
      if (pendingTailoring) parts.push("tailoring changes");

      const message = `You have unsaved ${parts.join(" and ")}. Save before generating the PDF?`;
      if (!window.confirm(message)) return false;

      try {
        if (pendingDescription && selectedJob) {
          await api.updateJob(selectedJob.id, {
            jobDescription: editedDescription,
          });
        }

        if (pendingTailoring) {
          const saveTailoring = saveTailoringRef.current;
          if (!saveTailoring) {
            toast.error("Could not save tailoring changes");
            return false;
          }
          await saveTailoring();
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to save changes";
        toast.error(errorMessage);
        return false;
      }

      return true;
    },
    [
      editedDescription,
      hasUnsavedDescription,
      hasUnsavedTailoring,
      selectedJob,
    ],
  );

  const handleUseProofPointForJob = async (projectId: string) => {
    if (!selectedJob) return;
    try {
      await api.updateJob(selectedJob.id, {
        selectedProofPointProjectIds: projectId,
      });
      await onJobUpdated();
      toast.success("Proof point selected for this job");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update proof points",
      );
    }
  };

  const handleRecommendTopProofPoints = async () => {
    if (!selectedJob || recommendedProofPoints.length === 0) return;
    const selectedIds = recommendedProofPoints
      .map((item) => item.project.id)
      .join(",");
    try {
      await api.updateJob(selectedJob.id, {
        selectedProofPointProjectIds: selectedIds,
      });
      await onJobUpdated();
      toast.success("Recommended top proof points saved for this job");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to apply recommendations",
      );
    }
  };

  const handleProcess = async () => {
    if (!selectedJob) return;
    try {
      const shouldProceed = await confirmAndSaveEdits({
        includeTailoring: true,
      });
      if (!shouldProceed) return;

      setProcessingJobId(selectedJob.id);

      if (selectedJob.status === "ready") {
        await api.generateJobPdf(selectedJob.id);
        trackProductEvent("jobs_job_action_completed", {
          action: "generate_pdf",
          result: "success",
          from_status: selectedJob.status,
        });
        toast.success("Resume regenerated successfully");
      } else {
        await api.processJob(selectedJob.id);
        trackProductEvent("jobs_job_action_completed", {
          action: "process_job",
          result: "success",
          from_status: selectedJob.status,
          to_status: "ready",
        });
        toast.success("Resume generated successfully");
      }
      await onJobUpdated();
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: selectedJob.status === "ready" ? "generate_pdf" : "process_job",
        result: "error",
        from_status: selectedJob.status,
        ...(selectedJob.status === "ready" ? {} : { to_status: "ready" }),
      });
      const message =
        error instanceof Error ? error.message : "Failed to process job";
      toast.error(message);
    } finally {
      setProcessingJobId(null);
    }
  };

  const handleApply = async () => {
    if (!selectedJob) return;
    try {
      await markAsAppliedMutation.mutateAsync(selectedJob.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "mark_applied",
        result: "success",
        from_status: selectedJob.status,
        to_status: "applied",
      });
      toast.success("Marked as applied");
      await onJobUpdated();
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "mark_applied",
        result: "error",
        from_status: selectedJob.status,
        to_status: "applied",
      });
      const message =
        error instanceof Error ? error.message : "Failed to mark as applied";
      toast.error(message);
    }
  };

  const handleSkip = async () => {
    if (!selectedJob) return;
    try {
      await skipJobMutation.mutateAsync(selectedJob.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "skip",
        result: "success",
        from_status: selectedJob.status,
        to_status: "skipped",
      });
      toast.message("Job skipped");
      await onJobUpdated();
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "skip",
        result: "error",
        from_status: selectedJob.status,
        to_status: "skipped",
      });
      const message =
        error instanceof Error ? error.message : "Failed to skip job";
      toast.error(message);
    }
  };

  const handleMoveBackToReady = async () => {
    if (!selectedJob) return;
    try {
      await unapplyJobMutation.mutateAsync(selectedJob.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "move_to_ready",
        result: "success",
        from_status: selectedJob.status,
        to_status: "ready",
      });
      toast.success("Moved back to ready");
      await onJobUpdated();
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "move_to_ready",
        result: "error",
        from_status: selectedJob.status,
        to_status: "ready",
      });
      const message =
        error instanceof Error ? error.message : "Failed to move back to ready";
      toast.error(message);
    }
  };

  const handleMoveToInProgress = async () => {
    if (!selectedJob) return;
    try {
      await api.updateJob(selectedJob.id, { status: "in_progress" });
      trackProductEvent("jobs_job_action_completed", {
        action: "move_in_progress",
        result: "success",
        from_status: selectedJob.status,
        to_status: "in_progress",
      });
      toast.success("Moved to in progress");
      await onJobUpdated();
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "move_in_progress",
        result: "error",
        from_status: selectedJob.status,
        to_status: "in_progress",
      });
      const message =
        error instanceof Error
          ? error.message
          : "Failed to move to in progress";
      toast.error(message);
    }
  };

  const handleCopyInfo = async () => {
    if (!selectedJob) return;
    try {
      await copyTextToClipboard(formatJobForWebhook(selectedJob));
      toast.success("Copied job info", {
        description: "Webhook payload copied to clipboard.",
      });
    } catch {
      toast.error("Could not copy job info");
    }
  };

  const handleDownloadCoverLetter = useCallback(() => {
    if (!selectedJob) return;
    window.open(
      `/job/${selectedJob.id}/cover-letter?print=1`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [selectedJob]);

  const handleJobMoved = useCallback(
    (jobId: string) => {
      const currentIndex = activeJobs.findIndex((job) => job.id === jobId);
      const nextJob =
        activeJobs[currentIndex + 1] || activeJobs[currentIndex - 1];
      onSelectJobId(nextJob?.id ?? null);
    },
    [activeJobs, onSelectJobId],
  );

  const selectedHasPdf = !!selectedJob?.pdfPath;
  const selectedJobLink = selectedJob ? getJobListingUrl(selectedJob) : "#";
  const selectedPdfHref = selectedJob
    ? `/pdfs/resume_${selectedJob.id}.pdf?v=${encodeURIComponent(selectedJob.updatedAt)}`
    : "#";
  const canApply = selectedJob?.status === "ready";
  const canMoveToInProgress = selectedJob?.status === "applied";
  const canProcess = selectedJob
    ? ["discovered", "ready"].includes(selectedJob.status)
    : false;
  const canSkip = selectedJob
    ? ["discovered", "ready"].includes(selectedJob.status)
    : false;
  const showReadyPdf = activeTab === "ready";
  const showGeneratePdf = activeTab === "discovered";
  const isProcessingSelected = selectedJob
    ? processingJobId === selectedJob.id || selectedJob.status === "processing"
    : false;

  if (activeTab === "discovered") {
    return (
      <DiscoveredPanel
        job={selectedJob}
        onJobUpdated={onJobUpdated}
        onJobMoved={handleJobMoved}
        onTailoringDirtyChange={handleTailoringDirtyChange}
      />
    );
  }

  if (activeTab === "ready") {
    return (
      <ReadyPanel
        job={selectedJob}
        onJobUpdated={onJobUpdated}
        onJobMoved={handleJobMoved}
        onTailoringDirtyChange={handleTailoringDirtyChange}
      />
    );
  }

  if (!selectedJob) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-1 text-center">
        <div className="text-sm font-medium text-muted-foreground">
          No job selected
        </div>
        <p className="text-xs text-muted-foreground/70">
          Select a job to view details
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <JobHeader
        job={selectedJob}
        onCheckSponsor={async () => {
          try {
            await api.checkSponsor(selectedJob.id);
            trackProductEvent("jobs_job_action_completed", {
              action: "check_sponsor",
              result: "success",
              from_status: selectedJob.status,
            });
            await onJobUpdated();
          } catch (error) {
            trackProductEvent("jobs_job_action_completed", {
              action: "check_sponsor",
              result: "error",
              from_status: selectedJob.status,
            });
            throw error;
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
        >
          <a href={selectedJobLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </a>
        </Button>

        {showReadyPdf &&
          (selectedHasPdf ? (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
            >
              <a
                href={selectedPdfHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="h-3.5 w-3.5" />
                PDF
              </a>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              disabled
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </Button>
          ))}

        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
        >
          <a
            href={`/job/${selectedJob.id}/cover-letter`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText className="h-3.5 w-3.5" />
            View Cover Letter
          </a>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
          onClick={handleDownloadCoverLetter}
        >
          <Download className="h-3.5 w-3.5" />
          Cover Letter PDF
        </Button>

        {showGeneratePdf && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={handleProcess}
            disabled={!canProcess || isProcessingSelected}
          >
            {isProcessingSelected ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            {isProcessingSelected ? "Generating..." : "Generate"}
          </Button>
        )}

        {canApply && (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30"
            onClick={handleApply}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Applied
          </Button>
        )}

        {canMoveToInProgress && (
          <>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 border border-cyan-500/30"
              onClick={handleMoveToInProgress}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Move to In Progress
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={handleMoveBackToReady}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Move Back To Ready
            </Button>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canProcess && !showGeneratePdf && (
              <DropdownMenuItem
                onSelect={() => void handleProcess()}
                disabled={isProcessingSelected}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {isProcessingSelected
                  ? "Processing..."
                  : selectedJob.status === "ready"
                    ? "Regenerate PDF"
                    : "Generate PDF"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                setDetailTab("description");
                setIsEditingDescription(true);
              }}
            >
              <Edit2 className="mr-2 h-4 w-4" />
              Edit description
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsEditDetailsOpen(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleCopyInfo()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy info
            </DropdownMenuItem>
            {selectedHasPdf && (
              <>
                {!showReadyPdf && (
                  <DropdownMenuItem asChild>
                    <a
                      href={selectedPdfHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View PDF
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <a
                    href={selectedPdfHref}
                    download={`${safeFilenamePart(personName || "Unknown")}_${safeFilenamePart(selectedJob.employer || "Unknown")}.pdf`}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download CV
                  </a>
                </DropdownMenuItem>
              </>
            )}
            {canSkip && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void handleSkip()}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Skip job
                </DropdownMenuItem>
              </>
            )}
            {selectedJob?.status === "applied" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleMoveBackToReady()}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Move back to ready
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Tabs
        value={detailTab}
        onValueChange={(value) => setDetailTab(value as typeof detailTab)}
      >
        <TabsList className="h-auto flex-wrap justify-start gap-1 text-xs">
          <TabsTrigger value="overview" className="text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="tailoring" className="text-xs">
            Tailoring
          </TabsTrigger>
          <TabsTrigger value="description" className="text-xs">
            Description
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 pt-2">
          <FitAssessment job={selectedJob} />
          <TailoredSummary job={selectedJob} />

          {decisionBrief && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Decision brief
                </div>
                <div className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                  {decisionBrief.recommendationLabel}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/50 bg-background/70 p-3">
                  <div className="font-medium text-foreground/90">
                    Why this could be worth it
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {decisionBrief.whyApply.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border/50 bg-background/70 p-3">
                  <div className="font-medium text-foreground/90">
                    Main watchouts
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {decisionBrief.watchouts.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {documentStrategy && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-3 text-xs">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Document strategy
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/50 bg-background/70 p-3">
                  <div className="font-medium text-foreground/90">Role angle</div>
                  <div className="mt-1 text-muted-foreground">
                    {documentStrategy.roleAngle}
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-background/70 p-3">
                  <div className="font-medium text-foreground/90">Cover letter angle</div>
                  <div className="mt-1 text-muted-foreground">
                    {documentStrategy.coverLetterAngle}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/50 bg-background/70 p-3">
                  <div className="font-medium text-foreground/90">Strongest evidence</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {documentStrategy.strongestEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border/50 bg-background/70 p-3">
                  <div className="font-medium text-foreground/90">Priority JD terms</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {documentStrategy.priorityTerms.map((item) => (
                      <div
                        key={item}
                        className="rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[11px] text-foreground/80"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {recommendedProofPoints.length > 0 ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Recommended proof points for this job
                </div>
                <Button size="sm" variant="outline" onClick={() => void handleRecommendTopProofPoints()}>
                  Recommend top 3 proof points
                </Button>
              </div>
              <div className="grid gap-3">
                {recommendedProofPoints.map((item) => (
                  <div key={item.project.id} className="rounded-md border border-border/50 bg-background/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground/90">{item.project.name}</div>
                        <div className="mt-1 text-muted-foreground">Recommendation score {item.score}</div>
                      </div>
                      <Button size="sm" variant={selectedProofPointIds.has(item.project.id) ? "secondary" : "outline"} onClick={() => void handleUseProofPointForJob(item.project.id)}>
                        {selectedProofPointIds.has(item.project.id) ? "Selected" : "Use for this job"}
                      </Button>
                    </div>
                    <div className="mt-2 text-muted-foreground">{item.project.summary}</div>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                      {item.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs space-y-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              AI tailoring audit
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border/50 bg-background/70 p-3">
                <div className="font-medium text-foreground/90">
                  Section rationale
                </div>
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {tailoringAudit.sectionRationale || "-"}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/70 p-3">
                <div className="font-medium text-foreground/90">
                  Omission rationale
                </div>
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {tailoringAudit.omissionRationale || "-"}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border/50 bg-background/70 p-3 space-y-2">
              <div className="font-medium text-foreground/90">
                Section order
              </div>
              {sectionOrder.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {sectionOrder.map((sectionId, index) => (
                    <div
                      key={sectionId}
                      className="rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[11px] text-foreground/80"
                    >
                      {index + 1}. {sectionId}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  No section reordering suggested.
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border/50 bg-background/70 p-3">
                <div className="font-medium text-foreground/90">
                  Hidden sections
                </div>
                {hiddenSections.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {hiddenSections.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-muted-foreground">None</div>
                )}
              </div>
              <div className="rounded-md border border-border/50 bg-background/70 p-3">
                <div className="font-medium text-foreground/90">
                  Hidden projects
                </div>
                {hiddenProjectIds.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {hiddenProjectIds.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-muted-foreground">None</div>
                )}
              </div>
              <div className="rounded-md border border-border/50 bg-background/70 p-3">
                <div className="font-medium text-foreground/90">
                  Hidden experience
                </div>
                {hiddenExperienceIds.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {hiddenExperienceIds.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-muted-foreground">None</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-medium text-foreground/90">
                Experience edits
              </div>
              {tailoringAudit.experienceEdits.length > 0 ? (
                tailoringAudit.experienceEdits.map((edit) => (
                  <div
                    key={edit.id}
                    className="rounded-md border border-border/50 bg-background/70 p-3 space-y-2"
                  >
                    <div className="text-[11px] font-medium text-foreground/90">
                      {edit.id}
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      {edit.bullets.map((bullet, index) => (
                        <li key={`${edit.id}-${index}`}>{bullet}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border/50 bg-background/40 p-3 text-muted-foreground">
                  No experience rewrites saved for this job yet.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                Discipline
              </div>
              <div className="text-foreground/80">
                {selectedJob.disciplines || "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                Function
              </div>
              <div className="text-foreground/80">
                {selectedJob.jobFunction || "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                Level
              </div>
              <div className="text-foreground/80">
                {selectedJob.jobLevel || "-"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                Type
              </div>
              <div className="text-foreground/80">
                {selectedJob.jobType || "-"}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              className="w-full text-left rounded border border-border/30 bg-muted/5 px-2.5 py-2 text-[11px] text-muted-foreground/80 line-clamp-4 whitespace-pre-wrap leading-relaxed hover:bg-muted/10 transition-colors"
              onClick={() => setDetailTab("description")}
            >
              {description}
            </button>
            <div className="text-center">
              <button
                type="button"
                className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                onClick={() => setDetailTab("description")}
              >
                View full description
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tailoring" className="pt-3">
          <TailoringEditor
            job={selectedJob}
            onUpdate={onJobUpdated}
            onDirtyChange={handleTailoringDirtyChange}
            onRegisterSave={(save) => {
              saveTailoringRef.current = save;
            }}
            onBeforeGenerate={() =>
              confirmAndSaveEdits({ includeTailoring: false })
            }
          />
        </TabsContent>

        <TabsContent value="description" className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Job description
            </div>
            <div className="flex items-center gap-1">
              {!isEditingDescription ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingDescription(true)}
                  className="h-8 px-2 text-xs"
                >
                  <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingDescription(false);
                      setEditedDescription(selectedJob.jobDescription || "");
                    }}
                    className="h-8 px-2 text-xs text-muted-foreground"
                    disabled={isSavingDescription}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSaveDescription}
                    className="h-8 px-3 text-xs"
                    disabled={isSavingDescription}
                  >
                    {isSavingDescription ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save Changes
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Description actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      void copyTextToClipboard(
                        selectedJob.jobDescription || "",
                      );
                      toast.success("Copied raw description");
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy raw text
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
            {isEditingDescription ? (
              <div className="space-y-3">
                <Textarea
                  value={editedDescription}
                  onChange={(event) => setEditedDescription(event.target.value)}
                  className="min-h-[400px] font-mono text-sm leading-relaxed focus-visible:ring-1"
                  placeholder="Enter job description..."
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditingDescription(false);
                      setEditedDescription(selectedJob.jobDescription || "");
                    }}
                    disabled={isSavingDescription}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveDescription}
                    disabled={isSavingDescription}
                  >
                    {isSavingDescription ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Save Description
                  </Button>
                </div>
              </div>
            ) : renderMarkdownInJobDescriptions ? (
              <JobDescriptionMarkdown description={description} />
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed">
                {description}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <JobDetailsEditDrawer
        open={isEditDetailsOpen}
        onOpenChange={setIsEditDetailsOpen}
        job={selectedJob}
        onJobUpdated={onJobUpdated}
      />
    </div>
  );
};
