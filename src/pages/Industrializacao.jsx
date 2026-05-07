import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { Z, Spinner, Modal, PageHeader, EmptyState, TabBar } from '../ui';
import {
    Factory, ArrowRight, ArrowLeft, Scissors, Tag, Settings, CheckCircle2, Package,
    AlertTriangle, XCircle, Layers, Cpu, Printer, Download, Monitor, RefreshCw,
    Play, ChevronRight, PenTool, Eye, SlidersHorizontal, ChevronDown, ChevronUp,
    RotateCw, Wrench, Save, Plus, X
} from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../components/EditorEtiquetas';

const STEPS = [
    { id: 'pecas', label: 'Peças', icon: Package },
    { id: 'readiness', label: 'Readiness', icon: CheckCircle2 },
    { id: 'corte', label: 'Plano de Corte', icon: Scissors },
    { id: 'etiquetas', label: 'Etiquetas', icon: Tag },
    { id: 'cam', label: 'G-code', icon: Settings },
    { id: 'liberar', label: 'Liberar', icon: ArrowRight },
];

const READINESS_ICONS = { package: Package, layers: Layers, cpu: Cpu, scissors: Scissors, tag: Tag };
const STATUS_BADGE = {
    ok:       { bg: 'var(--success-bg)', color: 'var(--success-hover)', label: 'OK' },
    aviso:    { bg: 'var(--warning-bg)', color: 'var(--warning-hover)', label: 'Aviso' },
    erro:     { bg: 'var(--danger-bg)',  color: 'var(--danger-hover)',  label: 'Erro' },
    pendente: { bg: 'var(--info-bg)',    color: 'var(--info-hover)',    label: 'Pendente' },
};

// ═══════════════════════════════════════════════════════
// WIZARD PRINCIPAL
// ═══════════════════════════════════════════════════════
export default function Industrializacao({ notify, nav }) {
    const [step, setStep] = useState(0);
    const [ordens, setOrdens] = useState([]);
    const [opAtual, setOpAtual] = useState(null);
    const [projetos, setProjetos] = useState([]);
    const [loading, setLoading] = useState(true);

    // Carregar OPs e projetos com lotes
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ops, projs] = await Promise.all([
                api.get('/industrializacao/ordens').catch(() => []),
                api.get('/projetos').catch(() => []),
            ]);
            setOrdens(Array.isArray(ops) ? ops : []);
            const projsList = Array.isArray(projs) ? projs : (projs?.data || []);
            setProjetos(projsList.filter(p => p.orc_id));
        } catch (e) {
            notify('Erro ao carregar dados: ' + (e.error || e.message));
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // Criar nova OP
    const criarOP = async (projetoId, loteId) => {
        try {
            const r = await api.post('/industrializacao/ordens', { projeto_id: projetoId, lote_id: loteId });
            if (r.ok) {
                notify(`Ordem ${r.numero} criada!`);
                await load();
                // Selecionar a OP recém-criada
                const ops = await api.get('/industrializacao/ordens');
                const nova = ops.find(o => o.id === r.id);
                if (nova) { setOpAtual(nova); setStep(0); }
            }
        } catch (e) {
            notify('Erro: ' + (e.error || e.message));
        }
    };

    if (loading) return <div style={{ padding: 32 }}><Spinner text="Carregando industrialização..." /></div>;

    return (
        <div className="page-enter" style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <PageHeader icon={Factory} title="Industrialização" subtitle="Fluxo guiado: do projeto à liberação para produção" />

            {/* Seletor de OP ou criar nova */}
            <OPSelector
                ordens={ordens}
                projetos={projetos}
                opAtual={opAtual}
                setOpAtual={(op) => { setOpAtual(op); setStep(0); }}
                criarOP={criarOP}
                notify={notify}
                onRefresh={load}
            />

            {/* Wizard Steps */}
            {opAtual && (
                <>
                    <StepBar steps={STEPS} current={step} setCurrent={setStep} />
                    <div style={{ marginTop: 20 }}>
                        {step === 0 && <StepPecas op={opAtual} notify={notify} />}
                        {step === 1 && <StepReadiness op={opAtual} notify={notify} setStep={setStep} />}
                        {step === 2 && <StepCorte op={opAtual} notify={notify} />}
                        {step === 3 && <StepEtiquetas op={opAtual} notify={notify} />}
                        {step === 4 && <StepGcode op={opAtual} notify={notify} />}
                        {step === 5 && <StepLiberar op={opAtual} notify={notify} onRefresh={load} />}
                    </div>
                    {/* Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                        <button
                            onClick={() => setStep(s => Math.max(0, s - 1))}
                            disabled={step === 0}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', opacity: step === 0 ? 0.4 : 1 }}
                        >
                            <ArrowLeft size={16} /> Voltar
                        </button>
                        <button
                            onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                            disabled={step === STEPS.length - 1}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', opacity: step === STEPS.length - 1 ? 0.4 : 1 }}
                        >
                            Próximo <ArrowRight size={16} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// SELETOR DE OP
// ═══════════════════════════════════════════════════════
function OPSelector({ ordens, projetos, opAtual, setOpAtual, criarOP, notify, onRefresh }) {
    const [showNova, setShowNova] = useState(false);
    const [novaTab, setNovaTab] = useState('projeto'); // 'projeto' | 'json'
    const [projetoSel, setProjetoSel] = useState('');
    const [criando, setCriando] = useState(false);
    // JSON import state
    const [jsonData, setJsonData] = useState(null);
    const [jsonPreview, setJsonPreview] = useState(null);
    const [jsonNome, setJsonNome] = useState('');
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);

    const handleCriarDeProjeto = async () => {
        if (!projetoSel) return;
        setCriando(true);
        try {
            const lotes = await api.get(`/projetos/${projetoSel}/lotes`);
            const loteId = lotes.length > 0 ? lotes[lotes.length - 1].id : null;
            if (!loteId) {
                const r = await api.post(`/projetos/${projetoSel}/industrializar`);
                if (r.ok) {
                    await criarOP(Number(projetoSel), r.lote_id);
                } else {
                    notify('Erro ao industrializar: ' + (r.error || ''));
                }
            } else {
                await criarOP(Number(projetoSel), loteId);
            }
        } catch (e) {
            notify('Erro: ' + (e.error || e.message));
        }
        setCriando(false);
        setShowNova(false);
    };

    // Ler arquivo JSON
    const handleFile = (file) => {
        if (!file) return;
        if (!file.name.endsWith('.json')) { notify('Apenas arquivos .json são aceitos'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                setJsonData(data);
                // Preview: extrair info básica
                const details = data.details_project || {};
                const entities = data.model_entities || {};
                let pecasCount = 0;
                let modulosSet = new Set();
                let materiaisSet = new Set();
                for (const modIdx of Object.keys(entities)) {
                    const mod = entities[modIdx];
                    if (!mod?.entities) continue;
                    modulosSet.add(mod.upmmasterdescription || `Módulo ${modIdx}`);
                    for (const entIdx of Object.keys(mod.entities)) {
                        const ent = mod.entities[entIdx];
                        if (!ent?.upmpiece) continue;
                        pecasCount++;
                        // Tentar pegar material do panel sub-entity
                        if (ent.entities) {
                            for (const subIdx of Object.keys(ent.entities)) {
                                const sub = ent.entities[subIdx];
                                if (sub?.upmfeedstockpanel) materiaisSet.add(sub.upmmaterialcode || '?');
                            }
                        }
                    }
                }
                const hasMachining = !!data.machining && Object.keys(data.machining).length > 0;
                setJsonPreview({
                    cliente: details.client_name || details.client || details.cliente || '?',
                    projeto: details.project_name || details.project || details.projeto || '?',
                    vendedor: details.seller_name || details.seller || '',
                    pecas: pecasCount,
                    modulos: modulosSet.size,
                    materiais: materiaisSet.size,
                    materiaisList: [...materiaisSet].slice(0, 5),
                    modulosList: [...modulosSet].slice(0, 8),
                    hasMachining,
                    filename: file.name,
                });
                setJsonNome(details.project_name || details.project || details.projeto || file.name.replace('.json', ''));
            } catch (err) {
                notify('Erro ao ler JSON: ' + err.message);
                setJsonData(null);
                setJsonPreview(null);
            }
        };
        reader.readAsText(file);
    };

    const handleCriarDeJson = async () => {
        if (!jsonData) return;
        setCriando(true);
        try {
            const r = await api.post('/industrializacao/ordens/from-json', {
                json: jsonData,
                nome: jsonNome || undefined,
            });
            if (r.ok) {
                notify(`OP ${r.numero} criada! ${r.total_pecas} peças, ${r.materiais} materiais${r.tem_machining ? ', com usinagem CNC' : ''}`);
                await onRefresh();
                // Selecionar a OP recém-criada
                const ops = await api.get('/industrializacao/ordens');
                const nova = (Array.isArray(ops) ? ops : []).find(o => o.id === r.op_id);
                if (nova) { setOpAtual(nova); }
                setShowNova(false);
                setJsonData(null);
                setJsonPreview(null);
            }
        } catch (e) {
            notify('Erro ao importar: ' + (e.error || e.message));
        }
        setCriando(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    };

    const STATUS_COR = {
        rascunho: 'var(--muted)', readiness: 'var(--info)', otimizando: 'var(--warning)',
        otimizada: '#8b5cf6', etiquetas: '#06b6d4', gcode: '#ec4899', liberada: 'var(--success)'
    };

    return (
        <div className="glass-card" style={{ overflow: 'hidden', marginBottom: 20 }}>
            <div className="section-card-header">
                <div className="section-card-header-title">
                    <div className="section-card-header-icon" style={{ background: 'var(--primary-light)' }}>
                        <Layers size={14} style={{ color: 'var(--primary)' }} />
                    </div>
                    Ordem de Produção
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {opAtual && (
                        <span style={{
                            fontSize: 10, fontWeight: 700, padding: '3px 10px',
                            borderRadius: 20, background: (STATUS_COR[opAtual.status] || 'var(--muted)') + '15',
                            color: STATUS_COR[opAtual.status] || 'var(--muted)',
                            border: `1px solid ${(STATUS_COR[opAtual.status] || 'var(--muted)')}25`,
                            textTransform: 'uppercase', letterSpacing: '0.03em',
                        }}>
                            {opAtual.status}
                        </span>
                    )}
                    <button onClick={onRefresh} className="btn-secondary" title="Atualizar" style={{ padding: '5px 8px', minHeight: 0 }}>
                        <RefreshCw size={13} />
                    </button>
                </div>
            </div>
            <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <select
                        value={opAtual?.id || ''}
                        onChange={e => {
                            const op = ordens.find(o => o.id === Number(e.target.value));
                            setOpAtual(op || null);
                        }}
                        className="input-glass"
                        style={{ flex: 1, minWidth: 280, fontSize: 13, cursor: 'pointer' }}
                    >
                        <option value="">Selecione uma OP...</option>
                        {ordens.map(op => (
                            <option key={op.id} value={op.id}>
                                {op.numero} — {op.cliente_nome || op.projeto_nome || 'Sem projeto'} [{op.status}] ({op.total_pecas || 0} pç)
                            </option>
                        ))}
                    </select>

                    <button onClick={() => { setShowNova(!showNova); setJsonData(null); setJsonPreview(null); }} className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: 12, whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Nova OP
                    </button>
                </div>
            </div>

            {/* Nova OP — Duas abas */}
            {showNova && (
                <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Tabs */}
                    <TabBar
                        tabs={[
                            { id: 'projeto', label: 'De Projeto / Orçamento', icon: Package },
                            { id: 'json', label: 'De Arquivo JSON (SketchUp)', icon: Layers },
                        ]}
                        active={novaTab}
                        onChange={setNovaTab}
                    />

                    <div style={{ padding: 16 }}>
                        {/* Tab 1: De Projeto */}
                        {novaTab === 'projeto' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, fontWeight: 600 }}>Projeto:</span>
                                <select value={projetoSel} onChange={e => setProjetoSel(e.target.value)}
                                    className={Z.inp} style={{ minWidth: 280, fontSize: 12 }}>
                                    <option value="">Selecione um projeto com orçamento...</option>
                                    {projetos.map(p => (
                                        <option key={p.id} value={p.id}>{p.nome} — {p.cliente_nome || '?'}</option>
                                    ))}
                                </select>
                                <button onClick={handleCriarDeProjeto} disabled={!projetoSel || criando} className={Z.btn}
                                    style={{ padding: '8px 16px', fontSize: 12 }}>
                                    {criando ? 'Criando...' : 'Criar OP'}
                                </button>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Gera peças a partir do orçamento (dimensões básicas)
                                </span>
                            </div>
                        )}

                        {/* Tab 2: De JSON */}
                        {novaTab === 'json' && (
                            <div>
                                {!jsonPreview ? (
                                    /* Zona de upload */
                                    <div
                                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                        onDragLeave={() => setDragOver(false)}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            border: `2px dashed ${dragOver ? '#e67e22' : 'var(--border)'}`,
                                            borderRadius: 10, padding: '24px 16px', textAlign: 'center',
                                            cursor: 'pointer', background: dragOver ? '#e67e2210' : 'var(--bg-muted)',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <Download size={28} style={{ color: '#e67e22', marginBottom: 8 }} />
                                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0' }}>
                                            Arraste o arquivo JSON ou clique para selecionar
                                        </p>
                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                                            Exportado pelo Plugin Ornato para SketchUp ou compatível UpMobb
                                        </p>
                                        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
                                            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                                    </div>
                                ) : (
                                    /* Preview do JSON importado */
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <CheckCircle2 size={18} color="var(--success)" />
                                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {jsonPreview.filename}
                                                </span>
                                            </div>
                                            <button onClick={() => { setJsonData(null); setJsonPreview(null); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>
                                                <X size={12} style={{display:'inline',marginRight:4}} /> Limpar
                                            </button>
                                        </div>

                                        {/* Cards com info do JSON */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
                                            <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-muted)', textAlign: 'center' }}>
                                                <div style={{ fontSize: 20, fontWeight: 800, color: '#e67e22' }}>{jsonPreview.pecas}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Peças</div>
                                            </div>
                                            <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-muted)', textAlign: 'center' }}>
                                                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--info)' }}>{jsonPreview.modulos}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Módulos</div>
                                            </div>
                                            <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-muted)', textAlign: 'center' }}>
                                                <div style={{ fontSize: 20, fontWeight: 800, color: '#8b5cf6' }}>{jsonPreview.materiais}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Materiais</div>
                                            </div>
                                            <div style={{ padding: 10, borderRadius: 8, background: jsonPreview.hasMachining ? 'var(--success-bg)' : 'var(--warning-bg)', textAlign: 'center' }}>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: jsonPreview.hasMachining ? 'var(--success-hover)' : 'var(--warning-hover)' }}>
                                                    {jsonPreview.hasMachining ? 'Com CNC' : 'Sem CNC'}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Usinagem</div>
                                            </div>
                                        </div>

                                        {/* Detalhes */}
                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                            <span><strong>Cliente:</strong> {jsonPreview.cliente}</span>
                                            <span><strong>Projeto:</strong> {jsonPreview.projeto}</span>
                                            {jsonPreview.vendedor && <span><strong>Vendedor:</strong> {jsonPreview.vendedor}</span>}
                                        </div>

                                        {/* Módulos e materiais */}
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                            {jsonPreview.modulosList.map((m, i) => (
                                                <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#e0e7ff', color: '#3730a3', fontWeight: 500 }}>
                                                    {m}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                                            {jsonPreview.materiaisList.map((m, i) => (
                                                <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning-hover)', fontWeight: 500 }}>
                                                    {m}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Nome e botão criar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            <input type="text" value={jsonNome} onChange={e => setJsonNome(e.target.value)}
                                                placeholder="Nome da OP..." className={Z.inp}
                                                style={{ minWidth: 200, fontSize: 12 }} />
                                            <button onClick={handleCriarDeJson} disabled={criando} className={Z.btn}
                                                style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700 }}>
                                                {criando ? 'Importando...' : `Criar OP com ${jsonPreview.pecas} peças`}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP BAR
// ═══════════════════════════════════════════════════════
function StepBar({ steps, current, setCurrent }) {
    return (
        <div style={{
            display: 'flex', gap: 0, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
            padding: 4, border: '1px solid var(--border)', overflow: 'auto',
        }}>
            {steps.map((s, i) => {
                const active = i === current;
                const done = i < current;
                const I = s.icon;
                return (
                    <button key={s.id} onClick={() => setCurrent(i)} style={{
                        flex: 1, minWidth: 90, padding: '10px 8px', border: 'none', cursor: 'pointer',
                        borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: active ? 'var(--primary)' : done ? 'var(--primary-light)' : 'transparent',
                        color: active ? '#fff' : done ? 'var(--primary)' : 'var(--text-muted)',
                        fontWeight: active ? 700 : 500, fontSize: 12, transition: 'all 0.2s',
                        fontFamily: 'var(--font-sans)',
                        boxShadow: active ? '0 1px 3px rgba(0,0,0,.22)' : 'none',
                    }}>
                        <span style={{
                            width: 22, height: 22, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            background: active ? 'rgba(255,255,255,0.25)' : done ? 'var(--primary)' : 'var(--bg-muted)',
                            color: active ? '#fff' : done ? '#fff' : 'var(--text-muted)',
                            transition: 'all 0.2s',
                        }}>
                            {done ? '\u2713' : i + 1}
                        </span>
                        <span className="hide-mobile">{s.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 1: PEÇAS
// ═══════════════════════════════════════════════════════
function StepPecas({ op, notify }) {
    const [pecas, setPecas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filtroMat, setFiltroMat] = useState('');
    const [busca, setBusca] = useState('');

    useEffect(() => {
        if (!op?.lote_id) return;
        setLoading(true);
        api.get(`/cnc/lotes/${op.lote_id}`).then(d => {
            setPecas(d.pecas || []);
        }).catch(e => notify(e.error || 'Erro ao carregar peças'))
            .finally(() => setLoading(false));
    }, [op?.lote_id]);

    if (!op?.lote_id) return <LocalEmpty text="OP sem lote vinculado" />;
    if (loading) return <Spinner text="Carregando peças..." />;

    const materiais = [...new Set(pecas.map(p => p.material_code).filter(Boolean))];
    const filtered = pecas.filter(p => {
        if (filtroMat && p.material_code !== filtroMat) return false;
        if (busca) {
            const q = busca.toLowerCase();
            return (p.descricao || '').toLowerCase().includes(q) ||
                (p.material || '').toLowerCase().includes(q) ||
                (p.modulo_desc || '').toLowerCase().includes(q);
        }
        return true;
    });
    const totalInst = filtered.reduce((s, p) => s + p.quantidade, 0);
    const areaTot = filtered.reduce((s, p) => s + (p.comprimento * p.largura * p.quantidade) / 1e6, 0);

    return (
        <div>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                <KPI label="Peças únicas" value={filtered.length} highlight />
                <KPI label="Total instâncias" value={totalInst} />
                <KPI label="Materiais" value={materiais.length} />
                <KPI label="Área total" value={`${areaTot.toFixed(2)} m²`} />
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar peça..."
                    className={Z.inp} style={{ width: 200, fontSize: 12 }} />
                <select value={filtroMat} onChange={e => setFiltroMat(e.target.value)}
                    className={Z.inp} style={{ width: 180, fontSize: 12 }}>
                    <option value="">Todos materiais</option>
                    {materiais.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>

            {/* Tabela */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, whiteSpace: 'nowrap' }}>
                        <thead>
                            <tr>
                                {['#', 'Qtd', 'Material', 'Comp', 'Larg', 'Esp', 'Descrição', 'Módulo', 'B.Dir', 'B.Esq', 'B.Front', 'B.Tras'].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '6px 8px', fontSize: 10 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p, i) => (
                                <tr key={p.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{i + 1}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>{p.quantidade}</td>
                                    <td style={{ padding: '6px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.material_code || p.material}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.comprimento}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.largura}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.espessura}</td>
                                    <td style={{ padding: '6px 8px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.descricao}</td>
                                    <td style={{ padding: '6px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.modulo_desc}</td>
                                    <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_dir || '-'}</td>
                                    <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_esq || '-'}</td>
                                    <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_frontal || '-'}</td>
                                    <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_traseira || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 2: READINESS
// ═══════════════════════════════════════════════════════
function StepReadiness({ op, notify, setStep }) {
    const [readiness, setReadiness] = useState(null);
    const [loading, setLoading] = useState(false);

    const verificar = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api.get(`/industrializacao/ordens/${op.id}/readiness`);
            setReadiness(r);
        } catch (e) {
            notify('Erro: ' + (e.error || e.message));
        }
        setLoading(false);
    }, [op?.id]);

    useEffect(() => { verificar(); }, [verificar]);

    if (loading) return <Spinner text="Verificando prontidão fabril..." />;
    if (!readiness) return <LocalEmpty text="Clique para verificar readiness" />;

    return (
        <div>
            {/* Score */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
                padding: 20, background: 'var(--bg-card)', borderRadius: 12,
                border: '1px solid var(--border)', marginBottom: 20
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: 36, fontWeight: 800,
                        color: readiness.ok === readiness.total ? 'var(--success)' : readiness.erros > 0 ? 'var(--danger)' : 'var(--warning)'
                    }}>
                        {readiness.ok}/{readiness.total}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>CHECKS OK</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {readiness.erros > 0 && <MiniTag color="var(--danger)" label={`${readiness.erros} erro(s)`} />}
                    {readiness.avisos > 0 && <MiniTag color="var(--warning)" label={`${readiness.avisos} aviso(s)`} />}
                    {readiness.pendentes > 0 && <MiniTag color="#6366f1" label={`${readiness.pendentes} pendente(s)`} />}
                </div>
            </div>

            {/* Checks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {readiness.checks.map(check => {
                    const badge = STATUS_BADGE[check.status] || STATUS_BADGE.pendente;
                    const IconComp = READINESS_ICONS[check.icon] || CheckCircle2;
                    return (
                        <div key={check.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                            background: 'var(--bg-card)', borderRadius: 10,
                            border: `1px solid ${check.status === 'ok' ? 'var(--success-bg)' : check.status === 'erro' ? 'var(--danger-border)' : 'var(--border)'}`,
                        }}>
                            <IconComp size={18} style={{ color: badge.color, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {check.label}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {check.desc}
                                </div>
                            </div>
                            <span style={{
                                fontSize: 10, fontWeight: 700, padding: '3px 8px',
                                borderRadius: 4, background: badge.bg, color: badge.color,
                            }}>
                                {badge.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={verificar} className={Z.btn2}
                    style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={14} /> Re-verificar
                </button>
                {readiness.ok === readiness.total && (
                    <button onClick={() => setStep(2)} className={Z.btn}
                        style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Play size={14} /> Tudo OK — Ir para Plano de Corte
                    </button>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 3: PLANO DE CORTE
// ═══════════════════════════════════════════════════════
function StepCorte({ op, notify }) {
    const [plano, setPlano] = useState(null);
    const [loading, setLoading] = useState(false);
    const [otimizando, setOtimizando] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    // Configurações de otimização com valores padrão
    const [cfgCorte, setCfgCorte] = useState({
        kerf: 4,               // largura do disco (mm)
        refilo: 10,            // refilo da chapa (mm)
        espaco_pecas: 4,       // espaçamento entre peças (mm)
        direcao_corte: 'misto', // horizontal, vertical ou misto
        respeitar_veio: true,  // true = envia null (backend decide por veio do material), false = força rotação
        modo: 'maxrects',      // maxrects, guillotine, shelf, skyline
        iteracoes: 500,
        considerar_sobra: true,
        sobra_min_largura: 300,
        sobra_min_comprimento: 600,
    });

    const updateCfg = (key, val) => setCfgCorte(prev => ({ ...prev, [key]: val }));

    const loadPlano = useCallback(async () => {
        if (!op?.lote_id) return;
        setLoading(true);
        try {
            const lote = await api.get(`/cnc/lotes/${op.lote_id}`);
            if (lote.plano_json) {
                const p = typeof lote.plano_json === 'string' ? JSON.parse(lote.plano_json) : lote.plano_json;
                setPlano({ ...p, aproveitamento: lote.aproveitamento, status: lote.status });
                // Restaurar config usada na última otimização, se existir
                if (p.config_usada) {
                    const c = p.config_usada;
                    setCfgCorte(prev => ({
                        ...prev,
                        kerf: c.kerf ?? prev.kerf,
                        refilo: c.refiloOverride ?? prev.refilo,
                        espaco_pecas: c.spacing ?? prev.espaco_pecas,
                        direcao_corte: c.direcaoCorte ?? prev.direcao_corte,
                        respeitar_veio: c.permitirRotacao === null ? true : (c.permitirRotacao === undefined ? prev.respeitar_veio : false),
                        modo: c.binType ?? prev.modo,
                        iteracoes: c.maxIter ?? prev.iteracoes,
                        considerar_sobra: c.considerarSobra ?? prev.considerar_sobra,
                        sobra_min_largura: c.sobraMinW ?? prev.sobra_min_largura,
                        sobra_min_comprimento: c.sobraMinH ?? prev.sobra_min_comprimento,
                    }));
                }
            }
        } catch (e) { notify(e.error || 'Erro ao carregar plano'); }
        setLoading(false);
    }, [op?.lote_id]);

    useEffect(() => { loadPlano(); }, [loadPlano]);

    const otimizar = async () => {
        if (!op?.lote_id) return;
        setOtimizando(true);
        try {
            const r = await api.post(`/cnc/otimizar/${op.lote_id}`, {
                espaco_pecas: cfgCorte.espaco_pecas,
                kerf: cfgCorte.kerf,
                modo: cfgCorte.modo,
                permitir_rotacao: cfgCorte.respeitar_veio ? null : true,
                refilo: cfgCorte.refilo,
                iteracoes: cfgCorte.iteracoes,
                considerar_sobra: cfgCorte.considerar_sobra,
                sobra_min_largura: cfgCorte.sobra_min_largura,
                sobra_min_comprimento: cfgCorte.sobra_min_comprimento,
                direcao_corte: cfgCorte.direcao_corte,
            });
            notify(`Otimizado! ${r.chapas?.length || 0} chapa(s), ${r.aproveitamento}% aproveitamento`);
            await loadPlano();
            try { await api.put(`/industrializacao/ordens/${op.id}/status`, { status: 'otimizada' }); } catch (_) { }
        } catch (e) {
            notify('Erro: ' + (e.error || e.message));
        }
        setOtimizando(false);
    };

    if (!op?.lote_id) return <LocalEmpty text="OP sem lote vinculado" />;
    if (loading) return <Spinner text="Carregando plano de corte..." />;

    const inputSt = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, width: '100%' };
    const labelSt = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' };
    const fieldSt = { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 140px', minWidth: 120 };

    return (
        <div>
            {/* Painel de Configuração */}
            <div className="glass-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                <button onClick={() => setShowConfig(!showConfig)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SlidersHorizontal size={16} />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Configurações de Otimização</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                            Disco {cfgCorte.kerf}mm · Refilo {cfgCorte.refilo}mm · {cfgCorte.direcao_corte === 'misto' ? 'Misto' : cfgCorte.direcao_corte === 'horizontal' ? 'Horizontal' : 'Vertical'}{cfgCorte.respeitar_veio ? ' · Veio' : ''}
                        </span>
                    </div>
                    {showConfig ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showConfig && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                        {/* Linha 1: Parâmetros principais */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                            <div style={fieldSt}>
                                <label style={labelSt}>Largura do Disco (mm)</label>
                                <input type="number" value={cfgCorte.kerf} min={0} max={20} step={0.5}
                                    onChange={e => updateCfg('kerf', parseFloat(e.target.value) || 0)} style={inputSt} />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Serra/disco de corte</span>
                            </div>
                            <div style={fieldSt}>
                                <label style={labelSt}>Refilo (mm)</label>
                                <input type="number" value={cfgCorte.refilo} min={0} max={50} step={1}
                                    onChange={e => updateCfg('refilo', parseFloat(e.target.value) || 0)} style={inputSt} />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Margem de borda da chapa</span>
                            </div>
                            <div style={fieldSt}>
                                <label style={labelSt}>Espaçamento (mm)</label>
                                <input type="number" value={cfgCorte.espaco_pecas} min={0} max={20} step={0.5}
                                    onChange={e => updateCfg('espaco_pecas', parseFloat(e.target.value) || 0)} style={inputSt} />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Entre peças</span>
                            </div>
                            <div style={fieldSt}>
                                <label style={labelSt}>Direção de Corte</label>
                                <select value={cfgCorte.direcao_corte} onChange={e => updateCfg('direcao_corte', e.target.value)} style={inputSt}>
                                    <option value="misto">Misto (auto)</option>
                                    <option value="horizontal">Horizontal</option>
                                    <option value="vertical">Vertical</option>
                                </select>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Guilhotina / esquadrejadeira</span>
                            </div>
                        </div>

                        {/* Linha 2: Algoritmo + opções */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                            <div style={fieldSt}>
                                <label style={labelSt}>Algoritmo</label>
                                <select value={cfgCorte.modo} onChange={e => updateCfg('modo', e.target.value)} style={inputSt}>
                                    <option value="maxrects">MaxRects (geral)</option>
                                    <option value="guillotine">Guilhotina (esquadrejadeira)</option>
                                    <option value="shelf">Prateleira (shelf)</option>
                                    <option value="skyline">Skyline</option>
                                </select>
                            </div>
                            <div style={fieldSt}>
                                <label style={labelSt}>Iterações</label>
                                <input type="number" value={cfgCorte.iteracoes} min={50} max={5000} step={50}
                                    onChange={e => updateCfg('iteracoes', parseInt(e.target.value) || 300)} style={inputSt} />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Mais = melhor resultado, mais lento</span>
                            </div>
                            <div style={{ ...fieldSt, justifyContent: 'center' }}>
                                <label style={{ ...labelSt, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}
                                    title="Quando ativo, o otimizador não rotaciona peças em materiais com veio (horizontal/vertical). Materiais sem veio podem ser rotacionados livremente.">
                                    <input type="checkbox" checked={cfgCorte.respeitar_veio}
                                        onChange={e => updateCfg('respeitar_veio', e.target.checked)}
                                        style={{ width: 16, height: 16, accentColor: '#e67e22' }} />
                                    <RotateCw size={13} />
                                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>Respeitar veio do material</span>
                                </label>
                                <label style={{ ...labelSt, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, marginTop: 4 }}>
                                    <input type="checkbox" checked={cfgCorte.considerar_sobra}
                                        onChange={e => updateCfg('considerar_sobra', e.target.checked)}
                                        style={{ width: 16, height: 16, accentColor: '#e67e22' }} />
                                    <Layers size={13} />
                                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>Reaproveitar sobras</span>
                                </label>
                            </div>
                        </div>

                        {/* Linha 3: Sobras mínimas (condicional) */}
                        {cfgCorte.considerar_sobra && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                                <div style={fieldSt}>
                                    <label style={labelSt}>Sobra mín. largura (mm)</label>
                                    <input type="number" value={cfgCorte.sobra_min_largura} min={100} max={1000} step={50}
                                        onChange={e => updateCfg('sobra_min_largura', parseInt(e.target.value) || 300)} style={inputSt} />
                                </div>
                                <div style={fieldSt}>
                                    <label style={labelSt}>Sobra mín. comprimento (mm)</label>
                                    <input type="number" value={cfgCorte.sobra_min_comprimento} min={100} max={2000} step={50}
                                        onChange={e => updateCfg('sobra_min_comprimento', parseInt(e.target.value) || 600)} style={inputSt} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Botão otimizar */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={otimizar} disabled={otimizando} className={Z.btn}
                    style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    {otimizando ? <><RefreshCw size={14} className="spin" /> Otimizando...</> : <><Scissors size={14} /> Otimizar Plano de Corte</>}
                </button>
                {plano && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
                        Aproveitamento: {plano.aproveitamento || '?'}%
                    </span>
                )}
            </div>

            {/* Resultado */}
            {plano?.chapas && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Resumo */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                        <KPI label="Chapas" value={plano.chapas.length} highlight />
                        <KPI label="Aproveitamento" value={`${plano.aproveitamento || '?'}%`} />
                        <KPI label="Modo" value={plano.modo || 'maxrects'} />
                    </div>

                    {/* Lista de chapas — SVG proporcional */}
                    {plano.chapas.map((ch, i) => {
                        const cW = ch.comprimento || 2750;
                        const cH = ch.largura || 1850;
                        const refiloMm = ch.refilo != null ? ch.refilo : 10;
                        const kerfMm = ch.kerf || 4;
                        const nestW = cW - 2 * refiloMm; // área útil de nesting
                        const nestH = cH - 2 * refiloMm;
                        const margin = 30;
                        const maxPx = 700;
                        const sc = Math.min((maxPx - margin * 2) / cW, 400 / cH);
                        const svgW = cW * sc + margin * 2;
                        const svgH = cH * sc + margin * 2 + 14;
                        const approx = ch.aproveitamento?.toFixed(1) || '?';
                        const approxColor = parseFloat(approx) >= 80 ? 'var(--success-hover)' : parseFloat(approx) >= 60 ? '#ca8a04' : 'var(--danger-hover)';

                        return (
                            <div key={i} className="glass-card" style={{ padding: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                        Chapa {i + 1} — {ch.material || ch.material_code}
                                    </h4>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {cW}×{cH}mm | refilo {refiloMm}mm | disco {kerfMm}mm | {ch.pecas?.length || 0} pç
                                        </span>
                                        <span style={{
                                            fontSize: 12, fontWeight: 700, color: approxColor,
                                            background: approxColor + '18', padding: '2px 8px', borderRadius: 10
                                        }}>
                                            {approx}%
                                        </span>
                                    </div>
                                </div>
                                {/* SVG proporcional da chapa */}
                                <div style={{ display: 'flex', justifyContent: 'center', background: '#f9fafb', borderRadius: 8, border: '1px solid var(--border)', padding: 8 }}>
                                    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ maxWidth: '100%', height: 'auto' }}>
                                        {/* Fundo da chapa (incluindo refilo) */}
                                        <rect x={margin} y={14} width={cW * sc} height={cH * sc} fill="#d5cdc0" stroke="#a08060" strokeWidth={1.5} rx={2} />
                                        {/* Área útil de nesting (dentro do refilo) */}
                                        <rect x={margin + refiloMm * sc} y={14 + refiloMm * sc}
                                            width={nestW * sc} height={nestH * sc}
                                            fill="#e8e0d4" stroke="#a08060" strokeWidth={0.5} strokeDasharray="4 2" rx={1} />
                                        {/* Grid sutil — só na área útil */}
                                        <defs>
                                            <pattern id={`grid-${i}`} width={100 * sc} height={100 * sc} patternUnits="userSpaceOnUse" patternTransform={`translate(${margin + refiloMm * sc},${14 + refiloMm * sc})`}>
                                                <line x1={100 * sc} y1={0} x2={100 * sc} y2={100 * sc} stroke="#d0c8b8" strokeWidth={0.3} />
                                                <line x1={0} y1={100 * sc} x2={100 * sc} y2={100 * sc} stroke="#d0c8b8" strokeWidth={0.3} />
                                            </pattern>
                                        </defs>
                                        <rect x={margin + refiloMm * sc} y={14 + refiloMm * sc} width={nestW * sc} height={nestH * sc} fill={`url(#grid-${i})`} />
                                        {/* Label refilo (canto) */}
                                        {refiloMm > 0 && (
                                            <text x={margin + 3} y={14 + refiloMm * sc - 2} fontSize={7} fill="#a08060" fontFamily="Inter, sans-serif">refilo {refiloMm}mm</text>
                                        )}
                                        {/* Dimensões da chapa */}
                                        <text x={margin + cW * sc / 2} y={10} textAnchor="middle" fontSize={9} fill="#888" fontFamily="Inter, sans-serif">{cW}mm</text>
                                        <text x={margin - 6} y={14 + cH * sc / 2} textAnchor="middle" fontSize={9} fill="#888" fontFamily="Inter, sans-serif"
                                            transform={`rotate(-90, ${margin - 6}, ${14 + cH * sc / 2})`}>{cH}mm</text>
                                        {/* Peças — posicionadas COM offset de refilo */}
                                        {(ch.pecas || []).map((p, j) => {
                                            const px = margin + ((p.x || 0) + refiloMm) * sc;
                                            const py = 14 + ((p.y || 0) + refiloMm) * sc;
                                            const pw = (p.w || 0) * sc;
                                            const ph = (p.h || 0) * sc;
                                            const hue = (j * 47 + 180) % 360;
                                            const fillColor = `hsl(${hue}, 50%, 62%)`;
                                            const showLabel = pw > 30 && ph > 14;
                                            const labelW = p.rotated ? p.h : p.w;
                                            const labelH = p.rotated ? p.w : p.h;
                                            return (
                                                <g key={j}>
                                                    <rect x={px} y={py} width={pw} height={ph} fill={fillColor} stroke="rgba(0,0,0,0.25)" strokeWidth={0.8} rx={1} />
                                                    {showLabel && (
                                                        <text x={px + pw / 2} y={py + ph / 2 + 3} textAnchor="middle" fontSize={Math.min(9, pw / 8)} fill="#fff"
                                                            fontWeight="600" fontFamily="Inter, sans-serif" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                                                            {p.w}×{p.h}{p.rotated ? ' ↻' : ''}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}
                                        {/* Sobras — áreas livres em cor mais clara */}
                                        {(ch.retalhos || []).map((s, k) => {
                                            const sx = margin + ((s.x || 0) + refiloMm) * sc;
                                            const sy = 14 + ((s.y || 0) + refiloMm) * sc;
                                            const sw = (s.w || 0) * sc;
                                            const sh = (s.h || 0) * sc;
                                            return (
                                                <g key={`r${k}`}>
                                                    <rect x={sx} y={sy} width={sw} height={sh} fill="#86efac33" stroke="#22c55e" strokeWidth={0.5} strokeDasharray="3 1" rx={1} />
                                                    {sw > 40 && sh > 12 && (
                                                        <text x={sx + sw / 2} y={sy + sh / 2 + 3} textAnchor="middle" fontSize={7} fill="#16a34a" fontFamily="Inter, sans-serif">
                                                            {Math.round(s.w)}×{Math.round(s.h)}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!plano && (
                <LocalEmpty text="Nenhum plano de corte gerado. Clique em 'Otimizar Plano de Corte' acima." />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 4: ETIQUETAS
// ═══════════════════════════════════════════════════════
function StepEtiquetas({ op, notify }) {
    const [etiquetas, setEtiquetas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [templatePadrao, setTemplatePadrao] = useState(null);
    const [cfg, setCfg] = useState(null);
    const [modoEditor, setModoEditor] = useState(false);

    const loadEtiquetas = useCallback(async () => {
        if (!op?.lote_id) return;
        setLoading(true);
        try {
            const [ets, config, templates] = await Promise.all([
                api.get(`/cnc/etiquetas/${op.lote_id}`),
                api.get('/cnc/etiqueta-config').catch(() => null),
                api.get('/cnc/etiqueta-templates').catch(() => []),
            ]);
            setEtiquetas(ets);
            setCfg(config);
            const lista = templates?.data || templates || [];
            if (Array.isArray(lista) && lista.length > 0) {
                const def = lista.find(t => t.padrao) || lista[0];
                try {
                    const full = await api.get(`/cnc/etiqueta-templates/${def.id}`);
                    const tmpl = full.data || full;
                    if (typeof tmpl.elementos === 'string') tmpl.elementos = JSON.parse(tmpl.elementos);
                    setTemplatePadrao(tmpl);
                } catch (_) { }
            }
        } catch (e) { notify(e.error || 'Erro'); }
        setLoading(false);
    }, [op?.lote_id]);

    useEffect(() => { loadEtiquetas(); }, [loadEtiquetas]);

    const imprimir = () => {
        if (!templatePadrao) return;
        const cols = templatePadrao.colunas_impressao || 2;
        const margem = templatePadrao.margem_pagina || 8;
        const gap = templatePadrao.gap_etiquetas || 4;
        const wMm = templatePadrao.largura || 100;
        const hMm = templatePadrao.altura || 70;
        const styleId = 'etiqueta-print-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
        styleEl.textContent = `
            @media print {
                body * { visibility: hidden !important; }
                .print-area, .print-area * { visibility: visible !important; }
                .print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important;
                    display: grid !important; grid-template-columns: repeat(${cols}, ${wMm}mm) !important; gap: ${gap}mm !important; padding: 0 !important; }
                .print-area .etiqueta-svg-wrap { width: ${wMm}mm !important; height: ${hMm}mm !important; page-break-inside: avoid !important; }
                .print-area .etiqueta-svg-wrap svg { width: ${wMm}mm !important; height: ${hMm}mm !important; }
                .no-print { display: none !important; }
                @page { margin: ${margem}mm !important; size: A4 !important; }
            }`;
        window.print();
    };

    if (!op?.lote_id) return <LocalEmpty text="OP sem lote vinculado" />;
    if (loading) return <Spinner text="Carregando etiquetas..." />;

    // Modo Editor — abre o EditorEtiquetas completo
    if (modoEditor) {
        return (
            <div>
                <EditorEtiquetas
                    api={api}
                    notify={notify}
                    etiquetaConfig={cfg}
                    onBack={() => {
                        setModoEditor(false);
                        // Recarregar template após edição
                        loadEtiquetas();
                    }}
                    initialTemplateId={templatePadrao?.id}
                />
            </div>
        );
    }

    // Modo Preview — grid de etiquetas
    return (
        <div>
            <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={imprimir} disabled={!templatePadrao} className={Z.btn}
                    style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Printer size={14} /> Imprimir Etiquetas
                </button>
                <button onClick={() => setModoEditor(true)} className={Z.btn}
                    style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                        background: 'transparent', border: '1.5px solid var(--primary)', color: 'var(--primary)' }}>
                    <PenTool size={14} /> Editar Template
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {etiquetas.length} etiqueta(s)
                    {templatePadrao && <span style={{ color: 'var(--primary)', fontWeight: 600, marginLeft: 6 }}>| Template: {templatePadrao.nome}</span>}
                </span>
            </div>

            {templatePadrao ? (
                <div className="print-area" style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(280, (templatePadrao.largura || 100) * 3.5)}px, 1fr))`,
                    gap: '8px',
                }}>
                    {etiquetas.map((et, i) => (
                        <div key={i} className="etiqueta-svg-wrap" style={{
                            background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb',
                            overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}>
                            <EtiquetaSVG template={templatePadrao} etiqueta={et} cfg={cfg} />
                        </div>
                    ))}
                </div>
            ) : (
                <LocalEmpty text="Nenhum template de etiqueta configurado. Clique em 'Editar Template' para criar um." />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 5: G-CODE
// ═══════════════════════════════════════════════════════
function newMaquinaDefaults() {
    return {
        nome: '', fabricante: '', modelo: '', tipo_pos: 'generic', extensao_arquivo: '.nc',
        x_max: 2800, y_max: 1900, z_max: 200,
        gcode_header: '%\nG90 G54 G17', gcode_footer: 'G0 Z200.000\nM5\nM30\n%',
        z_seguro: 30, vel_vazio: 20000, vel_corte: 4000, vel_aproximacao: 8000,
        rpm_padrao: 12000, profundidade_extra: 0.20,
        coordenada_zero: 'canto_esq_inf', trocar_eixos_xy: 0, eixo_x_invertido: 0, eixo_y_invertido: 0,
        z_origin: 'mesa', z_aproximacao: 2.0, direcao_corte: 'climb',
        usar_n_codes: 1, n_code_incremento: 10, dwell_spindle: 1.0,
        usar_rampa: 1, rampa_angulo: 3.0, vel_mergulho: 1500,
        z_aproximacao_rapida: 5.0, ordenar_contornos: 'menor_primeiro',
        exportar_lado_a: 1, exportar_lado_b: 1, exportar_furos: 1, exportar_rebaixos: 1, exportar_usinagens: 1,
        usar_ponto_decimal: 1, casas_decimais: 3,
        comentario_prefixo: ';', troca_ferramenta_cmd: 'M6', spindle_on_cmd: 'M3', spindle_off_cmd: 'M5',
        usar_onion_skin: 1, onion_skin_espessura: 0.5, onion_skin_area_max: 500,
        usar_tabs: 0, tab_largura: 4, tab_altura: 1.5, tab_qtd: 2, tab_area_max: 800,
        usar_lead_in: 0, lead_in_tipo: 'arco', lead_in_raio: 5,
        feed_rate_pct_pequenas: 50, feed_rate_area_max: 500,
        padrao: 0, ativo: 1,
    };
}

function MaquinaModalInline({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...newMaquinaDefaults(), ...data });
    const [secao, setSecao] = useState('geral');
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

    const secoes = [
        { id: 'geral', lb: 'Geral' },
        { id: 'gcode', lb: 'G-code' },
        { id: 'velocidades', lb: 'Velocidades' },
        { id: 'antiarrasto', lb: 'Anti-Arrasto' },
        { id: 'exportacao', lb: 'Exportação' },
        { id: 'formato', lb: 'Formato' },
    ];

    return (
        <Modal title={f.id ? `Editar Máquina: ${f.nome}` : 'Nova Máquina CNC'} close={onClose} w={680}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {secoes.map(s => (
                    <button key={s.id} onClick={() => setSecao(s.id)}
                        style={{
                            padding: '4px 12px', fontSize: 11, fontWeight: secao === s.id ? 700 : 500,
                            borderRadius: 20, cursor: 'pointer', transition: 'all .15s',
                            background: secao === s.id ? 'var(--primary)' : 'var(--bg-muted)',
                            color: secao === s.id ? '#fff' : 'var(--text-muted)', border: 'none',
                        }}>
                        {s.lb}
                    </button>
                ))}
            </div>

            {secao === 'geral' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1/-1' }}><label className={Z.lbl}>Nome *</label><input value={f.nome} onChange={e => upd('nome', e.target.value)} className={Z.inp} placeholder="CNC Principal" /></div>
                    <div><label className={Z.lbl}>Fabricante</label><input value={f.fabricante} onChange={e => upd('fabricante', e.target.value)} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Modelo</label><input value={f.modelo} onChange={e => upd('modelo', e.target.value)} className={Z.inp} /></div>
                    <div>
                        <label className={Z.lbl}>Pós-processador</label>
                        <select value={f.tipo_pos} onChange={e => upd('tipo_pos', e.target.value)} className={Z.inp}>
                            <option value="generic">Genérico</option><option value="biesse">Biesse</option>
                            <option value="scm">SCM</option><option value="homag">Homag</option>
                            <option value="weeke">Weeke</option><option value="morbidelli">Morbidelli</option>
                            <option value="custom">Personalizado</option>
                        </select>
                    </div>
                    <div><label className={Z.lbl}>Extensão</label><input value={f.extensao_arquivo} onChange={e => upd('extensao_arquivo', e.target.value)} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Área X (mm)</label><input type="number" value={f.x_max} onChange={e => upd('x_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Área Y (mm)</label><input type="number" value={f.y_max} onChange={e => upd('y_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Altura Z (mm)</label><input type="number" value={f.z_max} onChange={e => upd('z_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div>
                        <label className={Z.lbl}>Coordenada Zero</label>
                        <select value={f.coordenada_zero} onChange={e => upd('coordenada_zero', e.target.value)} className={Z.inp}>
                            <option value="canto_esq_inf">Canto esq. inferior</option>
                            <option value="canto_dir_inf">Canto dir. inferior</option>
                            <option value="canto_esq_sup">Canto esq. superior</option>
                            <option value="canto_dir_sup">Canto dir. superior</option>
                            <option value="centro">Centro</option>
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>Origem Z</label>
                        <select value={f.z_origin || 'mesa'} onChange={e => upd('z_origin', e.target.value)} className={Z.inp}>
                            <option value="mesa">Z=0 na mesa</option>
                            <option value="material">Z=0 no topo do material</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.padrao === 1} onChange={e => upd('padrao', e.target.checked ? 1 : 0)} />
                            Máquina Padrão
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.trocar_eixos_xy === 1} onChange={e => upd('trocar_eixos_xy', e.target.checked ? 1 : 0)} />
                            X = comprimento
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_x_invertido === 1} onChange={e => upd('eixo_x_invertido', e.target.checked ? 1 : 0)} />
                            X invertido
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_y_invertido === 1} onChange={e => upd('eixo_y_invertido', e.target.checked ? 1 : 0)} />
                            Y invertido
                        </label>
                    </div>
                </div>
            )}

            {secao === 'gcode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label className={Z.lbl}>Header</label>
                            <textarea value={f.gcode_header} onChange={e => upd('gcode_header', e.target.value)}
                                className={Z.inp} style={{ height: 120, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11 }} />
                        </div>
                        <div>
                            <label className={Z.lbl}>Footer</label>
                            <textarea value={f.gcode_footer} onChange={e => upd('gcode_footer', e.target.value)}
                                className={Z.inp} style={{ height: 120, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11 }} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div><label className={Z.lbl}>Troca Ferramenta</label><input value={f.troca_ferramenta_cmd} onChange={e => upd('troca_ferramenta_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Spindle ON</label><input value={f.spindle_on_cmd} onChange={e => upd('spindle_on_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Spindle OFF</label><input value={f.spindle_off_cmd} onChange={e => upd('spindle_off_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Comentário</label><input value={f.comentario_prefixo} onChange={e => upd('comentario_prefixo', e.target.value)} className={Z.inp} /></div>
                    </div>
                </div>
            )}

            {secao === 'velocidades' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label className={Z.lbl}>Z Seguro (mm)</label><input type="number" value={f.z_seguro} onChange={e => upd('z_seguro', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>RPM Padrão</label><input type="number" value={f.rpm_padrao} onChange={e => upd('rpm_padrao', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Vazio (mm/min)</label><input type="number" value={f.vel_vazio} onChange={e => upd('vel_vazio', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Corte (mm/min)</label><input type="number" value={f.vel_corte} onChange={e => upd('vel_corte', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Aproximação (mm/min)</label><input type="number" value={f.vel_aproximacao} onChange={e => upd('vel_aproximacao', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Prof. Extra (mm)</label><input type="number" value={f.profundidade_extra} onChange={e => upd('profundidade_extra', Number(e.target.value))} className={Z.inp} step="0.01" /></div>
                    <div><label className={Z.lbl}>Z Aproximação (mm)</label><input type="number" value={f.z_aproximacao ?? 2} onChange={e => upd('z_aproximacao', Number(e.target.value))} className={Z.inp} step="0.5" min="0.5" /></div>
                    <div><label className={Z.lbl}>Dwell Spindle (s)</label><input type="number" value={f.dwell_spindle ?? 1} onChange={e => upd('dwell_spindle', Number(e.target.value))} className={Z.inp} step="0.5" min="0" /></div>
                </div>
            )}

            {secao === 'antiarrasto' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Direção de Corte</div>
                        <select value={f.direcao_corte || 'climb'} onChange={e => upd('direcao_corte', e.target.value)} className={Z.inp}>
                            <option value="climb">Climb Milling (CW)</option>
                            <option value="convencional">Convencional (CCW)</option>
                        </select>
                    </div>
                    <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 6 }}>
                            <input type="checkbox" checked={(f.usar_onion_skin ?? 1) === 1} onChange={e => upd('usar_onion_skin', e.target.checked ? 1 : 0)} />
                            Onion-Skin
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div><label className={Z.lbl}>Espessura (mm)</label><input type="number" value={f.onion_skin_espessura ?? 0.5} onChange={e => upd('onion_skin_espessura', Number(e.target.value))} className={Z.inp} step="0.1" min="0.1" /></div>
                            <div><label className={Z.lbl}>Área máx. (cm²)</label><input type="number" value={f.onion_skin_area_max ?? 500} onChange={e => upd('onion_skin_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>
                    <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 6 }}>
                            <input type="checkbox" checked={(f.usar_tabs ?? 0) === 1} onChange={e => upd('usar_tabs', e.target.checked ? 1 : 0)} />
                            Tabs / Micro-juntas
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                            <div><label className={Z.lbl}>Largura (mm)</label><input type="number" value={f.tab_largura ?? 4} onChange={e => upd('tab_largura', Number(e.target.value))} className={Z.inp} step="0.5" /></div>
                            <div><label className={Z.lbl}>Altura (mm)</label><input type="number" value={f.tab_altura ?? 1.5} onChange={e => upd('tab_altura', Number(e.target.value))} className={Z.inp} step="0.1" /></div>
                            <div><label className={Z.lbl}>Qtd/peça</label><input type="number" value={f.tab_qtd ?? 2} onChange={e => upd('tab_qtd', Number(e.target.value))} className={Z.inp} min={1} max={8} /></div>
                            <div><label className={Z.lbl}>Área máx. (cm²)</label><input type="number" value={f.tab_area_max ?? 800} onChange={e => upd('tab_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>
                    <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 6 }}>
                            <input type="checkbox" checked={(f.usar_rampa ?? 1) === 1} onChange={e => upd('usar_rampa', e.target.checked ? 1 : 0)} />
                            Rampa de Entrada
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div><label className={Z.lbl}>Ângulo (°)</label><input type="number" value={f.rampa_angulo ?? 3} onChange={e => upd('rampa_angulo', Number(e.target.value))} className={Z.inp} step="0.5" min="1" max="15" /></div>
                            <div><label className={Z.lbl}>Vel. Mergulho (mm/min)</label><input type="number" value={f.vel_mergulho ?? 1500} onChange={e => upd('vel_mergulho', Number(e.target.value))} className={Z.inp} step="100" /></div>
                        </div>
                    </div>
                </div>
            )}

            {secao === 'exportacao' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {[
                        { k: 'exportar_lado_a', lb: 'Exportar Lado A' }, { k: 'exportar_lado_b', lb: 'Exportar Lado B' },
                        { k: 'exportar_furos', lb: 'Exportar Furos' }, { k: 'exportar_rebaixos', lb: 'Exportar Rebaixos' },
                        { k: 'exportar_usinagens', lb: 'Exportar Usinagens' },
                    ].map(o => (
                        <label key={o.k} style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f[o.k] === 1} onChange={e => upd(o.k, e.target.checked ? 1 : 0)} />
                            {o.lb}
                        </label>
                    ))}
                </div>
            )}

            {secao === 'formato' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={(f.usar_n_codes ?? 1) === 1} onChange={e => upd('usar_n_codes', e.target.checked ? 1 : 0)} />
                            Usar N codes
                        </label>
                    </div>
                    <div><label className={Z.lbl}>Incremento N</label><input type="number" value={f.n_code_incremento ?? 10} onChange={e => upd('n_code_incremento', Number(e.target.value))} className={Z.inp} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={(f.usar_ponto_decimal ?? 1) === 1} onChange={e => upd('usar_ponto_decimal', e.target.checked ? 1 : 0)} />
                            Ponto decimal
                        </label>
                    </div>
                    <div><label className={Z.lbl}>Casas decimais</label><input type="number" value={f.casas_decimais ?? 3} onChange={e => upd('casas_decimais', Number(e.target.value))} className={Z.inp} min={0} max={6} /></div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button onClick={onClose} className={Z.btn2} style={{ padding: '8px 16px', fontSize: 12 }}>Cancelar</button>
                <button onClick={() => onSave(f)} className={Z.btn} style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Save size={12} /> Salvar Máquina
                </button>
            </div>
        </Modal>
    );
}

function StepGcode({ op, notify }) {
    const [result, setResult] = useState(null);
    const [gerando, setGerando] = useState(false);
    const [maquinas, setMaquinas] = useState([]);
    const [maquinaId, setMaquinaId] = useState('');
    const [showMaqModal, setShowMaqModal] = useState(false);

    const loadMaquinas = useCallback(() => {
        api.get('/cnc/maquinas').then(ms => {
            setMaquinas(ms);
            const padrao = ms.find(m => m.padrao);
            if (padrao) setMaquinaId(String(padrao.id));
            else if (ms.length > 0) setMaquinaId(String(ms[0].id));
        }).catch(e => notify(e.error || 'Erro ao carregar máquinas'));
    }, []);

    useEffect(() => { loadMaquinas(); }, [loadMaquinas]);

    const editMaquina = async () => {
        if (!maquinaId) {
            setShowMaqModal(newMaquinaDefaults());
            return;
        }
        try {
            const full = await api.get(`/cnc/maquinas/${maquinaId}`);
            setShowMaqModal(full);
        } catch (err) { notify('Erro ao carregar máquina'); }
    };

    const saveMaquina = async (data) => {
        try {
            if (data.id) {
                await api.put(`/cnc/maquinas/${data.id}`, data);
                notify('Máquina atualizada');
            } else {
                const r = await api.post('/cnc/maquinas', data);
                notify('Máquina criada');
                if (r?.id) setMaquinaId(String(r.id));
            }
            setShowMaqModal(false);
            loadMaquinas();
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    const gerar = async () => {
        if (!op?.lote_id) return;
        setGerando(true);
        try {
            const body = maquinaId ? { maquina_id: Number(maquinaId) } : {};
            const r = await api.post(`/cnc/gcode/${op.lote_id}`, body);
            setResult(r);
            if (r.ok) {
                notify(`G-code gerado: ${r.total_operacoes || 0} operações`);
                try { await api.put(`/industrializacao/ordens/${op.id}/status`, { status: 'gcode' }); } catch (_) { }
            } else if (r.error) notify(r.error);
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        }
        setGerando(false);
    };

    const downloadGcode = () => {
        if (!result?.gcode) return;
        const ext = result.extensao || '.nc';
        const blob = new Blob([result.gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${op?.numero || 'op'}${ext}`; a.click();
        URL.revokeObjectURL(url);
    };

    if (!op?.lote_id) return <LocalEmpty text="OP sem lote vinculado" />;

    const maquinaSel = maquinas.find(m => String(m.id) === maquinaId);

    return (
        <div>
            {/* Seletor de máquina + botão configurar */}
            <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Monitor size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Máquina CNC:</span>
                    <select value={maquinaId} onChange={e => { setMaquinaId(e.target.value); setResult(null); }}
                        className={Z.inp} style={{ minWidth: 260, fontSize: 13 }}>
                        {maquinas.length === 0 && <option value="">Nenhuma máquina cadastrada</option>}
                        {maquinas.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.nome} {m.fabricante ? `(${m.fabricante})` : ''} {m.padrao ? '[Padrão]' : ''}
                            </option>
                        ))}
                    </select>
                    <button onClick={editMaquina} className={Z.btn2}
                        style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                        title={maquinaId ? 'Configurar máquina selecionada' : 'Criar nova máquina'}>
                        <Wrench size={13} /> {maquinaId ? 'Configurar' : 'Nova Máquina'}
                    </button>
                    {maquinas.length > 0 && (
                        <button onClick={() => setShowMaqModal(newMaquinaDefaults())} className={Z.btn2}
                            style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                            title="Adicionar nova máquina CNC">
                            <Plus size={12} /> Nova
                        </button>
                    )}
                    {maquinaSel && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Ext: <b>{maquinaSel.extensao_arquivo || '.nc'}</b> | Área: <b>{maquinaSel.x_max}×{maquinaSel.y_max}mm</b>
                        </span>
                    )}
                </div>
            </div>

            {showMaqModal && (
                <MaquinaModalInline data={showMaqModal} onSave={saveMaquina} onClose={() => setShowMaqModal(false)} />
            )}

            {/* Validação de ferramentas */}
            {result?.validacao?.ferramentas_necessarias && (
                <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Validação de Ferramentas</h4>
                    {result.validacao.ferramentas_necessarias.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                            {f.ok ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} /> : <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />}
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.tool_code}</span>
                            <span style={{ color: f.ok ? 'var(--success)' : 'var(--danger)' }}>{f.ok ? f.ferramenta : 'Não cadastrada!'}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Ações */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <button onClick={gerar} disabled={gerando || maquinas.length === 0} className={Z.btn}
                    style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    {gerando ? 'Gerando...' : <><Cpu size={14} /> Gerar G-code</>}
                </button>
                {result?.ok && (
                    <button onClick={downloadGcode} className={Z.btn2}
                        style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Download size={14} /> Baixar {result.extensao || '.nc'}
                    </button>
                )}
                {result?.ok && (
                    <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
                        {result.total_pecas} peça(s), {result.total_operacoes} operação(ões)
                    </span>
                )}
            </div>

            {/* Preview G-code */}
            {result?.gcode && (
                <div className="glass-card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                        Preview G-code ({result.gcode.split('\n').length} linhas)
                    </div>
                    <pre style={{
                        margin: 0, padding: 12, maxHeight: 400, overflowY: 'auto',
                        fontSize: 11, fontFamily: 'JetBrains Mono, Consolas, monospace',
                        lineHeight: 1.6, background: 'var(--bg-muted)', color: 'var(--text-primary)', whiteSpace: 'pre',
                    }}>
                        {result.gcode.split('\n').slice(0, 200).map((line, i) => {
                            let color = 'inherit';
                            if (line.startsWith(';') || line.startsWith('(')) color = 'var(--muted)';
                            else if (/^G0\b/.test(line)) color = 'var(--info)';
                            else if (/^G1\b/.test(line)) color = 'var(--success)';
                            else if (/^T\d/.test(line)) color = 'var(--warning)';
                            return <span key={i}><span style={{ color: 'var(--muted)', userSelect: 'none', display: 'inline-block', width: 40, textAlign: 'right', marginRight: 12 }}>{i + 1}</span><span style={{ color }}>{line}</span>{'\n'}</span>;
                        })}
                        {result.gcode.split('\n').length > 200 && <span style={{ color: 'var(--muted)' }}>... ({result.gcode.split('\n').length - 200} linhas adicionais)</span>}
                    </pre>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 6: LIBERAR
// ═══════════════════════════════════════════════════════
function StepLiberar({ op, notify, onRefresh }) {
    const [liberando, setLiberando] = useState(false);
    const [liberada, setLiberada] = useState(op?.status === 'liberada');

    const liberar = async () => {
        setLiberando(true);
        try {
            const r = await api.post(`/industrializacao/ordens/${op.id}/liberar`);
            if (r.ok) {
                notify(`${op.numero} liberada para produção!`);
                setLiberada(true);
                onRefresh();
            } else {
                notify(r.error || 'Erro ao liberar');
            }
        } catch (e) {
            notify('Erro: ' + (e.error || e.message));
        }
        setLiberando(false);
    };

    return (
        <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{
                width: 80, height: 80, borderRadius: 20, margin: '0 auto 20px',
                background: liberada ? 'linear-gradient(135deg, var(--success), var(--success-hover))' : 'linear-gradient(135deg, #e67e22, #d35400)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {liberada ? <CheckCircle2 size={40} color="#fff" /> : <ArrowRight size={40} color="#fff" />}
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                {liberada ? 'OP Liberada!' : 'Liberar para Produção'}
            </h2>

            {/* Resumo */}
            <div style={{ maxWidth: 400, margin: '20px auto', textAlign: 'left' }}>
                <SummaryRow label="Ordem" value={op.numero} />
                <SummaryRow label="Projeto" value={op.projeto_nome || '-'} />
                <SummaryRow label="Cliente" value={op.cliente_nome || '-'} />
                <SummaryRow label="Peças" value={`${op.total_pecas || 0} peça(s)`} />
                <SummaryRow label="Status" value={liberada ? 'LIBERADA' : op.status?.toUpperCase()} color={liberada ? 'var(--success)' : 'var(--warning)'} />
            </div>

            {!liberada ? (
                <div style={{ marginTop: 20 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                        Ao liberar, a OP será enviada para o chão de fábrica.
                        Certifique-se de que o plano de corte foi otimizado.
                    </p>
                    <button onClick={liberar} disabled={liberando} className={Z.btn}
                        style={{
                            padding: '14px 32px', fontSize: 15, fontWeight: 700,
                            background: 'linear-gradient(135deg, var(--success), var(--success-hover))',
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                        }}>
                        {liberando ? 'Liberando...' : <><Play size={18} /> Liberar para Produção</>}
                    </button>
                </div>
            ) : (
                <div style={{ marginTop: 20 }}>
                    <p style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600 }}>
                        Ordem de produção enviada para o chão de fábrica com sucesso.
                    </p>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════════════════════

function KPI({ label, value, highlight }) {
    return (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--primary)' : 'var(--text-primary)' }}>
                {value || '-'}
            </div>
        </div>
    );
}

function LocalEmpty({ text }) {
    return (
        <div className="glass-card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {text}
        </div>
    );
}

function MiniTag({ color, label }) {
    return (
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: color + '18', color }}>
            {label}
        </span>
    );
}

function SummaryRow({ label, value, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: color || 'var(--text-primary)' }}>{value}</span>
        </div>
    );
}
