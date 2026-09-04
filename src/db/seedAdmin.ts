import bcrypt from "bcrypt";
import { RowDataPacket } from "mysql2";
import { pool } from "../config/db";
import { env, isProduction } from "../config/env";
import { logger } from "../config/logger";
import { newId, normalizeEmail } from "../utils/hash";

const BCRYPT_COST = 12;

/**
 * Creates the first admin account, once.
 *
 * Runs on boot and is idempotent in the strongest sense available: it does
 * nothing at all once any admin exists. That matters because the alternative —
 * re-asserting the seed credentials every start — would silently reset the
 * password of a live admin account whose owner had changed it.
 *
 * Returns a short description of what it did, for the caller to log.
 */
export async function seedAdmin(): Promise<string> {
  const email = env.SEED_ADMIN_EMAIL ? normalizeEmail(env.SEED_ADMIN_EMAIL) : "";
  const password = env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    return "skipped — SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set";
  }

  const [admins] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  );
  if (admins.length > 0) {
    return "skipped — an admin already exists";
  }

  // The seeded account is a real login with a password from the environment, so
  // refuse the obviously-unsafe cases rather than creating a weak admin.
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters — refusing to seed.");
  }
  if (isProduction && /password|changeme|admin123|launchpad/i.test(password)) {
    throw new Error("SEED_ADMIN_PASSWORD looks like a placeholder — refusing to seed in production.");
  }

  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  // If that address already signed up as an ordinary user, promote it rather
  // than colliding with the unique index — and leave their password alone.
  if (existing.length > 0) {
    await pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [existing[0].id]);
    return `promoted the existing account ${email} to admin`;
  }

  await pool.query(
    `INSERT INTO users
       (id, email, name, password_hash, status, role, email_verified_at, terms_accepted_at)
     VALUES (?, ?, ?, ?, 'active', 'admin', NOW(), NOW())`,
    [newId(), email, "Administrator", await bcrypt.hash(password, BCRYPT_COST)]
  );

  return `created the first admin account ${email}`;
}

// Also runnable directly: `npm run db:seed`.
if (require.main === module) {
  seedAdmin()
    .then(async (result) => {
      logger.info(`Admin seed: ${result}`);
      await pool.end();
    })
    .catch(async (err) => {
      logger.error({ err }, "Admin seed failed");
      await pool.end();
      process.exit(1);
    });
}
