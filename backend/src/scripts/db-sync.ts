/**
 * db-sync.ts — sincroniza banco existente com Prisma Migrate.
 * Idempotente. Uso: tsx src/scripts/db-sync.ts
 */

import { execSync } from 'child_process';
import { prisma } from '../config/prisma.js';
import dotenv from 'dotenv';

dotenv.config();

const BASELINE_MIGRATION = '0_init';

async function checkPrismaMigrationsTableExists(): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = '_prisma_migrations'
    ) AS exists
  `;
  return result[0]?.exists ?? false;
}

async function checkBaselineAlreadyApplied(): Promise<boolean> {
  const exists = await checkPrismaMigrationsTableExists();
  if (!exists) return false;

  const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM _prisma_migrations
    WHERE migration_name = ${BASELINE_MIGRATION}
  `;
  return Number(result[0]?.count ?? 0) > 0;
}

async function checkLegacyBankExists(): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'barbershops'
    ) AS exists
  `;
  return result[0]?.exists ?? false;
}

function runCommand(cmd: string, label: string): void {
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
}

async function main(): Promise<void> {
  console.log('=== Barberpro DB Sync ===\n');

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✓ Conexão com banco estabelecida');
  } catch (err) {
    console.error('✗ Falha ao conectar ao banco:', err);
    process.exit(1);
  }

  const baselineApplied = await checkBaselineAlreadyApplied();

  if (baselineApplied) {
    console.log('✓ Baseline já aplicado. Verificando migrations pendentes...');
    runCommand('npx prisma migrate status', 'Status das migrations');
    console.log('\n✓ Banco sincronizado. Nenhuma ação necessária.');
    return;
  }

  const legacyBankExists = await checkLegacyBankExists();

  if (legacyBankExists) {
    console.log('⚠  Banco legado detectado (tabela barbershops existe, sem _prisma_migrations).');
    console.log('   Aplicando baseline sem executar SQL...\n');
    runCommand(`npx prisma migrate resolve --applied "${BASELINE_MIGRATION}"`, 'Registrar baseline');
    console.log('\n✓ Baseline registrado. Banco legado sincronizado com Prisma.');
    console.log('  A partir de agora use: npm run db:migrate\n');
  } else {
    console.log('ℹ  Banco vazio detectado. Aplicando schema completo...\n');
    runCommand('npx prisma migrate deploy', 'Aplicar migrations');
    console.log('\n✓ Schema aplicado do zero via Prisma Migrate.');
  }

  runCommand('npx prisma migrate status', 'Status final');
}

main()
  .catch((err) => {
    console.error('\n✗ Erro durante sync:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
