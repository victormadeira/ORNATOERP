import { useState, useEffect, useMemo } from 'react';
import { Z, Ic } from '../ui';
import { uid, R$, N, DB_CHAPAS, DB_FERRAGENS, DB_ACABAMENTOS, calcItemV2 } from '../engine';
import api from '../api';
import { Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronRight, Box, Package, Wrench, Eye, EyeOff, Copy, Layers, Search } from 'lucide-react';
import RipadoCalc from './Ripado';

// ── Safe formula evaluator ──────────────────────────────────────────────────
const SAFE_EXPR = /^[\d\s+\-*/().?:<>=]+$/;
function safeEval(expr, vars) {
    if (!expr || !expr.trim()) return null;
    try {
        let e = String(expr);
        // Replace variable names with values (longest first)
        const sorted = Object.keys(vars).sort((a, b) => b.length - a.length);
        for (const k of sorted) {
            if (vars[k] !== undefined) {
                e = e.replace(new RegExp(`\\b${k}\\b`, 'g'), String(vars[k]));
            }
        }
        if (!SAFE_EXPR.test(e)) return null;
        const result = Function('"use strict";return(' + e + ')')();
        return isFinite(result) ? result : null;
    } catch (_) { return null; }
}

// ── Defaults ────────────────────────────────────────────────────────────────
const EMPTY_CAIXA = {
    nome: '', cat: 'caixaria', desc: '', coef: 0.30,
    pecas: [
        { id: 'le', nome: 'Lateral Esq.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f'] },
        { id: 'ld', nome: 'Lateral Dir.',  qtd: 1, calc: 'A*P',   mat: 'int',   fita: ['f'] },
        { id: 'tp', nome: 'Topo',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f'] },
        { id: 'bs', nome: 'Base',          qtd: 1, calc: 'Li*P',  mat: 'int',   fita: ['f'] },
        { id: 'fn', nome: 'Fundo',         qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: []    },
    ],
    tamponamentos: [],
};

const EMPTY_COMP = {
    nome: '', cat: 'componente', desc: '', coef: 0.20,
    vars: [],
    varsDeriv: {},
    pecas: [],
    frente_externa: { ativa: false, id: 'fe', nome: 'Frente Externa', calc: 'Lg*ag', mat: 'ext_comp', fita: ['all'] },
    sub_itens: [],
};

const MAT_OPTIONS = [
    { value: 'int',      label: 'Material Interno (matInt)' },
    { value: 'ext',      label: 'Material Externo (matExt)' },
    { value: 'fundo',    label: 'Material Fundo (matFundo)' },
    { value: 'ext_comp', label: 'Material Exclusivo do Componente' },
    { value: 'mdf15',    label: 'MDF 15mm (fixo)' },
    { value: 'mdf18',    label: 'MDF 18mm (fixo)' },
    { value: 'mdf25',    label: 'MDF 25mm (fixo)' },
    { value: 'comp3',    label: 'Compensado 3mm (fixo)' },
];

const FITA_OPCOES = [
    { value: 'f', label: 'Frente' },
    { value: 'b', label: 'Baixo' },
    { value: 't', label: 'Topo' },
    { value: 'all', label: 'Todas (4 lados)' },
];

const FACE_OPTIONS = [
    { value: 'lat_esq', label: 'Lateral Esq.' },
    { value: 'lat_dir', label: 'Lateral Dir.' },
    { value: 'topo',    label: 'Topo' },
    { value: 'base',    label: 'Base' },
    { value: 'fundo',   label: 'Fundo/Costas' },
];

const FORMULAS_CAIXA = [
    { label: 'Lateral (A×P)', formula: 'A*P' },
    { label: 'Topo/Base (Li×P)', formula: 'Li*P' },
    { label: 'Fundo (Li×Ai)', formula: 'Li*Ai' },
    { label: 'Divisória (Ai×Pi)', formula: 'Ai*Pi' },
];

const FORMULAS_COMP = [
    { label: 'Frente gaveta (Lg×ag)', formula: 'Lg*ag' },
    { label: 'Lateral gaveta (Pg×ag)', formula: 'Pg*ag' },
    { label: 'Fundo gaveta (Lg×Pg)', formula: 'Lg*Pg' },
    { label: 'Prateleira (Lpr×Ppr)', formula: 'Lpr*Ppr' },
    { label: 'Porta (Lp×Ap)', formula: 'Lp*Ap' },
    { label: 'Divisória (Ldv×Pdv)', formula: 'Ldv*Pdv' },
];

const FORMULAS_FERRAGEM = [
    { label: 'Qtd fixa (1)', formula: '1' },
    { label: 'Por porta', formula: 'nPortas' },
    { label: 'Dobradiças auto', formula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
    { label: 'Metro linear', formula: 'Li/1000' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function FitaToggle({ value = [], onChange }) {
    const toggle = (v) => {
        if (v === 'all') return onChange(['all']);
        const cur = value.filter(x => x !== 'all');
        onChange(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
    };
    return (
        <div className="flex gap-1 flex-wrap">
            {FITA_OPCOES.map(f => (
                <button key={f.value} type="button" onClick={() => toggle(f.value)}
                    className="text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors"
                    style={value.includes(f.value) ? { background: 'var(--primary)', color: '#fff' } : { background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {f.label}
                </button>
            ))}
        </div>
    );
}

// ── FormulaInput ────────────────────────────────────────────────────────────
const CHIP_COLORS = {
    caixa: { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
    interno: { bg: '#e0e7ff', color: '#4338ca', border: '#a5b4fc' },
    derivada: { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
    propria: { bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
};

function FormulaInput({ value, onChange, vars = [], testVars = {}, placeholder, suggestions = [], className = '' }) {
    const [showSug, setShowSug] = useState(false);
    const result = safeEval(value, testVars);
    const hasVal = value && value.trim().length > 0;

    const insertVar = (varId) => {
        const newVal = value ? value + varId : varId;
        onChange(newVal);
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={`${Z.inp} font-mono text-xs ${className}`}
                    placeholder={placeholder || 'Ex: A*P'}
                    style={{ flex: 1 }}
                />
                {hasVal && (
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
                        background: result !== null ? '#dcfce7' : '#fee2e2',
                        color: result !== null ? '#15803d' : '#dc2626',
                    }}>
                        {result !== null ? `= ${N(result, result > 100 ? 0 : 2)}` : 'erro'}
                    </span>
                )}
                {suggestions.length > 0 && (
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setShowSug(p => !p)}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 10, padding: '3px 6px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                            title="Sugestões de fórmulas"
                        >fx</button>
                        {showSug && (
                            <div style={{
                                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20,
                                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 200, padding: 4,
                            }}>
                                {suggestions.map((s, i) => (
                                    <button key={i} type="button"
                                        onClick={() => { onChange(s.formula); setShowSug(false); }}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                                            fontSize: 11, background: 'none', border: 'none', cursor: 'pointer',
                                            borderRadius: 4, color: 'var(--text)',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    >
                                        <span style={{ fontWeight: 600 }}>{s.label}</span>
                                        <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{s.formula}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {vars.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                    {vars.map(v => {
                        const c = CHIP_COLORS[v.type] || CHIP_COLORS.caixa;
                        return (
                            <button key={v.id} type="button"
                                onClick={() => insertVar(v.id)}
                                title={`${v.label} = ${v.val}`}
                                style={{
                                    fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                                    padding: '1px 5px', borderRadius: 4, cursor: 'pointer',
                                    background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                                    lineHeight: '16px',
                                }}>
                                {v.id}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── VarDerivEditor ──────────────────────────────────────────────────────────
function VarDerivEditor({ varsDeriv, onChange, testVars }) {
    const entries = Object.entries(varsDeriv || {});

    const update = (oldKey, newKey, newFormula) => {
        const newMap = {};
        entries.forEach(([k, v]) => {
            if (k === oldKey) {
                if (newKey.trim()) newMap[newKey.trim()] = newFormula;
            } else {
                newMap[k] = v;
            }
        });
        onChange(newMap);
    };

    const remove = (key) => {
        const newMap = {};
        entries.forEach(([k, v]) => { if (k !== key) newMap[k] = v; });
        onChange(newMap);
    };

    const add = () => {
        onChange({ ...varsDeriv, ['Var' + (entries.length + 1)]: '' });
    };

    const caixaVars = [
        { id: 'L', label: 'Largura ext', type: 'caixa', val: testVars.L || 0 },
        { id: 'A', label: 'Altura ext', type: 'caixa', val: testVars.A || 0 },
        { id: 'P', label: 'Prof. ext', type: 'caixa', val: testVars.P || 0 },
        { id: 'Li', label: 'Larg. int', type: 'interno', val: testVars.Li || 0 },
        { id: 'Ai', label: 'Alt. int', type: 'interno', val: testVars.Ai || 0 },
        { id: 'Pi', label: 'Prof. int', type: 'interno', val: testVars.Pi || 0 },
    ];

    return (
        <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, padding: '6px 8px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: 10 }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Vars da caixa:</span>
                {caixaVars.map(v => {
                    const c = CHIP_COLORS[v.type];
                    return (
                        <span key={v.id} style={{ fontFamily: 'monospace', fontWeight: 600, padding: '0 4px', borderRadius: 3, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                            {v.id}={v.val}
                        </span>
                    );
                })}
            </div>
            {entries.length === 0 ? (
                <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>Nenhuma variável derivada</p>
            ) : (
                entries.map(([key, formula], i) => {
                    const result = safeEval(formula, testVars);
                    return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px auto 70px 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                            <input
                                value={key}
                                onChange={e => update(key, e.target.value, formula)}
                                className={`${Z.inp} text-xs font-mono`}
                                placeholder="Nome"
                                style={{ fontWeight: 700 }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>=</span>
                                <input
                                    value={formula}
                                    onChange={e => update(key, key, e.target.value)}
                                    className={`${Z.inp} text-xs font-mono`}
                                    placeholder="Ex: Li, P-50"
                                    style={{ flex: 1 }}
                                />
                            </div>
                            <span style={{
                                fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '2px 4px', borderRadius: 4,
                                background: result !== null ? '#dcfce7' : '#fee2e2',
                                color: result !== null ? '#15803d' : '#dc2626',
                            }}>
                                {result !== null ? N(result, result > 100 ? 0 : 1) : 'erro'}
                            </span>
                            <button type="button" onClick={() => remove(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef444480', fontSize: 14, padding: 0 }}>×</button>
                        </div>
                    );
                })
            )}
            <button type="button" onClick={add} className={`${Z.btn2} text-xs mt-2`} style={{ padding: '4px 10px' }}>
                <Plus size={11} /> Variável
            </button>
        </div>
    );
}

// ── VarRefPanel ─────────────────────────────────────────────────────────────
function VarRefPanel({ testVars, formVars = [], varsDeriv = {} }) {
    const esp = 18; // espessura padrão MDF
    const Li = (testVars.L || 0) - esp * 2;
    const Ai = (testVars.A || 0) - esp * 2;
    const Pi = testVars.P || 0;

    const base = [
        { id: 'L', label: 'Largura', val: testVars.L || 0, type: 'caixa' },
        { id: 'A', label: 'Altura', val: testVars.A || 0, type: 'caixa' },
        { id: 'P', label: 'Profund.', val: testVars.P || 0, type: 'caixa' },
        { id: 'Li', label: 'Larg. int', val: Li, type: 'interno' },
        { id: 'Ai', label: 'Alt. int', val: Ai, type: 'interno' },
        { id: 'Pi', label: 'Prof. int', val: Pi, type: 'interno' },
    ];

    const derivs = Object.entries(varsDeriv || {}).map(([k, formula]) => {
        const mergedVars = { ...testVars, Li, Ai, Pi };
        formVars.forEach(v => { mergedVars[v.id] = testVars[v.id] ?? v.default; });
        // Evaluate derivs in sequence
        Object.entries(varsDeriv).forEach(([dk, df]) => {
            const r = safeEval(df, mergedVars);
            if (r !== null) mergedVars[dk] = r;
        });
        return { id: k, label: formula, val: mergedVars[k] ?? 0, type: 'derivada' };
    });

    const own = formVars.map(v => ({
        id: v.id, label: v.label, val: testVars[v.id] ?? v.default, type: 'propria',
    }));

    const allVars = [...base, ...derivs, ...own];

    const LEGEND = [
        { type: 'caixa',    label: 'Módulo'   },
        { type: 'interno',  label: 'Interno'  },
        { type: 'derivada', label: 'Derivada' },
        { type: 'propria',  label: 'Própria'  },
    ];

    return (
        <div style={{
            padding: '8px 10px',
            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderRadius: 8,
            border: '1px solid var(--border)', marginBottom: 12,
        }}>
            {/* Cabeçalho com título e legenda de cores */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Variáveis disponíveis
                </span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {LEGEND.map(({ type, label }) => {
                        const c = CHIP_COLORS[type];
                        return (
                            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: c.color, fontWeight: 600 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.bg, border: `1px solid ${c.border}`, display: 'inline-block', flexShrink: 0 }} />
                                {label}
                            </span>
                        );
                    })}
                </div>
            </div>
            {/* Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allVars.map(v => {
                    const c = CHIP_COLORS[v.type] || CHIP_COLORS.caixa;
                    return (
                        <div key={v.id} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: '4px 8px', borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`,
                            minWidth: 52,
                        }}>
                            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: c.color }}>{v.id}</span>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1, maxWidth: 80, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-all' }}>{v.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#334155', marginTop: 2 }}>{N(v.val, v.val > 100 ? 0 : 1)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Preview de peças calculadas ──────────────────────────────────────────────
function PreviewPecas({ item, tipo, testVars, bib }) {
    const mats = { matInt: testVars.matInt || 'mdf18', matFundo: testVars.matFundo || 'comp3', matExt: testVars.matExt || '' };

    const res = useMemo(() => {
        try {
            if (tipo === 'caixa') {
                return calcItemV2(item, { l: testVars.L, a: testVars.A, p: testVars.P }, mats, [], bib);
            } else {
                const vars = {};
                (item.vars || []).forEach(v => { vars[v.id] = testVars[v.id] ?? v.default; });
                return calcItemV2(
                    { pecas: [], tamponamentos: [] },
                    { l: testVars.L, a: testVars.A, p: testVars.P },
                    mats,
                    [{ compDef: item, qtd: 1, vars, matExtComp: testVars.matExtComp || 'mdf18', subItens: {} }],
                    bib,
                );
            }
        } catch (_) { return null; }
    }, [item, tipo, testVars, bib]);

    if (!res) return <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Erro no cálculo</p>;
    if (res.pecas.length === 0) return <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Nenhuma peça definida</p>;

    const TYPE_COLOR = { caixa: 'var(--primary)', tamponamento: '#3b82f6', componente: '#16a34a', frente_externa: '#f59e0b' };
    const chapasDB = bib?.chapas || DB_CHAPAS;

    return (
        <div className="flex flex-col gap-2">
            <table className="w-full border-collapse text-[10px]">
                <thead>
                    <tr>
                        {['Peça', 'Tipo', 'Área (m²)', 'Material', 'Fita (m)'].map(h =>
                            <th key={h} className={Z.th} style={{ padding: '3px 6px', fontSize: 9 }}>{h}</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {res.pecas.map((p, i) => (
                        <tr key={i} className="hover:bg-[var(--bg-hover)]">
                            <td className="td-glass" style={{ padding: '2px 6px' }}>{p.nome}</td>
                            <td className="td-glass" style={{ padding: '2px 6px' }}>
                                <span className="px-1 py-0.5 rounded text-[8px] font-bold" style={{ background: `${TYPE_COLOR[p.tipo] || 'var(--primary)'}15`, color: TYPE_COLOR[p.tipo] || 'var(--primary)' }}>
                                    {p.tipo}
                                </span>
                            </td>
                            <td className="td-glass text-right font-mono" style={{ padding: '2px 6px' }}>{N(p.area, 4)}</td>
                            <td className="td-glass" style={{ padding: '2px 6px', color: 'var(--text-muted)' }}>
                                {chapasDB.find(c => c.id === p.matId)?.nome || p.matId || '—'}
                            </td>
                            <td className="td-glass text-right font-mono" style={{ padding: '2px 6px' }}>{N(p.fita, 2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="flex gap-4 text-[10px] pt-1" style={{ color: 'var(--text-muted)', borderTop: '1px dashed var(--border)' }}>
                <span>Área total: <strong style={{ color: 'var(--primary)' }}>{N(res.area, 3)} m²</strong></span>
                <span>Fita: <strong style={{ color: 'var(--primary)' }}>{N(res.fita, 2)} m</strong></span>
                <span>Custo mat.: <strong style={{ color: 'var(--primary)' }}>{R$(res.custo)}</strong></span>
            </div>
        </div>
    );
}

// ── Editor de Caixa ──────────────────────────────────────────────────────────
function CaixaEditor({ initial, onSave, onCancel }) {
    const [form, setForm] = useState(() => JSON.parse(JSON.stringify(initial)));
    const [testVars, setTestVars] = useState({ L: 600, A: 2200, P: 550, matInt: 'mdf18', matFundo: 'comp3', matExt: '' });
    const [showPreview, setShowPreview] = useState(true);

    const esp = 18;
    const caixaVars = [
        { id: 'L', label: 'Largura', type: 'caixa', val: testVars.L || 0 },
        { id: 'A', label: 'Altura', type: 'caixa', val: testVars.A || 0 },
        { id: 'P', label: 'Profund.', type: 'caixa', val: testVars.P || 0 },
        { id: 'Li', label: 'Larg. int', type: 'interno', val: (testVars.L || 0) - esp * 2 },
        { id: 'Ai', label: 'Alt. int', type: 'interno', val: (testVars.A || 0) - esp * 2 },
        { id: 'Pi', label: 'Prof. int', type: 'interno', val: testVars.P || 0 },
    ];
    const caixaTestVars = { L: testVars.L || 0, A: testVars.A || 0, P: testVars.P || 0, Li: (testVars.L || 0) - esp * 2, Ai: (testVars.A || 0) - esp * 2, Pi: testVars.P || 0 };

    const setF = (field, val) => setForm(p => ({ ...p, [field]: val }));

    const addPeca = () => setForm(p => ({
        ...p, pecas: [...p.pecas, { id: uid(), nome: 'Nova Peça', qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] }],
    }));
    const updPeca = (idx, k, v) => setForm(p => { const n = [...p.pecas]; n[idx] = { ...n[idx], [k]: v }; return { ...p, pecas: n }; });
    const delPeca = (idx) => setForm(p => ({ ...p, pecas: p.pecas.filter((_, i) => i !== idx) }));

    const addTamp = () => setForm(p => ({
        ...p, tamponamentos: [...(p.tamponamentos || []), { id: uid(), nome: 'Tamponamento', face: 'lat_esq', calc: 'A*P', mat: 'ext', fita: ['f', 'b'] }],
    }));
    const updTamp = (idx, k, v) => setForm(p => { const n = [...p.tamponamentos]; n[idx] = { ...n[idx], [k]: v }; return { ...p, tamponamentos: n }; });
    const delTamp = (idx) => setForm(p => ({ ...p, tamponamentos: p.tamponamentos.filter((_, i) => i !== idx) }));

    return (
        <div className="flex flex-col gap-4">
            {/* Identidade */}
            <div className={Z.card}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="col-span-2"><label className={Z.lbl}>Nome da Caixa</label><input value={form.nome} onChange={e => setF('nome', e.target.value)} className={Z.inp} placeholder="Ex: Caixa Alta" /></div>
                    <div><label className={Z.lbl}>Categoria</label><select value={form.cat} onChange={e => setF('cat', e.target.value)} className={Z.inp}><option value="caixaria">Caixaria</option><option value="especial">Especial</option></select></div>
                    <div><label className={Z.lbl} title="Fator de custo extra por complexidade. 0.30 = +30% sobre material">Coef. Dificuldade</label><input type="number" step="0.05" min="0" max="3" value={form.coef} onChange={e => setF('coef', parseFloat(e.target.value) || 0)} className={Z.inp} /></div>
                    <div className="col-span-4"><label className={Z.lbl}>Descrição</label><input value={form.desc || ''} onChange={e => setF('desc', e.target.value)} className={Z.inp} placeholder="Descrição curta..." /></div>
                </div>
            </div>

            {/* Peças estruturais */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>Peças Estruturais</h3>
                    <button onClick={addPeca} className={`${Z.btn} text-xs py-1 px-2`}><Plus size={12} /> Peça</button>
                </div>
                <VarRefPanel testVars={testVars} />
                {form.pecas.length === 0
                    ? <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>Nenhuma peça</p>
                    : form.pecas.map((p, i) => (
                        <div key={p.id} className="grid gap-2 items-start mb-2 p-2 rounded border" style={{ borderColor: 'var(--border)', gridTemplateColumns: '1fr 1fr 3rem 1fr auto auto' }}>
                            <div><label className={Z.lbl}>Nome</label><input value={p.nome} onChange={e => updPeca(i, 'nome', e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl} title="Área da peça em mm². Ex: A*P = altura × profundidade">Fórmula (mm²)</label><FormulaInput value={p.calc} onChange={v => updPeca(i, 'calc', v)} vars={caixaVars} testVars={caixaTestVars} placeholder="A*P" suggestions={FORMULAS_CAIXA} /></div>
                            <div><label className={Z.lbl}>Qtd</label><input type="number" min="1" max="10" value={p.qtd} onChange={e => updPeca(i, 'qtd', parseInt(e.target.value) || 1)} className={`${Z.inp} text-xs text-center`} /></div>
                            <div><label className={Z.lbl}>Material</label><select value={p.mat} onChange={e => updPeca(i, 'mat', e.target.value)} className={`${Z.inp} text-xs`}>{MAT_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                            <div><label className={Z.lbl}>Fita de Borda</label><FitaToggle value={p.fita} onChange={v => updPeca(i, 'fita', v)} /></div>
                            <div><label className={Z.lbl}>&nbsp;</label><button onClick={() => delPeca(i)} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button></div>
                        </div>
                    ))}
            </div>

            {/* Tamponamentos */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm" style={{ color: '#3b82f6' }}>Tamponamentos / Acabamento Externo</h3>
                    <button onClick={addTamp} className={`${Z.btn} text-xs py-1 px-2`}><Plus size={12} /> Tamponamento</button>
                </div>
                <p className="text-[9px] mb-2 px-1" style={{ color: 'var(--text-muted)' }}>Só calculados quando o orçamento tem matExt definido.</p>
                {(form.tamponamentos || []).length === 0
                    ? <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>Sem tamponamentos</p>
                    : (form.tamponamentos || []).map((t, i) => (
                        <div key={t.id} className="grid gap-2 items-start mb-2 p-2 rounded border" style={{ borderColor: 'var(--border)', gridTemplateColumns: '1fr auto 1fr auto auto auto' }}>
                            <div><label className={Z.lbl}>Nome</label><input value={t.nome || ''} onChange={e => updTamp(i, 'nome', e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl}>Face</label><select value={t.face} onChange={e => updTamp(i, 'face', e.target.value)} className={`${Z.inp} text-xs`}>{FACE_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
                            <div><label className={Z.lbl} title="Área do tamponamento em mm²">Fórmula (mm²)</label><FormulaInput value={t.calc} onChange={v => updTamp(i, 'calc', v)} vars={caixaVars} testVars={caixaTestVars} placeholder="A*P" suggestions={FORMULAS_CAIXA} /></div>
                            <div><label className={Z.lbl}>Material</label><select value={t.mat} onChange={e => updTamp(i, 'mat', e.target.value)} className={`${Z.inp} text-xs`}>{MAT_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                            <div><label className={Z.lbl}>Fita</label><FitaToggle value={t.fita} onChange={v => updTamp(i, 'fita', v)} /></div>
                            <div><label className={Z.lbl}>&nbsp;</label><button onClick={() => delTamp(i)} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button></div>
                        </div>
                    ))}
            </div>

            {/* Preview */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Preview de Cálculo</h3>
                    <button onClick={() => setShowPreview(p => !p)} className={Z.btn2 + ' text-xs py-1 px-2'}>{showPreview ? <EyeOff size={12} /> : <Eye size={12} />}{showPreview ? 'Ocultar' : 'Mostrar'}</button>
                </div>
                {showPreview && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                            {[['L', 'Larg. (mm)'], ['A', 'Alt. (mm)'], ['P', 'Prof. (mm)']].map(([k, lbl]) => (
                                <div key={k}><label className={Z.lbl}>{lbl}</label><input type="number" value={testVars[k]} onChange={e => setTestVars(p => ({ ...p, [k]: +e.target.value || 0 }))} className={`${Z.inp} text-xs font-mono`} /></div>
                            ))}
                            <div><label className={Z.lbl}>MatInt</label><select value={testVars.matInt} onChange={e => setTestVars(p => ({ ...p, matInt: e.target.value }))} className={`${Z.inp} text-xs`}>{DB_CHAPAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                            <div><label className={Z.lbl}>MatExt (opcional)</label><select value={testVars.matExt} onChange={e => setTestVars(p => ({ ...p, matExt: e.target.value }))} className={`${Z.inp} text-xs`}><option value="">Sem externo</option>{DB_CHAPAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                        </div>
                        <PreviewPecas item={form} tipo="caixa" testVars={testVars} bib={null} />
                    </>
                )}
            </div>

            {/* Ações */}
            <div className="flex gap-2 justify-end">
                <button onClick={onCancel} className={Z.btn2}><X size={14} /> Cancelar</button>
                <button onClick={() => onSave(form)} className={Z.btn} disabled={!form.nome}><Save size={14} /> Salvar Caixa</button>
            </div>
        </div>
    );
}

// ── Editor de Componente ─────────────────────────────────────────────────────
function ComponenteEditor({ initial, onSave, onCancel }) {
    const [form, setForm] = useState(() => JSON.parse(JSON.stringify(initial)));
    const [testVars, setTestVars] = useState({ L: 600, A: 2200, P: 550, matInt: 'mdf18', matFundo: 'comp3', matExtComp: 'mdf15' });
    const [showPreview, setShowPreview] = useState(true);

    const setF = (field, val) => setForm(p => ({ ...p, [field]: val }));

    const addVar = () => setForm(p => ({ ...p, vars: [...(p.vars || []), { id: 'v_' + uid().slice(-4), label: 'Nova Var', default: 100, min: 10, max: 1000, unit: 'mm' }] }));
    const updVar = (i, k, v) => setForm(p => { const n = [...p.vars]; n[i] = { ...n[i], [k]: v }; return { ...p, vars: n }; });
    const delVar = (i) => setForm(p => ({ ...p, vars: p.vars.filter((_, x) => x !== i) }));

    const addPeca = () => setForm(p => ({ ...p, pecas: [...p.pecas, { id: uid(), nome: 'Nova Peça', qtd: 1, calc: 'Lg*ag', mat: 'int', fita: [] }] }));
    const updPeca = (i, k, v) => setForm(p => { const n = [...p.pecas]; n[i] = { ...n[i], [k]: v }; return { ...p, pecas: n }; });
    const delPeca = (i) => setForm(p => ({ ...p, pecas: p.pecas.filter((_, x) => x !== i) }));

    const addSub = () => setForm(p => ({ ...p, sub_itens: [...(p.sub_itens || []), { id: uid(), nome: 'Nova Ferragem', ferrId: 'pux128', defaultOn: false, qtdFormula: '1' }] }));
    const updSub = (i, k, v) => setForm(p => { const n = [...p.sub_itens]; n[i] = { ...n[i], [k]: v }; return { ...p, sub_itens: n }; });
    const delSub = (i) => setForm(p => ({ ...p, sub_itens: p.sub_itens.filter((_, x) => x !== i) }));

    const testVarsWithOwn = useMemo(() => {
        const merged = { ...testVars };
        (form.vars || []).forEach(v => { merged[v.id] = testVars[v.id] ?? v.default; });
        return merged;
    }, [testVars, form.vars]);

    const esp = 18;
    const Li = (testVars.L || 0) - esp * 2;
    const Ai = (testVars.A || 0) - esp * 2;
    const Pi = testVars.P || 0;

    const compTestVars = useMemo(() => {
        const merged = { L: testVars.L || 0, A: testVars.A || 0, P: testVars.P || 0, Li, Ai, Pi };
        // Apply own vars
        (form.vars || []).forEach(v => { merged[v.id] = testVars[v.id] ?? v.default; });
        // Apply derived vars in sequence
        Object.entries(form.varsDeriv || {}).forEach(([k, formula]) => {
            const r = safeEval(formula, merged);
            if (r !== null) merged[k] = r;
        });
        return merged;
    }, [testVars, form.vars, form.varsDeriv, Li, Ai, Pi]);

    const compVars = useMemo(() => {
        const base = [
            { id: 'L', label: 'Largura', type: 'caixa', val: testVars.L || 0 },
            { id: 'A', label: 'Altura', type: 'caixa', val: testVars.A || 0 },
            { id: 'P', label: 'Profund.', type: 'caixa', val: testVars.P || 0 },
            { id: 'Li', label: 'Larg. int', type: 'interno', val: Li },
            { id: 'Ai', label: 'Alt. int', type: 'interno', val: Ai },
            { id: 'Pi', label: 'Prof. int', type: 'interno', val: Pi },
        ];
        const derivs = Object.entries(form.varsDeriv || {}).map(([k, formula]) => ({
            id: k, label: formula || 'deriv.', type: 'derivada', val: compTestVars[k] || 0,
        }));
        const own = (form.vars || []).map(v => ({
            id: v.id, label: v.label, type: 'propria', val: compTestVars[v.id] ?? v.default,
        }));
        return [...base, ...derivs, ...own];
    }, [testVars, form.varsDeriv, form.vars, compTestVars, Li, Ai, Pi]);

    return (
        <div className="flex flex-col gap-4">
            {/* Identidade */}
            <div className={Z.card}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="col-span-2"><label className={Z.lbl}>Nome do Componente</label><input value={form.nome} onChange={e => setF('nome', e.target.value)} className={Z.inp} placeholder="Ex: Gaveta, Porta, Prateleira..." /></div>
                    <div><label className={Z.lbl} title="Fator de custo extra por complexidade. 0.20 = +20% sobre material">Coef. Dificuldade</label><input type="number" step="0.05" min="0" max="3" value={form.coef} onChange={e => setF('coef', parseFloat(e.target.value) || 0)} className={Z.inp} /></div>
                    <div className="col-span-4"><label className={Z.lbl}>Descrição</label><input value={form.desc || ''} onChange={e => setF('desc', e.target.value)} className={Z.inp} placeholder="Descrição curta..." /></div>
                </div>
            </div>

            {/* Variáveis próprias */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold text-sm" style={{ color: '#f59e0b' }} title="Dimensões específicas deste componente. Ex: 'ag' = altura da gaveta">Variáveis Próprias</h3>
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Dimensões específicas deste componente (ex: ag = altura da gaveta)</p>
                    </div>
                    <button onClick={addVar} className={`${Z.btn} text-xs py-1 px-2`}><Plus size={12} /> Variável</button>
                </div>
                {(form.vars || []).length === 0
                    ? <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>Nenhuma variável própria</p>
                    : (form.vars || []).map((v, i) => (
                        <div key={v.id} className="grid gap-2 items-end mb-2 p-2 rounded border" style={{ borderColor: 'var(--border)', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr auto' }}>
                            <div><label className={Z.lbl}>ID</label><input value={v.id} onChange={e => updVar(i, 'id', e.target.value)} className={`${Z.inp} text-xs font-mono`} placeholder="ag" /></div>
                            <div><label className={Z.lbl}>Label</label><input value={v.label} onChange={e => updVar(i, 'label', e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl}>Padrão</label><input type="number" value={v.default} onChange={e => updVar(i, 'default', +e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl}>Mín</label><input type="number" value={v.min} onChange={e => updVar(i, 'min', +e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl}>Máx</label><input type="number" value={v.max} onChange={e => updVar(i, 'max', +e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl}>Unidade</label><input value={v.unit} onChange={e => updVar(i, 'unit', e.target.value)} className={`${Z.inp} text-xs`} placeholder="mm" /></div>
                            <button onClick={() => delVar(i)} className="mt-4 p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button>
                        </div>
                    ))}
            </div>

            {/* Variáveis derivadas da caixa */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>Variáveis Derivadas da Caixa</h3>
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }} title="Fórmulas que calculam medidas do componente baseadas nas dimensões da caixa">
                            Defina variáveis calculadas a partir das dimensões da caixa (Li, Ai, Pi, etc.)
                        </p>
                    </div>
                </div>
                <VarDerivEditor
                    varsDeriv={form.varsDeriv || {}}
                    onChange={(newMap) => setForm(p => ({ ...p, varsDeriv: newMap }))}
                    testVars={{ L: testVars.L || 0, A: testVars.A || 0, P: testVars.P || 0, Li, Ai, Pi, ...(Object.fromEntries((form.vars || []).map(v => [v.id, testVars[v.id] ?? v.default]))) }}
                />
            </div>

            {/* Peças */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold text-sm" style={{ color: '#16a34a' }}>Peças do Componente</h3>
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Clique nas variáveis coloridas para inserir nas fórmulas</p>
                    </div>
                    <button onClick={addPeca} className={`${Z.btn} text-xs py-1 px-2`}><Plus size={12} /> Peça</button>
                </div>
                <VarRefPanel testVars={testVars} formVars={form.vars || []} varsDeriv={form.varsDeriv || {}} />
                {form.pecas.length === 0
                    ? <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>Nenhuma peça</p>
                    : form.pecas.map((p, i) => (
                        <div key={p.id} className="grid gap-2 items-start mb-2 p-2 rounded border" style={{ borderColor: 'var(--border)', gridTemplateColumns: '1fr 1fr 3rem 1fr auto auto' }}>
                            <div><label className={Z.lbl}>Nome</label><input value={p.nome} onChange={e => updPeca(i, 'nome', e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl} title="Área da peça em mm². Use as variáveis coloridas abaixo">Fórmula (mm²)</label><FormulaInput value={p.calc} onChange={v => updPeca(i, 'calc', v)} vars={compVars} testVars={compTestVars} placeholder="Lg*ag" suggestions={FORMULAS_COMP} /></div>
                            <div><label className={Z.lbl}>Qtd</label><input type="number" min="1" max="10" value={p.qtd} onChange={e => updPeca(i, 'qtd', parseInt(e.target.value) || 1)} className={`${Z.inp} text-xs text-center`} /></div>
                            <div><label className={Z.lbl}>Material</label><select value={p.mat} onChange={e => updPeca(i, 'mat', e.target.value)} className={`${Z.inp} text-xs`}>{MAT_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                            <div><label className={Z.lbl}>Fita</label><FitaToggle value={p.fita} onChange={v => updPeca(i, 'fita', v)} /></div>
                            <div><label className={Z.lbl}>&nbsp;</label><button onClick={() => delPeca(i)} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button></div>
                        </div>
                    ))}
            </div>

            {/* Frente Externa */}
            <div className={Z.card} style={{ borderLeft: '3px solid #f59e0b' }}>
                <div className="flex items-center gap-3 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.frente_externa?.ativa || false}
                            onChange={e => setF('frente_externa', { ...(form.frente_externa || {}), ativa: e.target.checked })}
                            className="w-4 h-4 accent-[#f59e0b]" />
                        <span className="font-semibold text-sm" style={{ color: '#f59e0b' }}>Frente Externa</span>
                    </label>
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Material exclusivo, diferente do interior — afeta o preço separadamente</span>
                </div>
                {form.frente_externa?.ativa && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div><label className={Z.lbl}>Nome</label><input value={form.frente_externa.nome || ''} onChange={e => setF('frente_externa', { ...form.frente_externa, nome: e.target.value })} className={`${Z.inp} text-xs`} /></div>
                        <div><label className={Z.lbl} title="Área da frente externa em mm²">Fórmula (mm²)</label><FormulaInput value={form.frente_externa.calc || ''} onChange={v => setF('frente_externa', { ...form.frente_externa, calc: v })} vars={compVars} testVars={compTestVars} placeholder="Lg*ag" suggestions={FORMULAS_COMP} /></div>
                        <div><label className={Z.lbl}>Material</label><select value={form.frente_externa.mat || 'ext_comp'} onChange={e => setF('frente_externa', { ...form.frente_externa, mat: e.target.value })} className={`${Z.inp} text-xs`}>{MAT_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                        <div><label className={Z.lbl}>Fita</label><FitaToggle value={form.frente_externa.fita || []} onChange={v => setF('frente_externa', { ...form.frente_externa, fita: v })} /></div>
                    </div>
                )}
            </div>

            {/* Sub-itens (ferragens) */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold text-sm" style={{ color: '#a855f7' }} title="Ferragens que podem ser ativadas/desativadas quando o componente é usado no orçamento">Ferragens Disponíveis (sub-itens)</h3>
                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Ferragens que podem ser ativadas/desativadas no orçamento</p>
                    </div>
                    <button onClick={addSub} className={`${Z.btn} text-xs py-1 px-2`}><Plus size={12} /> Ferragem</button>
                </div>
                {(form.sub_itens || []).length === 0
                    ? <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>Nenhuma ferragem configurada</p>
                    : (form.sub_itens || []).map((s, i) => (
                        <div key={s.id} className="grid gap-2 items-start mb-2 p-2 rounded border" style={{ borderColor: 'var(--border)', gridTemplateColumns: '1fr 1fr 1fr 1fr auto auto' }}>
                            <div><label className={Z.lbl}>Nome</label><input value={s.nome} onChange={e => updSub(i, 'nome', e.target.value)} className={`${Z.inp} text-xs`} /></div>
                            <div><label className={Z.lbl}>Ferragem</label><select value={s.ferrId} onChange={e => updSub(i, 'ferrId', e.target.value)} className={`${Z.inp} text-xs`}>{DB_FERRAGENS.map(f => <option key={f.id} value={f.id}>{f.nome} ({R$(f.preco)})</option>)}</select></div>
                            <div><label className={Z.lbl} title="Quantidade da ferragem. Pode ser número fixo ou fórmula condicional">Qtd / Fórmula</label><FormulaInput value={s.qtdFormula || '1'} onChange={v => updSub(i, 'qtdFormula', v)} vars={compVars} testVars={compTestVars} placeholder="1" suggestions={FORMULAS_FERRAGEM} /></div>
                            <div>
                                <label className={Z.lbl}>&nbsp;</label>
                                <label className="flex items-center gap-1 cursor-pointer text-xs" style={{ color: 'var(--text-muted)' }}>
                                    <input type="checkbox" checked={s.defaultOn} onChange={e => updSub(i, 'defaultOn', e.target.checked)} className="w-3 h-3" />
                                    Ativo padrão
                                </label>
                            </div>
                            <div><label className={Z.lbl}>&nbsp;</label><button onClick={() => delSub(i)} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button></div>
                        </div>
                    ))}
            </div>

            {/* Preview */}
            <div className={Z.card}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Preview de Cálculo</h3>
                    <button onClick={() => setShowPreview(p => !p)} className={Z.btn2 + ' text-xs py-1 px-2'}>{showPreview ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                </div>
                {showPreview && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                            {[['L', 'Larg. Caixa (mm)'], ['A', 'Alt. Caixa (mm)'], ['P', 'Prof. Caixa (mm)']].map(([k, lbl]) => (
                                <div key={k}><label className={Z.lbl}>{lbl}</label><input type="number" value={testVars[k]} onChange={e => setTestVars(p => ({ ...p, [k]: +e.target.value || 0 }))} className={`${Z.inp} text-xs font-mono`} /></div>
                            ))}
                            {(form.vars || []).map(v => (
                                <div key={v.id}><label className={Z.lbl}>{v.label} ({v.id})</label><input type="number" value={testVarsWithOwn[v.id] ?? v.default} onChange={e => setTestVars(p => ({ ...p, [v.id]: +e.target.value || 0 }))} className={`${Z.inp} text-xs font-mono`} /></div>
                            ))}
                            <div><label className={Z.lbl}>MatInt</label><select value={testVars.matInt} onChange={e => setTestVars(p => ({ ...p, matInt: e.target.value }))} className={`${Z.inp} text-xs`}>{DB_CHAPAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                            {form.frente_externa?.ativa && <div><label className={Z.lbl}>MatExtComp (frente ext.)</label><select value={testVars.matExtComp} onChange={e => setTestVars(p => ({ ...p, matExtComp: e.target.value }))} className={`${Z.inp} text-xs`}>{DB_CHAPAS.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>}
                        </div>
                        <PreviewPecas item={form} tipo="componente" testVars={testVarsWithOwn} bib={null} />
                    </>
                )}
            </div>

            {/* Ações */}
            <div className="flex gap-2 justify-end">
                <button onClick={onCancel} className={Z.btn2}><X size={14} /> Cancelar</button>
                <button onClick={() => onSave(form)} className={Z.btn} disabled={!form.nome}><Save size={14} /> Salvar Componente</button>
            </div>
        </div>
    );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function ItemBuilder({ notify }) {
    const [aba, setAba] = useState('caixas');
    const [caixas, setCaixas] = useState([]);
    const [componentes, setComponentes] = useState([]);
    const [editing, setEditing] = useState(null); // { tipo, item } | null
    const [loading, setLoading] = useState(false);
    const [busca, setBusca] = useState('');

    const load = async () => {
        try {
            const all = await api.get('/catalogo');
            setCaixas(all.filter(i => i.tipo_item === 'caixa'));
            setComponentes(all.filter(i => i.tipo_item === 'componente'));
        } catch (_) { }
    };

    useEffect(() => { load(); }, []);

    const handleSave = async (tipo, form) => {
        setLoading(true);
        try {
            const payload = { tipo_item: tipo, ...form };
            if (form.db_id) {
                await api.put(`/catalogo/${form.db_id}`, payload);
                notify?.('Item atualizado!');
            } else {
                await api.post('/catalogo', payload);
                notify?.('Item criado!');
            }
            await load();
            setEditing(null);
        } catch (err) {
            notify?.('Erro ao salvar: ' + (err?.error || err?.message || '?'));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (dbId) => {
        if (!confirm('Remover este item do catálogo?')) return;
        try {
            await api.delete(`/catalogo/${dbId}`);
            notify?.('Item removido');
            await load();
        } catch (_) { notify?.('Erro ao remover'); }
    };

    if (editing) {
        return (
            <div className={Z.pg}>
                <div className="flex items-center gap-3 mb-5">
                    <button onClick={() => setEditing(null)} className={Z.btn2}><ChevronRight size={14} className="rotate-180" /> Voltar</button>
                    <h1 className={Z.h1}>{editing.item.db_id ? 'Editar' : 'Novo'} {editing.tipo === 'caixa' ? 'Caixa' : 'Componente'}</h1>
                </div>
                {editing.tipo === 'caixa'
                    ? <CaixaEditor initial={editing.item} onSave={f => handleSave('caixa', f)} onCancel={() => setEditing(null)} />
                    : <ComponenteEditor initial={editing.item} onSave={f => handleSave('componente', f)} onCancel={() => setEditing(null)} />
                }
            </div>
        );
    }

    const todosItems = aba === 'caixas' ? caixas : componentes;
    const items = busca.trim()
        ? todosItems.filter(i =>
            (i.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
            (i.desc || '').toLowerCase().includes(busca.toLowerCase())
        )
        : todosItems;
    const tipo = aba === 'caixas' ? 'caixa' : 'componente';

    return (
        <div className={Z.pg}>
            <div className="flex justify-between items-start mb-5">
                <div>
                    <h1 className={Z.h1}>Catálogo de Itens</h1>
                    <p className={Z.sub}>Defina Caixas e Componentes para usar nos orçamentos</p>
                </div>
                {aba !== 'paineis' && (
                    <button onClick={() => setEditing({ tipo, item: tipo === 'caixa' ? { ...EMPTY_CAIXA } : { ...EMPTY_COMP } })}
                        className={Z.btn}>
                        <Plus size={14} /> {aba === 'caixas' ? 'Nova Caixa' : 'Novo Componente'}
                    </button>
                )}
            </div>

            {/* Abas */}
            <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: 'var(--bg-muted)', width: 'fit-content' }}>
                {[['caixas', 'Caixas', Box], ['componentes', 'Componentes', Package], ['paineis', 'Painéis Especiais', Layers]].map(([id, lb, Icon]) => (
                    <button key={id} onClick={() => { setAba(id); setBusca(''); }}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all"
                        style={aba === id ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-muted)' }}>
                        <Icon size={13} /> {lb}
                        {id !== 'paineis' && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px]"
                                style={aba === id ? { background: 'rgba(255,255,255,0.2)', color: '#fff' } : { background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                                {id === 'caixas' ? caixas.length : componentes.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Painéis Especiais — calculadora embebida */}
            {aba === 'paineis' && <RipadoCalc embedded />}

            {/* Busca */}
            {aba !== 'paineis' && (
                <div className="relative mb-4">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder={`Buscar ${aba === 'caixas' ? 'caixas' : 'componentes'}...`}
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    />
                    {busca && (
                        <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity">
                            <X size={13} style={{ color: 'var(--text-muted)' }} />
                        </button>
                    )}
                </div>
            )}

            {/* Lista de Caixas / Componentes */}
            {aba !== 'paineis' && (todosItems.length === 0 ? (
                <div className={`${Z.card} flex flex-col items-center py-16`} style={{ color: 'var(--text-muted)' }}>
                    {aba === 'caixas' ? <Box size={40} className="mb-3 opacity-30" /> : <Package size={40} className="mb-3 opacity-30" />}
                    <p className="text-sm">Nenhum {aba === 'caixas' ? 'caixa' : 'componente'} cadastrado</p>
                    <button onClick={() => setEditing({ tipo, item: tipo === 'caixa' ? { ...EMPTY_CAIXA } : { ...EMPTY_COMP } })}
                        className={`${Z.btn} mt-4 text-xs`}>
                        <Plus size={13} /> Criar o primeiro
                    </button>
                </div>
            ) : items.length === 0 ? (
                <div className={`${Z.card} flex flex-col items-center py-16`} style={{ color: 'var(--text-muted)' }}>
                    <Search size={40} className="mb-3 opacity-30" />
                    <p className="text-sm">Nenhum resultado para "<span className="font-semibold">{busca}</span>"</p>
                    <button onClick={() => setBusca('')} className={`${Z.btn2} mt-4 text-xs`}>
                        <X size={13} /> Limpar busca
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map(item => (
                        <div key={item.db_id} className={`${Z.card} flex flex-col gap-3`} style={{ borderTop: `2px solid ${aba === 'caixas' ? 'var(--primary)' : '#16a34a'}` }}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{item.nome}</div>
                                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.desc || '—'}</div>
                                </div>
                                <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    coef ×{(1 + (item.coef || 0)).toFixed(2)}
                                </span>
                            </div>
                            {aba === 'caixas' && (
                                <div className="flex gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    <span>{(item.pecas || []).length} peças</span>
                                    <span>{(item.tamponamentos || []).length} tamp.</span>
                                </div>
                            )}
                            {aba === 'componentes' && (
                                <div className="flex gap-3 text-[10px] flex-wrap" style={{ color: 'var(--text-muted)' }}>
                                    <span>{(item.pecas || []).length} peças</span>
                                    {item.frente_externa?.ativa && <span className="font-semibold" style={{ color: '#f59e0b' }}>+ frente externa</span>}
                                    <span>{(item.sub_itens || []).length} ferragens</span>
                                    {(item.vars || []).length > 0 && <span>{(item.vars || []).map(v => v.id).join(', ')}</span>}
                                </div>
                            )}
                            <div className="flex gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                                <button onClick={() => setEditing({ tipo, item: JSON.parse(JSON.stringify(item)) })} className={`${Z.btn2} flex-1 text-xs py-1.5`}><Edit2 size={12} /> Editar</button>
                                <button onClick={() => setEditing({ tipo, item: { ...(JSON.parse(JSON.stringify(item))), db_id: undefined, nome: item.nome + ' (cópia)' } })} className={`${Z.btn2} text-xs py-1.5 px-2`} title="Duplicar"><Copy size={12} /></button>
                                <button onClick={() => handleDelete(item.db_id)} className="text-xs py-1.5 px-2 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400 transition-colors" title="Remover"><Trash2 size={12} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
