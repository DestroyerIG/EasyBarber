import nodemailer from 'nodemailer';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

let transporter = null;

const getFrontendBaseUrl = () => {
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  return baseUrl.replace(/\/+$/, '');
};

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  const hasAuth = Boolean(user && pass);
  const isConfigured = Boolean(host && Number.isFinite(port) && from);

  return {
    host,
    port,
    user,
    pass,
    from,
    hasAuth,
    isConfigured,
  };
};

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  const config = getSmtpConfig();

  if (!config.isConfigured) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    ...(config.hasAuth
      ? {
          auth: {
            user: config.user,
            pass: config.pass,
          },
        }
      : {}),
  });

  return transporter;
};

const buildVerificationUrl = ({ token, email }) => {
  const verifyUrl = new URL('/verificar-email', getFrontendBaseUrl());
  verifyUrl.searchParams.set('token', token);

  if (email) {
    verifyUrl.searchParams.set('email', email);
  }

  return verifyUrl.toString();
};

const buildEmailTemplate = ({ verificationUrl, barbershopName, ownerName }) => {
  const greetingName = ownerName || 'Tudo bem';
  const shopLabel = barbershopName ? ` da ${barbershopName}` : '';

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #111827;">Confirme seu e-mail no EasyBarber</h2>
      <p style="margin: 0 0 12px;">Olá, ${greetingName}.</p>
      <p style="margin: 0 0 20px;">Recebemos seu cadastro${shopLabel}. Para ativar sua conta, confirme seu e-mail no botão abaixo:</p>

      <p style="margin: 0 0 24px;">
        <a href="${verificationUrl}" style="display: inline-block; background: #f97316; color: #111827; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 10px;">
          Confirmar e-mail
        </a>
      </p>

      <p style="margin: 0 0 12px; color: #4b5563;">Se o botão não funcionar, copie e cole este link no navegador:</p>
      <p style="margin: 0 0 20px; word-break: break-all;"><a href="${verificationUrl}">${verificationUrl}</a></p>

      <p style="margin: 0; color: #6b7280; font-size: 13px;">Se você não criou esta conta, pode ignorar esta mensagem.</p>
    </div>
  `;

  const text = [
    'Confirme seu e-mail no EasyBarber',
    '',
    `Olá, ${greetingName}.`,
    '',
    'Recebemos seu cadastro. Para ativar sua conta, confirme seu e-mail no link abaixo:',
    verificationUrl,
    '',
    'Se você não criou esta conta, pode ignorar esta mensagem.',
  ].join('\n');

  return { html, text };
};

export const emailService = {
  buildVerificationUrl,

  async sendAccountVerificationEmail({ to, token, barbershopName, ownerName }) {
    const verificationUrl = buildVerificationUrl({ token, email: to });
    const config = getSmtpConfig();

    if (!config.isConfigured) {
      if (process.env.NODE_ENV === 'production') {
        throw new AppError(
          'Configuração SMTP incompleta. Verifique as variáveis SMTP_*.',
          503,
          'SMTP_NOT_CONFIGURED'
        );
      }

      logger.warn(
        { email: to },
        'SMTP não configurado em ambiente não produtivo. Link de verificação será apenas logado.'
      );
      logger.info({ email: to, verificationUrl }, 'Link de verificação gerado (modo desenvolvimento)');

      return {
        delivered: false,
        mode: 'log',
      };
    }

    const mailTransport = getTransporter();

    if (!mailTransport) {
      throw new AppError(
        'Transporte SMTP indisponível para envio de e-mail.',
        503,
        'SMTP_UNAVAILABLE'
      );
    }

    const { html, text } = buildEmailTemplate({ verificationUrl, barbershopName, ownerName });

    try {
      await mailTransport.sendMail({
        from: config.from,
        to,
        subject: 'Confirme seu e-mail no EasyBarber',
        html,
        text,
      });

      return {
        delivered: true,
        mode: 'smtp',
      };
    } catch (error) {
      logger.error({ err: error, email: to }, 'Falha ao enviar e-mail de verificação via SMTP');
      throw new AppError(
        'Não foi possível enviar o e-mail de verificação no momento.',
        502,
        'EMAIL_DELIVERY_FAILED'
      );
    }
  },
};
