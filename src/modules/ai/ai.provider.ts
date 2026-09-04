import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { ApiError } from "../../utils/ApiError";
import { generateWithOpenAi } from "./providers/openai.provider";
import { generateWithGemini } from "./providers/gemini.provider";
import type { AiProvider, GenerateOptions } from "./ai.types";

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

export function isProviderConfigured(provider: AiProvider): boolean {
  return provider === "openai" ? Boolean(env.OPENAI_API_KEY) : Boolean(env.GEMINI_API_KEY);
}

export function getAvailableProviders(): Record<AiProvider, boolean> {
  return { openai: isProviderConfigured("openai"), gemini: isProviderConfigured("gemini") };
}

/**
 * Runs a chat-completion against whichever provider the caller picked.
 *
 * Never lets a provider SDK's own error (which can carry request internals,
 * quota detail, etc.) reach the client — same discipline as mailer.ts not
 * leaking Brevo's response body into user-facing text.
 */
export async function generateText(provider: AiProvider, options: GenerateOptions): Promise<string> {
  if (!isProviderConfigured(provider)) {
    throw ApiError.badRequest(
      `${PROVIDER_LABEL[provider]} isn't configured right now — try the other provider.`
    );
  }

  try {
    return provider === "openai" ? await generateWithOpenAi(options) : await generateWithGemini(options);
  } catch (err) {
    logger.error({ err, provider }, "AI provider request failed");
    throw ApiError.serviceUnavailable(
      `${PROVIDER_LABEL[provider]} couldn't respond just now — try again in a moment, or switch provider.`
    );
  }
}
