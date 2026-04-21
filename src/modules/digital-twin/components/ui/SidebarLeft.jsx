// @ts-check
import React from 'react';
import { useCNCStore } from '../../store/useCNCStore.js';
import { MOCK_PIECES, MOCK_GCODE } from '../../data/mockPieces.js';
import { StatusChip } from './StatusChip.jsx';

/**
 * Sidebar esquerda — lista de peças.
 */
export function SidebarLeft() {
  const activePiece = useCNCStore((s) => s.activePiece);
  const setPiece = useCNCStore((s) => s.setPiece);
  const setGCode = useCNCStore((s) => s.setGCode);

  const pieces = MOCK_PIECES;

  return (
    <aside className="dt-sidebar dt-sidebar-left" aria-label="Lista de peças">
      <div className="dt-section">
        <div className="dt-section-title">
          Peças
          <span className="dt-section-count">{pieces.length}</span>
        </div>
      </div>
      <div className="dt-scroll" style={{ padding: '0 14px 14px' }}>
        {pieces.map((p) => {
          const isActive = activePiece?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`dt-piece-card ${isActive ? 'dt-piece-card-active' : ''}`}
              onClick={() => {
                setPiece(p);
                setGCode(MOCK_GCODE[p.id] ?? null);
              }}
              style={{ width: '100%', textAlign: 'left' }}
              aria-pressed={isActive}
            >
              <div className="dt-piece-card-head">
                <span className="dt-piece-id">{p.id}</span>
                <StatusChip status={p.status} />
              </div>
              <div className="dt-piece-name">{p.name}</div>
              <div className="dt-piece-meta">
                {p.width}×{p.height}×{p.thickness} mm · {p.operations.length} ops
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
