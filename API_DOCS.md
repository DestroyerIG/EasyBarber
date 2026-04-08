# Documentação da API

Base URL canônica:

- http://localhost:5000/api/v1

Compatibilidade:

- Rotas /api/* são redirecionadas para /api/v1/* com HTTP 301.

## 1. Autenticação e Sessão

A API usa:

- access_token em cookie httpOnly (curta duração).
- refresh_token em cookie httpOnly (renovação).

Também aceita Authorization: Bearer <token> para compatibilidade.

## 2. Formato de Respostas

### Sucesso

```json
{
  "success": true,
  "data": {}
}
```

### Sucesso com meta

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

### Erro

```json
{
  "success": false,
  "message": "Dados inválidos",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos",
    "details": ["campo: erro"]
  }
}
```

## 3. Códigos de Status Comuns

- 200: sucesso
- 201: criado
- 400: validação/entrada inválida
- 401: não autenticado
- 402: assinatura bloqueada para feature
- 403: sem permissão
- 404: recurso não encontrado
- 409: conflito
- 429: rate limit
- 500: erro interno

## 4. Endpoints Públicos

### GET /

Retorna status simples da API.

### GET /health

Retorna status da API e conexão com banco.

## 5. Endpoints de Auth

Prefixo: /auth

### POST /auth/register

Body:

```json
{
  "barbershopName": "Barbearia X",
  "ownerName": "Responsável",
  "email": "owner@barbearia.com",
  "whatsapp": "11999999999",
  "password": "SenhaComMaiuscula1",
  "desiredPlan": "profissional"
}
```

`desiredPlan` é opcional e aceita: `basico`, `profissional`, `premium`.
No primeiro cadastro, o plano efetivo da conta permanece `basico` até a conclusão do checkout.

Comportamento:

- `AUTH_PROVIDER_MODE=legacy`: cria conta interna imediatamente e envia verificação por token legado.
- `AUTH_PROVIDER_MODE=dual` (padrão) e `supabase`: inicia cadastro primeiro no Supabase Auth (signUp) e cria pendência interna.
- Em `dual/supabase`, usuário interno definitivo só é criado/sincronizado após confirmação de e-mail.
- Este endpoint não autentica mais automaticamente (não retorna token/refreshToken).

Exemplo de resposta (201):

```json
{
  "success": true,
  "data": {
    "verificationRequired": true,
    "verificationEmailSent": true,
    "message": "Cadastro realizado com sucesso. Verifique seu e-mail para ativar a conta.",
    "user": {
      "email": "owner@barbearia.com",
      "role": "tenant_admin",
      "barbershopName": "Barbearia X",
      "plan": "basico",
      "emailVerified": false
    },
    "barbershop": {
      "id": "uuid",
      "name": "Barbearia X",
      "plan": "basico",
      "desiredPlan": "profissional"
    }
  }
}
```

Validações principais:

- password >= 8 caracteres
- ao menos 1 maiúscula
- ao menos 1 número

### POST /auth/login

Body:

```json
{
  "email": "owner@barbearia.com",
  "password": "SenhaComMaiuscula1"
}
```

Se o e-mail não estiver verificado e a senha estiver correta, retorna:

- status: `403`
- code: `EMAIL_NOT_VERIFIED`

Observação:

- Nesta fase, o login continua interno (`bcrypt + JWT próprio`).
- O Supabase não é usado como provedor de login.

### GET /auth/verify-email

Aceita dois formatos de confirmação:

1. Legado:

```text
/auth/verify-email?token=...
```

2. Supabase callback:

```text
/auth/verify-email?token_hash=...&type=email
```

No fluxo Supabase, o endpoint valida `token_hash` no Supabase Auth, obtém o e-mail e sincroniza o banco interno:

- `users.email_verified_at`
- `users.supabase_user_id`
- `users.auth_provider = 'supabase'`

Quando necessário, também cria o usuário interno definitivo a partir da pendência de cadastro.

Erros comuns:

- `INVALID_VERIFICATION_TOKEN`
- `EXPIRED_VERIFICATION_TOKEN`

### POST /auth/resend-verification

Body:

```json
{
  "email": "owner@barbearia.com"
}
```

Retorna sempre resposta genérica para evitar enumeração de contas.

### POST /auth/refresh

Renova sessão com refresh_token cookie.

### POST /auth/logout

Revoga refresh token e limpa cookies.

### GET /auth/me (auth)

Retorna dados do usuário logado.

## 6. Endpoints Tenant

Todos abaixo exigem autenticação e role tenant_admin/employee.

### 6.1 Dashboard

Prefixo: /dashboard

- GET /dashboard
  - Feature: dashboard

### 6.2 Agendamentos

Prefixo: /appointments

- GET /appointments
  - Feature: appointments
- GET /appointments/available-slots
  - Feature: appointments
- POST /appointments
  - Feature: appointments
- PUT /appointments/:id
  - Feature: appointments
- PUT /appointments/:id/status
  - Feature: appointments
- DELETE /appointments/:id
  - Feature: appointments

Body create/update:

```json
{
  "clientId": "uuid",
  "barberId": "uuid",
  "serviceId": "uuid",
  "date": "2026-04-10",
  "time": "15:00"
}
```

Body status:

```json
{
  "status": "confirmado"
}
```

Status permitidos:

- confirmado
- concluido
- cancelado

### 6.3 Clientes

Prefixo: /clients

- GET /clients
  - Feature: clients
- POST /clients
  - Feature: clients
- PUT /clients/:id
  - Feature: clients
- GET /clients/:id/history
  - Feature: clients

Body create:

```json
{
  "name": "Cliente",
  "phone": "11999999999",
  "email": "cliente@email.com",
  "birthDate": "1992-07-15",
  "address": "Rua A, 100",
  "notes": "Observação"
}
```

### 6.4 Financeiro

Prefixo: /finance

- GET /finance/summary
  - Feature: finance
- GET /finance/monthly
  - Feature: reports
- POST /finance/expenses
  - Feature: finance
- PUT /finance/expenses/:id
  - Feature: finance
- DELETE /finance/expenses/:id
  - Feature: finance
- GET /finance/expenses
  - Feature: finance

Body expense:

```json
{
  "description": "Insumos",
  "category": "operacional",
  "amount": 120.50,
  "date": "2026-04-01"
}
```

### 6.5 Serviços e Barbeiros

Prefixo: /barbershop

Serviços:

- GET /barbershop/services
  - Feature: services
- POST /barbershop/services
  - Feature: services
- PUT /barbershop/services/:id
  - Feature: services
- DELETE /barbershop/services/:id
  - Feature: services

Barbeiros:

- GET /barbershop/barbers
  - Feature: services
- POST /barbershop/barbers
  - Feature: services
- PUT /barbershop/barbers/:id
  - Feature: services
- DELETE /barbershop/barbers/:id
  - Feature: services

Body service:

```json
{
  "name": "Corte + Barba",
  "price": 65.00,
  "duration_minutes": 45
}
```

Body barber:

```json
{
  "name": "Barbeiro",
  "photo": "https://url-da-foto"
}
```

### 6.6 WhatsApp

Prefixo: /whatsapp

Webhook local (sem auth):

- POST /whatsapp/webhook

Rotas protegidas (Feature: whatsapp_automation):

- GET /whatsapp/status
- POST /whatsapp/connect
- GET /whatsapp/qrcode
- POST /whatsapp/disconnect
- POST /whatsapp/send
- GET /whatsapp/config
- PUT /whatsapp/config
- POST /whatsapp/config/reset
- GET /whatsapp/config/menu
- POST /whatsapp/config/menu
- PUT /whatsapp/config/menu/:id
- DELETE /whatsapp/config/menu/:id
- PUT /whatsapp/config/menu-reorder
- POST /whatsapp/config/menu/reset

Compatibilidade legada (temporária):

- GET /whatsapp/qr (alias de /whatsapp/qrcode)
- POST /whatsapp/logout (alias de /whatsapp/disconnect)
- POST /whatsapp/restart (alias de /whatsapp/connect)

Estados de status esperados:

- unavailable
- disconnected
- pairing
- connected
- error

Body exemplo para menu custom:

```json
{
  "label": "Horário de funcionamento",
  "emoji": "🕐",
  "response_message": "Seg a Sab, 09h às 20h"
}
```

Body para reorder:

```json
{
  "order": ["uuid1", "uuid2", "uuid3"]
}
```

### 6.7 Assinaturas

Prefixo: /subscriptions

- POST /subscriptions/checkout-session
  - Feature: billing
- GET /subscriptions/status
  - Feature: subscription_status
- POST /subscriptions/portal
  - Feature: billing

Webhook Stripe (sem auth):

- POST /subscriptions/webhook

Body checkout:

```json
{
  "plan": "profissional"
}
```

Planos aceitos:

- basico
- profissional
- premium

Regra de trial (7 dias grátis):

- O trial de 7 dias é aplicado somente na primeira assinatura da barbearia.
- Em trocas de plano ou novas contratações após já existir histórico de assinatura Stripe para a barbearia, o checkout é criado sem trial.

## 7. Endpoints Admin

Prefixo: /admin

Guardas:

- auth obrigatório
- role obrigatório: platform_admin

Rotas:

- GET /admin/metrics
- GET /admin/tenants
- GET /admin/tenants/:id
- PATCH /admin/tenants/:id/block
- PATCH /admin/tenants/:id/unblock
- DELETE /admin/tenants/:id
- PATCH /admin/users/:id/block
- PATCH /admin/users/:id/unblock
- GET /admin/subscriptions
- POST /admin/subscriptions/:id/resync
- GET /admin/logs

Para ações sensíveis (block/unblock/delete/resync), body exige confirmação:

```json
{
  "confirmation": "CONFIRM",
  "reason": "Motivo opcional"
}
```

## 8. Feature Gate por Plano/Status

Feature gate aplicado via middleware subscriptionGuard.

Resumo das features no estado atual:

- basico: dashboard, appointments, clients, services, finance, billing, subscription_status
- profissional+: reports, exports, whatsapp_automation
- premium: advanced_admin

Status de assinatura também impacta acesso:

- active/trialing: acesso normal
- past_due: acesso parcial
- incomplete/canceled: acesso muito restrito

Observação:

- O status trialing ocorre quando a primeira assinatura da barbearia está em período de teste.

## 9. Exemplos Rápidos com curl

### Health

```bash
curl http://localhost:5000/health
```

### Register

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "barbershopName":"Barbearia Dev",
    "ownerName":"Admin Dev",
    "email":"dev@example.com",
    "whatsapp":"11999999999",
    "password":"SenhaForte1",
    "desiredPlan":"premium"
  }'
```

### Login

```bash
curl -i -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"SenhaForte1"}'
```

Observação:

- Use -i para inspecionar cookies setados no response header.

## 10. Observações Importantes

- A API é versionada em /api/v1.
- O backend registra requestId no header X-Request-Id.
- O endpoint de webhook Stripe usa body raw (não JSON parser padrão).
