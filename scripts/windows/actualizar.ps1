# Actualiza Logoscribe (lo ejecuta actualizar-windows.bat).
# Tus prédicas no se tocan: están guardadas en %LOCALAPPDATA%\Logoscribe.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$root = (Get-Location).Path

Write-Host "=== Actualizando Logoscribe ===" -ForegroundColor Cyan
if ((Test-Path (Join-Path $root ".git")) -and (Get-Command git -ErrorAction SilentlyContinue)) {
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { throw "Fallo git pull" }
} else {
  # Descargado como ZIP: se baja la versión nueva y se copia encima.
  $tmp = Join-Path $env:TEMP ("logoscribe-update-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Invoke-WebRequest "https://github.com/Master1128/logoscribe/archive/refs/heads/main.zip" -OutFile "$tmp\logoscribe.zip"
  Expand-Archive "$tmp\logoscribe.zip" "$tmp\nuevo" -Force
  Copy-Item (Join-Path "$tmp\nuevo\logoscribe-main" "*") -Destination $root -Recurse -Force
  Remove-Item $tmp -Recurse -Force
}

pnpm install
if ($LASTEXITCODE -ne 0) { throw "Fallo pnpm install" }
pnpm build
if ($LASTEXITCODE -ne 0) { throw "Fallo pnpm build" }
Write-Host "=== Listo. Ya puedes abrir Logoscribe. ===" -ForegroundColor Green
