import { z } from "zod";

/** Max-lengths mirrored from ai.validation.ts's cvExportBodySchema — same fields, same limits. */
export const cvVariantParamSchema = z.object({
  variant: z.enum(["thrive", "adult", "veteran"], {
    errorMap: () => ({ message: "That isn't a valid CV variant." }),
  }),
});

export const saveCvDraftBodySchema = z.object({
  name: z.string().max(100).default(""),
  role: z.string().max(150).default(""),
  email: z.string().max(150).default(""),
  phone: z.string().max(50).default(""),
  location: z.string().max(150).default(""),
  skills: z.string().max(1000).default(""),
  exp: z.string().max(3000).default(""),
  summary: z.string().max(1000).default(""),
});

export const saveSchoolPassportBodySchema = z.object({
  studentId: z.string().max(20).default(""),
  yearGroup: z.string().max(50).default(""),
  skills: z.string().max(1000).default(""),
  exp: z.string().max(3000).default(""),
  summary: z.string().max(1000).default(""),
});
