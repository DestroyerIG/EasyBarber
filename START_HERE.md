# Start Here

Guia de entrada para devs que acabaram de clonar o EasyBarber SaaS 2.0.

## Ordem Recomendada de Leitura

1. README.md
2. QUICK_START.md
3. POSTGRESQL_SETUP.md
4. API_DOCS.md
5. DEPLOY.md

## Decisão Rápida

- Rodar local para desenvolver: QUICK_START.md.
- Instalar tudo com mais contexto: INSTALL.md.
- Preparar ou corrigir banco: POSTGRESQL_SETUP.md.
- Entender endpoints REST: API_DOCS.md.
- Publicar em produção: DEPLOY.md.
- Diagnosticar falhas: TROUBLESHOOTING.md.

## Checklist de Onboarding

- Instalar Node.js 20+, npm 10+, PostgreSQL 14+ e Git.
- Instalar dependências com `npm run install:all`.
- Criar `backend/.env` e `frontend/.env.local` a partir dos exemplos.
- Configurar Supabase Auth: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e redirects.
- Criar banco PostgreSQL em UTF-8 e habilitar `pgcrypto`.
- Aplicar `database.sql` e as migrations atuais até `migration_v18_asaas_customer_id.sql`.
- Subir backend e frontend.
- Validar `GET /health`, cadastro, confirmação de e-mail e login.

## Primeiros Comandos

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

## Atenções Importantes

- A API canônica é `/api/v1`; chamadas para `/api/*` são redirecionadas com HTTP 301.
- Supabase Auth é obrigatório para cadastro, confirmação de e-mail e login.
- `AUTH_PROVIDER_MODE` é obsoleto e deve ser removido de ambientes novos.
- SMTP é opcional e não é usado para verificação de autenticação.
- `database.sql` sozinho não cobre o schema atual; aplique todas as migrations listadas em POSTGRESQL_SETUP.md.
- O `docker-compose.yml` e `setup.ps1` atuais aplicam automaticamente até `migration_v15.sql`; em bancos criados por eles, aplique v16, v17 e v18 manualmente até esses scripts serem atualizados.

## Mapa de Docs

- README.md: visão geral, stack, fluxos e comandos principais.
- QUICK_START.md: caminho curto para subir local.
- INSTALL.md: instalação completa.
- POSTGRESQL_SETUP.md: banco, migrations e comandos SQL.
- PROJECT_STRUCTURE.md: organização técnica do repositório.
- API_DOCS.md: endpoints, auth, respostas e webhooks.
- PLANOS.md: planos, features e status de assinatura.
- WHATSAPP_BOT.md: integração Evolution API e bot.
- DEPLOY.md: produção, envs, build, webhooks e rollback.
- TROUBLESHOOTING.md: diagnóstico de erros comuns.
- FIX_CADASTRO.md: checklist rápido para problemas de cadastro/login.
