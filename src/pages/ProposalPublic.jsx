import { useState, useEffect, useRef } from 'react';
import { Lock, Link as LinkIcon, Printer, CheckCircle2, FileText } from 'lucide-react';

// ── ProposalPublic — exibe a proposta como clone do PDF + tracking ───────────
export default function ProposalPublic({ token, isPreview = false }) {
    const [html, setHtml] = useState('');
    const [meta, setMeta] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [aprovado, setAprovado] = useState(false);
    const [aprovando, setAprovando] = useState(false);
    const [aprovadoEm, setAprovadoEm] = useState(null);
    const [erroAprovacao, setErroAprovacao] = useState(null);
    const [aceiteCheck, setAceiteCheck] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [validade, setValidade] = useState(null);
    const [criadoEm, setCriadoEm] = useState(null);
    const iframeRef = useRef(null);
    const heartbeatRef = useRef(null);
    const startTime = useRef(Date.now());
    const sectionDataRef = useRef({});   // { section_id: { tempo: 0, entradas: 0, nome: '' } }
    const pendingEventsRef = useRef([]); // [{ tipo, secao, ts }]

    // ── Carregar proposta ────────────────────────────────────────────────────
    useEffect(() => {
        const authToken = localStorage.getItem('erp_token');
        const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};
        const endpoint = isPreview ? `/api/portal/preview/${token}` : `/api/portal/public/${token}`;
        fetch(endpoint, { headers: authHeaders })
            .then(r => r.json())
            .then(d => {
                if (d.error) { setError(d.error); return; }
                setHtml(d.html_proposta || '');
                setMeta({ empresa_nome: d.empresa_nome, numero: d.numero, cliente_nome: d.cliente_nome, cor_primaria: d.cor_primaria || '#1B2A4A', cor_accent: d.cor_accent || '#C9A96E' });
                if (d.aprovado_em) { setAprovado(true); setAprovadoEm(d.aprovado_em); }
                if (d.validade) setValidade(d.validade);
                if (d.criado_em) setCriadoEm(d.criado_em);
            })
            .catch(() => setError('Não foi possível carregar a proposta'))
            .finally(() => setLoading(false));
    }, [token, isPreview]);

    // ── Tracking: fingerprint + heartbeat + section observer + interações ──
    useEffect(() => {
        if (!html || error || isPreview) return; // Preview: sem tracking

        // Gerar fingerprint do dispositivo
        const fp = [
            navigator.userAgent,
            screen.width + 'x' + screen.height,
            navigator.language,
            new Date().getTimezoneOffset(),
        ].join('|');
        const fingerprint = btoa(fp).substring(0, 32);
        const resolucao = `${screen.width}x${screen.height}`;

        // Helper: coletar dados de seções + eventos para envio
        const collectPayload = (tempoSeg, scrollPct) => {
            const sections = { ...sectionDataRef.current };
            const eventos = pendingEventsRef.current.splice(0); // limpa após coleta
            return {
                tempo_pagina: tempoSeg, scroll_max: scrollPct, resolucao, fingerprint,
                ...(Object.keys(sections).length > 0 ? { sections } : {}),
                ...(eventos.length > 0 ? { eventos } : {}),
            };
        };

        // Headers com auth opcional (usuários logados não poluem estatísticas)
        const erpToken = localStorage.getItem('erp_token');
        const trackHeaders = { 'Content-Type': 'application/json', ...(erpToken ? { Authorization: `Bearer ${erpToken}` } : {}) };

        // Enviar fingerprint inicial
        fetch(`/api/portal/heartbeat/${token}`, {
            method: 'POST',
            headers: trackHeaders,
            body: JSON.stringify({ resolucao, fingerprint, tempo_pagina: 0, scroll_max: 0 }),
        }).catch(() => { /* tracking silencioso */ });

        // Heartbeat a cada 30s
        heartbeatRef.current = setInterval(() => {
            const tempoSeg = Math.round((Date.now() - startTime.current) / 1000);

            // Calcular scroll da página (iframe é full-height, quem scrolla é o window)
            let scrollPct = 0;
            try {
                const scrollTop = window.scrollY || document.documentElement.scrollTop;
                const scrollHeight = document.documentElement.scrollHeight;
                const clientHeight = window.innerHeight;
                if (scrollHeight > clientHeight) {
                    scrollPct = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
                }
            } catch { }

            fetch(`/api/portal/heartbeat/${token}`, {
                method: 'POST',
                headers: trackHeaders,
                body: JSON.stringify(collectPayload(tempoSeg, scrollPct)),
            }).catch(() => { /* tracking silencioso */ });
        }, 30000);

        // ── Detectar impressão (não rastrear usuários logados) ──
        const onBeforePrint = () => {
            if (erpToken) return; // usuário logado, não rastrear
            try {
                const blob = new Blob([JSON.stringify({ tipo: 'print' })], { type: 'application/json' });
                navigator.sendBeacon(`/api/portal/event/${token}`, blob);
            } catch { }
        };
        window.addEventListener('beforeprint', onBeforePrint);

        // Enviar dados finais ao sair (não rastrear usuários logados)
        const onUnload = () => {
            if (erpToken) return; // usuário logado, não rastrear
            const tempoSeg = Math.round((Date.now() - startTime.current) / 1000);
            const payload = collectPayload(tempoSeg, 0);
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon(`/api/portal/heartbeat/${token}`, blob);
        };
        window.addEventListener('beforeunload', onUnload);

        return () => {
            clearInterval(heartbeatRef.current);
            window.removeEventListener('beforeunload', onUnload);
            window.removeEventListener('beforeprint', onBeforePrint);
            if (iframeRef.current?._sectionCleanup) iframeRef.current._sectionCleanup();
        };
    }, [html, error, token, isPreview]);

    // ── Loading state ────────────────────────────────────────────────────────
    if (loading) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#1B2A4A', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 16px' }} />
                <p>Carregando proposta...</p>
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );

    // ── Error state ──────────────────────────────────────────────────────────
    if (error) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
                <div style={{ width: 64, height: 64, background: 'var(--danger-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--danger)' }}>
                    <Lock size={28} />
                </div>
                <h2 style={{ color: '#1e293b', marginBottom: 8 }}>Link inválido ou expirado</h2>
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>{error}</p>
            </div>
        </div>
    );

    // ── Sem HTML (proposta antiga sem HTML salvo) ────────────────────────────
    if (!html) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            <div style={{ textAlign: 'center', maxWidth: 450, padding: 32 }}>
                <div style={{ width: 64, height: 64, background: 'var(--warning-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><FileText size={28} style={{ color: 'var(--warning-hover)' }} /></div>
                <h2 style={{ color: '#1e293b', marginBottom: 8 }}>Proposta pendente</h2>
                <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
                    Esta proposta ainda não foi publicada. Solicite ao responsável que gere a proposta novamente para disponibilizar o conteúdo neste link.
                </p>
                {meta && (
                    <div style={{ marginTop: 20, padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'left' }}>
                        {meta.empresa_nome && <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{meta.empresa_nome}</div>}
                        {meta.numero && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Proposta Nº {meta.numero}</div>}
                        {meta.cliente_nome && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cliente: {meta.cliente_nome}</div>}
                    </div>
                )}
            </div>
        </div>
    );

    // ── Ações ────────────────────────────────────────────────────────────────
    const pageUrl = window.location.href;
    const waText = encodeURIComponent(`Olá! Segue a proposta comercial${meta?.empresa_nome ? ` da ${meta.empresa_nome}` : ''}: ${pageUrl}`);
    const waUrl = `https://wa.me/?text=${waText}`;
    const copyLink = () => { navigator.clipboard.writeText(pageUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };

    const printProposta = () => {
        // Enviar evento de print pelo botão (não em preview)
        if (!isPreview) { try { fetch(`/api/portal/event/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'print' }) }); } catch {} }
        try {
            const iframe = iframeRef.current;
            if (iframe?.contentWindow) iframe.contentWindow.print();
        } catch { window.print(); }
    };

    // ── Render: proposta em iframe ───────────────────────────────────────────
    return (
        <div style={{ minHeight: '100vh', background: '#e2e8f0', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            <style>{`
                @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
                .prop-frame { animation: fadeUp .4s ease; }
                @media print {
                    .no-print { display: none !important; }
                    .prop-frame { box-shadow: none !important; }
                }
                @keyframes confetti-fall {
                    0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
                }
                .confetti-piece {
                    position: absolute; width: 8px; height: 8px; border-radius: 2px;
                    animation: confetti-fall 2.5s ease-out forwards;
                }
                @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .approval-success { animation: scaleIn 0.4s ease; }
                @media (max-width: 560px) {
                    .action-bar-text { display: none !important; }
                    .action-bar-btn { padding: 6px 10px !important; min-width: 36px; justify-content: center; }
                }
            `}</style>

            {/* Banner de preview */}
            {isPreview && (
                <div className="no-print" style={{
                    background: 'linear-gradient(90deg, var(--warning), var(--warning-hover))', color: '#fff',
                    padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                    PREVIEW INTERNO — Estatísticas não são contabilizadas
                </div>
            )}

            {/* Barra de ações (fixa no topo) */}
            <div className="no-print" style={{
                position: 'sticky', top: 0, zIndex: 100,
                background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)',
                borderBottom: `3px solid ${meta?.cor_primaria || '#1B2A4A'}`,
                padding: '10px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                        {meta?.empresa_nome || 'Proposta Comercial'}
                    </span>
                    {meta?.numero && <span style={{ fontSize: 11, color: meta?.cor_primaria || 'var(--muted)', background: `${meta?.cor_primaria || 'var(--muted)'}10`, padding: '3px 10px', borderRadius: 12, fontWeight: 600, border: `1px solid ${meta?.cor_primaria || 'var(--muted)'}25` }}>Nº {meta.numero}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={copyLink} className="action-bar-btn" style={{
                        background: 'var(--muted-bg)', color: '#475569', border: '1px solid #e2e8f0',
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        {copied ? <><CheckCircle2 size={12} /> <span className="action-bar-text">Copiado!</span></> : <><LinkIcon size={12} /> <span className="action-bar-text">Copiar link</span></>}
                    </button>
                    <a href={waUrl} target="_blank" rel="noreferrer" style={{
                        background: 'var(--success)', color: '#fff', border: 'none', textDecoration: 'none',
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M5.337 21.672L.4 24l2.433-5.15A11.934 11.934 0 0 1 .001 12C.001 5.374 5.374 0 12 0s12 5.373 12 12c0 6.628-5.373 12-12 12a11.96 11.96 0 0 1-6.663-2.328z" /></svg>
                        WhatsApp
                    </a>
                    <button onClick={printProposta} className="action-bar-btn" style={{
                        background: meta?.cor_primaria || '#1B2A4A', color: '#fff', border: 'none',
                        padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        <Printer size={12} /> <span className="action-bar-text">Imprimir / PDF</span>
                    </button>
                </div>
            </div>

            {/* Proposta renderizada em iframe (HTML standalone) */}
            <div className="prop-frame" style={{ maxWidth: 900, margin: '16px auto', padding: '0 8px' }}>
                <iframe
                    ref={iframeRef}
                    srcDoc={html}
                    title="Proposta Comercial"
                    style={{
                        width: '100%', minHeight: 'calc(100vh - 120px)',
                        border: 'none', borderRadius: 12,
                        boxShadow: '0 4px 32px rgba(0,0,0,.12)',
                        background: '#fff',
                    }}
                    onLoad={() => {
                        const iframe = iframeRef.current;
                        if (!iframe?.contentDocument) return;
                        const doc = iframe.contentDocument;

                        // Injetar CSS de tela (complementa os estilos já embutidos no HTML)
                        const style = doc.createElement('style');
                        style.textContent = `
                            @media screen and (max-width: 640px) {
                                .header img, .wm img { max-width: 200px !important; }
                            }
                        `;
                        doc.head.appendChild(style);

                        // Auto-resize iframe para caber o conteúdo (com delay para CSS aplicar)
                        setTimeout(() => {
                            const body = doc.body;
                            const html = doc.documentElement;
                            const height = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);
                            iframe.style.height = (height + 60) + 'px';
                        }, 50);

                        // ── Injetar data-section em HTMLs antigos que não os têm ──
                        if (!doc.querySelector('[data-section]')) {
                            let ambIdx = 0;
                            doc.querySelectorAll('.amb-block').forEach(el => {
                                ambIdx++;
                                const title = el.querySelector('.amb-title') || el.querySelector('h2, h3');
                                const nome = title?.textContent?.trim() || `Ambiente ${ambIdx}`;
                                el.setAttribute('data-section', `amb_${ambIdx}`);
                                el.setAttribute('data-section-nome', nome);
                            });
                            const resumo = doc.querySelector('.resumo');
                            if (resumo) { resumo.setAttribute('data-section', 'resumo'); resumo.setAttribute('data-section-nome', 'Resumo Financeiro'); }
                            doc.querySelectorAll('.section').forEach(el => {
                                const txt = el.textContent?.toLowerCase() || '';
                                if (txt.includes('pagamento') || txt.includes('condição') || txt.includes('condicao')) {
                                    el.setAttribute('data-section', 'pagamento');
                                    el.setAttribute('data-section-nome', 'Condições de Pagamento');
                                } else if (txt.includes('consideraç') || txt.includes('observaç') || txt.includes('considerac')) {
                                    el.setAttribute('data-section', 'consideracoes');
                                    el.setAttribute('data-section-nome', 'Considerações Finais');
                                }
                            });
                        }

                        // ── Section tracking: scroll-based visibility ──
                        // (IntersectionObserver não funciona porque o iframe é full-height,
                        //  quem scrolla é o window pai, não o iframe)
                        try {
                            const sections = doc.querySelectorAll('[data-section]');
                            if (sections.length > 0) {
                                const visibleSections = new Set();
                                const prevVisible = new Set();

                                // Calcular quais seções estão visíveis no viewport do navegador
                                const updateVisibility = () => {
                                    const iframeRect = iframe.getBoundingClientRect();
                                    const vpH = window.innerHeight;
                                    const nowVisible = new Set();

                                    sections.forEach(el => {
                                        const sid = el.getAttribute('data-section');
                                        const elTop = iframeRect.top + el.offsetTop;
                                        const elBottom = elTop + el.offsetHeight;

                                        if (elBottom > 0 && elTop < vpH) {
                                            nowVisible.add(sid);
                                            if (!sectionDataRef.current[sid]) {
                                                sectionDataRef.current[sid] = {
                                                    tempo: 0, entradas: 0,
                                                    nome: el.getAttribute('data-section-nome') || '',
                                                };
                                            }
                                            // Contar entrada apenas na transição invisível→visível
                                            if (!prevVisible.has(sid)) {
                                                sectionDataRef.current[sid].entradas++;
                                            }
                                        }
                                    });

                                    visibleSections.clear();
                                    prevVisible.clear();
                                    nowVisible.forEach(sid => { visibleSections.add(sid); prevVisible.add(sid); });
                                };

                                // Throttle via requestAnimationFrame
                                let scrollRaf = null;
                                const onScroll = () => {
                                    if (scrollRaf) return;
                                    scrollRaf = requestAnimationFrame(() => { updateVisibility(); scrollRaf = null; });
                                };
                                window.addEventListener('scroll', onScroll, { passive: true });
                                window.addEventListener('resize', onScroll, { passive: true });
                                updateVisibility(); // checagem inicial

                                // Timer de 1s: incrementar tempo das seções visíveis
                                const sectionTimer = setInterval(() => {
                                    visibleSections.forEach(sid => {
                                        if (sectionDataRef.current[sid]) {
                                            sectionDataRef.current[sid].tempo++;
                                        }
                                    });
                                }, 1000);

                                iframe._sectionCleanup = () => {
                                    clearInterval(sectionTimer);
                                    window.removeEventListener('scroll', onScroll);
                                    window.removeEventListener('resize', onScroll);
                                    if (scrollRaf) cancelAnimationFrame(scrollRaf);
                                };
                            }

                            // ── Detecção de interações ──
                            // Seleção de texto
                            doc.addEventListener('mouseup', () => {
                                const sel = doc.getSelection();
                                if (sel && sel.toString().trim().length > 3) {
                                    // Identificar seção mais próxima
                                    let secao = '';
                                    let node = sel.anchorNode;
                                    while (node && node !== doc.body) {
                                        if (node.nodeType === 1 && node.getAttribute('data-section')) {
                                            secao = node.getAttribute('data-section-nome') || node.getAttribute('data-section');
                                            break;
                                        }
                                        node = node.parentNode;
                                    }
                                    pendingEventsRef.current.push({ tipo: 'text_select', secao, ts: Date.now() });
                                }
                            });

                            // Cópia de texto (Ctrl+C / Cmd+C)
                            doc.addEventListener('copy', () => {
                                const sel = doc.getSelection();
                                let secao = '';
                                if (sel?.anchorNode) {
                                    let node = sel.anchorNode;
                                    while (node && node !== doc.body) {
                                        if (node.nodeType === 1 && node.getAttribute('data-section')) {
                                            secao = node.getAttribute('data-section-nome') || node.getAttribute('data-section');
                                            break;
                                        }
                                        node = node.parentNode;
                                    }
                                }
                                pendingEventsRef.current.push({ tipo: 'copy', secao, ts: Date.now() });
                            });

                            // Zoom/pinch (mobile)
                            let lastPinchTs = 0;
                            doc.addEventListener('touchstart', (e) => {
                                if (e.touches.length >= 2 && Date.now() - lastPinchTs > 5000) {
                                    lastPinchTs = Date.now();
                                    pendingEventsRef.current.push({ tipo: 'zoom', secao: '', ts: Date.now() });
                                }
                            }, { passive: true });
                        } catch { /* tracking errors should not break the page */ }
                    }}
                />
            </div>

            {/* ─── Barra de Validade ─────────────────────────────── */}
            {!isPreview && validade && !aprovado && (() => {
                const now = new Date();
                const end = new Date(validade + 'T23:59:59');
                const start = criadoEm ? new Date(criadoEm) : new Date(end.getTime() - 15 * 86400000);
                const total = Math.max(1, end - start);
                const elapsed = Math.max(0, now - start);
                const remaining = Math.max(0, end - now);
                const pct = Math.min(100, (elapsed / total) * 100);
                const diasRestantes = Math.ceil(remaining / 86400000);
                const expirada = diasRestantes <= 0;
                const urgente = diasRestantes <= 3 && !expirada;
                const barColor = expirada ? 'var(--danger)' : urgente ? 'var(--warning)' : (meta?.cor_accent || '#C9A96E');
                const bgColor = expirada ? 'var(--danger-bg)' : urgente ? 'var(--warning-bg)' : 'var(--bg-muted)';
                const textColor = expirada ? 'var(--danger-hover)' : urgente ? 'var(--warning-hover)' : 'var(--muted)';
                return (
                    <div className="no-print" style={{ maxWidth: 900, margin: '0 auto 8px', padding: '0 8px' }}>
                        <div style={{
                            background: bgColor, borderRadius: 10, padding: '14px 20px',
                            border: `1px solid ${barColor}25`,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: textColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    {expirada ? 'Proposta expirada' : `Válida até ${new Date(validade + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>
                                    {expirada ? 'Expirada' : diasRestantes === 1 ? 'Último dia!' : `${diasRestantes} dias restantes`}
                                </span>
                            </div>
                            <div style={{ height: 6, background: `${barColor}18`, borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: 3, transition: 'width 0.6s ease',
                                    width: `${pct}%`,
                                    background: `linear-gradient(90deg, ${barColor}90, ${barColor})`,
                                }} />
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ─── Aceite Digital ─────────────────────────────────── */}
            {!isPreview && (
                <div className="no-print" style={{ maxWidth: 900, margin: '0 auto 16px', padding: '0 8px' }}>
                    {aprovado ? (
                        <div className="approval-success" style={{
                            background: 'var(--success-bg)', border: '1px solid #bbf7d0',
                            borderRadius: 12, padding: '32px 28px', textAlign: 'center',
                            boxShadow: '0 2px 12px rgba(34,197,94,0.08)',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            {/* Confetti */}
                            {showConfetti && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
                                    {Array.from({ length: 30 }).map((_, i) => (
                                        <div key={i} className="confetti-piece" style={{
                                            left: `${5 + Math.random() * 90}%`,
                                            top: `${-5 - Math.random() * 10}%`,
                                            background: ['var(--success)', 'var(--warning)', 'var(--info)', 'var(--danger)', '#a855f7', '#ec4899'][i % 6],
                                            width: 6 + Math.random() * 6, height: 6 + Math.random() * 4,
                                            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                                            animationDelay: `${Math.random() * 0.8}s`,
                                            animationDuration: `${2 + Math.random() * 1.5}s`,
                                        }} />
                                    ))}
                                </div>
                            )}
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%', background: 'var(--success)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 14px', boxShadow: '0 4px 16px rgba(34,197,94,0.25)',
                            }}>
                                <CheckCircle2 size={28} color="#fff" />
                            </div>
                            <h3 style={{ color: 'var(--success-hover)', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
                                Proposta Aprovada!
                            </h3>
                            <p style={{ color: 'var(--success-hover)', fontSize: 13, margin: '0 0 16px' }}>
                                Aprovada em {aprovadoEm ? new Date(aprovadoEm).toLocaleString('pt-BR') : '—'}
                            </p>
                            <div style={{
                                background: 'var(--success-bg)', borderRadius: 8, padding: '14px 20px',
                                maxWidth: 420, margin: '0 auto',
                                border: '1px solid #bbf7d0',
                            }}>
                                <p style={{ color: 'var(--success-hover)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                                    Nossa equipe entrará em contato em breve para dar início aos próximos passos do seu projeto.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff', border: `2px solid ${meta?.cor_primaria || '#1B2A4A'}20`,
                            borderRadius: 12, padding: '28px 28px', textAlign: 'center',
                            boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                        }}>
                            <h3 style={{ color: '#1e293b', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
                                Aprovar Proposta
                            </h3>
                            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 16px', maxWidth: 500, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
                                Revise todos os itens e, se estiver de acordo, confirme abaixo.
                            </p>
                            {/* Checkbox de confirmação */}
                            <label style={{
                                display: 'inline-flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                                maxWidth: 440, textAlign: 'left', margin: '0 auto 20px',
                                padding: '12px 16px', borderRadius: 8,
                                background: aceiteCheck ? 'var(--success-bg)' : 'var(--bg-muted)',
                                border: `1px solid ${aceiteCheck ? '#bbf7d0' : '#e2e8f0'}`,
                                transition: 'all 0.2s',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={aceiteCheck}
                                    onChange={e => setAceiteCheck(e.target.checked)}
                                    style={{ width: 18, height: 18, accentColor: 'var(--success)', marginTop: 1, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                                    Li e concordo com os termos desta proposta comercial.
                                </span>
                            </label>
                            <br />
                            {erroAprovacao && (
                                <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px', fontWeight: 500 }}>
                                    {erroAprovacao}
                                </p>
                            )}
                            <button
                                disabled={aprovando || !aceiteCheck}
                                onClick={async () => {
                                    setAprovando(true);
                                    setErroAprovacao(null);
                                    try {
                                        const r = await fetch(`/api/portal/aprovar/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                                        const d = await r.json();
                                        if (d.ok) {
                                            setAprovado(true);
                                            setAprovadoEm(d.aprovado_em || new Date().toISOString());
                                            setShowConfetti(true);
                                            setTimeout(() => setShowConfetti(false), 4000);
                                        }
                                        else { setErroAprovacao(d.error || 'Não foi possível aprovar. Tente novamente.'); }
                                    } catch {
                                        setErroAprovacao('Erro de conexão. Verifique sua internet e tente novamente.');
                                    }
                                    setAprovando(false);
                                }}
                                style={{
                                    background: !aceiteCheck ? '#cbd5e1' : aprovando ? 'var(--muted)' : 'var(--success)',
                                    color: '#fff', border: 'none', padding: '14px 40px',
                                    borderRadius: 10, fontSize: 15, fontWeight: 700,
                                    cursor: !aceiteCheck ? 'not-allowed' : aprovando ? 'wait' : 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    transition: 'all 0.2s',
                                    boxShadow: aceiteCheck && !aprovando ? '0 4px 12px rgba(34,197,94,0.3)' : 'none',
                                    opacity: !aceiteCheck ? 0.7 : 1,
                                }}
                            >
                                <CheckCircle2 size={18} />
                                {aprovando ? 'Processando...' : 'Aprovar Proposta'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Rodapé */}
            <div className="no-print" style={{ textAlign: 'center', padding: '16px 0 32px', fontSize: 11, color: 'var(--muted)' }}>
                Proposta gerada pelo sistema Ornato ERP
            </div>
        </div>
    );
}
