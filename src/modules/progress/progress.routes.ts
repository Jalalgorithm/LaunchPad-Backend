import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { validate } from "../../middleware/validate";
import { choosePathwaySchema, courseKeyParamSchema } from "./progress.validation";
import * as progressController from "./progress.controller";

export const progressRouter = Router();

progressRouter.use(authGuard);

/**
 * @openapi
 * /me/progress:
 *   get:
 *     tags: [Progress]
 *     summary: The signed-in user's full progress picture
 *     description: >
 *       Every course's enrollment status, whether Translate is unlocked
 *       (computed — completed on every required prerequisite course), the
 *       user's locked pathway, and any pathways an admin has additionally
 *       unlocked for them.
 *     responses:
 *       200: { description: Progress loaded }
 *       401: { description: Not signed in }
 */
progressRouter.get("/progress", asyncHandler(progressController.myProgress));

/**
 * @openapi
 * /me/courses/{courseKey}/enroll:
 *   post:
 *     tags: [Progress]
 *     summary: Self-enroll in a course
 *     description: >
 *       Idempotent — enrolling twice, or enrolling after an admin has already
 *       progressed the course, is a no-op rather than a reset. RISE+ courses
 *       are only enrollable once the user's pathway is RISE+.
 *     parameters:
 *       - in: path
 *         name: courseKey
 *         required: true
 *         schema: { type: string, enum: [lift, stem, lion_voices, rise_awareness, rise_resilience] }
 *     responses:
 *       200: { description: Enrolled }
 *       403: { description: Not available on your current pathway }
 */
progressRouter.post(
  "/courses/:courseKey/enroll",
  validate({ params: courseKeyParamSchema }),
  asyncHandler(progressController.enroll)
);

/**
 * @openapi
 * /me/pathway:
 *   post:
 *     tags: [Progress]
 *     summary: Choose your one locked pathway
 *     description: >
 *       One-shot: once set, only an admin can unlock additional pathways.
 *       Requires a date of birth on file. Under-18s can only choose RISE+.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pathway]
 *             properties:
 *               pathway: { type: string, enum: [thrive, adult, school, veterans, rise] }
 *     responses:
 *       200: { description: Pathway locked in }
 *       409: { description: Already chosen }
 *       422: { description: Date of birth missing }
 *       403: { description: Under 18 and not choosing RISE+ }
 */
progressRouter.post(
  "/pathway",
  validate({ body: choosePathwaySchema }),
  asyncHandler(progressController.choosePathway)
);

/**
 * @openapi
 * /me/certificate-status:
 *   get:
 *     tags: [Progress]
 *     summary: Whether the signed-in user is certified
 *     responses:
 *       200: { description: Status loaded }
 */
progressRouter.get("/certificate-status", asyncHandler(progressController.certificateStatus));

/**
 * @openapi
 * /me/certificate-link:
 *   post:
 *     tags: [Progress]
 *     summary: Self-issue a certificate link
 *     description: Same link mechanism an admin uses, just requested interactively — not emailed.
 *     responses:
 *       201: { description: Link created }
 *       403: { description: Not yet certified }
 */
progressRouter.post("/certificate-link", asyncHandler(progressController.issueMyCertificateLink));
