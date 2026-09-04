import crypto from "crypto";
import { RowDataPacket } from "mysql2";
import { pool } from "../../config/db";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { hashToken, newId } from "../../utils/hash";
import {
  buildCourseMap,
  COURSES,
  CourseKey,
  CourseStatusEntry,
  isTranslateEligible,
  RISE_COURSE_KEYS,
  Pathway,
} from "./courses";
import { hasGeneralProfile } from "../translate/translate.service";

const CERTIFICATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface MyProgress {
  courses: Record<CourseKey, CourseStatusEntry>;
  translateEligible: boolean;
  /** Has a completed general Translate profile — the Fork gate for thrive/adult/school/veterans. */
  translateCompleted: boolean;
  pathway: Pathway | null;
  unlockedPathways: Pathway[];
}

interface EnrollmentRow extends RowDataPacket {
  course_key: CourseKey;
  status: "enrolled" | "in_progress" | "completed";
  enrolled_at: Date;
  status_updated_at: Date;
}

async function getEnrollments(userId: string): Promise<Map<CourseKey, EnrollmentRow>> {
  const [rows] = await pool.query<EnrollmentRow[]>(
    "SELECT course_key, status, enrolled_at, status_updated_at FROM course_enrollments WHERE user_id = ?",
    [userId]
  );
  return new Map(rows.map((r) => [r.course_key, r]));
}

interface UserPathwayRow extends RowDataPacket {
  pathway: Pathway | null;
  date_of_birth: Date | null;
}

async function getUserPathwayRow(userId: string): Promise<UserPathwayRow> {
  const [rows] = await pool.query<UserPathwayRow[]>(
    "SELECT pathway, date_of_birth FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound("We couldn't find that person.");
  return row;
}

async function getUnlockedPathways(userId: string): Promise<Pathway[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT pathway FROM pathway_unlocks WHERE user_id = ?",
    [userId]
  );
  return rows.map((r) => r.pathway as Pathway);
}

/** The signed-in user's full progress picture: every course, Translate eligibility, and pathway state. */
export async function getMyProgress(userId: string): Promise<MyProgress> {
  const [enrollments, userRow, unlocked, translateCompleted] = await Promise.all([
    getEnrollments(userId),
    getUserPathwayRow(userId),
    getUnlockedPathways(userId),
    hasGeneralProfile(userId),
  ]);

  const courses = buildCourseMap(enrollments);

  return {
    courses,
    translateEligible: isTranslateEligible(courses),
    translateCompleted,
    pathway: userRow.pathway,
    unlockedPathways: unlocked,
  };
}

/**
 * Self-enrollment. Idempotent and never downgrades an existing status — a
 * second enroll call on an already-enrolled (or further along) course is a
 * no-op, not a reset back to 'enrolled'.
 */
export async function enrollInCourse(userId: string, courseKey: CourseKey): Promise<CourseStatusEntry> {
  if (COURSES[courseKey].group === "rise") {
    const userRow = await getUserPathwayRow(userId);
    if (userRow.pathway !== "rise") {
      throw ApiError.forbidden("This course is only available on the RISE+ pathway.");
    }
  }

  await pool.query(
    `INSERT INTO course_enrollments (id, user_id, course_key, status)
     VALUES (?, ?, ?, 'enrolled')
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [newId(), userId, courseKey]
  );

  const progress = await getMyProgress(userId);
  return progress.courses[courseKey];
}

/** Fractional years — deliberately not floored, so "17 years 11 months" reads as under 18. */
function ageInYears(dob: Date): number {
  return (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Locks in a user's one pathway. Self-service and one-shot: once set, only an
 * admin can open up additional pathways (see admin.service.unlockPathway).
 * Under-18s can only choose RISE+ here — a hard gate, not a suggestion.
 */
export async function choosePathway(userId: string, pathway: Pathway): Promise<{ pathway: Pathway }> {
  const userRow = await getUserPathwayRow(userId);

  if (userRow.pathway) {
    throw ApiError.conflict(
      "You've already chosen a pathway. Ask your programme lead to unlock another."
    );
  }

  if (!userRow.date_of_birth) {
    throw ApiError.validation("Add your date of birth before choosing a pathway.");
  }

  if (ageInYears(userRow.date_of_birth) < 18 && pathway !== "rise") {
    throw ApiError.forbidden(
      "Under 18? You can only start with RISE+. Ask your programme lead to unlock another pathway."
    );
  }

  await pool.query("UPDATE users SET pathway = ?, pathway_locked_at = NOW() WHERE id = ?", [
    pathway,
    userId,
  ]);

  if (pathway === "rise") {
    // Convenience: RISE+'s two courses are effectively mandatory the moment
    // someone enters that pathway, so enroll them immediately rather than
    // making them separately click "Enroll" on each.
    for (const courseKey of RISE_COURSE_KEYS) {
      await pool.query(
        `INSERT INTO course_enrollments (id, user_id, course_key, status)
         VALUES (?, ?, ?, 'enrolled')
         ON DUPLICATE KEY UPDATE user_id = user_id`,
        [newId(), userId, courseKey]
      );
    }
  }

  return { pathway };
}

/** Certified means the required Lift Project course is Completed — same rule the old lift flag used. */
export async function getCertificateStatus(
  userId: string
): Promise<{ certified: boolean; completedAt: string | null }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT status_updated_at FROM course_enrollments
      WHERE user_id = ? AND course_key = 'lift' AND status = 'completed' LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  return {
    certified: Boolean(row),
    completedAt: row ? (row.status_updated_at as Date).toISOString() : null,
  };
}

/**
 * Self-service certificate link — same mechanism as the admin-issued one
 * (admin.service.issueCertificateLink), just not emailed: the user is right
 * there requesting it interactively and gets the URL back directly.
 */
export async function issueMyCertificateLink(userId: string): Promise<{ url: string; expiresAt: string }> {
  const { certified } = await getCertificateStatus(userId);
  if (!certified) {
    throw ApiError.forbidden("Complete The Lift Project before getting your certificate.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CERTIFICATE_TTL_MS);

  await pool.query(
    `INSERT INTO certificate_links (id, user_id, token_hash, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [newId(), userId, hashToken(token), userId, expiresAt]
  );

  return { url: `${env.FRONTEND_URL}/certificate/${token}`, expiresAt: expiresAt.toISOString() };
}
