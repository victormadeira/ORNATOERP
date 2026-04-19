import { useState, useEffect, useRef, useCallback } from 'react';
import { Z, Ic, Modal, PageHeader, TabBar, EmptyState } from '../ui';
import { colorBg, colorBorder } from '../theme';
import api from '../api';
import { useAuth } from '../auth';
import useWebSocket from '../hooks/useWebSocket';
import {
    MessageCircle, Send, Lock, Bot, Sparkles, User, Phone,
    Search, MoreVertical, ArrowLeft, Link2, RefreshCw, Check, CheckCheck,
    Paperclip, Mic, Square, Image, X, FileText, Download,
    UserPlus, UserCheck, Tag, Archive, Inbox, Users as UsersIcon,
    AlertCircle, History, ChevronDown, Flag,
    Pause, BellOff, Hourglass, Moon, Zap,
    Activity, Power, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// PÁGINA DE MENSAGENS — Chat WhatsApp integrado
// ═══════════════════════════════════════════════════════

const STATUS_LABELS = { ia: 'IA', humano: 'Humano', fechado: 'Fechado' };
const STATUS_ICONS = { ia: <Bot size={12} />, humano: <User size={12} />, fechado: <Lock size={12} /> };
const STATUS_COLORS = {
    ia: { bg: colorBg('#8b5cf6'), color: '#8b5cf6', border: colorBorder('#8b5cf6') },
    humano: { bg: colorBg('var(--success)'), color: 'var(--success)', border: colorBorder('var(--success)') },
    fechado: { bg: colorBg('var(--muted)'), color: 'var(--muted)', border: colorBorder('var(--muted)') },
};
const LEAD_LABELS = {
    novo: 'Novo', em_qualificacao: 'Qualificando', qualificado: 'Qualificado',
    desqualificado: 'Desqualificado', fora_area: 'Fora da Área',
};
const LEAD_COLORS = {
    novo: 'var(--muted)', em_qualificacao: 'var(--warning)', qualificado: 'var(--success)',
    desqualificado: 'var(--danger)', fora_area: 'var(--danger)',
};

const CATEGORIAS = [
    { v: '', l: 'Sem categoria', c: 'var(--muted)' },
    { v: 'comercial', l: 'Comercial', c: 'var(--info)' },
    { v: 'medicao', l: 'Medição', c: '#8b5cf6' },
    { v: 'pos_venda', l: 'Pós-venda', c: 'var(--success)' },
    { v: 'financeiro', l: 'Financeiro', c: 'var(--warning)' },
    { v: 'suporte', l: 'Suporte', c: '#ec4899' },
    { v: 'outros', l: 'Outros', c: 'var(--muted)' },
];
const CAT_MAP = Object.fromEntries(CATEGORIAS.map(c => [c.v, c]));

// Níveis de prioridade — sem emojis, usa Lucide icons (ArrowDown/Minus/ArrowUp/Flame)
const PRIORIDADES = [
    { v: 'baixa',   l: 'Baixa',   c: 'var(--muted)' },
    { v: 'normal',  l: 'Normal',  c: 'var(--muted)' },
    { v: 'alta',    l: 'Alta',    c: 'var(--warning)' },
    { v: 'urgente', l: 'Urgente', c: 'var(--danger)' },
];
const PRI_MAP = Object.fromEntries(PRIORIDADES.map(p => [p.v, p]));

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

// Retorna rótulo do dia para separadores (estilo WhatsApp)
function formatDayLabel(dateStr) {
    if (!dateStr) return '';
    const d = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const msg = new Date(d);
    const hoje = new Date();
    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(msg, hoje)) return 'Hoje';
    if (sameDay(msg, ontem)) return 'Ontem';
    const diffDias = Math.floor((hoje - msg) / 86400000);
    if (diffDias < 7) {
        return msg.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, c => c.toUpperCase());
    }
    return msg.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: msg.getFullYear() !== hoje.getFullYear() ? 'numeric' : undefined });
}

// Chave do dia pra comparar mensagens consecutivas
function dayKey(dateStr) {
    if (!dateStr) return '';
    const d = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    return new Date(d).toDateString();
}

// Gera iniciais p/ avatar fallback
function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Gera cor estável pra avatar baseada no nome
function avatarColor(name) {
    if (!name) return 'var(--muted)';
    const palette = ['#0ea5e9', 'var(--success)', 'var(--warning)', 'var(--danger)', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}

export default function Mensagens({ notify }) {
    const { user } = useAuth();
    const isGerente = user?.role === 'admin' || user?.role === 'gerente';

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

    // ─── Inbox: filtros, atribuição, categoria ───
    const [filtroAba, setFiltroAba] = useState(() => localStorage.getItem('mens_filtro') || 'minhas');
    const [filtroCategoria, setFiltroCategoria] = useState('');
    const [contadores, setContadores] = useState({ minhas: 0, nao_atribuidas: 0, todas: 0, arquivadas: 0 });
    const [usuarios, setUsuarios] = useState([]);
    const [showAssignMenu, setShowAssignMenu] = useState(false);
    const [showCategoriaMenu, setShowCategoriaMenu] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    // ─── Diagnóstico da IA (status Sofia + kill-switch) ───
    const [diag, setDiag] = useState(null);           // resultado de /api/whatsapp/diagnostico
    const [diagOpen, setDiagOpen] = useState(false);  // modal aberto?
    const [iaToggling, setIaToggling] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // ═══ Carregar conversas ═══
    const loadConversas = useCallback(async () => {
        try {
            const qs = new URLSearchParams({ filtro: filtroAba });
            if (filtroCategoria) qs.set('categoria', filtroCategoria);
            const data = await api.get('/whatsapp/conversas?' + qs.toString());
            setConversas(data);
            // Atualizar activeConvData se a conversa ativa mudou (lead score, status, etc.)
            setActiveConvData(prev => {
                if (!prev) return prev;
                const updated = data.find(c => c.id === prev.id);
                return updated || prev;
            });
        } catch { /* silencioso */ }
    }, [filtroAba, filtroCategoria]);

    const loadContadores = useCallback(async () => {
        try {
            const d = await api.get('/whatsapp/conversas/contadores');
            setContadores(d);
        } catch { /* silencioso */ }
    }, []);

    // Lista de atendentes para atribuição
    useEffect(() => {
        api.get('/whatsapp/usuarios-disponiveis').then(setUsuarios).catch(() => { });
    }, []);

    // Persistir aba
    useEffect(() => { localStorage.setItem('mens_filtro', filtroAba); }, [filtroAba]);

    // ═══ Carregar mensagens de uma conversa ═══
    const loadMensagens = useCallback(async (convId) => {
        try {
            const data = await api.get(`/whatsapp/conversas/${convId}/mensagens`);
            setMensagens(data);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch { notify?.('Erro ao carregar mensagens'); }
    }, [notify]);

    useEffect(() => { loadConversas(); loadContadores(); }, [loadConversas, loadContadores]);

    // ═══ WebSocket: atualização em tempo real ═══
    const activeConvRef = useRef(activeConv);
    activeConvRef.current = activeConv;

    const handleWsEvent = useCallback((msg) => {
        if (!msg || !msg.type) return;
        if (msg.type === 'chat.message') {
            const convId = msg.data?.conversa_id;
            // Atualiza sempre a lista + contadores
            loadConversas();
            loadContadores();
            // Se o evento é da conversa aberta, recarrega as mensagens
            if (convId && convId === activeConvRef.current) {
                loadMensagens(convId);
            }
        } else if (msg.type === 'chat.conversa-updated') {
            loadConversas();
            loadContadores();
        } else if (msg.type === 'chat.message-status') {
            // Atualização de status (entregue/lido) só interessa se a conversa está aberta
            if (msg.data?.conversa_id && msg.data.conversa_id === activeConvRef.current) {
                loadMensagens(activeConvRef.current);
            }
        }
    }, [loadConversas, loadContadores, loadMensagens]);

    const { connected: wsConnected } = useWebSocket(handleWsEvent);

    // Polling leve como fallback quando WS está desconectado (30s)
    useEffect(() => {
        if (wsConnected) return;
        const interval = setInterval(() => {
            loadConversas();
            loadContadores();
            if (activeConvRef.current) loadMensagens(activeConvRef.current);
        }, 30000);
        return () => clearInterval(interval);
    }, [wsConnected, loadConversas, loadContadores, loadMensagens]);

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

    // ═══ Pausar/retomar IA manualmente (anti-abuso) ═══
    const toggleIABloqueio = async () => {
        if (!activeConv) return;
        const isBloqueada = !!activeConvData?.ia_bloqueada;
        const r = await api.put(`/whatsapp/conversas/${activeConv}/ia-bloqueio`, {
            bloqueada: !isBloqueada,
            minutos: 60 * 24,
            motivo: 'manual',
        });
        setActiveConvData(r);
        notify?.(isBloqueada ? 'IA retomada nesta conversa' : 'IA pausada por 24h');
    };

    // ═══ Aguardando cliente (pausa escalação) ═══
    const toggleAguardandoCliente = async () => {
        if (!activeConv) return;
        const isAguardando = !!activeConvData?.aguardando_cliente;
        const r = await api.put(`/whatsapp/conversas/${activeConv}/aguardando-cliente`, {
            aguardando: !isAguardando,
        });
        setActiveConvData(r);
        notify?.(isAguardando ? 'Escalação reativada' : 'Escalação pausada (aguardando cliente)');
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

    // ═══ Atribuir conversa (puxar pra mim, largar, transferir — gerente) ═══
    const atribuir = async (userId, motivo = '') => {
        if (!activeConv) return;
        try {
            const updated = await api.put(`/whatsapp/conversas/${activeConv}/atribuir`, { user_id: userId, motivo });
            setActiveConvData(updated);
            setShowAssignMenu(false);
            loadConversas();
            loadContadores();
            notify?.(userId === null ? 'Conversa liberada (fila pública)' : `Conversa atribuída a ${updated.atribuido_nome || 'atendente'}`);
        } catch (e) {
            notify?.(e.error || 'Erro ao atribuir');
        }
    };

    const puxarPraMim = () => atribuir(user.id, 'puxou pra si');

    // ═══ Categoria + prioridade ═══
    const setCategoria = async (categoria) => {
        if (!activeConv) return;
        try {
            const updated = await api.put(`/whatsapp/conversas/${activeConv}/categoria`, { categoria });
            setActiveConvData(updated);
            setShowCategoriaMenu(false);
            loadConversas();
            notify?.(categoria ? `Categoria: ${CAT_MAP[categoria]?.l || categoria}` : 'Categoria removida');
        } catch (e) { notify?.(e.error || 'Erro'); }
    };

    const setPrioridade = async (prioridade) => {
        if (!activeConv) return;
        try {
            const updated = await api.put(`/whatsapp/conversas/${activeConv}/categoria`, { prioridade });
            setActiveConvData(updated);
            loadConversas();
        } catch (e) { notify?.(e.error || 'Erro'); }
    };

    // ═══ Arquivar/desarquivar ═══
    const toggleArquivar = async () => {
        if (!activeConv) return;
        const arquivada = !activeConvData?.arquivada;
        try {
            await api.put(`/whatsapp/conversas/${activeConv}/arquivar`, { arquivada });
            notify?.(arquivada ? 'Conversa arquivada' : 'Conversa desarquivada');
            setActiveConv(null);
            setActiveConvData(null);
            loadConversas();
            loadContadores();
        } catch (e) { notify?.(e.error || 'Erro'); }
    };

    // ═══ Backfill (puxar histórico da Evolution) ═══
    const rodarBackfill = async () => {
        if (!confirm('Puxar histórico de conversas antigas da Evolution? Pode demorar alguns minutos.')) return;
        setBackfilling(true);
        try {
            const r = await api.post('/whatsapp/backfill', { limit: 300 });
            notify?.(`✓ ${r.chats_processados} chats | ${r.mensagens_inseridas} mensagens importadas`);
            loadConversas();
            loadContadores();
        } catch (e) {
            notify?.(e.error || 'Erro ao puxar histórico');
        } finally { setBackfilling(false); }
    };

    const rodarBackfillConversa = async () => {
        if (!activeConv) return;
        setBackfilling(true);
        try {
            const r = await api.post(`/whatsapp/conversas/${activeConv}/backfill`);
            notify?.(`✓ ${r.inseridas}/${r.total} mensagens importadas`);
            loadMensagens(activeConv);
        } catch (e) { notify?.(e.error || 'Erro'); }
        finally { setBackfilling(false); }
    };

    // ═══ Diagnóstico da IA (Sofia) ═══
    const loadDiagnostico = useCallback(async () => {
        try {
            const r = await api.get('/whatsapp/diagnostico');
            setDiag(r);
        } catch {
            setDiag({ status_geral: 'offline', problemas: ['Não foi possível consultar o diagnóstico'] });
        }
    }, []);

    const toggleIA = async () => {
        if (!isGerente) return;
        const alvo = !diag?.ia_ativa;
        const msg = alvo
            ? 'Reativar a IA (Sofia)? Ela voltará a responder mensagens e capturar leads automaticamente.'
            : 'DESATIVAR a IA (Sofia)? Nenhuma mensagem nova será respondida e nenhum lead será capturado até você reativar.';
        if (!confirm(msg)) return;
        setIaToggling(true);
        try {
            const r = await api.post('/whatsapp/ia/toggle', { ativa: alvo });
            notify?.(r.ia_ativa ? 'IA ativada' : 'IA desativada');
            await loadDiagnostico();
        } catch (e) {
            notify?.(e.error || 'Erro ao alterar IA');
        } finally { setIaToggling(false); }
    };

    // Auto-refresh do diagnóstico a cada 60s
    useEffect(() => {
        loadDiagnostico();
        const iv = setInterval(loadDiagnostico, 60000);
        return () => clearInterval(iv);
    }, [loadDiagnostico]);

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
                    <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <MessageCircle size={20} style={{ color: 'var(--success)' }} />
                            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, flex: 1 }}>Inbox</h2>

                            {/* Status da IA (Sofia) — clicável pra abrir diagnóstico */}
                            {diag && (() => {
                                const s = diag.status_geral;
                                const cor = s === 'online' ? 'var(--success)' : s === 'parcial' ? 'var(--warning)' : 'var(--danger)';
                                const corBg = s === 'online' ? 'var(--success-bg)' : s === 'parcial' ? 'var(--warning-bg)' : 'var(--danger-bg)';
                                const corBr = s === 'online' ? 'var(--success-border)' : s === 'parcial' ? 'var(--warning-border)' : 'var(--danger-border)';
                                const label = s === 'online' ? 'IA: Online' : s === 'parcial' ? 'IA: Parcial' : 'IA: Offline';
                                return (
                                    <button
                                        onClick={() => setDiagOpen(true)}
                                        title="Ver diagnóstico da IA (Sofia)"
                                        style={{
                                            fontSize: 11, padding: '4px 9px', borderRadius: 6,
                                            border: `1px solid ${corBr}`, background: corBg,
                                            color: cor, cursor: 'pointer', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <Activity size={10} />
                                        {label}
                                    </button>
                                );
                            })()}

                            {isGerente && (
                                <button
                                    onClick={rodarBackfill}
                                    disabled={backfilling}
                                    title="Puxar histórico de conversas antigas da Evolution API"
                                    style={{
                                        fontSize: 11, padding: '4px 9px', borderRadius: 6,
                                        border: `1px solid ${colorBorder('#8b5cf6')}`, background: colorBg('#8b5cf6'),
                                        color: '#8b5cf6', cursor: 'pointer', fontWeight: 600,
                                        display: 'flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    {backfilling ? <RefreshCw size={10} className="spin" /> : <History size={10} />}
                                    {backfilling ? 'Puxando...' : 'Histórico'}
                                </button>
                            )}
                        </div>

                        {/* Tabs de filtro */}
                        <div style={{ display: 'flex', gap: 4, marginBottom: 10, fontSize: 11 }}>
                            {[
                                { v: 'minhas', l: 'Minhas', i: UserCheck, c: contadores.minhas },
                                { v: 'nao_atribuidas', l: 'Fila', i: Inbox, c: contadores.nao_atribuidas },
                                ...(isGerente ? [{ v: 'todas', l: 'Todas', i: UsersIcon, c: contadores.todas }] : []),
                                { v: 'arquivadas', l: 'Arq.', i: Archive, c: contadores.arquivadas },
                            ].map(t => {
                                const Ic = t.i;
                                const active = filtroAba === t.v;
                                return (
                                    <button
                                        key={t.v}
                                        onClick={() => setFiltroAba(t.v)}
                                        style={{
                                            flex: 1, padding: '6px 6px', borderRadius: 6,
                                            border: '1px solid ' + (active ? 'var(--primary)' : 'var(--border)'),
                                            background: active ? colorBg('#1379F0') : 'transparent',
                                            color: active ? 'var(--primary)' : 'var(--text-muted)',
                                            cursor: 'pointer', fontWeight: 600,
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                        }}
                                    >
                                        <Ic size={12} />
                                        <span style={{ fontSize: 10 }}>{t.l}</span>
                                        <span style={{ fontSize: 9, opacity: 0.7 }}>{t.c}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Filtro categoria */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                            <button
                                onClick={() => setFiltroCategoria('')}
                                style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 99,
                                    border: `1px solid ${!filtroCategoria ? 'var(--primary)' : 'var(--border)'}`,
                                    background: !filtroCategoria ? colorBg('#1379F0') : 'transparent',
                                    color: !filtroCategoria ? 'var(--primary)' : 'var(--text-muted)',
                                    cursor: 'pointer', fontWeight: 600,
                                }}
                            >
                                Todas
                            </button>
                            {CATEGORIAS.filter(c => c.v).map(c => (
                                <button
                                    key={c.v}
                                    onClick={() => setFiltroCategoria(filtroCategoria === c.v ? '' : c.v)}
                                    style={{
                                        fontSize: 10, padding: '3px 8px', borderRadius: 99,
                                        border: `1px solid ${filtroCategoria === c.v ? c.c : 'var(--border)'}`,
                                        background: filtroCategoria === c.v ? colorBg(c.c) : 'transparent',
                                        color: filtroCategoria === c.v ? c.c : 'var(--text-muted)',
                                        cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    {c.l}
                                </button>
                            ))}
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
                            const displayName = c.cliente_nome || c.wa_name || c.wa_phone;
                            const avColor = avatarColor(displayName);
                            return (
                                <div
                                    key={c.id}
                                    onClick={() => selectConv(c)}
                                    style={{
                                        padding: '11px 14px 11px 18px', cursor: 'pointer',
                                        borderBottom: '1px solid var(--border)',
                                        background: isActive ? 'var(--bg-muted)' : 'transparent',
                                        transition: 'background 0.15s',
                                        position: 'relative',
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    {isActive && (
                                        <span style={{
                                            position: 'absolute', left: 0, top: 6, bottom: 6,
                                            width: 3, borderRadius: '0 3px 3px 0',
                                            background: 'var(--primary)',
                                        }} />
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {/* Avatar com iniciais + indicador de status */}
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <div style={{
                                                width: 48, height: 48, borderRadius: '50%',
                                                background: `linear-gradient(135deg, ${avColor}, ${avColor}cc)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontSize: 15, fontWeight: 700,
                                                letterSpacing: 0.3,
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                            }}>
                                                {initials(displayName)}
                                            </div>
                                            {/* Status dot (IA/humano/fechado) */}
                                            <span style={{
                                                position: 'absolute', bottom: 0, right: 0,
                                                width: 13, height: 13, borderRadius: '50%',
                                                background: sc.color,
                                                border: '2px solid var(--bg-card)',
                                            }} />
                                            {c.prioridade === 'urgente' && (
                                                <span style={{
                                                    position: 'absolute', top: -3, right: -3,
                                                    width: 12, height: 12, borderRadius: '50%',
                                                    background: 'var(--danger)',
                                                    border: '2px solid var(--bg-card)',
                                                    boxShadow: '0 0 0 1px var(--danger-border)',
                                                }} title="Urgente" />
                                            )}
                                            {c.prioridade === 'alta' && (
                                                <span style={{
                                                    position: 'absolute', top: -2, right: -2,
                                                    width: 10, height: 10, borderRadius: '50%',
                                                    background: 'var(--warning)', border: '2px solid var(--bg-card)',
                                                }} title="Alta" />
                                            )}
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
                                                    {c.lead_qualificacao && c.lead_qualificacao !== 'novo' && (
                                                        <span style={{
                                                            fontSize: 8, padding: '1px 5px', borderRadius: 99, fontWeight: 600,
                                                            background: colorBg(LEAD_COLORS[c.lead_qualificacao] || 'var(--muted)'),
                                                            color: LEAD_COLORS[c.lead_qualificacao] || 'var(--muted)',
                                                        }}>
                                                            {c.lead_score > 0 && `${c.lead_score}%`}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Tag de atribuição + categoria */}
                                            {(c.atribuido_nome || c.categoria) && (
                                                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                                    {c.atribuido_nome ? (
                                                        <span style={{
                                                            fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                            background: c.atribuido_user_id === user?.id ? colorBg('var(--success)') : 'var(--bg-muted)',
                                                            color: c.atribuido_user_id === user?.id ? 'var(--success)' : 'var(--text-muted)',
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                        }}>
                                                            <UserCheck size={8} />
                                                            {c.atribuido_user_id === user?.id ? 'Você' : c.atribuido_nome.split(' ')[0]}
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                            background: colorBg('var(--warning)'), color: 'var(--warning)',
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                        }}>
                                                            <Inbox size={8} /> Na fila
                                                        </span>
                                                    )}
                                                    {c.categoria && CAT_MAP[c.categoria] && (
                                                        <span style={{
                                                            fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                            background: colorBg(CAT_MAP[c.categoria].c),
                                                            color: CAT_MAP[c.categoria].c,
                                                        }}>
                                                            {CAT_MAP[c.categoria].l}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ═══ Painel Direito: Chat ═══ */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-body)',
                    borderLeft: '1px solid var(--border)',
                    boxShadow: 'inset 2px 0 0 0 var(--primary-ring)',
                }}>
                    {!activeConv ? (
                        // Nenhuma conversa selecionada — estilo WA Web splash
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: 14, color: 'var(--text-muted)', padding: 40,
                            background: `radial-gradient(circle at 30% 20%, ${colorBg('#C9A96E')} 0, transparent 50%), radial-gradient(circle at 70% 80%, ${colorBg('#1379F0')} 0, transparent 55%)`,
                        }}>
                            <div style={{
                                width: 120, height: 120, borderRadius: '50%',
                                background: `linear-gradient(135deg, ${colorBg('#1379F0')}, ${colorBg('#C9A96E')})`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                                marginBottom: 8,
                            }}>
                                <MessageCircle size={56} style={{ color: 'var(--primary)', opacity: 0.85 }} />
                            </div>
                            <h3 style={{ fontSize: 22, fontWeight: 400, color: 'var(--text-primary)', margin: 0, letterSpacing: -0.3 }}>
                                Inbox Ornato
                            </h3>
                            <p style={{ fontSize: 13.5, maxWidth: 420, textAlign: 'center', lineHeight: 1.55, margin: 0, color: 'var(--text-muted)' }}>
                                Selecione uma conversa à esquerda para começar. Todas as mensagens do WhatsApp passam por aqui, com suporte a IA, notas internas, atribuição e categorias.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginTop: 12, opacity: 0.7 }}>
                                <Lock size={11} /> Comunicação criptografada via Evolution API
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Header do chat */}
                            <div style={{
                                padding: '10px 20px', borderBottom: '1px solid var(--border)',
                                background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 12,
                                boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
                            }}>
                                <button
                                    onClick={() => { setMobileShowChat(false); setActiveConv(null); }}
                                    className="md:hidden"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                                    title="Voltar"
                                >
                                    <ArrowLeft size={18} style={{ color: 'var(--text-muted)' }} />
                                </button>

                                {(() => {
                                    const hdrName = activeConvData?.cliente_nome || activeConvData?.wa_name || activeConvData?.wa_phone || '';
                                    const hdrColor = avatarColor(hdrName);
                                    return (
                                        <div style={{
                                            width: 42, height: 42, borderRadius: '50%',
                                            background: `linear-gradient(135deg, ${hdrColor}, ${hdrColor}cc)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontSize: 14, fontWeight: 700,
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flexShrink: 0,
                                        }}>
                                            {initials(hdrName)}
                                        </div>
                                    );
                                })()}

                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        {activeConvData?.cliente_nome || activeConvData?.wa_name || activeConvData?.wa_phone}
                                        {/* Status da IA (Sofia) — também aparece aqui dentro da conversa */}
                                        {diag && (() => {
                                            const s = diag.status_geral;
                                            const cor = s === 'online' ? 'var(--success)' : s === 'parcial' ? 'var(--warning)' : 'var(--danger)';
                                            const corBg = s === 'online' ? 'var(--success-bg)' : s === 'parcial' ? 'var(--warning-bg)' : 'var(--danger-bg)';
                                            const corBr = s === 'online' ? 'var(--success-border)' : s === 'parcial' ? 'var(--warning-border)' : 'var(--danger-border)';
                                            const label = s === 'online' ? 'IA: Online' : s === 'parcial' ? 'IA: Parcial' : 'IA: Offline';
                                            return (
                                                <button
                                                    onClick={() => setDiagOpen(true)}
                                                    title="Ver diagnóstico da IA (Sofia)"
                                                    style={{
                                                        fontSize: 10, padding: '2px 7px', borderRadius: 6,
                                                        border: `1px solid ${corBr}`, background: corBg,
                                                        color: cor, cursor: 'pointer', fontWeight: 700,
                                                        display: 'flex', alignItems: 'center', gap: 3,
                                                    }}
                                                >
                                                    <Activity size={9} />
                                                    {label}
                                                </button>
                                            );
                                        })()}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} /> {activeConvData?.wa_phone}</span>
                                        {!activeConvData?.cliente_id && (
                                            <button
                                                onClick={() => setShowVincular(true)}
                                                style={{
                                                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                                    background: colorBg('var(--warning)'), color: 'var(--warning)', border: `1px solid ${colorBorder('var(--warning)')}`,
                                                    cursor: 'pointer', fontWeight: 600,
                                                }}
                                            >
                                                <Link2 size={9} /> Vincular cliente
                                            </button>
                                        )}
                                        {activeConvData?.lead_qualificacao && (
                                            <span style={{
                                                fontSize: 10, padding: '1px 8px', borderRadius: 99, fontWeight: 600,
                                                background: colorBg(LEAD_COLORS[activeConvData.lead_qualificacao] || 'var(--muted)'),
                                                color: LEAD_COLORS[activeConvData.lead_qualificacao] || 'var(--muted)',
                                                border: `1px solid ${colorBorder(LEAD_COLORS[activeConvData.lead_qualificacao] || 'var(--muted)')}`,
                                            }}>
                                                {LEAD_LABELS[activeConvData.lead_qualificacao] || activeConvData.lead_qualificacao}
                                                {activeConvData.lead_score > 0 && ` ${activeConvData.lead_score}%`}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* ─── Atribuição ─── */}
                                <div style={{ position: 'relative' }}>
                                    {activeConvData?.atribuido_user_id ? (
                                        <button
                                            onClick={() => setShowAssignMenu(s => !s)}
                                            title={`Atribuída a ${activeConvData.atribuido_nome}`}
                                            style={{
                                                fontSize: 12, padding: '6px 10px', borderRadius: 8,
                                                border: `1px solid ${activeConvData.atribuido_user_id === user?.id ? colorBorder('var(--success)') : 'var(--border)'}`,
                                                background: activeConvData.atribuido_user_id === user?.id ? colorBg('var(--success)') : 'var(--bg-muted)',
                                                color: activeConvData.atribuido_user_id === user?.id ? 'var(--success)' : 'var(--text-primary)',
                                                cursor: 'pointer', fontWeight: 600,
                                                display: 'flex', alignItems: 'center', gap: 5,
                                            }}
                                        >
                                            <UserCheck size={12} />
                                            {activeConvData.atribuido_user_id === user?.id ? 'Você' : activeConvData.atribuido_nome?.split(' ')[0]}
                                            <ChevronDown size={10} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={puxarPraMim}
                                            title="Puxar esta conversa pra você"
                                            style={{
                                                fontSize: 12, padding: '6px 10px', borderRadius: 8,
                                                border: `1px solid ${colorBorder('var(--warning)')}`,
                                                background: colorBg('var(--warning)'),
                                                color: 'var(--warning)', cursor: 'pointer', fontWeight: 600,
                                                display: 'flex', alignItems: 'center', gap: 5,
                                            }}
                                        >
                                            <UserPlus size={12} /> Puxar pra mim
                                        </button>
                                    )}
                                    {showAssignMenu && (isGerente || activeConvData?.atribuido_user_id === user?.id) && (
                                        <div
                                            onMouseLeave={() => setShowAssignMenu(false)}
                                            style={{
                                                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                                borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
                                                minWidth: 220, zIndex: 50, overflow: 'hidden',
                                            }}
                                        >
                                            <div style={{ padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
                                                Atribuir a
                                            </div>
                                            <button
                                                onClick={() => atribuir(null, 'liberada pra fila')}
                                                style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <Inbox size={12} /> Liberar pra fila (ninguém)
                                            </button>
                                            {isGerente && usuarios.map(u => (
                                                <button
                                                    key={u.id}
                                                    onClick={() => atribuir(u.id)}
                                                    style={{
                                                        width: '100%', padding: '8px 12px', fontSize: 13,
                                                        background: activeConvData?.atribuido_user_id === u.id ? colorBg('var(--success)') : 'transparent',
                                                        border: 'none', textAlign: 'left', cursor: 'pointer',
                                                        color: activeConvData?.atribuido_user_id === u.id ? 'var(--success)' : 'var(--text-primary)',
                                                        fontWeight: activeConvData?.atribuido_user_id === u.id ? 700 : 500,
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                    }}
                                                    onMouseEnter={e => { if (activeConvData?.atribuido_user_id !== u.id) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                                                    onMouseLeave={e => { if (activeConvData?.atribuido_user_id !== u.id) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    {activeConvData?.atribuido_user_id === u.id ? <Check size={12} /> : <User size={12} />}
                                                    {u.nome}
                                                    <span style={{ fontSize: 9, marginLeft: 'auto', opacity: 0.6, textTransform: 'uppercase' }}>{u.role}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ─── Categoria ─── */}
                                <div style={{ position: 'relative' }}>
                                    <button
                                        onClick={() => setShowCategoriaMenu(s => !s)}
                                        title="Definir categoria"
                                        style={{
                                            fontSize: 12, padding: '6px 10px', borderRadius: 8,
                                            border: `1px solid ${activeConvData?.categoria ? colorBorder(CAT_MAP[activeConvData.categoria]?.c || 'var(--muted)') : 'var(--border)'}`,
                                            background: activeConvData?.categoria ? colorBg(CAT_MAP[activeConvData.categoria]?.c || 'var(--muted)') : 'transparent',
                                            color: activeConvData?.categoria ? CAT_MAP[activeConvData.categoria]?.c : 'var(--text-muted)',
                                            cursor: 'pointer', fontWeight: 600,
                                            display: 'flex', alignItems: 'center', gap: 5,
                                        }}
                                    >
                                        <Tag size={12} />
                                        {activeConvData?.categoria ? CAT_MAP[activeConvData.categoria]?.l : 'Categoria'}
                                        <ChevronDown size={10} />
                                    </button>
                                    {showCategoriaMenu && (
                                        <div
                                            onMouseLeave={() => setShowCategoriaMenu(false)}
                                            style={{
                                                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                                borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
                                                minWidth: 200, zIndex: 50, overflow: 'hidden',
                                            }}
                                        >
                                            <div style={{ padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
                                                Categoria
                                            </div>
                                            {CATEGORIAS.map(c => (
                                                <button
                                                    key={c.v || 'none'}
                                                    onClick={() => setCategoria(c.v)}
                                                    style={{
                                                        width: '100%', padding: '8px 12px', fontSize: 13,
                                                        background: activeConvData?.categoria === c.v ? colorBg(c.c) : 'transparent',
                                                        border: 'none', textAlign: 'left', cursor: 'pointer',
                                                        color: activeConvData?.categoria === c.v ? c.c : 'var(--text-primary)',
                                                        fontWeight: activeConvData?.categoria === c.v ? 700 : 500,
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                    }}
                                                    onMouseEnter={e => { if (activeConvData?.categoria !== c.v) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                                                    onMouseLeave={e => { if (activeConvData?.categoria !== c.v) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c.c, display: 'inline-block' }} />
                                                    {c.l}
                                                </button>
                                            ))}
                                            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', fontWeight: 700 }}>
                                                Prioridade
                                            </div>
                                            <div style={{ padding: '6px', display: 'flex', gap: 4 }}>
                                                {PRIORIDADES.map(p => (
                                                    <button
                                                        key={p.v}
                                                        onClick={() => setPrioridade(p.v)}
                                                        style={{
                                                            flex: 1, fontSize: 10, padding: '6px 4px', borderRadius: 5,
                                                            border: `1px solid ${activeConvData?.prioridade === p.v ? p.c : 'var(--border)'}`,
                                                            background: activeConvData?.prioridade === p.v ? colorBg(p.c) : 'transparent',
                                                            color: activeConvData?.prioridade === p.v ? p.c : 'var(--text-muted)',
                                                            cursor: 'pointer', fontWeight: 700,
                                                        }}
                                                    >
                                                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: p.c, marginRight: 4, verticalAlign: 'middle' }} />
                                                        {p.l}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* IA bloqueio toggle (anti-abuso) */}
                                <button
                                    onClick={toggleIABloqueio}
                                    title={activeConvData?.ia_bloqueada
                                        ? `IA pausada até ${activeConvData.ia_bloqueio_ate ? new Date(activeConvData.ia_bloqueio_ate).toLocaleString('pt-BR') : '?'} (${activeConvData.ia_bloqueio_motivo || 'manual'})`
                                        : 'Pausar IA nesta conversa por 24h (anti-abuso)'}
                                    style={{
                                        fontSize: 12, padding: '6px 10px', borderRadius: 8,
                                        border: `1px solid ${activeConvData?.ia_bloqueada ? 'var(--danger)' : 'var(--border)'}`,
                                        background: activeConvData?.ia_bloqueada ? 'var(--danger-bg)' : 'transparent',
                                        color: activeConvData?.ia_bloqueada ? 'var(--danger)' : 'var(--text-muted)',
                                        cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                    }}
                                >
                                    {activeConvData?.ia_bloqueada ? <><BellOff size={12} /> IA pausada</> : <><Pause size={12} /> Pausar IA</>}
                                </button>

                                {/* Aguardando cliente (pausa escalação pós-handoff) */}
                                {activeConvData?.status === 'humano' && (
                                    <button
                                        onClick={toggleAguardandoCliente}
                                        title={activeConvData?.aguardando_cliente
                                            ? 'Escalação pausada — Sofia não vai intervir enquanto você aguarda o cliente'
                                            : 'Marcar como "aguardando cliente" para pausar a escalação automática'}
                                        style={{
                                            fontSize: 12, padding: '6px 10px', borderRadius: 8,
                                            border: `1px solid ${activeConvData?.aguardando_cliente ? 'var(--warning)' : 'var(--border)'}`,
                                            background: activeConvData?.aguardando_cliente ? 'var(--warning-bg)' : 'transparent',
                                            color: activeConvData?.aguardando_cliente ? 'var(--warning)' : 'var(--text-muted)',
                                            cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <Hourglass size={12} />
                                        {activeConvData?.aguardando_cliente ? 'Aguardando cliente' : 'Aguardar cliente'}
                                    </button>
                                )}

                                {/* Badge de escalação ativa */}
                                {activeConvData?.status === 'humano' && Number(activeConvData?.escalacao_nivel) > 0 && !activeConvData?.aguardando_cliente && (
                                    <span
                                        title={`Sofia já agiu neste handoff (nível ${activeConvData.escalacao_nivel})`}
                                        style={{
                                            fontSize: 11, padding: '4px 8px', borderRadius: 6,
                                            background: activeConvData.escalacao_nivel >= 3 ? 'var(--danger-bg)' : activeConvData.escalacao_nivel >= 2 ? 'var(--warning-bg)' : 'var(--info-bg)',
                                            color: activeConvData.escalacao_nivel >= 3 ? 'var(--danger)' : activeConvData.escalacao_nivel >= 2 ? 'var(--warning)' : 'var(--info)',
                                            fontWeight: 600,
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        {activeConvData.abandonada ? <><Moon size={11} /> Abandonada</> : <><Zap size={11} /> N{activeConvData.escalacao_nivel}</>}
                                    </span>
                                )}

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
                            <div
                                className="wa-chat-area"
                                style={{
                                    flex: 1, overflowY: 'auto', padding: '14px 5% 10px',
                                    display: 'flex', flexDirection: 'column', gap: 2,
                                    background: 'var(--bg-body)',
                                    backgroundImage: `radial-gradient(circle at 25% 15%, ${colorBg('#C9A96E')} 0, transparent 40%), radial-gradient(circle at 75% 85%, ${colorBg('#1379F0')} 0, transparent 45%)`,
                                }}>
                                {mensagens.length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 32, margin: 'auto' }}>
                                        <MessageCircle size={32} style={{ opacity: 0.25, marginBottom: 8 }} />
                                        <div>Nenhuma mensagem nesta conversa.</div>
                                    </div>
                                )}
                                {mensagens.map((m, i) => {
                                    const isEntrada = m.direcao === 'entrada';
                                    const isInterno = m.interno === 1;
                                    const isIA = m.remetente === 'ia';
                                    const prev = mensagens[i - 1];
                                    const next = mensagens[i + 1];

                                    // Separador de dia
                                    const dayChanged = !prev || dayKey(prev.criado_em) !== dayKey(m.criado_em);

                                    // Agrupamento: mesma direção + remetente + ≤ 5 min
                                    const sameSenderAsPrev = prev && !dayChanged &&
                                        prev.direcao === m.direcao &&
                                        prev.remetente === m.remetente &&
                                        (prev.interno === 1) === isInterno &&
                                        Math.abs(new Date((m.criado_em || '').endsWith('Z') ? m.criado_em : m.criado_em + 'Z') - new Date((prev.criado_em || '').endsWith('Z') ? prev.criado_em : prev.criado_em + 'Z')) < 5 * 60 * 1000;
                                    const sameSenderAsNext = next &&
                                        dayKey(next.criado_em) === dayKey(m.criado_em) &&
                                        next.direcao === m.direcao &&
                                        next.remetente === m.remetente &&
                                        (next.interno === 1) === isInterno &&
                                        Math.abs(new Date((next.criado_em || '').endsWith('Z') ? next.criado_em : next.criado_em + 'Z') - new Date((m.criado_em || '').endsWith('Z') ? m.criado_em : m.criado_em + 'Z')) < 5 * 60 * 1000;

                                    // Estilo de bolha
                                    let bubbleBg, bubbleColor, align, indicator, metaColor;
                                    if (isEntrada) {
                                        bubbleBg = 'var(--bg-card)';
                                        bubbleColor = 'var(--text-primary)';
                                        align = 'flex-start';
                                        indicator = null;
                                        metaColor = 'var(--text-muted)';
                                    } else if (isInterno) {
                                        bubbleBg = 'var(--warning-bg)';
                                        bubbleColor = '#78350f';
                                        align = 'flex-end';
                                        indicator = <Lock size={10} style={{ opacity: 0.7 }} />;
                                        metaColor = 'rgba(120,53,15,0.6)';
                                    } else if (isIA) {
                                        bubbleBg = 'linear-gradient(135deg, #8b5cf6, #6366f1)';
                                        bubbleColor = '#fff';
                                        align = 'flex-end';
                                        indicator = <Bot size={10} />;
                                        metaColor = 'rgba(255,255,255,0.75)';
                                    } else {
                                        bubbleBg = 'var(--primary)';
                                        bubbleColor = '#fff';
                                        align = 'flex-end';
                                        indicator = null;
                                        metaColor = 'rgba(255,255,255,0.75)';
                                    }

                                    // Raio da bolha (com "tail" apenas na primeira/última do grupo)
                                    const R = 12, r = 4;
                                    const isFirst = !sameSenderAsPrev;
                                    const isLast = !sameSenderAsNext;
                                    const bubbleRadius = isEntrada
                                        ? `${isFirst ? r : R}px ${R}px ${R}px ${R}px`
                                        : `${R}px ${isFirst ? r : R}px ${R}px ${R}px`;

                                    // Só mostra hora + ticks na última msg do grupo
                                    const showMeta = isLast;
                                    const hasText = !!(m.conteudo && !m.conteudo.startsWith('['));
                                    const hasBracketNote = !!(m.conteudo && m.conteudo.startsWith('[') && !m.media_url);
                                    const hasMedia = !!m.media_url;

                                    return (
                                        <div key={m.id}>
                                            {/* Separador de dia */}
                                            {dayChanged && (
                                                <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 10px' }}>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 600,
                                                        padding: '4px 12px', borderRadius: 99,
                                                        background: 'var(--bg-card)',
                                                        color: 'var(--text-muted)',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                                        border: '1px solid var(--border)',
                                                        letterSpacing: 0.2,
                                                    }}>
                                                        {formatDayLabel(m.criado_em)}
                                                    </span>
                                                </div>
                                            )}

                                            <div style={{
                                                display: 'flex', justifyContent: align,
                                                marginTop: sameSenderAsPrev ? 2 : 8,
                                                marginBottom: sameSenderAsNext ? 0 : 2,
                                            }}>
                                                <div style={{
                                                    maxWidth: '68%',
                                                    padding: hasMedia && !hasText && !hasBracketNote ? '4px 4px 6px' : '7px 10px 8px',
                                                    borderRadius: bubbleRadius,
                                                    background: bubbleBg, color: bubbleColor,
                                                    boxShadow: '0 1px 1.5px rgba(0,0,0,0.09)',
                                                    position: 'relative',
                                                    minWidth: 64,
                                                }}>
                                                    {/* Header de remetente (IA / nota interna / usuário) — só na primeira do grupo */}
                                                    {isFirst && (indicator || isInterno || isIA) && (
                                                        <div style={{ fontSize: 10.5, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4, opacity: 0.85, fontWeight: 700, letterSpacing: 0.2 }}>
                                                            {indicator}
                                                            {isInterno && 'Nota interna'}
                                                            {isIA && !isInterno && 'Sofia · IA'}
                                                            {!isIA && !isInterno && m.usuario_nome && m.usuario_nome}
                                                        </div>
                                                    )}
                                                    {isFirst && !indicator && !isEntrada && !isIA && !isInterno && m.usuario_nome && (
                                                        <div style={{ fontSize: 10.5, marginBottom: 3, opacity: 0.8, fontWeight: 700, letterSpacing: 0.2 }}>
                                                            {m.usuario_nome}
                                                        </div>
                                                    )}
                                                    {/* Mídia */}
                                                    {m.media_url && (m.tipo === 'imagem' || m.tipo === 'sticker') && (
                                                        <img
                                                            src={m.media_url}
                                                            alt="Imagem"
                                                            style={{ maxWidth: 320, maxHeight: 320, borderRadius: 8, marginBottom: hasText ? 6 : 0, cursor: 'pointer', objectFit: 'cover', display: 'block' }}
                                                            onClick={() => setLightbox(m.media_url)}
                                                        />
                                                    )}
                                                    {m.media_url && m.tipo === 'video' && (
                                                        <video controls style={{ maxWidth: 320, borderRadius: 8, marginBottom: hasText ? 6 : 0, display: 'block' }}>
                                                            <source src={m.media_url} type="video/mp4" />
                                                        </video>
                                                    )}
                                                    {m.media_url && m.tipo === 'audio' && (
                                                        <audio controls style={{ minWidth: 240, marginBottom: 4, display: 'block' }}>
                                                            <source src={m.media_url} type="audio/ogg" />
                                                        </audio>
                                                    )}
                                                    {m.media_url && m.tipo === 'documento' && (
                                                        <a href={m.media_url} target="_blank" rel="noopener noreferrer"
                                                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.08)', borderRadius: 6, marginBottom: hasText ? 6 : 0, color: 'inherit', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                                                            <FileText size={16} /> Documento
                                                        </a>
                                                    )}
                                                    {/* Texto com espaço pra timestamp inline (estilo WA) */}
                                                    {hasText && (
                                                        <div style={{ fontSize: 14.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                            {m.conteudo}
                                                            {showMeta && (
                                                                <span style={{ display: 'inline-block', width: m.direcao === 'saida' && !isInterno ? 64 : 42, height: 1 }} />
                                                            )}
                                                        </div>
                                                    )}
                                                    {hasBracketNote && (
                                                        <div style={{ fontSize: 13.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: 'italic', opacity: 0.75 }}>
                                                            {m.conteudo}
                                                        </div>
                                                    )}
                                                    {/* Meta: hora + ticks (bottom-right inside bubble) */}
                                                    {showMeta && (
                                                        <div style={{
                                                            position: 'absolute', right: 10, bottom: 5,
                                                            fontSize: 10, color: metaColor,
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                            pointerEvents: 'none',
                                                        }}>
                                                            {formatTime(m.criado_em)}
                                                            {m.direcao === 'saida' && !isInterno && (
                                                                <>
                                                                    {m.status_envio === 'lido'
                                                                        ? <CheckCheck size={13} style={{ color: '#53bdeb' }} />
                                                                        : m.status_envio === 'entregue'
                                                                            ? <CheckCheck size={13} />
                                                                            : <Check size={13} />}
                                                                </>
                                                            )}
                                                        </div>
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
                                padding: '10px 16px 14px', borderTop: '1px solid var(--border)',
                                background: 'var(--bg-card)',
                            }}>
                                {/* Toggle interno + sugerir (chips discretos) */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <button
                                        onClick={() => setInterno(false)}
                                        style={{
                                            fontSize: 11, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
                                            background: !interno ? colorBg('var(--success)') : 'transparent',
                                            color: !interno ? 'var(--success)' : 'var(--text-muted)',
                                            border: `1px solid ${!interno ? colorBorder('var(--success)') : 'var(--border)'}`,
                                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <MessageCircle size={11} /> Para o cliente
                                    </button>
                                    <button
                                        onClick={() => setInterno(true)}
                                        style={{
                                            fontSize: 11, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
                                            background: interno ? 'var(--warning-bg)' : 'transparent',
                                            color: interno ? 'var(--warning-hover)' : 'var(--text-muted)',
                                            border: `1px solid ${interno ? colorBorder('#fbbf24') : 'var(--border)'}`,
                                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <Lock size={11} /> Nota interna
                                    </button>

                                    {/* Botão Sugerir — só aparece se ativado em Configurações > IA */}
                                    {(diag?.sugestoes_ativa !== false) && (
                                        <button
                                            onClick={sugerir}
                                            disabled={suggesting}
                                            style={{
                                                fontSize: 11, padding: '3px 10px', borderRadius: 99, cursor: suggesting ? 'wait' : 'pointer',
                                                background: colorBg('#8b5cf6'), color: '#8b5cf6',
                                                border: `1px solid ${colorBorder('#8b5cf6')}`, fontWeight: 600,
                                                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                                                opacity: suggesting ? 0.6 : 1,
                                            }}
                                        >
                                            {suggesting ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            {suggesting ? 'Gerando...' : 'Sugerir'}
                                        </button>
                                    )}
                                </div>

                                {/* Input + Send — pill-style */}
                                <div style={{
                                    display: 'flex', gap: 8, alignItems: 'center',
                                    background: interno ? '#fef3c720' : 'var(--bg-muted)',
                                    border: `1px solid ${interno ? colorBorder('#fbbf24') : 'var(--border)'}`,
                                    borderRadius: 24,
                                    padding: '4px 4px 4px 6px',
                                    transition: 'border-color 0.15s',
                                }}>
                                    {/* Anexar arquivo (esquerda, redondo, sutil) */}
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
                                                    background: 'transparent', border: 'none', borderRadius: '50%',
                                                    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
                                                    transition: 'background 0.15s, color 0.15s',
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                title="Anexar arquivo"
                                            >
                                                <Paperclip size={19} />
                                            </button>
                                        </>
                                    )}
                                    <textarea
                                        ref={inputRef}
                                        placeholder={interno ? 'Escrever nota interna...' : 'Digite uma mensagem'}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
                                        }}
                                        rows={1}
                                        style={{
                                            flex: 1, resize: 'none', fontSize: 14.5, lineHeight: 1.4,
                                            border: 'none', outline: 'none',
                                            background: 'transparent', color: 'var(--text-primary)',
                                            padding: '8px 4px', fontFamily: 'inherit',
                                            maxHeight: 120, minHeight: 20,
                                        }}
                                    />
                                    {/* Mic / Send — circular à direita */}
                                    {!interno && !input.trim() ? (
                                        <button
                                            onClick={recording ? stopRecording : startRecording}
                                            disabled={sending}
                                            style={{
                                                width: 40, height: 40, borderRadius: '50%',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: 'none', cursor: 'pointer', flexShrink: 0,
                                                background: recording ? 'var(--danger)' : 'var(--primary)',
                                                color: '#fff',
                                                boxShadow: '0 2px 6px rgba(19,121,240,0.3)',
                                                transition: 'transform 0.12s',
                                            }}
                                            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
                                            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                            title={recording ? 'Parar gravação' : 'Gravar áudio'}
                                        >
                                            {recording ? <Square size={17} /> : <Mic size={18} />}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={enviar}
                                            disabled={!input.trim() || sending}
                                            style={{
                                                width: 40, height: 40, borderRadius: '50%',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: 'none', cursor: !input.trim() || sending ? 'not-allowed' : 'pointer', flexShrink: 0,
                                                background: interno ? 'var(--warning)' : 'var(--primary)',
                                                color: '#fff',
                                                opacity: !input.trim() || sending ? 0.5 : 1,
                                                boxShadow: '0 2px 6px rgba(19,121,240,0.3)',
                                                transition: 'transform 0.12s',
                                            }}
                                            onMouseDown={e => { if (input.trim()) e.currentTarget.style.transform = 'scale(0.92)'; }}
                                            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                            title="Enviar"
                                        >
                                            <Send size={17} style={{ marginLeft: -2 }} />
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

            {/* ═══ Modal Diagnóstico da IA (Sofia) ═══ */}
            {diagOpen && (
                <Modal title="Diagnóstico da IA (Sofia)" close={() => setDiagOpen(false)} w={500}>
                    {!diag ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                            <RefreshCw size={20} className="spin" />
                            <div style={{ marginTop: 8, fontSize: 12 }}>Carregando...</div>
                        </div>
                    ) : (() => {
                        // Render de cada linha do check-list
                        const Row = ({ ok, label, value, warn = false }) => {
                            const cor = ok ? 'var(--success)' : warn ? 'var(--warning)' : 'var(--danger)';
                            const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
                            return (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 8, marginBottom: 6,
                                    border: '1px solid var(--border)', background: 'var(--bg-muted)',
                                }}>
                                    <Icon size={18} style={{ color: cor, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
                                        {value && (
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{value}</div>
                                        )}
                                    </div>
                                </div>
                            );
                        };

                        const ultimaIso = diag.ultima_resposta_ia_em;
                        const ultimaTxt = ultimaIso
                            ? new Date(ultimaIso.endsWith('Z') ? ultimaIso : ultimaIso + 'Z').toLocaleString('pt-BR')
                            : 'nunca respondeu';

                        return (
                            <div>
                                {/* Status geral */}
                                <div style={{
                                    padding: '12px 14px', borderRadius: 10, marginBottom: 14,
                                    background: diag.status_geral === 'online' ? 'var(--success-bg)'
                                        : diag.status_geral === 'parcial' ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                    border: `1px solid ${diag.status_geral === 'online' ? 'var(--success-border)'
                                        : diag.status_geral === 'parcial' ? 'var(--warning-border)' : 'var(--danger-border)'}`,
                                }}>
                                    <div style={{
                                        fontSize: 15, fontWeight: 700,
                                        color: diag.status_geral === 'online' ? 'var(--success-hover)'
                                            : diag.status_geral === 'parcial' ? 'var(--warning-hover)' : 'var(--danger-hover)',
                                    }}>
                                        {diag.status_geral === 'online' && 'Sofia está operacional — respondendo mensagens e capturando leads.'}
                                        {diag.status_geral === 'parcial' && 'Sofia está parcialmente configurada — algo impede o funcionamento.'}
                                        {diag.status_geral === 'offline' && 'Sofia está OFFLINE — nenhuma mensagem nova será respondida.'}
                                    </div>
                                </div>

                                {/* Check-list */}
                                <Row ok={diag.ia_ativa}
                                    label="IA globalmente ativa"
                                    value={diag.ia_ativa ? 'Kill-switch principal está LIGADO' : 'Kill-switch está DESLIGADO — Sofia não responde.'} />
                                <Row ok={diag.ia_api_configurada}
                                    label="API da Claude configurada"
                                    value={diag.ia_api_configurada ? 'Chave de API presente' : 'Falta cadastrar a chave em Configurações → IA'} />
                                <Row ok={diag.wa_configurado && diag.evolution_connected}
                                    warn={diag.wa_configurado && !diag.evolution_connected}
                                    label="WhatsApp conectado (Evolution)"
                                    value={!diag.wa_configurado ? 'Não configurado'
                                        : diag.evolution_connected ? `Conectado (estado: ${diag.evolution_state})`
                                        : `Desconectado — estado: ${diag.evolution_state}. Vá em Configurações e escaneie o QR novamente.`} />
                                <Row ok={diag.conversas_bloqueadas === 0} warn={diag.conversas_bloqueadas > 0 && diag.conversas_bloqueadas < 5}
                                    label="Conversas com IA pausada (anti-abuso)"
                                    value={`${diag.conversas_bloqueadas} conversa(s) com bloqueio ativo. Expira automaticamente ou você pode despausar manualmente em cada chat.`} />
                                <Row ok={diag.escalacao_ativa} warn={!diag.escalacao_ativa}
                                    label="Escalação pós-handoff"
                                    value={diag.escalacao_ativa ? 'Ligada — Sofia faz follow-up após handoff humano.' : 'Desligada — opcional, não impede captura de leads.'} />

                                {/* Métricas das últimas 24h */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                                    <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-muted)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{diag.leads_24h}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Leads 24h</div>
                                    </div>
                                    <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-muted)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginTop: 3 }}>Última resposta</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{ultimaTxt}</div>
                                    </div>
                                </div>

                                {/* Problemas detectados (lista bullets) */}
                                {diag.problemas?.length > 0 && (
                                    <div style={{
                                        marginTop: 14, padding: 12, borderRadius: 8,
                                        background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                                    }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger-hover)', marginBottom: 6 }}>
                                            Problemas detectados:
                                        </div>
                                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--danger-hover)', lineHeight: 1.6 }}>
                                            {diag.problemas.map((p, i) => <li key={i}>{p}</li>)}
                                        </ul>
                                    </div>
                                )}

                                {/* Ações */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <button
                                        onClick={loadDiagnostico}
                                        className={Z.btn2}
                                        style={{ fontSize: 12, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                        <RefreshCw size={13} /> Atualizar
                                    </button>
                                    {isGerente && (
                                        <button
                                            onClick={toggleIA}
                                            disabled={iaToggling}
                                            style={{
                                                fontSize: 12, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                                                fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                                                border: `1px solid ${diag.ia_ativa ? 'var(--danger)' : 'var(--success)'}`,
                                                background: diag.ia_ativa ? 'var(--danger)' : 'var(--success)',
                                                color: '#fff',
                                            }}
                                        >
                                            <Power size={13} />
                                            {iaToggling ? 'Aguarde...' : diag.ia_ativa ? 'Desativar IA' : 'Ativar IA'}
                                        </button>
                                    )}
                                </div>

                                {!isGerente && (
                                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', fontStyle: 'italic' }}>
                                        Apenas gerente/admin pode ligar/desligar a IA.
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </Modal>
            )}
        </div>
    );
}
