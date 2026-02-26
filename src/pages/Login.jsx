import { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Z, Ic } from '../ui';

export default function LoginPage({ dark, setDark, logoSistema: logoProp, empNome: nomeProp }) {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [logoSistema, setLogoSistema] = useState(logoProp || localStorage.getItem('logo_sistema') || '');
    const [empNome, setEmpNome] = useState(nomeProp || localStorage.getItem('emp_nome') || 'Ornato');

    // Buscar config pública (sem autenticação) para pegar logo e nome
    useEffect(() => {
        if (logoProp !== undefined) return; // já recebeu via prop
        fetch('/api/config/empresa/public')
            .then(r => r.json())
            .then(d => {
                if (d.logo_sistema) { setLogoSistema(d.logo_sistema); localStorage.setItem('logo_sistema', d.logo_sistema); }
                if (d.nome) { setEmpNome(d.nome); localStorage.setItem('emp_nome', d.nome); }
            })
            .catch(() => {});
    }, [logoProp]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !senha) { setErr('Preencha todos os campos'); return; }
        setLoading(true); setErr('');
        try { await login(email, senha); }
        catch (ex) { setErr(ex.error || 'Erro ao fazer login'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-body)' }}>
            <div className="w-full max-w-[380px] px-5">
                {/* Logo */}
                <div className="text-center mb-8">
                    {logoSistema
                        ? <img src={logoSistema} alt="Logo" style={{ maxHeight: 80, maxWidth: 220, objectFit: 'contain', margin: '0 auto 12px' }} />
                        : <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{empNome}</h1>
                    }
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Sistema de gestão para marcenaria</p>
                </div>

                {/* Card */}
                <div className="glass-card p-6">
                    <h2 className="font-semibold text-base mb-5 text-center" style={{ color: 'var(--text-primary)' }}>Acessar conta</h2>

                    {err && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs font-medium" style={{ background: 'rgba(220,38,38,0.08)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.15)' }}>
                            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />
                            {err}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className={Z.lbl}>E-mail</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={Z.inp} placeholder="seu@email.com" autoFocus />
                        </div>
                        <div>
                            <label className={Z.lbl}>Senha</label>
                            <input type="password" value={senha} onChange={e => setSenha(e.target.value)} className={Z.inp} placeholder="••••••••" />
                        </div>
                        <button type="submit" disabled={loading} className={`w-full ${Z.btn} py-2.5 text-sm`}>
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Autenticando...
                                </span>
                            ) : 'Entrar'}
                        </button>
                    </form>
                </div>

                {/* Theme toggle */}
                <div className="mt-4 flex justify-center">
                    <button onClick={() => setDark(!dark)} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                        {dark ? <Ic.Sun /> : <Ic.Moon />}
                        {dark ? 'Modo Claro' : 'Modo Escuro'}
                    </button>
                </div>
            </div>
        </div>
    );
}
