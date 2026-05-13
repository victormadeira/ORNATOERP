// Tab "G-code / CNC" — geração + preview + simulação de percurso.
import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import api from '../../../api';
import { Z, TabBar, EmptyState, ConfirmModal } from '../../../ui';
import {
    Monitor, Cpu, Tag as TagIcon, AlertTriangle, CheckCircle2,
    X, Play, Download, ShieldCheck, FileCode2, Copy, Check as CheckIcon,
    ChevronDown, Layers, Clock, Scissors, Wrench, ChevronRight,
} from 'lucide-react';
import GcodeSimWrapper from '../../../components/GcodeSimWrapper';

const TabEtiquetas = lazy(() =>
    import('./TabEtiquetas.jsx').then(m => ({ default: m.TabEtiquetas }))
);

// Syntax highlight por tipo de linha G-code
function gcodeLineColor(line) {
    const s = line.replace(/^N\d+\s*/, '');
    if (s.startsWith(';') || s.startsWith('(') || s.startsWith('%')) return 'var(--text-muted)';
    if (/^G0\b/.test(s))  return 'var(--primary)';
    if (/^G1\b/.test(s))  return 'var(--success)';
    if (/^G[23]\b/.test(s)) return '#89b4fa';
    if (/^T[A-Z0-9]/.test(s) || /M6\b/.test(s)) return 'var(--warning)';
    if (/^[SM]\d/.test(s)) return 'var(--text-muted)';
    return 'inherit';
}

function buildSimulatorChapa(chapa, maquina = {}) {
    if (!chapa) return null;

    // O G-code sai nas coordenadas da maquina. O plano de corte fica no sistema
    // interno (x=comprimento, y=largura). Para o simulador nao desenhar a chapa
    // girada em relacao ao percurso, aplicamos a mesma regra usada no TabPlano.
    const swapOff = Number(maquina?.trocar_eixos_xy) === 1;
    const comprimento = Number(chapa.comprimento) || Number(chapa.largura) || 0;
    const largura = Number(chapa.largura) || Number(chapa.comprimento) || 0;

    const mapRect = (r = {}) => ({
        ...r,
        x: swapOff ? (r.x ?? 0) : (r.y ?? 0),
        y: swapOff ? (r.y ?? 0) : (r.x ?? 0),
        w: swapOff ? (r.w ?? 0) : (r.h ?? 0),
        h: swapOff ? (r.h ?? 0) : (r.w ?? 0),
        nome: r.nome || r.descricao,
    });

    return {
        ...chapa,
        comprimento: swapOff ? comprimento : largura,
        largura: swapOff ? largura : comprimento,
        refilo: chapa.refilo ?? 10,
        espessura: chapa.espessura_real || chapa.espessura || 18.5,
        pecas: (chapa.pecas || []).map(mapRect),
        retalhos: (chapa.retalhos || []).map(mapRect),
    };
}

export function TabGcode({ lotes, loteAtual, setLoteAtual, notify }) {
    const [gcodeSubTab, setGcodeSubTab]     = useState('gcode');
    const [result, setResult]               = useState(null);
    const [gerando, setGerando]             = useState(false);
    const [maquinas, setMaquinas]           = useState([]);
    const [maquinaId, setMaquinaId]         = useState('');
    const [gcodeValidation, setGcodeValidation] = useState(null);
    const [showConflicts, setShowConflicts] = useState(false);
    const [pendingConfirm, setPendingConfirm]   = useState(null);
    const [copied, setCopied]               = useState(false);
    const [historico, setHistorico]         = useState(null);
    const [selectedChapaIdx, setSelectedChapaIdx] = useState(0);
    const [gcodePreviewLimit, setGcodePreviewLimit] = useState(300);
    // Painel de output: 'codigo' | 'simulador'
    const [outputTab, setOutputTab]         = useState('codigo');
    const [baixandoZip, setBaixandoZip]     = useState(false);

    // Spoilboard
    const [sbAreaX, setSbAreaX]       = useState(2800);
    const [sbAreaY, setSbAreaY]       = useState(1900);
    const [sbProf, setSbProf]         = useState(0.5);
    const [sbStepover, setSbStepover] = useState(80);
    const [sbFresa, setSbFresa]       = useState(25);
    const [sbVel, setSbVel]           = useState(8000);
    const [sbRpm, setSbRpm]           = useState(18000);
    const [sbZ, setSbZ]               = useState(30);
    const [sbDir, setSbDir]           = useState('horizontal');
    const [sbMargem, setSbMargem]     = useState(10);
    const [sbResult, setSbResult]     = useState(null);
    const [sbGerando, setSbGerando]   = useState(false);
    const [sbCopied, setSbCopied]     = useState(false);

    useEffect(() => {
        if (!loteAtual?.id) return;
        api.get(`/cnc/gcode-historico/${loteAtual.id}`).then(h => {
            if (h?.length > 0) setHistorico(h[0]);
        }).catch(() => null);
    }, [loteAtual?.id, result]);

    const copyGcode = useCallback(() => {
        if (!result?.gcode) return;
        navigator.clipboard.writeText(result.gcode).then(() => {
            setCopied(true); setTimeout(() => setCopied(false), 2000);
        }).catch(() => notify('Não foi possível copiar'));
    }, [result?.gcode, notify]);

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

            let flat = r;
            if (r.chapas && Array.isArray(r.chapas)) {
                const chapasOk = r.chapas.filter(c => c.gcode);
                const allAlertas = r.chapas.flatMap(c => c.alertas || []);
                const aggStats = r.chapas.reduce((acc, c) => {
                    const s = c.stats || {};
                    acc.total_operacoes  = (acc.total_operacoes  || 0) + (s.total_operacoes  || 0);
                    acc.tempo_estimado_min = (acc.tempo_estimado_min || 0) + (s.tempo_estimado_min || 0);
                    acc.dist_corte_m     = (acc.dist_corte_m     || 0) + (s.dist_corte_m     || 0);
                    acc.trocas_ferramenta = (acc.trocas_ferramenta || 0) + (s.trocas_ferramenta || 0);
                    acc.onion_skin_ops   = (acc.onion_skin_ops   || 0) + (s.onion_skin_ops   || 0);
                    acc.tabs_ativos        = (acc.tabs_ativos        || 0) + (s.tabs_ativos        || 0);
                    acc.linhas_comuns_skip = (acc.linhas_comuns_skip || 0) + (s.linhas_comuns_skip || 0);
                    return acc;
                }, {});
                aggStats.tempo_estimado_min = Math.round(aggStats.tempo_estimado_min * 10) / 10;
                aggStats.dist_corte_m       = Math.round(aggStats.dist_corte_m       * 10) / 10;

                flat = {
                    ...r,
                    chapas: r.chapas,
                    gcode:  chapasOk.map(c => c.gcode).join('\n\n'),
                    stats:  aggStats,
                    alertas: allAlertas,
                    total_operacoes: aggStats.total_operacoes,
                    onion_skin_ops:  aggStats.onion_skin_ops,
                    total_pecas: r.chapas.reduce((s, c) => s + (c.stats?.contornos_peca || 0), 0) || r.total_pecas || '',
                };
            }

            setResult(flat);
            setSelectedChapaIdx(0);
            setGcodePreviewLimit(300);
            setOutputTab('codigo'); // sempre volta ao código ao regerar
            if (flat.ok) notify(`G-code gerado: ${flat.total_operacoes} op(s) · ${flat.stats?.tempo_estimado_min ?? '?'}min est.`);
            else if (flat.error) notify(flat.error);
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setGerando(false);
            setPendingConfirm(null);
        }
    };

    const chapaAtual = useMemo(() => {
        if (!result) return null;
        const chapas = result.chapas || [];
        return chapas.length > 1 ? (chapas[selectedChapaIdx] || null) : null;
    }, [result, selectedChapaIdx]);

    const gcodeExibir = chapaAtual?.gcode ?? result?.gcode ?? '';
    const gcodeLinhas = useMemo(() => gcodeExibir.split('\n'), [gcodeExibir]);

    const conflictSummary = useMemo(() => {
        const conflicts = gcodeValidation?.conflicts || [];
        const errors   = conflicts.filter(c => c.severidade === 'erro').length;
        const warnings = conflicts.length - errors;
        const byMessage = new Map();
        for (const c of conflicts) {
            const key = c.mensagem || 'Conflito';
            const cur = byMessage.get(key) || { mensagem: key, count: 0, pecas: new Set(), severidade: c.severidade };
            cur.count++;
            if (c.pecaDesc) cur.pecas.add(c.pecaDesc);
            if (c.severidade === 'erro') cur.severidade = 'erro';
            byMessage.set(key, cur);
        }
        const groups = [...byMessage.values()].sort((a, b) => b.count - a.count)
            .map(g => ({ ...g, pecas: [...g.pecas].slice(0, 4) }));
        return { errors, warnings, groups };
    }, [gcodeValidation?.conflicts]);

    const gerar = async () => {
        if (!loteAtual) return;
        try {
            const val = await api.get(`/cnc/validar-usinagens/${loteAtual.id}`);
            setGcodeValidation(val);
            const erros = (val.conflicts || []).filter(c => c.severidade === 'erro');
            if (erros.length > 0) {
                setShowConflicts(true);
                setPendingConfirm({ conflicts: erros });
                return;
            }
        } catch {
            notify('Não foi possível validar usinagens. Verifique a conexão.');
            return;
        }
        doGerar();
    };

    const downloadGcode = () => {
        if (!result?.gcode) return;
        const ext    = result.extensao || '.nc';
        const chapas = result.chapas || [];
        if (chapas.length > 1) {
            chapas.forEach((c, i) => {
                if (!c.gcode) return;
                const a   = document.createElement('a');
                a.href    = URL.createObjectURL(new Blob([c.gcode], { type: 'text/plain' }));
                a.download = c.filename || `${loteAtual?.nome || 'lote'}_Chapa${String(i+1).padStart(2,'0')}${ext}`;
                a.click();
            });
            return;
        }
        const a   = document.createElement('a');
        a.href    = URL.createObjectURL(new Blob([result.gcode], { type: 'text/plain' }));
        a.download = chapas[0]?.filename || `${loteAtual?.nome || 'lote'}${ext}`;
        a.click();
    };

    const downloadZip = async () => {
        if (!loteAtual?.id) return;
        setBaixandoZip(true);
        try {
            const resp = await fetch(`/api/cnc/gcode-batch/${loteAtual.id}/zip`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify({ maquinaId }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                notify('Erro ao gerar ZIP: ' + (err.error || resp.statusText), 'error');
                return;
            }
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const cd = resp.headers.get('content-disposition') || '';
            const fname = cd.match(/filename="([^"]+)"/)?.[1] || `lote_${loteAtual.id}_gcode.zip`;
            a.download = fname;
            a.click();
            URL.revokeObjectURL(url);
            notify('ZIP baixado com sucesso!');
        } catch (err) {
            notify('Erro: ' + err.message, 'error');
        } finally {
            setBaixandoZip(false);
        }
    };

    const gerarSpoilboard = async () => {
        setSbGerando(true);
        setSbResult(null);
        try {
            const maq = maquinas.find(m => String(m.id) === maquinaId);
            const r = await api.post('/cnc/gcode/spoilboard', {
                area_x: sbAreaX, area_y: sbAreaY,
                profundidade: sbProf, stepover: sbStepover,
                diametro_fresa: sbFresa, vel_corte: sbVel,
                rpm: sbRpm, z_seguro: sbZ,
                direcao: sbDir, margem: sbMargem,
                gcode_header: maq?.gcode_header || '',
                gcode_footer: maq?.gcode_footer || '',
                comentario_prefixo: maq?.comentario_prefixo || ';',
            });
            setSbResult(r);
        } catch (err) {
            notify('Erro: ' + (err.error || err.message), 'error');
        } finally {
            setSbGerando(false);
        }
    };

    const downloadSpoilboard = () => {
        if (!sbResult?.gcode) return;
        const blob = new Blob([sbResult.gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spoilboard_${sbAreaX}x${sbAreaY}_${sbProf}mm.nc`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Dados para o simulador da chapa selecionada
    const simChapa    = result?.chapas?.[selectedChapaIdx] || result;
    const simGcode    = simChapa?.gcode || result?.gcode || '';
    const simMaquina  = useMemo(() => {
        const simMachineId = simChapa?.maquina?.id;
        return maquinas.find(m => String(m.id) === String(simMachineId))
            || maquinaSel
            || maquinas.find(m => m.padrao)
            || {};
    }, [maquinas, maquinaSel, simChapa?.maquina?.id]);
    const simChapaData = useMemo(() => buildSimulatorChapa(simChapa, simMaquina), [simChapa, simMaquina]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Banner de fluxo arquivado ──────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', borderRadius: 8,
                background: 'rgba(19,121,240,0.06)',
                border: '1px solid rgba(19,121,240,0.18)',
                fontSize: 12, color: 'var(--text-secondary)',
            }}>
                <Monitor size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span>
                    O fluxo principal de revisão usa o{' '}
                    <b style={{ color: 'var(--text-primary)' }}>Plano de Corte → Revisar Pré-corte</b>.
                    {' '}Esta aba mantém o histórico de G-codes e permite geração em lote para exportação.
                </span>
            </div>

            {/* ── Sub-tabs Etiquetas ─────────────────────────────────────── */}
            <div style={{ marginBottom: -4 }}>
                <TabBar
                    tabs={[
                        { id: 'gcode',       label: 'G-code / CNC', icon: Cpu },
                        { id: 'etiquetas',   label: 'Etiquetas',    icon: TagIcon },
                        { id: 'utilitarios', label: 'Utilitários',  icon: Wrench },
                    ]}
                    active={gcodeSubTab}
                    onChange={setGcodeSubTab}
                />
            </div>

            {gcodeSubTab === 'etiquetas' && (
                <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>}>
                    <TabEtiquetas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />
                </Suspense>
            )}

            {gcodeSubTab === 'utilitarios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>

                    {/* Spoilboard Resurfacing */}
                    <div className="glass-card" style={{ padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Wrench size={18} style={{ color: '#6366f1' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Spoilboard Resurfacing</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gera G-code para refazer a superfície da placa de sacrifício</div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Área X (mm)</div>
                                <input type="number" value={sbAreaX} onChange={e => setSbAreaX(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="100" max="9000" />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Área Y (mm)</div>
                                <input type="number" value={sbAreaY} onChange={e => setSbAreaY(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="100" max="9000" />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Profundidade (mm)</div>
                                <input type="number" value={sbProf} onChange={e => setSbProf(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="0.1" max="5" step="0.1" />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Ø Fresa (mm)</div>
                                <input type="number" value={sbFresa} onChange={e => setSbFresa(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="6" max="100" />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Stepover (%)</div>
                                <input type="number" value={sbStepover} onChange={e => setSbStepover(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="10" max="100" />
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                    = {Math.round(sbFresa * sbStepover / 100 * 10) / 10}mm entre passadas
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Margem borda (mm)</div>
                                <input type="number" value={sbMargem} onChange={e => setSbMargem(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="0" max="100" />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Velocidade F (mm/min)</div>
                                <input type="number" value={sbVel} onChange={e => setSbVel(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="500" max="40000" step="500" />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>RPM Spindle</div>
                                <input type="number" value={sbRpm} onChange={e => setSbRpm(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="1000" max="30000" step="500" />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Z seguro (mm)</div>
                                <input type="number" value={sbZ} onChange={e => setSbZ(Number(e.target.value))} className={Z.inp} style={{ width: '100%' }} min="5" max="200" />
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Direção das passadas</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[
                                    { id: 'horizontal', label: '↔ Horizontal', desc: 'Passadas esquerda-direita' },
                                    { id: 'vertical',   label: '↕ Vertical',   desc: 'Passadas frente-trás' },
                                    { id: 'diagonal',   label: '↗ Diagonal',   desc: 'Passadas em 45°' },
                                ].map(d => (
                                    <div key={d.id} onClick={() => setSbDir(d.id)}
                                        style={{
                                            flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                            border: `1.5px solid ${sbDir === d.id ? 'var(--primary)' : 'var(--border)'}`,
                                            background: sbDir === d.id ? 'color-mix(in srgb, var(--primary) 8%, var(--bg-muted))' : 'var(--bg-muted)',
                                            transition: 'all 0.15s',
                                        }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: sbDir === d.id ? 'var(--primary)' : 'var(--text-primary)' }}>{d.label}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{d.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Estimativa */}
                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px dashed var(--border)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
                            <b>Estimativa:</b> ~{Math.ceil((sbDir === 'horizontal' ? sbAreaY : sbAreaX) / Math.max(1, Math.round(sbFresa * sbStepover / 100)))} passadas ·{' '}
                            Comprimento total: ~{(((sbDir === 'horizontal' ? sbAreaX : sbAreaY) * Math.ceil((sbDir === 'horizontal' ? sbAreaY : sbAreaX) / Math.max(1, Math.round(sbFresa * sbStepover / 100)))) / 1000).toFixed(1)}m
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={gerarSpoilboard} disabled={sbGerando}
                                style={{
                                    padding: '10px 24px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13,
                                    background: sbGerando ? 'var(--bg-muted)' : 'var(--primary)',
                                    color: sbGerando ? 'var(--text-muted)' : '#fff', cursor: sbGerando ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                {sbGerando
                                    ? <><Wrench size={14} style={{ opacity: 0.5 }} /> Gerando...</>
                                    : <><Play size={14} /> Gerar G-code</>
                                }
                            </button>
                            {sbResult?.gcode && (
                                <button onClick={downloadSpoilboard}
                                    style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Download size={14} /> Baixar .nc
                                </button>
                            )}
                        </div>

                        {/* Resultado */}
                        {sbResult && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 8 }}>
                                    <span>✓ Gerado</span>
                                    <span>Passadas: <b style={{ color: 'var(--text-primary)' }}>{sbResult.stats?.passadas_estimadas}</b></span>
                                    <span>Linhas: <b style={{ color: 'var(--text-primary)' }}>{sbResult.stats?.total_linhas}</b></span>
                                    <span>Stepover: <b style={{ color: 'var(--text-primary)' }}>{sbResult.stats?.stepMm}mm</b></span>
                                </div>
                                <pre style={{
                                    maxHeight: 300, overflow: 'auto', fontSize: 11, lineHeight: 1.5,
                                    fontFamily: 'monospace', padding: 12, borderRadius: 8,
                                    background: '#0d1117', color: '#e6edf3', border: '1px solid var(--border)',
                                }}>
                                    {sbResult.gcode.split('\n').slice(0, 80).join('\n')}
                                    {sbResult.gcode.split('\n').length > 80 && '\n; ... (truncado — baixe o arquivo completo)'}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {gcodeSubTab === 'gcode' && (
                <>
                    {/* ── Painel de configuração + ação (tudo em uma linha) ─── */}
                    <div className="glass-card" style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

                            {/* Ícone + rótulo */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <Monitor size={16} style={{ color: 'var(--primary)', opacity: 0.8 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Máquina
                                </span>
                            </div>

                            {/* Select de máquina */}
                            <select
                                value={maquinaId}
                                onChange={e => { setMaquinaId(e.target.value); setResult(null); }}
                                className={Z.inp}
                                style={{ minWidth: 220, maxWidth: 340, fontSize: 13, flex: '1 1 220px' }}
                            >
                                {maquinas.length === 0 && <option value="">Nenhuma máquina cadastrada</option>}
                                {maquinas.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.nome}{m.fabricante ? ` — ${m.fabricante} ${m.modelo}` : ''}
                                        {m.padrao ? ' ·' : ''} [{m.total_ferramentas} ferr.]
                                    </option>
                                ))}
                            </select>

                            {/* Chips de info da máquina */}
                            {maquinaSel && (
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    <Chip label={maquinaSel.extensao_arquivo || '.nc'} />
                                    <Chip label={maquinaSel.tipo_pos || 'generic'} />
                                    <Chip label={`${maquinaSel.x_max}×${maquinaSel.y_max}mm`} />
                                </div>
                            )}

                            <div style={{ flex: 1 }} />

                            {/* Histórico */}
                            {historico && !result && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}
                                    title={`Máquina: ${historico.maquina_nome || '?'}`}>
                                    Último: {new Date(historico.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    {' · '}{historico.total_operacoes} op(s)
                                </span>
                            )}

                            {/* Badge de conflitos (quando painel fechado) */}
                            {gcodeValidation?.conflicts?.length > 0 && !showConflicts && (
                                <button onClick={() => setShowConflicts(true)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                        background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 11, fontWeight: 700,
                                    }}
                                >
                                    <AlertTriangle size={12} />
                                    {gcodeValidation.conflicts.length} conflito{gcodeValidation.conflicts.length > 1 ? 's' : ''}
                                </button>
                            )}

                            {/* Botão principal */}
                            <button
                                onClick={gerar}
                                disabled={gerando || maquinas.length === 0}
                                className="btn-primary"
                                style={{ padding: '9px 20px', fontSize: 13, gap: 7, flexShrink: 0 }}
                            >
                                <Cpu size={14} />
                                {gerando ? 'Gerando…' : 'Gerar G-code'}
                            </button>
                        </div>
                    </div>

                    {/* ── Conflitos pré-geração ───────────────────────────── */}
                    {showConflicts && gcodeValidation?.conflicts?.length > 0 && (
                        <div className="glass-card" style={{
                            padding: 0, overflow: 'hidden',
                            borderLeft: '3px solid var(--danger)',
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                                background: 'var(--danger-bg)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
                                        {gcodeValidation.conflicts.length} conflito{gcodeValidation.conflicts.length > 1 ? 's' : ''} detectado{gcodeValidation.conflicts.length > 1 ? 's' : ''}
                                    </span>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 999, fontSize: 11,
                                        background: 'var(--danger)', color: '#fff', fontWeight: 700,
                                    }}>
                                        {conflictSummary.errors} erro{conflictSummary.errors !== 1 ? 's' : ''}
                                    </span>
                                    {conflictSummary.warnings > 0 && (
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 999, fontSize: 11,
                                            background: 'var(--warning)', color: '#fff', fontWeight: 700,
                                        }}>
                                            {conflictSummary.warnings} aviso{conflictSummary.warnings !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => setShowConflicts(false)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{ padding: '10px 16px', maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {conflictSummary.groups.slice(0, 12).map((c, i) => {
                                    const isErr = c.severidade === 'erro';
                                    return (
                                        <div key={i} style={{
                                            display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto',
                                            alignItems: 'flex-start', gap: 8, padding: '7px 10px', borderRadius: 7,
                                            background: isErr ? 'var(--danger-bg)' : 'var(--warning-bg)',
                                            border: `1px solid ${isErr ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                                            fontSize: 12,
                                        }}>
                                            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2, color: isErr ? 'var(--danger)' : 'var(--warning)' }} />
                                            <div>
                                                <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{c.mensagem}</div>
                                                {c.pecas.length > 0 && (
                                                    <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        Peças: {c.pecas.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                            <span style={{ padding: '2px 7px', borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 10, fontWeight: 800, color: isErr ? 'var(--danger)' : 'var(--warning)' }}>
                                                {c.count}×
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Validação de ferramentas (pós-geração) ──────────── */}
                    {result?.validacao?.ferramentas_necessarias?.length > 0 && (
                        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                            }}>
                                <ShieldCheck size={14} style={{ color: 'var(--primary)' }} />
                                <span style={{ fontSize: 13, fontWeight: 700 }}>Ferramentas necessárias</span>
                                {result.validacao.maquina && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                                        — {result.validacao.maquina.nome}
                                    </span>
                                )}
                            </div>
                            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
                                {result.validacao.ferramentas_necessarias.map((f, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 9,
                                        padding: '6px 10px', borderRadius: 6, fontSize: 13,
                                        background: f.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
                                        border: `1px solid ${f.ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
                                    }}>
                                        {f.ok
                                            ? <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                            : <AlertTriangle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                                        }
                                        <code style={{
                                            fontWeight: 700, fontFamily: 'monospace',
                                            background: 'var(--bg-card)', padding: '2px 7px',
                                            borderRadius: 4, fontSize: 11, border: '1px solid var(--border)',
                                        }}>
                                            {f.tool_code}
                                        </code>
                                        <span style={{ color: f.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
                                            {f.ok ? f.ferramenta : 'Não cadastrada!'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Estatísticas de saída (quando gerado com sucesso) ── */}
                    {result?.ok && (
                        <div style={{
                            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                            padding: '10px 16px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                        }}>
                            {/* Badge sucesso */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '5px 11px', borderRadius: 20,
                                background: 'var(--success-bg)', border: '1px solid var(--success-border)',
                                fontSize: 12, color: 'var(--success)', fontWeight: 700,
                            }}>
                                <CheckCircle2 size={13} />
                                {result.total_pecas} peça(s) · {result.total_operacoes} op(s)
                                {result.onion_skin_ops > 0 && ` · ${result.onion_skin_ops} onion`}
                                {result.stats?.tabs_ativos > 0 && ` · ${result.stats.tabs_ativos} tabs`}
                                {result.stats?.linhas_comuns_skip > 0 && ` · ${result.stats.linhas_comuns_skip} linha-comum`}
                            </div>

                            {/* Stats chips */}
                            {result.stats?.tempo_estimado_min > 0 && (
                                <StatChip icon={Clock} value={
                                    result.stats.tempo_estimado_min < 60
                                        ? `${result.stats.tempo_estimado_min}min`
                                        : `${Math.floor(result.stats.tempo_estimado_min/60)}h${Math.round(result.stats.tempo_estimado_min%60)}min`
                                } />
                            )}
                            {result.stats?.dist_corte_m > 0 && (
                                <StatChip icon={Scissors} value={`${result.stats.dist_corte_m}m corte`} />
                            )}
                            {result.stats?.trocas_ferramenta > 0 && (
                                <StatChip icon={Wrench} value={`${result.stats.trocas_ferramenta} trocas`} />
                            )}
                            {result.gcode && (
                                <StatChip icon={FileCode2} value={`${result.gcode.split('\n').length} linhas · ${(new Blob([result.gcode]).size / 1024).toFixed(1)} KB`} />
                            )}

                            <div style={{ flex: 1 }} />

                            {/* Ações */}
                            <button onClick={downloadGcode} className="btn-secondary"
                                style={{ padding: '7px 16px', fontSize: 12, gap: 7 }}
                                title={(result.chapas?.length || 0) > 1 ? `Baixar ${result.chapas.length} arquivos (1 por chapa)` : undefined}
                            >
                                <Download size={13} />
                                {(result.chapas?.length || 0) > 1 ? `${result.chapas.length} arquivos` : `Baixar ${result.extensao || '.nc'}`}
                            </button>
                            {loteAtual?.id && (
                                <button
                                    onClick={downloadZip}
                                    disabled={baixandoZip}
                                    title="Baixar G-code de todas as chapas em um arquivo ZIP"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                                        background: 'var(--bg-muted)', color: baixandoZip ? 'var(--text-muted)' : 'var(--text-primary)',
                                        cursor: baixandoZip ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
                                    }}
                                >
                                    <Download size={14} />
                                    {baixandoZip ? 'Gerando ZIP...' : 'Baixar Todas (ZIP)'}
                                </button>
                            )}
                            <button onClick={copyGcode} className="btn-secondary"
                                style={{ padding: '7px 14px', fontSize: 12, gap: 6 }}>
                                {copied
                                    ? <><CheckIcon size={13} style={{ color: 'var(--success)' }} /> Copiado!</>
                                    : <><Copy size={13} /> Copiar</>
                                }
                            </button>
                        </div>
                    )}

                    {/* ── Painel de output: Código / Simulador ──────────── */}
                    {(gcodeExibir || result?.ok) && (
                        <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>

                            {/* Header do painel */}
                            <div style={{
                                display: 'flex', alignItems: 'center',
                                borderBottom: '1px solid var(--border)',
                                background: 'var(--bg-muted)',
                            }}>
                                {/* Tabs: Código | Simulador */}
                                <div style={{ display: 'flex', flex: 1 }}>
                                    {[
                                        { id: 'codigo',    label: 'G-code', icon: FileCode2 },
                                        { id: 'simulador', label: 'Simulador', icon: Play },
                                    ].map(tab => {
                                        const Ic = tab.icon;
                                        const active = outputTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setOutputTab(tab.id)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '11px 18px', border: 'none', cursor: 'pointer',
                                                    fontSize: 12, fontWeight: active ? 700 : 500,
                                                    background: 'transparent',
                                                    color: active ? 'var(--primary)' : 'var(--text-muted)',
                                                    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                                                    transition: 'all .15s',
                                                }}
                                                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-primary)'; }}
                                                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
                                            >
                                                <Ic size={13} />
                                                {tab.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Seletor de chapa (multi-chapa) */}
                                {(result?.chapas?.length || 0) > 1 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', borderLeft: '1px solid var(--border)' }}>
                                        <Layers size={12} style={{ color: 'var(--text-muted)' }} />
                                        {result.chapas.map((c, i) => {
                                            const s = c.stats || {};
                                            const isSel = selectedChapaIdx === i;
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => { setSelectedChapaIdx(i); setGcodePreviewLimit(300); }}
                                                    style={{
                                                        padding: '3px 10px', borderRadius: 6, border: '1px solid',
                                                        cursor: 'pointer', fontSize: 11, fontWeight: isSel ? 700 : 500,
                                                        background: isSel ? 'var(--primary)' : 'transparent',
                                                        color: isSel ? '#fff' : 'var(--text-muted)',
                                                        borderColor: isSel ? 'var(--primary)' : 'transparent',
                                                        transition: 'all .12s',
                                                    }}
                                                    title={`${s.total_operacoes || 0} op · ${s.tempo_estimado_min || 0}min`}
                                                >
                                                    C{i + 1}
                                                    {s.total_operacoes > 0 && (
                                                        <span style={{ opacity: 0.7, fontSize: 9, marginLeft: 3 }}>{s.total_operacoes}</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Metadados da view ativa */}
                                <div style={{ padding: '0 14px', borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {outputTab === 'codigo' && gcodeExibir && (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                            {gcodeLinhas.length} linhas · {(new Blob([gcodeExibir]).size / 1024).toFixed(1)} KB
                                        </span>
                                    )}
                                    {outputTab === 'simulador' && (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            Scroll=zoom · Drag=pan · Espaço=play
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* ── Aba: Código G-code ───────────────────────── */}
                            {outputTab === 'codigo' && (
                                <>
                                    {gcodeExibir ? (
                                        <>
                                            <pre style={{
                                                margin: 0, padding: '12px 14px',
                                                maxHeight: 520, overflowY: 'auto',
                                                fontSize: 12, fontFamily: 'JetBrains Mono, Consolas, monospace',
                                                lineHeight: 1.65, background: 'var(--bg-muted)',
                                                color: 'var(--text-primary)', whiteSpace: 'pre',
                                            }}>
                                                {gcodeLinhas.slice(0, gcodePreviewLimit).map((line, i) => (
                                                    <span key={i}>
                                                        <span style={{
                                                            color: 'var(--text-muted)', opacity: 0.4,
                                                            userSelect: 'none', display: 'inline-block',
                                                            width: 44, textAlign: 'right', marginRight: 10,
                                                            fontSize: 10,
                                                        }}>
                                                            {i + 1}
                                                        </span>
                                                        <span style={{ color: gcodeLineColor(line) }}>{line}</span>{'\n'}
                                                    </span>
                                                ))}
                                                {gcodeLinhas.length > gcodePreviewLimit && (
                                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', display: 'block', padding: '4px 0' }}>
                                                        … {gcodeLinhas.length - gcodePreviewLimit} linhas ocultas
                                                    </span>
                                                )}
                                            </pre>
                                            {gcodeLinhas.length > gcodePreviewLimit && (
                                                <div style={{ borderTop: '1px solid var(--border)', padding: '7px 14px', display: 'flex', gap: 8, background: 'var(--bg-muted)' }}>
                                                    <button onClick={() => setGcodePreviewLimit(p => p + 500)}
                                                        className="btn-secondary btn-sm"
                                                        style={{ fontSize: 11, gap: 5 }}>
                                                        <ChevronDown size={12} /> +500 linhas
                                                    </button>
                                                    <button onClick={() => setGcodePreviewLimit(gcodeLinhas.length)}
                                                        className="btn-secondary btn-sm"
                                                        style={{ fontSize: 11 }}>
                                                        Ver todas ({gcodeLinhas.length})
                                                    </button>
                                                    <button onClick={() => setOutputTab('simulador')}
                                                        className="btn-secondary btn-sm"
                                                        style={{ fontSize: 11, gap: 5, marginLeft: 'auto' }}>
                                                        <Play size={12} /> Abrir Simulador
                                                    </button>
                                                </div>
                                            )}
                                            {gcodeLinhas.length <= gcodePreviewLimit && gcodeExibir && (
                                                <div style={{ borderTop: '1px solid var(--border)', padding: '7px 14px', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-muted)' }}>
                                                    <button onClick={() => setOutputTab('simulador')}
                                                        className="btn-secondary btn-sm"
                                                        style={{ fontSize: 11, gap: 5 }}>
                                                        <Play size={12} /> Abrir Simulador
                                                        <ChevronRight size={11} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                            G-code ainda não gerado para esta chapa.
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── Aba: Simulador ───────────────────────────── */}
                            {outputTab === 'simulador' && (
                                <div style={{ padding: 0 }}>
                                    {simGcode ? (
                                        <GcodeSimWrapper gcode={simGcode} chapa={simChapaData} />
                                    ) : (
                                        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                            <Play size={32} style={{ opacity: 0.2, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
                                            Gere o G-code primeiro para visualizar a simulação.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Estado inicial: nenhum resultado ainda ─────────── */}
                    {!result && !gerando && (
                        <EmptyState
                            icon={Cpu}
                            title="G-code não gerado"
                            description={
                                maquinas.length === 0
                                    ? 'Cadastre uma máquina CNC em Configurações para poder gerar G-code.'
                                    : `Selecione a máquina e clique em "Gerar G-code" para processar o lote atual.`
                            }
                        />
                    )}

                    {/* ── Modal de confirmação (gerar com erros) ─────────── */}
                    {pendingConfirm && (
                        <ConfirmModal
                            danger
                            title="Gerar G-code com erros detectados?"
                            message={`${pendingConfirm.conflicts.length} erro(s) de usinagem detectados. Deseja gerar mesmo assim?`}
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

// ── Componentes auxiliares ──────────────────────────────────────────────────

function Chip({ label }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 9px', borderRadius: 20,
            background: 'var(--bg-muted)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
        }}>
            {label}
        </span>
    );
}

function StatChip({ icon: Icon, value }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: 'var(--bg-muted)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace',
        }}>
            <Icon size={11} style={{ opacity: 0.6 }} />
            {value}
        </div>
    );
}
