import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { validate } from "../../middleware/validate";
import { aiLimiter } from "../../middleware/rateLimiter";
import { chatBodySchema, cvAssistBodySchema, cvExportBodySchema } from "./ai.validation";
import * as aiController from "./ai.controller";

export const aiRouter = Router();

aiRouter.use(authGuard);

/**
 * @openapi
 * /me/ai/providers:
 *   get:
 *     tags: [AI]
 *     summary: Which AI providers are configured
 *     description: Lets the client disable/hide a provider option the server has no API key for.
 *     responses:
 *       200: { description: Providers loaded }
 */
aiRouter.get("/ai/providers", asyncHandler(aiController.providers));

/**
 * @openapi
 * /me/ai/cv-assist:
 *   post:
 *     tags: [AI]
 *     summary: Ask the chosen AI provider to improve a draft CV
 *     description: >
 *       Rephrases the given summary/skills/experience — never invents facts.
 *       Returns a suggestion the client applies explicitly, not an in-place edit.
 *     responses:
 *       200: { description: Suggestion ready }
 *       400: { description: Chosen provider isn't configured }
 *       429: { $ref: '#/components/responses/RateLimited' }
 *       503: { description: The provider failed or returned something unusable }
 */
aiRouter.post(
  "/ai/cv-assist",
  aiLimiter,
  validate({ body: cvAssistBodySchema }),
  asyncHandler(aiController.cvAssist)
);

/**
 * @openapi
 * /me/ai/chat:
 *   post:
 *     tags: [AI]
 *     summary: Send a message to the AI Vocational & HR Buddy
 *     description: Stateless — the client sends the running conversation each turn (last 20 messages).
 *     responses:
 *       200: { description: Reply ready }
 *       400: { description: Chosen provider isn't configured }
 *       429: { $ref: '#/components/responses/RateLimited' }
 *       503: { description: The provider failed to respond }
 */
aiRouter.post("/ai/chat", aiLimiter, validate({ body: chatBodySchema }), asyncHandler(aiController.chat));

/**
 * @openapi
 * /me/cv/export:
 *   post:
 *     tags: [AI]
 *     summary: Export a CV as a real PDF or DOCX file
 *     description: Returns the binary file directly (not the usual JSON envelope).
 *     responses:
 *       200: { description: File stream }
 */
aiRouter.post("/cv/export", validate({ body: cvExportBodySchema }), asyncHandler(aiController.exportCv));
