import { z } from "zod";
import { ApiError } from "../../utils/ApiError";
import { generateText } from "./ai.provider";
import type { AiProvider } from "./ai.types";

const SYSTEM_PROMPT = `You write one-page CVs for LaunchPad101's Thrive101 pathway — entry-level and \
training-route jobseekers in the UK, many of them NEET (Not in Education, Employment or Training) youth \
translating non-traditional life experience (caring responsibilities, informal work, volunteering, crisis \
navigation, non-UK qualifications) into employable, ATS-friendly language.

Rules:
- Rephrase and structure only what the person actually told you. Never invent employers, dates, job titles, \
qualifications, or achievements that weren't given. You may draw out additional specific, distinct detail that \
is genuinely implied by what was written (e.g. a single sentence about "managing a family's relocation" can \
become separate bullets for logistics, budgeting, and communication if all three are genuinely implied) — but \
never fabricate a fact that has no basis in the input.
- Plain British English, no jargon, no clichés like "team player" or "hard worker" used alone without evidence.
- The summary is 2–3 sentences, first-person-adjacent but CV-style (no "I"), specific rather than generic, \
leading with their strongest translatable strength and covering the breadth of what they provided.
- Skills is a comma-separated list of 6–10 concrete, specific, multi-word skill phrases (not single vague \
words, not soft-skill buzzwords without evidence), ordered strongest and most relevant to the target role \
first.
- Experience is one bullet per line. Where the input genuinely supports it, produce 2–4 detailed bullets per \
described activity rather than compressing everything into a single line — each bullet starts with a strong, \
varied action verb (avoid repeating the same verb twice), names what was done, and gives real scope or context \
(who/what/how much/how often, only if given). Keep every bullet in the same overall order as the input.
- Formatting must be neat and consistent throughout: sentence case (not Title Case), no trailing full stops on \
skills or experience bullets, no sentence in the summary repeated near-verbatim as a bullet.
- Reply with ONLY a JSON object: {"summary": string, "skills": string, "exp": string}. No markdown, no \
commentary outside the JSON.`;

const cvAssistResultSchema = z.object({
  summary: z.string().min(1),
  skills: z.string().min(1),
  exp: z.string().min(1),
});

export interface CvAssistInput {
  provider: AiProvider;
  name: string;
  role: string;
  skills: string;
  exp: string;
  summary: string;
}

export interface CvAssistResult {
  summary: string;
  skills: string;
  exp: string;
}

export async function improveCv(input: CvAssistInput): Promise<CvAssistResult> {
  const userPrompt = [
    `Target role: ${input.role || "(not specified)"}`,
    `Current skills: ${input.skills || "(none given yet)"}`,
    `Current experience lines:\n${input.exp || "(none given yet)"}`,
    `Current summary: ${input.summary || "(none given yet)"}`,
  ].join("\n\n");

  const raw = await generateText(input.provider, {
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    json: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw ApiError.serviceUnavailable("The AI response couldn't be read — please try again.");
  }

  const result = cvAssistResultSchema.safeParse(parsed);
  if (!result.success) {
    throw ApiError.serviceUnavailable("The AI response wasn't in the expected format — please try again.");
  }

  return result.data;
}
