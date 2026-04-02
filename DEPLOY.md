# 🚀 GUIA DE DEPLOY - EasyBarber

Guia para deploy do EasyBarber em produção.

---

## 📋 CHECKLIST PRÉ-DEPLOY

### Obrigatório
- [ ] `JWT_SECRET` forte e único (mín. 32 caracteres)
- [ ] `DATABASE_URL` de produção configurada
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL` configurada no backend (para CORS)
- [ ] Banco PostgreSQL com tabelas + migrations criadas
- [ ] SSL/HTTPS habilitado
- [ ] Backup do banco configurado

### Recomendado
- [ ] Monitoramento de erros (Sentry)
- [ ] Logging centralizado
- [ ] CI/CD configurado
- [ ] DNS configurado

---

## 🐳 OPÇÃO 1: DOCKER COMPOSE (Mais Simples)

### 1. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
DB_PASSWORD=senha_forte_do_banco
JWT_SECRET=chave_jwt_super_segura_com_32_caracteres_ou_mais
```

### 2. Subir serviços

```bash
docker compose up -d
```

Isso inicia:
- **PostgreSQL 16** (porta 5432) com volume persistente
- **Backend Node.js** (porta 5000) com health check no banco
- **Frontend Next.js** (porta 3000) em modo standalone

### 3. Verificar

```bash
# Ver logs
docker compose logs -f

# Health check
curl http://localhost:5000/health
```

### 4. Em produção com domínio

Adicione um proxy reverso (Nginx, Traefik, Caddy) na frente:

```nginx
# Exemplo Nginx
server {
    listen 80;
    server_name api.seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/api.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.seudominio.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## ☁️ OPÇÃO 2: CLOUD SERVICES

### 🗄️ Banco de dados

| Serviço | Tipo | Gratuito |
|---|---|---|
| [Railway](https://railway.app) | PostgreSQL gerenciado | Sim (limitado) |
| [Supabase](https://supabase.com) | PostgreSQL + extras | Sim (500MB) |
| [Neon.tech](https://neon.tech) | Serverless Postgres | Sim (512MB) |
| [Render](https://render.com) | PostgreSQL gerenciado | Sim (90 dias) |

**Após criar o banco, execute as migrations:**
```bash
psql "sua_connection_string" -f backend/src/config/database.sql
psql "sua_connection_string" -f backend/src/config/migration_v2.sql
psql "sua_connection_string" -f backend/src/config/migration_v3.sql
psql "sua_connection_string" -f backend/src/config/migration_v4.sql
psql "sua_connection_string" -f backend/src/config/migration_v5.sql
psql "sua_connection_string" -f backend/src/config/migration_v6.sql
```

### ⚙️ Backend

#### Railway
1. Conecte o repositório GitHub
2. Root Directory: `backend`
3. Variáveis de ambiente:
   ```
   PORT=5000
   DATABASE_URL=postgresql://...
   JWT_SECRET=sua_chave_secreta
   FRONTEND_URL=https://seu-frontend.vercel.app
    STRIPE_SECRET_KEY=sk_live_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    STRIPE_PRICE_ID_BASICO=price_...
    STRIPE_PRICE_ID_PROFISSIONAL=price_...
    STRIPE_PRICE_ID_PREMIUM=price_...
   NODE_ENV=production
   ```
4. Deploy automático a cada push

#### Render
1. New > Web Service
2. Root Directory: `backend`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Adicione as variáveis de ambiente

### 🎨 Frontend

#### Vercel (Recomendado)
1. Conecte o repositório GitHub
2. Root Directory: `frontend`
3. Framework Preset: Next.js (detectado automaticamente)
4. Variáveis de ambiente:
   ```
    NEXT_PUBLIC_API_URL=https://sua-api.railway.app/api/v1
   ```
5. Deploy automático a cada push

#### Netlify
1. New site from Git
2. Base directory: `frontend`
3. Build command: `npm run build`
4. Publish directory: `.next`
5. Variáveis de ambiente:
   ```
    NEXT_PUBLIC_API_URL=https://sua-api.railway.app/api/v1
   ```

---

## 🖥️ OPÇÃO 3: VPS (DigitalOcean, AWS, Azure)

### 1. Preparar servidor

```bash
# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Instalar PM2
npm install -g pm2

# Instalar PostgreSQL
apt-get install postgresql postgresql-contrib

# Configurar PostgreSQL
sudo -u postgres createdb barberpro
sudo -u postgres psql -d barberpro -f backend/src/config/database.sql
sudo -u postgres psql -d barberpro -f backend/src/config/migration_v2.sql
sudo -u postgres psql -d barberpro -f backend/src/config/migration_v3.sql
sudo -u postgres psql -d barberpro -f backend/src/config/migration_v4.sql
sudo -u postgres psql -d barberpro -f backend/src/config/migration_v5.sql
sudo -u postgres psql -d barberpro -f backend/src/config/migration_v6.sql
```

### 2. Deploy Backend

```bash
cd easybarber-saas/backend
npm install --production

# Criar .env com variáveis de produção
cat > .env << 'EOF'
PORT=5000
DATABASE_URL=postgresql://postgres:senha@localhost:5432/barberpro
JWT_SECRET=sua_chave_secreta_longa
FRONTEND_URL=https://seudominio.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BASICO=price_...
STRIPE_PRICE_ID_PROFISSIONAL=price_...
STRIPE_PRICE_ID_PREMIUM=price_...
NODE_ENV=production
EOF

# Iniciar com PM2
pm2 start src/server.js --name easybarber-api
pm2 save
pm2 startup
```

### 3. Deploy Frontend

```bash
cd easybarber-saas/frontend

# Criar .env.local
echo "NEXT_PUBLIC_API_URL=https://api.seudominio.com/api/v1" > .env.local

npm install
npm run build
pm2 start npm --name easybarber-web -- start
pm2 save
```

### 4. Configurar Nginx + SSL

```bash
apt-get install nginx certbot python3-certbot-nginx

# Config Backend
cat > /etc/nginx/sites-available/easybarber-api << 'EOF'
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Config Frontend
cat > /etc/nginx/sites-available/easybarber-web << 'EOF'
server {
    listen 80;
    server_name seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# Ativar
ln -s /etc/nginx/sites-available/easybarber-api /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/easybarber-web /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# SSL
certbot --nginx -d api.seudominio.com -d seudominio.com
```

---

## 🔧 VARIÁVEIS DE AMBIENTE

### Backend (`backend/.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | Não | Porta do servidor (padrão: 5000) |
| `DATABASE_URL` | Sim | Connection string do PostgreSQL |
| `JWT_SECRET` | Sim | Chave secreta para tokens JWT |
| `NODE_ENV` | Não | `development` ou `production` |
| `FRONTEND_URL` | Não | URL do frontend para CORS (padrão: http://localhost:3000) |
| `STRIPE_SECRET_KEY` | Sim (billing) | Chave secreta da API Stripe |
| `STRIPE_WEBHOOK_SECRET` | Sim (billing) | Segredo de assinatura do webhook Stripe |
| `STRIPE_PRICE_ID_BASICO` | Sim (billing) | Price ID do plano Básico |
| `STRIPE_PRICE_ID_PROFISSIONAL` | Sim (billing) | Price ID do plano Profissional |
| `STRIPE_PRICE_ID_PREMIUM` | Sim (billing) | Price ID do plano Premium |
| `DB_POOL_MIN` | Não | Conexões mínimas no pool (padrão: 2) |
| `DB_POOL_MAX` | Não | Conexões máximas no pool (padrão: 20) |
| `DB_IDLE_TIMEOUT` | Não | Timeout de conexão ociosa em ms (padrão: 30000) |
| `DB_CONNECT_TIMEOUT` | Não | Timeout de conexão em ms (padrão: 5000) |
| `DB_STATEMENT_TIMEOUT` | Não | Timeout de query em ms (padrão: 30000) |
| `DB_CA_CERT` | Não | Certificado CA para SSL em produção |

### Frontend (`frontend/.env.local`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Sim | URL da API do backend (ex: `http://localhost:5000/api/v1`) |
| `NEXT_PUBLIC_WHATSAPP_CONTACT_URL` | Sim | URL do WhatsApp comercial para CTA público |

### Docker Compose (`.env` na raiz)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_PASSWORD` | Não | Senha do PostgreSQL (padrão: `changeme`) |
| `JWT_SECRET` | Sim | Chave secreta JWT |

---

## 🔒 SEGURANÇA EM PRODUÇÃO

O sistema já inclui:
- ✅ Helmet (headers de segurança)
- ✅ Rate limiting (100 req/15min, 20 req/15min para auth)
- ✅ CORS configurado
- ✅ CSP no frontend
- ✅ HSTS habilitado
- ✅ Cookies httpOnly para tokens
- ✅ Validação Zod em todas as entradas
- ✅ Queries parametrizadas (anti SQL injection)
- ✅ Graceful shutdown
- ✅ Logging estruturado (Pino)

### Recomendaçoes adicionais
- Use senha forte no `DB_PASSWORD`
- Gere `JWT_SECRET` com pelo menos 32 caracteres aleatórios
- Habilite backups automáticos do banco
- Configure firewall para permitir apenas portas 80/443
- Use monitor de erros (Sentry, Datadog)

---

## ✅ VERIFICAR DEPLOY

### 1. Health check

```bash
curl https://sua-api.com/health
# { "status": "ok", "db": "connected", "uptime": 123.45 }
```

### 2. Testar registro

```bash
curl -X POST https://sua-api.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "barbershopName": "Teste Deploy",
    "ownerName": "Admin",
    "email": "admin@teste.com",
    "whatsapp": "11999999999",
    "password": "Senha123"
  }'
```

### 3. Testar frontend

Acesse `https://seudominio.com`:
- [ ] Página de login carrega
- [ ] Consegue criar conta
- [ ] Consegue fazer login
- [ ] Dashboard carrega com gráficos
