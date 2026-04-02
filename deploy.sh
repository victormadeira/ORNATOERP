#!/bin/bash
# ═══════════════════════════════════════════
# Ornato ERP — Deploy Unificado (Node + Python)
# ═══════════════════════════════════════════
set -e

APP_DIR="/home/ornato/app"
LOG_DIR="/home/ornato/logs"

echo ""
echo "═══════════════════════════════════════════"
echo "  ORNATO ERP — Deploy"
echo "═══════════════════════════════════════════"
echo ""

cd "$APP_DIR"

# 1. Git pull
echo "[1/5] Git pull..."
git pull origin main

# 2. Instalar dependencias Node
echo "[2/5] npm install..."
npm install

# 3. Instalar dependencias Python
echo "[3/5] pip install..."
cd "$APP_DIR/cnc_optimizer"
python3 -m pip install -r requirements.txt -q 2>/dev/null || pip3 install -r requirements.txt -q 2>/dev/null || echo "  (pip não encontrado — pule se dependências já instaladas)"
cd "$APP_DIR"

# 4. Build frontend
echo "[4/5] Build frontend..."
npx vite build

# 5. Garantir diretorio de logs
mkdir -p "$LOG_DIR"

# 6. Restart com ecosystem (Node + Python juntos)
echo "[5/5] Restart PM2..."
pm2 delete ornato-erp 2>/dev/null || true
pm2 delete cnc-optimizer 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "═══════════════════════════════════════════"
echo "  Deploy concluido!"
echo "═══════════════════════════════════════════"
echo ""
pm2 status
echo ""
echo "  ERP:  http://localhost:3001"
echo "  CNC:  http://localhost:8000"
echo "  Logs: pm2 logs"
echo ""
