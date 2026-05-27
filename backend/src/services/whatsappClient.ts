import {
  healthCheck,
  getInstanceStatus,
  getInstanceMe,
  createInstance,
  connectInstance,
  getQrCode,
  logoutInstance,
  deleteInstance,
  sendTextMessage,
  getEvolutionConfig,
  EvolutionApiError,
  isSessionStateError,
  getProviderErrorMessage,
  isInstanceNotFoundError,
} from './evolutionApiService.js';
import { getCachedQrCode } from './whatsapp/handlers/qrcodeUpdatedHandler.js';
import {
  getConnectedNumber as getCachedConnectedNumber,
  updateInstanceDirect,
  updateInstanceFromPayload,
  extractConnectedNumberFromPayload,
  clearInstanceNumber,
} from './whatsapp/whatsappInstanceCache.js';
import logger from '../utils/logger.js';
import {
  normalizeWhatsAppNumber,
  isInvalidJidContext,
  isValidPhone,
  resolveSafeReplyDestination,
  isSelfMessage,
} from '../utils/whatsapp.js';
import {
  ensureBarbershopWhatsAppInstanceName,
  getBarbershopWhatsAppInstanceContext,
  normalizeWhatsAppInstanceName,
} from './whatsapp/whatsappInstanceService.js';
import { barbershopSettingsRepository } from '../repositories/barbershopSettingsRepository.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhatsAppState {
  [key: string]: unknown;
  status: string;
  qrCode: string | null;
  error: string | null;
  connectedNumber: string | null;
  connectedName: string | null;
  provider: string;
  lastSyncAt: string | null;
}

type WhatsAppStatePatch = Partial<WhatsAppState>;

interface ClientInstanceContext {
  barbershopId: string | null;
  instanceName: string | null;
  [key: string]: unknown;
}

interface ResolveClientInstanceContextOptions {
  instanceName?: string | null;
  barbershopId?: string | null;
  createIfMissing?: boolean;
}

interface SendWhatsAppTextContext {
  remoteJidOriginal?: string | null;
  allowLidDestination?: boolean;
  extraction?: {
    sourcePath?: string;
    fromMe?: boolean | number | string;
    phone?: string;
  } | null;
  sourcePath?: string;
  fromMe?: boolean | number | string;
  authorPhone?: string;
  instanceName?: string | null;
  barbershopId?: string | null;
  knownInstanceNumbers?: string[];
  [key: string]: unknown;
}

interface ConnectWhatsAppContext {
  instanceName?: string | null;
  barbershopId?: string | null;
  [key: string]: unknown;
}

interface RecoveryContext {
  endpoint?: string | null;
  phone?: string | null;
  instanceName?: string | null;
  providerError?: string | null;
  [key: string]: unknown;
}

interface SessionRecoveryResult {
  ok: boolean;
  recoverySteps: string[];
  error?: string;
}

// ── State Machine ─────────────────────────────────────────────────────────────

export type WhatsAppInstanceState =
  | 'not_created'
  | 'creating'
  | 'initializing'
  | 'pairing'
  | 'qr_ready'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'failed'
  | 'destroyed';

const VALID_TRANSITIONS: Record<WhatsAppInstanceState, WhatsAppInstanceState[]> = {
  not_created:   ['creating', 'failed'],
  creating:      ['initializing', 'failed', 'not_created'],
  initializing:  ['pairing', 'qr_ready', 'connecting', 'connected', 'failed'],
  pairing:       ['qr_ready', 'connecting', 'connected', 'failed', 'disconnected'],
  qr_ready:      ['connecting', 'connected', 'pairing', 'failed', 'disconnected'],
  connecting:    ['connected', 'pairing', 'qr_ready', 'failed', 'disconnected'],
  connected:     ['disconnected', 'reconnecting', 'failed', 'destroyed'],
  disconnected:  ['reconnecting', 'creating', 'pairing', 'connecting', 'not_created', 'destroyed'],
  reconnecting:  ['connected', 'pairing', 'qr_ready', 'failed', 'disconnected'],
  failed:        ['creating', 'reconnecting', 'destroyed', 'not_created'],
  destroyed:     ['creating', 'not_created'],
};

export const instanceStateTransition = (
  from: WhatsAppInstanceState,
  to: WhatsAppInstanceState,
): WhatsAppInstanceState => {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid state transition: ${from} → ${to}`);
  }
  return to;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS = {
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  INSTANCE_NOT_FOUND: 'instance_not_found',
  DISCONNECTED: 'disconnected',
  PAIRING: 'pairing',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const;

// ── State Management ──────────────────────────────────────────────────────────

const buildDefaultState = (): WhatsAppState => ({
  status: STATUS.DISCONNECTED,
  qrCode: null,
  error: null,
  connectedNumber: null,
  connectedName: null,
  provider: 'evolution',
  lastSyncAt: null,
});

const waStateByInstance = new Map<string, WhatsAppState>();
const sessionRecoveryPromises = new Map<string, Promise<SessionRecoveryResult>>();

const isEvolutionProvider = (): boolean =>
  (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'evolution';

const getNested = (obj: unknown, path: string[]): unknown =>
  path.reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

const resolveStateKey = (instanceName: string | null = null): string =>
  normalizeWhatsAppInstanceName(instanceName) || '__default__';

// In-process Promise-chaining mutex — single-process safe (Render free tier).
// Migrar para Redlock quando Redis estiver disponível (multi-pod).
const instanceLocks = new Map<string, Promise<void>>();

const withInstanceLock = async <T>(instanceName: string | null, fn: () => Promise<T>): Promise<T> => {
  const key = resolveStateKey(instanceName);
  const current = instanceLocks.get(key) ?? Promise.resolve();
  let releaseLock!: () => void;
  const next = new Promise<void>((resolve) => { releaseLock = resolve; });
  instanceLocks.set(key, current.then(() => next));
  await current;
  try {
    return await fn();
  } finally {
    releaseLock();
    if (instanceLocks.get(key) === next) instanceLocks.delete(key);
  }
};

const getOrCreateState = (instanceName: string | null = null): WhatsAppState => {
  const stateKey = resolveStateKey(instanceName);

  if (!waStateByInstance.has(stateKey)) {
    waStateByInstance.set(stateKey, buildDefaultState());
  }

  return waStateByInstance.get(stateKey)!;
};

const updateState = (patch: WhatsAppStatePatch, { instanceName = null }: { instanceName?: string | null } = {}): void => {
  const state = getOrCreateState(instanceName);
  Object.assign(state, patch, { lastSyncAt: new Date().toISOString() });
};

const snapshotState = (instanceName: string | null = null): WhatsAppState => ({
  ...getOrCreateState(instanceName),
});

const resolveClientInstanceContext = async ({
  instanceName = null,
  barbershopId = null,
  createIfMissing = false,
}: ResolveClientInstanceContextOptions = {}): Promise<ClientInstanceContext> => {
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
    instanceName: normalizeWhatsAppInstanceName(context.whatsappInstanceName as string | null),
  };
};

const updateUnavailableState = (error: unknown, { instanceName = null }: { instanceName?: string | null } = {}): void => {
  const err = error as Error | null;
  updateState({
    status: STATUS.PROVIDER_UNAVAILABLE,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error: err?.message || 'Evolution API indisponivel',
  }, { instanceName });
};

const buildStatusLookupUrls = (baseURL: string, instanceName: string): string[] => [
  `${baseURL}/instance/connectionState/${instanceName}`,
  `${baseURL}/instance/status/${instanceName}`,
];

const buildInstanceNotFoundError = (details: unknown = null, { instanceName = null }: { instanceName?: string | null } = {}): EvolutionApiError => {
  const { instanceName: resolvedInstanceName } = getEvolutionConfig({ instanceName });

  return new EvolutionApiError(`A instancia '${resolvedInstanceName}' nao existe na Evolution API`, {
    status: 404,
    details,
    code: 'EVOLUTION_INSTANCE_NOT_FOUND',
  });
};

const updateInstanceNotFoundState = (error: unknown = null, { instanceName = null }: { instanceName?: string | null } = {}): void => {
  const { instanceName: resolvedInstanceName } = getEvolutionConfig({ instanceName });
  const err = error as Error | null;
  updateState({
    status: STATUS.INSTANCE_NOT_FOUND,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error: err?.message || buildInstanceNotFoundError(null, { instanceName }).message,
  }, { instanceName: resolvedInstanceName });
  clearInstanceNumber(resolvedInstanceName);
};

const isLikelyRenderableImageBase64 = (value: unknown): boolean => {
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

const normalizeQrCandidate = (value: unknown): string | null => {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) return trimmed;

  if (isLikelyRenderableImageBase64(trimmed)) {
    return `data:image/png;base64,${trimmed}`;
  }

  return null;
};

const extractQrCode = (payload: unknown): string | null => {
  const p = payload as Record<string, unknown> | null;
  const candidates: unknown[] = [
    p?.qr,
    p?.qrcode,
    p?.qrCode,
    p?.code,
    p?.base64,
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
      payloadKeys: Object.keys(p || {}),
      payloadSizeBytes: (() => {
        try {
          return Buffer.byteLength(JSON.stringify(payload), 'utf8');
        } catch {
          return null;
        }
      })(),
      hasQrcodeNode: Boolean((p?.qrcode) || (p?.data as Record<string, unknown>)?.qrcode),
    },
    'Evolution retornou payload de QR sem imagem renderizavel'
  );
  return null;
};

const extractConnectionState = (payload: unknown): string | null => {
  const p = payload as Record<string, unknown> | null;
  const pInstance = p?.instance as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    p?.status,
    p?.state,
    p?.connectionStatus,
    pInstance?.state,
    pInstance?.status,
    pInstance?.connectionStatus,
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

const extractIdentity = (payload: unknown): { number: string | null; name: string | null } => {
  const number = extractConnectedNumberFromPayload(payload);
  const p = payload as Record<string, unknown> | null;
  const pInstance = p?.instance as Record<string, unknown> | undefined;
  const pMe = p?.me as Record<string, unknown> | undefined;

  const name = [
    p?.name,
    p?.pushName,
    pInstance?.name,
    pInstance?.profileName,
    pMe?.name,
    pMe?.pushName,
    getNested(payload, ['data', 'name']),
    getNested(payload, ['data', 'pushName']),
  ].find((value) => typeof value === 'string' && (value as string).trim()) as string | undefined;

  return {
    number: number || null,
    name: name || null,
  };
};

const resolveConnectedNumberFromEnv = (instanceName: string | null = null): string | null => {
  const instanceKey = normalizeWhatsAppInstanceName(instanceName) || '__default__';
  if (instanceKey !== '__default__') {
    return null;
  }

  const envPhone =
    process.env.WHATSAPP_CONNECTED_NUMBER
    || process.env.EVOLUTION_CONNECTED_NUMBER
    || process.env.WHATSAPP_PHONE
    || process.env.EVOLUTION_PHONE;

  const envNumber = normalizeWhatsAppNumber(envPhone);
  if (!envNumber) {
    return null;
  }

  logger.info(
    { instanceName: instanceKey, connectedNumber: envNumber, source: 'env' },
    'connectedNumber resolvido via variavel de ambiente'
  );
  return envNumber;
};

const resolveConnectedNumberFromDatabase = async (instanceName: string | null = null): Promise<string | null> => {
  const normalizedInstanceName = normalizeWhatsAppInstanceName(instanceName);
  if (!normalizedInstanceName) {
    return null;
  }

  try {
    const matches = await barbershopSettingsRepository.findWhatsAppInstanceNameDiagnostics(
      normalizedInstanceName
    );

    if (!matches.length) {
      return null;
    }

    const activeMatch = matches.find((item: Record<string, unknown>) => item.active === true) || matches[0];
    const normalized = normalizeWhatsAppNumber(activeMatch?.whatsapp as string | undefined);

    if (!normalized) {
      return null;
    }

    logger.info(
      {
        instanceName: normalizedInstanceName,
        connectedNumber: normalized,
        source: 'database',
        barbershopId: activeMatch?.id || null,
      },
      'connectedNumber resolvido via banco'
    );

    return normalized;
  } catch (error) {
    logger.warn(
      { err: error, instanceName: normalizedInstanceName },
      'Falha ao resolver connectedNumber via banco'
    );
    return null;
  }
};

const resolveConnectedNumberFromInstanceMe = async (instanceName: string | null = null): Promise<string | null> => {
  try {
    const payload = await getInstanceMe({ instanceName });
    const p = payload as Record<string, unknown> | null;
    const pResponse = p?.response as Record<string, unknown> | undefined;

    if (
      !payload ||
      p?.status === 404 ||
      p?.error === 'Not Found' ||
      (Array.isArray(pResponse?.message) &&
        (pResponse.message as unknown[]).some((msg) => String(msg || '').includes('/instance/me')))
    ) {
      return null;
    }

    const extracted = extractConnectedNumberFromPayload(payload);
    const normalized = normalizeWhatsAppNumber(extracted);

    if (!normalized) {
      return null;
    }

    updateInstanceFromPayload(instanceName, payload, 'sync');

    logger.info(
      { instanceName: instanceName || null, connectedNumber: normalized, source: 'instance_me' },
      'connectedNumber resolvido via /instance/me'
    );

    return normalized;
  } catch (error) {
    logger.warn(
      { err: error, instanceName: instanceName || null },
      'Falha ao consultar /instance/me na Evolution API'
    );
    return null;
  }
};

const normalizeStatus = (rawState: string | null, qrCode: string | null): string => {
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

const syncStateFromEvolution = async ({
  includeQr = false,
  instanceName = null,
}: {
  includeQr?: boolean;
  instanceName?: string | null;
} = {}): Promise<WhatsAppState> => {
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
  const healthData = health as Record<string, unknown>;
  if (!healthData.ok) {
    logger.warn(
      {
        urlCalled: [`${baseURL}/instance/fetchInstances`, `${baseURL}/instance/list`],
        instanceName: resolvedInstanceName,
        evolutionStatus: (healthData.error as Record<string, unknown>)?.status || null,
      },
      'Falha ao validar disponibilidade da Evolution antes de sincronizar status'
    );
    updateUnavailableState(healthData.error, { instanceName: resolvedInstanceName });
    return snapshotState(resolvedInstanceName);
  }

  let statusPayload: unknown = null;

  try {
    statusPayload = await getInstanceStatus({ instanceName: resolvedInstanceName });
  } catch (error) {
    if (isInstanceNotFoundError(error, { instanceName: resolvedInstanceName })) {
      logger.warn(
        {
          urlCalled: statusLookupUrls,
          instanceName: resolvedInstanceName,
          evolutionStatus: (error as Record<string, unknown>)?.status || null,
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
  const previousSnapshot = snapshotState(resolvedInstanceName);
  const previousConnected = normalizeWhatsAppNumber(previousSnapshot?.connectedNumber);

  let resolvedConnectedNumber: string | null = null;
  let connectedNumberSource = 'none';

  if (status === STATUS.CONNECTED) {
    resolvedConnectedNumber = identity.number
      ? normalizeWhatsAppNumber(identity.number)
      : null;
    connectedNumberSource = resolvedConnectedNumber ? 'status_payload' : 'none';

    if (!resolvedConnectedNumber) {
      const instanceMeNumber = await resolveConnectedNumberFromInstanceMe(resolvedInstanceName);
      if (instanceMeNumber) {
        resolvedConnectedNumber = instanceMeNumber;
        connectedNumberSource = 'instance_me';
      }
    }

    if (!resolvedConnectedNumber) {
      const cached = getCachedConnectedNumber(resolvedInstanceName);
      if (cached) {
        resolvedConnectedNumber = cached;
        connectedNumberSource = 'cache_preserved';
        logger.debug(
          { instanceName: resolvedInstanceName, connectedNumber: cached, source: connectedNumberSource },
          'connectedNumber preservado do cache anterior'
        );
      }
    }

    if (!resolvedConnectedNumber) {
      const dbNumber = await resolveConnectedNumberFromDatabase(resolvedInstanceName);
      if (dbNumber) {
        resolvedConnectedNumber = dbNumber;
        connectedNumberSource = 'database';
      }
    }

    if (!resolvedConnectedNumber) {
      const envNumber = resolveConnectedNumberFromEnv(resolvedInstanceName);
      if (envNumber) {
        resolvedConnectedNumber = envNumber;
        connectedNumberSource = 'env';
      }
    }
  } else {
    resolvedConnectedNumber = previousConnected;
    connectedNumberSource = resolvedConnectedNumber ? 'previous' : 'none';
  }

  logger.info(
    {
      urlCalled: statusLookupUrls,
      instanceName: resolvedInstanceName,
      evolutionStatus: rawEvolutionState,
      normalizedStatus: status,
      connectedNumber: resolvedConnectedNumber,
      connectedNumberSource,
    },
    'Status da instancia sincronizado com a Evolution API'
  );

  updateState({
    status,
    qrCode,
    connectedNumber: resolvedConnectedNumber,
    connectedName: status === STATUS.CONNECTED ? identity.name : null,
    error: null,
  }, { instanceName: resolvedInstanceName });

  const cachePatch: Record<string, unknown> = {
    status,
    source: connectedNumberSource,
  };
  if (status === STATUS.CONNECTED && resolvedConnectedNumber) {
    cachePatch.connectedNumber = resolvedConnectedNumber;
  }
  updateInstanceDirect(resolvedInstanceName, cachePatch as import('./whatsapp/whatsappInstanceCache.js').InstanceCachePatch);

  return snapshotState(resolvedInstanceName);
};

export const initWhatsApp = async (): Promise<void> => {
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

export const getWhatsAppStatus = (): WhatsAppState => ({
  ...snapshotState(getEvolutionConfig().instanceName),
});

export const getWhatsAppStatusByInstance = (instanceName: string | null = null): WhatsAppState => ({
  ...snapshotState(instanceName),
});

export const getConnectedNumberCached = (instanceName: string | null = null): string | null => {
  const cached = getCachedConnectedNumber(instanceName);
  if (cached) return cached;

  const legacyState = snapshotState(instanceName);
  return normalizeWhatsAppNumber(legacyState?.connectedNumber) || null;
};

export const getWhatsAppClient = (): null => null;

export const getWhatsAppHealthStats = (): {
  totalInstances: number;
  connected: number;
  pairing: number;
  other: number;
} => {
  let connected = 0;
  let pairing = 0;
  let other = 0;
  for (const state of waStateByInstance.values()) {
    if (state.status === STATUS.CONNECTED) connected++;
    else if (state.status === STATUS.PAIRING) pairing++;
    else other++;
  }
  return { totalInstances: waStateByInstance.size, connected, pairing, other };
};

/**
 * Garante que a instância Evolution existe sem destruir sessão saudável.
 * Retorna { existed: true } se a instância já existe com estado aceitável.
 * Retorna { existed: false } se criou uma nova instância.
 */
export const ensureInstance = async (
  context: ConnectWhatsAppContext = {},
): Promise<{ existed: boolean; evolutionState: string | null }> => {
  const instanceContext = await resolveClientInstanceContext({
    instanceName: context?.instanceName,
    barbershopId: context?.barbershopId,
    createIfMissing: true,
  });
  const resolvedInstanceName = instanceContext.instanceName;

  try {
    const statusPayload = await getInstanceStatus({ instanceName: resolvedInstanceName });
    const statusObj = statusPayload as Record<string, unknown>;
    const instanceObj = statusObj?.instance as Record<string, unknown> | undefined;
    const dataObj = statusObj?.data as Record<string, unknown> | undefined;
    const evolutionState = (
      (instanceObj?.state as string | undefined)
      ?? (dataObj?.state as string | undefined)
      ?? (statusObj?.state as string | undefined)
      ?? null
    );

    logger.info({ instanceName: resolvedInstanceName, evolutionState }, 'ensureInstance: instance already exists');
    return { existed: true, evolutionState };
  } catch (err) {
    if (isInstanceNotFoundError(err, { instanceName: resolvedInstanceName })) {
      logger.info({ instanceName: resolvedInstanceName }, 'ensureInstance: instance not found, creating');
      await createInstance({ instanceName: resolvedInstanceName });
      return { existed: false, evolutionState: 'creating' };
    }
    // On other errors (network, circuit open) re-throw so caller can handle
    throw err;
  }
};

export const connectWhatsApp = async (context: ConnectWhatsAppContext = {}): Promise<boolean> => {
  const resolvedLockKey = context?.instanceName ?? context?.barbershopId ?? '__default__';
  return withInstanceLock(resolvedLockKey, async () => connectWhatsAppInner(context));
};

const connectWhatsAppInner = async (context: ConnectWhatsAppContext = {}): Promise<boolean> => {
  try {
    const instanceContext = await resolveClientInstanceContext({
      instanceName: context?.instanceName,
      barbershopId: context?.barbershopId,
      createIfMissing: true,
    });
    const resolvedInstanceName = instanceContext.instanceName;
    const health = await healthCheck();
    const healthData = health as Record<string, unknown>;
    if (!healthData.ok) {
      updateUnavailableState(healthData.error, { instanceName: resolvedInstanceName });
      return false;
    }

    // Deletar instância existente para limpar TODA sessão Baileys do Redis.
    // Sem isso, sessão corrompida causa cycling connecting→close sem gerar QR.
    try {
      await deleteInstance({ instanceName: resolvedInstanceName });
      logger.info({ instanceName: resolvedInstanceName }, 'connectWhatsApp: instancia deletada para reset completo da sessao');
    } catch {
      logger.debug({ instanceName: resolvedInstanceName }, 'connectWhatsApp: deleteInstance ignorado (instancia nao existe)');
    }

    await createInstance({ instanceName: resolvedInstanceName });

    // Aguardar Baileys inicializar antes de solicitar conexão/QR.
    // Evolution API registra a instância internamente antes de aceitar connect.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let connectPayload: unknown = null;
    try {
      connectPayload = await connectInstance({ instanceName: resolvedInstanceName });
      logger.debug({ connectPayload }, 'connectWhatsApp: payload de connect recebido');
    } catch (error) {
      logger.warn({ err: error, instanceName: resolvedInstanceName }, 'connectWhatsApp: connectInstance falhou, tentando getQrCode diretamente');
    }

    let qrPayload: unknown = connectPayload;
    const connectQr = connectPayload ? extractQrCode(connectPayload) : null;
    if (!connectQr) {
      try {
        qrPayload = await getQrCode({ instanceName: resolvedInstanceName });
        logger.debug({ qrPayload }, 'Payload bruto de QR recebido apos connect');
      } catch (error) {
        logger.warn({ err: error, instanceName: resolvedInstanceName }, 'Nao foi possivel obter QR imediatamente apos connect');
        qrPayload = null;
      }
    }

    const qrCode = connectQr ?? extractQrCode(qrPayload);
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
        error: (error as Error).message,
        connectedName: null,
        connectedNumber: null,
      }, { instanceName: context?.instanceName });
    } else {
      updateUnavailableState(error, { instanceName: context?.instanceName });
    }

    return false;
  }
};

export const getWhatsAppQrCode = async (context: ConnectWhatsAppContext = {}): Promise<string | null> => {
  try {
    const instanceContext = await resolveClientInstanceContext({
      instanceName: context?.instanceName,
      barbershopId: context?.barbershopId,
      createIfMissing: true,
    });
    const resolvedInstanceName = instanceContext.instanceName;

    if (resolvedInstanceName) {
      const cached = getCachedQrCode(resolvedInstanceName);
      if (cached) {
        logger.debug({ instanceName: resolvedInstanceName }, 'QR Code retornado do cache QRCODE_UPDATED');
        return cached;
      }
    }

    const payload = await getQrCode({ instanceName: resolvedInstanceName });
    logger.debug({ payload }, 'Payload bruto de QR recebido em getWhatsAppQrCode');

    const qrCode = extractQrCode(payload);

    if (!qrCode) {
      const syncedState = await syncStateFromEvolution({ includeQr: true, instanceName: resolvedInstanceName });
      return syncedState.qrCode ?? (resolvedInstanceName ? getCachedQrCode(resolvedInstanceName) : null);
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

export const disconnectWhatsApp = async (context: ConnectWhatsAppContext = {}): Promise<boolean> => {
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

    clearInstanceNumber(resolvedInstanceName);

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

const markSessionStateAsBroken = (error: unknown, context: RecoveryContext = {}): void => {
  const err = error as Error | null;
  updateState({
    status: STATUS.DISCONNECTED,
    qrCode: null,
    connectedNumber: null,
    connectedName: null,
    error:
      context?.providerError ||
      err?.message ||
      'Sessao Evolution inconsistente. Necessario reconectar a instancia.',
  }, { instanceName: context?.instanceName || null });
};

const runSessionRecoveryFlow = async (context: RecoveryContext = {}): Promise<SessionRecoveryResult> => {
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
    return sessionRecoveryPromises.get(recoveryKey)!;
  }

  const recoveryPromise = (async (): Promise<SessionRecoveryResult> => {
    const recoverySteps: string[] = [];

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
      const err = recoveryError as Error;
      updateState({
        status: STATUS.ERROR,
        qrCode: null,
        connectedNumber: null,
        connectedName: null,
        error: err?.message || 'Falha na recuperacao da sessao Evolution',
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
        error: err?.message || 'Falha na recuperacao da sessao Evolution',
      };
    }
  })().finally(() => {
    sessionRecoveryPromises.delete(recoveryKey);
  });

  sessionRecoveryPromises.set(recoveryKey, recoveryPromise);

  return recoveryPromise;
};

export const recoverWhatsAppSession = async (context: RecoveryContext = {}): Promise<SessionRecoveryResult> =>
  runSessionRecoveryFlow(context);

export const sendWhatsAppText = async (
  phone: string,
  message: string,
  context: SendWhatsAppTextContext = {},
): Promise<boolean> => {
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
      : typeof context?.sourcePath === 'string' && (context.sourcePath as string).trim()
        ? (context.sourcePath as string).trim()
        : 'direct_input';
  const rawFromMe = context?.fromMe ?? extraction?.fromMe ?? false;
  const fromMe =
    rawFromMe === true ||
    rawFromMe === 1 ||
    (typeof rawFromMe === 'string' && ['true', '1'].includes((rawFromMe as string).trim().toLowerCase()));
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

  // ========== REGRA 1: Bloqueio de auto-resposta ==========
  const instanceContext = await resolveClientInstanceContext({
    instanceName: context?.instanceName,
    barbershopId: context?.barbershopId,
    createIfMissing: Boolean(context?.barbershopId),
  });
  const resolvedInstanceName = instanceContext.instanceName;
  const endpoint = `/message/sendText/${resolvedInstanceName}`;
  const connectedNumber = normalizeWhatsAppNumber(getWhatsAppStatusByInstance(resolvedInstanceName)?.connectedNumber);

  // Use isSelfMessage (with Brazilian variant expansion) to catch both 8-digit and 9-digit formats.
  // Evolution API v1.7.x @lid webhooks put the bot's 8-digit old-format number (e.g. 558396311811)
  // in sender, which must match the bot's 9-digit connected number (e.g. 5583996311811).
  if (connectedNumber && normalizedAuthorPhone && isSelfMessage({ authorPhone: normalizedAuthorPhone, connectedNumber })) {
    logger.warn(
      {
        authorPhone: normalizedAuthorPhone,
        connectedNumber,
        sourcePath,
        reason: 'self_reply_blocked',
      },
      'BLOQUEADO: auto-resposta (authorPhone === connectedNumber via variant expansion)'
    );
    return false;
  }

  const knownInstanceNumbers: string[] = Array.isArray(context?.knownInstanceNumbers)
    ? context.knownInstanceNumbers
    : [];

  if (knownInstanceNumbers.some((n) => normalizeWhatsAppNumber(n) === normalizedAuthorPhone)) {
    logger.warn(
      {
        authorPhone: normalizedAuthorPhone,
        connectedNumber,
        knownInstanceNumbers,
        reason: 'self_reply_blocked',
      },
      'BLOQUEADO: auto-resposta (authorPhone em knownInstanceNumbers)'
    );
    return false;
  }

  // ========== REGRA 2: Sanitização e validação do destino ==========
  // FIX Evolution API v1 @lid: quando allowLidDestination=true E remoteJidOriginal é @lid,
  // usar o @lid JID completo como destino de envio.
  const isLidDirectSend = allowLidDestination === true &&
    typeof remoteJidOriginal === 'string' &&
    remoteJidOriginal.trim().toLowerCase().endsWith('@lid');

  let destination: string | null;
  if (isLidDirectSend) {
    destination = remoteJidOriginal!.trim();
  } else {
    destination = normalizedAuthorPhone ? normalizedAuthorPhone.replace(/\D/g, '') : null;
  }

  if (!destination || (!isLidDirectSend && !isValidPhone(destination))) {
    logger.warn(
      {
        authorPhone: authorPhone || null,
        destination: destination || null,
        sourcePath,
        remoteJidOriginal,
        isLidDirectSend,
        reason: 'invalid_destination',
      },
      'BLOQUEADO: destino invalido (telefone nao resolvido ou formato incorreto)'
    );
    return false;
  }

  if (!normalizedMessage) {
    logger.warn(
      {
        authorPhone: destination,
        reason: 'empty_message',
      },
      'BLOQUEADO: mensagem vazia'
    );
    return false;
  }

  // ========== REGRA 3: Política de destino seguro ==========
  if (!isLidDirectSend) {
    const destinationDecision = resolveSafeReplyDestination({
      phone: destination,
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
          authorPhone: destination,
          destinationDecision: destinationDecision.reason,
          connectedNumber,
          remoteJidOriginal,
        },
        'BLOQUEADO: politica de destino rejeitou envio'
      );
      return false;
    }
  }

  // ========== REGRA 4: Log obrigatório ENVIO VALIDADO ==========
  logger.info(
    {
      fromMe: false,
      authorPhone: isLidDirectSend ? destination : (destination || normalizedAuthorPhone),
      connectedNumber,
      destination,
      remoteJidOriginal: remoteJidOriginal || null,
      isLidDirectSend,
      endpoint,
    },
    'ENVIO VALIDADO'
  );

  // ========== REGRA 5: Envio para Evolution API ==========
  try {
    logger.debug(
      {
        number: destination,
        endpoint,
        isLidDirectSend,
        messageLength: normalizedMessage.length,
      },
      'Enviando para Evolution API'
    );

    const sendResult = await sendTextMessage({
      phone: destination,
      text: normalizedMessage,
      remoteJidOriginal,
      instanceName: resolvedInstanceName,
      allowLidPhone: isLidDirectSend,
    });

    const sendResultData = sendResult as Record<string, unknown> | null;
    const endpointUsed = (sendResultData?.meta as Record<string, unknown>)?.endpoint || endpoint;

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
        authorPhone: destination,
        destination,
        isLidDirectSend,
        endpoint: endpointUsed,
        messageLength: normalizedMessage.length,
      },
      'Mensagem enviada com sucesso via Evolution API'
    );

    return true;
  } catch (error) {
    const err = error as (Error & { status?: number; details?: unknown; code?: string }) | null;
    const providerError = getProviderErrorMessage(error) || err?.message || null;
    const sessionStateError = isSessionStateError(error);

    logger.error(
      {
        err: error,
        authorPhone: normalizedAuthorPhone || authorPhone || null,
        remoteJidOriginal,
        resolvedDestination: destination,
        isLidDirectSend,
        destinationSource: isLidDirectSend ? 'lid_jid_direct' : 'author_phone',
        endpoint,
        instanceName: resolvedInstanceName,
        providerError,
        sessionStateError,
        status: err?.status || null,
        evolutionErrorPayload: err?.details || null,
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
        providerError: providerError ?? undefined,
        instanceName: resolvedInstanceName,
      });

      await recoverWhatsAppSession({
        endpoint,
        authorPhone: normalizedAuthorPhone || authorPhone || null,
        instanceName: resolvedInstanceName,
        providerError: providerError ?? undefined,
      });

      return false;
    }

    if (error instanceof EvolutionApiError) {
      if (isInstanceNotFoundError(error, { instanceName: resolvedInstanceName })) {
        updateInstanceNotFoundState(error, { instanceName: resolvedInstanceName });
      } else if (
        err?.code === 'EVOLUTION_NETWORK_ERROR' ||
        err?.code === 'EVOLUTION_TIMEOUT' ||
        err?.code === 'EVOLUTION_CONFIG_ERROR'
      ) {
        updateUnavailableState(error, { instanceName: resolvedInstanceName });
      } else if (
        err?.code === 'EVOLUTION_INVALID_PHONE' ||
        err?.code === 'EVOLUTION_INVALID_MESSAGE'
      ) {
        updateState({
          error: (error as Error).message,
        }, { instanceName: resolvedInstanceName });
      } else {
        updateState({
          error: (error as Error).message,
        }, { instanceName: resolvedInstanceName });
      }
    } else {
      updateState({
        error: err?.message || 'Falha ao enviar mensagem',
      }, { instanceName: resolvedInstanceName });
    }

    return false;
  }
};

export const logoutWhatsApp = async (context: ConnectWhatsAppContext = {}): Promise<boolean> =>
  disconnectWhatsApp(context);

export const restartWhatsApp = async (context: ConnectWhatsAppContext = {}): Promise<boolean> =>
  connectWhatsApp(context);

export const initializeWhatsAppInstance = async (
  context: ConnectWhatsAppContext = {},
): Promise<{ ok: boolean; status: WhatsAppState }> => {
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

export const refreshWhatsAppStatus = async (
  context: ConnectWhatsAppContext = {},
): Promise<WhatsAppState> => {
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
