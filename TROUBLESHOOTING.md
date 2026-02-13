# 🔧 TROUBLESHOOTING - Problemas Comuns e Soluções

## 🚨 PROBLEMA: Não consigo cadastrar barbearia

### ✅ SOLUÇÃO RÁPIDA

**Execute o script de correção:**
```powershell
.\fix-env.ps1
```

Este script vai corrigir automaticamente o arquivo `.env` com a porta correta do PostgreSQL.

---

### 🔍 DIAGNÓSTICO COMPLETO

#### 1. Verificar se Backend está rodando

```powershell
# Ver processos Node
Get-Process -Name node

# Ver se porta 5000 está em uso
netstat -ano | findstr ":5000"
```

**Se não estiver rodando:**
```powershell
cd backend
npm run dev
```

---

#### 2. Verificar se PostgreSQL está rodando

```powershell
# Ver serviço PostgreSQL
Get-Service postgresql*

# Se não estiver rodando, iniciar:
Start-Service postgresql-x64-18
```

---

#### 3. Verificar porta do PostgreSQL

```powershell
# Ver se PostgreSQL está na porta 5432
netstat -ano | findstr ":5432"
```

**Deve exibir:**
```
TCP    0.0.0.0:5432    0.0.0.0:0    LISTENING    [PID]
```

---

### ⚠️ ERRO COMUM: ECONNREFUSED

**Sintoma:**
```
Error: connect ECONNREFUSED ::1:5433
```

**Causa:** O arquivo `backend\.env` está com a porta **5433** ao invés de **5432**

**Solução 1 - Automática:**
```powershell
.\fix-env.ps1
```

**Solução 2 - Manual:**
1. Abra: `backend\.env`
2. Encontre a linha:
   ```
   DATABASE_URL=postgresql://postgres:SENHA@localhost:5433/barberpro
   ```
3. Mude para:
   ```
   DATABASE_URL=postgresql://postgres:SENHA@localhost:5432/barberpro
   ```
4. Salve o arquivo
5. O backend vai reiniciar automaticamente

---

### ⚠️ ERRO: password authentication failed

**Sintoma:**
```
password authentication failed for user "postgres"
```

**Causa:** Senha incorreta no arquivo `.env`

**Solução:**
1. Execute: `.\fix-env.ps1`
2. Digite a senha correta do PostgreSQL
3. O script vai reconfigurar automaticamente

---

### ⚠️ ERRO: database "barberpro" does not exist

**Sintoma:**
```
database "barberpro" does not exist
```

**Causa:** Banco de dados não foi criado

**Solução:**
```powershell
# Conectar no PostgreSQL
psql -U postgres

# Criar banco
CREATE DATABASE barberpro;

# Sair
\q

# Executar migrations
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

---

### ⚠️ ERRO: relation "barbershops" does not exist

**Sintoma:**
```
relation "barbershops" does not exist
```

**Causa:** Tabelas não foram criadas

**Solução:**
```powershell
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

---

## 🌐 PROBLEMA: Frontend não conecta com Backend

### Verificar configuração do Frontend

1. Verifique se existe: `frontend\.env.local`
2. Conteúdo deve ser:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:5000/api
   ```

**Se não existir:**
```powershell
echo "NEXT_PUBLIC_API_URL=http://localhost:5000/api" > frontend\.env.local
```

3. Reinicie o frontend:
   ```powershell
   # Parar (Ctrl+C)
   # Iniciar novamente
   cd frontend
   npm run dev
   ```

---

## 📱 PROBLEMA: Erro de CORS

**Sintoma:**
```
Access to XMLHttpRequest has been blocked by CORS policy
```

**Solução:**

1. Verifique o arquivo `backend\src\server.js`
2. Certifique-se que tem:
   ```javascript
   app.use(cors());
   ```

3. Se o problema persistir, configure CORS específico:
   ```javascript
   app.use(cors({
     origin: 'http://localhost:3000',
     credentials: true
   }));
   ```

---

## 🔑 PROBLEMA: Token inválido ou expirado

**Sintoma:**
```
401 Unauthorized
Token inválido
```

**Solução:**
1. Limpe o localStorage do navegador:
   - F12 > Console
   - Digite: `localStorage.clear()`
   - Pressione Enter
2. Faça login novamente

---

## 🐌 PROBLEMA: Backend muito lento

**Possíveis causas:**

1. **Muitas consultas ao banco:**
   - Verifique se as tabelas têm índices
   - Otimize as queries

2. **Conexões não fechadas:**
   - Verifique se está usando `pool.query()` corretamente

3. **Muitos logs no console:**
   - Remova `console.log()` excessivos

---

## 🔄 PROBLEMA: Nodemon não reinicia automaticamente

**Solução:**
```powershell
# Parar o backend (Ctrl+C)
cd backend
npx nodemon src/server.js
```

Ou edite `backend\package.json`:
```json
"scripts": {
  "dev": "nodemon src/server.js --watch src"
}
```

---

## 📊 VERIFICAÇÃO COMPLETA DO SISTEMA

Execute estes comandos para verificar tudo:

```powershell
# 1. PostgreSQL rodando?
Get-Service postgresql*

# 2. Porta 5432 ativa?
netstat -ano | findstr ":5432"

# 3. Backend rodando?
netstat -ano | findstr ":5000"

# 4. Frontend rodando?
netstat -ano | findstr ":3000"

# 5. Banco existe?
psql -U postgres -c "\l" | findstr barberpro

# 6. Tabelas existem?
psql -U postgres -d barberpro -c "\dt"

# 7. Testar API
curl http://localhost:5000 -UseBasicParsing
```

---

## 🆘 RESET COMPLETO (Última Opção)

Se nada funcionar, reset completo:

```powershell
# 1. Parar tudo (Ctrl+C em todos os terminais)

# 2. Dropar e recriar banco
psql -U postgres -c "DROP DATABASE IF EXISTS barberpro;"
psql -U postgres -c "CREATE DATABASE barberpro;"
psql -U postgres -d barberpro -f backend\src\config\database.sql

# 3. Reconfigurar .env
.\fix-env.ps1

# 4. Limpar node_modules (opcional)
Remove-Item backend\node_modules -Recurse -Force
Remove-Item frontend\node_modules -Recurse -Force

# 5. Reinstalar dependências
cd backend
npm install
cd ..\frontend
npm install

# 6. Iniciar tudo novamente
# Terminal 1:
cd backend
npm run dev

# Terminal 2:
cd frontend
npm run dev
```

---

## 📞 LOGS ÚTEIS

### Ver logs do Backend
O backend já mostra logs no terminal onde foi iniciado.

### Ver logs do Frontend
O frontend mostra logs no terminal e no console do navegador (F12).

### Ver logs do PostgreSQL
```powershell
# Windows Event Viewer
eventvwr.msc
# Aplicações e Serviços > PostgreSQL
```

---

## ✅ CHECKLIST DE FUNCIONAMENTO

Antes de cadastrar barbearia, verifique:

- [ ] PostgreSQL rodando (porta 5432)
- [ ] Backend rodando (porta 5000)
- [ ] Frontend rodando (porta 3000)
- [ ] Banco `barberpro` criado
- [ ] Tabelas criadas (9 tabelas)
- [ ] Arquivo `backend\.env` com porta 5432
- [ ] Arquivo `frontend\.env.local` existe
- [ ] API respondendo em http://localhost:5000

---

## 🎯 TESTE RÁPIDO

```powershell
# Testar se tudo está OK
curl http://localhost:5000 -UseBasicParsing

# Deve retornar:
# {"message":"💈 BarberPro SaaS API","version":"1.0.0","status":"online"}
```

Se retornar isso, está tudo funcionando! ✅

---

**🔧 Execute `.\fix-env.ps1` para corrigir automaticamente!**
