// Tab "G-code / CNC" — geração + preview + simulação de percurso.
// Refatorado em Fase B: tokens, imports enxutos, sub-tab Etiquetas via lazy.

import { useState, useEffect, lazy, Suspense } from 'react';
import api from '../../../api';
import { Z } from '../../../ui';
import {
    Monitor, Cpu, Tag as TagIcon, AlertTriangle, CheckCircle2,
    X, Play, Download,
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

    const gerar = async () => {
        if (!loteAtual) return;
        // Pré-validação: avisa se há erros de usinagem conhecidos.
        try {
            const val = await api.get(`/cnc/validar-usinagens/${loteAtual.id}`);
            setGcodeValidation(val);
            const erros = (val.conflicts || []).filter(c => c.severidade === 'erro');
            if (erros.length > 0) {
                setShowGcodeConflicts(true);
                const proceed = window.confirm(
                    `${erros.length} erro(s) de usinagem detectado(s):\n\n` +
                    erros.slice(0, 5).map(c => `- ${c.pecaDesc}: ${c.mensagem}`).join('\n') +
                    (erros.length > 5 ? `\n...e mais ${erros.length - 5}` : '') +
                    '\n\nDeseja gerar o G-code mesmo assim?'
                );
                if (!proceed) return;
            }
        } catch (_) { /* validação falhou — segue em frente */ }

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
        }
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
        <div>
            {/* Sub-tabs: G-code | Etiquetas */}
            <div style={{
                display: 'flex', gap: 4, marginBottom: 16,
                borderBottom: '2px solid var(--border)', paddingBottom: 0,
            }}>
                {[
                    { id: 'gcode', lb: 'G-code / CNC', ic: Cpu },
                    { id: 'etiquetas', lb: 'Etiquetas', ic: TagIcon },
                ].map(st => {
                    const active = gcodeSubTab === st.id;
                    return (
                        <button
                            key={st.id}
                            onClick={() => setGcodeSubTab(st.id)}
                            style={{
                                padding: '8px 18px', fontSize: 13,
                                fontWeight: active ? 700 : 500,
                                border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6,
                                borderBottom: active
                                    ? '2px solid var(--primary)'
                                    : '2px solid transparent',
                                marginBottom: -2, background: 'transparent',
                                color: active ? 'var(--primary)' : 'var(--text-muted)',
                                transition: 'all .15s',
                            }}
                        >
                            <st.ic size={14} /> {st.lb}
                        </button>
                    );
                })}
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
                    <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Monitor size={16} style={{ color: 'var(--primary)' }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Máquina CNC:
                                </span>
                            </div>
                            <select
                                value={maquinaId}
                                onChange={e => { setMaquinaId(e.target.value); setResult(null); }}
                                className={Z.inp}
                                style={{ minWidth: 260, fontSize: 13 }}
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
                                    display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)',
                                    flexWrap: 'wrap',
                                }}>
                                    <span>Ext: <b style={{ color: 'var(--text-primary)' }}>{maquinaSel.extensao_arquivo || '.nc'}</b></span>
                                    <span>Tipo: <b style={{ color: 'var(--text-primary)' }}>{maquinaSel.tipo_pos || 'generic'}</b></span>
                                    <span>Área: <b style={{ color: 'var(--text-primary)' }}>{maquinaSel.x_max}×{maquinaSel.y_max}mm</b></span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Validação de ferramentas (pós-geração) */}
                    {result?.validacao && (
                        <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between', marginBottom: 12,
                            }}>
                                <h3 style={{
                                    fontSize: 13, fontWeight: 700,
                                    color: 'var(--text-primary)', margin: 0,
                                }}>
                                    Validação de Ferramentas
                                </h3>
                                {result.validacao.maquina && (
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        Máquina: <b style={{ color: 'var(--text-primary)' }}>{result.validacao.maquina.nome}</b>
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {(result.validacao.ferramentas_necessarias || []).map((f, i) => {
                                    const color = f.ok ? 'var(--success)' : 'var(--danger)';
                                    const Icon = f.ok ? CheckCircle2 : AlertTriangle;
                                    return (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                                        }}>
                                            <Icon size={14} style={{ color, flexShrink: 0 }} />
                                            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{f.tool_code}</span>
                                            <span style={{ color }}>
                                                {f.ok ? f.ferramenta : 'Não cadastrada!'}
                                            </span>
                                        </div>
                                    );
                                })}
                                {(result.validacao.ferramentas_necessarias || []).length === 0 && (
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                        Nenhuma operação de usinagem encontrada nas peças
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Conflitos pré-geração */}
                    {showGcodeConflicts && gcodeValidation?.conflicts?.length > 0 && (
                        <div
                            className="glass-card"
                            style={{
                                padding: 16, marginBottom: 16,
                                borderLeft: '3px solid var(--danger)',
                            }}
                        >
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between', marginBottom: 8,
                            }}>
                                <span style={{
                                    fontSize: 13, fontWeight: 700, color: 'var(--danger)',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <AlertTriangle size={14} />
                                    Conflitos detectados ({gcodeValidation.conflicts.length})
                                </span>
                                <button
                                    onClick={() => setShowGcodeConflicts(false)}
                                    style={{
                                        background: 'none', border: 'none',
                                        cursor: 'pointer', color: 'var(--text-muted)',
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{
                                maxHeight: 150, overflowY: 'auto',
                                display: 'flex', flexDirection: 'column', gap: 4,
                            }}>
                                {gcodeValidation.conflicts.map((c, i) => {
                                    const isErr = c.severidade === 'erro';
                                    return (
                                        <div key={i} style={{
                                            fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                                            color: isErr ? 'var(--danger)' : 'var(--warning)',
                                        }}>
                                            <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                                            <span style={{ fontWeight: 600 }}>{c.pecaDesc}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{c.mensagem}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Ações */}
                    <div style={{
                        marginBottom: 16, display: 'flex',
                        gap: 10, alignItems: 'center', flexWrap: 'wrap',
                    }}>
                        <button
                            onClick={gerar}
                            disabled={gerando || maquinas.length === 0}
                            className="btn-primary"
                            style={{ padding: '10px 20px', fontSize: 13, gap: 6 }}
                        >
                            <Cpu size={14} />
                            {gerando ? 'Gerando…' : 'Gerar G-code'}
                        </button>
                        {result?.ok && (
                            <button
                                onClick={downloadGcode}
                                className="btn-secondary"
                                style={{ padding: '10px 20px', fontSize: 13, gap: 6 }}
                            >
                                <Download size={14} /> Baixar {result.extensao || '.nc'}
                            </button>
                        )}
                        {result?.ok && result?.gcode && (
                            <button
                                onClick={() => {
                                    const moves = parseGcodeToMoves(result.gcode);
                                    setToolpathMoves(moves);
                                    setToolpathChapa(null);
                                    setToolpathOpen(true);
                                }}
                                className="btn-secondary"
                                style={{ padding: '10px 20px', fontSize: 13, gap: 6 }}
                            >
                                <Play size={14} /> Simular Percurso
                            </button>
                        )}
                        {result?.ok && (
                            <span style={{
                                fontSize: 13, color: 'var(--success)', fontWeight: 600,
                            }}>
                                {result.total_pecas} peça(s), {result.total_operacoes} operação(ões)
                                {result.onion_skin_ops > 0 && ` (${result.onion_skin_ops} onion-skin)`}
                            </span>
                        )}
                    </div>

                    {/* Preview do G-code */}
                    {result?.gcode && (
                        <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
                            <div style={{
                                padding: '10px 14px', borderBottom: '1px solid var(--border)',
                                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                                textTransform: 'uppercase', letterSpacing: 0.3,
                            }}>
                                Preview G-code ({result.gcode.split('\n').length} linhas)
                            </div>
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
                </>
            )}
        </div>
    );
}
