-- Adult Pathway: ESOL/DBS Application Training become real, admin-verified
-- courses (same model as Lift/Lion Voices/STEM/RISE+ — self-enroll, admin
-- marks progress), and the esolModuleOn/rqfModuleOn "which optional section
-- is visible" toggles become a persisted preference. Both were previously
-- client-only zustand booleans.

ALTER TABLE course_enrollments
  MODIFY COLUMN course_key ENUM(
    'lift','stem','lion_voices','rise_awareness','rise_resilience',
    'esol_application','dbs_application'
  ) NOT NULL;

ALTER TABLE users
  ADD COLUMN esol_module_on TINYINT(1) NOT NULL DEFAULT 0 AFTER pathway_locked_at,
  ADD COLUMN rqf_module_on TINYINT(1) NOT NULL DEFAULT 0 AFTER esol_module_on;
