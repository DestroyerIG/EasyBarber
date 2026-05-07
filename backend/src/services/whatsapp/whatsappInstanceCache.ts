/**
 * whatsappInstanceCache.ts
 *
 * Cache centralizado de estado por instância WhatsApp.
 *
 * DESIGN DECISIONS:
 * - Isolamento total: chave = normalizeWhatsAppInstanceName (mesmo critério do whatsappClient)
 * - Sem HTTP: apenas leitura/escrita na memória do processo
 * - Atualizado via syncStateFromEvolution e eventos da Evolution API
 * - connectedNumber extraído do payload de evento (sem HTTP)
 * - Regra: nunca descartar mensagens com base em connectedNumber null (fail-open no anti-self)
 * - ENV (WHATSAPP_CONNECTED_NUMBER / EVOLUTION_CONNECTED_NUMBER / WHATSAPP_PHONE / EVOLUTION_PHONE)
 *   só para instância __default__ (single-tenant)
 * - Nunca sobrescrever número válido com null vindo de sync (apenas clearInstanceNumber)
 */

import logger from '../../utils/logger.js';
import { normalizePhone } from '../../utils/whatsapp.js';
import { normalizeWhatsAppInstanceName } from './whatsappInstanceService.js';

// ==================== ESTRUTURA DO CACHE ====================

export interface InstanceCacheEntry {
  connectedNumber: string | null;
  connectedName: string | null;
  status: string;
  lastUpdate: string | null;
  source: 'payload' | 'env' | 'sync' | 'reset' | 'webhook' | null;
}

export type InstanceCachePatch = Partial<InstanceCacheEntry>;

const instanceStore = new Map<string, InstanceCacheEntry>();

// ==================== NORMALIZAÇÃO DE CHAVE ====================

const normalizeInstanceKey = (instanceName: string | null | undefined): string => {
  const normalized = normalizeWhatsAppInstanceName(
    typeof instanceName === 'string' ? instanceName : null,
  );
  return normalized || '__default__';
};

// ==================== EXTRAÇÃO DO NÚMERO DO PAYLOAD DE EVENTO ====================

/**
 * Extrai o connectedNumber diretamente do payload de evento da Evolution API.
 *
 * Cobertura de múltiplas versões/formatos da Evolution API:
 * - v1: payload.instance.wid, payload.owner
 * - v2: payload.me.id, payload.me.wid
 * - QR events: payload.qrcode.instance, payload.instance.id
 *
 * REGRA: NAO fazer HTTP aqui. /instance/me e resolvido no whatsappClient quando necessario.
 */
export const extractConnectedNumberFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;

  const p = payload as Record<string, unknown>;
  const me = p?.me as Record<string, unknown> | undefined;
  const instance = p?.instance as Record<string, unknown> | undefined;
  const data = p?.data as Record<string, unknown> | undefined;
  const dataMe = data?.me as Record<string, unknown> | undefined;
  const dataInstance = data?.instance as Record<string, unknown> | undefined;
  const profile = p?.profile as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    // Evolution v2+
    me?.id,
    me?.wid,
    me?.number,
    me?.phone,
    // Evolution v1
    instance?.wid,
    instance?.id,
    instance?.ownerJid,
    instance?.owner,
    instance?.number,
    instance?.phone,
    // Campos raiz comuns
    // destination excluído: Evolution API v1 messages-upsert coloca JID do cliente
    // remoto nesse campo, não o número da instância. Usar causava connectedNumber = cliente.
    p?.id,
    p?.owner,
    p?.ownerJid,
    p?.wid,
    p?.number,
    p?.phone,
    // Nested data
    data?.id,
    data?.wid,
    // data.destination excluído pelo mesmo motivo
    data?.number,
    data?.phone,
    dataMe?.id,
    dataMe?.wid,
    dataMe?.number,
    dataMe?.phone,
    dataInstance?.wid,
    dataInstance?.ownerJid,
    dataInstance?.number,
    dataInstance?.phone,
    data?.owner,
    data?.wid,
    // Profile
    profile?.wid,
    profile?.id,
  ];

  for (const candidate of candidates) {
    const phone = normalizePhone(candidate as string | undefined);
    if (phone) return phone;
  }

  return null;
};

// ==================== LEITURA DO CACHE ====================

/**
 * Retorna o connectedNumber do cache para uma instância.
 * Fallback chain: cache → env var (somente __default__).
 * NÃO faz HTTP.
 */
export const getConnectedNumber = (instanceName: string | null = null): string | null => {
  const key = normalizeInstanceKey(instanceName);
  const entry = instanceStore.get(key);

  if (entry?.connectedNumber) {
    return normalizePhone(entry.connectedNumber) || entry.connectedNumber;
  }

  if (key === '__default__') {
    const envPhone =
      process.env.WHATSAPP_CONNECTED_NUMBER
      || process.env.EVOLUTION_CONNECTED_NUMBER
      || process.env.WHATSAPP_PHONE
      || process.env.EVOLUTION_PHONE;
    if (envPhone) {
      const normalized = normalizePhone(envPhone);
      if (normalized) {
        logger.debug(
          { instanceName: key, connectedNumber: normalized, source: 'env' },
          'connectedNumber resolvido via variavel de ambiente (instancia default)'
        );
        return normalized;
      }
    }
  }

  return null;
};

/**
 * Retorna snapshot do estado completo de uma instância.
 */
export const getInstanceState = (instanceName: string | null = null): InstanceCacheEntry | null => {
  const key = normalizeInstanceKey(instanceName);
  return instanceStore.get(key) || null;
};

// ==================== ESCRITA NO CACHE ====================

/**
 * Atualiza o cache de uma instância a partir do payload de evento.
 * Extrai o connectedNumber automaticamente.
 * Chamado em eventos de conexão e durante syncStateFromEvolution.
 */
export const updateInstanceFromPayload = (
  instanceName: string | null | undefined,
  payload: unknown,
  source: InstanceCacheEntry['source'] = 'payload',
): InstanceCacheEntry => {
  const key = normalizeInstanceKey(instanceName);
  const existing = instanceStore.get(key) || ({} as Partial<InstanceCacheEntry>);

  const extracted = extractConnectedNumberFromPayload(payload);
  const updatedNumber = extracted || existing.connectedNumber || null;

  const entry: InstanceCacheEntry = {
    ...existing,
    connectedNumber: updatedNumber,
    connectedName: null,
    status: existing.status ?? '',
    lastUpdate: new Date().toISOString(),
    source,
  };

  instanceStore.set(key, entry);

  logger.debug(
    {
      instanceName: key,
      connectedNumber: updatedNumber,
      extractedFromPayload: extracted,
      source,
    },
    'Cache de instancia atualizado'
  );

  return entry;
};

/**
 * Atualiza o cache diretamente com valores já normalizados.
 * Usado por syncStateFromEvolution após normalizar o número.
 * connectedNumber: null no patch NÃO apaga número existente (use clearInstanceNumber).
 */
export const updateInstanceDirect = (
  instanceName: string | null | undefined,
  patch: InstanceCachePatch,
): InstanceCacheEntry => {
  const key = normalizeInstanceKey(instanceName);
  const existing = instanceStore.get(key) || ({} as Partial<InstanceCacheEntry>);

  const patchCopy: InstanceCachePatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patchCopy, 'connectedNumber')) {
    if (patchCopy.connectedNumber === null || patchCopy.connectedNumber === undefined) {
      if (existing.connectedNumber) {
        delete patchCopy.connectedNumber;
      }
    } else {
      const n = normalizePhone(patchCopy.connectedNumber) || patchCopy.connectedNumber;
      patchCopy.connectedNumber = n;
    }
  }

  const entry: InstanceCacheEntry = {
    connectedNumber: existing.connectedNumber ?? null,
    connectedName: existing.connectedName ?? null,
    status: existing.status ?? '',
    source: existing.source ?? null,
    ...patchCopy,
    lastUpdate: new Date().toISOString(),
  };

  if (patchCopy.connectedNumber === undefined && existing.connectedNumber) {
    entry.connectedNumber = existing.connectedNumber;
  }

  instanceStore.set(key, entry);
  return entry;
};

/**
 * Reseta o connectedNumber de uma instância (ex: desconexão explícita).
 */
export const clearInstanceNumber = (instanceName: string | null = null): void => {
  const key = normalizeInstanceKey(instanceName);
  const existing = instanceStore.get(key) || ({} as Partial<InstanceCacheEntry>);

  instanceStore.set(key, {
    connectedNumber: null,
    connectedName: existing.connectedName ?? null,
    status: existing.status ?? '',
    lastUpdate: new Date().toISOString(),
    source: 'reset',
  });
};

// ==================== INSPEÇÃO (DEBUG) ====================

/**
 * Retorna snapshot de todas as instâncias (para debug/health endpoint).
 */
export const getAllInstanceStates = (): Record<string, InstanceCacheEntry> => {
  const result: Record<string, InstanceCacheEntry> = {};
  for (const [k, value] of instanceStore.entries()) {
    result[k] = { ...value };
  }
  return result;
};
