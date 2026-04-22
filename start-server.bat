@echo off
setlocal

if /I not "%~1"=="__run" (
  start "LRS Server" cmd /k ""%~f0" __run"
  exit /b 0
)

set "PHP_EXE=C:\php-8.3.14-nts-Win32-vs16-x64\php.exe"
set "PHP_INI=%~dp0php.ini"

if not exist "%PHP_EXE%" (
  echo PHP executable not found at "%PHP_EXE%".
  exit /b 1
)

if not exist "%PHP_INI%" (
  echo php.ini not found at "%PHP_INI%".
  exit /b 1
)

echo Starting PHP server with config: %PHP_INI%
echo Open: http://127.0.0.1:8000

"%PHP_EXE%" -c "%PHP_INI%" -S 127.0.0.1:8000
