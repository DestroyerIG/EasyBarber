# Legacy Migrations (Histórico)

Arquivos SQL executados manualmente antes da adoção do Prisma Migrate.

**NÃO executar novamente.** Estado já incorporado em `0_init/migration.sql`.

O banco foi criado via `database.sql` + `migration_v2.sql` ... `migration_v20_coupon_activation.sql`.
O baseline `0_init` representa o estado final dessas migrações.

A partir de agora: `npm run db:migrate` para qualquer mudança de schema.
