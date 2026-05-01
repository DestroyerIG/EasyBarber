# Quick Start

Fluxo curto para subir o projeto em desenvolvimento.

## Pré-requisitos

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (recomendado 16)
- Conta/projeto Supabase configurado para Auth

## 1. Instalar Dependências

```bash
git clone <url-do-repositorio>
cd Barberpro-saas-2.0
npm run install:all
```

## 2. Configurar Ambiente

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

No mínimo, configure no `backend/.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:senha@localhost:5432/barberpro
JWT_SECRET=troque_por_uma_chave_forte
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm
```

No `frontend/.env.local`:

```env
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## 3. Preparar Banco

Crie o banco se ainda não existir:

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

Aplique o schema:

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
  backend/src/config/migration_v18_asaas_customer_id.sql
do
  psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f "$file"
done
```

No Windows PowerShell, use os comandos detalhados em POSTGRESQL_SETUP.md.

## 4. Subir Serviços

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm run dev
```

URLs:

- Frontend: http://localhost:3000
- Backend health: http://localhost:5000/health
- API: http://localhost:5000/api/v1

## 5. Validar

```bash
curl http://localhost:5000/health
```

Depois teste:

- Cadastro em `/cadastro`.
- Confirmação de e-mail via Supabase.
- Login em `/login`.
- Acesso ao `/dashboard`.

## Docker Compose

```bash
docker compose up --build
```

Atenção: o compose atual aplica automaticamente até `migration_v15.sql` no primeiro bootstrap do volume. Para usar o schema atual completo, aplique v16, v17 e v18 manualmente no banco do container, conforme POSTGRESQL_SETUP.md.
