// CncSim/Sim2D.jsx — v3, move-index animation
// Mesmo princípio do Sim3D: todo estado em $.current
// RAF avança curMove +1 a cada (60/speed) ms
// Sync de prop curMove (seek externo) via useEffect

import { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { getOpCat, getToolDiameter, OP_CATS } from './parseGcode.js';

// ── Paleta ────────────────────────────────────────────────────────────────────
const T = {
    bg:         '#090d14',
    sheet:      '#2a1f12',
    sheetFill:  '#231a0e',
    mdfTop:     '#c2a46a',
    sheetEdge:  '#4a3520',
    refilo:     'rgba(180,130,70,0.35)',
    rapid:      'rgba(200,50,40,0.45)',
    rapidDone:  'rgba(200,50,40,0.18)',
    toolBody:   '#e2e8f0',
    toolGlow:   '#fde047',
    text:       '#9ba8b8',
    textMuted:  '#546270',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getColor(m, done) {
    if (m.type === 'G0') return done ? T.rapidDone : T.rapid;
    const cat = getOpCat(m.op);
    const hex = cat.color;
    // Convert hex to rgba with opacity
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${done ? 0.9 : 0.2})`;
}

// ── Componente ────────────────────────────────────────────────────────────────
const Sim2D = forwardRef(function Sim2D(
    { parsed, chapa, playing, speed, onMoveChange, onPlayEnd },
    ref
) {
    const canvasRef = useRef(null);
    const wrapRef   = useRef(null);

    // ── ÚNICO objeto de estado ────────────────────────────────────────────────
    const $ = useRef({
        // Canvas/view
        w: 800, h: 560,
        zoom: 1, panX: 0, panY: 0,
        // Animação
        playing: false, speed: 1,
        curMove: -1, acc: 0, lastTick: 0,
        // Dados (sync durante render)
        moves: [], events: [],
        // Callbacks (sync durante render)
        onMoveChange: null, onPlayEnd: null,
        // RAF
        rafId: null,
        // Funções (set no setup)
        draw: null,
        // Pan state
        panStart: null,
    });

    const s = $.current;
    s.playing      = playing || false;
    s.speed        = speed   || 1;
    s.moves        = parsed?.moves  ?? [];
    s.events       = parsed?.events ?? [];
    s.onMoveChange = onMoveChange;
    s.onPlayEnd    = onPlayEnd;
    s.chapa        = chapaStable;   // evita stale closure em draw()

    // Chapa estável por valor
    const chapaKey = `${chapa?.comprimento}|${chapa?.largura}|${chapa?.espessura}|${chapa?.refilo}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const chapaStable = useMemo(() => chapa, [chapaKey]);

    // ── Setup (UMA VEZ) ───────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap   = wrapRef.current;
        if (!canvas || !wrap) return;

        // ── draw: renderiza o estado atual ────────────────────────────────────
        function draw() {
            const ctx = canvas.getContext('2d');
            const { w, h, zoom, panX, panY } = s;
            ctx.clearRect(0, 0, w, h);

            const mvs   = s.moves;
            const chapa = s.chapa;       // lê do ref, nunca closure stale
            const cW    = chapa?.comprimento ?? 2750;
            const cH    = chapa?.largura     ?? 1850;
            const thick = chapa?.espessura   ?? 18;
            const refilo = chapa?.refilo     ?? 10;

            // Fit chapa na canvas com margem
            const margin  = 40;
            const scaleX  = (w - margin * 2) / cW;
            const scaleY  = (h - margin * 2) / cH;
            const baseScale = Math.min(scaleX, scaleY);
            const sc      = baseScale * zoom;

            // Centro da chapa
            const originX = w / 2 - (cW * sc) / 2 + panX;
            const originY = h / 2 + (cH * sc) / 2 + panY;

            const tx = (x) => originX + x * sc;
            const ty = (y) => originY - y * sc;

            // Fundo
            ctx.fillStyle = T.bg;
            ctx.fillRect(0, 0, w, h);

            // Chapa MDF
            ctx.fillStyle = T.sheetFill;
            ctx.fillRect(tx(0), ty(cH), cW * sc, cH * sc);
            ctx.strokeStyle = T.sheetEdge;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tx(0), ty(cH), cW * sc, cH * sc);

            // Refilo
            if (refilo > 0) {
                ctx.strokeStyle = T.refilo;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(tx(refilo), ty(cH - refilo), (cW - 2*refilo) * sc, (cH - 2*refilo) * sc);
                ctx.setLineDash([]);
            }

            // Dimensões
            ctx.fillStyle = T.textMuted;
            ctx.font = `${Math.max(8, sc * 15)}px monospace`;
            ctx.fillText(`${cW}×${cH}mm`, tx(cW / 2) - 25, ty(cH) - 5);

            if (!mvs.length) return;

            // Ferramenta atual (diâmetro)
            let toolDiam = 6;
            let evIdx = 0;
            const cMove = s.curMove;

            // Pré-passa eventos até curMove para saber diâmetro atual
            for (const ev of s.events) {
                if (ev.moveIdx > cMove) break;
                if (ev.type === 'tool') toolDiam = getToolDiameter(ev.label);
            }

            // Desenha moves
            for (let i = 0; i < mvs.length; i++) {
                // Atualiza diâmetro
                while (evIdx < s.events.length && s.events[evIdx].moveIdx <= i) {
                    if (s.events[evIdx].type === 'tool') toolDiam = getToolDiameter(s.events[evIdx].label);
                    evIdx++;
                }

                const m    = mvs[i];
                const done = cMove >= 0 && i <= cMove;

                if (m.type === 'G0') {
                    if (!done) continue; // Oculta rapids futuros
                    ctx.strokeStyle = T.rapidDone;
                    ctx.lineWidth   = 0.5;
                    ctx.setLineDash([3, 5]);
                    ctx.beginPath();
                    ctx.moveTo(tx(m.x1), ty(m.y1));
                    ctx.lineTo(tx(m.x2), ty(m.y2));
                    ctx.stroke();
                    ctx.setLineDash([]);
                    continue;
                }

                const cat   = getOpCat(m.op);
                const hex   = cat.color;
                const r_c   = parseInt(hex.slice(1, 3), 16);
                const g_c   = parseInt(hex.slice(3, 5), 16);
                const b_c   = parseInt(hex.slice(5, 7), 16);
                const alpha = done ? 0.85 : 0.18;
                ctx.strokeStyle = `rgba(${r_c},${g_c},${b_c},${alpha})`;
                ctx.lineWidth   = Math.max(0.8, toolDiam * sc);
                ctx.lineCap     = 'round';
                ctx.beginPath();
                ctx.moveTo(tx(m.x1), ty(m.y1));
                ctx.lineTo(tx(m.x2), ty(m.y2));
                ctx.stroke();
            }

            // Ferramenta atual
            if (cMove >= 0 && cMove < mvs.length) {
                const m = mvs[cMove];
                if (m.type !== 'G0') {
                    const cx2 = tx(m.x2), cy2 = ty(m.y2);
                    const tr  = Math.max(3, toolDiam * sc / 2);
                    // Glow
                    const grd = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, tr * 3);
                    grd.addColorStop(0, 'rgba(253,224,71,0.4)');
                    grd.addColorStop(1, 'rgba(253,224,71,0)');
                    ctx.beginPath(); ctx.arc(cx2, cy2, tr * 3, 0, Math.PI * 2);
                    ctx.fillStyle = grd; ctx.fill();
                    // Corpo
                    ctx.beginPath(); ctx.arc(cx2, cy2, tr, 0, Math.PI * 2);
                    ctx.fillStyle = T.toolGlow; ctx.fill();
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
        s.draw = draw;

        // ── Resize observer ───────────────────────────────────────────────────
        const ro = new ResizeObserver(() => {
            const rect = wrap.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            canvas.width  = rect.width;
            canvas.height = rect.height;
            s.w = rect.width; s.h = rect.height;
            draw();
        });
        ro.observe(wrap);

        // ── Pan com mouse ─────────────────────────────────────────────────────
        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            s.panStart = { x: e.clientX - s.panX, y: e.clientY - s.panY };
        };
        const onMouseMove = (e) => {
            if (!s.panStart) return;
            s.panX = e.clientX - s.panStart.x;
            s.panY = e.clientY - s.panStart.y;
            draw();
        };
        const onMouseUp   = () => { s.panStart = null; };
        const onWheel     = (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            s.zoom = Math.max(0.2, Math.min(10, s.zoom * factor));
            draw();
        };
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        // ── Double-click: reset view ──────────────────────────────────────────
        canvas.addEventListener('dblclick', () => {
            s.zoom = 1; s.panX = 0; s.panY = 0; draw();
        });

        // ── RAF loop ──────────────────────────────────────────────────────────
        function tick(now) {
            s.rafId = requestAnimationFrame(tick);

            if (s.playing && s.moves.length > 0) {
                const interval = Math.max(1, 60 / s.speed);
                const dt       = Math.min(now - s.lastTick, 200);
                s.acc += dt;

                let moved = false;
                while (s.acc >= interval && s.curMove < s.moves.length - 1) {
                    s.curMove++;
                    s.acc -= interval;
                    moved = true;
                }

                if (moved) {
                    draw();
                    const m = s.moves[s.curMove];
                    s.onMoveChange?.(s.curMove, m?.lineIdx ?? -1, m?.tEnd ?? 0);
                }

                if (s.curMove >= s.moves.length - 1) {
                    s.playing = false;
                    s.onPlayEnd?.();
                }
            }

            s.lastTick = now;
        }
        s.lastTick = performance.now();
        s.rafId    = requestAnimationFrame(tick);

        // Render inicial
        const rect = wrap.getBoundingClientRect();
        if (rect.width && rect.height) {
            canvas.width  = rect.width;
            canvas.height = rect.height;
            s.w = rect.width; s.h = rect.height;
        }
        draw();

        return () => {
            cancelAnimationFrame(s.rafId);
            ro.disconnect();
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('wheel', onWheel);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Rebuild quando G-code/chapa mudam ────────────────────────────────────
    useEffect(() => {
        s.curMove = -1; s.acc = 0;
        s.draw?.();
    }, [parsed, chapaStable]); // eslint-disable-line react-hooks/exhaustive-deps

    // Seek externo: feito exclusivamente via API imperativa seekTo()
    // NÃO usar prop curMove para drive — causaria backward-jump ao pausar
    // (React state fica defasado em relação a s.curMove durante playback rápido)

    // ── API imperativa ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset: () => {
            s.curMove = -1; s.acc = 0;
            s.draw?.();
        },
        seekTo: (idx) => {
            const i = Math.max(-1, Math.min(s.moves.length - 1, idx));
            s.curMove = i; s.acc = 0;
            s.draw?.();
        },
        getTotalMoves:  () => s.moves.length,
        getCurMove:     () => s.curMove,
        getTotalTime:   () => parsed?.totalTime ?? 0,
        getCurrentTime: () => s.curMove >= 0 ? (s.moves[s.curMove]?.tEnd ?? 0) : 0,
    }));

    return (
        <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.bg }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }} />
            <div style={{
                position: 'absolute', bottom: 8, right: 10,
                fontSize: 9, color: T.textMuted, fontFamily: 'monospace',
                pointerEvents: 'none',
            }}>
                scroll: zoom · arraste: pan · 2×clique: reset
            </div>
        </div>
    );
});

export default Sim2D;
