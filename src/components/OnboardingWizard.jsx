/**
 * OnboardingWizard.jsx — Wizard de configuração inicial (4 passos)
 * Aparece apenas para gerentes na primeira vez (controle via localStorage).
 * Passos: Empresa → Logo → Taxas → Convite equipe
 */
import { useState, useRef } from 'react';
import { Building2, Palette, DollarSign, Users, Image, Lightbulb, Check, X, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '../api';

const LS_KEY = 'ornato_onboarding_done';

export function shouldShowOnboarding(user) {
    if (!user) return false;
    if (localStorage.getItem(LS_KEY)) return false;
    // Mostra apenas para gerentes
    return user.role === 'gerente' || user.role === 'admin';
}

export function markOnboardingDone() {
    localStorage.setItem(LS_KEY, '1');
}

const STEPS = [
    { id: 'empresa',  title: 'Sua empresa',         icon: Building2,   desc: 'Configure as informações básicas da sua marcenaria.' },
    { id: 'logo',     title: 'Logo e identidade',    icon: Palette,     desc: 'Adicione o logo que aparece nas propostas e no sistema.' },
    { id: 'taxas',    title: 'Taxas e margens',      icon: DollarSign,  desc: 'Configure sua margem padrão e taxa de instalação.' },
    { id: 'equipe',   title: 'Convidar equipe',      icon: Users,       desc: 'Adicione colaboradores ao sistema (opcional).' },
];

export default function OnboardingWizard({ onClose, notify, taxas }) {
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);

    // Step 0 — Empresa
    const [nome, setNome] = useState('');
    const [telefone, setTelefone] = useState('');
    const [cidade, setCidade] = useState('');
    const [estado, setEstado] = useState('');

    // Step 1 — Logo
    const [logoPreview, setLogoPreview] = useState('');
    const [logoFile, setLogoFile] = useState(null);
    const fileRef = useRef();

    // Step 2 — Taxas
    const [margem, setMargem] = useState(taxas?.margem_padrao || 30);
    const [instalacao, setInstalacao] = useState(taxas?.taxa_instalacao || 5);

    // Step 3 — Equipe
    const [emailConvite, setEmailConvite] = useState('');
    const [emailSent, setEmailSent] = useState(false);

    const next = async () => {
        if (step === 0) await saveEmpresa();
        else if (step === 1) await saveLogo();
        else if (step === 2) await saveTaxas();
        else { finish(); return; }
    };

    const saveEmpresa = async () => {
        if (!nome.trim()) { notify?.('Nome da empresa obrigatório', 'error'); return; }
        setSaving(true);
        try {
            await api.put('/config', { nome, telefone, cidade, estado });
            setStep(1);
        } catch (e) {
            notify?.(e.error || 'Erro ao salvar empresa', 'error');
        } finally { setSaving(false); }
    };

    const saveLogo = async () => {
        if (logoFile) {
            setSaving(true);
            try {
                await api.upload('/config/logo-sistema', logoFile, null, () => {});
            } catch (e) {
                notify?.(e.error || 'Erro ao enviar logo', 'error');
            } finally { setSaving(false); }
        }
        setStep(2);
    };

    const saveTaxas = async () => {
        setSaving(true);
        try {
            await api.put('/config', {
                margem_padrao: parseFloat(margem) || 30,
                taxa_instalacao: parseFloat(instalacao) || 0,
            });
            setStep(3);
        } catch (e) {
            notify?.(e.error || 'Erro ao salvar taxas', 'error');
        } finally { setSaving(false); }
    };

    const sendInvite = async () => {
        if (!emailConvite.includes('@')) { notify?.('E-mail inválido', 'error'); return; }
        setSaving(true);
        try {
            await api.post('/usuarios/convite', { email: emailConvite });
            setEmailSent(true);
            setEmailConvite('');
            notify?.('Convite enviado!', 'success');
        } catch (e) {
            notify?.(e.error || 'Erro ao enviar convite', 'error');
        } finally { setSaving(false); }
    };

    const finish = () => {
        markOnboardingDone();
        onClose();
        notify?.('Sistema configurado! Bem-vindo ao Ornato ERP.', 'success');
    };

    const skip = () => {
        if (step < STEPS.length - 1) setStep(step + 1);
        else finish();
    };

    const handleLogoFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setLogoFile(f);
        const url = URL.createObjectURL(f);
        setLogoPreview(url);
    };

    const inp = {
        display: 'block', width: '100%', padding: '10px 14px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--bg-muted)',
        color: 'var(--text-primary)', fontSize: 14, outline: 'none', marginTop: 4,
    };
    const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block' };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
            <div style={{
                width: '100%', maxWidth: 520, background: 'var(--bg-card)',
                borderRadius: 20, boxShadow: 'var(--shadow-xl)',
                border: '1px solid var(--border)', overflow: 'hidden',
            }}>
                {/* Progress bar */}
                <div style={{ height: 3, background: 'var(--border)' }}>
                    <div style={{
                        height: '100%', background: 'var(--primary)',
                        width: `${((step + 1) / STEPS.length) * 100}%`,
                        transition: 'width .4s ease',
                    }} />
                </div>

                {/* Step indicators */}
                <div style={{ display: 'flex', padding: '20px 24px 0' }}>
                    {STEPS.map((s, i) => (
                        <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: i <= step ? 14 : 12,
                                background: i < step ? 'var(--success)' : i === step ? 'var(--primary)' : 'var(--bg-muted)',
                                color: i <= step ? '#fff' : 'var(--text-muted)',
                                fontWeight: 700, transition: 'all .3s',
                                border: `2px solid ${i === step ? 'var(--primary)' : 'transparent'}`,
                            }}>
                                {i < step ? <Check size={12} strokeWidth={3} /> : i + 1}
                            </div>
                            <div style={{ fontSize: 10, color: i === step ? 'var(--primary)' : 'var(--text-muted)', fontWeight: i === step ? 700 : 400, textAlign: 'center' }}>
                                {s.title}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: '28px 32px' }}>
                    {(() => { const StepIcon = STEPS[step].icon; return <StepIcon size={32} style={{ color: 'var(--primary)', marginBottom: 8 }} />; })()}
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{STEPS[step].title}</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{STEPS[step].desc}</p>

                    {/* STEP 0 — Empresa */}
                    {step === 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={lbl}>Nome da empresa *</label>
                                <input style={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Marcenaria Ornato" autoFocus />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={lbl}>Telefone / WhatsApp</label>
                                    <input style={inp} value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
                                </div>
                                <div>
                                    <label style={lbl}>Estado</label>
                                    <input style={inp} value={estado} onChange={e => setEstado(e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
                                </div>
                            </div>
                            <div>
                                <label style={lbl}>Cidade</label>
                                <input style={inp} value={cidade} onChange={e => setCidade(e.target.value)} placeholder="São Paulo" />
                            </div>
                        </div>
                    )}

                    {/* STEP 1 — Logo */}
                    {step === 1 && (
                        <div>
                            <div style={{
                                border: '2px dashed var(--border)', borderRadius: 12,
                                padding: '32px 24px', textAlign: 'center', cursor: 'pointer',
                                background: 'var(--bg-muted)', transition: 'border-color .2s',
                            }} onClick={() => fileRef.current?.click()}>
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Logo preview" style={{ maxHeight: 80, maxWidth: 260, objectFit: 'contain', margin: '0 auto', display: 'block', borderRadius: 8 }} />
                                ) : (
                                    <>
                                        <Image size={40} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                                        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Clique para selecionar o logo</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>PNG, JPG até 2MB</div>
                                    </>
                                )}
                            </div>
                            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" style={{ display: 'none' }} onChange={handleLogoFile} />
                            {logoPreview && (
                                <button onClick={() => { setLogoPreview(''); setLogoFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                                    style={{ marginTop: 12, fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                    <><X size={12} /> Remover logo</>

                                </button>
                            )}
                        </div>
                    )}

                    {/* STEP 2 — Taxas */}
                    {step === 2 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={lbl}>Margem padrão (%)</label>
                                <input style={inp} type="number" value={margem} onChange={e => setMargem(e.target.value)} min={0} max={100} step={0.5} />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Margem aplicada automaticamente nos orçamentos</div>
                            </div>
                            <div>
                                <label style={lbl}>Taxa de instalação (%)</label>
                                <input style={inp} type="number" value={instalacao} onChange={e => setInstalacao(e.target.value)} min={0} max={50} step={0.5} />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Percentual adicional para montagem no cliente</div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3 — Equipe */}
                    {step === 3 && (
                        <div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input style={{ ...inp, marginTop: 0, flex: 1 }} value={emailConvite} onChange={e => setEmailConvite(e.target.value)}
                                    placeholder="email@colaborador.com" type="email" />
                                <button onClick={sendInvite} disabled={saving || !emailConvite}
                                    style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    Enviar convite
                                </button>
                            </div>
                            {emailSent && (
                                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} /> Convite enviado! Você pode adicionar mais colaboradores em Configurações → Usuários.
                                </div>
                            )}
                            <div style={{ marginTop: 20, padding: '14px', background: 'var(--bg-muted)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                <Lightbulb size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--warning)' }} /> Você pode convidar colaboradores a qualquer momento em <strong>Configurações → Usuários</strong>.
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '0 32px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={skip} style={{ fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}>
                        {step === STEPS.length - 1 ? 'Pular' : 'Pular este passo →'}
                    </button>
                    <button onClick={next} disabled={saving}
                        style={{
                            padding: '10px 28px', borderRadius: 10, background: 'var(--primary)',
                            color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                            fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1,
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                        {saving ? 'Salvando...' : step === STEPS.length - 1 ? <><Check size={14} /> Concluir configuração</> : <>Próximo <ArrowRight size={14} /></>}
                    </button>
                </div>
            </div>
        </div>
    );
}
