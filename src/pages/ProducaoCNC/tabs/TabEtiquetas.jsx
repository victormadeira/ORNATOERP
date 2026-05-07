// Extraído automaticamente de ProducaoCNC.jsx (linhas 10900-11388).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../components/PecaViewer3D';
import PecaEditor from '../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../components/GcodeSimWrapper';
import SlidePanel from '../../../components/SlidePanel';
import ToolbarDropdown from '../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../shared/constants.js';
import { BarcodeSVG } from '../shared/BarcodeSVG.jsx';


const FORMATOS_ETIQUETA = {
    '100x70': { w: 100, h: 70, nome: '100 × 70 mm' },
    '100x50': { w: 100, h: 50, nome: '100 × 50 mm' },
    '90x60':  { w: 90, h: 60, nome: '90 × 60 mm' },
    '80x50':  { w: 80, h: 50, nome: '80 × 50 mm' },
    '70x40':  { w: 70, h: 40, nome: '70 × 40 mm (compacta)' },
    'a7':     { w: 105, h: 74, nome: 'A7 (105 × 74 mm)' },
};

const FONTES_TAMANHO = {
    'pequeno': { body: 9, label: 8, title: 10, ctrl: 14 },
    'medio':   { body: 11, label: 10, title: 12, ctrl: 18 },
    'grande':  { body: 13, label: 11, title: 14, ctrl: 22 },
};

export function TabEtiquetas({ lotes, loteAtual, setLoteAtual, notify }) {
    const [etiquetas, setEtiquetas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cfg, setCfg] = useState(null);
    const [cfgLoading, setCfgLoading] = useState(true);

    // Print status map { persistent_id: { status, impressoes } }
    const [printStatusMap, setPrintStatusMap] = useState({});
    const [markingAll, setMarkingAll] = useState(null); // chapaIdx being bulk-marked
    const loadPrintStatus = useCallback(() => {
        if (!loteAtual?.id) return;
        api.get(`/cnc/etiqueta-impressoes/${loteAtual.id}`)
            .then(d => setPrintStatusMap(d || {}))
            .catch(() => {});
    }, [loteAtual?.id]);
    useEffect(() => { loadPrintStatus(); }, [loadPrintStatus]);
    const [filtroModulo, setFiltroModulo] = useState(() => localStorage.getItem('etiq_filtroModulo') || '');
    const [filtroMaterial, setFiltroMaterial] = useState(() => localStorage.getItem('etiq_filtroMaterial') || '');
    const [templatePadrao, setTemplatePadrao] = useState(null);
    const [templateLoading, setTemplateLoading] = useState(false);
    const [usarTemplate, setUsarTemplate] = useState(true); // toggle template vs legacy
    const [qrPayloadTpl, setQrPayloadTpl] = useState('{{controle}}|{{descricao}}|{{comprimento}}x{{largura}}'); // template QR
    const [showQrConfig, setShowQrConfig] = useState(false);
    const [notasExtra, setNotasExtra] = useState(''); // observação extra adicionada a todas as etiquetas

    // Carregar config de etiquetas
    const loadCfg = useCallback(() => {
        setCfgLoading(true);
        api.get('/cnc/etiqueta-config').then(c => setCfg(c)).catch(() => {
            setCfg({ formato: '100x70', orientacao: 'paisagem', colunas_impressao: 2, fonte_tamanho: 'medio',
                mostrar_usia: 1, mostrar_usib: 1, mostrar_material: 1, mostrar_espessura: 1,
                mostrar_cliente: 1, mostrar_projeto: 1, mostrar_codigo: 1, mostrar_modulo: 1,
                mostrar_peca: 1, mostrar_dimensoes: 1, mostrar_bordas_diagrama: 1, mostrar_fita_resumo: 1,
                mostrar_acabamento: 1, mostrar_id_modulo: 1, mostrar_controle: 1, mostrar_produto_final: 0,
                mostrar_observacao: 1, mostrar_codigo_barras: 1, empresa_nome: '', cor_borda_fita: '#22c55e', cor_controle: '',
                margem_pagina: 8, gap_etiquetas: 4 });
        }).finally(() => setCfgLoading(false));
    }, []);

    useEffect(() => { loadCfg(); }, [loadCfg]);

    const load = useCallback(() => {
        if (!loteAtual) return;
        setLoading(true);
        // AbortController evita race condition quando lote muda antes da resposta chegar
        const ctrl = new AbortController();
        api.get(`/cnc/etiquetas/${loteAtual.id}`, { signal: ctrl.signal })
            .then(data => { if (!ctrl.signal.aborted) setEtiquetas(data); })
            .catch(e => { if (!ctrl.signal.aborted) notify(e.error || 'Erro ao carregar etiquetas'); })
            .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
        return () => ctrl.abort();
    }, [loteAtual, notify]);

    useEffect(() => { return load(); }, [load]);

    // Carregar template padrão para preview (cleanup cancela se componente desmontar)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setTemplateLoading(true);
            try {
                const lista = await api.get('/cnc/etiqueta-templates');
                if (cancelled || !Array.isArray(lista) || lista.length === 0) return;
                const def = lista.find(t => t.padrao) || lista[0];
                const tmpl = await api.get(`/cnc/etiqueta-templates/${def.id}`);
                if (cancelled) return;
                if (typeof tmpl.elementos === 'string') {
                    try { tmpl.elementos = JSON.parse(tmpl.elementos); }
                    catch { tmpl.elementos = []; }
                }
                setTemplatePadrao(tmpl);
            } catch (e) { console.error('Erro ao carregar template:', e); }
            if (!cancelled) setTemplateLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    // Resolve variáveis {{campo}} para uma etiqueta
    const resolveQrPayload = (et) => {
        const vars = {
            controle: et.controle, descricao: et.descricao || et.upmcode || '',
            comprimento: et.comprimento, largura: et.largura, espessura: et.espessura,
            material: et.material || et.material_code || '', cliente: et.cliente || '',
            projeto: et.projeto || '', codigo: et.codigo || '',
            modulo: et.modulo_desc || '', chapa: et.chapa_idx != null ? et.chapa_idx + 1 : '-',
            id: et.id || '', lote: loteAtual?.nome || '', data: new Date().toLocaleDateString('pt-BR'),
        };
        return qrPayloadTpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? k);
    };

    // Imprimir todas as chapas de uma vez
    const imprimirTudo = () => {
        const styleId = 'etiqueta-print-all-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
        const cols = usarTemplate && templatePadrao ? (templatePadrao.colunas_impressao || 2) : (cfg?.colunas_impressao || 2);
        const wMm = usarTemplate && templatePadrao ? (templatePadrao.largura || 100) : (FORMATOS_ETIQUETA[cfg?.formato]?.w || 100);
        const hMm = usarTemplate && templatePadrao ? (templatePadrao.altura || 70) : (FORMATOS_ETIQUETA[cfg?.formato]?.h || 70);
        const gap = (usarTemplate && templatePadrao ? templatePadrao.gap_etiquetas : cfg?.gap_etiquetas) || 4;
        const margem = (usarTemplate && templatePadrao ? templatePadrao.margem_pagina : cfg?.margem_pagina) || 8;
        styleEl.textContent = `
            @media print {
                body * { visibility: hidden !important; }
                .etiqueta-print-all, .etiqueta-print-all * { visibility: visible !important; }
                .etiqueta-print-all {
                    position: absolute !important; left: 0 !important; top: 0 !important;
                    width: 100% !important;
                    display: grid !important;
                    grid-template-columns: repeat(${cols}, ${wMm}mm) !important;
                    gap: ${gap}mm !important; padding: 0 !important;
                }
                .etiqueta-print-all .etiqueta-svg-wrap, .etiqueta-print-all .etiqueta-card-print {
                    width: ${wMm}mm !important; min-height: ${hMm}mm !important;
                    page-break-inside: avoid !important; break-inside: avoid !important;
                }
                .etiqueta-print-all .etiqueta-svg-wrap svg { width: ${wMm}mm !important; height: ${hMm}mm !important; }
                .no-print { display: none !important; }
                @page { margin: ${margem}mm !important; size: A4 !important; }
            }
        `;
        // Criar container temporário com todas as etiquetas
        const existing = document.getElementById('etiqueta-print-all-container');
        if (existing) existing.remove();
        const container = document.createElement('div');
        container.id = 'etiqueta-print-all-container';
        container.className = 'etiqueta-print-all';
        // Copiar conteúdo de todos os grupos
        chapaGroups.forEach(g => {
            const src = document.querySelector(`.print-chapa-${g.chapa_idx}`);
            if (src) container.appendChild(src.cloneNode(true));
        });
        document.body.appendChild(container);
        window.print();
        setTimeout(() => container.remove(), 1000);
    };

    const imprimirTeste = () => {
        if (etiquetasFiltradas.length === 0) {
            notify('Nenhuma etiqueta para teste');
            return;
        }
        const styleId = 'etiqueta-print-test-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
        const wMm = usarTemplate && templatePadrao ? (templatePadrao.largura || 100) : (FORMATOS_ETIQUETA[cfg?.formato]?.w || 100);
        const hMm = usarTemplate && templatePadrao ? (templatePadrao.altura || 70) : (FORMATOS_ETIQUETA[cfg?.formato]?.h || 70);
        const margem = (usarTemplate && templatePadrao ? templatePadrao.margem_pagina : cfg?.margem_pagina) || 8;
        styleEl.textContent = `
            @media print {
                body * { visibility: hidden !important; }
                .etiqueta-print-test, .etiqueta-print-test * { visibility: visible !important; }
                .etiqueta-print-test {
                    position: absolute !important; left: 0 !important; top: 0 !important;
                    width: ${wMm}mm !important; height: ${hMm}mm !important;
                    outline: 0.5mm dashed #ef4444 !important;
                }
                .etiqueta-print-test .etiqueta-svg-wrap,
                .etiqueta-print-test .etiqueta-card-print,
                .etiqueta-print-test svg {
                    width: ${wMm}mm !important; height: ${hMm}mm !important;
                }
                .no-print { display: none !important; }
                @page { margin: ${margem}mm !important; size: A4 !important; }
            }
        `;
        const existing = document.getElementById('etiqueta-print-test-container');
        if (existing) existing.remove();
        const src = document.querySelector('.etiqueta-svg-wrap, .etiqueta-card-print');
        if (!src) {
            notify('Preview da etiqueta ainda não está pronto');
            return;
        }
        const container = document.createElement('div');
        container.id = 'etiqueta-print-test-container';
        container.className = 'etiqueta-print-test';
        container.appendChild(src.cloneNode(true));
        document.body.appendChild(container);
        window.print();
        setTimeout(() => container.remove(), 1000);
    };

    // (impressão e ZPL agora são por chapa — definidos após filtros)

    // Filtrar etiquetas
    const modulos = [...new Set(etiquetas.map(e => e.modulo_desc).filter(Boolean))];
    const materiais = [...new Set(etiquetas.map(e => e.material || e.material_code).filter(Boolean))];
    const etiquetasFiltradas = etiquetas.filter(e => {
        if (filtroModulo && e.modulo_desc !== filtroModulo) return false;
        if (filtroMaterial && (e.material || e.material_code) !== filtroMaterial) return false;
        return true;
    });

    // Agrupar etiquetas por chapa
    const chapaGroups = useMemo(() => {
        const groups = {};
        for (const et of etiquetasFiltradas) {
            const key = et.chapa_idx != null && et.chapa_idx >= 0 ? et.chapa_idx : 'sem_chapa';
            if (!groups[key]) groups[key] = { chapa_idx: key, etiquetas: [], material: et.material || et.material_code || '', chapa: et.chapa };
            groups[key].etiquetas.push(et);
        }
        // Ordenar: chapas numéricas primeiro, 'sem_chapa' por último
        return Object.values(groups).sort((a, b) => {
            if (a.chapa_idx === 'sem_chapa') return 1;
            if (b.chapa_idx === 'sem_chapa') return -1;
            return a.chapa_idx - b.chapa_idx;
        });
    }, [etiquetasFiltradas]);

    const totalChapas = chapaGroups.filter(g => g.chapa_idx !== 'sem_chapa').length;

    // Imprimir uma chapa específica
    const imprimirChapa = (chapaIdx) => {
        // Esconder todas as etiquetas que NÃO são desta chapa antes de imprimir
        const styleId = 'etiqueta-print-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        if (usarTemplate && templatePadrao) {
            const cols = templatePadrao.colunas_impressao || 2;
            const margem = templatePadrao.margem_pagina || 8;
            const gap = templatePadrao.gap_etiquetas || 4;
            const wMm = templatePadrao.largura || 100;
            const hMm = templatePadrao.altura || 70;
            styleEl.textContent = `
                @media print {
                    body * { visibility: hidden !important; }
                    .print-chapa-${chapaIdx}, .print-chapa-${chapaIdx} * { visibility: visible !important; }
                    .print-chapa-${chapaIdx} {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        display: grid !important;
                        grid-template-columns: repeat(${cols}, ${wMm}mm) !important;
                        gap: ${gap}mm !important;
                        padding: 0 !important;
                    }
                    .print-chapa-${chapaIdx} .etiqueta-svg-wrap {
                        width: ${wMm}mm !important;
                        height: ${hMm}mm !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .print-chapa-${chapaIdx} .etiqueta-svg-wrap svg {
                        width: ${wMm}mm !important;
                        height: ${hMm}mm !important;
                    }
                    .no-print { display: none !important; }
                    @page { margin: ${margem}mm !important; size: A4 !important; }
                }
            `;
        } else {
            const cols = cfg?.colunas_impressao || 2;
            const fmt = FORMATOS_ETIQUETA[cfg?.formato] || FORMATOS_ETIQUETA['100x70'];
            const gap = cfg?.gap_etiquetas || 4;
            const margem = cfg?.margem_pagina || 8;
            styleEl.textContent = `
                @media print {
                    body * { visibility: hidden !important; }
                    .print-chapa-${chapaIdx}, .print-chapa-${chapaIdx} * { visibility: visible !important; }
                    .print-chapa-${chapaIdx} {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        display: grid !important;
                        grid-template-columns: repeat(${cols}, 1fr) !important;
                        gap: ${gap}mm !important;
                        padding: 0 !important;
                    }
                    .etiqueta-card-print {
                        width: ${fmt.w}mm !important;
                        min-height: ${fmt.h}mm !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        border: 0.5pt solid #ccc !important;
                    }
                    .no-print { display: none !important; }
                    @page { margin: ${margem}mm !important; size: A4 !important; }
                }
            `;
        }
        window.print();
    };

    // ZPL por chapa
    const exportarZPLChapa = async (chapaEtiquetas) => {
        if (!templatePadrao || chapaEtiquetas.length === 0) {
            notify('Configure um template e selecione etiquetas');
            return;
        }
        try {
            const { generateZPLBatch } = await import('../../../utils/zplGenerator.js');
            const zpl = generateZPLBatch(
                templatePadrao.elementos || [],
                chapaEtiquetas,
                cfg,
                { largura: templatePadrao.largura || 100, altura: templatePadrao.altura || 70 }
            );
            const blob = new Blob([zpl], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `etiquetas_chapa.zpl`;
            a.click();
            URL.revokeObjectURL(url);
            notify(`ZPL exportado: ${chapaEtiquetas.length} etiqueta(s)`);
        } catch (err) {
            notify('Erro ao gerar ZPL: ' + err.message);
        }
    };

    // Marcar todas as etiquetas de uma chapa como impressas
    const marcarTodasImpressas = useCallback(async (chapaEtiquetas, chapaIdx) => {
        if (!loteAtual?.id) return;
        setMarkingAll(chapaIdx);
        try {
            const pids = chapaEtiquetas.map(e => e.persistent_id || e.upmcode).filter(Boolean);
            await Promise.all(pids.map(pid =>
                api.post('/cnc/etiqueta-impressoes', {
                    lote_id: loteAtual.id,
                    persistent_id: pid,
                    status: 'impressa',
                })
            ));
            loadPrintStatus();
            notify(`${pids.length} etiqueta(s) marcadas como impressas`, 'success');
        } catch {
            notify('Erro ao marcar etiquetas');
        } finally {
            setMarkingAll(null);
        }
    }, [loteAtual?.id, loadPrintStatus, notify]);

    if (cfgLoading) return <Spinner text="Carregando configurações..." />;

    const fontes = FONTES_TAMANHO[cfg?.fonte_tamanho] || FONTES_TAMANHO.medio;
    const corFita = cfg?.cor_borda_fita || '#22c55e';
    const corCtrl = cfg?.cor_controle || 'var(--primary)';

    // ═══════════════════════════════════════════════════════
    // PREVIEW — Etiquetas agrupadas por chapa
    // ═══════════════════════════════════════════════════════
    return (
        <div>
            {loading ? (
                <Spinner text="Carregando etiquetas..." />
            ) : (
                <>
                    {/* Barra de ações global */}
                    <div className="no-print" style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Toggle template vs legacy */}
                        {templateLoading ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <RefreshCw size={12} className="animate-spin" /> Carregando template...
                            </span>
                        ) : templatePadrao && (
                            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                <input type="checkbox" checked={usarTemplate} onChange={e => setUsarTemplate(e.target.checked)} />
                                Template personalizado
                            </label>
                        )}

                        {/* Filtros */}
                        {materiais.length > 1 && (
                            <select value={filtroMaterial} onChange={e => { setFiltroMaterial(e.target.value); localStorage.setItem('etiq_filtroMaterial', e.target.value); }}
                                className={Z.inp} style={{ width: 160, fontSize: 11, padding: '6px 8px' }}>
                                <option value="">Todos os materiais</option>
                                {materiais.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        )}

                        {/* Imprimir Tudo */}
                        <button onClick={imprimirTudo}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', fontSize: 11, fontWeight: 700,
                                borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff' }}>
                            <Printer size={13} /> Imprimir Tudo
                        </button>

                        <button onClick={imprimirTeste}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 11, fontWeight: 700,
                                borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                            <Printer size={13} /> Teste 1 etiqueta
                        </button>

                        {/* Config QR */}
                        <button onClick={() => setShowQrConfig(v => !v)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 11,
                                borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                                background: showQrConfig ? 'var(--primary-alpha)' : 'var(--bg-muted)', color: showQrConfig ? 'var(--primary)' : 'var(--text-muted)' }}>
                            <QrCode size={13} /> QR / Variáveis
                        </button>

                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {etiquetasFiltradas.length} etiqueta(s) em {totalChapas} chapa(s)
                            {templatePadrao && usarTemplate && <span style={{ color: 'var(--primary)', fontWeight: 600, marginLeft: 6 }}>| {templatePadrao.nome}</span>}
                        </span>
                    </div>

                    {/* Painel de configuração QR + notas */}
                    {showQrConfig && (
                        <div className="glass-card no-print" style={{ marginBottom: 12, padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <QrCode size={13} /> Configuração de QR Code e Variáveis
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div>
                                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                                        Template do payload QR — variáveis disponíveis:
                                    </label>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'monospace' }}>
                                        {['controle','descricao','comprimento','largura','espessura','material','cliente','projeto','codigo','modulo','chapa','lote','data'].map(v => (
                                            <span key={v} onClick={() => setQrPayloadTpl(t => t + `{{${v}}}`)}
                                                style={{ display: 'inline-block', margin: '1px 3px', padding: '1px 6px', background: 'var(--primary-alpha)', color: 'var(--primary)', borderRadius: 3, cursor: 'pointer', userSelect: 'none' }}
                                                title={`Clique para inserir {{${v}}}`}>
                                                {'{{' + v + '}}'}
                                            </span>
                                        ))}
                                    </div>
                                    <input value={qrPayloadTpl} onChange={e => setQrPayloadTpl(e.target.value)}
                                        className={Z.inp} style={{ width: '100%', fontSize: 12, fontFamily: 'monospace' }}
                                        placeholder="Ex: {{controle}}|{{descricao}}|{{comprimento}}x{{largura}}" />
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                        Preview: <code style={{ color: 'var(--primary)' }}>
                                            {etiquetasFiltradas[0] ? resolveQrPayload(etiquetasFiltradas[0]) : '(sem etiquetas)'}
                                        </code>
                                    </div>
                                </div>
                                {/* P11: maxLength + contador de caracteres */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                            Observação extra (aparece em todas as etiquetas)
                                        </label>
                                        <span style={{
                                            fontSize: 9, fontVariantNumeric: 'tabular-nums',
                                            color: notasExtra.length > 55 ? 'var(--warning)' : 'var(--text-muted)',
                                        }}>
                                            {notasExtra.length}/60
                                        </span>
                                    </div>
                                    <input
                                        value={notasExtra}
                                        onChange={e => setNotasExtra(e.target.value)}
                                        maxLength={60}
                                        className={Z.inp}
                                        style={{ width: '100%', fontSize: 12 }}
                                        placeholder="Ex: Turno B — Máquina 2 — Conferir antes de embalar"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Nota extra global — mostrada no topo de cada grupo */}
                    {notasExtra && (
                        <div className="no-print" style={{ marginBottom: 10, padding: '7px 14px', borderRadius: 6, background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', fontSize: 11, fontWeight: 600, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={13} /> {notasExtra}
                        </div>
                    )}

                    {/* Grupos por chapa */}
                    {chapaGroups.map((group) => {
                        const isNoChapa = group.chapa_idx === 'sem_chapa';
                        const chapaLabel = isNoChapa ? 'Sem chapa atribuída' : `Chapa ${group.chapa_idx + 1} de ${totalChapas}`;
                        const chapaW = group.chapa?.w || 0;
                        const chapaH = group.chapa?.h || 0;
                        const printClass = `print-chapa-${group.chapa_idx}`;

                        // Print status para esta chapa
                        const pidsChapa = group.etiquetas.map(e => e.persistent_id || e.upmcode).filter(Boolean);
                        const impressasNaChapa = pidsChapa.filter(pid => printStatusMap[pid]).length;
                        const todasImpressas = pidsChapa.length > 0 && impressasNaChapa === pidsChapa.length;
                        const algumasImpressas = impressasNaChapa > 0 && impressasNaChapa < pidsChapa.length;

                        return (
                            <div key={group.chapa_idx} style={{ marginBottom: 20 }}>
                                {/* Cabeçalho da chapa */}
                                <div className="no-print" style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                    background: isNoChapa ? 'var(--bg-muted)' : 'linear-gradient(135deg, var(--primary), #1a6ad4)',
                                    borderRadius: '10px 10px 0 0', flexWrap: 'wrap',
                                }}>
                                    <Layers size={16} style={{ color: isNoChapa ? 'var(--text-muted)' : '#fff' }} />
                                    <span style={{ fontWeight: 700, fontSize: 14, color: isNoChapa ? 'var(--text-primary)' : '#fff' }}>
                                        {chapaLabel}
                                    </span>
                                    {!isNoChapa && (
                                        <>
                                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
                                                {group.material}
                                            </span>
                                            {chapaW > 0 && (
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4 }}>
                                                    {chapaW}×{chapaH}mm
                                                </span>
                                            )}
                                        </>
                                    )}
                                    <span style={{
                                        fontSize: 11, fontWeight: 600,
                                        color: isNoChapa ? 'var(--text-muted)' : 'rgba(255,255,255,0.9)',
                                        background: isNoChapa ? 'var(--border)' : 'rgba(255,255,255,0.2)',
                                        padding: '2px 10px', borderRadius: 10,
                                    }}>
                                        {group.etiquetas.length} peça(s)
                                    </span>
                                    {/* Print status badge */}
                                    {pidsChapa.length > 0 && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 700,
                                            color: todasImpressas ? (isNoChapa ? 'var(--success)' : '#fff') : algumasImpressas ? (isNoChapa ? 'var(--warning)' : '#fde68a') : (isNoChapa ? 'var(--text-muted)' : 'rgba(255,255,255,0.5)'),
                                            display: 'flex', alignItems: 'center', gap: 4,
                                        }}>
                                            {todasImpressas
                                                ? <><CheckCircle2 size={12} /> {impressasNaChapa}/{pidsChapa.length} impressas</>
                                                : algumasImpressas
                                                    ? <><AlertTriangle size={12} /> {impressasNaChapa}/{pidsChapa.length} impressas</>
                                                    : <><Circle size={12} /> Nenhuma impressa</>
                                            }
                                        </span>
                                    )}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                        <button onClick={() => imprimirChapa(group.chapa_idx)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
                                                fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                background: isNoChapa ? 'var(--primary)' : 'rgba(255,255,255,0.95)',
                                                color: isNoChapa ? '#fff' : 'var(--primary)',
                                            }}>
                                            <Printer size={12} /> Imprimir
                                        </button>
                                        {templatePadrao && (
                                            <button onClick={() => exportarZPLChapa(group.etiquetas)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                                    fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                    background: isNoChapa ? 'var(--bg-muted)' : 'rgba(255,255,255,0.2)',
                                                    color: isNoChapa ? 'var(--text-primary)' : '#fff',
                                                }}>
                                                <Download size={12} /> ZPL
                                            </button>
                                        )}
                                        {pidsChapa.length > 0 && !todasImpressas && (
                                            <button
                                                onClick={() => marcarTodasImpressas(group.etiquetas, group.chapa_idx)}
                                                disabled={markingAll === group.chapa_idx}
                                                title="Marcar todas as peças desta chapa como impressas"
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                                    fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                    background: isNoChapa ? 'var(--success-bg)' : 'rgba(255,255,255,0.15)',
                                                    color: isNoChapa ? 'var(--success)' : '#fff',
                                                    opacity: markingAll === group.chapa_idx ? 0.6 : 1,
                                                }}>
                                                {markingAll === group.chapa_idx
                                                    ? <RefreshCw size={12} className="animate-spin" />
                                                    : <Check size={12} />
                                                } Marcar impressas
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Grid de etiquetas desta chapa */}
                                <div className={printClass} style={{
                                    padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    borderTop: 'none', borderRadius: '0 0 10px 10px',
                                    display: 'grid',
                                    gridTemplateColumns: usarTemplate && templatePadrao
                                        ? `repeat(auto-fill, minmax(${Math.max(280, (templatePadrao.largura || 100) * 3.5)}px, 1fr))`
                                        : `repeat(auto-fill, minmax(${Math.max(280, 320)}px, 1fr))`,
                                    gap: (usarTemplate && templatePadrao ? templatePadrao.gap_etiquetas : cfg?.gap_etiquetas || 4) * 2 + 'px',
                                }}>
                                    {group.etiquetas.map((et, i) => {
                                        const etPid = et.persistent_id || et.upmcode;
                                        const etPs = etPid ? printStatusMap[etPid] : null;
                                        const etImpressaColor = etPs ? (etPs.impressoes > 1 ? 'var(--warning)' : 'var(--success)') : null;
                                        const etStatusIcon = etPs ? (etPs.impressoes > 1 ? <RotateCw size={9} /> : <Check size={9} />) : null;
                                        return usarTemplate && templatePadrao ? (
                                            <div key={i} className="etiqueta-svg-wrap" style={{
                                                position: 'relative',
                                                background: '#fff', borderRadius: 6,
                                                border: etPs ? `1.5px solid ${etImpressaColor}` : '1px solid #e5e7eb',
                                                overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                            }}>
                                                <EtiquetaSVG template={templatePadrao} etiqueta={et} cfg={cfg} />
                                                {etPs && (
                                                    <div style={{
                                                        position: 'absolute', top: 4, right: 4,
                                                        display: 'flex', alignItems: 'center', gap: 3,
                                                        padding: '2px 6px', borderRadius: 4, fontSize: 9.5, fontWeight: 700,
                                                        background: etImpressaColor, color: '#fff',
                                                        pointerEvents: 'none', lineHeight: 1,
                                                    }}>
                                                        {etStatusIcon}
                                                        {etPs.impressoes > 1 ? `${etPs.impressoes}×` : 'OK'}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <EtiquetaCard key={i} et={et} cfg={cfg} fontes={fontes} corFita={corFita} corCtrl={corCtrl} printStatus={etPs} />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {etiquetasFiltradas.length === 0 && (
                        <div className="glass-card p-6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Nenhuma etiqueta encontrada com os filtros selecionados
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function EtiquetaCard({ et, cfg, fontes, corFita, corCtrl, printStatus }) {
    const sh = (key) => cfg?.[key] !== 0; // mostrar campo (default = true exceto produto_final)
    const borderColor = (has) => has ? corFita : '#d1d5db';
    const fs = fontes || FONTES_TAMANHO.medio;
    const psColor = printStatus ? (printStatus.impressoes > 1 ? 'var(--warning)' : 'var(--success)') : null;

    return (
        <div className="etiqueta-card-print" style={{
            padding: '10px 12px', fontSize: fs.body, lineHeight: 1.5,
            pageBreakInside: 'avoid', breakInside: 'avoid',
            border: printStatus ? `1.5px solid ${psColor}` : '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg-card)',
            position: 'relative',
        }}>
            {/* Print status badge */}
            {printStatus && (
                <div className="no-print" style={{
                    position: 'absolute', top: 6, right: 6,
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '2px 7px', borderRadius: 4, fontSize: 9.5, fontWeight: 700,
                    background: psColor, color: '#fff', lineHeight: 1,
                }}>
                    {printStatus.impressoes > 1 ? <><RotateCw size={9} /> {printStatus.impressoes}× reimp.</> : <><Check size={9} /> Impressa</>}
                </div>
            )}
            {/* Empresa + Controle header */}
            {(cfg?.empresa_nome || sh('mostrar_controle')) && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 6, paddingBottom: 5, borderBottom: '2px solid var(--border)',
                }}>
                    {cfg?.empresa_nome ? (
                        <span style={{ fontSize: fs.title, fontWeight: 800, color: 'var(--primary)', letterSpacing: 0.5 }}>
                            {cfg.empresa_nome}
                        </span>
                    ) : <span />}
                    {sh('mostrar_controle') && (
                        <div style={{
                            background: corCtrl, color: '#fff',
                            padding: '2px 10px', borderRadius: 6,
                            fontSize: fs.ctrl, fontWeight: 800, lineHeight: 1.2,
                            minWidth: 40, textAlign: 'center',
                        }}>
                            {et.controle}
                        </div>
                    )}
                </div>
            )}

            {/* UsiA / UsiB */}
            {(sh('mostrar_usia') || sh('mostrar_usib')) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed var(--border)' }}>
                    {sh('mostrar_usia') && (
                        <div>
                            <span style={{ fontWeight: 700, fontSize: fs.label, color: 'var(--text-muted)' }}>UsiA: </span>
                            <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: fs.body }}>{et.usi_a || '-'}</span>
                        </div>
                    )}
                    {sh('mostrar_usib') && (
                        <div>
                            <span style={{ fontWeight: 700, fontSize: fs.label, color: 'var(--text-muted)' }}>UsiB: </span>
                            <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: fs.body }}>{et.usi_b || '-'}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Corpo principal - dados da peça */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 10px', marginBottom: 6 }}>
                {sh('mostrar_material') && (
                    <div style={{ gridColumn: '1/-1' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Material: </span>
                        <b>{et.material || et.material_code}</b>
                    </div>
                )}
                {sh('mostrar_espessura') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Espessura: </span><b>{et.espessura}mm</b></div>
                )}
                {sh('mostrar_cliente') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Cliente: </span><b>{et.cliente}</b></div>
                )}
                {sh('mostrar_projeto') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Projeto: </span>{et.projeto}</div>
                )}
                {sh('mostrar_codigo') && et.codigo && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Código: </span>{et.codigo}</div>
                )}
                {sh('mostrar_modulo') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Módulo: </span><b>{et.modulo_desc}</b></div>
                )}
                {sh('mostrar_peca') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Peça: </span><b style={{ color: 'var(--primary)' }}>{et.descricao}</b></div>
                )}
                {sh('mostrar_dimensoes') && (
                    <>
                        <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Comp: </span><b>{et.comprimento}mm</b></div>
                        <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Larg: </span><b>{et.largura}mm</b></div>
                    </>
                )}
                {sh('mostrar_produto_final') && et.produto_final && (
                    <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Produto: </span>{et.produto_final}</div>
                )}
                {sh('mostrar_observacao') && et.observacao && (
                    <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Obs: </span><i>{et.observacao}</i></div>
                )}
            </div>

            {/* Rodapé: diagrama + fita + barcode */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                {/* Diagrama de bordas SVG */}
                {sh('mostrar_bordas_diagrama') && (
                    <div style={{ flexShrink: 0 }}>
                        <svg width={56} height={46} viewBox="0 0 56 46">
                            <rect x={8} y={3} width={40} height={40} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} rx={2} />
                            {/* Setas/labels nos lados com fita */}
                            <line x1={8} y1={3} x2={48} y2={3} stroke={borderColor(et.diagrama.top)} strokeWidth={3.5} strokeLinecap="round" />
                            <line x1={8} y1={43} x2={48} y2={43} stroke={borderColor(et.diagrama.bottom)} strokeWidth={3.5} strokeLinecap="round" />
                            <line x1={8} y1={3} x2={8} y2={43} stroke={borderColor(et.diagrama.left)} strokeWidth={3.5} strokeLinecap="round" />
                            <line x1={48} y1={3} x2={48} y2={43} stroke={borderColor(et.diagrama.right)} strokeWidth={3.5} strokeLinecap="round" />
                            {/* Labels nos lados */}
                            {et.diagrama.top && <text x={28} y={15} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">F</text>}
                            {et.diagrama.bottom && <text x={28} y={38} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">T</text>}
                            {et.diagrama.left && <text x={16} y={25} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">E</text>}
                            {et.diagrama.right && <text x={40} y={25} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">D</text>}
                        </svg>
                    </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    {sh('mostrar_fita_resumo') && (
                        <div style={{ fontSize: fs.label, color: 'var(--text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                            <span style={{ fontWeight: 700 }}>Fita:</span> {et.fita_resumo}
                        </div>
                    )}
                    {sh('mostrar_acabamento') && (
                        <div style={{ fontSize: fs.label, color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 700 }}>Acab:</span> {et.acabamento || '-'}
                        </div>
                    )}
                    {sh('mostrar_id_modulo') && (
                        <div style={{ fontSize: fs.label, color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 700 }}>ID Mod:</span> {et.modulo_id}
                        </div>
                    )}

                    {/* Código de barras */}
                    {sh('mostrar_codigo_barras') && (
                        <div style={{ marginTop: 3 }}>
                            <BarcodeSVG value={et.controle} width={100} height={22} />
                        </div>
                    )}
                </div>

                {/* Número de controle grande (se não estiver no header) */}
                {!cfg?.empresa_nome && sh('mostrar_controle') && (
                    <div style={{
                        width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                        background: corCtrl, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: fs.ctrl, fontWeight: 800,
                    }}>
                        {et.controle}
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// CONFIG: Etiquetas (seção dentro de TabConfig)
// ═══════════════════════════════════════════════════════
