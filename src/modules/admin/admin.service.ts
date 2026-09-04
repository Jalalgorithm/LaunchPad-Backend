import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../../config/db";
import { env } from "../../config/env";
import { sendMail } from "../../config/mailer";
import { logger } from "../../config/logger";
import { certificateLinkEmail } from "../../emails/templates";
import { ApiError } from "../../utils/ApiError";
import { hashToken, newId } from "../../utils/hash";
import crypto from "crypto";
import {
  buildCourseMap,
  CourseKey,
  CourseStatusEntry,
  isTranslateEligible,
  Pathway,
} from "../progress/courses";

/** How long a generated certificate link stays usable. */
const CERTIFICATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface AdminUserRow extends RowDataPacket {
  id: string;
  name: string | null;
  email: string;
  status: "pending" | "active" | "suspended";
  role: "user" | "admin";
  date_of_birth: Date | null;
  pathway: Pathway | null;
  created_at: Date;
  last_login_at: Date | null;
  certificate_links: number;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  status: string;
  role: "user" | "admin";
  dateOfBirth: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  courses: Record<CourseKey, CourseStatusEntry>;
  translateEligible: boolean;
  certified: boolean;
  pathway: Pathway | null;
  unlockedPathways: Pathway[];
  certificateLinks: number;
}

function toAdminUser(
  row: AdminUserRow,
  enrollments: Map<CourseKey, { status: "enrolled" | "in_progress" | "completed"; enrolled_at: Date; status_updated_at: Date }>,
  unlockedPathways: Pathway[]
): AdminUser {
  const courses = buildCourseMap(enrollments);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    role: row.role,
    dateOfBirth: row.date_of_birth ? row.date_of_birth.toISOString().slice(0, 10) : null,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
    courses,
    translateEligible: isTranslateEligible(courses),
    certified: courses.lift.status === "completed",
    pathway: row.pathway,
    unlockedPathways,
    certificateLinks: row.certificate_links,
  };
}

/** `%` and `_` are wildcards in LIKE; escape them so a search for them is literal. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listUsers(options: { page: number; limit: number; search?: string }) {
  const { page, limit, search } = options;
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: unknown[] = [];

  if (search) {
    where.push("(u.name LIKE ? OR u.email LIKE ?)");
    const pattern = `%${escapeLike(search)}%`;
    params.push(pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
    params
  );
  const total = Number(countRows[0].total);

  const [rows] = await pool.query<AdminUserRow[]>(
    `SELECT u.id, u.name, u.email, u.status, u.role, u.date_of_birth, u.pathway, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM certificate_links c
              WHERE c.user_id = u.id AND c.revoked_at IS NULL) AS certificate_links
       FROM users u
       ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const userIds = rows.map((r) => r.id);
  let enrollmentRows: RowDataPacket[] = [];
  let unlockRows: RowDataPacket[] = [];

  if (userIds.length > 0) {
    [[enrollmentRows], [unlockRows]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        "SELECT user_id, course_key, status, enrolled_at, status_updated_at FROM course_enrollments WHERE user_id IN (?)",
        [userIds]
      ),
      pool.query<RowDataPacket[]>("SELECT user_id, pathway FROM pathway_unlocks WHERE user_id IN (?)", [
        userIds,
      ]),
    ]);
  }

  const enrollmentsByUser = new Map<string, Map<CourseKey, RowDataPacket>>();
  for (const row of enrollmentRows) {
    const uid = row.user_id as string;
    if (!enrollmentsByUser.has(uid)) enrollmentsByUser.set(uid, new Map());
    enrollmentsByUser.get(uid)!.set(row.course_key as CourseKey, row as never);
  }

  const unlocksByUser = new Map<string, Pathway[]>();
  for (const row of unlockRows) {
    const uid = row.user_id as string;
    if (!unlocksByUser.has(uid)) unlocksByUser.set(uid, []);
    unlocksByUser.get(uid)!.push(row.pathway as Pathway);
  }

  return {
    users: rows.map((row) =>
      toAdminUser(row, enrollmentsByUser.get(row.id) ?? new Map(), unlocksByUser.get(row.id) ?? [])
    ),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function getUserOrThrow(userId: string): Promise<{ id: string; email: string; name: string | null }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, email, name FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound("We couldn't find that person.");
  return { id: user.id as string, email: user.email as string, name: user.name as string | null };
}

/**
 * Sets a course's status directly. Works even if the user never self-enrolled
 * — an admin can enroll-and-progress someone in one step — by creating the
 * enrollment row if it doesn't exist yet.
 */
export async function setCourseStatus(
  targetUserId: string,
  courseKey: CourseKey,
  status: "enrolled" | "in_progress" | "completed",
  adminId: string
): Promise<CourseStatusEntry> {
  await getUserOrThrow(targetUserId);

  await pool.query(
    `INSERT INTO course_enrollments (id, user_id, course_key, status, status_updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), status_updated_by = VALUES(status_updated_by)`,
    [newId(), targetUserId, courseKey, status, adminId]
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT status, enrolled_at, status_updated_at FROM course_enrollments WHERE user_id = ? AND course_key = ? LIMIT 1",
    [targetUserId, courseKey]
  );
  const row = rows[0];
  return {
    status: row.status,
    enrolledAt: (row.enrolled_at as Date).toISOString(),
    statusUpdatedAt: (row.status_updated_at as Date).toISOString(),
  };
}

/** Resets a course back to not-enrolled — the correction path for an admin mistake. */
export async function clearCourseStatus(targetUserId: string, courseKey: CourseKey): Promise<void> {
  await pool.query("DELETE FROM course_enrollments WHERE user_id = ? AND course_key = ?", [
    targetUserId,
    courseKey,
  ]);
}

export async function unlockPathway(
  targetUserId: string,
  pathway: Pathway,
  adminId: string
): Promise<Pathway[]> {
  await getUserOrThrow(targetUserId);
  await pool.query(
    `INSERT INTO pathway_unlocks (id, user_id, pathway, unlocked_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [newId(), targetUserId, pathway, adminId]
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT pathway FROM pathway_unlocks WHERE user_id = ?",
    [targetUserId]
  );
  return rows.map((r) => r.pathway as Pathway);
}

export async function revokePathwayUnlock(targetUserId: string, pathway: Pathway): Promise<void> {
  await pool.query("DELETE FROM pathway_unlocks WHERE user_id = ? AND pathway = ?", [
    targetUserId,
    pathway,
  ]);
}

/**
 * Mints a certificate link and emails it to the recipient.
 *
 * The token is returned in plaintext exactly once, to the admin who created it;
 * only its hash is stored, so neither we nor a database thief can reconstruct a
 * working URL afterwards.
 */
export async function issueCertificateLink(targetUserId: string, adminId: string) {
  const user = await getUserOrThrow(targetUserId);

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CERTIFICATE_TTL_MS);
  const id = newId();

  await pool.query(
    `INSERT INTO certificate_links (id, user_id, token_hash, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, targetUserId, hashToken(token), adminId, expiresAt]
  );

  const url = `${env.FRONTEND_URL}/certificate/${token}`;
  const emailed = await sendMail(certificateLinkEmail(user.email, url, expiresAt));
  if (!emailed) {
    // The link is still valid and the admin has it, so this isn't fatal — but
    // they need to know the recipient didn't get an email.
    logger.warn({ certificateLinkId: id }, "Certificate link created but the email failed to send");
  }

  return { id, url, expiresAt: expiresAt.toISOString(), emailed };
}

interface CertificateLinkRow extends RowDataPacket {
  id: string;
  issued_at: Date;
  expires_at: Date;
  opened_at: Date | null;
  revoked_at: Date | null;
}

export async function listCertificateLinks(userId: string) {
  const [rows] = await pool.query<CertificateLinkRow[]>(
    `SELECT id, issued_at, expires_at, opened_at, revoked_at
       FROM certificate_links WHERE user_id = ? ORDER BY issued_at DESC`,
    [userId]
  );

  // The token itself is never returned — only its hash exists after creation.
  return rows.map((row) => ({
    id: row.id,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    openedAt: row.opened_at ? row.opened_at.toISOString() : null,
    revoked: row.revoked_at !== null,
  }));
}

export async function revokeCertificateLink(linkId: string) {
  const [result] = await pool.query<ResultSetHeader>(
    "UPDATE certificate_links SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL",
    [linkId]
  );
  if (result.affectedRows === 0) {
    throw ApiError.notFound("That link doesn't exist, or was already revoked.");
  }
}
