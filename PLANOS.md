# Planos e Controle de Acesso

Documento técnico sobre regras de plano, assinatura e feature gate implementadas no backend.

## Planos Reconhecidos

- `basico`
- `profissional`
- `premium`

## Features por Plano

Fonte: `backend/src/config/planPermissions.js`.

| Feature | Plano mínimo |
| --- | --- |
| `dashboard` | basico |
| `appointments` | basico |
| `clients` | basico |
| `services` | basico |
| `finance` | basico |
| `reports` | profissional |
| `exports` | profissional |
| `whatsapp_automation` | profissional |
| `advanced_admin` | basico |
| `billing` | basico |
| `subscription_status` | basico |

## Status de Assinatura

Status reconhecidos no gate:

- `active`
- `trialing`
- `pending`
- `past_due`
- `unpaid`
- `incomplete`
- `canceled`

Regras:

- `active` e `trialing`: acesso conforme plano.
- `pending`, `past_due`, `unpaid`, `incomplete` e `canceled`: acesso restrito a `billing` e `subscription_status`.

## Limites de Barbeiros

Fonte: `backend/src/services/barberService.js`.

- `basico`: 1 barbeiro ativo.
- `profissional`: 5 barbeiros ativos.
- `premium`: 999 barbeiros ativos, tratado como ilimitado na prática.

## Billing

O backend não fixa valores monetários em código. Preço e moeda ficam nos provedores.

### Stripe

Usado para cartão/assinatura recorrente e portal de cliente.

Variáveis:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_BASICO`
- `STRIPE_PRICE_ID_PROFISSIONAL`
- `STRIPE_PRICE_ID_PREMIUM`
- `STRIPE_PRICE_ID_BASICO_ONE_TIME`
- `STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME`
- `STRIPE_PRICE_ID_PREMIUM_ONE_TIME`

### Asaas

Usado para Pix com QR Code e webhook de confirmação.

Variáveis:

- `ASAAS_API_KEY`
- `ASAAS_BASE_URL`
- `ASAAS_WEBHOOK_TOKEN`
- `ASAAS_BILLING_DESCRIPTION`
- `ASAAS_TIMEOUT_MS`

## Trial

O fluxo Stripe suporta trial de 7 dias apenas na primeira assinatura recorrente da barbearia. Pix via Asaas inicia como `pending` e só libera acesso após confirmação do pagamento pelo webhook.

## Onde o Gate é Aplicado

- Backend: `backend/src/middleware/subscriptionGuard.js`.
- Frontend: hooks e componentes em `frontend/src/hooks/useSubscriptionAccess.ts` e `frontend/src/components/billing/FeatureGate.tsx`.

O frontend melhora a experiência, mas a regra final de autorização é sempre do backend.
