# Deploy

Guia técnico para publicar o EasyBarber SaaS 2.0 em produção.

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL 14+; recomendado 16 com backup automático.
- HTTPS no frontend e backend.
- Supabase Auth configurado.
- Variáveis de billing e WhatsApp conforme módulos usados.

## Variáveis de Ambiente

### Backend Obrigatórias

```env
DATABASE_URL=postgresql://user:password@host:5432/barberpro
JWT_SECRET=chave_forte_com_32_ou_mais_caracteres
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://seu-frontend.com
APP_URL=https://seu-frontend.com
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=https://seu-frontend.com/auth/confirm
```

`AUTH_PROVIDER_MODE` é obsoleto. O fluxo atual usa Supabase Auth obrigatoriamente.

### Backend Opcionais

```env
LOG_LEVEL=info
AUTH_COOKIE_DOMAIN=.seudominio.com
API_JSON_BODY_LIMIT=1mb
WHATSAPP_WEBHOOK_BODY_LIMIT=6mb
VERCEL_PROJECT_PREFIX=barberpro-saas-2-0
```

### Stripe

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_BASICO=price_xxx
STRIPE_PRICE_ID_PROFISSIONAL=price_xxx
STRIPE_PRICE_ID_PREMIUM=price_xxx
STRIPE_PRICE_ID_BASICO_ONE_TIME=price_xxx
STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME=price_xxx
STRIPE_PRICE_ID_PREMIUM_ONE_TIME=price_xxx
```

### Asaas Pix

```env
ASAAS_API_KEY=<api-key>
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<token-webhook>
ASAAS_BILLING_DESCRIPTION=EasyBarber - Plano {plan} ({barbershop})
ASAAS_TIMEOUT_MS=12000
```

### WhatsApp Evolution API

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=<api-key>
EVOLUTION_INSTANCE_NAME=easybarber
EVOLUTION_WEBHOOK_URL=https://sua-api.com/api/v1/whatsapp/webhook
EVOLUTION_API_TIMEOUT_MS=10000
WHATSAPP_SESSION_TIMEOUT_MS=1800000
WHATSAPP_INSTANCE_BARBERSHOP_MAP=
```

`WHATSAPP_INSTANCE_BARBERSHOP_MAP` é fallback legado. A fonte de verdade deve ser `barbershops.whatsapp_instance_name`.

### Frontend

```env
BACKEND_API_URL=https://sua-api.com/api/v1
NEXT_PUBLIC_API_URL=https://sua-api.com/api/v1
NEXT_PUBLIC_APP_URL=https://seu-frontend.com
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_WHATSAPP_CONTACT_URL=https://wa.me/55...
```

## Banco em Produção

1. Faça backup.
2. Aplique `database.sql` apenas em banco novo.
3. Aplique migrations em ordem até `migration_v19_business_days_and_intervals.sql`.
4. Valide tabelas críticas.

Comandos:

```bash
pg_dump "$DATABASE_URL" > backup_barberpro_$(date +%Y%m%d_%H%M%S).sql
```

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v16_supabase_only_auth.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v17_subscription_access_gate.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v18_asaas_customer_id.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v19_business_days_and_intervals.sql
```

Para banco novo, consulte POSTGRESQL_SETUP.md para a lista completa desde `database.sql`.

## Build e Start

Backend:

```bash
cd backend
npm ci
npm start
```

Frontend:

```bash
cd frontend
npm ci
npm run build
npm start
```

## Webhooks

### Stripe

Configure um ou mais endpoints aceitos:

- `https://sua-api.com/api/v1/billing/webhooks/stripe`
- `https://sua-api.com/api/v1/billing/webhook/stripe`
- `https://sua-api.com/api/v1/subscriptions/webhook`

Use o signing secret em `STRIPE_WEBHOOK_SECRET`.

### Asaas

Endpoint:

- `https://sua-api.com/api/v1/billing/webhooks/asaas`

Configure o mesmo token em `ASAAS_WEBHOOK_TOKEN`.

### Evolution API

Endpoint:

- `https://sua-api.com/api/v1/whatsapp/webhook`
- Opcional por evento: `https://sua-api.com/api/v1/whatsapp/webhook/:event`

Eventos recomendados:

- `MESSAGES_UPSERT`
- `CONNECTION_UPDATE`

Evite `MESSAGES_SET` em produção por payload alto.

## Smoke Test

```bash
curl https://sua-api.com/health
curl https://sua-api.com/api/v1/auth/me
```

Valide no navegador:

- Cadastro e confirmação de e-mail.
- Login.
- Dashboard.
- Status de assinatura.
- Checkout cartão/Pix.
- Webhook de billing em ambiente sandbox antes de produção real.
- Conexão WhatsApp.

## Rollback

- Aplicação: volte para a release anterior.
- Banco: restaure backup se a migration aplicada causou incompatibilidade.
- Billing: pause webhooks no provedor se houver duplicidade ou erro crítico.

## Riscos Comuns

- Banco sem v16-v19.
- Supabase redirect diferente de `AUTH_SUPABASE_REDIRECT_TO`.
- CORS sem `FRONTEND_URL` correto.
- Cookies com domínio incorreto.
- Webhook Stripe com secret errado.
- Webhook Asaas sem token ou endpoint incorreto.
- Evolution API configurada para eventos pesados.
