import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { validate } from "../../middleware/validate";
import { aiLimiter } from "../../middleware/rateLimiter";
import { translateBodySchema } from "./translate.validation";
import * as translateController from "./translate.controller";

export const translateRouter = Router();

translateRouter.use(authGuard);

/**
 * @openapi
 * /me/translate:
 *   get:
 *     tags: [Translate]
 *     summary: The signed-in user's saved Translate profiles
 *     description: >
 *       Returns whatever's been generated so far for each kind — general
 *       (Thrive101/Adult), school, and veteran — each null until that kind's
 *       Translate has been run at least once.
 *     responses:
 *       200: { description: Profiles loaded }
 */
translateRouter.get("/translate", asyncHandler(translateController.myProfiles));

/**
 * @openapi
 * /me/translate:
 *   post:
 *     tags: [Translate]
 *     summary: Run Translate with the chosen AI provider
 *     description: >
 *       Generates a Unified Skills Profile (general), Strengths Passport
 *       (school), or service-track skills profile (veteran) from the given
 *       inputs, and saves it — a second run for the same kind overwrites the
 *       previous result rather than keeping history.
 *     responses:
 *       200: { description: Translate complete }
 *       400: { description: Chosen provider isn't configured }
 *       422: { description: Missing or invalid input for the chosen kind }
 *       429: { $ref: '#/components/responses/RateLimited' }
 *       503: { description: The provider failed or returned something unusable }
 */
translateRouter.post(
  "/translate",
  aiLimiter,
  validate({ body: translateBodySchema }),
  asyncHandler(translateController.translate)
);
