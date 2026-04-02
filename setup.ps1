# Script de Configuração Rápida do BarberPro SaaS
# Execute este script após instalar o PostgreSQL

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   CONFIGURACAO DO BARBERPRO SAAS" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Configuracoes de conexao
$pgHost = "127.0.0.1"
$pgPort = "5432"
$pgUser = "postgres"
$pgDatabase = "postgres"
$projectDatabase = "barberpro"

try {
    # 1. Verificar se PostgreSQL está instalado
    Write-Host "Verificando instalacao do PostgreSQL..." -ForegroundColor Cyan

    try {
        $pgVersion = & psql --version 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $pgVersion) {
            throw "psql nao encontrado"
        }
        Write-Host "PostgreSQL encontrado: $pgVersion" -ForegroundColor Green
    }
    catch {
        Write-Host "PostgreSQL NAO encontrado!" -ForegroundColor Red
        Read-Host "Instale o PostgreSQL e pressione ENTER"
        exit
    }

    # 2. Solicitar senha do PostgreSQL
    Write-Host ""
    Write-Host "Digite a senha do PostgreSQL (usuario postgres):" -ForegroundColor Cyan
    $pgPassword = Read-Host -AsSecureString

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword)
    try {
        $pgPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }

    if ([string]::IsNullOrWhiteSpace($pgPasswordText)) {
        Write-Host "Senha nao informada." -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    # 3. Testar conexão
    Write-Host ""
    Write-Host "Testando conexao..." -ForegroundColor Cyan
    $env:PGPASSWORD = $pgPasswordText

    $result = & psql -h $pgHost -p $pgPort -U $pgUser -d $pgDatabase -c "SELECT version();" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao conectar no PostgreSQL" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Conexao OK!" -ForegroundColor Green

    # 4. Criar banco
    Write-Host ""
    Write-Host "Recriando banco $projectDatabase..." -ForegroundColor Cyan

    & psql -h $pgHost -p $pgPort -U $pgUser -d $pgDatabase -c "DROP DATABASE IF EXISTS $projectDatabase;" 2>&1 | Out-Null
    $result = & psql -h $pgHost -p $pgPort -U $pgUser -d $pgDatabase -c "CREATE DATABASE $projectDatabase;" 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao criar banco" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Banco criado com sucesso!" -ForegroundColor Green

    # 5. Executar SQL
    $sqlFile = "backend/src/config/database.sql"

    if (-not (Test-Path $sqlFile)) {
        Write-Host "Arquivo SQL nao encontrado: $sqlFile" -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Criando tabelas..." -ForegroundColor Cyan
    $result = & psql -h $pgHost -p $pgPort -U $pgUser -d $projectDatabase -f $sqlFile 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erro ao criar tabelas" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Read-Host "Pressione ENTER para sair"
        exit
    }

    Write-Host "Tabelas criadas com sucesso!" -ForegroundColor Green

    # 6. Criar .env backend
    $envFile = "backend\.env"
    $escapedPassword = [Uri]::EscapeDataString($pgPasswordText)
    $databaseUrl = "postgresql://${pgUser}:${escapedPassword}@${pgHost}:${pgPort}/${projectDatabase}"
    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

    @"
PORT=5000
DATABASE_URL=$databaseUrl
JWT_SECRET=$jwtSecret
NODE_ENV=development
"@ | Out-File -FilePath $envFile -Encoding UTF8

    Write-Host ".env backend criado com sucesso!" -ForegroundColor Green

    # 7. Criar .env.local frontend
    $envLocalFile = "frontend\.env.local"
    "NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1" | Out-File -FilePath $envLocalFile -Encoding UTF8

    Write-Host ".env.local frontend criado com sucesso!" -ForegroundColor Green

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "CONFIGURACAO CONCLUIDA!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Read-Host "Pressione ENTER para finalizar"