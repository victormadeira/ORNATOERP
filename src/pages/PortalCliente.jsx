import { useState, useEffect, useRef } from 'react';
import { MapPin, Phone, Mail, Calendar, MessageSquare, Lock, CheckCircle2, Printer, PauseCircle, Clock, Play, AlertCircle, Send, User } from 'lucide-react';

const dtFmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const timeFmt = (s) => {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const mkStatusEtapa = (accent) => ({
    nao_iniciado: { label: 'Não iniciado', color: '#94a3b8', Icon: PauseCircle },
    pendente:     { label: 'Pendente',     color: '#94a3b8', Icon: Clock },
    em_andamento: { label: 'Em andamento', color: accent, Icon: Play },
    concluida:    { label: 'Concluída',    color: '#22c55e', Icon: CheckCircle2 },
    atrasada:     { label: 'Atrasada',     color: '#ef4444', Icon: AlertCircle },
});

const mkStatusProj = (accent) => ({
    nao_iniciado: { label: 'Não iniciado', color: '#94a3b8' },
    em_andamento: { label: 'Em andamento', color: accent },
    atrasado:     { label: 'Atrasado',     color: '#ef4444' },
    concluido:    { label: 'Concluído',    color: '#22c55e' },
    suspenso:     { label: 'Suspenso',     color: '#f59e0b' },
});

// ─── Gantt simplificado para o portal público ──────────
function GanttPublic({ etapas, primary = '#1B2A4A', accent = '#B7654A' }) {
    if (!etapas || etapas.length === 0) return null;

    const dts = etapas.flatMap(e => [e.data_inicio, e.data_vencimento].filter(Boolean));
    if (dts.length < 2) return null;

    const toMs = d => new Date(d + 'T12:00:00').getTime();
    const minMs = Math.min(...dts.map(toMs));
    const maxMs = Math.max(...dts.map(toMs));
    const totalMs = Math.max(maxMs - minMs, 86400000);

    const today = Date.now();
    const todayPct = Math.min(100, Math.max(0, (today - minMs) / totalMs * 100));

    const months = [];
    let cur = new Date(minMs);
    cur.setDate(1);
    while (cur.getTime() <= maxMs) {
        const pct = (cur.getTime() - minMs) / totalMs * 100;
        months.push({
            label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
            pct: Math.max(0, pct)
        });
        cur.setMonth(cur.getMonth() + 1);
    }

    return (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <div style={{
                position: 'relative', height: 24,
                background: primary,
                borderRadius: '8px 8px 0 0', minWidth: 400
            }}>
                {months.map((m, i) => (
                    <div key={i} style={{
                        position: 'absolute', left: `${m.pct}%`,
                        fontSize: 10, color: 'rgba(255,255,255,0.75)',
                        padding: '5px 8px', fontWeight: 600, whiteSpace: 'nowrap'
                    }}>{m.label}</div>
                ))}
            </div>

            <div style={{
                position: 'relative', background: '#fff',
                border: '1px solid #e2e8f0', borderTop: 'none',
                borderRadius: '0 0 8px 8px', minWidth: 400
            }}>
                <div style={{
                    position: 'absolute', left: `${todayPct}%`,
                    top: 0, bottom: 0, width: 2,
                    background: '#ef444450', zIndex: 2
                }} />

                {etapas.map((e, i) => {
                    const s = e.data_inicio ? toMs(e.data_inicio) : minMs;
                    const f = e.data_vencimento ? toMs(e.data_vencimento) : maxMs;
                    const left = Math.max(0, (s - minMs) / totalMs * 100);
                    const width = Math.max(1.5, (f - s) / totalMs * 100);
                    const color = mkStatusEtapa(accent)[e.status]?.color || '#94a3b8';
                    return (
                        <div key={e.id} style={{
                            position: 'relative', height: 40,
                            borderBottom: i < etapas.length - 1 ? '1px solid #f1f5f9' : 'none',
                            display: 'flex', alignItems: 'center'
                        }}>
                            <div style={{
                                position: 'absolute',
                                left: `${left}%`, width: `${width}%`,
                                height: 22, background: color,
                                borderRadius: 5, display: 'flex', alignItems: 'center',
                                overflow: 'hidden', zIndex: 1,
                                boxShadow: '0 1px 4px rgba(0,0,0,.15)'
                            }}>
                                <span style={{ fontSize: 10, color: '#fff', padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', fontWeight: 600 }}>
                                    {e.nome}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                {Object.entries(mkStatusEtapa(accent)).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                        <div style={{ width: 12, height: 12, background: v.color, borderRadius: 3 }} />
                        {v.label}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Chat de mensagens do portal ──────────────
function PortalChat({ token, mensagens: initialMsgs, accent, primary, clienteNome }) {
    const [msgs, setMsgs] = useState(initialMsgs || []);
    const [text, setText] = useState('');
    const [nome, setNome] = useState(() => localStorage.getItem('portal_nome') || '');
    const [sending, setSending] = useState(false);
    const [showNome, setShowNome] = useState(!localStorage.getItem('portal_nome'));
    const chatRef = useRef(null);

    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [msgs]);

    // Poll for new messages every 15 seconds
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/projetos/portal/${token}`);
                const data = await res.json();
                if (data?.projeto?.mensagens) setMsgs(data.projeto.mensagens);
            } catch { /* silently fail */ }
        }, 15000);
        return () => clearInterval(interval);
    }, [token]);

    const enviar = async () => {
        if (!text.trim()) return;
        if (showNome && !nome.trim()) return;

        if (showNome) {
            localStorage.setItem('portal_nome', nome.trim());
            setShowNome(false);
        }

        setSending(true);
        try {
            const res = await fetch(`/api/projetos/portal/${token}/mensagens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autor_nome: nome.trim() || clienteNome || 'Cliente', conteudo: text.trim() })
            });
            const msg = await res.json();
            if (msg.id) {
                setMsgs(prev => [...prev, msg]);
                setText('');
            }
        } catch { /* error */ }
        finally { setSending(false); }
    };

    return (
        <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={16} style={{ color: accent }} /> Mensagens
            </h2>

            {/* Chat area */}
            <div ref={chatRef} style={{
                maxHeight: 360, minHeight: 120, overflowY: 'auto',
                background: '#f8fafc', borderRadius: 12,
                padding: 16, marginBottom: 16,
                border: '1px solid #e2e8f0'
            }}>
                {msgs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
                        <MessageSquare size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <p>Envie uma mensagem para a equipe</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {msgs.map(m => {
                            const isEquipe = m.autor_tipo === 'equipe';
                            return (
                                <div key={m.id} style={{
                                    display: 'flex',
                                    justifyContent: isEquipe ? 'flex-start' : 'flex-end',
                                }}>
                                    <div style={{
                                        maxWidth: '75%',
                                        background: isEquipe ? '#fff' : `${accent}15`,
                                        border: isEquipe ? '1px solid #e2e8f0' : `1px solid ${accent}30`,
                                        borderRadius: isEquipe ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                                        padding: '10px 14px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <div style={{
                                                width: 20, height: 20, borderRadius: '50%',
                                                background: isEquipe ? `${primary}15` : `${accent}20`,
                                                color: isEquipe ? primary : accent,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 9, fontWeight: 700, flexShrink: 0
                                            }}>
                                                {isEquipe ? (m.autor_nome || 'E')[0].toUpperCase() : <User size={10} />}
                                            </div>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: isEquipe ? primary : accent }}>
                                                {m.autor_nome || (isEquipe ? 'Equipe' : 'Você')}
                                            </span>
                                            <span style={{ fontSize: 10, color: '#94a3b8' }}>{timeFmt(m.criado_em)}</span>
                                        </div>
                                        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {m.conteudo}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Nome input (first message only) */}
            {showNome && (
                <div style={{ marginBottom: 10 }}>
                    <input
                        type="text"
                        value={nome}
                        onChange={e => setNome(e.target.value)}
                        placeholder="Seu nome..."
                        style={{
                            width: '100%', padding: '10px 14px',
                            border: '1px solid #e2e8f0', borderRadius: 10,
                            fontSize: 13, outline: 'none', background: '#fff',
                            boxSizing: 'border-box'
                        }}
                        onFocus={e => e.target.style.borderColor = accent}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                </div>
            )}

            {/* Message input */}
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    type="text"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                    placeholder="Digite sua mensagem..."
                    disabled={sending}
                    style={{
                        flex: 1, padding: '10px 14px',
                        border: '1px solid #e2e8f0', borderRadius: 10,
                        fontSize: 13, outline: 'none', background: '#fff',
                    }}
                    onFocus={e => e.target.style.borderColor = accent}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <button
                    onClick={enviar}
                    disabled={sending || !text.trim()}
                    style={{
                        background: accent, color: '#fff', border: 'none',
                        padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                        opacity: (sending || !text.trim()) ? 0.5 : 1,
                    }}
                >
                    <Send size={14} /> Enviar
                </button>
            </div>
        </div>
    );
}

// ─── Página pública do Portal do Cliente ──────────────
export default function PortalCliente({ token }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/projetos/portal/${token}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) setError(d.error);
                else setData(d);
            })
            .catch(() => setError('Não foi possível carregar o projeto'))
            .finally(() => setLoading(false));
    }, [token]);

    const primary = data?.empresa?.proposta_cor_primaria || '#1B2A4A';
    const accent = data?.empresa?.proposta_cor_accent || '#C9A96E';
    const font = 'system-ui, -apple-system, sans-serif';

    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font }}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ width: 40, height: 40, border: `3px solid #e2e8f0`, borderTopColor: primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p>Carregando portal do cliente...</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (error) return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
                <div style={{ width: 64, height: 64, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ef4444' }}><Lock size={28} /></div>
                <h2 style={{ color: '#1e293b', marginBottom: 8 }}>Link inválido ou expirado</h2>
                <p style={{ color: '#64748b', fontSize: 14 }}>{error}</p>
            </div>
        </div>
    );

    const { projeto, empresa } = data;
    const etapas = projeto.etapas || [];
    const ocorrencias = projeto.ocorrencias || [];
    const mensagens = projeto.mensagens || [];
    const concluidasPct = etapas.length
        ? Math.round(etapas.filter(e => e.status === 'concluida').length / etapas.length * 100)
        : 0;

    const STATUS_ETAPA = mkStatusEtapa(accent);
    const STATUS_PROJ = mkStatusProj(accent);
    const statusProj = STATUS_PROJ[projeto.status] || STATUS_PROJ.nao_iniciado;

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: font, padding: '32px 16px' }}>
            <style>{`
                @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
                .portal-card { animation: fadeUp 0.4s ease; max-width: 800px; margin: 0 auto; }
                @media print { body { background: white !important; } .no-print { display: none !important; } }
            `}</style>

            <div className="portal-card">

                {/* ─── Cabeçalho empresa ──────────────────────── */}
                <div style={{
                    background: '#fff',
                    borderRadius: '16px 16px 0 0', padding: '28px 32px',
                    borderBottom: `3px solid ${primary}`,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            {empresa.logo_header_path ? (
                                <>
                                    <img src={empresa.logo_header_path} alt={empresa.nome} style={{ height: 52, maxWidth: 180, objectFit: 'contain', flexShrink: 0 }} />
                                    {(empresa.cidade || empresa.telefone) && (
                                        <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderLeft: '1px solid #e2e8f0', paddingLeft: 14 }}>
                                            {empresa.cidade && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {empresa.cidade}{empresa.estado ? `, ${empresa.estado}` : ''}</span>}
                                            {empresa.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {empresa.telefone}</span>}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div style={{
                                        width: 48, height: 48, background: `${primary}12`,
                                        borderRadius: 12, display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', fontWeight: 800, fontSize: 22, flexShrink: 0, color: primary,
                                        border: `1.5px solid ${primary}30`,
                                    }}>
                                        {(empresa.nome || 'M')[0]}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 20, color: '#1e293b' }}>{empresa.nome || 'Marcenaria'}</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            {empresa.cidade && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {empresa.cidade}{empresa.estado ? `, ${empresa.estado}` : ''}</span>}
                                            {empresa.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {empresa.telefone}</span>}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                                color: accent, marginBottom: 6,
                            }}>
                                Portal do Cliente
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: primary }}>{projeto.nome}</div>
                        </div>
                    </div>
                </div>

                {/* ─── Info do projeto ─────────────────────────── */}
                <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 20 }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Cliente</div>
                            <div style={{ fontWeight: 700, fontSize: 17, color: '#0f172a' }}>{projeto.cliente_nome || '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Status</div>
                            <span style={{
                                background: `${statusProj.color}15`, color: statusProj.color,
                                border: `1px solid ${statusProj.color}40`,
                                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99
                            }}>{statusProj.label}</span>
                        </div>
                        {projeto.data_inicio && (
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Período</div>
                                <div style={{ fontSize: 14, color: '#334155' }}>
                                    {dtFmt(projeto.data_inicio)} → {dtFmt(projeto.data_vencimento)}
                                </div>
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Progresso</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 99, height: 8 }}>
                                    <div style={{ width: `${concluidasPct}%`, height: '100%', background: accent, borderRadius: 99, transition: 'width 0.5s' }} />
                                </div>
                                <span style={{ fontWeight: 700, color: accent, fontSize: 14 }}>{concluidasPct}%</span>
                            </div>
                        </div>
                    </div>

                    {projeto.descricao && (
                        <div style={{ marginTop: 16, padding: '14px 18px', background: '#f8fafc', borderRadius: 10, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
                            {projeto.descricao}
                        </div>
                    )}
                </div>

                {/* ─── Etapas / Cronograma ────────────────────── */}
                <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
                    <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}><Calendar size={16} style={{ color: accent }} /> Cronograma</h2>

                    <GanttPublic etapas={etapas} primary={primary} accent={accent} />

                    {etapas.length > 0 && (
                        <div style={{ marginTop: 24, display: 'grid', gap: 8 }}>
                            {etapas.map((e) => {
                                const st = STATUS_ETAPA[e.status] || STATUS_ETAPA.pendente;
                                return (
                                    <div key={e.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        padding: '12px 16px', borderRadius: 10,
                                        background: '#f8fafc',
                                        borderLeft: `4px solid ${st.color}`,
                                    }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: `${st.color}15`, border: `2px solid ${st.color}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, color: st.color
                                        }}>
                                            <st.Icon size={14} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{e.nome}</div>
                                            {e.data_inicio && (
                                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                                    {dtFmt(e.data_inicio)} → {dtFmt(e.data_vencimento)}
                                                </div>
                                            )}
                                        </div>
                                        <span style={{
                                            background: `${st.color}15`, color: st.color,
                                            border: `1px solid ${st.color}30`,
                                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                                            whiteSpace: 'nowrap'
                                        }}>{st.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ─── Ocorrências (apenas públicas) ──────────── */}
                {ocorrencias.length > 0 && (
                    <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
                        <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} style={{ color: accent }} /> Comunicados</h2>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {ocorrencias.map(oc => (
                                <div key={oc.id} style={{
                                    padding: '14px 18px', borderRadius: 10,
                                    background: oc.status === 'resolvido' ? '#f0fdf4' : '#f8fafc',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{oc.assunto}</div>
                                        {oc.status === 'resolvido' && (
                                            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Resolvido</span>
                                        )}
                                    </div>
                                    {oc.descricao && (
                                        <p style={{ fontSize: 13, color: '#334155', margin: '6px 0 0', lineHeight: 1.6 }}>{oc.descricao}</p>
                                    )}
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                                        {oc.autor} · {new Date(oc.criado_em).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── Chat de Mensagens (Portal v2) ──────────── */}
                <div className="no-print">
                    <PortalChat
                        token={token}
                        mensagens={mensagens}
                        accent={accent}
                        primary={primary}
                        clienteNome={projeto.cliente_nome}
                    />
                </div>

                {/* ─── Rodapé ─────────────────────────────────── */}
                <div style={{
                    background: '#fff', padding: '20px 32px',
                    borderRadius: '0 0 16px 16px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: 12
                }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        {empresa.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={11} /> {empresa.email}</span>}
                        {empresa.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {empresa.telefone}</span>}
                    </div>
                    <button
                        className="no-print"
                        onClick={() => window.print()}
                        style={{
                            background: primary, color: '#fff', border: 'none',
                            padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
                        }}
                    >
                        <Printer size={13} /> Imprimir
                    </button>
                </div>

                <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#94a3b8' }}>
                    Portal gerado pelo sistema Ornato ERP
                </div>
            </div>
        </div>
    );
}
