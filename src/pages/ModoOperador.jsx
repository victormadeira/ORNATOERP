// ═══════════════════════════════════════════════════════
// ModoOperador.jsx — Modo Operador TV/Tablet (Chão de Fábrica)
// Interface simplificada para operadores CNC
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import { Z } from '../ui';
import { Play, Pause, CheckCircle2, AlertTriangle, Clock, Package, Cpu, ChevronRight, RefreshCw, Monitor, ArrowLeft, Maximize2, Wrench, Zap } from 'lucide-react';

const REFRESH_INTERVAL = 15000; // 15s auto-refresh

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

    // Clock
    useEffect(() => {
        const t = setInterval(() => setClock(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // Cronômetro
    useEffect(() => {
        if (cronometroAtivo) {
            cronometroRef.current = setInterval(() => setCronometro(c => c + 1), 1000);
        } else {
            if (cronometroRef.current) clearInterval(cronometroRef.current);
        }
        return () => { if (cronometroRef.current) clearInterval(cronometroRef.current); };
    }, [cronometroAtivo]);

    const loadFila = useCallback(async () => {
        try {
            const data = await api.get('/cnc/fila-producao');
            setFila(data || []);
            const total = data.length;
            const concluidos = data.filter(d => d.status === 'concluido').length;
            const emAndamento = data.filter(d => d.status === 'produzindo').length;
            const pendentes = data.filter(d => d.status === 'pendente' || d.status === 'na_fila').length;
            setStats({ total, concluidos, emAndamento, pendentes });
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
            loadFila();
        } catch (err) { notify?.(err.error || 'Erro ao iniciar'); }
    };

    const concluirItem = async (item) => {
        try {
            await api.put(`/cnc/fila-producao/${item.id}`, { status: 'concluido' });
            if (itemAtual?.id === item.id) {
                setItemAtual(null);
                setCronometroAtivo(false);
            }
            loadFila();
            notify?.('Chapa concluída!', 'success');
        } catch (err) { notify?.(err.error || 'Erro ao concluir'); }
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
        if (s === 'concluido') return 'Concluído';
        if (s === 'produzindo') return 'Em Produção';
        if (s === 'erro') return 'Erro';
        if (s === 'na_fila') return 'Na Fila';
        return 'Pendente';
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a12', color: '#fff', fontSize: 20 }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: 12 }} /> Carregando fila de produção...
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
                        CNC · Chão de Fábrica
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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

            {/* Stats bar */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
                background: '#12121e', borderBottom: '1px solid #1e1e3a',
            }}>
                {[
                    { label: 'Total', value: stats.total, color: '#3b82f6', icon: Package },
                    { label: 'Pendentes', value: stats.pendentes, color: '#64748b', icon: Clock },
                    { label: 'Em Produção', value: stats.emAndamento, color: '#f59e0b', icon: Zap },
                    { label: 'Concluídos', value: stats.concluidos, color: '#22c55e', icon: CheckCircle2 },
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
                                EM PRODUÇÃO AGORA
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
                                {itemAtual.lote_nome || `Lote #${itemAtual.lote_id}`} — Chapa {(itemAtual.chapa_idx || 0) + 1}
                            </div>
                            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                                {itemAtual.material || '-'} · {itemAtual.pecas_count || '?'} peças
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 40, fontWeight: 300, color: '#f59e0b', fontFamily: 'monospace' }}>
                                {formatTime(cronometro)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button onClick={() => setCronometroAtivo(!cronometroAtivo)} style={{
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
            <div style={{ padding: '16px 24px', overflowY: 'auto', maxHeight: itemAtual ? 'calc(100vh - 380px)' : 'calc(100vh - 230px)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    Fila de Produção
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fila.filter(f => f.status !== 'concluido').map((item, i) => (
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
                                    <span style={{ color: '#555', fontWeight: 400 }}> — Chapa {(item.chapa_idx || 0) + 1}</span>
                                </div>
                                <div style={{ fontSize: 11, color: '#666', marginTop: 2, display: 'flex', gap: 16 }}>
                                    <span>{item.material || '-'}</span>
                                    <span>{item.pecas_count || '?'} peças</span>
                                    {item.tempo_estimado && <span>~{item.tempo_estimado} min</span>}
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

                    {fila.filter(f => f.status !== 'concluido').length === 0 && (
                        <div style={{
                            padding: 60, textAlign: 'center', color: '#444', fontSize: 16,
                            background: '#12121e', borderRadius: 12, border: '1px dashed #1e1e3a',
                        }}>
                            <CheckCircle2 size={40} style={{ color: '#22c55e', marginBottom: 12, opacity: 0.5 }} />
                            <div>Todas as chapas foram produzidas!</div>
                        </div>
                    )}
                </div>

                {/* Completed section */}
                {fila.filter(f => f.status === 'concluido').length > 0 && (
                    <div style={{ marginTop: 24 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#333', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                            Concluídos ({fila.filter(f => f.status === 'concluido').length})
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
                                        {item.lote_nome || `Lote #${item.lote_id}`} — Chapa {(item.chapa_idx || 0) + 1}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
