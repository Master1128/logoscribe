@echo off
rem Descarga la ultima version de Logoscribe. Cierra Logoscribe antes de ejecutarlo.
cd /d "%~dp0"
echo === Actualizando Logoscribe ===
git pull --ff-only || goto :error
call pnpm install || goto :error
call pnpm build || goto :error
echo === Listo. Ya puedes abrir Logoscribe. ===
pause
exit /b 0
:error
echo La actualizacion no termino. Revisa el mensaje de arriba.
pause
exit /b 1
