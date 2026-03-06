# Script de Configuração Rápida do BarberPro SaaS
# Execute este script após instalar o PostgreSQL

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   CONFIGURACAO DO BARBERPRO SAAS" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# 1. Verificar se PostgreSQL está instalado
Write-Host "Verificando instalacao do PostgreSQL..." -ForegroundColor Cyan

try {
    $pgVersion = & psql --version 2>$null
    Write-Host "PostgreSQL encontrado: $pgVersion" -ForegroundColor Green
} catch {
    Write-Host "PostgreSQL NAO encontrado!" -ForegroundColor Red
    Read-Host "Instale o PostgreSQL e pressione ENTER"
    exit
}

# 2. Solicitar senha do PostgreSQL
Write-Host ""
Write-Host "Digite a senha do PostgreSQL (usuario postgres):" -ForegroundColor Cyan
$pgPassword = Read-Host -AsSecureString
$pgPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword)
)

# 3. Testar conexão
Write-Host ""
Write-Host "Testando conexao..." -ForegroundColor Cyan
$env:PGPASSWORD = $pgPasswordText

$result = & psql -U postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao conectar no PostgreSQL" -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit
}

Write-Host "Conexao OK!" -ForegroundColor Green

# 4. Criar banco
Write-Host ""
Write-Host "Criando banco barberpro..." -ForegroundColor Cyan
& psql -U postgres -c "DROP DATABASE IF EXISTS barberpro;" 2>&1 | Out-Null
$result = & psql -U postgres -c "CREATE DATABASE barberpro;" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao criar banco" -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit
}

Write-Host "Banco criado com sucesso!" -ForegroundColor Green

# 5. Executar SQL
$sqlFile = "backend\src\config\database.sql"

if (-not (Test-Path $sqlFile)) {
    Write-Host "Arquivo SQL nao encontrado: $sqlFile" -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit
}

Write-Host "Criando tabelas..." -ForegroundColor Cyan
$result = & psql -U postgres -d barberpro -f $sqlFile 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao criar tabelas" -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    Read-Host "Pressione ENTER para sair"
    exit
}

Write-Host "Tabelas criadas com sucesso!" -ForegroundColor Green

# 6. Criar .env backend
$envFile = "backend\.env"
$databaseUrl = "postgresql://postgres:$pgPasswordText@localhost:5432/barberpro"
$jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})

@"
PORT=5000
DATABASE_URL=$databaseUrl
JWT_SECRET=$jwtSecret
NODE_ENV=development
"@ | Out-File -FilePath $envFile -Encoding UTF8

Write-Host ".env criado com sucesso!" -ForegroundColor Green

# 7. Criar .env.local frontend
$envLocalFile = "frontend\.env.local"
"NEXT_PUBLIC_API_URL=http://localhost:5000/api" | Out-File -FilePath $envLocalFile -Encoding UTF8

Write-Host ".env.local criado com sucesso!" -ForegroundColor Green

$env:PGPASSWORD = ""

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "CONFIGURACAO CONCLUIDA!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

Read-Host "Pressione ENTER para finalizar"
