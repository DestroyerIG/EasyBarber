# WhatsApp Bot

Guia técnico do módulo WhatsApp.

## Arquitetura

Implementação atual:

- Backend EasyBarber consome Evolution API v1 por HTTP.
- Evolution API roda como serviço externo.
- Frontend chama apenas endpoints internos do backend.

Fluxo:

```text
Frontend -> Backend EasyBarber -> Evolution API v1
```

## Pré-requisitos

- Backend rodando.
- Banco com migrations até `migration_v18_asaas_customer_id.sql`.
- Plano com feature `whatsapp_automation` liberada.
- Evolution API v1 acessível por URL pública.
- Webhook configurado para o backend.

## Variáveis

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=sua_chave
EVOLUTION_INSTANCE_NAME=easybarber
EVOLUTION_WEBHOOK_URL=https://sua-api.com/api/v1/whatsapp/webhook
EVOLUTION_API_TIMEOUT_MS=10000
WHATSAPP_WEBHOOK_BODY_LIMIT=6mb
WHATSAPP_SESSION_TIMEOUT_MS=1800000
WHATSAPP_INSTANCE_BARBERSHOP_MAP=
```

`WHATSAPP_INSTANCE_BARBERSHOP_MAP` aceita JSON ou `key=value`, mas é fallback legado. A fonte de verdade multi-tenant é `barbershops.whatsapp_instance_name`.

## Webhooks Evolution

Endpoints aceitos:

- `POST /api/v1/whatsapp/webhook`
- `POST /api/v1/whatsapp/webhook/:event`

Eventos recomendados:

- `MESSAGES_UPSERT`
- `CONNECTION_UPDATE`

Configurações recomendadas:

- `webhook_by_events=true`
- `webhook_base64=false`
- Não habilitar `MESSAGES_SET` em produção.

O backend ignora eventos pesados como `messages-set` antes do parser JSON para evitar payloads grandes.

## Fluxo de Conexão

1. Usuário acessa `/dashboard/whatsapp`.
2. Frontend chama `POST /whatsapp/connect` ou `POST /whatsapp/initialize`.
3. Frontend consulta `GET /whatsapp/status`.
4. Se necessário, consulta `GET /whatsapp/qrcode` ou `GET /whatsapp/qr`.
5. Usuário escaneia o QR Code no celular.

Status retornados podem incluir:

- `unavailable`
- `disconnected`
- `pairing`
- `connected`
- `error`

## Endpoints

Prefixo: `/api/v1/whatsapp`.

Públicos para webhook:

- `POST /webhook`
- `POST /webhook/:event`

Protegidos por auth, role tenant e feature `whatsapp_automation`:

- `GET /status`
- `POST /connect`
- `POST /initialize`
- `GET /qrcode`
- `GET /qr`
- `POST /disconnect`
- `POST /logout`
- `POST /restart`
- `POST /send`
- `POST /test-send`
- `POST /debug-send`
- `POST /simulator/message`
- `GET /config`
- `PUT /config`
- `POST /config/reset`
- `GET /config/menu`
- `POST /config/menu`
- `PUT /config/menu/:id`
- `DELETE /config/menu/:id`
- `PUT /config/menu-reorder`
- `POST /config/menu/reset`

## Configuração de Mensagens e Menu

O módulo permite:

- Mensagem de saudação.
- Mensagens automáticas por etapa.
- Menu dinâmico.
- Reordenação de opções.
- Reset para configuração padrão.

## Simulador

Endpoint:

- `POST /api/v1/whatsapp/simulator/message`

Uso esperado:

- Testar fluxos sem depender de mensagem real.
- Validar contexto da barbearia autenticada.
- Reproduzir respostas do bot no dashboard.

## Troubleshooting

- QR Code não aparece: valide `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e conectividade da Evolution.
- Webhook não processa: confirme URL pública, evento `MESSAGES_UPSERT` e logs do backend.
- Tenant incorreto: confira `barbershops.whatsapp_instance_name`.
- Payload 413: remova eventos pesados e aumente `WHATSAPP_WEBHOOK_BODY_LIMIT` apenas se necessário.
- Feature bloqueada: confira plano/status em PLANOS.md.
