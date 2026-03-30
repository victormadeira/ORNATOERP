/**
 * Seed: Armário Inferior 2 Portas — baseado no JSON v2.0 do usuário.
 *
 * SISTEMA DE COORDENADAS LOCAL POR PEÇA (do JSON):
 *   origin: canto inferior esquerdo frontal da face principal
 *   x = largura_ou_profundidade_da_peca
 *   y = comprimento_ou_altura_da_peca
 *   z = espessura
 *
 * CONVENÇÃO DO BANCO (DB):
 *   comprimento = dimensão MAIOR da peça
 *   largura     = dimensão MENOR da peça
 *   machining.x = posição ao longo do COMPRIMENTO
 *   machining.y = posição ao longo da LARGURA
 *
 * MAPEAMENTO POR TIPO DE PEÇA:
 *   Laterais (x=500 prof, y=720 alt): comp=720, larg=500
 *     JSON_center_y(0-720) → DB_x(0-comp), JSON_center_x(0-500) → DB_y(0-larg)
 *
 *   Base/Topo (x=770 larg, y=500 prof): comp=770, larg=500
 *     JSON_center_x(0-770) → DB_x(0-comp), JSON_center_y(0-500) → DB_y(0-larg)
 *
 *   Portas (x=397 larg, y=717 alt): comp=717, larg=397
 *     JSON_center_y(0-717) → DB_x(0-comp), JSON_center_x(0-397) → DB_y(0-larg)
 *
 * Todas as usinagens do JSON são face "A" = face='top' no DB.
 *
 * Dimensões armário: 800×720×500mm
 * Materiais: Carcaça MDF BP 15mm | Portas MDF 18mm | Fundo MDF 6mm
 */

import db from '../db.js';

const LOT_NAME = 'DEMO — Armário 2 Portas (CNC Completo)';

export function seedTestCabinet(userId = 1) {
    const existing = db.prepare("SELECT id FROM cnc_lotes WHERE nome = ?").get(LOT_NAME);
    if (existing) return existing.id;

    const loteResult = db.prepare(`
        INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, codigo, total_pecas, origem)
        VALUES (?, ?, 'Teste CNC', 'Armário 2 Portas', 'ARM-2P-001', 0, 'demo')
    `).run(userId, LOT_NAME);
    const loteId = Number(loteResult.lastInsertRowid);

    const ins = db.prepare(`
        INSERT INTO cnc_pecas (lote_id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
          produto_final, material, material_code, espessura, comprimento, largura, quantidade,
          borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento, machining_json, observacao,
          borda_cor_dir, borda_cor_esq, borda_cor_frontal, borda_cor_traseira)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const MOD = 'Armário Inferior 2 Portas';
    const MOD_ID = 1;
    const PROD = 'Armário 800×720×500';

    // ═══════════════════════════════════════════════════════════════
    // P01 — LATERAL ESQUERDA
    // JSON dims: x=500(prof) y=720(alt) z=15(esp)
    // DB: comp=720, larg=500, esp=15
    // Mapping: JSON_center_y → DB_x, JSON_center_x → DB_y
    // Todas face "A" → face='top'
    //
    // Usinagens:
    //   U01 Rasgo fundo: origin_x=491, origin_y=18, len=684, vertical(ao longo y)
    //     → DB: x=18+(684/2)=360, y=491, length=684, width=6
    //   U02 Confirmat base frontal:  cx=37, cy=7.5   → DB: x=7.5, y=37
    //   U03 Confirmat base traseiro: cx=463, cy=7.5   → DB: x=7.5, y=463
    //   U04 Confirmat topo frontal:  cx=37, cy=712.5  → DB: x=712.5, y=37
    //   U05 Confirmat topo traseiro: cx=463, cy=712.5  → DB: x=712.5, y=463
    //   U06 Suporte prat frontal:    cx=37, cy=352.5   → DB: x=352.5, y=37
    //   U07 Suporte prat traseiro:   cx=437, cy=352.5  → DB: x=352.5, y=437
    // ═══════════════════════════════════════════════════════════════
    const lateralWorkers = [
        // U01 Rasgo do fundo — 684mm vertical, a 491mm da frente
        { category: 'Transfer_vertical_saw_cut', face: 'top', x: 360, y: 491, depth: 8, length: 684, width: 6, tool_code: 'f_6mm' },
        // U02-U05 Confirmats (furo passante, depth=espessura=15)
        { category: 'transfer_hole', face: 'top', x: 7.5, y: 37, depth: 15, diameter: 5, tool_code: 'b_5mm' },
        { category: 'transfer_hole', face: 'top', x: 7.5, y: 463, depth: 15, diameter: 5, tool_code: 'b_5mm' },
        { category: 'transfer_hole', face: 'top', x: 712.5, y: 37, depth: 15, diameter: 5, tool_code: 'b_5mm' },
        { category: 'transfer_hole', face: 'top', x: 712.5, y: 463, depth: 15, diameter: 5, tool_code: 'b_5mm' },
        // U06-U07 Suporte prateleira (furo cego, depth=12)
        { category: 'transfer_hole_blind', face: 'top', x: 352.5, y: 37, depth: 12, diameter: 5, tool_code: 'b_5mm' },
        { category: 'transfer_hole_blind', face: 'top', x: 352.5, y: 437, depth: 12, diameter: 5, tool_code: 'b_5mm' },
    ];

    ins.run(loteId, 'ARM2P-P01', 'LAT-ESQ', 'Lateral esquerda', MOD, MOD_ID, PROD,
        'MDF BP Branco 15mm', 'MDF_15_BP_BRANCO', 15, 720, 500, 1,
        '', '', 'PVC_1MM', '', '',
        JSON.stringify({ workers: lateralWorkers }),
        'Lateral esquerda: 1 rasgo fundo + 4 confirmats + 2 suportes prateleira',
        '', '', 'Branco TX', ''
    );

    // ═══════════════════════════════════════════════════════════════
    // P02 — LATERAL DIREITA (mesmas usinagens — espelhada no armário mas usinagem idêntica)
    // ═══════════════════════════════════════════════════════════════
    ins.run(loteId, 'ARM2P-P02', 'LAT-DIR', 'Lateral direita', MOD, MOD_ID, PROD,
        'MDF BP Branco 15mm', 'MDF_15_BP_BRANCO', 15, 720, 500, 1,
        '', '', 'PVC_1MM', '', '',
        JSON.stringify({ workers: lateralWorkers }),
        'Lateral direita: 1 rasgo fundo + 4 confirmats + 2 suportes prateleira',
        '', '', 'Branco TX', ''
    );

    // ═══════════════════════════════════════════════════════════════
    // P03 — BASE
    // JSON dims: x=770(larg) y=500(prof) z=15(esp)
    // DB: comp=770, larg=500, esp=15
    // Mapping: JSON_center_x → DB_x (direto), JSON_center_y → DB_y (direto)
    // Todas face "A" → face='top'
    //
    // Usinagens:
    //   U01 Rasgo fundo: origin_x=18, origin_y=491, len=734, horizontal(ao longo x)
    //     → DB: x=18+(734/2)=385, y=491, length=734, width=6
    //   U02 Confirmat lat esq frontal:   cx=7.5, cy=37    → DB: x=7.5, y=37
    //   U03 Confirmat lat esq traseiro:  cx=7.5, cy=463   → DB: x=7.5, y=463
    //   U04 Confirmat lat dir frontal:   cx=762.5, cy=37  → DB: x=762.5, y=37
    //   U05 Confirmat lat dir traseiro:  cx=762.5, cy=463 → DB: x=762.5, y=463
    // ═══════════════════════════════════════════════════════════════
    const baseWorkers = [
        // U01 Rasgo do fundo horizontal
        { category: 'Transfer_vertical_saw_cut', face: 'top', x: 385, y: 491, depth: 8, length: 734, width: 6, tool_code: 'f_6mm' },
        // U02-U05 Confirmats (furos passantes pelo topo)
        { category: 'transfer_hole', face: 'top', x: 7.5, y: 37, depth: 15, diameter: 7, tool_code: 'b_7mm' },
        { category: 'transfer_hole', face: 'top', x: 7.5, y: 463, depth: 15, diameter: 7, tool_code: 'b_7mm' },
        { category: 'transfer_hole', face: 'top', x: 762.5, y: 37, depth: 15, diameter: 7, tool_code: 'b_7mm' },
        { category: 'transfer_hole', face: 'top', x: 762.5, y: 463, depth: 15, diameter: 7, tool_code: 'b_7mm' },
    ];

    ins.run(loteId, 'ARM2P-P03', 'BASE', 'Base', MOD, MOD_ID, PROD,
        'MDF BP Branco 15mm', 'MDF_15_BP_BRANCO', 15, 770, 500, 1,
        '', '', 'PVC_1MM', '', '',
        JSON.stringify({ workers: baseWorkers }),
        'Base: 1 rasgo fundo + 4 confirmats (todos face A/top)',
        '', '', 'Branco TX', ''
    );

    // ═══════════════════════════════════════════════════════════════
    // P04 — TOPO (mesmas usinagens da base)
    // ═══════════════════════════════════════════════════════════════
    ins.run(loteId, 'ARM2P-P04', 'TOPO', 'Topo', MOD, MOD_ID, PROD,
        'MDF BP Branco 15mm', 'MDF_15_BP_BRANCO', 15, 770, 500, 1,
        '', '', 'PVC_1MM', '', '',
        JSON.stringify({ workers: baseWorkers }),
        'Topo: 1 rasgo fundo + 4 confirmats (todos face A/top)',
        '', '', 'Branco TX', ''
    );

    // ═══════════════════════════════════════════════════════════════
    // P05 — PRATELEIRA MÓVEL (768×470×15) — sem usinagem
    // ═══════════════════════════════════════════════════════════════
    ins.run(loteId, 'ARM2P-P05', 'PRAT-01', 'Prateleira móvel', MOD, MOD_ID, PROD,
        'MDF BP Branco 15mm', 'MDF_15_BP_BRANCO', 15, 768, 470, 1,
        '', '', 'PVC_1MM', '', '',
        JSON.stringify({ workers: [] }),
        'Prateleira móvel sobre 4 pinos — sem usinagem CNC',
        '', '', 'Branco TX', ''
    );

    // ═══════════════════════════════════════════════════════════════
    // P06 — FUNDO ENCAIXADO (764×684×6) — sem usinagem
    // ═══════════════════════════════════════════════════════════════
    ins.run(loteId, 'ARM2P-P06', 'FUNDO', 'Fundo encaixado', MOD, MOD_ID, PROD,
        'MDF Branco 6mm', 'MDF_6_BRANCO', 6, 764, 684, 1,
        '', '', '', '', '',
        JSON.stringify({ workers: [] }),
        'Fundo 6mm encaixado nos rasgos',
        '', '', '', ''
    );

    // ═══════════════════════════════════════════════════════════════
    // P07 — PORTA ESQUERDA
    // JSON dims: x=397(larg) y=717(alt) z=18(esp)
    // DB: comp=717, larg=397, esp=18
    // Mapping: JSON_center_y → DB_x, JSON_center_x → DB_y
    // Face "A" → face='top'
    //
    // Usinagens (cup_hole → transfer_hole_blind ⌀35):
    //   U01 Caneco sup: cx=378.5, cy=100  → DB: x=100, y=378.5
    //   U02 Caneco inf: cx=378.5, cy=617  → DB: x=617, y=378.5
    // ═══════════════════════════════════════════════════════════════
    ins.run(loteId, 'ARM2P-P07', 'PORTA-ESQ', 'Porta esquerda', MOD, MOD_ID, PROD,
        'MDF 18mm', 'MDF_18', 18, 717, 397, 1,
        'PVC_1MM', 'PVC_1MM', 'PVC_1MM', 'PVC_1MM', '',
        JSON.stringify({ workers: [
            { category: 'transfer_hole_blind', face: 'top', x: 100, y: 378.5, depth: 13, diameter: 35, tool_code: 'b_35mm' },
            { category: 'transfer_hole_blind', face: 'top', x: 617, y: 378.5, depth: 13, diameter: 35, tool_code: 'b_35mm' },
        ]}),
        'Porta esquerda — 2 canecos ⌀35mm (dobradiça 110°)',
        'Branco TX', 'Branco TX', 'Branco TX', 'Branco TX'
    );

    // ═══════════════════════════════════════════════════════════════
    // P08 — PORTA DIREITA (espelhada)
    // Mapping: JSON_center_y → DB_x, JSON_center_x → DB_y
    //   U01 Caneco sup: cx=18.5, cy=100  → DB: x=100, y=18.5
    //   U02 Caneco inf: cx=18.5, cy=617  → DB: x=617, y=18.5
    // ═══════════════════════════════════════════════════════════════
    ins.run(loteId, 'ARM2P-P08', 'PORTA-DIR', 'Porta direita', MOD, MOD_ID, PROD,
        'MDF 18mm', 'MDF_18', 18, 717, 397, 1,
        'PVC_1MM', 'PVC_1MM', 'PVC_1MM', 'PVC_1MM', '',
        JSON.stringify({ workers: [
            { category: 'transfer_hole_blind', face: 'top', x: 100, y: 18.5, depth: 13, diameter: 35, tool_code: 'b_35mm' },
            { category: 'transfer_hole_blind', face: 'top', x: 617, y: 18.5, depth: 13, diameter: 35, tool_code: 'b_35mm' },
        ]}),
        'Porta direita — 2 canecos ⌀35mm (dobradiça 110°, espelhada)',
        'Branco TX', 'Branco TX', 'Branco TX', 'Branco TX'
    );

    // Atualizar total de peças
    const count = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(loteId).c;
    db.prepare('UPDATE cnc_lotes SET total_pecas = ? WHERE id = ?').run(count, loteId);

    return loteId;
}
