# 💈 BarberPro SaaS - Visão Geral

## 🎉 PROJETO COMPLETO E PRONTO PARA USO

SaaS completo e funcional para gestão de barbearias.

---

## ✨ O QUE ESTÁ INCLUÍDO

### Sistema
- ✅ **Backend** — Node.js + Express (API RESTful, 44 endpoints)
- ✅ **Frontend** — Next.js 15 + React + TypeScript + Tailwind CSS
- ✅ **Banco de Dados** — PostgreSQL (12 tabelas + 4 migrations)
- ✅ **Bot WhatsApp** — whatsapp-web.js (QR Code, sem API externa)
- ✅ **Autenticação** — JWT (access + refresh tokens, httpOnly cookies)
- ✅ **Dashboard** — Gráficos interativos em tempo real
- ✅ **Financeiro** — Ganhos automáticos, gastos, relatórios, PDF
- ✅ **Agendamentos** — Calendário, status, conflitos
- ✅ **Clientes** — CRUD, histórico, busca
- ✅ **Serviços/Barbeiros** — CRUD com limites por plano
- ✅ **Planos** — Básico, Profissional, Premium
- ✅ **Lembretes** — Automáticos 2h antes via WhatsApp
- ✅ **Docker** — docker-compose.yml pronto
- ✅ **Segurança** — Helmet, CSP, rate limiting, Zod, bcrypt

### Arquitetura
- ✅ Padrão **Controller → Service → Repository**
- ✅ Validação com **Zod 4**
- ✅ Error handler global com classes de erro customizadas
- ✅ Logging estruturado com **Pino**
- ✅ Respostas padronizadas (`{ success, data }` / `{ success, error }`)
- ✅ Graceful shutdown
- ✅ 30+ componentes React organizados por módulo

---

## 📊 ESTATÍSTICAS

| Métrica | Valor |
|---|---|
| Arquivos de código | 60+ |
| Endpoints API | 44 |
| Tabelas no banco | 12 |
| Controllers | 6 |
| Services | 9 |
| Repositories | 8 |
| Componentes React | 30+ |
| Documentação | 10 arquivos |

---

## 🚀 COMO COMEÇAR

### Opção 1: Setup Automático
```powershell
.\setup.ps1          # Configura banco + .env
cd backend && npm install && npm run dev    # Terminal 1
cd frontend && npm install && npm run dev   # Terminal 2
```

### Opção 2: Docker
```powershell
$env:JWT_SECRET = "chave_secreta"
docker compose up -d
```

### Acesse: http://localhost:3000

> Guia detalhado: `QUICK_START.md`

---

## 🎨 DESIGN

| Propriedade | Valor |
|---|---|
| Cor primária | Laranja (#FF7A00) |
| Cor secundária | Preto (#000000) |
| Fundo | Cinza escuro (#0a0a0a) |
| Ícones | Lucide React |
| Gráficos | Recharts |
| Responsivo | Desktop, Laptop, Tablet, Mobile |

---

## 💳 PLANOS

| Plano | Preço | Barbeiros | Clientes |
|---|---|---|---|
| Básico | R$ 49,90/mês | 1 | 100 |
| Profissional | R$ 99,90/mês | 5 | 500 |
| Premium | R$ 199,90/mês | Ilimitado | Ilimitado |

> Detalhes: `PLANOS.md`

---

## 🤖 BOT WHATSAPP

```
Cliente: mensagem → Bot: Menu de opções
  1. Agendar horário → Serviço → Barbeiro → Data → Horário → ✅ Confirmação
  2. Ver serviços → Lista com preços e durações
  3. Cancelar agendamento
  4. Reagendar
  5. Avaliar atendimento
  6. Promoções
  7. Instagram
  8. Falar com humano
  9. Encerrar
```

- 21 mensagens configuráveis pelo painel
- Menu customizável (até 15 opções)
- Lembrete automático 2h antes

> Detalhes: `WHATSAPP_BOT.md`

---

## 🔐 SEGURANÇA

- Bcrypt para senhas (CHAR(60))
- JWT com access + refresh tokens
- Cookies httpOnly
- Helmet + CSP + HSTS
- Rate limiting
- Validação Zod em todas as entradas
- Queries parametrizadas
- Logging com Pino
- Graceful shutdown

---

## 📚 DOCUMENTAÇÃO

| Arquivo | Conteúdo |
|---|---|
| `QUICK_START.md` | Como rodar o projeto |
| `INSTALL.md` | Instalação passo a passo |
| `API_DOCS.md` | 44 endpoints documentados |
| `PROJECT_STRUCTURE.md` | Estrutura completa do código |
| `DEPLOY.md` | Deploy (Docker, Cloud, VPS) |
| `POSTGRESQL_SETUP.md` | Instalação do PostgreSQL |
| `PLANOS.md` | Planos de assinatura |
| `WHATSAPP_BOT.md` | Bot WhatsApp |
| `TROUBLESHOOTING.md` | Problemas e soluções |
