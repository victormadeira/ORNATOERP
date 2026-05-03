// @ts-check
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Scanner de QR Code via webcam com fallback pra input manual.
 * @param {{
 *   onScan: (code: string) => void | Promise<any>,
 *   onClose?: () => void
 * }} props
 */
export function QRScanner({ onScan, onClose }) {
  const containerRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const scannerRef = useRef(/** @type {Html5Qrcode|null} */ (null));
  const [manual, setManual] = useState('');
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const elId = 'dt-qr-scanner-region';
    containerRef.current.id = elId;

    let cancelled = false;
    const scanner = new Html5Qrcode(elId, { verbose: false });
    scannerRef.current = scanner;

    Html5Qrcode.getCameras()
      .then((cams) => {
        if (cancelled) return;
        if (!cams || cams.length === 0) {
          setError('Nenhuma câmera encontrada. Use entrada manual.');
          return;
        }
        // Preferir traseira
        const back = cams.find((c) => /back|rear|traseira/i.test(c.label)) ?? cams[cams.length - 1];
        return scanner.start(
          back.id,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => {
            if (cancelled) return;
            onScan(decoded);
          },
          () => {/* ignore per-frame decode errors */ },
        );
      })
      .then(() => { if (!cancelled) setActive(true); })
      .catch((err) => {
        console.warn('[QRScanner] start failed', err);
        if (!cancelled) setError('Não foi possível iniciar a câmera.');
      });

    return () => {
      cancelled = true;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => { });
      }
    };
  }, [onScan]);

  /** @param {React.FormEvent} e */
  const handleManualSubmit = (e) => {
    e.preventDefault();
    const v = manual.trim();
    if (v) onScan(v);
  };

  return (
    <div className="dt-scanner-wrap">
      <div className="dt-scanner-video" ref={containerRef} />
      <div className="dt-scanner-overlay">
        {active && <div className="dt-scanner-hint">Aponte a câmera para o QR Code da peça</div>}
        {error && <div className="dt-scanner-error">{error}</div>}
      </div>

      <form className="dt-scanner-manual" onSubmit={handleManualSubmit}>
        <label className="dt-label" htmlFor="dt-manual-code">Ou digite o código manualmente</label>
        <div className="dt-scanner-actions">
          <input
            id="dt-manual-code"
            className="dt-scan-input"
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="Ex: PNL-001"
            autoComplete="off"
          />
          <button type="submit" className="dt-scan-btn">Buscar</button>
          {onClose && (
            <button
              type="button"
              className="dt-icon-btn"
              onClick={onClose}
              aria-label="Fechar scanner"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
