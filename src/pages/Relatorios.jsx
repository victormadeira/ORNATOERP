import { useState, useCallback } from 'react';
import { Z, Ic } from '../ui';
import api from '../api';
import { R$ } from '../engine';
import {
    FileText, Download, Calendar, Users, Briefcase, DollarSign,
    BarChart3, Clock, Filter, Table, ChevronDown
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────
const dtFmt = (s) => s ? new Date(s).toLocaleDateString('pt-BR') : '—';
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const KB_LABELS = {
    lead: 'Lead', orc: 'Orçamento', env: 'Enviado', neg: 'Negociação',
    ok: 'Aprovado', prod: 'Produção', mont: 'Montagem',
    arq: 'Arquivo', perdido: 'Perdido'
};

const STATUS_PROJ = {
    nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento',
    atrasado: 'Atrasado', concluido: 'Concluído', suspenso: 'Suspenso',
};

// ── CSV Export ──────────────────────────────────────
function exportCSV(data, columns, filename) {
    const header = columns.map(c => c.label).join(';');
    const rows = data.map(row =>
        columns.map(c => {
            let val = c.fmt ? c.fmt(row[c.key], row) : row[c.key];
            if (val === null || val === undefined) val = '';
            val = String(val).replace(/"/g, '""');
            if (String(val).includes(';') || String(val).includes('"') || String(val).includes('\n')) val = `"${val}"`;
            return val;
        }).join(';')
    );
    const csv = '\uFEFF' + [header, ...rows].join('\n'); // BOM for UTF-8
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Report Type Config ──────────────────────────────
const REPORTS = [
    {
        id: 'clientes',
        label: 'Clientes',
        icon: <Users size={20} />,
        color: '#3b82f6',
        desc: 'Lista completa de clientes com métricas de faturamento e conversão',
        usePeriodo: false,
    },
    {
        id: 'orcamentos',
        label: 'Orçamentos',
        icon: <FileText size={20} />,
        color: '#8b5cf6',
        desc: 'Todos os orçamentos com status, valores e vendedores',
        usePeriodo: true,
    },
    {
        id: 'projetos',
        label: 'Projetos',
        icon: <Briefcase size={20} />,
        color: '#f59e0b',
        desc: 'Projetos com progresso, receita, despesas e etapas',
        usePeriodo: true,
    },
    {
        id: 'financeiro',
        label: 'Financeiro',
        icon: <DollarSign size={20} />,
        color: '#22c55e',
        desc: 'Contas a receber, contas a pagar e despesas por projeto',
        usePeriodo: true,
    },
    {
        id: 'conversao',
        label: 'Conversão Pipeline',
        icon: <BarChart3 size={20} />,
        color: '#ec4899',
        desc: 'Taxa de conversão por etapa do pipeline e funil de vendas',
        usePeriodo: true,
    },
    {
        id: 'vendedores',
        label: 'Por Vendedor',
        icon: <Users size={20} />,
        color: '#14b8a6',
        desc: 'Performance individual: orçamentos, aprovações, valores e conversão',
        usePeriodo: true,
    },
];

// ── Column definitions for each report ──────────────
const COLUMNS = {
    clientes: [
        { key: 'nome', label: 'Nome' },
        { key: 'tel', label: 'Telefone' },
        { key: 'email', label: 'E-mail' },
        { key: 'cidade', label: 'Cidade' },
        { key: 'estado', label: 'UF' },
        { key: 'tipo_pessoa', label: 'Tipo', fmt: v => v === 'juridica' ? 'PJ' : 'PF' },
        { key: 'origem', label: 'Origem' },
        { key: 'total_orcamentos', label: 'Orçamentos' },
        { key: 'aprovados', label: 'Aprovados' },
        { key: 'total_faturado', label: 'Faturado', fmt: v => R$(v) },
        { key: 'total_projetos', label: 'Projetos' },
    ],
    orcamentos: [
        { key: 'numero', label: 'Número' },
        { key: 'cliente_nome', label: 'Cliente' },
        { key: 'ambiente', label: 'Ambiente' },
        { key: 'vendedor', label: 'Vendedor' },
        { key: 'kb_col', label: 'Status', fmt: v => KB_LABELS[v] || v },
        { key: 'tipo', label: 'Tipo', fmt: v => v === 'aditivo' ? 'Aditivo' : 'Original' },
        { key: 'valor_venda', label: 'Valor Venda', fmt: v => R$(v) },
        { key: 'custo_material', label: 'Custo Material', fmt: v => R$(v) },
        { key: 'criado_em', label: 'Criado em', fmt: v => dtFmt(v) },
    ],
    projetos: [
        { key: 'nome', label: 'Projeto' },
        { key: 'cliente_nome', label: 'Cliente' },
        { key: 'orc_numero', label: 'Orçamento' },
        { key: 'status', label: 'Status', fmt: v => STATUS_PROJ[v] || v },
        { key: 'valor_venda', label: 'Valor Venda', fmt: v => R$(v) },
        { key: 'recebido', label: 'Recebido', fmt: v => R$(v) },
        { key: 'a_receber', label: 'A Receber', fmt: v => R$(v) },
        { key: 'despesas', label: 'Despesas', fmt: v => R$(v) },
        { key: 'total_etapas', label: 'Etapas' },
        { key: 'etapas_concluidas', label: 'Concluídas' },
        { key: 'data_inicio', label: 'Início', fmt: v => dtFmt(v) },
        { key: 'data_vencimento', label: 'Vencimento', fmt: v => dtFmt(v) },
    ],
    financeiro_receber: [
        { key: 'descricao', label: 'Descrição' },
        { key: 'projeto_nome', label: 'Projeto' },
        { key: 'valor', label: 'Valor', fmt: v => R$(v) },
        { key: 'data_vencimento', label: 'Vencimento', fmt: v => dtFmt(v) },
        { key: 'data_pagamento', label: 'Pagamento', fmt: v => dtFmt(v) },
        { key: 'status', label: 'Status', fmt: v => v === 'pago' ? 'Pago' : 'Pendente' },
        { key: 'forma_pagamento', label: 'Forma' },
    ],
    financeiro_pagar: [
        { key: 'descricao', label: 'Descrição' },
        { key: 'fornecedor', label: 'Fornecedor' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'valor', label: 'Valor', fmt: v => R$(v) },
        { key: 'data_vencimento', label: 'Vencimento', fmt: v => dtFmt(v) },
        { key: 'data_pagamento', label: 'Pagamento', fmt: v => dtFmt(v) },
        { key: 'status', label: 'Status', fmt: v => v === 'pago' ? 'Pago' : 'Pendente' },
    ],
    conversao: [
        { key: 'etapa', label: 'Etapa Pipeline' },
        { key: 'total', label: 'Total' },
        { key: 'valor', label: 'Valor Total', fmt: v => R$(v) },
        { key: 'pct_total', label: '% do Total', fmt: v => `${v}%` },
    ],
    vendedores: [
        { key: 'nome', label: 'Vendedor' },
        { key: 'total_orcs', label: 'Orçamentos' },
        { key: 'valor_orcs', label: 'Valor Orçados', fmt: v => R$(v) },
        { key: 'aprovados', label: 'Aprovados' },
        { key: 'valor_aprovados', label: 'Valor Aprovados', fmt: v => R$(v) },
        { key: 'taxa_conversao', label: 'Conversão', fmt: v => `${v}%` },
        { key: 'ticket_medio', label: 'Ticket Médio', fmt: v => R$(v) },
        { key: 'perdidos', label: 'Perdidos' },
    ],
};

// ── Main Component ──────────────────────────────
export default function Relatorios({ notify }) {
    const [selected, setSelected] = useState(null);
    const [inicio, setInicio] = useState(firstOfMonth());
    const [fim, setFim] = useState(today());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const gerar = useCallback(async (tipo) => {
        setLoading(true);
        setData(null);
        try {
            const params = `?periodo_inicio=${inicio}&periodo_fim=${fim}`;
            const res = await api.get(`/dashboard/relatorio/${tipo}${params}`);
            setData(res);
        } catch (ex) {
            notify(ex.error || 'Erro ao gerar relatório');
        } finally {
            setLoading(false);
        }
    }, [inicio, fim, notify]);

    const handleSelect = (tipo) => {
        setSelected(tipo);
        setData(null);
    };

    const handleGerar = () => {
        if (selected) gerar(selected);
    };

    const handleExportCSV = () => {
        if (!data) return;
        if (data.tipo === 'financeiro') {
            // Export 3 separate CSVs
            if (data.contas_receber?.length > 0)
                exportCSV(data.contas_receber, COLUMNS.financeiro_receber, 'contas_receber');
            if (data.contas_pagar?.length > 0)
                exportCSV(data.contas_pagar, COLUMNS.financeiro_pagar, 'contas_pagar');
            notify('Relatórios financeiros exportados!');
        } else {
            const cols = COLUMNS[data.tipo];
            exportCSV(data.dados, cols, `relatorio_${data.tipo}`);
            notify('CSV exportado com sucesso!');
        }
    };

    const handlePrintPDF = () => {
        window.print();
    };

    const reportCfg = REPORTS.find(r => r.id === selected);

    return (
        <div className={Z.pg}>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    body { background: white !important; }
                    .glass-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; }
                }
                .print-only { display: none; }
            `}</style>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 no-print">
                <div>
                    <h1 className={Z.h1}>Relatórios</h1>
                    <p className={Z.sub}>Exporte dados em CSV ou imprima como PDF</p>
                </div>
            </div>

            {/* Report Selector */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 no-print">
                {REPORTS.map(r => (
                    <button key={r.id} onClick={() => handleSelect(r.id)}
                        className="glass-card p-4 text-left transition-all cursor-pointer hover:scale-[1.02]"
                        style={{
                            border: selected === r.id ? `2px solid ${r.color}` : '2px solid transparent',
                            background: selected === r.id ? `${r.color}08` : undefined,
                        }}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ background: `${r.color}15`, color: r.color }}>
                                {r.icon}
                            </div>
                            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{r.label}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{r.desc}</p>
                    </button>
                ))}
            </div>

            {/* Period + Generate */}
            {selected && (
                <div className="glass-card p-4 mb-6 no-print">
                    <div className="flex items-end gap-4 flex-wrap">
                        {reportCfg?.usePeriodo !== false && (
                            <>
                                <div>
                                    <label className={Z.lbl}>Início</label>
                                    <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
                                        className={Z.inp} style={{ width: 160 }} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Fim</label>
                                    <input type="date" value={fim} onChange={e => setFim(e.target.value)}
                                        className={Z.inp} style={{ width: 160 }} />
                                </div>
                            </>
                        )}
                        <button onClick={handleGerar} className={Z.btn} disabled={loading}>
                            {loading ? (
                                <><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} /> Gerando...</>
                            ) : (
                                <><BarChart3 size={14} /> Gerar Relatório</>
                            )}
                        </button>
                        {data && (
                            <>
                                <button onClick={handleExportCSV} className={Z.btn2}>
                                    <Download size={14} /> Exportar CSV
                                </button>
                                <button onClick={handlePrintPDF} className={Z.btn2}>
                                    <FileText size={14} /> Imprimir PDF
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Results */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                </div>
            )}

            {data && !loading && data.tipo !== 'financeiro' && (
                <div>
                    {/* Print Header */}
                    <div className="print-only" style={{ marginBottom: 20 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                            Relatório de {reportCfg?.label}
                        </h2>
                        <p style={{ fontSize: 12, color: '#64748b' }}>
                            {reportCfg?.usePeriodo !== false ? `Período: ${dtFmt(data.periodo?.inicio)} a ${dtFmt(data.periodo?.fim)}` : 'Todos os registros'}
                            {' · '}{data.dados?.length || 0} registros
                        </p>
                    </div>

                    {/* Summary */}
                    <div className="flex items-center gap-3 mb-4 no-print">
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {data.dados?.length || 0} registros encontrados
                        </span>
                        {data.periodo?.inicio && (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {dtFmt(data.periodo.inicio)} — {dtFmt(data.periodo.fim)}
                            </span>
                        )}
                    </div>

                    {/* Table */}
                    <div className="glass-card !p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left" style={{ fontSize: 12 }}>
                                <thead>
                                    <tr>
                                        {(COLUMNS[data.tipo] || []).map(c => (
                                            <th key={c.key} className={Z.th} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{c.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {(data.dados || []).map((row, i) => (
                                        <tr key={row.id || i} className="hover:bg-[var(--bg-muted)] transition-colors">
                                            {(COLUMNS[data.tipo] || []).map(c => (
                                                <td key={c.key} className="td-glass" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                                    {c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? '—')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Financial Report — special layout */}
            {data && !loading && data.tipo === 'financeiro' && (
                <div>
                    {/* Print Header */}
                    <div className="print-only" style={{ marginBottom: 20 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Relatório Financeiro</h2>
                        <p style={{ fontSize: 12, color: '#64748b' }}>
                            Período: {dtFmt(data.periodo?.inicio)} a {dtFmt(data.periodo?.fim)}
                        </p>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                        {[
                            { label: 'Total a Receber', value: R$(data.resumo?.totalReceber), color: '#3b82f6' },
                            { label: 'Recebido', value: R$(data.resumo?.totalRecebido), color: '#22c55e' },
                            { label: 'Total a Pagar', value: R$(data.resumo?.totalPagar), color: '#f59e0b' },
                            { label: 'Pago', value: R$(data.resumo?.totalPago), color: '#ef4444' },
                            { label: 'Despesas', value: R$(data.resumo?.totalDespesas), color: '#8b5cf6' },
                            { label: 'Saldo', value: R$(data.resumo?.saldo), color: data.resumo?.saldo >= 0 ? '#22c55e' : '#ef4444' },
                        ].map((c, i) => (
                            <div key={i} className="glass-card p-3 text-center">
                                <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{c.label}</div>
                                <div className="text-base font-bold" style={{ color: c.color }}>{c.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Contas a Receber */}
                    {data.contas_receber?.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                                Contas a Receber ({data.contas_receber.length})
                            </h3>
                            <div className="glass-card !p-0 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-left" style={{ fontSize: 12 }}>
                                        <thead>
                                            <tr>
                                                {COLUMNS.financeiro_receber.map(c => (
                                                    <th key={c.key} className={Z.th} style={{ fontSize: 11 }}>{c.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {data.contas_receber.map((row, i) => (
                                                <tr key={row.id || i} className="hover:bg-[var(--bg-muted)]">
                                                    {COLUMNS.financeiro_receber.map(c => (
                                                        <td key={c.key} className="td-glass" style={{ fontSize: 12 }}>
                                                            {c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? '—')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Contas a Pagar */}
                    {data.contas_pagar?.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                                Contas a Pagar ({data.contas_pagar.length})
                            </h3>
                            <div className="glass-card !p-0 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-left" style={{ fontSize: 12 }}>
                                        <thead>
                                            <tr>
                                                {COLUMNS.financeiro_pagar.map(c => (
                                                    <th key={c.key} className={Z.th} style={{ fontSize: 11 }}>{c.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {data.contas_pagar.map((row, i) => (
                                                <tr key={row.id || i} className="hover:bg-[var(--bg-muted)]">
                                                    {COLUMNS.financeiro_pagar.map(c => (
                                                        <td key={c.key} className="td-glass" style={{ fontSize: 12 }}>
                                                            {c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? '—')}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Empty state when no report selected */}
            {!selected && (
                <div className="glass-card p-16 text-center no-print" style={{ color: 'var(--text-muted)' }}>
                    <BarChart3 size={40} className="mx-auto mb-4 opacity-30" />
                    <p className="text-sm font-medium">Selecione um tipo de relatório acima</p>
                    <p className="text-xs mt-1">Escolha entre Clientes, Orçamentos, Projetos, Financeiro, Conversão ou Vendedores</p>
                </div>
            )}
        </div>
    );
}
