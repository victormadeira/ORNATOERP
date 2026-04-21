// @ts-check
import { create } from 'zustand';

/**
 * @typedef {import('../types/cnc.types.js').PieceGeometry} PieceGeometry
 * @typedef {import('../types/cnc.types.js').NestingResult} NestingResult
 */

/**
 * Store global do Digital Twin CNC.
 * Segue PRD Seção 7 — CNCStore.
 */
export const useCNCStore = create((set) => ({
  /** @type {PieceGeometry | null} */
  activePiece: null,
  /** @type {string | null} */
  gcodeText: null,
  /** @type {boolean} */
  isLoading: false,
  /** @type {string | null} */
  error: null,

  layers: {
    solid: true,
    wireframe: false,
    gcode: true,
    dimensions: false,
    toolpathG0: true,
    toolpathG1: true,
  },

  /** @type {NestingResult | null} */
  nestingResult: null,

  /** @type {'render'|'gcode'|'nesting'|'scan'} */
  activeTab: 'render',

  /** @type {string | null} */
  hoveredOpId: null,

  setPiece: (p) => set({ activePiece: p }),
  setGCode: (g) => set({ gcodeText: g }),
  setLoading: (v) => set({ isLoading: v }),
  setError: (e) => set({ error: e }),
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setNestingResult: (r) => set({ nestingResult: r }),
  setActiveTab: (t) => set({ activeTab: t }),
  setHoveredOp: (id) => set({ hoveredOpId: id }),
  clearPiece: () => set({ activePiece: null, gcodeText: null, error: null }),
}));
