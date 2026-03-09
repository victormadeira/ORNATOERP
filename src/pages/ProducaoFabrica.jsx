import { Factory, Clock, PlayCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function ProducaoFabrica({ notify, user }) {
    return (
        <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Factory size={24} color="#fff" />
                </div>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Produção
                    </h1>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                        Chão de fábrica — filas, ordens e acompanhamento
                    </p>
                </div>
            </div>

            {/* Em breve banner */}
            <div style={{
                background: 'var(--bg-card)', border: '2px dashed var(--border)',
                borderRadius: 16, padding: 40, textAlign: 'center', marginBottom: 32
            }}>
                <PlayCircle size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Em construção — Etapa 3
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto' }}>
                    A tela de produção do chão de fábrica está sendo desenvolvida.
                    Será otimizada para tablets com fontes grandes e interface simplificada.
                </p>
            </div>

            {/* Preview cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {[
                    { icon: Clock, label: 'Fila de Corte', desc: 'Ordens aguardando', color: '#3b82f6' },
                    { icon: PlayCircle, label: 'Em Produção', desc: 'Ordens ativas', color: '#f59e0b' },
                    { icon: CheckCircle2, label: 'Concluídas', desc: 'Prontas p/ expedição', color: '#22c55e' },
                    { icon: AlertTriangle, label: 'Problemas', desc: 'Ocorrências abertas', color: '#ef4444' },
                ].map(item => (
                    <div key={item.label} style={{
                        background: 'var(--bg-card)', borderRadius: 12, padding: 20,
                        border: '1px solid var(--border)', opacity: 0.7
                    }}>
                        <item.icon size={20} style={{ color: item.color, marginBottom: 8 }} />
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
