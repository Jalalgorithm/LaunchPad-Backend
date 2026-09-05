import "dotenv/config";
import { z } from "zod";

/**
 * An enum that tolerates the casing and stray whitespace you get from values
 * typed by hand into a hosting dashboard — "Production" and " production " both
 * resolve. It still rejects anything genuinely unrecognised: NODE_ENV decides
 * whether cookies are Secure and whether Swagger is exposed, so a value we
 * can't interpret must stop the boot rather than quietly fall back.
 */
const looseEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(values));

const envSchema = z.object({
  NODE_ENV: looseEnum(["development", "production", "test"] as const).default("development"),
  PORT: z.coerce.number().default(4000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().min(1),
  DB_POOL_LIMIT: z.coerce.number().default(5),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Signs the short-lived tokens handed out mid-flow (signup step 2 -> 3,
  // password reset step 2 -> 3). Separate secret so a step token can never be
  // replayed as an access token even if a verifier is ever misconfigured.
  JWT_STEP_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("30d"),

  OTP_PEPPER: z.string().min(16),

  // The first admin account, created on boot when no admin exists yet.
  // Leave blank to skip seeding entirely.
  SEED_ADMIN_EMAIL: z.string().default(""),
  SEED_ADMIN_PASSWORD: z.string().default(""),

  BREVO_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().email(),
  EMAIL_FROM_NAME: z.string().default("LaunchPad"),

  // IGMS public waitlist (menospace.uk). Branded separately throughout: these
  // emails go to members of the public who have never heard of LaunchPad, so
  // they must not carry the LaunchPad sender name or template.
  IGMS_EMAIL_FROM_NAME: z.string().default("IGMS"),
  // Blank falls back to EMAIL_FROM. Set it only once the IGMS domain is
  // verified with Brevo — an unverified sender quietly destroys deliverability.
  IGMS_EMAIL_FROM: z.string().email().or(z.literal("")).default(""),
  // Where the new-signup notification and the full-list CSV go. Blank disables
  // the admin notification; the entry is still saved either way.
  IGMS_ADMIN_EMAIL: z.string().email().or(z.literal("")).default(""),
  IGMS_SITE_URL: z.string().url().default("https://menospace.uk"),
  // Optional hosted logo for the email header. Falls back to a styled text
  // lockup, which is what most recipients see anyway — images are blocked by
  // default in a lot of clients.
  IGMS_LOGO_URL: z.string().url().or(z.literal("")).default(""),

  // AI features (CV assist, Vocational & HR Buddy chat, CV export). Each
  // provider is independently optional — a blank key just disables that
  // provider's option in the UI, same as BREVO_API_KEY's "blank = disabled".
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  FRONTEND_URL: z.string().url(),
  CORS_EXTRA_ORIGINS: z.string().default(""),

  // "strict" is right when the API and the app share a registrable domain
  // (launchpad.dev + api.launchpad.dev, or both on localhost). A genuinely
  // cross-site deployment needs "none", which browsers only honour over HTTPS.
  COOKIE_SAMESITE: looseEnum(["strict", "lax", "none"] as const).default("strict"),
  COOKIE_DOMAIN: z.string().default(""),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),

  SWAGGER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v.trim().toLowerCase() === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Field names only — never the values, which are secrets.
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — refusing to start.");
}

export const env = parsed.data;

const secrets = [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.JWT_STEP_SECRET];
if (new Set(secrets).size !== secrets.length) {
  throw new Error(
    "JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and JWT_STEP_SECRET must all be different — refusing to start."
  );
}

if (env.NODE_ENV === "production" && !env.BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY is required in production — refusing to start.");
}

if (env.COOKIE_SAMESITE === "none" && env.NODE_ENV !== "production") {
  // Browsers drop SameSite=None cookies that aren't Secure, and Secure is only
  // set in production — so this combination silently breaks refresh locally.
  console.warn("COOKIE_SAMESITE=none requires HTTPS; the refresh cookie will be rejected here.");
}

export const isProduction = env.NODE_ENV === "production";
