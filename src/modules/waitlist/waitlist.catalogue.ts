/**
 * The programmes the IGMS site offers a waitlist for, and how each one is
 * named in email and in the CSV.
 *
 * These ids are a contract with three things at once: the ENUM in migrations
 * 006/009/010, the `ProgrammeId` union in the IGMS frontend, and the values below.
 * Adding a programme means changing all three.
 */
export const PROGRAMME_IDS = [
  "lift-project",
  "thrive-forward",
  "stem-sports",
  "launchpad-adult",
  "launchpad-thrive101",
  "launchpad-school",
  "launchpad-veterans",
  "launchpad-rise-plus",
  "launchpad-digital-work-ready",
  "resources-guidebooks",
  "thrive-forward-guidebook",
] as const;

export type ProgrammeId = (typeof PROGRAMME_IDS)[number];

export const PROGRAMME_NAMES: Record<ProgrammeId, string> = {
  "lift-project": "The Lift Project",
  "thrive-forward": "Thrive Forward Skills & Wellness Navigator",
  "stem-sports": "STEM Sports",
  "launchpad-adult": "LaunchPad101 — Adult pathway",
  "launchpad-thrive101": "LaunchPad101 — Thrive101",
  "launchpad-school": "LaunchPad101 — School edition",
  "launchpad-veterans": "LaunchPad101 — Veterans & spouses",
  "launchpad-rise-plus": "LaunchPad101 — RISE+",
  "launchpad-digital-work-ready": "LaunchPad101 — Digital Work Ready",
  "resources-guidebooks": "Resources & Guidebooks",
  "thrive-forward-guidebook": "Thrive Forward — Refugee Skills & Wellness Navigator (guidebook)",
};

export const APPLICANT_ROLES = [
  "participant",
  "parent-or-carer",
  "referrer",
  "partner-organisation",
  "other",
] as const;

export type ApplicantRole = (typeof APPLICANT_ROLES)[number];

export const APPLICANT_ROLE_LABELS: Record<ApplicantRole, string> = {
  participant: "Taking part themselves",
  "parent-or-carer": "Parent or carer",
  referrer: "Referring someone",
  "partner-organisation": "Partner organisation",
  other: "Other",
};

/** Channels a joiner can consent to be contacted by. Mirrors migration 009. */
export const CONTACT_CHANNELS = ["email", "phone", "post"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** How a joiner who gave a number wants it used. Mirrors migration 009. */
export const PHONE_METHODS = ["call", "whatsapp"] as const;
export type PhoneMethod = (typeof PHONE_METHODS)[number];

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  email: "Email",
  phone: "Phone",
  post: "Post",
};

export const PHONE_METHOD_LABELS: Record<PhoneMethod, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
};

/** Catalogue order, so email and CSV never list the same choices differently. */
export function sortProgrammes(ids: readonly ProgrammeId[]): ProgrammeId[] {
  return [...ids].sort((a, b) => PROGRAMME_IDS.indexOf(a) - PROGRAMME_IDS.indexOf(b));
}

export function programmeNames(ids: readonly ProgrammeId[]): string[] {
  return sortProgrammes(ids).map((id) => PROGRAMME_NAMES[id]);
}
