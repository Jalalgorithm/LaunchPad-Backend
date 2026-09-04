import { z } from "zod";
import { logger } from "../../config/logger";
import { ApiError } from "../../utils/ApiError";
import { generateText, getAvailableProviders } from "../ai/ai.provider";
import type { AiProvider } from "../ai/ai.types";
import { buildShortNoteSystemPrompt, buildUserMessage, NOTE_TITLES } from "./easyask.prompts";
import type { ShortNoteResult } from "./easyask.types";
import type { ShortNoteInput } from "./easyask.validation";

/**
 * EasyAsk stores nothing. There is no table, no insert, and no logging of
 * what anyone types.
 *
 * That is not an oversight — "nothing you say is saved" is the promise printed
 * on the first screen of the tool, and the people it is built for are being
 * asked to describe a health need or a disability to a stranger. Persisting any
 * of it would turn a two-minute writing aid into a special-category data store
 * under UK GDPR Art. 9. If a future change needs an audit trail, it needs a
 * lawful basis and a change to that promise first.
 */

const shortNoteSchema = z.object({
  lines: z.array(z.string().trim().min(1)).min(1).max(6),
  concern: z.boolean().default(false),
});

/** Strip fences and prose the model may wrap around its JSON. */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}

/** Whichever provider the caller asked for, else any that is configured. */
function resolveProvider(requested?: AiProvider): AiProvider {
  const available = getAvailableProviders();

  if (requested) {
    if (!available[requested]) {
      throw ApiError.badRequest(
        "That AI provider isn't available right now — leave the choice to us and we'll use whichever is."
      );
    }
    return requested;
  }

  if (available.openai) return "openai";
  if (available.gemini) return "gemini";

  // Public endpoint, so this is deliberately vague about the cause.
  throw ApiError.serviceUnavailable(
    "We can't write notes just now. Please try again later — your answers were not saved."
  );
}

export async function generateShortNote(input: ShortNoteInput): Promise<ShortNoteResult> {
  const provider = resolveProvider(input.provider);

  const raw = await generateText(provider, {
    system: buildShortNoteSystemPrompt(input.context, input.transportMode),
    messages: [{ role: "user", content: buildUserMessage(input.difficulty, input.help) }],
    json: true,
  });

  // JSON.parse throws on a mangled reply, so failing to parse and failing to
  // validate are handled as the same outcome rather than one 503 and one 500.
  let candidate: unknown;
  try {
    candidate = JSON.parse(extractJson(raw));
  } catch {
    candidate = null;
  }

  const parsed = shortNoteSchema.safeParse(candidate);

  if (!parsed.success) {
    // The raw text is never echoed to the caller — it is derived from their
    // own free text and could carry anything.
    logger.error({ provider, issues: parsed.error.issues }, "EasyAsk returned an unusable note");
    throw ApiError.serviceUnavailable(
      "We couldn't put that into a note just now. Please try again — your answers were not saved."
    );
  }

  return {
    title: NOTE_TITLES[input.context],
    lines: parsed.data.lines,
    concern: parsed.data.concern,
  };
}
