-- CV Builder drafts (one per user per variant) and School's Strengths
-- Passport draft. Both were previously client-only (zustand) — this makes
-- them survive reload/device-change via autosave. Explicit typed columns,
-- not a JSON blob, matching how translate_profiles and course_enrollments
-- are already modelled in this codebase.

CREATE TABLE cv_drafts (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  user_id     CHAR(36) NOT NULL,
  variant     ENUM('thrive','adult','veteran') NOT NULL,
  name        VARCHAR(100) NOT NULL DEFAULT '',
  role        VARCHAR(150) NOT NULL DEFAULT '',
  email       VARCHAR(150) NOT NULL DEFAULT '',
  phone       VARCHAR(50) NOT NULL DEFAULT '',
  location    VARCHAR(150) NOT NULL DEFAULT '',
  skills      TEXT NOT NULL,
  exp         TEXT NOT NULL,
  summary     TEXT NOT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_variant (user_id, variant),
  CONSTRAINT fk_cvd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE school_passport_drafts (
  user_id     CHAR(36) NOT NULL PRIMARY KEY,
  student_id  VARCHAR(20) NOT NULL,
  year_group  VARCHAR(50) NOT NULL DEFAULT '',
  skills      TEXT NOT NULL,
  exp         TEXT NOT NULL,
  summary     TEXT NOT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_spd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
