import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { swaggerSpec } from "./config/swagger";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { progressRouter } from "./modules/progress/progress.routes";
import { certificatesRouter } from "./modules/certificates/certificates.routes";
import { aiRouter } from "./modules/ai/ai.routes";
import { translateRouter } from "./modules/translate/translate.routes";
import { waitlistRouter } from "./modules/waitlist/waitlist.routes";
import { easyAskRouter } from "./modules/easyask/easyask.routes";

const allowedOrigins = [
  env.FRONTEND_URL,
  env.IGMS_SITE_URL,
  ...env.CORS_EXTRA_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

export function createApp() {
  const app = express();

  // Rate limiting and secure cookies both depend on knowing the real client
  // protocol and IP behind a proxy (Render, nginx, Cloudflare).
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors((req, callback) => {
      const requestOrigin = req.header("Origin");
      // Swagger UI at /api-docs calls this same API and sends an Origin header
      // even though it isn't cross-origin — always allow that case.
      const selfOrigin = `${req.protocol}://${req.get("host")}`;
      const isAllowed =
        !requestOrigin || requestOrigin === selfOrigin || allowedOrigins.includes(requestOrigin);
      // Deny by omitting the CORS headers (the browser blocks it client-side)
      // rather than throwing, which would turn every rejected origin into a 500.
      callback(null, { origin: isAllowed, credentials: true });
    })
  );

  // Auth payloads are small; a low cap keeps oversized-body denial of service
  // off the table without affecting any real request.
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));
  app.use(globalRateLimiter);

  if (env.SWAGGER_ENABLED) {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  app.get("/health", (_req, res) => {
    res.json({ success: true, message: "OK" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/me", progressRouter);
  app.use("/api/me", aiRouter);
  app.use("/api/me", translateRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/certificates", certificatesRouter);
  // Public IGMS marketing-site waitlist. POST is unauthenticated; the list and
  // CSV export beneath it are admin-only, guarded inside the router.
  app.use("/api/waitlist", waitlistRouter);
  // Public EasyAsk writing aid. Stateless — see easyask.service.ts.
  app.use("/api/easyask", easyAskRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
