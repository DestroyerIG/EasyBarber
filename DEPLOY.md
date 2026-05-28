# Deploy — EasyBarber SaaS 2.0

Guia de produção. Stack: Node.js 20 + Express + Prisma + PostgreSQL (Supabase) + Vercel (frontend) + Render (backend).

---

## Pré-requisitos

- Node.js 20+
- PostgreSQL 14+ (recomendado: Supabase)
- Supabase Auth configurado

---

## Variáveis de Ambiente — Backend

### Obrigatórias

```env
DATABASE_URL=postgresql://user:password@host:5432/barberpro?sslmode=require
JWT_SECRET=chave_forte_32_chars_minimo
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://seu-frontend.vercel.app
APP_URL=https://seu-frontend.vercel.app
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=https://seu-frontend.vercel.app/auth/confirm
```

### Stripe

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_BASICO=price_xxx
STRIPE_PRICE_ID_PROFISSIONAL=price_xxx
STRIPE_PRICE_ID_PREMIUM=price_xxx
```

### Asaas (opcional)

```env
ASAAS_API_KEY=<api-key>
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<token>
```

### WhatsApp Evolution API (opcional)

```env
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=<api-key>
BACKEND_WEBHOOK_BASE_URL=https://sua-api.render.com/api/v1/whatsapp/webhook
```

### Opcionais

```env
LOG_LEVEL=info
API_JSON_BODY_LIMIT=1mb
WHATSAPP_WEBHOOK_BODY_LIMIT=6mb
BUSINESS_TIMEZONE=America/Sao_Paulo
VERCEL_PROJECT_PREFIX=barberpro-saas-2-0
OTEL_ENABLED=false
```

`BUSINESS_TIMEZONE` define o fuso usado pelo cron de lembretes. O servidor roda em UTC, mas os agendamentos gravam o relógio local da barbearia; sem essa variável o alvo dos lembretes pode sair errado. Padrão: `America/Sao_Paulo`.

---

## Variáveis de Ambiente — Frontend (Vercel)

```env
BACKEND_API_URL=https://sua-api.render.com/api/v1
NEXT_PUBLIC_API_URL=https://sua-api.render.com/api/v1
NEXT_PUBLIC_APP_URL=https://seu-frontend.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

---

## Render (Backend)

### Build & Start Commands

```
Build Command:  npm install && npx prisma generate && npm run build
Start Command:  npx prisma migrate deploy && npm start
```

### Ordem de execução no deploy

```bash
npm install                    # instala dependências
npx prisma generate            # gera Prisma Client
npm run build                  # tsc → dist/
npx prisma migrate deploy      # aplica migrations pendentes (seguro, idempotente)
npm start                      # node dist/server.js
```

### Banco novo (primeira vez)

```bash
# Na máquina local com DATABASE_URL apontando para produção:
npm run db:sync                # detecta estado e aplica baseline ou migrate deploy
```

### Banco existente (migração de pg bruto para Prisma)

```bash
# Na máquina local:
npm run db:sync                # detecta banco legado → aplica baseline sem executar SQL
```

### Migrations futuras

```bash
# Local (gera migration file):
npm run db:migrate -- --name descricao_da_mudanca

# Produção (aplica automaticamente via Start Command acima):
npx prisma migrate deploy
```

---

## Vercel (Frontend)

- Framework: Next.js
- Build Command: `npm run build` (padrão)
- Output Directory: `.next` (padrão)
- Variáveis de ambiente: configurar no painel Vercel → Settings → Environment Variables

Nenhuma mudança de configuração necessária pelo Prisma — o Prisma roda apenas no backend (Render).

---

## Supabase

- Supabase é **somente Auth** neste projeto.
- O banco PostgreSQL é acoplado diretamente via `DATABASE_URL` no Render.
- **Não** use o banco interno do Supabase para os dados da aplicação; use `DATABASE_URL` apontando para o Postgres do Supabase (connection pooler via pgBouncer recomendado).

### Connection String Supabase

```
postgresql://postgres.[project-ref]:[password]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```

O Prisma requer `?pgbouncer=true&connection_limit=1` quando usa pgBouncer em modo transaction.

---

## Webhooks

### Stripe

Endpoints aceitos:
```
POST https://sua-api.render.com/api/v1/billing/webhooks/stripe
POST https://sua-api.render.com/api/v1/billing/webhook/stripe
```
Signing secret: `STRIPE_WEBHOOK_SECRET`

### Asaas

```
POST https://sua-api.render.com/api/v1/billing/webhooks/asaas
```
Token: `ASAAS_WEBHOOK_TOKEN`

### Evolution API (WhatsApp)

```
POST https://sua-api.render.com/api/v1/whatsapp/webhook
```

Eventos recomendados: `MESSAGES_UPSERT`, `CONNECTION_UPDATE`.
Evite `MESSAGES_SET` — payload pesado, bloqueado automaticamente.

---

## Comandos de Banco

| Comando | Uso |
|---|---|
| `npm run db:sync` | Primeiro deploy — detecta estado e sincroniza |
| `npm run db:migrate` | Criar nova migration (desenvolvimento) |
| `npm run db:migrate:deploy` | Aplicar migrations em produção |
| `npm run db:migrate:status` | Ver migrations pendentes |
| `npm run db:generate` | Regenerar Prisma Client após mudança no schema |
| `npm run db:studio` | Abrir Prisma Studio (visualizar dados) |
| `npm run typecheck` | Verificar tipagem TypeScript |

---

## Smoke Test Pós-Deploy

```bash
curl https://sua-api.render.com/health
# Espera: {"status":"ok","db":"connected"}

curl https://sua-api.render.com/api/v1/auth/me
# Espera: 401 (sem token)
```

Validação manual:
- [ ] Cadastro + confirmação e-mail
- [ ] Login
- [ ] Dashboard carrega dados
- [ ] Checkout cartão (Stripe sandbox)
- [ ] Checkout PIX (Asaas sandbox)
- [ ] Webhook Stripe recebido (stripe listen)
- [ ] Status de assinatura atualiza

---

## Rollback

- **Aplicação**: redeploy da versão anterior no Render
- **Banco**: `prisma migrate resolve --rolled-back <migration_name>` (não executa SQL — apenas desfaz o registro)
- **Schema**: restaure backup antes de reverter migration destrutiva

---

## Riscos Comuns

| Risco | Solução |
|---|---|
| `DATABASE_URL` sem `?sslmode=require` | Adicionar ao connection string |
| `pgBouncer` sem `?pgbouncer=true` | Prisma falha em transaction mode |
| `prisma generate` não rodou no build | Adicionar ao Build Command |
| `prisma migrate deploy` em banco inconsistente | Rodar `db:sync` primeiro |
| CORS sem `FRONTEND_URL` | Configurar env var no Render |
| Supabase redirect diferente de `AUTH_SUPABASE_REDIRECT_TO` | Sincronizar URLs |
| Webhook Stripe com secret errado | Verificar `STRIPE_WEBHOOK_SECRET` |
