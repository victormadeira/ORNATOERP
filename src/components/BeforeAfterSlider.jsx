import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Slider interativo de antes/depois.
 * Drag com mouse e toque. Sem dependências externas.
 *
 * Props:
 *   imagemAntes  — URL da foto "antes"
 *   imagemDepois — URL da foto "depois"
 *   altAntes     — alt text (opcional)
 *   altDepois    — alt text (opcional)
 *   initialPos   — posição inicial do divisor 0-100 (default 50)
 */
export function BeforeAfterSlider({
    imagemAntes,
    imagemDepois,
    altAntes = 'Antes',
    altDepois = 'Depois',
    initialPos = 50,
}) {
    const [pos, setPos] = useState(initialPos);   // 0 – 100
    const [dragging, setDragging] = useState(false);
    const containerRef = useRef(null);

    const clamp = v => Math.max(2, Math.min(98, v));

    const posFromEvent = useCallback((e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return pos;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        return clamp(((clientX - rect.left) / rect.width) * 100);
    }, [pos]);

    const onPointerDown = useCallback((e) => {
        e.preventDefault();
        setDragging(true);
        setPos(posFromEvent(e));
    }, [posFromEvent]);

    useEffect(() => {
        if (!dragging) return;
        const move = (e) => setPos(posFromEvent(e));
        const up   = () => setDragging(false);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup',   up);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend',  up);
        return () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup',   up);
            window.removeEventListener('touchmove', move);
            window.removeEventListener('touchend',  up);
        };
    }, [dragging, posFromEvent]);

    return (
        <div
            ref={containerRef}
            onMouseDown={onPointerDown}
            onTouchStart={onPointerDown}
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16/9',
                overflow: 'hidden',
                borderRadius: '1rem',
                cursor: dragging ? 'grabbing' : 'col-resize',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none',
            }}
        >
            {/* ── Foto DEPOIS (base, full width) ── */}
            <img
                src={imagemDepois}
                alt={altDepois}
                draggable="false"
                style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                }}
            />

            {/* ── Foto ANTES (cortada pela direita) ── */}
            <div
                style={{
                    position: 'absolute', inset: 0,
                    clipPath: `polygon(0 0, ${pos}% 0, ${pos}% 100%, 0 100%)`,
                    willChange: 'clip-path',
                }}
            >
                <img
                    src={imagemAntes}
                    alt={altAntes}
                    draggable="false"
                    style={{
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                    }}
                />
            </div>

            {/* ── Linha divisória ── */}
            <div
                style={{
                    position: 'absolute',
                    top: 0, bottom: 0,
                    left: `${pos}%`,
                    transform: 'translateX(-50%)',
                    width: 2,
                    background: 'rgba(255,255,255,0.9)',
                    boxShadow: '0 0 8px rgba(0,0,0,0.4)',
                    pointerEvents: 'none',
                    willChange: 'left',
                }}
            />

            {/* ── Handle (círculo) ── */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${pos}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 44, height: 44,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 3,
                    pointerEvents: 'none',
                    willChange: 'left',
                }}
            >
                {/* Setas ‹ › */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </div>

            {/* ── Labels ANTES / DEPOIS ── */}
            <span style={{
                position: 'absolute', top: 14, left: 16,
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
                color: '#fff', textTransform: 'uppercase',
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                padding: '3px 8px', borderRadius: 4,
                opacity: pos < 15 ? 0 : 1,
                transition: 'opacity 0.2s',
                pointerEvents: 'none',
            }}>Antes</span>

            <span style={{
                position: 'absolute', top: 14, right: 16,
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
                color: '#fff', textTransform: 'uppercase',
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                padding: '3px 8px', borderRadius: 4,
                opacity: pos > 85 ? 0 : 1,
                transition: 'opacity 0.2s',
                pointerEvents: 'none',
            }}>Depois</span>
        </div>
    );
}
