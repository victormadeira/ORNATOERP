// @ts-check
import React, { useMemo, useState } from 'react';

/**
 * Desenha uma chapa com as peças posicionadas — SVG responsivo.
 *
 * @param {{
 *   sheetIndex: number,
 *   placed: import('../../types/cnc.types.js').PlacedPiece[],
 *   pieces: import('../../types/cnc.types.js').PieceNesting[],
 *   config: import('../../types/cnc.types.js').NestingConfig,
 *   onPieceClick?: (pieceId: string) => void
 * }} props
 */
export function NestingCanvas({ sheetIndex, placed, pieces, config, onPieceClick }) {
  const [hovered, setHovered] = useState(/** @type {number|null} */ (null));

  const onSheet = placed.filter((p) => p.sheetIndex === sheetIndex);

  const pieceMap = useMemo(() => {
    const m = new Map();
    for (const p of pieces) m.set(p.pieceId, p);
    return m;
  }, [pieces]);

  // Paleta de cores suaves para diferenciar peças — tons quentes (Ornato-like)
  const palette = [
    '#C9A574', '#B8935A', '#E3C58A', '#8A6A3F', '#D4AF7F',
    '#A88253', '#F0D9A8', '#967046', '#C9A96E', '#B88E58',
  ];

  return (
    <svg
      viewBox={`0 0 ${config.sheetWidth} ${config.sheetHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="dt-nest-svg"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {/* Chapa base */}
      <rect
        x={0}
        y={0}
        width={config.sheetWidth}
        height={config.sheetHeight}
        fill="var(--bg-subtle)"
        stroke="var(--border-strong)"
        strokeWidth={4}
      />

      {/* Grid de referência (cada 500mm) */}
      {Array.from({ length: Math.floor(config.sheetWidth / 500) }, (_, i) => (
        <line
          key={`vx-${i}`}
          x1={(i + 1) * 500}
          y1={0}
          x2={(i + 1) * 500}
          y2={config.sheetHeight}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="10 10"
          opacity={0.35}
        />
      ))}
      {Array.from({ length: Math.floor(config.sheetHeight / 500) }, (_, i) => (
        <line
          key={`hy-${i}`}
          x1={0}
          y1={(i + 1) * 500}
          x2={config.sheetWidth}
          y2={(i + 1) * 500}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="10 10"
          opacity={0.35}
        />
      ))}

      {/* Peças */}
      {onSheet.map((p, idx) => {
        const def = pieceMap.get(p.pieceId);
        if (!def) return null;
        const w = p.rotation === 90 ? def.height : def.width;
        const h = p.rotation === 90 ? def.width : def.height;
        const color = palette[idx % palette.length];
        const isHovered = hovered === idx;

        return (
          <g
            key={`piece-${idx}`}
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onPieceClick?.(p.pieceId)}
            style={{ cursor: onPieceClick ? 'pointer' : 'default' }}
          >
            <rect
              x={p.x}
              y={p.y}
              width={w}
              height={h}
              fill={color}
              stroke={isHovered ? 'var(--primary)' : 'var(--text-primary)'}
              strokeWidth={isHovered ? 8 : 2}
              opacity={0.85}
            />
            <text
              x={p.x + w / 2}
              y={p.y + h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#1a1a1a"
              fontSize={Math.min(w, h) * 0.12}
              fontFamily="Inter, sans-serif"
              fontWeight={600}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {p.pieceId}
            </text>
            {p.rotation === 90 && (
              <text
                x={p.x + 20}
                y={p.y + 30}
                fill="#1a1a1a"
                fontSize={24}
                fontFamily="Inter, sans-serif"
                style={{ pointerEvents: 'none' }}
              >
                ↻90°
              </text>
            )}
          </g>
        );
      })}

      {/* Label chapa */}
      <text
        x={20}
        y={50}
        fill="var(--text-primary)"
        fontSize={48}
        fontFamily="Inter, sans-serif"
        fontWeight={700}
      >
        Chapa {sheetIndex + 1}
      </text>
      <text
        x={20}
        y={90}
        fill="var(--text-muted)"
        fontSize={28}
        fontFamily="Inter, sans-serif"
      >
        {config.sheetWidth} × {config.sheetHeight} mm
      </text>
    </svg>
  );
}
