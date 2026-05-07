/**
 * botOrchestrator.ts — Orquestrador de respostas do bot por tenant.
 *
 * TODO: integrar com IA e sistema de agendamentos.
 *
 * Atualmente envia resposta de placeholder confirmando recebimento.
 * initBotOrchestrator() deve ser chamado no startup com a instância do EvolutionClient.
 * Se não inicializado, tenta criar o cliente a partir das variáveis de ambiente.
 */

import logger from '../utils/logger.js';
// @ts-ignore — evolutionClient is untyped JS module
import { createEvolutionClient } from '../services/whatsapp/client/evolutionClient.js';

// @ts-ignore — untyped JS class
type EvolutionClient = {
  sendText(params: { instanceName: string; to: string; text: string }): Promise<{
    ok: boolean;
    data?: unknown;
    error?: unknown;
  }>;
};

let _client: EvolutionClient | null = null;

/**
 * Injeta o EvolutionClient. Chamar no startup da aplicação.
 */
export const initBotOrchestrator = (evolutionClient: EvolutionClient): void => {
  _client = evolutionClient;
};

const getClient = (): EvolutionClient | null => {
  if (_client) return _client;
  try {
    _client = createEvolutionClient() as EvolutionClient;
    return _client;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, 'botOrchestrator: evolutionClient não inicializado');
    return null;
  }
};

const PLACEHOLDER_REPLY = 'Olá! Recebi sua mensagem. O bot está em configuração.';

interface BotProcessContext {
  barbershopId: string;
  authorPhone: string;
  text: string;
  messageId: string | null;
  instanceName: string;
}

interface BotProcessResult {
  ok: boolean;
  responseSent: boolean;
}

/**
 * Processa uma mensagem recebida e envia resposta via WhatsApp.
 */
export const process = async ({
  barbershopId,
  authorPhone,
  text,
  messageId,
  instanceName,
}: BotProcessContext): Promise<BotProcessResult> => {
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
