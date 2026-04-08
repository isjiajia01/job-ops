import {
  type Application,
  type ApplicationStage,
  type ApplicationTask,
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
  ExternalLink,
  FileText,
  MessageSquareText,
  MoreHorizontal,
  PlusCircle,
  RefreshCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import React, { Suspense } from "react";
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
import { saveApplicationDocumentsWithPrompt } from "@/client/lib/application-document-bundle";
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
import { ApplicationDetailsEditDrawer } from "../components/ApplicationDetailsEditDrawer";
import { ApplicationHeader } from "../components/ApplicationHeader";
import { ConfirmDelete } from "../components/ConfirmDelete";
const GhostwriterDrawer = React.lazy(() =>
  import("../components/ghostwriter/GhostwriterDrawer").then((module) => ({
    default: module.GhostwriterDrawer,
  })),
);
const GhostwriterPanel = React.lazy(() =>
  import("../components/ghostwriter/GhostwriterPanel").then((module) => ({
    default: module.GhostwriterPanel,
  })),
);
import {
  type LogEventFormValues,
  LogEventModal,
} from "../components/LogEventModal";
import { ApplicationTimeline } from "./application/Timeline";

const GhostwriterLoadingFallback: React.FC = () => (
  <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
    Loading Ghostwriter…
  </div>
);

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

  const handleExportDocuments = React.useCallback(() => {
    if (!job) return;
    void runAction("export-documents", async () => {
      const result = await saveApplicationDocumentsWithPrompt(job.id);
      if (result.method === "directory-picker") {
        toast.success("Saved CV + cover letter to selected folder", {
          description: result.fileNames.join(" · "),
        });
        return;
      }

      toast.success("Downloaded CV + cover letter zip", {
        description: result.fileNames.join(" · "),
      });
    });
  }, [job, runAction]);

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
    if (!job) return;
    const confirmed = window.confirm(
      `Delete this ${job.status === "ready" ? "ready-to-apply" : "draft"} application from JobOps? This cannot be undone.`,
    );
    if (!confirmed) return;

    await runAction("skip", async () => {
      await skipJobMutation.mutateAsync(job.id);
      toast.message("Application deleted");
      navigate("/applications", { replace: true });
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
  const workspaceFocusTitle = isDiscovered
    ? "Decide whether this role is worth tailoring"
    : isReady
      ? "Finish the package and submit with confidence"
      : isApplied
        ? "Keep the submission tidy and ready for follow-up"
        : "Track the live process without the clutter";
  const workspaceFocusDescription = isDiscovered
    ? "Review fit, generate a first pass, and only keep applications that deserve attention."
    : isReady
      ? "Use Ghostwriter, CV preview, and the cover letter in one place, then download the final package when it is ready."
      : isApplied
        ? "The writing work is mostly done now — keep the timeline, notes, and next actions focused."
        : "This workspace should help you see the signal fast: current stage, next step, and the few links that matter.";
  const quickFacts = job
    ? [
        { label: "Location", value: job.location },
        { label: "Deadline", value: job.deadline },
        { label: "Salary", value: job.salary },
        { label: "Source", value: job.source },
      ].filter((fact): fact is { label: string; value: string } =>
        Boolean(fact.value?.trim()),
      )
    : [];
  const referenceLinks = job
    ? [
        { label: "Source listing", href: job.jobUrl },
        { label: "Apply link", href: job.applicationLink },
        {
          label: "Company site",
          href: job.companyUrlDirect || job.employerUrl,
        },
      ].filter((link): link is { label: string; href: string } =>
        Boolean(link.href?.trim()),
      )
    : [];

  if (!id) {
    return null;
  }

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6 pb-12">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-background/70 px-3 py-2 shadow-sm backdrop-blur-sm">
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
        <div className="rounded-2xl border border-border/60 bg-card/85 p-5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex-1 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]"
                >
                  {currentStage
                    ? STAGE_LABELS[currentStage as ApplicationStage] ||
                      currentStage
                    : job.status}
                </Badge>
                {job.outcome && (
                  <Badge variant="outline" className="px-3 py-1 text-xs">
                    Outcome: {job.outcome.replace(/_/g, " ")}
                  </Badge>
                )}
                {typeof job.suitabilityScore === "number" && (
                  <Badge variant="outline" className="px-3 py-1 text-xs">
                    Match {job.suitabilityScore}%
                  </Badge>
                )}
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
                <div className="rounded-xl border border-border/60 bg-background/40 p-4 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    Workspace focus
                  </div>
                  <div className="mt-2 text-lg font-semibold">
                    {workspaceFocusTitle}
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {workspaceFocusDescription}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {quickFacts.slice(0, 3).map((fact) => (
                    <div
                      key={fact.label}
                      className="rounded-xl border border-border/60 bg-background/30 p-3 shadow-sm"
                    >
                      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {fact.label}
                      </div>
                      <div className="mt-1 text-sm font-medium leading-5 text-foreground/90">
                        {fact.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-border/60 bg-background/30 p-3 shadow-sm">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Do next
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isReady && (
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
                    )}

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

                    {isDiscovered && (
                      <Button
                        size="sm"
                        className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                        onClick={() => navigate(`/applications/${job.id}`)}
                        disabled={isBusy}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Start Ghostwriter
                      </Button>
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

                    {(isReady || isDiscovered) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 border-border/60 bg-background/30"
                        onClick={() => void handleSkip()}
                        disabled={isBusy}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Delete Job
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/30 p-3 shadow-sm">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Documents
                  </div>
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
                      onClick={handleExportDocuments}
                      disabled={isBusy}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download CV + Cover Letter
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
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start justify-end">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.78fr)]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-border/50 shadow-sm">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText className="h-4 w-4" />
                    Ghostwriter workspace
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This is now the center of the application workflow: iterate
                    on role fit, tailored bullets, and cover-letter language
                    here.
                  </p>
                </div>
                <Suspense fallback={null}>
                  <GhostwriterDrawer job={job} />
                </Suspense>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[620px] min-h-[520px] p-4">
                <Suspense fallback={<GhostwriterLoadingFallback />}>
                  {job ? <GhostwriterPanel job={job} /> : null}
                </Suspense>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
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
                  Move this application to In Progress to track interviews,
                  follow-ups, and other stages.
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

        <div className="space-y-3 self-start lg:sticky lg:top-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                Application brief
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-lg border border-border/60 bg-muted/10 p-2.5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Current stage
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {currentStage
                      ? STAGE_LABELS[currentStage as ApplicationStage] ||
                        currentStage
                      : job?.status}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/10 p-2.5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Outcome
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {job?.outcome ? job.outcome.replace(/_/g, " ") : "Open"}
                  </div>
                </div>
                {quickFacts.map((fact) => (
                  <div
                    key={fact.label}
                    className="rounded-lg border border-border/60 bg-muted/10 p-2.5"
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {fact.label}
                    </div>
                    <div className="mt-1 text-sm font-medium leading-5 text-foreground/90">
                      {fact.value}
                    </div>
                  </div>
                ))}
                {job?.closedAt && (
                  <div className="rounded-lg border border-border/60 bg-muted/10 p-2.5">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Closed on
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {formatTimestamp(job.closedAt)}
                    </div>
                  </div>
                )}
              </div>

              {referenceLinks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Key links
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {referenceLinks.map((link) => (
                      <Button
                        key={link.label}
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7 border-border/60 bg-background/40 px-2.5 text-xs"
                      >
                        <a href={link.href} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          {link.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {job?.suitabilityReason && (
                <div className="rounded-lg border border-border/60 bg-background/30 p-2.5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Match rationale
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {job.suitabilityReason}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {tasks.length > 0 && (
            <Card className="border-border/50 shadow-sm">
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
