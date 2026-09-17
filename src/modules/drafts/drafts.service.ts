import { RowDataPacket } from "mysql2";
import { pool } from "../../config/db";
import { newId } from "../../utils/hash";
import type {
  CvDraft,
  CvVariant,
  MyCvDrafts,
  SaveCvDraftInput,
  SaveSchoolPassportInput,
  SchoolPassportDraft,
} from "./drafts.types";

interface CvDraftRow extends RowDataPacket {
  variant: CvVariant;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  skills: string;
  exp: string;
  summary: string;
  updated_at: Date;
}

function mapCvRow(row: CvDraftRow): CvDraft {
  return {
    variant: row.variant,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    location: row.location,
    skills: row.skills,
    exp: row.exp,
    summary: row.summary,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getMyCvDrafts(userId: string): Promise<MyCvDrafts> {
  const [rows] = await pool.query<CvDraftRow[]>(
    `SELECT variant, name, role, email, phone, location, skills, exp, summary, updated_at
       FROM cv_drafts WHERE user_id = ?`,
    [userId]
  );

  const result: MyCvDrafts = { thrive: null, adult: null, veteran: null };
  for (const row of rows) result[row.variant] = mapCvRow(row);
  return result;
}

export async function saveCvDraft(
  userId: string,
  variant: CvVariant,
  data: SaveCvDraftInput
): Promise<CvDraft> {
  await pool.query(
    `INSERT INTO cv_drafts (id, user_id, variant, name, role, email, phone, location, skills, exp, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), role = VALUES(role), email = VALUES(email), phone = VALUES(phone),
       location = VALUES(location), skills = VALUES(skills), exp = VALUES(exp), summary = VALUES(summary)`,
    [
      newId(),
      userId,
      variant,
      data.name,
      data.role,
      data.email,
      data.phone,
      data.location,
      data.skills,
      data.exp,
      data.summary,
    ]
  );

  const [rows] = await pool.query<CvDraftRow[]>(
    `SELECT variant, name, role, email, phone, location, skills, exp, summary, updated_at
       FROM cv_drafts WHERE user_id = ? AND variant = ? LIMIT 1`,
    [userId, variant]
  );
  return mapCvRow(rows[0]);
}

interface SchoolPassportRow extends RowDataPacket {
  student_id: string;
  year_group: string;
  skills: string;
  exp: string;
  summary: string;
  updated_at: Date;
}

function mapPassportRow(row: SchoolPassportRow): SchoolPassportDraft {
  return {
    studentId: row.student_id,
    yearGroup: row.year_group,
    skills: row.skills,
    exp: row.exp,
    summary: row.summary,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getMySchoolPassport(userId: string): Promise<SchoolPassportDraft | null> {
  const [rows] = await pool.query<SchoolPassportRow[]>(
    `SELECT student_id, year_group, skills, exp, summary, updated_at
       FROM school_passport_drafts WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] ? mapPassportRow(rows[0]) : null;
}

export async function saveMySchoolPassport(
  userId: string,
  data: SaveSchoolPassportInput
): Promise<SchoolPassportDraft> {
  await pool.query(
    `INSERT INTO school_passport_drafts (user_id, student_id, year_group, skills, exp, summary)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       student_id = VALUES(student_id), year_group = VALUES(year_group), skills = VALUES(skills),
       exp = VALUES(exp), summary = VALUES(summary)`,
    [userId, data.studentId, data.yearGroup, data.skills, data.exp, data.summary]
  );

  const [rows] = await pool.query<SchoolPassportRow[]>(
    `SELECT student_id, year_group, skills, exp, summary, updated_at
       FROM school_passport_drafts WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  return mapPassportRow(rows[0]);
}
