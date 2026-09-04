/**
 * CSV generation for the waitlist export.
 *
 * Two hazards are handled here, both of which matter because the file is
 * opened in Excel by a human:
 *
 * 1. Quoting. Names and free-text access needs contain commas, quotes and
 *    newlines. Every field is quoted and internal quotes are doubled, per
 *    RFC 4180.
 *
 * 2. Formula injection. A field beginning `=`, `+`, `-`, `@`, tab or CR is
 *    executed as a formula by Excel and Sheets — so `=HYPERLINK(...)` typed
 *    into the name box becomes a live, clickable payload in the admin's
 *    spreadsheet. Prefixing with an apostrophe forces it to be read as text.
 *    Quoting alone does not prevent this.
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function escapeField(value: string): string {
  const guarded = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsvRow(values: readonly (string | null | undefined)[]): string {
  return values.map((value) => escapeField(value ?? "")).join(",");
}

/**
 * Joins rows with CRLF and prepends a UTF-8 BOM.
 *
 * The BOM is what makes Excel on Windows read the file as UTF-8 — without it,
 * every accented name and every en-dash arrives mojibaked.
 */
export function buildCsv(header: readonly string[], rows: readonly (readonly string[])[]): Buffer {
  const lines = [toCsvRow(header), ...rows.map((row) => toCsvRow(row))];
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}
