# One-line installer for Logoscribe (Windows). Usage, in PowerShell:
#   irm https://raw.githubusercontent.com/Master1128/logoscribe/main/scripts/windows/instalar-web.ps1 | iex
# Downloading this way avoids the SmartScreen warning on .bat files.
# (ASCII only: this file is run through Invoke-Expression.)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$dest = Join-Path $env:USERPROFILE "Logoscribe"
$tmp = Join-Path $env:TEMP ("logoscribe-" + [guid]::NewGuid())

Write-Host "=== Descargando Logoscribe en $dest ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Force $tmp, $dest | Out-Null
Invoke-WebRequest "https://github.com/Master1128/logoscribe/archive/refs/heads/main.zip" -OutFile "$tmp\logoscribe.zip"
Expand-Archive "$tmp\logoscribe.zip" "$tmp\nuevo" -Force
Copy-Item (Join-Path "$tmp\nuevo\logoscribe-main" "*") -Destination $dest -Recurse -Force
Remove-Item $tmp -Recurse -Force

powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dest "scripts\windows\instalar.ps1")
if ($LASTEXITCODE -ne 0) { throw "La instalacion no termino. Revisa el mensaje de arriba." }
Start-Process (Join-Path $dest "Logoscribe.bat")
