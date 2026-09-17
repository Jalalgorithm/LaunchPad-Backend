import { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import * as draftsService from "./drafts.service";
import type { CvVariant, SaveCvDraftInput, SaveSchoolPassportInput } from "./drafts.types";

export async function myCvDrafts(req: Request, res: Response) {
  const drafts = await draftsService.getMyCvDrafts(req.user!.id);
  sendSuccess(res, 200, "CV drafts loaded.", drafts);
}

export async function saveCvDraft(req: Request, res: Response) {
  const variant = req.params.variant as CvVariant;
  const input = req.body as SaveCvDraftInput;
  const draft = await draftsService.saveCvDraft(req.user!.id, variant, input);
  sendSuccess(res, 200, "CV draft saved.", draft);
}

export async function mySchoolPassport(req: Request, res: Response) {
  const passport = await draftsService.getMySchoolPassport(req.user!.id);
  sendSuccess(res, 200, "Strengths Passport loaded.", passport);
}

export async function saveSchoolPassport(req: Request, res: Response) {
  const input = req.body as SaveSchoolPassportInput;
  const passport = await draftsService.saveMySchoolPassport(req.user!.id, input);
  sendSuccess(res, 200, "Strengths Passport saved.", passport);
}
