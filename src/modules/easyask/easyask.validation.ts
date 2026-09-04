import { z } from "zod";

/**
 * Mirrors the EasyAsk modal on the IGMS site. The client caps the free-text
 * boxes at 180 characters; the server allows a little more so that a paste
 * from elsewhere is trimmed rather than rejected outright.
 */
export const shortNoteBodySchema = z
  .object({
    context: z.enum(["work", "doctor", "school", "transport"], {
      errorMap: () => ({ message: "Choose where you need to ask for support." }),
    }),

    transportMode: z
      .enum(["land", "sea", "air"], {
        errorMap: () => ({ message: "Choose the kind of journey." }),
      })
      .optional(),

    difficulty: z
      .string()
      .trim()
      .min(3, "Tell us a little about what is making things hard.")
      .max(400, "Please keep this under 400 characters."),

    help: z
      .string()
      .trim()
      .min(3, "Tell us what would help.")
      .max(400, "Please keep this under 400 characters."),

    // Optional so the public client never has to know which providers exist.
    provider: z.enum(["openai", "gemini"]).optional(),
  })
  .refine((body) => body.context !== "transport" || Boolean(body.transportMode), {
    message: "Choose whether the journey is by land, sea or air.",
    path: ["transportMode"],
  });

export type ShortNoteInput = z.infer<typeof shortNoteBodySchema>;
