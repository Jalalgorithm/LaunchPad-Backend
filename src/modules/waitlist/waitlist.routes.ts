import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authGuard, roleGuard } from "../../middleware/authGuard";
import { waitlistJoinLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import * as waitlistController from "./waitlist.controller";
import { joinWaitlistSchema, listWaitlistQuerySchema } from "./waitlist.validation";

/**
 * Public waitlist for the IGMS marketing site.
 *
 * POST / is the only unauthenticated write endpoint in this API, so it is
 * rate limited on the submitted email as well as the caller's IP — otherwise
 * it doubles as a way to send IGMS-branded mail to anyone's inbox.
 */
export const waitlistRouter = Router();

/**
 * @openapi
 * /waitlist:
 *   post:
 *     tags: [Waitlist]
 *     security: []
 *     summary: Join the IGMS programme waitlist
 *     description: >
 *       Public endpoint. Records the entry, emails the joiner a confirmation
 *       with their reference, and emails the IGMS admin inbox their full
 *       details with the entire waitlist attached as a CSV. Email failures are
 *       logged and never fail the request — the entry is already saved.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, role, programmes, consent]
 *             properties:
 *               fullName: { type: string, example: "Amara Whitfield" }
 *               email: { type: string, format: email }
 *               phone: { type: string, nullable: true }
 *               role:
 *                 type: string
 *                 enum: [participant, parent-or-carer, referrer, partner-organisation, other]
 *               programmes:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: [lift-project, stem-sports, launchpad-adult, launchpad-thrive101, launchpad-school, launchpad-veterans, launchpad-rise-plus, resources-guidebooks]
 *               accessNeeds: { type: string, nullable: true, maxLength: 2000 }
 *               consent: { type: boolean, enum: [true] }
 *     responses:
 *       201: { description: Added to the waitlist }
 *       409: { description: That email address is already on the waitlist }
 *       422: { description: Validation failed }
 *       429: { description: Too many attempts }
 */
waitlistRouter.post(
  "/",
  waitlistJoinLimiter,
  validate({ body: joinWaitlistSchema }),
  asyncHandler(waitlistController.join)
);

/**
 * @openapi
 * /waitlist:
 *   get:
 *     tags: [Waitlist]
 *     summary: List waitlist entries (admin)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         description: Matches name, email or reference
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated waitlist entries }
 *       403: { description: Not an admin }
 */
waitlistRouter.get(
  "/",
  authGuard,
  roleGuard("admin"),
  validate({ query: listWaitlistQuerySchema }),
  asyncHandler(waitlistController.list)
);

/**
 * @openapi
 * /waitlist/export.csv:
 *   get:
 *     tags: [Waitlist]
 *     summary: Download the full waitlist as CSV (admin)
 *     description: >
 *       The same file that is attached to each admin notification, on demand.
 *       Contains personal data including access requirements.
 *     responses:
 *       200:
 *         description: CSV download
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *       403: { description: Not an admin }
 */
waitlistRouter.get(
  "/export.csv",
  authGuard,
  roleGuard("admin"),
  asyncHandler(waitlistController.exportCsv)
);
