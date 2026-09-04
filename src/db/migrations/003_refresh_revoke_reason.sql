-- Why a refresh token was revoked.
--
-- Rotation grants a short grace window, so two tabs racing on the same cookie
-- don't destroy each other's session. That grace must never apply to a token
-- revoked deliberately — after a sign-out, a password reset, or detected reuse,
-- presenting the token again would otherwise resurrect the very session that
-- was just killed.
ALTER TABLE refresh_tokens
  ADD COLUMN revoked_reason ENUM('rotation','reuse','signout') NULL AFTER revoked_at;

-- Existing revoked rows predate the grace window; treat them as deliberate so
-- none of them can be replayed.
UPDATE refresh_tokens SET revoked_reason = 'signout' WHERE revoked_at IS NOT NULL;
