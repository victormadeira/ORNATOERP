// CncSim/index.jsx — Unified G-code simulator component  v2 (Sprint 0)
// Replaces GcodeSimWrapper (2D) and GcodeSimCanvas (3D) with a single clean API.
// Usage: <CncSim gcode={str} chapa={obj} />
// Ref API: reset(), seekTo(idx), seekToTime(t), getTotalMoves(), getTotalTime(), getCurMove()
//
// Sprint 0: 2D now has real playback (RAF loop inside Sim2D driven by playing/speed props).
// 3D still drives time via onMoveChange; 2D drives its own time and reports back.

import {
    useState, useMemo, useRef, useCallback, useEffect, forwardRef, useImperativeHandle,
} from 'react';
import { parseGcode } from './parseGcode.js';
import Sim2D from './Sim2D.jsx';
import { Sim3D } from './Sim3D.jsx';

function fmtTime(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

// ─── Playback controls bar ────────────────────────────────────────────────────
function SimControls({
    tab, setTab, playing, onPlayPause, onReset, onStepBack, onStepFwd,
    speed, onSpeed, curTime, totalTime, curMove, totalMoves,
    onScrub, showCockpit,
}) {
    const scrubPct = totalTime > 0 ? (curTime / totalTime) * 100 : 0;
    const btn = (style, extra) => ({
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: '#161b22', color: '#c9d1d9',
        border: '1px solid #30363d', borderRadius: 5,
        cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
        padding: '4px 10px', lineHeight: 1.4, whiteSpace: 'nowrap',
        transition: 'background 0.1s',
        ...style, ...extra,
    });

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            padding: '7px 12px', background: '#0d1219',
            borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        }}>
            {/* Tab buttons */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', flexShrink: 0 }}>
                {[['2D', '2d'], ['3D', '3d']].map(([lb, id]) => (
                    <button key={id} onClick={() => setTab(id)} style={{
                        ...btn(), borderRadius: 0, border: 'none',
                        background: tab === id ? 'rgba(77,140,246,0.25)' : 'transparent',
                        color: tab === id ? '#79c0ff' : '#7890a8',
                        fontWeight: tab === id ? 700 : 500,
                        padding: '4px 12px',
                    }}>{lb}</button>
                ))}
            </div>

            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.10)', flexShrink: 0 }} />

            {/* Play controls */}
            <button onClick={onReset} style={btn({ width: 30, height: 30, padding: 0 })} title="Reiniciar">⏮</button>
            <button onClick={onStepBack} style={btn({ width: 30, height: 30, padding: 0 })} title="Passo anterior">‹</button>
            <button
                onClick={onPlayPause}
                style={btn({ width: 34, height: 34, padding: 0, borderRadius: '50%', border: 'none',
                    background: playing ? '#b91c1c' : '#15803d', fontSize: 14 })}
            >{playing ? '⏸' : '▶'}</button>
            <button onClick={onStepFwd} style={btn({ width: 30, height: 30, padding: 0 })} title="Próximo passo">›</button>

            {/* Scrubber */}
            <div style={{ flex: 1, minWidth: 80, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                    type="range" min={0} max={100} step={0.05}
                    value={scrubPct}
                    onChange={e => onScrub(parseFloat(e.target.value) / 100)}
                    style={{ flex: 1, accentColor: '#4d8cf6', height: 4 }}
                />
            </div>

            {/* Speed */}
            <select
                value={speed}
                onChange={e => onSpeed(parseFloat(e.target.value))}
                style={{ ...btn(), padding: '4px 6px', fontSize: 11 }}
            >
                {[0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 200].map(v => (
                    <option key={v} value={v}>{v}×</option>
                ))}
            </select>

            {/* Time display */}
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#546270', whiteSpace: 'nowrap', minWidth: 100, textAlign: 'right' }}>
                <span style={{ color: '#c9d1d9' }}>{fmtTime(curTime)}</span>
                {' / '}{fmtTime(totalTime)}
            </span>

            {/* Move count */}
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#546270', whiteSpace: 'nowrap' }}>
                #{curMove >= 0 ? curMove + 1 : 0}/{totalMoves}
            </span>

            {/* Cockpit shortcut */}
            {showCockpit && (
                <>
                    <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.10)', flexShrink: 0 }} />
                    <button onClick={showCockpit} style={btn({ background: 'rgba(77,140,246,0.18)', color: '#79c0ff', border: '1px solid rgba(77,140,246,0.40)', fontWeight: 700, fontSize: 11 })}>
                        ⚙ Cockpit
                    </button>
                </>
            )}
        </div>
    );
}

// ─── CncSim ───────────────────────────────────────────────────────────────────
export const CncSim = forwardRef(function CncSim(
    { gcode, chapa, initialTab = '2d', height = 480, onSimulate },
    ref
) {
    const [tab,     setTab]     = useState(initialTab);
    const [playing, setPlaying] = useState(false);
    const [speed,   setSpeed]   = useState(10);
    const [curTime, setCurTime] = useState(0);
    const [curMove, setCurMove] = useState(-1);

    const sim3dRef = useRef(null);

    const parsed     = useMemo(() => parseGcode(gcode || ''), [gcode]);
    const totalTime  = parsed.totalTime  ?? 0;
    const totalMoves = parsed.moves.length;
    const moves      = parsed.moves;

    // ── Derive curMove from curTime via binary search ─────────────────────────
    const moveAtTime = useCallback((t) => {
        if (!moves.length) return -1;
        let lo = 0, hi = moves.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const m = moves[mid];
            if (t < m.tStart) hi = mid - 1;
            else if (t > m.tEnd) lo = mid + 1;
            else return mid;
        }
        if (t >= totalTime && totalTime > 0) return moves.length - 1;
        return -1;
    }, [moves, totalTime]);

    // ── 2D reports time back here ─────────────────────────────────────────────
    const handle2DTimeChange = useCallback((t) => {
        setCurTime(t);
        setCurMove(moveAtTime(t));
    }, [moveAtTime]);

    // ── 3D drives time via onMoveChange ───────────────────────────────────────
    const onMoveChange = useCallback((idx, _lineIdx, t) => {
        setCurMove(idx);
        setCurTime(t);
    }, []);

    const onPlayEnd = useCallback(() => {
        setPlaying(false);
        setCurTime(totalTime);
    }, [totalTime]);

    // ── Playback controls ─────────────────────────────────────────────────────
    const handlePlayPause = useCallback(() => {
        setPlaying(p => {
            if (!p && curTime >= totalTime && totalTime > 0) {
                // Restart from zero
                if (tab === '3d') sim3dRef.current?.reset?.();
                setCurTime(0); setCurMove(-1);
                return true;
            }
            return !p;
        });
    }, [curTime, totalTime, tab]);

    const handleReset = useCallback(() => {
        setPlaying(false);
        if (tab === '3d') sim3dRef.current?.reset?.();
        setCurTime(0); setCurMove(-1);
    }, [tab]);

    const handleStepBack = useCallback(() => {
        setPlaying(false);
        if (tab === '3d') {
            const target = Math.max(0, curMove - 1);
            sim3dRef.current?.seekTo?.(target);
        } else {
            // Step back one move: find the move before curTime
            const idx = moveAtTime(curTime);
            const target = Math.max(0, idx - 1);
            const targetTime = moves[target]?.tStart ?? 0;
            setCurTime(targetTime);
            setCurMove(target);
        }
    }, [curMove, curTime, tab, moveAtTime, moves]);

    const handleStepFwd = useCallback(() => {
        setPlaying(false);
        if (tab === '3d') {
            const target = Math.min(totalMoves - 1, curMove + 1);
            sim3dRef.current?.seekTo?.(target);
        } else {
            const idx = moveAtTime(curTime);
            const target = Math.min(totalMoves - 1, idx + 1);
            const targetTime = moves[target]?.tStart ?? 0;
            setCurTime(targetTime);
            setCurMove(target);
        }
    }, [curMove, curTime, tab, totalMoves, moveAtTime, moves]);

    const handleScrub = useCallback((pct) => {
        setPlaying(false);
        const t = pct * totalTime;
        if (tab === '3d') {
            sim3dRef.current?.seekToTime?.(t);
        } else {
            setCurTime(t);
            setCurMove(moveAtTime(t));
        }
    }, [totalTime, tab, moveAtTime]);

    // ── Imperative API ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset: handleReset,
        seekTo: (idx) => {
            setPlaying(false);
            if (tab === '3d') sim3dRef.current?.seekTo?.(idx);
            else {
                const t = moves[idx]?.tStart ?? 0;
                setCurTime(t); setCurMove(idx);
            }
        },
        seekToTime: (t) => {
            setPlaying(false);
            if (tab === '3d') sim3dRef.current?.seekToTime?.(t);
            else { setCurTime(t); setCurMove(moveAtTime(t)); }
        },
        getTotalMoves:  () => totalMoves,
        getTotalTime:   () => totalTime,
        getCurMove:     () => curMove,
        getCurrentTime: () => curTime,
    }), [handleReset, totalMoves, totalTime, curMove, curTime, tab, moves, moveAtTime]);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
            switch (e.key) {
                case ' ': e.preventDefault(); handlePlayPause(); break;
                case 'ArrowRight': e.preventDefault(); handleStepFwd(); break;
                case 'ArrowLeft':  e.preventDefault(); handleStepBack(); break;
                case 'r': case 'R': if (!e.ctrlKey) handleReset(); break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handlePlayPause, handleStepFwd, handleStepBack, handleReset]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height, background: '#0c1018', borderRadius: 0 }}>
            {/* Simulator content */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {/* 2D — always mounted, hidden when inactive (preserves canvas state) */}
                <div style={{ display: tab === '2d' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
                    <Sim2D
                        parsed={parsed}
                        chapa={chapa}
                        playing={tab === '2d' ? playing : false}
                        speed={speed}
                        curTime={curTime}
                        totalTime={totalTime}
                        onTimeChange={handle2DTimeChange}
                    />
                </div>

                {/* 3D — always mounted, hidden when inactive (preserves Three.js context) */}
                <div style={{ display: tab === '3d' ? 'block' : 'none', height: '100%' }}>
                    <Sim3D
                        ref={sim3dRef}
                        parsed={parsed}
                        chapa={chapa}
                        playing={tab === '3d' ? playing : false}
                        speed={speed}
                        onPlayEnd={onPlayEnd}
                        onMoveChange={onMoveChange}
                    />
                </div>
            </div>

            {/* Controls */}
            <SimControls
                tab={tab} setTab={setTab}
                playing={playing}
                onPlayPause={handlePlayPause}
                onReset={handleReset}
                onStepBack={handleStepBack}
                onStepFwd={handleStepFwd}
                speed={speed} onSpeed={setSpeed}
                curTime={curTime} totalTime={totalTime}
                curMove={curMove} totalMoves={totalMoves}
                onScrub={handleScrub}
                showCockpit={onSimulate ? () => onSimulate(gcode, chapa) : null}
            />
        </div>
    );
});

export default CncSim;
