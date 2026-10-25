import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { z } from "zod";
import { cleanLine, cleanMultiline, PERSON_NAME } from "../../utils/sanitize";
import {
  APPLICANT_ROLES,
  CONTACT_CHANNELS,
  PHONE_METHODS,
  PROGRAMME_IDS,
} from "./waitlist.catalogue";

/**
 * Mirrors `WaitlistSubmission` in the IGMS frontend. The client validates the
 * same rules for the sake of good error messages; this is the copy that
 * actually decides, because the client can be bypassed entirely.
 */
export const joinWaitlistSchema = z
  .object({
    fullName: z
      .string()
      .max(500, "That name is too long.")
      .transform(cleanLine)
      .pipe(
        z
          .string()
          .min(2, "Enter your name so we know who to contact.")
          .max(120, "That name is too long.")
          .regex(
            PERSON_NAME,
            "Use letters only — spaces, hyphens and apostrophes are fine.",
          ),
      ),

    email: z
      .string()
      .max(500, "That email address is too long.")
      .transform((value) => cleanLine(value).toLowerCase())
      .pipe(
        z
          .string()
          .max(254, "That email address is too long.")
          .email("Enter an email address so we can send your place."),
      ),

    // Absent, empty, or a real number — the field is genuinely optional and an
    // empty string from a cleared input must not fail validation.
    // Stored as E.164. The site sends E.164 already; anything without a "+" is
    // read as a UK number, which is what older clients sent.
    phone: z
      .string()
      .max(32, "That phone number is too long.")
      .optional()
      .transform((value, ctx) => {
        const raw = value ? cleanLine(value) : "";
        if (!raw) return undefined;
        const parsed = parsePhoneNumberFromString(raw, "GB");
        if (!parsed?.isValid()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "That does not look like a valid phone number.",
          });
          return z.NEVER;
        }
        return parsed.number;
      }),

    role: z.enum(APPLICANT_ROLES, {
      error: "Choose how you are joining.",
    }),

    programmes: z
      .array(
        z.enum(PROGRAMME_IDS, {
          error: "That is not a programme we run.",
        }),
      )
      .min(1, "Choose at least one programme to join the waitlist for.")
      .max(PROGRAMME_IDS.length, "That is more programmes than we run.")
      // De-duplicated here rather than trusted: the composite primary key on
      // igms_waitlist_programmes would otherwise reject the whole insert.
      .transform((ids) => Array.from(new Set(ids))),

    accessNeeds: z
      .string()
      .max(4000, "Please keep this under 2000 characters.")
      .optional()
      .transform((value) => (value ? cleanMultiline(value) : ""))
      .pipe(z.string().max(2000, "Please keep this under 2000 characters."))
      .transform((value) => (value ? value : undefined)),

    // Only `true` is acceptable. Consent is the lawful basis for holding any of
    // this, so a missing or false value is a hard failure, not a default.
    consent: z.literal(true, {
      error: "We need your permission before we can contact you.",
    }),

    // Optional so an older client that only sends `consent` keeps working;
    // when present it must name at least one channel.
    contactChannels: z
      .array(
        z.enum(CONTACT_CHANNELS, {
          error: "That is not a way we can contact you.",
        }),
      )
      .min(1, "Tick at least one way we can contact you about your place.")
      .transform((values) => Array.from(new Set(values)))
      .optional(),

    phoneMethods: z
      .array(
        z.enum(PHONE_METHODS, {
          error: "Choose call or WhatsApp.",
        }),
      )
      .optional()
      .transform((values) =>
        values && values.length ? Array.from(new Set(values)) : undefined,
      ),
  })
  // Unknown fields are rejected rather than silently dropped.
  .strict()
  .superRefine((input, ctx) => {
    if (input.phone && !input.phoneMethods) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phoneMethods"],
        message: "Choose whether we should call or WhatsApp you.",
      });
    }
    if (
      !input.phone &&
      (input.phoneMethods || input.contactChannels?.includes("phone"))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Enter a phone number for us to call or WhatsApp.",
      });
    }
  });

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export const listWaitlistQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
});
