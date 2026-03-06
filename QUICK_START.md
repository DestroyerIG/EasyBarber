# 🚀 GUIA DE INICIALIZAÇÃO RÁPIDA - BarberPro SaaS

## ✅ Pré-requisitos

- **Node.js 20+** (ou 18+) — https://nodejs.org
- **PostgreSQL 14+** — https://www.postgresql.org/download/windows/
- **Git** — https://git-scm.com

---

## 📋 OPÇÃO 1: Setup Automático (Recomendado)

### 1️⃣ Habilitar scripts PowerShell (caso necessário)

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2️⃣ Executar o script de configuração

```powershell
.\setup.ps1
```

O script faz tudo automaticamente:
- ✅ Testa conexão com PostgreSQL
- ✅ Cria o banco `barberpro`
- ✅ Cria todas as 12 tabelas
- ✅ Gera arquivo `backend\.env` (porta 5432, JWT_SECRET aleatório)
- ✅ Gera arquivo `frontend\.env.local`

### 3️⃣ Instalar e iniciar Backend (Terminal 1)

```powershell
cd backend
npm install
npm run dev
```

Aguarde a mensagem:
```
Servidor rodando na porta 5000
Conexão com banco de dados verificada
```

### 4️⃣ Instalar e iniciar Frontend (Terminal 2 — nova janela)

```powershell
cd frontend
npm install
npm run dev
```

Aguarde:
```
✓ Ready on http://localhost:3000
```

### 5️⃣ Acessar o sistema

Abra: **http://localhost:3000**

---

## 📋 OPÇÃO 2: Setup Manual

### 1️⃣ Criar banco de dados PostgreSQL

```powershell
# Conectar ao PostgreSQL
psql -U postgres

# Criar banco
CREATE DATABASE barberpro;
\q

# Executar script de tabelas
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

Ou abra o **pgAdmin**, crie o banco `barberpro` e execute o conteúdo de `backend\src\config\database.sql` na Query Tool.

### 2️⃣ Criar arquivo `backend\.env`

```env
PORT=5000
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/barberpro
JWT_SECRET=gere_uma_chave_aleatoria_longa_aqui
NODE_ENV=development
```

> ⚠️ Substitua `SUA_SENHA` pela senha do seu PostgreSQL (definida na instalação).

### 3️⃣ Criar arquivo `frontend\.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 4️⃣ Instalar e iniciar

**Terminal 1 (Backend):**
```powershell
cd backend
npm install
npm run dev
```

**Terminal 2 (Frontend):**
```powershell
cd frontend
npm install
npm run dev
```

---

## 📋 OPÇÃO 3: Docker Compose

Se você tem Docker instalado, basta executar:

```powershell
docker compose up -d
```

Isso sobe automaticamente:
- **PostgreSQL 16** na porta 5432
- **Backend** na porta 5000
- **Frontend** na porta 3000

> Configure a variável `JWT_SECRET` antes:
> ```powershell
> $env:JWT_SECRET = "sua_chave_secreta_aqui"
> docker compose up -d
> ```

---

## 🎉 Primeiro Acesso

1. Abra **http://localhost:3000**
2. Clique em **"Cadastre-se"**
3. Preencha os dados:
   - Nome da Barbearia
   - Nome do Responsável
   - WhatsApp
   - Email
   - Senha (mínimo 8 caracteres, 1 maiúscula, 1 número)
4. Clique em **"Criar Conta"**
5. Você será redirecionado para o Dashboard

---

## 🧪 Testar a API

### Cadastrar conta (via terminal)

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method POST -ContentType "application/json" -Body '{
  "barbershopName": "Barbearia Teste",
  "ownerName": "João Silva",
  "email": "joao@teste.com",
  "whatsapp": "11999999999",
  "password": "Senha123"
}'
```

### Health Check

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

Deve retornar: `{ status: "ok", db: "connected", uptime: ... }`

---

## 📱 Configurar WhatsApp (Opcional)

O BarberPro usa **whatsapp-web.js** — conexão local via QR Code:

1. Inicie o backend (`npm run dev`)
2. Faça login no sistema
3. Acesse a aba **WhatsApp** no dashboard
4. Escaneie o **QR Code** com o app WhatsApp do celular
5. Pronto! O bot já responde mensagens automaticamente

> Não é necessário conta em API externa (Z-API, Twilio, etc.). A conexão é direta via WhatsApp Web.

### Personalizar mensagens do bot

No painel WhatsApp do dashboard, você pode:
- Editar 21 mensagens (boas-vindas, confirmação, lembrete, etc.)
- Adicionar/remover opções de menu (até 15 opções)
- Reordenar itens do menu
- Resetar para mensagens padrão

---

## 🛠️ Comandos Úteis

### Backend
```powershell
cd backend
npm run dev       # Desenvolvimento (com nodemon)
npm start         # Produção
```

### Frontend
```powershell
cd frontend
npm run dev       # Desenvolvimento
npm run build     # Build de produção
npm start         # Servir build de produção
```

### Raiz do projeto
```powershell
npm run install:all    # Instalar dependências de backend e frontend
npm run dev:backend    # Iniciar apenas backend
npm run dev:frontend   # Iniciar apenas frontend
```

### Docker
```powershell
docker compose up -d       # Subir todos os serviços
docker compose down        # Parar todos os serviços
docker compose logs -f     # Ver logs em tempo real
```

---

## 🆘 Problemas?

| Problema | Solução |
|---|---|
| `psql não é reconhecido` | Adicione ao PATH: `$env:Path += ";C:\Program Files\PostgreSQL\16\bin"` |
| `password authentication failed` | Corrija a senha em `backend\.env` ou execute `.\fix-env.ps1` |
| `ECONNREFUSED :5432` | Inicie o PostgreSQL: `Start-Service "postgresql-x64-16"` |
| `database "barberpro" does not exist` | Crie o banco: `psql -U postgres -c "CREATE DATABASE barberpro;"` |
| `relation "barbershops" does not exist` | Execute: `psql -U postgres -d barberpro -f backend\src\config\database.sql` |
| Frontend não conecta com backend | Verifique se `frontend\.env.local` contém `NEXT_PUBLIC_API_URL=http://localhost:5000/api` |
| Erro de CORS | Verifique se `FRONTEND_URL` no `.env` do backend é `http://localhost:3000` |
| Script setup.ps1 não executa | Execute: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |

> Guia completo de troubleshooting: `TROUBLESHOOTING.md`

---

## 📚 Documentação

- **INSTALL.md** — Instalação passo a passo
- **POSTGRESQL_SETUP.md** — Instalação detalhada do PostgreSQL
- **API_DOCS.md** — Documentação da API (39 endpoints)
- **PROJECT_STRUCTURE.md** — Estrutura do código
- **WHATSAPP_BOT.md** — Configuração do bot WhatsApp
- **PLANOS.md** — Detalhes dos planos de assinatura
- **DEPLOY.md** — Deploy em produção
- **TROUBLESHOOTING.md** — Problemas comuns e soluções
