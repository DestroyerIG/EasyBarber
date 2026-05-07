# Baseline Migration

Este diretório contém a migration de baseline — marca o estado atual do banco
como ponto de partida para o Prisma Migrate, SEM executar SQL no banco.

## Como aplicar (uma única vez por ambiente)

```bash
# 1. Garanta que DATABASE_URL aponta para o banco correto
echo $DATABASE_URL

# 2. Introspect o banco atual para confirmar alinhamento com schema.prisma
npx prisma db pull --print

# 3. Marcar baseline como já aplicada (NÃO executa SQL — só registra)
npx prisma migrate resolve --applied "0_init"

# 4. Verificar status
npx prisma migrate status
```

## Por que isso é necessário?

O banco já existe e foi criado via SQL manual (`database.sql` + migrações `migration_v*.sql`).
O Prisma não sabe disso. Sem o baseline, ele tentaria recriar todas as tabelas e falharia.

O `migrate resolve --applied "0_init"` diz ao Prisma:
> "Considere este estado como já aplicado. Gerencia apenas as mudanças a partir daqui."

## A partir daqui

Todas as mudanças de schema via:
```bash
npx prisma migrate dev --name <descricao_da_mudança>
```

Os arquivos `migration_v*.sql` em `src/config/` são legado — mantidos como histórico,
nunca mais executados manualmente.
