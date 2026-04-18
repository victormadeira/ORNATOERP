import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, FileText, PenTool, Shield, ChevronRight } from 'lucide-react';

// ── Validação CPF brasileiro ──
function validarCPF(cpf) {
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    let s = 0; for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
    let c = 11 - (s % 11); if (c >= 10) c = 0; if (parseInt(d[9]) !== c) return false;
    s = 0; for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
    c = 11 - (s % 11); if (c >= 10) c = 0; return parseInt(d[10]) === c;
}
function formatCPF(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
}

// ── Canvas de assinatura ──
function SignatureCanvas({ onSignature, width = 600, height = 200 }) {
    const canvasRef = useRef(null);
    const [drawing, setDrawing] = useState(false);
    const [hasStrokes, setHasStrokes] = useState(false);
    const points = useRef([]);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }, [dpr]);

    const getPos = useCallback((e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }, []);

    const startDraw = useCallback((e) => {
        e.preventDefault(); setDrawing(true); points.current = [getPos(e)];
    }, [getPos]);

    const draw = useCallback((e) => {
        if (!drawing) return; e.preventDefault();
        const p = getPos(e); points.current.push(p);
        const ctx = canvasRef.current.getContext('2d');
        const pts = points.current;
        if (pts.length < 2) return;
        ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.stroke();
    }, [drawing, getPos]);

    const endDraw = useCallback(() => { setDrawing(false); setHasStrokes(true); }, []);

    const clear = () => {
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rect.width, rect.height);
        setHasStrokes(false); onSignature(null);
    };

    const save = () => {
        if (!hasStrokes) return;
        onSignature(canvasRef.current.toDataURL('image/png'));
    };

    return (
        <div>
            <div style={{ position: 'relative' }}>
                <canvas ref={canvasRef} style={{ width: '100%', height, border: '2px solid #e5e7eb', borderRadius: 12, touchAction: 'none', userSelect: 'none', cursor: 'crosshair', background: '#fff' }}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
                {/* Linha de referência visual (não aparece no export) */}
                <div style={{ position: 'absolute', bottom: 30, left: 20, right: 20, borderBottom: '2px dashed #d1d5db', pointerEvents: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={clear} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer' }}>Limpar</button>
                <button onClick={save} disabled={!hasStrokes} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: hasStrokes ? 'var(--info-hover)' : 'var(--muted)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: hasStrokes ? 'pointer' : 'not-allowed', flex: 1 }}>
                    Confirmar Assinatura
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════
export default function AssinaturaPublic({ token }) {
    const [step, setStep] = useState(1); // 1=CPF, 2=Documento, 3=Assinatura, 4=Confirmar, 5=Sucesso
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [cpf, setCpf] = useState('');
    const [cpfError, setCpfError] = useState('');
    const [signatureImg, setSignatureImg] = useState(null);
    const [aceite, setAceite] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [resultado, setResultado] = useState(null);
    const iframeRef = useRef(null);

    // Carregar dados
    useEffect(() => {
        fetch(`/api/assinaturas/public/${token}`)
            .then(r => r.json())
            .then(d => { if (d.error) setError(d.error); else setData(d); })
            .catch(() => setError('Erro ao carregar documento'))
            .finally(() => setLoading(false));
    }, [token]);

    // Validar CPF e avançar
    const validarEAvancar = () => {
        const digits = cpf.replace(/\D/g, '');
        if (!validarCPF(digits)) { setCpfError('CPF inválido'); return; }
        if (digits.slice(-4) !== data.signatario.cpf_ultimos4) { setCpfError('CPF não confere'); return; }
        setCpfError(''); setStep(2);
    };

    // Submeter assinatura
    const assinar = async () => {
        setSubmitting(true);
        try {
            const resp = await fetch(`/api/assinaturas/public/${token}/assinar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf: cpf.replace(/\D/g, ''), assinatura_img: signatureImg }),
            });
            const r = await resp.json();
            if (r.error) { setError(r.error); return; }
            setResultado(r); setStep(5);
        } catch { setError('Erro ao enviar assinatura'); }
        finally { setSubmitting(false); }
    };

    const cor1 = data?.empresa?.cor_primaria || '#1B2A4A';
    const cor2 = data?.empresa?.cor_accent || '#C9A96E';

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-muted)' }}><div style={{ width: 40, height: 40, border: `3px solid ${cor1}20`, borderTopColor: cor1, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>;
    if (error) return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-muted)', padding: 24 }}>
            <AlertTriangle size={48} color="var(--danger)" />
            <h2 style={{ marginTop: 16, color: '#1f2937', fontSize: 18 }}>{error}</h2>
        </div>
    );
    if (!data) return null;

    const nomeDoc = { contrato: 'Contrato', caderno_tecnico: 'Caderno Técnico', termo_entrega: 'Termo de Entrega' }[data.documento.tipo] || 'Documento';

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-muted)', fontFamily: 'Inter, system-ui, sans-serif' }}>
            {/* Header */}
            <div style={{ background: cor1, color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {data.empresa.logo && <img src={data.empresa.logo} alt="" style={{ height: 32 }} />}
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{data.empresa.nome}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Assinatura Eletrônica</div>
                </div>
            </div>

            {/* Progress */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
                {['CPF', 'Documento', 'Assinar', 'Confirmar', 'Concluído'].map((l, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step > i + 1 ? 'var(--success)' : step === i + 1 ? cor1 : '#e5e7eb', color: step >= i + 1 ? '#fff' : 'var(--muted)' }}>
                            {step > i + 1 ? '✓' : i + 1}
                        </div>
                        <span style={{ fontSize: 10, color: step === i + 1 ? cor1 : 'var(--muted)', fontWeight: step === i + 1 ? 700 : 400, display: i < 4 ? 'none' : 'none' }}>{l}</span>
                        {i < 4 && <ChevronRight size={12} color="#d1d5db" />}
                    </div>
                ))}
            </div>

            {/* Content */}
            <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>

                {/* Step 1: CPF */}
                {step === 1 && (
                    <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <FileText size={40} color={cor1} style={{ marginBottom: 8 }} />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937' }}>{nomeDoc}</h2>
                            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Proposta {data.proposta.numero}</p>
                        </div>
                        <div style={{ background: '#f0f9ff', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Signatário</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{data.signatario.nome}</div>
                            <div style={{ fontSize: 12, color: cor2, fontWeight: 600, textTransform: 'uppercase' }}>{data.signatario.papel}</div>
                        </div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Informe seu CPF para continuar</label>
                        <input type="text" value={cpf} onChange={e => { setCpf(formatCPF(e.target.value)); setCpfError(''); }} placeholder="000.000.000-00" maxLength={14}
                            style={{ width: '100%', padding: '12px 16px', fontSize: 18, borderRadius: 12, border: `2px solid ${cpfError ? 'var(--danger)' : '#e5e7eb'}`, outline: 'none', textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', boxSizing: 'border-box' }}
                            onKeyDown={e => e.key === 'Enter' && validarEAvancar()} />
                        {cpfError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4, textAlign: 'center' }}>{cpfError}</div>}
                        <button onClick={validarEAvancar} disabled={cpf.replace(/\D/g, '').length < 11}
                            style={{ width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none', background: cpf.replace(/\D/g, '').length >= 11 ? cor1 : '#d1d5db', color: '#fff', fontSize: 15, fontWeight: 700, cursor: cpf.replace(/\D/g, '').length >= 11 ? 'pointer' : 'not-allowed' }}>
                            Continuar
                        </button>
                    </div>
                )}

                {/* Step 2: Documento (fullscreen) */}
                {step === 2 && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
                        display: 'flex', flexDirection: 'column', background: '#fff',
                    }}>
                        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e5e7eb', background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <div>
                                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', margin: 0 }}>Leia o documento</h3>
                                <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>Leia integralmente antes de assinar</p>
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{nomeDoc} — {data.proposta.numero}</span>
                        </div>
                        <iframe ref={iframeRef} srcDoc={`<div style="padding:0 20px">${data.documento.html}</div>`} style={{ flex: 1, width: '100%', border: 'none' }} title="Documento" />
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                            <button onClick={() => setStep(3)} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: cor1, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                                Li o documento — Continuar
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Assinatura */}
                {step === 3 && (
                    <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                            <PenTool size={32} color={cor1} />
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', marginTop: 8 }}>Desenhe sua assinatura</h3>
                            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Use o dedo (celular) ou mouse (computador)</p>
                        </div>
                        <SignatureCanvas onSignature={(img) => { setSignatureImg(img); if (img) setStep(4); }} height={180} />
                    </div>
                )}

                {/* Step 4: Confirmação */}
                {step === 4 && (
                    <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', marginBottom: 16 }}>Confirmar Assinatura</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ background: 'var(--bg-muted)', borderRadius: 12, padding: 16 }}>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Signatário</div>
                                <div style={{ fontSize: 15, fontWeight: 600 }}>{data.signatario.nome}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>CPF: {formatCPF(cpf)}</div>
                            </div>
                            <div style={{ background: 'var(--bg-muted)', borderRadius: 12, padding: 16 }}>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Documento</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{nomeDoc} — {data.proposta.numero}</div>
                                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>Hash: {data.documento.hash.slice(0, 16)}...</div>
                            </div>
                            <div style={{ background: 'var(--bg-muted)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Sua assinatura</div>
                                {signatureImg && <img src={signatureImg} alt="Assinatura" style={{ maxWidth: '100%', maxHeight: 80, border: '1px solid #e5e7eb', borderRadius: 8 }} />}
                            </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16, cursor: 'pointer' }}>
                            <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} style={{ marginTop: 2, width: 18, height: 18 }} />
                            <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                                Declaro que li integralmente o documento acima e concordo com todos os seus termos. Estou ciente de que esta assinatura eletrônica tem validade jurídica conforme a Lei 14.063/2020.
                            </span>
                        </label>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button onClick={() => { setSignatureImg(null); setStep(3); }} style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Refazer</button>
                            <button onClick={assinar} disabled={!aceite || submitting}
                                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: aceite ? 'var(--success)' : '#d1d5db', color: '#fff', fontSize: 15, fontWeight: 700, cursor: aceite ? 'pointer' : 'not-allowed' }}>
                                {submitting ? 'Assinando...' : '✎ Assinar Documento'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 5: Sucesso */}
                {step === 5 && resultado && (
                    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', animation: 'popIn 0.5s ease' }}>
                            <CheckCircle2 size={36} color="var(--success-hover)" />
                        </div>
                        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', margin: 0 }}>Contrato Assinado com Sucesso!</h2>
                        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                            Sua assinatura digital foi registrada e o documento possui validade juridica.<br />
                            <strong style={{ color: '#374151' }}>Guarde o codigo abaixo</strong> para consulta futura.
                        </p>

                        <div style={{ background: 'var(--success-bg)', borderRadius: 10, padding: '16px 14px', marginTop: 16 }}>
                            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>Codigo de verificacao</div>
                            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 5, color: 'var(--success-hover)', fontFamily: 'monospace', marginTop: 4 }}>{resultado.codigo_verificacao}</div>
                        </div>

                        {/* Botao Download */}
                        <button
                            onClick={async () => {
                                try {
                                    const r = await fetch(`/api/assinaturas/comprovante-publico/${resultado.codigo_verificacao}`);
                                    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Erro ao baixar'); return; }
                                    const blob = await r.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url; a.download = `Contrato-Assinado-${resultado.codigo_verificacao}.pdf`;
                                    a.click(); URL.revokeObjectURL(url);
                                } catch { alert('Erro ao baixar contrato'); }
                            }}
                            style={{
                                width: '100%', marginTop: 14, padding: '12px 16px', borderRadius: 10,
                                border: 'none', background: cor1 || '#1B2A4A', color: '#fff',
                                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}
                        >
                            <FileText size={16} /> Baixar Contrato Assinado (PDF)
                        </button>

                        {/* Dados da assinatura */}
                        <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: 12, marginTop: 14, textAlign: 'left' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Dados da sua assinatura</div>
                            <div style={{ display: 'grid', gap: 3, fontSize: 11, color: 'var(--muted)' }}>
                                <div><span style={{ color: 'var(--muted)' }}>Assinante:</span> <strong style={{ color: '#374151' }}>{resultado.nome || data?.nome || ''}</strong></div>
                                <div><span style={{ color: 'var(--muted)' }}>Data/hora:</span> <strong style={{ color: '#374151' }}>{new Date().toLocaleString('pt-BR')}</strong></div>
                                <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'var(--muted)', wordBreak: 'break-all', marginTop: 2 }}>
                                    Hash: {resultado.hash_assinatura}
                                </div>
                            </div>
                        </div>

                        {/* Proximos passos */}
                        <div style={{ background: 'var(--warning-bg)', borderRadius: 8, padding: 12, marginTop: 10, textAlign: 'left' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning-hover)', marginBottom: 4 }}>Proximos passos</div>
                            <ul style={{ fontSize: 11, color: '#78716c', lineHeight: 1.7, margin: 0, paddingLeft: 16 }}>
                                <li>A empresa sera notificada da sua assinatura</li>
                                <li>Verifique o documento a qualquer momento pelo codigo acima</li>
                                <li>O PDF acima serve como comprovante legal</li>
                            </ul>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', marginTop: 16, color: 'var(--muted)', fontSize: 9 }}>
                            <Shield size={11} />
                            <span>Assinatura eletronica simples — Lei 14.063/2020, Art. 4, I</span>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes popIn { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
            `}</style>
        </div>
    );
}
