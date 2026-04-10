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
} from './evolutionApiService.js';
import logger from '../utils/logger.js';
import { normalizeWhatsAppNumber } from '../utils/whatsapp.js';

const STATUS = {
  UNAVAILABLE: 'unavailable',
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

const isEvolutionProvider = () =>
  (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'evolution';

const getNested = (obj, path) =>
  path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);

const updateState = (patch) => {
  Object.assign(waState, patch, { lastSyncAt: new Date().toISOString() });
};

const updateUnavailableState = (error) => {
  updateState({
    status: STATUS.UNAVAILABLE,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error: error?.message || 'Evolution API indisponivel',
  });
};

const isLikelyRenderableImageBase64 = (value) => {
  if (!value || typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('data:image/')) return true;

  const imagePrefixes = [
    'iVBOR',   // PNG
    '/9j/',    // JPEG
    'R0lGOD',  // GIF
    'UklGR',   // WEBP
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

  logger.warn({ payload }, 'Evolution retornou payload de QR sem imagem renderizavel');
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

  const health = await healthCheck();
  if (!health.ok) {
    updateUnavailableState(health.error);
    return waState;
  }

  let statusPayload = null;

  try {
    statusPayload = await getInstanceStatus();
  } catch (error) {
    if (error instanceof EvolutionApiError && error.status === 404) {
      updateState({
        status: STATUS.DISCONNECTED,
        qrCode: null,
        connectedNumber: null,
        connectedName: null,
        error: null,
      });
      return waState;
    }

    updateUnavailableState(error);
    return waState;
  }

  const qrCode = includeQr ? extractQrCode(statusPayload) : waState.qrCode;
  const identity = extractIdentity(statusPayload);
  const status = normalizeStatus(extractConnectionState(statusPayload), qrCode);

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
    await syncStateFromEvolution({ includeQr: !qrCode });

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

    if (error instanceof EvolutionApiError && error.code === 'EVOLUTION_CONFIG_ERROR') {
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
    await syncStateFromEvolution({ includeQr: false });

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

    if (error instanceof EvolutionApiError) {
      updateUnavailableState(error);
    }

    return false;
  }
};

export const sendWhatsAppText = async (phone, message) => {
  const normalizedPhone = normalizeWhatsAppNumber(phone);
  const normalizedMessage = String(message || '').trim();

  if (!normalizedPhone) {
    logger.warn({ phone }, 'Envio WhatsApp ignorado: telefone invalido');
    return false;
  }

  if (!normalizedMessage) {
    logger.warn({ phone: normalizedPhone }, 'Envio WhatsApp ignorado: mensagem vazia');
    return false;
  }

  try {
    await sendTextMessage({
      phone: normalizedPhone,
      text: normalizedMessage,
    });

    // Se estava em estado inconsistente local, tenta ressincronizar
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
        phone: normalizedPhone,
        messageLength: normalizedMessage.length,
      },
      'Mensagem enviada via Evolution API'
    );

    return true;
  } catch (error) {
    logger.error(
      {
        err: error,
        phone: normalizedPhone,
        messageLength: normalizedMessage.length,
      },
      'Falha ao enviar mensagem via Evolution API'
    );

    if (error instanceof EvolutionApiError) {
      // Só derruba o estado global em erro de infra/config
      if (
        error.code === 'EVOLUTION_NETWORK_ERROR' ||
        error.code === 'EVOLUTION_TIMEOUT' ||
        error.code === 'EVOLUTION_CONFIG_ERROR'
      ) {
        updateUnavailableState(error);
      } else if (error.code === 'EVOLUTION_INVALID_PHONE' || error.code === 'EVOLUTION_INVALID_MESSAGE') {
        // erro de payload local, não muda status da conexão
        updateState({
          error: error.message,
        });
      } else {
        // 400/422 do provider não significa que a sessão caiu
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

export const refreshWhatsAppStatus = async () => syncStateFromEvolution({ includeQr: false });