# WhatsApp Bot

Guia técnico do módulo WhatsApp.

## Arquitetura

Implementação atual:

- Backend EasyBarber consome Evolution API v2 por HTTP.
- Evolution API roda como serviço externo.
- Frontend chama apenas endpoints internos do backend.

Fluxo:

```text
Frontend -> Backend EasyBarber -> Evolution API v2
```

## Pré-requisitos

- Backend rodando.
- Banco com migrations até `migration_v19_business_days_and_intervals.sql`.
- Plano com feature `whatsapp_automation` liberada.
- Evolution API v2 acessível por URL pública.
- Webhook configurado para o backend.

## Variáveis

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=sua_chave
EVOLUTION_INSTANCE_NAME=easybarber
BACKEND_WEBHOOK_BASE_URL=https://sua-api.com/api/v1/whatsapp/webhook
EVOLUTION_WEBHOOK_URL=
EVOLUTION_API_TIMEOUT_MS=10000
WHATSAPP_WEBHOOK_BODY_LIMIT=6mb
WHATSAPP_SESSION_TIMEOUT_MS=1800000
WHATSAPP_INSTANCE_BARBERSHOP_MAP=
```

`BACKEND_WEBHOOK_BASE_URL` é o nome preferido para a URL pública do webhook. `EVOLUTION_WEBHOOK_URL` é mantido como alias legado e só é usado como fallback quando o novo nome está vazio. Sem barra final.

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

## Configuração Operacional

O bot usa as preferências salvas em `/barbershop/settings` para gerar horários:

- `diasAbertos`: array com ids dos dias abertos (`seg`, `ter`, `qua`, `qui`, `sex`, `sab`, `dom`). O padrão é segunda a sexta.
- `openingTime` e `closingTime`: janela diária de atendimento.
- `slotIntervalMinutes`: intervalo entre horários. O valor `0` significa sem intervalo e gera horários contínuos pela duração do serviço.
- `allowWalkins`: quando ativo, o bot informa que encaixes são aceitos ao não encontrar slots.

Se a data escolhida cair em um dia fechado, o bot responde: `Hoje não estamos atendendo. Escolha outro dia.`

## Lembretes Automáticos

Um cron in-process (`src/services/cronService.ts`) envia lembretes de agendamento via WhatsApp:

- Executa a cada 10 minutos (`*/10 * * * *`).
- Busca agendamentos com status `confirmado`, `reminderSent=false`, que começam ~2h à frente.
- Usa o template `reminderMessage` do `whatsappBotConfig` da barbearia ou um padrão.
- Marca `reminderSent=true` após envio bem-sucedido.

Agendamentos gravam `date`/`time` no relógio local da barbearia (BR), não UTC. Como o servidor (Render) roda em UTC, o alvo é calculado no fuso de negócio:

```env
BUSINESS_TIMEZONE=America/Sao_Paulo
```

Fallback de fuso: `APP_TIMEZONE`, depois `America/Sao_Paulo`. Em hospedagem que hiberna (ex.: Render free), mantenha o processo acordado (ex.: UptimeRobot) para o cron disparar.

O mesmo serviço roda um segundo cron (`15 * * * *`) que marca assinaturas one-time vencidas como inadimplentes.

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
