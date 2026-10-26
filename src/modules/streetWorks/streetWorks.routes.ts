import { Request, Response, Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { streetWorksReportLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import { sendSuccess } from "../../utils/ApiResponse";
import * as streetWorksService from "./streetWorks.service";
import { boardQuerySchema, createReportSchema, type BoardQuery, type CreateReportInput } from "./streetWorks.validation";

/**
 * Newham street works — public and anonymous.
 *
 * POST /api/street-works/reports  one report from /report-street-works
 * GET  /api/street-works/board    totals for the hotspot board on /street-works
 *
 * Nothing that identifies the reporter is accepted, stored or logged. The
 * board never returns individual reports.
 */
export const streetWorksRouter = Router();

streetWorksRouter.post(
  "/reports",
  streetWorksReportLimiter,
  validate({ body: createReportSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateReportInput;
    // The bot trap was filled in: answer exactly as for a real report, store nothing.
    if (!input.website) await streetWorksService.createReport(input);
    sendSuccess(res, 201, "Thank you. Your report has been sent.", null);
  })
);

streetWorksRouter.get(
  "/board",
  validate({ query: boardQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const board = await streetWorksService.getBoard(req.validatedQuery as BoardQuery);
    // Totals change slowly; a minute of caching spares the database on a busy day.
    res.setHeader("Cache-Control", "public, max-age=60");
    sendSuccess(res, 200, "Board loaded.", board);
  })
);
