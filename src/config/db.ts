import mysql from "mysql2/promise";
import { env } from "./env";

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_POOL_LIMIT,
  waitForConnections: true,
  timezone: "Z",
  // Every query in this codebase uses placeholders; disabling multiple
  // statements removes stacked-query injection as a class of bug entirely.
  multipleStatements: false,
});

/**
 * Force every connection to UTC.
 *
 * `timezone: "Z"` above only tells the driver how to *parse* DATETIMEs — the
 * server still evaluates NOW() and CURRENT_TIMESTAMP in its own zone (usually
 * SYSTEM). On a host that isn't UTC the two disagree, and every timestamp
 * written by SQL reads back offset by the host's UTC offset. That silently
 * breaks any comparison between a SQL-written time and JS `Date.now()` — which
 * is exactly what the refresh-token reuse window depends on.
 */
pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export async function pingDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query("SELECT 1");
  } finally {
    conn.release();
  }
}

/** Runs `fn` inside a transaction, rolling back on any thrown error. */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
