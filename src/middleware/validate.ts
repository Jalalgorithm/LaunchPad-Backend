import { NextFunction, Request, Response } from "express";
import { ZodError, ZodTypeAny } from "zod";
import { ApiError } from "../utils/ApiError";

interface ValidationTargets {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // See the note on Request.validatedQuery in types/express.d.ts.
        req.validatedQuery = schemas.query.parse(req.query) as Record<string, unknown>;
      }
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // Field + message only. Zod's issues never echo the submitted value,
        // so a password can't end up in a response body or a client-side log.
        const details = err.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        return next(
          ApiError.validation("Please check the highlighted fields and try again.", details)
        );
      }
      next(err);
    }
  };
}
