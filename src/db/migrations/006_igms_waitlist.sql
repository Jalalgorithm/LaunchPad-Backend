-- Public waitlist for the IGMS marketing site (menospace.uk).
--
-- Deliberately standalone: these people are not LaunchPad users and must not
-- become rows in `users`. There is no account, no password, no session — just
-- an expression of interest, which is a much lower-trust and much
-- shorter-retention class of record. Keeping it in its own table means the
-- auth model, the admin user list, and every existing query stay untouched.
--
-- Programmes get their own table rather than a JSON column, mirroring
-- `pathway_unlocks`: it is a set of enum choices that an admin will genuinely
-- want to aggregate over ("how many are waiting on STEM Sports?"), which JSON
-- makes needlessly awkward.

CREATE TABLE igms_waitlist_entries (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  -- Human-quotable, shown on the confirmation screen and in both emails.
  reference         VARCHAR(24) NOT NULL,
  full_name         VARCHAR(255) NOT NULL,
  -- Kept as typed, for addressing them correctly in email.
  email             VARCHAR(255) NOT NULL,
  -- Lowercased/trimmed. The uniqueness constraint lives here so that
  -- "Ada@x.com" and "ada@x.com" cannot both join.
  email_normalized  VARCHAR(255) NOT NULL,
  phone             VARCHAR(50) NULL,
  applicant_role    ENUM('participant','parent-or-carer','referrer','partner-organisation','other') NOT NULL,
  -- Free text. Likely to describe a disability or health need, so it is
  -- special-category data under UK GDPR Art. 9 — treat every copy of this
  -- column accordingly.
  access_needs      TEXT NULL,
  -- When they ticked the consent box. Consent has to be evidenced, not assumed,
  -- so this is a timestamp rather than a boolean.
  consented_at      DATETIME NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_igms_waitlist_email (email_normalized),
  UNIQUE KEY uq_igms_waitlist_reference (reference),
  INDEX idx_igms_waitlist_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE igms_waitlist_programmes (
  entry_id      CHAR(36) NOT NULL,
  programme_id  ENUM(
    'lift-project',
    'stem-sports',
    'launchpad-adult',
    'launchpad-thrive101',
    'launchpad-school',
    'launchpad-veterans',
    'launchpad-rise-plus',
    'resources-guidebooks'
  ) NOT NULL,
  PRIMARY KEY (entry_id, programme_id),
  INDEX idx_iwp_programme (programme_id),
  CONSTRAINT fk_iwp_entry FOREIGN KEY (entry_id) REFERENCES igms_waitlist_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
