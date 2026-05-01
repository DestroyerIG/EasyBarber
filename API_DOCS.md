# Documentação da API

Base URL canônica:

- `http://localhost:5000/api/v1`

Compatibilidade:

- Rotas `/api/*` sem `/v1` são redirecionadas para `/api/v1/*` com HTTP 301.

## Autenticação

O fluxo atual usa Supabase Auth obrigatoriamente para cadastro, confirmação de e-mail e login.

A sessão da API usa:

- `access_token` em cookie httpOnly.
- `refresh_token` em cookie httpOnly.
- `Authorization: Bearer <token>` aceito para compatibilidade em endpoints protegidos.

`AUTH_PROVIDER_MODE` é obsoleto.

## Formato de Resposta

Sucesso:

```json
{
  "success": true,
  "data": {}
}
```

Sucesso com paginação/meta:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

Erro:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos",
    "details": []
  }
}
```

## Status HTTP Comuns

- `200`: sucesso.
- `201`: criado.
- `400`: entrada inválida.
- `401`: não autenticado.
- `402`: assinatura/plano bloqueia a feature.
- `403`: sem permissão.
- `404`: recurso não encontrado.
- `409`: conflito.
- `429`: rate limit.
- `500`: erro interno.

## Endpoints Públicos

### `GET /`

Status simples da API.

### `GET /health`

Valida API e conexão com banco.

### `GET /debug/ip`

Retorna IP público visto pelo backend.

## Auth

Prefixo: `/auth`.

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/register` | Não | Inicia cadastro via Supabase Auth |
| POST | `/login` | Não | Login e criação de cookies |
| GET | `/verify-email` | Não | Compatibilidade para confirmação |
| POST | `/verify-email-session` | Não | Valida sessão/token de confirmação |
| POST | `/confirm` | Não | Confirma signup e sincroniza usuário local |
| POST | `/resend-verification` | Não | Reenvia verificação |
| POST | `/refresh` | Cookie | Renova access token |
| POST | `/logout` | Cookie | Limpa sessão |
| GET | `/me` | Sim | Usuário autenticado |

Rate limits específicos:

- Login: 20 tentativas por 15 minutos.
- Cadastro: 50 tentativas por 15 minutos.
- Reenvio: 10 tentativas por 15 minutos.

## Dashboard

Prefixo: `/dashboard`.

| Método | Rota | Feature |
| --- | --- | --- |
| GET | `/` | `dashboard` |

## Agendamentos

Prefixo: `/appointments`.

| Método | Rota | Feature |
| --- | --- | --- |
| GET | `/` | `appointments` |
| GET | `/available-slots` | `appointments` |
| POST | `/` | `appointments` |
| PUT | `/:id` | `appointments` |
| PUT | `/:id/status` | `appointments` |
| DELETE | `/:id` | `appointments` |

## Clientes

Prefixo: `/clients`.

| Método | Rota | Feature |
| --- | --- | --- |
| GET | `/` | `clients` |
| POST | `/` | `clients` |
| PUT | `/:id` | `clients` |
| GET | `/:id/history` | `clients` |

## Financeiro

Prefixo: `/finance`.

| Método | Rota | Feature |
| --- | --- | --- |
| GET | `/summary` | `finance` |
| GET | `/monthly` | `reports` |
| GET | `/expenses` | `finance` |
| POST | `/expenses` | `finance` |
| PUT | `/expenses/:id` | `finance` |
| DELETE | `/expenses/:id` | `finance` |

## Barbearia

Prefixo: `/barbershop`.

| Método | Rota | Feature/Role |
| --- | --- | --- |
| GET | `/services` | `services` |
| POST | `/services` | `services` |
| PUT | `/services/:id` | `services` |
| DELETE | `/services/:id` | `services` |
| GET | `/barbers` | `services` |
| POST | `/barbers` | `services` |
| PUT | `/barbers/:id` | `services` |
| DELETE | `/barbers/:id` | `services` |
| GET | `/settings` | `advanced_admin` |
| PUT | `/settings` | `advanced_admin` |
| GET | `/profile` | `billing` |
| PUT | `/profile` | `billing` |
| GET | `/account-profile` | `tenant_admin` |
| PUT | `/account-profile` | `tenant_admin` |
| PUT | `/account-password` | `tenant_admin` + `advanced_admin` |

## WhatsApp

Prefixo: `/whatsapp`.

Públicos:

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/webhook` | Webhook Evolution |
| POST | `/webhook/:event` | Webhook por evento |

Protegidos por auth, tenant role e `whatsapp_automation`:

| Método | Rota |
| --- | --- |
| GET | `/status` |
| POST | `/connect` |
| POST | `/initialize` |
| GET | `/qrcode` |
| GET | `/qr` |
| POST | `/disconnect` |
| POST | `/logout` |
| POST | `/restart` |
| POST | `/send` |
| POST | `/test-send` |
| POST | `/debug-send` |
| POST | `/simulator/message` |
| GET | `/config` |
| PUT | `/config` |
| POST | `/config/reset` |
| GET | `/config/menu` |
| POST | `/config/menu` |
| PUT | `/config/menu/:id` |
| DELETE | `/config/menu/:id` |
| PUT | `/config/menu-reorder` |
| POST | `/config/menu/reset` |

## Subscriptions

Prefixo legado/Stripe: `/subscriptions`.

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/checkout-session` | Sim | Cria checkout Stripe |
| GET | `/status` | Sim | Status da assinatura |
| POST | `/portal` | Sim | Portal Stripe |
| POST | `/webhook` | Não | Webhook Stripe |

## Billing

Prefixo atual: `/billing`.

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| POST | `/checkout/session` | Sim | Cria checkout conforme provider/método |
| GET | `/status` | Sim | Status de billing |
| POST | `/cancel` | Sim | Cancela assinatura |
| POST | `/reactivate` | Sim | Reativa assinatura |
| GET | `/pix/:paymentId` | Sim | Consulta Pix Asaas |
| POST | `/webhooks/stripe` | Não | Webhook Stripe |
| POST | `/webhook/stripe` | Não | Alias webhook Stripe |
| POST | `/webhooks/asaas` | Não | Webhook Asaas |
| POST | `/webhook/asaas` | Não | Alias webhook Asaas |

## Admin

Prefixo: `/admin`. Requer auth e role admin de plataforma.

| Método | Rota |
| --- | --- |
| GET | `/metrics` |
| GET | `/tenants` |
| GET | `/tenants/:id` |
| PATCH | `/tenants/:id/block` |
| PATCH | `/tenants/:id/unblock` |
| DELETE | `/tenants/:id` |
| PATCH | `/users/:id/block` |
| PATCH | `/users/:id/unblock` |
| GET | `/subscriptions` |
| POST | `/subscriptions/:id/resync` |
| GET | `/logs` |

## Debug

Prefixos: `/api/v1/debug` e `/debug`.

As rotas de debug exigem:

- `ENABLE_DEBUG_ROUTES=true`
- `DEBUG_TOKEN`
- Header `x-debug-token`

Rotas:

- `GET /asaas-auth`
- `GET /asaas/customer-test`
- `GET /asaas/pix-minimal`

## Autorização por Plano

O backend aplica feature gates conforme PLANOS.md. O frontend pode esconder ações, mas a autorização efetiva acontece no backend.
