# 🐘 GUIA DE INSTALAÇÃO E CONFIGURAÇÃO DO POSTGRESQL

## 📥 PASSO 1: INSTALAR O POSTGRESQL

### Opção 1: Instalador Oficial (Recomendado)

1. **Baixar o PostgreSQL:**
   - Acesse: https://www.postgresql.org/download/windows/
   - Clique em "Download the installer"
   - Escolha a versão **PostgreSQL 16.x** (mais recente)
   - Baixe o instalador para Windows x86-64

2. **Executar o Instalador:**
   - Execute o arquivo baixado (`postgresql-16.x-windows-x64.exe`)
   - Clique em "Next" na tela de boas-vindas

3. **Escolher Diretório de Instalação:**
   - Mantenha o padrão: `C:\Program Files\PostgreSQL\16`
   - Clique em "Next"

4. **Selecionar Componentes:**
   - ✅ PostgreSQL Server
   - ✅ pgAdmin 4 (interface gráfica)
   - ✅ Stack Builder (opcional)
   - ✅ Command Line Tools
   - Clique em "Next"

5. **Diretório de Dados:**
   - Mantenha o padrão: `C:\Program Files\PostgreSQL\16\data`
   - Clique em "Next"

6. **⚠️ IMPORTANTE - Definir Senha do Superusuário:**
   - Digite uma senha forte (ex: `postgres123`)
   - **ANOTE ESTA SENHA!** Você vai precisar dela
   - Confirme a senha
   - Clique em "Next"

7. **Porta:**
   - Mantenha a porta padrão: `5432`
   - Clique em "Next"

8. **Locale:**
   - Mantenha "Default locale"
   - Clique em "Next"

9. **Resumo:**
   - Revise as configurações
   - Clique em "Next"

10. **Instalação:**
    - Aguarde a instalação (pode levar alguns minutos)
    - Clique em "Finish"

---

### Opção 2: Via Winget (Linha de Comando)

```powershell
# Instalar via Windows Package Manager
winget install PostgreSQL.PostgreSQL

# Após instalação, adicionar ao PATH manualmente
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

---

## ✅ PASSO 2: VERIFICAR A INSTALAÇÃO

### 1. Adicionar PostgreSQL ao PATH (se necessário)

```powershell
# Abrir PowerShell como Administrador e executar:
[Environment]::SetEnvironmentVariable(
    "Path",
    "$env:Path;C:\Program Files\PostgreSQL\16\bin",
    [EnvironmentVariableTarget]::Machine
)

# Fechar e reabrir o terminal
```

### 2. Testar a Instalação

```powershell
# Verificar versão
psql --version

# Deve exibir algo como:
# psql (PostgreSQL) 16.x
```

---

## 🔧 PASSO 3: CONFIGURAR O POSTGRESQL

### 1. Acessar o PostgreSQL

```powershell
# Conectar como superusuário
psql -U postgres

# Será solicitada a senha que você definiu na instalação
```

### 2. Criar o Banco de Dados

```sql
-- Criar o banco de dados
CREATE DATABASE barberpro;

-- Verificar se foi criado
\l

-- Sair do psql
\q
```

---

## 📊 PASSO 4: CRIAR AS TABELAS

### Método 1: Via Linha de Comando (Recomendado)

```powershell
# Navegar até a pasta do projeto
cd C:\Users\pc\Documents\verdent-projects\Barberpro-saas

# Executar o script SQL
psql -U postgres -d barberpro -f backend\src\config\database.sql

# Digite a senha quando solicitado
```

### Método 2: Via pgAdmin (Interface Gráfica)

1. **Abrir pgAdmin 4**
   - Busque "pgAdmin" no menu iniciar
   - Abra o aplicativo

2. **Conectar ao Servidor**
   - Clique com o botão direito em "Servers"
   - "Register" > "Server"
   - Nome: "BarberPro Local"
   - Aba "Connection":
     - Host: `localhost`
     - Port: `5432`
     - Database: `postgres`
     - Username: `postgres`
     - Password: [sua senha]
   - Salvar

3. **Criar o Banco de Dados**
   - Expandir "Servers" > "BarberPro Local"
   - Botão direito em "Databases" > "Create" > "Database"
   - Database: `barberpro`
   - Salvar

4. **Executar o Script**
   - Expandir "Databases" > "barberpro"
   - Botão direito em "barberpro" > "Query Tool"
   - Abrir o arquivo `backend/src/config/database.sql`
   - Copiar todo o conteúdo
   - Colar na Query Tool
   - Clicar em "Execute" (F5)

---

## ✅ PASSO 5: VERIFICAR SE AS TABELAS FORAM CRIADAS

### Via Linha de Comando:

```powershell
# Conectar ao banco
psql -U postgres -d barberpro

# Listar todas as tabelas
\dt

# Deve exibir:
#  Schema |       Name         | Type  |  Owner   
# --------+--------------------+-------+----------
#  public | barbershops        | table | postgres
#  public | users              | table | postgres
#  public | barbers            | table | postgres
#  public | services           | table | postgres
#  public | clients            | table | postgres
#  public | appointments       | table | postgres
#  public | earnings           | table | postgres
#  public | expenses           | table | postgres
#  public | whatsapp_sessions  | table | postgres

# Ver estrutura de uma tabela
\d barbershops

# Sair
\q
```

### Via pgAdmin:

1. Expandir: "Databases" > "barberpro" > "Schemas" > "public" > "Tables"
2. Você deve ver todas as 9 tabelas criadas

---

## 🔐 PASSO 6: CONFIGURAR O ARQUIVO .ENV DO BACKEND

### 1. Criar o arquivo .env

```powershell
# Na pasta do projeto
cd backend

# Criar arquivo .env
New-Item -ItemType File -Path .env
```

### 2. Editar o arquivo .env

Abra o arquivo `backend/.env` e adicione:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:SUA_SENHA_AQUI@localhost:5432/barberpro
JWT_SECRET=chave_super_secreta_barberpro_2024_xyz
WHATSAPP_API_KEY=deixar_vazio_por_enquanto
WHATSAPP_API_URL=https://api.z-api.io/instances/SEU_ID
NODE_ENV=development
```

**⚠️ IMPORTANTE:** Substitua `SUA_SENHA_AQUI` pela senha que você definiu no PostgreSQL!

**Exemplo:**
```env
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/barberpro
```

---

## 🧪 PASSO 7: TESTAR A CONEXÃO

### 1. Testar conexão direta:

```powershell
# Conectar ao banco barberpro
psql -U postgres -d barberpro

# Se conectar com sucesso, está tudo OK!
# Digite \q para sair
```

### 2. Testar com a aplicação:

```powershell
# Navegar para pasta do backend
cd C:\Users\pc\Documents\verdent-projects\Barberpro-saas\backend

# Instalar dependências (se ainda não instalou)
npm install

# Tentar iniciar o servidor
npm run dev

# Deve exibir:
# 🚀 Servidor rodando na porta 5000
# ✅ Conectado ao banco de dados PostgreSQL
# ✅ Cron de lembretes iniciado
```

---

## 🛠️ TROUBLESHOOTING

### ❌ Erro: "psql não é reconhecido"

**Solução:** Adicionar ao PATH

```powershell
# PowerShell como Administrador
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"

# Tornar permanente
[Environment]::SetEnvironmentVariable(
    "Path",
    "$env:Path;C:\Program Files\PostgreSQL\16\bin",
    [EnvironmentVariableTarget]::Machine
)

# Fechar e reabrir o terminal
```

---

### ❌ Erro: "password authentication failed"

**Solução:** Senha incorreta

1. Verifique a senha no arquivo `.env`
2. Tente conectar manualmente: `psql -U postgres`
3. Se esqueceu a senha, reinstale o PostgreSQL

---

### ❌ Erro: "database barberpro does not exist"

**Solução:** Criar o banco

```powershell
# Conectar
psql -U postgres

# Criar banco
CREATE DATABASE barberpro;

# Sair
\q
```

---

### ❌ Erro: "could not connect to server"

**Solução:** PostgreSQL não está rodando

```powershell
# Verificar serviço
Get-Service -Name postgresql*

# Se não estiver rodando, iniciar
Start-Service -Name "postgresql-x64-16"

# Configurar para iniciar automaticamente
Set-Service -Name "postgresql-x64-16" -StartupType Automatic
```

---

### ❌ Erro: "relation barbershops does not exist"

**Solução:** Tabelas não foram criadas

```powershell
# Executar o script SQL
cd C:\Users\pc\Documents\verdent-projects\Barberpro-saas
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

---

## 📚 COMANDOS ÚTEIS DO POSTGRESQL

### Comandos do psql (dentro do terminal psql):

```sql
\l                          -- Listar bancos de dados
\c barberpro                -- Conectar a um banco
\dt                         -- Listar tabelas
\d nome_tabela              -- Descrever estrutura da tabela
\du                         -- Listar usuários
\q                          -- Sair
```

### Comandos SQL úteis:

```sql
-- Ver todos os bancos
SELECT datname FROM pg_database;

-- Ver todas as tabelas
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Contar registros em uma tabela
SELECT COUNT(*) FROM barbershops;

-- Ver dados de uma tabela
SELECT * FROM barbershops;

-- Deletar todos os dados de uma tabela
TRUNCATE TABLE appointments CASCADE;

-- Dropar o banco (CUIDADO!)
DROP DATABASE barberpro;
```

---

## ✅ CHECKLIST FINAL

Antes de prosseguir, verifique:

- [ ] PostgreSQL instalado e rodando
- [ ] Senha do postgres anotada
- [ ] Banco `barberpro` criado
- [ ] 9 tabelas criadas com sucesso
- [ ] Arquivo `.env` configurado com a senha correta
- [ ] Conexão testada com `psql -U postgres -d barberpro`
- [ ] Backend consegue conectar (`npm run dev`)

---

## 🎯 PRÓXIMO PASSO

Após configurar o PostgreSQL:

1. ✅ PostgreSQL instalado e configurado
2. ✅ Banco de dados criado
3. ✅ Tabelas criadas
4. ✅ Arquivo .env configurado
5. ➡️ **Instalar dependências do projeto**
6. ➡️ **Iniciar o backend**
7. ➡️ **Iniciar o frontend**

---

## 🆘 PRECISA DE AJUDA?

### Opções:

1. **Verificar logs de erro:** Copie a mensagem de erro completa
2. **Testar conexão manual:** `psql -U postgres -d barberpro`
3. **Verificar serviço:** `Get-Service postgresql*`
4. **Reinstalar:** Se nada funcionar, desinstale e reinstale

---

## 📱 FERRAMENTAS GRÁFICAS ALTERNATIVAS

Se preferir interface gráfica ao invés de linha de comando:

### 1. pgAdmin 4 (Já vem com PostgreSQL)
- Interface oficial
- Completa e poderosa
- Um pouco complexa

### 2. DBeaver (Recomendado para iniciantes)
- Download: https://dbeaver.io/download/
- Interface mais simples
- Suporta vários bancos de dados

### 3. TablePlus
- Download: https://tableplus.com/
- Interface moderna e bonita
- Versão gratuita limitada

---

**🎉 Com o PostgreSQL configurado, você está pronto para rodar o BarberPro SaaS!**
