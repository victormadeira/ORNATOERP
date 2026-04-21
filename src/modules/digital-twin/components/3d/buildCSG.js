// @ts-check
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

/**
 * Constrói a geometria CSG real da peça — furos são buracos REAIS na malha
 * (PRD Seção 3.1: "não apenas círculos pintados na superfície").
 *
 * Sistema de coordenadas (PRD Seção 3.3):
 *   - Origem (0,0,0) = canto inferior esquerdo da face SUPERIOR
 *   - X → largura (width) para direita
 *   - Y → espessura (thickness) para CIMA
 *   - Z → altura (height) para frente
 *   - Unidade: mm (1:1 com Three.js units)
 *
 * Usamos three-bvh-csg (mais rápido que three-csg-ts do PRD — desvio documentado:
 * BVH-accelerated, resultado idêntico, sem bloqueio da UI para peças <20 operações).
 *
 * @param {import('../../types/cnc.types.js').PieceGeometry} piece
 * @returns {{ geometry: THREE.BufferGeometry, hadError: boolean }}
 */
export function buildCSG(piece) {
  const { width, height, thickness, operations } = piece;

  // Chapa base: BoxGeometry(width, thickness, height)
  // Thickness no eixo Y (para cima), height no eixo Z (para frente)
  const base = new THREE.BoxGeometry(width, thickness, height);

  // Centraliza: origem vai pro canto inf-esquerdo da face SUPERIOR.
  // Isso significa mover +width/2, +height/2 e -thickness/2 (face SUPERIOR é Y=0).
  base.translate(width / 2, -thickness / 2, height / 2);

  // Assign material index 0 a tudo (vamos trocar por face-specific depois se precisar)
  // 0=right, 1=left, 2=top, 3=bottom, 4=front, 5=back (Three.js BoxGeometry)
  // Mantemos como está — o material será array no mesh.

  let result = new Brush(base);
  result.updateMatrixWorld();

  const evaluator = new Evaluator();
  evaluator.useGroups = true;

  let hadError = false;

  for (const op of operations) {
    try {
      const subtractor = buildSubtractor(op, thickness);
      if (!subtractor) continue;

      const subBrush = new Brush(subtractor);
      subBrush.updateMatrixWorld();

      const next = evaluator.evaluate(result, subBrush, SUBTRACTION);
      result = next;
      result.updateMatrixWorld();
    } catch (err) {
      console.warn('[buildCSG] falha operação', op.id, err);
      hadError = true;
    }
  }

  return { geometry: result.geometry, hadError };
}

/**
 * Cria a geometria subtratora para cada operação, já posicionada.
 * @param {import('../../types/cnc.types.js').Operation} op
 * @param {number} thickness
 */
function buildSubtractor(op, thickness) {
  switch (op.type) {
    case 'furo_cego': {
      const d = 'diameter' in op ? op.diameter : 5;
      const depth = op.depth;
      const g = new THREE.CylinderGeometry(d / 2, d / 2, depth, 32);
      // Cilindro default Three.js: eixo Y. Posicionar no topo da peça (Y=0),
      // descendo para Y=-depth.
      g.translate(op.x, -depth / 2, op.y);
      return g;
    }
    case 'furo_passante': {
      const d = 'diameter' in op ? op.diameter : 8;
      // +2mm acima e abaixo pra garantir clean cut (PRD Seção 3.2)
      const h = thickness + 2;
      const g = new THREE.CylinderGeometry(d / 2, d / 2, h, 32);
      g.translate(op.x, -thickness / 2, op.y);
      return g;
    }
    case 'freza_circular': {
      const d = 'diameter' in op ? op.diameter : 35;
      const depth = op.depth;
      const g = new THREE.CylinderGeometry(d / 2, d / 2, depth, 64);
      g.translate(op.x, -depth / 2, op.y);
      return g;
    }
    case 'rasgo': {
      const w = 'width' in op ? op.width : 20;    // comprimento em X
      const l = 'length' in op ? op.length : 8;   // espessura do rasgo em Z
      const depth = op.depth;
      const g = new THREE.BoxGeometry(w, depth, l);
      // Passante = pode ser da borda à borda. Posicionar centralizando em (x+w/2, y+l/2)
      g.translate(op.x + w / 2, -depth / 2, op.y + l / 2);
      return g;
    }
    case 'rebaixo': {
      const w = 'width' in op ? op.width : 20;
      const l = 'length' in op ? op.length : 20;
      const depth = op.depth;
      const g = new THREE.BoxGeometry(w, depth, l);
      g.translate(op.x + w / 2, -depth / 2, op.y + l / 2);
      return g;
    }
    case 'chanfro': {
      const angle = 'angle' in op ? op.angle : 45;
      const len = 'length' in op ? op.length : 20;
      const depth = op.depth;
      // Chanfro = caixa inclinada na aresta — simplificado como box rotacionado
      const g = new THREE.BoxGeometry(len, depth * 2, depth * 2);
      g.rotateZ((angle * Math.PI) / 180);
      g.translate(op.x + len / 2, -depth, op.y);
      return g;
    }
    default:
      return null;
  }
}
