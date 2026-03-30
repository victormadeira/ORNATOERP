import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowRight,
    CheckCircle2,
    Compass,
    Instagram,
    Loader2,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    PlayCircle,
    Send,
    ShieldCheck,
    Sofa,
    Sparkles,
} from 'lucide-react';

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

const DEFAULT_SERVICOS = [
    { titulo: 'Cozinhas Planejadas', descricao: 'Projetos sob medida para funcionalidade, estética e valorização do ambiente.' },
    { titulo: 'Dormitórios e Closets', descricao: 'Organização inteligente com acabamento premium e desenho autoral.' },
    { titulo: 'Home e Living', descricao: 'Marcenaria para espaços sociais com sofisticação e personalidade.' },
];

const DEFAULT_DIFERENCIAIS = [
    { titulo: 'Design e técnica', descricao: 'Criatividade aplicada com detalhamento técnico de alto padrão.' },
    { titulo: 'Materiais nobres', descricao: 'Seleção cuidadosa de materiais para durabilidade e presença estética.' },
    { titulo: 'Entrega confiável', descricao: 'Acompanhamento completo até a instalação final.' },
];

const DEFAULT_ETAPAS = [
    { titulo: 'Briefing', descricao: 'Entendimento da rotina, necessidades e estilo do cliente.' },
    { titulo: 'Projeto', descricao: 'Conceito, detalhamento e validação técnica do mobiliário.' },
    { titulo: 'Execução', descricao: 'Produção própria e instalação com acabamento refinado.' },
];

const DEFAULT_PROVAS = [
    { nome: 'Cliente Ornato', projeto: 'Cozinha Planejada', depoimento: 'Atendimento impecável e resultado além do esperado.' },
    { nome: 'Cliente Ornato', projeto: 'Closet Sob Medida', depoimento: 'Qualidade de acabamento excelente e instalação muito organizada.' },
    { nome: 'Cliente Ornato', projeto: 'Sala Integrada', depoimento: 'Projeto elegante, funcional e com execução no prazo combinado.' },
];

const ICONS = [Sparkles, Compass, Sofa, ShieldCheck];

function parseJsonList(value, fallback) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) && parsed.length ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function getHeroVideoSource(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url) return null;

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        let id = '';

        if (host === 'youtu.be') {
            id = parsed.pathname.split('/').filter(Boolean)[0] || '';
        } else if (host.endsWith('youtube.com')) {
            if (parsed.pathname.includes('/shorts/')) {
                id = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
            } else if (parsed.pathname.includes('/embed/')) {
                id = parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
            } else {
                id = parsed.searchParams.get('v') || '';
            }
        }

        if (id) {
            return {
                type: 'youtube',
                src: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&autoplay=1&mute=1&loop=1&playlist=${id}`,
            };
        }

        return { type: 'direct', src: url };
    } catch {
        return { type: 'direct', src: url };
    }
}

export default function LandingPage() {
    const [config, setConfig] = useState(null);
    const [portfolio, setPortfolio] = useState([]);
    const [form, setForm] = useState({ nome: '', telefone: '', email: '', tipo_projeto: '', faixa_investimento: '', possui_projeto: '', mensagem: '' });
    const [stats, setStats] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        fetch('/api/leads/config')
            .then(r => r.json())
            .then(cfg => {
                setConfig(cfg);
                // L1: SEO meta tags + Open Graph
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

        fetch('/api/portfolio')
            .then(r => r.json())
            .then(d => setPortfolio(Array.isArray(d) ? d : []))
            .catch(() => setPortfolio([]));

        // L4: Stats reais
        fetch('/api/leads/stats')
            .then(r => r.json())
            .then(setStats)
            .catch(() => setStats(null));
    }, []);

    const utm = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return {
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
        };
    }, []);

    const paleta = {
        fundo: config?.landing_cor_fundo || '#1E1917',
        destaque: config?.landing_cor_destaque || '#93614C',
        neutra: config?.landing_cor_neutra || '#847974',
        clara: config?.landing_cor_clara || '#DDD2CC',
    };

    const empNome = config?.nome || 'Ornato';
    const heroTitulo = config?.landing_titulo || 'Sua casa merece marcenaria de alto padrão, feita para durar e encantar.';
    const heroSubtitulo = config?.landing_subtitulo || 'Marcenaria sob medida';
    const heroDescricao = config?.landing_descricao || 'Projetamos, produzimos e instalamos ambientes sob medida com acabamento premium e atendimento consultivo.';

    const ctaPrimaria = config?.landing_cta_primaria || 'Agendar Minha Consultoria';
    const ctaSecundaria = config?.landing_cta_secundaria || 'Falar com Especialista';

    const formTitulo = config?.landing_form_titulo || 'Solicite seu atendimento';
    const formDescricao = config?.landing_form_descricao || 'Preencha em 30 segundos e receba contato da nossa equipe para orçamento e orientação.';

    const servicos = parseJsonList(config?.landing_servicos_json, DEFAULT_SERVICOS);
    const diferenciais = parseJsonList(config?.landing_diferenciais_json, DEFAULT_DIFERENCIAIS);
    const etapas = parseJsonList(config?.landing_etapas_json, DEFAULT_ETAPAS);
    const provaTitulo = config?.landing_prova_titulo || 'Clientes que confiaram na Ornato';
    const provas = parseJsonList(config?.landing_provas_json, DEFAULT_PROVAS);

    const telLimpo = (config?.telefone || '').replace(/\D/g, '');
    const waNum = telLimpo ? (telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`) : '';
    const waHref = waNum
        ? `https://wa.me/${waNum}?text=${encodeURIComponent('Olá! Vim pela landing page e gostaria de um orçamento.')}`
        : '';

    const igHandle = config?.instagram?.replace(/^@/, '') || '';
    const fbUrl = config?.facebook || '';

    const heroVideo = getHeroVideoSource(config?.landing_hero_video_url);
    const heroPoster = config?.landing_hero_video_poster || config?.landing_hero_imagem || '';
    const heroImage = config?.landing_hero_imagem || '';
    const heroGrafismo = config?.landing_grafismo_imagem || '';

    const formatTel = (v) => {
        const nums = v.replace(/\D/g, '').slice(0, 11);
        if (nums.length <= 2) return `(${nums}`;
        if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
        return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
    };

    const enviar = async (e) => {
        e.preventDefault();
        if (!form.nome.trim() || !form.telefone.trim() || !form.tipo_projeto || !form.faixa_investimento) {
            setErro('Preencha todos os campos obrigatórios: nome, telefone, tipo de projeto e expectativa de investimento.');
            return;
        }

        setEnviando(true);
        setErro('');

        try {
            const resp = await fetch('/api/leads/captura', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, ...utm }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || 'Erro ao enviar contato.');
            setEnviado(true);
        } catch (ex) {
            setErro(ex.message || 'Erro ao enviar. Tente novamente.');
        } finally {
            setEnviando(false);
        }
    };

    // L6: Animated counter
    const statsRef = useRef(null);
    const [statsVisible, setStatsVisible] = useState(false);
    useEffect(() => {
        if (!statsRef.current) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
        obs.observe(statsRef.current);
        return () => obs.disconnect();
    }, [config]);

    function AnimNum({ end, suffix = '' }) {
        const [val, setVal] = useState(0);
        useEffect(() => {
            if (!statsVisible) return;
            let start = 0;
            const dur = 1500;
            const step = (ts) => { if (!start) start = ts; const p = Math.min((ts - start) / dur, 1); setVal(Math.round(p * end)); if (p < 1) requestAnimationFrame(step); };
            requestAnimationFrame(step);
        }, [statsVisible, end]);
        return <>{val}{suffix}</>;
    }

    if (!config) {
        return (
            <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#1E1917' }}>
                <Loader2 size={30} style={{ color: '#DDD2CC', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (Number(config?.landing_ativo) === 0) {
        return (
            <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: paleta.fundo, color: paleta.clara, padding: 24 }}>
                <div style={{ textAlign: 'center', maxWidth: 520 }}>
                    <h1 style={{ fontSize: 36, margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{empNome}</h1>
                    <p style={{ marginTop: 10, opacity: 0.8 }}>Nossa página está em atualização. Em breve você terá uma nova experiência.</p>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                '--lp-bg': paleta.fundo,
                '--lp-acc': paleta.destaque,
                '--lp-mid': paleta.neutra,
                '--lp-soft': paleta.clara,
                background: '#F2ECE8',
                color: '#1F1A18',
                minHeight: '100vh',
                fontFamily: "'Manrope', 'Segoe UI', sans-serif",
            }}
        >
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
                @keyframes floatUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
                .lp-wrap { width: min(1180px, calc(100% - 40px)); margin: 0 auto; }
                .lp-hero { position: relative; overflow: hidden; color: var(--lp-soft); background: radial-gradient(circle at 18% 8%, #2A221F 0%, var(--lp-bg) 60%, #120D0C 100%); }
                .lp-grafismo { position: absolute; inset: 0; opacity: .30; background: repeating-linear-gradient(130deg, rgba(221,210,204,.06) 0px, rgba(221,210,204,.06) 2px, transparent 2px, transparent 120px); background-size: cover; background-position: center; pointer-events: none; }
                .lp-hero-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 26px; align-items: start; }
                .lp-title { font-family: 'Cormorant Garamond', Georgia, serif; line-height: 1.04; letter-spacing: .01em; }
                .lp-chip-wrap { display: grid; grid-template-columns: repeat(3, minmax(130px, 1fr)); gap: 9px; margin-top: 22px; }
                .lp-chip { border: 1px solid rgba(221,210,204,.18); border-radius: 12px; background: rgba(221,210,204,.08); padding: 11px; font-size: 12px; line-height: 1.45; }
                .lp-chip strong { display: block; margin-top: 3px; font-size: 13px; }
                .lp-btn-main { border: 0; border-radius: 12px; padding: 13px 16px; background: linear-gradient(135deg, var(--lp-acc), #7E4F3D); color: #fff; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
                .lp-btn-ghost { border: 1px solid rgba(221,210,204,.45); border-radius: 12px; padding: 12px 15px; background: transparent; color: var(--lp-soft); font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 7px; }
                .lp-form-card { background: #FFFFFF; color: #1E1917; border: 1px solid #E8DDD7; border-radius: 20px; box-shadow: 0 20px 44px rgba(10, 8, 7, .22); padding: 20px; }
                .lp-input { width: 100%; border: 1px solid #D8CCC5; border-radius: 11px; padding: 12px 13px; font-size: 14px; outline: none; box-sizing: border-box; font-family: inherit; background: #fff; }
                .lp-input:focus { border-color: var(--lp-acc); box-shadow: 0 0 0 3px rgba(147,97,76,.17); }
                .lp-small { font-size: 12px; color: #6D635D; line-height: 1.5; }
                .lp-media-shell { margin-top: 24px; border-radius: 18px; border: 1px solid rgba(221,210,204,.24); overflow: hidden; background: rgba(16, 12, 11, .58); box-shadow: 0 16px 40px rgba(0,0,0,.35); }
                .lp-media-label { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--lp-soft); opacity: .86; padding: 11px 14px; }
                .lp-media-frame { aspect-ratio: 16 / 8; min-height: 220px; width: 100%; background: #100D0C; }
                .lp-media-frame iframe, .lp-media-frame video, .lp-media-frame img { width: 100%; height: 100%; object-fit: cover; display: block; border: 0; }
                .lp-sec { padding: 68px 0; }
                .lp-card { background: #fff; border: 1px solid #E6DDD8; border-radius: 18px; box-shadow: 0 14px 34px rgba(30,25,23,.08); }
                .lp-cta-band { background: #1B1614; color: #E7DDD8; border: 1px solid #2E2623; border-radius: 18px; padding: 20px; }
                .lp-portfolio-list { display: flex; flex-direction: column; gap: 36px; }
                .lp-portfolio-row { display: grid; grid-template-columns: 1.2fr 1fr; gap: 30px; align-items: center; }
                .lp-portfolio-row.lp-row-reverse { grid-template-columns: 1fr 1.2fr; }
                .lp-portfolio-row.lp-row-reverse .lp-portfolio-img-wrap { order: 2; }
                .lp-portfolio-row.lp-row-reverse .lp-portfolio-text { order: 1; text-align: right; }
                .lp-portfolio-img-wrap { border-radius: 14px; overflow: hidden; aspect-ratio: 16 / 10; background: #E7DDD8; }
                .lp-portfolio-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .6s cubic-bezier(.16,1,.3,1); }
                .lp-portfolio-row:hover .lp-portfolio-img { transform: scale(1.03); }
                .lp-portfolio-title { margin: 0; font-size: 22px; }
                .lp-portfolio-desc { margin: 8px 0 0; color: #5B534F; line-height: 1.75; font-size: 14px; }
                details.lp-more { border: 1px dashed #D6CAC2; border-radius: 10px; padding: 10px 12px; }
                details.lp-more summary { cursor: pointer; font-size: 12px; color: #6D635D; }
                @media (max-width: 1020px) {
                    .lp-hero-grid { grid-template-columns: 1fr; }
                    .lp-chip-wrap { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
                }
                @media (max-width: 960px) {
                    .lp-portfolio-row, .lp-portfolio-row.lp-row-reverse { grid-template-columns: 1fr !important; gap: 14px; }
                    .lp-portfolio-row.lp-row-reverse .lp-portfolio-img-wrap { order: 1; }
                    .lp-portfolio-row.lp-row-reverse .lp-portfolio-text { order: 2; text-align: left; }
                    .lp-portfolio-img-wrap { aspect-ratio: 16 / 9; }
                    .lp-portfolio-title { font-size: 18px; }
                }
                @media (max-width: 760px) {
                    .lp-wrap { width: calc(100% - 28px); }
                    .lp-sec { padding: 54px 0; }
                    .lp-chip-wrap { grid-template-columns: 1fr; }
                    .lp-form-card { padding: 16px; border-radius: 16px; }
                }
            `}</style>

            <section className="lp-hero" style={{ padding: '32px 0 56px' }}>
                <div
                    className="lp-grafismo"
                    style={heroGrafismo ? { backgroundImage: `linear-gradient(120deg, rgba(30,25,23,.58), rgba(30,25,23,.74)), url(${heroGrafismo})` } : undefined}
                />

                <div className="lp-wrap" style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26, gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {(config?.landing_logo || config?.logo_sistema) ? (
                                <img src={config?.landing_logo || config?.logo_sistema} alt={empNome} style={{ height: 38, width: 'auto', objectFit: 'contain' }} />
                            ) : (
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--lp-acc)' }} />
                            )}
                            <div style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.82 }}>{heroSubtitulo}</div>
                        </div>
                        {waHref && (
                            <a href={waHref} target="_blank" rel="noreferrer" className="lp-btn-ghost">
                                <Phone size={15} /> {ctaSecundaria}
                            </a>
                        )}
                    </div>

                    <div className="lp-hero-grid">
                        <div style={{ animation: 'floatUp .55s ease-out both' }}>
                            <h1 className="lp-title" style={{ fontSize: 'clamp(36px, 6.2vw, 74px)', margin: '0 0 12px' }}>{heroTitulo}</h1>
                            <p style={{ margin: 0, maxWidth: 660, opacity: 0.88, lineHeight: 1.72 }}>{heroDescricao}</p>

                            <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <a href="#interesse" className="lp-btn-main">
                                    {ctaPrimaria} <ArrowRight size={16} />
                                </a>
                                {waHref && (
                                    <a href={waHref} target="_blank" rel="noreferrer" className="lp-btn-ghost">
                                        <Send size={15} /> {ctaSecundaria}
                                    </a>
                                )}
                            </div>

                            <div className="lp-chip-wrap">
                                <div className="lp-chip">
                                    Atendimento inicial
                                    <strong>em até 1 dia útil</strong>
                                </div>
                                <div className="lp-chip">
                                    Projeto completo
                                    <strong>do briefing à instalação</strong>
                                </div>
                                <div className="lp-chip">
                                    Marcenaria premium
                                    <strong>acabamento de alto padrão</strong>
                                </div>
                            </div>
                        </div>

                        <div id="interesse" style={{ animation: 'floatUp .7s ease-out both' }}>
                            <div className="lp-form-card">
                                {enviado ? (
                                    <div style={{ textAlign: 'center', padding: '18px 6px' }}>
                                        <div style={{ width: 62, height: 62, borderRadius: '50%', background: '#22C55E20', color: '#15803D', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}>
                                            <CheckCircle2 size={30} />
                                        </div>
                                        <h3 style={{ margin: '0 0 8px', fontSize: 24, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Contato enviado</h3>
                                        <p style={{ margin: 0, color: '#5B534F', lineHeight: 1.7 }}>Recebemos seu interesse e vamos retornar em breve para alinhar o projeto.</p>
                                        <button
                                            type="button"
                                            className="lp-btn-main"
                                            style={{ marginTop: 14 }}
                                            onClick={() => {
                                                setEnviado(false);
                                                setForm({ nome: '', telefone: '', email: '', tipo_projeto: '', faixa_investimento: '', possui_projeto: '', mensagem: '' });
                                            }}
                                        >
                                            Enviar outro contato
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <h3 style={{ margin: '0 0 4px', fontSize: 28, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{formTitulo}</h3>
                                        <p className="lp-small" style={{ margin: '0 0 14px' }}>{formDescricao}</p>

                                        <form onSubmit={enviar} style={{ display: 'grid', gap: 10 }}>
                                            <input
                                                className="lp-input"
                                                placeholder="Seu nome *"
                                                required
                                                value={form.nome}
                                                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                                            />
                                            <input
                                                className="lp-input"
                                                placeholder="WhatsApp para contato *"
                                                required
                                                value={form.telefone}
                                                onChange={e => setForm(f => ({ ...f, telefone: formatTel(e.target.value) }))}
                                            />
                                            <select
                                                className="lp-input"
                                                required
                                                value={form.tipo_projeto}
                                                onChange={e => setForm(f => ({ ...f, tipo_projeto: e.target.value }))}
                                            >
                                                <option value="">Qual ambiente deseja projetar? *</option>
                                                {TIPOS_PROJETO.map((t) => <option key={t} value={t}>{t}</option>)}
                                            </select>

                                            <select
                                                className="lp-input"
                                                required
                                                value={form.faixa_investimento}
                                                onChange={e => setForm(f => ({ ...f, faixa_investimento: e.target.value }))}
                                            >
                                                <option value="">Expectativa de investimento *</option>
                                                <option value="ate_10k">Até R$ 10.000</option>
                                                <option value="10k_25k">R$ 10.000 – R$ 25.000</option>
                                                <option value="25k_50k">R$ 25.000 – R$ 50.000</option>
                                                <option value="50k_100k">R$ 50.000 – R$ 100.000</option>
                                                <option value="acima_100k">Acima de R$ 100.000</option>
                                            </select>

                                            <select
                                                className="lp-input"
                                                value={form.possui_projeto}
                                                onChange={e => setForm(f => ({ ...f, possui_projeto: e.target.value }))}
                                            >
                                                <option value="">Você já possui projeto ou planta?</option>
                                                <option value="sim_projeto">Sim, tenho projeto</option>
                                                <option value="sim_planta">Sim, tenho planta</option>
                                                <option value="nao_preciso">Não, preciso de projeto</option>
                                                <option value="nao_sei">Ainda não sei</option>
                                            </select>

                                            <details className="lp-more">
                                                <summary>Adicionar mais detalhes (opcional)</summary>
                                                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                                                    <input
                                                        className="lp-input"
                                                        type="email"
                                                        placeholder="E-mail"
                                                        value={form.email}
                                                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                                    />
                                                    <textarea
                                                        className="lp-input"
                                                        rows={3}
                                                        placeholder="Mensagem"
                                                        value={form.mensagem}
                                                        onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))}
                                                    />
                                                </div>
                                            </details>

                                            {erro && (
                                                <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 11px' }}>
                                                    {erro}
                                                </div>
                                            )}

                                            <button
                                                type="submit"
                                                className="lp-btn-main"
                                                disabled={enviando}
                                                style={{
                                                    width: '100%',
                                                    justifyContent: 'center',
                                                    opacity: enviando ? 0.75 : 1,
                                                    transition: 'all 0.2s ease',
                                                    transform: 'scale(1)',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                {enviando ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
                                                {enviando ? 'Enviando...' : ctaPrimaria}
                                            </button>
                                        </form>

                                        <div className="lp-small" style={{ marginTop: 9 }}>Ao enviar, você autoriza contato da equipe Ornato sobre o seu projeto.</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lp-media-shell" style={{ animation: 'floatUp .85s ease-out both' }}>
                        <div className="lp-media-label">
                            <PlayCircle size={14} /> Vídeo institucional e bastidores
                        </div>
                        <div className="lp-media-frame">
                            {heroVideo?.type === 'youtube' ? (
                                <iframe
                                    title="Vídeo institucional Ornato"
                                    src={heroVideo.src}
                                    loading="lazy"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            ) : heroVideo?.type === 'direct' ? (
                                <video
                                    src={heroVideo.src}
                                    poster={heroPoster || undefined}
                                    controls
                                    autoPlay
                                    muted
                                    loop
                                    playsInline
                                    preload="metadata"
                                />
                            ) : heroImage ? (
                                <img src={heroImage} alt="Projeto em destaque" />
                            ) : (
                                <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--lp-soft)', opacity: 0.78 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <Sparkles size={24} style={{ margin: '0 auto 10px', color: 'var(--lp-acc)' }} />
                                        <strong>{empNome}</strong>
                                        <div style={{ fontSize: 12, marginTop: 6 }}>Configure vídeo, imagem e grafismo no painel.</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <section className="lp-sec" style={{ background: '#EEE4DE', paddingTop: 40, paddingBottom: 56 }}>
                <div className="lp-wrap">
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ color: paleta.destaque, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Prova social</div>
                        <h2 className="lp-title" style={{ fontSize: 'clamp(30px, 4.6vw, 48px)', margin: '7px 0 0' }}>{provaTitulo}</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
                        {provas.slice(0, 6).map((item, idx) => (
                            <article key={`${item.nome || 'cliente'}-${idx}`} className="lp-card" style={{ padding: 18 }}>
                                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: '#4F4641' }}>
                                    "{item.depoimento || 'Experiência excelente do início ao fim.'}"
                                </p>
                                <div style={{ marginTop: 12, borderTop: '1px solid #E3D7D1', paddingTop: 10 }}>
                                    <strong style={{ display: 'block', fontSize: 14 }}>{item.nome || 'Cliente Ornato'}</strong>
                                    <span style={{ fontSize: 12, color: '#7A706A' }}>{item.projeto || 'Projeto residencial'}</span>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* L4+L6: Stats animados com números reais */}
            {stats && (
                <section className="lp-sec" style={{ background: paleta.fundo, color: paleta.clara, paddingTop: 40, paddingBottom: 40 }} ref={statsRef}>
                    <div className="lp-wrap">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 20, textAlign: 'center' }}>
                            {stats.projetos > 0 && (
                                <div>
                                    <div style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, fontFamily: "'Cormorant Garamond', Georgia, serif", color: paleta.destaque }}>
                                        <AnimNum end={stats.projetos} suffix="+" />
                                    </div>
                                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Projetos Entregues</div>
                                </div>
                            )}
                            {stats.anos > 0 && (
                                <div>
                                    <div style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, fontFamily: "'Cormorant Garamond', Georgia, serif", color: paleta.destaque }}>
                                        <AnimNum end={stats.anos} />
                                    </div>
                                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Anos de Experiência</div>
                                </div>
                            )}
                            {stats.ambientes > 0 && (
                                <div>
                                    <div style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, fontFamily: "'Cormorant Garamond', Georgia, serif", color: paleta.destaque }}>
                                        <AnimNum end={stats.ambientes} suffix="+" />
                                    </div>
                                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Ambientes Projetados</div>
                                </div>
                            )}
                            {stats.clientes > 0 && (
                                <div>
                                    <div style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, fontFamily: "'Cormorant Garamond', Georgia, serif", color: paleta.destaque }}>
                                        <AnimNum end={stats.clientes} suffix="+" />
                                    </div>
                                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Clientes Atendidos</div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            <section className="lp-sec">
                <div className="lp-wrap">
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ color: paleta.destaque, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Nossos serviços</div>
                        <h2 className="lp-title" style={{ fontSize: 'clamp(30px, 4.8vw, 50px)', margin: '7px 0 0' }}>Marcenaria para ambientes com identidade</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
                        {servicos.map((item, idx) => {
                            const Icon = ICONS[idx % ICONS.length];
                            return (
                                <article key={`${item.titulo}-${idx}`} className="lp-card" style={{ padding: 18 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `${paleta.destaque}20`, color: paleta.destaque, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
                                        <Icon size={16} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: 18 }}>{item.titulo}</h3>
                                    <p style={{ margin: '8px 0 0', fontSize: 14, color: '#564E49', lineHeight: 1.7 }}>{item.descricao}</p>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="lp-sec" style={{ background: '#E9DFD9' }}>
                <div className="lp-wrap" style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 18 }}>
                    <div className="lp-card" style={{ padding: 20 }}>
                        <div style={{ color: paleta.destaque, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Diferenciais</div>
                        <h2 className="lp-title" style={{ margin: '8px 0 14px', fontSize: 'clamp(30px, 4.2vw, 42px)' }}>Sofisticação com execução precisa</h2>
                        <div style={{ display: 'grid', gap: 12 }}>
                            {diferenciais.map((item, idx) => (
                                <div key={`${item.titulo}-${idx}`} style={{ paddingBottom: 12, borderBottom: '1px solid #DBCFC8' }}>
                                    <strong>{item.titulo}</strong>
                                    <p style={{ margin: '6px 0 0', color: '#5C534F', lineHeight: 1.7, fontSize: 14 }}>{item.descricao}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="lp-card" style={{ padding: 20, background: '#1D1816', color: '#E7DCD6', borderColor: '#2D2622' }}>
                        <div style={{ color: paleta.destaque, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Como funciona</div>
                        <h2 className="lp-title" style={{ margin: '8px 0 14px', fontSize: 'clamp(30px, 4.2vw, 42px)' }}>Processo claro, resultado memorável</h2>
                        <div style={{ display: 'grid', gap: 11 }}>
                            {etapas.map((item, idx) => (
                                <div key={`${item.titulo}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 10 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${paleta.destaque}30`, color: paleta.clara, fontWeight: 700, display: 'grid', placeItems: 'center', fontSize: 12 }}>
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{item.titulo}</div>
                                        <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.65 }}>{item.descricao}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {portfolio.length > 0 && (
                <section className="lp-sec">
                    <div className="lp-wrap">
                        <div style={{ marginBottom: 22 }}>
                            <div style={{ color: paleta.destaque, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Portfólio</div>
                            <h2 className="lp-title" style={{ fontSize: 'clamp(30px, 4.8vw, 50px)', margin: '7px 0 0' }}>Projetos que traduzem presença e personalidade</h2>
                        </div>
                        <div className="lp-portfolio-list">
                            {portfolio.slice(0, 8).map((item, i) => (
                                <article key={item.id} className={`lp-portfolio-row${i % 2 !== 0 ? ' lp-row-reverse' : ''}`}>
                                    <div className="lp-portfolio-img-wrap">
                                        <img src={item.imagem} alt={item.titulo || 'Projeto'} className="lp-portfolio-img" loading="lazy" />
                                    </div>
                                    <div className="lp-portfolio-text">
                                        <h3 className="lp-portfolio-title">{item.titulo || 'Projeto Ornato'}</h3>
                                        {item.designer && <p style={{ margin: '7px 0 0', color: '#7A706A', fontSize: 13, fontWeight: 600 }}>Designer: {item.designer}</p>}
                                        {item.descricao && <p className="lp-portfolio-desc">{item.descricao}</p>}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <section className="lp-sec" style={{ paddingTop: 24 }}>
                <div className="lp-wrap">
                    <div className="lp-cta-band">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
                            <div>
                                <div style={{ color: paleta.destaque, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>Vamos conversar</div>
                                <h2 className="lp-title" style={{ margin: '4px 0 8px', fontSize: 'clamp(30px, 4.6vw, 50px)' }}>
                                    {config?.landing_cta_titulo || 'Vamos transformar seu ambiente?'}
                                </h2>
                                <p style={{ margin: 0, opacity: 0.88, lineHeight: 1.75, maxWidth: 760 }}>
                                    {config?.landing_cta_descricao || 'Fale com a Ornato e receba um plano inicial personalizado para seu projeto.'}
                                </p>

                                <div style={{ marginTop: 14, display: 'grid', gap: 7 }}>
                                    {config?.telefone && (
                                        <a href={`tel:${config.telefone}`} style={{ color: '#D9CCC5', textDecoration: 'none', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                            <Phone size={15} /> {config.telefone}
                                        </a>
                                    )}
                                    {config?.email && (
                                        <a href={`mailto:${config.email}`} style={{ color: '#D9CCC5', textDecoration: 'none', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                            <Mail size={15} /> {config.email}
                                        </a>
                                    )}
                                    {config?.cidade && (
                                        <span style={{ color: '#D9CCC5', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                            <MapPin size={15} /> {config.cidade}
                                        </span>
                                    )}
                                    {igHandle && (
                                        <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noreferrer" style={{ color: '#D9CCC5', textDecoration: 'none', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                            <Instagram size={15} /> @{igHandle}
                                        </a>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: 8 }}>
                                <a href="#interesse" className="lp-btn-main" style={{ justifyContent: 'center' }}>
                                    {ctaPrimaria} <ArrowRight size={16} />
                                </a>
                                {waHref && (
                                    <a href={waHref} target="_blank" rel="noreferrer" className="lp-btn-ghost" style={{ justifyContent: 'center' }}>
                                        <Phone size={15} /> {ctaSecundaria}
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <footer style={{ background: '#181311', color: '#C6B8B1', padding: '20px 0', marginTop: 20 }}>
                <div className="lp-wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
                    <span>{config?.landing_texto_rodape || `${empNome} © ${new Date().getFullYear()}`}</span>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        {igHandle && (
                            <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noreferrer" style={{ color: '#C6B8B1', display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                                <Instagram size={14} /> @{igHandle}
                            </a>
                        )}
                        {fbUrl && (
                            <a href={fbUrl.startsWith('http') ? fbUrl : `https://facebook.com/${fbUrl}`} target="_blank" rel="noreferrer" style={{ color: '#C6B8B1', textDecoration: 'none', fontSize: 12 }}>
                                Facebook
                            </a>
                        )}
                    </div>
                </div>
            </footer>

            {/* L2: WhatsApp floating button */}
            {waHref && (
                <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Falar no WhatsApp"
                    style={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
                        width: 56, height: 56, borderRadius: '50%',
                        background: '#25D366', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        transition: 'transform 0.2s',
                        cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <MessageCircle size={28} fill="#fff" />
                </a>
            )}
        </div>
    );
}
