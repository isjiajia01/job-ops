import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import type { PilotFitLabel, PilotUser } from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

const pilotQueryKey = ["pilot", "overview"] as const;

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function formatStatusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

const MetricCard: React.FC<{
  label: string;
  value: number;
  caption: string;
}> = ({ label, value, caption }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-3xl">{value}</CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      {caption}
    </CardContent>
  </Card>
);

const UserCard: React.FC<{ user: PilotUser }> = ({ user }) => (
  <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{user.displayName}</CardTitle>
          <CardDescription>{user.email || "No email stored"}</CardDescription>
        </div>
        <Badge variant={user.status === "active" ? "default" : "secondary"}>
          {formatStatusLabel(user.status)}
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{formatStatusLabel(user.usageMode)}</Badge>
        <Badge variant="outline">{formatStatusLabel(user.privacyMode)}</Badge>
      </div>
      {user.targetRoles.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Target roles</p>
          <p className="text-muted-foreground">{user.targetRoles.join(", ")}</p>
        </div>
      )}
      {user.profile && (
        <div className="space-y-2 rounded-lg border border-border/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Profile completeness</p>
            <span className="text-muted-foreground">
              {user.profile.profileCompleteness}%
            </span>
          </div>
          <Progress value={user.profile.profileCompleteness} />
          {user.profile.headline && <p>{user.profile.headline}</p>}
          {user.profile.doNotClaim.length > 0 && (
            <p className="text-muted-foreground">
              Guardrails: {user.profile.doNotClaim.join(", ")}
            </p>
          )}
        </div>
      )}
      {user.notes && <p className="text-muted-foreground">{user.notes}</p>}
    </CardContent>
  </Card>
);

export const PilotPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [headline, setHeadline] = useState("");
  const [coreSkills, setCoreSkills] = useState("");
  const [hardConstraints, setHardConstraints] = useState("");
  const [doNotClaim, setDoNotClaim] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [feedbackSummary, setFeedbackSummary] = useState("");
  const [feedbackAction, setFeedbackAction] = useState("");
  const [reviewCompany, setReviewCompany] = useState("");
  const [reviewRole, setReviewRole] = useState("");
  const [reviewFitLabel, setReviewFitLabel] = useState<PilotFitLabel>(
    "moderate_stretch_worth_applying",
  );
  const [reviewRationale, setReviewRationale] = useState("");
  const [reviewRisks, setReviewRisks] = useState("");
  const [reviewAction, setReviewAction] = useState("");
  const [claimSourceLabel, setClaimSourceLabel] = useState(
    "CV / cover letter draft",
  );
  const [claimText, setClaimText] = useState("");

  const overviewQuery = useQuery({
    queryKey: pilotQueryKey,
    queryFn: api.getPilotOverview,
  });

  const users = overviewQuery.data?.users ?? [];
  const metrics = overviewQuery.data?.overview.metrics;
  const feedback = overviewQuery.data?.feedback ?? [];
  const reviews = overviewQuery.data?.reviews ?? [];
  const claimChecks = overviewQuery.data?.claimChecks ?? [];

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [users, selectedUserId],
  );

  const createUserMutation = useMutation({
    mutationFn: api.createPilotUser,
    onSuccess: () => {
      toast.success("Pilot user saved");
      setDisplayName("");
      setEmail("");
      setTargetRoles("");
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: pilotQueryKey });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save user",
      );
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: ({
      userId,
      input,
    }: {
      userId: string;
      input: api.PilotProfileInput;
    }) => api.savePilotUserProfile(userId, input),
    onSuccess: () => {
      toast.success("Pilot profile saved");
      void queryClient.invalidateQueries({ queryKey: pilotQueryKey });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save profile",
      );
    },
  });

  const createFeedbackMutation = useMutation({
    mutationFn: api.createPilotFeedbackNote,
    onSuccess: () => {
      toast.success("Feedback note saved");
      setFeedbackSummary("");
      setFeedbackAction("");
      void queryClient.invalidateQueries({ queryKey: pilotQueryKey });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save feedback",
      );
    },
  });

  const createReviewMutation = useMutation({
    mutationFn: api.createPilotApplicationReview,
    onSuccess: () => {
      toast.success("Fit-triage review saved");
      setReviewCompany("");
      setReviewRole("");
      setReviewRationale("");
      setReviewRisks("");
      setReviewAction("");
      void queryClient.invalidateQueries({ queryKey: pilotQueryKey });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to save fit review",
      );
    },
  });

  const createClaimCheckMutation = useMutation({
    mutationFn: api.createPilotClaimCheck,
    onSuccess: () => {
      toast.success("Claim-boundary check saved");
      setClaimText("");
      void queryClient.invalidateQueries({ queryKey: pilotQueryKey });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to run claim check",
      );
    },
  });

  return (
    <>
      <PageHeader
        icon={UsersRound}
        title="Private Pilot"
        subtitle="Invite-only peer usage, profile registry, and anonymized feedback loop"
      />

      <PageMain>
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Private pilot boundary
            </CardTitle>
            <CardDescription>
              JobOps is positioned here as a local-first, invite-only career-ops
              tool used with a small peer group. It is not a commercial SaaS and
              it does not submit applications automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            {(
              overviewQuery.data?.overview.boundaries ?? [
                "Human-reviewed fit triage and application materials",
                "Local-first deployments for peer users",
                "Anonymized feedback notes only unless consent is recorded",
                "No automatic job submission",
              ]
            ).map((boundary) => (
              <div
                key={boundary}
                className="rounded-lg border border-border/60 bg-background/70 p-3"
              >
                {boundary}
              </div>
            ))}
          </CardContent>
        </Card>

        {metrics && (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            <MetricCard
              label="Pilot users"
              value={metrics.totalUsers}
              caption="Known local or demo users"
            />
            <MetricCard
              label="Active"
              value={metrics.activeUsers}
              caption="Currently using or testing"
            />
            <MetricCard
              label="Local deploys"
              value={metrics.localDeployments}
              caption="Friend/self-hosted instances"
            />
            <MetricCard
              label="Local-only"
              value={metrics.localOnlyUsers}
              caption="No shared personal data"
            />
            <MetricCard
              label="Profiles ready"
              value={metrics.profilesComplete}
              caption="70%+ profile completeness"
            />
            <MetricCard
              label="Feedback notes"
              value={metrics.feedbackNotes}
              caption="Anonymized learning loop"
            />
            <MetricCard
              label="Fit reviews"
              value={metrics.applicationReviews}
              caption="Role triage decisions"
            />
            <MetricCard
              label="Claim checks"
              value={metrics.claimChecks}
              caption="Do-not-claim guardrails"
            />
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4" /> Add pilot user
              </CardTitle>
              <CardDescription>
                Register a friend/local deployment without importing sensitive
                CV data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name or alias</Label>
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Peer user / Demo candidate"
                />
              </div>
              <div className="space-y-2">
                <Label>Email (optional)</Label>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Only store with consent"
                />
              </div>
              <div className="space-y-2">
                <Label>Target roles</Label>
                <Textarea
                  value={targetRoles}
                  onChange={(event) => setTargetRoles(event.target.value)}
                  placeholder="Data analyst, junior full-stack, operations analyst"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Local deployment, anonymized feedback only, setup needs…"
                />
              </div>
              <Button
                type="button"
                disabled={!displayName.trim() || createUserMutation.isPending}
                onClick={() =>
                  createUserMutation.mutate({
                    displayName,
                    email: email.trim() || null,
                    status: "active",
                    usageMode: "local_deploy",
                    privacyMode: "local_only",
                    targetRoles: splitList(targetRoles),
                    notes: notes.trim() || null,
                  })
                }
              >
                Save pilot user
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {overviewQuery.isLoading && (
              <p className="text-sm text-muted-foreground">
                Loading pilot data…
              </p>
            )}
            {overviewQuery.error && (
              <p className="text-sm text-destructive">
                {overviewQuery.error instanceof Error
                  ? overviewQuery.error.message
                  : "Failed to load pilot data"}
              </p>
            )}
            {users.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </div>
        </div>

        {selectedUser && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Profile completeness for {selectedUser.displayName}
                </CardTitle>
                <CardDescription>
                  Store lightweight, consent-aware profile metadata for
                  interview/demo credibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>User</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedUser.id}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Headline</Label>
                  <Input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    placeholder={
                      selectedUser.profile?.headline ??
                      "Upcoming MSc graduate / analyst / builder"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Core skills</Label>
                  <Textarea
                    value={coreSkills}
                    onChange={(event) => setCoreSkills(event.target.value)}
                    placeholder="Python, SQL, Excel, React, operations analysis"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hard constraints</Label>
                  <Textarea
                    value={hardConstraints}
                    onChange={(event) => setHardConstraints(event.target.value)}
                    placeholder="No Danish-only roles, no relocation, sponsorship constraints"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Do-not-claim guardrails</Label>
                  <Textarea
                    value={doNotClaim}
                    onChange={(event) => setDoNotClaim(event.target.value)}
                    placeholder="No production AI ownership, no fluent Danish, no unsupported tools"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Evidence summary</Label>
                  <Textarea
                    value={evidenceSummary}
                    onChange={(event) => setEvidenceSummary(event.target.value)}
                    placeholder="Strongest project/work evidence to use in tailoring"
                  />
                </div>
                <Button
                  type="button"
                  disabled={saveProfileMutation.isPending}
                  onClick={() => {
                    const completeness =
                      [
                        headline,
                        coreSkills,
                        hardConstraints,
                        doNotClaim,
                        evidenceSummary,
                      ].filter((value) => value.trim()).length * 20;
                    saveProfileMutation.mutate({
                      userId: selectedUser.id,
                      input: {
                        headline:
                          headline.trim() ||
                          selectedUser.profile?.headline ||
                          null,
                        targetRoles: selectedUser.targetRoles,
                        coreSkills: splitList(coreSkills),
                        hardConstraints: splitList(hardConstraints),
                        doNotClaim: splitList(doNotClaim),
                        evidenceSummary: evidenceSummary.trim() || null,
                        profileCompleteness: completeness,
                      },
                    });
                  }}
                >
                  Save profile metadata
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Anonymized feedback loop
                </CardTitle>
                <CardDescription>
                  Capture what peer users needed, what changed, and what
                  rejection signals taught the workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Feedback / observation</Label>
                  <Textarea
                    value={feedbackSummary}
                    onChange={(event) => setFeedbackSummary(event.target.value)}
                    placeholder="User wanted clearer role-fit labels before spending time on a cover letter…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Action taken</Label>
                  <Textarea
                    value={feedbackAction}
                    onChange={(event) => setFeedbackAction(event.target.value)}
                    placeholder="Added low-probability stretch label and rejection-feedback notes"
                  />
                </div>
                <Button
                  type="button"
                  disabled={
                    !feedbackSummary.trim() || createFeedbackMutation.isPending
                  }
                  onClick={() =>
                    createFeedbackMutation.mutate({
                      userId: selectedUser.id,
                      noteType: "feedback",
                      summary: feedbackSummary,
                      actionTaken: feedbackAction.trim() || null,
                      isAnonymized: true,
                    })
                  }
                >
                  Save anonymized note
                </Button>
                <div className="space-y-3">
                  {feedback
                    .slice(-5)
                    .reverse()
                    .map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg border border-border/70 p-3 text-sm"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="outline">
                            {formatStatusLabel(note.noteType)}
                          </Badge>
                          {note.isAnonymized && (
                            <Badge variant="secondary">anonymized</Badge>
                          )}
                        </div>
                        <p>{note.summary}</p>
                        {note.actionTaken && (
                          <p className="mt-1 text-muted-foreground">
                            Action: {note.actionTaken}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {selectedUser && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Fit-triage decision log
                </CardTitle>
                <CardDescription>
                  Record role decisions before tailoring materials: apply,
                  stretch, usually skip, or do not apply.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input
                      value={reviewCompany}
                      onChange={(event) => setReviewCompany(event.target.value)}
                      placeholder="Skatteguiden"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Input
                      value={reviewRole}
                      onChange={(event) => setReviewRole(event.target.value)}
                      placeholder="Applied AI Engineer"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Fit label</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={reviewFitLabel}
                    onChange={(event) =>
                      setReviewFitLabel(event.target.value as PilotFitLabel)
                    }
                  >
                    <option value="strong_worth_applying">
                      Strong / worth applying
                    </option>
                    <option value="moderate_stretch_worth_applying">
                      Moderate-stretch / worth applying
                    </option>
                    <option value="low_probability_usually_skip">
                      Low-probability stretch / usually skip
                    </option>
                    <option value="not_suitable_do_not_apply">
                      Not suitable / do not apply
                    </option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Rationale</Label>
                  <Textarea
                    value={reviewRationale}
                    onChange={(event) => setReviewRationale(event.target.value)}
                    placeholder="Why this role is or is not worth spending tailoring effort on"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Risks</Label>
                  <Textarea
                    value={reviewRisks}
                    onChange={(event) => setReviewRisks(event.target.value)}
                    placeholder="Commercial AI title gap, Danish requirement, seniority mismatch"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Recommended action</Label>
                  <Textarea
                    value={reviewAction}
                    onChange={(event) => setReviewAction(event.target.value)}
                    placeholder="Apply with OpsDesk angle / pre-screen recruiter / skip"
                  />
                </div>
                <Button
                  type="button"
                  disabled={
                    !reviewCompany.trim() ||
                    !reviewRole.trim() ||
                    !reviewRationale.trim() ||
                    createReviewMutation.isPending
                  }
                  onClick={() =>
                    createReviewMutation.mutate({
                      userId: selectedUser.id,
                      company: reviewCompany,
                      roleTitle: reviewRole,
                      fitLabel: reviewFitLabel,
                      rationale: reviewRationale,
                      risks: splitList(reviewRisks),
                      recommendedAction: reviewAction.trim() || null,
                    })
                  }
                >
                  Save fit review
                </Button>
                <div className="space-y-3">
                  {reviews
                    .slice(-5)
                    .reverse()
                    .map((review) => (
                      <div
                        key={review.id}
                        className="rounded-lg border border-border/70 p-3 text-sm"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {formatStatusLabel(review.fitLabel)}
                          </Badge>
                          <span className="font-medium">
                            {review.company} — {review.roleTitle}
                          </span>
                        </div>
                        <p>{review.rationale}</p>
                        {review.risks.length > 0 && (
                          <p className="mt-1 text-muted-foreground">
                            Risks: {review.risks.join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Claim-boundary checker
                </CardTitle>
                <CardDescription>
                  A lightweight guardrail before using AI-generated CV or
                  cover-letter text.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Source label</Label>
                  <Input
                    value={claimSourceLabel}
                    onChange={(event) =>
                      setClaimSourceLabel(event.target.value)
                    }
                    placeholder="CV draft / cover letter / outreach"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Text to check</Label>
                  <Textarea
                    value={claimText}
                    onChange={(event) => setClaimText(event.target.value)}
                    placeholder="Paste generated text here before using it"
                  />
                </div>
                <Button
                  type="button"
                  disabled={
                    !claimText.trim() || createClaimCheckMutation.isPending
                  }
                  onClick={() =>
                    createClaimCheckMutation.mutate({
                      userId: selectedUser.id,
                      sourceLabel: claimSourceLabel || "Draft text",
                      checkedText: claimText,
                      doNotClaim: selectedUser.profile?.doNotClaim ?? [],
                    })
                  }
                >
                  Run claim check
                </Button>
                <div className="space-y-3">
                  {claimChecks
                    .slice(-5)
                    .reverse()
                    .map((check) => (
                      <div
                        key={check.id}
                        className="rounded-lg border border-border/70 p-3 text-sm"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              check.severity === "blocker"
                                ? "destructive"
                                : check.severity === "warning"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {check.severity}
                          </Badge>
                          <span className="font-medium">
                            {check.sourceLabel}
                          </span>
                        </div>
                        <p>{check.summary}</p>
                        {check.flaggedClaims.length > 0 && (
                          <p className="mt-1 text-muted-foreground">
                            Flagged: {check.flaggedClaims.join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </PageMain>
    </>
  );
};
