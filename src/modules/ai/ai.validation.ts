import { z } from "zod";

export const providerSchema = z.enum(["openai", "gemini"], {
  errorMap: () => ({ message: "Pick a valid AI provider." }),
});

export const cvAssistBodySchema = z.object({
  provider: providerSchema,
  name: z.string().max(100).default(""),
  role: z.string().max(150).default(""),
  skills: z.string().max(1000).default(""),
  exp: z.string().max(3000).default(""),
  summary: z.string().max(1000).default(""),
});

const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const chatMessagesSchema = z.array(chatTurnSchema).min(1).max(20);

export const chatBodySchema = z.discriminatedUnion("persona", [
  z.object({ persona: z.literal("thrive"), provider: providerSchema, messages: chatMessagesSchema }),
  z.object({ persona: z.literal("adult"), provider: providerSchema, messages: chatMessagesSchema }),
  z.object({ persona: z.literal("school"), provider: providerSchema, messages: chatMessagesSchema }),
  z.object({
    persona: z.literal("veteran"),
    provider: providerSchema,
    messages: chatMessagesSchema,
    track: z.enum(["veteran", "spouseEmployed", "spouseHousehold"], {
      errorMap: () => ({ message: "That isn't a valid track." }),
    }),
  }),
]);

export const cvExportBodySchema = z.object({
  format: z.enum(["pdf", "docx"], { errorMap: () => ({ message: "Pick a valid export format." }) }),
  name: z.string().max(100).default(""),
  role: z.string().max(150).default(""),
  email: z.string().max(150).default(""),
  phone: z.string().max(50).default(""),
  location: z.string().max(150).default(""),
  skills: z.string().max(1000).default(""),
  exp: z.string().max(3000).default(""),
  summary: z.string().max(1000).default(""),
});
