# 💈 BarberPro SaaS - Sistema Completo para Barbearias

Sistema SaaS completo para gestão de barbearias com agendamento automático via WhatsApp, controle financeiro e painel administrativo profissional.

## 🎨 Características

- **Identidade Visual**: Preto (#000000) e Laranja (#FF7A00)
- **Design Responsivo**: Funciona perfeitamente em desktop e mobile
- **Interface Intuitiva**: Botões grandes e navegação simples

## 🚀 Funcionalidades

### 🔐 Sistema de Acesso
- Login com email e senha
- Cadastro de novas barbearias
- Recuperação de senha
- Controle por planos de assinatura

### 📊 Dashboard Administrativo
- Visualização de agendamentos do dia
- Ganhos, gastos e lucro em tempo real
- Total de clientes atendidos
- Gráfico semanal de faturamento

### 🤖 Bot de Agendamento WhatsApp
- Integração completa com WhatsApp Business
- Fluxo automático de agendamento:
  - Escolha de serviço
  - Seleção de barbeiro
  - Escolha de data e horário
  - Confirmação automática
- Lembretes 2h antes do horário

### 📅 Gestão de Agendamentos
- Calendário interativo
- Visualização por dia/semana
- Status: Confirmado, Cancelado, Concluído
- Histórico completo

### 💰 Módulo Financeiro
- Registro automático de ganhos
- Cadastro manual de gastos
- Relatórios diários e mensais
- Gráficos de crescimento
- Exportação em PDF

### 👥 Gestão de Clientes
- Cadastro completo
- Histórico de atendimentos
- Total gasto por cliente
- Último atendimento

### 💈 Gestão de Serviços e Barbeiros
- Cadastro de serviços com valor e duração
- Gestão de barbeiros
- Agenda individual por barbeiro

### 💳 Planos de Assinatura
- **Básico**: 1 barbeiro, funcionalidades essenciais
- **Profissional**: Até 5 barbeiros, relatórios avançados
- **Premium**: Barbeiros ilimitados, todas as funcionalidades

## 🛠️ Tecnologias Utilizadas

### Backend
- Node.js + Express
- PostgreSQL
- JWT para autenticação
- Bcrypt para senhas
- Node-cron para lembretes
- Axios para WhatsApp API

### Frontend
- Next.js 15
- TypeScript
- Tailwind CSS
- Recharts para gráficos
- Lucide React para ícones

## 📦 Instalação

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- Conta WhatsApp Business API (Z-API, Twilio, 360dialog ou Meta Cloud API)

### 1. Clone o repositório
```bash
git clone <seu-repositorio>
cd Barberpro-saas
```

### 2. Instalar dependências do Backend
```bash
cd backend
npm install
```

### 3. Configurar variáveis de ambiente
Copie o arquivo `.env.example` e renomeie para `.env`:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:
```env
PORT=5000
DATABASE_URL=postgresql://user:password@localhost:5432/barberpro
JWT_SECRET=seu_secret_super_seguro_aqui
WHATSAPP_API_KEY=sua_chave_api_whatsapp
WHATSAPP_API_URL=https://api.z-api.io/instances/SEU_ID
NODE_ENV=development
```

### 4. Criar banco de dados
Execute o script SQL para criar as tabelas:
```bash
psql -U seu_usuario -d barberpro -f src/config/database.sql
```

### 5. Iniciar o Backend
```bash
npm run dev
```
O servidor estará rodando em `http://localhost:5000`

### 6. Instalar dependências do Frontend
```bash
cd ../frontend
npm install
```

### 7. Configurar variáveis de ambiente do Frontend
Crie um arquivo `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 8. Iniciar o Frontend
```bash
npm run dev
```
O frontend estará rodando em `http://localhost:3000`

## 📱 Configuração do WhatsApp

### Opções de API WhatsApp:

1. **Z-API** (Recomendado para começar)
   - Site: https://z-api.io
   - Fácil configuração
   - Plano gratuito disponível

2. **Twilio**
   - Site: https://www.twilio.com
   - Mais robusto
   - Requer configuração avançada

3. **360dialog**
   - Site: https://www.360dialog.com
   - API oficial Meta
   - Melhor para escala

4. **Meta Cloud API**
   - Site: https://developers.facebook.com/docs/whatsapp
   - Gratuito
   - Configuração mais complexa

### Configurar Webhook

No painel da API WhatsApp escolhida, configure o webhook para:
```
POST https://seu-dominio.com/api/whatsapp/webhook
```

Corpo esperado:
```json
{
  "phone": "5511999999999",
  "message": "texto da mensagem",
  "barbershopId": "uuid-da-barbearia"
}
```

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais:
- `barbershops` - Dados das barbearias
- `users` - Usuários e autenticação
- `barbers` - Barbeiros
- `services` - Serviços oferecidos
- `clients` - Clientes
- `appointments` - Agendamentos
- `earnings` - Ganhos
- `expenses` - Gastos
- `whatsapp_sessions` - Sessões do bot

## 🔌 API Endpoints

### Autenticação
- `POST /api/auth/register` - Cadastrar barbearia
- `POST /api/auth/login` - Login

### Dashboard
- `GET /api/dashboard` - Dados do dashboard

### Agendamentos
- `GET /api/appointments` - Listar agendamentos
- `POST /api/appointments` - Criar agendamento
- `PUT /api/appointments/:id/status` - Atualizar status
- `GET /api/appointments/available-slots` - Horários disponíveis

### Clientes
- `GET /api/clients` - Listar clientes
- `POST /api/clients` - Cadastrar cliente
- `GET /api/clients/:id/history` - Histórico do cliente

### Financeiro
- `GET /api/finance/summary` - Resumo financeiro
- `GET /api/finance/monthly` - Relatório mensal
- `POST /api/finance/expenses` - Adicionar gasto
- `GET /api/finance/expenses` - Listar gastos

### Serviços e Barbeiros
- `GET /api/barbershop/services` - Listar serviços
- `POST /api/barbershop/services` - Criar serviço
- `GET /api/barbershop/barbers` - Listar barbeiros
- `POST /api/barbershop/barbers` - Criar barbeiro

### WhatsApp
- `POST /api/whatsapp/webhook` - Webhook do WhatsApp

## 🤖 Fluxo do Bot WhatsApp

1. Cliente envia mensagem
2. Sistema envia menu de opções
3. Cliente escolhe "Agendar horário"
4. Bot solicita:
   - Escolha do serviço
   - Escolha do barbeiro
   - Escolha da data
   - Escolha do horário
5. Confirmação automática
6. Lembrete 2h antes

## 🔒 Segurança

- Senhas criptografadas com bcrypt
- JWT para autenticação
- Validação de dados em todas as requisições
- Proteção contra SQL Injection
- CORS configurado
- Rate limiting (recomendado adicionar)

## 📈 Deploy

### Backend (Railway, Render, Heroku)
1. Configure as variáveis de ambiente
2. Configure o banco PostgreSQL
3. Deploy do código
4. Execute as migrations

### Frontend (Vercel, Netlify)
1. Configure a variável `NEXT_PUBLIC_API_URL`
2. Deploy automático do repositório

## 🆘 Suporte

Para dúvidas e problemas:
1. Verifique a documentação
2. Confira os logs do servidor
3. Teste as rotas da API com Postman/Insomnia

## 📝 Licença

Este projeto é proprietário. Todos os direitos reservados.

## 🎯 Próximos Passos

- [ ] Implementar upload de fotos
- [ ] Sistema de notificações push
- [ ] App mobile nativo
- [ ] Integração com Instagram
- [ ] Programa de fidelidade
- [ ] Sistema de avaliações
- [ ] Relatórios avançados com IA

## 👨‍💻 Desenvolvimento

```bash
# Rodar backend em desenvolvimento
cd backend
npm run dev

# Rodar frontend em desenvolvimento
cd frontend
npm run dev

# Build para produção
npm run build
npm start
```

---

Desenvolvido com ❤️ para revolucionar a gestão de barbearias
