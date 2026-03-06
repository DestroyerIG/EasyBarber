import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import { handleIncomingMessage } from './whatsapp/index.js';
import logger from '../utils/logger.js';

// Estado global do cliente
let client = null;
let connectionStatus = 'disconnected';
let qrCodeData = null;
let lastError = null;

export const initWhatsApp = async () => {
    if (!process.env.WHATSAPP_ENABLED || process.env.WHATSAPP_ENABLED !== 'true') {
        logger.info('WhatsApp Bot desativado (WHATSAPP_ENABLED != true)');
        return;
    }

    logger.info('Inicializando WhatsApp Bot...');
    connectionStatus = 'connecting';
    lastError = null;

    try {
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './whatsapp-auth'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-gpu'
                ]
            }
        });

        client.on('qr', async (qr) => {
            logger.info('QR Code gerado - escaneie com WhatsApp');
            connectionStatus = 'qr';

            try {
                qrCodeData = await QRCode.toDataURL(qr, {
                    width: 300,
                    margin: 2,
                    color: { dark: '#000000', light: '#FFFFFF' }
                });
            } catch (err) {
                logger.error({ err }, 'Erro ao gerar QR Code imagem');
            }
        });

        client.on('loading_screen', (percent) => {
            connectionStatus = 'connecting';
            logger.debug({ percent }, 'Carregando WhatsApp');
        });

        client.on('authenticated', () => {
            logger.info('WhatsApp autenticado');
            connectionStatus = 'connecting';
        });

        client.on('ready', () => {
            logger.info('WhatsApp Bot conectado e pronto');
            connectionStatus = 'connected';
            qrCodeData = null;

            const info = client.info;
            if (info) {
                logger.info({ number: info.wid.user, name: info.pushname }, 'WhatsApp conectado');
            }
        });

        client.on('disconnected', (reason) => {
            logger.warn({ reason }, 'WhatsApp desconectado');
            connectionStatus = 'disconnected';
            qrCodeData = null;
            client = null;
        });

        client.on('auth_failure', (msg) => {
            logger.error({ msg }, 'Falha na autenticação do WhatsApp');
            connectionStatus = 'disconnected';
            lastError = 'Falha na autenticação: ' + msg;
        });

        client.on('message', async (message) => {
            try {
                if (message.from.includes('@g.us') || message.from === 'status@broadcast') {
                    return;
                }

                const phone = message.from.replace('@c.us', '');
                const text = message.body;

                logger.debug({ phone }, 'Mensagem recebida');

                await handleIncomingMessage(phone, text);
            } catch (error) {
                logger.error({ err: error }, 'Erro ao processar mensagem recebida');
            }
        });

        await client.initialize();
    } catch (error) {
        logger.error({ err: error }, 'Erro ao inicializar WhatsApp');
        lastError = error.message;
        connectionStatus = 'disconnected';
    }
};

/**
 * Retorna o status atual da conexão WhatsApp
 */
export const getWhatsAppStatus = () => {
    return {
        status: connectionStatus,
        qrCode: qrCodeData,
        error: lastError,
        connectedNumber: connectionStatus === 'connected' && client?.info
            ? client.info.wid.user
            : null,
        connectedName: connectionStatus === 'connected' && client?.info
            ? client.info.pushname
            : null
    };
};

/**
 * Retorna a instância do cliente WhatsApp
 */
export const getWhatsAppClient = () => client;

/**
 * Desconecta o cliente WhatsApp
 */
export const logoutWhatsApp = async () => {
    if (client) {
        try {
            await client.logout();
            connectionStatus = 'disconnected';
            qrCodeData = null;
            logger.info('WhatsApp desconectado pelo usuário');
            return true;
        } catch (error) {
            logger.error({ err: error }, 'Erro ao desconectar WhatsApp');
            return false;
        }
    }
    return false;
};

/**
 * Reinicia o cliente WhatsApp (reconectar)
 */
export const restartWhatsApp = async () => {
    if (client) {
        try {
            await client.destroy();
        } catch (e) {
            // ignore
        }
        client = null;
    }
    connectionStatus = 'disconnected';
    qrCodeData = null;
    lastError = null;
    // Não usar await aqui para não bloquear a resposta HTTP
    initWhatsApp();
};
