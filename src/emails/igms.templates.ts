import { env } from "../config/env";
import type { MailAttachment, MailPayload } from "../config/mailer";

/**
 * IGMS-branded transactional email.
 *
 * Deliberately separate from `templates.ts`. Those emails belong to LaunchPad
 * and go to people who hold an account; these go to members of the public on
 * the IGMS marketing site who have never heard of LaunchPad. They share the
 * transport and nothing else — no shared layout, no shared escape helper, no
 * shared sender — so a change to the IGMS brand can never leak into a
 * LaunchPad email, or the reverse.
 *
 * Palette and its rules come from the IGMS site:
 *   marigold  #F5A623  accent only; never text on a light ground (1.9:1)
 *   terracotta #C84B1E headings and large text; not small body copy
 *   charcoal  #231F1B  all body copy, and the correct text on marigold (8.2:1)
 *   ivory     #FAF7F2  page ground
 *
 * Everything is inline-styled with table-safe CSS and web-safe fonts. Email
 * clients strip <style> blocks and will not load Fraunces or Inter, so Georgia
 * stands in for the display face.
 */

const IVORY = "#FAF7F2";
const CHARCOAL = "#231F1B";
const TERRACOTTA = "#C84B1E";
const MARIGOLD = "#F5A623";
const SAND = "#E4DACB";
const WARM_GREY = "#6F6459";

const DISPLAY_FONT = "Georgia,'Times New Roman',serif";
const BODY_FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const ORG_LEGAL_NAME = "Integrated Global Menospace Solutions CIC";
const ORG_REGISTERED_NO = "16227437";
const ORG_ADDRESS = "Office 11436, 182–184 High Street North, East Ham, London E6 2JA, United Kingdom";

/** User-supplied values are interpolated into HTML — escape them, always. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function brandHeader(): string {
  if (env.IGMS_LOGO_URL) {
    return `<img src="${escapeHtml(env.IGMS_LOGO_URL)}" alt="${escapeHtml(env.IGMS_EMAIL_FROM_NAME)}" width="132" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:132px;" />`;
  }
  // Text lockup fallback. Most clients block remote images by default, so this
  // is what a large share of recipients see regardless.
  return `<div style="font-family:${DISPLAY_FONT};font-size:26px;font-weight:bold;color:${TERRACOTTA};letter-spacing:0.5px;line-height:1;">IGMS</div>
      <div style="font-family:${BODY_FONT};font-size:9px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${WARM_GREY};padding-top:6px;">Integrated Global Menospace Solutions CIC</div>`;
}

function layout(heading: string, bodyHtml: string, footerNote: string): string {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:${IVORY};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:0 8px 22px;">${brandHeader()}</td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-radius:16px;padding:36px 32px;">
                <h1 style="margin:0 0 20px;font-family:${DISPLAY_FONT};font-size:24px;line-height:1.25;font-weight:bold;color:${TERRACOTTA};">${escapeHtml(heading)}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 8px 0;">
                <div style="height:3px;background:${MARIGOLD};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
                <p style="margin:16px 0 0;font-family:${BODY_FONT};font-size:12px;line-height:1.7;color:${WARM_GREY};">
                  ${footerNote}
                </p>
                <p style="margin:12px 0 0;font-family:${BODY_FONT};font-size:11px;line-height:1.7;color:${WARM_GREY};">
                  ${escapeHtml(ORG_LEGAL_NAME)} &middot; Registered No: ${escapeHtml(ORG_REGISTERED_NO)}<br />
                  ${escapeHtml(ORG_ADDRESS)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 18px;font-family:${BODY_FONT};font-size:15px;line-height:1.7;color:${CHARCOAL};">${html}</p>`;
}

/** Charcoal on marigold — the one pairing the brand allows for a filled panel. */
function referencePanel(reference: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
    <tr>
      <td style="background:${MARIGOLD};border-radius:12px;padding:16px 22px;">
        <div style="font-family:${BODY_FONT};font-size:10px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:${CHARCOAL};padding-bottom:6px;">Your reference</div>
        <div style="font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:bold;letter-spacing:1px;color:${CHARCOAL};">${escapeHtml(reference)}</div>
      </td>
    </tr>
  </table>`;
}

function programmeList(programmes: readonly string[]): string {
  const items = programmes
    .map(
      (name) =>
        `<li style="margin:0 0 8px;font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${CHARCOAL};">${escapeHtml(name)}</li>`
    )
    .join("");
  return `<ul style="margin:0 0 22px;padding:0 0 0 20px;">${items}</ul>`;
}

/** Label/value rows for the admin notification. */
function detailRows(rows: readonly { label: string; value: string }[]): string {
  const cells = rows
    .map(
      ({ label, value }) => `<tr>
        <td style="padding:10px 14px 10px 0;vertical-align:top;border-bottom:1px solid ${SAND};font-family:${BODY_FONT};font-size:11px;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;color:${WARM_GREY};white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:10px 0;vertical-align:top;border-bottom:1px solid ${SAND};font-family:${BODY_FONT};font-size:15px;line-height:1.6;color:${CHARCOAL};">${escapeHtml(value) || "&mdash;"}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">${cells}</table>`;
}

const igmsSender = () => ({
  name: env.IGMS_EMAIL_FROM_NAME,
  email: env.IGMS_EMAIL_FROM || env.EMAIL_FROM,
});

/** Display-ready view of one entry. Formatting belongs to the caller. */
export interface WaitlistEmailView {
  reference: string;
  fullName: string;
  firstName: string;
  email: string;
  phone: string;
  roleLabel: string;
  programmeNames: readonly string[];
  accessNeeds: string;
  submittedAt: string;
}

/** Sent to the person who joined. */
export function igmsWaitlistConfirmationEmail(entry: WaitlistEmailView): MailPayload {
  const accessNeedsBlock = entry.accessNeeds
    ? paragraph(
        `You told us about your access requirements, and we have them on file. We will work them out with you before anything starts — you will not have to explain them again from scratch.`
      )
    : "";

  return {
    to: entry.email,
    sender: igmsSender(),
    subject: `You're on the IGMS waitlist — ${entry.reference}`,
    html: layout(
      `You're on the list, ${entry.firstName}.`,
      `${paragraph(`Thank you for putting your name down. We have your interest recorded and we will contact you directly when the programme you chose opens — nothing else, and never a mailing list you did not ask for.`)}
       ${referencePanel(entry.reference)}
       <p style="margin:0 0 10px;font-family:${BODY_FONT};font-size:11px;font-weight:bold;letter-spacing:0.8px;text-transform:uppercase;color:${WARM_GREY};">What you asked about</p>
       ${programmeList(entry.programmeNames)}
       ${accessNeedsBlock}
       ${paragraph(`If anything changes, or you would like us to remove your details, reply to this email and quote your reference.`)}
       <p style="margin:0;">
         <a href="${escapeHtml(env.IGMS_SITE_URL)}" style="display:inline-block;background:${TERRACOTTA};color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:999px;font-family:${BODY_FONT};font-size:15px;font-weight:bold;">Back to the IGMS site</a>
       </p>`,
      `You received this because this address was entered on the IGMS waitlist at ${escapeHtml(env.IGMS_SITE_URL)}. If that was not you, reply and we will remove it.`
    ),
    text: [
      `You're on the list, ${entry.firstName}.`,
      ``,
      `Thank you for putting your name down. We have your interest recorded and will contact you directly when the programme you chose opens.`,
      ``,
      `Your reference: ${entry.reference}`,
      ``,
      `What you asked about:`,
      ...entry.programmeNames.map((name) => `  - ${name}`),
      ``,
      entry.accessNeeds
        ? `You told us about your access requirements and we have them on file. We will work them out with you before anything starts.\n`
        : ``,
      `If anything changes, or you would like us to remove your details, reply to this email and quote your reference.`,
      ``,
      env.IGMS_SITE_URL,
      ``,
      `${ORG_LEGAL_NAME} · Registered No: ${ORG_REGISTERED_NO}`,
      ORG_ADDRESS,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
  };
}

/**
 * Sent to the IGMS admin inbox on every signup, carrying the full waitlist as
 * a CSV attachment.
 *
 * Worth being conscious of: each of these emails contains every waitlister's
 * name, email, phone and access requirements — the last of which is very likely
 * special-category data. That is a lot of personal data to keep duplicating
 * into an inbox, so the mailbox receiving it should be access-controlled and
 * these messages should be cleared down on a schedule.
 */
export function igmsWaitlistAdminEmail(
  to: string,
  entry: WaitlistEmailView,
  csv: MailAttachment,
  totalEntries: number
): MailPayload {
  return {
    to,
    sender: igmsSender(),
    subject: `New IGMS waitlist signup — ${entry.fullName} (${entry.reference})`,
    html: layout(
      "New waitlist signup",
      `${detailRows([
        { label: "Name", value: entry.fullName },
        { label: "Email", value: entry.email },
        { label: "Phone", value: entry.phone },
        { label: "Joining as", value: entry.roleLabel },
        { label: "Programmes", value: entry.programmeNames.join(", ") },
        { label: "Access needs", value: entry.accessNeeds },
        { label: "Consented", value: entry.submittedAt },
        { label: "Reference", value: entry.reference },
      ])}
       ${paragraph(
         `The full waitlist is attached as <strong>${escapeHtml(csv.name)}</strong> — ${totalEntries} ${totalEntries === 1 ? "person" : "people"} in total, newest first.`
       )}
       <p style="margin:0;font-family:${BODY_FONT};font-size:13px;line-height:1.7;color:${WARM_GREY};">
         The attachment holds personal data, including any access requirements people have described. Keep it in this mailbox only, and delete these messages once the list has been actioned.
       </p>`,
      `Automated notification from the IGMS waitlist at ${escapeHtml(env.IGMS_SITE_URL)}.`
    ),
    text: [
      `New IGMS waitlist signup`,
      ``,
      `Name:         ${entry.fullName}`,
      `Email:        ${entry.email}`,
      `Phone:        ${entry.phone || "—"}`,
      `Joining as:   ${entry.roleLabel}`,
      `Programmes:   ${entry.programmeNames.join(", ")}`,
      `Access needs: ${entry.accessNeeds || "—"}`,
      `Consented:    ${entry.submittedAt}`,
      `Reference:    ${entry.reference}`,
      ``,
      `The full waitlist is attached as ${csv.name} — ${totalEntries} in total, newest first.`,
      `It holds personal data including access requirements. Keep it in this mailbox and clear these messages down once actioned.`,
    ].join("\n"),
    attachments: [csv],
  };
}
