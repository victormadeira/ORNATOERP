// @ts-check
/**
 * Peças mock para desenvolvimento e demo antes da integração com o ERP.
 * Todas seguem o formato PieceGeometry (ver ../types/cnc.types.js).
 */

/** @type {import('../types/cnc.types.js').PieceGeometry[]} */
export const MOCK_PIECES = [
  {
    id: 'PNL-001',
    name: 'Lateral Esquerda Armário Master',
    material: 'MDF 15mm Branco TX',
    thickness: 15,
    width: 2100,
    height: 600,
    program: 'PNL-001.nc',
    status: 'pendente',
    projectId: 'PRJ-042',
    orderId: 'ORD-1138',
    operations: [
      { id: 'op-1', type: 'furo_cego', x: 50, y: 30, depth: 12, diameter: 5, label: 'Minifix superior', status: 'ok' },
      { id: 'op-2', type: 'furo_cego', x: 50, y: 570, depth: 12, diameter: 5, label: 'Minifix inferior', status: 'ok' },
      { id: 'op-3', type: 'furo_cego', x: 2050, y: 30, depth: 12, diameter: 5, label: 'Minifix sup. direita', status: 'ok' },
      { id: 'op-4', type: 'furo_cego', x: 2050, y: 570, depth: 12, diameter: 5, label: 'Minifix inf. direita', status: 'ok' },
      { id: 'op-5', type: 'furo_passante', x: 1050, y: 300, depth: 15, diameter: 8, label: 'Passagem cabo', status: 'pendente' },
      { id: 'op-6', type: 'rasgo', x: 100, y: 290, width: 1900, length: 20, depth: 8, label: 'Rasgo fundo', status: 'ok' },
      { id: 'op-7', type: 'freza_circular', x: 200, y: 150, diameter: 35, depth: 13, label: 'Dobradiça 1', status: 'ok' },
      { id: 'op-8', type: 'freza_circular', x: 200, y: 450, diameter: 35, depth: 13, label: 'Dobradiça 2', status: 'ok' },
      { id: 'op-9', type: 'rebaixo', x: 1800, y: 550, width: 200, length: 40, depth: 3, label: 'Rebaixo topo', status: 'pendente' },
    ],
    createdAt: '2026-04-21T10:00:00Z',
    updatedAt: '2026-04-21T10:00:00Z',
  },
  {
    id: 'PRAT-003',
    name: 'Prateleira Central',
    material: 'MDF 18mm Branco TX',
    thickness: 18,
    width: 1200,
    height: 400,
    program: 'PRAT-003.nc',
    status: 'ok',
    projectId: 'PRJ-042',
    orderId: 'ORD-1138',
    operations: [
      { id: 'op-1', type: 'furo_cego', x: 30, y: 30, depth: 14, diameter: 5, label: 'Pino 1', status: 'ok' },
      { id: 'op-2', type: 'furo_cego', x: 30, y: 370, depth: 14, diameter: 5, label: 'Pino 2', status: 'ok' },
      { id: 'op-3', type: 'furo_cego', x: 1170, y: 30, depth: 14, diameter: 5, label: 'Pino 3', status: 'ok' },
      { id: 'op-4', type: 'furo_cego', x: 1170, y: 370, depth: 14, diameter: 5, label: 'Pino 4', status: 'ok' },
    ],
    createdAt: '2026-04-21T10:00:00Z',
    updatedAt: '2026-04-21T10:00:00Z',
  },
  {
    id: 'FND-042',
    name: 'Fundo Módulo Superior',
    material: 'MDF 6mm Branco TX',
    thickness: 6,
    width: 1500,
    height: 800,
    program: 'FND-042.nc',
    status: 'usinado',
    projectId: 'PRJ-042',
    orderId: 'ORD-1138',
    operations: [],
    createdAt: '2026-04-21T10:00:00Z',
    updatedAt: '2026-04-21T10:00:00Z',
  },
  {
    id: 'GAV-0013',
    name: 'Lateral Gaveta Alta',
    material: 'MDF 15mm Preto Fosco',
    thickness: 15,
    width: 450,
    height: 180,
    program: 'GAV-0013.nc',
    status: 'pendente',
    projectId: 'PRJ-048',
    orderId: 'ORD-1142',
    operations: [
      { id: 'op-1', type: 'rasgo', x: 20, y: 60, width: 410, length: 15, depth: 7, label: 'Rasgo fundo gaveta', status: 'ok' },
      { id: 'op-2', type: 'furo_cego', x: 30, y: 30, depth: 12, diameter: 5, label: 'Minifix 1', status: 'ok' },
      { id: 'op-3', type: 'furo_cego', x: 420, y: 30, depth: 12, diameter: 5, label: 'Minifix 2', status: 'ok' },
      { id: 'op-4', type: 'furo_cego', x: 30, y: 150, depth: 12, diameter: 5, label: 'Minifix 3', status: 'ok' },
      { id: 'op-5', type: 'furo_cego', x: 420, y: 150, depth: 12, diameter: 5, label: 'Minifix 4', status: 'ok' },
    ],
    createdAt: '2026-04-21T10:00:00Z',
    updatedAt: '2026-04-21T10:00:00Z',
  },
];

/** @type {Record<string, string>} G-Code mock por peça (raw .nc) */
export const MOCK_GCODE = {
  'PNL-001': `
(PNL-001 - Lateral Esquerda Armario Master)
(MDF 15mm Branco TX - 2100 x 600 x 15)
G21 G90 G17
G0 Z5
G0 X50 Y30
G1 Z-12 F300
G1 Z5
G0 X50 Y570
G1 Z-12 F300
G1 Z5
G0 X2050 Y30
G1 Z-12 F300
G1 Z5
G0 X2050 Y570
G1 Z-12 F300
G1 Z5
G0 X1050 Y300
G1 Z-15 F300
G1 Z5
G0 X100 Y290
G1 Z-8 F400
G1 X2000 Y290 F2000
G1 Z5
G0 X200 Y150
G2 X200 Y150 I17.5 J0 Z-13 F350
G1 Z5
G0 X200 Y450
G2 X200 Y450 I17.5 J0 Z-13 F350
G1 Z5
G0 X1800 Y550
G1 Z-3 F500
G1 X2000 Y550 F1500
G1 Z5
G28
M30
`.trim(),
  'PRAT-003': `
(PRAT-003 - Prateleira Central)
G21 G90 G17
G0 Z5
G0 X30 Y30
G1 Z-14 F300
G1 Z5
G0 X30 Y370
G1 Z-14 F300
G1 Z5
G0 X1170 Y30
G1 Z-14 F300
G1 Z5
G0 X1170 Y370
G1 Z-14 F300
G1 Z5
G28
M30
`.trim(),
};
