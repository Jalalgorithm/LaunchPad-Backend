import bcrypt from "bcrypt";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { asyncHandler } from "../../middleware/asyncHandler";
import { exportLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import { ApiError } from "../../utils/ApiError";
import { buildReportsCsv } from "../streetWorks/streetWorks.service";
import { buildWaitlistCsv } from "../waitlist/waitlist.service";

/**
 * Spreadsheet downloads for IGMS staff, behind one shared password.
 *
 * POST /api/exports/verify        → 204 if the password is right
 * POST /api/exports/waitlist      → the waitlist as CSV (opens in Excel)
 * POST /api/exports/street-works  → every street works report as CSV
 *
 * The password is never stored in code. EXPORT_PASSWORD_HASH holds a bcrypt
 * hash of it in the server's .env; with it unset, exports are switched off.
 * It travels in the request body (not a header or the URL), which the logger
 * already redacts. Tight rate limiting makes guessing impractical.
 */
export const exportsRouter = Router();

const exportBodySchema = z.object({ password: z.string().min(1).max(200) }).strict();
const paramsSchema = z.object({ dataset: z.enum(["waitlist", "street-works"]) });

async function checkPassword(password: string): Promise<void> {
  if (!env.EXPORT_PASSWORD_HASH) {
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  }
  const ok = await bcrypt.compare(password, env.EXPORT_PASSWORD_HASH);
  if (!ok) {
    throw new ApiError(401, "UNAUTHORIZED", "That password is not right.");
  }
}

/**
 * Checks the password without downloading anything, so the staff page can
 * show its download screen only once the password is known to be right.
 * Shares the export rate limit, so it is no easier to guess through here.
 */
exportsRouter.post(
  "/verify",
  exportLimiter,
  validate({ body: exportBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await checkPassword((req.body as { password: string }).password);
    res.status(204).end();
  })
);

exportsRouter.post(
  "/:dataset",
  exportLimiter,
  validate({ params: paramsSchema, body: exportBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await checkPassword((req.body as { password: string }).password);

    const dataset = req.params.dataset as z.infer<typeof paramsSchema>["dataset"];
    const attachment =
      dataset === "waitlist" ? (await buildWaitlistCsv()).attachment : await buildReportsCsv();

    // Who downloaded what is worth knowing for a file full of personal data.
    logger.info({ dataset, ip: req.ip }, "IGMS data export downloaded");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.name}"`);
    // Personal data: never cache anywhere.
    res.setHeader("Cache-Control", "no-store");
    res.send(attachment.content);
  })
);
