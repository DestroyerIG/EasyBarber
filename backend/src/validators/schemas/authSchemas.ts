import { z } from 'zod';
import { passwordSchema } from './common.js';
import { isValidCpfCnpj, normalizeDocumentDigits } from '../../utils/cpfCnpj.js';

const planSchema = z.enum(['basico', 'profissional', 'premium']);

const authConfirmRedirectSchema = z
  .string()
  .trim()
  .url('URL de confirmação inválida')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.pathname.replace(/\/+$/, '') === '/auth/confirm';
    } catch {
      return false;
    }
  }, 'URL de confirmação deve apontar para /auth/confirm')
  .optional();

export const registerSchema = z.object({
  barbershopName: z.string().min(2, 'Nome da barbearia deve ter pelo menos 2 caracteres').max(255),
  ownerName: z.string().min(2, 'Nome do responsável deve ter pelo menos 2 caracteres').max(255),
  email: z.string().email('Email inválido').max(255),
  whatsapp: z.string().min(10, 'WhatsApp inválido').max(20),
  cpfCnpj: z
    .string()
    .trim()
    .min(1, 'CPF/CNPJ é obrigatório')
    .transform((value) => normalizeDocumentDigits(value))
    .refine((value) => value.length === 11 || value.length === 14, {
      message: 'CPF/CNPJ deve ter 11 ou 14 dígitos',
    })
    .refine((value) => isValidCpfCnpj(value), {
      message: 'CPF/CNPJ inválido',
    }),
  password: passwordSchema,
  desiredPlan: planSchema.default('basico'),
  emailRedirectTo: authConfirmRedirectSchema,
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const verificationTokenSchema = z
  .string()
  .trim()
  .min(20, 'Token de verificação inválido')
  .max(512, 'Token de verificação inválido');

export const verifyEmailSchema = z
  .object({
    token: verificationTokenSchema.optional(),
    token_hash: verificationTokenSchema.optional(),
    tokenHash: verificationTokenSchema.optional(),
    type: z
      .string()
      .trim()
      .min(3, 'Tipo de token inválido')
      .max(32, 'Tipo de token inválido')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.token && !data.token_hash && !data.tokenHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Token de verificação inválido',
        path: ['token'],
      });
    }
  })
  .transform((data) => ({
    token: data.token,
    tokenHash: data.token_hash || data.tokenHash,
    type: data.type,
  }));

export const resendVerificationSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  emailRedirectTo: authConfirmRedirectSchema,
});

const accessTokenSchema = z
  .string()
  .trim()
  .min(20, 'Sessão de confirmação inválida')
  .max(4096, 'Sessão de confirmação inválida');

export const verifyEmailSessionSchema = z
  .object({
    accessToken: accessTokenSchema.optional(),
    access_token: accessTokenSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.accessToken && !data.access_token) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sessão de confirmação inválida',
        path: ['accessToken'],
      });
    }
  })
  .transform((data) => ({
    accessToken: data.accessToken || data.access_token,
  }));

export type Register = z.infer<typeof registerSchema>;
export type Login = z.infer<typeof loginSchema>;
export type VerifyEmail = z.infer<typeof verifyEmailSchema>;
export type ResendVerification = z.infer<typeof resendVerificationSchema>;
export type VerifyEmailSession = z.infer<typeof verifyEmailSessionSchema>;
