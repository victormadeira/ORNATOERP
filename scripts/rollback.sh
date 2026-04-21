#!/usr/bin/env bash
# ============================================================================
# Ornato ERP — Rollback manual
# ----------------------------------------------------------------------------
#   bash scripts/rollback.sh              # rollback para HEAD~1
#   bash scripts/rollback.sh <sha>        # rollback para SHA específico
#   bash scripts/rollback.sh --db <arq>   # restaura banco de backup
#
# Lista backups:
#   ls -lht server/backups/
# ============================================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/home/ornato/app}"
DB_PATH="${DB_PATH:-server/marcenaria.db}"
BACKUP_DIR="${BACKUP_DIR:-server/backups}"
PM2_NAME="${PM2_NAME:-ornato-erp}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3001/api/health}"

BOLD=$(tput bold 2>/dev/null || echo "")
DIM=$(tput dim 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

cd "$APP_DIR"

RESTORE_DB=""
TARGET_SHA=""

while [ $# -gt 0 ]; do
    case "$1" in
        --db)
            RESTORE_DB="$2"
            shift 2
            ;;
        --help|-h)
            sed -n '2,12p' "$0"
            exit 0
            ;;
        *)
            TARGET_SHA="$1"
            shift
            ;;
    esac
done

if [ -z "$TARGET_SHA" ]; then
    TARGET_SHA=$(git rev-parse HEAD~1)
fi

CURRENT_SHA=$(git rev-parse --short HEAD)
TARGET_SHORT=$(git rev-parse --short "$TARGET_SHA")

echo "${BOLD}▶ Rollback${RESET}"
echo "  atual  → $CURRENT_SHA"
echo "  alvo   → $TARGET_SHORT"
echo "  $(git log --oneline -1 "$TARGET_SHA")"
echo

read -p "Confirma rollback? (s/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "abortado"
    exit 0
fi

# Restaura DB se solicitado
if [ -n "$RESTORE_DB" ]; then
    if [ ! -f "$RESTORE_DB" ]; then
        echo "${RED}✗ backup não encontrado: $RESTORE_DB${RESET}" >&2
        exit 1
    fi
    # Snapshot do DB corrente antes de sobrescrever
    SAFETY_BACKUP="$BACKUP_DIR/marcenaria.db.pre-rollback-$(date +%Y%m%d-%H%M%S).bak"
    mkdir -p "$BACKUP_DIR"
    cp "$DB_PATH" "$SAFETY_BACKUP"
    echo "  snapshot segurança: $SAFETY_BACKUP"
    cp "$RESTORE_DB" "$DB_PATH"
    echo "  DB restaurado de $RESTORE_DB"
fi

git reset --hard "$TARGET_SHA"
npm ci --no-audit --no-fund
npm run build
pm2 reload "$PM2_NAME" --update-env || pm2 restart "$PM2_NAME" --update-env

sleep 3
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
if [ "$CODE" = "200" ]; then
    echo "${GREEN}✓ rollback OK — HEAD em $TARGET_SHORT${RESET}"
else
    echo "${YELLOW}⚠ rollback aplicado mas healthcheck respondeu $CODE${RESET}"
    echo "  verificar: pm2 logs $PM2_NAME"
    exit 1
fi
