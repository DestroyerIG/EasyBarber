# Quick Start

Fluxo mais curto para subir o projeto em ambiente de desenvolvimento.

## Pré-requisitos

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (recomendado 16)

## 1) Instalar dependências

```bash
git clone <url-do-repositorio>
cd Barberpro-saas-2.0
npm run install:all
```

## 2) Configurar variáveis de ambiente

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env.local
```

Edite backend/.env e frontend/.env.local conforme seu ambiente.

## 3) Preparar banco (obrigatório)

Banco novo: execute SQL base + migrations na ordem abaixo:

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
```

Se ainda não existe banco:

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

PowerShell (Windows):

```powershell
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v6.sql
```

## 4) Subir backend e frontend

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm run dev
```

## 5) Validar execução

- Frontend: http://localhost:3000
- Backend health: http://localhost:5000/health
- API base: http://localhost:5000/api/v1

## Docker (atalho)

```bash
docker compose up -d
```

Observação importante:

- O container de banco aplica automaticamente database.sql + migration_v3..v6 no primeiro bootstrap do volume.
- Se o volume já existia antes dessa configuração, aplique migrations manualmente ou recrie o volume.

## Próximo Passo

- Setup detalhado: INSTALL.md
- Banco e troubleshooting de migrations: POSTGRESQL_SETUP.md
