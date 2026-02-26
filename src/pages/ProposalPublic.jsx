import { useState, useEffect, useRef } from 'react';
import { Lock, Link as LinkIcon, Printer, CheckCircle2 } from 'lucide-react';

// ── ProposalPublic — exibe a proposta como clone do PDF + tracking ───────────
export default function ProposalPublic({ token }) {
    const [html, setHtml] = useState('');
    const [meta, setMeta] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const iframeRef = useRef(null);
    const heartbeatRef = useRef(null);
    const startTime = useRef(Date.now());

    // ── Carregar proposta ────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`/api/portal/public/${token}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) { setError(d.error); return; }
                setHtml(d.html_proposta || '');
                setMeta({ empresa_nome: d.empresa_nome, numero: d.numero, cliente_nome: d.cliente_nome, cor_primaria: d.cor_primaria || '#1B2A4A', cor_accent: d.cor_accent || '#C9A96E' });
            })
            .catch(() => setError('Não foi possível carregar a proposta'))
            .finally(() => setLoading(false));
    }, [token]);

    // ── Tracking: fingerprint + heartbeat ────────────────────────────────────
    useEffect(() => {
        if (!html || error) return;

        // Gerar fingerprint do dispositivo
        const fp = [
            navigator.userAgent,
            screen.width + 'x' + screen.height,
            navigator.language,
            new Date().getTimezoneOffset(),
        ].join('|');
        const fingerprint = btoa(fp).substring(0, 32);
        const resolucao = `${screen.width}x${screen.height}`;

        // Enviar fingerprint inicial
        fetch(`/api/portal/heartbeat/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolucao, fingerprint, tempo_pagina: 0, scroll_max: 0 }),
        }).catch(() => {});

        // Heartbeat a cada 30s
        heartbeatRef.current = setInterval(() => {
            const tempoSeg = Math.round((Date.now() - startTime.current) / 1000);

            // Calcular scroll do iframe
            let scrollPct = 0;
            try {
                const iframe = iframeRef.current;
                if (iframe?.contentDocument) {
                    const doc = iframe.contentDocument;
                    const scrollTop = doc.documentElement.scrollTop || doc.body.scrollTop;
                    const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
                    const clientHeight = doc.documentElement.clientHeight || doc.body.clientHeight;
                    if (scrollHeight > clientHeight) {
                        scrollPct = Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
                    }
                }
            } catch { /* cross-origin fallback */ }

            fetch(`/api/portal/heartbeat/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempo_pagina: tempoSeg, scroll_max: scrollPct, resolucao, fingerprint }),
            }).catch(() => {});
        }, 30000);

        // Enviar dados finais ao sair
        const onUnload = () => {
            const tempoSeg = Math.round((Date.now() - startTime.current) / 1000);
            navigator.sendBeacon(`/api/portal/heartbeat/${token}`, JSON.stringify({ tempo_pagina: tempoSeg, scroll_max: 0 }));
        };
        window.addEventListener('beforeunload', onUnload);

        return () => {
            clearInterval(heartbeatRef.current);
            window.removeEventListener('beforeunload', onUnload);
        };
    }, [html, error, token]);

    // ── Loading state ────────────────────────────────────────────────────────
    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#1B2A4A', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 16px' }} />
                <p>Carregando proposta...</p>
            </div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );

    // ── Error state ──────────────────────────────────────────────────────────
    if (error) return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
                <div style={{ width: 64, height: 64, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ef4444' }}>
                    <Lock size={28} />
                </div>
                <h2 style={{ color: '#1e293b', marginBottom: 8 }}>Link inválido ou expirado</h2>
                <p style={{ color: '#64748b', fontSize: 14 }}>{error}</p>
            </div>
        </div>
    );

    // ── Sem HTML (proposta antiga sem HTML salvo) ────────────────────────────
    if (!html) return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
            <div style={{ textAlign: 'center', maxWidth: 450, padding: 32 }}>
                <div style={{ width: 64, height: 64, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>📄</div>
                <h2 style={{ color: '#1e293b', marginBottom: 8 }}>Proposta pendente</h2>
                <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
                    Esta proposta ainda não foi publicada. Solicite ao responsável que gere a proposta novamente para disponibilizar o conteúdo neste link.
                </p>
                {meta && (
                    <div style={{ marginTop: 20, padding: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'left' }}>
                        {meta.empresa_nome && <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{meta.empresa_nome}</div>}
                        {meta.numero && <div style={{ fontSize: 13, color: '#64748b' }}>Proposta Nº {meta.numero}</div>}
                        {meta.cliente_nome && <div style={{ fontSize: 13, color: '#64748b' }}>Cliente: {meta.cliente_nome}</div>}
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
            `}</style>

            {/* Barra de ações (fixa no topo) */}
            <div className="no-print" style={{
                position: 'sticky', top: 0, zIndex: 100,
                background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)',
                borderBottom: `3px solid ${meta?.cor_primaria || '#1B2A4A'}`,
                padding: '12px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                        {meta?.empresa_nome || 'Proposta Comercial'}
                    </span>
                    {meta?.numero && <span style={{ fontSize: 11, color: meta?.cor_primaria || '#64748b', background: `${meta?.cor_primaria || '#64748b'}10`, padding: '3px 10px', borderRadius: 12, fontWeight: 600, border: `1px solid ${meta?.cor_primaria || '#64748b'}25` }}>Nº {meta.numero}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={copyLink} style={{
                        background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        {copied ? <><CheckCircle2 size={12} /> Copiado!</> : <><LinkIcon size={12} /> Copiar link</>}
                    </button>
                    <a href={waUrl} target="_blank" rel="noreferrer" style={{
                        background: '#22c55e', color: '#fff', border: 'none', textDecoration: 'none',
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M5.337 21.672L.4 24l2.433-5.15A11.934 11.934 0 0 1 .001 12C.001 5.374 5.374 0 12 0s12 5.373 12 12c0 6.628-5.373 12-12 12a11.96 11.96 0 0 1-6.663-2.328z" /></svg>
                        WhatsApp
                    </a>
                    <button onClick={printProposta} style={{
                        background: meta?.cor_primaria || '#1B2A4A', color: '#fff', border: 'none',
                        padding: '6px 16px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        <Printer size={12} /> Imprimir / PDF
                    </button>
                </div>
            </div>

            {/* Proposta renderizada em iframe (HTML standalone) */}
            <div className="prop-frame" style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
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

                        // Injetar CSS de tela (o HTML original usa @page margins que só funcionam em print)
                        const style = doc.createElement('style');
                        style.textContent = `
                            @media screen {
                                body {
                                    padding: 40px 50px 60px !important;
                                    max-width: 860px;
                                    margin: 0 auto !important;
                                }
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
                    }}
                />
            </div>

            {/* Rodapé */}
            <div className="no-print" style={{ textAlign: 'center', padding: '16px 0 32px', fontSize: 11, color: '#94a3b8' }}>
                Proposta gerada pelo sistema Ornato ERP
            </div>
        </div>
    );
}
