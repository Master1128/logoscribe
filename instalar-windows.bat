@echo off
rem Instalador de Logoscribe para Windows. Doble clic para ejecutarlo.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\instalar.ps1"
if errorlevel 1 (
  echo.
  echo La instalacion no termino. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
start "" "%~dp0Logoscribe.bat"
pause
