# FLUXO DO BOT WHATSAPP - BarberPro SaaS

## Visão Geral

O bot de agendamento via WhatsApp permite que seus clientes agendam horários de forma totalmente automática, sem precisar ligar ou falar com um atendente.

---

## FLUXO COMPLETO DO AGENDAMENTO

### Etapa 1: Primeiro Contato

**Cliente envia:** "oi", "olá", "bom dia", ou qualquer mensagem

**Bot responde:**
```
Olá 👋 Bem-vindo à [Nome da Barbearia]

Escolha uma opção:
1️⃣ Agendar horário
2️⃣ Ver serviços
3️⃣ Falar com atendente
```

---

### Etapa 2A: Cliente Escolhe "1" (Agendar)

**Cliente envia:** `1`

**Bot responde:**
```
💈 Escolha o serviço:

1️⃣ Corte Masculino - R$ 45,00
2️⃣ Corte + Barba - R$ 60,00
3️⃣ Barba - R$ 25,00
4️⃣ Sobrancelha - R$ 15,00
5️⃣ Combo Completo - R$ 80,00
```

**Cliente envia:** `2` (exemplo: escolheu Corte + Barba)

---

### Etapa 3: Escolha do Barbeiro

**Bot responde:**
```
👨‍🦱 Escolha o barbeiro:

1️⃣ Roberto
2️⃣ Carlos
3️⃣ Fernando
```

**Cliente envia:** `1` (escolheu Roberto)

---

### Etapa 4: Escolha da Data

**Bot responde:**
```
📅 Escolha a data:

1️⃣ ter 13/02
2️⃣ qua 14/02
3️⃣ qui 15/02
4️⃣ sex 16/02
5️⃣ sáb 17/02
6️⃣ seg 19/02
7️⃣ ter 20/02
```

**Cliente envia:** `3` (escolheu quinta-feira 15/02)

---

### Etapa 5: Escolha do Horário

**Bot responde:**
```
⏰ Escolha o horário:

1️⃣ 09:00
2️⃣ 10:00
3️⃣ 11:00
4️⃣ 14:00
5️⃣ 15:00
6️⃣ 16:00
7️⃣ 17:00
8️⃣ 18:00
```

**Cliente envia:** `5` (escolheu 15:00)

---

### Etapa 6: Confirmação

**Bot responde:**
```
✅ Seu horário foi agendado com sucesso! 💈

📋 Serviço: Corte + Barba
👨‍🦱 Barbeiro: Roberto
📅 Data: 15/02/2024
⏰ Horário: 15:00
💰 Valor: R$ 60,00

Até lá! 👋
```

---

## FLUXO ALTERNATIVO: Ver Serviços

### Etapa 2B: Cliente Escolhe "2" (Ver Serviços)

**Cliente envia:** `2`

**Bot responde:**
```
📋 Nossos serviços:

💈 Corte Masculino
💰 R$ 45,00
⏱️ 30 minutos

💈 Corte + Barba
💰 R$ 60,00
⏱️ 45 minutos

💈 Barba
💰 R$ 25,00
⏱️ 20 minutos

💈 Sobrancelha
💰 R$ 15,00
⏱️ 10 minutos

💈 Combo Completo
💰 R$ 80,00
⏱️ 60 minutos

Digite qualquer coisa para voltar ao menu.
```

---

## FLUXO ALTERNATIVO: Falar com Atendente

### Etapa 2C: Cliente Escolhe "3" (Falar com Atendente)

**Cliente envia:** `3`

**Bot responde:**
```
Um atendente entrará em contato em breve! 👨‍💼
```

**Ação do sistema:**
- Notifica o administrador da barbearia
- Guarda a mensagem do cliente
- Cliente sai do fluxo automático

---

## LEMBRETE AUTOMÁTICO

### 2 Horas Antes do Horário

**Bot envia automaticamente:**
```
⏰ Lembrete!

Olá [Nome do Cliente]!

Seu horário é daqui a 2 horas:
📋 Corte + Barba
👨‍🦱 Barbeiro: Roberto
⏰ 15:00

Te esperamos! 💈
```

---

## 🧠 LÓGICA INTELIGENTE DO BOT

### Sessões Temporárias
- Cada conversa cria uma sessão única
- Sessão expira após 30 minutos de inatividade
- Dados são salvos em cada etapa
- Cliente pode voltar de onde parou

### Validações
 Verifica se o horário ainda está disponível  
 Impede agendamento duplicado  
 Valida opções inválidas  
 Guarda contexto da conversa  

### Segurança
 Apenas números de telefone válidos  
 Limite de tentativas  
 Anti-spam  
 Dados criptografados  

---

## ARMAZENAMENTO DE DADOS

### Tabela: whatsapp_sessions

```sql
{
  "id": "uuid",
  "phone": "5511999887766",
  "barbershop_id": "uuid",
  "step": "choose_time",
  "data": {
    "serviceId": "uuid",
    "serviceName": "Corte + Barba",
    "servicePrice": 60.00,
    "barberId": "uuid",
    "barberName": "Roberto",
    "date": "2024-02-15",
    "availableSlots": ["09:00", "10:00", "15:00"]
  },
  "created_at": "2024-02-12 10:00:00",
  "updated_at": "2024-02-12 10:05:00"
}
```

---

## CONFIGURAÇÃO TÉCNICA

### 1. Escolher Provedor WhatsApp

#### Z-API (Recomendado para começar)
```env
WHATSAPP_API_URL=https://api.z-api.io/instances/SEU_ID
WHATSAPP_API_KEY=sua_chave_aqui
```

**Passos:**
1. Acesse: https://z-api.io
2. Crie uma conta
3. Conecte seu WhatsApp
4. Copie a URL da instância
5. Configure o webhook

#### Twilio
```env
WHATSAPP_API_URL=https://api.twilio.com/2010-04-01
WHATSAPP_API_KEY=seu_token_twilio
```

#### 360dialog (Meta Official)
```env
WHATSAPP_API_URL=https://waba.360dialog.io/v1
WHATSAPP_API_KEY=seu_api_key
```

---

### 2. Configurar Webhook

No painel do provedor, configure:

**URL do Webhook:**
```
https://seu-dominio.com/api/whatsapp/webhook
```

**Método:** POST

**Payload esperado:**
```json
{
  "phone": "5511999887766",
  "message": "1",
  "barbershopId": "uuid-da-barbearia"
}
```

---

### 3. Testar Localmente com Ngrok

```bash
# Instalar ngrok
npm install -g ngrok

# Expor porta 5000
ngrok http 5000
```

**Resultado:**
```
Forwarding: https://abc123.ngrok.io -> http://localhost:5000
```

Use `https://abc123.ngrok.io/api/whatsapp/webhook` como webhook.

---

## 📊 MENSAGENS ENVIADAS X RECEBIDAS

### Estatísticas Médias
- **Boas-vindas:** 1 mensagem enviada
- **Menu:** 1 mensagem enviada
- **Serviços:** 1 mensagem enviada
- **Barbeiros:** 1 mensagem enviada
- **Datas:** 1 mensagem enviada
- **Horários:** 1 mensagem enviada
- **Confirmação:** 1 mensagem enviada
- **Lembrete:** 1 mensagem enviada (2h antes)

**Total por agendamento:** ~8 mensagens

---

## 🚨 TRATAMENTO DE ERROS

### Cliente Envia Opção Inválida

**Bot responde:**
```
❌ Opção inválida. Por favor, escolha um número da lista.
```

### Horário Não Disponível

**Bot responde:**
```
❌ Este horário foi reservado agora mesmo.

⏰ Escolha outro horário:
1️⃣ 16:00
2️⃣ 17:00
3️⃣ 18:00
```

### Sessão Expirada

**Bot responde:**
```
⏰ Sua sessão expirou por inatividade.

Digite qualquer coisa para começar novamente.
```

---

## 🎨 PERSONALIZAÇÃO

### Mensagens Customizáveis

No código (`whatsappService.js`), você pode personalizar:

```javascript
// Mensagem de boas-vindas
const welcomeMessage = `Olá 👋 Bem-vindo à ${barbershop.rows[0].name}\n\n` +
  `Escolha uma opção:\n` +
  `1️⃣ Agendar horário\n` +
  `2️⃣ Ver serviços\n` +
  `3️⃣ Falar com atendente`;
```

### Adicionar Novos Fluxos

Exemplo: Cancelamento de horário

```javascript
case 'menu':
  return `
  1️⃣ Agendar horário
  2️⃣ Ver serviços
  3️⃣ Cancelar agendamento  // NOVO
  4️⃣ Falar com atendente
  `;
```

---

## 📈 MONITORAMENTO

### Logs do Sistema

O sistema registra:
- ✅ Mensagens recebidas
- ✅ Mensagens enviadas
- ✅ Agendamentos criados
- ✅ Lembretes enviados
- ❌ Erros na API

**Exemplo de log:**
```
⏰ Verificando lembretes...
✅ Lembrete enviado para 5511999887766
```

---

## 🔧 TROUBLESHOOTING

### Bot não responde
1. Verifique se o backend está rodando
2. Confira se o webhook está configurado
3. Teste o endpoint: `POST /api/whatsapp/webhook`
4. Verifique os logs do servidor

### Mensagens duplicadas
- Provedor pode reenviar mensagens
- Implemente idempotência no webhook

### Lembretes não enviados
- Verifique o cron job
- Confirme dados da API WhatsApp
- Teste envio manual

---

## 🎯 PRÓXIMAS MELHORIAS

- [ ] Cancelamento via bot
- [ ] Reagendamento via bot
- [ ] Envio de foto do barbeiro
- [ ] Avaliação pós-atendimento
- [ ] Promoções automáticas
- [ ] Integração com Instagram
- [ ] Bot de vendas de produtos

---

**🤖 Bot inteligente para sua barbearia!**
