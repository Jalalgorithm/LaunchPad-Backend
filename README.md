# LaunchPad Backend

Express 5 + TypeScript + MySQL API for [LaunchPad](../LaunchPad). Structured to match
the `mcan-backend` layout: thin controllers, all logic in services, zod at the edge.

Currently implements **authentication only**. Everything else comes later.

---

## Getting started

```bash
npm install
cp .env.example .env      # then fill it in — see below
npm run db:migrate
npm run dev               # http://localhost:4000
```

- API base: `http://localhost:4000/api`
- Swagger UI: `http://localhost:4000/api-docs`
- Health check: `http://localhost:4000/health`

### Environment

Every variable is validated by zod at boot (`src/config/env.ts`); a bad or missing
value stops the process rather than failing later at runtime.

The three JWT secrets must each be at least 32 characters and must differ from one
another. Generate them with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Leave `BREVO_API_KEY` blank in development and one-time codes are written to the
server log instead of being emailed. Production refuses to start without it.

---

## Authentication

### Signing up — three steps, no half-built accounts

```
POST /api/auth/signup/start      { email }
      → emails a 6-digit code. No user row is created yet.

POST /api/auth/signup/verify     { email, code }
      → { registrationToken }   single-use, 15 minutes

POST /api/auth/signup/complete   { registrationToken, name, dateOfBirth?,
                                   password, confirmPassword, acceptTerms }
      → account created and signed in
```

Deferring the insert until step 3 means an unverified address never becomes a row,
so the users table can't be filled with junk and there's no partial record to leak.

### Signing in

| Route | Body |
| --- | --- |
| `POST /api/auth/login` | `{ email, password }` |
| `POST /api/auth/login/code/request` | `{ email }` |
| `POST /api/auth/login/code/verify` | `{ email, code }` |

### Forgotten password

```
POST /api/auth/password/forgot   { email }         → emails a code
POST /api/auth/password/verify   { email, code }   → { resetToken }
POST /api/auth/password/reset    { resetToken, newPassword, confirmPassword }
```

Resetting revokes every session and emails a security notice.

### Session

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/refresh` | refresh cookie | Rotate the cookie, get a new access token |
| `POST /api/auth/logout` | refresh cookie | Sign out of this device |
| `POST /api/auth/logout-all` | bearer | Sign out everywhere |
| `GET /api/auth/me` | bearer | Current profile |
| `PATCH /api/auth/password/change` | bearer | Change password while signed in |

---

## Admin

Users have a `role` of `user` or `admin`. The first admin is created on boot from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, but **only while no admin exists** —
once one does, the seed is skipped entirely, so changing those values later can't
reset a live admin's password. If the address already has an ordinary account it
is promoted rather than recreated. `npm run db:seed` runs the same thing manually.

Every route below sits behind `roleGuard("admin")`, applied to the whole router so
a new endpoint is protected by default:

| Route | Purpose |
| --- | --- |
| `GET /api/admin/users` | Paginated, searchable list with prerequisite status |
| `PATCH /api/admin/users/:userId/prerequisites` | Mark/unmark Lift and STEM |
| `POST /api/admin/users/:userId/certificate-links` | Mint a link and email it |
| `GET /api/admin/users/:userId/certificate-links` | List links (never their tokens) |
| `DELETE /api/admin/certificate-links/:linkId` | Revoke a link |

`GET /api/me/progress` gives a user their own status. There is deliberately no
endpoint for a user to mark their own prerequisites — a certificate is issued off
the back of them, so completion is recorded by an admin, and `user_progress`
stores which admin set each flag.

## Certificates

An admin generates a link; the backend emails it to the recipient and returns the
URL once to the admin. Only the token's hash is stored, so it can't be recovered
afterwards — generate a new one instead. Links expire after 30 days and can be
revoked.

`GET /api/certificates/:token` is public — the token is the credential. It returns
the programme and completion date and nothing else: **not** the holder's name or
email, so a leaked link doesn't reveal whose it is.

The name printed on the certificate is typed by the recipient in the browser and
**never sent to this API**. There is no column for it and no request carries it;
it lives in React state and is gone on reload. That's verified two ways in the
live test — every outbound request body is scanned for it, and every text column
in the database is scanned for it.

## IGMS waitlist

A public waitlist for the IGMS marketing site (menospace.uk). It is the only
unauthenticated write endpoint in this API.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/waitlist` | public | Join the waitlist |
| `GET /api/waitlist` | admin | Paginated list, searchable by name/email/reference |
| `GET /api/waitlist/export.csv` | admin | The full list as a CSV download |

Waitlisters are **not** LaunchPad users. They live in `igms_waitlist_entries`
with no account, no password and no session, so the auth model, the admin user
list and every existing query are untouched. Programme choices sit in
`igms_waitlist_programmes`, mirroring `pathway_unlocks`.

On a successful join, two emails go out:

1. **To the joiner** — confirmation carrying their reference and the programmes
   they picked.
2. **To `IGMS_ADMIN_EMAIL`** — their full details, with the entire waitlist
   attached as a CSV.

Both are **IGMS-branded and live in `emails/igms.templates.ts`**, which shares
nothing with `emails/templates.ts` — no layout, no escape helper, no sender.
LaunchPad emails are unchanged and cannot be affected by an IGMS brand change,
or the reverse. The IGMS sender name and address are their own env vars.

Email failures never fail the request. The entry is already committed by then,
and a Brevo outage must not show a member of the public an error for something
that actually worked.

The CSV is generated in `waitlist.csv.ts`, which does two things worth knowing:
it prepends a UTF-8 BOM so Excel on Windows reads accented names correctly, and
it prefixes any field starting `=`, `+`, `-`, `@`, tab or CR with an apostrophe.
That second one matters — without it, `=HYPERLINK(...)` typed into the name box
on a public form becomes a live formula in the admin's spreadsheet. Quoting
alone does not stop that.

`POST` is rate limited to 5 per hour keyed on the submitted email, falling back
to IP. Without it the endpoint is a way to send IGMS-branded mail to any inbox.

## EasyAsk

The public self-advocacy writing aid on the IGMS site. Someone answers two
questions — what is making things hard, and what would help — and gets back a
short, calm note they can hand to an employer, a clinician, a school or a
transport operator.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/easyask/short-note` | public | Turn two answers into a three-sentence note |

**It stores nothing.** No table, no insert, no logging of what anyone types.
That is deliberate: "nothing you say is saved" is printed on the tool's first
screen, and the answers routinely describe a disability or a health need, which
would make any stored copy special-category data under UK GDPR Art. 9. There is
no read side to the module because there is nothing to read.

The prompt in `easyask.prompts.ts` is strict about three things, and they are
the whole reason the feature works: never invent a detail the person did not
give (they may be held to this note in a meeting), never apologise on their
behalf, and keep their own wording where it already reads clearly.

The response carries a `concern` flag, set only when the answers describe risk
of harm rather than an access need. The note is still returned; the flag tells
the client to show support signposting alongside it.

Rate limited to 12 per 15 minutes by IP. It is the only endpoint here that is
both public and backed by a paid AI call, and there is no email in the body to
key on — asking for one would break the "no account" promise the tool depends on.

## Response shape

Success:

```json
{ "success": true, "message": "You're signed in.", "data": { "accessToken": "…", "user": { … } } }
```

Failure:

```json
{
  "success": false,
  "message": "That email or password didn't match. Please try again.",
  "error": { "code": "UNAUTHORIZED", "details": null }
}
```

`details` is only ever populated for validation errors, as
`[{ field, message }]`. `message` is always safe to show the user directly.

---

## Security notes

**Errors never expose internals.** Only `ApiError` messages reach a client. Anything
else — a driver error, a bug, a dropped connection — is logged in full server-side and
answered with one fixed sentence and no stack trace, SQL fragment, or file path.

**Account enumeration is closed off.** Requesting a code returns the same message and
status whether or not the address is registered; an existing address gets a "you
already have an account" email rather than a code. Wrong password and unknown email
return identical text, and the unknown-email path runs a dummy bcrypt comparison so
the two take comparable time. Rate limits trip identically either way.

**One-time codes.** Six digits from `crypto.randomInt`. Stored as
SHA-256 of *(email, purpose, code, server-side pepper)* — the pepper lives in the
environment, not the database, which is what stops a database dump from being
brute-forced back into valid codes in seconds. 10-minute expiry, five attempts per
code, counted inside a `SELECT … FOR UPDATE` transaction so parallel guesses can't
race the counter. Issuing a new code invalidates the previous one. Comparison is
constant-time.

**Step tokens are genuinely single-use.** The token from `signup/verify` or
`password/verify` carries the id of the code row it came from, and redeeming it flips
a one-shot flag on that row. A JWT is otherwise replayable until it expires; this
closes that.

**Refresh tokens rotate, with reuse detection.** Each sign-in starts a token family.
Every refresh revokes the presented token and issues a successor. Presenting a token
that was *already* rotated is the fingerprint of a stolen one, so the whole family is
revoked — the attacker is locked out and the real user just signs in again.

There is a 10-second grace window on that rule, because two browser tabs booting
together legitimately send the same cookie and shouldn't sign each other out. The
grace applies **only** to tokens revoked by rotation (`revoked_reason`): one revoked
by a sign-out, a password reset, or an earlier reuse detection stays dead, or
replaying it inside the window would undo the revocation that just happened.

**Times are compared in UTC.** Every connection runs `SET time_zone = '+00:00'`.
The driver parses DATETIMEs as UTC, but the server evaluates `NOW()` in its own
zone — on a host that isn't UTC the two silently disagree by the host's offset,
which is enough to break the reuse window above.

**Password brute force.** Per-email rate limits (8 sign-in attempts / 15 min, so a
botnet spreading across IPs gains nothing) plus a 15-minute database lockout after 5
failures. A locked account returns the ordinary "didn't match" message. Because that
lockout is also a way to lock someone else out on purpose, the email-code sign-in
stays available throughout and clears the lock on success.

**Passwords.** bcrypt cost 12. Minimum 10 characters, at least one letter and one
number, capped at 72 because bcrypt silently ignores anything beyond that.

**Tokens.** Access token (15 min) in the response body for the client to hold in
memory. Refresh token (30 days) in an `httpOnly`, `SameSite`, `Secure`-in-production
cookie scoped to `/api/auth`, so no script on the page can read it.

**Also:** helmet, CORS allowlist, `x-powered-by` off, 100 kB body cap, `multipleStatements`
disabled on the pool, parameterised queries throughout, and pino redaction of
authorization headers, cookies, passwords, codes, and email addresses.

---

## GDPR

An account is an email, a display name, an optional date of birth, and a password
hash. Nothing is collected that no feature reads.

- **Date of birth is optional** and only for age-dependent pathways. Minimum age 13.
- **Consent is recorded** — `acceptTerms` is required at signup and stored as
  `terms_accepted_at`.
- **Codes are transient.** Expired `email_otps` rows are purged daily.
- **Logs hold no personal data**; email addresses are redacted before they're written.

Still to build when you need them: `GET /api/auth/export` (right of access) and
`DELETE /api/auth/account` (erasure).

### IGMS waitlist data

Held on a different basis and worth treating separately. `consented_at` records
when the box was ticked, because consent has to be evidenced rather than assumed.

`access_needs` is free text in which people describe disabilities and health
needs, which makes it **special-category data under UK GDPR Art. 9**. Two
consequences follow. Every admin notification email carries a CSV containing
that column for every person on the list, so the receiving mailbox needs
restricted access and a routine clear-down. And there is no erasure route yet —
build one, or delete by reference on request, before this runs at any volume.

---

## The frontend

[LaunchPad](../LaunchPad) is wired up against this API — the mock auth service is
gone. Run both together:

```bash
# this repo
npm run dev          # :4000

# ../LaunchPad
npm run dev          # :5173
```

`VITE_API_URL=http://localhost:4000/api`. CORS allows `FRONTEND_URL` with
credentials, and because both sides are on `localhost` they're same-site, so the
`SameSite=Strict` refresh cookie is sent across the two ports in development.

How the pieces line up:

| Frontend | Behaviour |
| --- | --- |
| `lib/apiClient.ts` | Holds the access token **in memory**, unwraps the envelope, and on a 401 with `error.code === "TOKEN_EXPIRED"` refreshes once and replays the request. Concurrent 401s share one refresh. |
| `providers/AuthProvider.tsx` | Boots by calling `/auth/refresh` — the httpOnly cookie is the only thing that survives a reload. |
| `features/auth/components/RegisterForm.tsx` | Three steps: email → code → name / date of birth / password. |
| `features/auth/components/LoginForm.tsx` | Password sign-in, or "email me a code". |
| `features/auth/components/ForgotPasswordForm.tsx` | Three steps at `/forgot-password`. |
| `features/auth/components/CodeStep.tsx` | The shared 6-digit code screen used by all three flows. |

422 responses carry `details: [{ field, message }]`, and the forms render those
against the matching input, so the field names in `auth.validation.ts` are part of
the contract — renaming one moves an error message off its field.

---

## Layout

```
src/
  app.ts                  Express app: middleware, CORS, routers
  server.ts               Boot, DB ping, graceful shutdown, daily code purge
  config/                 env, db pool, logger, Brevo mailer, swagger
  db/                     migrate.ts + migrations/*.sql
  emails/templates.ts     LaunchPad transactional email bodies
  emails/igms.templates.ts  IGMS waitlist emails — separate brand, shared transport
  middleware/             asyncHandler, authGuard, errorHandler, rateLimiter, validate
  modules/auth/           routes → controller → service (+ otp.service, token.service)
  modules/waitlist/       IGMS waitlist (+ catalogue, csv builder)
  modules/easyask/        EasyAsk short notes — public, stateless, AI-written
  utils/                  ApiError, ApiResponse, hash
```

Migrations are plain SQL applied in filename order and recorded in
`schema_migrations`; `npm run db:migrate` is idempotent.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch mode via tsx |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Types only, no emit |
| `npm run db:migrate` | Apply pending migrations |

---

## Deploy (Render)

`render.yaml` is a Render Blueprint — same shape as `mcan-backend`'s, from when that
was deployed there before moving to cPanel/FTP hosting. It defines a single Node web
service (`buildCommand: npm install && npm run build`, `startCommand: npm start`,
`healthCheckPath: /health`) and lists every variable `src/config/env.ts` validates.
Secrets and anything per-environment are `sync: false` — the Blueprint declares the
*key*, never the value; you fill each one in from Render's dashboard after the first
deploy, and it's never committed.

1. **Push this repo to GitHub** (or GitLab/Bitbucket) — Render deploys from a
   connected repo, there's no "upload a zip" path for a native Node service.
2. In Render: **New → Blueprint**, point it at the repo. It reads `render.yaml` and
   creates the `launchpad-backend` web service automatically.
3. **Provision a MySQL database for LaunchPad** — Render has no built-in MySQL (only
   Postgres), so use an external host (Clever Cloud's free tier is what
   `mcan-backend` used for this same reason). **Use a database of its own** — don't
   point this at another project's instance; `db:migrate` writes to a table literally
   named `schema_migrations`, and two unrelated apps' migrations sharing one would
   collide.
4. In the service's **Environment** tab, fill in every field the Blueprint left
   blank:
   - `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` — from step 3.
   - `FRONTEND_URL` — the deployed LaunchPad frontend's URL.
   - `IGMS_SITE_URL` — the deployed IGMS (menospace.uk) frontend's URL. Both this and
     `FRONTEND_URL` are allow-listed for CORS (see `allowedOrigins` in `src/app.ts`);
     anything beyond those two goes in `CORS_EXTRA_ORIGINS`, comma-separated.
   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — the first admin account.
   - `BREVO_API_KEY` / `EMAIL_FROM` — required in production; boot refuses to start
     without a key (see `env.ts`).
   - `OPENAI_API_KEY` / `GEMINI_API_KEY` — optional; leave either blank to disable
     that provider in the AI features' toggle.
   - `IGMS_EMAIL_FROM` / `IGMS_ADMIN_EMAIL` / `IGMS_LOGO_URL` — optional, see the
     comments already on these in `.env.example`.
   - `COOKIE_DOMAIN` — leave blank unless the frontend and API share a registrable
     domain and need the refresh cookie shared across subdomains.

   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_STEP_SECRET`, and `OTP_PEPPER` are
   `generateValue: true` — Render mints strong random values for these itself, no
   input needed. `COOKIE_SAMESITE` is preset to `none`, since the frontend and API
   sit on different registrable domains here — that needs HTTPS on both, which Render
   provides by default.
5. **Run migrations once** against the new database, from Render's shell (or any
   machine with the same `DB_*` values in its environment):
   ```bash
   npm run db:migrate
   ```
6. Redeploy (or it'll happen automatically on the next push) and confirm
   `https://<service>.onrender.com/health` returns `{"success":true,"message":"OK"}`.
