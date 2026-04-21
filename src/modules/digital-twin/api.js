// @ts-check
import api from '../../api.js';
import { MOCK_PIECES, MOCK_GCODE } from './data/mockPieces.js';

/**
 * API client do Digital Twin com fallback automático para mocks
 * quando o backend retornar 404/erro de rede.
 * Isso mantém a feature funcionando em dev/demo mesmo sem dados reais
 * no banco.
 */

const FALLBACK_ENABLED = true;

/**
 * Lista peças do backend; fallback: mocks.
 * @returns {Promise<{pieces: any[], source: 'api'|'mock'}>}
 */
export async function apiListPieces() {
  try {
    const res = await api.get('/digital-twin/pieces?limit=60');
    if (Array.isArray(res?.pieces) && res.pieces.length > 0) {
      return { pieces: res.pieces, source: 'api' };
    }
    throw new Error('empty');
  } catch (err) {
    if (!FALLBACK_ENABLED) throw err;
    return { pieces: MOCK_PIECES, source: 'mock' };
  }
}

/**
 * Busca peça + gcode por código (escaneamento ou busca manual).
 * @param {string} code
 * @returns {Promise<{ piece: any, gcode: string|null, source: 'api'|'mock' }>}
 */
export async function apiScan(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) throw new Error('empty_code');

  try {
    const res = await api.get(`/digital-twin/scan/${encodeURIComponent(normalized)}`);
    return { piece: res.piece, gcode: res.gcode || null, source: 'api' };
  } catch (err) {
    if (!FALLBACK_ENABLED) throw err;
    const mock = MOCK_PIECES.find((p) => p.id === normalized);
    if (mock) {
      return { piece: mock, gcode: MOCK_GCODE[normalized] ?? null, source: 'mock' };
    }
    throw err instanceof Error ? err : new Error('not_found');
  }
}

/**
 * Busca G-Code da peça (usado quando usuário troca de peça na sidebar).
 * @param {string} code
 * @returns {Promise<{ gcode: string|null, source: 'api'|'mock' }>}
 */
export async function apiGCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  try {
    const res = await api.get(`/digital-twin/gcode/${encodeURIComponent(normalized)}`);
    return { gcode: res.gcode || null, source: 'api' };
  } catch (err) {
    if (!FALLBACK_ENABLED) throw err;
    return { gcode: MOCK_GCODE[normalized] ?? null, source: 'mock' };
  }
}

/**
 * Computa nesting no backend. Fallback: client-side (nestingEngine).
 * @param {any[]} pieces
 * @param {any} [config]
 */
export async function apiNesting(pieces, config) {
  try {
    const res = await api.post('/digital-twin/nesting', { pieces, config });
    return { result: res.result, source: 'api' };
  } catch (err) {
    if (!FALLBACK_ENABLED) throw err;
    // Import dinâmico pra não duplicar no bundle inicial
    const { computeNesting } = await import('./components/nesting/nestingEngine.js');
    return { result: computeNesting(pieces, config), source: 'mock' };
  }
}
