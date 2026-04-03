import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * SlidePanel — slide-in panel from right side.
 * Props: isOpen, onClose, title, children, width (default 480)
 */
export default function SlidePanel({ isOpen, onClose, title, children, width = 480 }) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
            window.addEventListener('keydown', handleEsc);
            return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleEsc); };
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', justifyContent: 'flex-end',
        }}>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.35)',
                animation: 'fadeIn .2s ease',
            }} />
            {/* Panel */}
            <div style={{
                position: 'relative', width: '95vw', maxWidth: width,
                height: '100vh', display: 'flex', flexDirection: 'column',
                background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
                boxShadow: '-8px 0 30px rgba(0,0,0,0.2)',
                animation: 'slideInRight .25s ease',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', borderBottom: '1px solid var(--border)',
                    background: 'linear-gradient(180deg, var(--bg-muted) 0%, transparent 100%)',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
                    <button onClick={onClose} style={{
                        padding: 6, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: 'transparent', color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center',
                        transition: 'background .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <X size={16} />
                    </button>
                </div>
                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {children}
                </div>
            </div>
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>,
        document.body
    );
}
