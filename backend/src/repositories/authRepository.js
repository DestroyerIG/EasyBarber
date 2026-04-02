import pool from '../config/database.js';

export const authRepository = {
  async findUserByEmail(email) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.role, u.blocked,
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

  async createBarbershop(client, { name, ownerName, email, whatsapp, plan }) {
    const result = await client.query(
      `INSERT INTO barbershops (name, owner_name, email, whatsapp, plan) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, ownerName, email, whatsapp, plan]
    );
    return result.rows[0];
  },

  async createUser(client, { barbershopId, email, passwordHash, role }) {
    const result = await client.query(
      `INSERT INTO users (barbershop_id, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [barbershopId, email, passwordHash, role]
    );
    return result.rows[0];
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
      `SELECT rt.id, rt.user_id, u.email, u.role, b.id as barbershop_id, b.plan
              , b.subscription_status, b.subscription_current_period_end
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       JOIN barbershops b ON u.barbershop_id = b.id
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
         AND u.blocked = false
         AND b.active = true`,
      [tokenHash]
    );
    return result.rows[0] || null;
  },

  async getClient() {
    return pool.connect();
  },
};
