import pino from 'pino';
import { getRequestContext } from '../modules/core/middleware/requestContext.js';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  // Auto-inject per-request context (requestId, userId, barbershopId) into every log line.
  mixin() {
    return getRequestContext();
  },
  // Rigorous data masking — secrets/PII must never be written to logs.
  redact: {
    paths: [
      'password', '*.password', 'senha', '*.senha',
      'token', '*.token', 'accessToken', 'refreshToken', '*.accessToken', '*.refreshToken',
      'access_token', '*.access_token', 'refresh_token', '*.refresh_token',
      'authorization', '*.authorization',
      'req.headers.authorization', 'req.headers.cookie',
      'headers.authorization', 'headers.cookie',
      '*.headers.authorization', '*.headers.cookie',
      'err.config.headers.authorization', 'err.config.headers.Authorization',
      'apiKey', '*.apiKey', 'secret', '*.secret', 'clientSecret', '*.clientSecret',
      'providerHeaders', 'providerData.headers',
      'cpf', '*.cpf', 'cpfCnpj', '*.cpfCnpj',
      'cardNumber', '*.cardNumber', 'cvv', '*.cvv',
    ],
    censor: '[REDACTED]',
  },
  ...(isProduction
    ? {
        formatters: {
          level: (label: string) => ({ level: label }),
        },
      }
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
});

export default logger;
