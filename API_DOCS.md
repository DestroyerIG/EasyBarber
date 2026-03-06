# 📘 DOCUMENTAÇÃO DA API - BarberPro SaaS

**Base URL:** `http://localhost:5000/api/v1`

> **Nota:** Rotas legadas em `/api/*` são redirecionadas automaticamente para `/api/v1/*` (301).

## Autenticação

O sistema usa **JWT** com **access token** (curta duração) e **refresh token** (longa duração).

Os tokens são enviados via **httpOnly cookies** (mais seguro) ou via header `Authorization: Bearer <token>` (compatibilidade com mobile/Postman).

### Respostas padronizadas

**Sucesso:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operação realizada com sucesso"
}
```

**Sucesso paginado:**
```json
{
  "success": true,
  "data": [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

**Erro:**
```json
{
  "success": false,
  "message": "Dados inválidos",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos",
    "details": ["campo: mensagem de erro"]
  }
}
```

### Códigos de erro comuns

| Código HTTP | Code | Descrição |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Dados inválidos (Zod) |
| 401 | `UNAUTHORIZED` | Token ausente, inválido ou expirado |
| 403 | `PLAN_LIMIT` | Plano insuficiente |
| 404 | `NOT_FOUND` | Recurso não encontrado |
| 409 | `CONFLICT` | Conflito de dados |
| 429 | `RATE_LIMIT` | Muitas requisições |
| 500 | `INTERNAL_ERROR` | Erro interno |

---

## ROTAS PÚBLICAS

### Health Check

**GET** `/health`

```json
{
  "status": "ok",
  "db": "connected",
  "uptime": 123.45
}
```

### Info da API

**GET** `/`

```json
{
  "message": "💈 BarberPro SaaS API",
  "version": "1.0.0",
  "status": "online"
}
```

---

## AUTENTICAÇÃO (`/api/auth`)

### 1. Registrar Barbearia

**POST** `/auth/register`

```json
{
  "barbershopName": "Barbearia Elite",
  "ownerName": "Carlos Silva",
  "email": "carlos@elite.com",
  "whatsapp": "11987654321",
  "password": "MinhaSenh4"
}
```

**Validação da senha:**
- Mínimo 8 caracteres
- Pelo menos 1 letra maiúscula
- Pelo menos 1 número
- Não pode ser senha comum (ex: "Password1")

**Resposta (201):**
```json
{
  "success": true,
  "data": {
    "message": "Barbearia cadastrada com sucesso",
    "token": "eyJhbGci...",
    "barbershop": {
      "id": "uuid",
      "name": "Barbearia Elite",
      "plan": "basico"
    }
  }
}
```

> Cookies `access_token` e `refresh_token` são definidos automaticamente.

---

### 2. Login

**POST** `/auth/login`

```json
{
  "email": "carlos@elite.com",
  "password": "MinhaSenh4"
}
```

**Resposta (200):**
```json
{
  "success": true,
  "data": {
    "message": "Login realizado com sucesso",
    "token": "eyJhbGci...",
    "user": {
      "email": "carlos@elite.com",
      "role": "admin",
      "barbershopName": "Barbearia Elite",
      "plan": "basico"
    }
  }
}
```

---

### 3. Refresh Token

**POST** `/auth/refresh`

Renova o access token usando o refresh token (enviado via cookie).

**Resposta (200):**
```json
{
  "success": true,
  "data": {
    "message": "Token renovado"
  }
}
```

---

### 4. Logout

**POST** `/auth/logout`

Invalida o refresh token e limpa os cookies.

---

### 5. Dados do Usuário Atual

**GET** `/auth/me` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "carlos@elite.com",
    "role": "admin",
    "barbershopId": "uuid",
    "barbershopName": "Barbearia Elite",
    "plan": "basico"
  }
}
```

---

## DASHBOARD (`/api/dashboard`)

### 6. Dados do Dashboard

**GET** `/dashboard` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": {
    "appointmentsToday": 8,
    "earningsToday": 450.00,
    "expensesToday": 120.00,
    "profitToday": 330.00,
    "totalClients": 156,
    "weeklyEarnings": [
      { "date": "2026-03-01", "total": 380 },
      { "date": "2026-03-02", "total": 420 }
    ]
  }
}
```

---

## AGENDAMENTOS (`/api/appointments`)

### 7. Listar Agendamentos

**GET** `/appointments` 🔒

**Query Parameters:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `date` | string | Data (YYYY-MM-DD) |
| `view` | string | `day` ou `week` |
| `status` | string | `confirmado`, `cancelado`, `concluido` |

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "date": "2026-03-06",
      "time": "14:00:00",
      "status": "confirmado",
      "client_name": "João Pedro",
      "client_phone": "11999887766",
      "barber_name": "Roberto",
      "service_name": "Corte + Barba",
      "service_price": 60.00
    }
  ]
}
```

---

### 8. Horários Disponíveis

**GET** `/appointments/available-slots` 🔒

**Query Parameters:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `barberId` | uuid | Sim | ID do barbeiro |
| `date` | string | Sim | Data (YYYY-MM-DD) |

**Resposta:**
```json
{
  "success": true,
  "data": ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]
}
```

---

### 9. Criar Agendamento

**POST** `/appointments` 🔒

```json
{
  "clientId": "uuid-do-cliente",
  "barberId": "uuid-do-barbeiro",
  "serviceId": "uuid-do-servico",
  "date": "2026-03-15",
  "time": "15:00"
}
```

---

### 10. Atualizar Agendamento

**PUT** `/appointments/:id` 🔒

```json
{
  "clientId": "uuid-do-cliente",
  "barberId": "uuid-do-barbeiro",
  "serviceId": "uuid-do-servico",
  "date": "2026-03-16",
  "time": "16:00"
}
```

---

### 11. Atualizar Status

**PUT** `/appointments/:id/status` 🔒

```json
{
  "status": "concluido"
}
```

**Status disponíveis:** `confirmado`, `cancelado`, `concluido`

> Quando status é `concluido`, o sistema registra automaticamente o ganho na tabela `earnings`.

---

### 12. Excluir Agendamento

**DELETE** `/appointments/:id` 🔒

---

## CLIENTES (`/api/clients`)

### 13. Listar Clientes

**GET** `/clients` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "João Pedro",
      "phone": "11999887766",
      "email": "joao@email.com",
      "last_visit": "2026-03-01",
      "total_spent": 180.00,
      "created_at": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

### 14. Cadastrar Cliente

**POST** `/clients` 🔒

```json
{
  "name": "Maria Santos",
  "phone": "11988776655",
  "email": "maria@email.com",
  "birthDate": "1990-05-15",
  "address": "Rua Exemplo, 123",
  "notes": "Cliente VIP"
}
```

> Campos opcionais: `email`, `birthDate`, `address`, `notes`

---

### 15. Atualizar Cliente

**PUT** `/clients/:id` 🔒

Aceita todos os campos de criação (todos opcionais no update).

---

### 16. Histórico do Cliente

**GET** `/clients/:id/history` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "date": "2026-03-01",
      "time": "14:00:00",
      "status": "concluido",
      "barber_name": "Roberto",
      "service_name": "Corte Masculino",
      "service_price": 45.00
    }
  ]
}
```

---

## FINANCEIRO (`/api/finance`)

### 17. Resumo Financeiro

**GET** `/finance/summary` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": {
    "today": {
      "earnings": 450.00,
      "expenses": 120.00,
      "profit": 330.00
    },
    "month": {
      "earnings": 8500.00,
      "expenses": 2300.00,
      "profit": 6200.00
    }
  }
}
```

---

### 18. Relatório Mensal

**GET** `/finance/monthly` 🔒 **Requer: Plano Profissional+**

**Query Parameters:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `month` | number | Mês (1-12) |
| `year` | number | Ano (ex: 2026) |

**Resposta:**
```json
{
  "success": true,
  "data": [
    { "date": "2026-03-01", "earnings": 380.00, "expenses": 150.00, "profit": 230.00 },
    { "date": "2026-03-02", "earnings": 420.00, "expenses": 80.00, "profit": 340.00 }
  ]
}
```

---

### 19. Adicionar Gasto

**POST** `/finance/expenses` 🔒

```json
{
  "description": "Aluguel do mês",
  "category": "aluguel",
  "amount": 1500.00,
  "date": "2026-03-01"
}
```

---

### 20. Atualizar Gasto

**PUT** `/finance/expenses/:id` 🔒

Aceita todos os campos de criação (todos opcionais no update).

---

### 21. Excluir Gasto

**DELETE** `/finance/expenses/:id` 🔒

---

### 22. Listar Gastos

**GET** `/finance/expenses` 🔒

**Query Parameters:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `startDate` | string | Data inicial (YYYY-MM-DD) |
| `endDate` | string | Data final (YYYY-MM-DD) |

---

## SERVIÇOS E BARBEIROS (`/api/barbershop`)

### 23. Listar Serviços

**GET** `/barbershop/services` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Corte Masculino",
      "price": 45.00,
      "duration_minutes": 30,
      "active": true
    }
  ]
}
```

---

### 24. Criar Serviço

**POST** `/barbershop/services` 🔒

```json
{
  "name": "Sobrancelha",
  "price": 15.00,
  "duration_minutes": 15
}
```

**Validação:**
- `name`: mín. 2 caracteres
- `price`: positivo, máx. 2 casas decimais
- `duration_minutes`: entre 10 e 300

---

### 25. Atualizar Serviço

**PUT** `/barbershop/services/:id` 🔒

---

### 26. Excluir Serviço

**DELETE** `/barbershop/services/:id` 🔒

---

### 27. Listar Barbeiros

**GET** `/barbershop/barbers` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Roberto Silva",
      "photo": "https://exemplo.com/foto.jpg",
      "active": true
    }
  ]
}
```

---

### 28. Criar Barbeiro

**POST** `/barbershop/barbers` 🔒

```json
{
  "name": "Carlos Mendes",
  "photo": "https://exemplo.com/carlos.jpg"
}
```

> `photo` é opcional.

**Limites por plano:**
- Básico: 1 barbeiro
- Profissional: 5 barbeiros
- Premium: Ilimitado

---

### 29. Atualizar Barbeiro

**PUT** `/barbershop/barbers/:id` 🔒

---

### 30. Excluir Barbeiro

**DELETE** `/barbershop/barbers/:id` 🔒

---

## WHATSAPP (`/api/whatsapp`)

### Conexão

#### 31. Status da Conexão

**GET** `/whatsapp/status` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": {
    "status": "connected",
    "qrCode": null,
    "error": null,
    "connectedNumber": "5511999999999",
    "connectedName": "Barbearia Elite"
  }
}
```

**Status possíveis:** `disconnected`, `connecting`, `qr`, `connected`

---

#### 32. QR Code para Conectar

**GET** `/whatsapp/qr` 🔒

Retorna o QR Code como imagem Data URL para escanear com o WhatsApp.

---

#### 33. Desconectar WhatsApp

**POST** `/whatsapp/logout` 🔒

---

#### 34. Reiniciar Conexão

**POST** `/whatsapp/restart` 🔒

---

### Configuração de Mensagens

#### 35. Obter Configurações

**GET** `/whatsapp/config` 🔒

Retorna as 21 mensagens configuráveis do bot.

---

#### 36. Atualizar Mensagens

**PUT** `/whatsapp/config` 🔒

```json
{
  "welcome_header": "Olá! Bem-vindo à {nome_barbearia}! 💈",
  "confirmation_message": "✅ Agendamento confirmado!",
  "reminder_message": "⏰ Lembrete: seu horário é daqui a pouco!"
}
```

**Campos configuráveis:**
- `welcome_header`, `ask_name_message`, `attendant_message`
- `confirmation_message`, `reminder_message`
- `invalid_option_message`, `session_expired_message`, `end_session_message`
- `name_validation_message`, `no_slots_message`
- `cancel_no_appointments_message`, `cancel_list_message`, `cancel_success_message`
- `reschedule_no_appointments_message`, `reschedule_list_message`
- `no_previous_appointments_message`
- `rating_question_message`, `rating_confirmation_message`
- `promotions_message`, `instagram_message`

---

#### 37. Resetar Mensagens

**POST** `/whatsapp/config/reset` 🔒

Restaura todas as mensagens para os valores padrão.

---

### Menu do Bot

#### 38. Obter Opções do Menu

**GET** `/whatsapp/config/menu` 🔒

**Resposta:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "option_order": 1, "label": "Agendar um horário", "emoji": "💈", "type": "system", "active": true },
    { "id": "uuid", "option_order": 2, "label": "Ver nossos serviços", "emoji": "📋", "type": "system", "active": true }
  ]
}
```

**9 opções padrão do sistema:**
1. 💈 Agendar um horário
2. 📋 Ver nossos serviços
3. ❌ Cancelar agendamento
4. 🔄 Reagendamento
5. ⭐ Avaliação pós-atendimento
6. 🎉 Promoções
7. 📱 Instagram
8. 👨‍💼 Falar com um humano
9. 🚪 Encerrar atendimento

---

#### 39. Criar Opção de Menu

**POST** `/whatsapp/config/menu` 🔒

```json
{
  "label": "Horário de funcionamento",
  "emoji": "🕐",
  "response_message": "Funcionamos de seg a sáb, das 9h às 20h!"
}
```

> Máximo de 15 opções no total.

---

#### 40. Atualizar Opção de Menu

**PUT** `/whatsapp/config/menu/:id` 🔒

---

#### 41. Excluir Opção de Menu

**DELETE** `/whatsapp/config/menu/:id` 🔒

> Opções do tipo `system` não podem ser excluídas.

---

#### 42. Reordenar Menu

**PUT** `/whatsapp/config/menu-reorder` 🔒

```json
{
  "order": ["uuid-1", "uuid-2", "uuid-3"]
}
```

---

#### 43. Resetar Menu

**POST** `/whatsapp/config/menu/reset` 🔒

Restaura as 9 opções padrão.

---

### Webhook

#### 44. Receber Mensagem (Webhook Local)

**POST** `/whatsapp/webhook` (Sem autenticação)

Rota usada internamente pelo `whatsapp-web.js` para processar mensagens recebidas.

---

## 🔒 Legenda

- 🔒 = Requer autenticação (token JWT via cookie ou header `Authorization: Bearer <token>`)
- **Plano Profissional+** = Requer plano profissional ou premium

---

## TESTANDO COM POWERSHELL

### Registrar

```powershell
$body = @{
  barbershopName = "Teste"
  ownerName = "João"
  email = "joao@teste.com"
  whatsapp = "11999999999"
  password = "MinhaSenh4"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method POST -ContentType "application/json" -Body $body
```

### Login e usar token

```powershell
$login = @{ email = "joao@teste.com"; password = "MinhaSenh4" } | ConvertTo-Json
$response = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" -Method POST -ContentType "application/json" -Body $login

$token = $response.data.token
$headers = @{ Authorization = "Bearer $token" }

# Dashboard
Invoke-RestMethod -Uri "http://localhost:5000/api/dashboard" -Headers $headers

# Listar serviços
Invoke-RestMethod -Uri "http://localhost:5000/api/barbershop/services" -Headers $headers
```

### Health Check

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```
