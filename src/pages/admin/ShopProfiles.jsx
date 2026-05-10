// ═══════════════════════════════════════════════════════
// Shop Profiles — UI admin de Padrões Técnicos da Marcenaria (Sprint SHOP-4)
// Edita profiles que o plugin SketchUp consome via GET /api/shop/config
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Wrench, Plus, Save, Trash2, CheckCircle2, Copy, AlertTriangle, Settings2,
    Ruler, Box, Layers, Hash, Drill, Package, Palette, Code2, RefreshCw,
} from 'lucide-react';
import {
    Z, PageHeader, Modal, ConfirmModal, Spinner, EmptyState, Badge, TabBar,
} from '../../ui';
import api from '../../api';

// ─── Schema das chaves (espelha SCALAR_COLUMNS do backend shop.js) ────────
// type: number | text | bool | select  · unit: '' | 'mm' | '°'  · min/max
const KEY_SCHEMA = {
    // Folgas e Bordas
    folga_porta_lateral:    { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Folga lateral entre porta e carcaça' },
    folga_porta_vertical:   { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Folga vertical da porta (topo/base)' },
    folga_entre_portas:     { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Folga entre portas duplas' },
    folga_porta_reta:       { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Folga adicional para portas retas' },
    folga_porta_dupla:      { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Folga específica em portas duplas' },
    folga_gaveta:           { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Folga lateral total para corrediças' },
    // Fundos e Recuos
    recuo_fundo:            { type: 'number', unit: 'mm', min: 0, max: 50, tip: 'Recuo do fundo em relação à traseira' },
    profundidade_rasgo_fundo: { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Profundidade do rasgo (canal) do fundo' },
    largura_rasgo_fundo:    { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Largura do rasgo do fundo' },
    // Rodapé e Espessuras
    altura_rodape:          { type: 'number', unit: 'mm', min: 0, max: 300, tip: 'Altura do rodapé padrão' },
    rodape_altura_padrao:   { type: 'number', unit: 'mm', min: 0, max: 300, tip: 'Alias compatibilidade — altura rodapé' },
    espessura:              { type: 'number', unit: 'mm', min: 0, max: 50, tip: 'Espessura genérica de chapa' },
    espessura_padrao:       { type: 'number', unit: 'mm', min: 0, max: 50, tip: 'Espessura padrão peças' },
    espessura_chapa_padrao: { type: 'number', unit: 'mm', min: 0, max: 50, tip: 'Espessura padrão da chapa de MDF' },
    // System 32
    sistema32_offset:       { type: 'number', unit: 'mm', min: 0, max: 100, tip: 'Distância da borda até o primeiro furo (System 32)' },
    sistema32_passo:        { type: 'number', unit: 'mm', min: 0, max: 100, tip: 'Espaçamento entre furos (32 mm clássico)' },
    sistema32_ativo:        { type: 'bool',   tip: 'Ativa malha System 32 nos módulos' },
    // Cavilha
    cavilha_diametro:       { type: 'number', unit: 'mm', min: 0, max: 20, tip: 'Diâmetro da cavilha padrão' },
    cavilha_profundidade:   { type: 'number', unit: 'mm', min: 0, max: 50, tip: 'Profundidade do furo de cavilha' },
    // Hardware
    dobradica_padrao:       { type: 'text', tip: 'Modelo/SKU da dobradiça padrão' },
    corredica_padrao:       { type: 'text', tip: 'Modelo/SKU da corrediça padrão' },
    puxador_padrao:         { type: 'text', tip: 'Modelo/SKU do puxador padrão' },
    minifix_padrao:         { type: 'text', tip: 'Modelo/SKU do minifix padrão' },
    // Materiais
    fita_borda_padrao:      { type: 'text', tip: 'Tipo/cor da fita de borda padrão' },
    material_carcaca_padrao:{ type: 'text', tip: 'Material padrão para carcaças' },
    material_frente_padrao: { type: 'text', tip: 'Material padrão para frentes' },
    material_fundo_padrao:  { type: 'text', tip: 'Material padrão para fundos' },
};

const TABS = [
    { id: 'folgas', label: 'Folgas e Bordas', icon: Ruler, keys: [
        'folga_porta_lateral','folga_porta_vertical','folga_entre_portas',
        'folga_porta_reta','folga_porta_dupla','folga_gaveta',
    ]},
    { id: 'fundos', label: 'Fundos e Recuos', icon: Box, keys: [
        'recuo_fundo','profundidade_rasgo_fundo','largura_rasgo_fundo',
    ]},
    { id: 'rodape', label: 'Rodapé e Espessuras', icon: Layers, keys: [
        'altura_rodape','rodape_altura_padrao','espessura','espessura_padrao','espessura_chapa_padrao',
    ]},
    { id: 'sys32',  label: 'System 32', icon: Hash, keys: [
        'sistema32_offset','sistema32_passo','sistema32_ativo',
    ]},
    { id: 'cavilha', label: 'Cavilha', icon: Drill, keys: [
        'cavilha_diametro','cavilha_profundidade',
    ]},
    { id: 'hardware', label: 'Hardware', icon: Settings2, keys: [
        'dobradica_padrao','corredica_padrao','puxador_padrao','minifix_padrao',
    ]},
    { id: 'materiais', label: 'Materiais', icon: Palette, keys: [
        'fita_borda_padrao','material_carcaca_padrao','material_frente_padrao','material_fundo_padrao',
    ]},
    { id: 'custom', label: 'Custom Keys', icon: Code2, keys: [] },
];

const VALID_KEYS = new Set(Object.keys(KEY_SCHEMA));

function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}

// ═══════════════════════════════════════════════════════
export default function ShopProfiles({ notify, user }) {
    const role = user?.role || '';
    const isAdmin = role === 'admin' || role === 'library_curator';

    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail]     = useState(null); // {id, profile_name, values, custom_keys, ...}
    const [draft, setDraft]       = useState(null); // editor working copy
    const [activeTab, setActiveTab] = useState('folgas');
    const [showOnlyActive, setShowOnlyActive] = useState(false);
    const [showNew, setShowNew]   = useState(false);
    const [confirmDel, setConfirmDel] = useState(null);
    const [saving, setSaving]     = useState(false);
    const [customJsonText, setCustomJsonText] = useState('{}');
    const [customJsonErr, setCustomJsonErr]   = useState(null);

    // ── Load list ───────────────────────────────────────
    const reloadList = useCallback(async () => {
        if (!isAdmin) return;
        setLoading(true);
        try {
            const r = await api.get('/shop/profiles');
            setProfiles(r.profiles || []);
            // se nada selecionado, escolhe o ativo
            if (!selectedId && r.profiles?.length) {
                const active = r.profiles.find(p => p.is_active) || r.profiles[0];
                setSelectedId(active.id);
            }
        } catch (e) {
            notify?.(e.error || 'Erro ao listar profiles', 'error');
        } finally { setLoading(false); }
    }, [isAdmin, notify, selectedId]);

    // ── Load detail ─────────────────────────────────────
    const reloadDetail = useCallback(async (id) => {
        if (!id) { setDetail(null); setDraft(null); return; }
        try {
            // Não há endpoint GET /:id — buscamos via /config quando ativo, senão derivamos da lista.
            // Para edição completa, fazemos PUT minimal só com nome p/ pegar dto. Mas mais simples:
            // re-listar e usar /config se o selecionado for o ativo. Para outros, fazemos GET via PUT
            // com nada — backend retorna 400. Solução: fetch /config e match por ID; se não bate,
            // PUT com {name: name_atual} é idempotente e devolve o dto completo.
            const list = await api.get('/shop/profiles');
            const item = (list.profiles || []).find(p => p.id === id);
            if (!item) throw { error: 'profile não encontrado' };

            let dto;
            if (item.is_active) {
                dto = await api.get('/shop/config');
            } else {
                // PUT com nome atual = no-op funcional, devolve DTO. Usa mesmo endpoint por economia.
                dto = await api.put(`/shop/profiles/${id}`, { name: item.name });
            }
            setDetail(dto);
            setDraft({
                profile_name: dto.profile_name,
                values: { ...dto.values },
                custom_keys: dto.custom_keys || {},
            });
            setCustomJsonText(JSON.stringify(dto.custom_keys || {}, null, 2));
            setCustomJsonErr(null);
        } catch (e) {
            notify?.(e.error || 'Erro ao carregar profile', 'error');
        }
    }, [notify]);

    useEffect(() => { reloadList(); }, [isAdmin]); // eslint-disable-line
    useEffect(() => { reloadDetail(selectedId); }, [selectedId, reloadDetail]);

    // ── Filtros ─────────────────────────────────────────
    const visibleProfiles = useMemo(() => {
        return showOnlyActive ? profiles.filter(p => p.is_active) : profiles;
    }, [profiles, showOnlyActive]);

    // ── Actions ─────────────────────────────────────────
    const dirty = useMemo(() => {
        if (!detail || !draft) return false;
        if (draft.profile_name !== detail.profile_name) return true;
        for (const k of Object.keys(KEY_SCHEMA)) {
            if (draft.values[k] !== detail.values[k]) return true;
        }
        if (JSON.stringify(draft.custom_keys || {}) !== JSON.stringify(detail.custom_keys || {})) return true;
        return false;
    }, [detail, draft]);

    function setValue(key, val) {
        setDraft(d => ({ ...d, values: { ...d.values, [key]: val } }));
    }

    async function save() {
        if (!detail || !draft) return;
        // valida custom JSON
        let custom;
        try {
            custom = JSON.parse(customJsonText || '{}');
            if (typeof custom !== 'object' || Array.isArray(custom)) throw new Error('deve ser objeto JSON');
            setCustomJsonErr(null);
        } catch (e) {
            setCustomJsonErr('JSON inválido: ' + e.message);
            notify?.('Custom keys: JSON inválido', 'error');
            return;
        }

        // validação client-side: numeric >=0, chave whitelist
        const errors = [];
        const valuesPayload = {};
        for (const [k, v] of Object.entries(draft.values)) {
            if (v === undefined || v === null || v === '') continue;
            if (!VALID_KEYS.has(k)) { errors.push(`chave inválida: ${k}`); continue; }
            const sch = KEY_SCHEMA[k];
            if (sch.type === 'number') {
                const n = Number(v);
                if (!Number.isFinite(n)) { errors.push(`${k}: número inválido`); continue; }
                if (sch.min != null && n < sch.min) { errors.push(`${k}: < ${sch.min}`); continue; }
                if (sch.max != null && n > sch.max) { errors.push(`${k}: > ${sch.max}`); continue; }
                valuesPayload[k] = n;
            } else if (sch.type === 'bool') {
                valuesPayload[k] = !!v;
            } else {
                valuesPayload[k] = String(v);
            }
        }
        if (errors.length) {
            notify?.(errors[0], 'error');
            return;
        }

        setSaving(true);
        try {
            const body = { values: valuesPayload, custom_keys: custom };
            if (draft.profile_name !== detail.profile_name) body.name = draft.profile_name;
            const updated = await api.put(`/shop/profiles/${detail.id}`, body);
            setDetail(updated);
            setDraft({
                profile_name: updated.profile_name,
                values: { ...updated.values },
                custom_keys: updated.custom_keys || {},
            });
            notify?.('Profile salvo', 'success');
            await reloadList();
        } catch (e) {
            const msg = e.errors ? e.errors.join(', ') : (e.error || 'Erro ao salvar');
            notify?.(msg, 'error');
        } finally { setSaving(false); }
    }

    async function activate() {
        if (!detail) return;
        try {
            const updated = await api.patch(`/shop/profiles/${detail.id}/activate`, {});
            setDetail(updated);
            notify?.('Profile ativado — plugin sincroniza no próximo startup', 'success');
            await reloadList();
        } catch (e) { notify?.(e.error || 'Erro ao ativar', 'error'); }
    }

    async function duplicate() {
        if (!detail) return;
        const newName = (draft?.profile_name || detail.profile_name) + ' (cópia)';
        try {
            const created = await api.post('/shop/profiles', {
                name: newName,
                values: { ...draft.values },
                custom_keys: draft.custom_keys || {},
                set_active: false,
            });
            notify?.(`Profile duplicado como "${newName}"`, 'success');
            await reloadList();
            setSelectedId(created.id);
        } catch (e) { notify?.(e.error || 'Erro ao duplicar', 'error'); }
    }

    async function doDelete() {
        if (!confirmDel) return;
        try {
            await api.del(`/shop/profiles/${confirmDel.id}`);
            notify?.('Profile removido', 'success');
            setConfirmDel(null);
            if (selectedId === confirmDel.id) setSelectedId(null);
            await reloadList();
        } catch (e) {
            notify?.(e.error || 'Erro ao remover', 'error');
            setConfirmDel(null);
        }
    }

    // ─── Render ─────────────────────────────────────────
    if (!isAdmin) {
        return (
            <div className="p-6">
                <PageHeader icon={Wrench} title="Padrões Técnicos da Marcenaria" subtitle="Profiles do plugin" />
                <EmptyState icon={AlertTriangle} title="Sem permissão"
                    description="Apenas administradores podem editar padrões técnicos." />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto"
             style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 80px)' }}>
            <PageHeader icon={Wrench} title="Padrões Técnicos da Marcenaria"
                subtitle="Profiles consumidos pelo plugin SketchUp (folgas, espessuras, hardware)">
                <button className={Z.btn2Sm} onClick={reloadList} title="Recarregar">
                    <RefreshCw size={14} /> Atualizar
                </button>
                <button className={Z.btnSm} onClick={() => setShowNew(true)}>
                    <Plus size={14} /> Novo profile
                </button>
            </PageHeader>

            <div className="shop-profiles-grid"
                 style={{ display: 'grid', gap: 16, flex: 1, minHeight: 0 }}>
                {/* ── Lista ── */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={showOnlyActive}
                                onChange={e => setShowOnlyActive(e.target.checked)} />
                            Mostrar apenas ativo
                        </label>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                        {loading && <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>}
                        {!loading && visibleProfiles.length === 0 && (
                            <EmptyState icon={Wrench} title="Nenhum profile"
                                description="Crie um profile para começar." />
                        )}
                        {visibleProfiles.map(p => (
                            <ProfileCard key={p.id} profile={p}
                                selected={p.id === selectedId}
                                onClick={() => setSelectedId(p.id)} />
                        ))}
                    </div>
                </div>

                {/* ── Editor ── */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {!detail && (
                        <EmptyState icon={Wrench} title="Selecione um profile"
                            description="Escolha um profile na lista para editar." />
                    )}
                    {detail && draft && (
                        <Editor
                            detail={detail}
                            draft={draft}
                            setDraft={setDraft}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            onSetValue={setValue}
                            customJsonText={customJsonText}
                            setCustomJsonText={setCustomJsonText}
                            customJsonErr={customJsonErr}
                            dirty={dirty}
                            saving={saving}
                            onSave={save}
                            onActivate={activate}
                            onDuplicate={duplicate}
                            onDelete={() => setConfirmDel(detail)}
                        />
                    )}
                </div>
            </div>

            {showNew && (
                <NewProfileModal
                    profiles={profiles}
                    close={() => setShowNew(false)}
                    onCreated={async (id) => {
                        setShowNew(false);
                        await reloadList();
                        setSelectedId(id);
                    }}
                    notify={notify}
                />
            )}

            {confirmDel && (
                <ConfirmModal
                    title="Remover profile?"
                    message={`Deletar "${confirmDel.name}"? Profiles ativos não podem ser deletados — ative outro antes.`}
                    danger confirmLabel="Remover"
                    onCancel={() => setConfirmDel(null)}
                    onConfirm={doDelete}
                />
            )}

            <style>{`
                .shop-profiles-grid {
                    grid-template-columns: minmax(260px, 340px) 1fr;
                }
                @media (max-width: 768px) {
                    .shop-profiles-grid { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
function ProfileCard({ profile: p, selected, onClick }) {
    return (
        <div onClick={onClick} style={{
            padding: 10, borderRadius: 8, cursor: 'pointer', marginBottom: 6,
            background: selected ? 'var(--bg-hover)' : 'transparent',
            border: selected ? '1px solid var(--primary)' : '1px solid transparent',
            transition: 'background 0.15s, border 0.15s',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                                  overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        atualizado {fmtDate(p.updated_at)}
                    </div>
                </div>
                {p.is_active
                    ? <Badge label="ATIVO" color="#10b981" />
                    : <Badge label="inativo" color="#94a3b8" />
                }
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
function Editor({
    detail, draft, setDraft, activeTab, onTabChange, onSetValue,
    customJsonText, setCustomJsonText, customJsonErr,
    dirty, saving, onSave, onActivate, onDuplicate, onDelete,
}) {
    const tab = TABS.find(t => t.id === activeTab) || TABS[0];

    return (
        <>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <input
                        className={Z.inp}
                        value={draft.profile_name}
                        onChange={e => setDraft(d => ({ ...d, profile_name: e.target.value }))}
                        style={{ fontSize: 16, fontWeight: 700, flex: 1, minWidth: 180 }}
                        maxLength={80}
                    />
                    {detail.is_active
                        ? <Badge label="ATIVO" color="#10b981" />
                        : <Badge label="inativo" color="#94a3b8" />
                    }
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    versão: <code>{detail.version}</code> · última sync (server): {fmtDate(detail.updated_at)}
                </div>
            </div>

            <TabBar tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))}
                    active={activeTab} onChange={onTabChange} />

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {tab.id !== 'custom' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                        {tab.keys.map(k => (
                            <FieldEditor key={k} k={k} schema={KEY_SCHEMA[k]}
                                value={draft.values[k]}
                                onChange={(v) => onSetValue(k, v)} />
                        ))}
                    </div>
                ) : (
                    <div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                            JSON livre para extensões (chaves não-padrão consumidas pelo plugin via <code>custom_keys</code>).
                        </div>
                        {customJsonErr && (
                            <div style={{ padding: 8, marginBottom: 8, background: 'var(--danger-bg)',
                                          color: 'var(--danger)', borderRadius: 6, fontSize: 12 }}>
                                <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />
                                {customJsonErr}
                            </div>
                        )}
                        <textarea
                            value={customJsonText}
                            onChange={e => setCustomJsonText(e.target.value)}
                            spellCheck={false}
                            style={{
                                width: '100%', minHeight: 280, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                                fontSize: 12, lineHeight: 1.5, padding: 12, borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg)',
                                color: 'var(--text-primary)', resize: 'vertical',
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: 12, borderTop: '1px solid var(--border)',
                display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            }}>
                <button className={Z.btn} onClick={onSave} disabled={!dirty || saving}>
                    <Save size={14} /> {saving ? 'Salvando...' : (dirty ? 'Salvar' : 'Salvo')}
                </button>
                {!detail.is_active && (
                    <button className={Z.btn2Sm} onClick={onActivate} title="Ativa este profile (desativa os demais da org)">
                        <CheckCircle2 size={14} /> Ativar este profile
                    </button>
                )}
                <button className={Z.btn2Sm} onClick={onDuplicate}>
                    <Copy size={14} /> Duplicar
                </button>
                <div style={{ marginLeft: 'auto' }}>
                    <button className={Z.btnDSm || Z.btn2Sm}
                            onClick={onDelete}
                            disabled={detail.is_active}
                            title={detail.is_active ? 'Não é possível deletar profile ativo' : ''}>
                        <Trash2 size={14} /> Excluir
                    </button>
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════
function FieldEditor({ k, schema, value, onChange }) {
    if (!schema) return null;
    const id = `f_${k}`;
    return (
        <div>
            <label htmlFor={id} className={Z.lbl}
                   style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span title={schema.tip}>{k}</span>
                {schema.unit && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({schema.unit})</span>
                )}
            </label>
            {schema.type === 'bool' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                    <input id={id} type="checkbox"
                        checked={!!value}
                        onChange={e => onChange(e.target.checked)} />
                    <span style={{ fontSize: 13 }}>{value ? 'Ativo' : 'Inativo'}</span>
                </label>
            ) : schema.type === 'number' ? (
                <input id={id} type="number"
                    className={Z.inp}
                    min={schema.min} max={schema.max} step="0.1"
                    value={value ?? ''}
                    onChange={e => {
                        const v = e.target.value;
                        onChange(v === '' ? null : Number(v));
                    }}
                    title={schema.tip}
                />
            ) : (
                <input id={id} type="text"
                    className={Z.inp}
                    value={value ?? ''}
                    onChange={e => onChange(e.target.value)}
                    title={schema.tip}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
function NewProfileModal({ profiles, close, onCreated, notify }) {
    const [name, setName]   = useState('');
    const [baseId, setBaseId] = useState(''); // '' = default Ornato (vazio no backend)
    const [setActive, setSetActive] = useState(false);
    const [busy, setBusy]   = useState(false);
    const [err, setErr]     = useState('');

    async function submit() {
        if (!name.trim()) { setErr('Nome obrigatório'); return; }
        if (profiles.some(p => p.name === name.trim())) {
            setErr('Já existe profile com esse nome'); return;
        }
        setErr(''); setBusy(true);
        try {
            // Se baseId definido, copiamos os values do profile base
            let values = {};
            let custom_keys = {};
            if (baseId) {
                const base = await api.put(`/shop/profiles/${baseId}`, {
                    name: profiles.find(p => p.id === Number(baseId))?.name,
                });
                values = base.values || {};
                custom_keys = base.custom_keys || {};
            }
            const created = await api.post('/shop/profiles', {
                name: name.trim(),
                values,
                custom_keys,
                set_active: setActive,
            });
            notify?.(`Profile "${created.profile_name}" criado`, 'success');
            onCreated(created.id);
        } catch (e) {
            setErr(e.error || 'Erro ao criar');
        } finally { setBusy(false); }
    }

    return (
        <Modal title="Novo profile de marcenaria" close={close} w={520}>
            <div style={{ padding: 4 }}>
                <div style={{ marginBottom: 12 }}>
                    <label className={Z.lbl}>Nome do profile</label>
                    <input className={Z.inp} value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="ex: Marcenaria Centro 2026" maxLength={80} autoFocus />
                </div>
                <div style={{ marginBottom: 12 }}>
                    <label className={Z.lbl}>Iniciar a partir de</label>
                    <select className={Z.inp} value={baseId} onChange={e => setBaseId(e.target.value)}>
                        <option value="">— Padrão Ornato (em branco) —</option>
                        {profiles.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.name}{p.is_active ? ' (ativo)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={setActive}
                            onChange={e => setSetActive(e.target.checked)} />
                        Ativar este profile imediatamente (desativa o atual)
                    </label>
                </div>
                {err && (
                    <div style={{ padding: 10, marginBottom: 12, background: 'var(--danger-bg)',
                                  color: 'var(--danger)', borderRadius: 6, fontSize: 13 }}>
                        <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} /> {err}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className={Z.btn2} onClick={close} disabled={busy}>Cancelar</button>
                    <button className={Z.btn} onClick={submit} disabled={busy}>
                        {busy ? <Spinner size={14} /> : <><Plus size={14} /> Criar</>}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
