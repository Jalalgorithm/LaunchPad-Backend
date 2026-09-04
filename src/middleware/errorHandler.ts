import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { logger } from "../config/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    // 5xx ApiErrors shouldn't exist, but log anything server-side just in case.
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, method: req.method }, "Server-side ApiError");
    }
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: { code: err.code, details: err.details ?? null },
    });
  }

  // Malformed JSON never reaches a route, so express.json() surfaces it here.
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "We couldn't read that request. Please check the data and try again.",
      error: { code: "BAD_REQUEST", details: null },
    });
  }

  // Everything below is unexpected: a driver error, a bug, a failed connection.
  // The full detail goes to the log; the client gets one fixed sentence with no
  // stack trace, SQL fragment, driver code, or file path in it.
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");

  return res.status(500).json({
    success: false,
    message: "Something went wrong on our end. Please try again in a moment.",
    error: { code: "INTERNAL_ERROR", details: null },
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: "We couldn't find that endpoint. Double-check the URL — everything lives under /api.",
    error: { code: "NOT_FOUND", details: null },
  });
}
