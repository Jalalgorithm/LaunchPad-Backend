import { Router } from "express";
import { RowDataPacket } from "mysql2";
import { z } from "zod";
import { pool } from "../../config/db";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validate } from "../../middleware/validate";
import { certificateLookupLimiter } from "../../middleware/rateLimiter";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/ApiResponse";
import { hashToken } from "../../utils/hash";

export const certificatesRouter = Router();

/** What the certificate says the holder completed. */
const PROGRAMME = "LaunchPad101 Pilot — Prerequisites";

const tokenParamSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "That certificate link isn't valid."),
});

interface LinkRow extends RowDataPacket {
  id: string;
  user_id: string;
  issued_at: Date;
  expires_at: Date;
  opened_at: Date | null;
  revoked_at: Date | null;
  lift_completed_at: Date | null;
}

/**
 * @openapi
 * /certificates/{token}:
 *   get:
 *     tags: [Certificates]
 *     summary: Resolve a certificate link
 *     description: >
 *       Public — the token is the credential. Returns only what gets printed on
 *       the certificate. It deliberately does **not** return the holder's name
 *       or email: the recipient types their own full name in the browser, and
 *       that name is never sent to or stored by this API. Anyone holding the
 *       link would otherwise learn who it belongs to.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The link is valid
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         programme: { type: string }
 *                         completedAt: { type: string, format: date-time }
 *                         issuedAt: { type: string, format: date-time }
 *       404: { description: Unknown, expired, or revoked link }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
certificatesRouter.get(
  "/:token",
  certificateLookupLimiter,
  validate({ params: tokenParamSchema }),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query<LinkRow[]>(
      `SELECT c.id, c.user_id, c.issued_at, c.expires_at, c.opened_at, c.revoked_at,
              ce.status_updated_at AS lift_completed_at
         FROM certificate_links c
         LEFT JOIN course_enrollments ce
           ON ce.user_id = c.user_id AND ce.course_key = 'lift' AND ce.status = 'completed'
        WHERE c.token_hash = ?
        LIMIT 1`,
      // validate({ params }) has already proved this is a single 64-char hex
      // string; Express 5 just types every param as `string | string[]`.
      [hashToken(String(req.params.token))]
    );

    const link = rows[0];

    // Unknown, revoked and expired all answer identically, so the response
    // can't be used to work out which tokens ever existed.
    const unusable =
      !link ||
      link.revoked_at !== null ||
      link.expires_at.getTime() <= Date.now();

    if (unusable) {
      throw ApiError.notFound(
        "This certificate link is no longer valid. Ask your programme lead for a new one."
      );
    }

    if (!link.opened_at) {
      await pool.query("UPDATE certificate_links SET opened_at = NOW() WHERE id = ?", [link.id]);
    }

    sendSuccess(res, 200, "Certificate ready.", {
      programme: PROGRAMME,
      // Falls back to the issue date when an admin issued a certificate before
      // the prerequisite flag was set.
      completedAt: (link.lift_completed_at ?? link.issued_at).toISOString(),
      issuedAt: link.issued_at.toISOString(),
    });
  })
);
