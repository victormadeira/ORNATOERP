import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Clock, Play, Square, ChevronRight, Layers, Package,
    Scissors, Timer, BarChart3, RefreshCw, ArrowRight, Monitor
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────
const REFRESH_INTERVAL = 10000;
const LS_TIMER_KEY = 'cnc_tv_timer';

const COLORS = {
    bg: '#0f172a',
    card: '#1e293b',
    cardBorder: '#334155',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    green: '#22c55e',
    greenDim: '#166534',
    yellow: '#eab308',
    yellowDim: '#854d0e',
    red: '#ef4444',
    blue: '#3b82f6',
    blueDim: '#1e40af',
    purple: '#a855f7',
    cyan: '#06b6d4',
    orange: '#f97316',
};

const MODULE_COLORS = [
    '#5b7fa6', '#8b6e4e', '#6a8e6e', '#9e7b5c', '#7a8999',
    '#a67c52', '#6b8f8b', '#8a7d6d', '#5f7d8a', '#7d6b5e',
    '#4e8caa', '#a06b6b', '#5e9a7e', '#b08850', '#6882a0',
];

function getModuleColor(modId) {
    return MODULE_COLORS[(modId || 0) % MODULE_COLORS.length];
}

// ── Helpers ───────────────────────────────────────────────────
function getHeaders() {
    const token = localStorage.getItem('erp_token');
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
}

function formatTimer(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Timer persistence ─────────────────────────────────────────
function loadTimerState() {
    try {
        const raw = localStorage.getItem(LS_TIMER_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

function saveTimerState(state) {
    localStorage.setItem(LS_TIMER_KEY, JSON.stringify(state));
}

function clearTimerState() {
    localStorage.removeItem(LS_TIMER_KEY);
}

// ── Clock ─────────────────────────────────────────────────────
function TVClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    const horas = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const data = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return (
        <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: COLORS.text, letterSpacing: 2, lineHeight: 1 }}>
                {horas}
            </div>
            <div style={{ fontSize: 14, color: COLORS.textMuted, textTransform: 'capitalize', marginTop: 4 }}>
                {data}
            </div>
        </div>
    );
}

// ── Progress Bar ──────────────────────────────────────────────
function ProgressBar({ value, color, height = 16 }) {
    const pct = Math.min(100, Math.max(0, value || 0));
    return (
        <div style={{
            width: '100%', height, borderRadius: height / 2,
            background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
            <div style={{
                width: `${pct}%`, height: '100%', borderRadius: height / 2,
                background: color || COLORS.blue,
                transition: 'width 0.6s ease',
            }} />
        </div>
    );
}

// ── Countdown refresh bar ─────────────────────────────────────
function CountdownBar({ refreshIn, total }) {
    const pct = (refreshIn / total) * 100;
    return (
        <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, height: 4,
            background: 'rgba(255,255,255,0.05)', zIndex: 100,
        }}>
            <div style={{
                width: `${pct}%`, height: '100%',
                background: COLORS.blue, transition: 'width 1s linear',
            }} />
        </div>
    );
}

// ── Simplified Chapa SVG ──────────────────────────────────────
function ChapaSVG({ chapa, pecasDB, cortadas, width, height, showLabels = true }) {
    if (!chapa) return null;

    const PAD = 12;
    const chapaW = chapa.largura || chapa.width || 2750;
    const chapaH = chapa.comprimento || chapa.height || 1850;

    const scaleX = (width - PAD * 2) / chapaW;
    const scaleY = (height - PAD * 2) / chapaH;
    const scale = Math.min(scaleX, scaleY);

    const drawW = chapaW * scale;
    const drawH = chapaH * scale;
    const offX = PAD + (width - PAD * 2 - drawW) / 2;
    const offY = PAD + (height - PAD * 2 - drawH) / 2;

    const pecas = chapa.pecas || [];
    const cortadasSet = new Set(cortadas || []);

    // Build module map from pecasDB
    const pecasMap = {};
    if (pecasDB) {
        for (const p of pecasDB) {
            pecasMap[p.id] = p;
        }
    }

    return (
        <svg width={width} height={height} style={{ display: 'block' }}>
            {/* Sheet background */}
            <rect
                x={offX} y={offY} width={drawW} height={drawH}
                fill="#1a2744" stroke="#475569" strokeWidth={1.5} rx={3}
            />

            {/* Pieces */}
            {pecas.map((p, i) => {
                const pw = Math.max(2, ((p.rotacionada
                    ? (p.largura || p.w)
                    : (p.comprimento || p.l || p.w)) || 60) * scale);
                const ph = Math.max(2, ((p.rotacionada
                    ? (p.comprimento || p.l || p.w)
                    : (p.largura || p.h || p.w)) || 40) * scale);
                const px = offX + (p.pos_x || p.x || 0) * scale;
                const py = offY + (p.pos_y || p.y || 0) * scale;

                const pecaId = p.id || p.peca_id || p.pecaId;
                const dbPeca = pecasMap[pecaId];
                const modId = dbPeca?.modulo_id || p.modulo_id || 0;
                const color = getModuleColor(modId);
                const isCut = cortadasSet.has(pecaId);

                return (
                    <g key={i}>
                        <rect
                            x={px} y={py} width={pw} height={ph}
                            fill={isCut ? 'rgba(34,197,94,0.25)' : `${color}40`}
                            stroke={isCut ? '#22c55e' : color}
                            strokeWidth={isCut ? 2 : 1} rx={2}
                        />
                        {isCut && pw > 16 && ph > 12 && (
                            <text
                                x={px + pw / 2} y={py + ph / 2 + 5}
                                textAnchor="middle" fill="#22c55e"
                                fontSize={Math.min(14, pw / 3)} fontWeight="bold"
                            >&#10003;</text>
                        )}
                        {showLabels && !isCut && pw > 30 && ph > 18 && (
                            <text
                                x={px + pw / 2} y={py + ph / 2 + 4}
                                textAnchor="middle" fill={color}
                                fontSize={Math.min(11, pw / 5, ph / 2.5)} fontWeight="600"
                                style={{ opacity: 0.9 }}
                            >
                                {dbPeca?.codigo || p.label || `P${i + 1}`}
                            </text>
                        )}
                    </g>
                );
            })}

            {/* Retalhos (remnants) */}
            {(chapa.retalhos || []).map((r, i) => {
                const rw = (r.largura || r.w || 0) * scale;
                const rh = (r.comprimento || r.l || r.h || 0) * scale;
                const rx = offX + (r.pos_x || r.x || 0) * scale;
                const ry = offY + (r.pos_y || r.y || 0) * scale;
                if (rw < 3 || rh < 3) return null;
                return (
                    <g key={`r${i}`}>
                        <rect
                            x={rx} y={ry} width={rw} height={rh}
                            fill="rgba(249,115,22,0.12)" stroke="#f97316"
                            strokeWidth={1} strokeDasharray="4 2" rx={2}
                        />
                        {rw > 40 && rh > 20 && (
                            <text
                                x={rx + rw / 2} y={ry + rh / 2 + 4}
                                textAnchor="middle" fill="#f97316"
                                fontSize={10} fontWeight="500" style={{ opacity: 0.7 }}
                            >Retalho</text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

// ── Chapa Thumbnail ───────────────────────────────────────────
function ChapaThumb({ chapa, pecasDB, cortadas, active }) {
    return (
        <div style={{
            background: active ? 'rgba(59,130,246,0.15)' : COLORS.card,
            border: active ? `2px solid ${COLORS.blue}` : `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12, padding: 8, width: 200,
            transition: 'all 0.3s',
        }}>
            <ChapaSVG chapa={chapa} pecasDB={pecasDB} cortadas={cortadas} width={184} height={110} showLabels={false} />
            <div style={{ marginTop: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>
                    {chapa.material || 'Material'}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                    {(chapa.pecas || []).length} pecas - {chapa.comprimento || chapa.height}x{chapa.largura || chapa.width}mm
                </div>
            </div>
        </div>
    );
}

// ── Lote Selector ─────────────────────────────────────────────
function LoteSelector({ onSelect }) {
    const [lotes, setLotes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/cnc/lotes', { headers: getHeaders() })
            .then(r => r.json())
            .then(data => {
                setLotes(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: COLORS.bg }}>
            <div style={{ color: COLORS.textMuted, fontSize: 24 }}>Carregando lotes...</div>
        </div>
    );

    const lotesComPlano = lotes.filter(l => l.plano_json || l.status === 'otimizado');

    return (
        <div style={{
            minHeight: '100vh', background: COLORS.bg, padding: 48,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 48 }}>
                <Monitor size={48} color={COLORS.blue} />
                <div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: COLORS.text }}>TV Corte CNC</div>
                    <div style={{ fontSize: 18, color: COLORS.textMuted }}>Selecione o lote para acompanhar</div>
                </div>
            </div>

            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 20, width: '100%', maxWidth: 1200,
            }}>
                {lotesComPlano.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: COLORS.textDim, fontSize: 20 }}>
                        Nenhum lote com plano de corte encontrado
                    </div>
                )}
                {lotesComPlano.map(l => (
                    <button
                        key={l.id}
                        onClick={() => onSelect(l.id)}
                        style={{
                            background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
                            borderRadius: 16, padding: 24, cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.blue; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.cardBorder; e.currentTarget.style.transform = 'none'; }}
                    >
                        <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>
                            {l.nome}
                        </div>
                        <div style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 4 }}>
                            {l.cliente || 'Sem cliente'}
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: COLORS.textDim }}>
                            <span>{l.total_pecas || '?'} pecas</span>
                            <span>{l.status || 'pendente'}</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────
export default function ProducaoCNCTV() {
    const params = new URLSearchParams(window.location.search);
    const loteParam = params.get('lote');

    const [loteId, setLoteId] = useState(loteParam ? Number(loteParam) : null);
    const [lote, setLote] = useState(null);
    const [plano, setPlano] = useState(null);
    const [cortadas, setCortadas] = useState([]);
    const [chapaIdx, setChapaIdx] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshIn, setRefreshIn] = useState(REFRESH_INTERVAL / 1000);

    // Timer state
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [timerChapaIdx, setTimerChapaIdx] = useState(null);
    const timerInterval = useRef(null);

    // Restore timer from localStorage on mount
    useEffect(() => {
        const saved = loadTimerState();
        if (saved && saved.loteId === loteId) {
            setTimerChapaIdx(saved.chapaIdx);
            if (saved.running && saved.startedAt) {
                const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000);
                setTimerSeconds(elapsed);
                setTimerRunning(true);
            } else {
                setTimerSeconds(saved.elapsed || 0);
                setTimerRunning(false);
            }
        }
    }, [loteId]);

    // Timer tick
    useEffect(() => {
        if (timerRunning) {
            timerInterval.current = setInterval(() => {
                setTimerSeconds(s => s + 1);
            }, 1000);
        } else {
            if (timerInterval.current) clearInterval(timerInterval.current);
        }
        return () => { if (timerInterval.current) clearInterval(timerInterval.current); };
    }, [timerRunning]);

    // Save timer state on change
    useEffect(() => {
        if (timerChapaIdx === null && !timerRunning) return;
        const saved = loadTimerState();
        saveTimerState({
            loteId,
            chapaIdx: timerChapaIdx,
            running: timerRunning,
            elapsed: timerSeconds,
            startedAt: timerRunning ? (saved?.startedAt || Date.now()) : null,
        });
    }, [timerRunning, timerSeconds, timerChapaIdx, loteId]);

    const startTimer = () => {
        setTimerChapaIdx(chapaIdx);
        setTimerSeconds(0);
        setTimerRunning(true);
        saveTimerState({
            loteId,
            chapaIdx,
            running: true,
            elapsed: 0,
            startedAt: Date.now(),
        });
    };

    const stopTimer = () => {
        setTimerRunning(false);
        // Keep elapsed visible
    };

    const resetTimer = () => {
        setTimerRunning(false);
        setTimerSeconds(0);
        setTimerChapaIdx(null);
        clearTimerState();
    };

    // ── Fetch data ────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        if (!loteId) return;
        try {
            const headers = getHeaders();
            const [loteRes, corteRes] = await Promise.all([
                fetch(`/api/cnc/lotes/${loteId}`, { headers }),
                fetch(`/api/cnc/expedicao/corte-status/${loteId}`, { headers }),
            ]);

            if (!loteRes.ok) throw new Error(`Erro ${loteRes.status}`);
            const loteData = await loteRes.json();
            setLote(loteData);

            if (loteData.plano_json) {
                const p = typeof loteData.plano_json === 'string'
                    ? JSON.parse(loteData.plano_json) : loteData.plano_json;
                setPlano(p);
            }

            if (corteRes.ok) {
                const corteData = await corteRes.json();
                setCortadas(corteData.cortadas || []);
            }

            setError(null);
        } catch (err) {
            console.error('ProducaoCNCTV fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [loteId]);

    useEffect(() => {
        if (loteId) {
            setLoading(true);
            fetchData();
        }
    }, [loteId, fetchData]);

    // Auto-refresh
    useEffect(() => {
        if (!loteId) return;
        const countdown = setInterval(() => {
            setRefreshIn(prev => {
                if (prev <= 1) {
                    fetchData();
                    return REFRESH_INTERVAL / 1000;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(countdown);
    }, [loteId, fetchData]);

    // ── No lote selected ──────────────────────────────────────
    if (!loteId) {
        return <LoteSelector onSelect={(id) => {
            setLoteId(id);
            window.history.replaceState(null, '', `?lote=${id}`);
        }} />;
    }

    // ── Loading / Error ───────────────────────────────────────
    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: COLORS.bg }}>
            <RefreshCw size={32} color={COLORS.blue} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (error) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: COLORS.bg, gap: 16 }}>
            <div style={{ color: COLORS.red, fontSize: 24, fontWeight: 700 }}>Erro ao carregar</div>
            <div style={{ color: COLORS.textMuted, fontSize: 16 }}>{error}</div>
            <button
                onClick={() => { setError(null); setLoading(true); fetchData(); }}
                style={{
                    background: COLORS.blue, color: '#fff', border: 'none', borderRadius: 8,
                    padding: '10px 24px', fontSize: 16, cursor: 'pointer', marginTop: 8,
                }}
            >Tentar novamente</button>
        </div>
    );

    // ── Parse data ────────────────────────────────────────────
    const chapas = plano?.plano?.chapas || plano?.chapas || [];
    const totalChapas = chapas.length;
    const chapaAtual = chapas[chapaIdx] || null;
    const pecasDB = lote?.pecas || [];

    // Cortadas per chapa
    const cortadasSet = new Set(cortadas);
    const pecasChapaAtual = (chapaAtual?.pecas || []).map(p => p.id || p.peca_id || p.pecaId);
    const cortadasChapaAtual = pecasChapaAtual.filter(id => cortadasSet.has(id)).length;
    const totalPecasChapaAtual = pecasChapaAtual.length;

    // Overall progress
    const totalPecasLote = pecasDB.reduce((s, p) => s + (p.quantidade || 1), 0);
    const totalCortadas = cortadas.length;
    const progressPct = totalPecasLote > 0 ? Math.round((totalCortadas / totalPecasLote) * 100) : 0;

    // Chapas cortadas (all pieces on a chapa are cut)
    let chapasCortadas = 0;
    for (let ci = 0; ci < chapas.length; ci++) {
        const ids = (chapas[ci].pecas || []).map(p => p.id || p.peca_id || p.pecaId);
        if (ids.length > 0 && ids.every(id => cortadasSet.has(id))) chapasCortadas++;
    }

    // Queue: next 3 chapas
    const queue = chapas.slice(chapaIdx + 1, chapaIdx + 4);

    // Module legend
    const moduleMap = {};
    for (const p of pecasDB) {
        if (p.modulo_desc) {
            const modId = p.modulo_id || 0;
            if (!moduleMap[modId]) {
                moduleMap[modId] = { name: p.modulo_desc, color: getModuleColor(modId) };
            }
        }
    }

    return (
        <div style={{
            minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
            fontFamily: "'Inter', -apple-system, sans-serif",
            padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Scissors size={36} color={COLORS.blue} />
                    <div>
                        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
                            {lote?.nome || `Lote #${loteId}`}
                        </div>
                        <div style={{ fontSize: 16, color: COLORS.textMuted, marginTop: 2 }}>
                            {lote?.cliente || 'Cliente'} {lote?.projeto ? ` - ${lote.projeto}` : ''}
                        </div>
                    </div>
                </div>
                <TVClock />
            </div>

            {/* Main content grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, flex: 1, minHeight: 0 }}>

                {/* Left: Current chapa */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Chapa progress */}
                    <div style={{
                        background: COLORS.card, borderRadius: 16, padding: '16px 24px',
                        border: `1px solid ${COLORS.cardBorder}`,
                        display: 'flex', alignItems: 'center', gap: 20,
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                                <div style={{ fontSize: 22, fontWeight: 800 }}>
                                    Chapa {chapaIdx + 1} de {totalChapas}
                                </div>
                                <div style={{ fontSize: 14, color: COLORS.textMuted }}>
                                    {cortadasChapaAtual}/{totalPecasChapaAtual} pecas cortadas
                                </div>
                            </div>
                            <ProgressBar
                                value={totalPecasChapaAtual > 0 ? (cortadasChapaAtual / totalPecasChapaAtual) * 100 : 0}
                                color={cortadasChapaAtual === totalPecasChapaAtual && totalPecasChapaAtual > 0 ? COLORS.green : COLORS.blue}
                                height={14}
                            />
                        </div>
                        {/* Navigation */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => setChapaIdx(i => Math.max(0, i - 1))}
                                disabled={chapaIdx === 0}
                                style={{
                                    background: chapaIdx === 0 ? 'rgba(255,255,255,0.05)' : COLORS.blueDim,
                                    color: chapaIdx === 0 ? COLORS.textDim : '#fff',
                                    border: 'none', borderRadius: 8, width: 44, height: 44,
                                    cursor: chapaIdx === 0 ? 'default' : 'pointer',
                                    fontSize: 20, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >&#8249;</button>
                            <button
                                onClick={() => setChapaIdx(i => Math.min(totalChapas - 1, i + 1))}
                                disabled={chapaIdx >= totalChapas - 1}
                                style={{
                                    background: chapaIdx >= totalChapas - 1 ? 'rgba(255,255,255,0.05)' : COLORS.blueDim,
                                    color: chapaIdx >= totalChapas - 1 ? COLORS.textDim : '#fff',
                                    border: 'none', borderRadius: 8, width: 44, height: 44,
                                    cursor: chapaIdx >= totalChapas - 1 ? 'default' : 'pointer',
                                    fontSize: 20, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >&#8250;</button>
                        </div>
                    </div>

                    {/* SVG visualization */}
                    <div style={{
                        background: COLORS.card, borderRadius: 16, padding: 16,
                        border: `1px solid ${COLORS.cardBorder}`, flex: 1,
                        display: 'flex', flexDirection: 'column', minHeight: 300,
                    }}>
                        {/* Sheet info bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>
                                    {chapaAtual?.material || 'Material'}
                                </span>
                                <span style={{ fontSize: 14, color: COLORS.textMuted }}>
                                    {chapaAtual?.comprimento || chapaAtual?.height || '?'}
                                    x{chapaAtual?.largura || chapaAtual?.width || '?'}mm
                                    {chapaAtual?.espessura ? ` - ${chapaAtual.espessura}mm esp.` : ''}
                                </span>
                            </div>
                            <div style={{ fontSize: 14, color: COLORS.textMuted }}>
                                Aproveitamento: <span style={{ color: COLORS.green, fontWeight: 700 }}>
                                    {chapaAtual?.aproveitamento || '?'}%
                                </span>
                            </div>
                        </div>

                        {/* SVG area */}
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                            {chapaAtual ? (
                                <ChapaSVG
                                    chapa={chapaAtual}
                                    pecasDB={pecasDB}
                                    cortadas={cortadas}
                                    width={Math.min(900, window.innerWidth - 440)}
                                    height={Math.min(500, window.innerHeight - 380)}
                                    showLabels={true}
                                />
                            ) : (
                                <div style={{ color: COLORS.textDim, fontSize: 18 }}>Nenhuma chapa disponivel</div>
                            )}
                        </div>

                        {/* Module legend */}
                        {Object.keys(moduleMap).length > 0 && (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12,
                                paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}`,
                            }}>
                                {Object.entries(moduleMap).map(([modId, mod]) => (
                                    <div key={modId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{
                                            width: 14, height: 14, borderRadius: 4,
                                            background: `${mod.color}40`, border: `2px solid ${mod.color}`,
                                        }} />
                                        <span style={{ fontSize: 12, color: COLORS.textMuted }}>{mod.name}</span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{
                                        width: 14, height: 14, borderRadius: 4,
                                        background: 'rgba(34,197,94,0.25)', border: '2px solid #22c55e',
                                    }} />
                                    <span style={{ fontSize: 12, color: COLORS.textMuted }}>Cortada</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Cut Timer */}
                    <div style={{
                        background: COLORS.card, borderRadius: 16, padding: 20,
                        border: `1px solid ${COLORS.cardBorder}`,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Timer size={20} color={timerRunning ? COLORS.green : COLORS.textMuted} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Tempo de Corte
                            </span>
                        </div>
                        <div style={{
                            fontSize: 42, fontWeight: 800, textAlign: 'center',
                            color: timerRunning ? COLORS.green : COLORS.text,
                            fontVariantNumeric: 'tabular-nums',
                            letterSpacing: 2, lineHeight: 1, marginBottom: 16,
                        }}>
                            {formatTimer(timerSeconds)}
                        </div>
                        {timerChapaIdx !== null && timerChapaIdx !== chapaIdx && (
                            <div style={{
                                fontSize: 11, color: COLORS.yellow, textAlign: 'center', marginBottom: 8,
                            }}>
                                Timer ativo para Chapa {timerChapaIdx + 1}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            {!timerRunning ? (
                                <button
                                    onClick={startTimer}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: COLORS.green, color: '#fff', border: 'none',
                                        borderRadius: 10, padding: '10px 20px', fontSize: 15,
                                        fontWeight: 700, cursor: 'pointer',
                                    }}
                                >
                                    <Play size={18} /> Iniciar Corte
                                </button>
                            ) : (
                                <button
                                    onClick={stopTimer}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: COLORS.red, color: '#fff', border: 'none',
                                        borderRadius: 10, padding: '10px 20px', fontSize: 15,
                                        fontWeight: 700, cursor: 'pointer',
                                    }}
                                >
                                    <Square size={18} /> Finalizar Corte
                                </button>
                            )}
                            {!timerRunning && timerSeconds > 0 && (
                                <button
                                    onClick={resetTimer}
                                    style={{
                                        background: 'rgba(255,255,255,0.08)', color: COLORS.textMuted,
                                        border: `1px solid ${COLORS.cardBorder}`,
                                        borderRadius: 10, padding: '10px 14px', fontSize: 14,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <RefreshCw size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Lote info */}
                    <div style={{
                        background: COLORS.card, borderRadius: 16, padding: 20,
                        border: `1px solid ${COLORS.cardBorder}`,
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                            Progresso do Lote
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 14, color: COLORS.textMuted }}>Pecas cortadas</span>
                            <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.text }}>
                                {totalCortadas}/{totalPecasLote}
                            </span>
                        </div>
                        <ProgressBar value={progressPct} color={COLORS.blue} height={12} />
                        <div style={{ fontSize: 13, color: COLORS.textDim, textAlign: 'right', marginTop: 4 }}>
                            {progressPct}%
                        </div>

                        <div style={{
                            marginTop: 16, paddingTop: 16,
                            borderTop: `1px solid ${COLORS.cardBorder}`,
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                        }}>
                            <div>
                                <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>Chapas</div>
                                <div style={{ fontSize: 22, fontWeight: 800 }}>{chapasCortadas}/{totalChapas}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: 0.5 }}>Materiais</div>
                                <div style={{ fontSize: 22, fontWeight: 800 }}>{lote?.materiais?.length || 1}</div>
                            </div>
                        </div>
                    </div>

                    {/* Queue */}
                    {queue.length > 0 && (
                        <div style={{
                            background: COLORS.card, borderRadius: 16, padding: 20,
                            border: `1px solid ${COLORS.cardBorder}`,
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                            }}>
                                <ArrowRight size={16} color={COLORS.textMuted} />
                                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Proximas Chapas
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {queue.map((ch, qi) => (
                                    <button
                                        key={qi}
                                        onClick={() => setChapaIdx(chapaIdx + 1 + qi)}
                                        style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${COLORS.cardBorder}`,
                                            borderRadius: 10, padding: 10, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderColor = COLORS.blue; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.cardBorder; }}
                                    >
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8,
                                            background: COLORS.blueDim, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
                                        }}>
                                            {chapaIdx + 2 + qi}
                                        </div>
                                        <div style={{ flex: 1, textAlign: 'left' }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                                                {ch.material || 'Material'}
                                            </div>
                                            <div style={{ fontSize: 11, color: COLORS.textDim }}>
                                                {(ch.pecas || []).length} pecas - {ch.comprimento || ch.height}x{ch.largura || ch.width}mm
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Back button */}
                    <button
                        onClick={() => { setLoteId(null); setPlano(null); setLote(null); window.history.replaceState(null, '', window.location.pathname); }}
                        style={{
                            background: 'rgba(255,255,255,0.05)', color: COLORS.textMuted,
                            border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10,
                            padding: '10px 16px', fontSize: 14, cursor: 'pointer',
                            textAlign: 'center',
                        }}
                    >
                        Trocar Lote
                    </button>
                </div>
            </div>

            <CountdownBar refreshIn={refreshIn} total={REFRESH_INTERVAL / 1000} />
        </div>
    );
}
