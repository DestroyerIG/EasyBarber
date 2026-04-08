# PostgreSQL e Migrations SQL

Guia técnico para preparar, validar e manter o banco PostgreSQL do projeto, com foco em execução manual de migrations SQL.

## 1. Banco Utilizado

- SGBD: PostgreSQL
- Driver: pg (Node.js)
- Conexão no backend via DATABASE_URL
- Scripts SQL em backend/src/config

Arquivos SQL atuais:

- backend/src/config/database.sql
- backend/src/config/migration_v2.sql
- backend/src/config/migration_v3.sql
- backend/src/config/migration_v4.sql
- backend/src/config/migration_v5.sql
- backend/src/config/migration_v6.sql
- backend/src/config/migration_v7.sql
- backend/src/config/migration_v8.sql
- backend/src/config/migration_v9.sql
- backend/src/config/migration_v10.sql

## 2. Pré-requisitos

- PostgreSQL instalado e serviço ativo.
- Cliente psql disponível no PATH.
- Banco de destino conhecido.
- Backup antes de qualquer migração em ambiente com dados.

## 3. Conexão e Encoding

Este projeto usa strings com acentos e emojis em mensagens padrão de WhatsApp (principalmente em migration_v3.sql). Use UTF-8 no banco e no cliente.

Verificações:

```sql
SHOW server_encoding;
SHOW client_encoding;
```

Resultado esperado:

- server_encoding = UTF8
- client_encoding = UTF8

Se necessário, no psql:

```sql
\encoding UTF8
```

No PowerShell (para melhor exibição):

```powershell
chcp 65001
$env:PGCLIENTENCODING = "UTF8"
```

## 4. Criação de Banco (Do Zero)

### Linux/macOS

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### Windows PowerShell

```powershell
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

Observação:

- A extensão pgcrypto é necessária para gen_random_uuid().

## 5. Ordem de Migrations

### Cenário A: Banco novo (recomendado para dev local)

Executar nesta ordem:

1. database.sql
2. migration_v3.sql
3. migration_v4.sql
4. migration_v5.sql
5. migration_v6.sql
6. migration_v7.sql
7. migration_v8.sql
8. migration_v9.sql
9. migration_v10.sql

Justificativa:

- database.sql cria o schema base.
- migration_v3.sql adiciona colunas e tabela necessárias ao módulo WhatsApp atual.
- migration_v4..v8 consolidam índices e recursos de billing/admin/settings.
- migration_v9 adiciona colunas de verificação de e-mail de conta.
- migration_v10 adiciona vínculo de identidade Supabase e pendências de cadastro.

### Cenário B: Upgrade legado

Se o banco vier de versão antiga (pré-v3), executar:

1. migration_v2.sql
2. migration_v3.sql
3. migration_v4.sql
4. migration_v5.sql
5. migration_v6.sql
6. migration_v7.sql
7. migration_v8.sql
8. migration_v9.sql
9. migration_v10.sql

Importante:

- migration_v2.sql é de compatibilidade e pode não ser necessária em banco recém-criado.
- Sempre validar em staging antes de aplicar em produção.

## 6. Comandos Exatos de Execução Manual

### Linux/macOS (a partir da raiz do projeto)

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v7.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v8.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v9.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v10.sql
```

### Windows PowerShell (a partir da raiz do projeto)

```powershell
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v6.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v7.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v8.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v9.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v10.sql
```

### Com URL de conexão

```bash
psql "postgresql://postgres:senha@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
```

## 7. Execução com Docker Compose

No docker-compose.yml atual, o container db aplica automaticamente database.sql + migration_v3..v10 no primeiro bootstrap do volume.

Se o volume já existia antes dessa configuração, execute as migrations manualmente.

### Usando psql do host

```bash
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v7.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v8.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v9.sql
psql "postgresql://barberpro:changeme@localhost:5432/barberpro" -v ON_ERROR_STOP=1 -f backend/src/config/migration_v10.sql
```

### Sem psql local (pipe para container db)

Linux/macOS:

```bash
cat backend/src/config/migration_v3.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v4.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v5.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v6.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v7.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v8.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v9.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v10.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
```

Windows PowerShell:

```powershell
Get-Content .\backend\src\config\migration_v3.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v4.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v5.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v6.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v7.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v8.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v9.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
Get-Content .\backend\src\config\migration_v10.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
```

## 8. Como Validar se Migrou com Sucesso

### 8.1 Verificar tabelas essenciais

```sql
\dt
```

Tabela crítica adicionada por migration_v3:

- whatsapp_menu_options

### 8.2 Verificar colunas críticas

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'whatsapp_bot_config'
  AND column_name IN ('welcome_header', 'end_session_message', 'promotions_message');
```

### 8.3 Verificar role constraint final (migration_v6)

```sql
SELECT conname
FROM pg_constraint
WHERE conname = 'chk_users_role';
```

### 8.4 Verificar colunas de verificação de e-mail (migration_v9)

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'email_verified',
    'email_verification_token_hash',
    'email_verification_expires_at',
    'email_verified_at',
    'verification_sent_at'
  )
ORDER BY column_name;
```

### 8.5 Verificar total de tabelas

```sql
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
```

No estado atual do projeto, o schema final inclui 16 tabelas de domínio.

## 9. Recriar Banco do Zero

### Linux/macOS

```bash
dropdb -h localhost -p 5432 -U postgres --if-exists barberpro
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v7.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v8.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v9.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v10.sql
```

### Windows PowerShell

```powershell
dropdb -h localhost -p 5432 -U postgres --if-exists barberpro
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v6.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v7.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v8.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v9.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v10.sql
```

## 10. Backup Antes de Migrar (Recomendado)

```bash
pg_dump -h localhost -p 5432 -U postgres -d barberpro -Fc -f backup_barberpro_$(date +%F_%H%M).dump
```

Windows PowerShell:

```powershell
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
pg_dump -h localhost -p 5432 -U postgres -d barberpro -Fc -f "backup_barberpro_$stamp.dump"
```

## 11. Erros Comuns de Migration

### Erro de path (arquivo SQL não encontrado)

- Execute os comandos a partir da raiz do repositório.
- Confirme existência com:

```bash
ls backend/src/config/*.sql
```

### Erro de permissão

- Verifique acesso de leitura ao arquivo SQL.
- Em Linux/macOS:

```bash
chmod 644 backend/src/config/*.sql
```

### Erro de autenticação

- Revisar usuário/senha no psql e no DATABASE_URL.
- Testar conexão simples:

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT 1;"
```

### Erro de encoding

- Garantir UTF-8 no banco e no cliente.
- Repetir execução com PGCLIENTENCODING=UTF8.

### Erro gen_random_uuid() does not exist

- Rodar:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## 12. Referências Relacionadas

Após concluir o preparo do banco em ambiente local, execute no diretório backend:

```bash
npm run seed:test-users
```

As credenciais de desenvolvimento ficam centralizadas em README.md, na seção "Usuários de teste (ambiente local)".

- README.md
- INSTALL.md
- QUICK_START.md
- TROUBLESHOOTING.md
- DEPLOY.md
