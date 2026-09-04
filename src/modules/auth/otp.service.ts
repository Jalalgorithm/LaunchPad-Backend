import { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool, withTransaction } from "../../config/db";
import { ApiError, SAFE_MESSAGES } from "../../utils/ApiError";
import { generateOtpCode, hashOtpCode, newId, safeEqual } from "../../utils/hash";

export type OtpPurpose = "signup" | "login" | "password_reset";

const OTP_TTL_MS = 10 * 60 * 1000;
/** Per-code guess budget. The per-email rate limiter caps attempts across codes. */
const MAX_ATTEMPTS = 5;

interface OtpRow extends RowDataPacket {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
}

/**
 * Issues a fresh code, invalidating any outstanding one for the same
 * email + purpose. Only the newest code can ever be redeemed, so requesting a
 * new code can't widen the window for an attacker sitting on an older one.
 *
 * Returns the plaintext code — the only place it exists outside the email.
 */
export async function issueOtp(email: string, purpose: OtpPurpose): Promise<string> {
  await pool.query(
    "UPDATE email_otps SET consumed_at = NOW() WHERE email = ? AND purpose = ? AND consumed_at IS NULL",
    [email, purpose]
  );

  const code = generateOtpCode();
  await pool.query<ResultSetHeader>(
    "INSERT INTO email_otps (id, email, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
    [newId(), email, purpose, hashOtpCode(code, email, purpose), new Date(Date.now() + OTP_TTL_MS)]
  );

  return code;
}

/**
 * Checks a submitted code and consumes it on success. Returns the id of the
 * email_otps row, which the caller binds into the step token so that token can
 * only be redeemed once.
 *
 * Runs in a transaction with SELECT ... FOR UPDATE so that parallel guesses
 * can't race past the attempt counter.
 *
 * Every failure — wrong code, expired code, no code at all for that address —
 * raises the same error, so this can't be used to probe which emails have a
 * pending code.
 */
export async function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<string> {
  // The transaction returns an outcome rather than throwing, and the error is
  // raised afterwards. Throwing from inside would roll the transaction back —
  // taking the attempt counter and the consumed_at flag with it, which would
  // leave an attacker with unlimited guesses against a code that never burns.
  const outcome = await withTransaction<
    { ok: true; otpId: string } | { ok: false; reason: "invalid" | "exhausted" }
  >(async (conn) => {
    const [rows] = await conn.query<OtpRow[]>(
      `SELECT id, code_hash, attempts, expires_at
         FROM email_otps
        WHERE email = ? AND purpose = ? AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [email, purpose]
    );

    const otp = rows[0];
    if (!otp) return { ok: false, reason: "invalid" };

    const consume = () =>
      conn.query("UPDATE email_otps SET consumed_at = NOW() WHERE id = ?", [otp.id]);

    if (otp.expires_at.getTime() <= Date.now()) {
      await consume();
      return { ok: false, reason: "invalid" };
    }

    if (otp.attempts >= MAX_ATTEMPTS) {
      await consume();
      return { ok: false, reason: "exhausted" };
    }

    // Count the attempt before judging it, so a request that dies mid-flight
    // still costs the attacker one of their five tries.
    await conn.query("UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?", [otp.id]);

    if (!safeEqual(otp.code_hash, hashOtpCode(code, email, purpose))) {
      if (otp.attempts + 1 >= MAX_ATTEMPTS) {
        await consume();
        return { ok: false, reason: "exhausted" };
      }
      return { ok: false, reason: "invalid" };
    }

    await consume();
    return { ok: true, otpId: otp.id };
  });

  if (!outcome.ok) {
    throw ApiError.badRequest(
      outcome.reason === "exhausted"
        ? SAFE_MESSAGES.codeAttemptsExhausted
        : SAFE_MESSAGES.invalidCode
    );
  }

  return outcome.otpId;
}

/**
 * Burns the step token minted from a verified code. A JWT is replayable until
 * it expires; gating redemption on this one-shot database flag is what makes
 * "verify code -> finish signup" a genuinely single-use handoff.
 */
export async function consumeStepToken(
  otpId: string,
  email: string,
  purpose: OtpPurpose
): Promise<void> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE email_otps
        SET step_token_used_at = NOW()
      WHERE id = ? AND email = ? AND purpose = ?
        AND consumed_at IS NOT NULL
        AND step_token_used_at IS NULL`,
    [otpId, email, purpose]
  );

  if (result.affectedRows === 0) {
    throw ApiError.unauthorized(SAFE_MESSAGES.expiredStep);
  }
}

/** Housekeeping for expired rows; safe to call from a cron or on boot. */
export async function purgeExpiredOtps(): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    "DELETE FROM email_otps WHERE expires_at < (NOW() - INTERVAL 1 DAY)"
  );
  return result.affectedRows;
}
