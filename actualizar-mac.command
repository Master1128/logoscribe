#!/bin/bash
# Descarga la última versión de Logoscribe. Cierra Logoscribe antes de ejecutarlo.
set -e
cd "$(dirname "$0")"
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && break; done
echo "=== Actualizando Logoscribe ==="
git pull --ff-only
pnpm install
pnpm build
echo "=== Listo. Ya puedes abrir Logoscribe. ==="
