import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Z } from '../ui';

/**
 * ToolbarDropdown — groups multiple toolbar actions under one button.
 * Props:
 *   label: string
 *   icon: LucideIcon component
 *   items: [{ id, label, icon, onClick, disabled, danger, hidden, divider }]
 *   disabled: boolean
 */
export default function ToolbarDropdown({ label, icon: Icon, items, disabled }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const visibleItems = (items || []).filter(it => !it.hidden);
    if (visibleItems.length === 0) return null;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                onClick={() => setOpen(!open)}
                disabled={disabled}
                className={Z.btn2}
                style={{
                    padding: '8px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                    fontWeight: 600, opacity: disabled ? 0.5 : 1,
                }}>
                {Icon && <Icon size={14} />}
                {label}
                <ChevronDown size={11} style={{ marginLeft: 2, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: 'var(--shadow-lg)', minWidth: 180, padding: '4px 0',
                    animation: 'dropdownFadeIn .12s ease',
                }}>
                    {visibleItems.map((it, i) => {
                        if (it.divider) return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
                        const ItIc = it.icon;
                        return (
                            <div key={it.id || i}
                                onClick={() => { if (!it.disabled) { it.onClick?.(); setOpen(false); } }}
                                style={{
                                    padding: '8px 14px', cursor: it.disabled ? 'default' : 'pointer',
                                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                                    color: it.danger ? 'var(--danger)' : it.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                                    opacity: it.disabled ? 0.5 : 1,
                                    transition: 'background .1s',
                                }}
                                onMouseEnter={e => { if (!it.disabled) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                {ItIc && <ItIc size={13} style={{ color: it.danger ? 'var(--danger)' : 'var(--text-muted)' }} />}
                                {it.label}
                            </div>
                        );
                    })}
                </div>
            )}
            <style>{`
                @keyframes dropdownFadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
