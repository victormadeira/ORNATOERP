import { useState, useEffect, useRef, useCallback } from 'react';
import { Z, Ic, Modal, PageHeader, TabBar, EmptyState } from '../ui';
import { colorBg, colorBorder } from '../theme';
import api from '../api';
import { useAuth } from '../auth';
import {
    MessageCircle, Send, Lock, Bot, Sparkles, User, Phone,
    Search, MoreVertical, ArrowLeft, Link2, RefreshCw, Check, CheckCheck,
    Paperclip, Mic, Square, Image, X, FileText, Download
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// PÁGINA DE MENSAGENS — Chat WhatsApp integrado
// ═══════════════════════════════════════════════════════

const STATUS_LABELS = { ia: 'IA', humano: 'Humano', fechado: 'Fechado' };
const STATUS_ICONS = { ia: <Bot size={12} />, humano: <User size={12} />, fechado: <Lock size={12} /> };
const STATUS_COLORS = {
    ia: { bg: colorBg('#8b5cf6'), color: '#8b5cf6', border: colorBorder('#8b5cf6') },
    humano: { bg: colorBg('#22c55e'), color: '#22c55e', border: colorBorder('#22c55e') },
    fechado: { bg: colorBg('#64748b'), color: '#64748b', border: colorBorder('#64748b') },
};

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return new Date(d).toLocaleDateString('pt-BR');
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    // SQLite salva em UTC sem 'Z' — adicionamos para interpretar corretamente
    const d = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    const [recording, setRecording] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

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

    // ═══ Enviar arquivo (imagem/video/doc) ═══
    const enviarArquivo = async (file) => {
        if (!file || !activeConv) return;
        setSending(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`/api/whatsapp/conversas/${activeConv}/enviar-midia`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData,
            });
            if (!res.ok) { const e = await res.json(); throw e; }
            await loadMensagens(activeConv);
            loadConversas();
        } catch (e) {
            notify?.(e.error || 'Erro ao enviar arquivo');
        } finally { setSending(false); }
    };

    // ═══ Gravar áudio ═══
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
                const file = new File([blob], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' });
                await enviarArquivo(file);
            };
            mediaRecorder.start();
            setRecording(true);
        } catch {
            notify?.('Permissão de microfone negada');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setRecording(false);
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
            api.get('/clientes').then(setClientes).catch(e => notify(e.error || 'Erro ao carregar clientes'));
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
                            <MessageCircle size={22} style={{ color: 'var(--success)' }} />
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>WhatsApp</h2>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: colorBg('#22c55e'), color: 'var(--success)', fontWeight: 600 }}>
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
                                                    {c.ultima_msg_remetente === 'ia' && <Bot size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />}
                                                    {c.ultima_msg_remetente === 'usuario' && <Check size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />}
                                                    {(c.ultima_msg || '').slice(0, 50)}
                                                </span>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                                                    {c.nao_lidas > 0 && (
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, color: '#fff',
                                                            background: 'var(--success)', borderRadius: 99,
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
                                                        {STATUS_ICONS[c.status] || <User size={10} />}
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
                                    title="Voltar"
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
                                                    background: colorBg('#f59e0b'), color: 'var(--warning)', border: `1px solid ${colorBorder('#f59e0b')}`,
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
                                    {STATUS_ICONS[activeConvData?.status] || <User size={12} />} {STATUS_LABELS[activeConvData?.status] || 'Humano'}
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
                                                {/* Mídia */}
                                                {m.media_url && (m.tipo === 'imagem' || m.tipo === 'sticker') && (
                                                    <img
                                                        src={m.media_url}
                                                        alt="Imagem"
                                                        style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, marginBottom: m.conteudo && !m.conteudo.startsWith('[') ? 6 : 0, cursor: 'pointer', objectFit: 'contain' }}
                                                        onClick={() => setLightbox(m.media_url)}
                                                    />
                                                )}
                                                {m.media_url && m.tipo === 'video' && (
                                                    <video controls style={{ maxWidth: '100%', borderRadius: 8, marginBottom: m.conteudo && !m.conteudo.startsWith('[') ? 6 : 0 }}>
                                                        <source src={m.media_url} type="video/mp4" />
                                                    </video>
                                                )}
                                                {m.media_url && m.tipo === 'audio' && (
                                                    <audio controls style={{ maxWidth: '100%', marginBottom: 4 }}>
                                                        <source src={m.media_url} type="audio/ogg" />
                                                    </audio>
                                                )}
                                                {m.media_url && m.tipo === 'documento' && (
                                                    <a href={m.media_url} target="_blank" rel="noopener noreferrer"
                                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(0,0,0,0.08)', borderRadius: 6, marginBottom: 4, color: 'inherit', textDecoration: 'none', fontSize: 13 }}>
                                                        📄 Documento
                                                    </a>
                                                )}
                                                {/* Conteúdo texto */}
                                                {m.conteudo && !m.conteudo.startsWith('[') && (
                                                    <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                        {m.conteudo}
                                                    </div>
                                                )}
                                                {m.conteudo && m.conteudo.startsWith('[') && !m.media_url && (
                                                    <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: 'italic', opacity: 0.7 }}>
                                                        {m.conteudo}
                                                    </div>
                                                )}
                                                {/* Hora */}
                                                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                                                    {formatTime(m.criado_em)}
                                                    {m.direcao === 'saida' && !isInterno && (
                                                        <span style={{ marginLeft: 4 }}>
                                                            {m.status_envio === 'lido' ? <CheckCheck size={12} style={{ display: 'inline', color: '#53bdeb' }} /> : m.status_envio === 'entregue' ? <CheckCheck size={12} style={{ display: 'inline' }} /> : <Check size={12} style={{ display: 'inline' }} />}
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
                                            background: !interno ? colorBg('#22c55e') : 'transparent',
                                            color: !interno ? 'var(--success)' : 'var(--text-muted)',
                                            border: `1px solid ${!interno ? colorBorder('#22c55e') : 'var(--border)'}`,
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
                                            border: `1px solid ${interno ? colorBorder('#fbbf24') : 'var(--border)'}`,
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
                                            background: colorBg('#8b5cf6'), color: '#8b5cf6',
                                            border: `1px solid ${colorBorder('#8b5cf6')}`, fontWeight: 600,
                                            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                                            opacity: suggesting ? 0.6 : 1,
                                        }}
                                    >
                                        {suggesting ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                        {suggesting ? 'Gerando...' : 'Sugerir'}
                                    </button>
                                </div>

                                {/* Input + Send */}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                    {/* Anexar arquivo */}
                                    {!interno && (
                                        <>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                                                style={{ display: 'none' }}
                                                onChange={e => { if (e.target.files[0]) { enviarArquivo(e.target.files[0]); e.target.value = ''; } }}
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={sending}
                                                style={{
                                                    background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                                                    padding: 10, cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
                                                }}
                                                title="Anexar arquivo"
                                            >
                                                <Paperclip size={18} />
                                            </button>
                                        </>
                                    )}
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
                                            borderColor: interno ? colorBorder('#fbbf24') : undefined,
                                            background: interno ? '#fef3c705' : undefined,
                                        }}
                                    />
                                    {/* Mic / Send */}
                                    {!interno && !input.trim() ? (
                                        <button
                                            onClick={recording ? stopRecording : startRecording}
                                            disabled={sending}
                                            className={Z.btn}
                                            style={{
                                                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                                                background: recording ? '#ef4444' : undefined,
                                            }}
                                            title={recording ? 'Parar gravação' : 'Gravar áudio'}
                                        >
                                            {recording ? <Square size={16} /> : <Mic size={16} />}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={enviar}
                                            disabled={!input.trim() || sending}
                                            className={Z.btn}
                                            style={{
                                                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                                                opacity: !input.trim() || sending ? 0.5 : 1,
                                                background: interno ? 'var(--warning)' : undefined,
                                            }}
                                            title="Enviar"
                                        >
                                            <Send size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ═══ Modal: Vincular Cliente ═══ */}
            {/* ═══ Lightbox: Preview de imagem ═══ */}
            {lightbox && (
                <div
                    onClick={() => setLightbox(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.85)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
                    }}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
                        style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: 8, cursor: 'pointer', color: '#fff' }}
                    >
                        <X size={24} />
                    </button>
                    <a
                        href={lightbox}
                        download
                        onClick={e => e.stopPropagation()}
                        style={{ position: 'absolute', top: 16, right: 64, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}
                        title="Baixar"
                    >
                        <Download size={24} />
                    </a>
                    <img src={lightbox} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
                </div>
            )}

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
