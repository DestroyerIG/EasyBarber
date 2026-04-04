# Instalação Completa

Guia completo para instalação local do projeto em Linux, macOS ou Windows.

## 1. Pré-requisitos

- Node.js 20+
- npm 10+
- PostgreSQL 14+ (recomendado 16)
- Git

Verificações:

```bash
node -v
npm -v
psql --version
git --version
```

## 2. Clonar o Repositório

```bash
git clone <url-do-repositorio>
cd Barberpro-saas-2.0
```

## 3. Instalar Dependências

Opção única:

```bash
npm run install:all
```

Ou manual:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 4. Configurar Arquivos de Ambiente

### Backend

```bash
cp backend/.env.example backend/.env
```

Editar backend/.env com no mínimo:

```env
PORT=5000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=postgresql://postgres:senha@localhost:5432/barberpro
JWT_SECRET=troque_esta_chave
FRONTEND_URL=http://localhost:3000
```

### Frontend

```bash
cp frontend/.env.example frontend/.env.local
```

Configuração mínima:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_WHATSAPP_CONTACT_URL=https://wa.me/5500000000000?text=Ola
```

## 5. Preparar Banco de Dados

### 5.1 Criar banco UTF-8

Linux/macOS:

```bash
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
```

Windows PowerShell:

```powershell
createdb -h localhost -p 5432 -U postgres --encoding=UTF8 barberpro
```

### 5.2 Garantir extensão para UUID

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### 5.3 Aplicar schema e migrations

Sequência recomendada para ambiente novo:

1. backend/src/config/database.sql
2. backend/src/config/migration_v3.sql
3. backend/src/config/migration_v4.sql
4. backend/src/config/migration_v5.sql
5. backend/src/config/migration_v6.sql

Linux/macOS:

```bash
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f backend/src/config/migration_v6.sql
```

Windows PowerShell:

```powershell
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\database.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v3.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v4.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v5.sql
psql -h localhost -p 5432 -U postgres -d barberpro -v ON_ERROR_STOP=1 -f .\backend\src\config\migration_v6.sql
```

Observação:

- migration_v2.sql é migração de compatibilidade com schema legado e não costuma ser necessária para banco novo.

## 6. Subir Ambiente de Desenvolvimento

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

## 7. Validar Setup

- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- Health check: http://localhost:5000/health

Teste básico da API:

```bash
curl http://localhost:5000/health
```

Para acesso rápido no ambiente local, execute no diretório backend:

```bash
npm run seed:test-users
```

As credenciais e permissões dos usuários padrão de desenvolvimento estão centralizadas em README.md, na seção "Usuários de teste (ambiente local)".

## 8. Executar Testes

Backend:

```bash
cd backend
npm test
```

Frontend lint:

```bash
cd frontend
npm run lint
```

## 9. Setup com Docker (Opcional)

```bash
docker compose up -d
```

O compose atual aplica database.sql + migration_v3..v6 no primeiro bootstrap do volume.
Se o volume do PostgreSQL já existia antes dessa configuração, aplique as migrations manualmente ou recrie o volume.

## 10. Ordem Correta de Setup (Resumo)

1. Clonar repositório.
2. Instalar dependências.
3. Configurar backend/.env e frontend/.env.local.
4. Criar banco e aplicar SQL/migrations.
5. Subir backend.
6. Subir frontend.
7. Validar /health e fluxo de login.

## Documentos Relacionados

- Setup rápido: QUICK_START.md
- Banco e migrations detalhadas: POSTGRESQL_SETUP.md
- Problemas frequentes: TROUBLESHOOTING.md
