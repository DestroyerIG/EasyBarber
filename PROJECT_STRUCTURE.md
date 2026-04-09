# Estrutura do Projeto

Visão técnica do layout atual do repositório e das responsabilidades de cada módulo.

## 1. Raiz do Repositório

```text
.
├── backend/
├── frontend/
├── docker-compose.yml
├── package.json
├── README.md
├── INSTALL.md
├── QUICK_START.md
├── POSTGRESQL_SETUP.md
├── API_DOCS.md
├── DEPLOY.md
└── TROUBLESHOOTING.md
```

## 2. Backend

```text
backend/
├── Dockerfile
├── package.json
├── check-db.js
└── src/
    ├── server.js
    ├── config/
    ├── controllers/
    ├── middleware/
    ├── repositories/
    ├── routes/
    ├── services/
    ├── utils/
    ├── validators/
    └── __tests__/
```

### 2.1 backend/src/config

- database.js: pool PostgreSQL.
- database.sql: schema base.
- migration_v2.sql .. migration_v11.sql: evoluções de schema.
- authProviderMode.js: feature flag de provedor de identidade (`legacy|dual|supabase`).
- planPermissions.js: matriz de acesso por plano/status.
- stripe.js: cliente Stripe e helpers de billing.

### 2.2 backend/src/controllers

Responsáveis por traduzir HTTP para service calls.

- authController.js
- dashboardController.js
- appointmentController.js
- clientController.js
- financeController.js
- serviceController.js
- barberController.js
- subscriptionController.js
- adminController.js

### 2.3 backend/src/routes

Rotas expostas sob /api/v1:

- auth.js
- dashboard.js
- appointments.js
- clients.js
- finance.js
- barbershop.js
- whatsapp.js
- subscriptions.js
- admin.js

### 2.4 backend/src/middleware

- auth.js: JWT e validações de token.
- rbac.js: requireAdmin e requireTenantRoles.
- subscriptionGuard.js: bloqueio por feature/assinatura.
- validate.js: validação Zod.
- errorHandler.js: padronização de resposta de erro.

### 2.5 backend/src/services

Regra de negócio por domínio.

- authService.js
- appointmentService.js
- clientService.js
- dashboardService.js
- financeService.js
- serviceService.js
- barberService.js
- subscriptionService.js
- stripePricingService.js
- stripeCheckoutService.js
- adminService.js
- auditLogService.js
- featureAccessService.js
- cronService.js
- whatsappClient.js
- whatsapp/ (submódulos do bot)

### 2.6 backend/src/repositories

Camada SQL/acesso a dados.

- BaseRepository.js
- authRepository.js
- appointmentRepository.js
- clientRepository.js
- financeRepository.js
- barberRepository.js
- serviceRepository.js
- dashboardRepository.js
- subscriptionRepository.js
- adminRepository.js
- auditRepository.js

### 2.7 backend/src/validators

Schemas Zod por domínio em validators/schemas.

## 3. Frontend

```text
frontend/
├── Dockerfile
├── package.json
├── next.config.js
├── tailwind.config.js
└── src/
    ├── app/
    ├── components/
    ├── contexts/
    ├── hooks/
    ├── lib/
    ├── styles/
    ├── types/
    └── utils/
```

### 3.1 frontend/src/app (App Router)

Rotas principais:

- / (landing page)
- /login
- /cadastro
- /verificar-email
- /auth/confirm
- /dashboard
- /admin
- /admin/metrics
- /admin/tenants
- /admin/subscriptions
- /admin/logs

### 3.2 frontend/src/components

Componentes de UI e módulos de domínio:

- appointments/
- clients/
- finance/
- services/
- whatsapp/
- billing/
- admin/
- auth/
- marketing/
- ui/

### 3.3 frontend/src/lib

- api.ts: Axios principal com refresh automático.
- adminApi.ts: cliente de endpoints administrativos.
- billing.ts: cliente para assinatura.
- constants e utilitários auxiliares.

### 3.4 frontend/src/contexts

- AuthContext.tsx: sessão do usuário, login/logout/register.

### 3.5 frontend/src/middleware.ts

Protege rotas /dashboard/* e /admin/* em nível de edge middleware.

## 4. Fluxo de Requisição

```text
Frontend -> /api/v1/* -> route -> middleware -> controller -> service -> repository -> PostgreSQL
```

## 5. Banco de Dados

Scripts SQL localizados em:

- backend/src/config/database.sql
- backend/src/config/migration_v2.sql
- backend/src/config/migration_v3.sql
- backend/src/config/migration_v4.sql
- backend/src/config/migration_v5.sql
- backend/src/config/migration_v6.sql
- backend/src/config/migration_v7.sql
- backend/src/config/migration_v8.sql
- backend/src/config/migration_v9.sql
- backend/src/config/migration_v10.sql
- backend/src/config/migration_v11.sql

Detalhes de execução e validação: POSTGRESQL_SETUP.md

## 6. Observações de Manutenção

- setup.ps1 aplica database.sql + migration_v3..v11 no fluxo atual.
- O bootstrap do Docker aplica database.sql + migration_v3..v11 no primeiro volume; se o volume já existia, aplicar migrations manualmente.
- O backend usa /api/v1 como versão canônica e mantém redirecionamento 301 para /api legado.
