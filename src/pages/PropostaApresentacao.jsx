import { useState, useEffect, useRef, useCallback } from 'react';
import { initClarity, identifyClarity, setClarityTag } from '../utils/clarity';

// ═══════════════════════════════════════════════════════════════════════════════
// PropostaApresentacao — Landing Page pré-proposta com identidade Ornato
// ═══════════════════════════════════════════════════════════════════════════════

const TIMELINE_STEPS = [
    { title: 'Aprovação do Orçamento', desc: 'Apresentação detalhada da proposta financeira com todos os itens especificados e possibilidades de customização.', icon: 'doc' },
    { title: 'Assinatura do Contrato', desc: 'Formalização do acordo com especificações técnicas, prazos e garantias, assegurando transparência em todo o processo.', icon: 'pen' },
    { title: 'Medição in Loco', desc: 'Visita técnica para medição e análise do espaço, garantindo a perfeita adaptação dos móveis e a realização do seu sonho como você imaginou.', icon: 'ruler' },
    { title: 'Aprovação do Caderno Técnico', desc: 'Aprovação do Caderno Técnico onde suas escolhas viram lei! Documentamos cada acabamento e ferragem para garantir que o projeto final seja exatamente aquele que você aprovou.', icon: 'check' },
    { title: 'Produção', desc: 'Fabricação com materiais premium: corte CNC de precisão e acabamento com fita de borda em coladeira industrial, com relatórios de acompanhamento do processo.', icon: 'gear' },
    { title: 'Montagem e Instalação', desc: 'Montagem e instalação por equipe especializada, com atenção aos detalhes e cuidado com seu espaço, garantindo acabamento perfeito.', icon: 'tool' },
    { title: 'Acompanhamento Pós-Venda', desc: 'Pós-venda com suporte completo para garantir sua total satisfação. E quando surgir aquela vontade de renovar outro ambiente, já sabe onde nos encontrar para o próximo sonho!', icon: 'heart' },
];

// ── SVG Icons inline (zero dependência) ─────────────────────────────────────
const icons = {
    doc: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    pen: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
    ruler: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 15.3a2.4 2.4 0 010 3.4l-2.6 2.6a2.4 2.4 0 01-3.4 0L2.7 8.7a2.4 2.4 0 010-3.4l2.6-2.6a2.4 2.4 0 013.4 0z"/><line x1="14.5" y1="12.5" x2="11.5" y2="9.5"/><line x1="11" y1="16" x2="8" y2="13"/><line x1="18" y1="9" x2="15" y2="6"/></svg>,
    check: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
    gear: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    tool: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
    heart: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
    chevron: (c) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
    phone: (c) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>,
    mail: (c) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
};

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

function getYouTubeId(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
        return u.searchParams.get('v') || null;
    } catch { return null; }
}

// ── SVG: Serra Circular Metálica (inspirada na referência) ───────────────────
function SawBladeSVG({
    color,
    size = 70,
    spinSeconds = 2,
    spinDirection = 1,
    paused = false,
    glowBoost = 0.5,
}) {
    const teeth = 24;
    const outerR = 50;
    const innerR = 38;
    const holeR = 6;
    const toothDepth = 8;

    // Gera path dos dentes (geometria da referência)
    let d = '';
    const step = (2 * Math.PI) / teeth;
    for (let i = 0; i < teeth; i++) {
        const a = i * step;
        const tipA = a + step * 0.15;
        const gulA = a + step * 0.5;
        const backA = a + step * 0.75;
        const nextA = (i + 1) * step;
        const tx = Math.cos(tipA) * outerR;
        const ty = Math.sin(tipA) * outerR;
        const gx = Math.cos(gulA) * (outerR - toothDepth);
        const gy = Math.sin(gulA) * (outerR - toothDepth);
        const bx = Math.cos(backA) * (outerR - toothDepth * 0.3);
        const by = Math.sin(backA) * (outerR - toothDepth * 0.3);
        const nx = Math.cos(nextA) * (outerR - toothDepth * 0.1);
        const ny = Math.sin(nextA) * (outerR - toothDepth * 0.1);
        d += `${i === 0 ? 'M' : 'L'}${tx.toFixed(1)} ${ty.toFixed(1)} `;
        d += `L${gx.toFixed(1)} ${gy.toFixed(1)} `;
        d += `L${bx.toFixed(1)} ${by.toFixed(1)} `;
        d += `L${nx.toFixed(1)} ${ny.toFixed(1)} `;
    }
    d += 'Z';

    // 6 slots de expansão
    const slots = [];
    for (let i = 0; i < 6; i++) {
        const a = (i * 2 * Math.PI) / 6;
        slots.push({ x1: (Math.cos(a) * 14).toFixed(1), y1: (Math.sin(a) * 14).toFixed(1), x2: (Math.cos(a) * 30).toFixed(1), y2: (Math.sin(a) * 30).toFixed(1) });
    }

    const glowOuter = clamp(0.08 + glowBoost * 0.32, 0.08, 0.42);
    const glowInner = clamp(0.04 + glowBoost * 0.2, 0.04, 0.24);

    return (
        <div className="ap-saw-wrapper">
            {/* Glow radial atrás da serra */}
            <div
                className="ap-saw-glow"
                style={{
                    background: `radial-gradient(circle, ${color}${Math.round(glowOuter * 255).toString(16).padStart(2, '0')} 0%, ${color}${Math.round(glowInner * 255).toString(16).padStart(2, '0')} 42%, transparent 72%)`,
                }}
            />
            <svg
                width={size}
                height={size}
                viewBox="-55 -55 110 110"
                className="ap-saw-svg"
                style={{
                    animationDuration: `${spinSeconds}s`,
                    animationDirection: spinDirection >= 0 ? 'normal' : 'reverse',
                    animationPlayState: paused ? 'paused' : 'running',
                    willChange: 'transform',
                }}
            >
                <defs>
                    <radialGradient id="apBladeGrad" cx="35%" cy="35%">
                        <stop offset="0%" stopColor="#E8E0D0" />
                        <stop offset="30%" stopColor="#C0B8A8" />
                        <stop offset="60%" stopColor="#A09888" />
                        <stop offset="85%" stopColor="#B8B0A0" />
                        <stop offset="100%" stopColor="#908878" />
                    </radialGradient>
                    <radialGradient id="apTeethGrad" cx="50%" cy="50%">
                        <stop offset="0%" stopColor="#D4C8B8" />
                        <stop offset="50%" stopColor="#B0A898" />
                        <stop offset="100%" stopColor="#C8C0B0" />
                    </radialGradient>
                    <linearGradient id="apShine" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="50%" stopColor="rgba(255,255,255,0)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
                    </linearGradient>
                </defs>
                {/* Disco corpo */}
                <circle cx="0" cy="0" r={innerR} fill="url(#apBladeGrad)" />
                {/* Dentes */}
                <path d={d} fill="url(#apTeethGrad)" stroke="rgba(80,70,60,0.5)" strokeWidth="0.3" />
                {/* Slots de expansão */}
                {slots.map((s, i) => <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" strokeLinecap="round" />)}
                {/* Brilho */}
                <circle cx="0" cy="0" r={outerR - 1} fill="url(#apShine)" />
                {/* Furo central */}
                <circle cx="0" cy="0" r={holeR} fill="#1a1a1a" stroke="rgba(100,90,80,0.6)" strokeWidth="0.5" />
                <circle cx="0" cy="0" r={holeR + 3} fill="none" stroke="rgba(100,90,80,0.3)" strokeWidth="0.4" />
            </svg>
        </div>
    );
}

// ── Canvas Particle System — Serragem realista ────────────────────────────
function SawDustCanvas({ active, scrolling, direction = 1, intensity = 0.45, reducedMotion = false }) {
    const canvasRef = useRef(null);
    const particles = useRef([]);
    const animRef = useRef(null);
    const updateRef = useRef(null);
    const scrollingRef = useRef(false);
    const dirRef = useRef(1);
    const intensityRef = useRef(clamp(intensity, 0, 1));

    useEffect(() => {
        scrollingRef.current = scrolling;
        if (scrolling && active && !reducedMotion && !animRef.current && updateRef.current) {
            animRef.current = requestAnimationFrame(updateRef.current);
        }
    }, [scrolling, active, reducedMotion]);
    useEffect(() => { dirRef.current = direction; }, [direction]);
    useEffect(() => { intensityRef.current = clamp(intensity, 0, 1); }, [intensity]);

    useEffect(() => {
        if (!active || reducedMotion) {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            animRef.current = null;
            updateRef.current = null;
            particles.current = [];
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const W = 160, H = 180;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const srcX = W / 2, srcY = H / 2;
        let lastSpawn = 0;
        let lastTs = performance.now();

        const spawn = (now) => {
            if (!scrollingRef.current) return;
            const drive = intensityRef.current;
            const spawnGap = lerp(36, 16, drive);
            if (now - lastSpawn < spawnGap) return;
            lastSpawn = now;

            const baseAngle = dirRef.current > 0 ? -Math.PI / 2 : Math.PI / 2;
            const n = Math.max(3, Math.round(lerp(4, 11, drive) + Math.random() * 2));
            const speedBoost = lerp(0.85, 1.8, drive);

            for (let i = 0; i < n; i++) {
                const r = Math.random();
                if (r < 0.48) {
                    const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.58;
                    const speed = (0.35 + Math.random() * 1.35) * speedBoost;
                    particles.current.push({
                        x: srcX + (Math.random() - 0.5) * 14, y: srcY + (Math.random() - 0.5) * 8,
                        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                        radius: 0.35 + Math.random() * 0.9, life: 1,
                        decay: 0.01 + Math.random() * 0.017,
                        color: DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)],
                        kind: 'dust',
                    });
                } else if (r < 0.9) {
                    const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.42;
                    const speed = (0.65 + Math.random() * 1.95) * speedBoost;
                    particles.current.push({
                        x: srcX + (Math.random() - 0.5) * 10, y: srcY + (Math.random() - 0.5) * 5,
                        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                        radius: 0.55 + Math.random() * 1.35, life: 1,
                        decay: 0.014 + Math.random() * 0.02,
                        color: MDF_COLORS[Math.floor(Math.random() * MDF_COLORS.length)],
                        kind: 'medium',
                    });
                } else {
                    const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.3;
                    const speed = (1.2 + Math.random() * 2.6) * speedBoost;
                    particles.current.push({
                        x: srcX + (Math.random() - 0.5) * 6, y: srcY,
                        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                        w: 1.5 + Math.random() * 2.4, h: 0.5 + Math.random() * 1,
                        life: 1, decay: 0.02 + Math.random() * 0.03,
                        color: MDF_COLORS[Math.floor(Math.random() * MDF_COLORS.length)],
                        kind: 'chip', rot: Math.random() * Math.PI * 2,
                        rotV: (Math.random() - 0.5) * 0.15,
                    });
                }
            }
        };

        const update = (now) => {
            const dt = clamp((now - lastTs) / 16.67, 0.65, 2.2);
            lastTs = now;

            const ps = particles.current;
            const hasWork = scrollingRef.current || ps.length > 0;
            if (!hasWork) {
                animRef.current = null;
                return;
            }

            ctx.clearRect(0, 0, W, H);
            spawn(now);
            if (ps.length > 140) ps.splice(0, ps.length - 140);

            for (let i = ps.length - 1; i >= 0; i--) {
                const p = ps[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= p.decay * dt;

                if (p.kind === 'chip') {
                    p.vy += 0.08 * dt;
                    p.vx *= Math.pow(0.97, dt);
                } else if (p.kind === 'medium') {
                    p.vy += 0.02 * dt;
                    p.vx *= Math.pow(0.98, dt);
                    p.vx += (Math.random() - 0.5) * 0.08 * dt;
                    p.vy += (Math.random() - 0.5) * 0.05 * dt;
                } else {
                    p.vy += 0.005 * dt;
                    p.vx *= Math.pow(0.99, dt);
                    p.vx += (Math.random() - 0.5) * 0.12 * dt;
                    p.vy += (Math.random() - 0.5) * 0.04 * dt;
                }

                if (p.life <= 0) { ps.splice(i, 1); continue; }
                const alpha = p.life < 0.3 ? p.life / 0.3 : 1;

                if (p.kind === 'chip') {
                    p.rot += p.rotV * dt;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.globalAlpha = alpha * 0.55;
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    ctx.restore();
                    ctx.globalAlpha = 1;
                } else if (p.kind === 'medium') {
                    ctx.globalAlpha = alpha * 0.4;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                } else {
                    ctx.globalAlpha = alpha * 0.25;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }

            animRef.current = requestAnimationFrame(update);
        };

        updateRef.current = update;
        animRef.current = requestAnimationFrame(update);

        const onVisibility = () => {
            if (document.hidden) {
                if (animRef.current) cancelAnimationFrame(animRef.current);
                animRef.current = null;
                return;
            }
            if (!animRef.current && updateRef.current && (scrollingRef.current || particles.current.length > 0)) {
                lastTs = performance.now();
                animRef.current = requestAnimationFrame(updateRef.current);
            }
        };

        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            if (animRef.current) cancelAnimationFrame(animRef.current);
            animRef.current = null;
            updateRef.current = null;
        };
    }, [active, reducedMotion]);

    if (reducedMotion) return null;
    return (
        <canvas ref={canvasRef} style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)', pointerEvents: 'none',
            zIndex: 20, width: 160, height: 180,
        }} />
    );
}

// ── Cores das lascas de MDF ─────────────────────────────────────────────────
const MDF_COLORS = ['#C4963C', '#D4A574', '#A0784C', '#8B6914', '#E8C9A0', '#B8956A', '#D2B48C', '#C19A6B'];
const DUST_COLORS = ['#B8A080', '#A89070', '#9C8568', '#C4A878', '#AA9060', '#BFA880'];

// ── Hook: scroll reveal (robusto — observe imediato + fallback) ─────────────
function useScrollReveal() {
    const refs = useRef([]);
    const obsRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('revealed');
                    observer.unobserve(e.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -20px 0px' });
        obsRef.current = observer;
        // Observa refs que foram adicionados antes do observer estar pronto
        refs.current.forEach(el => el && observer.observe(el));

        // Fallback: se após 2.5s algum elemento ainda não apareceu, força reveal
        const fallback = setTimeout(() => {
            refs.current.forEach(el => {
                if (el && !el.classList.contains('revealed')) el.classList.add('revealed');
            });
        }, 2500);

        return () => { observer.disconnect(); clearTimeout(fallback); };
    }, []);

    const addRef = useCallback((el) => {
        if (el && !refs.current.includes(el)) {
            refs.current.push(el);
            // Se observer já existe, observa imediatamente
            if (obsRef.current) obsRef.current.observe(el);
        }
    }, []);

    return addRef;
}

// ── Hook: serra scroll progress (V3 — direção + energia de rolagem) ─────────
function useSawScroll(timelineRef, itemRefs, ready) {
    const [progress, setProgress] = useState(0);
    const [done, setDone] = useState(false);
    const [isScrolling, setIsScrolling] = useState(false);
    const [scrollDir, setScrollDir] = useState(1);
    const [scrollEnergy, setScrollEnergy] = useState(0);
    const lastProgress = useRef(0);
    const lastTickAt = useRef(0);
    const lastMoveAt = useRef(0);
    const scrollTimeout = useRef(null);
    const decayTimer = useRef(null);
    const energyRef = useRef(0);

    useEffect(() => {
        if (!ready || !timelineRef.current) return;
        let ticking = false;
        let finished = false;

        const onScroll = () => {
            if (ticking || finished) return;
            ticking = true;
            requestAnimationFrame(() => {
                const tl = timelineRef.current;
                if (!tl) { ticking = false; return; }
                const rect = tl.getBoundingClientRect();
                const viewH = window.innerHeight;
                const triggerPoint = viewH * 0.55;
                const start = rect.top;
                const end = rect.bottom;
                const total = end - start;
                if (total <= 0) { ticking = false; return; }
                const scrolled = triggerPoint - start;
                const p = Math.max(0, Math.min(1, scrolled / total));
                setProgress(p);

                if (p >= 0.985) {
                    finished = true;
                    setProgress(0.995);
                    itemRefs.current.forEach(el => {
                        if (el && !el.classList.contains('revealed')) el.classList.add('revealed');
                    });
                    energyRef.current = 0;
                    setScrollEnergy(0);
                    setIsScrolling(false);
                    setTimeout(() => setDone(true), 460);
                    ticking = false;
                    return;
                }

                // Detecta scroll ativo + direção + "força" do scroll
                const now = performance.now();
                if (!lastTickAt.current) lastTickAt.current = now;
                const delta = p - lastProgress.current;
                const moving = Math.abs(delta) > 0.001;
                if (moving) {
                    setIsScrolling(true);
                    setScrollDir(delta > 0 ? 1 : -1);

                    const dt = Math.max(16, now - lastTickAt.current);
                    const velocity = Math.abs(delta) / (dt / 16.67);
                    const instantEnergy = clamp(velocity * 18, 0, 1);
                    const blended = energyRef.current * 0.58 + instantEnergy * 0.42;
                    energyRef.current = blended;
                    setScrollEnergy(blended);
                    lastMoveAt.current = now;
                }
                clearTimeout(scrollTimeout.current);
                scrollTimeout.current = setTimeout(() => setIsScrolling(false), 120);
                lastProgress.current = p;
                lastTickAt.current = now;

                // Reveal items as saw passes them
                itemRefs.current.forEach(el => {
                    if (!el || el.classList.contains('revealed')) return;
                    const elRect = el.getBoundingClientRect();
                    const elMid = elRect.top + elRect.height * 0.3;
                    if (elMid < triggerPoint + 40) el.classList.add('revealed');
                });

                ticking = false;
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        decayTimer.current = setInterval(() => {
            const idleMs = performance.now() - lastMoveAt.current;
            if (idleMs < 120 || energyRef.current <= 0) return;
            const next = energyRef.current * 0.86;
            const final = next < 0.015 ? 0 : next;
            if (final === energyRef.current) return;
            energyRef.current = final;
            setScrollEnergy(final);
        }, 90);

        return () => {
            window.removeEventListener('scroll', onScroll);
            clearTimeout(scrollTimeout.current);
            clearInterval(decayTimer.current);
        };
    }, [ready]);

    return { progress, done, isScrolling, scrollDir, scrollEnergy };
}

// ── Hook: counter animation ─────────────────────────────────────────────────
function useCountUp(end, duration = 2000, trigger = false) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!trigger) return;
        const t0 = performance.now();
        const step = (now) => {
            const p = Math.min((now - t0) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(Math.round(eased * end));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [trigger, end, duration]);
    return val;
}

function usePrefersReducedMotion() {
    const [reduce, setReduce] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReduce(mql.matches);
        sync();

        if (mql.addEventListener) mql.addEventListener('change', sync);
        else mql.addListener(sync);

        return () => {
            if (mql.removeEventListener) mql.removeEventListener('change', sync);
            else mql.removeListener(sync);
        };
    }, []);

    return reduce;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function PropostaApresentacao({ token }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statsVisible, setStatsVisible] = useState(false);
    const statsRef = useRef(null);
    const reveal = useScrollReveal();
    const timelineRef = useRef(null);
    const itemRefs = useRef([]);
    const reduceMotion = usePrefersReducedMotion();

    // ── Fetch data ───────────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`/api/portal/landing/${token}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) { setError(d.error); return; }
                setData(d);
            })
            .catch(() => setError('Não foi possível carregar'))
            .finally(() => setLoading(false));
    }, [token]);

    // ── Microsoft Clarity (skipa localhost) ──────────────────────────────────
    useEffect(() => {
        initClarity(data?.empresa?.clarity_project_id);
        setClarityTag('page', 'apresentacao');
        if (token) {
            const friendly = data?.cliente?.nome ? `Apresentação — ${data.cliente.nome}` : `Apresentação ${token.slice(0, 8)}`;
            identifyClarity(token, '', '', friendly);
        }
        if (data?.cliente?.nome) setClarityTag('cliente', data.cliente.nome);
        if (data?.numero) setClarityTag('proposta_numero', data.numero);
    }, [token, data?.cliente?.nome, data?.numero, data?.empresa?.clarity_project_id]);

    // ── Stats counter trigger ────────────────────────────────────────────────
    useEffect(() => {
        if (!statsRef.current) return;
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); }
        }, { threshold: 0.3 });
        obs.observe(statsRef.current);
        return () => obs.disconnect();
    }, [data]);

    // Saw blade animation
    const { progress: sawProgress, done: sawDone, isScrolling, scrollDir, scrollEnergy } = useSawScroll(timelineRef, itemRefs, !!data);
    const addItemRef = useCallback((el) => {
        if (el && !itemRefs.current.includes(el)) itemRefs.current.push(el);
    }, []);
    const sawActive = sawProgress > 0.01 && !sawDone;
    const sawVisualProgress = sawDone ? 1 : clamp(1 - Math.pow(1 - sawProgress, 1.6), 0, 1);
    const sawEntry = clamp(sawVisualProgress / 0.035, 0, 1);
    const sawExit = sawVisualProgress > 0.93 ? clamp(1 - ((sawVisualProgress - 0.93) / 0.07), 0, 1) : 1;
    const sawOpacity = clamp(sawEntry * sawExit, 0, 1);
    const spinEnergy = reduceMotion ? 0 : clamp(scrollEnergy + (isScrolling ? 0.14 : 0), 0, 1);
    const sawSpinSeconds = reduceMotion ? 999 : (sawActive ? lerp(3.4, 0.78, spinEnergy) : 5.8);
    const sawGlowBoost = reduceMotion ? 0.1 : clamp(0.25 + spinEnergy * 0.9, 0.1, 1);

    const c1 = data?.empresa?.cor_primaria || '#1B2A4A';
    const c2 = data?.empresa?.cor_accent || '#C9A96E';
    const cream = '#F5F0E8';
    const darkBg = c1;

    // Counter values
    const statProjetos = data?.empresa?.projetos_entregues || 100;
    const statAnos = data?.empresa?.anos_experiencia || 5;
    const statMaquinas = data?.empresa?.maquinas_industriais || 5;
    const descMaquinas = data?.empresa?.desc_maquinas || '';
    const cnt1 = useCountUp(statProjetos, 2000, statsVisible);
    const cnt2 = useCountUp(statAnos, 1500, statsVisible);
    const cnt3 = useCountUp(statMaquinas, 1800, statsVisible);

    if (loading) return <LoadingScreen c1={c1} c2={c2} />;
    if (error) return <ErrorScreen error={error} />;
    if (!data) return null;

    const { cliente_nome, empresa, portfolio, depoimentos, proposta_token, validade, criado_em } = data;

    return (
        <>
            <style>{buildCSS(c1, c2, cream)}</style>
            <div className="ap-root">
                {/* ═══ SEÇÃO 1: HERO ═══ */}
                <section className="ap-hero">
                    <div className="ap-hero-bg" />
                    <div className="ap-hero-content ap-fade-in">
                        {empresa.logo && (
                            <img src={empresa.logo} alt={empresa.nome} className="ap-hero-logo" />
                        )}
                        <div className="ap-hero-divider" style={{ background: c2 }} />
                        <p className="ap-hero-label" style={{ color: `${c2}` }}>PROPOSTA EXCLUSIVA</p>
                        <h1 className="ap-hero-name" style={{ color: cream, fontFamily: "'Georgia', 'Times New Roman', serif" }}>{cliente_nome}</h1>
                        <p className="ap-hero-date" style={{ color: `${cream}80` }}>
                            {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                    <div className={`ap-scroll-hint${reduceMotion ? '' : ' ap-bounce'}`}>
                        {icons.chevron(`${cream}60`)}
                    </div>
                </section>

                {/* ═══ SEÇÃO 2: SOBRE ═══ */}
                <section className="ap-section" style={{ background: cream, color: c1 }}>
                    <div className="ap-container">
                        <div ref={reveal} className="ap-reveal">
                            <p className="ap-section-tag" style={{ color: c2 }}>QUEM SOMOS</p>
                            <h2 className="ap-section-title" style={{ color: c1 }}>
                                Transformamos espaços em experiências únicas.
                            </h2>
                            <p className="ap-about-text" style={{ color: `${c1}B0` }}>
                                {empresa.texto_institucional || 'Somos especialistas em móveis planejados sob medida, unindo a precisão e a agilidade da tecnologia de ponta ao capricho e à essência da marcenaria fina tradicional. Trabalhamos com materiais de mais alta qualidade e processos modernos para garantir qualidade superior em cada entrega. Cada projeto é desenvolvido para refletir a personalidade e o estilo de vida de nossos clientes, com acabamento impecável e atenção absoluta aos detalhes.'}
                            </p>
                        </div>
                        <div className="ap-stats" ref={statsRef}>
                            <StatCard label="Projetos Entregues" value={`${cnt1}+`} color={c2} reveal={reveal} delay={0} />
                            <StatCard label="Anos de Experiência" value={cnt2} color={c2} reveal={reveal} delay={1} />
                            <StatCard label="Máquinas Industriais" value={`${cnt3}+`} color={c2} reveal={reveal} delay={2} desc={descMaquinas || undefined} />
                        </div>
                    </div>
                </section>

                {/* ═══ SEÇÃO 3: PORTFOLIO ═══ */}
                {portfolio.length > 0 && (
                    <section className="ap-section" style={{ background: darkBg, color: cream }}>
                        <div className="ap-container">
                            <div ref={reveal} className="ap-reveal">
                                <p className="ap-section-tag" style={{ color: c2 }}>PORTFOLIO</p>
                                <h2 className="ap-section-title" style={{ color: cream }}>
                                    Projetos que inspiram
                                </h2>
                            </div>
                            <div className="ap-portfolio-list">
                                {portfolio.map((p, i) => (
                                    <div key={p.id} ref={reveal} className={`ap-reveal ap-portfolio-row${i % 2 !== 0 ? ' ap-row-reverse' : ''}`} style={{ transitionDelay: `${i * 0.12}s` }}>
                                        <div className="ap-portfolio-img-wrap">
                                            <img src={p.imagem} alt={p.titulo} className="ap-portfolio-img" loading="lazy" />
                                        </div>
                                        <div className="ap-portfolio-text">
                                            <h3 className="ap-portfolio-title" style={{ color: cream }}>{p.titulo}</h3>
                                            {p.designer && <p className="ap-portfolio-designer" style={{ color: c2 }}>{p.designer}</p>}
                                            {p.descricao && <p className="ap-portfolio-desc" style={{ color: `${cream}A0` }}>{p.descricao}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {/* ═══ SEÇÃO 4: PROCESSO (com serra animada) ═══ */}
                <section className="ap-section ap-section-processo" style={{ background: cream, color: c1 }}>
                    <div className="ap-container">
                        <div ref={reveal} className="ap-reveal">
                            <p className="ap-section-tag" style={{ color: c2 }}>NOSSO PROCESSO</p>
                            <h2 className="ap-section-title" style={{ color: c1 }}>
                                Do projeto à realidade
                            </h2>
                        </div>
                        <div className="ap-timeline" ref={timelineRef}>
                            {/* Linha base (fundo) */}
                            <div className="ap-timeline-line" style={{ background: `${c2}20` }} />
                            {/* Linha de progresso (preenchida pela serra) */}
                            <div
                                className="ap-timeline-progress"
                                style={{
                                    background: `linear-gradient(to bottom, ${c2}, ${c2}90)`,
                                    height: sawDone ? '100%' : `${sawVisualProgress * 100}%`,
                                }}
                            />
                            {/* Serra circular — desaparece permanentemente ao terminar */}
                            {!sawDone && (
                            <div
                                className={`ap-saw-container${sawVisualProgress >= 0.955 ? ' ap-saw-fade-out' : ''}`}
                                style={{
                                    top: `${sawVisualProgress * 100}%`,
                                    opacity: sawOpacity,
                                }}
                            >
                                <SawBladeSVG
                                    color={c2}
                                    size={70}
                                    spinSeconds={sawSpinSeconds}
                                    spinDirection={scrollDir}
                                    paused={!sawActive || reduceMotion}
                                    glowBoost={sawGlowBoost}
                                />
                                <SawDustCanvas
                                    active={sawActive && !reduceMotion}
                                    scrolling={isScrolling}
                                    direction={scrollDir}
                                    intensity={spinEnergy}
                                    reducedMotion={reduceMotion}
                                />
                            </div>
                            )}
                            {/* Items da timeline */}
                            {TIMELINE_STEPS.map((step, i) => (
                                <div key={i} ref={addItemRef}
                                    className={`ap-reveal ap-timeline-item ${i % 2 === 0 ? 'ap-tl-left' : 'ap-tl-right'}`}
                                >
                                    <div
                                        className="ap-tl-dot"
                                        style={{
                                            background: c2,
                                            boxShadow: `0 0 0 4px ${c2}30`,
                                        }}
                                    >
                                        <span style={{ color: '#fff', fontWeight: 800, fontSize: 13, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{i + 1}</span>
                                    </div>
                                    <div className="ap-tl-card" style={{ background: '#fff', border: `1px solid ${c2}20` }}>
                                        <div className="ap-tl-icon" style={{ color: c2 }}>
                                            {icons[step.icon](c2)}
                                        </div>
                                        <h3 className="ap-tl-title" style={{ color: c1 }}>{step.title}</h3>
                                        <p className="ap-tl-desc" style={{ color: `${c1}90` }}>{step.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══ A1b: VÍDEO DO PROCESSO ═══ */}
                {(() => {
                    const videoProcessoId = getYouTubeId(empresa.video_processo);
                    return (
                        <section style={{ padding: '64px 0', background: '#0b0e13', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 70% 60% at 50% 100%, ${c1}55 0%, transparent 70%)` }} />
                            <div className="ap-container" style={{ position: 'relative' }}>
                                <div ref={reveal} className="ap-reveal" style={{ textAlign: 'center', marginBottom: 36 }}>
                                    <p className="ap-section-tag" style={{ color: c2 }}>TOUR PELA FÁBRICA</p>
                                    <h2 className="ap-section-title" style={{ color: cream }}>
                                        Veja como seu móvel <span style={{ color: c2 }}>é fabricado</span>
                                    </h2>
                                    <p style={{ fontSize: 15, color: `${cream}80`, marginTop: 10, lineHeight: 1.6 }}>
                                        Da matéria-prima ao acabamento — precisão industrial em cada etapa.
                                    </p>
                                </div>
                                <div ref={reveal} className="ap-reveal" style={{
                                    borderRadius: 20, overflow: 'hidden',
                                    border: `1px solid ${c2}25`,
                                    boxShadow: `0 0 0 1px ${c1}40, 0 32px 80px rgba(0,0,0,0.6), 0 0 60px ${c1}30`,
                                    maxWidth: 860, margin: '0 auto',
                                }}>
                                    <div style={{ height: 3, background: `linear-gradient(90deg, ${c1}, ${c2}, ${c1})` }} />
                                    {videoProcessoId ? (
                                        <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
                                            <iframe
                                                title="Processo de fabricação"
                                                src={`https://www.youtube.com/embed/${videoProcessoId}?rel=0&modestbranding=1&color=white`}
                                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ position: 'relative', paddingBottom: '56.25%', background: 'linear-gradient(135deg, #0d1117 0%, #131a24 60%, #0d1117 100%)' }}>
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                                                <div style={{ width: 80, height: 80, borderRadius: '50%', background: `${c2}20`, border: `2px dashed ${c2}60`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill={c2} style={{ marginLeft: 4 }}><polygon points="5,3 19,12 5,21" /></svg>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Vídeo de processo não configurado</div>
                                                    <div style={{ fontSize: 12, color: '#475569' }}>Adicione o link do YouTube em <strong style={{ color: c2 }}>Configurações → Landing da Proposta</strong></div>
                                                </div>
                                                {[20, 40, 60, 80].map(t => (
                                                    <div key={t} style={{ position: 'absolute', left: '8%', right: '8%', top: `${t}%`, height: 1, background: `linear-gradient(90deg, transparent, ${c2}15, transparent)` }} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 32, flexWrap: 'wrap' }}>
                                    {[{ icon: '🏭', label: 'Fábrica própria' }, { icon: '⚙️', label: 'CNC de precisão' }, { icon: '✅', label: 'Controle de qualidade' }].map((s, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: `${cream}80` }}>
                                            <span style={{ fontSize: 18 }}>{s.icon}</span>
                                            <span>{s.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    );
                })()}

                {/* ═══ A2: DEPOIMENTOS ═══ */}
                {depoimentos && depoimentos.length > 0 && (
                <section style={{ background: darkBg, padding: '56px 0 0' }}>
                    <div className="ap-container">
                        <div ref={reveal} className="ap-reveal" style={{ textAlign: 'center', marginBottom: 32 }}>
                            <p className="ap-section-tag" style={{ color: c2 }}>DEPOIMENTOS</p>
                            <h2 className="ap-section-title" style={{ color: cream, fontSize: 24 }}>
                                O que nossos clientes dizem
                            </h2>
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: depoimentos.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: 20, maxWidth: depoimentos.length === 1 ? 680 : 900,
                            margin: '0 auto',
                        }}>
                            {depoimentos.map((dep, idx) => (
                                <div key={dep.id || idx} ref={reveal} className="ap-reveal" style={{
                                    position: 'relative', padding: '36px 32px 28px', borderRadius: 16,
                                    border: `1px solid ${c2}20`,
                                    background: `linear-gradient(135deg, ${c2}0A 0%, ${c2}04 100%)`,
                                    overflow: 'hidden', textAlign: 'center',
                                    transitionDelay: `${idx * 0.1}s`,
                                }}>
                                    {/* Decorative quotation mark */}
                                    <svg width="60" height="48" viewBox="0 0 80 64" fill="none" style={{ position: 'absolute', top: 12, left: 20, opacity: 0.1 }}>
                                        <path d="M0 40.96C0 26.88 4.48 16.64 13.44 10.24C18.56 6.72 23.36 4.48 27.84 3.52L30.72 9.6C23.36 12.16 18.24 16 15.36 21.12C14.08 23.36 13.44 25.28 13.44 26.88C13.44 27.52 13.6 28 13.92 28.32C14.56 28 15.52 27.84 16.8 27.84C20 27.84 22.72 28.96 24.96 31.2C27.2 33.44 28.32 36.32 28.32 39.84C28.32 43.36 27.04 46.4 24.48 48.96C21.92 51.52 18.88 52.8 15.36 52.8C11.2 52.8 7.68 51.04 4.8 47.52C1.6 43.68 0 39.04 0 33.6V40.96ZM44.16 40.96C44.16 26.88 48.64 16.64 57.6 10.24C62.72 6.72 67.52 4.48 72 3.52L74.88 9.6C67.52 12.16 62.4 16 59.52 21.12C58.24 23.36 57.6 25.28 57.6 26.88C57.6 27.52 57.76 28 58.08 28.32C58.72 28 59.68 27.84 60.96 27.84C64.16 27.84 66.88 28.96 69.12 31.2C71.36 33.44 72.48 36.32 72.48 39.84C72.48 43.36 71.2 46.4 68.64 48.96C66.08 51.52 63.04 52.8 59.52 52.8C55.36 52.8 51.84 51.04 48.96 47.52C45.76 43.68 44.16 39.04 44.16 33.6V40.96Z" fill={c2} />
                                    </svg>
                                    {/* Stars */}
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 16 }}>
                                        {[...Array(5)].map((_, i) => (
                                            <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill={i < (dep.estrelas || 5) ? c2 : `${c2}30`}>
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                            </svg>
                                        ))}
                                    </div>
                                    {/* Quote */}
                                    <p style={{ fontSize: 16, lineHeight: 1.8, color: `${cream}D0`, fontStyle: 'italic', fontWeight: 300, margin: '0 0 20px', position: 'relative', zIndex: 1 }}>
                                        &ldquo;{dep.texto}&rdquo;
                                    </p>
                                    {/* Divider */}
                                    <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, transparent, ${c2}, transparent)`, margin: '0 auto 14px', borderRadius: 1 }} />
                                    {/* Name */}
                                    <p style={{ fontSize: 13, color: c2, fontWeight: 600, margin: 0, letterSpacing: '0.03em' }}>
                                        {dep.nome_cliente || 'Cliente'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
                )}

                {/* ═══ SEÇÃO 5: CTA ═══ */}
                <section className="ap-cta" style={{ background: darkBg }}>
                    <div className="ap-cta-bg" style={{ background: `radial-gradient(ellipse at center, ${c2}12 0%, transparent 70%)` }} />
                    <div className="ap-container" style={{ position: 'relative', zIndex: 1 }}>
                        <div ref={reveal} className="ap-reveal" style={{ textAlign: 'center' }}>
                            <p className="ap-section-tag" style={{ color: c2 }}>PRÓXIMO PASSO</p>
                            <h2 className="ap-section-title" style={{ color: cream, marginBottom: 12 }}>
                                Sua proposta está pronta
                            </h2>
                            <p style={{ color: `${cream}90`, fontSize: 15, marginBottom: 36, maxWidth: 500, margin: '0 auto 36px' }}>
                                Preparamos uma proposta personalizada com todos os detalhes do seu projeto.
                                Clique abaixo para visualizar.
                            </p>
                            {validade && (() => {
                                const now = new Date();
                                const end = new Date(validade + 'T23:59:59');
                                const start = criado_em ? new Date(criado_em) : new Date(end.getTime() - 15 * 86400000);
                                const total = Math.max(1, end - start);
                                const remaining = Math.max(0, end - now);
                                const pctUsado = Math.min(100, ((total - remaining) / total) * 100);
                                const pctRestante = 100 - pctUsado;
                                const diasRestantes = Math.ceil(remaining / 86400000);
                                const expirada = diasRestantes <= 0;
                                const urgente = diasRestantes <= 3 && !expirada;
                                const barColor = expirada ? 'var(--danger)' : urgente ? 'var(--warning)' : c2;
                                return (
                                    <div style={{
                                        maxWidth: 380, margin: '0 auto 28px', padding: '16px 20px',
                                        borderRadius: 12, background: 'rgba(255,255,255,0.06)',
                                        border: `1px solid ${barColor}30`,
                                    }}>
                                        {/* Header: ícone relógio + texto */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={barColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                                </svg>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: `${cream}D0` }}>
                                                    {expirada ? 'Proposta expirada' : `Válida até ${new Date(validade + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>
                                                {expirada ? 'Expirada' : diasRestantes === 1 ? 'Último dia!' : `${diasRestantes}d`}
                                            </span>
                                        </div>
                                        {/* Barra de progresso — mostra tempo restante */}
                                        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 3,
                                                width: `${pctRestante}%`,
                                                background: `linear-gradient(90deg, ${barColor}, ${barColor}90)`,
                                                transition: 'width 0.6s ease',
                                            }} />
                                        </div>
                                        {!expirada && (
                                            <p style={{ fontSize: 11, color: `${cream}60`, margin: '8px 0 0', textAlign: 'center' }}>
                                                {diasRestantes === 1 ? 'Aproveite — condições especiais expiram hoje!' : `${diasRestantes} dias restantes para aproveitar estas condições`}
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}
                            <br />
                            <a
                                href={`/proposta/${proposta_token}`}
                                className="ap-cta-btn"
                                style={{ background: c2, color: c1 }}
                            >
                                Abrir Minha Proposta Personalizada
                            </a>
                            <div className="ap-cta-contacts" style={{ marginTop: 40 }}>
                                {empresa.telefone && (
                                    <a href={`https://wa.me/55${empresa.telefone.replace(/\D/g, '')}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="ap-contact-link" style={{ color: `${cream}80` }}>
                                        {icons.phone(`${cream}80`)}
                                        <span>{empresa.telefone}</span>
                                    </a>
                                )}
                                {empresa.email && (
                                    <a href={`mailto:${empresa.email}`}
                                        className="ap-contact-link" style={{ color: `${cream}80` }}>
                                        {icons.mail(`${cream}80`)}
                                        <span>{empresa.email}</span>
                                    </a>
                                )}
                                {/* A1: Instagram link */}
                                {empresa.instagram && (
                                    <a href={`https://instagram.com/${empresa.instagram.replace(/^@/, '')}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="ap-contact-link" style={{ color: `${cream}80` }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>
                                        <span>@{empresa.instagram.replace(/^@/, '')}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, color, reveal, delay, desc }) {
    return (
        <div ref={reveal} className="ap-reveal ap-stat-card" style={{ transitionDelay: `${delay * 0.1}s` }}>
            <div className="ap-stat-value" style={{ color }}>{value}</div>
            <div className="ap-stat-label">{label}</div>
            {desc && <div className="ap-stat-desc">{desc}</div>}
        </div>
    );
}

function LoadingScreen({ c1, c2 }) {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c1, color: c2 }}>
            <div style={{ textAlign: 'center' }}>
                <div className="ap-loader" style={{ borderColor: `${c2}30`, borderTopColor: c2 }} />
                <p style={{ marginTop: 16, fontSize: 13, opacity: 0.7, color: '#fff' }}>Carregando apresentação...</p>
            </div>
            <style>{`.ap-loader{width:40px;height:40px;border:3px solid;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function ErrorScreen({ error }) {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1B2A4A', color: '#F5F0E8' }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: 40 }}>
                <h2 style={{ fontSize: 20, marginBottom: 12 }}>Link indisponível</h2>
                <p style={{ opacity: 0.6, fontSize: 14 }}>{error}</p>
            </div>
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function adjustBrightness(hex, amount) {
    hex = hex.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── CSS ─────────────────────────────────────────────────────────────────────
function buildCSS(c1, c2, cream) {
    return `
/* ── Reset & Base ── */
.ap-root { margin:0; padding:0; font-family:'Inter',system-ui,-apple-system,sans-serif; overflow-x:hidden; -webkit-font-smoothing:antialiased; }
.ap-root *,.ap-root *::before,.ap-root *::after { box-sizing:border-box; margin:0; padding:0; }
.ap-container { max-width:1100px; margin:0 auto; padding:0 24px; }

/* ── Reveal Animation ── */
.ap-reveal { opacity:0; transform:translateY(30px); transition:opacity 0.7s cubic-bezier(.16,1,.3,1), transform 0.7s cubic-bezier(.16,1,.3,1); }
.ap-reveal.revealed { opacity:1; transform:translateY(0); }

/* ── Fade In ── */
.ap-fade-in { animation: apFadeIn 1.2s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes apFadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }

/* ── Hero ── */
.ap-hero { position:relative; min-height:100vh; min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; }
.ap-hero-bg { position:absolute; inset:0; background:${c1}; }
.ap-hero-bg::before { content:''; position:absolute; inset:0; background:linear-gradient(135deg, transparent 30%, ${c2}08 50%, transparent 70%); }
.ap-hero-bg::after { content:''; position:absolute; bottom:0; left:0; right:0; height:40%; background:linear-gradient(transparent, ${adjustBrightness(c1, -20)}80); }
.ap-hero-content { position:relative; z-index:1; text-align:center; padding:40px 24px; }
.ap-hero-logo { height:60px; width:auto; margin-bottom:32px; object-fit:contain; filter:brightness(0) invert(1); }
.ap-hero-divider { width:60px; height:2px; margin:0 auto 28px; }
.ap-hero-label { font-size:12px; letter-spacing:0.3em; font-weight:600; margin-bottom:12px; }
.ap-hero-name { font-size:clamp(28px, 6vw, 48px); font-weight:300; letter-spacing:-0.02em; line-height:1.2; }
.ap-hero-date { font-size:13px; margin-top:16px; font-weight:400; }
.ap-scroll-hint { position:absolute; bottom:32px; z-index:2; opacity:0.5; }

/* ── Bounce ── */
.ap-bounce { animation: apBounce 2s infinite; }
@keyframes apBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }

/* ── Section ── */
.ap-section { padding:80px 0; }
.ap-section-tag { font-size:11px; letter-spacing:0.25em; font-weight:700; margin-bottom:12px; text-transform:uppercase; }
.ap-section-title { font-size:clamp(24px, 4vw, 36px); font-weight:300; letter-spacing:-0.02em; line-height:1.25; margin-bottom:20px; }
.ap-about-text { font-size:15px; line-height:1.75; max-width:640px; margin-bottom:48px; }

/* ── Stats ── */
.ap-stats { display:grid; grid-template-columns:repeat(4, 1fr); gap:20px; }
.ap-stat-card { text-align:center; padding:28px 16px; border-radius:14px; background:rgba(255,255,255,0.85); box-shadow:0 2px 12px rgba(0,0,0,0.06); }
.ap-stat-value { font-size:clamp(34px, 5vw, 52px); font-weight:900; line-height:1; margin-bottom:8px; letter-spacing:-0.02em; }
.ap-stat-label { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; opacity:0.7; color:${c1}; }
.ap-stat-desc { font-size:11px; line-height:1.5; opacity:0.5; margin-top:6px; color:${c1}; }

/* ── Portfolio — layout alternado imagem/texto ── */
.ap-portfolio-list { display:flex; flex-direction:column; gap:48px; margin-top:48px; }
.ap-portfolio-row { display:grid; grid-template-columns:1.2fr 1fr; gap:36px; align-items:center; }
.ap-portfolio-row.ap-row-reverse { grid-template-columns:1fr 1.2fr; }
.ap-portfolio-row.ap-row-reverse .ap-portfolio-img-wrap { order:2; }
.ap-portfolio-row.ap-row-reverse .ap-portfolio-text { order:1; text-align:right; }
.ap-portfolio-img-wrap { position:relative; border-radius:14px; overflow:hidden; aspect-ratio:16/10; }
.ap-portfolio-img { width:100%; height:100%; object-fit:cover; transition:transform 0.6s cubic-bezier(.16,1,.3,1); }
.ap-portfolio-row:hover .ap-portfolio-img { transform:scale(1.04); }
.ap-portfolio-text { padding:8px 0; }
.ap-portfolio-title { font-size:22px; font-weight:700; margin-bottom:6px; }
.ap-portfolio-designer { font-size:13px; font-weight:600; margin-bottom:10px; }
.ap-portfolio-desc { font-size:14px; line-height:1.7; opacity:0.75; }

/* ── Timeline ── */
.ap-timeline { position:relative; margin-top:48px; padding:0 20px; }
.ap-timeline-line { position:absolute; left:50%; top:0; bottom:0; width:2px; transform:translateX(-1px); }
.ap-timeline-progress { position:absolute; left:50%; top:0; width:3px; transform:translateX(-1.5px); border-radius:2px; transition:height 0.1s linear; z-index:1; }
.ap-timeline-item { position:relative; display:flex; align-items:flex-start; margin-bottom:32px; z-index:3; }
.ap-timeline-item:last-child { margin-bottom:0; }
.ap-tl-left { flex-direction:row; padding-right:calc(50% + 52px); }
.ap-tl-right { flex-direction:row-reverse; padding-left:calc(50% + 52px); }
.ap-tl-dot { position:absolute; left:50%; top:12px; width:28px; height:28px; border-radius:50%; transform:translateX(-50%); display:flex; align-items:center; justify-content:center; z-index:2; transition:transform 0.4s cubic-bezier(.34,1.56,.64,1), box-shadow 0.4s; }
.ap-timeline-item.revealed .ap-tl-dot { transform:translateX(-50%) scale(1.15); }
.ap-tl-card { flex:1; padding:20px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04); }
.ap-tl-icon { margin-bottom:10px; }
.ap-tl-title { font-size:15px; font-weight:700; margin-bottom:6px; }
.ap-tl-desc { font-size:13px; line-height:1.6; }

/* ── Saw Blade ── */
.ap-saw-container { position:absolute; left:50%; transform:translate(-50%, -50%); z-index:5; pointer-events:none; transition:top 0.16s cubic-bezier(.22,1,.36,1), opacity 0.28s ease, transform 0.45s cubic-bezier(.22,1,.36,1), filter 0.45s ease; will-change:top,opacity,transform,filter; }
.ap-saw-fade-out { opacity:0 !important; transform:translate(-50%, -56%) scale(0.82) !important; filter:blur(1.6px); }
.ap-saw-wrapper { position:relative; transform:translateZ(0); }
.ap-saw-glow { position:absolute; inset:-20px; border-radius:50%; filter:blur(15px); transform:scale(1.4); pointer-events:none; transition:opacity 0.2s ease, transform 0.24s ease; will-change:opacity,transform; }
.ap-saw-svg { animation:apSawSpin 2s linear infinite; position:relative; z-index:10; filter:drop-shadow(0 2px 12px rgba(0,0,0,0.25)); transform-origin:center; }
@keyframes apSawSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

/* ── CTA ── */
.ap-cta { position:relative; padding:100px 0; overflow:hidden; }
.ap-cta-bg { position:absolute; inset:0; }
.ap-cta-btn { display:inline-flex; align-items:center; gap:8px; padding:16px 48px; font-size:15px; font-weight:700; letter-spacing:0.02em; border-radius:50px; text-decoration:none; transition:all 0.3s; box-shadow:0 4px 20px ${c2}40; animation:ctaGlow 3s ease-in-out infinite; }
.ap-cta-btn:hover { transform:translateY(-2px); box-shadow:0 6px 28px ${c2}60; }
@keyframes ctaGlow { 0%,100%{box-shadow:0 4px 20px ${c2}40;} 50%{box-shadow:0 6px 32px ${c2}70;} }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
.ap-cta-contacts { display:flex; gap:24px; justify-content:center; flex-wrap:wrap; }
.ap-contact-link { display:inline-flex; align-items:center; gap:8px; font-size:13px; text-decoration:none; color:inherit; transition:opacity 0.2s; }
.ap-contact-link:hover { opacity:1 !important; }

/* ── Mobile ── */
@media (max-width:768px) {
    .ap-container { padding:0 16px; }
    .ap-section { padding:48px 0; }
    .ap-section-tag { font-size:10px; letter-spacing:0.2em; margin-bottom:8px; }
    .ap-section-title { font-size:22px; margin-bottom:14px; }
    .ap-about-text { font-size:14px; line-height:1.65; margin-bottom:32px; }

    /* Stats mobile: 2 colunas menores */
    .ap-stats { grid-template-columns:repeat(2, 1fr); gap:10px; }
    .ap-stat-card { padding:18px 10px; border-radius:10px; }
    .ap-stat-value { font-size:28px; }
    .ap-stat-label { font-size:10px; }
    .ap-stat-desc { font-size:9px; }

    /* Portfolio mobile: empilhado, imagem + texto abaixo */
    .ap-portfolio-list { gap:32px; margin-top:32px; }
    .ap-portfolio-row, .ap-portfolio-row.ap-row-reverse { grid-template-columns:1fr !important; gap:14px; }
    .ap-portfolio-row.ap-row-reverse .ap-portfolio-img-wrap { order:1; }
    .ap-portfolio-row.ap-row-reverse .ap-portfolio-text { order:2; text-align:left; }
    .ap-portfolio-img-wrap { aspect-ratio:16/9; border-radius:10px; }
    .ap-portfolio-title { font-size:17px; }
    .ap-portfolio-designer { font-size:12px; margin-bottom:6px; }
    .ap-portfolio-desc { font-size:13px; line-height:1.6; }

    /* Timeline mobile: linear à esquerda */
    .ap-timeline { margin-top:32px; padding:0; }
    .ap-timeline-line { left:18px; }
    .ap-timeline-progress { left:18px; }
    .ap-timeline-item { flex-direction:row !important; padding:0 8px 0 48px !important; margin-bottom:24px; }
    .ap-tl-dot { left:18px !important; width:24px; height:24px; }
    .ap-tl-dot span { font-size:11px !important; }
    .ap-tl-right { flex-direction:row !important; }
    .ap-tl-card { padding:14px; border-radius:10px; }
    .ap-tl-title { font-size:14px; }
    .ap-tl-desc { font-size:12px; line-height:1.55; }
    .ap-tl-icon svg { width:20px; height:20px; }

    /* Serra mobile — mesmo eixo da linha e dots */
    .ap-saw-container { left:18px !important; transform:translate(-50%, -50%) !important; }
    .ap-saw-svg { width:40px; height:40px; }
    .ap-saw-glow { display:none; }

    /* Hero mobile */
    .ap-hero-logo { height:44px; margin-bottom:24px; }
    .ap-hero-divider { width:40px; margin-bottom:20px; }
    .ap-hero-label { font-size:11px; letter-spacing:0.2em; }
    .ap-hero-date { font-size:12px; }

    /* CTA mobile */
    .ap-cta { padding:48px 0; }
    .ap-cta-btn { padding:14px 36px; font-size:14px; }
    .ap-cta-contacts { gap:16px; }
    .ap-contact-link { font-size:12px; }
}

@media (prefers-reduced-motion: reduce) {
    .ap-bounce, .ap-saw-svg, .ap-loader, .ap-cta-btn { animation:none !important; }
    .ap-reveal { opacity:1 !important; transform:none !important; transition:none !important; }
    .ap-timeline-progress, .ap-saw-container, .ap-portfolio-img, .ap-cta-btn { transition:none !important; }
    .ap-saw-glow { display:none !important; }
}

/* ── Small phones ── */
@media (max-width:380px) {
    .ap-container { padding:0 12px; }
    .ap-stats { gap:8px; }
    .ap-stat-card { padding:14px 8px; }
    .ap-stat-value { font-size:24px; }
    .ap-timeline-item { padding:0 0 0 42px !important; }
}
`;
}
