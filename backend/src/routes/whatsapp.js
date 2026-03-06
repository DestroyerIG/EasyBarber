import express from 'express';
import { handleWebhook } from '../services/whatsapp/index.js';
import { getWhatsAppStatus, logoutWhatsApp, restartWhatsApp } from '../services/whatsappClient.js';
import { authMiddleware } from '../middleware/auth.js';
import pool from '../config/database.js';
import { sendSuccess, sendCreated } from '../utils/response.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Simulador local (mantido para testes no frontend)
router.post('/webhook', handleWebhook);

// Status da conexão WhatsApp
router.get('/status', authMiddleware, (req, res) => {
    const status = getWhatsAppStatus();
    sendSuccess(res, status);
});

// QR Code para pareamento
router.get('/qr', authMiddleware, (req, res) => {
    const status = getWhatsAppStatus();
    if (status.status === 'qr' && status.qrCode) {
        sendSuccess(res, { qrCode: status.qrCode });
    } else if (status.status === 'connected') {
        sendSuccess(res, { message: 'WhatsApp já está conectado', status: 'connected' });
    } else {
        sendSuccess(res, { message: 'QR Code ainda não disponível', status: status.status });
    }
});

// Desconectar WhatsApp
router.post('/logout', authMiddleware, async (req, res, next) => {
    try {
        const success = await logoutWhatsApp();
        if (success) {
            sendSuccess(res, { message: 'WhatsApp desconectado com sucesso' });
        } else {
            res.status(400).json({ success: false, error: { code: 'WHATSAPP_LOGOUT_FAILED', message: 'Não foi possível desconectar' } });
        }
    } catch (error) {
        next(error);
    }
});

// Reconectar WhatsApp
router.post('/restart', authMiddleware, async (req, res, next) => {
    try {
        await restartWhatsApp();
        sendSuccess(res, { message: 'WhatsApp reiniciando...' });
    } catch (error) {
        next(error);
    }
});

// ==================== CONFIGURAÇÃO DE MENSAGENS ====================

// Buscar configuração de mensagens do bot
router.get('/config', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;

        let config = await pool.query(
            'SELECT * FROM whatsapp_bot_config WHERE barbershop_id = $1',
            [barbershopId]
        );

        if (config.rows.length === 0) {
            config = await pool.query(
                `INSERT INTO whatsapp_bot_config (barbershop_id)
                 VALUES ($1)
                 RETURNING *`,
                [barbershopId]
            );
        }

        sendSuccess(res, config.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Atualizar configuração de mensagens do bot
router.put('/config', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;
        const {
            welcome_header,
            ask_name_message,
            attendant_message,
            confirmation_message,
            reminder_message,
            invalid_option_message,
            session_expired_message,
            end_session_message,
            name_validation_message,
            no_slots_message,
            cancel_no_appointments_message,
            cancel_list_message,
            cancel_success_message,
            reschedule_no_appointments_message,
            reschedule_list_message,
            no_previous_appointments_message,
            rating_question_message,
            rating_confirmation_message,
            promotions_message,
            instagram_message,
        } = req.body;

        const result = await pool.query(
            `INSERT INTO whatsapp_bot_config (
                barbershop_id, welcome_header, ask_name_message, attendant_message,
                confirmation_message, reminder_message, invalid_option_message,
                session_expired_message, end_session_message, name_validation_message,
                no_slots_message, cancel_no_appointments_message, cancel_list_message,
                cancel_success_message, reschedule_no_appointments_message, reschedule_list_message,
                no_previous_appointments_message, rating_question_message, rating_confirmation_message,
                promotions_message, instagram_message, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CURRENT_TIMESTAMP)
            ON CONFLICT (barbershop_id)
            DO UPDATE SET
                welcome_header = COALESCE($2, whatsapp_bot_config.welcome_header),
                ask_name_message = COALESCE($3, whatsapp_bot_config.ask_name_message),
                attendant_message = COALESCE($4, whatsapp_bot_config.attendant_message),
                confirmation_message = COALESCE($5, whatsapp_bot_config.confirmation_message),
                reminder_message = COALESCE($6, whatsapp_bot_config.reminder_message),
                invalid_option_message = COALESCE($7, whatsapp_bot_config.invalid_option_message),
                session_expired_message = COALESCE($8, whatsapp_bot_config.session_expired_message),
                end_session_message = COALESCE($9, whatsapp_bot_config.end_session_message),
                name_validation_message = COALESCE($10, whatsapp_bot_config.name_validation_message),
                no_slots_message = COALESCE($11, whatsapp_bot_config.no_slots_message),
                cancel_no_appointments_message = COALESCE($12, whatsapp_bot_config.cancel_no_appointments_message),
                cancel_list_message = COALESCE($13, whatsapp_bot_config.cancel_list_message),
                cancel_success_message = COALESCE($14, whatsapp_bot_config.cancel_success_message),
                reschedule_no_appointments_message = COALESCE($15, whatsapp_bot_config.reschedule_no_appointments_message),
                reschedule_list_message = COALESCE($16, whatsapp_bot_config.reschedule_list_message),
                no_previous_appointments_message = COALESCE($17, whatsapp_bot_config.no_previous_appointments_message),
                rating_question_message = COALESCE($18, whatsapp_bot_config.rating_question_message),
                rating_confirmation_message = COALESCE($19, whatsapp_bot_config.rating_confirmation_message),
                promotions_message = COALESCE($20, whatsapp_bot_config.promotions_message),
                instagram_message = COALESCE($21, whatsapp_bot_config.instagram_message),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *`,
            [barbershopId, welcome_header, ask_name_message, attendant_message,
                confirmation_message, reminder_message, invalid_option_message,
                session_expired_message, end_session_message, name_validation_message,
                no_slots_message, cancel_no_appointments_message, cancel_list_message,
                cancel_success_message, reschedule_no_appointments_message, reschedule_list_message,
                no_previous_appointments_message, rating_question_message, rating_confirmation_message,
                promotions_message, instagram_message]
        );

        sendSuccess(res, result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Resetar mensagens para padrão
router.post('/config/reset', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;

        await pool.query(
            'DELETE FROM whatsapp_bot_config WHERE barbershop_id = $1',
            [barbershopId]
        );

        const result = await pool.query(
            `INSERT INTO whatsapp_bot_config (barbershop_id)
             VALUES ($1)
             RETURNING *`,
            [barbershopId]
        );

        sendSuccess(res, result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// ==================== OPÇÕES DO MENU DO BOT ====================

const DEFAULT_MENU_OPTIONS = [
    { order: 1, label: 'Agendar um horário', emoji: '💈', handler: 'schedule' },
    { order: 2, label: 'Ver nossos serviços', emoji: '📋', handler: 'view_services' },
    { order: 3, label: 'Cancelar agendamento', emoji: '❌', handler: 'cancel' },
    { order: 4, label: 'Reagendamento', emoji: '🔄', handler: 'reschedule' },
    { order: 5, label: 'Avaliação pós-atendimento', emoji: '⭐', handler: 'rating' },
    { order: 6, label: 'Promoções', emoji: '🎉', handler: 'promotions' },
    { order: 7, label: 'Instagram', emoji: '📱', handler: 'instagram' },
    { order: 8, label: 'Falar com um humano', emoji: '👨‍💼', handler: 'attendant' },
    { order: 9, label: 'Encerrar atendimento', emoji: '🚪', handler: 'end_session' },
];

// Listar opções do menu
router.get('/config/menu', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;

        let result = await pool.query(
            'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
            [barbershopId]
        );

        // Seed defaults se não existem
        if (result.rows.length === 0) {
            for (const opt of DEFAULT_MENU_OPTIONS) {
                await pool.query(
                    `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
                     VALUES ($1, $2, $3, $4, 'system', $5, true)
                     ON CONFLICT (barbershop_id, option_order) DO NOTHING`,
                    [barbershopId, opt.order, opt.label, opt.emoji, opt.handler]
                );
            }
            result = await pool.query(
                'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
                [barbershopId]
            );
        }

        sendSuccess(res, result.rows);
    } catch (error) {
        next(error);
    }
});

// Criar nova opção customizada
router.post('/config/menu', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;
        const { label, emoji, response_message } = req.body;

        if (!label || !response_message) {
            return res.status(400).json({ success: false, error: { message: 'Label e mensagem de resposta são obrigatórios' } });
        }

        // Buscar próxima posição
        const maxOrder = await pool.query(
            'SELECT COALESCE(MAX(option_order), 0) as max_order FROM whatsapp_menu_options WHERE barbershop_id = $1',
            [barbershopId]
        );
        const nextOrder = maxOrder.rows[0].max_order + 1;

        if (nextOrder > 15) {
            return res.status(400).json({ success: false, error: { message: 'Máximo de 15 opções no menu' } });
        }

        const result = await pool.query(
            `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, response_message, active)
             VALUES ($1, $2, $3, $4, 'custom', $5, true)
             RETURNING *`,
            [barbershopId, nextOrder, label, emoji || '', response_message]
        );

        sendCreated(res, result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Atualizar opção do menu
router.put('/config/menu/:id', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;
        const { id } = req.params;
        const { label, emoji, active, response_message } = req.body;

        // Verificar se a opção pertence à barbearia
        const existing = await pool.query(
            'SELECT * FROM whatsapp_menu_options WHERE id = $1 AND barbershop_id = $2',
            [id, barbershopId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: { message: 'Opção não encontrada' } });
        }

        const result = await pool.query(
            `UPDATE whatsapp_menu_options SET
                label = COALESCE($1, label),
                emoji = COALESCE($2, emoji),
                active = COALESCE($3, active),
                response_message = COALESCE($4, response_message),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 AND barbershop_id = $6
             RETURNING *`,
            [label, emoji, active, response_message, id, barbershopId]
        );

        sendSuccess(res, result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Excluir opção customizada
router.delete('/config/menu/:id', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;
        const { id } = req.params;

        // Verificar se a opção existe e é customizada
        const existing = await pool.query(
            'SELECT * FROM whatsapp_menu_options WHERE id = $1 AND barbershop_id = $2',
            [id, barbershopId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, error: { message: 'Opção não encontrada' } });
        }

        if (existing.rows[0].type === 'system') {
            return res.status(400).json({ success: false, error: { message: 'Opções do sistema não podem ser excluídas. Desative-as.' } });
        }

        const deletedOrder = existing.rows[0].option_order;

        await pool.query(
            'DELETE FROM whatsapp_menu_options WHERE id = $1 AND barbershop_id = $2',
            [id, barbershopId]
        );

        // Reordenar opções restantes
        await pool.query(
            `UPDATE whatsapp_menu_options 
             SET option_order = option_order - 1, updated_at = CURRENT_TIMESTAMP
             WHERE barbershop_id = $1 AND option_order > $2`,
            [barbershopId, deletedOrder]
        );

        sendSuccess(res, { message: 'Opção excluída com sucesso' });
    } catch (error) {
        next(error);
    }
});

// Reordenar opções do menu
router.put('/config/menu-reorder', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;
        const { order } = req.body; // Array de IDs na nova ordem

        if (!Array.isArray(order) || order.length === 0) {
            return res.status(400).json({ success: false, error: { message: 'Array de IDs é obrigatório' } });
        }

        // Desabilitar temporariamente a constraint unique para reordenar
        // Usamos valores negativos temporários para evitar conflitos
        for (let i = 0; i < order.length; i++) {
            await pool.query(
                `UPDATE whatsapp_menu_options 
                 SET option_order = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2 AND barbershop_id = $3`,
                [-(i + 1), order[i], barbershopId]
            );
        }
        // Agora converter para positivos
        for (let i = 0; i < order.length; i++) {
            await pool.query(
                `UPDATE whatsapp_menu_options 
                 SET option_order = $1
                 WHERE id = $2 AND barbershop_id = $3`,
                [i + 1, order[i], barbershopId]
            );
        }

        const result = await pool.query(
            'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
            [barbershopId]
        );

        sendSuccess(res, result.rows);
    } catch (error) {
        next(error);
    }
});

// Resetar menu para opções padrão
router.post('/config/menu/reset', authMiddleware, async (req, res, next) => {
    try {
        const { barbershopId } = req.user;

        await pool.query(
            'DELETE FROM whatsapp_menu_options WHERE barbershop_id = $1',
            [barbershopId]
        );

        for (const opt of DEFAULT_MENU_OPTIONS) {
            await pool.query(
                `INSERT INTO whatsapp_menu_options (barbershop_id, option_order, label, emoji, type, handler, active)
                 VALUES ($1, $2, $3, $4, 'system', $5, true)`,
                [barbershopId, opt.order, opt.label, opt.emoji, opt.handler]
            );
        }

        const result = await pool.query(
            'SELECT * FROM whatsapp_menu_options WHERE barbershop_id = $1 ORDER BY option_order ASC',
            [barbershopId]
        );

        sendSuccess(res, result.rows);
    } catch (error) {
        next(error);
    }
});

export default router;
