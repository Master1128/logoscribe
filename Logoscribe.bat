@echo off
rem Abre Logoscribe. Deja esta ventana abierta mientras lo usas; cierrala para apagarlo.
cd /d "%~dp0"
title Logoscribe
set URL=http://localhost:3131
curl.exe -s -o nul %URL% && (start "" %URL% & exit /b)
if not exist ".next.nosync\BUILD_ID" call pnpm build
start "" /b powershell -NoProfile -Command "do { Start-Sleep 1 } until (try { (Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }); Start-Process '%URL%'"
echo Logoscribe esta funcionando en %URL%
echo Deja esta ventana abierta mientras lo usas; cierrala para apagarlo.
call pnpm start
