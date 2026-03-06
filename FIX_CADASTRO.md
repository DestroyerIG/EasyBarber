# 🔧 CORREÇÃO RÁPIDA - Erro ao Processar Solicitação

## 🚨 O QUE ESTÁ ACONTECENDO

Na tela você vê:
```
Erro ao processar solicitação
```

E o botão fica em **"Processando..."** infinitamente.

**CAUSA:** O backend não consegue conectar ao banco de dados.

---

## ✅ SOLUÇÃO RÁPIDA

Execute o script de correção:
```powershell
.\fix-env.ps1
```

Ele corrige automaticamente o arquivo `backend\.env` com a porta e senha corretas.

---

## ✅ SOLUÇÃO MANUAL

### 1. Abra o arquivo `backend\.env`

### 2. Verifique a linha `DATABASE_URL`:

**ERRADO (porta 5433):**
```
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5433/barberpro
```

**CORRETO (porta 5432):**
```
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/barberpro
```

### 3. Verifique se a senha está correta

A senha deve ser a mesma que você definiu na instalação do PostgreSQL.

### 4. Salve o arquivo

### 5. Reinicie o backend

Se estiver usando `npm run dev` com nodemon, ele reinicia automaticamente.

Caso contrário:
```powershell
# Parar (Ctrl+C)
cd backend
npm run dev
```

### 6. Aguarde aparecer:
```
Servidor rodando na porta 5000
Conexão com banco de dados verificada
```

---

## 🧪 TESTAR

1. Acesse http://localhost:3000
2. Cadastre uma barbearia
3. Senha deve ter: mínimo 8 caracteres, 1 maiúscula, 1 número

---

## ❓ AINDA COM ERRO?

Verifique se o PostgreSQL está rodando:
```powershell
Get-Service postgresql*
```

Verifique se o banco existe:
```powershell
psql -U postgres -c "\l" | findstr barberpro
```

Se não existir:
```powershell
psql -U postgres -c "CREATE DATABASE barberpro;"
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

> Guia completo: `TROUBLESHOOTING.md`
