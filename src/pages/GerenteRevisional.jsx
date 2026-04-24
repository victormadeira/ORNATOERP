import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { Z, PageHeader, EmptyState } from '../ui';
import {
    Brain, RefreshCw, AlertTriangle, AlertCircle, Info, CheckCircle2, XCircle,
    Copy, MessageCircle, Phone, Clock, TrendingUp, Loader2, ChevronDown, ChevronRight,
    History, Zap, Activity,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Gerente Revisional IA — painel de ações do dia
// ═══════════════════════════════════════════════════════════════

const PRIO_META = {
    alta: { label: 'ALTA', icon: AlertTriangle, color: '#EF4444', bg: 'rgba(239,68,68,0.10)', ring: 'rgba(239,68,68,0.35)' },
    media: { label: 'MÉDIA', icon: AlertCircle, color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', ring: 'rgba(245,158,11,0.35)' },
    baixa: { label: 'BAIXA', icon: Info, color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', ring: 'rgba(59,130,246,0.35)' },
};

const STATUS_META = {
    pendente: { label: 'Pendente', color: 'var(--text-muted)' },
    aplicada: { label: 'Aplicada', color: '#10B981' },
    ignorada: { label: 'Ignorada', color: '#64748B' },
    resolvida: { label: 'Resolvida', color: '#10B981' },
};

function formatDateTime(s) {
    if (!s) return '—';
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function TipoAcaoBadge({ tipo }) {
    const map = {
        followup_audio: { label: '🎙️ Follow-up áudio', bg: 'rgba(201,169,110,0.15)', color: '#C9A96E' },
        followup_texto: { label: '💬 Follow-up texto', bg: 'rgba(59,130,246,0.15)', color: '#60A5FA' },
        followup_objecao: { label: '🛡️ Follow-up objeção', bg: 'rgba(239,68,68,0.15)', color: '#F87171' },
        ligar: { label: '📞 Ligar', bg: 'rgba(16,185,129,0.15)', color: '#34D399' },
        pausar: { label: '⏸️ Pausar lead', bg: 'rgba(100,116,139,0.15)', color: '#94A3B8' },
        revisar_proposta: { label: '📋 Revisar proposta', bg: 'rgba(139,92,246,0.15)', color: '#A78BFA' },
        escalar_humano: { label: '🆘 Escalar humano', bg: 'rgba(245,158,11,0.15)', color: '#FBBF24' },
    };
    const meta = map[tipo] || { label: tipo || '—', bg: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)' };
    return (
        <span style={{
            padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
        }}>{meta.label}</span>
    );
}

function AcaoCard({ acao, onResolver, onOpenConversa }) {
    const [expanded, setExpanded] = useState(acao.prioridade === 'alta');
    const [working, setWorking] = useState(false);
    const [copied, setCopied] = useState(false);

    const prio = PRIO_META[acao.prioridade] || PRIO_META.media;
    const Icon = prio.icon;

    const resolver = async (status) => {
        if (working) return;
        setWorking(true);
        try {
            await onResolver(acao.id, status);
        } finally {
            setWorking(false);
        }
    };

    const copyMsg = async () => {
        if (!acao.mensagem_sugerida) return;
        try {
            await navigator.clipboard.writeText(acao.mensagem_sugerida);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    const telefone = acao.cliente_telefone || acao.wa_phone || '';
    const waUrl = telefone ? `https://wa.me/${telefone.replace(/\D/g, '')}` : null;
    const isResolvida = acao.status !== 'pendente';

    return (
        <div
            style={{
                background: prio.bg,
                border: `1px solid ${prio.ring}`,
                borderLeftWidth: 4,
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                opacity: isResolvida ? 0.55 : 1,
                transition: 'opacity .2s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: prio.color, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: prio.color }}>
                            {prio.label}
                        </span>
                        <TipoAcaoBadge tipo={acao.tipo_acao} />
                        {isResolvida && (
                            <span style={{ fontSize: 11, color: STATUS_META[acao.status]?.color, fontWeight: 600 }}>
                                · {STATUS_META[acao.status]?.label}
                            </span>
                        )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                        {acao.nome_alvo || acao.cliente_nome || acao.wa_name || 'Contato sem nome'}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: 10 }}>
                        {acao.diagnostico}
                    </div>

                    <div style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                        fontSize: 13, lineHeight: 1.5, marginBottom: 10,
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 4 }}>
                            💡 AÇÃO SUGERIDA
                        </div>
                        {acao.acao_sugerida}
                    </div>

                    {acao.mensagem_sugerida && (
                        <div style={{ marginBottom: 10 }}>
                            <button
                                onClick={() => setExpanded(x => !x)}
                                style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    fontSize: 12, color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center', gap: 4,
                                }}
                            >
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                Mensagem sugerida
                            </button>
                            {expanded && (
                                <div style={{
                                    marginTop: 6, padding: 12, borderRadius: 8,
                                    background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.20)',
                                    fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: 'Inter',
                                }}>
                                    {acao.mensagem_sugerida}
                                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button onClick={copyMsg} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                                            {copied ? 'Copiado!' : 'Copiar'}
                                        </button>
                                        {waUrl && (
                                            <a
                                                href={`${waUrl}?text=${encodeURIComponent(acao.mensagem_sugerida)}`}
                                                target="_blank" rel="noreferrer"
                                                className={Z.btnASm}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                                            >
                                                <MessageCircle size={14} /> Abrir no WhatsApp
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!isResolvida && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                                onClick={() => resolver('aplicada')}
                                disabled={working}
                                className={Z.btnSm}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                                <CheckCircle2 size={14} /> Marquei como aplicada
                            </button>
                            <button
                                onClick={() => resolver('ignorada')}
                                disabled={working}
                                className={Z.btn2Sm}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                                <XCircle size={14} /> Ignorar
                            </button>
                            {acao.conversa_id && onOpenConversa && (
                                <button
                                    onClick={() => onOpenConversa(acao.conversa_id)}
                                    className={Z.btnGSm || Z.btn2Sm}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                    <MessageCircle size={14} /> Ver conversa
                                </button>
                            )}
                        </div>
                    )}
                    {isResolvida && (
                        <button
                            onClick={() => resolver('pendente')}
                            disabled={working}
                            className={Z.btn2Sm}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                        >
                            Reabrir
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function GerenteRevisional() {
    const [loading, setLoading] = useState(true);
    const [rodando, setRodando] = useState(false);
    const [data, setData] = useState({ relatorio: null, acoes: [] });
    const [stats, setStats] = useState(null);
    const [historico, setHistorico] = useState([]);
    const [mostrarHist, setMostrarHist] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState('pendente'); // pendente | todos

    const loadRelatorio = useCallback(async (relatorio_id = null) => {
        try {
            const q = relatorio_id ? `?relatorio_id=${relatorio_id}` : '';
            const r = await api.get(`/gerente/relatorio${q}`);
            setData(r || { relatorio: null, acoes: [] });
        } catch (e) {
            console.error('load relatorio:', e);
        }
    }, []);

    const loadStats = useCallback(async () => {
        try {
            const r = await api.get('/gerente/stats');
            setStats(r);
        } catch (e) { console.error(e); }
    }, []);

    const loadHistorico = useCallback(async () => {
        try {
            const r = await api.get('/gerente/historico?limit=15');
            setHistorico(r?.relatorios || []);
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([loadRelatorio(), loadStats(), loadHistorico()]);
            setLoading(false);
        })();
    }, [loadRelatorio, loadStats, loadHistorico]);

    const rodarAgora = async () => {
        if (rodando) return;
        setRodando(true);
        try {
            const r = await api.post('/gerente/rodar-agora');
            if (r?.ok) {
                await loadRelatorio();
                await loadStats();
                await loadHistorico();
            } else {
                alert(`Não foi possível rodar: ${r?.motivo || 'erro desconhecido'}`);
            }
        } catch (e) {
            alert('Erro: ' + (e?.message || e));
        } finally {
            setRodando(false);
        }
    };

    const resolverAcao = async (id, status) => {
        try {
            await api.post(`/gerente/acoes/${id}/resolver`, { status });
            await loadRelatorio(data.relatorio?.id);
        } catch (e) {
            alert('Erro ao atualizar: ' + (e?.message || e));
        }
    };

    const acoesFiltradas = useMemo(() => {
        if (filtroStatus === 'todos') return data.acoes;
        return data.acoes.filter(a => a.status === 'pendente');
    }, [data.acoes, filtroStatus]);

    const grupos = useMemo(() => {
        const g = { alta: [], media: [], baixa: [] };
        for (const a of acoesFiltradas) g[a.prioridade]?.push(a);
        return g;
    }, [acoesFiltradas]);

    const rel = data.relatorio;

    return (
        <div className={Z.pg}>
            <PageHeader
                icon={Brain}
                title="Gerente Revisional IA"
                subtitle="Auditoria diária da operação comercial. Claude Haiku 4.5 revê os leads e sugere ações urgentes."
                accent="accent"
            >
                <button
                    onClick={rodarAgora}
                    disabled={rodando || loading}
                    className={Z.btn}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                    {rodando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    {rodando ? 'Analisando...' : 'Rodar agora'}
                </button>
            </PageHeader>

            {loading && (
                <div className={Z.card} style={{ textAlign: 'center', padding: 40 }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </div>
            )}

            {!loading && !rel && (
                <EmptyState
                    icon={Brain}
                    title="Nenhum relatório ainda"
                    description="O gerente roda automaticamente todo dia às 07:30. Você também pode rodar manualmente no botão acima."
                />
            )}

            {!loading && rel && rel.erro && (
                <div className={Z.card} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <AlertTriangle size={20} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Erro no relatório de {formatDateTime(rel.gerado_em)}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{rel.erro}</div>
                        </div>
                    </div>
                </div>
            )}

            {!loading && rel && !rel.erro && (
                <>
                    {/* Resumo executivo */}
                    <div className={Z.card} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                            <Clock size={14} />
                            <span>Gerado em {formatDateTime(rel.gerado_em)} · modelo {rel.modelo} · {rel.leads_analisados} conversas analisadas</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                            <MetricBox label="Urgentes" value={rel.acoes_urgentes} color={PRIO_META.alta.color} icon={AlertTriangle} />
                            <MetricBox label="Médias" value={rel.acoes_media} color={PRIO_META.media.color} icon={AlertCircle} />
                            <MetricBox label="Baixas" value={rel.acoes_baixa} color={PRIO_META.baixa.color} icon={Info} />
                            <MetricBox label="Analisados" value={rel.leads_analisados} color="var(--text-muted)" icon={Activity} />
                        </div>

                        {rel.recomendacao && (
                            <div style={{
                                padding: 14, borderRadius: 10,
                                background: 'rgba(201,169,110,0.08)',
                                border: '1px solid rgba(201,169,110,0.25)',
                                display: 'flex', gap: 10, alignItems: 'flex-start',
                            }}>
                                <TrendingUp size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 4 }}>
                                        RECOMENDAÇÃO ESTRATÉGICA
                                    </div>
                                    <div style={{ fontSize: 14, lineHeight: 1.55 }}>{rel.recomendacao}</div>
                                </div>
                            </div>
                        )}

                        {Array.isArray(rel.padroes) && rel.padroes.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                                    PADRÕES DETECTADOS
                                </div>
                                {rel.padroes.map((p, i) => (
                                    <div key={i} style={{
                                        fontSize: 13, lineHeight: 1.5, padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 6,
                                        borderLeft: '3px solid var(--accent)',
                                    }}>
                                        {p}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Filtro */}
                    {data.acoes.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mostrar:</span>
                            <button
                                className={filtroStatus === 'pendente' ? Z.btnSm : Z.btn2Sm}
                                onClick={() => setFiltroStatus('pendente')}
                            >
                                Pendentes ({data.acoes.filter(a => a.status === 'pendente').length})
                            </button>
                            <button
                                className={filtroStatus === 'todos' ? Z.btnSm : Z.btn2Sm}
                                onClick={() => setFiltroStatus('todos')}
                            >
                                Todas ({data.acoes.length})
                            </button>
                        </div>
                    )}

                    {/* Listas */}
                    {acoesFiltradas.length === 0 ? (
                        <EmptyState
                            icon={CheckCircle2}
                            title="Nenhuma ação pendente"
                            description={rel.leads_analisados === 0
                                ? "Nenhuma conversa foi analisada. Comece a capturar leads pro gerente ter algo pra revisar."
                                : "Operação tranquila. Todas as ações foram resolvidas ou ignoradas."}
                        />
                    ) : (
                        <>
                            {grupos.alta.length > 0 && (
                                <Secao titulo={`🔴 Ações urgentes (${grupos.alta.length})`}>
                                    {grupos.alta.map(a => <AcaoCard key={a.id} acao={a} onResolver={resolverAcao} />)}
                                </Secao>
                            )}
                            {grupos.media.length > 0 && (
                                <Secao titulo={`🟡 Atenção média (${grupos.media.length})`}>
                                    {grupos.media.map(a => <AcaoCard key={a.id} acao={a} onResolver={resolverAcao} />)}
                                </Secao>
                            )}
                            {grupos.baixa.length > 0 && (
                                <Secao titulo={`🔵 Observações (${grupos.baixa.length})`}>
                                    {grupos.baixa.map(a => <AcaoCard key={a.id} acao={a} onResolver={resolverAcao} />)}
                                </Secao>
                            )}
                        </>
                    )}

                    {/* Stats + histórico */}
                    <div className={Z.card} style={{ marginTop: 24 }}>
                        <button
                            onClick={() => setMostrarHist(x => !x)}
                            style={{
                                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                                display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13,
                            }}
                        >
                            {mostrarHist ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <History size={14} /> Histórico & custos
                        </button>
                        {mostrarHist && (
                            <div style={{ marginTop: 14 }}>
                                {stats?.totais && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
                                        <MetricBox label="Relatórios (30d)" value={stats.totais.total_relatorios} color="var(--text-muted)" icon={Activity} />
                                        <MetricBox label="Custo total" value={`US$ ${Number(stats.totais.custo_total_usd).toFixed(4)}`} color="#10B981" icon={Zap} />
                                        <MetricBox label="Urgentes (30d)" value={stats.totais.total_urgentes} color={PRIO_META.alta.color} icon={AlertTriangle} />
                                        <MetricBox label="Tokens in/out" value={`${(stats.totais.tokens_input_total / 1000).toFixed(1)}k / ${(stats.totais.tokens_output_total / 1000).toFixed(1)}k`} color="var(--text-muted)" icon={Activity} />
                                    </div>
                                )}
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Últimos relatórios:</div>
                                {historico.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sem histórico ainda.</div>}
                                {historico.map(h => (
                                    <button
                                        key={h.id}
                                        onClick={() => loadRelatorio(h.id)}
                                        style={{
                                            display: 'flex', width: '100%', padding: '8px 10px', marginBottom: 4,
                                            background: rel?.id === h.id ? 'rgba(201,169,110,0.10)' : 'transparent',
                                            border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8,
                                            cursor: 'pointer', fontSize: 13, alignItems: 'center', gap: 10,
                                            color: 'inherit', textAlign: 'left',
                                        }}
                                    >
                                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                            {formatDateTime(h.gerado_em)}
                                        </span>
                                        <span style={{ flex: 1 }}>
                                            {h.erro
                                                ? <span style={{ color: '#F87171' }}>⚠ {h.erro}</span>
                                                : `${h.acoes_urgentes} urg · ${h.acoes_media} média · ${h.leads_analisados} leads`
                                            }
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            US$ {Number(h.custo_usd || 0).toFixed(4)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function MetricBox({ label, value, color, icon: Icon }) {
    return (
        <div style={{
            padding: 12, borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                {Icon && <Icon size={14} style={{ color }} />}
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {label}
                </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
                {value}
            </div>
        </div>
    );
}

function Secao({ titulo, children }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>
                {titulo}
            </div>
            {children}
        </div>
    );
}
