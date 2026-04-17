import { z } from 'zod';

const emptyToNull = (value) => {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const optionalNullable = (schema) => z.preprocess(emptyToNull, schema.nullable().optional());

export const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Nome é obrigatório').max(255),
  phone: z.string().trim().min(8, 'Telefone é obrigatório').max(20),
  email: optionalNullable(z.string().email('Email inválido')),
  birthDate: optionalNullable(z.string()),
  address: optionalNullable(z.string().max(500)),
  notes: optionalNullable(z.string().max(1000)),
});

export const updateClientSchema = z.object({
  name: z.string().trim().min(2, 'Nome é obrigatório').max(255).optional(),
  phone: z.string().trim().min(8, 'Telefone é obrigatório').max(20).optional(),
  email: optionalNullable(z.string().email('Email inválido')),
  birthDate: optionalNullable(z.string()),
  address: optionalNullable(z.string().max(500)),
  notes: optionalNullable(z.string().max(1000)),
});
