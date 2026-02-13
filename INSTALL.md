# ⚡ INSTALAÇÃO RÁPIDA - BarberPro SaaS

## 🎯 RESUMO DE 3 PASSOS

### 1️⃣ INSTALAR POSTGRESQL

**Baixar:** https://www.postgresql.org/download/windows/

**Durante instalação:**
- ✅ Marcar todos os componentes
- ⚠️ **ANOTAR A SENHA** que você definir
- Porta: 5432 (padrão)

---

### 2️⃣ EXECUTAR SCRIPT DE CONFIGURAÇÃO

Após instalar o PostgreSQL, execute:

```powershell
.\setup.ps1
```

**O que o script faz:**
- ✅ Testa conexão PostgreSQL
- ✅ Cria banco `barberpro`
- ✅ Cria todas as 9 tabelas
- ✅ Configura arquivo `.env` do backend
- ✅ Configura arquivo `.env.local` do frontend

---

### 3️⃣ RODAR O PROJETO

**Backend (Terminal 1):**
```powershell
cd backend
npm install
npm run dev
```

Aguarde: `✅ Servidor rodando na porta 5000`

**Frontend (Terminal 2 - nova janela):**
```powershell
cd frontend
npm install
npm run dev
```

Aguarde: `✅ Ready on http://localhost:3000`

**Acessar:** http://localhost:3000

---

## 🆘 PROBLEMAS?

### ❌ "psql não é reconhecido"
**Solução:** Adicione ao PATH:
```powershell
$env:Path += ";C:\Program Files\PostgreSQL\16\bin"
```
Feche e reabra o terminal.

---

### ❌ "password authentication failed"
**Solução:** Senha incorreta no arquivo `.env`
1. Abra `backend\.env`
2. Corrija a senha na linha `DATABASE_URL`

---

### ❌ "ECONNREFUSED 127.0.0.1:5432"
**Solução:** PostgreSQL não está rodando
```powershell
# Verificar serviço
Get-Service postgresql*

# Iniciar se necessário
Start-Service "postgresql-x64-16"
```

---

### ❌ Script setup.ps1 não executa
**Solução:** Habilitar execução de scripts:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 📚 DOCUMENTAÇÃO COMPLETA

- **START_HERE.md** - Visão geral do projeto
- **QUICK_START.md** - Guia detalhado
- **POSTGRESQL_SETUP.md** - Instalação manual do PostgreSQL
- **API_DOCS.md** - Documentação da API (19 endpoints)
- **README.md** - Documentação principal
- **PLANOS.md** - Detalhes dos planos
- **WHATSAPP_BOT.md** - Configuração do bot
- **PROJECT_STRUCTURE.md** - Estrutura do código
- **DEPLOY.md** - Deploy em produção

---

## ✅ CHECKLIST

Antes de usar, verifique:

- [ ] PostgreSQL instalado
- [ ] Senha anotada
- [ ] Script `setup.ps1` executado com sucesso
- [ ] Backend iniciado (`npm run dev`)
- [ ] Frontend iniciado (`npm run dev`)
- [ ] Navegador em `http://localhost:3000`

---

## 🎉 PRONTO!

Agora você pode:

1. **Criar sua conta** - Clique em "Cadastre-se"
2. **Fazer login** - Use email e senha
3. **Explorar o dashboard** - Ver métricas
4. **Adicionar barbeiros** - Menu "Serviços"
5. **Cadastrar serviços** - Corte, barba, etc
6. **Criar agendamentos** - Testar o sistema

---

## 🤖 OPCIONAL: Configurar WhatsApp

Para ativar o bot de agendamentos:

1. Crie conta em: https://z-api.io
2. Conecte seu WhatsApp
3. Copie a URL e Token
4. Edite `backend\.env`:
   ```env
   WHATSAPP_API_URL=sua_url_aqui
   WHATSAPP_API_KEY=seu_token_aqui
   ```
5. Reinicie o backend

**Guia completo:** Leia `WHATSAPP_BOT.md`

---

## 🚀 DEPLOY (Opcional)

Quando estiver pronto para lançar:

1. **Backend:** Railway, Render ou Heroku
2. **Frontend:** Vercel ou Netlify
3. **Banco:** Railway, Supabase ou Heroku Postgres

**Guia completo:** Leia `DEPLOY.md`

---

## 💡 DICAS

- Use **pgAdmin** para visualizar o banco (interface gráfica)
- Use **Postman** para testar a API
- Leia **API_DOCS.md** para ver todos os endpoints
- Configure **backup automático** do banco

---

## 📞 SUPORTE

**Dúvidas?** Consulte a documentação:

1. Problema com PostgreSQL → `POSTGRESQL_SETUP.md`
2. Problema com a API → `API_DOCS.md`
3. Entender o projeto → `PROJECT_STRUCTURE.md`
4. Deploy → `DEPLOY.md`

---

**💈 Bom trabalho com o BarberPro SaaS!**
