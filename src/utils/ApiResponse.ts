import { Response } from "express";

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
  meta?: PaginationMeta
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data: data ?? null,
    ...(meta ? { meta } : {}),
  });
}
