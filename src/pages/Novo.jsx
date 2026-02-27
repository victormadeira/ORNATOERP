import { useState, useMemo, useEffect, useRef } from 'react';
import { Z, Ic, Modal, SearchableSelect } from '../ui';
import { uid, R$, N, DB_CHAPAS, DB_ACABAMENTOS, DB_FERRAGENS, DB_FITAS, FERR_GROUPS, calcItemV2, calcPainelRipado, precoVenda, precoVendaV2, LOCKED_COLS } from '../engine';
import api from '../api';
import RelatorioMateriais, { buildRelatorioHtml } from './RelatorioMateriais';
import { buildPropostaHtml } from './PropostaHtml';
import { buildContratoHtml } from './ContratoHtml';
import {
    FileText, BarChart3, FileSignature, Plus, ChevronDown, ChevronRight, Trash2, Copy,
    FolderOpen, Package, Settings, Layers, X, RefreshCw, Wrench, AlertTriangle, Box, Search,
    ToggleLeft, ToggleRight, Info, CreditCard, Eye, Globe, Monitor, Smartphone, Clock, ExternalLink, Share2,
    Lock, Unlock, ShieldAlert, FilePlus2, CheckCircle,
} from 'lucide-react';

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
    const isSubst = effFerrId !== si.ferrId;
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
                <select
                    value={ferrOvr || si.ferrId}
                    onChange={e => onFerrChange(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="text-[10px] px-1 py-0.5 rounded border input-glass"
                    style={{ maxWidth: 120, flexShrink: 0 }}>
                    {puxadores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
            )}
            {fe && <span className="text-[10px] font-semibold shrink-0" style={{ color: ativo ? '#a855f7' : 'var(--text-muted)' }}>{R$(fe.preco)}</span>}
        </div>
    );
}

// ── Componente: seletor de módulos com busca ─────────────────────────────────
function CaixaSearch({ caixas, onSelect, onAddPainel }) {
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
                    placeholder="+ Adicionar módulo... (digite para buscar)"
                    onChange={e => { setQ(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    className="flex-1 bg-transparent outline-none text-sm"
                    style={{ color: 'var(--text-primary)', minWidth: 0 }} />
                {q && <button onClick={() => setQ('')} className="p-0.5 rounded hover:bg-red-500/10 cursor-pointer" style={{ color: 'var(--text-muted)' }}><X size={12} /></button>}
            </div>
            {open && (filtered.length > 0 || q.trim()) && (
                <div className="absolute left-0 right-0 mt-1 rounded-lg shadow-lg overflow-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', maxHeight: 240, zIndex: 50 }}>
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
                    <button onClick={() => { onAddPainel(); setQ(''); setOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm cursor-pointer flex items-center gap-2"
                        style={{ color: '#f59e0b' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <Layers size={14} />
                        <span>⬡ Painel Ripado / Muxarabi</span>
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Componente: editor de instância de componente dentro de uma caixa ────────
function ComponenteInstancia({ ci, idx, caixaDims, mats, compDef, onUpdate, onRemove, chapasDB, acabDB, ferragensDB, globalPadroes }) {
    const [exp, setExp] = useState(true);
    const [showDims, setShowDims] = useState(false);

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
        { id: 'dimL', key: 'L', label: 'Comprimento', auto: autoL },
        { id: 'dimA', key: 'A', label: 'Altura',       auto: autoA },
        { id: 'dimP', key: 'P', label: 'Profundidade', auto: autoP },
    ];
    const dimFields = ALL_DIM_FIELDS.filter(f => dimsAplicaveis.includes(f.key));

    const temDimsCustom = dimFields.some(f => ci[f.id] > 0);
    const temMatsCustom = !!(ci.matIntInst || ci.matExtInst);

    return (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', borderLeft: '3px solid #16a34a' }}>
            <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)]"
                onClick={() => setExp(p => !p)}>
                <div className="flex items-center gap-2 flex-wrap">
                    {exp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Package size={12} style={{ color: '#16a34a' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{compDef.nome}</span>
                    {(ci.qtd || 1) > 1 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(22,163,74,0.12)', color: '#16a34a' }}>×{ci.qtd}</span>
                    )}
                    {hasFrenteExt && ci.matExtComp && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>frente ext.</span>
                    )}
                    {temDimsCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
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
                    <span className="text-xs font-bold" style={{ color: '#16a34a' }}>{R$(custoComp)}</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-0.5 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><X size={12} /></button>
                </div>
            </div>
            {exp && (
                <div className="px-3 pb-3 pt-2 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                    {/* Quantidade e variáveis próprias */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                            <label className={Z.lbl}>Quantidade</label>
                            <input type="number" min="1" max="50" value={ci.qtd || 1}
                                onChange={e => onUpdate({ ...ci, qtd: Math.max(1, +e.target.value || 1) })}
                                className={Z.inp} />
                        </div>
                        {(compDef.vars || []).map(v => {
                            const isAuto = v.default === 0; // vars com default=0 são derivadas da caixa
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

                    {/* ── Dimensões da instância ── */}
                    {(showDims || temDimsCustom) ? (
                        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.18)' }}>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3b82f6' }}>Dimensões personalizadas</span>
                                <div className="flex gap-2">
                                    {temDimsCustom && (
                                        <button onClick={() => {
                                            const reset = {};
                                            dimFields.forEach(f => { reset[f.id] = 0; });
                                            onUpdate({ ...ci, ...reset });
                                        }}
                                            className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-500/10"
                                            style={{ color: 'var(--text-muted)' }}>
                                            Resetar
                                        </button>
                                    )}
                                    <button onClick={() => setShowDims(false)}
                                        className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer hover:bg-[var(--bg-hover)]"
                                        style={{ color: 'var(--text-muted)' }}>
                                        Fechar
                                    </button>
                                </div>
                            </div>
                            <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${dimFields.length}, minmax(0, 1fr))` }}>
                                {dimFields.map(({ id, label, auto }) => (
                                    <div key={id}>
                                        <label className={Z.lbl}>{label}</label>
                                        <input
                                            type="number" min="0" max="5000"
                                            value={ci[id] > 0 ? ci[id] : ''}
                                            placeholder={auto ? `Herdar do módulo: ${auto}mm` : 'Herdar do módulo'}
                                            onChange={e => {
                                                const v = Math.max(0, +e.target.value || 0);
                                                onUpdate({ ...ci, [id]: v });
                                            }}
                                            className={Z.inp}
                                            style={ci[id] > 0 ? { borderColor: 'rgba(59,130,246,0.5)', background: 'rgba(59,130,246,0.04)' } : {}}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowDims(true)}
                            className="text-[11px] py-1.5 px-3 rounded-lg border border-dashed transition-colors text-left"
                            style={{ borderColor: 'rgba(59,130,246,0.3)', color: 'rgba(59,130,246,0.7)' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)'; e.currentTarget.style.background = 'rgba(59,130,246,0.04)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'; e.currentTarget.style.background = 'transparent'; }}>
                            + Alterar dimensões
                        </button>
                    )}

                    {/* ── Materiais da instância ── */}
                    <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.18)' }}>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#a855f7' }}>Materiais do Componente</span>
                            {temMatsCustom && (
                                <button onClick={() => onUpdate({ ...ci, matIntInst: '', matExtInst: '' })}
                                    className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-500/10"
                                    style={{ color: 'var(--text-muted)' }}>
                                    Resetar
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
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
                        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                            Override de material só para este componente. Ex: gaveta com interno azul e exterior preto, enquanto o módulo é vermelho.
                        </p>
                    </div>

                    {/* Frente externa — material exclusivo */}
                    {hasFrenteExt && (
                        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>Frente Externa — Material Exclusivo</span>
                                <Info size={11} style={{ color: '#f59e0b' }} title="A frente externa pode ter acabamento e material diferente do interior da gaveta — impacta diretamente no preço." />
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
    const custoChapas = Object.values(res.chapas).reduce((s, c) => s + c.n * c.mat.preco, 0);

    const TYPE_COLOR = { caixa: 'var(--primary)', tamponamento: '#3b82f6', componente: '#16a34a', frente_externa: '#f59e0b' };
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
                        <thead><tr>{['Material', 'Área (m²)', 'Chapas', 'Unit.', 'Total'].map(h => <th key={h} className={Z.th} style={{ padding: '3px 6px', fontSize: 9 }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {Object.values(res.chapas).map((c, i) => (
                                <tr key={i} className="hover:bg-[var(--bg-hover)]">
                                    <td className="td-glass" style={{ padding: '2px 6px' }}>{c.mat.nome}</td>
                                    <td className="td-glass text-right font-mono" style={{ padding: '2px 6px' }}>{N(c.area, 4)}</td>
                                    <td className="td-glass text-center font-bold" style={{ padding: '2px 6px', color: 'var(--primary)' }}>{c.n}</td>
                                    <td className="td-glass text-right" style={{ padding: '2px 6px', color: 'var(--text-muted)' }}>{R$(c.mat.preco)}</td>
                                    <td className="td-glass text-right font-semibold" style={{ padding: '2px 6px', color: 'var(--primary)' }}>{R$(c.n * c.mat.preco)}</td>
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
                    <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Ferragens</span><span className="font-mono">{R$(custoFerragens)}</span></div>
                    <div className="flex justify-between pt-1 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                        <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Custo material</span>
                        <span className="font-mono font-semibold">{R$(res.custo)}</span>
                    </div>
                    <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Coef. dificuldade (×{N(1 + coef, 2)})</span><span className="font-mono">{R$(res.custo * coef)}</span></div>
                    {qtd > 1 && <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Quantidade</span><span className="font-mono">×{qtd}</span></div>}
                    <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: '2px solid var(--primary)' }}>
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Custo total do item</span>
                        <span className="font-mono font-bold" style={{ color: 'var(--primary)' }}>{R$(res.custo * (1 + coef) * qtd)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── PainelCard — painel ripado/muxarabi inline no orçamento ──────────────────
function PainelCard({ painel, bibItems, onUpdate, onRemove }) {
    const [exp, setExp] = useState(false);
    const materiais = (bibItems || []).filter(m => m.tipo === 'material');
    const calc = useMemo(() => calcPainelRipado(painel, bibItems || []), [painel, bibItems]);
    const custo = (calc?.custoMaterial || 0) * (painel.qtd || 1);
    const up = (patch) => onUpdate({ ...painel, ...patch });

    return (
        <div className="rounded-lg border overflow-hidden mb-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', borderLeft: '3px solid #f59e0b' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setExp(!exp)}>
                <div className="flex items-center gap-2">
                    {exp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <Layers size={13} style={{ color: '#f59e0b' }} />
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{painel.nome || 'Painel Ripado'}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#f59e0b15', color: '#f59e0b' }}>
                        {painel.tipo === 'muxarabi' ? 'Muxarabi' : 'Ripado'}
                    </span>
                    {calc && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{calc.nV} rip · {N(calc.mlTotal)}m</span>}
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold text-xs" style={{ color: '#f59e0b' }}>{R$(custo)}</span>
                    <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
            </div>

            {/* Expanded content */}
            {exp && (
                <div className="px-4 pb-4 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                    {/* Nome + tipo */}
                    <div className="grid grid-cols-2 gap-2">
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
                                        style={painel.tipo === id ? { background: '#f59e0b', color: '#fff' } : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                        {lb}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Dimensões + qtd */}
                    <div className="grid grid-cols-3 gap-2">
                        <div><label className={Z.lbl}>Largura (mm)</label><input type="number" className={Z.inp} min={100} value={painel.L || 2400} onChange={e => up({ L: +e.target.value })} /></div>
                        <div><label className={Z.lbl}>Altura (mm)</label><input type="number" className={Z.inp} min={100} value={painel.A || 2200} onChange={e => up({ A: +e.target.value })} /></div>
                        <div><label className={Z.lbl}>Qtd</label><input type="number" className={Z.inp} min={1} value={painel.qtd || 1} onChange={e => up({ qtd: Math.max(1, +e.target.value) })} /></div>
                    </div>

                    {/* Ripas V */}
                    <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-card)', borderColor: '#f59e0b30', borderLeft: '3px solid #f59e0b' }}>
                        <span className="text-[10px] uppercase tracking-widest font-bold block mb-2" style={{ color: '#f59e0b' }}>Ripas Verticais</span>
                        <div className="grid grid-cols-3 gap-2">
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
                                <div className="grid grid-cols-3 gap-2">
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
                                <div><span style={{ color: 'var(--text-muted)' }}>Custo mat.: </span><strong style={{ color: '#f59e0b' }}>{R$(calc.custoMaterial)}</strong></div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Novo({ clis, taxas: globalTaxas, editOrc, nav, reload, notify }) {
    const [cid, sc] = useState(editOrc?.cliente_id || '');
    const [projeto, setProjeto] = useState(editOrc?.projeto || '');
    const [numero, setNumero] = useState(editOrc?.numero || '');
    const [dataVenc, setDataVenc] = useState(editOrc?.data_vencimento || '');
    const [ambientes, setAmbientes] = useState(editOrc?.ambientes || []);
    const [obs, so] = useState(editOrc?.obs || '');
    const [expandedAmb, setExpandedAmb] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null);
    const [reportItemId, setReportItemId] = useState(null);
    const [addCompModal, setAddCompModal] = useState(null); // { ambId, itemId }
    const [showTipoAmbModal, setShowTipoAmbModal] = useState(false);
    const [ambTemplates, setAmbTemplates] = useState([]);
    const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(null); // ambId
    const [templateNome, setTemplateNome] = useState('');
    const [templateCategoria, setTemplateCategoria] = useState('');
    const [mkExpanded, setMkExpanded] = useState(false);

    // Catálogo e biblioteca do banco
    const [caixas, setCaixas] = useState([]);
    const [componentesCat, setComponentesCat] = useState([]);
    const [bibItems, setBibItems] = useState([]);

    useEffect(() => {
        api.get('/catalogo?tipo=caixa').then(setCaixas).catch(() => { });
        api.get('/catalogo?tipo=componente').then(setComponentesCat).catch(() => { });
        api.get('/biblioteca').then(setBibItems).catch(() => { });
        api.get('/orcamentos/templates').then(setAmbTemplates).catch(() => { });
    }, []);

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
        return {
            chapas: chapas.length > 0 ? chapas : DB_CHAPAS,
            ferragens: ferragens.length > 0 ? ferragens : DB_FERRAGENS,
            acabamentos: acabamentos.length > 0 ? acabamentos : DB_ACABAMENTOS,
            fitas: fitas.length > 0 ? fitas : DB_FITAS,
            topChapas,
            topAcab,
        };
    }, [bibItems]);

    const chapasDB = bib?.chapas || DB_CHAPAS;
    const acabDB = bib?.acabamentos || DB_ACABAMENTOS;
    const ferragensDB = bib?.ferragens || DB_FERRAGENS;
    const fitasDB = bib?.fitas || DB_FITAS;

    const [padroes, setPadroes] = useState(editOrc?.padroes || { corredica: '', dobradica: '', articulador: '' });

    const [pagamento, setPagamento] = useState(editOrc?.pagamento || {
        desconto: { tipo: '%', valor: 0 },
        blocos: [],
    });
    const [showRelatorio, setShowRelatorio] = useState(false);
    const [empresa, setEmpresa] = useState(null);
    const [prazoEntrega, setPrazoEntrega] = useState(editOrc?.prazo_entrega || '45 dias úteis');
    const [enderecoObra, setEnderecoObra] = useState(editOrc?.endereco_obra || '');
    const [validadeProposta, setValidadeProposta] = useState(editOrc?.validade_proposta || '15 dias');
    const [propostaModal, setPropostaModal] = useState(false);
    const [viewsData, setViewsData] = useState(null);
    const [showViews, setShowViews] = useState(false);

    // ── Trava de edição (orçamento aprovado) ──────────────────────────────────
    const isLocked = editOrc && LOCKED_COLS.includes(editOrc.kb_col);
    const isAditivo = editOrc?.tipo === 'aditivo';
    const [unlocked, setUnlocked] = useState(false);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [unlockText, setUnlockText] = useState('');
    const [showAditivoModal, setShowAditivoModal] = useState(false);
    const [motivoAditivo, setMotivoAditivo] = useState('');
    const [showAprovarModal, setShowAprovarModal] = useState(false);
    const [aprovandoOrc, setAprovandoOrc] = useState(false);
    const [projetoCriadoInfo, setProjetoCriadoInfo] = useState(null);
    const readOnly = isLocked && !unlocked;

    // Colunas pré-aprovação onde o botão Aprovar fica visível
    const PRE_APPROVE_COLS = ['lead', 'orc', 'env', 'neg'];

    // Carregar dados completos do orçamento (aditivos, parent_info, etc.)
    const [orcFull, setOrcFull] = useState(null);
    useEffect(() => {
        if (editOrc?.id) {
            api.get(`/orcamentos/${editOrc.id}`).then(setOrcFull).catch(() => {});
            api.get(`/portal/views/${editOrc.id}`).then(setViewsData).catch(() => {});
        }
    }, [editOrc?.id]);

    const addBloco = () => setPagamento(p => ({
        ...p,
        blocos: [...p.blocos, { id: uid(), descricao: '', percentual: 0, meio: 'pix', parcelas: 1 }],
    }));
    const removeBloco = (id) => setPagamento(p => ({ ...p, blocos: p.blocos.filter(b => b.id !== id) }));
    const upBloco = (id, field, val) => setPagamento(p => ({
        ...p,
        blocos: p.blocos.map(b => b.id === id ? { ...b, [field]: val } : b),
    }));

    const [localTaxas, setLocalTaxas] = useState(editOrc?.taxas || {
        imp: globalTaxas.imp, com: globalTaxas.com, mont: globalTaxas.mont,
        lucro: globalTaxas.lucro, frete: globalTaxas.frete,
        inst: globalTaxas.inst ?? 5,
        mk_chapas: globalTaxas.mk_chapas ?? 1.45,
        mk_ferragens: globalTaxas.mk_ferragens ?? 1.15,
        mk_fita: globalTaxas.mk_fita ?? 1.45,
        mk_acabamentos: globalTaxas.mk_acabamentos ?? 1.30,
        mk_acessorios: globalTaxas.mk_acessorios ?? 1.20,
        mk_mdo: globalTaxas.mk_mdo ?? 0.80,
    });
    const taxas = localTaxas;
    const setTaxa = (k, v) => setLocalTaxas(p => ({ ...p, [k]: parseFloat(v) || 0 }));

    // ── CRUD ─────────────────────────────────────────────────────────────────
    const upAmb = (ambId, fn) => setAmbientes(prev => prev.map(a => {
        if (a.id !== ambId) return a;
        const c = JSON.parse(JSON.stringify(a)); fn(c); return c;
    }));

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
            base.linhas = [{ id: uid(), descricao: '', qtd: 1, valorUnit: 0 }];
            base.itens = []; base.paineis = [];
        } else {
            base.itens = []; base.paineis = [];
        }
        setAmbientes([...ambientes, base]);
        setExpandedAmb(base.id);
    };
    const removeAmb = id => setAmbientes(p => p.filter(a => a.id !== id));

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
        if (clone.linhas) { for (const l of clone.linhas) { l.id = uid(); } }
        // Inserir logo após o original
        const idx = ambientes.findIndex(a => a.id === ambId);
        const newAmbs = [...ambientes];
        newAmbs.splice(idx + 1, 0, clone);
        setAmbientes(newAmbs);
        setExpandedAmb(clone.id);
        notify('Ambiente duplicado');
    };

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
    const createFromTemplate = (tpl) => {
        setShowTipoAmbModal(false);
        const data = typeof tpl.json_data === 'string' ? JSON.parse(tpl.json_data) : tpl.json_data;
        const base = { ...data, id: uid(), nome: tpl.nome };
        // Regenerar IDs
        if (base.itens) { for (const item of base.itens) { item.id = uid(); if (item.componentes) { for (const c of item.componentes) { c.id = uid(); } } } }
        if (base.paineis) { for (const p of base.paineis) { p.id = uid(); } }
        if (base.linhas) { for (const l of base.linhas) { l.id = uid(); } }
        setAmbientes([...ambientes, base]);
        setExpandedAmb(base.id);
    };

    const addItemToAmb = (ambId, caixaId) => {
        const caixaDef = caixas.find(c => c.db_id === caixaId);
        if (!caixaDef) return;
        const item = {
            id: uid(),
            caixaId: caixaDef.db_id,
            caixaDef: JSON.parse(JSON.stringify(caixaDef)),
            nome: caixaDef.nome,
            dims: { l: 600, a: caixaDef.cat === 'especial' ? 2400 : 2200, p: 550 },
            qtd: 1,
            mats: { matInt: 'mdf18', matExt: '' },
            componentes: [],
        };
        upAmb(ambId, a => a.itens.push(item));
        setExpandedItem(item.id);
    };

    const removeItem = (ambId, itemId) => upAmb(ambId, a => { a.itens = a.itens.filter(i => i.id !== itemId); });
    const copyItem = (ambId, itemId) => upAmb(ambId, a => {
        const src = a.itens.find(i => i.id === itemId);
        if (!src) return;
        const c = JSON.parse(JSON.stringify(src));
        c.id = uid();
        a.itens.push(c);
    });

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
        });
    });
    const removePainel = (ambId, pid) => upAmb(ambId, a => { a.paineis = (a.paineis || []).filter(p => p.id !== pid); });
    const upPainel = (ambId, pid, newP) => upAmb(ambId, a => {
        const idx = (a.paineis || []).findIndex(p => p.id === pid);
        if (idx >= 0) a.paineis[idx] = newP;
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
                    ambCm += (ln.qtd || 0) * (ln.valorUnit || 0);
                });
                manualTotal += ambCm;
                ambTotals.push({ id: amb.id, custo: ambCm, manual: true });
                return;
            }
            let ambCP = 0;
            amb.itens.forEach(item => {
                try {
                    const res = calcItemV2(item.caixaDef, item.dims, item.mats, item.componentes.map(ci => ({
                        compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                        matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                    })), bib, padroes);
                    const coef = item.caixaDef?.coef || 0;
                    const qtd = item.qtd || 1;
                    // Acumular custos brutos por categoria (sem coef — coef é aplicado no precoVendaV2)
                    const cChapas = (res.custoChapas || 0) * qtd;
                    const cFita = (res.custoFita || 0) * qtd;
                    const cFerr = (res.custoFerragens || 0) * qtd;
                    const cAcab = (res.custoAcabamentos || 0) * qtd;
                    totChapas += cChapas;
                    totFita += cFita;
                    totFerragens += cFerr;
                    totAcabamentos += cAcab;
                    const itemCusto = cChapas + cFita + cFerr + cAcab;
                    cm += itemCusto; ambCm += itemCusto;
                    at += res.area * qtd;
                    ft += res.fita * qtd;
                    // Calcular CP (custo de produção) individual deste item com markups
                    const mk = { chapas: taxas.mk_chapas ?? 1.45, fita: taxas.mk_fita ?? 1.45, acabamentos: taxas.mk_acabamentos ?? 1.30, ferragens: taxas.mk_ferragens ?? 1.15, mdo: taxas.mk_mdo ?? 0.80 };
                    const _ca = cChapas * (1 + coef);
                    const _fa = cFita * (1 + coef);
                    const _aa = cAcab * (1 + coef);
                    const itemCP = _ca * mk.chapas + _fa * mk.fita + _aa * mk.acabamentos + cFerr * mk.ferragens + _ca * mk.mdo;
                    ambCP += itemCP;
                    itemCostList.push({ itemId: item.id, ambId: amb.id, custoItem: itemCusto, itemCP, coef, ajuste: item.ajuste || null });
                    Object.entries(res.chapas).forEach(([id, c]) => {
                        if (!ca[id]) ca[id] = { mat: c.mat, area: 0, n: 0 };
                        ca[id].area += c.area * qtd;
                        const perda = c.mat.perda_pct != null ? c.mat.perda_pct : 15;
                        const areaUtil = ((c.mat.larg * c.mat.alt) / 1e6) * (1 - perda / 100);
                        ca[id].n = areaUtil > 0 ? Math.ceil(ca[id].area / areaUtil) : 1;
                    });
                    res.ferrList.forEach(f => {
                        if (!fa[f.id]) fa[f.id] = { ...f, qtd: 0 };
                        fa[f.id].qtd += f.qtd * qtd;
                    });
                } catch (_) { }
            });
            // ── Painéis ripados (custo vai pra chapas) ──
            (amb.paineis || []).forEach(painel => {
                try {
                    const res = calcPainelRipado(painel, bibItems);
                    if (res) {
                        const pc = res.custoMaterial * (painel.qtd || 1);
                        totChapas += pc;
                        cm += pc; ambCm += pc;
                        // CP do painel: custo × markup chapas (sem coef — painel não tem dificuldade)
                        const mkC = taxas.mk_chapas ?? 1.45;
                        const mkMdo = taxas.mk_mdo ?? 0.80;
                        ambCP += pc * mkC + pc * mkMdo;
                    }
                } catch (_) { }
            });
            ambTotals.push({ id: amb.id, custo: ambCm, cp: ambCP });
        });

        // ── Engine v2: precoVendaV2 com markups por categoria ──
        // Calcular coef médio ponderado (baseado nos custos de cada item)
        const totalCustoItens = itemCostList.reduce((s, i) => s + i.custoItem, 0);
        const coefMedio = totalCustoItens > 0
            ? itemCostList.reduce((s, i) => s + i.coef * i.custoItem, 0) / totalCustoItens
            : 0.25;

        const pvResult = precoVendaV2(
            { chapas: totChapas, fita: totFita, acabamentos: totAcabamentos, ferragens: totFerragens, acessorios: totAcessorios },
            coefMedio,
            taxas,
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
        return {
            cm, at, ft, ca, fa, pv, cp,
            pvErro: pvResult.erro, pvMsg: pvResult.msg,
            custoMdo, totChapas, totFita, totFerragens, totAcabamentos, totAcessorios,
            ambTotals, totalAjustes, pvFinal, manualTotal, totalItemCP, itemCostList,
            breakdown: pvResult.breakdown,
            cb: cp, // compatibilidade
        };
    }, [ambientes, taxas, bib]);

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

    const salvar = async () => {
        if (!cid) { notify('Selecione um cliente'); return; }
        if (ambientes.every(a => {
            if (a.tipo === 'manual') return (a.linhas || []).length === 0;
            return a.itens.length === 0 && (a.paineis || []).length === 0;
        })) { notify('Adicione pelo menos um item'); return; }
        const cl = clis.find(c => c.id === parseInt(cid));
        try {
            const data = {
                cliente_id: parseInt(cid), cliente_nome: cl?.nome || '—',
                projeto, numero, data_vencimento: dataVenc || null,
                ambientes, obs, custo_material: tot.cm, valor_venda: pvComDesconto,
                status: 'rascunho', taxas: localTaxas, padroes, pagamento,
                prazo_entrega: prazoEntrega, endereco_obra: enderecoObra, validade_proposta: validadeProposta,
                ...(unlocked ? { force_unlock: true } : {}),
            };
            if (editOrc?.id) await api.put(`/orcamentos/${editOrc.id}`, data);
            else await api.post('/orcamentos', data);
            if (unlocked) setUnlocked(false); // Re-travar após salvar
            notify('Orçamento salvo!'); reload();
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

    // ── Aprovar orçamento ──────────────────────────────────────────────────
    const validarAprovacao = () => {
        try {
            const erros = [];
            if (!cid) erros.push('Cliente não selecionado');
            if (!ambientes || ambientes.length === 0 || ambientes.every(a => {
                if (a.tipo === 'manual') return (a.linhas || []).length === 0;
                return (a.itens || []).length === 0 && (a.paineis || []).length === 0;
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
                prazo_entrega: prazoEntrega, endereco_obra: enderecoObra, validade_proposta: validadeProposta,
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
                <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#3b82f6' }}>
                            <FilePlus2 size={16} />
                            <span className="font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)' }}>ADITIVO</span>
                            <span style={{ color: 'var(--text-secondary)' }}>Ref. orçamento <strong>{(orcFull?.parent_info || editOrc?.parent_info)?.numero}</strong> — {(orcFull?.parent_info || editOrc?.parent_info)?.cliente_nome}</span>
                        </div>
                        <button onClick={() => { api.get(`/orcamentos/${editOrc.parent_orc_id}`).then(o => nav('novo', o)).catch(() => notify('Erro ao abrir original')); }}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                            Abrir Original
                        </button>
                    </div>
                    {(orcFull?.motivo_aditivo || editOrc?.motivo_aditivo) && (
                        <div className="mt-2 text-[11px] px-3 py-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.05)', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            <strong style={{ fontStyle: 'normal', color: 'var(--text-muted)' }}>Motivo:</strong> {orcFull?.motivo_aditivo || editOrc?.motivo_aditivo}
                        </div>
                    )}
                </div>
            )}

            {/* ── Banner de trava (orçamento aprovado) ── */}
            {isLocked && (
                <div className="mb-4 px-4 py-3 rounded-xl flex items-center justify-between gap-3" style={{ background: unlocked ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)', border: `1px solid ${unlocked ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.35)'}` }}>
                    <div className="flex items-center gap-2 text-xs">
                        {unlocked ? <Unlock size={16} style={{ color: '#f59e0b' }} /> : <Lock size={16} style={{ color: '#f59e0b' }} />}
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                            {unlocked ? 'Desbloqueado temporariamente — salve para re-travar' : 'Orçamento aprovado — edição bloqueada'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {!unlocked && (
                            <button onClick={() => { setUnlockText(''); setShowUnlockModal(true); }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                                <Unlock size={12} className="inline mr-1" /> Desbloquear
                            </button>
                        )}
                        {!isAditivo && !unlocked && (
                            <button onClick={() => { setMotivoAditivo(''); setShowAditivoModal(true); }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                                <FilePlus2 size={12} className="inline mr-1" /> Criar Aditivo
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className="flex justify-between items-start mb-5">
                <div>
                    <h1 className={Z.h1}>{editOrc ? 'Editar' : 'Novo'} Orçamento</h1>
                    <p className={Z.sub}>Ambientes → Caixas → Componentes</p>
                </div>
                <div className="flex gap-2">
                    {editOrc?.id && PRE_APPROVE_COLS.includes(editOrc.kb_col) && (
                        <button
                            onClick={() => setShowAprovarModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
                            style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}
                        >
                            <CheckCircle size={16} /> Aprovar
                        </button>
                    )}
                    {!readOnly && <button onClick={salvar} className={Z.btn}>Salvar</button>}
                    <button onClick={() => nav('orcs')} className={Z.btn2}>← Voltar</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* ── Coluna principal ── */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    {/* Dados do projeto */}
                    <div className={Z.card}>
                        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}><Settings size={14} className="inline mr-1" />Dados do Projeto</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div><label className={Z.lbl}>Cliente *</label><select value={cid} onChange={e => sc(e.target.value)} className={Z.inp} disabled={readOnly}><option value="">Selecione...</option>{clis.map(c => <option key={c.id} value={c.id}>{c.nome}{c.arq ? ` (${c.arq})` : ''}</option>)}</select></div>
                            <div><label className={Z.lbl}>Nome do Projeto</label><input value={projeto} onChange={e => setProjeto(e.target.value)} placeholder="Ex: Cozinha Planejada" className={Z.inp} disabled={readOnly} /></div>
                            <div><label className={Z.lbl}>Nº da Proposta</label><input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Auto" className={Z.inp} disabled={readOnly} /></div>
                            <div><label className={Z.lbl}>Válida até</label><input type="date" value={dataVenc} onChange={e => setDataVenc(e.target.value)} className={Z.inp} disabled={readOnly} /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                            <div><label className={Z.lbl}>Prazo de Entrega</label><input value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)} placeholder="45 dias úteis" className={Z.inp} disabled={readOnly} /></div>
                            <div><label className={Z.lbl}>Endereço da Obra</label><input value={enderecoObra} onChange={e => setEnderecoObra(e.target.value)} placeholder="Rua, nº - Bairro" className={Z.inp} disabled={readOnly} /></div>
                            <div><label className={Z.lbl}>Validade da Proposta</label><input value={validadeProposta} onChange={e => setValidadeProposta(e.target.value)} placeholder="15 dias" className={Z.inp} disabled={readOnly} /></div>
                        </div>
                        <div className="mt-3"><label className={Z.lbl}>Observações</label><input value={obs} onChange={e => so(e.target.value)} placeholder="Notas gerais..." className={Z.inp} disabled={readOnly} /></div>
                    </div>

                    {/* Ambientes */}
                    <div className={Z.card}>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}><Layers size={14} /> Ambientes ({ambientes.length})</h2>
                            {!readOnly && <button onClick={addAmbiente} className={`${Z.btn} text-xs py-1.5 px-3`}><Plus size={13} /> Ambiente</button>}
                        </div>

                        {ambientes.length === 0 ? (
                            <div className="flex flex-col items-center py-10" style={{ color: 'var(--text-muted)' }}>
                                <FolderOpen size={32} />
                                <span className="text-sm mt-2">{readOnly ? 'Nenhum ambiente' : 'Adicione um ambiente para começar'}</span>
                                {!readOnly && <button onClick={addAmbiente} className={`${Z.btn} text-xs mt-3`}><Plus size={13} /> Criar Ambiente</button>}
                            </div>
                        ) : ambientes.map(amb => {
                            const isExpAmb = expandedAmb === amb.id;
                            const ambData = tot.ambTotals.find(a => a.id === amb.id) || {};
                            const ambPv = amb.tipo === 'manual' ? (ambData.custo || 0) : (tot.totalItemCP > 0 ? (ambData.cp || 0) / tot.totalItemCP * tot.pv : (ambData.custo || 0));
                            return (
                                <div key={amb.id} className="glass-card !p-0 overflow-hidden border-l-[3px] border-l-[var(--primary)] mb-3">
                                    {/* Header do ambiente */}
                                    <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setExpandedAmb(isExpAmb ? null : amb.id)}>
                                        <div className="flex items-center gap-3">
                                            {isExpAmb ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                                            <FolderOpen size={16} style={{ color: 'var(--primary)' }} />
                                            <input value={amb.nome} onClick={e => e.stopPropagation()}
                                                onChange={e => upAmb(amb.id, a => a.nome = e.target.value)}
                                                className="bg-transparent font-medium text-sm outline-none" style={{ color: 'var(--text-primary)', minWidth: 120 }} />
                                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                                {amb.tipo === 'manual'
                                                    ? `${(amb.linhas || []).length} item${(amb.linhas || []).length !== 1 ? 'ns' : ''}`
                                                    : `${amb.itens.length} caixa${amb.itens.length !== 1 ? 's' : ''}${(amb.paineis || []).length > 0 ? ` · ${amb.paineis.length} painel${amb.paineis.length > 1 ? 'is' : ''}` : ''}`
                                                }
                                            </span>
                                            {amb.tipo === 'manual' && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#f59e0b18', color: '#f59e0b', border: '1px solid #f59e0b30' }}>Manual</span>}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>{R$(ambPv)}</span>
                                            {!readOnly && (
                                                <>
                                                    <button onClick={e => { e.stopPropagation(); setShowSaveTemplateModal(amb.id); setTemplateNome(amb.nome); setTemplateCategoria(''); }} className="p-1 rounded hover:bg-green-500/10 text-green-400/50 hover:text-green-400" title="Salvar como template"><FilePlus2 size={13} /></button>
                                                    <button onClick={e => { e.stopPropagation(); duplicarAmbiente(amb.id); }} className="p-1 rounded hover:bg-violet-500/10 text-violet-400/50 hover:text-violet-400" title="Duplicar ambiente"><Copy size={13} /></button>
                                                    <button onClick={e => { e.stopPropagation(); removeAmb(amb.id); }} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {isExpAmb && amb.tipo === 'manual' && (
                                        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)', ...(readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                                            {/* ── Ambiente Manual: tabela de linhas ── */}
                                            <div className="py-3" style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Descricao</th>
                                                            <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', width: 70 }}>Qtd</th>
                                                            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', width: 120 }}>Valor Unit.</th>
                                                            <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', width: 110 }}>Subtotal</th>
                                                            <th style={{ width: 36 }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(amb.linhas || []).map((ln, li) => (
                                                            <tr key={ln.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                                <td style={{ padding: '6px 8px' }}>
                                                                    <input value={ln.descricao} placeholder="Ex: Armário sob medida, Terceirização..."
                                                                        onChange={e => upAmb(amb.id, a => { a.linhas[li].descricao = e.target.value; })}
                                                                        className={Z.inp} style={{ fontSize: 12, padding: '5px 8px' }} />
                                                                </td>
                                                                <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                                                    <input type="number" value={ln.qtd} min={1}
                                                                        onChange={e => upAmb(amb.id, a => { a.linhas[li].qtd = Math.max(1, parseInt(e.target.value) || 1); })}
                                                                        className={Z.inp} style={{ fontSize: 12, padding: '5px 4px', textAlign: 'center', width: 60 }} />
                                                                </td>
                                                                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                                                                    <input type="number" value={ln.valorUnit} min={0} step={0.01}
                                                                        onChange={e => upAmb(amb.id, a => { a.linhas[li].valorUnit = parseFloat(e.target.value) || 0; })}
                                                                        className={Z.inp} style={{ fontSize: 12, padding: '5px 8px', textAlign: 'right', width: 110 }} />
                                                                </td>
                                                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)', fontSize: 12 }}>
                                                                    {R$((ln.qtd || 0) * (ln.valorUnit || 0))}
                                                                </td>
                                                                <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                                                    {(amb.linhas || []).length > 1 && (
                                                                        <button onClick={() => upAmb(amb.id, a => { a.linhas = a.linhas.filter(l => l.id !== ln.id); })}
                                                                            className="p-1 rounded hover:bg-red-500/10 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                <button onClick={() => upAmb(amb.id, a => { a.linhas.push({ id: uid(), descricao: '', qtd: 1, valorUnit: 0 }); })}
                                                    className={`${Z.btn2} text-xs py-1.5 px-3 mt-3`}>
                                                    <Plus size={12} /> Adicionar item
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {isExpAmb && amb.tipo !== 'manual' && (
                                        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
                                            {/* Selector de caixa com busca */}
                                            {!readOnly && (
                                                <div className="py-3">
                                                    <CaixaSearch
                                                        caixas={caixas}
                                                        onSelect={id => addItemToAmb(amb.id, parseInt(id))}
                                                        onAddPainel={() => addPainel(amb.id)}
                                                    />
                                                    {caixas.length === 0 && (
                                                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Nenhuma caixa cadastrada. Vá em <strong>Engenharia de Módulos</strong> para criar.</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Lista de itens (caixas) */}
                                            {amb.itens.length === 0 ? (
                                                <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                                                    <Box size={24} className="mx-auto mb-2 opacity-40" />
                                                    <span className="text-xs">Selecione uma caixa acima</span>
                                                </div>
                                            ) : amb.itens.map(item => {
                                                const isItemExp = expandedItem === item.id;
                                                const coef = item.caixaDef?.coef || 0;
                                                let res = null;
                                                try {
                                                    res = calcItemV2(item.caixaDef, item.dims, item.mats, item.componentes.map(ci => ({
                                                        compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                                                        matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                                                    })), bib, padroes);
                                                } catch (_) { }

                                                // Buscar CP pré-calculado do item (consistente com o total)
                                                const itemCPData = (tot.itemCostList || []).find(x => x.itemId === item.id);
                                                const itemCP = itemCPData?.itemCP || 0;
                                                const precoItem = tot.totalItemCP > 0 ? (itemCP / tot.totalItemCP) * tot.pv : (res?.custo || 0);
                                                const aj = item.ajuste || { tipo: '%', valor: 0 };
                                                const ajusteR = aj.valor ? (aj.tipo === 'R' ? aj.valor : precoItem * (aj.valor / 100)) : 0;
                                                const precoItemFinal = precoItem + ajusteR;

                                                return (
                                                    <div key={item.id} className="rounded-lg border overflow-hidden mb-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', borderLeft: '3px solid var(--primary)' }}>
                                                        {/* Header do item */}
                                                        <div className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[var(--bg-hover)]" onClick={() => setExpandedItem(isItemExp ? null : item.id)}>
                                                            <div className="flex items-center gap-2">
                                                                {isItemExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                                <Box size={13} style={{ color: 'var(--primary)' }} />
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
                                                                {ajusteR !== 0 && (
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: ajusteR > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)', color: ajusteR > 0 ? '#16a34a' : '#ef4444' }}>
                                                                        {ajusteR > 0 ? '+' : ''}{aj.tipo === '%' ? `${aj.valor}%` : R$(ajusteR)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(precoItemFinal)}</span>
                                                                {!readOnly && <button onClick={e => { e.stopPropagation(); copyItem(amb.id, item.id); }} className="p-1 rounded hover:bg-[var(--bg-hover)]"><Copy size={12} /></button>}
                                                                {!readOnly && <button onClick={e => { e.stopPropagation(); removeItem(amb.id, item.id); }} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>}
                                                            </div>
                                                        </div>

                                                        {isItemExp && (
                                                            <div className="px-4 pb-4 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', ...(readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                                                                {/* Descrição do módulo */}
                                                                <div>
                                                                    <label className={Z.lbl}>Descrição do Módulo</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder={`Ex: ${item.nome} — Cozinha inferior, Parede direita...`}
                                                                        value={item.desc || ''}
                                                                        onChange={e => upItem(amb.id, item.id, it => it.desc = e.target.value)}
                                                                        className={Z.inp}
                                                                        style={item.desc ? { borderColor: 'rgba(19,121,240,0.4)', background: 'rgba(19,121,240,0.03)' } : {}}
                                                                    />
                                                                </div>

                                                                {/* Ajuste de Preço */}
                                                                <div>
                                                                    <label className={Z.lbl}>Ajuste de Preço <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(desconto negativo · acréscimo positivo)</span></label>
                                                                    <div className="flex gap-2 items-center">
                                                                        <div className="flex rounded overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => upItem(amb.id, item.id, it => { if (!it.ajuste) it.ajuste = { tipo: '%', valor: 0 }; it.ajuste.tipo = '%'; })}
                                                                                className="px-2 py-1 text-xs font-bold transition-colors"
                                                                                style={{ background: (item.ajuste?.tipo ?? '%') === '%' ? 'var(--primary)' : 'var(--bg-muted)', color: (item.ajuste?.tipo ?? '%') === '%' ? '#fff' : 'var(--text-muted)' }}>
                                                                                %
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => upItem(amb.id, item.id, it => { if (!it.ajuste) it.ajuste = { tipo: 'R', valor: 0 }; it.ajuste.tipo = 'R'; })}
                                                                                className="px-2 py-1 text-xs font-bold transition-colors"
                                                                                style={{ background: item.ajuste?.tipo === 'R' ? 'var(--primary)' : 'var(--bg-muted)', color: item.ajuste?.tipo === 'R' ? '#fff' : 'var(--text-muted)' }}>
                                                                                R$
                                                                            </button>
                                                                        </div>
                                                                        <input
                                                                            type="number"
                                                                            step="0.1"
                                                                            placeholder="0"
                                                                            value={item.ajuste?.valor ?? ''}
                                                                            onChange={e => upItem(amb.id, item.id, it => {
                                                                                if (!it.ajuste) it.ajuste = { tipo: '%', valor: 0 };
                                                                                it.ajuste.valor = parseFloat(e.target.value) || 0;
                                                                            })}
                                                                            className={Z.inp}
                                                                            style={ajusteR !== 0 ? { borderColor: ajusteR > 0 ? 'rgba(22,163,74,0.5)' : 'rgba(239,68,68,0.5)' } : {}}
                                                                        />
                                                                        {ajusteR !== 0 && (
                                                                            <span className="text-xs whitespace-nowrap font-bold" style={{ color: ajusteR > 0 ? '#16a34a' : '#ef4444' }}>
                                                                                {ajusteR > 0 ? '+' : ''}{R$(ajusteR)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {ajusteR !== 0 && (
                                                                        <div className="text-[10px] mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                                                                            <span>Base: {R$(precoItem)}</span>
                                                                            <span>→</span>
                                                                            <span className="font-semibold" style={{ color: ajusteR > 0 ? '#16a34a' : '#ef4444' }}>Final: {R$(precoItemFinal)}</span>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Dimensões e quantidade */}
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                                    {[['Largura (mm)', 'l'], ['Altura (mm)', 'a'], ['Profund. (mm)', 'p']].map(([lbl, k]) => (
                                                                        <div key={k}>
                                                                            <label className={Z.lbl}>{lbl}</label>
                                                                            <input type="number" value={item.dims[k]}
                                                                                onChange={e => upItem(amb.id, item.id, it => it.dims[k] = +e.target.value || 0)}
                                                                                className={Z.inp} />
                                                                        </div>
                                                                    ))}
                                                                    <div>
                                                                        <label className={Z.lbl}>Quantidade</label>
                                                                        <input type="number" min="1" value={item.qtd || 1}
                                                                            onChange={e => upItem(amb.id, item.id, it => it.qtd = Math.max(1, +e.target.value || 1))}
                                                                            className={Z.inp} />
                                                                    </div>
                                                                </div>

                                                                {/* Materiais */}
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                    <div>
                                                                        <label className={Z.lbl}>Material Interno (chapas)</label>
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
                                                                        <label className={Z.lbl}>Material Externo (tamponamento)</label>
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

                                                                {/* Componentes */}
                                                                <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#16a34a' }}>Componentes ({item.componentes.length})</span>
                                                                        <button onClick={() => setAddCompModal({ ambId: amb.id, itemId: item.id })}
                                                                            className="text-[10px] px-2 py-0.5 rounded font-semibold cursor-pointer flex items-center gap-1"
                                                                            style={{ background: '#16a34a', color: '#fff' }}>
                                                                            <Plus size={10} /> Adicionar
                                                                        </button>
                                                                    </div>
                                                                    {item.componentes.length === 0
                                                                        ? <div className="text-center py-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>Adicione gavetas, prateleiras, portas...</div>
                                                                        : <div className="flex flex-col gap-1.5">
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
                                                                    }
                                                                </div>

                                                                {/* Toggle relatório */}
                                                                <button onClick={() => setReportItemId(reportItemId === item.id ? null : item.id)}
                                                                    className="w-full flex items-center justify-center gap-1.5 py-2 mt-1 rounded-md text-[10px] font-semibold cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                                                                    style={{ color: 'var(--text-muted)', borderTop: '1px dashed var(--border)' }}>
                                                                    {reportItemId === item.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                                    <BarChart3 size={11} />
                                                                    {reportItemId === item.id ? 'Ocultar detalhes' : 'Ver detalhes do cálculo'}
                                                                </button>

                                                                {reportItemId === item.id && res && (
                                                                    <RelatorioItem
                                                                        res={res}
                                                                        chapasDB={chapasDB}
                                                                        fitasDB={fitasDB}
                                                                        coef={coef}
                                                                        qtd={item.qtd || 1}
                                                                    />
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* ── Painéis Ripados ── */}
                                            {(amb.paineis || []).length > 0 && (
                                                <div className="mt-2">
                                                    <div className="text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5" style={{ color: '#f59e0b' }}>
                                                        <Layers size={10} /> Painéis ({amb.paineis.length})
                                                    </div>
                                                    {amb.paineis.map(painel => (
                                                        <PainelCard key={painel.id} painel={painel} bibItems={bibItems}
                                                            onUpdate={newP => upPainel(amb.id, painel.id, newP)}
                                                            onRemove={() => removePainel(amb.id, painel.id)} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* BOM Ferragens */}
                    {Object.keys(tot.fa).length > 0 && (
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: '#a855f7' }}>BOM — Ferragens do Orçamento</h3>
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
                    <div className="glass-card sticky top-[68px] overflow-hidden" style={{ borderTop: '2px solid var(--primary)' }}>
                        <div className="p-4">
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Resumo Financeiro</h3>
                            {ambientes.length > 0 && (
                                <div className="flex flex-col gap-1 mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
                                    {ambientes.map(a => (
                                        <div key={a.id} className="flex justify-between text-xs">
                                            <span className="truncate" style={{ color: 'var(--text-muted)' }}>{a.nome}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{R$(tot.ambTotals.find(x => x.id === a.id)?.custo || 0)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-col gap-1.5 text-xs">
                                {[['Custo Material', tot.cm], ['Mão de Obra', tot.custoMdo]].map(([l, v], i) => (
                                    <div key={i} className="flex justify-between">
                                        <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{R$(v)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-2 pt-2 flex justify-between text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Custo Produção</span>
                                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{R$(tot.cb)}</span>
                            </div>
                            {tot.manualTotal > 0 && (
                                <div className="mt-1 flex justify-between text-xs">
                                    <span style={{ color: '#f59e0b' }}>Amb. Manuais (direto)</span>
                                    <span className="font-bold" style={{ color: '#f59e0b' }}>{R$(tot.manualTotal)}</span>
                                </div>
                            )}

                            {/* Markups por Categoria (colapsável) */}
                            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)', ...(readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                                <button onClick={() => setMkExpanded(!mkExpanded)}
                                    className="flex items-center justify-between w-full cursor-pointer mb-1">
                                    <span className="text-[9px] font-semibold" style={{ color: 'var(--text-muted)' }}>Markups ×</span>
                                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{mkExpanded ? '▾' : '▸'}</span>
                                </button>
                                {mkExpanded && (
                                    <div className="flex flex-col gap-1 mt-1">
                                        {[['Chapas', 'mk_chapas'], ['Ferragens', 'mk_ferragens'], ['Fita', 'mk_fita'], ['Acabamentos', 'mk_acabamentos'], ['Acessórios', 'mk_acessorios'], ['Mão de Obra', 'mk_mdo']].map(([l, k]) => (
                                            <div key={k} className="flex items-center justify-between gap-2">
                                                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{l}</span>
                                                <div className="flex items-center gap-1">
                                                    <input type="number" step="0.05" min="0.1" value={taxas[k]} onChange={e => setTaxa(k, e.target.value)}
                                                        className="w-14 text-xs px-1.5 py-0.5 rounded border text-center input-glass" />
                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>×</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Taxas sobre PV */}
                            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)', ...(readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                                <div className="text-[9px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Taxas sobre PV (%)</div>
                                {[['Impostos', 'imp'], ['Comissão', 'com'], ['Lucro', 'lucro'], ['Frete', 'frete'], ['Instalação', 'inst'], ['Montagem', 'mont']].map(([l, k]) => (
                                    <div key={k} className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{l}</span>
                                        <div className="flex items-center gap-1">
                                            <input type="number" step="0.1" value={taxas[k]} onChange={e => setTaxa(k, e.target.value)}
                                                className="w-14 text-xs px-1.5 py-0.5 rounded border text-center input-glass" />
                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>%</span>
                                        </div>
                                    </div>
                                ))}
                                <div className="flex justify-between pt-1 mt-1 font-semibold text-[11px]" style={{ borderTop: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Σ Taxas</span>
                                    <span className={(taxas.imp + taxas.com + taxas.mont + taxas.lucro + taxas.frete + (taxas.inst || 0)) >= 100 ? 'text-red-500' : ''}>
                                        {(taxas.imp + taxas.com + taxas.mont + taxas.lucro + taxas.frete + (taxas.inst || 0)).toFixed(1)}%
                                    </span>
                                </div>
                            </div>

                            {/* Padrões de Ferragens — substituição global */}
                            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="text-[9px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Padrões de Ferragens</div>
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
                                                <span style={{ color: tot.totalAjustes > 0 ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                                                    {tot.totalAjustes > 0 ? '+' : ''}{R$(tot.totalAjustes)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
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
                            </div>
                        </div>
                        <div className="p-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                            {editOrc?.id && PRE_APPROVE_COLS.includes(editOrc.kb_col) && (
                                <button
                                    onClick={() => setShowAprovarModal(true)}
                                    className="w-full py-2.5 text-xs font-bold rounded-lg cursor-pointer flex items-center justify-center gap-1.5 transition-all"
                                    style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}
                                >
                                    <CheckCircle size={14} /> Aprovar Orçamento
                                </button>
                            )}
                            {!readOnly && <button onClick={salvar} className={`${Z.btn} w-full py-2.5 text-xs`}>Salvar Orçamento</button>}
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
                            }} className={`${Z.btn2} w-full py-2 text-xs`}><FileSignature size={13} /> Gerar Contrato</button>
                            <button onClick={async () => {
                                if (!empresa) {
                                    try { const emp = await api.get('/config/empresa'); setEmpresa(emp); } catch { }
                                }
                                setShowRelatorio(r => !r);
                            }} className={`${Z.btn2} w-full py-2 text-xs ${showRelatorio ? 'ring-1 ring-purple-500' : ''}`}>
                                <BarChart3 size={13} /> {showRelatorio ? 'Fechar Relatório' : 'Gerar Relatório'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

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
                                style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6', fontWeight: 600 }}>
                                <Eye size={11} /> {viewsData.new_visits || 0} visualizações
                            </button>
                        )}
                    </div>

                    {/* Botão gerar/copiar link */}
                    {viewsData?.token ? (
                        <div className="flex items-center gap-2 mb-2">
                            <input readOnly value={`${window.location.origin}/proposta/${viewsData.token}`}
                                className={`${Z.inp} flex-1 text-xs`} style={{ fontFamily: 'monospace' }}
                                onClick={e => { e.target.select(); navigator.clipboard.writeText(e.target.value); notify('Link copiado!'); }} />
                            <a href={`/proposta/${viewsData.token}`} target="_blank" rel="noreferrer"
                                className="p-2 rounded cursor-pointer" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                <ExternalLink size={14} />
                            </a>
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
                        Ao gerar a proposta (PDF), o conteúdo do link é atualizado automaticamente.
                    </p>

                    {/* Painel de visualizações expandido */}
                    {showViews && viewsData && viewsData.total > 0 && (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                            {/* Resumo */}
                            <div className="grid grid-cols-4 gap-2 mb-3">
                                {[
                                    { label: 'Visualizações', value: viewsData.new_visits || 0, icon: <Eye size={12} />, color: '#3b82f6' },
                                    { label: 'Dispositivos', value: viewsData.unique_devices || 0, icon: <Monitor size={12} />, color: '#8b5cf6' },
                                    { label: 'Tempo máx.', value: viewsData.max_tempo > 60 ? `${Math.round(viewsData.max_tempo / 60)}min` : `${viewsData.max_tempo || 0}s`, icon: <Clock size={12} />, color: '#f59e0b' },
                                    { label: 'Scroll máx.', value: `${viewsData.max_scroll || 0}%`, icon: <BarChart3 size={12} />, color: '#10b981' },
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
                                                    {d.dispositivo === 'Mobile' ? <Smartphone size={13} style={{ color: '#8b5cf6' }} /> : <Monitor size={13} style={{ color: '#3b82f6' }} />}
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

                            {/* Últimos acessos */}
                            {viewsData.views?.length > 0 && (
                                <div className="mt-3">
                                    <div className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: 'var(--text-muted)' }}>Últimos acessos</div>
                                    <div className="flex flex-col gap-1 max-h-40 overflow-auto">
                                        {viewsData.views.slice(0, 20).map((v, i) => (
                                            <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded"
                                                style={{ background: v.is_new_visit ? 'rgba(59,130,246,0.05)' : 'transparent' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    {new Date(v.acessado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span style={{ color: 'var(--text-primary)' }}>
                                                    {v.dispositivo === 'Mobile' ? <Smartphone size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> : <Monitor size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />}{v.navegador} · {v.os_name}
                                                </span>
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    {v.cidade || v.ip_cliente}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Condições de Pagamento ── */}
            <div className={`${Z.card} mt-5`} style={readOnly ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
                <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <CreditCard size={14} /> Condições de Pagamento
                    {readOnly && <Lock size={12} style={{ color: '#f59e0b' }} />}
                </h2>

                {/* Desconto Global */}
                <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
                    <label className={Z.lbl}>Desconto Global</label>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex rounded overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                            {['%', 'R$'].map(t => (
                                <button key={t}
                                    onClick={() => setPagamento(p => ({ ...p, desconto: { tipo: t, valor: 0 } }))}
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
                                <span style={{ color: '#ef4444' }}>− {R$(descontoR)}</span>
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

            {/* ── Relatório de Materiais ── */}
            {showRelatorio && (
                <RelatorioMateriais
                    empresa={empresa}
                    orcamento={{ numero, cliente_nome: clis.find(c => c.id === parseInt(cid))?.nome || '', projeto }}
                    ambientes={ambientes}
                    tot={tot}
                    bib={bib}
                    padroes={padroes}
                    taxas={taxas}
                    pagamento={pagamento}
                    pvComDesconto={pvComDesconto}
                    onClose={() => setShowRelatorio(false)}
                    onPdf={async () => {
                        try {
                            notify('Gerando PDF...');
                            const html = buildRelatorioHtml({
                                empresa, orcamento: { numero, cliente_nome: clis.find(c => c.id === parseInt(cid))?.nome || '', projeto },
                                ambientes, tot, taxas, pagamento, pvComDesconto, bib, padroes,
                            });
                            const blob = await api.postBlob('/pdf/generate', { html });
                            const url = URL.createObjectURL(blob);
                            window.open(url, '_blank');
                        } catch (ex) {
                            notify(ex.detail || ex.error || 'Erro ao gerar PDF');
                        }
                    }}
                />
            )}

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
                                            api.post('/portal/generate', { orc_id: editOrc.id, html_proposta: html, nivel: opt.id }).catch(() => {});
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
                                    style={{ borderColor: '#f59e0b40', background: '#f59e0b08' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <FileText size={22} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Manual</span>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                                        {ambTemplates.map(tpl => (
                                            <button key={tpl.id} onClick={() => createFromTemplate(tpl)}
                                                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md hover:border-[var(--primary)]"
                                                style={{ borderColor: 'var(--border)', background: 'var(--bg-muted)' }}>
                                                <Layers size={18} style={{ color: '#16a34a' }} />
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.2 }}>{tpl.nome}</span>
                                                {tpl.categoria && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{tpl.categoria}</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
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
                            {componentesCat.length === 0 ? (
                                <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                                    <Package size={28} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">Nenhum componente cadastrado</p>
                                    <p className="text-xs mt-1">Vá em <strong>Catálogo de Itens</strong> para criar</p>
                                </div>
                            ) : componentesCat.map(comp => (
                                <button key={comp.db_id}
                                    onClick={() => addComp(addCompModal.ambId, addCompModal.itemId, comp)}
                                    className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-[#16a34a]/40 hover:bg-[var(--bg-hover)] text-left w-full mb-1.5"
                                    style={{ borderColor: 'var(--border)' }}>
                                    <Package size={16} style={{ color: '#16a34a', marginTop: 2, flexShrink: 0 }} />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{comp.nome}</div>
                                        <div className="text-[10px] mt-0.5 flex gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                                            {comp.desc && <span>{comp.desc}</span>}
                                            {comp.frente_externa?.ativa && <span className="font-semibold" style={{ color: '#f59e0b' }}>+ frente externa</span>}
                                            {(comp.sub_itens || []).length > 0 && <span>{(comp.sub_itens || []).length} ferragem(ns)</span>}
                                            {(comp.vars || []).length > 0 && <span>{(comp.vars || []).map(v => `${v.id}=${v.default}${v.unit}`).join(', ')}</span>}
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(22,163,74,0.12)', color: '#16a34a' }}>×{1 + comp.coef}</span>
                                </button>
                            ))}
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
                                    <div className="absolute left-[-15px] top-1 w-3 h-3 rounded-full border-2" style={{ background: '#3b82f6', borderColor: '#3b82f6' }} />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>{badge}</span>
                                                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{ad.numero}</span>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${kcColors[ad.kb_col] || '#666'}22`, color: kcColors[ad.kb_col] || '#666' }}>
                                                    {ad.kb_col === 'ok' ? 'Aprovado' : ad.kb_col === 'lead' ? 'Em elaboração' : ad.kb_col}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold" style={{ color: '#3b82f6' }}>+{R$(ad.valor_venda || 0)}</span>
                                                <button onClick={() => api.get(`/orcamentos/${ad.id}`).then(o => nav('novo', o)).catch(() => notify('Erro'))}
                                                    className="text-[9px] font-semibold px-2 py-0.5 rounded cursor-pointer" style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>
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
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#3b82f6' }}>
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
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#16a34a' }}>
                                <CheckCircle size={16} /> Aprovar Orçamento
                            </h3>
                            <button onClick={() => setShowAprovarModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4">
                            {(() => {
                                const erros = validarAprovacao();
                                if (erros.length > 0) return (
                                    <div>
                                        <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>
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
                                            <strong style={{ color: '#16a34a' }}>Tudo certo!</strong> Ao aprovar, o orçamento será travado para edição e um projeto será criado automaticamente com as etapas padrão e contas a receber.
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
                                            style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', opacity: aprovandoOrc ? 0.6 : 1 }}
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
                            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.12)' }}>
                                <CheckCircle size={32} style={{ color: '#16a34a' }} />
                            </div>
                            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Orçamento Aprovado!</h3>
                            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                                O projeto <strong>{projetoCriadoInfo.numero}</strong> foi criado com sucesso, incluindo etapas padrão e contas a receber.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setProjetoCriadoInfo(null); nav('projetos'); }}
                                    className="flex-1 py-2.5 text-sm font-semibold rounded-lg cursor-pointer"
                                    style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff' }}
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
                            <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#f59e0b' }}>
                                <ShieldAlert size={16} /> Desbloquear Edição
                            </h3>
                            <button onClick={() => setShowUnlockModal(false)} className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer"><X size={16} /></button>
                        </div>
                        <div className="p-4">
                            <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e', border: '1px solid rgba(245,158,11,0.2)' }}>
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
        </div>
    );
}
