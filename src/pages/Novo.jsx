import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Z, Ic, Modal, SearchableSelect, PageHeader, ConfirmModal } from '../ui';
import { uid, R$, N, DB_CHAPAS, DB_ACABAMENTOS, DB_FERRAGENS, DB_FITAS, FERR_GROUPS, calcItemV2, calcPainelRipado, calcItemEspecial, TIPOS_ESPECIAIS, precoVenda, precoVendaV2, calcCustoHora, calcConsumiveis, estimarCorteReal, LOCKED_COLS, compareVersions } from '../engine';
import api from '../api';
import { buildRelatorioHtml } from './RelatorioMateriais';
import { buildPropostaHtml } from './PropostaHtml';
import { buildContratoHtml } from './ContratoHtml';
import {
    FileText, BarChart3, FileSignature, Plus, ChevronDown, ChevronUp, ChevronRight, Trash2, Copy,
    FolderOpen, Package, Settings, Layers, X, RefreshCw, Wrench, AlertTriangle, Box, Search,
    ToggleLeft, ToggleRight, Info, CreditCard, Eye, Globe, Monitor, Smartphone, Clock, ExternalLink, Share2,
    Lock, Unlock, Shield, ShieldAlert, FilePlus2, CheckCircle, Upload, Brain, Sparkles,
    PanelTop, UtensilsCrossed, BedDouble, Bath, Shirt, Flame, WashingMachine, Armchair, PenTool, Briefcase,
    Square, Sofa, RectangleHorizontal, GlassWater, Shapes,
    GitBranch, Star, ArrowRight, ArrowUpDown, Tag, ArrowUp, ArrowDown, GripVertical, MapPin,
    MoreHorizontal,
} from 'lucide-react';

// ── Ícone por categoria de caixa ─────────────────────────────────────────────
const CAT_ICON = {
    caixaria: Box, cozinha: UtensilsCrossed, sala: Armchair, quarto: BedDouble,
    banheiro: Bath, closet: Shirt, gourmet: Flame, lavanderia: WashingMachine,
    escritorio: Briefcase, especial: PenTool, generico: Package,
};
const getCatIcon = (cat) => CAT_ICON[cat] || Box;

// ── Constantes ───────────────────────────────────────────────────────────────
const MEIOS_PAGAMENTO = [
    { value: '', label: 'Sem definir' },
    { value: 'pix', label: 'PIX' },
    { value: 'dinheiro', label: 'Dinheiro' },
    { value: 'cartao_credito', label: 'Cartão Crédito' },
    { value: 'cartao_debito', label: 'Cartão Débito' },
    { value: 'transferencia', label: 'Transferência' },
    { value: 'boleto', label: 'Boleto' },
    { value: 'cheque', label: 'Cheque' },
];

const MAT_ALIAS = {
    int: 'Material Interno',
    ext: 'Material Externo',
    fundo: 'Material Fundo',
    ext_comp: 'Material Exclusivo',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function matLabel(id, chapas) {
    return chapas.find(c => c.id === id)?.nome || id || '—';
}

/** Resolve materiais efetivos de um item, herdando do ambiente se não customizado */
function resolveItemMats(item, amb) {
    if (item._matCustom) return item.mats; // item explicitamente customizado
    // Ambiente só tem material se matInt foi definido (campo não existe em orçamentos antigos)
    if (!amb?.matInt) return item.mats;
    return {
        matInt: amb.matInt,
        matExt: amb.matExt ?? item.mats?.matExt ?? '',
    };
}

// ── Componente: dropdown estilizado para puxadores ──────────────────────────
function PuxadorSelect({ puxadores, value, onChange }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const ref = useRef(null);
    const btnRef = useRef(null);
    const selected = puxadores.find(p => p.id === value);
    const filtered = q.trim()
        ? puxadores.filter(p => p.nome.toLowerCase().includes(q.toLowerCase()))
        : puxadores;

    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) { setOpen(false); setQ(''); } };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const toggle = () => {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 220) });
        }
        setOpen(!open);
    };

    const pick = (id) => { onChange(id); setOpen(false); setQ(''); };

    return (
        <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
                ref={btnRef}
                onClick={toggle}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer transition-colors"
                style={{
                    background: 'rgba(168,85,247,0.08)',
                    border: '1px solid rgba(168,85,247,0.25)',
                    color: '#a855f7',
                }}>
                <Wrench size={10} />
                <span className="truncate" style={{ maxWidth: 100 }}>{selected?.nome || 'Puxador'}</span>
                <ChevronDown size={10} style={{ opacity: 0.6 }} />
            </button>
            {open && createPortal(
                <div ref={ref} style={{ position: 'fixed', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', width: 220, zIndex: 99999, top: pos.top, left: pos.left, overflow: 'hidden' }}>
                    <div className="px-2 pt-2 pb-1">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <input
                                type="text" value={q} autoFocus
                                placeholder="Buscar puxador..."
                                onChange={e => setQ(e.target.value)}
                                className="flex-1 bg-transparent outline-none text-[11px]"
                                style={{ color: 'var(--text-primary)', minWidth: 0 }} />
                            {q && <button onClick={() => setQ('')} className="cursor-pointer"><X size={10} style={{ color: 'var(--text-muted)' }} /></button>}
                        </div>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
                        {filtered.map(p => {
                            const isActive = p.id === value;
                            return (
                                <button key={p.id} onClick={() => pick(p.id)}
                                    className="w-full text-left px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors"
                                    style={{
                                        background: isActive ? 'rgba(168,85,247,0.1)' : 'transparent',
                                        borderLeft: isActive ? '2px solid #a855f7' : '2px solid transparent',
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(168,85,247,0.05)'; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[11px] font-medium truncate" style={{ color: isActive ? '#a855f7' : 'var(--text-primary)' }}>{p.nome}</span>
                                    </div>
                                    <span className="text-[10px] font-semibold shrink-0 ml-2" style={{ color: isActive ? '#a855f7' : 'var(--text-muted)' }}>{R$(p.preco)}</span>
                                </button>
                            );
                        })}
                        {filtered.length === 0 && q.trim() && (
                            <div className="px-3 py-2 text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Nenhum puxador para "{q}"</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

// ── Componente: linha de sub-item (ferragem) ─────────────────────────────────
function SubItemRow({ si, ativo, onChange, ferragensDB, globalPadroes, ferrOvr, onFerrChange }) {
    const siFerragem = ferragensDB.find(f => f.id === si.ferrId);

    // Prioridade: 1) override individual, 2) padrão global por categoria, 3) padrão do componente
    let effFerrId = ferrOvr || si.ferrId;
    if (!ferrOvr) {
        const siCat = siFerragem?.categoria?.toLowerCase() || '';
        for (const [grp, cat] of Object.entries(FERR_GROUPS)) {
            if (siCat === cat.toLowerCase() && globalPadroes?.[grp]) { effFerrId = globalPadroes[grp]; break; }
        }
    }

    const fe = ferragensDB.find(f => f.id === effFerrId) || siFerragem;
    const isPuxador = siFerragem?.categoria?.toLowerCase() === 'puxador';
    const puxadores = isPuxador ? ferragensDB.filter(f => f.categoria?.toLowerCase() === 'puxador') : [];

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: ativo ? 'rgba(168,85,247,0.06)' : 'var(--bg-muted)', border: `1px solid ${ativo ? 'rgba(168,85,247,0.3)' : 'var(--border)'}` }}>
            <button onClick={() => onChange(!ativo)} className="flex items-center gap-1.5 flex-1 cursor-pointer text-left min-w-0">
                {ativo ? <ToggleRight size={16} style={{ color: '#a855f7', flexShrink: 0 }} /> : <ToggleLeft size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate" style={{ color: ativo ? 'var(--text-primary)' : 'var(--text-muted)' }}>{si.nome}</span>
                    {fe && !isPuxador && <span className="text-[9px]" style={{ color: '#a855f7' }}>↳ {fe.nome}</span>}
                </div>
            </button>
            {isPuxador && ativo && puxadores.length > 0 && (
                <PuxadorSelect puxadores={puxadores} value={ferrOvr || si.ferrId} onChange={onFerrChange} />
            )}
            {fe && <span className="text-[10px] font-semibold shrink-0" style={{ color: ativo ? '#a855f7' : 'var(--text-muted)' }}>{R$(fe.preco)}</span>}
        </div>
    );
}

// ── Componente: seletor de módulos com busca ─────────────────────────────────
function CaixaSearch({ caixas, onSelect, onAddPainel, onAddEspecial, onAddAvulso, onAddGrupo, placeholder }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const filtered = q.trim()
        ? caixas.filter(c => c.nome.toLowerCase().includes(q.toLowerCase()) || (c.desc || '').toLowerCase().includes(q.toLowerCase()))
        : caixas;
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);
    const pick = (v) => { onSelect(v); setQ(''); setOpen(false); };
    return (
        <div ref={ref} className="relative">
            <div className="flex items-center gap-2" style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', padding: '7px 10px' }}>
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input type="text" value={q}
                    placeholder={placeholder || '+ Adicionar módulo... (digite para buscar)'}
                    onChange={e => { setQ(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: 'var(--text-primary)', minWidth: 0 }} />
                {q && <button onClick={() => setQ('')} className="p-0.5 rounded hover:bg-red-500/10 cursor-pointer" style={{ color: 'var(--text-muted)' }}><X size={12} /></button>}
            </div>
            {open && (
                <div className="absolute left-0 right-0 mt-1 rounded-lg shadow-lg overflow-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', maxHeight: 280, zIndex: 50 }}>
                    {/* ── Itens Especiais + Avulso no topo (sempre visíveis) ── */}
                    {onAddPainel && !q.trim() && (
                        <>
                            <div className="px-3 pt-2 pb-1"><span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>Adicionar</span></div>
                            <button onClick={() => { onAddPainel(); setQ(''); setOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm cursor-pointer flex items-center gap-2"
                                style={{ color: 'var(--warning)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <Layers size={14} />
                                <span>⬡ Painel Ripado / Muxarabi</span>
                            </button>
                            {TIPOS_ESPECIAIS.map(t => {
                                const TIc = getEspecialIcon(t.id);
                                return (
                                    <button key={t.id} onClick={() => { onAddEspecial?.(t.id); setQ(''); setOpen(false); }}
                                        className="w-full text-left px-3 py-2 text-sm cursor-pointer flex items-center gap-2"
                                        style={{ color: t.cor }}
                                        onMouseEnter={e => e.currentTarget.style.background = `${t.cor}12`}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <TIc size={14} />
                                        <span>{t.nome}</span>
                                        <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>{t.unidade}</span>
                                    </button>
                                );
                            })}
                            {onAddAvulso && (
                                <button onClick={() => { onAddAvulso(); setQ(''); setOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-sm cursor-pointer flex items-center gap-2"
                                    style={{ color: 'var(--success)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <Tag size={14} />
                                    <span>Item Avulso (nome + valor)</span>
                                </button>
                            )}
                            {onAddGrupo && (
                                <button onClick={() => { onAddGrupo(); setQ(''); setOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-sm cursor-pointer flex items-center gap-2"
                                    style={{ color: 'var(--warning)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <Package size={14} />
                                    <span>Criar Grupo (agrupar módulos)</span>
                                </button>
                            )}
                            {filtered.length > 0 && (
                                <div className="px-3 pt-2 pb-1"><span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-muted)' }}>Módulos</span></div>
                            )}
                        </>
                    )}
                    {/* ── Lista de módulos (filtrada pela busca) ── */}
                    {filtered.map(c => (
                        <button key={c.db_id} onClick={() => pick(c.db_id)}
                            className="w-full text-left px-3 py-2 text-sm cursor-pointer flex items-center gap-2"
                            style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Package size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span>{c.nome}{c.desc ? <span style={{ color: 'var(--text-muted)' }}> — {c.desc}</span> : ''}</span>
                        </button>
                    ))}
                    {filtered.length === 0 && q.trim() && (
                        <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>Nenhum módulo encontrado para "{q}"</div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Componente: editor de instância de componente dentro de uma caixa ────────
function ComponenteInstancia({ ci, idx, caixaDims, mats, compDef, onUpdate, onRemove, chapasDB, acabDB, ferragensDB, globalPadroes }) {
    const [exp, setExp] = useState(false);
    const [matExp, setMatExp] = useState(false);

    const custoComp = useMemo(() => {
        if (!compDef) return 0;
        try {
            const r = calcItemV2(
                { pecas: [], tamponamentos: [] },
                caixaDims,
                { ...mats, matExtComp: ci.matExtComp || '' },
                [{
                    compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                    matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                    dimL: ci.dimL || 0, dimA: ci.dimA || 0, dimP: ci.dimP || 0,
                    matIntInst: ci.matIntInst || '', matExtInst: ci.matExtInst || '',
                }],
                null,
                globalPadroes,
            );
            return r.custo * (1 + (compDef.coef || 0));
        } catch (_) { return 0; }
    }, [ci, caixaDims, mats, compDef, globalPadroes]);

    if (!compDef) return null;

    const hasFrenteExt = compDef.frente_externa?.ativa;
    const allMats = [...chapasDB, ...acabDB.filter(a => a.preco > 0)];

    // Helper: nome legível de um material (chapa ou acabamento)
    const matNome = (id) => {
        if (!id) return null;
        return chapasDB.find(c => c.id === id)?.nome || acabDB.find(a => a.id === id)?.nome || id;
    };

    // Valores "auto" (herdados da caixa) para placeholders
    const autoL = caixaDims?.l || caixaDims?.L || 0;
    const autoA = caixaDims?.a || caixaDims?.A || 0;
    const autoP = caixaDims?.p || caixaDims?.P || 0;
    const autoMatIntNome = matNome(mats?.matInt) || 'MDF 18mm';
    const autoMatExtNome = matNome(mats?.matExt) || '—';

    // Quais dimensões fazem sentido para este componente (default: todas as 3)
    const dimsAplicaveis = compDef.dimsAplicaveis || ['L', 'A', 'P'];
    const ALL_DIM_FIELDS = [
        { id: 'dimL', key: 'L', label: 'L', auto: autoL },
        { id: 'dimA', key: 'A', label: 'A', auto: autoA },
        { id: 'dimP', key: 'P', label: 'P', auto: autoP },
    ];
    const dimFields = ALL_DIM_FIELDS.filter(f => dimsAplicaveis.includes(f.key));

    const temDimsCustom = dimFields.some(f => ci[f.id] > 0);
    const temMatsCustom = !!(ci.matIntInst || ci.matExtInst);

    return (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', borderLeft: '3px solid var(--success)' }}>
            <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)]"
                onClick={() => setExp(p => !p)}>
                <div className="flex items-center gap-2 flex-wrap">
                    {exp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Package size={12} style={{ color: 'var(--success)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{compDef.nome}</span>
                    {(ci.qtd || 1) > 1 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--success)' }}>×{ci.qtd}</span>
                    )}
                    {hasFrenteExt && ci.matExtComp && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>frente ext.</span>
                    )}
                    {temDimsCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.08))', color: 'var(--primary)' }}>
                            dims. custom
                        </span>
                    )}
                    {temMatsCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                            mat. custom
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--success)' }}>{R$(custoComp)}</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-0.5 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><X size={12} /></button>
                </div>
            </div>
            {exp && (
                <div className="px-3 pb-2.5 pt-2 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                    {/* Quantidade, variáveis e dimensões — tudo inline */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                            <label className={Z.lbl}>Qtd</label>
                            <input type="number" min="1" max="50" value={ci.qtd || 1}
                                onChange={e => onUpdate({ ...ci, qtd: Math.max(1, +e.target.value || 1) })}
                                className={Z.inp} />
                        </div>
                        {/* Dimensões do componente (L, P, etc.) */}
                        {dimFields.map(({ id, label, auto }) => (
                            <div key={id}>
                                <label className={Z.lbl}>
                                    {label} (mm)
                                    {!ci[id] && <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)' }}>(auto)</span>}
                                </label>
                                <input
                                    type="number" min="0" max="5000"
                                    value={ci[id] > 0 ? ci[id] : ''}
                                    placeholder={auto ? `${auto}` : 'Auto'}
                                    onChange={e => {
                                        const v = Math.max(0, +e.target.value || 0);
                                        onUpdate({ ...ci, [id]: v });
                                    }}
                                    className={Z.inp}
                                    style={ci[id] > 0 ? { borderColor: 'rgba(59,130,246,0.5)', background: 'rgba(59,130,246,0.04)' } : {}}
                                />
                            </div>
                        ))}
                        {/* Variáveis próprias (ex: Altura da Gaveta) */}
                        {(compDef.vars || []).map(v => {
                            const isAuto = v.default === 0;
                            const curVal = ci.vars?.[v.id];
                            return (
                                <div key={v.id}>
                                    <label className={Z.lbl}>
                                        {v.label} ({v.unit})
                                        {isAuto && !curVal && <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)' }}>(auto)</span>}
                                    </label>
                                    <input type="number" min={v.min} max={v.max}
                                        value={curVal || ''}
                                        placeholder={isAuto ? `Auto` : String(v.default)}
                                        onChange={e => {
                                            const val = +e.target.value;
                                            const newVars = { ...(ci.vars || {}) };
                                            if (val > 0) newVars[v.id] = val;
                                            else delete newVars[v.id];
                                            onUpdate({ ...ci, vars: newVars });
                                        }}
                                        className={Z.inp} />
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Materiais da instância ── colapsável */}
                    {temMatsCustom || matExp ? (
                        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.18)' }}>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#a855f7' }}>Material deste componente</span>
                                <div className="flex gap-2">
                                    {temMatsCustom && (
                                        <button onClick={() => { onUpdate({ ...ci, matIntInst: '', matExtInst: '' }); setMatExp(false); }}
                                            className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-500/10"
                                            style={{ color: 'var(--text-muted)' }}>
                                            Resetar
                                        </button>
                                    )}
                                    <button onClick={() => setMatExp(false)} className="text-[9px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>✕</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label className={Z.lbl}>Material Interno</label>
                                    <SearchableSelect
                                        value={ci.matIntInst || ''}
                                        onChange={val => onUpdate({ ...ci, matIntInst: val })}
                                        groups={[
                                            { label: 'Chapas', options: chapasDB.map(c => ({ value: c.id, label: c.nome })) },
                                            ...(acabDB.filter(a => a.preco > 0).length > 0
                                                ? [{ label: 'Acabamentos', options: acabDB.filter(a => a.preco > 0).map(a => ({ value: a.id, label: a.nome })) }]
                                                : []),
                                        ]}
                                        inheritOption={`↩ Herdar: ${autoMatIntNome}`}
                                        placeholder="Buscar material..."
                                        className={Z.inp}
                                        style={ci.matIntInst ? { borderColor: 'rgba(168,85,247,0.5)', background: 'rgba(168,85,247,0.04)' } : {}}
                                    />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Material Externo</label>
                                    <SearchableSelect
                                        value={ci.matExtInst || ''}
                                        onChange={val => onUpdate({ ...ci, matExtInst: val })}
                                        groups={[
                                            { label: 'Chapas', options: chapasDB.map(c => ({ value: c.id, label: c.nome })) },
                                            ...(acabDB.filter(a => a.preco > 0).length > 0
                                                ? [{ label: 'Acabamentos', options: acabDB.filter(a => a.preco > 0).map(a => ({ value: a.id, label: a.nome })) }]
                                                : []),
                                        ]}
                                        inheritOption={`↩ Herdar: ${autoMatExtNome}`}
                                        placeholder="Buscar material..."
                                        className={Z.inp}
                                        style={ci.matExtInst ? { borderColor: 'rgba(168,85,247,0.5)', background: 'rgba(168,85,247,0.04)' } : {}}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setMatExp(true)}
                            className="text-[10px] text-left cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                            style={{ color: '#a855f7' }}>
                            + material específico deste componente
                        </button>
                    )}

                    {/* Frente externa — material exclusivo */}
                    {hasFrenteExt && (
                        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--warning)' }}>Frente Externa — Material Exclusivo</span>
                                <Info size={11} style={{ color: 'var(--warning)' }} title="A frente externa pode ter acabamento e material diferente do interior da gaveta — impacta diretamente no preço." />
                            </div>
                            <div>
                                <label className={Z.lbl}>Material da Frente Externa</label>
                                <SearchableSelect
                                    value={ci.matExtComp || ''}
                                    onChange={val => onUpdate({ ...ci, matExtComp: val })}
                                    groups={[
                                        { label: 'Chapas', options: chapasDB.map(c => ({ value: c.id, label: c.nome })) },
                                        { label: 'Acabamentos premium', options: acabDB.filter(a => a.preco > 0).map(a => ({ value: a.id, label: `${a.nome} — ${R$(a.preco)}/m²` })) },
                                    ]}
                                    emptyOption="Sem frente externa / mesmo material interno"
                                    placeholder="Buscar material..."
                                    className={Z.inp}
                                />
                            </div>
                        </div>
                    )}

                    {/* Ferragens disponíveis */}
                    {(compDef.sub_itens || []).length > 0 && (
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#a855f7' }}>Ferragens</div>
                            <div className="flex flex-col gap-1">
                                {(compDef.sub_itens || []).map(si => (
                                    <SubItemRow
                                        key={si.id}
                                        si={si}
                                        ativo={ci.subItens?.[si.id] !== undefined ? ci.subItens[si.id] : si.defaultOn}
                                        onChange={v => onUpdate({ ...ci, subItens: { ...(ci.subItens || {}), [si.id]: v } })}
                                        ferrOvr={ci.subItensOvr?.[si.id]}
                                        onFerrChange={newId => onUpdate({ ...ci, subItensOvr: { ...(ci.subItensOvr || {}), [si.id]: newId } })}
                                        ferragensDB={ferragensDB}
                                        globalPadroes={globalPadroes}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}

// ── Relatório de cálculo de um item ─────────────────────────────────────────
function RelatorioItem({ res, chapasDB, fitasDB, coef, qtd }) {
    const custoFita = res.fita * (fitasDB[0]?.preco || 0.85);
    const custoFerragens = res.ferrList.reduce((s, f) => s + f.preco * f.qtd, 0);
    const custoChapas = Object.values(res.chapas).reduce((s, c) => s + (c.frac || c.n) * c.mat.preco, 0);

    const TYPE_COLOR = { caixa: 'var(--primary)', tamponamento: 'var(--primary)', componente: 'var(--muted)', frente_externa: 'var(--muted)' };
    const TYPE_LABEL = { caixa: 'Caixa', tamponamento: 'Tamp.', componente: 'Componente', frente_externa: 'Frente Ext.' };

    return (
        <div className="flex flex-col gap-3 pt-3" style={{ borderTop: '1px dashed var(--border)' }}>
            {/* Peças */}
            {res.pecas.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Layers size={10} /> Peças Cortadas ({res.pecas.length})
                    </div>
                    <table className="w-full border-collapse text-[10px]">
                        <thead><tr>{['Peça', 'Tipo', 'Área (m²)', 'Material', 'Fita (m)'].map(h => <th key={h} className={Z.th} style={{ padding: '3px 6px', fontSize: 9 }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {res.pecas.map((p, i) => (
                                <tr key={i} className="hover:bg-[var(--bg-hover)]">
                                    <td className="td-glass" style={{ padding: '2px 6px' }}>{p.nome}</td>
                                    <td className="td-glass" style={{ padding: '2px 6px' }}>
                                        <span className="px-1 py-0.5 rounded text-[8px] font-bold" style={{ background: `${TYPE_COLOR[p.tipo] || 'var(--primary)'}15`, color: TYPE_COLOR[p.tipo] || 'var(--primary)' }}>
                                            {TYPE_LABEL[p.tipo] || p.tipo}
                                        </span>
                                    </td>
                                    <td className="td-glass text-right font-mono" style={{ padding: '2px 6px' }}>{N(p.area, 4)}</td>
                                    <td className="td-glass" style={{ padding: '2px 6px', color: 'var(--text-muted)' }}>{chapasDB.find(c => c.id === p.matId)?.nome || p.matId || '—'}</td>
                                    <td className="td-glass text-right font-mono" style={{ padding: '2px 6px' }}>{N(p.fita, 2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {/* Chapas */}
            {Object.keys(res.chapas).length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Package size={10} /> Chapas Necessárias</div>
                    <table className="w-full border-collapse text-[10px]">
                        <thead><tr>{['Material', 'Área (m²)', 'Uso', 'Unit.', 'Custo'].map(h => <th key={h} className={Z.th} style={{ padding: '3px 6px', fontSize: 9 }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {Object.values(res.chapas).map((c, i) => (
                                <tr key={i} className="hover:bg-[var(--bg-hover)]">
                                    <td className="td-glass" style={{ padding: '2px 6px' }}>{c.mat.nome}</td>
                                    <td className="td-glass text-right font-mono" style={{ padding: '2px 6px' }}>{N(c.area, 4)}</td>
                                    <td className="td-glass text-center font-bold" style={{ padding: '2px 6px', color: 'var(--primary)' }}>{N(c.frac || c.n, 2)} chp</td>
                                    <td className="td-glass text-right" style={{ padding: '2px 6px', color: 'var(--text-muted)' }}>{R$(c.mat.preco)}</td>
                                    <td className="td-glass text-right font-semibold" style={{ padding: '2px 6px', color: 'var(--primary)' }}>{R$((c.frac || c.n) * c.mat.preco)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {/* Ferragens */}
            {res.ferrList.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Wrench size={10} /> Ferragens</div>
                    <table className="w-full border-collapse text-[10px]">
                        <thead><tr>{['Ferragem', 'Origem', 'Qtd', 'Unit.', 'Total'].map(h => <th key={h} className={Z.th} style={{ padding: '3px 6px', fontSize: 9 }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {res.ferrList.map((f, i) => (
                                <tr key={i} className="hover:bg-[var(--bg-hover)]">
                                    <td className="td-glass" style={{ padding: '2px 6px' }}>{f.nome}</td>
                                    <td className="td-glass text-[9px]" style={{ padding: '2px 6px', color: 'var(--text-muted)' }}>{f.orig}</td>
                                    <td className="td-glass text-right font-mono" style={{ padding: '2px 6px' }}>{N(f.qtd, 0)}</td>
                                    <td className="td-glass text-right" style={{ padding: '2px 6px', color: 'var(--text-muted)' }}>{R$(f.preco)}</td>
                                    <td className="td-glass text-right font-semibold" style={{ padding: '2px 6px', color: 'var(--primary)' }}>{R$(f.preco * f.qtd)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {/* Resumo */}
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex flex-col gap-1 text-[11px]">
                    <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Chapas</span><span className="font-mono">{R$(custoChapas)}</span></div>
                    <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Fita de borda</span><span className="font-mono">{R$(custoFita)}</span></div>
                    {(res.custoAcabamentos || 0) > 0 && <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Acabamentos</span><span className="font-mono">{R$(res.custoAcabamentos)}</span></div>}
                    <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Ferragens</span><span className="font-mono">{R$(custoFerragens)}</span></div>
                    <div className="flex justify-between pt-1 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                        <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Custo Material</span>
                        <span className="font-mono font-semibold">{R$(res.custo)}</span>
                    </div>
                    {coef > 0 && (
                        <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Complexidade (×{N(1 + coef, 2)})</span><span className="font-mono">+{R$((res.custoChapas + res.custoFita + (res.custoAcabamentos || 0)) * coef)}</span></div>
                    )}
                    {qtd > 1 && <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Quantidade</span><span className="font-mono">×{qtd}</span></div>}
                    <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: '2px solid var(--primary)' }}>
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Custo total do item</span>
                        <span className="font-mono font-bold" style={{ color: 'var(--primary)' }}>{R$(((res.custoChapas + res.custoFita + (res.custoAcabamentos || 0)) * (1 + coef) + custoFerragens) * qtd)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── PainelCard — painel ripado/muxarabi inline no orçamento ──────────────────
function PainelCard({ painel, bibItems, onUpdate, onRemove, precoVenda }) {
    const [exp, setExp] = useState(false);
    const materiais = (bibItems || []).filter(m => m.tipo === 'material');
    const calc = useMemo(() => calcPainelRipado(painel, bibItems || []), [painel, bibItems]);
    const coef = painel.coefDificuldade ?? (painel.tipo === 'muxarabi' ? 1.5 : 1.3);
    const custoBase = (calc?.custoMaterial || 0) * coef * (painel.qtd || 1);
    const custo = precoVenda != null ? precoVenda : custoBase;
    const up = (patch) => onUpdate({ ...painel, ...patch });

    return (
        <div className="rounded-lg border overflow-hidden mb-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', borderLeft: '3px solid var(--warning)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setExp(!exp)}>
                <div className="flex items-center gap-2">
                    {exp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <Layers size={13} style={{ color: 'var(--warning)' }} />
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{painel.nome || 'Painel Ripado'}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                        {painel.tipo === 'muxarabi' ? 'Muxarabi' : 'Ripado'}
                    </span>
                    {calc && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{calc.nV} rip · {N(calc.mlTotal)}m</span>}
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-xs" style={{ color: 'var(--warning)' }}>{R$(custo)}</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
            </div>

            {/* Expanded content */}
            {exp && (
                <div className="px-4 pb-3 pt-2 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                    {/* Nome + tipo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <label className={Z.lbl}>Nome</label>
                            <input className={Z.inp} value={painel.nome || ''} onChange={e => up({ nome: e.target.value })} placeholder="Painel ripado..." />
                        </div>
                        <div>
                            <label className={Z.lbl}>Tipo</label>
                            <div className="flex gap-1 mt-1">
                                {[['ripado', 'Ripado'], ['muxarabi', 'Muxarabi']].map(([id, lb]) => (
                                    <button key={id} onClick={() => up({ tipo: id })}
                                        className="flex-1 py-1.5 rounded text-xs font-semibold transition-all"
                                        style={painel.tipo === id ? { background: 'var(--warning)', color: '#fff' } : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                        {lb}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Dimensões + qtd */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div><label className={Z.lbl}>Largura (mm)</label><input type="number" className={Z.inp} min={100} value={painel.L || 2400} onChange={e => up({ L: +e.target.value })} /></div>
                        <div><label className={Z.lbl}>Altura (mm)</label><input type="number" className={Z.inp} min={100} value={painel.A || 2200} onChange={e => up({ A: +e.target.value })} /></div>
                        <div><label className={Z.lbl}>Qtd</label><input type="number" className={Z.inp} min={1} value={painel.qtd || 1} onChange={e => up({ qtd: Math.max(1, +e.target.value) })} /></div>
                    </div>

                    {/* Ripas V */}
                    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--warning-border)', borderLeft: '3px solid var(--warning)' }}>
                        <span className="text-[10px] uppercase tracking-widest font-bold block mb-2" style={{ color: 'var(--warning)' }}>Ripas Verticais</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <div><label className={Z.lbl}>Largura (mm)</label><input type="number" className={Z.inp} min={5} value={painel.wV || 40} onChange={e => up({ wV: +e.target.value })} /></div>
                            <div><label className={Z.lbl}>Espessura (mm)</label><input type="number" className={Z.inp} min={3} value={painel.eV || 18} onChange={e => up({ eV: +e.target.value })} /></div>
                            <div><label className={Z.lbl}>Espaçamento (mm)</label><input type="number" className={Z.inp} min={0} value={painel.sV || 15} onChange={e => up({ sV: +e.target.value })} /></div>
                        </div>
                        <div className="mt-2">
                            <label className={Z.lbl}>Material das Ripas</label>
                            <select className={Z.inp} value={painel.matRipaV || ''} onChange={e => up({ matRipaV: e.target.value })}>
                                <option value="">Sem custo</option>
                                {materiais.map(m => <option key={m.id} value={m.id}>{m.nome}{m.largura ? ` ${m.largura}×${m.altura}mm` : ''} — {R$(m.preco)}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Ripas H (muxarabi) */}
                    {painel.tipo === 'muxarabi' && (
                        <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', borderLeft: '3px solid #a78bfa' }}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#a78bfa' }}>Ripas Horizontais</span>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                    <input type="checkbox" checked={painel.mesmasRipas !== false} onChange={e => up({ mesmasRipas: e.target.checked })} />
                                    Mesmas specs
                                </label>
                            </div>
                            {painel.mesmasRipas === false && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div><label className={Z.lbl}>Largura (mm)</label><input type="number" className={Z.inp} min={5} value={painel.wH || 40} onChange={e => up({ wH: +e.target.value })} /></div>
                                    <div><label className={Z.lbl}>Espessura (mm)</label><input type="number" className={Z.inp} min={3} value={painel.eH || 18} onChange={e => up({ eH: +e.target.value })} /></div>
                                    <div><label className={Z.lbl}>Espaçamento (mm)</label><input type="number" className={Z.inp} min={0} value={painel.sH || 15} onChange={e => up({ sH: +e.target.value })} /></div>
                                </div>
                            )}
                            {painel.mesmasRipas !== false && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Usando as mesmas especificações das ripas verticais.</p>}
                        </div>
                    )}

                    {/* Substrato */}
                    <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                        <input type="checkbox" checked={painel.temSubstrato !== false} onChange={e => up({ temSubstrato: e.target.checked })} />
                        Incluir substrato (fundo)
                    </label>
                    {painel.temSubstrato !== false && (
                        <div>
                            <label className={Z.lbl}>Material do Substrato</label>
                            <select className={Z.inp} value={painel.matSubstrato || ''} onChange={e => up({ matSubstrato: e.target.value })}>
                                <option value="">Sem custo</option>
                                {materiais.map(m => <option key={m.id} value={m.id}>{m.nome} — {R$(m.preco)}</option>)}
                            </select>
                        </div>
                    )}

                    {/* Coeficiente de dificuldade */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <label className={Z.lbl}>Coef. Dificuldade</label>
                            <input type="number" className={Z.inp} min={1} step={0.05}
                                value={painel.coefDificuldade ?? (painel.tipo === 'muxarabi' ? 1.5 : 1.3)}
                                onChange={e => up({ coefDificuldade: Math.max(1, +e.target.value || 1) })} />
                        </div>
                        <div className="flex items-end pb-1">
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                Multiplica o custo total (corte, colagem, montagem). Padrão: {painel.tipo === 'muxarabi' ? '1.50' : '1.30'}
                            </span>
                        </div>
                    </div>

                    {/* Resultados ao vivo */}
                    {calc && (
                        <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                            <span className="text-[10px] uppercase tracking-widest font-bold block mb-2" style={{ color: 'var(--text-muted)' }}>Resultado</span>
                            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                                <div><span style={{ color: 'var(--text-muted)' }}>Ripas V: </span><strong>{calc.nV} un</strong></div>
                                {painel.tipo === 'muxarabi' && <div><span style={{ color: 'var(--text-muted)' }}>Ripas H: </span><strong>{calc.nH} un</strong></div>}
                                <div><span style={{ color: 'var(--text-muted)' }}>ML total: </span><strong>{N(calc.mlTotal)} m</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Fita: </span><strong>{N(calc.fitaTotal)} ml</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Cobertura: </span><strong>{N(calc.cobertura, 1)}%</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Chapas: </span><strong>{R$(calc.custoChapas)}</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Fita borda: </span><strong>{R$(calc.custoFita)}</strong></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Custo mat.: </span><strong>{R$(calc.custoMaterial)}</strong></div>
                            </div>
                            <div className="mt-2 pt-2 flex flex-col gap-1 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--text-muted)' }}>Custo c/ dificuldade (×{N(coef, 2)}):</span>
                                    <strong style={{ color: 'var(--text-muted)' }}>{R$(custoBase)}</strong>
                                </div>
                                {precoVenda != null && (
                                    <div className="flex justify-between">
                                        <span style={{ color: 'var(--text-muted)' }}>Preço de venda (c/ taxas):</span>
                                        <strong style={{ color: 'var(--warning)' }}>{R$(precoVenda)}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Componente: ripado dentro de módulo (versão simplificada do PainelCard) ──
function RipadoModuloCard({ ripado, dims, bibItems, onUpdate }) {
    const materiais = (bibItems || []).filter(m => m.tipo === 'material');
    const cfg = useMemo(() => ({ ...ripado, L: dims?.l || 0, A: dims?.a || 0 }), [ripado, dims]);
    const calc = useMemo(() => calcPainelRipado(cfg, bibItems || []), [cfg, bibItems]);
    const coef = ripado.coefDificuldade ?? 1.3;
    const custo = (calc?.custoMaterial || 0) * coef;
    const up = (patch) => onUpdate(patch);

    return (
        <div className="flex flex-col gap-3">
            {/* Dims read-only do módulo */}
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>Dimensões do módulo: <strong>{dims?.l || 0}</strong> × <strong>{dims?.a || 0}</strong> mm</span>
                <span>Custo: <strong style={{ color: 'var(--warning)' }}>{R$(custo)}</strong></span>
            </div>

            {/* Tipo + nome */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={Z.lbl}>Tipo</label>
                    <div className="flex gap-1 mt-1">
                        {[['ripado', 'Ripado'], ['muxarabi', 'Muxarabi']].map(([id, lb]) => (
                            <button key={id} onClick={() => up({ tipo: id })}
                                className="flex-1 py-1.5 rounded text-xs font-semibold transition-all"
                                style={ripado.tipo === id ? { background: 'var(--warning)', color: '#fff' } : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                {lb}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className={Z.lbl}>Coef. Dificuldade</label>
                    <input type="number" className={Z.inp} min={1} step={0.05}
                        value={ripado.coefDificuldade ?? 1.3}
                        onChange={e => up({ coefDificuldade: Math.max(1, +e.target.value || 1) })} />
                </div>
            </div>

            {/* Ripas V */}
            <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--warning-border)', borderLeft: '3px solid var(--warning)' }}>
                <span className="text-[10px] uppercase tracking-widest font-bold block mb-2" style={{ color: 'var(--warning)' }}>Ripas Verticais</span>
                <div className="grid grid-cols-3 gap-2">
                    <div><label className={Z.lbl}>Largura (mm)</label><input type="number" className={Z.inp} min={5} value={ripado.wV || 40} onChange={e => up({ wV: +e.target.value })} /></div>
                    <div><label className={Z.lbl}>Espessura (mm)</label><input type="number" className={Z.inp} min={3} value={ripado.eV || 18} onChange={e => up({ eV: +e.target.value })} /></div>
                    <div><label className={Z.lbl}>Espaçamento (mm)</label><input type="number" className={Z.inp} min={0} value={ripado.sV || 15} onChange={e => up({ sV: +e.target.value })} /></div>
                </div>
                <div className="mt-2">
                    <label className={Z.lbl}>Material das Ripas</label>
                    <select className={Z.inp} value={ripado.matRipaV || ''} onChange={e => up({ matRipaV: e.target.value })}>
                        <option value="">Sem custo</option>
                        {materiais.map(m => <option key={m.id} value={m.id}>{m.nome}{m.largura ? ` ${m.largura}×${m.altura}mm` : ''} — {R$(m.preco)}</option>)}
                    </select>
                </div>
            </div>

            {/* Ripas H (muxarabi) */}
            {ripado.tipo === 'muxarabi' && (
                <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', borderLeft: '3px solid #a78bfa' }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#a78bfa' }}>Ripas Horizontais</span>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                            <input type="checkbox" checked={ripado.mesmasRipas !== false} onChange={e => up({ mesmasRipas: e.target.checked })} />
                            Mesmas specs
                        </label>
                    </div>
                    {ripado.mesmasRipas === false && (
                        <div className="grid grid-cols-3 gap-2">
                            <div><label className={Z.lbl}>Largura (mm)</label><input type="number" className={Z.inp} min={5} value={ripado.wH || 40} onChange={e => up({ wH: +e.target.value })} /></div>
                            <div><label className={Z.lbl}>Espessura (mm)</label><input type="number" className={Z.inp} min={3} value={ripado.eH || 18} onChange={e => up({ eH: +e.target.value })} /></div>
                            <div><label className={Z.lbl}>Espaçamento (mm)</label><input type="number" className={Z.inp} min={0} value={ripado.sH || 15} onChange={e => up({ sH: +e.target.value })} /></div>
                        </div>
                    )}
                    {ripado.mesmasRipas !== false && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Usando as mesmas especificações das ripas verticais.</p>}
                </div>
            )}

            {/* Substrato */}
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={ripado.temSubstrato === true} onChange={e => up({ temSubstrato: e.target.checked })} />
                Incluir substrato (fundo) — normalmente desabilitado quando a porta já é o substrato
            </label>
            {ripado.temSubstrato === true && (
                <div>
                    <label className={Z.lbl}>Material do Substrato</label>
                    <select className={Z.inp} value={ripado.matSubstrato || ''} onChange={e => up({ matSubstrato: e.target.value })}>
                        <option value="">Sem custo</option>
                        {materiais.map(m => <option key={m.id} value={m.id}>{m.nome} — {R$(m.preco)}</option>)}
                    </select>
                </div>
            )}

            {/* Resultado ao vivo */}
            {calc && (
                <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <span className="text-[10px] uppercase tracking-widest font-bold block mb-2" style={{ color: 'var(--text-muted)' }}>Resultado</span>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                        <div><span style={{ color: 'var(--text-muted)' }}>Ripas V: </span><strong>{calc.nV} un</strong></div>
                        {ripado.tipo === 'muxarabi' && <div><span style={{ color: 'var(--text-muted)' }}>Ripas H: </span><strong>{calc.nH} un</strong></div>}
                        <div><span style={{ color: 'var(--text-muted)' }}>ML total: </span><strong>{N(calc.mlTotal)} m</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Fita: </span><strong>{N(calc.fitaTotal)} ml</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Cobertura: </span><strong>{N(calc.cobertura, 1)}%</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Chapas: </span><strong>{R$(calc.custoChapas)}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Fita borda: </span><strong>{R$(calc.custoFita)}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Custo mat.: </span><strong>{R$(calc.custoMaterial)}</strong></div>
                    </div>
                    <div className="mt-2 pt-2 flex justify-between text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Custo c/ dificuldade (×{N(coef, 2)}):</span>
                        <strong style={{ color: 'var(--warning)' }}>{R$(calc.custoMaterial * coef)}</strong>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Ícone por tipo especial ───────────────────────────────────────────────────
const ESPECIAL_ICON = { espelho: Square, estofado: Sofa, aluminio: RectangleHorizontal, vidro: GlassWater, outro: Shapes };
const getEspecialIcon = (tipo) => ESPECIAL_ICON[tipo] || Shapes;
const getEspecialCor = (tipo) => (TIPOS_ESPECIAIS.find(t => t.id === tipo)?.cor) || '#a78bfa';

// ── Componente: card de item especial ────────────────────────────────────────
function ItemEspecialCard({ item, bibItems, onUpdate, onRemove, onCopy, readOnly, grupos, draggable: isDraggable, onDragStart, onDragEnd }) {
    const [exp, setExp] = useState(false);
    const tipoInfo = TIPOS_ESPECIAIS.find(t => t.id === item.tipo) || TIPOS_ESPECIAIS[4];
    const cor = tipoInfo.cor;
    const Ic = getEspecialIcon(item.tipo);

    const materiaisDisponiveis = useMemo(() => {
        return (bibItems || []).filter(m => m.tipo === item.tipo);
    }, [bibItems, item.tipo]);

    const calc = useMemo(() => calcItemEspecial(item, bibItems || []), [item, bibItems]);
    const up = (patch) => onUpdate({ ...item, ...patch });

    return (
        <div className="rounded-lg border overflow-hidden mb-2"
            draggable={isDraggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', borderLeft: `3px solid ${cor}`, cursor: isDraggable ? 'grab' : 'default' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setExp(!exp)}>
                <div className="flex items-center gap-2">
                    {isDraggable && <GripVertical size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
                    {exp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <Ic size={13} style={{ color: cor }} />
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{item.nome || tipoInfo.nome}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${cor}15`, color: cor }}>
                        {tipoInfo.nome}
                    </span>
                    {item.L > 0 && item.A > 0 && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{item.L}×{item.A}mm</span>}
                    {calc.area > 0 && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{N(calc.area)} m²</span>}
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-xs" style={{ color: cor }}>{R$(calc.custo)}</span>
                    {!readOnly && onCopy && <button onClick={e => { e.stopPropagation(); onCopy(); }} className="p-1 rounded hover:bg-violet-500/10 text-violet-400/50 hover:text-violet-400" title="Duplicar"><Copy size={12} /></button>}
                    {!readOnly && <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>}
                </div>
            </div>

            {/* Expanded */}
            {exp && (
                <div className="px-4 pb-3 pt-2 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', ...(readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                    {/* Nome */}
                    <input className={Z.inp} value={item.nome || ''} onChange={e => up({ nome: e.target.value })} placeholder={`Ex: ${tipoInfo.nome} Bisotê, Painel Estofado...`}
                        style={item.nome ? { borderColor: 'rgba(19,121,240,0.4)', background: 'rgba(19,121,240,0.03)' } : { opacity: 0.45 }} />

                    {/* Dimensões + qtd */}
                    <div className={`grid gap-2 ${item.tipo === 'aluminio' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        <div>
                            <label className={Z.lbl}>{item.tipo === 'aluminio' ? 'Comp. (mm)' : 'L (mm)'}</label>
                            <input type="number" className={Z.inp} min={0} value={item.L || 0} onChange={e => up({ L: +e.target.value })} />
                        </div>
                        {item.tipo !== 'aluminio' && (
                            <div><label className={Z.lbl}>A (mm)</label><input type="number" className={Z.inp} min={0} value={item.A || 0} onChange={e => up({ A: +e.target.value })} /></div>
                        )}
                        <div><label className={Z.lbl}>Qtd</label><input type="number" className={Z.inp} min={1} value={item.qtd || 1} onChange={e => up({ qtd: Math.max(1, +e.target.value) })} /></div>
                    </div>

                    {/* Material da biblioteca (se houver) */}
                    {materiaisDisponiveis.length > 0 && (
                        <div>
                            <label className={Z.lbl}>Material (da Biblioteca)</label>
                            <select className={Z.inp} value={item.materialId || ''} onChange={e => {
                                const matId = e.target.value;
                                const mat = bibItems.find(m => String(m.id) === String(matId));
                                up({ materialId: matId, precoUnit: mat ? (mat.preco_m2 || mat.preco || 0) : item.precoUnit });
                            }}>
                                <option value="">— Preço manual —</option>
                                {materiaisDisponiveis.map(m => (
                                    <option key={m.id} value={m.id}>{m.nome} — {R$(m.preco_m2 || m.preco)}/{item.tipo === 'aluminio' ? 'ml' : 'm²'}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Preço unitário (manual ou override) */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={Z.lbl}>R$ / {tipoInfo.unidade === 'ml' ? 'ml' : tipoInfo.unidade === 'm²' ? 'm²' : 'un'}</label>
                            <input type="number" step="0.01" className={Z.inp} value={item.precoUnit || 0} onChange={e => up({ precoUnit: +e.target.value, materialId: '' })} />
                        </div>
                        <div>
                            <label className={Z.lbl}>Instalação (R$)</label>
                            <input type="number" step="0.01" className={Z.inp} value={item.custoInstalacao || 0} onChange={e => up({ custoInstalacao: +e.target.value })} />
                        </div>
                    </div>

                    {/* Perfis de alumínio (modo avançado — múltiplos perfis com comprimentos diferentes) */}
                    {item.tipo === 'aluminio' && (
                        <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-card)', borderColor: `${cor}30`, borderLeft: `3px solid ${cor}` }}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: cor }}>Múltiplos Perfis</span>
                                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Para perfis com comprimentos diferentes — opcional</span>
                            </div>
                            {(item.perfis || []).map((p, pi) => (
                                <div key={pi} className="grid grid-cols-4 gap-2 mb-2">
                                    <div><input className={Z.inp} value={p.nome || ''} placeholder="Nome do perfil" onChange={e => { const perfis = [...(item.perfis || [])]; perfis[pi] = { ...p, nome: e.target.value }; up({ perfis }); }} /></div>
                                    <div><input type="number" className={Z.inp} value={p.comp || 0} placeholder="Comp. (mm)" onChange={e => { const perfis = [...(item.perfis || [])]; perfis[pi] = { ...p, comp: +e.target.value }; up({ perfis }); }} /></div>
                                    <div><input type="number" step="0.01" className={Z.inp} value={p.precoML || 0} placeholder="R$/ml" onChange={e => { const perfis = [...(item.perfis || [])]; perfis[pi] = { ...p, precoML: +e.target.value }; up({ perfis }); }} /></div>
                                    <div className="flex items-center gap-1">
                                        <input type="number" min={1} className={Z.inp} value={p.qtd || 1} style={{ width: 56, textAlign: 'center', fontSize: 13, padding: '4px 6px' }} onChange={e => { const perfis = [...(item.perfis || [])]; perfis[pi] = { ...p, qtd: Math.max(1, +e.target.value) }; up({ perfis }); }} />
                                        <button onClick={() => { const perfis = (item.perfis || []).filter((_, i) => i !== pi); up({ perfis }); }}
                                            className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={11} /></button>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => up({ perfis: [...(item.perfis || []), { nome: '', comp: 0, precoML: 0, qtd: 1 }] })}
                                className="text-[11px] px-2 py-1 rounded border cursor-pointer" style={{ borderColor: `${cor}40`, color: cor }}>
                                <Plus size={10} className="inline mr-1" />Adicionar perfil
                            </button>

                            {/* Vidro opcional */}
                            <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <button onClick={() => up({ vidro: item.vidro ? null : { tipo: '', precoM2: 0 } })}
                                        className="flex items-center gap-1.5 cursor-pointer">
                                        {item.vidro
                                            ? <ToggleRight size={16} style={{ color: '#22d3ee' }} />
                                            : <ToggleLeft size={16} style={{ color: 'var(--text-muted)' }} />}
                                        <span className="text-xs font-medium" style={{ color: item.vidro ? '#22d3ee' : 'var(--text-muted)' }}>Vidro</span>
                                    </button>
                                </div>
                                {item.vidro && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><label className={Z.lbl}>Tipo</label><input className={Z.inp} value={item.vidro.tipo || ''} placeholder="Temperado 8mm" onChange={e => up({ vidro: { ...item.vidro, tipo: e.target.value } })} /></div>
                                        <div><label className={Z.lbl}>R$/m²</label><input type="number" step="0.01" className={Z.inp} value={item.vidro.precoM2 || 0} onChange={e => up({ vidro: { ...item.vidro, precoM2: +e.target.value } })} /></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Observações */}
                    <div>
                        <label className={Z.lbl}>Observações</label>
                        <input className={Z.inp} value={item.obs || ''} onChange={e => up({ obs: e.target.value })} placeholder="Notas adicionais..." />
                    </div>

                    {/* Resultado */}
                    <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                        <div className="flex justify-between text-xs">
                            <span style={{ color: 'var(--text-muted)' }}>{calc.descricao}</span>
                            <strong style={{ color: cor }}>{R$(calc.custo)}</strong>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Modal: Cadastro Rápido de Cliente ────────────────────────────────────────
function QuickClientModal({ onClose, onCreated }) {
    const [nome, setNome] = useState('');
    const [tel, setTel] = useState('');
    const [email, setEmail] = useState('');
    const [tipo, setTipo] = useState('fisica');
    const [doc, setDoc] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const handleSave = async () => {
        if (!nome.trim()) { setErr('Nome é obrigatório'); return; }
        setSaving(true); setErr('');
        try {
            const novo = await api.post('/clientes', {
                nome: nome.trim(), tel: tel.trim(), email: email.trim(),
                tipo_pessoa: tipo,
                ...(tipo === 'fisica' ? { cpf: doc.trim() } : { cnpj: doc.trim() }),
            });
            onCreated(novo.id);
        } catch (ex) {
            setErr(ex.error || 'Erro ao cadastrar');
            setSaving(false);
        }
    };

    return (
        <Modal title="Cadastro Rápido de Cliente" close={onClose} w={420}>
            <div className="flex flex-col gap-3">
                <div>
                    <label className={Z.lbl}>Nome *</label>
                    <input value={nome} onChange={e => setNome(e.target.value)} className={Z.inp} placeholder="Nome completo" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={Z.lbl}>Telefone</label>
                        <input value={tel} onChange={e => setTel(e.target.value)} className={Z.inp} placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Email</label>
                        <input value={email} onChange={e => setEmail(e.target.value)} className={Z.inp} placeholder="email@exemplo.com" type="email" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={Z.lbl}>Tipo</label>
                        <select value={tipo} onChange={e => { setTipo(e.target.value); setDoc(''); }} className={Z.inp}>
                            <option value="fisica">Pessoa Física</option>
                            <option value="juridica">Pessoa Jurídica</option>
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>{tipo === 'fisica' ? 'CPF' : 'CNPJ'}</label>
                        <input value={doc} onChange={e => setDoc(e.target.value)} className={Z.inp}
                            placeholder={tipo === 'fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
                    </div>
                </div>
                {err && <div className="text-xs text-red-500">{err}</div>}
                <div className="flex justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className={Z.btn}>
                        {saving ? <><RefreshCw size={14} className="animate-spin inline mr-1" />Salvando...</> : 'Salvar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Novo({ clis, taxas: globalTaxas, editOrc, nav, reload, notify }) {
    const [cid, sc] = useState(editOrc?.cliente_id || '');
    const [projeto, setProjeto] = useState(editOrc?.projeto || '');
    const [numero, setNumero] = useState(editOrc?.numero || '');
    const [validadeDias, setValidadeDias] = useState(editOrc?.validade_dias || parseInt(editOrc?.validade_proposta) || 15);
    const [ambientes, setAmbientes] = useState(editOrc?.ambientes || []);
    const [obs, so] = useState(editOrc?.obs || '');
    const [expandedAmb, setExpandedAmb] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null);
    const [dragOverGrupo, setDragOverGrupo] = useState(null); // grupo_id being hovered during drag
    const [reportItemId, setReportItemId] = useState(null);
    const [advancedItemId, setAdvancedItemId] = useState(null); // item com painel avançado aberto
    const [addCompModal, setAddCompModal] = useState(null); // { ambId, itemId }
    const [compSearch, setCompSearch] = useState('');
    const [showTipoAmbModal, setShowTipoAmbModal] = useState(false);
    const [ambTemplates, setAmbTemplates] = useState([]);
    const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(null); // ambId
    const [templateNome, setTemplateNome] = useState('');
    const [templateCategoria, setTemplateCategoria] = useState('');
    const [mkExpanded, setMkExpanded] = useState(false);
    const [compExpanded, setCompExpanded] = useState(true);
    const [diagExp, setDiagExp] = useState(false);       // Diagnóstico de Preço (sidebar)
    const [custoHExp, setCustoHExp] = useState(false);   // Custo-hora breakdown (sidebar)
    const [consumExp, setConsumExp] = useState(false);   // Consumíveis breakdown (sidebar)
    const [showImportModal, setShowImportModal] = useState(false);
    const [importJson, setImportJson] = useState('');
    const [importLoading, setImportLoading] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [novoConfirm, setNovoConfirm] = useState(null); // { msg, title?, onOk }
    // A: Dados do Projeto colapsável
    const [dadosExp, setDadosExp] = useState(!editOrc);
    // C: Dropdown "···" para ações secundárias de ambientes
    const [moreActionsOpen, setMoreActionsOpen] = useState(false);
    const moreActionsRef = useRef(null);

    // Catálogo e biblioteca do banco
    const [caixas, setCaixas] = useState([]);
    const [componentesCat, setComponentesCat] = useState([]);
    const [bibItems, setBibItems] = useState([]);

    const componentesFiltrados = useMemo(() => {
        const q = compSearch.trim().toLowerCase();
        if (!q) return componentesCat;
        return componentesCat.filter(comp => {
            const nome = (comp.nome || '').toLowerCase();
            const desc = (comp.desc || comp.descricao || '').toLowerCase();
            const cat = (comp.cat || '').toLowerCase();
            return nome.includes(q) || desc.includes(q) || cat.includes(q);
        });
    }, [componentesCat, compSearch]);

    useEffect(() => {
        if (!addCompModal) setCompSearch('');
    }, [addCompModal]);

    useEffect(() => {
        api.get('/catalogo?tipo=caixa').then(setCaixas).catch(e => notify(e.error || 'Erro ao carregar catálogo'));
        api.get('/catalogo?tipo=componente').then(setComponentesCat).catch(e => notify(e.error || 'Erro ao carregar componentes'));
        api.get('/biblioteca').then(setBibItems).catch(e => notify(e.error || 'Erro ao carregar biblioteca'));
        api.get('/orcamentos/templates').then(setAmbTemplates).catch(e => notify(e.error || 'Erro ao carregar templates'));
    }, []);

    // ── Hidratação: ao carregar do banco, itens só têm caixaId/compId — precisamos injetar caixaDef/compDef do catálogo
    useEffect(() => {
        if (caixas.length === 0 || componentesCat.length === 0) return;
        let changed = false;
        setAmbientes(prev => prev.map(amb => ({
            ...amb,
            itens: (amb.itens || []).map(item => {
                let updated = item;
                // Hidratar caixaDef se ausente
                if (!item.caixaDef && item.caixaId) {
                    const def = caixas.find(c => c.db_id === item.caixaId);
                    if (def) { updated = { ...updated, caixaDef: JSON.parse(JSON.stringify(def)) }; changed = true; }
                }
                // Hidratar compDef em cada componente se ausente
                if (updated.componentes?.length > 0) {
                    const comps = updated.componentes.map(ci => {
                        if (ci.compDef) return ci;
                        const cd = componentesCat.find(c => c.db_id === ci.compId);
                        if (cd) { changed = true; return { ...ci, compDef: JSON.parse(JSON.stringify(cd)) }; }
                        return ci;
                    });
                    updated = { ...updated, componentes: comps };
                }
                return updated;
            }),
        })));
        // if (changed) console.log('[Hidratação] caixaDef/compDef injetados do catálogo');
    }, [caixas, componentesCat]);

    const bib = useMemo(() => {
        if (bibItems.length === 0) return null;
        const chapas = bibItems.filter(i => i.tipo === 'material' && i.unidade === 'chapa').map(i => ({
            id: i.cod || `bib_${i.id}`, nome: i.nome, esp: i.espessura, larg: i.largura,
            alt: i.altura, preco: i.preco, perda_pct: i.perda_pct || 15, fita_preco: i.fita_preco || 0,
            uso_count: i.uso_count || 0,
        }));
        const ferragens = bibItems.filter(i => i.tipo === 'ferragem' || i.tipo === 'acessorio').map(i => ({
            id: i.cod || `bib_${i.id}`, nome: i.nome, preco: i.preco, un: i.unidade, categoria: i.categoria || '',
            uso_count: i.uso_count || 0,
        }));
        const acabamentos = bibItems.filter(i => i.tipo === 'acabamento').map(i => ({
            id: i.cod || `bib_${i.id}`, nome: i.nome, preco: i.preco || i.preco_m2, un: 'm²',
            uso_count: i.uso_count || 0,
        }));
        const fitas = bibItems.filter(i => i.tipo === 'material' && i.unidade === 'm' && i.nome.toLowerCase().includes('fita')).map(i => ({
            id: i.cod || `bib_${i.id}`, nome: i.nome, preco: i.preco,
        }));
        // Top 5 chapas mais usadas
        const topChapas = [...chapas].sort((a, b) => (b.uso_count || 0) - (a.uso_count || 0)).filter(c => c.uso_count > 0).slice(0, 5);
        const topAcab = [...acabamentos].sort((a, b) => (b.uso_count || 0) - (a.uso_count || 0)).filter(c => c.uso_count > 0).slice(0, 5);
        // Mescla ferragens do banco com fallback embutido (garante que ferragens referenciadas por componentes existam)
        const mergedFerragens = ferragens.length > 0
            ? [...ferragens, ...DB_FERRAGENS.filter(df => !ferragens.find(bf => bf.id === df.id))]
            : DB_FERRAGENS;
        return {
            chapas: chapas.length > 0 ? chapas : DB_CHAPAS,
            ferragens: mergedFerragens,
            acabamentos: acabamentos.length > 0 ? acabamentos : DB_ACABAMENTOS,
            fitas: fitas.length > 0 ? fitas : DB_FITAS,
            topChapas,
            topAcab,
            raw: bibItems,
        };
    }, [bibItems]);

    const chapasDB = bib?.chapas || DB_CHAPAS;
    const acabDB = bib?.acabamentos || DB_ACABAMENTOS;
    const ferragensDB = bib?.ferragens || DB_FERRAGENS;
    const fitasDB = bib?.fitas || DB_FITAS;

    // Fase 5: materiais com preço vencido
    const materiaisVencidos = useMemo(() => {
        return bibItems.filter(i => {
            if (i.tipo !== 'material' || !i.preco_atualizado_em) return false;
            const dias = Math.floor((Date.now() - new Date(i.preco_atualizado_em).getTime()) / 86400000);
            return dias > (i.preco_validade_dias || 90);
        });
    }, [bibItems]);

    const [padroes, setPadroes] = useState(editOrc?.padroes || { corredica: '', dobradica: '', articulador: '' });

    const [pagamento, setPagamento] = useState(() => {
        const pg = editOrc?.pagamento || { desconto: { tipo: '%', valor: 0 }, blocos: [] };
        // Ensure each bloco has an id for React keys and upBloco matching
        if (pg.blocos) pg.blocos = pg.blocos.map(b => b.id ? b : { ...b, id: uid() });
        return pg;
    });
    const [empresa, setEmpresa] = useState(null);
    const [prazoEntrega, setPrazoEntrega] = useState(editOrc?.prazo_entrega || '45 dias úteis');
    const [prazoExecucao, setPrazoExecucao] = useState(editOrc?.prazo_execucao || null);
    const [enderecoObra, setEnderecoObra] = useState(editOrc?.endereco_obra || '');
    // validade_proposta mantida para compatibilidade com orçamentos antigos
    const validadeProposta = `${validadeDias} dias`;
    const dataVenc = (() => {
        const d = new Date();
        d.setDate(d.getDate() + (Number(validadeDias) || 15));
        return d.toISOString().slice(0, 10);
    })();
    const [propostaModal, setPropostaModal] = useState(false);
    const [viewsData, setViewsData] = useState(null);
    const [showViews, setShowViews] = useState(false);
    const [assinaturas, setAssinaturas] = useState([]);
    const [viewMapId, setViewMapId] = useState(null);
    const [showAllViews, setShowAllViews] = useState(false);

    // ── Dados completos do orçamento (carregados da API) ─────────────────────
    const [orcFull, setOrcFull] = useState(null);

    // ── Trava de edição (orçamento aprovado) ──────────────────────────────────
    const _orc = orcFull || editOrc; // fonte mais completa para campos derivados
    const isLocked = _orc && LOCKED_COLS.includes(_orc.kb_col);
    const isAditivo = _orc?.tipo === 'aditivo';
    const [unlocked, setUnlocked] = useState(false);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [unlockText, setUnlockText] = useState('');
    const [showAditivoModal, setShowAditivoModal] = useState(false);
    const [motivoAditivo, setMotivoAditivo] = useState('');
    const [showAprovarModal, setShowAprovarModal] = useState(false);
    const [aprovandoOrc, setAprovandoOrc] = useState(false);
    const [projetoCriadoInfo, setProjetoCriadoInfo] = useState(null);
    // ── Versionamento ──────────────────────────────────────────────────────────
    const [versoes, setVersoes] = useState([]);
    const [showVersaoModal, setShowVersaoModal] = useState(false);
    const [motivoVersao, setMotivoVersao] = useState('');
    const [criandoVersao, setCriandoVersao] = useState(false);
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [diffData, setDiffData] = useState(null);
    const [diffV1Id, setDiffV1Id] = useState(null);
    const [diffV2Id, setDiffV2Id] = useState(null);
    const [loadingDiff, setLoadingDiff] = useState(false);
    const isSubstituida = _orc && _orc.versao_ativa === 0;
    const isVersao = _orc?.tipo === 'versao';
    const temVersoes = versoes.length > 1;
    const readOnly = (isLocked && !unlocked) || isSubstituida;

    // ── Cadastro rápido de cliente ───────────────────────────────────────────
    const [showQuickClient, setShowQuickClient] = useState(false);

    // ── Autosave ──────────────────────────────────────────────────────────────
    const [saveStatus, setSaveStatus] = useState('idle'); // idle | dirty | saving | saved | error
    const autosaveTimerRef = useRef(null);
    const lastSavedPayloadRef = useRef(null);
    const isMountedRef = useRef(true);


    // Colunas pré-aprovação onde o botão Aprovar fica visível
    const PRE_APPROVE_COLS = ['lead', 'orc', 'env', 'neg'];

    // Carregar dados completos do orçamento (aditivos, parent_info, versões, etc.)
    useEffect(() => {
        if (editOrc?.id) {
            api.get(`/orcamentos/${editOrc.id}`).then(data => {
                setOrcFull(data);
                if (data.versoes && data.versoes.length > 1) setVersoes(data.versoes);
            }).catch(e => notify(e.error || 'Erro ao carregar orçamento'));
            api.get(`/portal/views/${editOrc.id}`).then(setViewsData).catch(() => { /* views opcional */ });
            api.get(`/assinaturas/documento/${editOrc.id}`).then(setAssinaturas).catch(() => {});
        }
    }, [editOrc?.id]);

    // ── Restaurar form após F5 (editOrc só tem {id}, dados vêm da API) ────
    useEffect(() => {
        if (!orcFull) return;
        // Se editOrc já tinha os dados completos (navegação normal), não sobrescrever
        if (editOrc?.ambientes && editOrc.ambientes.length > 0) return;
        // Populate form states from API data
        if (orcFull.cliente_id) sc(orcFull.cliente_id);
        if (orcFull.projeto != null) setProjeto(orcFull.projeto);
        if (orcFull.numero != null) setNumero(orcFull.numero);
        if (orcFull.ambientes) setAmbientes(orcFull.ambientes);
        if (orcFull.obs != null) so(orcFull.obs);
        if (orcFull.padroes) setPadroes(orcFull.padroes);
        if (orcFull.pagamento) {
            const pg = { ...orcFull.pagamento };
            if (pg.blocos) pg.blocos = pg.blocos.map(b => b.id ? b : { ...b, id: uid() });
            setPagamento(pg);
        }
        if (orcFull.taxas) setLocalTaxas(prev => ({ ...prev, ...orcFull.taxas }));
        if (orcFull.prazo_entrega != null) setPrazoEntrega(orcFull.prazo_entrega);
        if (orcFull.prazo_execucao != null) setPrazoExecucao(orcFull.prazo_execucao);
        if (orcFull.endereco_obra != null) setEnderecoObra(orcFull.endereco_obra);
        if (orcFull.validade_dias) setValidadeDias(orcFull.validade_dias);
    }, [orcFull]); // eslint-disable-line react-hooks/exhaustive-deps

    const addBloco = () => setPagamento(p => ({
        ...p,
        blocos: [...p.blocos, { id: uid(), descricao: '', percentual: 0, meio: 'pix', parcelas: 1 }],
    }));
    const removeBloco = (id) => setPagamento(p => ({ ...p, blocos: p.blocos.filter(b => b.id !== id) }));
    const upBloco = (id, field, val) => setPagamento(p => ({
        ...p,
        blocos: p.blocos.map(b => b.id === id ? { ...b, [field]: val } : b),
    }));

    const [localTaxas, setLocalTaxas] = useState(() => {
        const defaults = {
            imp: globalTaxas.imp ?? 0, com: globalTaxas.com ?? 0, mont: globalTaxas.mont ?? 0,
            lucro: globalTaxas.lucro ?? 0, frete: globalTaxas.frete ?? 0,
            inst: globalTaxas.inst ?? 5,
            mk_chapas: globalTaxas.mk_chapas ?? 1.45,
            mk_ferragens: globalTaxas.mk_ferragens ?? 1.15,
            mk_fita: globalTaxas.mk_fita ?? 1.45,
            mk_acabamentos: globalTaxas.mk_acabamentos ?? 1.30,
            mk_acessorios: globalTaxas.mk_acessorios ?? 1.20,
            mk_mdo: globalTaxas.mk_mdo ?? 0.80,
            // Custo-hora + consumíveis (sempre herda do config global)
            custo_hora_ativo: globalTaxas.custo_hora_ativo ?? 0,
            func_producao: globalTaxas.func_producao ?? 10,
            horas_dia: globalTaxas.horas_dia ?? 8.5,
            dias_uteis: globalTaxas.dias_uteis ?? 22,
            eficiencia: globalTaxas.eficiencia ?? 75,
            tempo_furacao: globalTaxas.tempo_furacao ?? 0.017,
            tempo_montagem: globalTaxas.tempo_montagem ?? 0.25,
            tempo_montagem_porta: globalTaxas.tempo_montagem_porta ?? 0.15,
            tempo_montagem_gaveta: globalTaxas.tempo_montagem_gaveta ?? 0.25,
            tempo_montagem_prat: globalTaxas.tempo_montagem_prat ?? 0.05,
            tempo_acabamento: globalTaxas.tempo_acabamento ?? 0.17,
            tempo_embalagem: globalTaxas.tempo_embalagem ?? 0.25,
            tempo_instalacao: globalTaxas.tempo_instalacao ?? 0.75,
            // v3: velocidades e overheads baseados em dimensões reais
            cnc_velocidade: globalTaxas.cnc_velocidade ?? 5000,
            cnc_overhead_peca: globalTaxas.cnc_overhead_peca ?? 20,
            cnc_overhead_chapa: globalTaxas.cnc_overhead_chapa ?? 300,
            fita_velocidade: globalTaxas.fita_velocidade ?? 500,
            fita_overhead_borda: globalTaxas.fita_overhead_borda ?? 90,
            centro_custo_json: globalTaxas.centro_custo_json || '[]',
            consumiveis_ativo: globalTaxas.consumiveis_ativo ?? 0,
            cons_cola_m2: globalTaxas.cons_cola_m2 ?? 2.50,
            cons_minifix_un: globalTaxas.cons_minifix_un ?? 1.80,
            cons_parafuso_un: globalTaxas.cons_parafuso_un ?? 0.35,
            cons_lixa_m2: globalTaxas.cons_lixa_m2 ?? 1.20,
            cons_embalagem_mod: globalTaxas.cons_embalagem_mod ?? 15.00,
        };
        return editOrc?.taxas ? { ...defaults, ...editOrc.taxas } : defaults;
    });
    const taxas = localTaxas;
    const setTaxa = (k, v) => setLocalTaxas(p => ({ ...p, [k]: parseFloat(v) || 0 }));

    // ── CRUD ─────────────────────────────────────────────────────────────────
    const upAmb = (ambId, fn) => setAmbientes(prev => prev.map(a => {
        if (a.id !== ambId) return a;
        const c = JSON.parse(JSON.stringify(a)); fn(c); return c;
    }));

    // ── Importar JSON da IA ──────────────────────────────────────────────────
    const importarJsonIA = async () => {
        if (!importJson.trim()) { notify('Cole o JSON gerado pela IA'); return; }
        setImportLoading(true); setImportResult(null);
        try {
            let parsed;
            try { parsed = JSON.parse(importJson); } catch { notify('JSON inválido', 'error'); setImportLoading(false); return; }
            // Aceitar { ambientes: [...] } ou diretamente [...]
            const payload = Array.isArray(parsed) ? { ambientes: parsed } : parsed;
            const resp = await api.post('/orcamentos/importar', payload);
            if (resp.ok && resp.ambientes) {
                setAmbientes(prev => [...prev, ...resp.ambientes]);
                setImportResult(resp);
                setImportJson('');
                notify(`Importado: ${resp.stats.ambientes} ambiente(s), ${resp.stats.itens} item(s), ${resp.stats.componentes} componente(s)`);
                setTimeout(() => { setShowImportModal(false); setImportResult(null); }, 2000);
            }
        } catch (e) { notify(e.error || 'Erro ao importar', 'error'); }
        setImportLoading(false);
    };

    const addAmbiente = async () => {
        if (!empresa) {
            try { const emp = await api.get('/config/empresa'); setEmpresa(emp); } catch { }
        }
        setShowTipoAmbModal(true);
    };
    const createAmbiente = (tipo) => {
        setShowTipoAmbModal(false);
        const base = { id: uid(), nome: `Ambiente ${ambientes.length + 1}`, tipo: tipo || 'calculadora' };
        if (tipo === 'manual') {
            base.linhas = [{ id: uid(), tipo: 'bloco', titulo: '', descricao: '', marcador: 'bullet', valor: 0 }];
            base.itens = []; base.paineis = []; base.itensEspeciais = [];
        } else {
            base.itens = []; base.paineis = []; base.itensEspeciais = [];
        }
        setAmbientes([...ambientes, base]);
        setExpandedAmb(base.id);
        // Auto-scroll para o novo ambiente
        setTimeout(() => {
            const el = document.getElementById(`amb-${base.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
    };
    const removeAmb = id => {
        const amb = ambientes.find(a => a.id === id);
        const nItens = (amb?.itens?.length || 0) + (amb?.paineis?.length || 0) + (amb?.itensEspeciais?.length || 0);
        if (nItens > 0) {
            setNovoConfirm({ msg: `Remover "${amb?.nome || 'Ambiente'}" com ${nItens} item(ns)?`, onOk: () => setAmbientes(p => p.filter(a => a.id !== id)) });
            return;
        }
        setAmbientes(p => p.filter(a => a.id !== id));
    };

    // ── Fase 5: Duplicar ambiente (deep clone com novos IDs) ──
    const duplicarAmbiente = (ambId) => {
        const orig = ambientes.find(a => a.id === ambId);
        if (!orig) return;
        const clone = JSON.parse(JSON.stringify(orig));
        clone.id = uid();
        clone.nome = `${orig.nome} (cópia)`;
        // Regenerar IDs de todos os objetos aninhados
        if (clone.itens) {
            for (const item of clone.itens) {
                item.id = uid();
                if (item.componentes) {
                    for (const comp of item.componentes) { comp.id = uid(); }
                }
            }
        }
        if (clone.paineis) { for (const p of clone.paineis) { p.id = uid(); } }
        if (clone.itensEspeciais) { for (const ie of clone.itensEspeciais) { ie.id = uid(); } }
        if (clone.linhas) { for (const l of clone.linhas) { l.id = uid(); } }
        // Inserir logo após o original
        const idx = ambientes.findIndex(a => a.id === ambId);
        const newAmbs = [...ambientes];
        newAmbs.splice(idx + 1, 0, clone);
        setAmbientes(newAmbs);
        setExpandedAmb(clone.id);
        notify('Ambiente duplicado');
        // Auto-scroll para o ambiente duplicado
        setTimeout(() => {
            const el = document.getElementById(`amb-${clone.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
    };

    // ── Reordenar ambientes ──
    const moveAmbUp = (ambId) => setAmbientes(prev => {
        const idx = prev.findIndex(a => a.id === ambId);
        if (idx <= 0) return prev;
        const n = [...prev];
        [n[idx], n[idx - 1]] = [n[idx - 1], n[idx]];
        return n;
    });
    const moveAmbDown = (ambId) => setAmbientes(prev => {
        const idx = prev.findIndex(a => a.id === ambId);
        if (idx < 0 || idx >= prev.length - 1) return prev;
        const n = [...prev];
        [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
        return n;
    });

    // ── Fase 6: Salvar ambiente como template ──
    const salvarComoTemplate = async (ambId) => {
        if (!templateNome.trim()) { notify('Nome obrigatório'); return; }
        const amb = ambientes.find(a => a.id === ambId);
        if (!amb) return;
        const clean = JSON.parse(JSON.stringify(amb));
        delete clean.id; // Remove ID específico
        try {
            await api.post('/orcamentos/templates', {
                nome: templateNome.trim(),
                descricao: `Baseado em: ${amb.nome}`,
                categoria: templateCategoria || amb.nome,
                json_data: clean,
            });
            setShowSaveTemplateModal(null);
            setTemplateNome('');
            setTemplateCategoria('');
            const tpls = await api.get('/orcamentos/templates');
            setAmbTemplates(tpls);
            notify('Template salvo!');
        } catch (ex) { notify(ex.error || 'Erro ao salvar template'); }
    };

    // ── Fase 6: Criar ambiente a partir de template ──
    // Chama /aplicar pra incrementar uso_count (analytics — templates populares
    // sobem na ordenação). Fire-and-forget, não bloqueia UX.
    const createFromTemplate = (tpl) => {
        setShowTipoAmbModal(false);
        api.post(`/orcamentos/templates/${tpl.id}/aplicar`).catch(() => {});
        const data = typeof tpl.json_data === 'string' ? JSON.parse(tpl.json_data) : tpl.json_data;
        const base = { ...data, id: uid(), nome: tpl.nome };
        // Regenerar IDs
        if (base.itens) { for (const item of base.itens) { item.id = uid(); if (item.componentes) { for (const c of item.componentes) { c.id = uid(); } } } }
        if (base.paineis) { for (const p of base.paineis) { p.id = uid(); } }
        if (base.itensEspeciais) { for (const ie of base.itensEspeciais) { ie.id = uid(); } }
        if (base.linhas) { for (const l of base.linhas) { l.id = uid(); } }
        setAmbientes([...ambientes, base]);
        setExpandedAmb(base.id);
    };

    // ── Helper: próxima ordem livre (unifica grupos soltos + itens soltos) ───
    const nextOrdem = (a) => {
        const all = [
            ...(a.grupos || []).map(g => g.ordem ?? 0),
            ...a.itens.filter(i => !i.grupo_id).map(i => i.ordem ?? 0),
        ];
        return all.length > 0 ? Math.max(...all) + 1 : 0;
    };

    const addItemToAmb = (ambId, caixaId) => {
        const caixaDef = caixas.find(c => c.db_id === caixaId);
        if (!caixaDef) return;
        let newId;
        upAmb(ambId, a => {
            if (!a.grupos) a.grupos = [];
            newId = uid();
            a.itens.push({
                id: newId,
                caixaId: caixaDef.db_id,
                caixaDef: JSON.parse(JSON.stringify(caixaDef)),
                nome: caixaDef.nome,
                dims: {
                    l: 600,
                    a: (caixaDef.dimsAplicaveis || ['L','A','P']).includes('A') ? (caixaDef.cat === 'especial' ? 2400 : 2200) : 0,
                    p: (caixaDef.dimsAplicaveis || ['L','A','P']).includes('P') ? 550 : 0,
                },
                qtd: 1,
                mats: { matInt: 'mdf18', matExt: '' },
                componentes: [],
                grupo_id: '',
                ordem: nextOrdem(a),
            });
        });
        if (newId) setExpandedItem(newId);
    };

    const swapItemCaixa = (ambId, itemId, newCaixaId) => {
        const novaCaixaDef = caixas.find(c => c.db_id === newCaixaId);
        if (!novaCaixaDef) return;
        upItem(ambId, itemId, it => {
            it.caixaId = novaCaixaDef.db_id;
            it.caixaDef = JSON.parse(JSON.stringify(novaCaixaDef));
            it.nome = novaCaixaDef.nome;
            it.componentes = [];
        });
    };

    const removeItem = (ambId, itemId) => upAmb(ambId, a => { a.itens = a.itens.filter(i => i.id !== itemId); });
    const copyItem = (ambId, itemId) => upAmb(ambId, a => {
        const src = a.itens.find(i => i.id === itemId);
        if (!src) return;
        const c = JSON.parse(JSON.stringify(src));
        c.id = uid();
        if (c.ripado) c.ripado = { ...c.ripado, id: uid() };
        a.itens.push(c);
    });

    const addItemAvulso = (ambId) => upAmb(ambId, a => {
        if (!a.grupos) a.grupos = [];
        a.itens.push({ id: uid(), tipo: 'avulso', nome: '', valor: 0, qtd: 1, desc: '', grupo_id: '', ordem: nextOrdem(a) });
    });

    // ── Grupos (Pai/Filhos) ──
    const addGrupo = (ambId) => upAmb(ambId, a => {
        if (!a.grupos) a.grupos = [];
        a.grupos.push({ id: uid(), nome: '', ordem: nextOrdem(a) });
    });

    // ── Reordenação unificada (grupos + itens soltos na mesma lista) ──────────
    const reorderElement = (ambId, elType, elId, dir) => upAmb(ambId, a => {
        const list = [
            ...(a.grupos || []).map((g, i) => ({ type: 'grupo', id: g.id, ordem: g.ordem ?? i })),
            ...a.itens.filter(i => !i.grupo_id).map((i, idx) => ({ type: 'item', id: i.id, ordem: i.ordem ?? (1000 + idx) })),
        ].sort((x, y) => x.ordem - y.ordem);

        const idx = list.findIndex(e => e.type === elType && e.id === elId);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= list.length) return;

        const aOrd = list[idx].ordem;
        const bOrd = list[swapIdx].ordem;
        const apply = (type, id, ord) => {
            if (type === 'grupo') { const g = (a.grupos||[]).find(g=>g.id===id); if(g) g.ordem=ord; }
            else { const it = a.itens.find(i=>i.id===id); if(it) it.ordem=ord; }
        };
        apply(list[idx].type, list[idx].id, bOrd === aOrd ? bOrd - (dir==='up'?1:-1) : bOrd);
        apply(list[swapIdx].type, list[swapIdx].id, aOrd === bOrd ? aOrd + (dir==='up'?1:-1) : aOrd);
    });
    const removeGrupo = (ambId, grupoId) => upAmb(ambId, a => {
        a.grupos = (a.grupos || []).filter(g => g.id !== grupoId);
        a.itens.forEach(it => { if (it.grupo_id === grupoId) it.grupo_id = ''; });
    });
    const renameGrupo = (ambId, grupoId, nome) => upAmb(ambId, a => {
        const g = (a.grupos || []).find(g => g.id === grupoId);
        if (g) g.nome = nome;
    });
    const moveToGrupo = (ambId, itemId, grupoId) => upItem(ambId, itemId, it => { it.grupo_id = grupoId || ''; });
    const duplicateGrupo = (ambId, grupoId) => upAmb(ambId, a => {
        const g = (a.grupos || []).find(g => g.id === grupoId);
        if (!g) return;
        const newGrupoId = uid();
        a.grupos.push({ id: newGrupoId, nome: (g.nome || 'Grupo') + ' (cópia)' });
        // Duplicar todos os filhos do grupo
        const filhos = a.itens.filter(it => it.grupo_id === grupoId);
        for (const fi of filhos) {
            const clone = JSON.parse(JSON.stringify(fi));
            clone.id = uid();
            clone.grupo_id = newGrupoId;
            // IDs únicos para componentes
            if (clone.componentes) clone.componentes.forEach(c => c.id = uid());
            a.itens.push(clone);
        }
    });

    // ── Drag & Drop handlers para grupos ──
    const handleDragStart = (e, ambId, itemId, isEspecial = false) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ ambId, itemId, isEspecial }));
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    };
    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDragOverGrupo(null);
    };
    const handleGrupoDragOver = (e, grupoId) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverGrupo(grupoId);
    };
    const handleGrupoDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOverGrupo(null);
    };
    const moveEspecialToGrupo = (ambId, itemId, grupoId) => upAmb(ambId, a => {
        const ie = (a.itensEspeciais || []).find(i => i.id === itemId);
        if (ie) ie.grupo_id = grupoId || '';
    });
    const handleGrupoDrop = (e, ambId, grupoId) => {
        e.preventDefault();
        setDragOverGrupo(null);
        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (data.ambId !== ambId) return;
            if (data.isEspecial) moveEspecialToGrupo(ambId, data.itemId, grupoId);
            else if (data.itemId) moveToGrupo(ambId, data.itemId, grupoId);
        } catch (_) { }
    };

    const upItem = (ambId, itemId, fn) => upAmb(ambId, a => {
        const i = a.itens.find(x => x.id === itemId);
        if (i) fn(i);
    });

    const addComp = (ambId, itemId, compDef) => {
        upItem(ambId, itemId, item => {
            const vars = {};
            // Apenas armazena defaults não-zero (default=0 = derivado da caixa, ex: Ap da Porta)
            (compDef.vars || []).forEach(v => { if (v.default) vars[v.id] = v.default; });
            const subItens = {};
            (compDef.sub_itens || []).forEach(s => { subItens[s.id] = s.defaultOn; });
            item.componentes.push({
                id: uid(),
                compId: compDef.db_id,
                compDef: JSON.parse(JSON.stringify(compDef)),
                qtd: 1,
                vars,
                matExtComp: '',
                subItens,
            });
        });
        setAddCompModal(null);
    };

    const removeComp = (ambId, itemId, compInstId) => upItem(ambId, itemId, item => {
        item.componentes = item.componentes.filter(c => c.id !== compInstId);
    });

    const upComp = (ambId, itemId, compInstId, newCi) => upItem(ambId, itemId, item => {
        const idx = item.componentes.findIndex(c => c.id === compInstId);
        if (idx >= 0) item.componentes[idx] = newCi;
    });

    // ── Painéis Ripados CRUD ─────────────────────────────────────────────────
    const addPainel = (ambId) => upAmb(ambId, a => {
        if (!a.paineis) a.paineis = [];
        a.paineis.push({
            id: uid(), nome: '', tipo: 'ripado',
            L: 2400, A: 2200, qtd: 1,
            wV: 40, eV: 18, sV: 15,
            wH: 40, eH: 18, sH: 15,
            mesmasRipas: true, temSubstrato: true,
            matRipaV: '', matRipaH: '', matSubstrato: '',
            coefDificuldade: 1.3,
        });
    });
    const removePainel = (ambId, pid) => upAmb(ambId, a => { a.paineis = (a.paineis || []).filter(p => p.id !== pid); });
    const upPainel = (ambId, pid, newP) => upAmb(ambId, a => {
        const idx = (a.paineis || []).findIndex(p => p.id === pid);
        if (idx >= 0) a.paineis[idx] = newP;
    });

    // ── Ripado dentro de módulo CRUD ──────────────────────────────────────────
    const addRipadoToItem = (ambId, itemId) => upItem(ambId, itemId, item => {
        item.ripado = {
            id: uid(), tipo: 'ripado',
            wV: 40, eV: 18, sV: 15,
            wH: 40, eH: 18, sH: 15,
            mesmasRipas: true, temSubstrato: false,
            matRipaV: '', matRipaH: '', matSubstrato: '',
            coefDificuldade: 1.3,
        };
    });
    const removeRipadoFromItem = (ambId, itemId) => upItem(ambId, itemId, item => { item.ripado = null; });
    const upRipadoOnItem = (ambId, itemId, patch) => upItem(ambId, itemId, item => {
        if (item.ripado) item.ripado = { ...item.ripado, ...patch };
    });

    // ── Itens Especiais CRUD ────────────────────────────────────────────────
    const addItemEspecial = (ambId, tipo, grupoId = '') => upAmb(ambId, a => {
        if (!a.itensEspeciais) a.itensEspeciais = [];
        const tipoInfo = TIPOS_ESPECIAIS.find(t => t.id === tipo) || TIPOS_ESPECIAIS[4];
        a.itensEspeciais.push({
            id: uid(), tipo, nome: '', L: 0, A: 0, qtd: 1,
            precoUnit: 0, unidade: tipoInfo.unidade, materialId: '',
            perfis: [], vidro: null, custoInstalacao: 0, obs: '', grupo_id: grupoId,
        });
    });
    const removeItemEspecial = (ambId, itemId) => upAmb(ambId, a => {
        a.itensEspeciais = (a.itensEspeciais || []).filter(i => i.id !== itemId);
    });
    const upItemEspecial = (ambId, itemId, newItem) => upAmb(ambId, a => {
        const idx = (a.itensEspeciais || []).findIndex(i => i.id === itemId);
        if (idx >= 0) a.itensEspeciais[idx] = newItem;
    });

    const copyItemEspecial = (ambId, itemId) => upAmb(ambId, a => {
        const src = (a.itensEspeciais || []).find(i => i.id === itemId);
        if (!src) return;
        const c = JSON.parse(JSON.stringify(src));
        c.id = uid();
        c.nome = src.nome ? `${src.nome} (cópia)` : '';
        const idx = a.itensEspeciais.findIndex(i => i.id === itemId);
        a.itensEspeciais.splice(idx + 1, 0, c);
    });

    // ── Totais ───────────────────────────────────────────────────────────────
    const tot = useMemo(() => {
        let cm = 0, at = 0, ft = 0, manualTotal = 0;
        // ── Engine v2: custos separados por categoria ──
        let totChapas = 0, totFita = 0, totFerragens = 0, totAcabamentos = 0, totAcessorios = 0;
        const ca = {}, fa = {}, ambTotals = [];
        const itemCostList = []; // { ambId, custoItem, coef, ajuste }
        ambientes.forEach(amb => {
            let ambCm = 0;
            // ── Ambiente Manual: valor = preco de venda direto (sem markup) ──
            if (amb.tipo === 'manual') {
                (amb.linhas || []).forEach(ln => {
                    if (ln.tipo === 'bloco') {
                        ambCm += Number(ln.valor) || 0;
                    } else {
                        // compatibilidade com linhas antigas (descricao/qtd/valorUnit)
                        ambCm += (ln.qtd || 0) * (ln.valorUnit || 0);
                    }
                });
                manualTotal += ambCm;
                ambTotals.push({ id: amb.id, custo: ambCm, manual: true });
                return;
            }
            let ambCP = 0;
            let ambAvulso = 0;
            amb.itens.forEach(item => {
                // Item avulso: valor = PV direto, bypass engine
                if (item.tipo === 'avulso') {
                    const avValor = (Number(item.valor) || 0) * (item.qtd || 1);
                    manualTotal += avValor;
                    ambCm += avValor;
                    ambAvulso += avValor;
                    return;
                }
                try {
                    const res = calcItemV2(item.caixaDef, item.dims, resolveItemMats(item, amb), item.componentes.map(ci => ({
                        compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                        matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                        dimL: ci.dimL || 0, dimA: ci.dimA || 0, dimP: ci.dimP || 0,
                        matIntInst: ci.matIntInst || '', matExtInst: ci.matExtInst || '',
                    })), bib, padroes);
                    const coef = item.caixaDef?.coef || 0;
                    const qtd = item.qtd || 1;
                    // Custos brutos (sem coef)
                    const cChapas = (res.custoChapas || 0) * qtd;
                    const cFita = (res.custoFita || 0) * qtd;
                    const cFerr = (res.custoFerragens || 0) * qtd;
                    const cAcab = (res.custoAcabamentos || 0) * qtd;
                    const itemCusto = cChapas + cFita + cFerr + cAcab;
                    cm += itemCusto; ambCm += itemCusto;
                    // Acumular custos COM coef individual por categoria (para precoVendaV2)
                    totChapas += cChapas * (1 + coef);
                    totFita += cFita * (1 + coef);
                    totAcabamentos += cAcab * (1 + coef);
                    totFerragens += cFerr; // ferragens sem coef
                    at += res.area * qtd;
                    ft += res.fita * qtd;
                    // CP individual com markups (consistente com precoVendaV2)
                    const mk = { chapas: taxas.mk_chapas ?? 1.45, fita: taxas.mk_fita ?? 1.45, acabamentos: taxas.mk_acabamentos ?? 1.30, ferragens: taxas.mk_ferragens ?? 1.15, mdo: taxas.mk_mdo ?? 0.80 };
                    const _ca = cChapas * (1 + coef);
                    const _fa = cFita * (1 + coef);
                    const _aa = cAcab * (1 + coef);
                    const itemCP = _ca * mk.chapas + _fa * mk.fita + _aa * mk.acabamentos + cFerr * mk.ferragens + _ca * mk.mdo;
                    ambCP += itemCP;
                    itemCostList.push({ itemId: item.id, ambId: amb.id, custoItem: itemCusto, itemCP, coef, ajuste: item.ajuste || null });
                    Object.entries(res.chapas).forEach(([id, c]) => {
                        if (!ca[id]) ca[id] = { mat: c.mat, area: 0, n: 0, frac: 0 };
                        ca[id].area += c.area * qtd;
                        const perda = c.mat.perda_pct != null ? c.mat.perda_pct : 15;
                        const areaUtil = ((c.mat.larg * c.mat.alt) / 1e6) * (1 - perda / 100);
                        ca[id].frac = areaUtil > 0 ? ca[id].area / areaUtil : 1;
                        ca[id].n = Math.ceil(ca[id].frac); // chapas inteiras reais
                    });
                    res.ferrList.forEach(f => {
                        if (!fa[f.id]) fa[f.id] = { ...f, qtd: 0 };
                        fa[f.id].qtd += f.qtd * qtd;
                    });
                } catch (_) { }
                // ── Ripado dentro do módulo ──
                if (item.ripado) {
                    try {
                        const ripCfg = { ...item.ripado, L: item.dims?.l || 0, A: item.dims?.a || 0 };
                        const ripRes = calcPainelRipado(ripCfg, bibItems);
                        if (ripRes) {
                            const rCoef = item.ripado.coefDificuldade ?? 1.3;
                            const rQtd = item.qtd || 1;
                            const ripCustoMat = ripRes.custoMaterial * rCoef * rQtd;
                            const ripChapas = (ripRes.custoChapas || 0) * rCoef * rQtd;
                            const ripFita = (ripRes.custoFita || 0) * rCoef * rQtd;
                            totChapas += ripChapas;
                            totFita += ripFita;
                            cm += ripCustoMat; ambCm += ripCustoMat;
                            const mkC = taxas.mk_chapas ?? 1.45;
                            const mkF = taxas.mk_fita ?? 1.45;
                            const mkMdo = taxas.mk_mdo ?? 0.80;
                            const ripCP = ripChapas * mkC + ripFita * mkF + ripCustoMat * mkMdo;
                            ambCP += ripCP;
                            // Atualizar entry existente do módulo ou criar nova
                            const existing = itemCostList.find(e => e.itemId === item.id && e.ambId === amb.id);
                            if (existing) {
                                existing.custoItem += ripCustoMat;
                                existing.itemCP += ripCP;
                            } else {
                                itemCostList.push({ itemId: item.id, ambId: amb.id, custoItem: ripCustoMat, itemCP: ripCP, coef: 0, ajuste: item.ajuste || null });
                            }
                        }
                    } catch (_) { }
                }
            });
            // ── Painéis ripados (custo vai pra chapas + fita, com coef dificuldade) ──
            (amb.paineis || []).forEach(painel => {
                try {
                    const res = calcPainelRipado(painel, bibItems);
                    if (res) {
                        const pCoef = painel.coefDificuldade ?? (painel.tipo === 'muxarabi' ? 1.5 : 1.3);
                        const qtdP = painel.qtd || 1;
                        const custoComCoef = res.custoMaterial * pCoef * qtdP;
                        const chapasCoef = (res.custoChapas || 0) * pCoef * qtdP;
                        const fitaCoef = (res.custoFita || 0) * pCoef * qtdP;
                        totChapas += chapasCoef;
                        totFita += fitaCoef;
                        cm += custoComCoef; ambCm += custoComCoef;
                        // CP: chapas × mk_chapas + fita × mk_fita + mdo
                        const mkC = taxas.mk_chapas ?? 1.45;
                        const mkF = taxas.mk_fita ?? 1.45;
                        const mkMdo = taxas.mk_mdo ?? 0.80;
                        const painelCP = chapasCoef * mkC + fitaCoef * mkF + custoComCoef * mkMdo;
                        ambCP += painelCP;
                        itemCostList.push({ itemId: painel.id, ambId: amb.id, custoItem: custoComCoef, itemCP: painelCP, coef: 0, ajuste: null });
                    }
                } catch (_) { }
            });
            // ── Itens Especiais (espelho, estofado, alumínio, vidro, outro) ──
            (amb.itensEspeciais || []).forEach(ie => {
                try {
                    const res = calcItemEspecial(ie, bibItems);
                    if (res.custo > 0) {
                        const mkEsp = taxas.mk_ferragens ?? 1.15;
                        cm += res.custo; ambCm += res.custo;
                        // Itens especiais = comprados prontos → categoria ferragens (sem coef dificuldade)
                        totFerragens += res.custo;
                        const ieCP = res.custo * mkEsp;
                        ambCP += ieCP;
                        itemCostList.push({ itemId: ie.id, ambId: amb.id, custoItem: res.custo, itemCP: ieCP, coef: 0, ajuste: null });
                    }
                } catch (_) { }
            });
            ambTotals.push({ id: amb.id, custo: ambCm, cp: ambCP, avulso: ambAvulso });
        });

        // ── Métricas acumuladas para custo-hora e consumíveis ──
        let totNPecas = 0, totNFerragens = 0, totNCaixas = 0, totNJuncoes = 0, totNModulos = 0;
        let totNPortas = 0, totNGavetas = 0, totNPrateleiras = 0;
        const pecasDetalhe = []; // { perimetro (mm), nBordas, fita (m), qtd }
        ambientes.forEach(amb => {
            if (amb.tipo === 'manual') return;
            (amb.itens || []).forEach(item => {
                if (item.tipo === 'avulso') return;
                const qtd = item.qtd || 1;
                try {
                    const res = calcItemV2(item.caixaDef, item.dims, resolveItemMats(item, amb), item.componentes.map(ci => ({
                        compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                        matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                        dimL: ci.dimL || 0, dimA: ci.dimA || 0, dimP: ci.dimP || 0,
                        matIntInst: ci.matIntInst || '', matExtInst: ci.matExtInst || '',
                    })), bib, padroes);
                    totNPecas += (res.nPecas || 0) * qtd;
                    totNFerragens += (res.nFerragens || 0) * qtd;
                    totNCaixas += (res.nCaixas || 0) * qtd;
                    totNJuncoes += (res.nJuncoes || 0) * qtd;
                    totNModulos += qtd;
                    // Coletar dimensões de cada peça para cálculo preciso CNC + fita
                    res.pecas.forEach(p => {
                        pecasDetalhe.push({ perimetro: p.perimetro || 0, nBordas: p.nBordas || 0, fita: p.fita || 0, qtd });
                    });
                    // Contar portas, gavetas, prateleiras por categoria de ferragem
                    res.ferrList.forEach(f => {
                        const cat = (f.categoria || '').toLowerCase();
                        if (cat.includes('dobradiça') || cat.includes('dobradica')) totNPortas += (f.qtd || 0) * qtd;
                        else if (cat.includes('corrediça') || cat.includes('corredica')) totNGavetas += (f.qtd || 0) * qtd;
                    });
                    (item.componentes || []).forEach(ci => {
                        const nome = (ci.compDef?.nome || '').toLowerCase();
                        if (nome.includes('prateleira') || nome.includes('shelf')) {
                            totNPrateleiras += (ci.qtd || 1) * qtd;
                        }
                    });
                    if (item.ripado) {
                        try {
                            const ripCfg = { ...item.ripado, L: item.dims?.l || 0, A: item.dims?.a || 0 };
                            const ripRes = calcPainelRipado(ripCfg, bibItems);
                            if (ripRes) {
                                totNPecas += (ripRes.nV || 0) + (ripRes.nH || 0) + (ripRes.temSubstrato ? 1 : 0);
                                totNModulos += 1;
                            }
                        } catch (_) {}
                    }
                } catch (_) { }
            });
            (amb.paineis || []).forEach(painel => {
                try {
                    const res = calcPainelRipado(painel, bibItems);
                    if (res) {
                        totNPecas += (res.nV || 0) + (res.nH || 0) + (res.temSubstrato ? 1 : 0);
                        totNModulos += (painel.qtd || 1);
                    }
                } catch (_) {}
            });
        });

        // ── Fase 1: Custo-hora real (se ativo) ──
        let custoHoraResult = null;
        if (taxas.custo_hora_ativo) {
            const coefMedio = totNModulos > 0
                ? ambientes.reduce((s, amb) => {
                    if (amb.tipo === 'manual') return s;
                    return s + (amb.itens || []).reduce((s2, it) => s2 + (it.caixaDef?.coef || 0) * (it.qtd || 1), 0);
                }, 0) / totNModulos
                : 0;
            custoHoraResult = calcCustoHora(
                {
                    pecasDetalhe,
                    nChapas: Object.values(ca).reduce((s, c) => s + (c.n || 0), 0),
                    nFerragens: totNFerragens, nCaixas: totNCaixas,
                    areaAcab: at * 0.6, nModulos: totNModulos,
                    nPortas: totNPortas, nGavetas: totNGavetas, nPrateleiras: totNPrateleiras,
                },
                taxas,
                coefMedio,
            );
        }

        // ── Fase 2: Consumíveis (se ativo) ──
        let consumiveisResult = null;
        let totConsumiveis = 0;
        if (taxas.consumiveis_ativo) {
            // areaColagem = ~10% da área total (juntas de colagem, não toda a superfície)
            // nPontosParafuso = ~2 por caixa (fundo, trilho) + 1 por ferragem pesada
            const areaColagem = at * 0.12;
            const nPontosParafuso = totNCaixas * 2 + Math.ceil(totNFerragens * 0.3);
            // areaAcab = faces externas (~60% da área total para acabamento/lixa)
            const areaAcab = at * 0.6;
            consumiveisResult = calcConsumiveis(
                { areaColagem, nJuncoes: totNJuncoes, nPontosParafuso, areaAcab, nModulos: totNModulos },
                taxas,
            );
            totConsumiveis = consumiveisResult.custoConsumiveis || 0;
        }

        // ── Engine v2: precoVendaV2 com markups por categoria ──
        // totChapas/totFita/totAcabamentos já incluem coef individual de cada item.
        // Passa coef=0 para precoVendaV2 (coef já embutido nos totais).
        const pvResult = precoVendaV2(
            { chapas: totChapas, fita: totFita, acabamentos: totAcabamentos, ferragens: totFerragens, acessorios: totAcessorios, consumiveis: totConsumiveis },
            0,
            taxas,
            custoHoraResult,
        );
        const pv = pvResult.valor;
        const cp = pvResult.cp || 0;
        const custoMdo = pvResult.mdo || 0;

        // Total CP individual (soma dos CPs por item) — usado para proporção de PV
        const totalItemCP = itemCostList.reduce((s, i) => s + (i.itemCP || 0), 0)
            + ambTotals.filter(a => a.manual).reduce((s, a) => s + a.custo, 0);

        // Calcular ajustes por módulo (proporcional ao CP do item)
        let totalAjustes = 0;
        itemCostList.forEach(({ itemCP, ajuste }) => {
            if (!ajuste || !ajuste.valor) return;
            const precoBase = totalItemCP > 0 ? (itemCP / totalItemCP) * pv : 0;
            const ajR = ajuste.tipo === 'R' ? ajuste.valor : precoBase * (ajuste.valor / 100);
            totalAjustes += ajR;
        });

        const pvFinal = pv + totalAjustes + manualTotal;

        // Economia de chapas: diferença entre arredondamento individual vs global
        const chapasInteiras = Object.values(ca).reduce((s, c) => s + c.n, 0);
        const chapasFrac = Object.values(ca).reduce((s, c) => s + (c.frac || 0), 0);
        const chapasEconomia = Object.values(ca).reduce((s, c) => s + (c.n - (c.frac || 0)) * c.mat.preco, 0);

        // cmCalculado = custo material apenas dos itens calculados (exclui avulso/manual)
        const cmCalculado = cm - manualTotal;

        return {
            cm, cmCalculado, at, ft, ca, fa, pv, cp,
            pvErro: pvResult.erro, pvMsg: pvResult.msg,
            custoMdo, totChapas, totFita, totFerragens, totAcabamentos, totAcessorios,
            ambTotals, totalAjustes, pvFinal, manualTotal, totalItemCP, itemCostList,
            breakdown: pvResult.breakdown,
            custoReal: pvResult.custoReal || 0,
            pisoMinimo: pvResult.pisoMinimo || 0,
            cb: cp, // compatibilidade
            chapasInteiras, chapasFrac, chapasEconomia,
            // Fase 3: estimativa de corte real
            corteReal: (() => {
                // Coletar peças individuais para FFD
                const allPecas = [];
                ambientes.forEach(amb => {
                    if (amb.tipo === 'manual') return;
                    (amb.itens || []).forEach(item => {
                        if (item.tipo === 'avulso') return;
                        try {
                            const res = calcItemV2(item.caixaDef, item.dims, resolveItemMats(item, amb), item.componentes.map(ci => ({
                                compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                                matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                                dimL: ci.dimL || 0, dimA: ci.dimA || 0, dimP: ci.dimP || 0,
                                matIntInst: ci.matIntInst || '', matExtInst: ci.matExtInst || '',
                            })), bib, padroes);
                            const qtd = item.qtd || 1;
                            for (let q = 0; q < qtd; q++) {
                                res.pecas.forEach(p => allPecas.push({ matId: p.matId, area: p.area }));
                            }
                        } catch (_) {}
                    });
                });
                return estimarCorteReal(ca, allPecas);
            })(),
            // Fase 1+2: métricas para exibição
            custoHoraResult, consumiveisResult, totConsumiveis,
            totNPecas, totNFerragens, totNCaixas, totNModulos, totNPortas, totNGavetas, totNPrateleiras,
        };
    }, [ambientes, taxas, bib]);

    // ── Sugestão automática de prazo de execução ────────────────────────────
    const sugestaoPrazo = useMemo(() => {
        let mods = 0, pains = 0;
        ambientes.forEach(amb => {
            if (amb.tipo === 'manual') return;
            (amb.itens || []).forEach(it => { if (it.tipo === 'avulso') return; mods += (it.qtd || 1); });
            (amb.paineis || []).forEach(() => { pains += 1; });
        });
        return Math.max(1, Math.ceil(mods * 0.5 + pains * 0.3));
    }, [ambientes]);
    const prazoExecEfetivo = prazoExecucao ?? sugestaoPrazo;

    // ── Desconto e totais de pagamento ───────────────────────────────────────
    const descontoR = (() => {
        const v = pagamento.desconto.valor || 0;
        if (!v) return 0;
        return pagamento.desconto.tipo === '%'
            ? tot.pvFinal * (v / 100)
            : Math.min(v, tot.pvFinal);
    })();
    const pvComDesconto = Math.max(0, tot.pvFinal - descontoR);
    const somaBlocos = pagamento.blocos.reduce((s, b) => s + (Number(b.percentual) || 0), 0);

    // ── Sync proposta HTML: regenera e envia para o portal a cada save ─────
    const syncPropostaHtml = useCallback(async () => {
        if (!editOrc?.id || !viewsData?.token) return;
        try {
            let emp = empresa;
            if (!emp) { emp = await api.get('/config/empresa'); setEmpresa(emp); }
            const cl = clis.find(c => c.id === parseInt(cid));
            const nivel = viewsData?.nivel || 'geral';
            const html = buildPropostaHtml({
                empresa: emp, cliente: cl,
                orcamento: { numero, projeto, obs },
                ambientes, tot, taxas: localTaxas, pagamento, pvComDesconto, bib, padroes,
                nivel, prazoEntrega, enderecoObra, validadeProposta,
            });
            await api.put('/portal/update-html', { orc_id: editOrc.id, html_proposta: html, nivel });
        } catch (_) { /* silencioso — sync é best-effort */ }
    }, [editOrc?.id, viewsData?.token, viewsData?.nivel, empresa, cid, clis, numero, projeto, obs, ambientes, tot, localTaxas, pagamento, pvComDesconto, bib, padroes, prazoEntrega, enderecoObra, validadeProposta]);

    // ── buildSavePayload: monta o objeto de dados para salvar ──
    const buildSavePayload = () => {
        const cl = clis.find(c => c.id === parseInt(cid));
        return {
            cliente_id: parseInt(cid) || null, cliente_nome: cl?.nome || '—',
            projeto, numero, data_vencimento: dataVenc || null,
            ambientes, obs, custo_material: tot.cm, valor_venda: pvComDesconto,
            status: 'rascunho', taxas: localTaxas, padroes, pagamento,
            prazo_entrega: prazoEntrega, prazo_execucao: prazoExecucao, endereco_obra: enderecoObra, validade_proposta: validadeProposta, validade_dias: validadeDias,
            ...(unlocked ? { force_unlock: true } : {}),
        };
    };

    // ── Autosave: inicializar baseline quando edita orçamento existente ──
    useEffect(() => {
        isMountedRef.current = true;
        if (editOrc?.id) {
            const timer = setTimeout(() => {
                lastSavedPayloadRef.current = JSON.stringify(buildSavePayload());
                setSaveStatus('saved');
            }, 800);
            return () => { clearTimeout(timer); isMountedRef.current = false; };
        }
        return () => { isMountedRef.current = false; };
    }, [editOrc?.id]);

    // ── Autosave: watch state changes → debounce 5s → save silencioso ──
    useEffect(() => {
        if (!editOrc?.id || readOnly) return;
        if (!lastSavedPayloadRef.current) return; // baseline não inicializado ainda

        const currentPayload = JSON.stringify(buildSavePayload());
        if (currentPayload === lastSavedPayloadRef.current) return;

        setSaveStatus('dirty');

        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

        autosaveTimerRef.current = setTimeout(async () => {
            if (!isMountedRef.current) return;
            const payload = buildSavePayload();
            const payloadStr = JSON.stringify(payload);
            if (payloadStr === lastSavedPayloadRef.current) return;

            setSaveStatus('saving');
            try {
                await api.put(`/orcamentos/${editOrc.id}`, payload);
                if (!isMountedRef.current) return;
                lastSavedPayloadRef.current = payloadStr;
                setSaveStatus('saved');
                // Sync proposta HTML no portal (async, best-effort)
                syncPropostaHtml();
            } catch {
                if (!isMountedRef.current) return;
                setSaveStatus('error');
            }
        }, 5000);

        return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
    }, [cid, projeto, numero, validadeDias, ambientes, obs, padroes, pagamento, localTaxas, prazoEntrega, prazoExecucao, enderecoObra, tot.cm, pvComDesconto, syncPropostaHtml]);

    // ── beforeunload: avisar se houver alterações não salvas ──
    useEffect(() => {
        const handler = (e) => {
            if (saveStatus === 'dirty' || saveStatus === 'saving') {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [saveStatus]);

    // D: Cmd+S / Ctrl+S para salvar
    const salvarRef = useRef(null);
    useEffect(() => { salvarRef.current = { salvar, readOnly }; });
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                if (!salvarRef.current?.readOnly) salvarRef.current?.salvar();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // C: Fechar dropdown "···" ao clicar fora
    useEffect(() => {
        if (!moreActionsOpen) return;
        const handler = (e) => { if (moreActionsRef.current && !moreActionsRef.current.contains(e.target)) setMoreActionsOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [moreActionsOpen]);

    const salvar = async () => {
        if (!cid) { notify('Selecione um cliente'); return; }
        if (ambientes.every(a => {
            if (a.tipo === 'manual') return (a.linhas || []).length === 0;
            return a.itens.length === 0 && (a.paineis || []).length === 0 && (a.itensEspeciais || []).length === 0;
        })) { notify('Adicione pelo menos um item'); return; }
        try {
            const data = buildSavePayload();
            if (editOrc?.id) await api.put(`/orcamentos/${editOrc.id}`, data);
            else await api.post('/orcamentos', data);
            if (unlocked) setUnlocked(false);
            lastSavedPayloadRef.current = JSON.stringify(data);
            setSaveStatus('saved');
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
            notify('Orçamento salvo!'); reload();
            // Sync proposta HTML no portal (async, best-effort)
            syncPropostaHtml();
        } catch (ex) { notify(ex.error || 'Erro ao salvar'); }
    };

    const [criandoAditivo, setCriandoAditivo] = useState(false);
    const criarAditivo = async (motivo) => {
        if (!editOrc?.id) return;
        if (criandoAditivo) return;
        setCriandoAditivo(true);
        try {
            const ad = await api.post('/orcamentos/aditivo', { parent_id: editOrc.id, motivo });
            notify(`Aditivo ${ad.numero} criado!`);
            setShowAditivoModal(false);
            setMotivoAditivo('');
            nav('novo', ad);
        } catch (ex) { notify(ex.error || 'Erro ao criar aditivo'); }
        finally { setCriandoAditivo(false); }
    };

    // ── Versionamento: criar nova versão ────────────────────────────────────
    const criarNovaVersao = async (motivo) => {
        if (!editOrc?.id || criandoVersao) return;
        setCriandoVersao(true);
        try {
            // Salvar estado atual antes de criar versão
            await salvar();
            const novaVersao = await api.post(`/orcamentos/${editOrc.id}/nova-versao`, { motivo });
            notify(`Revisão ${novaVersao.versao} criada!`);
            setShowVersaoModal(false);
            setMotivoVersao('');
            nav('novo', novaVersao);
        } catch (ex) { notify(ex.error || 'Erro ao criar versão'); }
        finally { setCriandoVersao(false); }
    };

    const ativarVersao = async () => {
        if (!editOrc?.id) return;
        try {
            await api.put(`/orcamentos/${editOrc.id}/ativar-versao`);
            notify('Versão ativada!');
            reload();
            // Recarregar esta versão
            const orc = await api.get(`/orcamentos/${editOrc.id}`);
            nav('novo', orc);
        } catch (ex) { notify(ex.error || 'Erro ao ativar versão'); }
    };

    const abrirComparacao = async (id1, id2) => {
        if (!id1 || !id2 || id1 === id2) return;
        setLoadingDiff(true);
        setShowDiffModal(true);
        try {
            const data = await api.get(`/orcamentos/${id1}/comparar/${id2}`);
            const diff = compareVersions(data.v1, data.v2);
            setDiffData({ diff, v1: data.v1, v2: data.v2 });
        } catch (ex) { notify(ex.error || 'Erro ao comparar'); setShowDiffModal(false); }
        finally { setLoadingDiff(false); }
    };

    // ── Aprovar orçamento ──────────────────────────────────────────────────
    const validarAprovacao = () => {
        try {
            const erros = [];
            if (!cid) erros.push('Cliente não selecionado');
            if (!ambientes || ambientes.length === 0 || ambientes.every(a => {
                if (a.tipo === 'manual') return (a.linhas || []).length === 0;
                return (a.itens || []).length === 0 && (a.paineis || []).length === 0 && (a.itensEspeciais || []).length === 0;
            })) erros.push('Nenhum item no orçamento');
            if (!pvComDesconto || pvComDesconto <= 0) erros.push('Valor do orçamento é zero');
            const blocos = pagamento?.blocos || [];
            if (blocos.length === 0) erros.push('Condições de pagamento não definidas');
            const somaBlocos = blocos.reduce((s, b) => s + (Number(b.percentual) || 0), 0);
            if (blocos.length > 0 && Math.abs(somaBlocos - 100) > 0.01) erros.push(`Parcelas somam ${N(somaBlocos, 0)}% (devem somar 100%)`);
            return erros;
        } catch (ex) {
            console.error('Erro em validarAprovacao:', ex);
            return ['Erro interno de validação — tente salvar e reabrir o orçamento'];
        }
    };

    const aprovarOrcamento = async () => {
        if (!editOrc?.id || aprovandoOrc) return;
        const erros = validarAprovacao();
        if (erros.length > 0) {
            setShowAprovarModal(false);
            notify('Corrija antes de aprovar: ' + erros.join('; '));
            return;
        }
        setAprovandoOrc(true);
        try {
            // Primeiro salva o orçamento para garantir dados atuais
            const cl = clis.find(c => c.id === parseInt(cid));
            const data = {
                cliente_id: parseInt(cid), cliente_nome: cl?.nome || '—',
                projeto, numero, data_vencimento: dataVenc || null,
                ambientes, obs, custo_material: tot.cm, valor_venda: pvComDesconto,
                status: 'rascunho', taxas: localTaxas, padroes, pagamento,
                prazo_entrega: prazoEntrega, prazo_execucao: prazoExecucao, endereco_obra: enderecoObra, validade_proposta: validadeProposta, validade_dias: validadeDias,
            };
            await api.put(`/orcamentos/${editOrc.id}`, data);
            // Agora move para aprovado
            const result = await api.put(`/orcamentos/${editOrc.id}/kanban`, { kb_col: 'ok' });
            setShowAprovarModal(false);
            if (result.projeto_criado) {
                setProjetoCriadoInfo({ projetoId: result.projeto_criado, numero: numero || editOrc.numero });
            } else {
                notify('Orçamento aprovado!');
                reload();
            }
        } catch (ex) {
            notify(ex.error || 'Erro ao aprovar');
        } finally { setAprovandoOrc(false); }
    };

    return (
        <div className={Z.pg}>
            {/* ── Banner aditivo (referência ao pai) ── */}
            {isAditivo && (orcFull?.parent_info || editOrc?.parent_info) && (
                <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.08))', border: '1px solid var(--primary-ring, rgba(19,121,240,0.2))' }}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--primary)' }}>
                            <FilePlus2 size={16} />
                            <span className="font-bold px-2 py-0.5 rounded" style={{ background: 'var(--primary-ring, rgba(19,121,240,0.15))' }}>ADITIVO</span>
                            <span style={{ color: 'var(--text-secondary)' }}>Ref. orçamento <strong>{(orcFull?.parent_info || editOrc?.parent_info)?.numero}</strong> — {(orcFull?.parent_info || editOrc?.parent_info)?.cliente_nome}</span>
                        </div>
                        <button onClick={() => { api.get(`/orcamentos/${editOrc.parent_orc_id}`).then(o => nav('novo', o)).catch(() => notify('Erro ao abrir original')); }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer flex-shrink-0" style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.08))', color: 'var(--primary)' }}>
                            Abrir Original
                        </button>
                    </div>
                    {(orcFull?.motivo_aditivo || editOrc?.motivo_aditivo) && (
                        <div className="mt-2 text-[11px] px-3 py-1.5 rounded-lg" style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.05))', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            <strong style={{ fontStyle: 'normal', color: 'var(--text-muted)' }}>Motivo:</strong> {orcFull?.motivo_aditivo || editOrc?.motivo_aditivo}
                        </div>
                    )}
                </div>
            )}

            {/* ── Banner de trava (orçamento aprovado) ── */}
            {isLocked && (
                <div className="mb-4 px-4 py-3 rounded-xl flex items-center justify-between gap-3" style={{ background: unlocked ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)', border: `1px solid ${unlocked ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.35)'}` }}>
                    <div className="flex items-center gap-2 text-xs">
                        {unlocked ? <Unlock size={16} style={{ color: 'var(--warning)' }} /> : <Lock size={16} style={{ color: 'var(--warning)' }} />}
                        <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                            {unlocked ? 'Desbloqueado temporariamente — salve para re-travar' : 'Orçamento aprovado — edição bloqueada'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {!unlocked && (
                            <button onClick={() => { setUnlockText(''); setShowUnlockModal(true); }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>
                                <Unlock size={12} className="inline mr-1" /> Desbloquear
                            </button>
                        )}
                        {!isAditivo && !unlocked && (
                            <button onClick={() => { setMotivoAditivo(''); setShowAditivoModal(true); }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.08))', color: 'var(--primary)' }}>
                                <FilePlus2 size={12} className="inline mr-1" /> Criar Aditivo
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Banner versão substituída ── */}
            {isSubstituida && (
                <div className="mb-4 px-4 py-3 rounded-xl flex items-center justify-between gap-3" style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.25)' }}>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <GitBranch size={16} />
                        <span className="font-bold">VERSÃO SUBSTITUÍDA — somente leitura</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={ativarVersao}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>
                            <Star size={12} className="inline mr-1" /> Tornar ativa
                        </button>
                        {versoes.length > 1 && (() => {
                            const ativa = versoes.find(v => v.versao_ativa === 1 || v.versao_ativa === true);
                            return ativa ? (
                                <button onClick={() => abrirComparacao(editOrc.id, ativa.id)}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                                    <ArrowUpDown size={12} className="inline mr-1" /> Comparar com ativa
                                </button>
                            ) : null;
                        })()}
                        {versoes.length > 1 && (() => {
                            const ativa = versoes.find(v => v.versao_ativa === 1 || v.versao_ativa === true);
                            return ativa ? (
                                <button onClick={() => { api.get(`/orcamentos/${ativa.id}`).then(o => nav('novo', o)).catch(() => notify('Erro')); }}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'rgba(100,116,139,0.12)', color: 'var(--text-muted)' }}>
                                    Abrir ativa <ArrowRight size={12} className="inline ml-1" />
                                </button>
                            ) : null;
                        })()}
                    </div>
                </div>
            )}

            {/* ── Tabs de versões ── */}
            {temVersoes && (
                <div className="mb-4 flex items-center gap-1.5 flex-wrap">
                    <GitBranch size={14} style={{ color: 'var(--text-muted)' }} className="mr-1" />
                    {versoes.map(v => {
                        const isCurrent = v.id === editOrc?.id;
                        const isAtiva = v.versao_ativa === 1 || v.versao_ativa === true;
                        return (
                            <button key={v.id}
                                onClick={() => { if (!isCurrent) api.get(`/orcamentos/${v.id}`).then(o => nav('novo', o)).catch(() => notify('Erro')); }}
                                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                                style={{
                                    background: isCurrent ? 'var(--primary)' : isAtiva ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.08)',
                                    color: isCurrent ? '#fff' : isAtiva ? 'var(--success)' : 'var(--text-muted)',
                                    border: `1px solid ${isCurrent ? 'var(--primary)' : isAtiva ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.15)'}`,
                                    opacity: isCurrent ? 1 : 0.85,
                                }}>
                                {v.versao === 1 ? 'v1' : `R${v.versao}`}
                                {isAtiva && !isCurrent && <Star size={10} className="inline ml-1" />}
                            </button>
                        );
                    })}
                    {!isSubstituida && !isLocked && !isAditivo && editOrc?.id && (
                        <button onClick={() => { setMotivoVersao(''); setShowVersaoModal(true); }}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer" style={{ background: 'rgba(139,92,246,0.08)', color: '#8b5cf6', border: '1px dashed rgba(139,92,246,0.3)' }}>
                            <Plus size={10} className="inline mr-0.5" /> Nova Versão
                        </button>
                    )}
                </div>
            )}

            <PageHeader icon={FileText} title={`${editOrc ? 'Editar' : 'Novo'} Orçamento`} subtitle="Ambientes → Caixas → Componentes">
                    {editOrc?.id && !isSubstituida && !isLocked && !isAditivo && !temVersoes && (
                        <button onClick={() => { setMotivoVersao(''); setShowVersaoModal(true); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                            style={{ background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.25)' }}>
                            <GitBranch size={14} /> Nova Versão
                        </button>
                    )}
                    {editOrc?.id && PRE_APPROVE_COLS.includes(editOrc.kb_col) && !isSubstituida && (
                        <button
                            onClick={() => setShowAprovarModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
                            style={{ background: 'var(--primary)', color: '#fff', boxShadow: '0 2px 8px var(--primary-ring, rgba(19,121,240,0.3))' }}
                        >
                            <CheckCircle size={16} /> Aprovar
                        </button>
                    )}
                    {!readOnly && (
                        <div className="flex items-center gap-2">
                            {editOrc?.id && saveStatus !== 'idle' && (
                                <span className="text-[11px] font-medium flex items-center gap-1 whitespace-nowrap" style={{
                                    color: saveStatus === 'saved' ? '#5B8C6B' : saveStatus === 'saving' ? '#C4924C' : saveStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)',
                                }}>
                                    {saveStatus === 'saved' && <><CheckCircle size={12} /> Salvo</>}
                                    {saveStatus === 'saving' && <><RefreshCw size={12} className="animate-spin" /> Salvando...</>}
                                    {saveStatus === 'dirty' && <><Clock size={12} /> Não salvo</>}
                                    {saveStatus === 'error' && <><AlertTriangle size={12} /> Erro</>}
                                </span>
                            )}
                            <button onClick={salvar} className={Z.btn}>Salvar</button>
                        </div>
                    )}
                    <button onClick={() => nav('orcs')} className={Z.btn2}>← Voltar</button>
            </PageHeader>

            {/* ── Step progress bar ─────────────────────────────────────── */}
            {(() => {
                const totalItens = ambientes.reduce((s, a) => s + (a.itens?.length || 0) + (a.paineis?.length || 0), 0);
                const somaBlocos = pagamento.blocos.reduce((s, b) => s + (Number(b.percentual) || 0), 0);
                const STEPS = [
                    { id: 'cliente',   label: 'Cliente',   done: !!cid },
                    { id: 'ambientes', label: 'Ambientes', done: ambientes.length > 0 },
                    { id: 'itens',     label: 'Itens',     done: totalItens > 0 },
                    { id: 'pagamento', label: 'Pagamento', done: pagamento.blocos.length > 0 && Math.abs(somaBlocos - 100) < 0.5 },
                    { id: 'proposta',  label: 'Proposta',  done: !!editOrc?.id, action: editOrc?.id ? () => setPropostaModal(true) : null },
                ];
                const firstPending = STEPS.findIndex(s => !s.done);
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16, padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', overflowX: 'auto' }}>
                        {STEPS.map((s, i) => {
                            const isCurrent = i === firstPending;
                            const color = s.done ? 'var(--success)' : isCurrent ? 'var(--primary)' : 'var(--text-muted)';
                            const bg = s.done ? 'var(--success-bg)' : isCurrent ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--bg-muted)';
                            const border = s.done ? 'var(--success-border, rgba(74,150,71,0.3))' : isCurrent ? 'color-mix(in srgb, var(--primary) 35%, transparent)' : 'var(--border)';
                            const isLast = i === STEPS.length - 1;
                            return (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    <button
                                        onClick={s.action || undefined}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '5px 10px', borderRadius: 8,
                                            background: isCurrent ? bg : 'none', border: 'none',
                                            cursor: s.action ? 'pointer' : 'default',
                                        }}>
                                        <div style={{
                                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                            background: bg, border: `1.5px solid ${border}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 9, fontWeight: 800, color,
                                        }}>
                                            {s.done ? '✓' : i + 1}
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: isCurrent ? 700 : 500, color, whiteSpace: 'nowrap' }}>{s.label}</span>
                                    </button>
                                    {!isLast && (
                                        <div style={{ width: 20, height: 1.5, background: i < firstPending || firstPending === -1 ? 'var(--success-border, rgba(74,150,71,0.4))' : 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
                                    )}
                                </div>
                            );
                        })}
                        {editOrc?.id && (
                            <div style={{ marginLeft: 'auto', paddingLeft: 8, flexShrink: 0 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{numero || editOrc.id}</span>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Fase 5: Alerta de materiais com preço vencido */}
            {materiaisVencidos.length > 0 && (
                <div className="mb-4 p-3 rounded-lg flex items-center gap-3 text-xs"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--warning)' }}>
                    <AlertTriangle size={16} className="shrink-0" />
                    <div>
                        <strong>{materiaisVencidos.length} material(is) com preço vencido:</strong>{' '}
                        {materiaisVencidos.slice(0, 3).map(m => m.nome).join(', ')}
                        {materiaisVencidos.length > 3 && ` e mais ${materiaisVencidos.length - 3}`}.
                        <span style={{ color: 'var(--text-muted)' }}> Atualize os preços na Biblioteca para orçamentos precisos.</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ── Coluna principal ── */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    {/* Dados do projeto */}
                    {(() => {
                        const clienteNome = clis.find(c => c.id === parseInt(cid))?.nome || '';
                        const dataVencFmt = dataVenc ? new Date(dataVenc + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
                        return (
                            <div className={`glass-card transition-all ${dadosExp ? 'p-3 sm:p-5' : 'py-2.5 px-3 sm:px-4'}`}>
                                {/* Barra clicável */}
                                <div className="flex items-center justify-between gap-3 cursor-pointer select-none"
                                    onClick={() => setDadosExp(p => !p)}>
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                        {dadosExp
                                            ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
                                            : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
                                        <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>Dados do Projeto</span>
                                        {/* chips resumo — só quando colapsado */}
                                        {!dadosExp && (<>
                                            {clienteNome
                                                ? <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0" style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>{clienteNome}</span>
                                                : <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>sem cliente</span>
                                            }
                                            {projeto && <span className="text-[11px] px-2 py-0.5 rounded-full truncate" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)', maxWidth: 160 }}>{projeto}</span>}
                                            {numero && <span className="text-[11px] px-2 py-0.5 rounded-full font-mono shrink-0" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>#{numero}</span>}
                                        </>)}
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        {!dadosExp && dataVencFmt && (
                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>até {dataVencFmt}</span>
                                        )}
                                        <span className="text-[10px] opacity-40 hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }}>{dadosExp ? 'fechar' : 'editar'}</span>
                                    </div>
                                </div>

                                {/* Conteúdo expandido */}
                                {dadosExp && (
                                    <div className="mt-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                            <div>
                                                <label className={Z.lbl}>Cliente *</label>
                                                <div className="flex gap-1">
                                                    <select value={cid} onChange={e => sc(e.target.value)} className={`${Z.inp} flex-1`} disabled={readOnly}>
                                                        <option value="">Selecione...</option>
                                                        {clis.map(c => <option key={c.id} value={c.id}>{c.nome}{c.arq ? ` (${c.arq})` : ''}</option>)}
                                                    </select>
                                                    {!readOnly && (
                                                        <button onClick={e => { e.stopPropagation(); setShowQuickClient(true); }}
                                                            className="shrink-0 px-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                                                            style={{ border: '1px solid var(--border)', color: 'var(--primary)' }}
                                                            title="Cadastrar novo cliente">
                                                            <Plus size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div><label className={Z.lbl}>Nome do Projeto</label><input value={projeto} onChange={e => setProjeto(e.target.value)} placeholder="Ex: Cozinha Planejada" className={Z.inp} disabled={readOnly} /></div>
                                            <div><label className={Z.lbl}>Nº da Proposta</label><input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Auto" className={Z.inp} disabled={readOnly} /></div>
                                            <div>
                                                <label className={Z.lbl}>Validade (dias)</label>
                                                <input type="number" value={validadeDias} onChange={e => setValidadeDias(Number(e.target.value) || 15)} min="1" className={Z.inp} disabled={readOnly} />
                                                <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Até {new Date(dataVenc + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                            </div>
                                        </div>
                                        {/* B: campos secundários — dimmed quando vazios */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                            <input value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)}
                                                placeholder="+ prazo de entrega"
                                                className={Z.inp} disabled={readOnly}
                                                style={prazoEntrega ? {} : { opacity: 0.4 }} />
                                            <input value={enderecoObra} onChange={e => setEnderecoObra(e.target.value)}
                                                placeholder="+ endereço da obra"
                                                className={Z.inp} disabled={readOnly}
                                                style={enderecoObra ? {} : { opacity: 0.4 }} />
                                            <input value={obs} onChange={e => so(e.target.value)}
                                                placeholder="+ observações gerais"
                                                className={Z.inp} disabled={readOnly}
                                                style={obs ? {} : { opacity: 0.4 }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Ambientes */}
                    <div className={Z.card}>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}><Layers size={14} /> Ambientes ({ambientes.length})</h2>
                            {!readOnly && (
                                <div className="flex items-center gap-2">
                                    <button onClick={addAmbiente} className={`${Z.btn} text-xs py-1.5 px-3`}><Plus size={13} /> Ambiente</button>
                                    {/* C: Dropdown ··· para ações secundárias */}
                                    <div className="relative" ref={moreActionsRef}>
                                        <button onClick={() => setMoreActionsOpen(p => !p)}
                                            className={`${Z.btn2} text-xs py-1.5 px-2.5`}
                                            title="Mais opções">
                                            <MoreHorizontal size={14} />
                                        </button>
                                        {moreActionsOpen && (
                                            <div className="absolute right-0 top-full mt-1 rounded-lg shadow-xl py-1 min-w-[180px] z-50"
                                                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                                {ambTemplates.length > 0 && (
                                                    <button onClick={() => { setShowTipoAmbModal(true); setMoreActionsOpen(false); }}
                                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[var(--bg-hover)] cursor-pointer"
                                                        style={{ color: 'var(--text-secondary)' }}>
                                                        <FilePlus2 size={13} /> Templates de ambiente
                                                    </button>
                                                )}
                                                <button onClick={() => { setShowImportModal(true); setImportResult(null); setMoreActionsOpen(false); }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[var(--bg-hover)] cursor-pointer"
                                                    style={{ color: '#8b5cf6' }}>
                                                    <Sparkles size={13} /> Importar JSON IA
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {ambientes.length === 0 ? (
                            <div className="flex flex-col items-center py-10" style={{ color: 'var(--text-muted)' }}>
                                <FolderOpen size={32} />
                                <span className="text-sm mt-2">{readOnly ? 'Nenhum ambiente' : 'Adicione um ambiente para começar'}</span>
                                {!readOnly && <button onClick={addAmbiente} className={`${Z.btn} text-xs mt-3`}><Plus size={13} /> Criar Ambiente</button>}
                            </div>
                        ) : ambientes.map((amb, ambIdx) => {
                            const isExpAmb = expandedAmb === amb.id;
                            const ambData = tot.ambTotals.find(a => a.id === amb.id) || {};
                            const ambAvulso = ambData.avulso || 0;
                            // Somar ajustes dos itens deste ambiente
                            const ambAjustes = (tot.itemCostList || []).filter(x => x.ambId === amb.id).reduce((s, { itemCP, ajuste }) => {
                                if (!ajuste || !ajuste.valor) return s;
                                const precoBase = tot.totalItemCP > 0 ? (itemCP / tot.totalItemCP) * tot.pv : 0;
                                return s + (ajuste.tipo === 'R' ? ajuste.valor : precoBase * (ajuste.valor / 100));
                            }, 0);
                            const ambPv = amb.tipo === 'manual' ? (ambData.custo || 0) : (tot.totalItemCP > 0 ? (ambData.cp || 0) / tot.totalItemCP * tot.pv + ambAjustes + ambAvulso : (ambData.custo || 0));

                            // ── Função de renderização reutilizável para item (avulso ou módulo) ──
                            const renderItemCard = (item, { inGroup = false } = {}) => {
                                const hasGrupos = (amb.grupos || []).length > 0;
                                const canDrag = !readOnly && hasGrupos;
                                // ── Item Avulso ──
                                if (item.tipo === 'avulso') {
                                    return (
                                        <div key={item.id} className="rounded-lg overflow-hidden mb-2"
                                            draggable={canDrag}
                                            onDragStart={e => handleDragStart(e, amb.id, item.id)}
                                            onDragEnd={handleDragEnd}
                                            style={{ border: '1.5px dashed var(--success-border)', background: 'rgba(16,185,129,0.03)', borderLeft: '3px solid var(--success)', cursor: canDrag ? 'grab' : 'default' }}>
                                            <div className="flex items-center gap-2 px-3 py-2">
                                                {canDrag && <GripVertical size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
                                                <Tag size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                <input type="text" placeholder="Nome do item avulso (ex: Bancada granito)"
                                                    value={item.nome} onChange={e => upItem(amb.id, item.id, it => it.nome = e.target.value)}
                                                    className="bg-transparent font-medium text-sm outline-none flex-1 min-w-0"
                                                    style={{ color: 'var(--text-primary)' }} readOnly={readOnly} />
                                                <input type="number" min="1" value={item.qtd || 1}
                                                    onChange={e => upItem(amb.id, item.id, it => it.qtd = Math.max(1, parseInt(e.target.value) || 1))}
                                                    className={Z.inp} style={{ width: 56, textAlign: 'center', fontSize: 13, padding: '4px 6px' }} readOnly={readOnly} />
                                                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>×</span>
                                                <div className="flex items-center gap-0.5">
                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>R$</span>
                                                    <input type="number" min="0" step="0.01"
                                                        value={item.valor || ''} placeholder="0,00"
                                                        onChange={e => upItem(amb.id, item.id, it => it.valor = parseFloat(e.target.value) || 0)}
                                                        className={Z.inp} style={{ width: 90, textAlign: 'right', fontSize: 12 }} readOnly={readOnly} />
                                                </div>
                                                <span className="font-bold text-xs whitespace-nowrap" style={{ color: 'var(--success)', minWidth: 70, textAlign: 'right' }}>
                                                    {R$((item.valor || 0) * (item.qtd || 1))}
                                                </span>
                                                {!readOnly && !inGroup && hasGrupos && (
                                                    <select value="" onChange={e => { if (e.target.value) moveToGrupo(amb.id, item.id, e.target.value); }}
                                                        className="text-[9px] bg-transparent outline-none cursor-pointer" style={{ color: 'var(--warning)', width: 20 }} title="Mover para grupo">
                                                        <option value="">+</option>
                                                        {(amb.grupos || []).map(g => <option key={g.id} value={g.id}>{g.nome || 'Grupo sem nome'}</option>)}
                                                    </select>
                                                )}
                                                {!readOnly && inGroup && (
                                                    <button onClick={() => moveToGrupo(amb.id, item.id, '')}
                                                        className="p-0.5 rounded hover:bg-[var(--bg-hover)]" title="Remover do grupo"
                                                        style={{ color: 'var(--text-muted)' }}><X size={10} /></button>
                                                )}
                                                {!readOnly && <button onClick={() => copyItem(amb.id, item.id)} className="p-1 rounded hover:bg-[var(--bg-hover)]" title="Duplicar item"><Copy size={12} /></button>}
                                                {!readOnly && <button onClick={() => removeItem(amb.id, item.id)} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400" title="Remover item"><Trash2 size={12} /></button>}
                                            </div>
                                            {!readOnly && (
                                                <div className="px-3 pb-2 pt-0">
                                                    <input type="text" placeholder="Descrição (opcional)"
                                                        value={item.desc || ''} onChange={e => upItem(amb.id, item.id, it => it.desc = e.target.value)}
                                                        className="bg-transparent text-[11px] outline-none w-full" style={{ color: 'var(--text-muted)' }} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                // ── Item calculado (módulo) ──
                                const isItemExp = expandedItem === item.id;
                                const coef = item.caixaDef?.coef || 0;
                                let res = null;
                                try {
                                    res = calcItemV2(item.caixaDef, item.dims, resolveItemMats(item, amb), item.componentes.map(ci => ({
                                        compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                                        matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                                        dimL: ci.dimL || 0, dimA: ci.dimA || 0, dimP: ci.dimP || 0,
                                        matIntInst: ci.matIntInst || '', matExtInst: ci.matExtInst || '',
                                    })), bib, padroes);
                                } catch (_) { }

                                const itemCPData = (tot.itemCostList || []).find(x => x.itemId === item.id);
                                const itemCP = itemCPData?.itemCP || 0;
                                const precoItem = tot.totalItemCP > 0 ? (itemCP / tot.totalItemCP) * tot.pv : (res?.custo || 0);
                                const aj = item.ajuste || { tipo: '%', valor: 0 };
                                const ajusteR = aj.valor ? (aj.tipo === 'R' ? aj.valor : precoItem * (aj.valor / 100)) : 0;
                                const precoItemFinal = precoItem + ajusteR;

                                return (
                                    <div key={item.id} className="group/item rounded-lg border overflow-hidden mb-2"
                                        draggable={canDrag}
                                        onDragStart={e => handleDragStart(e, amb.id, item.id)}
                                        onDragEnd={handleDragEnd}
                                        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', borderLeft: '3px solid var(--primary)', cursor: canDrag ? 'grab' : 'default' }}>
                                        {/* Header do item */}
                                        <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setExpandedItem(isItemExp ? null : item.id)}>
                                            <div className="flex items-center gap-2">
                                                {canDrag && <GripVertical size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />}
                                                {isItemExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                {(() => { const CatIc = getCatIcon(item.caixaDef?.cat); return <CatIc size={13} style={{ color: 'var(--primary)' }} />; })()}
                                                <div className="flex flex-col leading-tight">
                                                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                                        {item.desc || item.nome}
                                                    </span>
                                                    {item.desc && (
                                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.nome}</span>
                                                    )}
                                                </div>
                                                {(item.qtd || 1) > 1 && <span className="text-[9px] px-1 rounded font-bold" style={{ background: 'rgba(19,121,240,0.1)', color: 'var(--primary)' }}>×{item.qtd}</span>}
                                                {item.componentes.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>{item.componentes.length} comp.</span>}
                                                {item.ripado && <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>Ripado</span>}
                                                {ajusteR !== 0 && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: ajusteR > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)', color: ajusteR > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                        {ajusteR > 0 ? '+' : ''}{aj.tipo === '%' ? `${aj.valor}%` : R$(ajusteR)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(precoItemFinal)}</span>
                                                    {itemCPData?.custoItem > 0 && (() => {
                                                        const custoIt = itemCPData.custoItem;
                                                        const margemIt = precoItemFinal - custoIt;
                                                        const margemPct = precoItemFinal > 0 ? (margemIt / precoItemFinal * 100) : 0;
                                                        return (
                                                            <span className="text-[8px] leading-none" style={{ color: margemPct > 50 ? '#8b5cf6' : margemPct > 35 ? 'var(--success)' : margemPct > 20 ? 'var(--warning)' : 'var(--danger)', opacity: 0.8 }}>
                                                                {N(margemPct, 0)}% margem
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                {!readOnly && !inGroup && hasGrupos && (
                                                    <select value="" onChange={e => { e.stopPropagation(); if (e.target.value) moveToGrupo(amb.id, item.id, e.target.value); }}
                                                        onClick={e => e.stopPropagation()}
                                                        className="text-[9px] bg-transparent outline-none cursor-pointer opacity-0 group-hover/item:opacity-60 hover:!opacity-100 transition-opacity" style={{ color: 'var(--warning)', width: 20 }} title="Mover para grupo">
                                                        <option value="">↗</option>
                                                        {(amb.grupos || []).map(g => <option key={g.id} value={g.id}>{g.nome || 'Grupo sem nome'}</option>)}
                                                    </select>
                                                )}
                                                {!readOnly && inGroup && (
                                                    <button onClick={e => { e.stopPropagation(); moveToGrupo(amb.id, item.id, ''); }}
                                                        className="p-0.5 rounded hover:bg-[var(--bg-hover)] opacity-0 group-hover/item:opacity-50 hover:!opacity-100 transition-opacity" title="Remover do grupo"
                                                        style={{ color: 'var(--text-muted)' }}><X size={11} /></button>
                                                )}
                                                {/* F: ações reveladas no hover do card */}
                                                <button onClick={e => { e.stopPropagation(); setReportItemId(reportItemId === item.id ? null : item.id); }}
                                                    className="p-1 rounded hover:bg-[var(--bg-hover)] transition-all"
                                                    title="Ver detalhes do cálculo"
                                                    style={{ color: reportItemId === item.id ? 'var(--primary)' : 'var(--text-muted)', opacity: reportItemId === item.id ? 1 : 0 }}
                                                    onMouseEnter={e => { if (reportItemId !== item.id) e.currentTarget.style.opacity = '0.7'; }}
                                                    onMouseLeave={e => { if (reportItemId !== item.id) e.currentTarget.style.opacity = '0'; }}>
                                                    <BarChart3 size={12} />
                                                </button>
                                                {!readOnly && <button onClick={e => { e.stopPropagation(); copyItem(amb.id, item.id); }} className="p-1 rounded hover:bg-[var(--bg-hover)] opacity-0 group-hover/item:opacity-60 hover:!opacity-100 transition-opacity" title="Duplicar item" style={{ color: 'var(--text-muted)' }}><Copy size={12} /></button>}
                                                {!readOnly && <button onClick={e => { e.stopPropagation(); removeItem(amb.id, item.id); }} className="p-1 rounded hover:bg-red-500/10 opacity-0 group-hover/item:opacity-50 hover:!opacity-100 transition-opacity text-red-400 hover:text-red-400" title="Remover item"><Trash2 size={12} /></button>}
                                            </div>
                                        </div>

                                        {isItemExp && (
                                            <div className="px-4 pb-3 pt-2.5 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', ...(readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                                                {/* Descrição do módulo */}
                                                <input
                                                    type="text"
                                                    placeholder="Obs / descrição do módulo..."
                                                    value={item.desc || ''}
                                                    onChange={e => upItem(amb.id, item.id, it => it.desc = e.target.value)}
                                                    className={Z.inp}
                                                    style={item.desc ? { borderColor: 'rgba(19,121,240,0.4)', background: 'rgba(19,121,240,0.03)' } : { opacity: 0.45 }}
                                                />

                                                {/* Dimensões e quantidade */}
                                                {(() => {
                                                    const allowedDims = item.caixaDef?.dimsAplicaveis || ['L','A','P'];
                                                    const dimFields = [['L (mm)', 'l', 'L'], ['A (mm)', 'a', 'A'], ['P (mm)', 'p', 'P']]
                                                        .filter(([, , key]) => allowedDims.includes(key));
                                                    return (
                                                <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${dimFields.length + 1}, minmax(0, 1fr))` }}>
                                                    {dimFields.map(([lbl, k]) => (
                                                        <div key={k} className="min-w-0">
                                                            <label className={Z.lbl}>{lbl}</label>
                                                            <input type="number" value={item.dims[k]}
                                                                onChange={e => upItem(amb.id, item.id, it => it.dims[k] = +e.target.value || 0)}
                                                                className={Z.inp} />
                                                        </div>
                                                    ))}
                                                    <div className="min-w-0">
                                                        <label className={Z.lbl}>Qtd.</label>
                                                        <input type="number" min="1" value={item.qtd || 1}
                                                            onChange={e => upItem(amb.id, item.id, it => it.qtd = Math.max(1, +e.target.value || 1))}
                                                            className={Z.inp} />
                                                    </div>
                                                </div>
                                                    );
                                                })()}

                                                {/* Materiais */}
                                                {(() => {
                                                    const hasAmbMat = !!(amb.matInt || amb.matExt);
                                                    const isCustom = item._matCustom;
                                                    const effectiveMats = resolveItemMats(item, amb);
                                                    const allMatsDB = [...chapasDB, ...acabDB.filter(a => a.preco > 0)];
                                                    const matIntNome = allMatsDB.find(m => m.id === effectiveMats.matInt)?.nome || effectiveMats.matInt || '—';
                                                    const matExtNome = effectiveMats.matExt ? (allMatsDB.find(m => m.id === effectiveMats.matExt)?.nome || effectiveMats.matExt) : '';
                                                    const hasItemMat = !!(item.mats?.matInt);

                                                    // Ambiente tem material e item não customizou → herdando
                                                    if (hasAmbMat && !isCustom) {
                                                        return (
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-1.5">
                                                                    <Layers size={10} style={{ color: 'var(--primary)', opacity: 0.5 }} />
                                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                                        <strong style={{ color: 'var(--text-secondary)' }}>{matIntNome}</strong>
                                                                        {matExtNome ? <> · <strong style={{ color: 'var(--text-secondary)' }}>{matExtNome}</strong></> : ''}
                                                                    </span>
                                                                </div>
                                                                <button onClick={() => upItem(amb.id, item.id, it => { it._matCustom = true; it.mats = { ...effectiveMats }; })}
                                                                    className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                                                                    style={{ color: 'var(--primary)' }}>
                                                                    customizar
                                                                </button>
                                                            </div>
                                                        );
                                                    }

                                                    // Sem material no ambiente e item ainda não definiu → prompt compacto
                                                    if (!hasAmbMat && !hasItemMat && !isCustom) {
                                                        return (
                                                            <button onClick={() => upItem(amb.id, item.id, it => { it._matCustom = true; })}
                                                                className="text-[10px] flex items-center gap-1 cursor-pointer py-0.5 transition-opacity hover:opacity-100 opacity-50"
                                                                style={{ color: 'var(--warning)' }}>
                                                                <Layers size={10} /> Definir material deste item...
                                                            </button>
                                                        );
                                                    }

                                                    // Modo completo: seletores de material
                                                    return (
                                                        <>
                                                            {(hasAmbMat && isCustom) && (
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>Material customizado</span>
                                                                    <button onClick={() => upItem(amb.id, item.id, it => { it._matCustom = false; })}
                                                                        className="text-[9px] px-2 py-0.5 rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                                                                        style={{ color: 'var(--text-muted)' }}
                                                                        title="Voltar a herdar material do ambiente">
                                                                        ← herdar do ambiente
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {(!hasAmbMat && (hasItemMat || isCustom)) && (
                                                                <div className="flex justify-end mb-1">
                                                                    <button onClick={() => upItem(amb.id, item.id, it => { it._matCustom = false; it.mats = {}; })}
                                                                        className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                                                                        style={{ color: 'var(--text-muted)' }}>
                                                                        limpar material
                                                                    </button>
                                                                </div>
                                                            )}
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className={Z.lbl}>Material Interno</label>
                                                                    <SearchableSelect
                                                                        value={item.mats.matInt}
                                                                        onChange={val => upItem(amb.id, item.id, it => it.mats.matInt = val)}
                                                                        groups={[
                                                                            ...(bib?.topChapas?.length > 0 ? [{ label: 'Mais usados', options: bib.topChapas.map(c => ({ value: c.id, label: c.nome })) }] : []),
                                                                            { label: 'Todas as chapas', options: chapasDB.map(c => ({ value: c.id, label: c.nome })) },
                                                                        ]}
                                                                        placeholder="Buscar chapa..."
                                                                        className={Z.inp}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className={Z.lbl}>Material Externo</label>
                                                                    <SearchableSelect
                                                                        value={item.mats.matExt}
                                                                        onChange={val => upItem(amb.id, item.id, it => it.mats.matExt = val)}
                                                                        groups={[
                                                                            ...(bib?.topChapas?.length > 0 || bib?.topAcab?.length > 0 ? [{ label: 'Mais usados', options: [...(bib?.topChapas || []), ...(bib?.topAcab || [])].map(c => ({ value: c.id, label: c.nome })) }] : []),
                                                                            { label: 'Chapas', options: chapasDB.map(c => ({ value: c.id, label: c.nome })) },
                                                                            { label: 'Acabamentos premium', options: acabDB.filter(a => a.preco > 0).map(a => ({ value: a.id, label: a.nome })) },
                                                                        ]}
                                                                        emptyOption="Sem tamponamento"
                                                                        placeholder="Buscar material..."
                                                                        className={Z.inp}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}

                                                {/* Componentes */}
                                                {item.componentes.length === 0
                                                    ? <button onClick={() => setAddCompModal({ ambId: amb.id, itemId: item.id })}
                                                        className="text-[10px] flex items-center gap-1 cursor-pointer py-0.5 transition-opacity hover:opacity-100 opacity-50"
                                                        style={{ color: 'var(--success)' }}>
                                                        <Plus size={10} /> Adicionar componente (gaveta, prateleira, porta...)
                                                    </button>
                                                    : <div className="flex flex-col gap-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--success)' }}>Componentes ({item.componentes.length})</span>
                                                            <button onClick={() => setAddCompModal({ ambId: amb.id, itemId: item.id })}
                                                                className="text-[10px] flex items-center gap-0.5 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                                                                style={{ color: 'var(--success)' }}>
                                                                <Plus size={10} /> add
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            {item.componentes.map(ci => (
                                                                <ComponenteInstancia
                                                                    key={ci.id}
                                                                    ci={ci}
                                                                    caixaDims={item.dims}
                                                                    mats={item.mats}
                                                                    compDef={ci.compDef}
                                                                    onUpdate={newCi => upComp(amb.id, item.id, ci.id, newCi)}
                                                                    onRemove={() => removeComp(amb.id, item.id, ci.id)}
                                                                    chapasDB={chapasDB}
                                                                    acabDB={acabDB}
                                                                    ferragensDB={ferragensDB}
                                                                    globalPadroes={padroes}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                }

                                                {/* Ripado no módulo */}
                                                {item.ripado && (
                                                    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--warning-border)', borderLeft: '3px solid var(--warning)', background: 'var(--bg-card)' }}>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[10px] uppercase tracking-widest font-bold flex items-center gap-1.5" style={{ color: 'var(--warning)' }}>
                                                                <Layers size={10} /> Ripado
                                                            </span>
                                                            <button onClick={() => removeRipadoFromItem(amb.id, item.id)}
                                                                className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"
                                                                title="Remover ripado">
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                        <RipadoModuloCard
                                                            ripado={item.ripado}
                                                            dims={item.dims}
                                                            bibItems={bibItems}
                                                            onUpdate={patch => upRipadoOnItem(amb.id, item.id, patch)}
                                                        />
                                                    </div>
                                                )}

                                                {/* ── Avançado: Trocar módulo + Ajuste de Preço ── */}
                                                {(() => {
                                                    const isAdv = advancedItemId === item.id || ajusteR !== 0;
                                                    return (
                                                        <>
                                                            <button onClick={() => setAdvancedItemId(isAdv && ajusteR === 0 ? null : item.id)}
                                                                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-semibold cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                                                                style={{ color: 'var(--text-muted)', borderTop: '1px dashed var(--border)' }}>
                                                                {isAdv ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                                                <Settings size={10} />
                                                                {isAdv ? 'Ocultar' : 'Avançado'}
                                                                {ajusteR !== 0 && <span className="ml-1 font-bold" style={{ color: ajusteR > 0 ? 'var(--success)' : 'var(--danger)' }}>{ajusteR > 0 ? '+' : ''}{R$(ajusteR)}</span>}
                                                            </button>
                                                            {isAdv && (
                                                                <div className="flex flex-col gap-3 pt-2">
                                                                    {/* Trocar módulo */}
                                                                    <div>
                                                                        <label className={Z.lbl}>Trocar módulo <span className="font-normal" style={{ color: 'var(--text-muted)' }}>— {item.nome}</span></label>
                                                                        <CaixaSearch
                                                                            caixas={caixas}
                                                                            onSelect={newId => swapItemCaixa(amb.id, item.id, newId)}
                                                                            onAddPainel={null}
                                                                            placeholder="Buscar módulo para substituir..."
                                                                        />
                                                                    </div>
                                                                    {/* Ajuste de Preço */}
                                                                    <div>
                                                                        <label className={Z.lbl}>Ajuste de Preço</label>
                                                                        <div className="flex gap-2 items-center">
                                                                            <div className="flex rounded overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                                                                                <button type="button"
                                                                                    onClick={() => upItem(amb.id, item.id, it => { if (!it.ajuste) it.ajuste = { tipo: '%', valor: 0 }; it.ajuste.tipo = '%'; })}
                                                                                    className="px-2 py-1 text-xs font-bold transition-colors"
                                                                                    style={{ background: (item.ajuste?.tipo ?? '%') === '%' ? 'var(--primary)' : 'var(--bg-muted)', color: (item.ajuste?.tipo ?? '%') === '%' ? '#fff' : 'var(--text-muted)' }}>%</button>
                                                                                <button type="button"
                                                                                    onClick={() => upItem(amb.id, item.id, it => { if (!it.ajuste) it.ajuste = { tipo: 'R', valor: 0 }; it.ajuste.tipo = 'R'; })}
                                                                                    className="px-2 py-1 text-xs font-bold transition-colors"
                                                                                    style={{ background: item.ajuste?.tipo === 'R' ? 'var(--primary)' : 'var(--bg-muted)', color: item.ajuste?.tipo === 'R' ? '#fff' : 'var(--text-muted)' }}>R$</button>
                                                                            </div>
                                                                            <input type="number" step="0.1" placeholder="0"
                                                                                value={item.ajuste?.valor ?? ''}
                                                                                onChange={e => upItem(amb.id, item.id, it => { if (!it.ajuste) it.ajuste = { tipo: '%', valor: 0 }; it.ajuste.valor = parseFloat(e.target.value) || 0; })}
                                                                                className={Z.inp}
                                                                                style={ajusteR !== 0 ? { borderColor: ajusteR > 0 ? 'rgba(22,163,74,0.5)' : 'rgba(239,68,68,0.5)' } : {}} />
                                                                            {ajusteR !== 0 && <span className="text-xs whitespace-nowrap font-bold" style={{ color: ajusteR > 0 ? 'var(--success)' : 'var(--danger)' }}>{ajusteR > 0 ? '+' : ''}{R$(ajusteR)}</span>}
                                                                        </div>
                                                                        {ajusteR !== 0 && (
                                                                            <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                                                Base: {R$(precoItem)} → <span className="font-semibold" style={{ color: ajusteR > 0 ? 'var(--success)' : 'var(--danger)' }}>Final: {R$(precoItemFinal)}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}

                                            </div>
                                        )}
                                        {reportItemId === item.id && res && (
                                            <div style={{ borderTop: '1px solid var(--border)' }}>
                                                <RelatorioItem
                                                    res={res}
                                                    chapasDB={chapasDB}
                                                    fitasDB={fitasDB}
                                                    coef={coef}
                                                    qtd={item.qtd || 1}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            };

                            return (
                                <div key={amb.id} id={`amb-${amb.id}`} className="glass-card !p-0 overflow-hidden border-l-[3px] border-l-[var(--primary)] mb-3">
                                    {/* Header do ambiente */}
                                    <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setExpandedAmb(isExpAmb ? null : amb.id)}>
                                        <div className="flex items-center gap-3">
                                            {isExpAmb ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                                            <span className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: 'var(--primary)', color: 'white', minWidth: 22, textAlign: 'center', lineHeight: '1.4' }}>{String(ambIdx + 1).padStart(2, '0')}</span>
                                            <FolderOpen size={16} style={{ color: 'var(--primary)' }} />
                                            <input value={amb.nome} onClick={e => e.stopPropagation()}
                                                onChange={e => upAmb(amb.id, a => a.nome = e.target.value)}
                                                className="bg-transparent font-medium text-sm outline-none" style={{ color: 'var(--text-primary)', minWidth: 120 }} />
                                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                                {amb.tipo === 'manual'
                                                    ? `${(amb.linhas || []).length} item${(amb.linhas || []).length !== 1 ? 'ns' : ''}`
                                                    : `${amb.itens.length} caixa${amb.itens.length !== 1 ? 's' : ''}${(amb.paineis || []).length > 0 ? ` · ${amb.paineis.length} painel${amb.paineis.length > 1 ? 'is' : ''}` : ''}${(amb.itensEspeciais || []).length > 0 ? ` · ${amb.itensEspeciais.length} especial${amb.itensEspeciais.length > 1 ? 'is' : ''}` : ''}`
                                                }
                                            </span>
                                            {amb.tipo === 'manual' && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--warning-border)' }}>Manual</span>}
                                            {amb.matInt && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(19,121,240,0.06)', color: 'var(--primary)', border: '1px solid rgba(19,121,240,0.15)' }} title={`Interno: ${chapasDB.find(c=>c.id===amb.matInt)?.nome || amb.matInt}${amb.matExt ? ` · Externo: ${[...chapasDB, ...acabDB].find(c=>c.id===amb.matExt)?.nome || amb.matExt}` : ''}`}>{chapasDB.find(c=>c.id===amb.matInt)?.nome || amb.matInt}</span>}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>{R$(ambPv)}</span>
                                            {!readOnly && (
                                                <>
                                                    {ambIdx > 0 && <button onClick={e => { e.stopPropagation(); moveAmbUp(amb.id); }} className="p-1 rounded hover:bg-blue-500/10 text-blue-400/40 hover:text-blue-400 cursor-pointer" title="Mover para cima"><ArrowUp size={13} /></button>}
                                                    {ambIdx < ambientes.length - 1 && <button onClick={e => { e.stopPropagation(); moveAmbDown(amb.id); }} className="p-1 rounded hover:bg-blue-500/10 text-blue-400/40 hover:text-blue-400 cursor-pointer" title="Mover para baixo"><ArrowDown size={13} /></button>}
                                                    <button onClick={e => { e.stopPropagation(); setShowSaveTemplateModal(amb.id); setTemplateNome(amb.nome); setTemplateCategoria(''); }} className="p-1 rounded hover:bg-green-500/10 text-green-400/50 hover:text-green-400 cursor-pointer" title="Salvar como template"><FilePlus2 size={13} /></button>
                                                    <button onClick={e => { e.stopPropagation(); duplicarAmbiente(amb.id); }} className="p-1 rounded hover:bg-violet-500/10 text-violet-400/50 hover:text-violet-400 cursor-pointer" title="Duplicar ambiente"><Copy size={13} /></button>
                                                    <button onClick={e => { e.stopPropagation(); removeAmb(amb.id); }} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400 cursor-pointer" title="Remover ambiente"><Trash2 size={14} /></button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {isExpAmb && amb.tipo === 'manual' && (
                                        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)', ...(readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                                            {/* ── Ambiente Manual: Blocos Descritivos ── */}
                                            <div className="py-3 flex flex-col gap-4">
                                                {(amb.linhas || []).map((ln, li) => {
                                                    // Compatibilidade: linhas antigas sem tipo='bloco'
                                                    const isBloco = ln.tipo === 'bloco';
                                                    if (!isBloco) {
                                                        // Renderizar linha antiga como bloco simplificado
                                                        return (
                                                            <div key={ln.id} className="glass-card" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <input value={ln.descricao} placeholder="Descrição do item"
                                                                        onChange={e => upAmb(amb.id, a => { a.linhas[li].descricao = e.target.value; })}
                                                                        className={Z.inp} style={{ fontSize: 13, flex: 1 }} />
                                                                    <input type="number" value={ln.qtd} min={1} style={{ width: 56, textAlign: 'center', fontSize: 13, padding: '4px 6px' }}
                                                                        onChange={e => upAmb(amb.id, a => { a.linhas[li].qtd = Math.max(1, parseInt(e.target.value) || 1); })}
                                                                        className={Z.inp} />
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>×</span>
                                                                    <input type="number" value={ln.valorUnit} min={0} step={0.01} style={{ width: 100, textAlign: 'right' }}
                                                                        onChange={e => upAmb(amb.id, a => { a.linhas[li].valorUnit = parseFloat(e.target.value) || 0; })}
                                                                        className={Z.inp} />
                                                                    <span className="font-bold text-xs" style={{ color: 'var(--primary)', minWidth: 70, textAlign: 'right' }}>{R$((ln.qtd || 0) * (ln.valorUnit || 0))}</span>
                                                                    {(amb.linhas || []).length > 1 && <button onClick={() => upAmb(amb.id, a => { a.linhas = a.linhas.filter(l => l.id !== ln.id); })} className="p-1 rounded hover:bg-red-500/10 cursor-pointer" style={{ color: 'var(--text-muted)' }}><Trash2 size={12} /></button>}
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    const MARCADORES = [
                                                        { id: 'bullet', label: '•', title: 'Marcadores' },
                                                        { id: 'number', label: '1.', title: 'Numerado' },
                                                        { id: 'dash', label: '—', title: 'Traço' },
                                                        { id: 'none', label: 'Aa', title: 'Sem marcador' },
                                                    ];
                                                    const previewLines = (ln.descricao || '').split('\n').filter(l => l.trim());
                                                    return (
                                                        <div key={ln.id} className="glass-card" style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                                                            {/* Header do bloco */}
                                                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
                                                                <input value={ln.titulo} placeholder="Título do bloco (ex: Complementos Banheiro)"
                                                                    onChange={e => upAmb(amb.id, a => { a.linhas[li].titulo = e.target.value; })}
                                                                    className={Z.inp} style={{ fontSize: 13, fontWeight: 600, flex: 1, background: 'transparent', border: 'none', padding: '2px 0' }} />
                                                                <div className="flex items-center gap-1 shrink-0" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
                                                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 4 }}>R$</span>
                                                                    <input type="number" value={ln.valor} min={0} step={0.01}
                                                                        onChange={e => upAmb(amb.id, a => { a.linhas[li].valor = parseFloat(e.target.value) || 0; })}
                                                                        className={Z.inp} style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', width: 110, color: 'var(--primary)' }} />
                                                                </div>
                                                                {(amb.linhas || []).length > 1 && (
                                                                    <button onClick={() => upAmb(amb.id, a => { a.linhas = a.linhas.filter(l => l.id !== ln.id); })}
                                                                        className="p-1.5 rounded hover:bg-red-500/10 cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {/* Corpo: textarea + marcadores + preview */}
                                                            <div style={{ padding: '12px 14px' }}>
                                                                <textarea value={ln.descricao}
                                                                    placeholder="Descreva os itens (um por linha)&#10;Ex:&#10;Espelho sob medida 80×60cm&#10;2 nichos embutidos&#10;Porta toalha inox"
                                                                    onChange={e => upAmb(amb.id, a => { a.linhas[li].descricao = e.target.value; })}
                                                                    className={Z.inp}
                                                                    rows={Math.max(3, previewLines.length + 1)}
                                                                    style={{ fontSize: 12, lineHeight: 1.7, resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }} />
                                                                <div className="flex items-center justify-between mt-2">
                                                                    <div className="flex items-center gap-1">
                                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>Marcador:</span>
                                                                        {MARCADORES.map(m => (
                                                                            <button key={m.id} title={m.title}
                                                                                onClick={() => upAmb(amb.id, a => { a.linhas[li].marcador = m.id; })}
                                                                                className="px-2 py-0.5 rounded text-xs cursor-pointer transition-all"
                                                                                style={{
                                                                                    background: ln.marcador === m.id ? 'var(--primary)' : 'var(--bg-muted)',
                                                                                    color: ln.marcador === m.id ? '#fff' : 'var(--text-muted)',
                                                                                    fontWeight: ln.marcador === m.id ? 700 : 400,
                                                                                    border: `1px solid ${ln.marcador === m.id ? 'var(--primary)' : 'var(--border)'}`,
                                                                                }}>
                                                                                {m.label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{previewLines.length} {previewLines.length === 1 ? 'linha' : 'linhas'}</span>
                                                                </div>
                                                                {/* Preview: como ficará na proposta (colapsável) */}
                                                                {previewLines.length > 0 && (
                                                                    <div style={{ marginTop: 8 }}>
                                                                        <button onClick={() => upAmb(amb.id, a => { a.linhas[li]._previewOpen = !a.linhas[li]._previewOpen; })}
                                                                            className="flex items-center gap-1.5 cursor-pointer" style={{ background: 'none', border: 'none', padding: 0 }}>
                                                                            <Eye size={11} style={{ color: 'var(--text-muted)' }} />
                                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ln._previewOpen ? 'Ocultar' : 'Ver'} preview</span>
                                                                            <ChevronDown size={10} style={{ color: 'var(--text-muted)', transform: ln._previewOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                                        </button>
                                                                        {ln._previewOpen && (
                                                                            <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                                                                                {previewLines.map((line, idx) => {
                                                                                    const prefix = ln.marcador === 'bullet' ? '• ' : ln.marcador === 'number' ? `${idx + 1}. ` : ln.marcador === 'dash' ? '— ' : '';
                                                                                    return (
                                                                                        <div key={idx} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                                                                                            {prefix}{line.trim()}
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                <button onClick={() => upAmb(amb.id, a => { a.linhas.push({ id: uid(), tipo: 'bloco', titulo: '', descricao: '', marcador: 'bullet', valor: 0 }); })}
                                                    className={`${Z.btn2} text-xs py-1.5 px-3`}>
                                                    <Plus size={12} /> Adicionar bloco
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {isExpAmb && amb.tipo !== 'manual' && (
                                        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
                                            {/* ── Material Global do Ambiente ── */}
                                            {!readOnly && (() => {
                                                const hasAmbMat = !!(amb.matInt || amb.matExt);
                                                const isMatExp = hasAmbMat || !!amb._matExpanded;
                                                const allMatsDB = [...chapasDB, ...acabDB.filter(a => a.preco > 0)];
                                                const matIntNome = allMatsDB.find(m => m.id === amb.matInt)?.nome || '';
                                                const matExtNome = allMatsDB.find(m => m.id === amb.matExt)?.nome || '';

                                                if (!isMatExp) {
                                                    return (
                                                        <div className="py-2 mb-1" style={{ borderBottom: '1px dashed var(--border)' }}>
                                                            <button onClick={() => upAmb(amb.id, a => { a._matExpanded = true; })}
                                                                className="text-[10px] flex items-center gap-1.5 cursor-pointer opacity-45 hover:opacity-100 transition-opacity w-full"
                                                                style={{ color: 'var(--primary)' }}>
                                                                <Layers size={10} /> Definir material do ambiente...
                                                            </button>
                                                        </div>
                                                    );
                                                }

                                                const nItens = (amb.itens || []).filter(i => i.tipo !== 'avulso').length;
                                                const nCustom = (amb.itens || []).filter(i => i.tipo !== 'avulso' && i._matCustom).length;
                                                const showSelectors = !hasAmbMat || !!amb._matExpanded;
                                                return (
                                                    <div className="py-2 mb-1" style={{ borderBottom: '1px dashed var(--border)' }}>
                                                        {hasAmbMat && (
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <div className="flex items-center gap-1.5">
                                                                    <Layers size={10} style={{ color: 'var(--primary)', opacity: 0.7 }} />
                                                                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{matIntNome}</span>
                                                                    {matExtNome && <><span style={{ color: 'var(--text-muted)', fontSize: 9 }}>·</span><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{matExtNome}</span></>}
                                                                    {nItens > 0 && <span className="text-[9px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>({nCustom > 0 ? `${nItens - nCustom}/${nItens} módulos` : `${nItens} módulos`})</span>}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button onClick={() => upAmb(amb.id, a => { a._matExpanded = !a._matExpanded; })}
                                                                        className="text-[9px] cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                                                                        style={{ color: 'var(--primary)' }}>
                                                                        {amb._matExpanded ? 'fechar' : 'editar'}
                                                                    </button>
                                                                    <button onClick={() => upAmb(amb.id, a => { a.matInt = ''; a.matExt = ''; a._matExpanded = false; })}
                                                                        className="text-[9px] cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
                                                                        style={{ color: 'var(--danger)' }}>
                                                                        limpar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {showSelectors && (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="text-[9px] mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Interno (corpo + fundo)</label>
                                                                    <SearchableSelect
                                                                        value={amb.matInt || ''}
                                                                        onChange={val => upAmb(amb.id, a => { a.matInt = val; })}
                                                                        groups={[
                                                                            ...(bib?.topChapas?.length > 0 ? [{ label: 'Mais usados', options: bib.topChapas.map(c => ({ value: c.id, label: c.nome })) }] : []),
                                                                            { label: 'Todas as chapas', options: chapasDB.map(c => ({ value: c.id, label: c.nome })) },
                                                                        ]}
                                                                        emptyOption="Sem padrão (por módulo)"
                                                                        placeholder="Selecionar..."
                                                                        className={Z.inp}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="text-[9px] mb-0.5 block" style={{ color: 'var(--text-muted)' }}>Externo (tamponamento)</label>
                                                                    <SearchableSelect
                                                                        value={amb.matExt ?? ''}
                                                                        onChange={val => upAmb(amb.id, a => { a.matExt = val; })}
                                                                        groups={[
                                                                            ...(bib?.topChapas?.length > 0 || bib?.topAcab?.length > 0 ? [{ label: 'Mais usados', options: [...(bib?.topChapas || []), ...(bib?.topAcab || [])].map(c => ({ value: c.id, label: c.nome })) }] : []),
                                                                            { label: 'Chapas', options: chapasDB.map(c => ({ value: c.id, label: c.nome })) },
                                                                            { label: 'Acabamentos premium', options: acabDB.filter(a => a.preco > 0).map(a => ({ value: a.id, label: a.nome })) },
                                                                        ]}
                                                                        emptyOption="Sem tamponamento"
                                                                        placeholder="Selecionar..."
                                                                        className={Z.inp}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                        {!hasAmbMat && isMatExp && (
                                                            <button onClick={() => upAmb(amb.id, a => { a._matExpanded = false; })}
                                                                className="text-[9px] mt-1.5 cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
                                                                style={{ color: 'var(--text-muted)' }}>
                                                                fechar
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            {/* Selector de caixa com busca */}
                                            {!readOnly && (
                                                <div className="py-3">
                                                    <CaixaSearch
                                                        caixas={caixas}
                                                        onSelect={id => addItemToAmb(amb.id, parseInt(id))}
                                                        onAddPainel={() => addPainel(amb.id)}
                                                        onAddEspecial={(tipo) => addItemEspecial(amb.id, tipo)}
                                                        onAddAvulso={() => addItemAvulso(amb.id)}
                                                        onAddGrupo={() => addGrupo(amb.id)}
                                                    />
                                                    {caixas.length === 0 && (
                                                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Nenhuma caixa cadastrada. Vá em <strong>Engenharia de Módulos</strong> para criar.</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* ── Lista unificada: grupos + itens soltos ordenados ── */}
                                            {(() => {
                                                const grupos = (amb.grupos || []);
                                                const itensSoltos = amb.itens.filter(it => !it.grupo_id || !grupos.find(g => g.id === it.grupo_id));
                                                const unified = [
                                                    ...grupos.map((g, i) => ({ type: 'grupo', data: g, ordem: g.ordem ?? i })),
                                                    ...itensSoltos.map((it, i) => ({ type: 'item', data: it, ordem: it.ordem ?? (1000 + i) })),
                                                ].sort((a, b) => a.ordem - b.ordem);

                                                if (unified.length === 0) return (
                                                    <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                                                        <Box size={24} className="mx-auto mb-2 opacity-40" />
                                                        <span className="text-xs">Selecione uma caixa acima</span>
                                                    </div>
                                                );

                                                return unified.map((el, elIdx) => {
                                                    if (el.type === 'grupo') {
                                                        const grupo = el.data;
                                                        const filhos = amb.itens.filter(it => it.grupo_id === grupo.id);
                                                        const ieFilhos = (amb.itensEspeciais || []).filter(ie => ie.grupo_id === grupo.id);
                                                        const totalGrupo = filhos.reduce((s, it) => {
                                                            if (it.tipo === 'avulso') return s + (it.valor || 0) * (it.qtd || 1);
                                                            const cpd = (tot.itemCostList || []).find(x => x.itemId === it.id);
                                                            return s + (cpd?.itemCP || 0);
                                                        }, 0) + ieFilhos.reduce((s, ie) => s + calcItemEspecial(ie, bibItems || []).custo, 0);
                                                        const pvGrupo = tot.totalItemCP > 0 ? (totalGrupo / tot.totalItemCP) * tot.pv : totalGrupo;
                                                        return (
                                                            <div key={grupo.id} className="rounded-lg border overflow-hidden mb-3 transition-all duration-150"
                                                                onDragOver={e => handleGrupoDragOver(e, grupo.id)}
                                                                onDragLeave={handleGrupoDragLeave}
                                                                onDrop={e => handleGrupoDrop(e, amb.id, grupo.id)}
                                                                style={{
                                                                    borderColor: dragOverGrupo === grupo.id ? 'var(--warning)' : 'rgba(245,158,11,0.3)',
                                                                    background: dragOverGrupo === grupo.id ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)',
                                                                    borderLeft: '3px solid var(--warning)',
                                                                    boxShadow: dragOverGrupo === grupo.id ? '0 0 12px rgba(245,158,11,0.2)' : 'none',
                                                                }}>
                                                                <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(245,158,11,0.04)' }}>
                                                                    <Package size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                                                    <input type="text" placeholder="Nome do grupo (ex: Armário Cozinha 1500mm)"
                                                                        value={grupo.nome} onChange={e => renameGrupo(amb.id, grupo.id, e.target.value)}
                                                                        className="bg-transparent font-semibold text-sm outline-none flex-1 min-w-0"
                                                                        style={{ color: 'var(--warning)' }} readOnly={readOnly} />
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
                                                                        {filhos.length + ieFilhos.length} {filhos.length + ieFilhos.length === 1 ? 'item' : 'itens'}
                                                                    </span>
                                                                    <span className="font-bold text-xs" style={{ color: 'var(--warning)' }}>{R$(pvGrupo)}</span>
                                                                    {!readOnly && <>
                                                                        <button onClick={() => reorderElement(amb.id, 'grupo', grupo.id, 'up')} disabled={elIdx === 0}
                                                                            className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-20" title="Mover para cima" style={{ color: 'var(--text-muted)' }}>
                                                                            <ChevronUp size={12} />
                                                                        </button>
                                                                        <button onClick={() => reorderElement(amb.id, 'grupo', grupo.id, 'down')} disabled={elIdx === unified.length - 1}
                                                                            className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-20" title="Mover para baixo" style={{ color: 'var(--text-muted)' }}>
                                                                            <ChevronDown size={12} />
                                                                        </button>
                                                                        <button onClick={() => duplicateGrupo(amb.id, grupo.id)}
                                                                            className="p-1 rounded hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Duplicar grupo"><Copy size={12} /></button>
                                                                        <button onClick={() => removeGrupo(amb.id, grupo.id)}
                                                                            className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400" title="Excluir grupo"><Trash2 size={12} /></button>
                                                                    </>}
                                                                </div>
                                                                <div className="pl-3 pr-1 pb-2 pt-1" style={{ borderTop: '1px solid rgba(245,158,11,0.12)' }}>
                                                                    {filhos.length === 0 && ieFilhos.length === 0 ? (
                                                                        <div className="text-center py-4" style={{ color: dragOverGrupo === grupo.id ? 'var(--warning)' : 'var(--text-muted)' }}>
                                                                            <Package size={20} className="mx-auto mb-1 opacity-40" />
                                                                            <span className="text-[10px]">{dragOverGrupo === grupo.id ? 'Solte aqui para adicionar ao grupo' : 'Arraste itens para dentro deste grupo'}</span>
                                                                        </div>
                                                                    ) : (<>
                                                                        {filhos.map(fi => renderItemCard(fi, { inGroup: true }))}
                                                                        {ieFilhos.map(ie => (
                                                                            <ItemEspecialCard key={ie.id} item={ie} bibItems={bibItems} readOnly={readOnly}
                                                                                grupos={amb.grupos || []}
                                                                                draggable={!readOnly}
                                                                                onDragStart={e => handleDragStart(e, amb.id, ie.id, true)}
                                                                                onDragEnd={handleDragEnd}
                                                                                onUpdate={newItem => upItemEspecial(amb.id, ie.id, newItem)}
                                                                                onCopy={() => copyItemEspecial(amb.id, ie.id)}
                                                                                onRemove={() => removeItemEspecial(amb.id, ie.id)} />
                                                                        ))}
                                                                        {dragOverGrupo === grupo.id && (
                                                                            <div className="text-center py-2 text-[10px] font-medium" style={{ color: 'var(--warning)' }}>
                                                                                ↓ Solte aqui para adicionar ao grupo
                                                                            </div>
                                                                        )}
                                                                    </>)}
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        // item solto — injeta botões ↑↓ via wrapper
                                                        const item = el.data;
                                                        return (
                                                            <div key={item.id} className="relative group/reorder">
                                                                {!readOnly && (
                                                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full flex flex-col gap-0.5 opacity-0 group-hover/reorder:opacity-100 transition-opacity pr-1 z-10">
                                                                        <button onClick={() => reorderElement(amb.id, 'item', item.id, 'up')} disabled={elIdx === 0}
                                                                            className="p-0.5 rounded hover:bg-[var(--bg-hover)] disabled:opacity-20" style={{ color: 'var(--text-muted)' }} title="Mover para cima">
                                                                            <ChevronUp size={13} />
                                                                        </button>
                                                                        <button onClick={() => reorderElement(amb.id, 'item', item.id, 'down')} disabled={elIdx === unified.length - 1}
                                                                            className="p-0.5 rounded hover:bg-[var(--bg-hover)] disabled:opacity-20" style={{ color: 'var(--text-muted)' }} title="Mover para baixo">
                                                                            <ChevronDown size={13} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {renderItemCard(item)}
                                                            </div>
                                                        );
                                                    }
                                                });
                                            })()}

                                            {/* Drop zone para desagrupar */}
                                            {!readOnly && (amb.grupos || []).length > 0 && (
                                                <div className="rounded-lg border-2 border-dashed mb-2 transition-all duration-150"
                                                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverGrupo('__soltos__'); }}
                                                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverGrupo(null); }}
                                                    onDrop={e => handleGrupoDrop(e, amb.id, '')}
                                                    style={{
                                                        borderColor: dragOverGrupo === '__soltos__' ? 'var(--primary)' : 'transparent',
                                                        background: dragOverGrupo === '__soltos__' ? 'rgba(19,121,240,0.06)' : 'transparent',
                                                        padding: dragOverGrupo === '__soltos__' ? '12px 0' : '4px 0',
                                                    }}>
                                                    {dragOverGrupo === '__soltos__' && (
                                                        <div className="text-center text-[10px] font-medium" style={{ color: 'var(--primary)' }}>
                                                            Solte aqui para desagrupar o item
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ── Painéis Ripados ── */}
                                            {(amb.paineis || []).length > 0 && (
                                                <div className="mt-2">
                                                    <div className="text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5" style={{ color: 'var(--warning)' }}>
                                                        <Layers size={10} /> Painéis ({amb.paineis.length})
                                                    </div>
                                                    {amb.paineis.map(painel => {
                                                        const pCPData = (tot.itemCostList || []).find(x => x.itemId === painel.id);
                                                        const pCP = pCPData?.itemCP || 0;
                                                        const pPreco = tot.totalItemCP > 0 ? (pCP / tot.totalItemCP) * tot.pv : undefined;
                                                        return <PainelCard key={painel.id} painel={painel} bibItems={bibItems}
                                                            precoVenda={pPreco}
                                                            onUpdate={newP => upPainel(amb.id, painel.id, newP)}
                                                            onRemove={() => removePainel(amb.id, painel.id)} />;
                                                    })}
                                                </div>
                                            )}

                                            {/* ── Itens Especiais (sem grupo) — draggable para grupos ── */}
                                            {(amb.itensEspeciais || []).filter(ie => !ie.grupo_id).length > 0 && (
                                                <div className="mt-2">
                                                    <div className="text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5" style={{ color: '#a78bfa' }}>
                                                        <Shapes size={10} /> Itens Especiais ({(amb.itensEspeciais || []).filter(ie => !ie.grupo_id).length})
                                                        {(amb.grupos || []).length > 0 && <span className="font-normal ml-1" style={{ color: 'var(--text-muted)' }}>— arraste para um grupo</span>}
                                                    </div>
                                                    {(amb.itensEspeciais || []).filter(ie => !ie.grupo_id).map(ie => (
                                                        <ItemEspecialCard key={ie.id} item={ie} bibItems={bibItems} readOnly={readOnly}
                                                            grupos={amb.grupos || []}
                                                            draggable={!readOnly && (amb.grupos || []).length > 0}
                                                            onDragStart={e => handleDragStart(e, amb.id, ie.id, true)}
                                                            onDragEnd={handleDragEnd}
                                                            onUpdate={newItem => upItemEspecial(amb.id, ie.id, newItem)}
                                                            onCopy={() => copyItemEspecial(amb.id, ie.id)}
                                                            onRemove={() => removeItemEspecial(amb.id, ie.id)} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {/* E: Botão para adicionar ambiente no fim da lista */}
                        {!readOnly && ambientes.length > 0 && (
                            <button onClick={addAmbiente}
                                className="w-full mt-2 py-2 text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-opacity opacity-40 hover:opacity-90 rounded-lg"
                                style={{ borderTop: '1px dashed var(--border)', color: 'var(--primary)' }}>
                                <Plus size={12} /> Adicionar ambiente
                            </button>
                        )}
                    </div>

                    {/* Lista de Ferragens */}
                    {Object.keys(tot.fa).length > 0 && (
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: '#a855f7' }}>Lista de Ferragens</h3>
                            <div style={{ overflowX: 'auto' }}>
                            <table className="w-full border-collapse text-left">
                                <thead><tr>{['Item', 'Origem', 'Qtd', 'Unit.', 'Total'].map(h => <th key={h} className={Z.th}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {Object.values(tot.fa).map((f, i) => (
                                        <tr key={i} className="hover:bg-[var(--bg-hover)]">
                                            <td className="td-glass">{f.nome}</td>
                                            <td className="td-glass text-[10px]" style={{ color: 'var(--text-muted)' }}>{f.orig || '—'}</td>
                                            <td className="td-glass">{N(f.qtd, 0)} {f.un}</td>
                                            <td className="td-glass text-right" style={{ color: 'var(--text-muted)' }}>{R$(f.preco)}</td>
                                            <td className="td-glass text-right font-semibold" style={{ color: 'var(--primary)' }}>{R$(f.preco * f.qtd)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Resumo Financeiro ── */}
                <div className="lg:col-span-1">
                    <div className="glass-card overflow-hidden flex flex-col" style={{ borderTop: '2px solid var(--primary)', minHeight: 560, maxHeight: 'calc(100vh - 24px)' }}>
                        <div className="p-3 overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
                            <h3 className="font-semibold text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Resumo Financeiro</h3>

                            {/* ── Ambientes ── */}
                            {ambientes.length > 0 && (
                                <div className="flex flex-col gap-0.5 mb-3 pb-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                                    <div className="text-[9px] font-semibold mb-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>POR AMBIENTE</div>
                                    {ambientes.map(a => {
                                        const d = tot.ambTotals.find(x => x.id === a.id);
                                        const ambAjVal = d ? (tot.itemCostList || []).filter(x => x.ambId === a.id).reduce((s, { itemCP, ajuste }) => {
                                            if (!ajuste || !ajuste.valor) return s;
                                            const pb = tot.totalItemCP > 0 ? (itemCP / tot.totalItemCP) * tot.pv : 0;
                                            return s + (ajuste.tipo === 'R' ? ajuste.valor : pb * (ajuste.valor / 100));
                                        }, 0) : 0;
                                        const ambPvVal = d ? (d.manual ? (d.custo || 0) : (tot.totalItemCP > 0 ? (d.cp || 0) / tot.totalItemCP * tot.pv + ambAjVal : (d.custo || 0)) + (d.avulso || 0)) : 0;
                                        const ambCustoVal = d?.custo || 0;
                                        const ambMargemPct = ambPvVal > 0 && ambCustoVal > 0 ? ((ambPvVal - ambCustoVal) / ambPvVal * 100) : 0;
                                        return (
                                            <div key={a.id} className="flex justify-between text-[11px] items-center">
                                                <span className="truncate pr-2" style={{ color: 'var(--text-muted)' }}>{a.nome}</span>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {ambMargemPct > 0 && <span className="text-[8px]" title={`Margem ${N(ambMargemPct, 1)}%`} style={{ color: ambMargemPct > 50 ? '#8b5cf6' : ambMargemPct > 35 ? 'var(--success)' : ambMargemPct > 20 ? 'var(--warning)' : 'var(--danger)', opacity: 0.8 }}>{N(ambMargemPct, 0)}%</span>}
                                                    <span style={{ color: 'var(--text-secondary)' }}>{R$(ambPvVal)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ── Custo breakdown ── */}
                            <div className="flex flex-col gap-1 text-[11px] mb-2">
                                {(() => {
                                    const bd = tot.breakdown || {};
                                    const matPuro = tot.cm || 0;
                                    const matComCoef = (bd.chapasAdj || 0) + (bd.fitaAdj || 0) + (bd.acabAdj || 0) + (bd.ferrVal || 0) + (bd.acessVal || 0);
                                    const complexidade = matComCoef - matPuro;
                                    const matMk = (bd.pvChapas || 0) + (bd.pvFita || 0) + (bd.pvAcab || 0) + (bd.pvFerr || 0) + (bd.pvAcess || 0);
                                    const custOp = matMk - matComCoef;
                                    const mdoVal = bd.mdo || tot.custoMdo || 0;
                                    const consumVal = tot.totConsumiveis || 0;
                                    return [
                                        ['Material', matPuro],
                                        ['Complexidade', complexidade],
                                        ...(consumVal > 0 ? [['Consumíveis', consumVal]] : []),
                                        ['Mão de Obra', mdoVal],
                                        ['Op. / Markup', custOp],
                                    ].filter(([, v]) => v > 0).map(([l, v], i) => (
                                        <div key={i} className="flex justify-between">
                                            <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{R$(v)}</span>
                                        </div>
                                    ));
                                })()}
                            </div>
                            <div className="mb-2 pb-2 flex justify-between text-xs" style={{ borderBottom: '1px solid var(--border)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Custo Produção</span>
                                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{R$(tot.cb)}</span>
                            </div>
                            {tot.manualTotal > 0 && (
                                <div className="mb-2 flex justify-between text-xs">
                                    <span style={{ color: 'var(--warning)' }}>Amb. Manuais</span>
                                    <span className="font-bold" style={{ color: 'var(--warning)' }}>{R$(tot.manualTotal)}</span>
                                </div>
                            )}

                            {/* ── Formação de Preço (modo simples + avançado) ── */}
                            <div className={readOnly ? 'opacity-60 pointer-events-none' : ''}>
                                <div className="text-[9px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>PRECIFICAÇÃO</div>
                                {(() => {
                                    const bd = tot.breakdown || {};
                                    const mdoVal = bd.mdo || 0;
                                    const temCustoHora = taxas.custo_hora_ativo && tot.custoHoraResult?.custoMdo > 0;
                                    // Margem fabricados: média ponderada mk_chapas, mk_fita, mk_acabamentos
                                    const fabMks = [
                                        [taxas.mk_chapas ?? 1.45, bd.chapasAdj || 0],
                                        [taxas.mk_fita ?? 1.45, bd.fitaAdj || 0],
                                        [taxas.mk_acabamentos ?? 1.30, bd.acabAdj || 0],
                                    ];
                                    const fabPeso = fabMks.reduce((s, [, p]) => s + p, 0);
                                    const margemFabMk = fabPeso > 0 ? fabMks.reduce((s, [mk, p]) => s + mk * p, 0) / fabPeso : (taxas.mk_chapas ?? 1.45);
                                    const margemFabPct = Math.round((margemFabMk - 1) * 100);
                                    // Margem comprados: média ponderada mk_ferragens, mk_acessorios
                                    const compMks = [
                                        [taxas.mk_ferragens ?? 1.15, bd.ferrVal || 0],
                                        [taxas.mk_acessorios ?? 1.20, bd.acessVal || 0],
                                    ];
                                    const compPeso = compMks.reduce((s, [, p]) => s + p, 0);
                                    const margemCompMk = compPeso > 0 ? compMks.reduce((s, [mk, p]) => s + mk * p, 0) / compPeso : (taxas.mk_ferragens ?? 1.15);
                                    const margemCompPct = Math.round((margemCompMk - 1) * 100);
                                    const mdoPct = Math.round((taxas.mk_mdo ?? 0.80) * 100);
                                    // Valores em R$ para contexto
                                    const fabTotal = (bd.chapasAdj || 0) + (bd.fitaAdj || 0) + (bd.acabAdj || 0);
                                    const compTotal = (bd.ferrVal || 0) + (bd.acessVal || 0);
                                    const fabMargemR = fabTotal * (margemFabMk - 1);
                                    const compMargemR = compTotal * (margemCompMk - 1);
                                    // Taxas sobre PV
                                    const totalTaxasPct = (taxas.imp || 0) + (taxas.com || 0) + (taxas.lucro || 0) + (taxas.inst ?? 5) + (taxas.frete || 0) + (taxas.mont || 0);
                                    // Setters
                                    const setMargemFab = (pct) => {
                                        const mk = 1 + (pct / 100);
                                        setTaxa('mk_chapas', mk); setTaxa('mk_fita', mk); setTaxa('mk_acabamentos', mk);
                                    };
                                    const setMargemComp = (pct) => {
                                        const mk = 1 + (pct / 100);
                                        setTaxa('mk_ferragens', mk); setTaxa('mk_acessorios', mk);
                                    };
                                    const setMdoPct = (pct) => setTaxa('mk_mdo', pct / 100);
                                    const coefMedioVal = tot.itemCostList ? (() => {
                                        const fab = (tot.itemCostList || []).filter(i => i.coef > 0);
                                        const totalCusto = fab.reduce((s, i) => s + i.custoItem, 0);
                                        return totalCusto > 0 ? fab.reduce((s, i) => s + i.coef * i.custoItem, 0) / totalCusto : 0;
                                    })() : 0;

                                    return (<>
                                        {/* ── Presets rápidos ── */}
                                        <div className="flex gap-1 mb-2">
                                            {[
                                                { label: 'Competitivo', fab: 25, comp: 15, lucro: 8, cor: 'var(--info)' },
                                                { label: 'Padrão', fab: 45, comp: 20, lucro: 12, cor: 'var(--success)' },
                                                { label: 'Premium', fab: 65, comp: 30, lucro: 18, cor: 'var(--warning)' },
                                            ].map(p => {
                                                const isActive = Math.abs(margemFabPct - p.fab) < 5 && Math.abs(margemCompPct - p.comp) < 5;
                                                return (
                                                    <button key={p.label} onClick={() => {
                                                        if (isActive) return;
                                                        setNovoConfirm({ msg: `Aplicar preset "${p.label}"?\nFabricados: ${p.fab}% · Comprados: ${p.comp}% · Lucro: ${p.lucro}%`, onOk: () => { setMargemFab(p.fab); setMargemComp(p.comp); setTaxa('lucro', p.lucro); } });
                                                    }}
                                                        className="flex-1 py-1.5 rounded text-[9px] font-bold transition-all"
                                                        style={isActive
                                                            ? { background: `${p.cor}20`, color: p.cor, border: `1.5px solid ${p.cor}` }
                                                            : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                                                        }>
                                                        {p.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Margem Fabricados */}
                                        <div className="rounded-lg px-3 py-2 mb-1.5" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>Fabricados</span>
                                                    <span className="text-[8px] block" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>chapas, fita, acabamento</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input type="range" min="10" max="100" step="5"
                                                        value={margemFabPct}
                                                        onChange={e => setMargemFab(+e.target.value)}
                                                        className="w-16 h-1.5 accent-[var(--primary)]"
                                                        style={{ cursor: 'pointer' }} />
                                                    <input type="number" step="5" min="0" max="500"
                                                        value={margemFabPct} onChange={e => setMargemFab(+e.target.value || 0)}
                                                        className="w-12 text-xs px-1 py-0.5 rounded border text-center input-glass font-bold" />
                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>%</span>
                                                </div>
                                            </div>
                                            {fabMargemR > 0 && <div className="text-[8px] text-right mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>+{R$(fabMargemR)} sobre {R$(fabTotal)}</div>}
                                        </div>

                                        {/* Margem Comprados */}
                                        <div className="rounded-lg px-3 py-2 mb-2" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>Comprados</span>
                                                    <span className="text-[8px] block" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>ferragens, acessórios</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input type="range" min="5" max="80" step="5"
                                                        value={margemCompPct}
                                                        onChange={e => setMargemComp(+e.target.value)}
                                                        className="w-16 h-1.5 accent-[var(--primary)]"
                                                        style={{ cursor: 'pointer' }} />
                                                    <input type="number" step="5" min="0" max="500"
                                                        value={margemCompPct} onChange={e => setMargemComp(+e.target.value || 0)}
                                                        className="w-12 text-xs px-1 py-0.5 rounded border text-center input-glass font-bold" />
                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>%</span>
                                                </div>
                                            </div>
                                            {compMargemR > 0 && <div className="text-[8px] text-right mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>+{R$(compMargemR)} sobre {R$(compTotal)}</div>}
                                        </div>

                                        {/* MDO — só mostra input manual se custo-hora NÃO está ativo */}
                                        {temCustoHora ? (
                                            <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                                                <div>
                                                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>MDO (custo-hora)</span>
                                                </div>
                                                <span className="text-[11px] font-semibold" style={{ color: 'var(--success)' }}>{R$(mdoVal)}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                                                <div>
                                                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Mão de Obra</span>
                                                    {mdoVal > 0 && <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{R$(mdoVal)}</span>}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <input type="number" step="5" min="0" max="500"
                                                        value={mdoPct} onChange={e => setMdoPct(+e.target.value || 0)}
                                                        className="w-12 text-xs px-1 py-0.5 rounded border text-center input-glass" />
                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>%</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Taxas essenciais */}
                                        {[['Impostos', 'imp'], ['Comissão', 'com'], ['Lucro', 'lucro']].map(([l, k]) => (
                                            <div key={k} className="flex items-center justify-between gap-2 mb-1 px-1">
                                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{l}</span>
                                                <div className="flex items-center gap-1">
                                                    <input type="number" step="0.5" value={taxas[k]} onChange={e => setTaxa(k, e.target.value)}
                                                        className="w-12 text-xs px-1 py-0.5 rounded border text-center input-glass" />
                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>%</span>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Coef médio (info) */}
                                        {coefMedioVal > 0 && (
                                            <div className="flex justify-between text-[10px] mt-1 pt-1 px-1" style={{ borderTop: '1px dashed var(--border)' }}>
                                                <span style={{ color: 'var(--text-muted)' }} title="Média ponderada do coeficiente de dificuldade dos módulos. Acresce sobre o custo de material.">Dificuldade média <span style={{ opacity: 0.5 }}>(sobre material)</span></span>
                                                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>+{(coefMedioVal * 100).toFixed(0)}%</span>
                                            </div>
                                        )}

                                        {/* ── Modo Avançado (expandível) ── */}
                                        <div className="mt-2">
                                            <button onClick={() => setMkExpanded(!mkExpanded)}
                                                className="flex items-center gap-1 cursor-pointer text-[9px] w-full" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                                                <span>{mkExpanded ? '▾' : '▸'}</span>
                                                <span>Ajuste fino</span>
                                            </button>
                                            {mkExpanded && (
                                                <div className="mt-2 flex flex-col gap-3 ml-1 pl-2" style={{ borderLeft: '2px solid var(--border)' }}>
                                                    {/* Markups por categoria */}
                                                    <div>
                                                        <div className="text-[8px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Margens por categoria</div>
                                                        {[
                                                            ['Chapas (MDF/MDP)', 'mk_chapas'],
                                                            ['Fita de Borda', 'mk_fita'],
                                                            ['Acabamentos', 'mk_acabamentos'],
                                                            ['Ferragens', 'mk_ferragens'],
                                                            ['Acessórios', 'mk_acessorios'],
                                                            ...(!temCustoHora ? [['Fator MDO', 'mk_mdo']] : []),
                                                        ].map(([l, k]) => (
                                                            <div key={k} className="flex items-center justify-between gap-2 mb-0.5">
                                                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{l}</span>
                                                                <div className="flex items-center gap-1">
                                                                    <input type="number" step="0.05" min="0.1" value={taxas[k]}
                                                                        onChange={e => setTaxa(k, e.target.value)}
                                                                        className="w-14 text-[10px] px-1.5 py-0.5 rounded border text-center input-glass" />
                                                                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>×</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {/* Todas as taxas sobre PV */}
                                                    <div>
                                                        <div className="text-[8px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Taxas sobre PV</div>
                                                        {[['Impostos', 'imp'], ['Comissão', 'com'], ['Lucro', 'lucro'], ['Instalação', 'inst'], ['Frete', 'frete'], ['Montagem', 'mont']].map(([l, k]) => (
                                                            <div key={k} className="flex items-center justify-between gap-2 mb-0.5">
                                                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{l}</span>
                                                                <div className="flex items-center gap-1">
                                                                    <input type="number" step="0.5" value={taxas[k]} onChange={e => setTaxa(k, e.target.value)}
                                                                        className="w-14 text-[10px] px-1.5 py-0.5 rounded border text-center input-glass" />
                                                                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>%</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        <div className="flex justify-between pt-1 mt-1 font-semibold text-[10px]" style={{ borderTop: '1px solid var(--border)' }}>
                                                            <span style={{ color: 'var(--text-muted)' }}>Σ Taxas</span>
                                                            <span className={totalTaxasPct >= 100 ? 'text-red-500' : ''} style={totalTaxasPct < 100 ? { color: 'var(--text-secondary)' } : {}}>
                                                                {totalTaxasPct.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>);
                                })()}
                            </div>

                            {/* Padrões de Ferragens — substituição global */}
                            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="text-[9px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>PADRÕES DE FERRAGENS</div>
                                {[
                                    ['Corrediças',    'corredica',   FERR_GROUPS.corredica],
                                    ['Dobradiças',    'dobradica',   FERR_GROUPS.dobradica],
                                    ['Articuladores', 'articulador', FERR_GROUPS.articulador],
                                ].map(([label, grp, cat]) => {
                                    const opts = ferragensDB.filter(f => f.categoria?.toLowerCase() === cat.toLowerCase());
                                    return (
                                        <div key={grp} className="flex items-center justify-between gap-2 mb-1.5">
                                            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
                                            <select
                                                value={padroes[grp] || ''}
                                                onChange={e => setPadroes(p => ({ ...p, [grp]: e.target.value }))}
                                                className="text-[10px] px-1.5 py-0.5 rounded border input-glass"
                                                style={{ maxWidth: 150 }}>
                                                <option value="">Padrão</option>
                                                {opts.map(f => (
                                                    <option key={f.id} value={f.id}>{f.nome}</option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ── Custo-Hora (Fase 1) ── */}
                            {tot.custoHoraResult && tot.custoHoraResult.custoMdo > 0 && (
                                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                    <button className="flex items-center justify-between w-full mb-1 cursor-pointer" onClick={() => setCustoHExp(p => !p)}>
                                        <span className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)' }}>MÃO DE OBRA (custo-hora)</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-semibold" style={{ color: 'var(--primary)' }}>{R$(tot.custoHoraResult.custoMdo)}</span>
                                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{custoHExp ? '▴' : '▾'}</span>
                                        </div>
                                    </button>
                                    {custoHExp && (
                                        <div className="flex flex-col gap-0.5 text-[10px] mt-1.5">
                                            {[
                                                ['Corte CNC', tot.custoHoraResult.breakdown.hCorte, `${tot.totNPecas} pçs`],
                                                ['Fita de borda', tot.custoHoraResult.breakdown.hFita, `${N(tot.ft, 0)}m`],
                                                ['Furação', tot.custoHoraResult.breakdown.hFuracao, `${tot.totNFerragens} pts`],
                                                ['Montagem', tot.custoHoraResult.breakdown.hMontagem, `${tot.totNCaixas}cx`],
                                                ['Acabamento', tot.custoHoraResult.breakdown.hAcabamento, `${N(tot.at * 0.6, 1)}m²`],
                                                ['Embalagem', tot.custoHoraResult.breakdown.hEmbalagem, `${tot.totNModulos} mod`],
                                                ['Instalação', tot.custoHoraResult.breakdown.hInstalacao, `${tot.totNModulos} mod`],
                                            ].filter(([, h]) => h > 0).map(([l, h, info]) => (
                                                <div key={l} className="flex justify-between">
                                                    <span style={{ color: 'var(--text-muted)' }}>{l} <span className="opacity-40">({info})</span></span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{N(h, 1)}h</span>
                                                </div>
                                            ))}
                                            <div className="text-[9px] mt-1 pt-1 text-right" style={{ borderTop: '1px dashed var(--border)', color: 'var(--text-muted)', opacity: 0.7 }}>
                                                {N(tot.custoHoraResult.horasTotal, 1)}h × {R$(tot.custoHoraResult.custoHora)}/h
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Consumíveis (Fase 2) ── */}
                            {tot.consumiveisResult && tot.totConsumiveis > 0 && (
                                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                    <button className="flex items-center justify-between w-full mb-1 cursor-pointer" onClick={() => setConsumExp(p => !p)}>
                                        <span className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)' }}>CONSUMÍVEIS</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-semibold" style={{ color: 'var(--primary)' }}>{R$(tot.totConsumiveis)}</span>
                                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{consumExp ? '▴' : '▾'}</span>
                                        </div>
                                    </button>
                                    {consumExp && (
                                        <div className="flex flex-col gap-0.5 text-[10px] mt-1.5">
                                            {[
                                                ['Cola', tot.consumiveisResult.breakdown.cola],
                                                ['Minifix/Cavilha', tot.consumiveisResult.breakdown.minifix],
                                                ['Parafusos', tot.consumiveisResult.breakdown.parafusos],
                                                ['Lixa/Abrasivo', tot.consumiveisResult.breakdown.lixa],
                                                ['Embalagem', tot.consumiveisResult.breakdown.embalagem],
                                            ].filter(([, v]) => v > 0).map(([l, v]) => (
                                                <div key={l} className="flex justify-between">
                                                    <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{R$(v)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Preço final */}
                            <div className="mt-4 pt-3" style={{ borderTop: '2px solid var(--primary)' }}>
                                <div className="flex justify-between items-baseline">
                                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>PREÇO VENDA</span>
                                    <div className="text-right">
                                        <span className="font-bold text-lg" style={{ color: tot.pvErro ? 'var(--danger)' : 'var(--primary)' }}>{R$(pvComDesconto)}</span>
                                        {tot.pvErro && <div className="flex items-center gap-1 text-[9px] mt-0.5" style={{ color: 'var(--danger)' }}><AlertTriangle size={10} /> {tot.pvMsg}</div>}
                                        {tot.totalAjustes !== 0 && (
                                            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                Base: {R$(tot.pv)}&nbsp;
                                                <span style={{ color: tot.totalAjustes > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                                                    {tot.totalAjustes > 0 ? '+' : ''}{R$(tot.totalAjustes)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Piso — preço mínimo (custo real + impostos obrigatórios) */}
                                {tot.pisoMinimo > 0 && pvComDesconto > 0 && (() => {
                                    const abaixoPiso = pvComDesconto < tot.pisoMinimo;
                                    const folga = pvComDesconto - tot.pisoMinimo;
                                    const folgaPct = tot.pisoMinimo > 0 ? (folga / tot.pisoMinimo * 100) : 0;
                                    return (
                                        <div className="mt-1.5 rounded px-2.5 py-1.5 flex items-center justify-between"
                                            style={{ background: abaixoPiso ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.06)', border: `1px solid ${abaixoPiso ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.15)'}` }}>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-semibold" style={{ color: abaixoPiso ? 'var(--danger)' : 'var(--success)' }}>
                                                    {abaixoPiso ? 'ABAIXO DO PISO' : 'Piso (custo real)'}
                                                </span>
                                                <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
                                                    material + MDO + impostos
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-bold" style={{ color: abaixoPiso ? 'var(--danger)' : 'var(--text-secondary)' }}>{R$(tot.pisoMinimo)}</span>
                                                <span className="text-[8px] block" style={{ color: abaixoPiso ? 'var(--danger)' : 'var(--success)' }}>
                                                    {folga >= 0 ? '+' : ''}{R$(folga)} ({folga >= 0 ? '+' : ''}{N(folgaPct, 0)}%)
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                                {descontoR > 0 && (
                                    <div className="mt-1.5 text-[10px] flex justify-between items-center px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--text-muted)' }}>
                                        <span>Antes do desconto:</span>
                                        <span style={{ textDecoration: 'line-through' }}>{R$(tot.pvFinal)}</span>
                                    </div>
                                )}
                                {pagamento.blocos.length > 0 && (
                                    <div className="mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        <span className={Math.abs(somaBlocos - 100) < 0.01 ? 'text-green-400' : 'text-red-400'}>
                                            Parcelas: {N(somaBlocos, 0)}% {Math.abs(somaBlocos - 100) < 0.01 ? 'OK' : '≠ 100%'}
                                        </span>
                                    </div>
                                )}

                                {/* ── Diagnóstico de Preço ── */}
                                {pvComDesconto > 0 && tot.cmCalculado > 0 && (() => {
                                    const pv = pvComDesconto;
                                    // Usar apenas custo material calculado (sem avulso/manual) para métricas reais
                                    const pvCalc = pv - (tot.manualTotal || 0); // PV só dos itens calculados
                                    const custoMat = tot.cmCalculado || 0;
                                    const cp = tot.cb || 0;
                                    const mult = custoMat > 0 ? pvCalc / custoMat : 0;
                                    const lucroPerc = taxas.lucro || 0;
                                    const lucroR = pvCalc * (lucroPerc / 100);
                                    const totalTaxasPerc = (taxas.imp || 0) + (taxas.com || 0) + (taxas.lucro || 0) + (taxas.inst ?? 5) + (taxas.frete || 0) + (taxas.mont || 0);
                                    const taxasR = pvCalc * (totalTaxasPerc / 100);
                                    const margemBrutaR = pvCalc - custoMat;
                                    const margemBrutaPct = pvCalc > 0 ? (margemBrutaR / pvCalc * 100) : 0;
                                    // Indicador: movelaria sob medida tipicamente 2.5× a 3.5×
                                    const faixa = mult < 2.2 ? 'baixo' : mult <= 3.5 ? 'saudavel' : 'alto';
                                    const faixaCor = faixa === 'baixo' ? 'var(--danger)' : faixa === 'saudavel' ? 'var(--success)' : 'var(--warning)';
                                    const faixaLabel = faixa === 'baixo' ? 'Abaixo do mercado' : faixa === 'saudavel' ? 'Faixa saudável' : 'Acima do mercado';
                                    // Barra visual: posição do multiplicador entre 1× e 5×
                                    const barPos = Math.min(100, Math.max(0, ((mult - 1) / 4) * 100));
                                    // PV por m² de área (se tiver área) — usa pvCalc (sem avulso)
                                    const pvM2 = tot.at > 0 ? pvCalc / tot.at : null;

                                    return (
                                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                            {/* Header colapsável */}
                                            <button className="flex items-center justify-between w-full mb-2 cursor-pointer" onClick={() => setDiagExp(p => !p)}>
                                                <span className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)' }}>DIAGNÓSTICO DE PREÇO</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${faixaCor}15`, color: faixaCor }}>{N(mult, 2)}× {faixaLabel}</span>
                                                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{diagExp ? '▴' : '▾'}</span>
                                                </div>
                                            </button>

                                            {diagExp && (<>
                                                {/* Multiplicador — barra visual */}
                                                <div className="rounded-lg px-3 py-2.5 mb-2" style={{ background: 'var(--bg-muted)', border: `1px solid ${faixaCor}30` }}>
                                                    <div className="relative h-2 rounded-full mb-1" style={{ background: 'var(--bg-card)' }}>
                                                        <div className="absolute h-full rounded-full" style={{ left: '37.5%', width: '25%', background: 'var(--success-bg)' }} />
                                                        <div className="absolute h-3 w-1.5 rounded-full" style={{ left: `${barPos}%`, top: '-2px', background: faixaCor, transform: 'translateX(-50%)' }} />
                                                    </div>
                                                    <div className="flex justify-between text-[8px]" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                                                        <span>1×</span><span>2.5×</span><span>3.5×</span><span>5×</span>
                                                    </div>
                                                </div>

                                                {/* Resumo financeiro rápido */}
                                                <div className="flex flex-col gap-1 text-[10px]">
                                                    <div className="flex justify-between">
                                                        <span style={{ color: 'var(--text-muted)' }}>Custo material</span>
                                                        <span style={{ color: 'var(--text-secondary)' }}>{R$(custoMat)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span style={{ color: 'var(--text-muted)' }}>Custo produção</span>
                                                        <span style={{ color: 'var(--text-secondary)' }}>{R$(cp)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span style={{ color: 'var(--text-muted)' }}>Taxas sobre PV ({N(totalTaxasPerc, 1)}%)</span>
                                                        <span style={{ color: 'var(--text-secondary)' }}>{R$(taxasR)}</span>
                                                    </div>
                                                    <div className="flex justify-between pt-1 mt-0.5" style={{ borderTop: '1px dashed var(--border)' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>Margem bruta</span>
                                                        <span className="font-semibold" style={{ color: margemBrutaPct > 40 ? 'var(--success)' : margemBrutaPct > 25 ? 'var(--warning)' : 'var(--danger)' }}>
                                                            {R$(margemBrutaR)} ({N(margemBrutaPct, 1)}%)
                                                        </span>
                                                    </div>
                                                    {lucroR > 0 && (
                                                        <div className="flex justify-between">
                                                            <span style={{ color: 'var(--text-muted)' }}>Lucro líquido ({lucroPerc}%)</span>
                                                            <span className="font-semibold" style={{ color: 'var(--success)' }}>{R$(lucroR)}</span>
                                                        </div>
                                                    )}
                                                    {/* Métricas de referência */}
                                                    {(pvM2 || tot.ft > 0 || Object.values(tot.ca || {}).length > 0) && (
                                                        <div className="mt-1 pt-1 flex flex-col gap-0.5" style={{ borderTop: '1px dashed var(--border)' }}>
                                                            {pvM2 && <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>PV/m² chapa</span><span style={{ color: 'var(--text-secondary)' }}>{R$(pvM2)}/m²</span></div>}
                                                            {tot.ft > 0 && <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>PV/metro linear</span><span style={{ color: 'var(--text-secondary)' }}>{R$(pvCalc / tot.ft)}/ml</span></div>}
                                                            {Object.values(tot.ca || {}).length > 0 && <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Chapas</span><span style={{ color: 'var(--text-secondary)' }}>{Object.values(tot.ca).reduce((s, c) => s + (c.n || 0), 0)} un</span></div>}
                                                        </div>
                                                    )}
                                                    {/* Dica contextual */}
                                                    <div className="mt-1.5 rounded px-2 py-1.5 text-[9px] leading-relaxed" style={{ background: `${faixaCor}08`, border: `1px solid ${faixaCor}15`, color: 'var(--text-muted)' }}>
                                                        {faixa === 'baixo' && 'Preço abaixo da média. Verifique se as margens cobrem custos fixos.'}
                                                        {faixa === 'saudavel' && 'Faixa saudável de mercado (2.5× a 3.5× sobre material).'}
                                                        {faixa === 'alto' && 'Acima da média — justificável para alto padrão ou alta complexidade.'}
                                                        {(tot.manualTotal || 0) > 0 && <span className="block mt-0.5 opacity-70">Itens manuais ({R$(tot.manualTotal)}) excluídos.</span>}
                                                    </div>
                                                </div>
                                            </>)}
                                        </div>
                                    );
                                })()}

                                {/* ── Prazo de Execução (interno) ── */}
                                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)' }}>PRAZO EXECUÇÃO</span>
                                        {prazoExecucao === null && <span className="text-[8px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>auto: {sugestaoPrazo}d</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <input type="number" min="1" value={prazoExecucao ?? ''} onChange={e => setPrazoExecucao(e.target.value ? parseInt(e.target.value) : null)} placeholder={String(sugestaoPrazo)} className="w-16 text-xs px-1.5 py-0.5 rounded border text-center input-glass" disabled={readOnly} />
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>dias úteis</span>
                                    </div>
                                </div>

                                {/* ── Composição do Preço ── */}
                                {pvComDesconto > 0 && (() => {
                                    const pv = pvComDesconto;
                                    const bd = tot.breakdown || {};
                                    const matRaw = (bd.chapasAdj || 0) + (bd.fitaAdj || 0) + (bd.acabAdj || 0) + (bd.ferrVal || 0) + (bd.acessVal || 0) + (bd.consumiveisVal || 0);
                                    const matMk = (bd.pvChapas || 0) + (bd.pvFita || 0) + (bd.pvAcab || 0) + (bd.pvFerr || 0) + (bd.pvAcess || 0) + (bd.consumiveisVal || 0);
                                    const custOp = matMk - matRaw;
                                    const mdo = bd.mdo || tot.custoMdo || 0;
                                    const cpVal = tot.cb || 0;
                                    const impR = pv * ((taxas.imp || 0) / 100);
                                    const comR = pv * ((taxas.com || 0) / 100);
                                    const lucroR = pv * ((taxas.lucro || 0) / 100);
                                    const instR = pv * ((taxas.inst ?? 5) / 100);
                                    const freteR = pv * ((taxas.frete || 0) / 100);
                                    const montR = pv * ((taxas.mont || 0) / 100);
                                    const pct = (v) => pv > 0 ? (v / pv * 100).toFixed(1) : '0.0';
                                    const bar = (v, cor) => (
                                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(2, v / pv * 100))}%`, background: cor, transition: 'width 0.3s' }} />
                                    );
                                    const matChapas = bd.chapasAdj || 0;
                                    const matFita = bd.fitaAdj || 0;
                                    const matFerr = bd.ferrVal || 0;
                                    const matAcab = bd.acabAdj || 0;
                                    const matAcess = bd.acessVal || 0;

                                    return (
                                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                            <button onClick={() => setCompExpanded(!compExpanded)}
                                                className="flex items-center justify-between w-full cursor-pointer">
                                                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Composição do Preço</span>
                                                <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: compExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                            </button>
                                            {compExpanded && (
                                                <div className="mt-2 flex flex-col gap-2">
                                                    {/* Material (custo real) */}
                                                    <div>
                                                        <div className="flex justify-between items-center mb-0.5">
                                                            <span className="text-[10px] font-semibold" style={{ color: 'var(--primary)' }}>Material</span>
                                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{R$(matRaw)} <span className="font-semibold" style={{ color: 'var(--primary)' }}>{pct(matRaw)}%</span></span>
                                                        </div>
                                                        <div className="w-full rounded-full h-1.5" style={{ background: 'var(--bg-muted)' }}>{bar(matRaw, 'var(--primary)')}</div>
                                                        {/* Sub-detalhamento material */}
                                                        <div className="mt-1 ml-2 flex flex-col gap-0.5">
                                                            {[[matChapas, 'Chapas'], [matFita, 'Fita'], [matFerr, 'Ferragens'], [matAcab, 'Acabamentos'], [matAcess, 'Acessórios']].filter(([v]) => v > 0).map(([v, l]) => (
                                                                <div key={l} className="flex justify-between text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                                                    <span>{l}</span>
                                                                    <span>{R$(v)}</span>
                                                                </div>
                                                            ))}
                                                            {tot.chapasEconomia > 0 && (
                                                                <div className="flex justify-between text-[9px] mt-0.5 pt-0.5" style={{ borderTop: '1px dashed var(--border)', color: 'var(--success)' }}>
                                                                    <span>Otimização de chapas ({N(tot.chapasFrac, 1)} de {tot.chapasInteiras})</span>
                                                                    <span>-{R$(tot.chapasEconomia)}</span>
                                                                </div>
                                                            )}
                                                            {/* Fase 3: Estimativa de corte real */}
                                                            {tot.corteReal && tot.corteReal.totalReal > 0 && tot.corteReal.totalReal !== tot.corteReal.totalFrac && (
                                                                <div className="flex justify-between text-[9px] mt-0.5 pt-0.5" style={{ borderTop: '1px dashed var(--border)', color: tot.corteReal.totalReal > tot.corteReal.totalFrac ? 'var(--danger)' : 'var(--success)' }}>
                                                                    <span>Corte real (FFD): {tot.corteReal.totalReal} chapas</span>
                                                                    <span>{tot.corteReal.totalReal > tot.corteReal.totalFrac ? '+' : ''}{tot.corteReal.totalReal - tot.corteReal.totalFrac} vs fração</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Mão de Obra */}
                                                    <div>
                                                        <div className="flex justify-between items-center mb-0.5">
                                                            <span className="text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>Mão de Obra</span>
                                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{R$(mdo)} <span className="font-semibold" style={{ color: 'var(--muted)' }}>{pct(mdo)}%</span></span>
                                                        </div>
                                                        <div className="w-full rounded-full h-1.5" style={{ background: 'var(--bg-muted)' }}>{bar(mdo, 'var(--muted)')}</div>
                                                    </div>

                                                    {/* Custos Operacionais */}
                                                    {custOp > 0 && (
                                                        <div>
                                                            <div className="flex justify-between items-center mb-0.5">
                                                                <span className="text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>Custos Operacionais</span>
                                                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{R$(custOp)} <span className="font-semibold" style={{ color: 'var(--muted)' }}>{pct(custOp)}%</span></span>
                                                            </div>
                                                            <div className="w-full rounded-full h-1.5" style={{ background: 'var(--bg-muted)' }}>{bar(custOp, 'var(--muted)')}</div>
                                                        </div>
                                                    )}

                                                    {/* Subtotal CP */}
                                                    <div className="flex justify-between items-center py-1 px-2 rounded" style={{ background: 'var(--bg-muted)' }}>
                                                        <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>Custo Produção</span>
                                                        <span className="text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>{R$(cpVal)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{pct(cpVal)}%</span></span>
                                                    </div>

                                                    {/* Taxas individuais */}
                                                    {[[impR, 'Impostos', '#B86565', taxas.imp], [comR, 'Comissão', '#C4924C', taxas.com], [lucroR, 'Lucro', '#5B8C6B', taxas.lucro], [instR, 'Instalação', 'var(--muted)', taxas.inst ?? 5], [freteR, 'Frete', 'var(--muted)', taxas.frete], [montR, 'Montagem', 'var(--muted)', taxas.mont]].filter(([v,,,t]) => t > 0).map(([v, l, cor, t]) => (
                                                        <div key={l}>
                                                            <div className="flex justify-between items-center mb-0.5">
                                                                <span className="text-[10px] font-semibold" style={{ color: cor }}>{l} ({N(t,1)}%)</span>
                                                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{R$(v)} <span className="font-semibold" style={{ color: cor }}>{pct(v)}%</span></span>
                                                            </div>
                                                            <div className="w-full rounded-full h-1.5" style={{ background: 'var(--bg-muted)' }}>{bar(v, cor)}</div>
                                                        </div>
                                                    ))}

                                                    {/* Total = PV */}
                                                    <div className="flex justify-between items-center py-1.5 px-2 rounded-md mt-1" style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.06))', border: '1px solid var(--primary-ring, rgba(19,121,240,0.15))' }}>
                                                        <span className="text-[11px] font-bold" style={{ color: 'var(--primary)' }}>PREÇO VENDA</span>
                                                        <span className="text-[11px] font-bold" style={{ color: 'var(--primary)' }}>{R$(pv)} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>100%</span></span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* ── Painel Comparativo: Centro de Custo ── */}
                                {(() => {
                                    let ccLinhas = [];
                                    try { ccLinhas = JSON.parse(globalTaxas.centro_custo_json || '[]'); } catch { ccLinhas = []; }
                                    const ccDiasUteis = globalTaxas.centro_custo_dias_uteis || 22;
                                    const ccTotalMensal = ccLinhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
                                    const ccCustoDia = ccDiasUteis > 0 ? ccTotalMensal / ccDiasUteis : 0;
                                    if (ccTotalMensal === 0) return null;

                                    const prazo = prazoExecEfetivo;
                                    const custoFixoProjeto = ccCustoDia * prazo;
                                    const custoMaterialPuro = tot.cm || 0;
                                    const refCentroCusto = custoFixoProjeto + custoMaterialPuro;
                                    const pvAtual = pvComDesconto;
                                    const diff = pvAtual - refCentroCusto;
                                    const diffPct = refCentroCusto > 0 ? ((diff / refCentroCusto) * 100) : 0;
                                    const abaixo = diff < 0;
                                    const maxVal = Math.max(pvAtual, refCentroCusto, 1);

                                    return (
                                        <div className="mt-3 pt-3" style={{ borderTop: '2px dashed var(--border)' }}>
                                            <div className="text-[9px] font-semibold mb-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                                                <BarChart3 size={10} /> REFERÊNCIA CENTRO DE CUSTO
                                            </div>

                                            <div className="flex flex-col gap-1 text-[10px]">
                                                <div className="flex justify-between">
                                                    <span style={{ color: 'var(--text-muted)' }}>Custo fixo ({prazo}d × R$ {ccCustoDia.toFixed(0)}/dia)</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{R$(custoFixoProjeto)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span style={{ color: 'var(--text-muted)' }}>Material</span>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{R$(custoMaterialPuro)}</span>
                                                </div>
                                                <div className="flex justify-between pt-1 mt-1 font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
                                                    <span style={{ color: 'var(--text-secondary)' }}>Ref. Centro Custo</span>
                                                    <span style={{ color: 'var(--muted)' }}>{R$(refCentroCusto)}</span>
                                                </div>
                                            </div>

                                            {/* Comparison bars */}
                                            <div className="mt-3 flex flex-col gap-1.5">
                                                <div>
                                                    <div className="flex justify-between text-[9px] mb-0.5">
                                                        <span style={{ color: 'var(--primary)' }}>PV Markup</span>
                                                        <span className="font-bold" style={{ color: 'var(--primary)' }}>{R$(pvAtual)}</span>
                                                    </div>
                                                    <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg-muted)' }}>
                                                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (pvAtual / maxVal) * 100)}%`, background: 'var(--primary)', transition: 'width 0.3s' }} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-[9px] mb-0.5">
                                                        <span style={{ color: 'var(--muted)' }}>Ref. Centro Custo</span>
                                                        <span className="font-bold" style={{ color: 'var(--muted)' }}>{R$(refCentroCusto)}</span>
                                                    </div>
                                                    <div className="w-full h-2 rounded-full" style={{ background: 'var(--bg-muted)' }}>
                                                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (refCentroCusto / maxVal) * 100)}%`, background: 'var(--muted)', transition: 'width 0.3s' }} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Difference indicator */}
                                            <div className="mt-2 p-2 rounded-lg text-center text-[10px] font-bold" style={{
                                                background: abaixo ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                                                color: abaixo ? 'var(--danger)' : 'var(--success)',
                                                border: `1px solid ${abaixo ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'}`,
                                            }}>
                                                {abaixo
                                                    ? <><AlertTriangle size={10} className="inline mr-1" />PV está {R$(Math.abs(diff))} ABAIXO da referência ({diffPct.toFixed(0)}%)</>
                                                    : <>PV está +{R$(diff)} acima da referência (+{diffPct.toFixed(0)}%)</>
                                                }
                                            </div>

                                            <p className="text-[8px] mt-1.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                                                Referência informativa. Não altera o preço de venda.
                                            </p>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="p-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                            {editOrc?.id && PRE_APPROVE_COLS.includes(editOrc.kb_col) && (
                                <button
                                    onClick={() => setShowAprovarModal(true)}
                                    className="w-full py-2.5 text-xs font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                                    style={{ background: 'var(--success-hover)', color: '#fff', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}
                                >
                                    <CheckCircle size={14} /> Aprovar Orçamento
                                </button>
                            )}
                            {!readOnly && (
                                <>
                                    <button onClick={salvar} className={`${Z.btn} w-full py-2.5 text-xs`}>Salvar Orçamento</button>
                                    {editOrc?.id && saveStatus !== 'idle' && (
                                        <div className="text-center text-[10px] font-medium flex items-center justify-center gap-1 mt-1" style={{
                                            color: saveStatus === 'saved' ? 'var(--success)' : saveStatus === 'saving' ? 'var(--warning)' : saveStatus === 'error' ? 'var(--danger)' : 'var(--text-muted)',
                                        }}>
                                            {saveStatus === 'saved' && <><CheckCircle size={10} /> Salvo automaticamente</>}
                                            {saveStatus === 'saving' && <><RefreshCw size={10} className="animate-spin" /> Salvando...</>}
                                            {saveStatus === 'dirty' && <><Clock size={10} /> Alterações não salvas</>}
                                            {saveStatus === 'error' && <><AlertTriangle size={10} /> Erro ao salvar</>}
                                        </div>
                                    )}
                                </>
                            )}
                            <button onClick={async () => {
                                if (pagamento.blocos.length === 0) {
                                    notify('Defina as condições de pagamento antes de gerar a proposta');
                                    return;
                                }
                                if (!empresa) {
                                    try { const emp = await api.get('/config/empresa'); setEmpresa(emp); } catch { }
                                }
                                setPropostaModal(true);
                            }} className={`${Z.btn2} w-full py-2 text-xs`}><FileText size={13} /> Gerar Proposta</button>
                            <button onClick={async () => {
                                if (pagamento.blocos.length === 0) {
                                    notify('Defina as condições de pagamento antes de gerar o contrato');
                                    return;
                                }
                                try {
                                    notify('Gerando Contrato...');
                                    let emp = empresa;
                                    if (!emp) {
                                        emp = await api.get('/config/empresa');
                                        setEmpresa(emp);
                                    }
                                    const cl = clis.find(c => c.id === parseInt(cid));
                                    // Gerar proposta HTML para anexo do contrato
                                    const propHtml = buildPropostaHtml({
                                        empresa: emp, cliente: cl,
                                        orcamento: { numero, projeto, obs },
                                        ambientes, tot, taxas, pagamento, pvComDesconto, bib, padroes,
                                        nivel: 'ambiente', prazoEntrega, enderecoObra, validadeProposta,
                                    });
                                    const html = buildContratoHtml({
                                        empresa: emp, cliente: cl,
                                        orcamento: { numero, projeto, validadeProposta },
                                        ambientes, pagamento, pvComDesconto,
                                        template: emp?.contrato_template || '',
                                        prazoEntrega, enderecoObra,
                                        propostaHtml: propHtml,
                                    });
                                    const blob = await api.postBlob('/pdf/generate', { html });
                                    window.open(URL.createObjectURL(blob), '_blank');
                                } catch (ex) { notify(ex.detail || ex.error || 'Erro ao gerar contrato'); }
                            }} className={`${Z.btn2} w-full py-2 text-xs`}><FileSignature size={13} /> Gerar Contrato (PDF)</button>
                            <button onClick={async () => {
                                if (!editOrc?.id) { notify('Salve o orçamento antes de enviar para assinatura'); return; }
                                if (pagamento.blocos.length === 0) { notify('Defina as condições de pagamento antes de gerar o contrato'); return; }
                                try {
                                    notify('Gerando contrato para assinatura...');
                                    let emp = empresa;
                                    if (!emp) { emp = await api.get('/config/empresa'); setEmpresa(emp); }
                                    const cl = clis.find(c => c.id === parseInt(cid));
                                    if (!cl?.cpf) { notify('Cadastre o CPF do cliente antes de enviar para assinatura'); return; }
                                    const propHtml = buildPropostaHtml({
                                        empresa: emp, cliente: cl,
                                        orcamento: { numero, projeto, obs },
                                        ambientes, tot, taxas, pagamento, pvComDesconto, bib, padroes,
                                        nivel: 'ambiente', prazoEntrega, enderecoObra, validadeProposta,
                                    });
                                    const html = buildContratoHtml({
                                        empresa: emp, cliente: cl,
                                        orcamento: { numero, projeto, validadeProposta },
                                        ambientes, pagamento, pvComDesconto,
                                        template: emp?.contrato_template || '',
                                        prazoEntrega, enderecoObra,
                                        propostaHtml: propHtml,
                                        assinaturaDigital: true,
                                        assinaturaEmpresaImg: emp?.assinatura_empresa_img || null,
                                        responsavelLegal: (emp?.responsavel_legal_nome || emp?.responsavel_legal_cpf) ? {
                                            nome: emp.responsavel_legal_nome,
                                            cpf: emp.responsavel_legal_cpf,
                                        } : null,
                                    });
                                    const res = await api.post('/assinaturas/criar', {
                                        orc_id: editOrc.id,
                                        tipo_documento: 'contrato',
                                        html_documento: html,
                                        signatarios: [
                                            { papel: 'contratante', nome: cl.nome, cpf: cl.cpf, email: cl.email || '', telefone: cl.tel || '' },
                                        ],
                                    });
                                    const signer0 = res.signatarios?.[0];
                                    const sigUrl = signer0?.signing_url || `/assinar/${signer0?.token}`;
                                    const fullUrl = `${window.location.origin}${sigUrl}`;
                                    const waText = encodeURIComponent(`Olá ${cl.nome}! Segue o link para assinatura do contrato${emp?.nome ? ` da ${emp.nome}` : ''}: ${fullUrl}`);
                                    const waLinkManual = cl.tel ? `https://wa.me/55${cl.tel.replace(/\D/g, '')}?text=${waText}` : null;
                                    // Copiar link automaticamente
                                    try { await navigator.clipboard.writeText(fullUrl); } catch {}
                                    // Descobrir signer_id para envio via WhatsApp oficial
                                    let signerId = null;
                                    try {
                                        const docs = await api.get(`/assinaturas/documento/${editOrc.id}`);
                                        const latest = docs?.[0];
                                        signerId = latest?.signatarios?.[0]?.id || null;
                                    } catch {}
                                    const enviarOficial = async () => {
                                        if (!signerId) { notify('Erro: signatário não encontrado'); return; }
                                        try {
                                            await api.post(`/assinaturas/signer/${signerId}/enviar-whatsapp`, {});
                                            notify('Link enviado via WhatsApp oficial. Lembretes automáticos ativados (24h / 72h / 5d).');
                                            try { api.get(`/assinaturas/documento/${editOrc.id}`).then(setAssinaturas); } catch {}
                                        } catch (ex) {
                                            notify(ex.error || 'Erro ao enviar — use o envio manual');
                                        }
                                    };
                                    notify(
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <span><strong>Contrato gerado!</strong> Link copiado.</span>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <button onClick={() => window.open(fullUrl, '_blank')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer' }}>
                                                    Abrir link
                                                </button>
                                                {cl.tel && <button onClick={enviarOficial} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--success)', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                                                    <Smartphone size={14} style={{display:'inline',marginRight:6}} /> Enviar via WhatsApp oficial
                                                </button>}
                                                {waLinkManual && <a href={waLinkManual} target="_blank" rel="noreferrer" style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: 'var(--text)', fontSize: 11, textDecoration: 'none', cursor: 'pointer' }}>
                                                    Enviar manual (wa.me)
                                                </a>}
                                            </div>
                                        </div>
                                    );
                                } catch (ex) { notify(ex.detail || ex.error || 'Erro ao gerar assinatura'); }
                            }} className={`${Z.btn2} w-full py-2 text-xs`} style={
                                assinaturas.some(d => d.status === 'concluido')
                                    ? { background: 'var(--success-bg)', borderColor: 'var(--success)', color: 'var(--success-hover)', cursor: 'default' }
                                    : { background: 'var(--accent-bg)', borderColor: 'var(--accent)' }
                            } disabled={assinaturas.some(d => d.status === 'concluido')}>
                                {assinaturas.some(d => d.status === 'concluido')
                                    ? <><CheckCircle size={13} /> Contrato Assinado</>
                                    : <><PenTool size={13} /> Enviar Contrato p/ Assinatura</>
                                }
                            </button>
                            <button onClick={async () => {
                                try {
                                    let emp = empresa;
                                    if (!emp) { emp = await api.get('/config/empresa'); setEmpresa(emp); }
                                    notify('Gerando relatório...');
                                    const html = buildRelatorioHtml({
                                        empresa: emp,
                                        orcamento: { numero, cliente_nome: clis.find(c => c.id === parseInt(cid))?.nome || '', projeto },
                                        ambientes, tot, taxas, pagamento, pvComDesconto, bib, padroes,
                                    });
                                    const blob = await api.postBlob('/pdf/generate', { html });
                                    window.open(URL.createObjectURL(blob), '_blank');
                                } catch (ex) { notify(ex.detail || ex.error || 'Erro ao gerar relatório'); }
                            }} className={`${Z.btn2} w-full py-2 text-xs`}>
                                <BarChart3 size={13} /> Gerar Relatório
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Assinaturas Digitais ── */}
            {editOrc?.id && assinaturas.length > 0 && (
                <div className={`${Z.card} mt-5`}>
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: 'var(--text-primary)' }}>
                        <PenTool size={14} /> Assinaturas Digitais
                    </h2>
                    {assinaturas.map(doc => (
                        <div key={doc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--bg-muted)' }}>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                        background: doc.status === 'concluido' ? 'var(--success-bg)' : doc.status === 'cancelado' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                                        color: doc.status === 'concluido' ? 'var(--success-hover)' : doc.status === 'cancelado' ? 'var(--danger-hover)' : 'var(--warning-hover)',
                                    }}>
                                        {doc.status === 'concluido' ? 'ASSINADO' : doc.status === 'cancelado' ? 'CANCELADO' : 'PENDENTE'}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {doc.tipo_documento === 'contrato' ? 'Contrato' : doc.tipo_documento}
                                    </span>
                                </div>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {doc.codigo_verificacao}
                                </span>
                            </div>

                            {/* Signatários */}
                            {doc.signatarios?.map(sig => (
                                <div key={sig.id} style={{
                                    background: '#fff', borderRadius: 8, padding: '10px 12px', marginTop: 8,
                                    border: `1px solid ${sig.status === 'assinado' ? '#bbf7d0' : '#e5e7eb'}`,
                                }}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{sig.nome}</span>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, textTransform: 'uppercase' }}>{sig.papel}</span>
                                        </div>
                                        {sig.status === 'assinado' ? (
                                            <CheckCircle size={14} color="var(--success)" />
                                        ) : (
                                            <Clock size={14} color="#94a3b8" />
                                        )}
                                    </div>
                                    {sig.status === 'assinado' && (
                                        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                                            <span>Assinado: {new Date(sig.assinado_em).toLocaleString('pt-BR')}</span>
                                            <span>CPF: {sig.cpf_masked}</span>
                                            {sig.cidade && <span>Local: {sig.cidade}{sig.estado ? `/${sig.estado}` : ''}</span>}
                                        </div>
                                    )}
                                    {sig.status === 'pendente' && (
                                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {sig.enviado_em ? (
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                                                        Enviado via {sig.enviado_via === 'whatsapp' ? 'WhatsApp' : 'manual'} — {new Date(sig.enviado_em).toLocaleString('pt-BR')}
                                                    </span>
                                                    {sig.lembrete_1_em && <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Lembrete 1 enviado</span>}
                                                    {sig.lembrete_2_em && <span style={{ background: '#fed7aa', color: '#9a3412', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Lembrete 2 enviado</span>}
                                                    {sig.escalado_em && <span style={{ background: '#fecaca', color: '#991b1b', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>Escalado ao gerente</span>}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Aguardando envio do link</div>
                                            )}
                                            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                                <button onClick={async () => {
                                                    try {
                                                        await api.post(`/assinaturas/signer/${sig.id}/enviar-whatsapp`, {});
                                                        notify(sig.enviado_em ? 'Link reenviado' : 'Link enviado. Lembretes automáticos ativados (24h/72h/5d).');
                                                        api.get(`/assinaturas/documento/${editOrc.id}`).then(setAssinaturas).catch(() => {});
                                                    } catch (ex) { notify(ex.error || 'Erro ao enviar — verifique Evolution API'); }
                                                }} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--success)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                                                    {sig.enviado_em ? 'Reenviar' : 'Enviar'} via WhatsApp oficial
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Dados de auditoria */}
                            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>
                                    Hash: {doc.hash_documento?.slice(0, 16)}...
                                </span>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>
                                    Criado: {new Date(doc.criado_em).toLocaleString('pt-BR')}
                                </span>
                                {doc.concluido_em && (
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 4 }}>
                                        Concluído: {new Date(doc.concluido_em).toLocaleString('pt-BR')}
                                    </span>
                                )}
                            </div>

                            {/* Ações */}
                            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                                {doc.status === 'concluido' && (
                                    <button onClick={async () => {
                                        try {
                                            notify('Gerando comprovante...');
                                            const res = await api.get(`/assinaturas/comprovante/${doc.id}`);
                                            const blob = await api.postBlob('/pdf/generate', { html: res.html });
                                            window.open(URL.createObjectURL(blob), '_blank');
                                        } catch (ex) { notify(ex.error || 'Erro ao gerar comprovante'); }
                                    }} className={Z.btn2} style={{ fontSize: 10, padding: '4px 10px' }}>
                                        <FileText size={11} /> Comprovante PDF
                                    </button>
                                )}
                                <button onClick={() => window.open(`/verificar/${doc.codigo_verificacao}`, '_blank')} className={Z.btn2} style={{ fontSize: 10, padding: '4px 10px' }}>
                                    <Shield size={11} /> Verificar
                                </button>
                                {doc.signatarios?.find(s => s.status === 'pendente') && (
                                    <button onClick={() => {
                                        const sig = doc.signatarios.find(s => s.status === 'pendente');
                                        if (sig) {
                                            const url = `${window.location.origin}/assinar/${sig.token}`;
                                            navigator.clipboard.writeText(url).then(() => notify('Link copiado!')).catch(() => {});
                                        }
                                    }} className={Z.btn2} style={{ fontSize: 10, padding: '4px 10px' }}>
                                        <Copy size={11} /> Copiar Link
                                    </button>
                                )}
                                {(doc.status === 'pendente' || doc.status === 'parcial') && (
                                    <button onClick={() => {
                                        setNovoConfirm({ msg: 'Cancelar esta sessão de assinatura?', onOk: async () => {
                                            try {
                                                await api.post(`/assinaturas/${doc.id}/cancelar`, { motivo: 'Cancelado pelo operador' });
                                                setAssinaturas(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'cancelado' } : d));
                                                notify('Sessão cancelada');
                                            } catch (ex) { notify(ex.error || 'Erro ao cancelar'); }
                                        } });
                                    }} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: 'var(--danger-hover)', cursor: 'pointer' }}>
                                        <X size={11} /> Cancelar
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Link Público + Visualizações ── */}
            {editOrc?.id && (
                <div className={`${Z.card} mt-5`}>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                            <Share2 size={14} /> Link Público da Proposta
                        </h2>
                        {viewsData?.token && (
                            <button onClick={() => setShowViews(!showViews)}
                                className="text-[10px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer"
                                style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.08))', color: 'var(--primary)', fontWeight: 600 }}>
                                <Eye size={11} /> {viewsData.new_visits || 0} visualizações
                            </button>
                        )}
                    </div>

                    {/* Botão gerar/copiar link */}
                    {viewsData?.token ? (
                        <div className="flex flex-col gap-2 mb-2">
                            <div>
                                <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                                    EXPERIÊNCIA COMPLETA
                                    <span className="ml-1 px-1 py-0.5 rounded text-[8px] font-bold" style={{ background: 'var(--info-bg)', color: '#1d4ed8' }}>REC</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input readOnly value={`${window.location.origin}/apresentacao/${viewsData.token}`}
                                        className={`${Z.inp} flex-1 text-xs`} style={{ fontFamily: 'monospace' }}
                                        onClick={e => { e.target.select(); navigator.clipboard.writeText(e.target.value); notify('Link copiado!'); }} />
                                    <a href={`/apresentacao/${viewsData.token}`} target="_blank" rel="noreferrer"
                                        className="p-2 rounded cursor-pointer" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>DIRETO</div>
                                <div className="flex items-center gap-2">
                                    <input readOnly value={`${window.location.origin}/proposta/${viewsData.token}`}
                                        className={`${Z.inp} flex-1 text-xs`} style={{ fontFamily: 'monospace' }}
                                        onClick={e => { e.target.select(); navigator.clipboard.writeText(e.target.value); notify('Link copiado!'); }} />
                                    <a href={`/preview/proposta/${viewsData.token}`} target="_blank" rel="noreferrer"
                                        className="p-2 rounded cursor-pointer" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                                        title="Visualizar (sem afetar estatísticas)">
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            </div>
                            {/* Botão Preview (sem estatísticas) */}
                            <div className="mt-1">
                                <a href={`/preview/proposta/${viewsData.token}`} target="_blank" rel="noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-semibold cursor-pointer"
                                    style={{ background: 'var(--warning-bg)', color: 'var(--warning-hover)', border: '1px solid #fde68a' }}>
                                    <Eye size={13} /> Visualizar Preview (sem estatísticas)
                                </a>
                            </div>
                        </div>
                    ) : (
                        <button onClick={async () => {
                            try {
                                const res = await api.post('/portal/generate', { orc_id: editOrc.id });
                                setViewsData(v => ({ ...(v || {}), token: res.token, total: 0, new_visits: 0 }));
                                notify('Link público criado!');
                            } catch { notify('Erro ao gerar link'); }
                        }} className={`${Z.btn2} text-xs py-2 w-full`}>
                            <Globe size={13} /> Gerar Link Público
                        </button>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        O conteúdo do link é atualizado automaticamente ao salvar.
                    </p>

                    {/* Painel de visualizações expandido */}
                    {showViews && viewsData && viewsData.total > 0 && (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                            {/* Resumo */}
                            <div className="grid grid-cols-4 gap-2 mb-3">
                                {[
                                    { label: 'Visualizações', value: viewsData.new_visits || 0, icon: <Eye size={12} />, color: 'var(--primary)' },
                                    { label: 'Dispositivos', value: viewsData.unique_devices || 0, icon: <Monitor size={12} />, color: 'var(--primary)' },
                                    { label: 'Tempo máx.', value: viewsData.max_tempo > 60 ? `${Math.round(viewsData.max_tempo / 60)}min` : `${viewsData.max_tempo || 0}s`, icon: <Clock size={12} />, color: 'var(--primary)' },
                                    { label: 'Scroll máx.', value: `${viewsData.max_scroll || 0}%`, icon: <BarChart3 size={12} />, color: 'var(--primary)' },
                                ].map((m, i) => (
                                    <div key={i} className="text-center p-2 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                                        <div className="flex items-center justify-center gap-1 mb-1" style={{ color: m.color }}>{m.icon}</div>
                                        <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{m.value}</div>
                                        <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Dispositivos únicos */}
                            {viewsData.dispositivos?.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--text-muted)' }}>Dispositivos detectados</div>
                                    <div className="flex flex-col gap-1.5">
                                        {viewsData.dispositivos.map((d, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-lg text-xs"
                                                style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                                <div className="flex items-center gap-2">
                                                    {d.dispositivo === 'Mobile' ? <Smartphone size={13} style={{ color: 'var(--primary)' }} /> : <Monitor size={13} style={{ color: 'var(--primary)' }} />}
                                                    <div>
                                                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                                            {d.os_name} · {d.navegador}
                                                        </div>
                                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                            {d.cidade && d.estado ? `${d.cidade}/${d.estado} · ` : ''}{d.ip}
                                                            {d.visitas > 1 && ` · ${d.visitas} acessos`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                    {d.tempo_max > 0 && <div>{d.tempo_max > 60 ? `${Math.round(d.tempo_max / 60)}min` : `${d.tempo_max}s`} na página</div>}
                                                    {d.scroll_max > 0 && <div>Leu {d.scroll_max}%</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Últimos acessos - tabela estilo portal */}
                            {viewsData.views?.length > 0 && (() => {
                                const hasAnyLoc = viewsData.views.some(v => v.lat && v.lon);
                                const hasAnyCidade = viewsData.views.some(v => v.cidade);
                                const shownViews = showAllViews ? viewsData.views : viewsData.views.slice(0, 8);
                                return (
                                    <div className="mt-3">
                                        <div className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--text-muted)' }}>Últimos acessos</div>
                                        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
                                                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>Data / Hora</th>
                                                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>IP</th>
                                                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>Dispositivo</th>
                                                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>Navegador</th>
                                                        {hasAnyCidade && <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>Cidade</th>}
                                                        {hasAnyLoc && <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10 }}>Local</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {shownViews.map((v, i) => {
                                                        const hasLoc = v.lat && v.lon;
                                                        return (
                                                            <Fragment key={v.id || i}>
                                                                <tr style={{
                                                                    borderBottom: '1px solid var(--border)',
                                                                    background: viewMapId === v.id ? 'var(--bg-muted)' : v.is_new_visit ? 'rgba(59,130,246,0.04)' : undefined,
                                                                    cursor: hasLoc ? 'pointer' : 'default',
                                                                }} onClick={() => hasLoc && setViewMapId(viewMapId === v.id ? null : v.id)}>
                                                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                                                        {new Date(v.acessado_em + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 10 }}>{v.ip_cliente || '—'}</td>
                                                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>
                                                                        {v.dispositivo === 'Mobile' ? <Smartphone size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> : <Monitor size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />}
                                                                        {v.os_name || v.dispositivo || '—'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{v.navegador || '—'}</td>
                                                                    {hasAnyCidade && <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 10 }}>{v.cidade ? `${v.cidade}${v.estado ? `/${v.estado}` : ''}` : '—'}</td>}
                                                                    {hasAnyLoc && (
                                                                        <td style={{ padding: '6px 10px' }}>
                                                                            {hasLoc ? (
                                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--primary)', fontWeight: 600, fontSize: 10 }}>
                                                                                    <MapPin size={11} /> Ver mapa
                                                                                </span>
                                                                            ) : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>}
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                                {viewMapId === v.id && hasLoc && (
                                                                    <tr><td colSpan={4 + (hasAnyCidade ? 1 : 0) + (hasAnyLoc ? 1 : 0)} style={{ padding: 0 }}>
                                                                        <div style={{ padding: 12, background: 'var(--bg-muted)' }}>
                                                                            <iframe
                                                                                title="map"
                                                                                width="100%" height="200"
                                                                                style={{ border: 0, borderRadius: 8 }}
                                                                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${v.lon - 0.01},${v.lat - 0.008},${v.lon + 0.01},${v.lat + 0.008}&layer=mapnik&marker=${v.lat},${v.lon}`}
                                                                            />
                                                                            <a href={`https://www.google.com/maps?q=${v.lat},${v.lon}`} target="_blank" rel="noreferrer"
                                                                                style={{ fontSize: 10, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                                                                                <ExternalLink size={10} /> Abrir no Google Maps
                                                                            </a>
                                                                        </div>
                                                                    </td></tr>
                                                                )}
                                                            </Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        {viewsData.views.length > 8 && (
                                            <button onClick={() => setShowAllViews(!showAllViews)}
                                                className="text-[10px] mt-2 cursor-pointer"
                                                style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                                {showAllViews ? 'Mostrar menos' : `Ver todos (${viewsData.views.length})`}
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Resetar estatísticas */}
                            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                <button onClick={() => {
                                    setNovoConfirm({ msg: 'Resetar todas as estatísticas de visualização desta proposta? Esta ação não pode ser desfeita.', onOk: async () => {
                                        try {
                                            await api.del(`/portal/views/${editOrc.id}`);
                                            setViewsData(v => ({ ...v, total: 0, new_visits: 0, unique_ips: 0, unique_devices: 0, max_tempo: 0, max_scroll: 0, views: [], dispositivos: [], section_resumo: [], lead_score: { score: 0 } }));
                                            notify('Estatísticas resetadas');
                                        } catch (ex) { notify(ex.detail || 'Erro ao resetar'); }
                                    } });
                                }} className="text-[10px] px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer"
                                    style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger-border)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                                    <RefreshCw size={10} /> Resetar estatísticas
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Condições de Pagamento ── */}
            <div className={`${Z.card} mt-5`} style={readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <CreditCard size={14} /> Condições de Pagamento
                    {readOnly && <Lock size={12} style={{ color: 'var(--warning)' }} />}
                </h2>

                {/* Desconto Global */}
                <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <label className={Z.lbl}>Desconto Global</label>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex rounded overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                            {['%', 'R$'].map(t => (
                                <button key={t}
                                    onClick={() => setPagamento(p => ({ ...p, desconto: { ...p.desconto, tipo: t } }))}
                                    className="px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer"
                                    style={pagamento.desconto.tipo === t
                                        ? { background: 'var(--primary)', color: '#fff' }
                                        : { background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        <input
                            type="number" min="0" step="0.1"
                            value={pagamento.desconto.valor || ''}
                            onChange={e => setPagamento(p => ({ ...p, desconto: { ...p.desconto, valor: parseFloat(e.target.value) || 0 } }))}
                            placeholder="0"
                            className={`${Z.inp} w-28 text-center`} />
                        {descontoR > 0 && (
                            <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
                                <span>Base: <strong style={{ color: 'var(--text-primary)' }}>{R$(tot.pvFinal)}</strong></span>
                                <span style={{ color: 'var(--danger)' }}>− {R$(descontoR)}</span>
                                <span>Final: <strong style={{ color: 'var(--primary)', fontSize: 13 }}>{R$(pvComDesconto)}</strong></span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Blocos de Pagamento */}
                <div>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <label className={Z.lbl}>Parcelas / Blocos de Pagamento</label>
                        <div className="flex items-center gap-3">
                            {pagamento.blocos.length > 0 && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${Math.abs(somaBlocos - 100) < 0.01 ? 'text-green-400' : 'text-red-400'}`}
                                    style={{ background: Math.abs(somaBlocos - 100) < 0.01 ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)' }}>
                                    Σ {N(somaBlocos, 1)}% {Math.abs(somaBlocos - 100) < 0.01 ? 'OK' : '≠ 100'}
                                </span>
                            )}
                            <button onClick={addBloco} className={`${Z.btn} text-xs py-1.5 px-3`}>
                                <Plus size={12} /> Adicionar bloco
                            </button>
                        </div>
                    </div>

                    {pagamento.blocos.length === 0 ? (
                        <div className="text-center py-8 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px dashed var(--border)' }}>
                            <CreditCard size={28} className="mx-auto mb-2 opacity-20" style={{ color: 'var(--text-muted)' }} />
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma condição de pagamento definida</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Ex: 30% entrada PIX + 70% em 10× cartão crédito</p>
                            <button onClick={addBloco} className={`${Z.btn} text-xs mt-3`}>
                                <Plus size={12} /> Adicionar primeiro bloco
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr>
                                        <th className={Z.th} style={{ width: '32%' }}>Descrição</th>
                                        <th className={Z.th} style={{ width: '13%' }}>% do Total</th>
                                        <th className={Z.th} style={{ width: '24%' }}>Meio de Pagamento</th>
                                        <th className={Z.th} style={{ width: '16%' }}>Parcelas</th>
                                        <th className={Z.th} style={{ width: '15%', textAlign: 'right' }}>Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagamento.blocos.map(b => {
                                        const valorBloco = pvComDesconto * (Number(b.percentual) || 0) / 100;
                                        const nparcelas = Math.max(1, b.parcelas || 1);
                                        const valorParcela = valorBloco / nparcelas;
                                        return (
                                            <tr key={b.id} className="group hover:bg-[var(--bg-hover)]">
                                                <td className="td-glass">
                                                    <input
                                                        value={b.descricao}
                                                        onChange={e => upBloco(b.id, 'descricao', e.target.value)}
                                                        placeholder="Ex: Entrada, Saldo..."
                                                        className={`${Z.inp} !py-1 text-xs w-full`} />
                                                </td>
                                                <td className="td-glass">
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number" min="0" max="100" step="1"
                                                            value={b.percentual || ''}
                                                            onChange={e => upBloco(b.id, 'percentual', parseFloat(e.target.value) || 0)}
                                                            placeholder="0"
                                                            className={`${Z.inp} !py-1 text-xs w-full text-center`} />
                                                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>%</span>
                                                    </div>
                                                </td>
                                                <td className="td-glass">
                                                    <select
                                                        value={b.meio}
                                                        onChange={e => upBloco(b.id, 'meio', e.target.value)}
                                                        className={`${Z.inp} !py-1 text-xs w-full`}>
                                                        {MEIOS_PAGAMENTO.map(m => (
                                                            <option key={m.value} value={m.value}>{m.label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="td-glass">
                                                    <div className="flex items-center gap-1 justify-center">
                                                        <button
                                                            onClick={() => upBloco(b.id, 'parcelas', Math.max(1, nparcelas - 1))}
                                                            className="w-6 h-6 flex items-center justify-center rounded text-sm font-bold flex-shrink-0 cursor-pointer"
                                                            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>−</button>
                                                        <input
                                                            type="number" min="1" step="1"
                                                            value={nparcelas}
                                                            onChange={e => upBloco(b.id, 'parcelas', Math.max(1, parseInt(e.target.value) || 1))}
                                                            className={`${Z.inp} !py-1 text-xs w-10 text-center`} />
                                                        <button
                                                            onClick={() => upBloco(b.id, 'parcelas', nparcelas + 1)}
                                                            className="w-6 h-6 flex items-center justify-center rounded text-sm font-bold flex-shrink-0 cursor-pointer"
                                                            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>+</button>
                                                    </div>
                                                </td>
                                                <td className="td-glass">
                                                    <div className="flex items-start justify-between gap-1">
                                                        <div className="text-right flex-1">
                                                            <div className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                                                                {nparcelas > 1 ? `${nparcelas}× ${R$(valorParcela)}` : R$(valorBloco)}
                                                            </div>
                                                            {nparcelas > 1 && (
                                                                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                                                    Total: {R$(valorBloco)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => removeBloco(b.id)}
                                                            className="text-red-400/40 hover:text-red-400 flex-shrink-0 mt-0.5 cursor-pointer">
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                                        <td className="td-glass font-bold text-xs" style={{ color: 'var(--text-primary)' }}>TOTAL</td>
                                        <td className="td-glass text-center">
                                            <span className={`text-xs font-bold ${Math.abs(somaBlocos - 100) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                                                {N(somaBlocos, 1)}%
                                            </span>
                                        </td>
                                        <td className="td-glass" />
                                        <td className="td-glass" />
                                        <td className="td-glass text-right font-bold text-sm" style={{ color: 'var(--primary)' }}>
                                            {R$(pvComDesconto)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>


            {/* ── Modal: Nível da Proposta ── */}
            {propostaModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setPropostaModal(false)}>
                    <div className="rounded-xl shadow-2xl max-w-sm w-full mx-4"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Exibição de Valores</h3>
                            <button onClick={() => setPropostaModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)]"><X size={16} /></button>
                        </div>
                        <div className="p-3 mx-4 mb-1 rounded-lg text-[10px]" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                            Todos os itens e componentes serão detalhados. Escolha como exibir os valores:
                        </div>
                        <div className="p-4 space-y-2">
                            {[
                                { id: 'geral', label: 'Valor Total', desc: 'Mostra apenas o valor total do projeto (sem valores individuais)' },
                                { id: 'ambiente', label: 'Valor por Ambiente', desc: 'Mostra o subtotal de cada ambiente' },
                                { id: 'detalhado', label: 'Valor por Item', desc: 'Mostra o valor individual de cada item' },
                            ].map(opt => (
                                <button key={opt.id} onClick={async () => {
                                    setPropostaModal(false);
                                    try {
                                        notify('Gerando Proposta...');
                                        let emp = empresa;
                                        if (!emp) {
                                            emp = await api.get('/config/empresa');
                                            setEmpresa(emp);
                                        }
                                        const cl = clis.find(c => c.id === parseInt(cid));
                                        const html = buildPropostaHtml({
                                            empresa: emp, cliente: cl,
                                            orcamento: { numero, projeto, obs },
                                            ambientes, tot, taxas, pagamento, pvComDesconto, bib, padroes,
                                            nivel: opt.id, prazoEntrega, enderecoObra, validadeProposta,
                                        });
                                        const blob = await api.postBlob('/pdf/generate', { html });
                                        window.open(URL.createObjectURL(blob), '_blank');
                                        // Salvar HTML no link público (atualiza se existir, cria se não)
                                        if (editOrc?.id) {
                                            api.post('/portal/generate', { orc_id: editOrc.id, html_proposta: html, nivel: opt.id }).catch(e => notify(e.error || 'Erro ao salvar link público'));
                                        }
                                    } catch (ex) { notify(ex.detail || ex.error || 'Erro ao gerar proposta'); }
                                }}
                                    className="w-full text-left p-3 rounded-lg border cursor-pointer transition-all hover:border-[var(--primary)] hover:bg-[var(--bg-hover)]"
                                    style={{ borderColor: 'var(--border)' }}>
                                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Tipo de Ambiente ── */}
            {/* ─── Modal Importar JSON IA ──────────────────────── */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setShowImportModal(false)}>
                    <div className="rounded-xl shadow-2xl w-full mx-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', maxWidth: 640 }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                                <Sparkles size={16} style={{ color: '#8b5cf6' }} /> Importar JSON da IA
                            </h3>
                            <button onClick={() => setShowImportModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4">
                            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                Cole abaixo o JSON gerado pela IA. O sistema vai expandir automaticamente as caixas e componentes com base no catálogo cadastrado.
                            </p>
                            <textarea
                                value={importJson}
                                onChange={e => setImportJson(e.target.value)}
                                rows={12}
                                placeholder={'{\n  "ambientes": [\n    {\n      "nome": "Cozinha",\n      "itens": [\n        {\n          "caixa": "Caixa Baixa / Balcão",\n          "nome": "Armário Inferior Pia",\n          "L": 1200, "A": 800, "P": 550,\n          "matInt": "mdf18",\n          "componentes": [\n            { "nome": "Porta Fecho Toque", "qtd": 2 },\n            { "nome": "Gaveta", "qtd": 1, "vars": { "ag": 200 } }\n          ]\n        }\n      ]\n    }\n  ]\n}'}
                                style={{
                                    width: '100%', fontSize: 11, lineHeight: 1.5, padding: 12, borderRadius: 8,
                                    resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                    border: '1px solid var(--border)', fontFamily: 'monospace',
                                }}
                            />

                            {importResult && (
                                <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
                                    <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--success)' }}>
                                        <CheckCircle size={14} /> Importado com sucesso!
                                    </div>
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {[
                                            { label: 'Ambientes', val: importResult.stats.ambientes },
                                            { label: 'Itens', val: importResult.stats.itens },
                                            { label: 'Componentes', val: importResult.stats.componentes },
                                        ].map(s => (
                                            <span key={s.label} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                                                {s.val} {s.label}
                                            </span>
                                        ))}
                                    </div>
                                    {importResult.warnings?.length > 0 && (
                                        <div className="mt-2">
                                            {importResult.warnings.map((w, i) => (
                                                <div key={i} className="text-[10px] flex items-center gap-1 mt-1" style={{ color: 'var(--warning)' }}>
                                                    <AlertTriangle size={10} /> {w}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setShowImportModal(false)} className={Z.btn2}>Cancelar</button>
                                <button onClick={importarJsonIA} disabled={importLoading || !importJson.trim()} className={Z.btn} style={{ background: '#8b5cf6' }}>
                                    {importLoading
                                        ? <><RefreshCw size={13} className="animate-spin" /> Processando...</>
                                        : <><Upload size={13} /> Importar</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showTipoAmbModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setShowTipoAmbModal(false)}>
                    <div className="rounded-xl shadow-2xl w-full mx-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', maxWidth: 480 }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Novo Ambiente</h3>
                            <button onClick={() => setShowTipoAmbModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4">
                            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Escolha como deseja criar este ambiente:</p>
                            <div style={{ display: 'grid', gridTemplateColumns: empresa?.upmobb_ativo ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                                {/* Calculadora Ornato */}
                                <button onClick={() => createAmbiente('calculadora')}
                                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md"
                                    style={{ borderColor: 'var(--primary)', background: 'var(--primary-light)' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Package size={22} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>Calculadora</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>Modulos parametricos com calculo automatico</span>
                                </button>

                                {/* Manual */}
                                <button onClick={() => createAmbiente('manual')}
                                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md"
                                    style={{ borderColor: 'var(--warning-border)', background: 'var(--warning-bg)' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--warning)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <FileText size={22} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)' }}>Manual</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>Descricao livre com valores manuais</span>
                                </button>

                                {/* UpMobb — só aparece se habilitado em Configurações */}
                                {empresa?.upmobb_ativo ? (
                                    <button disabled
                                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 opacity-50 cursor-not-allowed"
                                        style={{ borderColor: '#8b5cf640', background: '#8b5cf608' }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <FolderOpen size={22} />
                                        </div>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>UpMobb</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>Importar JSON (em breve)</span>
                                    </button>
                                ) : null}
                            </div>

                            {/* Templates salvos */}
                            {ambTemplates.length > 0 && (
                                <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                    <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Templates Salvos</div>
                                    <div className="flex flex-col gap-1.5">
                                        {ambTemplates.map(tpl => (
                                            <div key={tpl.id} className="flex items-center gap-2 p-2 rounded-lg border transition-all hover:border-[var(--primary)]"
                                                style={{ borderColor: 'var(--border)', background: 'var(--bg-muted)' }}>
                                                <button onClick={() => createFromTemplate(tpl)} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" title="Usar template">
                                                    <Layers size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                    <div className="flex flex-col min-w-0">
                                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }} className="truncate">{tpl.nome}</span>
                                                        {tpl.categoria && <span style={{ fontSize: 9, color: 'var(--text-muted)' }} className="truncate">{tpl.categoria}</span>}
                                                    </div>
                                                </button>
                                                <button onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const novo = prompt('Renomear template:', tpl.nome);
                                                    if (!novo || novo === tpl.nome) return;
                                                    await api.put(`/orcamentos/templates/${tpl.id}`, { nome: novo, descricao: tpl.descricao, categoria: tpl.categoria });
                                                    setAmbTemplates(await api.get('/orcamentos/templates'));
                                                    notify('Template renomeado');
                                                }} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer" style={{ color: 'var(--text-muted)' }} title="Renomear">
                                                    <Settings size={12} />
                                                </button>
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    setNovoConfirm({ msg: `Excluir template "${tpl.nome}"?`, onOk: async () => {
                                                        await api.del(`/orcamentos/templates/${tpl.id}`);
                                                        setAmbTemplates(await api.get('/orcamentos/templates'));
                                                        notify('Template excluído');
                                                    } });
                                                }} className="p-1 rounded hover:bg-red-500/10 cursor-pointer" style={{ color: 'var(--text-muted)' }} title="Excluir">
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Cadastro Rápido de Cliente ── */}
            {showQuickClient && (
                <QuickClientModal
                    onClose={() => setShowQuickClient(false)}
                    onCreated={(novoId) => { sc(String(novoId)); reload(); setShowQuickClient(false); notify('Cliente cadastrado'); }}
                />
            )}

            {/* ── Modal: Salvar como Template ── */}
            {showSaveTemplateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setShowSaveTemplateModal(null)}>
                    <div className="rounded-xl shadow-2xl w-full mx-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', maxWidth: 400 }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Salvar como Template</h3>
                            <button onClick={() => setShowSaveTemplateModal(null)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4 flex flex-col gap-3">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Nome do Template</label>
                                <input value={templateNome} onChange={e => setTemplateNome(e.target.value)}
                                    className={`${Z.inp} w-full text-sm`} placeholder="Ex: Cozinha Completa" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Categoria (opcional)</label>
                                <input value={templateCategoria} onChange={e => setTemplateCategoria(e.target.value)}
                                    className={`${Z.inp} w-full text-sm`} placeholder="Ex: Cozinha, Quarto, Closet..." />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setShowSaveTemplateModal(null)} className={Z.btn2}>Cancelar</button>
                                <button onClick={() => salvarComoTemplate(showSaveTemplateModal)} className={Z.btn}>Salvar Template</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Adicionar Componente ── */}
            {addCompModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setAddCompModal(null)}>
                    <div className="rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Adicionar Componente</h3>
                            <button onClick={() => setAddCompModal(null)} className="p-1 rounded hover:bg-[var(--bg-hover)]"><X size={16} /></button>
                        </div>
                        <div className="p-3 overflow-y-auto flex-1">
                            {/* ── Seção especial: Ripado ── */}
                            {(() => {
                                const targetItem = ambientes.flatMap(a => a.itens || []).find(i => i.id === addCompModal.itemId);
                                const hasRipado = targetItem?.ripado;
                                return (
                                    <button
                                        onClick={() => {
                                            if (!hasRipado) {
                                                addRipadoToItem(addCompModal.ambId, addCompModal.itemId);
                                            } else {
                                                removeRipadoFromItem(addCompModal.ambId, addCompModal.itemId);
                                            }
                                            setAddCompModal(null);
                                        }}
                                        className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-[var(--warning)]/40 hover:bg-[var(--bg-hover)] text-left w-full mb-3"
                                        style={{ borderColor: hasRipado ? 'var(--warning-border)' : 'var(--border)', background: hasRipado ? 'var(--warning-bg)' : undefined }}>
                                        <Layers size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Ripado / Muxarabi</div>
                                            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                Ripas decorativas na porta do módulo (sem substrato)
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={hasRipado
                                            ? { background: 'rgba(239,68,68,0.12)', color: 'var(--danger)' }
                                            : { background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                                            {hasRipado ? 'Remover' : '+ Adicionar'}
                                        </span>
                                    </button>
                                );
                            })()}

                            {componentesCat.length === 0 ? (
                                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                                    <Package size={28} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Nenhum componente cadastrado</p>
                                    <p className="text-xs mt-1">Vá em <strong>Catálogo de Itens</strong> para criar</p>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-2">
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                                            style={{ borderColor: 'var(--border)', background: 'var(--bg-muted)' }}>
                                            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                            <input
                                                type="text"
                                                value={compSearch}
                                                onChange={e => setCompSearch(e.target.value)}
                                                placeholder="Buscar componente por nome, descrição..."
                                                className="w-full bg-transparent outline-none text-sm"
                                                style={{ color: 'var(--text-primary)' }}
                                            />
                                            {compSearch && (
                                                <button
                                                    onClick={() => setCompSearch('')}
                                                    className="p-0.5 rounded hover:bg-[var(--bg-hover)]"
                                                    style={{ color: 'var(--text-muted)' }}>
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            {componentesFiltrados.length} de {componentesCat.length} componente(s)
                                        </div>
                                    </div>
                                    {componentesFiltrados.length === 0 ? (
                                        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                                            <Search size={24} className="mx-auto mb-2 opacity-30" />
                                            <p className="text-sm">Nenhum componente encontrado</p>
                                            <p className="text-xs mt-1">Tente outro termo de busca</p>
                                        </div>
                                    ) : componentesFiltrados.map(comp => (
                                        <button key={comp.db_id}
                                            onClick={() => addComp(addCompModal.ambId, addCompModal.itemId, comp)}
                                            className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-[var(--success-hover)]/40 hover:bg-[var(--bg-hover)] text-left w-full mb-1.5"
                                            style={{ borderColor: 'var(--border)' }}>
                                            <Package size={16} style={{ color: 'var(--success)', marginTop: 2, flexShrink: 0 }} />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{comp.nome}</div>
                                                <div className="text-[10px] mt-0.5 flex gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                                                    {comp.desc && <span>{comp.desc}</span>}
                                                    {comp.frente_externa?.ativa && <span className="font-semibold" style={{ color: 'var(--warning)' }}>+ frente externa</span>}
                                                    {(comp.sub_itens || []).length > 0 && <span>{(comp.sub_itens || []).length} ferragem(ns)</span>}
                                                    {(comp.vars || []).length > 0 && <span>{(comp.vars || []).map(v => `${v.id}=${v.default}${v.unit}`).join(', ')}</span>}
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--success)' }}>×{1 + comp.coef}</span>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Painel Consolidado (no orçamento original com aditivos) ── */}
            {editOrc?.id && !isAditivo && (orcFull?.aditivos || []).length > 0 && (
                <div className={`${Z.card} mt-5`}>
                    <h2 className="text-sm font-semibold flex items-center gap-2 mb-4" style={{ color: 'var(--text-primary)' }}>
                        <BarChart3 size={14} /> Resumo Consolidado
                    </h2>

                    {/* Timeline */}
                    <div className="relative pl-6 flex flex-col gap-3 mb-4">
                        {/* Linha vertical */}
                        <div className="absolute left-[9px] top-2 bottom-2 w-px" style={{ background: 'var(--border)' }} />

                        {/* Original */}
                        <div className="relative flex items-start gap-3">
                            <div className="absolute left-[-15px] top-1 w-3 h-3 rounded-full border-2" style={{ background: '#8fbc8f', borderColor: '#8fbc8f' }} />
                            <div className="flex-1 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                                        Contrato Original — {editOrc.numero}
                                    </div>
                                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        {(orcFull?.criado_em || editOrc?.criado_em) ? new Date(orcFull?.criado_em || editOrc?.criado_em).toLocaleDateString('pt-BR') : '—'}
                                    </div>
                                </div>
                                <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{R$(editOrc.valor_venda)}</span>
                            </div>
                        </div>

                        {/* Aditivos */}
                        {(orcFull?.aditivos || []).map(ad => {
                            const badge = ad.numero?.match(/-A\d+$/)?.[0]?.replace('-', '') || 'ADT';
                            const kcColors = { lead: '#7e7ec8', orc: '#c8a97e', env: '#c8c87e', neg: '#c87eb8', ok: '#8fbc8f', prod: '#7eb8c8', done: '#6a9' };
                            return (
                                <div key={ad.id} className="relative flex items-start gap-3">
                                    <div className="absolute left-[-15px] top-1 w-3 h-3 rounded-full border-2" style={{ background: 'var(--info)', borderColor: 'var(--info)' }} />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }}>{badge}</span>
                                                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{ad.numero}</span>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${kcColors[ad.kb_col] || '#666'}22`, color: kcColors[ad.kb_col] || '#666' }}>
                                                    {ad.kb_col === 'ok' ? 'Aprovado' : ad.kb_col === 'lead' ? 'Em elaboração' : ad.kb_col}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold" style={{ color: 'var(--info)' }}>+{R$(ad.valor_venda || 0)}</span>
                                                <button onClick={() => api.get(`/orcamentos/${ad.id}`).then(o => nav('novo', o)).catch(() => notify('Erro'))}
                                                    className="text-[9px] font-semibold px-2 py-0.5 rounded cursor-pointer" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--info)' }}>
                                                    Abrir
                                                </button>
                                            </div>
                                        </div>
                                        {ad.motivo_aditivo && (
                                            <div className="text-[10px] mt-1 px-2 py-1 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                "{ad.motivo_aditivo}"
                                            </div>
                                        )}
                                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                            {ad.criado_em ? new Date(ad.criado_em).toLocaleDateString('pt-BR') : '—'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Total consolidado */}
                    <div className="pt-3 flex items-center justify-between" style={{ borderTop: '2px solid var(--border)' }}>
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Valor Total do Contrato</span>
                        <span className="text-lg font-bold" style={{ color: 'var(--primary)' }}>{R$(orcFull?.valor_consolidado || editOrc?.valor_consolidado || editOrc?.valor_venda)}</span>
                    </div>
                </div>
            )}

            {/* ── Modal: Criar Aditivo (justificativa obrigatória) ── */}
            {showAditivoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setShowAditivoModal(false)}>
                    <div className="rounded-xl shadow-2xl max-w-md w-full mx-4"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--info)' }}>
                                <FilePlus2 size={16} /> Criar Aditivo
                            </h3>
                            <button onClick={() => setShowAditivoModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4">
                            <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-secondary)', border: '1px solid rgba(59,130,246,0.15)' }}>
                                O aditivo será um novo orçamento vinculado ao original <strong>{editOrc?.numero}</strong>.
                                Ele terá seu próprio conjunto de ambientes e valores, servindo como registro formal do acréscimo.
                            </div>
                            <label className={Z.lbl}>Motivo / Justificativa do Aditivo *</label>
                            <textarea
                                value={motivoAditivo}
                                onChange={e => setMotivoAditivo(e.target.value)}
                                placeholder="Ex: Cliente solicitou acréscimo de armário no quarto 2 e painel ripado na sala..."
                                className={Z.inp}
                                style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                                autoFocus
                            />
                            <p className="text-[10px] mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>
                                Este motivo ficará registrado como justificativa formal do aditivo.
                            </p>
                            <button
                                onClick={() => criarAditivo(motivoAditivo)}
                                disabled={!motivoAditivo.trim() || criandoAditivo}
                                className={`${Z.btn} w-full py-2.5`}
                                style={{ opacity: (!motivoAditivo.trim() || criandoAditivo) ? 0.4 : 1 }}>
                                <FilePlus2 size={14} className="inline mr-1" /> {criandoAditivo ? 'Criando...' : 'Criar Aditivo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Aprovar Orçamento ── */}
            {showAprovarModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => !aprovandoOrc && setShowAprovarModal(false)}>
                    <div className="rounded-xl shadow-2xl max-w-md w-full mx-4"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--success)' }}>
                                <CheckCircle size={16} /> Aprovar Orçamento
                            </h3>
                            <button onClick={() => setShowAprovarModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4">
                            {(() => {
                                const erros = validarAprovacao();
                                if (erros.length > 0) return (
                                    <div>
                                        <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger-hover)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                            <strong className="block mb-2">Corrija os itens abaixo antes de aprovar:</strong>
                                            <ul className="list-disc pl-4 flex flex-col gap-1">
                                                {erros.map((e, i) => <li key={i}>{e}</li>)}
                                            </ul>
                                        </div>
                                        <button onClick={() => setShowAprovarModal(false)} className={`${Z.btn2} w-full py-2`}>Entendi</button>
                                    </div>
                                );
                                return (
                                    <div>
                                        <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(22,163,74,0.2)' }}>
                                            <strong style={{ color: 'var(--success)' }}>Tudo certo!</strong> Ao aprovar, o orçamento será travado para edição e um projeto será criado automaticamente com as etapas padrão e contas a receber.
                                        </div>
                                        <div className="flex flex-col gap-2 mb-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            <div className="flex justify-between"><span>Cliente:</span><strong>{clis.find(c => c.id === parseInt(cid))?.nome || '—'}</strong></div>
                                            <div className="flex justify-between"><span>Projeto:</span><strong>{projeto || editOrc?.numero || '—'}</strong></div>
                                            <div className="flex justify-between"><span>Valor:</span><strong style={{ color: 'var(--primary)' }}>{R$(pvComDesconto)}</strong></div>
                                            <div className="flex justify-between"><span>Parcelas:</span><strong>{(pagamento?.blocos || []).length} bloco(s)</strong></div>
                                        </div>
                                        <button
                                            onClick={aprovarOrcamento}
                                            disabled={aprovandoOrc}
                                            className="w-full py-2.5 text-sm font-bold rounded-lg cursor-pointer flex items-center justify-center gap-2 transition-all"
                                            style={{ background: 'var(--primary)', color: '#fff', opacity: aprovandoOrc ? 0.6 : 1 }}
                                        >
                                            <CheckCircle size={16} /> {aprovandoOrc ? 'Aprovando...' : 'Confirmar Aprovação'}
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Projeto Criado (sucesso) ── */}
            {projetoCriadoInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                        <div className="p-6">
                            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--primary-alpha, rgba(19,121,240,0.12))' }}>
                                <CheckCircle size={32} style={{ color: 'var(--primary)' }} />
                            </div>
                            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Orçamento Aprovado!</h3>
                            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                O projeto <strong>{projetoCriadoInfo.numero}</strong> foi criado com sucesso, incluindo etapas padrão e contas a receber.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setProjetoCriadoInfo(null); nav('projetos'); }}
                                    className="flex-1 py-2.5 text-sm font-semibold rounded-lg cursor-pointer"
                                    style={{ background: 'var(--primary)', color: '#fff' }}
                                >
                                    Abrir Projeto
                                </button>
                                <button
                                    onClick={() => { setProjetoCriadoInfo(null); reload(); }}
                                    className={`${Z.btn2} flex-1 py-2.5 text-sm`}
                                >
                                    Continuar Editando
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Desbloqueio de Edição ── */}
            {showUnlockModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setShowUnlockModal(false)}>
                    <div className="rounded-xl shadow-2xl max-w-sm w-full mx-4"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--warning)' }}>
                                <ShieldAlert size={16} /> Desbloquear Edição
                            </h3>
                            <button onClick={() => setShowUnlockModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4">
                            <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--warning-hover)', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <strong>Atenção:</strong> Este orçamento já gerou um projeto. Alterações podem impactar dados vinculados (contas a receber, etapas, portal do cliente).
                            </div>
                            <label className={Z.lbl}>Digite <strong>EDITAR</strong> para confirmar</label>
                            <input
                                value={unlockText}
                                onChange={e => setUnlockText(e.target.value.toUpperCase())}
                                placeholder="EDITAR"
                                className={`${Z.inp} w-full text-center font-bold tracking-widest`}
                                style={{ fontSize: 16 }}
                                autoFocus
                            />
                            <button
                                onClick={() => { setUnlocked(true); setShowUnlockModal(false); }}
                                disabled={unlockText !== 'EDITAR'}
                                className={`${Z.btn} w-full mt-3 py-2.5`}
                                style={{ opacity: unlockText !== 'EDITAR' ? 0.4 : 1 }}>
                                <Unlock size={14} className="inline mr-1" /> Desbloquear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Criar Nova Versão ── */}
            {showVersaoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => setShowVersaoModal(false)}>
                    <div className={`${Z.card} w-full max-w-md`} onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#8b5cf6' }}>
                                <GitBranch size={16} /> Criar Nova Versão
                            </h3>
                            <button onClick={() => setShowVersaoModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4 flex flex-col gap-4">
                            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                Uma cópia completa do orçamento será criada como nova revisão. A versão atual ficará como histórico (somente leitura).
                            </p>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>Motivo da revisão (opcional)</label>
                                <textarea value={motivoVersao} onChange={e => setMotivoVersao(e.target.value)}
                                    placeholder="Ex: Cliente pediu para trocar granito por quartzo..." maxLength={300}
                                    className={`${Z.inp} w-full text-sm resize-none`} style={{ minHeight: 60 }} />
                                <div className="text-[10px] text-right mt-1" style={{ color: 'var(--text-muted)' }}>{motivoVersao.length}/300</div>
                            </div>
                            <button
                                onClick={() => criarNovaVersao(motivoVersao)}
                                disabled={criandoVersao}
                                className={`${Z.btn} w-full py-2.5`}
                                style={{ background: '#8b5cf6', opacity: criandoVersao ? 0.4 : 1 }}>
                                <GitBranch size={14} className="inline mr-1" /> {criandoVersao ? 'Criando...' : 'Criar Revisão'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Comparar Versões (Diff) ── */}
            {showDiffModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
                    onClick={() => { setShowDiffModal(false); setDiffData(null); }}>
                    <div className="rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="p-4 flex items-center justify-between sticky top-0 z-10" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#8b5cf6' }}>
                                <ArrowUpDown size={16} /> Comparar Versões
                            </h3>
                            <div className="flex items-center gap-2">
                                <select value={diffV1Id || ''} onChange={e => { const v = Number(e.target.value); setDiffV1Id(v); if (v && diffV2Id) abrirComparacao(v, diffV2Id); }}
                                    className={`${Z.inp} text-xs py-1`} style={{ minWidth: 100 }}>
                                    <option value="">De...</option>
                                    {versoes.map(v => <option key={v.id} value={v.id}>{v.versao === 1 ? 'v1' : `R${v.versao}`} — {R$(v.valor_venda)}</option>)}
                                </select>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>→</span>
                                <select value={diffV2Id || ''} onChange={e => { const v = Number(e.target.value); setDiffV2Id(v); if (diffV1Id && v) abrirComparacao(diffV1Id, v); }}
                                    className={`${Z.inp} text-xs py-1`} style={{ minWidth: 100 }}>
                                    <option value="">Para...</option>
                                    {versoes.map(v => <option key={v.id} value={v.id}>{v.versao === 1 ? 'v1' : `R${v.versao}`} — {R$(v.valor_venda)}</option>)}
                                </select>
                                <button onClick={() => { setShowDiffModal(false); setDiffData(null); }} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                            </div>
                        </div>
                        <div className="p-4">
                            {loadingDiff && <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>Calculando diferenças...</div>}
                            {diffData && !loadingDiff && (() => {
                                const { diff, v1, v2 } = diffData;
                                const valorDiff = (v2.valor_venda || 0) - (v1.valor_venda || 0);
                                const pctDiff = v1.valor_venda ? ((valorDiff / v1.valor_venda) * 100) : 0;
                                return (
                                    <div className="flex flex-col gap-4">
                                        {/* Resumo */}
                                        <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                <strong>{v1.versao === 1 ? 'v1' : `R${v1.versao}`}</strong> {R$(v1.valor_venda)} → <strong>{v2.versao === 1 ? 'v1' : `R${v2.versao}`}</strong> {R$(v2.valor_venda)}
                                            </div>
                                            <span className="text-sm font-bold" style={{ color: valorDiff >= 0 ? 'var(--success)' : 'var(--danger-hover)' }}>
                                                {valorDiff >= 0 ? '+' : ''}{R$(valorDiff)} ({valorDiff >= 0 ? '+' : ''}{N(pctDiff, 1)}%)
                                            </span>
                                        </div>
                                        {/* Ambientes adicionados */}
                                        {diff.ambientes.added.map((a, i) => (
                                            <div key={`add-${i}`} className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', color: 'var(--success)' }}>
                                                <strong>+ Adicionado:</strong> {a.nome} ({a.itensCount} itens)
                                            </div>
                                        ))}
                                        {/* Ambientes removidos */}
                                        {diff.ambientes.removed.map((a, i) => (
                                            <div key={`rem-${i}`} className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger-hover)' }}>
                                                <strong>- Removido:</strong> {a.nome} ({a.itensCount} itens)
                                            </div>
                                        ))}
                                        {/* Ambientes modificados */}
                                        {diff.ambientes.modified.map((a, i) => (
                                            <div key={`mod-${i}`} className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.2)' }}>
                                                <div className="px-3 py-2 text-xs font-bold" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--warning-hover)' }}>~ Modificado: {a.nome}</div>
                                                <div className="px-3 py-2 flex flex-col gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                    {a.itens.added.map((it, j) => <div key={`ia-${j}`} style={{ color: 'var(--success)' }}>+ {it.nome} {it.dims ? `(${it.dims.l}×${it.dims.a})` : ''}</div>)}
                                                    {a.itens.removed.map((it, j) => <div key={`ir-${j}`} style={{ color: 'var(--danger-hover)' }}>- {it.nome} {it.dims ? `(${it.dims.l}×${it.dims.a})` : ''}</div>)}
                                                    {a.itens.modified.map((it, j) => (
                                                        <div key={`im-${j}`} style={{ color: 'var(--warning-hover)' }}>~ {it.nome}: {it.diffs.map(d => `${d.campo} ${d.de}→${d.para}`).join(', ')}</div>
                                                    ))}
                                                    {a.paineis.added.map((p, j) => <div key={`pa-${j}`} style={{ color: 'var(--success)' }}>+ Painel: {p.nome}</div>)}
                                                    {a.paineis.removed.map((p, j) => <div key={`pr-${j}`} style={{ color: 'var(--danger-hover)' }}>- Painel: {p.nome}</div>)}
                                                    {a.itensEspeciais.added.map((e, j) => <div key={`ea-${j}`} style={{ color: 'var(--success)' }}>+ Especial: {e.nome}</div>)}
                                                    {a.itensEspeciais.removed.map((e, j) => <div key={`er-${j}`} style={{ color: 'var(--danger-hover)' }}>- Especial: {e.nome}</div>)}
                                                </div>
                                            </div>
                                        ))}
                                        {/* Sem alteração */}
                                        {diff.ambientes.unchanged.length > 0 && (
                                            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                Sem alterações: {diff.ambientes.unchanged.map(a => a.nome).join(', ')}
                                            </div>
                                        )}
                                        {/* Taxas */}
                                        {diff.taxas.changed.length > 0 && (
                                            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(100,116,139,0.2)' }}>
                                                <div className="px-3 py-2 text-xs font-bold" style={{ background: 'rgba(100,116,139,0.06)', color: 'var(--text-muted)' }}>Taxas alteradas</div>
                                                <div className="px-3 py-2 flex flex-col gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                    {diff.taxas.changed.map((t, i) => <div key={i}>{t.label}: {t.de} → {t.para}</div>)}
                                                </div>
                                            </div>
                                        )}
                                        {/* Pagamento */}
                                        {diff.pagamento.changed && (
                                            <div className="px-3 py-2 rounded-lg text-[11px]" style={{ background: 'rgba(100,116,139,0.04)', color: 'var(--text-muted)', border: '1px solid rgba(100,116,139,0.15)' }}>
                                                Condições de pagamento foram alteradas
                                            </div>
                                        )}
                                        {!diff.ambientes.added.length && !diff.ambientes.removed.length && !diff.ambientes.modified.length && !diff.taxas.changed.length && !diff.pagamento.changed && (
                                            <div className="text-center py-4 text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma diferença encontrada</div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {novoConfirm && (
                <ConfirmModal
                    title={novoConfirm.title || 'Confirmar ação'}
                    message={novoConfirm.msg}
                    onConfirm={() => { const fn = novoConfirm.onOk; setNovoConfirm(null); fn(); }}
                    onCancel={() => setNovoConfirm(null)}
                />
            )}
        </div>
    );
}
