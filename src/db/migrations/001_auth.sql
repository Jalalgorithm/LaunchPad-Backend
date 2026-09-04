-- LaunchPad backend — authentication schema.
--
-- Deliberately minimal under GDPR data minimisation: an account is an email, a
-- display name, an optional date of birth and a password hash. Nothing is stored
-- that no feature actually reads.

CREATE TABLE users (
  id                     CHAR(36) NOT NULL PRIMARY KEY,
  email                  VARCHAR(255) NOT NULL,
  name                   VARCHAR(100) NULL,
  date_of_birth          DATE NULL,
  password_hash          VARCHAR(255) NULL,
  status                 ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  email_verified_at      DATETIME NULL,
  -- Record of consent, required to demonstrate a lawful basis under GDPR.
  terms_accepted_at      DATETIME NULL,
  failed_login_attempts  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until           DATETIME NULL,
  last_login_at          DATETIME NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time codes for signup, passwordless sign-in and password reset.
-- Keyed by email rather than user_id: at signup step 1 no user row exists yet,
-- and creating a placeholder user for an unverified email would both pollute the
-- table and hand attackers an account-enumeration surface.
CREATE TABLE email_otps (
  id                  CHAR(36) NOT NULL PRIMARY KEY,
  email               VARCHAR(255) NOT NULL,
  purpose             ENUM('signup','login','password_reset') NOT NULL,
  -- SHA-256 of (email, purpose, code, server-side pepper). The plaintext code
  -- exists only in the outbound email.
  code_hash           CHAR(64) NOT NULL,
  attempts            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at          DATETIME NOT NULL,
  consumed_at         DATETIME NULL,
  -- Set when the step token minted from this code is redeemed, making that
  -- token single-use even though a JWT is otherwise replayable until expiry.
  step_token_used_at  DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otps_lookup (email, purpose, consumed_at),
  INDEX idx_otps_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh tokens rotate on every use. family_id ties a rotation chain together
-- so that replaying an already-rotated token — the signature of a stolen
-- token — can revoke the entire chain rather than just the one row.
CREATE TABLE refresh_tokens (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  user_id     CHAR(36) NOT NULL,
  family_id   CHAR(36) NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  revoked_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rt_hash (token_hash),
  INDEX idx_rt_user (user_id),
  INDEX idx_rt_family (family_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
