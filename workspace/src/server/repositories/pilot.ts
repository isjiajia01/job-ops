import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  type PilotApplicationReviewRow,
  type PilotClaimCheckRow,
  type PilotFeedbackNoteRow,
  type PilotUserProfileRow,
  type PilotUserRow,
  pilotApplicationReviews,
  pilotClaimChecks,
  pilotFeedbackNotes,
  pilotUserProfiles,
  pilotUsers,
} from "../db/schema";

export type PilotUserStatus = "invited" | "active" | "paused" | "archived";
export type PilotUsageMode = "local_deploy" | "guided_session" | "demo_only";
export type PilotPrivacyMode =
  | "local_only"
  | "anonymized_notes"
  | "shared_with_consent";
export type PilotFeedbackNoteType =
  | "feedback"
  | "observation"
  | "rejection_signal"
  | "product_decision";
export type PilotFitLabel =
  | "strong_worth_applying"
  | "moderate_stretch_worth_applying"
  | "low_probability_usually_skip"
  | "not_suitable_do_not_apply";
export type PilotClaimSeverity = "pass" | "warning" | "blocker";

export type PilotUserInput = {
  displayName: string;
  email?: string | null;
  status?: PilotUserStatus;
  usageMode?: PilotUsageMode;
  privacyMode?: PilotPrivacyMode;
  targetRoles?: string[];
  notes?: string | null;
};

export type PilotProfileInput = {
  headline?: string | null;
  location?: string | null;
  targetRoles?: string[];
  coreSkills?: string[];
  hardConstraints?: string[];
  doNotClaim?: string[];
  evidenceSummary?: string | null;
  profileCompleteness?: number;
};

export type PilotFeedbackInput = {
  userId?: string | null;
  noteType?: PilotFeedbackNoteType;
  summary: string;
  actionTaken?: string | null;
  isAnonymized?: boolean;
};

export type PilotApplicationReviewInput = {
  userId?: string | null;
  applicationId?: string | null;
  company: string;
  roleTitle: string;
  fitLabel: PilotFitLabel;
  rationale: string;
  risks?: string[];
  recommendedAction?: string | null;
};

export type PilotClaimCheckInput = {
  userId?: string | null;
  applicationId?: string | null;
  sourceLabel: string;
  checkedText: string;
  doNotClaim?: string[];
};

export type PilotUserWithProfile = PilotUserRow & {
  profile: PilotUserProfileRow | null;
};

function encodeJsonArray(values?: string[] | null): string | null {
  if (!values?.length) return null;
  const clean = values.map((value) => value.trim()).filter(Boolean);
  return clean.length ? JSON.stringify(clean) : null;
}

export function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function listPilotUsers(): Promise<PilotUserWithProfile[]> {
  const rows = await db
    .select({ user: pilotUsers, profile: pilotUserProfiles })
    .from(pilotUsers)
    .leftJoin(pilotUserProfiles, eq(pilotUsers.id, pilotUserProfiles.userId))
    .orderBy(pilotUsers.createdAt);

  return rows.map((row) => ({ ...row.user, profile: row.profile ?? null }));
}

export async function createPilotUser(
  input: PilotUserInput,
): Promise<PilotUserRow> {
  const id = randomUUID();
  const now = Date.now();
  await db.insert(pilotUsers).values({
    id,
    displayName: input.displayName,
    email: input.email || null,
    status: input.status ?? "active",
    usageMode: input.usageMode ?? "local_deploy",
    privacyMode: input.privacyMode ?? "local_only",
    targetRoles: encodeJsonArray(input.targetRoles),
    notes: input.notes || null,
    invitedAt: now,
    lastActiveAt: input.status === "active" ? now : null,
  });
  const created = await db
    .select()
    .from(pilotUsers)
    .where(eq(pilotUsers.id, id));
  return created[0];
}

export async function updatePilotUser(
  id: string,
  input: PilotUserInput,
): Promise<PilotUserRow | null> {
  await db
    .update(pilotUsers)
    .set({
      displayName: input.displayName,
      email: input.email || null,
      status: input.status ?? "active",
      usageMode: input.usageMode ?? "local_deploy",
      privacyMode: input.privacyMode ?? "local_only",
      targetRoles: encodeJsonArray(input.targetRoles),
      notes: input.notes || null,
      lastActiveAt: input.status === "active" ? Date.now() : undefined,
      updatedAt: sql`datetime('now')`,
    })
    .where(eq(pilotUsers.id, id));
  const updated = await db
    .select()
    .from(pilotUsers)
    .where(eq(pilotUsers.id, id));
  return updated[0] ?? null;
}

export async function upsertPilotProfile(
  userId: string,
  input: PilotProfileInput,
): Promise<PilotUserProfileRow> {
  const existing = await db
    .select()
    .from(pilotUserProfiles)
    .where(eq(pilotUserProfiles.userId, userId));
  const values = {
    headline: input.headline || null,
    location: input.location || null,
    targetRoles: encodeJsonArray(input.targetRoles),
    coreSkills: encodeJsonArray(input.coreSkills),
    hardConstraints: encodeJsonArray(input.hardConstraints),
    doNotClaim: encodeJsonArray(input.doNotClaim),
    evidenceSummary: input.evidenceSummary || null,
    profileCompleteness: Math.max(
      0,
      Math.min(100, input.profileCompleteness ?? 0),
    ),
    updatedAt: sql`datetime('now')`,
  };

  if (existing[0]) {
    await db
      .update(pilotUserProfiles)
      .set(values)
      .where(eq(pilotUserProfiles.userId, userId));
  } else {
    await db.insert(pilotUserProfiles).values({
      id: randomUUID(),
      userId,
      ...values,
    });
  }

  const profile = await db
    .select()
    .from(pilotUserProfiles)
    .where(eq(pilotUserProfiles.userId, userId));
  return profile[0];
}

export async function listPilotFeedbackNotes(): Promise<
  PilotFeedbackNoteRow[]
> {
  return db
    .select()
    .from(pilotFeedbackNotes)
    .orderBy(pilotFeedbackNotes.createdAt);
}

export async function createPilotFeedbackNote(
  input: PilotFeedbackInput,
): Promise<PilotFeedbackNoteRow> {
  const id = randomUUID();
  await db.insert(pilotFeedbackNotes).values({
    id,
    userId: input.userId || null,
    noteType: input.noteType ?? "feedback",
    summary: input.summary,
    actionTaken: input.actionTaken || null,
    isAnonymized: input.isAnonymized ?? true,
  });
  const created = await db
    .select()
    .from(pilotFeedbackNotes)
    .where(eq(pilotFeedbackNotes.id, id));
  return created[0];
}

export async function listPilotApplicationReviews(): Promise<
  PilotApplicationReviewRow[]
> {
  return db
    .select()
    .from(pilotApplicationReviews)
    .orderBy(pilotApplicationReviews.createdAt);
}

export async function createPilotApplicationReview(
  input: PilotApplicationReviewInput,
): Promise<PilotApplicationReviewRow> {
  const id = randomUUID();
  await db.insert(pilotApplicationReviews).values({
    id,
    userId: input.userId || null,
    applicationId: input.applicationId || null,
    company: input.company,
    roleTitle: input.roleTitle,
    fitLabel: input.fitLabel,
    rationale: input.rationale,
    risks: encodeJsonArray(input.risks),
    recommendedAction: input.recommendedAction || null,
  });
  const created = await db
    .select()
    .from(pilotApplicationReviews)
    .where(eq(pilotApplicationReviews.id, id));
  return created[0];
}

function normalizeForCheck(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, " ");
}

function findFlaggedClaims(input: PilotClaimCheckInput): string[] {
  const text = normalizeForCheck(input.checkedText);
  const guardrailHits = (input.doNotClaim ?? []).filter((claim) => {
    const normalized = normalizeForCheck(claim);
    return normalized.length > 0 && text.includes(normalized);
  });

  const genericPatterns = [
    "fluent danish",
    "production ai ownership",
    "commercial ai product",
    "enterprise scale",
    "autonomous application submission",
    "guaranteed interview",
  ];

  return [
    ...guardrailHits,
    ...genericPatterns.filter((pattern) => text.includes(pattern)),
  ];
}

export async function listPilotApplicationReviewsByApplication(
  applicationId: string,
): Promise<PilotApplicationReviewRow[]> {
  return db
    .select()
    .from(pilotApplicationReviews)
    .where(eq(pilotApplicationReviews.applicationId, applicationId))
    .orderBy(desc(pilotApplicationReviews.createdAt));
}

export async function listPilotClaimChecks(): Promise<PilotClaimCheckRow[]> {
  return db.select().from(pilotClaimChecks).orderBy(pilotClaimChecks.createdAt);
}

export async function listPilotClaimChecksByApplication(
  applicationId: string,
): Promise<PilotClaimCheckRow[]> {
  return db
    .select()
    .from(pilotClaimChecks)
    .where(eq(pilotClaimChecks.applicationId, applicationId))
    .orderBy(desc(pilotClaimChecks.createdAt));
}

export async function createPilotClaimCheck(
  input: PilotClaimCheckInput,
): Promise<PilotClaimCheckRow> {
  const flaggedClaims = findFlaggedClaims(input);
  const severity: PilotClaimSeverity = flaggedClaims.length
    ? flaggedClaims.some((claim) =>
        /fluent danish|guaranteed|autonomous/.test(normalizeForCheck(claim)),
      )
      ? "blocker"
      : "warning"
    : "pass";
  const summary = flaggedClaims.length
    ? `Flagged ${flaggedClaims.length} claim boundary issue(s): ${flaggedClaims.join(", ")}`
    : "No claim-boundary issues detected by the pilot checker.";
  const id = randomUUID();
  await db.insert(pilotClaimChecks).values({
    id,
    userId: input.userId || null,
    applicationId: input.applicationId || null,
    sourceLabel: input.sourceLabel,
    checkedText: input.checkedText,
    severity,
    summary,
    flaggedClaims: encodeJsonArray(flaggedClaims),
  });
  const created = await db
    .select()
    .from(pilotClaimChecks)
    .where(eq(pilotClaimChecks.id, id));
  return created[0];
}
