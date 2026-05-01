// Extraído automaticamente de ProducaoCNC.jsx (linhas 6690-6746).

export function parseGcodeForSim(text) {
    const moves = [];
    const events = []; // { moveIdx, type: 'tool'|'op'|'spindle', label }
    let x = 0, y = 0, z = 0, mode = 'G0';
    let curTool = '', curOp = '', curFeed = 0;
    for (const raw of text.split('\n')) {
        // Extrair comentários antes de removê-los
        const cmtMatch = raw.match(/[;(]\s*(.+?)\s*\)?$/);
        const comment = cmtMatch ? cmtMatch[1] : '';
        // Detectar troca de ferramenta via comentário (ex: "; Troca: Fresa 6mm" ou "( Ferramenta: ... )")
        if (/troca|ferramenta|tool/i.test(comment)) {
            curTool = comment.replace(/^(Troca:\s*|Ferramenta:\s*|Tool:\s*)/i, '').trim();
            events.push({ moveIdx: moves.length, type: 'tool', label: curTool });
        }
        // Detectar operação via comentário (ex: "; === Contorno Peca: Lateral Direita ===" ou "; Furo ...")
        if (/===|contorno|furo|rebaixo|canal|pocket|usinagem/i.test(comment) && !/troca|ferramenta/i.test(comment)) {
            curOp = comment.replace(/^=+\s*|\s*=+$/g, '').trim();
            events.push({ moveIdx: moves.length, type: 'op', label: curOp });
        }
        // Detectar spindle
        if (/M3\b|M03\b/i.test(raw) && !/M30/i.test(raw)) {
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle ON' });
        }
        if (/M5\b|M05\b/i.test(raw)) {
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle OFF' });
        }
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');
        const gMatch = cmd.match(/G([0-3])\b/i);
        if (gMatch) mode = `G${gMatch[1]}`;
        // Parse feed rate (F) — persiste até ser substituído
        const fM = cmd.match(/F([+-]?[\d.]+)/i);
        if (fM) curFeed = parseFloat(fM[1]);
        const xM = cmd.match(/X([+-]?[\d.]+)/i), yM = cmd.match(/Y([+-]?[\d.]+)/i), zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const newX = xM ? parseFloat(xM[1]) : x, newY = yM ? parseFloat(yM[1]) : y, newZ = zM ? parseFloat(zM[1]) : z;
        if (xM || yM) {
            moves.push({ type: mode, x1: x, y1: y, z1: z, x2: newX, y2: newY, z2: newZ, tool: curTool, op: curOp, feed: curFeed });
        }
        x = newX; y = newY; z = newZ;
    }
    // Calcular range de feeds para normalização do heatmap
    const feeds = moves.filter(m => m.type !== 'G0' && m.feed > 0).map(m => m.feed);
    const minFeed = feeds.length ? Math.min(...feeds) : 0;
    const maxFeed = feeds.length ? Math.max(...feeds) : 1;
    return { moves, events, minFeed, maxFeed };
}

/** Retorna cor heatmap para um feed rate (azul=lento, verde=médio, vermelho=rápido) */
export function feedHeatColor(feed, minFeed, maxFeed) {
    if (!feed || maxFeed <= minFeed) return '#a6adc8';
    const t = Math.max(0, Math.min(1, (feed - minFeed) / (maxFeed - minFeed)));
    // Gradiente: vermelho (lento/rampa) → amarelo → verde (normal) → azul (rápido)
    if (t < 0.33) {
        // vermelho → amarelo
        const f = t / 0.33;
        return `rgb(${220},${Math.round(60 + f * 160)},${30})`;
    } else if (t < 0.66) {
        // amarelo → verde
        const f = (t - 0.33) / 0.33;
        return `rgb(${Math.round(220 - f * 140)},${Math.round(220 - f * 30)},${30})`;
    } else {
        // verde → azul claro
        const f = (t - 0.66) / 0.34;
        return `rgb(${Math.round(80 - f * 60)},${Math.round(190 + f * 30)},${Math.round(30 + f * 180)})`;
    }
}

// ─── Categorias de operação CNC — paleta profissional ─────────────────────
const OP_CATS = [
    { key: 'contorno', pat: /contorno/i,                    color: '#d48820', label: 'Contorno' },
    { key: 'rebaixo',  pat: /rebaixo/i,                     color: '#2878c0', label: 'Rebaixo' },
    { key: 'canal',    pat: /canal/i,                       color: '#8050a8', label: 'Canal' },
    { key: 'furo',     pat: /furo|hole|helicoidal|circular/i, color: '#c03020', label: 'Furo' },
    { key: 'pocket',   pat: /pocket/i,                      color: '#c06010', label: 'Pocket' },
    { key: 'rasgo',    pat: /rasgo/i,                       color: '#189080', label: 'Rasgo' },
    { key: 'gola',     pat: /gola/i,                        color: '#906808', label: 'Gola' },
    { key: 'chanfro',  pat: /chanfro|chamfer/i,             color: '#b05820', label: 'Chanfro' },
    { key: 'recorte',  pat: /recorte|passa.?fio/i,          color: '#5858a8', label: 'Recorte' },
    { key: 'fresagem', pat: /fresagem|milling/i,            color: '#2088b0', label: 'Fresagem' },
];
export function getOpCat(op) {
    const lo = (op || '').toLowerCase();
    for (const c of OP_CATS) { if (c.pat.test(lo)) return c; }
    return { key: 'outro', color: '#a6adc8', label: 'Outro' };
}

// ─── Simulador 2D Canvas com Animação + Cores por Operação ───
