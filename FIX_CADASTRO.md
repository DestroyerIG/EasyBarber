# Correção Rápida para Falha no Cadastro

Guia objetivo para quando o cadastro/login falha no ambiente local.

## Sintomas

- Tela de cadastro retorna erro genérico.
- Backend responde 500/401/400 sem concluir fluxo.
- Dashboard não abre após registrar conta.

## Checklist de Correção

1. Verificar backend/.env com DATABASE_URL e JWT_SECRET válidos.
2. Verificar frontend/.env.local com NEXT_PUBLIC_API_URL apontando para /api/v1.
3. Verificar se banco foi criado com UTF-8 e extensão pgcrypto.
4. Verificar se migration_v3..v9 foram aplicadas (não apenas database.sql).
5. Verificar variáveis SMTP_* e APP_URL para envio de verificação por e-mail.

## Comandos de Verificação

### Backend health

```bash
curl http://localhost:5000/health
```

### Teste de conexão DB

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT 1;"
```

### Verificar tabela crítica do módulo atual

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.whatsapp_menu_options');"
```

## Reaplicar Schema Completo (Banco Novo)

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v7.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v8.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v9.sql
```

## Pontos que Mais Quebram Cadastro

- DATABASE_URL com senha/host incorretos.
- JWT_SECRET ausente.
- API URL do frontend sem /api/v1.
- Banco criado sem migrations adicionais (v3..v9).
- SMTP_* não configuradas corretamente para envio de e-mail de verificação.

## Se Persistir

Siga TROUBLESHOOTING.md e anexe:

- log do backend no momento do erro
- comando executado
- resposta HTTP recebida
