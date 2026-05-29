// Benchmark de caracterização do otimizador de nesting (JS).
// Rede de segurança: rode ANTES e DEPOIS de mexer no motor para detectar
// regressão de aproveitamento (yield). Mesmas entradas → mesmo resultado.
//
// Uso:  node server/tests/nesting_benchmark.mjs
//
// Não toca no banco nem na rede — exercita o motor puro com conjuntos de peças
// representativos de marcenaria. Compare a saída com a linha de base salva.

import { ruinAndRecreate } from '../lib/nesting-engine.js';

// Chapa padrão 2750x1850 com refilo de 10mm → área útil 2730x1830
const BIN_W = 2730, BIN_H = 1830, SPACING = 7, KERF = 4;

function mkPiece(id, w, h, qty = 1, allowRotate = true) {
    const out = [];
    for (let i = 0; i < qty; i++) {
        out.push({
            ref: { pecaId: id, instancia: i },
            w, h, area: w * h, perim: 2 * (w + h),
            maxSide: Math.max(w, h), diff: Math.abs(w - h),
            allowRotate,
        });
    }
    return out;
}

// ── Cenários representativos ────────────────────────────────────────────────
const CENARIOS = {
    // Cozinha típica: laterais, prateleiras, fundos, portas
    cozinha: [
        ...mkPiece('lat', 2200, 580, 4),
        ...mkPiece('prat', 1000, 560, 8),
        ...mkPiece('porta', 700, 400, 6),
        ...mkPiece('fundo', 1000, 700, 3),
        ...mkPiece('gaveta', 500, 150, 10),
    ].flat(),
    // Peças uniformes (estresse de empacotamento regular)
    uniforme: [
        ...mkPiece('p', 600, 400, 40),
    ].flat(),
    // Mix grande (estresse de volume)
    grande: [
        ...mkPiece('A', 800, 600, 20),
        ...mkPiece('B', 450, 300, 30),
        ...mkPiece('C', 1200, 250, 15),
        ...mkPiece('D', 350, 350, 25),
    ].flat(),
};

function bench(nome, pieces) {
    const t0 = process.hrtime.bigint();
    const res = ruinAndRecreate(pieces, BIN_W, BIN_H, SPACING, 'maxrects', KERF, 2000, 'auto');
    const t1 = process.hrtime.bigint();
    const bins = res?.bins || [];
    const ms = Number(t1 - t0) / 1e6;

    const totalArea = pieces.reduce((s, p) => s + p.area, 0);
    const sheetArea = BIN_W * BIN_H * bins.length;
    const yieldGlobal = sheetArea > 0 ? (totalArea / sheetArea * 100) : 0;
    const placed = bins.reduce((s, b) => s + (b.usedRects?.filter(r => r.pieceRef).length || 0), 0);
    const occ = bins.map(b => (typeof b.occupancy === 'function' ? b.occupancy() : 0));
    const occMed = occ.length ? occ.reduce((a, b) => a + b, 0) / occ.length : 0;

    console.log(
        `${nome.padEnd(10)} | peças ${String(pieces.length).padStart(3)} | colocadas ${String(placed).padStart(3)} | ` +
        `chapas ${String(bins.length).padStart(2)} | yield ${yieldGlobal.toFixed(1).padStart(5)}% | ` +
        `ocup.méd ${occMed.toFixed(1).padStart(5)}% | ${ms.toFixed(0)}ms`
    );
    return { nome, pieces: pieces.length, placed, chapas: bins.length, yield: +yieldGlobal.toFixed(1), occMed: +occMed.toFixed(1) };
}

console.log('═══ BENCHMARK DE CARACTERIZAÇÃO — Otimizador de Nesting ═══');
console.log(`Chapa: ${BIN_W}x${BIN_H} | spacing ${SPACING} | kerf ${KERF} | maxrects + R&R(2000) + auto\n`);
const resultados = [];
for (const [nome, pieces] of Object.entries(CENARIOS)) {
    resultados.push(bench(nome, pieces));
}
console.log('\nLinha de base (compare após mudanças no motor):');
console.log(JSON.stringify(resultados));
