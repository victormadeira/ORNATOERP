#!/bin/bash
# ═══════════════════════════════════════════════════════
# Ornato ERP — Setup VPS Ubuntu 22.04
# Executa como root: bash setup-vps.sh
# ═══════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════"
echo "  ORNATO ERP — Instalação VPS"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── 1. Atualizar sistema ─────────────────────────────
echo "[1/8] Atualizando sistema..."
apt update && apt upgrade -y

# ─── 2. Instalar dependências base ────────────────────
echo "[2/8] Instalando dependencias..."
apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw

# ─── 3. Instalar Node.js 20 ──────────────────────────
echo "[3/8] Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "  Node: $(node -v)"
echo "  NPM: $(npm -v)"

# ─── 4. Instalar PM2 ─────────────────────────────────
echo "[4/8] Instalando PM2..."
npm install -g pm2

# ─── 5. Instalar Chromium (para Puppeteer) ────────────
echo "[5/8] Instalando Chromium para Puppeteer..."
apt install -y chromium-browser || apt install -y chromium
apt install -y fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 \
  libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 xdg-utils \
  ca-certificates fonts-freefont-ttf 2>/dev/null || true

# ─── 6. Criar usuario app ────────────────────────────
echo "[6/8] Criando usuario ornato..."
if ! id "ornato" &>/dev/null; then
    useradd -m -s /bin/bash ornato
    echo "  Usuario 'ornato' criado"
else
    echo "  Usuario 'ornato' ja existe"
fi

# ─── 7. Clonar repositorio ───────────────────────────
echo "[7/8] Clonando repositorio..."
APP_DIR="/home/ornato/app"
if [ -d "$APP_DIR" ]; then
    echo "  Diretorio ja existe, fazendo pull..."
    cd "$APP_DIR"
    sudo -u ornato git pull origin main
else
    sudo -u ornato git clone https://github.com/victormadeira/ORNATOERP.git "$APP_DIR"
    cd "$APP_DIR"
fi

# Instalar dependencias
echo "  Instalando dependencias npm..."
cd "$APP_DIR"
sudo -u ornato npm install

# Build do frontend
echo "  Build do frontend..."
sudo -u ornato npm run build

# Criar diretorio de uploads
mkdir -p "$APP_DIR/uploads"
chown ornato:ornato "$APP_DIR/uploads"

# ─── 8. Configurar firewall ──────────────────────────
echo "[8/8] Configurando firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Instalacao base concluida!"
echo ""
echo "  Proximos passos:"
echo "  1. Copie o nginx config:  cp deploy/ornato-erp.nginx /etc/nginx/sites-available/ornato-erp"
echo "  2. Ative:                 ln -s /etc/nginx/sites-available/ornato-erp /etc/nginx/sites-enabled/"
echo "  3. Remova default:        rm /etc/nginx/sites-enabled/default"
echo "  4. Teste nginx:           nginx -t && systemctl reload nginx"
echo "  5. Inicie com PM2:        cd $APP_DIR && sudo -u ornato pm2 start ecosystem.config.cjs"
echo "  6. Salve PM2:             sudo -u ornato pm2 save && pm2 startup"
echo "═══════════════════════════════════════════════════════"
