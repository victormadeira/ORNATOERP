import { useState, useMemo, useEffect, useRef } from 'react';
import { Z, Ic, Modal, tagStyle, tagClass } from '../ui';
import { R$, KCOLS } from '../engine';
import api from '../api';
import { Copy, Download, SortAsc, SortDesc, Filter, AlertTriangle, Calendar, Flame, Eye as EyeIcon, RefreshCw, Share2, Printer, CheckCircle, FileText as FileTextIcon, Link2 } from 'lucide-react';

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
    const [confirmDel, setConfirmDel] = useState(null); // { id, nome }
    const [linkModal, setLinkModal] = useState(null); // { orc, token, views }
    const [loadingLink, setLoadingLink] = useState(null); // orc_id
    const [loadingDup, setLoadingDup] = useState(null); // orc_id duplicando
    const [scores, setScores] = useState({}); // { orc_id: { score, label, cor } }
    const [timeline, setTimeline] = useState(null); // { events: [] }

    // ─── Carregar scores ──────────────────────────────────
    useEffect(() => {
        api.get('/portal/scores').then(setScores).catch(() => {});
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

    // ─── Filtros ───────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = [...orcs];
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className={Z.h1}>Orçamentos</h1>
                    <p className={Z.sub}>{orcs.length} propostas · portfólio total {R$(orcs.reduce((s, o) => s + (o.valor_venda || 0), 0))}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={exportCSV} className={Z.btn2} title="Exportar CSV" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <Download size={14} /> CSV
                    </button>
                    <button onClick={() => nav("novo", null)} className={Z.btn}>
                        <Ic.Plus /> Novo Orçamento
                    </button>
                </div>
            </div>

            {/* ─── Filtros ──────────────────────────────────── */}
            <div className="flex flex-col gap-3 mb-6">
                {/* Linha 1: Busca + botão filtros */}
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 relative">
                        <input
                            placeholder="Buscar por cliente, projeto, número ou notas..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className={`${Z.inp} !pl-9`}
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }}>
                            <Ic.Search />
                        </div>
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`${Z.btn2} flex items-center gap-1.5 text-xs shrink-0`}
                        style={hasActiveFilters ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : {}}
                    >
                        <Filter size={13} />
                        Filtros {hasActiveFilters && `(${[statusFilter, clienteFilter, periodoFilter].filter(Boolean).length})`}
                    </button>
                    {/* Ordenação */}
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className={`${Z.inp} w-full md:w-52 text-xs`}
                    >
                        <option value="data_desc">Mais recentes primeiro</option>
                        <option value="data_asc">Mais antigos primeiro</option>
                        <option value="mod_desc">Última modificação</option>
                        <option value="valor_desc">Maior valor</option>
                        <option value="valor_asc">Menor valor</option>
                        <option value="cliente_asc">Cliente (A-Z)</option>
                    </select>
                </div>

                {/* Linha 2: Filtros expandíveis */}
                {showFilters && (
                    <div className="flex flex-col md:flex-row gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Status</label>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`${Z.inp} w-full text-xs`}>
                                <option value="">Todos os status</option>
                                {KCOLS.map(c => <option key={c.id} value={c.id}>{c.nm}</option>)}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Cliente</label>
                            <select value={clienteFilter} onChange={e => setClienteFilter(e.target.value)} className={`${Z.inp} w-full text-xs`}>
                                <option value="">Todos os clientes</option>
                                {clientes.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>Período</label>
                            <select value={periodoFilter} onChange={e => setPeriodoFilter(e.target.value)} className={`${Z.inp} w-full text-xs`}>
                                <option value="">Todo período</option>
                                <option value="7d">Última semana</option>
                                <option value="30d">Último mês</option>
                                <option value="90d">Últimos 3 meses</option>
                            </select>
                        </div>
                        {hasActiveFilters && (
                            <div className="flex items-end">
                                <button
                                    onClick={() => { setStatusFilter(''); setClienteFilter(''); setPeriodoFilter(''); }}
                                    className="text-[11px] px-3 py-1.5 rounded-md cursor-pointer hover:bg-red-500/10"
                                    style={{ color: '#ef4444' }}
                                >
                                    Limpar filtros
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ─── Sumário pipeline ─────────────────────────── */}
            {filtered.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {KCOLS.slice(0, 4).map(col => {
                        const colOrcs = filtered.filter(o => (o.kb_col || 'lead') === col.id);
                        if (!colOrcs.length) return null;
                        return (
                            <div key={col.id} className="glass-card p-3 flex flex-col gap-1 cursor-pointer hover:scale-[1.02] transition-transform"
                                onClick={() => setStatusFilter(statusFilter === col.id ? '' : col.id)}>
                                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: col.c || 'var(--text-muted)' }}>{col.nm}</div>
                                <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{colOrcs.length}</div>
                                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{R$(colOrcs.reduce((s, o) => s + (o.valor_venda || 0), 0))}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── Lista ────────────────────────────────────── */}
            {orcs.length === 0 ? (
                <div className={`${Z.card} flex flex-col items-center justify-center p-16`} style={{ color: 'var(--text-muted)' }}>
                    <div className="rounded-full p-4 mb-4" style={{ background: 'var(--bg-hover)' }}>
                        <Ic.File />
                    </div>
                    <p className="text-sm font-medium">Nenhum orçamento cadastrado</p>
                    <p className="text-xs mt-1 opacity-70">Crie seu primeiro orçamento para começar a vender</p>
                    <button onClick={() => nav("novo", null)} className={`${Z.btn} mt-4 text-xs`}>
                        <Ic.Plus /> Criar Orçamento
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div className={`${Z.card} py-12 text-center`} style={{ color: 'var(--text-muted)' }}>
                    <p className="text-sm">Nenhum resultado para "<strong>{search}</strong>"</p>
                </div>
            ) : (
                <div className={`${Z.card} !p-0 overflow-hidden`}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
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
                                {filtered.map(o => {
                                    const kc = KCOLS.find(c => c.id === (o.kb_col || 'lead'));
                                    const nAmb = (o.ambientes || []).length;
                                    const isLoadingThisLink = loadingLink === o.id;
                                    const isLoadingThisDup = loadingDup === o.id;
                                    const diasParado = diasAtras(o.atualizado_em || o.criado_em);
                                    const isStale = (o.kb_col === 'lead' || o.kb_col === 'proposal') && diasParado > 30;
                                    return (
                                        <tr key={o.id} className="group hover:bg-[var(--bg-muted)] transition-colors">
                                            <td className="td-glass">
                                                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                                                    {dt(o.criado_em)}
                                                </span>
                                            </td>
                                            <td className="td-glass hide-mobile">
                                                <span className="text-xs" style={{ color: isStale ? '#ef4444' : 'var(--text-muted)' }}>
                                                    {dt(o.atualizado_em || o.criado_em)}
                                                </span>
                                                {isStale && (
                                                    <div className="flex items-center gap-0.5 mt-0.5" title={`Sem movimentação há ${diasParado} dias`}>
                                                        <AlertTriangle size={10} style={{ color: '#ef4444' }} />
                                                        <span className="text-[9px] font-semibold" style={{ color: '#ef4444' }}>{diasParado}d parado</span>
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
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', flexShrink: 0 }}>
                                                                {o.numero?.match(/-A\d+$/)?.[0]?.replace('-', '') || 'ADT'}
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
                                            <td className="td-glass text-right font-bold relative" style={{ color: 'var(--primary)' }}>
                                                {R$(o.valor_venda)}
                                                {aditivoCount[o.id] > 0 && (
                                                    <div
                                                        className="text-[9px] font-semibold mt-0.5 cursor-pointer hover:underline"
                                                        style={{ color: '#3b82f6' }}
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
                                                        className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border p-3 text-left min-w-[280px]"
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
                                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>{badge}</span>
                                                                            <span className="text-[10px] font-medium" style={tagStyle(kc2?.c)}>{kc2?.nm || 'Lead'}</span>
                                                                        </div>
                                                                        {ad.motivo_aditivo && (
                                                                            <div className="text-[10px] italic max-w-[180px] truncate" style={{ color: 'var(--text-muted)' }} title={ad.motivo_aditivo}>
                                                                                "{ad.motivo_aditivo}"
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-xs font-bold whitespace-nowrap" style={{ color: '#3b82f6' }}>
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
                                            <td className="td-glass">
                                                <div className="flex items-center gap-1.5">
                                                    {/* Editar */}
                                                    <button
                                                        onClick={() => nav("novo", o)}
                                                        className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                                                        style={{ color: 'var(--text-secondary)' }} title="Editar orçamento"
                                                    >
                                                        <Ic.Edit />
                                                    </button>
                                                    {/* Pré-visualizar proposta */}
                                                    <button
                                                        onClick={() => previewProposta(o)}
                                                        className="p-1.5 rounded-md transition-colors hover:bg-green-500/10"
                                                        style={{ color: isLoadingThisLink ? 'var(--primary)' : '#16a34a' }}
                                                        title="Abrir proposta (nova aba)"
                                                        disabled={isLoadingThisLink}
                                                    >
                                                        {isLoadingThisLink ? (
                                                            <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                                                        ) : <Ic.Eye />}
                                                    </button>
                                                    {/* Link público + rastreamento */}
                                                    <button
                                                        onClick={() => abrirLink(o)}
                                                        className="p-1.5 rounded-md transition-colors hover:bg-blue-500/10"
                                                        style={{ color: 'var(--text-muted)' }}
                                                        title="Link público + rastreamento"
                                                        disabled={isLoadingThisLink}
                                                    >
                                                        <Ic.Link />
                                                    </button>
                                                    {/* Duplicar */}
                                                    <button
                                                        onClick={() => duplicar(o)}
                                                        className="p-1.5 rounded-md transition-colors hover:bg-violet-500/10"
                                                        style={{ color: isLoadingThisDup ? 'var(--text-muted)' : '#8b5cf6' }}
                                                        title="Duplicar orçamento"
                                                        disabled={isLoadingThisDup}
                                                    >
                                                        {isLoadingThisDup ? (
                                                            <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: '#8b5cf6', borderTopColor: 'transparent' }} />
                                                        ) : <Copy size={14} />}
                                                    </button>
                                                    {/* Excluir */}
                                                    <button
                                                        onClick={() => setConfirmDel({ id: o.id, nome: o.cliente_nome })}
                                                        className="p-1.5 rounded-md transition-colors bg-red-500/10 hover:bg-red-500/20"
                                                        style={{ color: '#ef4444' }} title="Excluir"
                                                    >
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
                </div>
            )}

            {/* ─── Modal: Confirmar Exclusão ─────────────────── */}
            {confirmDel && (
                <Modal title="Confirmar Exclusão" close={() => setConfirmDel(null)} w={420}>
                    <div className="flex flex-col gap-5">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: '#FEE2E2' }}>
                                <span style={{ color: '#DC2626' }}><Ic.Alert /></span>
                            </div>
                            <div>
                                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    Excluir proposta de <strong>{confirmDel.nome}</strong>?
                                </p>
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    Esta ação não pode ser desfeita. O link público também será desativado.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={() => setConfirmDel(null)} className={Z.btn2}>Cancelar</button>
                            <button onClick={del} className={Z.btnD}>Excluir</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ─── Modal: Link Público + Score + Timeline ──────── */}
            {linkModal && (
                <Modal title="Link Público da Proposta" close={() => { setLinkModal(null); setTimeline(null); }} w={680}>
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
                        {linkModal.viewsData && linkModal.viewsData.total > 0 && (
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { label: 'Visitas', value: linkModal.viewsData.new_visits || 0, color: '#3b82f6' },
                                    { label: 'Dispositivos', value: linkModal.viewsData.unique_devices || 0, color: '#8b5cf6' },
                                    { label: 'Tempo Max', value: `${Math.floor((linkModal.viewsData.max_tempo || 0) / 60)}min`, color: '#f59e0b' },
                                    { label: 'Scroll Max', value: `${linkModal.viewsData.max_scroll || 0}%`, color: '#22c55e' },
                                ].map((m, i) => (
                                    <div key={i} className="text-center p-2 rounded-lg" style={{ background: `${m.color}08`, border: `1px solid ${m.color}20` }}>
                                        <div className="text-sm font-bold" style={{ color: m.color }}>{m.value}</div>
                                        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Link */}
                        <div>
                            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>LINK PARA O CLIENTE</div>
                            <div className="flex gap-2">
                                <input
                                    readOnly
                                    value={`${window.location.origin}/?proposta=${linkModal.token}`}
                                    className={`${Z.inp} flex-1 text-xs font-mono`}
                                    onClick={e => e.target.select()}
                                />
                                <button
                                    onClick={() => copiarLink(linkModal.token)}
                                    className={`${Z.btn} shrink-0 text-xs`}
                                >
                                    <Ic.Copy /> Copiar
                                </button>
                            </div>
                        </div>

                        {/* Timeline Visual */}
                        <div>
                            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
                                TIMELINE DO CLIENTE
                                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: linkModal.total > 0 ? '#dbeafe' : 'var(--bg-muted)', color: linkModal.total > 0 ? '#1d4ed8' : 'var(--text-muted)' }}>
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
                                                file: { icon: <FileTextIcon size={10} />, color: '#3b82f6' },
                                                link: { icon: <Link2 size={10} />, color: '#8b5cf6' },
                                                eye: { icon: <EyeIcon size={10} />, color: '#6366f1' },
                                                refresh: { icon: <RefreshCw size={10} />, color: '#f97316' },
                                                share: { icon: <Share2 size={10} />, color: '#8b5cf6' },
                                                printer: { icon: <Printer size={10} />, color: '#16a34a' },
                                                check: { icon: <CheckCircle size={10} />, color: '#22c55e' },
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
