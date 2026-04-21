// @ts-check
import React from 'react';
import { Environment, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';

/**
 * Ambiente padrão da cena 3D: iluminação, grid, eixos, environment map.
 * PRD Seção 3.5 — iluminação quente + leve HDRI "warehouse".
 *
 * @param {{
 *   piece?: import('../../types/cnc.types.js').PieceGeometry,
 *   showGrid?: boolean,
 *   showAxes?: boolean,
 * }} props
 */
export function SceneEnvironment({ piece, showGrid = true, showAxes = true }) {
  // Grid adapta ao tamanho da peça (pelo menos 3000mm)
  const gridSize = piece ? Math.max(piece.width, piece.height) * 1.8 : 3000;

  return (
    <>
      {/* Luz ambiente suave pra não deixar faces escuras */}
      <ambientLight intensity={0.55} color="#FFF4E0" />

      {/* Luz principal — quente, vinda de cima-frente-direita */}
      <directionalLight
        position={[800, 1200, 800]}
        intensity={1.4}
        color="#FFE8C4"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-2000}
        shadow-camera-right={2000}
        shadow-camera-top={2000}
        shadow-camera-bottom={-2000}
        shadow-camera-near={1}
        shadow-camera-far={4000}
      />

      {/* Fill light — fria, do outro lado, suave */}
      <directionalLight
        position={[-600, 400, -400]}
        intensity={0.4}
        color="#B8D4F0"
      />

      {/* Rim light — atrás pra destacar silhueta */}
      <directionalLight
        position={[0, 300, -1000]}
        intensity={0.3}
        color="#FFFFFF"
      />

      {/* Environment HDRI — reflexos sutis (não afetam muito madeira) */}
      <Environment preset="warehouse" background={false} />

      {/* Grid quadriculado — referência de escala (1 célula = 100mm) */}
      {showGrid && (
        <Grid
          args={[gridSize, gridSize]}
          cellSize={100}
          cellThickness={0.5}
          cellColor="#C9A574"
          sectionSize={500}
          sectionThickness={1.2}
          sectionColor="#B8935A"
          fadeDistance={gridSize * 1.2}
          fadeStrength={1.5}
          followCamera={false}
          infiniteGrid
          position={[0, -((piece?.thickness ?? 0) + 0.5), 0]}
        />
      )}

      {/* Eixos XYZ coloridos — referência do sistema CNC */}
      {showAxes && (
        <group>
          {/* Eixo X (vermelho) — largura */}
          <mesh position={[50, 2, 0]}>
            <boxGeometry args={[100, 2, 2]} />
            <meshBasicMaterial color="#E0513F" />
          </mesh>
          {/* Eixo Y (verde) — espessura (pra cima) */}
          <mesh position={[0, 52, 0]}>
            <boxGeometry args={[2, 100, 2]} />
            <meshBasicMaterial color="#3D9B47" />
          </mesh>
          {/* Eixo Z (azul) — altura */}
          <mesh position={[0, 2, 50]}>
            <boxGeometry args={[2, 2, 100]} />
            <meshBasicMaterial color="#2E7FD6" />
          </mesh>
        </group>
      )}

      {/* Gizmo de orientação no canto */}
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport
          axisColors={['#E0513F', '#3D9B47', '#2E7FD6']}
          labelColor="#1a1a1a"
        />
      </GizmoHelper>
    </>
  );
}
