import { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import * as easyAskService from "./easyask.service";
import type { ShortNoteInput } from "./easyask.validation";

export async function shortNote(req: Request, res: Response) {
  const note = await easyAskService.generateShortNote(req.body as ShortNoteInput);
  sendSuccess(res, 200, "Your Short Note is ready.", note);
}
