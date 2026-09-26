#!/bin/bash
# Instalador de Logoscribe en una línea (Mac). Uso, en la Terminal:
#   curl -fsSL https://raw.githubusercontent.com/Master1128/logoscribe/main/scripts/instalar-mac.sh | bash
# Lo descargado con curl no queda en cuarentena, así que macOS no bloquea el instalador.
set -e
DEST="$HOME/Logoscribe"
ZIP_URL="https://github.com/Master1128/logoscribe/archive/refs/heads/main.zip"

echo "=== Descargando Logoscribe en $DEST ==="
TMP=$(mktemp -d)
curl -fsSL -o "$TMP/logoscribe.zip" "$ZIP_URL"
ditto -x -k "$TMP/logoscribe.zip" "$TMP/nuevo"
mkdir -p "$DEST"
# Copia encima: si ya estaba instalado, conserva node_modules y la compilación.
rsync -a "$TMP/nuevo/logoscribe-main/" "$DEST/"
rm -rf "$TMP"

chmod +x "$DEST"/*.command
bash "$DEST/instalar-mac.command"
