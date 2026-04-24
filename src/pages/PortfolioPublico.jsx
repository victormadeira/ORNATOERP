// ═══════════════════════════════════════════════════════════════
// PortfolioPublico.jsx — Página de portfolio público do Studio Ornato
// Rota: /portfolioornato
// Visual: lookbook escuro, masonry, filtro por ambiente, modal com WA CTA
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';

const AMBIENTES = [
    'Todos',
    'Cozinha',
    'Closet / Dormitório',
    'Banheiro',
    'Home Office',
    'Sala de Estar',
    'Área Gourmet',
    'Múltiplos Ambientes',
    'Outro',
];

// ── CSS da página ─────────────────────────────────────────────────
function buildCSS(acc = '#C9A96E', fundo = '#1E1917') {
    return `
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: ${fundo}; color: #DDD2CC; font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

        /* Header */
        .pf-header {
            position: sticky; top: 0; z-index: 100;
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 20px; height: 60px;
            background: ${fundo}ee;
            backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .pf-logo { height: 32px; object-fit: contain; }
        .pf-logo-text { font-size: 17px; font-weight: 700; letter-spacing: 0.05em; color: #DDD2CC; }
        .pf-wa-btn {
            display: flex; align-items: center; gap: 7px;
            padding: 8px 16px; border-radius: 50px;
            background: ${acc}; color: #1A1614;
            font-size: 13px; font-weight: 700;
            text-decoration: none; transition: opacity .18s;
            white-space: nowrap;
        }
        .pf-wa-btn:hover { opacity: .88; }
        .pf-wa-icon { width: 16px; height: 16px; fill: #1A1614; flex-shrink: 0; }

        /* Hero */
        .pf-hero {
            padding: 52px 20px 36px;
            text-align: center;
            max-width: 540px; margin: 0 auto;
        }
        .pf-hero-tag {
            display: inline-block;
            font-size: 11px; font-weight: 600; letter-spacing: .14em;
            text-transform: uppercase;
            color: ${acc};
            margin-bottom: 14px;
        }
        .pf-hero-title {
            font-size: clamp(26px, 5vw, 38px);
            font-weight: 700; line-height: 1.18;
            color: #DDD2CC; margin-bottom: 12px;
        }
        .pf-hero-sub {
            font-size: 14px; line-height: 1.6;
            color: #847974;
        }

        /* Filtros */
        .pf-filters {
            display: flex; gap: 8px;
            overflow-x: auto; padding: 0 20px 2px;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            margin-bottom: 28px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .pf-filters::-webkit-scrollbar { display: none; }
        .pf-pill {
            flex-shrink: 0;
            padding: 7px 16px; border-radius: 50px;
            font-size: 12px; font-weight: 600;
            border: 1.5px solid rgba(255,255,255,0.1);
            background: transparent;
            color: #847974;
            cursor: pointer; transition: all .18s;
            white-space: nowrap;
        }
        .pf-pill:hover { border-color: ${acc}55; color: #DDD2CC; }
        .pf-pill.active {
            background: ${acc}22;
            border-color: ${acc};
            color: ${acc};
        }

        /* Grid masonry */
        .pf-grid-wrap { padding: 0 16px 60px; max-width: 1200px; margin: 0 auto; }
        .pf-grid {
            columns: 2; column-gap: 12px;
        }
        @media (min-width: 640px) { .pf-grid { columns: 2; column-gap: 14px; } }
        @media (min-width: 900px) { .pf-grid { columns: 3; column-gap: 16px; } }

        /* Card */
        .pf-card {
            break-inside: avoid;
            margin-bottom: 12px;
            border-radius: 14px;
            overflow: hidden;
            cursor: pointer;
            position: relative;
            background: #2A2320;
            transition: transform .2s, box-shadow .2s;
        }
        .pf-card:hover { transform: scale(1.015); box-shadow: 0 12px 40px rgba(0,0,0,.5); }
        .pf-card img {
            width: 100%; display: block;
            object-fit: cover;
            transition: transform .35s;
        }
        .pf-card:hover img { transform: scale(1.04); }
        .pf-card-overlay {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 32px 14px 14px;
            background: linear-gradient(transparent, rgba(20,16,14,.88) 60%);
            opacity: 0; transition: opacity .22s;
        }
        .pf-card:hover .pf-card-overlay { opacity: 1; }
        .pf-card-title {
            font-size: 13px; font-weight: 700;
            color: #DDD2CC; line-height: 1.3;
            margin-bottom: 4px;
        }
        .pf-card-amb {
            font-size: 10px; font-weight: 600;
            color: ${acc}; letter-spacing: .06em;
            text-transform: uppercase;
        }

        /* Empty state */
        .pf-empty {
            text-align: center; padding: 80px 20px;
            color: #847974; font-size: 14px;
        }

        /* Loading skeleton */
        .pf-skeleton {
            border-radius: 14px;
            background: linear-gradient(90deg, #2A2320 25%, #332E2B 50%, #2A2320 75%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
            break-inside: avoid;
            margin-bottom: 12px;
        }
        @keyframes shimmer { to { background-position: -200% 0; } }

        /* Modal backdrop */
        .pf-modal-backdrop {
            position: fixed; inset: 0; z-index: 200;
            background: rgba(20,16,14,.92);
            backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center;
            padding: 16px;
            animation: fadeIn .18s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } }

        /* Modal card */
        .pf-modal {
            background: #272220;
            border-radius: 20px;
            overflow: hidden;
            max-width: 560px; width: 100%;
            max-height: 92vh;
            display: flex; flex-direction: column;
            box-shadow: 0 32px 80px rgba(0,0,0,.7);
            animation: slideUp .22s ease;
        }
        @keyframes slideUp { from { transform: translateY(24px); opacity: 0; } }

        .pf-modal-img-wrap {
            position: relative;
            max-height: 55vh;
            overflow: hidden;
            flex-shrink: 0;
        }
        .pf-modal-img-wrap img {
            width: 100%; max-height: 55vh;
            object-fit: cover; display: block;
        }
        .pf-modal-close {
            position: absolute; top: 12px; right: 12px;
            width: 32px; height: 32px; border-radius: 50%;
            background: rgba(0,0,0,.55);
            border: none; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: #DDD2CC; font-size: 18px; line-height: 1;
            transition: background .15s;
        }
        .pf-modal-close:hover { background: rgba(0,0,0,.8); }

        .pf-modal-body {
            padding: 22px 22px 24px;
            overflow-y: auto;
            flex: 1;
        }
        .pf-modal-amb {
            font-size: 10px; font-weight: 700;
            text-transform: uppercase; letter-spacing: .1em;
            color: ${acc}; margin-bottom: 8px;
        }
        .pf-modal-title {
            font-size: 20px; font-weight: 700;
            color: #DDD2CC; margin-bottom: 6px; line-height: 1.2;
        }
        .pf-modal-designer {
            font-size: 12px; color: #847974; margin-bottom: 12px;
        }
        .pf-modal-desc {
            font-size: 13px; line-height: 1.7;
            color: #A89F9A; margin-bottom: 22px;
        }
        .pf-modal-wa {
            display: flex; align-items: center; justify-content: center; gap: 8px;
            width: 100%; padding: 13px 20px;
            border-radius: 50px;
            background: ${acc}; color: #1A1614;
            font-size: 14px; font-weight: 700;
            text-decoration: none; transition: opacity .18s;
        }
        .pf-modal-wa:hover { opacity: .88; }

        /* Footer */
        .pf-footer {
            text-align: center; padding: 24px 20px;
            border-top: 1px solid rgba(255,255,255,.05);
            font-size: 11px; color: #5A524F;
        }
        .pf-footer a { color: ${acc}; text-decoration: none; }
        .pf-footer a:hover { text-decoration: underline; }

        /* Count badge */
        .pf-count {
            text-align: center; margin-bottom: 20px;
            font-size: 12px; color: #5A524F;
        }

        @media (max-width: 400px) {
            .pf-hero { padding: 36px 16px 24px; }
            .pf-grid-wrap { padding: 0 10px 48px; }
            .pf-wa-btn span { display: none; }
        }
    `;
}

// ── Ícone WhatsApp SVG ────────────────────────────────────────────
function WaIcon({ className }) {
    return (
        <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.116 1.52 5.845L.057 23.854a.5.5 0 0 0 .608.63l6.197-1.63A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.034-1.383l-.36-.214-3.732.982.999-3.648-.235-.374A9.818 9.818 0 1 1 12 21.818z"/>
        </svg>
    );
}

// ── Skeleton cards ────────────────────────────────────────────────
function SkeletonGrid() {
    const heights = [220, 300, 180, 260, 210, 340, 190, 280];
    return (
        <div className="pf-grid">
            {heights.map((h, i) => (
                <div key={i} className="pf-skeleton" style={{ height: h }} />
            ))}
        </div>
    );
}

// ── Componente principal ──────────────────────────────────────────
export default function PortfolioPublico() {
    const [items, setItems] = useState([]);
    const [empresa, setEmpresa] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState('Todos');
    const [modal, setModal] = useState(null);
    const modalRef = useRef(null);

    useEffect(() => {
        Promise.all([
            fetch('/api/portfolio').then(r => r.json()).catch(() => []),
            fetch('/api/leads/config').then(r => r.json()).catch(() => ({})),
        ]).then(([port, emp]) => {
            setItems(Array.isArray(port) ? port : []);
            setEmpresa(emp || {});
        }).finally(() => setLoading(false));
    }, []);

    // Fechar modal com Escape
    useEffect(() => {
        if (!modal) return;
        const onKey = (e) => { if (e.key === 'Escape') setModal(null); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [modal]);

    const buildWaHref = useCallback((titulo) => {
        const tel = (empresa?.telefone || '').replace(/\D/g, '');
        if (!tel) return '#';
        const dest = tel.startsWith('55') ? tel : `55${tel}`;
        const nome = empresa?.nome || 'Studio Ornato';
        const msg = titulo
            ? `Olá! Vi o projeto *${titulo}* no portfolio do ${nome} e gostaria de conversar sobre algo similar. 🪵`
            : `Olá! Vi o portfolio do ${nome} e gostaria de solicitar um orçamento. 🪵`;
        return `https://wa.me/${dest}?text=${encodeURIComponent(msg)}`;
    }, [empresa]);

    const acc   = empresa?.landing_cor_destaque || '#C9A96E';
    const fundo = empresa?.landing_cor_fundo    || '#1E1917';
    const logo  = empresa?.logo_sistema || empresa?.logo_header_path || empresa?.landing_logo || null;
    const nome  = empresa?.nome || 'Studio Ornato';

    // Filtros com itens
    const ambientesDisponiveis = [
        'Todos',
        ...AMBIENTES.slice(1).filter(a => items.some(p => p.ambiente === a)),
    ];

    const filtered = filtro === 'Todos'
        ? items
        : items.filter(p => p.ambiente === filtro);

    return (
        <>
            <style>{buildCSS(acc, fundo)}</style>

            {/* ── Header ─────────────────────────────────────────── */}
            <header className="pf-header">
                {logo
                    ? <img src={logo} alt={nome} className="pf-logo" />
                    : <span className="pf-logo-text">{nome}</span>
                }
                <a
                    href={buildWaHref(null)}
                    target="_blank"
                    rel="noreferrer"
                    className="pf-wa-btn"
                >
                    <WaIcon className="pf-wa-icon" />
                    <span>Solicitar projeto</span>
                </a>
            </header>

            {/* ── Hero ───────────────────────────────────────────── */}
            <div className="pf-hero">
                <div className="pf-hero-tag">Nosso trabalho</div>
                <h1 className="pf-hero-title">Projetos que transformam<br />ambientes em experiências</h1>
                <p className="pf-hero-sub">
                    Marcenaria sob medida com acabamento premium.<br />
                    Cada projeto, único — feito especialmente para você.
                </p>
            </div>

            {/* ── Filtros ────────────────────────────────────────── */}
            {!loading && ambientesDisponiveis.length > 1 && (
                <div className="pf-filters">
                    {ambientesDisponiveis.map(a => (
                        <button
                            key={a}
                            className={`pf-pill${filtro === a ? ' active' : ''}`}
                            onClick={() => setFiltro(a)}
                        >
                            {a}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Grid ───────────────────────────────────────────── */}
            <div className="pf-grid-wrap">
                {loading ? (
                    <SkeletonGrid />
                ) : filtered.length === 0 ? (
                    <div className="pf-empty">
                        {items.length === 0
                            ? 'Nenhum projeto disponível ainda.'
                            : `Nenhum projeto de "${filtro}" ainda.`}
                    </div>
                ) : (
                    <>
                        {items.length > 0 && (
                            <p className="pf-count">
                                {filtered.length === items.length
                                    ? `${items.length} projeto${items.length !== 1 ? 's' : ''}`
                                    : `${filtered.length} de ${items.length} projetos`}
                            </p>
                        )}
                        <div className="pf-grid">
                            {filtered.map(item => (
                                <div
                                    key={item.id}
                                    className="pf-card"
                                    onClick={() => setModal(item)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && setModal(item)}
                                    aria-label={`Ver projeto: ${item.titulo || 'Sem título'}`}
                                >
                                    <img
                                        src={item.imagem}
                                        alt={item.titulo || 'Projeto'}
                                        loading="lazy"
                                    />
                                    <div className="pf-card-overlay">
                                        {item.titulo && (
                                            <div className="pf-card-title">{item.titulo}</div>
                                        )}
                                        {item.ambiente && (
                                            <div className="pf-card-amb">{item.ambiente}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* ── Footer ─────────────────────────────────────────── */}
            <footer className="pf-footer">
                {empresa?.instagram && (
                    <>
                        <a
                            href={`https://instagram.com/${empresa.instagram.replace('@', '')}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {empresa.instagram.startsWith('@') ? empresa.instagram : `@${empresa.instagram}`}
                        </a>
                        {' · '}
                    </>
                )}
                {nome} · Marcenaria sob medida
            </footer>

            {/* ── Modal ──────────────────────────────────────────── */}
            {modal && (
                <div
                    className="pf-modal-backdrop"
                    onClick={e => { if (e.target === e.currentTarget) setModal(null); }}
                    role="dialog"
                    aria-modal="true"
                    aria-label={modal.titulo || 'Detalhes do projeto'}
                >
                    <div className="pf-modal" ref={modalRef}>
                        {/* Imagem */}
                        <div className="pf-modal-img-wrap">
                            <img src={modal.imagem} alt={modal.titulo || 'Projeto'} />
                            <button
                                className="pf-modal-close"
                                onClick={() => setModal(null)}
                                aria-label="Fechar"
                            >
                                ×
                            </button>
                        </div>

                        {/* Detalhes */}
                        <div className="pf-modal-body">
                            {modal.ambiente && (
                                <div className="pf-modal-amb">{modal.ambiente}</div>
                            )}
                            {modal.titulo && (
                                <h2 className="pf-modal-title">{modal.titulo}</h2>
                            )}
                            {modal.designer && (
                                <p className="pf-modal-designer">Projeto por {modal.designer}</p>
                            )}
                            {modal.descricao && (
                                <p className="pf-modal-desc">{modal.descricao}</p>
                            )}

                            <a
                                href={buildWaHref(modal.titulo)}
                                target="_blank"
                                rel="noreferrer"
                                className="pf-modal-wa"
                                onClick={() => setModal(null)}
                            >
                                <WaIcon className="pf-wa-icon" />
                                Quero um projeto similar
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
