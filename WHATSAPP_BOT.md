# WhatsApp Bot

Guia técnico do módulo de WhatsApp do projeto.

## 1. Tecnologia

Implementação atual:

- whatsapp-web.js
- QR code local
- Sessão persistida em backend/whatsapp-auth

Não depende de API externa de WhatsApp.

## 2. Pré-requisitos

- Backend rodando.
- Banco com migration_v3.sql aplicada.
- Variável WHATSAPP_ENABLED=true no backend/.env.

Exemplo:

```env
WHATSAPP_ENABLED=true
WHATSAPP_SESSION_TIMEOUT_MS=1800000
```

## 3. Fluxo de Conexão

1. Inicie backend.
2. Abra dashboard.
3. Vá para módulo WhatsApp.
4. Consulte status e QR code.
5. Escaneie QR no celular.

Status possíveis retornados pela API:

- disconnected
- connecting
- qr
- connected

## 4. Endpoints

Prefixo: /api/v1/whatsapp

Público:

- POST /webhook (simulador/local)

Protegidos (auth + tenant role + feature whatsapp_automation):

- GET /status
- GET /qr
- POST /logout
- POST /restart
- GET /config
- PUT /config
- POST /config/reset
- GET /config/menu
- POST /config/menu
- PUT /config/menu/:id
- DELETE /config/menu/:id
- PUT /config/menu-reorder
- POST /config/menu/reset

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

### QR não aparece

- Verifique WHATSAPP_ENABLED=true.
- Verifique logs do backend.
- Verifique se migration_v3 foi aplicada.

### Erro ao salvar configuração

- Provável schema incompleto (migration_v3 ausente).

### Bot desconecta

- Reinicie via endpoint /restart.
- Refaça pareamento QR.

### Mensagens não enviadas

- Verifique status connected.
- Verifique conectividade do celular pareado.

## 11. Segurança Operacional

- Não exponha backend/whatsapp-auth em repositório público.
- Controle acesso ao painel de WhatsApp por role e assinatura.
- Evite habilitar bot em múltiplas instâncias com mesma sessão sem estratégia de coordenação.
