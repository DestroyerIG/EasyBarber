# 🚀 GUIA DE DEPLOY - BarberPro SaaS

Este guia mostra como fazer o deploy do BarberPro SaaS em produção.

---

## 📋 CHECKLIST PRÉ-DEPLOY

### Backend
- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados PostgreSQL criado
- [ ] Migrations executadas
- [ ] JWT_SECRET forte e único
- [ ] WhatsApp API configurada
- [ ] CORS configurado para domínio de produção
- [ ] Logs estruturados
- [ ] Testes básicos executados

### Frontend
- [ ] API_URL apontando para backend de produção
- [ ] Build de produção testado localmente
- [ ] Variáveis de ambiente configuradas
- [ ] Favicon e meta tags configurados
- [ ] Analytics configurado (opcional)

### Segurança
- [ ] Senhas fortes no banco de dados
- [ ] SSL/HTTPS habilitado
- [ ] Rate limiting implementado
- [ ] Backup automático configurado
- [ ] Firewall configurado

---

## 🗄️ OPÇÃO 1: DEPLOY DO BANCO DE DADOS

### Railway (Recomendado - Fácil)

1. Acesse: https://railway.app
2. Crie uma conta
3. Clique em "New Project"
4. Escolha "Provision PostgreSQL"
5. Copie a `DATABASE_URL`

### Supabase (Gratuito + Recursos extras)

1. Acesse: https://supabase.com
2. Crie um projeto
3. Vá em "Database" > "Connection String"
4. Copie a connection string
5. Execute as migrations no SQL Editor

### Heroku Postgres

```bash
heroku addons:create heroku-postgresql:hobby-dev
heroku pg:psql < backend/src/config/database.sql
```

### Neon.tech (Serverless Postgres)

1. Acesse: https://neon.tech
2. Crie um projeto
3. Copie a connection string
4. Execute as migrations

---

## ⚙️ OPÇÃO 2: DEPLOY DO BACKEND

### Railway

1. Conecte seu repositório GitHub
2. Selecione a pasta `backend`
3. Configure as variáveis de ambiente:
   ```
   PORT=5000
   DATABASE_URL=sua_url_do_postgres
   JWT_SECRET=chave_super_segura
   WHATSAPP_API_KEY=sua_chave
   WHATSAPP_API_URL=sua_url
   NODE_ENV=production
   ```
4. Deploy automático!

**URL gerada:** `https://seu-app.railway.app`

---

### Render

1. Acesse: https://render.com
2. Conecte GitHub
3. "New" > "Web Service"
4. Root Directory: `backend`
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Adicione Environment Variables
8. Deploy!

---

### Heroku

```bash
# Instalar Heroku CLI
npm install -g heroku

# Login
heroku login

# Criar app
heroku create barberpro-backend

# Configurar variáveis
heroku config:set DATABASE_URL=sua_url
heroku config:set JWT_SECRET=sua_chave
heroku config:set WHATSAPP_API_KEY=sua_chave
heroku config:set WHATSAPP_API_URL=sua_url

# Deploy
git subtree push --prefix backend heroku main

# Ver logs
heroku logs --tail
```

---

### VPS (DigitalOcean, AWS, Azure)

```bash
# Conectar via SSH
ssh root@seu-ip

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Instalar PM2
npm install -g pm2

# Clonar repositório
git clone seu-repositorio
cd Barberpro-saas/backend

# Instalar dependências
npm install

# Criar arquivo .env
nano .env
# Cole suas variáveis

# Iniciar com PM2
pm2 start src/server.js --name barberpro-api
pm2 save
pm2 startup

# Configurar Nginx
apt-get install nginx

# Criar config
nano /etc/nginx/sites-available/barberpro

# Cole:
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Ativar
ln -s /etc/nginx/sites-available/barberpro /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# SSL com Let's Encrypt
apt-get install certbot python3-certbot-nginx
certbot --nginx -d api.seudominio.com
```

---

## 🎨 OPÇÃO 3: DEPLOY DO FRONTEND

### Vercel (Recomendado - Otimizado para Next.js)

1. Acesse: https://vercel.com
2. Conecte GitHub
3. Selecione o repositório
4. Root Directory: `frontend`
5. Framework Preset: Next.js (detectado automaticamente)
6. Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://sua-api.railway.app/api
   ```
7. Deploy!

**URL gerada:** `https://seu-app.vercel.app`

---

### Netlify

1. Acesse: https://netlify.com
2. "New site from Git"
3. Conecte GitHub
4. Base directory: `frontend`
5. Build command: `npm run build`
6. Publish directory: `.next`
7. Environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://sua-api.railway.app/api
   ```
8. Deploy!

---

### Cloudflare Pages

```bash
cd frontend
npm install -g wrangler

# Build
npm run build

# Deploy
npx wrangler pages publish .next
```

---

## 🔧 CONFIGURAÇÃO PÓS-DEPLOY

### 1. Testar API Backend

```bash
curl https://sua-api.com/api
# Deve retornar: {"message":"💈 BarberPro SaaS API","version":"1.0.0","status":"online"}
```

### 2. Testar Registro

```bash
curl -X POST https://sua-api.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "barbershopName": "Teste Deploy",
    "ownerName": "Admin",
    "email": "admin@teste.com",
    "whatsapp": "11999999999",
    "password": "senha123",
    "plan": "basico"
  }'
```

### 3. Testar Frontend

Acesse: `https://seu-frontend.vercel.app`

- [ ] Página de login carrega
- [ ] Consegue criar conta
- [ ] Consegue fazer login
- [ ] Dashboard carrega
- [ ] Gráficos aparecem

---

## 📱 CONFIGURAR WHATSAPP EM PRODUÇÃO

### Z-API

1. Acesse o painel: https://z-api.io
2. Instâncias > Configurações
3. Webhook URL: `https://sua-api.com/api/whatsapp/webhook`
4. Método: POST
5. Salvar

### Testar Webhook

```bash
curl -X POST https://sua-api.com/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "message": "oi",
    "barbershopId": "seu-uuid-aqui"
  }'
```

---

## 🔒 SEGURANÇA EM PRODUÇÃO

### 1. Rate Limiting

Instalar:
```bash
npm install express-rate-limit
```

Adicionar em `server.js`:
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // 100 requests por IP
});

app.use('/api/', limiter);
```

### 2. Helmet (Segurança Headers)

```bash
npm install helmet
```

```javascript
import helmet from 'helmet';
app.use(helmet());
```

### 3. CORS Restrito

```javascript
app.use(cors({
  origin: 'https://seu-frontend.vercel.app',
  credentials: true
}));
```

---

## 📊 MONITORAMENTO

### Sentry (Erros)

```bash
npm install @sentry/node
```

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: "sua_dsn_do_sentry",
  environment: process.env.NODE_ENV
});
```

### Logs

Use Winston para logs estruturados:

```bash
npm install winston
```

---

## 🔄 CI/CD (GitHub Actions)

Crie `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy Backend
      run: |
        # Comandos de deploy
        
    - name: Deploy Frontend
      run: |
        # Comandos de deploy
```

---

## 💾 BACKUP AUTOMÁTICO

### PostgreSQL Backup (Railway)

```bash
# Backup manual
railway database backup create

# Restaurar
railway database backup restore <id>
```

### Script de Backup Automático

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_$DATE.sql"

pg_dump $DATABASE_URL > $BACKUP_FILE

# Upload para S3/Google Cloud
# aws s3 cp $BACKUP_FILE s3://seu-bucket/
```

Agendar com cron:
```bash
0 2 * * * /caminho/backup.sh
```

---

## 📈 OTIMIZAÇÕES DE PERFORMANCE

### Backend
- [ ] Implementar cache com Redis
- [ ] Comprimir respostas (gzip)
- [ ] Otimizar queries SQL
- [ ] Adicionar índices no banco

### Frontend
- [ ] Lazy loading de componentes
- [ ] Otimizar imagens
- [ ] Code splitting
- [ ] Service Worker (PWA)

---

## 🧪 CHECKLIST FINAL

### Testes Manuais
- [ ] Criar conta
- [ ] Fazer login
- [ ] Ver dashboard
- [ ] Criar agendamento
- [ ] Adicionar cliente
- [ ] Registrar gasto
- [ ] Testar bot WhatsApp
- [ ] Receber lembrete
- [ ] Fazer logout

### Performance
- [ ] Lighthouse score > 90
- [ ] Tempo de resposta da API < 200ms
- [ ] Frontend carrega em < 3s

### SEO (Opcional)
- [ ] Meta tags configuradas
- [ ] sitemap.xml
- [ ] robots.txt
- [ ] Open Graph tags

---

## 🆘 TROUBLESHOOTING

### "Cannot connect to database"
- Verifique DATABASE_URL
- Certifique-se que o PostgreSQL está ativo
- Confira se o IP está permitido no firewall

### "CORS error"
- Configure CORS no backend
- Verifique a URL da API no frontend

### "502 Bad Gateway"
- Backend não está rodando
- Porta incorreta
- PM2/processo caiu

### "Build failed"
- Verifique node_modules
- Delete .next e reconstrua
- Confira as variáveis de ambiente

---

## 📞 CHECKLIST DE LANÇAMENTO

- [ ] Domínio personalizado configurado
- [ ] SSL ativo (HTTPS)
- [ ] Backup automático configurado
- [ ] Monitoramento ativo
- [ ] WhatsApp Business conectado
- [ ] Email transacional configurado
- [ ] Termos de uso e privacidade
- [ ] Página de suporte
- [ ] Documentação atualizada

---

## 🎉 DEPLOY COMPLETO!

Seu SaaS está no ar! 🚀

**URLs:**
- Frontend: `https://seu-app.vercel.app`
- Backend: `https://sua-api.railway.app`

---

**💈 Bom negócio com o BarberPro!**
