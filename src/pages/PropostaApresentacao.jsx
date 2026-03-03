import { useState, useEffect, useRef, useCallback } from 'react';

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

// ── SVG: Serra Circular Metálica (inspirada na referência) ───────────────────
function SawBladeSVG({ color, size = 70 }) {
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

    return (
        <div className="ap-saw-wrapper">
            {/* Glow radial atrás da serra */}
            <div className="ap-saw-glow" style={{ background: `radial-gradient(circle, ${color}30 0%, ${color}10 40%, transparent 70%)` }} />
            <svg width={size} height={size} viewBox="-55 -55 110 110" className="ap-saw-svg">
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

// ── Cores das lascas de MDF ─────────────────────────────────────────────────
const MDF_COLORS = ['#C4963C', '#D4A574', '#A0784C', '#8B6914', '#E8C9A0', '#B8956A', '#D2B48C', '#C19A6B'];

// ── Hook: scroll reveal ─────────────────────────────────────────────────────
function useScrollReveal() {
    const refs = useRef([]);
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('revealed');
                    observer.unobserve(e.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
        refs.current.forEach(el => el && observer.observe(el));
        return () => observer.disconnect();
    }, [refs.current.length]);
    const addRef = useCallback((el) => { if (el && !refs.current.includes(el)) refs.current.push(el); }, []);
    return addRef;
}

// ── Hook: serra scroll progress ─────────────────────────────────────────────
function useSawScroll(timelineRef, itemRefs, ready) {
    const [progress, setProgress] = useState(0);
    const [particles, setParticles] = useState([]);
    const [done, setDone] = useState(false);
    const particleId = useRef(0);
    const lastProgress = useRef(0);

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

                // Serra chegou ao final → marca como done permanente
                if (p >= 0.95) {
                    finished = true;
                    // Revela todos os itens restantes
                    itemRefs.current.forEach(el => {
                        if (el && !el.classList.contains('revealed')) el.classList.add('revealed');
                    });
                    // Fade-out e desaparece
                    setTimeout(() => { setDone(true); setParticles([]); }, 600);
                    ticking = false;
                    return;
                }

                // Spawn particles when moving downward
                if (p > lastProgress.current && Math.abs(p - lastProgress.current) > 0.006 && p > 0.01) {
                    const id = ++particleId.current;
                    const side = Math.random() > 0.5 ? 1 : -1;
                    setParticles(prev => [...prev.slice(-10), {
                        id, x: side * (8 + Math.random() * 16), y: -2 + Math.random() * 6,
                        size: 2 + Math.random() * 3, opacity: 0.4 + Math.random() * 0.4,
                    }]);
                    setTimeout(() => setParticles(prev => prev.filter(pp => pp.id !== id)), 800);
                }
                lastProgress.current = p;

                // Reveal items as saw passes them
                itemRefs.current.forEach(el => {
                    if (!el || el.classList.contains('revealed')) return;
                    const elRect = el.getBoundingClientRect();
                    const elMid = elRect.top + elRect.height * 0.3;
                    if (elMid < triggerPoint + 40) {
                        el.classList.add('revealed');
                    }
                });

                ticking = false;
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener('scroll', onScroll);
    }, [ready]);

    return { progress, particles, done };
}

// ── Hook: counter animation ─────────────────────────────────────────────────
function useCountUp(end, duration = 2000, trigger = false) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!trigger) return;
        let start = 0;
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
    const { progress: sawProgress, particles: sawParticles, done: sawDone } = useSawScroll(timelineRef, itemRefs, !!data);
    const addItemRef = useCallback((el) => {
        if (el && !itemRefs.current.includes(el)) itemRefs.current.push(el);
    }, []);

    const c1 = data?.empresa?.cor_primaria || '#1B2A4A';
    const c2 = data?.empresa?.cor_accent || '#C9A96E';
    const cream = '#F5F0E8';
    const darkBg = c1;
    const darkBg2 = adjustBrightness(c1, -15);

    // Counter values
    const cnt1 = useCountUp(100, 2000, statsVisible);
    const cnt2 = useCountUp(5, 1500, statsVisible);
    const cnt3 = useCountUp(5, 1800, statsVisible);
    const cnt4 = useCountUp(60, 2000, statsVisible);

    if (loading) return <LoadingScreen c1={c1} c2={c2} />;
    if (error) return <ErrorScreen error={error} />;
    if (!data) return null;

    const { cliente_nome, empresa, portfolio, proposta_token } = data;

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
                        <h1 className="ap-hero-name" style={{ color: cream }}>{cliente_nome}</h1>
                        <p className="ap-hero-date" style={{ color: `${cream}80` }}>
                            {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="ap-scroll-hint ap-bounce">
                        {icons.chevron(`${cream}60`)}
                    </div>
                </section>

                {/* ═══ SEÇÃO 2: SOBRE ═══ */}
                <section className="ap-section" style={{ background: cream, color: c1 }}>
                    <div className="ap-container">
                        <div ref={reveal} className="ap-reveal">
                            <p className="ap-section-tag" style={{ color: c2 }}>QUEM SOMOS</p>
                            <h2 className="ap-section-title" style={{ color: c1 }}>
                                Transformamos espaços em experiências únicas
                            </h2>
                            <p className="ap-about-text" style={{ color: `${c1}B0` }}>
                                Somos especialistas em móveis planejados sob medida, unindo design autoral,
                                tecnologia de ponta e materiais premium. Cada projeto é pensado para
                                refletir a personalidade e o estilo de vida de nossos clientes, com acabamento
                                impecável e atenção a cada detalhe.
                            </p>
                        </div>
                        <div className="ap-stats" ref={statsRef}>
                            <StatCard label="Projetos Entregues" value={`${cnt1}+`} color={c2} reveal={reveal} delay={0} />
                            <StatCard label="Anos de Experiência" value={cnt2} color={c2} reveal={reveal} delay={1} />
                            <StatCard label="Máquinas Industriais" value={`${cnt3}+`} color={c2} reveal={reveal} delay={2} desc="Centro Nesting, Centro de Furação, Coladeira Industrial e Cabine de Pintura" />
                            <StatCard label="Meses de Garantia" value={`até ${cnt4}`} color={c2} reveal={reveal} delay={3} />
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
                                    height: sawDone ? '100%' : `${sawProgress * 100}%`,
                                }}
                            />
                            {/* Serra circular — desaparece permanentemente ao terminar */}
                            {!sawDone && (
                            <div
                                className={`ap-saw-container${sawProgress >= 0.95 ? ' ap-saw-fade-out' : ''}`}
                                style={{
                                    top: `${sawProgress * 100}%`,
                                    opacity: sawProgress > 0.005 ? 1 : 0,
                                }}
                            >
                                <SawBladeSVG color={c2} size={70} />
                                {/* Lascas de MDF voando */}
                                {sawParticles.length > 0 && (
                                    <div className="ap-chips-container">
                                        {sawParticles.map((p, idx) => {
                                            const side = p.x > 0 ? 1 : -1;
                                            const isWide = idx % 3 !== 0;
                                            const baseSize = 3 + (idx * 1.3) % 5;
                                            const chipColor = MDF_COLORS[idx % MDF_COLORS.length];
                                            return (
                                                <div
                                                    key={p.id}
                                                    className="ap-mdf-chip"
                                                    style={{
                                                        width: isWide ? baseSize * 2.8 : baseSize * 1.2,
                                                        height: isWide ? baseSize * 0.5 : baseSize * 1.2,
                                                        borderRadius: isWide ? '1px' : '50%',
                                                        background: chipColor,
                                                        boxShadow: `0 0 4px ${chipColor}66`,
                                                        animation: `apChipFly${side > 0 ? 'R' : 'L'}_${idx % 4} ${0.45 + (idx * 0.05) % 0.35}s ease-out ${idx * 0.04}s infinite`,
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
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
                            <a
                                href={`/proposta/${proposta_token}`}
                                className="ap-cta-btn"
                                style={{ background: c2, color: c1 }}
                            >
                                Visualizar Proposta
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
.ap-saw-container { position:absolute; left:50%; transform:translate(-50%, -50%); z-index:5; pointer-events:none; transition:opacity 0.4s ease; }
.ap-saw-fade-out { opacity:0 !important; transition:opacity 0.5s ease !important; }
.ap-saw-wrapper { position:relative; }
.ap-saw-glow { position:absolute; inset:-20px; border-radius:50%; filter:blur(15px); transform:scale(1.4); pointer-events:none; }
.ap-saw-svg { animation:apSawSpin 2s linear infinite; position:relative; z-index:10; filter:drop-shadow(0 2px 12px rgba(0,0,0,0.25)); }
@keyframes apSawSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

/* ── MDF Chips ── */
.ap-chips-container { position:absolute; top:50%; left:50%; width:160px; height:160px; transform:translate(-50%,-50%); pointer-events:none; z-index:40; }
.ap-mdf-chip { position:absolute; left:50%; top:50%; }

/* Chip fly keyframes — 4 variations per side (inspired by reference) */
@keyframes apChipFlyR_0 { 0%{opacity:0.85;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(200deg) translate(35px,-25px)} }
@keyframes apChipFlyR_1 { 0%{opacity:0.9;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(140deg) translate(50px,-10px)} }
@keyframes apChipFlyR_2 { 0%{opacity:0.8;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(260deg) translate(28px,15px)} }
@keyframes apChipFlyR_3 { 0%{opacity:0.85;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(180deg) translate(42px,-18px)} }
@keyframes apChipFlyL_0 { 0%{opacity:0.85;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(-200deg) translate(-35px,-20px)} }
@keyframes apChipFlyL_1 { 0%{opacity:0.9;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(-140deg) translate(-48px,8px)} }
@keyframes apChipFlyL_2 { 0%{opacity:0.8;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(-260deg) translate(-30px,-28px)} }
@keyframes apChipFlyL_3 { 0%{opacity:0.85;transform:translate(-50%,-50%) rotate(0deg) translate(0,0)} 100%{opacity:0;transform:translate(-50%,-50%) rotate(-180deg) translate(-40px,12px)} }

/* ── CTA ── */
.ap-cta { position:relative; padding:100px 0; overflow:hidden; }
.ap-cta-bg { position:absolute; inset:0; }
.ap-cta-btn { display:inline-flex; align-items:center; gap:8px; padding:16px 48px; font-size:15px; font-weight:700; letter-spacing:0.02em; border-radius:50px; text-decoration:none; transition:all 0.3s; box-shadow:0 4px 20px ${c2}40; }
.ap-cta-btn:hover { transform:translateY(-2px); box-shadow:0 6px 28px ${c2}60; }
.ap-cta-contacts { display:flex; gap:24px; justify-content:center; flex-wrap:wrap; }
.ap-contact-link { display:inline-flex; align-items:center; gap:8px; font-size:13px; text-decoration:none; color:inherit; transition:opacity 0.2s; }
.ap-contact-link:hover { opacity:1 !important; }

/* ── Mobile ── */
@media (max-width:768px) {
    .ap-section { padding:60px 0; }
    .ap-stats { grid-template-columns:repeat(2, 1fr); gap:12px; }
    .ap-portfolio-row, .ap-portfolio-row.ap-row-reverse { grid-template-columns:1fr !important; gap:16px; }
    .ap-portfolio-row.ap-row-reverse .ap-portfolio-img-wrap { order:1; }
    .ap-portfolio-row.ap-row-reverse .ap-portfolio-text { order:2; }
    .ap-portfolio-title { font-size:18px; }
    .ap-portfolio-list { gap:36px; }
    .ap-timeline-line { left:20px; }
    .ap-timeline-progress { left:20px; }
    .ap-timeline-item { flex-direction:row !important; padding:0 0 0 56px !important; }
    .ap-tl-dot { left:20px !important; }
    .ap-tl-right { flex-direction:row !important; }
    .ap-saw-container { left:20px !important; }
    .ap-saw-svg { width:50px; height:50px; }
    .ap-saw-glow { display:none; }
    .ap-chips-container { width:120px; height:120px; }
    .ap-hero-logo { height:48px; }
    .ap-cta { padding:60px 0; }
}
`;
}
