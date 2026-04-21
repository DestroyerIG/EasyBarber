# WhatsApp Bot

Guia técnico do módulo de WhatsApp do projeto.

## 1. Tecnologia

Implementação atual:

- Backend EasyBarber consumindo Evolution API v1 por HTTP.
- Evolution API hospedada como serviço externo (ex.: Render).
- Frontend acessando apenas endpoints internos do backend EasyBarber.

Arquitetura obrigatória:

Frontend -> Backend EasyBarber -> Evolution API v1 (externa)

## 2. Pré-requisitos

- Backend rodando.
- Banco com migration_v3.sql aplicada.
- Evolution API v1 rodando em URL pública.
- Variáveis da Evolution configuradas no backend/.env.

Exemplo:

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://sua-evolution.onrender.com
EVOLUTION_API_KEY=sua_chave
EVOLUTION_INSTANCE_NAME=easybarber
EVOLUTION_WEBHOOK_URL=https://sua-api.com/api/v1/whatsapp/webhook
EVOLUTION_API_TIMEOUT_MS=10000
EVOLUTION_WEBHOOK_EVENTS=MESSAGES_UPSERT,CONNECTION_UPDATE
WHATSAPP_SESSION_TIMEOUT_MS=1800000
```

Recomendacao de eventos (producao):

- Ativar somente `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
- Manter `webhook_by_events=true`.
- Manter `webhook_base64=false`.
- Nao habilitar `MESSAGES_SET` (evento pesado, desnecessario para o fluxo principal do bot e causa 413 em payloads grandes).

## 3. Fluxo de Conexão

1. Inicie backend EasyBarber.
2. Abra dashboard e acesse módulo WhatsApp.
3. Chame conexão via endpoint interno /whatsapp/connect.
4. Consulte /whatsapp/status.
5. Se status for pairing, consulte /whatsapp/qrcode e escaneie no celular.

Status possíveis retornados pela API:

- unavailable
- disconnected
- pairing
- connected
- error

## 4. Endpoints

Prefixo: /api/v1/whatsapp

Público:

- POST /webhook (simulador local + webhook da Evolution)

Protegidos (auth + tenant role + feature whatsapp_automation):

- GET /status
- POST /connect
- GET /qrcode
- POST /disconnect
- POST /send
- GET /config
- PUT /config
- POST /config/reset
- GET /config/menu
- POST /config/menu
- PUT /config/menu/:id
- DELETE /config/menu/:id
- PUT /config/menu-reorder
- POST /config/menu/reset

Compatibilidade legada temporária:

- GET /qr (alias)
- POST /logout (alias)
- POST /restart (alias)

## 5. Configuração de Mensagens

A tabela whatsapp_bot_config armazena mensagens customizáveis.

Campos principais usados no fluxo:

- welcome_header
- ask_name_message
- confirmation_message
- reminder_message
- invalid_option_message
- end_session_message
- promotions_message
- instagram_message

Sem migration_v3.sql, parte desses campos pode não existir e o módulo falha.

## 6. Menu Dinâmico

Tabela: whatsapp_menu_options

- Opções do sistema (type=system).
- Opções customizadas (type=custom).
- Máximo total: 15 opções.
- Reordenação por endpoint menu-reorder.

## 7. Sessão Conversacional

Tabela: whatsapp_sessions

- Guarda etapa atual e contexto da conversa.
- Timeout padrão: 30 minutos (WHATSAPP_SESSION_TIMEOUT_MS).

## 8. Lembretes Automáticos

Agendador em cronService:

- roda a cada 10 minutos.
- busca atendimentos para ~2h à frente.
- envia mensagem de lembrete e marca reminder_sent=true.

## 9. Restrição por Plano

As rotas protegidas de WhatsApp usam feature gate whatsapp_automation.

Na configuração atual:

- Plano básico: sem acesso à automação de WhatsApp.
- Plano profissional/premium: acesso liberado.

## 10. Troubleshooting Rápido

### Status unavailable

- Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY.
- Verifique se a Evolution API está online.

### QR não aparece (pairing)

- Verifique EVOLUTION_INSTANCE_NAME.
- Consulte GET /qrcode diretamente.
- Verifique logs do backend e do serviço Evolution.

### Erro ao salvar configuração

- Provável schema incompleto (migration_v3 ausente).

### Bot desconecta

- Reconecte via endpoint /connect.
- Refaça pareamento QR.

### Mensagens não enviadas

- Verifique status connected.
- Teste envio via endpoint /send.
- Verifique indisponibilidade da Evolution API.

### Webhook ambiguo, @lid, grupos e auto-destino

- O backend bloqueia resposta automaticamente quando o webhook nao identifica um telefone confiavel do cliente.
- Eventos com identificadores bloqueados (@lid, @g.us, @broadcast, @newsletter) sao ignorados por seguranca.
- Se o destino extraido coincidir com o numero da instancia conectada, o fluxo retorna self_target e nao envia mensagem.
- Em payload ambiguo, o fluxo retorna ambiguous_phone e apenas registra logs para diagnostico.

### Erro 413 em webhook

- Causa mais comum: Evolution enviando eventos pesados como `MESSAGES_SET`.
- Ajuste a instancia para enviar apenas `MESSAGES_UPSERT` e `CONNECTION_UPDATE`.
- Verifique se `webhook_by_events=true` e `webhook_base64=false`.

## 11. Segurança Operacional

- Controle acesso ao painel de WhatsApp por role e assinatura.
- Não exponha EVOLUTION_API_KEY.
- Evite apontar múltiplos backends para a mesma instância sem coordenação.
- Priorize webhooks com JID direto do cliente; quando o payload vier ambiguo, a resposta deve permanecer bloqueada.
