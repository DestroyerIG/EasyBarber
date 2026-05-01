# Estrutura do Projeto

Visão técnica do layout atual do repositório e das responsabilidades principais.

## Raiz

```text
.
├── backend/
├── frontend/
├── docker-compose.yml
├── package.json
├── README.md
├── QUICK_START.md
├── INSTALL.md
├── POSTGRESQL_SETUP.md
├── API_DOCS.md
├── DEPLOY.md
└── TROUBLESHOOTING.md
```

## Backend

```text
backend/
├── Dockerfile
├── check-db.js
├── jest.config.js
├── package.json
└── src/
    ├── __tests__/
    ├── config/
    ├── controllers/
    ├── integrations/
    ├── middleware/
    ├── repositories/
    ├── routes/
    ├── scripts/
    ├── services/
    ├── utils/
    ├── validators/
    └── server.js
```

### `backend/src/config`

- `database.js`: pool PostgreSQL.
- `database.sql`: schema base.
- `migration_v2.sql` até `migration_v18_asaas_customer_id.sql`: evoluções de schema.
- `authProviderMode.js`: legado; Supabase Auth é obrigatório no fluxo atual.
- `planPermissions.js`: matriz de features por plano/status.
- `stripe.js`: cliente e helpers Stripe.

### `backend/src/controllers`

Traduzem HTTP para serviços de domínio:

- Auth, dashboard, agendamentos, clientes, financeiro, serviços, barbeiros.
- Configurações da barbearia/conta.
- Assinaturas/billing.
- Admin de plataforma.

### `backend/src/routes`

Rotas sob `/api/v1`:

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
- `/debug`

Rotas `/api/*` sem `/v1` são redirecionadas para `/api/v1/*`.

### `backend/src/services`

Contém regras de negócio e integrações de domínio:

- `authService.js` e `supabaseAuthService.js`.
- `billingService.js`, `stripeCheckoutService.js` e `services/billing/*`.
- `integrations/asaas/*` para Pix.
- `whatsapp/*` e `evolutionApiService.js`.
- `featureAccessService.js` para plano/status.
- `cronService.js` para lembretes.

### `backend/src/repositories`

Acesso a PostgreSQL por domínio. A camada service deve preferir repositories em vez de SQL espalhado.

### `backend/src/validators`

Schemas Zod para validação de payloads, params e queries.

### `backend/src/__tests__`

Testes Jest/Supertest cobrindo auth, CRUDs, billing, Asaas, WhatsApp e regras de acesso.

## Frontend

```text
frontend/
├── Dockerfile
├── next.config.js
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── src/
    ├── app/
    ├── assets/
    ├── components/
    ├── contexts/
    ├── hooks/
    ├── lib/
    ├── styles/
    ├── types/
    └── utils/
```

### `frontend/src/app`

Next.js App Router:

- Públicas: `/`, `/login`, `/cadastro`, `/verificar-email`, `/esqueci-senha`, `/pagamento`.
- Auth callback: `/auth/confirm`.
- Dashboard tenant: `/dashboard/*`.
- Admin plataforma: `/admin/*`.
- BFF/proxy interno: `/api/*`.

### `frontend/src/components`

Componentes de domínio e UI:

- Dashboard, agenda, clientes, financeiro, serviços/barbeiros.
- Billing, WhatsApp, auth, admin e componentes reutilizáveis.

### `frontend/src/lib`

Clientes e helpers:

- `api.ts`: cliente HTTP.
- `adminApi.ts`: chamadas admin.
- `billing.ts`, `plans.ts`, `subscriptionAccess.ts`.
- `supabase/*`: cliente Supabase frontend.
- `server/*`: BFF/proxy.

## Scripts Principais

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
- `npm run seed:system-users`
- `npm run migrate:legacy-auth`

Frontend:

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run lint`

## Observação Sobre Bootstrap

`docker-compose.yml` e `setup.ps1` aplicam automaticamente migrations até `migration_v15.sql`. Para o schema mais recente, aplique manualmente `migration_v16_supabase_only_auth.sql`, `migration_v17_subscription_access_gate.sql` e `migration_v18_asaas_customer_id.sql` em bancos criados por esses fluxos.
