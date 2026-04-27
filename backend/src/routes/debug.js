import express from 'express';
import {
  asaasClient,
  getAsaasApiKeyDiagnostics,
} from '../integrations/asaas/client.js';

const router = express.Router();

const extractProviderErrors = (error) => {
  const candidates = [
    error?.response?.data?.errors,
    error?.details?.payload?.errors,
    error?.providerData?.errors,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

const resolveProviderStatus = (error) =>
  error?.providerStatus ||
  error?.response?.status ||
  error?.details?.statusCode ||
  error?.statusCode ||
  null;

const isInvalidAccessToken = (error, errors = []) =>
  String(error?.code || '').toUpperCase() === 'ASAAS_INVALID_ACCESS_TOKEN' ||
  errors.some((item) => String(item?.code || '').toLowerCase() === 'invalid_access_token');

const ensureDebugEnabled = (req, res, next) => {
  if (process.env.ENABLE_DEBUG_ROUTES !== 'true') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Rota ${req.method} ${req.path} não encontrada`,
      },
    });
  }

  const debugToken = process.env.DEBUG_TOKEN;
  if (!debugToken) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Rota ${req.method} ${req.path} não encontrada`,
      },
    });
  }

  if (req.get('x-debug-token') !== debugToken) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Token de diagnóstico inválido',
      },
    });
  }

  return next();
};

// Rota temporária de diagnóstico. Remover após resolver integração Asaas.
router.get('/asaas-auth', ensureDebugEnabled, async (_req, res) => {
  const diagnostics = getAsaasApiKeyDiagnostics();
  const baseUrl = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';
  const testBase = {
    method: 'GET',
    path: '/customers',
    query: { limit: 1 },
  };

  try {
    await asaasClient.get('/customers', { query: { limit: 1 } });

    return res.status(200).json({
      success: true,
      message: 'Autenticação Asaas OK',
      diagnostics,
      baseUrl,
      test: {
        ...testBase,
        ok: true,
        statusCode: 200,
        code: null,
        message: 'Autenticação Asaas OK',
        errors: [],
      },
    });
  } catch (error) {
    const errors = extractProviderErrors(error);
    const providerStatus = resolveProviderStatus(error);

    if (isInvalidAccessToken(error, errors)) {
      return res.status(503).json({
        success: false,
        code: 'ASAAS_INVALID_ACCESS_TOKEN',
        message: 'A chave ASAAS_API_KEY não foi aceita pelo Asaas.',
        errors,
        diagnostics,
        baseUrl,
        test: {
          ...testBase,
          ok: false,
          statusCode: providerStatus,
          code: 'ASAAS_INVALID_ACCESS_TOKEN',
          message: 'A chave ASAAS_API_KEY não foi aceita pelo Asaas.',
          errors,
        },
      });
    }

    return res.status(502).json({
      success: false,
      code: error?.code || 'ASAAS_DEBUG_AUTH_ERROR',
      message: error?.message || 'Falha ao testar autenticação Asaas.',
      providerStatus,
      errors,
      diagnostics,
      baseUrl,
      test: {
        ...testBase,
        ok: false,
        statusCode: providerStatus,
        code: error?.code || 'ASAAS_DEBUG_AUTH_ERROR',
        message: error?.message || 'Falha ao testar autenticação Asaas.',
        errors,
      },
    });
  }
});

export default router;
