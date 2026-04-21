// @ts-check
import React from 'react';

/**
 * Cartões de estatística do resultado do nesting.
 * @param {{ result: import('../../types/cnc.types.js').NestingResult }} props
 */
export function NestingStats({ result }) {
  const pct = result.utilizationPercent.toFixed(1);
  const waste = result.wasteArea.toFixed(2);
  const kerf = result.kerfLoss.toFixed(2);

  return (
    <div className="dt-stats-grid">
      <div className="dt-stat">
        <div className="dt-stat-label">Aproveitamento</div>
        <div className="dt-stat-value dt-stat-accent">{pct}%</div>
      </div>
      <div className="dt-stat">
        <div className="dt-stat-label">Chapas</div>
        <div className="dt-stat-value">{result.sheetsUsed}</div>
      </div>
      <div className="dt-stat">
        <div className="dt-stat-label">Sobra</div>
        <div className="dt-stat-value">{waste} m²</div>
      </div>
      <div className="dt-stat">
        <div className="dt-stat-label">Kerf</div>
        <div className="dt-stat-value">{kerf} m²</div>
      </div>
    </div>
  );
}
