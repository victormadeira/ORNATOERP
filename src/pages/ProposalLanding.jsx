/**
 * ProposalLanding.jsx — Landing page da proposta comercial
 * Rota: /lp/TOKEN  (experiência completa antes do orçamento)
 * 5 seções: Capa Hero → Sobre → Portfolio → Processo → CTA
 */
import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';

const BASE = '/api';

/** Extrai o ID de uma URL do YouTube (youtu.be/ID ou ?v=ID) */
function getYouTubeId(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
        return u.searchParams.get('v') || null;
    } catch {
        return null;
    }
}

function ProposalLanding({ token }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    useEffect(() => {
        fetch(`${BASE}/portal/landing/${token}`)
            .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
            .then(setData)
            .catch(e => setErr(e.error || 'Link inválido ou expirado'))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e13' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #C9A96E', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
    );

    if (err) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e13', color: '#fff', flexDirection: 'column', gap: 12, padding: 24 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#C9A96E" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{err}</div>
        </div>
    );

    const { empresa, cliente_nome, numero, validade, portfolio, depoimentos, proposta_token } = data;
    const cp = empresa.cor_primaria || '#1B2A4A';
    const ca = empresa.cor_accent || '#C9A96E';
    const videoId        = getYouTubeId(empresa.video_url);
    const videoProcessoId = getYouTubeId(empresa.video_processo);

    const abrirProposta = () => {
        window.location.href = `/proposta/${proposta_token}`;
    };

    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

    const ETAPAS = [
        { n: '01', titulo: 'Briefing', desc: 'Entendemos suas necessidades, espaço e estilo de vida.' },
        { n: '02', titulo: 'Projeto', desc: 'Desenvolvemos o layout 3D e apresentamos para sua aprovação.' },
        { n: '03', titulo: 'Produção', desc: 'Fabricamos com máquinas CNC de precisão industrial.' },
        { n: '04', titulo: 'Entrega e montagem', desc: 'Instalação com equipe especializada, sem surpresas.' },
    ];

    return (
        <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#f1f5f9', minHeight: '100vh', background: '#0b0e13' }}>
            <style>{`
                * { box-sizing: border-box; margin: 0; padding: 0; }
                a { color: inherit; text-decoration: none; }
                .lp-fade { animation: fadeUp .6s ease both; }
                @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .lp-btn {
                    display: inline-flex; align-items: center; gap: 10px;
                    background: ${ca}; color: #111; font-weight: 700; font-size: 15px;
                    padding: 16px 36px; border-radius: 50px; border: none; cursor: pointer;
                    transition: transform .2s, box-shadow .2s; letter-spacing: .3px;
                    box-shadow: 0 8px 32px ${ca}40;
                }
                .lp-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 40px ${ca}60; }
                .lp-btn-ghost {
                    display: inline-flex; align-items: center; gap: 8px;
                    background: transparent; color: ${ca}; font-weight: 600; font-size: 14px;
                    padding: 12px 28px; border-radius: 50px; border: 2px solid ${ca}40; cursor: pointer;
                    transition: border-color .2s, background .2s;
                }
                .lp-btn-ghost:hover { border-color: ${ca}; background: ${ca}10; }
                .port-card { transition: transform .2s, box-shadow .2s; }
                .port-card:hover { transform: translateY(-4px); box-shadow: 0 16px 48px rgba(0,0,0,.5); }
                .depo-card { transition: transform .2s; }
                .depo-card:hover { transform: translateY(-2px); }
                @media (max-width: 768px) {
                    .sobre-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
                    .port-grid { grid-template-columns: repeat(2,1fr) !important; }
                    .etapa-grid { grid-template-columns: repeat(2,1fr) !important; }
                }
                @media (max-width: 640px) {
                    .hero-title { font-size: 30px !important; line-height: 1.2 !important; }
                    .hero-sub { font-size: 15px !important; }
                    .section-title { font-size: 26px !important; }
                    .port-grid { grid-template-columns: 1fr !important; }
                    .stat-grid { grid-template-columns: repeat(3,1fr) !important; }
                    .etapa-grid { grid-template-columns: 1fr !important; }
                    .etapa-arrow { display: none !important; }
                    .lp-section-pad { padding: 56px 20px !important; }
                    .lp-hero-pad { padding: 60px 20px 72px !important; }
                    .lp-cta-title { font-size: 32px !important; }
                    .lp-btn { padding: 14px 28px !important; font-size: 14px !important; }
                    .lp-processo-selos { gap: 20px !important; }
                    .port-card-img { height: 180px !important; }
                    .lp-header { padding: 16px 20px !important; }
                }
            `}</style>

            {/* ── HEADER ── */}
            <header className="lp-header" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {empresa.logo && (
                        <img src={empresa.logo} alt={empresa.nome} style={{ height: 36, objectFit: 'contain' }} />
                    )}
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{empresa.nome}</span>
                </div>
                <button className="lp-btn-ghost" onClick={abrirProposta}>Ver Proposta →</button>
            </header>

            {/* ── SEÇÃO 1: CAPA HERO ── */}
            <section className="lp-hero-pad" style={{ position: 'relative', padding: '80px 24px 100px', textAlign: 'center', overflow: 'hidden' }}>
                {/* Background gradient */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    background: `radial-gradient(ellipse 120% 80% at 50% 0%, ${cp}cc 0%, #0b0e13 70%)`,
                }} />
                <div style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto' }}>
                    <div className="lp-fade" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${ca}18`, border: `1px solid ${ca}40`, borderRadius: 50, padding: '6px 18px', fontSize: 12, fontWeight: 600, color: ca, marginBottom: 28, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Proposta Exclusiva Nº {numero}
                    </div>
                    <h1 className="lp-fade hero-title" style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.12, marginBottom: 20, color: '#fff', animationDelay: '.1s' }}>
                        Olá{cliente_nome ? `, ${cliente_nome.split(' ')[0]}` : ''}!<br />
                        <span style={{ color: ca }}>Seu projeto</span> está pronto.
                    </h1>
                    <p className="lp-fade hero-sub" style={{ fontSize: 19, color: '#94a3b8', lineHeight: 1.65, marginBottom: 40, animationDelay: '.2s' }}>
                        Preparamos uma proposta personalizada com tudo que você precisa para transformar seu espaço. Explore as seções abaixo e depois acesse o orçamento completo.
                    </p>
                    <div className="lp-fade" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', animationDelay: '.3s' }}>
                        <button className="lp-btn" onClick={abrirProposta}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Ver Orçamento Completo
                        </button>
                        <button className="lp-btn-ghost" onClick={() => document.getElementById('lp-sobre')?.scrollIntoView({ behavior: 'smooth' })}>
                            Conhecer a empresa ↓
                        </button>
                    </div>
                    {validade && (
                        <p style={{ marginTop: 24, fontSize: 12, color: '#64748b' }}>
                            Proposta válida até <strong style={{ color: '#94a3b8' }}>{fmtDate(validade)}</strong>
                        </p>
                    )}
                </div>
            </section>

            {/* ── SEÇÃO 2: SOBRE ── */}
            <section id="lp-sobre" className="lp-section-pad" style={{ padding: '80px 24px', background: `${cp}18`, borderTop: `1px solid ${cp}40`, borderBottom: `1px solid ${cp}40` }}>
                <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    {/* Topo: texto + vídeo (ou stats) lado a lado */}
                    <div className="sobre-grid" style={{ display: 'grid', gridTemplateColumns: videoId ? '1fr 1fr' : '1fr', gap: 60, alignItems: 'center', marginBottom: 48 }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: ca, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>Sobre nós</div>
                            <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, color: '#fff', marginBottom: 20, lineHeight: 1.2 }}>
                                Qualidade que você pode ver e tocar
                            </h2>
                            <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.7, marginBottom: 32 }}>
                                {empresa.texto_institucional || `A ${empresa.nome} transforma ambientes com marcenaria de alto padrão, unindo design contemporâneo, materiais de qualidade e acabamento impecável.`}
                            </p>
                            {(empresa.telefone || empresa.email) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {empresa.telefone && (
                                        <a href={`https://wa.me/55${empresa.telefone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#22c55e', fontSize: 14, fontWeight: 600 }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                            {empresa.telefone}
                                        </a>
                                    )}
                                    {empresa.email && (
                                        <a href={`mailto:${empresa.email}`} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontSize: 14 }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
                                            {empresa.email}
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Vídeo institucional (somente se configurado) */}
                        {videoId && (
                            <div style={{ borderRadius: 16, overflow: 'hidden', background: '#0b0e13', border: `1px solid ${cp}50`, boxShadow: `0 20px 60px rgba(0,0,0,0.4)` }}>
                                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                                    <iframe
                                        title="Vídeo institucional"
                                        src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&color=white`}
                                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stats — sempre em row abaixo do conteúdo */}
                    <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                        {[
                            { v: empresa.anos_experiencia || '10+', l: 'Anos de experiência' },
                            { v: empresa.projetos_entregues || '500+', l: 'Projetos entregues' },
                            { v: empresa.maquinas_industriais || '12', l: 'Máquinas industriais' },
                        ].map((s, i) => (
                            <div key={i} style={{ background: '#13182280', border: `1px solid ${cp}50`, borderRadius: 16, padding: '24px 16px', textAlign: 'center' }}>
                                <div style={{ fontSize: 36, fontWeight: 800, color: ca, lineHeight: 1 }}>{s.v}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 8, lineHeight: 1.4 }}>{s.l}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── SEÇÃO 3: PORTFOLIO ── */}
            {portfolio && portfolio.length > 0 && (
                <section className="lp-section-pad" style={{ padding: '80px 24px' }}>
                    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                        <div style={{ textAlign: 'center', marginBottom: 48 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: ca, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Portfolio</div>
                            <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, color: '#fff' }}>Projetos realizados</h2>
                            <p style={{ fontSize: 16, color: '#64748b', marginTop: 12 }}>Cada projeto é único, como seu espaço.</p>
                        </div>
                        <div className="port-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
                            {portfolio.slice(0, 6).map((p, i) => (
                                <div key={p.id || i} className="port-card" style={{ borderRadius: 16, overflow: 'hidden', background: '#13182280', border: '1px solid #ffffff12' }}>
                                    {p.imagem && (
                                        <div className="port-card-img" style={{ height: 220, overflow: 'hidden' }}>
                                            <img src={p.imagem} alt={p.titulo || 'Projeto'} loading="lazy" decoding="async"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .4s' }}
                                                onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                                                onMouseLeave={e => e.target.style.transform = 'scale(1)'} />
                                        </div>
                                    )}
                                    <div style={{ padding: '16px 18px' }}>
                                        {p.titulo && <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{p.titulo}</div>}
                                        {p.descricao && <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{p.descricao}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── SEÇÃO 4: PROCESSO ── */}
            <section className="lp-section-pad" style={{ padding: '80px 24px', background: '#111827' }}>
                <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: ca, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Como trabalhamos</div>
                        <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, color: '#fff' }}>Do briefing à entrega</h2>
                    </div>
                    <div className="etapa-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
                        {ETAPAS.map((e, i) => (
                            <div key={i} style={{ position: 'relative', padding: '32px 24px', background: '#13182280', border: '1px solid #ffffff10', borderRadius: 20 }}>
                                <div style={{ fontSize: 48, fontWeight: 900, color: `${ca}30`, lineHeight: 1, marginBottom: 16 }}>{e.n}</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{e.titulo}</div>
                                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{e.desc}</div>
                                {i < ETAPAS.length - 1 && (
                                    <div className="etapa-arrow" style={{ position: 'absolute', top: '50%', right: -12, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ca, fontSize: 18, transform: 'translateY(-50%)' }}>›</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── SEÇÃO 4b: VÍDEO DO PROCESSO ── */}
            {videoProcessoId && (
                <section className="lp-section-pad" style={{ padding: '80px 24px', background: '#0b0e13', position: 'relative', overflow: 'hidden' }}>
                    {/* Glow de fundo */}
                    <div style={{
                        position: 'absolute', inset: 0, pointerEvents: 'none',
                        background: `radial-gradient(ellipse 70% 60% at 50% 100%, ${cp}55 0%, transparent 70%)`,
                    }} />
                    <div style={{ position: 'relative', maxWidth: 860, margin: '0 auto' }}>
                        {/* Label + título */}
                        <div style={{ textAlign: 'center', marginBottom: 40 }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${ca}18`, border: `1px solid ${ca}40`, borderRadius: 50, padding: '5px 16px', fontSize: 11, fontWeight: 700, color: ca, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>
                                ▶ Tour pela fábrica
                            </div>
                            <h2 className="section-title" style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                                Veja como seu móvel<br />
                                <span style={{ color: ca }}>é fabricado</span>
                            </h2>
                            <p style={{ fontSize: 15, color: '#64748b', marginTop: 14, lineHeight: 1.6 }}>
                                Da matéria-prima ao acabamento — precisão industrial em cada etapa.
                            </p>
                        </div>

                        {/* Player */}
                        <div style={{
                            borderRadius: 20, overflow: 'hidden',
                            border: `1px solid ${ca}25`,
                            boxShadow: `0 0 0 1px ${cp}40, 0 32px 80px rgba(0,0,0,0.6), 0 0 60px ${cp}30`,
                            position: 'relative',
                        }}>
                            {/* Barra decorativa superior */}
                            <div style={{ height: 3, background: `linear-gradient(90deg, ${cp}, ${ca}, ${cp})` }} />
                            <div style={{ position: 'relative', paddingBottom: '56.25%', background: '#000' }}>
                                <iframe
                                    title="Processo de fabricação"
                                    src={`https://www.youtube.com/embed/${videoProcessoId}?rel=0&modestbranding=1&color=white`}
                                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            </div>
                        </div>

                        {/* Selos abaixo do vídeo */}
                        <div className="lp-processo-selos" style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 36, flexWrap: 'wrap' }}>
                            {[
                                { icon: '🏭', label: 'Fábrica própria' },
                                { icon: '⚙️', label: 'CNC de precisão' },
                                { icon: '✅', label: 'Controle de qualidade' },
                            ].map((s, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8' }}>
                                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                                    <span>{s.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── DEPOIMENTOS (se houver) ── */}
            {depoimentos && depoimentos.length > 0 && (
                <section className="lp-section-pad" style={{ padding: '80px 24px' }}>
                    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                        <div style={{ textAlign: 'center', marginBottom: 48 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: ca, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Depoimentos</div>
                            <h2 className="section-title" style={{ fontSize: 38, fontWeight: 800, color: '#fff' }}>O que dizem nossos clientes</h2>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
                            {depoimentos.slice(0, 4).map((d, i) => (
                                <div key={d.id || i} className="depo-card" style={{ background: '#13182280', border: '1px solid #ffffff10', borderRadius: 20, padding: '28px 24px' }}>
                                    <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                                        {Array.from({ length: d.estrelas || 5 }).map((_, j) => (
                                            <Star key={j} size={14} fill={ca} stroke={ca} />
                                        ))}
                                    </div>
                                    <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, marginBottom: 16, fontStyle: 'italic' }}>"{d.texto}"</p>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>— {d.nome_cliente}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── SEÇÃO 5: CTA ── */}
            <section className="lp-section-pad" style={{ padding: '100px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                    position: 'absolute', inset: 0,
                    background: `radial-gradient(ellipse 100% 100% at 50% 100%, ${cp}aa, transparent 70%)`,
                    pointerEvents: 'none',
                }} />
                <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: ca, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>Proposta exclusiva</div>
                    <h2 className="lp-cta-title" style={{ fontSize: 44, fontWeight: 800, color: '#fff', marginBottom: 20, lineHeight: 1.15 }}>
                        Pronto para{' '}
                        <span style={{ color: ca }}>transformar</span>
                        <br />seu ambiente?
                    </h2>
                    <p style={{ fontSize: 17, color: '#94a3b8', marginBottom: 40, lineHeight: 1.6 }}>
                        Seu orçamento personalizado está aguardando. Acesse agora, revise os detalhes e aprove com assinatura digital.
                    </p>
                    <button className="lp-btn" onClick={abrirProposta} style={{ fontSize: 17, padding: '18px 44px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        Acessar meu orçamento
                    </button>
                    {empresa.telefone && (
                        <div style={{ marginTop: 28, fontSize: 13, color: '#475569' }}>
                            Dúvidas?{' '}
                            <a href={`https://wa.me/55${empresa.telefone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                                style={{ color: '#22c55e', fontWeight: 600 }}>
                                Fale conosco pelo WhatsApp
                            </a>
                        </div>
                    )}
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer style={{ padding: '24px', borderTop: '1px solid #ffffff10', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#334155' }}>
                    © {new Date().getFullYear()} {empresa.nome}. Proposta gerada pelo sistema Ornato ERP.
                </p>
            </footer>
        </div>
    );
}

export default ProposalLanding;
