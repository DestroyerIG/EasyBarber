# EasyBarber SaaS 2.0

Plataforma SaaS para gestão de barbearias com agenda, clientes, financeiro, automações de WhatsApp, assinatura recorrente e painel administrativo de plataforma.

## Visão Geral

O projeto é dividido em dois serviços principais:

- Backend Node.js/Express em backend.
- Frontend Next.js (App Router) em frontend.

Também há suporte a execução via Docker Compose com PostgreSQL.

## Principais Funcionalidades

- Autenticação com JWT (access + refresh token em cookies httpOnly).
- Cadastro com verificação obrigatória de e-mail (token com expiração + reenvio de verificação).
- Gestão de agendamentos, clientes, serviços e barbeiros.
- Módulo financeiro com resumo diário/mensal e despesas.
- Bot de WhatsApp via whatsapp-web.js com configuração de mensagens e menu dinâmico.
- Assinaturas com Stripe (checkout, portal e webhook), com 7 dias grátis apenas na primeira assinatura da barbearia.
- Painel administrativo de plataforma com bloqueio de contas/usuários e auditoria.
- Controle de acesso por plano e status de assinatura.

## Stack

### Backend

- Node.js 20+
- Express 4
- PostgreSQL (driver pg)
- Zod (validação)
- jsonwebtoken + bcryptjs
- nodemailer (SMTP)
- Pino (logs)
- stripe
- whatsapp-web.js

### Frontend

- Next.js 15
- React 18
- TypeScript
- Tailwind CSS
- Axios
- Recharts

## Arquitetura

No backend, o fluxo principal segue:

Controller -> Service -> Repository -> PostgreSQL

Componentes de apoio:

- Middleware de auth e RBAC.
- Middleware de feature gate por plano/status de assinatura.
- Error handler global com payload padronizado.

No frontend, o App Router organiza páginas públicas, dashboard tenant e área admin, com contexto de autenticação e cliente Axios com refresh automático.

## Estrutura de Pastas Relevante

```text
backend/
  src/
    config/        # database.sql e migration_v2..v9.sql
    controllers/
    middleware/
    repositories/
    routes/
    services/
    validators/
frontend/
  src/
    app/           # Rotas Next.js
    components/
    contexts/
    lib/
```

Detalhes: PROJECT_STRUCTURE.md

## Pré-requisitos

- Node.js 20+ (recomendado).
- npm 10+.
- PostgreSQL 14+ (recomendado 16).
- Git.

Opcional:
- Docker + Docker Compose para stack containerizada.

## Variáveis de Ambiente

### Backend (backend/.env)

Base no arquivo backend/.env.example:

```env
PORT=5000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=postgresql://postgres:senha@localhost:5432/barberpro
JWT_SECRET=troque_esta_chave
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
EMAIL_VERIFICATION_TTL_MINUTES=60

# SMTP (verificação de e-mail)
SMTP_HOST=smtp.seudominio.com
SMTP_PORT=587
SMTP_USER=usuario_smtp
SMTP_PASS=senha_smtp
SMTP_FROM="EasyBarber <no-reply@seudominio.com>"

# Stripe (obrigatório somente para billing em produção)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_BASICO=price_xxx
STRIPE_PRICE_ID_PROFISSIONAL=price_xxx
STRIPE_PRICE_ID_PREMIUM=price_xxx

# WhatsApp (opcional)
WHATSAPP_ENABLED=false
WHATSAPP_SESSION_TIMEOUT_MS=1800000
```

### Frontend (frontend/.env.local)

Base no arquivo frontend/.env.example:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_WHATSAPP_CONTACT_URL=https://wa.me/5500000000000?text=Ola
```

## Instalação e Execução (Desenvolvimento)

### 1. Clonar e instalar dependências

```bash
git clone <url-do-repositorio>
cd Barberpro-saas-2.0
npm run install:all
```

Ou instalar separado:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configurar .env

- Copiar backend/.env.example para backend/.env e ajustar valores.
- Copiar frontend/.env.example para frontend/.env.local e ajustar valores.

### 3. Preparar banco e migrations SQL

A sequência recomendada para banco novo é:

1. backend/src/config/database.sql
2. backend/src/config/migration_v3.sql
3. backend/src/config/migration_v4.sql
4. backend/src/config/migration_v5.sql
5. backend/src/config/migration_v6.sql
6. backend/src/config/migration_v7.sql
7. backend/src/config/migration_v8.sql
8. backend/src/config/migration_v9.sql

Observação: migration_v2.sql é voltada a upgrade legado e normalmente não é necessária em ambiente novo.

Passo a passo detalhado e comandos por sistema operacional: POSTGRESQL_SETUP.md

### 4. Iniciar serviços

Terminal 1 (backend):

```bash
cd backend
npm run dev
```

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

## Usuários de teste (ambiente local)

Antes de utilizar os usuários abaixo, execute:

```bash
npm run seed:test-users
```

O comando deve ser executado no diretório backend.

### Admin (plataforma)

- Email: contato@easyconnectcg.com.br
- Senha: @Easyconnect08
- Role: platform_admin

Permissões:

- Acesso total ao sistema
- Acesso à área administrativa
- Gerenciamento global de tenants

### Usuário de teste (tenant)

- Email: teste@easybarber.com
- Senha: 12345678
- Role: employee

Contexto:

- Barbearia: EasyBarber Teste
- Plano: profissional
- Status da assinatura: active

Acesso liberado:

- Dashboard
- Clientes
- Agenda
- Financeiro
- Relatórios
- Funcionalidades premium

> Observação:
> O controle de acesso no sistema é baseado no tenant (barbershop), não diretamente no usuário.
> Ou seja, o plano e o status da assinatura são definidos na barbearia vinculada ao usuário.

## Portas Utilizadas

- Frontend: 3000
- Backend: 5000
- PostgreSQL: 5432

## Fluxo Básico de Autenticação

1. Usuário cadastra tenant em /api/v1/auth/register.
2. Conta nasce não verificada e o backend envia e-mail com link de confirmação.
3. Usuário confirma no link /verificar-email?token=... no frontend.
4. Frontend chama /api/auth/verify-email e a API marca o e-mail como verificado.
5. Somente após verificação, login em /api/v1/auth/login gera cookies access_token e refresh_token.
6. Frontend consulta /api/v1/auth/me para montar sessão e usa /api/v1/auth/refresh em expiração do access token.
7. Rotas protegidas exigem auth, role e feature permission.

## Módulos Principais

- Tenant app:
  - Dashboard
  - Agendamentos
  - Clientes
  - Financeiro
  - Serviços/Barbeiros
  - WhatsApp
  - Assinatura
- Platform admin:
  - Métricas globais
  - Gestão de contas (tenants)
  - Gestão de assinaturas
  - Auditoria

## Banco de Dados e Migrations SQL

O projeto usa PostgreSQL.

Arquivos SQL em backend/src/config:

- database.sql (schema base)
- migration_v2.sql (upgrade legado)
- migration_v3.sql (bot WhatsApp: colunas novas + tabela whatsapp_menu_options)
- migration_v4.sql (índices de performance)
- migration_v5.sql (campos e eventos Stripe)
- migration_v6.sql (RBAC admin/tenant/employee e audit logs)
- migration_v7.sql (preferência de plano no onboarding: desired_plan)
- migration_v8.sql (barbershop settings)
- migration_v9.sql (verificação de e-mail de conta)

A documentação completa de migrations manuais, validação, rollback e troubleshooting está em POSTGRESQL_SETUP.md.

## Problemas Comuns

- Erro de conexão PostgreSQL: revisar DATABASE_URL e serviço do banco.
- Erro function gen_random_uuid() does not exist: habilitar extensão pgcrypto.
- Erro de migration v3: conferir execução no banco correto e com UTF-8.
- Erro de CORS: garantir FRONTEND_URL no backend.
- Erro de porta ocupada: ajustar processo ou variável PORT.

Guia completo: TROUBLESHOOTING.md

## Deploy

Guia completo de produção: DEPLOY.md

Inclui:

- Requisitos mínimos.
- Variáveis obrigatórias.
- Build e start.
- Ordem de migrations antes de produção.
- Check pós-deploy e rollback.

## Comandos Úteis

Na raiz:

```bash
npm run install:all
npm run dev:backend
npm run dev:frontend
npm run build:backend
npm run build:frontend
npm run start:backend
npm run start:frontend
```

Backend:

```bash
cd backend
npm run dev
npm start
npm test
npm run test:watch
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm start
npm run lint
```

## Índice de Documentação

- START_HERE.md
- QUICK_START.md
- INSTALL.md
- POSTGRESQL_SETUP.md
- API_DOCS.md
- PROJECT_STRUCTURE.md
- WHATSAPP_BOT.md
- PLANOS.md
- DEPLOY.md
- TROUBLESHOOTING.md

## Status de Configuração do Repositório

As inconsistências operacionais críticas foram corrigidas no estado atual do projeto:

- backend/.env.example usa DB_CONNECT_TIMEOUT.
- backend/.env.example inclui variáveis SMTP_* e EMAIL_VERIFICATION_TTL_MINUTES para verificação de e-mail.
- docker-compose.yml usa FRONTEND_URL no backend e NEXT_PUBLIC_API_URL com /api/v1 no frontend.
- setup.ps1 aplica database.sql + migration_v3..v9.
- fix-env.ps1 remove variáveis legadas WHATSAPP_API_* e mantém defaults compatíveis com o backend atual.

Observação:

- No Docker, scripts de inicialização em /docker-entrypoint-initdb.d rodam apenas no primeiro bootstrap de um volume novo. Se o volume já existia, aplique migrations manualmente ou recrie o volume.
