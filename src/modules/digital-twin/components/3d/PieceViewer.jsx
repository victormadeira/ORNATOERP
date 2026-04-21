// @ts-check
import React, { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { WoodPiece } from './WoodPiece.jsx';
import { SceneEnvironment } from './SceneEnvironment.jsx';
import { GCodeLayer } from '../gcode/GCodeLayer.jsx';

/**
 * Viewer 3D principal — Canvas R3F com OrbitControls.
 * Usa as classes CSS Ornato para o container.
 *
 * @param {{
 *   piece: import('../../types/cnc.types.js').PieceGeometry,
 *   gcodeText?: string | null,
 *   layers: {
 *     solid: boolean,
 *     wireframe: boolean,
 *     gcode: boolean,
 *     dimensions: boolean,
 *     toolpathG0: boolean,
 *     toolpathG1: boolean,
 *   }
 * }} props
 */
export function PieceViewer({ piece, gcodeText, layers }) {
  // Camera alvo: centro da peça na face superior (origem +width/2, 0, +height/2)
  const target = useMemo(
    () => new THREE.Vector3(piece.width / 2, -piece.thickness / 2, piece.height / 2),
    [piece.width, piece.height, piece.thickness],
  );

  // Camera inicial — isométrica, afastada proporcional ao tamanho
  const cameraPos = useMemo(() => {
    const dist = Math.max(piece.width, piece.height) * 1.3;
    return [piece.width / 2 + dist * 0.7, dist * 0.85, piece.height / 2 + dist * 0.7];
  }, [piece.width, piece.height]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      style={{ width: '100%', height: '100%' }}
    >
      <PerspectiveCamera
        makeDefault
        fov={35}
        near={1}
        far={20000}
        position={/** @type {[number,number,number]} */ (cameraPos)}
      />

      <SceneEnvironment piece={piece} showGrid showAxes />

      <Suspense fallback={null}>
        {layers.solid && (
          <WoodPiece piece={piece} wireframe={layers.wireframe} />
        )}

        {layers.gcode && gcodeText && (
          <GCodeLayer
            gcodeText={gcodeText}
            piece={piece}
            showG0={layers.toolpathG0}
            showG1={layers.toolpathG1}
          />
        )}
      </Suspense>

      <OrbitControls
        makeDefault
        target={target}
        enableDamping
        dampingFactor={0.08}
        minDistance={50}
        maxDistance={10000}
        maxPolarAngle={Math.PI * 0.95}
      />
    </Canvas>
  );
}
