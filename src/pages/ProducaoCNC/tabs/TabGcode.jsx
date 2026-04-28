// Tab "G-code / CNC" — geração + preview + simulação de percurso.
// Fase C: usa SectionHeader + TabBar + ConfirmModal + EmptyState do design system.

import { useState, useEffect, lazy, Suspense } from 'react';
import api from '../../../api';
import { Z, TabBar, SectionHeader, EmptyState, ConfirmModal } from '../../../ui';
import {
    Monitor, Cpu, Tag as TagIcon, AlertTriangle, CheckCircle2,
    X, Play, Download, ShieldCheck, FileCode2,
} from 'lucide-react';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../components/ToolpathSimulator';

// Sub-tab Etiquetas — lazy pra manter chunks separados.
const TabEtiquetas = lazy(() =>
    import('./TabEtiquetas.jsx').then(m => ({ default: m.TabEtiquetas }))
);

export function TabGcode({ lotes, loteAtual, setLoteAtual, notify }) {
    const [gcodeSubTab, setGcodeSubTab] = useState('gcode'); // 'gcode' | 'etiquetas'
    const [result, setResult] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [maquinas, setMaquinas] = useState([]);
    const [maquinaId, setMaquinaId] = useState('');
    const [gcodeValidation, setGcodeValidation] = useState(null);
    const [showGcodeConflicts, setShowGcodeConflicts] = useState(false);
    const [toolpathOpen, setToolpathOpen] = useState(false);
    const [toolpathMoves, setToolpathMoves] = useState([]);
    const [toolpathChapa, setToolpathChapa] = useState(null);
    const [pendingConfirm, setPendingConfirm] = useState(null); // { conflicts }

    // Carrega máquinas disponíveis uma vez.
    useEffect(() => {
        api.get('/cnc/maquinas').then(ms => {
            setMaquinas(ms);
            const padrao = ms.find(m => m.padrao);
            if (padrao) setMaquinaId(String(padrao.id));
            else if (ms.length > 0) setMaquinaId(String(ms[0].id));
        }).catch(e => notify(e.error || 'Erro ao carregar máquinas'));
    }, []);

    const maquinaSel = maquinas.find(m => String(m.id) === maquinaId);

    const doGerar = async () => {
        setGerando(true);
        try {
            const body = maquinaId ? { maquina_id: Number(maquinaId) } : {};
            const r = await api.post(`/cnc/gcode/${loteAtual.id}`, body);
            setResult(r);
            if (r.ok) notify(`G-code gerado: ${r.total_operacoes} operações`);
            else if (r.error) notify(r.error);
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setGerando(false);
            setPendingConfirm(null);
        }
    };

    const gerar = async () => {
        if (!loteAtual) return;
        // Pré-validação: avisa se há erros de usinagem conhecidos.
        try {
            const val = await api.get(`/cnc/validar-usinagens/${loteAtual.id}`);
            setGcodeValidation(val);
            const erros = (val.conflicts || []).filter(c => c.severidade === 'erro');
            if (erros.length > 0) {
                setShowGcodeConflicts(true);
                setPendingConfirm({ conflicts: erros });
                return;
            }
        } catch (err) {
            notify('Não foi possível validar usinagens antes de gerar o G-code. Corrija a conexão e tente novamente.');
            return;
        }
        doGerar();
    };

    const downloadGcode = () => {
        if (!result?.gcode) return;
        const ext = result.extensao || '.nc';
        const blob = new Blob([result.gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${loteAtual?.nome || 'lote'}${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sub-tabs — usando TabBar do design system */}
            <div style={{ marginBottom: -4 }}>
                <TabBar
                    tabs={[
                        { id: 'gcode', label: 'G-code / CNC', icon: Cpu },
                        { id: 'etiquetas', label: 'Etiquetas', icon: TagIcon },
                    ]}
                    active={gcodeSubTab}
                    onChange={setGcodeSubTab}
                />
            </div>

            {/* Etiquetas sub-tab (lazy) */}
            {gcodeSubTab === 'etiquetas' && (
                <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>}>
                    <TabEtiquetas
                        lotes={lotes}
                        loteAtual={loteAtual}
                        setLoteAtual={setLoteAtual}
                        notify={notify}
                    />
                </Suspense>
            )}

            {/* G-code sub-tab */}
            {gcodeSubTab === 'gcode' && (
                <>
                    {/* Seletor de máquina */}
                    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <SectionHeader
                            icon={Monitor}
                            title="Máquina CNC"
                            accent="var(--primary)"
                        />
                        <div style={{
                            padding: '14px 20px',
                            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                        }}>
                            <select
                                value={maquinaId}
                                onChange={e => { setMaquinaId(e.target.value); setResult(null); }}
                                className={Z.inp}
                                style={{ minWidth: 280, fontSize: 13 }}
                                aria-label="Selecionar máquina CNC"
                            >
                                {maquinas.length === 0 && <option value="">Nenhuma máquina cadastrada</option>}
                                {maquinas.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.nome}{m.fabricante ? ` (${m.fabricante} ${m.modelo})` : ''}
                                        {m.padrao ? ' [Padrão]' : ''} [{m.total_ferramentas} ferr.]
                                    </option>
                                ))}
                            </select>
                            {maquinaSel && (
                                <div style={{
                                    display: 'flex', gap: 6, fontSize: 11, flexWrap: 'wrap',
                                }}>
                                    <InfoChip label="Ext" value={maquinaSel.extensao_arquivo || '.nc'} />
                                    <InfoChip label="Tipo" value={maquinaSel.tipo_pos || 'generic'} />
                                    <InfoChip label="Área" value={`${maquinaSel.x_max}×${maquinaSel.y_max}mm`} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Conflitos pré-geração */}
                    {showGcodeConflicts && gcodeValidation?.conflicts?.length > 0 && (
                        <div className="glass-card" style={{
                            padding: 0, overflow: 'hidden',
                            borderLeft: '3px solid var(--danger)',
                        }}>
                            <SectionHeader
                                icon={AlertTriangle}
                                title={`Conflitos detectados (${gcodeValidation.conflicts.length})`}
                                accent="var(--danger)"
                            >
                                <button
                                    onClick={() => setShowGcodeConflicts(false)}
                                    aria-label="Fechar conflitos"
                                    style={{
                                        background: 'transparent', border: 'none',
                                        cursor: 'pointer', color: 'var(--text-muted)',
                                        padding: 4, borderRadius: 6,
                                        display: 'flex', alignItems: 'center',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <X size={14} />
                                </button>
                            </SectionHeader>
                            <div style={{
                                padding: '10px 20px',
                                maxHeight: 180, overflowY: 'auto',
                                display: 'flex', flexDirection: 'column', gap: 4,
                            }}>
                                {gcodeValidation.conflicts.map((c, i) => {
                                    const isErr = c.severidade === 'erro';
                                    return (
                                        <div key={i} style={{
                                            fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8,
                                            padding: '6px 8px', borderRadius: 6,
                                            background: isErr ? 'var(--danger-bg)' : 'var(--warning-bg)',
                                            border: `1px solid ${isErr ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                                        }}>
                                            <AlertTriangle
                                                size={12}
                                                style={{
                                                    flexShrink: 0, marginTop: 2,
                                                    color: isErr ? 'var(--danger)' : 'var(--warning)',
                                                }}
                                            />
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {c.pecaDesc}
                                            </span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{c.mensagem}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Validação de ferramentas (pós-geração) */}
                    {result?.validacao && (
                        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                            <SectionHeader
                                icon={ShieldCheck}
                                title="Validação de Ferramentas"
                                accent="var(--accent)"
                            >
                                {result.validacao.maquina && (
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        Máquina: <b style={{ color: 'var(--text-primary)' }}>{result.validacao.maquina.nome}</b>
                                    </span>
                                )}
                            </SectionHeader>
                            {/* P27: maxHeight para não crescer infinitamente com muitas ferramentas */}
                            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                                {(result.validacao.ferramentas_necessarias || []).map((f, i) => {
                                    const color = f.ok ? 'var(--success)' : 'var(--danger)';
                                    const bg = f.ok ? 'var(--success-bg)' : 'var(--danger-bg)';
                                    const border = f.ok ? 'var(--success-border)' : 'var(--danger-border)';
                                    const Icon = f.ok ? CheckCircle2 : AlertTriangle;
                                    return (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '7px 10px', borderRadius: 6,
                                            background: bg, border: `1px solid ${border}`,
                                            fontSize: 13,
                                        }}>
                                            <Icon size={14} style={{ color, flexShrink: 0 }} />
                                            <span style={{
                                                fontWeight: 700, fontFamily: 'var(--font-mono, monospace)',
                                                background: 'var(--bg-card)', padding: '2px 8px',
                                                borderRadius: 4, fontSize: 12,
                                                border: '1px solid var(--border)',
                                            }}>
                                                {f.tool_code}
                                            </span>
                                            <span style={{ color, fontWeight: 500 }}>
                                                {f.ok ? f.ferramenta : 'Não cadastrada!'}
                                            </span>
                                        </div>
                                    );
                                })}
                                {(result.validacao.ferramentas_necessarias || []).length === 0 && (
                                    <EmptyState
                                        icon={ShieldCheck}
                                        title="Nenhuma operação de usinagem"
                                        description="Este lote não contém operações que exijam ferramenta cadastrada."
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Toolbar de ações */}
                    <div className="glass-card" style={{
                        padding: '12px 16px',
                        display: 'flex', gap: 10,
                        alignItems: 'center', flexWrap: 'wrap',
                    }}>
                        <button
                            onClick={gerar}
                            disabled={gerando || maquinas.length === 0}
                            className="btn-primary"
                            style={{ padding: '10px 22px', fontSize: 13, gap: 8 }}
                            aria-label="Gerar G-code"
                        >
                            <Cpu size={14} />
                            {gerando ? 'Gerando…' : 'Gerar G-code'}
                        </button>
                        {/* P26: badge de conflitos visível mesmo com seção fechada */}
                        {gcodeValidation?.conflicts?.length > 0 && !showGcodeConflicts && (
                            <button
                                onClick={() => setShowGcodeConflicts(true)}
                                title="Clique para ver os conflitos detectados"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                    background: 'var(--danger-bg)', color: 'var(--danger)',
                                    fontSize: 11, fontWeight: 700,
                                }}
                            >
                                <AlertTriangle size={13} />
                                {gcodeValidation.conflicts.length} conflito{gcodeValidation.conflicts.length > 1 ? 's' : ''} — ver
                            </button>
                        )}
                        {result?.ok && (
                            <>
                                <button
                                    onClick={downloadGcode}
                                    className="btn-secondary"
                                    style={{ padding: '10px 18px', fontSize: 13, gap: 8 }}
                                    aria-label={`Baixar ${result.extensao || '.nc'}`}
                                >
                                    <Download size={14} /> Baixar {result.extensao || '.nc'}
                                </button>
                                {result.gcode && (
                                    <button
                                        onClick={() => {
                                            const moves = parseGcodeToMoves(result.gcode);
                                            setToolpathMoves(moves);
                                            setToolpathChapa(null);
                                            setToolpathOpen(true);
                                        }}
                                        className="btn-secondary"
                                        style={{ padding: '10px 18px', fontSize: 13, gap: 8 }}
                                        aria-label="Simular percurso da ferramenta"
                                    >
                                        <Play size={14} /> Simular Percurso
                                    </button>
                                )}
                                <div style={{
                                    marginLeft: 'auto',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 12px', borderRadius: 20,
                                    background: 'var(--success-bg)',
                                    border: '1px solid var(--success-border)',
                                    fontSize: 12, color: 'var(--success)', fontWeight: 700,
                                }}>
                                    <CheckCircle2 size={13} />
                                    {result.total_pecas} peça(s), {result.total_operacoes} op(s)
                                    {result.onion_skin_ops > 0 && ` · ${result.onion_skin_ops} onion-skin`}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Preview do G-code */}
                    {result?.gcode && (
                        <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                            <SectionHeader
                                icon={FileCode2}
                                title={`Preview G-code — ${result.gcode.split('\n').length} linhas`}
                                accent="var(--primary)"
                            />
                            <pre style={{
                                margin: 0, padding: 14, maxHeight: 500, overflowY: 'auto',
                                fontSize: 12, fontFamily: 'JetBrains Mono, Consolas, monospace',
                                lineHeight: 1.6, background: 'var(--bg-muted)',
                                color: 'var(--text-primary)', whiteSpace: 'pre',
                            }}>
                                {result.gcode.split('\n').map((line, i) => {
                                    let color = 'inherit';
                                    if (line.startsWith(';') || line.startsWith('(')) color = 'var(--text-muted)';
                                    else if (/^G0\b/.test(line)) color = 'var(--primary)';
                                    else if (/^G1\b/.test(line)) color = 'var(--success)';
                                    else if (/^T\d/.test(line)) color = 'var(--warning)';
                                    else if (/^[SM]\d/.test(line)) color = 'var(--accent)';
                                    return (
                                        <span key={i}>
                                            <span style={{
                                                color: 'var(--text-muted)', opacity: 0.6, userSelect: 'none',
                                                display: 'inline-block', width: 40, textAlign: 'right', marginRight: 12,
                                            }}>
                                                {i + 1}
                                            </span>
                                            <span style={{ color }}>{line}</span>{'\n'}
                                        </span>
                                    );
                                })}
                            </pre>
                        </div>
                    )}

                    {/* Simulador de percurso */}
                    <ToolpathSimulator
                        chapData={toolpathChapa}
                        operations={toolpathMoves}
                        isOpen={toolpathOpen}
                        onClose={() => {
                            setToolpathOpen(false);
                            setToolpathMoves([]);
                            setToolpathChapa(null);
                        }}
                    />

                    {/* Confirmação ao gerar com erros detectados */}
                    {pendingConfirm && (
                        <ConfirmModal
                            danger
                            title="Gerar G-code com erros detectados?"
                            message={
                                `${pendingConfirm.conflicts.length} erro(s) de usinagem foram detectados nas peças deste lote. ` +
                                `Deseja gerar o G-code mesmo assim?`
                            }
                            confirmLabel="Gerar Assim Mesmo"
                            cancelLabel="Cancelar"
                            onConfirm={doGerar}
                            onCancel={() => setPendingConfirm(null)}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// Chip de informação inline — usado no cabeçalho da máquina selecionada.
function InfoChip({ label, value }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
        }}>
            {label}:&nbsp;
            <b style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{value}</b>
        </span>
    );
}
