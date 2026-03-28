import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldX, CheckCircle2, Clock, AlertTriangle, User } from 'lucide-react';

export default function VerificacaoAssinatura({ codigo }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/assinaturas/verificar/${codigo}`)
            .then(r => r.json())
            .then(d => { if (d.error) setError(d.error); else setData(d); })
            .catch(() => setError('Erro ao verificar'))
            .finally(() => setLoading(false));
    }, [codigo]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
            <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
    );

    if (error || !data?.valido) return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#fef2f2', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
            <ShieldX size={64} color="#ef4444" />
            <h1 style={{ marginTop: 16, fontSize: 24, fontWeight: 800, color: '#991b1b' }}>Documento Nao Encontrado</h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
                O codigo de verificacao <strong style={{ fontFamily: 'monospace' }}>{codigo}</strong> nao corresponde a nenhum documento assinado.
            </p>
        </div>
    );

    const doc = data.documento;
    const isConcluido = doc.status === 'concluido';
    const statusColor = isConcluido ? '#22c55e' : doc.status === 'parcial' ? '#f59e0b' : '#94a3b8';
    const statusLabel = { concluido: 'Totalmente Assinado', parcial: 'Parcialmente Assinado', pendente: 'Pendente', cancelado: 'Cancelado' }[doc.status] || doc.status;

    return (
        <div style={{ minHeight: '100vh', background: isConcluido ? '#f0fdf4' : '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px', textAlign: 'center' }}>
                {data.empresa.logo && <img src={data.empresa.logo} alt="" style={{ height: 28, marginBottom: 4 }} />}
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{data.empresa.nome}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Verificacao de Documento</div>
            </div>

            <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
                {/* Resultado principal */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${statusColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        {isConcluido ? <ShieldCheck size={40} color={statusColor} /> : <Shield size={40} color={statusColor} />}
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1f2937' }}>
                        {isConcluido ? 'Documento Verificado' : `Documento ${statusLabel}`}
                    </h1>
                    <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                        Codigo: <strong style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{codigo}</strong>
                    </p>

                    {/* Info do documento */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginTop: 20, textAlign: 'left' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                            <div><span style={{ color: '#9ca3af', fontSize: 11 }}>Tipo</span><div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{doc.tipo}</div></div>
                            <div><span style={{ color: '#9ca3af', fontSize: 11 }}>Proposta</span><div style={{ fontWeight: 600 }}>{data.proposta.numero}</div></div>
                            <div><span style={{ color: '#9ca3af', fontSize: 11 }}>Cliente</span><div style={{ fontWeight: 600 }}>{data.proposta.cliente}</div></div>
                            <div><span style={{ color: '#9ca3af', fontSize: 11 }}>Status</span><div style={{ fontWeight: 600, color: statusColor }}>{statusLabel}</div></div>
                        </div>
                    </div>

                    {/* Hash */}
                    <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, marginTop: 12, fontFamily: 'monospace', fontSize: 10, color: '#6b7280', wordBreak: 'break-all', textAlign: 'left' }}>
                        SHA-256: {doc.hash}
                    </div>
                </div>

                {/* Signatários */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginTop: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', marginBottom: 16 }}>Signatarios</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {data.signatarios.map((s, i) => (
                            <div key={i} style={{ background: s.status === 'assinado' ? '#f0fdf4' : '#f8fafc', borderRadius: 12, padding: 16, border: `1px solid ${s.status === 'assinado' ? '#bbf7d0' : '#e5e7eb'}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <User size={16} color="#6b7280" />
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600 }}>{s.nome}</div>
                                            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>{s.papel}</div>
                                        </div>
                                    </div>
                                    {s.status === 'assinado' ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#22c55e', fontSize: 12, fontWeight: 600 }}>
                                            <CheckCircle2 size={14} /> Assinado
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
                                            <Clock size={14} /> Pendente
                                        </div>
                                    )}
                                </div>
                                {s.status === 'assinado' && (
                                    <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                                        <div>CPF: {s.cpf_masked}</div>
                                        <div>Data: {new Date(s.assinado_em).toLocaleString('pt-BR')}</div>
                                        <div>Local: {s.local || 'Nao identificado'} — {s.dispositivo}</div>
                                        <div>IP: {s.ip_masked}</div>
                                        <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#9ca3af', wordBreak: 'break-all' }}>Hash: {s.hash}</div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer legal */}
                <div style={{ textAlign: 'center', marginTop: 24, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: '#9ca3af', fontSize: 11 }}>
                        <Shield size={12} />
                        <span>{data.lei}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 8 }}>
                        {data.empresa.nome} — Sistema de Assinatura Eletronica
                    </div>
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
