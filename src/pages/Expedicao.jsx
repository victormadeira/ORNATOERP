import { Truck, ClipboardCheck, Package, MapPin } from 'lucide-react';

export default function Expedicao({ notify, user }) {
    return (
        <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: 'linear-gradient(135deg, #22c55e, #15803d)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Truck size={24} color="#fff" />
                </div>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Expedição
                    </h1>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                        Conferência, cargas e rastreamento de entrega
                    </p>
                </div>
            </div>

            {/* Em breve banner */}
            <div style={{
                background: 'var(--bg-card)', border: '2px dashed var(--border)',
                borderRadius: 16, padding: 40, textAlign: 'center', marginBottom: 32
            }}>
                <Truck size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Em construção — Etapa 4
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto' }}>
                    O módulo de expedição está sendo desenvolvido. Incluirá conferência de peças,
                    montagem de cargas e rastreamento de entrega.
                </p>
            </div>

            {/* Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {[
                    { icon: ClipboardCheck, label: 'Conferência', desc: 'Checklist de peças', color: '#3b82f6' },
                    { icon: Package, label: 'Cargas', desc: 'Volumes e romaneio', color: '#8b5cf6' },
                    { icon: MapPin, label: 'Entregas', desc: 'Rastreamento', color: '#22c55e' },
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
