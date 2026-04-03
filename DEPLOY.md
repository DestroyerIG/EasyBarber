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
```

### Backend (billing/Stripe)

```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_BASICO=price_xxx
STRIPE_PRICE_ID_PROFISSIONAL=price_xxx
STRIPE_PRICE_ID_PREMIUM=price_xxx
```

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
WHATSAPP_ENABLED=true
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

## 6.2 Comandos (host com psql)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/database.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
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

O bootstrap automático do db aplica database.sql + migration_v3..v6 no primeiro bootstrap do volume.

Se o volume já existia antes dessa configuração, execute migration_v3..v6 manualmente.

Com psql local:

```bash
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
```

## 8. Deploy em PaaS (Backend/Frontend separados)

### Backend

- Publicar pasta backend.
- Garantir NODE_ENV=production.
- Definir DATABASE_URL e JWT_SECRET.
- Se usar Stripe, definir variáveis Stripe.

### Frontend

- Publicar pasta frontend.
- Definir NEXT_PUBLIC_API_URL para URL pública da API com /api/v1.

## 9. Configuração de Webhook Stripe

No painel Stripe:

- Endpoint: https://sua-api.com/api/v1/subscriptions/webhook
- Eventos mínimos:
  - checkout.session.completed
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.paid
  - invoice.payment_failed

Salvar signing secret em STRIPE_WEBHOOK_SECRET.

## 10. Verificação Pós-Deploy

- Health check backend:

```bash
curl https://sua-api.com/health
```

- Smoke tests:
  - Registro/login.
  - Criação de agendamento.
  - Criação de despesa.
  - Consulta de /api/v1/subscriptions/status.

- Frontend:
  - Login e navegação dashboard.
  - Consumo de dados sem erro de CORS.

## 11. Riscos Comuns

- Banco sem migration_v3 (quebra módulo WhatsApp).
- FRONTEND_URL incorreta (erro CORS).
- DB_CONNECT_TIMEOUT ausente ou configurado incorretamente no backend.
- Webhook Stripe sem assinatura válida.
- Deploy sem backup anterior.

## 12. Rollback

## 12.1 Rollback de aplicação

- Reverter versão de backend/frontend para release anterior (tag ou commit estável).

## 12.2 Rollback de banco

1. Restaurar backup pré-deploy.
2. Reaplicar versão compatível da aplicação.

Exemplo restore:

```bash
pg_restore -d barberpro -c backup_pre_deploy.dump
```

## 13. Correções de Configuração Aplicadas

As seguintes correções já estão aplicadas no repositório:

- backend/.env.example com DB_CONNECT_TIMEOUT.
- docker-compose.yml com FRONTEND_URL no backend.
- docker-compose.yml com NEXT_PUBLIC_API_URL em /api/v1 no frontend.
- setup.ps1 aplicando database.sql + migration_v3..v6.
- fix-env.ps1 sem variáveis legadas WHATSAPP_API_*.
