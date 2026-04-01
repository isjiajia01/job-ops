import { toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { isDemoMode } from "@server/config/demo";
import { DEMO_PROJECT_CATALOG } from "@server/config/demo-defaults";
import {
  addCandidateKnowledgeFact,
  addCandidateKnowledgeProject,
  deleteCandidateKnowledgeFact,
  deleteCandidateKnowledgeProject,
  getCandidateKnowledgeBase,
} from "@server/services/candidate-knowledge";
import {
  getInternalProfile,
  saveInternalProfile,
} from "@server/services/internal-profile";
import { clearProfileCache, getProfile } from "@server/services/profile";
import { ingestProfileCapture } from "@server/services/profile-ingestion";
import { extractProjectsFromProfile } from "@server/services/resumeProjects";
import {
  clearRxResumeResumeCache,
  getResume,
  RxResumeAuthConfigError,
} from "@server/services/rxresume";
import { getConfiguredRxResumeBaseResumeId } from "@server/services/rxresume/baseResumeId";
import type { ResumeProfile } from "@shared/types";
import { resumeProfileSchema } from "@shared/utils/profile";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const profileRouter = Router();

const createKnowledgeFactSchema = z.object({
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(2000),
});

const createKnowledgeProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(2400),
  keywords: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  role: z.string().trim().max(200).nullable().optional(),
  impact: z.string().trim().max(1200).nullable().optional(),
  roleRelevance: z.string().trim().max(1200).nullable().optional(),
  cvBullets: z.array(z.string().trim().min(1).max(240)).max(8).optional(),
});

const ingestKnowledgeCaptureSchema = z.object({
  rawText: z.string().trim().min(1).max(20000),
  sourceLabel: z.string().trim().max(200).nullable().optional(),
});

/**
 * GET /api/profile/projects - Get all projects available in the base resume
 */
profileRouter.get("/projects", async (_req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      res.json({ success: true, data: DEMO_PROJECT_CATALOG });
      return;
    }
    const profile = await getProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    ok(res, catalog);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile - Get the full base resume profile
 */
profileRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const profile = await getProfile();
    ok(res, profile);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile/internal - Get the internal candidate profile draft
 */
profileRouter.get("/internal", async (_req: Request, res: Response) => {
  try {
    const profile = await getInternalProfile();
    ok(res, profile ?? {});
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * POST /api/profile/internal - Save the internal candidate profile draft
 */
profileRouter.post("/internal", async (req: Request, res: Response) => {
  try {
    const input = resumeProfileSchema.parse(req.body) as ResumeProfile;
    const saved = await saveInternalProfile(input);
    clearProfileCache();
    ok(res, saved);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile/knowledge - Get shared AI knowledge base
 */
profileRouter.get("/knowledge", async (_req: Request, res: Response) => {
  try {
    const knowledgeBase = await getCandidateKnowledgeBase();
    ok(res, knowledgeBase);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * POST /api/profile/knowledge - Save the full shared AI knowledge base
 */
profileRouter.post("/knowledge", async (req: Request, res: Response) => {
  try {
    const knowledgeBase = await import("@server/services/candidate-knowledge");
    const saved = await knowledgeBase.saveCandidateKnowledgeBase(req.body);
    ok(res, saved);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * POST /api/profile/knowledge/facts - Add a personal fact to shared AI knowledge
 */
profileRouter.post("/knowledge/facts", async (req: Request, res: Response) => {
  try {
    const input = createKnowledgeFactSchema.parse(req.body);
    const fact = await addCandidateKnowledgeFact(input);
    ok(res, fact);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * DELETE /api/profile/knowledge/facts/:id - Delete a personal fact
 */
profileRouter.delete(
  "/knowledge/facts/:id",
  async (req: Request, res: Response) => {
    try {
      await deleteCandidateKnowledgeFact(req.params.id);
      ok(res, { deleted: true });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

/**
 * POST /api/profile/knowledge/projects - Add a project to shared AI knowledge
 */
profileRouter.post(
  "/knowledge/projects",
  async (req: Request, res: Response) => {
    try {
      const input = createKnowledgeProjectSchema.parse(req.body);
      const project = await addCandidateKnowledgeProject(input);
      ok(res, project);
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

/**
 * DELETE /api/profile/knowledge/projects/:id - Delete a project from shared AI knowledge
 */
profileRouter.delete(
  "/knowledge/projects/:id",
  async (req: Request, res: Response) => {
    try {
      await deleteCandidateKnowledgeProject(req.params.id);
      ok(res, { deleted: true });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

/**
 * POST /api/profile/knowledge/ingest - Turn raw capture text into structured inbox items
 */
profileRouter.post("/knowledge/ingest", async (req: Request, res: Response) => {
  try {
    const input = ingestKnowledgeCaptureSchema.parse(req.body);
    const result = await ingestProfileCapture(input);
    ok(res, result);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/profile/status - Check if base resume is configured and accessible
 */
profileRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const internalProfile = await getInternalProfile().catch(() => null);
    if (internalProfile) {
      ok(res, { exists: true, error: null });
      return;
    }

    const { resumeId: rxresumeBaseResumeId } =
      await getConfiguredRxResumeBaseResumeId();

    if (!rxresumeBaseResumeId) {
      ok(res, {
        exists: false,
        error:
          "No base resume selected. Please select a resume from your Reactive Resume account in Settings.",
      });
      return;
    }

    // Verify the resume is accessible
    try {
      const resume = await getResume(rxresumeBaseResumeId);
      if (!resume.data || typeof resume.data !== "object") {
        ok(res, {
          exists: false,
          error: "Selected resume is empty or invalid.",
        });
        return;
      }

      ok(res, { exists: true, error: null });
    } catch (error) {
      if (error instanceof RxResumeAuthConfigError) {
        ok(res, { exists: false, error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    ok(res, { exists: false, error: message });
  }
});

/**
 * POST /api/profile/refresh - Clear profile cache and refetch from Reactive Resume
 */
profileRouter.post("/refresh", async (_req: Request, res: Response) => {
  try {
    clearProfileCache();
    clearRxResumeResumeCache();
    const profile = await getProfile(true);
    ok(res, profile);
  } catch (error) {
    fail(res, toAppError(error));
  }
});
