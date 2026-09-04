import { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import { getAvailableProviders } from "./ai.provider";
import { improveCv } from "./cv.service";
import { buddyReply } from "./chat.service";
import { renderCvDocx, renderCvPdf } from "./cv-export.service";
import type { AiProvider, ChatTurn } from "./ai.types";

export async function providers(_req: Request, res: Response) {
  sendSuccess(res, 200, "Providers loaded.", getAvailableProviders());
}

export async function cvAssist(req: Request, res: Response) {
  const { provider, ...input } = req.body as {
    provider: AiProvider;
    name: string;
    role: string;
    skills: string;
    exp: string;
    summary: string;
  };
  const result = await improveCv({ provider, ...input });
  sendSuccess(res, 200, "CV improved.", result);
}

export async function chat(req: Request, res: Response) {
  const { provider, messages } = req.body as { provider: AiProvider; messages: ChatTurn[] };
  const reply = await buddyReply(provider, messages);
  sendSuccess(res, 200, "Reply ready.", { reply });
}

export async function exportCv(req: Request, res: Response) {
  const { format, ...cv } = req.body as {
    format: "pdf" | "docx";
    name: string;
    role: string;
    email: string;
    phone: string;
    location: string;
    skills: string;
    exp: string;
    summary: string;
  };

  const filename = (cv.name.trim() || "cv").replace(/\s+/g, "_");

  if (format === "pdf") {
    const buffer = await renderCvPdf(cv);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}_CV.pdf"`);
    res.send(buffer);
    return;
  }

  const buffer = await renderCvDocx(cv);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}_CV.docx"`);
  res.send(buffer);
}
