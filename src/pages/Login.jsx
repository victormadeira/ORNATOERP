import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../auth';
import { Ic } from '../ui';
import { applyPrimaryColor } from '../theme';

// ═══════════════════════════════════════════════════════════
// Animated Mesh Gradient Background
// ═══════════════════════════════════════════════════════════
function AnimatedBackground({ primaryColor }) {
    const canvasRef = useRef(null);

    // Parse primary color hex to RGB and derive orb palette
    const palette = useMemo(() => {
        const hex = primaryColor || '#1379F0';
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);

        // Derive variations
        const darker = [Math.round(r * 0.5), Math.round(g * 0.5), Math.round(b * 0.65)];
        const lighter = [Math.min(255, Math.round(r * 1.3)), Math.min(255, Math.round(g * 1.1)), Math.min(255, Math.round(b * 1.05))];
        const muted = [Math.round(r * 0.7), Math.round(g * 0.55), Math.round(b * 0.75)];
        const warm = [Math.min(255, r + 20), Math.max(0, g - 20), Math.round(b * 0.8)];
        // Fundo escuro derivado da primária (10% da cor, muito escuro)
        const bgDark = [Math.round(r * 0.08) + 4, Math.round(g * 0.08) + 4, Math.round(b * 0.10) + 8];

        return { base: [r, g, b], darker, lighter, muted, warm, bgDark };
    }, [primaryColor]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let frameId;
        let mounted = true;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Gradient orbs using brand colors
        const orbs = [
            { x: 0.3, y: 0.3, r: 0.45, color: palette.base, speed: 0.0003, phase: 0 },
            { x: 0.7, y: 0.7, r: 0.4, color: palette.darker, speed: 0.0004, phase: 2 },
            { x: 0.5, y: 0.2, r: 0.35, color: palette.lighter, speed: 0.0002, phase: 4 },
            { x: 0.2, y: 0.8, r: 0.3, color: palette.muted, speed: 0.00035, phase: 1 },
            { x: 0.8, y: 0.4, r: 0.28, color: palette.warm, speed: 0.00025, phase: 3 },
        ];

        function animate(time) {
            if (!mounted) return;
            const w = canvas.width;
            const h = canvas.height;

            // Dark base (derived from primary color)
            ctx.fillStyle = `rgb(${palette.bgDark[0]},${palette.bgDark[1]},${palette.bgDark[2]})`;
            ctx.fillRect(0, 0, w, h);

            // Draw orbs
            orbs.forEach(orb => {
                const cx = w * (orb.x + Math.sin(time * orb.speed + orb.phase) * 0.12);
                const cy = h * (orb.y + Math.cos(time * orb.speed * 0.8 + orb.phase) * 0.1);
                const radius = Math.min(w, h) * orb.r;

                const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                gradient.addColorStop(0, `rgba(${orb.color[0]}, ${orb.color[1]}, ${orb.color[2]}, 0.25)`);
                gradient.addColorStop(0.5, `rgba(${orb.color[0]}, ${orb.color[1]}, ${orb.color[2]}, 0.08)`);
                gradient.addColorStop(1, `rgba(${orb.color[0]}, ${orb.color[1]}, ${orb.color[2]}, 0)`);

                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, w, h);
            });

            // Subtle noise overlay via scattered micro-dots
            ctx.fillStyle = 'rgba(255, 255, 255, 0.008)';
            for (let i = 0; i < 40; i++) {
                const nx = Math.sin(time * 0.001 + i * 137.5) * 0.5 + 0.5;
                const ny = Math.cos(time * 0.001 + i * 137.5) * 0.5 + 0.5;
                ctx.beginPath();
                ctx.arc(nx * w, ny * h, 1, 0, Math.PI * 2);
                ctx.fill();
            }

            frameId = requestAnimationFrame(animate);
        }
        frameId = requestAnimationFrame(animate);

        return () => {
            mounted = false;
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', resize);
        };
    }, [palette]);

    return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
}

// ═══════════════════════════════════════════════════════════
// Floating geometric shapes (subtle)
// ═══════════════════════════════════════════════════════════
function FloatingShapes({ primaryColor }) {
    const color = primaryColor || '#1379F0';
    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden', pointerEvents: 'none' }}>
            {/* Geometric shapes — abstract wood panels / furniture silhouettes */}
            {[
                { w: 120, h: 8, x: '15%', y: '20%', rot: -12, delay: 0, dur: 18 },
                { w: 80, h: 6, x: '75%', y: '15%', rot: 25, delay: 2, dur: 22 },
                { w: 60, h: 60, x: '10%', y: '70%', rot: 45, delay: 4, dur: 20 },
                { w: 100, h: 4, x: '80%', y: '75%', rot: -8, delay: 1, dur: 16 },
                { w: 40, h: 40, x: '65%', y: '55%', rot: 15, delay: 3, dur: 24 },
                { w: 90, h: 6, x: '25%', y: '45%', rot: -20, delay: 5, dur: 19 },
                { w: 50, h: 3, x: '55%', y: '85%', rot: 10, delay: 2.5, dur: 21 },
                { w: 70, h: 5, x: '40%', y: '30%', rot: -5, delay: 1.5, dur: 17 },
            ].map((s, i) => (
                <div key={i} style={{
                    position: 'absolute',
                    left: s.x, top: s.y,
                    width: s.w, height: s.h,
                    borderRadius: s.w === s.h ? 4 : 3,
                    border: `1px solid ${color}14`,
                    background: `${color}08`,
                    transform: `rotate(${s.rot}deg)`,
                    animation: `float ${s.dur}s ease-in-out ${s.delay}s infinite`,
                    opacity: 0.6,
                }} />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// Login Page
// ═══════════════════════════════════════════════════════════
export default function LoginPage({ dark, setDark, logoSistema: logoProp, empNome: nomeProp }) {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [logoSistema, setLogoSistema] = useState(logoProp || localStorage.getItem('logo_sistema') || '');
    const [empNome, setEmpNome] = useState(nomeProp || localStorage.getItem('emp_nome') || 'Ornato');
    const [primaryColor, setPrimaryColor] = useState(() => localStorage.getItem('sistema_cor_primaria') || '#1379F0');
    const cardRef = useRef(null);
    const btnRef = useRef(null);

    // Cursor-aware spotlight: update CSS vars for radial-gradient position
    const handleCardMove = (e) => {
        const card = cardRef.current;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', `${x}%`);
        card.style.setProperty('--my', `${y}%`);
    };

    // Magnetic button: subtle pull toward cursor
    const handleBtnMove = (e) => {
        const btn = btnRef.current;
        if (!btn || loading) return;
        const rect = btn.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
        const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
        btn.style.transform = `translate(${x * 4}px, ${y * 3 - 2}px)`;
    };
    const handleBtnLeave = () => {
        const btn = btnRef.current;
        if (!btn) return;
        btn.style.transform = '';
    };

    // Derivar RGB da cor primária para usar em shadows/gradientes dinâmicos
    const rgb = useMemo(() => {
        const hex = primaryColor || '#1379F0';
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        // Versão mais clara para gradiente de texto
        const lr = Math.min(255, r + Math.round((255 - r) * 0.7));
        const lg = Math.min(255, g + Math.round((255 - g) * 0.7));
        const lb = Math.min(255, b + Math.round((255 - b) * 0.7));
        return { r, g, b, lr, lg, lb };
    }, [primaryColor]);

    useEffect(() => {
        if (logoProp) return;
        fetch('/api/config/empresa/public')
            .then(r => r.json())
            .then(d => {
                if (d.logo_sistema) { setLogoSistema(d.logo_sistema); localStorage.setItem('logo_sistema', d.logo_sistema); }
                if (d.nome) { setEmpNome(d.nome); localStorage.setItem('emp_nome', d.nome); }
                if (d.sistema_cor_primaria) {
                    setPrimaryColor(d.sistema_cor_primaria);
                    applyPrimaryColor(d.sistema_cor_primaria);
                }
            })
            .catch(() => {});
    }, [logoProp]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !senha) {
            setErr('Preencha todos os campos');
            // shake the card for feedback
            if (cardRef.current) {
                cardRef.current.classList.remove('login-shake');
                void cardRef.current.offsetWidth;
                cardRef.current.classList.add('login-shake');
            }
            return;
        }
        setLoading(true); setErr('');
        try {
            await login(email, senha);
            setSuccess(true);
        }
        catch (ex) {
            setErr(ex.error || 'Erro ao fazer login');
            if (cardRef.current) {
                cardRef.current.classList.remove('login-shake');
                void cardRef.current.offsetWidth;
                cardRef.current.classList.add('login-shake');
            }
        }
        finally { setLoading(false); }
    };

    return (
        <div className="login-container">
            {/* Animated gradient background using brand colors */}
            <AnimatedBackground primaryColor={primaryColor} />
            <FloatingShapes primaryColor={primaryColor} />

            {/* Subtle grid pattern */}
            <div style={{
                position: 'absolute', inset: 0, zIndex: 1,
                backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
                `,
                backgroundSize: '60px 60px',
                pointerEvents: 'none',
                maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
            }} />

            {/* Login Form */}
            <div
                ref={cardRef}
                className={`login-glass${success ? ' login-success' : ''}`}
                style={{ zIndex: 10 }}
                onMouseMove={handleCardMove}
            >
                {/* Logo */}
                <div className="text-center mb-8 login-logo-anim">
                    {logoSistema
                        ? <img src={logoSistema} alt="Logo" style={{
                            maxHeight: 70, maxWidth: 200, objectFit: 'contain', margin: '0 auto 12px',
                            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
                        }} />
                        : <h1 style={{
                            fontSize: 32, fontWeight: 800, marginBottom: 8,
                            color: '#f4ece0',
                            letterSpacing: '-0.03em',
                            textShadow: `0 2px 20px rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`,
                        }}>{empNome}</h1>
                    }
                    <p style={{ fontSize: 13, color: 'rgba(148, 163, 184, 0.6)', letterSpacing: '0.02em' }}>
                        Sistema de gestao para marcenaria
                    </p>
                </div>

                {/* Form */}
                <div className="login-form-anim">
                    <h2 style={{
                        fontWeight: 600, fontSize: 15, marginBottom: 24, textAlign: 'center',
                        color: 'rgba(241, 245, 249, 0.85)',
                    }}>Acessar conta</h2>

                    {err && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                            borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500,
                            background: 'rgba(220, 38, 38, 0.12)', color: '#f87171',
                            border: '1px solid rgba(220, 38, 38, 0.2)',
                        }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', flexShrink: 0, animation: 'pulse-dot 2s ease-in-out infinite' }} />
                            {err}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="login-field-anim">
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(148, 163, 184, 0.7)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                E-mail
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                autoFocus
                            />
                        </div>
                        <div className="login-field-anim">
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(148, 163, 184, 0.7)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Senha
                            </label>
                            <input
                                type="password"
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            ref={btnRef}
                            type="submit"
                            disabled={loading}
                            className="login-submit-btn"
                            style={{
                                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                                background: 'var(--primary-gradient)',
                                color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                                boxShadow: `0 4px 20px rgba(${rgb.r},${rgb.g},${rgb.b},0.35), inset 0 1px 0 rgba(255,255,255,0.15)`,
                                transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease',
                                marginTop: 4,
                                opacity: loading ? 0.7 : 1,
                                letterSpacing: '0.02em',
                                willChange: 'transform',
                            }}
                            onMouseMove={handleBtnMove}
                            onMouseLeave={handleBtnLeave}
                        >
                            {success ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'check-draw 0.4s ease-out forwards' }}>
                                        <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: 'check-draw 0.4s ease-out forwards' }} />
                                    </svg>
                                    Entrando...
                                </span>
                            ) : loading ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <div style={{
                                        width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)',
                                        borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                                    }} />
                                    Autenticando...
                                </span>
                            ) : 'Entrar'}
                        </button>
                    </form>
                </div>

                {/* Theme toggle */}
                <div style={{ marginTop: 24, textAlign: 'center' }}>
                    <button
                        onClick={() => setDark(!dark)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 11, padding: '6px 14px', borderRadius: 8,
                            cursor: 'pointer', background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(148, 163, 184, 0.5)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(148, 163, 184, 0.8)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(148, 163, 184, 0.5)'; }}
                    >
                        {dark ? <Ic.Sun /> : <Ic.Moon />}
                        {dark ? 'Modo Claro' : 'Modo Escuro'}
                    </button>
                </div>
            </div>
        </div>
    );
}
