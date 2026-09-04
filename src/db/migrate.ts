import fs from "fs";
import path from "path";
import { RowDataPacket } from "mysql2";
import { pool } from "../config/db";
import { logger } from "../config/logger";

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT filename FROM schema_migrations");
  return new Set(rows.map((r) => r.filename as string));
}

/**
 * Strips `--` comments and splits on `;`. Migrations must therefore avoid
 * semicolons inside string literals — none of ours need one.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ranAny = false;

  for (const file of files) {
    if (applied.has(file)) {
      logger.info(`Skipping already-applied migration: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    logger.info(`Running migration: ${file}`);

    for (const statement of splitStatements(sql)) {
      await pool.query(statement);
    }

    await pool.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
    ranAny = true;
  }

  logger.info(ranAny ? "All pending migrations applied successfully" : "No pending migrations");
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "Migration failed");
  process.exit(1);
});
