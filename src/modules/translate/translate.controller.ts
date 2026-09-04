import { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import { getMyTranslateProfiles, runTranslate } from "./translate.service";
import type { TranslateInput } from "./translate.types";

export async function myProfiles(req: Request, res: Response) {
  const profiles = await getMyTranslateProfiles(req.user!.id);
  sendSuccess(res, 200, "Translate profiles loaded.", profiles);
}

export async function translate(req: Request, res: Response) {
  const input = req.body as TranslateInput;
  const profile = await runTranslate(req.user!.id, input);
  sendSuccess(res, 200, "Translate complete.", profile);
}
