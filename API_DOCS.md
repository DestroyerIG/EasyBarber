# DOCUMENTAÇÃO DA API - BarberPro SaaS

Base URL: `http://localhost:5000/api`

---

## AUTENTICAÇÃO

### 1. Registrar Nova Barbearia

**POST** `/auth/register`

```json
{
  "barbershopName": "Barbearia Elite",
  "ownerName": "Carlos Silva",
  "email": "carlos@elite.com",
  "whatsapp": "11987654321",
  "password": "senha123",
  "plan": "profissional"
}
```

**Resposta:**
```json
{
  "message": "Barbearia cadastrada com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "barbershop": {
    "id": "uuid",
    "name": "Barbearia Elite",
    "plan": "profissional"
  }
}
```

---

### 2. Login

**POST** `/auth/login`

```json
{
  "email": "carlos@elite.com",
  "password": "senha123"
}
```

**Resposta:**
```json
{
  "message": "Login realizado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "carlos@elite.com",
    "role": "admin",
    "barbershopName": "Barbearia Elite",
    "plan": "profissional"
  }
}
```

**⚠️ IMPORTANTE:** Use o token nas próximas requisições no header:
```
Authorization: Bearer SEU_TOKEN
```

---

## DASHBOARD

### 3. Obter Dados do Dashboard

**GET** `/dashboard`

**Headers:**
```
Authorization: Bearer SEU_TOKEN
```

**Resposta:**
```json
{
  "appointmentsToday": 8,
  "earningsToday": 450.00,
  "expensesToday": 120.00,
  "profitToday": 330.00,
  "totalClients": 156,
  "weeklyEarnings": [
    { "date": "2024-02-05", "total": 380 },
    { "date": "2024-02-06", "total": 420 },
    { "date": "2024-02-07", "total": 450 }
  ]
}
```

---

## AGENDAMENTOS

### 4. Listar Agendamentos

**GET** `/appointments?date=2024-02-12&view=day&status=confirmado`

**Query Parameters:**
- `date` (opcional): Data no formato YYYY-MM-DD
- `view` (opcional): `day` ou `week`
- `status` (opcional): `confirmado`, `cancelado`, `concluido`

**Headers:**
```
Authorization: Bearer SEU_TOKEN
```

**Resposta:**
```json
[
  {
    "id": "uuid",
    "date": "2024-02-12",
    "time": "14:00:00",
    "status": "confirmado",
    "client_name": "João Pedro",
    "client_phone": "11999887766",
    "barber_name": "Roberto",
    "service_name": "Corte + Barba",
    "service_price": 60.00
  }
]
```

---

### 5. Criar Agendamento

**POST** `/appointments`

```json
{
  "clientId": "uuid-do-cliente",
  "barberId": "uuid-do-barbeiro",
  "serviceId": "uuid-do-servico",
  "date": "2024-02-15",
  "time": "15:00"
}
```

**Resposta:**
```json
{
  "id": "uuid",
  "barbershop_id": "uuid",
  "client_id": "uuid",
  "barber_id": "uuid",
  "service_id": "uuid",
  "date": "2024-02-15",
  "time": "15:00:00",
  "status": "confirmado"
}
```

---

### 6. Atualizar Status do Agendamento

**PUT** `/appointments/:id/status`

```json
{
  "status": "concluido"
}
```

**Status disponíveis:** `confirmado`, `cancelado`, `concluido`

**⚠️ IMPORTANTE:** Quando o status é `concluido`, o sistema:
- Registra automaticamente o ganho
- Atualiza o histórico do cliente
- Incrementa o total gasto pelo cliente

---

### 7. Horários Disponíveis

**GET** `/appointments/available-slots?barberId=uuid&date=2024-02-15`

**Resposta:**
```json
[
  "09:00",
  "10:00",
  "11:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00"
]
```

---

## CLIENTES

### 8. Listar Clientes

**GET** `/clients`

**Resposta:**
```json
[
  {
    "id": "uuid",
    "name": "João Pedro",
    "phone": "11999887766",
    "last_visit": "2024-02-10",
    "total_spent": 180.00,
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

---

### 9. Cadastrar Cliente

**POST** `/clients`

```json
{
  "name": "Maria Santos",
  "phone": "11988776655"
}
```

---

### 10. Histórico do Cliente

**GET** `/clients/:id/history`

**Resposta:**
```json
[
  {
    "id": "uuid",
    "date": "2024-02-10",
    "time": "14:00:00",
    "status": "concluido",
    "barber_name": "Roberto",
    "service_name": "Corte Masculino",
    "service_price": 45.00
  }
]
```

---

## FINANCEIRO

### 11. Resumo Financeiro

**GET** `/finance/summary`

**Resposta:**
```json
{
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
```

---

### 12. Relatório Mensal

**GET** `/finance/monthly?month=2&year=2024`

**⚠️ REQUER PLANO:** Profissional ou Premium

**Resposta:**
```json
[
  {
    "date": "2024-02-01",
    "earnings": 380.00,
    "expenses": 150.00,
    "profit": 230.00
  },
  {
    "date": "2024-02-02",
    "earnings": 420.00,
    "expenses": 80.00,
    "profit": 340.00
  }
]
```

---

### 13. Adicionar Gasto

**POST** `/finance/expenses`

```json
{
  "description": "Aluguel do mês",
  "category": "aluguel",
  "amount": 1500.00,
  "date": "2024-02-01"
}
```

**Categorias disponíveis:**
- `produto`
- `aluguel`
- `contas`
- `outros`

---

### 14. Listar Gastos

**GET** `/finance/expenses?startDate=2024-02-01&endDate=2024-02-28`

**Resposta:**
```json
[
  {
    "id": "uuid",
    "description": "Aluguel do mês",
    "category": "aluguel",
    "amount": 1500.00,
    "date": "2024-02-01"
  }
]
```

---

## SERVIÇOS E BARBEIROS

### 15. Listar Serviços

**GET** `/barbershop/services`

**Resposta:**
```json
[
  {
    "id": "uuid",
    "name": "Corte Masculino",
    "price": 45.00,
    "duration_minutes": 30,
    "active": true
  },
  {
    "id": "uuid",
    "name": "Corte + Barba",
    "price": 60.00,
    "duration_minutes": 45,
    "active": true
  }
]
```

---

### 16. Criar Serviço

**POST** `/barbershop/services`

```json
{
  "name": "Sobrancelha",
  "price": 15.00,
  "duration_minutes": 15
}
```

---

### 17. Listar Barbeiros

**GET** `/barbershop/barbers`

**Resposta:**
```json
[
  {
    "id": "uuid",
    "name": "Roberto Silva",
    "photo": "https://exemplo.com/foto.jpg",
    "active": true
  }
]
```

---

### 18. Criar Barbeiro

**POST** `/barbershop/barbers`

```json
{
  "name": "Carlos Mendes",
  "photo": "https://exemplo.com/carlos.jpg"
}
```

**⚠️ LIMITES POR PLANO:**
- Básico: 1 barbeiro
- Profissional: 5 barbeiros
- Premium: Ilimitado

---

## WHATSAPP

### 19. Webhook do WhatsApp

**POST** `/whatsapp/webhook`

```json
{
  "phone": "5511999887766",
  "message": "oi",
  "barbershopId": "uuid-da-barbearia"
}
```

**⚠️ NOTA:** Esta rota é chamada automaticamente pela API do WhatsApp.

**Fluxo do Bot:**
1. Cliente envia "oi"
2. Bot responde com menu
3. Cliente escolhe opção (1, 2 ou 3)
4. Bot guia pelo processo de agendamento
5. Confirmação automática

---

##  CÓDIGOS DE ERRO

### 400 - Bad Request
```json
{
  "error": "Email já cadastrado"
}
```

### 401 - Unauthorized
```json
{
  "error": "Token não fornecido"
}
```

### 403 - Forbidden
```json
{
  "error": "Plano insuficiente",
  "message": "Esta funcionalidade requer o plano profissional ou superior"
}
```

### 404 - Not Found
```json
{
  "error": "Agendamento não encontrado"
}
```

### 500 - Internal Server Error
```json
{
  "error": "Erro ao processar solicitação"
}
```

---

## TESTANDO COM CURL

### Registrar
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "barbershopName": "Teste",
    "ownerName": "Teste",
    "email": "teste@teste.com",
    "whatsapp": "11999999999",
    "password": "123456",
    "plan": "basico"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@teste.com",
    "password": "123456"
  }'
```

### Dashboard (com token)
```bash
curl http://localhost:5000/api/dashboard \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## COLLECTION POSTMAN

Importe esta collection no Postman para testar todas as rotas:

1. Abra o Postman
2. Import > Raw text
3. Cole o JSON abaixo

```json
{
  "info": {
    "name": "BarberPro SaaS API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Auth",
      "item": [
        {
          "name": "Register",
          "request": {
            "method": "POST",
            "url": "http://localhost:5000/api/auth/register",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"barbershopName\": \"Teste\",\n  \"ownerName\": \"Teste\",\n  \"email\": \"teste@teste.com\",\n  \"whatsapp\": \"11999999999\",\n  \"password\": \"123456\",\n  \"plan\": \"basico\"\n}"
            }
          }
        },
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": "http://localhost:5000/api/auth/login",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"teste@teste.com\",\n  \"password\": \"123456\"\n}"
            }
          }
        }
      ]
    }
  ]
}
```

---

**🚀 Pronto para começar a integrar!**
