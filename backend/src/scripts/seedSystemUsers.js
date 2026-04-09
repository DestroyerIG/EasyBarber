import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import pool from '../config/database.js';
import { authRepository } from '../repositories/authRepository.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';

const BCRYPT_ROUNDS = 12;
const SUPABASE_PAGE_SIZE = 200;
const SUPABASE_MAX_PAGES = 20;

const ACCOUNTS = {
  platformAdmin: {
    key: 'platform-admin',
    email: 'contato@easyconnectcg.com.br',
    password: '@Easyconnect08',
    role: 'platform_admin',
    barbershop: {
      name: 'EasyBarber Plataforma',
      ownerName: 'Equipe EasyBarber',
      email: 'platform-admin@easybarber.local',
      whatsapp: '5599999990000',
      plan: 'premium',
    },
  },
  premiumTenantAdmin: {
    key: 'premium-tenant-admin',
    email: 'teste@easybarber.com',
    password: '@Easyconnect08',
    role: 'tenant_admin',
    barbershop: {
      name: 'EasyBarber Teste Premium',
      ownerName: 'Equipe EasyBarber',
      email: 'tenant-premium@easybarber.local',
      whatsapp: '5599999999999',
      plan: 'premium',
    },
  },
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const parseExecutionScope = () => {
  const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));

  if (!onlyArg) {
    return 'system-users';
  }

  const onlyValue = String(onlyArg.split('=')[1] || '').trim().toLowerCase();

  if (!['platform-admin', 'system-users'].includes(onlyValue)) {
    throw new Error(
      `Parametro --only invalido: ${onlyValue}. Use --only=platform-admin ou --only=system-users.`
    );
  }

  return onlyValue;
};

const resolveSupabaseAdminClient = () => {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias para executar seed:system-users.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

const isSupabaseUserExistsError = (error) => {
  const normalizedMessage = String(error?.message || '').toLowerCase();
  const normalizedCode = String(error?.code || error?.error_code || '').toLowerCase();

  return (
    normalizedCode === 'email_exists' ||
    normalizedCode === 'user_already_exists' ||
    normalizedMessage.includes('already registered') ||
    normalizedMessage.includes('already been registered')
  );
};

const findSupabaseUserByEmail = async (supabaseAdminClient, email) => {
  const normalizedEmail = normalizeEmail(email);

  for (let page = 1; page <= SUPABASE_MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({
      page,
      perPage: SUPABASE_PAGE_SIZE,
    });

    if (error) {
      throw new Error(`Falha ao listar usuarios no Supabase Auth: ${error.message}`);
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find((item) => normalizeEmail(item.email) === normalizedEmail);

    if (found) {
      return found;
    }

    if (users.length < SUPABASE_PAGE_SIZE) {
      break;
    }
  }

  return null;
};

const ensureSupabaseIdentity = async (supabaseAdminClient, { email, password, role }) => {
  const normalizedEmail = normalizeEmail(email);
  const metadataPatch = {
    source: 'easybarber',
    auth_provider: 'supabase',
    role,
    managed_by: 'seedSystemUsers',
  };

  let supabaseUser = await findSupabaseUserByEmail(supabaseAdminClient, normalizedEmail);

  if (!supabaseUser) {
    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: metadataPatch,
    });

    if (error && !isSupabaseUserExistsError(error)) {
      throw new Error(`Falha ao criar usuario no Supabase Auth (${normalizedEmail}): ${error.message}`);
    }

    if (data?.user?.id) {
      supabaseUser = data.user;
      console.log(`[supabase] usuario criado: ${normalizedEmail}`);
    } else {
      supabaseUser = await findSupabaseUserByEmail(supabaseAdminClient, normalizedEmail);
    }
  }

  if (!supabaseUser?.id) {
    throw new Error(`Nao foi possivel resolver usuario no Supabase Auth para ${normalizedEmail}`);
  }

  const { data: updatedData, error: updateError } = await supabaseAdminClient.auth.admin.updateUserById(
    supabaseUser.id,
    {
      password,
      email_confirm: true,
      user_metadata: {
        ...(supabaseUser.user_metadata || {}),
        ...metadataPatch,
      },
    }
  );

  if (updateError) {
    throw new Error(`Falha ao sincronizar usuario no Supabase Auth (${normalizedEmail}): ${updateError.message}`);
  }

  return {
    userId: updatedData?.user?.id || supabaseUser.id,
    email: normalizedEmail,
  };
};

const findBarbershopBySeedIdentity = async (client, { email, name }) => {
  const result = await client.query(
    `SELECT id, name, owner_name, email, whatsapp, plan, active
     FROM barbershops
     WHERE LOWER(email) = LOWER($1)
        OR LOWER(name) = LOWER($2)
     ORDER BY CASE WHEN LOWER(email) = LOWER($1) THEN 0 ELSE 1 END
     LIMIT 1`,
    [email, name]
  );

  return result.rows[0] || null;
};

const getBarbershopById = async (client, barbershopId) => {
  const result = await client.query(
    `SELECT id, name, owner_name, email, whatsapp, plan, subscription_status,
            subscription_current_period_start, subscription_current_period_end,
            subscription_cancel_at_period_end, active
     FROM barbershops
     WHERE id = $1
     LIMIT 1`,
    [barbershopId]
  );

  return result.rows[0] || null;
};

const ensureBarbershop = async (client, seedBarbershop) => {
  const existing = await findBarbershopBySeedIdentity(client, seedBarbershop);

  if (existing) {
    await client.query(
      `UPDATE barbershops
       SET name = $2,
           owner_name = $3,
           email = $4,
           whatsapp = $5,
           active = true,
           suspended_at = NULL,
           suspended_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        existing.id,
        seedBarbershop.name,
        seedBarbershop.ownerName,
        seedBarbershop.email,
        seedBarbershop.whatsapp,
      ]
    );

    console.log(`[db] barbershop sincronizada: ${seedBarbershop.name}`);
    return getBarbershopById(client, existing.id);
  }

  const created = await authRepository.createBarbershop(client, {
    name: seedBarbershop.name,
    ownerName: seedBarbershop.ownerName,
    email: seedBarbershop.email,
    whatsapp: seedBarbershop.whatsapp,
    plan: 'basico',
    desiredPlan: seedBarbershop.plan,
  });

  console.log(`[db] barbershop criada: ${seedBarbershop.name}`);
  return getBarbershopById(client, created.id);
};

const ensureBarbershopPremiumPlan = async (client, barbershopId) => {
  const context = await subscriptionRepository.getBarbershopBillingContext(barbershopId, client);

  if (!context) {
    throw new Error(`Barbershop nao encontrada para assinatura: ${barbershopId}`);
  }

  const now = new Date();
  const oneYearAhead = new Date(now);
  oneYearAhead.setFullYear(now.getFullYear() + 1);

  const currentPeriodStart = context.subscription_current_period_start || now;
  const currentPeriodEnd = context.subscription_current_period_end
    ? new Date(context.subscription_current_period_end)
    : oneYearAhead;

  const normalizedCurrentPeriodEnd = currentPeriodEnd > now ? currentPeriodEnd : oneYearAhead;

  await subscriptionRepository.updateSubscriptionState(
    barbershopId,
    {
      plan: 'premium',
      subscriptionStatus: 'active',
      currentPeriodStart,
      currentPeriodEnd: normalizedCurrentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
    client
  );

  await client.query(
    `UPDATE barbershops
     SET active = true,
         suspended_at = NULL,
         suspended_reason = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [barbershopId]
  );
};

const ensureInternalUser = async (client, {
  account,
  barbershopId,
  supabaseUserId,
}) => {
  const passwordHash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);

  const payload = {
    barbershopId,
    email: normalizeEmail(account.email),
    passwordHash,
    supabaseUserId,
    emailVerified: true,
  };

  const user = account.role === 'platform_admin'
    ? await authRepository.upsertPlatformAdminUser(client, payload)
    : await authRepository.upsertTenantAdminUser(client, payload);

  if (!user?.id) {
    throw new Error(`Falha ao persistir usuario interno: ${account.email}`);
  }

  await authRepository.revokeUserRefreshTokens(client, user.id);

  return {
    ...user,
    passwordHash,
  };
};

const validateSyncedUser = async (client, {
  email,
  expectedRole,
  expectedSupabaseUserId,
  expectedBarbershopId,
  shouldBePremium,
}) => {
  const result = await client.query(
    `SELECT u.id,
            u.email,
            u.role,
            u.blocked,
            u.email_verified,
            u.auth_provider,
            u.supabase_user_id,
            u.password_hash,
            b.id as barbershop_id,
            b.plan,
            b.subscription_status,
            b.active as barbershop_active
     FROM users u
     JOIN barbershops b ON b.id = u.barbershop_id
     WHERE LOWER(u.email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  const user = result.rows[0] || null;

  if (!user) {
    throw new Error(`Validacao falhou: usuario nao encontrado (${email})`);
  }

  if (user.role !== expectedRole) {
    throw new Error(`Validacao falhou: role invalida para ${email} (${user.role})`);
  }

  if (user.blocked) {
    throw new Error(`Validacao falhou: usuario bloqueado (${email})`);
  }

  if (!user.email_verified) {
    throw new Error(`Validacao falhou: email_verified false (${email})`);
  }

  if (user.auth_provider !== 'supabase') {
    throw new Error(`Validacao falhou: auth_provider invalido para ${email} (${user.auth_provider})`);
  }

  if (user.supabase_user_id !== expectedSupabaseUserId) {
    throw new Error(
      `Validacao falhou: supabase_user_id divergente para ${email} (${user.supabase_user_id})`
    );
  }

  if (user.barbershop_id !== expectedBarbershopId) {
    throw new Error(`Validacao falhou: barbershop_id divergente para ${email}`);
  }

  if (!user.barbershop_active) {
    throw new Error(`Validacao falhou: barbershop inativa para ${email}`);
  }

  if (!user.password_hash || String(user.password_hash).trim().length < 60) {
    throw new Error(`Validacao falhou: password_hash invalido para ${email}`);
  }

  if (shouldBePremium) {
    if (user.plan !== 'premium') {
      throw new Error(`Validacao falhou: plano invalido para ${email} (${user.plan})`);
    }

    if (user.subscription_status !== 'active') {
      throw new Error(
        `Validacao falhou: subscription_status invalido para ${email} (${user.subscription_status})`
      );
    }
  }
};

const resolveAccountsToRun = (scope) => {
  if (scope === 'platform-admin') {
    return [ACCOUNTS.platformAdmin];
  }

  return [ACCOUNTS.platformAdmin, ACCOUNTS.premiumTenantAdmin];
};

const run = async () => {
  const scope = parseExecutionScope();
  const accountsToRun = resolveAccountsToRun(scope);

  console.log(`Iniciando seed de usuarios do sistema (scope=${scope})...`);

  const supabaseAdminClient = resolveSupabaseAdminClient();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const account of accountsToRun) {
      console.log(`Processando conta: ${account.email}`);

      const supabaseIdentity = await ensureSupabaseIdentity(supabaseAdminClient, {
        email: account.email,
        password: account.password,
        role: account.role,
      });

      const barbershop = await ensureBarbershop(client, account.barbershop);

      if (!barbershop?.id) {
        throw new Error(`Falha ao garantir barbershop para ${account.email}`);
      }

      await ensureBarbershopPremiumPlan(client, barbershop.id);

      const internalUser = await ensureInternalUser(client, {
        account,
        barbershopId: barbershop.id,
        supabaseUserId: supabaseIdentity.userId,
      });

      await validateSyncedUser(client, {
        email: account.email,
        expectedRole: account.role,
        expectedSupabaseUserId: supabaseIdentity.userId,
        expectedBarbershopId: barbershop.id,
        shouldBePremium: true,
      });

      console.log(
        `[ok] usuario sincronizado: ${account.email} (role=${account.role}, userId=${internalUser.id})`
      );
    }

    await client.query('COMMIT');
    console.log('Seed concluido com sucesso.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao executar seed de usuarios do sistema:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
};

run();
