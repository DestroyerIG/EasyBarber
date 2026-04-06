# Planos e Controle de Acesso

Documento técnico sobre regras de plano/assinatura implementadas no backend.

## 1. Planos Reconhecidos

- basico
- profissional
- premium

## 2. Matriz de Features por Plano

Configuração atual em backend/src/config/planPermissions.js:

- dashboard: basico
- appointments: basico
- clients: basico
- services: basico
- finance: basico
- reports: profissional
- exports: profissional
- whatsapp_automation: profissional
- advanced_admin: premium
- billing: basico
- subscription_status: basico

## 3. Comportamento por Status de Assinatura

Status reconhecidos:

- active
- trialing
- past_due
- incomplete
- canceled

Regras de acesso:

- active/trialing: segue somente regra de plano.
- past_due: acesso parcial (dashboard, appointments, clients, services, billing, subscription_status).
- incomplete/canceled: acesso reduzido (dashboard, billing, subscription_status).

## 4. Limites Diretos Implementados no Código

### Barbeiros ativos por plano

Regra em backend/src/services/barberService.js:

- basico: 1
- profissional: 5
- premium: 999 (equivalente prático a ilimitado)

## 5. Billing e Preços

O backend não fixa valores monetários em código.

A cobrança usa price IDs do Stripe:

- STRIPE_PRICE_ID_BASICO
- STRIPE_PRICE_ID_PROFISSIONAL
- STRIPE_PRICE_ID_PREMIUM

Ou seja, preço e moeda são controlados no Stripe Dashboard.

Regra de trial:

- Todos os planos podem ter 7 dias grátis.
- O trial de 7 dias é concedido somente na primeira assinatura da barbearia.
- Se a barbearia já tiver histórico de assinatura Stripe, novos checkouts são criados sem trial.

## 6. Endpoints Relacionados

- POST /api/v1/subscriptions/checkout-session
- GET /api/v1/subscriptions/status
- POST /api/v1/subscriptions/portal
- POST /api/v1/subscriptions/webhook

## 7. Regras Admin

Rotas /api/v1/admin exigem role platform_admin.

Funcionalidade advanced_admin está mapeada para premium no planPermissions, mas o controle de acesso do módulo admin atualmente usa guard de role (platform_admin) e não o requireFeature.

## 8. Observações de Produto

Este documento descreve comportamento técnico do código atual.

Se houver tabela comercial pública com preços e benefícios de marketing, ela deve ser mantida separada do contrato técnico para evitar divergência.
