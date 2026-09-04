import { env } from "../config/env";
import type { MailPayload } from "../config/mailer";

/** User-supplied values are interpolated into HTML — escape them, always. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1d21;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <p style="margin:0 0 24px;font-size:18px;font-weight:600;">${escapeHtml(env.EMAIL_FROM_NAME)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;">${escapeHtml(heading)}</h1>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e6e8eb;margin:28px 0 16px;" />
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
        You received this email because someone entered this address on ${escapeHtml(env.EMAIL_FROM_NAME)}.
        If that wasn't you, no action is needed — you can safely ignore this message.
      </p>
    </div>
  </body>
</html>`;
}

function codeBlock(code: string): string {
  return `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">Enter this code to continue:</p>
   <p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace;">${escapeHtml(code)}</p>
   <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">
     The code expires in 10 minutes and can only be used once. Never share it with anyone —
     ${escapeHtml(env.EMAIL_FROM_NAME)} will never ask you for it.
   </p>`;
}

export function signupCodeEmail(to: string, code: string): MailPayload {
  return {
    to,
    subject: `${code} is your ${env.EMAIL_FROM_NAME} verification code`,
    html: layout(
      "Let's confirm your email address",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Welcome! You're one step away from creating your ${escapeHtml(env.EMAIL_FROM_NAME)} account.</p>${codeBlock(code)}`
    ),
    text: `Welcome to ${env.EMAIL_FROM_NAME}. Your verification code is ${code}. It expires in 10 minutes. Never share this code with anyone.`,
  };
}

export function loginCodeEmail(to: string, code: string): MailPayload {
  return {
    to,
    subject: `${code} is your ${env.EMAIL_FROM_NAME} sign-in code`,
    html: layout(
      "Your sign-in code",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Use the code below to sign in to your account.</p>${codeBlock(code)}`
    ),
    text: `Your ${env.EMAIL_FROM_NAME} sign-in code is ${code}. It expires in 10 minutes. Never share this code with anyone.`,
  };
}

export function passwordResetCodeEmail(to: string, code: string): MailPayload {
  return {
    to,
    subject: `${code} is your ${env.EMAIL_FROM_NAME} password reset code`,
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">We received a request to reset your password.</p>${codeBlock(code)}`
    ),
    text: `Your ${env.EMAIL_FROM_NAME} password reset code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
  };
}

/**
 * Sent when someone starts signup with an address that already has an account.
 * The API response is identical either way, so this email is what actually
 * helps the real owner — and it tells them if someone else tried.
 */
export function accountExistsEmail(to: string): MailPayload {
  const signInUrl = `${env.FRONTEND_URL}/login`;
  return {
    to,
    subject: `You already have a ${env.EMAIL_FROM_NAME} account`,
    html: layout(
      "You already have an account",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
         Someone just tried to sign up with this email address, but it's already registered.
         You can sign in with your password, or request a one-time code instead.
       </p>
       <p style="margin:0 0 20px;">
         <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#1a1d21;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">Sign in</a>
       </p>
       <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">
         Forgotten your password? Use "Forgot password" on the sign-in page.
       </p>`
    ),
    text: `Someone tried to sign up with this email, but it already has a ${env.EMAIL_FROM_NAME} account. Sign in at ${signInUrl}, or use "Forgot password" if you need to reset it.`,
  };
}

export function welcomeEmail(to: string, name: string): MailPayload {
  return {
    to,
    subject: `Welcome to ${env.EMAIL_FROM_NAME}`,
    html: layout(
      `Welcome, ${name}`,
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
         Your account is ready. You can sign in any time with your password, or with a one-time code sent to this address.
       </p>
       <p style="margin:0;">
         <a href="${escapeHtml(env.FRONTEND_URL)}" style="display:inline-block;background:#1a1d21;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">Open ${escapeHtml(env.EMAIL_FROM_NAME)}</a>
       </p>`
    ),
    text: `Welcome to ${env.EMAIL_FROM_NAME}, ${name}. Your account is ready: ${env.FRONTEND_URL}`,
  };
}

export function certificateLinkEmail(to: string, url: string, expiresAt: Date): MailPayload {
  const expiry = expiresAt.toISOString().slice(0, 10);
  return {
    to,
    subject: `Your ${env.EMAIL_FROM_NAME} certificate is ready`,
    html: layout(
      "Your certificate is ready",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
         Congratulations on completing your prerequisites. Open the link below to
         view and print your certificate — you'll be asked to type your full name
         exactly as you'd like it to appear on it.
       </p>
       <p style="margin:0 0 20px;">
         <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1d21;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">View my certificate</a>
       </p>
       <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">
         This link is personal to you and stops working after ${escapeHtml(expiry)}.
       </p>`
    ),
    text: `Your ${env.EMAIL_FROM_NAME} certificate is ready. Open ${url} to view and print it — you'll be asked to type your full name as it should appear. The link stops working after ${expiry}.`,
  };
}

/** Security notification — the user's cue that something happened without them. */
export function passwordChangedEmail(to: string): MailPayload {
  return {
    to,
    subject: `Your ${env.EMAIL_FROM_NAME} password was changed`,
    html: layout(
      "Your password was changed",
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
         Your password has just been changed and you've been signed out everywhere else.
       </p>
       <p style="margin:0;font-size:14px;color:#4b5563;line-height:1.6;">
         If this wasn't you, reset your password immediately using "Forgot password" on the sign-in page.
       </p>`
    ),
    text: `Your ${env.EMAIL_FROM_NAME} password was changed and all other sessions were signed out. If this wasn't you, reset your password immediately at ${env.FRONTEND_URL}/forgot-password`,
  };
}
