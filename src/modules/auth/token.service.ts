import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { ApiError, SAFE_MESSAGES } from "../../utils/ApiError";
import { newId } from "../../utils/hash";

export type StepPurpose = "signup" | "password_reset";

export type UserRole = "user" | "admin";

interface AccessPayload {
  sub: string;
  role: UserRole;
  typ: "access";
}

interface RefreshPayload {
  sub: string;
  fid: string;
  typ: "refresh";
}

interface StepPayload {
  /** The email address proved by the one-time code. */
  sub: string;
  typ: StepPurpose;
  /** id of the email_otps row this token was minted from — enforces single use. */
  jti: string;
}

/** Step tokens are the shortest-lived of the three: just long enough to fill in a form. */
const STEP_TOKEN_EXPIRY = "15m";

export function signAccessToken(userId: string, role: UserRole): string {
  return jwt.sign({ sub: userId, role, typ: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

/** Throws jsonwebtoken's own errors; authGuard maps them to friendly copy. */
export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessPayload;
  if (payload.typ !== "access") throw new Error("Wrong token type");
  // Tokens issued before roles existed carry none; treat them as ordinary users
  // rather than rejecting, and never as admins.
  return { ...payload, role: payload.role === "admin" ? "admin" : "user" };
}

export function signRefreshToken(userId: string, familyId: string): string {
  return jwt.sign({ sub: userId, fid: familyId, typ: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions["expiresIn"],
    // `iat` only has second precision, so rotating within the same second as the
    // previous token would otherwise produce a byte-identical JWT — colliding
    // with the row just revoked and handing the client back a token that is
    // already dead. A random jti makes every issued token unique.
    jwtid: newId(),
  });
}

/** Returns null rather than throwing — the caller answers every failure identically. */
export function verifyRefreshToken(token: string): RefreshPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshPayload;
    if (payload.typ !== "refresh") return null;
    return payload;
  } catch {
    return null;
  }
}

export function signStepToken(email: string, purpose: StepPurpose, otpId: string): string {
  return jwt.sign({ sub: email, typ: purpose, jti: otpId }, env.JWT_STEP_SECRET, {
    expiresIn: STEP_TOKEN_EXPIRY,
  });
}

export function verifyStepToken(token: string, purpose: StepPurpose): StepPayload {
  let payload: StepPayload;
  try {
    payload = jwt.verify(token, env.JWT_STEP_SECRET) as unknown as StepPayload;
  } catch {
    throw ApiError.unauthorized(SAFE_MESSAGES.expiredStep);
  }
  // A signup token must never be redeemable as a password-reset token.
  if (payload.typ !== purpose || !payload.sub || !payload.jti) {
    throw ApiError.unauthorized(SAFE_MESSAGES.expiredStep);
  }
  return payload;
}

/** Parses "15m" / "30d" / "3600s" into milliseconds, for cookie maxAge and DB expiry. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(duration.trim());
  if (!match) throw new Error(`Unsupported duration format: ${duration}`);
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
  return value * multipliers[unit];
}

export const REFRESH_TOKEN_TTL_MS = durationToMs(env.JWT_REFRESH_EXPIRY);
