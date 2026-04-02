# ⚡ INSTALAÇÃO - EasyBarber

## 🎯 Resumo

1. Instalar PostgreSQL
2. Configurar banco de dados e variáveis de ambiente
3. Instalar dependências e iniciar

---

## 1️⃣ INSTALAR POSTGRESQL

**Baixar:** https://www.postgresql.org/download/windows/

Durante a instalação:
- ✅ Marcar todos os componentes (Server, pgAdmin, Command Line Tools)
- ⚠️ **ANOTAR A SENHA** do superusuário `postgres`
- Porta: **5432** (padrão)

Após instalar, verifique se o `psql` está no PATH:
```powershell
psql --version
```

Se não for reconhecido:
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

> Guia detalhado: `POSTGRESQL_SETUP.md`

---

## 2️⃣ CONFIGURAR O PROJETO

### Opção A: Script Automático (Recomendado)

```powershell
# Habilitar execução de scripts (uma vez)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Executar setup
.\setup.ps1
```

O script cria banco, tabelas e arquivos `.env` automaticamente.

### Opção B: Manual

**Criar banco de dados:**
```powershell
psql -U postgres -c "CREATE DATABASE barberpro;"
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

**Criar `backend\.env`:**
```env
PORT=5000
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/barberpro
JWT_SECRET=gere_uma_chave_aleatoria_aqui
NODE_ENV=development
```

**Criar `frontend\.env.local`:**
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### Opção C: Docker

```powershell
$env:JWT_SECRET = "sua_chave_secreta"
docker compose up -d
```

Sobe PostgreSQL + Backend + Frontend automaticamente. Pule para a seção "Acessar".

---

## 3️⃣ INSTALAR E INICIAR

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

---

## 4️⃣ ACESSAR

- **Sistema:** http://localhost:3000
- **API:** http://localhost:5000
- **Health Check:** http://localhost:5000/health

### Primeira vez
1. Clique em **"Cadastre-se"**
2. Preencha nome da barbearia, responsável, WhatsApp, email e senha
3. Senha deve ter: mínimo 8 caracteres, 1 maiúscula, 1 número
4. Clique em **"Criar Conta"**

---

## 🔧 Executar Migrations (se necessário)

Se o banco já existia de uma versão anterior, execute as migrations:

```powershell
psql -U postgres -d barberpro -f backend\src\config\migration_v2.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v3.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v4.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v5.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v6.sql
```

---

## ✅ CHECKLIST

- [ ] PostgreSQL instalado e rodando
- [ ] Banco `barberpro` criado com tabelas
- [ ] Arquivo `backend\.env` com DATABASE_URL e JWT_SECRET
- [ ] Arquivo `frontend\.env.local` com NEXT_PUBLIC_API_URL
- [ ] Backend rodando na porta 5000
- [ ] Frontend rodando na porta 3000
- [ ] Consegue acessar http://localhost:3000
- [ ] Consegue criar conta e fazer login

---

## 🆘 PROBLEMAS COMUNS

### ❌ `psql não é reconhecido`
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

### ❌ `password authentication failed`
Corrija a senha em `backend\.env` ou execute:
```powershell
.\fix-env.ps1
```

### ❌ `ECONNREFUSED 127.0.0.1:5432`
PostgreSQL não está rodando:
```powershell
Get-Service postgresql*
Start-Service "postgresql-x64-16"
```

### ❌ `database "barberpro" does not exist`
```powershell
psql -U postgres -c "CREATE DATABASE barberpro;"
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

### ❌ `relation "barbershops" does not exist`
```powershell
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

### ❌ Frontend não conecta com backend
Verifique `frontend\.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```
Reinicie o frontend após alterar.

> Guia completo: `TROUBLESHOOTING.md`

---

## 📚 PRÓXIMOS PASSOS

- **Configurar WhatsApp:** Leia `WHATSAPP_BOT.md`
- **Ver a API:** Leia `API_DOCS.md`
- **Entender o código:** Leia `PROJECT_STRUCTURE.md`
- **Fazer deploy:** Leia `DEPLOY.md`
