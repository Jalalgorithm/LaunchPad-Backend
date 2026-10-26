/**
 * The fixed choices on the street works report, and the harm points each
 * one carries. These ids are a contract with three places at once: the SET
 * and ENUM columns in migration 011, the IGMS frontend's report form, and the
 * values below. Adding an option means changing all three.
 */

export const AREAS = [
  "Stratford",
  "Forest Gate",
  "Manor Park",
  "East Ham",
  "Upton Park and Green Street",
  "Plaistow",
  "West Ham",
  "Canning Town",
  "Custom House and Royal Docks",
  "Beckton",
  "Other",
] as const;
export type Area = (typeof AREAS)[number];

/** What happened to the person. Weighted, because these are the human cost. */
export const HARM_TICKS = ["fall", "missed", "isolated", "avoided"] as const;
/** What the works were like. One point each. */
export const PROBLEM_TICKS = ["closed", "surface", "crossing", "barriers", "nowarning", "noise"] as const;
export const TICKS = [...HARM_TICKS, ...PROBLEM_TICKS] as const;
export type Tick = (typeof TICKS)[number];

export const REPORTED_BY = ["self", "support", "researcher"] as const;
export type ReportedBy = (typeof REPORTED_BY)[number];

export const HARM_POINTS: Record<Tick, number> = {
  fall: 5,
  missed: 4,
  isolated: 3,
  avoided: 3,
  closed: 1,
  surface: 1,
  crossing: 1,
  barriers: 1,
  nowarning: 1,
  noise: 1,
};

/** Wording used in the CSV export. Matches the questions on the form. */
export const TICK_LABELS: Record<Tick, string> = {
  fall: "Fell, or nearly fell",
  missed: "Late for, or missed, work or an appointment",
  avoided: "Didn't make the trip, or needed help",
  isolated: "Goes out less because of it",
  closed: "Pavement closed or too narrow",
  surface: "Ground uneven or bumpy",
  crossing: "No safe way to cross",
  barriers: "Barriers or signs in the way",
  nowarning: "No warning the works were coming",
  noise: "Too noisy or crowded",
};

export const REPORTED_BY_LABELS: Record<ReportedBy, string> = {
  self: "Themselves",
  support: "Someone they support",
  researcher: "IGMS community researcher",
};

/**
 * A street is only named on the public board once this many separate reports
 * name it. Below that, it is folded into "Other streets in <area>", so a
 * single report naming "outside number 12" can never be published.
 */
export const MIN_REPORTS_TO_NAME_STREET = 3;
