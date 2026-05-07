import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import {
    Clock, ChevronLeft, ChevronRight, Users, Settings, CalendarDays,
    Plus, Trash2, Edit2, X, Save, Search, Download, Check, FileText, Upload
} from 'lucide-react';
import { Z, Modal, PageHeader, Spinner, EmptyState, ConfirmModal } from '../ui';
import api from '../api';
import { useAuth } from '../auth';

// ─── Constantes ──────────────────────────────────────────
const DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const TIPOS = [
    { id: 'normal', lb: 'Normal', c: 'var(--success)', short: '—' },
    { id: 'falta', lb: 'Falta', c: 'var(--danger)', short: 'F' },
    { id: 'atestado', lb: 'Atestado', c: 'var(--info)', short: 'A' },
    { id: 'ferias', lb: 'Férias', c: 'var(--info)', short: 'Fe' },
    { id: 'feriado', lb: 'Feriado', c: 'var(--muted)', short: 'Fr' },
    { id: 'folga', lb: 'Folga', c: 'var(--muted)', short: 'Fg' },
    { id: 'compensacao', lb: 'Compensação', c: 'var(--info)', short: 'C' },
];
const TIPO_MAP = Object.fromEntries(TIPOS.map(t => [t.id, t]));

const COR = { normal: 'var(--success)', atraso: 'var(--warning)', falta: 'var(--danger)', atestado: 'var(--info)', ferias: 'var(--info)', feriado: 'var(--muted)', folga: 'var(--muted)', compensacao: 'var(--info)' };

const FERIADOS_NACIONAIS = [
    { data: '-01-01', descricao: 'Confraternização Universal' },
    { data: '-04-21', descricao: 'Tiradentes' },
    { data: '-05-01', descricao: 'Dia do Trabalho' },
    { data: '-09-07', descricao: 'Independência do Brasil' },
    { data: '-10-12', descricao: 'Nossa Senhora Aparecida' },
    { data: '-11-02', descricao: 'Finados' },
    { data: '-11-15', descricao: 'Proclamação da República' },
    { data: '-12-25', descricao: 'Natal' },
];

const DEFAULT_JORNADA = {
    1: { ativo: true, entrada: '08:00', saida_almoco: '12:00', volta_almoco: '13:00', saida: '17:48' },
    2: { ativo: true, entrada: '08:00', saida_almoco: '12:00', volta_almoco: '13:00', saida: '17:48' },
    3: { ativo: true, entrada: '08:00', saida_almoco: '12:00', volta_almoco: '13:00', saida: '17:48' },
    4: { ativo: true, entrada: '08:00', saida_almoco: '12:00', volta_almoco: '13:00', saida: '17:48' },
    5: { ativo: true, entrada: '08:00', saida_almoco: '12:00', volta_almoco: '13:00', saida: '17:48' },
    6: { ativo: false }, 0: { ativo: false },
};

// ─── Helpers ─────────────────────────────────────────────
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const dow = (y, m, d) => new Date(y, m, d).getDay();
const fmtD = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fmtBR = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}`; };
const pt = t => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const fmtH = mins => { if (mins == null) return '—'; const s = mins < 0 ? '-' : ''; const a = Math.abs(Math.round(mins)); return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`; };

function calcWork(r) {
    if (!r?.entrada || !r?.saida) return 0;
    let t = pt(r.saida) - pt(r.entrada);
    if (r.saida_almoco && r.volta_almoco) t -= (pt(r.volta_almoco) - pt(r.saida_almoco));
    return Math.max(0, t);
}

function calcExp(jornada, dayOfWeek) {
    if (!jornada) return 0;
    // jornada pode ter keys numéricas (0-6) ou strings (seg, ter, etc.)
    const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const j = jornada[dayOfWeek] || jornada[dias[dayOfWeek]];
    if (!j) return 0;
    if (j.ativo !== undefined && !j.ativo) return 0;
    let t = pt(j.saida) - pt(j.entrada);
    if (j.saida_almoco && j.volta_almoco) t -= (pt(j.volta_almoco) - pt(j.saida_almoco));
    return Math.max(0, t);
}

function getJornadaDia(jornada, dayOfWeek) {
    if (!jornada) return null;
    const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    return jornada[dayOfWeek] || jornada[dias[dayOfWeek]] || null;
}

function cellStatus(reg, dayOfWeek, jornada, tol, feriados, dateStr, dataAdmissao) {
    // Antes da admissão = não existia, ignorar
    if (dataAdmissao && dateStr < dataAdmissao) return null;
    if (feriados.some(f => f.data === dateStr)) return 'feriado';
    if (reg) {
        if (reg.tipo && reg.tipo !== 'normal') return reg.tipo;
        if (!reg.entrada) return 'falta';
        const j = getJornadaDia(jornada, dayOfWeek);
        if (j && j.entrada) {
            const diff = pt(reg.entrada) - pt(j.entrada);
            if (diff > (tol || 0)) return 'atraso';
        }
        return 'normal';
    }
    const j = getJornadaDia(jornada, dayOfWeek);
    if (!j || (j.ativo !== undefined && !j.ativo)) return 'folga';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(dateStr + 'T12:00:00') < today) return 'falta';
    return null;
}

// ─── StatusDot ──────────────────────────────────────────
function Dot({ status }) {
    if (!status) return <span style={{ display: 'inline-block', width: 8, height: 8 }} />;
    return <span title={status} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COR[status] || 'var(--muted)' }} />;
}

// ═══════════════════════════════════════════════════════════
// PLANILHA MENSAL (estilo Excel) — edição inline
// ═══════════════════════════════════════════════════════════
function PlanilhaModal({ funcionario, mesKey, ano, mes, jornada, feriados, registros, onClose, onSaved, notify }) {
    const daysCount = daysIn(ano, mes);
    const todayStr = new Date().toISOString().split('T')[0];

    // Build initial rows from existing registros
    const buildRows = useCallback(() => {
        const regMap = {};
        registros.forEach(r => { if (r.funcionario_id === funcionario.id) regMap[r.data] = r; });

        const rows = [];
        for (let d = 1; d <= daysCount; d++) {
            const dateStr = fmtD(ano, mes, d);
            const dayOfWeek = dow(ano, mes, d);
            const j = getJornadaDia(jornada, dayOfWeek);
            const isFer = feriados.some(f => f.data === dateStr);
            const reg = regMap[dateStr];
            const isFuture = dateStr > todayStr;
            const isOff = (!j || (j.ativo !== undefined && !j.ativo)) && !isFer;

            rows.push({
                day: d, dateStr, dayOfWeek, isFuture, isOff, isFer,
                tipo: reg?.tipo || (isFer ? 'feriado' : isOff ? 'folga' : 'normal'),
                entrada: reg?.entrada || '',
                saida_almoco: reg?.saida_almoco || '',
                volta_almoco: reg?.volta_almoco || '',
                saida: reg?.saida || '',
                obs: reg?.obs || '',
                hasRecord: !!reg,
                dirty: false,
            });
        }
        return rows;
    }, [funcionario.id, daysCount, ano, mes, jornada, feriados, registros, todayStr]);

    const [rows, setRows] = useState(buildRows);
    const [saving, setSaving] = useState(false);
    const [savedCount, setSavedCount] = useState(0);

    const updateRow = (idx, field, value) => {
        setRows(prev => {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], [field]: value, dirty: true };
            return copy;
        });
    };

    // Preencher todos os dias vazios com jornada padrão
    const preencherPadrao = () => {
        setRows(prev => prev.map(row => {
            if (row.isFuture || row.isOff || row.isFer) return row;
            if (row.hasRecord && !row.dirty) return row; // já tem registro, não sobrescrever
            if (row.entrada) return row; // já preenchido manualmente
            const j = getJornadaDia(jornada, row.dayOfWeek);
            if (!j || (j.ativo !== undefined && !j.ativo)) return row;
            return {
                ...row,
                tipo: 'normal',
                entrada: j.entrada || '',
                saida_almoco: j.saida_almoco || '',
                volta_almoco: j.volta_almoco || '',
                saida: j.saida || '',
                dirty: true,
            };
        }));
    };

    // Salvar todos os dirty
    const salvarTudo = async () => {
        const dirtyRows = rows.filter(r => r.dirty && !r.isFuture);
        if (!dirtyRows.length) { notify?.('Nenhuma alteração para salvar'); return; }
        setSaving(true);
        let count = 0;
        try {
            for (const r of dirtyRows) {
                const isTimeType = r.tipo === 'normal' || r.tipo === 'compensacao';
                await api.post('/ponto/registros', {
                    funcionario_id: funcionario.id,
                    data: r.dateStr,
                    entrada: isTimeType ? r.entrada || null : null,
                    saida_almoco: isTimeType ? r.saida_almoco || null : null,
                    volta_almoco: isTimeType ? r.volta_almoco || null : null,
                    saida: isTimeType ? r.saida || null : null,
                    tipo: r.tipo,
                    obs: r.obs || null,
                });
                count++;
            }
            setSavedCount(count);
            notify?.(`${count} registro(s) salvo(s)`, 'success');
            // Mark all as not dirty
            setRows(prev => prev.map(r => ({ ...r, dirty: false, hasRecord: r.dirty ? true : r.hasRecord })));
            onSaved?.();
        } catch (e) {
            notify?.(`Erro ao salvar (${count} de ${dirtyRows.length} salvos)`, 'error');
        } finally { setSaving(false); }
    };

    const dirtyCount = rows.filter(r => r.dirty).length;
    const timeInputStyle = { fontSize: 11, padding: '2px 3px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '100%', textAlign: 'center', outline: 'none' };

    return (
        <Modal title={`${funcionario.nome} — ${MESES[mes]} ${ano}`} close={onClose} w={920}>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className={Z.btnSm} onClick={preencherPadrao} style={{ fontSize: 10, background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' }}>
                    Preencher Horário Padrão
                </button>
                <div style={{ flex: 1 }} />
                {dirtyCount > 0 && <span style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 600 }}>{dirtyCount} alteração(ões)</span>}
                <button className={Z.btnSm} onClick={salvarTudo} disabled={saving || !dirtyCount} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Save size={11} /> {saving ? 'Salvando...' : 'Salvar Tudo'}
                </button>
            </div>

            {/* Spreadsheet */}
            <div style={{ maxHeight: 'calc(80vh - 120px)', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                            <th style={thS}>Dia</th>
                            <th style={thS}>Tipo</th>
                            <th style={thS}>Entrada</th>
                            <th style={thS}>S. Almoço</th>
                            <th style={thS}>V. Almoço</th>
                            <th style={thS}>Saída</th>
                            <th style={thS}>Trab.</th>
                            <th style={thS}>Prev.</th>
                            <th style={thS}>Saldo</th>
                            <th style={{ ...thS, minWidth: 60 }}>Obs</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, idx) => {
                            const isTime = r.tipo === 'normal' || r.tipo === 'compensacao';
                            const worked = isTime ? calcWork(r) : 0;
                            const expected = calcExp(jornada, r.dayOfWeek);
                            const noExpect = ['feriado', 'folga', 'ferias'].includes(r.tipo) || r.isFer;
                            const exp = noExpect ? 0 : expected;
                            const saldo = (r.tipo === 'atestado' ? exp : worked) - exp;
                            const isWe = r.dayOfWeek === 0 || r.dayOfWeek === 6;
                            const bgRow = r.isFuture ? 'var(--bg-muted)' : r.dirty ? 'rgba(124, 58, 237, 0.04)' : isWe ? 'var(--bg-muted)' : 'transparent';

                            return (
                                <tr key={r.day} style={{ background: bgRow, opacity: r.isFuture ? 0.4 : 1 }}>
                                    <td style={{ ...tdS, fontWeight: 600, whiteSpace: 'nowrap', width: 60 }}>
                                        <span style={{ color: r.dateStr === todayStr ? 'var(--primary)' : isWe ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                            {String(r.day).padStart(2, '0')} {DS[r.dayOfWeek]}
                                        </span>
                                    </td>
                                    <td style={{ ...tdS, width: 80 }}>
                                        <select value={r.tipo} onChange={e => updateRow(idx, 'tipo', e.target.value)}
                                            disabled={r.isFuture}
                                            style={{ fontSize: 10, padding: '2px 2px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-primary)', color: TIPO_MAP[r.tipo]?.c || 'var(--text-primary)', fontWeight: 600, width: '100%', cursor: 'pointer' }}>
                                            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.lb}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ ...tdS, width: 70 }}>
                                        {isTime && !r.isFuture ? <input type="time" value={r.entrada} onChange={e => updateRow(idx, 'entrada', e.target.value)} style={timeInputStyle} /> : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{r.isFuture ? '' : '—'}</span>}
                                    </td>
                                    <td style={{ ...tdS, width: 70 }}>
                                        {isTime && !r.isFuture ? <input type="time" value={r.saida_almoco} onChange={e => updateRow(idx, 'saida_almoco', e.target.value)} style={timeInputStyle} /> : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{r.isFuture ? '' : '—'}</span>}
                                    </td>
                                    <td style={{ ...tdS, width: 70 }}>
                                        {isTime && !r.isFuture ? <input type="time" value={r.volta_almoco} onChange={e => updateRow(idx, 'volta_almoco', e.target.value)} style={timeInputStyle} /> : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{r.isFuture ? '' : '—'}</span>}
                                    </td>
                                    <td style={{ ...tdS, width: 70 }}>
                                        {isTime && !r.isFuture ? <input type="time" value={r.saida} onChange={e => updateRow(idx, 'saida', e.target.value)} style={timeInputStyle} /> : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{r.isFuture ? '' : '—'}</span>}
                                    </td>
                                    <td style={{ ...tdS, textAlign: 'center', fontWeight: 600, fontSize: 10, width: 50 }}>
                                        {r.isFuture ? '' : fmtH(r.tipo === 'atestado' ? exp : worked)}
                                    </td>
                                    <td style={{ ...tdS, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', width: 50 }}>
                                        {r.isFuture ? '' : fmtH(exp)}
                                    </td>
                                    <td style={{ ...tdS, textAlign: 'center', fontWeight: 600, fontSize: 10, color: saldo >= 0 ? 'var(--success)' : 'var(--danger)', width: 50 }}>
                                        {r.isFuture ? '' : fmtH(saldo)}
                                    </td>
                                    <td style={{ ...tdS, width: 60 }}>
                                        {!r.isFuture && <input value={r.obs} onChange={e => updateRow(idx, 'obs', e.target.value)} placeholder="..." style={{ ...timeInputStyle, textAlign: 'left', fontSize: 10 }} />}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Totals */}
            {(() => {
                let tw = 0, te = 0, faltas = 0;
                rows.forEach(r => {
                    if (r.isFuture) return;
                    const isTime = r.tipo === 'normal' || r.tipo === 'compensacao';
                    const noExp = ['feriado', 'folga', 'ferias'].includes(r.tipo) || r.isFer;
                    const exp = noExp ? 0 : calcExp(jornada, r.dayOfWeek);
                    if (r.tipo === 'atestado') { tw += exp; te += exp; }
                    else if (isTime) { tw += calcWork(r); te += exp; }
                    else if (r.tipo === 'falta') { faltas++; te += exp; }
                    else { te += exp; }
                });
                const saldo = tw - te;
                return (
                    <div style={{ display: 'flex', gap: 16, padding: '10px 0 0', fontSize: 11, fontWeight: 600, flexWrap: 'wrap' }}>
                        <span>Trabalhadas: <span style={{ color: 'var(--text-primary)' }}>{fmtH(tw)}</span></span>
                        <span>Previstas: <span style={{ color: 'var(--text-muted)' }}>{fmtH(te)}</span></span>
                        <span>Saldo: <span style={{ color: saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtH(saldo)}</span></span>
                        {faltas > 0 && <span>Faltas: <span style={{ color: 'var(--danger)' }}>{faltas}</span></span>}
                    </div>
                );
            })()}
        </Modal>
    );
}

const thS = { padding: '6px 4px', textAlign: 'center', fontWeight: 700, fontSize: 10, borderBottom: '2px solid var(--border)', color: 'var(--text-primary)', whiteSpace: 'nowrap' };
const tdS = { padding: '3px 3px', borderBottom: '1px solid var(--border)', fontSize: 11 };

// ═══════════════════════════════════════════════════════════
// MODAL: Funcionários
// ═══════════════════════════════════════════════════════════
function FuncionariosModal({ onClose, notify }) {
    const [funcionarios, setFuncionarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [filtroAtivo, setFiltroAtivo] = useState(true);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 250);
    const [form, setForm] = useState({ nome: '', cpf: '', cargo: '', data_admissao: '', salario_base: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.get('/ponto/funcionarios'); setFuncionarios(Array.isArray(r) ? r : []); }
        catch { notify?.('Erro ao carregar funcionários', 'error'); }
        finally { setLoading(false); }
    }, [notify]);
    useEffect(() => { load(); }, [load]);

    const filtered = funcionarios.filter(f => {
        if (filtroAtivo && !f.ativo) return false;
        if (!filtroAtivo && f.ativo) return false;
        if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); return f.nome.toLowerCase().includes(q) || (f.cpf || '').includes(q) || (f.cargo || '').toLowerCase().includes(q); }
        return true;
    });

    const handleSave = async () => {
        try {
            const payload = { ...form, salario_base: parseFloat(form.salario_base) || 0 };
            if (editId) { await api.put('/ponto/funcionarios/' + editId, payload); notify?.('Atualizado', 'success'); }
            else { await api.post('/ponto/funcionarios', payload); notify?.('Adicionado', 'success'); }
            setShowForm(false); setEditId(null); setForm({ nome: '', cpf: '', cargo: '', data_admissao: '', salario_base: '' }); load();
        } catch { notify?.('Erro ao salvar', 'error'); }
    };

    const toggleAtivo = async (f) => {
        try { await api.put('/ponto/funcionarios/' + f.id, { ...f, ativo: f.ativo ? 0 : 1 }); notify?.(f.ativo ? 'Desativado' : 'Reativado', 'success'); load(); }
        catch { notify?.('Erro', 'error'); }
    };

    return (
        <Modal title="Funcionários" close={onClose} w={600}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className={Z.inp} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: 12, paddingLeft: 28 }} />
                </div>
                <button className={filtroAtivo ? Z.btnSm : Z.btn2Sm} onClick={() => setFiltroAtivo(true)} style={{ fontSize: 10 }}>Ativos</button>
                <button className={!filtroAtivo ? Z.btnSm : Z.btn2Sm} onClick={() => setFiltroAtivo(false)} style={{ fontSize: 10 }}>Inativos</button>
                <button className={Z.btnSm} onClick={() => { setShowForm(true); setEditId(null); setForm({ nome: '', cpf: '', cargo: '', data_admissao: '', salario_base: '' }); }} style={{ fontSize: 10 }}>
                    <Plus size={12} /> Novo
                </button>
            </div>

            {showForm && (
                <div style={{ padding: 12, background: 'var(--bg-muted)', borderRadius: 8, marginBottom: 12, display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{editId ? 'Editar' : 'Novo'} Funcionário</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div><label className={Z.lbl}>Nome *</label><input className={Z.inp} style={{ fontSize: 12 }} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
                        <div><label className={Z.lbl}>CPF</label><input className={Z.inp} style={{ fontSize: 12 }} value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
                        <div><label className={Z.lbl}>Cargo</label><input className={Z.inp} style={{ fontSize: 12 }} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Admissão</label><input type="date" className={Z.inp} style={{ fontSize: 12 }} value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Salário</label><input type="number" step="0.01" className={Z.inp} style={{ fontSize: 12 }} value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                        <button className={Z.btn2Sm} onClick={() => { setShowForm(false); setEditId(null); }} style={{ fontSize: 10 }}>Cancelar</button>
                        <button className={Z.btnSm} onClick={handleSave} disabled={!form.nome.trim()} style={{ fontSize: 10 }}>Salvar</button>
                    </div>
                </div>
            )}

            {loading ? <Spinner text="Carregando..." /> : (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {filtered.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>Nenhum funcionário</div> :
                        filtered.map(f => (
                            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{f.cargo || '—'}</div>
                                </div>
                                <button className={Z.btn2Sm} onClick={() => { setEditId(f.id); setForm({ nome: f.nome, cpf: f.cpf || '', cargo: f.cargo || '', data_admissao: f.data_admissao || '', salario_base: f.salario_base || '' }); setShowForm(true); }} style={{ fontSize: 10, padding: '3px 8px' }}><Edit2 size={11} /></button>
                                <button className={f.ativo ? Z.btnDSm : Z.btnSm} onClick={() => toggleAtivo(f)} style={{ fontSize: 10, padding: '3px 8px' }}>{f.ativo ? 'Desativar' : 'Reativar'}</button>
                            </div>
                        ))}
                </div>
            )}
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════════
// MODAL: Jornada
// ═══════════════════════════════════════════════════════════
function ConfigModal({ onClose, notify }) {
    const [jornada, setJornada] = useState(DEFAULT_JORNADA);
    const [tolerancia, setTolerancia] = useState(5);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await api.get('/ponto/config');
                if (r?.jornada_json) try { setJornada(JSON.parse(r.jornada_json)); } catch { }
                if (r?.tolerancia_min != null) setTolerancia(r.tolerancia_min);
            } catch { }
            finally { setLoading(false); }
        })();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try { await api.put('/ponto/config', { jornada_json: JSON.stringify(jornada), tolerancia_min: tolerancia }); notify?.('Salvo', 'success'); onClose(); }
        catch { notify?.('Erro', 'error'); }
        finally { setSaving(false); }
    };

    const updateDay = (d, f, v) => setJornada(p => ({ ...p, [d]: { ...p[d], [f]: v } }));
    const toggleDay = (d) => setJornada(p => ({ ...p, [d]: { ...p[d], ativo: !p[d]?.ativo } }));
    const DAYS = [1, 2, 3, 4, 5, 6, 0];
    const DL = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 0: 'Dom' };

    if (loading) return <Modal title="Jornada" close={onClose} w={520}><Spinner text="Carregando..." /></Modal>;

    return (
        <Modal title="Configuração de Jornada" close={onClose} w={520}>
            <div style={{ display: 'grid', gap: 6 }}>
                {DAYS.map(day => {
                    const j = jornada[day] || { ativo: false };
                    return (
                        <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: j.ativo ? 'transparent' : 'var(--bg-muted)', borderRadius: 6, fontSize: 12 }}>
                            <label style={{ width: 55, fontWeight: 600, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input type="checkbox" checked={!!j.ativo} onChange={() => toggleDay(day)} style={{ accentColor: 'var(--primary)' }} />
                                {DL[day]}
                            </label>
                            {j.ativo ? (
                                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                    <input type="time" className={Z.inp} style={{ fontSize: 11, flex: 1 }} value={j.entrada || ''} onChange={e => updateDay(day, 'entrada', e.target.value)} />
                                    <input type="time" className={Z.inp} style={{ fontSize: 11, flex: 1 }} value={j.saida_almoco || ''} onChange={e => updateDay(day, 'saida_almoco', e.target.value)} />
                                    <input type="time" className={Z.inp} style={{ fontSize: 11, flex: 1 }} value={j.volta_almoco || ''} onChange={e => updateDay(day, 'volta_almoco', e.target.value)} />
                                    <input type="time" className={Z.inp} style={{ fontSize: 11, flex: 1 }} value={j.saida || ''} onChange={e => updateDay(day, 'saida', e.target.value)} />
                                </div>
                            ) : <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Folga</span>}
                        </div>
                    );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <label className={Z.lbl} style={{ margin: 0 }}>Tolerância (min):</label>
                    <input type="number" className={Z.inp} style={{ width: 70, fontSize: 12 }} value={tolerancia} onChange={e => setTolerancia(parseInt(e.target.value) || 0)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button className={Z.btn2Sm} onClick={onClose} style={{ fontSize: 11 }}>Cancelar</button>
                    <button className={Z.btnSm} onClick={handleSave} disabled={saving} style={{ fontSize: 11 }}><Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}</button>
                </div>
            </div>
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════════
// MODAL: Feriados
// ═══════════════════════════════════════════════════════════
function FeriadosModal({ ano, onClose, notify, onUpdate }) {
    const [feriados, setFeriados] = useState([]);
    const [loading, setLoading] = useState(true);
    const [novaData, setNovaData] = useState('');
    const [novaDesc, setNovaDesc] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.get('/ponto/feriados?ano=' + ano); setFeriados(Array.isArray(r) ? r : []); }
        catch { } finally { setLoading(false); }
    }, [ano]);
    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!novaData || !novaDesc.trim()) return;
        setSaving(true);
        try { await api.post('/ponto/feriados', { data: novaData, descricao: novaDesc.trim() }); setNovaData(''); setNovaDesc(''); notify?.('Adicionado', 'success'); load(); onUpdate?.(); }
        catch { notify?.('Erro', 'error'); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id) => {
        try { await api.del('/ponto/feriados/' + id); notify?.('Removido', 'success'); load(); onUpdate?.(); }
        catch { notify?.('Erro', 'error'); }
    };

    const handlePopulate = async () => {
        setSaving(true);
        try {
            for (const f of FERIADOS_NACIONAIS) { const data = `${ano}${f.data}`; if (!feriados.some(ex => ex.data === data)) await api.post('/ponto/feriados', { data, descricao: f.descricao }); }
            notify?.('Feriados adicionados', 'success'); load(); onUpdate?.();
        } catch { notify?.('Erro', 'error'); }
        finally { setSaving(false); }
    };

    return (
        <Modal title={`Feriados ${ano}`} close={onClose} w={480}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div><label className={Z.lbl}>Data</label><input type="date" className={Z.inp} style={{ fontSize: 12 }} value={novaData} onChange={e => setNovaData(e.target.value)} /></div>
                <div style={{ flex: 1, minWidth: 100 }}><label className={Z.lbl}>Descrição</label><input className={Z.inp} style={{ fontSize: 12 }} value={novaDesc} onChange={e => setNovaDesc(e.target.value)} placeholder="Ex: Carnaval" /></div>
                <button className={Z.btnSm} onClick={handleAdd} disabled={saving || !novaData || !novaDesc.trim()} style={{ fontSize: 10 }}><Plus size={12} /></button>
            </div>
            <button className={Z.btn2Sm} onClick={handlePopulate} disabled={saving} style={{ fontSize: 10, marginBottom: 12 }}>Preencher Feriados Nacionais</button>
            {loading ? <Spinner text="Carregando..." /> : (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {feriados.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>Nenhum feriado</div> :
                        feriados.sort((a, b) => a.data.localeCompare(b.data)).map(f => (
                            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                <span style={{ fontWeight: 600, width: 50, flexShrink: 0 }}>{fmtBR(f.data)}</span>
                                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{f.descricao}</span>
                                <button className={Z.btnDSm} onClick={() => handleDelete(f.id)} style={{ fontSize: 10, padding: '2px 6px' }}><Trash2 size={11} /></button>
                            </div>
                        ))}
                </div>
            )}
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════════
// RELATÓRIO / DASHBOARD
// ═══════════════════════════════════════════════════════════
function RelatorioModal({ funcionarios, registros, jornada, tolerancia, feriados, ano, mes, bancoHoras, onClose }) {
    const daysCount = daysIn(ano, mes);
    const todayStr = new Date().toISOString().split('T')[0];

    // Calcular dados detalhados por funcionário
    const data = useMemo(() => {
        return funcionarios.map(func => {
            let trabalhadas = 0, previstas = 0, extras = 0, deficit = 0, atrasos = 0, faltas = 0, atestados = 0, ferias = 0, folgasFeriados = 0;
            const diasDetail = [];

            for (let d = 1; d <= daysCount; d++) {
                const dateStr = fmtD(ano, mes, d);
                const dayOfWeek = dow(ano, mes, d);
                if (dateStr > todayStr) continue;

                const reg = registros.find(r => r.funcionario_id === func.id && r.data === dateStr);
                const status = cellStatus(reg, dayOfWeek, jornada, tolerancia, feriados, dateStr, func.data_admissao);
                if (!status) continue;

                const exp = calcExp(jornada, dayOfWeek);
                const noExp = ['feriado', 'folga', 'ferias'].includes(status);
                const expectedDay = noExp ? 0 : exp;

                let workedDay = 0;
                if (status === 'normal' || status === 'atraso' || status === 'compensacao') {
                    workedDay = reg ? calcWork(reg) : 0;
                } else if (status === 'atestado') {
                    workedDay = expectedDay; // conta como trabalhado
                }

                trabalhadas += workedDay;
                previstas += expectedDay;

                if (workedDay > expectedDay && expectedDay > 0) extras += (workedDay - expectedDay);
                if (workedDay < expectedDay && expectedDay > 0) deficit += (expectedDay - workedDay);

                if (status === 'atraso') atrasos++;
                if (status === 'falta') faltas++;
                if (status === 'atestado') atestados++;
                if (status === 'ferias') ferias++;
                if (status === 'folga' || status === 'feriado') folgasFeriados++;

                if (reg && status === 'atraso') {
                    const j = getJornadaDia(jornada, dayOfWeek);
                    diasDetail.push({ dateStr, minAtraso: pt(reg.entrada) - pt(j?.entrada || '08:00') });
                }
            }

            const saldo = trabalhadas - previstas;
            return { func, trabalhadas, previstas, extras, deficit, saldo, atrasos, faltas, atestados, ferias, folgasFeriados, diasDetail };
        });
    }, [funcionarios, registros, jornada, tolerancia, feriados, ano, mes, daysCount, todayStr]);

    // Totais
    const totals = useMemo(() => {
        const t = { trabalhadas: 0, previstas: 0, extras: 0, deficit: 0, atrasos: 0, faltas: 0, atestados: 0 };
        data.forEach(d => { t.trabalhadas += d.trabalhadas; t.previstas += d.previstas; t.extras += d.extras; t.deficit += d.deficit; t.atrasos += d.atrasos; t.faltas += d.faltas; t.atestados += d.atestados; });
        t.saldo = t.trabalhadas - t.previstas;
        return t;
    }, [data]);

    const maxHoras = Math.max(...data.map(d => Math.max(d.trabalhadas, d.previstas)), 1);

    // Indicator card component
    const Ind = ({ label, value, color, sub }) => (
        <div style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--bg-muted)', borderRadius: 8, flex: '1 1 0', minWidth: 80 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            {sub && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
        </div>
    );

    return (
        <Modal title={`Relatório — ${MESES[mes]} ${ano}`} close={onClose} w={800}>
            <div style={{ maxHeight: 'calc(85vh - 80px)', overflowY: 'auto' }}>

                {/* Resumo geral */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <Ind label="Horas Trabalhadas" value={fmtH(totals.trabalhadas)} color="var(--text-primary)" />
                    <Ind label="Horas Extras" value={fmtH(totals.extras)} color="var(--success)" />
                    <Ind label="Deficit" value={fmtH(totals.deficit)} color="var(--danger)" />
                    <Ind label="Atrasos" value={totals.atrasos} color="var(--warning)" />
                    <Ind label="Faltas" value={totals.faltas} color="var(--danger)" />
                    <Ind label="Atestados" value={totals.atestados} color="var(--info)" />
                </div>

                {/* Cards por funcionário */}
                {data.map(({ func, trabalhadas, previstas, extras, deficit, saldo, atrasos, faltas, atestados, ferias, diasDetail }) => {
                    const pctTrab = previstas > 0 ? Math.min((trabalhadas / previstas) * 100, 150) : 0;
                    const barColor = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
                    const bh = bancoHoras?.[func.id];
                    const acum = bh?.saldo_acumulado ?? saldo;
                    const acumColor = acum >= 0 ? 'var(--success)' : 'var(--danger)';

                    return (
                        <div key={func.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--bg-primary)' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{func.nome}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{func.cargo || 'Sem cargo'}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Saldo do Mês</div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: barColor, lineHeight: 1 }}>
                                        {saldo >= 0 ? '+' : ''}{fmtH(saldo)}
                                    </div>
                                </div>
                            </div>

                            {/* Banco de Horas Acumulado */}
                            {bh && (
                                <div style={{ display: 'flex', gap: 8, marginBottom: 10, padding: '8px 10px', background: 'rgba(19,121,240,0.04)', borderRadius: 8, border: '1px solid rgba(19,121,240,0.1)', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Banco de Horas</div>
                                        <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 10 }}>
                                            <span>Anterior: <strong style={{ color: bh.saldo_anterior >= 0 ? 'var(--success)' : 'var(--danger)' }}>{bh.saldo_anterior >= 0 ? '+' : ''}{fmtH(bh.saldo_anterior)}</strong></span>
                                            <span>Mês: <strong style={{ color: bh.saldo_mes >= 0 ? 'var(--success)' : 'var(--danger)' }}>{bh.saldo_mes >= 0 ? '+' : ''}{fmtH(bh.saldo_mes)}</strong></span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>ACUMULADO</div>
                                        <div style={{ fontSize: 18, fontWeight: 900, color: acumColor, lineHeight: 1 }}>
                                            {acum >= 0 ? '+' : ''}{fmtH(acum)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Barra de progresso */}
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>
                                    <span>Trabalhadas: {fmtH(trabalhadas)}</span>
                                    <span>Previstas: {fmtH(previstas)}</span>
                                </div>
                                <div style={{ height: 8, background: 'var(--bg-muted)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ height: '100%', width: `${Math.min(pctTrab, 100)}%`, background: pctTrab > 100 ? 'var(--success)' : pctTrab > 90 ? 'var(--info)' : 'var(--warning)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                                    {pctTrab > 100 && (
                                        <div style={{ position: 'absolute', top: 0, left: '66.7%', width: `${Math.min(pctTrab - 100, 50) * 0.667}%`, height: '100%', background: 'rgba(34,197,94,0.3)', borderRadius: '0 4px 4px 0' }} />
                                    )}
                                </div>
                            </div>

                            {/* Indicadores */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {extras > 0 && (
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>
                                        +{fmtH(extras)} extras
                                    </span>
                                )}
                                {deficit > 0 && (
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        -{fmtH(deficit)} deficit
                                    </span>
                                )}
                                {atrasos > 0 && (
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.2)' }}>
                                        {atrasos} atraso{atrasos > 1 ? 's' : ''}
                                    </span>
                                )}
                                {faltas > 0 && (
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        {faltas} falta{faltas > 1 ? 's' : ''}
                                    </span>
                                )}
                                {atestados > 0 && (
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700, background: 'rgba(59,130,246,0.1)', color: 'var(--info)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        {atestados} atestado{atestados > 1 ? 's' : ''}
                                    </span>
                                )}
                                {ferias > 0 && (
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700, background: 'rgba(59,130,246,0.1)', color: 'var(--info)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        {ferias} dia{ferias > 1 ? 's' : ''} férias
                                    </span>
                                )}
                                {!extras && !deficit && !atrasos && !faltas && !atestados && !ferias && (
                                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 9, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>
                                        Tudo em dia
                                    </span>
                                )}
                            </div>

                            {/* Detalhe de atrasos */}
                            {diasDetail.length > 0 && (
                                <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(245,158,11,0.05)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.1)' }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', marginBottom: 3 }}>Detalhamento de Atrasos</div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {diasDetail.map((dd, i) => (
                                            <span key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 4 }}>
                                                {fmtBR(dd.dateStr)} <strong style={{ color: 'var(--warning)' }}>+{dd.minAtraso}min</strong>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {data.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>Nenhum dado para exibir</div>
                )}
            </div>
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Ponto({ notify }) {
    const { user } = useAuth();
    const today = new Date();
    const [mes, setMes] = useState(today.getMonth());
    const [ano, setAno] = useState(today.getFullYear());
    const [funcionarios, setFuncionarios] = useState([]);
    const [registros, setRegistros] = useState([]);
    const [feriados, setFeriados] = useState([]);
    const [jornada, setJornada] = useState(DEFAULT_JORNADA);
    const [tolerancia, setTolerancia] = useState(5);
    const [bancoHoras, setBancoHoras] = useState({}); // { funcId: { saldo_anterior, saldo_mes, saldo_acumulado } }
    const [loading, setLoading] = useState(true);

    const [showFuncionarios, setShowFuncionarios] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [showFeriados, setShowFeriados] = useState(false);
    const [showRelatorio, setShowRelatorio] = useState(false);
    const [planilhaFunc, setPlanilhaFunc] = useState(null);
    const [pontoConfirm, setPontoConfirm] = useState(null);

    const mesKey = `${ano}-${String(mes + 1).padStart(2, '0')}`;
    const daysCount = daysIn(ano, mes);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [funcs, regs, fer, cfg, bh] = await Promise.all([
                api.get('/ponto/funcionarios').catch(() => []),
                api.get('/ponto/registros?mes=' + mesKey).catch(() => []),
                api.get('/ponto/feriados?ano=' + ano).catch(() => []),
                api.get('/ponto/config').catch(() => null),
                api.get('/ponto/banco-horas?mes=' + mesKey).catch(() => []),
            ]);
            setFuncionarios((Array.isArray(funcs) ? funcs : []).filter(f => f.ativo));
            setRegistros(Array.isArray(regs) ? regs : []);
            setFeriados(Array.isArray(fer) ? fer : []);
            if (cfg?.jornada_json) try { setJornada(JSON.parse(cfg.jornada_json)); } catch { }
            if (cfg?.tolerancia_min != null) setTolerancia(cfg.tolerancia_min);
            // Banco de horas
            const bhMap = {};
            if (Array.isArray(bh)) bh.forEach(b => { bhMap[b.funcionario_id] = b; });
            setBancoHoras(bhMap);
        } catch { notify?.('Erro ao carregar dados', 'error'); }
        finally { setLoading(false); }
    }, [mesKey, ano, notify]);

    useEffect(() => { loadData(); }, [loadData]);

    const regMap = useMemo(() => {
        const m = {};
        registros.forEach(r => { m[`${r.funcionario_id}_${r.data}`] = r; });
        return m;
    }, [registros]);

    const prevMes = () => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); };
    const nextMes = () => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); };

    // Summary per employee
    const getSummary = useCallback((funcId) => {
        const func = funcionarios.find(f => f.id === funcId);
        const admissao = func?.data_admissao || null;
        let tw = 0, te = 0, faltas = 0;
        for (let d = 1; d <= daysCount; d++) {
            const dateStr = fmtD(ano, mes, d);
            const dayOfWeek = dow(ano, mes, d);
            const reg = regMap[`${funcId}_${dateStr}`];
            const status = cellStatus(reg, dayOfWeek, jornada, tolerancia, feriados, dateStr, admissao);
            if (!status) continue;
            const exp = calcExp(jornada, dayOfWeek);
            if (status === 'normal' || status === 'atraso' || status === 'compensacao') { tw += (reg ? calcWork(reg) : 0); te += exp; }
            else if (status === 'falta') { faltas++; te += exp; }
            else if (status === 'folga' || status === 'feriado') { /* no exp */ }
            else { te += exp; } // atestado, ferias
        }
        return { tw, te, faltas, saldo: tw - te };
    }, [daysCount, ano, mes, regMap, jornada, tolerancia, feriados, funcionarios]);

    // Exportar CSV
    // Export CSV (formato reimportável — respeita feriados e folgas)
    const exportCSV = () => {
        const hdr = ['Funcionario', 'Data', 'Entrada', 'Saida Almoco', 'Volta Almoco', 'Saida', 'Tipo', 'Obs'];
        const rows = [hdr.join(';')];
        const ferSet = new Set(feriados.map(f => f.data));
        const ferDesc = {};
        feriados.forEach(f => { ferDesc[f.data] = f.descricao; });

        funcionarios.forEach(func => {
            for (let d = 1; d <= daysCount; d++) {
                const dateStr = fmtD(ano, mes, d);
                const dayOfWeek = dow(ano, mes, d);
                const reg = regMap[`${func.id}_${dateStr}`];
                const j = jornada ? (jornada[dayOfWeek] || jornada[['dom','seg','ter','qua','qui','sex','sab'][dayOfWeek]]) : null;
                const isOff = !j || (j.ativo !== undefined && !j.ativo);
                const isFer = ferSet.has(dateStr);

                // Pular fim de semana sem registro
                if (isOff && !isFer && !reg) continue;

                // Determinar tipo correto
                let tipo = reg?.tipo || 'normal';
                let obs = reg?.obs || '';
                if (isFer && (!reg || reg.tipo === 'normal')) {
                    tipo = 'feriado';
                    if (!obs && ferDesc[dateStr]) obs = ferDesc[dateStr];
                }
                if (isOff && !isFer && !reg) tipo = 'folga';

                rows.push([
                    `"${func.nome}"`,
                    dateStr,
                    (tipo === 'feriado' || tipo === 'folga') ? '' : (reg?.entrada || ''),
                    (tipo === 'feriado' || tipo === 'folga') ? '' : (reg?.saida_almoco || ''),
                    (tipo === 'feriado' || tipo === 'folga') ? '' : (reg?.volta_almoco || ''),
                    (tipo === 'feriado' || tipo === 'folga') ? '' : (reg?.saida || ''),
                    tipo,
                    `"${obs.replace(/"/g, '""')}"`,
                ].join(';'));
            }
        });
        const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ponto_${mesKey}.csv`; a.click();
        notify?.('CSV exportado — preencha no Excel e reimporte', 'success');
    };

    // Import CSV
    const fileInputRef = useRef(null);
    const importCSV = async (file) => {
        try {
            const text = await file.text();
            const r = await api.post('/ponto/registros/importar', { csv: text });
            let msg = `${r.importados} registro(s) importado(s)`;
            if (r.ignorados > 0) msg += `, ${r.ignorados} ignorado(s)`;
            if (r.erros?.length) msg += `\n${r.erros.join('\n')}`;
            notify?.(msg, r.importados > 0 ? 'success' : 'error');
            loadData();
        } catch (e) { notify?.(e.error || 'Erro ao importar CSV', 'error'); }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return (
        <div className={Z.pg}>
            <PageHeader icon={Clock} title="Controle de Ponto" subtitle={`Frequência e jornada — ${MESES[mes]} ${ano}`} accent="accent">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className={Z.btn2Sm} onClick={() => setShowFuncionarios(true)} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Users size={13} /> Funcionários
                    </button>
                    <button className={Z.btn2Sm} onClick={() => setShowConfig(true)} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Settings size={13} /> Jornada
                    </button>
                    <button className={Z.btn2Sm} onClick={() => setShowFeriados(true)} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CalendarDays size={13} /> Feriados
                    </button>
                    <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
                    <button onClick={() => {
                        if (!funcionarios.length) { notify('Cadastre funcionários primeiro'); return; }
                        setPontoConfirm({ msg: `Preencher ${MESES[mes]}/${ano} com horário padrão para TODOS os ${funcionarios.length} funcionários ativos?\n\nDias já preenchidos NÃO serão sobrescritos.`, onOk: async () => {
                            try {
                                const r = await api.post('/ponto/registros/lote-todos', { mes: mesKey, sobrescrever: false });
                                notify(`${r.inseridos} registros criados para ${r.funcionarios} funcionários`, 'success');
                                loadData();
                            } catch (e) { notify(e.error || 'Erro ao preencher', 'error'); }
                        }});
                    }} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'var(--accent)', border: '1px solid var(--accent-hover)', color: '#fff', fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.18)' }}>
                        <CalendarDays size={13} /> Preencher Mês
                    </button>
                    <button className={Z.btn2Sm} onClick={() => setShowRelatorio(true)} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={13} /> Painel
                    </button>
                    <button className={Z.btn2Sm} onClick={exportCSV} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Download size={13} /> CSV
                    </button>
                    <button className={Z.btn2Sm} onClick={() => fileInputRef.current?.click()} style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Upload size={13} /> Importar
                    </button>
                    <button
                        onClick={async () => {
                            notify?.('Gerando relatório PDF...', 'info');
                            try {
                                const token = localStorage.getItem('erp_token');
                                const r = await fetch(`/api/ponto/relatorio-pdf?mes=${mesKey}`, { headers: { Authorization: `Bearer ${token}` } });
                                if (!r.ok) throw { error: 'Erro ao gerar PDF' };
                                const blob = await r.blob();
                                const url = URL.createObjectURL(blob);
                                const w = window.open(url, '_blank');
                                // Libera a URL depois que a aba abriu o PDF — evita vazamento
                                if (w) setTimeout(() => URL.revokeObjectURL(url), 60_000);
                                notify?.('Relatório PDF gerado', 'success');
                            } catch (e) { notify?.(e.error || 'Erro ao gerar PDF', 'error'); }
                        }}
                        title="Gerar relatório PDF do mês"
                        style={{
                            fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '7px 14px', borderRadius: 10,
                            background: 'linear-gradient(135deg, #1B1F26 0%, #0E1116 100%)',
                            border: '1px solid rgba(201,169,110,0.45)',
                            color: '#fff', fontWeight: 600, cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(14,17,22,0.25), inset 0 1px 0 rgba(201,169,110,0.15)',
                            transition: 'all 160ms var(--ease-out)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-bright)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(201,169,110,0.35), inset 0 1px 0 rgba(201,169,110,0.25)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(201,169,110,0.45)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(14,17,22,0.25), inset 0 1px 0 rgba(201,169,110,0.15)'; }}
                    >
                        <FileText size={13} style={{ color: '#C9A96E' }} /> Relatório PDF
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) importCSV(e.target.files[0]); }} />
                </div>
            </PageHeader>

            {/* Nav mês */}
            <div className="glass-card" style={{ marginBottom: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                        onClick={prevMes}
                        style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'var(--bg-muted)', border: '1px solid var(--border)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 160ms var(--ease-out)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-bright)'; e.currentTarget.style.color = 'var(--accent-bright)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        title="Mês anterior"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <div className="font-display" style={{ minWidth: 180, textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{MESES[mes]}</div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{ano} · {daysCount} dias</div>
                    </div>
                    <button
                        onClick={nextMes}
                        style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'var(--bg-muted)', border: '1px solid var(--border)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 160ms var(--ease-out)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-bright)'; e.currentTarget.style.color = 'var(--accent-bright)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        title="Próximo mês"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                        { c: 'var(--success)', l: 'Normal' },
                        { c: 'var(--warning)', l: 'Atraso' },
                        { c: 'var(--danger)', l: 'Falta' },
                        { c: 'var(--info)', l: 'Atestado / Férias' },
                        { c: 'var(--muted)', l: 'Folga / Feriado' },
                        { c: 'var(--info)', l: 'Compensação' },
                    ].map(x => (
                        <div key={x.l} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 10.5, fontWeight: 500,
                            color: 'var(--text-secondary)',
                            padding: '4px 10px', borderRadius: 999,
                            background: 'var(--bg-muted)',
                            border: '1px solid var(--border)',
                        }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: x.c, display: 'inline-block', boxShadow: `0 0 0 2px ${x.c}22` }} />
                            {x.l}
                        </div>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {loading ? <Spinner text="Carregando..." /> : funcionarios.length === 0 ? (
                <EmptyState icon={Users} title="Nenhum funcionário ativo" description="Cadastre funcionários para começar." action={{ label: 'Cadastrar', onClick: () => setShowFuncionarios(true) }} />
            ) : (
                <div className={Z.card} style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: 110 }} />
                            {Array.from({ length: daysCount }, () => <col key={Math.random()} />)}
                            <col style={{ width: 46 }} />
                            <col style={{ width: 32 }} />
                            <col style={{ width: 46 }} />
                            <col style={{ width: 52 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={{ padding: '6px 4px', textAlign: 'left', fontWeight: 700, fontSize: 10, borderBottom: '2px solid var(--border)', color: 'var(--text-primary)' }}>Funcionário</th>
                                {Array.from({ length: daysCount }, (_, i) => {
                                    const d = i + 1;
                                    const dw = dow(ano, mes, d);
                                    const dateStr = fmtD(ano, mes, d);
                                    const isWe = dw === 0 || dw === 6;
                                    const isToday = dateStr === todayStr;
                                    return (
                                        <th key={d} style={{ padding: '3px 0', textAlign: 'center', fontWeight: 600, fontSize: 9, borderBottom: '2px solid var(--border)', background: isToday ? 'rgba(19,121,240,0.08)' : isWe ? 'var(--bg-muted)' : 'transparent', color: isToday ? 'var(--primary)' : isWe ? 'var(--text-muted)' : 'var(--text-secondary)', lineHeight: 1.1, borderLeft: '1px solid var(--border)' }}>
                                            <div>{d}</div>
                                            <div style={{ fontSize: 7, fontWeight: 400 }}>{DS[dw].charAt(0)}</div>
                                        </th>
                                    );
                                })}
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontWeight: 700, fontSize: 9, borderBottom: '2px solid var(--border)', borderLeft: '2px solid var(--border)', color: 'var(--text-primary)' }}>Horas</th>
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontWeight: 700, fontSize: 9, borderBottom: '2px solid var(--border)', borderLeft: '1px solid var(--border)', color: 'var(--text-primary)' }}>F</th>
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontWeight: 700, fontSize: 9, borderBottom: '2px solid var(--border)', borderLeft: '1px solid var(--border)', color: 'var(--text-primary)' }}>Mês</th>
                                <th style={{ padding: '3px 2px', textAlign: 'center', fontWeight: 700, fontSize: 9, borderBottom: '2px solid var(--border)', borderLeft: '1px solid var(--border)', color: 'var(--primary)' }} title="Banco de Horas Acumulado">Banco</th>
                            </tr>
                        </thead>
                        <tbody>
                            {funcionarios.map(func => {
                                const sm = getSummary(func.id);
                                return (
                                    <tr key={func.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td onClick={() => setPlanilhaFunc(func)} style={{ padding: '5px 4px', fontWeight: 600, fontSize: 10, color: 'var(--primary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRight: '1px solid var(--border)' }} title={`Abrir planilha de ${func.nome}`}>
                                            {func.nome}
                                        </td>
                                        {Array.from({ length: daysCount }, (_, i) => {
                                            const d = i + 1;
                                            const dw = dow(ano, mes, d);
                                            const dateStr = fmtD(ano, mes, d);
                                            const isWe = dw === 0 || dw === 6;
                                            const isToday = dateStr === todayStr;
                                            const reg = regMap[`${func.id}_${dateStr}`];
                                            const status = cellStatus(reg, dw, jornada, tolerancia, feriados, dateStr, func.data_admissao);
                                            return (
                                                <td key={d} onClick={() => setPlanilhaFunc(func)} style={{ padding: '3px 0', textAlign: 'center', cursor: 'pointer', borderLeft: '1px solid var(--border)', background: isToday ? 'rgba(19,121,240,0.05)' : isWe ? 'var(--bg-muted)' : 'transparent' }}>
                                                    <Dot status={status} />
                                                </td>
                                            );
                                        })}
                                        {(() => {
                                            const bh = bancoHoras[func.id];
                                            const acum = bh?.saldo_acumulado || sm.saldo;
                                            return (<>
                                                <td style={{ padding: '3px 2px', textAlign: 'center', fontSize: 9, fontWeight: 600, borderLeft: '2px solid var(--border)', color: 'var(--text-primary)' }}>{fmtH(sm.tw)}</td>
                                                <td style={{ padding: '3px 2px', textAlign: 'center', fontSize: 9, fontWeight: 600, borderLeft: '1px solid var(--border)', color: sm.faltas > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{sm.faltas || '—'}</td>
                                                <td style={{ padding: '3px 2px', textAlign: 'center', fontSize: 9, fontWeight: 600, borderLeft: '1px solid var(--border)', color: sm.saldo >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtH(sm.saldo)}</td>
                                                <td style={{ padding: '3px 2px', textAlign: 'center', fontSize: 9, fontWeight: 800, borderLeft: '1px solid var(--border)', color: acum >= 0 ? 'var(--success)' : 'var(--danger)', background: 'rgba(19,121,240,0.03)' }} title={bh ? `Anterior: ${fmtH(bh.saldo_anterior)} | Mês: ${fmtH(bh.saldo_mes)} | Total: ${fmtH(bh.saldo_acumulado)}` : 'Banco de horas'}>{fmtH(acum)}</td>
                                            </>);
                                        })()}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {pontoConfirm && (
                <ConfirmModal title="Confirmar" message={pontoConfirm.msg}
                    onConfirm={() => { const fn = pontoConfirm.onOk; setPontoConfirm(null); fn(); }}
                    onCancel={() => setPontoConfirm(null)} />
            )}
            {planilhaFunc && (
                <PlanilhaModal
                    funcionario={planilhaFunc}
                    mesKey={mesKey} ano={ano} mes={mes}
                    jornada={jornada} feriados={feriados} registros={registros}
                    onClose={() => setPlanilhaFunc(null)}
                    onSaved={loadData}
                    notify={notify}
                />
            )}
            {showFuncionarios && <FuncionariosModal onClose={() => { setShowFuncionarios(false); loadData(); }} notify={notify} />}
            {showConfig && <ConfigModal onClose={() => { setShowConfig(false); loadData(); }} notify={notify} />}
            {showFeriados && <FeriadosModal ano={ano} onClose={() => setShowFeriados(false)} notify={notify} onUpdate={loadData} />}
            {showRelatorio && <RelatorioModal funcionarios={funcionarios} registros={registros} jornada={jornada} tolerancia={tolerancia} feriados={feriados} ano={ano} mes={mes} bancoHoras={bancoHoras} onClose={() => setShowRelatorio(false)} />}
        </div>
    );
}
