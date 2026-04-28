import express from 'express';
import {
  asaasClient,
  getAsaasApiKeyDiagnostics,
  rawAsaasRequest,
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

const pickRelevantHeaders = (headers = {}) => {
  const relevant = [
    'content-type',
    'x-cache',
    'x-amz-cf-id',
    'x-amz-cf-pop',
    'x-request-id',
    'cf-cache-status',
    'server',
    'date',
  ];
  const normalizedEntries = Object.entries(headers).map(([key, value]) => [
    String(key).toLowerCase(),
    value,
  ]);

  return Object.fromEntries(
    normalizedEntries.filter(([key]) => relevant.includes(key))
  );
};

const maskCpfCnpj = (value) => {
  const digits = String(value || '').replace(/\D+/g, '');
  if (digits.length <= 4) {
    return '***';
  }

  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
};

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

// Rota temporária de diagnóstico. Remover após resolver POST /customers no Asaas.
router.get('/asaas/customer-test', ensureDebugEnabled, async (_req, res) => {
  const payload = {
    name: 'Cliente Teste EasyBarber',
    cpfCnpj: '70596090404',
    mobilePhone: '83996311811',
  };

  try {
    const result = await rawAsaasRequest('POST', '/customers', { body: payload });
    const empty400 = result.status === 400 && result.bodyRaw === '';

    return res.status(200).json({
      success: result.ok,
      provider: 'asaas',
      method: 'POST',
      path: '/customers',
      status: result.status,
      headers: pickRelevantHeaders(result.headers),
      bodyRaw: result.bodyRaw,
      bodyJson: result.bodyJson,
      payload: {
        ...payload,
        cpfCnpj: maskCpfCnpj(payload.cpfCnpj),
      },
      conclusion: empty400
        ? 'Teste mínimo falhou com 400 vazio: provável bloqueio externo/Asaas/CloudFront/conta/API.'
        : result.ok
          ? 'Teste mínimo funcionou: compare com o payload real do checkout.'
          : 'Teste mínimo falhou com body: veja status, headers e body retornados pelo Asaas.',
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      provider: 'asaas',
      method: 'POST',
      path: '/customers',
      status: null,
      headers: {},
      bodyRaw: '',
      bodyJson: null,
      payload: {
        ...payload,
        cpfCnpj: maskCpfCnpj(payload.cpfCnpj),
      },
      conclusion: 'Falha de comunicação antes de receber resposta do Asaas.',
      error: {
        code: error?.code || 'ASAAS_DEBUG_CUSTOMER_TEST_ERROR',
        message: error?.message || 'Falha ao testar criação de customer Asaas.',
      },
    });
  }
});

export default router;
