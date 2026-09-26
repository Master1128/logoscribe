#!/bin/bash
# Instalador de Logoscribe para Mac. Doble clic para ejecutarlo (la primera vez: clic derecho → Abrir).
set -e
cd "$(dirname "$0")"
echo "=== Instalando Logoscribe ==="
# Descargado como ZIP, macOS marca cada archivo "de internet" y pediría confirmar
# el lanzador y el actualizador; ya se confirmó al abrir este instalador.
xattr -dr com.apple.quarantine . 2>/dev/null || true

load_brew() { for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && return 0; done; return 1; }
load_brew || true
if ! command -v brew >/dev/null 2>&1; then
  echo "Instalando Homebrew (te pedirá la contraseña del Mac)…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  load_brew
fi

echo "Instalando ffmpeg y whisper.cpp…"
brew install ffmpeg whisper-cpp
if ! command -v whisper-cli >/dev/null 2>&1 && ! command -v whisper-cpp >/dev/null 2>&1; then
  echo "✗ whisper.cpp no quedó instalado. Ejecuta «brew install whisper-cpp» y comparte el mensaje que aparezca."
  exit 1
fi

# Logoscribe usa el SQLite integrado de Node 24 o superior.
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 24 ]; then
  echo "Instalando Node.js…"
  brew install node
  load_brew
fi
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm

echo "Instalando Logoscribe…"
pnpm install
pnpm build

chmod +x Logoscribe.command actualizar-mac.command
ln -sf "$PWD/Logoscribe.command" "$HOME/Desktop/Logoscribe.command"

echo
echo "=== Listo ==="
echo "Se creó el acceso directo «Logoscribe» en el Escritorio."
echo "Al abrirlo por primera vez, ve a Ajustes y descarga el modelo de transcripción."
open Logoscribe.command
