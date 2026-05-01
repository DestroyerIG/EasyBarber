# Instalação Completa

Guia completo para instalar o EasyBarber SaaS 2.0 em ambiente local.

## 1. Pré-requisitos

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (recomendado 16)
- Git
- Projeto Supabase com Auth habilitado

Verifique:

```bash
node -v
npm -v
psql --version
git --version
```

## 2. Clonar

```bash
git clone <url-do-repositorio>
cd Barberpro-saas-2.0
```

## 3. Instalar Dependências

```bash
npm run install:all
```

Equivalente manual:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 4. Variáveis de Ambiente

### Backend

```bash
cp backend/.env.example backend/.env
```

Campos mínimos:

```env
PORT=5000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=postgresql://postgres:senha@localhost:5432/barberpro
JWT_SECRET=troque_por_uma_chave_forte
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm
```

O `SUPABASE_SERVICE_ROLE_KEY` é necessário para scripts administrativos como `seed:auth-admin` e `seed:system-users`.

Variáveis opcionais por módulo:

- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e price IDs.
- Asaas Pix: `ASAAS_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`.
- WhatsApp: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `EVOLUTION_WEBHOOK_URL`.
- SMTP: opcional; não é usado para confirmação de autenticação no fluxo atual.

`AUTH_PROVIDER_MODE` é obsoleto. Supabase Auth é obrigatório.

### Frontend

```bash
cp frontend/.env.example frontend/.env.local
```

Campos mínimos:

```env
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## 5. Banco PostgreSQL

Crie o banco:

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

Aplique os arquivos SQL nesta ordem:

1. `backend/src/config/database.sql`
2. `backend/src/config/migration_v3.sql`
3. `backend/src/config/migration_v4.sql`
4. `backend/src/config/migration_v5.sql`
5. `backend/src/config/migration_v6.sql`
6. `backend/src/config/migration_v7.sql`
7. `backend/src/config/migration_v8.sql`
8. `backend/src/config/migration_v9.sql`
9. `backend/src/config/migration_v10.sql`
10. `backend/src/config/migration_v11.sql`
11. `backend/src/config/migration_v12.sql`
12. `backend/src/config/migration_v13.sql`
13. `backend/src/config/migration_v14.sql`
14. `backend/src/config/migration_v15.sql`
15. `backend/src/config/migration_v16_supabase_only_auth.sql`
16. `backend/src/config/migration_v17_subscription_access_gate.sql`
17. `backend/src/config/migration_v18_asaas_customer_id.sql`
18. `backend/src/config/migration_v19_business_days_and_intervals.sql`

Linux/macOS:

```bash
for file in backend/src/config/database.sql backend/src/config/migration_v3.sql backend/src/config/migration_v4.sql backend/src/config/migration_v5.sql backend/src/config/migration_v6.sql backend/src/config/migration_v7.sql backend/src/config/migration_v8.sql backend/src/config/migration_v9.sql backend/src/config/migration_v10.sql backend/src/config/migration_v11.sql backend/src/config/migration_v12.sql backend/src/config/migration_v13.sql backend/src/config/migration_v14.sql backend/src/config/migration_v15.sql backend/src/config/migration_v16_supabase_only_auth.sql backend/src/config/migration_v17_subscription_access_gate.sql backend/src/config/migration_v18_asaas_customer_id.sql backend/src/config/migration_v19_business_days_and_intervals.sql; do
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

## 6. Executar

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

## 7. Seeds Administrativos

Depois de configurar Supabase e banco:

```bash
npm run seed:auth-admin
npm run seed:system-users
```

## 8. Docker

```bash
docker compose up --build
```

Observação: o compose atual inicializa o banco até `migration_v15.sql`; aplique v16-v19 manualmente em bancos criados por ele.
