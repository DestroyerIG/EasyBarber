# 📁 ESTRUTURA DO PROJETO - BarberPro SaaS

## 🌳 Árvore de Arquivos

```
Barberpro-saas/
│
├── 📄 README.md                    # Documentação principal
├── 📄 QUICK_START.md               # Guia de inicialização rápida
├── 📄 API_DOCS.md                  # Documentação da API
├── 📄 PLANOS.md                    # Detalhes dos planos de assinatura
├── 📄 WHATSAPP_BOT.md              # Guia do bot WhatsApp
├── 📄 package.json                 # Configuração do projeto raiz
├── 📄 .gitignore                   # Arquivos ignorados pelo Git
│
├── 📂 backend/                     # Backend Node.js + Express
│   ├── 📄 package.json             # Dependências do backend
│   └── 📂 src/
│       ├── 📄 server.js            # Servidor principal
│       │
│       ├── 📂 config/
│       │   ├── 📄 database.js      # Configuração do PostgreSQL
│       │   └── 📄 database.sql     # Script de criação das tabelas
│       │
│       ├── 📂 controllers/
│       │   ├── 📄 authController.js           # Login e registro
│       │   ├── 📄 dashboardController.js      # Dashboard
│       │   ├── 📄 appointmentController.js    # Agendamentos
│       │   ├── 📄 clientController.js         # Clientes
│       │   ├── 📄 financeController.js        # Financeiro
│       │   └── 📄 serviceController.js        # Serviços e barbeiros
│       │
│       ├── 📂 middleware/
│       │   └── 📄 auth.js          # Autenticação JWT e controle de planos
│       │
│       ├── 📂 routes/
│       │   ├── 📄 auth.js          # Rotas de autenticação
│       │   ├── 📄 dashboard.js     # Rotas do dashboard
│       │   ├── 📄 appointments.js  # Rotas de agendamentos
│       │   ├── 📄 clients.js       # Rotas de clientes
│       │   ├── 📄 finance.js       # Rotas financeiras
│       │   ├── 📄 barbershop.js    # Rotas de serviços/barbeiros
│       │   └── 📄 whatsapp.js      # Rotas do WhatsApp
│       │
│       └── 📂 services/
│           ├── 📄 whatsappService.js    # Lógica do bot WhatsApp
│           └── 📄 cronService.js        # Cron jobs (lembretes)
│
└── 📂 frontend/                    # Frontend Next.js + React
    ├── 📄 package.json             # Dependências do frontend
    ├── 📄 next.config.js           # Configuração do Next.js
    ├── 📄 tsconfig.json            # Configuração TypeScript
    ├── 📄 tailwind.config.js       # Configuração Tailwind CSS
    ├── 📄 postcss.config.js        # Configuração PostCSS
    │
    └── 📂 src/
        ├── 📂 app/                 # Páginas Next.js 15 (App Router)
        │   ├── 📄 layout.tsx       # Layout global
        │   ├── 📄 page.tsx         # Página de login/registro
        │   └── 📂 dashboard/
        │       └── 📄 page.tsx     # Dashboard administrativo
        │
        ├── 📂 components/          # Componentes React (vazio, pronto para expansão)
        │
        ├── 📂 lib/
        │   └── 📄 api.ts           # Cliente Axios para API
        │
        └── 📂 styles/
            └── 📄 globals.css      # Estilos globais + Tailwind
```

---

## 📋 RESUMO DOS ARQUIVOS

### 🎯 Backend (20 arquivos)

#### Configuração
- `server.js` - Servidor Express principal
- `database.js` - Conexão PostgreSQL
- `database.sql` - Schema do banco de dados

#### Controllers (6 arquivos)
- `authController.js` - Autenticação e registro
- `dashboardController.js` - Métricas do dashboard
- `appointmentController.js` - CRUD de agendamentos
- `clientController.js` - Gestão de clientes
- `financeController.js` - Controle financeiro
- `serviceController.js` - Serviços e barbeiros

#### Middleware (1 arquivo)
- `auth.js` - JWT + controle de acesso por planos

#### Routes (7 arquivos)
- `auth.js` - POST /register, /login
- `dashboard.js` - GET /dashboard
- `appointments.js` - CRUD agendamentos
- `clients.js` - CRUD clientes
- `finance.js` - Endpoints financeiros
- `barbershop.js` - Serviços e barbeiros
- `whatsapp.js` - Webhook WhatsApp

#### Services (2 arquivos)
- `whatsappService.js` - Bot conversacional WhatsApp
- `cronService.js` - Lembretes automáticos

---

### 🎨 Frontend (10 arquivos)

#### Configuração (5 arquivos)
- `next.config.js` - Config Next.js
- `tsconfig.json` - TypeScript
- `tailwind.config.js` - Tailwind (cores customizadas)
- `postcss.config.js` - PostCSS
- `package.json` - Dependências

#### Páginas (3 arquivos)
- `layout.tsx` - Layout global
- `page.tsx` - Login/Registro
- `dashboard/page.tsx` - Dashboard completo

#### Utilitários (2 arquivos)
- `api.ts` - Cliente HTTP (Axios)
- `globals.css` - Estilos globais

---

## 📊 ESTATÍSTICAS DO PROJETO

### Backend
- **Linhas de código:** ~2.500
- **Endpoints API:** 19
- **Tabelas no DB:** 9
- **Controllers:** 6
- **Middleware:** 1
- **Services:** 2

### Frontend
- **Componentes:** 2 páginas principais
- **Linhas de código:** ~600
- **Framework:** Next.js 15 (App Router)
- **Estilização:** Tailwind CSS
- **Charts:** Recharts

### Total
- **Arquivos criados:** 37
- **Documentação:** 5 arquivos MD
- **Tecnologias:** 15+

---

## 🔧 TECNOLOGIAS UTILIZADAS

### Backend
✅ Node.js v18+  
✅ Express v4  
✅ PostgreSQL v14+  
✅ JWT (jsonwebtoken)  
✅ Bcrypt (senha)  
✅ Node-cron (agendamento)  
✅ Axios (HTTP client)  
✅ CORS  
✅ Dotenv  

### Frontend
✅ Next.js v15  
✅ React v18  
✅ TypeScript  
✅ Tailwind CSS  
✅ Recharts (gráficos)  
✅ Lucide React (ícones)  
✅ Axios  
✅ Date-fns  

### Infraestrutura
✅ PostgreSQL (banco de dados)  
✅ WhatsApp Business API  
✅ Git  

---

## 🌐 ROTAS DA API

### Autenticação
```
POST   /api/auth/register          Cadastrar barbearia
POST   /api/auth/login             Login
```

### Dashboard
```
GET    /api/dashboard              Métricas gerais
```

### Agendamentos
```
GET    /api/appointments           Listar agendamentos
POST   /api/appointments           Criar agendamento
PUT    /api/appointments/:id/status Atualizar status
GET    /api/appointments/available-slots Horários disponíveis
```

### Clientes
```
GET    /api/clients                Listar clientes
POST   /api/clients                Criar cliente
GET    /api/clients/:id/history    Histórico do cliente
```

### Financeiro
```
GET    /api/finance/summary        Resumo financeiro
GET    /api/finance/monthly        Relatório mensal (🔒 Pro+)
POST   /api/finance/expenses       Adicionar gasto
GET    /api/finance/expenses       Listar gastos
```

### Serviços e Barbeiros
```
GET    /api/barbershop/services    Listar serviços
POST   /api/barbershop/services    Criar serviço
GET    /api/barbershop/barbers     Listar barbeiros
POST   /api/barbershop/barbers     Criar barbeiro (🔒 limite por plano)
```

### WhatsApp
```
POST   /api/whatsapp/webhook       Webhook do bot
```

---

## 🗄️ SCHEMA DO BANCO DE DADOS

### Tabelas Criadas (9)

1. **barbershops** - Dados das barbearias
2. **users** - Usuários do sistema
3. **barbers** - Barbeiros
4. **services** - Serviços oferecidos
5. **clients** - Clientes
6. **appointments** - Agendamentos
7. **earnings** - Ganhos
8. **expenses** - Gastos
9. **whatsapp_sessions** - Sessões do bot

### Relacionamentos
```
barbershops ─┬─ users
             ├─ barbers
             ├─ services
             ├─ clients
             ├─ appointments
             ├─ earnings
             ├─ expenses
             └─ whatsapp_sessions

appointments ─┬─ clients
              ├─ barbers
              ├─ services
              └─ earnings
```

---

## 🎯 FUNCIONALIDADES IMPLEMENTADAS

### ✅ Autenticação e Autorização
- [x] Registro de barbearias
- [x] Login com JWT
- [x] Middleware de autenticação
- [x] Controle de acesso por planos

### ✅ Dashboard
- [x] Métricas do dia
- [x] Gráfico semanal
- [x] Cards com ícones
- [x] Atualização em tempo real

### ✅ Agendamentos
- [x] Criar agendamento
- [x] Listar agendamentos
- [x] Filtrar por data/status
- [x] Atualizar status
- [x] Verificar disponibilidade
- [x] Registro automático de ganhos

### ✅ Bot WhatsApp
- [x] Fluxo completo de agendamento
- [x] Sessões temporárias
- [x] Validação de horários
- [x] Confirmação automática
- [x] Lembretes 2h antes

### ✅ Financeiro
- [x] Registro de ganhos
- [x] Cadastro de gastos
- [x] Resumo diário/mensal
- [x] Relatórios (Pro+)
- [x] Cálculo de lucro

### ✅ Clientes
- [x] Cadastro de clientes
- [x] Histórico de atendimentos
- [x] Total gasto por cliente
- [x] Última visita

### ✅ Serviços e Barbeiros
- [x] CRUD de serviços
- [x] CRUD de barbeiros
- [x] Limite por plano
- [x] Status ativo/inativo

---

## 📚 DOCUMENTAÇÃO DISPONÍVEL

1. **README.md** - Visão geral, instalação, configuração
2. **QUICK_START.md** - Guia passo a passo para rodar
3. **API_DOCS.md** - Documentação completa da API
4. **PLANOS.md** - Detalhes dos planos de assinatura
5. **WHATSAPP_BOT.md** - Guia do bot WhatsApp
6. **PROJECT_STRUCTURE.md** - Este arquivo (estrutura do projeto)

---

## 🚀 PRÓXIMOS PASSOS PARA DESENVOLVIMENTO

### Funcionalidades Futuras
- [ ] Upload de fotos de barbeiros
- [ ] Exportar relatórios em PDF
- [ ] Notificações push
- [ ] App mobile nativo
- [ ] Integração Instagram
- [ ] Programa de fidelidade
- [ ] Sistema de avaliações
- [ ] Multi-unidades (Premium)
- [ ] Marketplace de produtos

### Melhorias Técnicas
- [ ] Testes unitários
- [ ] Testes de integração
- [ ] CI/CD
- [ ] Docker
- [ ] Rate limiting
- [ ] Cache com Redis
- [ ] Logs estruturados
- [ ] Monitoramento (Sentry)

---

## 🧪 COMO TESTAR

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Banco de Dados
```bash
psql -U postgres -d barberpro -f backend/src/config/database.sql
```

### API
Use Postman, Insomnia ou Thunder Client com a collection em `API_DOCS.md`

---

## 🔐 VARIÁVEIS DE AMBIENTE

### Backend (.env)
```env
PORT=5000
DATABASE_URL=postgresql://user:pass@localhost:5432/barberpro
JWT_SECRET=chave_secreta
WHATSAPP_API_KEY=key
WHATSAPP_API_URL=url
NODE_ENV=development
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

## 📞 SUPORTE

Para dúvidas sobre a estrutura:
1. Consulte a documentação
2. Verifique os comentários no código
3. Teste as rotas com Postman

---

**Desenvolvido com ❤️ para revolucionar a gestão de barbearias**
