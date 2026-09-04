export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

/**
 * The only error type whose `message` is ever shown to a client. Everything
 * else that reaches the error handler is logged in full and replaced with a
 * single generic sentence, so internals (SQL, driver codes, stack frames,
 * file paths) can't leak through an API response.
 *
 * Keep every message here friendly, plain-language, and free of any hint about
 * whether a given account exists.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(
    message = "Please sign in to continue.",
    code: ErrorCode = "UNAUTHORIZED"
  ) {
    return new ApiError(401, code, message);
  }
  static forbidden(message = "You don't have access to that.") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(message = "We couldn't find what you were looking for.") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }
  static validation(message: string, details?: unknown) {
    return new ApiError(422, "VALIDATION_ERROR", message, details);
  }
  static rateLimited(message = "Too many attempts. Please wait a few minutes and try again.") {
    return new ApiError(429, "RATE_LIMITED", message);
  }
  /** An upstream dependency (e.g. an AI provider) failed or errored out. */
  static serviceUnavailable(message: string) {
    return new ApiError(503, "SERVICE_UNAVAILABLE", message);
  }
}

/**
 * Shared copy for the paths where the honest answer would leak information.
 * Using one constant keeps the wording identical everywhere, which is the
 * whole point — differing text is itself an oracle.
 */
export const SAFE_MESSAGES = {
  /** Wrong password, unknown email, locked account, passwordless account. */
  invalidCredentials: "That email or password didn't match. Please try again.",
  /** Wrong code, expired code, no code ever issued for that email. */
  invalidCode: "That code isn't valid or has expired. Request a new one to continue.",
  /** Code existed but was guessed at too many times. */
  codeAttemptsExhausted:
    "Too many incorrect attempts on that code. Request a new one to continue.",
  /** Signup/login/reset step token missing, tampered with, expired, or reused. */
  expiredStep: "That step timed out. Please start again from the beginning.",
  /** Every "we emailed you a code" response, whether or not we actually did. */
  codeSent: "If that email address can receive a code, we've just sent one. It expires in 10 minutes.",
} as const;
