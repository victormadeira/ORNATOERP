#!/bin/bash
# ═══════════════════════════════════════════════════════
# Ornato ERP — Atualizar deploy (rodar como root)
# ═══════════════════════════════════════════════════════

set -e

APP_DIR="/home/ornato/app"
cd "$APP_DIR"

echo "═══════════════════════════════════════════════"
echo "  Atualizando Ornato ERP..."
echo "═══════════════════════════════════════════════"

# 1. Pull
echo "[1/6] Baixando atualizacoes..."
sudo -u ornato git pull origin main

# 2. Instalar novas deps
echo "[2/6] Instalando dependencias..."
sudo -u ornato npm install

# 3. Rebuild frontend
echo "[3/6] Build do frontend..."
sudo -u ornato npm run build

# 4. Atualizar Nginx config
echo "[4/6] Atualizando Nginx..."
cp "$APP_DIR/deploy/ornato-erp.nginx" /etc/nginx/sites-available/ornato-erp
nginx -t && systemctl reload nginx

# 5. Detectar Chromium path
echo "[5/6] Verificando Chromium..."
CHROMIUM_PATH=""
for p in /usr/bin/chromium-browser /usr/bin/chromium /snap/bin/chromium; do
    if [ -f "$p" ]; then
        CHROMIUM_PATH="$p"
        break
    fi
done
if [ -z "$CHROMIUM_PATH" ]; then
    echo "  AVISO: Chromium nao encontrado! Instalando..."
    apt install -y chromium-browser 2>/dev/null || apt install -y chromium 2>/dev/null || true
    for p in /usr/bin/chromium-browser /usr/bin/chromium /snap/bin/chromium; do
        if [ -f "$p" ]; then CHROMIUM_PATH="$p"; break; fi
    done
fi
echo "  Chromium: $CHROMIUM_PATH"

# Atualizar ecosystem.config.cjs com o path correto
if [ -n "$CHROMIUM_PATH" ]; then
    sed -i "s|PUPPETEER_EXECUTABLE_PATH:.*|PUPPETEER_EXECUTABLE_PATH: '$CHROMIUM_PATH',|" "$APP_DIR/ecosystem.config.cjs"
fi

# 6. Restart backend
echo "[6/6] Reiniciando servidor..."
sudo -u ornato bash -c "cd $APP_DIR && pm2 restart ornato-erp" 2>/dev/null || \
sudo -u ornato bash -c "cd $APP_DIR && pm2 start ecosystem.config.cjs" 2>/dev/null

echo ""
echo "═══════════════════════════════════════════════"
echo "  Atualizado com sucesso!"
echo "═══════════════════════════════════════════════"
sudo -u ornato pm2 status
