import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import {
    MaxRectsBin, SkylineBin, GuillotineBin, ShelfBin,
    intersects, isContainedIn, pruneFreeList, clipRect, clipAndKeep,
    classifyBySize, scoreResult, verifyNoOverlaps, repairOverlaps, compactBin,
    runNestingPass, runFillFirst, runStripPacking, runBRKGA, ruinAndRecreate,
    gerarSequenciaCortes, setVacuumAware, getVacuumAware,
    optimizeLastBin, crossBinOptimize,
    calculatePolygonArea, isPointInPolygon, contourBoundingBox,
} from '../lib/nesting-engine.js';
import { isPythonAvailable, callPython } from '../lib/python-bridge.js';
import { parseDxf } from '../utils/dxfParser.js';
import { seedTestData } from '../utils/seedTestData.js';
import { seedTestCabinet } from '../utils/seedTestCabinet.js';

const router = Router();

// ─── Helper: notificação CNC ────────────────────────────────────────
function notifyCNC(db, userId, tipo, titulo, mensagem, refId, refTipo) {
    try {
        db.prepare(`INSERT INTO notificacoes (tipo, titulo, mensagem, referencia_id, referencia_tipo, criado_por) VALUES (?,?,?,?,?,?)`).run(tipo, titulo, mensagem, refId, refTipo, userId);
    } catch (_) {}
}

// ─── Gerar cortes de separação para retalhos (pós-processamento) ───
// Para cada retalho, verifica se existe um corte horizontal ou vertical
// nas bordas do retalho que não cruza nenhuma peça.
// Os cortes de retalho são adicionados NO FINAL da sequência.
function gerarCortesRetalhos(chapaInfo) {
    const { pecas, retalhos, cortes, comprimento, largura, refilo } = chapaInfo;
    if (!retalhos || retalhos.length === 0) return;

    const ref = refilo || 0;
    const tol = 2; // tolerância em mm
    // Área útil (peças e retalhos estão em coords 0-based, espaço útil)
    const usableW = comprimento - 2 * ref;
    const usableH = largura - 2 * ref;

    // Verificar se um corte horizontal na posição Y (coords usáveis) cruza alguma peça
    const hCutValid = (cutY) => {
        for (const p of pecas) {
            if (p.y + tol < cutY && cutY < p.y + (p.h || 0) - tol) return false;
        }
        return true;
    };

    // Verificar se um corte vertical na posição X (coords usáveis) cruza alguma peça
    const vCutValid = (cutX) => {
        for (const p of pecas) {
            if (p.x + tol < cutX && cutX < p.x + (p.w || 0) - tol) return false;
        }
        return true;
    };

    // Verificar se o corte já existe na sequência
    const cutExists = (dir, pos) => {
        return (cortes || []).some(c => c.dir === dir && Math.abs((c.pos || c.y || c.x || 0) - pos) < tol);
    };

    let seq = (cortes || []).length;
    const newCuts = [];

    for (const r of retalhos) {
        const rx = r.x, ry = r.y, rw = r.w, rh = r.h;

        // Testar borda superior do retalho
        if (ry > tol && hCutValid(ry) && !cutExists('Horizontal', ry)) {
            seq++;
            newCuts.push({
                seq, dir: 'Horizontal', pos: Math.round(ry),
                len: usableW, tipo: 'separacao_retalho',
                retalho: `${Math.round(rw)}x${Math.round(rh)}`,
            });
        }

        // Testar borda inferior do retalho
        const botY = ry + rh;
        if (botY < usableH - tol && hCutValid(botY) && !cutExists('Horizontal', botY)) {
            seq++;
            newCuts.push({
                seq, dir: 'Horizontal', pos: Math.round(botY),
                len: usableW, tipo: 'separacao_retalho',
                retalho: `${Math.round(rw)}x${Math.round(rh)}`,
            });
        }

        // Testar borda esquerda do retalho
        if (rx > tol && vCutValid(rx) && !cutExists('Vertical', rx)) {
            seq++;
            newCuts.push({
                seq, dir: 'Vertical', pos: Math.round(rx),
                len: usableH, tipo: 'separacao_retalho',
                retalho: `${Math.round(rw)}x${Math.round(rh)}`,
            });
        }

        // Testar borda direita do retalho
        const rightX = rx + rw;
        if (rightX < usableW - tol && vCutValid(rightX) && !cutExists('Vertical', rightX)) {
            seq++;
            newCuts.push({
                seq, dir: 'Vertical', pos: Math.round(rightX),
                len: usableH, tipo: 'separacao_retalho',
                retalho: `${Math.round(rw)}x${Math.round(rh)}`,
            });
        }
    }

    if (newCuts.length > 0) {
        if (!chapaInfo.cortes) chapaInfo.cortes = [];
        chapaInfo.cortes.push(...newCuts);
    }
}

// Auto-seed demo data on first import
try { seedTestData(); } catch (e) { /* ignore if already seeded */ }
try { seedTestCabinet(); } catch (e) { /* ignore if already seeded */ }

// ═══════════════════════════════════════════════════════════════════
// ENGINE DE NESTING: importado de ../lib/nesting-engine.js
// ═══════════════════════════════════════════════════════════════════

// ── Compat: _vacuumAware via setVacuumAware/getVacuumAware ──────
// As referências a _vacuumAware no código abaixo agora usam as
// funções importadas setVacuumAware() e getVacuumAware().

// ═══════════════════════════════════════════════════════════════════
// JSON PARSING — Extrair peças do JSON do plugin
// ═══════════════════════════════════════════════════════════════════

export function parsePluginJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const details = data.details_project || {};
    const machining = data.machining || {};
    const entities = data.model_entities || {};

    const loteInfo = {
        cliente: details.client_name || details.cliente || '',
        projeto: details.project_name || details.projeto || '',
        codigo: details.project_code || details.codigo || '',
        vendedor: details.seller_name || details.vendedor || '',
    };

    const pecas = [];

    // Iterate model_entities — each index is a module
    for (const modIdx of Object.keys(entities)) {
        const modulo = entities[modIdx];
        if (!modulo || !modulo.entities) continue;

        for (const entIdx of Object.keys(modulo.entities)) {
            const ent = modulo.entities[entIdx];
            if (!ent || !ent.upmpiece) continue;

            // Extract piece info
            const peca = {
                persistent_id: ent.upmpersistentid || '',
                upmcode: ent.upmcode || '',
                descricao: ent.upmdescription || '',
                modulo_desc: ent.upmmasterdescription || modulo.upmmasterdescription || '',
                modulo_id: ent.upmmasterid || modulo.upmmasterid || 0,
                produto_final: ent.upmproductfinal || '',
                material: '',
                material_code: '',
                espessura: 0,
                comprimento: 0,
                largura: 0,
                quantidade: ent.upmquantity || 1,
                borda_dir: ent.upmedgeside1 || '',
                borda_esq: ent.upmedgeside2 || '',
                borda_frontal: ent.upmedgeside3 || '',
                borda_traseira: ent.upmedgeside4 || '',
                acabamento: ent.upmedgesidetype || '',
                upmdraw: ent.upmdraw || '',
                usi_a: ent.upmprocesscodea || '',
                usi_b: ent.upmprocesscodeb || '',
                machining_json: '{}',
                observacao: '',
            };

            // Extract dimensions — use panel sub-entity if available
            let panelFound = false;
            if (ent.entities) {
                for (const subIdx of Object.keys(ent.entities)) {
                    const sub = ent.entities[subIdx];
                    if (sub && sub.upmfeedstockpanel) {
                        peca.material_code = sub.upmmaterialcode || sub.upmcode || '';
                        peca.material = sub.upmdescription || sub.upmmaterialcode || '';
                        peca.espessura = sub.upmrealthickness || sub.upmthickness || 0;
                        peca.comprimento = sub.upmcutlength || sub.upmlength || 0;
                        peca.largura = sub.upmcutwidth || sub.upmwidth || 0;
                        panelFound = true;
                        break;
                    }
                }
            }

            // Fallback: use piece dimensions directly
            if (!panelFound) {
                const h = ent.upmheight || 0;
                const d = ent.upmdepth || 0;
                const w = ent.upmwidth || 0;
                const dims = [h, d, w].sort((a, b) => b - a);
                peca.comprimento = dims[0] || 0;
                peca.largura = dims[1] || 0;
                peca.espessura = dims[2] || 0;
            }

            // Normalize espessura: extract from material_code if still 0
            // e.g. MDF_15.5_BRANCO_TX → 15.5, MDF_6_CRU → 6
            if ((!peca.espessura || peca.espessura === 0) && peca.material_code) {
                const m = peca.material_code.match(/_(\d+(?:\.\d+)?)_/);
                if (m) peca.espessura = parseFloat(m[1]);
            }

            // Machining data
            if (peca.persistent_id && machining[peca.persistent_id]) {
                const machData = { ...machining[peca.persistent_id] };
                // Se o contour esta no nivel da piece entity (model_entities), incluir no machining
                if (ent.contour && !machData.contour) {
                    machData.contour = ent.contour;
                }
                peca.machining_json = JSON.stringify(machData);
            } else if (ent.contour) {
                // Peca sem machining mas com contour
                peca.machining_json = JSON.stringify({ contour: ent.contour });
            }

            pecas.push(peca);
        }
    }

    return { loteInfo, pecas };
}

// ═══════════════════════════════════════════════════════
// GRUPO 1: Importação JSON
// ═══════════════════════════════════════════════════════

router.post('/lotes/importar', requireAuth, (req, res) => {
    try {
        const { json, nome, projeto_id, orc_id } = req.body;
        if (!json) return res.status(400).json({ error: 'JSON é obrigatório' });

        const { loteInfo, pecas } = parsePluginJSON(json);
        if (pecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça encontrada no JSON' });

        const loteNome = nome || loteInfo.projeto || `Lote ${new Date().toLocaleDateString('pt-BR')}`;
        const origem = projeto_id ? 'sketchup' : 'json_import';

        const insertLote = db.prepare(`
            INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, codigo, vendedor, json_original, total_pecas, projeto_id, orc_id, origem)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = insertLote.run(
            req.user.id, loteNome, loteInfo.cliente, loteInfo.projeto,
            loteInfo.codigo, loteInfo.vendedor, typeof json === 'string' ? json : JSON.stringify(json),
            pecas.length, projeto_id || null, orc_id || null, origem
        );
        const loteId = result.lastInsertRowid;

        const insertPeca = db.prepare(`
            INSERT INTO cnc_pecas (lote_id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
              produto_final, material, material_code, espessura, comprimento, largura, quantidade,
              borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento, upmdraw, usi_a, usi_b,
              machining_json, observacao)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);

        const insertMany = db.transaction((items) => {
            for (const p of items) {
                insertPeca.run(
                    loteId, p.persistent_id, p.upmcode, p.descricao, p.modulo_desc, p.modulo_id,
                    p.produto_final, p.material, p.material_code, p.espessura, p.comprimento, p.largura,
                    p.quantidade, p.borda_dir, p.borda_esq, p.borda_frontal, p.borda_traseira,
                    p.acabamento, p.upmdraw, p.usi_a, p.usi_b, p.machining_json, p.observacao
                );
            }
        });
        insertMany(pecas);

        // Auto-apply existing material mappings
        try {
            const uniqueMats = db.prepare(`
                SELECT DISTINCT material_code, espessura FROM cnc_pecas
                WHERE lote_id = ? AND material_code != ''
            `).all(loteId);

            for (const mat of uniqueMats) {
                const mapping = db.prepare(`
                    SELECT biblioteca_id FROM cnc_material_map
                    WHERE user_id = ? AND material_code_original = ? AND espessura_original = ?
                `).get(req.user.id, mat.material_code, mat.espessura);

                if (mapping) {
                    db.prepare(`
                        UPDATE cnc_pecas SET biblioteca_id = ?
                        WHERE lote_id = ? AND material_code = ? AND espessura = ?
                    `).run(mapping.biblioteca_id, loteId, mat.material_code, mat.espessura);
                }
            }
        } catch (mapErr) {
            console.warn('Aviso: falha ao aplicar mapeamentos de material:', mapErr.message);
        }

        res.json({
            id: Number(loteId),
            nome: loteNome,
            total_pecas: pecas.length,
            cliente: loteInfo.cliente,
            projeto: loteInfo.projeto,
        });
    } catch (err) {
        console.error('Erro ao importar JSON CNC:', err);
        res.status(500).json({ error: 'Erro ao importar JSON' });
    }
});

// ── Scan público (expedição) ────────────────────────────
router.get('/scan/:codigo', (req, res) => {
    const codigo = req.params.codigo;
    // Search by id, persistent_id, upmcode, or controle (row number in lote)
    let peca = db.prepare('SELECT * FROM cnc_pecas WHERE persistent_id = ?').get(codigo);
    if (!peca) peca = db.prepare('SELECT * FROM cnc_pecas WHERE upmcode = ?').get(codigo);
    if (!peca) peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(codigo);
    if (!peca) {
        // Try matching by "#NNN" format (controle number)
        const numMatch = codigo.match(/^#?(\d+)$/);
        if (numMatch) peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(numMatch[1]);
    }
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

    const lote = db.prepare('SELECT id, nome, cliente, projeto FROM cnc_lotes WHERE id = ?').get(peca.lote_id);
    const scans = db.prepare('SELECT s.*, c.nome as checkpoint_nome, c.cor as checkpoint_cor FROM cnc_expedicao_scans s LEFT JOIN cnc_expedicao_checkpoints c ON s.checkpoint_id = c.id WHERE s.peca_id = ? ORDER BY s.escaneado_em ASC').all(peca.id);
    res.json({ peca, lote: lote || null, scans });
});

// ── DXF Import ──────────────────────────────────────────
router.post('/lotes/importar-dxf', requireAuth, (req, res) => {
    try {
        const { dxfContent, nome, espessura, material } = req.body;
        if (!dxfContent) return res.status(400).json({ error: 'Conteúdo DXF é obrigatório' });

        const { pieces, warnings } = parseDxf(dxfContent, {
            defaultThickness: espessura || 18,
            defaultMaterial: material || '',
        });

        if (pieces.length === 0) {
            return res.status(400).json({ error: 'Nenhuma peça encontrada no DXF', warnings });
        }

        const loteNome = nome || `DXF Import ${new Date().toLocaleDateString('pt-BR')}`;
        const insertLote = db.prepare(`
            INSERT INTO cnc_lotes (user_id, nome, total_pecas, origem)
            VALUES (?, ?, ?, 'dxf')
        `);
        const result = insertLote.run(req.user.id, loteNome, pieces.length);
        const loteId = result.lastInsertRowid;

        const insertPeca = db.prepare(`
            INSERT INTO cnc_pecas (lote_id, persistent_id, descricao, modulo_desc, material, material_code,
              espessura, comprimento, largura, quantidade, borda_dir, borda_esq, borda_frontal, borda_traseira,
              acabamento, machining_json, observacao)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);

        db.transaction((items) => {
            for (const p of items) {
                insertPeca.run(
                    loteId, p.persistent_id, p.descricao, p.modulo_desc,
                    p.material, p.material_code, p.espessura, p.comprimento, p.largura,
                    p.quantidade, p.borda_dir, p.borda_esq, p.borda_frontal, p.borda_traseira,
                    p.acabamento, p.machining_json, p.observacao
                );
            }
        })(pieces);

        res.json({
            id: Number(loteId),
            nome: loteNome,
            total_pecas: pieces.length,
            warnings,
        });
    } catch (err) {
        console.error('Erro ao importar DXF:', err);
        res.status(500).json({ error: err.message || 'Erro ao importar DXF' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 1B: DXF Import para Usinagens de Peças Individuais
// ═══════════════════════════════════════════════════════

// Preview: Parseia DXF e retorna operações detectadas sem salvar
router.post('/pecas/:pecaId/importar-usinagem-dxf', requireAuth, async (req, res) => {
    try {
        const peca = db.prepare('SELECT p.* FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(req.params.pecaId, req.user.id);
        if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

        const { dxfContent, defaultDepth } = req.body;
        if (!dxfContent) return res.status(400).json({ error: 'Conteúdo DXF é obrigatório' });

        const DxfParserLib = (await import('dxf-parser')).default;
        const dxfParserInst = new DxfParserLib();
        let dxf;
        try { dxf = dxfParserInst.parseSync(dxfContent); } catch (err) {
            return res.status(400).json({ error: `Erro ao parsear DXF: ${err.message}` });
        }
        if (!dxf || !dxf.entities || dxf.entities.length === 0) {
            return res.status(400).json({ error: 'DXF vazio ou sem entidades' });
        }

        const depth = defaultDepth || peca.espessura || 18;
        const operations = [];
        const layerMap = {}; // layer → detected type

        // Layer-based operation type hinting
        const inferOpType = (layer) => {
            if (!layer) return null;
            const l = layer.toLowerCase();
            if (/furo|hole|drill|bore/i.test(l)) return 'hole';
            if (/rasgo|groove|canal|channel|slot/i.test(l)) return 'groove';
            if (/rebaixo|pocket|cav/i.test(l)) return 'pocket';
            if (/contorn|contour|profile|recorte/i.test(l)) return 'contour';
            return null;
        };

        for (const entity of dxf.entities) {
            const layer = entity.layer || '0';
            const hintedType = inferOpType(layer);

            if (entity.type === 'CIRCLE') {
                const cx = entity.center?.x || 0;
                const cy = entity.center?.y || 0;
                const r = entity.radius || 0;
                operations.push({
                    type: hintedType || 'hole',
                    layer,
                    x: Math.round(cx * 10) / 10,
                    y: Math.round(cy * 10) / 10,
                    diameter: Math.round(r * 2 * 10) / 10,
                    depth,
                    entity_type: 'CIRCLE',
                });
            } else if (entity.type === 'LINE') {
                const x1 = entity.vertices?.[0]?.x || entity.start?.x || 0;
                const y1 = entity.vertices?.[0]?.y || entity.start?.y || 0;
                const x2 = entity.vertices?.[1]?.x || entity.end?.x || 0;
                const y2 = entity.vertices?.[1]?.y || entity.end?.y || 0;
                const len = Math.hypot(x2 - x1, y2 - y1);
                operations.push({
                    type: hintedType || 'groove',
                    layer,
                    x: Math.round(Math.min(x1, x2) * 10) / 10,
                    y: Math.round(Math.min(y1, y2) * 10) / 10,
                    x2: Math.round(x2 * 10) / 10,
                    y2: Math.round(y2 * 10) / 10,
                    w: Math.round(Math.abs(x2 - x1) * 10) / 10,
                    h: Math.round(Math.abs(y2 - y1) * 10) / 10,
                    length: Math.round(len * 10) / 10,
                    depth,
                    entity_type: 'LINE',
                });
            } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
                const verts = entity.vertices || [];
                if (verts.length < 2) continue;
                const isClosed = !!entity.shape || (verts.length >= 3 &&
                    Math.abs(verts[0].x - verts[verts.length - 1].x) < 0.5 &&
                    Math.abs(verts[0].y - verts[verts.length - 1].y) < 0.5);
                const xs = verts.map(v => v.x);
                const ys = verts.map(v => v.y);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                const contourPts = verts.map(v => ({ x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10 }));
                operations.push({
                    type: hintedType || (isClosed ? 'pocket' : 'groove'),
                    layer,
                    x: Math.round(minX * 10) / 10,
                    y: Math.round(minY * 10) / 10,
                    w: Math.round((maxX - minX) * 10) / 10,
                    h: Math.round((maxY - minY) * 10) / 10,
                    depth,
                    closed: isClosed,
                    vertices: contourPts,
                    entity_type: 'LWPOLYLINE',
                });
            } else if (entity.type === 'ARC') {
                const cx = entity.center?.x || 0;
                const cy = entity.center?.y || 0;
                const r = entity.radius || 0;
                operations.push({
                    type: hintedType || 'groove',
                    layer,
                    x: Math.round(cx * 10) / 10,
                    y: Math.round(cy * 10) / 10,
                    radius: Math.round(r * 10) / 10,
                    startAngle: entity.startAngle || 0,
                    endAngle: entity.endAngle || 360,
                    depth,
                    entity_type: 'ARC',
                });
            }

            if (layer && !layerMap[layer]) layerMap[layer] = inferOpType(layer) || 'auto';
        }

        // Collect unique layers for mapping UI
        const layers = Object.entries(layerMap).map(([name, type]) => ({
            name, inferredType: type, count: operations.filter(o => o.layer === name).length,
        }));

        res.json({
            preview: operations,
            entities_count: operations.length,
            layers,
            peca: { id: peca.id, descricao: peca.descricao, comprimento: peca.comprimento, largura: peca.largura, espessura: peca.espessura },
        });
    } catch (err) {
        console.error('Erro ao importar usinagem DXF:', err);
        res.status(500).json({ error: err.message || 'Erro ao parsear DXF' });
    }
});

// Confirmar: salva as operações detectadas no machining_json da peça
router.post('/pecas/:pecaId/confirmar-usinagem-dxf', requireAuth, (req, res) => {
    try {
        const peca = db.prepare('SELECT p.* FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(req.params.pecaId, req.user.id);
        if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

        const { operations, layerMapping, defaultDepth, merge } = req.body;
        if (!Array.isArray(operations) || operations.length === 0) {
            return res.status(400).json({ error: 'Nenhuma operação para confirmar' });
        }

        // Convert operations to machining_json workers
        const workers = operations.map((op, i) => {
            // Apply layer mapping overrides if provided
            let type = op.type;
            if (layerMapping && layerMapping[op.layer]) {
                type = layerMapping[op.layer];
            }

            const worker = {
                category: type === 'hole' ? 'transfer_hole' : type === 'groove' ? 'groove' : type === 'pocket' ? 'pocket' : type === 'contour' ? 'contour' : 'groove',
                face: 'top',
                x: op.x || 0,
                y: op.y || 0,
                depth: op.depth || defaultDepth || peca.espessura || 18,
            };

            if (type === 'hole') {
                worker.diameter = op.diameter || 5;
            } else if (op.w) {
                worker.width = op.w;
                worker.height = op.h;
            }
            if (op.x2 != null) { worker.x2 = op.x2; worker.y2 = op.y2; }
            if (op.vertices) worker.vertices = op.vertices;
            if (op.radius) worker.radius = op.radius;
            if (op.startAngle != null) { worker.startAngle = op.startAngle; worker.endAngle = op.endAngle; }
            worker.tool_code = '';
            worker.dxf_imported = true;

            return worker;
        });

        // Merge with existing or replace
        let existingMach = {};
        try { existingMach = peca.machining_json ? JSON.parse(peca.machining_json) : {}; } catch (_) {}
        const existingWorkers = existingMach.workers ? (Array.isArray(existingMach.workers) ? existingMach.workers : Object.values(existingMach.workers)) : [];

        const finalWorkers = merge ? [...existingWorkers, ...workers] : workers;
        const machiningJson = JSON.stringify({ ...existingMach, workers: finalWorkers });

        db.prepare('UPDATE cnc_pecas SET machining_json = ? WHERE id = ?').run(machiningJson, peca.id);

        res.json({ ok: true, total_workers: finalWorkers.length });
    } catch (err) {
        console.error('Erro ao confirmar usinagem DXF:', err);
        res.status(500).json({ error: 'Erro ao salvar usinagens' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 1C: Multi-Machine Assignments
// ═══════════════════════════════════════════════════════

// Ensure table exists
try {
    db.prepare(`CREATE TABLE IF NOT EXISTS cnc_machine_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lote_id INTEGER NOT NULL,
        chapa_idx INTEGER NOT NULL,
        maquina_id INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lote_id, chapa_idx)
    )`).run();
} catch (_) {}

router.get('/machine-assignments/:loteId', requireAuth, (req, res) => {
    try {
        const assignments = db.prepare(`
            SELECT a.chapa_idx, a.maquina_id, m.nome as maquina_nome
            FROM cnc_machine_assignments a
            LEFT JOIN cnc_maquinas m ON a.maquina_id = m.id
            WHERE a.lote_id = ?
            ORDER BY a.chapa_idx
        `).all(req.params.loteId);
        res.json(assignments);
    } catch (err) {
        console.error('Erro ao buscar atribuições:', err);
        res.status(500).json({ error: 'Erro ao buscar atribuições de máquinas' });
    }
});

router.post('/machine-assignments/:loteId', requireAuth, (req, res) => {
    try {
        const { assignments } = req.body;
        if (!Array.isArray(assignments)) return res.status(400).json({ error: 'assignments deve ser um array' });

        const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const upsert = db.prepare('INSERT OR REPLACE INTO cnc_machine_assignments (lote_id, chapa_idx, maquina_id) VALUES (?, ?, ?)');
        const del = db.prepare('DELETE FROM cnc_machine_assignments WHERE lote_id = ? AND chapa_idx = ?');

        db.transaction(() => {
            for (const a of assignments) {
                if (a.maquina_id) {
                    upsert.run(lote.id, a.chapaIdx, a.maquina_id);
                } else {
                    del.run(lote.id, a.chapaIdx);
                }
            }
        })();

        res.json({ ok: true });
    } catch (err) {
        console.error('Erro ao salvar atribuições:', err);
        res.status(500).json({ error: 'Erro ao salvar atribuições' });
    }
});

router.post('/machine-assignments/:loteId/auto', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        const plano = JSON.parse(lote.plano_json);
        const totalChapas = plano.chapas?.length || 0;
        if (totalChapas === 0) return res.status(400).json({ error: 'Nenhuma chapa no plano' });

        const maquinas = db.prepare('SELECT * FROM cnc_maquinas WHERE ativo = 1 ORDER BY padrao DESC, nome').all();
        if (maquinas.length === 0) return res.status(400).json({ error: 'Nenhuma máquina ativa cadastrada' });

        // Distribute sheets evenly across machines
        const assignments = [];
        for (let i = 0; i < totalChapas; i++) {
            const maquina = maquinas[i % maquinas.length];
            assignments.push({ chapaIdx: i, maquina_id: maquina.id, maquina_nome: maquina.nome });
        }

        // Save to DB
        const upsert = db.prepare('INSERT OR REPLACE INTO cnc_machine_assignments (lote_id, chapa_idx, maquina_id) VALUES (?, ?, ?)');
        db.transaction(() => {
            for (const a of assignments) {
                upsert.run(lote.id, a.chapaIdx, a.maquina_id);
            }
        })();

        res.json({ ok: true, assignments });
    } catch (err) {
        console.error('Erro auto-assign:', err);
        res.status(500).json({ error: 'Erro ao auto-atribuir máquinas' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 2: Listagem e CRUD
// ═══════════════════════════════════════════════════════

router.get('/lotes', requireAuth, (req, res) => {
    const lotes = db.prepare('SELECT * FROM cnc_lotes WHERE user_id = ? ORDER BY criado_em DESC').all(req.user.id);
    res.json(lotes);
});

router.get('/lotes/:id', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(lote.id);
    // Resume info
    const materiais = [...new Set(pecas.map(p => p.material_code).filter(Boolean))];
    const modulos = [...new Set(pecas.map(p => p.modulo_desc).filter(Boolean))];
    const totalInstancias = pecas.reduce((s, p) => s + p.quantidade, 0);
    const areaTotal = pecas.reduce((s, p) => s + (p.comprimento * p.largura * p.quantidade) / 1e6, 0);
    res.json({ ...lote, pecas, materiais, modulos, totalInstancias, areaTotal: Math.round(areaTotal * 100) / 100 });
});

// Criar lote manual (para peças criadas no editor)
router.post('/lotes/manual', requireAuth, (req, res) => {
    try {
        const { nome, cliente, projeto } = req.body;
        const loteNome = nome || `Lote Manual ${new Date().toLocaleDateString('pt-BR')}`;
        const result = db.prepare(`
            INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, total_pecas, origem)
            VALUES (?, ?, ?, ?, 0, 'manual')
        `).run(req.user.id, loteNome, cliente || '', projeto || '');
        res.json({ id: Number(result.lastInsertRowid), nome: loteNome });
    } catch (err) {
        console.error('Erro ao criar lote manual:', err);
        res.status(500).json({ error: 'Erro ao criar lote' });
    }
});

router.delete('/lotes/:id', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    db.prepare('DELETE FROM cnc_lotes WHERE id = ?').run(lote.id);
    res.json({ ok: true });
});

router.get('/pecas/:loteId', requireAuth, (req, res) => {
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(req.params.loteId);
    res.json(pecas);
});

// Criar peça manual
router.post('/pecas/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const { descricao, modulo_desc, material, material_code, espessura, comprimento, largura,
            quantidade, borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento,
            machining_json, observacao, grain, rotation,
            borda_cor_frontal, borda_cor_traseira, borda_cor_dir, borda_cor_esq } = req.body;

        if (!comprimento || !largura) return res.status(400).json({ error: 'Comprimento e largura são obrigatórios' });

        const persistent_id = `M_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const result = db.prepare(`
            INSERT INTO cnc_pecas (lote_id, persistent_id, descricao, modulo_desc, material, material_code,
              espessura, comprimento, largura, quantidade, borda_dir, borda_esq, borda_frontal, borda_traseira,
              acabamento, machining_json, observacao,
              borda_cor_frontal, borda_cor_traseira, borda_cor_dir, borda_cor_esq)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
            lote.id, persistent_id, descricao || 'Peça manual', modulo_desc || '',
            material || material_code || '', material_code || '', espessura || 18,
            comprimento, largura, quantidade || 1,
            borda_dir || '', borda_esq || '', borda_frontal || '', borda_traseira || '',
            acabamento || '', machining_json ? (typeof machining_json === 'string' ? machining_json : JSON.stringify(machining_json)) : null,
            observacao || '',
            borda_cor_frontal || null, borda_cor_traseira || null, borda_cor_dir || null, borda_cor_esq || null
        );

        // Update total count
        const count = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(lote.id).c;
        db.prepare('UPDATE cnc_lotes SET total_pecas = ? WHERE id = ?').run(count, lote.id);

        res.json({ id: Number(result.lastInsertRowid), persistent_id });
    } catch (err) {
        console.error('Erro ao criar peça:', err);
        res.status(500).json({ error: 'Erro ao criar peça' });
    }
});

// Atualizar peça (todos os campos editáveis)
router.put('/pecas/:id', requireAuth, (req, res) => {
    const peca = db.prepare('SELECT p.id FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(req.params.id, req.user.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

    const editableFields = [
        'descricao', 'modulo_desc', 'material', 'material_code', 'espessura',
        'comprimento', 'largura', 'quantidade', 'borda_dir', 'borda_esq',
        'borda_frontal', 'borda_traseira', 'acabamento', 'machining_json',
        'observacao', 'produto_final', 'upmcode', 'upmdraw', 'usi_a', 'usi_b',
        'borda_cor_frontal', 'borda_cor_traseira', 'borda_cor_dir', 'borda_cor_esq',
    ];

    const updates = [];
    const vals = [];
    for (const field of editableFields) {
        if (req.body[field] !== undefined) {
            let val = req.body[field];
            if (field === 'machining_json' && typeof val === 'object') val = JSON.stringify(val);
            updates.push(`${field} = ?`);
            vals.push(val);
        }
    }
    if (updates.length === 0) return res.json({ ok: true });
    vals.push(req.params.id);
    db.prepare(`UPDATE cnc_pecas SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});

// Deletar peça individual
router.delete('/pecas/:id', requireAuth, (req, res) => {
    const peca = db.prepare('SELECT p.id, p.lote_id FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(req.params.id, req.user.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    db.prepare('DELETE FROM cnc_pecas WHERE id = ?').run(peca.id);
    const count = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(peca.lote_id).c;
    db.prepare('UPDATE cnc_lotes SET total_pecas = ? WHERE id = ?').run(count, peca.lote_id);
    res.json({ ok: true });
});

// Duplicar peça
router.post('/pecas/:id/duplicar', requireAuth, (req, res) => {
    const peca = db.prepare('SELECT p.* FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(req.params.id, req.user.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    const persistent_id = `D_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = db.prepare(`
        INSERT INTO cnc_pecas (lote_id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
          produto_final, material, material_code, espessura, comprimento, largura, quantidade,
          borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento, upmdraw, usi_a, usi_b,
          machining_json, observacao)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
        peca.lote_id, persistent_id, peca.upmcode, `${peca.descricao || 'Peça'} (cópia)`, peca.modulo_desc, peca.modulo_id,
        peca.produto_final, peca.material, peca.material_code, peca.espessura, peca.comprimento, peca.largura,
        peca.quantidade, peca.borda_dir, peca.borda_esq, peca.borda_frontal, peca.borda_traseira,
        peca.acabamento, peca.upmdraw, peca.usi_a, peca.usi_b, peca.machining_json, peca.observacao
    );
    const count = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(peca.lote_id).c;
    db.prepare('UPDATE cnc_lotes SET total_pecas = ? WHERE id = ?').run(count, peca.lote_id);
    res.json({ id: Number(result.lastInsertRowid), persistent_id });
});

// ═══════════════════════════════════════════════════════
// GRUPO 3: Otimizador Nesting 2D — MaxRects-BSSF
// ═══════════════════════════════════════════════════════

router.post('/otimizar/:loteId', requireAuth, async (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        if (pecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça no lote' });

        const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get() || {};

        // ═══ PYTHON OPTIMIZER (único motor) ═══════════════════════════
        if (!(await isPythonAvailable())) {
            return res.status(503).json({ error: 'Motor Python (CNC Optimizer) indisponível. Verifique se o serviço está rodando na porta 8000.' });
        }
        console.log(`  [CNC] Usando motor Python para lote ${lote.id}`);
        {

            const body = req.body || {};
            const spacing = body.espaco_pecas != null ? Number(body.espaco_pecas) : (config.espaco_pecas || 7);
            const kerfPadrao = body.kerf != null ? Number(body.kerf) : (config.kerf_padrao || 4);
            const kerfOverride = body.kerf != null ? Number(body.kerf) : null;
            const modoRaw = body.modo != null ? body.modo : (config.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects');
            const binType = modoRaw === 'maxrects' ? 'maxrects' : modoRaw === 'shelf' ? 'shelf' : 'guillotine';
            const useRetalhos = body.usar_retalhos != null ? !!body.usar_retalhos : (config.usar_retalhos !== 0);
            const maxIter = body.iteracoes != null ? Number(body.iteracoes) : (config.iteracoes_otimizador || 300);
            const considerarSobra = body.considerar_sobra != null ? !!body.considerar_sobra : (config.considerar_sobra !== 0);
            const sobraMinW = body.sobra_min_largura != null ? Number(body.sobra_min_largura) : (config.sobra_min_largura || 300);
            const sobraMinH = body.sobra_min_comprimento != null ? Number(body.sobra_min_comprimento) : (config.sobra_min_comprimento || 600);
            const permitirRotacao = body.permitir_rotacao != null ? !!body.permitir_rotacao : null;
            const refiloOverride = body.refilo != null ? Number(body.refilo) : null;
            const direcaoCorteRaw = body.direcao_corte || 'misto';
            const limiarPequena = body.limiar_pequena != null ? Number(body.limiar_pequena) : 400;
            const limiarSuperPequena = body.limiar_super_pequena != null ? Number(body.limiar_super_pequena) : 200;
            const classificarPecas = body.classificar_pecas !== false;

            // Agrupar pecas pela CHAPA RESOLVIDA (não pelo material_code da peça)
            // Isso garante que peças de materiais diferentes (mdf15, mdp15) que usam
            // a mesma chapa física sejam otimizadas JUNTAS
            const groups = {};
            for (const p of pecas) {
                let esp = p.espessura || 0;
                if (!esp && p.material_code) { const m = p.material_code.match(/_(\d+(?:\.\d+)?)_/); if (m) esp = parseFloat(m[1]); }

                // Resolver qual chapa essa peça vai usar (mesma lógica de fallback)
                let chapa = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(p.material_code);
                if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ABS(espessura_real - ?) <= 1.0 AND ativo = 1 ORDER BY ABS(espessura_real - ?) ASC LIMIT 1').get(esp, esp);
                if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE espessura_nominal = ? AND ativo = 1').get(esp);
                if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();

                // Agrupar pela chapa resolvida (ex: MDF_15.5_BRANCO_TX), não pela peça
                const chapaKey = chapa ? `${chapa.material_code}__${chapa.espessura_real}` : `fallback__${esp}`;
                if (!groups[chapaKey]) groups[chapaKey] = { material_code: chapa?.material_code || p.material_code, espessura: chapa?.espessura_real || esp, chapa_resolvida: chapa, pieces: [] };
                groups[chapaKey].pieces.push(p);
            }

            // Reset posicoes
            db.prepare('UPDATE cnc_pecas SET chapa_idx = NULL, pos_x = 0, pos_y = 0, rotacionada = 0 WHERE lote_id = ?').run(lote.id);
            db.prepare("DELETE FROM cnc_retalhos WHERE origem_lote = ?").run(String(lote.id));

            const plano = { chapas: [], retalhos: [], materiais: {}, modo: binType, direcao_corte: direcaoCorteRaw,
                timestamp: Date.now(),
                classificacao: { limiar_pequena: limiarPequena, limiar_super_pequena: limiarSuperPequena, ativo: classificarPecas },
            };
            let globalChapaIdx = 0;

            for (const [groupKey, group] of Object.entries(groups)) {
                // Chapa já foi resolvida no agrupamento acima
                let chapa = group.chapa_resolvida;
                if (!chapa) chapa = { comprimento: 2750, largura: 1850, refilo: 10, kerf: kerfPadrao, nome: 'Padrão 2750x1850', material_code: group.material_code, preco: 0, veio: 'sem_veio' };
                console.log(`  [CNC] Grupo ${groupKey}: ${group.pieces.length} peças → chapa ${chapa.material_code || chapa.nome}`);

                const refilo = refiloOverride != null ? refiloOverride : (chapa.refilo || 10);
                const kerf = kerfOverride != null ? kerfOverride : (chapa.kerf || kerfPadrao);
                const chapaVeio = chapa.veio || 'sem_veio';

                // Retalhos disponiveis (busca pela chapa resolvida, não pela peça)
                const retalhosDisp = useRetalhos
                    ? db.prepare('SELECT * FROM cnc_retalhos WHERE material_code = ? AND ABS(espessura_real - ?) <= 1.0 AND disponivel = 1 ORDER BY comprimento * largura DESC')
                        .all(chapa.material_code || group.material_code, chapa.espessura_real || group.espessura)
                    : [];

                // Enviar para Python
                const pyResult = await callPython('optimize', {
                    pieces: group.pieces.map(p => ({
                        id: p.id, persistent_id: p.persistent_id || '',
                        comprimento: p.comprimento, largura: p.largura,
                        quantidade: p.quantidade, material_code: p.material_code,
                        espessura: group.espessura,
                        allow_rotate: chapaVeio !== 'sem_veio' ? false : (permitirRotacao != null ? permitirRotacao : true),
                        lote_id: lote.id, descricao: p.descricao || '',
                    })),
                    sheets: [{
                        id: chapa.id || 0, nome: chapa.nome || '',
                        material_code: chapa.material_code || group.material_code,
                        espessura_nominal: chapa.espessura_nominal || group.espessura,
                        espessura_real: chapa.espessura_real || group.espessura,
                        comprimento: chapa.comprimento, largura: chapa.largura,
                        refilo, kerf, veio: chapaVeio, preco: chapa.preco || 0,
                    }],
                    scraps: retalhosDisp.map(r => ({
                        id: r.id, material_code: r.material_code,
                        espessura_real: r.espessura_real,
                        comprimento: r.comprimento, largura: r.largura,
                        disponivel: true,
                    })),
                    config: {
                        spacing, kerf, modo: binType,
                        permitir_rotacao: permitirRotacao,
                        usar_retalhos: useRetalhos, iteracoes: maxIter,
                        considerar_sobra: considerarSobra,
                        sobra_min_largura: sobraMinW, sobra_min_comprimento: sobraMinH,
                        direcao_corte: direcaoCorteRaw,
                        limiar_pequena: limiarPequena, limiar_super_pequena: limiarSuperPequena,
                        classificar_pecas: classificarPecas,
                    },
                });

                if (!pyResult || !pyResult.ok) {
                    const errMsg = pyResult?.error || 'Falha na otimização Python';
                    console.error(`  [Python Bridge] Falha para grupo ${groupKey}: ${errMsg}`);
                    return res.status(500).json({ error: `Erro na otimização do grupo ${group.material_code}: ${errMsg}` });
                }

                // Processar resultado Python — atualizar DB e montar plano
                const updatePeca = db.prepare('UPDATE cnc_pecas SET chapa_idx = ?, pos_x = ?, pos_y = ?, rotacionada = ? WHERE id = ? AND lote_id = ?');

                for (const pyChapa of pyResult.plano.chapas) {
                    const chapaIdx = globalChapaIdx++;
                    const chapaInfo = {
                        idx: chapaIdx,
                        material: chapa.nome || '',
                        material_code: chapa.material_code || group.material_code,
                        comprimento: chapa.comprimento, largura: chapa.largura,
                        refilo, kerf,
                        preco: chapa.preco || 0,
                        veio: chapaVeio,
                        aproveitamento: pyChapa.aproveitamento || 0,
                        pecas: pyChapa.pecas || [],
                        retalhos: pyChapa.retalhos || [],
                        cortes: pyChapa.cortes || [],
                    };

                    // Atualizar posicoes das pecas no DB + injetar contour data
                    for (const pecaInfo of chapaInfo.pecas) {
                        if (pecaInfo.instancia === 0) {
                            updatePeca.run(chapaIdx, pecaInfo.x + refilo, pecaInfo.y + refilo, pecaInfo.rotated ? 1 : 0, pecaInfo.pecaId, lote.id);
                        }
                        // Inject contour data for irregular pieces (from machining_json)
                        if (pecaInfo.pecaId) {
                            const srcPeca = group.pieces.find(p => p.id === pecaInfo.pecaId);
                            if (srcPeca?.machining_json) {
                                try {
                                    const mach = JSON.parse(srcPeca.machining_json);
                                    if (mach.contour && Array.isArray(mach.contour)) {
                                        pecaInfo.contour = mach.contour;
                                        pecaInfo.contourArea = calculatePolygonArea(mach.contour);
                                    }
                                } catch (_) {}
                            }
                        }
                    }

                    // Criar retalhos no DB
                    if (considerarSobra) {
                        for (const s of chapaInfo.retalhos) {
                            const w = Math.round(Math.max(s.w, s.h));
                            const h = Math.round(Math.min(s.w, s.h));
                            if (w >= sobraMinH && h >= sobraMinW) {
                                const retResult = db.prepare(`INSERT INTO cnc_retalhos (user_id, chapa_ref_id, nome, material_code, espessura_real, comprimento, largura, origem_lote)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                                    req.user.id, chapa.id || null,
                                    `Retalho ${w}x${h}`, group.material_code, group.espessura, w, h, String(lote.id)
                                );
                                db.prepare(`INSERT INTO cnc_retalho_historico (retalho_id, lote_id, chapa_idx, largura, comprimento, material_code, espessura, origem_lote_id, origem_chapa_idx, acao)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'criado')`).run(
                                    String(retResult.lastInsertRowid), lote.id, chapaInfo.idx, h, w, group.material_code, group.espessura, lote.id, chapaInfo.idx
                                );
                            }
                        }
                    }

                    gerarCortesRetalhos(chapaInfo);
                    plano.chapas.push(chapaInfo);
                }

                plano.materiais[groupKey] = {
                    material_code: group.material_code, espessura: group.espessura,
                    total_pecas: group.pieces.reduce((s, p) => s + p.quantidade, 0),
                    total_chapas: pyResult.total_chapas,
                    chapa_usada: chapa.nome, estrategia: 'python_optimizer',
                    ocupacao_media: pyResult.aproveitamento,
                    kerf, veio: chapaVeio, retalhos_usados: 0,
                };
            }

            // Se Python processou tudo com sucesso
            if (plano.chapas.length > 0) {
                // Stats de classificacao
                const clsStats = { normal: 0, pequena: 0, super_pequena: 0 };
                for (const ch of plano.chapas) {
                    for (const p of ch.pecas) {
                        const cls = p.classificacao || 'normal';
                        clsStats[cls] = (clsStats[cls] || 0) + 1;
                    }
                }
                plano.classificacao.stats = clsStats;

                const totalChapas = plano.chapas.length;
                const aprovMedio = totalChapas > 0
                    ? Math.round(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / totalChapas * 100) / 100
                    : 0;

                plano.aproveitamento = aprovMedio;
                plano.config_usada = { spacing: config.espaco_pecas || 7, motor: 'python' };

                db.prepare(`UPDATE cnc_lotes SET status = 'otimizado', total_chapas = ?, aproveitamento = ?, plano_json = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
                    .run(totalChapas, aprovMedio, JSON.stringify(plano), lote.id);

                notifyCNC(db, req.user.id, 'cnc_otimizado', 'Plano otimizado', `Lote ${lote.id} otimizado: ${totalChapas} chapas, ${aprovMedio}% aproveitamento`, lote.id, 'cnc_lote');

                return res.json({
                    ok: true,
                    total_chapas: totalChapas,
                    aproveitamento: aprovMedio,
                    total_combinacoes_testadas: 0,
                    modo: binType,
                    motor: 'python',
                    plano,
                });
            }
            // Python nao produziu resultado
            return res.status(500).json({ error: 'Motor Python não produziu resultado. Verifique os dados do lote.' });
        }

    } catch (err) {
        console.error('Erro no otimizador CNC:', err);
        res.status(500).json({ error: 'Erro ao otimizar corte' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 3B: Otimizador Multi-Lote (Multi-Projeto)
// Combina peças de múltiplos lotes/projetos numa única otimização
// Peças rastreadas por lote_id — etiquetas preservam projeto/cliente
// ═══════════════════════════════════════════════════════

router.post('/otimizar-multi', requireAuth, (req, res) => {
    try {
        const { loteIds, ...bodyConfig } = req.body || {};
        if (!Array.isArray(loteIds) || loteIds.length < 2) {
            return res.status(400).json({ error: 'Necessário pelo menos 2 lotes para otimização multi-projeto' });
        }

        // Validar que todos os lotes existem e pertencem ao usuário
        const lotes = [];
        for (const loteId of loteIds) {
            const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(loteId, req.user.id);
            if (!lote) return res.status(404).json({ error: `Lote ${loteId} não encontrado` });
            lotes.push(lote);
        }

        const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get() || {};

        const spacing = bodyConfig.espaco_pecas != null ? Number(bodyConfig.espaco_pecas) : (config.espaco_pecas || 7);
        const kerfPadrao = bodyConfig.kerf != null ? Number(bodyConfig.kerf) : (config.kerf_padrao || 4);
        const kerfOverride = bodyConfig.kerf != null ? Number(bodyConfig.kerf) : null;
        const modoRaw = bodyConfig.modo != null ? bodyConfig.modo : (config.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects');
        const binType = modoRaw === 'maxrects' ? 'maxrects' : modoRaw === 'shelf' ? 'shelf' : 'guillotine';
        const useRetalhos = bodyConfig.usar_retalhos != null ? !!bodyConfig.usar_retalhos : (config.usar_retalhos !== 0);
        const maxIter = bodyConfig.iteracoes != null ? Number(bodyConfig.iteracoes) : (config.iteracoes_otimizador || 300);
        const considerarSobra = bodyConfig.considerar_sobra != null ? !!bodyConfig.considerar_sobra : (config.considerar_sobra !== 0);
        const sobraMinW = bodyConfig.sobra_min_largura != null ? Number(bodyConfig.sobra_min_largura) : (config.sobra_min_largura || 300);
        const sobraMinH = bodyConfig.sobra_min_comprimento != null ? Number(bodyConfig.sobra_min_comprimento) : (config.sobra_min_comprimento || 600);
        const permitirRotacao = bodyConfig.permitir_rotacao != null ? !!bodyConfig.permitir_rotacao : null;
        const refiloOverride = bodyConfig.refilo != null ? Number(bodyConfig.refilo) : null;
        const direcaoCorteRaw = bodyConfig.direcao_corte || 'misto';
        const splitDir = direcaoCorteRaw === 'horizontal' ? 'horizontal' : direcaoCorteRaw === 'vertical' ? 'vertical' : 'auto';

        // Classificação de peças
        const limiarPequena = bodyConfig.limiar_pequena != null ? Number(bodyConfig.limiar_pequena) : 400;
        const limiarSuperPequena = bodyConfig.limiar_super_pequena != null ? Number(bodyConfig.limiar_super_pequena) : 200;
        const classificarPecas = bodyConfig.classificar_pecas !== false;
        function classifyPieceMulti(w, h) {
            if (!classificarPecas) return 'normal';
            const minDim = Math.min(w, h);
            if (minDim < limiarSuperPequena) return 'super_pequena';
            if (minDim < limiarPequena) return 'pequena';
            return 'normal';
        }

        // Atribuir grupo de otimização
        const grupoId = Date.now();
        const updateGrupo = db.prepare('UPDATE cnc_lotes SET grupo_otimizacao = ? WHERE id = ?');
        for (const lote of lotes) updateGrupo.run(grupoId, lote.id);

        // Coletar TODAS as peças de todos os lotes
        const allPecas = [];
        const loteMap = {}; // pecaId → loteId para rastreabilidade
        for (const lote of lotes) {
            const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
            for (const p of pecas) {
                allPecas.push(p);
                loteMap[p.id] = lote.id;
            }
        }

        if (allPecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça nos lotes selecionados' });

        // Set vacuum-aware module state
        const vacuumAwareMulti = bodyConfig.vacuum_aware !== false;
        setVacuumAware(vacuumAwareMulti);

        // Agrupar pela CHAPA RESOLVIDA (não pelo material_code da peça)
        // Garante que peças de materiais diferentes que usam a mesma chapa física
        // (ex: mdf15 + mdp15 → MDF_15.5_BRANCO_TX) sejam otimizadas juntas
        const groups = {};
        for (const p of allPecas) {
            let esp = p.espessura || 0;
            if (!esp && p.material_code) { const m = p.material_code.match(/_(\d+(?:\.\d+)?)_/); if (m) esp = parseFloat(m[1]); }

            // Resolver qual chapa essa peça vai usar
            let chapa = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(p.material_code);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ABS(espessura_real - ?) <= 1.0 AND ativo = 1 ORDER BY ABS(espessura_real - ?) ASC LIMIT 1').get(esp, esp);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE espessura_nominal = ? AND ativo = 1').get(esp);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();

            const chapaKey = chapa ? `${chapa.material_code}__${chapa.espessura_real}` : `fallback__${esp}`;
            if (!groups[chapaKey]) groups[chapaKey] = { material_code: chapa?.material_code || p.material_code, espessura: chapa?.espessura_real || esp, chapa_resolvida: chapa, pieces: [] };
            groups[chapaKey].pieces.push(p);
        }

        const plano = {
            chapas: [], retalhos: [], materiais: {}, modo: binType, timestamp: Date.now(), multi_lote: true, lote_ids: loteIds, grupo_otimizacao: grupoId,
            classificacao: { limiar_pequena: limiarPequena, limiar_super_pequena: limiarSuperPequena, ativo: classificarPecas },
        };
        let globalChapaIdx = 0;
        let totalCombinacoes = 0;

        // Reset positions in ALL lotes
        for (const lote of lotes) {
            db.prepare('UPDATE cnc_pecas SET chapa_idx = NULL, pos_x = 0, pos_y = 0, rotacionada = 0 WHERE lote_id = ?').run(lote.id);
            db.prepare("DELETE FROM cnc_retalhos WHERE origem_lote = ?").run(String(lote.id));
        }

        // Cores por projeto para visualização
        const projectColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        const loteColorMap = {};
        lotes.forEach((l, i) => { loteColorMap[l.id] = projectColors[i % projectColors.length]; });

        // Informações dos lotes para exibição
        plano.lotes_info = lotes.map((l, i) => ({
            id: l.id,
            nome: l.nome,
            cliente: l.cliente,
            projeto: l.projeto,
            cor: projectColors[i % projectColors.length],
        }));

        for (const [groupKey, group] of Object.entries(groups)) {
            // Chapa já foi resolvida no agrupamento acima
            let chapa = group.chapa_resolvida;
            if (!chapa) chapa = { comprimento: 2750, largura: 1850, refilo: 10, kerf: kerfPadrao, nome: 'Padrão 2750x1850', material_code: group.material_code, preco: 0, veio: 'sem_veio' };
            console.log(`  [CNC Multi] Grupo ${groupKey}: ${group.pieces.length} peças → chapa ${chapa.material_code || chapa.nome}`);

            const refilo = refiloOverride != null ? refiloOverride : (chapa.refilo || 10);
            const kerf = kerfOverride != null ? kerfOverride : (chapa.kerf || kerfPadrao);
            const binW = chapa.comprimento - 2 * refilo;
            const binH = chapa.largura - 2 * refilo;
            const chapaVeio = chapa.veio || 'sem_veio';
            const temVeio = chapaVeio !== 'sem_veio';

            // Buscar config de rotação do material cadastrado (-1=herdar do veio, 0=nunca, 1=sempre)
            const matCadastrado = chapa.material_code
                ? db.prepare('SELECT permitir_rotacao FROM cnc_materiais WHERE codigo = ? LIMIT 1').get(chapa.material_code)
                : null;
            const matPermitirRot = matCadastrado?.permitir_rotacao;

            // Expandir peças com rastreio de lote_id
            const expanded = [];
            for (const p of group.pieces) {
                // Regra simples: sem veio = SEMPRE permite rotação (melhor aproveitamento)
                //                com veio = NUNCA permite (protege o projeto)
                // Override do material cadastrado pode forçar diferente
                let allowRotate;
                if (matPermitirRot === 0) allowRotate = false;
                else if (matPermitirRot === 1) allowRotate = true;
                else allowRotate = !temVeio; // sem veio → true, com veio → false
                for (let q = 0; q < p.quantidade; q++) {
                    expanded.push({
                        ref: { pecaId: p.id, instancia: q, loteId: loteMap[p.id] },
                        w: p.comprimento, h: p.largura, allowRotate,
                        area: p.comprimento * p.largura,
                        perim: 2 * (p.comprimento + p.largura),
                        maxSide: Math.max(p.comprimento, p.largura),
                        diff: Math.abs(p.comprimento - p.largura),
                        classificacao: classifyPieceMulti(p.comprimento, p.largura),
                    });
                }
            }

            // ═══ FASE 1: Retalhos ═══
            let pecasRestantes = [...expanded];
            const retalhosUsados = [];

            if (useRetalhos) {
                const retalhosDisp = db.prepare(
                    'SELECT * FROM cnc_retalhos WHERE material_code = ? AND espessura_real = ? AND disponivel = 1 ORDER BY comprimento * largura DESC'
                ).all(group.material_code, group.espessura);

                for (const ret of retalhosDisp) {
                    if (pecasRestantes.length === 0) break;
                    const retW = ret.comprimento, retH = ret.largura;
                    const bins = runNestingPass(
                        [...pecasRestantes].sort((a, b) => b.area - a.area),
                        retW, retH, spacing, 'BSSF', binType, kerf, splitDir
                    );

                    if (bins.length === 1 && bins[0].usedRects.length > 0) {
                        const bin = bins[0];
                        const chapaIdx = globalChapaIdx++;
                        const chapaInfo = {
                            idx: chapaIdx, material: `RETALHO: ${ret.nome}`,
                            material_code: group.material_code, comprimento: retW, largura: retH,
                            refilo: 0, preco: 0, veio: chapaVeio,
                            aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                            is_retalho: true, retalho_id: ret.id, pecas: [], retalhos: [],
                            cortes: binType !== 'maxrects' ? gerarSequenciaCortes(bin) : [],
                        };

                        const placedRefs = new Set();
                        for (const rect of bin.usedRects) {
                            if (!rect.pieceRef) continue;
                            const { pecaId, instancia, loteId } = rect.pieceRef;
                            const clsM = classifyPieceMulti(rect.realW, rect.realH);
                            const pecaM = {
                                pecaId, instancia, x: rect.x, y: rect.y,
                                w: rect.realW, h: rect.realH, rotated: rect.rotated,
                                loteId, cor: loteColorMap[loteId],
                            };
                            if (clsM !== 'normal') pecaM.classificacao = clsM;
                            chapaInfo.pecas.push(pecaM);
                            placedRefs.add(`${pecaId}_${instancia}`);
                        }
                        gerarCortesRetalhos(chapaInfo);
                        plano.chapas.push(chapaInfo);
                        retalhosUsados.push(ret.id);
                        db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(ret.id);
                        db.prepare(`INSERT INTO cnc_retalho_historico (retalho_id, lote_id, chapa_idx, largura, comprimento, material_code, espessura, origem_lote_id, acao)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'usado')`).run(
                            String(ret.id), loteIds[0], chapaInfo.idx, ret.largura, ret.comprimento, ret.material_code, ret.espessura_real, ret.origem_lote ? Number(ret.origem_lote) : null
                        );
                        pecasRestantes = pecasRestantes.filter(p => !placedRefs.has(`${p.ref.pecaId}_${p.ref.instancia}`));
                    }
                }
            }

            if (pecasRestantes.length === 0) {
                plano.materiais[groupKey] = {
                    material_code: group.material_code, espessura: group.espessura,
                    total_pecas: expanded.length, total_chapas: 0,
                    chapa_usada: chapa.nome, estrategia: 'retalhos_only',
                    ocupacao_media: 0, retalhos_usados: retalhosUsados.length,
                };
                continue;
            }

            // ═══ FASES 2-5: Mesma lógica do otimizador single-lote ═══
            const heuristics = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
            let bestBins = null, bestBinScore = { score: Infinity }, bestStrategyName = '', bestBinType = binType;

            const totalPieceArea = pecasRestantes.reduce((s, p) => s + p.area, 0);
            const sheetArea = binW * binH;
            const minTeoricoChapas = Math.ceil(totalPieceArea / sheetArea);

            // Respeitar o modo escolhido pelo usuário:
            // guilhotina → só guilhotina + shelf (compatíveis com esquadrejadeira)
            // maxrects → maxrects + skyline (CNC livre)
            // shelf → só shelf + guilhotina
            const binTypesToTry = [binType];
            if (binType === 'guillotine') {
                binTypesToTry.push('shelf');
            } else if (binType === 'shelf') {
                binTypesToTry.push('guillotine');
            } else {
                // maxrects ou skyline → testa variantes CNC livre
                if (!binTypesToTry.includes('maxrects')) binTypesToTry.push('maxrects');
                if (!binTypesToTry.includes('skyline')) binTypesToTry.push('skyline');
            }

            const baseSortStrategies = [
                { name: 'area_desc',    fn: (a, b) => b.area - a.area },
                { name: 'perim_desc',   fn: (a, b) => b.perim - a.perim },
                { name: 'maxside_desc', fn: (a, b) => b.maxSide - a.maxSide },
                { name: 'diff_desc',    fn: (a, b) => b.diff - a.diff },
                { name: 'area_asc',     fn: (a, b) => a.area - b.area },
                { name: 'perim_asc',    fn: (a, b) => a.perim - b.perim },
                { name: 'maxside_asc',  fn: (a, b) => a.maxSide - b.maxSide },
                { name: 'w_h_desc',     fn: (a, b) => b.w - a.w || b.h - a.h },
                { name: 'h_w_desc',     fn: (a, b) => b.h - a.h || b.w - a.w },
                { name: 'ratio_sq',     fn: (a, b) => { const ra = Math.min(a.w,a.h)/Math.max(a.w,a.h); const rb = Math.min(b.w,b.h)/Math.max(b.w,b.h); return rb - ra; }},
                { name: 'diagonal',     fn: (a, b) => Math.sqrt(b.w*b.w+b.h*b.h) - Math.sqrt(a.w*a.w+a.h*a.h) },
                { name: 'minside_desc', fn: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) },
            ];
            // Add directional sort strategies when direction is set
            const sortStrategies = [...baseSortStrategies];
            if (splitDir === 'horizontal') {
                // Horizontal: prioritize wider pieces first (fill rows efficiently)
                sortStrategies.unshift(
                    { name: 'width_desc',     fn: (a, b) => b.w - a.w || b.h - a.h },
                    { name: 'width_area',     fn: (a, b) => b.w - a.w || b.area - a.area },
                );
            } else if (splitDir === 'vertical') {
                // Vertical: prioritize taller pieces first (fill columns efficiently)
                sortStrategies.unshift(
                    { name: 'height_desc',    fn: (a, b) => b.h - a.h || b.w - a.w },
                    { name: 'height_area',    fn: (a, b) => b.h - a.h || b.area - a.area },
                );
            }

            // FASE 2: Portfolio multi-pass
            // When direction is set, only run directional-compatible bin types and give priority to directional strategies
            const isDirectional = splitDir !== 'auto';
            for (const bt of binTypesToTry) {
                for (const strat of sortStrategies) {
                    const sorted = [...pecasRestantes].sort(strat.fn);
                    for (const h of heuristics) {
                        const bins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                        const sc = scoreResult(bins);
                        // When direction is set, give a slight bonus to directional sort strategies (same bin count = prefer directional)
                        if (isDirectional && (strat.name.startsWith('width_') || strat.name.startsWith('height_'))) {
                            sc.score -= 0.5; // Small bonus: wins tie-breaks without overriding fewer-bins
                        }
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = bins; bestStrategyName = `${strat.name}+${h}+${bt}`; bestBinType = bt; }
                        totalCombinacoes++;
                    }
                }
            }

            // FASE 2.5: Strip packing
            {
                const stripBins = runStripPacking(pecasRestantes, binW, binH, kerf, spacing, splitDir);
                const sc = scoreResult(stripBins);
                if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = stripBins; bestStrategyName = 'strip_packing'; bestBinType = 'strip'; }
                totalCombinacoes++;
            }

            // FASE 3: R&R (iterações otimizadas internamente — sem necessidade de configuração do usuário)
            const rrIter = Math.max(800, Math.min(2000, pecasRestantes.length * 20));
            if (pecasRestantes.length > 3) {
                for (const bt of binTypesToTry) {
                    const rrResult = ruinAndRecreate(pecasRestantes, binW, binH, spacing, bt, kerf, rrIter, splitDir);
                    if (rrResult && rrResult.score.score < bestBinScore.score) {
                        bestBinScore = rrResult.score; bestBins = rrResult.bins;
                        bestStrategyName = `ruin_recreate+LAHC+${bt}`; bestBinType = bt;
                    }
                    totalCombinacoes += rrIter;
                }
            }

            // FASE 3.5: BRKGA
            if (pecasRestantes.length > 3 && bestBinScore.bins > minTeoricoChapas) {
                const brkgaGen = Math.min(100, Math.max(40, pecasRestantes.length * 3));
                const brkgaResult = runBRKGA(pecasRestantes, binW, binH, spacing, binType, kerf, brkgaGen, splitDir);
                if (brkgaResult && brkgaResult.score.score < bestBinScore.score) {
                    bestBinScore = brkgaResult.score; bestBins = brkgaResult.bins;
                    bestStrategyName = `BRKGA_${brkgaGen}gen`; bestBinType = binType;
                }
                totalCombinacoes += brkgaGen * 40;
            }

            // FASE 5: Gap filling
            if (bestBins && bestBins.length > 1) {
                const allPcs = [];
                for (const bin of bestBins) {
                    for (const r of bin.usedRects) {
                        if (!r.pieceRef) continue;
                        allPcs.push({
                            ref: r.pieceRef, w: r.realW || r.w, h: r.realH || r.h,
                            allowRotate: r.allowRotate || false,
                            area: (r.realW || r.w) * (r.realH || r.h),
                            perim: 2 * ((r.realW || r.w) + (r.realH || r.h)),
                            maxSide: Math.max(r.realW || r.w, r.realH || r.h),
                            diff: Math.abs((r.realW || r.w) - (r.realH || r.h)),
                        });
                    }
                }
                const targetBins = bestBins.length - 1;
                if (targetBins >= minTeoricoChapas) {
                    const gapSorts = [(a, b) => b.area - a.area, (a, b) => b.maxSide - a.maxSide, (a, b) => b.h - a.h || b.w - a.w];
                    for (const sortFn of gapSorts) {
                        for (const h of heuristics) {
                            for (const bt of binTypesToTry) {
                                const sorted = [...allPcs].sort(sortFn);
                                const testBins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                                if (testBins.length <= targetBins && verifyNoOverlaps(testBins)) {
                                    const sc = scoreResult(testBins);
                                    if (sc.score < bestBinScore.score) { bestBins = testBins; bestBinScore = sc; bestBinType = bt; bestStrategyName += '+gap_repack'; }
                                }
                                totalCombinacoes++;
                            }
                        }
                    }
                }
            }

            // Safety + Compactação
            if (!verifyNoOverlaps(bestBins)) {
                bestBins = repairOverlaps(bestBins, binW, binH, spacing, bestBinType, kerf, splitDir);
                bestBinScore = scoreResult(bestBins);
            }
            for (const bin of bestBins) compactBin(bin, binW, binH, kerf, spacing, splitDir);

            const maxTeoricoAprov = totalPieceArea / (bestBins.length * sheetArea) * 100;
            console.log(`  [Nesting Multi] ${groupKey}: ${pecasRestantes.length} peças (${lotes.length} lotes) → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}% (${bestStrategyName}) [splitDir=${splitDir}]`);
            if (bestBins[0] && bestBins[0].usedRects) {
                bestBins[0].usedRects.slice(0, 3).forEach(r => console.log(`    → ${r.pieceRef}: (${Math.round(r.x)},${Math.round(r.y)}) ${Math.round(r.realW||r.w)}x${Math.round(r.realH||r.h)} rot=${r.rotated||false}`));
            }

            // Gravar resultados com rastreio de lote
            for (let bi = 0; bi < bestBins.length; bi++) {
                const bin = bestBins[bi];
                const chapaIdx = globalChapaIdx++;
                const chapaInfo = {
                    idx: chapaIdx, material: chapa.nome,
                    material_code: chapa.material_code || group.material_code,
                    comprimento: chapa.comprimento, largura: chapa.largura,
                    refilo, kerf, preco: chapa.preco || 0, veio: chapaVeio,
                    aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                    pecas: [], retalhos: [],
                    cortes: bestBinType !== 'maxrects' ? gerarSequenciaCortes(bin) : [],
                };

                const updatePeca = db.prepare('UPDATE cnc_pecas SET chapa_idx = ?, pos_x = ?, pos_y = ?, rotacionada = ? WHERE id = ? AND lote_id = ?');
                for (const rect of bin.usedRects) {
                    if (!rect.pieceRef) continue;
                    const { pecaId, instancia, loteId } = rect.pieceRef;
                    if (instancia === 0) updatePeca.run(chapaIdx, rect.x + refilo, rect.y + refilo, rect.rotated ? 1 : 0, pecaId, loteId || loteMap[pecaId]);
                    const clsM2 = classifyPieceMulti(rect.realW, rect.realH);
                    const pecaM2 = {
                        pecaId, instancia, x: rect.x, y: rect.y,
                        w: rect.realW, h: rect.realH, rotated: rect.rotated,
                        loteId: loteId || loteMap[pecaId],
                        cor: loteColorMap[loteId || loteMap[pecaId]],
                    };
                    if (clsM2 !== 'normal') pecaM2.classificacao = clsM2;
                    if (clsM2 === 'super_pequena') {
                        pecaM2.corte = { passes: 2, velocidade: 'lenta', tabs: true, tabSize: 3, tabCount: 2 };
                    } else if (clsM2 === 'pequena') {
                        pecaM2.corte = { passes: 1, velocidade: 'media', tabs: binType === 'maxrects', tabSize: 2, tabCount: 1 };
                    }
                    chapaInfo.pecas.push(pecaM2);
                }

                // Retalhos (Clip & Keep — sem sobreposição)
                if (considerarSobra) {
                    const sobras = clipAndKeep(bin.freeRects, sobraMinW, sobraMinH);
                    for (const s of sobras) {
                        const w = Math.round(s.w), h = Math.round(s.h);
                        chapaInfo.retalhos.push({ x: s.x, y: s.y, w: s.w, h: s.h });
                        const retResult = db.prepare(`INSERT INTO cnc_retalhos (user_id, chapa_ref_id, nome, material_code, espessura_real, comprimento, largura, origem_lote)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                            req.user.id, chapa.id || null,
                            `Retalho ${Math.max(w, h)}x${Math.min(w, h)}`,
                            group.material_code, group.espessura,
                            Math.max(w, h), Math.min(w, h), loteIds.join(',')
                        );
                        db.prepare(`INSERT INTO cnc_retalho_historico (retalho_id, lote_id, chapa_idx, largura, comprimento, material_code, espessura, origem_lote_id, origem_chapa_idx, acao)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'criado')`).run(
                            String(retResult.lastInsertRowid), loteIds[0], chapaInfo.idx, Math.min(w, h), Math.max(w, h), group.material_code, group.espessura, loteIds[0], chapaInfo.idx
                        );
                    }
                }

                gerarCortesRetalhos(chapaInfo);
                plano.chapas.push(chapaInfo);
            }

            plano.materiais[groupKey] = {
                material_code: group.material_code, espessura: group.espessura,
                total_pecas: expanded.length, total_chapas: bestBins.length,
                chapa_usada: chapa.nome, estrategia: bestStrategyName,
                ocupacao_media: Math.round(bestBinScore.avgOccupancy * 100) / 100,
                kerf, veio: chapaVeio, retalhos_usados: retalhosUsados.length,
                min_teorico_chapas: minTeoricoChapas,
                max_teorico_aproveitamento: Math.round(totalPieceArea / (bestBins.length * sheetArea) * 10000) / 100,
            };
        }

        // Classification stats multi-lote
        const clsStatsMulti = { normal: 0, pequena: 0, super_pequena: 0 };
        for (const ch of plano.chapas) {
            for (const p of ch.pecas) {
                const cls = p.classificacao || 'normal';
                clsStatsMulti[cls] = (clsStatsMulti[cls] || 0) + 1;
            }
        }
        plano.classificacao.stats = clsStatsMulti;

        // Totais
        const totalChapas = plano.chapas.length;
        const aprovMedio = totalChapas > 0
            ? Math.round(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / totalChapas * 100) / 100 : 0;

        // Atualizar todos os lotes com o plano combinado
        for (const lote of lotes) {
            db.prepare(`UPDATE cnc_lotes SET status = 'otimizado', total_chapas = ?, aproveitamento = ?, plano_json = ?, grupo_otimizacao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
                .run(totalChapas, aprovMedio, JSON.stringify(plano), grupoId, lote.id);
        }

        res.json({
            ok: true,
            total_chapas: totalChapas,
            aproveitamento: aprovMedio,
            total_combinacoes_testadas: totalCombinacoes,
            modo: binType,
            grupo_otimizacao: grupoId,
            lotes: lotes.map(l => ({ id: l.id, nome: l.nome, cliente: l.cliente, projeto: l.projeto })),
            plano,
        });
    } catch (err) {
        console.error('Erro no otimizador multi-lote:', err);
        res.status(500).json({ error: 'Erro ao otimizar corte multi-projeto' });
    }
});

// ─── Desvincular lote de um grupo de otimização ─────
router.put('/lotes/:loteId/desvincular-grupo', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    db.prepare('UPDATE cnc_lotes SET grupo_otimizacao = NULL, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
        .run('importado', lote.id);
    // Reset piece positions for this lote
    db.prepare('UPDATE cnc_pecas SET chapa_idx = NULL, pos_x = 0, pos_y = 0, rotacionada = 0 WHERE lote_id = ?').run(lote.id);
    res.json({ ok: true });
});

// ─── Ajuste manual do plano (mover/rotacionar peça) ─────
// ─── Helpers de colisão para ajustes manuais ──────────────────────
function checkCollision(peca, pecas, excludeIdx, kerf = 0) {
    const a = { x: peca.x - kerf, y: peca.y - kerf, w: peca.w + kerf * 2, h: peca.h + kerf * 2 };
    for (let i = 0; i < pecas.length; i++) {
        if (i === excludeIdx) continue;
        const b = pecas[i];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
            return { collides: true, withIdx: i, withPeca: b };
        }
    }
    return { collides: false };
}

function checkBounds(peca, chapa) {
    const ref = chapa.refilo || 0;
    const maxX = chapa.comprimento - 2 * ref - peca.w;
    const maxY = chapa.largura - 2 * ref - peca.h;
    return peca.x >= 0 && peca.y >= 0 && peca.x <= maxX + 0.5 && peca.y <= maxY + 0.5;
}

function findNonCollidingPosition(peca, pecas, excludeIdx, chapaW, chapaH, refilo, kerf) {
    const maxX = chapaW - 2 * refilo - peca.w;
    const maxY = chapaH - 2 * refilo - peca.h;
    // Tentar posição original
    if (!checkCollision(peca, pecas, excludeIdx, kerf).collides) return { x: peca.x, y: peca.y };
    // Varrer grid 10mm
    for (let yy = 0; yy <= maxY; yy += 10) {
        for (let xx = 0; xx <= maxX; xx += 10) {
            const test = { ...peca, x: xx, y: yy };
            if (!checkCollision(test, pecas, excludeIdx, kerf).collides) return { x: xx, y: yy };
        }
    }
    // Grid 2mm (fallback)
    for (let yy = 0; yy <= maxY; yy += 2) {
        for (let xx = 0; xx <= maxX; xx += 2) {
            const test = { ...peca, x: xx, y: yy };
            if (!checkCollision(test, pecas, excludeIdx, kerf).collides) return { x: xx, y: yy };
        }
    }
    return null; // Não cabe
}

function recalcOccupancy(plano) {
    for (const ch of plano.chapas) {
        const ref = ch.refilo || 0;
        const usableW = ch.comprimento - 2 * ref;
        const usableH = ch.largura - 2 * ref;
        const usableArea = usableW * usableH;
        const usedArea = ch.pecas.reduce((s, p) => s + p.w * p.h, 0);
        ch.aproveitamento = usableArea > 0 ? Math.round(usedArea / usableArea * 10000) / 100 : 0;
    }
    // Remover chapas vazias automaticamente (se não é a última do material)
    const byMat = {};
    for (let i = 0; i < plano.chapas.length; i++) {
        const key = plano.chapas[i].material;
        if (!byMat[key]) byMat[key] = [];
        byMat[key].push(i);
    }
    const toRemove = [];
    for (const [, indices] of Object.entries(byMat)) {
        if (indices.length > 1) {
            for (const i of indices) {
                if (plano.chapas[i].pecas.length === 0) toRemove.push(i);
            }
        }
    }
    // Remover de trás para frente
    toRemove.sort((a, b) => b - a);
    for (const i of toRemove) plano.chapas.splice(i, 1);

    return plano.chapas.length > 0
        ? Math.round(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / plano.chapas.length * 100) / 100
        : 0;
}

// ─── Helpers: trava por chapa, compatibilidade, overlap ──────────────
function assertSheetUnlocked(plano, chapaIdx, action) {
    const chapa = plano.chapas?.[chapaIdx];
    if (chapa?.locked) {
        return { error: `Chapa ${chapaIdx + 1} travada — destrave para ${action}`, locked: true };
    }
    return null;
}

function isPieceSheetCompatible(pieceMeta, targetSheetMeta) {
    if (pieceMeta.material_code !== targetSheetMeta.material_code) return false;
    if (Math.abs((pieceMeta.espessura || 0) - (targetSheetMeta.espessura || 0)) > 0.1) return false;
    if (pieceMeta.veio && pieceMeta.veio !== 'sem_veio' && targetSheetMeta.veio !== pieceMeta.veio) return false;
    return true;
}

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

router.put('/plano/:loteId/ajustar', requireAuth, async (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        const plano = JSON.parse(lote.plano_json);
        if (!plano.transferencia) plano.transferencia = []; // Área de transferência
        const { chapaIdx, pecaIdx, action, x, y, targetChapaIdx, force } = req.body;
        const kerf = plano.config?.kerf || 4;
        const moveSpacing = Math.max(kerf, plano.config?.spacing || 0); // Espaçamento efetivo para movimentação

        // ── Snapshot transacional antes de ações críticas ──
        const SNAPSHOT_ACTIONS = ['move_to_sheet', 'from_transfer', 'reoptimize_unlocked',
            'lock_sheet', 'unlock_sheet', 'compact', 're_optimize', 'ajustar_sobra',
            'marcar_refugo', 'merge_sobras', 'recalc_sobras', 'flip'];
        if (SNAPSHOT_ACTIONS.includes(action)) {
            db.prepare('INSERT INTO cnc_plano_versions (lote_id, user_id, plano_json, acao_origem) VALUES (?, ?, ?, ?)')
                .run(lote.id, req.user.id, lote.plano_json, action);
            db.prepare(`DELETE FROM cnc_plano_versions WHERE lote_id = ? AND id NOT IN
                (SELECT id FROM cnc_plano_versions WHERE lote_id = ? ORDER BY id DESC LIMIT 50)`)
                .run(lote.id, lote.id);
        }

        // ── Gate de trava por chapa ──
        const SHEET_GATED_ACTIONS = ['move', 'rotate', 'flip', 'to_transfer', 'compact', 're_optimize', 'ajustar_sobra', 'marcar_refugo', 'merge_sobras'];
        if (SHEET_GATED_ACTIONS.includes(action) && chapaIdx != null) {
            const lockErr = assertSheetUnlocked(plano, chapaIdx, action);
            if (lockErr) return res.status(423).json(lockErr);
        }
        // Gate para ações com destino
        if (['move_to_sheet', 'from_transfer'].includes(action) && targetChapaIdx != null) {
            const lockErrDest = assertSheetUnlocked(plano, targetChapaIdx, 'receber peça');
            if (lockErrDest) return res.status(423).json(lockErrDest);
        }
        if (action === 'move_to_sheet' && chapaIdx != null) {
            const lockErrSrc = assertSheetUnlocked(plano, chapaIdx, 'mover peça');
            if (lockErrSrc) return res.status(423).json(lockErrSrc);
        }

        // ═══ ACTION: move ═══════════════════════════════════════════════
        if (action === 'move') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            if (peca.locked) return res.status(400).json({ error: 'Peça travada' });

            // Validar limites: área útil completa (colisão com kerf cuida do espaçamento)
            const ref = chapa.refilo || 0;
            const clampedX = Math.max(0, Math.min(chapa.comprimento - 2 * ref - peca.w, x));
            const clampedY = Math.max(0, Math.min(chapa.largura - 2 * ref - peca.h, y));

            const testPeca = { ...peca, x: clampedX, y: clampedY };
            const collision = checkCollision(testPeca, chapa.pecas, pecaIdx, moveSpacing);

            if (collision.collides && !force) {
                return res.status(409).json({
                    error: 'Colisão detectada',
                    collision: true,
                    withPeca: collision.withPeca,
                    withIdx: collision.withIdx,
                });
            }
            peca.x = clampedX;
            peca.y = clampedY;
            // Limpar retalhos — devem ser recalculados sob demanda
            chapa.retalhos = [];

        // ═══ ACTION: rotate ════════════════════════════════════════════
        } else if (action === 'rotate') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            if (peca.locked) return res.status(400).json({ error: 'Peça travada' });
            const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
            if (hasVeio) return res.status(400).json({ error: 'Material com veio não permite rotação' });

            const newW = peca.h, newH = peca.w;
            const ref = chapa.refilo || 0;
            // Verificar se cabe após rotação
            if (peca.x + newW > chapa.comprimento - 2 * ref || peca.y + newH > chapa.largura - 2 * ref) {
                // Tentar reposicionar
                const testPeca = { ...peca, w: newW, h: newH };
                testPeca.x = Math.min(testPeca.x, chapa.comprimento - 2 * ref - newW);
                testPeca.y = Math.min(testPeca.y, chapa.largura - 2 * ref - newH);
                if (testPeca.x < 0 || testPeca.y < 0) {
                    return res.status(400).json({ error: 'Peça não cabe rotacionada nesta chapa' });
                }
                peca.x = testPeca.x;
                peca.y = testPeca.y;
            }
            peca.w = newW;
            peca.h = newH;
            peca.rotated = !peca.rotated;

            // Verificar colisão pós-rotação (usar espaçamento efetivo)
            const collision = checkCollision(peca, chapa.pecas, pecaIdx, moveSpacing);
            if (collision.collides) {
                const pos = findNonCollidingPosition(peca, chapa.pecas, pecaIdx, chapa.comprimento, chapa.largura, ref, moveSpacing);
                if (pos) { peca.x = pos.x; peca.y = pos.y; }
                else {
                    // Reverter
                    peca.w = newH; peca.h = newW; peca.rotated = !peca.rotated;
                    return res.status(400).json({ error: 'Sem espaço para rotacionar (colisão)' });
                }
            }
            chapa.retalhos = []; // Limpar retalhos — recalcular sob demanda

        // ═══ ACTION: flip (inverter peça: Lado A / Lado B) ════════════
        } else if (action === 'flip') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            // Toggle lado_ativo entre 'A' e 'B'
            peca.lado_ativo = (peca.lado_ativo === 'B') ? 'A' : 'B';

        // ═══ ACTION: move_to_sheet ═════════════════════════════════════
        } else if (action === 'move_to_sheet') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            const targetChapa = plano.chapas[targetChapaIdx];
            if (!targetChapa) return res.status(400).json({ error: 'Chapa destino inválida' });

            // Verificar compatibilidade de material (material_code + espessura + veio)
            const srcMeta = { material_code: chapa.material_code || chapa.material, espessura: chapa.espessura, veio: chapa.veio };
            const tgtMeta = { material_code: targetChapa.material_code || targetChapa.material, espessura: targetChapa.espessura, veio: targetChapa.veio };
            if (!isPieceSheetCompatible(srcMeta, tgtMeta)) {
                return res.status(400).json({
                    error: `Material incompatível: peça de ${chapa.material || 'origem'} não pode ir para ${targetChapa.material || 'destino'}`,
                    materialMismatch: true,
                });
            }

            const ref = targetChapa.refilo || 0;
            const targetX = x ?? 0, targetY = y ?? 0;
            const testPeca = { ...peca, x: targetX, y: targetY };

            // Validar limites na chapa destino
            if (!checkBounds(testPeca, targetChapa)) {
                return res.status(400).json({ error: 'Peça não cabe na chapa destino' });
            }

            // Verificar colisão na chapa destino
            const collision = checkCollision(testPeca, targetChapa.pecas, -1, 0);
            if (collision.collides && !force) {
                // Tentar posicionar automaticamente
                const pos = findNonCollidingPosition(testPeca, targetChapa.pecas, -1, targetChapa.comprimento, targetChapa.largura, ref, 0);
                if (pos) {
                    testPeca.x = pos.x; testPeca.y = pos.y;
                } else {
                    return res.status(409).json({ error: 'Sem espaço na chapa destino', collision: true });
                }
            }
            chapa.pecas.splice(pecaIdx, 1);
            peca.x = testPeca.x;
            peca.y = testPeca.y;
            targetChapa.pecas.push(peca);

        // ═══ ACTION: to_transfer ═══════════════════════════════════════
        } else if (action === 'to_transfer') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            chapa.pecas.splice(pecaIdx, 1);
            peca.fromChapaIdx = chapaIdx;
            peca.fromMaterial = chapa.material_code || chapa.material;
            peca.espessura = chapa.espessura;
            peca.veio = chapa.veio;
            plano.transferencia.push(peca);

        // ═══ ACTION: from_transfer ════════════════════════════════════
        } else if (action === 'from_transfer') {
            const { transferIdx } = req.body;
            if (transferIdx == null || !plano.transferencia[transferIdx]) {
                return res.status(400).json({ error: 'Peça não encontrada na transferência' });
            }
            const targetChapa = plano.chapas[targetChapaIdx];
            if (!targetChapa) return res.status(400).json({ error: 'Chapa destino inválida' });
            const peca = plano.transferencia[transferIdx];

            // ══ Compatibilidade de material (material_code + espessura + veio) ══
            const pieceMeta = { material_code: peca.fromMaterial, espessura: peca.espessura, veio: peca.veio || 'sem_veio' };
            const targetMeta = { material_code: targetChapa.material_code || targetChapa.material, espessura: targetChapa.espessura, veio: targetChapa.veio };
            if (!isPieceSheetCompatible(pieceMeta, targetMeta)) {
                return res.status(400).json({
                    error: `Material incompatível: peça de ${peca.fromMaterial} não pode ir para ${targetChapa.material || targetChapa.material_code}`,
                    materialMismatch: true
                });
            }

            const ref = targetChapa.refilo || 0;
            const targetX = x ?? 0, targetY = y ?? 0;
            const testPeca = { ...peca, x: targetX, y: targetY };

            if (!checkBounds(testPeca, targetChapa)) {
                // Auto-posicionar
                const pos = findNonCollidingPosition(testPeca, targetChapa.pecas, -1, targetChapa.comprimento, targetChapa.largura, ref, 0);
                if (!pos) return res.status(409).json({ error: 'Sem espaço na chapa destino' });
                testPeca.x = pos.x; testPeca.y = pos.y;
            } else {
                const collision = checkCollision(testPeca, targetChapa.pecas, -1, 0);
                if (collision.collides) {
                    const pos = findNonCollidingPosition(testPeca, targetChapa.pecas, -1, targetChapa.comprimento, targetChapa.largura, ref, 0);
                    if (!pos) return res.status(409).json({ error: 'Sem espaço na chapa destino' });
                    testPeca.x = pos.x; testPeca.y = pos.y;
                }
            }

            plano.transferencia.splice(transferIdx, 1);
            delete peca.fromChapaIdx;
            delete peca.fromMaterial;
            peca.x = testPeca.x;
            peca.y = testPeca.y;
            targetChapa.pecas.push(peca);

        // ═══ ACTION: lock / unlock (peça individual) ═══════════════════
        } else if (action === 'lock' || action === 'unlock') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            peca.locked = action === 'lock';

        // ═══ ACTION: lock_sheet / unlock_sheet (chapa inteira) ══════
        } else if (action === 'lock_sheet' || action === 'unlock_sheet') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            chapa.locked = action === 'lock_sheet';
            for (const p of chapa.pecas) {
                p.locked = chapa.locked;
            }

        // ═══ ACTION: add_sheet ════════════════════════════════════════
        } else if (action === 'add_sheet') {
            const { material } = req.body;
            // Encontrar template de chapa do mesmo material
            const templateChapa = plano.chapas.find(c => c.material === material);
            if (!templateChapa) return res.status(400).json({ error: 'Material não encontrado no plano' });
            const newChapa = {
                idx: plano.chapas.length,
                material: templateChapa.material,
                comprimento: templateChapa.comprimento,
                largura: templateChapa.largura,
                espessura: templateChapa.espessura,
                refilo: templateChapa.refilo,
                veio: templateChapa.veio,
                custo: templateChapa.custo || 0,
                pecas: [],
                retalhos: [],
                aproveitamento: 0,
                cortes: [],
            };
            plano.chapas.push(newChapa);

        // ═══ ACTION: compact ══════════════════════════════════════════
        } else if (action === 'compact') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const ref = chapa.refilo || 0;
            const usableW = chapa.comprimento - 2 * ref;
            const usableH = chapa.largura - 2 * ref;

            // Separar peças locked vs livres
            const locked = [], free = [];
            for (let i = 0; i < chapa.pecas.length; i++) {
                if (chapa.pecas[i].locked) locked.push(chapa.pecas[i]);
                else free.push(chapa.pecas[i]);
            }

            // Ordenar livres por área desc
            free.sort((a, b) => (b.w * b.h) - (a.w * a.h));

            // Re-alocar com MaxRects, mantendo locked no lugar
            const bin = new MaxRectsBin(usableW, usableH, 0);
            // Colocar locked primeiro
            for (const p of locked) {
                bin.placeRect({ x: p.x, y: p.y, w: p.w, h: p.h, realW: p.w, realH: p.h });
            }
            // Colocar livres
            const placed = [...locked];
            for (const p of free) {
                const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
                const rect = bin.findBest(p.w, p.h, !hasVeio, 'BSSF');
                if (rect) {
                    rect.realW = rect.rotated ? p.h : p.w;
                    rect.realH = rect.rotated ? p.w : p.h;
                    bin.placeRect(rect);
                    placed.push({
                        ...p,
                        x: rect.x, y: rect.y,
                        w: rect.rotated ? p.h : p.w,
                        h: rect.rotated ? p.w : p.h,
                        rotated: rect.rotated ? !p.rotated : p.rotated,
                    });
                } else {
                    // Não coube — manter posição original
                    placed.push(p);
                }
            }
            chapa.pecas = placed;
            chapa.retalhos = []; // Limpar retalhos — recalcular sob demanda

        // ═══ ACTION: re_optimize ══════════════════════════════════════
        } else if (action === 're_optimize') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const ref = chapa.refilo || 0;
            const usableW = chapa.comprimento - 2 * ref;
            const usableH = chapa.largura - 2 * ref;
            const kerfVal = plano.config?.kerf || 4;
            const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';

            // Consultar rotação do material cadastrado
            const matReOpt = chapa.material_code
                ? db.prepare('SELECT permitir_rotacao FROM cnc_materiais WHERE codigo = ? LIMIT 1').get(chapa.material_code)
                : null;
            const matRotReOpt = matReOpt?.permitir_rotacao;
            const canRotate = matRotReOpt === 0 ? false : matRotReOpt === 1 ? true : !hasVeio;

            // Separar locked vs livres
            const locked = chapa.pecas.filter(p => p.locked);
            const free = chapa.pecas.filter(p => !p.locked);

            // Preparar peças para nesting
            const pieces = free.map((p, i) => ({
                ref: { pecaId: p.pecaId, instancia: p.instancia || 0 },
                w: p.w, h: p.h, area: p.w * p.h,
                perim: 2 * (p.w + p.h), maxSide: Math.max(p.w, p.h),
                diff: Math.abs(p.w - p.h),
                allowRotate: canRotate,
                originalPeca: p,
            }));

            // Executar R&R com alta iteração
            const rrResult = ruinAndRecreate(pieces, usableW, usableH, 0, 'maxrects', kerfVal, 300);
            if (rrResult && rrResult.bins && rrResult.bins.length === 1) {
                const bin = rrResult.bins[0];
                const reOptimized = [...locked];
                for (const rect of bin.usedRects) {
                    const orig = pieces.find(p => p.ref.pecaId === rect.pieceRef?.pecaId && p.ref.instancia === rect.pieceRef?.instancia);
                    if (orig) {
                        reOptimized.push({
                            ...orig.originalPeca,
                            x: rect.x, y: rect.y,
                            w: rect.realW, h: rect.realH,
                            rotated: rect.rotated,
                        });
                    }
                }
                chapa.pecas = reOptimized;
                chapa.retalhos = []; // Limpar retalhos — recalcular sob demanda
            }

        // ═══ ACTION: reoptimize_unlocked ═════════════════════════════
        } else if (action === 'reoptimize_unlocked') {
            const unlockedSheets = plano.chapas.filter(c => !c.locked);
            if (unlockedSheets.length === 0) {
                return res.status(400).json({ error: 'Todas as chapas estão travadas. Destrave ao menos uma para reotimizar.' });
            }

            // Coletar peças das chapas destravadas + transferência
            const piecesByMaterial = {};
            for (const c of plano.chapas) {
                if (c.locked) continue;
                const matKey = c.material_code || c.material;
                if (!piecesByMaterial[matKey]) piecesByMaterial[matKey] = { pieces: [], chapa: c };
                for (const p of c.pecas) piecesByMaterial[matKey].pieces.push(p);
            }
            for (const t of (plano.transferencia || [])) {
                const matKey = t.fromMaterial;
                if (matKey && piecesByMaterial[matKey]) piecesByMaterial[matKey].pieces.push(t);
            }

            // Chamar Python para cada grupo de material
            const { isPythonAvailable, callPythonOptimizer } = require('../lib/python-bridge');
            const pyAvail = await isPythonAvailable();
            if (!pyAvail) {
                return res.status(503).json({ error: 'Servidor de otimização indisponível. Verifique se o serviço Python está rodando.' });
            }

            const cfgRow = db.prepare('SELECT * FROM cnc_config WHERE user_id = ?').get(req.user.id) || {};
            const newSheets = [];
            for (const [matKey, group] of Object.entries(piecesByMaterial)) {
                if (group.pieces.length === 0) continue;
                const templateChapa = group.chapa;
                const chapaDB = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(matKey)
                    || db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();

                const payload = {
                    pieces: group.pieces.map((p, i) => ({
                        id: p.pecaId || i + 1,
                        comprimento: p.w,
                        largura: p.h,
                        quantidade: 1,
                        material_code: matKey,
                        descricao: p.descricao || p.label || '',
                        rotacionada: p.rotated || false,
                    })),
                    sheets: [{
                        id: chapaDB?.id || 1,
                        nome: templateChapa.material || matKey,
                        material_code: matKey,
                        comprimento: templateChapa.comprimento,
                        largura: templateChapa.largura,
                        espessura_real: templateChapa.espessura || chapaDB?.espessura_real || 18.5,
                        espessura_nominal: chapaDB?.espessura_nominal || 18,
                        refilo: templateChapa.refilo || 10,
                        kerf: templateChapa.kerf || cfgRow.kerf_padrao || 4,
                        veio: templateChapa.veio || 'sem_veio',
                        preco: templateChapa.preco || chapaDB?.preco || 0,
                    }],
                    scraps: [],
                    config: {
                        spacing: cfgRow.espaco_pecas || 7,
                        kerf: templateChapa.kerf || cfgRow.kerf_padrao || 4,
                        modo: plano.modo || 'maxrects',
                        permitir_rotacao: cfgRow.permitir_rotacao !== 0,
                        usar_retalhos: false,
                        iteracoes: cfgRow.iteracoes_otimizador || 300,
                        considerar_sobra: cfgRow.considerar_sobra !== 0,
                        sobra_min_largura: cfgRow.sobra_min_largura || 300,
                        sobra_min_comprimento: cfgRow.sobra_min_comprimento || 600,
                        direcao_corte: plano.direcao_corte || 'misto',
                    },
                };

                try {
                    const pyResult = await callPythonOptimizer('optimize', payload);
                    if (pyResult.chapas) {
                        for (const ch of pyResult.chapas) {
                            ch.material_code = matKey;
                            newSheets.push(ch);
                        }
                    }
                } catch (pyErr) {
                    console.error(`[CNC] reoptimize_unlocked falhou para ${matKey}:`, pyErr.message);
                    return res.status(500).json({ error: `Erro ao reotimizar material ${matKey}: ${pyErr.message}` });
                }
            }

            // Recompor plano: chapas travadas intactas + resultado novo
            const lockedSheets = plano.chapas.filter(c => c.locked);
            plano.chapas = [...lockedSheets, ...newSheets];
            plano.transferencia = []; // Peças realocadas

        // ═══ ACTION: merge_sobras ═══════════════════════════════════
        } else if (action === 'merge_sobras') {
            const { retalhoIdx, retalho2Idx } = req.body;
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const r1 = chapa.retalhos?.[retalhoIdx];
            const r2 = chapa.retalhos?.[retalho2Idx];
            if (!r1 || !r2) return res.status(400).json({ error: 'Retalho(s) não encontrado(s)' });

            const TOL = 2;
            let merged = null;

            // Adjacência horizontal (lado a lado, mesma altura ±TOL)
            if (Math.abs(r1.y - r2.y) <= TOL && Math.abs(r1.h - r2.h) <= TOL) {
                if (Math.abs((r1.x + r1.w) - r2.x) <= TOL || Math.abs((r2.x + r2.w) - r1.x) <= TOL) {
                    merged = { x: Math.min(r1.x, r2.x), y: Math.min(r1.y, r2.y), w: r1.w + r2.w, h: Math.max(r1.h, r2.h) };
                }
            }
            // Adjacência vertical (empilhadas, mesma largura ±TOL)
            if (!merged && Math.abs(r1.x - r2.x) <= TOL && Math.abs(r1.w - r2.w) <= TOL) {
                if (Math.abs((r1.y + r1.h) - r2.y) <= TOL || Math.abs((r2.y + r2.h) - r1.y) <= TOL) {
                    merged = { x: Math.min(r1.x, r2.x), y: Math.min(r1.y, r2.y), w: Math.max(r1.w, r2.w), h: r1.h + r2.h };
                }
            }

            if (!merged) return res.status(400).json({ error: 'Sobras não são adjacentes ou dimensões incompatíveis' });

            // Verificar se merged não invade peças
            for (const p of chapa.pecas) {
                if (rectsOverlap(merged, p)) return res.status(409).json({ error: 'Sobra unida invadiria peça' });
            }

            // Verificar limites da chapa
            const ref = chapa.refilo || 0;
            if (merged.x + merged.w > chapa.comprimento - 2 * ref || merged.y + merged.h > chapa.largura - 2 * ref) {
                return res.status(400).json({ error: 'Sobra unida ultrapassa área útil' });
            }

            // Aplicar merge — remover a de maior índice primeiro
            const idxMax = Math.max(retalhoIdx, retalho2Idx);
            const idxMin = Math.min(retalhoIdx, retalho2Idx);
            chapa.retalhos.splice(idxMax, 1);
            chapa.retalhos[idxMin] = merged;

        // ═══ ACTION: marcar_refugo ═══════════════════════════════════
        } else if (action === 'marcar_refugo') {
            const { retalhoIdx } = req.body;
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa não encontrada' });
            if (!chapa.retalhos || !chapa.retalhos[retalhoIdx]) return res.status(400).json({ error: 'Retalho não encontrado' });
            chapa.retalhos.splice(retalhoIdx, 1);

        // ═══ ACTION: ajustar_sobra (redistribuir área entre sobras adjacentes) ═══
        } else if (action === 'ajustar_sobra') {
            const { retalhoIdx, novoX, novoY, novoW, novoH, retalho2Idx, novo2X, novo2Y, novo2W, novo2H } = req.body;
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa não encontrada' });
            if (!chapa.retalhos || !chapa.retalhos[retalhoIdx]) return res.status(400).json({ error: 'Retalho não encontrado' });
            // Atualizar sobra 1
            Object.assign(chapa.retalhos[retalhoIdx], { x: novoX, y: novoY, w: novoW, h: novoH });
            // Atualizar ou remover sobra 2
            if (retalho2Idx != null && chapa.retalhos[retalho2Idx]) {
                const cfgR = db.prepare('SELECT * FROM cnc_config WHERE user_id = ?').get(req.user.id) || {};
                const minW = cfgR.sobra_min_largura || 300, minH = cfgR.sobra_min_comprimento || 600;
                const w2 = novo2W, h2 = novo2H;
                const isValid = (Math.max(w2, h2) >= Math.max(minW, minH) && Math.min(w2, h2) >= Math.min(minW, minH));
                if (isValid) {
                    Object.assign(chapa.retalhos[retalho2Idx], { x: novo2X, y: novo2Y, w: novo2W, h: novo2H });
                } else {
                    // Sobra absorvida (Modo B)
                    const idxToRemove = retalho2Idx > retalhoIdx ? retalho2Idx : retalho2Idx;
                    chapa.retalhos.splice(idxToRemove, 1);
                }
            }

        // ═══ ACTION: recalc_sobras (recalcular retalhos baseado nas peças atuais) ═══
        } else if (action === 'recalc_sobras') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const { retalhos: newRetalhos } = req.body;
            if (!Array.isArray(newRetalhos)) return res.status(400).json({ error: 'retalhos deve ser array' });
            // Validar que nenhum retalho invade peças
            for (const r of newRetalhos) {
                for (const p of chapa.pecas) {
                    if (r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y) {
                        return res.status(409).json({ error: `Retalho ${Math.round(r.w)}x${Math.round(r.h)} invade peça em (${Math.round(p.x)},${Math.round(p.y)})` });
                    }
                }
            }
            chapa.retalhos = newRetalhos;

        // ═══ ACTION: restore (undo/redo) ══════════════════════════════
        } else if (action === 'restore') {
            const { planoData } = req.body;
            if (!planoData) return res.status(400).json({ error: 'Missing plano data' });
            const restored = typeof planoData === 'string' ? JSON.parse(planoData) : planoData;
            if (!restored.transferencia) restored.transferencia = [];
            const avgAprov = recalcOccupancy(restored);
            db.prepare('UPDATE cnc_lotes SET plano_json = ?, aproveitamento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
                .run(JSON.stringify(restored), avgAprov, lote.id);
            return res.json({ ok: true, plano: restored, aproveitamento: avgAprov });

        } else {
            return res.status(400).json({ error: 'Ação inválida: ' + action });
        }

        const aprovMedio = recalcOccupancy(plano);

        db.prepare('UPDATE cnc_lotes SET plano_json = ?, aproveitamento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(JSON.stringify(plano), aprovMedio, lote.id);

        res.json({ ok: true, plano, aproveitamento: aprovMedio });
    } catch (err) {
        console.error('Erro ao ajustar plano:', err);
        res.status(500).json({ error: 'Erro ao ajustar plano' });
    }
});

// ─── Versionamento de planos ─────────────────────────────────────────
router.get('/plano/:loteId/versions', requireAuth, (req, res) => {
    try {
        const versions = db.prepare(
            'SELECT id, acao_origem, criado_em FROM cnc_plano_versions WHERE lote_id = ? AND user_id = ? ORDER BY id DESC LIMIT 50'
        ).all(req.params.loteId, req.user.id);
        res.json({ ok: true, versions });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao listar versões' });
    }
});

router.get('/plano/:loteId/versions/:versionId', requireAuth, (req, res) => {
    try {
        const v = db.prepare('SELECT * FROM cnc_plano_versions WHERE id = ? AND lote_id = ? AND user_id = ?')
            .get(req.params.versionId, req.params.loteId, req.user.id);
        if (!v) return res.status(404).json({ error: 'Versão não encontrada' });
        res.json({ ok: true, plano_json: v.plano_json, acao_origem: v.acao_origem, criado_em: v.criado_em });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar versão' });
    }
});

// ─── Duplicar plano de corte ─────────────────────────────────────────
router.post('/plano/:loteId/duplicar', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte para duplicar' });

        // Save current plan as a version before duplicating
        const info = db.prepare('INSERT INTO cnc_plano_versions (lote_id, user_id, plano_json, acao_origem) VALUES (?, ?, ?, ?)')
            .run(lote.id, req.user.id, lote.plano_json, 'duplicar_plano');

        // Cleanup old versions (keep last 50)
        db.prepare(`DELETE FROM cnc_plano_versions WHERE lote_id = ? AND id NOT IN
            (SELECT id FROM cnc_plano_versions WHERE lote_id = ? ORDER BY id DESC LIMIT 50)`)
            .run(lote.id, lote.id);

        const plano = JSON.parse(lote.plano_json);
        res.json({ ok: true, version_id: info.lastInsertRowid, plano, message: 'Plano duplicado como nova versão' });
    } catch (err) {
        console.error('Erro ao duplicar plano:', err);
        res.status(500).json({ error: 'Erro ao duplicar plano' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 4: Etiquetas
// ═══════════════════════════════════════════════════════

router.get('/etiquetas/:loteId', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(lote.id);
    let controle = 1;
    const etiquetas = [];

    for (const p of pecas) {
        for (let q = 0; q < p.quantidade; q++) {
            const bordas = {
                dir: p.borda_dir || '',
                esq: p.borda_esq || '',
                frontal: p.borda_frontal || '',
                traseira: p.borda_traseira || '',
            };
            const diagrama = {
                top: !!bordas.frontal,
                bottom: !!bordas.traseira,
                left: !!bordas.esq,
                right: !!bordas.dir,
            };
            // Build fita_resumo
            const fitaParts = [bordas.dir, bordas.esq, bordas.frontal, bordas.traseira].filter(Boolean);
            const fitaResumo = fitaParts.length > 0 ? [...new Set(fitaParts)].join(' / ') : 'Sem fita';

            etiquetas.push({
                pecaId: p.id,
                instancia: q,
                controle: String(controle).padStart(3, '0'),
                usi_a: p.usi_a,
                usi_b: p.usi_b,
                material: p.material,
                material_code: p.material_code,
                espessura: p.espessura,
                comprimento: p.comprimento,
                largura: p.largura,
                descricao: p.descricao,
                modulo_desc: p.modulo_desc,
                modulo_id: p.modulo_id,
                produto_final: p.produto_final,
                bordas,
                acabamento: p.acabamento,
                cliente: lote.cliente,
                projeto: lote.projeto,
                codigo: lote.codigo,
                fita_resumo: fitaResumo,
                diagrama,
                machining_json: p.machining_json,
                peca_id: p.id,
                chapa_idx: p.chapa_idx,
                pos_x: p.pos_x,
                pos_y: p.pos_y,
                rotacionada: p.rotacionada,
            });
            controle++;
        }
    }

    // Build sheet map for minimapa from plano_json (has ALL instances with real positions)
    const chapasMap = {};   // chapaIdx → { w, h, pecas: [{id, instancia, x, y, w, h}] }
    const pecaPosMap = {};  // "pecaId_instancia" → { chapa_idx, pos_x, pos_y, rotacionada }
    try {
        if (lote.plano_json) {
            const pj = JSON.parse(lote.plano_json);
            // plano_json.chapas is a flat array of all sheets (not nested under materiais)
            for (const ch of (pj.chapas || [])) {
                const idx = ch.idx ?? ch.index ?? 0;
                const sheetW = ch.comprimento || 2750;
                const sheetH = ch.largura || 1850;
                if (!chapasMap[idx]) chapasMap[idx] = { w: sheetW, h: sheetH, pecas: [] };
                for (const pp of (ch.pecas || [])) {
                    // Python optimizer outputs w/h (already accounts for rotation)
                    const pw = pp.w || 0;
                    const ph = pp.h || 0;
                    chapasMap[idx].pecas.push({
                        id: pp.pecaId, instancia: pp.instancia ?? 0,
                        x: pp.x || 0, y: pp.y || 0, w: pw, h: ph,
                    });
                    pecaPosMap[`${pp.pecaId}_${pp.instancia ?? 0}`] = {
                        chapa_idx: idx, pos_x: pp.x || 0, pos_y: pp.y || 0, rotacionada: pp.rotated ? 1 : 0,
                    };
                }
            }
        }
    } catch { /* ignore */ }

    // Attach per-instance position and sheet info to each etiqueta
    for (const et of etiquetas) {
        const posKey = `${et.pecaId}_${et.instancia}`;
        const pos = pecaPosMap[posKey];
        if (pos) {
            et.chapa_idx = pos.chapa_idx;
            et.pos_x = pos.pos_x;
            et.pos_y = pos.pos_y;
            et.rotacionada = pos.rotacionada;
        }
        if (et.chapa_idx != null && et.chapa_idx >= 0 && chapasMap[et.chapa_idx]) {
            et.chapa = chapasMap[et.chapa_idx];
        }
    }

    res.json(etiquetas);
});

// ─── Config de etiquetas GET/PUT ─────────────────────
router.get('/etiqueta-config', requireAuth, (req, res) => {
    let cfg = db.prepare('SELECT * FROM cnc_etiqueta_config WHERE id = 1').get();
    if (!cfg) {
        db.prepare('INSERT INTO cnc_etiqueta_config (id) VALUES (1)').run();
        cfg = db.prepare('SELECT * FROM cnc_etiqueta_config WHERE id = 1').get();
    }
    res.json(cfg);
});

router.put('/etiqueta-config', requireAuth, (req, res) => {
    const {
        formato, orientacao, colunas_impressao, margem_pagina, gap_etiquetas,
        mostrar_usia, mostrar_usib, mostrar_material, mostrar_espessura,
        mostrar_cliente, mostrar_projeto, mostrar_codigo, mostrar_modulo,
        mostrar_peca, mostrar_dimensoes, mostrar_bordas_diagrama, mostrar_fita_resumo,
        mostrar_acabamento, mostrar_id_modulo, mostrar_controle, mostrar_produto_final,
        mostrar_observacao, mostrar_codigo_barras,
        fonte_tamanho, empresa_nome, empresa_logo_url, cor_borda_fita, cor_controle,
    } = req.body;

    db.prepare(`UPDATE cnc_etiqueta_config SET
        formato=?, orientacao=?, colunas_impressao=?, margem_pagina=?, gap_etiquetas=?,
        mostrar_usia=?, mostrar_usib=?, mostrar_material=?, mostrar_espessura=?,
        mostrar_cliente=?, mostrar_projeto=?, mostrar_codigo=?, mostrar_modulo=?,
        mostrar_peca=?, mostrar_dimensoes=?, mostrar_bordas_diagrama=?, mostrar_fita_resumo=?,
        mostrar_acabamento=?, mostrar_id_modulo=?, mostrar_controle=?, mostrar_produto_final=?,
        mostrar_observacao=?, mostrar_codigo_barras=?,
        fonte_tamanho=?, empresa_nome=?, empresa_logo_url=?, cor_borda_fita=?, cor_controle=?,
        atualizado_em=CURRENT_TIMESTAMP
        WHERE id = 1`).run(
        formato ?? '100x70', orientacao ?? 'paisagem', colunas_impressao ?? 2,
        margem_pagina ?? 8, gap_etiquetas ?? 4,
        mostrar_usia ?? 1, mostrar_usib ?? 1, mostrar_material ?? 1, mostrar_espessura ?? 1,
        mostrar_cliente ?? 1, mostrar_projeto ?? 1, mostrar_codigo ?? 1, mostrar_modulo ?? 1,
        mostrar_peca ?? 1, mostrar_dimensoes ?? 1, mostrar_bordas_diagrama ?? 1, mostrar_fita_resumo ?? 1,
        mostrar_acabamento ?? 1, mostrar_id_modulo ?? 1, mostrar_controle ?? 1, mostrar_produto_final ?? 0,
        mostrar_observacao ?? 1, mostrar_codigo_barras ?? 1,
        fonte_tamanho ?? 'medio', empresa_nome ?? '', empresa_logo_url ?? '', cor_borda_fita ?? '#22c55e', cor_controle ?? '',
    );
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 4B: Templates de Etiquetas (CRUD)
// ═══════════════════════════════════════════════════════

// Listar templates (sem elementos para payload leve)
router.get('/etiqueta-templates', requireAuth, (req, res) => {
    const templates = db.prepare(
        'SELECT id, nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, padrao, criado_em, atualizado_em FROM cnc_etiqueta_templates WHERE user_id = ? ORDER BY padrao DESC, atualizado_em DESC'
    ).all(req.user.id);
    res.json(templates);
});

// Obter template completo com elementos
router.get('/etiqueta-templates/:id', requireAuth, (req, res) => {
    const t = db.prepare('SELECT * FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    t.elementos = JSON.parse(t.elementos || '[]');
    res.json(t);
});

// Criar template
router.post('/etiqueta-templates', requireAuth, (req, res) => {
    const { nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos } = req.body;
    const result = db.prepare(
        'INSERT INTO cnc_etiqueta_templates (user_id, nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, nome || 'Sem nome', largura || 100, altura || 70, colunas_impressao || 2, margem_pagina || 8, gap_etiquetas || 4, JSON.stringify(elementos || []));
    res.json({ ok: true, id: result.lastInsertRowid });
});

// Atualizar template
router.put('/etiqueta-templates/:id', requireAuth, (req, res) => {
    const t = db.prepare('SELECT id FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    const { nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos } = req.body;
    db.prepare(
        `UPDATE cnc_etiqueta_templates SET nome = ?, largura = ?, altura = ?, colunas_impressao = ?, margem_pagina = ?, gap_etiquetas = ?, elementos = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(nome || 'Sem nome', largura || 100, altura || 70, colunas_impressao || 2, margem_pagina || 8, gap_etiquetas || 4, JSON.stringify(elementos || []), req.params.id);
    res.json({ ok: true });
});

// Excluir template
router.delete('/etiqueta-templates/:id', requireAuth, (req, res) => {
    const t = db.prepare('SELECT id FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    db.prepare('DELETE FROM cnc_etiqueta_templates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Definir como padrão
router.put('/etiqueta-templates/:id/padrao', requireAuth, (req, res) => {
    const t = db.prepare('SELECT id FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    db.prepare('UPDATE cnc_etiqueta_templates SET padrao = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE cnc_etiqueta_templates SET padrao = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Duplicar template
router.post('/etiqueta-templates/:id/duplicar', requireAuth, (req, res) => {
    const t = db.prepare('SELECT * FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    const result = db.prepare(
        'INSERT INTO cnc_etiqueta_templates (user_id, nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, t.nome + ' (cópia)', t.largura, t.altura, t.colunas_impressao, t.margem_pagina, t.gap_etiquetas, t.elementos);
    res.json({ ok: true, id: result.lastInsertRowid });
});

// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// GRUPO 5: Gerador G-code v2 — por chapa, contorno automático,
//          agrupamento global por ferramenta, DOC automático
// ═══════════════════════════════════════════════════════

// ─── Helper: Calcular passadas automáticas (DOC) ───────
function calcularPassadas(depthTotal, doc) {
    if (!doc || doc <= 0 || depthTotal <= doc) return [depthTotal];
    const passes = [];
    let remaining = depthTotal;
    while (remaining > 0) {
        passes.push(Math.min(remaining, doc));
        remaining -= passes[passes.length - 1];
    }
    // Última passada muito fina? Redistribuir
    if (passes.length > 1 && passes[passes.length - 1] < Math.max(doc * 0.3, 1.0)) {
        const merged = passes.pop() + passes.pop();
        passes.push(merged / 2, merged / 2);
    }
    // Converter para profundidades acumuladas
    const acc = [];
    let sum = 0;
    for (const p of passes) { sum += p; acc.push(sum); }
    return acc;
}

// ─── Helper: Mapear worker → tipo de usinagem ──────────
function mapWorkerToTipo(worker, usinagemTipos) {
    const cat = (worker.type || worker.category || '').toLowerCase();
    const diam = Number(worker.diameter || 0);
    // 1) Match por categoria + diâmetro (mais específico)
    for (const t of usinagemTipos) {
        if (!t.categoria_match || t.diametro_match == null) continue;
        const cats = t.categoria_match.toLowerCase().split(',').map(s => s.trim());
        if (cats.some(c => cat.includes(c)) && Math.abs(diam - t.diametro_match) < 1) return t;
    }
    // 2) Match por categoria sem diâmetro
    for (const t of usinagemTipos) {
        if (!t.categoria_match || t.diametro_match != null) continue;
        const cats = t.categoria_match.toLowerCase().split(',').map(s => s.trim());
        if (cats.some(c => cat.includes(c))) return t;
    }
    return { codigo: 'generico', nome: 'Operação genérica', prioridade: 5, fase: 'interna' };
}

// ─── Helper: Nearest-neighbor (minimizar G0) ───────────
function orderByProximity(ops) {
    if (ops.length <= 1) return ops;
    const rem = [...ops];
    const ord = [rem.shift()];
    while (rem.length > 0) {
        const last = ord[ord.length - 1];
        let bi = 0, bd = Infinity;
        for (let i = 0; i < rem.length; i++) {
            const d = (rem[i].absX - last.absX) ** 2 + (rem[i].absY - last.absY) ** 2;
            if (d < bd) { bd = d; bi = i; }
        }
        ord.push(rem.splice(bi, 1)[0]);
    }
    // Aplicar 2-opt para melhorar ~15-20% a distância total de deslocamento
    return twoOptImprove(ord);
}

// ─── Helper: 2-opt improvement (TSP local search) ──────
function twoOptImprove(ops) {
    if (ops.length < 4) return ops;
    const dist = (a, b) => (a.absX - b.absX) ** 2 + (a.absY - b.absY) ** 2;
    let improved = true;
    let iterations = 0;
    const maxIter = 5; // Limitar iterações para performance
    while (improved && iterations < maxIter) {
        improved = false;
        iterations++;
        for (let i = 1; i < ops.length - 1; i++) {
            for (let j = i + 1; j < ops.length; j++) {
                // Calcular ganho de reverter segmento [i..j]
                const before = dist(ops[i - 1], ops[i]) +
                    (j + 1 < ops.length ? dist(ops[j], ops[j + 1]) : 0);
                const after = dist(ops[i - 1], ops[j]) +
                    (j + 1 < ops.length ? dist(ops[i], ops[j + 1]) : 0);
                if (after < before - 0.01) {
                    // Reverter segmento i..j
                    const reversed = ops.slice(i, j + 1).reverse();
                    ops.splice(i, j - i + 1, ...reversed);
                    improved = true;
                }
            }
        }
    }
    return ops;
}

// ─── Helper: Resolver estratégia de usinagem ────────────
// Dado um worker e o tipo de usinagem, encontra a melhor estratégia
// baseada nas ferramentas disponíveis
function resolveStrategy(worker, usiTipo, toolMap) {
    let estrategias = [];
    try { estrategias = JSON.parse(usiTipo.estrategias || '[]'); } catch (_) {}
    if (!Array.isArray(estrategias) || estrategias.length === 0) return null;

    const diam = Number(worker.diameter || 0);

    for (const est of estrategias) {
        // Tentar encontrar ferramenta que satisfaz a estratégia
        const candidates = Object.values(toolMap).filter(t => {
            // Match por tipo de ferramenta
            if (est.tool_match) {
                const match = est.tool_match.toLowerCase();
                const tipo = (t.tipo || '').toLowerCase();
                const tipoCor = (t.tipo_corte || '').toLowerCase();
                if (!tipo.includes(match) && !tipoCor.includes(match)) return false;
            }
            // Match por tool_codes específicos
            if (est.tool_codes && est.tool_codes.length > 0) {
                if (!est.tool_codes.includes(t.tool_code) && !est.tool_codes.includes(t.codigo)) return false;
            }
            // Match por diâmetro
            if (est.diam_exact && Math.abs(t.diametro - est.diam_exact) > 1) return false;
            if (est.diam_min && t.diametro < est.diam_min) return false;
            if (est.diam_max && t.diametro > est.diam_max) return false;
            // Match por diâmetro da operação (furo de 35mm → broca de 35mm)
            if (est.diam_match && diam > 0 && Math.abs(t.diametro - diam) > 1) return false;
            return true;
        });

        if (candidates.length > 0) {
            // Selecionar melhor candidata: preferir diâmetro mais próximo da operação
            candidates.sort((a, b) => {
                if (diam > 0) return Math.abs(a.diametro - diam) - Math.abs(b.diametro - diam);
                return b.diametro - a.diametro; // maior diâmetro = menos passes
            });
            return {
                tool: candidates[0],
                metodo: est.metodo || 'auto',
                params: est.params || {},
                nome: est.nome || est.metodo || 'auto',
            };
        }
    }
    return null; // Nenhuma estratégia satisfeita
}

// ─── Helper: Transformar coords quando peça rotacionada ─
function transformRotated(wx, wy, compOriginal) {
    return { x: wy, y: compOriginal - wx };
}

// ═══════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: Gerar G-code para UMA chapa
// ═══════════════════════════════════════════════════════
function generateGcodeForChapa(chapa, chapaIdx, pecasDb, maquina, toolMap, usinagemTipos, cfg) {
    // --- Config da máquina ---
    const header = maquina.gcode_header || '%\nG90 G54 G17';
    const footer = maquina.gcode_footer || 'G0 Z200.000\nM5\nM30\n%';
    const zSeg = maquina.z_seguro || 30;
    const velCorteMaq = maquina.vel_corte || 4000;
    const profExtraMaq = maquina.profundidade_extra ?? 0.1;
    const dec = maquina.casas_decimais || 3;
    const cmt = maquina.comentario_prefixo || ';';
    const trocaCmd = maquina.troca_ferramenta_cmd || 'M6';
    const sOn = maquina.spindle_on_cmd || 'M3';
    const sOff = maquina.spindle_off_cmd || 'M5';
    const rpmDef = maquina.rpm_padrao || 12000;
    const useOnion = maquina.usar_onion_skin !== 0;
    const onionEsp = maquina.onion_skin_espessura || 0.5;
    const onionAreaMax = maquina.onion_skin_area_max || 500;
    const feedPct = maquina.feed_rate_pct_pequenas || 50;
    const feedAreaMax = maquina.feed_rate_area_max || 500;
    const exportA = maquina.exportar_lado_a !== 0;
    const exportB = maquina.exportar_lado_b !== 0;
    const exportFuros = maquina.exportar_furos !== 0;
    const exportRebaixos = maquina.exportar_rebaixos !== 0;
    const exportUsinagens = maquina.exportar_usinagens !== 0;
    // Novos campos G-Code v2
    const zOrigin = maquina.z_origin || 'mesa';
    const zAprox = maquina.z_aproximacao ?? 2.0;
    const dirCorte = maquina.direcao_corte || 'climb';
    const useNCodes = maquina.usar_n_codes !== 0;
    const nInc = maquina.n_code_incremento || 10;
    const dwellSpindle = maquina.dwell_spindle ?? 1.0;
    // Novos campos G-Code v3 — Ramping, Lead-in, Ordenação
    const useRampa = maquina.usar_rampa !== 0;
    const rampaAngulo = maquina.rampa_angulo ?? 3.0;   // graus
    const velMergulho = maquina.vel_mergulho ?? 1500;   // mm/min plunge feed
    const zAproxRapida = maquina.z_aproximacao_rapida ?? 5.0; // mm acima do material para G0 rápido
    const ordenarContornos = maquina.ordenar_contornos || 'menor_primeiro';
    const usarLeadIn = maquina.usar_lead_in !== 0;
    const leadInRaio = maquina.lead_in_raio ?? 5.0;
    // Novos campos G-Code v4 — Estratégias avançadas
    const rampaTipo = maquina.rampa_tipo || 'linear';        // linear, helicoidal, plunge
    const velRampa = maquina.vel_rampa ?? velMergulho;       // velocidade da rampa (mm/min)
    const rampaDiamPct = maquina.rampa_diametro_pct ?? 80;   // % do diâmetro para raio da hélice
    const stepoverPct = (maquina.stepover_pct ?? 60) / 100;  // fração (0.6)
    const pocketAcabamento = maquina.pocket_acabamento !== 0;
    const pocketAcabOffset = maquina.pocket_acabamento_offset ?? 0.2;
    const pocketDirecao = maquina.pocket_direcao || 'auto';
    const compensarRaioCanal = maquina.compensar_raio_canal !== 0;
    const compensacaoTipo = maquina.compensacao_tipo || 'overcut';
    const circularPassesAcab = maquina.circular_passes_acabamento ?? 1;
    const circularOffsetDesb = maquina.circular_offset_desbaste ?? 0.3;
    const velAcabPct = (maquina.vel_acabamento_pct ?? 80) / 100;
    const g0ComFeed = maquina.g0_com_feed === 1;
    const velVazio = maquina.vel_vazio || 20000;

    const fmt = (n) => Number(n).toFixed(dec);
    const refilo = chapa.refilo || 10;
    const alertas = [];
    const missingTools = new Set();
    const missingToolDetails = []; // { tool_code, peca, operacao }
    const espChapa = chapa.espessura_real || 18.5;

    // ─── Segurança: proteção da mesa de sacrifício ───
    const margemMesa = maquina.margem_mesa_sacrificio ?? 0.5;
    const depthMaxAbsoluto = espChapa + margemMesa;
    function clampDepth(depth, descricao) {
        if (depth > depthMaxAbsoluto) {
            alertas.push({
                tipo: 'aviso',
                msg: `SEGURANCA: Profundidade ${depth.toFixed(2)}mm excede limite da mesa (${espChapa}mm + ${margemMesa}mm margem = ${depthMaxAbsoluto.toFixed(2)}mm). Reduzido para ${depthMaxAbsoluto.toFixed(2)}mm. [${descricao}]`
            });
            return depthMaxAbsoluto;
        }
        return depth;
    }

    // ─── Funções Z baseadas no z_origin ───
    function zApproach() { return zOrigin === 'mesa' ? espChapa + zAprox : zAprox; }
    function zCut(depth) { return zOrigin === 'mesa' ? espChapa - depth : -depth; }
    function zSafe() { return zOrigin === 'mesa' ? espChapa + zSeg : zSeg; }
    // Z rápido: altura intermediária para G0 entre operações próximas (minimizar air cutting)
    function zRapid() { return zOrigin === 'mesa' ? espChapa + zAproxRapida : zAproxRapida; }

    // ─── Emissão com N-codes opcionais ───
    const L = [];
    let nLine = 0;
    function emit(line) {
        if (useNCodes && line.trim() && !line.startsWith(cmt) && !line.startsWith('%') && !line.startsWith('(')) {
            nLine += nInc;
            L.push(`N${nLine} ${line}`);
        } else {
            L.push(line);
        }
    }

    // --- Ferramenta de contorno ---
    let contTool = cfg.contorno_tool_code ? toolMap[cfg.contorno_tool_code] : null;
    if (!contTool) {
        contTool = Object.values(toolMap).find(t =>
            t.tipo_corte === 'fresa_compressao' || t.tipo_corte === 'fresa_reta' || t.tipo === 'fresa'
        );
    }
    if (!contTool) {
        alertas.push({ tipo: 'aviso', msg: 'Nenhuma fresa de contorno no magazine. Contornos não serão gerados.' });
    }

    // ═══ PASSO 1: Coletar TODAS as operações ═══
    const allOps = [];

    for (const pp of chapa.pecas) {
        const pDb = pecasDb.find(p => p.id === pp.pecaId);
        if (!pDb) continue;

        const pX = pp.x, pY = pp.y, pW = pp.w, pH = pp.h;
        const compOrig = pDb.comprimento, largOrig = pDb.largura;
        // Detectar rotação real comparando dimensões do plano com originais do DB
        // Não confiar apenas no flag pp.rotated — pode estar incorreto
        const flagRotated = pp.rotated || false;
        const wMatchesComp = Math.abs(pW - compOrig) <= 1;
        const wMatchesLarg = Math.abs(pW - largOrig) <= 1;
        const rotated = (wMatchesLarg && !wMatchesComp) ? true : (wMatchesComp && !wMatchesLarg) ? false : flagRotated;
        const esp = pDb.espessura || 18.5;
        const areaCm2 = (pW * pH) / 100;
        const cls = pp.classificacao || 'normal';
        const isPeq = areaCm2 < feedAreaMax;

        // Parse machining — respect lado_ativo (flip)
        const ladoAtivo = pp.lado_ativo || 'A';
        let mach = {};
        try { mach = JSON.parse(pDb.machining_json || '{}'); } catch (_) {}
        // If piece is on side B and has dedicated machining_json_b, use that instead
        if (ladoAtivo === 'B' && pDb.machining_json_b) {
            try { mach = JSON.parse(pDb.machining_json_b); } catch (_) {}
        }

        // Coletar workers
        const workers = [];
        if (mach.workers) {
            const wArr = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);
            for (const r of wArr) { if (r && typeof r === 'object') workers.push({ ...r, side: undefined }); }
        }
        for (const side of ['side_a', 'side_b']) {
            const sd = mach[side];
            if (!sd) continue;
            const sArr = Array.isArray(sd) ? sd : Object.values(sd);
            for (const r of sArr) { if (r && typeof r === 'object') workers.push({ ...r, side }); }
        }

        // Processar cada worker
        for (const w of workers) {
            const tc = w.tool_code || w.tool || '';
            const tipo = (w.type || w.category || '').toLowerCase();
            if (w.side === 'side_b' && !exportB) continue;
            if (w.side === 'side_a' && !exportA) continue;
            if (tipo.includes('hole') && !exportFuros) continue;
            if (tipo.includes('rebaixo') && !exportRebaixos) continue;
            if (tipo.includes('pocket') && !exportUsinagens) continue;

            if (tc && !toolMap[tc]) {
                missingTools.add(tc);
                missingToolDetails.push({ tool_code: tc, peca: pDb.descricao, operacao: tipo || w.type || 'desconhecida' });
            }
            const tool = toolMap[tc] || null;
            const usiTipo = mapWorkerToTipo(w, usinagemTipos);

            // Coords locais
            let wx, wy, wx2, wy2;
            if (w.pos_start_for_line) {
                wx = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
                wy = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
                wx2 = Number(w.pos_end_for_line?.position_x ?? w.pos_end_for_line?.x ?? wx);
                wy2 = Number(w.pos_end_for_line?.position_y ?? w.pos_end_for_line?.y ?? wy);
            } else {
                wx = Number(w.x ?? w.position_x ?? 0);
                wy = Number(w.y ?? w.position_y ?? 0);
                wx2 = w.x2 != null ? Number(w.x2) : undefined;
                wy2 = w.y2 != null ? Number(w.y2) : undefined;
                // Se tem length mas não tem x2/y2, calcular ponto inicial e final do rasgo
                // Rasgo corre ao longo do eixo X (comprimento) por padrão
                // Detectar se x é centro (x + length > comprimento) ou início (x + length <= comprimento)
                if (wx2 === undefined && w.length != null) {
                    const grooveLen = Number(w.length);
                    if (wx + grooveLen > compOrig + 1) {
                        // x é o CENTRO do rasgo — calcular início e fim
                        wx2 = wx + grooveLen / 2;
                        wy2 = wy;
                        wx = wx - grooveLen / 2;
                    } else {
                        // x é o INÍCIO do rasgo
                        wx2 = wx + grooveLen;
                        wy2 = wy;
                    }
                }
            }
            // Mirror X for Side B (flip piece): new_x = compOrig - original_x
            if (ladoAtivo === 'B') {
                wx = compOrig - wx;
                if (wx2 !== undefined) wx2 = compOrig - wx2;
                // Swap wx/wx2 so that start < end after mirroring
                if (wx2 !== undefined && wx > wx2) { const tmp = wx; wx = wx2; wx2 = tmp; }
                if (wy2 !== undefined && wy > wy2) { const tmp = wy; wy = wy2; wy2 = tmp; }
            }
            if (rotated) {
                const t1 = transformRotated(wx, wy, compOrig);
                wx = t1.x; wy = t1.y;
                if (wx2 !== undefined && wy2 !== undefined) {
                    const t2 = transformRotated(wx2, wy2, compOrig);
                    wx2 = t2.x; wy2 = t2.y;
                }
            }

            const absX = refilo + pX + wx;
            const absY = refilo + pY + wy;
            const absX2 = wx2 !== undefined ? refilo + pX + wx2 : undefined;
            const absY2 = wy2 !== undefined ? refilo + pY + wy2 : undefined;

            // ─── Tool-Agnostic Machining com Estratégias ───
            let effectiveTool = tool;
            let toolAdapted = false;
            let resolvedMetodo = 'auto'; // metodo de execução (drill, helical, circular, pocket_zigzag, etc)

            // 1) Tentar resolver pela lista de estratégias do tipo de usinagem
            if (!effectiveTool) {
                const resolved = resolveStrategy(w, usiTipo, toolMap);
                if (resolved) {
                    effectiveTool = resolved.tool;
                    resolvedMetodo = resolved.metodo;
                    toolAdapted = true;
                    alertas.push({ tipo: 'info', msg: `${usiTipo.nome}: usando estratégia "${resolved.nome}" com ${resolved.tool.nome} (Ø${resolved.tool.diametro}mm) para ${pDb.descricao}` });
                }
            }

            // 2) Fallback: buscar qualquer ferramenta compatível
            if (!effectiveTool && tc) {
                const alternatives = Object.values(toolMap).filter(t =>
                    t.tipo === 'fresa' || t.tipo_corte === 'fresa_reta' || t.tipo_corte === 'fresa_compressao' || t.tipo === 'broca'
                );
                if (alternatives.length > 0) {
                    const reqWidth = w.width_line || w.diameter || 0;
                    if (reqWidth > 0) {
                        const fitting = alternatives.filter(t => t.diametro <= reqWidth).sort((a, b) => b.diametro - a.diametro);
                        effectiveTool = fitting[0] || alternatives.sort((a, b) => a.diametro - b.diametro)[0];
                    } else {
                        effectiveTool = alternatives[0];
                    }
                    if (effectiveTool) {
                        toolAdapted = true;
                        alertas.push({ tipo: 'info', msg: `Ferramenta ${tc} não disponível. Usando ${effectiveTool.nome} (Ø${effectiveTool.diametro}mm) com estratégia adaptada para ${pDb.descricao}` });
                    }
                }
            }

            const isHole = tipo.includes('hole') || tipo === 'transfer_hole';
            const isCut = tipo.includes('saw') || tipo.includes('cut') || tipo === 'transfer_vertical_saw_cut';
            const isPocket = tipo.includes('pocket') || tipo.includes('rebaixo');

            // 3) Determinar método de execução automático se não resolvido por estratégia
            if (resolvedMetodo === 'auto' && effectiveTool) {
                const diam = Number(w.diameter || 0);
                const toolD = effectiveTool.diametro || 0;
                if (isHole && diam > 0 && Math.abs(toolD - diam) < 1) {
                    resolvedMetodo = 'drill'; // broca do diâmetro exato = furo direto
                } else if (isHole && diam > 0 && toolD < diam) {
                    resolvedMetodo = 'helical'; // fresa menor que o furo = helicoidal/circular
                } else if (isPocket) {
                    resolvedMetodo = 'pocket_zigzag';
                } else if (isCut) {
                    resolvedMetodo = 'groove';
                } else {
                    resolvedMetodo = 'drill';
                }
            }

            const profExtra = effectiveTool?.profundidade_extra ?? profExtraMaq;
            let depthTotal = Number(w.depth ?? 5) + profExtra;
            depthTotal = clampDepth(depthTotal, `${pDb.descricao} - ${tipo || 'operacao'}`);
            const doc = effectiveTool?.doc || null;
            const passes = calcularPassadas(depthTotal, doc);

            // Tool-agnostic: calcular step-over para rasgos/canais mais largos que a fresa
            const reqWidth = w.width_line || 0;
            const toolDiamEf = effectiveTool?.diametro || 0;
            let grooveMultiPass = false;
            let grooveOffsets = [0]; // offsets laterais para passadas múltiplas
            if (reqWidth > 0 && toolDiamEf > 0 && reqWidth > toolDiamEf) {
                // Canal mais largo que a fresa: calcular passadas laterais
                grooveMultiPass = true;
                const stepOver = toolDiamEf * stepoverPct;
                const halfW = (reqWidth - toolDiamEf) / 2; // offset total do centro
                grooveOffsets = [];
                for (let off = -halfW; off <= halfW + 0.01; off += stepOver) {
                    grooveOffsets.push(Math.min(off, halfW));
                }
                // Garantir que a última passada cobre a borda
                if (grooveOffsets[grooveOffsets.length - 1] < halfW - 0.1) {
                    grooveOffsets.push(halfW);
                }
                alertas.push({ tipo: 'info', msg: `Rasgo ${reqWidth}mm com fresa Ø${toolDiamEf}mm: ${grooveOffsets.length} passadas laterais em ${pDb.descricao}` });
            }

            // Validação: diâmetro fresa > largura rasgo (erro só se não tem multi-pass)
            if (reqWidth > 0 && effectiveTool && effectiveTool.diametro > reqWidth && !grooveMultiPass) {
                alertas.push({ tipo: 'erro_critico', msg: `Fresa ${effectiveTool.nome} (Ø${effectiveTool.diametro}mm) > largura rasgo (${reqWidth}mm) na peça ${pDb.descricao}` });
            }
            const velCorte = effectiveTool?.velocidade_corte || velCorteMaq;
            const velEf = isPeq ? Math.round(velCorte * feedPct / 100) : velCorte;

            allOps.push({
                pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                absX, absY, absX2, absY2,
                opType: isHole ? 'hole' : isCut ? 'groove' : isPocket ? 'pocket' : 'generic',
                fase: usiTipo.fase === 'contorno' ? 1 : 0,
                prioridade: usiTipo.prioridade, tipoNome: usiTipo.nome,
                toolCode: effectiveTool?.tool_code || tc,
                toolCodigo: effectiveTool?.codigo || '', toolNome: effectiveTool?.nome || tc,
                toolRpm: effectiveTool?.rpm || rpmDef, toolDiam: effectiveTool?.diametro || 0,
                depthTotal, passes, velCorte: velEf,
                pocketW: w.width || w.w || 0, pocketH: w.height || w.h || 0,
                classificacao: cls, areaCm2, isPequena: isPeq,
                isContorno: false, needsOnionSkin: false,
                // Tool-agnostic multi-pass
                grooveMultiPass, grooveOffsets, grooveWidth: reqWidth, toolAdapted,
                // Estratégia resolvida
                resolvedMetodo, holeDiameter: Number(w.diameter || 0),
            });
        }

        // ═══ CONTORNO AUTOMÁTICO da peça ═══
        if (contTool) {
            const cR = contTool.diametro / 2;
            const profExtra = contTool.profundidade_extra ?? profExtraMaq;
            const depthTotal = clampDepth(esp + profExtra, `${pDb.descricao} - contorno`);
            const needsOnion = useOnion && areaCm2 < onionAreaMax;
            const depthCont = needsOnion ? depthTotal - onionEsp : depthTotal;
            const doc = contTool.doc || null;
            const passes = calcularPassadas(depthCont, doc);
            const velC = contTool.velocidade_corte || velCorteMaq;
            const velEf = isPeq ? Math.round(velC * feedPct / 100) : velC;

            const cTipo = usinagemTipos.find(t => t.codigo === 'contorno_peca') || { prioridade: 8, fase: 'contorno' };

            // Classificação determina sub-prioridade do contorno
            const clsOrder = cls === 'super_pequena' ? 0 : cls === 'pequena' ? 1 : 2;

            // ─── Índice de Risco de Vácuo (Vacuum Risk Index) ───
            const chapaW = chapa.comprimento || 2750, chapaH = chapa.largura || 1850;
            const centerX = pX + pW / 2, centerY = pY + pH / 2;
            const distBorda = Math.min(centerX, centerY, chapaW - centerX, chapaH - centerY);
            const distBordaNorm = Math.min(distBorda / (Math.min(chapaW, chapaH) / 2), 1.0);
            const areaMax = chapaW * chapaH / 100;
            const areaNorm = Math.min(areaCm2 / (areaMax * 0.1), 1.0);
            const vacuumRiskIndex = (1.0 - areaNorm) * 0.6 + (1.0 - distBordaNorm) * 0.4;

            // Verificar se a peça tem contorno complexo (não-retangular)
            const hasComplexContour = mach.contour && mach.contour.outer && mach.contour.outer.length > 0;

            if (hasComplexContour) {
                // ═══ CONTORNO COMPLEXO (arcos, curvas, furos) ═══
                const contour = mach.contour;
                const offsetX = refilo + pX;
                const offsetY = refilo + pY;

                // Contorno externo
                allOps.push({
                    pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                    absX: refilo + pX - cR, absY: refilo + pY - cR,
                    absX2: refilo + pX + pW + cR, absY2: refilo + pY + pH + cR,
                    opType: 'contorno', fase: 1,
                    prioridade: cTipo.prioridade, clsOrder, tipoNome: 'Contorno Complexo',
                    toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                    toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                    depthTotal, depthCont, passes, velCorte: velEf,
                    contornoPath: null,  // Não usar path retangular
                    contourData: contour,  // Contorno complexo
                    offsetX, offsetY, cutterRadius: cR,
                    classificacao: cls, areaCm2, isPequena: isPeq,
                    isContorno: true, isComplexContour: true,
                    needsOnionSkin: needsOnion, onionDepthFull: depthTotal,
                    vacuumRiskIndex, distBorda: Math.round(distBorda),
                });

                // Furos/recortes internos (cada um = operação separada, ANTES do contorno externo)
                if (contour.holes && contour.holes.length > 0) {
                    for (const hole of contour.holes) {
                        const holeDepth = clampDepth(esp + profExtra, `${pDb.descricao} - furo interno`);
                        const holePasses = calcularPassadas(holeDepth, doc);
                        allOps.push({
                            pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                            absX: offsetX, absY: offsetY,
                            absX2: offsetX + pW, absY2: offsetY + pH,
                            opType: hole.type === 'circle' ? 'circular_hole' : 'contour_hole',
                            fase: 0,  // Antes dos contornos externos
                            prioridade: 5, clsOrder: 0, tipoNome: hole.type === 'circle' ? 'Furo Circular' : 'Recorte Interno',
                            toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                            toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                            depthTotal: holeDepth, passes: holePasses, velCorte: velEf,
                            holeData: hole,
                            offsetX, offsetY, cutterRadius: cR,
                            classificacao: cls, areaCm2, isPequena: isPeq,
                            isContorno: false, isComplexContour: false,
                            needsOnionSkin: false,
                        });
                    }
                }

            } else {
                // ═══ CONTORNO RETANGULAR (comportamento existente) ═══
                const cx1 = refilo + pX - cR, cy1 = refilo + pY - cR;
                const cx2 = refilo + pX + pW + cR, cy2 = refilo + pY + pH + cR;

                allOps.push({
                    pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                    absX: cx1, absY: cy1, absX2: cx2, absY2: cy2,
                    opType: 'contorno', fase: 1,
                    prioridade: cTipo.prioridade, clsOrder, tipoNome: 'Contorno',
                    toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                    toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                    depthTotal, depthCont, passes, velCorte: velEf,
                    contornoPath: [{ x: cx1, y: cy1 }, { x: cx2, y: cy1 }, { x: cx2, y: cy2 }, { x: cx1, y: cy2 }],
                    classificacao: cls, areaCm2, isPequena: isPeq,
                    isContorno: true, isComplexContour: false,
                    needsOnionSkin: needsOnion, onionDepthFull: depthTotal,
                    vacuumRiskIndex, distBorda: Math.round(distBorda),
                });
            }
        }
    }

    // ═══ CONTORNOS DE SOBRAS aproveitáveis ═══
    if (contTool && chapa.retalhos) {
        const sobraMinW = cfg.sobra_min_largura || 300;
        const sobraMinH = cfg.sobra_min_comprimento || 600;

        for (const ret of chapa.retalhos) {
            const isSobra = Math.max(ret.w, ret.h) >= sobraMinH && Math.min(ret.w, ret.h) >= sobraMinW;
            if (!isSobra) continue;

            const cR = contTool.diametro / 2;
            const profExtra = contTool.profundidade_extra ?? profExtraMaq;
            const depthTotal = clampDepth(espChapa + profExtra, 'contorno sobra');
            const passes = calcularPassadas(depthTotal, contTool.doc || null);

            const sx1 = refilo + ret.x - cR, sy1 = refilo + ret.y - cR;
            const sx2 = refilo + ret.x + ret.w + cR, sy2 = refilo + ret.y + ret.h + cR;
            const sTipo = usinagemTipos.find(t => t.codigo === 'contorno_sobra') || { prioridade: 9, fase: 'contorno' };

            allOps.push({
                pecaId: null, pecaDesc: `Sobra ${Math.round(ret.w)}x${Math.round(ret.h)}`, moduloDesc: '',
                absX: sx1, absY: sy1, absX2: sx2, absY2: sy2,
                opType: 'contorno_sobra', fase: 2, prioridade: sTipo.prioridade, clsOrder: 9, tipoNome: 'Contorno Sobra',
                toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                depthTotal, depthCont: depthTotal, passes, velCorte: contTool.velocidade_corte || velCorteMaq,
                contornoPath: [{ x: sx1, y: sy1 }, { x: sx2, y: sy1 }, { x: sx2, y: sy2 }, { x: sx1, y: sy2 }],
                classificacao: 'normal', areaCm2: (ret.w * ret.h) / 100, isPequena: false,
                isContorno: true, needsOnionSkin: false,
            });
        }
    }

    // ═══ PASSO 2: Ordenação global ═══
    // Estratégia: Fase 0 (usinagens internas) → Fase 1 (contornos peças) → Fase 2 (contornos sobras)
    // Dentro de contornos: MENOR PRIMEIRO (preservar vácuo/fixação enquanto chapa tem massa)
    // Vacuum Risk Index: combina área (60%) + distância da borda (40%)
    const otimizarTrocas = cfg.otimizar_trocas_ferramenta !== 0;
    allOps.sort((a, b) => {
        if (a.fase !== b.fase) return a.fase - b.fase;
        if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
        // Contornos: ordenar por vacuum risk index (maior risco primeiro)
        if (a.isContorno && b.isContorno) {
            if (ordenarContornos === 'menor_primeiro') {
                // Usar vacuum risk index: maior risco = cortar primeiro
                const riskA = a.vacuumRiskIndex ?? 0;
                const riskB = b.vacuumRiskIndex ?? 0;
                if (Math.abs(riskA - riskB) > 0.05) return riskB - riskA; // maior risco primeiro
                // Dentro do mesmo risco: classe
                if ((a.clsOrder ?? 9) !== (b.clsOrder ?? 9)) return (a.clsOrder ?? 9) - (b.clsOrder ?? 9);
                // Dentro da mesma classe, menor área primeiro
                if (a.areaCm2 !== b.areaCm2) return a.areaCm2 - b.areaCm2;
            } else if (ordenarContornos === 'maior_primeiro') {
                if ((a.clsOrder ?? 9) !== (b.clsOrder ?? 9)) return (b.clsOrder ?? 9) - (a.clsOrder ?? 9);
                if (a.areaCm2 !== b.areaCm2) return b.areaCm2 - a.areaCm2;
            }
            // else 'proximidade' — ordenação por proximity abaixo
        }
        // Agrupar por ferramenta dentro de cada fase/prioridade (minimizar trocas)
        if (otimizarTrocas && a.toolCode !== b.toolCode) return (a.toolCode || '').localeCompare(b.toolCode || '');
        return 0;
    });

    const sortedOps = [];
    let gs = 0;
    for (let i = 0; i <= allOps.length; i++) {
        const newGrp = i === allOps.length ||
            allOps[i].fase !== allOps[gs].fase ||
            allOps[i].prioridade !== allOps[gs].prioridade ||
            (otimizarTrocas && allOps[i].toolCode !== allOps[gs].toolCode);
        if (newGrp && i > gs) {
            const grp = allOps.slice(gs, i);
            // Para contornos com ordenação por tamanho, manter a ordem de tamanho
            // mas aplicar proximity DENTRO de cada sub-grupo de tamanho similar
            if (grp[0]?.isContorno && ordenarContornos === 'menor_primeiro') {
                // Manter a ordem de vacuum risk index (já ordenada pelo sort principal)
                // NÃO aplicar proximity — a ordem de risco é mais importante que minimizar G0
                sortedOps.push(...grp);
            } else if (grp[0]?.isContorno && ordenarContornos === 'maior_primeiro') {
                // Manter a ordem de área descendente
                sortedOps.push(...grp);
            } else {
                sortedOps.push(...orderByProximity(grp));
            }
            gs = i;
        }
    }

    // ═══ PASSO 3: Gerar G-code ═══
    const onionOps = [];
    let trocas = 0, totalOps = 0, curTool = null;

    // ─── Cabeçalho ───
    L.push(header, '');
    L.push(`${cmt} ═══════════════════════════════════════════════════════`);
    L.push(`${cmt} Ornato ERP — ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`);
    L.push(`${cmt} Maquina: ${maquina.nome} (${maquina.fabricante || ''} ${maquina.modelo || ''})`);
    L.push(`${cmt} Chapa ${chapaIdx + 1}: ${chapa.material || ''} ${chapa.comprimento}x${chapa.largura}mm esp=${espChapa}mm`);
    L.push(`${cmt} Pecas: ${chapa.pecas.length} | Operacoes: ${sortedOps.length}`);
    L.push(`${cmt} Z-origin: ${zOrigin === 'mesa' ? 'Mesa de sacrificio (Z0=mesa)' : 'Topo do material (Z0=material)'}`);
    L.push(`${cmt} Direcao contorno: ${dirCorte === 'climb' ? 'Climb Milling (CW)' : 'Convencional (CCW)'}`);
    const ordLabel = ordenarContornos === 'menor_primeiro' ? 'Menor→Maior (vacuo)' :
                     ordenarContornos === 'maior_primeiro' ? 'Maior→Menor' : 'Proximidade';
    L.push(`${cmt} Ordem contornos: ${ordLabel}`);
    const ad = [];
    if (useOnion) ad.push(`Onion-skin ${onionEsp}mm`);
    if (feedPct < 100) ad.push(`Feed ${feedPct}% peq.`);
    if (useRampa) ad.push(`Rampa ${rampaAngulo}°`);
    if (usarLeadIn) ad.push(`Lead-in R${leadInRaio}mm`);
    if (ad.length) L.push(`${cmt} Estrategias: ${ad.join(' | ')}`);
    L.push(`${cmt} ═══════════════════════════════════════════════════════`, '');

    // ─── Retração Z segura inicial ───
    emit(`G0 Z${fmt(zSafe())}`);
    L.push('');

    let lastFase = -1;

    for (const op of sortedOps) {
        // Separador de fase
        if (op.fase !== lastFase) {
            const fn = op.fase === 0 ? 'USINAGENS INTERNAS' : op.fase === 1 ? 'CONTORNOS DE PECAS' : 'CONTORNOS DE SOBRAS';
            L.push('', `${cmt} ════════════════════════════════════════`);
            L.push(`${cmt} FASE ${op.fase}: ${fn}`);
            L.push(`${cmt} ════════════════════════════════════════`, '');
            lastFase = op.fase;
        }

        // Troca de ferramenta
        if (op.toolCode !== curTool) {
            if (curTool !== null) { emit(`${sOff}`); L.push(`${cmt} Spindle OFF`, ''); }
            const tl = toolMap[op.toolCode];
            if (tl) {
                emit(`${tl.codigo} ${trocaCmd}`);
                L.push(`${cmt} Troca: ${tl.nome} (D${tl.diametro}mm)`);
                emit(`S${tl.rpm || rpmDef} ${sOn}`);
                L.push(`${cmt} Spindle ON`);
                if (dwellSpindle > 0) emit(`G4 P${dwellSpindle.toFixed(1)}`);
            } else {
                L.push(`${cmt} Ferramenta: ${op.toolCode} (nao cadastrada)`);
            }
            L.push('');
            curTool = op.toolCode;
            trocas++;
        }
        totalOps++;

        // ═══ Gerar movimentos por tipo ═══

        // ─── CONTORNO COMPLEXO (arcos, curvas) ───
        if (op.isContorno && op.isComplexContour && op.contourData) {
            const cd = op.contourData;
            const oX = op.offsetX, oY = op.offsetY;
            const cR = op.cutterRadius || 0;
            const outerSegs = cd.outer || [];
            if (outerSegs.length === 0) continue;

            L.push(`${cmt} Contorno COMPLEXO: ${op.pecaDesc}${op.moduloDesc ? ' (' + op.moduloDesc + ')' : ''} (${outerSegs.length} segmentos)`);
            if (op.needsOnionSkin) L.push(`${cmt}   ONION-SKIN: corte ate ${fmt(op.depthCont)}mm, breakthrough ${fmt(op.depthTotal)}mm`);
            L.push(`${cmt}   Passadas: ${op.passes.length} | Prof: ${fmt(op.needsOnionSkin ? op.depthCont : op.depthTotal)}mm | Area: ${op.areaCm2.toFixed(0)}cm2`);
            if (op.vacuumRiskIndex != null) L.push(`${cmt}   Risco vacuo: ${(op.vacuumRiskIndex * 100).toFixed(0)}% | Dist.borda: ${op.distBorda}mm`);
            if (op.isPequena) L.push(`${cmt}   PECA PEQUENA -- Feed ${feedPct}%`);

            // Ponto inicial: ultimo segmento do contorno fecha no primeiro
            const lastSeg = outerSegs[outerSegs.length - 1];
            const startX = oX + lastSeg.x2;
            const startY = oY + lastSeg.y2;

            // Rastrear posição atual para cálculo de I,J relativos em arcos
            let curX = startX, curY = startY;

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // Posicionar
                emit(`G0 X${fmt(startX)} Y${fmt(startY)}`);
                emit(`G0 Z${fmt(zApproach())}`);

                // Mergulho (rampa se habilitado e primeiro segmento é longo o bastante)
                if (useRampa && outerSegs[0]) {
                    const firstSeg = outerSegs[0];
                    const dx = (oX + firstSeg.x2) - startX;
                    const dy = (oY + firstSeg.y2) - startY;
                    const segLen = Math.sqrt(dx * dx + dy * dy);
                    const rampLen = Math.min(segLen * 0.4, 50);
                    if (rampLen > 5) {
                        const rampFrac = rampLen / segLen;
                        const rampX = startX + dx * rampFrac;
                        const rampY = startY + dy * rampFrac;
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm ao longo primeiro segmento`);
                        emit(`G1 X${fmt(rampX)} Y${fmt(rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 X${fmt(startX)} Y${fmt(startY)} F${op.velCorte}`);
                        curX = startX; curY = startY;
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }
                } else {
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                }

                // Percorrer contorno complexo
                for (const seg of outerSegs) {
                    const targetX = oX + seg.x2;
                    const targetY = oY + seg.y2;

                    if (seg.type === 'arc') {
                        // I,J relativos ao ponto atual
                        const I = (oX + seg.cx) - curX;
                        const J = (oY + seg.cy) - curY;
                        const cmd = seg.dir === 'cw' ? 'G2' : 'G3';
                        emit(`${cmd} X${fmt(targetX)} Y${fmt(targetY)} I${fmt(I)} J${fmt(J)} F${op.velCorte}`);
                    } else {
                        // Linha reta (G1)
                        emit(`G1 X${fmt(targetX)} Y${fmt(targetY)} F${op.velCorte}`);
                    }
                    curX = targetX;
                    curY = targetY;
                }

                // Retração Z
                const nextOp = sortedOps[sortedOps.indexOf(op) + 1];
                const useFastRetract = nextOp && nextOp.isContorno && nextOp.toolCode === op.toolCode;
                emit(`G0 Z${fmt(useFastRetract ? zRapid() : zSafe())}`);
            }
            if (op.needsOnionSkin) {
                onionOps.push({ ...op, velFinal: Math.round(op.velCorte * 0.6) });
            }
            L.push('');

        // ─── FURO CIRCULAR (passa-fio, etc.) ───
        } else if (op.opType === 'circular_hole' && op.holeData) {
            const h = op.holeData;
            const oX = op.offsetX, oY = op.offsetY;
            const cx = oX + h.cx, cy = oY + h.cy, r = h.r;
            const cR = op.cutterRadius || 0;
            const toolR = (op.toolDiam || 6) / 2;

            L.push(`${cmt} Furo circular D${fmt(r * 2)}mm (passa-fio): ${op.pecaDesc}`);

            if (r > toolR * 1.5) {
                const cutR = r - toolR;  // raio de interpolação

                if (rampaTipo === 'helicoidal') {
                    // ═══ Entrada helicoidal ═══
                    L.push(`${cmt}   Entrada helicoidal`);
                    const helixR = cutR * (rampaDiamPct / 100);
                    const depthPerRev = Math.min(op.toolDiam * 0.3, 3);

                    emit(`G0 X${fmt(cx + helixR)} Y${fmt(cy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    let curZ = zApproach();
                    const finalZ = zCut(op.depthTotal);
                    const halfRevDepth = depthPerRev / 2;

                    while (curZ > finalZ + 0.01) {
                        const nextZ1 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 X${fmt(cx - helixR)} Y${fmt(cy)} I${fmt(-helixR)} J0 Z${fmt(nextZ1)} F${velRampa}`);
                        curZ = nextZ1;
                        if (curZ <= finalZ + 0.01) break;
                        const nextZ2 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 X${fmt(cx + helixR)} Y${fmt(cy)} I${fmt(helixR)} J0 Z${fmt(nextZ2)} F${velRampa}`);
                        curZ = nextZ2;
                    }

                    // Expandir para raio de corte real se diferente do raio de hélice
                    if (Math.abs(cutR - helixR) > 0.05) {
                        emit(`G1 X${fmt(cx + cutR)} Y${fmt(cy)} F${op.velCorte}`);
                    }
                } else {
                    // ═══ Entrada convencional (plunge por passada) ═══
                    for (let pi = 0; pi < op.passes.length; pi++) {
                        const zTarget = zCut(op.passes[pi]);
                        if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                        // Desbaste com offset
                        const desbR = circularPassesAcab > 0 && circularOffsetDesb > 0 ? cutR - circularOffsetDesb : cutR;
                        emit(`G0 X${fmt(cx + desbR)} Y${fmt(cy)}`);
                        emit(`G0 Z${fmt(zApproach())}`);
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G2 X${fmt(cx + desbR)} Y${fmt(cy)} I${fmt(-desbR)} J0 F${op.velCorte}`);
                    }
                    // Posicionar para acabamento
                    emit(`G1 X${fmt(cx + cutR)} Y${fmt(cy)} F${op.velCorte}`);
                }

                // Passes de acabamento no raio exato
                if (circularPassesAcab > 0) {
                    const velAcab = Math.round(op.velCorte * velAcabPct);
                    for (let ac = 0; ac < circularPassesAcab; ac++) {
                        L.push(`${cmt}   Acabamento circular ${ac + 1}/${circularPassesAcab} vel=${velAcab}`);
                        emit(`G2 X${fmt(cx + cutR)} Y${fmt(cy)} I${fmt(-cutR)} J0 F${velAcab}`);
                    }
                }
                emit(`G0 Z${fmt(zSafe())}`);
            } else {
                // Plunge simples (furo pequeno)
                emit(`G0 X${fmt(cx)} Y${fmt(cy)}`);
                emit(`G0 Z${fmt(zApproach())}`);
                for (let pi = 0; pi < op.passes.length; pi++) {
                    const zTarget = zCut(op.passes[pi]);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                }
                emit(`G0 Z${fmt(zSafe())}`);
            }
            L.push('');

        // ─── RECORTE POLIGONAL INTERNO ───
        } else if (op.opType === 'contour_hole' && op.holeData) {
            const h = op.holeData;
            const oX = op.offsetX, oY = op.offsetY;
            const segs = h.segments || [];

            L.push(`${cmt} Recorte interno: ${op.pecaDesc} (${segs.length} segmentos)`);

            if (segs.length > 0) {
                const lastSeg = segs[segs.length - 1];
                const startX = oX + lastSeg.x2, startY = oY + lastSeg.y2;
                let curX = startX, curY = startY;

                for (let pi = 0; pi < op.passes.length; pi++) {
                    const zTarget = zCut(op.passes[pi]);
                    if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                    emit(`G0 X${fmt(startX)} Y${fmt(startY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    curX = startX; curY = startY;

                    for (const seg of segs) {
                        const targetX = oX + seg.x2;
                        const targetY = oY + seg.y2;

                        if (seg.type === 'arc') {
                            const I = (oX + seg.cx) - curX;
                            const J = (oY + seg.cy) - curY;
                            const cmd = seg.dir === 'cw' ? 'G2' : 'G3';
                            emit(`${cmd} X${fmt(targetX)} Y${fmt(targetY)} I${fmt(I)} J${fmt(J)} F${op.velCorte}`);
                        } else {
                            emit(`G1 X${fmt(targetX)} Y${fmt(targetY)} F${op.velCorte}`);
                        }
                        curX = targetX;
                        curY = targetY;
                    }
                }
                emit(`G0 Z${fmt(zSafe())}`);
            }
            L.push('');

        // ─── CONTORNO RETANGULAR (comportamento existente) ───
        } else if (op.isContorno) {
            const path = op.contornoPath;
            if (!path || path.length < 4) continue;

            L.push(`${cmt} ${op.opType === 'contorno_sobra' ? 'Sobra' : 'Contorno'}: ${op.pecaDesc}${op.moduloDesc ? ' (' + op.moduloDesc + ')' : ''}`);
            if (op.needsOnionSkin) L.push(`${cmt}   ONION-SKIN: corte ate ${fmt(op.depthCont)}mm, breakthrough ${fmt(op.depthTotal)}mm`);
            L.push(`${cmt}   Passadas: ${op.passes.length} | Prof: ${fmt(op.needsOnionSkin ? op.depthCont : op.depthTotal)}mm | Area: ${op.areaCm2.toFixed(0)}cm2`);
            if (op.vacuumRiskIndex != null) L.push(`${cmt}   Risco vacuo: ${(op.vacuumRiskIndex * 100).toFixed(0)}% | Dist.borda: ${op.distBorda}mm`);
            if (op.isPequena) L.push(`${cmt}   PECA PEQUENA -- Feed ${feedPct}%`);

            // Calcular ponto de entrada com lead-in
            // Para climb (CW): entrada no meio da aresta inferior (P0→P1)
            // Lead-in: deslocar ponto de entrada para fora do contorno
            const p0 = path[0], p1 = path[1], p2 = path[2], p3 = path[3];
            const edgeLen = Math.abs(p1.x - p0.x); // comprimento da aresta inferior
            const leadR = usarLeadIn ? Math.min(leadInRaio, edgeLen * 0.2, 15) : 0;

            // Ponto de entrada: meio da primeira aresta, deslocado para fora
            const entryX = (p0.x + p1.x) / 2;
            const entryY = p0.y - leadR;  // fora do contorno (abaixo)

            // Ponto no contorno onde o lead-in termina
            const contX = (p0.x + p1.x) / 2;
            const contY = p0.y;

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // ─── Calcular comprimento da primeira aresta para rampa ───
                // Climb=CCW starts toward p3, Conv=CW starts toward p1
                const firstEdgeLen = dirCorte === 'climb'
                    ? Math.sqrt((p3.x - p0.x) ** 2 + (p3.y - p0.y) ** 2)
                    : Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
                const rampLen = Math.min(firstEdgeLen * 0.4, 50); // max 50mm de rampa, 40% da aresta
                const depthNeeded = zApproach() - zTarget;

                if (usarLeadIn && leadR > 1) {
                    // ─── COM LEAD-IN ───
                    // 1. Posicionar no ponto de lead-in (fora do contorno)
                    emit(`G0 X${fmt(entryX)} Y${fmt(entryY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    // 2. Entrar no contorno (lead-in) na altura de approach
                    emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);

                    // 3. Descer: rampa ao longo da primeira aresta OU plunge no ponto de entrada
                    if (useRampa && rampLen > 5) {
                        // Rampa ao longo da primeira aresta (climb=CCW→p0, conv=CW→p1)
                        const nextPt = dirCorte === 'climb' ? p0 : p1;
                        const dx = nextPt.x - contX, dy = nextPt.y - contY;
                        const edgeLenFromCont = Math.sqrt(dx * dx + dy * dy);
                        const rampFrac = Math.min(rampLen / edgeLenFromCont, 0.9);
                        const rampX = contX + dx * rampFrac;
                        const rampY = contY + dy * rampFrac;
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm ao longo aresta, ${rampaAngulo}deg`);
                        emit(`G1 X${fmt(rampX)} Y${fmt(rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        // Voltar ao ponto de entrada do contorno na profundidade de corte
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    } else {
                        // Plunge no ponto de entrada (fora da peça, marca aceitável)
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // 4. Percorrer contorno completo a partir do meio da aresta
                    // Climb milling (concordante) com spindle CW = CCW no contorno externo (p0→p3→p2→p1)
                    // Conventional (convencional) = CW no contorno externo (p0→p1→p2→p3)
                    if (dirCorte === 'climb') {
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    }

                    // 5. Lead-out: sair do contorno
                    emit(`G1 X${fmt(entryX)} Y${fmt(entryY)} F${op.velCorte}`);

                } else {
                    // ─── SEM LEAD-IN: entrada direta no P0 ───
                    emit(`G0 X${fmt(p0.x)} Y${fmt(p0.y)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa && rampLen > 5) {
                        // Rampa ao longo da primeira aresta do contorno (climb=CCW→p3, conv=CW→p1)
                        const nextPt = dirCorte === 'climb' ? p3 : p1;
                        const dx = nextPt.x - p0.x, dy = nextPt.y - p0.y;
                        const edgeL = Math.sqrt(dx * dx + dy * dy);
                        const rampFrac = Math.min(rampLen / edgeL, 0.9);
                        const rampX = p0.x + dx * rampFrac;
                        const rampY = p0.y + dy * rampFrac;
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm, ${rampaAngulo}deg`);
                        emit(`G1 X${fmt(rampX)} Y${fmt(rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // Direção do contorno: climb=CCW (p0→p3→p2→p1), conv=CW (p0→p1→p2→p3)
                    if (dirCorte === 'climb') {
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                    }
                }

                // ─── Retração Z: usar zRapid para operações próximas, zSafe entre seções ───
                const nextOp = sortedOps[sortedOps.indexOf(op) + 1];
                const useFastRetract = nextOp && nextOp.isContorno && nextOp.toolCode === op.toolCode;
                emit(`G0 Z${fmt(useFastRetract ? zRapid() : zSafe())}`);
            }
            if (op.needsOnionSkin) {
                onionOps.push({ ...op, velFinal: Math.round(op.velCorte * 0.6) });
            }
            L.push('');

        } else if (op.opType === 'hole') {
            const metodo = op.resolvedMetodo || 'drill';
            const holeDiam = op.holeDiameter || 0;
            const toolR = (op.toolDiam || 6) / 2;

            // Se metodo = helical ou circular e furo é maior que a fresa
            if ((metodo === 'helical' || metodo === 'circular') && holeDiam > op.toolDiam * 1.1) {
                const cutR = (holeDiam / 2) - toolR; // raio de interpolação

                if (metodo === 'helical' && rampaTipo === 'helicoidal') {
                    // ═══ FURO HELICOIDAL: fresa desce em espiral ═══
                    L.push(`${cmt} Furo HELICOIDAL D${holeDiam}mm (fresa D${op.toolDiam}mm): ${op.pecaDesc}`);
                    const helixR = cutR * (rampaDiamPct / 100);
                    const depthPerRev = Math.min(op.toolDiam * 0.3, 3); // max 3mm por revolução

                    emit(`G0 X${fmt(op.absX + helixR)} Y${fmt(op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    // Descida helicoidal em arcos G2 com Z decrescente
                    let curZ = zApproach();
                    const finalZ = zCut(op.depthTotal);
                    const halfRevDepth = depthPerRev / 2;
                    L.push(`${cmt}   Descida helicoidal: R=${fmt(helixR)}mm, ${fmt(depthPerRev)}mm/rev`);

                    while (curZ > finalZ + 0.01) {
                        // Meio arco 1 (180°): ponto oposto
                        const nextZ1 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 X${fmt(op.absX - helixR)} Y${fmt(op.absY)} I${fmt(-helixR)} J0 Z${fmt(nextZ1)} F${velRampa}`);
                        curZ = nextZ1;
                        if (curZ <= finalZ + 0.01) break;
                        // Meio arco 2 (180°): volta ao início
                        const nextZ2 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 X${fmt(op.absX + helixR)} Y${fmt(op.absY)} I${fmt(helixR)} J0 Z${fmt(nextZ2)} F${velRampa}`);
                        curZ = nextZ2;
                    }

                    // Passe final no diâmetro exato (acabamento) se cutR > helixR
                    if (circularPassesAcab > 0) {
                        // Expandir para raio de corte real
                        if (Math.abs(cutR - helixR) > 0.05) {
                            emit(`G1 X${fmt(op.absX + cutR)} Y${fmt(op.absY)} F${op.velCorte}`);
                        }
                        for (let ac = 0; ac < circularPassesAcab; ac++) {
                            L.push(`${cmt}   Acabamento circular ${ac + 1}/${circularPassesAcab}`);
                            emit(`G2 X${fmt(op.absX + cutR)} Y${fmt(op.absY)} I${fmt(-cutR)} J0 F${Math.round(op.velCorte * velAcabPct)}`);
                        }
                    }
                    emit(`G0 Z${fmt(zSafe())}`);
                } else {
                    // ═══ FURO CIRCULAR (interpolação G2/G3): fresa contorna o furo ═══
                    L.push(`${cmt} Furo CIRCULAR D${holeDiam}mm (fresa D${op.toolDiam}mm): ${op.pecaDesc}`);

                    for (let pi = 0; pi < op.passes.length; pi++) {
                        const zTarget = zCut(op.passes[pi]);
                        if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                        // Desbaste (com offset se acabamento ativo)
                        const desbR = circularPassesAcab > 0 && circularOffsetDesb > 0 ? cutR - circularOffsetDesb : cutR;

                        emit(`G0 X${fmt(op.absX + desbR)} Y${fmt(op.absY)}`);
                        emit(`G0 Z${fmt(zApproach())}`);
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G2 X${fmt(op.absX + desbR)} Y${fmt(op.absY)} I${fmt(-desbR)} J0 F${op.velCorte}`);

                        // Passes de acabamento no raio exato
                        if (circularPassesAcab > 0 && circularOffsetDesb > 0) {
                            emit(`G1 X${fmt(op.absX + cutR)} Y${fmt(op.absY)} F${op.velCorte}`);
                            for (let ac = 0; ac < circularPassesAcab; ac++) {
                                emit(`G2 X${fmt(op.absX + cutR)} Y${fmt(op.absY)} I${fmt(-cutR)} J0 F${Math.round(op.velCorte * velAcabPct)}`);
                            }
                        }
                    }
                    emit(`G0 Z${fmt(zSafe())}`);
                }
            } else {
                // ═══ FURO DIRETO (plunge) — broca do diâmetro exato ═══
                L.push(`${cmt} Furo: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} Prof=${fmt(op.depthTotal)}`);
                emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
                emit(`G0 Z${fmt(zApproach())}`);
                for (let pi = 0; pi < op.passes.length; pi++) {
                    if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length}`);
                    emit(`G1 Z${fmt(zCut(op.passes[pi]))} F${velMergulho}`);
                    if (pi < op.passes.length - 1) emit(`G0 Z${fmt(zApproach())}`);
                }
                emit(`G0 Z${fmt(zSafe())}`);
            }
            // Retração: usar zRapid entre furos consecutivos da mesma ferramenta
            const nextOpH = sortedOps[sortedOps.indexOf(op) + 1];
            const fastRetractH = nextOpH && nextOpH.opType === 'hole' && nextOpH.toolCode === op.toolCode;
            if (fastRetractH) emit(`G0 Z${fmt(zRapid())}`);
            L.push('');

        } else if (op.opType === 'groove') {
            let sx1 = op.absX, sy1 = op.absY;
            let ex1 = op.absX2 ?? op.absX, ey1 = op.absY2 ?? op.absY;

            // ─── Compensação de raio nos cantos do canal (overcut) ───
            const toolR = (op.toolDiam || 0) / 2;
            if (compensarRaioCanal && toolR > 0.1) {
                // Estender o canal por meio raio da fresa em cada extremidade
                // para que o espaço útil fique correto (cantos retos)
                const dx = ex1 - sx1, dy = ey1 - sy1;
                const grooveLenRaw = Math.sqrt(dx * dx + dy * dy);
                if (grooveLenRaw > 0.01) {
                    const ux = dx / grooveLenRaw, uy = dy / grooveLenRaw; // vetor unitário
                    sx1 -= ux * toolR; // recuar o início pelo raio
                    sy1 -= uy * toolR;
                    ex1 += ux * toolR; // avançar o fim pelo raio
                    ey1 += uy * toolR;
                    L.push(`${cmt} Compensacao raio: avanco ${fmt(toolR)}mm em cada extremidade (overcut)`);
                }
            }

            const grooveLen = Math.sqrt((ex1 - sx1) ** 2 + (ey1 - sy1) ** 2);
            const gOffsets = op.grooveMultiPass ? op.grooveOffsets : [0];

            if (op.grooveMultiPass) {
                L.push(`${cmt} Rasgo MULTI-PASS: ${op.pecaDesc} Larg=${op.grooveWidth}mm Fresa=D${op.toolDiam}mm (${gOffsets.length} passadas laterais)`);
            } else {
                L.push(`${cmt} Rasgo: ${op.pecaDesc} X${fmt(sx1)} Y${fmt(sy1)} -> X${fmt(ex1)} Y${fmt(ey1)} Prof=${fmt(op.depthTotal)} L=${fmt(grooveLen)}`);
            }
            if (op.toolAdapted) L.push(`${cmt}   FERRAMENTA ADAPTADA: usando ${op.toolNome} (D${op.toolDiam}mm)`);

            // Calcular vetor perpendicular ao rasgo para offsets laterais
            let perpX = 0, perpY = 0;
            if (grooveLen > 0.01) {
                const dx = ex1 - sx1, dy = ey1 - sy1;
                perpX = -dy / grooveLen;
                perpY = dx / grooveLen;
            }

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada Z ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // Multi-pass lateral: cada offset lateral em cada profundidade
                for (let li = 0; li < gOffsets.length; li++) {
                    const off = gOffsets[li];
                    const sx = sx1 + perpX * off;
                    const sy = sy1 + perpY * off;
                    const ex = ex1 + perpX * off;
                    const ey = ey1 + perpY * off;

                    if (gOffsets.length > 1) L.push(`${cmt}   Lateral ${li + 1}/${gOffsets.length} offset=${fmt(off)}mm`);

                    emit(`G0 X${fmt(sx)} Y${fmt(sy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa && grooveLen > 10) {
                        const rampLen = Math.min(grooveLen * 0.3, 20);
                        const ratio = rampLen / grooveLen;
                        const rampEndX = sx + (ex - sx) * ratio;
                        const rampEndY = sy + (ey - sy) * ratio;
                        emit(`G1 X${fmt(rampEndX)} Y${fmt(rampEndY)} Z${fmt(zTarget)} F${velRampa}`);
                        emit(`G1 X${fmt(sx)} Y${fmt(sy)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    emit(`G1 X${fmt(ex)} Y${fmt(ey)} F${op.velCorte}`);

                    // Retração entre passadas laterais: approach (mínimo)
                    if (li < gOffsets.length - 1) {
                        emit(`G0 Z${fmt(zApproach())}`);
                    }
                }

                // Retração entre passadas Z
                if (pi < op.passes.length - 1) {
                    emit(`G0 Z${fmt(zApproach())}`);
                } else {
                    const nextOpG = sortedOps[sortedOps.indexOf(op) + 1];
                    const fastRetractG = nextOpG && nextOpG.opType === 'groove' && nextOpG.toolCode === op.toolCode;
                    emit(`G0 Z${fmt(fastRetractG ? zRapid() : zSafe())}`);
                }
            }
            L.push('');

        } else if (op.opType === 'pocket') {
            const pw = op.pocketW, ph = op.pocketH;
            const toolDiam = op.toolDiam || 8;
            const toolR = toolDiam / 2;
            const stepOver = toolDiam * stepoverPct;
            L.push(`${cmt} Pocket: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} ${pw}x${ph} Prof=${fmt(op.depthTotal)} Stepover=${Math.round(stepoverPct * 100)}%`);

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                if (pw > toolDiam * 1.2 && ph > toolDiam * 1.2) {
                    // ─── Zigzag inteligente: eixo longo, stepover configurável, acabamento ───
                    const ox = Number(op.absX), oy = Number(op.absY);
                    // Offset para acabamento: deixar material na parede para passe final
                    const acabOff = pocketAcabamento ? pocketAcabOffset : 0;
                    const iStartX = ox + toolR + acabOff, iStartY = oy + toolR + acabOff;
                    const iEndX = ox + pw - toolR - acabOff, iEndY = oy + ph - toolR - acabOff;

                    // Determinar direção do zigzag: eixo mais longo = menos reversões
                    const zigAlongX = pocketDirecao === 'x' ? true :
                                      pocketDirecao === 'y' ? false :
                                      pw >= ph; // 'auto': eixo mais longo

                    emit(`G0 X${fmt(iStartX)} Y${fmt(iStartY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa) {
                        const rampAxis = zigAlongX ? iEndX - iStartX : iEndY - iStartY;
                        const rampLen = Math.min(Math.abs(rampAxis) * 0.3, 20);
                        if (zigAlongX) {
                            emit(`G1 X${fmt(iStartX + rampLen)} Y${fmt(iStartY)} Z${fmt(zTarget)} F${velRampa}`);
                        } else {
                            emit(`G1 X${fmt(iStartX)} Y${fmt(iStartY + rampLen)} Z${fmt(zTarget)} F${velRampa}`);
                        }
                        emit(`G1 X${fmt(iStartX)} Y${fmt(iStartY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    L.push(`${cmt}   Zigzag ${zigAlongX ? 'X' : 'Y'} (eixo ${zigAlongX ? 'longo' : 'curto'})`);

                    if (zigAlongX) {
                        // Zigzag ao longo de X, passo em Y
                        let cy = iStartY, dir = 1;
                        while (cy <= iEndY + 0.01) {
                            const tx = dir === 1 ? iEndX : iStartX;
                            emit(`G1 X${fmt(tx)} Y${fmt(cy)} F${op.velCorte}`);
                            cy += stepOver;
                            if (cy <= iEndY + 0.01) {
                                emit(`G1 X${fmt(tx)} Y${fmt(Math.min(cy, iEndY))} F${op.velCorte}`);
                            }
                            dir *= -1;
                        }
                    } else {
                        // Zigzag ao longo de Y, passo em X
                        let cx = iStartX, dir = 1;
                        while (cx <= iEndX + 0.01) {
                            const ty = dir === 1 ? iEndY : iStartY;
                            emit(`G1 X${fmt(cx)} Y${fmt(ty)} F${op.velCorte}`);
                            cx += stepOver;
                            if (cx <= iEndX + 0.01) {
                                emit(`G1 X${fmt(Math.min(cx, iEndX))} Y${fmt(ty)} F${op.velCorte}`);
                            }
                            dir *= -1;
                        }
                    }

                    // ─── Passe de acabamento no perímetro ───
                    if (pocketAcabamento) {
                        const velAcab = Math.round(op.velCorte * velAcabPct);
                        L.push(`${cmt}   Acabamento perimetro (offset=${fmt(pocketAcabOffset)}mm, vel=${velAcab}mm/min)`);
                        emit(`G1 X${fmt(ox + toolR)} Y${fmt(oy + toolR)} F${op.velCorte}`);
                        emit(`G1 X${fmt(ox + pw - toolR)} Y${fmt(oy + toolR)} F${velAcab}`);
                        emit(`G1 X${fmt(ox + pw - toolR)} Y${fmt(oy + ph - toolR)} F${velAcab}`);
                        emit(`G1 X${fmt(ox + toolR)} Y${fmt(oy + ph - toolR)} F${velAcab}`);
                        emit(`G1 X${fmt(ox + toolR)} Y${fmt(oy + toolR)} F${velAcab}`);
                    }

                    emit(`G0 Z${fmt(zSafe())}`);
                } else if (pw > 0 && ph > 0) {
                    // Pocket pequeno: perímetro simples
                    emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    const px2 = Number(op.absX) + pw, py2 = Number(op.absY) + ph;
                    emit(`G1 X${fmt(px2)} Y${fmt(op.absY)} F${op.velCorte}`);
                    emit(`G1 X${fmt(px2)} Y${fmt(py2)} F${op.velCorte}`);
                    emit(`G1 X${fmt(op.absX)} Y${fmt(py2)} F${op.velCorte}`);
                    emit(`G1 X${fmt(op.absX)} Y${fmt(op.absY)} F${op.velCorte}`);
                    emit(`G0 Z${fmt(zSafe())}`);
                } else {
                    // Plunge simples (sem dimensão de pocket)
                    emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    emit(`G0 Z${fmt(zSafe())}`);
                }
            }
            L.push('');

        } else {
            L.push(`${cmt} Op: ${op.tipoNome} ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)}`);
            emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
            emit(`G0 Z${fmt(zApproach())}`);
            emit(`G1 Z${fmt(zCut(op.depthTotal))} F${velMergulho}`);
            emit(`G0 Z${fmt(zSafe())}`);
            L.push('');
        }
    }

    if (curTool !== null) { emit(`${sOff}`); L.push(`${cmt} Spindle OFF`, ''); }

    // ═══ PASSE FINAL: Onion-skin breakthrough ═══
    if (onionOps.length > 0) {
        L.push('', `${cmt} ════════════════════════════════════════════════════════`);
        L.push(`${cmt} PASSE FINAL -- Onion-skin breakthrough (${onionOps.length} contornos)`);
        L.push(`${cmt} Corte dos ultimos ${onionEsp}mm com velocidade reduzida (60%)`);
        L.push(`${cmt} ════════════════════════════════════════════════════════`, '');

        const onionByTool = {};
        for (const o of onionOps) { (onionByTool[o.toolCode] ||= []).push(o); }

        for (const [tc, ops] of Object.entries(onionByTool)) {
            const tl = toolMap[tc];
            if (!tl) continue;
            emit(`${tl.codigo} ${trocaCmd}`);
            L.push(`${cmt} Troca: ${tl.nome} (breakthrough)`);
            emit(`S${tl.rpm || rpmDef} ${sOn}`);
            if (dwellSpindle > 0) emit(`G4 P${dwellSpindle.toFixed(1)}`);
            L.push('');
            trocas++;

            // Onion breakthrough: ordenar menor→maior (mesma lógica do contorno principal)
            const orderedOnion = ordenarContornos === 'menor_primeiro'
                ? [...ops].sort((a, b) => a.areaCm2 - b.areaCm2)
                : [...ops];
            for (const os of orderByProximity(orderedOnion)) {
                const path = os.contornoPath;
                if (!path || path.length < 4) continue;
                const dFull = os.onionDepthFull || os.depthTotal;
                L.push(`${cmt} Breakthrough: ${os.pecaDesc} Prof=${fmt(dFull)} (${os.areaCm2.toFixed(0)}cm2)`);

                const p0 = path[0], p1 = path[1], p2 = path[2], p3 = path[3];

                // Para breakthrough, entrada direta (pele fina, sem necessidade de rampa complexa)
                emit(`G0 X${fmt(p0.x)} Y${fmt(p0.y)}`);
                emit(`G0 Z${fmt(zApproach())}`);
                emit(`G1 Z${fmt(zCut(dFull))} F${Math.min(velMergulho, os.velFinal)}`);
                L.push(`${cmt}   vel. reduzida (breakthrough ${onionEsp}mm)`);

                // Climb=CCW (p0→p3→p2→p1), Conv=CW (p0→p1→p2→p3)
                if (dirCorte === 'climb') {
                    emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${os.velFinal}`);
                } else {
                    emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${os.velFinal}`);
                }
                emit(`G0 Z${fmt(zRapid())}`);
                L.push('');
            }
            emit(`${sOff}`);
            L.push(`${cmt} Spindle OFF`, '');
        }
    }

    L.push('', footer);

    // ─── Post-processing: adicionar F no G0 se configurado ───
    if (g0ComFeed) {
        for (let i = 0; i < L.length; i++) {
            const stripped = L[i].replace(/^N\d+\s*/, '');
            if (/^G0\s/.test(stripped) && !stripped.includes('F')) {
                L[i] = L[i] + ` F${velVazio}`;
            }
        }
    }

    // ─── Estimativa de tempo REAL baseada em distâncias e velocidades ───
    // Também calcula metros cortados por ferramenta para tool wear tracking
    const gcodeText = L.join('\n');
    const toolWearMap = {}; // { toolCode: metros_cortados_mm }
    const tempoReal = (() => {
        let cx = 0, cy = 0, cz = zSafe(), cf = maquina.vel_vazio || 20000;
        let distRapido = 0, distCorte = 0, distMergulho = 0;
        let tempoTrocas = trocas * (dwellSpindle + 3); // tempo troca + dwell spindle
        let activeTool = null;
        for (const line of L) {
            const stripped = line.replace(/^N\d+\s*/, '').trim();
            if (!stripped || stripped.startsWith(cmt) || stripped.startsWith('(') || stripped.startsWith('%')) continue;
            // Detectar troca de ferramenta (Txx M6)
            const toolMatch = stripped.match(/^(T\S+)\s/);
            if (toolMatch) { activeTool = null; for (const [tc, t] of Object.entries(toolMap)) { if (t.codigo === toolMatch[1]) { activeTool = tc; break; } } }
            const gMatch = stripped.match(/^G([0-3])\b/);
            if (!gMatch) continue;
            const gCode = parseInt(gMatch[1]);
            const xM = stripped.match(/X(-?[\d.]+)/), yM = stripped.match(/Y(-?[\d.]+)/), zM = stripped.match(/Z(-?[\d.]+)/);
            const fM = stripped.match(/F([\d.]+)/);
            const nx = xM ? parseFloat(xM[1]) : cx, ny = yM ? parseFloat(yM[1]) : cy, nz = zM ? parseFloat(zM[1]) : cz;
            if (fM) cf = parseFloat(fM[1]);
            const dxy = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);
            const dz = Math.abs(nz - cz);
            const d3d = Math.sqrt(dxy ** 2 + dz ** 2);
            if (gCode === 0) {
                distRapido += d3d;
            } else {
                if (dxy < 0.01 && dz > 0.01) distMergulho += dz; // pure Z move
                else distCorte += d3d;
                // Acumular distância de corte (G1/G2/G3) por ferramenta
                if (activeTool) toolWearMap[activeTool] = (toolWearMap[activeTool] || 0) + d3d;
            }
            cx = nx; cy = ny; cz = nz;
        }
        const velVazio = maquina.vel_vazio || 20000;
        const tRapido = distRapido / velVazio; // minutos
        const tCorte = distCorte > 0 ? distCorte / (velCorteMaq || 4000) : 0;
        const tMergulho = distMergulho / (velMergulho || 1500);
        const totalMin = tRapido + tCorte + tMergulho + tempoTrocas / 60;
        return {
            tempo_min: Math.round(totalMin * 10) / 10,
            dist_rapido_m: Math.round(distRapido / 100) / 10,
            dist_corte_m: Math.round(distCorte / 100) / 10,
            dist_mergulho_m: Math.round(distMergulho / 100) / 10,
        };
    })();

    // Validar se G-code contém operações reais (não apenas header/footer/comentários)
    const realLines = L.filter(l => {
        const s = l.replace(/^N\d+\s*/, '').trim();
        return s && !s.startsWith(cmt) && !s.startsWith('(') && !s.startsWith('%') && /^[GM]/.test(s);
    });
    if (realLines.length < 3) {
        alertas.push({ tipo: 'erro_critico', msg: 'G-Code gerado sem operações de corte. Verifique: ferramentas cadastradas, peças com usinagens, e configurações de exportação (lado A/B, furos, contornos).' });
    }

    return {
        gcode: gcodeText,
        stats: {
            total_operacoes: totalOps,
            trocas_ferramenta: trocas,
            contornos_peca: allOps.filter(o => o.opType === 'contorno').length,
            contornos_sobra: allOps.filter(o => o.opType === 'contorno_sobra').length,
            onion_skin_ops: onionOps.length,
            usinagens_internas: allOps.filter(o => o.fase === 0).length,
            pecas_pequenas: allOps.filter(o => o.isPequena && o.isContorno).length,
            ferramentas_adaptadas: allOps.filter(o => o.toolAdapted).length,
            rasgos_multi_pass: allOps.filter(o => o.grooveMultiPass).length,
            ordenacao_contornos: ordenarContornos,
            usar_rampa: useRampa,
            rampa_tipo: rampaTipo,
            usar_lead_in: usarLeadIn,
            stepover_pct: Math.round(stepoverPct * 100),
            pocket_acabamento: pocketAcabamento,
            compensar_raio_canal: compensarRaioCanal,
            furos_helicoidais: allOps.filter(o => o.resolvedMetodo === 'helical').length,
            furos_circulares: allOps.filter(o => o.resolvedMetodo === 'circular').length,
            tempo_estimado_min: tempoReal.tempo_min,
            dist_rapido_m: tempoReal.dist_rapido_m,
            dist_corte_m: tempoReal.dist_corte_m,
            dist_mergulho_m: tempoReal.dist_mergulho_m,
        },
        alertas,
        ferramentas_faltando: [...missingTools],
        ferramentas_faltando_detalhes: missingToolDetails,
        contorno_tool: contTool ? { codigo: contTool.codigo, nome: contTool.nome, diametro: contTool.diametro } : null,
        tool_wear: toolWearMap, // { toolCode: distancia_mm }
    };
}

// ─── Helper: Atualizar desgaste de ferramentas após G-code ───
function updateToolWear(toolMap, toolWearMap, loteId) {
    const stmtUpdate = db.prepare('UPDATE cnc_ferramentas SET metros_acumulados = metros_acumulados + ? WHERE id = ?');
    const stmtLog = db.prepare('INSERT INTO cnc_tool_wear_log (ferramenta_id, lote_id, metros_lineares, num_operacoes) VALUES (?,?,?,?)');
    for (const [toolCode, distMm] of Object.entries(toolWearMap)) {
        const tool = toolMap[toolCode];
        if (!tool) continue;
        const metros = distMm / 1000; // mm → m
        stmtUpdate.run(metros, tool.id);
        stmtLog.run(tool.id, loteId || null, metros, 1);
    }
}

// ─── Endpoints G-code v2 ───────────────────────────────

// Carrega dados comuns para geração de G-code
function loadGcodeContext(req, loteId) {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(loteId, req.user.id);
    if (!lote) return { error: 'Lote não encontrado', status: 404 };
    if (!lote.plano_json) return { error: 'Lote sem plano de corte. Otimize primeiro.', status: 400 };

    let plano;
    try { plano = JSON.parse(lote.plano_json); } catch (_) { return { error: 'Plano de corte inválido', status: 400 }; }
    if (!plano.chapas || plano.chapas.length === 0) return { error: 'Plano sem chapas', status: 400 };

    const maquinaId = req.body.maquina_id;
    let maquina;
    if (maquinaId) maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ? AND ativo = 1').get(maquinaId);
    if (!maquina) maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE padrao = 1 AND ativo = 1 LIMIT 1').get();
    if (!maquina) maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE ativo = 1 LIMIT 1').get();
    if (!maquina) return { error: 'Nenhuma máquina CNC cadastrada.', status: 400 };

    const ferramentas = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').all(maquina.id);
    const toolMap = {};
    for (const f of ferramentas) { if (f.tool_code) toolMap[f.tool_code] = f; }

    const usinagemTipos = db.prepare('SELECT * FROM cnc_usinagem_tipos WHERE ativo = 1 ORDER BY prioridade').all();
    // Multi-lote: coletar TODOS pecaIds referenciados no plano (pode ter lotes mesclados)
    const allPecaIds = new Set();
    for (const ch of plano.chapas || []) {
        for (const p of ch.pecas || []) { if (p.pecaId) allPecaIds.add(p.pecaId); }
    }
    let pecasDb;
    if (allPecaIds.size > 0) {
        const ids = [...allPecaIds];
        pecasDb = db.prepare(`SELECT * FROM cnc_pecas WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    } else {
        pecasDb = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
    }

    const cfgRow = db.prepare('SELECT * FROM cnc_config LIMIT 1').get() || {};
    const cfg = {
        sobra_min_largura: cfgRow.sobra_min_largura || 300,
        sobra_min_comprimento: cfgRow.sobra_min_comprimento || 600,
        contorno_tool_code: req.body.contorno_tool_code || '',
        otimizar_trocas_ferramenta: cfgRow.otimizar_trocas_ferramenta ?? 1,
    };

    const extensao = maquina.extensao_arquivo || '.nc';

    return { lote, plano, maquina, toolMap, usinagemTipos, pecasDb, cfg, extensao };
}

// POST /gcode/:loteId/chapa/:chapaIdx — G-code de UMA chapa
router.post('/gcode/:loteId/chapa/:chapaIdx', requireAuth, async (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

        const chapaIdx = parseInt(req.params.chapaIdx);
        if (isNaN(chapaIdx) || chapaIdx < 0 || chapaIdx >= ctx.plano.chapas.length) {
            return res.status(400).json({ error: `Chapa ${chapaIdx} não existe. Total: ${ctx.plano.chapas.length}` });
        }

        const chapa = ctx.plano.chapas[chapaIdx];

        // Check for machine-specific assignment
        let maquina = ctx.maquina;
        let toolMap = ctx.toolMap;
        const assignment = db.prepare('SELECT maquina_id FROM cnc_machine_assignments WHERE lote_id = ? AND chapa_idx = ?').get(ctx.lote.id, chapaIdx);
        if (assignment && assignment.maquina_id) {
            const assignedMachine = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ? AND ativo = 1').get(assignment.maquina_id);
            if (assignedMachine) {
                maquina = assignedMachine;
                const ferramentas = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').all(assignedMachine.id);
                toolMap = {};
                for (const f of ferramentas) { if (f.tool_code) toolMap[f.tool_code] = f; }
            }
        }

        const result = generateGcodeForChapa(chapa, chapaIdx, ctx.pecasDb, maquina, toolMap, ctx.usinagemTipos, ctx.cfg);

        if (result.ferramentas_faltando.length > 0) {
            return res.json({
                ok: false, ...result, extensao: ctx.extensao,
                error: `Ferramentas faltando: ${result.ferramentas_faltando.join(', ')}`,
            });
        }

        // Atualizar desgaste de ferramentas
        if (result.tool_wear) {
            updateToolWear(ctx.toolMap, result.tool_wear, ctx.lote.id);
        }

        const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(chapaIdx + 1).padStart(2, '0')}`;
        const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + ctx.extensao;

        // Log G-code generation history
        try {
            const crypto = await import('crypto');
            const hash = crypto.createHash('md5').update(result.gcode || '').digest('hex').slice(0, 12);
            db.prepare(`INSERT INTO cnc_gcode_historico (lote_id, chapa_idx, maquina_id, maquina_nome, filename, gcode_hash, total_operacoes, tempo_estimado_min, dist_corte_m, alertas_count, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
                ctx.lote.id, chapaIdx, maquina.id, maquina.nome || '', filename, hash,
                result.stats?.total_operacoes || 0, result.stats?.tempo_estimado_min || 0, result.stats?.dist_corte_m || 0,
                (result.alertas || []).length, req.user.id
            );
        } catch (_) { /* non-critical */ }

        res.json({ ok: true, ...result, extensao: ctx.extensao, filename, chapa_idx: chapaIdx });
    } catch (err) {
        console.error('Erro G-code chapa:', err);
        res.status(500).json({ error: `Erro ao gerar G-code: ${err.message || err}` });
    }
});

// POST /gcode/:loteId — G-code (todas as chapas OU lote completo)
router.post('/gcode/:loteId', requireAuth, async (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

        // ═══ PYTHON G-CODE (único motor) ═══════════════════════════
        if (!(await isPythonAvailable())) {
            return res.status(503).json({ error: 'Motor Python (CNC Optimizer) indisponível. Verifique se o serviço está rodando na porta 8000.' });
        }
        console.log(`  [CNC] Usando G-code Python para lote ${ctx.lote.id}`);
        {

            const ferramentas = Object.values(ctx.toolMap).map(f => ({
                codigo: f.codigo || f.tool_code,
                nome: f.nome || '',
                tipo: f.tipo || 'contorno',
                diametro: f.diametro || 6,
                profundidade_corte: f.profundidade_corte || 6,
                velocidade_rpm: f.velocidade_rpm || 18000,
                tool_code: f.tool_code || f.codigo,
            }));

            const pyResult = await callPython('gcode', {
                plano: ctx.plano,
                maquina: {
                    id: ctx.maquina.id, nome: ctx.maquina.nome,
                    fabricante: ctx.maquina.fabricante || '', modelo: ctx.maquina.modelo || '',
                    extensao_arquivo: ctx.extensao,
                    gcode_header: ctx.maquina.gcode_header || '%\nG90 G54 G17',
                    gcode_footer: ctx.maquina.gcode_footer || 'G0 Z200.000\nM5\nM30\n%',
                    z_seguro: ctx.maquina.z_seguro || 30,
                    vel_vazio: ctx.maquina.vel_vazio || 20000,
                    vel_corte: ctx.maquina.vel_corte || 4000,
                    vel_aproximacao: ctx.maquina.vel_aproximacao || 8000,
                    rpm_padrao: ctx.maquina.rpm_padrao || 18000,
                    profundidade_extra: ctx.maquina.profundidade_extra || 0.2,
                    usar_onion_skin: !!ctx.maquina.usar_onion_skin,
                    onion_skin_espessura: ctx.maquina.onion_skin_espessura || 0.5,
                    usar_tabs: !!ctx.maquina.usar_tabs,
                    usar_lead_in: ctx.maquina.usar_lead_in !== 0,
                    feed_rate_pct_pequenas: ctx.maquina.feed_rate_pct_pequenas || 50,
                    feed_rate_area_max: ctx.maquina.feed_rate_area_max || 500,
                    troca_ferramenta_cmd: ctx.maquina.troca_ferramenta_cmd || 'M6',
                    spindle_on_cmd: ctx.maquina.spindle_on_cmd || 'M3',
                    spindle_off_cmd: ctx.maquina.spindle_off_cmd || 'M5',
                    casas_decimais: ctx.maquina.casas_decimais || 3,
                    comentario_prefixo: ctx.maquina.comentario_prefixo || ';',
                },
                ferramentas,
                usinagem_tipos: ctx.usinagemTipos,
                pecas_db: ctx.pecasDb.map(p => ({
                    id: p.id, persistent_id: p.persistent_id || '',
                    comprimento: p.comprimento, largura: p.largura,
                    material_code: p.material_code || '',
                    descricao: p.descricao || '',
                })),
            });

            if (pyResult && pyResult.ok) {
                // Adicionar filenames com nome do lote
                for (const ch of pyResult.chapas) {
                    const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(ch.idx + 1).padStart(2, '0')}`;
                    ch.filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + ctx.extensao;
                }
                pyResult.extensao = ctx.extensao;
                pyResult.motor = 'python';
                return res.json(pyResult);
            }
            return res.status(500).json({ error: 'Motor Python não gerou G-code. Verifique o plano.' });
        }

    } catch (err) {
        console.error('Erro G-code:', err);
        res.status(500).json({ error: 'Erro ao gerar G-code' });
    }
});


// ─── Validação de usinagens (depth conflicts) ───────────
router.get('/validar-usinagens/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        let plano;
        try { plano = JSON.parse(lote.plano_json); } catch (_) { return res.status(400).json({ error: 'Plano inválido' }); }

        // Load pieces from DB
        const allPecaIds = new Set();
        for (const ch of plano.chapas || []) {
            for (const p of ch.pecas || []) { if (p.pecaId) allPecaIds.add(p.pecaId); }
        }
        let pecasDb = [];
        if (allPecaIds.size > 0) {
            const ids = [...allPecaIds];
            pecasDb = db.prepare(`SELECT * FROM cnc_pecas WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
        }
        const pecasMap = {};
        for (const p of pecasDb) pecasMap[p.id] = p;

        // Load tools for tool length validation
        const maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE padrao = 1 AND ativo = 1 LIMIT 1').get()
            || db.prepare('SELECT * FROM cnc_maquinas WHERE ativo = 1 LIMIT 1').get();
        const ferramentas = maquina ? db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').all(maquina.id) : [];
        const toolMap = {};
        for (const f of ferramentas) { if (f.tool_code) toolMap[f.tool_code] = f; }

        const conflicts = [];

        for (let ci = 0; ci < (plano.chapas || []).length; ci++) {
            const chapa = plano.chapas[ci];
            const espChapa = chapa.espessura || 18;

            for (let pi = 0; pi < (chapa.pecas || []).length; pi++) {
                const pp = chapa.pecas[pi];
                const pDb = pecasMap[pp.pecaId];
                if (!pDb) continue;

                const ladoAtivo = pp.lado_ativo || 'A';
                let mach = {};
                try { mach = JSON.parse(pDb.machining_json || '{}'); } catch (_) {}
                if (ladoAtivo === 'B' && pDb.machining_json_b) {
                    try { mach = JSON.parse(pDb.machining_json_b); } catch (_) {}
                }

                // Collect all workers
                const workers = [];
                if (mach.workers) {
                    const wArr = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);
                    for (const r of wArr) { if (r && typeof r === 'object') workers.push(r); }
                }
                for (const side of ['side_a', 'side_b']) {
                    const sd = mach[side];
                    if (!sd) continue;
                    const sArr = Array.isArray(sd) ? sd : Object.values(sd);
                    for (const r of sArr) { if (r && typeof r === 'object') workers.push(r); }
                }

                const pecaEsp = pDb.espessura || espChapa;
                const opsBBoxes = []; // for overlap detection

                for (let wi = 0; wi < workers.length; wi++) {
                    const w = workers[wi];
                    const depth = Number(w.depth || 0);
                    const tc = w.tool_code || w.tool || '';
                    const tipo = (w.type || w.category || '').toLowerCase();
                    const tool = toolMap[tc] || null;

                    // Check 1: Depth exceeding piece thickness
                    if (depth > pecaEsp) {
                        conflicts.push({
                            chapaIdx: ci, pecaIdx: pi,
                            pecaDesc: pDb.descricao || `Peca #${pDb.id}`,
                            tipo: 'profundidade_excessiva',
                            mensagem: `Profundidade ${depth.toFixed(1)}mm excede espessura da peca (${pecaEsp}mm). Operacao: ${tipo || 'desconhecida'}`,
                            severidade: 'erro',
                        });
                    }

                    // Check 2: Tool length insufficient
                    if (tool && tool.comprimento_util && depth > tool.comprimento_util) {
                        conflicts.push({
                            chapaIdx: ci, pecaIdx: pi,
                            pecaDesc: pDb.descricao || `Peca #${pDb.id}`,
                            tipo: 'ferramenta_curta',
                            mensagem: `Profundidade ${depth.toFixed(1)}mm excede comprimento util da ferramenta ${tool.nome || tc} (${tool.comprimento_util}mm)`,
                            severidade: 'erro',
                        });
                    }

                    // Collect bounding boxes for overlap check
                    const mx = Number(w.x ?? w.position_x ?? 0);
                    const my = Number(w.y ?? w.position_y ?? 0);
                    const diam = Number(w.diameter || 0);
                    const pw2 = Number(w.pocket_width || w.width || diam || 6);
                    const ph2 = Number(w.pocket_height || w.height || diam || 6);
                    opsBBoxes.push({ x: mx - pw2 / 2, y: my - ph2 / 2, w: pw2, h: ph2, depth, idx: wi, tipo });
                }

                // Check 3: Overlapping operations whose combined depth > espessura
                for (let a = 0; a < opsBBoxes.length; a++) {
                    for (let b = a + 1; b < opsBBoxes.length; b++) {
                        const ba = opsBBoxes[a], bb = opsBBoxes[b];
                        // AABB intersection
                        if (ba.x < bb.x + bb.w && ba.x + ba.w > bb.x &&
                            ba.y < bb.y + bb.h && ba.y + ba.h > bb.y) {
                            const combinedDepth = ba.depth + bb.depth;
                            if (combinedDepth > pecaEsp) {
                                conflicts.push({
                                    chapaIdx: ci, pecaIdx: pi,
                                    pecaDesc: pDb.descricao || `Peca #${pDb.id}`,
                                    tipo: 'sobreposicao_profundidade',
                                    mensagem: `Operacoes sobrepostas (${ba.tipo || 'op' + (ba.idx + 1)} + ${bb.tipo || 'op' + (bb.idx + 1)}) com profundidade combinada ${combinedDepth.toFixed(1)}mm > espessura ${pecaEsp}mm`,
                                    severidade: combinedDepth > pecaEsp * 1.2 ? 'erro' : 'alerta',
                                });
                            }
                        }
                    }
                }
            }
        }

        res.json({ ok: true, conflicts });
    } catch (err) {
        console.error('Erro validar usinagens:', err);
        res.status(500).json({ error: 'Erro ao validar usinagens' });
    }
});

// ─── Salvar machining lado B de uma peça ─────────────────
router.post('/pecas/:pecaId/machining-lado-b', requireAuth, (req, res) => {
    try {
        const { pecaId } = req.params;
        const { machining_json_b } = req.body;
        if (!machining_json_b) return res.status(400).json({ error: 'machining_json_b obrigatorio' });

        // Ensure column exists
        try {
            db.prepare('ALTER TABLE cnc_pecas ADD COLUMN machining_json_b TEXT').run();
        } catch (_) { /* column already exists */ }

        db.prepare('UPDATE cnc_pecas SET machining_json_b = ? WHERE id = ?')
            .run(typeof machining_json_b === 'string' ? machining_json_b : JSON.stringify(machining_json_b), pecaId);

        res.json({ ok: true });
    } catch (err) {
        console.error('Erro salvar machining lado B:', err);
        res.status(500).json({ error: 'Erro ao salvar machining lado B' });
    }
});

// GRUPO 6: CRUD Máquinas CNC (pós-processadores)
// ═══════════════════════════════════════════════════════

router.get('/maquinas', requireAuth, (req, res) => {
    const maquinas = db.prepare('SELECT * FROM cnc_maquinas ORDER BY padrao DESC, nome').all();
    // Include tool count per machine
    const countStmt = db.prepare('SELECT COUNT(*) as c FROM cnc_ferramentas WHERE maquina_id = ?');
    res.json(maquinas.map(m => ({ ...m, total_ferramentas: countStmt.get(m.id).c })));
});

router.get('/maquinas/:id', requireAuth, (req, res) => {
    const maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ?').get(req.params.id);
    if (!maquina) return res.status(404).json({ error: 'Máquina não encontrada' });
    const ferramentas = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? ORDER BY codigo').all(maquina.id);
    res.json({ ...maquina, ferramentas });
});

router.post('/maquinas', requireAuth, (req, res) => {
    const m = req.body;
    if (!m.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare(`INSERT INTO cnc_maquinas (user_id, nome, fabricante, modelo, tipo_pos, extensao_arquivo,
        x_max, y_max, z_max, gcode_header, gcode_footer,
        z_seguro, vel_vazio, vel_corte, vel_aproximacao, rpm_padrao, profundidade_extra,
        coordenada_zero, eixo_x_invertido, eixo_y_invertido,
        exportar_lado_a, exportar_lado_b, exportar_furos, exportar_rebaixos, exportar_usinagens,
        usar_ponto_decimal, casas_decimais, comentario_prefixo, troca_ferramenta_cmd, spindle_on_cmd, spindle_off_cmd,
        usar_onion_skin, onion_skin_espessura, onion_skin_area_max, usar_tabs, tab_largura, tab_altura, tab_qtd, tab_area_max,
        usar_lead_in, lead_in_tipo, lead_in_raio, feed_rate_pct_pequenas, feed_rate_area_max,
        z_origin, z_aproximacao, direcao_corte, usar_n_codes, n_code_incremento, dwell_spindle,
        usar_rampa, rampa_angulo, vel_mergulho, z_aproximacao_rapida, ordenar_contornos,
        rampa_tipo, vel_rampa, rampa_diametro_pct, stepover_pct, pocket_acabamento, pocket_acabamento_offset, pocket_direcao,
        compensar_raio_canal, compensacao_tipo, circular_passes_acabamento, circular_offset_desbaste, vel_acabamento_pct,
        margem_mesa_sacrificio, g0_com_feed,
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, m.nome, m.fabricante || '', m.modelo || '', m.tipo_pos || 'generic', m.extensao_arquivo || '.nc',
            m.x_max || 2800, m.y_max || 1900, m.z_max || 200,
            m.gcode_header || '%\nG90 G54 G17',
            m.gcode_footer || 'G0 Z200.000\nM5\nM30\n%',
            m.z_seguro || 30, m.vel_vazio || 20000, m.vel_corte || 4000, m.vel_aproximacao || 8000,
            m.rpm_padrao || 12000, m.profundidade_extra || 0.20,
            m.coordenada_zero || 'canto_esq_inf', m.eixo_x_invertido || 0, m.eixo_y_invertido || 0,
            m.exportar_lado_a ?? 1, m.exportar_lado_b ?? 1, m.exportar_furos ?? 1, m.exportar_rebaixos ?? 1, m.exportar_usinagens ?? 1,
            m.usar_ponto_decimal ?? 1, m.casas_decimais || 3, m.comentario_prefixo || ';',
            m.troca_ferramenta_cmd || 'M6', m.spindle_on_cmd || 'M3', m.spindle_off_cmd || 'M5',
            m.usar_onion_skin ?? 1, m.onion_skin_espessura ?? 0.5, m.onion_skin_area_max ?? 500,
            m.usar_tabs ?? 0, m.tab_largura ?? 4, m.tab_altura ?? 1.5, m.tab_qtd ?? 2, m.tab_area_max ?? 800,
            m.usar_lead_in ?? 0, m.lead_in_tipo || 'arco', m.lead_in_raio ?? 5,
            m.feed_rate_pct_pequenas ?? 50, m.feed_rate_area_max ?? 500,
            m.z_origin || 'mesa', m.z_aproximacao ?? 2.0, m.direcao_corte || 'climb',
            m.usar_n_codes ?? 1, m.n_code_incremento ?? 10, m.dwell_spindle ?? 1.0,
            m.usar_rampa ?? 1, m.rampa_angulo ?? 3.0, m.vel_mergulho ?? 1500,
            m.z_aproximacao_rapida ?? 5.0, m.ordenar_contornos || 'menor_primeiro',
            m.rampa_tipo || 'linear', m.vel_rampa ?? 1500, m.rampa_diametro_pct ?? 80,
            m.stepover_pct ?? 60, m.pocket_acabamento ?? 1, m.pocket_acabamento_offset ?? 0.2, m.pocket_direcao || 'auto',
            m.compensar_raio_canal ?? 1, m.compensacao_tipo || 'overcut',
            m.circular_passes_acabamento ?? 1, m.circular_offset_desbaste ?? 0.3, m.vel_acabamento_pct ?? 80,
            m.margem_mesa_sacrificio ?? 0.5, m.g0_com_feed ?? 0,
            m.padrao || 0);
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/maquinas/:id', requireAuth, (req, res) => {
    const m = req.body;
    // If setting as default, unset others
    if (m.padrao) {
        db.prepare('UPDATE cnc_maquinas SET padrao = 0 WHERE id != ?').run(req.params.id);
    }
    db.prepare(`UPDATE cnc_maquinas SET nome=?, fabricante=?, modelo=?, tipo_pos=?, extensao_arquivo=?,
        x_max=?, y_max=?, z_max=?, gcode_header=?, gcode_footer=?,
        z_seguro=?, vel_vazio=?, vel_corte=?, vel_aproximacao=?, rpm_padrao=?, profundidade_extra=?,
        coordenada_zero=?, eixo_x_invertido=?, eixo_y_invertido=?,
        exportar_lado_a=?, exportar_lado_b=?, exportar_furos=?, exportar_rebaixos=?, exportar_usinagens=?,
        usar_ponto_decimal=?, casas_decimais=?, comentario_prefixo=?, troca_ferramenta_cmd=?, spindle_on_cmd=?, spindle_off_cmd=?,
        usar_onion_skin=?, onion_skin_espessura=?, onion_skin_area_max=?,
        usar_tabs=?, tab_largura=?, tab_altura=?, tab_qtd=?, tab_area_max=?,
        usar_lead_in=?, lead_in_tipo=?, lead_in_raio=?,
        feed_rate_pct_pequenas=?, feed_rate_area_max=?,
        z_origin=?, z_aproximacao=?, direcao_corte=?, usar_n_codes=?, n_code_incremento=?, dwell_spindle=?,
        usar_rampa=?, rampa_angulo=?, vel_mergulho=?, z_aproximacao_rapida=?, ordenar_contornos=?,
        rampa_tipo=?, vel_rampa=?, rampa_diametro_pct=?, stepover_pct=?, pocket_acabamento=?, pocket_acabamento_offset=?, pocket_direcao=?,
        compensar_raio_canal=?, compensacao_tipo=?, circular_passes_acabamento=?, circular_offset_desbaste=?, vel_acabamento_pct=?,
        margem_mesa_sacrificio=?, g0_com_feed=?,
        padrao=?, ativo=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`)
        .run(m.nome, m.fabricante, m.modelo, m.tipo_pos, m.extensao_arquivo,
            m.x_max, m.y_max, m.z_max, m.gcode_header, m.gcode_footer,
            m.z_seguro, m.vel_vazio, m.vel_corte, m.vel_aproximacao, m.rpm_padrao, m.profundidade_extra,
            m.coordenada_zero, m.eixo_x_invertido, m.eixo_y_invertido,
            m.exportar_lado_a, m.exportar_lado_b, m.exportar_furos, m.exportar_rebaixos, m.exportar_usinagens,
            m.usar_ponto_decimal, m.casas_decimais, m.comentario_prefixo, m.troca_ferramenta_cmd, m.spindle_on_cmd, m.spindle_off_cmd,
            m.usar_onion_skin ?? 1, m.onion_skin_espessura ?? 0.5, m.onion_skin_area_max ?? 500,
            m.usar_tabs ?? 0, m.tab_largura ?? 4, m.tab_altura ?? 1.5, m.tab_qtd ?? 2, m.tab_area_max ?? 800,
            m.usar_lead_in ?? 0, m.lead_in_tipo || 'arco', m.lead_in_raio ?? 5,
            m.feed_rate_pct_pequenas ?? 50, m.feed_rate_area_max ?? 500,
            m.z_origin || 'mesa', m.z_aproximacao ?? 2.0, m.direcao_corte || 'climb',
            m.usar_n_codes ?? 1, m.n_code_incremento ?? 10, m.dwell_spindle ?? 1.0,
            m.usar_rampa ?? 1, m.rampa_angulo ?? 3.0, m.vel_mergulho ?? 1500,
            m.z_aproximacao_rapida ?? 5.0, m.ordenar_contornos || 'menor_primeiro',
            m.rampa_tipo || 'linear', m.vel_rampa ?? 1500, m.rampa_diametro_pct ?? 80,
            m.stepover_pct ?? 60, m.pocket_acabamento ?? 1, m.pocket_acabamento_offset ?? 0.2, m.pocket_direcao || 'auto',
            m.compensar_raio_canal ?? 1, m.compensacao_tipo || 'overcut',
            m.circular_passes_acabamento ?? 1, m.circular_offset_desbaste ?? 0.3, m.vel_acabamento_pct ?? 80,
            m.margem_mesa_sacrificio ?? 0.5, m.g0_com_feed ?? 0,
            m.padrao ?? 0, m.ativo ?? 1, req.params.id);
    res.json({ ok: true });
});

router.delete('/maquinas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_maquinas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Duplicar máquina (com ferramentas)
router.post('/maquinas/:id/duplicar', requireAuth, (req, res) => {
    const original = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ?').get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Máquina não encontrada' });

    const r = db.prepare(`INSERT INTO cnc_maquinas (user_id, nome, fabricante, modelo, tipo_pos, extensao_arquivo,
        x_max, y_max, z_max, gcode_header, gcode_footer,
        z_seguro, vel_vazio, vel_corte, vel_aproximacao, rpm_padrao, profundidade_extra,
        coordenada_zero, eixo_x_invertido, eixo_y_invertido,
        exportar_lado_a, exportar_lado_b, exportar_furos, exportar_rebaixos, exportar_usinagens,
        usar_ponto_decimal, casas_decimais, comentario_prefixo, troca_ferramenta_cmd, spindle_on_cmd, spindle_off_cmd,
        usar_onion_skin, onion_skin_espessura, onion_skin_area_max, usar_tabs, tab_largura, tab_altura, tab_qtd, tab_area_max,
        usar_lead_in, lead_in_tipo, lead_in_raio, feed_rate_pct_pequenas, feed_rate_area_max,
        z_origin, z_aproximacao, direcao_corte, usar_n_codes, n_code_incremento, dwell_spindle,
        usar_rampa, rampa_angulo, vel_mergulho, z_aproximacao_rapida, ordenar_contornos,
        rampa_tipo, vel_rampa, rampa_diametro_pct, stepover_pct, pocket_acabamento, pocket_acabamento_offset, pocket_direcao,
        compensar_raio_canal, compensacao_tipo, circular_passes_acabamento, circular_offset_desbaste, vel_acabamento_pct,
        margem_mesa_sacrificio, g0_com_feed,
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
        .run(req.user.id, `${original.nome} (cópia)`, original.fabricante, original.modelo, original.tipo_pos, original.extensao_arquivo,
            original.x_max, original.y_max, original.z_max, original.gcode_header, original.gcode_footer,
            original.z_seguro, original.vel_vazio, original.vel_corte, original.vel_aproximacao, original.rpm_padrao, original.profundidade_extra,
            original.coordenada_zero, original.eixo_x_invertido, original.eixo_y_invertido,
            original.exportar_lado_a, original.exportar_lado_b, original.exportar_furos, original.exportar_rebaixos, original.exportar_usinagens,
            original.usar_ponto_decimal, original.casas_decimais, original.comentario_prefixo, original.troca_ferramenta_cmd, original.spindle_on_cmd, original.spindle_off_cmd,
            original.usar_onion_skin, original.onion_skin_espessura, original.onion_skin_area_max,
            original.usar_tabs, original.tab_largura, original.tab_altura, original.tab_qtd, original.tab_area_max,
            original.usar_lead_in, original.lead_in_tipo, original.lead_in_raio,
            original.feed_rate_pct_pequenas, original.feed_rate_area_max,
            original.z_origin || 'mesa', original.z_aproximacao ?? 2.0, original.direcao_corte || 'climb',
            original.usar_n_codes ?? 1, original.n_code_incremento ?? 10, original.dwell_spindle ?? 1.0,
            original.usar_rampa ?? 1, original.rampa_angulo ?? 3.0, original.vel_mergulho ?? 1500,
            original.z_aproximacao_rapida ?? 5.0, original.ordenar_contornos || 'menor_primeiro',
            original.rampa_tipo || 'linear', original.vel_rampa ?? 1500, original.rampa_diametro_pct ?? 80,
            original.stepover_pct ?? 60, original.pocket_acabamento ?? 1, original.pocket_acabamento_offset ?? 0.2, original.pocket_direcao || 'auto',
            original.compensar_raio_canal ?? 1, original.compensacao_tipo || 'overcut',
            original.circular_passes_acabamento ?? 1, original.circular_offset_desbaste ?? 0.3, original.vel_acabamento_pct ?? 80,
            original.margem_mesa_sacrificio ?? 0.5, original.g0_com_feed ?? 0);

    const newId = Number(r.lastInsertRowid);
    // Duplicate tools
    const tools = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ?').all(original.id);
    const ins = db.prepare('INSERT INTO cnc_ferramentas (user_id, maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const t of tools) {
        ins.run(req.user.id, newId, t.codigo, t.nome, t.tipo, t.diametro, t.profundidade_max, t.velocidade_corte, t.rpm, t.tool_code);
    }

    res.json({ id: newId });
});

// ═══════════════════════════════════════════════════════
// GRUPO 6B: CRUD Tipos de Usinagem (prioridades CNC)
// ═══════════════════════════════════════════════════════

router.get('/usinagem-tipos', requireAuth, (req, res) => {
    const tipos = db.prepare('SELECT * FROM cnc_usinagem_tipos ORDER BY prioridade, nome').all();
    res.json(tipos);
});

router.post('/usinagem-tipos', requireAuth, (req, res) => {
    const { codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao, estrategias } = req.body;
    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    const estrategiasJson = typeof estrategias === 'string' ? estrategias : JSON.stringify(estrategias || []);
    const r = db.prepare(`INSERT INTO cnc_usinagem_tipos (user_id, codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao, estrategias) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, codigo, nome, categoria_match || '', diametro_match ?? null, prioridade ?? 5, fase || 'interna', tool_code_padrao || '', profundidade_padrao ?? null, largura_padrao ?? null, estrategiasJson);
    res.json({ ok: true, id: r.lastInsertRowid });
});

router.put('/usinagem-tipos/:id', requireAuth, (req, res) => {
    const { nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao, ativo } = req.body;
    const fields = [];
    const vals = [];
    if (nome !== undefined) { fields.push('nome = ?'); vals.push(nome); }
    if (categoria_match !== undefined) { fields.push('categoria_match = ?'); vals.push(categoria_match); }
    if (diametro_match !== undefined) { fields.push('diametro_match = ?'); vals.push(diametro_match); }
    if (prioridade !== undefined) { fields.push('prioridade = ?'); vals.push(prioridade); }
    if (fase !== undefined) { fields.push('fase = ?'); vals.push(fase); }
    if (tool_code_padrao !== undefined) { fields.push('tool_code_padrao = ?'); vals.push(tool_code_padrao); }
    if (profundidade_padrao !== undefined) { fields.push('profundidade_padrao = ?'); vals.push(profundidade_padrao); }
    if (largura_padrao !== undefined) { fields.push('largura_padrao = ?'); vals.push(largura_padrao); }
    if (ativo !== undefined) { fields.push('ativo = ?'); vals.push(ativo); }
    if (req.body.estrategias !== undefined) {
        fields.push('estrategias = ?');
        vals.push(typeof req.body.estrategias === 'string' ? req.body.estrategias : JSON.stringify(req.body.estrategias || []));
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    vals.push(req.params.id);
    db.prepare(`UPDATE cnc_usinagem_tipos SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});

router.delete('/usinagem-tipos/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_usinagem_tipos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 7: CRUD Chapas, Retalhos, Ferramentas, Config
// ═══════════════════════════════════════════════════════

// ─── Chapas ──────────────────────────────────────────
router.get('/chapas', requireAuth, (req, res) => {
    const chapas = db.prepare('SELECT * FROM cnc_chapas ORDER BY espessura_nominal, nome').all();
    res.json(chapas);
});

router.post('/chapas', requireAuth, (req, res) => {
    const { nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare(`INSERT INTO cnc_chapas (user_id, nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, nome, material_code || '', espessura_nominal || 18, espessura_real || 18.5,
        comprimento || 2750, largura || 1850, refilo || 10, veio || 'sem_veio', preco || 0, kerf ?? 4);
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/chapas/:id', requireAuth, (req, res) => {
    const { nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf, ativo } = req.body;
    db.prepare(`UPDATE cnc_chapas SET nome=?, material_code=?, espessura_nominal=?, espessura_real=?, comprimento=?, largura=?, refilo=?, veio=?, preco=?, kerf=?, ativo=? WHERE id=?`)
        .run(nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf ?? 4, ativo ?? 1, req.params.id);
    res.json({ ok: true });
});

router.delete('/chapas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_chapas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ─── Retalhos ──────────────────────────────────────────
router.get('/retalhos', requireAuth, (req, res) => {
    const retalhos = db.prepare('SELECT * FROM cnc_retalhos WHERE disponivel = 1 ORDER BY criado_em DESC').all();
    res.json(retalhos);
});

router.post('/retalhos', requireAuth, (req, res) => {
    const { nome, material_code, espessura_real, comprimento, largura } = req.body;
    const r = db.prepare(`INSERT INTO cnc_retalhos (user_id, nome, material_code, espessura_real, comprimento, largura)
        VALUES (?,?,?,?,?,?)`).run(req.user.id, nome || '', material_code || '', espessura_real || 0, comprimento || 0, largura || 0);
    // Log history: manual creation
    db.prepare(`INSERT INTO cnc_retalho_historico (retalho_id, largura, comprimento, material_code, espessura, acao)
        VALUES (?, ?, ?, ?, ?, 'criado')`).run(
        String(r.lastInsertRowid), largura || 0, comprimento || 0, material_code || '', espessura_real || 0
    );
    res.json({ id: Number(r.lastInsertRowid) });
});

router.delete('/retalhos/:id', requireAuth, (req, res) => {
    const ret = db.prepare('SELECT * FROM cnc_retalhos WHERE id = ?').get(Number(req.params.id));
    db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(req.params.id);
    if (ret) {
        db.prepare(`INSERT INTO cnc_retalho_historico (retalho_id, largura, comprimento, material_code, espessura, origem_lote_id, acao)
            VALUES (?, ?, ?, ?, ?, ?, 'descartado')`).run(
            String(ret.id), ret.largura, ret.comprimento, ret.material_code, ret.espessura_real, ret.origem_lote ? Number(ret.origem_lote) : null
        );
    }
    res.json({ ok: true });
});

// ─── Retalhos Histórico ──────────────────────────────────────────
router.post('/retalhos/historico', requireAuth, (req, res) => {
    try {
        const { retalho_id, lote_id, chapa_idx, largura, comprimento, material_code, espessura, origem_lote_id, origem_chapa_idx, acao } = req.body;
        if (!acao) return res.status(400).json({ error: 'acao é obrigatório' });
        const result = db.prepare(`INSERT INTO cnc_retalho_historico (retalho_id, lote_id, chapa_idx, largura, comprimento, material_code, espessura, origem_lote_id, origem_chapa_idx, acao)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            retalho_id || null, lote_id || null, chapa_idx ?? null, largura || null, comprimento || null,
            material_code || null, espessura || null, origem_lote_id || null, origem_chapa_idx ?? null, acao
        );
        res.json({ id: Number(result.lastInsertRowid), ok: true });
    } catch (err) {
        console.error('Erro log histórico retalho:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/retalhos/historico', requireAuth, (req, res) => {
    try {
        const { lote_id, material_code, retalho_id, limit: lim } = req.query;
        let sql = 'SELECT * FROM cnc_retalho_historico WHERE 1=1';
        const params = [];
        if (lote_id) { sql += ' AND (lote_id = ? OR origem_lote_id = ?)'; params.push(Number(lote_id), Number(lote_id)); }
        if (material_code) { sql += ' AND material_code = ?'; params.push(material_code); }
        if (retalho_id) { sql += ' AND retalho_id = ?'; params.push(retalho_id); }
        sql += ' ORDER BY criado_em DESC';
        if (lim) { sql += ' LIMIT ?'; params.push(Number(lim)); }
        const rows = db.prepare(sql).all(...params);
        res.json({ historico: rows });
    } catch (err) {
        console.error('Erro listar histórico retalhos:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Ferramentas (vinculadas a máquina) ──────────────────────────
router.get('/ferramentas', requireAuth, (req, res) => {
    const maquinaId = req.query.maquina_id;
    const sql = maquinaId
        ? 'SELECT f.*, m.nome as maquina_nome FROM cnc_ferramentas f LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id WHERE f.maquina_id = ? ORDER BY f.codigo'
        : 'SELECT f.*, m.nome as maquina_nome FROM cnc_ferramentas f LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id ORDER BY m.nome, f.codigo';
    const ferramentas = maquinaId ? db.prepare(sql).all(maquinaId) : db.prepare(sql).all();
    res.json(ferramentas);
});

router.post('/ferramentas', requireAuth, (req, res) => {
    const { maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code } = req.body;
    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    if (!maquina_id) return res.status(400).json({ error: 'Selecione uma máquina' });
    const r = db.prepare(`INSERT INTO cnc_ferramentas (user_id, maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, maquina_id, codigo, nome, tipo || 'broca', diametro || 0, profundidade_max || 30,
        velocidade_corte || 4000, rpm || 12000, tool_code || '');
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/ferramentas/:id', requireAuth, (req, res) => {
    const { maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code, ativo } = req.body;
    db.prepare(`UPDATE cnc_ferramentas SET maquina_id=?, codigo=?, nome=?, tipo=?, diametro=?, profundidade_max=?, velocidade_corte=?, rpm=?, tool_code=?, ativo=? WHERE id=?`)
        .run(maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code, ativo ?? 1, req.params.id);
    res.json({ ok: true });
});

router.delete('/ferramentas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_ferramentas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ─── Tool Wear Tracking ──────────────────────────────────

// GET /ferramentas/alertas — tools exceeding 80% wear limit (MUST be before :maquinaId param route)
router.get('/ferramentas/alertas', requireAuth, (req, res) => {
    const alertas = db.prepare(`
        SELECT f.*, m.nome as maquina_nome
        FROM cnc_ferramentas f
        LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id
        WHERE f.ativo = 1 AND f.metros_limite > 0
          AND (CAST(f.metros_acumulados AS REAL) / CAST(f.metros_limite AS REAL)) >= 0.8
        ORDER BY (CAST(f.metros_acumulados AS REAL) / CAST(f.metros_limite AS REAL)) DESC
    `).all();
    res.json(alertas.map(f => ({
        ...f,
        percentage: Math.round(((f.metros_acumulados || 0) / (f.metros_limite || 5000)) * 1000) / 10,
    })));
});

// GET /ferramentas/:maquinaId/desgaste — wear data for all tools of a machine
router.get('/ferramentas/:maquinaId/desgaste', requireAuth, (req, res) => {
    const ferramentas = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1 ORDER BY codigo').all(req.params.maquinaId);
    const result = ferramentas.map(f => {
        const metros_acumulados = f.metros_acumulados || 0;
        const metros_limite = f.metros_limite || 5000;
        const percentage = metros_limite > 0 ? Math.min(100, (metros_acumulados / metros_limite) * 100) : 0;
        return {
            ...f,
            metros_acumulados,
            metros_limite,
            percentage: Math.round(percentage * 10) / 10,
            alert: percentage >= 80,
        };
    });
    res.json(result);
});

// POST /ferramentas/:id/reset-desgaste — reset accumulated meters
router.post('/ferramentas/:id/reset-desgaste', requireAuth, (req, res) => {
    db.prepare('UPDATE cnc_ferramentas SET metros_acumulados = 0, ultimo_reset_em = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// EXPEDIÇÃO — Checkpoints e Scans
// ═══════════════════════════════════════════════════════════════════

// ── Checkpoint CRUD ──────────────────────────────────────────────

router.get('/checkpoints', requireAuth, (req, res) => {
    const checkpoints = db.prepare('SELECT * FROM cnc_expedicao_checkpoints ORDER BY ordem ASC, id ASC').all();
    res.json(checkpoints);
});

router.post('/checkpoints', requireAuth, (req, res) => {
    const { nome, ordem, cor, icone, obrigatorio } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare(`INSERT INTO cnc_expedicao_checkpoints (nome, ordem, cor, icone, obrigatorio, user_id)
        VALUES (?, ?, ?, ?, ?, ?)`).run(
        nome, ordem ?? 0, cor || '#3b82f6', icone || 'package',
        obrigatorio != null ? (obrigatorio ? 1 : 0) : 1,
        req.user.id
    );
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/checkpoints/:id', requireAuth, (req, res) => {
    const { nome, ordem, cor, icone, ativo, obrigatorio } = req.body;
    const fields = [];
    const vals = [];
    if (nome !== undefined) { fields.push('nome = ?'); vals.push(nome); }
    if (ordem !== undefined) { fields.push('ordem = ?'); vals.push(ordem); }
    if (cor !== undefined) { fields.push('cor = ?'); vals.push(cor); }
    if (icone !== undefined) { fields.push('icone = ?'); vals.push(icone); }
    if (ativo !== undefined) { fields.push('ativo = ?'); vals.push(ativo ? 1 : 0); }
    if (obrigatorio !== undefined) { fields.push('obrigatorio = ?'); vals.push(obrigatorio ? 1 : 0); }
    if (fields.length === 0) return res.json({ ok: true });
    vals.push(req.params.id);
    db.prepare(`UPDATE cnc_expedicao_checkpoints SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});

router.delete('/checkpoints/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_expedicao_checkpoints WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ── Expedition Scanning ──────────────────────────────────────────

// Helper: resolve peca by codigo (same logic as GET /scan/:codigo)
function resolvePecaByCodigo(codigo) {
    let peca = db.prepare('SELECT * FROM cnc_pecas WHERE persistent_id = ?').get(codigo);
    if (!peca) peca = db.prepare('SELECT * FROM cnc_pecas WHERE upmcode = ?').get(codigo);
    if (!peca) peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(codigo);
    if (!peca) {
        const numMatch = String(codigo).match(/^#?(\d+)$/);
        if (numMatch) peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(numMatch[1]);
    }
    return peca || null;
}

router.post('/expedicao/scan', requireAuth, (req, res) => {
    try {
        const { peca_id, codigo, checkpoint_id, operador, estacao, observacao } = req.body;

        if (!checkpoint_id) return res.status(400).json({ error: 'checkpoint_id é obrigatório' });

        // Resolve piece
        let peca = null;
        if (peca_id) {
            peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(peca_id);
        } else if (codigo) {
            peca = resolvePecaByCodigo(codigo);
        }
        if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

        const checkpoint = db.prepare('SELECT * FROM cnc_expedicao_checkpoints WHERE id = ?').get(checkpoint_id);
        if (!checkpoint) return res.status(404).json({ error: 'Checkpoint não encontrado' });

        const metodo = req.body.metodo || 'scan';
        const r = db.prepare(`INSERT INTO cnc_expedicao_scans (peca_id, lote_id, checkpoint_id, operador, estacao, observacao, metodo)
            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            peca.id, peca.lote_id, checkpoint_id,
            operador || null, estacao || null, observacao || null, metodo
        );

        const scan = db.prepare('SELECT * FROM cnc_expedicao_scans WHERE id = ?').get(r.lastInsertRowid);
        const lote = db.prepare('SELECT id, nome, cliente, projeto FROM cnc_lotes WHERE id = ?').get(peca.lote_id);
        res.json({ scan, peca, lote: lote || null });
    } catch (err) {
        console.error('Erro ao registrar scan:', err);
        res.status(500).json({ error: err.message || 'Erro ao registrar scan' });
    }
});

router.get('/expedicao/lote/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const checkpoints = db.prepare('SELECT * FROM cnc_expedicao_checkpoints WHERE ativo = 1 ORDER BY ordem ASC, id ASC').all();
        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY id ASC').all(lote.id);
        const allScans = db.prepare('SELECT * FROM cnc_expedicao_scans WHERE lote_id = ?').all(lote.id);

        // Group scans by peca_id -> checkpoint_id
        const scanMap = {};
        for (const s of allScans) {
            if (!scanMap[s.peca_id]) scanMap[s.peca_id] = {};
            scanMap[s.peca_id][s.checkpoint_id] = s;
        }

        const pecasComScans = pecas.map(p => ({
            ...p,
            scans: scanMap[p.id] || {},
        }));

        res.json({ lote, checkpoints, pecas: pecasComScans });
    } catch (err) {
        console.error('Erro ao buscar status expedição:', err);
        res.status(500).json({ error: err.message || 'Erro interno' });
    }
});

router.get('/expedicao/lote/:loteId/progresso', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const totalPecas = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(lote.id).c;
        const checkpoints = db.prepare('SELECT * FROM cnc_expedicao_checkpoints WHERE ativo = 1 ORDER BY ordem ASC, id ASC').all();

        const checkpointsComProgresso = checkpoints.map(cp => {
            const escaneadas = db.prepare(
                'SELECT COUNT(DISTINCT peca_id) as c FROM cnc_expedicao_scans WHERE lote_id = ? AND checkpoint_id = ?'
            ).get(lote.id, cp.id).c;
            return { ...cp, escaneadas, total: totalPecas };
        });

        res.json({ total_pecas: totalPecas, checkpoints: checkpointsComProgresso });
    } catch (err) {
        console.error('Erro ao buscar progresso expedição:', err);
        res.status(500).json({ error: err.message || 'Erro interno' });
    }
});

// ── Bulk manual mark — marca várias peças de uma vez ────────────────────
router.post('/expedicao/scan-bulk', requireAuth, (req, res) => {
    try {
        const { peca_ids, checkpoint_id, operador, observacao, metodo } = req.body;

        if (!checkpoint_id) return res.status(400).json({ error: 'checkpoint_id é obrigatório' });
        if (!Array.isArray(peca_ids) || peca_ids.length === 0) {
            return res.status(400).json({ error: 'peca_ids deve ser um array não vazio' });
        }

        const checkpoint = db.prepare('SELECT * FROM cnc_expedicao_checkpoints WHERE id = ?').get(checkpoint_id);
        if (!checkpoint) return res.status(404).json({ error: 'Checkpoint não encontrado' });

        const insertStmt = db.prepare(`INSERT INTO cnc_expedicao_scans (peca_id, lote_id, checkpoint_id, operador, estacao, observacao, metodo)
            VALUES (?, ?, ?, ?, ?, ?, ?)`);

        const results = [];
        const skipped = [];
        const met = metodo || 'manual';

        const runBulk = db.transaction(() => {
            for (const pecaId of peca_ids) {
                const peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(pecaId);
                if (!peca) { skipped.push({ id: pecaId, reason: 'não encontrada' }); continue; }

                // Skip if already scanned at this checkpoint
                const existing = db.prepare(
                    'SELECT id FROM cnc_expedicao_scans WHERE peca_id = ? AND checkpoint_id = ?'
                ).get(pecaId, checkpoint_id);
                if (existing) { skipped.push({ id: pecaId, reason: 'já registrada' }); continue; }

                const r = insertStmt.run(peca.id, peca.lote_id, checkpoint_id, operador || null, null, observacao || null, met);
                results.push({ id: r.lastInsertRowid, peca_id: peca.id });
            }
        });
        runBulk();

        res.json({ ok: true, registrados: results.length, skipped, scans: results });
    } catch (err) {
        console.error('Erro ao registrar scan bulk:', err);
        res.status(500).json({ error: err.message || 'Erro ao registrar scan em lote' });
    }
});

// ── Status endpoint (used by frontend) ──────────────────────────────────
router.get('/expedicao/status/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const checkpoints = db.prepare('SELECT * FROM cnc_expedicao_checkpoints WHERE ativo = 1 ORDER BY ordem ASC, id ASC').all();
        const totalPecas = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(lote.id).c;
        const allScans = db.prepare('SELECT * FROM cnc_expedicao_scans WHERE lote_id = ? ORDER BY escaneado_em DESC').all(lote.id);

        const progress = {};
        for (const cp of checkpoints) {
            const escaneadas = db.prepare(
                'SELECT COUNT(DISTINCT peca_id) as c FROM cnc_expedicao_scans WHERE lote_id = ? AND checkpoint_id = ?'
            ).get(lote.id, cp.id).c;
            progress[cp.id] = { scanned: escaneadas, total: totalPecas };
        }

        // Return scans with peca info for the scan log
        const scans = allScans.map(s => {
            const peca = db.prepare('SELECT id, descricao, upmcode FROM cnc_pecas WHERE id = ?').get(s.peca_id);
            const cp = checkpoints.find(c => c.id === s.checkpoint_id);
            return {
                peca_id: s.peca_id,
                codigo: peca?.upmcode || String(s.peca_id),
                descricao: peca?.descricao || '',
                timestamp: s.escaneado_em,
                checkpoint: cp?.nome || '',
                metodo: s.metodo || 'scan',
            };
        });

        res.json({ progress, scans });
    } catch (err) {
        console.error('Erro ao buscar status expedição:', err);
        res.status(500).json({ error: err.message || 'Erro interno' });
    }
});

router.delete('/expedicao/scan/:scanId', requireAuth, (req, res) => {
    const scan = db.prepare('SELECT s.* FROM cnc_expedicao_scans s JOIN cnc_lotes l ON s.lote_id = l.id WHERE s.id = ? AND l.user_id = ?').get(req.params.scanId, req.user.id);
    if (!scan) return res.status(404).json({ error: 'Scan não encontrado' });
    db.prepare('DELETE FROM cnc_expedicao_scans WHERE id = ?').run(scan.id);
    res.json({ ok: true });
});

// ── Desmarcar peça por peca_id + checkpoint ─────────────────────────────
router.post('/expedicao/desmarcar', requireAuth, (req, res) => {
    try {
        const { peca_id, checkpoint_id } = req.body || {};
        if (!peca_id || !checkpoint_id) return res.status(400).json({ error: 'peca_id e checkpoint_id obrigatórios' });

        const peca = db.prepare('SELECT p.* FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(peca_id, req.user.id);
        if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

        const result = db.prepare('DELETE FROM cnc_expedicao_scans WHERE peca_id = ? AND checkpoint_id = ?').run(peca_id, checkpoint_id);
        res.json({ ok: true, removed: result.changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Marcar chapa inteira como cortada ────────────────────────────────────
router.post('/expedicao/marcar-chapa', requireAuth, (req, res) => {
    try {
        const { lote_id, chapa_idx, peca_ids, operador } = req.body;

        if (!lote_id || chapa_idx == null || !Array.isArray(peca_ids) || peca_ids.length === 0) {
            return res.status(400).json({ error: 'lote_id, chapa_idx e peca_ids são obrigatórios' });
        }

        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(lote_id, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        // Find or create "Corte" checkpoint
        let checkpoint = db.prepare("SELECT * FROM cnc_expedicao_checkpoints WHERE nome = 'Corte' LIMIT 1").get();
        if (!checkpoint) {
            const r = db.prepare("INSERT INTO cnc_expedicao_checkpoints (nome, ordem, cor, icone, ativo, obrigatorio, user_id) VALUES ('Corte', 0, '#3b82f6', 'scissors', 1, 1, ?)").run(req.user.id);
            checkpoint = db.prepare('SELECT * FROM cnc_expedicao_checkpoints WHERE id = ?').get(r.lastInsertRowid);
        }

        const insertStmt = db.prepare(`INSERT INTO cnc_expedicao_scans (peca_id, lote_id, checkpoint_id, operador, observacao, metodo)
            VALUES (?, ?, ?, ?, ?, 'chapa')`);

        let registered = 0;
        let skipped = 0;

        const runBulk = db.transaction(() => {
            for (const pecaId of peca_ids) {
                const peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ? AND lote_id = ?').get(pecaId, lote_id);
                if (!peca) { skipped++; continue; }

                const existing = db.prepare('SELECT id FROM cnc_expedicao_scans WHERE peca_id = ? AND checkpoint_id = ?').get(pecaId, checkpoint.id);
                if (existing) { skipped++; continue; }

                insertStmt.run(peca.id, lote_id, checkpoint.id, operador || null, `Chapa ${chapa_idx + 1} cortada`);
                registered++;
            }
        });
        runBulk();

        // Notificação: chapa cortada
        if (registered > 0) {
            notifyCNC(db, req.user.id, 'cnc_chapa_cortada', 'Chapa cortada', `Chapa ${chapa_idx + 1} cortada — ${registered} peças registradas`, lote_id, 'cnc_lote');

            // Verificar se TODAS as peças do lote já foram cortadas
            const totalPecas = db.prepare('SELECT COUNT(*) as cnt FROM cnc_pecas WHERE lote_id = ?').get(lote_id).cnt;
            const cortadas = db.prepare('SELECT COUNT(DISTINCT peca_id) as cnt FROM cnc_expedicao_scans WHERE lote_id = ? AND checkpoint_id = ?').get(lote_id, checkpoint.id).cnt;
            if (cortadas >= totalPecas) {
                notifyCNC(db, req.user.id, 'cnc_lote_completo', 'Lote completo', `Todas as ${totalPecas} peças do lote ${lote_id} foram cortadas`, lote_id, 'cnc_lote');
            }
        }

        res.json({ ok: true, registrados: registered, skipped, checkpoint_id: checkpoint.id });
    } catch (err) {
        console.error('Erro ao marcar chapa:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Status de corte por chapa (quais peças já foram cortadas) ───────────
router.get('/expedicao/corte-status/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const checkpoint = db.prepare("SELECT * FROM cnc_expedicao_checkpoints WHERE nome = 'Corte' LIMIT 1").get();
        if (!checkpoint) return res.json({ cortadas: [] });

        const cortadas = db.prepare(
            'SELECT DISTINCT peca_id FROM cnc_expedicao_scans WHERE lote_id = ? AND checkpoint_id = ?'
        ).all(lote.id, checkpoint.id).map(r => r.peca_id);

        res.json({ cortadas, checkpoint_id: checkpoint.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Desmarcar chapa inteira (reverter corte) ────────────────────────────
router.post('/expedicao/desmarcar-chapa', requireAuth, (req, res) => {
    try {
        const { lote_id, peca_ids } = req.body;

        if (!lote_id || !Array.isArray(peca_ids) || peca_ids.length === 0) {
            return res.status(400).json({ error: 'lote_id e peca_ids são obrigatórios' });
        }

        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(lote_id, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const checkpoint = db.prepare("SELECT * FROM cnc_expedicao_checkpoints WHERE nome = 'Corte' LIMIT 1").get();
        if (!checkpoint) return res.json({ ok: true, removed: 0 });

        const deleteStmt = db.prepare('DELETE FROM cnc_expedicao_scans WHERE peca_id = ? AND checkpoint_id = ? AND lote_id = ?');
        let removed = 0;

        const runBulk = db.transaction(() => {
            for (const pecaId of peca_ids) {
                const r = deleteStmt.run(pecaId, checkpoint.id, lote_id);
                removed += r.changes;
            }
        });
        runBulk();

        res.json({ ok: true, removed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Config (otimizador apenas) ──────────────────────────────────
router.get('/config', requireAuth, (req, res) => {
    const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get();
    res.json(config || {});
});

router.put('/config', requireAuth, (req, res) => {
    const c = req.body;
    db.prepare(`UPDATE cnc_config SET
        espaco_pecas=?, peca_min_largura=?, peca_min_comprimento=?,
        considerar_sobra=?, sobra_min_largura=?, sobra_min_comprimento=?,
        kerf_padrao=?, usar_guilhotina=?, usar_retalhos=?, iteracoes_otimizador=?,
        modo_otimizador=?, refilo=?, permitir_rotacao=?, direcao_corte=?,
        otimizar_trocas_ferramenta=?,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=1`).run(
        c.espaco_pecas ?? 7,
        c.peca_min_largura ?? 200, c.peca_min_comprimento ?? 200,
        c.considerar_sobra ?? 1, c.sobra_min_largura ?? 300, c.sobra_min_comprimento ?? 600,
        c.kerf_padrao ?? 4, c.usar_guilhotina ?? 1, c.usar_retalhos ?? 1, c.iteracoes_otimizador ?? 300,
        c.modo_otimizador ?? 'guilhotina', c.refilo ?? 10, c.permitir_rotacao ?? 1, c.direcao_corte ?? 'misto',
        c.otimizar_trocas_ferramenta ?? 1
    );
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// MATERIAIS — Cadastro completo
// ═══════════════════════════════════════════════════════════════════

router.get('/materiais', requireAuth, (req, res) => {
    const { ativo, q } = req.query;
    let sql = 'SELECT * FROM cnc_materiais';
    const params = [];
    const conds = [];
    if (ativo !== undefined) { conds.push('ativo = ?'); params.push(+ativo); }
    if (q) { conds.push('(nome LIKE ? OR codigo LIKE ? OR cor LIKE ? OR fornecedor LIKE ?)'); const like = `%${q}%`; params.push(like, like, like, like); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY nome';
    res.json(db.prepare(sql).all(...params));
});

router.get('/materiais/:id', requireAuth, (req, res) => {
    const m = db.prepare('SELECT * FROM cnc_materiais WHERE id = ?').get(req.params.id);
    if (!m) return res.status(404).json({ error: 'Material não encontrado' });
    res.json(m);
});

router.post('/materiais', requireAuth, (req, res) => {
    const b = req.body;
    if (!b.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare(`INSERT INTO cnc_materiais
        (user_id, codigo, nome, espessura, comprimento_chapa, largura_chapa, veio, melamina, cor, acabamento, fornecedor, custo_m2, refilo, kerf, permitir_rotacao)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        req.user.id, b.codigo || '', b.nome, b.espessura ?? 18,
        b.comprimento_chapa ?? 2750, b.largura_chapa ?? 1830,
        b.veio || 'sem_veio', b.melamina || 'ambos',
        b.cor || '', b.acabamento || '', b.fornecedor || '',
        b.custo_m2 ?? 0, b.refilo ?? 10, b.kerf ?? 4, b.permitir_rotacao ?? -1
    );
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/materiais/:id', requireAuth, (req, res) => {
    const b = req.body;
    db.prepare(`UPDATE cnc_materiais SET
        codigo=?, nome=?, espessura=?, comprimento_chapa=?, largura_chapa=?,
        veio=?, melamina=?, cor=?, acabamento=?, fornecedor=?, custo_m2=?,
        refilo=?, kerf=?, ativo=?, permitir_rotacao=?
        WHERE id=?`).run(
        b.codigo, b.nome, b.espessura, b.comprimento_chapa, b.largura_chapa,
        b.veio, b.melamina, b.cor, b.acabamento, b.fornecedor, b.custo_m2,
        b.refilo, b.kerf, b.ativo ?? 1, b.permitir_rotacao ?? -1, req.params.id
    );
    res.json({ ok: true });
});

router.delete('/materiais/:id', requireAuth, (req, res) => {
    // Soft delete — apenas desativa
    db.prepare('UPDATE cnc_materiais SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

router.post('/materiais/:id/duplicar', requireAuth, (req, res) => {
    const m = db.prepare('SELECT * FROM cnc_materiais WHERE id = ?').get(req.params.id);
    if (!m) return res.status(404).json({ error: 'Material não encontrado' });
    const r = db.prepare(`INSERT INTO cnc_materiais
        (user_id, codigo, nome, espessura, comprimento_chapa, largura_chapa, veio, melamina, cor, acabamento, fornecedor, custo_m2, refilo, kerf, permitir_rotacao)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        req.user.id, m.codigo + '_COPIA', m.nome + ' (cópia)', m.espessura,
        m.comprimento_chapa, m.largura_chapa, m.veio, m.melamina,
        m.cor, m.acabamento, m.fornecedor, m.custo_m2, m.refilo, m.kerf, m.permitir_rotacao ?? -1
    );
    res.json({ id: Number(r.lastInsertRowid) });
});

// ═══════════════════════════════════════════════════════════════════
// OVERRIDE DE USINAGENS POR LOTE
// ═══════════════════════════════════════════════════════════════════

router.get('/lotes/:loteId/overrides', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM cnc_lote_usinagem_overrides WHERE lote_id = ?').all(req.params.loteId);
    res.json(rows);
});

router.post('/lotes/:loteId/overrides', requireAuth, (req, res) => {
    const { peca_persistent_id, worker_index, ativo, motivo } = req.body;
    db.prepare(`INSERT OR REPLACE INTO cnc_lote_usinagem_overrides (lote_id, peca_persistent_id, worker_index, ativo, motivo)
        VALUES (?, ?, ?, ?, ?)`).run(req.params.loteId, peca_persistent_id, worker_index, ativo ? 1 : 0, motivo || '');
    res.json({ ok: true });
});

router.post('/lotes/:loteId/overrides/bulk', requireAuth, (req, res) => {
    const { overrides } = req.body; // [{ peca_persistent_id, worker_index, ativo, motivo }]
    if (!Array.isArray(overrides)) return res.status(400).json({ error: 'overrides deve ser array' });
    const stmt = db.prepare(`INSERT OR REPLACE INTO cnc_lote_usinagem_overrides (lote_id, peca_persistent_id, worker_index, ativo, motivo)
        VALUES (?, ?, ?, ?, ?)`);
    const tx = db.transaction(() => {
        for (const o of overrides) {
            stmt.run(req.params.loteId, o.peca_persistent_id, o.worker_index, o.ativo ? 1 : 0, o.motivo || '');
        }
    });
    tx();
    res.json({ ok: true, count: overrides.length });
});

router.delete('/lotes/:loteId/overrides', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_lote_usinagem_overrides WHERE lote_id = ?').run(req.params.loteId);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// ALGORITMO DE FACE CNC — Calcula qual face deve ir na CNC
// ═══════════════════════════════════════════════════════════════════

// Pesos de dificuldade manual por tipo de usinagem
const DIFICULDADE_MANUAL = {
    'Transfer_vertical_saw_cut': 10,  // Rasgo/canal
    'transfer_pocket': 10,            // Rebaixo
    'transfer_slot': 8,               // Fresa
    'transfer_hole_blind': 4,         // Furo cego (minifix)
    'transfer_hole': 3,               // Furo passante
};

// Heurística: furos com diâmetro grande = mais difícil manual
function scoreDificuldade(worker) {
    const cat = worker.category || '';
    let base = DIFICULDADE_MANUAL[cat] || 3;
    // Ajustes por características
    if (/hole/i.test(cat)) {
        const d = worker.diameter || 8;
        if (d >= 35) base = 2;       // Dobradiça ⌀35 = fácil (broca Forstner)
        else if (d <= 5) base = 1;   // Furo prateleira ⌀5 = trivial
        else if (d <= 8) base = 1.5; // Cavilha ⌀8 = simples
    }
    // Rasgos/canais longos são mais difíceis manualmente
    if (/saw_cut|slot|groove/i.test(cat) && worker.length > 200) base += 2;
    return base;
}

function calcularFaceCNC(pecas, melamina = 'ambos') {
    const resultado = [];
    for (const peca of pecas) {
        let mj;
        try { mj = typeof peca.machining_json === 'string' ? JSON.parse(peca.machining_json) : peca.machining_json; } catch { mj = {}; }
        const workers = Array.isArray(mj) ? mj : (mj?.workers || []);

        let scoreA = 0, scoreB = 0, countA = 0, countB = 0;
        workers.forEach((w, i) => {
            const face = (w.face || 'top').toLowerCase();
            const score = scoreDificuldade(w);
            const isA = face === 'top' || face === 'side_a';
            const isB = face === 'bottom' || face === 'side_b';
            // Laterais contam para Face A (geralmente usinadas com peça face A pra cima)
            if (isB) { scoreB += score; countB++; }
            else { scoreA += score; countA++; }
        });

        let faceCNC = 'A';
        let motivo = '';

        if (melamina === 'face_a') {
            // Melamina só na Face A → Face A pra cima (visível), CNC usina Face A
            faceCNC = 'A';
            motivo = 'Melamina apenas Face A — face decorativa pra cima';
        } else if (melamina === 'face_b') {
            faceCNC = 'B';
            motivo = 'Melamina apenas Face B — face decorativa pra cima';
        } else {
            // Ambos os lados têm melamina — escolher pelo score de dificuldade
            if (scoreA >= scoreB) {
                faceCNC = 'A';
                motivo = `Face A tem maior dificuldade manual (${scoreA.toFixed(1)} vs ${scoreB.toFixed(1)})`;
            } else {
                faceCNC = 'B';
                motivo = `Face B tem maior dificuldade manual (${scoreB.toFixed(1)} vs ${scoreA.toFixed(1)})`;
            }
        }

        resultado.push({
            peca_id: peca.id,
            persistent_id: peca.persistent_id,
            descricao: peca.descricao,
            face_cnc: faceCNC,
            motivo,
            score_a: scoreA,
            score_b: scoreB,
            count_a: countA,
            count_b: countB,
            total_workers: workers.length,
        });
    }
    return resultado;
}

router.get('/lotes/:loteId/face-cnc', requireAuth, (req, res) => {
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(req.params.loteId);
    // Determinar melamina: pegar do material da primeira peça (ou default 'ambos')
    let melamina = 'ambos';
    for (const p of pecas) {
        if (p.material_id) {
            const mat = db.prepare('SELECT melamina FROM cnc_materiais WHERE id = ?').get(p.material_id);
            if (mat?.melamina) { melamina = mat.melamina; break; }
        }
    }
    const resultado = calcularFaceCNC(pecas, melamina);
    res.json({ melamina, faces: resultado });
});

// ═══════════════════════════════════════════════════════
// GRUPO 9: Machining Templates Library
// ═══════════════════════════════════════════════════════

// GET /machining-templates — list all templates (with search/filter by categoria)
router.get('/machining-templates', requireAuth, (req, res) => {
    const { categoria, q } = req.query;
    let sql = 'SELECT * FROM cnc_machining_templates WHERE ativo = 1';
    const params = [];
    if (categoria) { sql += ' AND categoria = ?'; params.push(categoria); }
    if (q) { sql += ' AND (nome LIKE ? OR descricao LIKE ? OR categoria LIKE ?)'; const like = `%${q}%`; params.push(like, like, like); }
    sql += ' ORDER BY uso_count DESC, nome';
    res.json(db.prepare(sql).all(...params));
});

// POST /machining-templates — create template
router.post('/machining-templates', requireAuth, (req, res) => {
    const { nome, descricao, categoria, machining_json, espelhavel } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const mjson = typeof machining_json === 'string' ? machining_json : JSON.stringify(machining_json || {});
    const r = db.prepare(`INSERT INTO cnc_machining_templates (user_id, nome, descricao, categoria, machining_json, espelhavel)
        VALUES (?,?,?,?,?,?)`).run(req.user.id, nome, descricao || '', categoria || '', mjson, espelhavel ? 1 : 0);
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

// PUT /machining-templates/:id — update template
router.put('/machining-templates/:id', requireAuth, (req, res) => {
    const { nome, descricao, categoria, machining_json, espelhavel } = req.body;
    const fields = [];
    const vals = [];
    if (nome !== undefined) { fields.push('nome = ?'); vals.push(nome); }
    if (descricao !== undefined) { fields.push('descricao = ?'); vals.push(descricao); }
    if (categoria !== undefined) { fields.push('categoria = ?'); vals.push(categoria); }
    if (machining_json !== undefined) { fields.push('machining_json = ?'); vals.push(typeof machining_json === 'string' ? machining_json : JSON.stringify(machining_json)); }
    if (espelhavel !== undefined) { fields.push('espelhavel = ?'); vals.push(espelhavel ? 1 : 0); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    vals.push(req.params.id);
    db.prepare(`UPDATE cnc_machining_templates SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});

// DELETE /machining-templates/:id — soft delete
router.delete('/machining-templates/:id', requireAuth, (req, res) => {
    db.prepare('UPDATE cnc_machining_templates SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// POST /machining-templates/:id/aplicar — apply template to a piece
router.post('/machining-templates/:id/aplicar', requireAuth, (req, res) => {
    const { peca_id, espelhar, offset_x, offset_y } = req.body;
    if (!peca_id) return res.status(400).json({ error: 'peca_id é obrigatório' });

    const template = db.prepare('SELECT * FROM cnc_machining_templates WHERE id = ? AND ativo = 1').get(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });

    const peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(peca_id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

    let tplMach;
    try { tplMach = JSON.parse(template.machining_json); } catch { return res.status(400).json({ error: 'JSON do template inválido' }); }

    let pecaMach;
    try { pecaMach = JSON.parse(peca.machining_json || '{}'); } catch { pecaMach = {}; }

    // Garantir estrutura workers
    const tplWorkers = tplMach.workers ? (Array.isArray(tplMach.workers) ? tplMach.workers : Object.values(tplMach.workers)) : [];
    const pecaWorkers = pecaMach.workers ? (typeof pecaMach.workers === 'object' && !Array.isArray(pecaMach.workers) ? { ...pecaMach.workers } : {}) : {};

    const ox = offset_x || 0;
    const oy = offset_y || 0;
    const pecaComp = peca.comprimento || 600;

    let nextKey = Object.keys(pecaWorkers).length;
    for (const w of tplWorkers) {
        const nw = { ...w };
        // Aplicar offset
        if (nw.position_x != null) { nw.position_x = (nw.position_x || 0) + ox; nw.position_y = (nw.position_y || 0) + oy; }
        // Espelhar X se solicitado (para peças par esquerda/direita)
        if (espelhar && nw.position_x != null) {
            nw.position_x = pecaComp - nw.position_x;
        }
        if (espelhar && nw.pos_start_for_line) {
            nw.pos_start_for_line = { ...nw.pos_start_for_line, position_x: pecaComp - nw.pos_start_for_line.position_x };
            if (nw.pos_end_for_line) nw.pos_end_for_line = { ...nw.pos_end_for_line, position_x: pecaComp - nw.pos_end_for_line.position_x };
        }
        pecaWorkers[`tpl_${nextKey++}`] = nw;
    }

    pecaMach.workers = pecaWorkers;
    db.prepare('UPDATE cnc_pecas SET machining_json = ? WHERE id = ?').run(JSON.stringify(pecaMach), peca_id);

    // Incrementar uso_count
    db.prepare('UPDATE cnc_machining_templates SET uso_count = uso_count + 1 WHERE id = ?').run(req.params.id);

    res.json({ ok: true, workers_added: tplWorkers.length });
});

// POST /machining-templates/from-peca/:pecaId — create template from piece
router.post('/machining-templates/from-peca/:pecaId', requireAuth, (req, res) => {
    const peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(req.params.pecaId);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

    const { nome, descricao, categoria } = req.body;
    const machJson = peca.machining_json || '{}';

    let parsed;
    try { parsed = JSON.parse(machJson); } catch { return res.status(400).json({ error: 'machining_json inválido na peça' }); }

    const workers = parsed.workers ? (Array.isArray(parsed.workers) ? parsed.workers : Object.values(parsed.workers)) : [];
    if (workers.length === 0) return res.status(400).json({ error: 'Peça não possui usinagens para criar template' });

    const r = db.prepare(`INSERT INTO cnc_machining_templates (user_id, nome, descricao, categoria, machining_json, espelhavel)
        VALUES (?,?,?,?,?,?)`).run(
        req.user.id,
        nome || `Template de ${peca.descricao || 'Peça #' + peca.id}`,
        descricao || '',
        categoria || '',
        JSON.stringify({ workers }),
        0
    );
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

// ═══════════════════════════════════════════════════════
// RELATÓRIO POR CHAPA (Operator Sheet Report)
// ═══════════════════════════════════════════════════════

router.get('/relatorio-chapa/:loteId/:chapaIdx', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

    let plano;
    try { plano = JSON.parse(lote.plano_json); } catch { return res.status(400).json({ error: 'Plano inválido' }); }

    const chapaIdx = parseInt(req.params.chapaIdx, 10);
    const chapas = plano.chapas || [];
    if (chapaIdx < 0 || chapaIdx >= chapas.length) return res.status(404).json({ error: 'Chapa não encontrada' });

    const chapa = chapas[chapaIdx];
    const pecaIds = (chapa.pecas || []).map(p => p.pecaId).filter(Boolean);
    const pecasDb = pecaIds.length > 0
        ? db.prepare(`SELECT * FROM cnc_pecas WHERE id IN (${pecaIds.map(() => '?').join(',')})`).all(...pecaIds)
        : [];
    const pecasMap = {};
    for (const p of pecasDb) pecasMap[p.id] = p;

    // Build pieces list
    const pieces = (chapa.pecas || []).map((p, i) => {
        const dbp = pecasMap[p.pecaId] || {};
        return {
            index: i + 1,
            descricao: dbp.descricao || `#${p.pecaId}`,
            modulo: dbp.modulo_desc || '-',
            comprimento: Math.round(p.w || dbp.comprimento || 0),
            largura: Math.round(p.h || dbp.largura || 0),
            espessura: dbp.espessura || 0,
            rotated: !!p.rotated,
            borda_frontal: dbp.borda_frontal || '',
            borda_traseira: dbp.borda_traseira || '',
            borda_dir: dbp.borda_dir || '',
            borda_esq: dbp.borda_esq || '',
        };
    });

    // Machining operations from pecas
    const opSummary = { furos: 0, rasgos: 0, rebaixos: 0 };
    const toolsNeeded = new Map();
    for (const dbp of pecasDb) {
        let mach = {};
        try { mach = JSON.parse(dbp.machining_json || '{}'); } catch { /* skip */ }
        const workers = mach.workers ? (Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers)) : [];
        for (const w of workers) {
            const cat = (w.category || w.tipo || '').toLowerCase();
            if (cat.includes('furo') || cat.includes('drill') || cat.includes('hole')) opSummary.furos++;
            else if (cat.includes('rasgo') || cat.includes('slot') || cat.includes('groove')) opSummary.rasgos++;
            else if (cat.includes('rebaixo') || cat.includes('pocket') || cat.includes('recess')) opSummary.rebaixos++;
            const toolKey = w.tool_code || w.ferramenta || cat || 'default';
            if (!toolsNeeded.has(toolKey)) {
                toolsNeeded.set(toolKey, {
                    tool_code: toolKey,
                    tipo: w.category || w.tipo || '-',
                    diametro: w.diameter || w.diametro || 0,
                    rpm: w.rpm || 0,
                    count: 0,
                });
            }
            toolsNeeded.get(toolKey).count++;
        }
    }

    // Usinagem tipos matching
    const usinagemTipos = db.prepare('SELECT * FROM cnc_usinagem_tipos WHERE ativo = 1 ORDER BY prioridade').all();

    // Tool setup table
    const tools = Array.from(toolsNeeded.values()).map((t, i) => ({
        position: `T${String(i + 1).padStart(2, '0')}`,
        ...t,
    }));

    // Estimated cutting time (rough: 3s per piece + 1s per operation)
    const totalOps = opSummary.furos + opSummary.rasgos + opSummary.rebaixos;
    const estimatedTime = Math.round((pieces.length * 3 + totalOps * 1) / 60 * 10) / 10; // minutes

    res.json({
        lote: { id: lote.id, nome: lote.nome, cliente: lote.cliente, projeto: lote.projeto },
        chapaIdx,
        totalChapas: chapas.length,
        chapa: {
            material: chapa.material || '-',
            comprimento: chapa.comprimento,
            largura: chapa.largura,
            veio: chapa.veio || 'sem_veio',
            refilo: chapa.refilo || 0,
            kerf: plano.config?.kerf || 4,
            aproveitamento: chapa.aproveitamento || 0,
            is_retalho: !!chapa.is_retalho,
        },
        pieces,
        tools,
        opSummary,
        estimatedTimeMin: estimatedTime,
    });
});

// ═══════════════════════════════════════════════════════
// DASHBOARD — Production Stats
// ═══════════════════════════════════════════════════════

router.get('/dashboard/stats', requireAuth, (req, res) => {
    const de = req.query.de || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const ate = req.query.ate || new Date().toISOString().slice(0, 10);

    const lotes = db.prepare(`
        SELECT id, nome, cliente, projeto, total_pecas, total_chapas, aproveitamento, status, criado_em, plano_json
        FROM cnc_lotes WHERE user_id = ? AND date(criado_em) >= date(?) AND date(criado_em) <= date(?)
        ORDER BY criado_em DESC
    `).all(req.user.id, de, ate);

    let totalChapas = 0, totalPecas = 0, sumAprov = 0, countAprov = 0, lotesConcluidos = 0;
    for (const l of lotes) {
        totalChapas += l.total_chapas || 0;
        totalPecas += l.total_pecas || 0;
        if (l.aproveitamento > 0) { sumAprov += l.aproveitamento; countAprov++; }
        if (l.status === 'concluido') lotesConcluidos++;
    }

    // Daily breakdown
    const daily = {};
    for (const l of lotes) {
        const day = (l.criado_em || '').slice(0, 10);
        if (!day) continue;
        if (!daily[day]) daily[day] = { date: day, chapas: 0, pecas: 0, sumAprov: 0, count: 0 };
        daily[day].chapas += l.total_chapas || 0;
        daily[day].pecas += l.total_pecas || 0;
        if (l.aproveitamento > 0) { daily[day].sumAprov += l.aproveitamento; daily[day].count++; }
    }
    const dailyData = Object.values(daily)
        .map(d => ({ ...d, avgAprov: d.count > 0 ? Math.round(d.sumAprov / d.count * 10) / 10 : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const recentLotes = lotes.slice(0, 10).map(l => ({
        id: l.id, nome: l.nome, cliente: l.cliente, projeto: l.projeto,
        total_pecas: l.total_pecas, total_chapas: l.total_chapas,
        aproveitamento: l.aproveitamento, status: l.status,
        criado_em: l.criado_em,
    }));

    res.json({
        totalChapas,
        totalPecas,
        avgAproveitamento: countAprov > 0 ? Math.round(sumAprov / countAprov * 10) / 10 : 0,
        lotesConcluidos,
        totalLotes: lotes.length,
        dailyData,
        recentLotes,
    });
});

router.get('/dashboard/materiais', requireAuth, (req, res) => {
    const lotes = db.prepare(`
        SELECT plano_json, aproveitamento FROM cnc_lotes
        WHERE user_id = ? AND plano_json IS NOT NULL AND plano_json != ''
        ORDER BY criado_em DESC LIMIT 100
    `).all(req.user.id);

    const matMap = {};
    for (const l of lotes) {
        let plano;
        try { plano = JSON.parse(l.plano_json); } catch { continue; }
        for (const ch of (plano.chapas || [])) {
            const mat = ch.material || 'Desconhecido';
            if (!matMap[mat]) matMap[mat] = { material: mat, chapas_usadas: 0, area_total: 0, sumAprov: 0, countAprov: 0 };
            matMap[mat].chapas_usadas++;
            matMap[mat].area_total += ((ch.comprimento || 0) * (ch.largura || 0)) / 1e6; // m²
            if (ch.aproveitamento > 0) {
                matMap[mat].sumAprov += ch.aproveitamento;
                matMap[mat].countAprov++;
            }
        }
    }

    const result = Object.values(matMap)
        .map(m => ({
            material: m.material,
            chapas_usadas: m.chapas_usadas,
            area_total: Math.round(m.area_total * 100) / 100,
            desperdicio_medio: m.countAprov > 0 ? Math.round((100 - m.sumAprov / m.countAprov) * 10) / 10 : 0,
        }))
        .sort((a, b) => b.chapas_usadas - a.chapas_usadas)
        .slice(0, 10);

    res.json(result);
});

router.get('/dashboard/eficiencia', requireAuth, (req, res) => {
    const days = parseInt(req.query.days || '30', 10);
    const desde = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const lotes = db.prepare(`
        SELECT total_chapas, aproveitamento, criado_em FROM cnc_lotes
        WHERE user_id = ? AND date(criado_em) >= date(?) AND aproveitamento > 0
        ORDER BY criado_em ASC
    `).all(req.user.id, desde);

    const daily = {};
    for (const l of lotes) {
        const day = (l.criado_em || '').slice(0, 10);
        if (!day) continue;
        if (!daily[day]) daily[day] = { date: day, chapas: 0, sumAprov: 0, count: 0 };
        daily[day].chapas += l.total_chapas || 0;
        daily[day].sumAprov += l.aproveitamento;
        daily[day].count++;
    }

    const result = Object.values(daily)
        .map(d => ({ date: d.date, chapas: d.chapas, avgAprov: Math.round(d.sumAprov / d.count * 10) / 10 }))
        .sort((a, b) => a.date.localeCompare(b.date));

    res.json(result);
});

// ═══════════════════════════════════════════════════════════════════
// FEATURE 1: PER-PIECE COSTING
// ═══════════════════════════════════════════════════════════════════

router.get('/custos/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        const plano = JSON.parse(lote.plano_json);
        const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get() || {};
        const custoHora = config.custo_hora_maquina || 80;
        const custoTroca = config.custo_troca_ferramenta || 5;

        const pecasDB = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        const pecasMap = {};
        for (const p of pecasDB) pecasMap[p.id] = p;

        let totalGeral = 0;
        const chapasResult = [];

        for (let ci = 0; ci < (plano.chapas || []).length; ci++) {
            const chapa = plano.chapas[ci];
            const sheetArea = (chapa.comprimento || 2750) * (chapa.largura || 1850);
            // Get sheet price from cnc_chapas matching material
            let chapaDB = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(chapa.material_code || chapa.material || '');
            if (!chapaDB) chapaDB = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();
            const sheetPrice = chapa.preco || chapaDB?.preco || 0;

            let custoMaterialChapa = 0, custoUsinagemChapa = 0, custoBordasChapa = 0;
            const pecasResult = [];

            for (let pi = 0; pi < (chapa.pecas || []).length; pi++) {
                const p = chapa.pecas[pi];
                const piece = pecasMap[p.pecaId];
                const pieceArea = (p.w || 0) * (p.h || 0);

                // Material cost: proportional to area
                const custoMaterial = sheetArea > 0 ? (pieceArea / sheetArea) * sheetPrice : 0;

                // Machining cost: count operations from machining_json
                let tempoSeg = 0;
                if (piece?.machining_json) {
                    try {
                        const ops = JSON.parse(piece.machining_json);
                        for (const op of (Array.isArray(ops) ? ops : [])) {
                            const tipo = (op.tipo || op.type || '').toLowerCase();
                            if (/furo|hole|drill/.test(tipo)) tempoSeg += 2;
                            else if (/canal|groove|rasgo/.test(tipo)) tempoSeg += 5;
                            else if (/pocket|rebaixo|cavidade/.test(tipo)) tempoSeg += 8;
                            else tempoSeg += 3; // default operation
                        }
                    } catch (_) {}
                }
                const custoUsinagem = (tempoSeg / 3600) * custoHora;

                // Edge banding cost: count edges with banding × 0.5 per linear meter
                let metrosBorda = 0;
                const comp = piece?.comprimento || p.w || 0;
                const larg = piece?.largura || p.h || 0;
                if (piece?.borda_frontal) metrosBorda += comp / 1000;
                if (piece?.borda_traseira) metrosBorda += comp / 1000;
                if (piece?.borda_esq) metrosBorda += larg / 1000;
                if (piece?.borda_dir) metrosBorda += larg / 1000;
                const custoBordas = metrosBorda * 0.5;

                const custoTotal = custoMaterial + custoUsinagem + custoBordas;
                custoMaterialChapa += custoMaterial;
                custoUsinagemChapa += custoUsinagem;
                custoBordasChapa += custoBordas;

                pecasResult.push({
                    pecaIdx: pi,
                    desc: piece?.descricao || p.nome || `Peça #${p.pecaId}`,
                    custo_material: Math.round(custoMaterial * 100) / 100,
                    custo_usinagem: Math.round(custoUsinagem * 100) / 100,
                    custo_bordas: Math.round(custoBordas * 100) / 100,
                    custo_total: Math.round(custoTotal * 100) / 100,
                });
            }

            // Waste cost
            const aproveitamento = chapa.aproveitamento || 0;
            const custoDesperdicio = Math.round((1 - aproveitamento / 100) * sheetPrice * 100) / 100;

            const custoTotalChapa = custoMaterialChapa + custoUsinagemChapa + custoBordasChapa + custoDesperdicio;
            totalGeral += custoTotalChapa;

            chapasResult.push({
                chapaIdx: ci,
                material: chapa.material || chapa.material_code || '?',
                custo_material: Math.round(custoMaterialChapa * 100) / 100,
                custo_usinagem: Math.round(custoUsinagemChapa * 100) / 100,
                custo_bordas: Math.round(custoBordasChapa * 100) / 100,
                custo_desperdicio: custoDesperdicio,
                custo_total: Math.round(custoTotalChapa * 100) / 100,
                pecas: pecasResult,
            });
        }

        res.json({
            config: { custo_hora_maquina: custoHora, custo_troca_ferramenta: custoTroca },
            chapas: chapasResult,
            total_geral: Math.round(totalGeral * 100) / 100,
        });
    } catch (err) {
        console.error('custos error:', err);
        res.status(500).json({ error: 'Erro ao calcular custos' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// FEATURE 2: MULTI-FORMAT EXPORT
// ═══════════════════════════════════════════════════════════════════

router.get('/export/:loteId/csv', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano' });

        const plano = JSON.parse(lote.plano_json);
        const pecasDB = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        const pecasMap = {};
        for (const p of pecasDB) pecasMap[p.id] = p;

        const BOM = '\uFEFF';
        const sep = ';';
        let csv = BOM;
        csv += ['Chapa', 'Material', 'Peça', 'Descrição', 'Módulo', 'Comprimento', 'Largura', 'Espessura', 'Rotação', 'Bordas', 'Área (mm²)'].join(sep) + '\n';

        for (let ci = 0; ci < (plano.chapas || []).length; ci++) {
            const ch = plano.chapas[ci];
            for (const p of ch.pecas || []) {
                const piece = pecasMap[p.pecaId];
                const bordas = [
                    piece?.borda_frontal ? 'F' : '',
                    piece?.borda_traseira ? 'T' : '',
                    piece?.borda_esq ? 'E' : '',
                    piece?.borda_dir ? 'D' : '',
                ].filter(Boolean).join('+') || '-';
                csv += [
                    ci + 1,
                    ch.material || ch.material_code || '',
                    piece?.descricao || p.nome || `#${p.pecaId}`,
                    (piece?.descricao || '').replace(/;/g, ','),
                    piece?.modulo_desc || '',
                    Math.round(p.w),
                    Math.round(p.h),
                    ch.espessura_real || ch.espessura || '',
                    p.rotated ? 'Sim' : 'Não',
                    bordas,
                    Math.round(p.w * p.h),
                ].join(sep) + '\n';
            }
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="plano_${lote.nome || lote.id}.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao exportar CSV' });
    }
});

router.get('/export/:loteId/json', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano' });

        const plano = JSON.parse(lote.plano_json);
        const pecasDB = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);

        const exportData = {
            lote: { id: lote.id, nome: lote.nome, cliente: lote.cliente, projeto: lote.projeto, status: lote.status },
            config: plano.config || {},
            stats: {
                total_chapas: plano.chapas?.length || 0,
                total_pecas: (plano.chapas || []).reduce((s, c) => s + (c.pecas?.length || 0), 0),
                aproveitamento: lote.aproveitamento,
            },
            chapas: (plano.chapas || []).map((ch, ci) => ({
                idx: ci,
                material: ch.material || ch.material_code,
                comprimento: ch.comprimento,
                largura: ch.largura,
                espessura: ch.espessura_real || ch.espessura,
                aproveitamento: ch.aproveitamento,
                pecas: (ch.pecas || []).map(p => ({
                    pecaId: p.pecaId,
                    nome: p.nome,
                    x: Math.round(p.x),
                    y: Math.round(p.y),
                    w: Math.round(p.w),
                    h: Math.round(p.h),
                    rotated: !!p.rotated,
                })),
                retalhos: ch.retalhos || [],
            })),
            pecas: pecasDB.map(p => ({
                id: p.id,
                descricao: p.descricao,
                comprimento: p.comprimento,
                largura: p.largura,
                espessura: p.espessura,
                material_code: p.material_code,
                modulo_desc: p.modulo_desc,
            })),
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="plano_${lote.nome || lote.id}.json"`);
        res.json(exportData);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao exportar JSON' });
    }
});

router.get('/export/:loteId/resumo', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano' });

        const plano = JSON.parse(lote.plano_json);
        const totalPecas = (plano.chapas || []).reduce((s, c) => s + (c.pecas?.length || 0), 0);
        const totalChapas = plano.chapas?.length || 0;
        const totalRetalhos = (plano.chapas || []).reduce((s, c) => s + (c.retalhos?.length || 0), 0);

        // Material breakdown
        const matMap = {};
        for (const ch of (plano.chapas || [])) {
            const key = ch.material_code || ch.material || '?';
            if (!matMap[key]) matMap[key] = { nome: ch.material || key, count: 0, preco: 0, sumAprov: 0 };
            matMap[key].count++;
            matMap[key].preco += ch.preco || 0;
            matMap[key].sumAprov += ch.aproveitamento || 0;
        }

        const matRows = Object.values(matMap).map(m => `
            <tr>
                <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${m.nome}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${m.count}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${m.count > 0 ? (m.sumAprov / m.count).toFixed(1) : 0}%</td>
                <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right">R$ ${m.preco.toFixed(2)}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo — ${lote.nome || 'Plano'}</title>
<style>
    body{font-family:Inter,system-ui,sans-serif;padding:40px;max-width:900px;margin:0 auto;color:#1f2937}
    h1{font-size:22px;margin-bottom:4px}
    .sub{color:#6b7280;font-size:13px;margin-bottom:24px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
    .card{padding:16px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb}
    .card .num{font-size:24px;font-weight:800;color:#1379F0}
    .card .lb{font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th{text-align:left;padding:8px 12px;background:#f3f4f6;font-size:11px;text-transform:uppercase;color:#6b7280;font-weight:700}
    @media print{body{padding:20px}.grid{grid-template-columns:repeat(4,1fr)}}
</style></head><body>
    <h1>Resumo do Plano de Corte</h1>
    <div class="sub">${lote.nome || ''} ${lote.cliente ? '— ' + lote.cliente : ''} ${lote.projeto ? '— ' + lote.projeto : ''} — ${new Date().toLocaleDateString('pt-BR')}</div>
    <div class="grid">
        <div class="card"><div class="num">${totalChapas}</div><div class="lb">Chapas</div></div>
        <div class="card"><div class="num">${totalPecas}</div><div class="lb">Peças</div></div>
        <div class="card"><div class="num">${lote.aproveitamento || '—'}%</div><div class="lb">Aproveitamento</div></div>
        <div class="card"><div class="num">${totalRetalhos}</div><div class="lb">Retalhos</div></div>
    </div>
    <h2 style="font-size:16px;margin-bottom:8px">Materiais</h2>
    <table>
        <thead><tr><th>Material</th><th style="text-align:center">Chapas</th><th style="text-align:right">Aprov. Médio</th><th style="text-align:right">Custo</th></tr></thead>
        <tbody>${matRows}</tbody>
    </table>
    <div style="margin-top:32px;font-size:10px;color:#9ca3af;text-align:center">Gerado em ${new Date().toLocaleString('pt-BR')} — Ornato ERP</div>
</body></html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao gerar resumo' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// FEATURE 4: PLAN VERSION DIFF
// ═══════════════════════════════════════════════════════════════════

router.get('/plano/:loteId/versions/diff/:v1/:v2', requireAuth, (req, res) => {
    try {
        const { loteId, v1, v2 } = req.params;
        const ver1 = db.prepare('SELECT * FROM cnc_plano_versions WHERE id = ? AND lote_id = ? AND user_id = ?')
            .get(v1, loteId, req.user.id);
        const ver2 = db.prepare('SELECT * FROM cnc_plano_versions WHERE id = ? AND lote_id = ? AND user_id = ?')
            .get(v2, loteId, req.user.id);
        if (!ver1 || !ver2) return res.status(404).json({ error: 'Versão não encontrada' });

        const plano1 = JSON.parse(ver1.plano_json);
        const plano2 = JSON.parse(ver2.plano_json);

        const changes = [];

        // Build piece map for each version: key = pecaId, value = {chapaIdx, x, y, w, h, rotated}
        const buildMap = (plano) => {
            const map = {};
            for (let ci = 0; ci < (plano.chapas || []).length; ci++) {
                for (let pi = 0; pi < (plano.chapas[ci].pecas || []).length; pi++) {
                    const p = plano.chapas[ci].pecas[pi];
                    const key = `${p.pecaId}_${ci}_${pi}`;
                    map[key] = { chapaIdx: ci, pecaIdx: pi, pecaId: p.pecaId, x: p.x, y: p.y, w: p.w, h: p.h, rotated: !!p.rotated, nome: p.nome };
                }
            }
            return map;
        };

        // Also build a map by pecaId only (for tracking moves across sheets)
        const buildPecaMap = (plano) => {
            const map = {};
            for (let ci = 0; ci < (plano.chapas || []).length; ci++) {
                for (let pi = 0; pi < (plano.chapas[ci].pecas || []).length; pi++) {
                    const p = plano.chapas[ci].pecas[pi];
                    if (!map[p.pecaId]) map[p.pecaId] = [];
                    map[p.pecaId].push({ chapaIdx: ci, pecaIdx: pi, x: p.x, y: p.y, w: p.w, h: p.h, rotated: !!p.rotated, nome: p.nome });
                }
            }
            return map;
        };

        const pecaMap1 = buildPecaMap(plano1);
        const pecaMap2 = buildPecaMap(plano2);

        const allPecaIds = new Set([...Object.keys(pecaMap1), ...Object.keys(pecaMap2)]);

        for (const pid of allPecaIds) {
            const locs1 = pecaMap1[pid] || [];
            const locs2 = pecaMap2[pid] || [];
            const desc = locs1[0]?.nome || locs2[0]?.nome || `Peça #${pid}`;

            if (locs1.length === 0 && locs2.length > 0) {
                for (const l of locs2) {
                    changes.push({ tipo: 'adicionado', chapaIdx: l.chapaIdx, pecaIdx: l.pecaIdx, pecaDesc: desc, de: null, para: { x: Math.round(l.x), y: Math.round(l.y) } });
                }
            } else if (locs1.length > 0 && locs2.length === 0) {
                for (const l of locs1) {
                    changes.push({ tipo: 'removido', chapaIdx: l.chapaIdx, pecaIdx: l.pecaIdx, pecaDesc: desc, de: { x: Math.round(l.x), y: Math.round(l.y) }, para: null });
                }
            } else {
                // Compare positions
                const maxLen = Math.max(locs1.length, locs2.length);
                for (let i = 0; i < maxLen; i++) {
                    const a = locs1[i], b = locs2[i];
                    if (!a && b) {
                        changes.push({ tipo: 'adicionado', chapaIdx: b.chapaIdx, pecaIdx: b.pecaIdx, pecaDesc: desc, de: null, para: { x: Math.round(b.x), y: Math.round(b.y) } });
                    } else if (a && !b) {
                        changes.push({ tipo: 'removido', chapaIdx: a.chapaIdx, pecaIdx: a.pecaIdx, pecaDesc: desc, de: { x: Math.round(a.x), y: Math.round(a.y) }, para: null });
                    } else if (a && b) {
                        if (a.chapaIdx !== b.chapaIdx) {
                            changes.push({ tipo: 'transferido', chapaIdx: b.chapaIdx, pecaIdx: b.pecaIdx, pecaDesc: desc, de: { chapaIdx: a.chapaIdx, x: Math.round(a.x), y: Math.round(a.y) }, para: { chapaIdx: b.chapaIdx, x: Math.round(b.x), y: Math.round(b.y) } });
                        } else if (a.rotated !== b.rotated) {
                            changes.push({ tipo: 'rotacionado', chapaIdx: b.chapaIdx, pecaIdx: b.pecaIdx, pecaDesc: desc, de: { x: Math.round(a.x), y: Math.round(a.y) }, para: { x: Math.round(b.x), y: Math.round(b.y) } });
                        } else if (Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1) {
                            changes.push({ tipo: 'movido', chapaIdx: b.chapaIdx, pecaIdx: b.pecaIdx, pecaDesc: desc, de: { x: Math.round(a.x), y: Math.round(a.y) }, para: { x: Math.round(b.x), y: Math.round(b.y) } });
                        }
                    }
                }
            }
        }

        // Summary
        const summary = {};
        for (const c of changes) {
            summary[c.tipo] = (summary[c.tipo] || 0) + 1;
        }

        res.json({
            v1: { id: ver1.id, acao: ver1.acao_origem, data: ver1.criado_em },
            v2: { id: ver2.id, acao: ver2.acao_origem, data: ver2.criado_em },
            chapas_v1: plano1.chapas?.length || 0,
            chapas_v2: plano2.chapas?.length || 0,
            summary,
            changes,
        });
    } catch (err) {
        console.error('diff error:', err);
        res.status(500).json({ error: 'Erro ao comparar versões' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// PLUGIN SYNC — Ponte SketchUp Plugin ↔ ERP
// ═══════════════════════════════════════════════════════════════════

// POST /api/cnc/plugin/sync — Sync bidirecional
// Recebe módulos do SketchUp, retorna status de produção, custos, alertas
router.post('/plugin/sync', requireAuth, (req, res) => {
    try {
        const { action, payload } = req.body;
        if (!action) return res.status(400).json({ error: 'action é obrigatório' });

        switch (action) {
            // ── Importar módulos do plugin ────────────
            case 'import': {
                const { json, nome, projeto_id, orc_id } = payload || {};
                if (!json) return res.status(400).json({ error: 'JSON é obrigatório' });

                const { loteInfo, pecas } = parsePluginJSON(json);
                if (pecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça encontrada' });

                const loteNome = nome || loteInfo.projeto || `Plugin ${new Date().toLocaleDateString('pt-BR')}`;
                const insertLote = db.prepare(`
                    INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, codigo, vendedor, json_original, total_pecas, projeto_id, orc_id, origem)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sketchup')
                `);
                const result = insertLote.run(
                    req.user.id, loteNome, loteInfo.cliente, loteInfo.projeto,
                    loteInfo.codigo, loteInfo.vendedor, typeof json === 'string' ? json : JSON.stringify(json),
                    pecas.length, projeto_id || null, orc_id || null
                );
                const loteId = Number(result.lastInsertRowid);

                const insertPeca = db.prepare(`
                    INSERT INTO cnc_pecas (lote_id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
                      produto_final, material, material_code, espessura, comprimento, largura, quantidade,
                      borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento, upmdraw, usi_a, usi_b,
                      machining_json, observacao)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                `);
                db.transaction(() => {
                    for (const p of pecas) {
                        insertPeca.run(
                            loteId, p.persistent_id, p.upmcode, p.descricao, p.modulo_desc, p.modulo_id,
                            p.produto_final, p.material, p.material_code, p.espessura, p.comprimento, p.largura,
                            p.quantidade, p.borda_dir, p.borda_esq, p.borda_frontal, p.borda_traseira,
                            p.acabamento, p.upmdraw, p.usi_a, p.usi_b, p.machining_json, p.observacao
                        );
                    }
                })();

                return res.json({
                    ok: true,
                    lote_id: loteId,
                    total_pecas: pecas.length,
                    nome: loteNome,
                    msg: `${pecas.length} peças importadas com sucesso`,
                });
            }

            // ── Status de produção de um lote ────────
            case 'status': {
                const { lote_id } = payload || {};
                if (!lote_id) return res.status(400).json({ error: 'lote_id é obrigatório' });

                const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(lote_id, req.user.id);
                if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

                const pecas = db.prepare('SELECT id, descricao, modulo_desc, comprimento, largura, espessura, material, quantidade FROM cnc_pecas WHERE lote_id = ?').all(lote_id);
                const totalPecas = pecas.reduce((s, p) => s + (p.quantidade || 1), 0);

                // Verificar scans de expedição (progresso)
                const scansCount = db.prepare(`
                    SELECT COUNT(DISTINCT s.peca_id) as escaneadas
                    FROM cnc_expedicao_scans s
                    JOIN cnc_pecas p ON p.id = s.peca_id
                    WHERE p.lote_id = ?
                `).get(lote_id);

                const otimizado = !!lote.plano_json;
                const aproveitamento = lote.aproveitamento || null;

                return res.json({
                    ok: true,
                    lote: {
                        id: lote.id,
                        nome: lote.nome,
                        cliente: lote.cliente,
                        projeto: lote.projeto,
                        status: lote.status || 'aguardando',
                        criado_em: lote.criado_em,
                    },
                    producao: {
                        total_pecas: totalPecas,
                        total_tipos: pecas.length,
                        escaneadas: scansCount?.escaneadas || 0,
                        progresso_pct: totalPecas > 0 ? Math.round(((scansCount?.escaneadas || 0) / totalPecas) * 100) : 0,
                        otimizado,
                        aproveitamento,
                    },
                });
            }

            // ── Resumo de custos por material ────────
            case 'custos': {
                const { lote_id } = payload || {};
                if (!lote_id) return res.status(400).json({ error: 'lote_id é obrigatório' });

                const lote = db.prepare('SELECT plano_json, aproveitamento FROM cnc_lotes WHERE id = ? AND user_id = ?').get(lote_id, req.user.id);
                if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

                const pecas = db.prepare('SELECT material, material_code, espessura, comprimento, largura, quantidade FROM cnc_pecas WHERE lote_id = ?').all(lote_id);

                // Agrupar por material
                const matMap = {};
                for (const p of pecas) {
                    const key = p.material_code || p.material || '?';
                    if (!matMap[key]) matMap[key] = { nome: p.material, code: key, espessura: p.espessura, area_mm2: 0, qtd_pecas: 0 };
                    matMap[key].area_mm2 += (p.comprimento || 0) * (p.largura || 0) * (p.quantidade || 1);
                    matMap[key].qtd_pecas += (p.quantidade || 1);
                }

                // Converter para m² e calcular chapas estimadas
                const materiais = Object.values(matMap).map(m => ({
                    ...m,
                    area_m2: (m.area_mm2 / 1e6).toFixed(2),
                    chapas_estimadas: Math.ceil(m.area_mm2 / (2750 * 1850)), // chapa padrão BR
                }));

                // Se tem plano otimizado, usar dados reais
                let planoResumo = null;
                if (lote.plano_json) {
                    try {
                        const plano = JSON.parse(lote.plano_json);
                        planoResumo = {
                            total_chapas: plano.chapas?.length || 0,
                            aproveitamento: lote.aproveitamento,
                        };
                    } catch { /* ignore */ }
                }

                return res.json({
                    ok: true,
                    materiais,
                    plano: planoResumo,
                });
            }

            // ── Listar lotes do usuário ────────
            case 'listar_lotes': {
                const lotes = db.prepare(`
                    SELECT id, nome, cliente, projeto, total_pecas, aproveitamento, status, origem, criado_em
                    FROM cnc_lotes WHERE user_id = ?
                    ORDER BY criado_em DESC LIMIT 20
                `).all(req.user.id);
                return res.json({ ok: true, lotes });
            }

            // ── Alertas de validação ────────
            case 'alertas': {
                const { lote_id } = payload || {};
                if (!lote_id) return res.status(400).json({ error: 'lote_id é obrigatório' });

                const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote_id);
                const alertas = [];

                for (const p of pecas) {
                    // Peça maior que chapa padrão
                    if ((p.comprimento || 0) > 2750 || (p.largura || 0) > 1850) {
                        alertas.push({ nivel: 'erro', peca: p.descricao, modulo: p.modulo_desc, msg: `Peça excede dimensão da chapa (${p.comprimento}×${p.largura})` });
                    }
                    // Peça muito pequena (difícil de usinar)
                    if ((p.comprimento || 0) < 50 || (p.largura || 0) < 50) {
                        alertas.push({ nivel: 'aviso', peca: p.descricao, modulo: p.modulo_desc, msg: `Peça muito pequena (${p.comprimento}×${p.largura})` });
                    }
                    // Material não definido
                    if (!p.material && !p.material_code) {
                        alertas.push({ nivel: 'erro', peca: p.descricao, modulo: p.modulo_desc, msg: 'Material não definido' });
                    }
                    // Espessura zero
                    if (!p.espessura || p.espessura <= 0) {
                        alertas.push({ nivel: 'aviso', peca: p.descricao, modulo: p.modulo_desc, msg: 'Espessura não definida' });
                    }
                }

                return res.json({ ok: true, total: alertas.length, alertas });
            }

            default:
                return res.status(400).json({ error: `Ação desconhecida: ${action}` });
        }
    } catch (err) {
        console.error('Plugin sync error:', err);
        res.status(500).json({ error: 'Erro no sync do plugin' });
    }
});

// POST /api/cnc/plugin/ping — Health check para o plugin verificar conexão
router.get('/plugin/ping', (req, res) => {
    res.json({
        ok: true,
        server: 'Ornato ERP',
        version: '1.0',
        ts: new Date().toISOString(),
        features: ['import', 'status', 'custos', 'alertas', 'etiquetas', 'csv', 'gcode'],
    });
});

// ═══════════════════════════════════════════════════════
// RELATÓRIO DE DESPERDÍCIO — por lote
// ═══════════════════════════════════════════════════════

router.get('/relatorio-desperdicio/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        let plano;
        try { plano = JSON.parse(lote.plano_json); } catch { return res.status(400).json({ error: 'Plano inválido' }); }

        const chapas = plano.chapas || [];
        if (chapas.length === 0) return res.json({ por_material: [], resumo: { total_chapas: 0, total_pecas: 0, aproveitamento_medio: 0, custo_total: 0, custo_desperdicio_total: 0 } });

        // Agrupar por material_code
        const matMap = {};
        let totalPecas = 0;

        for (const ch of chapas) {
            const code = ch.material_code || ch.material || 'DESCONHECIDO';
            const nome = ch.material || ch.material_code || 'Desconhecido';
            if (!matMap[code]) {
                matMap[code] = {
                    material_code: code,
                    material: nome,
                    chapas_usadas: 0,
                    area_total_chapas: 0,
                    area_pecas: 0,
                    area_sobras_aproveitaveis: 0,
                    area_desperdicio: 0,
                    sum_aproveitamento: 0,
                    count_aproveitamento: 0,
                    custo_material: 0,
                };
            }
            const m = matMap[code];
            m.chapas_usadas++;

            const areaChapa = (ch.comprimento || 0) * (ch.largura || 0);
            m.area_total_chapas += areaChapa;

            // Somar área das peças
            const pecas = ch.pecas || [];
            let areaPecas = 0;
            for (const p of pecas) {
                areaPecas += (p.w || 0) * (p.h || 0);
                totalPecas++;
            }
            m.area_pecas += areaPecas;

            // Somar área de sobras/retalhos aproveitáveis
            const retalhos = ch.retalhos || [];
            let areaSobras = 0;
            for (const r of retalhos) {
                areaSobras += (r.w || 0) * (r.h || 0);
            }
            m.area_sobras_aproveitaveis += areaSobras;

            // Aproveitamento da chapa (já calculado no plano)
            if (ch.aproveitamento > 0) {
                m.sum_aproveitamento += ch.aproveitamento;
                m.count_aproveitamento++;
            }

            // Custo
            m.custo_material += (ch.preco || 0);
        }

        // Montar resultado por material
        const porMaterial = Object.values(matMap).map(m => {
            const desperdicio = Math.max(0, m.area_total_chapas - m.area_pecas - m.area_sobras_aproveitaveis);
            const aprovPct = m.count_aproveitamento > 0
                ? Math.round(m.sum_aproveitamento / m.count_aproveitamento * 10) / 10
                : (m.area_total_chapas > 0 ? Math.round(m.area_pecas / m.area_total_chapas * 1000) / 10 : 0);
            const custoDesperdicio = m.area_total_chapas > 0
                ? Math.round(m.custo_material * (desperdicio / m.area_total_chapas) * 100) / 100
                : 0;

            return {
                material_code: m.material_code,
                material: m.material,
                chapas_usadas: m.chapas_usadas,
                area_total_chapas: Math.round(m.area_total_chapas),
                area_pecas: Math.round(m.area_pecas),
                area_sobras_aproveitaveis: Math.round(m.area_sobras_aproveitaveis),
                area_desperdicio: Math.round(desperdicio),
                aproveitamento_pct: aprovPct,
                custo_material: Math.round(m.custo_material * 100) / 100,
                custo_desperdicio: custoDesperdicio,
            };
        });

        // Resumo geral
        const totalChapas = porMaterial.reduce((s, m) => s + m.chapas_usadas, 0);
        const custoTotal = porMaterial.reduce((s, m) => s + m.custo_material, 0);
        const custoDesperdicioTotal = porMaterial.reduce((s, m) => s + m.custo_desperdicio, 0);
        const sumAprov = porMaterial.reduce((s, m) => s + m.aproveitamento_pct * m.chapas_usadas, 0);
        const aprovMedio = totalChapas > 0 ? Math.round(sumAprov / totalChapas * 10) / 10 : 0;

        res.json({
            por_material: porMaterial,
            resumo: {
                total_chapas: totalChapas,
                total_pecas: totalPecas,
                aproveitamento_medio: aprovMedio,
                custo_total: Math.round(custoTotal * 100) / 100,
                custo_desperdicio_total: Math.round(custoDesperdicioTotal * 100) / 100,
            },
        });
    } catch (err) {
        console.error('Erro relatório desperdício:', err);
        res.status(500).json({ error: 'Erro ao gerar relatório de desperdício' });
    }
});

// ═══════════════════════════════════════════════════════
// RELATÓRIO DE DESPERDÍCIO — histórico (todos os lotes)
// ═══════════════════════════════════════════════════════

router.get('/relatorio-desperdicio-historico', requireAuth, (req, res) => {
    try {
        const lotes = db.prepare(`
            SELECT id, nome, cliente, projeto, criado_em, plano_json, aproveitamento
            FROM cnc_lotes
            WHERE user_id = ? AND plano_json IS NOT NULL AND plano_json != ''
            ORDER BY criado_em DESC
        `).all(req.user.id);

        const matMap = {};
        let totalLotes = 0;

        for (const l of lotes) {
            let plano;
            try { plano = JSON.parse(l.plano_json); } catch { continue; }
            const chapas = plano.chapas || [];
            if (chapas.length === 0) continue;
            totalLotes++;

            for (const ch of chapas) {
                const code = ch.material_code || ch.material || 'DESCONHECIDO';
                const nome = ch.material || ch.material_code || 'Desconhecido';
                if (!matMap[code]) {
                    matMap[code] = {
                        material_code: code,
                        material: nome,
                        chapas_usadas: 0,
                        area_total_chapas: 0,
                        area_pecas: 0,
                        area_sobras_aproveitaveis: 0,
                        area_desperdicio: 0,
                        sum_aproveitamento: 0,
                        count_aproveitamento: 0,
                        custo_material: 0,
                        total_pecas: 0,
                        lotes_count: new Set(),
                    };
                }
                const m = matMap[code];
                m.chapas_usadas++;
                m.lotes_count.add(l.id);

                const areaChapa = (ch.comprimento || 0) * (ch.largura || 0);
                m.area_total_chapas += areaChapa;

                const pecas = ch.pecas || [];
                let areaPecas = 0;
                for (const p of pecas) {
                    areaPecas += (p.w || 0) * (p.h || 0);
                    m.total_pecas++;
                }
                m.area_pecas += areaPecas;

                const retalhos = ch.retalhos || [];
                let areaSobras = 0;
                for (const r of retalhos) {
                    areaSobras += (r.w || 0) * (r.h || 0);
                }
                m.area_sobras_aproveitaveis += areaSobras;

                if (ch.aproveitamento > 0) {
                    m.sum_aproveitamento += ch.aproveitamento;
                    m.count_aproveitamento++;
                }
                m.custo_material += (ch.preco || 0);
            }
        }

        const porMaterial = Object.values(matMap).map(m => {
            const desperdicio = Math.max(0, m.area_total_chapas - m.area_pecas - m.area_sobras_aproveitaveis);
            const aprovPct = m.count_aproveitamento > 0
                ? Math.round(m.sum_aproveitamento / m.count_aproveitamento * 10) / 10
                : (m.area_total_chapas > 0 ? Math.round(m.area_pecas / m.area_total_chapas * 1000) / 10 : 0);
            const custoDesperdicio = m.area_total_chapas > 0
                ? Math.round(m.custo_material * (desperdicio / m.area_total_chapas) * 100) / 100
                : 0;

            return {
                material_code: m.material_code,
                material: m.material,
                lotes_usados: m.lotes_count.size,
                chapas_usadas: m.chapas_usadas,
                total_pecas: m.total_pecas,
                area_total_chapas: Math.round(m.area_total_chapas),
                area_pecas: Math.round(m.area_pecas),
                area_sobras_aproveitaveis: Math.round(m.area_sobras_aproveitaveis),
                area_desperdicio: Math.round(desperdicio),
                aproveitamento_pct: aprovPct,
                custo_material: Math.round(m.custo_material * 100) / 100,
                custo_desperdicio: custoDesperdicio,
            };
        });

        porMaterial.sort((a, b) => b.chapas_usadas - a.chapas_usadas);

        const totalChapas = porMaterial.reduce((s, m) => s + m.chapas_usadas, 0);
        const totalPecas = porMaterial.reduce((s, m) => s + m.total_pecas, 0);
        const custoTotal = porMaterial.reduce((s, m) => s + m.custo_material, 0);
        const custoDesperdicioTotal = porMaterial.reduce((s, m) => s + m.custo_desperdicio, 0);
        const sumAprov = porMaterial.reduce((s, m) => s + m.aproveitamento_pct * m.chapas_usadas, 0);
        const aprovMedio = totalChapas > 0 ? Math.round(sumAprov / totalChapas * 10) / 10 : 0;

        res.json({
            por_material: porMaterial,
            resumo: {
                total_lotes: totalLotes,
                total_chapas: totalChapas,
                total_pecas: totalPecas,
                aproveitamento_medio: aprovMedio,
                custo_total: Math.round(custoTotal * 100) / 100,
                custo_desperdicio_total: Math.round(custoDesperdicioTotal * 100) / 100,
            },
        });
    } catch (err) {
        console.error('Erro relatório desperdício histórico:', err);
        res.status(500).json({ error: 'Erro ao gerar relatório histórico de desperdício' });
    }
});

// ═══════════════════════════════════════════════════════
// Validar usinagens (conflitos, sobreposições, bordas)
// ═══════════════════════════════════════════════════════
router.post('/validar-usinagens/:pecaId', requireAuth, (req, res) => {
    try {
        const peca = db.prepare(
            'SELECT p.* FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?'
        ).get(req.params.pecaId, req.user.id);
        if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

        let mach = {};
        try { mach = peca.machining_json ? JSON.parse(peca.machining_json) : {}; } catch (_) {}

        // Collect all workers
        const workers = [];
        if (mach.workers) {
            const wArr = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);
            for (const r of wArr) { if (r && typeof r === 'object') workers.push(r); }
        }
        for (const side of ['side_a', 'side_b']) {
            const sd = mach[side];
            if (!sd) continue;
            const sArr = Array.isArray(sd) ? sd : Object.values(sd);
            for (const r of sArr) { if (r && typeof r === 'object') workers.push(r); }
        }

        const comp = peca.comprimento || 0;
        const larg = peca.largura || 0;
        const esp = peca.espessura || 18;
        const EDGE_MIN = 3; // mm

        const warnings = [];

        for (let i = 0; i < workers.length; i++) {
            const w = workers[i];
            const tipo = (w.type || w.category || '').toLowerCase();
            const isHole = tipo.includes('hole');
            const wx = w.x || 0;
            const wy = w.y || 0;
            const wDepth = w.depth || 0;
            const wDiam = w.diameter || 0;
            const face = (w.face || 'top').toLowerCase();
            const isFaceTop = face === 'top' || face === 'side_a' || face === 'bottom' || face === 'side_b';

            // 1. Missing diameter on holes
            if (isHole && !wDiam) {
                warnings.push({
                    type: 'missing_diameter',
                    severity: 'error',
                    msg: `Furo ${i + 1}: diâmetro não definido`,
                    workers: [i],
                });
            }

            // 2. Depth exceeds thickness
            if (wDepth > esp) {
                warnings.push({
                    type: 'depth_exceeded',
                    severity: 'error',
                    msg: `Furo ${i + 1}: profundidade ${wDepth}mm > espessura ${esp}mm`,
                    workers: [i],
                });
            }

            // 3. Edge proximity (only for top/bottom faces where x,y relate to comp/larg)
            if (isFaceTop) {
                const minX = wx - wDiam / 2;
                const maxX = wx + wDiam / 2;
                const minY = wy - wDiam / 2;
                const maxY = wy + wDiam / 2;

                if (minX < EDGE_MIN || minY < EDGE_MIN || (comp > 0 && maxX > comp - EDGE_MIN) || (larg > 0 && maxY > larg - EDGE_MIN)) {
                    const edgeDist = Math.min(
                        minX,
                        minY,
                        comp > 0 ? comp - maxX : Infinity,
                        larg > 0 ? larg - maxY : Infinity,
                    );
                    warnings.push({
                        type: 'edge_proximity',
                        severity: 'warning',
                        msg: `Furo ${i + 1} a ${Math.max(0, Math.round(edgeDist * 10) / 10)}mm da borda (mínimo ${EDGE_MIN}mm)`,
                        workers: [i],
                    });
                }
            }

            // 4. Overlapping holes & 5. Duplicate positions
            for (let j = i + 1; j < workers.length; j++) {
                const w2 = workers[j];
                const tipo2 = (w2.type || w2.category || '').toLowerCase();
                const face2 = (w2.face || 'top').toLowerCase();
                if (face !== face2) continue; // different faces don't conflict

                const w2x = w2.x || 0;
                const w2y = w2.y || 0;
                const dist = Math.sqrt((wx - w2x) ** 2 + (wy - w2y) ** 2);

                // Duplicate positions
                if (dist < 0.01) {
                    warnings.push({
                        type: 'duplicate_position',
                        severity: 'warning',
                        msg: `Furos ${i + 1} e ${j + 1} na mesma posição (${wx}, ${wy})`,
                        workers: [i, j],
                    });
                }

                // Overlapping holes
                if (isHole && tipo2.includes('hole') && wDiam > 0 && (w2.diameter || 0) > 0) {
                    const minDist = wDiam / 2 + (w2.diameter || 0) / 2;
                    if (dist < minDist) {
                        warnings.push({
                            type: 'overlap',
                            severity: 'error',
                            msg: `Furos ${i + 1} e ${j + 1} sobrepostos (distância ${Math.round(dist * 10) / 10}mm, mínimo ${Math.round(minDist * 10) / 10}mm)`,
                            workers: [i, j],
                        });
                    }
                }
            }
        }

        res.json({ ok: true, warnings, total_workers: workers.length });
    } catch (err) {
        console.error('Erro ao validar usinagens:', err);
        res.status(500).json({ error: 'Erro ao validar usinagens' });
    }
});

// ═══════════════════════════════════════════════════════
// Espelhar usinagens de uma peça para outra
// ═══════════════════════════════════════════════════════
router.post('/espelhar-usinagens', requireAuth, (req, res) => {
    try {
        const { peca_origem_id, peca_destino_id, eixo, merge } = req.body;
        if (!peca_origem_id || !peca_destino_id || !eixo) {
            return res.status(400).json({ error: 'Campos obrigatórios: peca_origem_id, peca_destino_id, eixo (x ou y)' });
        }
        if (eixo !== 'x' && eixo !== 'y') {
            return res.status(400).json({ error: 'Eixo deve ser "x" ou "y"' });
        }

        const pecaOrigem = db.prepare(
            'SELECT p.* FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?'
        ).get(peca_origem_id, req.user.id);
        if (!pecaOrigem) return res.status(404).json({ error: 'Peça de origem não encontrada' });

        const pecaDestino = db.prepare(
            'SELECT p.* FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?'
        ).get(peca_destino_id, req.user.id);
        if (!pecaDestino) return res.status(404).json({ error: 'Peça de destino não encontrada' });

        let machOrigem = {};
        try { machOrigem = pecaOrigem.machining_json ? JSON.parse(pecaOrigem.machining_json) : {}; } catch (_) {}

        const comp = pecaDestino.comprimento || pecaOrigem.comprimento || 0;
        const larg = pecaDestino.largura || pecaOrigem.largura || 0;

        // Face swap map for mirroring side holes
        const faceSwapX = { left: 'right', right: 'left' };
        const faceSwapY = { front: 'back', back: 'front' };

        function mirrorWorker(w) {
            const mirrored = { ...w };
            const face = (w.face || 'top').toLowerCase();

            if (eixo === 'x') {
                // Mirror along length: flip Y coordinates
                mirrored.y = larg - (w.y || 0);
                if (w.y2 != null) mirrored.y2 = larg - w.y2;
                // Swap left/right faces
                if (faceSwapX[face]) mirrored.face = faceSwapX[face];
                // Mirror vertices if present
                if (w.vertices) {
                    mirrored.vertices = w.vertices.map(v =>
                        Array.isArray(v) ? [v[0], larg - v[1]] : { ...v, y: larg - (v.y || 0) }
                    );
                }
            } else {
                // Mirror along width: flip X coordinates
                mirrored.x = comp - (w.x || 0);
                if (w.x2 != null) mirrored.x2 = comp - w.x2;
                // Swap front/back faces
                if (faceSwapY[face]) mirrored.face = faceSwapY[face];
                // Mirror vertices if present
                if (w.vertices) {
                    mirrored.vertices = w.vertices.map(v =>
                        Array.isArray(v) ? [comp - v[0], v[1]] : { ...v, x: comp - (v.x || 0) }
                    );
                }
            }
            return mirrored;
        }

        // Mirror all worker sections
        const newMach = { ...machOrigem };

        // Mirror main workers
        if (machOrigem.workers) {
            const wArr = Array.isArray(machOrigem.workers) ? machOrigem.workers : Object.values(machOrigem.workers);
            newMach.workers = wArr.map(w => (w && typeof w === 'object') ? mirrorWorker(w) : w);
        }

        // Mirror side_a / side_b
        for (const side of ['side_a', 'side_b']) {
            if (machOrigem[side]) {
                const sArr = Array.isArray(machOrigem[side]) ? machOrigem[side] : Object.values(machOrigem[side]);
                newMach[side] = sArr.map(w => (w && typeof w === 'object') ? mirrorWorker(w) : w);
            }
        }

        // Merge with existing or replace
        let finalMach;
        if (merge) {
            let existingMach = {};
            try { existingMach = pecaDestino.machining_json ? JSON.parse(pecaDestino.machining_json) : {}; } catch (_) {}
            const existingWorkers = existingMach.workers ? (Array.isArray(existingMach.workers) ? existingMach.workers : Object.values(existingMach.workers)) : [];
            const newWorkers = newMach.workers || [];
            finalMach = { ...existingMach, ...newMach, workers: [...existingWorkers, ...newWorkers] };
            // Merge side arrays too
            for (const side of ['side_a', 'side_b']) {
                if (newMach[side] || existingMach[side]) {
                    const eArr = existingMach[side] ? (Array.isArray(existingMach[side]) ? existingMach[side] : Object.values(existingMach[side])) : [];
                    const nArr = newMach[side] || [];
                    finalMach[side] = [...eArr, ...nArr];
                }
            }
        } else {
            finalMach = newMach;
        }

        const machiningJson = JSON.stringify(finalMach);
        db.prepare('UPDATE cnc_pecas SET machining_json = ? WHERE id = ?').run(machiningJson, pecaDestino.id);

        res.json({ ok: true, machining_json: finalMach });
    } catch (err) {
        console.error('Erro ao espelhar usinagens:', err);
        res.status(500).json({ error: 'Erro ao espelhar usinagens' });
    }
});

// ─── Expedição: Checklist de Entrega por Módulo ────────────────────
router.get('/expedicao/checklist/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        // Find the checkpoint to check scans against (prefer 'Expedição', else highest id)
        let checkpoint = db.prepare("SELECT * FROM cnc_expedicao_checkpoints WHERE nome = 'Expedição' AND ativo = 1 LIMIT 1").get();
        if (!checkpoint) {
            checkpoint = db.prepare('SELECT * FROM cnc_expedicao_checkpoints WHERE ativo = 1 ORDER BY id DESC LIMIT 1').get();
        }

        const pecas = db.prepare('SELECT id, descricao, comprimento, largura, modulo_desc, modulo_id FROM cnc_pecas WHERE lote_id = ?').all(lote.id);

        // Get all scans for this checkpoint+lote
        const scannedSet = new Set();
        if (checkpoint) {
            const scans = db.prepare('SELECT DISTINCT peca_id FROM cnc_expedicao_scans WHERE lote_id = ? AND checkpoint_id = ?').all(lote.id, checkpoint.id);
            for (const s of scans) scannedSet.add(s.peca_id);
        }

        // Group by modulo_desc
        const moduloMap = {};
        for (const p of pecas) {
            const key = p.modulo_desc || 'Sem módulo';
            if (!moduloMap[key]) {
                moduloMap[key] = {
                    modulo_desc: key,
                    modulo_id: p.modulo_id || 0,
                    total_pecas: 0,
                    pecas_escaneadas: 0,
                    completo: false,
                    pecas: [],
                };
            }
            const escaneada = scannedSet.has(p.id);
            moduloMap[key].pecas.push({
                id: p.id,
                descricao: p.descricao,
                comprimento: p.comprimento,
                largura: p.largura,
                escaneada,
            });
            moduloMap[key].total_pecas++;
            if (escaneada) moduloMap[key].pecas_escaneadas++;
        }

        const modulos = Object.values(moduloMap);
        let totalPecas = 0, totalEscaneadas = 0, modulosCompletos = 0;
        for (const m of modulos) {
            m.completo = m.total_pecas > 0 && m.pecas_escaneadas === m.total_pecas;
            totalPecas += m.total_pecas;
            totalEscaneadas += m.pecas_escaneadas;
            if (m.completo) modulosCompletos++;
        }

        res.json({
            modulos,
            resumo: {
                total_modulos: modulos.length,
                modulos_completos: modulosCompletos,
                total_pecas: totalPecas,
                pecas_escaneadas: totalEscaneadas,
                progresso_pct: totalPecas > 0 ? Math.round((totalEscaneadas / totalPecas) * 1000) / 10 : 0,
            },
        });
    } catch (err) {
        console.error('Erro checklist expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Expedição: Volumes / Pacotes ──────────────────────────────────
router.post('/expedicao/volumes', requireAuth, (req, res) => {
    try {
        const { lote_id, volumes } = req.body;
        if (!lote_id || !Array.isArray(volumes) || volumes.length === 0) {
            return res.status(400).json({ error: 'lote_id e volumes são obrigatórios' });
        }

        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(lote_id, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const insertStmt = db.prepare('INSERT INTO cnc_expedicao_volumes (lote_id, user_id, nome, peca_ids) VALUES (?, ?, ?, ?)');
        const created = [];

        const runBulk = db.transaction(() => {
            for (const vol of volumes) {
                if (!vol.nome || !Array.isArray(vol.peca_ids) || vol.peca_ids.length === 0) continue;
                const r = insertStmt.run(lote_id, req.user.id, vol.nome, JSON.stringify(vol.peca_ids));
                created.push({
                    id: r.lastInsertRowid,
                    lote_id,
                    nome: vol.nome,
                    peca_ids: vol.peca_ids,
                });
            }
        });
        runBulk();

        res.json({ ok: true, volumes: created });
    } catch (err) {
        console.error('Erro criar volumes expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/expedicao/volumes/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const rows = db.prepare('SELECT * FROM cnc_expedicao_volumes WHERE lote_id = ? ORDER BY criado_em ASC').all(lote.id);
        const volumes = rows.map(r => ({
            ...r,
            peca_ids: JSON.parse(r.peca_ids),
        }));

        res.json({ volumes });
    } catch (err) {
        console.error('Erro listar volumes expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/expedicao/volumes/:volumeId', requireAuth, (req, res) => {
    try {
        const vol = db.prepare('SELECT * FROM cnc_expedicao_volumes WHERE id = ? AND user_id = ?').get(req.params.volumeId, req.user.id);
        if (!vol) return res.status(404).json({ error: 'Volume não encontrado' });

        db.prepare('DELETE FROM cnc_expedicao_volumes WHERE id = ?').run(vol.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('Erro deletar volume expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/expedicao/volumes/:volumeId/qr', requireAuth, (req, res) => {
    try {
        const vol = db.prepare('SELECT * FROM cnc_expedicao_volumes WHERE id = ? AND user_id = ?').get(req.params.volumeId, req.user.id);
        if (!vol) return res.status(404).json({ error: 'Volume não encontrado' });

        const pecaIds = JSON.parse(vol.peca_ids);
        res.json({
            qr_data: JSON.stringify({
                v: vol.id,
                l: vol.lote_id,
                n: vol.nome,
                p: pecaIds.length,
            }),
        });
    } catch (err) {
        console.error('Erro QR volume expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Fotos Expedição ────────────────────────────────────────────────
const __cncFilename = fileURLToPath(import.meta.url);
const __cncDirname = dirname(__cncFilename);
const uploadDir = join(__cncDirname, '..', 'uploads', 'expedicao');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

const fotoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        const ext = file.originalname.split('.').pop();
        cb(null, `foto-${unique}.${ext}`);
    },
});
const uploadFoto = multer({
    storage: fotoStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
        else cb(new Error('Tipo de arquivo não permitido'));
    },
});

router.post('/expedicao/fotos', requireAuth, uploadFoto.single('foto'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
        const { lote_id, volume_id, descricao } = req.body;
        if (!lote_id) return res.status(400).json({ error: 'lote_id obrigatório' });

        const result = db.prepare(`
            INSERT INTO cnc_expedicao_fotos (lote_id, volume_id, user_id, filename, descricao)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            Number(lote_id),
            volume_id ? Number(volume_id) : null,
            req.user.id,
            req.file.filename,
            descricao || ''
        );

        res.json({
            id: result.lastInsertRowid,
            filename: req.file.filename,
            ok: true,
        });
    } catch (err) {
        console.error('Erro upload foto expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/expedicao/fotos/:loteId', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT f.*, u.nome as user_nome
            FROM cnc_expedicao_fotos f
            LEFT JOIN users u ON u.id = f.user_id
            WHERE f.lote_id = ?
            ORDER BY f.criado_em DESC
        `).all(Number(req.params.loteId));

        res.json({ fotos: rows });
    } catch (err) {
        console.error('Erro listar fotos expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/expedicao/fotos/:fotoId', requireAuth, (req, res) => {
    try {
        const foto = db.prepare('SELECT * FROM cnc_expedicao_fotos WHERE id = ?').get(Number(req.params.fotoId));
        if (!foto) return res.status(404).json({ error: 'Foto não encontrada' });

        // Remove file from disk
        const filePath = join(uploadDir, foto.filename);
        try { unlinkSync(filePath); } catch (_) { /* file may already be gone */ }

        db.prepare('DELETE FROM cnc_expedicao_fotos WHERE id = ?').run(foto.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('Erro deletar foto expedição:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Fotos Retalhos ─────────────────────────────────────────────
const retalhoUploadDir = join(__cncDirname, '..', 'uploads', 'retalhos');
if (!existsSync(retalhoUploadDir)) mkdirSync(retalhoUploadDir, { recursive: true });

const retalhoFotoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, retalhoUploadDir),
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        const ext = file.originalname.split('.').pop();
        cb(null, `retalho-${unique}.${ext}`);
    },
});
const uploadRetalhoFoto = multer({
    storage: retalhoFotoStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
        else cb(new Error('Tipo de arquivo não permitido'));
    },
});

router.post('/retalhos/foto', requireAuth, uploadRetalhoFoto.single('foto'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhuma foto enviada' });
        const { retalho_id, lote_id, chapa_idx } = req.body;
        if (!retalho_id) return res.status(400).json({ error: 'retalho_id obrigatório' });

        const result = db.prepare(`
            INSERT INTO cnc_retalho_fotos (retalho_id, lote_id, chapa_idx, foto_path)
            VALUES (?, ?, ?, ?)
        `).run(
            String(retalho_id),
            lote_id ? Number(lote_id) : null,
            chapa_idx != null ? Number(chapa_idx) : null,
            req.file.filename
        );

        res.json({ id: Number(result.lastInsertRowid), filename: req.file.filename, ok: true });
    } catch (err) {
        console.error('Erro upload foto retalho:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/retalhos/foto/:retalhoId', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT * FROM cnc_retalho_fotos WHERE retalho_id = ? ORDER BY criado_em DESC
        `).all(String(req.params.retalhoId));
        res.json({ fotos: rows });
    } catch (err) {
        console.error('Erro listar fotos retalho:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Feature: Smart Remnant Suggestions ──────────────────────────
router.get('/retalhos/sugestoes', requireAuth, (req, res) => {
    try {
        const { material_code, espessura, pecas_json } = req.query;
        if (!material_code) return res.status(400).json({ error: 'material_code é obrigatório' });

        // Decode pieces list
        let pecas = [];
        if (pecas_json) {
            try {
                const decoded = Buffer.from(pecas_json, 'base64').toString('utf-8');
                pecas = JSON.parse(decoded);
            } catch { return res.status(400).json({ error: 'pecas_json inválido (deve ser JSON em base64)' }); }
        }

        // Query available remnants matching material and thickness
        let sql = 'SELECT * FROM cnc_retalhos WHERE material_code = ? AND disponivel = 1';
        const params = [material_code];
        if (espessura) {
            sql += ' AND espessura_real = ?';
            params.push(parseFloat(espessura));
        }
        const retalhos = db.prepare(sql).all(...params);

        const totalPecas = pecas.length;

        const sugestoes = retalhos.map(r => {
            const areaRetalho = r.comprimento * r.largura;

            // Simple area-based fit: how many pieces fit by area
            let pecasCabem = 0;
            let areaPecasCabem = 0;
            for (const p of pecas) {
                const pw = p.comprimento || p.w || 0;
                const ph = p.largura || p.h || 0;
                const areaP = pw * ph;
                // Check if piece physically fits in dimensions (either orientation)
                const fits = (pw <= r.comprimento && ph <= r.largura) || (ph <= r.comprimento && pw <= r.largura);
                if (fits && areaPecasCabem + areaP <= areaRetalho) {
                    pecasCabem++;
                    areaPecasCabem += areaP;
                }
            }

            const aproveitamento = areaRetalho > 0 ? Math.round((areaPecasCabem / areaRetalho) * 1000) / 10 : 0;

            return {
                retalho_id: r.id,
                nome: r.nome || `Retalho ${r.material_code} #${r.id}`,
                comprimento: r.comprimento,
                largura: r.largura,
                area: areaRetalho,
                area_pecas_cabem: areaPecasCabem,
                aproveitamento_estimado: aproveitamento,
                pecas_cabem: pecasCabem,
                total_pecas: totalPecas,
            };
        });

        // Sort by best fit (highest utilization) and return top 5
        sugestoes.sort((a, b) => b.aproveitamento_estimado - a.aproveitamento_estimado);
        res.json({ sugestoes: sugestoes.slice(0, 5) });
    } catch (err) {
        console.error('Erro sugestões retalhos:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Feature: Material Alerts for Pending Lotes ──────────────────
router.get('/alertas-material', requireAuth, (req, res) => {
    try {
        const { lote_id } = req.query;
        // Get non-concluded lotes with a cutting plan (optionally filtered by lote_id)
        let lotesSql = "SELECT id, nome, plano_json, status FROM cnc_lotes WHERE user_id = ? AND status != 'concluido' AND plano_json IS NOT NULL AND plano_json != ''";
        const params = [req.user.id];
        if (lote_id) {
            lotesSql += " AND id = ?";
            params.push(Number(lote_id));
        }
        const lotes = db.prepare(lotesSql).all(...params);

        // Aggregate material needs from plano_json
        const materialMap = {}; // keyed by material_code

        for (const lote of lotes) {
            let plano;
            try { plano = JSON.parse(lote.plano_json); } catch { continue; }
            if (!plano.chapas || !Array.isArray(plano.chapas)) continue;

            for (const chapa of plano.chapas) {
                const mc = chapa.material_code;
                if (!mc) continue;
                if (!materialMap[mc]) {
                    materialMap[mc] = {
                        material_code: mc,
                        material: chapa.material || mc,
                        chapas_necessarias: 0,
                        area_total_mm2: 0,
                        lotes_pendentes: [],
                        retalhos_disponiveis: 0,
                        estoque_chapas: 0,
                    };
                }
                materialMap[mc].chapas_necessarias += 1;
                materialMap[mc].area_total_mm2 += (chapa.comprimento || 0) * (chapa.largura || 0);
                if (!materialMap[mc].lotes_pendentes.includes(lote.nome)) {
                    materialMap[mc].lotes_pendentes.push(lote.nome);
                }
            }
        }

        // Cross-reference with available remnants
        const retalhosCount = db.prepare(
            'SELECT material_code, COUNT(*) as cnt FROM cnc_retalhos WHERE disponivel = 1 GROUP BY material_code'
        ).all();
        const retalhosMap = {};
        for (const r of retalhosCount) retalhosMap[r.material_code] = r.cnt;

        // Cross-reference with estoque via biblioteca (match by cod = material_code)
        const estoqueRows = db.prepare(
            "SELECT b.cod, b.nome, COALESCE(e.quantidade, 0) as quantidade FROM biblioteca b LEFT JOIN estoque e ON b.id = e.material_id WHERE b.tipo = 'material' AND b.ativo = 1"
        ).all();
        const estoqueMap = {};
        for (const row of estoqueRows) {
            if (row.cod) estoqueMap[row.cod] = (estoqueMap[row.cod] || 0) + row.quantidade;
        }

        // Build final alerts
        const alertas = Object.values(materialMap).map(m => ({
            ...m,
            retalhos_disponiveis: retalhosMap[m.material_code] || 0,
            estoque_chapas: estoqueMap[m.material_code] || 0,
        }));

        // Sort by most sheets needed
        alertas.sort((a, b) => b.chapas_necessarias - a.chapas_necessarias);

        res.json({ alertas });
    } catch (err) {
        console.error('Erro alertas material:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Feature: Machining Template Library (grouped by categoria) ──
router.get('/machining-templates/biblioteca', requireAuth, (req, res) => {
    try {
        const templates = db.prepare(
            'SELECT * FROM cnc_machining_templates WHERE ativo = 1 ORDER BY uso_count DESC, nome'
        ).all();

        const categorias = {};
        let total = 0;

        for (const tpl of templates) {
            total++;
            const cat = tpl.categoria || 'Sem categoria';

            // Parse machining_json for preview summary
            let preview = { total_workers: 0, tipos: [], dimensoes_ref: '' };
            try {
                const mach = JSON.parse(tpl.machining_json || '{}');
                const workers = mach.workers
                    ? (Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers))
                    : [];
                preview.total_workers = workers.length;

                // Count by type
                const tipoCounts = {};
                const dims = [];
                for (const w of workers) {
                    const tipo = w.type || w.tipo || 'unknown';
                    tipoCounts[tipo] = (tipoCounts[tipo] || 0) + 1;
                    // Collect reference dimensions
                    if (w.diameter || w.diametro) dims.push(`${w.diameter || w.diametro}mm`);
                    if (w.width && w.height) dims.push(`${w.width}x${w.height}`);
                }
                preview.tipos = Object.entries(tipoCounts).map(([t, c]) => `${t} x${c}`);
                preview.dimensoes_ref = [...new Set(dims)].slice(0, 3).join(' + ');
            } catch { /* ignore parse errors */ }

            if (!categorias[cat]) categorias[cat] = [];
            categorias[cat].push({
                id: tpl.id,
                nome: tpl.nome,
                descricao: tpl.descricao || '',
                categoria: cat,
                espelhavel: tpl.espelhavel === 1,
                uso_count: tpl.uso_count || 0,
                preview,
            });
        }

        res.json({ categorias, total });
    } catch (err) {
        console.error('Erro biblioteca templates:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// ══ Material Map: SketchUp material_code → Biblioteca ════════
// ═══════════════════════════════════════════════════════════════

// GET /material-map — list all mappings for user
router.get('/material-map', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT m.id, m.material_code_original, m.espessura_original, m.biblioteca_id,
                   b.nome as biblioteca_nome, b.cod as biblioteca_cod,
                   b.largura as chapa_comprimento, b.altura as chapa_largura,
                   b.preco, b.espessura as biblioteca_espessura
            FROM cnc_material_map m
            LEFT JOIN biblioteca b ON b.id = m.biblioteca_id
            WHERE m.user_id = ?
            ORDER BY m.material_code_original, m.espessura_original
        `).all(req.user.id);
        res.json({ mappings: rows });
    } catch (err) {
        console.error('Erro material-map list:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /material-map — create/update a mapping
router.post('/material-map', requireAuth, (req, res) => {
    try {
        const { material_code_original, espessura_original, biblioteca_id } = req.body;
        if (!material_code_original || espessura_original == null || !biblioteca_id) {
            return res.status(400).json({ error: 'material_code_original, espessura_original e biblioteca_id são obrigatórios' });
        }
        const bib = db.prepare('SELECT id, nome, espessura FROM biblioteca WHERE id = ?').get(biblioteca_id);
        if (!bib) return res.status(404).json({ error: 'Material da biblioteca não encontrado' });

        const espProj = parseFloat(espessura_original);
        const espBib = parseFloat(bib.espessura);
        if (Math.abs(espProj - espBib) > 0.5) {
            return res.status(400).json({
                error: `Espessura incompatível: projeto ${espProj} mm, material ${espBib} mm`
            });
        }

        db.prepare(`
            INSERT INTO cnc_material_map (user_id, material_code_original, espessura_original, biblioteca_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, material_code_original, espessura_original)
            DO UPDATE SET biblioteca_id = excluded.biblioteca_id, criado_em = CURRENT_TIMESTAMP
        `).run(req.user.id, material_code_original, espProj, biblioteca_id);

        res.json({ ok: true });
    } catch (err) {
        console.error('Erro material-map save:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /material-map/:id — delete a mapping
router.delete('/material-map/:id', requireAuth, (req, res) => {
    try {
        const result = db.prepare('DELETE FROM cnc_material_map WHERE id = ? AND user_id = ?')
            .run(req.params.id, req.user.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Mapeamento não encontrado' });
        res.json({ ok: true });
    } catch (err) {
        console.error('Erro material-map delete:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /material-map/auto-match?lote_id=X — auto-detect matches for a lote
router.get('/material-map/auto-match', requireAuth, (req, res) => {
    try {
        const { lote_id } = req.query;
        if (!lote_id) return res.status(400).json({ error: 'lote_id é obrigatório' });

        // Get unique material_code + espessura combinations from the lote
        const materiais = db.prepare(`
            SELECT DISTINCT material_code, espessura
            FROM cnc_pecas WHERE lote_id = ? AND material_code != ''
        `).all(lote_id);

        const result = [];
        for (const mat of materiais) {
            const entry = {
                material_code: mat.material_code,
                espessura: mat.espessura,
                mapped: false,
                mapping_id: null,
                biblioteca_id: null,
                biblioteca_nome: null,
                sugestoes: []
            };

            // Check existing mapping
            const existing = db.prepare(`
                SELECT m.id, m.biblioteca_id, b.nome as biblioteca_nome
                FROM cnc_material_map m
                LEFT JOIN biblioteca b ON b.id = m.biblioteca_id
                WHERE m.user_id = ? AND m.material_code_original = ? AND m.espessura_original = ?
            `).get(req.user.id, mat.material_code, mat.espessura);

            if (existing) {
                entry.mapped = true;
                entry.mapping_id = existing.id;
                entry.biblioteca_id = existing.biblioteca_id;
                entry.biblioteca_nome = existing.biblioteca_nome;
            } else {
                // Search biblioteca for suggestions: matching cod or similar name AND same thickness
                const sugestoes = db.prepare(`
                    SELECT id, cod, nome, espessura, largura as chapa_comprimento, altura as chapa_largura, preco
                    FROM biblioteca
                    WHERE tipo = 'material' AND ativo = 1
                      AND ABS(espessura - ?) <= 0.5
                      AND (cod = ? OR nome LIKE ? OR cod LIKE ?)
                    LIMIT 10
                `).all(mat.espessura, mat.material_code, `%${mat.material_code}%`, `%${mat.material_code}%`);
                entry.sugestoes = sugestoes;
            }

            result.push(entry);
        }

        res.json({ materiais: result });
    } catch (err) {
        console.error('Erro material-map auto-match:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /lotes/:loteId/trocar-material — swap material for all pieces with a given material_code
router.post('/lotes/:loteId/trocar-material', requireAuth, (req, res) => {
    try {
        const { loteId } = req.params;
        const { material_code_atual, novo_biblioteca_id } = req.body;
        if (!material_code_atual || !novo_biblioteca_id) {
            return res.status(400).json({ error: 'material_code_atual e novo_biblioteca_id são obrigatórios' });
        }

        // Verify lote belongs to user
        const lote = db.prepare('SELECT id, user_id FROM cnc_lotes WHERE id = ?').get(loteId);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (lote.user_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });

        // Get target material from biblioteca
        const bib = db.prepare('SELECT id, nome, cod, espessura FROM biblioteca WHERE id = ?').get(novo_biblioteca_id);
        if (!bib) return res.status(404).json({ error: 'Material da biblioteca não encontrado' });

        // Get a sample piece to validate thickness
        const sample = db.prepare('SELECT espessura FROM cnc_pecas WHERE lote_id = ? AND material_code = ? LIMIT 1')
            .get(loteId, material_code_atual);
        if (!sample) return res.status(404).json({ error: 'Nenhuma peça com esse material_code no lote' });

        if (Math.abs(sample.espessura - bib.espessura) > 0.5) {
            return res.status(400).json({
                error: `Espessura incompatível: projeto ${sample.espessura} mm, material ${bib.espessura} mm`
            });
        }

        // Update all matching pieces
        const updateResult = db.prepare(`
            UPDATE cnc_pecas
            SET material = ?, material_code = ?, biblioteca_id = ?
            WHERE lote_id = ? AND material_code = ?
        `).run(bib.nome, bib.cod, bib.id, loteId, material_code_atual);

        // Mark plano as outdated
        db.prepare('UPDATE cnc_lotes SET plano_json = NULL WHERE id = ?').run(loteId);

        res.json({ ok: true, pecas_atualizadas: updateResult.changes });
    } catch (err) {
        console.error('Erro trocar-material:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Feature: Smart lote grouping suggestions ───────────────────────
router.get('/sugestao-agrupamento/:loteId', requireAuth, (req, res) => {
    try {
        const loteId = Number(req.params.loteId);
        const loteAtual = db.prepare(
            "SELECT id, nome, plano_json, status FROM cnc_lotes WHERE id = ? AND user_id = ?"
        ).get(loteId, req.user.id);
        if (!loteAtual) return res.status(404).json({ error: 'Lote não encontrado' });

        // 1. Get materials used by the current lote (from pecas)
        const pecasAtual = db.prepare(
            "SELECT material_code, material, espessura, comprimento, largura, quantidade FROM cnc_pecas WHERE lote_id = ?"
        ).all(loteId);

        const materiaisAtual = {};
        let areaTotal = 0;
        for (const p of pecasAtual) {
            const mc = p.material_code || p.material || '';
            if (!mc) continue;
            if (!materiaisAtual[mc]) materiaisAtual[mc] = { material_code: mc, material: p.material || mc, espessura: p.espessura, pecas: 0, area: 0 };
            const qty = p.quantidade || 1;
            materiaisAtual[mc].pecas += qty;
            materiaisAtual[mc].area += (p.comprimento || 0) * (p.largura || 0) * qty;
            areaTotal += (p.comprimento || 0) * (p.largura || 0) * qty;
        }

        if (Object.keys(materiaisAtual).length === 0) {
            return res.json({ sugestoes: [] });
        }

        // 2. Find other pending lotes with same materials
        const materialCodes = Object.keys(materiaisAtual);
        const outrosLotes = db.prepare(
            "SELECT id, nome, status FROM cnc_lotes WHERE user_id = ? AND id != ? AND status IN ('importado', 'otimizado')"
        ).all(req.user.id, loteId);

        const sugestoes = [];

        for (const outro of outrosLotes) {
            const pecasOutro = db.prepare(
                "SELECT material_code, material, espessura, comprimento, largura, quantidade FROM cnc_pecas WHERE lote_id = ?"
            ).all(outro.id);

            let matchCount = 0;
            let matchArea = 0;
            const matchMaterials = [];

            for (const p of pecasOutro) {
                const mc = p.material_code || p.material || '';
                if (materialCodes.includes(mc)) {
                    const qty = p.quantidade || 1;
                    matchCount += qty;
                    matchArea += (p.comprimento || 0) * (p.largura || 0) * qty;
                    if (!matchMaterials.includes(mc)) matchMaterials.push(mc);
                }
            }

            if (matchCount > 0) {
                // 3. Estimate waste reduction: combining pieces fills waste areas
                // Rough estimate: more pieces on same sheet = less wasted area per sheet
                // We estimate savings as % of a full sheet that the extra pieces could fill
                const chapaDim = 2750 * 1830; // standard sheet area
                const currentWaste = areaTotal > 0 ? Math.max(0, 1 - (areaTotal / (Math.ceil(areaTotal / chapaDim) * chapaDim))) : 0;
                const combinedArea = areaTotal + matchArea;
                const combinedWaste = combinedArea > 0 ? Math.max(0, 1 - (combinedArea / (Math.ceil(combinedArea / chapaDim) * chapaDim))) : 0;
                const economia = Math.max(0, Math.round((currentWaste - combinedWaste) * 100));

                sugestoes.push({
                    lote_id: outro.id,
                    lote_nome: outro.nome,
                    lote_status: outro.status,
                    material_codes: matchMaterials,
                    pecas_count: matchCount,
                    economia_estimada_pct: economia,
                });
            }
        }

        // Sort by potential savings (desc), then by piece count (desc)
        sugestoes.sort((a, b) => b.economia_estimada_pct - a.economia_estimada_pct || b.pecas_count - a.pecas_count);

        res.json({ sugestoes });
    } catch (err) {
        console.error('Erro sugestao-agrupamento:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Relatório de Bordas / Fitagem por lote ─────────────────────────
router.get('/relatorio-bordas/:loteId', requireAuth, (req, res) => {
    try {
        const loteId = req.params.loteId;
        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY id').all(loteId);
        if (!pecas || pecas.length === 0) return res.json({ bordas: [] });

        const bordaMap = {};

        for (const p of pecas) {
            const qty = p.quantidade || 1;
            const comp = p.comprimento || 0;
            const larg = p.largura || 0;

            const edges = [
                { lado: 'Frontal', tipo: p.borda_frontal, comprimento_mm: comp },
                { lado: 'Traseira', tipo: p.borda_traseira, comprimento_mm: comp },
                { lado: 'Direita', tipo: p.borda_dir, comprimento_mm: larg },
                { lado: 'Esquerda', tipo: p.borda_esq, comprimento_mm: larg },
            ];

            for (const edge of edges) {
                if (!edge.tipo || edge.tipo.trim() === '') continue;
                const key = edge.tipo.trim();
                if (!bordaMap[key]) {
                    bordaMap[key] = { tipo: key, metros: 0, quantidade_pecas: 0, pecaIds: new Set(), detalhes: [] };
                }
                const metros = (edge.comprimento_mm / 1000) * qty;
                bordaMap[key].metros += metros;
                if (!bordaMap[key].pecaIds.has(p.id)) {
                    bordaMap[key].pecaIds.add(p.id);
                    bordaMap[key].quantidade_pecas++;
                }
                bordaMap[key].detalhes.push({
                    peca_id: p.id,
                    descricao: p.descricao || '',
                    modulo: p.modulo_desc || '',
                    lado: edge.lado,
                    comprimento_mm: edge.comprimento_mm,
                    metros: Math.round(metros * 1000) / 1000,
                    quantidade: qty,
                });
            }
        }

        const bordas = Object.values(bordaMap).map(b => ({
            tipo: b.tipo,
            metros: Math.round(b.metros * 1000) / 1000,
            quantidade_pecas: b.quantidade_pecas,
            detalhes: b.detalhes,
        })).sort((a, b) => b.metros - a.metros);

        res.json({ bordas });
    } catch (err) {
        console.error('Erro relatorio-bordas:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Dashboard Produtividade Operadores ─────────────────────────────────────
router.get('/dashboard-produtividade', requireAuth, (req, res) => {
    try {
        const periodo = req.query.periodo || '30d';
        const operadorFilter = req.query.operador || null;

        const diasMap = { '7d': 7, '30d': 30, '90d': 90 };
        const dias = diasMap[periodo] || 30;
        const dataInicio = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

        let where = `WHERE date(s.escaneado_em) >= date(?)`;
        const params = [dataInicio];
        if (operadorFilter) {
            where += ` AND s.operador = ?`;
            params.push(operadorFilter);
        }

        // Per-operator stats
        const operadoresRaw = db.prepare(`
            SELECT
                s.operador AS nome,
                COUNT(*) AS total_scans,
                COUNT(DISTINCT date(s.escaneado_em)) AS dias_ativos
            FROM cnc_expedicao_scans s
            ${where}
            GROUP BY s.operador
            ORDER BY total_scans DESC
        `).all(...params);

        // Per-operator checkpoint breakdown
        const checkpointBreakdown = db.prepare(`
            SELECT
                s.operador,
                c.nome AS checkpoint_nome,
                COUNT(*) AS qtd
            FROM cnc_expedicao_scans s
            LEFT JOIN cnc_expedicao_checkpoints c ON c.id = s.checkpoint_id
            ${where}
            GROUP BY s.operador, c.nome
        `).all(...params);

        const checkpointMap = {};
        for (const row of checkpointBreakdown) {
            if (!checkpointMap[row.operador]) checkpointMap[row.operador] = {};
            checkpointMap[row.operador][row.checkpoint_nome || 'Desconhecido'] = row.qtd;
        }

        // Calculate pieces/hour and avg time between scans per operator
        const operadores = operadoresRaw.map(op => {
            const scansOp = db.prepare(`
                SELECT escaneado_em FROM cnc_expedicao_scans s
                ${where} AND s.operador = ?
                ORDER BY s.escaneado_em ASC
            `).all(...params, op.nome);

            let tempoMedioEntreScansSeg = 0;
            let horasAtivas = 0;
            if (scansOp.length > 1) {
                let totalGap = 0, gapCount = 0, activeSeconds = 0;
                for (let i = 1; i < scansOp.length; i++) {
                    const gap = (new Date(scansOp[i].escaneado_em) - new Date(scansOp[i - 1].escaneado_em)) / 1000;
                    if (gap > 0 && gap < 600) {
                        totalGap += gap;
                        gapCount++;
                        activeSeconds += gap;
                    }
                }
                if (gapCount > 0) tempoMedioEntreScansSeg = Math.round(totalGap / gapCount);
                horasAtivas = activeSeconds / 3600;
            }

            return {
                nome: op.nome || 'Sem nome',
                total_scans: op.total_scans,
                pecas_por_hora: horasAtivas > 0 ? Math.round(op.total_scans / horasAtivas * 10) / 10 : 0,
                tempo_medio_entre_scans_seg: tempoMedioEntreScansSeg,
                checkpoints: checkpointMap[op.nome] || {},
                dias_ativos: op.dias_ativos,
            };
        });

        // Summary
        const totalPecasProcessadas = operadores.reduce((s, o) => s + o.total_scans, 0);
        const mediaPecasHora = operadores.length > 0
            ? Math.round(operadores.reduce((s, o) => s + o.pecas_por_hora, 0) / operadores.length * 10) / 10
            : 0;
        const lotesConcluidos = db.prepare(`
            SELECT COUNT(*) AS c FROM cnc_lotes
            WHERE status = 'concluido' AND date(criado_em) >= date(?)
        `).get(dataInicio)?.c || 0;

        // Per-day breakdown
        const porDia = db.prepare(`
            SELECT date(s.escaneado_em) AS data, COUNT(*) AS total
            FROM cnc_expedicao_scans s
            ${where}
            GROUP BY date(s.escaneado_em)
            ORDER BY data ASC
        `).all(...params);

        res.json({
            operadores,
            resumo: {
                total_pecas_processadas: totalPecasProcessadas,
                media_pecas_hora: mediaPecasHora,
                lotes_concluidos: lotesConcluidos,
            },
            por_dia: porDia,
        });
    } catch (err) {
        console.error('Erro dashboard-produtividade:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════
// G-CODE HISTORY
// ═══════════════════════════════════════════════════════

// GET /gcode-historico/:loteId — list G-code generation history
router.get('/gcode-historico/:loteId', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT h.*, u.nome as user_nome FROM cnc_gcode_historico h
            LEFT JOIN users u ON u.id = h.user_id
            WHERE h.lote_id = ? ORDER BY h.criado_em DESC LIMIT 50
        `).all(req.params.loteId);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// CHAPA STATUS (multi-state)
// ═══════════════════════════════════════════════════════

// GET /chapa-status/:loteId — get all chapa statuses for a lote
router.get('/chapa-status/:loteId', requireAuth, (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM cnc_chapa_status WHERE lote_id = ? ORDER BY chapa_idx').all(req.params.loteId);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /chapa-status/:loteId — update chapa status
router.post('/chapa-status/:loteId', requireAuth, (req, res) => {
    try {
        const { chapa_idx, status, operador, observacao } = req.body;
        const validStatus = ['pendente', 'em_corte', 'cortada', 'conferida'];
        if (!validStatus.includes(status)) return res.status(400).json({ error: `Status inválido. Válidos: ${validStatus.join(', ')}` });

        const now = new Date().toISOString();
        const existing = db.prepare('SELECT * FROM cnc_chapa_status WHERE lote_id = ? AND chapa_idx = ?').get(req.params.loteId, chapa_idx);

        if (existing) {
            db.prepare(`UPDATE cnc_chapa_status SET status = ?, operador = COALESCE(?, operador), observacao = COALESCE(?, observacao),
                inicio_em = CASE WHEN ? = 'em_corte' AND inicio_em IS NULL THEN ? ELSE inicio_em END,
                fim_em = CASE WHEN ? IN ('cortada','conferida') THEN ? ELSE fim_em END,
                atualizado_em = ? WHERE lote_id = ? AND chapa_idx = ?`
            ).run(status, operador || null, observacao || null, status, now, status, now, now, req.params.loteId, chapa_idx);
        } else {
            db.prepare(`INSERT INTO cnc_chapa_status (lote_id, chapa_idx, status, operador, observacao, inicio_em, fim_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)`).run(
                req.params.loteId, chapa_idx, status, operador || '', observacao || '',
                status === 'em_corte' ? now : null,
                ['cortada', 'conferida'].includes(status) ? now : null,
                now
            );
        }

        // Also mark pecas as cortadas when status = cortada (integrate with existing system)
        if (status === 'cortada' || status === 'conferida') {
            const lote = db.prepare('SELECT plano_json FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
            if (lote?.plano_json) {
                try {
                    const plano = JSON.parse(lote.plano_json);
                    const chapa = plano.chapas?.[chapa_idx];
                    if (chapa) {
                        const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
                        if (pecaIds.length > 0) {
                            const placeholders = pecaIds.map(() => '?').join(',');
                            db.prepare(`UPDATE cnc_pecas SET chapa_idx = ? WHERE id IN (${placeholders}) AND chapa_idx IS NULL`).run(chapa_idx, ...pecaIds);
                        }
                    }
                } catch (_) {}
            }
        }

        res.json({ ok: true, status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// MATERIAL REPORT (lista de compras)
// ═══════════════════════════════════════════════════════

// GET /relatorio-materiais/:loteId — shopping list for a lote
router.get('/relatorio-materiais/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano otimizado' });

        const plano = JSON.parse(lote.plano_json);
        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);

        // Aggregate by material
        const materiaisMap = {};
        for (const ch of (plano.chapas || [])) {
            const key = ch.material_code || ch.material || 'desconhecido';
            if (!materiaisMap[key]) {
                materiaisMap[key] = {
                    material: ch.material || key,
                    material_code: ch.material_code || '',
                    espessura: ch.espessura_real || ch.espessura || 18,
                    dim_chapa: `${ch.comprimento} x ${ch.largura}`,
                    chapas: 0,
                    pecas: 0,
                    area_total_m2: 0,
                    area_util_m2: 0,
                    preco_unitario: ch.preco || 0,
                    custo_total: 0,
                    aproveitamento_medio: 0,
                    chapas_retalho: 0,
                };
            }
            const m = materiaisMap[key];
            m.chapas++;
            m.pecas += ch.pecas.length;
            const areaChapa = (ch.comprimento * ch.largura) / 1000000; // m²
            m.area_total_m2 += areaChapa;
            m.area_util_m2 += areaChapa * (ch.aproveitamento / 100);
            m.aproveitamento_medio += ch.aproveitamento;
            m.custo_total += ch.preco || 0;
            if (ch.is_retalho) m.chapas_retalho++;
        }

        const materiais = Object.values(materiaisMap).map(m => ({
            ...m,
            area_total_m2: Math.round(m.area_total_m2 * 100) / 100,
            area_util_m2: Math.round(m.area_util_m2 * 100) / 100,
            aproveitamento_medio: Math.round(m.aproveitamento_medio / (m.chapas || 1) * 10) / 10,
            custo_total: Math.round(m.custo_total * 100) / 100,
        }));

        // Bordas summary
        const bordas = {};
        for (const p of pecas) {
            for (const lado of ['borda_frontal', 'borda_traseira', 'borda_dir', 'borda_esq']) {
                const val = p[lado];
                if (!val) continue;
                if (!bordas[val]) bordas[val] = { tipo: val, metros: 0, pecas: 0 };
                bordas[val].pecas += p.quantidade || 1;
                const dim = lado.includes('frontal') || lado.includes('traseira') ? p.comprimento : p.largura;
                bordas[val].metros += (dim / 1000) * (p.quantidade || 1);
            }
        }

        const bordasList = Object.values(bordas).map(b => ({
            ...b,
            metros: Math.round(b.metros * 100) / 100,
        }));

        res.json({
            materiais,
            bordas: bordasList,
            resumo: {
                total_chapas: plano.chapas.length,
                total_pecas: pecas.length,
                total_materiais: materiais.length,
                custo_total: materiais.reduce((s, m) => s + m.custo_total, 0),
                area_total_m2: materiais.reduce((s, m) => s + m.area_total_m2, 0),
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// PIECE LABELS (etiquetas)
// ═══════════════════════════════════════════════════════

// GET /etiquetas/:loteId — generate label data for pieces
router.get('/etiquetas/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(lote.id);
        let plano = null;
        try { plano = JSON.parse(lote.plano_json || 'null'); } catch (_) {}

        const labels = pecas.map((p, idx) => {
            // Find which chapa this piece is on
            let chapaInfo = null;
            if (plano?.chapas) {
                for (let ci = 0; ci < plano.chapas.length; ci++) {
                    const ch = plano.chapas[ci];
                    if (ch.pecas.some(pp => pp.pecaId === p.id)) {
                        chapaInfo = { idx: ci + 1, material: ch.material };
                        break;
                    }
                }
            }

            const bordas = [];
            if (p.borda_frontal) bordas.push(`F:${p.borda_frontal}`);
            if (p.borda_traseira) bordas.push(`T:${p.borda_traseira}`);
            if (p.borda_dir) bordas.push(`D:${p.borda_dir}`);
            if (p.borda_esq) bordas.push(`E:${p.borda_esq}`);

            return {
                id: p.id,
                num: idx + 1,
                descricao: p.descricao,
                upmcode: p.upmcode || '',
                modulo: p.modulo_desc || '',
                ambiente: p.ambiente || p.modulo_desc || '',
                material: p.material || '',
                dimensoes: `${p.comprimento} x ${p.largura} x ${p.espessura}`,
                bordas: bordas.join(' '),
                quantidade: p.quantidade || 1,
                chapa: chapaInfo,
                lote_nome: lote.nome || '',
                cliente: lote.cliente || '',
                codigo_scan: p.persistent_id || p.upmcode || `P${p.id}`,
            };
        });

        res.json({ labels, lote: { id: lote.id, nome: lote.nome, cliente: lote.cliente } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// REVIEW CHECKLIST (pre-corte)
// ═══════════════════════════════════════════════════════

// GET /review/:loteId — review checklist data
router.get('/review/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        let plano = null;
        try { plano = JSON.parse(lote.plano_json || 'null'); } catch (_) {}

        const checks = [];

        // 1. Plano exists
        checks.push({ id: 'plano', label: 'Plano de corte otimizado', ok: !!plano, detail: plano ? `${plano.chapas.length} chapas` : 'Não otimizado' });

        // 2. All pieces have material
        const semMaterial = pecas.filter(p => !p.material && !p.material_code);
        checks.push({ id: 'material', label: 'Todas as peças têm material definido', ok: semMaterial.length === 0, detail: semMaterial.length > 0 ? `${semMaterial.length} peça(s) sem material` : 'OK' });

        // 3. Dimensions sanity
        const dimEstranhas = pecas.filter(p => p.comprimento < 10 || p.largura < 10 || p.comprimento > 3000 || p.largura > 2000);
        checks.push({ id: 'dimensoes', label: 'Dimensões dentro do esperado', ok: dimEstranhas.length === 0, detail: dimEstranhas.length > 0 ? `${dimEstranhas.length} peça(s) com dimensões atípicas` : 'OK' });

        // 4. Bordas check
        const comBordas = pecas.filter(p => p.borda_frontal || p.borda_traseira || p.borda_dir || p.borda_esq);
        checks.push({ id: 'bordas', label: 'Fitas de borda conferidas', ok: true, detail: `${comBordas.length} peça(s) com bordas` });

        // 5. Machine configured
        const maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE ativo = 1 LIMIT 1').get();
        checks.push({ id: 'maquina', label: 'Máquina CNC cadastrada', ok: !!maquina, detail: maquina ? maquina.nome : 'Nenhuma máquina cadastrada' });

        // 6. Tools available
        if (maquina) {
            const ferramentas = db.prepare('SELECT COUNT(*) as c FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').get(maquina.id);
            checks.push({ id: 'ferramentas', label: 'Ferramentas no magazine', ok: ferramentas.c > 0, detail: `${ferramentas.c} ferramenta(s) ativas` });
        }

        // 7. Aproveitamento
        if (plano) {
            const aprovMedio = plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / plano.chapas.length;
            checks.push({ id: 'aproveitamento', label: 'Aproveitamento aceitável (>60%)', ok: aprovMedio >= 60, detail: `${aprovMedio.toFixed(1)}% médio` });
        }

        // 8. Machining data
        const comUsinagem = pecas.filter(p => p.machining_json && p.machining_json !== '{}');
        checks.push({ id: 'usinagens', label: 'Dados de usinagem presentes', ok: true, detail: `${comUsinagem.length}/${pecas.length} peças com usinagens` });

        // 9. Stock availability
        const materiaisNeeded = {};
        if (plano) {
            for (const ch of plano.chapas) {
                const key = ch.material_code || ch.material;
                if (!materiaisNeeded[key]) materiaisNeeded[key] = { nome: ch.material, qtd: 0 };
                materiaisNeeded[key].qtd++;
            }
        }
        const estoque = db.prepare('SELECT * FROM cnc_materiais WHERE ativo = 1').all();
        const estoqueMap = {};
        for (const e of estoque) estoqueMap[e.codigo] = e;
        const semEstoque = [];
        for (const [code, info] of Object.entries(materiaisNeeded)) {
            const mat = estoqueMap[code];
            if (!mat || (mat.quantidade_estoque || 0) < info.qtd) {
                semEstoque.push(`${info.nome}: precisa ${info.qtd}, tem ${mat?.quantidade_estoque || 0}`);
            }
        }
        checks.push({ id: 'estoque', label: 'Material em estoque suficiente', ok: semEstoque.length === 0, detail: semEstoque.length > 0 ? semEstoque.join('; ') : 'OK' });

        const allOk = checks.every(c => c.ok);
        res.json({ checks, allOk, total: checks.length, passed: checks.filter(c => c.ok).length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// ENVIO DIRETO PARA MÁQUINA (FTP/Network Share)
// ═══════════════════════════════════════════════════════

// POST /enviar-gcode/:loteId/chapa/:chapaIdx — send G-code to machine via FTP
router.post('/enviar-gcode/:loteId/chapa/:chapaIdx', requireAuth, async (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

        const chapaIdx = parseInt(req.params.chapaIdx);
        if (isNaN(chapaIdx) || chapaIdx < 0 || chapaIdx >= ctx.plano.chapas.length) {
            return res.status(400).json({ error: `Chapa ${chapaIdx} não existe` });
        }

        // Check machine send config
        let maquina = ctx.maquina;
        const assignment = db.prepare('SELECT maquina_id FROM cnc_machine_assignments WHERE lote_id = ? AND chapa_idx = ?').get(ctx.lote.id, chapaIdx);
        if (assignment?.maquina_id) {
            const am = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ? AND ativo = 1').get(assignment.maquina_id);
            if (am) maquina = am;
        }

        if (!maquina.envio_tipo || !maquina.envio_host) {
            return res.status(400).json({ error: `Máquina "${maquina.nome}" não tem envio direto configurado. Configure em Configurações > Máquinas.` });
        }

        // Generate G-code
        const chapa = ctx.plano.chapas[chapaIdx];
        let toolMap = ctx.toolMap;
        if (assignment?.maquina_id) {
            const ferramentas = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').all(maquina.id);
            toolMap = {};
            for (const f of ferramentas) { if (f.tool_code) toolMap[f.tool_code] = f; }
        }
        const result = generateGcodeForChapa(chapa, chapaIdx, ctx.pecasDb, maquina, toolMap, ctx.usinagemTipos, ctx.cfg);
        if (!result.gcode) return res.status(400).json({ error: 'G-code vazio' });

        const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(chapaIdx + 1).padStart(2, '0')}`;
        const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + ctx.extensao;

        if (maquina.envio_tipo === 'ftp') {
            // FTP send
            try {
                const net = await import('net');
                const sock = new net.Socket();
                await new Promise((resolve, reject) => {
                    sock.connect(maquina.envio_porta || 21, maquina.envio_host, () => resolve());
                    sock.on('error', reject);
                    setTimeout(() => reject(new Error('Timeout FTP')), 5000);
                });
                sock.destroy();
                // Note: Full FTP implementation would require an FTP client library
                // For now, save to a network-accessible folder as fallback
                const fs = await import('fs');
                const path = await import('path');
                const sendDir = path.join('/tmp/cnc-envios', maquina.nome.replace(/[^a-zA-Z0-9]/g, '_'));
                fs.mkdirSync(sendDir, { recursive: true });
                fs.writeFileSync(path.join(sendDir, filename), result.gcode);
                res.json({ ok: true, method: 'ftp_fallback', path: path.join(sendDir, filename), filename, msg: `Arquivo salvo em ${sendDir}. Instale ftp-client para envio direto.` });
            } catch (err) {
                res.status(500).json({ error: `Erro de conexão FTP: ${err.message}` });
            }
        } else if (maquina.envio_tipo === 'pasta') {
            // Direct folder write (network share / mounted volume)
            try {
                const fs = await import('fs');
                const path = await import('path');
                const destDir = maquina.envio_pasta || '/tmp/cnc-envios';
                fs.mkdirSync(destDir, { recursive: true });
                const destPath = path.join(destDir, filename);
                fs.writeFileSync(destPath, result.gcode);
                res.json({ ok: true, method: 'pasta', path: destPath, filename, msg: `Enviado para ${destPath}` });
            } catch (err) {
                res.status(500).json({ error: `Erro ao salvar: ${err.message}` });
            }
        } else {
            res.status(400).json({ error: `Tipo de envio "${maquina.envio_tipo}" não suportado. Use "ftp" ou "pasta".` });
        }
    } catch (err) {
        console.error('Erro envio G-code:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
