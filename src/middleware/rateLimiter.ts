import rateLimit, { Options } from "express-rate-limit";
import { Request } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { normalizeEmail } from "../utils/hash";

/**
 * Rate limits are the enumeration-safe half of this backend's brute-force
 * defence: they trip identically whether or not the email belongs to a real
 * account, so an attacker learns nothing from being throttled.
 *
 * Limiters keyed by email are the important ones — keying only by IP lets a
 * botnet spread a credential-stuffing run across thousands of addresses.
 */

const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

function rateLimitHandler(_req: Request, _res: unknown, next: (err: unknown) => void) {
  next(ApiError.rateLimited(RATE_LIMIT_MESSAGE));
}

/** Keys on the submitted email when there is one, falling back to the caller's IP. */
function emailOrIpKey(tag: string) {
  return (req: Request): string => {
    const raw = (req.body as { email?: unknown } | undefined)?.email;
    if (typeof raw === "string" && raw.length > 0) return `${tag}:email:${normalizeEmail(raw)}`;
    return `${tag}:ip:${req.ip ?? "unknown"}`;
  };
}

function buildLimiter(config: Partial<Options>) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler as unknown as Options["handler"],
    ...config,
  });
}

/** Coarse backstop applied to every request. */
export const globalRateLimiter = buildLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/**
 * Endpoints that send an email. Deliberately tight: this is both the brute-force
 * control and the thing stopping the API from being used to spam a third party's
 * inbox. Doubles as the resend cooldown, which is why it's keyed on the email —
 * the response is then identical for existing and unknown accounts.
 */
export const otpRequestLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: emailOrIpKey("otp-request"),
});

/** Guessing a 6-digit code. 10 tries per 15 min per email, on top of the per-code cap of 5. */
export const otpVerifyLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: emailOrIpKey("otp-verify"),
});

/** Password sign-in attempts, per email address. */
export const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  keyGenerator: emailOrIpKey("login"),
});

/** Account creation and token exchange — IP-keyed, since there's no email in the body. */
export const sensitiveIpLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

/**
 * Certificate link lookups. The token is 256 bits so guessing is hopeless
 * anyway; this is here to stop anyone using the endpoint as a cheap way to
 * hammer the database. Generous enough that a recipient reloading their
 * certificate page never notices it.
 */
export const certificateLookupLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 60,
});

/**
 * The public IGMS waitlist. This is the only unauthenticated endpoint that
 * writes a row and sends mail, which makes it the obvious lever for pushing
 * IGMS-branded email at someone else's inbox. Keyed on the submitted email,
 * falling back to IP — generous enough that nobody filling the form in once
 * will ever meet it.
 */
export const waitlistJoinLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: emailOrIpKey("waitlist-join"),
});

/**
 * EasyAsk short notes. Public *and* backed by a paid AI call, which is a
 * combination nothing else in this API has — so it gets its own IP-keyed cap.
 * There is no email in the body to key on, and asking for one would break the
 * "no account" promise the tool is built around. Loose enough for someone to
 * redraft their note several times over.
 */
export const easyAskLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 12,
});

/**
 * AI calls (CV assist, Buddy chat) — the first limiter keyed on the
 * authenticated user rather than email/IP, since these routes sit behind
 * authGuard already. Bounds real per-call cost against a third-party API,
 * generous enough for normal CV-editing and chat use in one session.
 */
export const aiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req: Request): string => `ai:user:${req.user?.id ?? req.ip ?? "unknown"}`,
});
