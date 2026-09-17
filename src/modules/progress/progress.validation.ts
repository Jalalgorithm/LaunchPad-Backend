import { z } from "zod";

/** Kept as an explicit literal list (rather than derived from courses.ts) so Zod can infer a real union type. */
export const courseKeyParamSchema = z.object({
  courseKey: z.enum(
    ["lift", "stem", "lion_voices", "rise_awareness", "rise_resilience", "esol_application", "dbs_application"],
    { errorMap: () => ({ message: "That isn't a valid course." }) }
  ),
});

export const choosePathwaySchema = z.object({
  pathway: z.enum(["thrive", "adult", "school", "veterans", "rise"], {
    errorMap: () => ({ message: "That isn't a valid pathway." }),
  }),
});

export const setAdultModulesSchema = z
  .object({
    esolModuleOn: z.boolean().optional(),
    rqfModuleOn: z.boolean().optional(),
  })
  .refine((v) => v.esolModuleOn !== undefined || v.rqfModuleOn !== undefined, {
    message: "Provide at least one of esolModuleOn or rqfModuleOn.",
  });
