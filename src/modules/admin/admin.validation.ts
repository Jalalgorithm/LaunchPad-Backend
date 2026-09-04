import { z } from "zod";

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Capped so a single request can't be used to pull the whole user table.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid("That isn't a valid user reference."),
});

export const linkIdParamSchema = z.object({
  linkId: z.string().uuid("That isn't a valid link reference."),
});

export const courseKeyParamSchema = z.object({
  userId: z.string().uuid("That isn't a valid user reference."),
  courseKey: z.enum(["lift", "stem", "lion_voices", "rise_awareness", "rise_resilience"], {
    errorMap: () => ({ message: "That isn't a valid course." }),
  }),
});

export const courseStatusBodySchema = z.object({
  status: z.enum(["enrolled", "in_progress", "completed"], {
    errorMap: () => ({ message: "Status must be enrolled, in_progress, or completed." }),
  }),
});

export const pathwayParamSchema = z.object({
  userId: z.string().uuid("That isn't a valid user reference."),
  pathway: z.enum(["thrive", "adult", "school", "veterans", "rise"], {
    errorMap: () => ({ message: "That isn't a valid pathway." }),
  }),
});

export const pathwayBodySchema = z.object({
  pathway: z.enum(["thrive", "adult", "school", "veterans", "rise"], {
    errorMap: () => ({ message: "That isn't a valid pathway." }),
  }),
});
