// Stub: implementação NFP (No-Fit Polygon) ainda não disponível.
// Mantém as exportações para que os imports em routes/cnc.js não quebrem o boot.
// detectCommonLines/commonLineSavings retornam vazio/zero — pós-processamento
// de linhas comuns simplesmente não acontece, sem afetar o nesting principal.

export function detectCommonLines(_placed, _kerf) {
  return [];
}

export function commonLineSavings(_commonLines) {
  return 0;
}

export function partInPartNest() {
  return null;
}

export function runNFPNesting() {
  return null;
}

export function convertBinToNFPFormat() {
  return null;
}
