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
        // Linha de referência
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#d1d5db'; ctx.beginPath();
        ctx.moveTo(20, rect.height - 30); ctx.lineTo(rect.width - 20, rect.height - 30); ctx.stroke();
        ctx.setLineDash([]); ctx.strokeStyle = '#1a1a2e';
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
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#d1d5db'; ctx.beginPath();
        ctx.moveTo(20, rect.height - 30); ctx.lineTo(rect.width - 20, rect.height - 30); ctx.stroke();
        ctx.setLineDash([]); setHasStrokes(false); onSignature(null);
    };

    const save = () => {
        if (!hasStrokes) return;
        onSignature(canvasRef.current.toDataURL('image/png'));
    };

    return (
        <div>
            <canvas ref={canvasRef} style={{ width: '100%', height, border: '2px solid #e5e7eb', borderRadius: 12, touchAction: 'none', userSelect: 'none', cursor: 'crosshair', background: '#fff' }}
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={clear} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer' }}>Limpar</button>
                <button onClick={save} disabled={!hasStrokes} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: hasStrokes ? '#2563eb' : '#94a3b8', color: '#fff', fontSize: 13, fontWeight: 600, cursor: hasStrokes ? 'pointer' : 'not-allowed', flex: 1 }}>
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

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}><div style={{ width: 40, height: 40, border: `3px solid ${cor1}20`, borderTopColor: cor1, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>;
    if (error) return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc', padding: 24 }}>
            <AlertTriangle size={48} color="#ef4444" />
            <h2 style={{ marginTop: 16, color: '#1f2937', fontSize: 18 }}>{error}</h2>
        </div>
    );
    if (!data) return null;

    const nomeDoc = { contrato: 'Contrato', caderno_tecnico: 'Caderno Técnico', termo_entrega: 'Termo de Entrega' }[data.documento.tipo] || 'Documento';

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
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
                        <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: step > i + 1 ? '#22c55e' : step === i + 1 ? cor1 : '#e5e7eb', color: step >= i + 1 ? '#fff' : '#9ca3af' }}>
                            {step > i + 1 ? '✓' : i + 1}
                        </div>
                        <span style={{ fontSize: 10, color: step === i + 1 ? cor1 : '#9ca3af', fontWeight: step === i + 1 ? 700 : 400, display: i < 4 ? 'none' : 'none' }}>{l}</span>
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
                            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Proposta {data.proposta.numero}</p>
                        </div>
                        <div style={{ background: '#f0f9ff', borderRadius: 12, padding: 16, marginBottom: 24 }}>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>Signatário</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{data.signatario.nome}</div>
                            <div style={{ fontSize: 12, color: cor2, fontWeight: 600, textTransform: 'uppercase' }}>{data.signatario.papel}</div>
                        </div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Informe seu CPF para continuar</label>
                        <input type="text" value={cpf} onChange={e => { setCpf(formatCPF(e.target.value)); setCpfError(''); }} placeholder="000.000.000-00" maxLength={14}
                            style={{ width: '100%', padding: '12px 16px', fontSize: 18, borderRadius: 12, border: `2px solid ${cpfError ? '#ef4444' : '#e5e7eb'}`, outline: 'none', textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', boxSizing: 'border-box' }}
                            onKeyDown={e => e.key === 'Enter' && validarEAvancar()} />
                        {cpfError && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4, textAlign: 'center' }}>{cpfError}</div>}
                        <button onClick={validarEAvancar} disabled={cpf.replace(/\D/g, '').length < 11}
                            style={{ width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none', background: cpf.replace(/\D/g, '').length >= 11 ? cor1 : '#d1d5db', color: '#fff', fontSize: 15, fontWeight: 700, cursor: cpf.replace(/\D/g, '').length >= 11 ? 'pointer' : 'not-allowed' }}>
                            Continuar
                        </button>
                    </div>
                )}

                {/* Step 2: Documento */}
                {step === 2 && (
                    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>Leia o documento</h3>
                            <p style={{ fontSize: 11, color: '#6b7280' }}>Leia integralmente antes de assinar</p>
                        </div>
                        <iframe ref={iframeRef} srcDoc={data.documento.html} style={{ width: '100%', height: 500, border: 'none' }} title="Documento" />
                        <div style={{ padding: 16, borderTop: '1px solid #e5e7eb' }}>
                            <button onClick={() => setStep(3)} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: cor1, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
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
                            <p style={{ fontSize: 12, color: '#6b7280' }}>Use o dedo (celular) ou mouse (computador)</p>
                        </div>
                        <SignatureCanvas onSignature={(img) => { setSignatureImg(img); if (img) setStep(4); }} height={180} />
                    </div>
                )}

                {/* Step 4: Confirmação */}
                {step === 4 && (
                    <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', marginBottom: 16 }}>Confirmar Assinatura</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>Signatário</div>
                                <div style={{ fontSize: 15, fontWeight: 600 }}>{data.signatario.nome}</div>
                                <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>CPF: {formatCPF(cpf)}</div>
                            </div>
                            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>Documento</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{nomeDoc} — {data.proposta.numero}</div>
                                <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>Hash: {data.documento.hash.slice(0, 16)}...</div>
                            </div>
                            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>Sua assinatura</div>
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
                                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: aceite ? '#22c55e' : '#d1d5db', color: '#fff', fontSize: 15, fontWeight: 700, cursor: aceite ? 'pointer' : 'not-allowed' }}>
                                {submitting ? 'Assinando...' : '✎ Assinar Documento'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 5: Sucesso */}
                {step === 5 && resultado && (
                    <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <CheckCircle2 size={36} color="#22c55e" />
                        </div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1f2937' }}>Documento Assinado!</h2>
                        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>Sua assinatura foi registrada com sucesso.</p>

                        <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 20, marginTop: 24 }}>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>Código de verificação</div>
                            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, color: '#166534', fontFamily: 'monospace', marginTop: 4 }}>{resultado.codigo_verificacao}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                                Verifique em: <a href={`/verificar/${resultado.codigo_verificacao}`} style={{ color: cor1 }}>{window.location.origin}/verificar/{resultado.codigo_verificacao}</a>
                            </div>
                        </div>

                        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginTop: 16, textAlign: 'left' }}>
                            <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                Hash da assinatura: {resultado.hash_assinatura}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20, color: '#9ca3af', fontSize: 10 }}>
                            <Shield size={12} />
                            <span>Assinatura eletrônica — Lei 14.063/2020</span>
                        </div>
                    </div>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
