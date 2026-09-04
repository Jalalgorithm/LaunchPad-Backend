import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { easyAskLimiter } from "../../middleware/rateLimiter";
import { validate } from "../../middleware/validate";
import * as easyAskController from "./easyask.controller";
import { shortNoteBodySchema } from "./easyask.validation";

/**
 * EasyAsk — the public self-advocacy writing aid on the IGMS site.
 *
 * Unauthenticated by design: the tool promises no login and no account, which
 * is most of the reason people are willing to use it. Nothing is stored, so
 * there is no read side to this module at all.
 */
export const easyAskRouter = Router();

/**
 * @openapi
 * /easyask/short-note:
 *   post:
 *     tags: [EasyAsk]
 *     security: []
 *     summary: Turn two plain answers into a short self-advocacy note
 *     description: >
 *       Public and stateless. Nothing in the request is written to the database
 *       or the logs — the tool's first screen promises exactly that, and the
 *       answers routinely describe health and disability needs.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [context, difficulty, help]
 *             properties:
 *               context:
 *                 type: string
 *                 enum: [work, doctor, school, transport]
 *               transportMode:
 *                 type: string
 *                 enum: [land, sea, air]
 *                 description: Required when context is `transport`.
 *               difficulty: { type: string, maxLength: 400 }
 *               help: { type: string, maxLength: 400 }
 *               provider:
 *                 type: string
 *                 enum: [openai, gemini]
 *                 description: Optional. Defaults to whichever is configured.
 *     responses:
 *       200: { description: Note ready }
 *       422: { description: Validation failed }
 *       429: { description: Too many attempts }
 *       503: { description: No provider configured, or it returned nothing usable }
 */
easyAskRouter.post(
  "/short-note",
  easyAskLimiter,
  validate({ body: shortNoteBodySchema }),
  asyncHandler(easyAskController.shortNote)
);
