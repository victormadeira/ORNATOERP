import { useState, useCallback, useMemo, useEffect, useRef, Component } from 'react';
import { Z } from '../ui';
import { Plus, Trash2, Copy, Save, X, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import PecaViewer3D from './PecaViewer3D';

// ErrorBoundary para isolar crash do 3D sem derrubar o editor
class Viewer3DGuard extends Component {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) {
            return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, border: '1px dashed var(--border)', borderRadius: 8 }}>
                Preview indisponível — <button onClick={() => this.setState({ hasError: false })} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>tentar novamente</button>
            </div>;
        }
        return this.props.children;
    }
}

// Hook de debounce para evitar re-render do 3D a cada keystroke
function useDebounce(value, delay) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

/**
 * PecaEditor — Editor completo de peça com usinagens e preview 3D.
 */

const WORKER_CATEGORIES = [
    { value: 'transfer_hole', label: 'Furo passante', icon: '●', color: 'var(--danger-hover)', desc: 'Atravessa a peça' },
    { value: 'transfer_hole_blind', label: 'Furo cego', icon: '◐', color: '#f97316', desc: 'Não atravessa' },
    { value: 'transfer_pocket', label: 'Rebaixo / Pocket', icon: '▬', color: '#a855f7', desc: 'Depressão retangular' },
    { value: 'Transfer_vertical_saw_cut', label: 'Rasgo / Canal', icon: '━', color: '#eab308', desc: 'Corte linear' },
    { value: 'transfer_slot', label: 'Fresa / Slot', icon: '◆', color: '#06b6d4', desc: 'Fresamento' },
];

const FACES = [
    { value: 'top', label: 'Face A (topo)' },
    { value: 'bottom', label: 'Face B (fundo)' },
    { value: 'front', label: 'Lateral frontal' },
    { value: 'back', label: 'Lateral traseira' },
    { value: 'left', label: 'Lateral esquerda' },
    { value: 'right', label: 'Lateral direita' },
];

const PRESETS = [
    { label: 'Minifix ⌀15', diameter: 15, depth: 12.7, category: 'transfer_hole_blind', face: 'top', icon: '⊚' },
    { label: 'Minifix lateral ⌀8', diameter: 8, depth: 30, category: 'transfer_hole', face: 'back', icon: '⊚' },
    { label: 'Cavilha ⌀8', diameter: 8, depth: 30, category: 'transfer_hole', face: 'top', icon: '◎' },
    { label: 'Dobradiça ⌀35', diameter: 35, depth: 12, category: 'transfer_hole_blind', face: 'top', icon: '◉' },
    { label: 'Prateleira ⌀5', diameter: 5, depth: 10, category: 'transfer_hole_blind', face: 'back', icon: '·' },
    { label: 'Puxador ⌀5', diameter: 5, depth: 18, category: 'transfer_hole', face: 'top', icon: '○' },
    { label: 'Rasgo fundo 6mm', length: 0, width: 6, depth: 8, category: 'Transfer_vertical_saw_cut', face: 'top', icon: '┃', _fullWidth: true },
    { label: 'Rasgo corrediça', length: 400, width: 12.7, depth: 12.7, category: 'Transfer_vertical_saw_cut', face: 'top', icon: '═' },
];

const EDGE_OPTIONS = ['', 'PVC_2MM', 'PVC_1MM', 'PVC_0.4MM', 'FITA_MELAMINA', 'ABS_2MM', 'ABS_1MM'];

function emptyWorker() {
    return { category: 'transfer_hole_blind', face: 'top', x: 50, y: 50, depth: 15, diameter: 8, length: 0, width: 0, tool_code: '' };
}

export default function PecaEditor({ peca, loteId, onSave, onClose, materiais = [] }) {
    const isNew = !peca;

    const [form, setForm] = useState({
        descricao: peca?.descricao || '',
        modulo_desc: peca?.modulo_desc || '',
        material_code: peca?.material_code || peca?.material || '',
        espessura: peca?.espessura || 18,
        comprimento: peca?.comprimento || 600,
        largura: peca?.largura || 400,
        quantidade: peca?.quantidade || 1,
        borda_frontal: peca?.borda_frontal || '',
        borda_traseira: peca?.borda_traseira || '',
        borda_dir: peca?.borda_dir || '',
        borda_esq: peca?.borda_esq || '',
        borda_cor_frontal: peca?.borda_cor_frontal || '',
        borda_cor_traseira: peca?.borda_cor_traseira || '',
        borda_cor_dir: peca?.borda_cor_dir || '',
        borda_cor_esq: peca?.borda_cor_esq || '',
        acabamento: peca?.acabamento || '',
        grain: peca?.grain || 'sem_veio',
        observacao: peca?.observacao || '',
        material_id: peca?.material_id || null,
    });

    const parseMach = (mj) => {
        if (!mj) return [];
        try { const d = typeof mj === 'string' ? JSON.parse(mj) : mj; return Array.isArray(d) ? d : d.workers ? (Array.isArray(d.workers) ? d.workers : Object.values(d.workers)) : []; } catch { return []; }
    };

    const [workers, setWorkers] = useState(() => parseMach(peca?.machining_json));
    const [saving, setSaving] = useState(false);
    const [materiaisCatalogo, setMateriaisCatalogo] = useState([]);

    // Carregar materiais cadastrados
    useEffect(() => {
        import('../api').then(mod => {
            mod.default.get('/cnc/materiais?ativo=1').then(setMateriaisCatalogo).catch(() => {});
        });
    }, []);
    const [activeIdx, setActiveIdx] = useState(-1);
    const [show3d, setShow3d] = useState(true);

    const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const addWorker = useCallback((preset = null) => {
        const w = preset ? { ...emptyWorker(), ...preset } : emptyWorker();
        // Se preset tem _fullWidth, ajustar length = comprimento
        if (preset?._fullWidth) w.length = form.comprimento || 600;
        delete w._fullWidth;
        delete w.icon;
        delete w.label;
        setWorkers(ws => {
            const next = [...ws, w];
            setActiveIdx(next.length - 1);
            return next;
        });
    }, [form.comprimento]);

    const updateWorker = (idx, k, v) => {
        setWorkers(ws => ws.map((w, i) => i === idx ? { ...w, [k]: v } : w));
    };

    const removeWorker = (idx) => {
        setWorkers(ws => ws.filter((_, i) => i !== idx));
        if (activeIdx === idx) setActiveIdx(-1);
        else if (activeIdx > idx) setActiveIdx(activeIdx - 1);
    };

    const duplicateWorker = (idx) => {
        const w = { ...workers[idx], x: (workers[idx].x || 0) + 30 };
        setWorkers(ws => [...ws.slice(0, idx + 1), w, ...ws.slice(idx + 1)]);
        setActiveIdx(idx + 1);
    };

    // Preview peca — debounce de 400ms para não recriar a cena 3D a cada keystroke
    const previewPecaRaw = useMemo(() => ({
        ...form,
        machining_json: JSON.stringify({ workers }),
    }), [form, workers]);
    const previewPeca = useDebounce(previewPecaRaw, 400);

    const [saveError, setSaveError] = useState('');
    const handleSave = async () => {
        if (!form.comprimento || !form.largura) return;
        setSaving(true);
        setSaveError('');
        try {
            await onSave({
                ...form,
                machining_json: JSON.stringify({ workers }),
            });
        } catch (err) {
            console.error('Erro ao salvar peça:', err);
            setSaveError(err?.error || err?.message || 'Erro ao salvar peça');
            setSaving(false);
        }
    };

    const I = { fontSize: 12, padding: '6px 8px' }; // input style
    const L = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 };
    const sectionStyle = { marginBottom: 14, padding: '10px 12px', background: 'var(--bg-muted, #f8f9fa)', borderRadius: 8 };

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', background: 'rgba(0,0,0,0.5)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                margin: 'auto', width: '96vw', maxWidth: 1200, maxHeight: '94vh',
                background: 'var(--bg-card)', borderRadius: 14, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
            }}
            onClick={e => e.stopPropagation()}
            >
                {/* ── HEADER ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-muted, #f8f9fa)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                            {isNew ? '+ Nova Peça' : `Editar: ${peca.descricao || peca.upmcode || 'Peça'}`}
                        </h3>
                        {workers.length > 0 && (
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--primary)', color: '#fff' }}>
                                {workers.length} usinag.
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {saveError && (
                            <span style={{ fontSize: 11, color: 'var(--danger)', maxWidth: 200 }}>{saveError}</span>
                        )}
                        <button onClick={() => setShow3d(v => !v)} title={show3d ? 'Esconder 3D' : 'Mostrar 3D'}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)' }}>
                            {show3d ? <EyeOff size={12} /> : <Eye size={12} />} 3D
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'var(--primary)', color: '#fff', padding: '6px 16px' }}>
                            <Save size={14} />
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── BODY ── */}
                <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', gap: 16 }}>

                    {/* ─── COLUNA ESQUERDA: FORMULÁRIO ─── */}
                    <div style={{ flex: '0 0 380px', minWidth: 0 }}>

                        {/* Informações */}
                        <div style={sectionStyle}>
                            <div style={L}>Informações</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Descrição</label>
                                    <input value={form.descricao} onChange={e => setField('descricao', e.target.value)}
                                        className={Z.inp} style={I} placeholder="Ex: Lateral Direita" />
                                </div>
                                <div>
                                    <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Módulo</label>
                                    <input value={form.modulo_desc} onChange={e => setField('modulo_desc', e.target.value)}
                                        className={Z.inp} style={I} placeholder="Ex: Armário Alto" />
                                </div>
                            </div>
                        </div>

                        {/* Dimensões */}
                        <div style={sectionStyle}>
                            <div style={L}>Dimensões (mm)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 70px', gap: 8 }}>
                                {[
                                    ['comprimento', 'Comp.'],
                                    ['largura', 'Larg.'],
                                    ['espessura', 'Esp.'],
                                    ['quantidade', 'Qtd'],
                                ].map(([field, label]) => (
                                    <div key={field}>
                                        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</label>
                                        <input type="number" value={form[field]} onChange={e => setField(field, +e.target.value)}
                                            className={Z.inp} style={{ ...I, fontFamily: 'monospace', fontWeight: 700 }} min={1} step={field === 'espessura' ? 0.5 : 1} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Material */}
                        <div style={sectionStyle}>
                            <div style={L}>Material</div>
                            {materiaisCatalogo.length > 0 ? (
                                <>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Selecionar do cadastro</label>
                                        <select
                                            value={form.material_id || ''}
                                            onChange={e => {
                                                const id = +e.target.value;
                                                if (id) {
                                                    const mat = materiaisCatalogo.find(m => m.id === id);
                                                    if (mat) {
                                                        setField('material_id', mat.id);
                                                        setField('material_code', mat.codigo || mat.nome);
                                                        setField('espessura', mat.espessura);
                                                        setField('grain', mat.veio || 'sem_veio');
                                                    }
                                                } else {
                                                    setField('material_id', null);
                                                }
                                            }}
                                            className={Z.inp} style={I}
                                        >
                                            <option value="">Selecionar material...</option>
                                            {materiaisCatalogo.map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.nome} — {m.espessura}mm {m.cor ? `(${m.cor})` : ''} {m.melamina !== 'ambos' ? `[${m.melamina}]` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {form.material_id && (() => {
                                        const mat = materiaisCatalogo.find(m => m.id === form.material_id);
                                        return mat && mat.melamina !== 'ambos' ? (
                                            <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 4, background: 'var(--warning-bg)', fontSize: 10, color: 'var(--warning-hover)' }}>
                                                Melamina: {mat.melamina === 'face_a' ? 'apenas Face A' : mat.melamina === 'face_b' ? 'apenas Face B' : 'cru'}
                                            </div>
                                        ) : null;
                                    })()}
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 8 }}>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Código material</label>
                                            <input value={form.material_code} onChange={e => setField('material_code', e.target.value)}
                                                className={Z.inp} style={I} placeholder="Código do material" />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Veio</label>
                                            <select value={form.grain} onChange={e => setField('grain', e.target.value)}
                                                className={Z.inp} style={I}>
                                                <option value="sem_veio">Sem veio</option>
                                                <option value="horizontal">Horizontal →</option>
                                                <option value="vertical">Vertical ↓</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Material</label>
                                        {materiais.length > 0 ? (
                                            <select value={form.material_code} onChange={e => setField('material_code', e.target.value)}
                                                className={Z.inp} style={I}>
                                                <option value="">Selecionar...</option>
                                                {materiais.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        ) : (
                                            <input value={form.material_code} onChange={e => setField('material_code', e.target.value)}
                                                className={Z.inp} style={I} placeholder="Ex: MDF 18mm Branco TX" />
                                        )}
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Veio</label>
                                        <select value={form.grain} onChange={e => setField('grain', e.target.value)}
                                            className={Z.inp} style={I}>
                                            <option value="sem_veio">Sem veio</option>
                                            <option value="horizontal">Horizontal →</option>
                                            <option value="vertical">Vertical ↓</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Bordas */}
                        <div style={sectionStyle}>
                            <div style={L}>Bordas</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                {[
                                    ['borda_frontal', 'borda_cor_frontal', 'Frontal'],
                                    ['borda_traseira', 'borda_cor_traseira', 'Traseira'],
                                    ['borda_dir', 'borda_cor_dir', 'Direita'],
                                    ['borda_esq', 'borda_cor_esq', 'Esquerda'],
                                ].map(([field, corField, label]) => (
                                    <div key={field} style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</label>
                                            <select value={form[field]} onChange={e => setField(field, e.target.value)}
                                                className={Z.inp} style={{ ...I, fontSize: 10 }}>
                                                {EDGE_OPTIONS.map(e => <option key={e} value={e}>{e || '—'}</option>)}
                                            </select>
                                        </div>
                                        {form[field] && (
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Cor</label>
                                                <input value={form[corField]} onChange={e => setField(corField, e.target.value)}
                                                    className={Z.inp} style={{ ...I, fontSize: 10 }} placeholder="Branco TX" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                                {[
                                    ['4 lados PVC 2mm', () => { ['frontal', 'traseira', 'dir', 'esq'].forEach(s => setField('borda_' + s, 'PVC_2MM')); }],
                                    ['Só frontal', () => { setField('borda_frontal', 'PVC_2MM'); ['traseira', 'dir', 'esq'].forEach(s => setField('borda_' + s, '')); }],
                                    ['Limpar', () => { ['frontal', 'traseira', 'dir', 'esq'].forEach(s => setField('borda_' + s, '')); }],
                                ].map(([label, fn]) => (
                                    <button key={label} onClick={fn}
                                        style={{ fontSize: 9, padding: '2px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)' }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Obs */}
                        <div style={{ marginTop: 4, paddingInline: 2 }}>
                            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Observação</label>
                            <input value={form.observacao} onChange={e => setField('observacao', e.target.value)}
                                className={Z.inp} style={I} placeholder="Opcional..." />
                        </div>
                    </div>

                    {/* ─── COLUNA DIREITA: 3D + USINAGENS ─── */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

                        {/* Preview 3D */}
                        {show3d && (
                            <div style={{ flexShrink: 0 }}>
                                <Viewer3DGuard>
                                    <PecaViewer3D peca={previewPeca} width={Math.min(520, window.innerWidth - 440)} height={240} />
                                </Viewer3DGuard>
                                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Arraste = rotacionar · Scroll = zoom</p>
                            </div>
                        )}

                        {/* ── USINAGENS ── */}
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={L}>Usinagens ({workers.length})</div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => addWorker()} className={Z.btn}
                                        style={{ fontSize: 10, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 3, background: 'var(--primary)', color: '#fff' }}>
                                        <Plus size={12} /> Adicionar
                                    </button>
                                </div>
                            </div>

                            {/* Presets */}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                {PRESETS.map((h, i) => {
                                    const catInfo = WORKER_CATEGORIES.find(c => c.value === h.category);
                                    return (
                                        <button key={i} onClick={() => addWorker(h)}
                                            style={{
                                                fontSize: 10, padding: '3px 8px', background: 'var(--bg-card)',
                                                border: `1px solid ${catInfo?.color || 'var(--border)'}30`,
                                                borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                color: 'var(--text-primary)',
                                                transition: 'all .15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = catInfo?.color || '#888'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = (catInfo?.color || '#888') + '30'}
                                        >
                                            <span style={{ color: catInfo?.color, fontSize: 12 }}>{h.icon}</span>
                                            {h.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Workers list */}
                            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                                {workers.map((w, i) => {
                                    const catInfo = WORKER_CATEGORIES.find(c => c.value === w.category) || WORKER_CATEGORIES[0];
                                    const isActive = activeIdx === i;
                                    const isHole = /hole|furo/i.test(w.category);
                                    const faceInfo = FACES.find(f => f.value === w.face);

                                    return (
                                        <div key={i} style={{
                                            padding: '6px 10px', marginBottom: 3, borderRadius: 8,
                                            border: `1.5px solid ${isActive ? catInfo.color : 'var(--border)'}`,
                                            background: isActive ? `${catInfo.color}08` : 'var(--bg-card)',
                                            cursor: 'pointer', transition: 'all .15s',
                                        }} onClick={() => setActiveIdx(isActive ? -1 : i)}>
                                            {/* Header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{
                                                    width: 22, height: 22, borderRadius: 6,
                                                    background: `${catInfo.color}18`, color: catInfo.color,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                                                }}>{catInfo.icon}</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{catInfo.label}</div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                                        {faceInfo?.label || w.face} · {isHole ? `⌀${w.diameter}` : `${w.length}×${w.width}`} · prof. {w.depth}mm
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                                    x:{w.x} y:{w.y}
                                                </span>
                                                {isActive ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                                                <button onClick={e => { e.stopPropagation(); duplicateWorker(i); }}
                                                    title="Duplicar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                                                    <Copy size={12} />
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); removeWorker(i); }}
                                                    title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2 }}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>

                                            {/* Editor expandido */}
                                            {isActive && (
                                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${catInfo.color}20` }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                                        <div style={{ gridColumn: '1/3' }}>
                                                            <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Tipo de usinagem</label>
                                                            <select value={w.category} onChange={e => updateWorker(i, 'category', e.target.value)}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '5px 6px' }}>
                                                                {WORKER_CATEGORIES.map(c => (
                                                                    <option key={c.value} value={c.value}>{c.icon} {c.label} — {c.desc}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Face</label>
                                                            <select value={w.face} onChange={e => updateWorker(i, 'face', e.target.value)}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '5px 6px' }}>
                                                                {FACES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                            </select>
                                                        </div>

                                                        {/* Posição */}
                                                        <div>
                                                            <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>X (mm)</label>
                                                            <input type="number" value={w.x} onChange={e => updateWorker(i, 'x', +e.target.value)}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '5px 6px', fontFamily: 'monospace' }}
                                                                min={0} max={form.comprimento} />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Y (mm)</label>
                                                            <input type="number" value={w.y} onChange={e => updateWorker(i, 'y', +e.target.value)}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '5px 6px', fontFamily: 'monospace' }}
                                                                min={0} max={form.largura} />
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Profundidade (mm)</label>
                                                            <input type="number" value={w.depth} onChange={e => updateWorker(i, 'depth', +e.target.value)}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '5px 6px', fontFamily: 'monospace' }}
                                                                min={0.1} step={0.1} />
                                                        </div>

                                                        {/* Dimensões específicas */}
                                                        {isHole ? (
                                                            <div>
                                                                <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Diâmetro (mm)</label>
                                                                <input type="number" value={w.diameter} onChange={e => updateWorker(i, 'diameter', +e.target.value)}
                                                                    className={Z.inp} style={{ fontSize: 11, padding: '5px 6px', fontFamily: 'monospace' }}
                                                                    min={0.5} step={0.5} />
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div>
                                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Comprimento (mm)</label>
                                                                    <input type="number" value={w.length} onChange={e => updateWorker(i, 'length', +e.target.value)}
                                                                        className={Z.inp} style={{ fontSize: 11, padding: '5px 6px', fontFamily: 'monospace' }}
                                                                        min={0} />
                                                                </div>
                                                                <div>
                                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Largura (mm)</label>
                                                                    <input type="number" value={w.width} onChange={e => updateWorker(i, 'width', +e.target.value)}
                                                                        className={Z.inp} style={{ fontSize: 11, padding: '5px 6px', fontFamily: 'monospace' }}
                                                                        min={0} />
                                                                </div>
                                                            </>
                                                        )}
                                                        <div>
                                                            <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ferramenta</label>
                                                            <input value={w.tool_code || ''} onChange={e => updateWorker(i, 'tool_code', e.target.value)}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '5px 6px' }} placeholder="Auto" />
                                                        </div>
                                                    </div>

                                                    {/* Quick position helpers */}
                                                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: '22px' }}>Posição rápida:</span>
                                                        {[
                                                            ['Centro', form.comprimento / 2, form.largura / 2],
                                                            ['37mm borda', 37, 50],
                                                            ['Meia largura', form.comprimento / 2, form.largura / 2],
                                                        ].map(([label, x, y]) => (
                                                            <button key={label} onClick={e => { e.stopPropagation(); updateWorker(i, 'x', x); updateWorker(i, 'y', y); }}
                                                                style={{ fontSize: 9, padding: '2px 6px', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                                                                {label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {workers.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12, borderRadius: 8, border: '2px dashed var(--border)' }}>
                                        <div style={{ fontSize: 24, marginBottom: 8 }}>◈</div>
                                        Nenhuma usinagem. Use os presets acima ou clique em <strong>+ Adicionar</strong>.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
