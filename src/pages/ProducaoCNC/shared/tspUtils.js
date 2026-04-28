/**
 * tspUtils.js — Otimização de sequência de corte por Nearest Neighbour (TSP).
 *
 * Cada corte é um segmento {x, y, x2, y2}. A "distância" entre dois cortes é
 * a distância euclidiana do fim de um ao início do próximo (ponto de entrada
 * para a ferramenta). O algoritmo reduz o percurso em vazio (G0 rapids) da CNC.
 */

/**
 * Calcula a distância entre o fim de um corte e o início do próximo.
 * @param {{x:number,y:number,x2:number,y2:number}} a
 * @param {{x:number,y:number,x2:number,y2:number}} b
 */
function distCuts(a, b) {
    const dx = b.x - a.x2;
    const dy = b.y - a.y2;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Nearest-Neighbour TSP para reordenar cortes.
 * Começa do canto superior-esquerdo (x≈0, y≈0) e sempre vai para o corte
 * mais próximo ainda não visitado.
 *
 * @param {Array<{x:number,y:number,x2:number,y2:number,dir?:string,pos?:number}>} cuts
 * @returns {Array<typeof cuts[0]>} nova sequência otimizada
 */
export function optimizeCutSequence(cuts) {
    if (!cuts || cuts.length <= 2) return cuts;

    const unvisited = [...cuts];
    const ordered = [];

    // Ponto de partida: canto superior-esquerdo (origem da máquina)
    let currentX = 0;
    let currentY = 0;

    while (unvisited.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;

        for (let i = 0; i < unvisited.length; i++) {
            const c = unvisited[i];
            // Distância do cursor atual ao início deste corte
            const dx = c.x - currentX;
            const dy = c.y - currentY;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        const chosen = unvisited.splice(bestIdx, 1)[0];
        ordered.push(chosen);
        currentX = chosen.x2;
        currentY = chosen.y2;
    }

    return ordered;
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
