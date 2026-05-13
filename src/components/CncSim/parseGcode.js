// CncSim/parseGcode.js — Consolidated G-code parser  v2 (Sprint 0)
// Full arc interpolation, per-move timing, helicoidal hole detection, Z-origin compensation.
// Parses structured [OP type=xxx diam=xxx peca=xxx] comments for rich operation metadata.
// Single source of truth for Sim2D, Sim3D, PreCutWorkspace and operationalMetrics.

const RAPID_FEED_MM_MIN = 20000;

// ─── Operation categories — professional CAM palette ────────────────────────
// ORDER MATTERS: first match wins. dobradica must come before furo.
export const OP_CATS = [
    // ── dobradiça / caneco (Ø35) ──────────────────────────────────────────────
    { key: 'dobradica',  pat: /dobradiça|dobradica|câneco|caneco|hinge|dobr\./i,
      color: '#f59e0b', glow: '#fbbf24', label: 'Dobradiça' },

    // ── onion-skin / breakthrough ─────────────────────────────────────────────
    { key: 'onion_skin', pat: /onion|breakthrough|skin|passagem.?final|passe.?final/i,
      color: '#06b6d4', glow: '#22d3ee', label: 'Onion/Breakthrough' },

    // ── regular operations ────────────────────────────────────────────────────
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

/** Return the dobradica category for Ø≥32 holes, furo category otherwise. */
export function getHoleCat(diam) {
    return diam >= 32 ? OP_CATS.find(c => c.key === 'dobradica') : OP_CATS.find(c => c.key === 'furo');
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
 * Parse structured [OP type=xxx key=val ...] comment into metadata.
 * Returns null if the comment doesn't contain a structured OP tag.
 */
function parseOpTag(comment) {
    const m = comment.match(/\[OP\s+type=(\S+)([^\]]*)\]/i);
    if (!m) return null;
    const type = m[1].toLowerCase();
    const attrs = m[2];
    const getAttr = (key) => { const a = attrs.match(new RegExp(`\\b${key}=([^\\s\\]]+)`, 'i')); return a ? a[1] : null; };
    const diam    = parseFloat(getAttr('diam')  || '0') || 0;
    const prof    = parseFloat(getAttr('prof')  || '0') || 0;
    const pecaRaw = getAttr('peca') || '';
    const peca    = pecaRaw ? decodeURIComponent(pecaRaw.replace(/\+/g, ' ')) : '';
    // Classify dobradiça by diam ≥32 even if type is 'furo' or 'furo_circular'
    const effectiveType = (type === 'furo' || type === 'furo_circular') && diam >= 32
        ? 'dobradica'
        : type;
    return { type: effectiveType, diam, prof, peca };
}

/**
 * Parse G-code text into a structured simulation program.
 *
 * Returns:
 *   moves[]        — array of move objects (see below)
 *   events[]       — { moveIdx, type: 'tool'|'op'|'spindle', label, opMeta? }
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
 *     isPlunge,     ← G1/G0 vertical descent (z2 < z1, no XY)
 *     isRetract,    ← G0 vertical ascent (z2 > z1, no XY)
 *     isHole, holeCx, holeCy, holeDiam,  ← helicoidal holes
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
            const holeDiam = arcRunR * 2;
            // Determine category by diameter (dobradica if Ø≥32)
            const isDobradica = holeDiam >= 32;
            for (const m of run) {
                m.isHole = true;
                m.holeCx = arcRunCx;
                m.holeCy = arcRunCy;
                m.holeDiam = holeDiam;
                m.isDobradica = isDobradica;
            }
        }
        arcRunStart = -1;
    }

    for (let li = 0; li < rawLines.length; li++) {
        const raw = rawLines[li];

        // ── Extract full comment text ─────────────────────────────────────────
        // Support ; line comment and (inline comment)
        let commentFull = '';
        const inlineM = raw.match(/\(([^)]*)\)/g);
        if (inlineM) commentFull += inlineM.map(s => s.slice(1, -1)).join(' ');
        const eolM = raw.match(/;(.*)$/);
        if (eolM) commentFull += ' ' + eolM[1];
        commentFull = commentFull.trim();

        // ── Structured [OP type=xxx] tag — highest priority ───────────────────
        const opTag = parseOpTag(commentFull);
        if (opTag) {
            // Build a readable label
            let label = opTag.type.replace(/_/g, ' ');
            if (opTag.peca) label += ` — ${opTag.peca.slice(0, 30)}`;
            if (opTag.diam > 0) label += ` Ø${opTag.diam}mm`;
            curOp = label;
            events.push({ moveIdx: moves.length, type: 'op', label: curOp, opMeta: opTag });
        } else {
            // ── Loose operation label comment ──────────────────────────────────
            if (/===|contorno|furo|rebaixo|canal|pocket|rasgo|gola|chanfro|recorte|fresagem|usinagem|onion|breakthrough|dobradiç/i.test(commentFull)
                && !/troca|ferramenta/i.test(commentFull)) {
                const opLabel = commentFull.replace(/^=+\s*|\s*=+$/g, '').trim();
                if (opLabel && opLabel !== curOp) {
                    curOp = opLabel;
                    events.push({ moveIdx: moves.length, type: 'op', label: curOp });
                }
            }
        }

        // ── Tool change ───────────────────────────────────────────────────────
        if (/troca|ferramenta|tool\s*:/i.test(commentFull)) {
            curTool = commentFull.replace(/^(Troca:\s*|Ferramenta:\s*|Tool\s*:\s*)/i, '').trim();
            events.push({ moveIdx: moves.length, type: 'tool', label: curTool });
        }

        // ── Spindle ───────────────────────────────────────────────────────────
        if (/M0*3\b/i.test(raw) && !/M30/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle ON' });
        if (/M0*5\b/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle OFF' });

        // ── Strip comment for motion parsing ──────────────────────────────────
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');

        // Modal state
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

        // Plunge = cutting descent (Z-only, going down, G1/G2/G3)
        // Retract = rapid ascent (Z-only, going up, G0 or G1 above surface)
        const isPlunge  = isZOnly && newZ < z && mode !== 'G0';
        const isRetract = isZOnly && newZ > z;

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
                    isZOnly: false, isPlunge: false, isRetract: false,
                    isHole: false, isDobradica: false,
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
                isPlunge, isRetract,
                isHole: false, isDobradica: false,
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

/**
 * Build a structured operations list from a parsed G-code result.
 * Groups consecutive moves into named operations using event boundaries.
 *
 * Returns: Operation[] where each operation matches the schema:
 *   { id, type, label, cat, pecaDesc, toolName, diameter, depth,
 *     startMove, endMove, startLine, endLine,
 *     duration, distanceCut, distanceRapid,
 *     riskLevel, warnings, opMeta }
 */
export function buildOperations(parsed) {
    const { moves, events } = parsed;
    if (!moves.length) return [];

    const ops = [];
    let curOp = null;
    let curToolName = '';
    let curToolDiam = 6;
    let evIdx = 0;

    const finalizeCurOp = (endMoveIdx) => {
        if (!curOp) return;
        curOp.endMove = endMoveIdx;
        if (moves[endMoveIdx]) curOp.endLine = moves[endMoveIdx].lineIdx;
        ops.push(curOp);
        curOp = null;
    };

    const startOp = (label, moveIdx, opMeta) => {
        const cat = opMeta ? getOpCatFromMeta(opMeta) : getOpCat(label);
        curOp = {
            id: ops.length,
            type: cat.key,
            label: label.replace(/^=+\s*|\s*=+$/g, '').trim(),
            cat,
            pecaDesc: opMeta?.peca || '',
            toolName: curToolName,
            diameter: opMeta?.diam || curToolDiam,
            depth: opMeta?.prof || 0,
            startMove: moveIdx,
            endMove: moveIdx,
            startLine: moves[moveIdx]?.lineIdx ?? 0,
            endLine: moves[moveIdx]?.lineIdx ?? 0,
            duration: 0,
            distanceCut: 0,
            distanceRapid: 0,
            riskLevel: 'ok',
            warnings: [],
            opMeta: opMeta || null,
        };
    };

    for (let i = 0; i < moves.length; i++) {
        // Process all events at or before this move index
        while (evIdx < events.length && events[evIdx].moveIdx <= i) {
            const ev = events[evIdx];
            if (ev.type === 'tool') {
                curToolName = ev.label;
                curToolDiam = getToolDiameter(ev.label);
            }
            if (ev.type === 'op' && ev.label) {
                finalizeCurOp(Math.max(0, i - 1));
                startOp(ev.label, i, ev.opMeta || null);
            }
            evIdx++;
        }

        if (!curOp) {
            // Implicit first operation — no [OP] comment
            startOp('Sem operação', i, null);
        }

        const m = moves[i];
        curOp.endMove = i;
        if (m.lineIdx !== undefined) curOp.endLine = m.lineIdx;
        curOp.duration += m.duration;
        if (m.type === 'G0') curOp.distanceRapid += m.dist;
        else curOp.distanceCut += m.dist;
        // Track max depth
        const depth = Math.max(0, -Math.min(m.z1, m.z2));
        if (depth > curOp.depth) curOp.depth = depth;
    }

    if (curOp) finalizeCurOp(moves.length - 1);

    // Post-process: add risk assessment
    for (const op of ops) {
        // Dobradiça with wrong depth or diameter
        if (op.type === 'dobradica') {
            if (op.depth > 16) op.warnings.push(`Profundidade ${op.depth.toFixed(1)}mm incomum para dobradiça Ø35`);
            if (op.diameter > 0 && op.diameter < 30) op.warnings.push(`Ferramenta Ø${op.diameter}mm pode ser incompatível com caneco Ø35`);
        }
        // Contorno before internal ops (checked externally in operationalMetrics)
        if (op.warnings.length > 0) op.riskLevel = 'warning';
    }

    return ops;
}

/** Get op category from structured opMeta (supports dobradica by diam). */
function getOpCatFromMeta(meta) {
    if (!meta) return { key: 'outro', color: '#a6adc8', glow: '#b8c0d0', label: 'Outro' };
    if (meta.type === 'dobradica') return OP_CATS.find(c => c.key === 'dobradica') || getOpCat('dobradica');
    if (meta.type === 'onion_skin') return OP_CATS.find(c => c.key === 'onion_skin') || getOpCat('onion');
    return getOpCat(meta.type);
}
