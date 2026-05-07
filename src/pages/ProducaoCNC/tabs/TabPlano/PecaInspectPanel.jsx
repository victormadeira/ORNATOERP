// ══════════════════════════════════════════════════════════════
// PecaInspectPanel — painel lateral unificado de inspeção de peça
// Tabs: Resumo | Usinagens | 3D | Etiqueta
// Abre ao clicar em uma peça no plano de corte
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import {
    X, Box, Wrench, Tag, Info, CheckCircle2, AlertTriangle,
    Printer, RotateCcw, FlipVertical2, Copy, ExternalLink,
    ChevronRight, RefreshCw
} from 'lucide-react';
import { createPortal } from 'react-dom';
import PecaViewer3D from '../../../../components/PecaViewer3D';
import api from '../../../../api';

// ─── Helpers ────────────────────────────────────────────────────
const FACE_LABEL = { A: 'Face A · Topo', B: 'Face B · Fundo' };

function TabButton({ id, label, icon: Icon, active, onClick, badge }) {
    return (
        <button
            onClick={() => onClick(id)}
            style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: active ? 700 : 500,
                background: 'none',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                transition: 'color .15s, border-color .15s',
                position: 'relative',
                whiteSpace: 'nowrap',
            }}
        >
            <Icon size={13} strokeWidth={active ? 2.4 : 2} />
            {label}
            {badge != null && (
                <span style={{
                    position: 'absolute', top: 4, right: 4,
                    minWidth: 14, height: 14, borderRadius: 7,
                    background: 'var(--primary)', color: '#fff',
                    fontSize: 8, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px',
                }}>
                    {badge}
                </span>
            )}
        </button>
    );
}

function InfoRow({ label, value, mono }) {
    if (!value && value !== 0) return null;
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
        </div>
    );
}

function PrintStatusBadge({ status, impressoes }) {
    if (!status) return (
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-muted)', color: 'var(--text-muted)', fontWeight: 600 }}>
            Não impressa
        </span>
    );
    const isRe = status === 'reimpressa' || impressoes > 1;
    return (
        <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
            background: isRe ? 'var(--warning-bg)' : 'var(--success-bg)',
            color: isRe ? 'var(--warning)' : 'var(--success)',
            border: `1px solid ${isRe ? 'var(--warning-border)' : 'var(--success-border)'}`,
            display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
            {isRe ? <AlertTriangle size={9} /> : <CheckCircle2 size={9} />}
            {isRe ? `Reimpressa (${impressoes}×)` : 'Impressa'}
        </span>
    );
}

// ─── Tab: Resumo ────────────────────────────────────────────────
function TabResumo({ piece, planPiece, chapaIdx, chapa }) {
    const lado = planPiece?.lado_ativo || 'A';
    const isRotated = planPiece?.rotated;
    const isLocked = planPiece?.locked;

    const bordas = [
        piece?.borda_frontal && { pos: 'Frontal', val: piece.borda_cor_frontal || piece.borda_frontal },
        piece?.borda_traseira && { pos: 'Traseira', val: piece.borda_cor_traseira || piece.borda_traseira },
        piece?.borda_esq && { pos: 'Esquerda', val: piece.borda_cor_esq || piece.borda_esq },
        piece?.borda_dir && { pos: 'Direita', val: piece.borda_cor_dir || piece.borda_dir },
    ].filter(Boolean);

    return (
        <div>
            {/* Face badge */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: lado === 'B' ? 'rgba(8,145,178,0.12)' : 'var(--primary-light)',
                    color: lado === 'B' ? 'var(--cnc-face-b, #0891b2)' : 'var(--primary)',
                    border: `1px solid ${lado === 'B' ? 'rgba(8,145,178,0.25)' : 'var(--primary-ring)'}`,
                }}>
                    {FACE_LABEL[lado] || `Face ${lado}`}
                </span>
                {isRotated && (
                    <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>
                        <RotateCcw size={10} style={{ display: 'inline', marginRight: 3 }} />Girado 90°
                    </span>
                )}
                {isLocked && (
                    <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        🔒 Bloqueado
                    </span>
                )}
            </div>

            {/* Dimensões */}
            <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Dimensões</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                    {piece?.comprimento} × {piece?.largura}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>× {piece?.espessura} mm</span>
                </div>
                {planPiece && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        Posição no plano: X={Math.round(planPiece.x)} Y={Math.round(planPiece.y)} mm · Chapa {(chapaIdx ?? 0) + 1}
                    </div>
                )}
            </div>

            {/* Info rows */}
            <div style={{ marginBottom: 14 }}>
                <InfoRow label="Material" value={piece?.material_code || piece?.material} />
                <InfoRow label="Módulo" value={piece?.modulo_desc} />
                <InfoRow label="Quantidade" value={piece?.quantidade} />
                <InfoRow label="Projeto" value={piece?.projeto_nome} />
                <InfoRow label="Cliente" value={piece?.cliente} />
                <InfoRow label="Acabamento" value={piece?.acabamento} />
                <InfoRow label="ID controle" value={piece?.persistent_id || piece?.upmcode} mono />
            </div>

            {/* Bordas */}
            {bordas.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Fitas de Borda</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {bordas.map((b, i) => (
                            <span key={i} style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 6,
                                background: 'var(--info-bg)', color: 'var(--info)',
                                border: '1px solid var(--info-border)', fontWeight: 600,
                            }}>
                                {b.pos}: {b.val}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Tab: Usinagens ─────────────────────────────────────────────
function TabUsinagens({ piece }) {
    const ops = (() => {
        try {
            const d = typeof piece?.machining_json === 'string'
                ? JSON.parse(piece.machining_json)
                : (piece?.machining_json || {});
            return d?.workers || [];
        } catch { return []; }
    })();

    const opsB = (() => {
        try {
            const d = typeof piece?.machining_json_b === 'string'
                ? JSON.parse(piece.machining_json_b)
                : (piece?.machining_json_b || {});
            return d?.workers || [];
        } catch { return []; }
    })();

    const CAT_COLOR = {
        hole: 'var(--danger)', slot: 'var(--warning)', pocket: 'var(--info)',
        milling: 'var(--primary)', contour: 'var(--success)', contorno: 'var(--success)',
        edge: 'var(--text-muted)',
    };

    const OpCard = ({ op, face }) => {
        const cat = op.category || op.tipo || 'hole';
        const color = CAT_COLOR[cat] || 'var(--primary)';
        const faceLabel = { top: 'Topo (A)', bottom: 'Fundo (B)', left: 'Lateral esq', right: 'Lateral dir', front: 'Frontal', rear: 'Traseira' }[op.face || op.quadrant] || (op.face || '—');
        return (
            <div style={{
                padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                background: 'var(--bg-muted)', border: `1px solid var(--border)`,
                borderLeft: `3px solid ${color}`,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{op.name || op.tipo || cat}</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${color}15`, color, fontWeight: 600 }}>
                        {faceLabel}
                    </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    {op.diameter && `⌀${op.diameter}mm`}
                    {op.depth && ` · prof ${op.depth}mm`}
                    {op.width && ` · larg ${op.width}mm`}
                    {op.posX != null && ` · X=${Math.round(op.posX)} Y=${Math.round(op.posY)}`}
                </div>
            </div>
        );
    };

    if (ops.length === 0 && opsB.length === 0) return (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <Wrench size={28} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.3 }} />
            Sem usinagens cadastradas
        </div>
    );

    return (
        <div>
            {ops.length > 0 && (
                <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)', marginBottom: 8 }}>
                        Face A · {ops.length} operação{ops.length > 1 ? 'ões' : ''}
                    </div>
                    {ops.map((op, i) => <OpCard key={i} op={op} face="A" />)}
                </>
            )}
            {opsB.length > 0 && (
                <>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cnc-face-b, #0891b2)', marginBottom: 8, marginTop: ops.length > 0 ? 14 : 0 }}>
                        Face B · {opsB.length} operação{opsB.length > 1 ? 'ões' : ''}
                    </div>
                    {opsB.map((op, i) => <OpCard key={i} op={op} face="B" />)}
                </>
            )}
        </div>
    );
}

// ─── Tab: 3D ────────────────────────────────────────────────────
function Tab3D({ piece }) {
    return (
        <div>
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12 }}>
                <PecaViewer3D peca={piece} width={440} height={340} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                Arraste para girar · Scroll para zoom · Duplo clique para reset
            </div>
        </div>
    );
}

// ─── Tab: Etiqueta ──────────────────────────────────────────────
function TabEtiqueta({ piece, loteAtual, printStatus, onMarkPrinted, onResetStatus, onGoToEtiquetas }) {
    const [printing, setPrinting] = useState(false);

    const handlePrintRapida = async () => {
        const pid = piece?.persistent_id || piece?.upmcode;
        if (!pid || !loteAtual?.id) return;
        const p = piece;
        const bordas = ['frontal', 'traseira', 'esq', 'dir'].map(s => {
            const v = p[`borda_${s}`], c = p[`borda_cor_${s}`];
            return v ? `${s}: ${c || v}` : null;
        }).filter(Boolean).join(' | ');

        const win = window.open('', '_blank', 'width=420,height=320');
        if (win) {
            win.document.write(`<html><head><style>
                body { font-family: Arial, sans-serif; padding: 10px; margin: 0; }
                .label { border: 2px solid #1379F0; padding: 10px; width: 100mm; border-radius: 4px; }
                .name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
                .dims { font-size: 13px; font-weight: 600; color: #1379F0; margin-bottom: 4px; }
                .info { font-size: 10px; color: #555; margin-bottom: 2px; }
                .ctrl { display: inline-block; background: #1379F0; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
                @media print { body { padding: 0; } }
            </style></head><body onload="window.print();window.close()">
                <div class="label">
                    <div class="name">${p.descricao}</div>
                    <div class="dims">${p.comprimento} × ${p.largura} × ${p.espessura} mm</div>
                    <div class="info">${p.material_code || p.material || ''} · ${p.modulo_desc || ''}</div>
                    <div class="info">Qtd: ${p.quantidade || 1} · <span class="ctrl">${p.persistent_id || p.upmcode || ''}</span></div>
                    ${bordas ? `<div class="info">Fitas: ${bordas}</div>` : ''}
                    ${p.projeto_nome ? `<div class="info">Projeto: ${p.projeto_nome}</div>` : ''}
                </div>
            </body></html>`);
            win.document.close();
        }

        // Marcar como impressa
        setPrinting(true);
        await onMarkPrinted([pid]);
        setPrinting(false);
    };

    const pid = piece?.persistent_id || piece?.upmcode;
    const status = printStatus?.[pid];

    return (
        <div>
            {/* Status atual */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Status da etiqueta</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PrintStatusBadge status={status?.status} impressoes={status?.impressoes} />
                    {status && (
                        <button
                            onClick={() => onResetStatus(pid)}
                            title="Resetar status"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                </div>
            </div>

            {status?.impresso_em && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 14, textAlign: 'right' }}>
                    Última impressão: {new Date(status.impresso_em).toLocaleString('pt-BR')}
                </div>
            )}

            {/* Prévia da etiqueta */}
            <div style={{
                padding: 14, borderRadius: 8, border: '2px solid var(--primary)',
                background: 'var(--bg-muted)', marginBottom: 16,
            }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {piece?.descricao}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace', marginBottom: 4 }}>
                    {piece?.comprimento} × {piece?.largura} × {piece?.espessura} mm
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {piece?.material_code} · {piece?.modulo_desc} · Qtd {piece?.quantidade || 1}
                </div>
                {pid && (
                    <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', display: 'inline-block', borderRadius: 4, background: 'var(--primary)', color: '#fff' }}>
                        {pid}
                    </div>
                )}
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                    onClick={handlePrintRapida}
                    disabled={printing}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '11px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 700,
                        opacity: printing ? 0.6 : 1, transition: 'opacity .15s',
                    }}
                >
                    <Printer size={14} />
                    {printing ? 'Marcando…' : status ? 'Reimprimir Etiqueta' : 'Imprimir Etiqueta'}
                </button>
                <button
                    onClick={onGoToEtiquetas}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '9px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        background: 'var(--bg-muted)', border: '1px solid var(--border)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                >
                    <Tag size={13} /> Abrir aba Etiquetas completa
                    <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
                </button>
            </div>
        </div>
    );
}

// ─── Painel principal ────────────────────────────────────────────
export function PecaInspectPanel({ isOpen, onClose, piece, planPiece, chapaIdx, chapa, loteAtual, initialTab = 'resumo', onGoToEtiquetas, setTab }) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [printStatus, setPrintStatus] = useState({});
    const [loadingStatus, setLoadingStatus] = useState(false);

    // Sync initialTab when it changes (e.g. open from 3D vs label)
    useEffect(() => { if (isOpen) setActiveTab(initialTab); }, [isOpen, initialTab]);

    // Load print status when panel opens
    useEffect(() => {
        if (!isOpen || !loteAtual?.id) return;
        setLoadingStatus(true);
        api.get(`/cnc/etiqueta-impressoes/${loteAtual.id}`)
            .then(data => setPrintStatus(data || {}))
            .catch(() => {})
            .finally(() => setLoadingStatus(false));
    }, [isOpen, loteAtual?.id]);

    const handleMarkPrinted = useCallback(async (pids) => {
        if (!loteAtual?.id) return;
        await api.post('/cnc/etiqueta-impressoes', { lote_id: loteAtual.id, persistent_ids: pids });
        // Refresh
        const data = await api.get(`/cnc/etiqueta-impressoes/${loteAtual.id}`);
        setPrintStatus(data || {});
    }, [loteAtual?.id]);

    const handleResetStatus = useCallback(async (pid) => {
        if (!loteAtual?.id || !pid) return;
        await api.delete(`/cnc/etiqueta-impressoes/${loteAtual.id}/${pid}`);
        const data = await api.get(`/cnc/etiqueta-impressoes/${loteAtual.id}`);
        setPrintStatus(data || {});
    }, [loteAtual?.id]);

    // ESC to close
    useEffect(() => {
        if (!isOpen) return;
        const fn = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [isOpen, onClose]);

    if (!isOpen || !piece) return null;

    const pid = piece?.persistent_id || piece?.upmcode;
    const pStatus = printStatus[pid];
    const opsCount = (() => {
        try { const d = typeof piece.machining_json === 'string' ? JSON.parse(piece.machining_json) : (piece.machining_json || {}); return (d.workers || []).length; } catch { return 0; }
    })();
    const opsBCount = (() => {
        try { const d = typeof piece.machining_json_b === 'string' ? JSON.parse(piece.machining_json_b) : (piece.machining_json_b || {}); return (d.workers || []).length; } catch { return 0; }
    })();

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none' }}>
            {/* Backdrop — leve, não bloqueia o plano */}
            <div
                onClick={onClose}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', animation: 'fadeIn .2s ease', pointerEvents: 'all' }}
            />
            {/* Panel */}
            <div style={{
                position: 'relative', width: '95vw', maxWidth: 500,
                height: '100vh', display: 'flex', flexDirection: 'column',
                background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
                boxShadow: '-6px 0 24px rgba(0,0,0,0.15)',
                animation: 'slideInRight .22s ease',
                pointerEvents: 'all',
            }}>
                {/* Header */}
                <div style={{
                    padding: '12px 16px 0', borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-muted)', flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {piece?.descricao || 'Peça'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {piece?.comprimento} × {piece?.largura} × {piece?.espessura} mm
                                {piece?.material_code && ` · ${piece.material_code}`}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            style={{ padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 0, overflow: 'hidden' }}>
                        <TabButton id="resumo"    label="Resumo"    icon={Info}   active={activeTab === 'resumo'}    onClick={setActiveTab} />
                        <TabButton id="usinagens" label="Usinagens" icon={Wrench} active={activeTab === 'usinagens'} onClick={setActiveTab} badge={opsCount + opsBCount || undefined} />
                        <TabButton id="3d"        label="3D"        icon={Box}    active={activeTab === '3d'}        onClick={setActiveTab} />
                        <TabButton id="etiqueta"  label="Etiqueta"  icon={Tag}    active={activeTab === 'etiqueta'}  onClick={setActiveTab}
                            badge={pStatus ? (pStatus.impressoes > 1 ? '↺' : '✓') : undefined}
                        />
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                    {activeTab === 'resumo' && (
                        <TabResumo piece={piece} planPiece={planPiece} chapaIdx={chapaIdx} chapa={chapa} />
                    )}
                    {activeTab === 'usinagens' && (
                        <TabUsinagens piece={piece} />
                    )}
                    {activeTab === '3d' && (
                        <Tab3D piece={piece} />
                    )}
                    {activeTab === 'etiqueta' && (
                        <TabEtiqueta
                            piece={piece}
                            loteAtual={loteAtual}
                            printStatus={printStatus}
                            onMarkPrinted={handleMarkPrinted}
                            onResetStatus={handleResetStatus}
                            onGoToEtiquetas={() => { onClose(); if (setTab) setTab('etiquetas'); }}
                        />
                    )}
                </div>
            </div>
            <style>{`
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>,
        document.body
    );
}
