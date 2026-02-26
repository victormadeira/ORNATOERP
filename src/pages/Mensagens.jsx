import { useState, useEffect, useRef, useCallback } from 'react';
import { Z, Ic, Modal } from '../ui';
import api from '../api';
import { useAuth } from '../auth';
import {
    MessageCircle, Send, Lock, Bot, Sparkles, User, Phone,
    Search, MoreVertical, ArrowLeft, Link2, RefreshCw
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// PÁGINA DE MENSAGENS — Chat WhatsApp integrado
// ═══════════════════════════════════════════════════════

const STATUS_LABELS = { ia: '🤖 IA', humano: '👤 Humano', fechado: '🔒 Fechado' };
const STATUS_COLORS = {
    ia: { bg: '#8b5cf620', color: '#8b5cf6', border: '#8b5cf640' },
    humano: { bg: '#22c55e20', color: '#22c55e', border: '#22c55e40' },
    fechado: { bg: '#64748b20', color: '#64748b', border: '#64748b40' },
};

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function Mensagens({ notify }) {
    const { user } = useAuth();
    const [conversas, setConversas] = useState([]);
    const [activeConv, setActiveConv] = useState(null);
    const [activeConvData, setActiveConvData] = useState(null);
    const [mensagens, setMensagens] = useState([]);
    const [input, setInput] = useState('');
    const [interno, setInterno] = useState(false);
    const [search, setSearch] = useState('');
    const [suggesting, setSuggesting] = useState(false);
    const [sending, setSending] = useState(false);
    const [showVincular, setShowVincular] = useState(false);
    const [clientes, setClientes] = useState([]);
    const [mobileShowChat, setMobileShowChat] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // ═══ Carregar conversas ═══
    const loadConversas = useCallback(async () => {
        try {
            const data = await api.get('/whatsapp/conversas');
            setConversas(data);
        } catch { /* silencioso */ }
    }, []);

    // ═══ Carregar mensagens de uma conversa ═══
    const loadMensagens = useCallback(async (convId) => {
        try {
            const data = await api.get(`/whatsapp/conversas/${convId}/mensagens`);
            setMensagens(data);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch { notify?.('Erro ao carregar mensagens'); }
    }, [notify]);

    useEffect(() => { loadConversas(); }, [loadConversas]);

    // Polling: atualiza conversas e mensagens a cada 10s
    useEffect(() => {
        const interval = setInterval(() => {
            loadConversas();
            if (activeConv) loadMensagens(activeConv);
        }, 10000);
        return () => clearInterval(interval);
    }, [activeConv, loadConversas, loadMensagens]);

    // ═══ Selecionar conversa ═══
    const selectConv = (conv) => {
        setActiveConv(conv.id);
        setActiveConvData(conv);
        loadMensagens(conv.id);
        setMobileShowChat(true);
        // Marcar como lida no estado local
        setConversas(prev => prev.map(c => c.id === conv.id ? { ...c, nao_lidas: 0 } : c));
    };

    // ═══ Enviar mensagem ═══
    const enviar = async () => {
        if (!input.trim() || !activeConv || sending) return;
        setSending(true);
        try {
            if (interno) {
                await api.post(`/whatsapp/conversas/${activeConv}/nota-interna`, { conteudo: input });
            } else {
                await api.post(`/whatsapp/conversas/${activeConv}/enviar`, { conteudo: input });
            }
            setInput('');
            setInterno(false);
            await loadMensagens(activeConv);
            loadConversas();
        } catch (e) {
            notify?.(e.error || 'Erro ao enviar');
        } finally { setSending(false); }
    };

    // ═══ Toggle status (IA/Humano/Fechado) ═══
    const toggleStatus = async (convId, currentStatus) => {
        const next = currentStatus === 'ia' ? 'humano' : currentStatus === 'humano' ? 'fechado' : 'ia';
        await api.put(`/whatsapp/conversas/${convId}/status`, { status: next });
        setActiveConvData(prev => prev ? { ...prev, status: next } : prev);
        loadConversas();
    };

    // ═══ Sugerir resposta via IA ═══
    const sugerir = async () => {
        if (!activeConv) return;
        setSuggesting(true);
        try {
            const { sugestao } = await api.post(`/whatsapp/conversas/${activeConv}/sugerir`);
            setInput(sugestao);
            setInterno(false);
            inputRef.current?.focus();
        } catch {
            notify?.('Erro na sugestão da IA');
        } finally { setSuggesting(false); }
    };

    // ═══ Vincular a cliente ═══
    const vincular = async (clienteId) => {
        try {
            const updated = await api.put(`/whatsapp/conversas/${activeConv}/vincular`, { cliente_id: clienteId });
            setActiveConvData(updated);
            setShowVincular(false);
            loadConversas();
            notify?.('Cliente vinculado!');
        } catch { notify?.('Erro ao vincular'); }
    };

    // Carregar clientes para o modal de vincular
    useEffect(() => {
        if (showVincular) {
            api.get('/clientes').then(setClientes).catch(() => {});
        }
    }, [showVincular]);

    // Filtrar conversas
    const filtered = conversas.filter(c => {
        const q = search.toLowerCase();
        return !q || (c.cliente_nome || '').toLowerCase().includes(q)
            || (c.wa_name || '').toLowerCase().includes(q)
            || (c.wa_phone || '').includes(q);
    });

    // ═══ RENDER ═══
    return (
        <div className={Z.pg} style={{ padding: 0, maxWidth: '100%', height: 'calc(100vh - 64px)' }}>
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

                {/* ═══ Painel Esquerdo: Lista de Conversas ═══ */}
                <div style={{
                    width: 360, minWidth: 360, borderRight: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', background: 'var(--bg-card)',
                    ...(mobileShowChat ? { display: 'none' } : {}),
                }}
                    className="conv-list-panel"
                >
                    {/* Header */}
                    <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <MessageCircle size={22} style={{ color: '#22c55e' }} />
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>WhatsApp</h2>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#22c55e20', color: '#22c55e', fontWeight: 600 }}>
                                {conversas.length}
                            </span>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                            <input
                                className={Z.inp}
                                placeholder="Buscar conversa..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ paddingLeft: 32, fontSize: 13 }}
                            />
                        </div>
                    </div>

                    {/* Lista */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filtered.length === 0 && (
                            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                {conversas.length === 0 ? 'Nenhuma conversa ainda. As conversas aparecerão quando clientes enviarem mensagens pelo WhatsApp.' : 'Nenhuma conversa encontrada.'}
                            </div>
                        )}
                        {filtered.map(c => {
                            const isActive = activeConv === c.id;
                            const sc = STATUS_COLORS[c.status] || STATUS_COLORS.humano;
                            return (
                                <div
                                    key={c.id}
                                    onClick={() => selectConv(c)}
                                    style={{
                                        padding: '12px 16px', cursor: 'pointer',
                                        borderBottom: '1px solid var(--border)',
                                        background: isActive ? 'var(--bg-muted)' : 'transparent',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        {/* Avatar */}
                                        <div style={{
                                            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                            background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: `2px solid ${sc.border}`,
                                        }}>
                                            <User size={18} style={{ color: 'var(--text-muted)' }} />
                                        </div>
                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.cliente_nome || c.wa_name || c.wa_phone}
                                                </span>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                                                    {timeAgo(c.ultimo_msg_em || c.ultima_msg_em)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{
                                                    fontSize: 12, color: 'var(--text-muted)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
                                                }}>
                                                    {c.ultima_msg_remetente === 'ia' && '🤖 '}
                                                    {c.ultima_msg_remetente === 'usuario' && '✓ '}
                                                    {(c.ultima_msg || '').slice(0, 50)}
                                                </span>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                                                    {c.nao_lidas > 0 && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, color: '#fff',
                                                            background: '#22c55e', borderRadius: 99,
                                                            minWidth: 18, height: 18, display: 'flex',
                                                            alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                                                        }}>
                                                            {c.nao_lidas}
                                                        </span>
                                                    )}
                                                    <span style={{
                                                        fontSize: 9, padding: '1px 6px', borderRadius: 99,
                                                        background: sc.bg, color: sc.color, fontWeight: 600,
                                                    }}>
                                                        {c.status === 'ia' ? '🤖' : c.status === 'humano' ? '👤' : '🔒'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ═══ Painel Direito: Chat ═══ */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-body)' }}>
                    {!activeConv ? (
                        // Nenhuma conversa selecionada
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-muted)' }}>
                            <MessageCircle size={48} style={{ opacity: 0.3 }} />
                            <p style={{ fontSize: 15 }}>Selecione uma conversa para começar</p>
                        </div>
                    ) : (
                        <>
                            {/* Header do chat */}
                            <div style={{
                                padding: '12px 20px', borderBottom: '1px solid var(--border)',
                                background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 12,
                            }}>
                                <button
                                    onClick={() => { setMobileShowChat(false); setActiveConv(null); }}
                                    className="md:hidden"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                >
                                    <ArrowLeft size={18} style={{ color: 'var(--text-muted)' }} />
                                </button>

                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <User size={16} style={{ color: 'var(--text-muted)' }} />
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {activeConvData?.cliente_nome || activeConvData?.wa_name || activeConvData?.wa_phone}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <Phone size={10} /> {activeConvData?.wa_phone}
                                        {!activeConvData?.cliente_id && (
                                            <button
                                                onClick={() => setShowVincular(true)}
                                                style={{
                                                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                                    background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40',
                                                    cursor: 'pointer', fontWeight: 600,
                                                }}
                                            >
                                                <Link2 size={9} /> Vincular cliente
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Status toggle */}
                                <button
                                    onClick={() => toggleStatus(activeConv, activeConvData?.status)}
                                    style={{
                                        fontSize: 12, padding: '6px 12px', borderRadius: 8,
                                        border: `1px solid ${(STATUS_COLORS[activeConvData?.status] || STATUS_COLORS.humano).border}`,
                                        background: (STATUS_COLORS[activeConvData?.status] || STATUS_COLORS.humano).bg,
                                        color: (STATUS_COLORS[activeConvData?.status] || STATUS_COLORS.humano).color,
                                        cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    {STATUS_LABELS[activeConvData?.status] || '👤 Humano'}
                                </button>
                            </div>

                            {/* Mensagens */}
                            <div style={{
                                flex: 1, overflowY: 'auto', padding: '16px 20px',
                                display: 'flex', flexDirection: 'column', gap: 8,
                            }}>
                                {mensagens.length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 32 }}>
                                        Nenhuma mensagem nesta conversa.
                                    </div>
                                )}
                                {mensagens.map((m, i) => {
                                    const isEntrada = m.direcao === 'entrada';
                                    const isInterno = m.interno === 1;
                                    const isIA = m.remetente === 'ia';

                                    let bubbleBg, bubbleColor, align, indicator;
                                    if (isEntrada) {
                                        bubbleBg = 'var(--bg-muted)';
                                        bubbleColor = 'var(--text-primary)';
                                        align = 'flex-start';
                                        indicator = null;
                                    } else if (isInterno) {
                                        bubbleBg = '#fef3c7';
                                        bubbleColor = '#92400e';
                                        align = 'flex-end';
                                        indicator = <Lock size={10} style={{ opacity: 0.6 }} />;
                                    } else if (isIA) {
                                        bubbleBg = 'linear-gradient(135deg, #8b5cf6, #6366f1)';
                                        bubbleColor = '#fff';
                                        align = 'flex-end';
                                        indicator = <Bot size={10} />;
                                    } else {
                                        bubbleBg = 'var(--primary)';
                                        bubbleColor = '#fff';
                                        align = 'flex-end';
                                        indicator = null;
                                    }

                                    return (
                                        <div key={m.id} style={{ display: 'flex', justifyContent: align }}>
                                            <div style={{
                                                maxWidth: '70%', padding: '10px 14px', borderRadius: 12,
                                                background: bubbleBg, color: bubbleColor,
                                                borderTopLeftRadius: isEntrada ? 4 : 12,
                                                borderTopRightRadius: isEntrada ? 12 : 4,
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                            }}>
                                                {/* Indicador */}
                                                {(indicator || isInterno || isIA) && (
                                                    <div style={{ fontSize: 10, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, opacity: 0.8 }}>
                                                        {indicator}
                                                        {isInterno && 'Nota interna'}
                                                        {isIA && !isInterno && 'IA'}
                                                        {!isIA && !isInterno && m.usuario_nome && m.usuario_nome}
                                                    </div>
                                                )}
                                                {!indicator && !isEntrada && !isIA && m.usuario_nome && (
                                                    <div style={{ fontSize: 10, marginBottom: 4, opacity: 0.8 }}>
                                                        {m.usuario_nome}
                                                    </div>
                                                )}
                                                {/* Conteúdo */}
                                                <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                    {m.conteudo}
                                                </div>
                                                {/* Hora */}
                                                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                                                    {formatTime(m.criado_em)}
                                                    {m.direcao === 'saida' && !isInterno && (
                                                        <span style={{ marginLeft: 4 }}>
                                                            {m.status_envio === 'lido' ? '✓✓' : m.status_envio === 'entregue' ? '✓✓' : '✓'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Área de input */}
                            <div style={{
                                padding: '12px 20px', borderTop: '1px solid var(--border)',
                                background: 'var(--bg-card)',
                            }}>
                                {/* Toggle interno */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <button
                                        onClick={() => setInterno(false)}
                                        style={{
                                            fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                                            background: !interno ? '#22c55e20' : 'transparent',
                                            color: !interno ? '#22c55e' : 'var(--text-muted)',
                                            border: `1px solid ${!interno ? '#22c55e40' : 'var(--border)'}`,
                                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <MessageCircle size={11} /> Para o cliente
                                    </button>
                                    <button
                                        onClick={() => setInterno(true)}
                                        style={{
                                            fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                                            background: interno ? '#fef3c7' : 'transparent',
                                            color: interno ? '#92400e' : 'var(--text-muted)',
                                            border: `1px solid ${interno ? '#fbbf2440' : 'var(--border)'}`,
                                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <Lock size={11} /> Nota interna
                                    </button>

                                    {/* Botão Sugerir */}
                                    <button
                                        onClick={sugerir}
                                        disabled={suggesting}
                                        style={{
                                            fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: suggesting ? 'wait' : 'pointer',
                                            background: '#8b5cf620', color: '#8b5cf6',
                                            border: '1px solid #8b5cf640', fontWeight: 600,
                                            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                                            opacity: suggesting ? 0.6 : 1,
                                        }}
                                    >
                                        {suggesting ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                        {suggesting ? 'Gerando...' : 'Sugerir'}
                                    </button>
                                </div>

                                {/* Input + Send */}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <textarea
                                        ref={inputRef}
                                        className={Z.inp}
                                        placeholder={interno ? 'Escrever nota interna...' : 'Digitar mensagem...'}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
                                        }}
                                        rows={2}
                                        style={{
                                            flex: 1, resize: 'none', fontSize: 14,
                                            borderColor: interno ? '#fbbf2440' : undefined,
                                            background: interno ? '#fef3c705' : undefined,
                                        }}
                                    />
                                    <button
                                        onClick={enviar}
                                        disabled={!input.trim() || sending}
                                        className={Z.btn}
                                        style={{
                                            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6,
                                            opacity: !input.trim() || sending ? 0.5 : 1,
                                            background: interno ? '#f59e0b' : undefined,
                                        }}
                                    >
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ═══ Modal: Vincular Cliente ═══ */}
            {showVincular && (
                <Modal title="Vincular a Cliente" close={() => setShowVincular(false)} w={400}>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                        Selecione um cliente para vincular a esta conversa:
                    </p>
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {clientes.map(c => (
                            <div
                                key={c.id}
                                onClick={() => vincular(c.id)}
                                style={{
                                    padding: '10px 12px', cursor: 'pointer', borderRadius: 8,
                                    border: '1px solid var(--border)', marginBottom: 6,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.nome}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.tel} · {c.email}</div>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}
        </div>
    );
}
