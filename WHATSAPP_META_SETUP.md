# Migração para a WhatsApp Cloud API (Meta) — Guia de Configuração

O bot deixou de usar a Evolution API e passou a usar a **API oficial da Meta
(WhatsApp Cloud API)**. Cada barbearia conecta o próprio número colando o
`Phone Number ID` + token de acesso na tela **WhatsApp → Conexão** do painel.

Não há mais QR Code: a conexão é feita por credenciais.

---

## Parte 1 — Configuração ÚNICA do app Meta (você, uma vez)

1. **Criar o app**
   - Acesse <https://developers.facebook.com/apps> → **Create App**.
   - Tipo: **Business**. Dê um nome (ex.: "EasyBarber").

2. **Adicionar o produto WhatsApp**
   - No app → **Add Product** → **WhatsApp** → *Set up*.
   - Isso cria uma WhatsApp Business Account (WABA) de teste e um número de teste.

3. **Verificação do negócio** (necessária para produção / mensagens a qualquer número)
   - Meta Business Suite → **Configurações do negócio** → **Central de Segurança** →
     **Iniciar verificação**. Envie os documentos da empresa.
   - Enquanto não verificado, só dá para enviar para até 5 números de teste
     cadastrados em *API Setup → To*.

4. **Token permanente (System User)** — o token de teste expira em 24h, não use.
   - Meta Business Suite → **Configurações do negócio** → **Usuários → Usuários do sistema**.
   - **Adicionar** → nome (ex.: "easybarber-bot") → função **Admin**.
   - **Gerar novo token** → escolha o app → permissões:
     `whatsapp_business_messaging` e `whatsapp_business_management`.
   - **Sem expiração**. Copie o token (começa com `EAA...`). Guarde com cuidado.
   - Em **Ativos**, dê acesso desse System User à WABA.

5. **Configurar o Webhook** (App → WhatsApp → Configuration → Webhook)
   - **Callback URL:**
     `https://easybarber-backend.onrender.com/api/v1/whatsapp/meta/webhook`
   - **Verify token:** a mesma string que você colocar em `WHATSAPP_VERIFY_TOKEN`.
   - Clique **Verify and save** (o backend responde o `hub.challenge`).
   - Em **Webhook fields**, assine o campo **`messages`**.

6. **Variáveis de ambiente do backend (Render)**
   | Variável | Valor |
   |----------|-------|
   | `WHATSAPP_API_VERSION` | `v23.0` (ou a atual) |
   | `WHATSAPP_VERIFY_TOKEN` | string que você inventou (igual à do passo 5) |
   | `WHATSAPP_APP_SECRET` | App → Settings → Basic → **App Secret** |

   `WHATSAPP_APP_SECRET` valida a assinatura dos webhooks. Se vazio, a checagem é
   pulada (ok para testar, recomendado preencher em produção).

7. **Migração do banco** — rode no backend:
   ```bash
   npx prisma migrate deploy
   ```
   (adiciona as colunas `whatsapp_phone_number_id`, `whatsapp_waba_id`,
   `whatsapp_access_token` em `barbershops`.)

---

## Parte 2 — Conectar cada barbearia (cada dono, ou você por ela)

1. Em **App → WhatsApp → API Setup**, copie o **Phone Number ID** do número da
   barbearia (não é o telefone; é um ID numérico).
2. No EasyBarber: **WhatsApp → Conexão**.
3. Preencha:
   - **Phone Number ID** (obrigatório)
   - **Token de acesso** (o token permanente do System User — obrigatório)
   - **WABA ID** (opcional)
   - **Número exibido** (opcional, ex.: `+55 83 99999-9999`)
4. **Salvar e conectar** — o sistema valida as credenciais direto na Graph API
   antes de salvar. Se aceitas, o bot já está ativo.

> O token pode ser o mesmo System User para várias barbearias, desde que ele
> tenha acesso às WABAs/numeros de cada uma. O que diferencia cada barbearia é o
> **Phone Number ID** (o roteamento de entrada usa ele).

---

## Como funciona internamente

- **Saída:** `sendWhatsAppText` detecta as credenciais Meta da barbearia e envia
  via `POST /{phone_number_id}/messages` (Graph API). Sem credenciais, cai no
  fluxo legado da Evolution.
- **Entrada:** webhook único `/api/v1/whatsapp/meta/webhook` recebe tudo e roteia
  por `metadata.phone_number_id` → barbearia → fluxo de agendamento existente.
- O "cérebro" do bot (menu, agendamento, sessões, mensagens) é o mesmo — só o
  transporte mudou.

## Limites da Meta a saber

- **Janela de 24h:** respostas em texto livre só dentro de 24h após a última
  mensagem do cliente. Como o bot só responde a quem escreveu, está sempre dentro
  da janela. Para iniciar conversa fora disso, é preciso *template* aprovado.
- **Número de teste:** sem verificação do negócio, só envia para até 5 números
  cadastrados manualmente no painel.
