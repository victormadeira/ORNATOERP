// ═══════════════════════════════════════════════════════
// Admin — Error Reports do Plugin (tickets do install)
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { Z, PageHeader, Spinner, EmptyState, Modal } from '../../ui';
import { Bug, RefreshCw, Search, ChevronLeft, ExternalLink } from 'lucide-react';

function token() { return localStorage.getItem('erp_token'); }

async function api(path) {
    const r = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw data.error || 'Erro';
    return data;
}

function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}

export default function PluginErrorReports({ notify, onNav }) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [installId, setInstallId] = useState('');
    const [version, setVersion] = useState('');
    const [detail, setDetail] = useState(null);

    const reload = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (installId) params.set('install_id', installId);
        if (version) params.set('version', version);
        try {
            const d = await api(`/plugin/error-reports?${params.toString()}`);
            setReports(d.reports || []);
        } catch (e) { notify?.(typeof e === 'string' ? e : 'Erro'); }
        finally { setLoading(false); }
    }, [q, installId, version, notify]);

    useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function openDetail(ticket_id) {
        try {
            const r = await api(`/plugin/error-reports/${ticket_id}`);
            setDetail(r);
        } catch (e) { notify?.(typeof e === 'string' ? e : 'Erro ao abrir'); }
    }

    return (
        <div className={Z.pg}>
            <PageHeader icon={Bug} title="Error Reports do Plugin"
                subtitle="Tickets reportados pelos clients via plugin" accent="accent">
                <button className={Z.btn2Sm} onClick={() => onNav?.('plugin_releases')}>
                    <ChevronLeft size={14} /> Releases
                </button>
                <button className={Z.btn2Sm} onClick={reload}><RefreshCw size={14} /></button>
            </PageHeader>

            <div className="glass-card p-3 mb-4" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8 }}>
                <input className={Z.inp} placeholder="Buscar mensagem ou classe..."
                    value={q} onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && reload()} />
                <input className={Z.inp} placeholder="install_id"
                    value={installId} onChange={(e) => setInstallId(e.target.value)} />
                <input className={Z.inp} placeholder="versão (ex: 1.2.3)"
                    value={version} onChange={(e) => setVersion(e.target.value)} />
                <button className={Z.btnSm} onClick={reload}><Search size={14} /> Filtrar</button>
            </div>

            {loading && <div className="flex justify-center p-8"><Spinner /></div>}

            {!loading && reports.length === 0 && (
                <EmptyState icon={Bug} title="Nenhum erro reportado" description="Nada encontrado com os filtros atuais." />
            )}

            {!loading && reports.length > 0 && (
                <div className="glass-card overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: 900 }}>
                        <thead>
                            <tr>
                                <th className={Z.th}>Ticket</th>
                                <th className={Z.th}>Classe</th>
                                <th className={Z.th}>Mensagem</th>
                                <th className={Z.th}>Versão</th>
                                <th className={Z.th}>Install</th>
                                <th className={Z.th}>Quando</th>
                                <th className={Z.th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map(r => (
                                <tr key={r.id}>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.ticket_id?.slice(0, 8)}…</td>
                                    <td>{r.error_class || '—'}</td>
                                    <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.message}>
                                        {r.message?.slice(0, 80)}
                                    </td>
                                    <td>{r.plugin_version || '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                                        {r.install_id?.slice(0, 12) || '—'}…
                                    </td>
                                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</td>
                                    <td>
                                        <button className={Z.btn2Sm} onClick={() => openDetail(r.ticket_id)}>
                                            <ExternalLink size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {detail && (
                <Modal title={`Ticket ${detail.ticket_id}`} close={() => setDetail(null)} w={720}>
                    <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                        <div><strong>Classe:</strong> {detail.error_class || '—'}</div>
                        <div><strong>Versão:</strong> {detail.plugin_version || '—'}</div>
                        <div><strong>Install:</strong> <code style={{ fontSize: 11 }}>{detail.install_id}</code></div>
                        <div><strong>Quando:</strong> {fmtDate(detail.created_at)}</div>
                        <div>
                            <strong>Mensagem:</strong>
                            <pre style={{ background: 'var(--bg-muted)', padding: 10, borderRadius: 8, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                                {detail.message}
                            </pre>
                        </div>
                        {detail.stack && (
                            <div>
                                <strong>Stack:</strong>
                                <pre style={{ background: 'var(--bg-muted)', padding: 10, borderRadius: 8, marginTop: 4, fontSize: 11, maxHeight: 240, overflow: 'auto' }}>
                                    {detail.stack}
                                </pre>
                            </div>
                        )}
                        {detail.context && (
                            <div>
                                <strong>Contexto:</strong>
                                <pre style={{ background: 'var(--bg-muted)', padding: 10, borderRadius: 8, marginTop: 4, fontSize: 11 }}>
                                    {typeof detail.context === 'string' ? detail.context : JSON.stringify(detail.context, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
}
