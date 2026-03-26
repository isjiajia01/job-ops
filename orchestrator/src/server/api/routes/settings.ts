import { asyncRoute, ok } from "@infra/http";
import { isDemoMode, sendDemoBlocked } from "@server/config/demo";
import { setBackupSettings } from "@server/services/backup/index";
import { getEffectiveSettings } from "@server/services/settings";
import { applySettingsUpdates } from "@server/services/settings-update";
import { updateSettingsSchema } from "@shared/settings-schema";
import { type Request, type Response, Router } from "express";

export const settingsRouter = Router();

/**
 * GET /api/settings - Get app settings (effective + defaults)
 */
settingsRouter.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const data = await getEffectiveSettings();
    ok(res, data);
  }),
);

/**
 * PATCH /api/settings - Update settings overrides
 */
settingsRouter.patch(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Saving settings is disabled in the public demo.",
        { route: "PATCH /api/settings" },
      );
    }

    const input = updateSettingsSchema.parse(req.body);
    const plan = await applySettingsUpdates(input);

    const data = await getEffectiveSettings();

    if (plan.shouldRefreshBackupScheduler) {
      setBackupSettings({
        enabled: data.backupEnabled.value,
        hour: data.backupHour.value,
        maxCount: data.backupMaxCount.value,
      });
    }
    ok(res, data);
  }),
);
