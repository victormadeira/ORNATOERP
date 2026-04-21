// @ts-check
import React, { useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import { QRScanner } from '../scanner/QRScanner.jsx';
import { Piece3DModal } from './Piece3DModal.jsx';
import { apiScan } from '../../api.js';
import '../../digital-twin.css';

const CODE_REGEX = /^[A-Z]{2,10}[-_]?[0-9A-Z]{2,10}$/;

/** @param {string} raw */
function normalize(raw) {
  if (!raw) return '';
  let cleaned = String(raw).trim().toUpperCase();
  const urlMatch = cleaned.match(/\/([A-Z0-9_-]{3,20})$/i);
  if (urlMatch) cleaned = urlMatch[1].toUpperCase();
  return cleaned;
}

/**
 * Modal com scanner de QR Code. Ao escanear uma peça válida, abre automaticamente
 * o Piece3DModal com a visualização 3D.
 *
 * @param {{
 *   onClose: () => void,
 *   onScanned?: (result: { piece: any, gcode: string|null }) => void,
 *   notify?: (msg: string, type?: string) => void,
 * }} props
 */
export function QRScanModal({ onClose, onScanned, notify }) {
  const [scanned, setScanned] = useState(/** @type {{ piece: any, gcode: string|null }|null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string|null} */ (null));

  const handleScan = useCallback(async (/** @type {string} */ raw) => {
    const code = normalize(raw);
    if (!code) return;
    if (!CODE_REGEX.test(code)) {
      setError(`Código inválido: "${code}".`);
      return;
    }
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await apiScan(code);
      if (!res?.piece) throw new Error('not_found');
      setScanned({ piece: res.piece, gcode: res.gcode });
      onScanned?.({ piece: res.piece, gcode: res.gcode });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro';
      if (msg.includes('404') || msg.includes('not_found')) {
        const label = `Peça "${code}" não encontrada.`;
        setError(label);
        notify?.(label, 'warning');
      } else {
        setError(`Erro: ${msg}`);
        notify?.(`Erro ao buscar peça: ${msg}`, 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, notify, onScanned]);

  // Se já scaneou com sucesso, mostra o 3D direto
  if (scanned?.piece) {
    return (
      <Piece3DModal
        piece={scanned.piece}
        gcode={scanned.gcode}
        onClose={onClose}
        title={`3D — ${scanned.piece.name}`}
      />
    );
  }

  const overlay = (
    <div
      className="dt-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Scanner QR"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dt-modal-card dt-modal-card-scan">
        <header className="dt-modal-head">
          <div className="dt-modal-head-left">
            <div className="dt-modal-title">Scanner — Peça CNC</div>
            <div className="dt-modal-sub">
              <span>Aponte a câmera para o QR ou digite o código</span>
            </div>
          </div>
          <button
            type="button"
            className="dt-icon-btn"
            onClick={onClose}
            aria-label="Fechar scanner"
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </header>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          <QRScanner onScan={handleScan} />
          {busy && <div className="dt-modal-canvas-hint" style={{ position: 'static', marginTop: 10 }}>Buscando peça…</div>}
          {error && <div className="dt-scanner-error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return overlay;
  return ReactDOM.createPortal(overlay, document.body);
}
