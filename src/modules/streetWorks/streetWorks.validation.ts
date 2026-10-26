import { z } from "zod";
import { cleanLine } from "../../utils/sanitize";
import { AREAS, REPORTED_BY, TICKS } from "./streetWorks.catalogue";

/**
 * One anonymous report. Mirrors the form at /report-street-works; this is the
 * copy that decides, because the form can be bypassed.
 */
export const createReportSchema = z
  .object({
    ticks: z
      .array(z.enum(TICKS, { error: "That is not one of the options." }))
      .min(1, "Tick at least one box.")
      .max(TICKS.length, "That is more options than the form has.")
      .transform((values) => Array.from(new Set(values))),

    area: z.enum(AREAS, { error: "Choose an area." }),

    // Optional. Characters that could start a spreadsheet formula or carry
    // markup are dropped here, on top of the CSV export's own guard.
    street: z
      .string()
      .max(200, "Please keep the street name short.")
      .optional()
      .transform((value) => cleanLine(value ?? "").replace(/[<>=+@]/g, "").trim())
      .pipe(z.string().max(60, "Please keep the street name short."))
      .transform((value) => (value ? value : undefined)),

    by: z.enum(REPORTED_BY, { error: "Choose who is filling this in." }).default("self"),

    // Bot trap. Real people never see this field, so anything in it is a bot.
    // Accepted by validation and silently discarded by the controller, so a
    // bot gets no signal that it was caught.
    website: z.string().max(200).optional(),
  })
  .strict();

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const boardQuerySchema = z
  .object({
    period: z.enum(["30", "all"]).default("30"),
  })
  .strict();

export type BoardQuery = z.infer<typeof boardQuerySchema>;
