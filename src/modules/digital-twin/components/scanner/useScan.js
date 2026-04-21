// @ts-check
import { useCallback, useState } from 'react';
import { useCNCStore } from '../../store/useCNCStore.js';
import { MOCK_PIECES, MOCK_GCODE } from '../../data/mockPieces.js';

const CODE_REGEX = /^[A-Z]{2,6}-[0-9]{2,6}$/;

/**
 * Normaliza código escaneado (espaços, lowercase, URL → parte final).
 * @param {string} raw
 */
function normalize(raw) {
  if (!raw) return '';
  let cleaned = String(raw).trim().toUpperCase();
  // Se vier URL tipo https://ornato.app/p/PNL-001, extrai último segmento
  const urlMatch = cleaned.match(/\/([A-Z]{2,6}-[0-9]{2,6})$/i);
  if (urlMatch) cleaned = urlMatch[1].toUpperCase();
  return cleaned;
}

/**
 * Hook que encapsula o fluxo de escaneamento/resolução de peça.
 * Pode evoluir pra fetch('/api/scan/:code') quando backend existir.
 */
export function useScan() {
  const setPiece = useCNCStore((s) => s.setPiece);
  const setGCode = useCNCStore((s) => s.setGCode);
  const setActiveTab = useCNCStore((s) => s.setActiveTab);
  const setError = useCNCStore((s) => s.setError);
  const setLoading = useCNCStore((s) => s.setLoading);
  const [lastCode, setLastCode] = useState(/** @type {string|null} */ (null));

  /** @param {string} rawCode */
  const onScan = useCallback(async (rawCode) => {
    const code = normalize(rawCode);
    setLastCode(code);

    if (!CODE_REGEX.test(code)) {
      setError(`Código inválido: "${code}". Use formato AAA-000.`);
      return { ok: false, reason: 'invalid_format', code };
    }

    setLoading(true);
    setError(null);
    try {
      // Por enquanto, resolve direto do mock. Depois: await fetch(`/api/pieces/${code}`)
      const piece = MOCK_PIECES.find((p) => p.id === code);
      if (!piece) {
        setError(`Peça "${code}" não encontrada.`);
        return { ok: false, reason: 'not_found', code };
      }
      setPiece(piece);
      setGCode(MOCK_GCODE[code] ?? null);
      setActiveTab('render');
      return { ok: true, piece };
    } catch (err) {
      console.error('[useScan]', err);
      setError(`Erro ao buscar peça: ${err instanceof Error ? err.message : 'desconhecido'}`);
      return { ok: false, reason: 'error', code };
    } finally {
      setLoading(false);
    }
  }, [setPiece, setGCode, setActiveTab, setError, setLoading]);

  return { onScan, lastCode };
}
