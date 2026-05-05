/**
 * botOrchestrator.js — Orquestrador de respostas do bot por tenant.
 *
 * TODO: integrar com IA e sistema de agendamentos.
 *
 * Atualmente envia resposta de placeholder confirmando recebimento.
 * initBotOrchestrator() deve ser chamado no startup com a instância do EvolutionClient.
 * Se não inicializado, tenta criar o cliente a partir das variáveis de ambiente.
 */

import logger from '../utils/logger.js';
import { createEvolutionClient } from '../services/whatsapp/client/evolutionClient.js';

let _client = null;

/**
 * Injeta o EvolutionClient. Chamar no startup da aplicação.
 * @param {import('../services/whatsapp/client/evolutionClient.js').EvolutionClient} evolutionClient
 */
export const initBotOrchestrator = (evolutionClient) => {
  _client = evolutionClient;
};

const getClient = () => {
  if (_client) return _client;
  try {
    _client = createEvolutionClient();
    return _client;
  } catch (err) {
    logger.warn({ err: err?.message }, 'botOrchestrator: evolutionClient não inicializado');
    return null;
  }
};

const PLACEHOLDER_REPLY = 'Olá! Recebi sua mensagem. O bot está em configuração.';

/**
 * Processa uma mensagem recebida e envia resposta via WhatsApp.
 *
 * @param {{
 *   barbershopId: string,
 *   authorPhone: string,
 *   text: string,
 *   messageId: string|null,
 *   instanceName: string,
 * }} ctx
 * @returns {Promise<{ ok: boolean, responseSent: boolean }>}
 */
export const process = async ({ barbershopId, authorPhone, text, messageId, instanceName }) => {
  logger.info(
    {
      barbershopId,
      authorLast4: authorPhone?.slice(-4),
      textPreview: text?.slice(0, 50),
      messageId,
      instanceName,
    },
    'botOrchestrator: processing message',
  );

  const client = getClient();
  if (!client) {
    logger.warn({ barbershopId, instanceName }, 'botOrchestrator: no client — response skipped');
    return { ok: true, responseSent: false };
  }

  const result = await client.sendText({
    instanceName,
    to: authorPhone,
    text: PLACEHOLDER_REPLY,
  });

  if (!result.ok) {
    logger.warn(
      { barbershopId, instanceName, error: result.error },
      'botOrchestrator: sendText failed',
    );
    return { ok: true, responseSent: false };
  }

  logger.info(
    { barbershopId, instanceName, authorLast4: authorPhone?.slice(-4) },
    'botOrchestrator: response sent',
  );

  return { ok: true, responseSent: true };
};
