import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

const SUPABASE_PAGE_SIZE = 200;
const SUPABASE_MAX_PAGES = 50;

interface LocalUser {
  id: string;
  email: string;
  role: string;
  email_verified: boolean;
  email_verified_at: Date | null;
  supabase_user_id: string | null;
  auth_provider: string | null;
}

interface SupabaseUserResult {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface EnsureSupabaseUserResult {
  supabaseUser: SupabaseUserResult;
  temporaryPassword: string | null;
  created: boolean;
}

interface ExportedPassword {
  email: string;
  temporaryPassword: string;
}

const normalizeEmail = (email: unknown): string => String(email || '').trim().toLowerCase();

const generateTemporaryPassword = (): string => {
  return `Eb-${crypto.randomBytes(24).toString('base64url')}1a!`;
};

const resolveSupabaseAdminClient = (): SupabaseClient => {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias para migrar usuarios.');
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
    const found = users.find((user) => normalizeEmail(user?.email) === normalizedEmail);

    if (found) {
      return found as SupabaseUserResult;
    }

    if (users.length < SUPABASE_PAGE_SIZE) {
      break;
    }
  }

  return null;
};

const ensureSupabaseUser = async (supabaseAdminClient: SupabaseClient, localUser: LocalUser): Promise<EnsureSupabaseUserResult> => {
  const email = normalizeEmail(localUser.email);
  const existingUser = await findSupabaseUserByEmail(supabaseAdminClient, email);

  if (existingUser?.id) {
    if (localUser.email_verified && !existingUser.email_confirmed_at && !existingUser.confirmed_at) {
      const { data, error } = await supabaseAdminClient.auth.admin.updateUserById(existingUser.id, {
        email_confirm: true,
      });

      if (error) {
        throw new Error(`Falha ao confirmar e-mail no Supabase Auth (${email}): ${error.message}`);
      }

      return {
        supabaseUser: (data?.user as SupabaseUserResult) || existingUser,
        temporaryPassword: null,
        created: false,
      };
    }

    return {
      supabaseUser: existingUser,
      temporaryPassword: null,
      created: false,
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data, error } = await supabaseAdminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: Boolean(localUser.email_verified),
    user_metadata: {
      source: 'easybarber',
      migrated_from: 'legacy',
      local_user_id: localUser.id,
      role: localUser.role,
    },
  });

  if (error && !isSupabaseUserExistsError(error)) {
    throw new Error(`Falha ao criar usuario no Supabase Auth (${email}): ${error.message}`);
  }

  const supabaseUser = (data?.user as SupabaseUserResult | undefined)?.id
    ? (data!.user as SupabaseUserResult)
    : await findSupabaseUserByEmail(supabaseAdminClient, email);

  if (!supabaseUser?.id) {
    throw new Error(`Nao foi possivel resolver usuario no Supabase Auth para ${email}`);
  }

  return {
    supabaseUser,
    temporaryPassword,
    created: true,
  };
};

const fetchUsersToMigrate = async (): Promise<LocalUser[]> => {
  const result = await prisma.$queryRaw<LocalUser[]>(Prisma.sql`
    SELECT id,
           email,
           role,
           email_verified,
           email_verified_at,
           supabase_user_id,
           auth_provider
    FROM users
    WHERE LOWER(COALESCE(auth_provider, 'legacy')) = 'legacy'
       OR supabase_user_id IS NULL
    ORDER BY created_at ASC, email ASC
  `);

  return result;
};

const updateLocalUser = async (localUserId: string, supabaseUserId: string, shouldMarkEmailVerified: boolean): Promise<LocalUser | null> => {
  const result = await prisma.$queryRaw<LocalUser[]>(Prisma.sql`
    UPDATE users
    SET auth_provider = 'supabase',
        supabase_user_id = ${supabaseUserId},
        email_verified = CASE WHEN ${shouldMarkEmailVerified} THEN true ELSE email_verified END,
        email_verified_at = CASE
          WHEN ${shouldMarkEmailVerified} THEN COALESCE(email_verified_at, NOW())
          ELSE email_verified_at
        END,
        last_identity_sync_at = NOW(),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${localUserId}::uuid
    RETURNING id, email, auth_provider, supabase_user_id, email_verified, email_verified_at
  `);

  return result[0] || null;
};

const writeTemporaryPasswordCsv = (rows: ExportedPassword[]): string | null => {
  if (process.env.EXPORT_TEMP_PASSWORDS !== 'true' || rows.length === 0) {
    return null;
  }

  const outputDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });

  const outputPath = path.join(
    outputDir,
    `legacy-supabase-temp-passwords-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
  );

  const csv = [
    'email,temp_password',
    ...rows.map((row) => `${JSON.stringify(row.email)},${JSON.stringify(row.temporaryPassword)}`),
  ].join('\n');

  fs.writeFileSync(outputPath, `${csv}\n`, { mode: 0o600 });
  return outputPath;
};

const run = async (): Promise<void> => {
  const supabaseAdminClient = resolveSupabaseAdminClient();
  const users = await fetchUsersToMigrate();
  const exportedPasswords: ExportedPassword[] = [];

  console.log(`Usuarios candidatos para migracao: ${users.length}`);

  for (const localUser of users) {
    const email = normalizeEmail(localUser.email);

    try {
      const { supabaseUser, temporaryPassword, created } = await ensureSupabaseUser(
        supabaseAdminClient,
        localUser
      );
      const shouldMarkEmailVerified = Boolean(
        localUser.email_verified ||
        supabaseUser.email_confirmed_at ||
        supabaseUser.confirmed_at
      );

      const updatedUser = await updateLocalUser(
        localUser.id,
        supabaseUser.id,
        shouldMarkEmailVerified
      );

      if (temporaryPassword) {
        exportedPasswords.push({ email, temporaryPassword });
      }

      console.log(
        `[ok] ${email} -> ${supabaseUser.id} (${created ? 'criado no Supabase' : 'vinculado existente'}, local=${updatedUser?.id || localUser.id})`
      );
    } catch (error) {
      console.error(`[erro] ${email}: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }

  const csvPath = writeTemporaryPasswordCsv(exportedPasswords);

  if (csvPath) {
    console.log(`CSV seguro com senhas temporarias exportado em: ${csvPath}`);
  } else if (exportedPasswords.length > 0) {
    console.log('Senhas temporarias geradas, mas nao exportadas. Defina EXPORT_TEMP_PASSWORDS=true se precisar do CSV local.');
  }

  await prisma.$disconnect().catch(() => {});
};

run().catch(async (error) => {
  console.error('Migracao legacy -> Supabase falhou:');
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
