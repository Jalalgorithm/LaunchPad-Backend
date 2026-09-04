-- Admin role, server-backed prerequisite tracking, and certificate links.

ALTER TABLE users
  ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user' AFTER status,
  ADD INDEX idx_users_role (role);

-- Prerequisite completion. Only admins may set these, so each column records
-- which admin did it — completion gates a certificate, so it needs an audit trail.
CREATE TABLE user_progress (
  user_id            CHAR(36) NOT NULL PRIMARY KEY,
  lift_completed_at  DATETIME NULL,
  lift_marked_by     CHAR(36) NULL,
  stem_completed_at  DATETIME NULL,
  stem_marked_by     CHAR(36) NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- SET NULL rather than CASCADE: deleting an admin must not erase the record
  -- that a learner's prerequisite was completed.
  CONSTRAINT fk_progress_lift_admin FOREIGN KEY (lift_marked_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_progress_stem_admin FOREIGN KEY (stem_marked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Certificate links. The token is stored hashed, exactly like a one-time code:
-- a database dump alone yields no working certificate URLs.
--
-- Note what is absent: the name printed on the certificate. The recipient types
-- it when they open the link and it is never transmitted or stored — there is
-- deliberately no column for it here.
CREATE TABLE certificate_links (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  user_id      CHAR(36) NOT NULL,
  token_hash   CHAR(64) NOT NULL,
  created_by   CHAR(36) NULL,
  issued_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  opened_at    DATETIME NULL,
  revoked_at   DATETIME NULL,
  UNIQUE KEY uq_cert_token (token_hash),
  INDEX idx_cert_user (user_id),
  CONSTRAINT fk_cert_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cert_admin FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
