-- Course enrollment, pathway locking, and the removal of the old flat
-- lift/stem-only prerequisite model.
--
-- Replaces `user_progress` (two hardcoded completion columns) with
-- `course_enrollments` (one row per user per course, carrying an explicit
-- enrolled -> in_progress -> completed lifecycle instead of just a completion
-- timestamp). Lion Voices, previously tracked only client-side, becomes a real
-- course here alongside the two RISE+ themes.

CREATE TABLE course_enrollments (
  id                  CHAR(36) NOT NULL PRIMARY KEY,
  user_id             CHAR(36) NOT NULL,
  course_key          ENUM('lift','stem','lion_voices','rise_awareness','rise_resilience') NOT NULL,
  status              ENUM('enrolled','in_progress','completed') NOT NULL DEFAULT 'enrolled',
  enrolled_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- NULL means the status has never been touched by an admin (still whatever
  -- the user's self-enrollment set it to).
  status_updated_by   CHAR(36) NULL,
  UNIQUE KEY uq_user_course (user_id, course_key),
  INDEX idx_ce_user (user_id),
  CONSTRAINT fk_ce_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ce_admin FOREIGN KEY (status_updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: every existing completed lift/stem row becomes a 'completed'
-- enrollment, attributed to whichever admin originally marked it. There is no
-- real historical enrollment date for these, so enrolled_at just reuses the
-- completion timestamp — the closest honest approximation available.
INSERT INTO course_enrollments (id, user_id, course_key, status, enrolled_at, status_updated_at, status_updated_by)
SELECT UUID(), user_id, 'lift', 'completed', lift_completed_at, lift_completed_at, lift_marked_by
  FROM user_progress
 WHERE lift_completed_at IS NOT NULL;

INSERT INTO course_enrollments (id, user_id, course_key, status, enrolled_at, status_updated_at, status_updated_by)
SELECT UUID(), user_id, 'stem', 'completed', stem_completed_at, stem_completed_at, stem_marked_by
  FROM user_progress
 WHERE stem_completed_at IS NOT NULL;

DROP TABLE user_progress;

-- A user's single locked pathway. NULL until they choose one (or an admin
-- assigns one via a pathway_unlocks row and the user enters through that).
ALTER TABLE users
  ADD COLUMN pathway ENUM('thrive','adult','school','veterans','rise') NULL AFTER role,
  ADD COLUMN pathway_locked_at DATETIME NULL AFTER pathway;

-- Additional pathways an admin has opened up beyond the one locked-in choice.
CREATE TABLE pathway_unlocks (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  user_id      CHAR(36) NOT NULL,
  pathway      ENUM('thrive','adult','school','veterans','rise') NOT NULL,
  unlocked_by  CHAR(36) NOT NULL,
  unlocked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_pathway (user_id, pathway),
  CONSTRAINT fk_pu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_admin FOREIGN KEY (unlocked_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
