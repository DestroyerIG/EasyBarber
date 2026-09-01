# 💈 EasyBarber SaaS 2.0

![Node.js](https://img.shields.io/badge/Node.js-20+-green?style=flat-square&logo=node.js)
![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma%205-336791?style=flat-square&logo=postgresql)
![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-yellow?style=flat-square)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square)](./LICENSE)

> **Plataforma SaaS multi-tenant para gestão de barbearias — agenda inteligente, financeiro,
> automações de WhatsApp, billing híbrido e painel administrativo de plataforma.**

---

## 🎯 Funcionalidades

- Cadastro, confirmação de e-mail e login via **Supabase Auth**
- Sessão com cookies httpOnly e refresh token
- Dashboard tenant com métricas em tempo real
- Gestão de agendamentos, clientes, serviços e barbeiros
- Configuração operacional: dias de funcionamento, horários e intervalos
- Financeiro com receitas, despesas e relatórios
- Automação WhatsApp via **Evolution API v2**
- Lembretes automáticos de agendamento via cron (2h antes, fuso da barbearia)
- Billing híbrido: **Stripe** (cartão/assinatura) + **Asaas** (Pix)
- Controle de acesso por plano e status de assinatura
- Admin de plataforma: métricas, tenants, assinaturas, bloqueios e logs
- Páginas públicas de Termos de Uso (`/termos`) e Política de Privacidade (`/privacidade`)

---

## 🛠️ Stack

### Backend

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| Node.js | 20+ | Runtime |
| TypeScript | Strict | Linguagem |
| Express | 4 | Framework HTTP |
| Prisma | 5 | ORM / Migrations |
| PostgreSQL | — | Banco principal |
| Supabase Auth | — | Identidade |
| Zod | — | Validação de schemas |
| Pino | — | Logging estruturado |
| Stripe | — | Assinatura/cartão |
| Asaas | HTTP | Pix |
| Vitest + Supertest | — | Testes |

### Frontend

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| Next.js | 15 | Framework (App Router) |
| React | 18 | UI |
| TypeScript | — | Linguagem |
| Tailwind CSS | — | Estilização |
| Recharts | — | Gráficos |
| lucide-react | — | Ícones |
| Axios | — | HTTP client |

---

## 🏗️ Arquitetura

### Fluxo Backend
```
Route → Middleware → Controller → Service → Repository → PostgreSQL
```

### Fluxo WhatsApp
```
Frontend → Backend EasyBarber → Evolution API v2 externa
```

### Fluxo Billing
```
Frontend → Backend → Stripe/Asaas → Webhook → Backend → PostgreSQL
```

> O frontend nunca chama Evolution API, Stripe secret ou Asaas diretamente.

---

## 🗂️ Estrutura do Projeto

```
Barberpro-saas-2.0/
│
├── 📁 backend/
│   ├── prisma/
│   │   ├── schema.prisma         # Fonte de verdade do banco
│   │   └── migrations/           # Migrations Prisma (baseline + incrementais)
│   └── src/
│       ├── config/               # Prisma client, Stripe client, plan permissions
│       ├── controllers/
│       ├── integrations/         # Asaas
│       ├── middleware/
│       ├── modules/              # Módulos TS completos (appointments, billing, etc.)
│       ├── repositories/         # 100% Prisma
│       ├── routes/
│       ├── services/
│       ├── types/                # Interfaces de domínio + Zod schemas
│       ├── validators/
│       └── __tests__/
│
├── 📁 frontend/
│   └── src/
│       ├── app/
│       ├── components/
│       ├── contexts/
│       ├── hooks/
│       ├── lib/
│       ├── styles/
│       └── types/
│
└── README.md
```

> Veja `PROJECT_STRUCTURE.md` para detalhes completos.

---

## 🚀 Começar Rápido

```bash
# Instale todas as dependências
npm run install:all

# Configure as variáveis de ambiente
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Configure Supabase e banco, depois inicie os serviços:

```bash
# Backend
cd backend && npm run dev

# Frontend (novo terminal)
cd frontend && npm run dev
```

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:5000 |
| Health Check | http://localhost:5000/health |
| API Base | http://localhost:5000/api/v1 |

---

## ⚙️ Variáveis de Ambiente

### Backend (mínimo)

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

### Frontend (mínimo)

```env
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

---

## 🗄️ Banco de Dados

```bash
cd backend

# Produção
npm run db:migrate:deploy

# Desenvolvimento
npm run db:migrate
```

Schema em `prisma/schema.prisma`. Consulte `DEPLOY.md` para o fluxo completo em produção.

---

## 📜 Scripts

### Raiz

| Script | Descrição |
|--------|-----------|
| `npm run install:all` | Instala dependências de backend e frontend |
| `npm run dev:backend` | Inicia backend em modo desenvolvimento |
| `npm run dev:frontend` | Inicia frontend em modo desenvolvimento |
| `npm run seed:auth-admin` | Seed do admin de plataforma |
| `npm run seed:system-users` | Seed dos usuários de sistema |

### Backend

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Desenvolvimento com hot-reload |
| `npm start` | Produção |
| `npm test` | Executa testes |

### Frontend

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Serve o build |
| `npm run lint` | Lint do código |

---

## 🔌 API

Base URL: `http://localhost:5000/api/v1`

| Grupo | Responsabilidade |
|-------|-----------------|
| `/auth` | Autenticação e sessão |
| `/dashboard` | Métricas do tenant |
| `/appointments` | Agendamentos |
| `/clients` | Clientes |
| `/finance` | Financeiro |
| `/barbershop` | Configuração da barbearia |
| `/whatsapp` | Automações e webhook |
| `/subscriptions` | Assinaturas |
| `/billing` | Billing e pagamentos |
| `/admin` | Painel de plataforma |

> Veja `API_DOCS.md` para endpoints e contratos completos.

---

## 💳 Billing

- **Stripe** — assinatura recorrente, cartão, portal do cliente e webhooks
- **Asaas** — Pix com QR Code e webhook
- Status não ativos restringem acesso conforme `PLANOS.md`

---

## 💬 WhatsApp

- Provider atual: **Evolution API v2** externa
- Webhook principal: `/api/v1/whatsapp/webhook`
- Tenant por instância: `barbershops.whatsapp_instance_name`

> Veja `WHATSAPP_BOT.md` para configuração completa.

---

## 🐳 Docker

```bash
docker compose up --build
```

> O compose atual aplica automaticamente até `migration_v15.sql`. Aplique v16+ manualmente para schema completo.

---

## 📚 Documentação

| Arquivo | Conteúdo |
|---------|----------|
| `START_HERE.md` | Caminho de leitura recomendado |
| `QUICK_START.md` | Setup rápido |
| `INSTALL.md` | Instalação completa |
| `POSTGRESQL_SETUP.md` | Banco e migrations |
| `API_DOCS.md` | API REST |
| `PLANOS.md` | Planos e gates de acesso |
| `WHATSAPP_BOT.md` | WhatsApp / Evolution API |
| `DEPLOY.md` | Fluxo de produção |
| `TROUBLESHOOTING.md` | Diagnóstico de problemas |

---

## 📄 Licença

Este projeto está licenciado sob a [Apache License 2.0](./LICENSE).

---

## 👨‍💻 Autores

**Ítallo Gonçalves**
Estudante de Engenharia de Software

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Ítallo%20Gonçalves-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/itallo-gonçalves-3406a119a/)
[![GitHub](https://img.shields.io/badge/GitHub-DestroyerIG-black?style=flat-square&logo=github)](https://github.com/DestroyerIG)
[![Email](https://img.shields.io/badge/Email-igitallogabriel13@gmail.com-red?style=flat-square&logo=gmail)](mailto:igitallogabriel13@gmail.com)

**Pedro Lucas Barros Silva**
Colaborador

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Pedro%20Lucas-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/pedro-lucas-barros-silva-9a28571a3/)
[![GitHub](https://img.shields.io/badge/GitHub-BarrosPL-black?style=flat-square&logo=github)](https://github.com/BarrosPL)
[![Email](https://img.shields.io/badge/Email-barros.pedro@academico.ifpb.edu.br-red?style=flat-square&logo=gmail)](mailto:barros.pedro@academico.ifpb.edu.br)

---

<p align="center">
  Desenvolvido com 💈 precisão, 🟢 Node.js e foco em produto.<br/>
  <i>"Boas ferramentas não apenas organizam — elas transformam negócios."</i>
</p>
