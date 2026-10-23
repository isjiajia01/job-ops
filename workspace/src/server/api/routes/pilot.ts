import { toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import {
  createPilotApplicationReview,
  createPilotClaimCheck,
  createPilotFeedbackNote,
  createPilotUser,
  listPilotApplicationReviews,
  listPilotApplicationReviewsByApplication,
  listPilotClaimChecks,
  listPilotClaimChecksByApplication,
  listPilotFeedbackNotes,
  listPilotUsers,
  parseJsonArray,
  updatePilotUser,
  upsertPilotProfile,
} from "@server/repositories/pilot";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const pilotRouter = Router();

const stringListSchema = z
  .array(z.string().trim().min(1).max(160))
  .max(20)
  .optional();

const pilotUserSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(240).nullable().optional(),
  status: z.enum(["invited", "active", "paused", "archived"]).optional(),
  usageMode: z.enum(["local_deploy", "guided_session", "demo_only"]).optional(),
  privacyMode: z
    .enum(["local_only", "anonymized_notes", "shared_with_consent"])
    .optional(),
  targetRoles: stringListSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

const pilotProfileSchema = z.object({
  headline: z.string().trim().max(240).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  targetRoles: stringListSchema,
  coreSkills: stringListSchema,
  hardConstraints: stringListSchema,
  doNotClaim: stringListSchema,
  evidenceSummary: z.string().trim().max(4000).nullable().optional(),
  profileCompleteness: z.number().int().min(0).max(100).optional(),
});

const pilotFeedbackSchema = z.object({
  userId: z.string().trim().min(1).nullable().optional(),
  noteType: z
    .enum(["feedback", "observation", "rejection_signal", "product_decision"])
    .optional(),
  summary: z.string().trim().min(1).max(3000),
  actionTaken: z.string().trim().max(3000).nullable().optional(),
  isAnonymized: z.boolean().optional(),
});

const pilotApplicationReviewSchema = z.object({
  userId: z.string().trim().min(1).nullable().optional(),
  applicationId: z.string().trim().min(1).nullable().optional(),
  company: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().min(1).max(240),
  fitLabel: z.enum([
    "strong_worth_applying",
    "moderate_stretch_worth_applying",
    "low_probability_usually_skip",
    "not_suitable_do_not_apply",
  ]),
  rationale: z.string().trim().min(1).max(3000),
  risks: stringListSchema,
  recommendedAction: z.string().trim().max(1200).nullable().optional(),
});

const pilotClaimCheckSchema = z.object({
  userId: z.string().trim().min(1).nullable().optional(),
  applicationId: z.string().trim().min(1).nullable().optional(),
  sourceLabel: z.string().trim().min(1).max(200),
  checkedText: z.string().trim().min(1).max(20000),
  doNotClaim: stringListSchema,
});

function serializeUser(
  user: Awaited<ReturnType<typeof listPilotUsers>>[number],
) {
  return {
    ...user,
    targetRoles: parseJsonArray(user.targetRoles),
    profile: user.profile
      ? {
          ...user.profile,
          targetRoles: parseJsonArray(user.profile.targetRoles),
          coreSkills: parseJsonArray(user.profile.coreSkills),
          hardConstraints: parseJsonArray(user.profile.hardConstraints),
          doNotClaim: parseJsonArray(user.profile.doNotClaim),
        }
      : null,
  };
}

function buildOverview(input: {
  users: Awaited<ReturnType<typeof listPilotUsers>>;
  feedbackCount: number;
  reviewCount: number;
  claimCheckCount: number;
}) {
  const activeUsers = input.users.filter((user) => user.status === "active");
  const localDeployments = input.users.filter(
    (user) => user.usageMode === "local_deploy",
  );
  const localOnlyUsers = input.users.filter(
    (user) => user.privacyMode === "local_only",
  );
  const profilesComplete = input.users.filter(
    (user) => (user.profile?.profileCompleteness ?? 0) >= 70,
  );

  return {
    positioning:
      "Private invite-only AI job-search operations pilot; not a commercial SaaS and not an autonomous application bot.",
    boundaries: [
      "Human-reviewed fit triage and application materials",
      "Local-first deployments for peer users",
      "Anonymized feedback notes only unless explicit consent is recorded",
      "No automatic job submission",
    ],
    metrics: {
      totalUsers: input.users.length,
      activeUsers: activeUsers.length,
      localDeployments: localDeployments.length,
      localOnlyUsers: localOnlyUsers.length,
      profilesComplete: profilesComplete.length,
      feedbackNotes: input.feedbackCount,
      applicationReviews: input.reviewCount,
      claimChecks: input.claimCheckCount,
    },
  };
}

pilotRouter.get("/overview", async (_req: Request, res: Response) => {
  try {
    const [users, feedback, reviews, claimChecks] = await Promise.all([
      listPilotUsers(),
      listPilotFeedbackNotes(),
      listPilotApplicationReviews(),
      listPilotClaimChecks(),
    ]);
    ok(res, {
      overview: buildOverview({
        users,
        feedbackCount: feedback.length,
        reviewCount: reviews.length,
        claimCheckCount: claimChecks.length,
      }),
      users: users.map(serializeUser),
      feedback,
      reviews: reviews.map((review) => ({
        ...review,
        risks: parseJsonArray(review.risks),
      })),
      claimChecks: claimChecks.map((check) => ({
        ...check,
        flaggedClaims: parseJsonArray(check.flaggedClaims),
      })),
    });
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.get("/users", async (_req: Request, res: Response) => {
  try {
    const users = await listPilotUsers();
    ok(res, users.map(serializeUser));
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.post("/users", async (req: Request, res: Response) => {
  try {
    const input = pilotUserSchema.parse(req.body ?? {});
    const user = await createPilotUser(input);
    ok(res, serializeUser({ ...user, profile: null }));
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.put("/users/:id", async (req: Request, res: Response) => {
  try {
    const input = pilotUserSchema.parse(req.body ?? {});
    const user = await updatePilotUser(req.params.id, input);
    if (!user) {
      res.status(404).json({
        ok: false,
        error: { code: "NOT_FOUND", message: "Pilot user not found" },
        meta: { requestId: res.getHeader("x-request-id") },
      });
      return;
    }
    const users = await listPilotUsers();
    const withProfile = users.find((candidate) => candidate.id === user.id);
    ok(
      res,
      withProfile
        ? serializeUser(withProfile)
        : serializeUser({ ...user, profile: null }),
    );
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.put("/users/:id/profile", async (req: Request, res: Response) => {
  try {
    const input = pilotProfileSchema.parse(req.body ?? {});
    const profile = await upsertPilotProfile(req.params.id, input);
    ok(res, {
      ...profile,
      targetRoles: parseJsonArray(profile.targetRoles),
      coreSkills: parseJsonArray(profile.coreSkills),
      hardConstraints: parseJsonArray(profile.hardConstraints),
      doNotClaim: parseJsonArray(profile.doNotClaim),
    });
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.get("/feedback", async (_req: Request, res: Response) => {
  try {
    const feedback = await listPilotFeedbackNotes();
    ok(res, feedback);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.post("/feedback", async (req: Request, res: Response) => {
  try {
    const input = pilotFeedbackSchema.parse(req.body ?? {});
    const note = await createPilotFeedbackNote(input);
    ok(res, note);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.get(
  "/applications/:applicationId/workflow",
  async (req: Request, res: Response) => {
    try {
      const [reviews, claimChecks] = await Promise.all([
        listPilotApplicationReviewsByApplication(req.params.applicationId),
        listPilotClaimChecksByApplication(req.params.applicationId),
      ]);
      ok(res, {
        reviews: reviews.map((review) => ({
          ...review,
          risks: parseJsonArray(review.risks),
        })),
        claimChecks: claimChecks.map((check) => ({
          ...check,
          flaggedClaims: parseJsonArray(check.flaggedClaims),
        })),
      });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

pilotRouter.get(
  "/application-reviews",
  async (_req: Request, res: Response) => {
    try {
      const reviews = await listPilotApplicationReviews();
      ok(
        res,
        reviews.map((review) => ({
          ...review,
          risks: parseJsonArray(review.risks),
        })),
      );
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

pilotRouter.post(
  "/application-reviews",
  async (req: Request, res: Response) => {
    try {
      const input = pilotApplicationReviewSchema.parse(req.body ?? {});
      const review = await createPilotApplicationReview(input);
      ok(res, { ...review, risks: parseJsonArray(review.risks) });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

pilotRouter.get("/claim-checks", async (_req: Request, res: Response) => {
  try {
    const checks = await listPilotClaimChecks();
    ok(
      res,
      checks.map((check) => ({
        ...check,
        flaggedClaims: parseJsonArray(check.flaggedClaims),
      })),
    );
  } catch (error) {
    fail(res, toAppError(error));
  }
});

pilotRouter.post("/claim-checks", async (req: Request, res: Response) => {
  try {
    const input = pilotClaimCheckSchema.parse(req.body ?? {});
    const check = await createPilotClaimCheck(input);
    ok(res, { ...check, flaggedClaims: parseJsonArray(check.flaggedClaims) });
  } catch (error) {
    fail(res, toAppError(error));
  }
});
