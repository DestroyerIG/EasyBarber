# 💈 BarberPro SaaS - Sistema Completo para Barbearias

Sistema SaaS completo para gestão de barbearias com agendamento automático via WhatsApp, controle financeiro e painel administrativo profissional.

## 🎨 Identidade Visual

- **Primária:** Laranja (#FF7A00)
- **Secundária:** Preto (#000000)
- **Fundo:** Cinza escuro (#0a0a0a)
- **Design Responsivo:** Desktop, Laptop, Tablet e Mobile

## 🚀 Funcionalidades

### 🔐 Autenticação e Segurança
- Login e cadastro com validação Zod
- Tokens JWT (access + refresh) via httpOnly cookies
- Política de senha forte (8+ caracteres, maiúscula, número)
- Rate limiting por IP (100 req/15min geral, 20 req/15min para auth)
- Headers de segurança (Helmet, CSP, HSTS)

### 📊 Dashboard Administrativo
- Agendamentos do dia
- Ganhos, gastos e lucro em tempo real
- Total de clientes atendidos
- Gráfico semanal de faturamento

### 🤖 Bot WhatsApp (whatsapp-web.js)
- Conexão local via QR Code (sem API externa)
- 9 opções de menu padrão + opções customizáveis (até 15)
- 21 mensagens configuráveis pelo painel
- Fluxo automático: serviço → barbeiro → data → horário → confirmação
- Cancelamento e reagendamento pelo bot
- Avaliação pós-atendimento
- Lembretes automáticos 2h antes (cron a cada 10 min)

### 📅 Gestão de Agendamentos
- Calendário interativo com navegação por dia
- Status: Confirmado, Cancelado, Concluído
- Detecção de conflitos de horário
- Registro automático de ganho ao concluir

### 💰 Módulo Financeiro
- Registro automático de ganhos (ao concluir agendamento)
- Cadastro de gastos com categorias
- Relatórios mensais (plano Profissional+)
- Exportação em PDF
- Gráficos de crescimento

### 👥 Gestão de Clientes
- Cadastro completo (nome, telefone, email, endereço, notas)
- Histórico de atendimentos
- Total gasto e última visita
- Busca rápida

### 💈 Gestão de Serviços e Barbeiros
- Serviços com nome, preço e duração
- Barbeiros com foto
- Agenda individual por barbeiro
- Limites por plano de assinatura

### 💳 Planos de Assinatura
- **Básico** (R$ 49,90/mês): 1 barbeiro, 100 clientes
- **Profissional** (R$ 99,90/mês): 5 barbeiros, 500 clientes, relatórios
- **Premium** (R$ 199,90/mês): Ilimitado, todas as funcionalidades

## 🛠️ Stack Tecnológica

### Backend
| Tecnologia | Uso |
|---|---|
| Node.js 20 | Runtime |
| Express 4 | Framework HTTP |
| PostgreSQL 16 | Banco de dados |
| JWT + Refresh Tokens | Autenticação |
| Bcrypt | Hash de senhas |
| Zod 4 | Validação de dados |
| Pino | Logging estruturado |
| Helmet | Headers de segurança |
| express-rate-limit | Rate limiting |
| whatsapp-web.js | Bot WhatsApp (QR Code) |
| node-cron | Lembretes automáticos |
| Docker | Containerização |

### Frontend
| Tecnologia | Uso |
|---|---|
| Next.js 15 | Framework React (App Router) |
| React 18 | UI Library |
| TypeScript | Type Safety |
| Tailwind CSS 3 | Estilização |
| Recharts | Gráficos |
| Lucide React | Ícones |
| jsPDF | Exportação PDF |
| date-fns | Manipulação de datas |
| Axios | Cliente HTTP |

### Arquitetura Backend
```
Controller → Service → Repository → Database (PostgreSQL)
```
- **Controllers**: Lógica de requisição/resposta
- **Services**: Regras de negócio
- **Repositories**: Acesso ao banco de dados
- **Middleware**: Auth (JWT), Validação (Zod), Error Handler
- **Erro personalizado**: AppError, ValidationError, NotFoundError, etc.

## 📦 Instalação Rápida

> Para guia completo, veja `INSTALL.md` e `QUICK_START.md`

### Pré-requisitos
- Node.js 20+ (ou 18+)
- PostgreSQL 14+
- Git

### 1. Clone e instale
```powershell
git clone <seu-repositorio>
cd Barberpro-saas
```

### 2. Execute o script de configuração automática
```powershell
.\setup.ps1
```
O script cria o banco, tabelas e arquivos `.env` automaticamente.

### 3. Instale as dependências e inicie

**Terminal 1 — Backend:**
```powershell
cd backend
npm install
npm run dev
```

**Terminal 2 — Frontend:**
```powershell
cd frontend
npm install
npm run dev
```

### 4. Acesse
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/health

### Com Docker
```powershell
docker compose up -d
```
Sobe PostgreSQL, Backend e Frontend automaticamente.

## 🗄️ Banco de Dados

### 12 Tabelas
| Tabela | Descrição |
|---|---|
| `barbershops` | Dados das barbearias |
| `users` | Usuários e autenticação |
| `refresh_tokens` | Tokens de refresh JWT |
| `barbers` | Barbeiros |
| `services` | Serviços oferecidos |
| `clients` | Clientes |
| `appointments` | Agendamentos |
| `earnings` | Ganhos (automático) |
| `expenses` | Gastos |
| `whatsapp_sessions` | Sessões do bot |
| `whatsapp_bot_config` | Configurações de mensagens do bot |
| `whatsapp_ratings` | Avaliações dos clientes |

### Migrations
- `database.sql` — Schema inicial (12 tabelas)
- `migration_v2.sql` — Constraints, índices, refresh_tokens, trigger updated_at
- `migration_v3.sql` — 21 mensagens configuráveis, tabela menu_options, 9 opções padrão
- `migration_v4.sql` — Índices de performance (conflitos, lookup, dashboard)

## 🔌 API Endpoints

> Documentação completa em `API_DOCS.md`

### Autenticação (`/api/auth`)
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | `/register` | Cadastrar barbearia | Não |
| POST | `/login` | Login | Não |
| POST | `/refresh` | Renovar access token | Não |
| POST | `/logout` | Logout | Não |
| GET | `/me` | Dados do usuário atual | Sim |

### Dashboard (`/api/dashboard`)
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/` | Métricas do dashboard | Sim |

### Agendamentos (`/api/appointments`)
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/` | Listar agendamentos | Sim |
| GET | `/available-slots` | Horários disponíveis | Sim |
| POST | `/` | Criar agendamento | Sim |
| PUT | `/:id` | Atualizar agendamento | Sim |
| PUT | `/:id/status` | Atualizar status | Sim |
| DELETE | `/:id` | Excluir agendamento | Sim |

### Clientes (`/api/clients`)
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/` | Listar clientes | Sim |
| POST | `/` | Cadastrar cliente | Sim |
| PUT | `/:id` | Atualizar cliente | Sim |
| GET | `/:id/history` | Histórico do cliente | Sim |

### Financeiro (`/api/finance`)
| Método | Rota | Descrição | Auth | Plano |
|---|---|---|---|---|
| GET | `/summary` | Resumo financeiro | Sim | Todos |
| GET | `/monthly` | Relatório mensal | Sim | Profissional+ |
| POST | `/expenses` | Adicionar gasto | Sim | Todos |
| PUT | `/expenses/:id` | Atualizar gasto | Sim | Todos |
| DELETE | `/expenses/:id` | Excluir gasto | Sim | Todos |
| GET | `/expenses` | Listar gastos | Sim | Todos |

### Serviços e Barbeiros (`/api/barbershop`)
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| GET | `/services` | Listar serviços | Sim |
| POST | `/services` | Criar serviço | Sim |
| PUT | `/services/:id` | Atualizar serviço | Sim |
| DELETE | `/services/:id` | Excluir serviço | Sim |
| GET | `/barbers` | Listar barbeiros | Sim |
| POST | `/barbers` | Criar barbeiro | Sim |
| PUT | `/barbers/:id` | Atualizar barbeiro | Sim |
| DELETE | `/barbers/:id` | Excluir barbeiro | Sim |

### WhatsApp (`/api/whatsapp`)
| Método | Rota | Descrição | Auth |
|---|---|---|---|
| POST | `/webhook` | Receber mensagens | Não |
| GET | `/status` | Status da conexão | Sim |
| GET | `/qr` | QR Code para conectar | Sim |
| POST | `/logout` | Desconectar WhatsApp | Sim |
| POST | `/restart` | Reiniciar conexão | Sim |
| GET | `/config` | Configurações do bot | Sim |
| PUT | `/config` | Atualizar mensagens | Sim |
| POST | `/config/reset` | Resetar mensagens | Sim |
| GET | `/config/menu` | Opções do menu | Sim |
| POST | `/config/menu` | Criar opção de menu | Sim |
| PUT | `/config/menu/:id` | Atualizar opção | Sim |
| DELETE | `/config/menu/:id` | Excluir opção | Sim |
| PUT | `/config/menu-reorder` | Reordenar menu | Sim |
| POST | `/config/menu/reset` | Resetar menu | Sim |

**Total: 39 endpoints**

## 🔒 Segurança Implementada

- ✅ Senhas com bcrypt (CHAR(60))
- ✅ JWT com access + refresh tokens
- ✅ Cookies httpOnly (não acessíveis via JavaScript)
- ✅ Validação Zod em todas as entradas
- ✅ Proteção contra SQL Injection (queries parametrizadas)
- ✅ Helmet (headers de segurança)
- ✅ CSP (Content Security Policy) no frontend
- ✅ Rate limiting (geral + auth)
- ✅ CORS configurado
- ✅ HSTS habilitado
- ✅ Graceful shutdown
- ✅ Log estruturado com Pino

## 📈 Deploy

> Guia completo em `DEPLOY.md`

### Com Docker (Recomendado)
```powershell
# Configurar variáveis
cp .env.example .env
# Editar .env com suas configurações

docker compose up -d
```

### Manual
- **Backend:** Railway, Render, VPS com PM2
- **Frontend:** Vercel (otimizado para Next.js)
- **Banco:** Railway, Supabase, Neon.tech

## 📚 Documentação

| Arquivo | Descrição |
|---|---|
| `README.md` | Este arquivo — Visão geral |
| `QUICK_START.md` | Guia passo-a-passo para rodar |
| `INSTALL.md` | Instalação simplificada |
| `API_DOCS.md` | Documentação completa da API |
| `PROJECT_STRUCTURE.md` | Estrutura do código |
| `DEPLOY.md` | Deploy em produção |
| `POSTGRESQL_SETUP.md` | Instalação do PostgreSQL |
| `PLANOS.md` | Detalhes dos planos |
| `WHATSAPP_BOT.md` | Configuração do bot |
| `TROUBLESHOOTING.md` | Problemas comuns |

## 📝 Licença

Este projeto é proprietário. Todos os direitos reservados.
