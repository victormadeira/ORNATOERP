// Extraído automaticamente de ProducaoCNC.jsx (linhas 2580-6689).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../../components/PecaViewer3D';
import PecaEditor from '../../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../../components/GcodeSimWrapper';
import SlidePanel from '../../../../components/SlidePanel';
import ToolbarDropdown from '../../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../../shared/constants.js';
import { printPlano } from '../../shared/printing/printPlano.js';
import { printFolhaProducao } from '../../shared/printing/printFolhaProducao.js';
import { parseGcodeForSim, getOpCat } from './parseGcode.js';
import { GcodeSimCanvas } from './GcodeSimCanvas.jsx';
import { ToolPanelModal } from './ToolPanelModal.jsx';
import { GcodePreviewModal } from './GcodePreviewModal.jsx';
import { buildMillingOutline } from './buildMillingOutline.js';
import { renderMachining, ChapaViz } from './renderMachining.jsx';
import { isPanningCursor } from './_utils.js';
import { RelatorioDesperdicio } from '../_RelatorioDesperdicio.jsx';
import { optimizeCutSequence, calcRapidDistance } from '../../shared/tspUtils.js';

export function TabPlano({ lotes, loteAtual, setLoteAtual, notify, loadLotes, setTab }) {
    const [plano, setPlano] = useState(null);
    const [loading, setLoading] = useState(false);
    const [otimizando, setOtimizando] = useState(false);
    const [pecasMap, setPecasMap] = useState({});
    const [selectedChapa, setSelectedChapa] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    // Transfer area + undo/redo + selection
    const [bandeja, setBandeja] = useState({}); // { materialKey: [peças...] }
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [expandedMats, setExpandedMats] = useState(new Set());
    const [matAction, setMatAction] = useState(null); // { grpKey, action } — tracks open sub-panel per material
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [selectedPieces, setSelectedPieces] = useState([]); // pecaIdx list for active sheet

    // Corte status (quais peças já foram cortadas)
    const [cortadasSet, setCortadasSet] = useState(new Set());
    const [markingChapa, setMarkingChapa] = useState(null); // chapaIdx being marked

    // Config overrides (loaded from cnc_config defaults)
    const [cfgLoaded, setCfgLoaded] = useState(false);
    const [espacoPecas, setEspacoPecas] = useState(7);
    const [refilo, setRefilo] = useState(10);
    const [permitirRotacao, setPermitirRotacao] = useState(true);
    const [modo, setModo] = useState('guilhotina');
    const [kerf, setKerf] = useState(4);
    const [usarRetalhos, setUsarRetalhos] = useState(true);
    const [iteracoes, setIteracoes] = useState(300);
    const [considerarSobra, setConsiderarSobra] = useState(true);
    const [sobraMinW, setSobraMinW] = useState(300);
    const [sobraMinH, setSobraMinH] = useState(600);
    const [direcaoCorte, setDirecaoCorte] = useState('misto');

    // Classificação de peças
    const [limiarPequena, setLimiarPequena] = useState(400);
    const [limiarSuperPequena, setLimiarSuperPequena] = useState(200);
    const [colorMode, setColorMode] = useState('modulo'); // 'modulo' | 'classificacao'

    // Qualidade do otimizador
    const [qualidade, setQualidade] = useState('balanceado'); // 'rapido' | 'balanceado' | 'maximo'
    const [ultimaEstrategia, setUltimaEstrategia] = useState(null); // estratégia usada na última otimização
    const [ultimoCusto, setUltimoCusto] = useState(null); // { custo_total, custo_desperdicio } após otimização

    // Progresso de otimização simulado (mostra fases)
    const [otimProgress, setOtimProgress] = useState(null); // { fase, pct }

    // TSP — otimização da sequência de cortes
    const [tspResult, setTspResult] = useState(null); // { economia_mm, economia_pct }
    const [tspLoading, setTspLoading] = useState(false);

    // Retalhos selection modal
    const [showRetalhosModal, setShowRetalhosModal] = useState(false);
    const [retalhosPreview, setRetalhosPreview] = useState(null);
    const [retalhosSelected, setRetalhosSelected] = useState({});
    const [retalhosPreviewLoading, setRetalhosPreviewLoading] = useState(false);

    // 3D modal + label print from context menu
    const [view3dPeca, setView3dPeca] = useState(null); // piece object for 3D modal
    const [printLabelPeca, setPrintLabelPeca] = useState(null); // piece for label printing

    // Keyboard shortcuts help panel
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

    // ═══ Chapa Status (multi-state) ═══
    const [chapaStatuses, setChapaStatuses] = useState({});
    const loadChapaStatuses = useCallback(() => {
        if (!loteAtual) return;
        const loteId = loteAtual.id; // captura antes do await para detectar staleness
        api.get(`/cnc/chapa-status/${loteId}`).then(rows => {
            if (loteAtual?.id !== loteId) return; // resposta obsoleta — descarta
            const map = {};
            for (const r of rows) map[r.chapa_idx] = r;
            setChapaStatuses(map);
        }).catch(() => {});
    }, [loteAtual?.id]); // dep: só id — atualizar aproveitamento/outros campos não relança o efeito
    useEffect(() => { loadChapaStatuses(); }, [loadChapaStatuses]);
    const updateChapaStatus = async (chapaIdx, status) => {
        try {
            await api.post(`/cnc/chapa-status/${loteAtual.id}`, { chapa_idx: chapaIdx, status });
            loadChapaStatuses();
            notify(`Chapa ${chapaIdx + 1}: ${status.replace('_', ' ')}`, 'success');
        } catch (err) { notify(err.error || 'Erro ao atualizar status'); }
    };

    // ═══ Review Checklist ═══
    const [reviewData, setReviewData] = useState(null);
    const [showReview, setShowReview] = useState(false);
    const loadReview = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/review/${loteAtual.id}`);
            setReviewData(data);
            setShowReview(true);
        } catch (err) { notify(err.error || 'Erro no review'); }
    };

    // ═══ Material Report ═══
    const [materialReport, setMaterialReport] = useState(null);
    const [showMaterialReport, setShowMaterialReport] = useState(false);
    const loadMaterialReport = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/relatorio-materiais/${loteAtual.id}`);
            setMaterialReport(data);
            setShowMaterialReport(true);
        } catch (err) { notify(err.error || 'Erro ao carregar relatório'); }
    };

    // ═══ G-Code History ═══
    const [gcodeHistory, setGcodeHistory] = useState([]);
    const [showGcodeHistory, setShowGcodeHistory] = useState(false);
    const loadGcodeHistory = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/gcode-historico/${loteAtual.id}`);
            setGcodeHistory(data);
            setShowGcodeHistory(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Conferência pós-corte ═══
    const [conferencia, setConferencia] = useState([]);
    const [showConferencia, setShowConferencia] = useState(false);
    const loadConferencia = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/conferencia/${loteAtual.id}`);
            setConferencia(data);
            setShowConferencia(true);
        } catch (err) { notify(err.error || 'Erro ao carregar conferência'); }
    };
    const conferirPeca = async (chapaIdx, pecaIdx, pecaDesc, status, defeitoTipo, defeitoObs) => {
        try {
            await api.post(`/cnc/conferencia/${loteAtual.id}`, {
                chapa_idx: chapaIdx, peca_idx: pecaIdx, peca_desc: pecaDesc,
                status, defeito_tipo: defeitoTipo || '', defeito_obs: defeitoObs || '',
                conferente: '',
            });
            setConferencia(prev => {
                const idx = prev.findIndex(c => c.chapa_idx === chapaIdx && c.peca_idx === pecaIdx);
                const newItem = { chapa_idx: chapaIdx, peca_idx: pecaIdx, peca_desc: pecaDesc, status, defeito_tipo: defeitoTipo || '', defeito_obs: defeitoObs || '' };
                if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], ...newItem }; return n; }
                return [...prev, newItem];
            });
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const conferirChapaOk = async (chapaIdx) => {
        if (!plano?.chapas[chapaIdx]) return;
        const pecas = plano.chapas[chapaIdx].pecas.map((p, pi) => ({ peca_idx: pi, peca_desc: p.desc || '' }));
        try {
            await api.post(`/cnc/conferencia/${loteAtual.id}/chapa/${chapaIdx}/ok`, { pecas });
            loadConferencia();
            notify(`Chapa ${chapaIdx + 1} conferida OK`, 'success');
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Fila de Produção ═══
    const [filaProducao, setFilaProducao] = useState([]);
    const [showFila, setShowFila] = useState(false);
    const loadFila = async () => {
        try {
            const data = await api.get('/cnc/fila-producao');
            setFilaProducao(data);
            setShowFila(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const enviarParaFila = async () => {
        if (!loteAtual) return;
        try {
            const r = await api.post(`/cnc/fila-producao/lote/${loteAtual.id}`, {});
            notify(`${r.added} chapas adicionadas à fila`, 'success');
            loadFila();
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const atualizarFila = async (id, updates) => {
        try {
            await api.put(`/cnc/fila-producao/${id}`, updates);
            loadFila();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Custeio Automático ═══
    const [custeioData, setCusteioData] = useState(null);
    const [showCusteio, setShowCusteio] = useState(false);
    const [custeioLoading, setCusteioLoading] = useState(false);
    const calcularCusteio = async () => {
        if (!loteAtual) return;
        setCusteioLoading(true);
        try {
            const data = await api.post(`/cnc/custeio/${loteAtual.id}`, {});
            setCusteioData(data);
            setShowCusteio(true);
        } catch (err) { notify(err.error || 'Erro ao calcular custeio'); }
        finally { setCusteioLoading(false); }
    };

    // ═══ Estoque de Chapas ═══
    const [estoqueChapas, setEstoqueChapas] = useState([]);
    const [showEstoque, setShowEstoque] = useState(false);
    const [estoqueAlertas, setEstoqueAlertas] = useState([]);
    const loadEstoque = async () => {
        try {
            const [chapas, alertas] = await Promise.all([
                api.get('/cnc/estoque-chapas'),
                api.get('/cnc/estoque-alertas'),
            ]);
            setEstoqueChapas(chapas);
            setEstoqueAlertas(alertas);
            setShowEstoque(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const movimentarEstoque = async (chapaId, tipo, qtd, motivo) => {
        try {
            const r = await api.post(`/cnc/estoque-chapas/${chapaId}/movimentacao`, { tipo, quantidade: qtd, motivo, lote_id: loteAtual?.id });
            notify(`Estoque atualizado: ${r.novo_estoque} un.`, 'success');
            loadEstoque();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Batch G-Code (#18) ═══
    const [batchGcodeLoading, setBatchGcodeLoading] = useState(false);
    const handleBatchGcode = async () => {
        if (!loteAtual) return;
        setBatchGcodeLoading(true);
        try {
            const data = await api.post(`/cnc/gcode-batch/${loteAtual.id}`, {
                maquina_id: maquinaGcode || null,
            });
            if (data.files) {
                notify(`${data.files.length} arquivos G-Code gerados`, 'success');
                if (data.combined) {
                    const blob = new Blob([data.combined], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url;
                    a.download = `gcode_lote_${loteAtual.id}_batch.nc`;
                    a.click(); URL.revokeObjectURL(url);
                }
            }
        } catch (err) { notify(err.error || 'Erro ao gerar G-Code em lote'); }
        finally { setBatchGcodeLoading(false); }
    };

    // ═══ SVG Export (#21) ═══
    const handleExportSVG = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/export-svg/${loteAtual.id}`);
            if (data.svgs) {
                data.svgs.forEach((svg, i) => {
                    const blob = new Blob([svg.svg], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url;
                    a.download = `plano_chapa_${i + 1}.svg`;
                    a.click(); URL.revokeObjectURL(url);
                });
                notify(`${data.svgs.length} SVG(s) exportados`, 'success');
            }
        } catch (err) { notify(err.error || 'Erro ao exportar SVG'); }
    };

    // ═══ PDF Export (#17) ═══
    const handleExportPDF = async () => {
        if (!loteAtual || !plano) return;
        const win = window.open('', '_blank');
        const chapasHtml = plano.chapas.map((ch, ci) => {
            const totalPecas = ch.pecas?.length || 0;
            const aprovPct = ch.aproveitamento ? (ch.aproveitamento * 100).toFixed(1) : '-';
            const pecasRows = (ch.pecas || []).map((p, pi) => `
                <tr><td>${pi + 1}</td><td>${p.desc || '-'}</td><td>${Math.round(p.w)}×${Math.round(p.h)}</td><td>${p.rotacionada ? 'Sim' : '-'}</td></tr>
            `).join('');
            return `
                <div class="chapa-section">
                    <h3>Chapa ${ci + 1} — ${ch.material || 'Material'} (${ch.w}×${ch.h}mm)</h3>
                    <div class="stats">
                        <span>Peças: ${totalPecas}</span>
                        <span>Aproveitamento: ${aprovPct}%</span>
                    </div>
                    <table><thead><tr><th>#</th><th>Peça</th><th>Dimensões</th><th>Rot.</th></tr></thead>
                    <tbody>${pecasRows}</tbody></table>
                </div>`;
        }).join('');
        win.document.write(`<!DOCTYPE html><html><head><title>Plano de Corte — Lote ${loteAtual.nome || loteAtual.id}</title>
        <style>
            body{font-family:Inter,sans-serif;padding:30px;color:#1a1a2e}
            h2{color:#1379F0;border-bottom:2px solid #1379F0;padding-bottom:8px}
            .chapa-section{margin:20px 0;padding:16px;border:1px solid #ddd;border-radius:8px}
            h3{margin:0 0 8px;color:#333}
            .stats{display:flex;gap:20px;font-size:13px;color:#666;margin-bottom:12px}
            table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{padding:6px 10px;border:1px solid #e0e0e0;text-align:left}
            th{background:#f0f4ff;font-weight:600}
            @media print{body{padding:10px}.chapa-section{break-inside:avoid}}
        </style></head><body>
        <h2>Plano de Corte — ${loteAtual.nome || 'Lote ' + loteAtual.id}</h2>
        <p style="color:#666;font-size:12px">${new Date().toLocaleDateString('pt-BR')} · ${plano.chapas?.length || 0} chapas · ${plano.chapas?.reduce((s, c) => s + (c.pecas?.length || 0), 0) || 0} peças</p>
        ${chapasHtml}
        <script>setTimeout(()=>window.print(),500)</script></body></html>`);
        win.document.close();
    };

    // ═══ Tool Prediction (#20) ═══
    const [toolPrediction, setToolPrediction] = useState(null);
    const [showToolPrediction, setShowToolPrediction] = useState(false);
    const loadToolPrediction = async () => {
        try {
            const data = await api.get('/cnc/tool-prediction');
            setToolPrediction(data);
            setShowToolPrediction(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Tool Maintenance (#27) ═══
    const [toolMaintenance, setToolMaintenance] = useState([]);
    const [showToolMaint, setShowToolMaint] = useState(false);
    const loadToolMaintenance = async () => {
        try {
            const data = await api.get('/cnc/tool-manutencao');
            setToolMaintenance(data);
            setShowToolMaint(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Material Audit (#25) ═══
    const [materialAudit, setMaterialAudit] = useState([]);
    const [showMaterialAudit, setShowMaterialAudit] = useState(false);
    const loadMaterialAudit = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/material-consumo/${loteAtual.id}`);
            setMaterialAudit(data);
            setShowMaterialAudit(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Material Reservation (#29) ═══
    const [reservations, setReservations] = useState([]);
    const [showReservations, setShowReservations] = useState(false);
    const loadReservations = async () => {
        try {
            const data = await api.get(`/cnc/reserva-material${loteAtual ? '?lote_id=' + loteAtual.id : ''}`);
            setReservations(data);
            setShowReservations(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const criarReserva = async (chapaId, qtd) => {
        if (!loteAtual) return;
        try {
            await api.post('/cnc/reserva-material', { lote_id: loteAtual.id, chapa_id: chapaId, quantidade: qtd });
            notify('Reserva criada', 'success');
            loadReservations();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Backup (#28) ═══
    const [backups, setBackups] = useState([]);
    const [showBackups, setShowBackups] = useState(false);
    const loadBackups = async () => {
        try {
            const data = await api.get('/cnc/backups');
            setBackups(data);
            setShowBackups(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const criarBackup = async () => {
        try {
            const r = await api.post('/cnc/backups', {});
            notify(`Backup criado: ${r.filename}`, 'success');
            loadBackups();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Machine Performance (#31) ═══
    const [machinePerf, setMachinePerf] = useState(null);
    const [showMachinePerf, setShowMachinePerf] = useState(false);
    const loadMachinePerf = async () => {
        try {
            const data = await api.get('/cnc/maquina-performance');
            setMachinePerf(data);
            setShowMachinePerf(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Financeiro Integration (#22) ═══
    const handleFinanceiroSync = async () => {
        if (!loteAtual) return;
        try {
            const r = await api.post(`/cnc/financeiro-sync/${loteAtual.id}`, {});
            notify(`Sincronizado: ${r.total_items} itens → R$${r.total_valor?.toFixed(2) || '0.00'}`, 'success');
        } catch (err) { notify(err.error || 'Erro ao sincronizar financeiro'); }
    };

    // ═══ Label Preview (#26) ═══
    const [labelPreviewData, setLabelPreviewData] = useState(null);
    const [showLabelPreview, setShowLabelPreview] = useState(false);
    const loadLabelPreview = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/label-preview/${loteAtual.id}`);
            setLabelPreviewData(data);
            setShowLabelPreview(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Optimization Comparison (#36) ═══
    const [comparisonData, setComparisonData] = useState(null);
    const [showComparison, setShowComparison] = useState(false);
    const loadComparison = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.post(`/cnc/plano/${loteAtual.id}/comparar`, {});
            setComparisonData(data);
            setShowComparison(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Waste Dashboard (#39) ═══
    const [wasteData, setWasteData] = useState(null);
    const [showWaste, setShowWaste] = useState(false);
    const loadWasteDashboard = async () => {
        try {
            const data = await api.get('/cnc/dashboard/desperdicio?meses=6');
            setWasteData(data);
            setShowWaste(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Grouping Suggestion (#40) ═══
    const [groupingSuggestions, setGroupingSuggestions] = useState([]);
    const [showGrouping, setShowGrouping] = useState(false);
    const loadGroupingSuggestions = async () => {
        try {
            const data = await api.get('/cnc/sugestao-agrupamento');
            setGroupingSuggestions(data.suggestions || []);
            setShowGrouping(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Smart Remnants (#42) ═══
    const [remnantsData, setRemnantsData] = useState(null);
    const [showRemnants, setShowRemnants] = useState(false);
    const loadRemnants = async () => {
        try {
            const data = await api.get('/cnc/retalhos-aproveitaveis');
            setRemnantsData(data);
            setShowRemnants(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Client Report (#46) ═══
    const handleClientReport = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/relatorio-cliente/${loteAtual.id}`);
            const win = window.open('', '_blank');
            const modulosHtml = data.modulos.map(m => `
                <div style="margin:16px 0;padding:16px;border:1px solid #ddd;border-radius:8px">
                    <h3 style="margin:0 0 8px">${m.nome}</h3>
                    <div style="display:flex;gap:20px;font-size:13px;color:#666">
                        <span>Peças: ${m.total}</span>
                        <span>Conferidas: ${m.conferidas}</span>
                        <span>Progresso: ${m.progresso_pct.toFixed(0)}%</span>
                    </div>
                    <div style="height:6px;background:#eee;border-radius:3px;margin-top:8px;overflow:hidden">
                        <div style="height:100%;width:${m.progresso_pct}%;background:#22c55e;border-radius:3px"></div>
                    </div>
                </div>`).join('');
            win.document.write(`<!DOCTYPE html><html><head><title>Relatório — ${data.lote.nome}</title>
            <style>body{font-family:Inter,sans-serif;padding:30px;color:#1a1a2e}h2{color:#1379F0}
            @media print{body{padding:10px}}</style></head><body>
            <h2>Relatório de Produção — ${data.lote.nome}</h2>
            <p style="color:#666">${new Date().toLocaleDateString('pt-BR')} · ${data.total_pecas} peças · ${data.total_conferidas} conferidas</p>
            ${modulosHtml}
            <script>setTimeout(()=>window.print(),500)</script></body></html>`);
            win.document.close();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Push Notifications (#35) ═══
    const requestNotifPermission = useCallback(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);
    useEffect(() => { requestNotifPermission(); }, [requestNotifPermission]);

    // ═══ Piece Labels ═══
    const [showLabels, setShowLabels] = useState(false);
    const printLabels = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/etiquetas/${loteAtual.id}`);
            const win = window.open('', '_blank');
            const labelsHtml = data.labels.map(l => `
                <div class="label">
                    <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(l.qr_data || l.codigo_scan)}" width="70" height="70"/></div>
                    <div class="info">
                        <div class="desc">${l.descricao || l.upmcode}</div>
                        <div class="mod">${l.modulo || ''}</div>
                        <div class="dim">${l.dimensoes}</div>
                        ${l.bordas ? `<div class="borda">${l.bordas}</div>` : ''}
                        <div class="meta">${l.cliente} · Ch.${l.chapa?.idx || '?'}</div>
                        <div class="code">${l.codigo_scan}</div>
                    </div>
                </div>
            `).join('');
            win.document.write(`<!DOCTYPE html><html><head><title>Etiquetas — ${data.lote.nome}</title>
            <style>
                * { box-sizing: border-box; margin: 0; }
                body { font-family: Arial, sans-serif; }
                .label { display: inline-flex; width: 90mm; height: 38mm; border: 1px dashed #ccc; padding: 3mm; margin: 1mm; gap: 3mm; page-break-inside: avoid; align-items: center; }
                .qr { flex-shrink: 0; }
                .info { flex: 1; overflow: hidden; }
                .desc { font-size: 11px; font-weight: 700; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
                .mod { font-size: 9px; color: #666; }
                .dim { font-size: 10px; font-family: monospace; font-weight: 600; margin-top: 2px; }
                .borda { font-size: 8px; color: #92400e; margin-top: 1px; }
                .meta { font-size: 8px; color: #999; margin-top: 2px; }
                .code { font-size: 7px; font-family: monospace; color: #aaa; margin-top: 1px; }
                @media print { .no-print { display: none; } body { margin: 0; } .label { border: 1px solid #eee; } }
            </style></head><body>
            <div class="no-print" style="padding:10px"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e67e22;color:#fff;border:none;border-radius:6px">Imprimir Etiquetas</button>
            <span style="margin-left:12px;font-size:12px;color:#888">${data.labels.length} etiquetas · ${data.lote.nome}</span></div>
            ${labelsHtml}
            </body></html>`);
            win.document.close();
        } catch (err) { notify(err.error || 'Erro ao gerar etiquetas'); }
    };

    // ═══ Relatório de Bordas ═══
    const [bordasData, setBordasData] = useState(null);
    const [bordasLoading, setBordasLoading] = useState(false);
    const [showBordas, setShowBordas] = useState(false);
    const [bordasExpanded, setBordasExpanded] = useState({});
    const loadBordas = async () => {
        if (!loteAtual) return;
        setBordasLoading(true);
        try {
            const data = await api.get(`/cnc/relatorio-bordas/${loteAtual.id}`);
            setBordasData({ bordas: data.bordas || [] });
            setShowBordas(true);
        } catch (err) {
            notify('Erro ao carregar bordas: ' + (err.error || err.message));
        } finally { setBordasLoading(false); }
    };

    // ═══ Timer de corte por chapa ═══
    const [chapaTimers, setChapaTimers] = useState(() => {
        // Restore all timers from localStorage on mount
        const timers = {};
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('chapa_timer_')) {
                    timers[key] = JSON.parse(localStorage.getItem(key));
                }
            }
        } catch (_) {}
        return timers;
    });

    const getTimerKey = useCallback((chapaIdx) => {
        return `chapa_timer_${loteAtual?.id}_${chapaIdx}`;
    }, [loteAtual?.id]); // dep: só id — atualizar aproveitamento/outros campos não relança o efeito

    const startTimer = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        const existing = chapaTimers[key];
        const now = Date.now();
        const timerData = {
            running: true,
            startedAt: now,
            elapsed: existing?.elapsed || 0, // accumulated seconds before this start
        };
        localStorage.setItem(key, JSON.stringify(timerData));
        setChapaTimers(prev => ({ ...prev, [key]: timerData }));
    }, [getTimerKey, chapaTimers]);

    const stopTimer = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        const existing = chapaTimers[key];
        if (!existing) return;
        const now = Date.now();
        const elapsed = existing.elapsed + (existing.running ? Math.floor((now - existing.startedAt) / 1000) : 0);
        const timerData = { running: false, startedAt: null, elapsed };
        localStorage.setItem(key, JSON.stringify(timerData));
        setChapaTimers(prev => ({ ...prev, [key]: timerData }));
    }, [getTimerKey, chapaTimers]);

    const resetTimer = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        localStorage.removeItem(key);
        setChapaTimers(prev => { const n = { ...prev }; delete n[key]; return n; });
    }, [getTimerKey]);

    // Tick running timers every second
    const [timerTick, setTimerTick] = useState(0);
    useEffect(() => {
        const hasRunning = Object.values(chapaTimers).some(t => t.running);
        if (!hasRunning) return;
        const iv = setInterval(() => setTimerTick(t => t + 1), 1000);
        return () => clearInterval(iv);
    }, [chapaTimers]);

    const getTimerElapsed = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        const t = chapaTimers[key];
        if (!t) return 0;
        if (t.running) return t.elapsed + Math.floor((Date.now() - t.startedAt) / 1000);
        return t.elapsed || 0;
    }, [getTimerKey, chapaTimers, timerTick]);

    const formatTimer = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Cache de stats reais do G-code por chapa (preenchido após gerar G-code)
    const [chapaRealStats, setChapaRealStats] = useState({}); // { chapaIdx: { tempo_estimado_min, dist_corte_m, ... } }

    const getEstimatedTime = useCallback((chapa, chapaIdx) => {
        // Se temos stats reais do G-code, usar elas
        if (chapaIdx !== undefined && chapaRealStats[chapaIdx]?.tempo_estimado_min) {
            return chapaRealStats[chapaIdx].tempo_estimado_min;
        }
        // Fallback: estimativa heurística
        const nPecas = chapa.pecas?.length || 0;
        let totalOps = 0;
        for (const p of (chapa.pecas || [])) {
            const pid = p.pecaId;
            const dbp = pecasMap[pid];
            if (!dbp) continue;
            let mach = {};
            try { mach = JSON.parse(dbp.machining_json || '{}'); } catch (_) {}
            for (const face of Object.values(mach)) {
                if (Array.isArray(face)) totalOps += face.length;
            }
        }
        return Math.round((nPecas * 3 + totalOps * 1) / 60 * 10) / 10; // minutes
    }, [pecasMap, chapaRealStats]);

    // Fullscreen for chapa visualization
    const chapaVizContainerRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Multi-Machine state
    const [multiMaqMode, setMultiMaqMode] = useState(false);
    const [maquinas, setMaquinas] = useState([]);
    const [machineAssignments, setMachineAssignments] = useState({}); // chapaIdx → { maquina_id, maquina_nome }

    const loadMaquinas = useCallback(() => {
        api.get('/cnc/maquinas').then(setMaquinas).catch(() => {});
    }, []);

    const loadMachineAssignments = useCallback(() => {
        if (!loteAtual) return;
        api.get(`/cnc/machine-assignments/${loteAtual.id}`).then(list => {
            const map = {};
            for (const a of list) map[a.chapa_idx] = { maquina_id: a.maquina_id, maquina_nome: a.maquina_nome };
            setMachineAssignments(map);
            if (list.length > 0) setMultiMaqMode(true);
        }).catch(() => {});
    }, [loteAtual?.id]); // dep: só id — atualizar aproveitamento/outros campos não relança o efeito

    useEffect(() => { loadMaquinas(); }, [loadMaquinas]);
    useEffect(() => { loadMachineAssignments(); }, [loadMachineAssignments]);

    const assignMachine = async (chapaIdx, maquina_id) => {
        const newMap = { ...machineAssignments };
        if (maquina_id) {
            const maq = maquinas.find(m => m.id === Number(maquina_id));
            newMap[chapaIdx] = { maquina_id: Number(maquina_id), maquina_nome: maq?.nome || '' };
        } else {
            delete newMap[chapaIdx];
        }
        setMachineAssignments(newMap);
        try {
            await api.post(`/cnc/machine-assignments/${loteAtual.id}`, {
                assignments: [{ chapaIdx, maquina_id: maquina_id ? Number(maquina_id) : null }],
            });
        } catch (err) { notify('Erro ao salvar atribuicao: ' + (err.error || err.message)); }
    };

    const autoAssignMachines = async () => {
        if (!loteAtual) return;
        try {
            const r = await api.post(`/cnc/machine-assignments/${loteAtual.id}/auto`);
            if (r.ok && r.assignments) {
                const map = {};
                for (const a of r.assignments) map[a.chapaIdx] = { maquina_id: a.maquina_id, maquina_nome: a.maquina_nome };
                setMachineAssignments(map);
                notify(`Auto-atribuicao: ${r.assignments.length} chapa(s) distribuida(s)`);
            }
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    // Machine color palette for border coding
    const machineColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const getMachineColor = (maquinaId) => {
        if (!maquinaId) return null;
        const idx = maquinas.findIndex(m => m.id === maquinaId);
        return machineColors[idx % machineColors.length];
    };

    // Load config defaults from API
    useEffect(() => {
        api.get('/cnc/config').then(cfg => {
            setEspacoPecas(cfg.espaco_pecas ?? 7);
            setKerf(cfg.kerf_padrao ?? 4);
            // modo_otimizador tem prioridade; fallback para usar_guilhotina
            setModo(cfg.modo_otimizador || (cfg.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects'));
            setRefilo(cfg.refilo ?? 10);
            setPermitirRotacao(cfg.permitir_rotacao !== 0);
            setDirecaoCorte(cfg.direcao_corte || 'misto');
            setUsarRetalhos(cfg.usar_retalhos !== 0);
            setIteracoes(cfg.iteracoes_otimizador ?? 300);
            setConsiderarSobra(cfg.considerar_sobra !== 0);
            setSobraMinW(cfg.sobra_min_largura ?? 300);
            setSobraMinH(cfg.sobra_min_comprimento ?? 600);
            setCfgLoaded(true);
        }).catch(() => setCfgLoaded(true));
    }, []);

    // Auto-save config quando parâmetros do otimizador mudam
    const cfgSaveTimer = useRef(null);
    useEffect(() => {
        if (!cfgLoaded) return;
        if (cfgSaveTimer.current) clearTimeout(cfgSaveTimer.current);
        cfgSaveTimer.current = setTimeout(() => {
            api.put('/cnc/config', {
                espaco_pecas: espacoPecas, kerf_padrao: kerf,
                modo_otimizador: modo,
                usar_guilhotina: modo === 'guilhotina' ? 1 : 0,
                refilo,
                permitir_rotacao: permitirRotacao ? 1 : 0,
                direcao_corte: direcaoCorte,
                usar_retalhos: usarRetalhos ? 1 : 0,
                iteracoes_otimizador: iteracoes,
                considerar_sobra: considerarSobra ? 1 : 0,
                sobra_min_largura: sobraMinW,
                sobra_min_comprimento: sobraMinH,
            }).catch(() => {});
        }, 1500);
        return () => { if (cfgSaveTimer.current) clearTimeout(cfgSaveTimer.current); };
    }, [cfgLoaded, espacoPecas, kerf, modo, refilo, permitirRotacao, direcaoCorte, usarRetalhos, iteracoes, considerarSobra, sobraMinW, sobraMinH]);

    const loadPlano = useCallback(() => {
        if (!loteAtual) return;
        setLoading(true);
        api.get(`/cnc/lotes/${loteAtual.id}`).then(async (d) => {
            let parsedPlano = null;
            if (d.plano_json) {
                try {
                    parsedPlano = JSON.parse(d.plano_json);
                    setPlano(parsedPlano);
                    setBandeja(parsedPlano.bandeja || {});
                } catch (_) { setPlano(null); setBandeja({}); }
            } else {
                setPlano(null);
                setBandeja({});
            }
            const map = {};
            for (const p of (d.pecas || [])) map[p.id] = p;

            // Multi-lote: load pecas from ALL lotes in the group so machining/names are available
            if (parsedPlano?.multi_lote && parsedPlano?.lote_ids?.length > 1) {
                const otherIds = parsedPlano.lote_ids.filter(id => id !== loteAtual.id);
                await Promise.all(otherIds.map(async (lid) => {
                    try {
                        const other = await api.get(`/cnc/lotes/${lid}`);
                        for (const p of (other.pecas || [])) {
                            if (!map[p.id]) map[p.id] = p;
                        }
                    } catch {}
                }));
            }

            setPecasMap(map);
        }).catch(e => notify(e.error || 'Erro ao carregar plano')).finally(() => setLoading(false));
    }, [loteAtual?.id]); // dep: só id — atualizar aproveitamento/outros campos não relança o efeito

    useEffect(() => { loadPlano(); }, [loadPlano]);

    // Load corte status
    const loadCorteStatus = useCallback(() => {
        if (!loteAtual) { setCortadasSet(new Set()); return; }
        api.get(`/cnc/expedicao/corte-status/${loteAtual.id}`).then(data => {
            setCortadasSet(new Set(data.cortadas || []));
        }).catch(() => setCortadasSet(new Set()));
    }, [loteAtual?.id]); // dep: só id — atualizar aproveitamento/outros campos não relança o efeito
    useEffect(() => { loadCorteStatus(); }, [loadCorteStatus]);

    // Mark chapa as cut
    const marcarChapaCortada = useCallback(async (chapaIdx) => {
        if (!plano || !loteAtual) return;
        const chapa = plano.chapas[chapaIdx];
        if (!chapa) return;

        const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
        if (pecaIds.length === 0) { notify('Nenhuma peça com ID nesta chapa'); return; }

        setMarkingChapa(chapaIdx);
        try {
            const data = await api.post('/cnc/expedicao/marcar-chapa', {
                lote_id: loteAtual.id,
                chapa_idx: chapaIdx,
                peca_ids: pecaIds,
            });
            if (data.ok) {
                notify(`Chapa ${chapaIdx + 1} marcada — ${data.registrados} peça(s) registradas${data.skipped > 0 ? ` (${data.skipped} já cortadas)` : ''}`);
                setCortadasSet(prev => {
                    const next = new Set(prev);
                    for (const id of pecaIds) next.add(id);
                    return next;
                });
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setMarkingChapa(null);
        }
    }, [plano, loteAtual, notify]);

    // Desmarcar chapa cortada
    const desmarcarChapaCortada = useCallback(async (chapaIdx) => {
        if (!plano || !loteAtual) return;
        const chapa = plano.chapas[chapaIdx];
        if (!chapa) return;

        const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
        if (pecaIds.length === 0) return;

        setMarkingChapa(chapaIdx);
        try {
            const data = await api.post('/cnc/expedicao/desmarcar-chapa', {
                lote_id: loteAtual.id,
                peca_ids: pecaIds,
            });
            if (data.ok) {
                notify(`Chapa ${chapaIdx + 1} desmarcada — ${data.removed} registro(s) removidos`);
                setCortadasSet(prev => {
                    const next = new Set(prev);
                    for (const id of pecaIds) next.delete(id);
                    return next;
                });
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setMarkingChapa(null);
        }
    }, [plano, loteAtual, notify]);

    const planoIdRef = useRef(null); // rastreia se é um plano NOVO ou atualização do mesmo
    useEffect(() => {
        const newId = plano ? `${plano.chapas?.length}_${plano.modo}_${plano.timestamp || ''}` : null;
        const isNewPlan = planoIdRef.current !== newId && planoIdRef.current !== null;
        planoIdRef.current = newId;
        if (isNewPlan) {
            // Plano novo (re-otimização) → volta pra chapa 0
            setSelectedChapa(0); setZoomLevel(1); setPanOffset({ x: 0, y: 0 });
        } else if (plano) {
            // Mesmo plano atualizado (edição) → mantém chapa atual, só garante que é válida
            setSelectedChapa(prev => Math.min(prev, (plano.chapas?.length || 1) - 1));
        }
    }, [plano]);

    const otimizar = async () => {
        if (!loteAtual) return;
        if (usarRetalhos) {
            // Load retalhos preview first
            setRetalhosPreviewLoading(true);
            setShowRetalhosModal(true);
            try {
                const data = await api.get(`/cnc/retalhos-preview/${loteAtual.id}`);
                setRetalhosPreview(data.grupos || []);
                // Pre-select suggested ones
                const sel = {};
                for (const g of (data.grupos || [])) {
                    for (const r of (g.retalhos || [])) {
                        sel[r.id] = r.sugerido;
                    }
                }
                setRetalhosSelected(sel);
            } catch (err) {
                notify('Erro ao carregar retalhos: ' + (err.error || err.message));
                setShowRetalhosModal(false);
            } finally {
                setRetalhosPreviewLoading(false);
            }
            return; // Modal will call doOtimizar when confirmed
        }
        doOtimizar([]);
    };

    const doOtimizar = async (retSelIds) => {
        if (!loteAtual) return;
        setShowRetalhosModal(false);
        setOtimizando(true);
        setOtimProgress({ fase: 'Classificando peças...', pct: 5 });
        setUltimaEstrategia(null);
        setUltimoCusto(null);

        // Progresso simulado por fases (tempo real via WebSocket não está disponível ainda)
        const fases = qualidade === 'rapido'
            ? [
                { pct: 20, msg: 'BLF + MaxRects...', delay: 300 },
                { pct: 70, msg: 'Selecionando melhor layout...', delay: 600 },
                { pct: 90, msg: 'Gerando plano de corte...', delay: 400 },
              ]
            : qualidade === 'maximo'
            ? [
                { pct: 15, msg: 'Two-Phase + Guillotine...', delay: 400 },
                { pct: 35, msg: 'Ruin & Recreate...', delay: 800 },
                { pct: 55, msg: 'BRKGA genético (3×)...', delay: 1200 },
                { pct: 75, msg: 'Simulated Annealing (3×)...', delay: 1400 },
                { pct: 90, msg: 'Gap filling + cross-bin...', delay: 600 },
              ]
            : [
                { pct: 20, msg: 'MaxRects + Two-Phase...', delay: 350 },
                { pct: 45, msg: 'BRKGA genético...', delay: 700 },
                { pct: 65, msg: 'Simulated Annealing...', delay: 800 },
                { pct: 85, msg: 'Gap filling...', delay: 400 },
              ];
        let progressTimer;
        let faseIdx = 0;
        const tick = () => {
            if (faseIdx < fases.length) {
                const f = fases[faseIdx++];
                setOtimProgress({ fase: f.msg, pct: f.pct });
                progressTimer = setTimeout(tick, f.delay);
            }
        };
        progressTimer = setTimeout(tick, 200);

        try {
            const r = await api.post(`/cnc/otimizar/${loteAtual.id}`, {
                espaco_pecas: espacoPecas,
                refilo,
                permitir_rotacao: permitirRotacao,
                modo,
                kerf,
                usar_retalhos: usarRetalhos,
                retalhos_selecionados: retSelIds,
                iteracoes,
                considerar_sobra: considerarSobra,
                sobra_min_largura: sobraMinW,
                sobra_min_comprimento: sobraMinH,
                direcao_corte: direcaoCorte,
                limiar_pequena: limiarPequena,
                limiar_super_pequena: limiarSuperPequena,
                qualidade,
            });
            clearTimeout(progressTimer);
            if (r.ok) {
                setOtimProgress({ fase: 'Concluído!', pct: 100 });
                setPlano(r.plano);
                setPendingChanges(0);
                setUndoStack([]); setRedoStack([]);
                setUltimaEstrategia(r.estrategia_resumo || r.modo || null);
                const mats = Object.values(r.plano?.materiais || {});
                const minTeorico = mats.reduce((s, m) => s + (m.min_teorico_chapas || 0), 0);
                const eficiencia = minTeorico > 0 ? Math.round(minTeorico / r.total_chapas * 100) : 100;
                notify(`Otimizado: ${r.total_chapas} chapa(s), ${r.aproveitamento}% aproveitamento (efic. ${eficiencia}%)`);
                loadLotes();
                // Buscar dados de custo do desperdício automaticamente
                api.get(`/cnc/relatorio-desperdicio/${loteAtual.id}`)
                    .then(d => { if (d?.resumo) setUltimoCusto(d.resumo); })
                    .catch(() => {});
                const d = await api.get(`/cnc/lotes/${loteAtual.id}`);
                const map = {};
                for (const p of (d.pecas || [])) map[p.id] = p;
                setPecasMap(map);
                setLoteAtual(d);
                setTimeout(() => setOtimProgress(null), 2000);
            }
        } catch (err) {
            clearTimeout(progressTimer);
            notify('Erro: ' + (err.error || err.message));
            setOtimProgress(null);
        } finally {
            setOtimizando(false);
        }
    };

    // Otimiza sequência de corte da chapa atual via Nearest-Neighbour TSP
    const handleTspOptimize = async () => {
        if (!plano || !loteAtual) return;
        const chapa = plano.chapas?.[selectedChapa];
        if (!chapa?.cortes?.length) { notify('Esta chapa não tem cortes para otimizar'); return; }
        setTspLoading(true);
        try {
            const antes = calcRapidDistance(chapa.cortes);
            const cortesOtimizados = optimizeCutSequence(chapa.cortes);
            const depois = calcRapidDistance(cortesOtimizados);
            const economiaMm = Math.round(antes - depois);
            const economiaPct = antes > 0 ? Math.round((economiaMm / antes) * 100) : 0;

            // Salvar via endpoint de ajuste de plano
            const newPlano = JSON.parse(JSON.stringify(plano)); // deep clone
            newPlano.chapas[selectedChapa].cortes = cortesOtimizados;
            newPlano.chapas[selectedChapa].cortes_otimizados_tsp = true;

            await api.put(`/cnc/plano/${loteAtual.id}/ajustar`, {
                action: 'set_plano',
                plano: newPlano,
            }).catch(() => {}); // endpoint pode não existir — tenta salvar, não bloqueia

            setPlano(newPlano);
            setTspResult({ economia_mm: economiaMm, economia_pct: economiaPct, antes_mm: Math.round(antes), depois_mm: Math.round(depois) });
            notify(`Sequência otimizada: -${economiaMm}mm de percurso em vazio (${economiaPct}%)`);
        } catch (err) {
            notify('Erro ao otimizar sequência: ' + err.message);
        } finally {
            setTspLoading(false);
        }
    };

    const cfgInput = (label, value, setter, opts = {}) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</label>
            <input type="number" value={value} onChange={e => setter(Number(e.target.value))}
                className={Z.inp} style={{ width: opts.w || 90, fontSize: 12, padding: '5px 8px' }}
                min={opts.min ?? 0} max={opts.max} step={opts.step ?? 1} />
        </div>
    );

    const cfgToggle = (label, value, setter, tip) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setter(!value)} title={tip}>
            <div style={{
                width: 36, height: 20, borderRadius: 10, padding: 2, transition: 'all .2s',
                background: value ? 'var(--primary)' : 'var(--bg-muted)',
                border: `1px solid ${value ? 'var(--primary)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center',
            }}>
                <div style={{
                    width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'all .2s',
                    transform: value ? 'translateX(16px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        </div>
    );

    // Zoom handlers for detail view — zoom towards mouse position
    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        setZoomLevel(oldZoom => {
            const newZoom = Math.max(1, Math.min(5, oldZoom + delta));
            if (newZoom === oldZoom) return oldZoom;
            const ratio = newZoom / oldZoom;
            // Adjust pan to keep the point under the mouse cursor fixed
            setPanOffset(pan => ({
                x: mouseX - (mouseX - pan.x) * ratio,
                y: mouseY - (mouseY - pan.y) * ratio,
            }));
            return newZoom;
        });
    };
    const handlePanStart = (e) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            setIsPanning(true);
            setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        }
    };
    const handlePanMove = (e) => {
        if (!isPanning) return;
        setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    };
    const handlePanEnd = () => setIsPanning(false);
    const resetView = () => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); };

    // Module color palette
    const modColorPalette = ['#5b7fa6', '#8b6e4e', '#6a8e6e', '#9e7b5c', '#7a8999', '#a67c52', '#6b8f8b', '#8a7d6d', '#5f7d8a', '#7d6b5e'];
    const isMultiLote = plano?.multi_lote && plano?.lotes_info?.length > 1;

    // Classification colors: green=normal, yellow=pequena, red=super_pequena
    const classColors = { normal: '#22c55e', pequena: '#f59e0b', super_pequena: '#ef4444' };
    const classLabels = { normal: 'Normal', pequena: 'Pequena', super_pequena: 'Super Pequena' };

    // Client-side classification helper (for realtime preview when thresholds change)
    const classifyLocal = (w, h) => {
        const minDim = Math.min(w, h);
        if (minDim < limiarSuperPequena) return 'super_pequena';
        if (minDim < limiarPequena) return 'pequena';
        return 'normal';
    };

    const getModColor = (pecaId, pecaObj) => {
        // Classification mode: color by piece size
        if (colorMode === 'classificacao' && pecaObj) {
            const cls = pecaObj.classificacao || classifyLocal(pecaObj.w, pecaObj.h);
            return classColors[cls] || classColors.normal;
        }
        // Multi-lote: colorir por projeto (cada lote = cor diferente)
        if (isMultiLote && pecaObj?.cor) return pecaObj.cor;
        if (isMultiLote && pecaObj?.loteId && plano.lotes_info) {
            const info = plano.lotes_info.find(l => l.id === pecaObj.loteId);
            if (info?.cor) return info.cor;
        }
        // Color by ambiente/environment (more useful than module)
        const piece = pecasMap[pecaId];
        if (!piece) return modColorPalette[0];
        const ambienteName = piece.ambiente || piece.modulo || '';
        if (ambienteName) {
            // Generate consistent color from ambiente name hash
            let hash = 0;
            for (let i = 0; i < ambienteName.length; i++) hash = ((hash << 5) - hash + ambienteName.charCodeAt(i)) | 0;
            return modColorPalette[Math.abs(hash) % modColorPalette.length];
        }
        const modId = piece.modulo_id || 0;
        return modColorPalette[modId % modColorPalette.length];
    };

    // Collect legend: classification mode or module mode
    const moduleLegend = plano ? (() => {
        if (colorMode === 'classificacao') {
            // Classification legend — show counts per class
            const stats = plano.classificacao?.stats || {};
            const total = (stats.normal || 0) + (stats.pequena || 0) + (stats.super_pequena || 0);
            // Also compute client-side counts (if thresholds changed after optimization)
            let clientStats = { normal: 0, pequena: 0, super_pequena: 0 };
            for (const ch of plano.chapas) {
                for (const p of ch.pecas) {
                    const cls = classifyLocal(p.w, p.h);
                    clientStats[cls]++;
                }
            }
            return [
                { name: `Normal (≥${limiarPequena}mm) — ${clientStats.normal} pç`, color: classColors.normal },
                { name: `Pequena (<${limiarPequena}mm) — ${clientStats.pequena} pç`, color: classColors.pequena },
                { name: `Super Pequena (<${limiarSuperPequena}mm) — ${clientStats.super_pequena} pç`, color: classColors.super_pequena },
            ].filter(l => {
                const count = parseInt(l.name.match(/— (\d+)/)?.[1] || '0');
                return count > 0;
            });
        }
        if (isMultiLote) {
            return plano.lotes_info.map(l => ({
                name: `${l.cliente || l.projeto || l.nome}${l.projeto && l.cliente ? ' — ' + l.projeto : ''}`,
                color: l.cor,
            }));
        }
        const mods = {};
        for (const ch of plano.chapas) {
            for (const p of ch.pecas) {
                const piece = pecasMap[p.pecaId];
                if (piece?.modulo_desc) {
                    const modId = piece.modulo_id || 0;
                    mods[modId] = { name: piece.modulo_desc, color: modColorPalette[modId % modColorPalette.length] };
                }
            }
        }
        return Object.values(mods);
    })() : [];

    // Material cost summary
    const costSummary = plano ? (() => {
        const byMat = {};
        for (const ch of plano.chapas) {
            const key = ch.material_code || ch.material;
            if (!byMat[key]) byMat[key] = { nome: ch.material, count: 0, preco: ch.preco || 0, area: 0 };
            byMat[key].count++;
            byMat[key].area += (ch.comprimento * ch.largura) / 1e6;
        }
        return Object.values(byMat);
    })() : [];

    const totalCost = costSummary.reduce((s, m) => s + m.count * m.preco, 0);

    // Pending changes counter (unsaved adjustments)
    const [pendingChanges, setPendingChanges] = useState(0);

    // ═══ Validation state ═══
    const [validationResult, setValidationResult] = useState(null); // { conflicts: [] }
    const [validating, setValidating] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const validarUsinagens = async () => {
        if (!loteAtual) return;
        setValidating(true);
        try {
            const r = await api.get(`/cnc/validar-usinagens/${loteAtual.id}`);
            setValidationResult(r);
            setShowValidation(true);
            if (r.conflicts?.length === 0) notify('Nenhum conflito encontrado.');
            else notify(`${r.conflicts.length} conflito(s) detectado(s).`);
        } catch (err) {
            notify('Erro ao validar: ' + (err.error || err.message));
        } finally { setValidating(false); }
    };

    // Handle manual adjustments — zero-refresh: update local state, sync to server silently
    // ═══ Feature 1: Per-piece costing ═══
    const [custosData, setCustosData] = useState(null);
    const [custosLoading, setCustosLoading] = useState(false);
    const [showCustos, setShowCustos] = useState(false);
    const [custosExpanded, setCustosExpanded] = useState({});
    const loadCustos = async () => {
        if (!loteAtual) return;
        setCustosLoading(true);
        try {
            const data = await api.get(`/cnc/custos/${loteAtual.id}`);
            setCustosData(data);
            setShowCustos(true);
        } catch (err) {
            notify('Erro ao carregar custos: ' + (err.error || err.message));
        } finally { setCustosLoading(false); }
    };

    // ═══ Feature 2: Multi-format export ═══
    const [showExportMenu, setShowExportMenu] = useState(false);
    useEffect(() => {
        if (!showExportMenu) return;
        const close = () => setShowExportMenu(false);
        setTimeout(() => document.addEventListener('click', close), 0);
        return () => document.removeEventListener('click', close);
    }, [showExportMenu]);
    const handleExport = async (format) => {
        if (!loteAtual) return;
        setShowExportMenu(false);
        try {
            const token = localStorage.getItem('erp_token');
            const resp = await fetch(`/api/cnc/export/${loteAtual.id}/${format}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) throw new Error('Erro ao exportar');
            const blob = await resp.blob();
            const contentType = resp.headers.get('content-type') || '';
            if (format === 'resumo') {
                // Open HTML in new tab
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            } else {
                // Download file
                const ext = format === 'csv' ? '.csv' : '.json';
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `plano_${loteAtual.nome || loteAtual.id}${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
            notify(`Exportado: ${format.toUpperCase()}`);
        } catch (err) {
            notify('Erro ao exportar: ' + err.message);
        }
    };

    // ═══ Feature 3: Toolpath Simulator ═══
    const [toolpathOpen, setToolpathOpen] = useState(false);
    const [toolpathMoves, setToolpathMoves] = useState([]);
    const [toolpathChapa, setToolpathChapa] = useState(null);

    // ═══ Feature 4: Version diff ═══
    const [showVersions, setShowVersions] = useState(false);
    const [versions, setVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [diffV1, setDiffV1] = useState(null);
    const [diffV2, setDiffV2] = useState(null);
    const [diffResult, setDiffResult] = useState(null);
    const [diffLoading, setDiffLoading] = useState(false);
    const loadVersions = async () => {
        if (!loteAtual) return;
        setVersionsLoading(true);
        try {
            const r = await api.get(`/cnc/plano/${loteAtual.id}/versions`);
            setVersions(r.versions || []);
            setShowVersions(true);
        } catch (err) {
            notify('Erro ao carregar versões: ' + (err.error || err.message));
        } finally { setVersionsLoading(false); }
    };
    const loadDiff = async () => {
        if (!diffV1 || !diffV2 || !loteAtual) return;
        setDiffLoading(true);
        try {
            const r = await api.get(`/cnc/plano/${loteAtual.id}/versions/diff/${diffV1}/${diffV2}`);
            setDiffResult(r);
        } catch (err) {
            notify('Erro ao comparar versões: ' + (err.error || err.message));
        } finally { setDiffLoading(false); }
    };

    // ═══ Gerar G-Code por chapa ═══
    const [gcodeLoading, setGcodeLoading] = useState(null); // chapaIdx sendo gerado
    const [gcodePreview, setGcodePreview] = useState(null); // { gcode, filename, stats, alertas, chapaIdx, contorno_tool, ferramentas_faltando }
    const [inlineSimData, setInlineSimData] = useState(null); // { gcode, chapa } for inline simulator in Plano de Corte
    const [toolPanel, setToolPanel] = useState(null);
    const [toolPanelOpen, setToolPanelOpen] = useState(false);
    const [toolPanelLoading, setToolPanelLoading] = useState(false);
    const [toolPanelDirty, setToolPanelDirty] = useState(false);
    // Máquina selecionada para geração de G-code (global, pode ser overridden por assignment de chapa)
    const [maquinaGcode, setMaquinaGcode] = useState('');
    const selectedMachineArea = useMemo(() => {
        if (!maquinaGcode) return null;
        const m = maquinas.find(m => m.id === Number(maquinaGcode));
        return m ? { x_max: m.x_max || 2800, y_max: m.y_max || 1900, nome: m.nome } : null;
    }, [maquinaGcode, maquinas]);

    const handleGerarGcode = async (chapaIdx) => {
        if (!loteAtual) return;
        setGcodeLoading(chapaIdx);
        try {
            // Prioridade: assignment da chapa > seleção global > padrão do servidor
            const assignedMaq = machineAssignments[chapaIdx]?.maquina_id;
            const maqId = assignedMaq || (maquinaGcode ? Number(maquinaGcode) : undefined);
            const body = maqId ? { maquina_id: maqId } : {};
            const r = await api.post(`/cnc/gcode/${loteAtual.id}/chapa/${chapaIdx}`, body);
            if (r.ok) {
                // Pegar dados da chapa do plano para o simulador 2D
                const chapaInfo = plano?.chapas?.[chapaIdx] || null;
                const chapaSimData = chapaInfo ? (() => {
                        // Máquina padrão: X=largura, Y=comprimento (eixos trocados)
                        // Se trocar_eixos_xy=1, mantém original (X=comprimento, Y=largura)
                        const maqUsada = maquinas.find(m => m.id === maqId) || maquinas.find(m => m.padrao) || {};
                        const swapOff = maqUsada.trocar_eixos_xy === 1;
                        const cw = swapOff ? chapaInfo.comprimento : chapaInfo.largura;
                        const cl = swapOff ? chapaInfo.largura : chapaInfo.comprimento;
                        return {
                            comprimento: cw,
                            largura: cl,
                            refilo: chapaInfo.refilo ?? 10,
                            espessura: chapaInfo.espessura_real || chapaInfo.espessura || 18.5,
                            material_code: chapaInfo.material_code || '',
                            pecas: (chapaInfo.pecas || []).map(p => ({
                                x: swapOff ? p.x : p.y, y: swapOff ? p.y : p.x,
                                w: swapOff ? p.w : p.h, h: swapOff ? p.h : p.w,
                                nome: p.nome,
                            })),
                            retalhos: (chapaInfo.retalhos || []).map(r => ({
                                x: swapOff ? r.x : r.y, y: swapOff ? r.y : r.x,
                                w: swapOff ? r.w : r.h, h: swapOff ? r.h : r.w,
                            })),
                        };
                    })() : null;
                // Cache real stats from G-code generation
                if (r.stats) setChapaRealStats(prev => ({ ...prev, [chapaIdx]: r.stats }));
                // Store inline sim data for Plano de Corte view
                setInlineSimData(chapaSimData ? { gcode: r.gcode, chapa: chapaSimData, chapaIdx } : null);
                setGcodePreview({
                    gcode: r.gcode,
                    filename: r.filename || `chapa_${chapaIdx + 1}.nc`,
                    stats: r.stats || {},
                    alertas: r.alertas || [],
                    chapaIdx,
                    contorno_tool: r.contorno_tool || null,
                    chapa: chapaSimData,
                });
            } else if (r.ferramentas_faltando?.length > 0) {
                // Mostrar detalhes de ferramentas faltantes no preview modal (sem G-code)
                setGcodePreview({
                    gcode: '', filename: '', stats: r.stats || {}, chapaIdx,
                    contorno_tool: r.contorno_tool || null, chapa: null,
                    alertas: [
                        { tipo: 'erro_critico', msg: `BLOQUEADO: ${r.ferramentas_faltando.length} ferramenta(s) faltando no magazine da máquina` },
                        ...(r.ferramentas_faltando_detalhes || []).map(d =>
                            ({ tipo: 'erro_critico', msg: `Ferramenta "${d.tool_code}" necessária para ${d.operacao} na peça "${d.peca}"` })
                        ),
                        ...(r.alertas || []),
                    ],
                    ferramentas_faltando: r.ferramentas_faltando,
                });
                notify(`G-Code bloqueado: ${r.ferramentas_faltando.length} ferramenta(s) faltando`, 'error');
            } else {
                // Show error in modal with details instead of just a toast
                setGcodePreview({
                    gcode: '', filename: '', stats: r.stats || {}, chapaIdx,
                    contorno_tool: null, chapa: null,
                    alertas: [{ tipo: 'erro_critico', msg: r.error || 'Erro desconhecido ao gerar G-Code' }, ...(r.alertas || [])],
                    ferramentas_faltando: [],
                });
                notify(r.error || 'Erro ao gerar G-Code', 'error');
            }
        } catch (err) {
            // Network/server error — show in modal too
            const errMsg = err.error || err.message || 'Erro de rede ou servidor indisponível';
            setGcodePreview({
                gcode: '', filename: '', stats: {}, chapaIdx,
                contorno_tool: null, chapa: null,
                alertas: [{ tipo: 'erro_critico', msg: errMsg }],
                ferramentas_faltando: [],
            });
            notify('Erro ao gerar G-Code: ' + errMsg, 'error');
        } finally {
            setGcodeLoading(null);
        }
    };

    // G-code de peça avulsa
    const handleGerarGcodePeca = async (chapaIdx, pecaIdx) => {
        if (!loteAtual) return;
        setGcodeLoading(chapaIdx);
        try {
            const assignedMaq = machineAssignments[chapaIdx]?.maquina_id;
            const maqId = assignedMaq || (maquinaGcode ? Number(maquinaGcode) : undefined);
            const body = maqId ? { maquina_id: maqId } : {};
            const r = await api.post(`/cnc/gcode/${loteAtual.id}/chapa/${chapaIdx}/peca/${pecaIdx}`, body);
            if (r.ok) {
                setGcodePreview({
                    gcode: r.gcode,
                    filename: r.filename || `peca_${pecaIdx + 1}.nc`,
                    stats: r.stats || {},
                    alertas: r.alertas || [],
                    chapaIdx,
                    contorno_tool: r.contorno_tool || null,
                    chapa: null, // single piece doesn't need full chapa sim
                });
                notify(`G-Code gerado para peça ${pecaIdx + 1}`);
            } else {
                setGcodePreview({
                    gcode: '', filename: '', stats: r.stats || {}, chapaIdx,
                    contorno_tool: null, chapa: null,
                    alertas: [{ tipo: 'erro_critico', msg: r.error || 'Erro' }, ...(r.alertas || [])],
                    ferramentas_faltando: r.ferramentas_faltando || [],
                });
                notify(r.error || 'Erro ao gerar G-Code da peça', 'error');
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message), 'error');
        } finally {
            setGcodeLoading(null);
        }
    };

    const handleOpenToolPanel = async () => {
        if (!loteAtual) return;
        setToolPanelLoading(true);
        try {
            const r = await api.get(`/cnc/lotes/${loteAtual.id}/operacoes-scan`);
            setToolPanel(r);
            setToolPanelOpen(true);
            setToolPanelDirty(false);
        } catch (err) {
            notify(err.error || 'Erro ao escanear operações', 'error');
        } finally {
            setToolPanelLoading(false);
        }
    };

    const handleDownloadGcode = () => {
        if (!gcodePreview) return;
        const blob = new Blob([gcodePreview.gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = gcodePreview.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`GCode baixado: ${gcodePreview.filename}`);
        setGcodePreview(null);
    };

    const handleSendToMachine = async () => {
        if (!gcodePreview || !loteAtual) return;
        try {
            const r = await api.post(`/cnc/enviar-gcode/${loteAtual.id}/chapa/${gcodePreview.chapaIdx}`, {});
            if (r.ok) {
                notify(`Enviado: ${r.filename} → ${r.msg || r.path}`, 'success');
            } else {
                notify(r.error || 'Erro ao enviar', 'error');
            }
        } catch (err) {
            notify(err.error || 'Erro ao enviar para máquina', 'error');
        }
    };

    const handleAdjust = async (params) => {
        if (!loteAtual || !plano) return;
        // Save snapshot for undo before action
        setUndoStack(prev => [...prev.slice(-49), JSON.stringify(plano)]);
        setRedoStack([]);

        // ═══ Optimistic local update for move/rotate — no scroll jump ═══
        if (params.action === 'move' && params.chapaIdx != null && params.pecaIdx != null) {
            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== params.chapaIdx) return ch;
                    const pecas = ch.pecas.map((p, pi) => {
                        if (pi !== params.pecaIdx) return p;
                        return { ...p, x: params.x, y: params.y };
                    });
                    return { ...ch, pecas };
                });
                return { ...prev, chapas };
            });
            setPendingChanges(prev => prev + 1);
            // Sync to server in background (no await, no re-render from response)
            api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params).catch(err => {
                if (err.collision) notify('Colisão detectada no servidor — desfazendo.');
                else notify('Erro ao salvar posição: ' + (err.error || err.message));
                // Revert on server error
                setUndoStack(prev => {
                    const last = prev[prev.length - 1];
                    if (last) setPlano(JSON.parse(last));
                    return prev.slice(0, -1);
                });
            });
            return;
        }

        if (params.action === 'rotate' && params.chapaIdx != null && params.pecaIdx != null) {
            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== params.chapaIdx) return ch;
                    const pecas = ch.pecas.map((p, pi) => {
                        if (pi !== params.pecaIdx) return p;
                        return { ...p, w: p.h, h: p.w, rotated: !p.rotated };
                    });
                    return { ...ch, pecas };
                });
                return { ...prev, chapas };
            });
            setPendingChanges(prev => prev + 1);
            api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params).catch(() => {
                setUndoStack(prev => {
                    const last = prev[prev.length - 1];
                    if (last) setPlano(JSON.parse(last));
                    return prev.slice(0, -1);
                });
            });
            return;
        }

        if (params.action === 'flip' && params.chapaIdx != null && params.pecaIdx != null) {
            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== params.chapaIdx) return ch;
                    const pecas = ch.pecas.map((p, pi) => {
                        if (pi !== params.pecaIdx) return p;
                        return { ...p, lado_ativo: (p.lado_ativo === 'B') ? 'A' : 'B' };
                    });
                    return { ...ch, pecas };
                });
                return { ...prev, chapas };
            });
            setPendingChanges(prev => prev + 1);
            api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params).catch(() => {
                setUndoStack(prev => {
                    const last = prev[prev.length - 1];
                    if (last) setPlano(JSON.parse(last));
                    return prev.slice(0, -1);
                });
            });
            return;
        }

        // ═══ Optimistic local update for to_transfer/to_bandeja ═══
        if ((params.action === 'to_transfer' || params.action === 'to_bandeja') && params.chapaIdx != null && params.pecaIdx != null) {
            const srcChapa = plano.chapas[params.chapaIdx];
            if (!srcChapa || !srcChapa.pecas[params.pecaIdx]) return;
            const matKey = srcChapa.material_code || srcChapa.material || 'unknown';
            const transferPeca = {
                ...srcChapa.pecas[params.pecaIdx],
                fromChapaIdx: params.chapaIdx,
                fromMaterial: matKey,
                espessura: srcChapa.espessura,
                veio: srcChapa.veio,
            };

            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== params.chapaIdx) return ch;
                    return { ...ch, pecas: ch.pecas.filter((_, pi) => pi !== params.pecaIdx) };
                });
                const newBandeja = { ...(prev.bandeja || {}) };
                if (!newBandeja[matKey]) newBandeja[matKey] = [];
                newBandeja[matKey] = [...newBandeja[matKey], transferPeca];
                return { ...prev, chapas, bandeja: newBandeja };
            });
            setBandeja(prev => {
                const nb = { ...prev };
                if (!nb[matKey]) nb[matKey] = [];
                nb[matKey] = [...nb[matKey], transferPeca];
                return nb;
            });
            setPendingChanges(prev => prev + 1);
            api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params).then(r => {
                if (r?.ok && r.plano) {
                    setPlano(r.plano);
                    setBandeja(r.plano.bandeja || {});
                }
            }).catch(err => {
                notify('Erro ao enviar para bandeja: ' + (err.error || err.message));
                setUndoStack(prev => {
                    const last = prev[prev.length - 1];
                    if (last) { const restored = JSON.parse(last); setPlano(restored); setBandeja(restored.bandeja || {}); }
                    return prev.slice(0, -1);
                });
            });
            return;
        }

        // ═══ from_bandeja: update otimista — elimina o "page refresh" visual ═══
        // Sem update otimista, caia no path genérico (await + setPlano full) que parecia um refresh.
        if (params.action === 'from_bandeja') {
            const { materialKey, bandejaIdx, targetChapaIdx, x, y } = params;
            const bandejaArr = (bandeja[materialKey] || []);
            const bp = bandejaArr[bandejaIdx];
            if (!bp) return;

            // Constrói peça nova sem metadados de bandeja
            const { fromChapaIdx: _fc, fromMaterial: _fm, ...cleanPeca } = bp;
            const newPeca = { ...cleanPeca, x, y };

            // 1. Update local imediato (sem await)
            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== targetChapaIdx) return ch;
                    return { ...ch, pecas: [...ch.pecas, newPeca] };
                });
                return { ...prev, chapas };
            });
            setBandeja(prev => {
                const nb = { ...prev };
                nb[materialKey] = (nb[materialKey] || []).filter((_, i) => i !== bandejaIdx);
                if (nb[materialKey].length === 0) delete nb[materialKey];
                return nb;
            });
            setPendingChanges(prev => prev + 1);

            // 2. Sync servidor em background.
            // Nenhum setState no .then() — qualquer mudança de referência em loteAtual
            // recriava os useCallbacks [loteAtual?.id] e disparava loadPlano() de novo,
            // causando o scroll-to-top ("page refresh" visual). Estado otimista já está correto.
            api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params).then(_r => {
                // servidor confirmou — estado otimista já aplicado, nada a fazer
            }).catch(err => {
                if (err.collision) notify('Colisão! Peça não pode ser colocada nesta posição.');
                else notify('Erro ao posicionar peça: ' + (err.error || err.message));
                // Reverte para snapshot anterior
                setUndoStack(prev => {
                    const last = prev[prev.length - 1];
                    if (last) { const restored = JSON.parse(last); setPlano(restored); setBandeja(restored.bandeja || {}); }
                    return prev.slice(0, -1);
                });
            });
            return;
        }

        // ═══ Non-move actions: keep server round-trip with scroll preservation ═══
        const mainEl = document.querySelector('main');
        const savedScroll = mainEl?.scrollTop ?? 0;
        const restoreScroll = () => {
            // Use multiple rAF + timeout to survive React re-render cycles
            const doRestore = () => { if (mainEl) mainEl.scrollTop = savedScroll; };
            doRestore();
            requestAnimationFrame(doRestore);
            requestAnimationFrame(() => { setTimeout(doRestore, 30); setTimeout(doRestore, 80); setTimeout(doRestore, 150); });
        };

        try {
            const r = await api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params);
            if (r.ok) {
                setPlano(r.plano);
                setBandeja(r.plano.bandeja || {});
                setPendingChanges(prev => prev + 1);
                if (r.aproveitamento != null) {
                    setLoteAtual(prev => prev ? { ...prev, aproveitamento: r.aproveitamento, total_chapas: r.plano?.chapas?.length || prev.total_chapas } : prev);
                }
                restoreScroll();
            }
        } catch (err) {
            setUndoStack(prev => prev.slice(0, -1));
            if (err.locked) {
                notify(err.error || 'Chapa travada — destrave para editar.');
            } else if (err.collision) {
                notify('Colisão! Peça não pode ser colocada nesta posição.');
            } else if (err.materialMismatch) {
                notify(err.error || 'Material incompatível entre chapas.');
            } else {
                notify('Erro: ' + (err.error || err.message));
            }
            restoreScroll();
        }
    };

    // Undo — zero-refresh: restore local state, sync in background
    const handleUndo = async () => {
        if (undoStack.length === 0 || !loteAtual) return;
        const mainEl = document.querySelector('main');
        const savedScroll = mainEl?.scrollTop ?? 0;
        const prevState = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, JSON.stringify(plano)]);
        setUndoStack(prev => prev.slice(0, -1));
        const restored = JSON.parse(prevState);
        setPlano(restored);
        setBandeja(restored.bandeja || {});
        setPendingChanges(prev => prev + 1);
        requestAnimationFrame(() => { requestAnimationFrame(() => { if (mainEl) mainEl.scrollTop = savedScroll; }); });
        // Sync to server silently (no re-fetch)
        try {
            await api.put(`/cnc/plano/${loteAtual.id}/ajustar`, { action: 'restore', planoData: prevState });
        } catch (_) {}
    };

    // Redo — zero-refresh
    const handleRedo = async () => {
        if (redoStack.length === 0 || !loteAtual) return;
        const mainEl = document.querySelector('main');
        const savedScroll = mainEl?.scrollTop ?? 0;
        const nextState = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, JSON.stringify(plano)]);
        setRedoStack(prev => prev.slice(0, -1));
        const restored = JSON.parse(nextState);
        setPlano(restored);
        requestAnimationFrame(() => { requestAnimationFrame(() => { if (mainEl) mainEl.scrollTop = savedScroll; }); });
        setBandeja(restored.bandeja || {});
        setPendingChanges(prev => prev + 1);
        // Sync to server silently (no re-fetch)
        try {
            await api.put(`/cnc/plano/${loteAtual.id}/ajustar`, { action: 'restore', planoData: nextState });
        } catch (_) {}
    };

    // Piece selection handler
    const handleSelectPiece = (pecaIdx, toggle) => {
        if (toggle) {
            setSelectedPieces(prev => prev.includes(pecaIdx) ? prev.filter(i => i !== pecaIdx) : [...prev, pecaIdx]);
        } else {
            setSelectedPieces([pecaIdx]);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            // Ignore when typing in inputs
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

            // Ctrl+Z / Ctrl+Y — undo/redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }

            // Escape — clear selection
            if (e.key === 'Escape') { setSelectedPieces([]); setShowShortcutsHelp(false); return; }

            // Number keys 1-9 — select chapa by index
            if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const idx = Number(e.key) - 1;
                if (plano && plano.chapas && idx < plano.chapas.length) {
                    setSelectedChapa(idx);
                }
                return;
            }

            // Left/Right arrows — navigate chapas
            if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setSelectedChapa(prev => Math.max(0, prev - 1));
                return;
            }
            if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (plano && plano.chapas) setSelectedChapa(prev => Math.min(plano.chapas.length - 1, prev + 1));
                return;
            }

            // R — rotate selected piece(s)
            if (e.key === 'r' || e.key === 'R') {
                if (selectedPieces.length > 0 && plano) {
                    for (const pecaIdx of selectedPieces) {
                        handleAdjust({ action: 'rotate', chapaIdx: selectedChapa, pecaIdx });
                    }
                }
                return;
            }

            // Space — toggle marcar/desmarcar chapa cortada
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                if (plano && plano.chapas[selectedChapa] && markingChapa === null) {
                    const chapa = plano.chapas[selectedChapa];
                    const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
                    const allCut = pecaIds.length > 0 && pecaIds.every(id => cortadasSet.has(id));
                    if (allCut) desmarcarChapaCortada(selectedChapa);
                    else marcarChapaCortada(selectedChapa);
                }
                return;
            }

            // F — toggle fullscreen for chapa visualization
            if (e.key === 'f' || e.key === 'F') {
                if (chapaVizContainerRef.current) {
                    if (!document.fullscreenElement) {
                        chapaVizContainerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
                    } else {
                        document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
                    }
                }
                return;
            }

            // G — gerar G-code da chapa selecionada
            if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
                if (plano && plano.chapas[selectedChapa]) {
                    handleGerarGcode(selectedChapa);
                }
                return;
            }

            // E — ir para etiquetas
            if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) {
                setTab('gcode');
                return;
            }

            // P — imprimir folha de produção
            if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
                if (plano && plano.chapas[selectedChapa]) {
                    printFolhaProducao(plano.chapas[selectedChapa], selectedChapa, pecasMap, loteAtual, getModColor, kerf, refilo, plano.chapas.length);
                }
                return;
            }

            // D — ir para dashboard
            if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
                setTab('dashboard');
                return;
            }

            // ? — toggle shortcuts help
            if (e.key === '?') {
                setShowShortcutsHelp(prev => !prev);
                return;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    // Listen for fullscreen exit via Esc (browser-native)
    useEffect(() => {
        const onFsChange = () => { if (!document.fullscreenElement) setIsFullscreen(false); };
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    // Reset selection when switching sheets
    useEffect(() => { setSelectedPieces([]); }, [selectedChapa]);

    return (
        <div>
            {loading ? (
                <Spinner text="Carregando plano..." />
            ) : (
                <>
                    {/* Config info bar — parâmetros vêm de Configurações > Parâmetros Otimizador */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: otimProgress || ultimaEstrategia || ultimoCusto ? 6 : 12,
                        padding: '8px 14px', background: 'var(--bg-muted)', borderRadius: 8,
                        border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <Settings size={13} />
                        <span><b>{modo === 'guilhotina' ? 'Guilhotina' : modo === 'maxrects' ? 'MaxRects' : 'Shelf'}</b></span>
                        <span>Espaço: {espacoPecas}mm</span>
                        <span>Refilo: {refilo}mm</span>
                        {(modo === 'guilhotina' || modo === 'shelf') && <span>Kerf: {kerf}mm</span>}
                        {permitirRotacao && <span>Rotação 90°</span>}
                        {usarRetalhos && <span>Retalhos</span>}
                        {considerarSobra && <span>Sobras ≥{sobraMinW}×{sobraMinH}mm</span>}
                        <span>Dir: {direcaoCorte}</span>

                        {/* Seletor de qualidade */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, background: 'var(--bg-card)', borderRadius: 6, padding: 2, border: '1px solid var(--border)' }}>
                            {[
                                { id: 'rapido', label: '⚡ Rápido', title: 'BLF + MaxRects sem BRKGA/SA — resultado em segundos' },
                                { id: 'balanceado', label: '⚖ Balanceado', title: 'BRKGA genético + Simulated Annealing — padrão industrial' },
                                { id: 'maximo', label: '🎯 Máximo', title: 'BRKGA 3× + SA 3× iterações — melhor aproveitamento possível' },
                            ].map(q => (
                                <button key={q.id} onClick={() => setQualidade(q.id)} title={q.title}
                                    style={{
                                        padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                                        fontSize: 10, fontWeight: 700, transition: 'all .15s',
                                        background: qualidade === q.id ? 'var(--primary)' : 'transparent',
                                        color: qualidade === q.id ? '#fff' : 'var(--text-muted)',
                                    }}>
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Barra de progresso durante otimização */}
                    {otimProgress && (
                        <div style={{ marginBottom: 8, padding: '8px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--primary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{otimProgress.fase}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{otimProgress.pct}%</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: 2, background: 'var(--primary)',
                                    width: `${otimProgress.pct}%`, transition: 'width .4s ease',
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Banner de resultado: estratégia usada + custo de desperdício */}
                    {!otimizando && (ultimaEstrategia || ultimoCusto) && (
                        <div style={{
                            marginBottom: 12, padding: '8px 14px', borderRadius: 8,
                            background: 'linear-gradient(135deg, var(--success-bg), var(--bg-muted))',
                            border: '1px solid var(--success-border)',
                            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11,
                        }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                            {ultimaEstrategia && (
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Estratégia: <span style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>{ultimaEstrategia}</span>
                                </span>
                            )}
                            {ultimoCusto?.custo_total != null && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                    Custo total: <b style={{ color: 'var(--text-primary)' }}>R$ {ultimoCusto.custo_total.toFixed(2)}</b>
                                </span>
                            )}
                            {ultimoCusto?.custo_desperdicio != null && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                    Desperdício: <b style={{ color: ultimoCusto.custo_desperdicio > 50 ? 'var(--danger)' : 'var(--warning)' }}>
                                        R$ {ultimoCusto.custo_desperdicio.toFixed(2)}
                                    </b>
                                </span>
                            )}
                            {ultimoCusto?.aproveitamento_medio != null && (
                                <span style={{
                                    marginLeft: 'auto', fontWeight: 700, fontSize: 12,
                                    color: ultimoCusto.aproveitamento_medio >= 80 ? 'var(--success)' : 'var(--warning)',
                                }}>
                                    {ultimoCusto.aproveitamento_medio.toFixed(1)}% aproveitamento
                                </span>
                            )}
                            <button onClick={() => { setUltimaEstrategia(null); setUltimoCusto(null); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, marginLeft: 4 }}>
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {/* TOOLBAR — grouped into dropdowns */}
                    <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Primary action */}
                        <button onClick={otimizar} disabled={otimizando} className={Z.btn}
                            style={{ padding: '10px 24px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                            {otimizando ? <><RotateCw size={15} className="animate-spin" /> Otimizando...</> : <><Scissors size={15} /> Otimizar</>}
                        </button>

                        {plano && plano.chapas?.length > 0 && (<>
                            {/* Arquivo dropdown */}
                            <ToolbarDropdown label="Arquivo" icon={FileText} items={[
                                { id: 'print', label: 'Imprimir / PDF', icon: Printer, onClick: () => printPlano(plano, pecasMap, loteAtual, getModColor) },
                                { divider: true },
                                { id: 'csv', label: 'Exportar CSV (Excel)', icon: FileText, onClick: () => handleExport('csv') },
                                { id: 'json', label: 'Exportar JSON', icon: FileDown, onClick: () => handleExport('json') },
                                { id: 'resumo', label: 'Exportar Resumo HTML', icon: Printer, onClick: () => handleExport('resumo') },
                                { id: 'pdf', label: 'Exportar PDF Plano', icon: FileText, onClick: handleExportPDF },
                                { id: 'svg', label: 'Exportar SVG', icon: FileDown, onClick: handleExportSVG },
                                { id: 'batchgcode', label: batchGcodeLoading ? 'Gerando...' : 'G-Code em Lote', icon: Cpu, onClick: handleBatchGcode, disabled: batchGcodeLoading },
                                { divider: true },
                                { id: 'dup', label: 'Duplicar Plano', icon: Copy, onClick: async () => {
                                    try {
                                        const r = await api.post(`/cnc/plano/${loteAtual.id}/duplicar`);
                                        if (r.ok) notify('Plano duplicado como nova versão (v' + r.version_id + ')');
                                        else notify(r.error || 'Erro ao duplicar plano');
                                    } catch (err) { notify('Erro ao duplicar plano: ' + (err.error || err.message)); }
                                }},
                                { id: 'hist', label: 'Histórico de Versões', icon: Clock, onClick: loadVersions, disabled: versionsLoading },
                            ]} />

                            {/* Relatórios dropdown */}
                            <ToolbarDropdown label="Relatórios" icon={BarChart3} items={[
                                { id: 'custos', label: custosLoading ? 'Calculando...' : 'Custos', icon: DollarSign, onClick: loadCustos, disabled: custosLoading },
                                { id: 'bordas', label: bordasLoading ? 'Carregando...' : 'Rel. Bordas', icon: PenTool, onClick: loadBordas, disabled: bordasLoading },
                                { id: 'material', label: 'Lista Material', icon: Package, onClick: loadMaterialReport },
                                { id: 'review', label: 'Review', icon: ClipboardCheck, onClick: loadReview, danger: reviewData?.allOk === false },
                                { divider: true },
                                { id: 'glog', label: 'G-Code Log', icon: History, onClick: loadGcodeHistory },
                                { divider: true },
                                { id: 'perf', label: 'Performance Máquina', icon: Monitor, onClick: loadMachinePerf },
                                { id: 'audit', label: 'Auditoria Material', icon: ClipboardCheck, onClick: loadMaterialAudit },
                                { id: 'financ', label: 'Sincronizar Financeiro', icon: DollarSign, onClick: handleFinanceiroSync },
                                { divider: true },
                                { id: 'comparar', label: 'Comparar Otimização', icon: GitCompare, onClick: loadComparison },
                                { id: 'desperdicio', label: 'Dashboard Desperdício', icon: BarChart3, onClick: loadWasteDashboard },
                                { id: 'agrupamento', label: 'Sugestão Agrupamento', icon: Layers, onClick: loadGroupingSuggestions },
                                { id: 'retalhos', label: 'Retalhos Aproveitáveis', icon: Scissors, onClick: loadRemnants },
                                { id: 'relcliente', label: 'Relatório Cliente', icon: FileText, onClick: handleClientReport },
                            ]} />

                            {/* Ferramentas dropdown */}
                            <ToolbarDropdown label="Ferramentas" icon={Wrench} items={[
                                { id: 'etiq', label: 'Etiquetas', icon: TagIcon, onClick: printLabels },
                                { id: 'toolpanel', label: toolPanelLoading ? 'Escaneando...' : 'Painel Ferramentas', icon: Wrench, onClick: handleOpenToolPanel, disabled: toolPanelLoading },
                                { id: 'validar', label: validating ? 'Validando...' : 'Validar Usinagens', icon: ShieldAlert, onClick: validarUsinagens, disabled: validating,
                                    danger: validationResult?.conflicts?.length > 0 },
                                { divider: true },
                                { id: 'conferencia', label: 'Conferência Pós-Corte', icon: ClipboardCheck, onClick: loadConferencia },
                                { id: 'fila', label: 'Fila de Produção', icon: Send, onClick: loadFila },
                                { id: 'custeio', label: custeioLoading ? 'Calculando...' : 'Custeio por Peça', icon: DollarSign, onClick: calcularCusteio, disabled: custeioLoading },
                                { id: 'estoque', label: 'Estoque Chapas', icon: Package, onClick: loadEstoque },
                                { divider: true },
                                { id: 'toolpred', label: 'Predição Ferramentas', icon: Clock, onClick: loadToolPrediction },
                                { id: 'toolmaint', label: 'Manutenção Programada', icon: Settings, onClick: loadToolMaintenance },
                                { id: 'reserva', label: 'Reserva Material', icon: Lock, onClick: loadReservations },
                                { id: 'labelpreview', label: 'Preview Etiquetas', icon: TagIcon, onClick: loadLabelPreview },
                                { id: 'backup', label: 'Backup', icon: Server, onClick: loadBackups },
                                { divider: true },
                                { id: 'operador', label: 'Modo Operador (TV)', icon: Tv, onClick: () => window.open('/operador-cnc', '_blank') },
                            ]} />

                            {/* Machine selector */}
                            {maquinas.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-muted)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    <Monitor size={13} style={{ color: 'var(--text-muted)' }} />
                                    <select value={maquinaGcode} onChange={e => setMaquinaGcode(e.target.value)}
                                        className={Z.inp} style={{ fontSize: 11, padding: '5px 8px', minWidth: 160, border: 'none', background: 'transparent' }}>
                                        <option value="">Máquina padrão</option>
                                        {maquinas.filter(m => m.ativo).map(m => (
                                            <option key={m.id} value={m.id}>{m.nome} ({m.total_ferramentas} ferr.)</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </>)}

                        {loteAtual.status === 'otimizado' && (
                            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                                <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                                Otimizado
                            </span>
                        )}
                        {otimizando && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Testando {modo === 'guilhotina' ? 'guilhotina' : modo === 'shelf' ? 'shelf' : 'MaxRects'} · Todos os algoritmos · Otimizando...
                            </span>
                        )}

                        {/* Edit actions — right aligned */}
                        {plano && plano.chapas?.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
                                <button onClick={handleUndo} disabled={undoStack.length === 0} className={Z.btn2}
                                    title="Desfazer (Ctrl+Z)" style={{ padding: '6px 8px', fontSize: 11, opacity: undoStack.length === 0 ? 0.4 : 1 }}>
                                    <Undo2 size={14} />
                                </button>
                                <button onClick={handleRedo} disabled={redoStack.length === 0} className={Z.btn2}
                                    title="Refazer (Ctrl+Y)" style={{ padding: '6px 8px', fontSize: 11, opacity: redoStack.length === 0 ? 0.4 : 1 }}>
                                    <Redo2 size={14} />
                                </button>
                                {pendingChanges > 0 && (
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: colorBg('#f59e0b'), color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                                        title={`${pendingChanges} alteração(ões) salvas automaticamente`}>
                                        <Edit size={10} /> {pendingChanges}
                                    </span>
                                )}
                                <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                                <button onClick={() => handleAdjust({ action: 'compact', chapaIdx: selectedChapa })} className={Z.btn2}
                                    title="Compactar peças" style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Maximize2 size={13} /> Compactar
                                </button>
                                <button
                                    onClick={handleTspOptimize} disabled={tspLoading || !plano?.chapas?.[selectedChapa]?.cortes?.length}
                                    className={Z.btn2}
                                    title="Reordenar cortes por Nearest-Neighbour para reduzir percurso em vazio"
                                    style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                                        color: tspResult ? 'var(--success)' : undefined }}>
                                    {tspLoading ? <RotateCw size={13} className="animate-spin" /> : <Zap size={13} />}
                                    {tspResult ? `−${tspResult.economia_pct}% rapids` : 'Seq. TSP'}
                                </button>
                                <button onClick={() => handleAdjust({ action: 're_optimize', chapaIdx: selectedChapa })} className={Z.btn2}
                                    disabled={plano?.chapas?.[selectedChapa]?.locked}
                                    title={plano?.chapas?.[selectedChapa]?.locked ? 'Chapa travada — destrave para reotimizar' : 'Re-otimizar chapa'}
                                    style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, opacity: plano?.chapas?.[selectedChapa]?.locked ? 0.4 : 1 }}>
                                    <Zap size={13} /> Re-otimizar
                                </button>
                                <button onClick={() => {
                                    const mat = plano.chapas[selectedChapa]?.material;
                                    if (mat) handleAdjust({ action: 'add_sheet', material: mat });
                                }} className={Z.btn2}
                                    title="Adicionar chapa" style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Plus size={13} /> Chapa
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Validation conflicts modal */}
                    {showValidation && validationResult?.conflicts?.length > 0 && (
                        <div className="glass-card p-4" style={{ marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={15} /> Conflitos de Usinagem ({validationResult.conflicts.length})
                                </h3>
                                <button onClick={() => setShowValidation(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {validationResult.conflicts.map((c, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 8px',
                                        background: c.severidade === 'erro' ? '#fef2f210' : '#fefce810',
                                        borderRadius: 4, border: `1px solid ${c.severidade === 'erro' ? '#ef444430' : '#eab30830'}`,
                                    }}>
                                        <AlertTriangle size={12} style={{ color: c.severidade === 'erro' ? '#ef4444' : '#eab308', flexShrink: 0 }} />
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 100 }}>
                                            Ch{c.chapaIdx + 1} P{c.pecaIdx + 1} - {c.pecaDesc}
                                        </span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{c.mensagem}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* RESULTS */}
                    {plano && plano.chapas && plano.chapas.length > 0 ? (
                        <>
                            {/* ═══ LAYOUT UPMOBB: Sidebar Materiais + Diagrama + Carousel ═══ */}
                            {(() => {
                                // Build material groups once for the whole layout
                                const matColors = ['#2563eb', '#e67e22', '#7c3aed', '#16a34a', '#dc2626', '#0891b2', '#db2777', '#d97706'];
                                const _matGroups = [];
                                const _matKeysArr = [];
                                plano.chapas.forEach((ch, ci) => {
                                    const mk = ch.material_code || ch.material || '?';
                                    let grp = _matGroups.find(g => g.key === mk);
                                    if (!grp) {
                                        _matKeysArr.push(mk);
                                        grp = { key: mk, label: (ch.material || mk).replace(/_/g, ' '), color: matColors[(_matKeysArr.length - 1) % matColors.length], chapas: [], direcao: ch.direcao_corte || 'herdar', modo: ch.modo_corte || 'herdar', veio: ch.veio || 'sem_veio' };
                                        _matGroups.push(grp);
                                    }
                                    grp.chapas.push({ ci, ch });
                                });
                                const activeMatGrp = _matGroups.find(g => g.chapas.some(c => c.ci === selectedChapa));
                                const totalPecas = plano.chapas.reduce((s, c) => s + c.pecas.length, 0);
                                const avgAprovGlobal = (plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / plano.chapas.length);

                                return (
                            <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 'calc(100vh - 280px)' }}>

                                {/* ══ SIDEBAR: Otimizações (estilo UPMOBB) ══ */}
                                <div style={{
                                    width: sidebarOpen ? 320 : 40, minWidth: sidebarOpen ? 320 : 40,
                                    transition: 'width .2s, min-width .2s',
                                    borderRight: '1px solid var(--border)', background: 'var(--bg-card)',
                                    borderRadius: '8px 0 0 8px', display: 'flex', flexDirection: 'column',
                                    overflow: 'hidden',
                                }}>
                                    {!sidebarOpen ? (
                                        <button onClick={() => setSidebarOpen(true)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}
                                            title="Abrir painel de materiais">
                                            <ChevronRight size={14} />
                                            <span style={{ writingMode: 'vertical-rl', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>Otimizações</span>
                                            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '2px 6px', fontSize: 9, fontWeight: 800 }}>{_matGroups.length}</span>
                                        </button>
                                    ) : (
                                        <>
                                            {/* Header */}
                                            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Otimizações</span>
                                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontWeight: 700 }}>
                                                    Total de {_matGroups.length} materiais
                                                </span>
                                                <button onClick={() => setSidebarOpen(false)}
                                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}>
                                                    <ChevronLeft size={14} />
                                                </button>
                                            </div>

                                            {/* Material list (accordion) */}
                                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                                {_matGroups.map((grp) => {
                                                    const isExpanded = expandedMats.has(grp.key) || (expandedMats.size === 0 && grp.key === activeMatGrp?.key);
                                                    const grpPecas = grp.chapas.reduce((s, { ch }) => s + ch.pecas.length, 0);
                                                    const avgAprov = grp.chapas.reduce((s, { ch }) => s + (ch.aproveitamento || 0), 0) / grp.chapas.length;
                                                    const hasActiveChapa = grp.chapas.some(c => c.ci === selectedChapa);
                                                    const hasVeio = grp.veio && grp.veio !== 'sem_veio';

                                                    return (
                                                        <div key={grp.key} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            {/* Material header — UPMOBB style */}
                                                            <div
                                                                onClick={() => {
                                                                    setExpandedMats(prev => {
                                                                        const next = new Set(prev);
                                                                        if (next.has(grp.key)) next.delete(grp.key); else next.add(grp.key);
                                                                        return next;
                                                                    });
                                                                    // Select first sheet of this material
                                                                    if (!hasActiveChapa && grp.chapas.length > 0) {
                                                                        setSelectedChapa(grp.chapas[0].ci);
                                                                        setZoomLevel(1); setPanOffset({ x: 0, y: 0 });
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '10px 12px', cursor: 'pointer', userSelect: 'none',
                                                                    background: hasActiveChapa ? 'var(--bg-muted)' : 'transparent',
                                                                }}>
                                                                {/* Row 1: checkbox + name + action icons */}
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                                    <div style={{ width: 18, height: 18, borderRadius: 3, border: `2px solid ${grp.color}`, background: grp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                        <Check size={12} color="#fff" />
                                                                    </div>
                                                                    <span style={{ fontSize: 13, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {grp.label}
                                                                    </span>
                                                                    {/* Direção + Config indicators */}
                                                                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                                        {grp.direcao === 'horizontal' ? '━' : grp.direcao === 'vertical' ? '┃' : grp.direcao === 'misto' ? '⊞' : '↺'}
                                                                    </span>
                                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', transition: 'transform .15s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                                                                </div>

                                                                {/* Row 2: Action buttons grid (UPMOBB style — 2 rows of 4) */}
                                                                {isExpanded && (
                                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginBottom: 6 }} onClick={e => e.stopPropagation()}>
                                                                        {[
                                                                            { id: 'atualizar', icon: <RefreshCw size={14} />, label: 'Atualizar', color: '#2563eb' },
                                                                            { id: 'remover', icon: <Trash2 size={14} />, label: 'Remover', color: '#dc2626' },
                                                                            { id: 'estatisticas', icon: <BarChart3 size={14} />, label: 'Estatísticas', color: '#2563eb' },
                                                                            { id: 'pecas', icon: <Layers size={14} />, label: 'Peças', color: '#2563eb' },
                                                                            { id: 'sobras', icon: <Package size={14} />, label: 'Sobras', color: '#16a34a' },
                                                                            { id: 'mapa', icon: <Printer size={14} />, label: 'Mapa', color: '#16a34a' },
                                                                            { id: 'etiqueta', icon: <TagIcon size={14} />, label: 'Etiqueta', color: '#16a34a' },
                                                                            { id: 'exportar', icon: <FileDown size={14} />, label: 'Exportar', color: '#64748b' },
                                                                        ].map(btn => {
                                                                            const isActionActive = matAction?.grpKey === grp.key && matAction?.action === btn.id;
                                                                            return (
                                                                                <button key={btn.id}
                                                                                    title={btn.label}
                                                                                    onClick={() => setMatAction(isActionActive ? null : { grpKey: grp.key, action: btn.id })}
                                                                                    style={{
                                                                                        width: '100%', aspectRatio: '1', borderRadius: 5,
                                                                                        border: isActionActive ? `2px solid ${btn.color}` : '1px solid var(--border)',
                                                                                        background: isActionActive ? `${btn.color}11` : 'var(--bg-card)',
                                                                                        cursor: 'pointer', display: 'flex', flexDirection: 'column',
                                                                                        alignItems: 'center', justifyContent: 'center', gap: 1,
                                                                                        color: isActionActive ? btn.color : 'var(--text-primary)',
                                                                                        transition: 'all .15s',
                                                                                    }}>
                                                                                    {btn.icon}
                                                                                    <span style={{ fontSize: 7, fontWeight: 600, lineHeight: 1, opacity: 0.8 }}>{btn.label}</span>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                {/* Row 3: Badges */}
                                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: grp.color, color: '#fff', fontWeight: 700 }}>
                                                                        {grpPecas} pç
                                                                    </span>
                                                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: grp.color, color: '#fff', fontWeight: 700 }}>
                                                                        {grp.chapas.length} chapa{grp.chapas.length > 1 ? 's' : ''}
                                                                    </span>
                                                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: hasVeio ? '#7c3aed' : '#64748b', color: '#fff', fontWeight: 700 }}>
                                                                        {hasVeio ? 'Com veio' : 'Sem veio'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Expanded: Action panel content */}
                                                            {isExpanded && matAction?.grpKey === grp.key && (
                                                                <div style={{ padding: '0 12px 12px' }} onClick={e => e.stopPropagation()}>

                                                                    {/* ── ATUALIZAR: Re-otimizar este material ── */}
                                                                    {matAction.action === 'atualizar' && (
                                                                        <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 8 }}>Re-otimizar {grp.label}</div>
                                                                            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                                                                <select value={grp.direcao}
                                                                                    onChange={e => { grp.chapas.forEach(({ ch }) => { ch.direcao_corte = e.target.value; }); grp.direcao = e.target.value; setPlano({ ...plano }); }}
                                                                                    style={{ flex: 1, fontSize: 10, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                                                    <option value="herdar">Direção: Global</option>
                                                                                    <option value="misto">Misto</option>
                                                                                    <option value="horizontal">Horizontal</option>
                                                                                    <option value="vertical">Vertical</option>
                                                                                </select>
                                                                                <select value={grp.modo}
                                                                                    onChange={e => { grp.chapas.forEach(({ ch }) => { ch.modo_corte = e.target.value; }); grp.modo = e.target.value; setPlano({ ...plano }); }}
                                                                                    style={{ flex: 1, fontSize: 10, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                                                                    <option value="herdar">Modo: Global</option>
                                                                                    <option value="guilhotina">Guilhotina</option>
                                                                                    <option value="maxrects">MaxRects</option>
                                                                                    <option value="shelf">Shelf</option>
                                                                                </select>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => notify('Re-otimização solicitada para ' + grp.label, 'info')}
                                                                                style={{ width: '100%', padding: '6px 12px', borderRadius: 5, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                                                                                <RefreshCw size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                                                                Re-otimizar material
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                    {/* ── REMOVER: Remover material da otimização ── */}
                                                                    {matAction.action === 'remover' && (
                                                                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10 }}>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>Remover {grp.label}</div>
                                                                            <div style={{ fontSize: 10, color: '#7f1d1d', marginBottom: 8 }}>
                                                                                Isso removerá {grp.chapas.length} chapa(s) com {grpPecas} peça(s) do plano de corte. As peças voltarão para a área de transferência.
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        // Move pieces to bandeja and remove chapas
                                                                                        const chapaIdxsToRemove = grp.chapas.map(c => c.ci).sort((a, b) => b - a);
                                                                                        const newBandeja = { ...bandeja };
                                                                                        chapaIdxsToRemove.forEach(ci => {
                                                                                            const ch = plano.chapas[ci];
                                                                                            if (ch) {
                                                                                                const mk = ch.material_code || ch.material || 'unknown';
                                                                                                if (!newBandeja[mk]) newBandeja[mk] = [];
                                                                                                ch.pecas.forEach(p => {
                                                                                                    newBandeja[mk].push({
                                                                                                        pecaId: p.pecaId || p.id,
                                                                                                        w: p.w, h: p.h,
                                                                                                        fromMaterial: mk,
                                                                                                        espessura: ch.espessura,
                                                                                                        veio: ch.veio,
                                                                                                    });
                                                                                                });
                                                                                            }
                                                                                        });
                                                                                        const newChapas = plano.chapas.filter((_, i) => !chapaIdxsToRemove.includes(i));
                                                                                        setBandeja(newBandeja);
                                                                                        setPlano({ ...plano, chapas: newChapas, bandeja: newBandeja });
                                                                                        setSelectedChapa(Math.min(selectedChapa, Math.max(0, newChapas.length - 1)));
                                                                                        setMatAction(null);
                                                                                        notify(`${grp.label} removido — ${grpPecas} peças na bandeja`, 'info');
                                                                                    }}
                                                                                    style={{ flex: 1, padding: '6px', borderRadius: 5, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 10, cursor: 'pointer' }}>
                                                                                    Confirmar remoção
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => setMatAction(null)}
                                                                                    style={{ flex: 1, padding: '6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-card)', fontWeight: 600, fontSize: 10, cursor: 'pointer', color: 'var(--text-primary)' }}>
                                                                                    Cancelar
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* ── ESTATÍSTICAS: Stats do material ── */}
                                                                    {matAction.action === 'estatisticas' && (
                                                                        <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: grp.color, marginBottom: 8 }}>Estatísticas — {grp.label}</div>
                                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10 }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Total de peças</span>
                                                                                <b style={{ textAlign: 'right' }}>{grpPecas}</b>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Total de chapas</span>
                                                                                <b style={{ textAlign: 'right' }}>{grp.chapas.length}</b>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Aproveitamento</span>
                                                                                <b style={{ textAlign: 'right', color: avgAprov >= 80 ? '#16a34a' : avgAprov >= 60 ? '#d97706' : '#dc2626' }}>{avgAprov.toFixed(1)}%</b>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Área aproveitada</span>
                                                                                <b style={{ textAlign: 'right' }}>{(grp.chapas.reduce((s, { ch }) => s + ch.pecas.reduce((a, p) => a + p.w * p.h, 0), 0) / 1e6).toFixed(2)} m²</b>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Área total chapas</span>
                                                                                <b style={{ textAlign: 'right' }}>{(grp.chapas.reduce((s, { ch }) => s + (ch.w || 2750) * (ch.h || 1850), 0) / 1e6).toFixed(2)} m²</b>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Desperdício</span>
                                                                                <b style={{ textAlign: 'right', color: '#dc2626' }}>{(100 - avgAprov).toFixed(1)}%</b>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Espaçamento (kerf)</span>
                                                                                <b style={{ textAlign: 'right' }}>{plano.chapas[0]?.kerf || kerf}mm</b>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Refilo (borda)</span>
                                                                                <b style={{ textAlign: 'right' }}>{plano.chapas[0]?.refilo || refilo}mm</b>
                                                                            </div>
                                                                            {(() => {
                                                                                const grpCost = grp.chapas.reduce((s, { ch }) => s + (ch.preco || 0), 0);
                                                                                return grpCost > 0 ? (
                                                                                    <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 4, background: 'var(--bg-muted)', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                                                                        <span style={{ fontWeight: 600 }}>Custo total ({grp.chapas.length} chapas)</span>
                                                                                        <b style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>R$ {grpCost.toFixed(2)}</b>
                                                                                    </div>
                                                                                ) : null;
                                                                            })()}
                                                                        </div>
                                                                    )}

                                                                    {/* ── PEÇAS: Listagem de peças do material ── */}
                                                                    {matAction.action === 'pecas' && (
                                                                        <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                                                                            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                <Layers size={12} style={{ color: grp.color }} />
                                                                                <span style={{ fontSize: 11, fontWeight: 700, color: grp.color }}>Peças — {grp.label}</span>
                                                                                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>{grpPecas} peças</span>
                                                                            </div>
                                                                            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                                                                                <table style={{ width: '100%', fontSize: 9, borderCollapse: 'collapse' }}>
                                                                                    <thead>
                                                                                        <tr style={{ background: 'var(--bg-muted)', position: 'sticky', top: 0 }}>
                                                                                            <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 700 }}>Peça</th>
                                                                                            <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>C×L</th>
                                                                                            <th style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700 }}>Chapa</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        {grp.chapas.flatMap(({ ci, ch }) =>
                                                                                            ch.pecas.map((p, pi) => {
                                                                                                const piece = pecasMap[p.pecaId || p.id];
                                                                                                return (
                                                                                                    <tr key={`${ci}-${pi}`} style={{ borderBottom: '1px solid var(--border)' }}
                                                                                                        onClick={() => { setSelectedChapa(ci); }}
                                                                                                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-muted)'; }}
                                                                                                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                                                                                                    >
                                                                                                        <td style={{ padding: '3px 6px', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                                                                                                            {piece?.descricao?.substring(0, 20) || `#${p.pecaId || p.id}`}
                                                                                                        </td>
                                                                                                        <td style={{ padding: '3px 6px', textAlign: 'center', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                                                                                            {Math.round(p.w)}×{Math.round(p.h)}
                                                                                                        </td>
                                                                                                        <td style={{ padding: '3px 6px', textAlign: 'center', fontWeight: 700 }}>
                                                                                                            {ci + 1}
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                );
                                                                                            })
                                                                                        )}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* ── SOBRAS: Listagem de sobras/retalhos ── */}
                                                                    {matAction.action === 'sobras' && (
                                                                        <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                                                                            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                <Package size={12} style={{ color: '#16a34a' }} />
                                                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>Sobras — {grp.label}</span>
                                                                            </div>
                                                                            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                                                                {grp.chapas.map(({ ci, ch }) => {
                                                                                    const chapaW = ch.w || 2750;
                                                                                    const chapaH = ch.h || 1850;
                                                                                    const usedArea = ch.pecas.reduce((s, p) => s + p.w * p.h, 0);
                                                                                    const freeArea = chapaW * chapaH - usedArea;
                                                                                    const freePerc = ((freeArea / (chapaW * chapaH)) * 100);
                                                                                    if (freePerc < 5) return null;
                                                                                    return (
                                                                                        <div key={ci} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 10 }}>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                                                                                <b>Chapa {ci + 1}</b>
                                                                                                <span style={{ color: freePerc > 30 ? '#16a34a' : '#d97706' }}>{freePerc.toFixed(1)}% livre</span>
                                                                                            </div>
                                                                                            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>
                                                                                                Área livre: {(freeArea / 1e6).toFixed(3)} m² ({Math.round(freeArea / 1000)}k mm²)
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* ── MAPA: Imprimir mapa de corte ── */}
                                                                    {matAction.action === 'mapa' && (
                                                                        <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>
                                                                                <Printer size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                                                                Imprimir Mapa — {grp.label}
                                                                            </div>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                                {grp.chapas.map(({ ci }) => (
                                                                                    <button key={ci}
                                                                                        onClick={() => printFolhaProducao(plano.chapas[ci], ci, pecasMap, loteAtual, getModColor, kerf, refilo, plano.chapas.length)}
                                                                                        style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 10, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                                                                                        <Printer size={10} style={{ color: '#16a34a', flexShrink: 0 }} />
                                                                                        Chapa {ci + 1} — {plano.chapas[ci]?.pecas.length} peças ({(plano.chapas[ci]?.aproveitamento || 0).toFixed(1)}%)
                                                                                    </button>
                                                                                ))}
                                                                                <button
                                                                                    onClick={() => { grp.chapas.forEach(({ ci }) => printFolhaProducao(plano.chapas[ci], ci, pecasMap, loteAtual, getModColor, kerf, refilo, plano.chapas.length)); }}
                                                                                    style={{ padding: '6px 10px', borderRadius: 5, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 10, cursor: 'pointer', marginTop: 2 }}>
                                                                                    Imprimir todas ({grp.chapas.length} chapas)
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* ── ETIQUETA: Imprimir etiquetas ── */}
                                                                    {matAction.action === 'etiqueta' && (
                                                                        <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>
                                                                                <TagIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                                                                Etiquetas — {grp.label}
                                                                            </div>
                                                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                                                                                {grpPecas} peças em {grp.chapas.length} chapa(s)
                                                                            </div>
                                                                            <button
                                                                                onClick={() => { setTab('etiquetas'); setMatAction(null); }}
                                                                                style={{ width: '100%', padding: '6px 12px', borderRadius: 5, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                                                                                <TagIcon size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                                                                Ir para aba de Etiquetas
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                    {/* ── EXPORTAR: Exportar para DXF ── */}
                                                                    {matAction.action === 'exportar' && (
                                                                        <div style={{ background: 'var(--bg-body)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                                                                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                                                                                <FileDown size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                                                                Exportar — {grp.label}
                                                                            </div>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        grp.chapas.forEach(({ ci }) => handleGerarGcode(ci));
                                                                                    }}
                                                                                    style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 10, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                                                                                    <Cpu size={10} style={{ flexShrink: 0 }} />
                                                                                    Gerar G-Code ({grp.chapas.length} chapas)
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => notify('Exportação DXF em desenvolvimento', 'info')}
                                                                                    style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 10, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                                                                                    <FileDown size={10} style={{ flexShrink: 0 }} />
                                                                                    Exportar DXF
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Footer: Resumo global */}
                                            <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--bg-muted)' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Total Chapas</span>
                                                    <span style={{ fontWeight: 700, textAlign: 'right' }}>{plano.chapas.length}</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>Total Peças</span>
                                                    <span style={{ fontWeight: 700, textAlign: 'right' }}>{totalPecas}</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>Aproveitamento</span>
                                                    <span style={{ fontWeight: 700, textAlign: 'right' }}>{avgAprovGlobal.toFixed(1)}%</span>
                                                    {totalCost > 0 && <>
                                                        <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Custo Total</span>
                                                        <span style={{ fontWeight: 800, textAlign: 'right', color: 'var(--primary)', fontFamily: 'monospace' }}>R$ {totalCost.toFixed(2)}</span>
                                                    </>}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* ══ MAIN: Diagrama + Carousel inferior ══ */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                    {/* Info bar: Painel X | Total de Y peças */}
                                    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700 }}>Diagrama de corte</span>
                                        <span style={{ flex: 1 }} />
                                        {activeMatGrp && (
                                            <>
                                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: activeMatGrp.color, color: '#fff', fontWeight: 700 }}>
                                                    Painel {activeMatGrp.chapas.findIndex(c => c.ci === selectedChapa) + 1} de {activeMatGrp.chapas.length}
                                                </span>
                                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-muted)', border: '1px solid var(--border)', fontWeight: 600 }}>
                                                    Total de {plano.chapas[selectedChapa]?.pecas.length || 0} peças
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* Diagram area + transfer panel */}
                                    <div style={{ flex: 1, display: 'flex', gap: 0 }}>
                                <div ref={chapaVizContainerRef} style={{ flex: 1, minWidth: 0, position: 'relative', background: isFullscreen ? 'var(--bg-primary)' : undefined }}>
                                    {plano.chapas[selectedChapa] && (
                                        <ChapaViz
                                            chapa={plano.chapas[selectedChapa]}
                                            idx={selectedChapa}
                                            pecasMap={pecasMap}
                                            notify={notify}
                                            modo={plano.modo}
                                            zoomLevel={zoomLevel}
                                            setZoomLevel={setZoomLevel}
                                            panOffset={panOffset}
                                            onWheel={handleWheel}
                                            onPanStart={handlePanStart}
                                            onPanMove={handlePanMove}
                                            onPanEnd={handlePanEnd}
                                            resetView={resetView}
                                            getModColor={getModColor}
                                            onAdjust={handleAdjust}
                                            selectedPieces={selectedPieces}
                                            onSelectPiece={handleSelectPiece}
                                            kerfSize={kerf}
                                            espacoPecas={espacoPecas}
                                            allChapas={plano.chapas}
                                            classifyLocal={classifyLocal}
                                            classColors={classColors}
                                            classLabels={classLabels}
                                            onGerarGcode={handleGerarGcode}
                                            onGerarGcodePeca={handleGerarGcodePeca}
                                            gcodeLoading={gcodeLoading}
                                            onView3D={(piece) => setView3dPeca(piece)}
                                            onPrintLabel={(chapaIdx) => {
                                                // Navigate to etiquetas tab with chapa filter
                                                setTab('etiquetas');
                                            }}
                                            onPrintSingleLabel={(piece) => setPrintLabelPeca(piece)}
                                            sobraMinW={sobraMinW}
                                            sobraMinH={sobraMinH}
                                            bandejaPieces={(() => {
                                                const ch = plano.chapas[selectedChapa];
                                                const mk = ch?.material_code || ch?.material || '';
                                                return (bandeja[mk] || []);
                                            })()}
                                            loteAtual={loteAtual}
                                            onPrintFolha={(chapaIdx) => printFolhaProducao(plano.chapas[chapaIdx], chapaIdx, pecasMap, loteAtual, getModColor, kerf, refilo, plano.chapas.length)}
                                            onSaveRetalhos={async (chapaIdx, retalhos, refugos) => {
                                                try {
                                                    const ch = plano.chapas[chapaIdx];
                                                    let saved = 0;
                                                    for (const r of retalhos) {
                                                        await api.post('/cnc/retalhos', {
                                                            nome: `Chapa ${chapaIdx + 1} — ${Math.round(r.w)}×${Math.round(r.h)}`,
                                                            material_code: ch.material_code || ch.material || '',
                                                            espessura_real: ch.espessura || 18,
                                                            comprimento: Math.round(r.w),
                                                            largura: Math.round(r.h),
                                                        });
                                                        saved++;
                                                    }
                                                    notify(`${saved} retalho(s) salvos no estoque, ${refugos.length} refugo(s) descartados`);
                                                } catch (e) {
                                                    notify(e.error || 'Erro ao salvar retalhos');
                                                }
                                            }}
                                            setTab={setTab}
                                            validationConflicts={validationResult?.conflicts || []}
                                            machineArea={selectedMachineArea}
                                            timerInfo={null && {
                                                elapsed: getTimerElapsed(selectedChapa),
                                                running: chapaTimers[getTimerKey(selectedChapa)]?.running || false,
                                                hasTimer: !!chapaTimers[getTimerKey(selectedChapa)],
                                                estMin: getEstimatedTime(plano.chapas[selectedChapa], selectedChapa),
                                                formatTimer,
                                                onStart: () => startTimer(selectedChapa),
                                                onStop: () => stopTimer(selectedChapa),
                                                onReset: () => resetTimer(selectedChapa),
                                            }}
                                        />
                                    )}

                                    {/* Keyboard shortcuts "?" button */}
                                    <button
                                        onClick={() => setShowShortcutsHelp(prev => !prev)}
                                        title="Atalhos de teclado (?)"
                                        style={{
                                            position: 'absolute', bottom: 12, right: 12, zIndex: 20,
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: showShortcutsHelp ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.5)',
                                            color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
                                            cursor: 'pointer', fontSize: 14, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all .2s',
                                        }}
                                    >?</button>

                                    {/* Keyboard shortcuts help panel */}
                                    {showShortcutsHelp && (
                                        <div style={{
                                            position: 'absolute', bottom: 48, right: 12, zIndex: 25,
                                            background: 'rgba(0,0,0,0.85)', color: '#fff',
                                            borderRadius: 10, padding: '12px 16px',
                                            fontSize: 11, lineHeight: 1.8, minWidth: 220,
                                            backdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: '#93c5fd' }}>Atalhos de Teclado</div>
                                            {[
                                                ['1-9', 'Selecionar chapa'],
                                                ['\u2190 \u2192', 'Chapa anterior / pr\u00f3xima'],
                                                ['R', 'Rotacionar pe\u00e7a selecionada'],
                                                ['G', 'Gerar G-Code da chapa'],
                                                ['E', 'Ir para G-Code/Etiquetas'],
                                                ['P', 'Imprimir folha de produ\u00e7\u00e3o'],
                                                ['D', 'Ir para Dashboard'],
                                                ['Espa\u00e7o', 'Marcar/desmarcar chapa cortada'],
                                                ['F', 'Tela cheia'],
                                                ['Esc', 'Limpar sele\u00e7\u00e3o'],
                                                ['Ctrl+Z', 'Desfazer'],
                                                ['Ctrl+Y', 'Refazer'],
                                                ['?', 'Mostrar/ocultar atalhos'],
                                            ].map(([key, desc], i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                                    <kbd style={{
                                                        background: 'rgba(255,255,255,0.15)', borderRadius: 4,
                                                        padding: '1px 6px', fontSize: 10, fontFamily: 'monospace',
                                                        fontWeight: 600, whiteSpace: 'nowrap',
                                                    }}>{key}</kbd>
                                                    <span style={{ color: 'rgba(255,255,255,0.8)' }}>{desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ═══ SIMULADOR INLINE ═══ */}
                                {inlineSimData && inlineSimData.chapaIdx === selectedChapa && (
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
                                        height: 280, background: 'var(--bg-card)', borderTop: '2px solid var(--primary)',
                                        display: 'flex', flexDirection: 'column',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Play size={12} /> Simulador CNC — Chapa {selectedChapa + 1}
                                            </span>
                                            <button onClick={() => setInlineSimData(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div style={{ flex: 1, minHeight: 0 }}>
                                            <GcodeSimWrapper
                                                gcode={inlineSimData.gcode}
                                                chapa={inlineSimData.chapa}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Sidebar de transferência removida — peças ficam na bandeja visual da chapa */}
                                    </div>
                                    {/* ══ BOTTOM CAROUSEL: Thumbnails das chapas (estilo UPMOBB) ══ */}
                                    <div style={{
                                        borderTop: '1px solid var(--border)',
                                        background: 'var(--bg-card)',
                                        padding: '6px 8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        overflowX: 'auto',
                                        minHeight: 72,
                                        flexShrink: 0,
                                    }}>
                                        {/* Prev arrow */}
                                        <button
                                            onClick={() => {
                                                if (activeMatGrp) {
                                                    const idxInGroup = activeMatGrp.chapas.findIndex(c => c.ci === selectedChapa);
                                                    if (idxInGroup > 0) setSelectedChapa(activeMatGrp.chapas[idxInGroup - 1].ci);
                                                } else if (selectedChapa > 0) {
                                                    setSelectedChapa(selectedChapa - 1);
                                                }
                                            }}
                                            disabled={(() => {
                                                if (activeMatGrp) return activeMatGrp.chapas.findIndex(c => c.ci === selectedChapa) <= 0;
                                                return selectedChapa <= 0;
                                            })()}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--text-muted)', padding: 4, flexShrink: 0,
                                                opacity: selectedChapa <= 0 ? 0.3 : 1,
                                            }}
                                        >
                                            <ChevronLeft size={18} />
                                        </button>

                                        {/* Thumbnails */}
                                        <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto', padding: '2px 0' }}>
                                            {(activeMatGrp ? activeMatGrp.chapas : plano.chapas.map((ch, ci) => ({ ci, ch }))).map(({ ci, ch }) => {
                                                const isActive = ci === selectedChapa;
                                                const aprov = ch.aproveitamento || 0;
                                                const aprovColor = aprov >= 80 ? '#16a34a' : aprov >= 60 ? '#d97706' : '#dc2626';
                                                const grpForThumb = _matGroups.find(g => g.chapas.some(c => c.ci === ci));

                                                return (
                                                    <button
                                                        key={ci}
                                                        onClick={() => setSelectedChapa(ci)}
                                                        style={{
                                                            flexShrink: 0,
                                                            width: 80,
                                                            height: 56,
                                                            borderRadius: 6,
                                                            border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                                                            background: isActive ? 'var(--bg-muted)' : 'var(--bg-body)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: 2,
                                                            padding: '4px 2px',
                                                            transition: 'all .15s',
                                                            boxShadow: isActive ? '0 0 0 1px var(--primary)' : 'none',
                                                            position: 'relative',
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        {/* Mini preview: simple filled rect representation */}
                                                        <div style={{
                                                            width: 56, height: 28, borderRadius: 3,
                                                            background: '#e2e8f0',
                                                            position: 'relative', overflow: 'hidden',
                                                            border: '1px solid #cbd5e1',
                                                        }}>
                                                            {/* Fill bar to represent aproveitamento */}
                                                            <div style={{
                                                                position: 'absolute', bottom: 0, left: 0,
                                                                width: '100%', height: `${aprov}%`,
                                                                background: aprovColor,
                                                                opacity: 0.35,
                                                                transition: 'height .3s',
                                                            }} />
                                                            {/* Piece count in center */}
                                                            <div style={{
                                                                position: 'absolute', inset: 0,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: 9, fontWeight: 800, color: '#334155',
                                                            }}>
                                                                {ch.pecas.length}pç
                                                            </div>
                                                        </div>
                                                        {/* Label */}
                                                        <div style={{ fontSize: 8, fontWeight: 700, color: isActive ? 'var(--primary)' : 'var(--text-muted)', lineHeight: 1 }}>
                                                            {aprov.toFixed(0)}%
                                                        </div>
                                                        {/* Active group color indicator */}
                                                        {grpForThumb && (
                                                            <div style={{
                                                                position: 'absolute', top: 2, right: 2,
                                                                width: 6, height: 6, borderRadius: '50%',
                                                                background: grpForThumb.color,
                                                            }} />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Next arrow */}
                                        <button
                                            onClick={() => {
                                                if (activeMatGrp) {
                                                    const idxInGroup = activeMatGrp.chapas.findIndex(c => c.ci === selectedChapa);
                                                    if (idxInGroup < activeMatGrp.chapas.length - 1) setSelectedChapa(activeMatGrp.chapas[idxInGroup + 1].ci);
                                                } else if (selectedChapa < plano.chapas.length - 1) {
                                                    setSelectedChapa(selectedChapa + 1);
                                                }
                                            }}
                                            disabled={(() => {
                                                if (activeMatGrp) return activeMatGrp.chapas.findIndex(c => c.ci === selectedChapa) >= activeMatGrp.chapas.length - 1;
                                                return selectedChapa >= plano.chapas.length - 1;
                                            })()}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--text-muted)', padding: 4, flexShrink: 0,
                                                opacity: selectedChapa >= plano.chapas.length - 1 ? 0.3 : 1,
                                            }}
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            );
                            })()}

                            {/* ═══ Relatório de Desperdício ═══ */}
                            <RelatorioDesperdicio loteId={loteAtual?.id} notify={notify} />
                        </>
                    ) : (
                        <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Scissors size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                            <div>Clique em "Otimizar Corte" para gerar o plano</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>Ajuste as configurações acima antes de otimizar</div>
                        </div>
                    )}
                </>
            )}

            {/* ═══ Modal Painel de Ferramentas ═══ */}
            {toolPanelOpen && toolPanel && (
                <ToolPanelModal
                    data={toolPanel}
                    loteId={loteAtual?.id}
                    onClose={() => setToolPanelOpen(false)}
                    onSave={() => { setToolPanelOpen(false); setToolPanelDirty(false); notify('Configurações salvas!', 'success'); }}
                />
            )}

            {/* ═══ Modal Preview G-Code ═══ */}
            {gcodePreview && (
                <GcodePreviewModal
                    data={gcodePreview}
                    onDownload={handleDownloadGcode}
                    onSendToMachine={handleSendToMachine}
                    onClose={() => setGcodePreview(null)}
                    onSimulate={(gcodeText, chapaData) => {
                        const moves = parseGcodeToMoves(gcodeText);
                        setToolpathMoves(moves);
                        setToolpathChapa(chapaData);
                        setToolpathOpen(true);
                        setGcodePreview(null);
                    }}
                />
            )}

            {/* Transferência movida para inline à direita da chapa */}

            {/* ═══ Modal Custos (Feature 1) ═══ */}
            {showCustos && custosData && (
                <Modal title="Custos Detalhados" close={() => setShowCustos(false)} w={800}>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>R$ {custosData.total_geral?.toFixed(2)}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Custo Total</div>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
                                R$ {custosData.chapas?.length > 0 ? (custosData.chapas.reduce((s, c) => s + c.custo_material, 0)).toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Material</div>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }}>
                                R$ {custosData.chapas?.length > 0 ? (custosData.chapas.reduce((s, c) => s + c.custo_usinagem, 0)).toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Usinagem</div>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                                R$ {custosData.chapas?.length > 0 ? (custosData.chapas.reduce((s, c) => s + c.custo_bordas, 0)).toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Bordas</div>
                        </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
                        Config: R$ {custosData.config?.custo_hora_maquina}/h maquina, R$ {custosData.config?.custo_troca_ferramenta}/troca
                    </div>

                    {/* Per-sheet breakdown */}
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {custosData.chapas?.map((ch, ci) => (
                            <div key={ci} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                <div
                                    onClick={() => setCustosExpanded(prev => ({ ...prev, [ci]: !prev[ci] }))}
                                    style={{
                                        padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'var(--bg-muted)', borderBottom: custosExpanded[ci] ? '1px solid var(--border)' : 'none',
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Box size={13} style={{ color: 'var(--primary)' }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Chapa {ch.chapaIdx + 1} — {ch.material}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            Mat: R${ch.custo_material.toFixed(2)} | Usin: R${ch.custo_usinagem.toFixed(2)} | Borda: R${ch.custo_bordas.toFixed(2)} | Desp: R${ch.custo_desperdicio.toFixed(2)}
                                        </span>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>R$ {ch.custo_total.toFixed(2)}</span>
                                        {custosExpanded[ci] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                    </div>
                                </div>
                                {custosExpanded[ci] && (
                                    <div style={{ padding: '8px 14px' }}>
                                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>#</th>
                                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Descricao</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Material</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Usinagem</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Bordas</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ch.pecas.map((p, pi) => (
                                                    <tr key={pi} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{p.pecaIdx + 1}</td>
                                                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{p.desc}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>R$ {p.custo_material.toFixed(2)}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>R$ {p.custo_usinagem.toFixed(2)}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>R$ {p.custo_bordas.toFixed(2)}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>R$ {p.custo_total.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            {/* ═══ Modal Relatório de Bordas ═══ */}
            {showBordas && bordasData && (
                <Modal title="Relatorio de Bordas / Fitagem" close={() => setShowBordas(false)} w={800}>
                    {!bordasData.bordas || bordasData.bordas.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                            Nenhuma borda/fita encontrada neste lote.
                        </div>
                    ) : (<>
                        {/* Summary */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                    {bordasData.bordas.reduce((s, b) => s + b.metros, 0).toFixed(1)}m
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Metros</div>
                            </div>
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>
                                    {bordasData.bordas.length}
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Tipos de Borda</div>
                            </div>
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6', fontFamily: 'monospace' }}>
                                    {bordasData.bordas.reduce((s, b) => s + b.quantidade_pecas, 0)}
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Pecas c/ Borda</div>
                            </div>
                        </div>

                        {/* Table per borda type */}
                        <div style={{ maxHeight: 450, overflowY: 'auto' }}>
                            {bordasData.bordas.map((b, bi) => (
                                <div key={bi} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                    <div
                                        onClick={() => setBordasExpanded(prev => ({ ...prev, [bi]: !prev[bi] }))}
                                        style={{
                                            padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: 'var(--bg-muted)', borderBottom: bordasExpanded[bi] ? '1px solid var(--border)' : 'none',
                                        }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <PenTool size={13} style={{ color: '#f59e0b' }} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{b.tipo}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.quantidade_pecas} peca(s)</span>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>{b.metros.toFixed(2)}m</span>
                                            {bordasExpanded[bi] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </div>
                                    </div>
                                    {bordasExpanded[bi] && (
                                        <div style={{ padding: '8px 14px' }}>
                                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Peca</th>
                                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Modulo</th>
                                                        <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Lado</th>
                                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Comp. (mm)</th>
                                                        <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Qtd</th>
                                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Metros</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {b.detalhes.map((d, di) => (
                                                        <tr key={di} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '4px 6px', fontWeight: 600 }}>{d.descricao || `#${d.peca_id}`}</td>
                                                            <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{d.modulo}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>{d.lado}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{d.comprimento_mm}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>{d.quantidade}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{d.metros.toFixed(3)}m</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>)}
                </Modal>
            )}

            {/* ═══ Modal Historico / Diff (Feature 4) ═══ */}
            {showVersions && (
                <Modal title="Historico de Versoes" close={() => { setShowVersions(false); setDiffResult(null); setDiffV1(null); setDiffV2(null); }} w={700}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                        Selecione duas versoes para comparar
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Versao A (anterior)</label>
                            <select value={diffV1 || ''} onChange={e => setDiffV1(e.target.value || null)} className={Z.inp} style={{ width: '100%', fontSize: 12, marginTop: 4 }}>
                                <option value="">Selecionar...</option>
                                {versions.map(v => (
                                    <option key={v.id} value={v.id}>#{v.id} — {v.acao_origem} — {new Date(v.criado_em).toLocaleString('pt-BR')}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Versao B (posterior)</label>
                            <select value={diffV2 || ''} onChange={e => setDiffV2(e.target.value || null)} className={Z.inp} style={{ width: '100%', fontSize: 12, marginTop: 4 }}>
                                <option value="">Selecionar...</option>
                                {versions.map(v => (
                                    <option key={v.id} value={v.id}>#{v.id} — {v.acao_origem} — {new Date(v.criado_em).toLocaleString('pt-BR')}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button onClick={loadDiff} disabled={!diffV1 || !diffV2 || diffLoading} className={Z.btn}
                                style={{ padding: '8px 20px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <GitCompare size={13} /> {diffLoading ? 'Comparando...' : 'Comparar'}
                            </button>
                        </div>
                    </div>

                    {diffResult && (
                        <>
                            {/* Summary */}
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                                    Resumo: {diffResult.changes?.length || 0} alteracao(es)
                                </div>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11 }}>
                                    {diffResult.summary?.movido > 0 && <span style={{ color: '#3b82f6' }}>{diffResult.summary.movido} movida(s)</span>}
                                    {diffResult.summary?.rotacionado > 0 && <span style={{ color: '#8b5cf6' }}>{diffResult.summary.rotacionado} rotacionada(s)</span>}
                                    {diffResult.summary?.transferido > 0 && <span style={{ color: '#f59e0b' }}>{diffResult.summary.transferido} transferida(s)</span>}
                                    {diffResult.summary?.adicionado > 0 && <span style={{ color: '#22c55e' }}>{diffResult.summary.adicionado} adicionada(s)</span>}
                                    {diffResult.summary?.removido > 0 && <span style={{ color: '#ef4444' }}>{diffResult.summary.removido} removida(s)</span>}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Chapas: {diffResult.chapas_v1} → {diffResult.chapas_v2}
                                </div>
                            </div>

                            {/* Changes table */}
                            {diffResult.changes?.length > 0 && (
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Tipo</th>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Peca</th>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Chapa</th>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Detalhes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {diffResult.changes.map((c, i) => {
                                                const typeColors = { movido: '#3b82f6', rotacionado: '#8b5cf6', transferido: '#f59e0b', adicionado: '#22c55e', removido: '#ef4444' };
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '4px 6px' }}>
                                                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${typeColors[c.tipo] || '#6b7280'}15`, color: typeColors[c.tipo] || '#6b7280' }}>
                                                                {c.tipo}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{c.pecaDesc}</td>
                                                        <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>
                                                            {c.tipo === 'transferido' ? `Ch${c.de?.chapaIdx + 1} → Ch${c.para?.chapaIdx + 1}` : `Ch${c.chapaIdx + 1}`}
                                                        </td>
                                                        <td style={{ padding: '4px 6px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 10 }}>
                                                            {c.de && c.para && c.tipo !== 'transferido' && `(${c.de.x},${c.de.y}) → (${c.para.x},${c.para.y})`}
                                                            {c.tipo === 'transferido' && c.de && c.para && `(${c.de.x},${c.de.y}) → (${c.para.x},${c.para.y})`}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}

                    {/* Versions list */}
                    {!diffResult && (
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>#</th>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Acao</th>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {versions.map(v => (
                                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '4px 6px', fontWeight: 600 }}>{v.id}</td>
                                            <td style={{ padding: '4px 6px' }}>{v.acao_origem}</td>
                                            <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{new Date(v.criado_em).toLocaleString('pt-BR')}</td>
                                        </tr>
                                    ))}
                                    {versions.length === 0 && (
                                        <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma versao salva ainda</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Modal>
            )}

            {/* ═══ Toolpath Simulator (Feature 3) ═══ */}
            <ToolpathSimulator
                chapData={toolpathChapa}
                operations={toolpathMoves}
                isOpen={toolpathOpen}
                onClose={() => { setToolpathOpen(false); setToolpathMoves([]); setToolpathChapa(null); }}
            />

            {/* ══ Modal 3D flutuante ══ */}
            {/* ══ 3D Viewer SlidePanel ══ */}
            <SlidePanel isOpen={!!view3dPeca} onClose={() => setView3dPeca(null)} title={view3dPeca?.descricao || 'Visualização 3D'} width={560}>
                {view3dPeca && (<>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {view3dPeca.comprimento} × {view3dPeca.largura} × {view3dPeca.espessura} mm · {view3dPeca.material_code}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 4, background: 'var(--bg-muted, #f1f5f9)', borderRadius: 10, marginBottom: 16, border: '1px solid var(--border, #e2e8f0)' }}>
                        <PecaViewer3D peca={view3dPeca} width={Math.min(500, window.innerWidth - 120)} height={380} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {view3dPeca.borda_frontal && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Frontal: {view3dPeca.borda_cor_frontal || view3dPeca.borda_frontal}
                            </span>
                        )}
                        {view3dPeca.borda_traseira && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Traseira: {view3dPeca.borda_cor_traseira || view3dPeca.borda_traseira}
                            </span>
                        )}
                        {view3dPeca.borda_esq && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Esquerda: {view3dPeca.borda_cor_esq || view3dPeca.borda_esq}
                            </span>
                        )}
                        {view3dPeca.borda_dir && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Direita: {view3dPeca.borda_cor_dir || view3dPeca.borda_dir}
                            </span>
                        )}
                        {(() => {
                            const ops = (() => { try { const d = typeof view3dPeca.machining_json === 'string' ? JSON.parse(view3dPeca.machining_json) : view3dPeca.machining_json; return d?.workers || []; } catch { return []; } })();
                            return ops.length > 0 && (
                                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#e11d4815', color: '#e11d48', fontWeight: 600 }}>
                                    {ops.length} usinagem{ops.length > 1 ? 'ns' : ''}
                                </span>
                            );
                        })()}
                    </div>
                </>)}
            </SlidePanel>

            {/* ══ Print label SlidePanel ══ */}
            <SlidePanel isOpen={!!printLabelPeca} onClose={() => setPrintLabelPeca(null)} title="Imprimir Etiqueta" width={420}>
                {printLabelPeca && (<>
                    <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{printLabelPeca.descricao}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            {printLabelPeca.comprimento} × {printLabelPeca.largura} × {printLabelPeca.espessura} mm · {printLabelPeca.material_code}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Módulo: {printLabelPeca.modulo_desc} · Qtd: {printLabelPeca.quantidade}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button onClick={() => {
                            setPrintLabelPeca(null);
                            if (setTab) setTab('etiquetas');
                        }} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '12px 20px', borderRadius: 8,
                            background: 'var(--primary)', color: '#fff',
                            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        }}>
                            <TagIcon size={15} /> Abrir Etiquetas
                        </button>
                        <button onClick={() => {
                            const win = window.open('', '_blank', 'width=400,height=300');
                            if (win) {
                                const p = printLabelPeca;
                                const bordas = ['frontal','traseira','esq','dir'].map(s => {
                                    const v = p[`borda_${s}`];
                                    const c = p[`borda_cor_${s}`];
                                    return v ? `${s}: ${c || v}` : null;
                                }).filter(Boolean).join(' | ');
                                win.document.write(`<html><head><style>
                                    body { font-family: Arial, sans-serif; padding: 10px; margin: 0; }
                                    .label { border: 1px solid #000; padding: 8px; width: 95mm; }
                                    .name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
                                    .dims { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
                                    .info { font-size: 10px; color: #555; margin-bottom: 2px; }
                                    @media print { body { padding: 0; } }
                                </style></head><body onload="window.print();window.close()">
                                    <div class="label">
                                        <div class="name">${p.descricao}</div>
                                        <div class="dims">${p.comprimento} × ${p.largura} × ${p.espessura} mm</div>
                                        <div class="info">${p.material || ''} · ${p.modulo_desc || ''}</div>
                                        <div class="info">Qtd: ${p.quantidade} · ${p.persistent_id || p.upmcode || ''}</div>
                                        ${bordas ? `<div class="info">Fitas: ${bordas}</div>` : ''}
                                    </div>
                                </body></html>`);
                                win.document.close();
                            }
                            setPrintLabelPeca(null);
                        }} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '12px 20px', borderRadius: 8,
                            background: 'var(--bg-muted)', color: 'var(--text-primary)',
                            border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}>
                            <Printer size={15} /> Imprimir Rápido
                        </button>
                    </div>
                </>)}
            </SlidePanel>

            {/* ═══ Modal Review Checklist ═══ */}
            {showReview && reviewData && (
                <Modal title="Review Pre-Corte" close={() => setShowReview(false)} w={600}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {reviewData.passed}/{reviewData.total} verificações OK
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {reviewData.checks.map(c => (
                            <div key={c.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                                background: c.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                                border: `1px solid ${c.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                            }}>
                                <span style={{ fontSize: 16 }}>{c.ok ? '✓' : '✗'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: c.ok ? '#22c55e' : '#ef4444' }}>{c.label}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.detail}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {reviewData.allOk && (
                        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                            <CheckCircle2 size={24} style={{ color: '#22c55e' }} />
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginTop: 6 }}>Pronto para cortar!</div>
                        </div>
                    )}
                </Modal>
            )}

            {/* ═══ Modal Material Report ═══ */}
            {showMaterialReport && materialReport && (
                <Modal title="Relatorio de Materiais — Lista de Compras" close={() => setShowMaterialReport(false)} w={800}>
                    {/* Materiais */}
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Chapas</div>
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 16 }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Material</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Qtd</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Dimensao</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Area m2</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Aprov.</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Custo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materialReport.materiais.map((m, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '6px', fontWeight: 600 }}>{m.material}{m.chapas_retalho > 0 && <span style={{ fontSize: 9, color: '#06b6d4', marginLeft: 4 }}>({m.chapas_retalho} ret.)</span>}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{m.chapas}</td>
                                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 10 }}>{m.dim_chapa}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{m.area_total_m2}</td>
                                    <td style={{ textAlign: 'center', color: m.aproveitamento_medio >= 80 ? '#22c55e' : m.aproveitamento_medio >= 60 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>{m.aproveitamento_medio}%</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{m.custo_total > 0 ? `R$ ${m.custo_total.toFixed(2)}` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid var(--text-primary)' }}>
                                <td style={{ padding: '6px', fontWeight: 700 }}>TOTAL</td>
                                <td style={{ textAlign: 'center', fontWeight: 700 }}>{materialReport.resumo.total_chapas}</td>
                                <td />
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{materialReport.resumo.area_total_m2.toFixed(2)} m2</td>
                                <td />
                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{materialReport.resumo.custo_total > 0 ? `R$ ${materialReport.resumo.custo_total.toFixed(2)}` : '-'}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Bordas */}
                    {materialReport.bordas.length > 0 && (
                        <>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Fitas de Borda</div>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Tipo/Cor</th>
                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Metros</th>
                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Pecas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {materialReport.bordas.map((b, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '6px', fontWeight: 600 }}>{b.tipo}</td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{b.metros} m</td>
                                            <td style={{ textAlign: 'right' }}>{b.pecas}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}

                    {/* Print button */}
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                        <button onClick={() => {
                            const win = window.open('', '_blank');
                            const mr = materialReport;
                            win.document.write(`<!DOCTYPE html><html><head><title>Lista de Materiais</title>
                            <style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}th{background:#f5f5f5;font-weight:700}h2{margin:0 0 10px}@media print{.no-print{display:none}}</style></head><body>
                            <div class="no-print" style="margin-bottom:12px"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e67e22;color:#fff;border:none;border-radius:6px">Imprimir</button></div>
                            <h2>Lista de Materiais — ${loteAtual?.nome || ''}</h2>
                            <table><tr><th>Material</th><th>Qtd Chapas</th><th>Dimensao</th><th>Area m2</th><th>Aprov.</th><th>Custo</th></tr>
                            ${mr.materiais.map(m => `<tr><td>${m.material}</td><td style="text-align:center">${m.chapas}</td><td>${m.dim_chapa}</td><td style="text-align:right">${m.area_total_m2}</td><td style="text-align:center">${m.aproveitamento_medio}%</td><td style="text-align:right">${m.custo_total > 0 ? 'R$ ' + m.custo_total.toFixed(2) : '-'}</td></tr>`).join('')}
                            <tr style="border-top:2px solid #333"><td><b>TOTAL</b></td><td style="text-align:center"><b>${mr.resumo.total_chapas}</b></td><td></td><td style="text-align:right"><b>${mr.resumo.area_total_m2.toFixed(2)} m2</b></td><td></td><td style="text-align:right"><b>${mr.resumo.custo_total > 0 ? 'R$ ' + mr.resumo.custo_total.toFixed(2) : '-'}</b></td></tr></table>
                            ${mr.bordas.length > 0 ? `<h3>Fitas de Borda</h3><table><tr><th>Tipo</th><th>Metros</th><th>Pecas</th></tr>${mr.bordas.map(b => `<tr><td>${b.tipo}</td><td style="text-align:right">${b.metros} m</td><td style="text-align:right">${b.pecas}</td></tr>`).join('')}</table>` : ''}
                            <div style="margin-top:12px;font-size:9px;color:#999">Ornato ERP · ${new Date().toLocaleDateString('pt-BR')}</div>
                            </body></html>`);
                            win.document.close();
                        }} className={Z.btn2} style={{ padding: '10px 24px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Printer size={14} /> Imprimir Lista
                        </button>
                    </div>
                </Modal>
            )}

            {/* ═══ Modal G-Code History ═══ */}
            {showGcodeHistory && (
                <Modal title="Historico de Geracao G-Code" close={() => setShowGcodeHistory(false)} w={700}>
                    {gcodeHistory.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma geração registrada.</div>
                    ) : (
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Data</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Chapa</th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Maquina</th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Arquivo</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Ops</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Tempo</th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Gerado por</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gcodeHistory.map((h, i) => (
                                    <tr key={h.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-body)' }}>
                                        <td style={{ padding: '5px 6px', fontSize: 10, color: 'var(--text-muted)' }}>{new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{(h.chapa_idx ?? -1) + 1}</td>
                                        <td style={{ padding: '5px 6px' }}>{h.maquina_nome || '-'}</td>
                                        <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontSize: 10 }}>{h.filename || '-'}</td>
                                        <td style={{ textAlign: 'center' }}>{h.total_operacoes}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{h.tempo_estimado_min > 0 ? `${h.tempo_estimado_min}m` : '-'}</td>
                                        <td style={{ padding: '5px 6px', fontSize: 10, color: 'var(--text-muted)' }}>{h.user_nome || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Modal>
            )}

            {/* ═══ SlidePanel Conferência Pós-Corte ═══ */}
            <SlidePanel isOpen={showConferencia} onClose={() => setShowConferencia(false)} title="Conferência Pós-Corte" width={580}>
                {plano && plano.chapas && (<div>
                    {/* Resumo */}
                    {(() => {
                        const total = plano.chapas.reduce((s, c) => s + (c.pecas?.length || 0), 0);
                        const ok = conferencia.filter(c => c.status === 'ok').length;
                        const def = conferencia.filter(c => c.status === 'defeito').length;
                        const pend = total - ok - def;
                        return (
                            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{ok}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: '#22c55e' }}>OK</div>
                                </div>
                                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{def}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: '#ef4444' }}>Defeito</div>
                                </div>
                                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-muted)' }}>{pend}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Pendente</div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Por chapa */}
                    {plano.chapas.map((chapa, ci) => {
                        const confMap = {};
                        for (const c of conferencia) { if (c.chapa_idx === ci) confMap[c.peca_idx] = c; }
                        const allOk = chapa.pecas.every((_, pi) => confMap[pi]?.status === 'ok');
                        return (
                            <div key={ci} style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: allOk ? 'rgba(34,197,94,0.06)' : 'var(--bg-muted)', border: `1px solid ${allOk ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` }}>
                                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                                        {allOk && <Check size={13} style={{ color: '#22c55e', marginRight: 4, verticalAlign: -2 }} />}
                                        Chapa {ci + 1} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({chapa.pecas.length} peças)</span>
                                    </span>
                                    {!allOk && (
                                        <button onClick={() => conferirChapaOk(ci)} style={{
                                            fontSize: 10, padding: '4px 12px', borderRadius: 6,
                                            background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700,
                                        }}>Tudo OK</button>
                                    )}
                                </div>
                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {chapa.pecas.map((p, pi) => {
                                        const conf = confMap[pi];
                                        const st = conf?.status || 'pendente';
                                        return (
                                            <div key={pi} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                                                borderRadius: 6, fontSize: 11, background: st === 'defeito' ? 'rgba(239,68,68,0.05)' : 'transparent',
                                            }}>
                                                <span style={{
                                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                    background: st === 'ok' ? '#22c55e' : st === 'defeito' ? '#ef4444' : '#9ca3af',
                                                }} />
                                                <span style={{ flex: 1, fontWeight: 500 }}>{p.desc || `Peça ${pi + 1}`}</span>
                                                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                    {p.w}×{p.h}
                                                </span>
                                                {st === 'pendente' && (<>
                                                    <button onClick={() => conferirPeca(ci, pi, p.desc, 'ok')} style={{
                                                        fontSize: 9, padding: '2px 8px', borderRadius: 4,
                                                        background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
                                                        cursor: 'pointer', fontWeight: 700,
                                                    }}>OK</button>
                                                    <button onClick={() => {
                                                        const obs = prompt('Descreva o defeito:');
                                                        if (obs !== null) conferirPeca(ci, pi, p.desc, 'defeito', 'outro', obs);
                                                    }} style={{
                                                        fontSize: 9, padding: '2px 8px', borderRadius: 4,
                                                        background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                                        cursor: 'pointer', fontWeight: 700,
                                                    }}>Defeito</button>
                                                </>)}
                                                {st === 'ok' && <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 700 }}>✓</span>}
                                                {st === 'defeito' && (
                                                    <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }} title={conf?.defeito_obs || ''}>
                                                        ✗ {conf?.defeito_tipo || 'defeito'}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>)}
            </SlidePanel>

            {/* ═══ SlidePanel Fila de Produção ═══ */}
            <SlidePanel isOpen={showFila} onClose={() => setShowFila(false)} title="Fila de Produção" width={620}>
                <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                    <button onClick={enviarParaFila} className={Z.btn}
                        style={{ fontSize: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Send size={13} /> Enviar Lote para Fila
                    </button>
                </div>
                {filaProducao.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Fila vazia. Envie chapas para começar.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {filaProducao.map(item => {
                            const stColor = item.status === 'em_producao' ? '#f59e0b' : item.status === 'concluido' ? '#22c55e' : '#9ca3af';
                            return (
                                <div key={item.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                    borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                                }}>
                                    <div style={{ width: 4, height: 36, borderRadius: 2, background: stColor, flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                                            {item.lote_nome || `Lote ${item.lote_id}`} — Chapa {item.chapa_idx + 1}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                            {item.lote_cliente || ''} · Máq: {item.maquina_nome || 'Não atribuída'}
                                            {item.operador && ` · Op: ${item.operador}`}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {item.prioridade > 0 && (
                                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                                P{item.prioridade}
                                            </span>
                                        )}
                                        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${stColor}18`, color: stColor, fontWeight: 700 }}>
                                            {item.status === 'aguardando' ? 'Aguardando' : item.status === 'em_producao' ? 'Em Produção' : 'Concluído'}
                                        </span>
                                    </div>
                                    {item.status === 'aguardando' && (
                                        <button onClick={() => atualizarFila(item.id, { status: 'em_producao' })}
                                            style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                            Iniciar
                                        </button>
                                    )}
                                    {item.status === 'em_producao' && (
                                        <button onClick={() => atualizarFila(item.id, { status: 'concluido' })}
                                            style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                            Concluir
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Custeio Automático ═══ */}
            <SlidePanel isOpen={showCusteio} onClose={() => setShowCusteio(false)} title="Custeio por Peça" width={640}>
                {custeioData && (<div>
                    {/* Totais */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                        {[
                            { label: 'Material', val: custeioData.totais.material, color: '#3b82f6' },
                            { label: 'Máquina', val: custeioData.totais.maquina, color: '#f59e0b' },
                            { label: 'Borda', val: custeioData.totais.borda, color: '#8b5cf6' },
                            { label: 'Total', val: custeioData.totais.total, color: '#22c55e' },
                        ].map(t => (
                            <div key={t.label} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: `${t.color}08`, border: `1px solid ${t.color}30`, textAlign: 'center' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: t.color }}>R${t.val.toFixed(2)}</div>
                                <div style={{ fontSize: 9, fontWeight: 600, color: t.color, opacity: 0.8 }}>{t.label}</div>
                            </div>
                        ))}
                    </div>
                    {/* Parâmetros */}
                    {custeioData.params && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', gap: 12 }}>
                            <span>Material: R${custeioData.params.custo_m2}/m²</span>
                            <span>Máquina: R${custeioData.params.custo_maquina_min}/min</span>
                            <span>Borda: R${custeioData.params.custo_borda_m}/m</span>
                        </div>
                    )}
                    {/* Tabela de peças */}
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Peça</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Área m²</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Material</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Máquina</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Borda</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {custeioData.pecas.map((p, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '5px 6px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.peca_desc || `#${p.peca_id}`}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace', fontSize: 10 }}>{p.area_m2.toFixed(4)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace' }}>R${p.custo_material.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace' }}>R${p.custo_maquina.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace' }}>R${p.custo_borda.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace', fontWeight: 700 }}>R${p.custo_total.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>)}
            </SlidePanel>

            {/* ═══ SlidePanel Estoque de Chapas ═══ */}
            <SlidePanel isOpen={showEstoque} onClose={() => setShowEstoque(false)} title="Estoque de Chapas" width={560}>
                {/* Alertas de estoque baixo */}
                {estoqueAlertas.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>
                            <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                            {estoqueAlertas.length} chapa(s) com estoque baixo
                        </div>
                        {estoqueAlertas.map(a => (
                            <div key={a.id} style={{ fontSize: 10, color: '#ef4444', padding: '2px 0' }}>
                                {a.nome}: {a.estoque_qtd || 0} un. (mín: {a.estoque_minimo})
                            </div>
                        ))}
                    </div>
                )}
                {/* Lista de chapas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {estoqueChapas.map(ch => (
                        <div key={ch.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{ch.nome}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {ch.comprimento}×{ch.largura}mm · {ch.espessura_nominal}mm · {ch.material_code || '-'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', minWidth: 60 }}>
                                <div style={{
                                    fontSize: 18, fontWeight: 800,
                                    color: (ch.estoque_minimo > 0 && (ch.estoque_qtd || 0) <= ch.estoque_minimo) ? '#ef4444' : 'var(--text-primary)',
                                }}>{ch.estoque_qtd || 0}</div>
                                <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>un.</div>
                            </div>
                            {ch.custo_unitario > 0 && (
                                <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', minWidth: 70 }}>
                                    R${ch.custo_unitario.toFixed(2)}/un
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => {
                                    const qtd = prompt(`Entrada de ${ch.nome} — quantidade:`);
                                    if (qtd && Number(qtd) > 0) movimentarEstoque(ch.id, 'entrada', Number(qtd), 'Entrada manual');
                                }} style={{
                                    fontSize: 9, padding: '4px 8px', borderRadius: 4,
                                    background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
                                    cursor: 'pointer', fontWeight: 700,
                                }}>+</button>
                                <button onClick={() => {
                                    const qtd = prompt(`Saída de ${ch.nome} — quantidade:`);
                                    if (qtd && Number(qtd) > 0) movimentarEstoque(ch.id, 'saida', Number(qtd), 'Saída manual');
                                }} style={{
                                    fontSize: 9, padding: '4px 8px', borderRadius: 4,
                                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                    cursor: 'pointer', fontWeight: 700,
                                }}>-</button>
                            </div>
                        </div>
                    ))}
                    {estoqueChapas.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhuma chapa cadastrada. Cadastre em Configurações → Chapas.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Tool Prediction ═══ */}
            <SlidePanel isOpen={showToolPrediction} onClose={() => setShowToolPrediction(false)} title="Predição de Ferramentas" width={560}>
                {toolPrediction && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(toolPrediction.predictions || []).map((p, i) => {
                            const pct = p.vida_restante_pct || 0;
                            const color = pct < 20 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22c55e';
                            return (
                                <div key={i} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700 }}>{p.ferramenta_nome || `Ferramenta #${p.ferramenta_id}`}</span>
                                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${color}20`, color, fontWeight: 700 }}>
                                            {pct.toFixed(0)}% vida
                                        </span>
                                    </div>
                                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-muted)', overflow: 'hidden', marginBottom: 6 }}>
                                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-muted)' }}>
                                        <span>Horas uso: {(p.horas_uso || 0).toFixed(1)}h</span>
                                        <span>Vida total: {(p.ciclo_vida_horas || 0).toFixed(0)}h</span>
                                        {p.previsao_troca && <span style={{ color: '#f59e0b' }}>Troca em: {p.previsao_troca}</span>}
                                    </div>
                                </div>
                            );
                        })}
                        {(!toolPrediction.predictions || toolPrediction.predictions.length === 0) && (
                            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                                Nenhuma ferramenta com dados de desgaste registrados.
                            </div>
                        )}
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Tool Maintenance ═══ */}
            <SlidePanel isOpen={showToolMaint} onClose={() => setShowToolMaint(false)} title="Manutenção Programada" width={600}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button onClick={async () => {
                        const nome = prompt('Nome da manutenção:');
                        if (!nome) return;
                        try {
                            await api.post('/cnc/tool-manutencao', { tipo: 'preventiva', descricao: nome, data_programada: new Date().toISOString().split('T')[0] });
                            loadToolMaintenance();
                            notify('Manutenção agendada', 'success');
                        } catch (err) { notify(err.error || 'Erro'); }
                    }} className={Z.btn} style={{ fontSize: 11, padding: '6px 14px' }}>
                        <Plus size={12} style={{ marginRight: 4 }} /> Nova Manutenção
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {toolMaintenance.map((m, i) => (
                        <div key={m.id || i} style={{
                            padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                            borderLeft: `3px solid ${m.status === 'concluida' ? '#22c55e' : m.status === 'atrasada' ? '#ef4444' : '#f59e0b'}`,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>{m.descricao || m.tipo}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
                                    background: m.status === 'concluida' ? 'rgba(34,197,94,0.1)' : m.status === 'atrasada' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                    color: m.status === 'concluida' ? '#22c55e' : m.status === 'atrasada' ? '#ef4444' : '#f59e0b',
                                    fontWeight: 600 }}>{m.status || 'pendente'}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                {m.ferramenta_nome && <span>Ferramenta: {m.ferramenta_nome} · </span>}
                                Programada: {m.data_programada || '-'}
                                {m.data_realizada && <span> · Realizada: {m.data_realizada}</span>}
                            </div>
                            {m.status !== 'concluida' && (
                                <button onClick={async () => {
                                    try {
                                        await api.put(`/cnc/tool-manutencao/${m.id}`, { status: 'concluida', data_realizada: new Date().toISOString().split('T')[0] });
                                        loadToolMaintenance();
                                        notify('Manutenção concluída', 'success');
                                    } catch (err) { notify(err.error || 'Erro'); }
                                }} style={{ marginTop: 6, fontSize: 10, padding: '3px 10px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer' }}>
                                    <Check size={10} style={{ marginRight: 3 }} /> Concluir
                                </button>
                            )}
                        </div>
                    ))}
                    {toolMaintenance.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhuma manutenção programada.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Material Audit ═══ */}
            <SlidePanel isOpen={showMaterialAudit} onClose={() => setShowMaterialAudit(false)} title="Auditoria de Consumo" width={620}>
                {materialAudit.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-muted)', borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '8px 6px', textAlign: 'left' }}>Material</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Área Total (m²)</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Usado (m²)</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Sobra (m²)</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Desperdício</th>
                                </tr>
                            </thead>
                            <tbody>
                                {materialAudit.map((a, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px', fontWeight: 600 }}>{a.material || a.chapa_nome || '-'}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{(a.area_total_m2 || 0).toFixed(3)}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{(a.area_usada_m2 || 0).toFixed(3)}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{(a.area_sobra_m2 || 0).toFixed(3)}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace', color: (a.desperdicio_pct || 0) > 30 ? '#ef4444' : '#22c55e' }}>
                                            {(a.desperdicio_pct || 0).toFixed(1)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Nenhum registro de consumo para este lote.
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Reservations ═══ */}
            <SlidePanel isOpen={showReservations} onClose={() => setShowReservations(false)} title="Reserva de Material" width={560}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {reservations.map((r, i) => (
                        <div key={r.id || i} style={{
                            padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                            opacity: r.status === 'expirada' ? 0.5 : 1,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>{r.chapa_nome || `Chapa #${r.chapa_id}`}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
                                    background: r.status === 'ativa' ? 'rgba(34,197,94,0.1)' : r.status === 'expirada' ? 'rgba(239,68,68,0.1)' : 'rgba(100,100,100,0.1)',
                                    color: r.status === 'ativa' ? '#22c55e' : r.status === 'expirada' ? '#ef4444' : '#888',
                                    fontWeight: 600 }}>{r.status || 'ativa'}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                Qtd: {r.quantidade} · Lote: {r.lote_nome || r.lote_id}
                                {r.expira_em && <span> · Expira: {new Date(r.expira_em).toLocaleString('pt-BR')}</span>}
                            </div>
                            {r.status === 'ativa' && (
                                <button onClick={async () => {
                                    try {
                                        await api.put(`/cnc/reserva-material/${r.id}`, { status: 'cancelada' });
                                        loadReservations();
                                        notify('Reserva cancelada', 'success');
                                    } catch (err) { notify(err.error || 'Erro'); }
                                }} style={{ marginTop: 6, fontSize: 10, padding: '3px 10px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>
                                    Cancelar Reserva
                                </button>
                            )}
                        </div>
                    ))}
                    {reservations.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhuma reserva ativa. Use o estoque para reservar material.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Backup ═══ */}
            <SlidePanel isOpen={showBackups} onClose={() => setShowBackups(false)} title="Backups" width={500}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button onClick={criarBackup} className={Z.btn} style={{ fontSize: 11, padding: '6px 14px' }}>
                        <Plus size={12} style={{ marginRight: 4 }} /> Criar Backup
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {backups.map((b, i) => (
                        <div key={b.id || i} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                        }}>
                            <Server size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 600 }}>{b.filename || b.nome}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    {b.created_at ? new Date(b.created_at).toLocaleString('pt-BR') : '-'}
                                    {b.size_mb && <span> · {b.size_mb.toFixed(1)} MB</span>}
                                </div>
                            </div>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                                {b.status || 'ok'}
                            </span>
                        </div>
                    ))}
                    {backups.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhum backup realizado.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Machine Performance ═══ */}
            <SlidePanel isOpen={showMachinePerf} onClose={() => setShowMachinePerf(false)} title="Performance da Máquina" width={640}>
                {machinePerf ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Summary cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {[
                                { label: 'Tempo Médio/Chapa', value: `${(machinePerf.avg_tempo_min || 0).toFixed(1)} min`, color: '#3b82f6' },
                                { label: 'Peças/Hora', value: (machinePerf.pecas_hora || 0).toFixed(1), color: '#22c55e' },
                                { label: 'Aproveit. Médio', value: `${(machinePerf.avg_aproveitamento || 0).toFixed(1)}%`, color: '#f59e0b' },
                            ].map((c, i) => (
                                <div key={i} style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
                                </div>
                            ))}
                        </div>
                        {/* Recent logs */}
                        {machinePerf.logs && machinePerf.logs.length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Últimas Operações</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {machinePerf.logs.slice(0, 20).map((l, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-muted)', fontSize: 10, alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, minWidth: 80 }}>{l.maquina_nome || '-'}</span>
                                            <span style={{ flex: 1 }}>{l.lote_nome || `Lote #${l.lote_id}`}</span>
                                            <span style={{ fontFamily: 'monospace' }}>{(l.tempo_min || 0).toFixed(1)} min</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '-'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Carregando dados de performance...
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Label Preview ═══ */}
            <SlidePanel isOpen={showLabelPreview} onClose={() => setShowLabelPreview(false)} title="Preview Etiquetas" width={520}>
                {labelPreviewData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                            {labelPreviewData.total || 0} etiquetas · Template: {labelPreviewData.template_nome || 'Padrão'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
                            {(labelPreviewData.previews || []).slice(0, 20).map((p, i) => (
                                <div key={i} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>{p.descricao || p.peca_desc || `Peça #${i + 1}`}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {p.dimensoes || '-'} · {p.material || '-'} · {p.modulo || '-'}
                                    </div>
                                    {p.qr_data && (
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            QR: {p.qr_data.substring(0, 60)}...
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Carregando preview...
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Comparação Otimização (#36) ═══ */}
            <SlidePanel isOpen={showComparison} onClose={() => setShowComparison(false)} title="Comparação da Otimização" width={600}>
                {comparisonData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {[
                                { label: 'Chapas', value: comparisonData.total_chapas, color: '#3b82f6' },
                                { label: 'Peças', value: comparisonData.total_pecas, color: '#22c55e' },
                                { label: 'Aproveit. Médio', value: `${((comparisonData.aproveitamento_medio || 0) * 100).toFixed(1)}%`, color: '#f59e0b' },
                            ].map((c, i) => (
                                <div key={i} style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Área Total</div>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>{(comparisonData.area_total_m2 || 0).toFixed(3)} m²</div>
                            </div>
                            <div style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Área Utilizada</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{(comparisonData.area_usada_m2 || 0).toFixed(3)} m²</div>
                            </div>
                        </div>
                        {comparisonData.por_chapa && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Por Chapa</div>
                                {comparisonData.por_chapa.map((ch, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-muted)', marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, minWidth: 60 }}>Chapa {ch.idx + 1}</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>{ch.material} · {ch.pecas} pç</span>
                                        <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(ch.aproveitamento || 0) * 100}%`, background: (ch.aproveitamento || 0) > 0.7 ? '#22c55e' : (ch.aproveitamento || 0) > 0.5 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                                        </div>
                                        <span style={{ fontSize: 10, fontFamily: 'monospace', minWidth: 40, textAlign: 'right' }}>{((ch.aproveitamento || 0) * 100).toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {comparisonData.sobras?.length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Sobras Reutilizáveis ({comparisonData.sobras.length})</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {comparisonData.sobras.slice(0, 10).map((s, i) => (
                                        <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                                            Ch{s.chapa + 1}: {Math.round(s.w)}×{Math.round(s.h)}mm
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
            </SlidePanel>

            {/* ═══ SlidePanel Dashboard Desperdício (#39) ═══ */}
            <SlidePanel isOpen={showWaste} onClose={() => setShowWaste(false)} title="Dashboard de Desperdício" width={660}>
                {wasteData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                            Últimos 6 meses · {wasteData.total_lotes} lotes analisados
                        </div>
                        {/* By month */}
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Por Mês</div>
                            {Object.entries(wasteData.por_mes || {}).sort().reverse().map(([mes, d]) => (
                                <div key={mes} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-muted)', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 60 }}>{mes}</span>
                                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${100 - (d.desperdicio_pct || 0)}%`, background: (d.desperdicio_pct || 0) < 25 ? '#22c55e' : (d.desperdicio_pct || 0) < 40 ? '#f59e0b' : '#ef4444', borderRadius: 4 }} />
                                    </div>
                                    <span style={{ fontSize: 10, fontFamily: 'monospace', minWidth: 50, textAlign: 'right', color: (d.desperdicio_pct || 0) > 35 ? '#ef4444' : 'var(--text-muted)' }}>
                                        {(d.desperdicio_pct || 0).toFixed(1)}% desp.
                                    </span>
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 40 }}>{d.chapas} ch.</span>
                                </div>
                            ))}
                        </div>
                        {/* By material */}
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Por Material</div>
                            {Object.entries(wasteData.por_material || {}).sort((a, b) => b[1].area_total - a[1].area_total).map(([mat, d]) => (
                                <div key={mat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-muted)', marginBottom: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mat}</span>
                                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{d.area_total.toFixed(2)}m²</span>
                                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: (d.desperdicio_pct || 0) > 35 ? '#ef4444' : '#22c55e' }}>{(d.desperdicio_pct || 0).toFixed(1)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
            </SlidePanel>

            {/* ═══ SlidePanel Sugestão Agrupamento (#40) ═══ */}
            <SlidePanel isOpen={showGrouping} onClose={() => setShowGrouping(false)} title="Sugestão de Agrupamento" width={580}>
                {groupingSuggestions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.15)' }}>
                            Lotes com materiais em comum que podem ser otimizados juntos para reduzir desperdício.
                        </div>
                        {groupingSuggestions.map((s, i) => (
                            <div key={i} style={{ padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700 }}>{s.material}</span>
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 700 }}>
                                        ~{s.economia_estimada} economia
                                    </span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                                    {s.total_pecas} peças · {s.total_area_m2.toFixed(2)} m² · {s.lotes.length} lotes
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {s.lotes.map((l, li) => (
                                        <span key={li} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                                            {l.lote_nome || `Lote #${l.lote_id}`} ({l.qty} pç)
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Nenhuma sugestão de agrupamento encontrada. Todos os lotes usam materiais diferentes.
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Retalhos Aproveitáveis (#42) ═══ */}
            <SlidePanel isOpen={showRemnants} onClose={() => setShowRemnants(false)} title="Retalhos Aproveitáveis" width={620}>
                {remnantsData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                            {remnantsData.total_retalhos} retalhos disponíveis · {remnantsData.matches?.length || 0} com peças que cabem
                        </div>
                        {(remnantsData.matches || []).length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#22c55e' }}>Matches Encontrados</div>
                                {remnantsData.matches.map((m, i) => (
                                    <div key={i} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700 }}>
                                                Retalho {Math.round(m.retalho.w)}×{Math.round(m.retalho.h)}mm
                                            </span>
                                            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>
                                                {m.pecas_que_cabem} peça(s) cabem!
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                                            Material: {m.retalho.material} · Lote #{m.retalho.lote_id}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {(m.pecas || []).map((p, pi) => (
                                                <span key={pi} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                                    {p.desc} ({p.dims})
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {(remnantsData.remnants || []).length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Todos os Retalhos</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                                    {remnantsData.remnants.map((r, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 10 }}>
                                            <div style={{ fontWeight: 700 }}>{Math.round(r.w)}×{Math.round(r.h)}mm</div>
                                            <div style={{ color: 'var(--text-muted)' }}>{r.material}</div>
                                            <div style={{ color: 'var(--text-muted)' }}>{r.area_m2.toFixed(3)} m²</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
            </SlidePanel>

            {/* ═══ Modal Seleção de Retalhos pré-Otimização ═══ */}
            {showRetalhosModal && (
                <Modal title="Selecionar Retalhos para Otimização" close={() => setShowRetalhosModal(false)} w={700}>
                    {retalhosPreviewLoading ? (
                        <div style={{ padding: 40, textAlign: 'center' }}>
                            <Spinner /> <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 13 }}>Simulando aproveitamento dos retalhos...</span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Info banner */}
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6, lineHeight: 1.5 }}>
                                O sistema simulou quais retalhos podem ser aproveitados. Marque os que deseja usar.
                                Retalhos sugeridos (✓) têm bom aproveitamento.
                            </div>

                            {(retalhosPreview || []).map(grupo => (
                                <div key={grupo.groupKey}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{grupo.material_nome}</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '2px 8px', borderRadius: 10 }}>
                                            {grupo.total_pecas} peças · esp {grupo.espessura}mm
                                        </span>
                                    </div>
                                    {grupo.retalhos.length === 0 ? (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 12px', fontStyle: 'italic' }}>Sem retalhos disponíveis</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {grupo.retalhos.map(ret => {
                                                const checked = !!retalhosSelected[ret.id];
                                                return (
                                                    <div key={ret.id}
                                                        onClick={() => setRetalhosSelected(prev => ({ ...prev, [ret.id]: !prev[ret.id] }))}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                                            borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                                                            border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                                                            background: checked ? 'rgba(19,121,240,0.04)' : 'var(--bg-card)',
                                                        }}>
                                                        {/* Checkbox */}
                                                        <div style={{
                                                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                                            border: `2px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                                                            background: checked ? 'var(--primary)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            {checked && <Check size={12} color="#fff" />}
                                                        </div>
                                                        {/* Dimensions */}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={{ fontSize: 12, fontWeight: 700 }}>{ret.comprimento}×{ret.largura}mm</span>
                                                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ret.area_m2} m²</span>
                                                                {ret.sugerido && <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '1px 6px', borderRadius: 8 }}>Sugerido</span>}
                                                            </div>
                                                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                                                {ret.nome}{ret.origem_lote ? ` · Lote #${ret.origem_lote}` : ' · Manual'}
                                                            </div>
                                                        </div>
                                                        {/* Simulation result */}
                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                            {ret.pecas_que_cabem > 0 ? (
                                                                <>
                                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{ret.pecas_que_cabem} peças</div>
                                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ret.aproveitamento}%</div>
                                                                </>
                                                            ) : (
                                                                <div style={{ fontSize: 10, color: '#ef4444' }}>
                                                                    {ret.cabe_alguma ? '0 peças' : 'Nenhuma cabe'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Actions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                <button onClick={() => {
                                    setShowRetalhosModal(false);
                                    doOtimizar([]);
                                }} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                    Otimizar sem retalhos
                                </button>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setShowRetalhosModal(false)} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 12 }}>
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => {
                                            const ids = Object.entries(retalhosSelected).filter(([, v]) => v).map(([k]) => Number(k));
                                            doOtimizar(ids);
                                        }}
                                        className={Z.btn}
                                        style={{ padding: '8px 20px', fontSize: 12, fontWeight: 700 }}>
                                        <Scissors size={14} /> Otimizar{Object.values(retalhosSelected).filter(Boolean).length > 0
                                            ? ` com ${Object.values(retalhosSelected).filter(Boolean).length} retalho(s)`
                                            : ''}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MODAL PREVIEW G-CODE — visualiza stats + código antes de baixar
// ═══════════════════════════════════════════════════════
// ─── G-Code Parser para simulador 2D (com eventos de ferramenta/operação) ───
