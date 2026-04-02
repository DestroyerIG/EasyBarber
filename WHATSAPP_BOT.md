# 🤖 BOT WHATSAPP - EasyBarber

## Visão Geral

O bot de agendamento via WhatsApp usa **whatsapp-web.js** — uma conexão local direta via QR Code. Não é necessário conta em API externa (Z-API, Twilio, etc.).

Seus clientes podem agendar horários, cancelar, reagendar e avaliar atendimentos de forma totalmente automática pelo WhatsApp.

---

## 📱 COMO CONECTAR

1. Inicie o backend: `cd backend && npm run dev`
2. Faça login no sistema (http://localhost:3000)
3. Acesse a aba **WhatsApp** no dashboard
4. Um **QR Code** aparecerá na tela
5. No celular, abra WhatsApp → **Aparelhos conectados** → **Conectar aparelho**
6. Escaneie o QR Code
7. Pronto! Status mudará para **"Conectado"**

### Status da conexão

| Status | Descrição |
|---|---|
| `disconnected` | Não conectado |
| `connecting` | Inicializando |
| `qr` | QR Code pronto para escanear |
| `connected` | Conectado e funcionando |

### Gerenciar conexão

No painel WhatsApp do dashboard:
- **Reiniciar** — Reconecta se perdeu a conexão
- **Desconectar** — Encerra a conexão e o bot para de responder

---

## 💬 FLUXO DE AGENDAMENTO

### Etapa 1: Primeiro Contato

**Cliente envia:** qualquer mensagem ("oi", "olá", etc.)

**Bot responde:**
```
Olá 👋 Bem-vindo à [Nome da Barbearia]!

Escolha uma opção:
1️⃣ 💈 Agendar um horário
2️⃣ 📋 Ver nossos serviços
3️⃣ ❌ Cancelar agendamento
4️⃣ 🔄 Reagendamento
5️⃣ ⭐ Avaliação pós-atendimento
6️⃣ 🎉 Promoções
7️⃣ 📱 Instagram
8️⃣ 👨‍💼 Falar com um humano
9️⃣ 🚪 Encerrar atendimento
```

> Menu totalmente configurável — adicione, remova ou reordene opções pelo dashboard.

---

### Etapa 2: Agendar Horário (Opção 1)

**Bot:** Solicita nome do cliente (se primeiro contato)

**Bot:** Lista serviços disponíveis com preços:
```
💈 Escolha o serviço:

1️⃣ Corte Masculino - R$ 45,00
2️⃣ Corte + Barba - R$ 60,00
3️⃣ Barba - R$ 25,00
```

**Cliente:** Escolhe o serviço

**Bot:** Lista barbeiros disponíveis:
```
👨‍🦱 Escolha o barbeiro:

1️⃣ Roberto
2️⃣ Carlos
```

**Cliente:** Escolhe o barbeiro

**Bot:** Lista próximos 7 dias:
```
📅 Escolha a data:

1️⃣ seg 09/03
2️⃣ ter 10/03
3️⃣ qua 11/03
```

**Cliente:** Escolhe a data

**Bot:** Lista horários disponíveis:
```
⏰ Escolha o horário:

1️⃣ 09:00
2️⃣ 10:00
3️⃣ 14:00
4️⃣ 15:00
```

**Cliente:** Escolhe o horário

**Bot:**
```
✅ Seu horário foi agendado com sucesso! 💈

📋 Serviço: Corte + Barba
👨‍🦱 Barbeiro: Roberto
📅 Data: 10/03/2026
⏰ Horário: 15:00
💰 Valor: R$ 60,00

Até lá! 👋
```

---

### Etapa 2B: Ver Serviços (Opção 2)

**Bot:**
```
📋 Nossos serviços:

💈 Corte Masculino
💰 R$ 45,00 | ⏱️ 30 minutos

💈 Corte + Barba
💰 R$ 60,00 | ⏱️ 45 minutos

💈 Barba
💰 R$ 25,00 | ⏱️ 20 minutos
```

---

### Etapa 2C: Cancelar Agendamento (Opção 3)

Bot lista agendamentos futuros do cliente e permite cancelar.

---

### Etapa 2D: Reagendamento (Opção 4)

Bot lista agendamentos e guia pelo processo de escolher nova data/horário.

---

### Etapa 2E: Avaliação (Opção 5)

Bot pergunta avaliação do último atendimento e salva na tabela `whatsapp_ratings`.

---

### Etapa 2F: Promoções (Opção 6)

Responde com mensagem de promoções configurada no painel.

---

### Etapa 2G: Instagram (Opção 7)

Responde com link/mensagem do Instagram configurada no painel.

---

### Etapa 2H: Falar com Humano (Opção 8)

```
Um atendente entrará em contato em breve! 👨‍💼
```

---

### Etapa 2I: Encerrar (Opção 9)

```
Obrigado pelo contato! Volte sempre 👋
```

---

## ⏰ LEMBRETES AUTOMÁTICOS

O sistema envia lembretes automaticamente **2 horas antes** de cada agendamento.

**Mensagem padrão:**
```
⏰ Lembrete!

Olá {nome_cliente}!

Seu horário é daqui a 2 horas:
📋 {servico}
👨‍🦱 {barbeiro}
⏰ {horario}

Te esperamos! 💈
```

- O cron roda a **cada 10 minutos**
- Cada agendamento recebe apenas 1 lembrete (`reminder_sent = true`)
- A mensagem é configurável pelo painel (usa placeholders)

---

## ⚙️ PERSONALIZAÇÃO PELO PAINEL

### 21 Mensagens Configuráveis

No dashboard, aba WhatsApp → **Configuração de Mensagens**:

| Campo | Descrição |
|---|---|
| `welcome_header` | Mensagem de boas-vindas |
| `ask_name_message` | Pedido de nome |
| `attendant_message` | Redirecionamento para humano |
| `confirmation_message` | Confirmação de agendamento |
| `reminder_message` | Lembrete automático |
| `invalid_option_message` | Opção inválida |
| `session_expired_message` | Sessão expirada |
| `end_session_message` | Encerramento |
| `name_validation_message` | Nome inválido |
| `no_slots_message` | Sem horários disponíveis |
| `cancel_no_appointments_message` | Sem agendamentos para cancelar |
| `cancel_list_message` | Lista para cancelamento |
| `cancel_success_message` | Cancelamento confirmado |
| `reschedule_no_appointments_message` | Sem agendamentos para reagendar |
| `reschedule_list_message` | Lista para reagendamento |
| `no_previous_appointments_message` | Sem atendimentos anteriores |
| `rating_question_message` | Pergunta de avaliação |
| `rating_confirmation_message` | Confirmação da avaliação |
| `promotions_message` | Promoções |
| `instagram_message` | Instagram |

**Placeholders disponíveis:**
- `{nome_cliente}` — Nome do cliente
- `{servico}` — Nome do serviço
- `{barbeiro}` — Nome do barbeiro
- `{horario}` — Horário do agendamento
- `{nome_barbearia}` — Nome da barbearia

---

### Menu Customizável

No dashboard, aba WhatsApp → **Opções de Menu**:

- **Reordenar** — Arraste para mudar a ordem
- **Adicionar** — Crie opções customizadas (até 15 no total)
- **Editar** — Altere label, emoji e mensagem de resposta
- **Excluir** — Remova opções customizadas (opções do sistema não podem ser excluídas)
- **Resetar** — Restaure as 9 opções padrão

**Tipos de opções:**
- `system` — Opções nativas com lógica de fluxo (agendar, cancelar, etc.)
- `custom` — Opções que respondem com uma mensagem fixa

---

## 🧠 LÓGICA DO BOT

### Sessões

- Cada conversa cria uma sessão na tabela `whatsapp_sessions`
- A sessão armazena: telefone, etapa atual, dados parciais (serviço, barbeiro, data)
- Sessão expira após 30 minutos de inatividade
- Cliente retoma de onde parou se a sessão estiver ativa

### Validações

- ✅ Verifica se o horário ainda está disponível
- ✅ Impede agendamento duplicado (mesmo barbeiro, mesma data e hora)
- ✅ Valida opções numéricas
- ✅ Guarda contexto da conversa
- ✅ Filtra mensagens de grupo e broadcast

### Segurança

- ✅ Mensagens de grupo são ignoradas
- ✅ Broadcast é ignorado
- ✅ Dados parametrizados (anti SQL injection)

---

## 🖥️ SIMULADOR

O dashboard inclui um **Simulador de Chat** que permite testar o fluxo do bot sem precisar usar o WhatsApp real. Acesse na aba WhatsApp → **Simulador**.

---

## 🔗 ENDPOINTS DA API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/whatsapp/status` | Status da conexão |
| GET | `/api/whatsapp/qr` | QR Code para conectar |
| POST | `/api/whatsapp/logout` | Desconectar |
| POST | `/api/whatsapp/restart` | Reiniciar conexão |
| GET | `/api/whatsapp/config` | Configurações de mensagens |
| PUT | `/api/whatsapp/config` | Atualizar mensagens |
| POST | `/api/whatsapp/config/reset` | Resetar mensagens |
| GET | `/api/whatsapp/config/menu` | Opções do menu |
| POST | `/api/whatsapp/config/menu` | Criar opção |
| PUT | `/api/whatsapp/config/menu/:id` | Atualizar opção |
| DELETE | `/api/whatsapp/config/menu/:id` | Excluir opção |
| PUT | `/api/whatsapp/config/menu-reorder` | Reordenar |
| POST | `/api/whatsapp/config/menu/reset` | Resetar menu |

> Todas as rotas (exceto o webhook) requerem autenticação.

---

## 🔧 TROUBLESHOOTING

### QR Code não aparece
- Verifique se o backend está rodando
- Verifique os logs no terminal do backend
- Tente reiniciar a conexão pelo painel

### Bot não responde mensagens
- Verifique se o status é "connected"
- Confirme que o WhatsApp no celular está online
- Verifique os logs para erros

### Desconecta frequentemente
- O WhatsApp do celular precisa estar com internet
- Evite usar o mesmo número em múltiplos trabalhos-web.js
- Se desconectar, clique em "Reiniciar" no painel

### Erro de Puppeteer no server
```powershell
cd backend
Remove-Item -Recurse -Force node_modules
npm install
```

Se em Linux:
```bash
apt-get install -y chromium-browser
```
