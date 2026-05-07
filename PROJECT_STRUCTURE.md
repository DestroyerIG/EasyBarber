# Project Structure — EasyBarber SaaS 2.0

Stack: Node.js 20 + Express 4 + TypeScript + Prisma 5 + PostgreSQL + Next.js (frontend).

---

## Backend (`backend/`)

```
backend/
├── prisma/
│   ├── schema.prisma              # Schema único — fonte de verdade do banco
│   └── migrations/
│       ├── 0_init/                # Baseline do banco legado
│       └── legacy/                # Histórico SQL antigo (não executar)
├── src/
│   ├── server.ts                  # Entry point principal (TypeScript)
│   ├── telemetry.ts               # OpenTelemetry (opcional via OTEL_ENABLED)
│   ├── types/
│   │   ├── domain.ts              # Interfaces de domínio + Zod schemas
│   │   └── express.d.ts           # Augmentação do Request (req.user, req.requestId)
│   ├── config/
│   │   ├── prisma.ts              # Prisma Client singleton
│   │   ├── stripe.ts              # Stripe Client
│   │   ├── authProviderMode.ts    # Config do modo de auth
│   │   └── planPermissions.ts     # Mapa de permissões por plano
│   ├── middleware/
│   │   ├── auth.ts                # JWT + subscription enforcement
│   │   ├── rbac.ts                # Role-based access control
│   │   ├── validate.ts            # Zod request validation
│   │   ├── subscriptionGuard.ts   # Feature gating por plano
│   │   └── errorHandler.ts        # Global error handler
│   ├── utils/
│   │   ├── errors.ts              # AppError + subclasses tipadas
│   │   ├── logger.ts              # Pino logger estruturado
│   │   ├── response.ts            # sendSuccess / sendCreated helpers
│   │   ├── roles.ts               # Role constants
│   │   ├── date.ts                # Date helpers
│   │   ├── cpfCnpj.ts             # CPF/CNPJ validation
│   │   ├── whatsapp.ts            # WhatsApp message utils
│   │   └── whatsappGreeting.ts    # Greeting generation
│   ├── modules/                   # Módulos TypeScript + Prisma
│   │   ├── appointments/          # controller, service, repository, routes, types
│   │   ├── billing/               # controller, repository, routes, types
│   │   ├── auth/                  # routes (re-exporta routes/auth.ts)
│   │   ├── dashboard/             # routes (re-exporta routes/dashboard.ts)
│   │   ├── clients/               # routes (re-exporta routes/clients.ts)
│   │   ├── finance/               # routes (re-exporta routes/finance.ts)
│   │   ├── barbershop/            # routes (re-exporta routes/barbershop.ts)
│   │   ├── whatsapp/              # routes (re-exporta routes/whatsapp.ts)
│   │   ├── subscriptions/         # routes (re-exporta routes/subscriptions.ts)
│   │   ├── admin/                 # routes (re-exporta routes/admin.ts)
│   │   └── core/
│   │       ├── index.ts           # Re-exports de utils, config, middleware
│   │       └── middleware/
│   │           ├── requestId.ts   # UUID por request
│   │           ├── httpLogger.ts  # HTTP access log estruturado
│   │           ├── sanitize.ts    # XSS sanitization
│   │           └── security.ts    # Helmet + rate limit por tenant
│   ├── repositories/              # 100% Prisma
│   │   ├── adminRepository.ts
│   │   ├── auditRepository.ts
│   │   ├── authRepository.ts
│   │   ├── barberRepository.ts
│   │   ├── barbershopSettingsRepository.ts
│   │   ├── clientRepository.ts
│   │   ├── dashboardRepository.ts
│   │   ├── financeRepository.ts
│   │   ├── serviceRepository.ts
│   │   └── subscriptionRepository.ts
│   ├── controllers/               # TypeScript
│   ├── services/                  # TypeScript
│   │   ├── billing/               # billingProviderFactory, providers (Stripe/Asaas)
│   │   └── whatsapp/              # WhatsApp services (alto volume de lógica)
│   ├── routes/                    # TypeScript
│   ├── integrations/
│   │   └── asaas/                 # Asaas HTTP client
│   ├── bot/
│   │   └── botOrchestrator.ts     # WhatsApp bot orchestrator
│   ├── validators/schemas/        # Zod schemas
│   └── scripts/
│       ├── db-sync.ts             # Sincroniza banco com Prisma (idempotente)
│       └── seedSystemUsers.ts     # Seed de usuários de sistema
├── tsconfig.json                  # strict + noUncheckedIndexedAccess + moduleResolution: bundler
└── package.json
```

---

## Fluxo de Dados

```
Request
  → server.ts (requestId, httpLogger, sanitize, helmet, rate-limit)
  → modules/*/routes.ts
  → controllers/*.ts
  → services/*.ts
  → repositories/*.ts (100% Prisma)
  → Prisma Client → PostgreSQL
```

---

## Acesso a Dados

| Camada | Tecnologia |
|---|---|
| Repositories | Prisma Client API |
| Modules (appointments, billing) | Prisma Client API |
| Services / Controllers / Routes | Prisma via repositories |

---

## Migrations

Não há SQL manual. Todas mudanças de schema via:

```bash
npm run db:migrate -- --name descricao   # cria migration (dev)
npm run db:migrate:deploy               # aplica em produção
npm run db:sync                         # primeiro deploy (detecta estado do banco)
```

Schema: `prisma/schema.prisma` — edite aqui para qualquer mudança de banco.

---

## Frontend (`frontend/`)

Next.js App Router. Consome a API REST do backend.

---

## Serviços Externos

| Serviço | Uso |
|---|---|
| Supabase Auth | Autenticação (somente Auth — banco PostgreSQL é externo) |
| Stripe | Pagamento via cartão |
| Asaas | Pagamento via PIX/boleto |
| Evolution API | WhatsApp Business (bot de agendamento) |

---

## Testes

Vitest 2.x + Supertest. Arquivos em `src/__tests__/`. Configuração em `vitest.config.ts`.

```bash
npm test          # run once
npm run test:watch  # watch mode
npm run test:cov    # coverage
```
