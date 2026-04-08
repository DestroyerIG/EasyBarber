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

    $escapedPassword = [Uri]::EscapeDataString($pgPasswordText)
    $newDatabaseUrl = "postgresql://postgres:$escapedPassword@localhost:5432/barberpro"
    $newContent = $content -replace "DATABASE_URL=.*", "DATABASE_URL=$newDatabaseUrl"

    # Remove variaveis legadas nao utilizadas pelo backend atual
    $newContent = $newContent -replace "(?m)^WHATSAPP_API_KEY=.*\r?\n?", ""
    $newContent = $newContent -replace "(?m)^WHATSAPP_API_URL=.*\r?\n?", ""

    # Alinha nome da variavel de timeout com o que o backend le
    $newContent = $newContent -replace "(?m)^DB_CONNECTION_TIMEOUT=", "DB_CONNECT_TIMEOUT="

    if ($newContent -notmatch "(?m)^FRONTEND_URL=") {
        $newContent = $newContent.TrimEnd() + "`r`nFRONTEND_URL=http://localhost:3000`r`n"
    }

    if ($newContent -notmatch "(?m)^APP_URL=") {
        $newContent = $newContent.TrimEnd() + "`r`nAPP_URL=http://localhost:3000`r`n"
    }

    if ($newContent -notmatch "(?m)^AUTH_PROVIDER_MODE=") {
        $newContent = $newContent.TrimEnd() + "`r`nAUTH_PROVIDER_MODE=dual`r`n"
    }

    if ($newContent -notmatch "(?m)^SUPABASE_URL=") {
        $newContent = $newContent.TrimEnd() + "`r`nSUPABASE_URL=`r`n"
    }

    if ($newContent -notmatch "(?m)^SUPABASE_ANON_KEY=") {
        $newContent = $newContent.TrimEnd() + "`r`nSUPABASE_ANON_KEY=`r`n"
    }

    if ($newContent -notmatch "(?m)^AUTH_SUPABASE_REDIRECT_TO=") {
        $newContent = $newContent.TrimEnd() + "`r`nAUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm`r`n"
    }

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
DATABASE_URL=postgresql://postgres:$([Uri]::EscapeDataString($pgPasswordText))@localhost:5432/barberpro
JWT_SECRET=$jwtSecret
NODE_ENV=development
LOG_LEVEL=info
FRONTEND_URL=http://localhost:3000
APP_URL=http://localhost:3000
AUTH_PROVIDER_MODE=dual
SUPABASE_URL=
SUPABASE_ANON_KEY=
AUTH_SUPABASE_REDIRECT_TO=http://localhost:3000/auth/confirm
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
