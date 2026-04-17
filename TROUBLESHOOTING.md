# Troubleshooting

Guia de diagnóstico para erros comuns em desenvolvimento e operação.

## 1. Diagnóstico Inicial

Verificações rápidas:

```bash
curl http://localhost:5000/health
```

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT 1;"
```

```bash
node -v && npm -v
```

## 2. Erros de Banco PostgreSQL

## 2.1 Erro de conexão com PostgreSQL

Sintoma:

- ECONNREFUSED
- timeout ao conectar

Checklist:

- Serviço PostgreSQL está ativo.
- Host/porta no DATABASE_URL estão corretos.
- Firewall/liberação de rede (ambiente remoto).

Comando de teste:

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT current_database();"
```

## 2.2 Erro de autenticação no banco

Sintoma:

- password authentication failed

Ações:

- Revisar usuário/senha no DATABASE_URL.
- Testar conexão psql com os mesmos dados.
- Em docker, validar usuário/senha do serviço db no compose.

## 2.3 Backend inicia e cai por falta de conexão

No estado atual do código, o backend valida conexão no bootstrap e encerra processo em falha de banco.

Ações:

- Corrigir DATABASE_URL.
- Testar conexão manual com psql.
- Verificar saúde do banco antes de subir backend.

## 3. Erros de SQL / Migrations

## 3.1 Arquivo SQL não encontrado

Sintoma:

- No such file
- could not open file

Ações:

- Execute comandos a partir da raiz do repositório.
- Validar caminhos:

```bash
ls backend/src/config/*.sql
```

No Windows PowerShell:

```powershell
Get-ChildItem .\backend\src\config\*.sql
```

## 3.2 Migration falhando

Ações gerais:

1. Ativar parada imediata:

```bash
psql ... -v ON_ERROR_STOP=1 -f <arquivo.sql>
```

2. Validar banco alvo antes de executar:

```sql
SELECT current_database(), current_user;
```

3. Fazer backup antes de produção.

4. Executar na ordem documentada em POSTGRESQL_SETUP.md.

## 3.3 Erro gen_random_uuid() does not exist

Causa:

- Extensão pgcrypto ausente.

Solução:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## 3.4 Erro de encoding

Sintoma:

- invalid byte sequence
- erro ao aplicar textos com acentos/emojis

Ações:

```sql
SHOW server_encoding;
SHOW client_encoding;
```

- Garantir UTF8 para ambos.
- No psql: \encoding UTF8
- No PowerShell: chcp 65001 e PGCLIENTENCODING=UTF8

## 4. Portas e Ambiente

## 4.1 Porta em uso

Sintoma:

- EADDRINUSE: address already in use :::5000
- conflito na 3000/5432

Ações:

Linux/macOS:

```bash
lsof -i :5000
lsof -i :3000
lsof -i :5432
```

Windows PowerShell:

```powershell
netstat -ano | findstr :5000
netstat -ano | findstr :3000
netstat -ano | findstr :5432
```

Finalize o processo conflitante ou altere a porta via env.

## 4.2 Variáveis de ambiente ausentes

Backend exige obrigatoriamente:

- JWT_SECRET
- DATABASE_URL

Se ausentes, o processo encerra no startup.

Valide backend/.env e reinicie o serviço.

## 4.3 Frontend sem conexão com API

Checklist:

- NEXT_PUBLIC_API_URL aponta para /api/v1.
- Backend está disponível na URL configurada.
- FRONTEND_URL no backend está correto para CORS.

## 4.4 Falhas de verificação por e-mail

Sintomas:

- Cadastro concluído, mas e-mail de verificação não chega.
- Login retorna `EMAIL_NOT_VERIFIED` mesmo com senha correta.

Checklist:

- migration_v9.sql e migration_v10.sql aplicadas no banco.
- AUTH_PROVIDER_MODE configurado corretamente (`dual`, `supabase` ou `legacy`).
- SUPABASE_URL e SUPABASE_ANON_KEY configuradas para `dual/supabase`.
- AUTH_SUPABASE_REDIRECT_TO apontando para `/auth/confirm` no frontend público.
- NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY configuradas no frontend.
- NEXT_PUBLIC_APP_URL configurada com a URL pública do frontend.
- SUPABASE_SERVICE_ROLE_KEY configurada para executar scripts administrativos (`seed:auth-admin` e `seed:system-users`).
- Variáveis SMTP_* configuradas somente quando usar fallback legado (`AUTH_PROVIDER_MODE=legacy`).
- APP_URL/FRONTEND_URL apontando para a URL pública correta do frontend.
- Caixa de spam/lixo eletrônico verificada.

Validação SQL rápida:

```sql
SELECT email, email_verified, email_verification_expires_at, verification_sent_at
FROM users
ORDER BY created_at DESC
LIMIT 10;
```

## 4.5 Login retornando 401 no modo híbrido

Sintomas:

- Login falha com `Email ou senha incorretos` para usuario que deveria autenticar via Supabase.

Checklist:

- Conferir `users.auth_provider` (`legacy` usa bcrypt local, `supabase` usa Supabase Auth).
- Para contas `supabase`, validar se a senha foi realmente atualizada no Supabase Auth.
- Verificar divergencia entre `users.supabase_user_id` e o `user.id` retornado no Supabase.
- Confirmar que `users.blocked = false` e `users.email_verified = true`.
- Em caso de usuarios estrategicos (admin/teste), reexecutar:

```bash
cd backend
npm run seed:system-users
```

Validacao SQL rapida:

```sql
SELECT email, auth_provider, supabase_user_id, email_verified, blocked
FROM users
WHERE LOWER(email) IN ('contato@easyconnectcg.com.br', 'teste@easybarber.com');
```

## 5. WhatsApp

## 5.1 Status unavailable

Sintoma:

- /api/v1/whatsapp/status retorna unavailable.
- UI mostra API indisponivel.

Checklist:

- EVOLUTION_API_URL e EVOLUTION_API_KEY configuradas no backend/.env.
- Serviço Evolution API online e acessível pela rede do backend.
- WHATSAPP_PROVIDER=evolution.

## 5.2 Status pairing sem QR Code

Sintoma:

- /api/v1/whatsapp/status retorna pairing, mas sem qrCode.

Ações:

- Chamar GET /api/v1/whatsapp/qrcode.
- Verificar se a instância existe e foi criada com nome de EVOLUTION_INSTANCE_NAME.
- Verificar se a Evolution API está retornando payload de QR no endpoint da versão em uso.

## 5.3 Webhook não processa mensagens

Checklist:

- EVOLUTION_WEBHOOK_URL aponta para https://<backend>/api/v1/whatsapp/webhook.
- Endpoint público acessível externamente.
- Evento de mensagens habilitado na Evolution.

## 5.4 Endpoints de WhatsApp retornando erro de schema

Causa comum:

- database.sql executado sem migration_v3.sql.

Solução:

- Aplicar migration_v3.sql e validar tabela whatsapp_menu_options.

## 6. Inconsistências entre documentação e scripts

As inconsistências operacionais principais foram corrigidas no estado atual do repositório.

Checklist atual:

1. backend/.env.example está alinhado com DB_CONNECT_TIMEOUT.
2. docker-compose.yml usa FRONTEND_URL no backend.
3. docker-compose.yml usa NEXT_PUBLIC_API_URL com /api/v1 no frontend.
4. setup.ps1 aplica database.sql + migration_v3..v11.
5. fix-env.ps1 não adiciona variáveis legadas WHATSAPP_API_*.

Como proceder:

- Seguir os guias README.md, INSTALL.md e POSTGRESQL_SETUP.md.
- Em Docker, lembrar que scripts de init só rodam no primeiro bootstrap do volume; para volume antigo, aplicar migrations manualmente.

## 7. Fluxo de Recuperação Rápida

Quando o ambiente está inconsistente:

1. Backup (se houver dados).
2. Recriar banco do zero.
3. Aplicar database.sql + migration_v3..v11.
4. Revisar backend/.env e frontend/.env.local.
5. Subir backend e validar /health.
6. Subir frontend.

## 8. Quando Escalar para Investigação

Escalar quando houver:

- Falha recorrente após reset completo do banco.
- Inconsistência entre estado do Stripe e estado local de assinatura.
- Erro intermitente de rede/infra fora do host local.
- Corrupção de dados após migração.

Nesses casos, anexar:

- Comando executado.
- Saída completa de erro.
- Hash do commit.
- Ambiente (Linux/macOS/Windows, Docker ou não).
