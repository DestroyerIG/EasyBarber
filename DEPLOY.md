# Deploy

Guia técnico para publicação em produção com foco em previsibilidade operacional.

## 1. Escopo de Deploy

Este documento cobre:

- Requisitos mínimos de infraestrutura.
- Variáveis obrigatórias de backend/frontend.
- Build e execução.
- Ordem de migration SQL antes de produção.
- Verificação pós-deploy.
- Riscos comuns e rollback.

## 2. Requisitos Mínimos

### Aplicação

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (recomendado 16)
- HTTPS no frontend e backend público

### Infra recomendada inicial

- Backend: 2 vCPU, 2 GB RAM
- Frontend: 1 vCPU, 1 GB RAM
- Banco: plano gerenciado com backup automático diário

## 3. Variáveis de Ambiente

## 3.1 Backend (obrigatórias)

```env
DATABASE_URL=postgresql://user:password@host:5432/barberpro
JWT_SECRET=chave_forte_com_32_ou_mais_caracteres
NODE_ENV=production
FRONTEND_URL=https://seu-frontend.com
APP_URL=https://seu-frontend.com
AUTH_PROVIDER_MODE=dual
EMAIL_VERIFICATION_TTL_MINUTES=60
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=https://seu-frontend.com/auth/confirm
# fallback legado (AUTH_PROVIDER_MODE=legacy)
SMTP_HOST=smtp.seudominio.com
SMTP_PORT=587
SMTP_USER=usuario_smtp
SMTP_PASS=senha_smtp
SMTP_FROM="EasyBarber <no-reply@seudominio.com>"
```

Observacao: `SUPABASE_SERVICE_ROLE_KEY` e necessaria para scripts administrativos de sincronizacao de usuarios (`seed:auth-admin` e `seed:system-users`).

### Backend (billing/Stripe)

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

Mapeamento de fluxo no checkout Stripe:

- card -> mode subscription + price recorrente.
- pix/boleto -> mode payment + price one-time.

### Backend (opcionais)

```env
PORT=5000
LOG_LEVEL=info
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_IDLE_TIMEOUT=30000
DB_CONNECT_TIMEOUT=5000
DB_STATEMENT_TIMEOUT=30000
DB_CA_CERT=<certificado-ca>
# WhatsApp provider (Evolution API externa)
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://sua-evolution.onrender.com
EVOLUTION_API_KEY=sua_chave
EVOLUTION_INSTANCE_NAME=easybarber
EVOLUTION_WEBHOOK_URL=https://sua-api.com/api/v1/whatsapp/webhook
EVOLUTION_API_TIMEOUT_MS=10000
WHATSAPP_SESSION_TIMEOUT_MS=1800000
```

## 3.2 Frontend

```env
NEXT_PUBLIC_API_URL=https://sua-api.com/api/v1
NEXT_PUBLIC_WHATSAPP_CONTACT_URL=https://wa.me/5500000000000?text=Ola
```

## 4. Checklist Pré-Deploy

- Banco de produção criado com UTF-8.
- Extensão pgcrypto habilitada.
- Backup inicial executado.
- Variáveis de ambiente revisadas.
- Endpoint /api/v1/subscriptions/webhook planejado no Stripe.
- FRONTEND_URL apontando para domínio real do frontend.
- Testes de backend e lint do frontend executados.

## 5. Build e Execução

### Backend

```bash
cd backend
npm ci
npm start
```

### Frontend

```bash
cd frontend
npm ci
npm run build
npm start
```

## 6. Migrations Antes de Produção

## 6.1 Ordem recomendada para ambiente novo

1. database.sql
2. migration_v3.sql
3. migration_v4.sql
4. migration_v5.sql
5. migration_v6.sql
6. migration_v7.sql
7. migration_v8.sql
8. migration_v9.sql
9. migration_v10.sql
10. migration_v11.sql

## 6.2 Comandos (host com psql)

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
```

## 6.3 Upgrade legado

Se estiver migrando base antiga, inclua migration_v2.sql antes de v3.

## 6.4 Validação pós-migration

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
psql "$DATABASE_URL" -c "SELECT to_regclass('public.whatsapp_menu_options');"
psql "$DATABASE_URL" -c "SELECT conname FROM pg_constraint WHERE conname='chk_users_role';"
```

## 7. Deploy com Docker Compose

O compose do repositório é útil para ambientes simples, mas não deve ser tratado como blueprint final de produção sem ajustes.

### 7.1 Subir stack

```bash
docker compose up -d --build
```

### 7.2 Aplicar migrations adicionais

O bootstrap automático do db aplica database.sql + migration_v3..v11 no primeiro bootstrap do volume.

Se o volume já existia antes dessa configuração, execute migration_v3..v11 manualmente.

Com psql local:

```bash
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v7.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v8.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v9.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v10.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v11.sql
```

## 8. Deploy em PaaS (Backend/Frontend separados)

### Backend

- Publicar pasta backend.
- Garantir NODE_ENV=production.
- Definir DATABASE_URL e JWT_SECRET.
- Definir AUTH_PROVIDER_MODE e variáveis SUPABASE_*.
- Se usar Stripe, definir variáveis Stripe.

### Frontend

- Publicar pasta frontend.
- Definir NEXT_PUBLIC_API_URL para URL pública da API com /api/v1.

### Evolution API (serviço separado)

- Publicar Evolution API em serviço próprio (ex.: Render), separado do backend EasyBarber.
- Configurar instância e API key no serviço da Evolution.
- Configurar EVOLUTION_WEBHOOK_URL apontando para o backend EasyBarber: /api/v1/whatsapp/webhook.
- Garantir conectividade de rede: backend EasyBarber precisa alcançar a URL pública da Evolution.

## 9. Configuração Manual no Supabase (Auth)

No painel do Supabase, configure:

1. Authentication -> URL Configuration
  - Site URL: URL pública do frontend (ex.: https://seu-frontend.com)
  - Redirect URLs: incluir exatamente a callback do projeto (ex.: https://seu-frontend.com/auth/confirm)
2. Authentication -> Providers -> Email
  - Habilitar provider Email
  - Confirm email: habilitado
3. Authentication -> Email Templates -> Confirm signup
  - Manter template com `{{ .TokenHash }}`
  - Garantir link final redirecionando para `/auth/confirm` com `token_hash` e `type`
4. Project Settings -> API
  - Copiar `Project URL` para `SUPABASE_URL`
  - Copiar `anon public` para `SUPABASE_ANON_KEY`

Observação:

- Não usar `service_role` no frontend.
- Em rollout, usar `AUTH_PROVIDER_MODE=dual`; rollback imediato via `AUTH_PROVIDER_MODE=legacy`.

## 10. Configuração de Webhook Stripe

No painel Stripe:

- Endpoint: https://sua-api.com/api/v1/subscriptions/webhook
- Eventos mínimos:
  - checkout.session.completed
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_succeeded
  - invoice.payment_failed

Salvar signing secret em STRIPE_WEBHOOK_SECRET.

## 11. Verificação Pós-Deploy

- Health check backend:

```bash
curl https://sua-api.com/health
```

- Smoke tests:
  - Registro -> verificação de e-mail -> login.
  - Criação de agendamento.
  - Criação de despesa.
  - Consulta de /api/v1/subscriptions/status.
  - WhatsApp: GET /api/v1/whatsapp/status retornando status coerente.
  - WhatsApp: POST /api/v1/whatsapp/connect e GET /api/v1/whatsapp/qrcode com resposta sem crash.

- Frontend:
  - Login e navegação dashboard.
  - Consumo de dados sem erro de CORS.
  - Aba WhatsApp exibindo estados: unavailable, disconnected, pairing, connected, error.

## 12. Riscos Comuns

- Banco sem migration_v3 (quebra módulo WhatsApp).
- Banco sem migration_v9/v10/v11 (quebra fluxo de verificação, sincronização Supabase e billing híbrido).
- FRONTEND_URL incorreta (erro CORS).
- SUPABASE_URL/SUPABASE_ANON_KEY ausentes com AUTH_PROVIDER_MODE=dual|supabase (falha de cadastro/verificação).
- SMTP_* ausentes ou inválidas quando AUTH_PROVIDER_MODE=legacy (fallback legado indisponível).
- DB_CONNECT_TIMEOUT ausente ou configurado incorretamente no backend.
- Webhook Stripe sem assinatura válida.
- EVOLUTION_API_URL ou EVOLUTION_API_KEY inválidas.
- Evolution API offline sem monitoramento ativo.
- Deploy sem backup anterior.

## 13. Rollback

## 13.1 Rollback de aplicação

- Reverter versão de backend/frontend para release anterior (tag ou commit estável).

## 13.2 Rollback de banco

1. Restaurar backup pré-deploy.
2. Reaplicar versão compatível da aplicação.

Exemplo restore:

```bash
pg_restore -d barberpro -c backup_pre_deploy.dump
```

## 14. Correções de Configuração Aplicadas

As seguintes correções já estão aplicadas no repositório:

- backend/.env.example com DB_CONNECT_TIMEOUT.
- docker-compose.yml com FRONTEND_URL no backend.
- docker-compose.yml com NEXT_PUBLIC_API_URL em /api/v1 no frontend.
- setup.ps1 aplicando database.sql + migration_v3..v11.
- fix-env.ps1 sem variáveis legadas WHATSAPP_API_*.
