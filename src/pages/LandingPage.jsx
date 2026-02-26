import { useState, useEffect } from 'react';
import { Phone, Mail, MapPin, Send, CheckCircle, Loader2 } from 'lucide-react';

const TIPOS_PROJETO = [
    'Cozinha Planejada',
    'Closet / Guarda-roupa',
    'Home Office',
    'Sala de Estar',
    'Banheiro / Lavabo',
    'Quarto',
    'Área Gourmet',
    'Lavanderia',
    'Loja / Comercial',
    'Projeto Completo',
    'Outro',
];

export default function LandingPage() {
    const [config, setConfig] = useState(null);
    const [form, setForm] = useState({ nome: '', telefone: '', email: '', tipo_projeto: '', mensagem: '' });
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        fetch('/api/leads/config')
            .then(r => r.json())
            .then(setConfig)
            .catch(() => setConfig({ nome: 'Marcenaria' }));
    }, []);

    // Capturar UTM params
    const params = new URLSearchParams(window.location.search);
    const utm = {
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
    };

    const cor1 = config?.proposta_cor_primaria || '#1B2A4A';
    const cor2 = config?.proposta_cor_accent || '#C9A96E';
    const empNome = config?.nome || 'Marcenaria';

    const formatTel = (v) => {
        const nums = v.replace(/\D/g, '').slice(0, 11);
        if (nums.length <= 2) return `(${nums}`;
        if (nums.length <= 7) return `(${nums.slice(0, 2)})${nums.slice(2)}`;
        return `(${nums.slice(0, 2)})${nums.slice(2, 7)}-${nums.slice(7)}`;
    };

    const enviar = async (e) => {
        e.preventDefault();
        if (!form.nome.trim() || !form.telefone.trim()) {
            setErro('Nome e telefone são obrigatórios');
            return;
        }
        setEnviando(true);
        setErro('');
        try {
            const resp = await fetch('/api/leads/captura', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, ...utm }),
            });
            if (!resp.ok) throw new Error((await resp.json()).error || 'Erro');
            setEnviado(true);
        } catch (ex) {
            setErro(ex.message || 'Erro ao enviar. Tente novamente.');
        } finally {
            setEnviando(false);
        }
    };

    if (!config) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #ddd', borderTopColor: cor1, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', fontFamily: "'Inter', -apple-system, sans-serif", background: '#f8fafc' }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg) } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
                .landing-input { width: 100%; padding: 12px 16px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 15px; outline: none; transition: all 0.2s; background: #fff; }
                .landing-input:focus { border-color: ${cor2}; box-shadow: 0 0 0 3px ${cor2}25; }
                .landing-input::placeholder { color: #94a3b8; }
                .landing-select { width: 100%; padding: 12px 16px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 15px; outline: none; transition: all 0.2s; background: #fff; appearance: none; cursor: pointer; }
                .landing-select:focus { border-color: ${cor2}; box-shadow: 0 0 0 3px ${cor2}25; }
            `}</style>

            {/* ── Hero / Header ── */}
            <div style={{
                background: `linear-gradient(135deg, ${cor1} 0%, ${cor1}dd 50%, ${cor1}bb 100%)`,
                padding: '60px 20px 80px', textAlign: 'center', position: 'relative', overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 300, height: 300, borderRadius: '50%', background: `${cor2}15`, transform: 'translate(50%, -50%)' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 200, height: 200, borderRadius: '50%', background: `${cor2}10`, transform: 'translate(-30%, 40%)' }} />

                <div style={{ position: 'relative', zIndex: 1, maxWidth: 700, margin: '0 auto' }}>
                    {config?.logo_sistema && (
                        <img src={config.logo_sistema} alt={empNome} style={{ height: 60, margin: '0 auto 20px', display: 'block', objectFit: 'contain' }} />
                    )}
                    <h1 style={{ fontSize: 36, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 12 }}>
                        {empNome}
                    </h1>
                    <p style={{ fontSize: 18, color: `${cor2}`, fontWeight: 500, marginBottom: 8 }}>
                        Móveis Planejados sob Medida
                    </p>
                    <p style={{ fontSize: 15, color: '#ffffff99', maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
                        {config?.proposta_sobre?.slice(0, 200) || 'Transformamos seus sonhos em realidade com projetos exclusivos, materiais de primeira qualidade e acabamento impecável.'}
                    </p>
                </div>
            </div>

            {/* ── Formulário ── */}
            <div style={{
                maxWidth: 520, margin: '-40px auto 0', padding: '0 20px',
                position: 'relative', zIndex: 2, animation: 'fadeIn 0.5s ease-out',
            }}>
                <div style={{
                    background: '#fff', borderRadius: 20, padding: 36,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)',
                    border: '1px solid #e2e8f0',
                }}>
                    {enviado ? (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%', background: '#22c55e18',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                            }}>
                                <CheckCircle size={32} style={{ color: '#22c55e' }} />
                            </div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, color: cor1, marginBottom: 8 }}>Mensagem Enviada!</h2>
                            <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6 }}>
                                Recebemos seu contato e em breve um de nossos consultores entrará em contato com você.
                            </p>
                        </div>
                    ) : (
                        <>
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: cor1, marginBottom: 4, textAlign: 'center' }}>
                                Solicite seu Orçamento
                            </h2>
                            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, textAlign: 'center' }}>
                                Preencha o formulário e entraremos em contato
                            </p>

                            <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>Nome completo *</label>
                                    <input className="landing-input" placeholder="Seu nome" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                                </div>

                                <div>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>Telefone / WhatsApp *</label>
                                    <input className="landing-input" placeholder="(99) 99999-9999" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: formatTel(e.target.value) }))} />
                                </div>

                                <div>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>E-mail</label>
                                    <input className="landing-input" type="email" placeholder="seu@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                                </div>

                                <div>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>Tipo de projeto</label>
                                    <select className="landing-select" value={form.tipo_projeto} onChange={e => setForm(f => ({ ...f, tipo_projeto: e.target.value }))}>
                                        <option value="">Selecione...</option>
                                        {TIPOS_PROJETO.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>Mensagem</label>
                                    <textarea className="landing-input" placeholder="Descreva brevemente o que você precisa..." value={form.mensagem} onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))} style={{ minHeight: 80, resize: 'vertical' }} />
                                </div>

                                {erro && (
                                    <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
                                        {erro}
                                    </div>
                                )}

                                <button type="submit" disabled={enviando} style={{
                                    width: '100%', padding: '14px', border: 'none', borderRadius: 12, cursor: 'pointer',
                                    background: `linear-gradient(135deg, ${cor2}, ${cor2}cc)`, color: '#fff',
                                    fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'all 0.2s', boxShadow: `0 4px 16px ${cor2}40`,
                                    opacity: enviando ? 0.7 : 1,
                                }}>
                                    {enviando ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
                                    {enviando ? 'Enviando...' : 'Enviar Solicitação'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>

            {/* ── Contato ── */}
            <div style={{ maxWidth: 520, margin: '32px auto 0', padding: '0 20px 60px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
                    {config?.telefone && (
                        <a href={`tel:${config.telefone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', textDecoration: 'none' }}>
                            <Phone size={14} style={{ color: cor2 }} /> {config.telefone}
                        </a>
                    )}
                    {config?.email && (
                        <a href={`mailto:${config.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', textDecoration: 'none' }}>
                            <Mail size={14} style={{ color: cor2 }} /> {config.email}
                        </a>
                    )}
                    {config?.cidade && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                            <MapPin size={14} style={{ color: cor2 }} /> {config.cidade}
                        </span>
                    )}
                </div>
                <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 20 }}>
                    {empNome} &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
