import crypto from "crypto";
import { RowDataPacket } from "mysql2";
import { pool, withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { sendMail, type MailAttachment } from "../../config/mailer";
import {
  igmsWaitlistAdminEmail,
  igmsWaitlistConfirmationEmail,
  type WaitlistEmailView,
} from "../../emails/igms.templates";
import { ApiError } from "../../utils/ApiError";
import { newId, normalizeEmail } from "../../utils/hash";
import {
  APPLICANT_ROLE_LABELS,
  programmeNames,
  sortProgrammes,
  type ApplicantRole,
  type ProgrammeId,
} from "./waitlist.catalogue";
import { buildCsv } from "./waitlist.csv";
import type { JoinWaitlistInput } from "./waitlist.validation";

/** Reference alphabet with I, O, 0 and 1 removed — these get read aloud. */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERENCE_LENGTH = 5;
const REFERENCE_ATTEMPTS = 5;

interface EntryRow extends RowDataPacket {
  id: string;
  reference: string;
  full_name: string;
  email: string;
  phone: string | null;
  applicant_role: ApplicantRole;
  access_needs: string | null;
  consented_at: Date;
  created_at: Date;
  programmes: string | null;
}

/** What the IGMS frontend's `WaitlistEntry` expects back from POST /waitlist. */
export interface WaitlistEntry {
  id: string;
  reference: string;
  email: string;
  fullName: string;
  programmes: ProgrammeId[];
  submittedAt: string;
}

export interface WaitlistAdminEntry extends WaitlistEntry {
  phone: string | null;
  role: ApplicantRole;
  roleLabel: string;
  accessNeeds: string | null;
}

function generateReference(): string {
  let tail = "";
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    tail += REFERENCE_ALPHABET[crypto.randomInt(0, REFERENCE_ALPHABET.length)];
  }
  return `IGMS-${new Date().getUTCFullYear()}-${tail}`;
}

function isDuplicateKey(err: unknown, keyName: string): boolean {
  const candidate = err as { code?: string; message?: string };
  return candidate?.code === "ER_DUP_ENTRY" && Boolean(candidate.message?.includes(keyName));
}

function splitProgrammes(concatenated: string | null): ProgrammeId[] {
  if (!concatenated) return [];
  return sortProgrammes(concatenated.split(",") as ProgrammeId[]);
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

const LONDON_DATE = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/London",
});

function toEmailView(entry: WaitlistAdminEntry, consentedAt: Date): WaitlistEmailView {
  return {
    reference: entry.reference,
    fullName: entry.fullName,
    firstName: firstNameOf(entry.fullName),
    email: entry.email,
    phone: entry.phone ?? "",
    roleLabel: entry.roleLabel,
    programmeNames: programmeNames(entry.programmes),
    accessNeeds: entry.accessNeeds ?? "",
    submittedAt: LONDON_DATE.format(consentedAt),
  };
}

/**
 * Inserts the entry and its programme choices in one transaction.
 *
 * The reference is retried on collision rather than pre-checked: a SELECT
 * followed by an INSERT is a race, and the unique index is the only thing that
 * can actually decide. Five attempts against a 32^5 space is far beyond
 * sufficient.
 */
async function insertEntry(input: JoinWaitlistInput, consentedAt: Date): Promise<string> {
  const emailNormalized = normalizeEmail(input.email);

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    // A fresh id per attempt: a retry is a brand-new insert, and reusing the
    // id of a rolled-back one would be confusing to trace.
    const id = newId();
    const reference = generateReference();
    try {
      await withTransaction(async (conn) => {
        await conn.query(
          `INSERT INTO igms_waitlist_entries
             (id, reference, full_name, email, email_normalized, phone, applicant_role, access_needs, consented_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            reference,
            input.fullName,
            input.email,
            emailNormalized,
            input.phone ?? null,
            input.role,
            input.accessNeeds ?? null,
            consentedAt,
          ]
        );

        await conn.query(
          `INSERT INTO igms_waitlist_programmes (entry_id, programme_id) VALUES ?`,
          [input.programmes.map((programmeId) => [id, programmeId])]
        );
      });

      return id;
    } catch (err) {
      if (isDuplicateKey(err, "uq_igms_waitlist_email")) {
        // Field-shaped so the form can attach it to the email input, matching
        // what validate() produces for a Zod failure.
        throw new ApiError(
          409,
          "CONFLICT",
          "That email address is already on the waitlist.",
          [
            {
              field: "email",
              message:
                "This address is already registered. Check your inbox for your reference.",
            },
          ]
        );
      }
      if (isDuplicateKey(err, "uq_igms_waitlist_reference")) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Could not allocate a unique waitlist reference after several attempts");
}

async function getEntryById(id: string): Promise<WaitlistAdminEntry | null> {
  const [rows] = await pool.query<EntryRow[]>(
    `SELECT e.*, GROUP_CONCAT(p.programme_id) AS programmes
       FROM igms_waitlist_entries e
       LEFT JOIN igms_waitlist_programmes p ON p.entry_id = e.id
      WHERE e.id = ?
      GROUP BY e.id`,
    [id]
  );
  const row = rows[0];
  return row ? toAdminEntry(row) : null;
}

function toAdminEntry(row: EntryRow): WaitlistAdminEntry {
  return {
    id: row.id,
    reference: row.reference,
    email: row.email,
    fullName: row.full_name,
    programmes: splitProgrammes(row.programmes),
    submittedAt: row.created_at.toISOString(),
    phone: row.phone,
    role: row.applicant_role,
    roleLabel: APPLICANT_ROLE_LABELS[row.applicant_role],
    accessNeeds: row.access_needs,
  };
}

async function fetchAllEntries(): Promise<WaitlistAdminEntry[]> {
  const [rows] = await pool.query<EntryRow[]>(
    `SELECT e.*, GROUP_CONCAT(p.programme_id) AS programmes
       FROM igms_waitlist_entries e
       LEFT JOIN igms_waitlist_programmes p ON p.entry_id = e.id
      GROUP BY e.id
      ORDER BY e.created_at DESC`
  );
  return rows.map(toAdminEntry);
}

const CSV_HEADER = [
  "Reference",
  "Name",
  "Email",
  "Phone",
  "Joining as",
  "Programmes",
  "Access needs",
  "Consented at (UTC)",
] as const;

/** The full waitlist, newest first, as an attachable CSV. */
export async function buildWaitlistCsv(): Promise<{
  attachment: MailAttachment;
  totalEntries: number;
}> {
  const entries = await fetchAllEntries();
  const rows = entries.map((entry) => [
    entry.reference,
    entry.fullName,
    entry.email,
    entry.phone ?? "",
    entry.roleLabel,
    programmeNames(entry.programmes).join("; "),
    entry.accessNeeds ?? "",
    entry.submittedAt,
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    attachment: {
      name: `igms-waitlist-${stamp}.csv`,
      content: buildCsv(CSV_HEADER, rows),
    },
    totalEntries: entries.length,
  };
}

/**
 * Emails the new joiner their confirmation, and the admin inbox the full
 * details plus the whole list as a CSV.
 *
 * Runs after the entry is committed and deliberately never rethrows: the
 * person has joined the waitlist, and an email provider having a bad day must
 * not turn that into an error on their screen. sendMail already swallows its
 * own failures; this catch covers the CSV build and anything else in here.
 */
async function notify(entry: WaitlistAdminEntry, consentedAt: Date): Promise<void> {
  const view = toEmailView(entry, consentedAt);

  try {
    await sendMail(igmsWaitlistConfirmationEmail(view));
  } catch (err) {
    logger.error({ err, reference: entry.reference }, "IGMS waitlist confirmation email failed");
  }

  if (!env.IGMS_ADMIN_EMAIL) {
    logger.warn(
      { reference: entry.reference },
      "IGMS_ADMIN_EMAIL not set — no admin notification sent for a waitlist signup"
    );
    return;
  }

  try {
    const { attachment, totalEntries } = await buildWaitlistCsv();
    await sendMail(igmsWaitlistAdminEmail(env.IGMS_ADMIN_EMAIL, view, attachment, totalEntries));
  } catch (err) {
    logger.error({ err, reference: entry.reference }, "IGMS waitlist admin notification failed");
  }
}

export async function joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry> {
  const consentedAt = new Date();
  const id = await insertEntry(input, consentedAt);

  // Read back rather than reconstructing, so the response carries exactly what
  // was stored — including created_at as the database recorded it.
  const stored = await getEntryById(id);
  if (!stored) {
    throw new Error("Waitlist entry vanished immediately after insert");
  }

  await notify(stored, consentedAt);

  return {
    id: stored.id,
    reference: stored.reference,
    email: stored.email,
    fullName: stored.fullName,
    programmes: stored.programmes,
    submittedAt: stored.submittedAt,
  };
}

export interface ListWaitlistQuery {
  page: number;
  limit: number;
  search?: string;
}

export async function listEntries(query: ListWaitlistQuery) {
  const offset = (query.page - 1) * query.limit;
  const filters: string[] = [];
  const params: unknown[] = [];

  if (query.search) {
    filters.push("(e.full_name LIKE ? OR e.email LIKE ? OR e.reference LIKE ?)");
    const like = `%${query.search}%`;
    params.push(like, like, like);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM igms_waitlist_entries e ${where}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.query<EntryRow[]>(
    `SELECT e.*, GROUP_CONCAT(p.programme_id) AS programmes
       FROM igms_waitlist_entries e
       LEFT JOIN igms_waitlist_programmes p ON p.entry_id = e.id
       ${where}
      GROUP BY e.id
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, query.limit, offset]
  );

  return {
    entries: rows.map(toAdminEntry),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
