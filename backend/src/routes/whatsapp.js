import express from 'express';
import { handleWebhook } from '../services/whatsappService.js';
import { getWhatsAppStatus, logoutWhatsApp, restartWhatsApp } from '../services/whatsappClient.js';
import { authMiddleware } from '../middleware/auth.js';
import pool from '../config/database.js';

const router = express.Router();

// Simulador local (mantido para testes no frontend)
router.post('/webhook', handleWebhook);

// Status da conexão WhatsApp
router.get('/status', authMiddleware, (req, res) => {
    const status = getWhatsAppStatus();
    res.json(status);
});

// QR Code para pareamento
router.get('/qr', authMiddleware, (req, res) => {
    const status = getWhatsAppStatus();
    if (status.status === 'qr' && status.qrCode) {
        res.json({ qrCode: status.qrCode });
    } else if (status.status === 'connected') {
        res.json({ message: 'WhatsApp já está conectado', status: 'connected' });
    } else {
        res.json({ message: 'QR Code ainda não disponível', status: status.status });
    }
});

// Desconectar WhatsApp
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        const success = await logoutWhatsApp();
        if (success) {
            res.json({ success: true, message: 'WhatsApp desconectado com sucesso' });
        } else {
            res.status(400).json({ success: false, message: 'Não foi possível desconectar' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao desconectar' });
    }
});

// Reconectar WhatsApp
router.post('/restart', authMiddleware, async (req, res) => {
    try {
        await restartWhatsApp();
        res.json({ success: true, message: 'WhatsApp reiniciando...' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao reiniciar' });
    }
});

// ==================== CONFIGURAÇÃO DE MENSAGENS ====================

// Buscar configuração de mensagens do bot
router.get('/config', authMiddleware, async (req, res) => {
    try {
        const { barbershopId } = req.user;

        let config = await pool.query(
            'SELECT * FROM whatsapp_bot_config WHERE barbershop_id = $1',
            [barbershopId]
        );

        if (config.rows.length === 0) {
            // Criar configuração padrão
            config = await pool.query(
                `INSERT INTO whatsapp_bot_config (barbershop_id)
                 VALUES ($1)
                 RETURNING *`,
                [barbershopId]
            );
        }

        res.json(config.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar config do bot:', error);
        res.status(500).json({ error: 'Erro ao buscar configuração' });
    }
});

// Atualizar configuração de mensagens do bot
router.put('/config', authMiddleware, async (req, res) => {
    try {
        const { barbershopId } = req.user;
        const {
            welcome_message,
            ask_name_message,
            attendant_message,
            confirmation_message,
            reminder_message,
            invalid_option_message,
            session_expired_message
        } = req.body;

        // Upsert - inserir ou atualizar
        const result = await pool.query(
            `INSERT INTO whatsapp_bot_config (
                barbershop_id, welcome_message, ask_name_message, attendant_message,
                confirmation_message, reminder_message, invalid_option_message,
                session_expired_message, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            ON CONFLICT (barbershop_id)
            DO UPDATE SET
                welcome_message = COALESCE($2, whatsapp_bot_config.welcome_message),
                ask_name_message = COALESCE($3, whatsapp_bot_config.ask_name_message),
                attendant_message = COALESCE($4, whatsapp_bot_config.attendant_message),
                confirmation_message = COALESCE($5, whatsapp_bot_config.confirmation_message),
                reminder_message = COALESCE($6, whatsapp_bot_config.reminder_message),
                invalid_option_message = COALESCE($7, whatsapp_bot_config.invalid_option_message),
                session_expired_message = COALESCE($8, whatsapp_bot_config.session_expired_message),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *`,
            [barbershopId, welcome_message, ask_name_message, attendant_message,
                confirmation_message, reminder_message, invalid_option_message,
                session_expired_message]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao atualizar config do bot:', error);
        res.status(500).json({ error: 'Erro ao atualizar configuração' });
    }
});

// Resetar mensagens para padrão
router.post('/config/reset', authMiddleware, async (req, res) => {
    try {
        const { barbershopId } = req.user;

        await pool.query(
            'DELETE FROM whatsapp_bot_config WHERE barbershop_id = $1',
            [barbershopId]
        );

        // Recriar com valores padrão
        const result = await pool.query(
            `INSERT INTO whatsapp_bot_config (barbershop_id)
             VALUES ($1)
             RETURNING *`,
            [barbershopId]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao resetar config do bot:', error);
        res.status(500).json({ error: 'Erro ao resetar configuração' });
    }
});

export default router;
