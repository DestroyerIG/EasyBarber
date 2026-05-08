import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { authRepository } from '../repositories/authRepository.js';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';

const SUPABASE_PAGE_SIZE = 200;
const SUPABASE_MAX_PAGES = 20;
const PASSWORD_HASH_PLACEHOLDER_PREFIX = 'supabase:';

interface SeedBarbershop {
  name: string;
  ownerName: string;
  email: string;
  whatsapp: string;
  plan: string;
}

interface SeedAccount {
  key: string;
  email: string;
  password: string;
  role: string;
  barbershop: SeedBarbershop;
}

interface SupabaseUserResult {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface BarbershopRecord {
  id: string;
  name: string;
  owner_name?: string;
  email?: string;
  whatsapp?: string;
  plan?: string;
  subscription_status?: string | null;
  subscription_current_period_start?: Date | null;
  subscription_current_period_end?: Date | null;
  subscription_cancel_at_period_end?: boolean | null;
  active?: boolean;
}

interface InternalUserRecord {
  id: string;
  email: string;
  role?: string;
  barbershop_id?: string;
  [key: string]: unknown;
}

const ACCOUNTS: Record<string, SeedAccount> = {
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

const normalizeEmail = (email: unknown): string => String(email || '').trim().toLowerCase();

const generateSupabasePasswordHashPlaceholder = (): string => {
  return `${PASSWORD_HASH_PLACEHOLDER_PREFIX}${crypto.randomBytes(64).toString('hex').slice(0, 51)}`;
};

const parseExecutionScope = (): string => {
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

const resolveSupabaseAdminClient = (): SupabaseClient => {
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

const isSupabaseUserExistsError = (error: unknown): boolean => {
  const errObj = error as Record<string, unknown>;
  const normalizedMessage = String(errObj?.message || '').toLowerCase();
  const normalizedCode = String(errObj?.code || errObj?.error_code || '').toLowerCase();

  return (
    normalizedCode === 'email_exists' ||
    normalizedCode === 'user_already_exists' ||
    normalizedMessage.includes('already registered') ||
    normalizedMessage.includes('already been registered')
  );
};

const findSupabaseUserByEmail = async (supabaseAdminClient: SupabaseClient, email: string): Promise<SupabaseUserResult | null> => {
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
      return found as SupabaseUserResult;
    }

    if (users.length < SUPABASE_PAGE_SIZE) {
      break;
    }
  }

  return null;
};

const ensureSupabaseIdentity = async (
  supabaseAdminClient: SupabaseClient,
  { email, password, role }: { email: string; password: string; role: string }
): Promise<{ userId: string; email: string }> => {
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

    if ((data?.user as SupabaseUserResult | undefined)?.id) {
      supabaseUser = data!.user as SupabaseUserResult;
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
    userId: (updatedData?.user as SupabaseUserResult | undefined)?.id || supabaseUser.id,
    email: normalizedEmail,
  };
};

const findBarbershopBySeedIdentity = async (
  { email, name }: { email: string; name: string }
): Promise<BarbershopRecord | null> => {
  const result = await prisma.$queryRaw<BarbershopRecord[]>(Prisma.sql`
    SELECT id, name, owner_name, email, whatsapp, plan, active
    FROM barbershops
    WHERE LOWER(email) = LOWER(${email})
       OR LOWER(name) = LOWER(${name})
    ORDER BY CASE WHEN LOWER(email) = LOWER(${email}) THEN 0 ELSE 1 END
    LIMIT 1
  `);

  return result[0] || null;
};

const getBarbershopById = async (barbershopId: string): Promise<BarbershopRecord | null> => {
  const result = await prisma.$queryRaw<BarbershopRecord[]>(Prisma.sql`
    SELECT id, name, owner_name, email, whatsapp, plan, subscription_status,
           subscription_current_period_start, subscription_current_period_end,
           subscription_cancel_at_period_end, active
    FROM barbershops
    WHERE id = ${barbershopId}::uuid
    LIMIT 1
  `);

  return result[0] || null;
};

const ensureBarbershop = async (seedBarbershop: SeedBarbershop): Promise<BarbershopRecord | null> => {
  const existing = await findBarbershopBySeedIdentity(seedBarbershop);

  if (existing) {
    await prisma.$queryRaw(Prisma.sql`
      UPDATE barbershops
      SET name = ${seedBarbershop.name},
          owner_name = ${seedBarbershop.ownerName},
          email = ${seedBarbershop.email},
          whatsapp = ${seedBarbershop.whatsapp},
          active = true,
          suspended_at = NULL,
          suspended_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${existing.id}::uuid
    `);

    console.log(`[db] barbershop sincronizada: ${seedBarbershop.name}`);
    return getBarbershopById(existing.id);
  }

  const created = await authRepository.createBarbershop(null, {
    name: seedBarbershop.name,
    ownerName: seedBarbershop.ownerName,
    email: seedBarbershop.email,
    whatsapp: seedBarbershop.whatsapp,
    plan: 'basico',
    desiredPlan: seedBarbershop.plan,
  }) as unknown as BarbershopRecord;

  console.log(`[db] barbershop criada: ${seedBarbershop.name}`);
  return getBarbershopById(created.id);
};

const ensureBarbershopPremiumPlan = async (barbershopId: string): Promise<void> => {
  const context = await subscriptionRepository.getBarbershopBillingContext(barbershopId, null);

  if (!context) {
    throw new Error(`Barbershop nao encontrada para assinatura: ${barbershopId}`);
  }

  const contextRecord = context as Record<string, unknown>;
  const now = new Date();
  const oneYearAhead = new Date(now);
  oneYearAhead.setFullYear(now.getFullYear() + 1);

  const currentPeriodStart = (contextRecord.subscription_current_period_start as Date | null) || now;
  const currentPeriodEnd = contextRecord.subscription_current_period_end
    ? new Date(contextRecord.subscription_current_period_end as string | Date)
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
    null
  );

  await prisma.$queryRaw(Prisma.sql`
    UPDATE barbershops
    SET active = true,
        suspended_at = NULL,
        suspended_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${barbershopId}::uuid
  `);
};

const ensureInternalUser = async ({
  account,
  barbershopId,
  supabaseUserId,
}: {
  account: SeedAccount;
  barbershopId: string;
  supabaseUserId: string;
}): Promise<InternalUserRecord & { passwordHash: string }> => {
  const passwordHash = generateSupabasePasswordHashPlaceholder();

  const payload = {
    barbershopId,
    email: normalizeEmail(account.email),
    passwordHash,
    supabaseUserId,
    emailVerified: true,
  };

  const user = account.role === 'platform_admin'
    ? await authRepository.upsertPlatformAdminUser(null, payload) as InternalUserRecord
    : await authRepository.upsertTenantAdminUser(null, payload) as InternalUserRecord;

  if (!user?.id) {
    throw new Error(`Falha ao persistir usuario interno: ${account.email}`);
  }

  await refreshTokenRepository.revokeUserRefreshTokens(user.id);

  return {
    ...user,
    passwordHash,
  };
};

const validateSyncedUser = async ({
  email,
  expectedRole,
  expectedSupabaseUserId,
  expectedBarbershopId,
  shouldBePremium,
}: {
  email: string;
  expectedRole: string;
  expectedSupabaseUserId: string;
  expectedBarbershopId: string;
  shouldBePremium: boolean;
}): Promise<void> => {
  const result = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT u.id,
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
    WHERE LOWER(u.email) = LOWER(${email})
    LIMIT 1
  `);

  const user = result[0] || null;

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

const resolveAccountsToRun = (scope: string): SeedAccount[] => {
  if (scope === 'platform-admin') {
    return [ACCOUNTS['platformAdmin']!];
  }

  return [ACCOUNTS['platformAdmin']!, ACCOUNTS['premiumTenantAdmin']!];
};

const run = async (): Promise<void> => {
  const scope = parseExecutionScope();
  const accountsToRun = resolveAccountsToRun(scope);

  console.log(`Iniciando seed de usuarios do sistema (scope=${scope})...`);

  const supabaseAdminClient = resolveSupabaseAdminClient();

  try {
    for (const account of accountsToRun) {
      console.log(`Processando conta: ${account.email}`);

      const supabaseIdentity = await ensureSupabaseIdentity(supabaseAdminClient, {
        email: account.email,
        password: account.password,
        role: account.role,
      });

      const barbershop = await ensureBarbershop(account.barbershop);

      if (!barbershop?.id) {
        throw new Error(`Falha ao garantir barbershop para ${account.email}`);
      }

      await ensureBarbershopPremiumPlan(barbershop.id);

      const internalUser = await ensureInternalUser({
        account,
        barbershopId: barbershop.id,
        supabaseUserId: supabaseIdentity.userId,
      });

      await validateSyncedUser({
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

    console.log('Seed concluido com sucesso.');
  } catch (error) {
    console.error('Erro ao executar seed de usuarios do sistema:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
};

run();
