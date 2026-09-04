import { env } from "../../../config/env";
import type { GenerateOptions } from "../ai.types";

// @google/genai is ESM-only; this backend is CommonJS, so it must be loaded
// via a dynamic import (a static import would compile to a `require` call
// and fail at runtime). The client's type is left to inference — an
// explicit written-out reference to the ESM package's types from this CJS
// file would itself need a resolution-mode import attribute.
function createClient() {
  return import("@google/genai").then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));
}

let clientPromise: ReturnType<typeof createClient> | null = null;

function getClient() {
  clientPromise ??= createClient();
  return clientPromise;
}

export async function generateWithGemini({ system, messages, json }: GenerateOptions): Promise<string> {
  const client = await getClient();
  const response = await client.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    config: {
      systemInstruction: system,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}
