/**
 * tspUtils.js — Otimização de sequência de corte por Nearest Neighbour (TSP).
 *
 * Cada corte é um segmento {x, y, x2, y2}. A "distância" entre dois cortes é
 * a distância euclidiana do fim de um ao início do próximo (ponto de entrada
 * para a ferramenta). O algoritmo reduz o percurso em vazio (G0 rapids) da CNC.
 */

/**
 * Nearest-Neighbour + 2-opt para reordenar cortes.
 * Começa na origem física da chapa vista de frente: canto inferior esquerdo.
 * Quando seguro, também permite inverter o sentido do segmento para reduzir G0.
 *
 * @param {Array<{x:number,y:number,x2:number,y2:number,dir?:string,pos?:number}>} cuts
 * @returns {Array<typeof cuts[0]>} nova sequência otimizada
 */
export function optimizeCutSequence(cuts, { startX = 0, startY = 0, canReverse = true } = {}) {
    if (!cuts || cuts.length <= 2) return cuts;

    const unvisited = [...cuts];
    const ordered = [];
    let currentX = startX;
    let currentY = startY;

    while (unvisited.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        let bestReverse = false;

        for (let i = 0; i < unvisited.length; i++) {
            const c = unvisited[i];
            const dx = c.x - currentX;
            const dy = c.y - currentY;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestDist) { bestDist = d; bestIdx = i; bestReverse = false; }

            if (canReverse && Number.isFinite(c.x2) && Number.isFinite(c.y2)) {
                const rdx = c.x2 - currentX;
                const rdy = c.y2 - currentY;
                const rd = Math.sqrt(rdx * rdx + rdy * rdy);
                if (rd < bestDist) { bestDist = rd; bestIdx = i; bestReverse = true; }
            }
        }

        const raw = unvisited.splice(bestIdx, 1)[0];
        const chosen = bestReverse
            ? { ...raw, x: raw.x2, y: raw.y2, x2: raw.x, y2: raw.y, invertido_tsp: true }
            : raw;
        ordered.push(chosen);
        currentX = chosen.x2;
        currentY = chosen.y2;
    }

    return twoOptCuts(ordered, startX, startY);
}

function twoOptCuts(cuts, startX = 0, startY = 0) {
    if (!cuts || cuts.length < 4) return cuts;
    const seq = [...cuts];
    let best = calcRapidDistance(seq, startX, startY);
    let improved = true;
    let iter = 0;
    while (improved && iter < 8) {
        improved = false;
        iter++;
        for (let i = 1; i < seq.length - 1; i++) {
            for (let j = i + 1; j < seq.length; j++) {
                const candidate = [...seq];
                candidate.splice(i, j - i + 1, ...candidate.slice(i, j + 1).reverse());
                const dist = calcRapidDistance(candidate, startX, startY);
                if (dist < best - 0.01) {
                    seq.splice(i, j - i + 1, ...candidate.slice(i, j + 1));
                    best = dist;
                    improved = true;
                }
            }
        }
    }
    return seq;
}

/**
 * Calcula o percurso total em vazio (mm) de uma sequência de cortes.
 * Útil para mostrar a economia antes/depois.
 *
 * @param {Array<{x:number,y:number,x2:number,y2:number}>} cuts
 * @param {number} [startX=0]
 * @param {number} [startY=0]
 * @returns {number} distância total em mm
 */
export function calcRapidDistance(cuts, startX = 0, startY = 0) {
    if (!cuts || cuts.length === 0) return 0;
    let dist = 0;
    let cx = startX;
    let cy = startY;
    for (const c of cuts) {
        const dx = c.x - cx;
        const dy = c.y - cy;
        dist += Math.sqrt(dx * dx + dy * dy);
        cx = c.x2;
        cy = c.y2;
    }
    return dist;
}
