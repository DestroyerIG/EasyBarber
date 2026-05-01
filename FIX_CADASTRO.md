# Correção Rápida para Falha no Cadastro

Checklist objetivo para quando cadastro, confirmação de e-mail ou login falham no ambiente local.

## Sintomas

- Cadastro retorna erro genérico.
- Link de confirmação abre, mas a conta não é ativada.
- Login retorna 401 após cadastro.
- Dashboard não abre depois da autenticação.

## Checklist

1. Confirme que o backend inicia sem erro:

```bash
curl http://localhost:5000/health
```

2. Revise `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:senha@localhost:5432/barberpro
JWT_SECRET=uma_chave_forte_com_32_ou_mais_caracteres
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm
```

3. Revise `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
BACKEND_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

4. No Supabase, confira:

- Email confirmation habilitado conforme o ambiente.
- Redirect URL `http://localhost:3000/auth/confirm` cadastrada.
- Chaves anon/service role corretas.

5. Confirme schema completo:

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.auth_signup_pending');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.billing_events');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.whatsapp_menu_options');"
```

## Pontos que Mais Quebram

- `DATABASE_URL` incorreto.
- `JWT_SECRET` ausente.
- Frontend sem `/api/v1` em `NEXT_PUBLIC_API_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` ausente em scripts administrativos.
- Redirect do Supabase divergente de `AUTH_SUPABASE_REDIRECT_TO`.
- Banco criado só com `database.sql`, sem migrations até v19.
- Cookies bloqueados por domínio/CORS em produção.

## Se Persistir

Siga TROUBLESHOOTING.md e anexe:

- Log do backend no momento do erro.
- Payload ou rota chamada.
- Status HTTP e resposta recebida.
- Confirmação de que as migrations chegaram até `migration_v19_business_days_and_intervals.sql`.
