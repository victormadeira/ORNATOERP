// ═══════════════════════════════════════════════════════
// Admin — Releases do Plugin SketchUp (.rbz)
// Upload, listar, promover, publicar/despublicar, deletar
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Z, PageHeader, Modal, Spinner, EmptyState, Badge, ConfirmModal } from '../../ui';
import {
    Plug, Upload, RefreshCw, Trash2, ChevronUp, CheckCircle2, EyeOff, AlertCircle,
    FileArchive, Filter, FileText, BarChart3, Bug,
} from 'lucide-react';

const VERSION_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9._-]+)?$/;
const CHANNELS = ['dev', 'beta', 'stable'];
const CHANNEL_NEXT = { dev: 'beta', beta: 'stable' };

const STATUS_COLORS = {
    draft:      { bg: '#f1f5f9', fg: '#475569', label: 'Rascunho' },
    published:  { bg: '#dcfce7', fg: '#166534', label: 'Publicado' },
    deprecated: { bg: '#fef3c7', fg: '#92400e', label: 'Depreciado' },
};
const CHANNEL_COLORS = {
    dev:    { bg: '#fef3c7', fg: '#92400e' },
    beta:   { bg: '#dbeafe', fg: '#1e40af' },
    stable: { bg: '#dcfce7', fg: '#166534' },
};

function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}

function token() { return localStorage.getItem('erp_token'); }

async function api(method, path, body) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
        },
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`/api${path}`, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw data.error || 'Erro';
    return data;
}

export default function PluginReleases({ notify, onNav }) {
    const [releases, setReleases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterChannel, setFilterChannel] = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const reload = useCallback(() => {
        setLoading(true);
        const qs = filterChannel ? `?channel=${filterChannel}` : '';
        api('GET', `/plugin/releases${qs}`)
            .then(d => setReleases(d.releases || []))
            .catch(e => notify?.(typeof e === 'string' ? e : 'Erro ao carregar releases'))
            .finally(() => setLoading(false));
    }, [filterChannel, notify]);

    useEffect(reload, [reload]);

    async function patch(id, payload, msg) {
        try {
            await api('PATCH', `/plugin/releases/${id}`, payload);
            notify?.(msg || 'Atualizado');
            reload();
        } catch (e) { notify?.(typeof e === 'string' ? e : 'Erro'); }
    }

    async function doDelete(id) {
        try {
            await api('DELETE', `/plugin/releases/${id}`);
            notify?.('Release removido');
            setConfirmDelete(null);
            reload();
        } catch (e) { notify?.(typeof e === 'string' ? e : 'Erro ao remover'); }
    }

    const grouped = useMemo(() => {
        const out = { dev: [], beta: [], stable: [] };
        for (const r of releases) (out[r.channel] || (out[r.channel] = [])).push(r);
        return out;
    }, [releases]);

    return (
        <div className={Z.pg}>
            <PageHeader
                icon={Plug}
                title="Releases do Plugin"
                subtitle="Gerencie versões .rbz por canal (dev → beta → stable)"
                accent="accent"
            >
                <button className={Z.btn2Sm} onClick={reload} title="Atualizar">
                    <RefreshCw size={14} /> Atualizar
                </button>
                <button className={Z.btn2Sm} onClick={() => onNav?.('plugin_telemetry')}>
                    <BarChart3 size={14} /> Telemetria
                </button>
                <button className={Z.btn2Sm} onClick={() => onNav?.('plugin_errors')}>
                    <Bug size={14} /> Erros
                </button>
                <button className={Z.btnSm} onClick={() => setShowUpload(true)}>
                    <Upload size={14} /> Novo release
                </button>
            </PageHeader>

            {/* Filter chips */}
            <div className="glass-card p-3 mb-4 flex items-center gap-2 flex-wrap">
                <Filter size={14} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Canal:</span>
                <button
                    className={filterChannel === '' ? Z.btnSm : Z.btn2Sm}
                    onClick={() => setFilterChannel('')}
                >Todos</button>
                {CHANNELS.map(ch => (
                    <button
                        key={ch}
                        className={filterChannel === ch ? Z.btnSm : Z.btn2Sm}
                        onClick={() => setFilterChannel(ch)}
                    >
                        {ch} <span style={{ opacity: 0.6 }}>({grouped[ch]?.length || 0})</span>
                    </button>
                ))}
            </div>

            {loading && <div className="flex justify-center p-8"><Spinner text="Carregando releases..." /></div>}

            {!loading && releases.length === 0 && (
                <EmptyState
                    icon={FileArchive}
                    title="Nenhum release ainda"
                    description="Faça upload do primeiro arquivo .rbz para começar"
                    action={<button className={Z.btn} onClick={() => setShowUpload(true)}><Upload size={14} /> Upload</button>}
                />
            )}

            {!loading && releases.length > 0 && (
                <div className="glass-card overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: 900 }}>
                        <thead>
                            <tr>
                                <th className={Z.th}>Versão</th>
                                <th className={Z.th}>Canal</th>
                                <th className={Z.th}>Status</th>
                                <th className={Z.th}>Tamanho</th>
                                <th className={Z.th}>SHA-256</th>
                                <th className={Z.th}>Force</th>
                                <th className={Z.th}>Criado</th>
                                <th className={Z.th}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {releases.map(r => (
                                <ReleaseRow
                                    key={r.id} r={r}
                                    onPatch={patch}
                                    onDelete={() => setConfirmDelete(r)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showUpload && (
                <UploadModal
                    close={() => setShowUpload(false)}
                    onDone={() => { setShowUpload(false); reload(); notify?.('Release enviado (status: rascunho)'); }}
                    notify={notify}
                />
            )}

            {confirmDelete && (
                <ConfirmModal
                    title="Remover release"
                    message={`Deletar versão ${confirmDelete.version} (canal ${confirmDelete.channel})? O arquivo .rbz será apagado do disco.`}
                    danger
                    confirmLabel="Deletar"
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={() => doDelete(confirmDelete.id)}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
function ReleaseRow({ r, onPatch, onDelete }) {
    const [showLog, setShowLog] = useState(false);
    const status = STATUS_COLORS[r.status] || STATUS_COLORS.draft;
    const channel = CHANNEL_COLORS[r.channel] || {};
    const nextChannel = CHANNEL_NEXT[r.channel];

    return (
        <>
            <tr>
                <td style={{ fontWeight: 600 }}>{r.version}</td>
                <td>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ background: channel.bg, color: channel.fg }}>{r.channel}</span>
                </td>
                <td>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ background: status.bg, color: status.fg }}>{status.label}</span>
                </td>
                <td>{fmtSize(r.size_bytes)}</td>
                <td title={r.sha256} style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                    {r.sha256?.slice(0, 12)}…
                </td>
                <td>
                    <input
                        type="checkbox"
                        checked={!!r.force_update}
                        onChange={(e) => onPatch(r.id, { force_update: e.target.checked }, 'Force atualizado')}
                        title="Forçar atualização nos clients"
                    />
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</td>
                <td>
                    <div className="flex flex-wrap gap-1">
                        {r.status !== 'published' && (
                            <button className={Z.btnSm} onClick={() => onPatch(r.id, { status: 'published' }, 'Publicado')}
                                title="Publicar (visível pra clients)">
                                <CheckCircle2 size={12} /> Publicar
                            </button>
                        )}
                        {r.status === 'published' && (
                            <button className={Z.btn2Sm} onClick={() => onPatch(r.id, { status: 'deprecated' }, 'Depreciado')}>
                                <EyeOff size={12} /> Depreciar
                            </button>
                        )}
                        {nextChannel && (
                            <button className={Z.btn2Sm} onClick={() => onPatch(r.id, { channel: nextChannel }, `Promovido pra ${nextChannel}`)}
                                title={`Mover release pra canal ${nextChannel}`}>
                                <ChevronUp size={12} /> {nextChannel}
                            </button>
                        )}
                        <button className={Z.btn2Sm} onClick={() => setShowLog(s => !s)} title="Ver changelog">
                            <FileText size={12} />
                        </button>
                        <button className={Z.btnDSm} onClick={onDelete} title="Deletar">
                            <Trash2 size={12} />
                        </button>
                    </div>
                </td>
            </tr>
            {showLog && (
                <tr>
                    <td colSpan={8} style={{ background: 'var(--bg-muted)' }}>
                        <div style={{ padding: 12 }}>
                            <strong style={{ fontSize: 12 }}>Changelog:</strong>
                            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6, fontFamily: 'inherit' }}>
                                {r.changelog || '(vazio)'}
                            </pre>
                            {r.min_compat && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                    Min compat: <code>{r.min_compat}</code>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────
function UploadModal({ close, onDone, notify }) {
    const [file, setFile] = useState(null);
    const [version, setVersion] = useState('');
    const [channel, setChannel] = useState('dev');
    const [changelog, setChangelog] = useState('');
    const [forceUpdate, setForceUpdate] = useState(false);
    const [minCompat, setMinCompat] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    function pickFile(f) {
        if (!f) return;
        if (!/\.rbz$/i.test(f.name)) { setErr('Arquivo precisa ser .rbz'); return; }
        if (f.size > 50 * 1024 * 1024) { setErr('Arquivo > 50MB'); return; }
        setErr('');
        setFile(f);
        // Auto-detect version do filename: ornato_cnc_1.2.3.rbz, plugin-0.0.1.rbz
        const m = f.name.match(/(\d+\.\d+\.\d+(?:-[A-Za-z0-9._-]+)?)/);
        if (m && !version) setVersion(m[1]);
    }

    function valid() {
        if (!file) return 'Selecione um arquivo .rbz';
        if (!VERSION_RE.test(version)) return 'Versão inválida (semver: 1.2.3 ou 1.2.3-beta1)';
        if (!CHANNELS.includes(channel)) return 'Canal inválido';
        return null;
    }

    async function submit() {
        const v = valid();
        if (v) { setErr(v); return; }
        setBusy(true); setErr('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('version', version);
            fd.append('channel', channel);
            fd.append('changelog', changelog);
            fd.append('force_update', forceUpdate ? '1' : '0');
            if (minCompat) fd.append('min_compat', minCompat);

            const r = await fetch('/api/plugin/releases', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token()}` },
                body: fd,
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw data.error || `Erro ${r.status}`;
            onDone();
        } catch (e) {
            setErr(typeof e === 'string' ? e : 'Erro no upload');
        } finally { setBusy(false); }
    }

    return (
        <Modal title="Upload de novo release" close={close} w={640}>
            {/* Drag/drop area */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault(); setDragOver(false);
                    pickFile(e.dataTransfer.files?.[0]);
                }}
                style={{
                    border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 12, padding: 24, textAlign: 'center',
                    background: dragOver ? 'var(--primary-bg)' : 'var(--bg-muted)',
                    transition: 'all 0.15s',
                    marginBottom: 16,
                }}
            >
                {file ? (
                    <div>
                        <FileArchive size={32} style={{ color: 'var(--primary)', margin: '0 auto 8px' }} />
                        <div style={{ fontWeight: 600 }}>{file.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtSize(file.size)}</div>
                        <button className={Z.btn2Sm} onClick={() => setFile(null)} style={{ marginTop: 8 }}>Trocar</button>
                    </div>
                ) : (
                    <div>
                        <Upload size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
                        <div>Arraste o arquivo .rbz aqui</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>ou</div>
                        <label className={Z.btn2Sm} style={{ cursor: 'pointer' }}>
                            Selecionar arquivo
                            <input type="file" accept=".rbz" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                        </label>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                    <label className={Z.lbl}>Versão</label>
                    <input className={Z.inp} placeholder="1.2.3 ou 1.2.3-beta1"
                        value={version} onChange={(e) => setVersion(e.target.value)} />
                </div>
                <div>
                    <label className={Z.lbl}>Canal</label>
                    <select className={Z.inp} value={channel} onChange={(e) => setChannel(e.target.value)}>
                        {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            <div style={{ marginTop: 12 }}>
                <label className={Z.lbl}>Changelog (markdown ok)</label>
                <textarea className={Z.inp} rows={5}
                    placeholder="- Corrigido bug X\n- Nova feature Y"
                    value={changelog} onChange={(e) => setChangelog(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                    <label className={Z.lbl}>Versão mínima compatível (opcional)</label>
                    <input className={Z.inp} placeholder="1.0.0"
                        value={minCompat} onChange={(e) => setMinCompat(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={forceUpdate}
                            onChange={(e) => setForceUpdate(e.target.checked)} />
                        <span style={{ fontSize: 13 }}>Forçar atualização (clients devem atualizar)</span>
                    </label>
                </div>
            </div>

            {err && (
                <div style={{
                    background: 'var(--danger-bg)', color: 'var(--danger)',
                    padding: 10, borderRadius: 8, marginTop: 12, fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <AlertCircle size={14} /> {err}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button className={Z.btn2} onClick={close} disabled={busy}>Cancelar</button>
                <button className={Z.btn} onClick={submit} disabled={busy}>
                    {busy ? <Spinner size={14} /> : <><Upload size={14} /> Enviar</>}
                </button>
            </div>
        </Modal>
    );
}
