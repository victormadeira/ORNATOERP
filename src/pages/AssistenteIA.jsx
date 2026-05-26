import { useState, useEffect, useCallback, useRef } from 'react';
import { Z, Modal, PageHeader, TabBar, EmptyState } from '../ui';
import api from '../api';
import { useAuth } from '../auth';
import {
    Sparkles, Bot, RefreshCw, Send, CheckCircle2,
    XCircle, TrendingUp, BookOpen, Plus, Trash2, ToggleLeft, ToggleRight,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// ASSISTENTE IA — Dashboard CRM Inteligente
// ═══════════════════════════════════════════════════════

const PRIO_COLORS = {
    alta: { bg: 'var(--danger-bg)', color: 'var(--danger)', border: 'var(--danger-border)', label: 'Alta' },
    media: { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'var(--warning-border)', label: 'Media' },
    baixa: { bg: 'var(--success-bg)', color: 'var(--success)', border: 'var(--success-border)', label: 'Baixa' },
};

const CTX_TIPOS = [
    { id: 'instrucao', label: 'Instrução', desc: 'Como a IA deve se comportar' },
    { id: 'faq', label: 'FAQ', desc: 'Perguntas frequentes e respostas' },
    { id: 'resposta_padrao', label: 'Resposta Padrão', desc: 'Templates de resposta' },
    { id: 'info_empresa', label: 'Info Empresa', desc: 'Informações sobre produtos/serviços' },
];

export default function AssistenteIA({ notify }) {
    const { isGerente } = useAuth();
    const [tab, setTab] = useState('followups');
    const [followups, setFollowups] = useState([]);
    const [loading, setLoading] = useState(false);

    // Chat CRM
    const [pergunta, setPergunta] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [typing, setTyping] = useState(false);
    const chatEndRef = useRef(null);

    // Base de Conhecimento
    const [contextos, setContextos] = useState([]);
    const [showNovoCtx, setShowNovoCtx] = useState(false);
    const [novoCtx, setNovoCtx] = useState({ tipo: 'faq', titulo: '', conteudo: '' });

    // ═══ Carregar dados ═══
    const loadFollowups = useCallback(async () => {
        try {
            const data = await api.get('/ia/followups');
            setFollowups(data);
        } catch { /* */ }
    }, []);

    const loadContextos = useCallback(async () => {
        try {
            const data = await api.get('/ia/contexto');
            setContextos(data);
        } catch { /* */ }
    }, []);

    useEffect(() => {
        loadFollowups();
        loadContextos();
    }, [loadFollowups, loadContextos]);

    // ═══ Gerar follow-ups ═══
    const gerarFollowups = async () => {
        setLoading(true);
        try {
            const r = await api.post('/ia/gerar-followups');
            notify?.(`${r.gerados} sugestao(oes) gerada(s)!`);
            loadFollowups();
        } catch (e) {
            notify?.(e.error || 'Erro ao gerar follow-ups. Verifique a configuração da IA.');
        } finally { setLoading(false); }
    };

    // ═══ Marcar follow-up ═══
    const markFollowup = async (id, status) => {
        await api.put(`/ia/followups/${id}`, { status });
        setFollowups(prev => prev.filter(f => f.id !== id));
        notify?.(status === 'feito' ? 'Marcado como feito' : 'Ignorado');
    };

    // ═══ Chat CRM ═══
    const askCRM = async () => {
        if (!pergunta.trim() || loading) return;
        setLoading(true);
        setTyping(true);
        const q = pergunta;
        setPergunta('');
        setChatHistory(prev => [...prev, { role: 'user', content: q }]);
        try {
            const r = await api.post('/ia/chat', { pergunta: q });
            setTyping(false);
            setChatHistory(prev => [...prev, { role: 'assistant', content: r.resposta }]);
        } catch (e) {
            setTyping(false);
            setChatHistory(prev => [...prev, { role: 'assistant', content: `Erro: ${e.error || 'Falha na consulta'}` }]);
        } finally { setLoading(false); }
    };

    // Auto-scroll ao fundo quando novas mensagens chegam
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, typing]);

    // ═══ CRUD Contexto ═══
    const salvarContexto = async () => {
        if (!novoCtx.tipo || !novoCtx.conteudo) return notify?.('Preencha tipo e conteúdo');
        try {
            await api.post('/ia/contexto', novoCtx);
            setShowNovoCtx(false);
            setNovoCtx({ tipo: 'faq', titulo: '', conteudo: '' });
            loadContextos();
            notify?.('Contexto adicionado!');
        } catch (e) { notify?.(e.error || 'Erro'); }
    };

    const toggleContexto = async (ctx) => {
        await api.put(`/ia/contexto/${ctx.id}`, { ...ctx, ativo: ctx.ativo ? 0 : 1 });
        loadContextos();
    };

    const deleteContexto = async (id) => {
        await api.del(`/ia/contexto/${id}`);
        loadContextos();
        notify?.('Removido');
    };

    // ═══ Tabs ═══
    const TABS = [
        { id: 'followups', label: 'Follow-ups', icon: TrendingUp },
        { id: 'chat', label: 'Consultar CRM', icon: Bot },
        { id: 'conhecimento', label: 'Base de Conhecimento', icon: BookOpen },
    ];

    return (
        <div className={Z.pg}>
            <PageHeader icon={Sparkles} title="Assistente IA" subtitle="Inteligência artificial para gestão de clientes e CRM" />

            <TabBar tabs={TABS} active={tab} onChange={setTab} />

            {/* ═══ Tab: Follow-ups ═══ */}
            {tab === 'followups' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                            {followups.length} sugestão(ões) pendente(s)
                        </p>
                        <button
                            onClick={gerarFollowups}
                            disabled={loading}
                            className={Z.btn}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1 }}
                        >
                            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            Gerar Sugestões
                        </button>
                    </div>

                    {followups.length === 0 && !loading && (
                        <EmptyState icon={Bot} title="Nenhum follow-up pendente" description='Clique em "Gerar Sugestões" para a IA analisar seu funil de vendas.' />
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {followups.map(f => {
                            const prio = PRIO_COLORS[f.prioridade] || PRIO_COLORS.media;
                            return (
                                <div key={f.id} className={Z.card} style={{ padding: 16, borderLeft: `4px solid ${prio.color}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                <span style={{
                                                    fontSize: 10, padding: '2px 8px', borderRadius: 99,
                                                    background: prio.bg, color: prio.color, fontWeight: 700,
                                                }}>
                                                    {prio.label}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {f.cliente_nome || 'Cliente'}
                                                </span>
                                                {f.orc_numero && (
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        · {f.orc_numero}
                                                    </span>
                                                )}
                                            </div>
                                            {f.orc_ambiente && (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                                                    {f.orc_ambiente} · R$ {Number(f.orc_valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </div>
                                            )}
                                            <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                                {f.mensagem}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <button
                                                onClick={() => markFollowup(f.id, 'feito')}
                                                style={{
                                                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                                    background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)',
                                                    fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                                }}
                                            >
                                                <CheckCircle2 size={12} /> Feito
                                            </button>
                                            <button
                                                onClick={() => markFollowup(f.id, 'ignorado')}
                                                style={{
                                                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                                    background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                                                    fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                                }}
                                            >
                                                <XCircle size={12} /> Ignorar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══ Tab: Chat CRM ═══ */}
            {tab === 'chat' && (
                <div className={Z.card} style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 520, overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Bot size={16} style={{ color: 'var(--primary)' }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Consultar CRM com IA</span>
                        </div>
                        {chatHistory.length > 0 && (
                            <button onClick={() => setChatHistory([])} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <XCircle size={12} /> Limpar
                            </button>
                        )}
                    </div>

                    {/* Histórico */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {chatHistory.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', margin: 'auto' }}>
                                <Bot size={36} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
                                <p style={{ fontSize: 13, marginBottom: 16 }}>Pergunte qualquer coisa sobre seus dados de vendas</p>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    {[
                                        'Qual meu ticket médio?',
                                        'Quais clientes estão parados?',
                                        'Resumo do funil de vendas',
                                    ].map(q => (
                                        <button key={q} onClick={() => setPergunta(q)} style={{
                                            fontSize: 12, padding: '6px 12px', borderRadius: 8,
                                            background: 'var(--bg-muted)', color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)', cursor: 'pointer',
                                        }}>
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {chatHistory.map((m, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{
                                    maxWidth: '82%',
                                    padding: '10px 14px',
                                    borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    background: m.role === 'user' ? 'var(--primary)' : 'var(--bg-elevated)',
                                    color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                                    fontSize: 13.5,
                                    lineHeight: 1.6,
                                    whiteSpace: 'pre-wrap',
                                }}>
                                    {m.content}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, paddingInline: 2 }}>
                                    {m.role === 'user' ? 'Você' : 'Assistente IA'}
                                </div>
                            </div>
                        ))}
                        {/* Indicador de digitando */}
                        {typing && (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                                <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'var(--bg-elevated)' }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {[0, 1, 2].map(d => (
                                            <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: `bounce 1.2s ease ${d * 0.2}s infinite` }} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input fixo no rodapé */}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                        <input
                            className={Z.inp}
                            placeholder="Pergunte sobre clientes, orçamentos, pipeline…"
                            value={pergunta}
                            onChange={e => setPergunta(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askCRM(); } }}
                            style={{ flex: 1, fontSize: 13 }}
                            disabled={loading}
                        />
                        <button
                            onClick={askCRM}
                            disabled={!pergunta.trim() || loading}
                            className={Z.btn}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                        >
                            {loading ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={14} />}
                        </button>
                    </div>
                    <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} } @keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            {/* ═══ Tab: Base de Conhecimento ═══ */}
            {tab === 'conhecimento' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                                Treine a IA com informações sobre sua empresa, produtos e serviços.
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                {contextos.filter(c => c.ativo).length} entrada(s) ativa(s) de {contextos.length} total
                            </p>
                        </div>
                        {isGerente && (
                            <button
                                onClick={() => setShowNovoCtx(true)}
                                className={Z.btn}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Plus size={14} /> Adicionar
                            </button>
                        )}
                    </div>

                    {contextos.length === 0 && (
                        <EmptyState icon={BookOpen} title="Nenhuma entrada na base de conhecimento" description="Adicione informações para a IA usar nas respostas aos clientes." />
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {contextos.map(ctx => {
                            const tipoInfo = CTX_TIPOS.find(t => t.id === ctx.tipo) || { label: ctx.tipo };
                            return (
                                <div key={ctx.id} className={Z.card} style={{ padding: 16, opacity: ctx.ativo ? 1 : 0.5 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                <span style={{
                                                    fontSize: 10, padding: '2px 8px', borderRadius: 99,
                                                    background: 'var(--accent-alpha)', color: 'var(--accent)', fontWeight: 700,
                                                }}>
                                                    {tipoInfo.label}
                                                </span>
                                                {ctx.titulo && (
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        {ctx.titulo}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{
                                                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
                                                maxHeight: 80, overflow: 'hidden',
                                            }}>
                                                {ctx.conteudo}
                                            </div>
                                        </div>
                                        {isGerente && (
                                            <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                                                <button
                                                    onClick={() => toggleContexto(ctx)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                                    title={ctx.ativo ? 'Desativar' : 'Ativar'}
                                                >
                                                    {ctx.ativo
                                                        ? <ToggleRight size={20} style={{ color: 'var(--success)' }} />
                                                        : <ToggleLeft size={20} style={{ color: 'var(--text-muted)' }} />
                                                    }
                                                </button>
                                                <button
                                                    onClick={() => deleteContexto(ctx.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ═══ Modal: Novo Contexto ═══ */}
            {showNovoCtx && (
                <Modal title="Adicionar à Base de Conhecimento" close={() => setShowNovoCtx(false)} w={500}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label className={Z.lbl}>Tipo</label>
                            <select
                                className={Z.inp}
                                value={novoCtx.tipo}
                                onChange={e => setNovoCtx(p => ({ ...p, tipo: e.target.value }))}
                            >
                                {CTX_TIPOS.map(t => (
                                    <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={Z.lbl}>Título (opcional)</label>
                            <input
                                className={Z.inp}
                                placeholder="Ex: Prazo de entrega"
                                value={novoCtx.titulo}
                                onChange={e => setNovoCtx(p => ({ ...p, titulo: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className={Z.lbl}>Conteúdo</label>
                            <textarea
                                className={Z.inp}
                                rows={6}
                                placeholder="Ex: O prazo de entrega padrão é de 30 a 45 dias úteis após a aprovação do projeto..."
                                value={novoCtx.conteudo}
                                onChange={e => setNovoCtx(p => ({ ...p, conteudo: e.target.value }))}
                            />
                        </div>
                        <button onClick={salvarContexto} className={Z.btn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Plus size={14} /> Salvar
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
