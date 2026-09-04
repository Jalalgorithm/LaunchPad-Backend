-- Real AI Translate output, persisted server-side so "must complete Translate
-- before proceeding" is an enforceable gate rather than a client-side
-- courtesy. One row per (user, kind) — re-running Translate for a kind
-- upserts rather than keeping history, matching course_enrollments'
-- lean-scope precedent.

CREATE TABLE translate_profiles (
  id             CHAR(36) NOT NULL PRIMARY KEY,
  user_id        CHAR(36) NOT NULL,
  kind           ENUM('general','school','veteran') NOT NULL,
  provider       ENUM('openai','gemini') NOT NULL,
  inputs         JSON NOT NULL,
  summary        TEXT NOT NULL,
  skills         JSON NOT NULL,
  -- School-only fields; NULL for general/veteran.
  stem_sparks    JSON NULL,
  reveal         TEXT NULL,
  role_matches   JSON NULL,
  concern        TINYINT(1) NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_kind (user_id, kind),
  INDEX idx_tp_user (user_id),
  CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
