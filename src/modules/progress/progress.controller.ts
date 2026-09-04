import { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import { CourseKey, Pathway } from "./courses";
import * as progressService from "./progress.service";

export async function myProgress(req: Request, res: Response) {
  const progress = await progressService.getMyProgress(req.user!.id);
  sendSuccess(res, 200, "Progress loaded.", progress);
}

export async function enroll(req: Request, res: Response) {
  const courseKey = req.params.courseKey as CourseKey;
  const course = await progressService.enrollInCourse(req.user!.id, courseKey);
  sendSuccess(res, 200, "You're enrolled.", { course });
}

export async function choosePathway(req: Request, res: Response) {
  const pathway = req.body.pathway as Pathway;
  const result = await progressService.choosePathway(req.user!.id, pathway);
  sendSuccess(res, 200, "Pathway chosen.", result);
}

export async function certificateStatus(req: Request, res: Response) {
  const status = await progressService.getCertificateStatus(req.user!.id);
  sendSuccess(res, 200, "Certificate status loaded.", status);
}

export async function issueMyCertificateLink(req: Request, res: Response) {
  const link = await progressService.issueMyCertificateLink(req.user!.id);
  sendSuccess(res, 201, "Certificate ready.", link);
}
