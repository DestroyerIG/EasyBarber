# 🐘 GUIA DE INSTALAÇÃO DO POSTGRESQL

## 📥 PASSO 1: INSTALAR

### Opção 1: Instalador Oficial (Recomendado)

1. **Baixar:** https://www.postgresql.org/download/windows/
2. Clique em "Download the installer"
3. Escolha **PostgreSQL 16.x** para Windows x86-64
4. Execute o instalador

**Durante a instalação:**
- ✅ Marcar: PostgreSQL Server, pgAdmin 4, Command Line Tools
- ⚠️ **ANOTE A SENHA** do superusuário `postgres`
- Porta: **5432** (manter padrão)
- Locale: Default locale

### Opção 2: Winget

```powershell
winget install PostgreSQL.PostgreSQL
```

---

## ✅ PASSO 2: VERIFICAR INSTALAÇÃO

### Adicionar ao PATH (se necessário)

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

Para tornar permanente (PowerShell como Admin):
```powershell
[Environment]::SetEnvironmentVariable(
    "Path",
    "$env:Path;C:\Program Files\PostgreSQL\16\bin",
    [EnvironmentVariableTarget]::Machine
)
```

### Testar

```powershell
psql --version
# psql (PostgreSQL) 16.x
```

---

## 🔧 PASSO 3: CRIAR BANCO DE DADOS

### Via linha de comando

```powershell
psql -U postgres -c "CREATE DATABASE barberpro;"
```

### Via pgAdmin

1. Abra o pgAdmin 4 (menu iniciar)
2. Conecte ao servidor (localhost, porta 5432, senha do postgres)
3. Botão direito em "Databases" → "Create" → "Database"
4. Nome: `barberpro` → Salvar

---

## 📊 PASSO 4: CRIAR TABELAS

### Via linha de comando (Recomendado)

```powershell
# Na pasta raiz do projeto
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

### Via pgAdmin

1. Expanda "Databases" → "barberpro"
2. Botão direito em "barberpro" → "Query Tool"
3. Abra e copie o conteúdo de `backend/src/config/database.sql`
4. Cole e execute (F5)

---

## ✅ PASSO 5: VERIFICAR TABELAS

```powershell
psql -U postgres -d barberpro -c "\dt"
```

Deve exibir 12 tabelas:

```
 Schema |        Name            | Type  |  Owner
--------+------------------------+-------+----------
 public | appointments           | table | postgres
 public | barbershops            | table | postgres
 public | barbers                | table | postgres
 public | clients                | table | postgres
 public | earnings               | table | postgres
 public | expenses               | table | postgres
 public | refresh_tokens         | table | postgres
 public | services               | table | postgres
 public | users                  | table | postgres
 public | whatsapp_bot_config    | table | postgres
 public | whatsapp_ratings       | table | postgres
 public | whatsapp_sessions      | table | postgres
```

---

## 🔧 PASSO 6: APLICAR MIGRATIONS (se necessário)

Se você já tinha o banco de uma versão anterior:

```powershell
psql -U postgres -d barberpro -f backend\src\config\migration_v2.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v3.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v4.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v5.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v6.sql
```

---

## 🔐 PASSO 7: CONFIGURAR .ENV

Crie o arquivo `backend\.env`:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/barberpro
JWT_SECRET=gere_uma_chave_aleatoria_aqui
NODE_ENV=development
```

> Substitua `SUA_SENHA` pela senha definida na instalação do PostgreSQL.

Ou use o script automático:
```powershell
.\setup.ps1
```

---

## 🧪 PASSO 8: TESTAR CONEXÃO

```powershell
cd backend
npm install
npm run dev
```

Deve exibir:
```
Servidor rodando na porta 5000
Conexão com banco de dados verificada
```

Ou teste via Health Check:
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
# { status: "ok", db: "connected" }
```

---

## 🛠️ PROBLEMAS COMUNS

### ❌ `psql não é reconhecido`
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

### ❌ `password authentication failed`
Senha incorreta. Verifique em `backend\.env` ou execute `.\fix-env.ps1`.

### ❌ `ECONNREFUSED :5432`
PostgreSQL não está rodando:
```powershell
Start-Service "postgresql-x64-16"
```

### ❌ Porta 5432 já em uso
Outra instância do PostgreSQL está rodando. Verifique:
```powershell
netstat -ano | findstr ":5432"
```

### ❌ Esqueceu a senha do postgres
1. Edite `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
2. Mude `scram-sha-256` para `trust` na linha do localhost
3. Reinicie o PostgreSQL
4. Conecte: `psql -U postgres`
5. Mude a senha: `ALTER USER postgres PASSWORD 'nova_senha';`
6. Reverta `pg_hba.conf` para `scram-sha-256`
7. Reinicie o PostgreSQL

---

## 💡 DICAS

- Use o **pgAdmin** para visualizar dados (interface gráfica)
- Use `psql -U postgres -d barberpro` para acesso rápido via terminal
- Configure backup automático em produção:
  ```powershell
  pg_dump -U postgres -d barberpro > backup_$(Get-Date -Format 'yyyy-MM-dd').sql
  ```
