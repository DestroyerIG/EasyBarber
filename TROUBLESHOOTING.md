# Troubleshooting

Guia de diagnóstico para erros comuns em desenvolvimento e operação.

## Diagnóstico Inicial

```bash
curl http://localhost:5000/health
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT 1;"
node -v
npm -v
```

## Backend Não Inicia

Sintomas:

- Processo encerra no boot.
- Log fatal de variável ausente.
- Falha de conexão com banco.

Checklist:

- `DATABASE_URL` existe e conecta.
- `JWT_SECRET` existe.
- PostgreSQL está ativo.
- Se `ASAAS_BASE_URL` está definido, `ASAAS_API_KEY` também precisa estar.
- Se qualquer variável Stripe está configurada, as obrigatórias precisam estar completas.

## PostgreSQL

### Conexão recusada

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT current_database();"
```

Verifique serviço, host, porta, usuário e senha.

### Schema incompleto

Valide tabelas críticas:

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.auth_signup_pending');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.billing_events');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT to_regclass('public.whatsapp_menu_options');"
psql -h localhost -p 5432 -U postgres -d barberpro -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'barbershop_settings' AND column_name = 'dias_abertos';"
```

Se alguma retornar vazio, aplique migrations até `migration_v19_business_days_and_intervals.sql`.

### Docker

O compose atual aplica automaticamente até v15 no primeiro volume. Aplique v16-v19 manualmente:

```bash
cat backend/src/config/migration_v16_supabase_only_auth.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v17_subscription_access_gate.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v18_asaas_customer_id.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
cat backend/src/config/migration_v19_business_days_and_intervals.sql | docker compose exec -T db psql -U barberpro -d barberpro -v ON_ERROR_STOP=1
```

## Cadastro, Confirmação e Login

O fluxo atual usa Supabase Auth obrigatoriamente.

Checklist:

- `SUPABASE_URL` correto.
- `SUPABASE_ANON_KEY` correto.
- `SUPABASE_SERVICE_ROLE_KEY` configurado no backend.
- `AUTH_SUPABASE_REDIRECT_TO` igual ao redirect permitido no Supabase.
- Frontend com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `NEXT_PUBLIC_API_URL` termina em `/api/v1`.

`AUTH_PROVIDER_MODE` é obsoleto e não deve ser usado para tentar voltar ao fluxo legado.

## Cookies e CORS

Sintomas:

- Login funciona, mas `/auth/me` retorna 401.
- Frontend não mantém sessão.

Checklist:

- `FRONTEND_URL` igual à origem pública do frontend.
- HTTPS em produção.
- `AUTH_COOKIE_DOMAIN` correto quando usar subdomínios.
- Cliente HTTP enviando credenciais.

## Billing

### Stripe

Verifique:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Price IDs recorrentes.
- Endpoint `/api/v1/billing/webhooks/stripe` ou compatíveis.

### Asaas Pix

Verifique:

- `ASAAS_API_KEY`
- `ASAAS_BASE_URL`
- `ASAAS_WEBHOOK_TOKEN`
- Endpoint `/api/v1/billing/webhooks/asaas`.
- CPF/CNPJ válido no checkout.

Rotas de debug existem sob `/api/v1/debug`, mas só respondem quando `ENABLE_DEBUG_ROUTES=true` e `x-debug-token` corresponde a `DEBUG_TOKEN`.

## WhatsApp

Checklist:

- `EVOLUTION_API_URL` acessível pelo backend.
- `EVOLUTION_API_KEY` correta.
- Webhook da Evolution aponta para `/api/v1/whatsapp/webhook`.
- Eventos recomendados: `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
- `MESSAGES_SET` desabilitado.
- `barbershops.whatsapp_instance_name` configurado para o tenant.
- Plano/status permite `whatsapp_automation`.

## Lembretes não enviados

Checklist:

- Processo do backend acordado quando o cron deveria rodar (hospedagem que hiberna precisa de keep-alive, ex.: UptimeRobot).
- `BUSINESS_TIMEZONE` correto (servidor em UTC; sem o fuso o alvo do lembrete sai errado).
- Agendamento com status `confirmado` e `reminderSent=false`.
- Janela: o cron busca agendamentos ~2h à frente, a cada 10 minutos.
- WhatsApp conectado e envio funcionando para o tenant.

## Rate Limit

Limites principais:

- API geral: 300 requisições por 15 minutos.
- Login: 20 tentativas por 15 minutos.
- Cadastro: 50 tentativas por 15 minutos.
- Reenvio de verificação: 10 tentativas por 15 minutos.

## Testes

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm run build
```

`npm run lint` existe no frontend, mas depende do suporte do Next/ESLint instalado na versão atual.
