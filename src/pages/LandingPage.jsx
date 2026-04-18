import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    Instagram,
    Loader2,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Send,
    Star,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// LandingPage — Dark Premium Design (inspired by Vibe Portfolio)
// ═══════════════════════════════════════════════════════════════════════════════

const TIPOS_PROJETO = [
    'Cozinha Planejada',
    'Closet / Guarda-roupa',
    'Home Office',
    'Sala de Estar',
    'Banheiro / Lavabo',
    'Quarto',
    'Área Gourmet',
    'Lavanderia',
    'Loja / Comercial',
    'Projeto Completo',
    'Outro',
];

const FAQ_DEFAULT = [
    { q: 'Quanto custa um projeto de marcenaria sob medida?', a: 'O investimento varia conforme a complexidade, materiais e dimensões. Após entender seu projeto, enviamos um orçamento detalhado sem compromisso.' },
    { q: 'Qual o prazo de entrega?', a: 'O prazo depende do escopo do projeto. Trabalhamos com cronograma transparente e você acompanha cada etapa.' },
    { q: 'Atendem minha região?', a: 'Atendemos a região e cidades próximas. Entre em contato para confirmarmos a cobertura.' },
    { q: 'Preciso ter um projeto de designer?', a: 'Não é necessário. Podemos desenvolver o projeto do zero com base nas suas necessidades, ou trabalhar em parceria com seu designer.' },
    { q: 'Como funciona o pagamento?', a: 'Oferecemos condições flexíveis que são apresentadas junto com o orçamento. Tudo transparente e sem surpresas.' },
];

const ETAPAS_DEFAULT = [
    { titulo: 'Briefing Inicial', descricao: 'Ouvimos suas necessidades, preferências e estilo de vida para criar um projeto que traduz a sua personalidade.' },
    { titulo: 'Projeto 3D', descricao: 'Desenvolvemos o projeto em 3D para você validar cada detalhe antes da produção.' },
    { titulo: 'Aprovação', descricao: 'Refinamos o projeto até você estar 100% satisfeito com cada acabamento, cor e funcionalidade.' },
    { titulo: 'Produção', descricao: 'Fabricação própria com CNC Nesting, coladeira de borda industrial e maquinário de precisão milimétrica, garantindo que o seu projeto saia exatamente como o projetado.' },
    { titulo: 'Instalação', descricao: 'Equipe especializada realiza a montagem com acabamento impecável. Todos os nossos projetos contam com garantia para sua total tranquilidade.' },
];

const PORTFOLIO_PLACEHOLDER = [
    { id: 'ph1', titulo: 'Cozinha Planejada', designer: '', descricao: 'Design funcional com acabamento premium', imagem: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop&q=80' },
    { id: 'ph2', titulo: 'Closet Sob Medida', designer: '', descricao: 'Organização e elegância em cada detalhe', imagem: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&h=400&fit=crop&q=80' },
    { id: 'ph3', titulo: 'Home Office', designer: '', descricao: 'Espaço de trabalho planejado para produtividade', imagem: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&h=400&fit=crop&q=80' },
    { id: 'ph4', titulo: 'Sala de Estar', designer: '', descricao: 'Ambiente acolhedor com marcenaria de alto padrão', imagem: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600&h=400&fit=crop&q=80' },
    { id: 'ph5', titulo: 'Área Gourmet', designer: '', descricao: 'Espaço perfeito para receber com sofisticação', imagem: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=400&fit=crop&q=80' },
    { id: 'ph6', titulo: 'Banheiro Planejado', designer: '', descricao: 'Funcionalidade e design em harmonia', imagem: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=600&h=400&fit=crop&q=80' },
];

function parseJsonList(value, fallback) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) && parsed.length ? parsed : fallback;
    } catch { return fallback; }
}

function getHeroVideoSource(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url) return null;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        let id = '';
        if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || '';
        else if (host.endsWith('youtube.com')) {
            if (parsed.pathname.includes('/shorts/')) id = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
            else if (parsed.pathname.includes('/embed/')) id = parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
            else id = parsed.searchParams.get('v') || '';
        }
        if (id) return { type: 'youtube', src: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&showinfo=0` };
        return { type: 'direct', src: url };
    } catch { return { type: 'direct', src: url }; }
}

// ── Counter Hook ────────────────────────────────────────────────────────────
function useCountUp(end, duration, trigger) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!trigger || !end) return;
        const t0 = performance.now();
        const step = (now) => {
            const p = Math.min((now - t0) / duration, 1);
            setVal(Math.round((1 - Math.pow(1 - p, 3)) * end));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [trigger, end, duration]);
    return val;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function LandingPage() {
    const [config, setConfig] = useState(null);
    const [portfolio, setPortfolio] = useState([]);
    const [form, setForm] = useState({ nome: '', telefone: '', tipo_projeto: '', mensagem: '' });
    const [stats, setStats] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);
    const [erro, setErro] = useState('');
    const [faqOpen, setFaqOpen] = useState(-1);
    const [statsVisible, setStatsVisible] = useState(false);

    const statsRef = useRef(null);
    const timelineRef = useRef(null);
    const timelineProgressRef = useRef(null);
    const timelineLineRef = useRef(null);

    useEffect(() => {
        fetch('/api/landing/config')
            .then(r => r.json())
            .then(cfg => {
                setConfig(cfg);
                const title = cfg?.landing_titulo ? `${cfg.nome || 'Ornato'} — ${cfg.landing_titulo.slice(0, 60)}` : `${cfg?.nome || 'Ornato'} — Marcenaria sob medida`;
                document.title = title;
                const setMeta = (name, content) => {
                    if (!content) return;
                    let tag = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
                    if (!tag) { tag = document.createElement('meta'); tag.setAttribute(name.startsWith('og:') ? 'property' : 'name', name); document.head.appendChild(tag); }
                    tag.setAttribute('content', content);
                };
                setMeta('description', cfg?.landing_descricao || 'Marcenaria sob medida de alto padrão');
                setMeta('og:title', title);
                setMeta('og:description', cfg?.landing_descricao || 'Marcenaria sob medida de alto padrão');
                setMeta('og:type', 'website');
                if (cfg?.landing_hero_imagem) setMeta('og:image', cfg.landing_hero_imagem);
            })
            .catch(() => setConfig({ nome: 'Marcenaria Ornato' }));

        fetch('/api/portfolio').then(r => r.json()).then(d => setPortfolio(Array.isArray(d) ? d : [])).catch(() => setPortfolio([]));
        fetch('/api/landing/stats').then(r => r.json()).then(setStats).catch(() => setStats(null));
    }, []);

    // Stats observer
    useEffect(() => {
        if (!statsRef.current) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
        obs.observe(statsRef.current);
        return () => obs.disconnect();
    }, [config]);

    // Timeline scroll progress + line height
    useEffect(() => {
        const setLineHeight = () => {
            if (!timelineRef.current || !timelineLineRef.current) return;
            const items = timelineRef.current.querySelectorAll('.lp-timeline-item');
            if (!items.length) return;
            const lastItem = items[items.length - 1];
            const bodyRect = timelineRef.current.getBoundingClientRect();
            const lastRect = lastItem.getBoundingClientRect();
            const lineEnd = (lastRect.top + lastRect.height / 2) - bodyRect.top;
            timelineLineRef.current.style.height = `${lineEnd}px`;
        };
        const update = () => {
            if (!timelineRef.current || !timelineProgressRef.current) return;
            setLineHeight();
            const lineHeight = parseFloat(timelineLineRef.current?.style.height) || timelineRef.current.offsetHeight;
            const rect = timelineRef.current.getBoundingClientRect();
            const vh = window.innerHeight;
            const startScroll = rect.top - (vh / 2);
            let progress = 0;
            if (startScroll < 0) {
                const scrolled = Math.abs(startScroll);
                progress = Math.min(Math.max((scrolled / lineHeight) * 100, 0), 100);
            }
            timelineProgressRef.current.style.height = `${Math.min(progress, 100)}%`;
            timelineProgressRef.current.style.maxHeight = timelineLineRef.current?.style.height || '100%';
        };
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        setTimeout(update, 100);
        return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
    }, [config]);

    // Intersection observer for reveal
    useEffect(() => {
        if (!config) return;
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (entry.target.classList.contains('lp-projects-grid')) {
                        const cards = entry.target.querySelectorAll('.lp-project-card');
                        cards.forEach((card, i) => setTimeout(() => card.classList.add('active'), i * 200));
                    } else {
                        entry.target.classList.add('active');
                    }
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

        document.querySelectorAll('.lp-reveal').forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, [config, portfolio]);

    // Counter hooks (before early returns)
    const cnt1 = useCountUp(stats?.projetos || 0, 2000, statsVisible);
    const cnt2 = useCountUp(stats?.anos || 0, 1500, statsVisible);
    const cnt3 = useCountUp(stats?.ambientes || 0, 1800, statsVisible);
    const cnt4 = useCountUp(stats?.clientes || 0, 1600, statsVisible);

    const utm = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return { utm_source: params.get('utm_source') || '', utm_medium: params.get('utm_medium') || '', utm_campaign: params.get('utm_campaign') || '' };
    }, []);

    // Depoimentos
    const depoimentos = config ? parseJsonList(config?.landing_provas_json, [
        { nome: 'Cliente Ornato', projeto: 'Cozinha Planejada', depoimento: 'Atendimento impecável e resultado além do esperado. Superou todas as nossas expectativas em design e qualidade.', estrelas: 5 },
        { nome: 'Cliente Ornato', projeto: 'Closet Sob Medida', depoimento: 'Qualidade de acabamento excelente e instalação muito organizada. Cada detalhe foi pensado com cuidado.', estrelas: 5 },
        { nome: 'Cliente Ornato', projeto: 'Sala Integrada', depoimento: 'Projeto elegante, funcional e com execução no prazo combinado. A equipe toda é muito profissional.', estrelas: 5 },
    ]) : [];
    // Duplicate for seamless marquee
    const marqueeDepoimentos = [...depoimentos, ...depoimentos];

    if (!config) {
        return (
            <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000' }}>
                <Loader2 size={30} style={{ color: '#B7654A', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (Number(config?.landing_ativo) === 0) {
        return (
            <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#000', color: '#fff', padding: 24 }}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: 36, margin: 0, fontFamily: "'Oswald', sans-serif", fontWeight: 200 }}>{config?.nome || 'Ornato'}</h1>
                    <p style={{ marginTop: 10, opacity: 0.5 }}>Nossa página está em atualização.</p>
                </div>
            </div>
        );
    }

    // ── Vars ─────────────────────────────────────────────────────────────────
    const acc = config?.landing_cor_destaque || '#B7654A';
    const empNome = config?.nome || 'Ornato';
    const portfolioItems = portfolio.length >= 6 ? portfolio : [...portfolio, ...PORTFOLIO_PLACEHOLDER.slice(0, 6 - portfolio.length)];
    const heroTitulo = config?.landing_titulo || 'Ambientes sob medida, feitos para durar e encantar.';
    const heroDesc = config?.landing_descricao || 'Projetamos, produzimos e instalamos ambientes sob medida com acabamento premium e atendimento consultivo.';
    const heroImage = config?.landing_hero_imagem || '';
    const heroVideo = getHeroVideoSource(config?.landing_hero_video_url);
    const heroPoster = config?.landing_hero_video_poster || heroImage;

    const telLimpo = (config?.telefone || '').replace(/\D/g, '');
    const waNum = telLimpo ? (telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`) : '';
    const waHref = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent('Olá! Gostaria de saber mais sobre projetos de marcenaria sob medida.')}` : '';
    const igHandle = config?.instagram?.replace(/^@/, '') || '';

    const etapas = parseJsonList(config?.landing_etapas_json, ETAPAS_DEFAULT);
    const faqList = parseJsonList(config?.landing_faq_json, FAQ_DEFAULT);

    const formatTel = (v) => {
        const nums = v.replace(/\D/g, '').slice(0, 11);
        if (nums.length <= 2) return `(${nums}`;
        if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
        return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
    };

    const enviar = async (e) => {
        e.preventDefault();
        if (!form.nome.trim() || !form.telefone.trim()) { setErro('Preencha nome e WhatsApp.'); return; }
        setEnviando(true); setErro('');
        try {
            const resp = await fetch('/api/landing/captura', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, faixa_investimento: '', possui_projeto: '', email: '', ...utm }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || 'Erro ao enviar.');
            setEnviado(true);
        } catch (ex) { setErro(ex.message || 'Erro ao enviar. Tente novamente.'); }
        finally { setEnviando(false); }
    };

    // 3D tilt handler
    const handleTilt = (e) => {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -8;
        const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 8;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
    };
    const resetTilt = (e) => { e.currentTarget.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)'; };

    return (
        <div className="lp">
            <style>{buildCSS(acc)}</style>

            {/* ═══ HERO — Dark Premium with Auras ═══ */}
            <header className="lp-hero">
                <div className="lp-aura-wrap">
                    <div className="lp-aura lp-aura-1" style={{ background: `radial-gradient(circle, ${acc} 0%, transparent 70%)` }} />
                    <div className="lp-aura lp-aura-2" style={{ background: 'radial-gradient(circle, #3D2B1F 0%, transparent 70%)' }} />
                    <div className="lp-aura lp-aura-3" style={{ background: `radial-gradient(circle, ${acc}88 0%, transparent 70%)` }} />
                    <div className="lp-noise" />
                </div>

                {/* Hero media behind auras */}
                {(heroVideo || heroImage) && (
                    <div className="lp-hero-media-wrap">
                        {heroVideo?.type === 'youtube' ? (
                            <iframe title="Vídeo" src={heroVideo.src} className="lp-hero-media" allow="autoplay; encrypted-media" allowFullScreen />
                        ) : heroVideo?.type === 'direct' ? (
                            <video src={heroVideo.src} poster={heroPoster} className="lp-hero-media" autoPlay muted loop playsInline />
                        ) : heroImage ? (
                            <img src={heroImage} alt="" className="lp-hero-media" />
                        ) : null}
                    </div>
                )}

                {/* Glass Nav */}
                <nav className="lp-glass-nav lp-animate-fade-up">
                    <a href="#" className="lp-nav-brand">
                        {(config?.landing_logo || config?.logo_sistema) ? (
                            <img src={config?.landing_logo || config?.logo_sistema} alt={empNome} className="lp-nav-logo" />
                        ) : (
                            <span className="lp-nav-name">{empNome.toUpperCase()}</span>
                        )}
                    </a>
                    <div className="lp-nav-links">
                        <a href="#processo">Processo</a>
                        <a href="#portfolio">Projetos</a>
                        <a href="#orcamento">Contato</a>
                    </div>
                    {waHref ? (
                        <a href={waHref} target="_blank" rel="noreferrer" className="lp-btn-nav">Falar Conosco</a>
                    ) : (
                        <a href="#orcamento" className="lp-btn-nav">Falar Conosco</a>
                    )}
                </nav>

                {/* Hero Content */}
                <div className="lp-container">
                    <div className="lp-hero-content">
                        <div className="lp-hero-text">
                            <div className="lp-animate-blur-in lp-delay-1">
                                <h1 className="lp-headline">
                                    {heroTitulo.split('.').filter(Boolean).map((part, i) => (
                                        <span key={i}>
                                            {i === 0 ? <>{part.trim().split(' ').slice(0, -1).join(' ')} <span className="lp-hl">{part.trim().split(' ').pop()}</span></> : <>{part.trim().split(' ').slice(0, -1).join(' ')} <span className="lp-hl">{part.trim().split(' ').pop()}</span></>}
                                            {i < heroTitulo.split('.').filter(Boolean).length - 1 ? '.' : '.'}
                                            <br />
                                        </span>
                                    ))}
                                </h1>
                            </div>
                            <p className="lp-subheadline lp-animate-fade-up lp-delay-2">{heroDesc}</p>
                            <div className="lp-cta-group lp-animate-fade-up lp-delay-3">
                                <a href="#portfolio" className="lp-btn-copper">
                                    Ver Projetos <ArrowRight size={16} />
                                </a>
                                {waHref && (
                                    <a href={waHref} target="_blank" rel="noreferrer" className="lp-btn-outline">
                                        Falar no WhatsApp <ArrowRight size={14} />
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Hero right — image or decorative */}
                        <div className="lp-hero-image-side lp-animate-blur-in lp-delay-2">
                            {heroImage ? (
                                <div className="lp-hero-image-wrapper lp-animate-float">
                                    <img src={heroImage} alt={empNome} className="lp-hero-img" />
                                </div>
                            ) : (
                                <div className="lp-hero-image-wrapper lp-animate-float" style={{ background: `linear-gradient(135deg, ${acc}15, ${acc}05)` }}>
                                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                                        <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 'clamp(4rem, 8vw, 8rem)', fontWeight: 200, color: `${acc}30`, letterSpacing: '-0.05em' }}>
                                            {empNome.charAt(0)}
                                        </span>
                                    </div>
                                </div>
                            )}
                            <div className="lp-image-glow" style={{ background: `radial-gradient(circle, ${acc}40 0%, transparent 70%)` }} />
                        </div>
                    </div>
                </div>
            </header>

            {/* ═══ TRUST BAR — Números animados ═══ */}
            {stats && (stats.projetos > 0 || stats.anos > 0) && (
                <section className="lp-stats-bar" ref={statsRef}>
                    <div className="lp-container lp-stats-grid">
                        {stats.projetos > 0 && (
                            <div className="lp-stat-item">
                                <span className="lp-stat-num">{cnt1}+</span>
                                <span className="lp-stat-label">Projetos Entregues</span>
                            </div>
                        )}
                        {stats.anos > 0 && (
                            <div className="lp-stat-item">
                                <span className="lp-stat-num">{cnt2}</span>
                                <span className="lp-stat-label">Anos de Experiência</span>
                            </div>
                        )}
                        {stats.ambientes > 0 && (
                            <div className="lp-stat-item">
                                <span className="lp-stat-num">{cnt3}+</span>
                                <span className="lp-stat-label">Ambientes Projetados</span>
                            </div>
                        )}
                        {stats.clientes > 0 && (
                            <div className="lp-stat-item">
                                <span className="lp-stat-num">{cnt4}+</span>
                                <span className="lp-stat-label">Clientes Atendidos</span>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ═══ TIMELINE — Etapas do Projeto ═══ */}
            <section className="lp-timeline-sec" id="processo">
                <div className="lp-section-bg">
                    {/* subtle warm radial only */}
                </div>
                <div className="lp-timeline-outer">
                    <h2 className="lp-headline" style={{ textAlign: 'center', marginBottom: '6rem', maxWidth: 900, marginInline: 'auto' }}>
                        Do primeiro contato à instalação: um processo pensado para <span className="lp-hl">encantar.</span>
                    </h2>

                    <div className="lp-timeline-body" ref={timelineRef} style={{ position: 'relative' }}>
                        <div className="lp-timeline-line" ref={timelineLineRef} />
                        <div className="lp-timeline-progress" ref={timelineProgressRef} />

                        {etapas.map((etapa, idx) => (
                            <div key={idx} className="lp-timeline-item lp-reveal">
                                <div className="lp-timeline-dot" />
                                <div className="lp-timeline-content">
                                    {/* number inside card only */}
                                    <div className="lp-timeline-card">
                                        <div className="lp-timeline-card-header">
                                            <div className="lp-timeline-icon">{String(idx + 1).padStart(2, '0')}</div>
                                            <h3 className="lp-timeline-title">{etapa.titulo}</h3>
                                        </div>
                                        <p className="lp-timeline-desc">{etapa.descricao}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ PORTFOLIO — Bento Grid with 3D Tilt ═══ */}
            <section className="lp-portfolio-sec" id="portfolio">
                <div className="lp-proj-bg" />
                <div className="lp-portfolio-container">
                    <h2 className="lp-headline" style={{ textAlign: 'center', marginBottom: '4rem', marginInline: 'auto' }}>
                        Projetos que já <span className="lp-hl">executamos</span>
                    </h2>
                    <div className="lp-projects-grid lp-reveal">
                        {portfolioItems.slice(0, 6).map((item, i) => (
                            <div
                                key={item.id}
                                className={`lp-project-card${i === 0 ? ' featured' : ''}`}
                            >
                                <div className="lp-project-img-wrap">
                                    <img src={item.imagem} alt={item.titulo || 'Projeto'} loading="lazy" />
                                </div>
                                <div className="lp-project-info">
                                    <h3 className="lp-project-title">{item.titulo || 'Projeto Ornato'}</h3>
                                    {item.descricao && <p className="lp-project-desc">{item.descricao}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                    {igHandle && (
                        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                            <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noreferrer" className="lp-btn-instagram">
                                <Instagram size={18} /> Acompanhe nossos projetos no Instagram
                            </a>
                        </div>
                    )}
                </div>
            </section>

            {/* ═══ DEPOIMENTOS — Marquee ═══ */}
            {depoimentos.length > 0 && (
                <section className="lp-testimonials-sec">
                    <h2 className="lp-headline" style={{ textAlign: 'center', marginBottom: '4rem', marginInline: 'auto', padding: '0 24px' }}>
                        O que nossos clientes <span className="lp-hl">dizem</span>
                    </h2>
                    <div className="lp-marquee-container">
                        <div className="lp-marquee-content">
                            {marqueeDepoimentos.map((dep, idx) => (
                                <div key={idx} className="lp-testimonial-card">
                                    <div className="lp-quote-icon">"</div>
                                    <p className="lp-testimonial-text">{dep.depoimento}</p>
                                    <div className="lp-testimonial-author">
                                        <div className="lp-author-avatar" style={{ background: `${acc}20`, color: acc }}>
                                            {(dep.nome || 'C')[0].toUpperCase()}
                                        </div>
                                        <div className="lp-author-info">
                                            <span className="lp-author-name">{dep.nome || 'Cliente'}</span>
                                            <span className="lp-author-role">{dep.projeto || 'Projeto sob medida'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ═══ FORMULÁRIO + FAQ — Split layout ═══ */}
            <section className="lp-form-section" id="orcamento">
                <div className="lp-section-bg">
                    {/* subtle warm radial only */}
                </div>
                <div className="lp-container" style={{ position: 'relative', zIndex: 10 }}>
                    <h2 className="lp-headline lp-reveal" style={{ textAlign: 'center', marginBottom: '4rem', marginInline: 'auto' }}>
                        Solicite seu <span className="lp-hl">orçamento</span>
                    </h2>

                    <div className="lp-form-grid">
                        {/* Form */}
                        <div className="lp-form-card-glass lp-reveal">
                            {enviado ? (
                                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                                    <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
                                        <CheckCircle2 size={30} />
                                    </div>
                                    <h3 style={{ margin: '0 0 8px', fontSize: 22, fontFamily: "'Oswald', sans-serif", fontWeight: 300, color: '#fff' }}>Recebemos seu contato!</h3>
                                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>Nossa equipe vai entrar em contato para alinhar os detalhes do seu projeto.</p>
                                </div>
                            ) : (
                                <form onSubmit={enviar} className="lp-form-inner">
                                    <input className="lp-dark-input" placeholder="Seu nome *" required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                                    <input className="lp-dark-input" placeholder="WhatsApp *" required value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: formatTel(e.target.value) }))} />
                                    <select className="lp-dark-input" value={form.tipo_projeto} onChange={e => setForm(f => ({ ...f, tipo_projeto: e.target.value }))}>
                                        <option value="">O que você precisa?</option>
                                        {TIPOS_PROJETO.map((t) => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <textarea className="lp-dark-input" rows={3} placeholder="Conte um pouco sobre seu projeto (opcional)" value={form.mensagem} onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))} />
                                    {erro && <div className="lp-form-erro">{erro}</div>}
                                    <div className="lp-btn-cta-wrap">
                                        <button type="submit" className="lp-btn-cta-main" disabled={enviando}>
                                            {enviando ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                                            {enviando ? 'Enviando...' : 'Solicitar Orçamento'}
                                        </button>
                                    </div>
                                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 4 }}>
                                        Ao enviar, você autoriza contato da equipe {empNome}.
                                    </p>
                                </form>
                            )}
                        </div>

                        {/* FAQ */}
                        <div className="lp-faq-side lp-reveal">
                            <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: '1.4rem', fontWeight: 300, color: '#fff', marginBottom: 24, letterSpacing: '-0.02em' }}>Dúvidas frequentes</h3>
                            <div className="lp-faq-list">
                                {faqList.map((item, idx) => (
                                    <div key={idx} className={`lp-faq-item${faqOpen === idx ? ' open' : ''}`}>
                                        <button className="lp-faq-q" onClick={() => setFaqOpen(faqOpen === idx ? -1 : idx)}>
                                            <span>{item.q}</span>
                                            <ChevronDown size={16} className="lp-faq-chevron" />
                                        </button>
                                        <div className="lp-faq-a" style={{ maxHeight: faqOpen === idx ? 200 : 0 }}>
                                            <p>{item.a}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ CTA FINAL ═══ */}
            <section className="lp-cta-section lp-reveal" id="contact">
                <div className="lp-cta-aura" />
                <div className="lp-cta-container">
                    <div className="lp-cta-card">
                        <h2 className="lp-headline" style={{ marginBottom: '1.5rem', maxWidth: 700 }}>
                            Seu próximo ambiente pode ser feito <span className="lp-hl">sob medida.</span>
                        </h2>
                        <p className="lp-cta-subtitle">
                            Fale com nossa equipe e receba uma consultoria personalizada para transformar seu espaço.
                        </p>
                        <div className="lp-cta-actions">
                            {waHref && (
                                <a href={waHref} target="_blank" rel="noreferrer" className="lp-btn-wa-cta">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M5.337 21.672L.4 24l2.433-5.15A11.934 11.934 0 0 1 .001 12C.001 5.374 5.374 0 12 0s12 5.373 12 12c0 6.628-5.373 12-12 12a11.96 11.96 0 0 1-6.663-2.328z"/></svg>
                                    Falar no WhatsApp
                                </a>
                            )}
                            <a href="#orcamento" className="lp-btn-outline lp-btn-outline-light">
                                Começar Meu Projeto <ArrowRight size={16} />
                            </a>
                        </div>

                        {/* Contacts */}
                        <div className="lp-footer-contacts">
                            {config?.telefone && <a href={`tel:${config.telefone}`}><Phone size={14} /> {config.telefone}</a>}
                            {config?.email && <a href={`mailto:${config.email}`}><Mail size={14} /> {config.email}</a>}
                            {config?.cidade && <span><MapPin size={14} /> {config.cidade}</span>}
                            {igHandle && <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noreferrer"><Instagram size={14} /> @{igHandle}</a>}
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="lp-footer-bar">
                <div className="lp-container lp-footer-inner">
                    <span>{config?.landing_texto_rodape || `${empNome} © ${new Date().getFullYear()}`}</span>
                    {igHandle && (
                        <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noreferrer">
                            <Instagram size={13} /> @{igHandle}
                        </a>
                    )}
                </div>
            </footer>

            {/* WhatsApp floating */}
            {waHref && (
                <a href={waHref} target="_blank" rel="noreferrer" className="lp-wa-float" aria-label="WhatsApp">
                    <MessageCircle size={28} fill="#fff" />
                </a>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS — Dark Premium
// ═══════════════════════════════════════════════════════════════════════════════
function buildCSS(acc) {
    return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Oswald:wght@200;300;400;500;600&display=swap');

/* ── Reset ── */
.lp { margin:0; padding:0; font-family:'Inter',system-ui,sans-serif; overflow-x:hidden; -webkit-font-smoothing:antialiased; color:#fff; background:#030201; line-height:1.6; }
.lp *, .lp *::before, .lp *::after { box-sizing:border-box; margin:0; padding:0; }
.lp-container { max-width:1400px; margin:0 auto; padding:0 4rem; }

/* ── Animations ── */
@keyframes fadeInUp { 0% { opacity:0; transform:translateY(20px); } 100% { opacity:1; transform:translateY(0); } }
@keyframes blurIn { 0% { opacity:0; filter:blur(20px); transform:scale(0.98); } 100% { opacity:1; filter:blur(0); transform:scale(1); } }
/* beam/lines animations removed — clean buttons */
@keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-15px); } }
@keyframes spin { to { transform:rotate(360deg); } }
@keyframes marqueeScroll { 0% { transform:translateX(0); } 100% { transform:translateX(calc(-50% - 1.5rem)); } }
@keyframes ctaBorderSpin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
@keyframes ctaAura { 0%,100% { box-shadow:0 0 15px ${acc}30, 0 0 30px ${acc}15; transform:scale(1); } 50% { box-shadow:0 0 40px ${acc}80, 0 0 80px ${acc}40, 0 0 120px ${acc}20; transform:scale(1.03); } }
@keyframes liquidMove1 { 0% { transform:translate(0,0) scale(1) rotate(0deg); } 100% { transform:translate(-10%,20%) scale(1.1) rotate(10deg); } }
@keyframes liquidMove2 { 0% { transform:translate(0,0) scale(1.05); } 100% { transform:translate(15%,-15%) scale(1); } }
@keyframes liquidMove3 { 0% { transform:translate(0,0) rotate(0deg); } 100% { transform:translate(-15%,-10%) rotate(20deg); } }
@keyframes lpPulse { 0%,100%{box-shadow:0 0 0 0 rgba(37,211,102,0.4)} 70%{box-shadow:0 0 0 14px rgba(37,211,102,0)} }

.lp-animate-fade-up { animation:fadeInUp 0.8s cubic-bezier(0.16,1,0.3,1) both; }
.lp-animate-blur-in { animation:blurIn 1.2s cubic-bezier(0.16,1,0.3,1) both; }
.lp-animate-float { animation:float 6s ease-in-out infinite; }
.lp-delay-1 { animation-delay:100ms; }
.lp-delay-2 { animation-delay:200ms; }
.lp-delay-3 { animation-delay:300ms; }

/* Reveal */
.lp-reveal { opacity:0; transform:translateY(40px); transition:all 1s cubic-bezier(0.16,1,0.3,1); }
.lp-reveal.active { opacity:1; transform:translateY(0); }

/* ── AURA SYSTEM ── */
.lp-aura-wrap { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; background:#000; }
.lp-aura-wrap .lp-aura { position:absolute; width:75vw; height:75vw; border-radius:50%; filter:blur(160px); opacity:0.35; mix-blend-mode:plus-lighter; }
.lp-aura-1 { top:-15%; right:-10%; animation:liquidMove1 30s infinite alternate ease-in-out; }
.lp-aura-2 { background:radial-gradient(circle, #3D2B1F 0%, transparent 70%); bottom:-15%; left:-10%; animation:liquidMove2 35s infinite alternate ease-in-out; }
.lp-aura-3 { top:35%; left:25%; width:45vw !important; height:45vw !important; animation:liquidMove3 25s infinite alternate-reverse ease-in-out; opacity:0.2 !important; }
.lp-noise { position:absolute; inset:0; z-index:1; opacity:0.02; pointer-events:none; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

/* Hero media */
.lp-hero-media-wrap { position:absolute; inset:0; z-index:0; }
.lp-hero-media-wrap::after { content:''; position:absolute; inset:0; background:rgba(0,0,0,0.7); z-index:1; }
.lp-hero-media { width:100%; height:100%; object-fit:cover; position:absolute; inset:0; }

/* ── GLASS NAV ── */
.lp-glass-nav { position:fixed; top:2rem; left:0; right:0; margin:0 auto; width:min(95%,1200px); background:rgba(10,10,12,0.8); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.08); border-radius:9999px; padding:0.6rem 0.8rem 0.6rem 2.5rem; z-index:100; display:flex; justify-content:space-between; align-items:center; box-shadow:0 20px 40px rgba(0,0,0,0.4); }
.lp-nav-brand { text-decoration:none; }
.lp-nav-logo { height:28px; width:auto; object-fit:contain; filter:brightness(0) invert(1); }
.lp-nav-name { font-family:'Oswald',sans-serif; font-size:1.4rem; font-weight:300; color:white; letter-spacing:-0.05em; }
.lp-nav-links { display:flex; gap:3rem; position:absolute; left:50%; transform:translateX(-50%); }
.lp-nav-links a { color:rgba(255,255,255,0.7); text-decoration:none; font-size:0.8rem; font-weight:500; letter-spacing:0.05em; text-transform:uppercase; transition:all 0.3s; }
.lp-nav-links a:hover { color:#fff; text-shadow:0 0 10px rgba(255,255,255,0.3); }
.lp-btn-nav { display:inline-flex; align-items:center; justify-content:center; height:42px; padding:0 1.5rem; background:${acc}; color:#000; text-decoration:none; border-radius:9999px; font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; transition:all 0.3s; border:none; }
.lp-btn-nav:hover { transform:translateY(-2px); box-shadow:0 6px 20px ${acc}60; filter:brightness(1.1); }

/* ── HERO LAYOUT ── */
.lp-hero { min-height:100vh; display:flex; align-items:center; padding-top:8rem; position:relative; overflow:hidden; }
.lp-hero-content { display:grid; grid-template-columns:1.1fr 0.9fr; gap:6rem; align-items:center; width:100%; position:relative; z-index:10; }
.lp-hero-text { display:flex; flex-direction:column; gap:2.5rem; }

.lp-headline { font-family:'Oswald',sans-serif; font-size:clamp(2.5rem,5.5vw,4.5rem); font-weight:200; line-height:1.1; letter-spacing:-0.01em; }
.lp-hl { color:${acc}; font-weight:300; position:relative; }
.lp-hl::after { content:''; position:absolute; bottom:0.1em; left:0; width:100%; height:1px; background:${acc}; opacity:0.3; }

.lp-subheadline { font-size:1.15rem; color:rgba(255,255,255,0.7); max-width:520px; font-weight:300; line-height:1.6; }

/* Hero image */
.lp-hero-image-side { position:relative; display:flex; justify-content:flex-end; }
.lp-hero-image-wrapper { position:relative; width:100%; max-width:420px; aspect-ratio:0.85; border-radius:3rem; overflow:hidden; border:2px solid ${acc}30; background:#0a0a0c; box-shadow:0 0 30px -10px ${acc}40, 0 50px 100px -20px rgba(0,0,0,0.7); transition:border-color 0.4s; }
.lp-hero-image-wrapper:hover { border-color:${acc}; }
.lp-hero-img { width:100%; height:100%; object-fit:cover; object-position:top; filter:contrast(1.05); mask-image:linear-gradient(to bottom, black 85%, transparent 100%); -webkit-mask-image:linear-gradient(to bottom, black 85%, transparent 100%); }
.lp-image-glow { position:absolute; top:50%; left:50%; transform:translate(-30%,-30%); width:120%; height:120%; filter:blur(60px); z-index:-1; opacity:0.5; }

/* ── BUTTONS ── */
.lp-btn-copper { display:inline-flex; align-items:center; justify-content:center; gap:0.6rem; height:54px; padding:0 2.5rem; background:linear-gradient(135deg, ${acc}, ${acc}cc); color:#fff; text-decoration:none; border-radius:9999px; font-weight:700; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.08em; cursor:pointer; transition:all 0.35s cubic-bezier(0.16,1,0.3,1); border:none; font-family:inherit; box-shadow:0 4px 20px ${acc}30; }
.lp-btn-copper:hover { transform:translateY(-2px); box-shadow:0 8px 30px ${acc}50; filter:brightness(1.1); }
.lp-btn-copper:disabled { opacity:0.6; cursor:wait; transform:none; }

.lp-btn-instagram { display:inline-flex; align-items:center; gap:0.6rem; padding:0.8rem 2rem; background:transparent; color:${acc}; border:1.5px solid ${acc}55; border-radius:9999px; font-weight:600; font-size:0.85rem; text-decoration:none; letter-spacing:0.03em; transition:all 0.35s ease; font-family:inherit; }
.lp-btn-instagram:hover { background:${acc}15; border-color:${acc}; transform:translateY(-2px); box-shadow:0 4px 20px ${acc}20; }
.lp-btn-instagram svg { color:${acc}; }

/* ── CTA Main — rotating border beam ── */
.lp-btn-cta-wrap { position:relative; display:inline-flex; width:100%; border-radius:9999px; padding:2px; overflow:hidden; animation:ctaAura 2s ease-in-out infinite; }
.lp-btn-cta-wrap::before { content:""; position:absolute; top:50%; left:50%; width:300%; height:600%; margin-top:-300%; margin-left:-150%; background:conic-gradient(from 0deg, transparent 0%, transparent 40%, ${acc}90 55%, #fff 60%, ${acc}90 65%, transparent 80%, transparent 100%); animation:ctaBorderSpin 2.5s linear infinite; pointer-events:none; z-index:0; }
.lp-btn-cta-main { display:inline-flex; align-items:center; justify-content:center; gap:0.7rem; height:58px; width:100%; padding:0 2.5rem; background:linear-gradient(135deg, ${acc}, ${acc}dd); color:#fff; text-decoration:none; border-radius:9999px; font-weight:800; font-size:0.95rem; text-transform:uppercase; letter-spacing:0.1em; cursor:pointer; border:none; font-family:inherit; position:relative; z-index:1; transition:all 0.35s cubic-bezier(0.16,1,0.3,1); box-shadow:0 4px 20px ${acc}30; }
.lp-btn-cta-main:hover { transform:translateY(-2px) scale(1.02); box-shadow:0 12px 40px ${acc}60; filter:brightness(1.15); }
.lp-btn-cta-main:active { transform:translateY(0) scale(0.98); }
.lp-btn-cta-main:disabled { opacity:0.6; cursor:wait; transform:none; filter:none; }
.lp-btn-cta-wrap:hover::before { animation-duration:1s; }

.lp-btn-outline { display:inline-flex; align-items:center; justify-content:center; gap:0.6rem; height:54px; padding:0 2.5rem; background:transparent; color:${acc}; text-decoration:none; border-radius:9999px; font-weight:600; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.08em; cursor:pointer; transition:all 0.35s cubic-bezier(0.16,1,0.3,1); border:1.5px solid ${acc}50; font-family:inherit; }
.lp-btn-outline:hover { background:${acc}; color:#fff; border-color:${acc}; box-shadow:0 8px 30px ${acc}30; transform:translateY(-2px); }

.lp-btn-outline-light { color:#fff; border-color:rgba(255,255,255,0.25); }
.lp-btn-outline-light:hover { background:${acc}; color:#fff; border-color:${acc}; }

/* ── CTA Group ── */
.lp-cta-group { display:flex; gap:2.5rem; align-items:center; }

/* ── STATS BAR ── */
.lp-stats-bar { position:relative; padding:2rem 0; background:#040302; border-top:1px solid rgba(255,255,255,0.06); border-bottom:1px solid rgba(255,255,255,0.06); }
.lp-stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:20px; text-align:center; }
.lp-stat-num { font-family:'Oswald',sans-serif; font-size:clamp(2rem,4vw,3rem); font-weight:300; color:${acc}; display:block; line-height:1; }
.lp-stat-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.5); font-weight:500; margin-top:4px; display:block; }

/* ── TIMELINE ── */
.lp-timeline-sec { position:relative; padding:10rem 0; background:#060504; overflow:hidden; }
.lp-section-bg { position:absolute; inset:0; z-index:0; pointer-events:none; background:inherit; }
.lp-section-bg::before { content:""; position:absolute; top:-20%; left:10%; width:80%; height:140%; background:radial-gradient(circle at center, ${acc}12 0%, transparent 70%); filter:blur(120px); }
/* dots-grid removed — clean warm background */

.lp-timeline-outer { position:relative; max-width:1200px; margin:0 auto; padding:0 2rem; z-index:10; }
.lp-timeline-line { position:absolute; left:50%; transform:translateX(-50%); top:0; width:4px; background:rgba(255,255,255,0.05); border-radius:2px; }
.lp-timeline-progress { position:absolute; left:50%; transform:translateX(-50%); top:0; width:4px; height:0; background:linear-gradient(to bottom, ${acc}, ${acc}80); box-shadow:0 0 20px ${acc}40; border-radius:2px; transition:height 0.1s linear; }

.lp-timeline-item { position:relative; display:flex; width:100%; margin-bottom:5rem; }
.lp-timeline-item:last-child { margin-bottom:0; }
.lp-timeline-item:nth-child(odd) { justify-content:flex-start; }
.lp-timeline-item:nth-child(odd) .lp-timeline-content { width:50%; justify-content:flex-end; padding-right:5rem; }
.lp-timeline-item:nth-child(even) { justify-content:flex-end; }
.lp-timeline-item:nth-child(even) .lp-timeline-content { width:50%; justify-content:flex-start; padding-left:5rem; }
.lp-timeline-content { display:flex; position:relative; }

.lp-timeline-dot { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:16px; height:16px; background:#000; border:3px solid ${acc}; border-radius:50%; z-index:20; box-shadow:0 0 15px ${acc}40; }

.lp-timeline-year { position:absolute; top:50%; transform:translateY(-50%); font-family:'Oswald',sans-serif; font-size:1.8rem; font-weight:200; color:rgba(255,255,255,0.5); white-space:nowrap; }
.lp-timeline-item:nth-child(odd) .lp-timeline-year { left:calc(100% + 4rem); }
.lp-timeline-item:nth-child(even) .lp-timeline-year { right:calc(100% + 4rem); }

.lp-timeline-card { background:rgba(255,255,255,0.03); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.08); border-radius:2rem; padding:2.5rem; max-width:450px; transition:all 0.4s ease; }
.lp-timeline-card:hover { border-color:${acc}; background:rgba(255,255,255,0.05); transform:translateY(-5px); }

.lp-timeline-card-header { display:flex; align-items:center; gap:1.5rem; margin-bottom:1.5rem; }
.lp-timeline-icon { width:48px; height:48px; display:flex; align-items:center; justify-content:center; background:${acc}10; border-radius:1rem; border:1px solid ${acc}20; font-family:'Oswald',sans-serif; font-size:1rem; font-weight:300; color:${acc}; letter-spacing:0.05em; transition:all 0.4s ease; }
.lp-timeline-card:hover .lp-timeline-icon { background:${acc}20; border-color:${acc}; transform:scale(1.1); box-shadow:0 0 20px ${acc}30; }
.lp-timeline-title { font-family:'Oswald',sans-serif; font-size:1.6rem; font-weight:400; letter-spacing:-0.02em; }
.lp-timeline-desc { color:rgba(255,255,255,0.6); font-size:0.95rem; line-height:1.6; font-weight:300; }

/* ── PORTFOLIO SECTION ── */
.lp-portfolio-sec { position:relative; padding:8rem 2rem 12rem; background:#0a0806; overflow:hidden; }
.lp-portfolio-sec::before { content:""; position:absolute; top:0; left:0; right:0; height:200px; background:linear-gradient(to bottom, #060504, #0a0806); z-index:0; pointer-events:none; }
.lp-proj-bg { position:absolute; inset:0; z-index:1; pointer-events:none; background:radial-gradient(ellipse 80% 60% at 20% 80%, ${acc}0a 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 20%, ${acc}06 0%, transparent 50%); }
.lp-portfolio-container { max-width:1200px; margin:0 auto; position:relative; z-index:5; }

.lp-projects-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1.5rem; margin-top:4rem; }
.lp-project-card { border-radius:1.2rem; overflow:hidden; cursor:pointer; opacity:0; transform:translateY(30px); transition:transform 0.4s ease, box-shadow 0.4s ease; }
.lp-project-card.active { opacity:1; transform:translateY(0); }
.lp-project-card.featured { }
.lp-project-card:hover { transform:translateY(-6px); box-shadow:0 20px 50px rgba(0,0,0,0.6); }

.lp-project-img-wrap { aspect-ratio:4/3; overflow:hidden; }
.lp-project-img-wrap img { width:100%; height:100%; object-fit:cover; transition:transform 0.6s ease; display:block; }
.lp-project-card:hover .lp-project-img-wrap img { transform:scale(1.06); }

.lp-project-info { padding:1rem 1.2rem 1.2rem; }
.lp-project-title { font-size:1rem; font-weight:600; margin-bottom:0.3rem; line-height:1.2; color:rgba(255,255,255,0.9); }
.lp-project-desc { font-size:0.8rem; color:rgba(255,255,255,0.5); line-height:1.4; font-weight:400; }

/* ── TESTIMONIALS MARQUEE ── */
.lp-testimonials-sec { position:relative; padding:8rem 0; background:#050403; overflow:hidden; }
.lp-testimonials-sec::before { content:""; position:absolute; top:0; left:50%; transform:translateX(-50%); width:100%; height:1px; background:linear-gradient(90deg,transparent,${acc}30,transparent); }
.lp-testimonials-sec::after { content:""; position:absolute; inset:0; background:radial-gradient(ellipse 70% 80% at 50% 100%, ${acc}08 0%, transparent 60%); pointer-events:none; }

.lp-marquee-container { position:relative; width:100%; overflow:hidden; padding:3rem 0; mask-image:linear-gradient(to right,transparent,black 15%,black 85%,transparent); -webkit-mask-image:linear-gradient(to right,transparent,black 15%,black 85%,transparent); }
.lp-marquee-content { display:flex; gap:2rem; width:max-content; animation:marqueeScroll 20s linear infinite; }
.lp-marquee-content:hover { animation-play-state:paused; }

.lp-testimonial-card { width:420px; background:rgba(255,255,255,0.03); backdrop-filter:blur(25px) saturate(180%); -webkit-backdrop-filter:blur(25px) saturate(180%); border:1px solid rgba(255,255,255,0.1); border-radius:2rem; padding:3rem 2.5rem; display:flex; flex-direction:column; justify-content:space-between; transition:all 0.5s cubic-bezier(0.4,0,0.2,1); flex-shrink:0; position:relative; box-shadow:inset 0 0 40px rgba(255,255,255,0.02), 0 20px 40px rgba(0,0,0,0.4); }
.lp-testimonial-card:hover { background:rgba(255,255,255,0.05); border-color:${acc}; transform:translateY(-15px) scale(1.02); box-shadow:inset 0 0 20px ${acc}10, 0 30px 60px rgba(0,0,0,0.6); }
.lp-testimonial-card::after { content:""; position:absolute; inset:0; border-radius:2rem; padding:1px; background:linear-gradient(135deg,rgba(255,255,255,0.2),transparent,${acc}20); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; opacity:0.5; pointer-events:none; }

.lp-quote-icon { font-size:3.5rem; font-family:'Oswald',sans-serif; color:${acc}; line-height:1; margin-bottom:1rem; opacity:0.5; }
.lp-testimonial-text { font-size:1.05rem; color:rgba(255,255,255,0.8); line-height:1.6; margin-bottom:2rem; font-weight:300; font-style:italic; }
.lp-testimonial-author { display:flex; align-items:center; gap:1rem; }
.lp-author-avatar { width:44px; height:44px; border-radius:50%; display:grid; place-items:center; font-size:1.1rem; font-weight:700; flex-shrink:0; }
.lp-author-info { display:flex; flex-direction:column; gap:0.1rem; }
.lp-author-name { font-weight:700; color:#fff; font-size:0.95rem; }
.lp-author-role { font-size:0.75rem; color:${acc}; text-transform:uppercase; letter-spacing:0.1em; }

/* ── FORM SECTION ── */
.lp-form-section { position:relative; padding:8rem 0; background:#080604; overflow:hidden; }
.lp-form-section::before { content:""; position:absolute; inset:0; background:radial-gradient(ellipse 50% 60% at 30% 50%, ${acc}08 0%, transparent 50%), radial-gradient(ellipse 40% 50% at 80% 80%, rgba(60,40,20,0.06) 0%, transparent 50%); pointer-events:none; z-index:0; }
.lp-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:3rem; align-items:start; }

.lp-form-card-glass { background:rgba(255,255,255,0.03); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.08); border-radius:2rem; padding:2.5rem; }
.lp-form-inner { display:grid; gap:14px; }
.lp-dark-input { width:100%; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:14px 16px; font-size:15px; outline:none; font-family:inherit; background:rgba(255,255,255,0.05); color:#fff; transition:border-color 0.2s, box-shadow 0.2s; }
.lp-dark-input:focus { border-color:${acc}; box-shadow:0 0 0 3px ${acc}18; }
.lp-dark-input::placeholder { color:rgba(255,255,255,0.35); }
.lp-dark-input option { background:#111; color:#fff; }
.lp-btn-submit-full { width:100%; }
.lp-form-erro { font-size:13px; color:#FCA5A5; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); border-radius:10px; padding:10px 12px; }

/* ── FAQ (Dark) ── */
.lp-faq-list { display:grid; gap:8px; }
.lp-faq-item { border:1px solid rgba(255,255,255,0.08); border-radius:14px; overflow:hidden; background:rgba(255,255,255,0.02); transition:border-color 0.2s; }
.lp-faq-item:hover, .lp-faq-item.open { border-color:${acc}40; }
.lp-faq-q { width:100%; background:none; border:none; padding:16px 18px; display:flex; justify-content:space-between; align-items:center; gap:16px; cursor:pointer; font-size:0.9rem; font-weight:500; text-align:left; color:#fff; font-family:inherit; }
.lp-faq-chevron { transition:transform 0.3s; flex-shrink:0; color:${acc}; }
.lp-faq-item.open .lp-faq-chevron { transform:rotate(180deg); }
.lp-faq-a { max-height:0; overflow:hidden; transition:max-height 0.35s cubic-bezier(0.22,1,0.36,1); }
.lp-faq-a p { padding:0 18px 16px; font-size:0.85rem; line-height:1.75; color:rgba(255,255,255,0.6); }

/* ── CTA FINAL ── */
.lp-cta-section { position:relative; padding:10rem 0; background:#0a0806; overflow:hidden; display:flex; justify-content:center; align-items:center; z-index:1; }
.lp-cta-aura { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; height:100%; background:radial-gradient(circle at 10% 20%, ${acc}12 0%, transparent 50%), radial-gradient(circle at 90% 80%, ${acc}10 0%, transparent 50%); filter:blur(120px); z-index:-1; }
.lp-cta-container { max-width:1100px; width:90%; margin:0 auto; position:relative; z-index:10; }
.lp-cta-card { background:rgba(255,255,255,0.02); backdrop-filter:blur(25px); -webkit-backdrop-filter:blur(25px); border:1px solid rgba(255,255,255,0.05); border-radius:3rem; padding:6rem 4rem; position:relative; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-shadow:inset 0 0 50px rgba(255,255,255,0.02), 0 40px 100px rgba(0,0,0,0.5); }
.lp-cta-card::before { content:""; position:absolute; inset:0; background:radial-gradient(circle at 50% 120%, ${acc}15, transparent 70%); pointer-events:none; }
.lp-cta-subtitle { font-size:1.2rem; max-width:550px; margin:0 auto 3rem; color:rgba(255,255,255,0.5); font-weight:300; line-height:1.6; }
.lp-cta-actions { display:flex; gap:1.5rem; align-items:center; flex-wrap:wrap; justify-content:center; }

.lp-btn-wa-cta { display:inline-flex; align-items:center; gap:8px; padding:16px 32px; background:#25D366; color:#fff; border:none; border-radius:9999px; font-size:0.9rem; font-weight:700; text-decoration:none; cursor:pointer; transition:all 0.3s; text-transform:uppercase; letter-spacing:0.08em; box-shadow:0 4px 15px rgba(37,211,102,0.3); }
.lp-btn-wa-cta:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(37,211,102,0.5); }
.lp-cta-beam { height:54px; padding:0 2.5rem; }

.lp-footer-contacts { display:flex; gap:20px; justify-content:center; flex-wrap:wrap; margin-top:3rem; padding-top:2rem; border-top:1px solid rgba(255,255,255,0.08); }
.lp-footer-contacts a, .lp-footer-contacts span { display:inline-flex; align-items:center; gap:6px; font-size:0.8rem; text-decoration:none; color:rgba(255,255,255,0.4); transition:color 0.2s; }
.lp-footer-contacts a:hover { color:${acc}; }

/* ── FOOTER ── */
.lp-footer-bar { padding:1rem 0; background:#050403; border-top:1px solid rgba(255,255,255,0.06); }
.lp-footer-inner { display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:rgba(255,255,255,0.3); flex-wrap:wrap; gap:8px; }
.lp-footer-inner a { color:rgba(255,255,255,0.3); text-decoration:none; display:inline-flex; gap:5px; align-items:center; transition:color 0.2s; }
.lp-footer-inner a:hover { color:${acc}; }

/* ── WHATSAPP FLOAT ── */
.lp-wa-float { position:fixed; bottom:24px; right:24px; z-index:9999; width:60px; height:60px; border-radius:50%; background:#25D366; color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 16px rgba(0,0,0,0.3); cursor:pointer; transition:transform 0.2s; animation:lpPulse 2s infinite; text-decoration:none; }
.lp-wa-float:hover { transform:scale(1.1); }

/* ═══ RESPONSIVE ═══ */
@media (max-width:1024px) {
    .lp-container { padding:0 2rem; }
    .lp-hero-content { grid-template-columns:1fr; text-align:center; gap:3rem; }
    .lp-hero-text { align-items:center; }
    .lp-hero-image-side { justify-content:center; order:-1; }
    .lp-hero-image-wrapper { max-width:300px; }
    .lp-cta-group { flex-direction:column; gap:1.5rem; width:100%; align-items:center; }
    .lp-nav-links { display:none; }

    /* Timeline mobile */
    .lp-timeline-line, .lp-timeline-progress { left:24px !important; transform:translateX(-50%) !important; }
    .lp-timeline-dot { left:24px !important; transform:translate(-50%,-50%) !important; }
    .lp-timeline-item { justify-content:flex-end !important; }
    .lp-timeline-item .lp-timeline-content { width:calc(100% - 60px) !important; padding-left:2rem !important; padding-right:0 !important; justify-content:flex-start !important; }
    .lp-timeline-year { position:static !important; transform:none !important; font-size:1.2rem !important; margin-bottom:0.5rem; display:block; }

    /* Portfolio mobile */
    .lp-projects-grid { grid-template-columns:repeat(2,1fr); gap:1rem; }
    .lp-project-card, .lp-project-card.featured { aspect-ratio:3/4; }

    .lp-form-grid { grid-template-columns:1fr; }
    .lp-cta-card { padding:4rem 2rem; border-radius:2rem; }
}

@media (max-width:768px) {
    .lp-container { padding:0 1rem; }
    .lp-timeline-sec { padding:6rem 0; }
    .lp-portfolio-sec { padding:5rem 1rem 8rem; }
    .lp-testimonials-sec { padding:5rem 0; }
    .lp-form-section { padding:5rem 0; }
    .lp-cta-section { padding:6rem 0; }
    .lp-headline { font-size:clamp(2rem,7vw,3rem); }
    .lp-testimonial-card { width:320px; padding:2rem 1.5rem; }
    .lp-glass-nav { top:1rem; padding:0.5rem 0.6rem 0.5rem 1.5rem; }
    .lp-btn-nav { height:36px; padding:0 1rem; font-size:0.65rem; }
    .lp-hero-image-wrapper { max-width:240px; }
    .lp-stats-grid { grid-template-columns:repeat(2,1fr); }
    .lp-project-title { font-size:1.5rem; }
    .lp-form-card-glass { padding:1.5rem; }
    .lp-cta-actions { flex-direction:column; }
    .lp-footer-contacts { flex-direction:column; align-items:center; gap:10px; }
}

@media (max-width:480px) {
    .lp-hero { padding-top:6rem; }
    .lp-hero-image-side { display:none; }
    .lp-cta-group { gap:1rem; }
    .lp-btn-copper { width:100%; }
    .lp-btn-outline { width:100%; }
    .lp-projects-grid { grid-template-columns:1fr; }
    .lp-timeline-card { padding:1.5rem; }
    .lp-timeline-title { font-size:1.3rem; }
    .lp-cta-card { padding:3rem 1.5rem; }
    .lp-form-grid { gap:2rem; }
}

@media (prefers-reduced-motion: reduce) {
    .lp-reveal { opacity:1 !important; transform:none !important; transition:none !important; }
    .lp-animate-fade-up, .lp-animate-blur-in { animation:none !important; opacity:1 !important; }
    .lp-animate-float { animation:none !important; }
    .lp-wa-float { animation:none !important; }
    .lp-marquee-content { animation:none !important; }
    .lp-aura { animation:none !important; }
}
`;
}
