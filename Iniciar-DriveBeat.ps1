# Iniciar-DriveBeat.ps1

Set-Location "C:\DriveBeat"

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro durante o build. O DriveBeat não será iniciado." -ForegroundColor Red
    pause
    exit $LASTEXITCODE
}

$env:NODE_ENV = "production"

npm start