// @ts-check
/**
 * Digital Twin CNC — Contratos de dados (JSDoc)
 * Fonte única da verdade. Todos os componentes, store e API devem aderir.
 * Ver PRD Seção 7.
 */

/**
 * @typedef {'furo_cego'|'furo_passante'|'rasgo'|'rebaixo'|'freza_circular'|'chanfro'} OperationType
 */

/**
 * @typedef {Object} BaseOperation
 * @property {string} id           UUID único
 * @property {OperationType} type
 * @property {number} x            mm desde borda esquerda
 * @property {number} y            mm desde borda inferior
 * @property {number} depth        mm de profundidade
 * @property {string} label        descrição humana
 * @property {'ok'|'pendente'|'erro'} status
 */

/**
 * @typedef {BaseOperation & { type: 'furo_cego'|'furo_passante'|'freza_circular', diameter: number }} FuroOperation
 */

/**
 * @typedef {BaseOperation & { type: 'rasgo'|'rebaixo', width: number, length: number, angle?: number }} RasgoOperation
 */

/**
 * @typedef {BaseOperation & { type: 'chanfro', angle: number, length: number }} ChanfroOperation
 */

/**
 * @typedef {FuroOperation | RasgoOperation | ChanfroOperation} Operation
 */

/**
 * @typedef {Object} PieceGeometry
 * @property {string} id                ex: "PNL-001"
 * @property {string} name              ex: "Lateral Esquerda Armário"
 * @property {string} material          ex: "MDF 15mm Branco TX"
 * @property {number} thickness         mm
 * @property {number} width             mm
 * @property {number} height            mm
 * @property {string} [program]         arquivo .nc
 * @property {Operation[]} operations
 * @property {'ok'|'pendente'|'erro'|'usinado'} status
 * @property {string} [projectId]
 * @property {string} [orderId]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} ToolpathPoint
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {'G0'|'G1'|'G2'|'G3'} type
 * @property {number} [feedRate]
 */

/**
 * @typedef {Object} PieceNesting
 * @property {string} pieceId
 * @property {number} width
 * @property {number} height
 * @property {number} quantity
 * @property {boolean} allowRotation
 * @property {string} material
 */

/**
 * @typedef {Object} PlacedPiece
 * @property {string} pieceId
 * @property {number} x
 * @property {number} y
 * @property {0|90} rotation
 * @property {number} sheetIndex
 */

/**
 * @typedef {Object} NestingConfig
 * @property {number} sheetWidth     default 2750
 * @property {number} sheetHeight    default 1840
 * @property {number} kerf           default 6
 * @property {number} bleed          default 10
 */

/**
 * @typedef {Object} NestingResult
 * @property {PlacedPiece[]} placed
 * @property {number} sheetsUsed
 * @property {number} utilizationPercent
 * @property {number} wasteArea         m²
 * @property {number} kerfLoss          m²
 * @property {NestingConfig} config
 */

export {};
