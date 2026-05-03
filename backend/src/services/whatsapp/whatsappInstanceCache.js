/**
 * whatsappInstanceCache.js
 *
 * Cache centralizado de estado por instância WhatsApp.
 *
 * DESIGN DECISIONS:
 * - Isolamento total: cada instanceName tem seu próprio Map entry
 * - Sem HTTP: apenas leitura/escrita na memória do processo
 * - Atualizado via syncStateFromEvolution e eventos da Evolution API
 * - connectedNumber extraído do payload de evento (sem depender de /instance/me)
 * - Regra: nunca descartar mensagens com base em connectedNumber null
 */

import logger from '../../utils/logger.js';
import { normalizeWhatsAppNumber } from '../../utils/whatsapp.js';

// ==================== ESTRUTURA DO CACHE ====================
// instanceStore[instanceName] = {
//   connectedNumber: string | null,
//   connectedName: string | null,
//   status: string,
//   lastUpdate: ISO string | null,
//   source: 'payload' | 'env' | 'sync' | null,
// }
const instanceStore = new Map();

// ==================== NORMALIZAÇÃO ====================

const normalizeInstanceKey = (instanceName) => {
  if (!instanceName || typeof instanceName !== 'string') return '__default__';
  const trimmed = instanceName.trim().toLowerCase();
  return trimmed || '__default__';
};

const normalizePhone = (value) => {
  if (!value || typeof value !== 'string') return null;
  const digits = value.split('@')[0].replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
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
 * REGRA: NUNCA usar /instance/me (endpoint não garantido).
 * REGRA: NUNCA fazer HTTP aqui.
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
    payload?.owner,
    payload?.ownerJid,
    payload?.wid,
    // Nested data
    payload?.data?.me?.id,
    payload?.data?.me?.wid,
    payload?.data?.instance?.wid,
    payload?.data?.instance?.ownerJid,
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
 * Fallback chain: cache → env var.
 * NÃO faz HTTP.
 */
export const getConnectedNumber = (instanceName = null) => {
  const key = normalizeInstanceKey(instanceName);
  const entry = instanceStore.get(key);

  // 1. Cache em memória
  if (entry?.connectedNumber) {
    return entry.connectedNumber;
  }

  // 2. Fallback: variável de ambiente (apenas se instanceName for o default)
  const envPhone = process.env.WHATSAPP_PHONE || process.env.EVOLUTION_PHONE;
  if (envPhone) {
    const normalized = normalizePhone(envPhone) || normalizeWhatsAppNumber(envPhone);
    if (normalized) {
      logger.debug(
        { instanceName: key, connectedNumber: normalized, source: 'env' },
        'connectedNumber resolvido via variavel de ambiente'
      );
      return normalized;
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

  const connectedNumber = extractConnectedNumberFromPayload(payload);

  // Só atualiza connectedNumber se encontrou um valor — preserva o anterior caso contrário
  const updatedNumber = connectedNumber || existing.connectedNumber || null;

  const entry = {
    ...existing,
    connectedNumber: updatedNumber,
    connectedName: null, // Nome não é crítico para anti-self-reply
    lastUpdate: new Date().toISOString(),
    source,
  };

  instanceStore.set(key, entry);

  logger.debug(
    {
      instanceName: key,
      connectedNumber: updatedNumber,
      extractedFromPayload: connectedNumber,
      source,
    },
    'Cache de instancia atualizado'
  );

  return entry;
};

/**
 * Atualiza o cache diretamente com valores já normalizados.
 * Usado por syncStateFromEvolution após normalizar o número.
 */
export const updateInstanceDirect = (instanceName, patch) => {
  const key = normalizeInstanceKey(instanceName);
  const existing = instanceStore.get(key) || {};

  const entry = {
    ...existing,
    ...patch,
    lastUpdate: new Date().toISOString(),
  };

  // Garante que connectedNumber só é sobrescrito se o novo valor for não-nulo
  // OU se o patch explicitamente tiver connectedNumber: null (reset consciente)
  if (patch.connectedNumber === undefined && existing.connectedNumber) {
    entry.connectedNumber = existing.connectedNumber;
  }

  instanceStore.set(key, entry);
  return entry;
};

/**
 * Reseta o connectedNumber de uma instância (ex: desconexão).
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
  for (const [key, value] of instanceStore.entries()) {
    result[key] = { ...value };
  }
  return result;
};
