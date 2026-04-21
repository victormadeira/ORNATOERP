#!/usr/bin/env bash
# ============================================================================
# Ornato ERP — Deploy seguro
# ----------------------------------------------------------------------------
# Executa na VPS em /home/ornato/app
#
#   bash scripts/deploy.sh
#
# O que faz (nesta ordem, parando no primeiro erro):
#   1. Valida working tree (sem mudanças locais não commitadas)
#   2. Backup rotativo do SQLite em server/backups/ (mantém últimos 7)
#   3. Captura SHA atual (para rollback)
#   4. git fetch + git pull --ff-only (nunca faz merge silencioso)
#   5. npm ci (reprodutível) + npm run build
#   6. pm2 reload ornato-erp (zero-downtime em cluster mode)
#   7. Healthcheck /api/health com retries (10x, 2s de intervalo)
#   8. Se healthcheck falhar → rollback completo:
#        - restaura DB do backup
#        - git reset --hard <SHA anterior>
#        - rebuild + pm2 reload
#        - sai com código 1
# ============================================================================

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/home/ornato/app}"
DB_PATH="${DB_PATH:-server/marcenaria.db}"
BACKUP_DIR="${BACKUP_DIR:-server/backups}"
PM2_NAME="${PM2_NAME:-ornato-erp}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3001/api/health}"
HEALTH_MAX_TRIES="${HEALTH_MAX_TRIES:-10}"
HEALTH_SLEEP="${HEALTH_SLEEP:-2}"
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"

# ── UI ──────────────────────────────────────────────────────────────────────
BOLD=$(tput bold 2>/dev/null || echo "")
DIM=$(tput dim 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
BLUE=$(tput setaf 4 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

step()  { echo; echo "${BOLD}${BLUE}▶ $*${RESET}"; }
ok()    { echo "${GREEN}✓${RESET} $*"; }
warn()  { echo "${YELLOW}⚠${RESET} $*"; }
fail()  { echo "${RED}✗ $*${RESET}" >&2; }
info()  { echo "${DIM}  $*${RESET}"; }

# ── Cd no diretório da app ──────────────────────────────────────────────────
cd "$APP_DIR"

START_TS=$(date +%s)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "${BOLD}═══════════════════════════════════════════════════════${RESET}"
echo "${BOLD}  Ornato ERP — Deploy seguro  ${DIM}($TIMESTAMP)${RESET}"
echo "${BOLD}═══════════════════════════════════════════════════════${RESET}"

# ── 1. Sanity check ─────────────────────────────────────────────────────────
step "1/7 Validando working tree"
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    fail "Não é um repositório git: $APP_DIR"
    exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    fail "Working tree sujo. Mudanças locais não commitadas:"
    git status --short
    echo
    echo "  Resolva antes de prosseguir:"
    echo "    git stash push -m 'pre-deploy'   # para guardar"
    echo "    git checkout -- .                # para descartar"
    exit 1
fi
ok "working tree limpo"

PREV_SHA=$(git rev-parse HEAD)
PREV_SHA_SHORT=$(git rev-parse --short HEAD)
info "SHA atual: $PREV_SHA_SHORT"

# ── 2. Backup rotativo do SQLite ────────────────────────────────────────────
step "2/7 Backup do banco de dados"
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
    warn "DB não encontrado em $DB_PATH (primeiro deploy?)"
    BACKUP_FILE=""
else
    BACKUP_FILE="$BACKUP_DIR/marcenaria.db.${TIMESTAMP}.bak"
    cp "$DB_PATH" "$BACKUP_FILE"
    SIZE=$(du -h "$BACKUP_FILE" | awk '{print $1}')
    ok "backup criado: $BACKUP_FILE ($SIZE)"

    # Rotação: mantém últimos N backups
    BACKUPS_TOTAL=$(ls -1 "$BACKUP_DIR"/marcenaria.db.*.bak 2>/dev/null | wc -l)
    if [ "$BACKUPS_TOTAL" -gt "$BACKUP_RETENTION" ]; then
        TO_DELETE=$((BACKUPS_TOTAL - BACKUP_RETENTION))
        ls -1t "$BACKUP_DIR"/marcenaria.db.*.bak | tail -n "$TO_DELETE" | xargs -r rm --
        info "rotação: removidos $TO_DELETE backup(s) antigo(s); retenção = $BACKUP_RETENTION"
    fi
fi

# ── 3. Git pull ─────────────────────────────────────────────────────────────
step "3/7 Atualizando código (git pull --ff-only)"
git fetch origin
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "branch: $CURRENT_BRANCH"

if ! git pull --ff-only origin "$CURRENT_BRANCH"; then
    fail "Pull falhou (fast-forward impossível — divergência local?)"
    info "Inspecione com: git log --oneline --graph $CURRENT_BRANCH origin/$CURRENT_BRANCH"
    exit 1
fi

NEW_SHA=$(git rev-parse HEAD)
NEW_SHA_SHORT=$(git rev-parse --short HEAD)

if [ "$PREV_SHA" = "$NEW_SHA" ]; then
    warn "Nenhum commit novo. Abortando deploy (nada a fazer)."
    exit 0
fi

info "SHA novo:   $NEW_SHA_SHORT"
COMMIT_COUNT=$(git rev-list --count "$PREV_SHA..$NEW_SHA")
info "commits aplicados: $COMMIT_COUNT"
echo "${DIM}  $(git log --oneline "$PREV_SHA..$NEW_SHA" | head -5)${RESET}"

# ── 4. Install + Build ──────────────────────────────────────────────────────
step "4/7 npm ci + build"
if ! npm ci --no-audit --no-fund; then
    fail "npm ci falhou"
    info "Iniciando rollback…"
    git reset --hard "$PREV_SHA"
    exit 1
fi

if ! npm run build; then
    fail "npm run build falhou"
    info "Iniciando rollback de código…"
    git reset --hard "$PREV_SHA"
    exit 1
fi
ok "build concluído"

# ── 5. Restart PM2 ──────────────────────────────────────────────────────────
step "5/7 Restart PM2 ($PM2_NAME)"
if ! pm2 reload "$PM2_NAME" --update-env; then
    warn "reload falhou — tentando restart"
    pm2 restart "$PM2_NAME" --update-env
fi
ok "pm2 reload emitido"

# ── 6. Healthcheck ──────────────────────────────────────────────────────────
step "6/7 Healthcheck ($HEALTH_URL)"
HEALTH_OK=0
for i in $(seq 1 "$HEALTH_MAX_TRIES"); do
    HTTP_CODE=$(curl -s -o /tmp/ornato-health.json -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        BODY=$(cat /tmp/ornato-health.json 2>/dev/null | head -c 200)
        ok "health 200 OK  ${DIM}($BODY)${RESET}  [tentativa $i/$HEALTH_MAX_TRIES]"
        HEALTH_OK=1
        break
    fi
    info "tentativa $i/$HEALTH_MAX_TRIES: HTTP $HTTP_CODE (aguardando ${HEALTH_SLEEP}s…)"
    sleep "$HEALTH_SLEEP"
done

if [ "$HEALTH_OK" -ne 1 ]; then
    fail "Healthcheck falhou após $HEALTH_MAX_TRIES tentativas"
    echo
    echo "${BOLD}${RED}▶ ROLLBACK AUTOMÁTICO${RESET}"

    # Restaura DB se houver backup
    if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$DB_PATH"
        info "DB restaurado de $BACKUP_FILE"
    fi

    # Reset para SHA anterior
    git reset --hard "$PREV_SHA"
    info "git reset → $PREV_SHA_SHORT"

    # Rebuild + reload
    npm ci --no-audit --no-fund >/dev/null 2>&1 || true
    npm run build
    pm2 reload "$PM2_NAME" --update-env || pm2 restart "$PM2_NAME" --update-env

    # Segundo healthcheck para confirmar rollback
    sleep 3
    RB_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$RB_CODE" = "200" ]; then
        ok "rollback bem-sucedido — serviço saudável em $PREV_SHA_SHORT"
    else
        fail "rollback também não respondeu (HTTP $RB_CODE) — INTERVENÇÃO MANUAL"
    fi

    exit 1
fi

# ── 7. Fim ──────────────────────────────────────────────────────────────────
step "7/7 Sumário"
ELAPSED=$(( $(date +%s) - START_TS ))
echo
echo "${BOLD}${GREEN}✓ Deploy concluído com sucesso${RESET}"
echo "  ${DIM}$PREV_SHA_SHORT → $NEW_SHA_SHORT  •  $COMMIT_COUNT commit(s)  •  ${ELAPSED}s${RESET}"
if [ -n "$BACKUP_FILE" ]; then
    echo "  ${DIM}backup: $BACKUP_FILE${RESET}"
fi
echo
echo "  pm2 status     → ver processo"
echo "  pm2 logs $PM2_NAME  → ver logs"
echo
