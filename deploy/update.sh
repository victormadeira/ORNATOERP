#!/bin/bash
# ═══════════════════════════════════════════════════════
# Ornato ERP — Atualizar deploy (rodar como root)
# ═══════════════════════════════════════════════════════

set -e

APP_DIR="/home/ornato/app"
cd "$APP_DIR"

echo "Atualizando Ornato ERP..."

# Pull
sudo -u ornato git pull origin main

# Instalar novas deps
sudo -u ornato npm install

# Rebuild frontend
sudo -u ornato npm run build

# Restart backend
sudo -u ornato pm2 restart ornato-erp

echo "Atualizado com sucesso!"
sudo -u ornato pm2 status
