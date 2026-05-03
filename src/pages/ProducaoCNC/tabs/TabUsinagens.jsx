// Tab "Usinagens" — gerenciamento industrial de operações CNC por peça.
// Reativada com: validação de borda, estimativa de tempo, view 2D de face,
// e UI completa de overrides por operação (trocar ferramenta, feed, diâmetro...).

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../api';
import { SectionHeader, EmptyState, Spinner, Z } from '../../../ui';
import {
    Wrench, RefreshCw, AlertTriangle, CheckCircle2,
    ChevronDown, ChevronUp, Clock, Eye, EyeOff,
    ShieldAlert, Layers, Settings, Zap, X, List, Check,
} from 'lucide-react';

// ── Constantes ────────────────────────────────────────────────────
const USIN_LABELS = {
    transfer_vertical_saw_cut: { label: 'Rasgo / Canal',   color: '#eab308', bg: '#fef9c3', icon: '━' },
    transfer_pocket:           { label: 'Rebaixo',         color: '#a855f7', bg: '#f3e8ff', icon: '▬' },
    transfer_slot:             { label: 'Fresa / Slot',    color: '#06b6d4', bg: '#e0f7fa', icon: '◆' },
    transfer_hole_blind:       { label: 'Furo cego',       color: '#f97316', bg: '#fff4ed', icon: '◐' },
    transfer_hole:             { label: 'Furo passante',   color: '#dc2626', bg: '#fee2e2', icon: '●' },
};
const FACE_LABELS = { top: 'Face A', bottom: 'Face B', front: 'Frontal', back: 'Traseira', left: 'Esq.', right: 'Dir.' };
const CAT_INFO = {
    hole:    { label: 'Furos',      color: '#dc2626', bg: '#fee2e2', icon: '●' },
    pocket:  { label: 'Rebaixos',  color: '#a855f7', bg: '#f3e8ff', icon: '▬' },
    groove:  { label: 'Rasgos',    color: '#eab308', bg: '#fef9c3', icon: '━' },
    generic: { label: 'Usinagens', color: '#6366f1', bg: '#eef2ff', icon: <Settings size={11} /> },
};

// ── Helpers ───────────────────────────────────────────────────────
function usinInfo(cat) {
    const key = (cat || '').toLowerCase();
    return Object.entries(USIN_LABELS).find(([k]) => key.includes(k.replace('transfer_', '')))?.[1]
        || USIN_LABELS[key] || { label: cat || '?', icon: '?', color: '#888', bg: '#f5f5f5' };
}
function isHoleOp(cat) { return /hole|furo|drill/.test((cat || '').toLowerCase()); }
function estimarTempoSeg(w) {
    const tipo = (w.type || w.category || '').toLowerCase();
    const depth = Number(w.depth || 0);
    if (/hole|furo|drill/.test(tipo)) return 2 + depth * 0.3;
    if (/rasgo|canal|groove|saw/.test(tipo)) return 5 + (w.length || 50) * 0.005;
    if (/pocket|rebaixo|cavidade/.test(tipo)) {
        const pw = w.pocket_width || w.width || 50;
        const ph = w.pocket_height || w.height || 50;
        return 8 + (pw * ph) * 0.0002;
    }
    if (/slot|fresa/.test(tipo)) return 4 + (w.length || 40) * 0.004;
    return 3;
}
function fmtSeg(seg) {
    if (seg < 60) return `${Math.round(seg)}s`;
    return `${Math.floor(seg / 60)}min ${Math.round(seg % 60)}s`;
}
function parseMach(mj) {
    if (!mj) return [];
    try {
        const d = typeof mj === 'string' ? JSON.parse(mj) : mj;
        if (Array.isArray(d)) return d;
        if (Array.isArray(d?.workers)) return d.workers;
        if (d?.workers && typeof d.workers === 'object') return Object.values(d.workers);
        return [];
    } catch { return []; }
}

// ── Badge pequeno reutilizável ────────────────────────────────────
function Chip({ children, color = '#888', bg, style = {} }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
            color, background: bg || `${color}18`,
            whiteSpace: 'nowrap', ...style,
        }}>{children}</span>
    );
}

// ── Vista 2D da face ─────────────────────────────────────────────
function FaceView({ peca, workers, warnings }) {
    const W = peca.comprimento || 300;
    const H = peca.largura || 200;
    const MAX_W = 260, MAX_H = 160;
    const scale = Math.min(MAX_W / W, MAX_H / H);
    const vw = W * scale, vh = H * scale;
    const warnSet = new Set(warnings.map(w => w.workerIdx));

    return (
        <div style={{
            padding: '10px 12px', background: 'var(--bg-muted)', borderRadius: 6,
            border: '1px solid var(--border)', marginBottom: 8,
        }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Eye size={10} /> Vista superior — Face A · {W}×{H}mm
            </div>
            <svg width={vw} height={vh} style={{ borderRadius: 4, background: '#1a1a2e', display: 'block', border: '1px solid #334155' }}>
                {/* Grade */}
                {[...Array(5)].map((_, i) => (
                    <line key={`gx${i}`} x1={(i + 1) * vw / 6} y1={0} x2={(i + 1) * vw / 6} y2={vh} stroke="#ffffff08" strokeWidth={0.5} />
                ))}
                {[...Array(4)].map((_, i) => (
                    <line key={`gy${i}`} x1={0} y1={(i + 1) * vh / 5} x2={vw} y2={(i + 1) * vh / 5} stroke="#ffffff08" strokeWidth={0.5} />
                ))}
                {/* Borda */}
                <rect x={0.5} y={0.5} width={vw - 1} height={vh - 1} fill="none" stroke="#475569" strokeWidth={1} rx={2} />

                {workers.map((w, i) => {
                    const info = usinInfo(w.type || w.category);
                    const hasWarn = warnSet.has(i);
                    const x = Number(w.x ?? 0) * scale;
                    const y = (H - Number(w.y ?? 0)) * scale;
                    const diam = (w.diameter || 6) * scale;
                    const tipo = (w.type || w.category || '').toLowerCase();

                    if (/hole|furo/.test(tipo)) {
                        return (
                            <g key={i}>
                                <circle cx={x} cy={y} r={diam / 2} fill={`${info.color}25`} stroke={hasWarn ? '#ef4444' : info.color} strokeWidth={hasWarn ? 1.5 : 1} />
                                {hasWarn && <circle cx={x} cy={y} r={diam / 2 + 3} fill="none" stroke="#ef444488" strokeWidth={1} strokeDasharray="3 2" />}
                            </g>
                        );
                    }
                    if (/rasgo|canal|groove|saw/.test(tipo)) {
                        const len = (w.length || 50) * scale;
                        return <rect key={i} x={x - len / 2} y={y - 2} width={len} height={4} fill={info.color} rx={1} opacity={0.85} />;
                    }
                    const pw = (w.pocket_width || w.width || 20) * scale;
                    const ph = (w.pocket_height || w.height || 20) * scale;
                    return <rect key={i} x={x - pw / 2} y={y - ph / 2} width={pw} height={ph} fill={`${info.color}30`} stroke={info.color} strokeWidth={1} rx={1.5} />;
                })}

                <text x={4} y={vh - 4} fontSize={7} fill="#64748b">{W}mm</text>
                <text x={4} y={12} fontSize={7} fill="#64748b">{H}mm</text>
            </svg>
            {/* Legenda inline */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {Object.values(USIN_LABELS).map(info => (
                    <span key={info.label} style={{ fontSize: 9, color: info.color, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span>{info.icon}</span> {info.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

// ── Linha de operação por peça ────────────────────────────────────
function WorkerRow({ w, idx, disabled, onToggle, saving, warn }) {
    const info = usinInfo(w.type || w.category);
    const isHole = isHoleOp(w.type || w.category);
    const faceLabel = FACE_LABELS[w.face] || w.face || '—';
    const tempoSeg = estimarTempoSeg(w);

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '20px 26px 120px 70px 1fr 60px 52px',
            alignItems: 'center', gap: 8,
            padding: '5px 10px', borderRadius: 5,
            background: disabled ? 'var(--bg-muted)' : 'transparent',
            opacity: disabled ? 0.5 : 1,
            borderLeft: warn
                ? `2px solid ${warn.severidade === 'erro' ? '#ef4444' : '#f59e0b'}`
                : '2px solid transparent',
            transition: 'opacity .15s',
        }}>
            {/* Toggle */}
            <input
                type="checkbox"
                checked={!disabled}
                onChange={() => onToggle(!disabled)}
                disabled={saving}
                style={{ cursor: 'pointer', accentColor: info.color, margin: 0 }}
                aria-label={`${disabled ? 'Ativar' : 'Desativar'} op #${idx + 1}`}
            />

            {/* Ícone tipo */}
            <div style={{
                width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                background: info.bg || `${info.color}18`, color: info.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
            }}>
                {info.icon}
            </div>

            {/* Label + face */}
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{info.label}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{faceLabel}</div>
            </div>

            {/* Face badge */}
            <div>
                {w.face && (
                    <Chip color={w.face === 'top' ? '#1e40af' : '#9d174d'} bg={w.face === 'top' ? '#dbeafe' : '#fce7f3'}>
                        {faceLabel}
                    </Chip>
                )}
            </div>

            {/* Dimensões */}
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isHole
                    ? `⌀${w.diameter || 8}mm · Z${w.depth || 0}mm`
                    : `${w.length || w.pocket_width || 0}×${w.width || w.pocket_height || 0}mm · Z${w.depth || 0}mm`
                }
                <span style={{ marginLeft: 6, color: 'var(--text-muted)', opacity: 0.6 }}>
                    x:{Math.round(w.x ?? 0)} y:{Math.round(w.y ?? 0)}
                </span>
            </div>

            {/* Tempo */}
            <div style={{ fontSize: 10, color: '#8b5cf6', textAlign: 'right', whiteSpace: 'nowrap' }}>
                ⏱ {fmtSeg(tempoSeg)}
            </div>

            {/* Status / warn */}
            <div style={{ textAlign: 'right' }}>
                {warn ? (
                    <Chip
                        color={warn.severidade === 'erro' ? '#ef4444' : '#f59e0b'}
                        bg={warn.severidade === 'erro' ? '#fee2e2' : '#fef9c3'}
                        style={{ cursor: 'help' }}
                        title={warn.mensagem}
                    >
                        {warn.severidade === 'erro' ? 'ERR' : 'BORDA'}
                    </Chip>
                ) : disabled ? (
                    <Chip color="#ef4444">OFF</Chip>
                ) : null}
            </div>
        </div>
    );
}

// ── Cabeçalho de colunas do WorkerRow ────────────────────────────
function WorkerHeader() {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '20px 26px 120px 70px 1fr 60px 52px',
            alignItems: 'center', gap: 8,
            padding: '3px 10px',
            fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            borderBottom: '1px solid var(--border)', marginBottom: 4,
        }}>
            <span /> <span /> <span>Tipo</span> <span>Face</span>
            <span>Dimensões</span> <span style={{ textAlign: 'right' }}>Tempo</span> <span />
        </div>
    );
}

// ── Card de peça ─────────────────────────────────────────────────
function PecaCard({ peca, overrides, warnings, faceCNC, onToggleWorker, onToggleAll, saving }) {
    const [expanded, setExpanded] = useState(false);
    const [showFace, setShowFace] = useState(false);

    const workers = parseMach(peca.machining_json);
    if (!workers.length) return null;

    const pid = peca.persistent_id || `peca_${peca.id}`;
    const fInfo = faceCNC?.faces?.find(f => f.peca_id === peca.id);
    const isDisabled = (idx) => overrides.some(o => o.peca_persistent_id === pid && o.worker_index === idx && !o.ativo);

    const totalDisabled = workers.filter((_, i) => isDisabled(i)).length;
    const totalAtivas = workers.length - totalDisabled;
    const totalTime = workers.filter((_, i) => !isDisabled(i)).reduce((s, w) => s + estimarTempoSeg(w), 0);

    const warnMap = {};
    for (const w of warnings) { if (w.pecaId === peca.id) warnMap[w.workerIdx] = w; }
    const hasErrors = warnings.some(w => w.pecaId === peca.id && w.severidade === 'erro');
    const hasAlerts = warnings.some(w => w.pecaId === peca.id);

    const borderColor = hasErrors ? 'rgba(239,68,68,0.45)' : hasAlerts ? 'rgba(245,158,11,0.35)' : 'var(--border)';

    return (
        <div style={{
            border: `1px solid ${borderColor}`,
            borderRadius: 8, overflow: 'hidden',
            background: 'var(--bg-elevated)',
            transition: 'border-color .15s',
        }}>
            {/* Cabeçalho clicável */}
            <div
                onClick={() => setExpanded(e => !e)}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto auto',
                    alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer',
                    background: expanded ? 'var(--bg-muted)' : undefined,
                    transition: 'background .15s',
                }}
            >
                {/* Infos da peça */}
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                        {peca.descricao || peca.upmcode || `Peça #${peca.id}`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        {peca.comprimento}×{peca.largura}×{peca.espessura}mm
                        {peca.modulo_desc ? ` · ${peca.modulo_desc}` : ''}
                    </div>
                </div>

                {/* Face CNC */}
                {fInfo && (
                    <Chip color={fInfo.face_cnc === 'A' ? '#1e40af' : '#9d174d'} bg={fInfo.face_cnc === 'A' ? '#dbeafe' : '#fce7f3'}>
                        CNC Face {fInfo.face_cnc}
                    </Chip>
                )}

                {/* Alertas */}
                {hasErrors && <AlertTriangle size={13} color="var(--danger)" />}
                {!hasErrors && hasAlerts && <AlertTriangle size={13} color="#f59e0b" />}

                {/* Contagem + tempo */}
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: totalDisabled > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
                        {totalAtivas}/{workers.length}
                        <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 3 }}>ops</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#8b5cf6' }}>⏱ {fmtSeg(totalTime)}</div>
                </div>

                <div style={{ color: 'var(--text-muted)' }}>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {/* Corpo expandido */}
            {expanded && (
                <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--border)' }}>
                    {/* Toolbar interna */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                        <button
                            onClick={() => onToggleAll(pid, workers, true)}
                            style={{ fontSize: 9, padding: '3px 8px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 4, cursor: 'pointer', color: '#166534', fontWeight: 600 }}
                        ><Check size={12} style={{display:'inline',marginRight:4}} /> Ativar tudo</button>
                        <button
                            onClick={() => onToggleAll(pid, workers, false)}
                            style={{ fontSize: 9, padding: '3px 8px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', color: '#991b1b', fontWeight: 600 }}
                        ><X size={12} style={{display:'inline',marginRight:4}} /> Desativar tudo</button>
                        <div style={{ flex: 1 }} />
                        <button
                            onClick={() => setShowFace(f => !f)}
                            style={{
                                fontSize: 9, padding: '3px 8px', background: 'var(--bg-muted)',
                                border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)',
                            }}
                        >
                            {showFace ? <EyeOff size={9} /> : <Eye size={9} />}
                            {showFace ? 'Ocultar vista 2D' : 'Vista 2D'}
                        </button>
                    </div>

                    {showFace && (
                        <FaceView peca={peca} workers={workers} warnings={warnings.filter(w => w.pecaId === peca.id)} />
                    )}

                    {/* Tabela de operações */}
                    <WorkerHeader />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {workers.map((w, i) => (
                            <WorkerRow
                                key={i}
                                w={w}
                                idx={i}
                                disabled={isDisabled(i)}
                                onToggle={(active) => onToggleWorker(pid, i, active)}
                                saving={saving}
                                warn={warnMap[i] || null}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Panel de override por grupo de operação ───────────────────────
function OverridePanel({ op, ferramentas, override, onSave, onClose }) {
    const [form, setForm] = useState({
        ferramenta_id: override?.ferramenta_id ?? null,
        diametro_override: override?.diametro_override ?? '',
        profundidade_override: override?.profundidade_override ?? '',
        rpm_override: override?.rpm_override ?? '',
        feed_override: override?.feed_override ?? '',
        notas: override?.notas ?? '',
        ativo: override?.ativo ?? 1,
    });
    const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({
                op_key: op.op_key,
                ferramenta_id: form.ferramenta_id || null,
                diametro_override: form.diametro_override !== '' ? Number(form.diametro_override) : null,
                profundidade_override: form.profundidade_override !== '' ? Number(form.profundidade_override) : null,
                rpm_override: form.rpm_override !== '' ? Number(form.rpm_override) : null,
                feed_override: form.feed_override !== '' ? Number(form.feed_override) : null,
                notas: form.notas,
                ativo: form.ativo,
            });
        } finally { setSaving(false); }
    };

    const selFerr = ferramentas?.find(f => f.id === form.ferramenta_id);

    return (
        <div style={{
            padding: '14px 16px', borderRadius: 8,
            border: '1px solid rgba(99,102,241,0.35)',
            background: 'rgba(99,102,241,0.04)',
        }}>
            {/* Título */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Settings size={13} color="#6366f1" />
                </div>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>Override de operação</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{op.op_key}</div>
                </div>
                <button
                    onClick={onClose}
                    style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', color: 'var(--text-muted)' }}
                >
                    <X size={14} />
                </button>
            </div>

            {/* Ferramenta substituta — linha cheia */}
            <div style={{ marginBottom: 12 }}>
                <label className={Z.lbl}>Ferramenta substituta</label>
                <select
                    value={form.ferramenta_id ?? ''}
                    onChange={e => upd('ferramenta_id', e.target.value ? Number(e.target.value) : null)}
                    className={Z.inp}
                >
                    <option value="">— Usar ferramenta padrão do arquivo —</option>
                    {(ferramentas || []).map(f => (
                        <option key={f.id} value={f.id}>
                            {f.codigo} · {f.nome} · Ø{f.diametro}mm · {f.velocidade_corte}mm/min
                        </option>
                    ))}
                </select>
                {selFerr && (
                    <div style={{ fontSize: 10, marginTop: 4, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={10} />
                        Substituindo por: <b>{selFerr.nome}</b> — Ø{selFerr.diametro}mm, {selFerr.velocidade_corte}mm/min, {selFerr.rpm}rpm
                    </div>
                )}
            </div>

            {/* Grid de parâmetros */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
                <div>
                    <label className={Z.lbl}>Diâmetro override (mm)</label>
                    <input type="number" value={form.diametro_override} onChange={e => upd('diametro_override', e.target.value)}
                        className={Z.inp} placeholder={`Original: ${op.diametro}mm`} step="0.1" />
                </div>
                <div>
                    <label className={Z.lbl}>Profundidade override (mm)</label>
                    <input type="number" value={form.profundidade_override} onChange={e => upd('profundidade_override', e.target.value)}
                        className={Z.inp} placeholder={`Original: ${op.profundidade_media?.toFixed(1)}mm`} step="0.1" />
                </div>
                <div>
                    <label className={Z.lbl}>Feed override (mm/min)</label>
                    <input type="number" value={form.feed_override} onChange={e => upd('feed_override', e.target.value)}
                        className={Z.inp} placeholder="Padrão da ferramenta" step="50" />
                </div>
                <div>
                    <label className={Z.lbl}>RPM override</label>
                    <input type="number" value={form.rpm_override} onChange={e => upd('rpm_override', e.target.value)}
                        className={Z.inp} placeholder="Padrão da ferramenta" step="500" />
                </div>
            </div>

            <div style={{ marginBottom: 12 }}>
                <label className={Z.lbl}>Notas / motivo</label>
                <input value={form.notas} onChange={e => upd('notas', e.target.value)}
                    className={Z.inp} placeholder="Ex: Broca desgastada, usar Ø8.2mm temporariamente..." />
            </div>

            {/* Rodapé */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.ativo === 1} onChange={e => upd('ativo', e.target.checked ? 1 : 0)} style={{ accentColor: '#6366f1' }} />
                    Override ativo
                </label>
                <div style={{ flex: 1 }} />
                <button onClick={onClose} className={Z.btn2} style={{ fontSize: 11, padding: '5px 12px' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} className={Z.btn} style={{ fontSize: 11, padding: '5px 14px', fontWeight: 600 }}>
                    {saving ? 'Salvando...' : 'Aplicar override'}
                </button>
            </div>
        </div>
    );
}

// ── Visão Por Operação ────────────────────────────────────────────
function OperacoesView({ loteId, notify }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expandedOp, setExpandedOp] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try { setData(await api.get(`/cnc/lotes/${loteId}/operacoes-scan`)); }
        catch (err) { notify('Erro ao carregar operações: ' + (err.message || ''), 'error'); }
        finally { setLoading(false); }
    }, [loteId, notify]);

    useEffect(() => { load(); }, [load]);

    const saveOverride = useCallback(async (body) => {
        await api.post(`/cnc/lotes/${loteId}/operacoes-override`, body);
        notify('Override salvo');
        setExpandedOp(null);
        load();
    }, [loteId, notify, load]);

    if (loading) return <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner size={22} /></div>;
    if (!data) return null;

    const { operacoes = [], overrides = {}, ferramentas_compativeis = {}, maquina } = data;

    if (!operacoes.length) {
        return <EmptyState icon={Wrench} title="Nenhuma operação encontrada" description="O lote não tem usinagens ou o plano de corte não foi gerado." />;
    }

    // Agrupar por categoria
    const grouped = operacoes.reduce((acc, op) => {
        const g = op.categoria || 'generic';
        (acc[g] = acc[g] || []).push(op);
        return acc;
    }, {});

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {maquina && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                    <Wrench size={11} /> Máquina: <b style={{ color: 'var(--text-primary)' }}>{maquina.nome}</b>
                </div>
            )}

            {Object.entries(grouped).map(([cat, ops]) => {
                const catInfo = CAT_INFO[cat] || CAT_INFO.generic;
                return (
                    <div key={cat}>
                        {/* Cabeçalho da categoria */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: catInfo.color }} />
                            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                {catInfo.label} ({ops.length})
                            </span>
                            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {ops.map(op => {
                                const ov = overrides[op.op_key];
                                const hasOverride = !!ov;
                                const isOpen = expandedOp === op.op_key;
                                const ferrsCompat = ferramentas_compativeis[op.op_key] || [];
                                const overrideActive = hasOverride && ov.ativo;

                                return (
                                    <div key={op.op_key} style={{
                                        border: `1px solid ${overrideActive ? 'rgba(99,102,241,0.4)' : isOpen ? 'rgba(99,102,241,0.25)' : 'var(--border)'}`,
                                        borderRadius: 8, overflow: 'hidden',
                                        background: overrideActive ? 'rgba(99,102,241,0.03)' : 'var(--bg-elevated)',
                                        transition: 'border-color .15s',
                                    }}>
                                        {/* Row da operação */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '32px 1fr auto',
                                            alignItems: 'center', gap: 10,
                                            padding: '10px 14px',
                                        }}>
                                            {/* Ícone */}
                                            <div style={{
                                                width: 32, height: 32, borderRadius: 7,
                                                background: catInfo.bg, color: catInfo.color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 14, fontWeight: 700, flexShrink: 0,
                                            }}>
                                                {catInfo.icon}
                                            </div>

                                            {/* Info */}
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                                                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                                                        {catInfo.label} — Ø{op.diametro}mm
                                                    </span>
                                                    {op.tool_code && (
                                                        <code style={{ fontSize: 9, color: 'var(--primary)', background: 'rgba(var(--primary-rgb),0.1)', padding: '1px 5px', borderRadius: 3 }}>{op.tool_code}</code>
                                                    )}
                                                    {overrideActive && (
                                                        <Chip color="#6366f1" bg="#eef2ff">OVERRIDE ATIVO</Chip>
                                                    )}
                                                    {hasOverride && !ov.ativo && (
                                                        <Chip color="#9ca3af" bg="var(--bg-muted)">override desativado</Chip>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    <span>{op.count} peça(s)</span>
                                                    <span>prof. média {op.profundidade_media?.toFixed(1)}mm</span>
                                                    {overrideActive && ov.ferramenta_nome && (
                                                        <span style={{ color: '#6366f1' }}>→ {ov.ferramenta_nome}</span>
                                                    )}
                                                    {overrideActive && ov.feed_override && (
                                                        <span style={{ color: '#6366f1' }}>{ov.feed_override}mm/min</span>
                                                    )}
                                                    {overrideActive && ov.diametro_override && (
                                                        <span style={{ color: '#6366f1' }}>Ø{ov.diametro_override}mm</span>
                                                    )}
                                                    {overrideActive && ov.notas && (
                                                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>"{ov.notas}"</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Botão configurar */}
                                            <button
                                                onClick={() => setExpandedOp(isOpen ? null : op.op_key)}
                                                style={{
                                                    fontSize: 10, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                                                    border: `1px solid ${isOpen ? '#6366f1' : 'var(--border)'}`,
                                                    background: isOpen ? '#6366f1' : 'var(--bg-muted)',
                                                    color: isOpen ? '#fff' : 'var(--text-muted)',
                                                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                                                    transition: 'all .15s',
                                                }}
                                            >
                                                <Settings size={11} />
                                                {hasOverride ? 'Editar' : 'Configurar'}
                                            </button>
                                        </div>

                                        {/* Painel inline */}
                                        {isOpen && (
                                            <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                                                <div style={{ height: 10 }} />
                                                <OverridePanel
                                                    op={op}
                                                    ferramentas={ferrsCompat}
                                                    override={ov}
                                                    onSave={saveOverride}
                                                    onClose={() => setExpandedOp(null)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── KPI chip ──────────────────────────────────────────────────────
function KPI({ label, value, sub, color = 'var(--text-primary)' }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 16px', minWidth: 80 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            {sub && <div style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>{sub}</div>}
        </div>
    );
}

// ── Main export ───────────────────────────────────────────────────
export function TabUsinagens({ loteAtual, notify }) {
    const [pecas, setPecas] = useState([]);
    const [overrides, setOverrides] = useState([]);
    const [faceCNC, setFaceCNC] = useState(null);
    const [warnings, setWarnings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showOnlyProblems, setShowOnlyProblems] = useState(false);
    const [viewMode, setViewMode] = useState('pecas');

    const loadIdRef = useRef(0); // race condition guard

    const load = useCallback(async () => {
        if (!loteAtual?.id) return;
        const loadId = ++loadIdRef.current;
        setLoading(true);
        try {
            const [p, o, bv] = await Promise.all([
                api.get(`/cnc/pecas/${loteAtual.id}`),
                api.get(`/cnc/lotes/${loteAtual.id}/overrides`),
                api.get(`/cnc/validar-bordas/${loteAtual.id}`).catch(() => ({ warnings: [] })),
            ]);
            // Descarta resultado se outro load foi iniciado (troca de lote durante fetch)
            if (loadId !== loadIdRef.current) return;
            setPecas(p);
            setOverrides(o);
            setWarnings(bv.warnings || []);
            api.get(`/cnc/lotes/${loteAtual.id}/face-cnc`).then(r => {
                if (loadId === loadIdRef.current) setFaceCNC(r);
            }).catch(() => {});
        } catch {
            if (loadId === loadIdRef.current) notify?.('Erro ao carregar usinagens', 'error');
        }
        if (loadId === loadIdRef.current) setLoading(false);
    }, [loteAtual?.id, notify]);

    useEffect(() => { load(); }, [load]);

    const toggleWorker = useCallback(async (pid, idx, currentlyActive) => {
        setSaving(true);
        try {
            await api.post(`/cnc/lotes/${loteAtual.id}/overrides`, {
                peca_persistent_id: pid,
                worker_index: idx,
                ativo: currentlyActive ? 0 : 1,
                motivo: currentlyActive ? 'Desativado manualmente' : '',
            });
            await load();
        } catch { notify?.('Erro ao alterar override', 'error'); }
        setSaving(false);
    }, [loteAtual?.id, load, notify]);

    const toggleAll = useCallback(async (pid, workers, ativo) => {
        setSaving(true);
        try {
            const bulk = workers.map((_, i) => ({
                peca_persistent_id: pid,
                worker_index: i,
                ativo: ativo ? 1 : 0,
                motivo: ativo ? '' : 'Desativado em lote',
            }));
            await api.post(`/cnc/lotes/${loteAtual.id}/overrides/bulk`, { overrides: bulk });
            await load();
        } catch { notify?.('Erro ao aplicar override em lote', 'error'); }
        setSaving(false);
    }, [loteAtual?.id, load, notify]);

    if (!loteAtual) return <EmptyState icon={Wrench} title="Nenhum lote selecionado" description="Selecione um lote para gerenciar usinagens." />;
    if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>;

    const pecasComUsin = pecas.filter(p => parseMach(p.machining_json).length > 0);
    const pecasVisiveis = showOnlyProblems
        ? pecasComUsin.filter(p => warnings.some(w => w.pecaId === p.id))
        : pecasComUsin;

    let totalOps = 0, totalAtivas = 0, totalTempoSeg = 0;
    pecas.forEach(p => {
        const ws = parseMach(p.machining_json);
        const workers = Array.isArray(ws) ? ws : [];
        const pid = p.persistent_id || `peca_${p.id}`;
        totalOps += workers.length;
        workers.forEach((w, i) => {
            const isOff = overrides.some(o => o.peca_persistent_id === pid && o.worker_index === i && !o.ativo);
            if (!isOff) { totalAtivas++; totalTempoSeg += estimarTempoSeg(w); }
        });
    });

    const errCount = warnings.filter(w => w.severidade === 'erro').length;
    const alertCount = warnings.filter(w => w.severidade !== 'erro').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Painel de resumo + controles */}
            <div style={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                {/* Header principal */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-muted)',
                }}>
                    <Wrench size={14} color="#f59e0b" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Usinagens CNC</span>

                    {/* View toggle */}
                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        {[
                            { key: 'pecas',     label: 'Por Peça',     accent: '#f59e0b' },
                            { key: 'operacoes', label: 'Por Operação', accent: '#6366f1', icon: <Zap size={10} /> },
                        ].map(({ key, label, accent, icon }) => (
                            <button
                                key={key}
                                onClick={() => setViewMode(key)}
                                style={{
                                    fontSize: 10, padding: '5px 12px', border: 'none', cursor: 'pointer', fontWeight: 600,
                                    background: viewMode === key ? accent : 'var(--bg-muted)',
                                    color: viewMode === key ? '#fff' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    transition: 'all .15s',
                                }}
                            >
                                {icon}{label}
                            </button>
                        ))}
                    </div>

                    {viewMode === 'pecas' && warnings.length > 0 && (
                        <button
                            onClick={() => setShowOnlyProblems(s => !s)}
                            style={{
                                fontSize: 10, padding: '5px 10px', borderRadius: 6,
                                border: `1px solid ${showOnlyProblems ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                                background: showOnlyProblems ? 'rgba(239,68,68,0.1)' : 'var(--bg-muted)',
                                color: showOnlyProblems ? 'var(--danger)' : 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                            }}
                        >
                            <ShieldAlert size={10} />
                            {showOnlyProblems ? 'Mostrar tudo' : `Problemas (${warnings.length})`}
                        </button>
                    )}

                    <button onClick={load} style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                        <RefreshCw size={11} /> Atualizar
                    </button>
                </div>

                {/* KPIs */}
                <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border)' }}>
                    <KPI label="operações" value={totalAtivas} sub={`de ${totalOps}`} color={totalAtivas < totalOps ? '#f59e0b' : 'var(--text-primary)'} />
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <KPI label="tempo est." value={fmtSeg(totalTempoSeg)} color="#8b5cf6" />
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <KPI label="peças c/ usin." value={pecasComUsin.length} />

                    {/* Barra de progresso */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
                        <div style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                                <span>{totalAtivas}/{totalOps} ativas</span>
                                <span>{totalOps > 0 ? Math.round(totalAtivas / totalOps * 100) : 0}%</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                <div style={{
                                    width: totalOps > 0 ? `${totalAtivas / totalOps * 100}%` : '0%',
                                    height: '100%', borderRadius: 3,
                                    background: totalAtivas < totalOps ? '#f59e0b' : '#22c55e',
                                    transition: 'width .4s',
                                }} />
                            </div>
                        </div>
                    </div>

                    {/* Alertas / status */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '8px 16px', borderLeft: '1px solid var(--border)' }}>
                        {errCount > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>
                                <AlertTriangle size={12} /> {errCount} erro(s)
                            </div>
                        ) : null}
                        {alertCount > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>
                                <AlertTriangle size={12} /> {alertCount} alerta(s)
                            </div>
                        ) : null}
                        {!errCount && !alertCount && totalOps > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
                                <CheckCircle2 size={12} /> OK
                            </div>
                        )}
                    </div>
                </div>

                {/* Face CNC summary (se aplicável) */}
                {faceCNC?.faces?.length > 0 && (
                    <div style={{ padding: '8px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Face CNC:</span>
                        {faceCNC.faces.map(f => (
                            <Chip key={f.peca_id} color={f.face_cnc === 'A' ? '#1e40af' : '#9d174d'} bg={f.face_cnc === 'A' ? '#dbeafe' : '#fce7f3'}>
                                Face {f.face_cnc} · {f.descricao || `Peça ${f.peca_id}`}
                            </Chip>
                        ))}
                    </div>
                )}
            </div>

            {/* Conteúdo: Por Peça ou Por Operação */}
            {viewMode === 'operacoes' ? (
                <OperacoesView loteId={loteAtual.id} notify={notify} />
            ) : pecasVisiveis.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pecasVisiveis.map(p => (
                        <PecaCard
                            key={p.id}
                            peca={p}
                            overrides={overrides}
                            warnings={warnings.filter(w => w.pecaId === p.id)}
                            faceCNC={faceCNC}
                            onToggleWorker={toggleWorker}
                            onToggleAll={toggleAll}
                            saving={saving}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={Wrench}
                    title={showOnlyProblems ? 'Nenhum problema encontrado' : 'Nenhuma peça com usinagem'}
                    description={showOnlyProblems ? 'Todas as usinagens passaram na validação.' : 'As peças deste lote não possuem operações de usinagem definidas.'}
                />
            )}
        </div>
    );
}
