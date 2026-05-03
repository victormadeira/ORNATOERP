// @ts-check
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { PieceViewer } from '../3d/PieceViewer.jsx';
import { pecaToPieceGeometry } from '../../lib/pecaAdapter.js';
import { apiGCode } from '../../api.js';
import '../../digital-twin.css';

/**
 * Modal 3D reutilizável — mostra uma peça cnc_pecas com CSG real (furos de verdade),
 * toolpath de G-Code colorido (G0 vermelho / G1 azul / G2-G3 verde) e camadas toggláveis.
 *
 * Aceita:
 *   - `peca` (row cnc_pecas) OU
 *   - `piece` (PieceGeometry já pronto)
 *
 * Se receber `peca` faz o adapter client-side; se receber `piece` usa direto.
 * O G-Code é carregado via apiGCode (fallback para gerado no backend).
 *
 * @param {{
 *   peca?: any,
 *   piece?: import('../../types/cnc.types.js').PieceGeometry,
 *   gcode?: string | null,
 *   onClose: () => void,
 *   title?: string,
 * }} props
 */
export function Piece3DModal({ peca, piece: pieceProp, gcode: gcodeProp, onClose, title }) {
  const piece = useMemo(() => {
    if (pieceProp) return pieceProp;
    if (peca) {
      try { return pecaToPieceGeometry(peca); }
      catch (err) { console.error('[Piece3DModal] adapter failed', err); return null; }
    }
    return null;
  }, [peca, pieceProp]);

  const [gcode, setGcode] = useState(/** @type {string|null} */ (gcodeProp ?? null));
  const [loadingGcode, setLoadingGcode] = useState(false);
  const [layers, setLayers] = useState({
    solid: true,
    wireframe: false,
    gcode: true,
    dimensions: false,
    toolpathG0: true,
    toolpathG1: true,
  });

  // Carrega G-Code se não veio por prop
  useEffect(() => {
    if (gcodeProp || !piece?.id) return;
    let cancelled = false;
    setLoadingGcode(true);
    apiGCode(piece.id)
      .then(({ gcode: g }) => { if (!cancelled) setGcode(g); })
      .catch(() => { if (!cancelled) setGcode(null); })
      .finally(() => { if (!cancelled) setLoadingGcode(false); });
    return () => { cancelled = true; };
  }, [piece?.id, gcodeProp]);

  // ESC fecha
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Previne scroll da página atrás do modal
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!piece) return null;

  const toggle = (/** @type {keyof typeof layers} */ key) =>
    setLayers((s) => ({ ...s, [key]: !s[key] }));

  const overlay = (
    <div
      className="dt-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title || `Visualização 3D — ${piece.name}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dt-modal-card">
        {/* Header */}
        <header className="dt-modal-head">
          <div className="dt-modal-head-left">
            <div className="dt-modal-title">{title || piece.name}</div>
            <div className="dt-modal-sub">
              <span className="dt-chip-mono">{piece.id}</span>
              <span>{piece.width} × {piece.height} × {piece.thickness} mm</span>
              <span>{piece.material}</span>
              <span>{piece.operations?.length ?? 0} operações</span>
            </div>
          </div>
          <button
            type="button"
            className="dt-icon-btn"
            onClick={onClose}
            aria-label="Fechar visualização 3D"
            title="Fechar (Esc)"
          >
            <X size={16} />
          </button>
        </header>

        {/* Canvas */}
        <div className="dt-modal-canvas">
          <PieceViewer
            piece={piece}
            gcodeText={layers.gcode ? gcode : null}
            layers={layers}
          />
          {loadingGcode && (
            <div className="dt-modal-canvas-hint">Carregando G-Code…</div>
          )}
        </div>

        {/* Toggle bar */}
        <footer className="dt-modal-foot">
          <LayerBtn active={layers.solid} onClick={() => toggle('solid')}>Sólido</LayerBtn>
          <LayerBtn active={layers.wireframe} onClick={() => toggle('wireframe')}>Wireframe</LayerBtn>
          <LayerBtn active={layers.gcode} onClick={() => toggle('gcode')} disabled={!gcode}>G-Code</LayerBtn>
          <LayerBtn active={layers.toolpathG0} onClick={() => toggle('toolpathG0')} disabled={!gcode}>
            <span className="dt-dot" style={{ background: '#E0513F' }} /> G0
          </LayerBtn>
          <LayerBtn active={layers.toolpathG1} onClick={() => toggle('toolpathG1')} disabled={!gcode}>
            <span className="dt-dot" style={{ background: '#2E7FD6' }} /> G1
          </LayerBtn>
          <div className="dt-modal-foot-spacer" />
          <div className="dt-modal-hint">Arraste para rotacionar · Scroll para zoom · Esc fecha</div>
        </footer>
      </div>
    </div>
  );

  // Portal para escapar de qualquer overflow hidden dos ancestrais
  if (typeof document === 'undefined') return overlay;
  return ReactDOM.createPortal(overlay, document.body);
}

/**
 * @param {{ active: boolean, onClick: () => void, disabled?: boolean, children: React.ReactNode }} props
 */
function LayerBtn({ active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={`dt-layer-btn ${active ? 'dt-layer-btn-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
