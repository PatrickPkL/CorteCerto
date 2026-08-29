# Desliga o PostgreSQL portátil do projeto.
# Uso: npm run db:stop
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$bin  = Join-Path $root '.pg\pgsql\bin'
$data = Join-Path $root '.pg\data'

if (-not (Test-Path $data)) { Write-Host 'Banco ainda não inicializado.'; exit 0 }
& (Join-Path $bin 'pg_ctl.exe') -D $data stop
Write-Host 'PostgreSQL parado.'