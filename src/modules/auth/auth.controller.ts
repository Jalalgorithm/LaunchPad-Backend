import { CookieOptions, Request, Response } from "express";
import { env, isProduction } from "../../config/env";
import { sendSuccess } from "../../utils/ApiResponse";
import { ApiError, SAFE_MESSAGES } from "../../utils/ApiError";
import * as authService from "./auth.service";
import { REFRESH_TOKEN_TTL_MS } from "./token.service";

const REFRESH_COOKIE = "launchpad_refresh";

/**
 * The refresh token lives in an httpOnly cookie so no script on the page can
 * read it; the short-lived access token goes in the response body for the
 * client to hold in memory. Scoped to /api/auth so it's sent to /refresh and
 * /logout and to nothing else.
 */
function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: env.COOKIE_SAMESITE,
    path: "/api/auth",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, { ...refreshCookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/* Signup */

export async function signupStart(req: Request, res: Response) {
  await authService.startSignup(req.body.email);
  // Identical response whether or not that email already has an account.
  sendSuccess(res, 200, SAFE_MESSAGES.codeSent);
}

export async function signupVerify(req: Request, res: Response) {
  const registrationToken = await authService.verifySignupCode(req.body.email, req.body.code);
  sendSuccess(res, 200, "Email confirmed. Let's finish setting up your account.", {
    registrationToken,
  });
}

export async function signupComplete(req: Request, res: Response) {
  const session = await authService.completeSignup({
    registrationToken: req.body.registrationToken,
    name: req.body.name,
    dateOfBirth: req.body.dateOfBirth,
    password: req.body.password,
  });
  setRefreshCookie(res, session.refreshToken);
  sendSuccess(res, 201, "Your account is ready. Welcome aboard!", {
    accessToken: session.accessToken,
    user: session.user,
  });
}

/* Sign-in */

export async function login(req: Request, res: Response) {
  const session = await authService.loginWithPassword(req.body.email, req.body.password);
  setRefreshCookie(res, session.refreshToken);
  sendSuccess(res, 200, "You're signed in.", {
    accessToken: session.accessToken,
    user: session.user,
  });
}

export async function loginCodeRequest(req: Request, res: Response) {
  await authService.requestLoginCode(req.body.email);
  sendSuccess(res, 200, SAFE_MESSAGES.codeSent);
}

export async function loginCodeVerify(req: Request, res: Response) {
  const session = await authService.loginWithCode(req.body.email, req.body.code);
  setRefreshCookie(res, session.refreshToken);
  sendSuccess(res, 200, "You're signed in.", {
    accessToken: session.accessToken,
    user: session.user,
  });
}

/* Password reset */

export async function forgotPassword(req: Request, res: Response) {
  await authService.requestPasswordReset(req.body.email);
  sendSuccess(res, 200, SAFE_MESSAGES.codeSent);
}

export async function verifyResetCode(req: Request, res: Response) {
  const resetToken = await authService.verifyPasswordResetCode(req.body.email, req.body.code);
  sendSuccess(res, 200, "Code confirmed. You can now choose a new password.", { resetToken });
}

export async function resetPassword(req: Request, res: Response) {
  await authService.resetPassword(req.body.resetToken, req.body.newPassword);
  sendSuccess(res, 200, "Your password has been updated. You can sign in with it now.");
}

export async function changePassword(req: Request, res: Response) {
  await authService.changePassword(
    req.user!.id,
    req.body.currentPassword,
    req.body.newPassword
  );
  clearRefreshCookie(res);
  sendSuccess(res, 200, "Your password has been updated. Please sign in again.");
}

/* Session lifecycle */

export async function refresh(req: Request, res: Response) {
  const token = readRefreshCookie(req);
  if (!token) throw ApiError.unauthorized("Your session has expired. Please sign in again.");

  try {
    const session = await authService.refreshSession(token);
    setRefreshCookie(res, session.refreshToken);
    sendSuccess(res, 200, "Session refreshed.", {
      accessToken: session.accessToken,
      user: session.user,
    });
  } catch (err) {
    // A refresh that can't be honoured leaves a dead cookie behind, which would
    // make the client retry forever. Drop it on the way out.
    clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  const token = readRefreshCookie(req);
  if (token) await authService.logout(token);
  clearRefreshCookie(res);
  // Always 200: a client that's already signed out should still land signed out.
  sendSuccess(res, 200, "You've been signed out.");
}

export async function logoutEverywhere(req: Request, res: Response) {
  await authService.logoutEverywhere(req.user!.id);
  clearRefreshCookie(res);
  sendSuccess(res, 200, "You've been signed out on every device.");
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.user!.id);
  sendSuccess(res, 200, "Profile loaded.", { user });
}

export async function updateProfile(req: Request, res: Response) {
  const user = await authService.updateProfile(req.user!.id, req.body.dateOfBirth);
  sendSuccess(res, 200, "Profile updated.", { user });
}
