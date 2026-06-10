import { useState, useEffect, useRef, useCallback } from 'react';
import { Z, Ic, Modal, PageHeader, TabBar, EmptyState, ConfirmModal } from '../ui';
import { colorBg, colorBorder } from '../theme';
import api from '../api';
import { useAuth } from '../auth';
import useWebSocket from '../hooks/useWebSocket';
import {
    MessageCircle, Send, Lock, Bot, Sparkles, User, Phone,
    Search, MoreVertical, ArrowLeft, Link2, RefreshCw, Check, CheckCheck,
    Paperclip, Mic, Square, Image, X, FileText, Download,
    UserPlus, UserCheck, Tag, Archive, Inbox, Users as UsersIcon,
    AlertCircle, History, ChevronDown, Flag, Clock,
    Pause, BellOff, Hourglass, Moon, Zap,
    Activity, Power, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// PÁGINA DE MENSAGENS — Chat WhatsApp integrado
// ═══════════════════════════════════════════════════════

const STATUS_LABELS = { ia: 'IA', humano: 'Humano', fechado: 'Fechado' };
const STATUS_ICONS = { ia: <Bot size={12} />, humano: <User size={12} />, fechado: <Lock size={12} /> };
const STATUS_COLORS = {
    ia: { bg: colorBg('var(--accent)'), color: 'var(--accent)', border: colorBorder('var(--accent)') },
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
    { v: 'medicao', l: 'Medição', c: 'var(--info)' },
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
    const palette = ['#0ea5e9', 'var(--success)', 'var(--warning)', 'var(--danger)', '#06b6d4', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}

// Avatar com foto de perfil real do WhatsApp (fallback: iniciais coloridas)
function Avatar({ src, name, size = 44, style = {} }) {
    const [erro, setErro] = useState(false);
    useEffect(() => { setErro(false); }, [src]);
    if (src && !erro) {
        return (
            <img
                src={src} alt="" loading="lazy"
                onError={() => setErro(true)}
                style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'block', background: 'var(--bg-muted)', ...style }}
            />
        );
    }
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%',
            background: avatarColor(name),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: Math.round(size * 0.36), fontWeight: 700, flexShrink: 0, ...style,
        }}>
            {initials(name)}
        </div>
    );
}

// Player de áudio estilo WhatsApp (play/pause + barra + tempo + velocidade)
function WaAudioPlayer({ src, accent = 'var(--success)' }) {
    const audioRef = useRef(null);
    const [tocando, setTocando] = useState(false);
    const [prog, setProg] = useState(0);       // 0..1
    const [dur, setDur] = useState(0);
    const [vel, setVel] = useState(1);
    const fmt = (s) => {
        if (!isFinite(s) || s <= 0) return '0:00';
        const m = Math.floor(s / 60), ss = Math.floor(s % 60);
        return `${m}:${String(ss).padStart(2, '0')}`;
    };
    const toggle = () => {
        const a = audioRef.current; if (!a) return;
        if (a.paused) { a.play(); } else { a.pause(); }
    };
    const seek = (e) => {
        const a = audioRef.current; if (!a || !isFinite(a.duration)) return;
        const r = e.currentTarget.getBoundingClientRect();
        a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
    };
    const mudarVel = () => {
        const prox = vel === 1 ? 1.5 : vel === 1.5 ? 2 : 1;
        setVel(prox);
        if (audioRef.current) audioRef.current.playbackRate = prox;
    };
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 230, padding: '4px 2px' }}>
            <audio
                ref={audioRef} src={src} preload="metadata"
                onPlay={() => setTocando(true)} onPause={() => setTocando(false)}
                onEnded={() => { setTocando(false); setProg(0); }}
                onTimeUpdate={e => setProg(e.target.duration ? e.target.currentTime / e.target.duration : 0)}
                onLoadedMetadata={e => setDur(e.target.duration)}
            />
            <button onClick={toggle} style={{
                width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                {tocando
                    ? <span style={{ display: 'flex', gap: 3 }}><span style={{ width: 3.5, height: 13, background: '#fff', borderRadius: 1 }} /><span style={{ width: 3.5, height: 13, background: '#fff', borderRadius: 1 }} /></span>
                    : <span style={{ width: 0, height: 0, borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: '12px solid #fff', marginLeft: 3 }} />}
            </button>
            <div style={{ flex: 1, minWidth: 110 }}>
                <div onClick={seek} style={{ height: 18, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ position: 'relative', height: 4, borderRadius: 99, background: 'rgba(0,0,0,0.14)', flex: 1 }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, borderRadius: 99, background: accent }} />
                        <div style={{ position: 'absolute', left: `calc(${prog * 100}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: '50%', background: accent, boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
                    </div>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--wa-meta)', marginTop: 1 }}>
                    {fmt(prog > 0 && audioRef.current ? audioRef.current.currentTime : dur)}
                </div>
            </div>
            <button onClick={mudarVel} style={{
                fontSize: 10.5, fontWeight: 700, padding: '3px 7px', borderRadius: 99, cursor: 'pointer',
                background: 'rgba(0,0,0,0.08)', border: 'none', color: 'var(--wa-meta)', flexShrink: 0,
            }}>
                {vel}×
            </button>
        </div>
    );
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
    // Layout WhatsApp Web: em tela larga a lista fica SEMPRE visível ao lado do chat;
    // só em tela estreita o chat substitui a lista (padrão celular)
    const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false));
    useEffect(() => {
        const onResize = () => setIsNarrow(window.innerWidth < 1024);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    // Tema acompanha o ERP (data-theme no <html>): claro e escuro oficiais do WhatsApp
    const [appDark, setAppDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
    useEffect(() => {
        const obs = new MutationObserver(() => setAppDark(document.documentElement.getAttribute('data-theme') === 'dark'));
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
    }, []);
    // Papel de parede do chat = logomarca d'água da Ornato (a mesma do sistema/proposta)
    const [marca, setMarca] = useState({ wm: '', wmOp: 0.04 });
    useEffect(() => {
        api.get('/config/empresa')
            .then(d => setMarca({
                wm: d?.logo_watermark_path || d?.logo_watermark || '',
                wmOp: d?.logo_watermark_opacity ?? 0.04,
            }))
            .catch(() => { /* sem watermark: fundo limpo */ });
    }, []);
    const [recording, setRecording] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const [showPanel, setShowPanel] = useState(() => {
        try { return localStorage.getItem('mens_panel') !== '0'; } catch { return true; }
    });
    const [clientePanel, setClientePanel] = useState(null);

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
    const [confirmBackfill, setConfirmBackfill] = useState(false);
    const [confirmFullSync, setConfirmFullSync] = useState(false);
    const [confirmIA, setConfirmIA] = useState(null); // { alvo: bool, msg: string }
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
            const lista = Array.isArray(data) ? data : (data.conversas || []);
            setConversas(lista);
            // Atualizar activeConvData se a conversa ativa mudou (lead score, status, etc.)
            setActiveConvData(prev => {
                if (!prev) return prev;
                const updated = lista.find(c => c.id === prev.id);
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
        api.get('/whatsapp/usuarios-disponiveis').then(setUsuarios).catch(() => { notify?.('Erro ao carregar atendentes', 'error'); });
    }, []);

    // Persistir aba
    useEffect(() => { localStorage.setItem('mens_filtro', filtroAba); }, [filtroAba]);

    // ═══ Carregar mensagens de uma conversa ═══
    const loadMensagens = useCallback(async (convId) => {
        try {
            const data = await api.get(`/whatsapp/conversas/${convId}/mensagens`);
            setMensagens(data);
            // Rolar SÓ o container de mensagens (não scrollIntoView — ele rolava o
            // <main> junto e cortava o topo da página). Vai direto ao fim.
            setTimeout(() => {
                const cont = messagesEndRef.current?.parentElement;
                if (cont) cont.scrollTop = cont.scrollHeight;
                // trava: o <main> nunca deve rolar nesta página (senão corta o topo)
                const mainEl = messagesEndRef.current?.closest('main');
                if (mainEl && mainEl.scrollTop !== 0) mainEl.scrollTop = 0;
            }, 60);
        } catch { notify?.('Erro ao carregar mensagens'); }
    }, [notify]);

    useEffect(() => { loadConversas(); loadContadores(); }, [loadConversas, loadContadores]);

    // ═══ Abrir conversa vinda de deep-link (Funil, Cliente etc.) ═══
    // Outra página stasha `sessionStorage.mens_open_conv = <convId>` e navega
    // pra cá. Aqui, assim que a lista de conversas carrega, abrimos a conversa
    // alvo. Se ela não estiver no filtro atual (ex: está em "todas" e a aba é
    // "minhas"), tenta trocar pra "todas" uma vez antes de desistir.
    const pendingOpenTriedAll = useRef(false);
    useEffect(() => {
        let targetId;
        try { targetId = sessionStorage.getItem('mens_open_conv'); } catch { /* */ }
        if (!targetId) return;
        if (!conversas || conversas.length === 0) return;

        const target = conversas.find(c => String(c.id) === String(targetId));
        if (target) {
            setActiveConv(target.id);
            setActiveConvData(target);
            loadMensagens(target.id);
            setMobileShowChat(true);
            setConversas(prev => prev.map(c => c.id === target.id ? { ...c, nao_lidas: 0 } : c));
            try { sessionStorage.removeItem('mens_open_conv'); } catch { /* */ }
            pendingOpenTriedAll.current = false;
        } else if (!pendingOpenTriedAll.current && filtroAba !== 'todas') {
            // Não achou no filtro atual — tenta aba "todas"
            pendingOpenTriedAll.current = true;
            setFiltroAba('todas');
        } else {
            // Tentou "todas" e mesmo assim não achou: descarta
            try { sessionStorage.removeItem('mens_open_conv'); } catch { /* */ }
            pendingOpenTriedAll.current = false;
        }
    }, [conversas, filtroAba, loadMensagens]);

    // ═══ WebSocket: atualização em tempo real ═══
    const activeConvRef = useRef(activeConv);
    activeConvRef.current = activeConv;

    const handleWsEvent = useCallback((msg) => {
        if (!msg || !msg.type) return;
        if (msg.type === 'chat.message') {
            const convId = msg.data?.conversa_id;
            // Atualiza lista + contadores via HTTP (precisamos do conteúdo da mensagem)
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
            // Atualiza status da mensagem diretamente no state — sem HTTP fetch.
            // Casa por mensagem_id (envio em background: 'enviando'→'enviado'/'falhou',
            // ainda sem wa_message_id) OU por wa_message_id (ACKs do WhatsApp).
            const { wa_message_id, mensagem_id, status } = msg.data || {};
            if (status && (wa_message_id || mensagem_id)) {
                setMensagens(prev => prev.map(m =>
                    (mensagem_id && m.id === mensagem_id) || (wa_message_id && m.wa_message_id === wa_message_id)
                        ? { ...m, status_envio: status, ...(wa_message_id ? { wa_message_id } : {}) }
                        : m
                ));
            }
        } else if (msg.type === 'whatsapp.connection') {
            // Re-fetch diagnóstico direto — evita dependência circular com loadDiagnostico
            api.get('/whatsapp/diagnostico').then(setDiag).catch(() => {});
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
            // Fallback: o status (enviando→enviado/falhou) chega por WS. Se o evento
            // se perder, re-sincroniza em 18s (envio à Evolution tem timeout de 15s).
            const convId = activeConv;
            setTimeout(() => {
                setMensagens(prev => {
                    if (prev.some(m => m.status_envio === 'enviando')) loadMensagens(convId);
                    return prev;
                });
            }, 18000);
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

    // ═══ Liga/desliga a Sofia (IA) NESTA conversa — interruptor direto ═══
    // status='ia'  → Sofia responde sozinha (qualifica o lead)
    // status='humano' → Sofia cala, atendimento humano assume
    // O webhook respeita o status (webhook.js: só responde se status==='ia').
    const setIAConversa = async (ligar) => {
        if (!activeConv) return;
        const next = ligar ? 'ia' : 'humano';
        try {
            await api.put(`/whatsapp/conversas/${activeConv}/status`, { status: next });
            setActiveConvData(prev => prev ? { ...prev, status: next } : prev);
            loadConversas();
            notify?.(ligar ? 'Sofia ligada nesta conversa — ela volta a responder' : 'Sofia desligada — só atendimento humano nesta conversa');
        } catch (e) { notify?.(e.error || 'Erro ao alternar a IA'); }
    };

    // ═══ Reenviar mensagem que falhou ═══
    const reenviar = async (m) => {
        if (!activeConv || !m?.conteudo) return;
        try {
            await api.post(`/whatsapp/conversas/${activeConv}/enviar`, { conteudo: m.conteudo, tipo: m.tipo || 'texto' });
            await loadMensagens(activeConv);
        } catch (e) { notify?.(e.error || 'Erro ao reenviar'); }
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
        setConfirmBackfill(true);
    };
    const rodarBackfillConfirmado = async () => {
        setConfirmBackfill(false);
        setBackfilling(true);
        try {
            const r = await api.post('/whatsapp/backfill', { limit: 1000 });
            const msg = r.chats_processados === 0
                ? `Nenhum chat encontrado no cache da Evolution. Use "Histórico completo (re-parear)" pra puxar tudo do celular.`
                : r.dica
                    ? `${r.chats_processados} chats verificados, nada novo. ${r.dica}`
                    : `${r.chats_processados} chats | ${r.mensagens_inseridas} mensagens importadas`;
            notify?.(msg);
            loadConversas();
            loadContadores();
        } catch (e) {
            notify?.(e.error || 'Erro ao puxar histórico');
        } finally { setBackfilling(false); }
    };

    // ═══ Re-parear com syncFullHistory (puxa ~6 meses do celular) ═══
    const rodarFullHistorySync = () => setConfirmFullSync(true);
    const rodarFullHistorySyncConfirmado = async () => {
        setConfirmFullSync(false);
        setBackfilling(true);
        try {
            const r = await api.post('/whatsapp/enable-full-history', { logout: true });
            notify?.(`Sincronização completa ativada. ${r.instrucoes || 'Re-escaneie o QR Code agora.'}`, 'success');
        } catch (e) {
            notify?.(`Erro: ${e.error || e.message}. Tente manualmente: nas configs da Evolution, ative syncFullHistory e re-escaneie o QR.`, 'error');
        } finally { setBackfilling(false); }
    };

    const rodarBackfillConversa = async () => {
        if (!activeConv) return;
        setBackfilling(true);
        try {
            const r = await api.post(`/whatsapp/conversas/${activeConv}/backfill`);
            notify?.(`${r.inseridas}/${r.total} mensagens importadas`);
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

    const toggleIA = () => {
        if (!isGerente) return;
        const alvo = !diag?.ia_ativa;
        const msg = alvo
            ? 'Reativar a IA (Sofia)? Ela voltará a responder mensagens e capturar leads automaticamente.'
            : 'DESATIVAR a IA (Sofia)? Nenhuma mensagem nova será respondida e nenhum lead será capturado até você reativar.';
        setConfirmIA({ alvo, msg });
    };
    const toggleIAConfirmado = async () => {
        const alvo = confirmIA?.alvo;
        setConfirmIA(null);
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

    // Persistir toggle do painel direito
    useEffect(() => {
        try { localStorage.setItem('mens_panel', showPanel ? '1' : '0'); } catch { /* */ }
    }, [showPanel]);

    // Carregar dados ricos do cliente para o painel direito
    useEffect(() => {
        const cid = activeConvData?.cliente_id;
        if (!cid) { setClientePanel(null); return; }
        api.get(`/clientes/${cid}`).then(setClientePanel).catch(() => setClientePanel(null));
    }, [activeConvData?.cliente_id]);

    // Filtrar conversas
    const filtered = conversas.filter(c => {
        const q = search.toLowerCase();
        return !q || (c.cliente_nome || '').toLowerCase().includes(q)
            || (c.wa_name || '').toLowerCase().includes(q)
            || (c.wa_phone || '').includes(q);
    });

    // ═══ RENDER ═══
    return (
        <div className={Z.pg} style={{
            padding: 0, maxWidth: '100%', height: 'calc(100vh - 56px)', // Topbar = 56px (era 64, descasava e cortava o topo)
            overflow: 'hidden',
            // ── Layout WhatsApp Web com as CORES DO SISTEMA ──
            // Nada de paleta própria: tudo deriva das vars do tema do ERP
            // (claro/escuro/cor primária configurável acompanham sozinhos).
            '--wa-bubble-in':   'var(--bg-card)',
            '--wa-bubble-out':  'color-mix(in srgb, var(--primary) 22%, var(--bg-card))',
            '--wa-bubble-ia':   'color-mix(in srgb, var(--success) 16%, var(--bg-card))',
            '--wa-bubble-interno':      'color-mix(in srgb, #f59e0b 14%, var(--bg-card))',
            '--wa-bubble-interno-text': 'var(--text-primary)',
            '--wa-bubble-text': 'var(--text-primary)',
            '--wa-meta':        'var(--text-muted)',
            '--wa-row-active':  'var(--bg-hover)',
            '--wa-splash':      'var(--bg-muted)',
        }}>
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

                {/* ═══ Painel Esquerdo: Lista de Conversas (sempre visível em tela larga) ═══ */}
                <div style={{
                    width: isNarrow ? '100%' : 'clamp(300px, 30vw, 400px)', minWidth: 0, borderRight: '1px solid var(--border)',
                    display: (isNarrow && mobileShowChat) ? 'none' : 'flex', flexDirection: 'column', background: 'var(--bg-muted)',
                    flexShrink: 0,
                }}
                    className="conv-list-panel"
                >
                    {/* Sidebar Header — WhatsApp style */}
                    <div style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
                        {/* Row 1: avatar + title + action icons */}
                        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, height: 60 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                background: avatarColor(user?.nome || user?.email || ''),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 14, fontWeight: 700,
                            }}>
                                {initials(user?.nome || user?.email || '')}
                            </div>
                            <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Ornato</span>

                            {/* IA status */}
                            {diag && (
                                <button onClick={() => setDiagOpen(true)} title={`IA ${diag.status_geral}`} style={{
                                    width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
                                    background: 'transparent', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: diag.status_geral === 'online' ? '#25d366' : diag.status_geral === 'parcial' ? '#f59e0b' : '#ef4444',
                                    position: 'relative',
                                }}>
                                    <Activity size={18} />
                                    <span style={{
                                        position: 'absolute', top: 7, right: 7, width: 7, height: 7,
                                        borderRadius: '50%',
                                        background: diag.status_geral === 'online' ? '#25d366' : diag.status_geral === 'parcial' ? '#f59e0b' : '#ef4444',
                                    }} />
                                </button>
                            )}

                            {/* Histórico (gerente) */}
                            {isGerente && (
                                <button onClick={rodarBackfill} disabled={backfilling} title="Puxar histórico" style={{
                                    width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
                                    background: 'transparent', cursor: backfilling ? 'wait' : 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                                }}>
                                    {backfilling ? <RefreshCw size={18} className="spin" /> : <History size={18} />}
                                </button>
                            )}

                            <button style={{
                                width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
                                background: 'transparent', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                            }}>
                                <MoreVertical size={18} />
                            </button>
                        </div>

                        {/* Row 2: Search */}
                        <div style={{ padding: '0 12px 10px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'var(--bg-card)', borderRadius: 8, padding: '8px 12px',
                            }}>
                                <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                <input
                                    placeholder="Pesquisar ou começar uma conversa"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    style={{
                                        flex: 1, border: 'none', outline: 'none', background: 'transparent',
                                        fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Row 3: Filter chips */}
                        <div style={{
                            padding: '0 12px 10px', display: 'flex', gap: 6,
                            overflowX: 'auto', scrollbarWidth: 'none',
                        }}>
                            {[
                                { v: 'minhas', l: 'Minhas', c: contadores.minhas },
                                { v: 'nao_atribuidas', l: 'Fila', c: contadores.nao_atribuidas },
                                ...(isGerente ? [{ v: 'todas', l: 'Todas', c: contadores.todas }] : []),
                                { v: 'arquivadas', l: 'Arquivadas', c: contadores.arquivadas },
                            ].map(t => {
                                const active = filtroAba === t.v;
                                return (
                                    <button key={t.v} onClick={() => setFiltroAba(t.v)} style={{
                                        flexShrink: 0, padding: '4px 14px', borderRadius: 20,
                                        border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                        background: active ? 'var(--success)' : 'var(--bg-muted)',
                                        color: active ? '#ffffff' : 'var(--text-secondary)',
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        transition: 'background 0.15s',
                                    }}>
                                        {t.l}
                                        {t.c > 0 && <span style={{
                                            fontSize: 11, background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.1)',
                                            borderRadius: 10, padding: '0 5px', lineHeight: '18px',
                                        }}>{t.c}</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Row 4: Category filter (only when categories exist) */}
                        <div style={{ padding: '0 12px 10px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setFiltroCategoria('')}
                                style={{
                                    fontSize: 10, padding: '2px 8px', borderRadius: 99,
                                    border: `1px solid ${!filtroCategoria ? 'var(--success)' : 'var(--border)'}`,
                                    background: !filtroCategoria ? 'var(--success-bg)' : 'transparent',
                                    color: !filtroCategoria ? 'var(--success)' : 'var(--text-muted)',
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
                                        fontSize: 10, padding: '2px 8px', borderRadius: 99,
                                        border: `1px solid ${filtroCategoria === c.v ? c.c : 'var(--border)'}`,
                                        background: filtroCategoria === c.v ? c.c + '18' : 'transparent',
                                        color: filtroCategoria === c.v ? c.c : 'var(--text-muted)',
                                        cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    {c.l}
                                </button>
                            ))}
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
                            return (
                                <div
                                    key={c.id}
                                    onClick={() => selectConv(c)}
                                    style={{
                                        padding: '12px 16px', cursor: 'pointer',
                                        borderBottom: '1px solid var(--border)',
                                        background: isActive ? 'var(--wa-row-active)' : 'transparent',
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {/* Avatar — foto de perfil real do WhatsApp */}
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <Avatar src={c.wa_avatar} name={displayName} size={49} />
                                            {/* Status dot */}
                                            <span style={{
                                                position: 'absolute', bottom: 0, right: 0,
                                                width: 13, height: 13, borderRadius: '50%',
                                                background: sc.color,
                                                border: '2px solid var(--bg-muted)',
                                            }} />
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* Row 1: name + time */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    maxWidth: '70%',
                                                }}>
                                                    {displayName}
                                                </span>
                                                <span style={{ fontSize: 11.5, color: c.nao_lidas > 0 ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }}>
                                                    {timeAgo(c.ultimo_msg_em || c.ultima_msg_em)}
                                                </span>
                                            </div>

                                            {/* Row 2: preview + badge */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{
                                                    fontSize: 13, color: 'var(--text-muted)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                                                }}>
                                                    {c.ultima_msg_remetente === 'ia' && <Bot size={11} style={{ flexShrink: 0, color: 'var(--success)' }} />}
                                                    {c.ultima_msg_remetente === 'usuario' && <Check size={11} style={{ flexShrink: 0, color: '#8696a0' }} />}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {(c.ultima_msg || '').slice(0, 50)}
                                                    </span>
                                                </span>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                                                    {c.nao_lidas > 0 && (
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 700, color: '#fff',
                                                            background: 'var(--success)', borderRadius: 99,
                                                            minWidth: 18, height: 18,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                                                        }}>
                                                            {c.nao_lidas}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Row 3: attribution + category tags (only if set) */}
                                            {(c.atribuido_nome || c.categoria || c.prioridade === 'urgente' || c.prioridade === 'alta') && (
                                                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                                    {c.atribuido_nome ? (
                                                        <span style={{
                                                            fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                            background: c.atribuido_user_id === user?.id ? 'var(--success-bg)' : 'var(--bg-muted)',
                                                            color: c.atribuido_user_id === user?.id ? 'var(--success)' : 'var(--text-muted)',
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                        }}>
                                                            <UserCheck size={8} />
                                                            {c.atribuido_user_id === user?.id ? 'Você' : c.atribuido_nome.split(' ')[0]}
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                            background: 'rgba(245,158,11,0.14)', color: '#f59e0b',
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                        }}>
                                                            <Inbox size={8} /> Na fila
                                                        </span>
                                                    )}
                                                    {c.categoria && CAT_MAP[c.categoria] && (
                                                        <span style={{
                                                            fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                            background: CAT_MAP[c.categoria].c + '18',
                                                            color: CAT_MAP[c.categoria].c,
                                                        }}>
                                                            {CAT_MAP[c.categoria].l}
                                                        </span>
                                                    )}
                                                    {c.prioridade === 'urgente' && (
                                                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: 'rgba(239,68,68,0.16)', color: '#ef4444' }}>
                                                            Urgente
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
                    flex: 1, minWidth: 0, position: 'relative', display: (isNarrow && !mobileShowChat) ? 'none' : 'flex', flexDirection: 'column',
                    background: 'var(--bg-body)',
                    borderLeft: '1px solid var(--border)',
                    overflow: 'hidden', // sem minWidth:0 + overflow, o input estoura a largura no mobile (botão Enviar saía da tela)
                }}>
                    {/* Marca d'água Ornato — logo centralizado, faded, fixo atrás das mensagens */}
                    {marca.wm && (
                        <div aria-hidden="true" style={{
                            position: 'absolute', inset: 0, zIndex: -1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none', opacity: marca.wmOp,
                        }}>
                            <img src={marca.wm} alt="" style={{ width: 'min(55%, 420px)', height: 'auto', objectFit: 'contain' }} />
                        </div>
                    )}
                    {!activeConv ? (
                        // Nenhuma conversa selecionada — estilo WA Web splash
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            gap: 14, color: 'var(--text-muted)', padding: 40,
                            background: 'var(--wa-splash)',
                        }}>
                            <div style={{
                                width: 128, height: 128, borderRadius: '50%',
                                background: 'var(--bg-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: 8,
                            }}>
                                <MessageCircle size={60} style={{ color: 'var(--text-muted)' }} />
                            </div>
                            <h3 style={{ fontSize: 22, fontWeight: 300, color: 'var(--text-secondary)', margin: 0, letterSpacing: -0.3 }}>
                                Ornato — Atendimento WhatsApp
                            </h3>
                            <p style={{ fontSize: 14, maxWidth: 360, textAlign: 'center', lineHeight: 1.6, margin: 0, color: 'var(--text-muted)' }}>
                                Selecione uma conversa para começar a atender
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16 }}>
                                <Lock size={11} /> Mensagens criptografadas de ponta a ponta
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Header do chat — compacto */}
                            <div style={{
                                padding: '8px 16px', borderBottom: '1px solid var(--border)',
                                background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 12,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', minHeight: 60,
                            }}>
                                {isNarrow && <button
                                    onClick={() => { setMobileShowChat(false); setActiveConv(null); }}
                                    aria-label="Voltar para lista de conversas"
                                    title="Voltar"
                                    className="chat-back-btn"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: 34, height: 34, borderRadius: 10,
                                        background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                        color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
                                    }}
                                >
                                    <ArrowLeft size={16} strokeWidth={2.4} />
                                </button>}

                                {(() => {
                                    const hdrName = activeConvData?.cliente_nome || activeConvData?.wa_name || activeConvData?.wa_phone || '';
                                    return (
                                        <Avatar
                                            src={activeConvData?.wa_avatar} name={hdrName} size={42}
                                            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                                        />
                                    );
                                })()}

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                            {activeConvData?.cliente_nome || activeConvData?.wa_name || activeConvData?.wa_phone}
                                        </span>
                                        {activeConvData?.lead_qualificacao && activeConvData.lead_qualificacao !== 'novo' && (
                                            <span style={{
                                                fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700,
                                                background: colorBg(LEAD_COLORS[activeConvData.lead_qualificacao] || 'var(--muted)'),
                                                color: LEAD_COLORS[activeConvData.lead_qualificacao] || 'var(--muted)',
                                                flexShrink: 0,
                                            }}>
                                                {LEAD_LABELS[activeConvData.lead_qualificacao] || activeConvData.lead_qualificacao}
                                                {activeConvData.lead_score > 0 && ` · ${activeConvData.lead_score}%`}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', gap: 10, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                            <Phone size={10} /> {activeConvData?.wa_phone}
                                        </span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{
                                                width: 6, height: 6, borderRadius: '50%',
                                                background: (STATUS_COLORS[activeConvData?.status] || STATUS_COLORS.humano).color,
                                            }} />
                                            {STATUS_LABELS[activeConvData?.status] || 'Humano'}
                                        </span>
                                        {activeConvData?.ia_bloqueada && (
                                            <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                                <BellOff size={10} /> IA pausada
                                            </span>
                                        )}
                                        {activeConvData?.aguardando_cliente && (
                                            <span style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                                <Hourglass size={10} /> Aguardando
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Escalação badge — mantém visível pra alertar */}
                                {activeConvData?.status === 'humano' && Number(activeConvData?.escalacao_nivel) > 0 && !activeConvData?.aguardando_cliente && (
                                    <span
                                        title={`Sofia já agiu neste handoff (nível ${activeConvData.escalacao_nivel})`}
                                        style={{
                                            fontSize: 11, padding: '4px 8px', borderRadius: 6,
                                            background: activeConvData.escalacao_nivel >= 3 ? 'var(--danger-bg)' : activeConvData.escalacao_nivel >= 2 ? 'var(--warning-bg)' : 'var(--info-bg)',
                                            color: activeConvData.escalacao_nivel >= 3 ? 'var(--danger)' : activeConvData.escalacao_nivel >= 2 ? 'var(--warning)' : 'var(--info)',
                                            fontWeight: 600,
                                            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                                        }}
                                    >
                                        {activeConvData.abandonada ? <><Moon size={11} /> Abandonada</> : <><Zap size={11} /> N{activeConvData.escalacao_nivel}</>}
                                    </span>
                                )}

                                {/* ═══ Interruptor da Sofia (IA) NESTA conversa — sempre visível ═══ */}
                                {(() => {
                                    const iaOn = activeConvData?.status === 'ia';
                                    const pausada = !!activeConvData?.ia_bloqueada;
                                    return (
                                        <button
                                            onClick={() => setIAConversa(!iaOn)}
                                            title={iaOn
                                                ? 'Sofia está respondendo automaticamente nesta conversa.\nClique para DESLIGAR (atendimento humano assume).'
                                                : 'Sofia NÃO responde nesta conversa.\nClique para LIGAR a IA (ela qualifica o lead).'}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                                                padding: '5px 11px 5px 9px', borderRadius: 99, cursor: 'pointer',
                                                border: `1px solid ${iaOn ? 'var(--success-border)' : 'var(--border)'}`,
                                                background: iaOn ? 'var(--success-bg)' : 'var(--bg-muted)',
                                                color: iaOn ? 'var(--success)' : 'var(--text-muted)',
                                                fontSize: 12.5, fontWeight: 700, transition: 'all .15s',
                                            }}
                                        >
                                            <Bot size={15} />
                                            <span>Sofia {iaOn ? (pausada ? 'pausada' : 'ligada') : 'desligada'}</span>
                                            <span style={{
                                                width: 32, height: 17, borderRadius: 99, position: 'relative', flexShrink: 0,
                                                background: iaOn ? 'var(--success)' : 'var(--border)', transition: 'background .15s',
                                            }}>
                                                <span style={{
                                                    position: 'absolute', top: 2, left: iaOn ? 17 : 2, width: 13, height: 13,
                                                    borderRadius: '50%', background: '#fff', transition: 'left .15s',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                                }} />
                                            </span>
                                        </button>
                                    );
                                })()}

                                {/* Diagnóstico IA — compacto */}
                                {diag && (() => {
                                    const s = diag.status_geral;
                                    const cor = s === 'online' ? 'var(--success)' : s === 'parcial' ? 'var(--warning)' : 'var(--danger)';
                                    return (
                                        <button
                                            onClick={() => setDiagOpen(true)}
                                            title={`Diagnóstico IA (${s})`}
                                            style={{
                                                width: 34, height: 34, borderRadius: 10,
                                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                                color: cor, cursor: 'pointer', flexShrink: 0,
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                position: 'relative',
                                            }}
                                        >
                                            <Activity size={15} />
                                            <span style={{
                                                position: 'absolute', top: 6, right: 6, width: 7, height: 7,
                                                borderRadius: 99, background: cor,
                                                boxShadow: '0 0 0 2px var(--bg-muted)',
                                            }} />
                                        </button>
                                    );
                                })()}

                                {/* Toggle do painel do cliente (direita) */}
                                <button
                                    onClick={() => setShowPanel(s => !s)}
                                    title={showPanel ? 'Ocultar painel do cliente' : 'Mostrar painel do cliente'}
                                    style={{
                                        width: 34, height: 34, borderRadius: 10,
                                        background: showPanel ? colorBg('#1379F0') : 'var(--bg-muted)',
                                        border: `1px solid ${showPanel ? 'var(--primary)' : 'var(--border)'}`,
                                        color: showPanel ? 'var(--primary)' : 'var(--text-secondary)',
                                        cursor: 'pointer', flexShrink: 0,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <UsersIcon size={15} />
                                </button>
                            </div>

                            {/* Mensagens */}
                            <div
                                className="wa-chat-area"
                                style={{
                                    flex: 1, overflowY: 'auto', padding: '14px 5% 10px',
                                    display: 'flex', flexDirection: 'column', gap: 2,
                                    // Fundo na cor anterior (segue o tema) — a marca d'água Ornato
                                    // fica numa camada atrás (z-index -1), por isso aqui é transparente.
                                    background: 'transparent',
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

                                    // Estilo de bolha — paleta WhatsApp (claro/escuro via CSS vars)
                                    let bubbleBg, bubbleColor, align, indicator, metaColor;
                                    if (isEntrada) {
                                        bubbleBg = 'var(--wa-bubble-in)';
                                        bubbleColor = 'var(--wa-bubble-text)';
                                        align = 'flex-start';
                                        indicator = null;
                                        metaColor = 'var(--wa-meta)';
                                    } else if (isInterno) {
                                        bubbleBg = 'var(--wa-bubble-interno)';
                                        bubbleColor = 'var(--wa-bubble-interno-text)';
                                        align = 'flex-end';
                                        indicator = <Lock size={10} style={{ opacity: 0.7 }} />;
                                        metaColor = 'var(--wa-bubble-interno-text)';
                                    } else if (isIA) {
                                        bubbleBg = 'var(--wa-bubble-ia)';
                                        bubbleColor = 'var(--wa-bubble-text)';
                                        align = 'flex-end';
                                        indicator = <Bot size={10} style={{ color: 'var(--success)' }} />;
                                        metaColor = 'var(--wa-meta)';
                                    } else {
                                        // Mensagem enviada pelo atendente humano
                                        bubbleBg = 'var(--wa-bubble-out)';
                                        bubbleColor = 'var(--wa-bubble-text)';
                                        align = 'flex-end';
                                        indicator = null;
                                        metaColor = 'var(--wa-meta)';
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
                                                        <div style={{ marginBottom: hasText ? 6 : 2 }}>
                                                            <WaAudioPlayer src={m.media_url} />
                                                        </div>
                                                    )}
                                                    {m.media_url && m.tipo === 'documento' && (() => {
                                                        const nomeArq = m.media_nome || (m.conteudo && !m.conteudo.startsWith('[') ? m.conteudo : '') || 'Documento';
                                                        const extArq = (nomeArq.match(/\.([a-z0-9]{2,5})$/i) || [])[1]?.toUpperCase() || '';
                                                        return (
                                                            <a href={m.media_url} target="_blank" rel="noopener noreferrer" download={m.media_nome || undefined}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.06)', borderRadius: 8, marginBottom: hasText ? 6 : 0, color: 'inherit', textDecoration: 'none', maxWidth: 320 }}>
                                                                <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                    <FileText size={19} />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeArq}</div>
                                                                    {extArq && <div style={{ fontSize: 10.5, color: 'var(--wa-meta)', marginTop: 1 }}>{extArq}</div>}
                                                                </div>
                                                                <Download size={17} style={{ flexShrink: 0, color: 'var(--wa-meta)' }} />
                                                            </a>
                                                        );
                                                    })()}
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
                                                            fontSize: 10, color: m.status_envio === 'falhou' ? 'var(--danger)' : metaColor,
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                            pointerEvents: m.status_envio === 'falhou' ? 'auto' : 'none',
                                                            cursor: m.status_envio === 'falhou' ? 'pointer' : 'default',
                                                        }}
                                                        onClick={m.status_envio === 'falhou' ? () => reenviar(m) : undefined}
                                                        title={m.status_envio === 'falhou' ? 'Falhou ao enviar — clique para reenviar' : (m.status_envio === 'enviando' ? 'Enviando...' : undefined)}
                                                        >
                                                            {formatTime(m.criado_em)}
                                                            {m.direcao === 'saida' && !isInterno && (
                                                                <>
                                                                    {m.status_envio === 'falhou'
                                                                        ? <AlertCircle size={12} />
                                                                        : m.status_envio === 'enviando'
                                                                            ? <Clock size={12} style={{ opacity: 0.7 }} />
                                                                            : m.status_envio === 'lido'
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
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
                                                background: colorBg('var(--info)'), color: 'var(--info)',
                                                border: `1px solid ${colorBorder('var(--info)')}`, fontWeight: 600,
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
                                    border: `1px solid ${interno ? '#fbbf24' : 'var(--border)'}`,
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
                                            flex: 1, minWidth: 0, resize: 'none', fontSize: 14.5, lineHeight: 1.4,
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

                {/* ═══ Painel Direito: Dados do Cliente / Lead ═══ */}
                {activeConv && showPanel && (
                    <div style={{
                        width: 'clamp(240px, 24vw, 360px)', minWidth: 0, borderLeft: '1px solid var(--border)',
                        background: 'var(--bg-card)', display: 'flex', flexDirection: 'column',
                        overflowY: 'auto', flexShrink: 0,
                    }}
                        className="lead-panel"
                    >
                        {/* Header compacto */}
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 }}>
                                Dados do contato
                            </div>
                            <button
                                onClick={() => setShowPanel(false)}
                                title="Fechar painel"
                                style={{
                                    width: 26, height: 26, borderRadius: 6, border: 'none',
                                    background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Cliente */}
                        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                            {(() => {
                                const nome = activeConvData?.cliente_nome || activeConvData?.wa_name || activeConvData?.wa_phone || '';
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
                                        <Avatar
                                            src={activeConvData?.wa_avatar} name={nome} size={72}
                                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                                        />
                                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                            {nome}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Phone size={11} /> {activeConvData?.wa_phone}
                                        </div>
                                        {clientePanel?.email && (
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{clientePanel.email}</div>
                                        )}
                                        {!activeConvData?.cliente_id && (
                                            <button
                                                onClick={() => setShowVincular(true)}
                                                style={{
                                                    marginTop: 4, fontSize: 11, padding: '6px 12px', borderRadius: 6,
                                                    background: colorBg('var(--warning)'), color: 'var(--warning)',
                                                    border: `1px solid ${colorBorder('var(--warning)')}`,
                                                    cursor: 'pointer', fontWeight: 600,
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                }}
                                            >
                                                <Link2 size={12} /> Vincular a cliente
                                            </button>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Lead */}
                        {(activeConvData?.lead_qualificacao || activeConvData?.lead_score > 0) && (
                            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                                    Lead
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        fontSize: 12, padding: '4px 10px', borderRadius: 99, fontWeight: 700,
                                        background: colorBg(LEAD_COLORS[activeConvData.lead_qualificacao] || 'var(--muted)'),
                                        color: LEAD_COLORS[activeConvData.lead_qualificacao] || 'var(--muted)',
                                    }}>
                                        {LEAD_LABELS[activeConvData.lead_qualificacao] || activeConvData.lead_qualificacao}
                                    </span>
                                    {activeConvData.lead_score > 0 && (
                                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>
                                            {activeConvData.lead_score}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Status da conversa */}
                        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                                Status da conversa
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {['ia', 'humano', 'fechado'].map(st => {
                                    const ativo = activeConvData?.status === st;
                                    const sc = STATUS_COLORS[st];
                                    return (
                                        <button
                                            key={st}
                                            onClick={() => ativo ? null : toggleStatus(activeConv, activeConvData?.status === st ? null : (st === 'ia' ? 'fechado' : st === 'humano' ? 'ia' : 'humano'))}
                                            disabled={ativo}
                                            style={{
                                                flex: 1, fontSize: 11, padding: '8px 4px', borderRadius: 6, cursor: ativo ? 'default' : 'pointer',
                                                border: `1px solid ${ativo ? sc.color : 'var(--border)'}`,
                                                background: ativo ? sc.bg : 'transparent',
                                                color: ativo ? sc.color : 'var(--text-muted)',
                                                fontWeight: 700,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            }}
                                        >
                                            {STATUS_ICONS[st]} {STATUS_LABELS[st]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Atribuição */}
                        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                                Atendente
                            </div>
                            {activeConvData?.atribuido_user_id ? (
                                <div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        background: activeConvData.atribuido_user_id === user?.id ? colorBg('var(--success)') : 'var(--bg-muted)',
                                        borderRadius: 8, marginBottom: 6,
                                    }}>
                                        <UserCheck size={14} style={{ color: activeConvData.atribuido_user_id === user?.id ? 'var(--success)' : 'var(--text-muted)' }} />
                                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                                            {activeConvData.atribuido_user_id === user?.id ? 'Você' : activeConvData.atribuido_nome}
                                        </span>
                                    </div>
                                    {(isGerente || activeConvData.atribuido_user_id === user?.id) && (
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button
                                                onClick={() => atribuir(null, 'liberada pra fila')}
                                                style={{
                                                    flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 6,
                                                    border: `1px solid ${colorBorder('var(--warning)')}`,
                                                    background: colorBg('var(--warning)'), color: 'var(--warning)',
                                                    cursor: 'pointer', fontWeight: 600,
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                }}
                                            >
                                                <Inbox size={11} /> Liberar
                                            </button>
                                            {isGerente && (
                                                <button
                                                    onClick={() => setShowAssignMenu(s => !s)}
                                                    style={{
                                                        flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 6,
                                                        border: '1px solid var(--border)', background: 'transparent',
                                                        color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600,
                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                                    }}
                                                >
                                                    <UserPlus size={11} /> Transferir
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={puxarPraMim}
                                    style={{
                                        width: '100%', fontSize: 12, padding: '10px', borderRadius: 8,
                                        border: `1px solid ${colorBorder('var(--warning)')}`,
                                        background: colorBg('var(--warning)'), color: 'var(--warning)',
                                        cursor: 'pointer', fontWeight: 700,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}
                                >
                                    <UserPlus size={13} /> Puxar pra mim
                                </button>
                            )}
                            {showAssignMenu && isGerente && (
                                <div style={{
                                    marginTop: 8, background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
                                }}>
                                    {usuarios.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => atribuir(u.id)}
                                            style={{
                                                width: '100%', padding: '8px 12px', fontSize: 12.5,
                                                background: activeConvData?.atribuido_user_id === u.id ? colorBg('var(--success)') : 'transparent',
                                                border: 'none', borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer',
                                                color: activeConvData?.atribuido_user_id === u.id ? 'var(--success)' : 'var(--text-primary)',
                                                fontWeight: activeConvData?.atribuido_user_id === u.id ? 700 : 500,
                                                display: 'flex', alignItems: 'center', gap: 6,
                                            }}
                                        >
                                            {activeConvData?.atribuido_user_id === u.id ? <Check size={12} /> : <User size={12} />}
                                            {u.nome}
                                            <span style={{ fontSize: 9, marginLeft: 'auto', opacity: 0.6, textTransform: 'uppercase' }}>{u.role}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Categoria */}
                        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                                Categoria
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {CATEGORIAS.map(c => {
                                    const ativo = (activeConvData?.categoria || '') === c.v;
                                    return (
                                        <button
                                            key={c.v || 'none'}
                                            onClick={() => setCategoria(c.v)}
                                            style={{
                                                fontSize: 11, padding: '4px 10px', borderRadius: 99,
                                                border: `1px solid ${ativo ? c.c : 'var(--border)'}`,
                                                background: ativo ? colorBg(c.c) : 'transparent',
                                                color: ativo ? c.c : 'var(--text-muted)',
                                                cursor: 'pointer', fontWeight: 600,
                                            }}
                                        >
                                            {c.l}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Prioridade */}
                        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                                Prioridade
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {PRIORIDADES.map(p => {
                                    const ativo = activeConvData?.prioridade === p.v;
                                    return (
                                        <button
                                            key={p.v}
                                            onClick={() => setPrioridade(p.v)}
                                            style={{
                                                flex: 1, fontSize: 11, padding: '6px 4px', borderRadius: 6,
                                                border: `1px solid ${ativo ? p.c : 'var(--border)'}`,
                                                background: ativo ? colorBg(p.c) : 'transparent',
                                                color: ativo ? p.c : 'var(--text-muted)',
                                                cursor: 'pointer', fontWeight: 700,
                                            }}
                                        >
                                            {p.l}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* IA / Escalação */}
                        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                                IA (Sofia)
                            </div>
                            <button
                                onClick={toggleIABloqueio}
                                title={activeConvData?.ia_bloqueada
                                    ? `Pausada até ${activeConvData.ia_bloqueio_ate ? new Date(activeConvData.ia_bloqueio_ate).toLocaleString('pt-BR') : '?'}`
                                    : 'Pausar IA nesta conversa por 24h'}
                                style={{
                                    width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                                    border: `1px solid ${activeConvData?.ia_bloqueada ? 'var(--danger)' : 'var(--border)'}`,
                                    background: activeConvData?.ia_bloqueada ? 'var(--danger-bg)' : 'transparent',
                                    color: activeConvData?.ia_bloqueada ? 'var(--danger)' : 'var(--text-secondary)',
                                    cursor: 'pointer', fontWeight: 600,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}
                            >
                                {activeConvData?.ia_bloqueada ? <><BellOff size={12} /> IA pausada — retomar</> : <><Pause size={12} /> Pausar IA nesta conversa</>}
                            </button>
                            {activeConvData?.status === 'humano' && (
                                <button
                                    onClick={toggleAguardandoCliente}
                                    title={activeConvData?.aguardando_cliente ? 'Escalação pausada' : 'Pausar escalação até cliente responder'}
                                    style={{
                                        width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8,
                                        border: `1px solid ${activeConvData?.aguardando_cliente ? 'var(--warning)' : 'var(--border)'}`,
                                        background: activeConvData?.aguardando_cliente ? 'var(--warning-bg)' : 'transparent',
                                        color: activeConvData?.aguardando_cliente ? 'var(--warning)' : 'var(--text-secondary)',
                                        cursor: 'pointer', fontWeight: 600,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}
                                >
                                    <Hourglass size={12} />
                                    {activeConvData?.aguardando_cliente ? 'Aguardando cliente (ativo)' : 'Aguardar cliente'}
                                </button>
                            )}
                        </div>

                        {/* Orçamentos do cliente */}
                        {clientePanel?.orcamentos?.length > 0 && (
                            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Orçamentos</span>
                                    <span style={{ color: 'var(--text-primary)' }}>{clientePanel.orcamentos.length}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {clientePanel.orcamentos.slice(0, 5).map(o => (
                                        <div
                                            key={o.id}
                                            style={{
                                                padding: '8px 10px', borderRadius: 8,
                                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                                fontSize: 12,
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    #{o.numero || o.id}
                                                </span>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                                    {o.kb_col || o.tipo || '—'}
                                                </span>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 3 }}>
                                                {o.ambiente || '—'}
                                            </div>
                                            <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 12.5 }}>
                                                R$ {Number(o.valor_venda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Métricas do cliente */}
                        {clientePanel?.metricas && clientePanel.metricas.total_orcamentos > 0 && (
                            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                                    Métricas
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                    <div style={{ padding: 8, borderRadius: 6, background: 'var(--bg-muted)' }}>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Faturado</div>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>
                                            R$ {Number(clientePanel.metricas.total_faturado || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                        </div>
                                    </div>
                                    <div style={{ padding: 8, borderRadius: 6, background: 'var(--bg-muted)' }}>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Conversão</div>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', marginTop: 2 }}>
                                            {clientePanel.metricas.taxa_conversao}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Ações */}
                        <div style={{ padding: 16, marginTop: 'auto' }}>
                            <button
                                onClick={toggleArquivar}
                                style={{
                                    width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8,
                                    border: '1px solid var(--border)', background: 'transparent',
                                    color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                }}
                            >
                                <Archive size={12} />
                                {activeConvData?.arquivada ? 'Desarquivar' : 'Arquivar conversa'}
                            </button>
                            {isGerente && (
                                <button
                                    onClick={rodarBackfillConversa}
                                    disabled={backfilling}
                                    style={{
                                        marginTop: 6, width: '100%', fontSize: 11, padding: '6px 10px', borderRadius: 8,
                                        border: '1px solid var(--border)', background: 'transparent',
                                        color: 'var(--text-muted)', cursor: backfilling ? 'wait' : 'pointer', fontWeight: 600,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        opacity: backfilling ? 0.6 : 1,
                                    }}
                                >
                                    {backfilling ? <RefreshCw size={11} className="spin" /> : <History size={11} />}
                                    Puxar histórico desta conversa
                                </button>
                            )}
                        </div>
                    </div>
                )}
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

            {confirmBackfill && (
                <ConfirmModal
                    title="Puxar histórico de conversas"
                    message="Vai importar o histórico de conversas antigas da Evolution. Pode demorar alguns minutos."
                    confirmLabel="Puxar histórico"
                    onConfirm={rodarBackfillConfirmado}
                    onCancel={() => setConfirmBackfill(false)}
                />
            )}
            {confirmFullSync && (
                <ConfirmModal
                    title="Sincronização completa (re-parear)"
                    message="Vai ativar o syncFullHistory e DESCONECTAR a instância. Depois você precisa abrir o QR Code e escanear com o celular. A Evolution puxará até ~6 meses de histórico."
                    confirmLabel="Continuar"
                    danger
                    onConfirm={rodarFullHistorySyncConfirmado}
                    onCancel={() => setConfirmFullSync(false)}
                />
            )}
            {confirmIA && (
                <ConfirmModal
                    title={confirmIA.alvo ? 'Ativar IA (Sofia)' : 'Desativar IA (Sofia)'}
                    message={confirmIA.msg}
                    confirmLabel={confirmIA.alvo ? 'Ativar' : 'Desativar'}
                    danger={!confirmIA.alvo}
                    onConfirm={toggleIAConfirmado}
                    onCancel={() => setConfirmIA(null)}
                />
            )}
        </div>
    );
}
