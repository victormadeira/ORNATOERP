// Tab "Importar" — drop-zone JSON/DXF + preview + resolução de materiais.
// Refatorado em Fase B: imports enxutos, tokens do design system, tamanhos consistentes.

import { useState, useRef } from 'react';
import api from '../../../api';
import { Z } from '../../../ui';
import {
    Upload, Eye, AlertTriangle, CheckCircle2, Check,
    ChevronRight, Package,
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
                // DXF — backend parseia.
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
                    }).catch(() => setMatCheck(null))
                      .finally(() => setCheckingMats(false));
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Drop zone */}
            <div
                className="glass-card"
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                    e.preventDefault(); setDragging(false);
                    handleFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileRef.current?.click()}
                style={{
                    padding: 40, textAlign: 'center', cursor: 'pointer',
                    border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                    background: dragging ? 'var(--primary-alpha)' : 'transparent',
                    borderRadius: 12, transition: 'all .2s',
                }}
            >
                <Upload
                    size={36}
                    style={{
                        color: dragging ? 'var(--primary)' : 'var(--text-muted)',
                        margin: '0 auto 12px',
                    }}
                />
                <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: 'var(--text-primary)', marginBottom: 4,
                }}>
                    Arraste o arquivo JSON ou DXF, ou clique para selecionar
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    JSON (Plugin SketchUp) ou DXF (Promob, AutoCAD, etc.)
                </div>
                <input
                    ref={fileRef} type="file" accept=".json,.dxf"
                    style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files?.[0])}
                />
            </div>

            {/* Preview do arquivo */}
            {preview && (
                <div className="glass-card" style={{ padding: 16 }}>
                    <h3 style={{
                        fontSize: 14, fontWeight: 700, margin: 0, marginBottom: 12,
                        color: 'var(--text-primary)',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <Eye size={16} style={{ color: 'var(--primary)' }} />
                        Preview do arquivo
                    </h3>
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

                    {/* ── Materiais não cadastrados ── */}
                    {matCheck?.nao_cadastrados?.length > 0 && (
                        <div style={{
                            marginBottom: 16, padding: 14, borderRadius: 8,
                            background: 'var(--warning-bg)',
                            border: '1px solid var(--warning)',
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: 12, flexWrap: 'wrap',
                            }}>
                                <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                                <span style={{
                                    fontSize: 13, fontWeight: 700, color: 'var(--warning)',
                                }}>
                                    {matCheck.nao_cadastrados.length} material(is) não reconhecido(s)
                                </span>
                                <span style={{
                                    fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto',
                                }}>
                                    Vincule a uma chapa existente ou cadastre uma nova
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                                            padding: 12, borderRadius: 8,
                                            background: confirmado ? 'var(--success-bg)' : 'var(--bg-card)',
                                            border: `1px solid ${confirmado ? 'var(--success)' : 'var(--border)'}`,
                                            opacity: confirmado ? 0.75 : 1,
                                            transition: 'all .15s',
                                        }}>
                                            {/* Header */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                marginBottom: confirmado ? 0 : 8, flexWrap: 'wrap',
                                            }}>
                                                {confirmado && <Check size={14} style={{ color: 'var(--success)' }} />}
                                                <span style={{
                                                    fontSize: 13, fontWeight: 700,
                                                    color: confirmado ? 'var(--success)' : 'var(--text-primary)',
                                                }}>
                                                    {mat.material_code.replace(/_/g, ' ')}
                                                </span>
                                                <span style={{
                                                    fontSize: 11, color: 'var(--text-muted)',
                                                    background: 'var(--bg-muted)', padding: '2px 8px',
                                                    borderRadius: 6, fontWeight: 600,
                                                }}>
                                                    {mat.espessura || '?'}mm
                                                </span>
                                                {mat.fallback_chapa && (
                                                    <span style={{
                                                        fontSize: 11, color: 'var(--danger)',
                                                        fontStyle: 'italic',
                                                    }}>
                                                        usando "{mat.fallback_chapa.nome}" por fallback
                                                    </span>
                                                )}
                                            </div>

                                            {/* Toggle ação */}
                                            {!confirmado && (
                                                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                                    {[
                                                        { id: 'vincular', lb: 'Vincular a chapa existente' },
                                                        { id: 'cadastrar', lb: 'Cadastrar nova chapa' },
                                                    ].map(opt => {
                                                        const on = action === opt.id;
                                                        const color = opt.id === 'cadastrar' ? 'var(--warning)' : 'var(--primary)';
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                onClick={() => setMatActions(p => ({ ...p, [i]: opt.id }))}
                                                                style={{
                                                                    fontSize: 12, padding: '5px 14px', borderRadius: 6,
                                                                    cursor: 'pointer', border: '1px solid var(--border)',
                                                                    fontWeight: on ? 700 : 500,
                                                                    background: on ? color : 'transparent',
                                                                    color: on ? '#fff' : 'var(--text-muted)',
                                                                    transition: 'all .15s',
                                                                }}
                                                            >
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
                                                            marginTop: 6,
                                                        }}>
                                                            "{mat.material_code.replace(/_/g, ' ')}" será tratado como a chapa selecionada na otimização
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Cadastrar nova */}
                                            {!confirmado && action === 'cadastrar' && (
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
                                                        <div key={f.k}>
                                                            <label style={{
                                                                fontSize: 11, fontWeight: 600,
                                                                color: 'var(--text-muted)',
                                                                textTransform: 'uppercase', letterSpacing: 0.3,
                                                                display: 'block', marginBottom: 4,
                                                            }}>
                                                                {f.lb}
                                                            </label>
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
                                                        </div>
                                                    ))}
                                                    <div>
                                                        <label style={{
                                                            fontSize: 11, fontWeight: 600,
                                                            color: 'var(--text-muted)',
                                                            textTransform: 'uppercase', letterSpacing: 0.3,
                                                            display: 'block', marginBottom: 4,
                                                        }}>
                                                            Veio
                                                        </label>
                                                        <select
                                                            value={['horizontal','vertical','com_veio'].includes(edit.veio) ? 'com_veio' : 'sem_veio'}
                                                            onChange={e => updateField('veio', e.target.value)}
                                                            className={Z.inp}
                                                            style={{ fontSize: 13, width: '100%' }}
                                                        >
                                                            <option value="sem_veio">Sem veio</option>
                                                            <option value="com_veio">Com veio</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Confirmar */}
                                            {!matConfirmados[i] && (
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
                                                    style={{
                                                        marginTop: 10, padding: '7px 18px',
                                                        fontSize: 12, fontWeight: 700,
                                                        borderRadius: 6, cursor: 'pointer', border: 'none',
                                                        background: action === 'vincular' ? 'var(--primary)' : 'var(--warning)',
                                                        color: '#fff',
                                                        opacity: (action === 'vincular' && !matVinculos[i]) ? 0.4 : 1,
                                                        transition: 'opacity .15s',
                                                    }}
                                                >
                                                    {action === 'vincular' ? 'Vincular' : 'Cadastrar Chapa'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {matCheck?.cadastrados?.length > 0
                        && matCheck.cadastrados.some(c => c.match_type === 'fallback_espessura') && (
                        <div style={{
                            marginBottom: 12, padding: '10px 14px', borderRadius: 8,
                            background: 'var(--primary-alpha)',
                            border: '1px solid var(--primary)',
                            fontSize: 12, color: 'var(--primary)',
                        }}>
                            <strong>Info:</strong> {matCheck.cadastrados.filter(c => c.match_type === 'fallback_espessura').length} material(is)
                            resolvido(s) por espessura (fallback), não por código exato.
                        </div>
                    )}

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}>
                        <input
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            placeholder="Nome do lote"
                            className={Z.inp}
                            style={{ flex: 1, minWidth: 200, fontSize: 13 }}
                        />
                        <button
                            onClick={doImport}
                            disabled={importing || checkingMats}
                            className="btn-primary"
                            style={{ padding: '9px 24px', fontSize: 13 }}
                        >
                            {importing
                                ? 'Importando…'
                                : checkingMats
                                ? 'Verificando materiais…'
                                : 'Importar Lote'}
                        </button>
                        <button
                            onClick={() => {
                                setPreview(null);
                                setJsonData(null);
                                setMatCheck(null);
                            }}
                            className="btn-secondary"
                            style={{ padding: '9px 18px', fontSize: 13 }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Prompt pós-import */}
            {lastImportedLote && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 10,
                    background: 'var(--primary-alpha)',
                    border: '1px solid var(--primary)',
                    gap: 12, flexWrap: 'wrap',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle2 size={16} style={{ color: 'var(--primary)' }} />
                        <span style={{
                            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                        }}>
                            Lote importado com sucesso — {lastImportedLote.total_pecas} peças
                        </span>
                    </div>
                    <button
                        onClick={() => setLoteAtual(lastImportedLote, 'pecas')}
                        className="btn-primary"
                        style={{ padding: '9px 20px', fontSize: 13, gap: 6 }}
                    >
                        Abrir Lote <ChevronRight size={14} />
                    </button>
                </div>
            )}

            {/* Resumo dos lotes existentes */}
            {lotes.length > 0 && !preview && (
                <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: 'var(--bg-muted)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                }}>
                    <span style={{
                        fontSize: 13, color: 'var(--text-muted)',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                        <Package size={14} />
                        {lotes.length} lote(s) importado(s)
                    </span>
                    <button
                        onClick={() => setTab('lotes')}
                        className="btn-secondary"
                        style={{ padding: '7px 14px', fontSize: 12, gap: 6 }}
                    >
                        Ver Lotes <ChevronRight size={13} />
                    </button>
                </div>
            )}
        </div>
    );
}
