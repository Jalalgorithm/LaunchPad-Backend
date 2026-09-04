import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { pool, pingDb } from "./config/db";
import { purgeExpiredOtps } from "./modules/auth/otp.service";
import { seedAdmin } from "./db/seedAdmin";

/** Expired codes carry no secret value once past their window, but they're still
 *  personal data — clear them out daily rather than letting the table grow. */
const OTP_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function main() {
  await pingDb();
  logger.info("Database connection established");

  logger.info(`Admin seed: ${await seedAdmin()}`);

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
    if (env.SWAGGER_ENABLED) {
      logger.info(`Swagger docs available at http://localhost:${env.PORT}/api-docs`);
    }
  });

  const purgeTimer = setInterval(() => {
    purgeExpiredOtps()
      .then((removed) => {
        if (removed > 0) logger.info(`Purged ${removed} expired one-time codes`);
      })
      .catch((err) => logger.error({ err }, "Failed to purge expired one-time codes"));
  }, OTP_PURGE_INTERVAL_MS);
  purgeTimer.unref();

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    clearInterval(purgeTimer);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection");
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
