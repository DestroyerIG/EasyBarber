# Relatório de Refatoração (Histórico)

Este arquivo é um registro histórico das principais refatorações do projeto. Ele não substitui a documentação operacional atual.

## Fontes Atuais de Verdade

Para onboarding, execução e deploy, priorize:

- README.md
- QUICK_START.md
- INSTALL.md
- POSTGRESQL_SETUP.md
- API_DOCS.md
- DEPLOY.md

## Marcos Registrados

- Versionamento da API em `/api/v1`.
- Padronização de respostas de sucesso e erro.
- Separação backend/frontend.
- Organização do backend em controller, service, repository, validators e middleware.
- Modularização do domínio WhatsApp.
- Evolução do schema por migrations SQL.
- Adoção de Supabase Auth como provedor obrigatório de identidade.
- Billing híbrido com Stripe e Asaas.
- Controle de acesso por plano e status de assinatura.
- Painel administrativo de plataforma com auditoria.

## Uso Recomendado

Use este documento apenas para contexto de evolução técnica e decisões passadas. Para comandos atuais, endpoints e variáveis de ambiente, consulte os guias principais.
