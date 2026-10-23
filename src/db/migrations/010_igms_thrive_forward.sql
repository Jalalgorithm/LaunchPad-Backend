-- IGMS waitlist: Thrive Forward (National Lottery funded, Newham) and its
-- Refugee Skills & Wellness Navigator guidebook. Values are appended so the
-- existing rows keep their stored positions.

ALTER TABLE igms_waitlist_programmes
  MODIFY COLUMN programme_id ENUM(
    'lift-project',
    'stem-sports',
    'launchpad-adult',
    'launchpad-thrive101',
    'launchpad-school',
    'launchpad-veterans',
    'launchpad-rise-plus',
    'launchpad-digital-work-ready',
    'resources-guidebooks',
    'thrive-forward',
    'thrive-forward-guidebook'
  ) NOT NULL;
