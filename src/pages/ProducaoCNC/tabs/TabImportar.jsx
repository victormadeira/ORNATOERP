// Tab "Importar" — drop-zone JSON/DXF + preview + resolução de materiais.
// Fase C: SectionHeader + EmptyState + botões padronizados + tokens.

import { useState, useRef } from 'react';
import api from '../../../api';
import { Z, SectionHeader } from '../../../ui';
import {
    Upload, Eye, AlertTriangle, CheckCircle2, Check,
    ChevronRight, Package, X, Link2, PlusCircle, FileCode2, Info, Play,
} from 'lucide-react';
import { InfoCard } from '../shared/InfoCard.jsx';

export function TabImportar({ lotes, loadLotes, notify, setLoteAtual, setTab }) {
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState(null);
    const [jsonData, setJsonData] = useState(null);
    const [nome, setNome] = useState('');
    const [importing, setImporting] = useState(false);
    const [lastImportedLote, setLastImportedLote] = useState(null);
    const [matCheck, setMatCheck] = useState(null);
    const [matEdits, setMatEdits] = useState({});
    const [matActions, setMatActions] = useState({});
    const [matVinculos, setMatVinculos] = useState({});
    const [matConfirmados, setMatConfirmados] = useState({});
    const [chapasDisponiveis, setChapasDisponiveis] = useState([]);
    const [checkingMats, setCheckingMats] = useState(false);
    const [matCheckError, setMatCheckError] = useState(null); // erro de validação de materiais
    const fileRef = useRef(null);

    const handleFile = (file) => {
        if (!file) return;
        const isDxf = file.name.toLowerCase().endsWith('.dxf');
        const isJson = file.name.toLowerCase().endsWith('.json');
        if (!isDxf && !isJson) {
            notify('Selecione um arquivo .json ou .dxf');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (isDxf) {
                setJsonData({ _isDxf: true, dxfContent: e.target.result });
                setPreview({
                    cliente: '', projeto: '', codigo: '', vendedor: '',
                    totalPecas: '(será calculado)', totalModulos: '-',
                    materiais: [], modulos: [],
                    _isDxf: true, fileName: file.name,
                });
                setNome(file.name.replace(/\.dxf$/i, ''));
                return;
            }
            try {
                const data = JSON.parse(e.target.result);
                setJsonData(data);
                const det = data.details_project || {};
                const ents = data.model_entities || {};
                let totalPecas = 0;
                const materiais = new Set();
                const modulos = new Set();
                for (const mIdx of Object.keys(ents)) {
                    const mod = ents[mIdx];
                    if (!mod?.entities) continue;
                    if (mod.upmmasterdescription) modulos.add(mod.upmmasterdescription);
                    for (const eIdx of Object.keys(mod.entities)) {
                        const ent = mod.entities[eIdx];
                        if (ent?.upmpiece) {
                            totalPecas++;
                            if (ent.entities) {
                                for (const sIdx of Object.keys(ent.entities)) {
                                    const sub = ent.entities[sIdx];
                                    if (sub?.upmfeedstockpanel && sub.upmmaterialcode) {
                                        materiais.add(sub.upmmaterialcode);
                                    }
                                }
                            }
                        }
                    }
                }
                setPreview({
                    cliente: det.client_name || det.cliente || '',
                    projeto: det.project_name || det.projeto || '',
                    codigo: det.project_code || det.codigo || '',
                    vendedor: det.seller_name || det.vendedor || '',
                    totalPecas,
                    totalModulos: modulos.size,
                    materiais: [...materiais],
                    modulos: [...modulos],
                });
                setNome(det.project_name || det.projeto || file.name.replace('.json', ''));

                // Verifica materiais não cadastrados.
                if (materiais.size > 0) {
                    setCheckingMats(true);
                    const matList = [...materiais].map(mc => {
                        const m = mc.match(/_(\d+(?:\.\d+)?)_/);
                        return { material_code: mc, espessura: m ? parseFloat(m[1]) : 0 };
                    });
                    setMatCheckError(null);
                    Promise.all([
                        api.post('/cnc/chapas/verificar-materiais', { materiais: matList }),
                        api.get('/cnc/chapas'),
                    ]).then(([result, chapas]) => {
                        setChapasDisponiveis(chapas.filter(c => c.ativo !== 0));
                        if (result.nao_cadastrados?.length > 0) {
                            setMatCheck(result);
                            setMatEdits({});
                            setMatActions({});
                            setMatVinculos({});
                            setMatConfirmados({});
                        } else {
                            setMatCheck(null);
                        }
                    }).catch(err => {
                        const msg = err?.error || err?.message || 'Erro ao verificar materiais';
                        setMatCheckError(msg);
                        notify(msg, 'error');
                        setMatCheck(null);
                    }).finally(() => setCheckingMats(false));
                }
            } catch (err) {
                notify('Erro ao ler JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    const doImport = async () => {
        if (!jsonData) return;
        setImporting(true);
        try {
            let r;
            if (jsonData._isDxf) {
                r = await api.post('/cnc/lotes/importar-dxf', { dxfContent: jsonData.dxfContent, nome });
                if (r.warnings?.length) notify(`Avisos: ${r.warnings.join(', ')}`);
            } else {
                r = await api.post('/cnc/lotes/importar', { json: jsonData, nome });
            }
            notify(`Lote importado: ${r.total_pecas} peças`);
            setPreview(null);
            setJsonData(null);
            setNome('');
            setLastImportedLote(r);
            loadLotes();
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setImporting(false);
        }
    };

    const totalPendentes = matCheck?.nao_cadastrados?.length || 0;
    const totalResolvidos = Object.keys(matConfirmados).filter(k => matConfirmados[k]).length;

    // Lotes que precisam de ação (importado sem otimizar, ou otimizado sem enviar)
    const lotesAtivos = lotes.filter(l => !['concluido'].includes(l.status));
    const lotesComAcao = lotesAtivos.slice(0, 3);

    const getAcaoLote = (l) => {
        if (l.status === 'produzindo') return { label: 'Produção em andamento', color: 'var(--warning)', tab: 'gcode', icon: '▶' };
        if (l.status === 'otimizado') return { label: 'Pronto para corte', color: 'var(--success)', tab: 'gcode', icon: '⚡' };
        if (l.aproveitamento > 0) return { label: 'Plano gerado', color: 'var(--info)', tab: 'plano', icon: '✓' };
        if (l.total_pecas > 0) return { label: 'Aguardando otimização', color: '#8B5CF6', tab: 'plano', icon: '○' };
        return { label: 'Ver peças', color: 'var(--text-muted)', tab: 'pecas', icon: '→' };
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Lotes pendentes — mostrar primeiro se existirem (item #1) ── */}
            {lotesComAcao.length > 0 && !preview && (
                <div style={{ marginBottom: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
                        Continuar produção
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {lotesComAcao.map(l => {
                            const acao = getAcaoLote(l);
                            const diasRestantes = l.data_entrega
                                ? Math.ceil((new Date(l.data_entrega + 'T12:00:00') - new Date()) / 86400000)
                                : null;
                            const isAtrasado = diasRestantes !== null && diasRestantes < 0;
                            return (
                                <div key={l.id}
                                    onClick={() => setLoteAtual(l, acao.tab)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
                                >
                                    <span style={{
                                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                        background: `${acao.color}14`, border: `1px solid ${acao.color}28`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 14, color: acao.color,
                                    }}>{acao.icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {l.nome}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                            {l.total_pecas} peças
                                            {l.cliente && ` · ${l.cliente}`}
                                            {l.projeto && ` / ${l.projeto}`}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                        {isAtrasado && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: '2px 7px', borderRadius: 10 }}>
                                                {Math.abs(diasRestantes)}d atrasado
                                            </span>
                                        )}
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${acao.color}14`, color: acao.color, border: `1px solid ${acao.color}28` }}>
                                            {acao.label}
                                        </span>
                                        <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                </div>
                            );
                        })}
                        {lotesAtivos.length > 3 && (
                            <button onClick={() => setTab('lotes')} style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}>
                                Ver todos os {lotesAtivos.length} lotes ativos →
                            </button>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 2px' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Importar novo lote</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>
                </div>
            )}

            {/* ── Drop zone ── */}
            <div
                className="glass-card"
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                    e.preventDefault(); setDragging(false);
                    handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Área de upload — clique ou arraste um arquivo JSON ou DXF"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                style={{
                    padding: 48, textAlign: 'center', cursor: 'pointer',
                    border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                    background: dragging
                        ? 'var(--primary-alpha)'
                        : 'linear-gradient(180deg, var(--bg-subtle) 0%, transparent 100%)',
                    transition: 'all .2s',
                }}
            >
                <div style={{
                    width: 64, height: 64, borderRadius: 18,
                    background: dragging ? 'var(--primary-alpha)' : 'var(--bg-muted)',
                    border: `1px dashed ${dragging ? 'var(--primary)' : 'var(--border-hover)'}`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14, transition: 'all .2s',
                }}>
                    <Upload
                        size={28}
                        strokeWidth={2}
                        style={{ color: dragging ? 'var(--primary)' : 'var(--text-muted)' }}
                    />
                </div>
                <div style={{
                    fontSize: 15, fontWeight: 700,
                    color: 'var(--text-primary)', marginBottom: 6,
                    letterSpacing: '-0.01em',
                }}>
                    {dragging ? 'Solte o arquivo aqui' : 'Arraste o arquivo ou clique para selecionar'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    JSON (Plugin SketchUp) ou DXF (Promob, AutoCAD, etc.)
                </div>
                <input
                    ref={fileRef} type="file" accept=".json,.dxf"
                    style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files?.[0])}
                />
            </div>

            {/* ── Preview do arquivo ── */}
            {preview && (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <SectionHeader
                        icon={Eye}
                        title="Preview do arquivo"
                        accent="var(--primary)"
                    >
                        <span style={{
                            fontSize: 11, fontWeight: 700,
                            padding: '3px 10px', borderRadius: 6,
                            background: 'var(--primary-alpha)',
                            color: 'var(--primary)',
                            border: '1px solid var(--primary)',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                            {preview._isDxf ? 'DXF' : 'JSON'}
                        </span>
                    </SectionHeader>

                    <div style={{ padding: '16px 20px' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 12, marginBottom: 16,
                        }}>
                            <InfoCard label="Cliente" value={preview.cliente} />
                            <InfoCard label="Projeto" value={preview.projeto} />
                            <InfoCard label="Código" value={preview.codigo} />
                            <InfoCard label="Vendedor" value={preview.vendedor} />
                            <InfoCard label="Total Peças" value={preview.totalPecas} highlight />
                            <InfoCard label="Módulos" value={preview.totalModulos} />
                            <InfoCard label="Materiais" value={preview.materiais.join(', ') || 'N/A'} />
                        </div>

                        {/* Action bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            flexWrap: 'wrap', paddingTop: 12,
                            borderTop: '1px solid var(--border)',
                        }}>
                            <label style={{
                                fontSize: 11, fontWeight: 700,
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase', letterSpacing: '0.06em',
                            }}>Nome:</label>
                            <input
                                value={nome}
                                onChange={e => setNome(e.target.value)}
                                placeholder="Nome do lote"
                                className={Z.inp}
                                style={{ flex: 1, minWidth: 220, fontSize: 13 }}
                                aria-label="Nome do lote"
                            />
                            <button
                                onClick={() => {
                                    setPreview(null);
                                    setJsonData(null);
                                    setMatCheck(null);
                                }}
                                className="btn-secondary"
                                style={{ padding: '9px 16px', fontSize: 13, gap: 6 }}
                                aria-label="Cancelar importação"
                            >
                                <X size={14} /> Cancelar
                            </button>
                            <button
                                onClick={doImport}
                                disabled={importing || checkingMats || !!matCheckError}
                                title={matCheckError ? `Bloqueado: ${matCheckError}` : undefined}
                                className="btn-primary"
                                style={{ padding: '9px 22px', fontSize: 13, gap: 6 }}
                                aria-label="Importar lote"
                            >
                                <FileCode2 size={14} />
                                {importing ? 'Importando…'
                                    : checkingMats ? 'Verificando materiais…'
                                    : 'Importar Lote'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Materiais não cadastrados — P19: só exibe enquanto há pendências ── */}
            {preview && matCheck?.nao_cadastrados?.length > 0 && totalResolvidos < totalPendentes && (
                <div className="glass-card" style={{
                    padding: 0, overflow: 'hidden',
                    borderLeft: '3px solid var(--warning)',
                }}>
                    <SectionHeader
                        icon={AlertTriangle}
                        title="Materiais não reconhecidos"
                        accent="var(--warning)"
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                                fontSize: 11, fontWeight: 700,
                                color: 'var(--text-muted)',
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                                {totalResolvidos} / {totalPendentes} resolvido(s)
                            </span>
                        </div>
                    </SectionHeader>

                    <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <p style={{
                            fontSize: 12.5, color: 'var(--text-muted)', margin: 0, marginBottom: 4,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <Info size={13} />
                            Vincule cada material a uma chapa existente ou cadastre uma nova.
                        </p>
                        {matCheck.nao_cadastrados.map((mat, i) => {
                            const action = matActions[i] || 'vincular';
                            const edit = matEdits[i] || mat.sugestao;
                            const updateField = (k, v) => setMatEdits(prev => ({
                                ...prev, [i]: { ...(prev[i] || mat.sugestao), [k]: v },
                            }));

                            const espMat = mat.espessura || 0;
                            const chapasFiltradas = espMat
                                ? chapasDisponiveis.filter(c => Math.abs((c.espessura_real || c.espessura_nominal) - espMat) <= 2)
                                : chapasDisponiveis;
                            const chapasOutras = espMat
                                ? chapasDisponiveis.filter(c => Math.abs((c.espessura_real || c.espessura_nominal) - espMat) > 2)
                                : [];

                            const confirmado = matConfirmados[i];
                            return (
                                <div key={mat.material_code} style={{
                                    padding: 12, borderRadius: 10,
                                    background: confirmado ? 'var(--success-bg)' : 'var(--bg-card)',
                                    border: `1px solid ${confirmado ? 'var(--success)' : 'var(--border)'}`,
                                    opacity: confirmado ? 0.85 : 1,
                                    transition: 'all .15s',
                                }}>
                                    {/* Header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        marginBottom: confirmado ? 0 : 10, flexWrap: 'wrap',
                                    }}>
                                        {confirmado && (
                                            <div style={{
                                                width: 22, height: 22, borderRadius: '50%',
                                                background: 'var(--success)',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Check size={13} style={{ color: '#fff' }} strokeWidth={3} />
                                            </div>
                                        )}
                                        <span style={{
                                            fontSize: 13, fontWeight: 700,
                                            color: confirmado ? 'var(--success)' : 'var(--text-primary)',
                                        }}>
                                            {mat.material_code.replace(/_/g, ' ')}
                                        </span>
                                        <span style={{
                                            fontSize: 11, fontWeight: 600,
                                            color: 'var(--text-muted)',
                                            background: 'var(--bg-muted)',
                                            border: '1px solid var(--border)',
                                            padding: '2px 8px', borderRadius: 20,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {mat.espessura || '?'}mm
                                        </span>
                                        {mat.fallback_chapa && (
                                            <span style={{
                                                fontSize: 11, color: 'var(--danger)',
                                                fontStyle: 'italic',
                                            }}>
                                                usando &ldquo;{mat.fallback_chapa.nome}&rdquo; por fallback
                                            </span>
                                        )}
                                    </div>

                                    {/* Toggle ação (segmented) */}
                                    {!confirmado && (
                                        <div style={{
                                            display: 'flex', gap: 0, marginBottom: 10,
                                            padding: 3, borderRadius: 8,
                                            background: 'var(--bg-muted)',
                                            border: '1px solid var(--border)',
                                            width: 'fit-content',
                                        }}>
                                            {[
                                                { id: 'vincular', lb: 'Vincular chapa existente', ic: Link2 },
                                                { id: 'cadastrar', lb: 'Cadastrar nova', ic: PlusCircle },
                                            ].map(opt => {
                                                const on = action === opt.id;
                                                const OptIcon = opt.ic;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => setMatActions(p => ({ ...p, [i]: opt.id }))}
                                                        aria-pressed={on}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                            fontSize: 12, padding: '6px 14px', borderRadius: 6,
                                                            cursor: 'pointer', border: 'none',
                                                            fontWeight: on ? 700 : 500,
                                                            background: on ? 'var(--bg-card)' : 'transparent',
                                                            color: on ? 'var(--primary)' : 'var(--text-muted)',
                                                            boxShadow: on ? 'var(--shadow-sm)' : 'none',
                                                            transition: 'all .15s',
                                                        }}
                                                    >
                                                        <OptIcon size={12} />
                                                        {opt.lb}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Vincular */}
                                    {!confirmado && action === 'vincular' && (
                                        <div>
                                            <select
                                                value={matVinculos[i] || ''}
                                                onChange={e => setMatVinculos(p => ({ ...p, [i]: Number(e.target.value) }))}
                                                className={Z.inp}
                                                style={{ fontSize: 13, width: '100%' }}
                                                aria-label={`Chapa para ${mat.material_code}`}
                                            >
                                                <option value="">Selecione a chapa…</option>
                                                {chapasFiltradas.length > 0 && (
                                                    <optgroup label={`Mesma espessura (~${espMat}mm)`}>
                                                        {chapasFiltradas.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.nome} — {c.espessura_real || c.espessura_nominal}mm ({c.comprimento}×{c.largura})
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {chapasOutras.length > 0 && (
                                                    <optgroup label="Outras espessuras">
                                                        {chapasOutras.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.nome} — {c.espessura_real || c.espessura_nominal}mm ({c.comprimento}×{c.largura})
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </select>
                                            {matVinculos[i] && (
                                                <div style={{
                                                    fontSize: 12, color: 'var(--success)',
                                                    marginTop: 8,
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                }}>
                                                    <CheckCircle2 size={12} />
                                                    Será tratado como a chapa selecionada na otimização
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Cadastrar nova */}
                                    {!confirmado && action === 'cadastrar' && (
                                        <div>
                                        {mat.espessura === 0 && (
                                            <div style={{
                                                fontSize: 11, padding: '6px 10px', borderRadius: 6, marginBottom: 8,
                                                background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                                                color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 6,
                                            }}>
                                                <AlertTriangle size={12} />
                                                Espessura não detectada no código "{mat.material_code}". Verifique e preencha manualmente.
                                            </div>
                                        )}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                            gap: 8,
                                        }}>
                                            {[
                                                { k: 'nome', lb: 'Nome', type: 'text' },
                                                { k: 'comprimento', lb: 'Comp. (mm)', type: 'number' },
                                                { k: 'largura', lb: 'Larg. (mm)', type: 'number' },
                                                { k: 'espessura_real', lb: 'Esp. Real', type: 'number', step: '0.1' },
                                                { k: 'preco', lb: 'Preço (R$)', type: 'number', step: '0.01' },
                                            ].map(f => (
                                                <FieldLabel key={f.k} label={f.lb}>
                                                    <input
                                                        type={f.type}
                                                        step={f.step}
                                                        value={edit[f.k] ?? ''}
                                                        onChange={e => updateField(
                                                            f.k,
                                                            f.type === 'number' ? Number(e.target.value) : e.target.value
                                                        )}
                                                        className={Z.inp}
                                                        style={{ fontSize: 13, width: '100%' }}
                                                    />
                                                </FieldLabel>
                                            ))}
                                            <FieldLabel label="Veio">
                                                <select
                                                    value={['horizontal','vertical','com_veio'].includes(edit.veio) ? 'com_veio' : 'sem_veio'}
                                                    onChange={e => updateField('veio', e.target.value)}
                                                    className={Z.inp}
                                                    style={{ fontSize: 13, width: '100%' }}
                                                >
                                                    <option value="sem_veio">Sem veio</option>
                                                    <option value="com_veio">Com veio</option>
                                                </select>
                                            </FieldLabel>
                                        </div>
                                        </div>
                                    )}

                                    {/* Confirmar */}
                                    {!matConfirmados[i] && (
                                        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                disabled={checkingMats || (action === 'vincular' && !matVinculos[i])}
                                                onClick={async () => {
                                                    setCheckingMats(true);
                                                    try {
                                                        if (action === 'vincular' && matVinculos[i]) {
                                                            await api.post('/cnc/chapa-aliases', {
                                                                material_code_importado: mat.material_code,
                                                                chapa_id: matVinculos[i],
                                                            });
                                                            notify(`"${mat.material_code.replace(/_/g, ' ')}" vinculado`);
                                                        } else if (action === 'cadastrar') {
                                                            const chapaData = {
                                                                ...(matEdits[i] || mat.sugestao),
                                                                material_code: mat.material_code,
                                                                espessura_nominal: mat.espessura || (matEdits[i] || mat.sugestao).espessura_nominal,
                                                            };
                                                            // Validação de dimensões mínimas
                                                            if (!chapaData.comprimento || chapaData.comprimento <= 0 ||
                                                                !chapaData.largura || chapaData.largura <= 0) {
                                                                notify('Comprimento e largura devem ser maiores que zero', 'error');
                                                                setCheckingMats(false);
                                                                return;
                                                            }
                                                            if (chapaData.comprimento < chapaData.largura) {
                                                                notify('Comprimento deve ser maior ou igual à largura', 'error');
                                                                setCheckingMats(false);
                                                                return;
                                                            }
                                                            const r = await api.post('/cnc/chapas', chapaData);
                                                            const novaChapa = { id: r.id, ...chapaData, ativo: 1 };
                                                            setChapasDisponiveis(prev => [...prev, novaChapa]);
                                                            notify(`Chapa "${chapaData.nome}" cadastrada`);
                                                        }
                                                        setMatConfirmados(prev => ({ ...prev, [i]: true }));
                                                    } catch (err) {
                                                        notify('Erro: ' + (err.error || err.message));
                                                    } finally {
                                                        setCheckingMats(false);
                                                    }
                                                }}
                                                className={action === 'vincular' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                                                style={{
                                                    fontSize: 12, padding: '7px 18px', gap: 6,
                                                    opacity: (action === 'vincular' && !matVinculos[i]) ? 0.4 : 1,
                                                }}
                                                aria-label={action === 'vincular' ? 'Vincular material' : 'Cadastrar chapa'}
                                            >
                                                {action === 'vincular'
                                                    ? (<><Link2 size={12} /> Vincular</>)
                                                    : (<><PlusCircle size={12} /> Cadastrar Chapa</>)
                                                }
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Info — resolvidos por fallback */}
                        {matCheck?.cadastrados?.length > 0
                            && matCheck.cadastrados.some(c => c.match_type === 'fallback_espessura') && (
                            <div style={{
                                padding: '10px 12px', borderRadius: 8,
                                background: 'var(--primary-alpha)',
                                border: '1px solid var(--primary)',
                                fontSize: 12, color: 'var(--primary)',
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                            }}>
                                <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>
                                    <b>Info:</b> {matCheck.cadastrados.filter(c => c.match_type === 'fallback_espessura').length} material(is)
                                    {' '}resolvido(s) por espessura (fallback), não por código exato.
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Prompt pós-import ── */}
            {lastImportedLote && (
                <div className="glass-card" style={{
                    padding: '14px 18px',
                    background: 'var(--success-bg)',
                    border: '1px solid var(--success-border)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12, flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'var(--success)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <CheckCircle2 size={18} style={{ color: '#fff' }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                                Lote importado com sucesso
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {lastImportedLote.total_pecas} peças prontas para otimização
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setLoteAtual(lastImportedLote, 'pecas')}
                        className="btn-primary"
                        style={{ padding: '9px 20px', fontSize: 13, gap: 6 }}
                        aria-label="Abrir lote importado"
                    >
                        Abrir Lote <ChevronRight size={14} />
                    </button>
                </div>
            )}

            {/* ── Resumo dos lotes existentes ── */}
            {lotes.length > 0 && !preview && (
                <div style={{
                    padding: '12px 16px', borderRadius: 12,
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                }}>
                    <span style={{
                        fontSize: 13, color: 'var(--text-secondary)',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: 'var(--primary-alpha)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Package size={14} style={{ color: 'var(--primary)' }} />
                        </div>
                        <b style={{ color: 'var(--text-primary)' }}>{lotes.length}</b>
                        {' '}lote(s) já importado(s)
                    </span>
                    <button
                        onClick={() => setTab('lotes')}
                        className="btn-secondary btn-sm"
                        style={{ fontSize: 12, gap: 6 }}
                        aria-label="Ver todos os lotes"
                    >
                        Ver Lotes <ChevronRight size={13} />
                    </button>
                </div>
            )}
        </div>
    );
}

// Label padrão para campos de formulário.
function FieldLabel({ label, children }) {
    return (
        <div>
            <label style={{
                fontSize: 11, fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                display: 'block', marginBottom: 5,
            }}>
                {label}
            </label>
            {children}
        </div>
    );
}
