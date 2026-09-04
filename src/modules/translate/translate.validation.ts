import { z } from "zod";
import { providerSchema } from "../ai/ai.validation";

const generalSchema = z.object({
  kind: z.literal("general"),
  provider: providerSchema,
  gapStatement: z.string().min(1, "Tell us a bit about your gap or life history first.").max(3000),
  qualificationText: z.string().min(1, "Add your qualification first.").max(1500),
});

const schoolSchema = z.object({
  kind: z.literal("school"),
  provider: providerSchema,
  interests: z.string().min(1, "Add something you do outside class first.").max(2000),
  subjects: z.string().min(1, "Add a school subject or something you're proud of first.").max(1500),
});

const veteranSchema = z.object({
  kind: z.literal("veteran"),
  provider: providerSchema,
  track: z.enum(["veteran", "spouseEmployed", "spouseHousehold"], {
    errorMap: () => ({ message: "Pick a valid track." }),
  }),
  in1: z.string().min(1, "Fill in the first field before running Translate.").max(2000),
  in2: z.string().min(1, "Fill in the second field before running Translate.").max(2000),
});

export const translateBodySchema = z.discriminatedUnion("kind", [
  generalSchema,
  schoolSchema,
  veteranSchema,
]);
