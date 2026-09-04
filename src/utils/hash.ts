import crypto from "crypto";
import { env } from "../config/env";

/** SHA-256 of a high-entropy secret (refresh tokens). Hex encoded, 64 chars. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * SHA-256 of a one-time code, peppered and bound to the email + purpose it was
 * issued for. Six digits is only ~20 bits of entropy, so a bare hash would be
 * trivially reversible from a database dump — the pepper (which lives in the
 * environment, not the database) is what makes the stored value useless alone.
 * Binding the email and purpose in means a code can't be lifted from one row
 * and replayed against another.
 */
export function hashOtpCode(code: string, email: string, purpose: string): string {
  const material = [email, purpose, code, env.OTP_PEPPER].join("|");
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}

/** Length-safe, constant-time comparison of two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** A cryptographically uniform 6-digit code, zero-padded. */
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Lowercased and trimmed — the single canonical form used for lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
