import type { Response } from 'express';

export interface PaginationMeta {
  total?: number;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export const sendSuccess = (
  res: Response,
  data: unknown,
  statusCode = 200,
  meta: PaginationMeta | null = null,
  message: string | null = null
): Response => {
  const body: Record<string, unknown> = { success: true, data };
  if (message) body['message'] = message;
  if (meta) body['meta'] = meta;
  return res.status(statusCode).json(body);
};

export const sendCreated = (res: Response, data: unknown, message: string | null = null): Response =>
  sendSuccess(res, data, 201, null, message);

export const sendNoContent = (res: Response): void => {
  res.status(204).end();
};

export const sendPaginated = (res: Response, data: unknown, meta: PaginationMeta): Response =>
  sendSuccess(res, data, 200, meta);

export const sendError = (
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details: unknown = null
): Response => {
  const body: Record<string, unknown> = {
    success: false,
    message,
    error: { code, message },
  };
  if (details) (body['error'] as Record<string, unknown>)['details'] = details;
  return res.status(statusCode).json(body);
};
