import {
  healthCheck,
  getInstanceStatus,
  createInstance,
  connectInstance,
  getQrCode,
  logoutInstance,
  sendTextMessage,
  getEvolutionConfig,
  EvolutionApiError,
  isSessionStateError,
  getProviderErrorMessage,
  isInstanceNotFoundError,
} from './evolutionApiService.js';
import logger from '../utils/logger.js';
import {
  normalizeWhatsAppNumber,
  isInvalidJidContext,
  isValidPhone,
  normalizePhoneForSend,
  resolveSafeReplyDestination,
} from '../utils/whatsapp.js';

const STATUS = {
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  INSTANCE_NOT_FOUND: 'instance_not_found',
  DISCONNECTED: 'disconnected',
  PAIRING: 'pairing',
  CONNECTED: 'connected',
  ERROR: 'error',
};

const waState = {
  status: STATUS.DISCONNECTED,
  qrCode: null,
  error: null,
  connectedNumber: null,
  connectedName: null,
  provider: 'evolution',
  lastSyncAt: null,
};

let sessionRecoveryPromise = null;

const isEvolutionProvider = () =>
  (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'evolution';

const getNested = (obj, path) =>
  path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const updateState = (patch) => {
  Object.assign(waState, patch, { lastSyncAt: new Date().toISOString() });
};

const updateUnavailableState = (error) => {
  updateState({
    status: STATUS.PROVIDER_UNAVAILABLE,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error: error?.message || 'Evolution API indisponivel',
  });
};

const buildStatusLookupUrls = (baseURL, instanceName) => [
  `${baseURL}/instance/connectionState/${instanceName}`,
  `${baseURL}/instance/status/${instanceName}`,
];

const buildInstanceNotFoundError = (details = null) => {
  const { instanceName } = getEvolutionConfig();

  return new EvolutionApiError(`A instancia '${instanceName}' nao existe na Evolution API`, {
    status: 404,
    details,
    code: 'EVOLUTION_INSTANCE_NOT_FOUND',
  });
};

const updateInstanceNotFoundState = (error = null) => {
  updateState({
    status: STATUS.INSTANCE_NOT_FOUND,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error: error?.message || buildInstanceNotFoundError().message,
  });
};

const isLikelyRenderableImageBase64 = (value) => {
  if (!value || typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('data:image/')) return true;

  const imagePrefixes = [
    'iVBOR',
    '/9j/',
    'R0lGOD',
    'UklGR',
  ];

  return imagePrefixes.some((prefix) => trimmed.startsWith(prefix));
};

const normalizeQrCandidate = (value) => {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) return trimmed;

  if (isLikelyRenderableImageBase64(trimmed)) {
    return `data:image/png;base64,${trimmed}`;
  }

  return null;
};

const extractQrCode = (payload) => {
  const candidates = [
    payload?.qr,
    payload?.qrcode,
    payload?.qrCode,
    payload?.code,
    payload?.base64,
    getNested(payload, ['data', 'qr']),
    getNested(payload, ['data', 'qrcode']),
    getNested(payload, ['data', 'qrCode']),
    getNested(payload, ['data', 'base64']),
    getNested(payload, ['instance', 'qr']),
    getNested(payload, ['instance', 'qrcode']),
    getNested(payload, ['instance', 'qrCode']),
    getNested(payload, ['qrcode', 'base64']),
    getNested(payload, ['qrcode', 'code']),
    getNested(payload, ['qrcode', 'string']),
    getNested(payload, ['data', 'qrcode', 'base64']),
    getNested(payload, ['data', 'qrcode', 'code']),
    getNested(payload, ['data', 'qrcode', 'string']),
  ];

  for (const candidate of candidates) {
    const parsed = normalizeQrCandidate(candidate);
    if (parsed) return parsed;
  }

  logger.warn(
    {
      payloadKeys: Object.keys(payload || {}),
      payloadSizeBytes: (() => {
        try {
          return Buffer.byteLength(JSON.stringify(payload), 'utf8');
        } catch {
          return null;
        }
      })(),
      hasQrcodeNode: Boolean(payload?.qrcode || payload?.data?.qrcode),
    },
    'Evolution retornou payload de QR sem imagem renderizavel'
  );
  return null;
};

const extractConnectionState = (payload) => {
  const candidates = [
    payload?.status,
    payload?.state,
    payload?.connectionStatus,
    payload?.instance?.state,
    payload?.instance?.status,
    payload?.instance?.connectionStatus,
    getNested(payload, ['data', 'state']),
    getNested(payload, ['data', 'status']),
    getNested(payload, ['data', 'connectionStatus']),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.toLowerCase();
    }
  }

  return null;
};

const extractIdentity = (payload) => {
  const numberCandidate = [
    payload?.number,
    payload?.phone,
    payload?.wid,
    payload?.instance?.number,
    payload?.instance?.phone,
    getNested(payload, ['instance', 'ownerJid']),
    getNested(payload, ['data', 'number']),
    getNested(payload, ['data', 'phone']),
  ].find((value) => typeof value === 'string' && value.trim());

  const name = [
    payload?.name,
    payload?.pushName,
    payload?.instance?.name,
    payload?.instance?.profileName,
    getNested(payload, ['data', 'name']),
    getNested(payload, ['data', 'pushName']),
  ].find((value) => typeof value === 'string' && value.trim());

  const number = normalizeWhatsAppNumber(numberCandidate);

  return {
    number,
    name: name || null,
  };
};

const normalizeStatus = (rawState, qrCode) => {
  const state = (rawState || '').toLowerCase();

  const connectedStates = ['open', 'connected', 'online', 'ready', 'authenticated', 'islogged'];
  const pairingStates = ['qr', 'qrcode', 'pairing', 'scan_qr', 'connecting'];
  const disconnectedStates = ['close', 'closed', 'disconnected', 'logout', 'loggedout', 'offline'];

  if (connectedStates.some((item) => state.includes(item))) {
    return STATUS.CONNECTED;
  }

  if (pairingStates.some((item) => state.includes(item)) || qrCode) {
    return STATUS.PAIRING;
  }

  if (disconnectedStates.some((item) => state.includes(item))) {
    return STATUS.DISCONNECTED;
  }

  if (!state && qrCode) {
    return STATUS.PAIRING;
  }

  return STATUS.DISCONNECTED;
};

const syncStateFromEvolution = async ({ includeQr = false } = {}) => {
  if (!isEvolutionProvider()) {
    updateState({
      status: STATUS.ERROR,
      error: 'WHATSAPP_PROVIDER deve ser evolution',
      qrCode: null,
      connectedNumber: null,
      connectedName: null,
    });
    return waState;
  }

  const { baseURL, instanceName } = getEvolutionConfig();
  const statusLookupUrls = buildStatusLookupUrls(baseURL, instanceName);

  const health = await healthCheck();
  if (!health.ok) {
    logger.warn(
      {
        urlCalled: [`${baseURL}/instance/fetchInstances`, `${baseURL}/instance/list`],
        instanceName,
        evolutionStatus: health?.error?.status || null,
      },
      'Falha ao validar disponibilidade da Evolution antes de sincronizar status'
    );
    updateUnavailableState(health.error);
    return waState;
  }

  let statusPayload = null;

  try {
    statusPayload = await getInstanceStatus();
  } catch (error) {
    if (isInstanceNotFoundError(error)) {
      logger.warn(
        {
          urlCalled: statusLookupUrls,
          instanceName,
          evolutionStatus: error?.status || null,
        },
        'Instancia configurada nao existe na Evolution API'
      );
      updateInstanceNotFoundState(error);
      return waState;
    }

    updateUnavailableState(error);
    return waState;
  }

  if (!statusPayload || isInstanceNotFoundError({ details: statusPayload })) {
    logger.warn(
      {
        urlCalled: statusLookupUrls,
        instanceName,
        evolutionStatus: null,
      },
      'Evolution retornou payload sem instancia correspondente'
    );
    updateInstanceNotFoundState(buildInstanceNotFoundError(statusPayload));
    return waState;
  }

  const qrCode = includeQr ? extractQrCode(statusPayload) : waState.qrCode;
  const rawEvolutionState = extractConnectionState(statusPayload);
  const identity = extractIdentity(statusPayload);
  const status = normalizeStatus(rawEvolutionState, qrCode);

  logger.info(
    {
      urlCalled: statusLookupUrls,
      instanceName,
      evolutionStatus: rawEvolutionState,
      normalizedStatus: status,
    },
    'Status da instancia sincronizado com a Evolution API'
  );

  updateState({
    status,
    qrCode,
    connectedNumber: status === STATUS.CONNECTED ? identity.number : null,
    connectedName: status === STATUS.CONNECTED ? identity.name : null,
    error: null,
  });

  return waState;
};

export const initWhatsApp = async () => {
  if (!isEvolutionProvider()) {
    logger.warn('WhatsApp provider invalido. Configure WHATSAPP_PROVIDER=evolution');
    updateState({
      status: STATUS.ERROR,
      error: 'Provider de WhatsApp invalido',
      qrCode: null,
      connectedNumber: null,
      connectedName: null,
    });
    return;
  }

  logger.info({ config: getEvolutionConfig() }, 'Inicializando provider WhatsApp via Evolution API');

  try {
    await syncStateFromEvolution({ includeQr: true });
  } catch (error) {
    logger.error({ err: error }, 'Falha ao inicializar provider WhatsApp');
    updateUnavailableState(error);
  }
};

export const getWhatsAppStatus = () => ({
  status: waState.status,
  qrCode: waState.qrCode,
  error: waState.error,
  connectedNumber: waState.connectedNumber,
  connectedName: waState.connectedName,
  provider: waState.provider,
});

export const getWhatsAppClient = () => null;

export const connectWhatsApp = async () => {
  try {
    const health = await healthCheck();
    if (!health.ok) {
      updateUnavailableState(health.error);
      return false;
    }

    await createInstance();
    await connectInstance();

    let qrPayload = null;
    try {
      qrPayload = await getQrCode();
      logger.debug({ qrPayload }, 'Payload bruto de QR recebido apos connect');
    } catch (error) {
      logger.warn({ err: error }, 'Nao foi possivel obter QR imediatamente apos connect');
    }

    const qrCode = extractQrCode(qrPayload);
    const syncedState = await syncStateFromEvolution({ includeQr: !qrCode });

    if (
      syncedState.status === STATUS.INSTANCE_NOT_FOUND ||
      syncedState.status === STATUS.PROVIDER_UNAVAILABLE
    ) {
      return false;
    }

    if (qrCode) {
      updateState({
        status: STATUS.PAIRING,
        qrCode,
        connectedNumber: null,
        connectedName: null,
        error: null,
      });
    }

    return true;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao conectar instancia Evolution');

    if (isInstanceNotFoundError(error)) {
      updateInstanceNotFoundState(error);
    } else if (error instanceof EvolutionApiError && error.code === 'EVOLUTION_CONFIG_ERROR') {
      updateState({
        status: STATUS.ERROR,
        qrCode: null,
        error: error.message,
        connectedName: null,
        connectedNumber: null,
      });
    } else {
      updateUnavailableState(error);
    }

    return false;
  }
};

export const getWhatsAppQrCode = async () => {
  try {
    const payload = await getQrCode();
    logger.debug({ payload }, 'Payload bruto de QR recebido em getWhatsAppQrCode');

    const qrCode = extractQrCode(payload);

    if (!qrCode) {
      await syncStateFromEvolution({ includeQr: true });
      return getWhatsAppStatus().qrCode;
    }

    updateState({
      status: STATUS.PAIRING,
      qrCode,
      connectedNumber: null,
      connectedName: null,
      error: null,
    });

    return qrCode;
  } catch (error) {
    logger.warn({ err: error }, 'Erro ao buscar QR Code na Evolution API');
    await syncStateFromEvolution({ includeQr: true });
    return getWhatsAppStatus().qrCode;
  }
};

export const disconnectWhatsApp = async () => {
  try {
    await logoutInstance();
    const syncedState = await syncStateFromEvolution({ includeQr: false });

    if (syncedState.status === STATUS.INSTANCE_NOT_FOUND) {
      return true;
    }

    if (syncedState.status === STATUS.PROVIDER_UNAVAILABLE) {
      return false;
    }

    updateState({
      status: STATUS.DISCONNECTED,
      qrCode: null,
      connectedName: null,
      connectedNumber: null,
      error: null,
    });

    return true;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao desconectar instancia Evolution');

    if (isInstanceNotFoundError(error)) {
      updateInstanceNotFoundState(error);
    } else if (error instanceof EvolutionApiError) {
      updateUnavailableState(error);
    }

    return false;
  }
};

const markSessionStateAsBroken = (error, context = {}) => {
  updateState({
    status: STATUS.DISCONNECTED,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error:
      context?.providerError ||
      error?.message ||
      'Sessao Evolution inconsistente. Necessario reconectar a instancia.',
  });
};

const runSessionRecoveryFlow = async (context = {}) => {
  const { instanceName } = getEvolutionConfig();

  if (sessionRecoveryPromise) {
    logger.info(
      {
        instanceName,
        endpoint: context?.endpoint || null,
        phone: context?.phone || null,
      },
      'Recuperacao de sessao Evolution ja em andamento'
    );
    return sessionRecoveryPromise;
  }

  sessionRecoveryPromise = (async () => {
    const recoverySteps = [];

    try {
      try {
        await logoutInstance();
        recoverySteps.push('logout_instance');
      } catch (logoutError) {
        recoverySteps.push('logout_instance_failed');
        logger.warn(
          {
            err: logoutError,
            instanceName,
          },
          'Falha ao deslogar instancia durante recuperacao de sessao'
        );
      }

      await createInstance();
      recoverySteps.push('create_instance');

      await connectInstance();
      recoverySteps.push('connect_instance');

      try {
        const qrPayload = await getQrCode();
        const qrCode = extractQrCode(qrPayload);

        if (qrCode) {
          updateState({
            status: STATUS.PAIRING,
            qrCode,
            connectedNumber: null,
            connectedName: null,
            error: null,
          });
          recoverySteps.push('qr_code_ready');
        } else {
          recoverySteps.push('qr_code_unavailable');
        }
      } catch (qrError) {
        recoverySteps.push('qr_code_fetch_failed');
        logger.warn(
          {
            err: qrError,
            instanceName,
          },
          'Falha ao obter QR code durante recuperacao de sessao'
        );
      }

      await syncStateFromEvolution({ includeQr: true });
      recoverySteps.push('sync_state');

      logger.info(
        {
          instanceName,
          endpoint: context?.endpoint || null,
          phone: context?.phone || null,
          providerError: context?.providerError || null,
          sessionStateError: true,
          recoverySteps,
        },
        'Recuperacao de sessao Evolution concluida'
      );

      return {
        ok: true,
        recoverySteps,
      };
    } catch (recoveryError) {
      updateState({
        status: STATUS.ERROR,
        qrCode: null,
        connectedNumber: null,
        connectedName: null,
        error: recoveryError?.message || 'Falha na recuperacao da sessao Evolution',
      });

      logger.error(
        {
          err: recoveryError,
          instanceName,
          endpoint: context?.endpoint || null,
          phone: context?.phone || null,
          providerError: context?.providerError || null,
          sessionStateError: true,
          recoverySteps,
        },
        'Falha na recuperacao da sessao Evolution'
      );

      return {
        ok: false,
        recoverySteps,
        error: recoveryError?.message || 'Falha na recuperacao da sessao Evolution',
      };
    }
  })().finally(() => {
    sessionRecoveryPromise = null;
  });

  return sessionRecoveryPromise;
};

export const recoverWhatsAppSession = async (context = {}) => runSessionRecoveryFlow(context);

export const sendWhatsAppText = async (phone, message, context = {}) => {
  const rawPhone = String(phone ?? '').trim();
  const normalizedPhone = normalizePhoneForSend(rawPhone);
  const normalizedMessage = String(message || '').trim();

  const remoteJidOriginal =
    typeof context?.remoteJidOriginal === 'string' && context.remoteJidOriginal.trim()
      ? context.remoteJidOriginal.trim()
      : null;

  const config = getEvolutionConfig();
  const contextInstanceName = typeof context?.instanceName === 'string'
    ? context.instanceName.trim().toLowerCase()
    : '';
  const resolvedInstanceName = contextInstanceName || config.instanceName;
  const endpoint = `/message/sendText/${resolvedInstanceName}`;
  const destination = normalizedPhone;
  const discardedRemoteJid = isInvalidJidContext(remoteJidOriginal);
  const connectedNumber = normalizeWhatsAppNumber(getWhatsAppStatus()?.connectedNumber);
  const knownInstanceNumbers = Array.isArray(context?.knownInstanceNumbers)
    ? context.knownInstanceNumbers
    : [];
  const allowLidDestination = context?.allowLidDestination === true;

  if (!isValidPhone(normalizedPhone || '')) {
    logger.warn(
      {
        phone: normalizedPhone || rawPhone || null,
        remoteJidOriginal,
        reason: 'invalid_phone',
      },
      'Envio WhatsApp ignorado: telefone invalido'
    );
    return false;
  }

  if (!destination) {
    logger.warn(
      {
        phone: normalizedPhone || rawPhone || null,
        remoteJidOriginal,
        reason: 'invalid_destination',
      },
      'Envio WhatsApp ignorado: destino invalido para resposta'
    );
    return false;
  }

  if (!normalizedMessage) {
    logger.warn(
      {
        phone: normalizedPhone || rawPhone || null,
        remoteJidOriginal,
        reason: 'empty_message',
      },
      'Envio WhatsApp ignorado: mensagem vazia'
    );
    return false;
  }

  const destinationDecision = resolveSafeReplyDestination({
    phone: destination,
    remoteJidOriginal,
    connectedNumber,
    knownInstanceNumbers,
    allowLidDestination,
  });

  if (!destinationDecision.ok) {
    logger.warn(
      {
        phone: normalizedPhone || rawPhone || null,
        destination: destinationDecision.destination,
        connectedNumber,
        knownInstanceNumbers,
        remoteJidOriginal,
        reason: destinationDecision.reason,
      },
      'Envio WhatsApp bloqueado pela politica de destino'
    );
    return false;
  }

  if (discardedRemoteJid) {
    logger.info(
      {
        phone: normalizedPhone || rawPhone || null,
        remoteJidOriginal,
        usedDestination: destination,
        discardedRemoteJid: true,
      },
      'Enviando mensagem usando telefone normalizado (ignorando @lid)'
    );
  }

  try {
    logger.info(
      {
        phone: normalizedPhone || rawPhone || null,
        remoteJidOriginal,
        destination,
        endpoint,
      },
      'DESTINO FINAL'
    );

    logger.info(
      {
        number: destination,
        textMessagePreview: normalizedMessage,
        payloadShape: 'number+textMessage',
        endpoint,
      },
      'ENVIO PAYLOAD EVOLUTION'
    );

    const sendResult = await sendTextMessage({
      phone: destination,
      text: normalizedMessage,
      remoteJidOriginal,
      instanceName: resolvedInstanceName,
    });

    const payloadShapeUsed = sendResult?.meta?.payloadShape || null;
    const endpointUsed = sendResult?.meta?.endpoint || endpoint;

    if (waState.status !== STATUS.CONNECTED) {
      await syncStateFromEvolution({ includeQr: false });
    } else {
      updateState({
        status: STATUS.CONNECTED,
        error: null,
      });
    }

    logger.info(
      {
        phone: normalizedPhone || rawPhone || null,
        remoteJidOriginal,
        resolvedDestination: destination,
        destinationSource: 'normalized_phone',
        discardedRemoteJid,
        endpoint: endpointUsed,
        payloadShapeUsed,
        messageLength: normalizedMessage.length,
      },
      'Mensagem enviada via Evolution API'
    );

    return true;
  } catch (error) {
    const providerError = getProviderErrorMessage(error) || error?.message || null;
    const sessionStateError = isSessionStateError(error);

    logger.error(
      {
        err: error,
        phone: normalizedPhone || rawPhone || null,
        remoteJidOriginal,
        resolvedDestination: destination,
        destinationSource: 'normalized_phone',
        discardedRemoteJid,
        endpoint,
        instanceName: resolvedInstanceName,
        providerError,
        sessionStateError,
        status: error?.status || null,
        evolutionErrorPayload: error?.details || null,
        messageLength: normalizedMessage.length,
      },
      'Falha ao enviar mensagem via Evolution API'
    );

    if (sessionStateError) {
      logger.error(
        {
          endpoint,
          phone: normalizedPhone || rawPhone || null,
          instanceName: resolvedInstanceName,
          providerError,
          sessionStateError: true,
        },
        'Erro de sessao inconsistente detectado no provider Evolution'
      );

      markSessionStateAsBroken(error, { providerError });

      await recoverWhatsAppSession({
        endpoint,
        phone: normalizedPhone || rawPhone || null,
        instanceName: resolvedInstanceName,
        providerError,
      });

      return false;
    }

    if (error instanceof EvolutionApiError) {
      if (isInstanceNotFoundError(error)) {
        updateInstanceNotFoundState(error);
      } else if (
        error.code === 'EVOLUTION_NETWORK_ERROR' ||
        error.code === 'EVOLUTION_TIMEOUT' ||
        error.code === 'EVOLUTION_CONFIG_ERROR'
      ) {
        updateUnavailableState(error);
      } else if (
        error.code === 'EVOLUTION_INVALID_PHONE' ||
        error.code === 'EVOLUTION_INVALID_MESSAGE'
      ) {
        updateState({
          error: error.message,
        });
      } else {
        updateState({
          error: error.message,
        });
      }
    } else {
      updateState({
        error: error?.message || 'Falha ao enviar mensagem',
      });
    }

    return false;
  }
};

export const logoutWhatsApp = async () => disconnectWhatsApp();

export const restartWhatsApp = async () => connectWhatsApp();

export const initializeWhatsAppInstance = async () => {
  const { baseURL, instanceName } = getEvolutionConfig();

  logger.info(
    {
      urlCalled: `${baseURL}/instance/create`,
      instanceName,
    },
    'Inicializando/recriando instancia Evolution'
  );

  const ok = await connectWhatsApp();
  return {
    ok,
    status: getWhatsAppStatus(),
  };
};

export const refreshWhatsAppStatus = async () => syncStateFromEvolution({ includeQr: false });
