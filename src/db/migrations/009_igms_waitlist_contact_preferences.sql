-- IGMS waitlist: per-channel contact consent, phone call/WhatsApp preference,
-- and the sixth LaunchPad101 pathway (Digital Work Ready).
--
-- SET columns rather than child tables: these are tiny fixed option lists
-- that are always read with the entry, never aggregated across entries.
-- Both are NULL for rows created before this migration — those people gave
-- a single blanket consent, and we must not invent a channel choice for them.

ALTER TABLE igms_waitlist_entries
  ADD COLUMN phone_methods SET('call','whatsapp') NULL AFTER phone,
  ADD COLUMN contact_channels SET('email','phone','post') NULL AFTER access_needs;

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
    'resources-guidebooks'
  ) NOT NULL;
