import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../auth';
import { Ic } from '../ui';
import { applyPrimaryColor } from '../theme';

// ═══════════════════════════════════════════════════════════
// Technical drawing: aparador 1600 × 450 × 900 mm
// 4 vistas: PLANTA (topo) · FRENTE · LATERAL · ISOMETRIA
// ═══════════════════════════════════════════════════════════

// — Helpers pra gerar <line/rect/circle> com o ritmo de desenho —
const BP = ({ el: El = 'line', d = 0, w = 0.9, ...rest }) => (
    <El pathLength={1000} className="bp-draw" strokeWidth={w} style={{ animationDelay: `${d}s` }} {...rest} />
);

// ── PLANTA (vista superior) ───────────────────────────────────
function Planta() {
    // Aparador 1600x450 → viewBox 400x220
    return (
        <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid meet" className="bp-svg">
            <g stroke="#B8935A" fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* Contorno externo */}
                <BP el="rect" d={0.00} w={1.2} x={40} y={50} width={320} height={90} />
                {/* Divisoes (3 modulos) */}
                <BP el="line" d={0.40} x1={146.67} y1={50}  x2={146.67} y2={140} />
                <BP el="line" d={0.55} x1={253.33} y1={50}  x2={253.33} y2={140} />
                {/* Indicacao de veio da madeira (hachuras finas) */}
                <BP el="line" d={0.70} w={0.4} x1={55}  y1={78}  x2={135} y2={78} />
                <BP el="line" d={0.73} w={0.4} x1={55}  y1={95}  x2={135} y2={95} />
                <BP el="line" d={0.76} w={0.4} x1={55}  y1={112} x2={135} y2={112} />
                <BP el="line" d={0.80} w={0.4} x1={160} y1={78}  x2={240} y2={78} />
                <BP el="line" d={0.83} w={0.4} x1={160} y1={95}  x2={240} y2={95} />
                <BP el="line" d={0.86} w={0.4} x1={160} y1={112} x2={240} y2={112} />
                <BP el="line" d={0.90} w={0.4} x1={265} y1={78}  x2={345} y2={78} />
                <BP el="line" d={0.93} w={0.4} x1={265} y1={95}  x2={345} y2={95} />
                <BP el="line" d={0.96} w={0.4} x1={265} y1={112} x2={345} y2={112} />
                {/* Indicadores centrais de gaveta */}
                <BP el="circle" d={1.05} cx={93}  cy={95} r={2.5} />
                <BP el="circle" d={1.08} cx={200} cy={95} r={2.5} />
                <BP el="circle" d={1.12} cx={307} cy={95} r={2.5} />
                {/* Cota largura */}
                <BP el="line" d={1.25} w={0.5} x1={40}  y1={165} x2={360} y2={165} />
                <BP el="line" d={1.28} w={0.5} x1={40}  y1={160} x2={40}  y2={170} />
                <BP el="line" d={1.28} w={0.5} x1={360} y1={160} x2={360} y2={170} />
                {/* Cota profundidade */}
                <BP el="line" d={1.35} w={0.5} x1={380} y1={50}  x2={380} y2={140} />
                <BP el="line" d={1.38} w={0.5} x1={375} y1={50}  x2={385} y2={50} />
                <BP el="line" d={1.38} w={0.5} x1={375} y1={140} x2={385} y2={140} />
            </g>
            <g className="bp-label" fill="#B8935A" fontFamily="ui-monospace, Menlo, monospace">
                <text x={200} y={180} fontSize="9" letterSpacing="1" textAnchor="middle">1600 mm</text>
                <text x={378} y={98}  fontSize="9" letterSpacing="1" textAnchor="end">450 mm</text>
            </g>
        </svg>
    );
}

// ── ELEVACAO FRONTAL ────────────────────────────────────────────
function Frente() {
    // Aparador 1600x900 → viewBox 400x260
    return (
        <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid meet" className="bp-svg">
            <g stroke="#B8935A" fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* Caixa */}
                <BP el="rect" d={1.5} w={1.3} x={40} y={30} width={320} height={180} />
                {/* Tampo indicado por linha superior offset */}
                <BP el="line" d={1.6} w={0.55} x1={35}  y1={30} x2={365} y2={30} />
                {/* Divisao gavetas / portas */}
                <BP el="line" d={1.75} w={0.9} x1={40} y1={75} x2={360} y2={75} />
                {/* Gavetas (3) */}
                <BP el="line" d={1.85} x1={146.67} y1={30} x2={146.67} y2={75} />
                <BP el="line" d={1.88} x1={253.33} y1={30} x2={253.33} y2={75} />
                {/* Puxadores gavetas */}
                <BP el="line" d={2.00} w={1.3} x1={84}  y1={52} x2={102} y2={52} />
                <BP el="line" d={2.02} w={1.3} x1={191} y1={52} x2={209} y2={52} />
                <BP el="line" d={2.04} w={1.3} x1={298} y1={52} x2={316} y2={52} />
                {/* Portas (3 modulos) */}
                <BP el="line" d={2.10} x1={146.67} y1={75} x2={146.67} y2={200} />
                <BP el="line" d={2.13} x1={253.33} y1={75} x2={253.33} y2={200} />
                {/* Puxadores porta (bolas) */}
                <BP el="circle" d={2.25} cx={140}    cy={135} r={1.8} />
                <BP el="circle" d={2.27} cx={153.3}  cy={135} r={1.8} />
                <BP el="circle" d={2.29} cx={246.7}  cy={135} r={1.8} />
                <BP el="circle" d={2.31} cx={260}    cy={135} r={1.8} />
                {/* Plinto / pés */}
                <BP el="line" d={2.40} w={0.9} x1={40}  y1={200} x2={360} y2={200} />
                <BP el="rect" d={2.45} x={55}  y={210} width={24} height={10} />
                <BP el="rect" d={2.47} x={321} y={210} width={24} height={10} />
                {/* Cotas */}
                <BP el="line" d={2.55} w={0.5} x1={40}  y1={238} x2={360} y2={238} />
                <BP el="line" d={2.58} w={0.5} x1={40}  y1={233} x2={40}  y2={243} />
                <BP el="line" d={2.58} w={0.5} x1={360} y1={233} x2={360} y2={243} />
                <BP el="line" d={2.65} w={0.5} x1={380} y1={30}  x2={380} y2={210} />
                <BP el="line" d={2.68} w={0.5} x1={375} y1={30}  x2={385} y2={30} />
                <BP el="line" d={2.68} w={0.5} x1={375} y1={210} x2={385} y2={210} />
            </g>
            <g className="bp-label" fill="#B8935A" fontFamily="ui-monospace, Menlo, monospace">
                <text x={200} y={252} fontSize="9" letterSpacing="1" textAnchor="middle">1600 mm</text>
                <text x={378} y={125} fontSize="9" letterSpacing="1" textAnchor="end">900 mm</text>
            </g>
        </svg>
    );
}

// ── VISTA LATERAL ───────────────────────────────────────────────
function Lateral() {
    // 450x900 → viewBox 200x260
    return (
        <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid meet" className="bp-svg">
            <g stroke="#B8935A" fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* Tampo saliente */}
                <BP el="line" d={3.0} w={0.55} x1={55} y1={30} x2={145} y2={30} />
                {/* Caixa principal */}
                <BP el="rect" d={3.1} w={1.3} x={60} y={30} width={80} height={170} />
                {/* Divisao gaveta/porta */}
                <BP el="line" d={3.25} w={0.9} x1={60} y1={75} x2={140} y2={75} />
                {/* Puxador gaveta (lado) */}
                <BP el="line" d={3.35} w={1.2} x1={80} y1={52} x2={92} y2={52} />
                {/* Puxador porta (bola) */}
                <BP el="circle" d={3.45} cx={72} cy={135} r={1.8} />
                {/* Plinto + pés */}
                <BP el="line" d={3.55} w={0.9} x1={60} y1={200} x2={140} y2={200} />
                <BP el="rect" d={3.60} x={63}  y={210} width={14} height={10} />
                <BP el="rect" d={3.62} x={123} y={210} width={14} height={10} />
                {/* Cotas */}
                <BP el="line" d={3.75} w={0.5} x1={60}  y1={238} x2={140} y2={238} />
                <BP el="line" d={3.78} w={0.5} x1={60}  y1={233} x2={60}  y2={243} />
                <BP el="line" d={3.78} w={0.5} x1={140} y1={233} x2={140} y2={243} />
                <BP el="line" d={3.85} w={0.5} x1={170} y1={30}  x2={170} y2={210} />
                <BP el="line" d={3.88} w={0.5} x1={165} y1={30}  x2={175} y2={30} />
                <BP el="line" d={3.88} w={0.5} x1={165} y1={210} x2={175} y2={210} />
            </g>
            <g className="bp-label" fill="#B8935A" fontFamily="ui-monospace, Menlo, monospace">
                <text x={100} y={252} fontSize="9" letterSpacing="1" textAnchor="middle">450 mm</text>
                <text x={168} y={125} fontSize="9" letterSpacing="1" textAnchor="end">900 mm</text>
            </g>
        </svg>
    );
}

// ── ISOMETRIA ──────────────────────────────────────────────────
function Isometria() {
    // W=160 D=45 H=90, projecao isometrica 30/30
    // 3D → 2D: screen = (x*0.866 - y*0.866, x*0.5 + y*0.5 - z)  + offset
    const COS = 0.866, SIN = 0.5;
    const W = 160, D = 45, H = 90;
    const OX = 60, OY = 100; // offset
    const P = (x, y, z) => [OX + x * COS - y * COS, OY + x * SIN + y * SIN - z];
    const [p0, p1, p2, p3, p4, p5, p6, p7] = [
        P(0, 0, 0), P(W, 0, 0), P(W, D, 0), P(0, D, 0),
        P(0, 0, H), P(W, 0, H), P(W, D, H), P(0, D, H),
    ];
    // Proporcoes internas (gavetas + portas) na face frontal (plano z de 0 a H, x de 0 a W, y=0)
    const frontAt = (x, z) => P(x, 0, z);
    const rightAt = (y, z) => P(W, y, z);
    const topAt = (x, y) => P(x, y, H);
    const divZ = 45; // altura divisao gaveta/porta (mm equivalente)
    const divX1 = W / 3, divX2 = 2 * W / 3;
    // Puxadores gaveta (linha horizontal na face frontal, centralizada na gaveta)
    const gavPx = (cx) => {
        const [x1, y1] = frontAt(cx - 8, H - 22);
        const [x2, y2] = frontAt(cx + 8, H - 22);
        return { x1, y1, x2, y2 };
    };
    const g1 = gavPx(W / 6), g2 = gavPx(W / 2), g3 = gavPx(5 * W / 6);
    // Puxadores porta (bola)
    const porta = (cx, cz) => {
        const [x, y] = frontAt(cx, cz);
        return { cx: x, cy: y };
    };
    const dk1 = porta(divX1 - 5, divZ / 2);
    const dk2 = porta(divX1 + 5, divZ / 2);
    const dk3 = porta(divX2 - 5, divZ / 2);
    const dk4 = porta(divX2 + 5, divZ / 2);

    return (
        <svg viewBox="0 0 300 260" preserveAspectRatio="xMidYMid meet" className="bp-svg">
            <g stroke="#B8935A" fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* 9 arestas visiveis do box iso */}
                <BP el="line" d={4.5} w={1.3} x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} />
                <BP el="line" d={4.55} w={1.3} x1={p1[0]} y1={p1[1]} x2={p5[0]} y2={p5[1]} />
                <BP el="line" d={4.60} w={1.3} x1={p5[0]} y1={p5[1]} x2={p4[0]} y2={p4[1]} />
                <BP el="line" d={4.65} w={1.3} x1={p4[0]} y1={p4[1]} x2={p0[0]} y2={p0[1]} />
                <BP el="line" d={4.75} w={1.3} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} />
                <BP el="line" d={4.80} w={1.3} x1={p2[0]} y1={p2[1]} x2={p6[0]} y2={p6[1]} />
                <BP el="line" d={4.85} w={1.3} x1={p6[0]} y1={p6[1]} x2={p5[0]} y2={p5[1]} />
                <BP el="line" d={4.90} w={1.3} x1={p6[0]} y1={p6[1]} x2={p7[0]} y2={p7[1]} />
                <BP el="line" d={4.95} w={1.3} x1={p7[0]} y1={p7[1]} x2={p4[0]} y2={p4[1]} />
                {/* Divisao gaveta/porta (frontal) */}
                <BP el="line" d={5.1} x1={frontAt(0, H - divZ)[0]} y1={frontAt(0, H - divZ)[1]} x2={frontAt(W, H - divZ)[0]} y2={frontAt(W, H - divZ)[1]} />
                {/* Divisao gaveta/porta (lateral direita) */}
                <BP el="line" d={5.15} x1={rightAt(0, H - divZ)[0]} y1={rightAt(0, H - divZ)[1]} x2={rightAt(D, H - divZ)[0]} y2={rightAt(D, H - divZ)[1]} />
                {/* Verticais das divisoes de modulo na frente */}
                <BP el="line" d={5.25} x1={frontAt(divX1, 0)[0]} y1={frontAt(divX1, 0)[1]} x2={frontAt(divX1, H)[0]} y2={frontAt(divX1, H)[1]} />
                <BP el="line" d={5.30} x1={frontAt(divX2, 0)[0]} y1={frontAt(divX2, 0)[1]} x2={frontAt(divX2, H)[0]} y2={frontAt(divX2, H)[1]} />
                {/* Verticais no topo (divisoes de modulo no top) */}
                <BP el="line" d={5.35} w={0.7} x1={topAt(divX1, 0)[0]} y1={topAt(divX1, 0)[1]} x2={topAt(divX1, D)[0]} y2={topAt(divX1, D)[1]} />
                <BP el="line" d={5.40} w={0.7} x1={topAt(divX2, 0)[0]} y1={topAt(divX2, 0)[1]} x2={topAt(divX2, D)[0]} y2={topAt(divX2, D)[1]} />
                {/* Puxadores gavetas */}
                <BP el="line" d={5.55} w={1.4} x1={g1.x1} y1={g1.y1} x2={g1.x2} y2={g1.y2} />
                <BP el="line" d={5.58} w={1.4} x1={g2.x1} y1={g2.y1} x2={g2.x2} y2={g2.y2} />
                <BP el="line" d={5.61} w={1.4} x1={g3.x1} y1={g3.y1} x2={g3.x2} y2={g3.y2} />
                {/* Puxadores porta */}
                <BP el="circle" d={5.70} cx={dk1.cx} cy={dk1.cy} r={1.6} />
                <BP el="circle" d={5.72} cx={dk2.cx} cy={dk2.cy} r={1.6} />
                <BP el="circle" d={5.74} cx={dk3.cx} cy={dk3.cy} r={1.6} />
                <BP el="circle" d={5.76} cx={dk4.cx} cy={dk4.cy} r={1.6} />
                {/* Eixos de referencia (canto inferior esquerdo): X, Y, Z */}
                <BP el="line" d={6.0} w={0.5} x1={20} y1={230} x2={50} y2={215} />
                <BP el="line" d={6.05} w={0.5} x1={20} y1={230} x2={50} y2={245} />
                <BP el="line" d={6.10} w={0.5} x1={20} y1={230} x2={20} y2={195} />
            </g>
            <g className="bp-label" fill="#B8935A" fontFamily="ui-monospace, Menlo, monospace" fontSize="8" letterSpacing="1">
                <text x={55} y={213}>X</text>
                <text x={55} y={248}>Y</text>
                <text x={23} y={192}>Z</text>
            </g>
        </svg>
    );
}

// ── Cartela 2x2 ─────────────────────────────────────────────────
function FurnitureDrawings() {
    return (
        <div className="bp-grid" aria-hidden="true">
            <div className="bp-cell">
                <div className="bp-title">
                    <span className="bp-num">01</span>
                    <span>PLANTA</span>
                    <span className="bp-esc">ESC 1:25</span>
                </div>
                <Planta />
            </div>
            <div className="bp-cell">
                <div className="bp-title">
                    <span className="bp-num">02</span>
                    <span>ISOMETRIA</span>
                    <span className="bp-esc">ESC 1:30</span>
                </div>
                <Isometria />
            </div>
            <div className="bp-cell">
                <div className="bp-title">
                    <span className="bp-num">03</span>
                    <span>ELEVACAO FRONTAL</span>
                    <span className="bp-esc">ESC 1:25</span>
                </div>
                <Frente />
            </div>
            <div className="bp-cell">
                <div className="bp-title">
                    <span className="bp-num">04</span>
                    <span>VISTA LATERAL</span>
                    <span className="bp-esc">ESC 1:25</span>
                </div>
                <Lateral />
            </div>

            {/* Marca d'agua diagonal */}
            <div className="bp-watermark">APARADOR ORNATO · 1600 × 450 × 900 mm</div>

            {/* Subtle glow atras do card (centralizado) */}
            <div className="bp-card-glow" />
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

    const handleCardMove = (e) => {
        const card = cardRef.current;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', `${x}%`);
        card.style.setProperty('--my', `${y}%`);
    };
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

    const cobre = useMemo(() => ({ r: 184, g: 147, b: 90, hex: '#B8935A' }), []);

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
        <div className="login-container login-container-marcenaria">
            <FurnitureDrawings />

            <div
                ref={cardRef}
                className={`login-glass login-glass-compact${success ? ' login-success' : ''}`}
                style={{ zIndex: 10 }}
                onMouseMove={handleCardMove}
            >
                <div className="text-center mb-6 login-logo-anim">
                    {logoSistema
                        ? <img src={logoSistema} alt="Logo" style={{
                            maxHeight: 56, maxWidth: 180, objectFit: 'contain', margin: '0 auto 8px',
                            filter: `drop-shadow(0 4px 14px rgba(${cobre.r},${cobre.g},${cobre.b},0.25))`,
                        }} />
                        : <h1 style={{
                            fontSize: 28, fontWeight: 800, marginBottom: 4,
                            color: '#f4ece0',
                            letterSpacing: '-0.03em',
                            textShadow: `0 2px 20px rgba(${cobre.r},${cobre.g},${cobre.b},0.35)`,
                        }}>{empNome}</h1>
                    }
                    <p style={{ fontSize: 11, color: 'rgba(201, 169, 110, 0.55)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                        Marcenaria · sistema de gestao
                    </p>
                </div>

                <div className="login-form-anim">
                    {err && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                            borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500,
                            background: 'rgba(220, 38, 38, 0.12)', color: '#f87171',
                            border: '1px solid rgba(220, 38, 38, 0.2)',
                        }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', flexShrink: 0, animation: 'pulse-dot 2s ease-in-out infinite' }} />
                            {err}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="login-field-anim">
                            <label htmlFor="login-email" style={{ fontSize: 10, fontWeight: 600, color: 'rgba(201, 169, 110, 0.75)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                                E-mail
                            </label>
                            <input
                                id="login-email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                autoFocus
                                autoComplete="email"
                            />
                        </div>
                        <div className="login-field-anim">
                            <label htmlFor="login-senha" style={{ fontSize: 10, fontWeight: 600, color: 'rgba(201, 169, 110, 0.75)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                                Senha
                            </label>
                            <input
                                id="login-senha"
                                type="password"
                                value={senha}
                                onChange={e => setSenha(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                            />
                        </div>
                        <button
                            ref={btnRef}
                            type="submit"
                            disabled={loading}
                            className="login-submit-btn"
                            style={{
                                width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                                background: 'linear-gradient(135deg, #C9A96E 0%, #B8935A 50%, #8E6A3C 100%)',
                                color: '#1a130b', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                                boxShadow: `0 4px 20px rgba(${cobre.r},${cobre.g},${cobre.b},0.35), inset 0 1px 0 rgba(255,255,255,0.25)`,
                                transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease',
                                marginTop: 2,
                                opacity: loading ? 0.7 : 1,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                willChange: 'transform',
                                fontFamily: 'ui-monospace, Menlo, monospace',
                            }}
                            onMouseMove={handleBtnMove}
                            onMouseLeave={handleBtnLeave}
                        >
                            {success ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a130b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: 'check-draw 0.4s ease-out forwards' }} />
                                    </svg>
                                    Entrando
                                </span>
                            ) : loading ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <div style={{
                                        width: 14, height: 14, border: '2px solid rgba(26,19,11,0.25)',
                                        borderTopColor: '#1a130b', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                                    }} />
                                    Autenticando
                                </span>
                            ) : 'Entrar'}
                        </button>
                    </form>
                </div>

                <div style={{ marginTop: 18, textAlign: 'center' }}>
                    <button
                        onClick={() => setDark(!dark)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 10, padding: '5px 12px', borderRadius: 7,
                            cursor: 'pointer', background: 'rgba(184, 147, 90, 0.06)',
                            border: '1px solid rgba(184, 147, 90, 0.12)', color: 'rgba(201, 169, 110, 0.6)',
                            transition: 'all 0.2s', letterSpacing: '0.08em', textTransform: 'uppercase',
                            fontFamily: 'ui-monospace, Menlo, monospace',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(184, 147, 90, 0.12)'; e.currentTarget.style.color = 'rgba(201, 169, 110, 0.9)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(184, 147, 90, 0.06)'; e.currentTarget.style.color = 'rgba(201, 169, 110, 0.6)'; }}
                    >
                        {dark ? <Ic.Sun /> : <Ic.Moon />}
                        {dark ? 'Modo Claro' : 'Modo Escuro'}
                    </button>
                </div>
            </div>
        </div>
    );
}
