import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowRight,
    Award,
    CheckCircle2,
    ChevronDown,
    Hammer,
    Instagram,
    Loader2,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Ruler,
    Sparkles,
    Star,
    Users,
    Zap,
} from 'lucide-react';
import { initClarity, setClarityTag } from '../utils/clarity';

// ═══════════════════════════════════════════════════════════════════════════════
// LandingPageV2 — Light Premium:
//   - Paleta clara (off-white + copper + grafite)
//   - Barra de diferenciais
//   - Portfolio com abas de categoria
//   - Depoimentos (marquee)
//   - Números de credibilidade no hero
//   - Popup lead capture (exit-intent + scroll 40%)
// Rotas: /contato, /landing, /landingpage, /lp2
// ═══════════════════════════════════════════════════════════════════════════════

const FAQ_DEFAULT = [
    { q: 'Qual o investimento médio em um projeto de marcenaria sob medida?', a: 'Projetos completos de alto padrão costumam partir de R$ 80 mil, variando conforme dimensões, materiais e complexidade. Fazemos uma avaliação gratuita do seu projeto sem nenhum compromisso.' },
    { q: 'Qual é o prazo de entrega?', a: 'Após a aprovação do projeto, a produção e instalação leva em média 45 a 90 dias dependendo do escopo. Você acompanha cada etapa em tempo real.' },
    { q: 'Vocês trabalham com arquitetos e designers de interiores?', a: 'Sim. Temos processo estruturado para parcerias com arquitetos e designers, incluindo suporte técnico no projeto e apresentação conjunta ao cliente.' },
    { q: 'Como funciona a aprovação antes da produção?', a: 'Você aprova o projeto completo em 3D — todas as medidas, acabamentos e ferragens — antes de qualquer peça ser cortada. Nenhuma produção começa sem a sua assinatura.' },
    { q: 'Vocês oferecem garantia?', a: 'Sim. Todos os projetos têm garantia contratual sobre estrutura, ferragens e instalação. Nossa equipe faz acompanhamento pós-entrega.' },
];

const ETAPAS_DEFAULT = [
    { titulo: 'Escuta e Briefing', descricao: 'Começamos entendendo sua rotina, seus gostos e o que você imagina para o espaço. Só depois disso iniciamos qualquer projeto — porque ambiente bom começa com escuta de verdade.' },
    { titulo: 'Projeto em 3D', descricao: 'Você vê cada detalhe do seu ambiente antes de qualquer peça ser cortada. Aprovação item por item, medida por medida. Nenhuma produção começa sem a sua assinatura.' },
    { titulo: 'Produção Própria', descricao: 'Fábrica própria com CNC nesting, coladeira de borda industrial e controle de qualidade em cada etapa. O projeto sai exatamente como foi aprovado — sem improvisos.' },
    { titulo: 'Instalação Especializada', descricao: 'Equipe própria realiza a montagem com acabamento preciso e total cuidado com o seu imóvel. Limpeza completa ao final. Nada fica pela metade.' },
    { titulo: 'Entrega e Garantia', descricao: 'Entregamos com documentação, garantia contratual e suporte pós-entrega. Nossa relação não termina na instalação — termina quando você está satisfeito.' },
];

const PORTFOLIO_PLACEHOLDER = [
    { id: 'ph1', titulo: 'Cozinha Planejada', categoria: 'Cozinhas', descricao: 'Design funcional com acabamento premium', imagem: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop&q=80' },
    { id: 'ph2', titulo: 'Closet Sob Medida', categoria: 'Closets', descricao: 'Organização e elegância em cada detalhe', imagem: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&h=400&fit=crop&q=80' },
    { id: 'ph3', titulo: 'Home Office', categoria: 'Home Office', descricao: 'Espaço de trabalho planejado para produtividade', imagem: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&h=400&fit=crop&q=80' },
    { id: 'ph4', titulo: 'Sala de Estar', categoria: 'Salas', descricao: 'Ambiente acolhedor com marcenaria de alto padrão', imagem: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600&h=400&fit=crop&q=80' },
    { id: 'ph5', titulo: 'Área Gourmet', categoria: 'Gourmet', descricao: 'Espaço perfeito para receber com sofisticação', imagem: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&h=400&fit=crop&q=80' },
    { id: 'ph6', titulo: 'Banheiro Planejado', categoria: 'Outros', descricao: 'Funcionalidade e design em harmonia', imagem: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=600&h=400&fit=crop&q=80' },
];

const CATEGORIAS = ['Todos', 'Cozinhas', 'Closets', 'Home Office', 'Salas', 'Gourmet'];

const CATEGORIA_KEYWORDS = {
    'Cozinhas':    ['cozinha'],
    'Closets':     ['closet', 'quarto', 'dormitório', 'vestidor', 'armário'],
    'Home Office': ['office', 'escritório', 'trabalho', 'home office'],
    'Salas':       ['sala', 'living', 'painel', 'tv', 'home theater'],
    'Gourmet':     ['gourmet', 'varanda', 'churrasqueira', 'área externa'],
};

function getCategoria(item) {
    if (item.categoria) return item.categoria;
    const text = `${item.titulo || ''} ${item.descricao || ''}`.toLowerCase();
    for (const [cat, kws] of Object.entries(CATEGORIA_KEYWORDS)) {
        if (kws.some(kw => text.includes(kw))) return cat;
    }
    return 'Outros';
}

const DIFERENCIAIS_DEFAULT = [
    { titulo: 'Projeto sob medida',      desc: 'Cada detalhe planejado para o seu espaço e rotina',       icon: 'ruler'  },
    { titulo: 'Acabamento impecável',    desc: 'Materiais selecionados com exigência de alto padrão',     icon: 'award'  },
    { titulo: 'Atendimento consultivo',  desc: 'Do briefing à entrega, você decide cada passo',           icon: 'users'  },
    { titulo: 'Instalação especializada', desc: 'Equipe própria com precisão e cuidado total',            icon: 'hammer' },
];

function DiferencialIcon({ type, acc }) {
    const style = { color: acc, flexShrink: 0 };
    if (type === 'ruler')  return <Ruler size={26} style={style} />;
    if (type === 'award')  return <Award size={26} style={style} />;
    if (type === 'users')  return <Users size={26} style={style} />;
    if (type === 'hammer') return <Hammer size={26} style={style} />;
    return <Star size={26} style={style} />;
}

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
export default function LandingPageV2() {
    const [config, setConfig]               = useState(null);
    const [portfolio, setPortfolio]         = useState([]);
    const [form, setForm]                   = useState({ nome: '', telefone: '', ambiente: '' });
    const [stats, setStats]                 = useState(null);
    const [enviando, setEnviando]           = useState(false);
    const [enviado, setEnviado]             = useState(false);
    const [erro, setErro]                   = useState('');
    const [faqOpen, setFaqOpen]             = useState(-1);
    const [statsVisible, setStatsVisible]   = useState(false);
    const [heroStatsVisible, setHeroStatsVisible] = useState(false);
    const [categoriaAtiva, setCategoriaAtiva] = useState('Todos');
    const [showStickyWA, setShowStickyWA]     = useState(false);
    const [popupOpen, setPopupOpen]           = useState(false);
    const [popupShown, setPopupShown]         = useState(false);
    const [popupForm, setPopupForm]           = useState({ nome: '', telefone: '' });
    const [popupEnviando, setPopupEnviando]   = useState(false);

    const statsRef           = useRef(null);
    const timelineRef        = useRef(null);
    const timelineProgressRef = useRef(null);
    const timelineLineRef    = useRef(null);

    useEffect(() => {
        initClarity(config?.clarity_project_id);
        setClarityTag('page', 'landing_v2');
    }, [config?.clarity_project_id]);

    useEffect(() => {
        fetch('/api/landing/config')
            .then(r => r.json())
            .then(cfg => {
                setConfig(cfg);
                const title = cfg?.landing_titulo
                    ? `${cfg.nome || 'Ornato'} — ${cfg.landing_titulo.slice(0, 60)}`
                    : `${cfg?.nome || 'Ornato'} — Marcenaria sob medida`;
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

    useEffect(() => {
        if (!statsRef.current) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
        obs.observe(statsRef.current);
        return () => obs.disconnect();
    }, [config]);

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

    useEffect(() => {
        if (!config) return;
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (entry.target.classList.contains('lp-projects-grid')) {
                        const cards = entry.target.querySelectorAll('.lp-project-card');
                        cards.forEach((card, i) => setTimeout(() => card.classList.add('active'), i * 150));
                    } else {
                        entry.target.classList.add('active');
                    }
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
        document.querySelectorAll('.lp-reveal').forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, [config, portfolio, categoriaAtiva]);

    useEffect(() => {
        const id = config?.fb_pixel_id;
        if (!id || window.fbq) return;
        /* eslint-disable */
        (function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */
        window.fbq('init', id);
        window.fbq('track', 'PageView');
    }, [config?.fb_pixel_id]);

    useEffect(() => {
        const id = config?.google_ads_id;
        if (!id) return;
        if (document.querySelector(`script[src*="${id}"]`)) return;
        const s = document.createElement('script');
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function(){ window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', id);
    }, [config?.google_ads_id]);

    useEffect(() => {
        if (!config) return;
        const schema = {
            '@context': 'https://schema.org', '@type': 'LocalBusiness',
            name: config.nome || 'Marcenaria',
            description: config.landing_descricao || 'Marcenaria sob medida de alto padrão',
            telephone: config.telefone || undefined,
            email: config.email || undefined,
            address: config.endereco ? {
                '@type': 'PostalAddress', streetAddress: config.endereco,
                addressLocality: config.cidade || '', addressCountry: 'BR',
            } : undefined,
            url: window.location.origin,
            image: config.landing_hero_imagem || config.logo_sistema || undefined,
            sameAs: [
                config.instagram ? `https://instagram.com/${config.instagram.replace(/^@/, '')}` : null,
                config.facebook || null,
            ].filter(Boolean),
        };
        const tag = document.createElement('script');
        tag.id = 'lp-v2-jsonld';
        tag.type = 'application/ld+json';
        tag.textContent = JSON.stringify(JSON.parse(JSON.stringify(schema)));
        document.head.appendChild(tag);
        return () => document.getElementById('lp-v2-jsonld')?.remove();
    }, [config]);

    useEffect(() => {
        if (!config) return;
        const section = document.getElementById('orcamento');
        if (!section) return;
        const obs = new IntersectionObserver(
            ([e]) => setShowStickyWA(!e.isIntersecting),
            { threshold: 0 }
        );
        obs.observe(section);
        return () => obs.disconnect();
    }, [config]);

    // Hero stats animation trigger
    useEffect(() => {
        if (!config) return;
        const t = setTimeout(() => setHeroStatsVisible(true), 400);
        return () => clearTimeout(t);
    }, [config]);

    // Lead popup: exit-intent (desktop) + scroll 40% (mobile/all)
    useEffect(() => {
        if (!config || popupShown) return;
        if (sessionStorage.getItem('lp_popup_seen') === '1') { setPopupShown(true); return; }

        let armed = false;
        const armTimer = setTimeout(() => { armed = true; }, 8000);

        const openPopup = (reason) => {
            if (!armed || popupShown) return;
            setPopupOpen(true);
            setPopupShown(true);
            sessionStorage.setItem('lp_popup_seen', '1');
            try { if (window.fbq) window.fbq('trackCustom', 'LeadPopupOpen', { reason }); } catch (_) {}
        };

        const onMouseOut = (e) => {
            if (e.clientY <= 0 && !e.relatedTarget) openPopup('exit_intent');
        };
        const onScroll = () => {
            const pct = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
            if (pct > 0.4) openPopup('scroll_40');
        };

        document.addEventListener('mouseout', onMouseOut);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            clearTimeout(armTimer);
            document.removeEventListener('mouseout', onMouseOut);
            window.removeEventListener('scroll', onScroll);
        };
    }, [config, popupShown]);

    const cnt1 = useCountUp(stats?.projetos || 0, 2000, statsVisible);
    const cnt2 = useCountUp(stats?.anos || 0, 1500, statsVisible);
    const cnt3 = useCountUp(stats?.ambientes || 0, 1800, statsVisible);
    const cnt4 = useCountUp(stats?.clientes || 0, 1600, statsVisible);
    const heroCnt1 = useCountUp(stats?.projetos || 0, 1800, heroStatsVisible);
    const heroCnt2 = useCountUp(stats?.anos || 0, 1400, heroStatsVisible);

    const utm = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return { utm_source: params.get('utm_source') || '', utm_medium: params.get('utm_medium') || '', utm_campaign: params.get('utm_campaign') || '' };
    }, []);

    const depoimentos = config ? parseJsonList(config?.landing_provas_json, [
        { nome: 'Daniela Ferreira', projeto: 'Cozinha + Área Gourmet', depoimento: 'Investir alto em marcenaria parecia arriscado. Mas quando vi o resultado — e a cara dos meus amigos na primeira visita — entendi que valeu cada centavo. Voltaria a contratar sem pensar duas vezes.', estrelas: 5 },
        { nome: 'Ricardo Abreu',    projeto: 'Closet e Home Office',    depoimento: 'Já tive experiências ruins antes — atraso, acabamento fraco, peça errada. Aqui foi completamente diferente: prazo cumprido, projeto idêntico ao 3D aprovado, e qualidade de material que não encontrei em nenhum outro lugar.', estrelas: 5 },
        { nome: 'Fernanda e Carlos Mota', projeto: 'Reforma Completa — 4 ambientes', depoimento: 'Contratamos para quatro ambientes de uma vez. Foi um processo longo, mas muito tranquilo — sempre soubemos o que estava acontecendo. Entregaram exatamente o que foi prometido, sem surpresas.', estrelas: 5 },
    ]) : [];
    const marqueeDepoimentos = [...depoimentos, ...depoimentos];

    if (!config) {
        return (
            <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#FAF7F2' }}>
                <Loader2 size={30} style={{ color: '#B7654A', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (Number(config?.landing_ativo) === 0) {
        return (
            <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#FAF7F2', color: '#1A1614', padding: 24 }}>
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: 36, margin: 0, fontFamily: "'Oswald', sans-serif", fontWeight: 200 }}>{config?.nome || 'Ornato'}</h1>
                    <p style={{ marginTop: 10, opacity: 0.5 }}>Nossa página está em atualização.</p>
                </div>
            </div>
        );
    }

    const acc    = config?.landing_cor_destaque || '#B7654A';
    const empNome   = config?.nome || 'Ornato';
    const heroTitulo = config?.landing_titulo || 'Cada projeto conta uma história. A sua vai ser inesquecível.';
    const heroDesc   = config?.landing_descricao || 'Projetamos, produzimos e instalamos ambientes sob medida com precisão e materiais selecionados. Do primeiro rascunho à entrega final, você acompanha cada decisão.';
    const heroImage  = config?.landing_hero_imagem || '';
    const heroVideo  = getHeroVideoSource(config?.landing_hero_video_url);
    const heroPoster = config?.landing_hero_video_poster || heroImage;

    const telLimpo = (config?.telefone || '').replace(/\D/g, '');
    const waNum    = telLimpo ? (telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`) : '';
    const waHref   = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent('Olá! Gostaria de saber mais sobre projetos de marcenaria sob medida.')}` : '';
    const igHandle = config?.instagram?.replace(/^@/, '') || '';

    const etapas  = parseJsonList(config?.landing_etapas_json, ETAPAS_DEFAULT);
    const faqList = parseJsonList(config?.landing_faq_json, FAQ_DEFAULT);

    const allItems = portfolio.length >= 6
        ? portfolio
        : [...portfolio, ...PORTFOLIO_PLACEHOLDER.slice(0, 6 - portfolio.length)];

    const portfolioFiltrado = categoriaAtiva === 'Todos'
        ? allItems.slice(0, 6)
        : allItems.filter(item => getCategoria(item) === categoriaAtiva).slice(0, 9);

    const categoriasVisiveis = CATEGORIAS.filter(cat => {
        if (cat === 'Todos') return true;
        return allItems.some(item => getCategoria(item) === cat);
    });

    const formatTel = (v) => {
        const nums = v.replace(/\D/g, '').slice(0, 11);
        if (nums.length <= 2) return `(${nums}`;
        if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
        return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
    };

    const buildWaMsg = () => {
        const nome = form.nome.trim();
        const amb  = form.ambiente;
        const partes = [`Olá, ${empNome}! Vim pelo site.`];
        if (nome) partes.push(`Meu nome é *${nome}*.`);
        if (amb) partes.push(`Gostaria de um orçamento de *${amb}* sob medida.`);
        else partes.push('Gostaria de um orçamento de marcenaria sob medida.');
        return partes.join(' ');
    };
    const waHrefPersonalizado = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(buildWaMsg())}` : '';

    const enviar = async (e) => {
        e.preventDefault();
        if (!form.nome.trim() || !form.telefone.trim()) { setErro('Preencha nome e WhatsApp.'); return; }
        if (!waHrefPersonalizado) { setErro('WhatsApp indisponível no momento.'); return; }
        setEnviando(true); setErro('');
        fetch('/api/landing/captura', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...form,
                ambiente: form.ambiente || '',
                tipo_projeto: form.ambiente || '',
                mensagem: '', faixa_investimento: '', possui_projeto: '', email: '',
                origem: 'landing_v2', ...utm,
            }),
        }).catch(() => {});
        try { if (window.fbq) window.fbq('track', 'Lead', { content_category: form.ambiente || 'marcenaria' }); } catch (_) {}
        try { if (window.gtag && config?.google_ads_id) window.gtag('event', 'conversion', { send_to: config.google_ads_id }); } catch (_) {}
        setTimeout(() => {
            window.open(waHrefPersonalizado, '_blank', 'noopener,noreferrer');
            setEnviado(true);
            setEnviando(false);
        }, 400);
    };

    return (
        <div className="lp">
            <style>{buildCSS(acc)}</style>

            {/* ═══ HERO ═══ */}
            <header className="lp-hero">
                <div className="lp-aura-wrap">
                    <div className="lp-aura lp-aura-1" style={{ background: `radial-gradient(circle, ${acc} 0%, transparent 70%)` }} />
                    <div className="lp-aura lp-aura-2" style={{ background: `radial-gradient(circle, ${acc}55 0%, transparent 70%)` }} />
                    <div className="lp-aura lp-aura-3" style={{ background: `radial-gradient(circle, ${acc}88 0%, transparent 70%)` }} />
                </div>

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
                        <a href="#diferenciais">Diferenciais</a>
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
                                            {part.trim().split(' ').slice(0, -1).join(' ')}{' '}
                                            <span className="lp-hl">{part.trim().split(' ').pop()}</span>.
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

                            {/* Números de credibilidade no hero */}
                            {stats && (stats.projetos > 0 || stats.anos > 0 || stats.clientes > 0) && (
                                <div className="lp-hero-stats lp-animate-fade-up lp-delay-3">
                                    {stats.projetos > 0 && (
                                        <div className="lp-hero-stat">
                                            <span className="lp-hero-stat-num">{heroCnt1}+</span>
                                            <span className="lp-hero-stat-label">Projetos entregues</span>
                                        </div>
                                    )}
                                    {stats.anos > 0 && (
                                        <div className="lp-hero-stat">
                                            <span className="lp-hero-stat-num">{heroCnt2}</span>
                                            <span className="lp-hero-stat-label">Anos de mercado</span>
                                        </div>
                                    )}
                                    <div className="lp-hero-stat">
                                        <span className="lp-hero-stat-num">100%</span>
                                        <span className="lp-hero-stat-label">Satisfação</span>
                                    </div>
                                </div>
                            )}
                        </div>

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

            {/* ═══ BARRA DE DIFERENCIAIS ═══ */}
            <section className="lp-diferenciais-bar" id="diferenciais">
                <div className="lp-container">
                    <div className="lp-diferenciais-grid">
                        {DIFERENCIAIS_DEFAULT.map((d, i) => (
                            <div key={i} className="lp-diferencial-item lp-reveal">
                                <div className="lp-diferencial-icon-wrap">
                                    <DiferencialIcon type={d.icon} acc={acc} />
                                </div>
                                <div className="lp-diferencial-text">
                                    <span className="lp-diferencial-titulo">{d.titulo}</span>
                                    <span className="lp-diferencial-desc">{d.desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══ TRUST BAR ═══ */}
            {stats && (stats.projetos > 0 || stats.anos > 0) && (
                <section className="lp-stats-bar" ref={statsRef}>
                    <div className="lp-container lp-stats-grid">
                        {stats.projetos > 0 && <div className="lp-stat-item"><span className="lp-stat-num">{cnt1}+</span><span className="lp-stat-label">Projetos Entregues</span></div>}
                        {stats.anos > 0 && <div className="lp-stat-item"><span className="lp-stat-num">{cnt2}</span><span className="lp-stat-label">Anos de Experiência</span></div>}
                        {stats.ambientes > 0 && <div className="lp-stat-item"><span className="lp-stat-num">{cnt3}+</span><span className="lp-stat-label">Ambientes Projetados</span></div>}
                        {stats.clientes > 0 && <div className="lp-stat-item"><span className="lp-stat-num">{cnt4}+</span><span className="lp-stat-label">Clientes Atendidos</span></div>}
                    </div>
                </section>
            )}

            {/* ═══ TIMELINE ═══ */}
            <section className="lp-timeline-sec" id="processo">
                <div className="lp-section-bg" />
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

            {/* ═══ PORTFOLIO COM CATEGORIAS ═══ */}
            <section className="lp-portfolio-sec" id="portfolio">
                <div className="lp-proj-bg" />
                <div className="lp-portfolio-container">
                    <h2 className="lp-headline" style={{ textAlign: 'center', marginBottom: '2.5rem', marginInline: 'auto' }}>
                        Projetos que já <span className="lp-hl">executamos</span>
                    </h2>

                    {categoriasVisiveis.length > 1 && (
                        <div className="lp-portfolio-tabs">
                            {categoriasVisiveis.map(cat => (
                                <button
                                    key={cat}
                                    className={`lp-tab-btn${categoriaAtiva === cat ? ' active' : ''}`}
                                    onClick={() => setCategoriaAtiva(cat)}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="lp-projects-grid lp-reveal" key={categoriaAtiva}>
                        {portfolioFiltrado.length > 0 ? (
                            portfolioFiltrado.map((item, i) => (
                                <div key={item.id || i} className={`lp-project-card${i === 0 ? ' featured' : ''}`}>
                                    <div className="lp-project-img-wrap">
                                        <img src={item.imagem} alt={item.titulo || 'Projeto'} loading="lazy" />
                                    </div>
                                    <div className="lp-project-info">
                                        <h3 className="lp-project-title">{item.titulo || 'Projeto'}</h3>
                                        {item.descricao && <p className="lp-project-desc">{item.descricao}</p>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="lp-portfolio-empty">
                                <p>Em breve projetos nessa categoria.</p>
                            </div>
                        )}
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

            {/* ═══ DEPOIMENTOS ═══ */}
            {depoimentos.length > 0 && (
                <section className="lp-testimonials-sec">
                    <h2 className="lp-headline" style={{ textAlign: 'center', marginBottom: '4rem', marginInline: 'auto', padding: '0 24px' }}>
                        O que quem já investiu tem a <span className="lp-hl">dizer</span>
                    </h2>
                    <div className="lp-marquee-container">
                        <div className="lp-marquee-content">
                            {marqueeDepoimentos.map((dep, idx) => (
                                <div key={idx} className="lp-testimonial-card">
                                    <div className="lp-quote-icon">"</div>
                                    {dep.estrelas > 0 && (
                                        <div className="lp-stars">
                                            {Array.from({ length: dep.estrelas || 5 }).map((_, si) => (
                                                <Star key={si} size={14} fill={acc} color={acc} />
                                            ))}
                                        </div>
                                    )}
                                    <p className="lp-testimonial-text">{dep.depoimento}</p>
                                    <div className="lp-testimonial-author">
                                        <div className="lp-author-avatar" style={{ background: `${acc}18`, color: acc }}>
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

            {/* ═══ FORMULÁRIO + FAQ ═══ */}
            <section className="lp-form-section" id="orcamento">
                <div className="lp-section-bg" />
                <div className="lp-container" style={{ position: 'relative', zIndex: 10 }}>
                    <div className="lp-reveal" style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
                        <h2 className="lp-headline" style={{ marginInline: 'auto' }}>
                            Começar é <span className="lp-hl">rápido.</span>
                        </h2>
                        <p className="lp-subheadline" style={{ maxWidth: 560, margin: '1.25rem auto 0', textAlign: 'center' }}>
                            Deixe seu contato e caia no WhatsApp em 1 clique. Nossa equipe responde em segundos e já adianta o briefing antes da visita.
                        </p>
                    </div>

                    <div className="lp-form-grid">
                        <div className="lp-form-card-glass lp-reveal">
                            {enviado ? (
                                <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                                    <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(37,211,102,0.15)', color: '#25D366', display: 'grid', placeItems: 'center', margin: '0 auto 18px', border: '2px solid rgba(37,211,102,0.3)' }}>
                                        <CheckCircle2 size={34} />
                                    </div>
                                    <h3 style={{ margin: '0 0 10px', fontSize: 24, fontFamily: "'Oswald', sans-serif", fontWeight: 300, color: '#1A1614', letterSpacing: '-0.02em' }}>
                                        Abrindo o WhatsApp…
                                    </h3>
                                    <p style={{ margin: 0, color: 'rgba(26,22,20,0.65)', lineHeight: 1.7, fontSize: 14 }}>
                                        Se não abriu automaticamente, <a href={waHrefPersonalizado} target="_blank" rel="noreferrer" style={{ color: '#25D366', textDecoration: 'underline' }}>clique aqui</a>.
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={enviar} className="lp-form-inner">
                                    <div className="lp-form-badge">
                                        <Zap size={14} /> Atendimento online · responde em segundos
                                    </div>
                                    <h3 className="lp-form-title">
                                        Deixe só 2 dados — <span className="lp-hl">a gente cuida do resto.</span>
                                    </h3>
                                    <p className="lp-form-sub">
                                        Sem formulário comprido. Converse direto no WhatsApp — é onde tudo acontece.
                                    </p>
                                    <input className="lp-dark-input lp-input-lg" placeholder="Seu nome *" required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                                    <input className="lp-dark-input lp-input-lg" placeholder="WhatsApp (com DDD) *" required inputMode="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: formatTel(e.target.value) }))} />
                                    <select className="lp-dark-input lp-input-lg lp-select" value={form.ambiente} onChange={e => setForm(f => ({ ...f, ambiente: e.target.value }))}>
                                        <option value="">Qual ambiente? (opcional)</option>
                                        <option>Cozinha</option>
                                        <option>Closet / Dormitório</option>
                                        <option>Home Office</option>
                                        <option>Sala de Estar</option>
                                        <option>Área Gourmet</option>
                                        <option>Banheiro</option>
                                        <option>Múltiplos Ambientes</option>
                                    </select>
                                    {erro && <div className="lp-form-erro">{erro}</div>}
                                    {waNum ? (
                                        <button type="submit" className="lp-btn-wa-hero" disabled={enviando}>
                                            {enviando ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : (
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M5.337 21.672L.4 24l2.433-5.15A11.934 11.934 0 0 1 .001 12C.001 5.374 5.374 0 12 0s12 5.373 12 12c0 6.628-5.373 12-12 12a11.96 11.96 0 0 1-6.663-2.328z"/></svg>
                                            )}
                                            {enviando ? 'Abrindo…' : 'Conversar no WhatsApp agora'}
                                        </button>
                                    ) : (
                                        <button type="submit" className="lp-btn-wa-hero" disabled={enviando} style={{ background: `linear-gradient(135deg, ${acc}, ${acc}cc)`, animation: 'none', boxShadow: `0 6px 24px ${acc}50` }}>
                                            {enviando ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={18} />}
                                            {enviando ? 'Enviando…' : 'Quero falar com a equipe'}
                                        </button>
                                    )}
                                    <div className="lp-form-trust">
                                        <span><CheckCircle2 size={12} /> 100% gratuito</span>
                                        <span><CheckCircle2 size={12} /> Atendimento humano</span>
                                        <span><CheckCircle2 size={12} /> Seus dados protegidos</span>
                                    </div>
                                </form>
                            )}
                        </div>

                        {/* FAQ */}
                        <div className="lp-faq-side lp-reveal">
                            <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: '1.4rem', fontWeight: 300, color: '#1A1614', marginBottom: 24, letterSpacing: '-0.02em' }}>Dúvidas frequentes</h3>
                            <div className="lp-faq-list">
                                {faqList.map((item, idx) => (
                                    <div key={idx} className={`lp-faq-item${faqOpen === idx ? ' open' : ''}`}>
                                        <button className="lp-faq-q" onClick={() => setFaqOpen(faqOpen === idx ? -1 : idx)}>
                                            <span>{item.q}</span>
                                            <ChevronDown size={16} className="lp-faq-chevron" />
                                        </button>
                                        <div className="lp-faq-a" style={{ maxHeight: faqOpen === idx ? 220 : 0 }}>
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
                            Pronto para transformar seu espaço em algo <span className="lp-hl">único?</span>
                        </h2>
                        <p className="lp-cta-subtitle">
                            Fale com nossa equipe e receba uma avaliação gratuita do seu projeto. Sem compromisso, sem pressão.
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
                        <div className="lp-footer-contacts">
                            {config?.telefone && <a href={`tel:${config.telefone}`}><Phone size={14} /> {config.telefone}</a>}
                            {config?.email && <a href={`mailto:${config.email}`}><Mail size={14} /> {config.email}</a>}
                            {config?.cidade && <span><MapPin size={14} /> {config.cidade}</span>}
                            {igHandle && <a href={`https://instagram.com/${igHandle}`} target="_blank" rel="noreferrer"><Instagram size={14} /> @{igHandle}</a>}
                        </div>
                    </div>
                </div>
            </section>

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

            {waHref && (
                <a href={waHref} target="_blank" rel="noreferrer"
                   className={`lp-wa-float${showStickyWA ? ' lp-wa-float-hidden-mobile' : ''}`}
                   aria-label="WhatsApp">
                    <MessageCircle size={28} fill="#fff" />
                </a>
            )}

            {/* ═══ LEAD POPUP ═══ */}
            {popupOpen && (
                <div className="lp-popup-backdrop" onClick={() => setPopupOpen(false)}>
                    <div className="lp-popup-card" onClick={e => e.stopPropagation()}>
                        <button className="lp-popup-close" onClick={() => setPopupOpen(false)} aria-label="Fechar">×</button>
                        <div className="lp-popup-badge"><Sparkles size={13} /> Oferta do site</div>
                        <h3 className="lp-popup-title">Antes de você ir…</h3>
                        <p className="lp-popup-sub">
                            Deixe seu contato e receba um <b>pré-briefing gratuito</b> com ideias para o seu ambiente — em até 1 dia útil.
                        </p>
                        <form
                            className="lp-popup-form"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (!popupForm.nome.trim() || !popupForm.telefone.trim()) return;
                                setPopupEnviando(true);
                                fetch('/api/landing/captura', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        nome: popupForm.nome, telefone: popupForm.telefone, ambiente: '',
                                        tipo_projeto: '', mensagem: 'Via popup de saída', faixa_investimento: '',
                                        possui_projeto: '', email: '', origem: 'landing_v2_popup', ...utm,
                                    }),
                                }).catch(() => {});
                                try { if (window.fbq) window.fbq('track', 'Lead', { content_category: 'popup' }); } catch (_) {}
                                try { if (window.gtag && config?.google_ads_id) window.gtag('event', 'conversion', { send_to: config.google_ads_id }); } catch (_) {}
                                setTimeout(() => {
                                    const nome = popupForm.nome.trim();
                                    const msg = `Olá, ${empNome}! Vim pelo site. Meu nome é *${nome}*. Quero meu pré-briefing gratuito.`;
                                    if (waNum) window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                                    setPopupOpen(false);
                                    setPopupEnviando(false);
                                }, 300);
                            }}
                        >
                            <input className="lp-popup-input" placeholder="Seu nome" required value={popupForm.nome} onChange={e => setPopupForm(f => ({ ...f, nome: e.target.value }))} />
                            <input className="lp-popup-input" placeholder="WhatsApp com DDD" required inputMode="tel" value={popupForm.telefone} onChange={e => setPopupForm(f => ({ ...f, telefone: formatTel(e.target.value) }))} />
                            <button type="submit" className="lp-popup-btn" disabled={popupEnviando}>
                                {popupEnviando ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
                                {popupEnviando ? 'Enviando…' : 'Quero meu pré-briefing'}
                            </button>
                            <div className="lp-popup-trust">
                                <CheckCircle2 size={11} /> 100% gratuito · Sem compromisso
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {waHref && showStickyWA && (
                <div className="lp-sticky-wa-bar">
                    <a href={waHref} target="_blank" rel="noreferrer" className="lp-sticky-wa-btn">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M5.337 21.672L.4 24l2.433-5.15A11.934 11.934 0 0 1 .001 12C.001 5.374 5.374 0 12 0s12 5.373 12 12c0 6.628-5.373 12-12 12a11.96 11.96 0 0 1-6.663-2.328z"/>
                        </svg>
                        Falar no WhatsApp agora
                    </a>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSS — Light Premium (off-white + copper + grafite)
// ═══════════════════════════════════════════════════════════════════════════════
function buildCSS(acc) {
    return `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Oswald:wght@200;300;400;500;600&display=swap');

.lp { margin:0; padding:0; font-family:'Geist',system-ui,sans-serif; overflow-x:hidden; -webkit-font-smoothing:antialiased; color:#1A1614; background:#FAF7F2; line-height:1.6; }
.lp *, .lp *::before, .lp *::after { box-sizing:border-box; margin:0; padding:0; }
.lp-container { max-width:1400px; margin:0 auto; padding:0 4rem; }

@keyframes fadeInUp { 0% { opacity:0; transform:translateY(20px); } 100% { opacity:1; transform:translateY(0); } }
@keyframes blurIn { 0% { opacity:0; filter:blur(20px); transform:scale(0.98); } 100% { opacity:1; filter:blur(0); transform:scale(1); } }
@keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-15px); } }
@keyframes spin { to { transform:rotate(360deg); } }
@keyframes marqueeScroll { 0% { transform:translateX(0); } 100% { transform:translateX(calc(-50% - 1.5rem)); } }
@keyframes liquidMove1 { 0% { transform:translate(0,0) scale(1) rotate(0deg); } 100% { transform:translate(-10%,20%) scale(1.1) rotate(10deg); } }
@keyframes liquidMove2 { 0% { transform:translate(0,0) scale(1.05); } 100% { transform:translate(15%,-15%) scale(1); } }
@keyframes liquidMove3 { 0% { transform:translate(0,0) rotate(0deg); } 100% { transform:translate(-15%,-10%) rotate(20deg); } }
@keyframes lpPulse { 0%,100%{box-shadow:0 0 0 0 rgba(37,211,102,0.4)} 70%{box-shadow:0 0 0 14px rgba(37,211,102,0)} }
@keyframes tabFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes popupIn { from { opacity:0; transform:scale(0.94) translateY(20px); } to { opacity:1; transform:scale(1) translateY(0); } }

.lp-animate-fade-up { animation:fadeInUp 0.8s cubic-bezier(0.16,1,0.3,1) both; }
.lp-animate-blur-in { animation:blurIn 1.2s cubic-bezier(0.16,1,0.3,1) both; }
.lp-animate-float   { animation:float 6s ease-in-out infinite; }
.lp-delay-1 { animation-delay:100ms; }
.lp-delay-2 { animation-delay:200ms; }
.lp-delay-3 { animation-delay:300ms; }

.lp-reveal { opacity:0; transform:translateY(40px); transition:all 1s cubic-bezier(0.16,1,0.3,1); }
.lp-reveal.active { opacity:1; transform:translateY(0); }

/* ── AURA SYSTEM (suave no claro) ── */
.lp-aura-wrap { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; background:#FAF7F2; }
.lp-aura-wrap .lp-aura { position:absolute; width:75vw; height:75vw; border-radius:50%; filter:blur(160px); opacity:0.18; will-change:transform; }
.lp-aura-1 { top:-15%; right:-10%; animation:liquidMove1 30s infinite alternate ease-in-out; }
.lp-aura-2 { bottom:-15%; left:-10%; animation:liquidMove2 35s infinite alternate ease-in-out; opacity:0.12 !important; }
.lp-aura-3 { top:35%; left:25%; width:45vw !important; height:45vw !important; animation:liquidMove3 25s infinite alternate-reverse ease-in-out; opacity:0.10 !important; }

.lp-hero-media-wrap { position:absolute; inset:0; z-index:0; }
.lp-hero-media-wrap::after { content:''; position:absolute; inset:0; background:rgba(250,247,242,0.85); z-index:1; }
.lp-hero-media { width:100%; height:100%; object-fit:cover; position:absolute; inset:0; }

/* ── GLASS NAV ── */
.lp-glass-nav { position:fixed; top:2rem; left:0; right:0; margin:0 auto; width:min(95%,1200px); background:rgba(255,255,255,0.8); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border:1px solid rgba(26,22,20,0.06); border-radius:9999px; padding:0.6rem 0.8rem 0.6rem 2.5rem; z-index:100; display:flex; justify-content:space-between; align-items:center; box-shadow:0 10px 30px rgba(26,22,20,0.08); }
.lp-nav-brand { text-decoration:none; }
.lp-nav-logo { height:28px; width:auto; object-fit:contain; }
.lp-nav-name { font-family:'Oswald',sans-serif; font-size:1.4rem; font-weight:400; color:#1A1614; letter-spacing:-0.03em; }
.lp-nav-links { display:flex; gap:2.5rem; position:absolute; left:50%; transform:translateX(-50%); }
.lp-nav-links a { color:rgba(26,22,20,0.65); text-decoration:none; font-size:0.78rem; font-weight:500; letter-spacing:0.05em; text-transform:uppercase; transition:color 0.3s; }
.lp-nav-links a:hover { color:#1A1614; }
.lp-btn-nav { display:inline-flex; align-items:center; justify-content:center; height:42px; padding:0 1.5rem; background:${acc}; color:#fff; text-decoration:none; border-radius:9999px; font-weight:700; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; transition:all 0.3s; border:none; }
.lp-btn-nav:hover { transform:translateY(-2px); box-shadow:0 8px 20px ${acc}50; filter:brightness(1.05); }

/* ── HERO ── */
.lp-hero { min-height:100dvh; display:flex; align-items:center; padding-top:8rem; position:relative; overflow:hidden; }
.lp-hero-content { display:grid; grid-template-columns:1.1fr 0.9fr; gap:6rem; align-items:center; width:100%; position:relative; z-index:10; }
.lp-hero-text { display:flex; flex-direction:column; gap:2rem; }
.lp-headline { font-family:'Oswald',sans-serif; font-size:clamp(2.5rem,5.5vw,4.5rem); font-weight:300; line-height:1.1; letter-spacing:-0.02em; color:#1A1614; }
.lp-hl { color:${acc}; font-weight:400; position:relative; }
.lp-hl::after { content:''; position:absolute; bottom:0.1em; left:0; width:100%; height:1px; background:${acc}; opacity:0.35; }
.lp-subheadline { font-size:1.12rem; color:rgba(26,22,20,0.68); max-width:520px; font-weight:400; line-height:1.65; }
.lp-hero-image-side { position:relative; display:flex; justify-content:flex-end; }
.lp-hero-image-wrapper { position:relative; width:100%; max-width:420px; aspect-ratio:0.85; border-radius:3rem; overflow:hidden; border:1px solid ${acc}30; background:#F3ECE2; box-shadow:0 0 40px -10px ${acc}35, 0 40px 80px -20px rgba(26,22,20,0.12); transition:border-color 0.4s; }
.lp-hero-image-wrapper:hover { border-color:${acc}; }
.lp-hero-img { width:100%; height:100%; object-fit:cover; object-position:top; filter:contrast(1.03); mask-image:linear-gradient(to bottom, black 85%, transparent 100%); -webkit-mask-image:linear-gradient(to bottom, black 85%, transparent 100%); }
.lp-image-glow { position:absolute; top:50%; left:50%; transform:translate(-30%,-30%); width:120%; height:120%; filter:blur(60px); z-index:-1; opacity:0.35; }
.lp-cta-group { display:flex; gap:1.5rem; align-items:center; flex-wrap:wrap; }

/* ── HERO STATS (credibilidade) ── */
.lp-hero-stats { display:flex; gap:3rem; margin-top:1.25rem; padding-top:1.5rem; border-top:1px solid rgba(26,22,20,0.08); flex-wrap:wrap; }
.lp-hero-stat { display:flex; flex-direction:column; gap:2px; }
.lp-hero-stat-num { font-family:'Oswald',sans-serif; font-size:clamp(1.6rem,3vw,2.2rem); font-weight:400; color:${acc}; line-height:1; letter-spacing:-0.02em; }
.lp-hero-stat-label { font-size:0.72rem; color:rgba(26,22,20,0.55); text-transform:uppercase; letter-spacing:0.08em; font-weight:500; }

/* ── BUTTONS ── */
.lp-btn-copper { display:inline-flex; align-items:center; justify-content:center; gap:0.6rem; height:54px; padding:0 2.5rem; background:linear-gradient(135deg, ${acc}, ${acc}d9); color:#fff; text-decoration:none; border-radius:9999px; font-weight:700; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.08em; cursor:pointer; transition:all 0.35s cubic-bezier(0.16,1,0.3,1); border:none; font-family:inherit; box-shadow:0 6px 20px ${acc}35; }
.lp-btn-copper:hover { transform:translateY(-2px); box-shadow:0 10px 30px ${acc}55; filter:brightness(1.05); }
.lp-btn-outline { display:inline-flex; align-items:center; justify-content:center; gap:0.6rem; height:54px; padding:0 2.5rem; background:transparent; color:${acc}; text-decoration:none; border-radius:9999px; font-weight:600; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.08em; cursor:pointer; transition:all 0.35s cubic-bezier(0.16,1,0.3,1); border:1.5px solid ${acc}; font-family:inherit; }
.lp-btn-outline:hover { background:${acc}; color:#fff; box-shadow:0 8px 25px ${acc}35; transform:translateY(-2px); }
.lp-btn-outline-light { color:#FAF7F2; border-color:rgba(250,247,242,0.4); background:transparent; }
.lp-btn-outline-light:hover { background:#fff; color:${acc}; border-color:#fff; }
.lp-btn-instagram { display:inline-flex; align-items:center; gap:0.6rem; padding:0.8rem 2rem; background:transparent; color:${acc}; border:1.5px solid ${acc}55; border-radius:9999px; font-weight:600; font-size:0.85rem; text-decoration:none; letter-spacing:0.03em; transition:all 0.35s ease; font-family:inherit; }
.lp-btn-instagram:hover { background:${acc}15; border-color:${acc}; transform:translateY(-2px); }

/* ══════════════════════════════════════════
   BARRA DE DIFERENCIAIS
══════════════════════════════════════════ */
.lp-diferenciais-bar {
  position:relative; padding:4rem 0;
  background:#FFFFFF;
  border-top:1px solid rgba(26,22,20,0.06);
  border-bottom:1px solid rgba(26,22,20,0.06);
}
.lp-diferenciais-bar::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse 80% 100% at 50% 50%, ${acc}08 0%, transparent 70%);
}
.lp-diferenciais-grid {
  display:grid; grid-template-columns:repeat(4,1fr);
  gap:2rem; position:relative; z-index:1;
}
.lp-diferencial-item {
  display:flex; align-items:flex-start; gap:1.2rem;
  padding:1.75rem 1.5rem;
  background:#FAF7F2;
  border:1px solid rgba(26,22,20,0.06);
  border-radius:1.25rem;
  transition:all 0.35s ease;
}
.lp-diferencial-item:hover {
  background:#fff;
  border-color:${acc}50;
  transform:translateY(-4px);
  box-shadow:0 12px 30px rgba(26,22,20,0.08);
}
.lp-diferencial-icon-wrap {
  width:48px; height:48px; flex-shrink:0;
  display:grid; place-items:center;
  background:${acc}14; border:1px solid ${acc}28;
  border-radius:0.875rem;
  transition:all 0.35s ease;
}
.lp-diferencial-item:hover .lp-diferencial-icon-wrap {
  background:${acc}22; border-color:${acc}60;
  box-shadow:0 0 18px ${acc}30;
}
.lp-diferencial-text { display:flex; flex-direction:column; gap:0.35rem; }
.lp-diferencial-titulo {
  font-size:0.95rem; font-weight:600; color:#1A1614;
  letter-spacing:-0.01em;
}
.lp-diferencial-desc {
  font-size:0.8rem; color:rgba(26,22,20,0.55);
  line-height:1.5; font-weight:400;
}

/* ── STATS BAR ── */
.lp-stats-bar { position:relative; padding:2.5rem 0; background:#F3ECE2; border-top:1px solid rgba(26,22,20,0.06); border-bottom:1px solid rgba(26,22,20,0.06); }
.lp-stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:20px; text-align:center; }
.lp-stat-num { font-family:'Oswald',sans-serif; font-size:clamp(2rem,4vw,3rem); font-weight:400; color:${acc}; display:block; line-height:1; letter-spacing:-0.02em; }
.lp-stat-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.1em; color:rgba(26,22,20,0.55); font-weight:500; margin-top:6px; display:block; }

/* ── TIMELINE ── */
.lp-timeline-sec { position:relative; padding:10rem 0; background:#FAF7F2; overflow:hidden; }
.lp-section-bg { position:absolute; inset:0; z-index:0; pointer-events:none; }
.lp-section-bg::before { content:""; position:absolute; top:-20%; left:10%; width:80%; height:140%; background:radial-gradient(circle at center, ${acc}10 0%, transparent 70%); filter:blur(120px); }
.lp-timeline-outer { position:relative; max-width:1200px; margin:0 auto; padding:0 2rem; z-index:10; }
.lp-timeline-line { position:absolute; left:50%; transform:translateX(-50%); top:0; width:4px; background:rgba(26,22,20,0.08); border-radius:2px; }
.lp-timeline-progress { position:absolute; left:50%; transform:translateX(-50%); top:0; width:4px; height:0; background:linear-gradient(to bottom, ${acc}, ${acc}99); box-shadow:0 0 20px ${acc}50; border-radius:2px; transition:height 0.1s linear; }
.lp-timeline-item { position:relative; display:flex; width:100%; margin-bottom:5rem; }
.lp-timeline-item:last-child { margin-bottom:0; }
.lp-timeline-item:nth-child(odd) { justify-content:flex-start; }
.lp-timeline-item:nth-child(odd) .lp-timeline-content { width:50%; justify-content:flex-end; padding-right:5rem; }
.lp-timeline-item:nth-child(even) { justify-content:flex-end; }
.lp-timeline-item:nth-child(even) .lp-timeline-content { width:50%; justify-content:flex-start; padding-left:5rem; }
.lp-timeline-content { display:flex; position:relative; }
.lp-timeline-dot { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:16px; height:16px; background:#FAF7F2; border:3px solid ${acc}; border-radius:50%; z-index:20; box-shadow:0 0 12px ${acc}40; }
.lp-timeline-card { background:#FFFFFF; border:1px solid rgba(26,22,20,0.06); border-radius:2rem; padding:2.5rem; max-width:450px; transition:all 0.4s ease; box-shadow:0 10px 30px rgba(26,22,20,0.05); }
.lp-timeline-card:hover { border-color:${acc}70; transform:translateY(-5px); box-shadow:0 20px 50px rgba(26,22,20,0.08); }
.lp-timeline-card-header { display:flex; align-items:center; gap:1.5rem; margin-bottom:1.5rem; }
.lp-timeline-icon { width:48px; height:48px; display:flex; align-items:center; justify-content:center; background:${acc}14; border-radius:1rem; border:1px solid ${acc}28; font-family:'Oswald',sans-serif; font-size:1rem; font-weight:400; color:${acc}; letter-spacing:0.05em; transition:all 0.4s ease; }
.lp-timeline-card:hover .lp-timeline-icon { background:${acc}25; border-color:${acc}; transform:scale(1.1); box-shadow:0 0 20px ${acc}35; }
.lp-timeline-title { font-family:'Oswald',sans-serif; font-size:1.6rem; font-weight:400; letter-spacing:-0.02em; color:#1A1614; }
.lp-timeline-desc { color:rgba(26,22,20,0.65); font-size:0.95rem; line-height:1.65; font-weight:400; }

/* ══════════════════════════════════════════
   PORTFOLIO COM ABAS
══════════════════════════════════════════ */
.lp-portfolio-sec { position:relative; padding:8rem 2rem 10rem; background:#FFFFFF; overflow:hidden; }
.lp-portfolio-sec::before { content:""; position:absolute; top:0; left:0; right:0; height:200px; background:linear-gradient(to bottom, #FAF7F2, #FFFFFF); z-index:0; pointer-events:none; }
.lp-proj-bg { position:absolute; inset:0; z-index:1; pointer-events:none; background:radial-gradient(ellipse 80% 60% at 20% 80%, ${acc}0d 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 20%, ${acc}08 0%, transparent 50%); }
.lp-portfolio-container { max-width:1200px; margin:0 auto; position:relative; z-index:5; }

.lp-portfolio-tabs {
  display:flex; gap:0.6rem; flex-wrap:wrap;
  justify-content:center; margin-bottom:2.5rem;
}
.lp-tab-btn {
  padding:0.55rem 1.4rem;
  background:#FAF7F2;
  border:1px solid rgba(26,22,20,0.08);
  border-radius:9999px;
  color:rgba(26,22,20,0.62);
  font-family:inherit; font-size:0.82rem; font-weight:500;
  letter-spacing:0.03em; cursor:pointer;
  transition:all 0.25s ease;
}
.lp-tab-btn:hover {
  background:#F3ECE2;
  border-color:rgba(26,22,20,0.15);
  color:#1A1614;
}
.lp-tab-btn.active {
  background:${acc}18;
  border-color:${acc};
  color:${acc};
  font-weight:600;
}

.lp-projects-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1.5rem; animation:tabFadeIn 0.4s ease both; }
.lp-project-card { border-radius:1.2rem; overflow:hidden; cursor:pointer; opacity:0; transform:translateY(30px); transition:transform 0.4s ease, box-shadow 0.4s ease; background:#FAF7F2; border:1px solid rgba(26,22,20,0.05); }
.lp-project-card.active { opacity:1; transform:translateY(0); }
.lp-project-card:hover { transform:translateY(-6px); box-shadow:0 20px 40px rgba(26,22,20,0.1); }
.lp-project-img-wrap { aspect-ratio:4/3; overflow:hidden; }
.lp-project-img-wrap img { width:100%; height:100%; object-fit:cover; transition:transform 0.6s ease; display:block; }
.lp-project-card:hover .lp-project-img-wrap img { transform:scale(1.06); }
.lp-project-info { padding:1rem 1.2rem 1.2rem; }
.lp-project-title { font-size:1rem; font-weight:600; margin-bottom:0.3rem; color:#1A1614; }
.lp-project-desc { font-size:0.8rem; color:rgba(26,22,20,0.55); line-height:1.4; }
.lp-portfolio-empty { grid-column:1/-1; text-align:center; padding:4rem; color:rgba(26,22,20,0.4); font-size:0.95rem; }

/* ══════════════════════════════════════════
   DEPOIMENTOS
══════════════════════════════════════════ */
.lp-testimonials-sec { position:relative; padding:8rem 0; background:#FAF7F2; overflow:hidden; }
.lp-testimonials-sec::before { content:""; position:absolute; top:0; left:50%; transform:translateX(-50%); width:100%; height:1px; background:linear-gradient(90deg,transparent,${acc}40,transparent); }
.lp-marquee-container { position:relative; width:100%; overflow:hidden; padding:3rem 0; mask-image:linear-gradient(to right,transparent,black 15%,black 85%,transparent); -webkit-mask-image:linear-gradient(to right,transparent,black 15%,black 85%,transparent); }
.lp-marquee-content { display:flex; gap:2rem; width:max-content; animation:marqueeScroll 25s linear infinite; }
.lp-marquee-content:hover { animation-play-state:paused; }
.lp-testimonial-card { width:420px; background:#FFFFFF; border:1px solid rgba(26,22,20,0.06); border-radius:2rem; padding:2.5rem; display:flex; flex-direction:column; gap:1rem; transition:all 0.5s cubic-bezier(0.4,0,0.2,1); flex-shrink:0; box-shadow:0 8px 24px rgba(26,22,20,0.04); }
.lp-testimonial-card:hover { border-color:${acc}70; transform:translateY(-12px) scale(1.015); box-shadow:0 20px 50px rgba(26,22,20,0.10); }
.lp-quote-icon { font-size:3rem; font-family:'Oswald',sans-serif; color:${acc}; line-height:1; opacity:0.55; }
.lp-stars { display:flex; gap:3px; margin-top:-4px; }
.lp-testimonial-text { font-size:0.98rem; color:rgba(26,22,20,0.78); line-height:1.65; font-weight:400; font-style:italic; flex:1; }
.lp-testimonial-author { display:flex; align-items:center; gap:1rem; padding-top:0.75rem; border-top:1px solid rgba(26,22,20,0.08); margin-top:auto; }
.lp-author-avatar { width:48px; height:48px; border-radius:50%; display:grid; place-items:center; font-size:1.1rem; font-weight:700; flex-shrink:0; border:2px solid ${acc}35; }
.lp-author-info { display:flex; flex-direction:column; gap:0.15rem; }
.lp-author-name { font-weight:700; color:#1A1614; font-size:0.9rem; }
.lp-author-role { font-size:0.72rem; color:${acc}; text-transform:uppercase; letter-spacing:0.1em; font-weight:600; }

/* ── FORM SECTION ── */
.lp-form-section { position:relative; padding:8rem 0; background:#FFFFFF; overflow:hidden; }
.lp-form-section::before { content:""; position:absolute; inset:0; background:radial-gradient(ellipse 50% 60% at 30% 50%, ${acc}0d 0%, transparent 50%); pointer-events:none; z-index:0; }
.lp-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:3rem; align-items:start; }
.lp-form-card-glass { background:#FAF7F2; border:1px solid rgba(26,22,20,0.06); border-radius:2rem; padding:2.5rem; box-shadow:0 10px 30px rgba(26,22,20,0.05); }
.lp-form-inner { display:flex; flex-direction:column; gap:14px; }
.lp-dark-input { width:100%; border:1px solid rgba(26,22,20,0.12); border-radius:12px; padding:14px 16px; font-size:15px; outline:none; font-family:inherit; background:#fff; color:#1A1614; transition:border-color 0.2s, box-shadow 0.2s; }
.lp-dark-input:focus { border-color:${acc}; box-shadow:0 0 0 3px ${acc}1f; }
.lp-dark-input::placeholder { color:rgba(26,22,20,0.4); }
.lp-form-erro { font-size:13px; color:#B91C1C; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:10px; padding:10px 12px; }
.lp-form-badge { display:inline-flex; align-items:center; gap:6px; align-self:flex-start; padding:5px 12px; border-radius:9999px; background:${acc}18; border:1px solid ${acc}50; color:${acc}; font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; }
.lp-form-title { font-family:'Oswald',sans-serif; font-size:clamp(1.6rem,3vw,2.2rem); font-weight:400; line-height:1.15; letter-spacing:-0.02em; color:#1A1614; }
.lp-form-sub { font-size:0.95rem; color:rgba(26,22,20,0.65); line-height:1.65; font-weight:400; }
.lp-input-lg { padding:18px 20px !important; font-size:16px !important; border-radius:14px !important; }
.lp-select { appearance:none; -webkit-appearance:none; cursor:pointer; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%231a161477' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 18px center; padding-right:44px !important; }
.lp-select option { background:#fff; color:#1A1614; }
.lp-btn-wa-hero { --wa-glow-rgb:37,211,102; display:inline-flex; align-items:center; justify-content:center; gap:12px; width:100%; height:64px; padding:0 2rem; margin-top:6px; background:linear-gradient(135deg, #25D366, #128C7E); color:#fff; border:none; border-radius:14px; font-family:inherit; font-size:1.02rem; font-weight:800; cursor:pointer; transition:all 0.3s; box-shadow:0 8px 24px rgba(var(--wa-glow-rgb),0.3); animation:waHeroPulse 2.4s ease-in-out infinite; }
.lp-btn-wa-hero:hover { transform:translateY(-2px); box-shadow:0 14px 40px rgba(var(--wa-glow-rgb),0.5); animation-play-state:paused; }
.lp-btn-wa-hero:disabled { opacity:0.7; cursor:wait; animation:none; }
@keyframes waHeroPulse { 0%,100%{box-shadow:0 8px 24px rgba(var(--wa-glow-rgb),0.3),0 0 0 0 rgba(var(--wa-glow-rgb),0.4)} 50%{box-shadow:0 8px 24px rgba(var(--wa-glow-rgb),0.3),0 0 0 12px rgba(var(--wa-glow-rgb),0)} }
.lp-form-trust { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; padding-top:10px; }
.lp-form-trust span { display:inline-flex; align-items:center; gap:4px; font-size:0.72rem; color:rgba(26,22,20,0.55); font-weight:500; }
.lp-form-trust span svg { color:${acc}; }
.lp-faq-list { display:grid; gap:8px; }
.lp-faq-item { border:1px solid rgba(26,22,20,0.08); border-radius:14px; overflow:hidden; background:#FAF7F2; transition:border-color 0.2s, background 0.2s; }
.lp-faq-item:hover, .lp-faq-item.open { border-color:${acc}55; background:#fff; }
.lp-faq-q { width:100%; background:none; border:none; padding:16px 18px; display:flex; justify-content:space-between; align-items:center; gap:16px; cursor:pointer; font-size:0.9rem; font-weight:500; text-align:left; color:#1A1614; font-family:inherit; }
.lp-faq-chevron { transition:transform 0.3s; flex-shrink:0; color:${acc}; }
.lp-faq-item.open .lp-faq-chevron { transform:rotate(180deg); }
.lp-faq-a { max-height:0; overflow:hidden; transition:max-height 0.35s cubic-bezier(0.22,1,0.36,1); }
.lp-faq-a p { padding:0 18px 16px; font-size:0.85rem; line-height:1.75; color:rgba(26,22,20,0.65); }

/* ── CTA FINAL (escuro para contraste) ── */
.lp-cta-section { position:relative; padding:10rem 0; background:#1A1614; overflow:hidden; display:flex; justify-content:center; align-items:center; z-index:1; }
.lp-cta-aura { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; height:100%; background:radial-gradient(circle at 10% 20%, ${acc}25 0%, transparent 50%), radial-gradient(circle at 90% 80%, ${acc}20 0%, transparent 50%); filter:blur(120px); z-index:-1; }
.lp-cta-container { max-width:1100px; width:90%; margin:0 auto; position:relative; z-index:10; }
.lp-cta-card { background:rgba(255,255,255,0.04); backdrop-filter:blur(25px); border:1px solid rgba(255,255,255,0.08); border-radius:3rem; padding:6rem 4rem; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-shadow:inset 0 0 50px rgba(255,255,255,0.03), 0 40px 100px rgba(0,0,0,0.3); position:relative; overflow:hidden; }
.lp-cta-card::before { content:""; position:absolute; inset:0; background:radial-gradient(circle at 50% 120%, ${acc}25, transparent 70%); pointer-events:none; }
.lp-cta-section .lp-headline { color:#FAF7F2; }
.lp-cta-section .lp-hl { color:${acc}; }
.lp-cta-subtitle { font-size:1.2rem; max-width:550px; margin:0 auto 3rem; color:rgba(250,247,242,0.7); font-weight:400; line-height:1.6; }
.lp-cta-actions { display:flex; gap:1.5rem; align-items:center; flex-wrap:wrap; justify-content:center; position:relative; z-index:2; }
.lp-btn-wa-cta { display:inline-flex; align-items:center; gap:8px; padding:16px 32px; background:#25D366; color:#fff; border:none; border-radius:9999px; font-size:0.9rem; font-weight:700; text-decoration:none; cursor:pointer; transition:all 0.3s; text-transform:uppercase; letter-spacing:0.08em; box-shadow:0 4px 18px rgba(37,211,102,0.4); }
.lp-btn-wa-cta:hover { transform:translateY(-2px); box-shadow:0 8px 25px rgba(37,211,102,0.55); }
.lp-footer-contacts { display:flex; gap:20px; justify-content:center; flex-wrap:wrap; margin-top:3rem; padding-top:2rem; border-top:1px solid rgba(250,247,242,0.12); position:relative; z-index:2; }
.lp-footer-contacts a, .lp-footer-contacts span { display:inline-flex; align-items:center; gap:6px; font-size:0.8rem; text-decoration:none; color:rgba(250,247,242,0.55); transition:color 0.2s; }
.lp-footer-contacts a:hover { color:${acc}; }

/* ── FOOTER ── */
.lp-footer-bar { padding:1rem 0; background:#0F0D0C; border-top:1px solid rgba(255,255,255,0.06); }
.lp-footer-inner { display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:rgba(250,247,242,0.45); flex-wrap:wrap; gap:8px; }
.lp-footer-inner a { color:rgba(250,247,242,0.45); text-decoration:none; display:inline-flex; gap:5px; align-items:center; transition:color 0.2s; }
.lp-footer-inner a:hover { color:${acc}; }

/* ── WHATSAPP FLOAT ── */
.lp-wa-float { position:fixed; bottom:24px; right:24px; z-index:9999; width:60px; height:60px; border-radius:50%; background:#25D366; color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 20px rgba(37,211,102,0.4); cursor:pointer; transition:transform 0.2s; animation:lpPulse 2s infinite; text-decoration:none; }
.lp-wa-float:hover { transform:scale(1.1); }

/* ── STICKY WA BAR (mobile only) ── */
.lp-sticky-wa-bar { display:none; }
@media (max-width:768px) {
  .lp-wa-float-hidden-mobile { display:none !important; }
  .lp-sticky-wa-bar { display:flex; position:fixed; bottom:0; left:0; right:0; z-index:9998; padding:10px 16px; padding-bottom:max(10px,env(safe-area-inset-bottom,10px)); background:rgba(255,255,255,0.97); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border-top:1px solid rgba(26,22,20,0.1); box-shadow:0 -8px 30px rgba(26,22,20,0.1); }
  .lp-sticky-wa-btn { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; height:52px; background:#25D366; color:#fff; border-radius:12px; font-weight:800; font-size:0.92rem; text-decoration:none; letter-spacing:0.02em; transition:opacity 0.2s; font-family:inherit; }
  .lp-sticky-wa-btn:hover { opacity:0.9; }
}

/* ══════════════════════════════════════════
   LEAD POPUP
══════════════════════════════════════════ */
.lp-popup-backdrop { position:fixed; inset:0; background:rgba(26,22,20,0.55); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); z-index:10000; display:grid; place-items:center; padding:20px; animation:fadeInUp 0.25s ease both; }
.lp-popup-card { position:relative; width:100%; max-width:440px; background:#FFFFFF; border:1px solid rgba(26,22,20,0.08); border-radius:1.75rem; padding:2.25rem 2rem 1.75rem; box-shadow:0 30px 80px rgba(26,22,20,0.25); animation:popupIn 0.35s cubic-bezier(0.16,1,0.3,1) both; }
.lp-popup-close { position:absolute; top:10px; right:14px; background:transparent; border:none; color:rgba(26,22,20,0.5); font-size:28px; line-height:1; cursor:pointer; padding:4px 10px; border-radius:50%; transition:all 0.2s; }
.lp-popup-close:hover { color:#1A1614; background:rgba(26,22,20,0.06); }
.lp-popup-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 11px; border-radius:9999px; background:${acc}18; border:1px solid ${acc}50; color:${acc}; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:12px; }
.lp-popup-title { font-family:'Oswald',sans-serif; font-size:1.65rem; font-weight:400; color:#1A1614; letter-spacing:-0.02em; margin-bottom:8px; }
.lp-popup-sub { font-size:0.92rem; color:rgba(26,22,20,0.65); line-height:1.55; margin-bottom:18px; }
.lp-popup-sub b { color:#1A1614; font-weight:600; }
.lp-popup-form { display:flex; flex-direction:column; gap:10px; }
.lp-popup-input { width:100%; border:1px solid rgba(26,22,20,0.14); border-radius:12px; padding:14px 16px; font-size:15px; outline:none; font-family:inherit; background:#FAF7F2; color:#1A1614; transition:border-color 0.2s, box-shadow 0.2s, background 0.2s; }
.lp-popup-input:focus { border-color:${acc}; background:#fff; box-shadow:0 0 0 3px ${acc}1f; }
.lp-popup-input::placeholder { color:rgba(26,22,20,0.4); }
.lp-popup-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:52px; background:linear-gradient(135deg, ${acc}, ${acc}d9); color:#fff; border:none; border-radius:12px; font-family:inherit; font-size:0.92rem; font-weight:700; cursor:pointer; transition:all 0.25s; margin-top:4px; box-shadow:0 6px 18px ${acc}40; }
.lp-popup-btn:hover { transform:translateY(-2px); box-shadow:0 10px 26px ${acc}55; }
.lp-popup-btn:disabled { opacity:0.7; cursor:wait; }
.lp-popup-trust { display:flex; justify-content:center; align-items:center; gap:5px; margin-top:8px; font-size:0.72rem; color:rgba(26,22,20,0.55); }
.lp-popup-trust svg { color:${acc}; }

/* ═══ TOUCH DEVICES ═══ */
@media (hover: none) {
  .lp-btn-copper:hover, .lp-btn-outline:hover, .lp-btn-nav:hover,
  .lp-tab-btn:hover, .lp-diferencial-item:hover, .lp-timeline-card:hover,
  .lp-project-card:hover, .lp-testimonial-card:hover { transform: none !important; }
  .lp-marquee-content { animation-duration: 45s !important; }
}

/* ═══ TABLET — 1024px ═══ */
@media (max-width: 1024px) {
  .lp-container { padding: 0 2rem; }
  .lp-nav-links { display: none; }

  .lp-hero { padding-top: 7rem; }
  .lp-hero-content { grid-template-columns: 1fr; text-align: center; gap: 2.5rem; }
  .lp-hero-text { align-items: center; }
  .lp-hero-image-side { justify-content: center; order: -1; }
  .lp-hero-image-wrapper { max-width: 280px; }
  .lp-subheadline { max-width: 560px; }

  .lp-cta-group { flex-direction: column; gap: 0.875rem; width: 100%; align-items: stretch; max-width: 360px; }
  .lp-btn-copper, .lp-btn-outline { width: 100%; justify-content: center; }
  .lp-hero-stats { justify-content:center; gap:2rem; }

  .lp-diferenciais-grid { grid-template-columns: repeat(2, 1fr); }

  .lp-timeline-line, .lp-timeline-progress { left: 24px !important; transform: translateX(-50%) !important; }
  .lp-timeline-dot { left: 24px !important; transform: translate(-50%, -50%) !important; }
  .lp-timeline-item { justify-content: flex-end !important; }
  .lp-timeline-item .lp-timeline-content {
    width: calc(100% - 56px) !important;
    padding-left: 1.75rem !important;
    padding-right: 0 !important;
    justify-content: flex-start !important;
  }
  .lp-timeline-card { max-width: 100%; }

  .lp-projects-grid { grid-template-columns: repeat(2, 1fr); gap: 1rem; }
  .lp-form-grid { grid-template-columns: 1fr; }
  .lp-cta-card { padding: 4rem 2.5rem; border-radius: 2rem; }
  .lp-cta-actions { flex-direction: column; align-items: stretch; gap: 0.875rem; }
  .lp-btn-wa-cta { width: 100%; justify-content: center; }
  .lp-btn-outline-light { width: 100%; justify-content: center; }
}

/* ═══ MOBILE — 768px ═══ */
@media (max-width: 768px) {
  .lp-container { padding: 0 1.25rem; }

  .lp-glass-nav { top: 0.75rem; padding: 0.5rem 0.75rem 0.5rem 1.25rem; }
  .lp-nav-name { font-size: 1.15rem; }
  .lp-btn-nav { height: 38px; padding: 0 0.875rem; font-size: 0.68rem; }
  .lp-nav-logo { height: 24px; }

  .lp-hero { padding-top: 6.5rem; }
  .lp-hero-image-side { display: none; }
  .lp-hero-text { gap: 1.5rem; }
  .lp-headline { font-size: clamp(1.9rem, 8.5vw, 2.8rem) !important; line-height: 1.15; }
  .lp-subheadline { font-size: 0.975rem; line-height: 1.65; }
  .lp-cta-group { max-width: 100%; }
  .lp-hero-stats { gap:1.5rem; padding-top:1rem; margin-top:1rem; }
  .lp-hero-stat-num { font-size:1.4rem; }
  .lp-hero-stat-label { font-size:0.65rem; }

  .lp-diferenciais-bar { padding: 2.5rem 0; }
  .lp-diferenciais-grid { grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .lp-diferencial-item { padding: 1rem 0.875rem; gap: 0.75rem; }
  .lp-diferencial-icon-wrap { width: 40px; height: 40px; min-width: 40px; border-radius: 0.75rem; }
  .lp-diferencial-titulo { font-size: 0.82rem; }
  .lp-diferencial-desc { display: none; }

  .lp-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .lp-stat-num { font-size: clamp(1.6rem, 5vw, 2.5rem); }
  .lp-stat-label { font-size: 0.68rem; }

  .lp-timeline-sec { padding: 5rem 0; }
  .lp-timeline-card { padding: 1.5rem; }
  .lp-timeline-title { font-size: 1.25rem; }
  .lp-timeline-desc { font-size: 0.88rem; }
  .lp-timeline-icon { width: 40px; height: 40px; font-size: 0.9rem; }

  .lp-portfolio-sec { padding: 4.5rem 0 6rem; }
  .lp-portfolio-container { padding: 0 1.25rem; }
  .lp-portfolio-tabs {
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    justify-content: flex-start;
    padding-bottom: 4px;
    margin-left: -1.25rem;
    margin-right: -1.25rem;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
    gap: 0.5rem;
  }
  .lp-portfolio-tabs::-webkit-scrollbar { display: none; }
  .lp-tab-btn { flex-shrink: 0; padding: 0.5rem 1.1rem; font-size: 0.8rem; height: 38px; }
  .lp-projects-grid { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
  .lp-portfolio-empty { padding: 2.5rem 1rem; }

  .lp-testimonials-sec { padding: 4.5rem 0; }
  .lp-testimonial-card { width: min(82vw, 340px); padding: 1.75rem 1.5rem; }
  .lp-testimonial-text { font-size: 0.92rem; }

  .lp-form-section { padding: 4rem 0; }
  .lp-form-card-glass { padding: 1.5rem; border-radius: 1.5rem; }
  .lp-form-title { font-size: clamp(1.4rem, 5vw, 2rem) !important; }
  .lp-form-sub { font-size: 0.875rem; }
  .lp-form-trust { gap: 10px; }
  .lp-form-trust span { font-size: 0.75rem; }
  .lp-faq-q { font-size: 0.85rem; padding: 14px 16px; }

  .lp-cta-section { padding: 5rem 0; }
  .lp-cta-card { padding: 3rem 1.5rem; border-radius: 1.5rem; }
  .lp-cta-subtitle { font-size: 1rem; margin-bottom: 1.75rem; }
  .lp-footer-contacts { flex-direction: column; align-items: center; gap: 10px; }

  .lp-wa-float {
    bottom: max(20px, env(safe-area-inset-bottom, 20px));
    right: max(20px, env(safe-area-inset-right, 20px));
    width: 54px; height: 54px;
  }

  /* Popup em mobile: ajustar padding */
  .lp-popup-card { padding:1.75rem 1.5rem 1.25rem; border-radius:1.25rem; }
  .lp-popup-title { font-size:1.35rem; }
}

/* ═══ SMALL MOBILE — 480px ═══ */
@media (max-width: 480px) {
  .lp-container { padding: 0 1rem; }
  .lp-hero { padding-top: 6rem; }
  .lp-headline { font-size: clamp(1.75rem, 9vw, 2.4rem) !important; }
  .lp-hero-stats { gap:1rem; }

  .lp-diferenciais-grid { grid-template-columns: 1fr 1fr; gap: 0.625rem; }
  .lp-diferencial-item { padding: 0.875rem 0.75rem; gap: 0.6rem; }
  .lp-diferencial-icon-wrap { width: 34px; height: 34px; min-width: 34px; }

  .lp-projects-grid { grid-template-columns: 1fr; }
  .lp-portfolio-tabs {
    margin-left: -1rem;
    margin-right: -1rem;
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .lp-timeline-card { padding: 1.25rem; }
  .lp-timeline-title { font-size: 1.15rem; }
  .lp-timeline-item .lp-timeline-content {
    width: calc(100% - 48px) !important;
    padding-left: 1.25rem !important;
  }

  .lp-testimonial-card { width: min(88vw, 300px); padding: 1.5rem 1.25rem; }
  .lp-cta-card { padding: 2.5rem 1.25rem; }
  .lp-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }

  .lp-footer-contacts { gap: 8px; }
  .lp-footer-contacts a, .lp-footer-contacts span { font-size: 0.75rem; }
}

/* ═══ VERY SMALL — 360px ═══ */
@media (max-width: 360px) {
  .lp-container { padding: 0 0.875rem; }
  .lp-glass-nav { padding: 0.45rem 0.6rem 0.45rem 1rem; }
  .lp-nav-name { font-size: 1rem; }
  .lp-btn-nav { padding: 0 0.75rem; font-size: 0.62rem; height: 34px; }
  .lp-headline { font-size: 1.7rem !important; }
  .lp-diferenciais-grid { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .lp-diferencial-titulo { font-size: 0.75rem; }
  .lp-portfolio-tabs { margin-left: -0.875rem; padding-left: 0.875rem; }
}

/* ═══ REDUCED MOTION ═══ */
@media (prefers-reduced-motion: reduce) {
  .lp-reveal { opacity: 1 !important; transform: none !important; transition: none !important; }
  .lp-animate-fade-up, .lp-animate-blur-in { animation: none !important; opacity: 1 !important; }
  .lp-animate-float, .lp-wa-float, .lp-marquee-content, .lp-aura,
  .lp-btn-wa-hero { animation: none !important; }
}
`;
}
