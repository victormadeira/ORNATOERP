// @ts-check
import React from 'react';

/**
 * Badge flutuante sobreposta ao canvas 3D mostrando ID/nome/dimensões da peça.
 * @param {{ piece: import('../../types/cnc.types.js').PieceGeometry }} props
 */
export function PieceBadge({ piece }) {
  return (
    <div className="dt-piece-badge" role="complementary">
      <div className="dt-piece-badge-id">{piece.id}</div>
      <div className="dt-piece-badge-name">{piece.name}</div>
      <div className="dt-piece-badge-meta">
        {piece.width} × {piece.height} × {piece.thickness} mm
      </div>
      <div className="dt-piece-badge-meta">{piece.material}</div>
    </div>
  );
}
