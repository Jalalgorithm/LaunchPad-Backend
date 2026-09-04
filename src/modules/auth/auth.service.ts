import bcrypt from "bcrypt";
import crypto from "crypto";
import { RowDataPacket } from "mysql2";
import { pool } from "../../config/db";
import { logCodeInDevelopment, sendMail } from "../../config/mailer";
import { logger } from "../../config/logger";
import {
  accountExistsEmail,
  loginCodeEmail,
  passwordChangedEmail,
  passwordResetCodeEmail,
  signupCodeEmail,
  welcomeEmail,
} from "../../emails/templates";
import { ApiError, SAFE_MESSAGES } from "../../utils/ApiError";
import { hashToken, newId } from "../../utils/hash";
import { consumeStepToken, issueOtp, verifyOtp } from "./otp.service";
import {
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  signRefreshToken,
  signStepToken,
  verifyRefreshToken,
  verifyStepToken,
} from "./token.service";

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
/** How long after rotation a replayed refresh token is treated as a race, not theft. */
const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * A real hash to compare against when an email has no account, so the failure
 * path costs the same time as the success path. Without it, response latency
 * alone reveals which addresses are registered. Computed once at boot, off the
 * request path.
 */
const dummyHashPromise = bcrypt.hash(crypto.randomBytes(32).toString("hex"), BCRYPT_COST);

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  name: string | null;
  date_of_birth: Date | null;
  password_hash: string | null;
  status: "pending" | "active" | "suspended";
  role: "user" | "admin";
  email_verified_at: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
}

export interface PublicUser {
  id: string;
  name: string | null;
  email: string;
  dateOfBirth: string | null;
  status: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    dateOfBirth: user.date_of_birth ? user.date_of_birth.toISOString().slice(0, 10) : null,
    status: user.status,
    role: user.role,
    createdAt: user.created_at.toISOString(),
  };
}

async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const [rows] = await pool.query<UserRow[]>("SELECT * FROM users WHERE email = ? LIMIT 1", [
    email,
  ]);
  return rows[0];
}

async function findUserById(id: string): Promise<UserRow | undefined> {
  const [rows] = await pool.query<UserRow[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0];
}

/** Issues an access token plus a brand-new refresh chain. */
async function startSession(user: UserRow): Promise<Session> {
  const familyId = newId();
  const refreshToken = signRefreshToken(user.id, familyId);

  await pool.query(
    "INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
    [
      newId(),
      user.id,
      familyId,
      hashToken(refreshToken),
      new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    ]
  );
  await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

  return {
    accessToken: signAccessToken(user.id, user.role),
    refreshToken,
    user: toPublicUser(user),
  };
}

async function revokeAllSessions(userId: string): Promise<void> {
  // 'signout' rather than 'rotation': these must not be replayable during the
  // grace window, or a password reset wouldn't actually end existing sessions.
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'signout' WHERE user_id = ? AND revoked_at IS NULL",
    [userId]
  );
}

/* ------------------------------------------------------------------ *
 * Signup — step 1: prove the email address                            *
 * ------------------------------------------------------------------ */

/**
 * Emails a verification code for a new account.
 *
 * If the address already has an account we send a "you already have an account"
 * email instead of a code. The API response is byte-for-byte identical in both
 * cases, so this endpoint can't be used to test whether an email is registered.
 * No user row is created until the code has been proved and the form completed.
 */
export async function startSignup(email: string): Promise<void> {
  const existing = await findUserByEmail(email);

  if (existing) {
    await sendMail(accountExistsEmail(email));
    return;
  }

  const code = await issueOtp(email, "signup");
  logCodeInDevelopment(email, "signup", code);
  await sendMail(signupCodeEmail(email, code));
}

/** Signup step 2: exchange a valid code for a short-lived registration token. */
export async function verifySignupCode(email: string, code: string): Promise<string> {
  const otpId = await verifyOtp(email, "signup", code);
  return signStepToken(email, "signup", otpId);
}

/* ------------------------------------------------------------------ *
 * Signup — step 3: create the account                                 *
 * ------------------------------------------------------------------ */

export async function completeSignup(input: {
  registrationToken: string;
  name: string;
  dateOfBirth?: string;
  password: string;
}): Promise<Session> {
  const payload = verifyStepToken(input.registrationToken, "signup");
  const email = payload.sub;

  // Burns the token first: a replay is rejected here rather than at the unique
  // index, and the client gets the accurate "start again" message either way.
  await consumeStepToken(payload.jti, email, "signup");

  const existing = await findUserByEmail(email);
  if (existing) {
    // Reachable only by someone who already proved they own this mailbox, so
    // naming the conflict outright leaks nothing.
    throw ApiError.conflict("That email already has an account. Try signing in instead.");
  }

  const userId = newId();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  await pool.query(
    `INSERT INTO users
       (id, email, name, date_of_birth, password_hash, status, email_verified_at, terms_accepted_at)
     VALUES (?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
    [userId, email, input.name, input.dateOfBirth ?? null, passwordHash]
  );

  const user = await findUserById(userId);
  if (!user) throw new Error(`User ${userId} vanished immediately after insert`);

  await sendMail(welcomeEmail(email, input.name));
  return startSession(user);
}

/* ------------------------------------------------------------------ *
 * Sign-in                                                             *
 * ------------------------------------------------------------------ */

export async function loginWithPassword(email: string, password: string): Promise<Session> {
  const user = await findUserByEmail(email);

  if (!user || !user.password_hash) {
    // Spend the same time as a real comparison before failing.
    await bcrypt.compare(password, await dummyHashPromise);
    throw ApiError.unauthorized(SAFE_MESSAGES.invalidCredentials);
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    // Same message as a wrong password: saying "this account is locked" would
    // confirm the account exists. A locked-out owner can still use an email code.
    throw ApiError.unauthorized(SAFE_MESSAGES.invalidCredentials);
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    const lockUntil = attempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null;
    // Once the lock is applied the counter resets, so the next window starts
    // from zero rather than locking again on the first mistyped password.
    await pool.query(
      "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?",
      [lockUntil ? 0 : attempts, lockUntil, user.id]
    );
    throw ApiError.unauthorized(SAFE_MESSAGES.invalidCredentials);
  }

  assertUsable(user);

  await pool.query(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
    [user.id]
  );
  return startSession(user);
}

/** Status checks run only after credentials are proved, so they reveal nothing. */
function assertUsable(user: UserRow): void {
  if (user.status === "suspended") {
    throw ApiError.forbidden(
      "This account is currently suspended. Please contact support if you think that's a mistake."
    );
  }
}

export async function requestLoginCode(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  // Unknown or suspended address: send nothing, say the same thing.
  if (!user || user.status === "suspended") return;

  const code = await issueOtp(email, "login");
  logCodeInDevelopment(email, "login", code);
  await sendMail(loginCodeEmail(email, code));
}

export async function loginWithCode(email: string, code: string): Promise<Session> {
  await verifyOtp(email, "login", code);

  const user = await findUserByEmail(email);
  if (!user) {
    // No code is ever issued for an unregistered address, so this is
    // unreachable in practice — fail closed with the shared code message.
    throw ApiError.badRequest(SAFE_MESSAGES.invalidCode);
  }

  assertUsable(user);

  // Signing in with an emailed code re-proves the address, so a successful
  // code login also clears any brute-force lockout on the password path.
  await pool.query(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
    [user.id]
  );
  return startSession(user);
}

/* ------------------------------------------------------------------ *
 * Password reset                                                      *
 * ------------------------------------------------------------------ */

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user || user.status === "suspended") return;

  const code = await issueOtp(email, "password_reset");
  logCodeInDevelopment(email, "password_reset", code);
  await sendMail(passwordResetCodeEmail(email, code));
}

export async function verifyPasswordResetCode(email: string, code: string): Promise<string> {
  const otpId = await verifyOtp(email, "password_reset", code);
  return signStepToken(email, "password_reset", otpId);
}

export async function resetPassword(resetToken: string, newPassword: string): Promise<void> {
  const payload = verifyStepToken(resetToken, "password_reset");
  const email = payload.sub;

  await consumeStepToken(payload.jti, email, "password_reset");

  const user = await findUserByEmail(email);
  if (!user) throw ApiError.unauthorized(SAFE_MESSAGES.expiredStep);

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await pool.query(
    "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
    [passwordHash, user.id]
  );

  // Anyone holding a stolen session loses it the moment the password changes.
  await revokeAllSessions(user.id);
  await sendMail(passwordChangedEmail(email));
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !user.password_hash) throw ApiError.unauthorized();

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    throw ApiError.unauthorized("Your current password isn't right. Please try again.");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, user.id]);
  await revokeAllSessions(user.id);
  await sendMail(passwordChangedEmail(user.email));
}

/* ------------------------------------------------------------------ *
 * Session lifecycle                                                   *
 * ------------------------------------------------------------------ */

interface RefreshRow extends RowDataPacket {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: "rotation" | "reuse" | "signout" | null;
}

/**
 * Rotates the refresh token: the presented one is revoked and a replacement
 * issued from the same family.
 *
 * Presenting an *already revoked* token is the fingerprint of a stolen one
 * being replayed after the legitimate client rotated it. When that happens we
 * revoke the whole family, which signs out both the attacker and the real user
 * — the user just signs in again, the attacker can't.
 */
export async function refreshSession(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) throw ApiError.unauthorized("Your session has expired. Please sign in again.");

  const [rows] = await pool.query<RefreshRow[]>(
    "SELECT id, user_id, family_id, expires_at, revoked_at, revoked_reason FROM refresh_tokens WHERE token_hash = ? LIMIT 1",
    [hashToken(refreshToken)]
  );
  const stored = rows[0];

  if (!stored) {
    throw ApiError.unauthorized("Your session has expired. Please sign in again.");
  }

  if (stored.revoked_at) {
    // A token replayed *just* after its own rotation is almost always a race,
    // not a theft: two browser tabs booting together, or a retried request,
    // each send the cookie they were holding. Revoking the family there would
    // sign a legitimate user out for opening a second tab. Outside this narrow
    // window a replay has no innocent explanation, so the family goes.
    //
    // The grace applies only to rotation. A token revoked deliberately — sign
    // out, password reset, or an earlier reuse detection — must stay dead, or
    // replaying it within the window would undo the very revocation that just
    // happened.
    const sinceRevoked = Date.now() - stored.revoked_at.getTime();
    const wasRotated = stored.revoked_reason === "rotation";

    if (!wasRotated || sinceRevoked > REFRESH_REUSE_GRACE_MS) {
      logger.warn(
        { userId: stored.user_id, familyId: stored.family_id, revokedReason: stored.revoked_reason },
        "Refresh token reuse detected"
      );
      await pool.query(
        `UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = 'reuse'
          WHERE family_id = ?`,
        [stored.family_id]
      );
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }

    logger.debug(
      { userId: stored.user_id, familyId: stored.family_id, sinceRevoked },
      "Concurrent refresh within grace window — issuing a new token instead of revoking"
    );
  }

  if (stored.expires_at.getTime() <= Date.now()) {
    throw ApiError.unauthorized("Your session has expired. Please sign in again.");
  }

  const user = await findUserById(stored.user_id);
  if (!user) throw ApiError.unauthorized("Your session has expired. Please sign in again.");
  assertUsable(user);

  // `revoked_at IS NULL` so a replay inside the grace window can't keep pushing
  // the timestamp forward and extend its own window indefinitely.
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'rotation' WHERE id = ? AND revoked_at IS NULL",
    [stored.id]
  );

  const nextToken = signRefreshToken(user.id, stored.family_id);
  await pool.query(
    "INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
    [
      newId(),
      user.id,
      stored.family_id,
      hashToken(nextToken),
      new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    ]
  );

  return {
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: nextToken,
    user: toPublicUser(user),
  };
}

/** Revokes one refresh chain. Silent on an unknown token — logout always succeeds. */
export async function logout(refreshToken: string): Promise<void> {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'signout' WHERE token_hash = ? AND revoked_at IS NULL",
    [hashToken(refreshToken)]
  );
}

export async function logoutEverywhere(userId: string): Promise<void> {
  await revokeAllSessions(userId);
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await findUserById(userId);
  if (!user) throw ApiError.unauthorized("Your session is no longer valid. Please sign in again.");
  assertUsable(user);
  return toPublicUser(user);
}

/**
 * Fills in a missing date of birth. Currently the only editable profile field
 * — added specifically so someone who skipped it at signup can supply it
 * before choosing a pathway, since the under-18 RISE+ gate depends on it.
 */
export async function updateProfile(userId: string, dateOfBirth: string): Promise<PublicUser> {
  await pool.query("UPDATE users SET date_of_birth = ? WHERE id = ?", [dateOfBirth, userId]);
  const user = await findUserById(userId);
  if (!user) throw ApiError.unauthorized("Your session is no longer valid. Please sign in again.");
  return toPublicUser(user);
}
