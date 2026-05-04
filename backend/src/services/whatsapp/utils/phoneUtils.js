/**
 * phoneUtils.js
 *
 * Utilitários de telefone para mensagens WhatsApp / Evolution API.
 *
 * Decisão de design para isSelfMessage:
 *   A Evolution API v1 pode reportar o sender em formato sem o "9" obrigatório
 *   (ex: 558396311811), enquanto o connectedNumber está salvo com o "9"
 *   (ex: 5583996311811). A função canonical() remove o "9" de prefixo apenas
 *   de números de 10 dígitos (sem 55), fazendo esses dois valores normalizarem
 *   para formas DIFERENTES — evitando o falso-positivo de auto-resposta.
 *
 *   Números de 11 dígitos (DDD + 9 + 8 dígitos locais) NÃO têm o 9 removido,
 *   logo 83996311811 permanece como está. Isso é intencional: o barbeiro tem
 *   número de 11 dígitos; o cliente com 10 dígitos é uma pessoa diferente.
 */

// ── Extração ──────────────────────────────────────────────────────────────────

/**
 * Extrai o número de um JID do WhatsApp.
 * Retorna null para JIDs @lid — número real deve vir do campo `sender`.
 *
 * @param {string} jid  Ex: "5583996311811@s.whatsapp.net"
 * @returns {string|null}
 */
export const extractPhoneFromJid = (jid) => {
  if (!jid || typeof jid !== 'string') return null;
  const atIndex = jid.indexOf('@');
  if (atIndex === -1) return null;
  const suffix = jid.slice(atIndex + 1);
  if (suffix === 'lid') return null;
  const local = jid.slice(0, atIndex).replace(/\D/g, '');
  return local || null;
};

// ── Normalização ──────────────────────────────────────────────────────────────

/**
 * Normaliza número bruto para formato canônico sem country code.
 * - Apenas dígitos
 * - Remove prefixo 55 quando o número tem 12-13 dígitos (E.164 completo)
 * - NÃO adiciona nem remove o "9" — preserva o número como chegou
 *
 * @param {string|null} raw
 * @returns {string|null}
 */
export const normalizePhone = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.length >= 12 && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
};

// ── Detecção de auto-resposta ─────────────────────────────────────────────────

/**
 * Retorna true se author e connected representam o mesmo número (bot respondendo
 * a si mesmo).
 *
 * Forma canônica para comparação:
 *   1. Apenas dígitos
 *   2. Remove country code 55
 *   3. Para números de 10 dígitos (DDD + 9 + 7 locais): remove o "9" de prefixo
 *      → resulta em 9 dígitos
 *   Números de 11 dígitos NÃO sofrem a remoção do 9 → formas diferentes = não self.
 *
 * Exemplo:
 *   558396311811 → sem 55 = 8396311811 (10d) → regex → 836311811 (9d)
 *   5583996311811 → sem 55 = 83996311811 (11d) → fica 83996311811
 *   836311811 ≠ 83996311811 → isSelf = false  ✓ (cliente ≠ bot)
 *
 * @param {string} authorRaw
 * @param {string} connectedRaw
 * @returns {boolean}
 */
export const isSelfMessage = (authorRaw, connectedRaw) => {
  if (!authorRaw || !connectedRaw) return false;
  const canonical = (n) =>
    String(n)
      .replace(/\D/g, '')
      .replace(/^55/, '')
      .replace(/^(\d{2})9(\d{7})$/, '$1$2');
  return canonical(authorRaw) === canonical(connectedRaw);
};

// ── Resolução do autor ────────────────────────────────────────────────────────

/**
 * Resolve o número do autor de um payload de webhook Evolution API.
 *
 * Ordem de prioridade:
 *   1. key.participant (mensagens de grupo — participant = quem enviou)
 *   2. key.remoteJid terminado em @s.whatsapp.net (chat direto)
 *   3. sender quando remoteJid termina em @lid (formato LID do WhatsApp)
 *   4. sender como fallback geral
 *
 * Retorna objeto com:
 *   phone    — número E.164 sem formatação (inclui 55) ou null
 *   source   — string descrevendo de onde veio o número
 *   isFromMe — true se key.fromMe === true (mensagem do próprio bot)
 *
 * @param {object} payload  Payload bruto da Evolution API
 * @returns {{ phone: string|null, source: string, isFromMe: boolean }}
 */
export const resolveAuthorPhone = (payload) => {
  const data = payload?.data || payload;
  const key = data?.key || payload?.key || {};
  const fromMe = key?.fromMe === true;

  if (fromMe) {
    return { phone: null, source: 'fromMe', isFromMe: true };
  }

  const remoteJid = key?.remoteJid || null;
  const participant = key?.participant || null;
  const sender = payload?.sender || data?.sender || null;

  // 1. Grupos: participant = remetente real
  if (participant && !participant.endsWith('@lid')) {
    const phone = extractPhoneFromJid(participant);
    if (phone) return { phone, source: 'participant', isFromMe: false };
  }

  // 2. Chat direto (JID padrão)
  if (remoteJid?.endsWith('@s.whatsapp.net')) {
    const phone = extractPhoneFromJid(remoteJid);
    if (phone) return { phone, source: 'remoteJid', isFromMe: false };
  }

  // 3. LID: número real no campo sender
  if (remoteJid?.endsWith('@lid') && sender) {
    const phone = extractPhoneFromJid(sender);
    if (phone) return { phone, source: 'sender_lid', isFromMe: false };
  }

  // 4. Fallback: campo sender
  if (sender) {
    const phone = extractPhoneFromJid(sender);
    if (phone) return { phone, source: 'sender', isFromMe: false };
  }

  return { phone: null, source: 'unresolved', isFromMe: false };
};
