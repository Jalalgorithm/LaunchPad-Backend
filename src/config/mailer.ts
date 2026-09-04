import { env, isProduction } from "./env";
import { logger } from "./logger";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;

export interface MailAttachment {
  /** Filename the recipient sees. */
  name: string;
  content: Buffer;
}

export interface MailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Optional, and optional on purpose — every existing template omits it and
   * behaves exactly as before.
   */
  attachments?: MailAttachment[];
  /**
   * Overrides the default LaunchPad sender for this one message. Used by the
   * IGMS waitlist, whose recipients have no relationship with LaunchPad and
   * would read that sender name as spam.
   */
  sender?: { name: string; email: string };
}

/**
 * Sends one transactional email through Brevo's REST API.
 *
 * Never throws. A provider outage must not turn into a 500 on a signup request,
 * and the failure must not change the shape of the response either — otherwise
 * "did the email send?" becomes a side channel for "does this account exist?".
 * Failures are logged at error level and the caller carries on.
 *
 * Returns whether the send was accepted, for callers that want to log it.
 */
export async function sendMail(payload: MailPayload): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    // env.ts refuses to boot in production without a key, so this is dev only.
    logger.warn({ subject: payload.subject }, "BREVO_API_KEY not set — email not sent");
    return false;
  }

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: payload.sender ?? { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
        // Brevo takes attachments as base64 under `attachment`. Omitted
        // entirely when there are none, so the request body is byte-identical
        // to what it was before for every existing template.
        ...(payload.attachments?.length
          ? {
              attachment: payload.attachments.map((file) => ({
                name: file.name,
                content: file.content.toString("base64"),
              })),
            }
          : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "<unreadable>");
      logger.error(
        { status: response.status, body, subject: payload.subject },
        "Brevo rejected an email"
      );
      return false;
    }

    return true;
  } catch (err) {
    logger.error({ err, subject: payload.subject }, "Failed to reach Brevo");
    return false;
  }
}

/**
 * Development escape hatch: with no Brevo key configured, print the code so the
 * flows are testable offline. Hard-gated on NODE_ENV so a production
 * misconfiguration can never write a live code into the logs.
 */
export function logCodeInDevelopment(email: string, purpose: string, code: string) {
  if (isProduction || env.BREVO_API_KEY) return;
  logger.warn(`[dev] ${purpose} code for ${email}: ${code}`);
}
