// ═══════════════════════════════════════════════════════
// Library Manager — UI admin de curadoria (Sprint B4)
// Designers internos: upload, edit, publish (dev → beta → stable)
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Library, Search, Upload, Save, Trash2, ArrowUpCircle, FileJson, Image as ImageIcon,
    Box, AlertTriangle, CheckCircle2, X, Plus, Filter, Eye, Code2, Layers,
    Lock, Unlock, History, Download, Package, RotateCcw,
    Globe, Building2, Bell, GitBranch, Copy,
} from 'lucide-react';
import { PageHeader, Badge, EmptyState, Modal, ConfirmModal, Spinner, TabBar, FilterChips } from '../../ui';
import api from '../../api';

const CHANNEL_COLOR = { dev: '#64748b', beta: '#f59e0b', stable: '#10b981' };
const STATUS_COLOR  = { draft: '#94a3b8', published: '#10b981', deprecated: '#ef4444' };

// Helper — multipart fetch (api helper só faz JSON)
async function uploadAdmin(method, path, { fields = {}, files = [] } = {}) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => v != null && fd.append(k, v));
    for (const { field, file } of files) if (file) fd.append(field, file);
    const token = localStorage.getItem('erp_token');
    const res = await fetch(`/api${path}`, {
        method, body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw { status: res.status, ...data };
    return data;
}

export default function LibraryManager({ notify, user }) {
    const role = user?.role || '';
    const isAdmin   = role === 'admin';
    const isCurator = role === 'admin' || role === 'library_curator';

    // List state
    const [modules, setModules]   = useState([]);
    const [loading, setLoading]   = useState(false);
    const [filters, setFilters]   = useState({ q: '', channel: '', category: '', status: '' });
    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail]     = useState(null);
    const [activeTab, setActiveTab] = useState('preview');
    const [showNewModal, setShowNewModal] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    // Editor state
    const [jsonDraft, setJsonDraft] = useState('');
    const [jsonError, setJsonError] = useState(null);
    const [saving, setSaving]       = useState(false);

    // Lock + history state (LIB-EDIT)
    const [lockInfo, setLockInfo]     = useState(null);   // { lock_token, expires_at, ownedByMe }
    const [lockChecking, setLockChecking] = useState(false);
    const [versions, setVersions]     = useState([]);
    const [importing, setImporting]   = useState(false);
    const [validationModal, setValidationModal] = useState(null); // {errors, warnings}
    const heartbeatRef = useRef(null);

    // LIB-VARIATION state
    const [includeVariations, setIncludeVariations] = useState(true);
    const [originUpdates, setOriginUpdates] = useState([]); // pending notifications
    const [duplicateModal, setDuplicateModal] = useState(null); // origin module to duplicate
    const [showOriginTab, setShowOriginTab] = useState(false);

    const reloadList = useCallback(async () => {
        if (!isCurator) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams();
            for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
            if (includeVariations) qs.set('include_variations', 'true');
            const r = await api.get(`/library/admin/modules?${qs.toString()}`);
            setModules(r.modules || []);
        } catch (e) {
            notify?.(e.error || 'Erro ao listar', 'error');
        } finally { setLoading(false); }
    }, [filters, isCurator, notify, includeVariations]);

    // LIB-VARIATION — carrega origin-updates pendentes
    const reloadOriginUpdates = useCallback(async () => {
        if (!isCurator) return;
        try {
            const r = await api.get('/library/admin/origin-updates');
            setOriginUpdates(r.updates || []);
        } catch (e) {
            // silencioso — feature opt-in
        }
    }, [isCurator]);
    useEffect(() => { reloadOriginUpdates(); }, [reloadOriginUpdates]);

    const reloadDetail = useCallback(async (id) => {
        if (!id) { setDetail(null); return; }
        try {
            const r = await api.get(`/library/admin/modules/${encodeURIComponent(id)}`);
            setDetail(r);
            setJsonDraft(JSON.stringify(r.json_content || {}, null, 2));
            setJsonError(null);
        } catch (e) {
            notify?.(e.error || 'Erro ao carregar', 'error');
        }
    }, [notify]);

    useEffect(() => { reloadList(); }, [reloadList]);
    useEffect(() => { reloadDetail(selectedId); }, [selectedId, reloadDetail]);

    // Categorias derivadas
    const categories = useMemo(() => {
        const set = new Set(modules.map(m => m.category).filter(Boolean));
        return Array.from(set).sort();
    }, [modules]);

    // ── Save JSON edit ─────────────────────────────────────
    const handleSaveJson = async () => {
        if (!detail?.module) return;
        let data;
        try { data = JSON.parse(jsonDraft); }
        catch (e) { setJsonError('JSON inválido: ' + e.message); return; }

        setSaving(true);
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const file = new File([blob], `${detail.module.id}.json`, { type: 'application/json' });
            const r = await uploadAdmin('PUT', `/library/admin/modules/${encodeURIComponent(detail.module.id)}`, {
                files: [{ field: 'json_file', file }],
            });
            notify?.('Módulo atualizado', 'success');
            setDetail(d => ({ ...d, module: r.module }));
            await reloadList();
        } catch (e) {
            const msg = e.errors ? e.errors.join(', ') : (e.error || 'Erro ao salvar');
            notify?.(msg, 'error');
            setJsonError(msg);
        } finally { setSaving(false); }
    };

    // ── Publish ────────────────────────────────────────────
    const handlePublish = async (channel) => {
        if (!detail?.module) return;
        if (channel === 'stable' && !isAdmin) {
            notify?.('Apenas admin master publica em stable', 'error');
            return;
        }
        try {
            const r = await api.patch(`/library/admin/modules/${encodeURIComponent(detail.module.id)}/publish`,
                { channel, status: 'published' });
            notify?.(`Publicado em ${channel}` + (r.library_version ? ` (v${r.library_version})` : ''), 'success');
            setDetail(d => ({ ...d, module: r.module }));
            await reloadList();
        } catch (e) {
            notify?.(e.error || 'Erro ao publicar', 'error');
        }
    };

    // ── Delete ─────────────────────────────────────────────
    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            await api.del(`/library/admin/modules/${encodeURIComponent(confirmDelete)}`);
            notify?.('Módulo removido', 'success');
            setConfirmDelete(null);
            setSelectedId(null);
            await reloadList();
        } catch (e) {
            notify?.(e.error || 'Erro ao remover', 'error');
        }
    };

    // ── Checkout / Checkin / Heartbeat / Versions (LIB-EDIT) ───────────
    const reloadVersions = useCallback(async (id) => {
        if (!id) { setVersions([]); return; }
        try {
            const r = await api.get(`/library/admin/modules/${encodeURIComponent(id)}/versions?limit=50`);
            setVersions(r.versions || []);
        } catch (e) {
            // silencioso — aba História pode estar desligada
        }
    }, []);

    useEffect(() => { reloadVersions(selectedId); setLockInfo(null); }, [selectedId, reloadVersions]);

    // Heartbeat: a cada 5 min, renova se aba ativa e somos donos
    useEffect(() => {
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        if (!lockInfo?.ownedByMe || !detail?.module?.id) return;
        const id = detail.module.id;
        heartbeatRef.current = setInterval(async () => {
            if (document.hidden) return;
            try {
                const r = await api.post(`/library/admin/modules/${encodeURIComponent(id)}/heartbeat`, {});
                setLockInfo(li => li ? { ...li, expires_at: r.expires_at } : li);
            } catch {
                setLockInfo(null);
                notify?.('Lock expirado — refaça checkout', 'warning');
            }
        }, 5 * 60 * 1000);
        return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
    }, [lockInfo?.ownedByMe, detail?.module?.id, notify]);

    const handleCheckout = async () => {
        if (!detail?.module) return;
        setLockChecking(true);
        try {
            const r = await api.post(`/library/admin/modules/${encodeURIComponent(detail.module.id)}/checkout`,
                { reason: 'Edição via UI' });
            setLockInfo({ ...r, ownedByMe: true });
            notify?.('Bloqueado por 30min — abra no SketchUp e edite', 'success');
        } catch (e) {
            if (e.status === 409) {
                notify?.(`Em edição por ${e.locked_by_name}`, 'error');
            } else {
                notify?.(e.error || 'Erro no checkout', 'error');
            }
        } finally { setLockChecking(false); }
    };

    const handleRelease = async (forced = false) => {
        if (!detail?.module) return;
        try {
            await api.post(`/library/admin/modules/${encodeURIComponent(detail.module.id)}/release`, {});
            setLockInfo(null);
            notify?.(forced ? 'Lock forçado liberado' : 'Edição cancelada', 'success');
        } catch (e) { notify?.(e.error || 'Erro', 'error'); }
    };

    const handleCheckin = async () => {
        if (!detail?.module) return;
        let data;
        try { data = JSON.parse(jsonDraft); }
        catch (e) { setJsonError('JSON inválido: ' + e.message); return; }
        setSaving(true);
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const file = new File([blob], `${detail.module.id}.json`, { type: 'application/json' });
            const r = await uploadAdmin('POST', `/library/admin/modules/${encodeURIComponent(detail.module.id)}/checkin`, {
                fields: { version_notes: 'edit via UI' },
                files: [{ field: 'json', file }],
            });
            notify?.(`Nova versão ${r.new_version} salva`, 'success');
            if (r.warnings?.length) {
                setValidationModal({ errors: [], warnings: r.warnings });
            }
            setLockInfo(null);
            setDetail(d => ({ ...d, module: r.module }));
            await reloadList();
            await reloadVersions(detail.module.id);
        } catch (e) {
            if (e.errors?.length || e.warnings?.length) {
                setValidationModal({ errors: e.errors || [], warnings: e.warnings || [] });
            } else {
                notify?.(e.error || 'Erro no checkin', 'error');
            }
        } finally { setSaving(false); }
    };

    const handleRollback = async (versionId) => {
        if (!detail?.module) return;
        if (!isAdmin) { notify?.('Apenas admin master', 'error'); return; }
        if (!confirm(`Rollback para a versão ID ${versionId}? Cria nova versão com snapshot antigo.`)) return;
        try {
            const r = await api.post(
                `/library/admin/modules/${encodeURIComponent(detail.module.id)}/rollback/${versionId}`, {});
            notify?.(`Rollback OK — nova versão ${r.new_version}`, 'success');
            setDetail(d => ({ ...d, module: r.module }));
            await reloadList();
            await reloadVersions(detail.module.id);
            await reloadDetail(detail.module.id);
        } catch (e) { notify?.(e.error || 'Erro no rollback', 'error'); }
    };

    const handleExportZip = (id) => {
        if (!id) return;
        const url = `/api/library/admin/modules/${encodeURIComponent(id)}/export.zip`;
        const token = localStorage.getItem('erp_token');
        // Fetch + download (precisa do bearer)
        fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
            .then(r => r.ok ? r.blob() : Promise.reject(r.statusText))
            .then(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${id}.zip`;
                document.body.appendChild(a); a.click(); a.remove();
            })
            .catch(e => notify?.(`Erro export: ${e}`, 'error'));
    };

    const handleImportZip = async (file) => {
        if (!file) return;
        setImporting(true);
        try {
            const r = await uploadAdmin('POST', `/library/admin/import`, {
                fields: { channel: 'dev' },
                files: [{ field: 'file', file }],
            });
            notify?.(`Importado: ${r.module.id}`, 'success');
            if (r.warnings?.length) setValidationModal({ errors: [], warnings: r.warnings });
            await reloadList();
            setSelectedId(r.module.id);
        } catch (e) {
            if (e.errors?.length) setValidationModal({ errors: e.errors, warnings: e.warnings || [] });
            else notify?.(e.error || 'Erro no import', 'error');
        } finally { setImporting(false); }
    };

    // ── LIB-VARIATION handlers ──────────────────────────────
    const handleDuplicateForShop = async (originId, payload) => {
        try {
            const r = await api.post(
                `/library/admin/modules/${encodeURIComponent(originId)}/duplicate-for-shop`,
                payload || {});
            notify?.(`Variação criada: ${r.module.id}`, 'success');
            setDuplicateModal(null);
            await reloadList();
            setSelectedId(r.module.id);
        } catch (e) {
            notify?.(e.error || 'Erro ao duplicar', 'error');
        }
    };

    const handleApplyOriginUpdate = async (updateId) => {
        try {
            const r = await api.post(`/library/admin/origin-updates/${updateId}/apply`, {});
            notify?.(`Atualização aplicada — nova versão ${r.new_version}`, 'success');
            await reloadOriginUpdates();
            await reloadList();
            if (r.module?.id) await reloadDetail(r.module.id);
        } catch (e) {
            notify?.(e.error || 'Erro ao aplicar', 'error');
        }
    };

    const handleDismissOriginUpdate = async (updateId) => {
        try {
            await api.post(`/library/admin/origin-updates/${updateId}/dismiss`, {});
            notify?.('Atualização ignorada', 'success');
            await reloadOriginUpdates();
        } catch (e) {
            notify?.(e.error || 'Erro ao ignorar', 'error');
        }
    };

    // Notificações pendentes pra módulo selecionado
    const detailOriginUpdates = useMemo(() => {
        if (!detail?.module?.id) return [];
        return originUpdates.filter(u => u.variation_module_id === detail.module.id);
    }, [originUpdates, detail?.module?.id]);

    if (!isCurator) {
        return (
            <div className="p-6">
                <PageHeader icon={Library} title="Biblioteca de Módulos" subtitle="Curadoria" />
                <EmptyState icon={AlertTriangle} title="Sem permissão"
                    description="Apenas administradores e curadores podem acessar a curadoria." />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-[1600px] mx-auto" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 80px)' }}>
            <PageHeader icon={Library} title="Biblioteca de Módulos"
                subtitle="Curadoria de módulos paramétricos">
                <button className="btn-secondary" onClick={() => setShowOriginTab(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                    <Bell size={14} /> Atualizações de origem
                    {originUpdates.length > 0 && (
                        <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10,
                            padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                            {originUpdates.length}
                        </span>
                    )}
                </button>
                <label className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <Package size={14} /> {importing ? 'Importando...' : 'Importar zip'}
                    <input type="file" accept=".zip,application/zip" hidden disabled={importing}
                        onChange={e => e.target.files?.[0] && handleImportZip(e.target.files[0])} />
                </label>
                <button className="btn-primary" onClick={() => setShowNewModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} /> Novo módulo
                </button>
            </PageHeader>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) 1fr', gap: 16, flex: 1, minHeight: 0 }}>
                {/* ── Lista ── */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" placeholder="Buscar por nome, id ou categoria..."
                                value={filters.q}
                                onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                                className="input"
                                style={{ paddingLeft: 32, width: '100%' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <FilterChips
                                options={[
                                    { value: '', label: 'Todos' },
                                    { value: 'dev', label: 'Dev' },
                                    { value: 'beta', label: 'Beta' },
                                    { value: 'stable', label: 'Stable' },
                                ]}
                                value={filters.channel}
                                onChange={v => setFilters(f => ({ ...f, channel: v }))}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <FilterChips
                                options={[
                                    { value: '', label: 'Todos status' },
                                    { value: 'draft', label: 'Rascunho' },
                                    { value: 'published', label: 'Publicado' },
                                    { value: 'deprecated', label: 'Deprecado' },
                                ]}
                                value={filters.status}
                                onChange={v => setFilters(f => ({ ...f, status: v }))}
                            />
                        </div>
                        {categories.length > 0 && (
                            <select className="input" value={filters.category}
                                onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
                                <option value="">Todas categorias</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                            <input type="checkbox" checked={includeVariations}
                                onChange={e => setIncludeVariations(e.target.checked)} />
                            Incluir variações da minha marcenaria
                        </label>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                        {loading && <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>}
                        {!loading && modules.length === 0 && (
                            <EmptyState icon={Library} title="Nenhum módulo" description="Use 'Novo módulo' para criar." />
                        )}
                        {modules.map(m => (
                            <ModuleCard key={m.id} module={m}
                                selected={m.id === selectedId}
                                hasOriginUpdate={originUpdates.some(u => u.variation_module_id === m.id)}
                                onClick={() => setSelectedId(m.id)} />
                        ))}
                    </div>
                </div>

                {/* ── Detalhe ── */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {!detail && (
                        <EmptyState icon={Eye} title="Selecione um módulo"
                            description="Clique em um item da lista para ver detalhes." />
                    )}
                    {detail && (
                        <DetailPanel
                            detail={detail}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            jsonDraft={jsonDraft}
                            setJsonDraft={setJsonDraft}
                            jsonError={jsonError}
                            saving={saving}
                            isAdmin={isAdmin}
                            lockInfo={lockInfo}
                            lockChecking={lockChecking}
                            onCheckout={handleCheckout}
                            onRelease={handleRelease}
                            onCheckin={handleCheckin}
                            onExportZip={() => handleExportZip(detail.module.id)}
                            versions={versions}
                            onRollback={handleRollback}
                            onSaveJson={handleSaveJson}
                            onPublish={handlePublish}
                            onDelete={() => setConfirmDelete(detail.module.id)}
                            originUpdates={detailOriginUpdates}
                            onDuplicateForShop={() => setDuplicateModal(detail.module)}
                            onApplyOriginUpdate={handleApplyOriginUpdate}
                            onDismissOriginUpdate={handleDismissOriginUpdate}
                            onAddSkp={async (file) => {
                                try {
                                    await uploadAdmin('PUT', `/library/admin/modules/${encodeURIComponent(detail.module.id)}`, {
                                        files: [{ field: 'skp_files', file }],
                                    });
                                    notify?.('SKP enviado', 'success');
                                    await reloadDetail(detail.module.id);
                                } catch (e) { notify?.(e.error || 'Erro upload SKP', 'error'); }
                            }}
                            onReplaceThumb={async (file) => {
                                try {
                                    await uploadAdmin('PUT', `/library/admin/modules/${encodeURIComponent(detail.module.id)}`, {
                                        files: [{ field: 'thumbnail', file }],
                                    });
                                    notify?.('Thumbnail atualizado', 'success');
                                    await reloadDetail(detail.module.id);
                                    await reloadList();
                                } catch (e) { notify?.(e.error || 'Erro upload thumb', 'error'); }
                            }}
                        />
                    )}
                </div>
            </div>

            {showNewModal && (
                <NewModuleModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={async (id) => {
                        setShowNewModal(false);
                        await reloadList();
                        setSelectedId(id);
                    }}
                    notify={notify}
                />
            )}

            {validationModal && (
                <Modal title="Resultado da validação" close={() => setValidationModal(null)} w={560}>
                    <div style={{ padding: 8, maxHeight: 420, overflowY: 'auto' }}>
                        {validationModal.errors?.length > 0 && (
                            <div style={{ padding: 12, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 6, marginBottom: 10 }}>
                                <strong>Erros bloqueantes:</strong>
                                <ul style={{ margin: '6px 0 0 18px', fontSize: 13 }}>
                                    {validationModal.errors.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}
                        {validationModal.warnings?.length > 0 && (
                            <div style={{ padding: 12, background: 'var(--warning-bg, #fef3c7)', color: 'var(--warning, #92400e)', borderRadius: 6 }}>
                                <strong>Avisos:</strong>
                                <ul style={{ margin: '6px 0 0 18px', fontSize: 13 }}>
                                    {validationModal.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        )}
                        {!validationModal.errors?.length && !validationModal.warnings?.length && (
                            <div style={{ color: 'var(--text-muted)' }}>Sem mensagens.</div>
                        )}
                    </div>
                </Modal>
            )}

            {duplicateModal && (
                <DuplicateForShopModal
                    origin={duplicateModal}
                    onClose={() => setDuplicateModal(null)}
                    onConfirm={(payload) => handleDuplicateForShop(duplicateModal.id, payload)}
                />
            )}

            {showOriginTab && (
                <OriginUpdatesModal
                    updates={originUpdates}
                    onApply={handleApplyOriginUpdate}
                    onDismiss={handleDismissOriginUpdate}
                    onClose={() => setShowOriginTab(false)}
                />
            )}

            {confirmDelete && (
                <ConfirmModal
                    title="Remover módulo?"
                    message={`O módulo "${confirmDelete}" será marcado como removido (soft delete). Pode ser restaurado por SQL se necessário.`}
                    confirmLabel="Remover"
                    danger
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
function ModuleCard({ module: m, selected, onClick, hasOriginUpdate }) {
    const channelColor = CHANNEL_COLOR[m.channel] || '#64748b';
    const statusColor  = STATUS_COLOR[m.status]   || '#64748b';
    const isPrivate = m.visibility === 'private_org';
    return (
        <div onClick={onClick} style={{
            padding: 10, borderRadius: 8, cursor: 'pointer', marginBottom: 6,
            display: 'flex', gap: 10, alignItems: 'center',
            background: selected ? 'var(--bg-hover)' : 'transparent',
            border: selected ? '1px solid var(--primary)'
                  : (hasOriginUpdate ? '1px solid #ef4444' : '1px solid transparent'),
            transition: 'background 0.15s, border 0.15s', position: 'relative',
        }}>
            {hasOriginUpdate && (
                <Bell size={14} color="#ef4444"
                    style={{ position: 'absolute', top: 6, right: 6 }}
                    title="Origem atualizada — revise" />
            )}
            <div style={{
                width: 44, height: 44, borderRadius: 6, flexShrink: 0,
                background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
            }}>
                {m.thumbnail_url ? (
                    <img src={m.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : <Box size={20} color="var(--text-muted)" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {m.category} · v{m.version}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    <Badge label={m.channel} color={channelColor} />
                    <Badge label={m.status} color={statusColor} />
                    {isPrivate
                        ? <Badge label="privado marcenaria" color="#7c3aed" />
                        : <Badge label="global" color="#0ea5e9" />}
                    {m.deleted_at && <Badge label="deletado" color="#ef4444" />}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
function DetailPanel({ detail, activeTab, onTabChange, jsonDraft, setJsonDraft, jsonError, saving,
                      isAdmin, onSaveJson, onPublish, onDelete, onAddSkp, onReplaceThumb,
                      lockInfo, lockChecking, onCheckout, onRelease, onCheckin, onExportZip,
                      versions = [], onRollback,
                      originUpdates = [], onDuplicateForShop, onApplyOriginUpdate, onDismissOriginUpdate }) {
    const m = detail.module;
    const skpInputRef = useRef();
    const thumbInputRef = useRef();

    return (
        <>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{m.name}</h2>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            <code>{m.id}</code> · {m.category} · v{m.version}
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Badge label={m.channel} color={CHANNEL_COLOR[m.channel]} />
                        <Badge label={m.status} color={STATUS_COLOR[m.status]} />
                        {m.visibility === 'private_org'
                            ? <Badge label="privado marcenaria" color="#7c3aed" />
                            : <Badge label="global" color="#0ea5e9" />}
                    </div>
                </div>

                {/* Vínculo com origem (variação) */}
                {m.derived_from && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)',
                                  display: 'flex', alignItems: 'center', gap: 6 }}>
                        <GitBranch size={12} />
                        Variação derivada de <code>{m.derived_from}</code> (v{m.derived_from_version || '?'})
                    </div>
                )}

                {/* Notificação de origem atualizada */}
                {originUpdates.length > 0 && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: '#fef2f2',
                                  color: '#991b1b', borderRadius: 6, fontSize: 12,
                                  display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bell size={14} />
                        <span>Origem atualizada de v{originUpdates[0].origin_old_version || '?'} → v{originUpdates[0].origin_new_version || '?'}.</span>
                        <button className="btn-primary" style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 8px' }}
                            onClick={() => onApplyOriginUpdate?.(originUpdates[0].id)}>
                            Aplicar mantendo customizações
                        </button>
                        <button className="btn-ghost" style={{ fontSize: 11 }}
                            onClick={() => onDismissOriginUpdate?.(originUpdates[0].id)}>
                            Ignorar
                        </button>
                    </div>
                )}

                {/* Lock banner */}
                {lockInfo?.ownedByMe && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--warning-bg, #fef3c7)',
                                  color: 'var(--warning, #92400e)', borderRadius: 6, fontSize: 12,
                                  display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Lock size={14} />
                        <span>Bloqueado por você até <strong>{new Date(lockInfo.expires_at).toLocaleTimeString()}</strong> — abra o .skp no SketchUp, edite e salve nova versão.</span>
                        <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: 11 }}
                                onClick={() => onRelease(false)}>
                            <Unlock size={12} /> Cancelar
                        </button>
                    </div>
                )}
            </div>

            <TabBar
                tabs={[
                    { id: 'preview', label: 'Preview', icon: Eye },
                    { id: 'json',    label: 'JSON',    icon: Code2 },
                    { id: 'assets',  label: 'Assets',  icon: Layers },
                    { id: 'history', label: 'Histórico', icon: FileJson },
                ]}
                active={activeTab}
                onChange={onTabChange}
            />

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {activeTab === 'preview' && (
                    <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, marginBottom: 16 }}>
                            <div style={{ width: 180, height: 180, background: 'var(--bg-muted)',
                                          borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          overflow: 'hidden', position: 'relative' }}>
                                {m.thumbnail_url ? (
                                    <img src={m.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : <ImageIcon size={42} color="var(--text-muted)" />}
                                <input ref={thumbInputRef} type="file" accept="image/png,image/jpeg" hidden
                                    onChange={e => e.target.files?.[0] && onReplaceThumb(e.target.files[0])} />
                                <button onClick={() => thumbInputRef.current?.click()}
                                    className="btn-ghost"
                                    style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10, padding: '4px 8px' }}>
                                    Trocar
                                </button>
                            </div>
                            <div>
                                <MetaRow label="Tags"     value={(m.tags || []).join(', ') || '—'} />
                                <MetaRow label="Largura"  value={m.largura_min != null ? `${m.largura_min}–${m.largura_max} mm` : '—'} />
                                <MetaRow label="Altura"   value={m.altura_min  != null ? `${m.altura_min}–${m.altura_max} mm`  : '—'} />
                                <MetaRow label="Profund." value={m.profundidade_min != null ? `${m.profundidade_min}–${m.profundidade_max} mm` : '—'} />
                                <MetaRow label="Portas"   value={m.n_portas  ?? '—'} />
                                <MetaRow label="Gavetas"  value={m.n_gavetas ?? '—'} />
                                <MetaRow label="SHA-256"  value={<code style={{ fontSize: 10 }}>{m.sha256.slice(0, 16)}…</code>} />
                                <MetaRow label="Tamanho"  value={`${(m.size_bytes / 1024).toFixed(1)} KB`} />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'json' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {jsonError && (
                            <div style={{ padding: 8, marginBottom: 8, background: 'var(--danger-bg)',
                                          color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>
                                <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />
                                {jsonError}
                            </div>
                        )}
                        <textarea
                            value={jsonDraft}
                            onChange={e => { setJsonDraft(e.target.value); }}
                            spellCheck={false}
                            style={{
                                flex: 1, minHeight: 380, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                                fontSize: 12, lineHeight: 1.5, padding: 12, borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)',
                                resize: 'vertical', whiteSpace: 'pre',
                            }}
                        />
                    </div>
                )}

                {activeTab === 'assets' && (
                    <div>
                        <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Arquivos .skp linkados</h4>
                        {(!m.skp_refs || m.skp_refs.length === 0) && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>Nenhum SKP linkado.</div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                            {(m.skp_refs || []).map((skp, i) => (
                                <div key={i} style={{ padding: 8, background: 'var(--bg-muted)', borderRadius: 6,
                                                       fontFamily: 'monospace', fontSize: 12, display: 'flex',
                                                       justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{skp}</span>
                                    <a href={`/api/library/asset/${encodeURIComponent(skp)}`} target="_blank" rel="noreferrer"
                                       style={{ fontSize: 11 }}>baixar</a>
                                </div>
                            ))}
                        </div>
                        <input ref={skpInputRef} type="file" accept=".skp" hidden
                            onChange={e => e.target.files?.[0] && onAddSkp(e.target.files[0])} />
                        <button className="btn-secondary" onClick={() => skpInputRef.current?.click()}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Upload size={14} /> Adicionar .skp
                        </button>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div>
                        <MetaRow label="Criado"     value={m.created_at} />
                        <MetaRow label="Atualizado" value={m.updated_at} />
                        {m.deleted_at && <MetaRow label="Removido" value={m.deleted_at} />}

                        <h4 style={{ marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
                            Versões ({versions.length})
                        </h4>
                        {versions.length === 0 && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                Nenhuma versão registrada. As próximas edições via <em>Editar → Salvar nova versão</em> aparecerão aqui.
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {versions.map(v => (
                                <div key={v.id} style={{
                                    padding: 10, background: 'var(--bg-muted)', borderRadius: 6,
                                    display: 'flex', alignItems: 'center', gap: 12, fontSize: 12,
                                    border: v.status === 'rolled_back' ? '1px dashed #ef4444' : '1px solid transparent',
                                    opacity: v.status === 'rolled_back' ? 0.7 : 1,
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600 }}>v{v.version} <Badge label={v.status} color={STATUS_COLOR[v.status] || '#64748b'} /></div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                                            {v.created_at} · sha {v.sha256?.slice(0, 12)}…
                                            {v.notes && <> · <em>{v.notes}</em></>}
                                        </div>
                                    </div>
                                    {isAdmin && v.status !== 'rolled_back' && (
                                        <button className="btn-ghost" style={{ fontSize: 11 }}
                                                onClick={() => onRollback(v.id)}>
                                            <RotateCcw size={12} /> Rollback
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer ações */}
            <div style={{ padding: 12, borderTop: '1px solid var(--border)',
                          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {!lockInfo?.ownedByMe && (
                    <button className="btn-secondary" onClick={onCheckout} disabled={lockChecking}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Lock size={14} /> {lockChecking ? 'Bloqueando...' : 'Editar (checkout)'}
                    </button>
                )}
                {lockInfo?.ownedByMe && (
                    <button className="btn-primary" onClick={onCheckin} disabled={saving}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Save size={14} /> {saving ? 'Salvando...' : 'Salvar nova versão (checkin)'}
                    </button>
                )}
                <button className="btn-ghost" onClick={onExportZip}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={14} /> Exportar zip
                </button>
                {m.visibility !== 'private_org' && onDuplicateForShop && (
                    <button className="btn-secondary" onClick={onDuplicateForShop}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        title="Cria uma cópia privada da sua marcenaria, vinculada à origem">
                        <Copy size={14} /> Duplicar pra minha marcenaria
                    </button>
                )}
                {activeTab === 'json' && !lockInfo?.ownedByMe && (
                    <button className="btn-ghost" onClick={onSaveJson} disabled={saving}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Save size={14} /> {saving ? 'Salvando...' : 'Salvar rascunho (legado)'}
                    </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn-secondary" onClick={() => onPublish('beta')}
                        disabled={m.channel === 'stable'}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowUpCircle size={14} /> Publicar em beta
                    </button>
                    <button className="btn-primary" onClick={() => onPublish('stable')}
                        disabled={!isAdmin}
                        title={!isAdmin ? 'Apenas admin master' : ''}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} /> Publicar em stable
                    </button>
                    {isAdmin && (
                        <button className="btn-danger" onClick={onDelete}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Trash2 size={14} /> Remover
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}

function MetaRow({ label, value }) {
    return (
        <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
            <span style={{ width: 100, color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{value}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// New module wizard (5 steps)
// ═══════════════════════════════════════════════════════
function NewModuleModal({ onClose, onCreated, notify }) {
    const [step, setStep] = useState(1);
    const [jsonFile, setJsonFile] = useState(null);
    const [jsonText, setJsonText] = useState('');
    const [validation, setValidation] = useState(null);
    const [skpFiles, setSkpFiles] = useState([]);
    const [thumbFile, setThumbFile] = useState(null);
    const [channel, setChannel] = useState('dev');
    const [submitting, setSubmitting] = useState(false);

    const handleJsonFile = async (file) => {
        setJsonFile(file);
        const text = await file.text();
        setJsonText(text);
    };

    const validate = async () => {
        if (!jsonFile) return;
        try {
            const r = await uploadAdmin('POST', '/library/admin/validate', {
                files: [{ field: 'json_file', file: jsonFile }],
            });
            setValidation(r);
            if (r.ok) setStep(3);
        } catch (e) {
            setValidation({ ok: false, errors: [e.error || 'Erro de validação'] });
        }
    };

    const submit = async () => {
        setSubmitting(true);
        try {
            const r = await uploadAdmin('POST', '/library/admin/modules', {
                fields: { channel, status: 'draft' },
                files: [
                    { field: 'json_file', file: jsonFile },
                    ...(thumbFile ? [{ field: 'thumbnail', file: thumbFile }] : []),
                    ...skpFiles.map(f => ({ field: 'skp_files', file: f })),
                ],
            });
            notify?.('Módulo criado', 'success');
            onCreated(r.module.id);
        } catch (e) {
            notify?.(e.errors ? e.errors.join(', ') : (e.error || 'Erro'), 'error');
        } finally { setSubmitting(false); }
    };

    return (
        <Modal title={`Novo módulo — passo ${step}/5`} close={onClose} w={620}>
            <div style={{ padding: 4, minHeight: 320 }}>
                {step === 1 && (
                    <div>
                        <h4 style={{ marginTop: 0 }}>1. Upload do JSON paramétrico</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                            Arraste o arquivo <code>.json</code> que define o módulo (id, parametros, pecas, ferragens_auto).
                        </p>
                        <FileDrop accept=".json,application/json" onFile={handleJsonFile}
                            label={jsonFile ? jsonFile.name : 'Solte ou clique para selecionar JSON'} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                            <button className="btn-primary" disabled={!jsonFile} onClick={() => { validate(); setStep(2); }}>
                                Próximo
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div>
                        <h4 style={{ marginTop: 0 }}>2. Validação do schema</h4>
                        {!validation && <Spinner text="Validando..." />}
                        {validation?.ok && (
                            <div style={{ padding: 12, background: 'var(--success-bg)', color: 'var(--success)',
                                          borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle2 size={18} /> JSON válido — id: <code>{validation.id}</code>
                            </div>
                        )}
                        {validation && !validation.ok && (
                            <div style={{ padding: 12, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 6 }}>
                                <strong>Erros encontrados:</strong>
                                <ul style={{ margin: '6px 0 0 18px', fontSize: 13 }}>
                                    {(validation.errors || []).map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                            <button className="btn-ghost" onClick={() => setStep(1)}>Voltar</button>
                            <button className="btn-primary" disabled={!validation?.ok} onClick={() => setStep(3)}>
                                Próximo
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div>
                        <h4 style={{ marginTop: 0 }}>3. Arquivos .skp linkados (opcional)</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                            Envie os modelos SketchUp referenciados em <code>componente_3d</code>. Pule se não houver.
                        </p>
                        <input type="file" accept=".skp" multiple
                            onChange={e => setSkpFiles(Array.from(e.target.files || []))} />
                        {skpFiles.length > 0 && (
                            <ul style={{ marginTop: 8, fontSize: 12 }}>
                                {skpFiles.map(f => <li key={f.name}>{f.name} ({(f.size/1024).toFixed(1)} KB)</li>)}
                            </ul>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                            <button className="btn-ghost" onClick={() => setStep(2)}>Voltar</button>
                            <button className="btn-primary" onClick={() => setStep(4)}>Próximo</button>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div>
                        <h4 style={{ marginTop: 0 }}>4. Thumbnail (PNG, opcional)</h4>
                        <FileDrop accept="image/png,image/jpeg" onFile={setThumbFile}
                            label={thumbFile ? thumbFile.name : 'Solte PNG/JPG (recomendado 512×512)'} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                            <button className="btn-ghost" onClick={() => setStep(3)}>Voltar</button>
                            <button className="btn-primary" onClick={() => setStep(5)}>Próximo</button>
                        </div>
                    </div>
                )}

                {step === 5 && (
                    <div>
                        <h4 style={{ marginTop: 0 }}>5. Confirmação</h4>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                            Será criado como <strong>draft</strong> no canal selecionado:
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            {['dev', 'beta'].map(c => (
                                <button key={c} className={channel === c ? 'btn-primary' : 'btn-ghost'}
                                    onClick={() => setChannel(c)}>
                                    {c}
                                </button>
                            ))}
                        </div>
                        <ul style={{ fontSize: 13, lineHeight: 1.6 }}>
                            <li>JSON: <code>{jsonFile?.name}</code> ({jsonText.length} bytes)</li>
                            <li>SKPs: {skpFiles.length}</li>
                            <li>Thumbnail: {thumbFile ? thumbFile.name : '—'}</li>
                            <li>Canal inicial: <strong>{channel}</strong></li>
                        </ul>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                            <button className="btn-ghost" onClick={() => setStep(4)} disabled={submitting}>Voltar</button>
                            <button className="btn-primary" onClick={submit} disabled={submitting}>
                                {submitting ? 'Criando...' : 'Criar módulo'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════
// LIB-VARIATION — modais
// ═══════════════════════════════════════════════════════
function DuplicateForShopModal({ origin, onClose, onConfirm }) {
    const [name, setName] = useState(`${origin.name} (custom)`);
    const [newId, setNewId] = useState(`${origin.id}_custom`);
    const [submitting, setSubmitting] = useState(false);
    const submit = async () => {
        setSubmitting(true);
        try { await onConfirm({ name, new_id: newId }); }
        finally { setSubmitting(false); }
    };
    return (
        <Modal title="Duplicar pra minha marcenaria" close={onClose} w={520}>
            <div style={{ padding: 8 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    Cria uma cópia privada deste bloco vinculada à origem. Você pode editar livremente.
                    Quando a origem (Ornato) atualizar, você recebe notificação pra aplicar ou ignorar.
                </p>
                <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nome da variação</label>
                    <input className="input" value={name} onChange={e => setName(e.target.value)}
                        style={{ width: '100%' }} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID novo</label>
                    <input className="input" value={newId} onChange={e => setNewId(e.target.value)}
                        style={{ width: '100%', fontFamily: 'monospace' }} />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Origem: <code>{origin.id}</code> v{origin.version}
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button className="btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
                    <button className="btn-primary" onClick={submit} disabled={submitting || !name || !newId}>
                        {submitting ? 'Duplicando...' : 'Criar variação'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function OriginUpdatesModal({ updates, onApply, onDismiss, onClose }) {
    return (
        <Modal title={`Atualizações de origem (${updates.length})`} close={onClose} w={680}>
            <div style={{ padding: 8, maxHeight: 480, overflowY: 'auto' }}>
                {updates.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>
                        Sem atualizações pendentes. Quando a Ornato publicar uma nova versão de
                        um bloco que você customizou, ela aparece aqui.
                    </div>
                )}
                {updates.map(u => (
                    <div key={u.id} style={{
                        padding: 12, marginBottom: 8, border: '1px solid var(--border)',
                        borderRadius: 6, background: 'var(--bg-muted)', fontSize: 13,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>
                                    <Building2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                                    {u.variation_name || u.variation_module_id}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                                    Origem: <code>{u.origin_module_id}</code>
                                    {' — v'}{u.origin_old_version || '?'} → v{u.origin_new_version || u.origin_current_version || '?'}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                                    Detectado: {u.detected_at}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button className="btn-primary" style={{ fontSize: 12 }}
                                    onClick={() => onApply(u.id)}>
                                    Aplicar
                                </button>
                                <button className="btn-ghost" style={{ fontSize: 12 }}
                                    onClick={() => onDismiss(u.id)}>
                                    Ignorar
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}

function FileDrop({ accept, onFile, label }) {
    const inputRef = useRef();
    const [drag, setDrag] = useState(false);
    return (
        <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
            }}
            style={{
                padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                border: `2px dashed ${drag ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 8, background: drag ? 'var(--bg-hover)' : 'transparent',
                transition: 'all 0.15s',
            }}>
            <Upload size={28} color="var(--text-muted)" />
            <div style={{ marginTop: 8, fontSize: 13 }}>{label}</div>
            <input ref={inputRef} type="file" accept={accept} hidden
                onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
    );
}
