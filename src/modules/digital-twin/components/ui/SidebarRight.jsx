// @ts-check
import React, { useMemo } from 'react';
import { useCNCStore } from '../../store/useCNCStore.js';
import { StatusChip } from './StatusChip.jsx';
import { parseGCode } from '../gcode/gcodeParser.js';

const OP_ICONS = {
  furo_cego: '●',
  furo_passante: '◎',
  rasgo: '▬',
  rebaixo: '▢',
  freza_circular: '◯',
  chanfro: '◢',
};
const OP_LABELS = {
  furo_cego: 'Furo cego',
  furo_passante: 'Furo passante',
  rasgo: 'Rasgo',
  rebaixo: 'Rebaixo',
  freza_circular: 'Freza circular',
  chanfro: 'Chanfro',
};

/**
 * Sidebar direita — detalhes da peça ativa, lista de operações, stats.
 */
export function SidebarRight() {
  const piece = useCNCStore((s) => s.activePiece);
  const gcodeText = useCNCStore((s) => s.gcodeText);
  const hoveredOpId = useCNCStore((s) => s.hoveredOpId);
  const setHoveredOp = useCNCStore((s) => s.setHoveredOp);

  const gcodeStats = useMemo(() => {
    if (!gcodeText) return null;
    const parsed = parseGCode(gcodeText);
    let lenG0 = 0;
    let lenG1 = 0;
    for (const s of parsed.segments) {
      const dx = s.to[0] - s.from[0];
      const dy = s.to[1] - s.from[1];
      const dz = s.to[2] - s.from[2];
      const d = Math.hypot(dx, dy, dz);
      if (s.type === 'G0') lenG0 += d;
      else lenG1 += d;
    }
    return { segments: parsed.segments.length, lenG0, lenG1 };
  }, [gcodeText]);

  if (!piece) {
    return (
      <aside className="dt-sidebar dt-sidebar-right">
        <div className="dt-empty">
          <div className="dt-empty-icon" aria-hidden="true">◩</div>
          <div className="dt-empty-title">Nenhuma peça ativa</div>
          <div className="dt-empty-sub">Selecione uma peça à esquerda ou escaneie um QR Code.</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="dt-sidebar dt-sidebar-right" aria-label="Detalhes da peça">
      <div className="dt-scroll">
        {/* Detalhes */}
        <div className="dt-section">
          <div className="dt-section-title">Peça</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="dt-piece-id" style={{ fontSize: 13 }}>{piece.id}</div>
            <div className="dt-piece-name">{piece.name}</div>
            <div className="dt-piece-meta">
              {piece.width} × {piece.height} × {piece.thickness} mm
            </div>
            <div className="dt-piece-meta">{piece.material}</div>
            <div style={{ marginTop: 6 }}>
              <StatusChip status={piece.status} />
            </div>
          </div>
        </div>

        {/* Operações */}
        <div className="dt-section">
          <div className="dt-section-title">
            Operações
            <span className="dt-section-count">{piece.operations.length}</span>
          </div>
          <div>
            {piece.operations.length === 0 && (
              <div className="dt-piece-meta" style={{ padding: '4px 2px' }}>
                Nenhuma operação nesta peça.
              </div>
            )}
            {piece.operations.map((op) => (
              <div
                key={op.id}
                role="button"
                tabIndex={0}
                className={`dt-op dt-op-${op.type} ${hoveredOpId === op.id ? 'dt-op-hover' : ''}`}
                onMouseEnter={() => setHoveredOp(op.id)}
                onMouseLeave={() => setHoveredOp(null)}
                onFocus={() => setHoveredOp(op.id)}
                onBlur={() => setHoveredOp(null)}
              >
                <div className="dt-op-icon" aria-hidden="true">{OP_ICONS[op.type]}</div>
                <div className="dt-op-body">
                  <div className="dt-op-label">{op.label || OP_LABELS[op.type]}</div>
                  <div className="dt-op-dim">
                    X{op.x} · Y{op.y} · Z{op.depth}mm
                    {'diameter' in op && ` · Ø${op.diameter}`}
                    {'width' in op && ` · ${op.width}×${op.length}`}
                  </div>
                </div>
                <StatusChip status={op.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Stats G-Code */}
        {gcodeStats && (
          <div className="dt-section">
            <div className="dt-section-title">G-Code</div>
            <div className="dt-stats-grid">
              <div className="dt-stat">
                <div className="dt-stat-label">Segmentos</div>
                <div className="dt-stat-value">{gcodeStats.segments}</div>
              </div>
              <div className="dt-stat">
                <div className="dt-stat-label">Programa</div>
                <div className="dt-stat-value" style={{ fontSize: 11 }}>{piece.program ?? '—'}</div>
              </div>
              <div className="dt-stat">
                <div className="dt-stat-label">G0 rápido</div>
                <div className="dt-stat-value dt-stat-value-g0">{(gcodeStats.lenG0 / 1000).toFixed(2)} m</div>
              </div>
              <div className="dt-stat">
                <div className="dt-stat-label">G1 corte</div>
                <div className="dt-stat-value dt-stat-value-g1">{(gcodeStats.lenG1 / 1000).toFixed(2)} m</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
