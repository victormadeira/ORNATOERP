// @ts-check
import React from 'react';
import { useCNCStore } from '../../store/useCNCStore.js';
import { apiGCode } from '../../api.js';
import { StatusChip } from './StatusChip.jsx';

/**
 * Sidebar esquerda — lista de peças (vem do store, carregada pelo DigitalTwin page).
 */
export function SidebarLeft() {
  const pieces = useCNCStore((s) => s.pieces);
  const piecesSource = useCNCStore((s) => s.piecesSource);
  const activePiece = useCNCStore((s) => s.activePiece);
  const setPiece = useCNCStore((s) => s.setPiece);
  const setGCode = useCNCStore((s) => s.setGCode);
  const isLoading = useCNCStore((s) => s.isLoading);

  /** @param {any} p */
  const selectPiece = async (p) => {
    setPiece(p);
    setGCode(null);
    try {
      const { gcode } = await apiGCode(p.id);
      setGCode(gcode);
    } catch {
      setGCode(null);
    }
  };

  return (
    <aside className="dt-sidebar dt-sidebar-left" aria-label="Lista de peças">
      <div className="dt-section">
        <div className="dt-section-title">
          Peças
          <span className="dt-section-count">{pieces.length}</span>
          {piecesSource === 'mock' && (
            <span
              className="dt-chip dt-chip-pendente"
              style={{ marginLeft: 'auto' }}
              title="Exibindo peças mock — banco sem peças ainda"
            >
              Demo
            </span>
          )}
        </div>
      </div>
      <div className="dt-scroll" style={{ padding: '0 14px 14px' }}>
        {isLoading && pieces.length === 0 && (
          <>
            <div className="dt-skeleton" style={{ height: 52, marginBottom: 6 }} />
            <div className="dt-skeleton" style={{ height: 52, marginBottom: 6 }} />
            <div className="dt-skeleton" style={{ height: 52, marginBottom: 6 }} />
          </>
        )}
        {pieces.length === 0 && !isLoading && (
          <div className="dt-piece-meta" style={{ padding: '10px 2px' }}>
            Nenhuma peça disponível.
          </div>
        )}
        {pieces.map((p) => {
          const isActive = activePiece?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`dt-piece-card ${isActive ? 'dt-piece-card-active' : ''}`}
              onClick={() => selectPiece(p)}
              style={{ width: '100%', textAlign: 'left' }}
              aria-pressed={isActive}
            >
              <div className="dt-piece-card-head">
                <span className="dt-piece-id">{p.id}</span>
                <StatusChip status={p.status} />
              </div>
              <div className="dt-piece-name">{p.name}</div>
              <div className="dt-piece-meta">
                {p.width}×{p.height}×{p.thickness} mm · {p.operations?.length ?? 0} ops
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
