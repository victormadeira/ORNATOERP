// ═══════════════════════════════════════════════════════
// ModoOperador.jsx — Modo Operador TV/Tablet (Chão de Fábrica)
// Interface simplificada para operadores CNC
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { Z } from '../ui';
import { Play, Pause, CheckCircle2, AlertTriangle, Clock, Package, Cpu, ChevronRight, RefreshCw, Monitor, ArrowLeft, Maximize2, Wrench, Zap, HelpCircle, ChevronDown, ChevronUp, History } from 'lucide-react';

const REFRESH_INTERVAL = 15000; // 15s auto-refresh

const PAUSE_REASONS = [
    'Troca de ferramenta',
    'Aguardando material',
    'Problema na máquina',
    'Intervalo',
    'Outro',
];

function formatEta(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return '0min';
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    if (h > 0) return `${h}h ${m > 0 ? m + 'min' : ''}`.trim();
    return `${m}min`;
}

export default function ModoOperador({ notify, onBack }) {
    const [fila, setFila] = useState([]);
    const [itemAtual, setItemAtual] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const [clock, setClock] = useState(new Date());
    const [stats, setStats] = useState({ total: 0, concluidos: 0, emAndamento: 0, pendentes: 0 });
    const timerRef = useRef(null);
    const cronometroRef = useRef(null);
    const [cronometro, setCronometro] = useState(0);
    const [cronometroAtivo, setCronometroAtivo] = useState(false);

    // Pause reason tracking
    const [pausas, setPausas] = useState([]); // [{ motivo, inicio, fim }]
    const [showPauseModal, setShowPauseModal] = useState(false);
    const [pausaMotivoAtual, setPausaMotivoAtual] = useState(null); // current pause reason while paused

    // Completed history
    const [concluidos, setConcluidos] = useState([]); // [{ ...item, tempoGasto, concluidoEm }]
    const [showConcluidos, setShowConcluidos] = useState(true);

    // Keyboard shortcuts help
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Confirm dialog for Enter key
    const [showConfirmConcluir, setShowConfirmConcluir] = useState(false);

    // Clock
    useEffect(() => {
        const t = setInterval(() => setClock(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Cronometro
    useEffect(() => {
        if (cronometroAtivo) {
            cronometroRef.current = setInterval(() => setCronometro(c => c + 1), 1000);
        } else {
            if (cronometroRef.current) clearInterval(cronometroRef.current);
        }
        return () => { if (cronometroRef.current) clearInterval(cronometroRef.current); };
    }, [cronometroAtivo]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            // Don't trigger when typing in inputs
            const tag = e.target.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            if (e.code === 'Space' && itemAtual) {
                e.preventDefault();
                if (cronometroAtivo) {
                    // Pause - show modal
                    setShowPauseModal(true);
                } else if (pausaMotivoAtual) {
                    // Resume from pause
                    handleResume();
                } else {
                    setCronometroAtivo(true);
                }
            }

            if (e.code === 'Enter' && itemAtual && cronometroAtivo) {
                e.preventDefault();
                setShowConfirmConcluir(true);
            }

            if ((e.code === 'KeyN') && !itemAtual) {
                e.preventDefault();
                const pendentes = fila.filter(f => f.status === 'pendente' || f.status === 'na_fila');
                if (pendentes.length > 0) {
                    iniciarItem(pendentes[0]);
                }
            }

            if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
                // Don't toggle if pause modal is showing
                if (!showPauseModal && !showConfirmConcluir) {
                    e.preventDefault();
                    setShowShortcuts(s => !s);
                }
            }

            if (e.code === 'Escape') {
                setShowShortcuts(false);
                setShowPauseModal(false);
                setShowConfirmConcluir(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [itemAtual, cronometroAtivo, fila, showPauseModal, showConfirmConcluir, pausaMotivoAtual]);

    const loadFila = useCallback(async () => {
        try {
            const data = await api.get('/cnc/fila-producao');
            setFila(data || []);
            const total = data.length;
            const conc = data.filter(d => d.status === 'concluido').length;
            const emAndamento = data.filter(d => d.status === 'produzindo').length;
            const pendentes = data.filter(d => d.status === 'pendente' || d.status === 'na_fila').length;
            setStats({ total, concluidos: conc, emAndamento, pendentes });
            setLoading(false);
        } catch (err) {
            console.error('Erro ao carregar fila:', err);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadFila();
        timerRef.current = setInterval(loadFila, REFRESH_INTERVAL);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [loadFila]);

    const iniciarItem = async (item) => {
        try {
            await api.put(`/cnc/fila-producao/${item.id}`, { status: 'produzindo' });
            setItemAtual(item);
            setCronometro(0);
            setCronometroAtivo(true);
            setPausas([]);
            setPausaMotivoAtual(null);
            loadFila();
        } catch (err) { notify?.(err.error || 'Erro ao iniciar'); }
    };

    const concluirItem = async (item) => {
        try {
            await api.put(`/cnc/fila-producao/${item.id}`, { status: 'concluido' });
            if (itemAtual?.id === item.id) {
                // Add to completed history
                setConcluidos(prev => [{
                    ...item,
                    tempoGasto: cronometro,
                    concluidoEm: new Date(),
                    pausasRegistradas: [...pausas],
                }, ...prev].slice(0, 5));
                setItemAtual(null);
                setCronometroAtivo(false);
                setPausas([]);
                setPausaMotivoAtual(null);
            }
            loadFila();
            notify?.('Chapa concluida!', 'success');
        } catch (err) { notify?.(err.error || 'Erro ao concluir'); }
    };

    const handlePause = (motivo) => {
        setCronometroAtivo(false);
        setPausaMotivoAtual(motivo);
        setPausas(prev => [...prev, { motivo, inicio: new Date(), fim: null }]);
        setShowPauseModal(false);
    };

    const handleResume = () => {
        // Close the last open pause
        setPausas(prev => {
            const updated = [...prev];
            const lastOpen = updated.findLastIndex(p => !p.fim);
            if (lastOpen >= 0) updated[lastOpen] = { ...updated[lastOpen], fim: new Date() };
            return updated;
        });
        setPausaMotivoAtual(null);
        setCronometroAtivo(true);
    };

    const handlePauseButtonClick = () => {
        if (cronometroAtivo) {
            setShowPauseModal(true);
        } else {
            handleResume();
        }
    };

    const formatTime = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
            setFullscreen(true);
        } else {
            document.exitFullscreen?.();
            setFullscreen(false);
        }
    };

    const statusColor = (s) => {
        if (s === 'concluido') return '#22c55e';
        if (s === 'produzindo') return '#f59e0b';
        if (s === 'erro') return '#ef4444';
        return '#64748b';
    };

    const statusLabel = (s) => {
        if (s === 'concluido') return 'Concluido';
        if (s === 'produzindo') return 'Em Producao';
        if (s === 'erro') return 'Erro';
        if (s === 'na_fila') return 'Na Fila';
        return 'Pendente';
    };

    // Compute queue ETA
    const filaPendente = fila.filter(f => f.status !== 'concluido');
    const totalEtaMinutes = filaPendente.reduce((sum, item) => sum + (item.tempo_estimado || 0), 0);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a12', color: '#fff', fontSize: 20 }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: 12 }} /> Carregando fila de producao...
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh', background: '#0a0a12', color: '#e0e6ff',
            fontFamily: 'Inter, system-ui, sans-serif', padding: 0, overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px', background: '#12121e', borderBottom: '1px solid #1e1e3a',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {onBack && (
                        <button onClick={onBack} style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 8,
                            color: '#888', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <ArrowLeft size={16} /> Voltar
                        </button>
                    )}
                    <Cpu size={22} style={{ color: '#1379F0' }} />
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Modo Operador</span>
                    <span style={{ fontSize: 11, color: '#666', padding: '3px 10px', background: '#1a1a2e', borderRadius: 20 }}>
                        CNC - Chao de Fabrica
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Shortcuts help button */}
                    <button onClick={() => setShowShortcuts(s => !s)} title="Atalhos de teclado" style={{
                        background: showShortcuts ? 'rgba(19,121,240,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${showShortcuts ? 'rgba(19,121,240,0.4)' : '#333'}`,
                        borderRadius: 8, color: showShortcuts ? '#1379F0' : '#888',
                        padding: '8px 12px', cursor: 'pointer', position: 'relative',
                    }}>
                        <HelpCircle size={14} />
                    </button>
                    <button onClick={loadFila} style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 8,
                        color: '#888', padding: '8px 12px', cursor: 'pointer',
                    }}>
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={toggleFullscreen} style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 8,
                        color: '#888', padding: '8px 12px', cursor: 'pointer',
                    }}>
                        <Maximize2 size={14} />
                    </button>
                    <span style={{ fontSize: 28, fontWeight: 300, color: '#fff', fontFamily: 'monospace', letterSpacing: 2 }}>
                        {clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                </div>
            </div>

            {/* Shortcuts overlay */}
            {showShortcuts && (
                <div style={{
                    position: 'fixed', top: 64, right: 24, zIndex: 1000,
                    background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 12,
                    padding: '16px 20px', minWidth: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Atalhos de Teclado</div>
                    {[
                        { key: 'Espaco', desc: 'Play / Pausar cronometro' },
                        { key: 'Enter', desc: 'Concluir item atual' },
                        { key: 'N', desc: 'Iniciar proximo da fila' },
                        { key: '?', desc: 'Mostrar/ocultar atalhos' },
                        { key: 'Esc', desc: 'Fechar dialogo' },
                    ].map(s => (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <kbd style={{
                                background: '#0a0a12', border: '1px solid #333', borderRadius: 6,
                                padding: '3px 10px', fontSize: 12, fontFamily: 'monospace', color: '#1379F0',
                                minWidth: 50, textAlign: 'center', fontWeight: 700,
                            }}>{s.key}</kbd>
                            <span style={{ fontSize: 12, color: '#888' }}>{s.desc}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Pause reason modal */}
            {showPauseModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                }} onClick={() => setShowPauseModal(false)}>
                    <div style={{
                        background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 16,
                        padding: '28px 32px', minWidth: 340, boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Motivo da Pausa</div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>Selecione o motivo antes de pausar:</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {PAUSE_REASONS.map(motivo => (
                                <button key={motivo} onClick={() => handlePause(motivo)} style={{
                                    padding: '14px 20px', borderRadius: 10, border: '1px solid #2a2a4a',
                                    background: '#12121e', color: '#e0e6ff', fontSize: 14, fontWeight: 600,
                                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.target.style.background = 'rgba(245,158,11,0.1)'; e.target.style.borderColor = 'rgba(245,158,11,0.3)'; }}
                                onMouseLeave={e => { e.target.style.background = '#12121e'; e.target.style.borderColor = '#2a2a4a'; }}
                                >
                                    {motivo}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setShowPauseModal(false)} style={{
                            marginTop: 16, padding: '10px', width: '100%', borderRadius: 8,
                            border: '1px solid #333', background: 'transparent', color: '#666',
                            fontSize: 12, cursor: 'pointer',
                        }}>Cancelar</button>
                    </div>
                </div>
            )}

            {/* Confirm concluir modal (Enter key) */}
            {showConfirmConcluir && itemAtual && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 2000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                }} onClick={() => setShowConfirmConcluir(false)}>
                    <div style={{
                        background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 16,
                        padding: '28px 32px', minWidth: 340, textAlign: 'center',
                        boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
                    }} onClick={e => e.stopPropagation()}>
                        <CheckCircle2 size={36} style={{ color: '#22c55e', marginBottom: 12 }} />
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Concluir item?</div>
                        <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
                            {itemAtual.lote_nome || `Lote #${itemAtual.lote_id}`} -- Chapa {(itemAtual.chapa_idx || 0) + 1}
                        </div>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <button onClick={() => setShowConfirmConcluir(false)} style={{
                                padding: '12px 24px', borderRadius: 8, border: '1px solid #333',
                                background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer',
                            }}>Cancelar</button>
                            <button onClick={() => { setShowConfirmConcluir(false); concluirItem(itemAtual); }} style={{
                                padding: '12px 28px', borderRadius: 8, border: 'none',
                                background: '#22c55e', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                            }}>Concluir</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats bar */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
                background: '#12121e', borderBottom: '1px solid #1e1e3a',
            }}>
                {[
                    { label: 'Total', value: stats.total, color: '#3b82f6', icon: Package },
                    { label: 'Pendentes', value: stats.pendentes, color: '#64748b', icon: Clock },
                    { label: 'Em Producao', value: stats.emAndamento, color: '#f59e0b', icon: Zap },
                    { label: 'Concluidos', value: stats.concluidos, color: '#22c55e', icon: CheckCircle2 },
                ].map((s, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px',
                        borderRight: i < 3 ? '1px solid #1e1e3a' : 'none',
                    }}>
                        <s.icon size={20} style={{ color: s.color, opacity: 0.7 }} />
                        <div>
                            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                            <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Current item highlight */}
            {itemAtual && (
                <div style={{
                    margin: '16px 24px', padding: '20px 28px', borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)',
                    border: '2px solid rgba(245,158,11,0.3)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: 10, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
                                {pausaMotivoAtual ? 'PAUSADO' : 'EM PRODUCAO AGORA'}
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
                                {itemAtual.lote_nome || `Lote #${itemAtual.lote_id}`} -- Chapa {(itemAtual.chapa_idx || 0) + 1}
                            </div>
                            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                                {itemAtual.material || '-'} - {itemAtual.pecas_count || '?'} pecas
                            </div>
                            {/* Pause reason badge */}
                            {pausaMotivoAtual && !cronometroAtivo && (
                                <div style={{
                                    marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8,
                                    padding: '6px 14px', borderRadius: 20,
                                    background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                                }}>
                                    <Pause size={12} style={{ color: '#f59e0b' }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
                                        Pausado: {pausaMotivoAtual}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 40, fontWeight: 300, color: pausaMotivoAtual ? '#888' : '#f59e0b', fontFamily: 'monospace' }}>
                                {formatTime(cronometro)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button onClick={handlePauseButtonClick} style={{
                                    padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                    background: cronometroAtivo ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
                                    color: cronometroAtivo ? '#ef4444' : '#22c55e', fontWeight: 700, fontSize: 13,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    {cronometroAtivo ? <><Pause size={16} /> Pausar</> : <><Play size={16} /> Retomar</>}
                                </button>
                                <button onClick={() => concluirItem(itemAtual)} style={{
                                    padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                    background: '#22c55e', color: '#fff', fontWeight: 800, fontSize: 14,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <CheckCircle2 size={18} /> CONCLUIR
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Queue */}
            <div style={{ padding: '16px 24px', overflowY: 'auto', maxHeight: itemAtual ? 'calc(100vh - 420px)' : 'calc(100vh - 230px)' }}>
                {/* Queue header with ETA */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 12,
                }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Fila de Producao
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: '#666' }}>
                            {filaPendente.length} {filaPendente.length === 1 ? 'item' : 'itens'}
                        </span>
                        {totalEtaMinutes > 0 && (
                            <span style={{
                                fontSize: 11, fontWeight: 700, color: '#3b82f6',
                                padding: '3px 10px', background: 'rgba(59,130,246,0.1)',
                                borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <Clock size={11} />
                                ETA: ~{formatEta(totalEtaMinutes)}
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filaPendente.map((item, i) => (
                        <div key={item.id || i} style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
                            borderRadius: 10, background: '#12121e', border: `1px solid ${item.status === 'produzindo' ? 'rgba(245,158,11,0.3)' : '#1e1e3a'}`,
                            transition: 'all 0.2s',
                        }}>
                            {/* Priority number */}
                            <div style={{
                                width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: `${statusColor(item.status)}15`, color: statusColor(item.status),
                                fontSize: 18, fontWeight: 800,
                            }}>
                                {item.prioridade || i + 1}
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                                    {item.lote_nome || `Lote #${item.lote_id}`}
                                    <span style={{ color: '#555', fontWeight: 400 }}> -- Chapa {(item.chapa_idx || 0) + 1}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#666', marginTop: 2, display: 'flex', gap: 16 }}>
                                    <span>{item.material || '-'}</span>
                                    <span>{item.pecas_count || '?'} pecas</span>
                                    {item.tempo_estimado > 0 && (
                                        <span style={{ color: '#3b82f6' }}>~{formatEta(item.tempo_estimado)}</span>
                                    )}
                                </div>
                            </div>

                            {/* Status */}
                            <div style={{
                                padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                background: `${statusColor(item.status)}15`, color: statusColor(item.status),
                            }}>
                                {statusLabel(item.status)}
                            </div>

                            {/* Action */}
                            {(item.status === 'pendente' || item.status === 'na_fila') && (
                                <button onClick={() => iniciarItem(item)} style={{
                                    padding: '12px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                    background: '#1379F0', color: '#fff', fontWeight: 800, fontSize: 14,
                                    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                                }}>
                                    <Play size={16} /> INICIAR
                                </button>
                            )}
                            {item.status === 'produzindo' && itemAtual?.id !== item.id && (
                                <button onClick={() => concluirItem(item)} style={{
                                    padding: '12px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                    background: '#22c55e', color: '#fff', fontWeight: 800, fontSize: 14,
                                    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                                }}>
                                    <CheckCircle2 size={16} /> CONCLUIR
                                </button>
                            )}
                        </div>
                    ))}

                    {filaPendente.length === 0 && (
                        <div style={{
                            padding: 60, textAlign: 'center', color: '#444', fontSize: 16,
                            background: '#12121e', borderRadius: 12, border: '1px dashed #1e1e3a',
                        }}>
                            <CheckCircle2 size={40} style={{ color: '#22c55e', marginBottom: 12, opacity: 0.5 }} />
                            <div>Todas as chapas foram produzidas!</div>
                        </div>
                    )}
                </div>

                {/* Completed section from API data */}
                {fila.filter(f => f.status === 'concluido').length > 0 && (
                    <div style={{ marginTop: 24 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                            Concluidos ({fila.filter(f => f.status === 'concluido').length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {fila.filter(f => f.status === 'concluido').map((item, i) => (
                                <div key={item.id || i} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                                    borderRadius: 8, background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.1)',
                                    opacity: 0.6,
                                }}>
                                    <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                                    <span style={{ fontSize: 13, color: '#888' }}>
                                        {item.lote_nome || `Lote #${item.lote_id}`} -- Chapa {(item.chapa_idx || 0) + 1}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Completed history (local session tracking with time info) */}
                {concluidos.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                        <button onClick={() => setShowConcluidos(s => !s)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, background: 'none',
                            border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10,
                        }}>
                            {showConcluidos ? <ChevronUp size={14} style={{ color: '#555' }} /> : <ChevronDown size={14} style={{ color: '#555' }} />}
                            <History size={14} style={{ color: '#555' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
                                Historico da Sessao ({concluidos.length})
                            </span>
                        </button>
                        {showConcluidos && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {concluidos.map((item, i) => (
                                    <div key={`hist-${i}`} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                                        borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid #1e1e3a',
                                        opacity: 0.5,
                                    }}>
                                        <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: 13, color: '#777', textDecoration: 'line-through' }}>
                                                {item.lote_nome || `Lote #${item.lote_id}`} -- Chapa {(item.chapa_idx || 0) + 1}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>
                                            {formatTime(item.tempoGasto)}
                                        </span>
                                        <span style={{ fontSize: 10, color: '#444' }}>
                                            {item.concluidoEm?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
