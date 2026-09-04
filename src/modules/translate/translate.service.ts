import { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { newId } from "../../utils/hash";
import { generateText } from "../ai/ai.provider";
import { GENERAL_SYSTEM_PROMPT, SCHOOL_SYSTEM_PROMPT, buildVeteranSystemPrompt } from "./translate.prompts";
import type {
  MyTranslateProfiles,
  SkillItem,
  TranslateInput,
  TranslateKind,
  TranslateProfile,
} from "./translate.types";

const skillItemSchema = z.object({ skill: z.string().min(1), evidence: z.string().min(1) });

const generalResultSchema = z.object({
  summary: z.string().min(1),
  skills: z.array(skillItemSchema).min(1),
});

const schoolResultSchema = generalResultSchema.extend({
  stemSparks: z.array(z.string().min(1)).default([]),
  reveal: z.string().min(1),
  roleMatches: z.array(z.string().min(1)).default([]),
  concern: z.boolean().default(false),
});

interface ProfileRow extends RowDataPacket {
  kind: TranslateKind;
  provider: "openai" | "gemini";
  summary: string;
  // JSON columns come back from mysql2 as raw text, not auto-parsed — every
  // one of these needs an explicit JSON.parse in mapRow.
  skills: string;
  stem_sparks: string | null;
  reveal: string | null;
  role_matches: string | null;
  concern: number;
  updated_at: Date;
}

function mapRow(row: ProfileRow): TranslateProfile {
  return {
    kind: row.kind,
    provider: row.provider,
    summary: row.summary,
    skills: JSON.parse(row.skills) as SkillItem[],
    stemSparks: row.stem_sparks ? (JSON.parse(row.stem_sparks) as string[]) : null,
    reveal: row.reveal,
    roleMatches: row.role_matches ? (JSON.parse(row.role_matches) as string[]) : null,
    concern: Boolean(row.concern),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getMyTranslateProfiles(userId: string): Promise<MyTranslateProfiles> {
  const [rows] = await pool.query<ProfileRow[]>(
    `SELECT kind, provider, summary, skills, stem_sparks, reveal, role_matches, concern, updated_at
       FROM translate_profiles WHERE user_id = ?`,
    [userId]
  );

  const result: MyTranslateProfiles = { general: null, school: null, veteran: null };
  for (const row of rows) result[row.kind] = mapRow(row);
  return result;
}

export async function hasGeneralProfile(userId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM translate_profiles WHERE user_id = ? AND kind = 'general' LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}

/**
 * Never lets a malformed AI response reach the client as raw text — same
 * discipline cv.service.ts's improveCv uses.
 */
async function callAndParse<T extends z.ZodTypeAny>(
  provider: TranslateInput["provider"],
  system: string,
  userPrompt: string,
  schema: T
): Promise<z.infer<T>> {
  const raw = await generateText(provider, {
    system,
    messages: [{ role: "user", content: userPrompt }],
    json: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw ApiError.serviceUnavailable("The AI response couldn't be read — please try again.");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw ApiError.serviceUnavailable("The AI response wasn't in the expected format — please try again.");
  }
  return result.data;
}

async function upsert(userId: string, kind: TranslateKind, input: TranslateInput, data: {
  summary: string;
  skills: SkillItem[];
  stemSparks: string[] | null;
  reveal: string | null;
  roleMatches: string[] | null;
  concern: boolean;
}): Promise<TranslateProfile> {
  const { provider, ...inputs } = input as unknown as Record<string, unknown> & {
    provider: TranslateInput["provider"];
  };

  await pool.query(
    `INSERT INTO translate_profiles
       (id, user_id, kind, provider, inputs, summary, skills, stem_sparks, reveal, role_matches, concern)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       provider = VALUES(provider), inputs = VALUES(inputs), summary = VALUES(summary),
       skills = VALUES(skills), stem_sparks = VALUES(stem_sparks), reveal = VALUES(reveal),
       role_matches = VALUES(role_matches), concern = VALUES(concern)`,
    [
      newId(),
      userId,
      kind,
      provider,
      JSON.stringify(inputs),
      data.summary,
      JSON.stringify(data.skills),
      data.stemSparks ? JSON.stringify(data.stemSparks) : null,
      data.reveal,
      data.roleMatches ? JSON.stringify(data.roleMatches) : null,
      data.concern ? 1 : 0,
    ]
  );

  const [rows] = await pool.query<ProfileRow[]>(
    `SELECT kind, provider, summary, skills, stem_sparks, reveal, role_matches, concern, updated_at
       FROM translate_profiles WHERE user_id = ? AND kind = ? LIMIT 1`,
    [userId, kind]
  );
  return mapRow(rows[0]);
}

export async function runTranslate(userId: string, input: TranslateInput): Promise<TranslateProfile> {
  if (input.kind === "general") {
    const userPrompt = [
      `Gap / life history statement:\n${input.gapStatement}`,
      `Qualification statement:\n${input.qualificationText}`,
    ].join("\n\n");
    const result = await callAndParse(input.provider, GENERAL_SYSTEM_PROMPT, userPrompt, generalResultSchema);
    return upsert(userId, "general", input, {
      summary: result.summary,
      skills: result.skills,
      stemSparks: null,
      reveal: null,
      roleMatches: null,
      concern: false,
    });
  }

  if (input.kind === "school") {
    const userPrompt = [
      `Things they do outside class:\n${input.interests}`,
      `School subjects & something they're proud of:\n${input.subjects}`,
    ].join("\n\n");
    const result = await callAndParse(input.provider, SCHOOL_SYSTEM_PROMPT, userPrompt, schoolResultSchema);
    return upsert(userId, "school", input, {
      summary: result.summary,
      skills: result.skills,
      stemSparks: result.stemSparks,
      reveal: result.reveal,
      roleMatches: result.roleMatches,
      concern: result.concern,
    });
  }

  const userPrompt = [`${input.in1}`, `${input.in2}`].join("\n\n");
  const result = await callAndParse(
    input.provider,
    buildVeteranSystemPrompt(input.track),
    userPrompt,
    generalResultSchema
  );
  return upsert(userId, "veteran", input, {
    summary: result.summary,
    skills: result.skills,
    stemSparks: null,
    reveal: null,
    roleMatches: null,
    concern: false,
  });
}
