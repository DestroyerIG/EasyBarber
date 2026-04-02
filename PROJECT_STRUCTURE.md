# 📁 ESTRUTURA DO PROJETO - EasyBarber

## 🌳 Árvore de Arquivos

```
easybarber-saas/
│
├── README.md                        # Documentação principal
├── QUICK_START.md                   # Guia de inicialização rápida
├── INSTALL.md                       # Instalação simplificada
├── API_DOCS.md                      # Documentação da API (44 endpoints)
├── PROJECT_STRUCTURE.md             # Este arquivo
├── DEPLOY.md                        # Deploy em produção
├── POSTGRESQL_SETUP.md              # Instalação do PostgreSQL
├── PLANOS.md                        # Planos de assinatura
├── WHATSAPP_BOT.md                  # Bot WhatsApp
├── TROUBLESHOOTING.md               # Problemas comuns
├── START_HERE.md                    # Visão geral do projeto
├── FIX_CADASTRO.md                  # Correção de erro comum
│
├── package.json                     # Scripts raiz (install:all, dev:backend, dev:frontend)
├── docker-compose.yml               # Docker Compose (PostgreSQL + Backend + Frontend)
├── setup.ps1                        # Script de configuração automática
├── fix-env.ps1                      # Script para corrigir .env
│
├── backend/                         # Backend Node.js + Express
│   ├── Dockerfile                   # Imagem Docker (node:20-alpine)
│   ├── package.json                 # Dependências (type: "module", ESM)
│   ├── check-db.js                  # Script de verificação do banco
│   │
│   └── src/
│       ├── server.js                # Servidor Express (inicialização, middleware, rotas)
│       │
│       ├── config/
│       │   ├── database.js          # Pool de conexão PostgreSQL (SSL em produção)
│       │   ├── database.sql         # Schema inicial (12 tabelas)
│       │   ├── migration_v2.sql     # Constraints, índices, refresh_tokens, triggers
│       │   ├── migration_v3.sql     # Bot config (21 msgs), menu_options (9 padrão)
│       │   └── migration_v4.sql     # Índices de performance
│       │
│       ├── controllers/             # Lógica de requisição/resposta
│       │   ├── authController.js        # register, login, refresh, logout, me
│       │   ├── dashboardController.js   # getDashboard
│       │   ├── appointmentController.js # CRUD + available-slots + status
│       │   ├── clientController.js      # CRUD + history
│       │   ├── financeController.js     # summary, monthly, CRUD expenses
│       │   ├── serviceController.js     # CRUD services
│       │   └── barberController.js      # CRUD barbers
│       │
│       ├── services/                # Regras de negócio
│       │   ├── authService.js           # Hash, verificação, tokens, common passwords
│       │   ├── appointmentService.js    # Lógica de agendamento
│       │   ├── clientService.js         # Lógica de clientes
│       │   ├── dashboardService.js      # Métricas do dashboard
│       │   ├── financeService.js        # Lógica financeira
│       │   ├── serviceService.js        # Lógica de serviços
│       │   ├── barberService.js         # Lógica de barbeiros (+ limites de plano)
│       │   ├── whatsapp/               # Bot WhatsApp (decomposição modular)
│       │   │   ├── index.js                 # Barrel re-export
│       │   │   ├── whatsappConstants.js     # Steps, timeouts, config padrão
│       │   │   ├── whatsappSessionService.js # CRUD sessões de conversa
│       │   │   ├── whatsappMessageService.js # Envio, formatação, welcome message
│       │   │   ├── whatsappConfigService.js  # Bot config e menu options do DB
│       │   │   ├── whatsappFlowService.js    # Fluxo principal + booking steps
│       │   │   └── whatsappBookingService.js # Cancel, reschedule, rating
│       │   ├── whatsappClient.js        # Conexão whatsapp-web.js (QR code)
│       │   └── cronService.js           # Lembretes automáticos (cada 10 min)
│       │
│       ├── repositories/            # Acesso ao banco de dados
│       │   ├── BaseRepository.js        # CRUD genérico (findById, create, update, delete)
│       │   ├── authRepository.js        # Users, barbershops, refresh_tokens
│       │   ├── appointmentRepository.js # Queries de agendamentos
│       │   ├── barberRepository.js      # Queries de barbeiros
│       │   ├── clientRepository.js      # Queries de clientes
│       │   ├── dashboardRepository.js   # Queries do dashboard
│       │   ├── financeRepository.js     # Queries financeiras
│       │   └── serviceRepository.js     # Queries de serviços
│       │
│       ├── middleware/              # Middlewares Express
│       │   ├── auth.js                  # JWT (cookie + header), checkPlan
│       │   ├── validate.js              # Validação Zod (body, query, params)
│       │   └── errorHandler.js          # Error handler global (Zod, AppError, 500)
│       │
│       ├── routes/                  # Definição de rotas
│       │   ├── auth.js                  # /api/v1/auth (register, login, refresh, logout, me)
│       │   ├── dashboard.js             # /api/v1/dashboard
│       │   ├── appointments.js          # /api/v1/appointments (CRUD + slots)
│       │   ├── clients.js               # /api/v1/clients (CRUD + history)
│       │   ├── finance.js               # /api/v1/finance (summary, monthly, expenses)
│       │   ├── barbershop.js            # /api/v1/barbershop (services, barbers)
│       │   └── whatsapp.js              # /api/v1/whatsapp (connection, config, menu, webhook)
│       │
│       ├── validators/
│       │   ├── schemas.js               # (legado) Schemas Zod monolíticos
│       │   └── schemas/                 # Schemas Zod por domínio
│       │       ├── index.js                 # Barrel re-export
│       │       ├── common.js                # Campos reutilizáveis (uuid, date, password)
│       │       ├── authSchemas.js           # register, login
│       │       ├── appointmentSchemas.js    # create, update, updateStatus
│       │       ├── clientSchemas.js         # create, update
│       │       ├── financeSchemas.js        # addExpense, updateExpense
│       │       ├── serviceSchemas.js        # createService, updateService
│       │       └── barberSchemas.js         # createBarber, updateBarber
│       │
│       └── utils/
│           ├── errors.js                # Classes de erro (AppError, NotFound, etc.)
│           ├── response.js              # Helpers (sendSuccess, sendCreated, sendNoContent, sendPaginated, sendError)
│           ├── logger.js                # Pino logger
│           └── date.js                  # Utilitários de data
│
└── frontend/                        # Frontend Next.js 15 + React
    ├── Dockerfile                   # Multi-stage build (node:20-alpine)
    ├── package.json                 # Dependências
    ├── next.config.js               # Config Next.js (CSP, security headers, standalone)
    ├── tsconfig.json                # TypeScript
    ├── tailwind.config.js           # Tailwind (cores #FF7A00, #000000)
    ├── postcss.config.js            # PostCSS
    ├── next-env.d.ts                # Types Next.js
    │
    └── src/
        ├── middleware.ts            # Proteção de rotas (/dashboard → requer cookie)
        │
        ├── app/                     # Pages (App Router)
        │   ├── layout.tsx               # Layout global (fonts, metadata)
        │   ├── page.tsx                 # Página de Login / Cadastro
        │   └── dashboard/
        │       └── page.tsx             # Dashboard principal (tabs para módulos)
        │
        ├── components/              # Componentes React
        │   ├── Navbar.tsx               # Barra de navegação
        │   ├── DashboardCards.tsx        # Cards de métricas
        │   ├── WeeklyChart.tsx          # Gráfico semanal (Recharts)
        │   ├── ProfitBar.tsx            # Barra lucro/gastos
        │   ├── LoadingSkeleton.tsx       # Loading skeleton
        │   ├── ErrorBoundary.tsx         # Error boundary React
        │   ├── Toast.tsx                # Notificações toast
        │   │
        │   ├── AppointmentModule.tsx     # Módulo de agendamentos
        │   ├── appointments/
        │   │   ├── AppointmentCard.tsx       # Card de agendamento
        │   │   ├── CreateAppointmentModal.tsx  # Modal criar/editar
        │   │   └── DateNavigationBar.tsx     # Navegação por data
        │   │
        │   ├── ClientModule.tsx          # Módulo de clientes
        │   ├── clients/
        │   │   ├── ClientDetailPanel.tsx     # Painel de detalhes do cliente
        │   │   └── ClientFormModal.tsx       # Modal criar/editar cliente
        │   │
        │   ├── FinanceModule.tsx          # Módulo financeiro
        │   ├── finance/
        │   │   ├── ExpenseModal.tsx          # Modal de gastos
        │   │   ├── ExpensesTable.tsx         # Tabela de gastos
        │   │   └── FinanceChart.tsx          # Gráfico financeiro
        │   │
        │   ├── ServiceBarberModule.tsx    # Módulo serviços/barbeiros
        │   ├── services/
        │   │   ├── ServiceCard.tsx           # Card de serviço
        │   │   ├── BarberCard.tsx            # Card de barbeiro
        │   │   └── ServiceBarberModal.tsx    # Modal criar/editar
        │   │
        │   ├── BarberAgenda.tsx           # Agenda individual do barbeiro
        │   │
        │   ├── WhatsAppModule.tsx         # Módulo WhatsApp
        │   ├── whatsapp/
        │   │   ├── ConnectionPanel.tsx       # Painel QR Code + status
        │   │   ├── MessageConfigPanel.tsx    # Edição das 21 mensagens
        │   │   ├── MenuOptionsPanel.tsx      # Edição do menu do bot
        │   │   └── ChatSimulator.tsx        # Simulador de conversa
        │   │
        │   └── ui/                       # Componentes reutilizáveis
        │       ├── Modal.tsx                # Modal genérico
        │       ├── StatsCard.tsx             # Card de estatísticas
        │       ├── PageHeader.tsx            # Header de página
        │       ├── EmptyState.tsx            # Estado vazio
        │       ├── ThemeToggle.tsx           # Toggle de tema
        │       └── index.ts                 # Barrel export
        │
        ├── contexts/
        │   └── AuthContext.tsx           # Context de autenticação (login, logout, user)
        │
        ├── hooks/
        │   └── index.ts                 # Custom hooks
        │
        ├── lib/
        │   ├── api.ts                   # Cliente Axios (interceptors, refresh token)
        │   ├── constants.ts             # Constantes da aplicação
        │   ├── dateUtils.ts             # Utilitários de data
        │   └── formatters.ts            # Formatadores (moeda, telefone, etc.)
        │
        ├── types/
        │   └── index.ts                 # Types TypeScript (interfaces)
        │
        ├── utils/
        │   └── handleApiError.ts        # Handler de erros da API
        │
        └── styles/
            └── globals.css              # Estilos globais + Tailwind
```

---

## 🏗️ ARQUITETURA

### Backend: Controller → Service → Repository

```
Request
  ↓
[Rate Limiter] → [Auth Middleware] → [Validation (Zod)]
  ↓
Controller (req/res)
  ↓
Service (regras de negócio)
  ↓
Repository (SQL queries)
  ↓
PostgreSQL
  ↓
Response (sendSuccess/sendError)
```

### Frontend: App Router + Context

```
App Router (page.tsx)
  ↓
AuthContext (autenticação global)
  ↓
Modules (AppointmentModule, ClientModule, etc.)
  ↓
Sub-components (Cards, Modals, Tables)
  ↓
API Client (Axios com interceptors)
  ↓
Backend API
```

---

## 📊 ESTATÍSTICAS

### Backend
| Métrica | Quantidade |
|---|---|
| Tabelas no banco | 12 |
| Endpoints API | 44 |
| Controllers | 6 |
| Services | 9 |
| Repositories | 8 |
| Middlewares | 3 |
| Migrations | 4 (database.sql + v2, v3, v4) |

### Frontend
| Métrica | Quantidade |
|---|---|
| Páginas | 3 (login, cadastro, dashboard) |
| Componentes | 30+ |
| Módulos principais | 6 (Dashboard, Agendamentos, Clientes, Financeiro, Serviços, WhatsApp) |
| Contexts | 1 (AuthContext) |

### Total
| Métrica | Quantidade |
|---|---|
| Arquivos de código | 60+ |
| Documentação | 10 arquivos MD |
| Tecnologias | 20+ |

---

## 🔧 TECNOLOGIAS

### Backend
| Pacote | Versão | Uso |
|---|---|---|
| express | ^4.18 | HTTP framework |
| pg | ^8.11 | PostgreSQL driver |
| jsonwebtoken | ^9.0 | JWT tokens |
| bcryptjs | ^2.4 | Hash de senhas |
| zod | ^4.3 | Validação de dados |
| pino | ^10.3 | Logging estruturado |
| helmet | ^8.1 | Security headers |
| express-rate-limit | ^8.2 | Rate limiting |
| cors | ^2.8 | Cross-Origin |
| cookie-parser | ^1.4 | Parsing de cookies |
| whatsapp-web.js | ^1.17 | Bot WhatsApp |
| qrcode | ^1.5 | Geração de QR Code |
| node-cron | ^3.0 | Tarefas agendadas |
| axios | ^1.6 | HTTP client |
| dotenv | ^16.3 | Variáveis de ambiente |
| uuid | ^13.0 | Geração de UUIDs |
| nodemon | ^3.0 | Hot reload (dev) |

### Frontend
| Pacote | Versão | Uso |
|---|---|---|
| next | ^15.1 | Framework React |
| react | ^18.3 | UI library |
| typescript | ^5 | Tipagem |
| tailwindcss | ^3.4 | CSS utility-first |
| recharts | ^2.10 | Gráficos |
| lucide-react | ^0.302 | Ícones |
| axios | ^1.6 | HTTP client |
| date-fns | ^3.0 | Datas |
| jspdf | ^4.2 | Geração de PDF |
| jspdf-autotable | ^5.0 | Tabelas em PDF |
