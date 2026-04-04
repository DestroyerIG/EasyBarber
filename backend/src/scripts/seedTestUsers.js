import bcrypt from 'bcryptjs';
import pool from '../config/database.js';
import { authRepository } from '../repositories/authRepository.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';

const ADMIN_ACCOUNT = {
  email: 'contato@easyconnectcg.com.br',
  password: '@Easyconnect08',
  role: 'platform_admin',
};

const TEST_ACCOUNT = {
  email: 'teste@easybarber.com',
  password: '12345678',
  role: 'employee',
};

const PLATFORM_BARBERSHOP = {
  name: 'EasyBarber Plataforma',
  ownerName: 'Equipe EasyBarber',
  email: 'platform-admin@easybarber.local',
  whatsapp: '5599999990000',
};

const TEST_BARBERSHOP = {
  name: 'EasyBarber Teste',
  ownerName: 'Equipe EasyBarber',
  email: 'tenant-teste@easybarber.local',
  whatsapp: '5599999999999',
};

const BCRYPT_ROUNDS = 12;

const normalizeHash = (hash) => (typeof hash === 'string' ? hash.trim() : '');

const findBarbershopBySeedIdentity = async (client, { email, name }) => {
  const result = await client.query(
    `SELECT *
     FROM barbershops
     WHERE LOWER(email) = LOWER($1)
        OR LOWER(name) = LOWER($2)
     ORDER BY CASE WHEN LOWER(email) = LOWER($1) THEN 0 ELSE 1 END
     LIMIT 1`,
    [email, name]
  );

  return result.rows[0] || null;
};

const getBarbershopById = async (client, id) => {
  const result = await client.query('SELECT * FROM barbershops WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const ensureBarbershop = async (client, seedData, { onCreated, onExisting }) => {
  const existing = await findBarbershopBySeedIdentity(client, seedData);

  if (existing) {
    await client.query(
      `UPDATE barbershops
       SET name = $2,
           owner_name = $3,
           whatsapp = $4,
           active = true,
           suspended_at = NULL,
           suspended_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [existing.id, seedData.name, seedData.ownerName, seedData.whatsapp]
    );

    console.log(onExisting);
    return getBarbershopById(client, existing.id);
  }

  const created = await authRepository.createBarbershop(client, {
    name: seedData.name,
    ownerName: seedData.ownerName,
    email: seedData.email,
    whatsapp: seedData.whatsapp,
    plan: 'basico',
  });

  console.log(onCreated);
  return getBarbershopById(client, created.id);
};

const findUserByEmail = async (client, email) => {
  const result = await client.query(
    `SELECT id, email, password_hash, role, blocked, barbershop_id
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return result.rows[0] || null;
};

const ensureUser = async (
  client,
  { email, password, role, barbershopId },
  { onCreated, onExisting }
) => {
  const existing = await findUserByEmail(client, email);

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const created = await authRepository.createUser(client, {
      barbershopId,
      email,
      passwordHash,
      role,
    });

    console.log(onCreated);
    return {
      id: created.id,
      created: true,
      passwordChanged: true,
      roleChanged: false,
      barbershopChanged: false,
    };
  }

  const currentHash = normalizeHash(existing.password_hash);
  const samePassword = currentHash
    ? await bcrypt.compare(password, currentHash)
    : false;

  const passwordHash = samePassword ? null : await bcrypt.hash(password, BCRYPT_ROUNDS);
  const roleChanged = existing.role !== role;
  const barbershopChanged = existing.barbershop_id !== barbershopId;

  await client.query(
    `UPDATE users
     SET barbershop_id = $2,
         role = $3,
         password_hash = COALESCE($4, password_hash),
         blocked = false,
         blocked_at = NULL,
         blocked_reason = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [existing.id, barbershopId, role, passwordHash]
  );

  if (!samePassword || roleChanged || barbershopChanged) {
    await authRepository.revokeUserRefreshTokens(client, existing.id);
  }

  console.log(onExisting);
  return {
    id: existing.id,
    created: false,
    passwordChanged: !samePassword,
    roleChanged,
    barbershopChanged,
  };
};

const ensureSubscription = async (client, { barbershopId, plan }) => {
  const context = await subscriptionRepository.getBarbershopBillingContext(barbershopId, client);

  if (!context) {
    throw new Error(`Barbearia ${barbershopId} não encontrada para ajustar assinatura`);
  }

  const now = new Date();
  const oneYearAhead = new Date(now);
  oneYearAhead.setFullYear(now.getFullYear() + 1);

  const currentPeriodStart = context.subscription_current_period_start || now;
  const existingEnd = context.subscription_current_period_end
    ? new Date(context.subscription_current_period_end)
    : null;
  const currentPeriodEnd = existingEnd && existingEnd > now ? existingEnd : oneYearAhead;

  const updated = await subscriptionRepository.updateSubscriptionState(
    barbershopId,
    {
      plan,
      subscriptionStatus: 'active',
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
    client
  );

  if (!updated) {
    throw new Error(`Não foi possível atualizar assinatura da barbearia ${barbershopId}`);
  }

  await client.query(
    `UPDATE barbershops
     SET active = true,
         suspended_at = NULL,
         suspended_reason = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [barbershopId]
  );

  console.log(`Assinatura atualizada para plano ${plan}`);

  return updated;
};

const validateConsistency = async (client, { adminEmail, testEmail, testBarbershopId }) => {
  const adminResult = await client.query(
    `SELECT u.id,
            u.role,
            u.blocked,
            u.password_hash,
            b.active AS barbershop_active
     FROM users u
     JOIN barbershops b ON b.id = u.barbershop_id
     WHERE LOWER(u.email) = LOWER($1)
       AND b.active = true
       AND u.blocked = false
     LIMIT 1`,
    [adminEmail]
  );

  const admin = adminResult.rows[0];
  if (!admin) {
    throw new Error('Validação falhou: admin não encontrado');
  }
  if (admin.role !== 'platform_admin') {
    throw new Error(`Validação falhou: role admin inválida (${admin.role})`);
  }
  if (admin.blocked || !admin.barbershop_active) {
    throw new Error('Validação falhou: admin inativo (blocked ou tenant inativo)');
  }

  const testResult = await client.query(
    `SELECT u.id,
            u.role,
            u.blocked,
            u.password_hash,
            u.barbershop_id,
            b.plan,
            b.subscription_status,
            b.subscription_current_period_end,
            b.active AS barbershop_active
     FROM users u
     JOIN barbershops b ON b.id = u.barbershop_id
     WHERE LOWER(u.email) = LOWER($1)
       AND b.active = true
       AND u.blocked = false
     LIMIT 1`,
    [testEmail]
  );

  const testUser = testResult.rows[0];
  if (!testUser) {
    throw new Error('Validação falhou: usuário de teste não encontrado');
  }
  if (testUser.role !== 'employee') {
    throw new Error(`Validação falhou: role do usuário teste inválida (${testUser.role})`);
  }
  if (testUser.blocked || !testUser.barbershop_active) {
    throw new Error('Validação falhou: usuário de teste inativo (blocked ou tenant inativo)');
  }
  if (testUser.barbershop_id !== testBarbershopId) {
    throw new Error('Validação falhou: usuário de teste não está vinculado ao tenant de teste');
  }
  if (!['profissional', 'premium'].includes(testUser.plan)) {
    throw new Error(`Validação falhou: plano inválido para usuário de teste (${testUser.plan})`);
  }
  if (testUser.subscription_status !== 'active') {
    throw new Error(`Validação falhou: status de assinatura inválido (${testUser.subscription_status})`);
  }
  if (!testUser.subscription_current_period_end) {
    throw new Error('Validação falhou: subscription_current_period_end ausente');
  }

  const adminPasswordOk = await bcrypt.compare(ADMIN_ACCOUNT.password, normalizeHash(admin.password_hash));
  const testPasswordOk = await bcrypt.compare(TEST_ACCOUNT.password, normalizeHash(testUser.password_hash));

  if (!adminPasswordOk || !testPasswordOk) {
    throw new Error('Validação falhou: senha hash incompatível para um dos usuários');
  }
};

const run = async () => {
  let client;

  try {
    console.log('Iniciando seed administrativo e de usuários de teste...');

    client = await pool.connect();
    await client.query('BEGIN');

    const platformBarbershop = await ensureBarbershop(client, PLATFORM_BARBERSHOP, {
      onCreated: 'Tenant da plataforma criado com sucesso',
      onExisting: 'Tenant da plataforma já existe, reutilizando',
    });

    await ensureSubscription(client, {
      barbershopId: platformBarbershop.id,
      plan: 'premium',
    });

    await ensureUser(
      client,
      {
        ...ADMIN_ACCOUNT,
        barbershopId: platformBarbershop.id,
      },
      {
        onCreated: 'Admin criado com sucesso',
        onExisting: 'Admin já existe, reutilizando',
      }
    );

    const testBarbershop = await ensureBarbershop(client, TEST_BARBERSHOP, {
      onCreated: 'Tenant de teste criado com sucesso',
      onExisting: 'Tenant de teste já existe, reutilizando',
    });

    await ensureSubscription(client, {
      barbershopId: testBarbershop.id,
      plan: 'profissional',
    });

    await ensureUser(
      client,
      {
        ...TEST_ACCOUNT,
        barbershopId: testBarbershop.id,
      },
      {
        onCreated: 'Usuário teste criado com sucesso',
        onExisting: 'Usuário teste já existe, reutilizando',
      }
    );

    await validateConsistency(client, {
      adminEmail: ADMIN_ACCOUNT.email,
      testEmail: TEST_ACCOUNT.email,
      testBarbershopId: testBarbershop.id,
    });

    await client.query('COMMIT');
    console.log('Seed concluído com sucesso');
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Erro detalhado ao executar seed administrativo:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (client) {
      client.release();
    }

    await pool.end().catch(() => {});
  }
};

run();