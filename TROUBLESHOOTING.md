# 🔧 TROUBLESHOOTING - Problemas Comuns e Soluções

## 🔍 Diagnóstico Rápido

Antes de mais nada, verifique:

```powershell
# 1. Backend rodando?
Invoke-RestMethod -Uri "http://localhost:5000/health"

# 2. PostgreSQL rodando?
Get-Service postgresql*

# 3. Frontend rodando?
# Acesse http://localhost:3000 no navegador
```

---

## 🚨 ERRO: "Erro ao processar solicitação" no cadastro

### Causa
O backend não consegue conectar ao banco de dados.

### Solução Rápida
```powershell
.\fix-env.ps1
```

### Solução Manual
1. Abra `backend\.env`
2. Verifique se `DATABASE_URL` está correto:
   ```
   DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/barberpro
   ```
3. Corrija a porta (**5432**, não 5433)
4. Corrija a senha do PostgreSQL
5. Reinicie o backend (`Ctrl+C` → `npm run dev`)

---

## 🚨 ERRO: `ECONNREFUSED 127.0.0.1:5432`

### Causa
PostgreSQL não está rodando.

### Solução
```powershell
# Verificar status
Get-Service postgresql*

# Iniciar (ajuste a versão se necessário)
Start-Service "postgresql-x64-16"
```

Se o serviço não existir, reinstale o PostgreSQL: `POSTGRESQL_SETUP.md`

---

## 🚨 ERRO: `password authentication failed`

### Causa
Senha incorreta no `DATABASE_URL`.

### Solução
1. Execute `.\fix-env.ps1` e digite a senha correta
2. Ou edite manualmente `backend\.env`:
   ```
   DATABASE_URL=postgresql://postgres:SENHA_CORRETA@localhost:5432/barberpro
   ```

### Resetar senha do PostgreSQL
Se esqueceu a senha:
1. Abra `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
2. Altere `scram-sha-256` para `trust` na linha do `localhost`
3. Reinicie o PostgreSQL
4. Conecte sem senha: `psql -U postgres`
5. Mude a senha: `ALTER USER postgres PASSWORD 'nova_senha';`
6. Reverta o `pg_hba.conf` para `scram-sha-256`
7. Reinicie novamente

---

## 🚨 ERRO: `database "barberpro" does not exist`

### Solução
```powershell
psql -U postgres -c "CREATE DATABASE barberpro;"
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

---

## 🚨 ERRO: `relation "barbershops" does not exist`

### Causa
Tabelas não foram criadas.

### Solução
```powershell
psql -U postgres -d barberpro -f backend\src\config\database.sql
```

Para aplicar migrations:
```powershell
psql -U postgres -d barberpro -f backend\src\config\migration_v2.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v3.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v4.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v5.sql
psql -U postgres -d barberpro -f backend\src\config\migration_v6.sql
```

---

## 🚨 ERRO: `psql não é reconhecido`

### Solução
Adicione ao PATH:
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```

Para permanente (requer admin):
```powershell
[Environment]::SetEnvironmentVariable(
    "Path",
    "$env:Path;C:\Program Files\PostgreSQL\16\bin",
    [EnvironmentVariableTarget]::Machine
)
```
Feche e reabra o terminal.

---

## 🚨 ERRO: Script `setup.ps1` não executa

### Solução
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 🌐 Frontend não conecta com Backend

### Verificar
1. Backend está rodando na porta 5000?
2. Arquivo `frontend\.env.local` existe com:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
   ```
3. Reiniciou o frontend após criar/alterar o `.env.local`?

### Criar se não existir
```powershell
"NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1" | Out-File -FilePath frontend\.env.local -Encoding UTF8
```

---

## 🌐 ERRO: CORS

### Sintoma
```
Access to XMLHttpRequest has been blocked by CORS policy
```

### Solução
Verifique no `backend\.env`:
```env
FRONTEND_URL=http://localhost:3000
```

O servidor usa `FRONTEND_URL` para configurar CORS. Se não estiver definido, o padrão é `http://localhost:3000`.

Em produção, configure para a URL real do frontend.

---

## 🔑 Token inválido ou expirado

### Causa
O access token expira após um tempo. O sistema tenta renovar automaticamente via refresh token.

### Solução
1. Faça logout e login novamente
2. Se persistir, limpe os cookies do navegador
3. Verifique se `JWT_SECRET` no `.env` não mudou

---

## 📱 WhatsApp não conecta

### QR Code não aparece
1. Verifique se o backend está rodando
2. Acesse a aba WhatsApp no dashboard
3. Aguarde o QR Code aparecer (pode levar alguns segundos)

### QR Code aparece mas não conecta
1. Escaneie rapidamente (o QR expira)
2. Use o WhatsApp principal do celular (não WhatsApp Business secundário)
3. Vá em WhatsApp > Aparelhos conectados > Conectar aparelho

### Desconectou inesperadamente
1. No dashboard, aba WhatsApp, clique em "Reiniciar"
2. Ou reinicie o backend completo

### Erro com Puppeteer/Chrome
O `whatsapp-web.js` precisa do Chromium. Se der erro:
```powershell
# No Windows, geralmente funciona automaticamente
# Se houver problemas, reinstale as dependências:
cd backend
Remove-Item -Recurse -Force node_modules
npm install
```

---

## 💾 Backup e restauração do banco

### Backup
```powershell
pg_dump -U postgres -d barberpro > backup.sql
```

### Restaurar
```powershell
psql -U postgres -c "DROP DATABASE IF EXISTS barberpro;"
psql -U postgres -c "CREATE DATABASE barberpro;"
psql -U postgres -d barberpro < backup.sql
```

---

## 🐳 Problemas com Docker

### Containers não sobem
```powershell
docker compose logs
```

### Banco não aceita conexão
O container `db` precisa estar healthy antes do backend iniciar. Verifique:
```powershell
docker compose ps
```

### Resetar tudo
```powershell
docker compose down -v    # Remove volumes (dados do banco)
docker compose up -d      # Recria tudo
```

---

## ⚡ Performance

### Backend lento
1. Verifique se as migrations de índices foram aplicadas:
   ```powershell
   psql -U postgres -d barberpro -f backend\src\config\migration_v4.sql
   psql -U postgres -d barberpro -f backend\src\config\migration_v5.sql
   psql -U postgres -d barberpro -f backend\src\config\migration_v6.sql
   ```
2. Ajuste o pool no `.env`:
   ```env
   DB_POOL_MIN=2
   DB_POOL_MAX=20
   ```

### Frontend lento em dev
Normal — Next.js em modo desenvolvimento compila as páginas sob demanda. Em produção (`npm run build && npm start`) é muito mais rápido.

---

## 📞 Ainda com problemas?

1. Leia `POSTGRESQL_SETUP.md` para problemas com banco
2. Leia `API_DOCS.md` para testar endpoints
3. Verifique os logs do backend no terminal
4. Use `http://localhost:5000/health` para verificar conexão com o banco
