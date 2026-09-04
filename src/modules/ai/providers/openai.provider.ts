import OpenAI from "openai";
import { env } from "../../../config/env";
import type { GenerateOptions } from "../ai.types";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export async function generateWithOpenAi({ system, messages, json }: GenerateOptions): Promise<string> {
  const completion = await getClient().chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as const),
    ],
    ...(json ? { response_format: { type: "json_object" as const } } : {}),
  });

  const text = completion.choices[0]?.message.content;
  if (!text) throw new Error("OpenAI returned an empty response.");
  return text;
}
