import { z } from "zod";
import { APPLICANT_ROLES, PROGRAMME_IDS } from "./waitlist.catalogue";

/**
 * Mirrors `WaitlistSubmission` in the IGMS frontend. The client validates the
 * same rules for the sake of good error messages; this is the copy that
 * actually decides, because the client can be bypassed entirely.
 */
export const joinWaitlistSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your name so we know who to contact.")
    .max(120, "That name is too long."),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter an email address so we can send your place.")
    .max(255, "That email address is too long."),

  // Absent, empty, or a real number — the field is genuinely optional and an
  // empty string from a cleared input must not fail validation.
  phone: z
    .string()
    .trim()
    .max(32, "That phone number is too long.")
    .optional()
    .transform((value) => (value ? value : undefined)),

  role: z.enum(APPLICANT_ROLES, {
    errorMap: () => ({ message: "Choose how you are joining." }),
  }),

  programmes: z
    .array(z.enum(PROGRAMME_IDS, { errorMap: () => ({ message: "That is not a programme we run." }) }))
    .min(1, "Choose at least one programme to join the waitlist for.")
    .max(PROGRAMME_IDS.length, "That is more programmes than we run.")
    // De-duplicated here rather than trusted: the composite primary key on
    // igms_waitlist_programmes would otherwise reject the whole insert.
    .transform((ids) => Array.from(new Set(ids))),

  accessNeeds: z
    .string()
    .trim()
    .max(2000, "Please keep this under 2000 characters.")
    .optional()
    .transform((value) => (value ? value : undefined)),

  // Only `true` is acceptable. Consent is the lawful basis for holding any of
  // this, so a missing or false value is a hard failure, not a default.
  consent: z.literal(true, {
    errorMap: () => ({ message: "We need your permission before we can contact you." }),
  }),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export const listWaitlistQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
});
