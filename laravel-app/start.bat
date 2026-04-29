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
start "Laravel Server" cmd /k "cd /d "%APP_DIR%" && php artisan serve"
start "Vite Dev Server" cmd /k "cd /d "%APP_DIR%" && npm run dev"

exit /b 0
