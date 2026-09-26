@echo off
rem Descarga la ultima version de Logoscribe. Cierra Logoscribe antes de ejecutarlo.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\actualizar.ps1"
if errorlevel 1 (
  echo.
  echo La actualizacion no termino. Revisa el mensaje de arriba.
)
pause
