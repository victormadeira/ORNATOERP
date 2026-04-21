// Extraído automaticamente de ProducaoCNC.jsx (linhas 6690-6746).

export function parseGcodeForSim(text) {
    const moves = [];
    const events = []; // { moveIdx, type: 'tool'|'op'|'spindle', label }
    let x = 0, y = 0, z = 0, mode = 'G0';
    let curTool = '', curOp = '';
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
        const xM = cmd.match(/X([+-]?[\d.]+)/i), yM = cmd.match(/Y([+-]?[\d.]+)/i), zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const newX = xM ? parseFloat(xM[1]) : x, newY = yM ? parseFloat(yM[1]) : y, newZ = zM ? parseFloat(zM[1]) : z;
        if (xM || yM) { moves.push({ type: mode, x1: x, y1: y, z1: z, x2: newX, y2: newY, z2: newZ, tool: curTool, op: curOp }); }
        x = newX; y = newY; z = newZ;
    }
    return { moves, events };
}

// ─── Categorias de operação CNC (cores por tipo) ───────────────────────────
const OP_CATS = [
    { key: 'contorno', pat: /contorno/i, color: '#a6e3a1', label: 'Contorno' },
    { key: 'rebaixo',  pat: /rebaixo/i,  color: '#89b4fa', label: 'Rebaixo' },
    { key: 'canal',    pat: /canal/i,    color: '#cba6f7', label: 'Canal' },
    { key: 'furo',     pat: /furo/i,     color: '#f9e2af', label: 'Furo' },
    { key: 'pocket',   pat: /pocket/i,   color: '#f38ba8', label: 'Pocket' },
    { key: 'rasgo',    pat: /rasgo/i,    color: '#94e2d5', label: 'Rasgo' },
    { key: 'gola',     pat: /gola/i,     color: '#fab387', label: 'Gola' },
    { key: 'fresagem', pat: /fresagem/i, color: '#74c7ec', label: 'Fresagem' },
];
export function getOpCat(op) {
    const lo = (op || '').toLowerCase();
    for (const c of OP_CATS) { if (c.pat.test(lo)) return c; }
    return { key: 'outro', color: '#a6adc8', label: 'Outro' };
}

// ─── Simulador 2D Canvas com Animação + Cores por Operação ───
