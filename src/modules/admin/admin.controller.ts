import { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import { CourseKey, Pathway } from "../progress/courses";
import * as adminService from "./admin.service";

/**
 * Express 5 types route params as `string | string[]`. Every route here runs
 * validate({ params }) first, which has already proved these are single UUID
 * strings — this just narrows the type without repeating that check.
 */
function param(req: Request, name: string): string {
  return String(req.params[name]);
}

export async function listUsers(req: Request, res: Response) {
  const query = req.validatedQuery as { page: number; limit: number; search?: string };
  const { users, meta } = await adminService.listUsers(query);
  sendSuccess(res, 200, "Users loaded.", { users }, meta);
}

export async function setCourseStatus(req: Request, res: Response) {
  const courseKey = req.params.courseKey as CourseKey;
  const course = await adminService.setCourseStatus(
    param(req, "userId"),
    courseKey,
    req.body.status,
    req.user!.id
  );
  sendSuccess(res, 200, "Course status updated.", { course });
}

export async function clearCourseStatus(req: Request, res: Response) {
  const courseKey = req.params.courseKey as CourseKey;
  await adminService.clearCourseStatus(param(req, "userId"), courseKey);
  sendSuccess(res, 200, "Enrollment cleared.");
}

export async function unlockPathway(req: Request, res: Response) {
  const unlockedPathways = await adminService.unlockPathway(
    param(req, "userId"),
    req.body.pathway,
    req.user!.id
  );
  sendSuccess(res, 200, "Pathway unlocked.", { unlockedPathways });
}

export async function revokePathwayUnlock(req: Request, res: Response) {
  const pathway = req.params.pathway as Pathway;
  await adminService.revokePathwayUnlock(param(req, "userId"), pathway);
  sendSuccess(res, 200, "Pathway unlock revoked.");
}

export async function issueCertificateLink(req: Request, res: Response) {
  const link = await adminService.issueCertificateLink(param(req, "userId"), req.user!.id);
  sendSuccess(
    res,
    201,
    link.emailed
      ? "Certificate link created and emailed to them."
      : "Certificate link created, but the email couldn't be sent — share the link directly.",
    { link }
  );
}

export async function listCertificateLinks(req: Request, res: Response) {
  const links = await adminService.listCertificateLinks(param(req, "userId"));
  sendSuccess(res, 200, "Certificate links loaded.", { links });
}

export async function revokeCertificateLink(req: Request, res: Response) {
  await adminService.revokeCertificateLink(param(req, "linkId"));
  sendSuccess(res, 200, "That link no longer works.");
}
