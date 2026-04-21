import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Modal } from '../ui';
import api from '../api';
import { AlertTriangle, AlertCircle, Bug, RefreshCw, Check, Trash2, X, Filter, Activity } from 'lucide-react';

// Formata data relativa curta ("5 min", "2 h", "3 d")
function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr.replace(' ', 'T') + 'Z');
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} d`;
}

function sourceStyle(source) {
    if (source === 'frontend') return { bg: 'rgba(99,102,241,0.12)', color: '#6366f1', label: 'Frontend' };
    if (source === 'backend') return { bg: 'rgba(249,115,22,0.12)', color: '#f97316', label: 'Backend' };
    if (source === 'unhandled') return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Unhandled' };
    return { bg: 'var(--bg-muted)', color: 'var(--text-muted)', label: source };
}

export default function Errors({ notify }) {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ source: '', resolved: '0', q: '' });
    const [offset, setOffset] = useState(0);
    const [selected, setSelected] = useState(null);
    const limit = 50;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            qs.set('limit', limit);
            qs.set('offset', offset);
            if (filter.source) qs.set('source', filter.source);
            if (filter.resolved) qs.set('resolved', filter.resolved);
            if (filter.q) qs.set('q', filter.q);
            const [list, s] = await Promise.all([
                api.get(`/errors?${qs.toString()}`),
                api.get('/errors/stats'),
            ]);
            setRows(list.rows || []);
            setTotal(list.total || 0);
            setStats(s);
        } catch (err) {
            notify?.('Erro ao carregar: ' + (err.error || err.message));
        } finally {
            setLoading(false);
        }
    }, [filter, offset, notify]);

    useEffect(() => { load(); }, [load]);

    // Auto-refresh a cada 30s
    useEffect(() => {
        const id = setInterval(load, 30_000);
        return () => clearInterval(id);
    }, [load]);

    const toggleResolved = async (row) => {
        try {
            await api.put(`/errors/${row.id}/resolve`, { resolved: !row.resolved });
            setRows(rs => rs.map(r => r.id === row.id ? { ...r, resolved: row.resolved ? 0 : 1 } : r));
        } catch (err) {
            notify?.('Erro: ' + (err.error || err.message));
        }
    };

    const remove = async (id) => {
        if (!confirm('Remover este erro do log?')) return;
        try {
            await api.del(`/errors/${id}`);
            setRows(rs => rs.filter(r => r.id !== id));
            setTotal(t => Math.max(0, t - 1));
            if (selected?.id === id) setSelected(null);
        } catch (err) {
            notify?.('Erro: ' + (err.error || err.message));
        }
    };

    const purgeOld = async () => {
        if (!confirm('Remover erros com mais de 30 dias?')) return;
        try {
            const r = await api.del('/errors?days=30');
            notify?.(`${r.deleted} erros removidos`);
            load();
        } catch (err) {
            notify?.('Erro: ' + (err.error || err.message));
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader icon={Bug} title="Erros do Sistema" subtitle={`${total} registrado${total !== 1 ? 's' : ''}`}>
                <button
                    className="btn-secondary flex items-center gap-1.5"
                    onClick={load}
                    title="Atualizar"
                    style={{ padding: '8px 14px', fontSize: 13 }}
                >
                    <RefreshCw size={14} /> Atualizar
                </button>
                <button
                    className="btn-secondary flex items-center gap-1.5"
                    onClick={purgeOld}
                    title="Limpar erros antigos (> 30 dias)"
                    style={{ padding: '8px 14px', fontSize: 13 }}
                >
                    <Trash2 size={14} /> Limpar &gt; 30d
                </button>
            </PageHeader>

            {/* Stats cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <StatCard
                        icon={<AlertCircle size={16} />}
                        label="Abertos"
                        value={stats.unresolved}
                        color={stats.unresolved > 0 ? 'var(--danger)' : 'var(--success)'}
                    />
                    <StatCard
                        icon={<Activity size={16} />}
                        label="Últimas 24h"
                        value={stats.last24h?.c || 0}
                        sub={`${stats.last24h?.total_hits || 0} ocorrências`}
                    />
                    <StatCard
                        icon={<Activity size={16} />}
                        label="Últimos 7 dias"
                        value={stats.last7d?.c || 0}
                        sub={`${stats.last7d?.total_hits || 0} ocorrências`}
                    />
                    <StatCard
                        icon={<Filter size={16} />}
                        label="Por origem (24h)"
                        value={
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {(stats.bySource || []).map(s => {
                                    const st = sourceStyle(s.source);
                                    return (
                                        <span key={s.source} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.color, fontWeight: 600 }}>
                                            {st.label} {s.c}
                                        </span>
                                    );
                                })}
                                {(!stats.bySource || stats.bySource.length === 0) && (
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>sem erros</span>
                                )}
                            </div>
                        }
                    />
                </div>
            )}

            {/* Filters */}
            <div className="glass-card p-3 flex flex-wrap items-center gap-2" style={{ marginBottom: 16 }}>
                <select
                    value={filter.source}
                    onChange={e => { setOffset(0); setFilter(f => ({ ...f, source: e.target.value })); }}
                    className="input"
                    style={{ padding: '6px 10px', fontSize: 13, minWidth: 140 }}
                >
                    <option value="">Todas origens</option>
                    <option value="backend">Backend</option>
                    <option value="frontend">Frontend</option>
                    <option value="unhandled">Unhandled</option>
                </select>
                <select
                    value={filter.resolved}
                    onChange={e => { setOffset(0); setFilter(f => ({ ...f, resolved: e.target.value })); }}
                    className="input"
                    style={{ padding: '6px 10px', fontSize: 13, minWidth: 140 }}
                >
                    <option value="">Todos status</option>
                    <option value="0">Abertos</option>
                    <option value="1">Resolvidos</option>
                </select>
                <input
                    type="text"
                    placeholder="Buscar mensagem ou URL..."
                    value={filter.q}
                    onChange={e => { setOffset(0); setFilter(f => ({ ...f, q: e.target.value })); }}
                    className="input"
                    style={{ padding: '6px 10px', fontSize: 13, flex: 1, minWidth: 200 }}
                />
            </div>

            {/* Lista */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
                {loading && rows.length === 0 ? (
                    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        Carregando...
                    </div>
                ) : rows.length === 0 ? (
                    <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <AlertTriangle size={28} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                        <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum erro registrado</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Tudo funcionando.</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                                    <Th>Origem</Th>
                                    <Th>Mensagem</Th>
                                    <Th style={{ width: 80, textAlign: 'center' }}>Vezes</Th>
                                    <Th style={{ width: 100 }}>Última</Th>
                                    <Th style={{ width: 140, textAlign: 'right' }}>Ações</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const st = sourceStyle(r.source);
                                    return (
                                        <tr
                                            key={r.id}
                                            onClick={() => openDetail(r, setSelected)}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                opacity: r.resolved ? 0.5 : 1,
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <Td>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.color, fontWeight: 600 }}>
                                                    {st.label}
                                                </span>
                                            </Td>
                                            <Td>
                                                <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 600 }}>
                                                    {r.message || '(sem mensagem)'}
                                                </div>
                                                {r.url && (
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 600 }}>
                                                        {r.method ? `${r.method} ` : ''}{r.url}
                                                        {r.status_code ? ` · ${r.status_code}` : ''}
                                                    </div>
                                                )}
                                            </Td>
                                            <Td style={{ textAlign: 'center', fontWeight: 600 }}>
                                                {r.count > 1 ? (
                                                    <span style={{ color: r.count > 10 ? 'var(--danger)' : 'var(--warning)' }}>
                                                        ×{r.count}
                                                    </span>
                                                ) : <span style={{ color: 'var(--text-muted)' }}>1</span>}
                                            </Td>
                                            <Td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                                {timeAgo(r.last_seen)}
                                            </Td>
                                            <Td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: 4 }}>
                                                    <IconBtn
                                                        onClick={() => toggleResolved(r)}
                                                        title={r.resolved ? 'Reabrir' : 'Marcar como resolvido'}
                                                        color={r.resolved ? 'var(--text-muted)' : 'var(--success)'}
                                                    >
                                                        {r.resolved ? <X size={14} /> : <Check size={14} />}
                                                    </IconBtn>
                                                    <IconBtn
                                                        onClick={() => remove(r.id)}
                                                        title="Remover"
                                                        color="var(--danger)"
                                                    >
                                                        <Trash2 size={14} />
                                                    </IconBtn>
                                                </div>
                                            </Td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Paginação */}
            {total > limit && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                    <div>
                        Mostrando {offset + 1}–{Math.min(offset + limit, total)} de {total}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                            disabled={offset === 0}
                            onClick={() => setOffset(o => Math.max(0, o - limit))}
                        >
                            Anterior
                        </button>
                        <button
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                            disabled={offset + limit >= total}
                            onClick={() => setOffset(o => o + limit)}
                        >
                            Próximo
                        </button>
                    </div>
                </div>
            )}

            {selected && (
                <ErrorDetailModal
                    id={selected.id}
                    close={() => setSelected(null)}
                    onChanged={() => load()}
                />
            )}
        </div>
    );
}

async function openDetail(row, setSelected) {
    setSelected(row);
}

function Th({ children, style }) {
    return <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', ...style }}>{children}</th>;
}
function Td({ children, style, onClick }) {
    return <td onClick={onClick} style={{ padding: '10px 14px', verticalAlign: 'middle', ...style }}>{children}</td>;
}
function IconBtn({ children, onClick, title, color }) {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                width: 28, height: 28, borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '1px solid var(--border)',
                color: color || 'var(--text-muted)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
            {children}
        </button>
    );
}

function StatCard({ icon, label, value, sub, color }) {
    return (
        <div className="glass-card p-4">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                {icon} {label}
            </div>
            <div style={{ fontSize: typeof value === 'number' ? 24 : 13, fontWeight: 700, color: color || 'var(--text-primary)' }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

function ErrorDetailModal({ id, close, onChanged }) {
    const [data, setData] = useState(null);
    useEffect(() => {
        api.get(`/errors/${id}`).then(setData).catch(() => setData({ error: 'Não foi possível carregar' }));
    }, [id]);

    let meta = {};
    try { meta = JSON.parse(data?.meta_json || '{}'); } catch {}

    return (
        <Modal title={`Erro #${id}`} close={close} w={720}>
            {!data ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
            ) : data.error ? (
                <div style={{ padding: 20, color: 'var(--danger)' }}>{data.error}</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="Mensagem" value={data.message} mono />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                        <Field label="Origem" value={data.source} />
                        <Field label="Nível" value={data.level} />
                        <Field label="Error ID" value={data.error_id || '—'} mono />
                        <Field label="Fingerprint" value={data.fingerprint} mono />
                        <Field label="Ocorrências" value={data.count} />
                        <Field label="Status HTTP" value={data.status_code || '—'} />
                        <Field label="Método / URL" value={`${data.method || ''} ${data.url || '—'}`.trim()} mono />
                        <Field label="Usuário" value={data.user_id || 'anônimo'} />
                        <Field label="Primeira" value={data.first_seen} />
                        <Field label="Última" value={data.last_seen} />
                    </div>
                    {data.user_agent && <Field label="User Agent" value={data.user_agent} mono small />}
                    {data.stack && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Stack</div>
                            <pre style={{ fontSize: 11, padding: 12, background: 'var(--bg-muted)', borderRadius: 8, overflow: 'auto', maxHeight: 300, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: 'var(--text-primary)' }}>
                                {data.stack}
                            </pre>
                        </div>
                    )}
                    {Object.keys(meta).length > 0 && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Metadados</div>
                            <pre style={{ fontSize: 11, padding: 12, background: 'var(--bg-muted)', borderRadius: 8, overflow: 'auto', maxHeight: 200, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                                {JSON.stringify(meta, null, 2)}
                            </pre>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                            className="btn-secondary"
                            style={{ padding: '8px 14px', fontSize: 13 }}
                            onClick={async () => {
                                await api.put(`/errors/${id}/resolve`, { resolved: !data.resolved });
                                onChanged?.();
                                close();
                            }}
                        >
                            {data.resolved ? 'Reabrir' : 'Marcar resolvido'}
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

function Field({ label, value, mono, small }) {
    return (
        <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
            <div style={{
                fontSize: small ? 11 : 13,
                color: 'var(--text-primary)',
                fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit',
                wordBreak: 'break-word',
            }}>
                {value}
            </div>
        </div>
    );
}
