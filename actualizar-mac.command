#!/bin/bash
# Descarga la última versión de Logoscribe. Cierra Logoscribe antes de ejecutarlo.
# Tus prédicas no se tocan: están guardadas en ~/Library/Application Support/Logoscribe.
set -e
cd "$(dirname "$0")"
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && break; done
echo "=== Actualizando Logoscribe ==="

if [ -d .git ]; then
  git pull --ff-only
else
  # Descargado como ZIP: se baja la versión nueva y se copia encima.
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/logoscribe.zip" https://github.com/Master1128/logoscribe/archive/refs/heads/main.zip
  ditto -x -k "$TMP/logoscribe.zip" "$TMP/nuevo"
  rsync -a "$TMP/nuevo/logoscribe-main/" ./
  rm -rf "$TMP"
fi

chmod +x ./*.command
pnpm install
pnpm build
echo "=== Listo. Ya puedes abrir Logoscribe. ==="
