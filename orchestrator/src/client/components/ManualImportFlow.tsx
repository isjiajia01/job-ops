import * as api from "@client/api";
import type { Job, ManualJobDraft } from "@shared/types.js";
import { getGhostwriterCoverLetterDraft } from "@shared/utils/ghostwriter";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  Download,
  ExternalLink,
  FileText,
  Link,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { downloadCoverLetterPdfForJob } from "@/client/lib/cover-letter-pdf";
import { downloadCvPdfForJob } from "@/client/lib/cv-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { COVER_LETTER_PROMPTS } from "./ghostwriter/prompt-presets";

type ManualImportStep = "paste" | "loading" | "review" | "preparing" | "ready";

type ManualJobDraftState = {
  title: string;
  employer: string;
  jobUrl: string;
  applicationLink: string;
  location: string;
  salary: string;
  deadline: string;
  jobDescription: string;
  jobType: string;
  jobLevel: string;
  jobFunction: string;
  disciplines: string;
  degreeRequired: string;
  starting: string;
};

const emptyDraft: ManualJobDraftState = {
  title: "",
  employer: "",
  jobUrl: "",
  applicationLink: "",
  location: "",
  salary: "",
  deadline: "",
  jobDescription: "",
  jobType: "",
  jobLevel: "",
  jobFunction: "",
  disciplines: "",
  degreeRequired: "",
  starting: "",
};

const STEP_INDEX_BY_ID: Record<ManualImportStep, number> = {
  paste: 0,
  loading: 1,
  review: 2,
  preparing: 2,
  ready: 3,
};

const STEP_LABEL_BY_ID: Record<ManualImportStep, string> = {
  paste: "Paste JD",
  loading: "Infer details",
  review: "Review & import",
  preparing: "Generate kit",
  ready: "Downloads ready",
};

const DEFAULT_COVER_LETTER_PROMPT_ID =
  COVER_LETTER_PROMPTS.find((preset) => preset.id === "cover-letter-denmark")
    ?.id ??
  COVER_LETTER_PROMPTS[0]?.id ??
  "cover-letter-standard";

const normalizeDraft = (
  draft?: ManualJobDraft | null,
  jd?: string,
): ManualJobDraftState => ({
  ...emptyDraft,
  title: draft?.title ?? "",
  employer: draft?.employer ?? "",
  jobUrl: draft?.jobUrl ?? "",
  applicationLink: draft?.applicationLink ?? "",
  location: draft?.location ?? "",
  salary: draft?.salary ?? "",
  deadline: draft?.deadline ?? "",
  jobDescription: jd ?? draft?.jobDescription ?? "",
  jobType: draft?.jobType ?? "",
  jobLevel: draft?.jobLevel ?? "",
  jobFunction: draft?.jobFunction ?? "",
  disciplines: draft?.disciplines ?? "",
  degreeRequired: draft?.degreeRequired ?? "",
  starting: draft?.starting ?? "",
});

const toPayload = (draft: ManualJobDraftState): ManualJobDraft => {
  const clean = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  return {
    title: clean(draft.title),
    employer: clean(draft.employer),
    jobUrl: clean(draft.jobUrl),
    applicationLink: clean(draft.applicationLink),
    location: clean(draft.location),
    salary: clean(draft.salary),
    deadline: clean(draft.deadline),
    jobDescription: clean(draft.jobDescription),
    jobType: clean(draft.jobType),
    jobLevel: clean(draft.jobLevel),
    jobFunction: clean(draft.jobFunction),
    disciplines: clean(draft.disciplines),
    degreeRequired: clean(draft.degreeRequired),
    starting: clean(draft.starting),
  };
};

interface ManualImportFlowProps {
  active: boolean;
  onImported: (jobId: string) => void | Promise<void>;
  onClose: () => void;
}

export const ManualImportFlow: React.FC<ManualImportFlowProps> = ({
  active,
  onImported,
  onClose,
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<ManualImportStep>("paste");
  const [rawDescription, setRawDescription] = useState("");
  const [fetchUrl, setFetchUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [draft, setDraft] = useState<ManualJobDraftState>(emptyDraft);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedCoverLetterPromptId, setSelectedCoverLetterPromptId] =
    useState(DEFAULT_COVER_LETTER_PROMPT_ID);
  const [preparedJob, setPreparedJob] = useState<Job | null>(null);
  const [coverLetterDraft, setCoverLetterDraft] = useState("");
  const [preparationWarning, setPreparationWarning] = useState<string | null>(
    null,
  );
  const [isRetryingCoverLetter, setIsRetryingCoverLetter] = useState(false);

  useEffect(() => {
    if (active) return;
    setStep("paste");
    setRawDescription("");
    setFetchUrl("");
    setIsFetching(false);
    setDraft(emptyDraft);
    setWarning(null);
    setError(null);
    setIsImporting(false);
    setSelectedCoverLetterPromptId(DEFAULT_COVER_LETTER_PROMPT_ID);
    setPreparedJob(null);
    setCoverLetterDraft("");
    setPreparationWarning(null);
    setIsRetryingCoverLetter(false);
  }, [active]);

  const stepIndex = STEP_INDEX_BY_ID[step];
  const stepLabel = STEP_LABEL_BY_ID[step];
  const selectedCoverLetterPrompt = useMemo(
    () =>
      COVER_LETTER_PROMPTS.find(
        (preset) => preset.id === selectedCoverLetterPromptId,
      ) ?? COVER_LETTER_PROMPTS[0],
    [selectedCoverLetterPromptId],
  );

  const canAnalyze = rawDescription.trim().length > 0 && step !== "loading";
  const canFetch =
    fetchUrl.trim().length > 0 && !isFetching && step === "paste";
  const canImport = useMemo(() => {
    if (step !== "review") return false;
    return (
      draft.title.trim().length > 0 &&
      draft.employer.trim().length > 0 &&
      draft.jobDescription.trim().length > 0
    );
  }, [draft, step]);
  const preparedPdfHref = preparedJob?.pdfPath
    ? `/pdfs/resume_${preparedJob.id}.pdf?v=${encodeURIComponent(preparedJob.updatedAt)}`
    : null;
  const preparedCvHref = preparedJob
    ? `/applications/${preparedJob.id}/cv`
    : null;
  const preparedCoverLetterHref = preparedJob
    ? `/applications/${preparedJob.id}/cover-letter`
    : null;
  const checklistItems = useMemo(
    () => [
      {
        id: "imported",
        label: "Imported",
        done: Boolean(preparedJob),
      },
      {
        id: "cv",
        label: "CV ready",
        done: Boolean(preparedJob),
      },
      {
        id: "cover-letter",
        label: "Cover letter ready",
        done: Boolean(coverLetterDraft.trim()),
      },
    ],
    [coverLetterDraft, preparedJob],
  );

  const handleFetch = async () => {
    if (!fetchUrl.trim()) return;

    try {
      setError(null);
      setWarning(null);
      setIsFetching(true);

      const fetchResponse = await api.fetchApplicationSourceFromUrl({
        url: fetchUrl.trim(),
      });
      const fetchedContent = fetchResponse.content;
      const fetchedUrl = fetchResponse.url;

      setIsFetching(false);
      setStep("loading");
      const inferResponse = await api.inferApplicationFromJd({
        jobDescription: fetchedContent,
      });
      const normalized = normalizeDraft(inferResponse.job);

      if (!normalized.jobUrl) {
        normalized.jobUrl = fetchedUrl;
      }

      setDraft(normalized);
      setWarning(inferResponse.warning ?? null);
      setStep("review");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch URL";
      setError(message);
      setIsFetching(false);
      setStep("paste");
    }
  };

  const handleAnalyze = async () => {
    if (!rawDescription.trim()) {
      setError("Paste a job description to continue.");
      return;
    }

    try {
      setError(null);
      setWarning(null);
      setStep("loading");
      const response = await api.inferApplicationFromJd({
        jobDescription: rawDescription,
      });
      const normalized = normalizeDraft(response.job, rawDescription.trim());
      if (draft.jobUrl && !normalized.jobUrl) {
        normalized.jobUrl = draft.jobUrl;
      }
      setDraft(normalized);
      setWarning(response.warning ?? null);
      setStep("review");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to analyze job description";
      setError(message);
      setStep("paste");
    }
  };

  const handleImport = async () => {
    if (!canImport) return;

    try {
      setIsImporting(true);
      const payload = toPayload(draft);
      const created = await api.createApplicationFromDraft({ job: payload });
      toast.success("Application created", {
        description:
          "The JD was imported and is ready for tailoring in the workspace.",
      });
      await onImported(created.id);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import job";
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateApplicationKit = async () => {
    if (!canImport) return;

    let createdJob: Job | null = null;
    try {
      setError(null);
      setPreparationWarning(null);
      setIsImporting(true);
      setStep("preparing");

      const payload = toPayload(draft);
      createdJob = await api.createApplicationFromDraft({ job: payload });
      setPreparedJob(createdJob);
      await onImported(createdJob.id);

      const coverLetterResult = await api.sendJobGhostwriterMessage(
        createdJob.id,
        {
          content: selectedCoverLetterPrompt.prompt,
        },
      );

      const refreshedJob = await api
        .getApplication(createdJob.id)
        .catch(() => createdJob);
      setPreparedJob(refreshedJob);
      setCoverLetterDraft(
        getGhostwriterCoverLetterDraft(
          coverLetterResult.assistantMessage?.content,
        ),
      );
      setStep("ready");

      toast.success("Application kit ready", {
        description: "Tailored CV and cover letter are ready for download.",
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to prepare application kit";
      setError(message);
      if (createdJob) {
        setPreparationWarning(
          "The CV kit is ready, but cover-letter generation did not complete. You can still open the application workspace and retry Ghostwriter.",
        );
        setStep("ready");
      } else {
        setPreparationWarning(
          "The application may already be imported even though cover-letter generation did not complete.",
        );
        setStep("review");
      }
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const openHref = (href: string | null) => {
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleRetryCoverLetter = async () => {
    if (!preparedJob) return;

    try {
      setError(null);
      setIsRetryingCoverLetter(true);
      const coverLetterResult = await api.sendJobGhostwriterMessage(
        preparedJob.id,
        {
          content: selectedCoverLetterPrompt.prompt,
        },
      );
      setCoverLetterDraft(
        getGhostwriterCoverLetterDraft(
          coverLetterResult.assistantMessage?.content,
        ),
      );
      setPreparationWarning(null);
      toast.success("Cover letter regenerated", {
        description: "The latest draft is now available below.",
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to regenerate cover letter";
      setPreparationWarning(
        "The CV is still ready, but cover-letter generation failed again.",
      );
      toast.error(message);
    } finally {
      setIsRetryingCoverLetter(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {stepIndex + 1} of 4</span>
            <span>{stepLabel}</span>
          </div>
          <div className="h-1 rounded-full bg-muted/40">
            <div
              className="h-1 rounded-full bg-primary/60 transition-all"
              style={{ width: `${((stepIndex + 1) / 4) * 100}%` }}
            />
          </div>
        </div>
        <Separator />
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        {step === "paste" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="fetch-url"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Job URL (optional)
              </label>
              <div className="flex gap-2">
                <Input
                  id="fetch-url"
                  value={fetchUrl}
                  onChange={(event) => setFetchUrl(event.target.value)}
                  placeholder="https://example.com/job-posting"
                  className="flex-1"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canFetch) {
                      event.preventDefault();
                      void handleFetch();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isFetching}
                  className="gap-2 shrink-0"
                  onClick={async () => {
                    if (fetchUrl.trim()) {
                      await handleFetch();
                    } else {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) setFetchUrl(text.trim());
                      } catch {
                        // Clipboard access denied
                      }
                    }
                  }}
                >
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : fetchUrl.trim() ? (
                    <Link className="h-4 w-4" />
                  ) : (
                    <ClipboardPaste className="h-4 w-4" />
                  )}
                  {isFetching
                    ? "Fetching..."
                    : fetchUrl.trim()
                      ? "Fetch"
                      : "Paste"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="raw-description"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Job description
              </label>
              <Textarea
                id="raw-description"
                value={rawDescription}
                onChange={(event) => setRawDescription(event.target.value)}
                placeholder="Paste the full job description here, or enter a URL above to fetch it..."
                className="min-h-[200px] font-mono text-sm leading-relaxed"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              onClick={
                fetchUrl.trim()
                  ? () => void handleFetch()
                  : () => void handleAnalyze()
              }
              disabled={isFetching || (!canFetch && !canAnalyze)}
              className="w-full h-10 gap-2"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isFetching ? "Fetching..." : "Analyze JD"}
            </Button>
          </div>
        )}

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <div className="text-sm font-semibold">
              Analyzing job description
            </div>
            <p className="text-xs text-muted-foreground max-w-xs">
              Extracting title, company, location, and other details.
            </p>
          </div>
        )}

        {step === "preparing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <div className="text-sm font-semibold">
              Preparing application kit
            </div>
            <p className="max-w-sm text-xs text-muted-foreground">
              Importing the JD, tailoring your CV, generating the PDF, and
              drafting a {selectedCoverLetterPrompt.label.toLowerCase()}.
            </p>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 pb-4">
            {warning && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {warning}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep("paste")}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Edit JD
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Required: title, employer, description
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput
                id="draft-title"
                label="Title *"
                value={draft.title}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, title: value }))
                }
                placeholder="e.g. Junior Backend Engineer"
              />
              <FieldInput
                id="draft-employer"
                label="Employer *"
                value={draft.employer}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, employer: value }))
                }
                placeholder="e.g. Acme Labs"
              />
              <FieldInput
                id="draft-location"
                label="Location"
                value={draft.location}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, location: value }))
                }
                placeholder="e.g. London, UK"
              />
              <FieldInput
                id="draft-salary"
                label="Salary"
                value={draft.salary}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, salary: value }))
                }
                placeholder="e.g. GBP 45k-55k"
              />
              <FieldInput
                id="draft-deadline"
                label="Deadline"
                value={draft.deadline}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, deadline: value }))
                }
                placeholder="e.g. 30 Sep 2025"
              />
              <FieldInput
                id="draft-jobType"
                label="Job type"
                value={draft.jobType}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobType: value }))
                }
                placeholder="e.g. Full-time"
              />
              <FieldInput
                id="draft-jobLevel"
                label="Job level"
                value={draft.jobLevel}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobLevel: value }))
                }
                placeholder="e.g. Graduate"
              />
              <FieldInput
                id="draft-jobFunction"
                label="Job function"
                value={draft.jobFunction}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobFunction: value }))
                }
                placeholder="e.g. Software Engineering"
              />
              <FieldInput
                id="draft-disciplines"
                label="Disciplines"
                value={draft.disciplines}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, disciplines: value }))
                }
                placeholder="e.g. Computer Science"
              />
              <FieldInput
                id="draft-degreeRequired"
                label="Degree required"
                value={draft.degreeRequired}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, degreeRequired: value }))
                }
                placeholder="e.g. BSc or MSc"
              />
              <FieldInput
                id="draft-starting"
                label="Starting"
                value={draft.starting}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, starting: value }))
                }
                placeholder="e.g. September 2026"
              />
              <FieldInput
                id="draft-jobUrl"
                label="Job URL"
                value={draft.jobUrl}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobUrl: value }))
                }
                placeholder="https://..."
              />
              <FieldInput
                id="draft-applicationLink"
                label="Application URL"
                value={draft.applicationLink}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, applicationLink: value }))
                }
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="draft-jobDescription"
                className="text-xs font-medium text-muted-foreground"
              >
                Job description *
              </label>
              <Textarea
                id="draft-jobDescription"
                value={draft.jobDescription}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    jobDescription: event.target.value,
                  }))
                }
                placeholder="Paste the job description..."
                className="min-h-[180px] font-mono text-sm leading-relaxed"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">Cover letter style</div>
                <p className="text-xs text-muted-foreground">
                  Used by the one-click application-kit flow.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {COVER_LETTER_PROMPTS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    variant={
                      preset.id === selectedCoverLetterPromptId
                        ? "default"
                        : "outline"
                    }
                    onClick={() => setSelectedCoverLetterPromptId(preset.id)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedCoverLetterPrompt.description}
              </p>
            </div>

            {preparationWarning ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {preparationWarning}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleImport()}
                disabled={!canImport || isImporting}
                className="flex-1 h-10 gap-2"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardPaste className="h-4 w-4" />
                )}
                {isImporting ? "Importing..." : "Import only"}
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateApplicationKit()}
                disabled={!canImport || isImporting}
                className="flex-1 h-10 gap-2"
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isImporting ? "Preparing..." : "Create application kit"}
              </Button>
            </div>
          </div>
        )}

        {step === "ready" && preparedJob && (
          <div className="space-y-4 pb-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">
                    Application Kit
                  </div>
                  <div className="text-base font-semibold text-emerald-100">
                    {preparedJob.title}
                  </div>
                  <p className="text-sm text-emerald-100/90">
                    {preparedJob.employer}
                    {preparedJob.location ? ` • ${preparedJob.location}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 border-emerald-400/30 bg-emerald-500/5 text-emerald-100 hover:bg-emerald-500/10"
                  onClick={() => navigate(`/applications/${preparedJob.id}`)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open workspace
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
              <div className="mb-3 text-sm font-medium">Progress</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {checklistItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-sm"
                  >
                    <CheckCircle2
                      className={
                        item.done
                          ? "h-4 w-4 text-emerald-400"
                          : "h-4 w-4 text-muted-foreground/40"
                      }
                    />
                    <span
                      className={
                        item.done ? "text-foreground" : "text-muted-foreground"
                      }
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                  <div className="mb-3 text-sm font-medium">Downloads</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() =>
                        openHref(preparedPdfHref || preparedCvHref)
                      }
                      disabled={!preparedJob}
                    >
                      <FileText className="h-4 w-4" />
                      View CV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() => openHref(preparedCoverLetterHref)}
                      disabled={!preparedCoverLetterHref}
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Cover Letter
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() => {
                        if (!preparedJob) return;
                        if (preparedPdfHref) {
                          openHref(preparedPdfHref);
                          return;
                        }
                        void downloadCvPdfForJob(preparedJob.id).catch(
                          (error) => {
                            const message =
                              error instanceof Error
                                ? error.message
                                : "Failed to download CV PDF";
                            toast.error(message);
                          },
                        );
                      }}
                      disabled={!preparedJob}
                    >
                      <Download className="h-4 w-4" />
                      Download CV PDF
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() => {
                        if (!preparedJob) return;
                        void downloadCoverLetterPdfForJob(preparedJob.id).catch(
                          (error) => {
                            const message =
                              error instanceof Error
                                ? error.message
                                : "Failed to download cover letter PDF";
                            toast.error(message);
                          },
                        );
                      }}
                      disabled={!preparedJob}
                    >
                      <Download className="h-4 w-4" />
                      Download Cover Letter PDF
                    </Button>
                  </div>
                </div>

                {preparationWarning ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {preparationWarning}
                  </div>
                ) : null}

                {!coverLetterDraft.trim() || preparationWarning ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2"
                    onClick={() => void handleRetryCoverLetter()}
                    disabled={isRetryingCoverLetter}
                  >
                    {isRetryingCoverLetter ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                    {isRetryingCoverLetter
                      ? "Retrying..."
                      : "Retry cover letter"}
                  </Button>
                ) : null}
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                <div className="mb-2 text-sm font-medium">
                  Generated cover letter draft
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {coverLetterDraft ||
                    "The cover letter page is available, but no assistant draft text was returned here."}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="justify-center gap-2"
                onClick={() => navigate(`/applications/${preparedJob.id}`)}
              >
                <ExternalLink className="h-4 w-4" />
                Go To Workspace
              </Button>
              <Button
                type="button"
                onClick={onClose}
                className="justify-center gap-2"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const FieldInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}> = ({ id, label, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
      {label}
    </label>
    <Input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  </div>
);
