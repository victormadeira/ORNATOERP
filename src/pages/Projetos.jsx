import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { Ic, Z, Modal, Spinner } from '../ui';
import { R$, N } from '../engine';
import {
    User as UserIcon, Calendar as CalendarIcon, Copy as CopyIcon,
    Check as CheckIcon, DollarSign, TrendingUp, TrendingDown,
    Package, PlusCircle, Trash2, Receipt, AlertTriangle, Clock,
    ArrowUpCircle, ArrowDownCircle, BarChart3, Search,
    Scissors, Layers, Ruler, ClipboardList, ShoppingCart,
    ChevronDown, ChevronRight, Printer, X as XIcon, Pencil, Clipboard,
    Eye, EyeOff, Upload, Trash2 as Trash2Icon
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────
const dtFmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const dtInput = (s) => s ? s.slice(0, 10) : '';

const STATUS_PROJ = {
    nao_iniciado: { label: 'Não iniciado', color: '#94a3b8', bg: '#f1f5f9' },
    em_andamento: { label: 'Em andamento', color: '#1379F0', bg: '#eff6ff' },
    atrasado:     { label: 'Atrasado',     color: '#ef4444', bg: '#fef2f2' },
    concluido:    { label: 'Concluído',    color: '#22c55e', bg: '#f0fdf4' },
    suspenso:     { label: 'Suspenso',     color: '#f59e0b', bg: '#fffbeb' },
};

const STATUS_ETAPA = {
    nao_iniciado: { label: 'Não iniciado', color: '#64748b' },
    pendente:     { label: 'Pendente',     color: '#64748b' },
    em_andamento: { label: 'Em andamento', color: '#1379F0' },
    concluida:    { label: 'Concluída',    color: '#22c55e' },
    atrasada:     { label: 'Atrasada',     color: '#ef4444' },
};

const CATEGORIAS_DESPESA = [
    { id: 'material', label: 'Material', color: '#3b82f6' },
    { id: 'mao_de_obra', label: 'Mão de Obra', color: '#8b5cf6' },
    { id: 'transporte', label: 'Transporte', color: '#f59e0b' },
    { id: 'terceirizado', label: 'Terceirizado', color: '#ec4899' },
    { id: 'ferramentas', label: 'Ferramentas', color: '#6366f1' },
    { id: 'acabamento', label: 'Acabamento', color: '#14b8a6' },
    { id: 'instalacao', label: 'Instalação', color: '#f97316' },
    { id: 'outros', label: 'Outros', color: '#94a3b8' },
];
const catMap = {}; CATEGORIAS_DESPESA.forEach(c => { catMap[c.id] = c; });

const Badge = ({ status, map }) => {
    const s = (map || STATUS_PROJ)[status] || { label: status, color: '#94a3b8', bg: '#f1f5f9' };
    return (
        <span style={{
            background: s.bg || `${s.color}15`, color: s.color,
            border: `1px solid ${s.color}40`,
            fontSize: 11, fontWeight: 700, padding: '2px 9px',
            borderRadius: 20, whiteSpace: 'nowrap'
        }}>{s.label}</span>
    );
};

// ─── Gantt Chart (CSS puro) ────────────────────────────
function GanttChart({ etapas, onEdit, zoom = 1 }) {
    if (!etapas || etapas.length === 0) return (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Nenhuma etapa cadastrada
        </p>
    );

    const dts = etapas.flatMap(e => [e.data_inicio, e.data_vencimento].filter(Boolean));
    if (dts.length < 2) return (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Adicione datas nas etapas para visualizar o Gantt
        </p>
    );

    const toMs = d => new Date(d + 'T12:00:00').getTime();
    const DAY = 86400000;

    // Auto-enquadramento: 2 dias antes, 7 dias depois
    const rawMin = Math.min(...dts.map(toMs));
    const rawMax = Math.max(...dts.map(toMs));
    const minMs = rawMin - 2 * DAY;
    const maxMs = rawMax + 7 * DAY;
    const totalMs = Math.max(maxMs - minMs, DAY);

    const today = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayPct = ((today - minMs) / totalMs) * 100;
    const showToday = todayPct >= -2 && todayPct <= 102;

    // Gerar marcações de datas (grid lines)
    const spanDays = (rawMax - rawMin) / DAY;
    const gridLines = [];
    if (spanDays <= 60) {
        // Linhas semanais (cada segunda-feira)
        let d = new Date(minMs);
        d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // próxima segunda
        while (d.getTime() <= maxMs) {
            const pct = (d.getTime() - minMs) / totalMs * 100;
            if (pct > 0 && pct < 100) {
                gridLines.push({ pct, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) });
            }
            d.setDate(d.getDate() + 7);
        }
    } else {
        // Linhas mensais (dia 1 de cada mês)
        let d = new Date(minMs);
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        while (d.getTime() <= maxMs) {
            const pct = (d.getTime() - minMs) / totalMs * 100;
            if (pct > 0 && pct < 100) {
                gridLines.push({ pct, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) });
            }
            d.setMonth(d.getMonth() + 1);
        }
    }

    // Header: meses
    const months = [];
    let cur = new Date(minMs);
    cur.setDate(1);
    while (cur.getTime() <= maxMs) {
        const pct = (cur.getTime() - minMs) / totalMs * 100;
        months.push({ label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), pct: Math.max(0, pct) });
        cur.setMonth(cur.getMonth() + 1);
    }

    // Build map for dependency lookup
    const etapaMap = {};
    etapas.forEach(e => { etapaMap[e.id] = e; });

    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
    };

    const minW = Math.round(600 * zoom);
    const shortDt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

    // Detectar se barra é estreita (< 12% da largura total)
    const isNarrow = (widthPct) => widthPct < 12;

    return (
        <div style={{ overflowX: 'auto' }}>
            {/* Timeline header — duas linhas: meses em cima, datas embaixo */}
            <div style={{ position: 'relative', borderRadius: '6px 6px 0 0', border: '1px solid var(--border)', borderBottom: 'none', minWidth: minW, overflow: 'hidden' }}>
                {/* Linha 1: Meses */}
                <div style={{ position: 'relative', height: 22, background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
                    {months.map((m, i) => {
                        // Calcular largura de cada mês
                        const nextPct = i < months.length - 1 ? months[i + 1].pct : 100;
                        const mWidth = nextPct - Math.max(0, m.pct);
                        return (
                            <div key={`m${i}`} style={{
                                position: 'absolute', left: `${Math.max(0, m.pct)}%`, width: `${mWidth}%`,
                                fontSize: 11, color: 'var(--text-muted)', fontWeight: 700,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                lineHeight: '22px', paddingLeft: 8, boxSizing: 'border-box',
                                borderRight: i < months.length - 1 ? '1px solid var(--border)' : 'none',
                            }}>{m.label}</div>
                        );
                    })}
                </div>
                {/* Linha 2: Datas do grid */}
                <div style={{ position: 'relative', height: 18, background: 'var(--bg-card)' }}>
                    {gridLines.map((g, i) => (
                        <div key={`g${i}`} style={{
                            position: 'absolute', left: `${g.pct}%`, top: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: 9, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>{g.label}</div>
                    ))}
                </div>
            </div>
            {/* Bars container */}
            <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '0 0 6px 6px', background: 'var(--bg-card)', minWidth: minW }}>
                {/* Grid lines verticais */}
                {gridLines.map((g, i) => (
                    <div key={`gl${i}`} style={{ position: 'absolute', left: `${g.pct}%`, top: 0, bottom: 0, width: 1, background: 'var(--border)', opacity: 0.4, zIndex: 0 }} />
                ))}
                {/* Today indicator — linha vermelha com glow */}
                {showToday && (
                    <div style={{
                        position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
                        width: 1.5, background: '#ef4444', zIndex: 4,
                        boxShadow: '0 0 6px 1px rgba(239,68,68,0.45), 0 0 2px 0px rgba(239,68,68,0.7)',
                    }} />
                )}
                {etapas.map((e, i) => {
                    if (!e.data_inicio && !e.data_vencimento) {
                        return (
                            <div key={e.id} style={{ position: 'relative', height: 44, borderBottom: i < etapas.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                                <span onClick={() => onEdit && onEdit(e)} style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontStyle: 'italic' }}>
                                    {e.nome} — sem datas definidas
                                </span>
                            </div>
                        );
                    }
                    const s = e.data_inicio ? toMs(e.data_inicio) : toMs(e.data_vencimento);
                    const f = e.data_vencimento ? toMs(e.data_vencimento) : toMs(e.data_inicio);
                    const left = Math.max(0, (s - minMs) / totalMs * 100);
                    const width = Math.max(1.5, (Math.max(f, s + DAY) - s) / totalMs * 100);
                    const color = STATUS_ETAPA[e.status]?.color || '#64748b';
                    const progresso = e.progresso || 0;
                    const isOverdue = e.data_vencimento && e.data_vencimento < todayStr && e.status !== 'concluida';
                    const hasDep = e.dependencia_id && etapaMap[e.dependencia_id];
                    const endLabel = shortDt(e.data_vencimento);
                    const narrow = isNarrow(width);
                    const barText = e.nome + (progresso > 0 ? ` (${progresso}%)` : '');

                    return (
                        <div key={e.id} style={{ position: 'relative', height: 44, borderBottom: i < etapas.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center' }}>
                            {/* Dependency arrow indicator */}
                            {hasDep && (
                                <div style={{ position: 'absolute', left: `${Math.max(0, (toMs(etapaMap[e.dependencia_id].data_vencimento || etapaMap[e.dependencia_id].data_inicio) - minMs) / totalMs * 100)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94a3b8', zIndex: 3, pointerEvents: 'none', fontWeight: 700 }}>→</div>
                            )}
                            {/* Etapa name to the left of bar (only if bar starts far enough right) */}
                            {!narrow && left > 12 && (
                                <div style={{ position: 'absolute', left: 4, right: `${100 - left}%`, fontSize: 11, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' }}>{e.nome}</div>
                            )}
                            {/* Bar with progress fill */}
                            <div
                                onClick={() => onEdit && onEdit(e)}
                                title={`${e.nome}\n${dtFmt(e.data_inicio)} → ${dtFmt(e.data_vencimento)}\n${e.responsavel_nome || 'Sem responsável'}\nProgresso: ${progresso}%`}
                                style={{
                                    position: 'absolute', left: `${left}%`, width: `${width}%`, height: 26,
                                    background: `${color}30`, borderRadius: 5, overflow: 'hidden',
                                    cursor: onEdit ? 'pointer' : 'default', transition: 'all 0.2s',
                                    border: isOverdue ? `2px solid #ef4444` : `1.5px solid ${color}80`,
                                }}
                            >
                                {/* Progress fill */}
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progresso}%`, background: `${color}50`, transition: 'width 0.3s' }} />
                                {/* Bar text — only if not narrow */}
                                {!narrow && (
                                    <span style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 600, color: '#1e293b', padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', lineHeight: '26px', display: 'block' }}>
                                        {barText}
                                    </span>
                                )}
                            </div>
                            {/* Info after bar: initials + date + (nome if narrow) */}
                            <div style={{ position: 'absolute', left: `${Math.min(96, left + width + 0.5)}%`, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, zIndex: 3 }}>
                                {e.responsavel_nome && (
                                    <div style={{
                                        width: 22, height: 22, borderRadius: '50%', background: color, color: '#fff',
                                        fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: '2px solid var(--bg-card)', flexShrink: 0,
                                    }}>{getInitials(e.responsavel_nome)}</div>
                                )}
                                {narrow && (
                                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>{barText}</span>
                                )}
                                {endLabel && (
                                    <span style={{ fontSize: 10, color: isOverdue ? '#ef4444' : '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{endLabel}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                {Object.entries(STATUS_ETAPA).filter(([k]) => k !== 'pendente').map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                        <div style={{ width: 12, height: 12, background: v.color, borderRadius: 3 }} />
                        {v.label}
                    </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                    <div style={{ width: 2, height: 12, background: '#ef4444', borderRadius: 1, boxShadow: '0 0 4px rgba(239,68,68,0.5)' }} />
                    Hoje
                </div>
            </div>
        </div>
    );
}

// ─── Modal: Novo Projeto ──────────────────────────────
const ETAPAS_PADRAO = [
    'Medição e levantamento', 'Aprovação do projeto', 'Compra de materiais',
    'Produção', 'Acabamento', 'Entrega e instalação'
];

function NovoProjetoModal({ orcs, onClose, onSave }) {
    const [nome, setNome] = useState('');
    const [orcId, setOrcId] = useState('');
    const [descricao, setDescricao] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [dataVenc, setDataVenc] = useState('');
    const [etapas, setEtapas] = useState(ETAPAS_PADRAO.map((n, i) => ({ nome: n, data_inicio: '', data_vencimento: '', key: i })));
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [templates, setTemplates] = useState([]);
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);
    const [templateNome, setTemplateNome] = useState('');

    useEffect(() => { api.get('/projetos/templates/list').then(setTemplates).catch(() => {}); }, []);

    const addEtapa = () => setEtapas(e => [...e, { nome: '', data_inicio: '', data_vencimento: '', key: Date.now() }]);
    const rmEtapa = (i) => setEtapas(e => e.filter((_, j) => j !== i));

    const loadTemplate = (tpl) => {
        setEtapas(tpl.etapas.map((n, i) => ({ nome: typeof n === 'string' ? n : n.nome, data_inicio: '', data_vencimento: '', key: Date.now() + i })));
    };

    const saveAsTemplate = () => {
        if (!templateNome.trim()) return;
        const nomes = etapas.filter(e => e.nome.trim()).map(e => e.nome.trim());
        if (nomes.length === 0) return;
        api.post('/projetos/templates', { nome: templateNome.trim(), etapas: nomes }).then(() => {
            api.get('/projetos/templates/list').then(setTemplates);
            setShowSaveTemplate(false); setTemplateNome('');
        }).catch(() => {});
    };

    const deleteTemplate = (id) => {
        api.del(`/projetos/templates/${id}`).then(() => {
            setTemplates(t => t.filter(x => x.id !== id));
        });
    };

    const handleSave = async () => {
        if (!nome.trim()) { setErr('Nome do projeto é obrigatório'); return; }
        setSaving(true);
        try {
            await onSave({ nome: nome.trim(), orc_id: orcId || null, descricao, data_inicio: dataInicio || null, data_vencimento: dataVenc || null,
                etapas: etapas.filter(e => e.nome.trim()).map(e => ({ nome: e.nome, data_inicio: e.data_inicio || null, data_vencimento: e.data_vencimento || null }))
            });
            onClose();
        } catch (ex) { setErr(ex?.error || ex?.message || 'Erro ao salvar projeto'); } finally { setSaving(false); }
    };

    return (
        <Modal title="Novo Projeto" close={onClose} w={620}>
            {err && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{err}</p>}
            <div style={{ display: 'grid', gap: 14 }}>
                <div>
                    <label className={Z.lbl}>Nome do Projeto *</label>
                    <input className={Z.inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Cozinha Maria – Rua das Flores" />
                </div>
                <div>
                    <label className={Z.lbl}>Orçamento vinculado</label>
                    <select className={Z.inp} value={orcId} onChange={e => setOrcId(e.target.value)}>
                        <option value="">— Selecionar orçamento —</option>
                        {(orcs || []).map(o => <option key={o.id} value={o.id}>{o.cliente_nome} · {o.ambiente || 'Orçamento #' + o.id}</option>)}
                    </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label className={Z.lbl}>Data de Início</label><input type="date" className={Z.inp} value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></div>
                    <div><label className={Z.lbl}>Data de Entrega</label><input type="date" className={Z.inp} value={dataVenc} onChange={e => setDataVenc(e.target.value)} /></div>
                </div>
                <div><label className={Z.lbl}>Descrição</label><textarea className={Z.inp} style={{ minHeight: 60, resize: 'vertical' }} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes do projeto..." /></div>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <label className={Z.lbl} style={{ margin: 0 }}>Etapas</label>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {templates.length > 0 && (
                                <select onChange={e => { const t = templates.find(x => x.id === +e.target.value); if (t) loadTemplate(t); e.target.value = ''; }}
                                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                    <option value="">Usar template...</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.nome} ({t.etapas.length} etapas)</option>)}
                                </select>
                            )}
                            <button type="button" onClick={() => setShowSaveTemplate(!showSaveTemplate)} className={Z.btn2} style={{ fontSize: 11, padding: '4px 8px' }}>Salvar template</button>
                            <button type="button" onClick={addEtapa} className={Z.btn2} style={{ fontSize: 12, padding: '4px 10px' }}>+ Adicionar</button>
                        </div>
                    </div>
                    {showSaveTemplate && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <input className={Z.inp} style={{ fontSize: 12, flex: 1 }} placeholder="Nome do template" value={templateNome} onChange={e => setTemplateNome(e.target.value)} />
                            <button className={Z.btn} style={{ fontSize: 11, padding: '4px 12px' }} onClick={saveAsTemplate}>Salvar</button>
                        </div>
                    )}
                    <div style={{ display: 'grid', gap: 6 }}>
                        {etapas.map((e, i) => (
                            <div key={e.key} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: 6, alignItems: 'center' }}>
                                <input className={Z.inp} style={{ fontSize: 12, padding: '6px 10px' }} value={e.nome} onChange={ev => setEtapas(et => et.map((x, j) => j === i ? { ...x, nome: ev.target.value } : x))} placeholder={`Etapa ${i + 1}`} />
                                <input type="date" className={Z.inp} style={{ fontSize: 11, padding: '6px 8px' }} value={e.data_inicio} onChange={ev => setEtapas(et => et.map((x, j) => j === i ? { ...x, data_inicio: ev.target.value } : x))} />
                                <input type="date" className={Z.inp} style={{ fontSize: 11, padding: '6px 8px' }} value={e.data_vencimento} onChange={ev => setEtapas(et => et.map((x, j) => j === i ? { ...x, data_vencimento: ev.target.value } : x))} />
                                <button type="button" onClick={() => rmEtapa(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}><Ic.Trash /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button className={Z.btn2} onClick={onClose}>Cancelar</button>
                <button className={Z.btn} onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : <><Ic.Check /> Criar Projeto</>}</button>
            </div>
        </Modal>
    );
}

// ─── Modal: Editar Etapa ──────────────────────────────
function EditEtapaModal({ etapa, etapas, users, onSave, onClose }) {
    const [nome, setNome] = useState(etapa.nome || '');
    const [descricao, setDescricao] = useState(etapa.descricao || '');
    const [dataInicio, setDataInicio] = useState(dtInput(etapa.data_inicio));
    const [dataVencimento, setDataVencimento] = useState(dtInput(etapa.data_vencimento));
    const [status, setStatus] = useState(etapa.status || 'nao_iniciado');
    const [responsavelId, setResponsavelId] = useState(etapa.responsavel_id || '');
    const [progresso, setProgresso] = useState(etapa.progresso || 0);
    const [dependenciaId, setDependenciaId] = useState(etapa.dependencia_id || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!nome.trim()) return;
        setSaving(true);
        try {
            await api.put(`/projetos/etapas/${etapa.id}`, {
                nome: nome.trim(), descricao,
                data_inicio: dataInicio || null,
                data_vencimento: dataVencimento || null,
                status, responsavel_id: responsavelId || null,
                progresso: parseInt(progresso) || 0,
                dependencia_id: dependenciaId || null,
            });
            onSave();
            onClose();
        } catch (ex) { console.error('Erro ao salvar etapa:', ex); }
        finally { setSaving(false); }
    };

    return (
        <Modal title="Editar Etapa" close={onClose} w={540}>
            <div style={{ display: 'grid', gap: 14 }}>
                <div>
                    <label className={Z.lbl}>Nome</label>
                    <input className={Z.inp} value={nome} onChange={e => setNome(e.target.value)} />
                </div>
                <div>
                    <label className={Z.lbl}>Descricao</label>
                    <textarea className={Z.inp} rows={2} style={{ resize: 'vertical' }} value={descricao} onChange={e => setDescricao(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label className={Z.lbl}>Data inicio</label><input type="date" className={Z.inp} value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></div>
                    <div><label className={Z.lbl}>Data entrega</label><input type="date" className={Z.inp} value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label className={Z.lbl}>Status</label>
                        <select className={Z.inp} value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="pendente">Pendente</option>
                            <option value="nao_iniciado">Nao iniciado</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="concluida">Concluida</option>
                            <option value="atrasada">Atrasada</option>
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>Responsavel</label>
                        <select className={Z.inp} value={responsavelId} onChange={e => setResponsavelId(e.target.value)}>
                            <option value="">— Nenhum —</option>
                            {(users || []).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className={Z.lbl}>Progresso: {progresso}%</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="range" min={0} max={100} value={progresso} onChange={e => setProgresso(e.target.value)} style={{ flex: 1 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{progresso}%</span>
                    </div>
                </div>
                <div>
                    <label className={Z.lbl}>Dependencia</label>
                    <select className={Z.inp} value={dependenciaId} onChange={e => setDependenciaId(e.target.value)}>
                        <option value="">— Nenhuma —</option>
                        {(etapas || []).filter(et => et.id !== etapa.id).map(et => <option key={et.id} value={et.id}>{et.nome}</option>)}
                    </select>
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button className={Z.btn2} onClick={onClose}>Cancelar</button>
                <button className={Z.btn} onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════
// TAB: CRONOGRAMA
// ═══════════════════════════════════════════════════════
function TabCronograma({ data, load, notify, users }) {
    const [showEtapaForm, setShowEtapaForm] = useState(false);
    const [showOcForm, setShowOcForm] = useState(false);
    const [newEtapa, setNewEtapa] = useState({ nome: '', data_inicio: '', data_vencimento: '', responsavel_id: '' });
    const [newOc, setNewOc] = useState({ assunto: '', descricao: '', status: 'aberto' });
    const [copied, setCopied] = useState(false);
    const [editEtapa, setEditEtapa] = useState(null);
    const [ganttZoom, setGanttZoom] = useState(1);
    const zoomLevels = [0.5, 0.75, 1, 1.5, 2, 3];

    const portalUrl = `${window.location.origin}/?portal=${data.token}`;

    const copyLink = () => { navigator.clipboard.writeText(portalUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };

    const toggleEtapaStatus = (etapa) => {
        const order = ['nao_iniciado', 'em_andamento', 'concluida'];
        const cur = (!etapa.status || etapa.status === 'pendente') ? 'nao_iniciado' : etapa.status;
        const idx = order.indexOf(cur);
        // pendente/nao_iniciado → em_andamento, em_andamento → concluida, concluida → nao_iniciado
        const next = idx <= 0 ? 'em_andamento' : order[(idx + 1) % order.length];
        api.put(`/projetos/etapas/${etapa.id}`, { ...etapa, status: next }).then(load).catch(() => notify('Erro ao atualizar etapa'));
    };

    const deleteEtapa = (id) => { api.del(`/projetos/etapas/${id}`).then(load).catch(() => notify('Erro ao excluir')); };

    const addEtapa = () => {
        if (!newEtapa.nome.trim()) return;
        api.post(`/projetos/${data.id}/etapas`, { ...newEtapa, responsavel_id: newEtapa.responsavel_id || null })
            .then(() => { load(); setShowEtapaForm(false); setNewEtapa({ nome: '', data_inicio: '', data_vencimento: '', responsavel_id: '' }); })
            .catch(() => notify('Erro ao adicionar etapa'));
    };

    const addOcorrencia = () => {
        if (!newOc.assunto.trim()) return;
        api.post(`/projetos/${data.id}/ocorrencias`, newOc)
            .then(() => { load(); setShowOcForm(false); setNewOc({ assunto: '', descricao: '', status: 'aberto' }); })
            .catch(() => notify('Erro ao registrar ocorrência'));
    };

    const progresso = data.etapas?.length ? Math.round((data.etapas.filter(e => e.status === 'concluida').length / data.etapas.length) * 100) : 0;

    const todayStr = new Date().toISOString().slice(0, 10);

    const changeEtapaStatus = (etapa, newStatus) => {
        api.put(`/projetos/etapas/${etapa.id}`, { ...etapa, status: newStatus }).then(load).catch(() => notify('Erro ao atualizar etapa'));
    };

    return (
        <>
            {editEtapa && (
                <EditEtapaModal
                    etapa={editEtapa}
                    etapas={data.etapas || []}
                    users={users}
                    onSave={load}
                    onClose={() => setEditEtapa(null)}
                />
            )}

            {/* Progresso */}
            <div className={Z.card} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Progresso geral</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{progresso}%</span>
                </div>
                <div style={{ background: 'var(--bg-muted)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${progresso}%`, height: '100%', background: 'var(--primary)', borderRadius: 99, transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    <span>{data.etapas?.filter(e => e.status === 'concluida').length || 0} de {data.etapas?.length || 0} etapas concluídas</span>
                    <span>Entrega: {dtFmt(data.data_vencimento)}</span>
                </div>
            </div>

            {/* Link do portal */}
            <div className={Z.card} style={{ marginBottom: 20, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Ic.Link />
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>Portal do cliente</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{portalUrl}</div>
                    </div>
                    <button onClick={copyLink} className={Z.btn2} style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {copied ? <><Ic.Check /> Copiado!</> : <><CopyIcon size={12} /> Copiar link</>}
                    </button>
                </div>
            </div>

            {/* Gantt */}
            <div className={Z.card} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7, margin: 0 }}><BarChart3 size={16} /> Cronograma / Gantt</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-muted)', borderRadius: 8, padding: '3px 6px', border: '1px solid var(--border)' }}>
                        <button onClick={() => { const idx = zoomLevels.indexOf(ganttZoom); if (idx > 0) setGanttZoom(zoomLevels[idx - 1]); }}
                            disabled={ganttZoom <= 0.5}
                            style={{ background: 'none', border: 'none', cursor: ganttZoom <= 0.5 ? 'not-allowed' : 'pointer', fontSize: 14, padding: '2px 6px', opacity: ganttZoom <= 0.5 ? 0.3 : 1, color: 'var(--text)', borderRadius: 4 }}>-</button>
                        <span style={{ fontSize: 11, fontWeight: 600, minWidth: 42, textAlign: 'center', color: 'var(--text-muted)' }}>{Math.round(ganttZoom * 100)}%</span>
                        <button onClick={() => { const idx = zoomLevels.indexOf(ganttZoom); if (idx < zoomLevels.length - 1) setGanttZoom(zoomLevels[idx + 1]); }}
                            disabled={ganttZoom >= 3}
                            style={{ background: 'none', border: 'none', cursor: ganttZoom >= 3 ? 'not-allowed' : 'pointer', fontSize: 14, padding: '2px 6px', opacity: ganttZoom >= 3 ? 0.3 : 1, color: 'var(--text)', borderRadius: 4 }}>+</button>
                    </div>
                </div>
                <GanttChart etapas={data.etapas || []} onEdit={setEditEtapa} zoom={ganttZoom} />
            </div>

            {/* Etapas */}
            <div className={Z.card} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Ic.ClipboardCheck /> Etapas</h2>
                    <button onClick={() => setShowEtapaForm(!showEtapaForm)} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px' }}>+ Adicionar etapa</button>
                </div>

                {showEtapaForm && (
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                            <div><label className={Z.lbl}>Nome</label><input className={Z.inp} style={{ fontSize: 13 }} value={newEtapa.nome} onChange={e => setNewEtapa(x => ({ ...x, nome: e.target.value }))} placeholder="Ex: Montagem" /></div>
                            <div><label className={Z.lbl}>Início</label><input type="date" className={Z.inp} style={{ fontSize: 13 }} value={newEtapa.data_inicio} onChange={e => setNewEtapa(x => ({ ...x, data_inicio: e.target.value }))} /></div>
                            <div><label className={Z.lbl}>Entrega</label><input type="date" className={Z.inp} style={{ fontSize: 13 }} value={newEtapa.data_vencimento} onChange={e => setNewEtapa(x => ({ ...x, data_vencimento: e.target.value }))} /></div>
                            <div><label className={Z.lbl}>Responsável</label>
                                <select className={Z.inp} style={{ fontSize: 13 }} value={newEtapa.responsavel_id} onChange={e => setNewEtapa(x => ({ ...x, responsavel_id: e.target.value }))}>
                                    <option value="">— Nenhum —</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                                </select>
                            </div>
                            <button onClick={addEtapa} className={Z.btn} style={{ padding: '8px 14px', fontSize: 13 }}><Ic.Check /></button>
                        </div>
                    </div>
                )}

                {(!data.etapas || data.etapas.length === 0) ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma etapa cadastrada.</p>
                ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {data.etapas.map(e => {
                            const st = STATUS_ETAPA[e.status] || STATUS_ETAPA.pendente;
                            const isOverdue = e.data_vencimento && e.data_vencimento < todayStr && e.status !== 'concluida';
                            const effectiveStatus = isOverdue && e.status !== 'atrasada' ? 'atrasada' : e.status;
                            const effectiveSt = STATUS_ETAPA[effectiveStatus] || st;
                            const depEtapa = e.dependencia_id && (data.etapas || []).find(x => x.id === e.dependencia_id);
                            const prog = e.progresso || 0;
                            return (
                                <div key={e.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                                    background: isOverdue ? '#fef2f208' : 'var(--bg-muted)',
                                    borderLeft: `4px solid ${effectiveSt.color}`,
                                    border: isOverdue ? '1px solid #ef444440' : undefined,
                                    borderLeftWidth: 4,
                                }}>
                                    {/* Status dropdown */}
                                    <select value={effectiveStatus} onChange={ev => changeEtapaStatus(e, ev.target.value)}
                                        style={{
                                            width: 28, height: 28, borderRadius: '50%', border: `2px solid ${effectiveSt.color}`,
                                            background: e.status === 'concluida' ? effectiveSt.color : 'transparent',
                                            cursor: 'pointer', flexShrink: 0, fontSize: 0, padding: 0,
                                            appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                                            backgroundImage: e.status === 'concluida'
                                                ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E")`
                                                : 'none',
                                            backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                                        }}
                                        title={`Status: ${effectiveSt.label}`}
                                    >
                                        <option value="nao_iniciado">Nao iniciado</option>
                                        <option value="em_andamento">Em andamento</option>
                                        <option value="concluida">Concluida</option>
                                        <option value="atrasada">Atrasada</option>
                                    </select>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: e.status === 'concluida' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: e.status === 'concluida' ? 'line-through' : 'none' }}>{e.nome}</div>
                                        {/* Progress bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                            <div style={{ flex: 1, background: 'var(--border)', borderRadius: 99, height: 4, overflow: 'hidden', maxWidth: 180 }}>
                                                <div style={{ width: `${prog}%`, height: '100%', background: effectiveSt.color, borderRadius: 99, transition: 'width 0.3s' }} />
                                            </div>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 28 }}>{prog}%</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            {e.data_inicio && <span>{dtFmt(e.data_inicio)} → {dtFmt(e.data_vencimento)}</span>}
                                            {e.responsavel_nome && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><UserIcon size={10} /> {e.responsavel_nome}</span>}
                                            {depEtapa && <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Depende de: {depEtapa.nome}</span>}
                                            {isOverdue && <span style={{ color: '#ef4444', fontWeight: 600 }}>Atrasada</span>}
                                        </div>
                                    </div>
                                    <Badge status={effectiveStatus} map={STATUS_ETAPA} />
                                    <button onClick={() => setEditEtapa(e)} title="Editar etapa"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 4, opacity: 0.7 }}><Ic.Edit /></button>
                                    <button onClick={() => { if (window.confirm(`Excluir etapa "${e.nome}"?`)) deleteEtapa(e.id); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, opacity: 0.6 }} title="Excluir etapa"><Ic.Trash /></button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Ocorrências */}
            <div className={Z.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Ic.Message /> Ocorrências</h2>
                    <button onClick={() => setShowOcForm(!showOcForm)} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px' }}>+ Registrar</button>
                </div>
                {showOcForm && (
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'grid', gap: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                                <div><label className={Z.lbl}>Assunto</label><input className={Z.inp} style={{ fontSize: 13 }} value={newOc.assunto} onChange={e => setNewOc(x => ({ ...x, assunto: e.target.value }))} placeholder="Ex: Atraso na entrega do material" /></div>
                                <div><label className={Z.lbl}>Visibilidade</label>
                                    <select className={Z.inp} style={{ fontSize: 13 }} value={newOc.status} onChange={e => setNewOc(x => ({ ...x, status: e.target.value }))}>
                                        <option value="aberto">Visível ao cliente</option><option value="interno">Interno</option><option value="resolvido">Resolvido</option>
                                    </select>
                                </div>
                            </div>
                            <div><label className={Z.lbl}>Descrição</label><textarea className={Z.inp} style={{ fontSize: 13, minHeight: 60, resize: 'vertical' }} value={newOc.descricao} onChange={e => setNewOc(x => ({ ...x, descricao: e.target.value }))} /></div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={addOcorrencia} className={Z.btn} style={{ fontSize: 13 }}>Salvar</button>
                                <button onClick={() => setShowOcForm(false)} className={Z.btn2} style={{ fontSize: 13 }}>Cancelar</button>
                            </div>
                        </div>
                    </div>
                )}
                {(!data.ocorrencias || data.ocorrencias.length === 0) ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma ocorrência registrada.</p>
                ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                        {data.ocorrencias.map(oc => (
                            <div key={oc.id} style={{ padding: '12px 16px', borderRadius: 10, background: oc.status === 'interno' ? '#fffbeb' : oc.status === 'resolvido' ? '#f0fdf4' : 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{oc.assunto}</div>
                                        {oc.descricao && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{oc.descricao}</p>}
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                            {oc.autor} · {new Date(oc.criado_em).toLocaleDateString('pt-BR')}
                                            {oc.status === 'interno' && <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 600 }}><Ic.Lock /> Interno</span>}
                                        </div>
                                    </div>
                                    <select value={oc.status} onChange={e => api.put(`/projetos/ocorrencias/${oc.id}`, { status: e.target.value }).then(load)}
                                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                        <option value="aberto">Aberto</option><option value="interno">Interno</option><option value="resolvido">Resolvido</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════
// TAB: FINANCEIRO
// ═══════════════════════════════════════════════════════
function TabFinanceiro({ data, notify }) {
    const [resumo, setResumo] = useState(null);
    const [despesas, setDespesas] = useState([]);
    const [contas, setContas] = useState([]);
    const [contasPagar, setContasPagar] = useState([]);
    const [showDespForm, setShowDespForm] = useState(false);
    const [showCRForm, setShowCRForm] = useState(false);
    const [showCPForm, setShowCPForm] = useState(false);
    const [newDesp, setNewDesp] = useState({ descricao: '', valor: '', data: '', categoria: 'material', fornecedor: '' });
    const [newCR, setNewCR] = useState({ descricao: '', valor: '', data_vencimento: '', meio_pagamento: '' });
    const [newCP, setNewCP] = useState({ descricao: '', valor: '', data_vencimento: '', categoria: 'material', fornecedor: '', meio_pagamento: '' });

    const MEIOS_PAG = ['PIX', 'Boleto', 'TED', 'Cartão', 'Dinheiro'];

    const loadAll = useCallback(() => {
        api.get(`/financeiro/${data.id}/resumo`).then(setResumo).catch(() => setResumo(null));
        api.get(`/financeiro/${data.id}/despesas`).then(setDespesas).catch(() => setDespesas([]));
        api.get(`/financeiro/${data.id}/receber`).then(setContas).catch(() => setContas([]));
        api.get(`/financeiro/pagar?projeto_id=${data.id}`).then(setContasPagar).catch(() => setContasPagar([]));
    }, [data.id]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const addDespesa = () => {
        if (!newDesp.descricao || !newDesp.valor) return;
        api.post(`/financeiro/${data.id}/despesas`, { ...newDesp, valor: parseFloat(newDesp.valor) })
            .then(() => { loadAll(); setShowDespForm(false); setNewDesp({ descricao: '', valor: '', data: '', categoria: 'material', fornecedor: '' }); notify('Despesa registrada'); })
            .catch(() => notify('Erro ao registrar despesa'));
    };

    const delDespesa = (id) => { if (window.confirm('Excluir despesa?')) api.del(`/financeiro/despesas/${id}`).then(loadAll); };

    const addCR = () => {
        if (!newCR.descricao || !newCR.valor) return;
        api.post(`/financeiro/${data.id}/receber`, { ...newCR, valor: parseFloat(newCR.valor) })
            .then(() => { loadAll(); setShowCRForm(false); setNewCR({ descricao: '', valor: '', data_vencimento: '', meio_pagamento: '' }); notify('Conta registrada'); })
            .catch(() => notify('Erro'));
    };

    const marcarPago = (cr) => {
        api.put(`/financeiro/receber/${cr.id}`, { ...cr, status: cr.status === 'pago' ? 'pendente' : 'pago' }).then(loadAll);
    };

    const delCR = (id) => { if (window.confirm('Excluir conta?')) api.del(`/financeiro/receber/${id}`).then(loadAll); };

    const importarParcelas = () => {
        api.post(`/financeiro/${data.id}/importar-parcelas`).then(r => { loadAll(); notify(`${r?.parcelas_criadas || 0} parcelas importadas!`); })
            .catch(e => notify(e.error || 'Erro ao importar'));
    };

    const addContaPagar = () => {
        if (!newCP.descricao || !newCP.valor) return;
        api.post('/financeiro/pagar', { ...newCP, valor: parseFloat(newCP.valor), projeto_id: data.id })
            .then(() => { loadAll(); setShowCPForm(false); setNewCP({ descricao: '', valor: '', data_vencimento: '', categoria: 'material', fornecedor: '', meio_pagamento: '' }); notify('Conta a pagar registrada'); })
            .catch(() => notify('Erro ao registrar'));
    };

    const togglePagCP = (cp) => {
        const novoStatus = cp.status === 'pago' ? 'pendente' : 'pago';
        api.put(`/financeiro/pagar/${cp.id}`, {
            descricao: cp.descricao, valor: cp.valor, data_vencimento: cp.data_vencimento,
            status: novoStatus, data_pagamento: novoStatus === 'pago' ? new Date().toISOString().slice(0, 10) : null,
            categoria: cp.categoria, fornecedor: cp.fornecedor || '', meio_pagamento: cp.meio_pagamento || '',
            codigo_barras: cp.codigo_barras || '', projeto_id: cp.projeto_id || null, observacao: cp.observacao || '',
        }).then(() => { loadAll(); notify(novoStatus === 'pago' ? 'Pago!' : 'Reaberto'); });
    };

    const delCP = (id) => { if (window.confirm('Excluir conta a pagar?')) api.del(`/financeiro/pagar/${id}`).then(loadAll); };

    const hoje = new Date().toISOString().slice(0, 10);

    return (
        <>
            {/* Cards de resumo */}
            {resumo && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
                    {[
                        { label: 'Orçado', valor: resumo.orcado, icon: <Receipt size={16} />, color: '#1379F0' },
                        { label: 'Despesas', valor: resumo.total_despesas, icon: <TrendingDown size={16} />, color: '#ef4444' },
                        { label: 'Recebido', valor: resumo.total_recebido, icon: <TrendingUp size={16} />, color: '#22c55e' },
                        { label: 'Pendente', valor: resumo.total_pendente, icon: <Clock size={16} />, color: '#f59e0b' },
                        { label: 'Lucro Estimado', valor: resumo.lucro_estimado, icon: <DollarSign size={16} />, color: resumo.lucro_estimado >= 0 ? '#22c55e' : '#ef4444' },
                    ].map(c => (
                        <div key={c.label} className={Z.card} style={{ padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: c.color }}>{c.icon}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{c.label}</span></div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{R$(c.valor)}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Despesas por categoria */}
            {resumo?.despesas_por_categoria?.length > 0 && (
                <div className={Z.card} style={{ marginBottom: 20 }}>
                    <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Despesas por Categoria</h3>
                    <div style={{ display: 'grid', gap: 6 }}>
                        {resumo.despesas_por_categoria.map(dc => {
                            const cat = catMap[dc.categoria] || { label: dc.categoria, color: '#94a3b8' };
                            const pct = resumo.total_despesas > 0 ? (dc.total / resumo.total_despesas) * 100 : 0;
                            return (
                                <div key={dc.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 12, minWidth: 100, color: 'var(--text-muted)' }}>{cat.label}</span>
                                    <div style={{ flex: 1, background: 'var(--bg-muted)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', background: cat.color, borderRadius: 99 }} />
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 600, minWidth: 90, textAlign: 'right' }}>{R$(dc.total)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Despesas */}
            <div className={Z.card} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><ArrowDownCircle size={16} color="#ef4444" /> Despesas</h2>
                    <button onClick={() => setShowDespForm(!showDespForm)} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px' }}><PlusCircle size={12} /> Adicionar</button>
                </div>

                {showDespForm && (
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div><label className={Z.lbl}>Descrição *</label><input className={Z.inp} style={{ fontSize: 13 }} value={newDesp.descricao} onChange={e => setNewDesp(x => ({ ...x, descricao: e.target.value }))} placeholder="Ex: Compra MDF" /></div>
                            <div><label className={Z.lbl}>Valor (R$) *</label><input type="number" step="0.01" className={Z.inp} style={{ fontSize: 13 }} value={newDesp.valor} onChange={e => setNewDesp(x => ({ ...x, valor: e.target.value }))} /></div>
                            <div><label className={Z.lbl}>Data</label><input type="date" className={Z.inp} style={{ fontSize: 13 }} value={newDesp.data} onChange={e => setNewDesp(x => ({ ...x, data: e.target.value }))} /></div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                            <div><label className={Z.lbl}>Categoria</label>
                                <select className={Z.inp} style={{ fontSize: 13 }} value={newDesp.categoria} onChange={e => setNewDesp(x => ({ ...x, categoria: e.target.value }))}>
                                    {CATEGORIAS_DESPESA.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                            <div><label className={Z.lbl}>Fornecedor</label><input className={Z.inp} style={{ fontSize: 13 }} value={newDesp.fornecedor} onChange={e => setNewDesp(x => ({ ...x, fornecedor: e.target.value }))} /></div>
                            <button onClick={addDespesa} className={Z.btn} style={{ padding: '8px 16px', fontSize: 13 }}>Salvar</button>
                        </div>
                    </div>
                )}

                {despesas.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma despesa registrada.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead><tr>{['Data', 'Descrição', 'Categoria', 'Fornecedor', 'Valor', ''].map(h => <th key={h} className={Z.th} style={{ fontSize: 11 }}>{h}</th>)}</tr></thead>
                            <tbody>
                                {despesas.map(d => {
                                    const cat = catMap[d.categoria] || { label: d.categoria, color: '#94a3b8' };
                                    return (
                                        <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                                            <td style={{ padding: '8px 12px', fontSize: 12 }}>{dtFmt(d.data)}</td>
                                            <td style={{ padding: '8px 12px', fontWeight: 600 }}>{d.descricao}</td>
                                            <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11, background: `${cat.color}15`, color: cat.color, padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{cat.label}</span></td>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>{d.fornecedor || '—'}</td>
                                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#ef4444' }}>{R$(d.valor)}</td>
                                            <td style={{ padding: '8px 12px' }}><button onClick={() => delDespesa(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.5 }}><Trash2 size={14} /></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Contas a Receber */}
            <div className={Z.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><ArrowUpCircle size={16} color="#22c55e" /> Contas a Receber</h2>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {contas.filter(c => c.auto_gerada).length === 0 && data.orc_id && (
                            <button onClick={importarParcelas} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px', color: '#1379F0' }}>⬇ Importar do orçamento</button>
                        )}
                        <button onClick={() => setShowCRForm(!showCRForm)} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px' }}><PlusCircle size={12} /> Adicionar</button>
                    </div>
                </div>

                {showCRForm && (
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                            <div><label className={Z.lbl}>Descrição *</label><input className={Z.inp} style={{ fontSize: 13 }} value={newCR.descricao} onChange={e => setNewCR(x => ({ ...x, descricao: e.target.value }))} placeholder="Parcela" /></div>
                            <div><label className={Z.lbl}>Valor (R$) *</label><input type="number" step="0.01" className={Z.inp} style={{ fontSize: 13 }} value={newCR.valor} onChange={e => setNewCR(x => ({ ...x, valor: e.target.value }))} /></div>
                            <div><label className={Z.lbl}>Vencimento</label><input type="date" className={Z.inp} style={{ fontSize: 13 }} value={newCR.data_vencimento} onChange={e => setNewCR(x => ({ ...x, data_vencimento: e.target.value }))} /></div>
                            <div><label className={Z.lbl}>Meio</label><input className={Z.inp} style={{ fontSize: 13 }} value={newCR.meio_pagamento} onChange={e => setNewCR(x => ({ ...x, meio_pagamento: e.target.value }))} placeholder="PIX, Boleto..." /></div>
                            <button onClick={addCR} className={Z.btn} style={{ padding: '8px 14px', fontSize: 13 }}>Salvar</button>
                        </div>
                    </div>
                )}

                {contas.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma conta registrada.</p>
                ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {contas.map(cr => {
                            const vencida = cr.status !== 'pago' && cr.data_vencimento && cr.data_vencimento < hoje;
                            const proxima = cr.status !== 'pago' && cr.data_vencimento && !vencida && cr.data_vencimento <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                            const bg = cr.status === 'pago' ? '#f0fdf4' : vencida ? '#fef2f2' : proxima ? '#fffbeb' : 'var(--bg-muted)';
                            const borderColor = cr.status === 'pago' ? '#22c55e' : vencida ? '#ef4444' : proxima ? '#f59e0b' : 'var(--border)';
                            return (
                                <div key={cr.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: bg, border: `1px solid ${borderColor}30`, borderLeft: `4px solid ${borderColor}` }}>
                                    <button onClick={() => marcarPago(cr)} title={cr.status === 'pago' ? 'Reverter' : 'Marcar como pago'}
                                        style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${borderColor}`, background: cr.status === 'pago' ? '#22c55e' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {cr.status === 'pago' && <CheckIcon size={12} color="#fff" />}
                                    </button>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, textDecoration: cr.status === 'pago' ? 'line-through' : 'none', color: cr.status === 'pago' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{cr.descricao}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            <span>Venc.: {dtFmt(cr.data_vencimento)}</span>
                                            {cr.meio_pagamento && <span>• {cr.meio_pagamento}</span>}
                                            {cr.status === 'pago' && cr.data_pagamento && <span style={{ color: '#22c55e', fontWeight: 600 }}>Pago em {dtFmt(cr.data_pagamento)}</span>}
                                            {vencida && <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} /> Vencida</span>}
                                            {proxima && <span style={{ color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> Vencendo</span>}
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: cr.status === 'pago' ? '#22c55e' : vencida ? '#ef4444' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{R$(cr.valor)}</div>
                                    <button onClick={() => delCR(cr.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, opacity: 0.4 }}><Trash2 size={14} /></button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Contas a Pagar (vinculadas a este projeto) */}
            <div className={Z.card} style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><DollarSign size={16} color="#f59e0b" /> Contas a Pagar</h2>
                    <button onClick={() => setShowCPForm(!showCPForm)} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px' }}><PlusCircle size={12} /> Adicionar</button>
                </div>

                {showCPForm && (
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div><label className={Z.lbl}>Descrição *</label><input className={Z.inp} style={{ fontSize: 13 }} value={newCP.descricao} onChange={e => setNewCP(x => ({ ...x, descricao: e.target.value }))} placeholder="Ex: Compra de MDF" /></div>
                            <div><label className={Z.lbl}>Valor (R$) *</label><input type="number" step="0.01" className={Z.inp} style={{ fontSize: 13 }} value={newCP.valor} onChange={e => setNewCP(x => ({ ...x, valor: e.target.value }))} /></div>
                            <div><label className={Z.lbl}>Vencimento</label><input type="date" className={Z.inp} style={{ fontSize: 13 }} value={newCP.data_vencimento} onChange={e => setNewCP(x => ({ ...x, data_vencimento: e.target.value }))} /></div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                            <div><label className={Z.lbl}>Categoria</label>
                                <select className={Z.inp} style={{ fontSize: 13 }} value={newCP.categoria} onChange={e => setNewCP(x => ({ ...x, categoria: e.target.value }))}>
                                    {CATEGORIAS_DESPESA.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                            <div><label className={Z.lbl}>Fornecedor</label><input className={Z.inp} style={{ fontSize: 13 }} value={newCP.fornecedor} onChange={e => setNewCP(x => ({ ...x, fornecedor: e.target.value }))} /></div>
                            <div><label className={Z.lbl}>Meio Pagamento</label>
                                <select className={Z.inp} style={{ fontSize: 13 }} value={newCP.meio_pagamento} onChange={e => setNewCP(x => ({ ...x, meio_pagamento: e.target.value }))}>
                                    <option value="">Selecionar...</option>
                                    {MEIOS_PAG.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <button onClick={addContaPagar} className={Z.btn} style={{ padding: '8px 14px', fontSize: 13 }}>Salvar</button>
                        </div>
                    </div>
                )}

                {contasPagar.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma conta a pagar vinculada a este projeto.</p>
                ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {contasPagar.map(cp => {
                            const vencida = cp.status !== 'pago' && cp.data_vencimento && cp.data_vencimento < hoje;
                            const proxima = cp.status !== 'pago' && cp.data_vencimento && !vencida && cp.data_vencimento <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                            const bg = cp.status === 'pago' ? '#f0fdf4' : vencida ? '#fef2f2' : proxima ? '#fffbeb' : 'var(--bg-muted)';
                            const borderColor = cp.status === 'pago' ? '#22c55e' : vencida ? '#ef4444' : proxima ? '#f59e0b' : 'var(--border)';
                            const cat = catMap[cp.categoria] || { label: cp.categoria, color: '#94a3b8' };
                            return (
                                <div key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: bg, border: `1px solid ${borderColor}30`, borderLeft: `4px solid ${borderColor}` }}>
                                    <button onClick={() => togglePagCP(cp)} title={cp.status === 'pago' ? 'Reverter' : 'Marcar como pago'}
                                        style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${borderColor}`, background: cp.status === 'pago' ? '#22c55e' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {cp.status === 'pago' && <CheckIcon size={12} color="#fff" />}
                                    </button>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, textDecoration: cp.status === 'pago' ? 'line-through' : 'none', color: cp.status === 'pago' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{cp.descricao}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            <span>Venc.: {dtFmt(cp.data_vencimento)}</span>
                                            <span style={{ fontSize: 10, background: `${cat.color}15`, color: cat.color, padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>{cat.label}</span>
                                            {cp.fornecedor && <span>• {cp.fornecedor}</span>}
                                            {cp.meio_pagamento && <span>• {cp.meio_pagamento}</span>}
                                            {cp.status === 'pago' && cp.data_pagamento && <span style={{ color: '#22c55e', fontWeight: 600 }}>Pago em {dtFmt(cp.data_pagamento)}</span>}
                                            {vencida && <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} /> Vencida</span>}
                                            {proxima && <span style={{ color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> Vencendo</span>}
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: cp.status === 'pago' ? '#22c55e' : vencida ? '#ef4444' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{R$(cp.valor)}</div>
                                    <button onClick={() => delCP(cp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, opacity: 0.4 }}><Trash2 size={14} /></button>
                                </div>
                            );
                        })}
                        {/* Total */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderTop: '2px solid var(--border)', marginTop: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                                Total pendente: {contasPagar.filter(c => c.status === 'pendente').length} conta(s)
                            </span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>
                                {R$(contasPagar.filter(c => c.status === 'pendente').reduce((s, c) => s + (c.valor || 0), 0))}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════
// TAB: ESTOQUE (comparativo orçado vs gasto)
// ═══════════════════════════════════════════════════════
function TabEstoque({ data, notify, user }) {
    const [comparativo, setComparativo] = useState(null);
    const [materiais, setMateriais] = useState([]);
    const [movs, setMovs] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newMov, setNewMov] = useState({ material_id: '', quantidade: '', descricao: '' });
    const [recalculando, setRecalculando] = useState(false);
    const [searchMat, setSearchMat] = useState('');
    const [showMatList, setShowMatList] = useState(false);
    const matSearchRef = useRef(null);

    const canDelete = user && (user.role === 'admin' || user.role === 'gerente');

    const loadAll = useCallback(() => {
        api.get(`/estoque/projeto/${data.id}/comparativo`).then(setComparativo).catch(() => {});
        api.get(`/estoque/projeto/${data.id}`).then(setMovs).catch(() => {});
        api.get('/estoque').then(setMateriais).catch(() => {});
    }, [data.id]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const registrarConsumo = () => {
        if (!newMov.material_id || !newMov.quantidade) return;
        api.post(`/estoque/projeto/${data.id}/consumir`, { material_id: parseInt(newMov.material_id), quantidade: parseFloat(newMov.quantidade), descricao: newMov.descricao })
            .then(() => { loadAll(); setShowForm(false); setNewMov({ material_id: '', quantidade: '', descricao: '' }); setSearchMat(''); setShowMatList(false); notify('Consumo registrado'); })
            .catch(e => notify(e.error || 'Erro'));
    };

    // Fechar lista de materiais ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (matSearchRef.current && !matSearchRef.current.contains(e.target)) {
                setShowMatList(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const recalcularOrcado = () => {
        setRecalculando(true);
        api.post(`/estoque/projeto/${data.id}/recalcular-orcado`)
            .then(r => {
                loadAll();
                if (r.itens > 0) {
                    notify(`Orçado recalculado (${r.itens} itens)`);
                } else if (r.modulos === 0) {
                    notify('Nenhum módulo configurado no orçamento. Adicione módulos aos ambientes para gerar o comparativo.');
                } else {
                    notify('Orçado recalculado — nenhum material encontrado nos módulos');
                }
            })
            .catch(e => notify(e.error || 'Erro ao recalcular'))
            .finally(() => setRecalculando(false));
    };

    const excluirMov = (mov) => {
        if (!window.confirm(`Excluir movimentação de ${mov.quantidade} ${mov.unidade || 'un'} de ${mov.material_nome}? O estoque será revertido automaticamente.`)) return;
        api.del(`/estoque/movimentacao/${mov.id}`)
            .then(() => { loadAll(); notify('Movimentação excluída e estoque revertido'); })
            .catch(e => notify(e.error || 'Erro ao excluir'));
    };

    const comparativoVazio = !comparativo || !comparativo.comparativo || comparativo.comparativo.length === 0;
    const temOrcamento = data.orc_id;

    return (
        <>
            {/* Comparativo Orçado vs Gasto */}
            {!comparativoVazio ? (
                <div className={Z.card} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><BarChart3 size={16} /> Orçado vs Gasto</h2>
                        <button onClick={recalcularOrcado} disabled={recalculando} className={Z.btn2} style={{ fontSize: 11, padding: '5px 10px' }}>
                            {recalculando ? 'Recalculando...' : '↻ Recalcular Orçado'}
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div style={{ background: '#eff6ff', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Orçado</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#1379F0' }}>{R$(comparativo.totais.orcado)}</div>
                        </div>
                        <div style={{ background: '#fef2f2', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Gasto</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{R$(comparativo.totais.gasto)}</div>
                        </div>
                        <div style={{ background: comparativo.totais.diferenca >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Diferença</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: comparativo.totais.diferenca >= 0 ? '#22c55e' : '#ef4444' }}>{R$(comparativo.totais.diferenca)}</div>
                        </div>
                    </div>
                    {comparativo.totais.orcado === 0 && comparativo.totais.gasto > 0 && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#92400e' }}>Orçamento sem módulos configurados — valores orçados estão zerados. Configure os módulos no editor de orçamento e recalcule.</span>
                        </div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr>{['Material', 'Orçado', 'Gasto', 'Diferença'].map(h => <th key={h} className={Z.th} style={{ fontSize: 11 }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {comparativo.comparativo.map((c, i) => (
                                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.nome}</td>
                                    <td style={{ padding: '8px 12px', color: '#1379F0' }}>{R$(c.orcado_valor)}</td>
                                    <td style={{ padding: '8px 12px', color: '#ef4444' }}>{R$(c.gasto_valor)}</td>
                                    <td style={{ padding: '8px 12px', fontWeight: 700, color: c.dif_valor >= 0 ? '#22c55e' : '#ef4444' }}>{R$(c.dif_valor)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            ) : temOrcamento ? (
                <div className={Z.card} style={{ marginBottom: 20, textAlign: 'center', padding: 30 }}>
                    <BarChart3 size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
                    <h2 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Comparativo Orçado vs Gasto</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                        Este projeto possui orçamento vinculado. Clique para calcular o comparativo de materiais.
                    </p>
                    <button onClick={recalcularOrcado} disabled={recalculando} className={Z.btn} style={{ fontSize: 13, padding: '8px 18px' }}>
                        {recalculando ? 'Calculando...' : 'Calcular Orçado'}
                    </button>
                </div>
            ) : null}

            {/* Registrar Consumo */}
            <div className={Z.card} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Package size={16} /> Consumo de Materiais</h2>
                    <button onClick={() => setShowForm(!showForm)} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px' }}><PlusCircle size={12} /> Registrar consumo</button>
                </div>

                {showForm && (() => {
                    const selectedMat = materiais.find(m => String(m.id) === String(newMov.material_id));
                    const q = searchMat.toLowerCase();
                    const filteredMat = materiais.filter(m =>
                        !q || m.nome.toLowerCase().includes(q) || (m.cod || '').toLowerCase().includes(q)
                    );
                    return (
                        <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                                <div style={{ position: 'relative' }} ref={matSearchRef}>
                                    <label className={Z.lbl}>Material</label>
                                    {selectedMat ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div className={Z.inp} style={{ fontSize: 13, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'default' }}>
                                                <span style={{ fontWeight: 600 }}>{selectedMat.nome} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({selectedMat.unidade})</span></span>
                                                <button onClick={() => { setNewMov(x => ({ ...x, material_id: '' })); setSearchMat(''); setShowMatList(true); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', fontSize: 14, lineHeight: 1 }}
                                                    title="Trocar material">&times;</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ position: 'relative' }}>
                                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                                <input
                                                    className={Z.inp}
                                                    style={{ fontSize: 13, paddingLeft: 30 }}
                                                    placeholder="Buscar material..."
                                                    value={searchMat}
                                                    onChange={e => { setSearchMat(e.target.value); setShowMatList(true); }}
                                                    onFocus={() => setShowMatList(true)}
                                                />
                                            </div>
                                            {showMatList && (
                                                <div style={{
                                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                                    background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                                                    maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                                                    marginTop: 2
                                                }}>
                                                    {filteredMat.length === 0 ? (
                                                        <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 12 }}>Nenhum material encontrado</div>
                                                    ) : filteredMat.map(m => (
                                                        <div key={m.id}
                                                            onClick={() => { setNewMov(x => ({ ...x, material_id: String(m.id) })); setSearchMat(''); setShowMatList(false); }}
                                                            style={{
                                                                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                                                                borderBottom: '1px solid #eee',
                                                                background: '#fff',
                                                                transition: 'background 0.1s'
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                        >
                                                            <span style={{ fontWeight: 600 }}>{m.nome}</span>
                                                            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({m.unidade})</span>
                                                            {m.cod && <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>#{m.cod}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div><label className={Z.lbl}>Quantidade</label><input type="number" step="0.01" className={Z.inp} style={{ fontSize: 13 }} value={newMov.quantidade} onChange={e => setNewMov(x => ({ ...x, quantidade: e.target.value }))} /></div>
                                <div><label className={Z.lbl}>Descrição</label><input className={Z.inp} style={{ fontSize: 13 }} value={newMov.descricao} onChange={e => setNewMov(x => ({ ...x, descricao: e.target.value }))} placeholder="Opcional" /></div>
                                <button onClick={registrarConsumo} className={Z.btn} style={{ padding: '8px 14px', fontSize: 13 }}>Salvar</button>
                            </div>
                        </div>
                    );
                })()}

                {movs.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum consumo registrado neste projeto.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr>{['Data', 'Material', 'Qtd', 'Tipo', 'Valor Unit.', 'Descrição', ...(canDelete ? [''] : [])].map(h => <th key={h} className={Z.th} style={{ fontSize: 11 }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {movs.map(m => (
                                <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px 12px', fontSize: 12 }}>{new Date(m.criado_em).toLocaleDateString('pt-BR')}</td>
                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.material_nome}</td>
                                    <td style={{ padding: '8px 12px' }}>{m.quantidade} {m.unidade}</td>
                                    <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11, fontWeight: 600, color: m.tipo === 'entrada' ? '#22c55e' : '#ef4444' }}>{m.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}</span></td>
                                    <td style={{ padding: '8px 12px', fontSize: 12 }}>{m.valor_unitario ? R$(m.valor_unitario) : '—'}</td>
                                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{m.descricao}</td>
                                    {canDelete && (
                                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                            <button onClick={() => excluirMov(m)} title="Excluir movimentação" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.6, transition: 'opacity 0.15s', padding: 4 }}
                                                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                                onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════
// TAB: ARQUIVOS (upload local + link montador)
// ═══════════════════════════════════════════════════════
function TabArquivos({ data, notify }) {
    const [arquivos, setArquivos] = useState([]);
    const [montadorLinks, setMontadorLinks] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [newMontador, setNewMontador] = useState('');
    const [showMontadorForm, setShowMontadorForm] = useState(false);
    const [copiedLink, setCopiedLink] = useState(null);
    const [montadorFotos, setMontadorFotos] = useState([]);
    const [fotoFilter, setFotoFilter] = useState('');
    const [fotoLightbox, setFotoLightbox] = useState(null);
    const [editingMontador, setEditingMontador] = useState(null);
    const [editMontadorNome, setEditMontadorNome] = useState('');

    const loadAll = useCallback(() => {
        api.get(`/drive/projeto/${data.id}/arquivos`).then(setArquivos).catch(() => {});
        api.get(`/montador/links/${data.id}`).then(setMontadorLinks).catch(() => {});
        api.get(`/montador/fotos/${data.id}`).then(setMontadorFotos).catch(() => setMontadorFotos([]));
    }, [data.id]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                await api.post(`/drive/projeto/${data.id}/upload`, { filename: file.name, data: ev.target.result });
                loadAll();
                notify('Arquivo enviado');
            } catch { notify('Erro ao enviar'); }
            finally { setUploading(false); }
        };
        reader.readAsDataURL(file);
    };

    const deleteFile = (nome) => {
        if (!window.confirm(`Excluir "${nome}"?`)) return;
        api.del(`/drive/arquivo/${data.id}/${encodeURIComponent(nome)}`).then(loadAll).catch(() => notify('Erro'));
    };

    const gerarLinkMontador = () => {
        if (!newMontador.trim()) return;
        api.post(`/montador/gerar-link/${data.id}`, { nome_montador: newMontador.trim() })
            .then(() => { loadAll(); setShowMontadorForm(false); setNewMontador(''); notify('Link gerado!'); })
            .catch(() => notify('Erro ao gerar link'));
    };

    const toggleMontadorLink = (id) => {
        api.put(`/montador/toggle/${id}`).then(loadAll);
    };

    const copyMontadorLink = (token) => {
        const url = `${window.location.origin}/?montador=${token}`;
        navigator.clipboard.writeText(url).then(() => { setCopiedLink(token); setTimeout(() => setCopiedLink(null), 2000); });
    };

    const saveMontadorNome = (id) => {
        if (!editMontadorNome.trim()) return;
        api.put(`/montador/link/${id}`, { nome_montador: editMontadorNome.trim() })
            .then(() => { loadAll(); setEditingMontador(null); setEditMontadorNome(''); notify('Nome atualizado!'); })
            .catch(() => notify('Erro ao atualizar nome'));
    };

    const isImage = (tipo) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(tipo);
    const API_BASE = import.meta.env.VITE_API || '';
    const fmtSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

    return (
        <>
            {/* Upload */}
            <div className={Z.card} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Ic.Folder /> Arquivos do Projeto</h2>
                    <label className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <PlusCircle size={12} /> {uploading ? 'Enviando...' : 'Upload'}
                        <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
                    </label>
                </div>

                {arquivos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                        <div style={{ marginBottom: 8, opacity: 0.3 }}><Ic.FolderOpen /></div>
                        <p style={{ fontSize: 13 }}>Nenhum arquivo enviado. Clique em "Upload" para adicionar.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {arquivos.map(f => (
                            <div key={f.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                {isImage(f.tipo) ? (
                                    <img src={`${API_BASE}${f.url}`} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
                                ) : (
                                    <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>{f.tipo || '?'}</div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {fmtSize(f.tamanho)} · {new Date(f.data).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                                <a href={`${API_BASE}${f.url}`} target="_blank" rel="noreferrer"
                                    style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 600, textDecoration: 'none', padding: '4px 8px' }}>Abrir</a>
                                <button onClick={() => deleteFile(f.nome)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, opacity: 0.5 }}><Ic.Trash /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Link do Montador */}
            <div className={Z.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><Ic.HardHat /> Links para Montador</h2>
                    <button onClick={() => setShowMontadorForm(!showMontadorForm)} className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px' }}><PlusCircle size={12} /> Novo Link</button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                    Gere links para montadores enviarem fotos do andamento da obra. Eles só podem enviar, não visualizar.
                </p>

                {showMontadorForm && (
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
                            <div style={{ flex: 1 }}>
                                <label className={Z.lbl}>Nome do Montador</label>
                                <input className={Z.inp} style={{ fontSize: 13 }} value={newMontador} onChange={e => setNewMontador(e.target.value)} placeholder="Ex: João Silva" />
                            </div>
                            <button onClick={gerarLinkMontador} className={Z.btn} style={{ padding: '8px 16px', fontSize: 13 }}>Gerar Link</button>
                        </div>
                    </div>
                )}

                {montadorLinks.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum link gerado ainda.</p>
                ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {montadorLinks.map(link => (
                            <div key={link.id} style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                                background: link.ativo ? 'var(--bg-muted)' : '#fef2f220',
                                border: `1px solid ${link.ativo ? 'var(--border)' : '#ef444440'}`,
                                opacity: link.ativo ? 1 : 0.7,
                            }}>
                                <div style={{ flex: 1 }}>
                                    {editingMontador === link.id ? (
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <input
                                                className={Z.inp}
                                                style={{ fontSize: 13, padding: '4px 8px', flex: 1, maxWidth: 220 }}
                                                value={editMontadorNome}
                                                onChange={e => setEditMontadorNome(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') saveMontadorNome(link.id); if (e.key === 'Escape') { setEditingMontador(null); setEditMontadorNome(''); } }}
                                                autoFocus
                                                placeholder="Nome do montador"
                                            />
                                            <button onClick={() => saveMontadorNome(link.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#22c55e' }} title="Salvar"><CheckIcon size={14} /></button>
                                            <button onClick={() => { setEditingMontador(null); setEditMontadorNome(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: '#ef4444' }} title="Cancelar"><XIcon size={14} /></button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{link.nome_montador}</span>
                                            <button
                                                onClick={() => { setEditingMontador(link.id); setEditMontadorNome(link.nome_montador); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 4px', opacity: 0.5, color: 'var(--text)' }}
                                                title="Editar nome"
                                            ><Pencil size={12} /></button>
                                            {!link.ativo && <span style={{ color: '#ef4444', fontSize: 11, marginLeft: 4 }}>Desativado</span>}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                        Criado em {new Date(link.criado_em).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                                <button onClick={() => copyMontadorLink(link.token)} className={Z.btn2} style={{ fontSize: 11, padding: '4px 10px' }}>
                                    {copiedLink === link.token ? <><CheckIcon size={12} /> Copiado!</> : <><Clipboard size={12} /> Copiar Link</>}
                                </button>
                                <button onClick={() => toggleMontadorLink(link.id)} className={Z.btn2} style={{ fontSize: 11, padding: '4px 10px', color: link.ativo ? '#f59e0b' : '#22c55e' }}>
                                    {link.ativo ? 'Desativar' : 'Ativar'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Fotos do Montador */}
            <div className={Z.card} style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <h2 style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7, margin: 0 }}>
                        <Ic.Image /> Fotos
                        {montadorFotos.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({montadorFotos.filter(f => f.visivel_portal).length} de {montadorFotos.length} no portal)
                        </span>}
                    </h2>
                    <label className={Z.btn2} style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                        <Upload size={13} /> Enviar Foto
                        <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            const uploads = [];
                            for (const file of files) {
                                const reader = new FileReader();
                                uploads.push(new Promise((resolve) => {
                                    reader.onload = async () => {
                                        try {
                                            await api.post(`/montador/fotos/${data.id}/upload`, {
                                                filename: file.name,
                                                data: reader.result,
                                                ambiente: fotoFilter || '',
                                            });
                                        } catch { /* erro */ }
                                        resolve();
                                    };
                                    reader.readAsDataURL(file);
                                }));
                            }
                            Promise.all(uploads).then(() => {
                                api.get(`/montador/fotos/${data.id}`).then(setMontadorFotos).catch(() => {});
                                notify('Foto(s) enviada(s)!');
                            });
                            e.target.value = '';
                        }} />
                    </label>
                </div>

                {montadorFotos.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma foto enviada ainda. Use o botao acima ou gere um link de montador.</p>
                ) : (
                    <>
                        {/* Filter */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className={Z.inp} style={{ fontSize: 13, maxWidth: 260 }} value={fotoFilter} onChange={e => setFotoFilter(e.target.value)}>
                                <option value="">Todos os ambientes</option>
                                {[...new Set(montadorFotos.map(f => f.ambiente).filter(Boolean))].map(amb => (
                                    <option key={amb} value={amb}>{amb}</option>
                                ))}
                            </select>
                        </div>

                        {/* Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                            {montadorFotos.filter(f => !fotoFilter || f.ambiente === fotoFilter).map(foto => (
                                <div key={foto.id || foto.url}
                                    onClick={() => setFotoLightbox(foto)}
                                    style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${foto.visivel_portal ? '#22c55e40' : 'var(--border)'}`, background: 'var(--bg-muted)', transition: 'transform 0.15s', position: 'relative', cursor: 'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = ''}
                                >
                                    <img src={`${API_BASE}${foto.url}`} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                                    {/* Badge visual (não clicável) */}
                                    <div style={{
                                        position: 'absolute', top: 6, right: 6,
                                        background: foto.visivel_portal ? '#22c55e' : 'rgba(0,0,0,0.5)',
                                        borderRadius: 6, padding: '3px 6px',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        color: '#fff', fontSize: 10, fontWeight: 600,
                                        pointerEvents: 'none',
                                    }}>
                                        {foto.visivel_portal ? <Eye size={11} /> : <EyeOff size={11} />}
                                        {foto.visivel_portal ? 'Portal' : 'Interno'}
                                    </div>
                                    <div style={{ padding: '8px 10px' }}>
                                        {foto.nome_montador && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{foto.nome_montador}</div>}
                                        {foto.ambiente && <span style={{ fontSize: 10, background: '#8b5cf615', color: '#8b5cf6', padding: '1px 7px', borderRadius: 8, fontWeight: 600 }}>{foto.ambiente}</span>}
                                        {foto.criado_em && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{new Date(foto.criado_em).toLocaleString('pt-BR')}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Lightbox / Modal com ações */}
                {fotoLightbox && (
                    <Modal title={fotoLightbox.nome_montador ? `Foto - ${fotoLightbox.nome_montador}` : 'Foto'} close={() => setFotoLightbox(null)} w={800}>
                        <img src={`${API_BASE}${fotoLightbox.url}`} alt="" style={{ width: '100%', borderRadius: 8, maxHeight: '70vh', objectFit: 'contain' }} />
                        <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                            {fotoLightbox.nome_montador && <span>Por: <b>{fotoLightbox.nome_montador}</b></span>}
                            {fotoLightbox.ambiente && <span>Ambiente: <b>{fotoLightbox.ambiente}</b></span>}
                            {fotoLightbox.criado_em && <span>{new Date(fotoLightbox.criado_em).toLocaleString('pt-BR')}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {/* Excluir */}
                            <button
                                className={Z.btn2}
                                style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4, color: '#ef4444', borderColor: '#ef444440' }}
                                onClick={async () => {
                                    if (!confirm('Excluir esta foto permanentemente?')) return;
                                    try {
                                        await api.del(`/montador/fotos/${fotoLightbox.id}`);
                                        setMontadorFotos(prev => prev.filter(f => f.id !== fotoLightbox.id));
                                        setFotoLightbox(null);
                                        notify('Foto excluida');
                                    } catch { notify('Erro ao excluir'); }
                                }}
                            >
                                <Trash2 size={12} /> Excluir
                            </button>
                            {/* Toggle portal */}
                            <button
                                className={Z.btn2}
                                style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4,
                                    background: fotoLightbox.visivel_portal ? '#22c55e15' : undefined,
                                    color: fotoLightbox.visivel_portal ? '#22c55e' : undefined,
                                    borderColor: fotoLightbox.visivel_portal ? '#22c55e40' : undefined,
                                }}
                                onClick={async () => {
                                    try {
                                        const res = await api.put(`/montador/fotos/${fotoLightbox.id}/portal`);
                                        const updated = { ...fotoLightbox, visivel_portal: res.visivel_portal };
                                        setFotoLightbox(updated);
                                        setMontadorFotos(prev => prev.map(f => f.id === fotoLightbox.id ? { ...f, visivel_portal: res.visivel_portal } : f));
                                    } catch { /* erro */ }
                                }}
                            >
                                {fotoLightbox.visivel_portal ? <><Eye size={12} /> Remover do portal</> : <><EyeOff size={12} /> Liberar no portal</>}
                            </button>
                        </div>
                    </Modal>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════
// TAB PRODUÇÃO — Lista de Corte, Chapas, Ferragens, BOM
// ═══════════════════════════════════════════════════════
const prodThStyle = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const prodTdStyle = { padding: '8px 12px', whiteSpace: 'nowrap' };

function TabProducao({ data, notify }) {
    const [prodData, setProdData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subTab, setSubTab] = useState('corte');
    const [expandedMat, setExpandedMat] = useState({});

    useEffect(() => {
        if (!data?.id) return;
        setLoading(true);
        api.get(`/producao/${data.id}`).then(d => { setProdData(d); setLoading(false); }).catch(() => setLoading(false));
    }, [data?.id]);

    if (loading) return <Spinner text="Carregando produção..." />;

    if (!prodData) return (
        <div className={Z.card} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <Scissors size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
            <p>Não foi possível carregar dados de produção.</p>
            <p style={{ fontSize: 12 }}>Verifique se o orçamento possui módulos com templates configurados.</p>
        </div>
    );

    const { resumo = {}, chapas, ferragens, fita, bom, pecas } = prodData || {};

    // Agrupar peças por material
    const pecasPorMaterial = {};
    (pecas || []).forEach(p => {
        const key = p.matId || 'sem_material';
        if (!pecasPorMaterial[key]) pecasPorMaterial[key] = { matNome: p.matNome, esp: p.espessura, pecas: [] };
        pecasPorMaterial[key].pecas.push(p);
    });

    const SUB_TABS = [
        { id: 'corte', label: 'Lista de Corte', icon: <Scissors size={14} /> },
        { id: 'chapas', label: 'Chapas', icon: <Package size={14} /> },
        { id: 'ferragens', label: 'Ferragens', icon: <ClipboardList size={14} /> },
        { id: 'bom', label: 'Lista de Compras', icon: <ShoppingCart size={14} /> },
    ];

    return (
        <div>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                    { label: 'Peças', value: resumo.total_pecas, icon: <Layers size={16} />, color: '#3b82f6' },
                    { label: 'Chapas', value: resumo.total_chapas, icon: <Package size={16} />, color: '#22c55e' },
                    { label: 'Ferragens', value: resumo.total_ferragens, icon: <ClipboardList size={16} />, color: '#f59e0b' },
                    { label: 'Fita (m)', value: N(resumo.total_fita_m, 1), icon: <Ruler size={16} />, color: '#8b5cf6' },
                    { label: 'Custo Material', value: R$(resumo.custo_total), icon: <ShoppingCart size={16} />, color: '#ef4444' },
                ].map(kpi => (
                    <div key={kpi.label} className={Z.card} style={{ padding: 14, textAlign: 'center' }}>
                        <div style={{ color: kpi.color, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{kpi.icon}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{kpi.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</div>
                    </div>
                ))}
            </div>

            {/* Sub-tabs + Imprimir */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {SUB_TABS.map(t => (
                        <button key={t.id} onClick={() => setSubTab(t.id)} style={{
                            padding: '7px 14px', fontSize: 12, fontWeight: 600,
                            border: 'none', cursor: 'pointer', borderRadius: 8,
                            background: subTab === t.id ? 'var(--primary)' : 'var(--bg-muted)',
                            color: subTab === t.id ? '#fff' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
                        }}>{t.icon} {t.label}</button>
                    ))}
                </div>
                <button onClick={() => window.print()} className={Z.btn2} style={{ fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Printer size={13} /> Imprimir
                </button>
            </div>

            {/* ═══ Sub-Tab: Lista de Corte ═══ */}
            {subTab === 'corte' && (
                <div>
                    {Object.entries(pecasPorMaterial).length === 0 && (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <Scissors size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhuma peça encontrada.</p>
                            <p style={{ fontSize: 12 }}>Verifique se o orçamento possui módulos com templates configurados.</p>
                        </div>
                    )}

                    {Object.entries(pecasPorMaterial).map(([matId, group]) => {
                        const isExpanded = expandedMat[matId] !== false;
                        return (
                            <div key={matId} className={Z.card} style={{ marginBottom: 12, overflow: 'hidden' }}>
                                <div
                                    onClick={() => setExpandedMat(prev => ({ ...prev, [matId]: !isExpanded }))}
                                    style={{
                                        padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        background: 'var(--bg-muted)', borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {group.matNome}
                                        </span>
                                        {group.esp > 0 && (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({group.esp}mm)</span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                                        {group.pecas.length} peça(s)
                                    </span>
                                </div>

                                {isExpanded && (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                            <thead>
                                                <tr style={{ background: 'var(--bg-muted)' }}>
                                                    <th style={prodThStyle}>Peça</th>
                                                    <th style={prodThStyle}>Ambiente</th>
                                                    <th style={prodThStyle}>Módulo</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'right' }}>Largura</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'right' }}>Altura</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'right' }}>Qtd</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'right' }}>Fita (m)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.pecas.map((p, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={prodTdStyle}>
                                                            {p.nome}
                                                            {p.aditivo && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 4 }}>({p.aditivo})</span>}
                                                        </td>
                                                        <td style={{ ...prodTdStyle, color: 'var(--text-muted)' }}>{p.ambiente}</td>
                                                        <td style={{ ...prodTdStyle, color: 'var(--text-muted)' }}>{p.modulo}</td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{p.largura} mm</td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{p.altura} mm</td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'right', fontWeight: 600 }}>{p.qtd}</td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'right' }}>{N(p.fita, 2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══ Sub-Tab: Chapas ═══ */}
            {subTab === 'chapas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {chapas.map(c => (
                        <div key={c.id} className={Z.card} style={{ padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.nome}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {c.esp}mm · {c.larg}×{c.alt}mm · Perda: {c.perda_pct}%
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>{c.qtdChapas}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>chapa(s)</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, flexWrap: 'wrap' }}>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Área peças: </span>
                                    <span style={{ fontWeight: 600 }}>{N(c.areaPecas, 3)} m²</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Área útil/chapa: </span>
                                    <span style={{ fontWeight: 600 }}>{N(c.areaUtil, 3)} m²</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Custo: </span>
                                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{R$(c.qtdChapas * c.preco)}</span>
                                </div>
                            </div>
                            <div style={{ marginTop: 8 }}>
                                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: 3,
                                        width: `${Math.min(100, (c.areaPecas / (c.areaUtil * c.qtdChapas)) * 100)}%`,
                                        background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                                    }} />
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: 'right' }}>
                                    Aproveitamento: {N((c.areaPecas / (c.areaUtil * c.qtdChapas)) * 100, 1)}%
                                </div>
                            </div>
                        </div>
                    ))}
                    {chapas.length === 0 && (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <Package size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhuma chapa calculada.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Sub-Tab: Ferragens ═══ */}
            {subTab === 'ferragens' && (
                <div>
                    {ferragens.length === 0 ? (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <ClipboardList size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhuma ferragem encontrada.</p>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-muted)' }}>
                                        <th style={prodThStyle}>Ferragem</th>
                                        <th style={{ ...prodThStyle, textAlign: 'center' }}>Qtd</th>
                                        <th style={{ ...prodThStyle, textAlign: 'center' }}>Unidade</th>
                                        <th style={{ ...prodThStyle, textAlign: 'right' }}>Preço Unit.</th>
                                        <th style={{ ...prodThStyle, textAlign: 'right' }}>Total</th>
                                        <th style={prodThStyle}>Origem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ferragens.map((f, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ ...prodTdStyle, fontWeight: 600 }}>{f.nome}</td>
                                            <td style={{ ...prodTdStyle, textAlign: 'center', fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>{f.qtd}</td>
                                            <td style={{ ...prodTdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>{f.un}</td>
                                            <td style={{ ...prodTdStyle, textAlign: 'right' }}>{R$(f.preco)}</td>
                                            <td style={{ ...prodTdStyle, textAlign: 'right', fontWeight: 600 }}>{R$(f.qtd * f.preco)}</td>
                                            <td style={{ ...prodTdStyle, fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {[...new Set(f.orig || [])].join(', ')}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: 'var(--bg-muted)', fontWeight: 700 }}>
                                        <td style={prodTdStyle}>TOTAL</td>
                                        <td style={{ ...prodTdStyle, textAlign: 'center' }}>{ferragens.reduce((s, f) => s + f.qtd, 0)}</td>
                                        <td colSpan={2} />
                                        <td style={{ ...prodTdStyle, textAlign: 'right', color: '#ef4444' }}>
                                            {R$(ferragens.reduce((s, f) => s + f.qtd * f.preco, 0))}
                                        </td>
                                        <td />
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Sub-Tab: Lista de Compras (BOM) ═══ */}
            {subTab === 'bom' && (
                <div>
                    {bom.length === 0 ? (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <ShoppingCart size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhum item na lista de compras.</p>
                        </div>
                    ) : (
                        <>
                            {/* Itens que precisam comprar */}
                            {bom.filter(b => b.comprar > 0).length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <AlertTriangle size={14} /> Itens a Comprar
                                    </h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ background: '#fef2f2' }}>
                                                    <th style={prodThStyle}>Item</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'center' }}>Tipo</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'center' }}>Necessário</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'center' }}>Em Estoque</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'center', color: '#ef4444' }}>Comprar</th>
                                                    <th style={{ ...prodThStyle, textAlign: 'right' }}>Custo Est.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bom.filter(b => b.comprar > 0).map((b, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ ...prodTdStyle, fontWeight: 600 }}>{b.nome}</td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'center' }}>
                                                            <span style={{
                                                                fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 700,
                                                                background: b.tipo === 'chapa' ? '#3b82f620' : b.tipo === 'ferragem' ? '#f59e0b20' : '#8b5cf620',
                                                                color: b.tipo === 'chapa' ? '#3b82f6' : b.tipo === 'ferragem' ? '#f59e0b' : '#8b5cf6',
                                                            }}>{b.tipo}</span>
                                                        </td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'center' }}>{b.necessario} {b.un}</td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'center', color: b.em_estoque > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                                                            {b.em_estoque} {b.un}
                                                        </td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'center', fontWeight: 800, color: '#ef4444', fontSize: 15 }}>
                                                            {b.comprar} {b.un}
                                                        </td>
                                                        <td style={{ ...prodTdStyle, textAlign: 'right', fontWeight: 600 }}>
                                                            {R$(b.comprar * b.custo_unitario)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* BOM Completo */}
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ClipboardList size={14} /> BOM Completo
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-muted)' }}>
                                            <th style={prodThStyle}>Item</th>
                                            <th style={{ ...prodThStyle, textAlign: 'center' }}>Tipo</th>
                                            <th style={{ ...prodThStyle, textAlign: 'center' }}>Necessário</th>
                                            <th style={{ ...prodThStyle, textAlign: 'center' }}>Estoque</th>
                                            <th style={{ ...prodThStyle, textAlign: 'right' }}>Preço Unit.</th>
                                            <th style={{ ...prodThStyle, textAlign: 'right' }}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bom.map((b, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: b.comprar > 0 ? '#fef2f208' : 'transparent' }}>
                                                <td style={{ ...prodTdStyle, fontWeight: 600 }}>{b.nome}</td>
                                                <td style={{ ...prodTdStyle, textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 700,
                                                        background: b.tipo === 'chapa' ? '#3b82f620' : b.tipo === 'ferragem' ? '#f59e0b20' : '#8b5cf620',
                                                        color: b.tipo === 'chapa' ? '#3b82f6' : b.tipo === 'ferragem' ? '#f59e0b' : '#8b5cf6',
                                                    }}>{b.tipo}</span>
                                                </td>
                                                <td style={{ ...prodTdStyle, textAlign: 'center', fontWeight: 600 }}>{b.necessario} {b.un}</td>
                                                <td style={{
                                                    ...prodTdStyle, textAlign: 'center', fontWeight: 600,
                                                    color: b.em_estoque >= b.necessario ? '#22c55e' : b.em_estoque > 0 ? '#f59e0b' : '#ef4444',
                                                }}>
                                                    {b.em_estoque} {b.un}
                                                </td>
                                                <td style={{ ...prodTdStyle, textAlign: 'right' }}>{R$(b.custo_unitario)}</td>
                                                <td style={{ ...prodTdStyle, textAlign: 'right', fontWeight: 700 }}>{R$(b.custo_total)}</td>
                                            </tr>
                                        ))}
                                        <tr style={{ background: 'var(--bg-muted)', fontWeight: 700 }}>
                                            <td colSpan={5} style={prodTdStyle}>CUSTO TOTAL MATERIAIS</td>
                                            <td style={{ ...prodTdStyle, textAlign: 'right', color: '#ef4444', fontSize: 15 }}>
                                                {R$(resumo.custo_total)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// TAB PORTAL — Mensagens do portal público do cliente
// ═══════════════════════════════════════════════════════
function TabPortalMsgs({ data, notify }) {
    const [msgs, setMsgs] = useState([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const chatRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/projetos/${data.id}/mensagens-portal`);
            setMsgs(Array.isArray(res) ? res : []);
        } catch { setMsgs([]); }
        finally { setLoading(false); }
    }, [data.id]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [msgs]);

    // Auto-refresh a cada 10s
    useEffect(() => {
        const i = setInterval(load, 10000);
        return () => clearInterval(i);
    }, [load]);

    const enviar = async () => {
        if (!text.trim()) return;
        setSending(true);
        try {
            await api.post(`/projetos/${data.id}/mensagens-portal`, { conteudo: text.trim() });
            setText('');
            load();
            notify('Mensagem enviada!');
        } catch { notify('Erro ao enviar mensagem'); }
        finally { setSending(false); }
    };

    const portalUrl = data.token ? `${window.location.origin}/portal/${data.token}` : null;
    const naoLidas = msgs.filter(m => m.autor_tipo === 'cliente' && !m.lida).length;

    return (
        <div>
            {/* Portal Link */}
            <div className="glass-card p-4 mb-5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Link do Portal do Cliente</div>
                    {portalUrl ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'monospace', background: 'var(--bg-muted)', padding: '4px 8px', borderRadius: 6, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{portalUrl}</span>
                            <button onClick={() => { navigator.clipboard.writeText(portalUrl); notify('Link copiado!'); }}
                                className={Z.btn2} style={{ fontSize: 11, padding: '4px 10px' }}>
                                <CopyIcon size={11} /> Copiar
                            </button>
                        </div>
                    ) : (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Este projeto não possui token de portal. Gere um link do portal nas configurações.</p>
                    )}
                </div>
                {naoLidas > 0 && (
                    <div style={{ background: '#ef444415', border: '1px solid #ef444430', borderRadius: 10, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{naoLidas} mensage{naoLidas === 1 ? 'm' : 'ns'} não lida{naoLidas === 1 ? '' : 's'}</span>
                    </div>
                )}
            </div>

            {/* Chat */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Ic.Message />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Mensagens do Portal</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({msgs.length})</span>
                </div>

                <div ref={chatRef} style={{ maxHeight: 450, minHeight: 200, overflowY: 'auto', padding: 20, background: 'var(--bg-muted)' }}>
                    {loading ? (
                        <Spinner text="Carregando mensagens..." />
                    ) : msgs.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                            <Ic.Message />
                            <p style={{ marginTop: 8 }}>Nenhuma mensagem no portal ainda</p>
                            <p style={{ fontSize: 11 }}>O cliente pode enviar mensagens pelo link do portal</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {msgs.map(m => {
                                const isCliente = m.autor_tipo === 'cliente';
                                return (
                                    <div key={m.id} style={{ display: 'flex', justifyContent: isCliente ? 'flex-start' : 'flex-end' }}>
                                        <div style={{
                                            maxWidth: '70%',
                                            background: isCliente ? 'var(--bg-card)' : 'var(--primary)',
                                            color: isCliente ? 'var(--text-primary)' : '#fff',
                                            border: isCliente ? '1px solid var(--border)' : 'none',
                                            borderRadius: isCliente ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                                            padding: '10px 14px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, opacity: isCliente ? 1 : 0.85 }}>
                                                    {m.autor_nome || (isCliente ? 'Cliente' : 'Equipe')}
                                                </span>
                                                {isCliente && !m.lida && (
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                                                )}
                                            </div>
                                            <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.conteudo}</p>
                                            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                                                {new Date(m.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Input */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                    <input
                        type="text"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                        placeholder="Responder ao cliente..."
                        disabled={sending || !data.token}
                        className={Z.inp}
                        style={{ flex: 1 }}
                    />
                    <button onClick={enviar} disabled={sending || !text.trim() || !data.token}
                        className={Z.btn} style={{ fontSize: 12, padding: '8px 16px', opacity: (sending || !text.trim()) ? 0.5 : 1 }}>
                        <Ic.Send /> Enviar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// DETALHE DO PROJETO (com tabs)
// ═══════════════════════════════════════════════════════
function ProjetoDetalhe({ proj, onBack, orcs, notify, reload, user }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editStatus, setEditStatus] = useState(false);
    const [tab, setTab] = useState('cronograma');
    const [users, setUsers] = useState([]);

    const load = useCallback(() => {
        setLoading(true);
        api.get(`/projetos/${proj.id}`).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    }, [proj.id]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { api.get('/projetos/users-list').then(setUsers).catch(() => {}); }, []);

    const updateStatus = (status) => {
        api.put(`/projetos/${proj.id}`, { ...data, status }).then(() => { load(); reload(); setEditStatus(false); }).catch(() => notify('Erro ao atualizar status'));
    };

    if (loading) return <div className={Z.pg}><Spinner text="Carregando projeto..." /></div>;
    if (!data) return <div className={Z.pg}><p style={{ color: '#ef4444' }}>Projeto não encontrado.</p></div>;

    const TABS = [
        { id: 'cronograma', label: 'Cronograma', icon: <CalendarIcon size={14} /> },
        { id: 'producao', label: 'Produção', icon: <Scissors size={14} /> },
        { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={14} /> },
        { id: 'estoque', label: 'Recursos', icon: <Package size={14} /> },
        { id: 'arquivos', label: 'Arquivos', icon: <Ic.FolderOpen /> },
        { id: 'portal', label: 'Portal', icon: <Ic.Message /> },
    ];

    return (
        <div className={Z.pg}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
                <button onClick={onBack} className={Z.btn2} style={{ padding: '7px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>← Voltar</button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h1 className={Z.h1}>{data.nome}</h1>
                        <Badge status={data.status} />
                    </div>
                    <p className={Z.sub} style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {data.cliente_nome && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserIcon size={12} /> {data.cliente_nome} ·</span>}
                        {data.valor_venda && <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{R$(data.valor_venda)} ·</span>}
                        {data.data_inicio && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarIcon size={12} /> {dtFmt(data.data_inicio)} → {dtFmt(data.data_vencimento)}</span>}
                    </p>
                </div>
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setEditStatus(!editStatus)} className={Z.btn2} style={{ fontSize: 12, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Status <Ic.Chev /></button>
                    {editStatus && (
                        <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,.15)', minWidth: 160, padding: 6 }}>
                            {Object.entries(STATUS_PROJ).map(([k, v]) => (
                                <button key={k} onClick={() => updateStatus(k)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none', background: data.status === k ? v.bg : 'none', color: v.color, fontWeight: data.status === k ? 700 : 400, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>{v.label}</button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        padding: '10px 18px', fontSize: 13, fontWeight: 600,
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        background: tab === t.id ? 'var(--primary)' : 'transparent',
                        color: tab === t.id ? '#fff' : 'var(--text-muted)',
                        borderRadius: '8px 8px 0 0', transition: 'all 0.15s',
                    }}>{t.icon} {t.label}</button>
                ))}
            </div>

            {/* Tab Content */}
            {tab === 'cronograma' && <TabCronograma data={data} load={load} notify={notify} users={users} />}
            {tab === 'producao' && <TabProducao data={data} notify={notify} />}
            {tab === 'financeiro' && <TabFinanceiro data={data} notify={notify} />}
            {tab === 'estoque' && <TabEstoque data={data} notify={notify} user={user} />}
            {tab === 'arquivos' && <TabArquivos data={data} notify={notify} />}
            {tab === 'portal' && <TabPortalMsgs data={data} notify={notify} />}
        </div>
    );
}

// ─── Página Principal ─────────────────────────────────
export default function Projetos({ orcs, notify, user }) {
    const [projetos, setProjetos] = useState([]);
    const [selected, setSelected] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/projetos').then(d => { setProjetos(d); setLoading(false); }).catch(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async (payload) => {
        const res = await api.post('/projetos', payload);
        if (res?.error) throw res;
        load();
        notify('Projeto criado com sucesso!');
    };
    const handleDelete = (proj) => {
        if (!window.confirm(`Excluir projeto "${proj.nome}"? Esta ação não pode ser desfeita.`)) return;
        api.del(`/projetos/${proj.id}`).then(() => { load(); notify('Projeto excluído'); }).catch(() => notify('Erro ao excluir'));
    };

    if (selected) return <ProjetoDetalhe proj={selected} onBack={() => setSelected(null)} orcs={orcs} notify={notify} reload={load} user={user} />;

    const filtered = projetos.filter(p => {
        const q = search.toLowerCase();
        const match = !q || p.nome?.toLowerCase().includes(q) || p.cliente_nome?.toLowerCase().includes(q);
        return match && (!filterStatus || p.status === filterStatus);
    });

    const counts = {};
    Object.keys(STATUS_PROJ).forEach(k => { counts[k] = projetos.filter(p => p.status === k).length; });

    return (
        <div className={Z.pg}>
            {showNew && <NovoProjetoModal orcs={orcs} onClose={() => setShowNew(false)} onSave={handleCreate} />}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className={Z.h1}>Projetos</h1>
                    <p className={Z.sub}>Acompanhe cronograma, financeiro e estoque de cada projeto</p>
                </div>
                <button onClick={() => setShowNew(true)} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic.Plus /> Novo Projeto</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
                {Object.entries(STATUS_PROJ).map(([k, v]) => (
                    <button key={k} onClick={() => setFilterStatus(filterStatus === k ? '' : k)} style={{ background: filterStatus === k ? v.bg : 'var(--bg-card)', border: `1.5px solid ${filterStatus === k ? v.color : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: v.color }}>{counts[k] || 0}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{v.label}</div>
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><Ic.Search /></span>
                    <input className={Z.inp} style={{ paddingLeft: 34 }} placeholder="Buscar projeto ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {filterStatus && <button onClick={() => setFilterStatus('')} className={Z.btn2} style={{ fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 5 }}><Ic.X /> Limpar filtro</button>}
            </div>

            {loading ? (
                <Spinner text="Carregando projetos..." />
            ) : filtered.length === 0 ? (
                <div className={Z.card} style={{ textAlign: 'center', padding: 48 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>{projetos.length === 0 ? 'Nenhum projeto cadastrado ainda.' : 'Nenhum resultado.'}</p>
                    {projetos.length === 0 && <button onClick={() => setShowNew(true)} className={Z.btn} style={{ marginTop: 16 }}>+ Criar primeiro projeto</button>}
                </div>
            ) : (
                <div className="glass-card" style={{ overflow: 'hidden', overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
                        <thead><tr>{['Projeto', 'Cliente', 'Status', 'Progresso', 'Valor', 'Entrega', ''].map(h => <th key={h} className={Z.th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {filtered.map((p, i) => {
                                const pct = p.total_etapas > 0 ? Math.round(p.etapas_concluidas / p.total_etapas * 100) : 0;
                                return (
                                    <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                                        onClick={() => setSelected(p)}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</div>
                                            {p.ocorrencias_abertas > 0 && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> {p.ocorrencias_abertas} aberta{p.ocorrencias_abertas > 1 ? 's' : ''}</div>}
                                            {p.contas_vencidas > 0 && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><DollarSign size={11} /> {p.contas_vencidas} vencida{p.contas_vencidas > 1 ? 's' : ''}</div>}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 14 }}>{p.cliente_nome || '—'}</td>
                                        <td style={{ padding: '12px 16px' }}><Badge status={p.status} /></td>
                                        <td style={{ padding: '12px 16px', minWidth: 120 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, background: 'var(--bg-muted)', borderRadius: 99, height: 6 }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: 99 }} />
                                                </div>
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 30 }}>{pct}%</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--primary)', fontSize: 13 }}>{p.valor_venda ? R$(p.valor_venda) : '—'}</td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>{dtFmt(p.data_vencimento)}</td>
                                        <td style={{ padding: '12px 16px', display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                            <button onClick={() => { const n = prompt('Nome do novo projeto:', `${p.nome} (cópia)`); if (n) api.post(`/projetos/${p.id}/duplicar`, { nome: n }).then(() => load()).catch(() => notify('Erro ao duplicar')); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 6, borderRadius: 6, opacity: 0.6 }} title="Duplicar"><Ic.Copy /></button>
                                            <button onClick={() => handleDelete(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 6, borderRadius: 6, opacity: 0.6 }} title="Excluir"><Ic.Trash /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
