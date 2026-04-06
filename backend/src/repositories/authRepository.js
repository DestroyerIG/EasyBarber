import pool from '../config/database.js';

export const authRepository = {
  async findUserByEmail(email) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.blocked,
              u.email_verified, u.email_verified_at,
              u.email_verification_token_hash, u.email_verification_expires_at, u.verification_sent_at,
              b.plan, b.name as barbershop_name, b.id as barbershop_id,
              b.subscription_status,
              b.subscription_current_period_end
       FROM users u
       JOIN barbershops b ON u.barbershop_id = b.id
       WHERE u.email = $1 AND b.active = true AND u.blocked = false`,
      [email]
    );
    return result.rows[0] || null;
  },

  async createBarbershop(client, { name, ownerName, email, whatsapp, plan, desiredPlan }) {
    try {
      const result = await client.query(
        `INSERT INTO barbershops (name, owner_name, email, whatsapp, plan, desired_plan) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [name, ownerName, email, whatsapp, plan, desiredPlan]
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

  async createUser(client, { barbershopId, email, passwordHash, role, emailVerified = true }) {

    try {
      const result = await client.query(
        `INSERT INTO users (barbershop_id, email, password_hash, role, email_verified) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [barbershopId, email, passwordHash, role, emailVerified]
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
