import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { Z, Ic, Modal, ConfirmModal, tagStyle, tagClass, PageHeader, EmptyState } from '../ui';
import { R$, KCOLS } from '../engine';
import api from '../api';
import { Copy, Download, Upload, SortAsc, SortDesc, Filter, AlertTriangle, Calendar, Flame, Eye as EyeIcon, RefreshCw, Share2, Printer, CheckCircle, FileText as FileTextIcon, Link2, Type, ZoomIn, Star, MousePointer, DollarSign, Search, Zap, CheckCheck, Monitor, Smartphone, MapPin, ExternalLink } from 'lucide-react';

const dt = (s) => s ? new Date(s + 'Z').toLocaleDateString('pt-BR') : '—';
const dtHr = (s) => s ? new Date(s + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// Formatar user-agent em string legível
function parseUA(ua = '') {
    if (!ua) return 'Desconhecido';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Web';
}

export default function Orcs({ orcs, nav, reload, notify }) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [clienteFilter, setClienteFilter] = useState('');
    const [periodoFilter, setPeriodoFilter] = useState(''); // 7d, 30d, 90d, custom
    const [sortBy, setSortBy] = useState('data_desc'); // data_desc, data_asc, valor_desc, valor_asc, cliente_asc, mod_desc
    const [showFilters, setShowFilters] = useState(false);
    const [page, setPage] = useState(1);
    const PER_PAGE = 25;
    const [confirmDel, setConfirmDel] = useState(null); // { id, nome }
    const [linkModal, setLinkModal] = useState(null); // { orc, token, views }
    const [loadingLink, setLoadingLink] = useState(null); // orc_id
    const [loadingDup, setLoadingDup] = useState(null); // orc_id duplicando
    const [scores, setScores] = useState({}); // { orc_id: { score, label, cor } }
    const [timeline, setTimeline] = useState(null); // { events: [] }
    const [viewMapId, setViewMapId] = useState(null);
    const [showAllViews, setShowAllViews] = useState(false);

    // ─── Carregar scores ──────────────────────────────────
    useEffect(() => {
        api.get('/portal/scores').then(setScores).catch(e => notify(e.error || 'Erro ao carregar scores'));
    }, [orcs]);

    // ─── Lista de clientes únicos ────────────────────────────
    const clientes = useMemo(() => {
        const nomes = [...new Set(orcs.map(o => o.cliente_nome).filter(Boolean))];
        return nomes.sort((a, b) => a.localeCompare(b));
    }, [orcs]);

    // ─── Helper: dias atrás ──────────────────────────────────
    const diasAtras = (dateStr) => {
        if (!dateStr) return Infinity;
        return Math.floor((Date.now() - new Date(dateStr + 'Z').getTime()) / 86400000);
    };

    // ─── Mapa de versões (agrupar versões substituídas por raiz) ─────────
    const versaoMap = useMemo(() => {
        const map = {};
        orcs.forEach(o => {
            if (o.tipo === 'versao' && o.parent_orc_id) {
                if (!map[o.parent_orc_id]) map[o.parent_orc_id] = [];
                map[o.parent_orc_id].push(o);
            }
        });
        return map;
    }, [orcs]);

    const versaoCount = useMemo(() => {
        const map = {};
        Object.entries(versaoMap).forEach(([pid, arr]) => { map[pid] = arr.length; });
        return map;
    }, [versaoMap]);

    const [expandedVersoes, setExpandedVersoes] = useState(null);
    const versaoPopupRef = useRef(null);
    useEffect(() => {
        if (!expandedVersoes) return;
        const handler = (e) => { if (versaoPopupRef.current && !versaoPopupRef.current.contains(e.target)) setExpandedVersoes(null); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [expandedVersoes]);

    // ─── Filtros ───────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = [...orcs];
        // Filtrar versões substituídas (só mostrar a ativa)
        list = list.filter(o => o.versao_ativa !== 0);
        // Texto
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(o =>
                o.cliente_nome?.toLowerCase().includes(q) ||
                o.ambiente?.toLowerCase().includes(q) ||
                o.obs?.toLowerCase().includes(q) ||
                o.numero?.toLowerCase().includes(q)
            );
        }
        // Status
        if (statusFilter) list = list.filter(o => (o.kb_col || 'lead') === statusFilter);
        // Cliente
        if (clienteFilter) list = list.filter(o => o.cliente_nome === clienteFilter);
        // Período (baseado em atualizado_em ou criado_em)
        if (periodoFilter) {
            const now = Date.now();
            const days = periodoFilter === '7d' ? 7 : periodoFilter === '30d' ? 30 : periodoFilter === '90d' ? 90 : 0;
            if (days > 0) {
                const cutoff = now - days * 86400000;
                list = list.filter(o => new Date(o.atualizado_em || o.criado_em).getTime() >= cutoff);
            }
        }
        // Ordenação
        list.sort((a, b) => {
            switch (sortBy) {
                case 'data_asc': return new Date(a.criado_em) - new Date(b.criado_em);
                case 'valor_desc': return (b.valor_venda || 0) - (a.valor_venda || 0);
                case 'valor_asc': return (a.valor_venda || 0) - (b.valor_venda || 0);
                case 'cliente_asc': return (a.cliente_nome || '').localeCompare(b.cliente_nome || '');
                case 'mod_desc': return new Date(b.atualizado_em || b.criado_em) - new Date(a.atualizado_em || a.criado_em);
                default: return new Date(b.criado_em) - new Date(a.criado_em); // data_desc
            }
        });
        return list;
    }, [orcs, search, statusFilter, clienteFilter, periodoFilter, sortBy]);

    // Paginação
    const totalPages = Math.ceil(filtered.length / PER_PAGE);
    const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    useEffect(() => setPage(1), [search, statusFilter, clienteFilter, periodoFilter]);

    // ─── Deletar ───────────────────────────────────────────
    const del = async () => {
        if (!confirmDel) return;
        try {
            await api.del(`/orcamentos/${confirmDel.id}`);
            notify('Orçamento removido');
            setConfirmDel(null);
            reload();
        } catch (ex) { notify(ex.error || 'Erro ao remover'); }
    };

    // ─── Gerar / Ver Link Público ──────────────────────────
    const abrirLink = async (orc) => {
        setLoadingLink(orc.id);
        try {
            const gen = await api.post('/portal/generate', { orc_id: orc.id });
            const token = gen.token;
            const [views, tl] = await Promise.all([
                api.get(`/portal/views/${orc.id}`),
                api.get(`/portal/timeline/${orc.id}`),
            ]);
            setLinkModal({ orc, token, views: views.views || [], total: views.total || 0, lead_score: views.lead_score, viewsData: views });
            setTimeline(tl);
        } catch (ex) {
            notify(ex.error || 'Erro ao gerar link');
        } finally {
            setLoadingLink(null);
        }
    };

    // ─── Abrir proposta em nova aba diretamente ─────────────
    const previewProposta = async (orc) => {
        setLoadingLink(orc.id);
        try {
            const gen = await api.post('/portal/generate', { orc_id: orc.id });
            window.open(`${window.location.origin}/?proposta=${gen.token}`, '_blank');
        } catch (ex) {
            notify(ex.error || 'Erro ao abrir proposta');
        } finally {
            setLoadingLink(null);
        }
    };

    const copiarLink = (token) => {
        const url = `${window.location.origin}/?proposta=${token}`;
        navigator.clipboard.writeText(url).then(() => notify('Link copiado!'));
    };

    const revogarLink = async (orc_id) => {
        try {
            await api.del(`/portal/revoke/${orc_id}`);
            notify('Link revogado');
            setLinkModal(null);
        } catch { notify('Erro ao revogar'); }
    };



    // ─── Duplicar orçamento ────────────────────────────
    const duplicar = async (orc) => {
        setLoadingDup(orc.id);
        try {
            const novo = await api.post(`/orcamentos/${orc.id}/duplicar`);
            notify(`Orçamento duplicado → ${novo.numero}`);
            reload();
            // Abrir cópia direto em edição
            nav('novo', novo);
        } catch (ex) {
            notify(ex.error || 'Erro ao duplicar');
        } finally {
            setLoadingDup(null);
        }
    };

    // ─── Exportar CSV ────────────────────────────────────
    const exportCSV = () => {
        const header = ['Número', 'Data Criação', 'Última Modificação', 'Cliente', 'Projeto', 'Ambientes', 'Custo Material', 'Valor Venda', 'Status'];
        const rows = filtered.map(o => {
            const kc = KCOLS.find(c => c.id === (o.kb_col || 'lead'));
            const nAmb = (o.ambientes || []).length || (o.mods?.length || 0);
            return [
                o.numero || `#${o.id}`,
                dt(o.criado_em),
                dt(o.atualizado_em || o.criado_em),
                o.cliente_nome || '',
                o.ambiente || '',
                nAmb,
                (o.custo_material || 0).toFixed(2),
                (o.valor_venda || 0).toFixed(2),
                kc?.nm || 'Lead'
            ];
        });
        const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orcamentos_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        notify('CSV exportado');
    };

    const totalValue = filtered.reduce((s, o) => s + (o.valor_venda || 0), 0);
    const hasActiveFilters = statusFilter || clienteFilter || periodoFilter;

    // Mapear aditivos filhos por orçamento pai (com detalhes)
    const aditivoMap = useMemo(() => {
        const map = {};
        orcs.forEach(o => {
            if (o.parent_orc_id) {
                if (!map[o.parent_orc_id]) map[o.parent_orc_id] = [];
                map[o.parent_orc_id].push(o);
            }
        });
        return map;
    }, [orcs]);

    // Mapear pai por id (para aditivos referenciarem o original)
    const parentMap = useMemo(() => {
        const map = {};
        orcs.forEach(o => {
            if (!o.parent_orc_id) map[o.id] = o;
        });
        return map;
    }, [orcs]);

    // Estado para expandir detalhes de aditivos na listagem
    const [expandedAditivos, setExpandedAditivos] = useState(null);
    const aditivoPopupRef = useRef(null);

    // Fechar popup de aditivos ao clicar fora
    useEffect(() => {
        if (!expandedAditivos) return;
        const handler = (e) => {
            if (aditivoPopupRef.current && !aditivoPopupRef.current.contains(e.target)) {
                setExpandedAditivos(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [expandedAditivos]);

    const aditivoCount = useMemo(() => {
        const map = {};
        Object.entries(aditivoMap).forEach(([pid, arr]) => { map[pid] = arr.length; });
        return map;
    }, [aditivoMap]);

    return (
        <div className={Z.pg}>
            {/* ─── Header ──────────────────────────────────── */}
            <PageHeader icon={FileTextIcon} title="Orçamentos" subtitle={`${orcs.length} propostas · portfólio total ${R$(orcs.reduce((s, o) => s + (o.valor_venda || 0), 0))}`}>
                <button onClick={exportCSV} className="btn-secondary btn-sm" title="Exportar CSV">
                    <Download size={13} /> CSV
                </button>
                <button onClick={() => nav("orc-import")} className="btn-secondary btn-sm" title="Importar orçamento de JSON gerado por IA">
                    <Upload size={13} /> Importar via IA
                </button>
                <button onClick={() => nav("novo", null)} className="btn-primary">
                    <Ic.Plus /> Novo Orçamento
                </button>
            </PageHeader>

            {/* ─── FilterBar ─────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                padding: '6px 10px', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                flexWrap: 'wrap', rowGap: 6,
            }}>
                {/* Busca */}
                <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 0 }}>
                    <Search size={12} style={{
                        position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--text-muted)', pointerEvents: 'none',
                    }} />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar cliente, projeto, número..."
                        style={{
                            width: '100%', paddingLeft: 26, height: 30,
                            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                            background: 'var(--bg-subtle)', fontSize: 12, color: 'var(--text-primary)',
                            outline: 'none', transition: 'border-color var(--transition-fast)',
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                </div>

                {/* div-sep */}
                <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

                {/* Status chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                    {KCOLS.map(col => {
                        const cnt = orcs.filter(o => o.versao_ativa !== 0 && (o.kb_col || 'lead') === col.id).length;
                        if (!cnt) return null;
                        const isActive = statusFilter === col.id;
                        return (
                            <button key={col.id}
                                onClick={() => setStatusFilter(isActive ? '' : col.id)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                                    fontSize: 11, fontWeight: 600,
                                    border: `1px solid ${isActive ? col.c : 'var(--border)'}`,
                                    background: isActive ? `${col.c}18` : 'transparent',
                                    color: isActive ? col.c : 'var(--text-secondary)',
                                    transition: 'all var(--transition-fast)',
                                }}
                            >
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: col.c, flexShrink: 0 }} />
                                {col.nm}
                                <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 700 }}>{cnt}</span>
                            </button>
                        );
                    })}
                </div>

                {/* div-sep */}
                <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

                {/* Cliente */}
                <select value={clienteFilter} onChange={e => setClienteFilter(e.target.value)}
                    style={{
                        height: 30, padding: '0 8px', borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${clienteFilter ? 'var(--primary)' : 'var(--border)'}`,
                        background: 'var(--bg-subtle)', fontSize: 11,
                        color: clienteFilter ? 'var(--primary)' : 'var(--text-secondary)',
                        cursor: 'pointer', outline: 'none', maxWidth: 140,
                    }}>
                    <option value="">Todos clientes</option>
                    {clientes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {/* Sort */}
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{
                        height: 30, padding: '0 8px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                        fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none',
                    }}>
                    <option value="data_desc">Mais recentes</option>
                    <option value="data_asc">Mais antigos</option>
                    <option value="mod_desc">Modificados</option>
                    <option value="valor_desc">Maior valor</option>
                    <option value="valor_asc">Menor valor</option>
                    <option value="cliente_asc">A-Z</option>
                </select>

                {/* Count + Clear */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {(search || statusFilter || clienteFilter || periodoFilter)
                            ? <><strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> / {orcs.filter(o => o.versao_ativa !== 0).length}</>
                            : <>{orcs.filter(o => o.versao_ativa !== 0).length} orçamentos</>}
                    </span>
                    {(search || statusFilter || clienteFilter || periodoFilter) && (
                        <button
                            onClick={() => { setSearch(''); setStatusFilter(''); setClienteFilter(''); setPeriodoFilter(''); }}
                            style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            Limpar
                        </button>
                    )}
                </div>
            </div>

            {/* ─── Pipeline strip ─────────────────────────── */}
            {!statusFilter && orcs.filter(o => o.versao_ativa !== 0).length > 0 && (
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
                    {KCOLS.map(col => {
                        const colOrcs = orcs.filter(o => o.versao_ativa !== 0 && (o.kb_col || 'lead') === col.id);
                        if (!colOrcs.length) return null;
                        return (
                            <button key={col.id}
                                onClick={() => setStatusFilter(col.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 14px', borderRadius: 'var(--radius-md)',
                                    border: `1px solid ${col.c}28`, background: `${col.c}0A`,
                                    cursor: 'pointer', flexShrink: 0, textAlign: 'left',
                                    transition: 'all var(--transition-fast)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = col.c + '55'; e.currentTarget.style.background = col.c + '18'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = col.c + '28'; e.currentTarget.style.background = col.c + '0A'; }}
                            >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.c, flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: col.c, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>{col.nm}</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25 }}>{colOrcs.length}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{R$(colOrcs.reduce((s, o) => s + (o.valor_venda || 0), 0))}</div>
                                </div>
                            </button>
                        );
                    })}
                    <div style={{ marginLeft: 'auto', flexShrink: 0, padding: '8px 14px', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfólio</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>{R$(totalValue)}</div>
                    </div>
                </div>
            )}

            {/* ─── Lista ────────────────────────────────────── */}
            {orcs.length === 0 ? (
                <div className="glass-card">
                    <EmptyState
                        icon={FileTextIcon}
                        title="Nenhum orçamento cadastrado"
                        description="Crie seu primeiro orçamento para começar a vender"
                        action={{ label: 'Criar Orçamento', onClick: () => nav("novo", null) }}
                    />
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card">
                    <EmptyState
                        icon={Search}
                        title="Nenhum resultado encontrado"
                        description={`Nenhum orçamento corresponde a "${search}"`}
                    />
                </div>
            ) : (
                <div className={`${Z.card} !p-0 overflow-hidden`}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left table-stagger">
                            <thead>
                                <tr>
                                    {[
                                        { h: 'Data', cls: '' },
                                        { h: 'Modificado', cls: 'hide-mobile' },
                                        { h: 'Cliente', cls: '' },
                                        { h: 'Projeto', cls: '' },
                                        { h: 'Amb.', cls: 'hide-mobile text-right' },
                                        { h: 'Preço Final', cls: 'text-right' },
                                        { h: 'Status', cls: '' },
                                        { h: 'Ações', cls: '' },
                                    ].map(({ h, cls }) => (
                                        <th key={h} className={`${Z.th} ${cls}`}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                {paged.map(o => {
                                    const kc = KCOLS.find(c => c.id === (o.kb_col || 'lead'));
                                    const nAmb = (o.ambientes || []).length;
                                    const isLoadingThisLink = loadingLink === o.id;
                                    const isLoadingThisDup = loadingDup === o.id;
                                    const diasParado = diasAtras(o.atualizado_em || o.criado_em);
                                    const isStale = (o.kb_col === 'lead' || o.kb_col === 'proposal') && diasParado > 30;
                                    return (
                                        <tr
                                            key={o.id}
                                            className="group transition-colors cursor-pointer"
                                            onClick={() => nav("novo", o)}
                                        >
                                            <td className="td-glass td-stack">
                                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em', display: 'block', lineHeight: 1 }}>
                                                    #{o.numero}
                                                </span>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'block', lineHeight: 1 }}>
                                                    {dt(o.criado_em)}
                                                </span>
                                            </td>
                                            <td className="td-glass hide-mobile">
                                                <span className="text-xs" style={{ color: isStale ? 'var(--danger)' : 'var(--text-muted)' }}>
                                                    {dt(o.atualizado_em || o.criado_em)}
                                                </span>
                                                {isStale && (
                                                    <div className="flex items-center gap-0.5 mt-0.5" title={`Sem movimentação há ${diasParado} dias`}>
                                                        <AlertTriangle size={10} style={{ color: 'var(--danger)' }} />
                                                        <span className="text-[9px] font-semibold" style={{ color: 'var(--danger)' }}>{diasParado}d parado</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="td-glass font-medium" style={{ color: 'var(--text-primary)' }}>
                                                {o.cliente_nome}
                                            </td>
                                            <td className="td-glass" style={{ color: 'var(--text-secondary)' }}>
                                                <span className="flex flex-col gap-0.5">
                                                    <span className="flex items-center gap-1.5">
                                                        {o.tipo === 'aditivo' && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)', flexShrink: 0 }}>
                                                                {o.numero?.match(/-A\d+$/)?.[0]?.replace('-', '') || 'ADT'}
                                                            </span>
                                                        )}
                                                        {(o.versao > 1 || versaoCount[o.id] > 0) && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', flexShrink: 0 }}>
                                                                {o.versao > 1 ? `R${o.versao}` : `v1`}
                                                            </span>
                                                        )}
                                                        {o.ambiente || '—'}
                                                    </span>
                                                    {o.tipo === 'aditivo' && o.parent_orc_id && parentMap[o.parent_orc_id] && (
                                                        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                                            → ref. {parentMap[o.parent_orc_id]?.numero || `#${o.parent_orc_id}`}
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="td-glass text-right hide-mobile" style={{ color: 'var(--text-muted)' }}>
                                                {nAmb > 0 ? `${nAmb} amb.` : (o.mods?.length > 0 ? `${o.mods.length} mód.` : '—')}
                                            </td>
                                            <td className="td-glass text-right font-bold relative" style={{ color: 'var(--primary)' }} onClick={e => e.stopPropagation()}>
                                                {R$(o.valor_venda)}
                                                {aditivoCount[o.id] > 0 && (
                                                    <div
                                                        className="text-[9px] font-semibold mt-0.5 cursor-pointer hover:underline"
                                                        style={{ color: 'var(--info)' }}
                                                        onClick={(e) => { e.stopPropagation(); setExpandedAditivos(expandedAditivos === o.id ? null : o.id); }}
                                                    >
                                                        +{aditivoCount[o.id]} aditivo{aditivoCount[o.id] > 1 ? 's' : ''} ({R$((aditivoMap[o.id] || []).reduce((s, a) => s + (a.valor_venda || 0), 0))})
                                                        <span className="ml-0.5">{expandedAditivos === o.id ? '▲' : '▼'}</span>
                                                    </div>
                                                )}
                                                {/* Popup expandido com detalhes dos aditivos */}
                                                {expandedAditivos === o.id && aditivoMap[o.id] && (
                                                    <div
                                                        ref={aditivoPopupRef}
                                                        className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border p-3 text-left min-w-[min(280px,95vw)] max-w-[95vw]"
                                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                                                    >
                                                        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                                                            Aditivos de {o.numero}
                                                        </div>
                                                        <div className="text-xs font-normal mb-2 pb-2 border-b flex justify-between" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                                                            <span>Original</span>
                                                            <span className="font-semibold">{R$(o.valor_venda)}</span>
                                                        </div>
                                                        {aditivoMap[o.id].map(ad => {
                                                            const badge = ad.numero?.match(/-A\d+$/)?.[0]?.replace('-', '') || 'ADT';
                                                            const kc2 = KCOLS.find(c => c.id === (ad.kb_col || 'lead'));
                                                            return (
                                                                <div key={ad.id} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }}>{badge}</span>
                                                                            <span className="text-[10px] font-medium" style={tagStyle(kc2?.c)}>{kc2?.nm || 'Lead'}</span>
                                                                        </div>
                                                                        {ad.motivo_aditivo && (
                                                                            <div className="text-[10px] italic max-w-[180px] truncate" style={{ color: 'var(--text-muted)' }} title={ad.motivo_aditivo}>
                                                                                "{ad.motivo_aditivo}"
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--info)' }}>
                                                                        +{R$(ad.valor_venda)}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        <div className="flex justify-between pt-2 mt-1 border-t font-bold text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                                                            <span>Total consolidado</span>
                                                            <span style={{ color: 'var(--primary)' }}>{R$(o.valor_venda + (aditivoMap[o.id] || []).reduce((s, a) => s + (a.valor_venda || 0), 0))}</span>
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Versões anteriores */}
                                                {versaoCount[o.id] > 0 && (
                                                    <div
                                                        className="text-[9px] font-semibold mt-0.5 cursor-pointer hover:underline"
                                                        style={{ color: '#8b5cf6' }}
                                                        onClick={(e) => { e.stopPropagation(); setExpandedVersoes(expandedVersoes === o.id ? null : o.id); }}
                                                    >
                                                        {versaoCount[o.id]} revisão{versaoCount[o.id] > 1 ? 'es' : ''} anterior{versaoCount[o.id] > 1 ? 'es' : ''}
                                                        <span className="ml-0.5">{expandedVersoes === o.id ? '▲' : '▼'}</span>
                                                    </div>
                                                )}
                                                {/* Popup expandido com detalhes das versões */}
                                                {expandedVersoes === o.id && versaoMap[o.id] && (
                                                    <div
                                                        ref={versaoPopupRef}
                                                        className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border p-3 text-left min-w-[min(280px,95vw)] max-w-[95vw]"
                                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                                                    >
                                                        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                                                            Revisões de {o.numero}
                                                        </div>
                                                        <div className="text-xs font-normal mb-2 pb-2 border-b flex justify-between" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                                                            <span>Versão ativa ({o.versao > 1 ? `R${o.versao}` : 'v1'})</span>
                                                            <span className="font-semibold">{R$(o.valor_venda)}</span>
                                                        </div>
                                                        {versaoMap[o.id].map(v => {
                                                            const kc2 = KCOLS.find(c => c.id === (v.kb_col || 'lead'));
                                                            return (
                                                                <div key={v.id} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                                                                                {v.versao > 1 ? `R${v.versao}` : 'v1'}
                                                                            </span>
                                                                            <span className="text-[10px] font-medium" style={tagStyle(kc2?.c)}>{kc2?.nm || 'Lead'}</span>
                                                                            <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(100,116,139,0.1)', color: 'var(--muted)' }}>substituída</span>
                                                                        </div>
                                                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                                            {dt(v.criado_em)}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-bold whitespace-nowrap" style={{ color: '#8b5cf6' }}>
                                                                            {R$(v.valor_venda)}
                                                                        </span>
                                                                        <button
                                                                            className="text-[9px] font-semibold px-2 py-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
                                                                            style={{ color: 'var(--primary)' }}
                                                                            onClick={(e) => { e.stopPropagation(); nav('novo', v); }}
                                                                        >
                                                                            Abrir
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="td-glass">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span style={tagStyle(kc?.c)} className={tagClass}>
                                                        {kc?.nm || 'Lead'}
                                                    </span>
                                                    {scores[o.id] && scores[o.id].score > 0 && (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                                            style={{ background: `${scores[o.id].cor}18`, color: scores[o.id].cor, border: `1px solid ${scores[o.id].cor}30` }}
                                                            title={`Lead Score: ${scores[o.id].score} — ${scores[o.id].label}`}
                                                        >
                                                            <Flame size={9} />
                                                            {scores[o.id].score}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="td-glass" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ gap: 0 }}>
                                                    {/* Grupo: ações primárias */}
                                                    <div className="flex items-center gap-0.5">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); nav("novo", o); }}
                                                            className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                                                            style={{ color: 'var(--text-secondary)' }} title="Editar orçamento">
                                                            <Ic.Edit />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); previewProposta(o); }}
                                                            className="p-1.5 rounded-md transition-colors hover:bg-green-500/10"
                                                            style={{ color: isLoadingThisLink ? 'var(--primary)' : 'var(--success-hover)' }}
                                                            title="Abrir proposta (nova aba)"
                                                            disabled={isLoadingThisLink}>
                                                            {isLoadingThisLink ? (
                                                                <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                                                            ) : <Ic.Eye />}
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); abrirLink(o); }}
                                                            className="p-1.5 rounded-md transition-colors hover:bg-blue-500/10"
                                                            style={{ color: 'var(--text-muted)' }}
                                                            title="Link público + rastreamento"
                                                            disabled={isLoadingThisLink}>
                                                            <Ic.Link />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); duplicar(o); }}
                                                            className="p-1.5 rounded-md transition-colors hover:bg-violet-500/10"
                                                            style={{ color: isLoadingThisDup ? 'var(--text-muted)' : '#8b5cf6' }}
                                                            title="Duplicar orçamento"
                                                            disabled={isLoadingThisDup}>
                                                            {isLoadingThisDup ? (
                                                                <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: '#8b5cf6', borderTopColor: 'transparent' }} />
                                                            ) : <Copy size={14} />}
                                                        </button>
                                                    </div>
                                                    {/* Separador visual */}
                                                    <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 6px', flexShrink: 0 }} />
                                                    {/* Excluir — ação destrutiva separada */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setConfirmDel({ id: o.id, nome: o.cliente_nome }); }}
                                                        className="p-1.5 rounded-md transition-colors hover:bg-red-500/10"
                                                        style={{ color: 'var(--danger)' }} title="Excluir">
                                                        <Ic.Trash />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {filtered.length > 1 && (
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                                        <td colSpan={5} className="td-glass text-right text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                                            {filtered.length} proposta{filtered.length !== 1 ? 's' : ''} · Total
                                        </td>
                                        <td className="td-glass text-right font-bold" style={{ color: 'var(--primary)' }}>
                                            {R$(totalValue)}
                                        </td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} itens · Página {page}/{totalPages}</span>
                            <div className="flex gap-1">
                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className={`${Z.btn2} text-xs py-1 px-3`} style={{ opacity: page <= 1 ? 0.4 : 1 }}>← Anterior</button>
                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={`${Z.btn2} text-xs py-1 px-3`} style={{ opacity: page >= totalPages ? 0.4 : 1 }}>Próxima →</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Modal: Confirmar Exclusão ─────────────────── */}
            {confirmDel && (
                <ConfirmModal
                    title="Excluir"
                    message={`Tem certeza que deseja excluir a proposta de "${confirmDel.nome}"? Esta ação não pode ser desfeita. O link público também será desativado.`}
                    confirmLabel="Excluir"
                    danger
                    onConfirm={() => { del(); }}
                    onCancel={() => setConfirmDel(null)}
                />
            )}

            {/* ─── Modal: Link Público + Score + Timeline ──────── */}
            {linkModal && (
                <Modal title="Link Público da Proposta" close={() => { setLinkModal(null); setTimeline(null); setViewMapId(null); setShowAllViews(false); }} w={680}>
                    <div className="flex flex-col gap-5">
                        {/* Info proposta + Score */}
                        <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div>
                                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    {linkModal.orc.cliente_nome} — {linkModal.orc.ambiente || 'Sem nome'}
                                </div>
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    Valor: <strong style={{ color: 'var(--primary)' }}>{R$(linkModal.orc.valor_venda)}</strong>
                                </div>
                            </div>
                            {linkModal.lead_score && linkModal.lead_score.score > 0 && (
                                <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg" style={{ background: `${linkModal.lead_score.cor}12`, border: `1px solid ${linkModal.lead_score.cor}30` }}>
                                    <div className="flex items-center gap-1">
                                        <Flame size={14} style={{ color: linkModal.lead_score.cor }} />
                                        <span className="text-lg font-bold" style={{ color: linkModal.lead_score.cor }}>{linkModal.lead_score.score}</span>
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: linkModal.lead_score.cor }}>{linkModal.lead_score.label}</span>
                                </div>
                            )}
                        </div>

                        {/* Métricas resumo */}
                        {linkModal.viewsData && linkModal.viewsData.total > 0 && (() => {
                            const topAmb = linkModal.viewsData.section_resumo?.find(s => s.id?.startsWith('amb_'));
                            const totalInteracoes = Object.values(linkModal.viewsData.eventos_resumo || {}).reduce((s, v) => s + v, 0);
                            const metrics = [
                                { label: 'Visitas', value: linkModal.viewsData.new_visits || 0, color: 'var(--info)' },
                                { label: 'Dispositivos', value: linkModal.viewsData.unique_devices || 0, color: '#8b5cf6' },
                                { label: 'Tempo Max', value: `${Math.floor((linkModal.viewsData.max_tempo || 0) / 60)}min`, color: 'var(--warning)' },
                                { label: 'Scroll Max', value: `${linkModal.viewsData.max_scroll || 0}%`, color: 'var(--success)' },
                            ];
                            if (topAmb) metrics.push({ label: 'Amb. Foco', value: topAmb.nome?.split(' ')[0] || topAmb.id, color: 'var(--danger)', sub: `${Math.floor(topAmb.tempo / 60)}m${topAmb.tempo % 60}s` });
                            if (totalInteracoes > 0) metrics.push({ label: 'Interações', value: totalInteracoes, color: '#0ea5e9' });
                            return (
                                <div className={`grid gap-2 grid-cols-2 ${metrics.length > 4 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
                                    {metrics.map((m, i) => (
                                        <div key={i} className="text-center p-2 rounded-lg" style={{ background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                                            <div className="text-sm font-bold" style={{ color: m.color }}>{m.value}</div>
                                            {m.sub && <div className="text-[9px]" style={{ color: m.color, opacity: 0.7 }}>{m.sub}</div>}
                                            <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* Engagement por Ambiente (heatmap) + Insight comportamental */}
                        {linkModal.viewsData?.section_resumo?.length > 0 && (() => {
                            const sections = linkModal.viewsData.section_resumo;
                            const tempoTotal = sections.reduce((s, r) => s + (r.tempo || 0), 0) || 1;
                            const ambientes = sections.filter(s => s.id?.startsWith('amb_'));
                            const resumoSec = sections.find(s => s.id === 'resumo');
                            const pagSec = sections.find(s => s.id === 'pagamento');
                            const tempoAmbs = ambientes.reduce((s, r) => s + (r.tempo || 0), 0);
                            const tempoResumo = (resumoSec?.tempo || 0) + (pagSec?.tempo || 0);
                            const pctResumo = Math.round((tempoResumo / tempoTotal) * 100);
                            const pctAmbs = Math.round((tempoAmbs / tempoTotal) * 100);

                            // Classificar perfil comportamental
                            let perfil, perfilCor, perfilIcon, perfilDesc;
                            if (pctResumo > 50 && pctAmbs < 30) {
                                perfil = 'Focado no Preço';
                                perfilCor = 'var(--danger)';
                                perfilIcon = <DollarSign size={14} />;
                                perfilDesc = `${pctResumo}% do tempo no resumo financeiro — cliente pode estar comparando preços`;
                            } else if (pctAmbs > 60) {
                                perfil = 'Analisou Detalhes';
                                perfilCor = 'var(--success)';
                                perfilIcon = <Search size={14} />;
                                perfilDesc = `${pctAmbs}% do tempo nos ambientes — cliente interessado nos detalhes do projeto`;
                            } else if (tempoTotal < 30) {
                                perfil = 'Visualização Rápida';
                                perfilCor = 'var(--warning)';
                                perfilIcon = <Zap size={14} />;
                                perfilDesc = `Apenas ${tempoTotal}s na proposta — pode não ter analisado a fundo`;
                            } else {
                                perfil = 'Análise Equilibrada';
                                perfilCor = 'var(--info)';
                                perfilIcon = <CheckCheck size={14} />;
                                perfilDesc = `${pctAmbs}% nos ambientes, ${pctResumo}% no financeiro — análise balanceada`;
                            }

                            return (
                                <>
                                    {/* Insight comportamental */}
                                    <div className="p-3 rounded-lg" style={{ background: `${perfilCor}08`, border: `1px solid ${perfilCor}20` }}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span style={{ color: perfilCor }}>{perfilIcon}</span>
                                            <span className="text-xs font-bold" style={{ color: perfilCor }}>{perfil}</span>
                                        </div>
                                        <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{perfilDesc}</div>
                                        <div className="flex gap-3 mt-2">
                                            <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                                <span className="font-semibold" style={{ color: pctAmbs > 50 ? 'var(--success)' : 'var(--text-secondary)' }}>{pctAmbs}%</span> nos ambientes
                                            </div>
                                            <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                                <span className="font-semibold" style={{ color: pctResumo > 50 ? 'var(--danger)' : 'var(--text-secondary)' }}>{pctResumo}%</span> no financeiro
                                            </div>
                                        </div>
                                    </div>

                                    {/* Heatmap por seção */}
                                    <div>
                                        <div className="text-xs font-semibold mb-2 flex items-center justify-between" style={{ color: 'var(--text-muted)' }}>
                                            <span>ENGAGEMENT POR SEÇÃO</span>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            {sections.map((s, i) => {
                                                const maxPct = sections[0]?.pct || 1;
                                                const barW = Math.max(8, Math.round((s.pct / maxPct) * 100));
                                                const min = Math.floor(s.tempo / 60);
                                                const seg = s.tempo % 60;
                                                const tempoStr = min > 0 ? `${min}m${seg > 0 ? seg + 's' : ''}` : `${seg}s`;
                                                const heat = s.pct / 100;
                                                const barColor = heat > 0.6 ? 'var(--danger)' : heat > 0.3 ? '#f97316' : heat > 0.15 ? 'var(--warning)' : 'var(--info)';
                                                const isResumo = s.id === 'resumo' || s.id === 'pagamento';
                                                return (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <span className="text-[10px] font-medium w-36 truncate text-right" style={{ color: 'var(--text-secondary)' }}>
                                                            {isResumo && <DollarSign size={10} className="inline mr-0.5" style={{ verticalAlign: 'middle' }} />}{s.nome || s.id}
                                                        </span>
                                                        <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                                                            <div className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-1.5"
                                                                style={{ width: `${barW}%`, background: barColor, minWidth: 28 }}>
                                                                <span className="text-[9px] font-bold text-white whitespace-nowrap">{tempoStr}</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-[9px] font-semibold w-8 text-right" style={{ color: barColor }}>{s.pct}%</span>
                                                        {s.entradas > 1 && (
                                                            <span className="text-[8px] w-14 text-right" style={{ color: 'var(--text-muted)' }}>
                                                                {s.entradas}× visto
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            );
                        })()}

                        {/* Interações detectadas */}
                        {linkModal.viewsData?.eventos_resumo && Object.keys(linkModal.viewsData.eventos_resumo).length > 0 && (
                            <div>
                                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                                    INTERAÇÕES DETECTADAS
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {linkModal.viewsData.eventos_resumo.text_select > 0 && (
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-full"
                                            style={{ background: '#0ea5e910', color: '#0ea5e9', border: '1px solid #0ea5e925' }}>
                                            <Type size={11} /> {linkModal.viewsData.eventos_resumo.text_select}× seleção de texto
                                        </span>
                                    )}
                                    {linkModal.viewsData.eventos_resumo.copy > 0 && (
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-full"
                                            style={{ background: '#14b8a610', color: '#14b8a6', border: '1px solid #14b8a625' }}>
                                            <Copy size={11} /> {linkModal.viewsData.eventos_resumo.copy}× texto copiado
                                        </span>
                                    )}
                                    {linkModal.viewsData.eventos_resumo.zoom > 0 && (
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-full"
                                            style={{ background: '#a855f710', color: '#a855f7', border: '1px solid #a855f725' }}>
                                            <ZoomIn size={11} /> {linkModal.viewsData.eventos_resumo.zoom}× zoom/ampliação
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Últimos acessos - tabela detalhada */}
                        {linkModal.views?.length > 0 && (() => {
                            const views = linkModal.views;
                            const hasAnyCidade = views.some(v => v.cidade);
                            const hasAnyLoc = views.some(v => v.lat && v.lon);
                            const shown = showAllViews ? views : views.slice(0, 8);
                            return (
                                <div>
                                    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                                        ÚLTIMOS ACESSOS
                                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                            {views.length}
                                        </span>
                                    </div>
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
                                                {shown.map((v, i) => {
                                                    const hasLoc = v.lat && v.lon;
                                                    return (
                                                        <Fragment key={v.id || i}>
                                                            <tr style={{
                                                                borderBottom: '1px solid var(--border)',
                                                                background: viewMapId === v.id ? 'var(--bg-muted)' : v.is_new_visit ? 'rgba(59,130,246,0.04)' : undefined,
                                                                cursor: hasLoc ? 'pointer' : 'default',
                                                            }} onClick={() => hasLoc && setViewMapId(viewMapId === v.id ? null : v.id)}>
                                                                <td style={{ padding: '6px 10px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{dtHr(v.acessado_em)}</td>
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
                                    {views.length > 8 && (
                                        <button onClick={() => setShowAllViews(!showAllViews)}
                                            className="text-[10px] mt-2 cursor-pointer"
                                            style={{ color: 'var(--primary)', fontWeight: 600 }}>
                                            {showAllViews ? 'Mostrar menos' : `Ver todos (${views.length})`}
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Links */}
                        <div className="flex flex-col gap-3">
                            <div>
                                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                                    LINK EXPERIÊNCIA COMPLETA
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'var(--info-bg)', color: '#1d4ed8' }}>RECOMENDADO</span>
                                </div>
                                <div className="flex gap-2">
                                    <input readOnly value={`${window.location.origin}/apresentacao/${linkModal.token}`}
                                        className={`${Z.inp} flex-1 text-xs font-mono`} onClick={e => e.target.select()} />
                                    <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/apresentacao/${linkModal.token}`); notify('Link copiado!'); }}
                                        className={`${Z.btn} shrink-0 text-xs`}><Ic.Copy /> Copiar</button>
                                </div>
                                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Portfolio + timeline + apresentação antes do orçamento</p>
                            </div>
                            <div>
                                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>LINK DIRETO DA PROPOSTA</div>
                                <div className="flex gap-2">
                                    <input readOnly value={`${window.location.origin}/?proposta=${linkModal.token}`}
                                        className={`${Z.inp} flex-1 text-xs font-mono`} onClick={e => e.target.select()} />
                                    <button onClick={() => copiarLink(linkModal.token)}
                                        className={`${Z.btn} shrink-0 text-xs`}><Ic.Copy /> Copiar</button>
                                </div>
                                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Vai direto para o orçamento</p>
                            </div>
                        </div>

                        {/* Timeline Visual */}
                        <div>
                            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
                                TIMELINE DO CLIENTE
                                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: linkModal.total > 0 ? 'var(--info-bg)' : 'var(--bg-muted)', color: linkModal.total > 0 ? '#1d4ed8' : 'var(--text-muted)' }}>
                                    {linkModal.total} {linkModal.total === 1 ? 'acesso' : 'acessos'}
                                </span>
                            </div>

                            {(!timeline || !timeline.events || timeline.events.length === 0) ? (
                                <div className="py-6 text-center text-xs rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    <div className="mb-2 flex justify-center"><Ic.Eye /></div>
                                    Nenhum evento registrado ainda.<br />
                                    <span className="opacity-70">Quando o cliente abrir o link, aparecerá aqui.</span>
                                </div>
                            ) : (
                                <div className="max-h-72 overflow-y-auto pr-1">
                                    <div className="flex flex-col gap-1">
                                        {timeline.events.map((ev, i) => {
                                            const ICON_MAP = {
                                                file: { icon: <FileTextIcon size={10} />, color: 'var(--info)' },
                                                link: { icon: <Link2 size={10} />, color: '#8b5cf6' },
                                                eye: { icon: <EyeIcon size={10} />, color: '#6366f1' },
                                                refresh: { icon: <RefreshCw size={10} />, color: '#f97316' },
                                                share: { icon: <Share2 size={10} />, color: '#8b5cf6' },
                                                printer: { icon: <Printer size={10} />, color: 'var(--success-hover)' },
                                                check: { icon: <CheckCircle size={10} />, color: 'var(--success)' },
                                                text: { icon: <Type size={10} />, color: '#0ea5e9' },
                                                copy: { icon: <Copy size={10} />, color: '#14b8a6' },
                                                zoom: { icon: <ZoomIn size={10} />, color: '#a855f7' },
                                                star: { icon: <Star size={10} />, color: '#eab308' },
                                            };
                                            const ic = ICON_MAP[ev.icone] || ICON_MAP.file;
                                            return (
                                                <div key={i} className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-[var(--bg-muted)] transition-colors">
                                                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                                        style={{ background: `${ic.color}15`, border: `2px solid ${ic.color}`, color: ic.color }}>
                                                        {ic.icon}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{ev.titulo}</span>
                                                            <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{dtHr(ev.data)}</span>
                                                        </div>
                                                        {ev.detalhe && (
                                                            <div className="text-[10px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{ev.detalhe}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Ações footer */}
                        <div className="flex justify-between items-center pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button
                                onClick={() => revogarLink(linkModal.orc.id)}
                                className="text-xs text-red-400 hover:text-red-500 transition-colors flex items-center gap-1"
                            >
                                <Ic.X /> Revogar link público
                            </button>
                            <button onClick={() => { setLinkModal(null); setTimeline(null); }} className={Z.btn2}>Fechar</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
