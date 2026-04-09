$phpIni = Join-Path $PSScriptRoot "php.ini"

if (-not (Test-Path $phpIni)) {
  Write-Error "Missing php.ini at $phpIni"
  exit 1
}

Write-Host "Starting PHP server with config: $phpIni"
Write-Host "Open: http://127.0.0.1:8000"

php -c $phpIni -S 127.0.0.1:8000
