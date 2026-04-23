import pool from '../config/database.js';

const normalizeCpfCnpj = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const digits = value.replace(/\D+/g, '');
  if (digits.length !== 11 && digits.length !== 14) {
    return null;
  }

  return digits;
};

const upsertManagedUser = async (client, {
  barbershopId,
  email,
  passwordHash,
  role,
  supabaseUserId = null,
  emailVerified = true,
  authProvider = 'supabase',
}) => {
  try {
    const result = await client.query(
      `INSERT INTO users (
         barbershop_id,
         email,
         password_hash,
         role,
         blocked,
         blocked_at,
         blocked_reason,
         email_verified,
         email_verified_at,
         supabase_user_id,
         auth_provider,
         last_identity_sync_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         false,
         NULL,
         NULL,
         $5,
         CASE WHEN $5 THEN NOW() ELSE NULL END,
         $6,
         $7,
         NOW()
       )
       ON CONFLICT (email)
       DO UPDATE SET
         barbershop_id = EXCLUDED.barbershop_id,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         blocked = false,
         blocked_at = NULL,
         blocked_reason = NULL,
         email_verified = EXCLUDED.email_verified,
         email_verified_at = CASE
           WHEN EXCLUDED.email_verified
             THEN COALESCE(users.email_verified_at, NOW())
           ELSE NULL
         END,
         supabase_user_id = COALESCE(EXCLUDED.supabase_user_id, users.supabase_user_id),
         auth_provider = EXCLUDED.auth_provider,
         last_identity_sync_at = NOW()
       RETURNING id,
                 email,
                 role,
                 barbershop_id,
                 blocked,
                 email_verified,
                 supabase_user_id,
                 auth_provider,
                 last_identity_sync_at`,
      [barbershopId, email, passwordHash, role, emailVerified, supabaseUserId, authProvider]
    );

    return result.rows[0] || null;
  } catch (error) {
    if (error?.code !== '42703') {
      throw error;
    }

    const legacyResult = await client.query(
      `INSERT INTO users (barbershop_id, email, password_hash, role, blocked)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (email)
       DO UPDATE SET
         barbershop_id = EXCLUDED.barbershop_id,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         blocked = false
       RETURNING id, email, role, barbershop_id, blocked`,
      [barbershopId, email, passwordHash, role]
    );

    return legacyResult.rows[0] || null;
  }
};

export const authRepository = {
  async findUserByEmail(email) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.blocked,
                u.email_verified, u.email_verified_at,
                u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
                u.supabase_user_id, u.auth_provider, u.last_identity_sync_at,
                b.plan, b.name as barbershop_name, b.id as barbershop_id,
                b.subscription_status,
                b.subscription_current_period_end
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1) AND b.active = true AND u.blocked = false`,
        [email]
      );
      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const legacyResult = await pool.query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.blocked,
                u.email_verified, u.email_verified_at,
                u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
                NULL::UUID as supabase_user_id,
                'legacy'::VARCHAR as auth_provider,
                NULL::TIMESTAMP as last_identity_sync_at,
                b.plan, b.name as barbershop_name, b.id as barbershop_id,
                b.subscription_status,
                b.subscription_current_period_end
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1) AND b.active = true AND u.blocked = false`,
        [email]
      );

      return legacyResult.rows[0] || null;
    }
  },

  async findUserByEmailIncludingBlocked(email) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.blocked,
                u.email_verified, u.email_verified_at,
                u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
                u.supabase_user_id, u.auth_provider, u.last_identity_sync_at,
                b.plan, b.name as barbershop_name, b.id as barbershop_id,
                b.subscription_status,
                b.subscription_current_period_end
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1) AND b.active = true
         LIMIT 1`,
        [email]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const legacyResult = await pool.query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.blocked,
                u.email_verified, u.email_verified_at,
                u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
                NULL::UUID as supabase_user_id,
                'legacy'::VARCHAR as auth_provider,
                NULL::TIMESTAMP as last_identity_sync_at,
                b.plan, b.name as barbershop_name, b.id as barbershop_id,
                b.subscription_status,
                b.subscription_current_period_end
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1) AND b.active = true
         LIMIT 1`,
        [email]
      );

      return legacyResult.rows[0] || null;
    }
  },

  async findUserBySupabaseUserId(supabaseUserId) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.password_hash, u.role, u.blocked,
                u.email_verified, u.email_verified_at,
                u.supabase_user_id, u.auth_provider, u.last_identity_sync_at,
                b.plan, b.name as barbershop_name, b.id as barbershop_id,
                b.subscription_status,
                b.subscription_current_period_end
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE u.supabase_user_id = $1
           AND b.active = true
         LIMIT 1`,
        [supabaseUserId]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code === '42703') {
        return null;
      }

      throw error;
    }
  },

  async findAnyUserByEmail(email) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.barbershop_id, u.blocked,
                u.email_verified, u.email_verified_at,
                u.supabase_user_id, u.auth_provider,
                b.active as barbershop_active
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1)
         LIMIT 1`,
        [email]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const legacyResult = await pool.query(
        `SELECT u.id, u.email, u.barbershop_id, u.blocked,
                u.email_verified, u.email_verified_at,
                NULL::UUID as supabase_user_id,
                'legacy'::VARCHAR as auth_provider,
                b.active as barbershop_active
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1)
         LIMIT 1`,
        [email]
      );

      return legacyResult.rows[0] || null;
    }
  },

  async findOtherUserByEmail(email, excludedUserId) {
    try {
      const result = await pool.query(
        `SELECT u.id, u.email, u.barbershop_id, u.blocked,
                u.email_verified, u.email_verified_at,
                u.supabase_user_id, u.auth_provider,
                b.active as barbershop_active
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1)
           AND u.id <> $2
         LIMIT 1`,
        [email, excludedUserId]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const legacyResult = await pool.query(
        `SELECT u.id, u.email, u.barbershop_id, u.blocked,
                u.email_verified, u.email_verified_at,
                NULL::UUID as supabase_user_id,
                'legacy'::VARCHAR as auth_provider,
                b.active as barbershop_active
         FROM users u
         JOIN barbershops b ON u.barbershop_id = b.id
         WHERE LOWER(u.email) = LOWER($1)
           AND u.id <> $2
         LIMIT 1`,
        [email, excludedUserId]
      );

      return legacyResult.rows[0] || null;
    }
  },

  async findUserByEmailForSync(client, email) {
    const result = await client.query(
      `SELECT id, email, barbershop_id
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1
       FOR UPDATE`,
      [email]
    );

    return result.rows[0] || null;
  },

  async createBarbershop(client, {
    name,
    ownerName,
    email,
    whatsapp,
    plan,
    desiredPlan,
    cpfCnpj = null,
  }) {
    const normalizedCpfCnpj = normalizeCpfCnpj(cpfCnpj);

    try {
      const result = await client.query(
        `INSERT INTO barbershops (name, owner_name, email, whatsapp, plan, desired_plan, cpf_cnpj) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [name, ownerName, email, whatsapp, plan, desiredPlan, normalizedCpfCnpj]
      );
      return result.rows[0];
    } catch (error) {
      if (error?.code === '42703') {
        const legacyResult = await client.query(
          `INSERT INTO barbershops (name, owner_name, email, whatsapp, plan) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [name, ownerName, email, whatsapp, plan]
        );
        return legacyResult.rows[0];
      }

      throw error;
    }
  },

  async createUser(client, {
    barbershopId,
    email,
    passwordHash,
    role,
    emailVerified = true,
    supabaseUserId = null,
    authProvider = 'legacy',
  }) {
    try {
      const result = await client.query(
        `INSERT INTO users (
           barbershop_id,
           email,
           password_hash,
           role,
           email_verified,
           supabase_user_id,
           auth_provider,
           email_verified_at
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           CASE WHEN $5 THEN NOW() ELSE NULL END
         )
         RETURNING id`,
        [barbershopId, email, passwordHash, role, emailVerified, supabaseUserId, authProvider]
      );
      return result.rows[0];
    } catch (error) {
      if (error?.code === '42703') {
        const legacyResult = await client.query(
          `INSERT INTO users (barbershop_id, email, password_hash, role) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [barbershopId, email, passwordHash, role]
        );
        return legacyResult.rows[0];
      }

      throw error;
    }
  },

  async upsertPendingRegistration(client, {
    email,
    supabaseUserId,
    barbershopName,
    ownerName,
    whatsapp,
    cpfCnpj,
    desiredPlan,
    passwordHash,
  }) {
    const normalizedCpfCnpj = normalizeCpfCnpj(cpfCnpj);

    try {
      const result = await client.query(
        `INSERT INTO pending_registrations (
           email,
           supabase_user_id,
           barbershop_name,
           owner_name,
           whatsapp,
           cpf_cnpj,
           desired_plan,
           password_hash,
           auth_provider,
           status,
           verification_sent_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'supabase', 'pending', NOW())
         ON CONFLICT (email)
         DO UPDATE SET
           supabase_user_id = COALESCE(EXCLUDED.supabase_user_id, pending_registrations.supabase_user_id),
           barbershop_name = EXCLUDED.barbershop_name,
           owner_name = EXCLUDED.owner_name,
           whatsapp = EXCLUDED.whatsapp,
           cpf_cnpj = EXCLUDED.cpf_cnpj,
           desired_plan = EXCLUDED.desired_plan,
           password_hash = EXCLUDED.password_hash,
           auth_provider = 'supabase',
           status = 'pending',
           verification_sent_at = NOW(),
           confirmed_at = NULL
         RETURNING id,
                   email,
                   supabase_user_id,
                   barbershop_name,
                   owner_name,
                   whatsapp,
                   cpf_cnpj,
                   desired_plan,
                   password_hash,
                   auth_provider,
                   status,
                   verification_sent_at,
                   confirmed_at`,
        [email, supabaseUserId, barbershopName, ownerName, whatsapp, normalizedCpfCnpj, desiredPlan, passwordHash]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const legacyResult = await client.query(
        `INSERT INTO pending_registrations (
           email,
           supabase_user_id,
           barbershop_name,
           owner_name,
           whatsapp,
           desired_plan,
           password_hash,
           auth_provider,
           status,
           verification_sent_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'supabase', 'pending', NOW())
         ON CONFLICT (email)
         DO UPDATE SET
           supabase_user_id = COALESCE(EXCLUDED.supabase_user_id, pending_registrations.supabase_user_id),
           barbershop_name = EXCLUDED.barbershop_name,
           owner_name = EXCLUDED.owner_name,
           whatsapp = EXCLUDED.whatsapp,
           desired_plan = EXCLUDED.desired_plan,
           password_hash = EXCLUDED.password_hash,
           auth_provider = 'supabase',
           status = 'pending',
           verification_sent_at = NOW(),
           confirmed_at = NULL
         RETURNING id,
                   email,
                   supabase_user_id,
                   barbershop_name,
                   owner_name,
                   whatsapp,
                   NULL::VARCHAR AS cpf_cnpj,
                   desired_plan,
                   password_hash,
                   auth_provider,
                   status,
                   verification_sent_at,
                   confirmed_at`,
        [email, supabaseUserId, barbershopName, ownerName, whatsapp, desiredPlan, passwordHash]
      );

      return legacyResult.rows[0] || null;
    }
  },

  async findPendingRegistrationByEmail(email) {
    try {
      const result = await pool.query(
        `SELECT id,
                email,
                supabase_user_id,
                barbershop_name,
                owner_name,
                whatsapp,
                cpf_cnpj,
                desired_plan,
                password_hash,
                auth_provider,
                status,
                verification_sent_at,
                confirmed_at
         FROM pending_registrations
         WHERE LOWER(email) = LOWER($1)
           AND status = 'pending'
         LIMIT 1`,
        [email]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code === '42P01') {
        return null;
      }

      if (error?.code === '42703') {
        const legacyResult = await pool.query(
          `SELECT id,
                  email,
                  supabase_user_id,
                  barbershop_name,
                  owner_name,
                  whatsapp,
                  NULL::VARCHAR AS cpf_cnpj,
                  desired_plan,
                  password_hash,
                  auth_provider,
                  status,
                  verification_sent_at,
                  confirmed_at
           FROM pending_registrations
           WHERE LOWER(email) = LOWER($1)
             AND status = 'pending'
           LIMIT 1`,
          [email]
        );

        return legacyResult.rows[0] || null;
      }

      throw error;
    }
  },

  async findPendingRegistrationByEmailForUpdate(client, email) {
    try {
      const result = await client.query(
        `SELECT id,
                email,
                supabase_user_id,
                barbershop_name,
                owner_name,
                whatsapp,
                cpf_cnpj,
                desired_plan,
                password_hash,
                auth_provider,
                status,
                verification_sent_at,
                confirmed_at
         FROM pending_registrations
         WHERE LOWER(email) = LOWER($1)
           AND status = 'pending'
         LIMIT 1
         FOR UPDATE`,
        [email]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code === '42P01') {
        return null;
      }

      if (error?.code === '42703') {
        const legacyResult = await client.query(
          `SELECT id,
                  email,
                  supabase_user_id,
                  barbershop_name,
                  owner_name,
                  whatsapp,
                  NULL::VARCHAR AS cpf_cnpj,
                  desired_plan,
                  password_hash,
                  auth_provider,
                  status,
                  verification_sent_at,
                  confirmed_at
           FROM pending_registrations
           WHERE LOWER(email) = LOWER($1)
             AND status = 'pending'
           LIMIT 1
           FOR UPDATE`,
          [email]
        );

        return legacyResult.rows[0] || null;
      }

      throw error;
    }
  },

  async markPendingRegistrationCompleted(client, pendingRegistrationId) {
    try {
      const result = await client.query(
        `UPDATE pending_registrations
         SET status = 'completed',
             confirmed_at = NOW()
         WHERE id = $1
           AND status = 'pending'
         RETURNING id`,
        [pendingRegistrationId]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code === '42P01') {
        return null;
      }

      throw error;
    }
  },

  async markPendingRegistrationCompletedByEmail(client, email) {
    try {
      await client.query(
        `UPDATE pending_registrations
         SET status = 'completed',
             confirmed_at = COALESCE(confirmed_at, NOW())
         WHERE LOWER(email) = LOWER($1)
           AND status = 'pending'`,
        [email]
      );
    } catch (error) {
      if (error?.code === '42P01') {
        return;
      }

      throw error;
    }
  },

  async touchPendingRegistrationVerificationSentAt(client, pendingRegistrationId) {
    try {
      await client.query(
        `UPDATE pending_registrations
         SET verification_sent_at = NOW()
         WHERE id = $1
           AND status = 'pending'`,
        [pendingRegistrationId]
      );
    } catch (error) {
      if (error?.code === '42P01') {
        return;
      }

      throw error;
    }
  },

  async markEmailAsVerifiedWithSupabaseIdentity(client, {
    userId,
    supabaseUserId,
    emailVerifiedAt,
    authProvider = 'supabase',
  }) {
    try {
      const result = await client.query(
        `UPDATE users
         SET email_verified = true,
             email_verified_at = COALESCE($3::timestamp, NOW()),
             supabase_user_id = COALESCE($2, supabase_user_id),
             auth_provider = $4,
             last_identity_sync_at = NOW(),
             email_verification_token_hash = NULL,
             email_verification_expires_at = NULL,
             verification_sent_at = NULL
         WHERE id = $1
         RETURNING id, email, email_verified, email_verified_at, supabase_user_id, auth_provider`,
        [userId, supabaseUserId, emailVerifiedAt || null, authProvider]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      return this.markEmailAsVerified(client, userId);
    }
  },

  async setEmailVerificationToken(client, { userId, tokenHash, expiresAt }) {
    await client.query(
      `UPDATE users
       SET email_verified = false,
           email_verified_at = NULL,
           email_verification_token_hash = $2,
           email_verification_expires_at = $3,
           verification_sent_at = NOW()
       WHERE id = $1`,
      [userId, tokenHash, expiresAt]
    );
  },

  async findUserByEmailVerificationTokenHash(tokenHash) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.email_verified,
              u.email_verification_token_hash,
              u.email_verification_expires_at
       FROM users u
       JOIN barbershops b ON u.barbershop_id = b.id
       WHERE u.email_verification_token_hash = $1
         AND u.blocked = false
         AND b.active = true
       LIMIT 1`,
      [tokenHash]
    );

    return result.rows[0] || null;
  },

  async clearEmailVerificationToken(client, userId) {
    await client.query(
      `UPDATE users
       SET email_verification_token_hash = NULL,
           email_verification_expires_at = NULL,
           verification_sent_at = NULL
       WHERE id = $1`,
      [userId]
    );
  },

  async markEmailAsVerified(client, userId) {
    const result = await client.query(
      `UPDATE users
       SET email_verified = true,
           email_verified_at = NOW(),
           email_verification_token_hash = NULL,
           email_verification_expires_at = NULL,
           verification_sent_at = NULL
       WHERE id = $1
       RETURNING id, email, email_verified, email_verified_at`,
      [userId]
    );

    return result.rows[0] || null;
  },

  async updateUserIdentitySync(client, { userId, supabaseUserId, authProvider = 'supabase' }) {
    try {
      const result = await client.query(
        `UPDATE users
         SET supabase_user_id = COALESCE($2, supabase_user_id),
             auth_provider = COALESCE($3, auth_provider),
             last_identity_sync_at = NOW()
         WHERE id = $1
         RETURNING id, supabase_user_id, auth_provider, last_identity_sync_at`,
        [userId, supabaseUserId, authProvider]
      );

      return result.rows[0] || null;
    } catch (error) {
      if (error?.code !== '42703') {
        throw error;
      }

      const legacyResult = await client.query(
        `UPDATE users
         SET updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id`,
        [userId]
      );

      return legacyResult.rows[0] || null;
    }
  },

  async upsertPlatformAdminUser(client, payload) {
    return upsertManagedUser(client, {
      ...payload,
      role: 'platform_admin',
      authProvider: 'supabase',
    });
  },

  async upsertTenantAdminUser(client, payload) {
    return upsertManagedUser(client, {
      ...payload,
      role: 'tenant_admin',
      authProvider: 'supabase',
    });
  },

  async saveRefreshToken(client, { userId, tokenHash, expiresAt }) {
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  },

  async revokeUserRefreshTokens(client, userId) {
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  },

  async revokeRefreshTokenById(client, tokenId) {
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
      [tokenId]
    );
  },

  async revokeRefreshTokenByHash(tokenHash) {
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );
  },

  async findValidRefreshToken(tokenHash) {
    const result = await pool.query(
      `SELECT rt.id, rt.user_id, u.email, u.role, u.email_verified, b.id as barbershop_id, b.plan
              , b.name as barbershop_name, b.subscription_status, b.subscription_current_period_end
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       JOIN barbershops b ON u.barbershop_id = b.id
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
         AND u.blocked = false
         AND u.email_verified = true
         AND b.active = true`,
      [tokenHash]
    );
    return result.rows[0] || null;
  },

  async getClient() {
    return pool.connect();
  },
};
