import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { validate } from "../../middleware/validate";
import { cvVariantParamSchema, saveCvDraftBodySchema, saveSchoolPassportBodySchema } from "./drafts.validation";
import * as draftsController from "./drafts.controller";

export const draftsRouter = Router();

draftsRouter.use(authGuard);

/**
 * @openapi
 * /me/cv-drafts:
 *   get:
 *     tags: [Drafts]
 *     summary: The signed-in user's saved CV Builder drafts, one per variant
 *     responses:
 *       200: { description: Drafts loaded }
 */
draftsRouter.get("/cv-drafts", asyncHandler(draftsController.myCvDrafts));

/**
 * @openapi
 * /me/cv-drafts/{variant}:
 *   put:
 *     tags: [Drafts]
 *     summary: Autosave a CV Builder draft
 *     description: Whole-object upsert — the client sends the full form state on every save.
 *     parameters:
 *       - in: path
 *         name: variant
 *         required: true
 *         schema: { type: string, enum: [thrive, adult, veteran] }
 *     responses:
 *       200: { description: Draft saved }
 */
draftsRouter.put(
  "/cv-drafts/:variant",
  validate({ params: cvVariantParamSchema, body: saveCvDraftBodySchema }),
  asyncHandler(draftsController.saveCvDraft)
);

/**
 * @openapi
 * /me/school-passport:
 *   get:
 *     tags: [Drafts]
 *     summary: The signed-in user's saved Strengths Passport draft
 *     responses:
 *       200: { description: Passport loaded (null if never saved) }
 */
draftsRouter.get("/school-passport", asyncHandler(draftsController.mySchoolPassport));

/**
 * @openapi
 * /me/school-passport:
 *   put:
 *     tags: [Drafts]
 *     summary: Autosave the Strengths Passport draft
 *     responses:
 *       200: { description: Passport saved }
 */
draftsRouter.put(
  "/school-passport",
  validate({ body: saveSchoolPassportBodySchema }),
  asyncHandler(draftsController.saveSchoolPassport)
);
