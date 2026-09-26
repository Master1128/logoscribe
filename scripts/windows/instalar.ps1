# Instalador de Logoscribe para Windows (lo ejecuta instalar-windows.bat).
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # la barra de progreso hace muy lentas las descargas
Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$root = (Get-Location).Path

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Winget($id) {
  winget install -e --id $id --silent --accept-source-agreements --accept-package-agreements
  Refresh-Path
}

Write-Host "=== Instalando Logoscribe ===" -ForegroundColor Cyan

# Node.js 24 o superior (Logoscribe usa su SQLite integrado)
$nodeOk = $false
if (Has node) { $nodeOk = [int]((node -v).TrimStart("v").Split(".")[0]) -ge 24 }
if (-not $nodeOk) { Write-Host "Instalando Node.js..."; Winget "OpenJS.NodeJS.LTS" }
if (-not (Has pnpm)) { Write-Host "Instalando pnpm..."; npm install -g pnpm; Refresh-Path }

$bin = Join-Path $root "tools\bin"
$tmp = Join-Path $env:TEMP "logoscribe-setup"
New-Item -ItemType Directory -Force $bin, $tmp | Out-Null

if (-not (Test-Path (Join-Path $bin "ffmpeg.exe"))) {
  Write-Host "Descargando ffmpeg..."
  Invoke-WebRequest "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile "$tmp\ffmpeg.zip"
  Expand-Archive "$tmp\ffmpeg.zip" "$tmp\ffmpeg" -Force
  Get-ChildItem "$tmp\ffmpeg" -Recurse -Include ffmpeg.exe, ffprobe.exe | Copy-Item -Destination $bin -Force
}

if (-not (Test-Path (Join-Path $bin "whisper-cli.exe"))) {
  Write-Host "Descargando whisper.cpp..."
  $releases = Invoke-RestMethod "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=15" -Headers @{ "User-Agent" = "logoscribe" }
  $asset = $releases | ForEach-Object { $_.assets } | Where-Object { $_.name -eq "whisper-blas-bin-x64.zip" } | Select-Object -First 1
  if (-not $asset) { throw "No se encontro whisper.cpp para Windows en GitHub." }
  Invoke-WebRequest $asset.browser_download_url -OutFile "$tmp\whisper.zip"
  Expand-Archive "$tmp\whisper.zip" "$tmp\whisper" -Force
  $cli = Get-ChildItem "$tmp\whisper" -Recurse -Filter whisper-cli.exe | Select-Object -First 1
  # whisper-cli.exe necesita las DLL que vienen a su lado
  Copy-Item (Join-Path $cli.DirectoryName "*") -Destination $bin -Recurse -Force
}

Write-Host "Instalando Logoscribe..."
pnpm install
if ($LASTEXITCODE -ne 0) { throw "Fallo pnpm install" }
pnpm build
if ($LASTEXITCODE -ne 0) { throw "Fallo pnpm build" }

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Logoscribe.lnk"))
$link.TargetPath = Join-Path $root "Logoscribe.bat"
$link.WorkingDirectory = $root
$link.Save()

Write-Host ""
Write-Host "=== Listo ===" -ForegroundColor Green
Write-Host "Se creó el acceso directo «Logoscribe» en el Escritorio."
Write-Host "Al abrirlo por primera vez, ve a Ajustes y descarga el modelo de transcripción."
