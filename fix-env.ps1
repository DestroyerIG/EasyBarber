# Script para Corrigir o arquivo .env do Backend

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "            CORRECAO DO ARQUIVO .ENV" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Caminho do arquivo .env
$envFile = "backend\.env"

if (Test-Path $envFile) {

    Write-Host "Arquivo .env encontrado" -ForegroundColor Green
    Write-Host ""

    # Ler o conteudo atual
    $content = Get-Content $envFile -Raw

    Write-Host "Verificando configuracao atual..." -ForegroundColor Cyan
    Write-Host ""

    $lines = Get-Content $envFile
    foreach ($line in $lines) {
        if ($line -match "^DATABASE_URL=") {
            $dbUrl = $line -replace "DATABASE_URL=", ""

            if ($dbUrl -match ":([^@]+)@") {
                $password = $matches[1]
                $maskedPassword = $password.Substring(0, [Math]::Min(3, $password.Length)) + "****"
                $maskedUrl = $dbUrl -replace ":$password@", ":$maskedPassword@"
                Write-Host "Atual: $maskedUrl" -ForegroundColor Yellow
            }
        }
    }

    Write-Host ""
    Write-Host "------------------------------------------------------------" -ForegroundColor Gray
    Write-Host ""

    Write-Host "Digite a senha do PostgreSQL:" -ForegroundColor Cyan
    $pgPassword = Read-Host -AsSecureString
    $pgPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword)
    )

    Write-Host ""
    Write-Host "Corrigindo arquivo .env..." -ForegroundColor Cyan

    $newDatabaseUrl = "postgresql://postgres:$pgPasswordText@localhost:5432/barberpro"
    $newContent = $content -replace "DATABASE_URL=.*", "DATABASE_URL=$newDatabaseUrl"

    $newContent | Set-Content $envFile

    Write-Host ""
    Write-Host "Arquivo .env corrigido com sucesso!" -ForegroundColor Green
    Write-Host "Nova configuracao:"
    Write-Host "DATABASE_URL=postgresql://postgres:****@localhost:5432/barberpro" -ForegroundColor Green
    Write-Host ""

} else {

    Write-Host "Arquivo .env nao encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Criando novo arquivo .env..." -ForegroundColor Yellow
    Write-Host ""

    Write-Host "Digite a senha do PostgreSQL:" -ForegroundColor Cyan
    $pgPassword = Read-Host -AsSecureString
    $pgPasswordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword)
    )

    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})

    $envContent = @"
PORT=5000
DATABASE_URL=postgresql://postgres:$pgPasswordText@localhost:5432/barberpro
JWT_SECRET=$jwtSecret
WHATSAPP_API_KEY=configurar_depois
WHATSAPP_API_URL=https://api.z-api.io/instances/SEU_ID
NODE_ENV=development
"@

    $envContent | Out-File -FilePath $envFile -Encoding UTF8

    Write-Host ""
    Write-Host "Arquivo .env criado com sucesso!" -ForegroundColor Green
}

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Gray
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Magenta
Write-Host ""
Write-Host "1. O backend vai reiniciar automaticamente (nodemon)"
Write-Host "2. Aguarde aparecer: Conectado ao banco de dados"
Write-Host "3. Tente cadastrar a barbearia novamente"
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Gray
Write-Host ""

Read-Host "Pressione ENTER para continuar"
