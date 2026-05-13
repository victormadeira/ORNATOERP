// CncSim/parseGcode.js — Consolidated G-code parser
// Full arc interpolation, per-move timing, helicoidal hole detection, Z-origin compensation.
// Single source of truth for both Sim2D and Sim3D.

const RAPID_FEED_MM_MIN = 20000;

// ─── Operation categories — professional CAM palette ────────────────────────
export const OP_CATS = [
    { key: 'contorno', pat: /contorno/i,                       color: '#e09030', glow: '#f0a840', label: 'Contorno' },
    { key: 'rebaixo',  pat: /rebaixo/i,                        color: '#3090d8', glow: '#40a8f0', label: 'Rebaixo' },
    { key: 'canal',    pat: /canal/i,                          color: '#9060c0', glow: '#a878d8', label: 'Canal' },
    { key: 'furo',     pat: /furo|hole|helicoidal|circular/i,  color: '#e04030', glow: '#f05040', label: 'Furo' },
    { key: 'pocket',   pat: /pocket|rebaixo_pocket/i,          color: '#d07020', glow: '#e08830', label: 'Pocket' },
    { key: 'rasgo',    pat: /rasgo/i,                          color: '#20a898', glow: '#28c0b0', label: 'Rasgo' },
    { key: 'gola',     pat: /gola/i,                           color: '#a88010', glow: '#c09820', label: 'Gola' },
    { key: 'chanfro',  pat: /chanfro|chamfer/i,                color: '#c06828', glow: '#d88038', label: 'Chanfro' },
    { key: 'recorte',  pat: /recorte|passa.?fio/i,             color: '#6870c0', glow: '#8090d8', label: 'Recorte' },
    { key: 'fresagem', pat: /fresagem|milling/i,               color: '#2898c0', glow: '#38b0d8', label: 'Fresagem' },
];

export function getOpCat(op) {
    const lo = (op || '').toLowerCase();
    for (const c of OP_CATS) {
        if (c.pat.test(lo)) return c;
    }
    return { key: 'outro', color: '#a6adc8', glow: '#b8c0d0', label: 'Outro' };
}

/** Extract tool diameter in mm from a tool name string (e.g. "Fresa 6mm" → 6). */
export function getToolDiameter(name) {
    const m = (name || '').match(/(\d+(?:\.\d+)?)\s*mm/i);
    return m ? parseFloat(m[1]) : 6;
}

/** Feed-rate heat color: blue=slow → green=normal → red=fast */
export function feedHeatColor(feed, minFeed, maxFeed) {
    if (!feed || maxFeed <= minFeed) return '#a6adc8';
    const t = Math.max(0, Math.min(1, (feed - minFeed) / (maxFeed - minFeed)));
    if (t < 0.33) {
        const f = t / 0.33;
        return `rgb(220,${Math.round(60 + f * 160)},30)`;
    }
    if (t < 0.66) {
        const f = (t - 0.33) / 0.33;
        return `rgb(${Math.round(220 - f * 140)},${Math.round(220 - f * 30)},30)`;
    }
    const f = (t - 0.66) / 0.34;
    return `rgb(${Math.round(80 - f * 60)},${Math.round(190 + f * 30)},${Math.round(30 + f * 180)})`;
}

/**
 * Parse G-code text into a structured simulation program.
 *
 * Returns:
 *   moves[]        — array of move objects (see below)
 *   events[]       — { moveIdx, type: 'tool'|'op'|'spindle', label }
 *   rawLines[]     — original lines for syntax highlighting
 *   lineToMoveIdx  — { lineIdx → first moveIdx on that line }
 *   totalTime      — total estimated machining time in seconds
 *   minFeed/maxFeed
 *
 * Each move object:
 *   { type, x1,y1,z1, x2,y2,z2, tool, op, feed,
 *     dist, duration, tStart, tEnd,
 *     isArc, arcCx, arcCy, arcR,
 *     isZOnly,
 *     isHole, holeCx, holeCy, holeDiam,  ← helicoidal holes only
 *     lineIdx }
 */
export function parseGcode(gcodeText) {
    const moves       = [];
    const events      = [];
    const rawLines    = gcodeText ? gcodeText.split('\n') : [];
    const lineToMoveIdx = {};

    // Z-origin compensation: some post-processors set Z0 at the machine table
    // ("mesa") instead of the material top surface. Detect and compensate.
    const isMesaOrigin = /Z0=mesa/i.test(gcodeText || '');
    const espMatch     = (gcodeText || '').match(/\besp=(\d+(?:\.\d+)?)mm/);
    const espChapa     = espMatch ? parseFloat(espMatch[1]) : 0;
    const zOff         = isMesaOrigin && espChapa > 0 ? -espChapa : 0;

    let x = 0, y = 0, z = 0;
    let mode = 'G0';
    let curTool = '', curOp = '', curFeed = 0;

    // Helicoidal hole detection — track arc runs
    let arcRunStart = -1;
    let arcRunCx = 0, arcRunCy = 0, arcRunR = 0;
    let arcRunZ0 = 0;

    function flushArcRun(endIdx) {
        if (arcRunStart < 0 || endIdx - arcRunStart < 3) { arcRunStart = -1; return; }
        const run = moves.slice(arcRunStart, endIdx);
        const zDrop = Math.abs(run[run.length - 1].z2 - arcRunZ0);
        if (zDrop > 0.3) {
            // Tag all moves in run as helicoidal hole
            for (const m of run) {
                m.isHole = true;
                m.holeCx = arcRunCx;
                m.holeCy = arcRunCy;
                m.holeDiam = arcRunR * 2;
            }
        }
        arcRunStart = -1;
    }

    for (let li = 0; li < rawLines.length; li++) {
        const raw = rawLines[li];

        // Extract comment before stripping
        const cmtM = raw.match(/[;(]\s*(.+?)\s*\)?$/);
        const comment = cmtM ? cmtM[1] : '';

        // Tool change comment
        if (/troca|ferramenta|tool\s*:/i.test(comment)) {
            curTool = comment.replace(/^(Troca:\s*|Ferramenta:\s*|Tool\s*:\s*)/i, '').trim();
            events.push({ moveIdx: moves.length, type: 'tool', label: curTool });
        }

        // Operation label comment (=== Contorno ..., ; Furo ..., etc.)
        if (/===|contorno|furo|rebaixo|canal|pocket|rasgo|gola|chanfro|recorte|fresagem|usinagem/i.test(comment)
            && !/troca|ferramenta/i.test(comment)) {
            const opLabel = comment.replace(/^=+\s*|\s*=+$/g, '').trim();
            if (opLabel) {
                curOp = opLabel;
                events.push({ moveIdx: moves.length, type: 'op', label: curOp });
            }
        }

        // Spindle on/off
        if (/M0*3\b/i.test(raw) && !/M30/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle ON' });
        if (/M0*5\b/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle OFF' });

        // Strip comment for parsing
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');

        // Mode
        const gM = cmd.match(/G([0-3])\b/i);
        if (gM) mode = `G${gM[1]}`;

        // Feed rate (persists)
        const fM = cmd.match(/F([+-]?[\d.]+)/i);
        if (fM) curFeed = parseFloat(fM[1]);

        // Axes
        const xM = cmd.match(/X([+-]?[\d.]+)/i);
        const yM = cmd.match(/Y([+-]?[\d.]+)/i);
        const zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const iM = cmd.match(/I([+-]?[\d.]+)/i);
        const jM = cmd.match(/J([+-]?[\d.]+)/i);

        if (!xM && !yM && !zM) continue;

        const newX  = xM ? parseFloat(xM[1]) : x;
        const newY  = yM ? parseFloat(yM[1]) : y;
        const newZ  = zM ? parseFloat(zM[1]) : z;
        const isZOnly = !xM && !yM && Boolean(zM);

        if (mode === 'G2' || mode === 'G3') {
            // ── Arc interpolation ────────────────────────────────────────────
            const ix = iM ? parseFloat(iM[1]) : 0;
            const jj = jM ? parseFloat(jM[1]) : 0;
            const cx2 = x + ix, cy2 = y + jj;
            const r   = Math.max(0.001, Math.hypot(ix, jj));

            // Start arc run tracker
            if (arcRunStart < 0) {
                arcRunStart = moves.length;
                arcRunCx = cx2; arcRunCy = cy2; arcRunR = r;
                arcRunZ0 = z;
            } else {
                // Weighted average center for multi-segment arcs
                const n = moves.length - arcRunStart + 1;
                arcRunCx = (arcRunCx * (n - 1) + cx2) / n;
                arcRunCy = (arcRunCy * (n - 1) + cy2) / n;
                arcRunR  = Math.max(arcRunR, r);
            }

            let startA = Math.atan2(y - cy2, x - cx2);
            let endA   = Math.atan2(newY - cy2, newX - cx2);
            const cw   = mode === 'G2';
            if (Math.hypot(newX - x, newY - y) < 0.05) {
                // Full circle
                endA = cw ? startA - Math.PI * 2 : startA + Math.PI * 2;
            } else {
                if (cw  && endA >= startA) endA -= Math.PI * 2;
                if (!cw && endA <= startA) endA += Math.PI * 2;
            }

            const totalAngle = Math.abs(endA - startA);
            const steps = Math.max(Math.round(totalAngle / (Math.PI / 18)), 4); // ≤10° per step

            if (xM || yM) lineToMoveIdx[li] = lineToMoveIdx[li] ?? moves.length;

            for (let s = 1; s <= steps; s++) {
                const t = s / steps;
                const a  = startA + (endA - startA) * t;
                const sx = cx2 + r * Math.cos(a);
                const sy = cy2 + r * Math.sin(a);
                const sz = z + (newZ - z) * t;
                const prev = s > 1 ? moves[moves.length - 1] : null;
                moves.push({
                    type: mode, lineIdx: li,
                    x1: prev ? prev.x2 : x,
                    y1: prev ? prev.y2 : y,
                    z1: prev ? prev.z2 : z,
                    x2: sx, y2: sy, z2: sz,
                    tool: curTool, op: curOp, feed: curFeed,
                    isArc: true, arcCx: cx2, arcCy: cy2, arcR: r,
                    isZOnly: false, isHole: false,
                });
            }

        } else {
            // ── Linear move (G0 or G1) ────────────────────────────────────────
            if (arcRunStart >= 0) flushArcRun(moves.length);
            if (xM || yM) lineToMoveIdx[li] = lineToMoveIdx[li] ?? moves.length;
            moves.push({
                type: mode, lineIdx: li,
                x1: x, y1: y, z1: z,
                x2: newX, y2: newY, z2: newZ,
                tool: curTool, op: curOp, feed: curFeed,
                isArc: false, isZOnly,
                isHole: false,
            });
        }

        x = newX; y = newY; z = newZ;
    }

    if (arcRunStart >= 0) flushArcRun(moves.length);

    // Apply Z-origin offset
    if (zOff !== 0) {
        for (const m of moves) { m.z1 += zOff; m.z2 += zOff; }
    }

    // Per-move timing — dist + duration + cumulative tStart/tEnd
    let acc = 0;
    for (const m of moves) {
        const dist      = Math.hypot(m.x2 - m.x1, m.y2 - m.y1, m.z2 - m.z1);
        const effFeed   = m.type === 'G0' ? RAPID_FEED_MM_MIN : (m.feed || 1000);
        m.dist          = dist;
        m.duration      = dist / (effFeed / 60); // seconds
        m.tStart        = acc;
        acc            += m.duration;
        m.tEnd          = acc;
    }

    const feeds   = moves.filter(m => m.type !== 'G0' && m.feed > 0).map(m => m.feed);
    const minFeed = feeds.length ? Math.min(...feeds) : 0;
    const maxFeed = feeds.length ? Math.max(...feeds) : 1;

    return { moves, events, rawLines, lineToMoveIdx, totalTime: acc, minFeed, maxFeed };
}
