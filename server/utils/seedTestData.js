/**
 * Seed test data for CNC module — creates complete lots with realistic pieces.
 * Includes a full cabinet with ALL structural pieces, machining operations, and edge bands.
 */

import db from '../db.js';

const TEST_LOT_NAME = 'DEMO — Cozinha Moderna';

export function seedTestData(userId = 1) {
    // Check if already seeded
    const existing = db.prepare("SELECT id FROM cnc_lotes WHERE nome = ?").get(TEST_LOT_NAME);
    if (existing) {
        return existing.id;
    }

    // Create lot
    const loteResult = db.prepare(`
        INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, codigo, total_pecas, origem)
        VALUES (?, ?, 'João Silva', 'Cozinha Planejada', 'DEMO-001', 0, 'demo')
    `).run(userId, TEST_LOT_NAME);
    const loteId = Number(loteResult.lastInsertRowid);

    const insertPeca = db.prepare(`
        INSERT INTO cnc_pecas (lote_id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
          produto_final, material, material_code, espessura, comprimento, largura, quantidade,
          borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento, machining_json, observacao,
          borda_cor_dir, borda_cor_esq, borda_cor_frontal, borda_cor_traseira)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    // ════════════════════════════════════════════════════════════════
    // MÓDULO 1 — Armário Inferior com 3 Gavetas (600mm largura)
    // Medidas reais de um armário de cozinha baixo padrão
    // Altura corpo: 720mm | Profundidade: 560mm | Largura: 600mm
    // Gaveta 1 (topo): frente 120mm | Gaveta 2 (meio): frente 180mm | Gaveta 3 (baixo): frente 360mm
    // ════════════════════════════════════════════════════════════════
    const MOD1 = 'Armário Inferior 3 Gavetas';
    const MOD1_ID = 1;
    const PROD1 = 'Balcão Cozinha 600mm';
    const MDF18 = 'MDF 18mm Branco TX';
    const MDF18C = 'MDF_18_BRANCO_TX';
    const HDF6 = 'MDF 6mm Branco';
    const HDF6C = 'MDF_6_BRANCO';
    const HDF3 = 'HDF 3mm Branco';
    const HDF3C = 'HDF_3_BRANCO';

    // Largura interna = 600 - 2×18 = 564mm
    // Profundidade interna = 560 - 18(fundo descontado) = ~540mm útil
    // Rasgo fundo: 10mm da traseira, profundidade 8mm, largura 6mm (para fundo 6mm)

    const pieces = [
        // ── LATERAIS DO CORPO ──
        {
            pid: 'AI_LAT_DIR', code: 'AI_001', desc: 'Lateral Direita',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 720, larg: 560, qtd: 1,
            bDir: 'PVC_2MM', bEsq: '', bFront: 'PVC_2MM', bTras: '',
            bcDir: 'Branco TX', bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                // Minifix para base (2 furos)
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 50, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 510, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                // Minifix pinos laterais (para base)
                { category: 'transfer_hole', face: 'back', x: 37, y: 50, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'back', x: 37, y: 510, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                // Rasgo para fundo 6mm — 10mm da traseira, percorre toda a altura
                { category: 'Transfer_vertical_saw_cut', face: 'top', x: 10, y: 10, depth: 8, length: 700, width: 6, tool_code: 'f_6mm' },
                // Rasgos para corrediças das gavetas (3 pares) — profundidade 12.7mm, largura 12.7mm
                // Gaveta 1 (topo): centro a 660mm do chão (720-120/2)
                { category: 'transfer_slot', face: 'top', x: 50, y: 85, depth: 12.7, length: 450, width: 12.7, tool_code: 'f_12mm' },
                // Gaveta 2 (meio): centro a 480mm do chão
                { category: 'transfer_slot', face: 'top', x: 50, y: 245, depth: 12.7, length: 450, width: 12.7, tool_code: 'f_12mm' },
                // Gaveta 3 (baixo): centro a 200mm do chão
                { category: 'transfer_slot', face: 'top', x: 50, y: 520, depth: 12.7, length: 450, width: 12.7, tool_code: 'f_12mm' },
                // Furos para pés reguláveis (4 furos)
                { category: 'transfer_hole', face: 'bottom', x: 30, y: 50, depth: 12, diameter: 10, tool_code: 'b_10mm' },
                { category: 'transfer_hole', face: 'bottom', x: 30, y: 510, depth: 12, diameter: 10, tool_code: 'b_10mm' },
            ]},
            obs: 'Lateral com rasgo fundo 6mm + 3 rasgos corrediça + furos pés',
        },
        {
            pid: 'AI_LAT_ESQ', code: 'AI_002', desc: 'Lateral Esquerda',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 720, larg: 560, qtd: 1,
            bDir: '', bEsq: 'PVC_2MM', bFront: 'PVC_2MM', bTras: '',
            bcDir: null, bcEsq: 'Branco TX', bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 50, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 510, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                { category: 'transfer_hole', face: 'back', x: 37, y: 50, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'back', x: 37, y: 510, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                { category: 'Transfer_vertical_saw_cut', face: 'top', x: 10, y: 10, depth: 8, length: 700, width: 6, tool_code: 'f_6mm' },
                { category: 'transfer_slot', face: 'top', x: 50, y: 85, depth: 12.7, length: 450, width: 12.7, tool_code: 'f_12mm' },
                { category: 'transfer_slot', face: 'top', x: 50, y: 245, depth: 12.7, length: 450, width: 12.7, tool_code: 'f_12mm' },
                { category: 'transfer_slot', face: 'top', x: 50, y: 520, depth: 12.7, length: 450, width: 12.7, tool_code: 'f_12mm' },
                { category: 'transfer_hole', face: 'bottom', x: 30, y: 50, depth: 12, diameter: 10, tool_code: 'b_10mm' },
                { category: 'transfer_hole', face: 'bottom', x: 30, y: 510, depth: 12, diameter: 10, tool_code: 'b_10mm' },
            ]},
            obs: 'Espelho da lateral direita',
        },

        // ── BASE DO CORPO ──
        {
            pid: 'AI_BASE', code: 'AI_003', desc: 'Base',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 564, larg: 542, qtd: 1,
            bDir: '', bEsq: '', bFront: 'PVC_2MM', bTras: '',
            bcDir: null, bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                // Cavilhas laterais (4 furos de cada lado)
                { category: 'transfer_hole', face: 'top', x: 20, y: 37, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 544, y: 37, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 20, y: 505, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 544, y: 505, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                // Rasgo para fundo
                { category: 'Transfer_vertical_saw_cut', face: 'top', x: 0, y: 10, depth: 8, length: 564, width: 6, tool_code: 'f_6mm' },
            ]},
            obs: 'Base com cavilhas e rasgo fundo',
        },

        // ── TRAVESSA SUPERIOR (topo interno, não fica visível) ──
        {
            pid: 'AI_TRAV_SUP', code: 'AI_004', desc: 'Travessa Superior',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 564, larg: 80, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole', face: 'top', x: 20, y: 40, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 544, y: 40, depth: 18, diameter: 8, tool_code: 'b_8mm' },
            ]},
            obs: 'Travessa estrutural superior',
        },

        // ── TRAVESSA TRASEIRA (reforço traseiro) ──
        {
            pid: 'AI_TRAV_TRAS', code: 'AI_005', desc: 'Travessa Traseira',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 564, larg: 100, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole', face: 'top', x: 20, y: 50, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 544, y: 50, depth: 18, diameter: 8, tool_code: 'b_8mm' },
            ]},
            obs: 'Reforço estrutural traseiro',
        },

        // ── FUNDO DO CORPO (6mm encaixado no rasgo) ──
        {
            pid: 'AI_FUNDO', code: 'AI_006', desc: 'Fundo 6mm',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: HDF6, matCode: HDF6C, esp: 6,
            comp: 570, larg: 716, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [] },
            obs: 'Fundo encaixado no rasgo das laterais e base',
        },

        // ══════════════════════════════════════════════════════════
        // GAVETA 1 (topo) — frente 120mm, caixa de gaveta com corrediça
        // Caixa: 500mm profundidade × 524mm largura × 86mm altura (interna)
        // ══════════════════════════════════════════════════════════

        // ── FRENTE GAVETA 1 ──
        {
            pid: 'AI_FG1', code: 'AI_010', desc: 'Frente Gaveta 1',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 596, larg: 117, qtd: 1,
            bDir: 'PVC_2MM', bEsq: 'PVC_2MM', bFront: 'PVC_2MM', bTras: 'PVC_2MM',
            bcDir: 'Cinza Grafite', bcEsq: 'Cinza Grafite', bcFront: 'Cinza Grafite', bcTras: 'Cinza Grafite',
            machining: { workers: [
                // Furo puxador central
                { category: 'transfer_hole', face: 'front', x: 298, y: 58, depth: 18, diameter: 5, tool_code: 'b_5mm' },
                // Furos de fixação na caixa (parafusos reguláveis)
                { category: 'transfer_hole_blind', face: 'back', x: 80, y: 40, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 516, y: 40, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 80, y: 77, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 516, y: 77, depth: 10, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: '4 lados fitados Cinza Grafite + furo puxador',
        },

        // ── LATERAIS CAIXA GAVETA 1 (par) ──
        {
            pid: 'AI_LG1', code: 'AI_011', desc: 'Lateral Gaveta 1',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 500, larg: 86, qtd: 2,
            bDir: '', bEsq: '', bFront: 'PVC_1MM', bTras: '',
            bcDir: null, bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                // Rasgo para fundo de gaveta (3mm de HDF) — na face inferior, 8mm do fundo
                { category: 'Transfer_vertical_saw_cut', face: 'bottom', x: 10, y: 8, depth: 8, length: 480, width: 3, tool_code: 'f_3mm' },
                // Furos para fixação da frente (parafusos reguláveis)
                { category: 'transfer_hole', face: 'front', x: 250, y: 43, depth: 18, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: 'Com rasgo para fundo 3mm',
        },

        // ── TRASEIRA CAIXA GAVETA 1 ──
        {
            pid: 'AI_TG1', code: 'AI_012', desc: 'Traseira Gaveta 1',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 524, larg: 68, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [
                // Cavilhas nas laterais
                { category: 'transfer_hole', face: 'left', x: 34, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'left', x: 34, y: 48, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'right', x: 34, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'right', x: 34, y: 48, depth: 18, diameter: 8, tool_code: 'b_8mm' },
            ]},
            obs: 'Traseira caixa gaveta — altura descontada do fundo',
        },

        // ── FUNDO GAVETA 1 (3mm HDF) ──
        {
            pid: 'AI_FDG1', code: 'AI_013', desc: 'Fundo Gaveta 1',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: HDF3, matCode: HDF3C, esp: 3,
            comp: 528, larg: 496, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [] },
            obs: 'Fundo encaixado no rasgo das laterais',
        },

        // ══════════════════════════════════════════════════════════
        // GAVETA 2 (meio) — frente 180mm
        // Caixa: 500mm profundidade × 524mm largura × 146mm altura
        // ══════════════════════════════════════════════════════════

        {
            pid: 'AI_FG2', code: 'AI_020', desc: 'Frente Gaveta 2',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 596, larg: 177, qtd: 1,
            bDir: 'PVC_2MM', bEsq: 'PVC_2MM', bFront: 'PVC_2MM', bTras: 'PVC_2MM',
            bcDir: 'Cinza Grafite', bcEsq: 'Cinza Grafite', bcFront: 'Cinza Grafite', bcTras: 'Cinza Grafite',
            machining: { workers: [
                { category: 'transfer_hole', face: 'front', x: 298, y: 88, depth: 18, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 80, y: 60, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 516, y: 60, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 80, y: 117, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 516, y: 117, depth: 10, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: '4 lados fitados Cinza Grafite + puxador',
        },
        {
            pid: 'AI_LG2', code: 'AI_021', desc: 'Lateral Gaveta 2',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 500, larg: 146, qtd: 2,
            bDir: '', bEsq: '', bFront: 'PVC_1MM', bTras: '',
            bcDir: null, bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                { category: 'Transfer_vertical_saw_cut', face: 'bottom', x: 10, y: 8, depth: 8, length: 480, width: 3, tool_code: 'f_3mm' },
                { category: 'transfer_hole', face: 'front', x: 250, y: 73, depth: 18, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: 'Com rasgo fundo 3mm',
        },
        {
            pid: 'AI_TG2', code: 'AI_022', desc: 'Traseira Gaveta 2',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 524, larg: 128, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole', face: 'left', x: 64, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'left', x: 64, y: 108, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'right', x: 64, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'right', x: 64, y: 108, depth: 18, diameter: 8, tool_code: 'b_8mm' },
            ]},
            obs: 'Traseira gaveta 2',
        },
        {
            pid: 'AI_FDG2', code: 'AI_023', desc: 'Fundo Gaveta 2',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: HDF3, matCode: HDF3C, esp: 3,
            comp: 528, larg: 496, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [] },
            obs: 'Fundo gaveta 2',
        },

        // ══════════════════════════════════════════════════════════
        // GAVETA 3 (gavetão inferior) — frente 360mm
        // Caixa: 500mm profundidade × 524mm largura × 300mm altura
        // ══════════════════════════════════════════════════════════

        {
            pid: 'AI_FG3', code: 'AI_030', desc: 'Frente Gavetão',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 596, larg: 357, qtd: 1,
            bDir: 'PVC_2MM', bEsq: 'PVC_2MM', bFront: 'PVC_2MM', bTras: 'PVC_2MM',
            bcDir: 'Cinza Grafite', bcEsq: 'Cinza Grafite', bcFront: 'Cinza Grafite', bcTras: 'Cinza Grafite',
            machining: { workers: [
                { category: 'transfer_hole', face: 'front', x: 298, y: 178, depth: 18, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 80, y: 100, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 516, y: 100, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 80, y: 257, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'back', x: 516, y: 257, depth: 10, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: 'Gavetão grande, 4 lados Cinza Grafite',
        },
        {
            pid: 'AI_LG3', code: 'AI_031', desc: 'Lateral Gavetão',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 500, larg: 300, qtd: 2,
            bDir: '', bEsq: '', bFront: 'PVC_1MM', bTras: '',
            bcDir: null, bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                { category: 'Transfer_vertical_saw_cut', face: 'bottom', x: 10, y: 8, depth: 8, length: 480, width: 3, tool_code: 'f_3mm' },
                { category: 'transfer_hole', face: 'front', x: 250, y: 150, depth: 18, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: 'Lateral alta do gavetão com rasgo fundo',
        },
        {
            pid: 'AI_TG3', code: 'AI_032', desc: 'Traseira Gavetão',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 524, larg: 282, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole', face: 'left', x: 141, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'left', x: 141, y: 262, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'right', x: 141, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'right', x: 141, y: 262, depth: 18, diameter: 8, tool_code: 'b_8mm' },
            ]},
            obs: 'Traseira gavetão',
        },
        {
            pid: 'AI_FDG3', code: 'AI_033', desc: 'Fundo Gavetão',
            modulo: MOD1, modId: MOD1_ID, produto: PROD1,
            mat: HDF3, matCode: HDF3C, esp: 3,
            comp: 528, larg: 496, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [] },
            obs: 'Fundo gavetão',
        },

        // ════════════════════════════════════════════════════════════════
        // MÓDULO 2 — Armário Aéreo com 2 Portas (800mm largura)
        // Altura: 700mm | Profundidade: 330mm | Largura: 800mm
        // ════════════════════════════════════════════════════════════════

        {
            pid: 'AA_LAT_DIR', code: 'AA_001', desc: 'Lateral Direita',
            modulo: 'Armário Aéreo 2 Portas', modId: 2, produto: 'Aéreo 800mm',
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 700, larg: 330, qtd: 1,
            bDir: 'PVC_2MM', bEsq: '', bFront: 'PVC_2MM', bTras: '',
            bcDir: 'Branco TX', bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                // Minifix base e topo
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 50, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 280, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                { category: 'transfer_hole', face: 'back', x: 37, y: 50, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'back', x: 37, y: 280, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                // Rasgo fundo 3mm
                { category: 'Transfer_vertical_saw_cut', face: 'top', x: 10, y: 10, depth: 8, length: 680, width: 3, tool_code: 'f_3mm' },
                // Furos para prateleira regulável (coluna de furos a cada 32mm)
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 165, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 293, y: 165, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 197, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 293, y: 197, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 229, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 293, y: 229, depth: 10, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: 'Lateral com rasgo fundo + furos prateleira sistema 32',
        },
        {
            pid: 'AA_LAT_ESQ', code: 'AA_002', desc: 'Lateral Esquerda',
            modulo: 'Armário Aéreo 2 Portas', modId: 2, produto: 'Aéreo 800mm',
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 700, larg: 330, qtd: 1,
            bDir: '', bEsq: 'PVC_2MM', bFront: 'PVC_2MM', bTras: '',
            bcDir: null, bcEsq: 'Branco TX', bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 50, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 280, depth: 12.7, diameter: 15, tool_code: 'b_15mm' },
                { category: 'transfer_hole', face: 'back', x: 37, y: 50, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'back', x: 37, y: 280, depth: 30, diameter: 8, tool_code: 'b_8mm' },
                { category: 'Transfer_vertical_saw_cut', face: 'top', x: 10, y: 10, depth: 8, length: 680, width: 3, tool_code: 'f_3mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 165, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 293, y: 165, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 197, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 293, y: 197, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 37, y: 229, depth: 10, diameter: 5, tool_code: 'b_5mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 293, y: 229, depth: 10, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: 'Espelho da lateral direita',
        },
        {
            pid: 'AA_BASE', code: 'AA_003', desc: 'Base',
            modulo: 'Armário Aéreo 2 Portas', modId: 2, produto: 'Aéreo 800mm',
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 764, larg: 312, qtd: 1,
            bDir: '', bEsq: '', bFront: 'PVC_2MM', bTras: '',
            bcDir: null, bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole', face: 'top', x: 37, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 727, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 37, y: 292, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'top', x: 727, y: 292, depth: 18, diameter: 8, tool_code: 'b_8mm' },
            ]},
            obs: '',
        },
        {
            pid: 'AA_TOPO', code: 'AA_004', desc: 'Topo',
            modulo: 'Armário Aéreo 2 Portas', modId: 2, produto: 'Aéreo 800mm',
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 764, larg: 312, qtd: 1,
            bDir: '', bEsq: '', bFront: 'PVC_2MM', bTras: '',
            bcDir: null, bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [
                { category: 'transfer_hole', face: 'bottom', x: 37, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'bottom', x: 727, y: 20, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'bottom', x: 37, y: 292, depth: 18, diameter: 8, tool_code: 'b_8mm' },
                { category: 'transfer_hole', face: 'bottom', x: 727, y: 292, depth: 18, diameter: 8, tool_code: 'b_8mm' },
            ]},
            obs: '',
        },
        {
            pid: 'AA_PRAT', code: 'AA_005', desc: 'Prateleira',
            modulo: 'Armário Aéreo 2 Portas', modId: 2, produto: 'Aéreo 800mm',
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 760, larg: 290, qtd: 2,
            bDir: '', bEsq: '', bFront: 'PVC_2MM', bTras: '',
            bcDir: null, bcEsq: null, bcFront: 'Branco TX', bcTras: null,
            machining: { workers: [] },
            obs: 'Prateleira regulável',
        },
        // ── PORTAS AÉREO (2 portas de abrir) ──
        {
            pid: 'AA_PORTA', code: 'AA_006', desc: 'Porta',
            modulo: 'Armário Aéreo 2 Portas', modId: 2, produto: 'Aéreo 800mm',
            mat: MDF18, matCode: MDF18C, esp: 18,
            comp: 396, larg: 697, qtd: 2,
            bDir: 'PVC_2MM', bEsq: 'PVC_2MM', bFront: 'PVC_2MM', bTras: 'PVC_2MM',
            bcDir: 'Branco TX', bcEsq: 'Branco TX', bcFront: 'Branco TX', bcTras: 'Branco TX',
            machining: { workers: [
                // Dobradiças 35mm (caneco) — 2 por porta
                { category: 'transfer_hole_blind', face: 'top', x: 22, y: 120, depth: 12, diameter: 35, tool_code: 'b_35mm' },
                { category: 'transfer_hole_blind', face: 'top', x: 22, y: 577, depth: 12, diameter: 35, tool_code: 'b_35mm' },
                // Furo para puxador
                { category: 'transfer_hole', face: 'front', x: 370, y: 348, depth: 18, diameter: 5, tool_code: 'b_5mm' },
            ]},
            obs: '4 lados fitados + dobradiças 35mm + puxador',
        },
        // ── FUNDO AÉREO 3mm ──
        {
            pid: 'AA_FUNDO', code: 'AA_007', desc: 'Fundo 3mm',
            modulo: 'Armário Aéreo 2 Portas', modId: 2, produto: 'Aéreo 800mm',
            mat: HDF3, matCode: HDF3C, esp: 3,
            comp: 766, larg: 696, qtd: 1,
            bDir: '', bEsq: '', bFront: '', bTras: '',
            bcDir: null, bcEsq: null, bcFront: null, bcTras: null,
            machining: { workers: [] },
            obs: 'Fundo encaixado no rasgo',
        },
    ];

    const insertMany = db.transaction((items) => {
        for (const p of items) {
            insertPeca.run(
                loteId, p.pid, p.code, p.desc, p.modulo, p.modId,
                p.produto, p.mat, p.matCode, p.esp, p.comp, p.larg, p.qtd,
                p.bDir, p.bEsq, p.bFront, p.bTras, '',
                p.machining ? JSON.stringify(p.machining) : null,
                p.obs,
                p.bcDir ?? null, p.bcEsq ?? null, p.bcFront ?? null, p.bcTras ?? null
            );
        }
    });
    insertMany(pieces);

    // Update count
    const count = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(loteId).c;
    db.prepare('UPDATE cnc_lotes SET total_pecas = ? WHERE id = ?').run(count, loteId);

    console.log(`Test data seeded: ${count} pieces in lot "${TEST_LOT_NAME}" (id: ${loteId})`);
    return loteId;
}

// Allow running directly: node server/utils/seedTestData.js
if (process.argv[1]?.endsWith('seedTestData.js')) {
    seedTestData();
}
