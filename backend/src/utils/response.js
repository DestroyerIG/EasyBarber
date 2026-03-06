/**
 * Helpers para padronizar respostas da API.
 *
 * Sucesso: { success: true, data, message?, meta? }
 * Erro:    { success: false, message, error: { code, message, details? } }
 */

export const sendSuccess = (res, data, statusCode = 200, meta = null, message = null) => {
  const body = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

export const sendCreated = (res, data, message = null) => sendSuccess(res, data, 201, null, message);

export const sendNoContent = (res) => res.status(204).end();

export const sendPaginated = (res, data, meta) => sendSuccess(res, data, 200, meta);

export const sendError = (res, statusCode, code, message, details = null) => {
  const body = {
    success: false,
    message,
    error: { code, message },
  };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
};
