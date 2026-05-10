#!/usr/bin/env bash
# tools/build_version.sh — atualiza version.txt antes de empacotar o RBZ.
#
# Uso (no diretório raiz do plugin):
#   bash tools/build_version.sh [channel]
# Onde [channel] = dev | beta | stable (default: dev).
#
# Lê tag git mais recente como versão, SHA curto, e timestamp UTC ISO-8601.
# Idempotente: roda 2x sem duplicar conteúdo (sobrescreve version.txt).

set -eu

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$ROOT"

VERSION="$(git describe --tags --abbrev=0 2>/dev/null || echo '0.1.0')"
# Remove eventual prefixo 'v' (v0.4.2 -> 0.4.2)
VERSION="${VERSION#v}"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
CHANNEL="${1:-dev}"
BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > version.txt <<EOF
$VERSION
sha:$SHA
channel:$CHANNEL
built:$BUILT
EOF

echo "version.txt atualizado:"
cat version.txt
