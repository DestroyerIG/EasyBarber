import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

const normalizeCpfCnpj = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D+/g, '');
  if (digits.length !== 11 && digits.length !== 14) return null;
  return digits;
};

const uuidOrNull = (value: string | null | undefined): Prisma.Sql =>
  value ? Prisma.sql`${value}::uuid` : Prisma.sql`NULL::uuid`;

const timestampOrNull = (value: string | null | undefined): Prisma.Sql =>
  value ? Prisma.sql`${value}::timestamp` : Prisma.sql`NULL::timestamp`;

/**
 * Prisma wraps raw query PostgreSQL errors as PrismaClientKnownRequestError
 * with code 'P2010' and the real pg error code in meta.code.
 * Direct pg errors surface as code '42703'. We handle both.
 */
const isColumnMissingError = (error: any): boolean =>
  error?.code === '42703' ||
  (error?.code === 'P2010' && String(error?.meta?.code) === '42703');

// ---------------------------------------------------------------------------
// upsertManagedUser (função interna reutilizada por upsertPlatformAdminUser
// e upsertTenantAdminUser)
// ---------------------------------------------------------------------------

const upsertManagedUser = async (
  _client: unknown = null,
  {
    barbershopId,
    email,
    passwordHash,
    role,
    supabaseUserId = null,
    emailVerified = true,
    authProvider = 'supabase',
  }: {
    barbershopId: string;
    email: string;
    passwordHash: string;
    role: string;
    supabaseUserId?: string | null;
    emailVerified?: boolean;
    authProvider?: string;
  }
): Promise<Record<string, unknown> | null> => {
  try {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO users (
        barbershop_id, email, password_hash, role, blocked, blocked_at, blocked_reason,
        email_verified, email_verified_at, supabase_user_id, auth_provider, last_identity_sync_at
      )
      VALUES (
        ${barbershopId}::uuid, ${email}, ${passwordHash}, ${role},
        false, NULL, NULL,
        ${emailVerified},
        CASE WHEN ${emailVerified} THEN NOW() ELSE NULL END,
        ${uuidOrNull(supabaseUserId)}, ${authProvider}, NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        barbershop_id         = EXCLUDED.barbershop_id,
        password_hash         = EXCLUDED.password_hash,
        role                  = EXCLUDED.role,
        blocked               = false,
        blocked_at            = NULL,
        blocked_reason        = NULL,
        email_verified        = EXCLUDED.email_verified,
        email_verified_at     = CASE
          WHEN EXCLUDED.email_verified THEN COALESCE(users.email_verified_at, NOW())
          ELSE NULL
        END,
        supabase_user_id      = COALESCE(EXCLUDED.supabase_user_id, users.supabase_user_id),
        auth_provider         = EXCLUDED.auth_provider,
        last_identity_sync_at = NOW()
      RETURNING
        id, email, role, barbershop_id, blocked, email_verified,
        supabase_user_id, auth_provider, last_identity_sync_at
    `);
    return result[0] ?? null;
  } catch (error: any) {
    if (!isColumnMissingError(error)) throw error;

    const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO users (barbershop_id, email, password_hash, role, blocked)
      VALUES (${barbershopId}::uuid, ${email}, ${passwordHash}, ${role}, false)
      ON CONFLICT (email) DO UPDATE SET
        barbershop_id = EXCLUDED.barbershop_id,
        password_hash = EXCLUDED.password_hash,
        role          = EXCLUDED.role,
        blocked       = false
      RETURNING id, email, role, barbershop_id, blocked
    `);
    return legacyResult[0] ?? null;
  }
};

// ---------------------------------------------------------------------------
// authRepository
// ---------------------------------------------------------------------------

export const authRepository = {

  // -------------------------------------------------------------------------
  // Busca de usuários
  // -------------------------------------------------------------------------

  async findUserByEmail(email: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.password_hash, u.role, u.blocked,
          u.email_verified, u.email_verified_at,
          u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
          u.supabase_user_id, u.auth_provider, u.last_identity_sync_at,
          b.plan, b.desired_plan, b.name AS barbershop_name, b.id AS barbershop_id,
          b.subscription_status, b.subscription_current_period_end
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
          AND b.active    = true
          AND u.blocked   = false
        LIMIT 1
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.password_hash, u.role, u.blocked,
          u.email_verified, u.email_verified_at,
          u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
          NULL::UUID        AS supabase_user_id,
          'legacy'::VARCHAR AS auth_provider,
          NULL::TIMESTAMP   AS last_identity_sync_at,
          b.plan, NULL::VARCHAR AS desired_plan, b.name AS barbershop_name, b.id AS barbershop_id,
          b.subscription_status, b.subscription_current_period_end
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
          AND b.active    = true
          AND u.blocked   = false
        LIMIT 1
      `);
      return legacyResult[0] ?? null;
    }
  },

  async findUserByEmailIncludingBlocked(email: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.password_hash, u.role, u.blocked,
          u.email_verified, u.email_verified_at,
          u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
          u.supabase_user_id, u.auth_provider, u.last_identity_sync_at,
          b.plan, b.desired_plan, b.name AS barbershop_name, b.id AS barbershop_id,
          b.subscription_status, b.subscription_current_period_end
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
          AND b.active = true
        LIMIT 1
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.password_hash, u.role, u.blocked,
          u.email_verified, u.email_verified_at,
          u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
          NULL::UUID        AS supabase_user_id,
          'legacy'::VARCHAR AS auth_provider,
          NULL::TIMESTAMP   AS last_identity_sync_at,
          b.plan, NULL::VARCHAR AS desired_plan, b.name AS barbershop_name, b.id AS barbershop_id,
          b.subscription_status, b.subscription_current_period_end
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
          AND b.active = true
        LIMIT 1
      `);
      return legacyResult[0] ?? null;
    }
  },

  async findUserBySupabaseUserId(supabaseUserId: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.password_hash, u.role, u.blocked,
          u.email_verified, u.email_verified_at,
          u.supabase_user_id, u.auth_provider, u.last_identity_sync_at,
          b.plan, b.desired_plan, b.name AS barbershop_name, b.id AS barbershop_id,
          b.subscription_status, b.subscription_current_period_end
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE u.supabase_user_id = ${supabaseUserId}::uuid
          AND b.active = true
        LIMIT 1
      `);
      return result[0] ?? null;
    } catch (error: any) {
      // Prisma errors on raw queries are wrapped in a PrismaClientKnownRequestError (P2010)
      // The actual database error code is found in error.meta.code
      const isColumnMissing = isColumnMissingError(error);

      if (isColumnMissing) {
        // Se a coluna supabase_user_id não existe, é impossível o usuário existir por ela
        return null;
      }
      throw error;
    }
  },

  async findAnyUserByEmail(email: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.barbershop_id, u.blocked,
          u.email_verified, u.email_verified_at,
          u.supabase_user_id, u.auth_provider,
          b.active AS barbershop_active
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
        LIMIT 1
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.barbershop_id, u.blocked,
          u.email_verified, u.email_verified_at,
          NULL::UUID        AS supabase_user_id,
          'legacy'::VARCHAR AS auth_provider,
          b.active AS barbershop_active
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
        LIMIT 1
      `);
      return legacyResult[0] ?? null;
    }
  },

  async findOtherUserByEmail(email: string, excludedUserId: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.barbershop_id, u.blocked,
          u.email_verified, u.email_verified_at,
          u.supabase_user_id, u.auth_provider,
          b.active AS barbershop_active
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
          AND u.id <> ${excludedUserId}::uuid
        LIMIT 1
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          u.id, u.email, u.barbershop_id, u.blocked,
          u.email_verified, u.email_verified_at,
          NULL::UUID        AS supabase_user_id,
          'legacy'::VARCHAR AS auth_provider,
          b.active AS barbershop_active
        FROM users u
        JOIN barbershops b ON u.barbershop_id = b.id
        WHERE LOWER(u.email) = LOWER(${email})
          AND u.id <> ${excludedUserId}::uuid
        LIMIT 1
      `);
      return legacyResult[0] ?? null;
    }
  },

  // -------------------------------------------------------------------------
  // Busca com FOR UPDATE (usadas dentro de transações explícitas da aplicação)
  // NOTA: _client é ignorado pois o projeto usa prisma.$transaction quando necessário.
  // -------------------------------------------------------------------------

  async findUserByEmailForSync(_client: unknown = null, email: string): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id, email, barbershop_id
      FROM users
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
      FOR UPDATE
    `);
    return result[0] ?? null;
  },

  async findUserBySupabaseUserIdForUpdate(_client: unknown = null, supabaseUserId: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT id, email, barbershop_id, supabase_user_id
        FROM users
        WHERE supabase_user_id = ${supabaseUserId}::uuid
        LIMIT 1
        FOR UPDATE
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (isColumnMissingError(error)) return null;
      throw error;
    }
  },

  async findBarbershopByEmailForUpdate(_client: unknown = null, email: string): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id, email, name, owner_name, plan, desired_plan, active
      FROM barbershops
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
      FOR UPDATE
    `);
    return result[0] ?? null;
  },

  // -------------------------------------------------------------------------
  // Criação de registros
  // -------------------------------------------------------------------------

  async createBarbershop(
    _client: unknown = null,
    {
      name,
      ownerName,
      email,
      whatsapp,
      plan,
      desiredPlan,
      cpfCnpj = null,
    }: {
      name: string;
      ownerName: string;
      email: string;
      whatsapp: string;
      plan: string;
      desiredPlan: string;
      cpfCnpj?: string | null;
    }
  ): Promise<Record<string, unknown> | null> {
    const normalizedCpfCnpj = normalizeCpfCnpj(cpfCnpj);

    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO barbershops (name, owner_name, email, whatsapp, plan, desired_plan, cpf_cnpj, subscription_status)
        VALUES (${name}, ${ownerName}, ${email}, ${whatsapp}, ${plan}, ${desiredPlan}, ${normalizedCpfCnpj}, 'incomplete')
        RETURNING id
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO barbershops (name, owner_name, email, whatsapp, plan)
        VALUES (${name}, ${ownerName}, ${email}, ${whatsapp}, ${plan})
        RETURNING id
      `);
      return legacyResult[0] ?? null;
    }
  },

  async createUser(
    _client: unknown = null,
    {
      barbershopId,
      email,
      passwordHash,
      role,
      emailVerified = true,
      supabaseUserId = null,
      authProvider = 'supabase',
    }: {
      barbershopId: string;
      email: string;
      passwordHash: string;
      role: string;
      emailVerified?: boolean;
      supabaseUserId?: string | null;
      authProvider?: string;
    }
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO users (
          barbershop_id, email, password_hash, role,
          email_verified, supabase_user_id, auth_provider, email_verified_at
        )
        VALUES (
          ${barbershopId}::uuid, ${email}, ${passwordHash}, ${role},
          ${emailVerified}, ${uuidOrNull(supabaseUserId)}, ${authProvider},
          CASE WHEN ${emailVerified} THEN NOW() ELSE NULL END
        )
        RETURNING id
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO users (barbershop_id, email, password_hash, role)
        VALUES (${barbershopId}::uuid, ${email}, ${passwordHash}, ${role})
        RETURNING id
      `);
      return legacyResult[0] ?? null;
    }
  },

  // -------------------------------------------------------------------------
  // Pending registrations
  // -------------------------------------------------------------------------

  async upsertPendingRegistration(
    _client: unknown = null,
    {
      email,
      supabaseUserId,
      barbershopName,
      ownerName,
      whatsapp,
      cpfCnpj,
      desiredPlan,
      passwordHash,
    }: {
      email: string;
      supabaseUserId: string | null;
      barbershopName: string;
      ownerName: string;
      whatsapp: string;
      cpfCnpj: string | null;
      desiredPlan: string;
      passwordHash: string;
    }
  ): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO pending_registrations (
        email, supabase_user_id, barbershop_name, owner_name, whatsapp,
        desired_plan, password_hash, auth_provider, status, verification_sent_at
      )
      VALUES (
        ${email}, ${uuidOrNull(supabaseUserId)}, ${barbershopName}, ${ownerName}, ${whatsapp},
        ${desiredPlan}, ${passwordHash}, 'supabase', 'pending', NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        supabase_user_id     = COALESCE(EXCLUDED.supabase_user_id, pending_registrations.supabase_user_id),
        barbershop_name      = EXCLUDED.barbershop_name,
        owner_name           = EXCLUDED.owner_name,
        whatsapp             = EXCLUDED.whatsapp,
        desired_plan         = EXCLUDED.desired_plan,
        password_hash        = EXCLUDED.password_hash,
        auth_provider        = 'supabase',
        status               = 'pending',
        verification_sent_at = NOW(),
        confirmed_at         = NULL
      RETURNING
        id, email, supabase_user_id, barbershop_name, owner_name, whatsapp,
        NULL::VARCHAR AS cpf_cnpj,
        desired_plan, password_hash, auth_provider, status,
        verification_sent_at, confirmed_at
    `);
    return result[0] ?? null;
  },

  async findPendingRegistrationByEmail(email: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          id, email, supabase_user_id, barbershop_name, owner_name, whatsapp,
          NULL::VARCHAR AS cpf_cnpj,
          desired_plan, password_hash, auth_provider, status,
          verification_sent_at, confirmed_at
        FROM pending_registrations
        WHERE LOWER(email) = LOWER(${email})
          AND status = 'pending'
        LIMIT 1
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (error?.code === '42P01') return null;
      throw error;
    }
  },

  async findPendingRegistrationByEmailForUpdate(_client: unknown = null, email: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          id, email, supabase_user_id, barbershop_name, owner_name, whatsapp,
          NULL::VARCHAR AS cpf_cnpj,
          desired_plan, password_hash, auth_provider, status,
          verification_sent_at, confirmed_at
        FROM pending_registrations
        WHERE LOWER(email) = LOWER(${email})
          AND status = 'pending'
        LIMIT 1
        FOR UPDATE
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (error?.code === '42P01') return null;
      throw error;
    }
  },

  async findPendingRegistrationForReconciliation(
    _client: unknown = null,
    { email, supabaseUserId = null }: { email?: string | null; supabaseUserId?: string | null }
  ): Promise<Record<string, unknown> | null> {
    if (!email && !supabaseUserId) return null;

    const emailFilter = email
      ? Prisma.sql`LOWER(email) = LOWER(${email})`
      : Prisma.sql`FALSE`;

    const uuidFilter = supabaseUserId
      ? Prisma.sql`supabase_user_id = ${supabaseUserId}::uuid`
      : Prisma.sql`FALSE`;

    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          id, email, supabase_user_id, barbershop_name, owner_name, whatsapp,
          NULL::VARCHAR AS cpf_cnpj,
          desired_plan, password_hash, auth_provider, status,
          verification_sent_at, confirmed_at
        FROM pending_registrations
        WHERE (${emailFilter} OR ${uuidFilter})
          AND status <> 'canceled'
        ORDER BY CASE status
          WHEN 'pending'   THEN 0
          WHEN 'completed' THEN 1
          ELSE 2
        END
        LIMIT 1
        FOR UPDATE
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (error?.code === '42P01') return null;
      throw error;
    }
  },

  async markPendingRegistrationCompleted(_client: unknown = null, pendingRegistrationId: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE pending_registrations
        SET status       = 'completed',
            confirmed_at = NOW()
        WHERE id     = ${pendingRegistrationId}::uuid
          AND status = 'pending'
        RETURNING id
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (error?.code === '42P01') return null;
      throw error;
    }
  },

  async markPendingRegistrationCompletedByEmail(_client: unknown = null, email: string): Promise<void> {
    try {
      await prisma.$queryRaw(Prisma.sql`
        UPDATE pending_registrations
        SET status       = 'completed',
            confirmed_at = COALESCE(confirmed_at, NOW())
        WHERE LOWER(email) = LOWER(${email})
          AND status = 'pending'
      `);
    } catch (error: any) {
      if (error?.code === '42P01') return;
      throw error;
    }
  },

  async completePendingRegistration(
    _client: unknown = null,
    {
      pendingRegistrationId,
      confirmedAt = null,
      supabaseUserId = null,
    }: {
      pendingRegistrationId: string;
      confirmedAt?: string | null;
      supabaseUserId?: string | null;
    }
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE pending_registrations
        SET status           = 'completed',
            confirmed_at     = COALESCE(${timestampOrNull(confirmedAt)}, confirmed_at, NOW()),
            supabase_user_id = COALESCE(${uuidOrNull(supabaseUserId)}, supabase_user_id),
            updated_at       = NOW()
        WHERE id     = ${pendingRegistrationId}::uuid
          AND status <> 'canceled'
        RETURNING id, status, confirmed_at, supabase_user_id
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (error?.code === '42P01') return null;
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE pending_registrations
        SET status           = 'completed',
            confirmed_at     = COALESCE(${timestampOrNull(confirmedAt)}, confirmed_at, NOW()),
            supabase_user_id = COALESCE(${uuidOrNull(supabaseUserId)}, supabase_user_id)
        WHERE id     = ${pendingRegistrationId}::uuid
          AND status <> 'canceled'
        RETURNING id, status, confirmed_at, supabase_user_id
      `);
      return legacyResult[0] ?? null;
    }
  },

  async touchPendingRegistrationVerificationSentAt(_client: unknown = null, pendingRegistrationId: string): Promise<void> {
    try {
      await prisma.$queryRaw(Prisma.sql`
        UPDATE pending_registrations
        SET verification_sent_at = NOW()
        WHERE id     = ${pendingRegistrationId}::uuid
          AND status = 'pending'
      `);
    } catch (error: any) {
      if (error?.code === '42P01') return;
      throw error;
    }
  },

  // -------------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------------

  async markEmailAsVerifiedWithSupabaseIdentity(
    _client: unknown = null,
    {
      userId,
      supabaseUserId,
      emailVerifiedAt,
      authProvider = 'supabase',
    }: {
      userId: string;
      supabaseUserId: string | null;
      emailVerifiedAt: string | null;
      authProvider?: string;
    }
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE users
        SET email_verified                 = true,
            email_verified_at             = COALESCE(${timestampOrNull(emailVerifiedAt)}, NOW()),
            supabase_user_id              = COALESCE(${uuidOrNull(supabaseUserId)}, supabase_user_id),
            auth_provider                 = ${authProvider},
            last_identity_sync_at         = NOW(),
            email_verification_token_hash = NULL,
            email_verification_expires_at = NULL,
            verification_sent_at          = NULL
        WHERE id = ${userId}::uuid
        RETURNING id, email, email_verified, email_verified_at, supabase_user_id, auth_provider
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;
      return authRepository.markEmailAsVerified(null, userId);
    }
  },

  async setEmailVerificationToken(
    _client: unknown = null,
    { userId, tokenHash, expiresAt }: { userId: string; tokenHash: string; expiresAt: string }
  ): Promise<void> {
    await prisma.$queryRaw(Prisma.sql`
      UPDATE users
      SET email_verified                 = false,
          email_verified_at             = NULL,
          email_verification_token_hash = ${tokenHash},
          email_verification_expires_at = ${expiresAt},
          verification_sent_at          = NOW()
      WHERE id = ${userId}::uuid
    `);
  },

  async findUserByEmailVerificationTokenHash(tokenHash: string): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        u.id, u.email, u.email_verified,
        u.email_verification_token_hash,
        u.email_verification_expires_at
      FROM users u
      JOIN barbershops b ON u.barbershop_id = b.id
      WHERE u.email_verification_token_hash = ${tokenHash}
        AND u.blocked = false
        AND b.active  = true
      LIMIT 1
    `);
    return result[0] ?? null;
  },

  async clearEmailVerificationToken(_client: unknown = null, userId: string): Promise<void> {
    await prisma.$queryRaw(Prisma.sql`
      UPDATE users
      SET email_verification_token_hash = NULL,
          email_verification_expires_at = NULL,
          verification_sent_at          = NULL
      WHERE id = ${userId}::uuid
    `);
  },

  async markEmailAsVerified(_client: unknown = null, userId: string): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE users
      SET email_verified                 = true,
          email_verified_at             = NOW(),
          email_verification_token_hash = NULL,
          email_verification_expires_at = NULL,
          verification_sent_at          = NULL
      WHERE id = ${userId}::uuid
      RETURNING id, email, email_verified, email_verified_at
    `);
    return result[0] ?? null;
  },

  // -------------------------------------------------------------------------
  // Identity sync
  // -------------------------------------------------------------------------

  async updateUserIdentitySync(
    _client: unknown = null,
    {
      userId,
      supabaseUserId,
      authProvider = 'supabase',
    }: {
      userId: string;
      supabaseUserId: string | null;
      authProvider?: string;
    }
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE users
        SET supabase_user_id      = COALESCE(${uuidOrNull(supabaseUserId)}, supabase_user_id),
            auth_provider         = COALESCE(${authProvider}, auth_provider),
            last_identity_sync_at = NOW()
        WHERE id = ${userId}::uuid
        RETURNING id, supabase_user_id, auth_provider, last_identity_sync_at
      `);
      return result[0] ?? null;
    } catch (error: any) {
      if (!isColumnMissingError(error)) throw error;

      const legacyResult = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE users
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}::uuid
        RETURNING id
      `);
      return legacyResult[0] ?? null;
    }
  },

  // -------------------------------------------------------------------------
  // Managed users (platform_admin / tenant_admin)
  // -------------------------------------------------------------------------

  async upsertPlatformAdminUser(
    _client: unknown = null,
    payload: {
      barbershopId: string;
      email: string;
      passwordHash: string;
      supabaseUserId?: string | null;
      emailVerified?: boolean;
    }
  ): Promise<Record<string, unknown> | null> {
    return upsertManagedUser(null, { ...payload, role: 'platform_admin', authProvider: 'supabase' });
  },

  async upsertTenantAdminUser(
    _client: unknown = null,
    payload: {
      barbershopId: string;
      email: string;
      passwordHash: string;
      supabaseUserId?: string | null;
      emailVerified?: boolean;
    }
  ): Promise<Record<string, unknown> | null> {
    return upsertManagedUser(null, { ...payload, role: 'tenant_admin', authProvider: 'supabase' });
  },

  // -------------------------------------------------------------------------
  // Utilitário de compatibilidade (legado pg-pool)
  // -------------------------------------------------------------------------

  async getClient(): Promise<null> {
    return null;
  },
};