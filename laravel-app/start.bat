@echo off
setlocal

set "APP_DIR=%~dp0"

if not exist "%APP_DIR%artisan" (
  echo Laravel artisan file not found in "%APP_DIR%".
  exit /b 1
)

where php >nul 2>nul
if errorlevel 1 (
  echo PHP was not found in PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found in PATH.
  exit /b 1
)

if not exist "%APP_DIR%node_modules" (
  echo node_modules was not found. Run "npm install" in the Laravel app first.
  exit /b 1
)

echo Starting Laravel server and Vite dev server...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Process php -WorkingDirectory '%APP_DIR%' -ArgumentList 'artisan','serve' -WindowStyle Hidden"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Process npm -WorkingDirectory '%APP_DIR%' -ArgumentList 'run','dev' -WindowStyle Hidden"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:8000'"

exit /b 0
