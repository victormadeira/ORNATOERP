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

# 5. Detectar Chrome/Chromium path (prioriza Google Chrome)
echo "[5/6] Verificando Chrome/Chromium..."
CHROMIUM_PATH=""
for p in /usr/bin/google-chrome-stable /usr/bin/google-chrome /usr/bin/chromium-browser /usr/bin/chromium; do
    if [ -f "$p" ]; then
        CHROMIUM_PATH="$p"
        break
    fi
done
if [ -z "$CHROMIUM_PATH" ]; then
    echo "  AVISO: Chrome/Chromium nao encontrado! Instalando Google Chrome..."
    wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb 2>/dev/null && \
    apt install -y /tmp/chrome.deb 2>/dev/null && rm -f /tmp/chrome.deb || true
    for p in /usr/bin/google-chrome-stable /usr/bin/google-chrome; do
        if [ -f "$p" ]; then CHROMIUM_PATH="$p"; break; fi
    done
fi
echo "  Chrome: $CHROMIUM_PATH"

# Atualizar ecosystem.config.cjs com o path correto
if [ -n "$CHROMIUM_PATH" ]; then
    sed -i "s|PUPPETEER_EXECUTABLE_PATH:.*|PUPPETEER_EXECUTABLE_PATH: '$CHROMIUM_PATH',|" "$APP_DIR/ecosystem.config.cjs"
fi

# 6. Restart backend (delete + start para garantir env vars atualizadas)
echo "[6/6] Reiniciando servidor..."
sudo -u ornato bash -c "cd $APP_DIR && pm2 delete ornato-erp" 2>/dev/null || true
sudo -u ornato bash -c "cd $APP_DIR && pm2 start ecosystem.config.cjs"
sudo -u ornato bash -c "pm2 save"

echo ""
echo "═══════════════════════════════════════════════"
echo "  Atualizado com sucesso!"
echo "═══════════════════════════════════════════════"
sudo -u ornato pm2 status
