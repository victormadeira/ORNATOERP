import { useState, useEffect, useRef } from 'react';

/**
 * Animated count-up hook — Linear-style KPI animation.
 * Smoothly counts from previous value to `target` using easeOutCubic.
 *
 * @param {number}  target   - Destination number
 * @param {object}  options
 * @param {number}  options.duration  - Animation duration in ms (default 900)
 * @param {boolean} options.enabled   - Set false to skip animation (reduced-motion)
 */
export function useCountUp(target, { duration = 900, enabled = true } = {}) {
    const [count, setCount] = useState(0);
    const frameRef  = useRef(null);
    const startRef  = useRef(null);
    const fromRef   = useRef(0);

    useEffect(() => {
        if (!enabled || typeof target !== 'number' || !isFinite(target)) {
            setCount(target || 0);
            return;
        }

        // Cancel any running animation
        if (frameRef.current) cancelAnimationFrame(frameRef.current);

        const from = fromRef.current;
        const to   = target;
        fromRef.current = to;

        if (from === to) { setCount(to); return; }

        startRef.current = null;

        const step = (ts) => {
            if (!startRef.current) startRef.current = ts;
            const elapsed  = ts - startRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const eased    = 1 - (1 - progress) ** 3; // easeOutCubic
            const current  = from + (to - from) * eased;

            // For large numbers: whole integer; for decimals keep 1 decimal
            setCount(Math.abs(to) < 10 && !Number.isInteger(to)
                ? Math.round(current * 10) / 10
                : Math.round(current)
            );

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(step);
            } else {
                setCount(to);
            }
        };

        frameRef.current = requestAnimationFrame(step);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [target, duration, enabled]);

    return count;
}
