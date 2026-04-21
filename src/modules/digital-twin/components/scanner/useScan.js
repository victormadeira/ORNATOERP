// @ts-check
import { useCallback, useState } from 'react';
import { useCNCStore } from '../../store/useCNCStore.js';
import { apiScan } from '../../api.js';

const CODE_REGEX = /^[A-Z]{2,10}[-_]?[0-9A-Z]{2,10}$/;

/**
 * Normaliza código escaneado (espaços, lowercase, URL → parte final).
 * @param {string} raw
 */
function normalize(raw) {
  if (!raw) return '';
  let cleaned = String(raw).trim().toUpperCase();
  const urlMatch = cleaned.match(/\/([A-Z0-9_-]{3,20})$/i);
  if (urlMatch) cleaned = urlMatch[1].toUpperCase();
  return cleaned;
}

/**
 * Hook que encapsula o fluxo de escaneamento/resolução de peça.
 * Usa a API real com fallback transparente para mocks.
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

    if (!code) {
      setError('Código vazio.');
      return { ok: false, reason: 'empty' };
    }
    if (!CODE_REGEX.test(code)) {
      setError(`Código inválido: "${code}".`);
      return { ok: false, reason: 'invalid_format', code };
    }

    setLoading(true);
    setError(null);
    try {
      const { piece, gcode } = await apiScan(code);
      setPiece(piece);
      setGCode(gcode);
      setActiveTab('render');
      return { ok: true, piece };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido';
      if (msg.includes('404') || msg.includes('not_found')) {
        setError(`Peça "${code}" não encontrada.`);
        return { ok: false, reason: 'not_found', code };
      }
      console.error('[useScan]', err);
      setError(`Erro ao buscar peça: ${msg}`);
      return { ok: false, reason: 'error', code };
    } finally {
      setLoading(false);
    }
  }, [setPiece, setGCode, setActiveTab, setError, setLoading]);

  return { onScan, lastCode };
}
