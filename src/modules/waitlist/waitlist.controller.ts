import { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import * as waitlistService from "./waitlist.service";
import type { JoinWaitlistInput, listWaitlistQuerySchema } from "./waitlist.validation";
import type { z } from "zod";

export async function join(req: Request, res: Response) {
  const entry = await waitlistService.joinWaitlist(req.body as JoinWaitlistInput);
  sendSuccess(res, 201, "You're on the waitlist. Check your inbox for your reference.", entry);
}

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof listWaitlistQuerySchema>;
  const { entries, meta } = await waitlistService.listEntries(query);
  sendSuccess(res, 200, "Waitlist loaded.", { entries }, meta);
}

/**
 * Streams the full waitlist as a CSV download, so an admin can pull the
 * current list without waiting for the next signup email.
 */
export async function exportCsv(_req: Request, res: Response) {
  const { attachment } = await waitlistService.buildWaitlistCsv();

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${attachment.name}"`);
  // The file holds personal data — keep it out of every shared cache.
  res.setHeader("Cache-Control", "no-store");
  res.send(attachment.content);
}
