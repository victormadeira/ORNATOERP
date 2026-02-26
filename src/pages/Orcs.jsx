import { useState, useMemo, useEffect, useRef } from 'react';
import { Z, Ic, Modal, tagStyle, tagClass } from '../ui';
import { R$, KCOLS, DB_ACABAMENTOS, DB_CHAPAS } from '../engine';
import api from '../api';

// ─── Helpers para OS ─────────────────────────────────────
const acabNome = (id) => {
    if (!id) return '—';
    const a = DB_ACABAMENTOS.find(x => x.id === id);
    return a ? a.nome : id;
};
const chapaInfo = (id) => {
    if (!id) return '';
    const c = DB_CHAPAS.find(x => x.id === id);
    return c ? `${c.esp}mm` : id;
};

// ─── Gera HTML completo da OS para impressão ─────────────
function buildOsHtml(orc, empresa) {
    const R = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    const fmtDt = (s) => s ? new Date(s).toLocaleDateString('pt-BR') : '—';
    const ac = (id) => acabNome(id);
    const mm = (id) => chapaInfo(id);

    const num = orc.numero || `#${orc.id}`;
    const ambientes = orc.ambientes || [];
    const legacyMods = orc.mods || [];

    const buildRows = (mods) => mods.map((m, mi) => `
        <tr>
            <td class="n">${mi + 1}</td>
            <td class="nome"><strong>${m.nome || m.tipo || '—'}</strong></td>
            <td>${m.acabExt ? `${ac(m.acabExt)}${m.mmExt ? ' / ' + mm(m.mmExt) : ''}` : '—'}</td>
            <td>${m.acabInt ? `${ac(m.acabInt)}${m.mmInt ? ' / ' + mm(m.mmInt) : ''}` : '—'}</td>
            <td class="dim">${m.l || 0} × ${m.a || 0} × ${m.p || 0}</td>
            <td class="n">${m.qtd || 1}</td>
        </tr>`).join('');

    const buildTable = (mods) => `
        <table class="mt">
            <thead><tr>
                <th class="n">Nº</th>
                <th>Módulo</th>
                <th>Acab. Externo / Esp.</th>
                <th>Acab. Interno / Esp.</th>
                <th>L × A × P (mm)</th>
                <th class="n">Qtd</th>
            </tr></thead>
            <tbody>${buildRows(mods)}</tbody>
        </table>`;

    const modsHtml = ambientes.length > 0
        ? ambientes.map((amb, ai) => `
            <div class="amb">
                <div class="amb-hdr">
                    <span>AMBIENTE ${ai + 1}: ${amb.nome || 'Sem nome'}</span>
                    <span>${(amb.mods || []).length} módulo${(amb.mods || []).length !== 1 ? 's' : ''}</span>
                </div>
                ${buildTable(amb.mods || [])}
            </div>`).join('')
        : legacyMods.length > 0
            ? buildTable(legacyMods)
            : '<p style="color:#888;text-align:center;padding:20px;">Nenhum módulo cadastrado.</p>';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>OS ${num} — ${orc.cliente_nome}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11px;padding:24px;}
@page{margin:14mm 12mm;size:A4;}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #1a4fa0;padding-bottom:12px;margin-bottom:16px;}
.emp h1{font-size:16px;font-weight:bold;color:#1a4fa0;margin-bottom:4px;}
.emp p{font-size:10px;color:#555;line-height:1.6;}
.os-info{text-align:right;}
.os-info .title{font-size:20px;font-weight:bold;color:#1a4fa0;letter-spacing:1px;}
.os-info .num{font-size:13px;font-weight:bold;color:#333;margin-top:2px;}
.os-info .date{font-size:10px;color:#888;margin-top:3px;}
.info-box{background:#f4f7ff;border:1px solid #d8e2f5;border-radius:5px;padding:10px 14px;margin-bottom:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px 20px;}
.info-box .fi label{font-size:9px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px;}
.info-box .fi span{font-size:12px;font-weight:600;color:#111;}
.amb{margin-bottom:18px;}
.amb-hdr{background:#1a4fa0;color:#fff;padding:6px 10px;border-radius:4px 4px 0 0;font-size:11px;font-weight:bold;display:flex;justify-content:space-between;}
.mt{width:100%;border-collapse:collapse;font-size:10.5px;}
.mt th{background:#e6edf8;color:#1a4fa0;padding:5px 8px;text-align:left;border:1px solid #ccd6ed;font-size:9.5px;}
.mt td{padding:5.5px 8px;border:1px solid #e2e2e2;vertical-align:middle;}
.mt tr:nth-child(even) td{background:#f8faff;}
.n{text-align:center;width:32px;}
.nome{min-width:130px;}
.dim{font-family:monospace;font-size:10px;white-space:nowrap;}
.footer{border-top:2px solid #e0e0e0;margin-top:18px;padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;}
.assin{width:200px;border-top:1px solid #aaa;text-align:center;font-size:9px;color:#777;padding-top:4px;margin-top:40px;}
.totals{text-align:right;font-size:11px;}
.totals .row{display:flex;justify-content:flex-end;gap:32px;padding:2px 0;color:#555;}
.totals .row.final{font-size:14px;font-weight:bold;color:#1a4fa0;border-top:1px solid #ccc;padding-top:4px;margin-top:3px;}
.print-btn{display:block;margin:22px auto 0;padding:10px 36px;background:#1a4fa0;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;}
.print-btn:hover{background:#1555c0;}
@media print{.print-btn{display:none!important;}}
</style>
</head>
<body>
<div class="header">
    <div class="emp">
        ${(empresa.logo_header_path || empresa.logo) ? `<img src="${empresa.logo_header_path || empresa.logo}" alt="${empresa.nome}" style="height:38px;max-width:120px;object-fit:contain;display:block;margin-bottom:6px;">` : ''}
        <h1>${empresa.nome || 'Marcenaria'}</h1>
        <p>
            ${empresa.cnpj ? `CNPJ: ${empresa.cnpj}<br>` : ''}
            ${empresa.telefone ? `Tel: ${empresa.telefone}` : ''}
            ${empresa.email ? `&nbsp;&nbsp;Email: ${empresa.email}` : ''}
            ${(empresa.cidade || empresa.estado) ? `<br>${[empresa.cidade, empresa.estado].filter(Boolean).join(' — ')}` : ''}
        </p>
    </div>
    <div class="os-info">
        <div class="title">ORDEM DE SERVIÇO</div>
        <div class="num">${num}</div>
        <div class="date">Emitida em: ${fmtDt(orc.criado_em)}</div>
        ${orc.data_vencimento ? `<div class="date" style="color:#c00;font-weight:bold;">Prazo: ${fmtDt(orc.data_vencimento)}</div>` : ''}
    </div>
</div>

<div class="info-box">
    <div class="fi"><label>Cliente</label><span>${orc.cliente_nome || '—'}</span></div>
    <div class="fi"><label>Projeto</label><span>${orc.ambiente || '—'}</span></div>
    <div class="fi"><label>Status</label><span style="text-transform:capitalize">${orc.status || 'rascunho'}</span></div>
</div>

${modsHtml}

<div class="footer">
    <div><div class="assin">Responsável pela Produção</div></div>
    <div class="totals">
        <div class="row"><span>Custo de Materiais:</span><span>${R(orc.custo_material)}</span></div>
        <div class="row final"><span>Valor de Venda:</span><span>${R(orc.valor_venda)}</span></div>
    </div>
</div>

<button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
</body>
</html>`;
}

const dt = (s) => s ? new Date(s).toLocaleDateString('pt-BR') : '—';
const dtHr = (s) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

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
    const [confirmDel, setConfirmDel] = useState(null); // { id, nome }
    const [linkModal, setLinkModal] = useState(null); // { orc, token, views }
    const [loadingLink, setLoadingLink] = useState(null); // orc_id
    const [osModal, setOsModal] = useState(null);   // { orc, empresa }
    const [loadingOS, setLoadingOS] = useState(null); // orc_id

    // ─── Filtros ───────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = [...orcs];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(o =>
                o.cliente_nome?.toLowerCase().includes(q) ||
                o.ambiente?.toLowerCase().includes(q) ||
                o.obs?.toLowerCase().includes(q)
            );
        }
        if (statusFilter) list = list.filter(o => (o.kb_col || 'lead') === statusFilter);
        return list;
    }, [orcs, search, statusFilter]);

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
            const views = await api.get(`/portal/views/${orc.id}`);
            setLinkModal({ orc, token, views: views.views || [], total: views.total || 0 });
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

    // ─── Abrir OS (modal interno + print) ────────────────
    const abrirOS = async (orc) => {
        setLoadingOS(orc.id);
        try {
            const empresa = await api.get('/config/empresa');
            setOsModal({ orc, empresa });
        } catch {
            notify('Erro ao carregar dados da empresa');
        } finally {
            setLoadingOS(null);
        }
    };

    const printOS = (orc, empresa) => {
        const html = buildOsHtml(orc, empresa);
        const win = window.open('', '_blank', 'width=950,height=750');
        if (!win) { notify('Permita pop-ups para imprimir a OS'); return; }
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.focus(); win.print(); }, 600);
    };

    const totalValue = filtered.reduce((s, o) => s + (o.valor_venda || 0), 0);

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
                <button onClick={() => nav("novo", null)} className={Z.btn}>
                    <Ic.Plus /> Novo Orçamento
                </button>
            </div>

            {/* ─── Filtros ──────────────────────────────────── */}
            <div className="flex flex-col md:flex-row gap-3 mb-6">
                <div className="flex-1 relative">
                    <input
                        placeholder="Buscar por cliente, projeto ou notas..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className={`${Z.inp} !pl-9`}
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }}>
                        <Ic.Search />
                    </div>
                </div>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className={`${Z.inp} w-full md:w-48`}
                >
                    <option value="">Todos os status</option>
                    {KCOLS.map(c => <option key={c.id} value={c.id}>{c.nm}</option>)}
                </select>
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
                        <table className="w-full border-collapse text-left whitespace-nowrap">
                            <thead>
                                <tr>
                                    {['Data', 'Cliente', 'Projeto', 'Ambientes', 'Preço Final', 'Status', 'Ações'].map(h => (
                                        <th key={h} className={`${Z.th} ${['Ambientes', 'Preço Final'].includes(h) ? 'text-right' : ''}`}>
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
                                    const isLoadingThisOS = loadingOS === o.id;
                                    return (
                                        <tr key={o.id} className="group hover:bg-[var(--bg-muted)] transition-colors">
                                            <td className="td-glass">
                                                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                                                    {dt(o.criado_em)}
                                                </span>
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
                                            <td className="td-glass text-right" style={{ color: 'var(--text-muted)' }}>
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
                                                <span style={tagStyle(kc?.c)} className={tagClass}>
                                                    {kc?.nm || 'Lead'}
                                                </span>
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
                                                    {/* Ordem de Serviço */}
                                                    <button
                                                        onClick={() => abrirOS(o)}
                                                        className="p-1.5 rounded-md transition-colors hover:bg-orange-500/10"
                                                        style={{ color: isLoadingThisOS ? 'var(--text-muted)' : '#ea580c' }}
                                                        title="Ordem de Serviço (imprimir)"
                                                        disabled={isLoadingThisOS}
                                                    >
                                                        {isLoadingThisOS ? (
                                                            <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: '#ea580c', borderTopColor: 'transparent' }} />
                                                        ) : <Ic.OS />}
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
                                        <td colSpan={4} className="td-glass text-right text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
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

            {/* ─── Modal: Ordem de Serviço ──────────────────── */}
            {osModal && (
                <Modal title={`Ordem de Serviço — ${osModal.orc.cliente_nome}`} close={() => setOsModal(null)} w={720}>
                    <div className="flex flex-col gap-4">
                        {/* Cabeçalho OS */}
                        <div className="flex justify-between items-start p-3 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Número</div>
                                <div className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{osModal.orc.numero || `#${osModal.orc.id}`}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Cliente</div>
                                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{osModal.orc.cliente_nome}</div>
                                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{osModal.orc.ambiente || '—'}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Emissão</div>
                                <div className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{dt(osModal.orc.criado_em)}</div>
                                {osModal.orc.data_vencimento && (
                                    <div className="text-xs font-bold mt-0.5" style={{ color: '#ef4444' }}>Prazo: {dt(osModal.orc.data_vencimento)}</div>
                                )}
                            </div>
                        </div>

                        {/* Módulos por ambiente */}
                        <div className="max-h-[420px] overflow-y-auto flex flex-col gap-3">
                            {(osModal.orc.ambientes || []).length > 0
                                ? (osModal.orc.ambientes || []).map((amb, ai) => (
                                    <div key={ai}>
                                        <div className="flex justify-between items-center px-3 py-1.5 rounded-t-md text-xs font-bold text-white"
                                            style={{ background: 'var(--primary)' }}>
                                            <span>AMBIENTE {ai + 1}: {amb.nome || 'Sem nome'}</span>
                                            <span>{(amb.mods || []).length} módulo{(amb.mods || []).length !== 1 ? 's' : ''}</span>
                                        </div>
                                        <div className="overflow-x-auto rounded-b-md" style={{ border: '1px solid var(--border)', borderTop: 'none' }}>
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
                                                        {['Nº', 'Módulo', 'Acab. Ext / Esp.', 'Acab. Int / Esp.', 'L × A × P (mm)', 'Qtd'].map(h => (
                                                            <th key={h} className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                                    {(amb.mods || []).map((m, mi) => (
                                                        <tr key={mi} className="hover:bg-[var(--bg-hover)]">
                                                            <td className="px-2 py-1.5 text-center w-8" style={{ color: 'var(--text-muted)' }}>{mi + 1}</td>
                                                            <td className="px-2 py-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>{m.nome || m.tipo || '—'}</td>
                                                            <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{m.acabExt ? `${acabNome(m.acabExt)}${m.mmExt ? ' · ' + chapaInfo(m.mmExt) : ''}` : '—'}</td>
                                                            <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{m.acabInt ? `${acabNome(m.acabInt)}${m.mmInt ? ' · ' + chapaInfo(m.mmInt) : ''}` : '—'}</td>
                                                            <td className="px-2 py-1.5 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{m.l || 0} × {m.a || 0} × {m.p || 0}</td>
                                                            <td className="px-2 py-1.5 text-center font-bold" style={{ color: 'var(--primary)' }}>{m.qtd || 1}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))
                                : (osModal.orc.mods || []).length > 0
                                    ? (
                                        <div className="overflow-x-auto rounded-md" style={{ border: '1px solid var(--border)' }}>
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
                                                        {['Nº', 'Módulo', 'Acab. Ext / Esp.', 'Acab. Int / Esp.', 'L × A × P (mm)', 'Qtd'].map(h => (
                                                            <th key={h} className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                                    {(osModal.orc.mods || []).map((m, mi) => (
                                                        <tr key={mi} className="hover:bg-[var(--bg-hover)]">
                                                            <td className="px-2 py-1.5 text-center w-8" style={{ color: 'var(--text-muted)' }}>{mi + 1}</td>
                                                            <td className="px-2 py-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>{m.nome || m.tipo || '—'}</td>
                                                            <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{m.acabExt ? `${acabNome(m.acabExt)}${m.mmExt ? ' · ' + chapaInfo(m.mmExt) : ''}` : '—'}</td>
                                                            <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{m.acabInt ? `${acabNome(m.acabInt)}${m.mmInt ? ' · ' + chapaInfo(m.mmInt) : ''}` : '—'}</td>
                                                            <td className="px-2 py-1.5 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{m.l || 0} × {m.a || 0} × {m.p || 0}</td>
                                                            <td className="px-2 py-1.5 text-center font-bold" style={{ color: 'var(--primary)' }}>{m.qtd || 1}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                    : (
                                        <div className="py-10 text-center text-sm rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                            <div className="mb-2 flex justify-center"><Ic.Layers /></div>
                                            Nenhum módulo cadastrado neste orçamento.
                                        </div>
                                    )
                            }
                        </div>

                        {/* Totais */}
                        <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                Custo de materiais: <strong style={{ color: 'var(--text-secondary)' }}>{R$(osModal.orc.custo_material)}</strong>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Valor de Venda:</span>
                                <span className="text-xl font-bold" style={{ color: 'var(--primary)' }}>{R$(osModal.orc.valor_venda)}</span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-center pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={() => setOsModal(null)} className={Z.btn2}>Fechar</button>
                            <button
                                onClick={() => printOS(osModal.orc, osModal.empresa)}
                                className={Z.btn}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Ic.Printer /> Imprimir / PDF
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ─── Modal: Link Público + Histórico ──────────── */}
            {linkModal && (
                <Modal title="Link Público da Proposta" close={() => setLinkModal(null)} w={600}>
                    <div className="flex flex-col gap-5">
                        {/* Info proposta */}
                        <div className="p-3 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                {linkModal.orc.cliente_nome} — {linkModal.orc.ambiente || 'Sem nome'}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Valor: <strong style={{ color: 'var(--primary)' }}>{R$(linkModal.orc.valor_venda)}</strong>
                            </div>
                        </div>

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
                            <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                                Compartilhe este link com o cliente — ele pode visualizar a proposta sem precisar de conta.
                            </p>
                        </div>

                        {/* Histórico de acessos */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                                    HISTÓRICO DE ACESSOS
                                    <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: linkModal.total > 0 ? '#dbeafe' : 'var(--bg-muted)', color: linkModal.total > 0 ? '#1d4ed8' : 'var(--text-muted)' }}>
                                        {linkModal.total} {linkModal.total === 1 ? 'acesso' : 'acessos'}
                                    </span>
                                </div>
                            </div>
                            {linkModal.views.length === 0 ? (
                                <div className="py-6 text-center text-xs rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    <div className="mb-2 flex justify-center"><Ic.Eye /></div>
                                    Nenhum acesso registrado ainda.<br />
                                    <span className="opacity-70">Quando o cliente abrir o link, aparecerá aqui.</span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                                    {linkModal.views.map((v, i) => (
                                        <div key={i} className="flex items-center justify-between p-2 rounded-lg text-xs" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                            <div className="flex items-center gap-2">
                                                <span>{parseUA(v.user_agent)}</span>
                                                {v.ip_cliente && v.ip_cliente !== '::1' && (
                                                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{v.ip_cliente}</span>
                                                )}
                                            </div>
                                            <span style={{ color: 'var(--text-muted)' }}>{dtHr(v.acessado_em)}</span>
                                        </div>
                                    ))}
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
                            <button onClick={() => setLinkModal(null)} className={Z.btn2}>Fechar</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
