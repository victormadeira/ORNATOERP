import { ChevronRight } from 'lucide-react';

/**
 * Breadcrumb contextual para navegação na industrialização
 *
 * Uso:
 *   <Breadcrumb items={[
 *     { label: 'Projetos', onClick: () => nav('proj') },
 *     { label: 'Cozinha Maria Silva' },
 *     { label: 'Versão 2' },
 *   ]} />
 */
export default function Breadcrumb({ items = [] }) {
    if (items.length === 0) return null;

    return (
        <nav style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--text-muted)',
            marginBottom: 16, flexWrap: 'wrap'
        }}>
            {items.map((item, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
                    {item.onClick ? (
                        <button
                            onClick={item.onClick}
                            style={{
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                color: 'var(--primary)', fontWeight: 500, fontSize: 13,
                                textDecoration: 'none'
                            }}
                            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                            onMouseLeave={e => e.target.style.textDecoration = 'none'}
                        >
                            {item.label}
                        </button>
                    ) : (
                        <span style={{
                            fontWeight: i === items.length - 1 ? 600 : 400,
                            color: i === items.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)'
                        }}>
                            {item.label}
                        </span>
                    )}
                </span>
            ))}
        </nav>
    );
}
