# Start Here

Guia de entrada rápida para qualquer dev que acabou de clonar o repositório.

## Ordem Recomendada de Leitura

1. README.md
2. QUICK_START.md
3. POSTGRESQL_SETUP.md
4. API_DOCS.md
5. DEPLOY.md

## Decisão Rápida de Ambiente

- Quer rodar local para desenvolver: QUICK_START.md + INSTALL.md.
- Quer preparar banco e migrations manualmente: POSTGRESQL_SETUP.md.
- Quer subir em produção: DEPLOY.md.
- Quer entender endpoints e contratos: API_DOCS.md.

## Checklist de Onboarding Técnico

- Instalar Node.js 20+, npm, PostgreSQL e Git.
- Configurar backend/.env e frontend/.env.local.
- Criar banco PostgreSQL com UTF-8.
- Executar SQL base + migrations na ordem recomendada.
- Subir backend e frontend.
- Validar /health e fluxo de login.

## Primeiros Comandos

```bash
npm run install:all
```

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

## Atenções Importantes

- A API oficial está em /api/v1.
- O backend exige JWT_SECRET e DATABASE_URL para iniciar.
- O arquivo database.sql sozinho não cobre todas as colunas/tabelas exigidas pelo módulo de WhatsApp e deve ser complementado por migrations.
- Execute as migrations ate a versao mais recente (atualmente migration_v15.sql), na ordem descrita em POSTGRESQL_SETUP.md.

## Mapa de Docs

- Setup completo: INSTALL.md
- Setup rápido: QUICK_START.md
- Banco e migrations: POSTGRESQL_SETUP.md
- Estrutura técnica: PROJECT_STRUCTURE.md
- API REST: API_DOCS.md
- Deploy: DEPLOY.md
- Diagnóstico de falhas: TROUBLESHOOTING.md
