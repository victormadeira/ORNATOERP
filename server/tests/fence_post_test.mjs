// Teste fence-post: peças que cabem EXATO na chapa (n*w + (n-1)*kerf == binW)
// devem caber numa chapa só — antes do fix, o gate exigia +spacing além da
// última peça e rejeitava (2 chapas em vez de 1).
//
// Uso: node server/tests/fence_post_test.mjs
import { runNestingPass } from '../lib/nesting-engine.js';

let falhas = 0;
const caso = (nome, pieces, binW, binH, spacing, kerf, esperadoChapas, binType = 'maxrects') => {
    const bins = runNestingPass(pieces, binW, binH, spacing, 'BSSF', binType, kerf, 'auto');
    const placed = bins.reduce((s, b) => s + b.usedRects.filter(r => r.pieceRef).length, 0);
    const eff = Math.max(kerf, spacing);
    let overlap = false, fora = false, gapViolado = false;
    for (const b of bins) {
        const rs = b.usedRects;
        for (const r of rs) {
            if (r.x < -0.01 || r.y < -0.01 || r.x + r.realW > binW + 0.01 || r.y + r.realH > binH + 0.01) fora = true;
        }
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], c = rs[j];
            const rox = Math.min(a.x + a.realW, c.x + c.realW) - Math.max(a.x, c.x);
            const roy = Math.min(a.y + a.realH, c.y + c.realH) - Math.max(a.y, c.y);
            if (rox > 0.01 && roy > 0.01) overlap = true;
            // se projetam uma na outra num eixo, a distância no outro deve ser >= eff
            if (rox > 0.01 && roy <= 0.01 && -roy < eff - 0.01) gapViolado = true;
            if (roy > 0.01 && rox <= 0.01 && -rox < eff - 0.01) gapViolado = true;
        }
    }
    const ok = placed === pieces.length && bins.length <= esperadoChapas && !overlap && !fora && !gapViolado;
    if (!ok) falhas++;
    console.log(`${ok ? '✅' : '❌'} [${binType}] ${nome}: ${placed}/${pieces.length} peças, ${bins.length} chapa(s) (esperado ≤${esperadoChapas})${overlap ? ' [SOBREPOSIÇÃO]' : ''}${gapViolado ? ' [GAP < kerf]' : ''}${fora ? ' [FORA DA CHAPA]' : ''}`);
};

const mk = (id, w, h, qty) => Array.from({ length: qty }, (_, i) => ({
    ref: { pecaId: id, instancia: i }, w, h, area: w * h,
    perim: 2 * (w + h), maxSide: Math.max(w, h), diff: Math.abs(w - h), allowRotate: false,
}));

// Chapa útil 2730×1830, kerf=spacing=4
// 1363+4+1363 = 2730 EXATO → 1 chapa
caso('2 metades exatas (1363) lado a lado', mk('m', 1363, 1830, 2), 2730, 1830, 4, 4, 1);
// 3×907 + 2×4 = 2729 ≤ 2730 → 1 chapa
caso('3 terços exatos (907)', mk('t', 907, 1830, 3), 2730, 1830, 4, 4, 1);
// Vertical: 913+4+913 = 1830 EXATO
caso('2 metades verticais (913)', mk('v', 2730, 913, 2), 2730, 1830, 4, 4, 1);
// Grade 2×2 exata
caso('grade 2×2 exata (1363×913)', mk('g', 1363, 913, 4), 2730, 1830, 4, 4, 1);
// Peça do tamanho exato da chapa — antes era IMPOSSÍVEL de alocar (descartada!)
caso('peça chapa inteira (2730×1830)', mk('full', 2730, 1830, 1), 2730, 1830, 4, 4, 1);
// Controle negativo: 2×1400 + 4 = 2804 > 2730 → 2 chapas mesmo
caso('controle: 2×1400 NÃO cabe junto', mk('c', 1400, 1830, 2), 2730, 1830, 4, 4, 2);
// Outros bin types
caso('2 metades exatas', mk('s', 1363, 900, 2), 2730, 1830, 4, 4, 1, 'shelf');
caso('2 metades exatas', mk('k', 1363, 1830, 2), 2730, 1830, 4, 4, 1, 'skyline');
caso('2 metades exatas', mk('q', 1363, 1830, 2), 2730, 1830, 4, 4, 1, 'guillotine');

console.log(falhas === 0 ? '\n🎉 FENCE-POST OK' : `\n⚠️ ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
