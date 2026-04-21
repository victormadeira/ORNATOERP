// @ts-check
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { parseGCode } from './gcodeParser.js';

/**
 * Renderiza o caminho de ferramenta (toolpath) como lineSegments.
 * Posiciona relativo à face SUPERIOR da peça (Y=0 = face topo).
 *
 * Convenção CNC universal:
 *   G0 vermelho (sem corte)    → #E0513F
 *   G1 azul (corte linear)      → #2E7FD6
 *   G2/G3 verde (arcos)         → #3D9B47 / #2E8A42
 *
 * @param {{
 *   gcodeText: string,
 *   piece: import('../../types/cnc.types.js').PieceGeometry,
 *   showG0?: boolean,
 *   showG1?: boolean,
 * }} props
 */
export function GCodeLayer({ gcodeText, piece, showG0 = true, showG1 = true }) {
  const { geometries } = useMemo(() => {
    const { segments } = parseGCode(gcodeText);

    /** @type {Record<'G0'|'G1'|'G2'|'G3', number[]>} */
    const buffers = { G0: [], G1: [], G2: [], G3: [] };

    for (const seg of segments) {
      const arr = buffers[seg.type];
      if (!arr) continue;
      arr.push(...seg.from, ...seg.to);
    }

    /** @type {Record<'G0'|'G1'|'G2'|'G3', THREE.BufferGeometry|null>} */
    const geos = { G0: null, G1: null, G2: null, G3: null };
    for (const key of /** @type {const} */ (['G0', 'G1', 'G2', 'G3'])) {
      if (buffers[key].length > 0) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(buffers[key], 3));
        geos[key] = g;
      }
    }

    return { geometries: geos };
  }, [gcodeText]);

  // Grupo posicionado na face superior da peça. Parser retorna Z CNC em Three.Y,
  // onde Z=0 é o zero do plano de ref CNC (topo da peça). Já bate.
  return (
    <group>
      {showG0 && geometries.G0 && (
        <lineSegments geometry={geometries.G0}>
          <lineBasicMaterial
            color="#E0513F"
            transparent
            opacity={0.55}
            linewidth={1}
          />
        </lineSegments>
      )}
      {showG1 && geometries.G1 && (
        <lineSegments geometry={geometries.G1}>
          <lineBasicMaterial color="#2E7FD6" linewidth={2} />
        </lineSegments>
      )}
      {showG1 && geometries.G2 && (
        <lineSegments geometry={geometries.G2}>
          <lineBasicMaterial color="#3D9B47" linewidth={2} />
        </lineSegments>
      )}
      {showG1 && geometries.G3 && (
        <lineSegments geometry={geometries.G3}>
          <lineBasicMaterial color="#2E8A42" linewidth={2} />
        </lineSegments>
      )}
      {/* Suppress unused */}
      {false && piece && null}
    </group>
  );
}
