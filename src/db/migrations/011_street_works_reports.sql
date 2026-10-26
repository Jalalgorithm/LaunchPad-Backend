-- Newham street works reports (IGMS site, /report-street-works).
--
-- Anonymous by design: no name, contact details, IP address or time of day.
-- Only the day is kept, so a report cannot be matched to a moment someone was
-- seen on a street. The street is optional free text and is the one field
-- that could identify someone, which is why the public board only ever shows
-- totals, and only names a street once several people have named it.

CREATE TABLE street_works_reports (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reported_on  DATE NOT NULL,
  area         ENUM(
    'Stratford','Forest Gate','Manor Park','East Ham','Upton Park and Green Street',
    'Plaistow','West Ham','Canning Town','Custom House and Royal Docks','Beckton','Other'
  ) NOT NULL,
  street       VARCHAR(60) NULL,
  ticks        SET(
    'fall','missed','isolated','avoided',
    'closed','surface','crossing','barriers','nowarning','noise'
  ) NOT NULL,
  reported_by  ENUM('self','support','researcher') NOT NULL DEFAULT 'self',
  INDEX idx_swr_reported_on (reported_on),
  INDEX idx_swr_area (area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
