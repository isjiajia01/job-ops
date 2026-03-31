import {
  type ApplicationStage,
  type ApplicationTask,
  type Application,
  type JobOutcome,
  STAGE_LABELS,
  type StageEvent,
} from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Copy,
  DollarSign,
  Download,
  Edit2,
  FileText,
  MessageSquareText,
  MoreHorizontal,
  PlusCircle,
  RefreshCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { invalidateApplicationData } from "@/client/hooks/queries/invalidateApplicationData";
import {
  useCheckApplicationSponsorMutation,
  useGenerateApplicationPdfMutation,
  useMarkApplicationAppliedMutation,
  useRescoreApplicationMutation,
  useSkipApplicationMutation,
  useUnapplyApplicationMutation,
  useUpdateApplicationMutation,
} from "@/client/hooks/queries/useApplicationMutations";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { downloadCoverLetterPdfForJob } from "@/client/lib/cover-letter-pdf";
import { downloadCvPdfForJob } from "@/client/lib/cv-pdf";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  copyTextToClipboard,
  formatJobForWebhook,
  formatTimestamp,
} from "@/lib/utils";
import * as api from "../api";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { GhostwriterDrawer } from "../components/ghostwriter/GhostwriterDrawer";
import { GhostwriterPanel } from "../components/ghostwriter/GhostwriterPanel";
import { ApplicationDetailsEditDrawer } from "../components/ApplicationDetailsEditDrawer";
import { ApplicationHeader } from "../components/ApplicationHeader";
import {
  type LogEventFormValues,
  LogEventModal,
} from "../components/LogEventModal";
import { ApplicationTimeline } from "./application/Timeline";

export const ApplicationWorkspacePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLogModalOpen, setIsLogModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = React.useState(false);
  const [activeAction, setActiveAction] = React.useState<string | null>(null);
  const [eventToDelete, setEventToDelete] = React.useState<string | null>(null);
  const [editingEvent, setEditingEvent] = React.useState<StageEvent | null>(
    null,
  );
  const pendingEventRef = React.useRef<StageEvent | null>(null);

  const jobQuery = useQuery<Application | null>({
    queryKey: queryKeys.applications.detail(id ?? "missing"),
    queryFn: () => (id ? api.getApplication(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
  const eventsQuery = useQuery<StageEvent[]>({
    queryKey: id
      ? queryKeys.applications.stageEvents(id)
      : (["applications", "stage-events", null] as const),
    queryFn: () =>
      id ? api.getApplicationStageEvents(id) : Promise.resolve([]),
    enabled: Boolean(id),
  });
  const tasksQuery = useQuery<ApplicationTask[]>({
    queryKey: id
      ? queryKeys.applications.tasks(id)
      : (["applications", "tasks", null] as const),
    queryFn: () => (id ? api.getApplicationTasks(id) : Promise.resolve([])),
    enabled: Boolean(id),
  });

  useQueryErrorToast(
    jobQuery.error,
    "Failed to load application details. Please try again.",
  );
  useQueryErrorToast(
    eventsQuery.error,
    "Failed to load application timeline. Please try again.",
  );
  useQueryErrorToast(
    tasksQuery.error,
    "Failed to load application tasks. Please try again.",
  );

  const markAsAppliedMutation = useMarkApplicationAppliedMutation();
  const unapplyJobMutation = useUnapplyApplicationMutation();
  const updateJobMutation = useUpdateApplicationMutation();
  const skipJobMutation = useSkipApplicationMutation();
  const rescoreJobMutation = useRescoreApplicationMutation();
  const generatePdfMutation = useGenerateApplicationPdfMutation();
  const checkSponsorMutation = useCheckApplicationSponsorMutation();

  const job = jobQuery.data ?? null;
  const events = mergeEvents(eventsQuery.data ?? [], pendingEventRef.current);
  const tasks = tasksQuery.data ?? [];
  const isLoading =
    jobQuery.isLoading || eventsQuery.isLoading || tasksQuery.isLoading;

  const loadData = React.useCallback(async () => {
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.applications.detail(id),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.applications.stageEvents(id),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.applications.tasks(id),
      }),
    ]);
  }, [id, queryClient]);

  const handleLogEvent = async (
    values: LogEventFormValues,
    eventId?: string,
  ) => {
    if (!job) return;
    if (job.status !== "in_progress") {
      toast.error("Move this application to In Progress to track stages.");
      return;
    }

    let toStage: ApplicationStage | "no_change" = values.stage as
      | ApplicationStage
      | "no_change";
    let outcome: JobOutcome | null = null;

    if (values.stage === "rejected") {
      toStage = "closed";
      outcome = "rejected";
    } else if (values.stage === "withdrawn") {
      toStage = "closed";
      outcome = "withdrawn";
    }

    const currentStage = events.at(-1)?.toStage ?? "applied";
    const effectiveStage =
      toStage === "no_change" ? (currentStage ?? "applied") : toStage;

    try {
      if (eventId) {
        await api.updateApplicationStageEvent(job.id, eventId, {
          toStage: toStage === "no_change" ? undefined : toStage,
          occurredAt: toTimestamp(values.date) ?? undefined,
          metadata: {
            note: values.notes?.trim() || undefined,
            eventLabel: values.title.trim() || undefined,
            reasonCode: values.reasonCode || undefined,
            actor: "user",
            eventType: values.stage === "no_change" ? "note" : "status_update",
            externalUrl: values.salary ? `Salary: ${values.salary}` : undefined,
          },
          outcome,
        });
      } else {
        const newEvent = await api.transitionApplicationStage(job.id, {
          toStage: effectiveStage,
          occurredAt: toTimestamp(values.date),
          metadata: {
            note: values.notes?.trim() || undefined,
            eventLabel: values.title.trim() || undefined,
            reasonCode: values.reasonCode || undefined,
            actor: "user",
            eventType: values.stage === "no_change" ? "note" : "status_update",
            externalUrl: values.salary ? `Salary: ${values.salary}` : undefined,
          },
          outcome,
        });
        pendingEventRef.current = newEvent;
      }

      await invalidateApplicationData(queryClient, job.id);
      pendingEventRef.current = null;
      setEditingEvent(null);
      toast.success(eventId ? "Event updated" : "Event logged");

      if (effectiveStage === "offer") {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#10b981", "#34d399", "#6ee7b7", "#ffffff"],
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to log event";
      toast.error(message);
    }
  };

  const confirmDeleteEvent = (eventId: string) => {
    setEventToDelete(eventId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!job || !eventToDelete) return;
    try {
      await api.deleteApplicationStageEvent(job.id, eventToDelete);
      await invalidateApplicationData(queryClient, job.id);
      toast.success("Event deleted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete event";
      toast.error(message);
    } finally {
      setIsDeleteModalOpen(false);
      setEventToDelete(null);
    }
  };

  const handleEditEvent = (event: StageEvent) => {
    setEditingEvent(event);
    setIsLogModalOpen(true);
  };

  const runAction = React.useCallback(
    async (actionKey: string, task: () => Promise<void>) => {
      if (!job) return;
      try {
        setActiveAction(actionKey);
        await task();
        await loadData();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to run action";
        toast.error(message);
      } finally {
        setActiveAction(null);
      }
    },
    [job, loadData],
  );

  const handleMarkApplied = async () => {
    await runAction("mark-applied", async () => {
      if (!job) return;
      await markAsAppliedMutation.mutateAsync(job.id);
      toast.success("Marked as applied");
    });
  };

  const handleDownloadCoverLetter = React.useCallback(() => {
    if (!job) return;
    void downloadCoverLetterPdfForJob(job.id).catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to download cover letter PDF";
      toast.error(message);
    });
  }, [job]);

  const handleMoveToInProgress = async () => {
    await runAction("move-in-progress", async () => {
      if (!job) return;
      await updateJobMutation.mutateAsync({
        id: job.id,
        update: { status: "in_progress" },
      });
      toast.success("Moved to in progress");
    });
  };

  const handleMoveBackToReady = async () => {
    await runAction("move-back-ready", async () => {
      if (!job) return;
      await unapplyJobMutation.mutateAsync(job.id);
      toast.success("Moved back to ready");
    });
  };

  const handleSkip = async () => {
    await runAction("skip", async () => {
      if (!job) return;
      await skipJobMutation.mutateAsync(job.id);
      toast.message("Application skipped");
    });
  };

  const handleRescore = async () => {
    await runAction("rescore", async () => {
      if (!job) return;
      await rescoreJobMutation.mutateAsync(job.id);
      toast.success("Match recalculated");
    });
  };

  const handleRegeneratePdf = async () => {
    await runAction("regenerate-pdf", async () => {
      if (!job) return;
      await generatePdfMutation.mutateAsync(job.id);
      toast.success("Resume PDF generated");
    });
  };

  const handleCheckSponsor = async () => {
    await runAction("check-sponsor", async () => {
      if (!job) return;
      await checkSponsorMutation.mutateAsync(job.id);
      toast.success("Sponsor check completed");
    });
  };

  const handleCopyJobInfo = async () => {
    if (!job) return;
    try {
      await copyTextToClipboard(formatJobForWebhook(job));
      toast.success("Copied application info", {
        description: "Webhook payload copied to clipboard.",
      });
    } catch {
      toast.error("Could not copy job info");
    }
  };

  const currentStage = job
    ? (events.at(-1)?.toStage ??
      (job.status === "applied" || job.status === "in_progress"
        ? "applied"
        : null))
    : null;
  const isClosedStage = currentStage === "closed";
  const canTrackStages = job?.status === "in_progress";
  const canLogEvents = canTrackStages && !isClosedStage;
  const pdfHref = job?.pdfPath
    ? `/pdfs/resume_${job.id}.pdf?v=${encodeURIComponent(job.updatedAt)}`
    : null;
  const cvHref = job ? `/applications/${job.id}/cv` : null;
  const coverLetterHref = job ? `/applications/${job.id}/cover-letter` : null;
  const isBusy = activeAction !== null;
  const isDiscovered = job?.status === "discovered";
  const isReady = job?.status === "ready";
  const isApplied = job?.status === "applied";
  const isInProgress = job?.status === "in_progress";

  if (!id) {
    return null;
  }

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6 pb-12">
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/applications")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Applications
        </Button>
      </div>

      {job ? (
        <ApplicationHeader
          job={job}
          className="rounded-lg border border-border/40 bg-muted/5 p-4"
          onCheckSponsor={handleCheckSponsor}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-sm text-muted-foreground">
          {isLoading ? "Loading application..." : "Application not found."}
        </div>
      )}

      {job && (
        <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/65">
          <div className="mb-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Workspace focus
              </div>
              <div className="mt-2 text-base font-semibold">
                Tailor the story for this application
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Use Ghostwriter, CV preview, and cover letter tools around this single role instead of hopping between pipeline screens.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Current state
              </div>
              <div className="mt-2 text-base font-semibold">
                {currentStage
                  ? STAGE_LABELS[currentStage as ApplicationStage] || currentStage
                  : job.status}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {job.outcome
                  ? `Outcome: ${job.outcome.replace(/_/g, " ")}`
                  : "Open application — keep tailoring, applying, or logging follow-up steps."}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Next assets
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {cvHref && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <a href={cvHref} target="_blank" rel="noopener noreferrer">
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      CV Preview
                    </a>
                  </Button>
                )}
                {coverLetterHref && (
                  <Button asChild size="sm" variant="outline" className="h-8">
                    <a
                      href={coverLetterHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Cover Letter
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {(pdfHref || cvHref) && (
                <Button
                  asChild
                  size="sm"
                  className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                >
                  <a
                    href={pdfHref || cvHref || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    View CV
                  </a>
                </Button>
              )}

              {job && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                  onClick={() => {
                    void downloadCvPdfForJob(job.id).catch((error) => {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Failed to download CV PDF";
                      toast.error(message);
                    });
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download CV PDF
                </Button>
              )}

              {isReady && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-orange-400/50 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20"
                    onClick={() => void handleMarkApplied()}
                    disabled={isBusy}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Mark Applied
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-border/60 bg-background/30"
                    onClick={() => void handleSkip()}
                    disabled={isBusy}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Skip Job
                  </Button>
                </>
              )}

              {isApplied && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                  onClick={handleMoveBackToReady}
                  disabled={isBusy}
                >
                  <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                  Move Back To Drafting
                </Button>
              )}

              {isDiscovered && (
                <>
                  <Button
                    size="sm"
                    className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                    onClick={() => navigate(`/applications/${job.id}`)}
                    disabled={isBusy}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Start Ghostwriter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-border/60 bg-background/30"
                    onClick={() => void handleSkip()}
                    disabled={isBusy}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Skip Job
                  </Button>
                </>
              )}

              {isApplied && (
                <Button
                  size="sm"
                  className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                  onClick={() => void handleMoveToInProgress()}
                  disabled={isBusy}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Move to In Progress
                </Button>
              )}

              {isInProgress && (
                <Button
                  size="sm"
                  className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                  onClick={() => setIsLogModalOpen(true)}
                  disabled={!canLogEvents || isBusy}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Log Event
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isReady && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                  onClick={() => navigate(`/applications/${job.id}`)}
                  disabled={isBusy}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Open Tailoring Editor
                </Button>
              )}

              {(pdfHref || cvHref) && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                >
                  <a
                    href={pdfHref || cvHref || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    View CV
                  </a>
                </Button>
              )}

              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-9 border-border/60 bg-background/30"
              >
                <a
                  href={coverLetterHref || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  View Cover Letter
                </a>
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-9 border-border/60 bg-background/30"
                onClick={handleDownloadCoverLetter}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download Cover Letter PDF
              </Button>

              {isReady && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                  onClick={() => void handleRegeneratePdf()}
                  disabled={isBusy}
                >
                  <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                  Regenerate PDF
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 border-border/60 bg-background/30"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setIsEditDetailsOpen(true)}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleCopyJobInfo()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy job info
                  </DropdownMenuItem>
                  {(isReady || isDiscovered) && (
                    <DropdownMenuItem onSelect={() => void handleRescore()}>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Recalculate match
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void handleCheckSponsor()}>
                    Check sponsorship status
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]">
        <div className="space-y-6">
          <Card className="border-border/50 overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText className="h-4 w-4" />
                    Ghostwriter workspace
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This is now the center of the application workflow: iterate on role fit, tailored bullets, and cover-letter language here.
                  </p>
                </div>
                <GhostwriterDrawer job={job} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[620px] min-h-[520px] p-4">
                {job ? <GhostwriterPanel job={job} /> : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4" />
                  Application timeline
                </CardTitle>
                <div className="flex items-center gap-2">
                  {job?.salary && (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      <DollarSign className="mr-1 h-3.5 w-3.5" />
                      {job.salary}
                    </Badge>
                  )}
                  {currentStage && (
                    <Badge
                      variant="secondary"
                      className="px-3 py-1 text-xs font-medium uppercase tracking-wider"
                    >
                      {STAGE_LABELS[currentStage as ApplicationStage] ||
                        currentStage}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!canTrackStages && (
                <div className="mb-4 rounded-md border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                  Move this application to In Progress to track interviews, follow-ups, and other stages.
                </div>
              )}
              {canTrackStages && isClosedStage && (
                <div className="mb-4 rounded-md border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                  This application is closed. Stage logging is disabled.
                </div>
              )}
              <ApplicationTimeline
                events={events}
                onEdit={canLogEvents ? handleEditEvent : undefined}
                onDelete={canLogEvents ? confirmDeleteEvent : undefined}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4" />
                  Workspace details
                </CardTitle>
                <GhostwriterDrawer job={job} triggerClassName="h-8 text-xs" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Current Stage
                </div>
                <div className="mt-1 text-sm font-medium">
                  {currentStage
                    ? STAGE_LABELS[currentStage as ApplicationStage] ||
                      currentStage
                    : job?.status}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Outcome
                </div>
                <div className="mt-1 text-sm font-medium">
                  {job?.outcome ? job.outcome.replace(/_/g, " ") : "Open"}
                </div>
              </div>
              {job?.closedAt && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Closed On
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {formatTimestamp(job.closedAt)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {tasks.length > 0 && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4" />
                  Upcoming tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground/90">
                          {task.title}
                        </div>
                        {task.notes && (
                          <div className="text-xs text-muted-foreground">
                            {task.notes}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {formatTimestamp(task.dueDate)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <LogEventModal
        isOpen={isLogModalOpen}
        onClose={() => {
          setIsLogModalOpen(false);
          setEditingEvent(null);
        }}
        onLog={handleLogEvent}
        editingEvent={editingEvent}
      />

      <ConfirmDelete
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setEventToDelete(null);
        }}
        onConfirm={handleDeleteEvent}
      />

      <ApplicationDetailsEditDrawer
        open={isEditDetailsOpen}
        onOpenChange={setIsEditDetailsOpen}
        application={job}
        onApplicationUpdated={loadData}
      />
    </main>
  );
};

const toTimestamp = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
};

const mergeEvents = (events: StageEvent[], pending: StageEvent | null) => {
  if (!pending) return events;
  if (events.some((event) => event.id === pending.id)) return events;
  return [...events, pending].sort((a, b) => a.occurredAt - b.occurredAt);
};
