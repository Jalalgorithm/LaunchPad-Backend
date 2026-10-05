/**
 * Text hygiene for public, unauthenticated input.
 *
 * Output escaping (escapeHtml in the email templates, the CSV formula guard,
 * React on the client) is what actually prevents injection. This layer makes
 * sure what we store is what a person can see: no control characters, no
 * zero-width characters, no bidi overrides that make "admin.exe" read as
 * something else, and one Unicode normal form so duplicates compare equal.
 */

const UNSAFE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

/** Single-line text: unsafe characters removed, whitespace collapsed. */
export function cleanLine(value: string): string {
  return value.normalize("NFC").replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
}

/** Multi-line text: unsafe characters removed, line endings folded to LF. */
export function cleanMultiline(value: string): string {
  return value
    .normalize("NFC")
    .replace(UNSAFE_CHARS, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Names in any script: letters and combining marks joined by spaces,
 * apostrophes, hyphens or full stops. Rejects markup, digits and symbols
 * without rejecting "Zoë", "O'Neill", "Nguyễn" or "محمد".
 */
export const PERSON_NAME = /^[\p{L}\p{M}]+(?:[ '’.-]+[\p{L}\p{M}]+)*\.?$/u;
