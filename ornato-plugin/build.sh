#!/bin/bash
# ═══════════════════════════════════════════════════════
# Ornato CNC Plugin — Build Script
# Generates .rbz file for SketchUp installation
# ═══════════════════════════════════════════════════════

cd "$(dirname "$0")"

VERSION=$(grep "PLUGIN_VERSION" ornato_loader.rb | grep -o "'[^']*'" | tr -d "'")

if [ -z "$VERSION" ]; then
  echo "Erro: nao foi possivel detectar a versao do plugin."
  exit 1
fi

FILENAME="ornato_cnc_${VERSION}.rbz"

echo "========================================="
echo "  Ornato CNC Plugin - Build"
echo "  Versao: ${VERSION}"
echo "========================================="
echo ""

# Create temp build directory
rm -rf _build
mkdir -p _build

echo "[1/4] Copiando arquivos..."

# Copy loader
cp ornato_loader.rb _build/

# Copy plugin source
cp -r ornato_sketchup _build/

# Copy icons
cp -r icons _build/

echo "[2/4] Limpando arquivos desnecessarios..."

# Remove unnecessary files
find _build -name "*.pyc" -delete 2>/dev/null
find _build -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
find _build -name ".DS_Store" -delete 2>/dev/null
find _build -name "*.bak" -delete 2>/dev/null
find _build -name "*~" -delete 2>/dev/null

# Remove test files from build
rm -rf _build/tests 2>/dev/null

echo "[3/4] Gerando arquivo .rbz..."

# Create .rbz (which is just a .zip renamed)
cd _build
zip -r "../${FILENAME}" . -x "*.DS_Store" > /dev/null 2>&1
cd ..

echo "[4/4] Limpando diretorio temporario..."

rm -rf _build

# Report result
SIZE=$(du -h "${FILENAME}" | cut -f1)
SIZE_MB=$(du -m "${FILENAME}" | cut -f1)
FILE_COUNT=$(unzip -l "${FILENAME}" 2>/dev/null | tail -1 | awk '{print $2}')

# ─── Copiar para servidor ERP (uploads/plugins) ───────
ERP_PLUGINS_DIR="$(dirname "$0")/../server/uploads/plugins"

if [ -d "${ERP_PLUGINS_DIR}" ]; then
  echo ""
  echo "[5/5] Copiando para servidor ERP..."

  # Copiar .rbz
  cp "${FILENAME}" "${ERP_PLUGINS_DIR}/${FILENAME}"

  # Atualizar version.json
  RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  CHANGELOG=$(grep -A 100 "^changelog" ornato_loader.rb 2>/dev/null | head -1 || echo "Versao ${VERSION}.")

  cat > "${ERP_PLUGINS_DIR}/version.json" << VERSIONEOF
{
  "version": "${VERSION}",
  "released_at": "${RELEASED_AT}",
  "changelog": "Ornato CNC Plugin v${VERSION}.\n\n- Deteccao automatica de pecas e juncoes\n- 8 regras de furacao automatica\n- 15 modulos parametricos\n- Ferragens 3D no modelo\n- Edicao manual de furos\n- 15 validacoes pre-export\n- Catalogo Blum, Hettich, Hafele, Grass\n- Biblioteca com 92 itens\n- Sync com Ornato ERP\n- Auto-update automatico",
  "min_sketchup": "2021",
  "filename": "${FILENAME}",
  "size_mb": ${SIZE_MB}
}
VERSIONEOF

  echo "  Copiado para: ${ERP_PLUGINS_DIR}/${FILENAME}"
  echo "  version.json atualizado"
else
  echo "  (servidor ERP nao encontrado — copie ${FILENAME} manualmente)"
fi

echo ""
echo "========================================="
echo "  Build concluido com sucesso!"
echo ""
echo "  Arquivo:  ${FILENAME}"
echo "  Tamanho:  ${SIZE}"
echo "  Arquivos: ${FILE_COUNT}"
echo ""
echo "  Para instalar:"
echo "  SketchUp > Window > Extension Manager"
echo "  > Install Extension > selecione ${FILENAME}"
echo "========================================="
