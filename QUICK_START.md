# 🚀 GUIA DE INICIALIZAÇÃO RÁPIDA - BarberPro SaaS

## ✅ Pré-requisitos Instalados
- Node.js 18+ ✓
- PostgreSQL 14+ ✓
- Git ✓

## 📋 PASSO A PASSO PARA RODAR O PROJETO

### 1️⃣ Configurar o Banco de Dados PostgreSQL

```powershell
# Abrir o PostgreSQL (psql ou pgAdmin)
# Criar o banco de dados
CREATE DATABASE barberpro;

# Executar o script de criação das tabelas
# Navegue até a pasta do projeto e execute:
psql -U postgres -d barberpro -f backend/src/config/database.sql
```

**OU** copie todo o conteúdo do arquivo `backend/src/config/database.sql` e execute no pgAdmin.

---

### 2️⃣ Configurar Variáveis de Ambiente do Backend

Crie um arquivo `.env` dentro da pasta `backend/`:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/barberpro
JWT_SECRET=chave_secreta_super_segura_123456
WHATSAPP_API_KEY=sua_chave_whatsapp_aqui
WHATSAPP_API_URL=https://api.z-api.io/instances/SEU_ID
NODE_ENV=development
```

**IMPORTANTE:** Substitua:
- `SUA_SENHA` pela senha do seu PostgreSQL
- Deixe as configurações do WhatsApp para depois (opcional)

---

### 3️⃣ Instalar Dependências do Backend

```powershell
cd backend
npm install
```

---

### 4️⃣ Iniciar o Backend

```powershell
npm run dev
```

✅ **Sucesso!** O backend estará rodando em `http://localhost:5000`

Você deverá ver:
```
🚀 Servidor rodando na porta 5000
✅ Conectado ao banco de dados PostgreSQL
✅ Cron de lembretes iniciado
```

---

### 5️⃣ Configurar Variáveis do Frontend (Nova janela do terminal)

Crie um arquivo `.env.local` dentro da pasta `frontend/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

### 6️⃣ Instalar Dependências do Frontend

```powershell
cd frontend
npm install
```

---

### 7️⃣ Iniciar o Frontend

```powershell
npm run dev
```

✅ **Sucesso!** O frontend estará rodando em `http://localhost:3000`

---

## 🎉 PRONTO! Acesse o Sistema

Abra seu navegador em: **http://localhost:3000**

### 🔐 Primeira Vez?

1. Clique em **"Cadastre-se"**
2. Preencha os dados da sua barbearia:
   - Nome da Barbearia
   - Nome do Responsável
   - WhatsApp
   - Email
   - Senha
   - Escolha o plano (Básico, Profissional ou Premium)
3. Clique em **"Criar Conta"**
4. Você será redirecionado para o Dashboard!

---

## 🧪 Testar a API Diretamente

Você pode testar as rotas da API usando **Postman** ou **Thunder Client**:

### Exemplo: Criar uma conta
```http
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "barbershopName": "Barbearia Teste",
  "ownerName": "João Silva",
  "email": "joao@teste.com",
  "whatsapp": "11999999999",
  "password": "123456",
  "plan": "basico"
}
```

### Exemplo: Login
```http
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "joao@teste.com",
  "password": "123456"
}
```

Copie o `token` retornado e use nas próximas requisições:

### Exemplo: Ver Dashboard
```http
GET http://localhost:5000/api/dashboard
Authorization: Bearer SEU_TOKEN_AQUI
```

---

## 📱 Configurar WhatsApp (Opcional)

Para ativar o bot de agendamentos via WhatsApp:

### Opção 1: Z-API (Mais Fácil)
1. Acesse: https://z-api.io
2. Crie uma conta gratuita
3. Conecte seu WhatsApp
4. Copie a **URL da instância** e o **Token**
5. Configure no arquivo `.env` do backend:
   ```env
   WHATSAPP_API_URL=https://api.z-api.io/instances/SEU_ID
   WHATSAPP_API_KEY=seu_token_aqui
   ```
6. Configure o webhook na Z-API:
   - URL: `http://seu-dominio.com/api/whatsapp/webhook`

### Opção 2: Usar Ngrok para Testes Locais
```powershell
# Instalar ngrok
npm install -g ngrok

# Expor o backend
ngrok http 5000
```

Use a URL gerada pelo ngrok como webhook.

---

## 🛠️ Comandos Úteis

### Backend
```powershell
npm run dev      # Rodar em modo desenvolvimento
npm start        # Rodar em produção
```

### Frontend
```powershell
npm run dev      # Rodar em modo desenvolvimento
npm run build    # Build para produção
npm start        # Rodar versão de produção
```

---

## 🐛 Problemas Comuns

### ❌ Erro: "Não conectou ao banco de dados"
- Verifique se o PostgreSQL está rodando
- Confira a senha no arquivo `.env`
- Teste a conexão: `psql -U postgres -d barberpro`

### ❌ Erro: "Port 5000 already in use"
- Mude a porta no `.env`: `PORT=5001`
- Ou mate o processo: 
  ```powershell
  netstat -ano | findstr :5000
  taskkill /PID <número_do_pid> /F
  ```

### ❌ Erro: "Module not found"
- Delete `node_modules` e `package-lock.json`
- Execute novamente: `npm install`

### ❌ Frontend não carrega dados
- Verifique se o backend está rodando
- Confira a URL no `.env.local` do frontend
- Abra o console do navegador (F12) para ver erros

---

## 📚 Estrutura do Projeto

```
Barberpro-saas/
├── backend/
│   ├── src/
│   │   ├── config/          # Configurações e SQL
│   │   ├── controllers/     # Lógica das rotas
│   │   ├── middleware/      # Autenticação
│   │   ├── routes/          # Rotas da API
│   │   ├── services/        # WhatsApp e Cron
│   │   └── server.js        # Servidor principal
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── app/             # Páginas Next.js
│   │   ├── components/      # Componentes React
│   │   ├── lib/             # API client
│   │   └── styles/          # CSS global
│   ├── package.json
│   └── .env.local
│
└── README.md
```

---

## 🎯 Próximos Passos Após Rodar

1. ✅ Criar sua conta
2. ✅ Adicionar barbeiros
3. ✅ Cadastrar serviços
4. ✅ Adicionar clientes
5. ✅ Fazer agendamentos de teste
6. ✅ Conferir o dashboard

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do terminal
2. Confira se todas as dependências foram instaladas
3. Teste as rotas da API com Postman

---

**Desenvolvido com ❤️ para revolucionar a gestão de barbearias**

🚀 Bom desenvolvimento!
