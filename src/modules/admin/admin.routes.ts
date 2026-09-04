import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authGuard, roleGuard } from "../../middleware/authGuard";
import { validate } from "../../middleware/validate";
import {
  courseKeyParamSchema,
  courseStatusBodySchema,
  linkIdParamSchema,
  listUsersQuerySchema,
  pathwayBodySchema,
  pathwayParamSchema,
  userIdParamSchema,
} from "./admin.validation";
import * as adminController from "./admin.controller";

export const adminRouter = Router();

// Applied to the whole router rather than per-route: a new admin endpoint added
// later is then protected by default instead of relying on someone remembering.
adminRouter.use(authGuard, roleGuard("admin"));

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List registered users with their course, pathway and certificate status
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         description: Matches name or email
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated users }
 *       403: { description: Not an admin }
 */
adminRouter.get(
  "/users",
  validate({ query: listUsersQuerySchema }),
  asyncHandler(adminController.listUsers)
);

/**
 * @openapi
 * /admin/users/{userId}/courses/{courseKey}:
 *   patch:
 *     tags: [Admin]
 *     summary: Set a user's course status
 *     description: >
 *       Works even if the user never self-enrolled — creates the enrollment
 *       row if needed, so an admin can enroll-and-progress in one step.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: courseKey
 *         required: true
 *         schema: { type: string, enum: [lift, stem, lion_voices, rise_awareness, rise_resilience] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [enrolled, in_progress, completed] }
 *     responses:
 *       200: { description: Updated course status }
 *       404: { description: No such user }
 *   delete:
 *     tags: [Admin]
 *     summary: Reset a user's course back to not-enrolled
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: courseKey
 *         required: true
 *         schema: { type: string, enum: [lift, stem, lion_voices, rise_awareness, rise_resilience] }
 *     responses:
 *       200: { description: Enrollment cleared }
 */
adminRouter.patch(
  "/users/:userId/courses/:courseKey",
  validate({ params: courseKeyParamSchema, body: courseStatusBodySchema }),
  asyncHandler(adminController.setCourseStatus)
);

adminRouter.delete(
  "/users/:userId/courses/:courseKey",
  validate({ params: courseKeyParamSchema }),
  asyncHandler(adminController.clearCourseStatus)
);

/**
 * @openapi
 * /admin/users/{userId}/pathway-unlocks:
 *   post:
 *     tags: [Admin]
 *     summary: Unlock an additional pathway for a user
 *     description: >
 *       A user locks into one pathway themselves (or is hard-routed into RISE+
 *       if under 18). This is how anything beyond that gets opened up.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
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
 *       200: { description: Pathway unlocked }
 */
adminRouter.post(
  "/users/:userId/pathway-unlocks",
  validate({ params: userIdParamSchema, body: pathwayBodySchema }),
  asyncHandler(adminController.unlockPathway)
);

/**
 * @openapi
 * /admin/users/{userId}/pathway-unlocks/{pathway}:
 *   delete:
 *     tags: [Admin]
 *     summary: Revoke a previously unlocked pathway
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: pathway
 *         required: true
 *         schema: { type: string, enum: [thrive, adult, school, veterans, rise] }
 *     responses:
 *       200: { description: Unlock revoked }
 */
adminRouter.delete(
  "/users/:userId/pathway-unlocks/:pathway",
  validate({ params: pathwayParamSchema }),
  asyncHandler(adminController.revokePathwayUnlock)
);

/**
 * @openapi
 * /admin/users/{userId}/certificate-links:
 *   post:
 *     tags: [Admin]
 *     summary: Generate a certificate link and email it to the user
 *     description: >
 *       Returns the URL once, to the caller. Only a hash is stored, so the link
 *       can't be recovered afterwards — generate a new one instead.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: Link created (and emailed, if the provider accepted it) }
 *       404: { description: No such user }
 *   get:
 *     tags: [Admin]
 *     summary: List a user's certificate links
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Links, without their tokens }
 */
adminRouter.post(
  "/users/:userId/certificate-links",
  validate({ params: userIdParamSchema }),
  asyncHandler(adminController.issueCertificateLink)
);

adminRouter.get(
  "/users/:userId/certificate-links",
  validate({ params: userIdParamSchema }),
  asyncHandler(adminController.listCertificateLinks)
);

/**
 * @openapi
 * /admin/certificate-links/{linkId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Revoke a certificate link
 *     parameters:
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Revoked }
 *       404: { description: Unknown or already revoked }
 */
adminRouter.delete(
  "/certificate-links/:linkId",
  validate({ params: linkIdParamSchema }),
  asyncHandler(adminController.revokeCertificateLink)
);
