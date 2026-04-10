/**
 * Barrel — re-exporta as 3 funções públicas do módulo WhatsApp.
 */

export { handleIncomingMessage, handleWebhook } from './whatsappFlowService.js';
export { sendWhatsAppMessage } from './whatsappMessageService.js';