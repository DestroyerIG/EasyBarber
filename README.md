# EasyBarber SaaS 2.0

Plataforma SaaS para gestão de barbearias com agenda, clientes, serviços/barbeiros, financeiro, automações de WhatsApp, assinaturas e painel administrativo de plataforma.

## Visão Geral

O projeto é dividido em:

- `backend`: API Node.js/Express.
- `frontend`: aplicação Next.js com App Router.
- PostgreSQL como banco principal.
- Supabase Auth como provedor obrigatório de identidade.
- Stripe e Asaas para billing.
- Evolution API v2 externa para WhatsApp.

## Funcionalidades

- Cadastro, confirmação de e-mail e login via Supabase Auth.
- Sessão com cookies httpOnly e refresh token.
- Dashboard tenant.
- Gestão de agendamentos, clientes, serviços e barbeiros.
- Configuração operacional com dias de funcionamento, horários e intervalos de agenda.
- Financeiro com receitas, despesas e relatórios.
- Automação WhatsApp via Evolution API v2.
- Lembretes automáticos de agendamento via cron (2h antes, fuso da barbearia).
- Billing híbrido: Stripe para cartão/assinatura e Asaas para Pix.
- Controle de acesso por plano e status de assinatura.
- Admin de plataforma com métricas, tenants, assinaturas, bloqueios e logs.
- Páginas públicas de Termos de Uso (`/termos`) e Política de Privacidade (`/privacidade`).

## Stack

Backend:

- Node.js 20+
- TypeScript (strict)
- Express 4
- PostgreSQL via Prisma 5
- Zod
- JWT
- Supabase JS
- Pino
- Stripe
- Asaas via HTTP
- Vitest/Supertest

Frontend:

- Next.js 15
- React 18
- TypeScript
- Tailwind CSS
- Axios
- Recharts
- lucide-react

## Arquitetura

Backend:

```text
Route -> Middleware -> Controller -> Service -> Repository -> PostgreSQL
```

WhatsApp:

```text
Frontend -> Backend EasyBarber -> Evolution API v2 externa
```

Billing:

```text
Frontend -> Backend -> Stripe/Asaas -> Webhook -> Backend -> PostgreSQL
```

O frontend nunca chama Evolution API, Stripe secret ou Asaas diretamente.

## Estrutura

```text
backend/
  prisma/
    schema.prisma  # fonte de verdade do banco
    migrations/    # migrations Prisma (baseline + incrementais)
  src/
    config/        # Prisma client, Stripe client, plan permissions
    controllers/
    integrations/  # Asaas
    middleware/
    modules/       # módulos TS completos (appointments, billing, etc.)
    repositories/  # 100% Prisma
    routes/
    services/
    types/         # interfaces de domínio + Zod schemas
    validators/
    __tests__/

frontend/
  src/
    app/
    components/
    contexts/
    hooks/
    lib/
    styles/
    types/
```

Veja PROJECT_STRUCTURE.md para detalhes.

## Começar Rápido

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Configure Supabase e banco, depois:

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

URLs:

- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- Health: http://localhost:5000/health
- API: http://localhost:5000/api/v1

## Variáveis Principais

Backend mínimo:

```env
DATABASE_URL=postgresql://postgres:senha@localhost:5432/barberpro
JWT_SECRET=troque_por_uma_chave_forte
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm
```

Frontend mínimo:

```env
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

`AUTH_PROVIDER_MODE` é obsoleto. SMTP é opcional e não participa da confirmação de autenticação no fluxo atual.

## Banco

Banco novo exige aplicar o schema Prisma:

```bash
cd backend
npm run db:migrate:deploy   # produção
# ou
npm run db:migrate          # desenvolvimento
```

Schema em `prisma/schema.prisma`. Consulte DEPLOY.md para fluxo completo de banco em produção.

## Scripts

Raiz:

- `npm run install:all`
- `npm run dev:backend`
- `npm run dev:frontend`
- `npm run seed:auth-admin`
- `npm run seed:system-users`

Backend:

- `npm run dev`
- `npm start`
- `npm test`
- `npm run migrate:legacy-auth`

Frontend:

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run lint`

## API

Base URL:

- `http://localhost:5000/api/v1`

Principais grupos:

- `/auth`
- `/dashboard`
- `/appointments`
- `/clients`
- `/finance`
- `/barbershop`
- `/whatsapp`
- `/subscriptions`
- `/billing`
- `/admin`

Veja API_DOCS.md para endpoints e contratos.

## Billing

- Stripe: assinatura recorrente/cartão, portal e webhooks.
- Asaas: Pix com QR Code e webhook.
- Status não ativos restringem acesso a billing/status conforme PLANOS.md.

## WhatsApp

- Provider atual: Evolution API v2 externa.
- Webhook principal: `/api/v1/whatsapp/webhook`.
- Tenant por instância: `barbershops.whatsapp_instance_name`.

Veja WHATSAPP_BOT.md.

## Docker

```bash
docker compose up --build
```

Atenção: o compose atual aplica automaticamente até `migration_v15.sql`; aplique v16-v19 manualmente para schema completo.

## Documentação

- START_HERE.md: caminho de leitura.
- QUICK_START.md: setup rápido.
- INSTALL.md: instalação completa.
- POSTGRESQL_SETUP.md: banco e migrations.
- API_DOCS.md: API REST.
- PLANOS.md: planos e gates.
- WHATSAPP_BOT.md: WhatsApp/Evolution.
- DEPLOY.md: produção.
- TROUBLESHOOTING.md: diagnóstico.
