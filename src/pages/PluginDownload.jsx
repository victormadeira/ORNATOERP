// ═══════════════════════════════════════════════════════
// Página de download do plugin Ornato CNC
// Requer login — acessível dentro do ERP
// ═══════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import api from '../api';
import { Z, PageHeader, Spinner } from '../ui';
import { Plug, Download, Search, ChevronRight, CheckCircle2, Monitor, HardDrive, Cpu, X } from 'lucide-react';

const CAT_LABELS = {
    cozinha: 'Cozinha', dormitorio: 'Dormitório', banheiro: 'Banheiro',
    escritorio: 'Escritório', closet: 'Closet', area_servico: 'Área de Serviço', comercial: 'Comercial',
};

export default function PluginDownload({ notify }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [biblioteca, setBiblioteca] = useState(null);
    const [libCat, setLibCat] = useState('cozinha');
    const [libSearch, setLibSearch] = useState('');
    const [libSelected, setLibSelected] = useState(null);

    useEffect(() => {
        api.get('/plugin/latest')
            .then(d => { setInfo(d); setLoading(false); })
            .catch(() => setLoading(false));
        api.get('/plugin/biblioteca')
            .then(d => setBiblioteca(d))
            .catch(() => {});
    }, []);

    const libModules = (() => {
        if (!biblioteca?.moveis) return [];
        const all = Object.values(biblioteca.moveis).flatMap(c => c.modulos || []);
        return libSearch
            ? all.filter(m => m.nome?.toLowerCase().includes(libSearch.toLowerCase()) || m.tags?.some(t => t.includes(libSearch.toLowerCase())))
            : (biblioteca.moveis[libCat]?.modulos || []);
    })();

    function handleDownload() {
        if (!info?.filename) return;
        setDownloading(true);
        const token = localStorage.getItem('erp_token');
        fetch(`/api/plugin/download/${info.filename}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
            .then(r => { if (!r.ok) throw new Error('Download falhou'); return r.blob(); })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = info.filename || 'ornato_cnc.rbz';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                notify?.('success', 'Download iniciado');
            })
            .catch(() => notify?.('error', 'Erro no download'))
            .finally(() => setTimeout(() => setDownloading(false), 1000));

        api.post('/plugin/register', { version: info.version, os: navigator.platform }).catch(() => {});
    }

    const features = [
        { ic: Search, title: 'Detecção Automática', desc: 'Identifica peças, materiais e junções do modelo SketchUp automaticamente.' },
        { ic: Cpu, title: '8 Regras de Furação', desc: 'Dobradiças, minifix, cavilha, System32, puxador, corrediça, fundo e prateleira.' },
        { ic: HardDrive, title: '15 Módulos Paramétricos', desc: 'Armários, gaveteiros, torres, nichos e mais — com dimensões configuráveis.' },
        { ic: Monitor, title: 'Ferragens 3D', desc: 'Visualize dobradiças, minifix e corrediças posicionadas no modelo em 3D.' },
        { ic: CheckCircle2, title: '15 Validações', desc: 'Verifica espessuras, cotas, peças soltas e inconsistências antes de exportar.' },
        { ic: ChevronRight, title: 'Sync com ERP', desc: 'Envia diretamente para o Ornato ERP — plano de corte, CNC e etiquetas.' },
    ];

    const steps = [
        { n: '01', title: 'Baixe o arquivo .rbz', desc: 'Clique no botão acima para baixar o arquivo de instalação do plugin.' },
        { n: '02', title: 'Instale no SketchUp', desc: 'Vá em Window → Extension Manager → Install Extension → selecione o .rbz.' },
        { n: '03', title: 'Acesse pelo menu', desc: 'O menu "Ornato CNC" aparece em Plugins. Use Ctrl+Shift+A para analisar.' },
    ];

    return (
        <div className={Z.pg}>
            <PageHeader icon={Plug} title="Plugin SketchUp" subtitle="Ornato CNC — extensão para SketchUp 2021+" />

            {/* ─── Download + Info ────────────────────── */}
            <div className="glass-card p-5 mb-4" style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                    Do modelo 3D ao plano de corte CNC
                </h2>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto 24px', lineHeight: 1.6 }}>
                    O plugin detecta peças, gera furação automática e sincroniza direto com o ERP — tudo sem sair do SketchUp.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <button
                        onClick={handleDownload}
                        disabled={loading || !info || downloading}
                        className="btn-primary btn-lg"
                        style={{ fontSize: 16, padding: '14px 36px', gap: 10 }}
                    >
                        <Download size={20} />
                        {loading ? 'Carregando...' : downloading ? 'Baixando...' : `Baixar Plugin${info ? ` v${info.version}` : ''}`}
                    </button>
                    {info && (
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                            <span>SketchUp {info.min_sketchup}+</span>
                            <span>·</span>
                            <span>Windows & Mac</span>
                            <span>·</span>
                            <span>Gratuito</span>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Features ──────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
                {features.map((f, i) => (
                    <div key={i} className="glass-card p-4">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--primary-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <f.ic size={16} style={{ color: 'var(--primary)' }} />
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{f.title}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                ))}
            </div>

            {/* ─── Instalação ────────────────────────── */}
            <div className="glass-card p-5 mb-4">
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>Instalação em 3 passos</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px' }}>Leva menos de 2 minutos para estar funcionando</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
                    {steps.map((s, i) => (
                        <div key={i}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)', opacity: 0.25, lineHeight: 1 }}>{s.n}</div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', margin: '6px 0 4px' }}>{s.title}</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.desc}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ─── Requisitos + FAQ ───────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div className="glass-card p-5">
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Requisitos</h3>
                    {[
                        { label: 'SketchUp', value: `${info?.min_sketchup || '2021'} ou superior` },
                        { label: 'Sistema', value: 'Windows 10+ / macOS 10.15+' },
                        { label: 'RAM', value: '4 GB mínimo' },
                        { label: 'ERP Ornato', value: 'Conta ativa para sync' },
                    ].map((r, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.label}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.value}</span>
                        </div>
                    ))}
                </div>
                <div className="glass-card p-5">
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Dúvidas frequentes</h3>
                    {[
                        { q: 'Funciona offline?', a: 'Análise e furação sim. Sync e update precisam de conexão.' },
                        { q: 'Como se atualiza?', a: 'No startup do SketchUp, verifica nova versão e oferece update com 1 clique.' },
                        { q: 'Precisa configurar o ERP?', a: 'Sim. Em Ornato CNC → Configurações, insira a URL do ERP e faça login.' },
                        { q: 'Funciona com qualquer modelo?', a: 'Com modelos organizados em grupos/componentes. Cada grupo = uma peça.' },
                    ].map((item, i) => (
                        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>{item.q}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.a}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ─── Changelog ─────────────────────────── */}
            {info?.changelog && (
                <div className="glass-card p-5 mb-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                        Novidades v{info.version}
                    </h3>
                    <div style={{ background: 'var(--bg-muted)', borderRadius: 'var(--radius-md)', padding: '16px 20px' }}>
                        {info.changelog.split('\n').map((line, i) => (
                            <div key={i} style={{ fontSize: 13, color: line.startsWith('-') ? 'var(--text-secondary)' : 'var(--text-muted)', padding: '2px 0', lineHeight: 1.5 }}>
                                {line || <br />}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Biblioteca de Módulos ──────────────── */}
            <div className="glass-card p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Biblioteca de Módulos</h3>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                            Módulos paramétricos disponíveis no servidor — o plugin busca online, sempre atualizado.
                        </p>
                    </div>
                    <div style={{ position: 'relative', width: 280 }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            value={libSearch}
                            onChange={e => setLibSearch(e.target.value)}
                            placeholder="Buscar módulo..."
                            className={Z.inp}
                            style={{ paddingLeft: 30, fontSize: 13 }}
                        />
                    </div>
                </div>

                {/* Category tabs */}
                {!libSearch && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                        {Object.entries(CAT_LABELS).map(([cat, label]) => {
                            const count = biblioteca?.moveis?.[cat]?.count || 0;
                            if (count === 0) return null;
                            const active = libCat === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setLibCat(cat)}
                                    className={active ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                                    style={{ borderRadius: 20, fontWeight: active ? 600 : 400 }}
                                >
                                    {label}
                                    <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Module grid */}
                {!biblioteca ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
                ) : libModules.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 13 }}>Nenhum módulo encontrado.</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        {libModules.map(m => {
                            const sel = libSelected?.id === m.id;
                            return (
                                <div
                                    key={m.id}
                                    onClick={() => setLibSelected(sel ? null : m)}
                                    className="glass-card"
                                    style={{
                                        padding: '14px 12px',
                                        cursor: 'pointer',
                                        borderColor: sel ? 'var(--primary)' : undefined,
                                        background: sel ? 'var(--primary-alpha)' : undefined,
                                    }}
                                >
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
                                        {CAT_LABELS[m.categoria] || m.categoria}
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>{m.nome}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.descricao}</div>
                                    {m.tags && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                                            {m.tags.slice(0, 3).map(t => (
                                                <span key={t} style={{ fontSize: 10, background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', color: 'var(--text-muted)' }}>{t}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Detail panel */}
                {libSelected && (
                    <div style={{ marginTop: 16, background: 'var(--primary-alpha)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-lg)', padding: '20px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{libSelected.nome}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{libSelected.descricao}</div>
                            </div>
                            <button onClick={() => setLibSelected(null)} className="btn-secondary btn-sm" style={{ padding: '4px 8px' }}><X size={14} /></button>
                        </div>
                        {libSelected.parametros && (
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, fontWeight: 600 }}>Parâmetros</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                                    {Object.entries(libSelected.parametros).map(([key, val]) => (
                                        <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{key}</div>
                                            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>
                                                {val.default !== undefined
                                                    ? `${val.default}${val.unidade ? ' ' + val.unidade : ''}`
                                                    : typeof val === 'boolean' ? (val ? 'sim' : 'não') : String(val)
                                                }
                                                {val.min !== undefined && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> ({val.min}–{val.max})</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                            ID: <code style={{ color: 'var(--primary)', background: 'var(--bg-muted)', padding: '1px 6px', borderRadius: 3 }}>{libSelected.id}</code>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
