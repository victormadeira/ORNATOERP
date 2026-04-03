// ═══════════════════════════════════════════════════════
// Página pública de download do plugin Ornato CNC
// Rota: /download — acessível sem login
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';

const ACCENT = '#C9A96E';

const CAT_LABELS = {
    cozinha: 'Cozinha', dormitorio: 'Dormitório', banheiro: 'Banheiro',
    escritorio: 'Escritório', closet: 'Closet', area_servico: 'Área de Serviço', comercial: 'Comercial',
};

const CAT_ICONS = {
    cozinha: '🍳', dormitorio: '🛏️', banheiro: '🚿', escritorio: '💼',
    closet: '👗', area_servico: '🧺', comercial: '🏪',
};

export default function PluginDownload() {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [biblioteca, setBiblioteca] = useState(null);
    const [libCat, setLibCat] = useState('cozinha');
    const [libSearch, setLibSearch] = useState('');
    const [libSelected, setLibSelected] = useState(null);
    const libRef = useRef(null);

    useEffect(() => {
        fetch('/api/plugin/latest')
            .then(r => r.json())
            .then(d => { setInfo(d); setLoading(false); })
            .catch(() => setLoading(false));
        fetch('/api/plugin/biblioteca')
            .then(r => r.json())
            .then(d => setBiblioteca(d))
            .catch(() => {});
    }, []);

    const libModules = (() => {
        if (!biblioteca?.moveis) return [];
        const all = Object.values(biblioteca.moveis).flatMap(c => c.modulos || []);
        const pool = libSearch
            ? all.filter(m => m.nome?.toLowerCase().includes(libSearch.toLowerCase()) || m.tags?.some(t => t.includes(libSearch.toLowerCase())))
            : (biblioteca.moveis[libCat]?.modulos || []);
        return pool;
    })();

    function handleDownload() {
        if (!info?.download_url) return;
        setDownloading(true);
        const a = document.createElement('a');
        a.href = info.download_url;
        a.download = info.filename || 'ornato_cnc.rbz';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => setDownloading(false), 2000);

        // Registrar download
        fetch('/api/plugin/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: info.version, os: navigator.platform }),
        }).catch(() => {});
    }

    const features = [
        { icon: '🔍', title: 'Detecção Automática', desc: 'Identifica peças, materiais e junções do modelo SketchUp automaticamente.' },
        { icon: '⚙️', title: '8 Regras de Furação', desc: 'Dobradiças, minifix, cavilha, System32, puxador, corrediça, fundo e prateleira.' },
        { icon: '📦', title: '15 Módulos Paramétricos', desc: 'Armários, gaveteiros, torres, nichos e mais — com dimensões configuráveis.' },
        { icon: '🔩', title: 'Ferragens 3D', desc: 'Visualize dobradiças, minifix e corrediças posicionadas no modelo em 3D.' },
        { icon: '✅', title: '15 Validações', desc: 'Verifica espessuras, cotas, peças soltas e inconsistências antes de exportar.' },
        { icon: '🔄', title: 'Sync com ERP', desc: 'Envia diretamente para o Ornato ERP — plano de corte, CNC e etiquetas.' },
    ];

    const steps = [
        { n: '01', title: 'Baixe o arquivo .rbz', desc: 'Clique no botão abaixo para baixar o arquivo de instalação do plugin.' },
        { n: '02', title: 'Instale no SketchUp', desc: 'Vá em Window → Extension Manager → Install Extension → selecione o .rbz.' },
        { n: '03', title: 'Acesse pelo menu', desc: 'O menu "Ornato CNC" aparece em Plugins. Use Ctrl+Shift+A para analisar.' },
    ];

    return (
        <div style={{ minHeight: '100vh', background: '#0F1117', color: '#E8E0D4', fontFamily: 'Inter, system-ui, sans-serif' }}>

            {/* ─── Header ─────────────────────────────── */}
            <header style={{ borderBottom: '1px solid #2A2A35', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, background: ACCENT, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#0F1117', fontSize: 18 }}>O</div>
                    <span style={{ fontWeight: 600, fontSize: 16, color: '#E8E0D4' }}>Ornato CNC</span>
                    <span style={{ fontSize: 12, color: '#666', background: '#1E1E28', padding: '2px 8px', borderRadius: 4 }}>SketchUp Plugin</span>
                </div>
                <a href="/" style={{ color: ACCENT, fontSize: 13, textDecoration: 'none' }}>← Acessar ERP</a>
            </header>

            {/* ─── Hero ───────────────────────────────── */}
            <section style={{ maxWidth: 800, margin: '0 auto', padding: '80px 32px 60px', textAlign: 'center' }}>
                <div style={{ display: 'inline-block', background: '#1E1E28', border: `1px solid ${ACCENT}40`, borderRadius: 20, padding: '4px 14px', fontSize: 12, color: ACCENT, marginBottom: 24, letterSpacing: 1 }}>
                    PLUGIN PARA SKETCHUP 2021+
                </div>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.1, margin: '0 0 20px', color: '#F0EAE0' }}>
                    Do modelo 3D ao<br />
                    <span style={{ color: ACCENT }}>plano de corte CNC</span>
                </h1>
                <p style={{ fontSize: 17, color: '#A09880', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 40px' }}>
                    O plugin Ornato detecta suas peças, gera furação automática e sincroniza direto com o ERP — tudo sem sair do SketchUp.
                </p>

                {/* Download Button */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <button
                        onClick={handleDownload}
                        disabled={loading || !info || downloading}
                        style={{
                            background: loading || !info ? '#333' : ACCENT,
                            color: '#0F1117',
                            border: 'none',
                            borderRadius: 10,
                            padding: '16px 40px',
                            fontSize: 17,
                            fontWeight: 700,
                            cursor: loading || !info ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            transition: 'opacity 0.15s',
                            opacity: downloading ? 0.7 : 1,
                        }}
                    >
                        <span style={{ fontSize: 20 }}>{downloading ? '⏳' : '⬇️'}</span>
                        {loading ? 'Carregando...' : downloading ? 'Baixando...' : `Baixar Plugin${info ? ` v${info.version}` : ''}`}
                    </button>
                    {info && (
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
                            <span>SketchUp {info.min_sketchup}+</span>
                            <span>•</span>
                            <span>Windows & Mac</span>
                            <span>•</span>
                            <span>Gratuito</span>
                        </div>
                    )}
                </div>
            </section>

            {/* ─── Features ───────────────────────────── */}
            <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 32px 80px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                    {features.map((f, i) => (
                        <div key={i} style={{ background: '#161820', border: '1px solid #2A2A35', borderRadius: 12, padding: '24px 20px' }}>
                            <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                            <div style={{ fontWeight: 600, fontSize: 15, color: '#F0EAE0', marginBottom: 6 }}>{f.title}</div>
                            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>{f.desc}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── Installation ───────────────────────── */}
            <section style={{ background: '#161820', borderTop: '1px solid #2A2A35', borderBottom: '1px solid #2A2A35', padding: '64px 32px' }}>
                <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
                    <h2 style={{ fontSize: 28, fontWeight: 700, color: '#F0EAE0', marginBottom: 8 }}>Instalação em 3 passos</h2>
                    <p style={{ fontSize: 14, color: '#666', marginBottom: 48 }}>Leva menos de 2 minutos para estar funcionando</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
                        {steps.map((s, i) => (
                            <div key={i}>
                                <div style={{ fontSize: 40, fontWeight: 800, color: ACCENT, opacity: 0.3, lineHeight: 1 }}>{s.n}</div>
                                <div style={{ fontWeight: 600, fontSize: 15, color: '#F0EAE0', margin: '8px 0 6px' }}>{s.title}</div>
                                <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>{s.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Requirements ───────────────────────── */}
            <section style={{ maxWidth: 800, margin: '0 auto', padding: '64px 32px' }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0EAE0', marginBottom: 24, textAlign: 'center' }}>Requisitos</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    {[
                        { label: 'SketchUp', value: `${info?.min_sketchup || '2021'} ou superior` },
                        { label: 'Sistema', value: 'Windows 10+ / macOS 10.15+' },
                        { label: 'RAM', value: '4 GB mínimo' },
                        { label: 'ERP Ornato', value: 'Conta ativa necessária para sync' },
                    ].map((r, i) => (
                        <div key={i} style={{ background: '#161820', border: '1px solid #2A2A35', borderRadius: 8, padding: '16px 20px' }}>
                            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{r.label}</div>
                            <div style={{ fontSize: 14, color: '#C8C0B4' }}>{r.value}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── FAQ ────────────────────────────────── */}
            <section style={{ background: '#161820', borderTop: '1px solid #2A2A35', padding: '64px 32px' }}>
                <div style={{ maxWidth: 700, margin: '0 auto' }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0EAE0', marginBottom: 32, textAlign: 'center' }}>Dúvidas frequentes</h2>
                    {[
                        { q: 'O plugin funciona offline?', a: 'A análise e furação funcionam offline. O sync com ERP e auto-update precisam de conexão.' },
                        { q: 'Como o plugin se atualiza?', a: 'Na inicialização do SketchUp, o plugin verifica automaticamente se há nova versão e oferece atualização com 1 clique.' },
                        { q: 'Precisa configurar o servidor do ERP?', a: 'Sim. Acesse Ornato CNC → Configurações e insira a URL do seu ERP para sincronizar.' },
                        { q: 'Funciona com todos os modelos SketchUp?', a: 'Funciona com modelos organizados em grupos ou componentes. Cada grupo é tratado como uma peça.' },
                    ].map((item, i) => (
                        <div key={i} style={{ borderBottom: '1px solid #2A2A35', padding: '20px 0' }}>
                            <div style={{ fontWeight: 600, fontSize: 15, color: '#F0EAE0', marginBottom: 8 }}>{item.q}</div>
                            <div style={{ fontSize: 14, color: '#888', lineHeight: 1.6 }}>{item.a}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── Changelog ──────────────────────────── */}
            {info?.changelog && (
                <section style={{ maxWidth: 700, margin: '0 auto', padding: '64px 32px' }}>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0EAE0', marginBottom: 16, textAlign: 'center' }}>
                        Novidades v{info.version}
                    </h2>
                    <div style={{ background: '#161820', border: '1px solid #2A2A35', borderRadius: 10, padding: '24px 28px' }}>
                        {info.changelog.split('\n').map((line, i) => (
                            <div key={i} style={{ fontSize: 13, color: line.startsWith('-') ? '#A09880' : '#666', padding: '3px 0', lineHeight: 1.5 }}>
                                {line || <br />}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ─── Biblioteca de Módulos ──────────────── */}
            <section id="biblioteca" style={{ borderTop: '1px solid #2A2A35', padding: '64px 32px' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <div style={{ display: 'inline-block', background: '#1E1E28', border: `1px solid ${ACCENT}40`, borderRadius: 20, padding: '4px 14px', fontSize: 12, color: ACCENT, marginBottom: 16, letterSpacing: 1 }}>
                            BIBLIOTECA REMOTA
                        </div>
                        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#F0EAE0', marginBottom: 8 }}>Módulos Paramétricos</h2>
                        <p style={{ fontSize: 14, color: '#666', maxWidth: 480, margin: '0 auto' }}>
                            A biblioteca fica no servidor — o plugin busca os módulos online, sempre atualizada sem precisar reinstalar.
                        </p>
                    </div>

                    {/* Search */}
                    <div style={{ marginBottom: 20 }}>
                        <input
                            value={libSearch}
                            onChange={e => setLibSearch(e.target.value)}
                            placeholder="Buscar módulo... (ex: balcão, gaveteiro, torre)"
                            style={{ width: '100%', background: '#161820', border: '1px solid #2A2A35', borderRadius: 8, padding: '10px 16px', color: '#E8E0D4', fontSize: 14, outline: 'none' }}
                        />
                    </div>

                    {/* Category tabs */}
                    {!libSearch && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                            {Object.entries(CAT_LABELS).map(([cat, label]) => {
                                const count = biblioteca?.moveis?.[cat]?.count || 0;
                                if (count === 0) return null;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setLibCat(cat)}
                                        style={{
                                            background: libCat === cat ? `${ACCENT}20` : '#161820',
                                            border: `1px solid ${libCat === cat ? ACCENT : '#2A2A35'}`,
                                            borderRadius: 20,
                                            padding: '6px 14px',
                                            color: libCat === cat ? ACCENT : '#888',
                                            fontSize: 13,
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                        }}
                                    >
                                        {CAT_ICONS[cat]} {label}
                                        <span style={{ fontSize: 11, opacity: 0.6 }}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Module grid */}
                    {!biblioteca ? (
                        <div style={{ textAlign: 'center', color: '#444', padding: 40 }}>Carregando biblioteca...</div>
                    ) : libModules.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#444', padding: 40 }}>Nenhum módulo encontrado.</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                            {libModules.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => setLibSelected(libSelected?.id === m.id ? null : m)}
                                    style={{
                                        background: libSelected?.id === m.id ? '#1E1E28' : '#161820',
                                        border: `1px solid ${libSelected?.id === m.id ? ACCENT : '#2A2A35'}`,
                                        borderRadius: 10,
                                        padding: '16px 14px',
                                        cursor: 'pointer',
                                        transition: 'border-color 0.15s',
                                    }}
                                >
                                    <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                                        {CAT_ICONS[m.categoria] || '📦'} {CAT_LABELS[m.categoria] || m.categoria}
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: '#F0EAE0', marginBottom: 4 }}>{m.nome}</div>
                                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>{m.descricao}</div>
                                    {m.tags && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                                            {m.tags.slice(0, 3).map(t => (
                                                <span key={t} style={{ fontSize: 10, background: '#1E1E28', border: '1px solid #333', borderRadius: 3, padding: '1px 5px', color: '#555' }}>{t}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Detail panel */}
                    {libSelected && (
                        <div style={{ marginTop: 20, background: '#161820', border: `1px solid ${ACCENT}40`, borderRadius: 12, padding: '24px 28px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 18, color: '#F0EAE0' }}>{libSelected.nome}</div>
                                    <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{libSelected.descricao}</div>
                                </div>
                                <button onClick={() => setLibSelected(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }}>×</button>
                            </div>
                            {libSelected.parametros && (
                                <div>
                                    <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Parâmetros</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                                        {Object.entries(libSelected.parametros).map(([key, val]) => (
                                            <div key={key} style={{ background: '#0F1117', border: '1px solid #2A2A35', borderRadius: 6, padding: '8px 10px' }}>
                                                <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase' }}>{key}</div>
                                                <div style={{ fontSize: 13, color: '#C8C0B4', marginTop: 2 }}>
                                                    {val.default !== undefined
                                                        ? `${val.default}${val.unidade ? ' ' + val.unidade : ''}`
                                                        : typeof val === 'boolean' ? (val ? 'sim' : 'não') : String(val)
                                                    }
                                                    {val.min !== undefined && <span style={{ color: '#555', fontSize: 10 }}> ({val.min}–{val.max})</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div style={{ marginTop: 16, fontSize: 12, color: '#555' }}>
                                ID do módulo: <code style={{ color: ACCENT, background: '#0F1117', padding: '1px 6px', borderRadius: 3 }}>{libSelected.id}</code>
                                <span style={{ marginLeft: 12 }}>— disponível via</span>
                                <code style={{ color: '#666', background: '#0F1117', padding: '1px 6px', borderRadius: 3, marginLeft: 6 }}>/api/plugin/biblioteca/moveis/{libSelected.id}</code>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* ─── Footer ─────────────────────────────── */}
            <footer style={{ borderTop: '1px solid #2A2A35', padding: '32px', textAlign: 'center', color: '#444', fontSize: 13 }}>
                <div style={{ marginBottom: 8 }}>
                    <span style={{ color: ACCENT, fontWeight: 600 }}>Ornato ERP</span> — Sistema de Gestão para Marcenarias
                </div>
                <div>
                    <a href="mailto:suporte@gestaoornato.com" style={{ color: '#666', textDecoration: 'none' }}>suporte@gestaoornato.com</a>
                    <span style={{ margin: '0 12px', color: '#333' }}>•</span>
                    <a href="/" style={{ color: '#666', textDecoration: 'none' }}>gestaoornato.com</a>
                </div>
            </footer>
        </div>
    );
}
