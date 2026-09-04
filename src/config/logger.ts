import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  // Personal data and credentials must never reach the log sink, even when a
  // request is logged wholesale by pino-http on error.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "req.body.password",
      "req.body.confirmPassword",
      "req.body.newPassword",
      "req.body.currentPassword",
      "req.body.code",
      "req.body.email",
      "code",
      "otp",
    ],
    remove: true,
  },
});
