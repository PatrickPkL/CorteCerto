# Liga o PostgreSQL portátil do projeto (mantém o banco no ar).
# Uso: npm run db:start
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $root '.pg\pgsql\bin\pg_ctl.exe'
$data = Join-Path $root '.pg\data'
$log  = Join-Path $root '.pg\pg.log'

if (-not (Test-Path $data)) { Write-Host 'Banco ainda não inicializado (sem .pg/data).' -ForegroundColor Yellow; exit 1 }

if (Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue) {
  Write-Host 'PostgreSQL já está rodando na porta 5432.' -ForegroundColor Green
  exit 0
}

& $bin -D $data -l $log start
Start-Sleep -Seconds 2
if (Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue) {
  Write-Host 'PostgreSQL rodando em localhost:5432 ✓' -ForegroundColor Green
} else {
  Write-Host 'PostgreSQL ainda não respondeu. Veja o log em .pg\pg.log' -ForegroundColor Yellow
}