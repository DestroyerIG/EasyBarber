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
  resolveSafeReplyDestination,
} from '../utils/whatsapp.js';
import {
  ensureBarbershopWhatsAppInstanceName,
  getBarbershopWhatsAppInstanceContext,
  normalizeWhatsAppInstanceName,
} from './whatsapp/whatsappInstanceService.js';

const STATUS = {
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  INSTANCE_NOT_FOUND: 'instance_not_found',
  DISCONNECTED: 'disconnected',
  PAIRING: 'pairing',
  CONNECTED: 'connected',
  ERROR: 'error',
};

const buildDefaultState = () => ({
  status: STATUS.DISCONNECTED,
  qrCode: null,
  error: null,
  connectedNumber: null,
  connectedName: null,
  provider: 'evolution',
  lastSyncAt: null,
});

const waStateByInstance = new Map();
const sessionRecoveryPromises = new Map();

const isEvolutionProvider = () =>
  (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'evolution';

const getNested = (obj, path) =>
  path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const resolveStateKey = (instanceName = null) =>
  normalizeWhatsAppInstanceName(instanceName) || '__default__';

const getOrCreateState = (instanceName = null) => {
  const stateKey = resolveStateKey(instanceName);

  if (!waStateByInstance.has(stateKey)) {
    waStateByInstance.set(stateKey, buildDefaultState());
  }

  return waStateByInstance.get(stateKey);
};

const updateState = (patch, { instanceName = null } = {}) => {
  const state = getOrCreateState(instanceName);
  Object.assign(state, patch, { lastSyncAt: new Date().toISOString() });
};

const snapshotState = (instanceName = null) => ({
  ...getOrCreateState(instanceName),
});

const resolveClientInstanceContext = async ({ instanceName = null, barbershopId = null, createIfMissing = false } = {}) => {
  const normalizedInstanceName = normalizeWhatsAppInstanceName(instanceName);

  if (normalizedInstanceName) {
    return {
      barbershopId: barbershopId || null,
      instanceName: normalizedInstanceName,
    };
  }

  if (!barbershopId) {
    const fallbackConfig = getEvolutionConfig();
    return {
      barbershopId: null,
      instanceName: normalizeWhatsAppInstanceName(fallbackConfig.instanceName),
    };
  }

  const context = createIfMissing
    ? await ensureBarbershopWhatsAppInstanceName(barbershopId)
    : await getBarbershopWhatsAppInstanceContext(barbershopId);

  return {
    barbershopId,
    instanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName),
  };
};

const updateUnavailableState = (error, { instanceName = null } = {}) => {
  updateState({
    status: STATUS.PROVIDER_UNAVAILABLE,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error: error?.message || 'Evolution API indisponivel',
  }, { instanceName });
};

const buildStatusLookupUrls = (baseURL, instanceName) => [
  `${baseURL}/instance/connectionState/${instanceName}`,
  `${baseURL}/instance/status/${instanceName}`,
];

const buildInstanceNotFoundError = (details = null, { instanceName = null } = {}) => {
  const { instanceName: resolvedInstanceName } = getEvolutionConfig({ instanceName });

  return new EvolutionApiError(`A instancia '${resolvedInstanceName}' nao existe na Evolution API`, {
    status: 404,
    details,
    code: 'EVOLUTION_INSTANCE_NOT_FOUND',
  });
};

const updateInstanceNotFoundState = (error = null, { instanceName = null } = {}) => {
  updateState({
    status: STATUS.INSTANCE_NOT_FOUND,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error: error?.message || buildInstanceNotFoundError(null, { instanceName }).message,
  }, { instanceName });
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

const syncStateFromEvolution = async ({ includeQr = false, instanceName = null } = {}) => {
  const state = getOrCreateState(instanceName);

  if (!isEvolutionProvider()) {
    updateState({
      status: STATUS.ERROR,
      error: 'WHATSAPP_PROVIDER deve ser evolution',
      qrCode: null,
      connectedNumber: null,
      connectedName: null,
    }, { instanceName });
    return snapshotState(instanceName);
  }

  const { baseURL, instanceName: resolvedInstanceName } = getEvolutionConfig({ instanceName });
  const statusLookupUrls = buildStatusLookupUrls(baseURL, resolvedInstanceName);

  const health = await healthCheck();
  if (!health.ok) {
    logger.warn(
      {
        urlCalled: [`${baseURL}/instance/fetchInstances`, `${baseURL}/instance/list`],
        instanceName: resolvedInstanceName,
        evolutionStatus: health?.error?.status || null,
      },
      'Falha ao validar disponibilidade da Evolution antes de sincronizar status'
    );
    updateUnavailableState(health.error, { instanceName: resolvedInstanceName });
    return snapshotState(resolvedInstanceName);
  }

  let statusPayload = null;

  try {
    statusPayload = await getInstanceStatus({ instanceName: resolvedInstanceName });
  } catch (error) {
    if (isInstanceNotFoundError(error, { instanceName: resolvedInstanceName })) {
      logger.warn(
        {
          urlCalled: statusLookupUrls,
          instanceName: resolvedInstanceName,
          evolutionStatus: error?.status || null,
        },
        'Instancia configurada nao existe na Evolution API'
      );
      updateInstanceNotFoundState(error, { instanceName: resolvedInstanceName });
      return snapshotState(resolvedInstanceName);
    }

    updateUnavailableState(error, { instanceName: resolvedInstanceName });
    return snapshotState(resolvedInstanceName);
  }

  if (!statusPayload || isInstanceNotFoundError({ details: statusPayload }, { instanceName: resolvedInstanceName })) {
    logger.warn(
      {
        urlCalled: statusLookupUrls,
        instanceName: resolvedInstanceName,
        evolutionStatus: null,
      },
      'Evolution retornou payload sem instancia correspondente'
    );
    updateInstanceNotFoundState(buildInstanceNotFoundError(statusPayload, { instanceName: resolvedInstanceName }), {
      instanceName: resolvedInstanceName,
    });
    return snapshotState(resolvedInstanceName);
  }

  const qrCode = includeQr ? extractQrCode(statusPayload) : state.qrCode;
  const rawEvolutionState = extractConnectionState(statusPayload);
  const identity = extractIdentity(statusPayload);
  const status = normalizeStatus(rawEvolutionState, qrCode);

  logger.info(
    {
      urlCalled: statusLookupUrls,
      instanceName: resolvedInstanceName,
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
  }, { instanceName: resolvedInstanceName });

  return snapshotState(resolvedInstanceName);
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
  ...snapshotState(getEvolutionConfig().instanceName),
});

export const getWhatsAppStatusByInstance = (instanceName = null) => ({
  ...snapshotState(instanceName),
});

export const getWhatsAppClient = () => null;

export const connectWhatsApp = async (context = {}) => {
  try {
    const instanceContext = await resolveClientInstanceContext({
      instanceName: context?.instanceName,
      barbershopId: context?.barbershopId,
      createIfMissing: true,
    });
    const resolvedInstanceName = instanceContext.instanceName;
    const health = await healthCheck();
    if (!health.ok) {
      updateUnavailableState(health.error, { instanceName: resolvedInstanceName });
      return false;
    }

    await createInstance({ instanceName: resolvedInstanceName });
    await connectInstance({ instanceName: resolvedInstanceName });

    let qrPayload = null;
    try {
      qrPayload = await getQrCode({ instanceName: resolvedInstanceName });
      logger.debug({ qrPayload }, 'Payload bruto de QR recebido apos connect');
    } catch (error) {
      logger.warn({ err: error, instanceName: resolvedInstanceName }, 'Nao foi possivel obter QR imediatamente apos connect');
    }

    const qrCode = extractQrCode(qrPayload);
    const syncedState = await syncStateFromEvolution({
      includeQr: !qrCode,
      instanceName: resolvedInstanceName,
    });

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
      }, { instanceName: resolvedInstanceName });
    }

    return true;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao conectar instancia Evolution');

    if (isInstanceNotFoundError(error, { instanceName: context?.instanceName })) {
      updateInstanceNotFoundState(error, { instanceName: context?.instanceName });
    } else if (error instanceof EvolutionApiError && error.code === 'EVOLUTION_CONFIG_ERROR') {
      updateState({
        status: STATUS.ERROR,
        qrCode: null,
        error: error.message,
        connectedName: null,
        connectedNumber: null,
      }, { instanceName: context?.instanceName });
    } else {
      updateUnavailableState(error, { instanceName: context?.instanceName });
    }

    return false;
  }
};

export const getWhatsAppQrCode = async (context = {}) => {
  try {
    const instanceContext = await resolveClientInstanceContext({
      instanceName: context?.instanceName,
      barbershopId: context?.barbershopId,
      createIfMissing: true,
    });
    const resolvedInstanceName = instanceContext.instanceName;
    const payload = await getQrCode({ instanceName: resolvedInstanceName });
    logger.debug({ payload }, 'Payload bruto de QR recebido em getWhatsAppQrCode');

    const qrCode = extractQrCode(payload);

    if (!qrCode) {
      const syncedState = await syncStateFromEvolution({ includeQr: true, instanceName: resolvedInstanceName });
      return syncedState.qrCode;
    }

    updateState({
      status: STATUS.PAIRING,
      qrCode,
      connectedNumber: null,
      connectedName: null,
      error: null,
    }, { instanceName: resolvedInstanceName });

    return qrCode;
  } catch (error) {
    logger.warn({ err: error }, 'Erro ao buscar QR Code na Evolution API');
    const resolvedInstanceName = normalizeWhatsAppInstanceName(context?.instanceName);
    if (resolvedInstanceName) {
      const syncedState = await syncStateFromEvolution({ includeQr: true, instanceName: resolvedInstanceName });
      return syncedState.qrCode;
    }
    return snapshotState(resolvedInstanceName).qrCode;
  }
};

export const disconnectWhatsApp = async (context = {}) => {
  try {
    const instanceContext = await resolveClientInstanceContext({
      instanceName: context?.instanceName,
      barbershopId: context?.barbershopId,
      createIfMissing: false,
    });
    const resolvedInstanceName = instanceContext.instanceName;

    if (!resolvedInstanceName) {
      return true;
    }

    await logoutInstance({ instanceName: resolvedInstanceName });
    const syncedState = await syncStateFromEvolution({ includeQr: false, instanceName: resolvedInstanceName });

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
    }, { instanceName: resolvedInstanceName });

    return true;
  } catch (error) {
    logger.error({ err: error }, 'Erro ao desconectar instancia Evolution');

    if (isInstanceNotFoundError(error, { instanceName: context?.instanceName })) {
      updateInstanceNotFoundState(error, { instanceName: context?.instanceName });
    } else if (error instanceof EvolutionApiError) {
      updateUnavailableState(error, { instanceName: context?.instanceName });
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
  }, { instanceName: context?.instanceName || null });
};

const runSessionRecoveryFlow = async (context = {}) => {
  const resolvedInstanceName = normalizeWhatsAppInstanceName(context?.instanceName)
    || getEvolutionConfig().instanceName;
  const recoveryKey = resolveStateKey(resolvedInstanceName);

  if (sessionRecoveryPromises.has(recoveryKey)) {
    logger.info(
      {
        instanceName: resolvedInstanceName,
        endpoint: context?.endpoint || null,
        phone: context?.phone || null,
      },
      'Recuperacao de sessao Evolution ja em andamento'
    );
    return sessionRecoveryPromises.get(recoveryKey);
  }

  const recoveryPromise = (async () => {
    const recoverySteps = [];

    try {
      try {
        await logoutInstance({ instanceName: resolvedInstanceName });
        recoverySteps.push('logout_instance');
      } catch (logoutError) {
        recoverySteps.push('logout_instance_failed');
        logger.warn(
          {
            err: logoutError,
            instanceName: resolvedInstanceName,
          },
          'Falha ao deslogar instancia durante recuperacao de sessao'
        );
      }

      await createInstance({ instanceName: resolvedInstanceName });
      recoverySteps.push('create_instance');

      await connectInstance({ instanceName: resolvedInstanceName });
      recoverySteps.push('connect_instance');

      try {
        const qrPayload = await getQrCode({ instanceName: resolvedInstanceName });
        const qrCode = extractQrCode(qrPayload);

        if (qrCode) {
          updateState({
            status: STATUS.PAIRING,
            qrCode,
            connectedNumber: null,
            connectedName: null,
            error: null,
          }, { instanceName: resolvedInstanceName });
          recoverySteps.push('qr_code_ready');
        } else {
          recoverySteps.push('qr_code_unavailable');
        }
      } catch (qrError) {
        recoverySteps.push('qr_code_fetch_failed');
        logger.warn(
          {
            err: qrError,
            instanceName: resolvedInstanceName,
          },
          'Falha ao obter QR code durante recuperacao de sessao'
        );
      }

      await syncStateFromEvolution({ includeQr: true, instanceName: resolvedInstanceName });
      recoverySteps.push('sync_state');

      logger.info(
        {
          instanceName: resolvedInstanceName,
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
      }, { instanceName: resolvedInstanceName });

      logger.error(
        {
          err: recoveryError,
          instanceName: resolvedInstanceName,
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
    sessionRecoveryPromises.delete(recoveryKey);
  });

  sessionRecoveryPromises.set(recoveryKey, recoveryPromise);

  return recoveryPromise;
};

export const recoverWhatsAppSession = async (context = {}) => runSessionRecoveryFlow(context);

export const sendWhatsAppText = async (phone, message, context = {}) => {
  const rawPhone = String(phone ?? '').trim();
  const normalizedMessage = String(message || '').trim();

  const remoteJidOriginal =
    typeof context?.remoteJidOriginal === 'string' && context.remoteJidOriginal.trim()
      ? context.remoteJidOriginal.trim()
      : null;

  const allowLidDestination = context?.allowLidDestination === true;
  const extraction = context?.extraction || null;
  const sourcePath =
    typeof extraction?.sourcePath === 'string' && extraction.sourcePath.trim()
      ? extraction.sourcePath.trim()
      : typeof context?.sourcePath === 'string' && context.sourcePath.trim()
        ? context.sourcePath.trim()
        : 'direct_input';
  const rawFromMe = context?.fromMe ?? extraction?.fromMe ?? false;
  const fromMe =
    rawFromMe === true ||
    rawFromMe === 1 ||
    (typeof rawFromMe === 'string' && ['true', '1'].includes(rawFromMe.trim().toLowerCase()));
  const authorPhone = (extraction?.phone || context?.authorPhone || rawPhone || '').trim();
  const isValidUserMessage = !fromMe && authorPhone;

  if (!isValidUserMessage) {
    logger.warn(
      {
        authorPhone: authorPhone || null,
        fromMe,
        sourcePath,
        remoteJidOriginal,
        reason: fromMe ? 'from_me' : 'missing_author_phone',
      },
      'Envio WhatsApp ignorado: mensagem invalida para resposta'
    );
    return false;
  }

  const normalizedAuthorPhone = normalizeWhatsAppNumber(authorPhone);

  // REGRA 1: Bloqueio de auto-resposta — authorPhone === connectedNumber
  const instanceContext = await resolveClientInstanceContext({
    instanceName: context?.instanceName,
    barbershopId: context?.barbershopId,
    createIfMissing: Boolean(context?.barbershopId),
  });
  const resolvedInstanceName = instanceContext.instanceName;
  const endpoint = `/message/sendText/${resolvedInstanceName}`;
  const connectedNumber = normalizeWhatsAppNumber(getWhatsAppStatusByInstance(resolvedInstanceName)?.connectedNumber);

  if (connectedNumber && normalizedAuthorPhone === connectedNumber) {
    logger.warn(
      {
        authorPhone: normalizedAuthorPhone,
        connectedNumber,
        sourcePath,
        remoteJidOriginal,
        reason: 'self_reply_blocked',
      },
      'Bloqueado: tentativa de auto-resposta (authorPhone === connectedNumber)'
    );
    return false;
  }

  // REGRA 3: Sanitização do número — garantir formato limpo (digits only)
  const sanitizedDestination = normalizedAuthorPhone ? normalizedAuthorPhone.replace(/\D/g, '') : null;

  if (!sanitizedDestination || sanitizedDestination.length < 10) {
    logger.warn(
      {
        authorPhone: authorPhone || null,
        sanitizedDestination: sanitizedDestination || null,
        sourcePath,
        remoteJidOriginal,
        reason: 'invalid_phone_format',
      },
      'Numero invalido, envio cancelado'
    );
    return false;
  }

  // REGRA 4: Destino SEMPRE é o número sanitizado, NUNCA um JID @lid
  const destination = `${sanitizedDestination}@s.whatsapp.net`;
  const destinationLowered = destination.toLowerCase();

  const discardedRemoteJid = isInvalidJidContext(remoteJidOriginal);
  const knownInstanceNumbers = Array.isArray(context?.knownInstanceNumbers)
    ? context.knownInstanceNumbers
    : [];

  const isValidDestination = Boolean(sanitizedDestination && isValidPhone(sanitizedDestination));

  if (!isValidDestination) {
    logger.warn(
      {
        authorPhone: sanitizedDestination || authorPhone || null,
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
        authorPhone: sanitizedDestination || authorPhone || null,
        destination,
        sourcePath,
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
        authorPhone: sanitizedDestination || authorPhone || null,
        destination,
        sourcePath,
        remoteJidOriginal,
        reason: 'empty_message',
      },
      'Envio WhatsApp ignorado: mensagem vazia'
    );
    return false;
  }

  const destinationDecision = resolveSafeReplyDestination({
    phone: sanitizedDestination,
    fromMe,
    remoteJidOriginal,
    connectedNumber,
    knownInstanceNumbers,
    extraction,
    allowLidDestination,
  });

  if (!destinationDecision.ok) {
    logger.warn(
      {
        authorPhone: sanitizedDestination || authorPhone || null,
        destination: destinationDecision.destination,
        destinationFinal: destination,
        sourcePath,
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
        authorPhone: sanitizedDestination || authorPhone || null,
        remoteJidOriginal,
        usedDestination: destination,
        discardedRemoteJid: true,
      },
      'Enviando mensagem usando telefone normalizado (ignorando remoteJid)'
    );
  }

  // REGRA 6: Log obrigatório antes do envio
  logger.info(
    {
      fromMe,
      authorPhone: sanitizedDestination,
      connectedNumber,
      destination: sanitizedDestination,
      remoteJidOriginal: remoteJidOriginal || null,
      endpoint,
    },
    'ENVIO VALIDADO'
  );

  try {
    logger.info(
      {
        authorPhone: normalizedAuthorPhone || authorPhone || null,
        destination,
        sourcePath,
        remoteJidOriginal,
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

    const currentState = getWhatsAppStatusByInstance(resolvedInstanceName);

    if (currentState.status !== STATUS.CONNECTED) {
      await syncStateFromEvolution({ includeQr: false, instanceName: resolvedInstanceName });
    } else {
      updateState({
        status: STATUS.CONNECTED,
        error: null,
      }, { instanceName: resolvedInstanceName });
    }

    logger.info(
      {
        authorPhone: normalizedAuthorPhone || authorPhone || null,
        remoteJidOriginal,
        resolvedDestination: destination,
        destinationSource: 'author_phone',
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
        authorPhone: normalizedAuthorPhone || authorPhone || null,
        remoteJidOriginal,
        resolvedDestination: destination,
        destinationSource: 'author_phone',
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
          authorPhone: normalizedAuthorPhone || authorPhone || null,
          instanceName: resolvedInstanceName,
          providerError,
          sessionStateError: true,
        },
        'Erro de sessao inconsistente detectado no provider Evolution'
      );

      markSessionStateAsBroken(error, {
        providerError,
        instanceName: resolvedInstanceName,
      });

      await recoverWhatsAppSession({
        endpoint,
        authorPhone: normalizedAuthorPhone || authorPhone || null,
        instanceName: resolvedInstanceName,
        providerError,
      });

      return false;
    }

    if (error instanceof EvolutionApiError) {
      if (isInstanceNotFoundError(error, { instanceName: resolvedInstanceName })) {
        updateInstanceNotFoundState(error, { instanceName: resolvedInstanceName });
      } else if (
        error.code === 'EVOLUTION_NETWORK_ERROR' ||
        error.code === 'EVOLUTION_TIMEOUT' ||
        error.code === 'EVOLUTION_CONFIG_ERROR'
      ) {
        updateUnavailableState(error, { instanceName: resolvedInstanceName });
      } else if (
        error.code === 'EVOLUTION_INVALID_PHONE' ||
        error.code === 'EVOLUTION_INVALID_MESSAGE'
      ) {
        updateState({
          error: error.message,
        }, { instanceName: resolvedInstanceName });
      } else {
        updateState({
          error: error.message,
        }, { instanceName: resolvedInstanceName });
      }
    } else {
      updateState({
        error: error?.message || 'Falha ao enviar mensagem',
      }, { instanceName: resolvedInstanceName });
    }

    return false;
  }
};

export const logoutWhatsApp = async (context = {}) => disconnectWhatsApp(context);

export const restartWhatsApp = async (context = {}) => connectWhatsApp(context);

export const initializeWhatsAppInstance = async (context = {}) => {
  const instanceContext = await resolveClientInstanceContext({
    instanceName: context?.instanceName,
    barbershopId: context?.barbershopId,
    createIfMissing: true,
  });
  const { baseURL, instanceName } = getEvolutionConfig({ instanceName: instanceContext.instanceName });

  logger.info(
    {
      urlCalled: `${baseURL}/instance/create`,
      instanceName,
    },
    'Inicializando/recriando instancia Evolution'
  );

  const ok = await connectWhatsApp(instanceContext);
  return {
    ok,
    status: getWhatsAppStatusByInstance(instanceContext.instanceName),
  };
};

export const refreshWhatsAppStatus = async (context = {}) => {
  const instanceContext = await resolveClientInstanceContext({
    instanceName: context?.instanceName,
    barbershopId: context?.barbershopId,
    createIfMissing: false,
  });

  if (!instanceContext.instanceName) {
    return {
      ...buildDefaultState(),
    };
  }

  return syncStateFromEvolution({
    includeQr: false,
    instanceName: instanceContext.instanceName,
  });
};
