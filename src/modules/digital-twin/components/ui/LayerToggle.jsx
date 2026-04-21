// @ts-check
import React from 'react';
import { useCNCStore } from '../../store/useCNCStore.js';

/**
 * @typedef {Object} LayerDef
 * @property {keyof ReturnType<typeof useCNCStore.getState>['layers']} key
 * @property {string} label
 * @property {string} [modifier]
 */

/** @type {LayerDef[]} */
const LAYERS = [
  { key: 'solid',      label: 'Sólido' },
  { key: 'wireframe',  label: 'Wire' },
  { key: 'gcode',      label: 'G-Code' },
  { key: 'toolpathG0', label: 'G0',    modifier: 'g0' },
  { key: 'toolpathG1', label: 'G1',    modifier: 'g1' },
  { key: 'dimensions', label: 'Dim' },
];

/**
 * Barra flutuante inferior com toggles de camadas 3D.
 */
export function LayerToggle() {
  const layers = useCNCStore((s) => s.layers);
  const toggleLayer = useCNCStore((s) => s.toggleLayer);

  return (
    <div className="dt-layer-controls" role="group" aria-label="Camadas visíveis">
      {LAYERS.map((l) => {
        const active = layers[l.key];
        const modCls = l.modifier && active ? `dt-layer-btn-${l.modifier}-active` : '';
        return (
          <button
            key={String(l.key)}
            type="button"
            className={`dt-layer-btn ${active ? 'dt-layer-btn-active' : ''} ${modCls}`}
            onClick={() => toggleLayer(l.key)}
            aria-pressed={active}
          >
            <span className="dt-layer-btn-dot" aria-hidden="true" />
            <span className="dt-layer-btn-label">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
