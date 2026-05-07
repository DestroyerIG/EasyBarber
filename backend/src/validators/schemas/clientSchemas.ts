import { z } from 'zod';

const emptyToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return (value as string | null | undefined) ?? null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const optionalNullable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(emptyToNull, schema.nullable().optional());

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

export type CreateClient = z.infer<typeof createClientSchema>;
export type UpdateClient = z.infer<typeof updateClientSchema>;
