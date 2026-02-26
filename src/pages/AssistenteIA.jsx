import { useState, useEffect, useCallback } from 'react';
import { Z, Ic, Modal } from '../ui';
import api from '../api';
import { useAuth } from '../auth';
import {
    Sparkles, Bot, MessageCircle, RefreshCw, Send, CheckCircle2,
    XCircle, Phone, FileText, TrendingUp, BookOpen, Plus, Trash2, ToggleLeft, ToggleRight,
    Megaphone, Instagram, Copy, Calendar, Edit3, Eye, Loader2, Check, Image, Type, Target
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// ASSISTENTE IA — Dashboard CRM Inteligente
// ═══════════════════════════════════════════════════════

const PRIO_COLORS = {
    alta: { bg: '#ef444420', color: '#ef4444', border: '#ef444440', label: 'Alta' },
    media: { bg: '#f59e0b20', color: '#f59e0b', border: '#f59e0b40', label: 'Media' },
    baixa: { bg: '#22c55e20', color: '#22c55e', border: '#22c55e40', label: 'Baixa' },
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
    const [resposta, setResposta] = useState('');
    const [chatHistory, setChatHistory] = useState([]);

    // Resumo
    const [resumo, setResumo] = useState('');

    // Base de Conhecimento
    const [contextos, setContextos] = useState([]);
    const [showNovoCtx, setShowNovoCtx] = useState(false);
    const [novoCtx, setNovoCtx] = useState({ tipo: 'faq', titulo: '', conteudo: '' });

    // Marketing / Conteúdo
    const [mktConteudos, setMktConteudos] = useState([]);
    const [mktLoading, setMktLoading] = useState(false);
    const [mktGerado, setMktGerado] = useState('');
    const [mktForm, setMktForm] = useState({ tipo: 'post_instagram', tema: '', tom: '', plataforma: 'instagram' });
    const [mktGerando, setMktGerando] = useState(false);
    const [mktEditId, setMktEditId] = useState(null);
    const [mktEditData, setMktEditData] = useState({});
    const [showSalvarGerado, setShowSalvarGerado] = useState(false);
    const [salvarTitulo, setSalvarTitulo] = useState('');
    const [copiedId, setCopiedId] = useState(null);

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

    const loadMktConteudos = useCallback(async () => {
        try {
            const data = await api.get('/ia/marketing');
            setMktConteudos(data);
        } catch { /* */ }
    }, []);

    useEffect(() => {
        loadFollowups();
        loadContextos();
        loadMktConteudos();
    }, [loadFollowups, loadContextos, loadMktConteudos]);

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
        if (!pergunta.trim()) return;
        setLoading(true);
        const q = pergunta;
        setPergunta('');
        setChatHistory(prev => [...prev, { role: 'user', content: q }]);
        try {
            const r = await api.post('/ia/chat', { pergunta: q });
            setChatHistory(prev => [...prev, { role: 'assistant', content: r.resposta }]);
        } catch (e) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: `Erro: ${e.error || 'Falha na consulta'}` }]);
        } finally { setLoading(false); }
    };

    // ═══ Resumo semanal ═══
    const gerarResumo = async () => {
        setLoading(true);
        setResumo('');
        try {
            const r = await api.post('/ia/resumo');
            setResumo(r.resumo);
        } catch (e) {
            setResumo('Erro: ' + (e.error || 'Falha ao gerar resumo'));
        } finally { setLoading(false); }
    };

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

    // ═══ Marketing: Gerar conteúdo ═══
    const gerarConteudo = async () => {
        if (!mktForm.tema.trim()) return notify?.('Informe o tema do conteúdo');
        setMktGerando(true);
        setMktGerado('');
        try {
            const r = await api.post('/ia/gerar-conteudo', mktForm);
            setMktGerado(r.conteudo);
        } catch (e) {
            notify?.(e.error || 'Erro ao gerar conteúdo. Verifique a configuração da IA.');
        } finally { setMktGerando(false); }
    };

    const salvarConteudoGerado = async () => {
        if (!salvarTitulo.trim()) return notify?.('Informe um título');
        try {
            await api.post('/ia/marketing', {
                titulo: salvarTitulo,
                tipo: mktForm.tipo,
                texto: mktGerado,
                plataforma: mktForm.plataforma,
                status: 'rascunho',
            });
            setShowSalvarGerado(false);
            setSalvarTitulo('');
            notify?.('Conteudo salvo!');
            loadMktConteudos();
        } catch (e) { notify?.(e.error || 'Erro ao salvar'); }
    };

    const updateMktConteudo = async (id) => {
        try {
            await api.put(`/ia/marketing/${id}`, mktEditData);
            setMktEditId(null);
            loadMktConteudos();
            notify?.('Atualizado!');
        } catch (e) { notify?.(e.error || 'Erro ao atualizar'); }
    };

    const deleteMktConteudo = async (id) => {
        try {
            await api.del(`/ia/marketing/${id}`);
            loadMktConteudos();
            notify?.('Removido');
        } catch (e) { notify?.(e.error || 'Erro'); }
    };

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            notify?.('Copiado!');
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const MKT_TIPOS = {
        post_instagram: { label: 'Post Instagram', icon: <Instagram size={14} />, color: '#E4405F' },
        copy_anuncio: { label: 'Copy Anúncio', icon: <Target size={14} />, color: '#1877F2' },
        descricao_projeto: { label: 'Descrição Projeto', icon: <Type size={14} />, color: '#22c55e' },
    };

    const MKT_STATUS_COLORS = {
        rascunho: { bg: '#64748b20', color: '#64748b', label: 'Rascunho' },
        agendado: { bg: '#3b82f620', color: '#3b82f6', label: 'Agendado' },
        publicado: { bg: '#22c55e20', color: '#22c55e', label: 'Publicado' },
    };

    // ═══ Tabs ═══
    const TABS = [
        { id: 'followups', label: 'Follow-ups', icon: <TrendingUp size={14} /> },
        { id: 'chat', label: 'Consultar CRM', icon: <Bot size={14} /> },
        { id: 'resumo', label: 'Resumo Semanal', icon: <FileText size={14} /> },
        { id: 'conhecimento', label: 'Base de Conhecimento', icon: <BookOpen size={14} /> },
        { id: 'conteudo', label: 'Conteúdo Marketing', icon: <Megaphone size={14} /> },
    ];

    return (
        <div className={Z.pg}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Sparkles size={20} color="#fff" />
                </div>
                <div>
                    <h1 className={Z.h1} style={{ margin: 0 }}>Assistente IA</h1>
                    <p className={Z.sub} style={{ margin: 0 }}>Inteligência artificial para gestão de clientes e CRM</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        style={{
                            padding: '8px 16px', fontSize: 13, fontWeight: 600,
                            border: 'none', cursor: 'pointer', borderRadius: 8,
                            background: tab === t.id ? 'var(--primary)' : 'var(--bg-muted)',
                            color: tab === t.id ? '#fff' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

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
                        <div className={Z.card} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <Bot size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 14 }}>Nenhum follow-up pendente.</p>
                            <p style={{ fontSize: 12 }}>Clique em "Gerar Sugestões" para a IA analisar seu funil de vendas.</p>
                        </div>
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
                                                    background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40',
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
                <div>
                    <div className={Z.card} style={{ marginBottom: 16, padding: 16 }}>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                            Pergunte qualquer coisa sobre seus clientes, orçamentos e pipeline de vendas. A IA vai analisar seus dados e responder.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                className={Z.inp}
                                placeholder="Ex: Quais clientes não respondem há mais de 7 dias?"
                                value={pergunta}
                                onChange={e => setPergunta(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') askCRM(); }}
                                style={{ flex: 1, fontSize: 14 }}
                            />
                            <button
                                onClick={askCRM}
                                disabled={!pergunta.trim() || loading}
                                className={Z.btn}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: !pergunta.trim() || loading ? 0.5 : 1 }}
                            >
                                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* Histórico do chat */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {chatHistory.map((m, i) => (
                            <div key={i} className={Z.card} style={{
                                padding: 16,
                                borderLeft: `4px solid ${m.role === 'user' ? 'var(--primary)' : '#8b5cf6'}`,
                            }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: m.role === 'user' ? 'var(--primary)' : '#8b5cf6', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {m.role === 'user' ? <><Send size={10} /> Você</> : <><Bot size={10} /> Assistente IA</>}
                                </div>
                                <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                    </div>

                    {chatHistory.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <Bot size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 13 }}>Faça uma pergunta para começar</p>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                                {[
                                    'Qual meu ticket médio?',
                                    'Quais clientes estão parados?',
                                    'Resumo do funil de vendas',
                                ].map(q => (
                                    <button
                                        key={q}
                                        onClick={() => { setPergunta(q); }}
                                        style={{
                                            fontSize: 12, padding: '6px 12px', borderRadius: 8,
                                            background: 'var(--bg-muted)', color: 'var(--text-muted)',
                                            border: '1px solid var(--border)', cursor: 'pointer',
                                        }}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Tab: Resumo Semanal ═══ */}
            {tab === 'resumo' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                            Resumo executivo gerado pela IA com base nos dados do CRM.
                        </p>
                        <button
                            onClick={gerarResumo}
                            disabled={loading}
                            className={Z.btn}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1 }}
                        >
                            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            Gerar Resumo
                        </button>
                    </div>

                    {resumo ? (
                        <div className={Z.card} style={{
                            padding: 24, borderLeft: '4px solid #8b5cf6',
                        }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Sparkles size={12} /> RESUMO SEMANAL — {new Date().toLocaleDateString('pt-BR')}
                            </div>
                            <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                                {resumo}
                            </div>
                        </div>
                    ) : (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 14 }}>Clique em "Gerar Resumo" para a IA analisar seus dados.</p>
                        </div>
                    )}
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
                        <div className={Z.card} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <BookOpen size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                            <p style={{ fontSize: 14 }}>Nenhuma entrada na base de conhecimento.</p>
                            <p style={{ fontSize: 12 }}>Adicione informações para a IA usar nas respostas aos clientes.</p>
                        </div>
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
                                                    background: '#8b5cf620', color: '#8b5cf6', fontWeight: 700,
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
                                                        ? <ToggleRight size={20} style={{ color: '#22c55e' }} />
                                                        : <ToggleLeft size={20} style={{ color: 'var(--text-muted)' }} />
                                                    }
                                                </button>
                                                <button
                                                    onClick={() => deleteContexto(ctx.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={14} style={{ color: '#ef4444' }} />
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

            {/* ═══ Tab: Conteúdo Marketing ═══ */}
            {tab === 'conteudo' && (
                <div>
                    {/* Gerador de Conteúdo */}
                    <div className={Z.card} style={{ padding: 20, marginBottom: 20 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Sparkles size={16} style={{ color: '#8b5cf6' }} /> Gerador de Conteúdo com IA
                        </h3>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                            A IA vai usar dados reais dos seus projetos para criar conteúdo personalizado.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                            <div>
                                <label className={Z.lbl}>Tipo de conteúdo</label>
                                <select className={Z.inp} value={mktForm.tipo} onChange={e => setMktForm(f => ({ ...f, tipo: e.target.value }))}>
                                    <option value="post_instagram">Post Instagram</option>
                                    <option value="copy_anuncio">Copy para Anúncio</option>
                                    <option value="descricao_projeto">Descrição de Projeto</option>
                                </select>
                            </div>
                            <div>
                                <label className={Z.lbl}>Plataforma</label>
                                <select className={Z.inp} value={mktForm.plataforma} onChange={e => setMktForm(f => ({ ...f, plataforma: e.target.value }))}>
                                    <option value="instagram">Instagram</option>
                                    <option value="facebook">Facebook</option>
                                    <option value="whatsapp">WhatsApp Status</option>
                                    <option value="site">Site / Portfólio</option>
                                    <option value="google_ads">Google Ads</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
                            <div>
                                <label className={Z.lbl}>Tema / Assunto *</label>
                                <input
                                    className={Z.inp}
                                    placeholder="Ex: Cozinha moderna com ilha central, Closet planejado casal..."
                                    value={mktForm.tema}
                                    onChange={e => setMktForm(f => ({ ...f, tema: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className={Z.lbl}>Tom da mensagem</label>
                                <select className={Z.inp} value={mktForm.tom} onChange={e => setMktForm(f => ({ ...f, tom: e.target.value }))}>
                                    <option value="">Padrão</option>
                                    <option value="profissional e sofisticado">Profissional / Sofisticado</option>
                                    <option value="casual e amigável">Casual / Amigável</option>
                                    <option value="persuasivo e direto">Persuasivo / Direto</option>
                                    <option value="inspirador e emocional">Inspirador / Emocional</option>
                                    <option value="técnico e detalhista">Técnico / Detalhista</option>
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={gerarConteudo}
                            disabled={mktGerando || !mktForm.tema.trim()}
                            className={Z.btn}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                opacity: mktGerando || !mktForm.tema.trim() ? 0.6 : 1,
                            }}
                        >
                            {mktGerando ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                            {mktGerando ? 'Gerando...' : 'Gerar Conteúdo'}
                        </button>
                    </div>

                    {/* Resultado gerado */}
                    {mktGerado && (
                        <div className={Z.card} style={{ padding: 20, marginBottom: 20, borderLeft: '4px solid #8b5cf6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Sparkles size={12} /> CONTEÚDO GERADO
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        onClick={() => copyToClipboard(mktGerado, 'gerado')}
                                        style={{
                                            padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                            background: copiedId === 'gerado' ? '#22c55e20' : 'var(--bg-muted)',
                                            color: copiedId === 'gerado' ? '#22c55e' : 'var(--text-muted)',
                                            border: `1px solid ${copiedId === 'gerado' ? '#22c55e40' : 'var(--border)'}`,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        {copiedId === 'gerado' ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedId === 'gerado' ? 'Copiado!' : 'Copiar'}
                                    </button>
                                    <button
                                        onClick={() => { setShowSalvarGerado(true); setSalvarTitulo(`${MKT_TIPOS[mktForm.tipo]?.label || 'Conteúdo'} — ${mktForm.tema.slice(0, 40)}`); }}
                                        style={{
                                            padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                            background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640',
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <Plus size={12} /> Salvar no Calendário
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                                {mktGerado}
                            </div>
                        </div>
                    )}

                    {/* Modal salvar gerado */}
                    {showSalvarGerado && (
                        <Modal title="Salvar Conteúdo" close={() => setShowSalvarGerado(false)} w={420}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                    <label className={Z.lbl}>Título</label>
                                    <input className={Z.inp} value={salvarTitulo} onChange={e => setSalvarTitulo(e.target.value)} placeholder="Título do conteúdo" />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Data de publicação (opcional)</label>
                                    <input className={Z.inp} type="date" onChange={e => setMktForm(f => ({ ...f, data_publicar: e.target.value }))} />
                                </div>
                                <button onClick={salvarConteudoGerado} className={Z.btn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <Plus size={14} /> Salvar
                                </button>
                            </div>
                        </Modal>
                    )}

                    {/* Lista de conteúdos salvos */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Calendar size={14} /> Conteúdos Salvos
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>({mktConteudos.length})</span>
                        </h3>
                    </div>

                    {mktConteudos.length === 0 && (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <Megaphone size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p style={{ fontSize: 13 }}>Nenhum conteúdo salvo ainda.</p>
                            <p style={{ fontSize: 12 }}>Gere conteúdo acima e salve no calendário.</p>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {mktConteudos.map(c => {
                            const tipoInfo = MKT_TIPOS[c.tipo] || { label: c.tipo, icon: <FileText size={14} />, color: '#64748b' };
                            const statusInfo = MKT_STATUS_COLORS[c.status] || MKT_STATUS_COLORS.rascunho;
                            const isEditing = mktEditId === c.id;

                            return (
                                <div key={c.id} className={Z.card} style={{ padding: 16, borderLeft: `4px solid ${tipoInfo.color}` }}>
                                    {isEditing ? (
                                        /* Modo edição */
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <input className={Z.inp} value={mktEditData.titulo || ''} onChange={e => setMktEditData(d => ({ ...d, titulo: e.target.value }))} placeholder="Título" />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                                <select className={Z.inp} value={mktEditData.plataforma || ''} onChange={e => setMktEditData(d => ({ ...d, plataforma: e.target.value }))}>
                                                    <option value="instagram">Instagram</option>
                                                    <option value="facebook">Facebook</option>
                                                    <option value="whatsapp">WhatsApp</option>
                                                    <option value="site">Site</option>
                                                    <option value="google_ads">Google Ads</option>
                                                </select>
                                                <select className={Z.inp} value={mktEditData.status || ''} onChange={e => setMktEditData(d => ({ ...d, status: e.target.value }))}>
                                                    <option value="rascunho">Rascunho</option>
                                                    <option value="agendado">Agendado</option>
                                                    <option value="publicado">Publicado</option>
                                                </select>
                                                <input className={Z.inp} type="date" value={mktEditData.data_publicar || ''} onChange={e => setMktEditData(d => ({ ...d, data_publicar: e.target.value }))} />
                                            </div>
                                            <textarea className={Z.inp} rows={5} value={mktEditData.texto || ''} onChange={e => setMktEditData(d => ({ ...d, texto: e.target.value }))} />
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                <button onClick={() => setMktEditId(null)} style={{ padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600 }}>
                                                    Cancelar
                                                </button>
                                                <button onClick={() => updateMktConteudo(c.id)} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                                    <Check size={12} /> Salvar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Modo visualização */
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                                        <span style={{
                                                            fontSize: 10, padding: '2px 8px', borderRadius: 99,
                                                            background: `${tipoInfo.color}18`, color: tipoInfo.color, fontWeight: 700,
                                                            display: 'flex', alignItems: 'center', gap: 4,
                                                        }}>
                                                            {tipoInfo.icon} {tipoInfo.label}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10, padding: '2px 8px', borderRadius: 99,
                                                            background: statusInfo.bg, color: statusInfo.color, fontWeight: 700,
                                                        }}>
                                                            {statusInfo.label}
                                                        </span>
                                                        {c.plataforma && (
                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                                                {c.plataforma.replace('_', ' ')}
                                                            </span>
                                                        )}
                                                        {c.data_publicar && (
                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                                                {new Date(c.data_publicar + 'T12:00').toLocaleDateString('pt-BR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                                                        {c.titulo}
                                                    </div>
                                                    <div style={{
                                                        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
                                                        maxHeight: 100, overflow: 'hidden', whiteSpace: 'pre-wrap',
                                                    }}>
                                                        {c.texto}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexDirection: 'column' }}>
                                                    <button
                                                        onClick={() => copyToClipboard(c.texto, c.id)}
                                                        title="Copiar texto"
                                                        style={{
                                                            padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: 'none',
                                                            background: copiedId === c.id ? '#22c55e20' : 'var(--bg-muted)',
                                                            color: copiedId === c.id ? '#22c55e' : 'var(--text-muted)',
                                                        }}
                                                    >
                                                        {copiedId === c.id ? <Check size={13} /> : <Copy size={13} />}
                                                    </button>
                                                    <button
                                                        onClick={() => { setMktEditId(c.id); setMktEditData({ titulo: c.titulo, tipo: c.tipo, texto: c.texto, plataforma: c.plataforma, status: c.status, data_publicar: c.data_publicar || '' }); }}
                                                        title="Editar"
                                                        style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: 'none', background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                                                    >
                                                        <Edit3 size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteMktConteudo(c.id)}
                                                        title="Excluir"
                                                        style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', border: 'none', background: '#ef444410', color: '#ef4444' }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
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
