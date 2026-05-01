# PostgreSQL e Migrations SQL

Guia para preparar, validar e manter o banco PostgreSQL do projeto.

## Banco Utilizado

- PostgreSQL 14+; recomendado 16.
- Driver Node.js: `pg`.
- Conexão via `DATABASE_URL`.
- SQL em `backend/src/config`.

## Arquivos SQL Atuais

Ordem recomendada para banco novo:

1. `database.sql`
2. `migration_v3.sql`
3. `migration_v4.sql`
4. `migration_v5.sql`
5. `migration_v6.sql`
6. `migration_v7.sql`
7. `migration_v8.sql`
8. `migration_v9.sql`
9. `migration_v10.sql`
10. `migration_v11.sql`
11. `migration_v12.sql`
12. `migration_v13.sql`
13. `migration_v14.sql`
14. `migration_v15.sql`
15. `migration_v16_supabase_only_auth.sql`
16. `migration_v17_subscription_access_gate.sql`
17. `migration_v18_asaas_customer_id.sql`
18. `migration_v19_business_days_and_intervals.sql`

`migration_v2.sql` existe no repositório por histórico, mas o fluxo documentado atual parte de `database.sql` seguido de v3+.

## Criar Banco

Linux/macOS:

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

Windows PowerShell:

```powershell
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

## Encoding

Este projeto usa textos em português e mensagens de WhatsApp. Use UTF-8.

```sql
SHOW server_encoding;
SHOW client_encoding;
```

Esperado:

- `server_encoding = UTF8`
- `client_encoding = UTF8`

No PowerShell:

```powershell
chcp 65001
$env:PGCLIENTENCODING = "UTF8"
```

## Aplicar Schema Completo

Linux/macOS:

```bash
for file in \
  backend/src/config/database.sql \
  backend/src/config/migration_v3.sql \
  backend/src/config/migration_v4.sql \
  backend/src/config/migration_v5.sql \
  backend/src/config/migration_v6.sql \
  backend/src/config/migration_v7.sql \
  backend/src/config/migration_v8.sql \
  backend/src/config/migration_v9.sql \
  backend/src/config/migration_v10.sql \
  backend/src/config/migration_v11.sql \
  backend/src/config/migration_v12.sql \
  backend/src/config/migration_v13.sql \
  backend/src/config/migration_v14.sql \
  backend/src/config/migration_v15.sql \
  backend/src/config/migration_v16_supabase_only_auth.sql \
  backend/src/config/migration_v17_subscription_access_gate.sql \
  backend/src/config/migration_v18_asaas_customer_id.sql \
  backend/src/config/migration_v19_business_days_and_intervals.sql
do
  psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f "$file"
done
```

PowerShell:

```powershell
$files = @(
  "backend/src/config/database.sql",
  "backend/src/config/migration_v3.sql",
  "backend/src/config/migration_v4.sql",
  "backend/src/config/migration_v5.sql",
  "backend/src/config/migration_v6.sql",
  "backend/src/config/migration_v7.sql",
  "backend/src/config/migration_v8.sql",
  "backend/src/config/migration_v9.sql",
  "backend/src/config/migration_v10.sql",
  "backend/src/config/migration_v11.sql",
  "backend/src/config/migration_v12.sql",
  "backend/src/config/migration_v13.sql",
  "backend/src/config/migration_v14.sql",
  "backend/src/config/migration_v15.sql",
  "backend/src/config/migration_v16_supabase_only_auth.sql",
  "backend/src/config/migration_v17_subscription_access_gate.sql",
  "backend/src/config/migration_v18_asaas_customer_id.sql",
  "backend/src/config/migration_v19_business_days_and_intervals.sql"
)
foreach ($file in $files) {
  psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f $file
}
```

Com `DATABASE_URL`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/database.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v7.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v8.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v9.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v10.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v11.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v12.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v13.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v14.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v15.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v16_supabase_only_auth.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v17_subscription_access_gate.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v18_asaas_customer_id.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v19_business_days_and_intervals.sql
```

## Docker Compose

O `docker-compose.yml` atual monta automaticamente `database.sql` e migrations v3-v15 no primeiro bootstrap do volume `pgdata`.

Depois de subir:

```bash
docker compose up -d db
```

Aplique as migrations restantes:

```bash
cat backend/src/config/migration_v16_supabase_only_auth.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v17_subscription_access_gate.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v18_asaas_customer_id.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v19_business_days_and_intervals.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
```

PowerShell:

```powershell
Get-Content .\backend\src\config\migration_v16_supabase_only_auth.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v17_subscription_access_gate.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v18_asaas_customer_id.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v19_business_days_and_intervals.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
```

## Validação Rápida

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT 1;"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.auth_signup_pending');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.billing_events');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.whatsapp_menu_options');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'barbershop_settings' AND column_name = 'dias_abertos';"
```

## Backup Antes de Produção

Antes de aplicar migration em banco com dados:

```bash
pg_dump "$DATABASE_URL" > backup_barberpro_$(date +%Y%m%d_%H%M%S).sql
```

## Erros Comuns

- Rodar comandos fora da raiz do repositório.
- Aplicar migrations fora de ordem.
- Criar banco sem UTF-8.
- Esquecer `pgcrypto`.
- Usar compose/setup e não aplicar v16-v19 depois.
