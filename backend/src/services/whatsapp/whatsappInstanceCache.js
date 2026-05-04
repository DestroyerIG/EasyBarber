/**
 * whatsappInstanceCache.js
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
// instanceStore[instanceName] = {
//   connectedNumber: string | null,
//   connectedName: string | null,
//   status: string,
//   lastUpdate: ISO string | null,
//   source: 'payload' | 'env' | 'sync' | null,
// }
const instanceStore = new Map();

// ==================== NORMALIZAÇÃO DE CHAVE ====================

const normalizeInstanceKey = (instanceName) => {
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
export const extractConnectedNumberFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const candidates = [
    // Evolution v2+
    payload?.me?.id,
    payload?.me?.wid,
    payload?.me?.number,
    payload?.me?.phone,
    // Evolution v1
    payload?.instance?.wid,
    payload?.instance?.id,
    payload?.instance?.ownerJid,
    payload?.instance?.owner,
    payload?.instance?.number,
    payload?.instance?.phone,
    // Campos raiz comuns
    payload?.id,
    payload?.owner,
    payload?.ownerJid,
    payload?.wid,
    payload?.number,
    payload?.phone,
    // Nested data
    payload?.data?.id,
    payload?.data?.wid,
    payload?.data?.number,
    payload?.data?.phone,
    payload?.data?.me?.id,
    payload?.data?.me?.wid,
    payload?.data?.me?.number,
    payload?.data?.me?.phone,
    payload?.data?.instance?.wid,
    payload?.data?.instance?.ownerJid,
    payload?.data?.instance?.number,
    payload?.data?.instance?.phone,
    payload?.data?.owner,
    payload?.data?.wid,
    // Profile
    payload?.profile?.wid,
    payload?.profile?.id,
  ];

  for (const candidate of candidates) {
    const phone = normalizePhone(candidate);
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
export const getConnectedNumber = (instanceName = null) => {
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
export const getInstanceState = (instanceName = null) => {
  const key = normalizeInstanceKey(instanceName);
  return instanceStore.get(key) || null;
};

// ==================== ESCRITA NO CACHE ====================

/**
 * Atualiza o cache de uma instância a partir do payload de evento.
 * Extrai o connectedNumber automaticamente.
 * Chamado em eventos de conexão e durante syncStateFromEvolution.
 */
export const updateInstanceFromPayload = (instanceName, payload, source = 'payload') => {
  const key = normalizeInstanceKey(instanceName);
  const existing = instanceStore.get(key) || {};

  const extracted = extractConnectedNumberFromPayload(payload);
  const updatedNumber = extracted || existing.connectedNumber || null;

  const entry = {
    ...existing,
    connectedNumber: updatedNumber,
    connectedName: null,
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
export const updateInstanceDirect = (instanceName, patch) => {
  const key = normalizeInstanceKey(instanceName);
  const existing = instanceStore.get(key) || {};

  const patchCopy = { ...patch };
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

  const entry = {
    ...existing,
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
export const clearInstanceNumber = (instanceName = null) => {
  const key = normalizeInstanceKey(instanceName);
  const existing = instanceStore.get(key) || {};

  instanceStore.set(key, {
    ...existing,
    connectedNumber: null,
    lastUpdate: new Date().toISOString(),
    source: 'reset',
  });
};

// ==================== INSPEÇÃO (DEBUG) ====================

/**
 * Retorna snapshot de todas as instâncias (para debug/health endpoint).
 */
export const getAllInstanceStates = () => {
  const result = {};
  for (const [k, value] of instanceStore.entries()) {
    result[k] = { ...value };
  }
  return result;
};
