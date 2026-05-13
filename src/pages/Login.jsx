import { useEffect, useRef, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Loader2,
    LockKeyhole,
    Mail,
    Moon,
    Sun,
} from 'lucide-react';
import { useAuth } from '../auth';
import { applyPrimaryColor } from '../theme';

function BrandIdentity({ brandLogo, empNome, compact = false }) {
    const label = (empNome || 'Ornato').trim();
    const initials = label.slice(0, 2).toUpperCase();
    const [imageFailed, setImageFailed] = useState(false);
    const showLogo = Boolean(brandLogo) && !imageFailed;

    useEffect(() => {
        setImageFailed(false);
    }, [brandLogo]);

    return (
        <div className={`login-brand-lockup${showLogo ? ' login-brand-lockup-logo' : ''}${compact ? ' login-brand-lockup-compact' : ''}`}>
            {showLogo ? (
                <>
                    <div className="login-brand-company-logo">
                        <img src={brandLogo} alt={label} onError={() => setImageFailed(true)} />
                    </div>
                    <span className="login-brand-subtitle">Sistema interno</span>
                </>
            ) : (
                <>
                    <div className="login-brand-mark" aria-hidden="true">
                        <span>{initials}</span>
                    </div>
                    <div className="login-brand-text">
                        <strong>{label}</strong>
                        <span>Sistema interno</span>
                    </div>
                </>
            )}
        </div>
    );
}

function LoginAmbient() {
    return (
        <div className="login-ambient" aria-hidden="true">
            <div className="login-grid-layer" />
            <div className="login-scan-layer" />
            <div className="login-noise-layer" />

            <svg className="login-cad-svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="loginLine" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.20" />
                        <stop offset="48%" stopColor="var(--accent)" stopOpacity="0.42" />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.16" />
                    </linearGradient>
                    <linearGradient id="loginPanelFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--bg-elevated)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--bg-card)" stopOpacity="0.04" />
                    </linearGradient>
                    <linearGradient id="loginFlowLine" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
                        <stop offset="35%" stopColor="var(--primary)" stopOpacity="0.34" />
                        <stop offset="68%" stopColor="var(--accent)" stopOpacity="0.46" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                </defs>

                <g className="login-cad-field login-cad-field-a">
                    <path pathLength="1" d="M115 210 H415 V395 H115 Z" />
                    <path pathLength="1" d="M115 260 H415 M215 210 V395 M315 210 V395" />
                    <path pathLength="1" d="M140 430 H390 M140 454 H332 M140 478 H372" />
                    <path pathLength="1" d="M96 530 C174 480 238 566 315 518 S470 505 530 560" />
                </g>

                <g className="login-cad-field login-cad-field-b">
                    <path pathLength="1" d="M1000 185 L1190 285 L1190 520 L1000 420 Z" />
                    <path pathLength="1" d="M1190 285 L1300 220 L1300 455 L1190 520" />
                    <path pathLength="1" d="M1000 185 L1110 120 L1300 220" />
                    <path pathLength="1" d="M1058 216 V448 M1124 251 V483 M1250 250 V486" />
                    <path pathLength="1" d="M1024 486 H1286 M1060 522 H1238" />
                </g>

                <g className="login-cad-field login-cad-field-c">
                    <rect x="820" y="620" width="330" height="120" rx="10" fill="url(#loginPanelFill)" />
                    <path pathLength="1" d="M850 675 H1120 M850 707 H1070 M850 648 H945" />
                    <path pathLength="1" d="M850 742 C910 716 962 758 1022 730 S1116 711 1150 742" />
                    <circle cx="1134" cy="650" r="10" />
                </g>

                <g className="login-flow-field login-flow-field-a">
                    <path pathLength="1" d="M74 760 H330 C404 760 392 678 466 678 H610" />
                    <path pathLength="1" d="M170 118 H468 C544 118 522 208 604 208 H704" />
                    <circle cx="466" cy="678" r="5" />
                    <circle cx="604" cy="208" r="5" />
                </g>

                <g className="login-flow-field login-flow-field-b">
                    <path pathLength="1" d="M810 128 H1115 C1190 128 1166 84 1242 84 H1376" />
                    <path pathLength="1" d="M708 802 H916 C998 802 992 708 1078 708 H1340" />
                    <circle cx="1115" cy="128" r="5" />
                    <circle cx="1078" cy="708" r="5" />
                </g>
            </svg>

            <div className="login-data-card login-data-card-a">
                <span>Projetos</span>
                <strong>24</strong>
                <i />
            </div>
            <div className="login-data-card login-data-card-b">
                <span>CNC</span>
                <strong>98%</strong>
                <i />
            </div>
            <div className="login-data-card login-data-card-c">
                <span>Pipeline</span>
                <strong>R$ 1.2M</strong>
                <i />
            </div>

            <div className="login-signal-cloud">
                <div className="login-signal-badge login-signal-orc">
                    <span>Orçamentos</span>
                    <strong>18 abertos</strong>
                </div>
                <div className="login-signal-badge login-signal-prod">
                    <span>Produção</span>
                    <strong>12 OS</strong>
                </div>
                <div className="login-signal-badge login-signal-fin">
                    <span>Financeiro</span>
                    <strong>94% em dia</strong>
                </div>
                <div className="login-signal-badge login-signal-est">
                    <span>Estoque</span>
                    <strong>3 alertas</strong>
                </div>
                <div className="login-signal-badge login-signal-ia">
                    <span>Assistente IA</span>
                    <strong>Ativa</strong>
                </div>
                <div className="login-signal-badge login-signal-wa">
                    <span>WhatsApp</span>
                    <strong>7 novas</strong>
                </div>
            </div>

            <div className="login-module-strip">
                <span>CRM</span>
                <span>ORC</span>
                <span>CNC</span>
                <span>FIN</span>
                <span>EST</span>
                <span>OS</span>
                <span>IA</span>
            </div>
        </div>
    );
}

export default function LoginPage({ dark, setDark, logoSistema: logoProp, empNome: nomeProp }) {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [logoSistema, setLogoSistema] = useState(logoProp || localStorage.getItem('logo_sistema') || '');
    const [logoEmpresa, setLogoEmpresa] = useState(localStorage.getItem('logo_empresa') || '');
    const [empNome, setEmpNome] = useState(nomeProp || localStorage.getItem('emp_nome') || 'Ornato');
    const panelRef = useRef(null);

    useEffect(() => {
        if (logoProp) setLogoSistema(logoProp);
        if (nomeProp) setEmpNome(nomeProp);
    }, [logoProp, nomeProp]);

    useEffect(() => {
        let alive = true;

        fetch('/api/config/empresa/public')
            .then(r => r.json())
            .then(d => {
                if (!alive) return;
                const publicLogo = d.logo_login || d.logo_header_path || d.logo_empresa || d.logo_sistema || '';
                const hasLogoConfig = ['logo_login', 'logo_header_path', 'logo_empresa', 'logo_sistema']
                    .some(key => Object.prototype.hasOwnProperty.call(d, key));
                if (hasLogoConfig) {
                    setLogoEmpresa(publicLogo);
                    localStorage.setItem('logo_empresa', publicLogo);
                }
                if (Object.prototype.hasOwnProperty.call(d, 'logo_sistema')) {
                    setLogoSistema(d.logo_sistema || '');
                    localStorage.setItem('logo_sistema', d.logo_sistema || '');
                }
                if (d.nome) {
                    setEmpNome(d.nome);
                    localStorage.setItem('emp_nome', d.nome);
                }
                if (d.sistema_cor_primaria) {
                    applyPrimaryColor(d.sistema_cor_primaria);
                }
            })
            .catch(() => {});

        return () => { alive = false; };
    }, []);

    const brandLogo = logoEmpresa || logoSistema;

    const shakePanel = () => {
        if (!panelRef.current) return;
        panelRef.current.classList.remove('login-shake');
        void panelRef.current.offsetWidth;
        panelRef.current.classList.add('login-shake');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email.trim() || !senha) {
            setErr('Preencha e-mail e senha para continuar.');
            shakePanel();
            return;
        }

        setLoading(true);
        setErr('');

        try {
            await login(email.trim(), senha);
            setSuccess(true);
        } catch (ex) {
            setErr(ex.error || 'Nao foi possivel entrar com esses dados.');
            shakePanel();
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-shell login-shell-clean">
            <LoginAmbient />

            <section className="login-main login-main-clean" aria-label="Login">
                <div className="login-brand-top">
                    <BrandIdentity brandLogo={brandLogo} empNome={empNome} />
                </div>

                <div ref={panelRef} className={`login-panel${success ? ' login-success' : ''}`}>
                    <div className="login-panel-header">
                        <div className="login-panel-icon" aria-hidden="true">
                            <LockKeyhole size={18} />
                        </div>
                        <div>
                            <p className="login-eyebrow">Acesso restrito</p>
                            <h1>Entrar no sistema</h1>
                            <p>Use seu e-mail e senha cadastrados.</p>
                        </div>
                    </div>

                    {err && (
                        <div className="login-error" role="alert">
                            <AlertCircle size={15} />
                            <span>{err}</span>
                        </div>
                    )}

                    <form className="login-form" onSubmit={handleSubmit} noValidate>
                        <div className="login-field">
                            <label htmlFor="login-email">E-mail</label>
                            <div className="login-input-wrap">
                                <Mail className="login-input-icon" size={15} aria-hidden="true" />
                                <input
                                    id="login-email"
                                    className="input-glass login-input"
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    autoFocus
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div className="login-field">
                            <label htmlFor="login-senha">Senha</label>
                            <div className="login-input-wrap">
                                <LockKeyhole className="login-input-icon" size={15} aria-hidden="true" />
                                <input
                                    id="login-senha"
                                    className="input-glass login-input"
                                    type="password"
                                    value={senha}
                                    onChange={e => setSenha(e.target.value)}
                                    placeholder="Digite sua senha"
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn-primary login-submit-btn"
                            disabled={loading}
                        >
                            {success ? (
                                <>
                                    <CheckCircle2 size={16} />
                                    Entrando
                                </>
                            ) : loading ? (
                                <>
                                    <Loader2 className="login-spin" size={16} />
                                    Autenticando
                                </>
                            ) : (
                                <>
                                    <LockKeyhole size={16} />
                                    Entrar
                                </>
                            )}
                        </button>
                    </form>

                    <div className="login-panel-footer">
                        <button
                            type="button"
                            className="btn-secondary login-theme-toggle"
                            onClick={() => setDark?.(!dark)}
                            aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                        >
                            {dark ? <Sun size={15} /> : <Moon size={15} />}
                            {dark ? 'Tema claro' : 'Tema escuro'}
                        </button>
                    </div>
                </div>
            </section>
        </main>
    );
}
