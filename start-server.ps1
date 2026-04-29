$phpIni = Join-Path $PSScriptRoot "php.ini"
$phpExe = "C:\php-8.3.14-nts-Win32-vs16-x64\php.exe"

if (-not (Test-Path $phpIni)) {
  Write-Error "Missing php.ini at $phpIni"
  exit 1
}

if (-not (Test-Path $phpExe)) {
  Write-Error "Missing PHP executable at $phpExe"
  exit 1
}

Write-Host "Starting PHP server with config: $phpIni"
Write-Host "Open: http://127.0.0.1:8000"

& $phpExe -c $phpIni -S 127.0.0.1:8000
