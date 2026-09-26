#!/bin/bash
# Abre Logoscribe. Deja esta ventana abierta mientras lo usas; ciérrala para apagarlo.
cd "$(dirname "$(readlink "$0" || echo "$0")")"
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)" && break; done
URL="http://localhost:3131"

if curl -s -o /dev/null "$URL"; then open "$URL"; exit 0; fi
[ -f .next/BUILD_ID ] || pnpm build
( until curl -s -o /dev/null "$URL"; do sleep 1; done; open "$URL" ) &
echo "Logoscribe está funcionando en $URL"
echo "Deja esta ventana abierta mientras lo usas; ciérrala para apagarlo."
pnpm start
