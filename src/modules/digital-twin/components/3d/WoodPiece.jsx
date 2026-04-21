// @ts-check
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { buildCSG } from './buildCSG.js';

/**
 * Renderiza a peça de madeira com CSG real (furos, rasgos, rebaixos etc.
 * são BURACOS REAIS na malha).
 *
 * PRD Seção 3.4 — Materiais multicamadas:
 *  - topo (face SUPERIOR Y=0): melamina TX (cor mais clara, rugosa)
 *  - faces laterais: tom de MDF cru (bege quente)
 *  - interior de furos/rasgos: mesmo tom de MDF cru (contraste visual)
 *
 * Three.js BoxGeometry groups order:
 *   0=right(+X), 1=left(-X), 2=top(+Y), 3=bottom(-Y), 4=front(+Z), 5=back(-Z)
 *
 * Depois do CSG, os grupos ficam preservados (useGroups=true no Evaluator),
 * e as faces internas dos furos são adicionadas como grupo extra (index >= 6).
 * Usamos material array pra colorir topo diferente do resto.
 *
 * @param {{
 *   piece: import('../../types/cnc.types.js').PieceGeometry,
 *   wireframe?: boolean,
 *   onGeometryReady?: (g: THREE.BufferGeometry) => void
 * }} props
 */
export function WoodPiece({ piece, wireframe = false, onGeometryReady }) {
  const { geometry, hadError } = useMemo(() => {
    const result = buildCSG(piece);
    if (onGeometryReady) onGeometryReady(result.geometry);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece.id, piece.operations?.length, piece.width, piece.height, piece.thickness]);

  const materials = useMemo(() => {
    // Tons MDF: topo melamina TX (mais claro, mais liso) vs faces/interior cru
    const topoColor = new THREE.Color('#F5E6D3'); // bege quente claro (melamina branca TX)
    const faceColor = new THREE.Color('#C9A574'); // MDF cru amadeirado (cobre suave — puxa do nosso --accent)
    const innerColor = new THREE.Color('#A68554'); // MDF cru interior (mais escuro, contraste nos furos)

    // Material comum topo
    const topoMat = new THREE.MeshStandardMaterial({
      color: topoColor,
      roughness: 0.78,
      metalness: 0.0,
    });
    // Material faces laterais
    const faceMat = new THREE.MeshStandardMaterial({
      color: faceColor,
      roughness: 0.88,
      metalness: 0.0,
    });
    // Material interior (furos/rasgos) — levemente mais escuro
    const innerMat = new THREE.MeshStandardMaterial({
      color: innerColor,
      roughness: 0.95,
      metalness: 0.0,
    });

    // Array de 7 slots (0..5 faces do box + 6 grupo "interior" pós-CSG)
    // Ordem BoxGeometry: 0=right, 1=left, 2=top, 3=bottom, 4=front, 5=back
    return [
      faceMat,   // 0 right
      faceMat,   // 1 left
      topoMat,   // 2 top (face SUPERIOR — onde operações aparecem)
      faceMat,   // 3 bottom
      faceMat,   // 4 front
      faceMat,   // 5 back
      innerMat,  // 6+ — grupos criados pelo CSG (interior dos furos)
      innerMat,  // 7 fallback
      innerMat,  // 8 fallback
    ];
  }, []);

  return (
    <group>
      <mesh
        geometry={geometry}
        material={materials}
        castShadow
        receiveShadow
      />
      {wireframe && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color="#1379F0"
            wireframe
            transparent
            opacity={0.25}
            depthTest={false}
          />
        </mesh>
      )}
      {hadError && (
        // Visual flag: cantos vermelhos pra indicar erro em alguma op
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[8, 16, 16]} />
          <meshBasicMaterial color="#E0513F" />
        </mesh>
      )}
    </group>
  );
}
