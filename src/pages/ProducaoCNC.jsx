// ═══════════════════════════════════════════════════════════════════════
// Produção CNC — Shell
// ═══════════════════════════════════════════════════════════════════════
// Esta página foi dividida em subarquivos dentro de ./ProducaoCNC/.
// Aqui fica apenas o shell: header, tabs nível 1/2, alertas e orquestração.
// As tabs pesadas (TabPlano, TabPecas, TabConfig) são carregadas via
// React.lazy pra reduzir o bundle inicial da rota.
//
// Layout dos arquivos:
//   ./ProducaoCNC/
//       shared/           (LoteSelector, InfoCard, BarcodeSVG, printing/*)
//       tabs/             (TabImportar, TabLotes, TabDashboard, TabRetalhos,
//                          TabEtiquetas, TabGcode, TabPecas, _RelatorioDesperdicio)
//       tabs/TabPlano/    (index + renderMachining + GcodeSim + Modals + helpers)
//       tabs/TabConfig/   (index + CfgChapas/Maquinas/Ferramentas/Usinagem/...)
//       _deprecated/      (TabMateriais, TabUsinagens — não renderizados)
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import api from '../api';
import { PageHeader, TabBar, Spinner } from '../ui';
import {
    Upload, Package, BarChart3, Box, Settings, Layers, Scissors, Cpu,
    ArrowLeft, AlertTriangle, GitCompare, ChevronDown, ShieldAlert, X, QrCode,
} from 'lucide-react';
import useWebSocket from '../hooks/useWebSocket';
import EditorEtiquetas from '../components/EditorEtiquetas';

// ── Shared constants (tab IDs + cores de status) ──────────
import { TABS_MAIN, TABS_LOTE, STATUS_COLORS } from './ProducaoCNC/shared/constants.js';

// ── Tabs — lazy (não carrega o código até precisar) ───────
const TabImportar  = lazy(() => import('./ProducaoCNC/tabs/TabImportar.jsx').then(m => ({ default: m.TabImportar })));
const TabLotes     = lazy(() => import('./ProducaoCNC/tabs/TabLotes.jsx').then(m => ({ default: m.TabLotes })));
const TabDashboard = lazy(() => import('./ProducaoCNC/tabs/TabDashboard.jsx').then(m => ({ default: m.TabDashboard })));
const TabRetalhos  = lazy(() => import('./ProducaoCNC/tabs/TabRetalhos.jsx').then(m => ({ default: m.TabRetalhos })));
const TabPecas     = lazy(() => import('./ProducaoCNC/tabs/TabPecas.jsx').then(m => ({ default: m.TabPecas })));
const TabPlano     = lazy(() => import('./ProducaoCNC/tabs/TabPlano/index.jsx').then(m => ({ default: m.TabPlano })));
const TabEtiquetas = lazy(() => import('./ProducaoCNC/tabs/TabEtiquetas.jsx').then(m => ({ default: m.TabEtiquetas })));
const TabGcode     = lazy(() => import('./ProducaoCNC/tabs/TabGcode.jsx').then(m => ({ default: m.TabGcode })));
const TabConfig    = lazy(() => import('./ProducaoCNC/tabs/TabConfig/index.jsx').then(m => ({ default: m.TabConfig })));

// ── Modais pesados (three.js + CSG + html5-qrcode) ────────
const Piece3DModal = lazy(() => import('../modules/digital-twin/components/modals/Piece3DModal.jsx').then(m => ({ default: m.Piece3DModal })));
const QRScanModal  = lazy(() => import('../modules/digital-twin/components/modals/QRScanModal.jsx').then(m => ({ default: m.QRScanModal })));

// Fallback enquanto a tab lazy carrega — usa o Spinner padrão do sistema
const TabFallback = () => (
    <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
        <Spinner size={24} />
    </div>
);

export default function ProducaoCNC({ notify }) {
    const [tab, setTab] = useState('importar');
    const [lotes, setLotes] = useState([]);
    const [loteAtual, setLoteAtual] = useState(null);
    const [editorMode, setEditorMode] = useState(false);
    const [editorTemplateId, setEditorTemplateId] = useState(null);
    const [configSection, setConfigSection] = useState('maquinas');
    const [toolAlerts, setToolAlerts] = useState([]);
    const [materialAlerts, setMaterialAlerts] = useState([]);
    const [materialAlertsDismissed, setMaterialAlertsDismissed] = useState(false);
    const [sugestoes, setSugestoes] = useState([]);
    const [sugestoesOpen, setSugestoesOpen] = useState(false);

    // Digital Twin — modais embutidos (3D CSG real + scanner QR)
    const [modal3DPeca, setModal3DPeca] = useState(null);
    const [modalScanOpen, setModalScanOpen] = useState(false);

    // WebSocket real-time (#23) + Push Notifications (#35)
    useWebSocket(useCallback((msg) => {
        if (msg.type === 'gcode_complete' && msg.data?.message) {
            notify?.(msg.data.message, 'success');
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Ornato CNC', { body: msg.data.message, icon: '/favicon.ico' });
            }
        }
        if (msg.type === 'entrega_update' && msg.data) {
            notify?.(`Entrega: ${msg.data.tipo} — Lote #${msg.data.lote_id}`, 'success');
        }
    }, [notify]));

    const loadLotes = useCallback(() => {
        api.get('/cnc/lotes').then(setLotes).catch(e => notify?.(e.error || 'Erro ao carregar lotes'));
    }, [notify]);

    const loadToolAlerts = useCallback(() => {
        api.get('/cnc/ferramentas/alertas').then(setToolAlerts).catch(() => {});
    }, []);

    useEffect(() => { loadLotes(); loadToolAlerts(); }, [loadLotes, loadToolAlerts]);

    // Abrir lote = entrar no workspace do lote
    const abrirLote = useCallback((lote, aba = 'pecas') => {
        setLoteAtual(lote);
        setTab(aba);
        setMaterialAlertsDismissed(false);
        api.get(`/cnc/alertas-material?lote_id=${lote.id}`).then(r => {
            const alerts = (r.alertas || []).filter(a => a.chapas_necessarias > (a.estoque_chapas + a.retalhos_disponiveis));
            setMaterialAlerts(alerts);
        }).catch(() => setMaterialAlerts([]));
        api.get(`/cnc/sugestao-agrupamento/${lote.id}`).then(r => {
            setSugestoes(r.sugestoes || []);
        }).catch(() => setSugestoes([]));
    }, []);

    const voltarLotes = useCallback(() => {
        setLoteAtual(null);
        setTab('lotes');
        setMaterialAlerts([]);
        setSugestoes([]);
        setSugestoesOpen(false);
    }, []);

    const isInsideLote = loteAtual && ['pecas', 'plano', 'etiquetas', 'gcode'].includes(tab);

    // ── MODO EDITOR FULL-SCREEN (editor de etiquetas) ─────
    if (editorMode) {
        return (
            <div className="w-full page-enter" style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <EditorEtiquetas
                        api={api}
                        notify={notify}
                        initialTemplateId={editorTemplateId}
                        onBack={() => { setEditorMode(false); setEditorTemplateId(null); setConfigSection('etiquetas'); }}
                    />
                </div>
            </div>
        );
    }

    // ── MODO NORMAL ───────────────────────────────────────
    return (
        <div className="w-full page-enter" style={{ padding: '8px 12px 12px' }}>
            <PageHeader icon={Cpu} title="Produção CNC" subtitle="Importar JSON, otimizar corte, etiquetas e G-code">
                <button
                    onClick={() => setModalScanOpen(true)}
                    title="Escanear QR de uma peça para ver 3D/G-Code"
                    className="btn-secondary"
                    style={{ fontSize: 13, fontWeight: 600, gap: 8 }}
                >
                    <QrCode size={16} />
                    Escanear Peça
                </button>
            </PageHeader>

            {/* Alerta global de desgaste de ferramentas */}
            {toolAlerts.length > 0 && (
                <div className="alert-banner alert-banner-error" style={{ marginBottom: 12 }}>
                    <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ flex: 1 }}>
                        <b>{toolAlerts.length} ferramenta(s)</b> com desgaste acima de 80%:
                        {' '}{toolAlerts.slice(0, 3).map(t => `${t.nome} (${t.percentage}%)`).join(', ')}
                        {toolAlerts.length > 3 && ` e mais ${toolAlerts.length - 3}...`}
                    </span>
                    <button
                        onClick={() => { setTab('config'); setConfigSection('maquinas'); }}
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap', minHeight: 0 }}
                    >
                        Ver Ferramentas
                    </button>
                </div>
            )}

            {/* Nível 1 — Tab bar principal */}
            <TabBar
                tabs={TABS_MAIN.map(t => ({ id: t.id, label: t.lb, icon: t.ic }))}
                active={!isInsideLote ? tab : null}
                onChange={(id) => { setTab(id); if (id !== 'config') setLoteAtual(null); }}
            />

            {/* Nível 2 — Workspace do lote (aparece só com lote aberto) */}
            {isInsideLote && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    borderBottom: '2px solid var(--border)', marginBottom: 20,
                    background: 'var(--bg-muted)', borderRadius: '8px 8px 0 0',
                }}>
                    <button
                        onClick={voltarLotes}
                        className="btn-secondary"
                        style={{
                            borderRadius: '8px 0 0 0', border: 'none',
                            borderRight: '1px solid var(--border)',
                            padding: '8px 14px', fontSize: 12, gap: 6, minHeight: 0,
                        }}
                    >
                        <ArrowLeft size={14} />
                        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {loteAtual.nome || `Lote #${loteAtual.id}`}
                        </span>
                    </button>

                    {TABS_LOTE.map((t, idx) => {
                        const active = tab === t.id;
                        const I = t.ic;
                        const stepIdx = TABS_LOTE.findIndex(x => x.id === tab);
                        const isDone = idx < stepIdx;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                                    fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                                    color: active ? 'var(--primary)' : isDone ? 'var(--success, #22c55e)' : 'var(--text-muted)',
                                    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                                    background: 'none', border: 'none',
                                    borderBottomWidth: 2, borderBottomStyle: 'solid',
                                    marginBottom: -2, whiteSpace: 'nowrap', transition: 'all .15s',
                                    fontFamily: 'var(--font-sans)',
                                }}
                            >
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 20, height: 20, borderRadius: '50%',
                                    fontSize: 10, fontWeight: 700,
                                    background: active ? 'var(--primary)' : isDone ? 'var(--success, #22c55e)' : 'transparent',
                                    color: (active || isDone) ? '#fff' : 'var(--text-muted)',
                                    border: `1.5px solid ${active ? 'var(--primary)' : isDone ? 'var(--success, #22c55e)' : 'var(--border)'}`,
                                    flexShrink: 0, transition: 'all .2s',
                                }}>
                                    {isDone ? '\u2713' : t.step}
                                </span>
                                <I size={13} />
                                <span>{t.lb}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Material stock alert banner */}
            {isInsideLote && materialAlerts.length > 0 && !materialAlertsDismissed && (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {materialAlerts.map((a, i) => {
                        const noStock = a.estoque_chapas === 0 && a.retalhos_disponiveis === 0;
                        return (
                            <div key={i} className={`alert-banner ${noStock ? 'alert-banner-error' : 'alert-banner-warning'}`}>
                                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span style={{ flex: 1 }}>
                                    <b>{a.material || a.material_code}</b>
                                    {' — precisa de '}<b>{a.chapas_necessarias}</b>{' chapa(s), '}
                                    {a.estoque_chapas > 0
                                        ? <>estoque: <b>{a.estoque_chapas}</b></>
                                        : <span style={{ fontWeight: 700 }}>sem estoque</span>}
                                    {a.retalhos_disponiveis > 0 && <>, retalhos: <b>{a.retalhos_disponiveis}</b></>}
                                    {noStock && <span style={{ fontWeight: 700, marginLeft: 6 }}>MATERIAL INDISPONÍVEL</span>}
                                </span>
                                {i === 0 && (
                                    <button
                                        onClick={() => setMaterialAlertsDismissed(true)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Grouping suggestions */}
            {isInsideLote && sugestoes.length > 0 && (
                <div className="glass-card" style={{ marginBottom: 12, overflow: 'hidden' }}>
                    <button
                        onClick={() => setSugestoesOpen(!sugestoesOpen)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                            borderBottom: sugestoesOpen ? '1px solid var(--border)' : 'none',
                        }}
                    >
                        <GitCompare size={14} style={{ color: 'var(--accent, #8b5cf6)' }} />
                        <span>Sugestões de Agrupamento</span>
                        <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--accent, #8b5cf6)', fontWeight: 700 }}>
                            {sugestoes.length} lote{sugestoes.length > 1 ? 's' : ''}
                        </span>
                        <ChevronDown size={13} style={{ marginLeft: 'auto', transition: 'transform .2s', transform: sugestoesOpen ? 'rotate(180deg)' : '' }} />
                    </button>
                    {sugestoesOpen && (
                        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                                Lotes que usam os mesmos materiais e podem ser otimizados juntos para reduzir desperdício:
                            </p>
                            {sugestoes.map((s, i) => (
                                <div
                                    key={i}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                                        background: 'var(--bg-muted)', borderRadius: 6, border: '1px solid var(--border)',
                                    }}
                                >
                                    <Package size={13} style={{ color: 'var(--accent, #8b5cf6)', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.lote_nome}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                            {s.pecas_count} peça(s) em comum
                                            {s.material_codes.length > 0 && ` — ${s.material_codes.join(', ')}`}
                                        </div>
                                    </div>
                                    {s.economia_estimada_pct > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, color: 'var(--success, #16a34a)',
                                            background: 'rgba(34,197,94,.1)', padding: '2px 6px', borderRadius: 4,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            -{s.economia_estimada_pct}% desperdício
                                        </span>
                                    )}
                                    <span style={{
                                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                        background: STATUS_COLORS[s.lote_status] || '#888', color: '#fff',
                                        fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap',
                                    }}>
                                        {s.lote_status}
                                    </span>
                                    <button
                                        onClick={() => abrirLote({ id: s.lote_id, nome: s.lote_nome }, 'plano')}
                                        className="btn-secondary"
                                        style={{ fontSize: 10, padding: '3px 8px', minHeight: 0 }}
                                    >
                                        Abrir
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Tabs — cada uma em seu próprio chunk lazy ═══ */}
            <Suspense fallback={<TabFallback />}>
                {tab === 'importar' && !isInsideLote && (
                    <TabImportar lotes={lotes} loadLotes={loadLotes} notify={notify} setLoteAtual={abrirLote} setTab={setTab} />
                )}
                {tab === 'lotes' && !isInsideLote && (
                    <TabLotes lotes={lotes} loadLotes={loadLotes} notify={notify} abrirLote={abrirLote} />
                )}
                {tab === 'dashboard' && !isInsideLote && (
                    <TabDashboard notify={notify} />
                )}
                {tab === 'retalhos' && !isInsideLote && (
                    <TabRetalhos notify={notify} />
                )}
                {tab === 'pecas' && isInsideLote && (
                    <TabPecas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} setTab={setTab} onOpen3DCSG={setModal3DPeca} />
                )}
                {tab === 'plano' && isInsideLote && (
                    <TabPlano lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} loadLotes={loadLotes} setTab={setTab} />
                )}
                {tab === 'etiquetas' && isInsideLote && (
                    <TabEtiquetas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />
                )}
                {tab === 'gcode' && isInsideLote && (
                    <TabGcode lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />
                )}
                {tab === 'config' && (
                    <TabConfig
                        notify={notify}
                        setEditorMode={setEditorMode}
                        setEditorTemplateId={setEditorTemplateId}
                        initialSection={configSection}
                        setConfigSection={setConfigSection}
                    />
                )}
            </Suspense>

            {/* ═══ Digital Twin — modais 3D CSG + Scanner QR (lazy) ═══ */}
            {(modal3DPeca || modalScanOpen) && (
                <Suspense fallback={null}>
                    {modal3DPeca && (
                        <Piece3DModal
                            peca={modal3DPeca}
                            onClose={() => setModal3DPeca(null)}
                        />
                    )}
                    {modalScanOpen && (
                        <QRScanModal
                            onClose={() => setModalScanOpen(false)}
                            notify={notify}
                        />
                    )}
                </Suspense>
            )}
        </div>
    );
}
