import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { validate } from "../../middleware/validate";
import {
  loginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  sensitiveIpLimiter,
} from "../../middleware/rateLimiter";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginCodeRequestSchema,
  loginCodeVerifySchema,
  loginSchema,
  resetPasswordSchema,
  signupCompleteSchema,
  signupStartSchema,
  signupVerifySchema,
  updateProfileSchema,
  verifyResetCodeSchema,
} from "./auth.validation";
import * as authController from "./auth.controller";

export const authRouter = Router();

/**
 * @openapi
 * components:
 *   responses:
 *     RateLimited:
 *       description: Too many attempts
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApiError' }
 *     ValidationError:
 *       description: One or more fields failed validation
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApiError' }
 */

/**
 * @openapi
 * /auth/signup/start:
 *   post:
 *     tags: [Auth — Signup]
 *     summary: Step 1 — email a 6-digit signup code
 *     description: >
 *       Always answers with the same generic message, whether or not the address
 *       already has an account, so it can't be used to discover registered
 *       emails. An address that already exists receives a "you already have an
 *       account" email instead of a code. No user record is created here.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Generic acknowledgement }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
authRouter.post(
  "/signup/start",
  otpRequestLimiter,
  validate({ body: signupStartSchema }),
  asyncHandler(authController.signupStart)
);

/**
 * @openapi
 * /auth/signup/verify:
 *   post:
 *     tags: [Auth — Signup]
 *     summary: Step 2 — exchange the code for a registration token
 *     description: Returns a single-use token, valid 15 minutes, for step 3.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, example: "402913" }
 *     responses:
 *       200:
 *         description: Code accepted
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         registrationToken: { type: string }
 *       400: { description: Code is wrong, expired, or out of attempts }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
authRouter.post(
  "/signup/verify",
  otpVerifyLimiter,
  validate({ body: signupVerifySchema }),
  asyncHandler(authController.signupVerify)
);

/**
 * @openapi
 * /auth/signup/complete:
 *   post:
 *     tags: [Auth — Signup]
 *     summary: Step 3 — create the account and sign in
 *     description: >
 *       Only name and password are required. Date of birth is optional and
 *       collected solely for age-dependent features (GDPR data minimisation).
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [registrationToken, name, password, confirmPassword, acceptTerms]
 *             properties:
 *               registrationToken: { type: string }
 *               name: { type: string, example: Ada Lovelace }
 *               dateOfBirth: { type: string, format: date, example: "1995-04-12" }
 *               password: { type: string, format: password, minLength: 10 }
 *               confirmPassword: { type: string, format: password }
 *               acceptTerms: { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Account created and signed in
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       401: { description: Registration token expired or already used }
 *       409: { description: Account already exists for that email }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
authRouter.post(
  "/signup/complete",
  sensitiveIpLimiter,
  validate({ body: signupCompleteSchema }),
  asyncHandler(authController.signupComplete)
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth — Sign-in]
 *     summary: Sign in with email and password
 *     description: >
 *       Returns a short-lived access token in the body and sets an httpOnly
 *       refresh cookie. Unknown emails and wrong passwords produce the same
 *       message and comparable response times.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Signed in
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       401: { description: Credentials didn't match }
 *       403: { description: Account suspended }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
authRouter.post(
  "/login",
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login)
);

/**
 * @openapi
 * /auth/login/code/request:
 *   post:
 *     tags: [Auth — Sign-in]
 *     summary: Email a one-time sign-in code (passwordless)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Generic acknowledgement, sent or not }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
authRouter.post(
  "/login/code/request",
  otpRequestLimiter,
  validate({ body: loginCodeRequestSchema }),
  asyncHandler(authController.loginCodeRequest)
);

/**
 * @openapi
 * /auth/login/code/verify:
 *   post:
 *     tags: [Auth — Sign-in]
 *     summary: Sign in with the one-time code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, example: "402913" }
 *     responses:
 *       200:
 *         description: Signed in
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       400: { description: Code is wrong, expired, or out of attempts }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
authRouter.post(
  "/login/code/verify",
  otpVerifyLimiter,
  validate({ body: loginCodeVerifySchema }),
  asyncHandler(authController.loginCodeVerify)
);

/**
 * @openapi
 * /auth/password/forgot:
 *   post:
 *     tags: [Auth — Password]
 *     summary: Step 1 — email a password reset code
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Generic acknowledgement, sent or not }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
authRouter.post(
  "/password/forgot",
  otpRequestLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword)
);

/**
 * @openapi
 * /auth/password/verify:
 *   post:
 *     tags: [Auth — Password]
 *     summary: Step 2 — exchange the reset code for a reset token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, example: "402913" }
 *     responses:
 *       200:
 *         description: Code accepted
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         resetToken: { type: string }
 *       400: { description: Code is wrong, expired, or out of attempts }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
authRouter.post(
  "/password/verify",
  otpVerifyLimiter,
  validate({ body: verifyResetCodeSchema }),
  asyncHandler(authController.verifyResetCode)
);

/**
 * @openapi
 * /auth/password/reset:
 *   post:
 *     tags: [Auth — Password]
 *     summary: Step 3 — set the new password
 *     description: Revokes every existing session and emails a security notice.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword, confirmPassword]
 *             properties:
 *               resetToken: { type: string }
 *               newPassword: { type: string, format: password, minLength: 10 }
 *               confirmPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Password updated }
 *       401: { description: Reset token expired or already used }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
authRouter.post(
  "/password/reset",
  sensitiveIpLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword)
);

/**
 * @openapi
 * /auth/password/change:
 *   patch:
 *     tags: [Auth — Password]
 *     summary: Change the password while signed in
 *     description: Revokes every session, including this one.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password, minLength: 10 }
 *               confirmPassword: { type: string, format: password }
 *     responses:
 *       200: { description: Password updated }
 *       401: { description: Current password incorrect }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
authRouter.patch(
  "/password/change",
  authGuard,
  sensitiveIpLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword)
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth — Session]
 *     summary: Rotate the refresh cookie and get a new access token
 *     description: >
 *       Reads the httpOnly refresh cookie — no request body. Replaying an
 *       already-rotated token revokes the whole session chain.
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       401: { description: Missing, expired, revoked, or replayed refresh token }
 */
// Deliberately not IP-rate-limited beyond the global cap: the client calls this
// on every app boot and every 15-minute token expiry, so a tight per-IP ceiling
// would break refresh for everyone sharing an office or mobile-carrier NAT. The
// refresh token itself is the control here — an unsigned guess never validates.
authRouter.post("/refresh", asyncHandler(authController.refresh));

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth — Session]
 *     summary: Sign out of this device
 *     description: Needs only the refresh cookie, so it still works after the access token expires.
 *     security: []
 *     responses:
 *       200: { description: Signed out }
 */
authRouter.post("/logout", asyncHandler(authController.logout));

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     tags: [Auth — Session]
 *     summary: Sign out of every device
 *     responses:
 *       200: { description: All sessions revoked }
 */
authRouter.post("/logout-all", authGuard, asyncHandler(authController.logoutEverywhere));

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth — Session]
 *     summary: Get the signed-in user's profile
 *     responses:
 *       200:
 *         description: Profile loaded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/User' }
 *       401: { description: Not signed in or token expired }
 */
authRouter.get("/me", authGuard, asyncHandler(authController.me));

/**
 * @openapi
 * /auth/me:
 *   patch:
 *     tags: [Auth — Session]
 *     summary: Fill in a missing date of birth
 *     description: >
 *       Currently the only editable profile field — added so someone who
 *       skipped it at signup can supply it before choosing a pathway, since
 *       the under-18 RISE+ gate depends on it.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dateOfBirth]
 *             properties:
 *               dateOfBirth: { type: string, format: date, example: "2010-04-12" }
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/User' }
 *       401: { description: Not signed in }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
authRouter.patch(
  "/me",
  authGuard,
  validate({ body: updateProfileSchema }),
  asyncHandler(authController.updateProfile)
);
