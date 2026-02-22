import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import { handleIncomingMessage } from './whatsappService.js';

// Estado global do cliente
let client = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'qr' | 'connecting' | 'connected'
let qrCodeData = null; // Base64 da imagem do QR Code
let lastError = null;   // Último erro para debug

/**
 * Inicializa o cliente WhatsApp com whatsapp-web.js
 */
export const initWhatsApp = async () => {
    if (!process.env.WHATSAPP_ENABLED || process.env.WHATSAPP_ENABLED !== 'true') {
        console.log('⚠️  WhatsApp Bot desativado (WHATSAPP_ENABLED != true)');
        return;
    }

    console.log('🤖 Inicializando WhatsApp Bot com whatsapp-web.js...');
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

        // Evento: QR Code gerado (precisa ser escaneado)
        client.on('qr', async (qr) => {
            console.log('📱 QR Code gerado! Escaneie com seu WhatsApp.');
            connectionStatus = 'qr';

            try {
                // QR code preto no fundo branco — cores padrão para máxima visibilidade
                qrCodeData = await QRCode.toDataURL(qr, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                console.log('✅ QR Code base64 gerado com sucesso');
            } catch (err) {
                console.error('❌ Erro ao gerar QR Code imagem:', err);
            }
        });

        // Evento: Conectando
        client.on('loading_screen', (percent) => {
            connectionStatus = 'connecting';
            console.log(`⏳ Carregando WhatsApp... ${percent}%`);
        });

        // Evento: Autenticado com sucesso
        client.on('authenticated', () => {
            console.log('🔐 WhatsApp autenticado!');
            connectionStatus = 'connecting';
        });

        // Evento: Cliente pronto
        client.on('ready', () => {
            console.log('✅ WhatsApp Bot conectado e pronto!');
            connectionStatus = 'connected';
            qrCodeData = null;

            const info = client.info;
            if (info) {
                console.log(`📞 Número: ${info.wid.user}`);
                console.log(`👤 Nome: ${info.pushname}`);
            }
        });

        // Evento: Desconectado
        client.on('disconnected', (reason) => {
            console.log('❌ WhatsApp desconectado:', reason);
            connectionStatus = 'disconnected';
            qrCodeData = null;
            client = null;
        });

        // Evento: Falha na autenticação
        client.on('auth_failure', (msg) => {
            console.error('❌ Falha na autenticação do WhatsApp:', msg);
            connectionStatus = 'disconnected';
            lastError = 'Falha na autenticação: ' + msg;
        });

        // Evento: Mensagem recebida
        client.on('message', async (message) => {
            try {
                // Ignorar mensagens de grupo e status
                if (message.from.includes('@g.us') || message.from === 'status@broadcast') {
                    return;
                }

                const phone = message.from.replace('@c.us', '');
                const text = message.body;

                console.log(`📩 Mensagem recebida de ${phone}: ${text}`);

                await handleIncomingMessage(phone, text);
            } catch (error) {
                console.error('❌ Erro ao processar mensagem recebida:', error);
            }
        });

        // Inicializar o cliente
        await client.initialize();
    } catch (error) {
        console.error('❌ Erro ao inicializar WhatsApp:', error.message);
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
            console.log('👋 WhatsApp desconectado pelo usuário');
            return true;
        } catch (error) {
            console.error('❌ Erro ao desconectar WhatsApp:', error);
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
