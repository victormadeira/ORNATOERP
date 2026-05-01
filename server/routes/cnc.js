import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import {
    MaxRectsBin, SkylineBin, GuillotineBin, ShelfBin,
    intersects, isContainedIn, pruneFreeList, clipRect, clipAndKeep, mergeFreeRects, validateGuillotineCuts,
    classifyBySize, scoreResult, scoreResultV5, verifyNoOverlaps, repairOverlaps, compactBin, clampBinBounds, finalSafetyCheck,
    runNestingPass, runFillFirst, runFillFirstV2, runIndustrialOptimizer, runTwoPhase, runStripPacking, runBRKGA, ruinAndRecreate,
    simulatedAnnealing, cascadeRemnants, crossBinGapFill, runAggressivePack, runLargeFirstGlobalFill,
    gerarSequenciaCortes, setVacuumAware, getVacuumAware, resetVacuumAware,
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

// ─── Disparar CNC webhooks configurados pelo usuário ───────────────
async function dispatchCncWebhooks(userId, evento, payload) {
    try {
        const hooks = db.prepare(
            "SELECT * FROM cnc_webhooks WHERE user_id = ? AND ativo = 1 AND (eventos = '*' OR eventos LIKE ?)"
        ).all(userId, `%${evento}%`);
        if (hooks.length === 0) return;
        const body = JSON.stringify({ evento, timestamp: new Date().toISOString(), ...payload });
        for (const hook of hooks) {
            fetch(hook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal: AbortSignal.timeout(8000),
            }).catch(e => console.error(`[CNC webhook] ${hook.url} falhou: ${e.message}`));
        }
    } catch (_) {}
}

// ─── Atualizar cnc_production_stats após lote finalizado ────────────
function updateProductionStats(loteId) {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ?').get(loteId);
        if (!lote || !lote.plano_json) return;
        let plano;
        try { plano = JSON.parse(lote.plano_json); } catch { return; }

        const chapas = plano.chapas || [];
        const pecasCount = chapas.reduce((sum, ch) => sum + (ch.pecas?.length || 0), 0);
        const metrosLineares = chapas.reduce((sum, ch) => {
            // Usa distância Euclidiana (√Δx²+Δy²) — não Manhattan — para cortes diagonais
            return sum + (ch.cortes || []).reduce((s2, c) => {
                const dx = (c.x2 ?? 0) - (c.x ?? 0);
                const dy = (c.y2 ?? 0) - (c.y ?? 0);
                return s2 + Math.sqrt(dx * dx + dy * dy) / 1000;
            }, 0);
        }, 0);
        const aprovMedio = chapas.length > 0
            ? chapas.reduce((sum, ch) => sum + (ch.aproveitamento || 0), 0) / chapas.length
            : 0;

        // Custo: chapas × preço por chapa (se disponível)
        const custoMaterial = chapas.reduce((sum, ch) => sum + (ch.preco || 0), 0);

        const periodo = new Date().toISOString().slice(0, 7); // YYYY-MM
        db.prepare(`
            INSERT INTO cnc_production_stats (periodo, tipo_periodo, chapas_cortadas, pecas_produzidas,
                metros_lineares, aproveitamento_medio, custo_material, lotes_count)
            VALUES (?, 'mensal', ?, ?, ?, ?, ?, 1)
            ON CONFLICT(periodo, tipo_periodo) DO UPDATE SET
                chapas_cortadas = chapas_cortadas + excluded.chapas_cortadas,
                pecas_produzidas = pecas_produzidas + excluded.pecas_produzidas,
                metros_lineares = metros_lineares + excluded.metros_lineares,
                aproveitamento_medio = (aproveitamento_medio * lotes_count + excluded.aproveitamento_medio) / (lotes_count + 1),
                lotes_count = lotes_count + 1,
                custo_material = custo_material + excluded.custo_material,
                atualizado_em = CURRENT_TIMESTAMP
        `).run(periodo, chapas.length, pecasCount, Math.round(metrosLineares * 100) / 100, Math.round(aprovMedio * 100) / 100, custoMaterial);
    } catch (e) {
        console.error('[CNC stats] Erro ao atualizar stats:', e.message);
    }
}

// ─── Verificar alerta de manutenção após atualizar desgaste ─────────
function checkToolMaintenanceAlert(toolId, userId) {
    try {
        const tool = db.prepare('SELECT * FROM cnc_ferramentas WHERE id = ?').get(toolId);
        if (!tool || !tool.metros_limite || tool.metros_limite <= 0) return;
        const pct = (tool.metros_acumulados || 0) / tool.metros_limite;
        // Alertas em 80% e 100%
        if (pct >= 1.0) {
            notifyCNC(db, userId, 'ferramenta_limite',
                `⚠️ Ferramenta ${tool.codigo} no limite`,
                `${tool.nome || tool.codigo} atingiu ${Math.round(pct * 100)}% do limite de desgaste (${tool.metros_acumulados?.toFixed(0)}m / ${tool.metros_limite}m). Substitua antes de usar.`,
                toolId, 'cnc_ferramenta');
        } else if (pct >= 0.8) {
            // Só notifica 1x ao atingir 80% (evita spam — verifica última notificação)
            const ultimaNotif = db.prepare(
                "SELECT id FROM notificacoes WHERE referencia_id = ? AND referencia_tipo = 'cnc_ferramenta' AND tipo = 'ferramenta_alerta' AND criado_em > datetime('now', '-1 day')"
            ).get(toolId);
            if (!ultimaNotif) {
                notifyCNC(db, userId, 'ferramenta_alerta',
                    `🔧 Ferramenta ${tool.codigo} com ${Math.round(pct * 100)}% de desgaste`,
                    `${tool.nome || tool.codigo} está em ${Math.round(pct * 100)}% do limite (${tool.metros_acumulados?.toFixed(0)}m / ${tool.metros_limite}m). Planeje substituição.`,
                    toolId, 'cnc_ferramenta');
            }
        }
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

// Inferir tipo/diâmetro de ferramenta a partir do tool_code WPS
function _inferToolFromCode(tc) {
    // Padrões comuns: f_8mm_xxx → broca 8mm, p_3mm → broca 3mm, r_xxx → fresa
    const diamMatch = tc.match(/(\d+(?:\.\d+)?)mm/i);
    const diametro = diamMatch ? parseFloat(diamMatch[1]) : 6;

    let tipo = 'broca';
    let tipo_corte = 'broca';
    let nome = tc;

    if (tc.startsWith('f_') || tc.startsWith('p_')) {
        tipo = 'broca'; tipo_corte = 'broca';
        nome = `Broca ${diametro}mm (${tc})`;
    } else if (tc.startsWith('r_') || tc.startsWith('rb_')) {
        tipo = 'fresa'; tipo_corte = 'fresa_reta';
        nome = `Fresa ${diametro}mm (${tc})`;
    } else if (tc.includes('usi') || tc.includes('chanfro') || tc.includes('fresa')) {
        tipo = 'fresa'; tipo_corte = 'fresa_reta';
        nome = `Fresa ${diametro}mm (${tc})`;
    }

    return { nome, tipo, diametro, tipo_corte };
}

// Sanitiza strings vindas do plugin: remove tags HTML e limita tamanho
function sanitizePluginStr(val, maxLen = 200) {
    if (val == null) return '';
    return String(val)
        .replace(/<[^>]*>/g, '') // strip HTML tags (XSS stored prevention)
        .replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
        .trim()
        .slice(0, maxLen);
}

export function parsePluginJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const details = data.details_project || {};
    const machining = data.machining || {};
    const entities = data.model_entities || {};

    const loteInfo = {
        cliente: sanitizePluginStr(details.client_name || details.cliente || details.client || ''),
        projeto: sanitizePluginStr(details.project_name || details.projeto || details.project || ''),
        codigo: sanitizePluginStr(details.project_code || details.codigo || details.my_code || '', 50),
        vendedor: sanitizePluginStr(details.seller_name || details.vendedor || details.seller || ''),
    };

    const pecas = [];

    // Iterate model_entities — each index is a module
    for (const modIdx of Object.keys(entities)) {
        const modulo = entities[modIdx];
        if (!modulo || !modulo.entities) continue;

        // Coletar todas as entidades com upmpiece=true, incluindo sub-entidades aninhadas
        // Ex: Porta de giro (sem upmpiece) → Chapa porta vertical (upmpiece=true, nível 3)
        const collectPieces = (parentEntities, parentCtx) => {
            const result = [];
            for (const idx of Object.keys(parentEntities)) {
                const e = parentEntities[idx];
                if (!e) continue;
                if (e.upmpiece) {
                    result.push({ ent: e, ctx: parentCtx });
                } else if (e.entities) {
                    // Descer recursivamente para encontrar sub-peças
                    result.push(...collectPieces(e.entities, { ...parentCtx, parentDesc: e.upmdescription || parentCtx.parentDesc }));
                }
            }
            return result;
        };
        const allPieces = collectPieces(modulo.entities, { parentDesc: modulo.upmdescription || '' });

        for (const { ent, ctx } of allPieces) {

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

            // Extract dimensions — busca recursiva pelo painel de matéria-prima (upmfeedstockpanel)
            let panelFound = false;
            const findPanel = (ents) => {
                if (!ents || panelFound) return;
                for (const subIdx of Object.keys(ents)) {
                    const sub = ents[subIdx];
                    if (!sub) continue;
                    if (sub.upmfeedstockpanel) {
                        peca.material_code = sub.upmmaterialcode || sub.upmcode || '';
                        peca.material = sub.upmdescription || sub.upmmaterialcode || '';
                        peca.espessura = sub.upmcutthickness || sub.upmrealthickness || sub.upmthickness || 0;
                        peca.comprimento = sub.upmcutlength || sub.upmlength || 0;
                        peca.largura = sub.upmcutwidth || sub.upmwidth || 0;
                        panelFound = true;
                        return;
                    }
                    if (sub.entities) findPanel(sub.entities);
                }
            };
            if (ent.entities) findPanel(ent.entities);

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
                // Sanitizar workers: remover campos com objetos SketchUp serializados
                // e normalizar nomes de campos WPS → Ornato
                if (machData.workers) {
                    const sanitizedWorkers = {};
                    for (const [wk, w] of Object.entries(machData.workers)) {
                        if (!w || typeof w !== 'object') continue;
                        const clean = {};
                        for (const [k, v] of Object.entries(w)) {
                            // Pular campos com objetos SketchUp serializados
                            if (typeof v === 'string' && v.includes('#<Sketchup::')) continue;
                            if (typeof v === 'string' && v.includes('#<Geom::')) continue;
                            clean[k] = v;
                        }
                        // Normalizar campos WPS → Ornato
                        if (clean.position_x !== undefined && clean.x === undefined) clean.x = clean.position_x;
                        if (clean.position_y !== undefined && clean.y === undefined) clean.y = clean.position_y;
                        if (clean.position_z !== undefined && clean.z === undefined) clean.z = clean.position_z;
                        if (clean.quadrant && !clean.face) clean.face = clean.quadrant;
                        if (clean.cornerradius !== undefined && clean.corner_radius === undefined) clean.corner_radius = clean.cornerradius;
                        if (clean.usedepth && (!clean.depth || clean.depth === 0)) clean.depth = clean.usedepth;
                        if (clean.width_tool && !clean.diameter) clean.diameter = clean.width_tool;
                        if (clean.width_line && !clean.width) clean.width = clean.width_line;

                        // Parsear pointinsert WPS: "(150 mm, 0 mm, 0 mm)" ou "(46,736845 mm, 0,213878 mm, 0 mm)"
                        if (clean.pointinsert && typeof clean.pointinsert === 'string' && clean.x == null) {
                            const piMatch = clean.pointinsert.replace(/,(\d)/g, '.$1').match(/\(?\s*([-\d.]+)\s*mm\s*,\s*([-\d.]+)\s*mm\s*,\s*([-\d.]+)\s*mm/);
                            if (piMatch) {
                                clean.x = parseFloat(piMatch[1]);
                                clean.y = parseFloat(piMatch[2]);
                                clean.z = parseFloat(piMatch[3]);
                            }
                        }

                        // Parsear positions dict para usi_line/usi_point_to_point → path array
                        if (clean.positions && typeof clean.positions === 'object' && !Array.isArray(clean.positions)) {
                            const keys = Object.keys(clean.positions).sort((a, b) => Number(a) - Number(b));
                            clean.path = keys.map(k => {
                                const pt = clean.positions[k];
                                if (Array.isArray(pt) && pt.length >= 2) return { x: pt[0], y: pt[1], z: pt[2] || 0 };
                                return null;
                            }).filter(Boolean);
                            // Usar primeiro ponto como x/y se não definido
                            if (clean.path.length > 0 && (clean.x == null || (clean.x === 0 && clean.y === 0))) {
                                clean.x = clean.path[0].x;
                                clean.y = clean.path[0].y;
                            }
                        }

                        // Marcar operações de borda (furação horizontal)
                        const faceLower = (clean.face || '').toLowerCase();
                        if (['left', 'right', 'front', 'rear', 'back'].includes(faceLower)) {
                            clean.is_edge_operation = true;
                            clean.edge_face = faceLower;
                            // SketchUp convention: "left" = face at x=LENGTH (drill enters from right, direction -X)
                            //                     "right" = face at x=0 (drill enters from left, direction +X)
                            if (faceLower === 'left') {
                                clean.drill_direction = '-X';
                                clean.visual_side = 'right'; // Visual side in top-down view
                            } else if (faceLower === 'right') {
                                clean.drill_direction = '+X';
                                clean.visual_side = 'left';
                            }
                        }

                        sanitizedWorkers[wk] = clean;
                    }

                    // ═══ DEDUPLICAÇÃO: remover workers duplicados (bug do plugin SketchUp) ═══
                    // O plugin às vezes exporta o mesmo worker 2x (grupo pai + filho)
                    // Fingerprint: posição + face + ferramenta + diâmetro + profundidade
                    const seen = new Set();
                    const dedupedWorkers = {};
                    for (const [wk, w] of Object.entries(sanitizedWorkers)) {
                        const wx = Math.round((Number(w.x ?? w.position_x ?? -999)) * 100);
                        const wy = Math.round((Number(w.y ?? w.position_y ?? -999)) * 100);
                        const wz = Math.round((Number(w.z ?? w.position_z ?? -999)) * 100);
                        const fp = `${wx}|${wy}|${wz}|${(w.face || '').toLowerCase()}|${w.tool_code || w.tool || ''}|${w.diameter || 0}|${Math.round((w.depth || 0) * 100)}`;
                        if (seen.has(fp)) {
                            // Worker duplicado — descartar
                            continue;
                        }
                        seen.add(fp);

                        // ═══ TRANSFER_MILLING / SAW_CUT sem posição: marcar como operação de caminho ═══
                        // Estes workers têm position=None mas coordenadas em pos_start_for_line, pos_corners, etc.
                        const cat = (w.category || '').toLowerCase();
                        if ((cat.includes('transfer_milling') || cat.includes('transfer_vertical_saw_cut')) && w.x == null && w.position_x == null) {
                            // Tentar extrair posição de campos alternativos
                            if (w.pos_start_for_line) {
                                w.x = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
                                w.y = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
                            } else if (w.pos_corners && typeof w.pos_corners === 'object') {
                                const corners = Object.values(w.pos_corners);
                                if (corners.length > 0 && Array.isArray(corners[0])) {
                                    w.x = corners[0][0] || 0;
                                    w.y = corners[0][1] || 0;
                                }
                            }
                            // Se ainda sem posição, marcar como fantasma (não renderizar como furo)
                            if (w.x == null && !w.path) {
                                w._no_position = true;
                            }
                        }

                        dedupedWorkers[wk] = w;
                    }
                    machData.workers = dedupedWorkers;
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

// ─── Auto-select lado ativo baseado na complexidade de usinagem ──
// Analisa os workers de cada lado e retorna 'A' ou 'B'
function autoSelectLadoAtivo(machiningJson) {
    try {
        const mach = typeof machiningJson === 'string' ? JSON.parse(machiningJson || '{}') : (machiningJson || {});
        const workers = mach.workers
            ? (Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers))
            : [];

        if (workers.length === 0) return 'A';

        // Peso por tipo de operação
        const getWeight = (w) => {
            const cat = (w.category || '').toLowerCase();
            const diam = w.diameter || 0;
            const tc = (w.tool_code || w.tool || '').toLowerCase();

            if (cat.includes('contour') || cat.includes('contorno') || tc.includes('contorno')) return 5;
            if (cat.includes('rebaixo') || cat.includes('pocket') || tc.includes('rb_') || tc.includes('pocket')) return 4;
            if (cat.includes('groove') || cat.includes('rasgo') || cat.includes('saw_cut') || tc.includes('r_f')) return 3;
            if (diam >= 35) return 2; // Dobradiça 35mm — pode ser feita com gabarito
            if (cat.includes('hole') || cat.includes('transfer')) return 1;
            return 1;
        };

        // Determinar lado de cada worker
        let scoreA = 0, scoreB = 0;
        for (const w of workers) {
            const face = (w.face || w.quadrant || '').toLowerCase();
            const side = (w.side || '').toLowerCase();
            const weight = getWeight(w);

            // Operações de borda não contam para nenhum lado
            if (w.is_edge_operation) continue;
            if (['left', 'right', 'front', 'rear', 'back'].includes(face)) continue;

            if (face === 'top' || face === 'side_a' || side === 'side_a') {
                scoreA += weight;
            } else if (face === 'bottom' || face === 'side_b' || side === 'side_b') {
                scoreB += weight;
            } else {
                // Sem face definida — assume lado A
                scoreA += weight;
            }
        }

        // Se lado B tem mais complexidade, ele deve ficar para cima na CNC
        return scoreB > scoreA ? 'B' : 'A';
    } catch {
        return 'A';
    }
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

        // Auto-select lado_ativo para cada peça baseado na complexidade de usinagem
        const updateLado = db.prepare('UPDATE cnc_pecas SET lado_ativo = ? WHERE lote_id = ? AND persistent_id = ?');
        for (const p of pecas) {
            if (p.machining_json && p.machining_json !== '{}') {
                const lado = autoSelectLadoAtivo(p.machining_json);
                if (lado !== 'A') { // Só atualiza se for B (default já é A)
                    updateLado.run(lado, loteId, p.persistent_id);
                }
            }
        }

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

        // Auto-registrar ferramentas WPS que não existem no sistema
        try {
            const toolCodesInLote = new Set();
            for (const p of pecas) {
                try {
                    const mj = JSON.parse(p.machining_json || '{}');
                    const wArr = mj.workers ? (Array.isArray(mj.workers) ? mj.workers : Object.values(mj.workers)) : [];
                    for (const w of wArr) {
                        const tc = w.tool_code || w.tool || '';
                        if (tc) toolCodesInLote.add(tc);
                    }
                } catch (_) {}
            }

            if (toolCodesInLote.size > 0) {
                // Buscar máquina padrão do usuário
                const maquina = db.prepare('SELECT id FROM cnc_maquinas WHERE user_id = ? ORDER BY id ASC LIMIT 1').get(req.user.id);
                const maquinaId = maquina?.id || null;

                const existingTools = db.prepare(
                    `SELECT tool_code FROM cnc_ferramentas WHERE user_id = ? AND tool_code IN (${[...toolCodesInLote].map(() => '?').join(',')})`
                ).all(req.user.id, ...toolCodesInLote);
                const existingSet = new Set(existingTools.map(t => t.tool_code));

                // Mapeamento inteligente de tool_code WPS → tipo/diâmetro
                const WPS_TOOL_MAP = {
                    'f_15mm_tambor_min': { nome: 'Broca 15mm (minifix)', tipo: 'broca', diametro: 15, tipo_corte: 'broca' },
                    'f_15mm_uniblock':  { nome: 'Broca 15mm (uniblock)', tipo: 'broca', diametro: 15, tipo_corte: 'broca' },
                    'f_35mm_dob':       { nome: 'Broca 35mm (dobradiça)', tipo: 'broca', diametro: 35, tipo_corte: 'broca_forstner' },
                    'f_8mm_cavilha':    { nome: 'Broca 8mm (cavilha)', tipo: 'broca', diametro: 8, tipo_corte: 'broca' },
                    'f_8mm_eixo_tambor_min': { nome: 'Broca 8mm (eixo minifix)', tipo: 'broca', diametro: 8, tipo_corte: 'broca' },
                    'f_8mm':            { nome: 'Broca 8mm', tipo: 'broca', diametro: 8, tipo_corte: 'broca' },
                    'f_5mm_twister243': { nome: 'Broca 5mm (twister)', tipo: 'broca', diametro: 5, tipo_corte: 'broca' },
                    'f_3mm':            { nome: 'Broca 3mm', tipo: 'broca', diametro: 3, tipo_corte: 'broca' },
                    'p_3mm':            { nome: 'Broca 3mm (prateleira)', tipo: 'broca', diametro: 3, tipo_corte: 'broca' },
                    'p_8mm_cavilha':    { nome: 'Broca 8mm (cavilha prat.)', tipo: 'broca', diametro: 8, tipo_corte: 'broca' },
                    'p_12mm':           { nome: 'Broca 12mm', tipo: 'broca', diametro: 12, tipo_corte: 'broca' },
                    'r_f':              { nome: 'Fresa rasgo fundo', tipo: 'fresa', diametro: 3.5, tipo_corte: 'fresa_reta' },
                    'rb_av':            { nome: 'Fresa rebaixo avesso', tipo: 'fresa', diametro: 6, tipo_corte: 'fresa_reta' },
                    'usi_line':         { nome: 'Fresa contorno', tipo: 'fresa', diametro: 6, tipo_corte: 'fresa_compressao' },
                    'usi_point_to_point': { nome: 'Fresa ponto-a-ponto', tipo: 'fresa', diametro: 6, tipo_corte: 'fresa_reta' },
                    'chanfro_45':       { nome: 'Fresa chanfro 45°', tipo: 'fresa', diametro: 45, tipo_corte: 'fresa_chanfro' },
                };

                const insertTool = db.prepare(`
                    INSERT INTO cnc_ferramentas (user_id, maquina_id, codigo, nome, tipo, diametro, tool_code, tipo_corte, ativo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                `);

                let autoCreated = 0;
                for (const tc of toolCodesInLote) {
                    if (existingSet.has(tc)) continue;
                    const info = WPS_TOOL_MAP[tc] || _inferToolFromCode(tc);
                    const tNum = String(autoCreated + 20).padStart(2, '0');
                    insertTool.run(
                        req.user.id, maquinaId, `T${tNum}`, info.nome,
                        info.tipo, info.diametro, tc, info.tipo_corte
                    );
                    autoCreated++;
                }
                if (autoCreated > 0) {
                    console.log(`  [CNC Import] Auto-registradas ${autoCreated} ferramentas WPS para o lote ${loteId}`);
                }
            }
        } catch (toolErr) {
            console.warn('Aviso: falha ao auto-registrar ferramentas:', toolErr.message);
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

// ── Verificar materiais não cadastrados de um JSON ──────
router.post('/chapas/verificar-materiais', requireAuth, (req, res) => {
    try {
        const { materiais } = req.body; // [{ material_code, espessura }]
        if (!Array.isArray(materiais)) return res.status(400).json({ error: 'materiais deve ser array' });

        const cadastrados = [];
        const nao_cadastrados = [];

        for (const mat of materiais) {
            const mc = mat.material_code || '';
            const esp = mat.espessura || 0;
            if (!mc) continue;

            // 1. Match exato por material_code
            let chapaExata = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(mc);

            // 2. Se não achou, buscar por ALIAS
            if (!chapaExata) {
                const alias = db.prepare('SELECT chapa_id FROM cnc_chapa_aliases WHERE user_id = ? AND material_code_importado = ?').get(req.user.id, mc);
                if (alias) {
                    chapaExata = db.prepare('SELECT * FROM cnc_chapas WHERE id = ? AND ativo = 1').get(alias.chapa_id);
                }
            }

            if (chapaExata) {
                cadastrados.push({ material_code: mc, espessura: esp, chapa_nome: chapaExata.nome, chapa_id: chapaExata.id, match_type: 'exato' });
            } else {
                // Verificar se existe fallback (para informar o usuário)
                const chapaFallback = esp ? db.prepare('SELECT * FROM cnc_chapas WHERE ABS(espessura_real - ?) <= 1.0 AND ativo = 1 ORDER BY ABS(espessura_real - ?) ASC LIMIT 1').get(esp, esp) : null;
                // Inferir defaults inteligentes pelo nome do material
                const upper = mc.toUpperCase();
                const temVeio = upper.includes('CARVALHO') || upper.includes('FREIJO') || upper.includes('NOGUEIRA') ||
                    upper.includes('AREAL') || upper.includes('FENDI') || upper.includes('CANELA') || upper.includes('ROVERE') ||
                    upper.includes('NOGAL') || upper.includes('TECA') || upper.includes('CASTANHO') || upper.includes('TABACO') ||
                    upper.includes('TITANIO') || upper.includes('TRAMA');
                const veio = temVeio ? 'com_veio' : 'sem_veio';
                const direcao = temVeio ? 'horizontal' : 'misto';

                // Copiar dimensões da chapa fallback se existir (mesma espessura, outro material)
                const baseChapa = chapaFallback || {};

                nao_cadastrados.push({
                    material_code: mc, espessura: esp,
                    fallback_chapa: chapaFallback ? { nome: chapaFallback.nome, id: chapaFallback.id } : null,
                    sugestao: {
                        nome: mc.replace(/_/g, ' '),
                        material_code: mc,
                        espessura_nominal: esp ? Math.floor(esp) : 18,
                        espessura_real: baseChapa.espessura_real || (esp ? Math.floor(esp) : 18),
                        comprimento: baseChapa.comprimento || 2750,
                        largura: baseChapa.largura || 1850,
                        refilo: baseChapa.refilo || 10,
                        veio, direcao_corte: direcao, modo_corte: 'herdar',
                        preco: baseChapa.preco || 0,
                    },
                });
            }
        }

        res.json({ cadastrados, nao_cadastrados });
    } catch (err) {
        console.error('Erro ao verificar materiais:', err);
        res.status(500).json({ error: 'Erro ao verificar materiais' });
    }
});

// ── Cadastro rápido de múltiplas chapas (bulk) ──────────
router.post('/chapas/bulk', requireAuth, (req, res) => {
    try {
        const { chapas } = req.body;
        if (!Array.isArray(chapas)) return res.status(400).json({ error: 'chapas deve ser array' });

        const insert = db.prepare(`INSERT INTO cnc_chapas (user_id, nome, material_code, espessura_nominal, espessura_real,
            comprimento, largura, refilo, veio, preco, kerf, direcao_corte, modo_corte)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

        const created = [];
        const insertAll = db.transaction((items) => {
            for (const c of items) {
                const r = insert.run(req.user.id, c.nome || c.material_code, c.material_code || '',
                    c.espessura_nominal || 18, c.espessura_real || 18.5,
                    c.comprimento || 2750, c.largura || 1850, c.refilo || 10,
                    c.veio || 'sem_veio', c.preco || 0, c.kerf ?? 4,
                    c.direcao_corte || 'herdar', c.modo_corte || 'herdar');
                created.push({ id: Number(r.lastInsertRowid), nome: c.nome, material_code: c.material_code });
            }
        });
        insertAll(chapas);

        res.json({ ok: true, created, total: created.length });
    } catch (err) {
        console.error('Erro ao criar chapas em lote:', err);
        res.status(500).json({ error: 'Erro ao criar chapas' });
    }
});

// ── Scan público (expedição via QR) ────────────────────────────
// Apenas tokens longos (persistent_id, upmcode) são aceitos — IDs sequenciais
// e formato #NNN ficam exclusivos da rota autenticada /expedicao/scan, para
// impedir enumeração da base de peças. Rate limit aplicado em index.js.
router.get('/scan/:codigo', (req, res) => {
    const codigo = String(req.params.codigo || '').trim();
    // Mínimo de 8 caracteres não-numéricos puros: bloqueia "#1", "1", etc.
    if (codigo.length < 8 || /^#?\d+$/.test(codigo)) {
        return res.status(404).json({ error: 'Peça não encontrada' });
    }
    let peca = db.prepare('SELECT * FROM cnc_pecas WHERE persistent_id = ?').get(codigo);
    if (!peca) peca = db.prepare('SELECT * FROM cnc_pecas WHERE upmcode = ?').get(codigo);
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
        const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        const assignments = db.prepare(`
            SELECT a.chapa_idx, a.maquina_id, m.nome as maquina_nome
            FROM cnc_machine_assignments a
            LEFT JOIN cnc_maquinas m ON a.maquina_id = m.id
            WHERE a.lote_id = ?
            ORDER BY a.chapa_idx
        `).all(lote.id);
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
    const { page, limit, status, search } = req.query;
    let sql = 'SELECT * FROM cnc_lotes WHERE user_id = ?';
    const params = [req.user.id];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (search) { sql += ' AND (nome LIKE ? OR id = ?)'; params.push(`%${search}%`, search); }
    // Ordenação: prioridade alta primeiro, depois por prazo (atrasados > urgentes > sem prazo), depois por criação
    sql += ` ORDER BY
        CASE WHEN status = 'concluido' THEN 1 ELSE 0 END ASC,
        COALESCE(prioridade, 0) DESC,
        CASE WHEN data_entrega IS NOT NULL AND data_entrega < date('now') AND status != 'concluido' THEN 0
             WHEN data_entrega IS NOT NULL AND data_entrega <= date('now', '+3 days') AND status != 'concluido' THEN 1
             WHEN data_entrega IS NOT NULL THEN 2
             ELSE 3 END ASC,
        COALESCE(data_entrega, '9999-12-31') ASC,
        criado_em DESC`;
    // Paginação opcional (#24)
    if (page && limit) {
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const { total } = db.prepare(countSql).get(...params);
        const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
        sql += ' LIMIT ? OFFSET ?';
        params.push(Number(limit), offset);
        const lotes = db.prepare(sql).all(...params);
        return res.json({ lotes, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) });
    }
    const lotes = db.prepare(sql).all(...params);
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

// Atualizar metadados de um lote (nome, cliente, data_entrega, prioridade, observacoes)
router.put('/lotes/:id', requireAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(id, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const { nome, cliente, projeto, data_entrega, prioridade, observacoes } = req.body;

        // Validações de entrada
        if (nome !== undefined && typeof nome === 'string' && !nome.trim()) {
            return res.status(400).json({ error: 'Nome não pode ser vazio' });
        }
        if (data_entrega && !/^\d{4}-\d{2}-\d{2}$/.test(data_entrega)) {
            return res.status(400).json({ error: 'data_entrega deve estar no formato YYYY-MM-DD' });
        }
        if (prioridade !== undefined && ![0, 1, 2].includes(Number(prioridade))) {
            return res.status(400).json({ error: 'prioridade deve ser 0 (Normal), 1 (Alta) ou 2 (Urgente)' });
        }

        const sets = [];
        const vals = [];
        if (nome !== undefined) { sets.push('nome=?'); vals.push(nome.trim()); }
        if (cliente !== undefined) { sets.push('cliente=?'); vals.push(cliente); }
        if (projeto !== undefined) { sets.push('projeto=?'); vals.push(projeto); }
        if (data_entrega !== undefined) { sets.push('data_entrega=?'); vals.push(data_entrega || null); }
        if (prioridade !== undefined) { sets.push('prioridade=?'); vals.push(Number(prioridade) || 0); }
        if (observacoes !== undefined) { sets.push('observacoes=?'); vals.push(observacoes); }

        if (sets.length > 0) {
            sets.push('atualizado_em=CURRENT_TIMESTAMP');
            vals.push(id);
            db.prepare(`UPDATE cnc_lotes SET ${sets.join(', ')} WHERE id=?`).run(...vals);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Erro ao atualizar lote:', err);
        res.status(500).json({ error: 'Erro ao atualizar lote' });
    }
});

router.delete('/lotes/:id', requireAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(id, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        db.exec('PRAGMA foreign_keys = OFF');
        try {
            db.prepare('DELETE FROM cnc_lotes WHERE id = ?').run(id);
        } finally {
            db.exec('PRAGMA foreign_keys = ON');
        }
        res.json({ ok: true });
    } catch (err) {
        try { db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}
        console.error('Erro ao excluir lote:', err);
        res.status(500).json({ error: 'Erro ao excluir lote: ' + err.message });
    }
});

router.get('/pecas/:loteId', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(lote.id);
    // Sanitize old machining data on-the-fly for consistent frontend rendering
    const needsUpdate = [];
    for (const p of pecas) {
        if (!p.machining_json || p.machining_json.length < 20) continue;
        // Trigger: dados antigos (position_x, Sketchup) OU dados sem deduplicação (_deduped flag)
        const needsSanitize = p.machining_json.includes('position_x') || p.machining_json.includes('#<Sketchup') || !p.machining_json.includes('"_deduped"');
        if (!needsSanitize) continue;
        try {
            const mach = JSON.parse(p.machining_json);
            if (!mach.workers) continue;
            let changed = false;
            const workers = typeof mach.workers === 'object' && !Array.isArray(mach.workers)
                ? mach.workers : null;
            if (!workers) continue;
            for (const [wk, w] of Object.entries(workers)) {
                if (!w || typeof w !== 'object') continue;
                // Remove Sketchup serialized objects
                for (const [k, v] of Object.entries(w)) {
                    if (typeof v === 'string' && (v.includes('#<Sketchup::') || v.includes('#<Geom::'))) {
                        delete w[k]; changed = true;
                    }
                }
                // Normalize field names
                if (w.position_x !== undefined && w.x === undefined) { w.x = w.position_x; changed = true; }
                if (w.position_y !== undefined && w.y === undefined) { w.y = w.position_y; changed = true; }
                if (w.position_z !== undefined && w.z === undefined) { w.z = w.position_z; changed = true; }
                if (w.quadrant && !w.face) { w.face = w.quadrant; changed = true; }
                if (w.width_tool && !w.diameter) { w.diameter = w.width_tool; changed = true; }
                if (w.width_line && !w.width) { w.width = w.width_line; changed = true; }
                if (w.usedepth && (!w.depth || w.depth === 0)) { w.depth = w.usedepth; changed = true; }
                // Mark edge operations
                const faceLower = (w.face || '').toLowerCase();
                if (['left', 'right', 'front', 'rear', 'back'].includes(faceLower) && !w.is_edge_operation) {
                    w.is_edge_operation = true; w.edge_face = faceLower; changed = true;
                }
                // SketchUp LEFT/RIGHT convention normalization
                if (faceLower === 'left' && !w.visual_side) {
                    w.drill_direction = '-X'; w.visual_side = 'right'; changed = true;
                } else if (faceLower === 'right' && !w.visual_side) {
                    w.drill_direction = '+X'; w.visual_side = 'left'; changed = true;
                }
                // Transfer_milling sem posição: extrair de campos alternativos
                const cat = (w.category || '').toLowerCase();
                if ((cat.includes('transfer_milling') || cat.includes('transfer_vertical_saw_cut')) && w.x == null && w.position_x == null) {
                    if (w.pos_start_for_line) {
                        w.x = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
                        w.y = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
                        changed = true;
                    } else if (w.pos_corners && typeof w.pos_corners === 'object') {
                        const corners = Object.values(w.pos_corners);
                        if (corners.length > 0 && Array.isArray(corners[0])) {
                            w.x = corners[0][0] || 0; w.y = corners[0][1] || 0; changed = true;
                        }
                    }
                    if (w.x == null && !w.path) { w._no_position = true; changed = true; }
                }
            }
            // Remove top-level Sketchup fields
            for (const [k, v] of Object.entries(mach)) {
                if (typeof v === 'string' && (v.includes('#<Sketchup::') || v.includes('#<Geom::'))) {
                    delete mach[k]; changed = true;
                }
            }
            // ═══ Deduplicação: remover workers duplicados (bug do plugin SketchUp) ═══
            if (!mach._deduped) {
                const seen = new Set();
                const originalCount = Object.keys(workers).length;
                for (const [wk, w] of Object.entries(workers)) {
                    const wx = Math.round((Number(w.x ?? w.position_x ?? -999)) * 100);
                    const wy = Math.round((Number(w.y ?? w.position_y ?? -999)) * 100);
                    const wz = Math.round((Number(w.z ?? w.position_z ?? -999)) * 100);
                    const fp = `${wx}|${wy}|${wz}|${(w.face || '').toLowerCase()}|${w.tool_code || w.tool || ''}|${w.diameter || 0}|${Math.round((w.depth || 0) * 100)}`;
                    if (seen.has(fp)) { delete workers[wk]; changed = true; continue; }
                    seen.add(fp);
                }
                mach._deduped = true; changed = true;
            }
            if (changed) {
                const sanitized = JSON.stringify(mach);
                p.machining_json = sanitized;
                needsUpdate.push({ id: p.id, json: sanitized });
            }
        } catch { /* skip malformed JSON */ }
    }
    // Persist sanitized data back to DB (lazy migration)
    if (needsUpdate.length > 0) {
        const stmt = db.prepare('UPDATE cnc_pecas SET machining_json = ? WHERE id = ?');
        const tx = db.transaction(() => { for (const u of needsUpdate) stmt.run(u.json, u.id); });
        try { tx(); } catch { /* ignore write errors */ }
    }
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

        const comp = Number(comprimento);
        const larg = Number(largura);
        if (!comp || !larg || comp <= 0 || larg <= 0) return res.status(400).json({ error: 'Comprimento e largura devem ser maiores que zero' });
        if (comp > 5000 || larg > 3000) return res.status(400).json({ error: 'Dimensões excedem o limite máximo (5000 × 3000mm)' });

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
            comp, larg, Math.max(1, Math.round(Number(quantidade) || 1)),
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

// ═══ Preview de Retalhos para Otimização (simulação rápida) ═══
router.get('/retalhos-preview/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        if (pecas.length === 0) return res.json({ grupos: [] });

        const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get() || {};
        const kerfPadrao = config.kerf_padrao || 4;
        const spacing = config.espaco_pecas || 4;

        // Alias map
        const aliasMap = {};
        try {
            const aliases = db.prepare('SELECT material_code_importado, chapa_id FROM cnc_chapa_aliases WHERE user_id = ?').all(req.user.id);
            for (const a of aliases) aliasMap[a.material_code_importado] = a.chapa_id;
        } catch (_) {}

        // Group pieces by material (same logic as optimizer)
        const groups = {};
        for (const p of pecas) {
            let esp = p.espessura || 0;
            if (!esp && p.material_code) { const m = p.material_code.match(/_(\d+(?:\.\d+)?)_/); if (m) esp = parseFloat(m[1]); }
            let chapa = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(p.material_code);
            if (!chapa && aliasMap[p.material_code]) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE id = ? AND ativo = 1').get(aliasMap[p.material_code]);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ABS(espessura_real - ?) <= 1.0 AND ativo = 1 ORDER BY ABS(espessura_real - ?) ASC LIMIT 1').get(esp, esp);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE espessura_nominal = ? AND ativo = 1').get(esp);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();
            const chapaKey = chapa ? `${chapa.material_code}__${chapa.espessura_real}` : `fallback__${esp}`;
            if (!groups[chapaKey]) groups[chapaKey] = { material_code: chapa?.material_code || p.material_code, espessura: chapa?.espessura_real || esp, chapa: chapa, pieces: [] };
            groups[chapaKey].pieces.push(p);
        }

        // For each material group, find available retalhos and run quick simulation
        const resultado = [];
        for (const [groupKey, group] of Object.entries(groups)) {
            const chapa = group.chapa;
            if (!chapa) continue;

            const retalhosDisp = db.prepare(
                'SELECT * FROM cnc_retalhos WHERE material_code = ? AND ABS(espessura_real - ?) <= 1.0 AND disponivel = 1 ORDER BY comprimento * largura DESC'
            ).all(group.material_code, group.espessura);

            if (retalhosDisp.length === 0) {
                resultado.push({
                    groupKey,
                    material_code: group.material_code,
                    material_nome: chapa.nome || group.material_code,
                    espessura: group.espessura,
                    total_pecas: group.pieces.reduce((s, p) => s + (p.quantidade || 1), 0),
                    retalhos: [],
                });
                continue;
            }

            // Expand pieces for simulation
            const kerf = chapa.kerf || kerfPadrao;
            const expanded = [];
            for (const p of group.pieces) {
                for (let q = 0; q < (p.quantidade || 1); q++) {
                    expanded.push({
                        ref: { pecaId: p.id, instancia: q },
                        w: p.comprimento, h: p.largura,
                        allowRotate: true,
                        area: p.comprimento * p.largura,
                        perim: 2 * (p.comprimento + p.largura),
                        maxSide: Math.max(p.comprimento, p.largura),
                        diff: Math.abs(p.comprimento - p.largura),
                        classificacao: 'normal',
                    });
                }
            }

            // Quick simulation for each retalho
            const retalhosInfo = [];
            for (const ret of retalhosDisp) {
                const retW = ret.comprimento, retH = ret.largura;
                // Quick nesting: try to fit pieces into this retalho
                const bins = runNestingPass(
                    [...expanded].sort((a, b) => b.area - a.area),
                    retW, retH, spacing, 'BSSF', 'maxrects', kerf, 'auto'
                );
                const pecasColocadas = bins.length === 1 ? bins[0].usedRects.filter(r => r.pieceRef).length : 0;
                const aproveitamento = bins.length === 1 ? Math.round(bins[0].occupancy() * 10) / 10 : 0;

                // Find the smallest piece that fits
                const menorPeca = expanded.find(p => (p.w <= retW && p.h <= retH) || (p.h <= retW && p.w <= retH));

                retalhosInfo.push({
                    id: ret.id,
                    nome: ret.nome,
                    comprimento: ret.comprimento,
                    largura: ret.largura,
                    area_m2: Math.round(ret.comprimento * ret.largura / 1000000 * 1000) / 1000,
                    origem_lote: ret.origem_lote,
                    criado_em: ret.criado_em,
                    // Simulation results
                    pecas_que_cabem: pecasColocadas,
                    aproveitamento,
                    cabe_alguma: !!menorPeca,
                    // Suggestion: mark as suggested if >40% utilization or >2 pieces
                    sugerido: pecasColocadas >= 2 || aproveitamento > 40,
                });
            }

            resultado.push({
                groupKey,
                material_code: group.material_code,
                material_nome: chapa.nome || group.material_code,
                espessura: group.espessura,
                total_pecas: expanded.length,
                retalhos: retalhosInfo,
            });
        }

        res.json({ grupos: resultado });
    } catch (err) {
        console.error('Erro preview retalhos:', err);
        res.status(500).json({ error: err.message });
    }
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

        // ═══ MOTOR JS INDUSTRIAL (pipeline completo) ═══════════════════
        // Mesmo pipeline do multi-lote: FASES 1-6
        console.log(`  [CNC] Usando motor JS Industrial para lote ${lote.id} (${pecas.length} peças)`);
        {
            const body = req.body || {};
            const spacing = body.espaco_pecas != null ? Number(body.espaco_pecas) : (config.espaco_pecas || 4);
            const kerfPadrao = body.kerf != null ? Number(body.kerf) : (config.kerf_padrao || 4);
            const kerfOverride = body.kerf != null ? Number(body.kerf) : null;
            const modoRaw = body.modo != null ? body.modo : (config.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects');
            const binType = modoRaw === 'maxrects' ? 'maxrects' : modoRaw === 'shelf' ? 'shelf' : 'guillotine';
            const splitDir = body.direcao_corte === 'horizontal' ? 'horizontal' : body.direcao_corte === 'vertical' ? 'vertical' : 'auto';
            const useRetalhos = body.usar_retalhos != null ? !!body.usar_retalhos : (config.usar_retalhos !== 0);
            const considerarSobra = body.considerar_sobra != null ? !!body.considerar_sobra : (config.considerar_sobra !== 0);
            const sobraMinW = body.sobra_min_largura != null ? Number(body.sobra_min_largura) : (config.sobra_min_largura || 300);
            const sobraMinH = body.sobra_min_comprimento != null ? Number(body.sobra_min_comprimento) : (config.sobra_min_comprimento || 600);
            const permitirRotacao = body.permitir_rotacao != null ? !!body.permitir_rotacao : null;
            const refiloOverride = body.refilo != null ? Number(body.refilo) : null;
            const direcaoCorteRaw = body.direcao_corte || 'misto';
            const limiarPequena = body.limiar_pequena != null ? Number(body.limiar_pequena) : 400;
            const limiarSuperPequena = body.limiar_super_pequena != null ? Number(body.limiar_super_pequena) : 200;
            const classificarPecas = body.classificar_pecas !== false;
            const isLargeBatch = pecas.length > 100;
            // Qualidade: 'rapido' pula BRKGA+SA; 'maximo' usa 3× iterações
            const skipAdvanced = body.qualidade === 'rapido';
            const qualMult = body.qualidade === 'maximo' ? 3 : 1;

            // Classificação de peças
            const classifyPiece = (w, h) => {
                const minDim = Math.min(w, h);
                if (minDim < limiarSuperPequena) return 'super_pequena';
                if (minDim < limiarPequena) return 'pequena';
                return 'normal';
            };

            // Agrupar peças pela CHAPA RESOLVIDA
            const aliasMap = {};
            try {
                const aliases = db.prepare('SELECT material_code_importado, chapa_id FROM cnc_chapa_aliases WHERE user_id = ?').all(req.user.id);
                for (const a of aliases) aliasMap[a.material_code_importado] = a.chapa_id;
            } catch (_) {}

            const groups = {};
            for (const p of pecas) {
                let esp = p.espessura || 0;
                if (!esp && p.material_code) { const m = p.material_code.match(/_(\d+(?:\.\d+)?)_/); if (m) esp = parseFloat(m[1]); }
                let chapa = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(p.material_code);
                if (!chapa && aliasMap[p.material_code]) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE id = ? AND ativo = 1').get(aliasMap[p.material_code]);
                if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ABS(espessura_real - ?) <= 1.0 AND ativo = 1 ORDER BY ABS(espessura_real - ?) ASC LIMIT 1').get(esp, esp);
                if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE espessura_nominal = ? AND ativo = 1').get(esp);
                if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();
                const chapaKey = chapa ? `${chapa.material_code}__${chapa.espessura_real}` : `fallback__${esp}`;
                if (!groups[chapaKey]) groups[chapaKey] = { material_code: chapa?.material_code || p.material_code, espessura: chapa?.espessura_real || esp, chapa_resolvida: chapa, pieces: [] };
                groups[chapaKey].pieces.push(p);
            }

            // Reset posições
            db.prepare('UPDATE cnc_pecas SET chapa_idx = NULL, pos_x = 0, pos_y = 0, rotacionada = 0 WHERE lote_id = ?').run(lote.id);
            db.prepare("DELETE FROM cnc_retalhos WHERE origem_lote = ?").run(String(lote.id));

            const plano = { chapas: [], retalhos: [], materiais: {}, modo: binType, direcao_corte: direcaoCorteRaw,
                timestamp: Date.now(),
                classificacao: { limiar_pequena: limiarPequena, limiar_super_pequena: limiarSuperPequena, ativo: classificarPecas },
            };
            let globalChapaIdx = 0;
            let totalCombinacoes = 0;

            // Build contour lookup from machining_json (for rendering in plano_json)
            const contourMap = {};
            for (const p of pecas) {
                if (!p.machining_json) continue;
                try {
                    const mach = JSON.parse(p.machining_json);
                    if (mach.contour && mach.contour.outer && mach.contour.outer.length > 0) {
                        let pts = mach.contour.outer.map(v => ({
                            x: Math.round((v.x ?? v[0] ?? 0) * 10) / 10,
                            y: Math.round((v.y ?? v[1] ?? 0) * 10) / 10,
                        }));
                        // Auto-detect and fix swapped axes: contour should fit within comprimento × largura
                        const comp = p.comprimento || 0, larg = p.largura || 0;
                        if (comp > 0 && larg > 0 && pts.length >= 3) {
                            const maxX = Math.max(...pts.map(v => v.x));
                            const maxY = Math.max(...pts.map(v => v.y));
                            // If contour max values suggest axes are swapped relative to comprimento/largura
                            const fitNormal = Math.max(maxX / comp, maxY / larg);
                            const fitSwapped = Math.max(maxY / comp, maxX / larg);
                            if (fitSwapped < fitNormal * 0.7 && fitNormal > 1.3) {
                                console.log(`  [Contour] Peça ${p.id}: eixos do contorno invertidos (maxX=${Math.round(maxX)} maxY=${Math.round(maxY)} vs comp=${comp} larg=${larg}), corrigindo...`);
                                pts = pts.map(v => ({ x: v.y, y: v.x }));
                            }
                        }
                        contourMap[p.id] = pts;
                    }
                } catch { /* skip */ }
            }

            // Helper: parsear espessura da fita de borda
            const parseBordaEspessura = (t) => {
                if (!t || t === '' || t === '0' || t === 'nenhum' || t === 'nenhuma') return 0;
                const m = t.match(/([\d.]+)\s*mm/i);
                if (m) return parseFloat(m[1]) || 0;
                const m2 = t.match(/(\d+\.?\d*)/);
                if (m2) { const v = parseFloat(m2[1]); return v > 10 ? 0 : v || 0; }
                return t.trim() ? 0.45 : 0;
            };

            for (const [groupKey, group] of Object.entries(groups)) {
                let chapa = group.chapa_resolvida;
                if (!chapa) chapa = { comprimento: 2750, largura: 1850, refilo: 10, kerf: kerfPadrao, nome: 'Padrão 2750x1850', material_code: group.material_code, preco: 0, veio: 'sem_veio' };
                console.log(`  [CNC] Grupo ${groupKey}: ${group.pieces.length} peças → chapa ${chapa.material_code || chapa.nome}`);

                const refilo = refiloOverride != null ? Math.max(0, refiloOverride) : Math.max(0, chapa.refilo || 10);
                const kerf = Math.max(0, kerfOverride != null ? kerfOverride : (chapa.kerf || kerfPadrao));
                const binW = Math.max(10, chapa.comprimento - 2 * refilo); // mínimo 10mm usável
                const binH = Math.max(10, chapa.largura - 2 * refilo);
                const chapaVeio = chapa.veio || 'sem_veio';
                const temVeio = chapaVeio !== 'sem_veio';

                const chapaDirecao = chapa.direcao_corte || 'herdar';
                const chapaModo = chapa.modo_corte || 'herdar';
                const groupSplitDir = chapaDirecao !== 'herdar'
                    ? (chapaDirecao === 'horizontal' ? 'horizontal' : chapaDirecao === 'vertical' ? 'vertical' : 'auto')
                    : splitDir;
                const groupBinType = chapaModo !== 'herdar'
                    ? (chapaModo === 'maxrects' ? 'maxrects' : chapaModo === 'shelf' ? 'shelf' : 'guillotine')
                    : binType;

                // Config de rotação do material
                const matCadastrado = chapa.material_code
                    ? db.prepare('SELECT permitir_rotacao FROM cnc_materiais WHERE codigo = ? LIMIT 1').get(chapa.material_code)
                    : null;
                const matPermitirRot = matCadastrado?.permitir_rotacao;

                // Expandir peças com fita de borda + grain per-piece
                const expanded = [];
                for (const p of group.pieces) {
                    let allowRotate;
                    if (matPermitirRot === 0) allowRotate = false;
                    else if (matPermitirRot === 1) allowRotate = true;
                    else if (!temVeio) allowRotate = true;
                    else {
                        const temBordaVisivel = !!(p.borda_dir || p.borda_esq || p.borda_frontal || p.borda_traseira);
                        allowRotate = !temBordaVisivel;
                    }
                    const fitaEsq = parseBordaEspessura(p.borda_esq), fitaDir = parseBordaEspessura(p.borda_dir);
                    const fitaFrontal = parseBordaEspessura(p.borda_frontal), fitaTraseira = parseBordaEspessura(p.borda_traseira);
                    const wCorte = p.comprimento + fitaEsq + fitaDir;
                    const hCorte = p.largura + fitaFrontal + fitaTraseira;

                    for (let q = 0; q < p.quantidade; q++) {
                        expanded.push({
                            ref: { pecaId: p.id, instancia: q, loteId: lote.id },
                            w: wCorte, h: hCorte, allowRotate,
                            area: wCorte * hCorte,
                            perim: 2 * (wCorte + hCorte),
                            maxSide: Math.max(wCorte, hCorte),
                            diff: Math.abs(wCorte - hCorte),
                            classificacao: classifyPiece(wCorte, hCorte),
                        });
                    }
                }

                // ═══ Filtro de segurança: dimensões inválidas + peças maiores que a chapa ═══
                const pecasValidas = [];
                const pecasGrandes = [];
                for (const ep of expanded) {
                    // Guard: peças com dimensão zero ou negativa causam NaN no aproveitamento
                    if (ep.w <= 0 || ep.h <= 0) {
                        console.warn(`  [Filter] Peça ${ep.ref.pecaId} com dimensão inválida (${ep.w}x${ep.h}) — ignorada`);
                        continue;
                    }
                    const fitsNormal = ep.w <= binW + 1 && ep.h <= binH + 1;
                    const fitsRotated = ep.allowRotate && ep.h <= binW + 1 && ep.w <= binH + 1;
                    if (fitsNormal || fitsRotated) {
                        pecasValidas.push(ep);
                    } else {
                        pecasGrandes.push(ep);
                        console.warn(`  [Filter] Peça ${ep.ref.pecaId} (${Math.round(ep.w)}x${Math.round(ep.h)}) NÃO CABE na chapa (${binW}x${binH}) — ignorada`);
                    }
                }
                if (pecasGrandes.length > 0) {
                    console.warn(`  [Filter] ${pecasGrandes.length} peça(s) ignoradas por serem maiores que a chapa`);
                }

                // ═══ FASE 1: Retalhos ═══
                let pecasRestantes = [...pecasValidas];
                const retalhosUsados = [];
                if (useRetalhos) {
                    const retSelecionados = Array.isArray(body.retalhos_selecionados) ? body.retalhos_selecionados : null;
                    let retalhosDisp;
                    if (retSelecionados && retSelecionados.length > 0) {
                        // Only use specifically selected retalhos
                        const placeholders = retSelecionados.map(() => '?').join(',');
                        retalhosDisp = db.prepare(
                            `SELECT * FROM cnc_retalhos WHERE id IN (${placeholders}) AND disponivel = 1 ORDER BY comprimento * largura DESC`
                        ).all(...retSelecionados);
                    } else if (retSelecionados && retSelecionados.length === 0) {
                        // Explicitly empty = don't use any retalhos
                        retalhosDisp = [];
                    } else {
                        // No selection provided = use all matching (backward compat)
                        retalhosDisp = db.prepare(
                            'SELECT * FROM cnc_retalhos WHERE material_code = ? AND ABS(espessura_real - ?) <= 1.0 AND disponivel = 1 ORDER BY comprimento * largura DESC'
                        ).all(group.material_code, group.espessura);
                    }
                    // Portfolio multi-pass para retalhos: testa combinações heurística × ordenação × bin type
                    // e escolhe a que coloca mais peças (e secundariamente maior área usada).
                    const retHeuristics = ['BSSF', 'BLSF', 'BAF', 'BL'];
                    const retSorts = [
                        (a, b) => b.area - a.area,
                        (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
                        (a, b) => b.h - a.h || b.w - a.w,
                        (a, b) => b.w - a.w || b.h - a.h,
                    ];
                    const retBinTypes = groupBinType === 'guillotine' ? ['guillotine', 'shelf']
                        : groupBinType === 'shelf' ? ['shelf', 'guillotine']
                        : [groupBinType, 'maxrects'];
                    for (const ret of retalhosDisp) {
                        if (pecasRestantes.length === 0) break;
                        const retW = ret.comprimento, retH = ret.largura;
                        let bestBin = null, bestPlaced = 0, bestArea = 0, bestBt = groupBinType;
                        for (const sortFn of retSorts) {
                            const sorted = [...pecasRestantes].sort(sortFn);
                            for (const h of retHeuristics) {
                                for (const bt of retBinTypes) {
                                    const tryBins = runNestingPass(sorted, retW, retH, spacing, h, bt, kerf, groupSplitDir);
                                    if (tryBins.length !== 1) continue;
                                    const tb = tryBins[0];
                                    const placed = tb.usedRects.filter(r => r.pieceRef).length;
                                    const areaUsed = tb.usedRects.reduce((s, r) => s + (r.realW || r.w) * (r.realH || r.h), 0);
                                    if (placed > bestPlaced || (placed === bestPlaced && areaUsed > bestArea)) {
                                        bestBin = tb; bestPlaced = placed; bestArea = areaUsed; bestBt = bt;
                                    }
                                }
                            }
                        }
                        if (bestBin && bestPlaced > 0) {
                            const bin = bestBin;
                            const chapaIdx = globalChapaIdx++;
                            const chapaInfo = { idx: chapaIdx, material: `RETALHO: ${ret.nome}`, material_code: group.material_code,
                                espessura_real: ret.espessura_real || group.espessura, comprimento: retW, largura: retH,
                                refilo: 0, preco: 0, veio: chapaVeio, aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                                is_retalho: true, retalho_id: ret.id, pecas: [], retalhos: [],
                                cortes: bestBt !== 'maxrects' ? gerarSequenciaCortes(bin) : [],
                            };
                            const placedRefs = new Set();
                            for (const rect of bin.usedRects) {
                                if (!rect.pieceRef) continue;
                                const { pecaId, instancia } = rect.pieceRef;
                                const retPecaM = { pecaId, instancia, x: rect.x, y: rect.y, w: rect.realW, h: rect.realH, rotated: rect.rotated };
                                if (contourMap[pecaId]) {
                                    if (rect.rotated) {
                                        const contPtsR = contourMap[pecaId];
                                        const maxContX = Math.max(...contPtsR.map(v => v.x));
                                        const compOrig = Math.max(pecas.find(pp => pp.id === pecaId)?.comprimento || 0, maxContX, rect.realH);
                                        retPecaM.contour = contPtsR.map(v => ({ x: Math.round(v.y * 10) / 10, y: Math.round((compOrig - v.x) * 10) / 10 }));
                                    } else {
                                        retPecaM.contour = contourMap[pecaId];
                                    }
                                }
                                chapaInfo.pecas.push(retPecaM);
                                placedRefs.add(`${pecaId}_${instancia}`);
                            }
                            gerarCortesRetalhos(chapaInfo);
                            plano.chapas.push(chapaInfo);
                            retalhosUsados.push(ret.id);
                            db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(ret.id);
                            pecasRestantes = pecasRestantes.filter(p => !placedRefs.has(`${p.ref.pecaId}_${p.ref.instancia}`));
                        }
                    }
                }

                if (pecasRestantes.length === 0) {
                    plano.materiais[groupKey] = { material_code: group.material_code, espessura: group.espessura,
                        total_pecas: expanded.length, total_chapas: 0, chapa_usada: chapa.nome, estrategia: 'retalhos_only',
                        ocupacao_media: 0, retalhos_usados: retalhosUsados.length };
                    continue;
                }

                // ═══ FASES 2-5: Pipeline industrial JS ═══
                const heuristics = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
                let bestBins = null, bestBinScore = { score: Infinity }, bestStrategyName = '', bestBinType = groupBinType;
                const expectedPieceCount = pecasRestantes.length; // para penalizar peças perdidas

                const totalPieceArea = pecasRestantes.reduce((s, p) => s + p.area, 0);
                const sheetArea = binW * binH;
                if (sheetArea <= 0) throw new Error(`Área de chapa inválida (${binW}x${binH})`);
                const minTeoricoChapas = Math.ceil(totalPieceArea / sheetArea);

                // Early exit: se atingiu mínimo teórico com boa ocupação, pular fases pesadas
                const isOptimal = () => bestBinScore.placedCount >= expectedPieceCount
                    && bestBinScore.bins <= minTeoricoChapas
                    && bestBinScore.avgOccupancy >= 85;

                const binTypesToTry = [groupBinType];
                if (groupBinType === 'guillotine') binTypesToTry.push('shelf');
                else if (groupBinType === 'shelf') binTypesToTry.push('guillotine');
                else { if (!binTypesToTry.includes('maxrects')) binTypesToTry.push('maxrects'); if (!binTypesToTry.includes('skyline')) binTypesToTry.push('skyline'); }

                const sortStrategies = [
                    { name: 'area_desc', fn: (a, b) => b.area - a.area },
                    { name: 'maxside_desc', fn: (a, b) => b.maxSide - a.maxSide },
                    { name: 'h_w_desc', fn: (a, b) => b.h - a.h || b.w - a.w },
                    { name: 'w_h_desc', fn: (a, b) => b.w - a.w || b.h - a.h },
                    { name: 'perim_desc', fn: (a, b) => b.perim - a.perim },
                ];

                // FASE 2: Portfolio multi-pass
                for (const dir of [groupSplitDir]) {
                    for (const strat of sortStrategies) {
                        const sorted = [...pecasRestantes].sort(strat.fn);
                        for (const h of heuristics) {
                            for (const bt of binTypesToTry) {
                                const bins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, dir);
                                const sc = scoreResultV5(bins, expectedPieceCount);
                                if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = bins; bestStrategyName = `${strat.name}+${h}+${bt}`; bestBinType = bt; }
                                totalCombinacoes++;
                            }
                        }
                    }
                }

                // FASE 2.6: Two-Phase
                for (const bt of binTypesToTry) {
                    for (const dir of [groupSplitDir, 'auto']) {
                        const tpBins = runTwoPhase(pecasRestantes, binW, binH, kerf, spacing, dir, [bt]);
                        const sc = scoreResultV5(tpBins, expectedPieceCount);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = tpBins; bestStrategyName = `two_phase+${bt}`; bestBinType = bt; }
                    }
                }

                // FASE 2.7: Fill-First V2
                for (const dir of [groupSplitDir, 'auto']) {
                    const v2Bins = runFillFirstV2(pecasRestantes, binW, binH, spacing, kerf, dir, binTypesToTry);
                    const sc = scoreResultV5(v2Bins, expectedPieceCount);
                    if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = v2Bins; bestStrategyName = `fillFirstV2+${dir}`; bestBinType = binTypesToTry[0]; }
                }

                // FASE 2.8: Fill-First V1
                for (const bt of binTypesToTry) {
                    for (const dir of [groupSplitDir]) {
                        const sorted = [...pecasRestantes].sort((a, b) => b.area - a.area);
                        const ffBins = runFillFirst(sorted, binW, binH, spacing, 'BSSF', bt, kerf, dir, true);
                        const sc = scoreResultV5(ffBins, expectedPieceCount);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = ffBins; bestStrategyName = `fillFirst+${bt}`; bestBinType = bt; }
                    }
                }

                // FASE 2.9: Industrial Optimizer
                {
                    const indBins = runIndustrialOptimizer(pecasRestantes, binW, binH, spacing, kerf, groupSplitDir, binTypesToTry);
                    const sc = scoreResultV5(indBins, expectedPieceCount);
                    if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = indBins; bestStrategyName = 'industrial_optimizer'; bestBinType = binTypesToTry[0]; }
                }

                // FASE 2.95: LargeFirst-GlobalFill — grandes primeiro, pequenas preenchem gaps
                {
                    const lfBins = runLargeFirstGlobalFill(pecasRestantes, binW, binH, spacing, kerf, groupSplitDir, binTypesToTry);
                    const sc = scoreResultV5(lfBins, expectedPieceCount);
                    if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = lfBins; bestStrategyName = 'large_first_global_fill'; bestBinType = binTypesToTry[0]; }
                }

                // FASE 2.98: Aggressive Pack — candidato extra para economia máxima de chapa.
                // Só entra no modo "maximo" e só substitui o plano se passar na validação forte.
                if (body.qualidade === 'maximo' && pecasRestantes.length > 3 && !isOptimal()) {
                    const timeoutMs = Math.min(30000, Math.max(8000, pecasRestantes.length * 80));
                    const agBins = runAggressivePack(pecasRestantes, binW, binH, spacing, kerf, groupSplitDir, timeoutMs);
                    if (agBins?.length && verifyNoOverlaps(agBins)) {
                        const sc = scoreResultV5(agBins, expectedPieceCount);
                        if (sc.score < bestBinScore.score) {
                            bestBinScore = sc; bestBins = agBins;
                            bestStrategyName = `aggressive_pack_${timeoutMs}ms`;
                            bestBinType = binTypesToTry[0];
                        }
                    }
                }

                // FASE 3: Ruin & Recreate (skip if already optimal)
                const rrIter = isLargeBatch ? Math.max(3000, Math.min(8000, pecasRestantes.length * 15)) : Math.max(800, Math.min(2000, pecasRestantes.length * 20));
                if (pecasRestantes.length > 3 && !isOptimal()) {
                    for (const bt of binTypesToTry) {
                        const rrResult = ruinAndRecreate(pecasRestantes, binW, binH, spacing, bt, kerf, rrIter, groupSplitDir);
                        if (rrResult && rrResult.score.score < bestBinScore.score) { bestBinScore = rrResult.score; bestBins = rrResult.bins; bestStrategyName = `ruin_recreate+${bt}`; bestBinType = bt; }
                        totalCombinacoes += rrIter;
                    }
                }

                // Sinal "quase ótimo": estamos a apenas 1 chapa do teórico → vale gastar mais iterações pra fechar
                const almostOptimal = bestBinScore.bins === minTeoricoChapas + 1;

                // FASE 3.5: BRKGA (skip if already optimal ou qualidade=rapido)
                if (!skipAdvanced && pecasRestantes.length > 3 && bestBinScore.bins > minTeoricoChapas && !isOptimal()) {
                    let brkgaGen = Math.min(600, (isLargeBatch ? Math.min(200, Math.max(80, pecasRestantes.length * 2)) : Math.min(100, Math.max(40, pecasRestantes.length * 3))) * qualMult);
                    if (almostOptimal) brkgaGen = Math.min(600, Math.max(brkgaGen, 250)); // piso de 250 gerações quando estamos a 1 chapa do ótimo
                    const brkgaResult = runBRKGA(pecasRestantes, binW, binH, spacing, groupBinType, kerf, brkgaGen, groupSplitDir);
                    if (brkgaResult && brkgaResult.score.score < bestBinScore.score) { bestBinScore = brkgaResult.score; bestBins = brkgaResult.bins; bestStrategyName = `BRKGA`; bestBinType = groupBinType; }
                    totalCombinacoes += brkgaGen * 40;
                }

                // FASE 4: Simulated Annealing (skip if already optimal ou qualidade=rapido)
                if (!skipAdvanced && bestBins && bestBins.length > 1 && bestBins.length > minTeoricoChapas && !isOptimal()) {
                    let saIter = Math.min(200000, (isLargeBatch ? Math.min(80000, pecasRestantes.length * 100) : Math.min(40000, pecasRestantes.length * 200)) * qualMult);
                    if (almostOptimal) saIter = Math.min(200000, Math.max(saIter, 60000)); // piso de 60k iterações quando estamos a 1 chapa do ótimo
                    const saResult = simulatedAnnealing(bestBins, binW, binH, spacing, bestBinType, kerf, saIter, groupSplitDir);
                    if (saResult && saResult.score.score < bestBinScore.score) {
                        console.log(`  [SA] ${bestBins.length}→${saResult.bins.length} chapas`);
                        bestBinScore = saResult.score; bestBins = saResult.bins;
                    }
                    totalCombinacoes += saIter;
                }

                // FASE 5: Gap Filling (tentar N-1)
                if (bestBins && bestBins.length > 1 && bestBins.length > minTeoricoChapas) {
                    const targetBins = bestBins.length - 1;
                    const totalArea = bestBins.reduce((s, b) => s + b.usedRects.reduce((s2, r) => s2 + (r.realW || r.w) * (r.realH || r.h), 0), 0);
                    if (totalArea <= targetBins * sheetArea * 0.98) {
                        for (const strat of sortStrategies.slice(0, 3)) {
                            const allPieces = [];
                            for (const bin of bestBins) for (const r of bin.usedRects) {
                                if (!r.pieceRef) continue;
                                allPieces.push({ ref: r.pieceRef, w: r.rotated ? (r.realH||r.h) : (r.realW||r.w), h: r.rotated ? (r.realW||r.w) : (r.realH||r.h),
                                    allowRotate: r.allowRotate !== false, area: (r.realW||r.w) * (r.realH||r.h), perim: 2*((r.realW||r.w)+(r.realH||r.h)),
                                    maxSide: Math.max(r.realW||r.w, r.realH||r.h), diff: Math.abs((r.realW||r.w)-(r.realH||r.h)), classificacao: r.classificacao || 'normal' });
                            }
                            const sorted = allPieces.sort(strat.fn);
                            for (const bt of binTypesToTry) {
                                const testBins = runFillFirstV2(sorted, binW, binH, spacing, kerf, groupSplitDir, [bt]);
                                if (testBins.length <= targetBins && verifyNoOverlaps(testBins)) {
                                    const sc = scoreResultV5(testBins, expectedPieceCount);
                                    if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = testBins; bestStrategyName = `gap_fill_${strat.name}`; bestBinType = bt; }
                                }
                            }
                        }
                    }
                }

                // FASE 6: Cascata de Retalhos
                if (bestBins && bestBins.length > 1 && bestBins.length > minTeoricoChapas) {
                    const cascResult = cascadeRemnants(bestBins, binW, binH, spacing, bestBinType, kerf, groupSplitDir);
                    if (cascResult && cascResult.improved && cascResult.bins) {
                        const sc = scoreResultV5(cascResult.bins, expectedPieceCount);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = cascResult.bins; bestStrategyName += '+cascade'; }
                    }
                }

                // FASE 6.5: Cross-Bin Gap Fill — preencher buracos grandes movendo peças entre chapas
                if (bestBins && bestBins.length > 1) {
                    const gapResult = crossBinGapFill(bestBins, binW, binH, spacing, bestBinType, kerf, groupSplitDir);
                    if (gapResult && gapResult.improved && gapResult.bins) {
                        const sc = scoreResultV5(gapResult.bins, expectedPieceCount);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = gapResult.bins; bestStrategyName += '+gapfill'; }
                    }
                }

                // Safety + Compactação + Validação de limites
                if (!verifyNoOverlaps(bestBins)) { bestBins = repairOverlaps(bestBins, binW, binH, spacing, bestBinType, kerf, groupSplitDir); bestBinScore = scoreResultV5(bestBins, expectedPieceCount); }
                for (const bin of bestBins) compactBin(bin, binW, binH, kerf, spacing, groupSplitDir);
                clampBinBounds(bestBins, binW, binH, bestBinType, kerf, groupSplitDir, spacing);

                // ═══ FINAL SAFETY CHECK — verificação definitiva pós-processamento ═══
                // compactBin e clampBinBounds podem introduzir sobreposições/boundary violations
                const safetyOk = finalSafetyCheck(bestBins, binW, binH, bestBinType, kerf, groupSplitDir, spacing);
                if (!safetyOk) {
                    bestBinScore = scoreResultV5(bestBins, expectedPieceCount);
                    console.log(`  [Nesting] ${groupKey}: layout corrigido pelo safety check → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}%`);
                }

                const totalUsedRects = bestBins.reduce((s, b) => s + b.usedRects.length, 0);
                const totalWithRef = bestBins.reduce((s, b) => s + b.usedRects.filter(r => r.pieceRef).length, 0);
                console.log(`  [Nesting] ${groupKey}: ${pecasRestantes.length} peças → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}% (${bestStrategyName}) | usedRects=${totalUsedRects}, withRef=${totalWithRef}`);

                // Gravar resultados
                const updatePeca = db.prepare('UPDATE cnc_pecas SET chapa_idx = ?, pos_x = ?, pos_y = ?, rotacionada = ? WHERE id = ? AND lote_id = ?');
                for (let bi = 0; bi < bestBins.length; bi++) {
                    const bin = bestBins[bi];
                    const chapaIdx = globalChapaIdx++;
                    const chapaInfo = { idx: chapaIdx, material: chapa.nome, material_code: chapa.material_code || group.material_code,
                        espessura_real: chapa.espessura_real || group.espessura, comprimento: chapa.comprimento, largura: chapa.largura,
                        refilo, kerf, preco: chapa.preco || 0, veio: chapaVeio, direcao_corte: direcaoCorteRaw,
                        aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                        pecas: [], retalhos: [],
                        cortes: bestBinType !== 'maxrects' ? gerarSequenciaCortes(bin) : [],
                    };
                    for (const rect of bin.usedRects) {
                        if (!rect.pieceRef) continue;
                        const { pecaId, instancia } = rect.pieceRef;
                        if (instancia === 0) updatePeca.run(chapaIdx, rect.x + refilo, rect.y + refilo, rect.rotated ? 1 : 0, pecaId, lote.id);
                        const cls = classifyPiece(rect.realW, rect.realH);
                        const pecaM = { pecaId, instancia, x: rect.x, y: rect.y, w: rect.realW, h: rect.realH, rotated: rect.rotated };
                        if (cls !== 'normal') pecaM.classificacao = cls;
                        const cutPolicy = smallPieceCutPolicy(cls);
                        if (cutPolicy) pecaM.corte = cutPolicy;
                        // Add contour data for irregular pieces
                        if (contourMap[pecaId]) {
                            const contPts = contourMap[pecaId];
                            if (rect.rotated) {
                                // Rotate contour 90° CW: (x,y) → (y, compOrig-x)
                                // compOrig = original piece comprimento (X dimension before rotation)
                                const pecaDbRef = pecas.find(pp => pp.id === pecaId);
                                const compOrig = pecaDbRef?.comprimento || Math.max(...contPts.map(v => v.x));
                                pecaM.contour = contPts.map(v => ({ x: Math.round(v.y * 10) / 10, y: Math.round((compOrig - v.x) * 10) / 10 }));
                            } else {
                                pecaM.contour = contPts;
                            }
                        }
                        chapaInfo.pecas.push(pecaM);
                    }

                    if (considerarSobra) {
                        const sobras = clipAndKeep(bin.freeRects, sobraMinW, sobraMinH);
                        for (const s of sobras) {
                            const w = Math.round(Math.max(s.w, s.h)), h = Math.round(Math.min(s.w, s.h));
                            chapaInfo.retalhos.push({
                                x: s.x, y: s.y, w: s.w, h: s.h,
                                // Metadados para criar retalho quando chapa for cortada
                                sobra_w: w, sobra_h: h,
                                material_code: group.material_code,
                                espessura: group.espessura,
                                chapa_ref_id: chapa.id || null,
                                status: 'prevista', // não salvo no DB ainda
                            });
                        }
                    }

                    gerarCortesRetalhos(chapaInfo);
                    plano.chapas.push(chapaInfo);
                }

                plano.materiais[groupKey] = { material_code: group.material_code, espessura: group.espessura,
                    total_pecas: expanded.length, total_chapas: bestBins.length, chapa_usada: chapa.nome,
                    estrategia: bestStrategyName, ocupacao_media: bestBinScore.avgOccupancy,
                    kerf, veio: chapaVeio, retalhos_usados: retalhosUsados.length,
                    min_teorico_chapas: minTeoricoChapas,
                };
            }

            // Stats
            const clsStats = { normal: 0, pequena: 0, super_pequena: 0 };
            for (const ch of plano.chapas) for (const p of ch.pecas) { clsStats[p.classificacao || 'normal'] = (clsStats[p.classificacao || 'normal'] || 0) + 1; }
            plano.classificacao.stats = clsStats;

            const totalChapas = plano.chapas.length;
            const aprovMedio = totalChapas > 0 ? Math.round(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / totalChapas * 100) / 100 : 0;
            plano.aproveitamento = aprovMedio;
            plano.config_usada = { spacing, motor: 'javascript_industrial' };

            db.prepare(`UPDATE cnc_lotes SET status = 'otimizado', total_chapas = ?, aproveitamento = ?, plano_json = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
                .run(totalChapas, aprovMedio, JSON.stringify(plano), lote.id);

            notifyCNC(db, req.user.id, 'cnc_otimizado', 'Plano otimizado', `Lote ${lote.id} otimizado: ${totalChapas} chapas, ${aprovMedio}% aproveitamento`, lote.id, 'cnc_lote');

            // Atualizar stats de produção + disparar webhooks (fire-and-forget)
            updateProductionStats(lote.id);
            dispatchCncWebhooks(req.user.id, 'lote_otimizado', { lote_id: lote.id, total_chapas: totalChapas, aproveitamento: aprovMedio });

            return res.json({
                ok: true, total_chapas: totalChapas, aproveitamento: aprovMedio,
                total_combinacoes_testadas: totalCombinacoes, modo: binType,
                motor: 'javascript_industrial', plano,
                qualidade: body.qualidade || 'balanceado',
                estrategia_resumo: Object.values(plano.materiais || {}).map(m => m.estrategia).filter(Boolean).join(', '),
            });
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
        const skipAdvancedMulti = bodyConfig.qualidade === 'rapido';
        const qualMultMulti = bodyConfig.qualidade === 'maximo' ? 3 : 1;
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
        resetVacuumAware();
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

        // Build contour lookup for multi-lote
        const contourMap = {};
        for (const p of allPecas) {
            if (!p.machining_json) continue;
            try {
                const mach = JSON.parse(p.machining_json);
                if (mach.contour && mach.contour.outer && mach.contour.outer.length > 0) {
                    let pts = mach.contour.outer.map(v => ({
                        x: Math.round((v.x ?? v[0] ?? 0) * 10) / 10,
                        y: Math.round((v.y ?? v[1] ?? 0) * 10) / 10,
                    }));
                    // Auto-detect and fix swapped axes
                    const comp = p.comprimento || 0, larg = p.largura || 0;
                    if (comp > 0 && larg > 0 && pts.length >= 3) {
                        const maxX = Math.max(...pts.map(v => v.x));
                        const maxY = Math.max(...pts.map(v => v.y));
                        const fitNormal = Math.max(maxX / comp, maxY / larg);
                        const fitSwapped = Math.max(maxY / comp, maxX / larg);
                        if (fitSwapped < fitNormal * 0.7 && fitNormal > 1.3) {
                            pts = pts.map(v => ({ x: v.y, y: v.x }));
                        }
                    }
                    contourMap[p.id] = pts;
                }
            } catch { /* skip */ }
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

            // ─── Per-material direction: usar direcao_corte da chapa se definido, senão herda global ───
            const chapaDirecao = chapa.direcao_corte || 'herdar';
            const chapaModo = chapa.modo_corte || 'herdar';
            const groupSplitDir = chapaDirecao !== 'herdar'
                ? (chapaDirecao === 'horizontal' ? 'horizontal' : chapaDirecao === 'vertical' ? 'vertical' : 'auto')
                : splitDir;
            const groupBinType = chapaModo !== 'herdar'
                ? (chapaModo === 'maxrects' ? 'maxrects' : chapaModo === 'shelf' ? 'shelf' : 'guillotine')
                : binType;
            console.log(`  [CNC Multi] ${groupKey}: direcao=${chapaDirecao}→splitDir=${groupSplitDir}, modo=${chapaModo}→binType=${groupBinType}`);

            // Buscar config de rotação do material cadastrado (-1=herdar do veio, 0=nunca, 1=sempre)
            const matCadastrado = chapa.material_code
                ? db.prepare('SELECT permitir_rotacao FROM cnc_materiais WHERE codigo = ? LIMIT 1').get(chapa.material_code)
                : null;
            const matPermitirRot = matCadastrado?.permitir_rotacao;

            // ─── Helper: extrair espessura da fita de borda do texto da borda ───
            // Bordas vêm como texto ex: "PVC 0.45mm Branco", "1mm Carvalho", "ABS 2mm"
            // Extrai o valor numérico em mm. Se não encontrar, assume 0 (sem fita)
            const parseBordaEspessura = (bordaText) => {
                if (!bordaText || bordaText === '' || bordaText === '0' || bordaText === 'nenhum' || bordaText === 'nenhuma') return 0;
                // Tentar extrair número seguido de "mm"
                const matchMm = bordaText.match(/([\d.]+)\s*mm/i);
                if (matchMm) return parseFloat(matchMm[1]) || 0;
                // Tentar extrair número decimal isolado (ex: "0.45", "1", "2")
                const matchNum = bordaText.match(/(\d+\.?\d*)/);
                if (matchNum) {
                    const val = parseFloat(matchNum[1]);
                    // Se > 10, provavelmente é altura da fita (22mm, 35mm), não espessura
                    if (val > 10) return 0;
                    return val || 0;
                }
                // Tem texto mas sem número → assume fita padrão de 0.45mm
                return 0.45;
            };

            // Expandir peças com rastreio de lote_id
            const expanded = [];
            for (const p of group.pieces) {
                // ─── Grain/Veio por peça ───
                // Regra: sem veio na chapa = SEMPRE permite rotação (melhor aproveitamento)
                //        com veio na chapa + peça TEM bordas visíveis (fita) = bloqueia rotação (protege o visual)
                //        com veio na chapa + peça SEM bordas visíveis = permite rotação (fundo, prateleira interna, etc)
                // Override do material cadastrado pode forçar diferente
                let allowRotate;
                if (matPermitirRot === 0) allowRotate = false;
                else if (matPermitirRot === 1) allowRotate = true;
                else if (!temVeio) allowRotate = true; // sem veio → sempre permite
                else {
                    // Chapa com veio: verificar se a peça tem bordas visíveis (indicativo de peça aparente)
                    const temBordaVisivel = !!(p.borda_dir || p.borda_esq || p.borda_frontal || p.borda_traseira);
                    // Peça com bordas = provavelmente aparente → bloquear rotação para manter veio
                    // Peça sem bordas = provavelmente interna (fundo, prateleira) → permitir rotação
                    allowRotate = !temBordaVisivel;
                }

                // ─── Fita de borda: calcular dimensão BRUTA de corte ───
                // dim_corte = dim_final + espessura_fita nos lados aplicáveis
                // comprimento (L) é afetado por borda_esq e borda_dir
                // largura (A) é afetado por borda_frontal e borda_traseira
                const fitaEsq = parseBordaEspessura(p.borda_esq);
                const fitaDir = parseBordaEspessura(p.borda_dir);
                const fitaFrontal = parseBordaEspessura(p.borda_frontal);
                const fitaTraseira = parseBordaEspessura(p.borda_traseira);

                const wCorte = p.comprimento + fitaEsq + fitaDir;
                const hCorte = p.largura + fitaFrontal + fitaTraseira;

                for (let q = 0; q < p.quantidade; q++) {
                    expanded.push({
                        ref: { pecaId: p.id, instancia: q, loteId: loteMap[p.id] },
                        w: wCorte, h: hCorte, allowRotate,
                        wOriginal: p.comprimento, hOriginal: p.largura,
                        fitaAdd: { esq: fitaEsq, dir: fitaDir, frontal: fitaFrontal, traseira: fitaTraseira },
                        area: wCorte * hCorte,
                        perim: 2 * (wCorte + hCorte),
                        maxSide: Math.max(wCorte, hCorte),
                        diff: Math.abs(wCorte - hCorte),
                        classificacao: classifyPieceMulti(wCorte, hCorte),
                    });
                }
            }

            // ═══ Filtro de segurança: dimensões inválidas + peças maiores que a chapa ═══
            const pecasValidas = [];
            const pecasGrandes = [];
            for (const ep of expanded) {
                // Guard: peças com dimensão zero ou negativa
                if (ep.w <= 0 || ep.h <= 0) {
                    console.warn(`  [Filter Multi] Peça ${ep.ref.pecaId} com dimensão inválida (${ep.w}x${ep.h}) — ignorada`);
                    continue;
                }
                const fitsNormal = ep.w <= binW + 1 && ep.h <= binH + 1;
                const fitsRotated = ep.allowRotate && ep.h <= binW + 1 && ep.w <= binH + 1;
                if (fitsNormal || fitsRotated) {
                    pecasValidas.push(ep);
                } else {
                    pecasGrandes.push(ep);
                    console.warn(`  [Filter Multi] Peça ${ep.ref.pecaId} (${Math.round(ep.w)}x${Math.round(ep.h)}) NÃO CABE na chapa (${binW}x${binH}) — ignorada`);
                }
            }
            if (pecasGrandes.length > 0) {
                console.warn(`  [Filter Multi] ${pecasGrandes.length} peça(s) ignoradas por serem maiores que a chapa`);
            }

            // ═══ FASE 1: Retalhos ═══
            let pecasRestantes = [...pecasValidas];
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
                        retW, retH, spacing, 'BSSF', groupBinType, kerf, groupSplitDir
                    );

                    if (bins.length === 1 && bins[0].usedRects.length > 0) {
                        const bin = bins[0];
                        const chapaIdx = globalChapaIdx++;
                        const chapaInfo = {
                            idx: chapaIdx, material: `RETALHO: ${ret.nome}`,
                            material_code: group.material_code,
                            espessura_real: ret.espessura_real || group.espessura,
                            comprimento: retW, largura: retH,
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
            let bestBins = null, bestBinScore = { score: Infinity }, bestStrategyName = '', bestBinType = groupBinType;
            const expectedPieceCount = pecasRestantes.length; // para penalizar peças perdidas

            const totalPieceArea = pecasRestantes.reduce((s, p) => s + p.area, 0);
            const sheetArea = binW * binH;
            if (sheetArea <= 0) { console.warn(`[Multi] Área de chapa inválida (${binW}x${binH}) — grupo ${groupKey} ignorado`); continue; }
            if (pecasRestantes.length === 0) { console.warn(`[Multi] Grupo ${groupKey} sem peças válidas — ignorado`); continue; }
            const minTeoricoChapas = Math.ceil(totalPieceArea / sheetArea);

            // Early exit: se atingiu mínimo teórico com boa ocupação, pular fases pesadas
            const isOptimal = () => bestBinScore.placedCount >= expectedPieceCount
                && bestBinScore.bins <= minTeoricoChapas
                && bestBinScore.avgOccupancy >= 85;

            // Respeitar o modo escolhido pelo usuário (ou per-material override):
            const binTypesToTry = [groupBinType];
            if (groupBinType === 'guillotine') {
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
            if (groupSplitDir === 'horizontal') {
                // Horizontal: prioritize wider pieces first (fill rows efficiently)
                sortStrategies.unshift(
                    { name: 'width_desc',     fn: (a, b) => b.w - a.w || b.h - a.h },
                    { name: 'width_area',     fn: (a, b) => b.w - a.w || b.area - a.area },
                );
            } else if (groupSplitDir === 'vertical') {
                // Vertical: prioritize taller pieces first (fill columns efficiently)
                sortStrategies.unshift(
                    { name: 'height_desc',    fn: (a, b) => b.h - a.h || b.w - a.w },
                    { name: 'height_area',    fn: (a, b) => b.h - a.h || b.area - a.area },
                );
            }

            // FASE 2: Portfolio multi-pass (uses per-material groupSplitDir)
            const isDirectional = groupSplitDir !== 'auto';
            const dirsToTry = isLargeBatch && isDirectional ? [groupSplitDir, 'auto'] : [groupSplitDir];
            for (const dir of dirsToTry) {
                for (const bt of binTypesToTry) {
                    for (const strat of sortStrategies) {
                        const sorted = [...pecasRestantes].sort(strat.fn);
                        for (const h of heuristics) {
                            const bins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, dir);
                            const sc = scoreResultV5(bins, expectedPieceCount);
                            if (isDirectional && dir === groupSplitDir && (strat.name.startsWith('width_') || strat.name.startsWith('height_'))) {
                                sc.score -= 0.5;
                            }
                            if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = bins; bestStrategyName = `${strat.name}+${h}+${bt}${dir !== groupSplitDir ? '+autoDir' : ''}`; bestBinType = bt; }
                            totalCombinacoes++;
                        }
                    }
                }
            }

            // FASE 2.5: Strip packing
            {
                const stripBins = runStripPacking(pecasRestantes, binW, binH, kerf, spacing, groupSplitDir);
                const sc = scoreResultV5(stripBins, expectedPieceCount);
                if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = stripBins; bestStrategyName = 'strip_packing'; bestBinType = 'strip'; }
                totalCombinacoes++;
            }

            // FASE 2.6: Two-Phase (grandes primeiro, depois preenche com pequenas)
            for (const bt of binTypesToTry) {
                for (const dir of dirsToTry) {
                    const tpBins = runTwoPhase(pecasRestantes, binW, binH, spacing, bt, kerf, dir);
                    const sc = scoreResultV5(tpBins, expectedPieceCount);
                    if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = tpBins; bestStrategyName = `two_phase+${bt}+${dir}`; bestBinType = bt; }
                    totalCombinacoes++;
                }
            }

            // FASE 2.7: Fill-First V2 — Per-bin multi-start (CORE OPTIMIZER)
            // Para cada chapa, testa 9 sorts × 5 heurísticas × N bin types
            // e mantém o melhor empacotamento por chapa. Muito mais eficiente
            // que o portfolio global.
            {
                const v2Start = Date.now();
                for (const dir of dirsToTry) {
                    const v2Bins = runFillFirstV2(pecasRestantes, binW, binH, spacing, kerf, dir, binTypesToTry);
                    const sc = scoreResultV5(v2Bins, expectedPieceCount);
                    if (sc.score < bestBinScore.score) {
                        bestBinScore = sc; bestBins = v2Bins;
                        bestStrategyName = `fillFirstV2+${dir}`;
                        bestBinType = binTypesToTry[0];
                    }
                    totalCombinacoes += 9 * 5 * binTypesToTry.length;
                }
                const v2Time = Date.now() - v2Start;
                console.log(`  [FillFirstV2] ${groupKey}: score=${bestBinScore.score.toFixed(1)}, bins=${bestBinScore.bins}, avg=${bestBinScore.avgOccupancy.toFixed(1)}% (${v2Time}ms)`);
            }

            // FASE 2.8: Fill-First V1 with multiHeuristic (portfolio rápido)
            for (const bt of binTypesToTry) {
                for (const dir of dirsToTry) {
                    for (const strat of sortStrategies) {
                        const sorted = [...pecasRestantes].sort(strat.fn);
                        const ffBins = runFillFirst(sorted, binW, binH, spacing, 'BSSF', bt, kerf, dir, true);
                        const sc = scoreResultV5(ffBins, expectedPieceCount);
                        if (sc.score < bestBinScore.score) {
                            bestBinScore = sc; bestBins = ffBins;
                            bestStrategyName = `fillFirst+${strat.name}+${bt}+${dir}`;
                            bestBinType = bt;
                        }
                        totalCombinacoes++;
                    }
                }
            }

            // FASE 2.9: Industrial Optimizer — Two-Phase + Fullest-Bin-First + N-1 Reduction
            {
                const indStart = Date.now();
                const indBins = runIndustrialOptimizer(pecasRestantes, binW, binH, spacing, kerf, groupSplitDir, binTypesToTry);
                const sc = scoreResultV5(indBins, expectedPieceCount);
                if (sc.score < bestBinScore.score) {
                    bestBinScore = sc; bestBins = indBins;
                    bestStrategyName = 'industrial_optimizer';
                    bestBinType = binTypesToTry[0];
                }
                const indTime = Date.now() - indStart;
                console.log(`  [Industrial] ${groupKey}: score=${sc.score.toFixed(1)}, bins=${sc.bins}, avg=${sc.avgOccupancy.toFixed(1)}% (${indTime}ms)`);
            }

            // FASE 2.95: LargeFirst-GlobalFill — grandes primeiro, pequenas preenchem gaps
            {
                const lfBins = runLargeFirstGlobalFill(pecasRestantes, binW, binH, spacing, kerf, groupSplitDir, binTypesToTry);
                const sc = scoreResultV5(lfBins, expectedPieceCount);
                if (sc.score < bestBinScore.score) {
                    bestBinScore = sc; bestBins = lfBins;
                    bestStrategyName = 'large_first_global_fill';
                    bestBinType = binTypesToTry[0];
                }
                console.log(`  [LargeFirst] ${groupKey}: score=${sc.score.toFixed(1)}, bins=${sc.bins}, avg=${sc.avgOccupancy.toFixed(1)}%`);
            }

            // FASE 2.98: Aggressive Pack — candidato extra no modo máximo.
            // A prioridade é economizar chapa; a regra é nunca aceitar layout sem validação.
            if (bodyConfig.qualidade === 'maximo' && pecasRestantes.length > 3 && !isOptimal()) {
                const timeoutMs = Math.min(30000, Math.max(8000, pecasRestantes.length * 80));
                const agStart = Date.now();
                const agBins = runAggressivePack(pecasRestantes, binW, binH, spacing, kerf, groupSplitDir, timeoutMs);
                const agTime = Date.now() - agStart;
                if (agBins?.length && verifyNoOverlaps(agBins)) {
                    const sc = scoreResultV5(agBins, expectedPieceCount);
                    if (sc.score < bestBinScore.score) {
                        bestBinScore = sc; bestBins = agBins;
                        bestStrategyName = `aggressive_pack_${timeoutMs}ms`;
                        bestBinType = binTypesToTry[0];
                    }
                    console.log(`  [Aggressive] ${groupKey}: score=${sc.score.toFixed(1)}, bins=${sc.bins}, avg=${sc.avgOccupancy.toFixed(1)}% (${agTime}ms)`);
                }
            }

            // FASE 3: R&R (iterações escalonadas pelo tamanho do lote) (skip if already optimal)
            const isLargeBatch = pecasRestantes.length > 100;
            const rrIter = isLargeBatch
                ? Math.max(3000, Math.min(8000, pecasRestantes.length * 15))
                : Math.max(800, Math.min(2000, pecasRestantes.length * 20));
            if (pecasRestantes.length > 3 && !isOptimal()) {
                for (const bt of binTypesToTry) {
                    const rrResult = ruinAndRecreate(pecasRestantes, binW, binH, spacing, bt, kerf, rrIter, groupSplitDir);
                    if (rrResult && rrResult.score.score < bestBinScore.score) {
                        bestBinScore = rrResult.score; bestBins = rrResult.bins;
                        bestStrategyName = `ruin_recreate+LAHC+${bt}`; bestBinType = bt;
                    }
                    totalCombinacoes += rrIter;
                }
                // Para lotes grandes, rodar R&R adicional com auto splitDir para ver se melhora
                if (isLargeBatch && groupSplitDir !== 'auto') {
                    for (const bt of binTypesToTry) {
                        const rrResult = ruinAndRecreate(pecasRestantes, binW, binH, spacing, bt, kerf, rrIter, 'auto');
                        if (rrResult && rrResult.score.score < bestBinScore.score) {
                            bestBinScore = rrResult.score; bestBins = rrResult.bins;
                            bestStrategyName = `ruin_recreate+LAHC+${bt}+autoDir`; bestBinType = bt;
                        }
                        totalCombinacoes += rrIter;
                    }
                }
            }

            // FASE 3.5: BRKGA (mais gerações para lotes grandes) (skip if already optimal ou qualidade=rapido)
            if (!skipAdvancedMulti && pecasRestantes.length > 3 && bestBinScore.bins > minTeoricoChapas && !isOptimal()) {
                const brkgaGen = Math.min(600, (isLargeBatch
                    ? Math.min(200, Math.max(80, pecasRestantes.length * 2))
                    : Math.min(100, Math.max(40, pecasRestantes.length * 3))) * qualMultMulti);
                const brkgaResult = runBRKGA(pecasRestantes, binW, binH, spacing, groupBinType, kerf, brkgaGen, groupSplitDir);
                if (brkgaResult && brkgaResult.score.score < bestBinScore.score) {
                    bestBinScore = brkgaResult.score; bestBins = brkgaResult.bins;
                    bestStrategyName = `BRKGA_${brkgaGen}gen`; bestBinType = groupBinType;
                }
                totalCombinacoes += brkgaGen * 40;
                // Tentar BRKGA com direção auto também
                if (isLargeBatch && groupSplitDir !== 'auto') {
                    const brkgaResult2 = runBRKGA(pecasRestantes, binW, binH, spacing, groupBinType, kerf, brkgaGen, 'auto');
                    if (brkgaResult2 && brkgaResult2.score.score < bestBinScore.score) {
                        bestBinScore = brkgaResult2.score; bestBins = brkgaResult2.bins;
                        bestStrategyName = `BRKGA_${brkgaGen}gen+autoDir`; bestBinType = groupBinType;
                    }
                    totalCombinacoes += brkgaGen * 40;
                }
            }

            // FASE 4: SIMULATED ANNEALING — cross-bin (skip if already optimal ou qualidade=rapido)
            if (!skipAdvancedMulti && bestBins && bestBins.length > 1 && bestBins.length > minTeoricoChapas && !isOptimal()) {
                const saIter = Math.min(200000, (isLargeBatch
                    ? Math.max(40000, Math.min(80000, pecasRestantes.length * 120))
                    : Math.max(15000, Math.min(40000, pecasRestantes.length * 80))) * qualMultMulti);
                console.log(`  [SA] Iniciando Simulated Annealing: ${saIter} iterações, ${bestBins.length} bins (mín teórico: ${minTeoricoChapas})`);
                const saStart = Date.now();
                const saResult = simulatedAnnealing(bestBins, binW, binH, spacing, bestBinType, kerf, saIter, groupSplitDir);
                const saTime = Date.now() - saStart;
                if (saResult && saResult.score.score < bestBinScore.score) {
                    const saved = bestBins.length - saResult.bins.length;
                    console.log(`  [SA] Melhorou! ${bestBins.length}→${saResult.bins.length} chapas (${saved > 0 ? '-' + saved + ' chapas = -R$' + (saved * 400) : 'melhor aproveitamento'}) em ${saTime}ms`);
                    bestBinScore = saResult.score; bestBins = saResult.bins;
                    bestStrategyName += '+SA';
                } else {
                    console.log(`  [SA] Sem melhoria (${saTime}ms)`);
                }
                // Tentar também com splitDir auto se diferente
                if (groupSplitDir !== 'auto') {
                    const saResult2 = simulatedAnnealing(bestBins, binW, binH, spacing, bestBinType, kerf, saIter, 'auto');
                    if (saResult2 && saResult2.score.score < bestBinScore.score) {
                        const saved = bestBins.length - saResult2.bins.length;
                        console.log(`  [SA auto] Melhorou! ${bestBins.length}→${saResult2.bins.length} chapas (${saved > 0 ? '-' + saved : 'melhor'}) com autoDir`);
                        bestBinScore = saResult2.score; bestBins = saResult2.bins;
                        bestStrategyName += '+SA_auto';
                    }
                }
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
                                const testBins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, groupSplitDir);
                                if (testBins.length <= targetBins && verifyNoOverlaps(testBins)) {
                                    const sc = scoreResultV5(testBins, expectedPieceCount);
                                    if (sc.score < bestBinScore.score) { bestBins = testBins; bestBinScore = sc; bestBinType = bt; bestStrategyName += '+gap_repack'; }
                                }
                                totalCombinacoes++;
                            }
                        }
                    }
                }
            }

            // FASE 6: CASCATA DE RETALHOS — redistribuir peças da chapa fraca usando sobras das outras
            if (bestBins && bestBins.length > 1 && bestBins.length > minTeoricoChapas) {
                const cascResult = cascadeRemnants(bestBins, binW, binH, spacing, bestBinType, kerf, groupSplitDir, sobraMinW, sobraMinH);
                if (cascResult.improved) {
                    const saved = bestBins.length - cascResult.bins.length;
                    console.log(`  [Cascade] ${groupKey}: ${bestBins.length}→${cascResult.bins.length} chapas (-${saved} = -R$${saved * 400})`);
                    bestBins = cascResult.bins;
                    bestBinScore = scoreResultV5(bestBins, expectedPieceCount);
                    bestStrategyName += '+cascade';
                }
            }

            // FASE 6.5: Cross-Bin Gap Fill
            if (bestBins && bestBins.length > 1) {
                const gapResult = crossBinGapFill(bestBins, binW, binH, spacing, bestBinType, kerf, groupSplitDir);
                if (gapResult && gapResult.improved && gapResult.bins) {
                    const sc = scoreResultV5(gapResult.bins, expectedPieceCount);
                    if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = gapResult.bins; bestStrategyName += '+gapfill'; }
                }
            }

            // Safety + Compactação + Validação de limites
            if (!verifyNoOverlaps(bestBins)) {
                bestBins = repairOverlaps(bestBins, binW, binH, spacing, bestBinType, kerf, groupSplitDir);
                bestBinScore = scoreResultV5(bestBins, expectedPieceCount);
            }
            for (const bin of bestBins) compactBin(bin, binW, binH, kerf, spacing, groupSplitDir);
            clampBinBounds(bestBins, binW, binH, bestBinType, kerf, groupSplitDir, spacing);

            // ═══ FINAL SAFETY CHECK — verificação definitiva pós-processamento ═══
            const safetyOk = finalSafetyCheck(bestBins, binW, binH, bestBinType, kerf, groupSplitDir, spacing);
            if (!safetyOk) {
                bestBinScore = scoreResultV5(bestBins, expectedPieceCount);
                console.log(`  [Nesting Multi] ${groupKey}: layout corrigido pelo safety check → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}%`);
            }

            // Validação guilhotina (logging apenas — não rejeita o layout)
            if (bestBinType === 'guillotine' || bestBinType === 'shelf') {
                for (let bi = 0; bi < bestBins.length; bi++) {
                    const gv = validateGuillotineCuts(bestBins[bi]);
                    if (!gv.valid) {
                        console.log(`  [Guilhotina] AVISO: Chapa ${bi + 1} do grupo ${groupKey} tem layout não-guilhotina`);
                    }
                }
            }

            const maxTeoricoAprov = totalPieceArea / (bestBins.length * sheetArea) * 100;
            console.log(`  [Nesting Multi] ${groupKey}: ${pecasRestantes.length} peças (${lotes.length} lotes) → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}% (${bestStrategyName}) [splitDir=${groupSplitDir}, chapaDirecao=${chapaDirecao}]`);
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
                    espessura_real: chapa.espessura_real || group.espessura,
                    comprimento: chapa.comprimento, largura: chapa.largura,
                    refilo, kerf, preco: chapa.preco || 0, veio: chapaVeio,
                    direcao_corte: chapaDirecao !== 'herdar' ? chapaDirecao : direcaoCorteRaw,
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
                    const cutPolicyM2 = smallPieceCutPolicy(clsM2);
                    if (cutPolicyM2) pecaM2.corte = cutPolicyM2;
                    // Add contour data for irregular pieces
                    if (contourMap[pecaId]) {
                        const contPtsM2 = contourMap[pecaId];
                        if (rect.rotated) {
                            // Rotate contour 90° CW: compOrig = original comprimento from DB
                            const pecaDbRef2 = allPecas.find(pp => pp.id === pecaId);
                            const compOrig2 = pecaDbRef2?.comprimento || Math.max(...contPtsM2.map(v => v.x));
                            pecaM2.contour = contPtsM2.map(v => ({ x: Math.round(v.y * 10) / 10, y: Math.round((compOrig2 - v.x) * 10) / 10 }));
                        } else {
                            pecaM2.contour = contPtsM2;
                        }
                    }
                    chapaInfo.pecas.push(pecaM2);
                }

                // Retalhos (Clip & Keep — apenas metadados, inserção no DB quando chapa for cortada)
                if (considerarSobra) {
                    const sobras = clipAndKeep(bin.freeRects, sobraMinW, sobraMinH);
                    for (const s of sobras) {
                        const w = Math.round(Math.max(s.w, s.h)), h = Math.round(Math.min(s.w, s.h));
                        chapaInfo.retalhos.push({
                            x: s.x, y: s.y, w: s.w, h: s.h,
                            sobra_w: w, sobra_h: h,
                            material_code: group.material_code,
                            espessura: group.espessura,
                            chapa_ref_id: chapa.id || null,
                            status: 'prevista',
                        });
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
        if (!plano.bandeja) plano.bandeja = {}; // Bandeja por material { "MAT_KEY": [peças...] }
        // Migrar transferencia antiga para bandeja (retrocompatibilidade)
        if (plano.transferencia && plano.transferencia.length > 0) {
            for (const t of plano.transferencia) {
                const mk = t.fromMaterial || 'unknown';
                if (!plano.bandeja[mk]) plano.bandeja[mk] = [];
                plano.bandeja[mk].push(t);
            }
            delete plano.transferencia;
        }
        const { chapaIdx, pecaIdx, action, x, y, targetChapaIdx, force } = req.body;
        const kerf = plano.config?.kerf || 4;
        const moveSpacing = Math.max(kerf, plano.config?.spacing || 0); // Espaçamento efetivo para movimentação

        // ── Snapshot transacional antes de ações críticas ──
        const SNAPSHOT_ACTIONS = ['move_to_sheet', 'from_transfer', 'from_bandeja', 'reoptimize_unlocked',
            'lock_sheet', 'unlock_sheet', 'compact', 're_optimize', 'ajustar_sobra',
            'marcar_refugo', 'merge_sobras', 'recalc_sobras', 'flip', 'set_plano'];
        if (SNAPSHOT_ACTIONS.includes(action)) {
            db.prepare('INSERT INTO cnc_plano_versions (lote_id, user_id, plano_json, acao_origem) VALUES (?, ?, ?, ?)')
                .run(lote.id, req.user.id, lote.plano_json, action);
            db.prepare(`DELETE FROM cnc_plano_versions WHERE lote_id = ? AND id NOT IN
                (SELECT id FROM cnc_plano_versions WHERE lote_id = ? ORDER BY id DESC LIMIT 50)`)
                .run(lote.id, lote.id);
        }

        // ── Gate de trava por chapa ──
        const SHEET_GATED_ACTIONS = ['move', 'rotate', 'flip', 'to_transfer', 'to_bandeja', 'compact', 're_optimize', 'ajustar_sobra', 'marcar_refugo', 'merge_sobras'];
        if (SHEET_GATED_ACTIONS.includes(action) && chapaIdx != null) {
            const lockErr = assertSheetUnlocked(plano, chapaIdx, action);
            if (lockErr) return res.status(423).json(lockErr);
        }
        // Gate para ações com destino
        if (['move_to_sheet', 'from_transfer', 'from_bandeja'].includes(action) && targetChapaIdx != null) {
            const lockErrDest = assertSheetUnlocked(plano, targetChapaIdx, 'receber peça');
            if (lockErrDest) return res.status(423).json(lockErrDest);
        }
        if (action === 'move_to_sheet' && chapaIdx != null) {
            const lockErrSrc = assertSheetUnlocked(plano, chapaIdx, 'mover peça');
            if (lockErrSrc) return res.status(423).json(lockErrSrc);
        }

        // ═══ ACTION: set_plano (persistir otimizações calculadas no cliente) ═══
        if (action === 'set_plano') {
            const novoPlano = req.body.plano;
            if (!novoPlano || !Array.isArray(novoPlano.chapas)) {
                return res.status(400).json({ error: 'Plano inválido' });
            }
            if (!novoPlano.bandeja) novoPlano.bandeja = {};
            const avgAprov = recalcOccupancy(novoPlano);
            db.prepare('UPDATE cnc_lotes SET plano_json = ?, aproveitamento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
                .run(JSON.stringify(novoPlano), avgAprov, lote.id);
            return res.json({ ok: true, plano: novoPlano, aproveitamento: avgAprov });

        // ═══ ACTION: move ═══════════════════════════════════════════════
        } else if (action === 'move') {
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
            peca.lado_manual = true; // Flag: operador escolheu manualmente

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

        // ═══ ACTION: to_transfer / to_bandeja ═══════════════════════════
        } else if (action === 'to_transfer' || action === 'to_bandeja') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            chapa.pecas.splice(pecaIdx, 1);
            peca.fromChapaIdx = chapaIdx;
            peca.fromMaterial = chapa.material_code || chapa.material;
            peca.espessura = chapa.espessura;
            peca.veio = chapa.veio;
            const matKey = peca.fromMaterial;
            if (!plano.bandeja[matKey]) plano.bandeja[matKey] = [];
            plano.bandeja[matKey].push(peca);

        // ═══ ACTION: from_transfer / from_bandeja ════════════════════════
        } else if (action === 'from_transfer' || action === 'from_bandeja') {
            const { transferIdx, bandejaIdx, materialKey } = req.body;
            const targetChapa = plano.chapas[targetChapaIdx];
            if (!targetChapa) return res.status(400).json({ error: 'Chapa destino inválida' });

            // Determinar material key e índice da peça na bandeja
            const matKey = materialKey || targetChapa.material_code || targetChapa.material;
            const bIdx = bandejaIdx ?? transferIdx;
            if (bIdx == null || !plano.bandeja[matKey] || !plano.bandeja[matKey][bIdx]) {
                return res.status(400).json({ error: 'Peça não encontrada na bandeja' });
            }
            const peca = plano.bandeja[matKey][bIdx];

            const ref = targetChapa.refilo || 0;
            const targetX = x ?? 0, targetY = y ?? 0;
            const testPeca = { ...peca, x: targetX, y: targetY };

            if (!checkBounds(testPeca, targetChapa)) {
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

            plano.bandeja[matKey].splice(bIdx, 1);
            if (plano.bandeja[matKey].length === 0) delete plano.bandeja[matKey];
            delete peca.fromChapaIdx;
            delete peca.fromMaterial;
            peca.x = testPeca.x;
            peca.y = testPeca.y;
            targetChapa.pecas.push(peca);

        // ═══ ACTION: rotate_bandeja ═══════════════════════════════════
        } else if (action === 'rotate_bandeja') {
            const { bandejaIdx, materialKey } = req.body;
            const matKey = materialKey;
            if (!matKey || !plano.bandeja[matKey] || !plano.bandeja[matKey][bandejaIdx]) {
                return res.status(400).json({ error: 'Peça não encontrada na bandeja' });
            }
            const bp = plano.bandeja[matKey][bandejaIdx];
            const tmp = bp.w; bp.w = bp.h; bp.h = tmp;
            bp.rotated = !bp.rotated;

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
            // Incluir peças da bandeja na reotimização
            for (const [bMatKey, bPieces] of Object.entries(plano.bandeja || {})) {
                for (const t of bPieces) {
                    const matKey = t.fromMaterial || bMatKey;
                    if (matKey && piecesByMaterial[matKey]) piecesByMaterial[matKey].pieces.push(t);
                }
            }

            // Chamar Python para cada grupo de material
            // isPythonAvailable e callPython já importados no topo do arquivo
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
                    const pyResult = await callPython('optimize', payload);
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
            plano.bandeja = {}; // Peças realocadas

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
            if (!restored.bandeja) restored.bandeja = {};
            // Migrar transferencia antiga em snapshots de undo
            if (restored.transferencia) {
                for (const t of restored.transferencia) {
                    const mk = t.fromMaterial || 'unknown';
                    if (!restored.bandeja[mk]) restored.bandeja[mk] = [];
                    restored.bandeja[mk].push(t);
                }
                delete restored.transferencia;
            }
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
    // Busca config do usuário; fallback para a linha legada (id=1) se ainda não tiver a própria
    let cfg = db.prepare('SELECT * FROM cnc_etiqueta_config WHERE user_id = ? LIMIT 1').get(req.user.id);
    if (!cfg) {
        cfg = db.prepare('SELECT * FROM cnc_etiqueta_config WHERE id = 1').get();
    }
    if (!cfg) {
        // Cria config padrão para o usuário
        db.prepare('INSERT INTO cnc_etiqueta_config (id, user_id) VALUES (NULL, ?)').run(req.user.id);
        cfg = db.prepare('SELECT * FROM cnc_etiqueta_config WHERE user_id = ? LIMIT 1').get(req.user.id);
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

    const vals = [
        formato ?? '100x70', orientacao ?? 'paisagem', colunas_impressao ?? 2,
        margem_pagina ?? 8, gap_etiquetas ?? 4,
        mostrar_usia ?? 1, mostrar_usib ?? 1, mostrar_material ?? 1, mostrar_espessura ?? 1,
        mostrar_cliente ?? 1, mostrar_projeto ?? 1, mostrar_codigo ?? 1, mostrar_modulo ?? 1,
        mostrar_peca ?? 1, mostrar_dimensoes ?? 1, mostrar_bordas_diagrama ?? 1, mostrar_fita_resumo ?? 1,
        mostrar_acabamento ?? 1, mostrar_id_modulo ?? 1, mostrar_controle ?? 1, mostrar_produto_final ?? 0,
        mostrar_observacao ?? 1, mostrar_codigo_barras ?? 1,
        fonte_tamanho ?? 'medio', empresa_nome ?? '', empresa_logo_url ?? '', cor_borda_fita ?? '#22c55e', cor_controle ?? '',
    ];

    // Tenta atualizar a linha do usuário; se não existir, cria
    const upd = db.prepare(`UPDATE cnc_etiqueta_config SET
        formato=?, orientacao=?, colunas_impressao=?, margem_pagina=?, gap_etiquetas=?,
        mostrar_usia=?, mostrar_usib=?, mostrar_material=?, mostrar_espessura=?,
        mostrar_cliente=?, mostrar_projeto=?, mostrar_codigo=?, mostrar_modulo=?,
        mostrar_peca=?, mostrar_dimensoes=?, mostrar_bordas_diagrama=?, mostrar_fita_resumo=?,
        mostrar_acabamento=?, mostrar_id_modulo=?, mostrar_controle=?, mostrar_produto_final=?,
        mostrar_observacao=?, mostrar_codigo_barras=?,
        fonte_tamanho=?, empresa_nome=?, empresa_logo_url=?, cor_borda_fita=?, cor_controle=?,
        atualizado_em=CURRENT_TIMESTAMP
        WHERE user_id = ?`).run(...vals, req.user.id);

    if (upd.changes === 0) {
        // Linha do usuário ainda não existe — insere (NULL id = autoincrement)
        db.prepare(`INSERT INTO cnc_etiqueta_config
            (id, user_id, formato, orientacao, colunas_impressao, margem_pagina, gap_etiquetas,
             mostrar_usia, mostrar_usib, mostrar_material, mostrar_espessura,
             mostrar_cliente, mostrar_projeto, mostrar_codigo, mostrar_modulo,
             mostrar_peca, mostrar_dimensoes, mostrar_bordas_diagrama, mostrar_fita_resumo,
             mostrar_acabamento, mostrar_id_modulo, mostrar_controle, mostrar_produto_final,
             mostrar_observacao, mostrar_codigo_barras,
             fonte_tamanho, empresa_nome, empresa_logo_url, cor_borda_fita, cor_controle)
            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(req.user.id, ...vals);
    }
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
    try { t.elementos = JSON.parse(t.elementos || '[]'); } catch { t.elementos = []; }
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
    const tc = (worker.tool_code || worker.tool || '').toLowerCase();
    const diam = Number(worker.diameter || 0);
    // 0) Match por tool_code (mais específico — ex: chanfro_45 → tipo chanfro)
    for (const t of usinagemTipos) {
        if (!t.categoria_match) continue;
        const cats = t.categoria_match.toLowerCase().split(',').map(s => s.trim());
        if (cats.some(c => tc.includes(c))) return t;
    }
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

function opStartPoint(op) {
    if (op?.isContorno && op.isOpenPath && op.contornoSegments?.[0]?.[0]) {
        return op.contornoSegments[0][0];
    }
    if (op?.opType === 'milling_path' && op.millingPath?.[0]) {
        return op.millingPath[0];
    }
    if (op?.isContorno && op.contornoPath?.[0]) {
        return op.contornoPath[0];
    }
    return { x: Number(op?.absX || 0), y: Number(op?.absY || 0) };
}

function opEndPoint(op) {
    if (op?.isContorno && op.isOpenPath && op.contornoSegments?.length) {
        const lastSeg = op.contornoSegments[op.contornoSegments.length - 1];
        return lastSeg?.[lastSeg.length - 1] || opStartPoint(op);
    }
    if (op?.opType === 'milling_path' && op.millingPath?.length) {
        return op.millingClosed ? op.millingPath[0] : op.millingPath[op.millingPath.length - 1];
    }
    if (op?.opType === 'groove' && Number.isFinite(op.absX2) && Number.isFinite(op.absY2)) {
        return { x: op.absX2, y: op.absY2 };
    }
    // Furos, pockets e contornos fechados terminam, na prática, próximos do ponto de entrada.
    return opStartPoint(op);
}

function pointDist2(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function pointDist(a, b) {
    return Math.sqrt(pointDist2(a, b));
}

function routeRapidDistance(ops, start = { x: 0, y: 0 }) {
    let cur = start;
    let total = 0;
    for (const op of ops) {
        const st = opStartPoint(op);
        total += pointDist(cur, st);
        cur = opEndPoint(op);
    }
    return total;
}

// ─── Helper: Nearest-neighbor (minimizar G0) ───────────
function orderByProximity(ops, start = { x: 0, y: 0 }) {
    if (ops.length <= 1) return ops;
    const rem = [...ops];
    const ord = [];
    let cursor = start;
    while (rem.length > 0) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < rem.length; i++) {
            const d = pointDist2(cursor, opStartPoint(rem[i]));
            if (d < bd) { bd = d; bi = i; }
        }
        const chosen = rem.splice(bi, 1)[0];
        ord.push(chosen);
        cursor = opEndPoint(chosen);
    }
    // Aplicar 2-opt para melhorar ~15-20% a distância total de deslocamento
    return twoOptImprove(ord, start);
}

// ─── Helper: 2-opt improvement (TSP local search) ──────
function twoOptImprove(ops, start = { x: 0, y: 0 }) {
    if (ops.length < 4) return ops;
    let improved = true;
    let iterations = 0;
    const maxIter = 8; // Limitar iterações para performance
    while (improved && iterations < maxIter) {
        improved = false;
        iterations++;
        let bestDistance = routeRapidDistance(ops, start);
        for (let i = 1; i < ops.length - 1; i++) {
            for (let j = i + 1; j < ops.length; j++) {
                const candidate = [...ops];
                candidate.splice(i, j - i + 1, ...candidate.slice(i, j + 1).reverse());
                const after = routeRapidDistance(candidate, start);
                if (after < bestDistance - 0.01) {
                    ops.splice(i, j - i + 1, ...candidate.slice(i, j + 1));
                    bestDistance = after;
                    improved = true;
                }
            }
        }
    }
    return ops;
}

function classOrderForCut(op) {
    if (op?.clsOrder != null) return op.clsOrder;
    if (op?.classificacao === 'super_pequena') return 0;
    if (op?.classificacao === 'pequena') return 1;
    return 2;
}

function contourSmallFirstCompare(a, b) {
    const clsA = classOrderForCut(a);
    const clsB = classOrderForCut(b);
    if (clsA !== clsB) return clsA - clsB;
    const areaA = Number(a?.areaCm2 || 0);
    const areaB = Number(b?.areaCm2 || 0);
    if (Math.abs(areaA - areaB) > 1) return areaA - areaB;
    return (b?.vacuumRiskIndex ?? 0) - (a?.vacuumRiskIndex ?? 0);
}

function sameSmallFirstBucket(a, b) {
    if (classOrderForCut(a) !== classOrderForCut(b)) return false;
    const areaA = Number(a?.areaCm2 || 0);
    const areaB = Number(b?.areaCm2 || 0);
    const maxArea = Math.max(areaA, areaB, 1);
    const areaClose = Math.abs(areaA - areaB) <= Math.max(50, maxArea * 0.25);
    const riskClose = Math.abs((a?.vacuumRiskIndex ?? 0) - (b?.vacuumRiskIndex ?? 0)) <= 0.2;
    return areaClose && riskClose;
}

function validateGeneratedGcode(gcodeText, ctx = {}) {
    const alertas = [];
    const cmt = ctx.cmt || ';';
    const espChapa = Number(ctx.espChapa || 18.5);
    const zOrigin = ctx.zOrigin || 'mesa';
    const depthMax = Number(ctx.depthMaxAbsoluto || (espChapa + 0.5));
    const zSafe = Number(ctx.zSafe ?? (zOrigin === 'mesa' ? espChapa + 30 : 30));
    const maxZ = Math.max(zSafe + 80, 250);
    const minZ = zOrigin === 'mesa' ? espChapa - depthMax - 0.05 : -depthMax - 0.05;
    const lines = String(gcodeText || '').split(/\r?\n/);
    let motionLines = 0;
    let cuttingMoves = 0;
    let spindleOn = false;

    const add = (tipo, msg) => alertas.push({ tipo, msg });

    lines.forEach((line, idx) => {
        const raw = String(line || '');
        const s = raw.replace(/^N\d+\s*/, '').trim();
        if (!s || s.startsWith(cmt) || s.startsWith('(') || s.startsWith('%')) return;
        const ref = `linha ${idx + 1}`;
        if (/\b(?:NaN|undefined|null|Infinity)\b/i.test(s)) {
            add('erro_critico', `G-code inválido em ${ref}: contém valor não numérico (${s})`);
        }
        if (/\bF0(?:\.0+)?\b/i.test(s)) add('erro_critico', `Feed F0 detectado em ${ref}; isso pode travar a CNC.`);
        if (/\bS0(?:\.0+)?\b/i.test(s)) add('erro_critico', `Spindle S0 detectado em ${ref}; rotação inválida para corte.`);
        if (/\bM0?3\b/i.test(s)) spindleOn = true;
        if (/\bM0?5\b/i.test(s)) spindleOn = false;
        const gMatch = s.match(/\bG0?([0-3])\b/i);
        if (!gMatch) return;
        motionLines++;
        const g = Number(gMatch[1]);
        const zMatch = s.match(/\bZ(-?\d+(?:\.\d+)?)\b/i);
        const z = zMatch ? Number(zMatch[1]) : null;
        if (z != null && (z < minZ || z > maxZ)) {
            add('erro_critico', `Z fora do envelope seguro em ${ref}: Z${z.toFixed(3)}. Limite esperado ${minZ.toFixed(3)} a ${maxZ.toFixed(3)}.`);
        }
        if (g > 0) {
            cuttingMoves++;
            if (!spindleOn) add('aviso', `Movimento de corte sem spindle ligado antes de ${ref}. Confira pós-processador/comando M3.`);
        }
    });

    if (motionLines < 3) add('erro_critico', 'G-code sem movimentos suficientes para execução.');
    if (ctx.totalOps > 0 && cuttingMoves === 0) add('erro_critico', `G-code com ${ctx.totalOps} operação(ões), mas sem movimentos de corte G1/G2/G3.`);

    const expected = ctx.expectedCounts || {};
    const opText = String(gcodeText || '');
    const countComment = (pattern) => (opText.match(pattern) || []).length;
    const generatedCounts = {
        hole: countComment(/\[OP\s+type=furo\b/gi),
        groove: countComment(/\[OP\s+type=rasgo\b/gi),
        pocket: countComment(/\[OP\s+type=rebaixo\b/gi),
    };
    for (const [key, expectedCount] of Object.entries(expected)) {
        if (!expectedCount) continue;
        const got = generatedCounts[key] || 0;
        if (got < expectedCount) {
            add('erro_critico', `G-code incompleto: esperado ${expectedCount} operação(ões) ${key}, gerado ${got}.`);
        }
    }

    return alertas;
}

function hasCriticalGcodeAlert(result) {
    return (result?.alertas || []).some(a => a?.tipo === 'erro_critico');
}

function isMdfMelamineLike(value) {
    const txt = String(value || '').toLowerCase();
    return /\bmdf\b/.test(txt) || txt.includes('melamin') || txt.includes('melamina') || txt.includes('bp ') || txt.includes('tx');
}

function smallPieceCutPolicy(cls) {
    if (cls === 'super_pequena') {
        return {
            passes: 2,
            velocidade: 'lenta',
            tabs: false,
            fixacao: 'onion_skin',
            motivo: 'MDF/melamina: sem tabs para evitar lascar a face',
        };
    }
    if (cls === 'pequena') {
        return {
            passes: 1,
            velocidade: 'media',
            tabs: false,
            fixacao: 'ordem_pequenas_primeiro',
            motivo: 'MDF/melamina: sem tabs para evitar retrabalho na borda',
        };
    }
    return null;
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

function catalogTextMatch(rule, value) {
    const raw = String(rule || '').trim();
    if (!raw) return true;
    const txt = String(value || '').toLowerCase();
    return raw.split(',').some(part => {
        const p = part.trim().toLowerCase();
        if (!p) return true;
        if (p === '*') return true;
        if (p.includes('*')) {
            const re = new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
            return re.test(txt);
        }
        return txt.includes(p);
    });
}

function catalogFaceMatch(rule, worker, ladoAtivo) {
    const face = String(worker?.face || worker?.side || worker?.lado || ladoAtivo || '').toLowerCase();
    return catalogTextMatch(rule, face);
}

function catalogDepth(entry, worker, espChapa) {
    if (!entry?.tem_padrao) return null;
    const mode = String(entry.profundidade_modo || 'fixa');
    const extra = Number(entry.profundidade_extra || 0);
    if (mode === 'plugin') return null;
    if (mode === 'percentual_espessura') {
        const pct = Number(entry.profundidade_percentual);
        return pct > 0 ? (Number(espChapa || 0) * pct / 100) + extra : null;
    }
    if (mode === 'atravessar') return Number(espChapa || 0) + extra;
    if (mode === 'nao_atravessar') {
        const base = entry.profundidade != null ? Number(entry.profundidade) : Number(worker?.depth || 0);
        const safety = Math.max(0.2, Number(entry.borda_min || 0.3));
        return Math.min(base + extra, Math.max(0, Number(espChapa || 0) - safety));
    }
    return entry.profundidade != null ? Number(entry.profundidade) + extra : null;
}

function selectUsinagemCatalogEntry(worker, usinagemCatalogMap, ctx) {
    const name = String(worker?.component_name || '').trim();
    if (!name) return null;
    const exact = usinagemCatalogMap[name] || [];
    const wildcard = usinagemCatalogMap.__wildcards || [];
    const candidates = [...(Array.isArray(exact) ? exact : [exact]), ...wildcard.filter(r => catalogTextMatch(r.component_name, name))]
        .filter(Boolean)
        .filter(r => !r.maquina_id || Number(r.maquina_id) === Number(ctx.maquinaId))
        .filter(r => catalogTextMatch(r.material_match, ctx.materialDesc))
        .filter(r => catalogFaceMatch(r.face_match, worker, ctx.ladoAtivo));
    candidates.sort((a, b) => {
        const pri = Number(a.prioridade ?? 5) - Number(b.prioridade ?? 5);
        if (pri !== 0) return pri;
        return Number(!!b.maquina_id) - Number(!!a.maquina_id);
    });
    return candidates[0] || null;
}

// ═══════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: Gerar G-code para UMA chapa
// ═══════════════════════════════════════════════════════
// ─── Template variable resolver ─────────────────────────────────────
// Supports: {chapa}, {material}, {data}, {hora}, {maquina}, {operador},
//           {t} or {tool} = tool code, {rpm}, {diametro}, {nome}
function resolvePostProcessorTemplate(str, ctx) {
    if (!str || !str.includes('{')) return str;
    return str
        .replace(/\{chapa\}/gi,    () => ctx.chapaIdx !== undefined ? String(ctx.chapaIdx + 1) : '?')
        .replace(/\{material\}/gi, () => ctx.material   || '?')
        .replace(/\{data\}/gi,     () => new Date().toLocaleDateString('pt-BR'))
        .replace(/\{hora\}/gi,     () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
        .replace(/\{maquina\}/gi,  () => ctx.maquinaNome || '?')
        .replace(/\{operador\}/gi, () => ctx.operador   || '')
        .replace(/\{t\}/gi,        () => ctx.toolCode   || '?')
        .replace(/\{tool\}/gi,     () => ctx.toolCode   || '?')
        .replace(/\{rpm\}/gi,      () => ctx.rpm !== undefined ? String(ctx.rpm) : '?')
        .replace(/\{diametro\}/gi, () => ctx.diametro !== undefined ? String(ctx.diametro) : '?')
        .replace(/\{nome\}/gi,     () => ctx.toolNome   || '?');
}

function generateGcodeForChapa(chapa, chapaIdx, pecasDb, maquina, toolMap, usinagemTipos, cfg, opOverrides = {}, opOverridesPeca = {}, usinagemCatalogMap = {}) {
    // --- Config da máquina ---
    const headerRaw = maquina.gcode_header || '%\nG90 G54 G17';
    const footerRaw = maquina.gcode_footer || 'G0 Z200.000\nM5\nM30\n%';
    // Resolve header/footer template variables (chapa-level context)
    const tplCtxChapa = {
        chapaIdx,
        material: chapa.material || chapa.material_code || '',
        maquinaNome: maquina.nome || '',
        operador: maquina.operador || '',
    };
    const header = resolvePostProcessorTemplate(headerRaw, tplCtxChapa);
    const footer = resolvePostProcessorTemplate(footerRaw, tplCtxChapa);
    const zSeg = Math.max(5, maquina.z_seguro || 30); // mínimo 5mm de retração segura
    const velCorteMaq = Math.max(100, maquina.vel_corte || 4000); // F0 trava a CNC
    const profExtraMaq = maquina.profundidade_extra ?? 0.1;
    const dec = maquina.casas_decimais || 3;
    const cmt = maquina.comentario_prefixo || ';';
    const trocaCmdRaw = maquina.troca_ferramenta_cmd || 'M6';
    const sOnRaw = maquina.spindle_on_cmd || 'M3';
    const sOff = maquina.spindle_off_cmd || 'M5';
    // SEGURANÇA: rpmDef = 0 causa S0 que significa spindle OFF → mínimo 1000 RPM como fallback
    const rpmDef = Math.max(1000, maquina.rpm_padrao || 12000);
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
    // SEGURANÇA: velMergulho = 0 causa F0 que TRAVA a CNC → mínimo 100mm/min
    const velMergulho = Math.max(100, maquina.vel_mergulho ?? 1500);   // mm/min plunge feed
    const zAproxRapida = maquina.z_aproximacao_rapida ?? 5.0; // mm acima do material para G0 rápido
    const ordenarContornos = maquina.ordenar_contornos || 'menor_primeiro';
    const usarLeadIn = maquina.usar_lead_in !== 0;
    const leadInRaio = maquina.lead_in_raio ?? 5.0;
    // Novos campos G-Code v4 — Estratégias avançadas
    // Estes valores são defaults da máquina; ferramentas individuais podem sobrescrever abaixo
    const rampaTipoMaq = maquina.rampa_tipo || 'linear';        // linear, helicoidal, plunge
    const velRampaMaq = maquina.vel_rampa ?? velMergulho;       // velocidade da rampa (mm/min)
    const rampaDiamPctMaq = maquina.rampa_diametro_pct ?? 80;   // % do diâmetro para raio da hélice
    // Aliases mantidos para compatibilidade (sobrescritos por tool quando necessário, dentro do loop)
    let rampaTipo = rampaTipoMaq;
    let velRampa = velRampaMaq;
    let rampaDiamPct = rampaDiamPctMaq;
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
    const velVazio = Math.max(1000, maquina.vel_vazio || 20000); // F0 em G0 trava a CNC

    const fmt = (n) => Number(n).toFixed(dec);
    const refilo = chapa.refilo || 10;
    const alertas = [];
    const missingTools = new Set();
    const missingToolDetails = []; // { tool_code, peca, operacao }
    const materialDesc = `${chapa.material || ''} ${chapa.material_code || ''}`;
    const avoidTabsForMaterial = isMdfMelamineLike(materialDesc);
    if (avoidTabsForMaterial && maquina.usar_tabs === 1) {
        alertas.push({
            tipo: 'aviso',
            msg: `Tabs desativados para ${materialDesc.trim() || 'MDF/melamina'}: em MDF melamínico a remoção pode quebrar a face. Usando small-first + onion-skin/feed reduzido.`,
        });
    }
    // Espessura real da chapa — resolve do plano, ou busca no DB pelo material_code, ou fallback
    // SEGURANÇA: espChapa NaN/null causaria "Z NaN" no G-code → falha de segurança na máquina
    let espChapa = Number(chapa.espessura_real) || 0;
    if (espChapa <= 0 && chapa.material_code) {
        const chapaDb = db.prepare('SELECT espessura_real FROM cnc_chapas WHERE material_code = ? AND ativo = 1 LIMIT 1').get(chapa.material_code);
        if (chapaDb) espChapa = Number(chapaDb.espessura_real) || 0;
    }
    if (espChapa <= 0) espChapa = 18.5; // fallback industrial padrão

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

    // ─── Transformação de eixos X/Y ───
    // Padrão: X da máquina = largura (menor), Y da máquina = comprimento (maior)
    // No sistema interno: x = comprimento, y = largura
    // Então por padrão trocamos: X_maq = y_sys (largura), Y_maq = x_sys (comprimento)
    // Se trocar_eixos_xy = 1, desativa a troca (X_maq = x_sys, Y_maq = y_sys)
    const swapOff = maquina.trocar_eixos_xy === 1; // "trocar" = desativar o swap padrão
    const invertX = maquina.eixo_x_invertido === 1;
    const invertY = maquina.eixo_y_invertido === 1;
    const sheetW = chapa.comprimento || (maquina.x_max || 2800);
    const sheetH = chapa.largura || (maquina.y_max || 1900);
    // Transform: swap by default (unless trocar_eixos_xy toggled off)
    function mapXY(x, y) {
        // Default: X_maq = y (largura), Y_maq = x (comprimento)
        let ox = swapOff ? x : y;
        let oy = swapOff ? y : x;
        const maxOx = swapOff ? sheetW : sheetH;
        const maxOy = swapOff ? sheetH : sheetW;
        if (invertX) ox = maxOx - ox;
        if (invertY) oy = maxOy - oy;
        return [ox, oy];
    }
    // XY pair formatted: returns "X... Y..." string
    function XY(x, y) { const [ox, oy] = mapXY(x, y); return 'X' + fmt(ox) + ' Y' + fmt(oy); }
    // I/J arc offsets — relative, so only swap (no invert)
    function IJ(i, j) { return 'I' + fmt(swapOff ? i : j) + ' J' + fmt(swapOff ? j : i); }

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

    // --- Ferramenta de contorno (prioridade: config > fresa_compressao > fresa_reta > fresa genérica) ---
    let contTool = cfg.contorno_tool_code ? toolMap[cfg.contorno_tool_code] : null;
    if (!contTool) {
        const allTools = Object.values(toolMap);
        contTool = allTools.find(t => t.tipo_corte === 'fresa_compressao')
            || allTools.find(t => t.tipo_corte === 'fresa_reta')
            || allTools.find(t => t.tipo === 'fresa');
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

            // Coords locais — declaradas aqui para ficarem disponíveis no bloco is_edge_operation
            let wx, wy, wx2, wy2;

            // ─── Operações de borda (furação horizontal) ───
            // Estas operações são executadas nas laterais da peça (left/right/front/rear)
            // e precisam de transformação de coordenadas para o eixo horizontal do CNC.
            // Máquinas sem agregado horizontal não podem executar essas operações.
            if (w.is_edge_operation) {
                const edgeFace = w.edge_face || '';
                // Transformar coordenadas: no WPS, position_x/y/z são relativas à face da peça
                // Para furação horizontal: x na peça = posição ao longo do comprimento,
                // y na peça = profundidade do furo na borda, z = posição na espessura
                let edgeX = Number(w.x ?? 0);
                let edgeY = Number(w.y ?? 0);
                let edgeZ = Number(w.z ?? w.position_z ?? 0);
                let edgeDepth = Number(w.depth ?? 5);

                // Remapear coordenadas baseado na face da borda
                if (edgeFace === 'left' || edgeFace === 'right') {
                    // Furo na lateral: x(peça)=y(borda), y(peça)=z(borda), depth entra pela borda
                    wx = edgeY;           // posição ao longo da largura
                    wy = edgeX;           // posição ao longo do comprimento
                    if (edgeFace === 'right') wx = largOrig - edgeY;
                } else if (edgeFace === 'front' || edgeFace === 'rear' || edgeFace === 'back') {
                    // Furo na frente/traseira: x normal, depth entra pela borda
                    wx = edgeX;
                    wy = edgeFace === 'front' ? 0 : largOrig;
                }

                // Furos laterais: só incluir se máquina tem agregado horizontal / centro de furação
                const exportarLaterais = maquina.exportar_furos_laterais === 1;
                if (!exportarLaterais) {
                    continue; // CNC plana não executa furação horizontal
                }
                allOps.push({
                    pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                    absX: refilo + pX + (rotated ? (() => { const t = transformRotated(wx, wy, compOrig); return t.x; })() : wx),
                    absY: refilo + pY + (rotated ? (() => { const t = transformRotated(wx, wy, compOrig); return t.y; })() : wy),
                    absX2: undefined, absY2: undefined,
                    opType: 'edge_hole',
                    fase: 0, prioridade: 5, tipoNome: `Furo borda (${edgeFace})`,
                    toolCode: tc, toolCodigo: '', toolNome: tc,
                    toolRpm: 0, toolDiam: Number(w.diameter || 0),
                    depthTotal: edgeDepth, passes: [edgeDepth], velCorte: 0,
                    pocketW: 0, pocketH: 0,
                    classificacao: cls, areaCm2, isPequena: isPeq,
                    isContorno: false, needsOnionSkin: false,
                    grooveMultiPass: false, grooveOffsets: [0], grooveWidth: 0, toolAdapted: false,
                    resolvedMetodo: 'edge_drill', holeDiameter: Number(w.diameter || 0),
                    hasOverride: false,
                    edgeInfo: { face: edgeFace, depth: edgeDepth, diameter: Number(w.diameter || 0), z: edgeZ },
                });
                continue; // Não processar como operação vertical
            }

            // ─── Catálogo de Usinagem: lookup por component_name (SketchUp → parâmetros CNC) ───
            // Prioridade: opOverrides (painel) > catalogEntry (catálogo) > geometria do plugin
            const catalogEntry = selectUsinagemCatalogEntry(w, usinagemCatalogMap, {
                maquinaId: maquina.id,
                materialDesc,
                ladoAtivo,
            });

            // ─── Overrides de operação ───
            const diam = Number(w.diameter || 0);
            const diamKey = diam > 0 ? Math.round(diam * 10) / 10 : 0;
            const opKey = `${tipo || 'unknown'}__d${diamKey}__${tc}`;
            const groupOv = opOverrides[opKey];
            const pecaOv = opOverridesPeca[`${opKey}__${pp.pecaId}`];

            // Check se desativado (peça override > grupo override)
            if (pecaOv && pecaOv.ativo === 0) continue;
            if (!pecaOv && groupOv && groupOv.ativo === 0) continue;

            // Aplicar overrides de diâmetro e profundidade
            // Prioridade: override manual > catálogo (tem_padrao) > geometria do JSON
            const catDiam = (catalogEntry?.tem_padrao && catalogEntry.diametro != null) ? catalogEntry.diametro : null;
            const catDepth = catalogDepth(catalogEntry, w, espChapa);
            const ovDiam = pecaOv?.diametro_override ?? groupOv?.diametro_override ?? catDiam ?? null;
            const ovDepth = pecaOv?.profundidade_override ?? groupOv?.profundidade_override ?? catDepth ?? null;
            const catMetodo = (catalogEntry?.tem_padrao && catalogEntry.metodo) ? catalogEntry.metodo : '';
            const ovMetodo = groupOv?.metodo || catMetodo || '';
            const ovFerramentaId = groupOv?.ferramenta_id || null;
            const ovRpm = groupOv?.rpm_override ?? ((catalogEntry?.tem_padrao && catalogEntry.rpm != null) ? catalogEntry.rpm : null) ?? null;
            const ovFeed = groupOv?.feed_override ?? ((catalogEntry?.tem_padrao && catalogEntry.feed_rate != null) ? catalogEntry.feed_rate : null) ?? null;
            const ovStepoverPct = groupOv?.stepover_override ?? ((catalogEntry?.tem_padrao && catalogEntry.stepover_pct != null) ? catalogEntry.stepover_pct : null);
            const opStepoverPct = ovStepoverPct != null ? Math.max(5, Math.min(95, Number(ovStepoverPct))) / 100 : stepoverPct;
            const ovPassesAcab = groupOv?.passes_acabamento_override ?? ((catalogEntry?.tem_padrao && catalogEntry.passes_acabamento != null) ? catalogEntry.passes_acabamento : null);

            // Se tem override de ferramenta, usar ela
            // Prioridade: override manual > catálogo tool_code > tool_code do JSON
            let effectiveToolCode = tc;
            if (ovFerramentaId) {
                const ovTool = Object.values(toolMap).find(t => t.id === ovFerramentaId);
                if (ovTool && ovTool.tool_code) effectiveToolCode = ovTool.tool_code;
            } else if (catalogEntry?.tem_padrao && catalogEntry.tool_code) {
                effectiveToolCode = catalogEntry.tool_code;
            }

            if (effectiveToolCode && !toolMap[effectiveToolCode]) {
                missingTools.add(effectiveToolCode);
                missingToolDetails.push({ tool_code: effectiveToolCode, peca: pDb.descricao, operacao: tipo || w.type || 'desconhecida' });
            }
            const tool = toolMap[effectiveToolCode] || toolMap[tc] || null;
            const usiTipo = mapWorkerToTipo(w, usinagemTipos);

            // ── Aplicar configurações de rampa por ferramenta (sobrescreve padrão da máquina) ──
            rampaTipo = tool?.rampa_tipo ?? rampaTipoMaq;
            velRampa = tool?.vel_rampa ?? velRampaMaq;
            rampaDiamPct = tool?.rampa_diametro_pct ?? rampaDiamPctMaq;

            // Coords locais (wx/wy já declarados acima)
            wx2 = undefined; wy2 = undefined;
            if (w.pos_start_for_line) {
                wx = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
                wy = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
                wx2 = Number(w.pos_end_for_line?.position_x ?? w.pos_end_for_line?.x ?? wx);
                wy2 = Number(w.pos_end_for_line?.position_y ?? w.pos_end_for_line?.y ?? wy);
            } else if (w.path && Array.isArray(w.path) && w.path.length >= 2) {
                // usi_line/usi_point_to_point: usar primeiro e último pontos do path
                const first = w.path[0];
                const last = w.path[w.path.length - 1];
                wx = Number(first.x ?? 0);
                wy = Number(first.y ?? 0);
                wx2 = Number(last.x ?? wx);
                wy2 = Number(last.y ?? wy);
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

            // ─── Transformar path completo de fresamento (transfer_milling, usi_line, chanfro) ───
            let millingPath = null;
            if (w.path && Array.isArray(w.path) && w.path.length >= 2) {
                millingPath = w.path.map(pt => {
                    let px = Number(pt.x ?? 0), py = Number(pt.y ?? 0);
                    if (ladoAtivo === 'B') { px = compOrig - px; }
                    if (rotated) {
                        const t = transformRotated(px, py, compOrig);
                        px = t.x; py = t.y;
                    }
                    return { x: refilo + pX + px, y: refilo + pY + py };
                });
            }
            const millingClosed = String(w.close) === '1';

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
            const isMillingPath = millingPath && millingPath.length >= 2;
            const isChanfro = tc.includes('chanfro') || tipo.includes('chanfro');

            // 3) Override de método (se configurado no painel de ferramentas)
            if (ovMetodo && ovMetodo !== '' && ovMetodo !== 'desativado') {
                resolvedMetodo = ovMetodo;
            }

            // 4) Determinar método de execução automático se não resolvido
            if (resolvedMetodo === 'auto' && effectiveTool) {
                const effDiam = ovDiam ?? Number(w.diameter || 0);
                const toolD = effectiveTool.diametro || 0;
                if (isMillingPath) {
                    resolvedMetodo = 'milling_path';
                } else if (isHole && effDiam > 0 && Math.abs(toolD - effDiam) < 1) {
                    resolvedMetodo = 'drill';
                } else if (isHole && effDiam > 0 && toolD < effDiam) {
                    resolvedMetodo = 'helical';
                } else if (isPocket) {
                    resolvedMetodo = 'pocket_zigzag';
                } else if (isCut) {
                    resolvedMetodo = 'groove';
                } else {
                    resolvedMetodo = 'drill';
                }
            }

            const profExtra = effectiveTool?.profundidade_extra ?? profExtraMaq;
            const baseDepth = ovDepth ?? Number(w.depth ?? 5);
            let depthTotal = baseDepth + profExtra;
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
                const stepOver = toolDiamEf * opStepoverPct;
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
            const velCorte = ovFeed ?? effectiveTool?.velocidade_corte ?? velCorteMaq;
            const velEf = isPeq ? Math.round(velCorte * feedPct / 100) : velCorte;
            const effRpm = ovRpm ?? effectiveTool?.rpm ?? rpmDef;
            const effHoleDiam = ovDiam ?? Number(w.diameter || 0);

            allOps.push({
                pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                absX, absY, absX2, absY2,
                opType: isMillingPath ? 'milling_path' : isHole ? 'hole' : isCut ? 'groove' : isPocket ? 'pocket' : 'generic',
                fase: isChanfro ? 0.5 : usiTipo.fase === 'contorno' ? 1 : 0,  // chanfro: entre internas e contorno
                prioridade: usiTipo.prioridade, tipoNome: usiTipo.nome,
                toolCode: effectiveTool?.tool_code || effectiveToolCode || tc,
                toolCodigo: effectiveTool?.codigo || '', toolNome: effectiveTool?.nome || tc,
                toolRpm: effRpm, toolDiam: effectiveTool?.diametro || 0,
                depthTotal, passes, velCorte: velEf,
                pocketW: w.width || w.w || 0, pocketH: w.height || w.h || 0,
                classificacao: cls, areaCm2, isPequena: isPeq,
                isContorno: false, needsOnionSkin: false,
                // Tool-agnostic multi-pass
                grooveMultiPass, grooveOffsets, grooveWidth: reqWidth, toolAdapted,
                stepoverPct: opStepoverPct,
                passesAcabamento: ovPassesAcab != null ? Math.max(0, Number(ovPassesAcab)) : null,
                // Estratégia resolvida
                resolvedMetodo, holeDiameter: effHoleDiam,
                // Overrides aplicados (para referência)
                hasOverride: !!(groupOv || pecaOv),
                // Fresamento de caminho (transfer_milling, chanfro, usi_line com path)
                millingPath, millingClosed, isChanfro,
            });
        }

        // ═══ CONTORNO AUTOMÁTICO da peça ═══
        if (contTool) {
            const cR = contTool.diametro / 2;
            const profExtra = contTool.profundidade_extra ?? profExtraMaq;
            const depthTotal = clampDepth(espChapa + profExtra, `${pDb.descricao} - contorno`);

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
            const highVacuumRisk = vacuumRiskIndex >= 0.72 || cls !== 'normal';
            const needsOnion = useOnion && (areaCm2 < onionAreaMax || (avoidTabsForMaterial && highVacuumRisk));
            const depthCont = needsOnion ? Math.max(0.1, depthTotal - onionEsp) : depthTotal;
            const doc = contTool.doc || null;
            const passes = calcularPassadas(depthCont, doc);
            const velC = contTool.velocidade_corte || velCorteMaq;
            const velRiskPct = highVacuumRisk ? Math.min(feedPct, 65) : 100;
            const velEf = (isPeq || highVacuumRisk) ? Math.round(velC * velRiskPct / 100) : velC;

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
                    tabsAllowed: false, highVacuumRisk,
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
                    tabsAllowed: false, highVacuumRisk,
                });
            }
        }
    }

    // ═══ CONTORNOS DE SOBRAS aproveitáveis ═══
    // Otimização: lados que tocam a borda da chapa NÃO são cortados (já são borda natural)
    if (contTool && chapa.retalhos) {
        const sobraMinW = cfg.sobra_min_largura || 300;
        const sobraMinH = cfg.sobra_min_comprimento || 600;
        const usableW = (chapa.comprimento || 2750) - 2 * refilo;
        const usableH = (chapa.largura || 1850) - 2 * refilo;
        const edgeTol = 1; // tolerância para detecção de borda (mm)

        for (const ret of chapa.retalhos) {
            const isSobra = Math.max(ret.w, ret.h) >= sobraMinH && Math.min(ret.w, ret.h) >= sobraMinW;
            // debug: console.log(`[SOBRA-DEBUG] ret: x=${ret.x} y=${ret.y} w=${ret.w} h=${ret.h}`);
            if (!isSobra) continue;

            const cR = contTool.diametro / 2;
            const profExtra = contTool.profundidade_extra ?? profExtraMaq;
            const depthTotal = clampDepth(espChapa + profExtra, 'contorno sobra');
            const passes = calcularPassadas(depthTotal, contTool.doc || null);

            const sx1 = refilo + ret.x - cR, sy1 = refilo + ret.y - cR;
            const sx2 = refilo + ret.x + ret.w + cR, sy2 = refilo + ret.y + ret.h + cR;
            const sTipo = usinagemTipos.find(t => t.codigo === 'contorno_sobra') || { prioridade: 9, fase: 'contorno' };

            // ─── Detectar lados na borda da chapa ───
            const onLeft   = ret.x <= edgeTol;
            const onBottom = ret.y <= edgeTol;
            const onRight  = ret.x + ret.w >= usableW - edgeTol;
            const onTop    = ret.y + ret.h >= usableH - edgeTol;
            // debug: console.log(`[SOBRA-DEBUG] edges: L=${onLeft} B=${onBottom} R=${onRight} T=${onTop}`);
            const edgesSkipped = [onBottom, onRight, onTop, onLeft].filter(Boolean).length;

            // Se todos os 4 lados estão na borda, não precisa cortar nada
            if (edgesSkipped >= 4) continue;

            // Cantos do retângulo: BL, BR, TR, TL
            const BL = { x: sx1, y: sy1 }, BR = { x: sx2, y: sy1 };
            const TR = { x: sx2, y: sy2 }, TL = { x: sx1, y: sy2 };
            const corners = [BL, BR, TR, TL];
            // Lados: bottom(BL→BR), right(BR→TR), top(TR→TL), left(TL→BL)
            const sideActive = [!onBottom, !onRight, !onTop, !onLeft];

            let contornoSegments;
            let isOpenPath = false;
            if (edgesSkipped === 0) {
                // Todos os lados internos — retângulo fechado completo
                contornoSegments = [[BL, BR, TR, TL, BL]];
            } else {
                // Construir segmentos contínuos apenas dos lados internos
                isOpenPath = true;
                contornoSegments = [];
                const startIdx = sideActive.findIndex(a => !a);
                let current = null;
                for (let i = 0; i < 4; i++) {
                    const idx = (startIdx + 1 + i) % 4;
                    if (sideActive[idx]) {
                        if (!current) current = [corners[idx]];
                        current.push(corners[(idx + 1) % 4]);
                    } else {
                        if (current) { contornoSegments.push(current); current = null; }
                    }
                }
                if (current) contornoSegments.push(current);
            }

            // Se nenhum segmento gerado (todos na borda), pular
            // debug: console.log(`[SOBRA-DEBUG] sideActive=[${sideActive}] segments=${contornoSegments.length}`);
            if (!contornoSegments.length) continue;

            const edgeInfo = [];
            if (onLeft) edgeInfo.push('E');
            if (onRight) edgeInfo.push('D');
            if (onBottom) edgeInfo.push('Inf');
            if (onTop) edgeInfo.push('Sup');
            const edgeDesc = edgesSkipped > 0 ? ` [borda: ${edgeInfo.join('+')}]` : '';

            allOps.push({
                pecaId: null, pecaDesc: `Sobra ${Math.round(ret.w)}x${Math.round(ret.h)}${edgeDesc}`, moduloDesc: '',
                absX: sx1, absY: sy1, absX2: sx2, absY2: sy2,
                opType: 'contorno_sobra', fase: 2, prioridade: sTipo.prioridade, clsOrder: 9, tipoNome: 'Contorno Sobra',
                toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                depthTotal, depthCont: depthTotal, passes, velCorte: contTool.velocidade_corte || velCorteMaq,
                contornoPath: [BL, BR, TR, TL], // path completo para visualização SVG
                contornoSegments, isOpenPath, edgesSkipped,
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
        // Contornos: ordenar por estabilidade da peça e, depois, por deslocamento.
        if (a.isContorno && b.isContorno) {
            if (ordenarContornos === 'menor_primeiro') {
                // Prioridade de estabilidade: peças menores soltam/movem mais cedo.
                // O TSP entra depois, apenas dentro de buckets parecidos.
                return contourSmallFirstCompare(a, b);
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
    const rotaBaseMm = routeRapidDistance(allOps);

    const sortedOps = [];
    let routeCursor = { x: 0, y: 0 };
    let gs = 0;
    for (let i = 0; i <= allOps.length; i++) {
        const newGrp = i === allOps.length ||
            allOps[i].fase !== allOps[gs].fase ||
            allOps[i].prioridade !== allOps[gs].prioridade ||
            (otimizarTrocas && allOps[i].toolCode !== allOps[gs].toolCode);
        if (newGrp && i > gs) {
            const grp = allOps.slice(gs, i);
            if (grp[0]?.isContorno && ordenarContornos === 'menor_primeiro') {
                // TSP dentro de buckets pequenos→grandes — reduz deslocamento sem
                // misturar uma peça grande antes de peças pequenas e instáveis.
                const buckets = [];
                let curBucket = [grp[0]];
                for (let k = 1; k < grp.length; k++) {
                    if (sameSmallFirstBucket(grp[k], grp[k - 1])) { curBucket.push(grp[k]); }
                    else { buckets.push(curBucket); curBucket = [grp[k]]; }
                }
                buckets.push(curBucket);
                for (const bkt of buckets) {
                    const ordered = orderByProximity(bkt, routeCursor);
                    sortedOps.push(...ordered);
                    if (ordered.length) routeCursor = opEndPoint(ordered[ordered.length - 1]);
                }
            } else if (grp[0]?.isContorno && ordenarContornos === 'maior_primeiro') {
                // Mesma lógica de buckets por área
                const buckets = [];
                let curBucket = [grp[0]];
                for (let k = 1; k < grp.length; k++) {
                    const areaDiff = Math.abs((grp[k].areaCm2 ?? 0) - (grp[k - 1].areaCm2 ?? 0));
                    if (areaDiff <= 50) { curBucket.push(grp[k]); } // 50cm² tolerance
                    else { buckets.push(curBucket); curBucket = [grp[k]]; }
                }
                buckets.push(curBucket);
                for (const bkt of buckets) {
                    const ordered = orderByProximity(bkt, routeCursor);
                    sortedOps.push(...ordered);
                    if (ordered.length) routeCursor = opEndPoint(ordered[ordered.length - 1]);
                }
            } else {
                const ordered = orderByProximity(grp, routeCursor);
                sortedOps.push(...ordered);
                if (ordered.length) routeCursor = opEndPoint(ordered[ordered.length - 1]);
            }
            gs = i;
        }
    }
    const rotaOtimizadaMm = routeRapidDistance(sortedOps);
    const economiaRotaMm = Math.max(0, rotaBaseMm - rotaOtimizadaMm);

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
    if (rotaBaseMm > 0 && economiaRotaMm > 1) {
        L.push(`${cmt} Rota otimizada: -${(economiaRotaMm / 1000).toFixed(2)}m de deslocamento estimado (${Math.round((economiaRotaMm / rotaBaseMm) * 100)}%)`);
    }
    const ad = [];
    if (useOnion) ad.push(`Onion-skin ${onionEsp}mm`);
    if (feedPct < 100) ad.push(`Feed ${feedPct}% peq.`);
    if (useRampa) ad.push(`Rampa ${rampaAngulo}°`);
    if (usarLeadIn) ad.push(`Lead-in R${leadInRaio}mm`);
    if (ad.length) L.push(`${cmt} Estrategias: ${ad.join(' | ')}`);

    // ─── Sumário de Usinagem (facilita conferência e debug) ────────────────
    // Agrupa operações por tipo para exibir contagens no cabeçalho
    const _sumario = {};
    for (const _op of sortedOps) {
        const _tipoKey = _op.isContorno ? 'contorno' : _op.opType || 'outro';
        if (!_sumario[_tipoKey]) _sumario[_tipoKey] = 0;
        _sumario[_tipoKey]++;
    }
    const _sumarioStr = Object.entries(_sumario).map(([k, v]) => `${k}: ${v}`).join(' | ');
    L.push(`${cmt} Sumario: ${_sumarioStr}`);
    L.push(`${cmt} ═══════════════════════════════════════════════════════`, '');

    // ─── Retração Z segura inicial ───
    emit(`G0 Z${fmt(zSafe())}`);
    L.push('');

    let lastFase = -1;

    for (const op of sortedOps) {
        // Separador de fase
        if (op.fase !== lastFase) {
            const fn = op.fase === 0 ? 'USINAGENS INTERNAS' : op.fase === 0.5 ? 'CHANFROS E FRESAMENTOS DE BORDA' : op.fase === 1 ? 'CONTORNOS DE PECAS' : 'CONTORNOS DE SOBRAS';
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
                const tplCtxTool = { ...tplCtxChapa, toolCode: tl.codigo, rpm: tl.rpm || rpmDef, diametro: tl.diametro, toolNome: tl.nome };
                // Troca: se o campo tem {t} ou {tool}, usa template completo; caso contrário prepend código (compat)
                const trocaLine = trocaCmdRaw.includes('{t}') || trocaCmdRaw.includes('{tool}')
                    ? resolvePostProcessorTemplate(trocaCmdRaw, tplCtxTool)
                    : `${tl.codigo} ${resolvePostProcessorTemplate(trocaCmdRaw, tplCtxTool)}`;
                emit(trocaLine);
                L.push(`${cmt} Troca: ${tl.nome} (D${tl.diametro}mm)`);
                // Spindle ON: se o campo tem {rpm}, usa template; senão prepend S{rpm} (compat)
                const sOnLine = sOnRaw.includes('{rpm}')
                    ? resolvePostProcessorTemplate(sOnRaw, tplCtxTool)
                    : `S${tl.rpm || rpmDef} ${resolvePostProcessorTemplate(sOnRaw, tplCtxTool)}`;
                emit(sOnLine);
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
            if (op.highVacuumRisk) L.push(`${cmt}   Small-first MDF: sem tabs; fixacao por onion/feed reduzido`);
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
                emit(`G0 ${XY(startX, startY)}`);
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
                        emit(`G1 ${XY(rampX, rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 ${XY(startX, startY)} F${op.velCorte}`);
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
                        emit(`${cmd} ${XY(targetX, targetY)} ${IJ(I, J)} F${op.velCorte}`);
                    } else {
                        // Linha reta (G1)
                        emit(`G1 ${XY(targetX, targetY)} F${op.velCorte}`);
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

                    emit(`G0 ${XY(cx + helixR, cy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    let curZ = zApproach();
                    const finalZ = zCut(op.depthTotal);
                    const halfRevDepth = depthPerRev / 2;

                    while (curZ > finalZ + 0.01) {
                        const nextZ1 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 ${XY(cx - helixR, cy)} ${IJ(-helixR, 0)} Z${fmt(nextZ1)} F${velRampa}`);
                        curZ = nextZ1;
                        if (curZ <= finalZ + 0.01) break;
                        const nextZ2 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 ${XY(cx + helixR, cy)} ${IJ(helixR, 0)} Z${fmt(nextZ2)} F${velRampa}`);
                        curZ = nextZ2;
                    }

                    // Expandir para raio de corte real se diferente do raio de hélice
                    if (Math.abs(cutR - helixR) > 0.05) {
                        emit(`G1 ${XY(cx + cutR, cy)} F${op.velCorte}`);
                    }
                } else {
                    // ═══ Entrada convencional (plunge por passada) ═══
                    for (let pi = 0; pi < op.passes.length; pi++) {
                        const zTarget = zCut(op.passes[pi]);
                        if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                        // Desbaste com offset
                        const desbR = circularPassesAcab > 0 && circularOffsetDesb > 0 ? cutR - circularOffsetDesb : cutR;
                        emit(`G0 ${XY(cx + desbR, cy)}`);
                        emit(`G0 Z${fmt(zApproach())}`);
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G2 ${XY(cx + desbR, cy)} ${IJ(-desbR, 0)} F${op.velCorte}`);
                    }
                    // Posicionar para acabamento
                    emit(`G1 ${XY(cx + cutR, cy)} F${op.velCorte}`);
                }

                // Passes de acabamento no raio exato
                if (circularPassesAcab > 0) {
                    const velAcab = Math.round(op.velCorte * velAcabPct);
                    for (let ac = 0; ac < circularPassesAcab; ac++) {
                        L.push(`${cmt}   Acabamento circular ${ac + 1}/${circularPassesAcab} vel=${velAcab}`);
                        emit(`G2 ${XY(cx + cutR, cy)} ${IJ(-cutR, 0)} F${velAcab}`);
                    }
                }
                emit(`G0 Z${fmt(zSafe())}`);
            } else {
                // Plunge simples (furo pequeno)
                emit(`G0 ${XY(cx, cy)}`);
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

                    emit(`G0 ${XY(startX, startY)}`);
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
                            emit(`${cmd} ${XY(targetX, targetY)} ${IJ(I, J)} F${op.velCorte}`);
                        } else {
                            emit(`G1 ${XY(targetX, targetY)} F${op.velCorte}`);
                        }
                        curX = targetX;
                        curY = targetY;
                    }
                }
                emit(`G0 Z${fmt(zSafe())}`);
            }
            L.push('');

        // ─── CONTORNO SOBRA COM BORDAS (open path — lados na borda da chapa são omitidos) ───
        } else if (op.isContorno && op.isOpenPath && op.contornoSegments) {
            const segs = op.contornoSegments;
            L.push(`${cmt} Contorno Sobra (parcial): ${op.pecaDesc}`);
            L.push(`${cmt}   ${segs.length} segmento(s) | ${4 - (op.edgesSkipped || 0)} lados internos | Passadas: ${op.passes.length} | Prof: ${fmt(op.depthTotal)}mm`);

            for (const seg of segs) {
                if (seg.length < 2) continue;
                for (let pi = 0; pi < op.passes.length; pi++) {
                    const pd = op.passes[pi];
                    const zTarget = zCut(pd);
                    if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                    // Posicionar no início do segmento
                    emit(`G0 ${XY(seg[0].x, seg[0].y)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    // Mergulho (rampa ao longo da primeira aresta se possível)
                    const firstEdgeLen = Math.sqrt((seg[1].x - seg[0].x) ** 2 + (seg[1].y - seg[0].y) ** 2);
                    const rampLen = Math.min(firstEdgeLen * 0.4, 50);
                    if (useRampa && rampLen > 5) {
                        const dx = seg[1].x - seg[0].x, dy = seg[1].y - seg[0].y;
                        const frac = Math.min(rampLen / firstEdgeLen, 0.9);
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm ao longo aresta`);
                        emit(`G1 ${XY(seg[0].x + dx * frac, seg[0].y + dy * frac)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 ${XY(seg[0].x, seg[0].y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // Cortar ao longo dos pontos do segmento
                    for (let j = 1; j < seg.length; j++) {
                        emit(`G1 ${XY(seg[j].x, seg[j].y)} F${op.velCorte}`);
                    }

                    emit(`G0 Z${fmt(zSafe())}`);
                }
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
            if (op.highVacuumRisk) L.push(`${cmt}   Small-first MDF: sem tabs; fixacao por onion/feed reduzido`);
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
                    emit(`G0 ${XY(entryX, entryY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    // 2. Entrar no contorno (lead-in) na altura de approach
                    emit(`G1 ${XY(contX, contY)} F${op.velCorte}`);

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
                        emit(`G1 ${XY(rampX, rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        // Voltar ao ponto de entrada do contorno na profundidade de corte
                        emit(`G1 ${XY(contX, contY)} F${op.velCorte}`);
                    } else {
                        // Plunge no ponto de entrada (fora da peça, marca aceitável)
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // 4. Percorrer contorno completo a partir do meio da aresta
                    // Climb milling (concordante) com spindle CW = CCW no contorno externo (p0→p3→p2→p1)
                    // Conventional (convencional) = CW no contorno externo (p0→p1→p2→p3)
                    if (dirCorte === 'climb') {
                        emit(`G1 ${XY(p0.x, p0.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p3.x, p3.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p2.x, p2.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p1.x, p1.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(contX, contY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 ${XY(p1.x, p1.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p2.x, p2.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p3.x, p3.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p0.x, p0.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(contX, contY)} F${op.velCorte}`);
                    }

                    // 5. Lead-out: sair do contorno
                    emit(`G1 ${XY(entryX, entryY)} F${op.velCorte}`);

                } else {
                    // ─── SEM LEAD-IN: entrada direta no P0 ───
                    emit(`G0 ${XY(p0.x, p0.y)}`);
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
                        emit(`G1 ${XY(rampX, rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 ${XY(p0.x, p0.y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // Direção do contorno: climb=CCW (p0→p3→p2→p1), conv=CW (p0→p1→p2→p3)
                    if (dirCorte === 'climb') {
                        emit(`G1 ${XY(p3.x, p3.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p2.x, p2.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p1.x, p1.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p0.x, p0.y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 ${XY(p1.x, p1.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p2.x, p2.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p3.x, p3.y)} F${op.velCorte}`);
                        emit(`G1 ${XY(p0.x, p0.y)} F${op.velCorte}`);
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
                    L.push(`${cmt} [OP type=furo diam=${holeDiam} prof=${fmt(op.depthTotal)} cx=${fmt(op.absX)} cy=${fmt(op.absY)} metodo=helicoidal peca=${encodeURIComponent(op.pecaDesc || '')}]`);
                    const helixR = cutR * (rampaDiamPct / 100);
                    const depthPerRev = Math.min(op.toolDiam * 0.3, 3); // max 3mm por revolução

                    emit(`G0 ${XY(op.absX + helixR, op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    // Descida helicoidal em arcos G2 com Z decrescente
                    let curZ = zApproach();
                    const finalZ = zCut(op.depthTotal);
                    const halfRevDepth = depthPerRev / 2;
                    L.push(`${cmt}   Descida helicoidal: R=${fmt(helixR)}mm, ${fmt(depthPerRev)}mm/rev`);

                    while (curZ > finalZ + 0.01) {
                        // Meio arco 1 (180°): ponto oposto
                        const nextZ1 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 ${XY(op.absX - helixR, op.absY)} ${IJ(-helixR, 0)} Z${fmt(nextZ1)} F${velRampa}`);
                        curZ = nextZ1;
                        if (curZ <= finalZ + 0.01) break;
                        // Meio arco 2 (180°): volta ao início
                        const nextZ2 = Math.max(finalZ, curZ - halfRevDepth);
                        emit(`G2 ${XY(op.absX + helixR, op.absY)} ${IJ(helixR, 0)} Z${fmt(nextZ2)} F${velRampa}`);
                        curZ = nextZ2;
                    }

                    // Passe final no diâmetro exato (acabamento) se cutR > helixR
                    if (circularPassesAcab > 0) {
                        // Expandir para raio de corte real
                        if (Math.abs(cutR - helixR) > 0.05) {
                            emit(`G1 ${XY(op.absX + cutR, op.absY)} F${op.velCorte}`);
                        }
                        for (let ac = 0; ac < circularPassesAcab; ac++) {
                            L.push(`${cmt}   Acabamento circular ${ac + 1}/${circularPassesAcab}`);
                            emit(`G2 ${XY(op.absX + cutR, op.absY)} ${IJ(-cutR, 0)} F${Math.round(op.velCorte * velAcabPct)}`);
                        }
                    }
                    emit(`G0 Z${fmt(zSafe())}`);
                } else {
                    // ═══ FURO CIRCULAR (interpolação G2/G3): fresa contorna o furo ═══
                    L.push(`${cmt} Furo CIRCULAR D${holeDiam}mm (fresa D${op.toolDiam}mm): ${op.pecaDesc}`);
                    L.push(`${cmt} [OP type=furo diam=${holeDiam} prof=${fmt(op.depthTotal)} cx=${fmt(op.absX)} cy=${fmt(op.absY)} metodo=circular peca=${encodeURIComponent(op.pecaDesc || '')}]`);

                    for (let pi = 0; pi < op.passes.length; pi++) {
                        const zTarget = zCut(op.passes[pi]);
                        if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                        // Desbaste (com offset se acabamento ativo)
                        const desbR = circularPassesAcab > 0 && circularOffsetDesb > 0 ? cutR - circularOffsetDesb : cutR;

                        emit(`G0 ${XY(op.absX + desbR, op.absY)}`);
                        emit(`G0 Z${fmt(zApproach())}`);
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G2 ${XY(op.absX + desbR, op.absY)} ${IJ(-desbR, 0)} F${op.velCorte}`);

                        // Passes de acabamento no raio exato
                        if (circularPassesAcab > 0 && circularOffsetDesb > 0) {
                            emit(`G1 ${XY(op.absX + cutR, op.absY)} F${op.velCorte}`);
                            for (let ac = 0; ac < circularPassesAcab; ac++) {
                                emit(`G2 ${XY(op.absX + cutR, op.absY)} ${IJ(-cutR, 0)} F${Math.round(op.velCorte * velAcabPct)}`);
                            }
                        }
                    }
                    emit(`G0 Z${fmt(zSafe())}`);
                }
            } else {
                // ═══ FURO DIRETO (plunge) — broca do diâmetro exato ═══
                L.push(`${cmt} Furo: ${op.pecaDesc} ${XY(op.absX, op.absY)} Prof=${fmt(op.depthTotal)}`);
                L.push(`${cmt} [OP type=furo diam=${fmt(holeDiam)} prof=${fmt(op.depthTotal)} cx=${fmt(op.absX)} cy=${fmt(op.absY)} metodo=drill peca=${encodeURIComponent(op.pecaDesc || '')}]`);
                emit(`G0 ${XY(op.absX, op.absY)}`);
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
                L.push(`${cmt} [OP type=rasgo larg=${op.grooveWidth} prof=${fmt(op.depthTotal)} x1=${fmt(sx1)} y1=${fmt(sy1)} x2=${fmt(ex1)} y2=${fmt(ey1)} peca=${encodeURIComponent(op.pecaDesc || '')}]`);
            } else {
                L.push(`${cmt} Rasgo: ${op.pecaDesc} ${XY(sx1, sy1)} -> ${XY(ex1, ey1)} Prof=${fmt(op.depthTotal)} L=${fmt(grooveLen)}`);
                L.push(`${cmt} [OP type=rasgo larg=${op.toolDiam} prof=${fmt(op.depthTotal)} x1=${fmt(sx1)} y1=${fmt(sy1)} x2=${fmt(ex1)} y2=${fmt(ey1)} peca=${encodeURIComponent(op.pecaDesc || '')}]`);
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

                    emit(`G0 ${XY(sx, sy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa && grooveLen > 10) {
                        const rampLen = Math.min(grooveLen * 0.3, 20);
                        const ratio = rampLen / grooveLen;
                        const rampEndX = sx + (ex - sx) * ratio;
                        const rampEndY = sy + (ey - sy) * ratio;
                        emit(`G1 ${XY(rampEndX, rampEndY)} Z${fmt(zTarget)} F${velRampa}`);
                        emit(`G1 ${XY(sx, sy)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    emit(`G1 ${XY(ex, ey)} F${op.velCorte}`);

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
            const opPocketStepover = op.stepoverPct || stepoverPct;
            const stepOver = toolDiam * opPocketStepover;
            const opPocketAcabamento = op.passesAcabamento != null ? op.passesAcabamento > 0 : pocketAcabamento;
            L.push(`${cmt} Pocket: ${op.pecaDesc} ${XY(op.absX, op.absY)} ${pw}x${ph} Prof=${fmt(op.depthTotal)} Stepover=${Math.round(opPocketStepover * 100)}%`);
            L.push(`${cmt} [OP type=rebaixo w=${fmt(pw)} h=${fmt(ph)} prof=${fmt(op.depthTotal)} x=${fmt(op.absX)} y=${fmt(op.absY)} peca=${encodeURIComponent(op.pecaDesc || '')}]`);

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                if (pw > toolDiam * 1.2 && ph > toolDiam * 1.2) {
                    // ─── Zigzag inteligente: eixo longo, stepover configurável, acabamento ───
                    const ox = Number(op.absX), oy = Number(op.absY);
                    // Offset para acabamento: deixar material na parede para passe final
                    const acabOff = opPocketAcabamento ? pocketAcabOffset : 0;
                    const iStartX = ox + toolR + acabOff, iStartY = oy + toolR + acabOff;
                    const iEndX = ox + pw - toolR - acabOff, iEndY = oy + ph - toolR - acabOff;

                    // Determinar direção do zigzag: eixo mais longo = menos reversões
                    const zigAlongX = pocketDirecao === 'x' ? true :
                                      pocketDirecao === 'y' ? false :
                                      pw >= ph; // 'auto': eixo mais longo

                    emit(`G0 ${XY(iStartX, iStartY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa) {
                        const rampAxis = zigAlongX ? iEndX - iStartX : iEndY - iStartY;
                        const rampLen = Math.min(Math.abs(rampAxis) * 0.3, 20);
                        if (zigAlongX) {
                            emit(`G1 ${XY(iStartX + rampLen, iStartY)} Z${fmt(zTarget)} F${velRampa}`);
                        } else {
                            emit(`G1 ${XY(iStartX, iStartY + rampLen)} Z${fmt(zTarget)} F${velRampa}`);
                        }
                        emit(`G1 ${XY(iStartX, iStartY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    L.push(`${cmt}   Zigzag ${zigAlongX ? 'X' : 'Y'} (eixo ${zigAlongX ? 'longo' : 'curto'})`);

                    if (zigAlongX) {
                        // Zigzag ao longo de X, passo em Y
                        let cy = iStartY, dir = 1;
                        while (cy <= iEndY + 0.01) {
                            const tx = dir === 1 ? iEndX : iStartX;
                            emit(`G1 ${XY(tx, cy)} F${op.velCorte}`);
                            cy += stepOver;
                            if (cy <= iEndY + 0.01) {
                                emit(`G1 ${XY(tx, Math.min(cy, iEndY))} F${op.velCorte}`);
                            }
                            dir *= -1;
                        }
                    } else {
                        // Zigzag ao longo de Y, passo em X
                        let cx = iStartX, dir = 1;
                        while (cx <= iEndX + 0.01) {
                            const ty = dir === 1 ? iEndY : iStartY;
                            emit(`G1 ${XY(cx, ty)} F${op.velCorte}`);
                            cx += stepOver;
                            if (cx <= iEndX + 0.01) {
                                emit(`G1 ${XY(Math.min(cx, iEndX), ty)} F${op.velCorte}`);
                            }
                            dir *= -1;
                        }
                    }

                    // ─── Passe de acabamento no perímetro ───
                    if (opPocketAcabamento) {
                        const velAcab = Math.round(op.velCorte * velAcabPct);
                        L.push(`${cmt}   Acabamento perimetro (offset=${fmt(pocketAcabOffset)}mm, vel=${velAcab}mm/min)`);
                        emit(`G1 ${XY(ox + toolR, oy + toolR)} F${op.velCorte}`);
                        emit(`G1 ${XY(ox + pw - toolR, oy + toolR)} F${velAcab}`);
                        emit(`G1 ${XY(ox + pw - toolR, oy + ph - toolR)} F${velAcab}`);
                        emit(`G1 ${XY(ox + toolR, oy + ph - toolR)} F${velAcab}`);
                        emit(`G1 ${XY(ox + toolR, oy + toolR)} F${velAcab}`);
                    }

                    emit(`G0 Z${fmt(zSafe())}`);
                } else if (pw > 0 && ph > 0) {
                    // Pocket pequeno: perímetro simples
                    emit(`G0 ${XY(op.absX, op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    const px2 = Number(op.absX) + pw, py2 = Number(op.absY) + ph;
                    emit(`G1 ${XY(px2, op.absY)} F${op.velCorte}`);
                    emit(`G1 ${XY(px2, py2)} F${op.velCorte}`);
                    emit(`G1 ${XY(op.absX, py2)} F${op.velCorte}`);
                    emit(`G1 ${XY(op.absX, op.absY)} F${op.velCorte}`);
                    emit(`G0 Z${fmt(zSafe())}`);
                } else {
                    // Plunge simples (sem dimensão de pocket)
                    emit(`G0 ${XY(op.absX, op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    emit(`G0 Z${fmt(zSafe())}`);
                }
            }
            L.push('');

        // ─── FRESAMENTO DE CAMINHO (transfer_milling, chanfro, usi_line com path) ───
        } else if (op.opType === 'milling_path' && op.millingPath && op.millingPath.length >= 2) {
            const path = op.millingPath;
            const isClosed = op.millingClosed;
            const pathLen = path.reduce((sum, pt, i) => {
                if (i === 0) return 0;
                return sum + Math.sqrt((pt.x - path[i - 1].x) ** 2 + (pt.y - path[i - 1].y) ** 2);
            }, 0);

            L.push(`${cmt} ${op.isChanfro ? 'CHANFRO 45°' : 'Fresamento'}${isClosed ? ' FECHADO' : ''}: ${op.pecaDesc}${op.moduloDesc ? ' (' + op.moduloDesc + ')' : ''}`);
            L.push(`${cmt}   ${path.length} pontos | Comprimento: ${fmt(pathLen)}mm | Prof: ${fmt(op.depthTotal)}mm`);
            if (op.isChanfro) L.push(`${cmt}   Fresa chanfro D${op.toolDiam}mm`);
            L.push(`${cmt} [OP type=${op.isChanfro ? 'chanfro' : 'fresagem'} comprimento=${fmt(pathLen)} prof=${fmt(op.depthTotal)} peca=${encodeURIComponent(op.pecaDesc || '')}]`);
            if (op.isPequena) L.push(`${cmt}   PECA PEQUENA -- Feed ${feedPct}%`);

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // Posicionar no primeiro ponto
                emit(`G0 ${XY(path[0].x, path[0].y)}`);
                emit(`G0 Z${fmt(zApproach())}`);

                // Mergulho: rampa ao longo do primeiro segmento se disponível
                if (useRampa && path.length > 1) {
                    const dx = path[1].x - path[0].x;
                    const dy = path[1].y - path[0].y;
                    const segLen = Math.sqrt(dx * dx + dy * dy);
                    const rampLen = Math.min(segLen * 0.4, 50);
                    if (rampLen > 5) {
                        const frac = rampLen / segLen;
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm ao longo primeiro segmento`);
                        emit(`G1 ${XY(path[0].x + dx * frac, path[0].y + dy * frac)} Z${fmt(zTarget)} F${velMergulho}`);
                        // Voltar ao ponto inicial na profundidade de corte
                        emit(`G1 ${XY(path[0].x, path[0].y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }
                } else {
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                }

                // Percorrer todos os pontos do caminho
                for (let i = 1; i < path.length; i++) {
                    emit(`G1 ${XY(path[i].x, path[i].y)} F${op.velCorte}`);
                }

                // Fechar o caminho se close=1 (contorno interior / recorte)
                if (isClosed) {
                    emit(`G1 ${XY(path[0].x, path[0].y)} F${op.velCorte}`);
                }

                // Retração entre passadas
                if (pi < op.passes.length - 1) {
                    emit(`G0 Z${fmt(zApproach())}`);
                }
            }
            // Retração final
            const nextOpM = sortedOps[sortedOps.indexOf(op) + 1];
            const fastRetractM = nextOpM && nextOpM.opType === 'milling_path' && nextOpM.toolCode === op.toolCode;
            emit(`G0 Z${fmt(fastRetractM ? zRapid() : zSafe())}`);
            L.push('');

        } else {
            L.push(`${cmt} Op: ${op.tipoNome} ${op.pecaDesc} ${XY(op.absX, op.absY)}`);
            emit(`G0 ${XY(op.absX, op.absY)}`);
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
            const tplCtxOnion = { ...tplCtxChapa, toolCode: tl.codigo, rpm: tl.rpm || rpmDef, diametro: tl.diametro, toolNome: tl.nome };
            const trocaLineOnion = trocaCmdRaw.includes('{t}') || trocaCmdRaw.includes('{tool}')
                ? resolvePostProcessorTemplate(trocaCmdRaw, tplCtxOnion)
                : `${tl.codigo} ${resolvePostProcessorTemplate(trocaCmdRaw, tplCtxOnion)}`;
            emit(trocaLineOnion);
            L.push(`${cmt} Troca: ${tl.nome} (breakthrough)`);
            const sOnOnion = sOnRaw.includes('{rpm}')
                ? resolvePostProcessorTemplate(sOnRaw, tplCtxOnion)
                : `S${tl.rpm || rpmDef} ${resolvePostProcessorTemplate(sOnRaw, tplCtxOnion)}`;
            emit(sOnOnion);
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
                emit(`G0 ${XY(p0.x, p0.y)}`);
                emit(`G0 Z${fmt(zApproach())}`);
                emit(`G1 Z${fmt(zCut(dFull))} F${Math.min(velMergulho, os.velFinal)}`);
                L.push(`${cmt}   vel. reduzida (breakthrough ${onionEsp}mm)`);

                // Climb=CCW (p0→p3→p2→p1), Conv=CW (p0→p1→p2→p3)
                if (dirCorte === 'climb') {
                    emit(`G1 ${XY(p3.x, p3.y)} F${os.velFinal}`);
                    emit(`G1 ${XY(p2.x, p2.y)} F${os.velFinal}`);
                    emit(`G1 ${XY(p1.x, p1.y)} F${os.velFinal}`);
                    emit(`G1 ${XY(p0.x, p0.y)} F${os.velFinal}`);
                } else {
                    emit(`G1 ${XY(p1.x, p1.y)} F${os.velFinal}`);
                    emit(`G1 ${XY(p2.x, p2.y)} F${os.velFinal}`);
                    emit(`G1 ${XY(p3.x, p3.y)} F${os.velFinal}`);
                    emit(`G1 ${XY(p0.x, p0.y)} F${os.velFinal}`);
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

    const expectedCounts = {
        hole: allOps.filter(o => o.opType === 'hole').length,
        groove: allOps.filter(o => o.opType === 'groove').length,
        pocket: allOps.filter(o => o.opType === 'pocket').length,
    };
    alertas.push(...validateGeneratedGcode(gcodeText, {
        cmt,
        zOrigin,
        espChapa,
        depthMaxAbsoluto,
        zSafe: zSafe(),
        totalOps,
        expectedCounts,
    }));

    // ─── Verificar desgaste de ferramenta antes de retornar ───
    checkToolWearDuringGeneration(toolMap, toolWearMap, alertas, maquina);

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
            pecas_alto_risco: allOps.filter(o => o.highVacuumRisk && o.isContorno).length,
            tabs_desativados_mdf: avoidTabsForMaterial ? 1 : 0,
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
            rota_base_m: Math.round(rotaBaseMm / 100) / 10,
            rota_otimizada_m: Math.round(rotaOtimizadaMm / 100) / 10,
            economia_rota_m: Math.round(economiaRotaMm / 100) / 10,
            economia_rota_pct: rotaBaseMm > 0 ? Math.round((economiaRotaMm / rotaBaseMm) * 100) : 0,
        },
        alertas,
        ferramentas_faltando: [...missingTools],
        ferramentas_faltando_detalhes: missingToolDetails,
        contorno_tool: contTool ? { codigo: contTool.codigo, nome: contTool.nome, diametro: contTool.diametro } : null,
        maquina: maquina ? { id: maquina.id, nome: maquina.nome, capacidade_magazine: maquina.capacidade_magazine || null } : null,
        tool_wear: toolWearMap, // { toolCode: distancia_mm }
    };
}

// ─── Helper: Checar desgaste de ferramenta durante geração ───
function checkToolWearDuringGeneration(toolMap, toolWearMap, alertas, maquina = null) {
    for (const [toolCode, distMm] of Object.entries(toolWearMap)) {
        const tool = toolMap[toolCode];
        if (!tool || !tool.metros_limite || tool.metros_limite <= 0) continue;
        const acumulado = tool.metros_acumulados || 0;
        const adicional = distMm / 1000;
        const totalApos = acumulado + adicional;
        const pct = (totalApos / tool.metros_limite) * 100;
        const maquinaNome = tool.maquina_nome || maquina?.nome || '';
        const prefix = maquinaNome ? `[${maquinaNome}] ` : '';
        if (pct >= 100) {
            alertas.push({
                tipo: 'aviso_ferramenta',
                msg: `${prefix}FERRAMENTA: ${tool.nome || tool.codigo} — Limite de desgaste será excedido após este job (${totalApos.toFixed(0)}m / ${tool.metros_limite}m = ${Math.round(pct)}%). Substitua antes de executar.`
            });
        } else if (pct >= 80) {
            alertas.push({
                tipo: 'aviso_ferramenta',
                msg: `${prefix}Ferramenta ${tool.nome || tool.codigo} em ${Math.round(pct)}% do limite após este job (${totalApos.toFixed(0)}m / ${tool.metros_limite}m). Planeje substituição em breve.`
            });
        }
    }
}

// ─── Helper: Atualizar desgaste de ferramentas após G-code ───
function updateToolWear(toolMap, toolWearMap, loteId, userId) {
    const stmtUpdate = db.prepare('UPDATE cnc_ferramentas SET metros_acumulados = metros_acumulados + ? WHERE id = ?');
    const stmtLog = db.prepare('INSERT INTO cnc_tool_wear_log (ferramenta_id, lote_id, metros_lineares, num_operacoes) VALUES (?,?,?,?)');
    for (const [toolCode, distMm] of Object.entries(toolWearMap)) {
        const tool = toolMap[toolCode];
        if (!tool) continue;
        const metros = distMm / 1000; // mm → m
        stmtUpdate.run(metros, tool.id);
        stmtLog.run(tool.id, loteId || null, metros, 1);
        // Verificar alerta de manutenção preventiva
        if (userId) checkToolMaintenanceAlert(tool.id, userId);
    }
}

// ─── Endpoints G-code v2 ───────────────────────────────

function loadToolMapForMachine(maquinaId) {
    const ferramentas = db.prepare(`
        SELECT f.*, m.nome as maquina_nome
        FROM cnc_ferramentas f
        LEFT JOIN cnc_maquinas m ON m.id = f.maquina_id
        WHERE f.maquina_id = ? AND f.ativo = 1
    `).all(maquinaId);
    const toolMap = {};
    for (const f of ferramentas) {
        if (f.tool_code) toolMap[f.tool_code] = f;
    }
    return toolMap;
}

function resolveGcodeMachineForChapa(ctx, chapaIdx) {
    let maquina = ctx.maquina;
    let toolMap = ctx.toolMap;
    const assignment = db.prepare('SELECT maquina_id FROM cnc_machine_assignments WHERE lote_id = ? AND chapa_idx = ?').get(ctx.lote.id, chapaIdx);
    if (assignment && assignment.maquina_id) {
        const assignedMachine = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ? AND ativo = 1').get(assignment.maquina_id);
        if (assignedMachine) {
            maquina = assignedMachine;
            toolMap = loadToolMapForMachine(assignedMachine.id);
        }
    }
    return { maquina, toolMap, extensao: maquina.extensao_arquivo || ctx.extensao };
}

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

    const toolMap = loadToolMapForMachine(maquina.id);

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

    // Carregar overrides de operações
    let opOverrides = {};
    let opOverridesPeca = {};
    try {
        const ovRows = db.prepare('SELECT * FROM cnc_operacao_overrides WHERE lote_id = ?').all(lote.id);
        for (const o of ovRows) opOverrides[o.op_key] = o;
        const ovPecaRows = db.prepare('SELECT * FROM cnc_operacao_overrides_peca WHERE lote_id = ?').all(lote.id);
        for (const o of ovPecaRows) opOverridesPeca[`${o.op_key}__${o.peca_id}`] = o;
    } catch (_) { /* tabelas podem não existir ainda */ }

    // ─── Catálogo de Usinagem: component_name → parâmetros CNC ───────
    // Carregado aqui (lookup time) para que alterações no catálogo se reflitam
    // em gerações futuras de G-code sem necessidade de reimportar peças.
    const usinagemCatalogMap = {};
    try {
        const userId = lote.user_id || (req && req.user && req.user.id);
        if (userId) {
            const catRows = db.prepare(
                'SELECT * FROM cnc_usinagem_catalog WHERE user_id = ? AND ativo = 1'
            ).all(userId);
            usinagemCatalogMap.__wildcards = [];
            for (const r of catRows) {
                if (String(r.component_name || '').includes('*')) {
                    usinagemCatalogMap.__wildcards.push(r);
                    continue;
                }
                if (!usinagemCatalogMap[r.component_name]) usinagemCatalogMap[r.component_name] = [];
                usinagemCatalogMap[r.component_name].push(r);
            }
        }
    } catch (_) { /* tabela pode não existir ainda */ }

    return { lote, plano, maquina, toolMap, usinagemTipos, pecasDb, cfg, extensao, opOverrides, opOverridesPeca, usinagemCatalogMap };
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

        const { maquina, toolMap, extensao } = resolveGcodeMachineForChapa(ctx, chapaIdx);

        const result = generateGcodeForChapa(chapa, chapaIdx, ctx.pecasDb, maquina, toolMap, ctx.usinagemTipos, ctx.cfg, ctx.opOverrides || {}, ctx.opOverridesPeca || {}, ctx.usinagemCatalogMap || {});

        if (result.ferramentas_faltando.length > 0) {
            return res.json({
                ok: false, ...result, extensao,
                error: `Ferramentas faltando: ${result.ferramentas_faltando.join(', ')}`,
            });
        }
        if (hasCriticalGcodeAlert(result)) {
            return res.json({
                ok: false, ...result, extensao,
                error: 'G-code gerado com erro crítico de validação. Corrija os alertas antes de executar na máquina.',
            });
        }

        // Atualizar desgaste de ferramentas
        if (result.tool_wear) {
            updateToolWear(toolMap, result.tool_wear, ctx.lote.id, req.user?.id);
        }

        const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(chapaIdx + 1).padStart(2, '0')}`;
        const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + extensao;

        // Log G-code generation history
        try {
            const crypto = await import('crypto');
            const hash = crypto.createHash('md5').update(result.gcode || '').digest('hex').slice(0, 12);
            db.prepare(`INSERT INTO cnc_gcode_historico (lote_id, chapa_idx, maquina_id, maquina_nome, filename, gcode_hash, total_operacoes, tempo_estimado_min, dist_corte_m, alertas_count, trocas_ferramenta, onion_skin_ops, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                ctx.lote.id, chapaIdx, maquina.id, maquina.nome || '', filename, hash,
                result.stats?.total_operacoes || 0, result.stats?.tempo_estimado_min || 0, result.stats?.dist_corte_m || 0,
                (result.alertas || []).length,
                result.stats?.trocas_ferramenta || 0, result.stats?.onion_skin_ops || 0,
                req.user.id
            );
        } catch (_) { /* non-critical */ }

        // #35 — Push notification: broadcast G-code completion via WebSocket
        const broadcast = req.app.locals.wsBroadcast;
        if (broadcast) broadcast('gcode_complete', { lote_id: ctx.lote.id, chapa_idx: chapaIdx, message: `Chapa ${chapaIdx+1} pronta` });

        res.json({ ok: true, ...result, extensao, filename, chapa_idx: chapaIdx });
    } catch (err) {
        console.error('Erro G-code chapa:', err);
        res.status(500).json({ error: `Erro ao gerar G-code: ${err.message || err}` });
    }
});

// POST /gcode/:loteId/chapa/:chapaIdx/peca/:pecaIdx — G-code de peça avulsa
router.post('/gcode/:loteId/chapa/:chapaIdx/peca/:pecaIdx', requireAuth, async (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

        const chapaIdx = parseInt(req.params.chapaIdx);
        const pecaIdx = parseInt(req.params.pecaIdx);
        if (isNaN(chapaIdx) || chapaIdx < 0 || chapaIdx >= ctx.plano.chapas.length) {
            return res.status(400).json({ error: `Chapa ${chapaIdx} não existe.` });
        }
        const chapaOrig = ctx.plano.chapas[chapaIdx];
        if (isNaN(pecaIdx) || pecaIdx < 0 || pecaIdx >= chapaOrig.pecas.length) {
            return res.status(400).json({ error: `Peça ${pecaIdx} não existe na chapa ${chapaIdx}.` });
        }

        // Create virtual chapa with single piece — preserve original position
        const singlePiece = chapaOrig.pecas[pecaIdx];
        const virtualChapa = {
            ...chapaOrig,
            pecas: [singlePiece],
        };

        const { maquina, toolMap, extensao } = resolveGcodeMachineForChapa(ctx, chapaIdx);

        const result = generateGcodeForChapa(virtualChapa, chapaIdx, ctx.pecasDb, maquina, toolMap, ctx.usinagemTipos, ctx.cfg, ctx.opOverrides || {}, ctx.opOverridesPeca || {}, ctx.usinagemCatalogMap || {});

        if (result.ferramentas_faltando.length > 0) {
            return res.json({ ok: false, ...result, extensao, error: `Ferramentas faltando: ${result.ferramentas_faltando.join(', ')}` });
        }
        if (hasCriticalGcodeAlert(result)) {
            return res.json({
                ok: false, ...result, extensao,
                error: 'G-code da peça com erro crítico de validação. Corrija os alertas antes de executar na máquina.',
            });
        }

        const pecaDesc = singlePiece.nome || singlePiece.descricao || `Peca${pecaIdx + 1}`;
        const nomeBase = `${ctx.lote.nome || 'Lote'}_Chapa${chapaIdx + 1}_${pecaDesc}`;
        const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + extensao;

        res.json({ ok: true, ...result, extensao, filename, chapa_idx: chapaIdx, peca_idx: pecaIdx });
    } catch (err) {
        console.error('Erro G-code peça avulsa:', err);
        res.status(500).json({ error: `Erro ao gerar G-code da peça: ${err.message || err}` });
    }
});

// POST /gcode/:loteId — G-code (todas as chapas OU lote completo)
router.post('/gcode/:loteId', requireAuth, async (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

        // ═══ G-CODE canônico: motor JS ═════
        // O bridge Python ainda não tem paridade completa com o pipeline JS
        // (usinagens internas, overrides, Z-origin por máquina, ferramentas etc.).
        // Mantemos Python apenas como experimento explícito para evitar G-code incompleto.
        const usarPythonExperimental = String(req.body?.motor || req.query?.motor || '').toLowerCase() === 'python';
        const pythonOk = usarPythonExperimental ? await isPythonAvailable() : false;
        if (!usarPythonExperimental || !pythonOk) {
            if (usarPythonExperimental && !pythonOk) console.warn('[CNC] Python solicitado, mas indisponível — usando JS canônico para G-code');
            const results = [];
            for (let i = 0; i < ctx.plano.chapas.length; i++) {
                try {
                    const { maquina, toolMap, extensao } = resolveGcodeMachineForChapa(ctx, i);
                    const gcodeResult = generateGcodeForChapa(ctx.plano.chapas[i], i, ctx.pecasDb, maquina, toolMap, ctx.usinagemTipos, ctx.cfg, ctx.opOverrides || {}, ctx.opOverridesPeca || {}, ctx.usinagemCatalogMap || {});
                    const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(i + 1).padStart(2, '0')}`;
                    const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + extensao;
                    const critical = hasCriticalGcodeAlert(gcodeResult);
                    results.push({
                        idx: i,
                        ok: !critical && (gcodeResult.ferramentas_faltando || []).length === 0,
                        gcode: gcodeResult.gcode,
                        filename,
                        stats: gcodeResult.stats || {},
                        alertas: gcodeResult.alertas || [],
                        error: critical ? 'G-code com erro crítico de validação.' : undefined,
                        maquina: gcodeResult.maquina || { id: maquina.id, nome: maquina.nome },
                    });

                    // Registrar histórico (JS fallback)
                    try {
                        const { createHash } = await import('crypto');
                        const hash = createHash('md5').update(gcodeResult.gcode || '').digest('hex').slice(0, 12);
                        const s = gcodeResult.stats || {};
                        db.prepare(`INSERT INTO cnc_gcode_historico
                            (lote_id, chapa_idx, maquina_id, maquina_nome, filename, gcode_hash,
                             total_operacoes, tempo_estimado_min, dist_corte_m, alertas_count,
                             trocas_ferramenta, onion_skin_ops, user_id)
                            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                            ctx.lote.id, i, maquina.id, maquina.nome || '', filename, hash,
                            s.total_operacoes || 0, s.tempo_estimado_min || 0, s.dist_corte_m || 0,
                            (gcodeResult.alertas || []).length,
                            s.trocas_ferramenta || 0, s.onion_skin_ops || 0,
                            req.user.id
                        );
                    } catch (_) { /* non-critical */ }
                } catch (e) {
                    results.push({ idx: i, ok: false, gcode: '', filename: `Chapa${i + 1}${ctx.extensao}`, stats: {}, alertas: [{ tipo: 'erro_critico', msg: `Erro JS: ${e.message}` }], error: e.message });
                }
            }
            const ok = results.every(r => r.ok !== false);
            return res.json({
                ok,
                chapas: results,
                extensao: ctx.extensao,
                motor: 'js',
                error: ok ? undefined : 'Uma ou mais chapas geraram G-code com erro crítico. Confira os alertas antes de executar.',
            });
        }
        console.warn(`  [CNC] Usando G-code Python EXPERIMENTAL para lote ${ctx.lote.id}`);
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
                    z_origin: ctx.maquina.z_origin || 'mesa',
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
                pyResult.alertas = [
                    ...(pyResult.alertas || []),
                    'Motor Python experimental: não usar em produção até ter paridade com o gerador JS.'
                ];
                for (const ch of pyResult.chapas) {
                    ch.alertas = [
                        ...(ch.alertas || []),
                        'Motor Python experimental: pode não incluir todas as usinagens/overrides.'
                    ];
                    const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(ch.idx + 1).padStart(2, '0')}`;
                    ch.filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + ctx.extensao;
                }
                pyResult.extensao = ctx.extensao;
                pyResult.motor = 'python';

                // Registrar no histórico por chapa
                try {
                    const crypto = await import('crypto');
                    const stmtHist = db.prepare(`INSERT INTO cnc_gcode_historico
                        (lote_id, chapa_idx, maquina_id, maquina_nome, filename, gcode_hash,
                         total_operacoes, tempo_estimado_min, dist_corte_m, alertas_count,
                         trocas_ferramenta, onion_skin_ops, user_id)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
                    for (const ch of pyResult.chapas) {
                        if (!ch.gcode) continue;
                        const hash = crypto.createHash('md5').update(ch.gcode).digest('hex').slice(0, 12);
                        const s = ch.stats || {};
                        stmtHist.run(
                            ctx.lote.id, ch.idx ?? 0, ctx.maquina.id, ctx.maquina.nome || '',
                            ch.filename || '', hash,
                            s.total_operacoes || 0, s.tempo_estimado_min || 0, s.dist_corte_m || 0,
                            (ch.alertas || []).length,
                            s.trocas_ferramenta || 0, s.onion_skin_ops || 0,
                            req.user.id
                        );
                    }
                } catch (_) { /* non-critical */ }

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
        coordenada_zero, trocar_eixos_xy, eixo_x_invertido, eixo_y_invertido,
        exportar_lado_a, exportar_lado_b, exportar_furos, exportar_rebaixos, exportar_usinagens,
        usar_ponto_decimal, casas_decimais, comentario_prefixo, troca_ferramenta_cmd, spindle_on_cmd, spindle_off_cmd,
        usar_onion_skin, onion_skin_espessura, onion_skin_area_max, usar_tabs, tab_largura, tab_altura, tab_qtd, tab_area_max,
        usar_lead_in, lead_in_tipo, lead_in_raio, feed_rate_pct_pequenas, feed_rate_area_max,
        z_origin, z_aproximacao, direcao_corte, usar_n_codes, n_code_incremento, dwell_spindle,
        usar_rampa, rampa_angulo, vel_mergulho, z_aproximacao_rapida, ordenar_contornos,
        rampa_tipo, vel_rampa, rampa_diametro_pct, stepover_pct, pocket_acabamento, pocket_acabamento_offset, pocket_direcao,
        compensar_raio_canal, compensacao_tipo, circular_passes_acabamento, circular_offset_desbaste, vel_acabamento_pct,
        margem_mesa_sacrificio, g0_com_feed, capacidade_magazine, operador,
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, m.nome, m.fabricante || '', m.modelo || '', m.tipo_pos || 'generic', m.extensao_arquivo || '.nc',
            m.x_max || 2800, m.y_max || 1900, m.z_max || 200,
            m.gcode_header || '%\nG90 G54 G17',
            m.gcode_footer || 'G0 Z200.000\nM5\nM30\n%',
            m.z_seguro || 30, m.vel_vazio || 20000, m.vel_corte || 4000, m.vel_aproximacao || 8000,
            m.rpm_padrao || 12000, m.profundidade_extra || 0.20,
            m.coordenada_zero || 'canto_esq_inf', m.trocar_eixos_xy || 0, m.eixo_x_invertido || 0, m.eixo_y_invertido || 0,
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
            m.capacidade_magazine ?? 35, m.operador || '',
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
        coordenada_zero=?, trocar_eixos_xy=?, eixo_x_invertido=?, eixo_y_invertido=?,
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
        capacidade_magazine=?, operador=?,
        padrao=?, ativo=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`)
        .run(m.nome, m.fabricante, m.modelo, m.tipo_pos, m.extensao_arquivo,
            m.x_max, m.y_max, m.z_max, m.gcode_header, m.gcode_footer,
            m.z_seguro, m.vel_vazio, m.vel_corte, m.vel_aproximacao, m.rpm_padrao, m.profundidade_extra,
            m.coordenada_zero, m.trocar_eixos_xy || 0, m.eixo_x_invertido, m.eixo_y_invertido,
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
            m.capacidade_magazine ?? 35, m.operador || '',
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
        coordenada_zero, trocar_eixos_xy, eixo_x_invertido, eixo_y_invertido,
        exportar_lado_a, exportar_lado_b, exportar_furos, exportar_rebaixos, exportar_usinagens,
        usar_ponto_decimal, casas_decimais, comentario_prefixo, troca_ferramenta_cmd, spindle_on_cmd, spindle_off_cmd,
        usar_onion_skin, onion_skin_espessura, onion_skin_area_max, usar_tabs, tab_largura, tab_altura, tab_qtd, tab_area_max,
        usar_lead_in, lead_in_tipo, lead_in_raio, feed_rate_pct_pequenas, feed_rate_area_max,
        z_origin, z_aproximacao, direcao_corte, usar_n_codes, n_code_incremento, dwell_spindle,
        usar_rampa, rampa_angulo, vel_mergulho, z_aproximacao_rapida, ordenar_contornos,
        rampa_tipo, vel_rampa, rampa_diametro_pct, stepover_pct, pocket_acabamento, pocket_acabamento_offset, pocket_direcao,
        compensar_raio_canal, compensacao_tipo, circular_passes_acabamento, circular_offset_desbaste, vel_acabamento_pct,
        margem_mesa_sacrificio, g0_com_feed,
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
        .run(req.user.id, `${original.nome} (cópia)`, original.fabricante, original.modelo, original.tipo_pos, original.extensao_arquivo,
            original.x_max, original.y_max, original.z_max, original.gcode_header, original.gcode_footer,
            original.z_seguro, original.vel_vazio, original.vel_corte, original.vel_aproximacao, original.rpm_padrao, original.profundidade_extra,
            original.coordenada_zero, original.trocar_eixos_xy || 0, original.eixo_x_invertido, original.eixo_y_invertido,
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
// GRUPO 6C: Catálogo de Usinagem por nome de componente
// Maps SketchUp component_name → CNC machining parameters
// ═══════════════════════════════════════════════════════

router.get('/usinagem-catalog', requireAuth, (req, res) => {
    const rows = db.prepare(
        'SELECT * FROM cnc_usinagem_catalog WHERE user_id = ? ORDER BY prioridade, component_name COLLATE NOCASE'
    ).all(req.user.id);
    res.json(rows);
});

router.post('/usinagem-catalog', requireAuth, (req, res) => {
    const {
        component_name, tem_padrao, profundidade, profundidade_modo, profundidade_percentual,
        profundidade_extra, diametro, largura, metodo, material_match, maquina_id, face_match,
        tool_code, rpm, feed_rate, stepover_pct, passes_acabamento, borda_min, prioridade,
        descricao, ativo
    } = req.body;
    if (!component_name?.trim()) return res.status(400).json({ error: 'component_name é obrigatório' });
    try {
        const r = db.prepare(`
            INSERT INTO cnc_usinagem_catalog
                (user_id, component_name, tem_padrao, profundidade, profundidade_modo, profundidade_percentual,
                 profundidade_extra, diametro, largura, metodo, material_match, maquina_id, face_match, tool_code,
                 rpm, feed_rate, stepover_pct, passes_acabamento, borda_min, prioridade, descricao, ativo)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
            req.user.id,
            component_name.trim(),
            tem_padrao ?? 1,
            profundidade ?? null,
            profundidade_modo || 'fixa',
            profundidade_percentual ?? null,
            profundidade_extra ?? null,
            diametro ?? null,
            largura ?? null,
            metodo || '',
            material_match || '',
            maquina_id || null,
            face_match || '',
            tool_code || '',
            rpm ?? null,
            feed_rate ?? null,
            stepover_pct ?? null,
            passes_acabamento ?? null,
            borda_min ?? null,
            prioridade ?? 5,
            descricao || '',
            ativo ?? 1
        );
        res.json({ ok: true, id: r.lastInsertRowid });
    } catch (e) {
        if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: `Já existe uma entrada para "${component_name}"` });
        throw e;
    }
});

router.put('/usinagem-catalog/:id', requireAuth, (req, res) => {
    const {
        component_name, tem_padrao, profundidade, profundidade_modo, profundidade_percentual,
        profundidade_extra, diametro, largura, metodo, material_match, maquina_id, face_match,
        tool_code, rpm, feed_rate, stepover_pct, passes_acabamento, borda_min, prioridade,
        descricao, ativo
    } = req.body;
    const fields = ['atualizado_em = CURRENT_TIMESTAMP'];
    const vals = [];
    if (component_name !== undefined) { fields.push('component_name = ?'); vals.push(component_name.trim()); }
    if (tem_padrao !== undefined) { fields.push('tem_padrao = ?'); vals.push(tem_padrao); }
    if (profundidade !== undefined) { fields.push('profundidade = ?'); vals.push(profundidade); }
    if (profundidade_modo !== undefined) { fields.push('profundidade_modo = ?'); vals.push(profundidade_modo || 'fixa'); }
    if (profundidade_percentual !== undefined) { fields.push('profundidade_percentual = ?'); vals.push(profundidade_percentual); }
    if (profundidade_extra !== undefined) { fields.push('profundidade_extra = ?'); vals.push(profundidade_extra); }
    if (diametro !== undefined) { fields.push('diametro = ?'); vals.push(diametro); }
    if (largura !== undefined) { fields.push('largura = ?'); vals.push(largura); }
    if (metodo !== undefined) { fields.push('metodo = ?'); vals.push(metodo || ''); }
    if (material_match !== undefined) { fields.push('material_match = ?'); vals.push(material_match || ''); }
    if (maquina_id !== undefined) { fields.push('maquina_id = ?'); vals.push(maquina_id || null); }
    if (face_match !== undefined) { fields.push('face_match = ?'); vals.push(face_match || ''); }
    if (tool_code !== undefined) { fields.push('tool_code = ?'); vals.push(tool_code); }
    if (rpm !== undefined) { fields.push('rpm = ?'); vals.push(rpm); }
    if (feed_rate !== undefined) { fields.push('feed_rate = ?'); vals.push(feed_rate); }
    if (stepover_pct !== undefined) { fields.push('stepover_pct = ?'); vals.push(stepover_pct); }
    if (passes_acabamento !== undefined) { fields.push('passes_acabamento = ?'); vals.push(passes_acabamento); }
    if (borda_min !== undefined) { fields.push('borda_min = ?'); vals.push(borda_min); }
    if (prioridade !== undefined) { fields.push('prioridade = ?'); vals.push(prioridade); }
    if (descricao !== undefined) { fields.push('descricao = ?'); vals.push(descricao); }
    if (ativo !== undefined) { fields.push('ativo = ?'); vals.push(ativo); }
    vals.push(req.params.id, req.user.id);
    try {
        db.prepare(`UPDATE cnc_usinagem_catalog SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
        res.json({ ok: true });
    } catch (e) {
        if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Nome de componente já cadastrado' });
        throw e;
    }
});

router.delete('/usinagem-catalog/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_usinagem_catalog WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
});

// Lookup em lote: recebe array de component_names, retorna só os que têm entrada no catálogo
// Usado pelo gerador de G-code no front (ou back) para aplicar overrides
router.post('/usinagem-catalog/lookup', requireAuth, (req, res) => {
    const names = Array.isArray(req.body.names) ? req.body.names : [];
    if (names.length === 0) return res.json({});
    const placeholders = names.map(() => '?').join(',');
    const rows = db.prepare(
        `SELECT * FROM cnc_usinagem_catalog WHERE user_id = ? AND ativo = 1 AND component_name IN (${placeholders})`
    ).all(req.user.id, ...names);
    const map = {};
    for (const r of rows) map[r.component_name] = r;
    res.json(map);
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
    const { nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf, direcao_corte, modo_corte } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare(`INSERT INTO cnc_chapas (user_id, nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf, direcao_corte, modo_corte)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, nome, material_code || '', espessura_nominal || 18, espessura_real || 18.5,
        comprimento || 2750, largura || 1850, refilo || 10, veio || 'sem_veio', preco || 0, kerf ?? 4, direcao_corte || 'herdar', modo_corte || 'herdar');
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/chapas/:id', requireAuth, (req, res) => {
    const { nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf, ativo, direcao_corte, modo_corte } = req.body;
    db.prepare(`UPDATE cnc_chapas SET nome=?, material_code=?, espessura_nominal=?, espessura_real=?, comprimento=?, largura=?, refilo=?, veio=?, preco=?, kerf=?, ativo=?, direcao_corte=?, modo_corte=? WHERE id=?`)
        .run(nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf ?? 4, ativo ?? 1, direcao_corte || 'herdar', modo_corte || 'herdar', req.params.id);
    res.json({ ok: true });
});

router.delete('/chapas/:id', requireAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id || isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        // Nuclear: exec com SQL puro — PRAGMA foreign_keys só funciona fora de transaction
        // e db.exec() roda fora do wrapper de transaction do better-sqlite3
        db.exec('PRAGMA foreign_keys = OFF');
        try {
            // Parametrizado — sem interpolação de template string
            db.prepare('DELETE FROM cnc_retalhos WHERE chapa_ref_id = ?').run(id);
            db.prepare('DELETE FROM cnc_estoque_mov WHERE chapa_id = ?').run(id);
            db.prepare('DELETE FROM cnc_material_consumo WHERE chapa_id = ?').run(id);
            db.prepare('DELETE FROM cnc_reserva_material WHERE chapa_id = ?').run(id);
            db.prepare('DELETE FROM cnc_chapas WHERE id = ?').run(id);
        } finally {
            db.exec('PRAGMA foreign_keys = ON');
        }
        res.json({ ok: true });
    } catch (err) {
        try { db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}
        console.error('Erro ao excluir chapa:', err);
        res.status(500).json({ error: 'Erro ao excluir chapa: ' + err.message });
    }
});

// ─── Aliases de Material → Chapa ──────────────────────
router.get('/chapa-aliases', requireAuth, (req, res) => {
    const aliases = db.prepare(`
        SELECT a.*, c.nome as chapa_nome, c.material_code as chapa_material_code, c.espessura_real
        FROM cnc_chapa_aliases a
        JOIN cnc_chapas c ON c.id = a.chapa_id
        WHERE a.user_id = ?
        ORDER BY a.material_code_importado
    `).all(req.user.id);
    res.json(aliases);
});

router.post('/chapa-aliases', requireAuth, (req, res) => {
    try {
        const { material_code_importado, chapa_id } = req.body;
        if (!material_code_importado || !chapa_id) return res.status(400).json({ error: 'material_code_importado e chapa_id são obrigatórios' });
        db.prepare(`INSERT OR REPLACE INTO cnc_chapa_aliases (user_id, material_code_importado, chapa_id) VALUES (?, ?, ?)`)
            .run(req.user.id, material_code_importado, chapa_id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chapa-aliases/bulk', requireAuth, (req, res) => {
    try {
        const { aliases } = req.body; // [{ material_code_importado, chapa_id }]
        if (!Array.isArray(aliases)) return res.status(400).json({ error: 'aliases deve ser array' });
        const ins = db.prepare('INSERT OR REPLACE INTO cnc_chapa_aliases (user_id, material_code_importado, chapa_id) VALUES (?, ?, ?)');
        const insertAll = db.transaction((items) => {
            for (const a of items) ins.run(req.user.id, a.material_code_importado, a.chapa_id);
        });
        insertAll(aliases);
        res.json({ ok: true, total: aliases.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/chapa-aliases/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_chapa_aliases WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
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
    const { maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code,
            doc, comprimento_util, num_cortes, tipo_corte, profundidade_extra,
            rampa_tipo, rampa_angulo, vel_rampa, vel_plunge, rampa_diametro_pct,
            velocidade_acabamento, passes_acabamento } = req.body;
    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    if (!maquina_id) return res.status(400).json({ error: 'Selecione uma máquina' });
    const r = db.prepare(`INSERT INTO cnc_ferramentas
        (user_id, maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code,
         doc, comprimento_util, num_cortes, tipo_corte, profundidade_extra,
         rampa_tipo, rampa_angulo, vel_rampa, vel_plunge, rampa_diametro_pct,
         velocidade_acabamento, passes_acabamento)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        req.user.id, maquina_id, codigo, nome, tipo || 'broca', diametro || 0, profundidade_max || 30,
        velocidade_corte || 4000, rpm || 12000, tool_code || '',
        doc ?? null, comprimento_util || 25, num_cortes || 2, tipo_corte || 'broca', profundidade_extra ?? null,
        rampa_tipo ?? null, rampa_angulo ?? null, vel_rampa ?? null, vel_plunge ?? null, rampa_diametro_pct ?? null,
        velocidade_acabamento ?? null, passes_acabamento || 0);
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/ferramentas/:id', requireAuth, (req, res) => {
    const { maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code, ativo,
            doc, comprimento_util, num_cortes, tipo_corte, profundidade_extra,
            rampa_tipo, rampa_angulo, vel_rampa, vel_plunge, rampa_diametro_pct,
            velocidade_acabamento, passes_acabamento } = req.body;
    db.prepare(`UPDATE cnc_ferramentas SET
        maquina_id=?, codigo=?, nome=?, tipo=?, diametro=?, profundidade_max=?, velocidade_corte=?, rpm=?, tool_code=?, ativo=?,
        doc=?, comprimento_util=?, num_cortes=?, tipo_corte=?, profundidade_extra=?,
        rampa_tipo=?, rampa_angulo=?, vel_rampa=?, vel_plunge=?, rampa_diametro_pct=?,
        velocidade_acabamento=?, passes_acabamento=?
        WHERE id=?`)
        .run(maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code, ativo ?? 1,
            doc ?? null, comprimento_util ?? 25, num_cortes ?? 2, tipo_corte || 'broca', profundidade_extra ?? null,
            rampa_tipo ?? null, rampa_angulo ?? null, vel_rampa ?? null, vel_plunge ?? null, rampa_diametro_pct ?? null,
            velocidade_acabamento ?? null, passes_acabamento ?? 0,
            req.params.id);
    res.json({ ok: true });
});

router.delete('/ferramentas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_ferramentas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ─── Tool Wear Tracking ──────────────────────────────────

// GET /ferramentas/alertas — tools exceeding 80% wear limit (MUST be before :maquinaId param route)
router.get('/ferramentas/alertas', requireAuth, (req, res) => {
    const maquinaId = req.query.maquina_id ? Number(req.query.maquina_id) : null;
    const whereMachine = maquinaId ? ' AND f.maquina_id = ?' : '';
    const params = maquinaId ? [maquinaId] : [];
    const alertas = db.prepare(`
        SELECT f.*, m.nome as maquina_nome
        FROM cnc_ferramentas f
        LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id
        WHERE f.ativo = 1 AND f.metros_limite > 0
          AND (CAST(f.metros_acumulados AS REAL) / CAST(f.metros_limite AS REAL)) >= 0.8
          ${whereMachine}
        ORDER BY (CAST(f.metros_acumulados AS REAL) / CAST(f.metros_limite AS REAL)) DESC
    `).all(...params);
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
        custo_hora_maquina=?, custo_troca_ferramenta=?, custo_borda_linear=?,
        velocidade_corte=?, velocidade_usinagem=?, velocidade_rapido=?, tempo_setup_chapa=?,
        estrategia_face=?,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=1`).run(
        c.espaco_pecas ?? 7,
        c.peca_min_largura ?? 200, c.peca_min_comprimento ?? 200,
        c.considerar_sobra ?? 1, c.sobra_min_largura ?? 300, c.sobra_min_comprimento ?? 600,
        c.kerf_padrao ?? 4, c.usar_guilhotina ?? 1, c.usar_retalhos ?? 1, c.iteracoes_otimizador ?? 300,
        c.modo_otimizador ?? 'guilhotina', c.refilo ?? 10, c.permitir_rotacao ?? 1, c.direcao_corte ?? 'misto',
        c.otimizar_trocas_ferramenta ?? 1,
        c.custo_hora_maquina ?? 80, c.custo_troca_ferramenta ?? 5, c.custo_borda_linear ?? 0.5,
        c.velocidade_corte ?? 8000, c.velocidade_usinagem ?? 3000, c.velocidade_rapido ?? 20000, c.tempo_setup_chapa ?? 3,
        c.estrategia_face ?? 'auto'
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
    const materialId = Number(r.lastInsertRowid);
    const materialNome = b.nome;
    const materialCor = b.cor || '';

    // ─── Auto-criar fitas de borda para este material ───
    // Alturas padrão: 22mm, 35mm, 64mm
    const fitaAlturas = [22, 35, 64];
    const fitasCreated = [];
    try {
        const insertFita = db.prepare(`INSERT INTO biblioteca
            (tipo, cod, nome, descricao, unidade, preco, espessura, largura, altura, perda_pct, preco_m2, fita_preco, categoria)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const alt of fitaAlturas) {
            const fitaCod = `fita_${(b.codigo || materialNome).toLowerCase().replace(/\s+/g, '_')}_${alt}mm`;
            const fitaNome = `Fita ${materialNome} ${alt}mm`;
            const fitaDesc = `Fita de borda ${alt}mm - ${materialNome}${materialCor ? ' ' + materialCor : ''}`;
            const fr = insertFita.run(
                'material', fitaCod, fitaNome, fitaDesc, 'm', 0, 0.45, alt, 0, 0, 0, 0, 'fita_borda'
            );
            fitasCreated.push({ id: Number(fr.lastInsertRowid), nome: fitaNome, altura: alt });
        }
    } catch (e) {
        console.error('[CNC] Erro ao criar fitas de borda:', e.message);
    }

    res.json({ id: materialId, fitas_criadas: fitasCreated });
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
    // Buscar material antes de desativar (para excluir fitas associadas)
    const mat = db.prepare('SELECT * FROM cnc_materiais WHERE id = ?').get(req.params.id);

    // Soft delete — apenas desativa
    db.prepare('UPDATE cnc_materiais SET ativo = 0 WHERE id = ?').run(req.params.id);

    // ─── Auto-excluir fitas de borda associadas ───
    if (mat) {
        const fitaAlturas = [22, 35, 64];
        for (const alt of fitaAlturas) {
            const fitaCod = `fita_${(mat.codigo || mat.nome).toLowerCase().replace(/\s+/g, '_')}_${alt}mm`;
            // Excluir por código exato
            db.prepare('DELETE FROM biblioteca WHERE cod = ? AND categoria = ?').run(fitaCod, 'fita_borda');
        }
        // Também excluir por nome parcial (para fitas criadas antes do sistema de código)
        db.prepare("DELETE FROM biblioteca WHERE nome LIKE ? AND categoria = ?").run(`Fita ${mat.nome}%`, 'fita_borda');
    }

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

    // Peças por dia (últimos 7 dias ativos)
    const activeDays = dailyData.filter(d => d.chapas > 0);
    const pecasPorDia = activeDays.length > 0
        ? Math.round(activeDays.reduce((s, d) => s + d.pecas, 0) / activeDays.length)
        : 0;

    // Pico de aproveitamento
    const peakAprov = dailyData.reduce((max, d) => Math.max(max, d.avgAprov || 0), 0);

    // Dias ativos no período
    const diasAtivos = activeDays.length;

    // Horas de máquina estimadas no período (soma do gcode_historico)
    const gcodeHist = db.prepare(`
        SELECT gh.tempo_estimado_min, gh.dist_corte_m, gh.trocas_ferramenta
        FROM cnc_gcode_historico gh
        INNER JOIN cnc_lotes l ON gh.lote_id = l.id AND l.user_id = ?
        WHERE date(gh.criado_em) >= date(?) AND date(gh.criado_em) <= date(?)
    `).all(req.user.id, de, ate);

    const tempoMaquinaMin = gcodeHist.reduce((s, r) => s + (r.tempo_estimado_min || 0), 0);
    const distCorteTotal = gcodeHist.reduce((s, r) => s + (r.dist_corte_m || 0), 0);
    const trocasTotal = gcodeHist.reduce((s, r) => s + (r.trocas_ferramenta || 0), 0);

    res.json({
        totalChapas,
        totalPecas,
        avgAproveitamento: countAprov > 0 ? Math.round(sumAprov / countAprov * 10) / 10 : 0,
        peakAproveitamento: peakAprov,
        lotesConcluidos,
        totalLotes: lotes.length,
        pecasPorDia,
        diasAtivos,
        dailyData,
        recentLotes,
        // KPIs de máquina
        tempoMaquinaMin: Math.round(tempoMaquinaMin * 10) / 10,
        distCorteTotal: Math.round(distCorteTotal * 10) / 10,
        trocasFerramenta: trocasTotal,
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

router.get('/dashboard/producao', requireAuth, (req, res) => {
    try {
        const maquinas = db.prepare(`
            SELECT id, nome, fabricante, modelo, ativo, operador, capacidade_magazine, x_max, y_max
            FROM cnc_maquinas
            WHERE ativo = 1 AND (user_id = ? OR user_id IS NULL)
            ORDER BY padrao DESC, nome
        `).all(req.user.id);

        const fila = db.prepare(`
            SELECT f.*, l.nome as lote_nome, l.cliente as lote_cliente, l.total_pecas,
                   l.total_chapas, l.data_entrega, m.nome as maquina_nome
            FROM cnc_fila_producao f
            LEFT JOIN cnc_lotes l ON f.lote_id = l.id
            LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id
            WHERE l.user_id = ?
              AND (f.status != 'concluido' OR f.fim_em > datetime('now', '-24 hours'))
            ORDER BY f.status = 'em_producao' DESC, f.prioridade DESC, f.ordem ASC, f.criado_em ASC
        `).all(req.user.id);

        const perf30 = db.prepare(`
            SELECT mp.maquina_id,
                   SUM(mp.chapas_cortadas) as chapas,
                   SUM(mp.pecas_cortadas) as pecas,
                   SUM(mp.tempo_corte_min) as tempo_corte,
                   SUM(mp.tempo_ocioso_min) as tempo_ocioso,
                   SUM(mp.trocas_ferramenta) as trocas,
                   SUM(mp.defeitos) as defeitos
            FROM cnc_maquina_performance mp
            LEFT JOIN cnc_lotes l ON l.id = mp.lote_id
            WHERE (l.user_id = ? OR l.user_id IS NULL)
              AND date(mp.data_registro) >= date('now', '-30 days')
            GROUP BY mp.maquina_id
        `).all(req.user.id);
        const perfMap = Object.fromEntries(perf30.map(p => [p.maquina_id, p]));

        const alertas = db.prepare(`
            SELECT f.id, f.nome, f.codigo, f.maquina_id, f.metros_acumulados, f.metros_limite,
                   m.nome as maquina_nome
            FROM cnc_ferramentas f
            LEFT JOIN cnc_maquinas m ON m.id = f.maquina_id
            WHERE f.ativo = 1
              AND f.metros_limite > 0
              AND (CAST(f.metros_acumulados AS REAL) / CAST(f.metros_limite AS REAL)) >= 0.8
              AND (f.user_id = ? OR f.user_id IS NULL)
            ORDER BY (CAST(f.metros_acumulados AS REAL) / CAST(f.metros_limite AS REAL)) DESC
            LIMIT 12
        `).all(req.user.id).map(f => ({
            ...f,
            percentage: Math.round(((f.metros_acumulados || 0) / (f.metros_limite || 5000)) * 1000) / 10,
        }));

        const byMachineQueue = {};
        for (const item of fila) {
            const key = item.maquina_id || 'sem_maquina';
            if (!byMachineQueue[key]) byMachineQueue[key] = { aguardando: 0, em_producao: 0, concluido: 0, total: 0 };
            byMachineQueue[key][item.status] = (byMachineQueue[key][item.status] || 0) + 1;
            byMachineQueue[key].total++;
        }

        const maquinasResumo = maquinas.map(m => {
            const q = byMachineQueue[m.id] || { aguardando: 0, em_producao: 0, concluido: 0, total: 0 };
            const p = perfMap[m.id] || {};
            const tempo = Number(p.tempo_corte || 0);
            const pecasHora = tempo > 0 ? Math.round((Number(p.pecas || 0) / (tempo / 60)) * 10) / 10 : 0;
            const eficiencia = (Number(p.tempo_corte || 0) + Number(p.tempo_ocioso || 0)) > 0
                ? Math.round((Number(p.tempo_corte || 0) / (Number(p.tempo_corte || 0) + Number(p.tempo_ocioso || 0))) * 1000) / 10
                : 0;
            return {
                ...m,
                fila: q,
                performance: {
                    chapas: Number(p.chapas || 0),
                    pecas: Number(p.pecas || 0),
                    tempo_corte_min: Math.round(tempo * 10) / 10,
                    pecas_hora: pecasHora,
                    eficiencia,
                    trocas: Number(p.trocas || 0),
                    defeitos: Number(p.defeitos || 0),
                },
                alertas_ferramentas: alertas.filter(a => a.maquina_id === m.id).length,
            };
        });

        res.json({
            resumo: {
                maquinas_ativas: maquinas.length,
                em_producao: fila.filter(f => f.status === 'em_producao').length,
                aguardando: fila.filter(f => f.status === 'aguardando').length,
                concluidas_24h: fila.filter(f => f.status === 'concluido').length,
                sem_maquina: fila.filter(f => !f.maquina_id && f.status !== 'concluido').length,
                alertas_ferramentas: alertas.length,
            },
            maquinas: maquinasResumo,
            fila: fila.slice(0, 20),
            sem_maquina: byMachineQueue.sem_maquina || { aguardando: 0, em_producao: 0, concluido: 0, total: 0 },
            alertas,
        });
    } catch (err) {
        console.error('dashboard/producao error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/dashboard/aprendizado', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT mp.*, m.nome as maquina_nome, l.nome as lote_nome,
                   gh.tempo_estimado_min, gh.dist_corte_m, gh.total_operacoes, gh.alertas_count
            FROM cnc_maquina_performance mp
            LEFT JOIN cnc_maquinas m ON m.id = mp.maquina_id
            LEFT JOIN cnc_lotes l ON l.id = mp.lote_id
            LEFT JOIN cnc_gcode_historico gh ON gh.lote_id = mp.lote_id
                AND (gh.chapa_idx IS NULL OR gh.chapa_idx = 0 OR gh.chapa_idx = (
                    SELECT f.chapa_idx FROM cnc_fila_producao f
                    WHERE f.lote_id = mp.lote_id
                    ORDER BY f.fim_em DESC LIMIT 1
                ))
            WHERE l.user_id = ?
              AND date(mp.data_registro) >= date('now', '-90 days')
            GROUP BY mp.id
            ORDER BY mp.criado_em DESC
            LIMIT 80
        `).all(req.user.id);

        const valid = rows.filter(r => Number(r.tempo_corte_min || 0) > 0);
        const withEstimate = valid.filter(r => Number(r.tempo_estimado_min || 0) > 0);
        const erroMedioPct = withEstimate.length
            ? withEstimate.reduce((s, r) => s + ((Number(r.tempo_corte_min || 0) - Number(r.tempo_estimado_min || 0)) / Number(r.tempo_estimado_min || 1)) * 100, 0) / withEstimate.length
            : 0;
        const totalDefeitos = valid.reduce((s, r) => s + Number(r.defeitos || 0), 0);
        const totalPecas = valid.reduce((s, r) => s + Number(r.pecas_cortadas || 0), 0);
        const totalTempo = valid.reduce((s, r) => s + Number(r.tempo_corte_min || 0), 0);
        const pecasHora = totalTempo > 0 ? totalPecas / (totalTempo / 60) : 0;
        const trocasPorChapa = valid.length ? valid.reduce((s, r) => s + Number(r.trocas_ferramenta || 0), 0) / valid.reduce((s, r) => s + Number(r.chapas_cortadas || 0), 0) : 0;

        const porMaquinaMap = {};
        for (const r of valid) {
            const key = r.maquina_id || 'sem_maquina';
            if (!porMaquinaMap[key]) porMaquinaMap[key] = {
                maquina_id: r.maquina_id,
                maquina_nome: r.maquina_nome || 'Sem máquina',
                chapas: 0,
                pecas: 0,
                tempo: 0,
                defeitos: 0,
                erro_estimativa_sum: 0,
                erro_estimativa_count: 0,
            };
            const bucket = porMaquinaMap[key];
            bucket.chapas += Number(r.chapas_cortadas || 0);
            bucket.pecas += Number(r.pecas_cortadas || 0);
            bucket.tempo += Number(r.tempo_corte_min || 0);
            bucket.defeitos += Number(r.defeitos || 0);
            if (Number(r.tempo_estimado_min || 0) > 0) {
                bucket.erro_estimativa_sum += ((Number(r.tempo_corte_min || 0) - Number(r.tempo_estimado_min || 0)) / Number(r.tempo_estimado_min || 1)) * 100;
                bucket.erro_estimativa_count++;
            }
        }

        const porMaquina = Object.values(porMaquinaMap).map(m => ({
            ...m,
            tempo: Math.round(m.tempo * 10) / 10,
            pecas_hora: m.tempo > 0 ? Math.round((m.pecas / (m.tempo / 60)) * 10) / 10 : 0,
            erro_estimativa_pct: m.erro_estimativa_count ? Math.round((m.erro_estimativa_sum / m.erro_estimativa_count) * 10) / 10 : 0,
            taxa_defeito_pct: m.pecas > 0 ? Math.round((m.defeitos / m.pecas) * 1000) / 10 : 0,
        })).sort((a, b) => b.chapas - a.chapas);

        const insights = [];
        if (withEstimate.length >= 3 && Math.abs(erroMedioPct) > 15) {
            insights.push(erroMedioPct > 0
                ? `O tempo real está ${Math.round(erroMedioPct)}% acima do estimado. Vale calibrar feeds, trocas e tempo de setup.`
                : `O tempo real está ${Math.abs(Math.round(erroMedioPct))}% abaixo do estimado. As previsões podem estar conservadoras demais.`);
        }
        if (trocasPorChapa > 3) insights.push(`Média de ${trocasPorChapa.toFixed(1)} trocas por chapa. Agrupar operações por ferramenta deve reduzir parada.`);
        if (totalPecas > 0 && (totalDefeitos / totalPecas) > 0.02) insights.push(`Taxa de defeitos acima de 2%. Investigue fixação, ferramenta e sequência de contorno.`);
        if (!insights.length) insights.push('Ainda não há desvio forte detectado. O aprendizado melhora conforme a fila registra tempo real.');

        res.json({
            resumo: {
                amostras: valid.length,
                com_estimativa: withEstimate.length,
                erro_medio_pct: Math.round(erroMedioPct * 10) / 10,
                pecas_hora: Math.round(pecasHora * 10) / 10,
                taxa_defeito_pct: totalPecas > 0 ? Math.round((totalDefeitos / totalPecas) * 1000) / 10 : 0,
                trocas_por_chapa: Math.round(trocasPorChapa * 10) / 10,
            },
            por_maquina: porMaquina,
            insights,
            recentes: rows.slice(0, 20),
        });
    } catch (err) {
        console.error('dashboard/aprendizado error:', err);
        res.status(500).json({ error: err.message });
    }
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
        const custoBordaLinear = config.custo_borda_linear || 0.5; // R$/m linear de fita de borda

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
                const custoBordas = metrosBorda * custoBordaLinear;

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

            // Tool change cost — derived from G-code history for this chapa (if available)
            const gcodeHist = db.prepare(
                'SELECT trocas_ferramenta FROM cnc_gcode_historico WHERE lote_id = ? AND chapa_idx = ? ORDER BY criado_em DESC LIMIT 1'
            ).get(lote.id, ci);
            const trocasFerramenta = gcodeHist?.trocas_ferramenta || 0;
            const custoTrocas = Math.round(trocasFerramenta * custoTroca * 100) / 100;

            const custoTotalChapa = custoMaterialChapa + custoUsinagemChapa + custoBordasChapa + custoDesperdicio + custoTrocas;
            totalGeral += custoTotalChapa;

            chapasResult.push({
                chapaIdx: ci,
                material: chapa.material || chapa.material_code || '?',
                total_pecas: (chapa.pecas || []).length,
                custo_material: Math.round(custoMaterialChapa * 100) / 100,
                custo_usinagem: Math.round(custoUsinagemChapa * 100) / 100,
                custo_bordas: Math.round(custoBordasChapa * 100) / 100,
                custo_desperdicio: custoDesperdicio,
                custo_trocas: custoTrocas,
                trocas_ferramenta: trocasFerramenta,
                custo_total: Math.round(custoTotalChapa * 100) / 100,
                pecas: pecasResult,
            });
        }

        res.json({
            config: { custo_hora_maquina: custoHora, custo_troca_ferramenta: custoTroca, custo_borda_linear: custoBordaLinear },
            chapas: chapasResult,
            total_geral: Math.round(totalGeral * 100) / 100,
        });
    } catch (err) {
        console.error('custos error:', err);
        res.status(500).json({ error: 'Erro ao calcular custos' });
    }
});

// ─── Estimativa de tempo de corte por lote ───────────────────────
// Calcula metros lineares de corte por chapa e tempo estimado
// baseado na velocidade de avanço da ferramenta principal.
router.get('/tempo-corte/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        const plano = JSON.parse(lote.plano_json);
        const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get() || {};

        // Velocidades padrão (mm/min) — carregadas da config ou defaults industriais
        const velCorte = config.velocidade_corte || 8000;   // mm/min corte contorno
        const velUsin = config.velocidade_usinagem || 3000; // mm/min usinagem interna
        const velRapido = config.velocidade_rapido || 20000;

        // Tenta buscar ferramenta principal da máquina padrão
        const maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE padrao = 1 AND ativo = 1 LIMIT 1').get()
            || db.prepare('SELECT * FROM cnc_maquinas WHERE ativo = 1 LIMIT 1').get();
        const ferrPrincipal = maquina
            ? db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1 ORDER BY id LIMIT 1').get(maquina.id)
            : null;
        const velEfetiva = ferrPrincipal?.velocidade_avanco || velCorte;

        const pecasDB = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        const pecasMap = {};
        for (const p of pecasDB) pecasMap[p.id] = p;

        let totalMetrosCorte = 0;
        let totalMetrosUsin = 0;
        let totalTempMin = 0;
        const chapasResult = [];

        for (let ci = 0; ci < (plano.chapas || []).length; ci++) {
            const chapa = plano.chapas[ci];
            const pecas = chapa.pecas || [];
            let metrosCorteChapa = 0;
            let metrosUsinChapa = 0;

            for (const pp of pecas) {
                const pDb = pecasMap[pp.pecaId];
                // Perímetro de corte = 2*(w+h) em mm
                const w = pp.w || 0;
                const h = pp.h || 0;
                const perimetro = 2 * (w + h);
                metrosCorteChapa += perimetro / 1000;

                // Usinagens internas
                if (pDb?.machining_json) {
                    try {
                        const mj = JSON.parse(pDb.machining_json);
                        const workers = mj.workers || (Array.isArray(mj) ? mj : []);
                        for (const w of workers) {
                            const tipo = (w.type || w.category || '').toLowerCase();
                            if (/furo|hole|drill/.test(tipo)) {
                                // Furo: diâmetro como comprimento de corte circular
                                const diam = w.diameter || 8;
                                metrosUsinChapa += (Math.PI * diam) / 1000;
                            } else if (/canal|rasgo|groove|slot/.test(tipo)) {
                                const len = w.length || 50;
                                metrosUsinChapa += (len * 2) / 1000; // ida e volta
                            } else if (/pocket|rebaixo|cavidade/.test(tipo)) {
                                const pw = w.pocket_width || w.width || 50;
                                const ph = w.pocket_height || w.height || 50;
                                // Raster fill estimado: largura / (diam_fresa * 0.6) passadas
                                const passadas = Math.ceil(ph / 6);
                                metrosUsinChapa += (pw * passadas) / 1000;
                            }
                        }
                    } catch (_) {}
                }
            }

            // Tempo = metros / (vel_mm_min / 1000) → minutos
            const tempoCorteSec = (metrosCorteChapa * 1000) / velEfetiva; // minutos de corte
            const tempoUsinSec = (metrosUsinChapa * 1000) / velUsin;
            // Tempo de setup por chapa (fixar, referenciar): 3 min default
            const tempoSetup = config.tempo_setup_chapa || 3;
            const tempoTotalMin = Math.round((tempoCorteSec + tempoUsinSec) + tempoSetup);

            totalMetrosCorte += metrosCorteChapa;
            totalMetrosUsin += metrosUsinChapa;
            totalTempMin += tempoTotalMin;

            chapasResult.push({
                chapaIdx: ci,
                material: chapa.material || chapa.material_code || '?',
                aproveitamento: chapa.aproveitamento || 0,
                total_pecas: pecas.length,
                metros_corte: Math.round(metrosCorteChapa * 100) / 100,
                metros_usinagem: Math.round(metrosUsinChapa * 100) / 100,
                tempo_estimado_min: tempoTotalMin,
            });
        }

        res.json({
            config: {
                velocidade_corte: velEfetiva,
                velocidade_usinagem: velUsin,
                tempo_setup_chapa: config.tempo_setup_chapa || 3,
                maquina: maquina?.nome || null,
            },
            chapas: chapasResult,
            total_metros_corte: Math.round(totalMetrosCorte * 100) / 100,
            total_metros_usinagem: Math.round(totalMetrosUsin * 100) / 100,
            tempo_total_min: totalTempMin,
            tempo_total_horas: Math.round(totalTempMin / 60 * 10) / 10,
        });
    } catch (err) {
        console.error('tempo-corte error:', err);
        res.status(500).json({ error: 'Erro ao calcular tempo de corte' });
    }
});

// ─── Validação de borda de usinagem por lote ─────────────────────
// Checa se operações de usinagem estão muito próximas da borda da peça
router.get('/validar-bordas/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const pecasDB = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        const warnings = [];
        const MARGEM_MIN_MM = 6; // distância mínima de furo ao centro até a borda

        for (const peca of pecasDB) {
            if (!peca.machining_json) continue;
            let mj = {};
            try { mj = JSON.parse(peca.machining_json); } catch (_) { continue; }

            const workers = mj.workers || (Array.isArray(mj) ? mj : []);
            const W = peca.comprimento || 0;
            const H = peca.largura || 0;
            if (!W || !H) continue;

            for (let wi = 0; wi < workers.length; wi++) {
                const w = workers[wi];
                const tipo = (w.type || w.category || '').toLowerCase();
                const x = Number(w.x ?? w.position_x ?? 0);
                const y = Number(w.y ?? w.position_y ?? 0);
                const raio = (w.diameter || 6) / 2;
                const margemEfetiva = raio + MARGEM_MIN_MM;

                const distLeft = x;
                const distRight = W - x;
                const distBottom = y;
                const distTop = H - y;
                const distMin = Math.min(distLeft, distRight, distBottom, distTop);

                if (distMin < margemEfetiva) {
                    const lado = distLeft < margemEfetiva ? 'esquerda' :
                                 distRight < margemEfetiva ? 'direita' :
                                 distBottom < margemEfetiva ? 'baixo' : 'cima';
                    warnings.push({
                        pecaId: peca.id,
                        pecaDesc: peca.descricao || `Peça #${peca.id}`,
                        workerIdx: wi,
                        tipo: 'borda_proxima',
                        mensagem: `${tipo || 'Usinagem'} a ${Math.round(distMin)}mm da borda (${lado}) — mínimo recomendado: ${Math.round(margemEfetiva)}mm`,
                        severidade: distMin < raio ? 'erro' : 'alerta',
                        distancia_mm: Math.round(distMin),
                        x, y, raio,
                    });
                }
            }
        }

        res.json({ ok: true, warnings, total: warnings.length });
    } catch (err) {
        console.error('validar-bordas error:', err);
        res.status(500).json({ error: 'Erro ao validar bordas' });
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
        // Limitar aos últimos 200 lotes com plano para evitar parsing excessivo
        const maxLotes = Math.min(Number(req.query.limit) || 200, 500);
        const lotes = db.prepare(`
            SELECT id, nome, cliente, projeto, criado_em, plano_json, aproveitamento
            FROM cnc_lotes
            WHERE user_id = ? AND plano_json IS NOT NULL AND plano_json != ''
            ORDER BY criado_em DESC
            LIMIT ?
        `).all(req.user.id, maxLotes);

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

// Segurança: extensão derivada do mimetype (whitelist), nunca do originalname.
// Se viesse do originalname, um atacante autenticado podia subir `img.html` com
// mimetype falsificado e obter XSS stored via /uploads servido como estático.
const MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
};
const fotoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
        const ext = MIME_TO_EXT[file.mimetype.toLowerCase()] || 'bin';
        cb(null, `foto-${unique}.${ext}`);
    },
});
const uploadFoto = multer({
    storage: fotoStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (MIME_TO_EXT[file.mimetype.toLowerCase()]) cb(null, true);
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
        const ext = MIME_TO_EXT[file.mimetype.toLowerCase()] || 'bin';
        cb(null, `retalho-${unique}.${ext}`);
    },
});
const uploadRetalhoFoto = multer({
    storage: retalhoFotoStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (MIME_TO_EXT[file.mimetype.toLowerCase()]) cb(null, true);
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
        const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY id').all(lote.id);
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
                        // Marcar peças como cortadas
                        const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
                        if (pecaIds.length > 0) {
                            const placeholders = pecaIds.map(() => '?').join(',');
                            db.prepare(`UPDATE cnc_pecas SET chapa_idx = ? WHERE id IN (${placeholders}) AND chapa_idx IS NULL`).run(chapa_idx, ...pecaIds);
                        }

                        // ═══ Criar retalhos no DB agora que a chapa foi cortada ═══
                        const sobras = (chapa.retalhos || []).filter(r => r.status === 'prevista' || !r.retalho_id);
                        for (const s of sobras) {
                            const sw = s.sobra_w || Math.round(Math.max(s.w, s.h));
                            const sh = s.sobra_h || Math.round(Math.min(s.w, s.h));
                            const matCode = s.material_code || chapa.material_code;
                            const esp = s.espessura || chapa.espessura_real;
                            const chapaRefId = s.chapa_ref_id || null;

                            if (sw >= 200 && sh >= 200) { // mínimo razoável para retalho útil
                                const retResult = db.prepare(`INSERT INTO cnc_retalhos (user_id, chapa_ref_id, nome, material_code, espessura_real, comprimento, largura, origem_lote)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                                    req.user.id, chapaRefId,
                                    `Retalho ${sw}x${sh}`,
                                    matCode, esp, sw, sh, String(req.params.loteId)
                                );
                                db.prepare(`INSERT INTO cnc_retalho_historico (retalho_id, lote_id, chapa_idx, largura, comprimento, material_code, espessura, origem_lote_id, origem_chapa_idx, acao)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'criado')`).run(
                                    String(retResult.lastInsertRowid), req.params.loteId, chapa_idx, sh, sw, matCode, esp, Number(req.params.loteId), chapa_idx
                                );

                                // Atualizar o plano_json com o ID do retalho criado
                                s.retalho_id = Number(retResult.lastInsertRowid);
                                s.status = 'criado';
                            }
                        }

                        // Salvar plano atualizado com retalho_ids
                        db.prepare('UPDATE cnc_lotes SET plano_json = ? WHERE id = ?').run(JSON.stringify(plano), req.params.loteId);
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
                // QR rastreabilidade ponta a ponta
                qr_data: JSON.stringify({
                    t: 'peca',
                    lid: lote.id,
                    pid: p.id,
                    cod: p.persistent_id || p.upmcode || `P${p.id}`,
                    lote: lote.nome,
                    cli: lote.cliente,
                    mod: p.modulo_desc || '',
                    desc: (p.descricao || '').slice(0, 40),
                    dim: `${p.comprimento}x${p.largura}x${p.espessura}`,
                    ch: chapaInfo?.idx || 0,
                }),
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
        const result = generateGcodeForChapa(chapa, chapaIdx, ctx.pecasDb, maquina, toolMap, ctx.usinagemTipos, ctx.cfg, ctx.opOverrides || {}, ctx.opOverridesPeca || {}, ctx.usinagemCatalogMap || {});
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

// ═══════════════════════════════════════════════════════════════════
// PAINEL DE FERRAMENTAS — Scan de operações + Overrides avançados
// ═══════════════════════════════════════════════════════════════════

// Scan: escaneia o plano de corte e retorna operações agrupadas
router.get('/lotes/:loteId/operacoes-scan', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        let plano;
        try { plano = JSON.parse(lote.plano_json); } catch { return res.status(400).json({ error: 'Plano inválido' }); }

        // Coletar todas as peças do plano
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

        // Máquina ativa
        const maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE padrao = 1 AND ativo = 1 LIMIT 1').get()
            || db.prepare('SELECT * FROM cnc_maquinas WHERE ativo = 1 LIMIT 1').get();
        const ferramentas = maquina
            ? db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').all(maquina.id)
            : [];
        const toolMap = {};
        for (const f of ferramentas) { if (f.tool_code) toolMap[f.tool_code] = f; }

        // Agrupar operações por op_key (tipo + diâmetro + tool_code)
        const groups = {}; // op_key -> { tipo, diametro, tool_code, count, pecas: [{id, desc, count, workers}] }

        for (const ch of plano.chapas || []) {
            for (const pp of ch.pecas || []) {
                const pDb = pecasMap[pp.pecaId];
                if (!pDb) continue;

                let mach = {};
                try { mach = JSON.parse(pDb.machining_json || '{}'); } catch {}
                const workers = [];
                if (mach.workers) {
                    const wArr = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);
                    for (let wi = 0; wi < wArr.length; wi++) {
                        if (wArr[wi] && typeof wArr[wi] === 'object') workers.push({ ...wArr[wi], _idx: wi });
                    }
                }

                for (const w of workers) {
                    const tipo = (w.type || w.category || '').toLowerCase();
                    const diam = Number(w.diameter || 0);
                    const depth = Number(w.depth || 0);
                    const tc = w.tool_code || w.tool || '';
                    // op_key: agrupa por tipo + diâmetro (arredondado) + tool_code
                    const diamKey = diam > 0 ? Math.round(diam * 10) / 10 : 0;
                    const opKey = `${tipo || 'unknown'}__d${diamKey}__${tc}`;

                    if (!groups[opKey]) {
                        // Classificar tipo amigável
                        let tipoLabel = 'Operação';
                        let categoria = 'generic';
                        if (/hole/i.test(tipo)) { tipoLabel = 'Furo'; categoria = 'hole'; }
                        else if (/pocket|rebaixo/i.test(tipo)) { tipoLabel = 'Rebaixo/Pocket'; categoria = 'pocket'; }
                        else if (/saw|cut/i.test(tipo)) { tipoLabel = 'Rasgo/Canal'; categoria = 'groove'; }
                        else if (/slot/i.test(tipo)) { tipoLabel = 'Rasgo'; categoria = 'groove'; }

                        // Métodos disponíveis por categoria
                        let metodos = ['desativado'];
                        if (categoria === 'hole') metodos = ['drill', 'helical', 'circular', 'desativado'];
                        else if (categoria === 'pocket') metodos = ['pocket_zigzag', 'pocket_espiral', 'helical', 'desativado'];
                        else if (categoria === 'groove') metodos = ['groove', 'multi_pass', 'desativado'];
                        else metodos = ['drill', 'helical', 'desativado'];

                        const tool = toolMap[tc] || null;

                        groups[opKey] = {
                            op_key: opKey,
                            tipo_raw: tipo,
                            tipo_label: tipoLabel,
                            categoria,
                            diametro: diamKey,
                            profundidade_tipica: depth,
                            tool_code: tc,
                            tool: tool ? { id: tool.id, codigo: tool.codigo, nome: tool.nome, diametro: tool.diametro, tipo_corte: tool.tipo_corte } : null,
                            metodos_disponiveis: metodos,
                            count: 0,
                            pecas: {},
                        };
                    }

                    groups[opKey].count++;
                    // Acumular por peça
                    const pk = `${pDb.id}`;
                    if (!groups[opKey].pecas[pk]) {
                        groups[opKey].pecas[pk] = {
                            peca_id: pDb.id,
                            descricao: pDb.descricao || pDb.persistent_id || `Peça ${pDb.id}`,
                            modulo: pDb.modulo_desc || '',
                            count: 0,
                            profundidades: [],
                        };
                    }
                    groups[opKey].pecas[pk].count++;
                    if (depth > 0) groups[opKey].pecas[pk].profundidades.push(depth);
                }
            }
        }

        // Converter pecas de map para array e calcular profundidade média
        const result = Object.values(groups).map(g => {
            const pecasArr = Object.values(g.pecas);
            const allDepths = pecasArr.flatMap(p => p.profundidades);
            const profMedia = allDepths.length > 0 ? Math.round(allDepths.reduce((a, b) => a + b, 0) / allDepths.length * 10) / 10 : 0;
            const profMax = allDepths.length > 0 ? Math.max(...allDepths) : 0;
            return {
                ...g,
                pecas: pecasArr,
                total_pecas: pecasArr.length,
                profundidade_media: profMedia,
                profundidade_max: profMax,
            };
        });

        // Ordenar: furos primeiro, depois pockets, depois rasgos, depois genérico
        const catOrder = { hole: 0, pocket: 1, groove: 2, generic: 3 };
        result.sort((a, b) => (catOrder[a.categoria] ?? 9) - (catOrder[b.categoria] ?? 9) || b.count - a.count);

        // Carregar overrides existentes
        const overrides = db.prepare('SELECT * FROM cnc_operacao_overrides WHERE lote_id = ?').all(lote.id);
        const overridesMap = {};
        for (const o of overrides) overridesMap[o.op_key] = o;

        const overridesPeca = db.prepare('SELECT * FROM cnc_operacao_overrides_peca WHERE lote_id = ?').all(lote.id);
        const overridesPecaMap = {};
        for (const o of overridesPeca) {
            const k = `${o.op_key}__${o.peca_id}`;
            overridesPecaMap[k] = o;
        }

        // Ferramentas compatíveis por categoria
        const ferramentasCompativeis = {};
        for (const g of result) {
            const compat = ferramentas.filter(f => {
                if (g.categoria === 'hole') {
                    // Para furos: brocas do diâmetro exato OU fresas menores (para helical/circular)
                    return (f.tipo_corte === 'broca' && Math.abs(f.diametro - g.diametro) < 1)
                        || (f.tipo_corte !== 'broca' && f.tipo !== 'broca' && f.diametro < g.diametro);
                }
                if (g.categoria === 'pocket') return f.tipo === 'fresa' || f.tipo_corte?.includes('fresa');
                if (g.categoria === 'groove') return true; // serra ou fresa
                return true;
            }).map(f => ({ id: f.id, codigo: f.codigo, nome: f.nome, diametro: f.diametro, tipo_corte: f.tipo_corte, tool_code: f.tool_code }));
            ferramentasCompativeis[g.op_key] = compat;
        }

        res.json({
            operacoes: result,
            overrides: overridesMap,
            overrides_peca: overridesPecaMap,
            ferramentas_compativeis: ferramentasCompativeis,
            maquina: maquina ? { id: maquina.id, nome: maquina.nome } : null,
            total_operacoes: result.reduce((s, g) => s + g.count, 0),
            total_grupos: result.length,
        });
    } catch (err) {
        console.error('Erro scan operacoes:', err);
        res.status(500).json({ error: `Erro ao escanear operações: ${err.message}` });
    }
});

// Salvar override de grupo (op_key)
router.post('/lotes/:loteId/operacoes-override', requireAuth, (req, res) => {
    try {
        const { op_key, ativo, metodo, ferramenta_id, diametro_override, profundidade_override, rpm_override, feed_override, stepover_override, passes_acabamento_override, notas } = req.body;
        if (!op_key) return res.status(400).json({ error: 'op_key obrigatório' });

        db.prepare(`INSERT OR REPLACE INTO cnc_operacao_overrides
            (lote_id, op_key, ativo, metodo, ferramenta_id, diametro_override, profundidade_override, rpm_override, feed_override, stepover_override, passes_acabamento_override, notas, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
            .run(req.params.loteId, op_key, ativo ?? 1, metodo || '', ferramenta_id || null,
                diametro_override ?? null, profundidade_override ?? null, rpm_override ?? null,
                feed_override ?? null, stepover_override ?? null, passes_acabamento_override ?? null, notas || '');

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Salvar override individual por peça
router.post('/lotes/:loteId/operacoes-override-peca', requireAuth, (req, res) => {
    try {
        const { op_key, peca_id, ativo, profundidade_override, diametro_override, notas } = req.body;
        if (!op_key || !peca_id) return res.status(400).json({ error: 'op_key e peca_id obrigatórios' });

        db.prepare(`INSERT OR REPLACE INTO cnc_operacao_overrides_peca
            (lote_id, op_key, peca_id, ativo, profundidade_override, diametro_override, notas, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
            .run(req.params.loteId, op_key, peca_id, ativo ?? 1, profundidade_override ?? null, diametro_override ?? null, notas || '');

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk save overrides
router.post('/lotes/:loteId/operacoes-overrides-bulk', requireAuth, (req, res) => {
    try {
        const { overrides, overrides_peca } = req.body;
        const tx = db.transaction(() => {
            if (Array.isArray(overrides)) {
                const stmt = db.prepare(`INSERT OR REPLACE INTO cnc_operacao_overrides
                    (lote_id, op_key, ativo, metodo, ferramenta_id, diametro_override, profundidade_override, rpm_override, feed_override, stepover_override, passes_acabamento_override, notas, atualizado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
                for (const o of overrides) {
                    stmt.run(req.params.loteId, o.op_key, o.ativo ?? 1, o.metodo || '', o.ferramenta_id || null,
                        o.diametro_override ?? null, o.profundidade_override ?? null, o.rpm_override ?? null,
                        o.feed_override ?? null, o.stepover_override ?? null, o.passes_acabamento_override ?? null, o.notas || '');
                }
            }
            if (Array.isArray(overrides_peca)) {
                const stmt2 = db.prepare(`INSERT OR REPLACE INTO cnc_operacao_overrides_peca
                    (lote_id, op_key, peca_id, ativo, profundidade_override, diametro_override, notas, atualizado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
                for (const o of overrides_peca) {
                    stmt2.run(req.params.loteId, o.op_key, o.peca_id, o.ativo ?? 1, o.profundidade_override ?? null, o.diametro_override ?? null, o.notas || '');
                }
            }
        });
        tx();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deletar todos os overrides de um lote
router.delete('/lotes/:loteId/operacoes-overrides', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_operacao_overrides WHERE lote_id = ?').run(req.params.loteId);
    db.prepare('DELETE FROM cnc_operacao_overrides_peca WHERE lote_id = ?').run(req.params.loteId);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 10: Conferência pós-corte
// ═══════════════════════════════════════════════════════

// GET conferência de um lote
router.get('/conferencia/:loteId', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const rows = db.prepare('SELECT * FROM cnc_conferencia WHERE lote_id = ? ORDER BY chapa_idx, peca_idx').all(lote.id);
    res.json(rows);
});

// POST/PUT conferência de uma peça
router.post('/conferencia/:loteId', requireAuth, (req, res) => {
    const { chapa_idx, peca_idx, peca_desc, status, defeito_tipo, defeito_obs, conferente } = req.body;
    db.prepare(`INSERT INTO cnc_conferencia (lote_id, chapa_idx, peca_idx, peca_desc, status, defeito_tipo, defeito_obs, conferente, conferido_em)
        VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(lote_id, chapa_idx, peca_idx) DO UPDATE SET
        status=excluded.status, defeito_tipo=excluded.defeito_tipo, defeito_obs=excluded.defeito_obs,
        conferente=excluded.conferente, conferido_em=CURRENT_TIMESTAMP`)
        .run(req.params.loteId, chapa_idx, peca_idx, peca_desc || '', status || 'ok', defeito_tipo || '', defeito_obs || '', conferente || '');
    // WebSocket broadcast (#23)
    const broadcast = req.app.locals.wsBroadcast;
    if (broadcast) broadcast('conferencia_update', { lote_id: Number(req.params.loteId), chapa_idx, peca_idx, status: status || 'ok' });
    res.json({ ok: true });
});

// POST conferir chapa inteira como OK
router.post('/conferencia/:loteId/chapa/:chapaIdx/ok', requireAuth, (req, res) => {
    const { pecas, conferente } = req.body; // pecas: [{peca_idx, peca_desc}]
    const stmt = db.prepare(`INSERT INTO cnc_conferencia (lote_id, chapa_idx, peca_idx, peca_desc, status, conferente, conferido_em)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(lote_id, chapa_idx, peca_idx) DO UPDATE SET status='ok', conferente=excluded.conferente, conferido_em=CURRENT_TIMESTAMP`);
    const tx = db.transaction(() => {
        for (const p of (pecas || [])) {
            stmt.run(req.params.loteId, req.params.chapaIdx, p.peca_idx, p.peca_desc || '', 'ok', conferente || '');
        }
    });
    tx();
    res.json({ ok: true });
});

// GET resumo conferência por lote
router.get('/conferencia/:loteId/resumo', requireAuth, (req, res) => {
    const total = db.prepare('SELECT COUNT(*) as n FROM cnc_conferencia WHERE lote_id = ?').get(req.params.loteId)?.n || 0;
    const ok = db.prepare("SELECT COUNT(*) as n FROM cnc_conferencia WHERE lote_id = ? AND status = 'ok'").get(req.params.loteId)?.n || 0;
    const defeito = db.prepare("SELECT COUNT(*) as n FROM cnc_conferencia WHERE lote_id = ? AND status = 'defeito'").get(req.params.loteId)?.n || 0;
    const pendente = db.prepare("SELECT COUNT(*) as n FROM cnc_conferencia WHERE lote_id = ? AND status = 'pendente'").get(req.params.loteId)?.n || 0;
    res.json({ total, ok, defeito, pendente });
});

// ═══════════════════════════════════════════════════════
// GRUPO 11: Fila de Produção
// ═══════════════════════════════════════════════════════

// GET fila de produção
router.get('/fila-producao', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT f.*, l.nome as lote_nome, l.cliente as lote_cliente, l.status as lote_status,
               l.prioridade as lote_prioridade, l.data_entrega as lote_data_entrega,
               l.observacoes as lote_observacoes,
               m.nome as maquina_nome
        FROM cnc_fila_producao f
        LEFT JOIN cnc_lotes l ON f.lote_id = l.id AND l.user_id = ?
        LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id
        WHERE l.user_id = ?
          AND (f.status != 'concluido' OR f.fim_em > datetime('now', '-24 hours'))
        ORDER BY
            COALESCE(l.prioridade, 0) DESC,
            f.prioridade DESC,
            CASE WHEN l.data_entrega IS NOT NULL AND l.data_entrega < date('now') THEN 0
                 WHEN l.data_entrega IS NOT NULL AND l.data_entrega <= date('now', '+3 days') THEN 1
                 ELSE 2 END ASC,
            f.ordem ASC, f.criado_em ASC
    `).all(req.user.id, req.user.id);
    res.json(rows);
});

// POST adicionar chapa à fila
router.post('/fila-producao', requireAuth, (req, res) => {
    const { lote_id, chapa_idx, prioridade, maquina_id } = req.body;
    // Verificar que o lote pertence ao usuário
    const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(lote_id, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const maxOrdem = db.prepare('SELECT MAX(ordem) as m FROM cnc_fila_producao').get()?.m || 0;
    db.prepare(`INSERT INTO cnc_fila_producao (lote_id, chapa_idx, prioridade, maquina_id, ordem)
        VALUES (?,?,?,?,?) ON CONFLICT(lote_id, chapa_idx) DO UPDATE SET
        prioridade=excluded.prioridade, maquina_id=excluded.maquina_id`)
        .run(lote_id, chapa_idx, prioridade || 0, maquina_id || null, maxOrdem + 1);
    res.json({ ok: true });
});

// PUT atualizar status na fila
router.put('/fila-producao/:id', requireAuth, (req, res) => {
    const { status, operador, prioridade, ordem } = req.body;
    const item = db.prepare('SELECT * FROM cnc_fila_producao WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (status === 'em_producao' && !item.inicio_em) {
        db.prepare('UPDATE cnc_fila_producao SET status=?, operador=?, inicio_em=CURRENT_TIMESTAMP WHERE id=?')
            .run(status, operador || '', req.params.id);
    } else if (status === 'concluido') {
        db.prepare('UPDATE cnc_fila_producao SET status=?, fim_em=CURRENT_TIMESTAMP WHERE id=?')
            .run(status, req.params.id);
        if (item.status !== 'concluido') {
            try {
                const doneItem = db.prepare('SELECT * FROM cnc_fila_producao WHERE id = ?').get(req.params.id);
                const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(item.lote_id, req.user.id);
                let pecasChapa = 0;
                if (lote?.plano_json) {
                    try {
                        const plano = JSON.parse(lote.plano_json || '{}');
                        pecasChapa = plano.chapas?.[item.chapa_idx]?.pecas?.length || 0;
                    } catch {}
                }
                if (!pecasChapa && lote?.total_chapas) {
                    pecasChapa = Math.round((lote.total_pecas || 0) / Math.max(1, lote.total_chapas || 1));
                }

                const inicio = item.inicio_em ? new Date(item.inicio_em) : null;
                const fim = doneItem?.fim_em ? new Date(doneItem.fim_em) : new Date();
                const tempoRealMin = inicio && !Number.isNaN(inicio.getTime())
                    ? Math.max(0.1, Math.round(((fim - inicio) / 60000) * 10) / 10)
                    : 0;
                const gh = db.prepare(`
                    SELECT tempo_estimado_min, trocas_ferramenta
                    FROM cnc_gcode_historico
                    WHERE lote_id = ? AND chapa_idx = ?
                    ORDER BY criado_em DESC LIMIT 1
                `).get(item.lote_id, item.chapa_idx);
                const defeitos = db.prepare(`
                    SELECT COUNT(*) as n FROM cnc_conferencia
                    WHERE lote_id = ? AND chapa_idx = ? AND status = 'defeito'
                `).get(item.lote_id, item.chapa_idx)?.n || 0;

                if (item.maquina_id && (tempoRealMin > 0 || gh?.tempo_estimado_min || pecasChapa > 0)) {
                    db.prepare(`
                        INSERT INTO cnc_maquina_performance
                            (maquina_id, lote_id, chapas_cortadas, pecas_cortadas, tempo_corte_min, tempo_ocioso_min, trocas_ferramenta, defeitos)
                        VALUES (?,?,?,?,?,?,?,?)
                    `).run(
                        item.maquina_id,
                        item.lote_id || null,
                        1,
                        pecasChapa || 0,
                        tempoRealMin || gh?.tempo_estimado_min || 0,
                        0,
                        gh?.trocas_ferramenta || 0,
                        defeitos
                    );
                }
            } catch (e) {
                console.warn('[Fila] Erro ao registrar performance de máquina:', e.message);
            }
        }
        // Auto-conclusão do lote: se todas as chapas na fila estão concluídas, atualizar o lote
        try {
            const loteId = item.lote_id;
            if (loteId) {
                const totalNaFila = db.prepare('SELECT COUNT(*) as n FROM cnc_fila_producao WHERE lote_id = ?').get(loteId)?.n || 0;
                const totalConcluidas = db.prepare('SELECT COUNT(*) as n FROM cnc_fila_producao WHERE lote_id = ? AND status = ?').get(loteId, 'concluido')?.n || 0;
                if (totalNaFila > 0 && totalConcluidas >= totalNaFila) {
                    db.prepare(`UPDATE cnc_lotes SET status = 'concluido', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(loteId);
                    console.log(`[Fila] Lote ${loteId} marcado como concluído automaticamente (${totalConcluidas}/${totalNaFila} chapas)`);
                    if (req.app.locals.wsBroadcast) {
                        req.app.locals.wsBroadcast('lote_concluido', { lote_id: loteId });
                    }
                }
            }
        } catch (e) {
            console.warn('[Fila] Erro ao verificar auto-conclusão do lote:', e.message);
        }
    } else {
        const sets = [];
        const vals = [];
        if (status !== undefined) { sets.push('status=?'); vals.push(status); }
        if (operador !== undefined) { sets.push('operador=?'); vals.push(operador); }
        if (prioridade !== undefined) { sets.push('prioridade=?'); vals.push(prioridade); }
        if (ordem !== undefined) { sets.push('ordem=?'); vals.push(ordem); }
        if (sets.length) {
            vals.push(req.params.id);
            db.prepare(`UPDATE cnc_fila_producao SET ${sets.join(',')} WHERE id=?`).run(...vals);
        }
    }
    // WebSocket broadcast (#23)
    const broadcast = req.app.locals.wsBroadcast;
    if (broadcast) broadcast('fila_update', { id: Number(req.params.id), status: status || item.status });
    res.json({ ok: true });
});

// DELETE remover da fila
router.delete('/fila-producao/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_fila_producao WHERE id = ?').run(req.params.id);
    const broadcast = req.app.locals.wsBroadcast;
    if (broadcast) broadcast('fila_remove', { id: Number(req.params.id) });
    res.json({ ok: true });
});

// POST adicionar todas chapas de um lote à fila
router.post('/fila-producao/lote/:loteId', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ?').get(req.params.loteId);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    let plano;
    try { plano = JSON.parse(lote.plano_json || '{}'); } catch { return res.status(400).json({ error: 'Plano inválido' }); }
    if (!plano.chapas?.length) return res.status(400).json({ error: 'Sem chapas no plano' });
    const maxOrdem = db.prepare('SELECT MAX(ordem) as m FROM cnc_fila_producao').get()?.m || 0;
    const stmt = db.prepare(`INSERT INTO cnc_fila_producao (lote_id, chapa_idx, prioridade, ordem)
        VALUES (?,?,?,?) ON CONFLICT(lote_id, chapa_idx) DO NOTHING`);
    const tx = db.transaction(() => {
        for (let i = 0; i < plano.chapas.length; i++) {
            stmt.run(req.params.loteId, i, req.body.prioridade || 0, maxOrdem + i + 1);
        }
    });
    tx();
    res.json({ ok: true, added: plano.chapas.length });
});

// ═══════════════════════════════════════════════════════
// GRUPO 12: Controle de Estoque de Chapas
// ═══════════════════════════════════════════════════════

// GET estoque de chapas
router.get('/estoque-chapas', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY nome').all();
    res.json(rows);
});

// PUT atualizar estoque de uma chapa
router.put('/estoque-chapas/:id', requireAuth, (req, res) => {
    const { estoque_qtd, estoque_minimo, custo_unitario } = req.body;
    const sets = [];
    const vals = [];
    if (estoque_qtd !== undefined) { sets.push('estoque_qtd=?'); vals.push(estoque_qtd); }
    if (estoque_minimo !== undefined) { sets.push('estoque_minimo=?'); vals.push(estoque_minimo); }
    if (custo_unitario !== undefined) { sets.push('custo_unitario=?'); vals.push(custo_unitario); }
    if (sets.length) {
        vals.push(req.params.id);
        db.prepare(`UPDATE cnc_chapas SET ${sets.join(',')} WHERE id=?`).run(...vals);
    }
    res.json({ ok: true });
});

// POST movimentação de estoque
router.post('/estoque-chapas/:id/movimentacao', requireAuth, (req, res) => {
    const { tipo, quantidade, lote_id, motivo } = req.body;
    if (!tipo || !quantidade) return res.status(400).json({ error: 'tipo e quantidade obrigatórios' });
    const chapa = db.prepare('SELECT * FROM cnc_chapas WHERE id = ?').get(req.params.id);
    if (!chapa) return res.status(404).json({ error: 'Chapa não encontrada' });
    const delta = tipo === 'entrada' ? Math.abs(quantidade) : -Math.abs(quantidade);
    db.prepare('INSERT INTO cnc_estoque_mov (chapa_id, tipo, quantidade, lote_id, motivo, user_id) VALUES (?,?,?,?,?,?)')
        .run(req.params.id, tipo, quantidade, lote_id || null, motivo || '', req.user.id);
    db.prepare('UPDATE cnc_chapas SET estoque_qtd = MAX(0, estoque_qtd + ?) WHERE id = ?').run(delta, req.params.id);
    res.json({ ok: true, novo_estoque: Math.max(0, (chapa.estoque_qtd || 0) + delta) });
});

// GET movimentações de estoque
router.get('/estoque-chapas/:id/movimentacoes', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM cnc_estoque_mov WHERE chapa_id = ? ORDER BY criado_em DESC LIMIT 50').all(req.params.id);
    res.json(rows);
});

// GET alertas de estoque baixo
router.get('/estoque-alertas', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 AND estoque_minimo > 0 AND estoque_qtd <= estoque_minimo ORDER BY nome').all();
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// GRUPO 13: Custeio Automático por Peça
// ═══════════════════════════════════════════════════════

// POST calcular custeio para um lote
router.post('/custeio/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT id, nome, plano_json FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        let plano;
        try { plano = JSON.parse(lote.plano_json || '{}'); } catch { return res.status(400).json({ error: 'Plano inválido' }); }
        if (!plano.chapas?.length) return res.status(400).json({ error: 'Sem chapas' });

        // Pré-carrega mapa de custo por material (uma query por material único, não por chapa)
        const materiaisUnicos = [...new Set(plano.chapas.map(c => c.material).filter(Boolean))];
        const custoM2Map = {};
        for (const mat of materiaisUnicos) {
            const chapaRef = db.prepare('SELECT custo_unitario, preco, comprimento, largura FROM cnc_chapas WHERE material_code = ? AND ativo = 1 LIMIT 1').get(mat);
            const custoChapa = chapaRef?.custo_unitario || chapaRef?.preco || 0;
            const areaChapa = (chapaRef?.comprimento || 2750) * (chapaRef?.largura || 1850) / 1e6;
            custoM2Map[mat] = areaChapa > 0 ? custoChapa / areaChapa : 0;
        }
        // fallback genérico (primeiro material ou zero)
        const custoM2Padrao = custoM2Map[materiaisUnicos[0]] || 0;
        const custoM2 = custoM2Padrao; // mantido para params de retorno

        // Custo máquina (R$/min) — configurável, default R$2/min
        const custoMaqMin = req.body.custo_maquina_min || 2.0;
        // Custo borda (R$/m) — default R$3/m
        const custoBordaM = req.body.custo_borda_m || 3.0;

        const pecasDb = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(req.params.loteId);
        const pecasMap = {};
        for (const p of pecasDb) pecasMap[p.id] = p;

        const resultados = [];
        const stmtIns = db.prepare(`INSERT INTO cnc_custeio_peca (lote_id, peca_id, peca_desc, custo_material, custo_maquina, custo_borda, custo_total, area_m2, tempo_min, calculado_em)
            VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`);

        // Limpar custeio anterior
        db.prepare('DELETE FROM cnc_custeio_peca WHERE lote_id = ?').run(req.params.loteId);

        for (const chapa of plano.chapas) {
            const custoM2Chapa = custoM2Map[chapa.material] ?? custoM2Padrao;
            for (const peca of (chapa.pecas || [])) {
                const dbp = pecasMap[peca.pecaId];
                const w = peca.w || 0, h = peca.h || 0;
                const areaM2 = (w * h) / 1e6;
                const custoMat = custoM2Chapa * areaM2;

                // Tempo máquina estimado: 3s base + 1s por usinagem
                let nOps = 0;
                if (dbp) {
                    try {
                        const mach = JSON.parse(dbp.machining_json || '{}');
                        for (const face of Object.values(mach)) { if (Array.isArray(face)) nOps += face.length; }
                    } catch (_) {}
                }
                const tempoMin = (3 + nOps) / 60;
                const custoMaq = custoMaqMin * tempoMin;

                // Borda: somar perímetros com borda aplicada (usando colunas reais da tabela)
                let perimBorda = 0;
                if (dbp) {
                    if (dbp.borda_frontal && dbp.borda_frontal !== 'nenhuma' && dbp.borda_frontal !== 'sem_borda') perimBorda += w;
                    if (dbp.borda_traseira && dbp.borda_traseira !== 'nenhuma' && dbp.borda_traseira !== 'sem_borda') perimBorda += w;
                    if (dbp.borda_dir && dbp.borda_dir !== 'nenhuma' && dbp.borda_dir !== 'sem_borda') perimBorda += h;
                    if (dbp.borda_esq && dbp.borda_esq !== 'nenhuma' && dbp.borda_esq !== 'sem_borda') perimBorda += h;
                }
                const custoBorda = (perimBorda / 1000) * custoBordaM;
                const custoTotal = custoMat + custoMaq + custoBorda;

                const r = {
                    peca_id: peca.pecaId,
                    peca_desc: peca.desc || dbp?.descricao || '',
                    custo_material: Math.round(custoMat * 100) / 100,
                    custo_maquina: Math.round(custoMaq * 100) / 100,
                    custo_borda: Math.round(custoBorda * 100) / 100,
                    custo_total: Math.round(custoTotal * 100) / 100,
                    area_m2: Math.round(areaM2 * 10000) / 10000,
                    tempo_min: Math.round(tempoMin * 100) / 100,
                };
                resultados.push(r);
                stmtIns.run(req.params.loteId, r.peca_id, r.peca_desc, r.custo_material, r.custo_maquina, r.custo_borda, r.custo_total, r.area_m2, r.tempo_min);
            }
        }

        const totalMat = resultados.reduce((s, r) => s + r.custo_material, 0);
        const totalMaq = resultados.reduce((s, r) => s + r.custo_maquina, 0);
        const totalBorda = resultados.reduce((s, r) => s + r.custo_borda, 0);
        const totalGeral = resultados.reduce((s, r) => s + r.custo_total, 0);

        res.json({
            ok: true,
            pecas: resultados,
            totais: {
                material: Math.round(totalMat * 100) / 100,
                maquina: Math.round(totalMaq * 100) / 100,
                borda: Math.round(totalBorda * 100) / 100,
                total: Math.round(totalGeral * 100) / 100,
            },
            params: { custo_m2: Math.round(custoM2 * 100) / 100, custo_maquina_min: custoMaqMin, custo_borda_m: custoBordaM },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET custeio salvo
router.get('/custeio/:loteId', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const rows = db.prepare('SELECT * FROM cnc_custeio_peca WHERE lote_id = ? ORDER BY peca_desc').all(lote.id);
    const totalMat = rows.reduce((s, r) => s + r.custo_material, 0);
    const totalMaq = rows.reduce((s, r) => s + r.custo_maquina, 0);
    const totalBorda = rows.reduce((s, r) => s + r.custo_borda, 0);
    const totalGeral = rows.reduce((s, r) => s + r.custo_total, 0);
    res.json({
        pecas: rows,
        totais: {
            material: Math.round(totalMat * 100) / 100,
            maquina: Math.round(totalMaq * 100) / 100,
            borda: Math.round(totalBorda * 100) / 100,
            total: Math.round(totalGeral * 100) / 100,
        },
    });
});

// ═══════════════════════════════════════════════════════
// GRUPO 14: Comparação de Versões do Plano
// ═══════════════════════════════════════════════════════

// GET versões de um lote (usa gcode_historico + plano versionado)
router.get('/versoes/:loteId', requireAuth, (req, res) => {
    // Histórico de otimizações
    const historico = db.prepare(`SELECT id, criado_em, total_operacoes, tempo_estimado_min, dist_corte_m, filename
        FROM cnc_gcode_historico WHERE lote_id = ? ORDER BY criado_em DESC LIMIT 20`).all(req.params.loteId);
    // Lote atual
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ?').get(req.params.loteId);
    let plano = {};
    try { plano = JSON.parse(lote?.plano_json || '{}'); } catch {}
    const resumoAtual = {
        chapas: plano.chapas?.length || 0,
        pecas: plano.chapas?.reduce((s, c) => s + (c.pecas?.length || 0), 0) || 0,
        aproveitamento: plano.chapas?.length ? Math.round(plano.chapas.reduce((s, c) => s + (c.utilizacao || 0), 0) / plano.chapas.length * 10) / 10 : 0,
        sobras: plano.chapas?.reduce((s, c) => s + (c.retalhos?.length || 0), 0) || 0,
    };
    res.json({ historico, resumoAtual });
});

// ═══════════════════════════════════════════════════════
// GRUPO 15: G-Code Batch — gerar todas chapas de uma vez
// ═══════════════════════════════════════════════════════

router.post('/gcode-batch/:loteId', requireAuth, async (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
        if (!ctx.plano?.chapas?.length) return res.status(400).json({ error: 'Sem chapas no plano' });

        const results = [];
        const errors = [];

        for (let chapaIdx = 0; chapaIdx < ctx.plano.chapas.length; chapaIdx++) {
            try {
                const chapa = ctx.plano.chapas[chapaIdx];
                const { maquina, toolMap, extensao } = resolveGcodeMachineForChapa(ctx, chapaIdx);

                const result = generateGcodeForChapa(chapa, chapaIdx, ctx.pecasDb, maquina, toolMap, ctx.usinagemTipos, ctx.cfg, ctx.opOverrides || {}, ctx.opOverridesPeca || {}, ctx.usinagemCatalogMap || {});

                if (result.ferramentas_faltando?.length > 0) {
                    errors.push({ chapaIdx, error: `Ferramentas faltando: ${result.ferramentas_faltando.join(', ')}` });
                    continue;
                }

                if (result.tool_wear) updateToolWear(toolMap, result.tool_wear, ctx.lote.id, req.user?.id);

                const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(chapaIdx + 1).padStart(2, '0')}`;
                const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + extensao;

                results.push({ chapaIdx, gcode: result.gcode, filename, stats: result.stats, alertas: result.alertas || [], maquina: result.maquina || { id: maquina.id, nome: maquina.nome } });
            } catch (err) {
                errors.push({ chapaIdx, error: err.message });
            }
        }

        res.json({
            ok: true,
            total: ctx.plano.chapas.length,
            gerados: results.length,
            erros: errors.length,
            results,
            errors,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 16: Exportação SVG do plano de corte
// ═══════════════════════════════════════════════════════

router.get('/export/:loteId/svg/:chapaIdx', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        let plano;
        try { plano = JSON.parse(lote.plano_json || '{}'); } catch { return res.status(400).json({ error: 'Plano inválido' }); }
        const chapaIdx = parseInt(req.params.chapaIdx);
        if (isNaN(chapaIdx) || !plano.chapas?.[chapaIdx]) return res.status(400).json({ error: 'Chapa não encontrada' });

        const chapa = plano.chapas[chapaIdx];
        const ref = chapa.refilo || 0;
        const W = chapa.comprimento, H = chapa.largura;

        let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">\n`;
        svg += `  <rect x="0" y="0" width="${W}" height="${H}" fill="#f5f0e8" stroke="#333" stroke-width="2"/>\n`;

        // Refilo
        if (ref > 0) {
            svg += `  <rect x="${ref}" y="${ref}" width="${W - 2 * ref}" height="${H - 2 * ref}" fill="none" stroke="#c44" stroke-width="0.5" stroke-dasharray="4,2"/>\n`;
        }

        // Peças
        for (const p of chapa.pecas) {
            const px = p.x + ref, py = p.y + ref;
            if (p.contour && p.contour.length >= 3) {
                const pts = p.contour.map(v => `${px + (v.x / p.w) * p.w},${py + (v.y / p.h) * p.h}`).join(' ');
                svg += `  <polygon points="${pts}" fill="#d4e6f1" stroke="#2980b9" stroke-width="1"/>\n`;
            } else {
                svg += `  <rect x="${px}" y="${py}" width="${p.w}" height="${p.h}" fill="#d4e6f1" stroke="#2980b9" stroke-width="1"/>\n`;
            }
            // Label
            const fontSize = Math.min(p.w, p.h) > 100 ? 10 : 6;
            svg += `  <text x="${px + p.w / 2}" y="${py + p.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-family="Arial" fill="#333">${(p.desc || '').slice(0, 20)}</text>\n`;
            svg += `  <text x="${px + p.w / 2}" y="${py + p.h / 2 + fontSize + 2}" text-anchor="middle" font-size="${Math.max(5, fontSize - 2)}" font-family="monospace" fill="#666">${p.w}×${p.h}</text>\n`;
        }

        // Retalhos
        for (const r of (chapa.retalhos || [])) {
            svg += `  <rect x="${r.x + ref}" y="${r.y + ref}" width="${r.w}" height="${r.h}" fill="#e8f5e9" stroke="#4caf50" stroke-width="0.5" stroke-dasharray="3,2"/>\n`;
        }

        svg += `</svg>`;

        res.set('Content-Type', 'image/svg+xml');
        res.set('Content-Disposition', `attachment; filename="chapa_${chapaIdx + 1}.svg"`);
        res.send(svg);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══ Exportação PDF do plano (HTML para impressão) ═══
router.get('/export/:loteId/pdf-plano', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        let plano;
        try { plano = JSON.parse(lote.plano_json || '{}'); } catch { return res.status(400).json({ error: 'Plano inválido' }); }
        if (!plano.chapas?.length) return res.status(400).json({ error: 'Sem chapas' });

        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        const pecasMap = {};
        for (const p of pecas) pecasMap[p.id] = p;

        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Plano de Corte — ${lote.nome}</title>
        <style>
            * { box-sizing: border-box; margin: 0; }
            body { font-family: Arial, sans-serif; font-size: 11px; }
            .page { page-break-after: always; padding: 10mm; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
            .header h1 { font-size: 16px; }
            .header .meta { font-size: 10px; color: #666; text-align: right; }
            .chapa-svg { border: 1px solid #ccc; margin: 8px 0; display: block; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
            th, td { border: 1px solid #ddd; padding: 3px 6px; text-align: left; }
            th { background: #f5f5f5; font-weight: 700; }
            .stats { display: flex; gap: 16px; margin: 8px 0; font-size: 10px; }
            .stats span { padding: 4px 8px; background: #f5f5f5; border-radius: 4px; }
            @media print { .no-print { display: none; } .page { padding: 5mm; } }
        </style></head><body>
        <div class="no-print" style="padding:10px;background:#eee">
            <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#1379F0;color:#fff;border:none;border-radius:6px">Imprimir / Salvar PDF</button>
            <span style="margin-left:12px;font-size:12px;color:#666">${plano.chapas.length} chapas · ${lote.nome}</span>
        </div>`;

        for (let ci = 0; ci < plano.chapas.length; ci++) {
            const ch = plano.chapas[ci];
            const ref = ch.refilo || 0;
            const W = ch.comprimento, H = ch.largura;
            const scale = Math.min(700 / W, 400 / H);
            const svgW = W * scale, svgH = H * scale;

            html += `<div class="page">
                <div class="header">
                    <h1>Chapa ${ci + 1} / ${plano.chapas.length}</h1>
                    <div class="meta">
                        <div><b>${lote.nome}</b> · ${lote.cliente || ''}</div>
                        <div>${ch.material || ch.material_code || ''} · ${W}×${H}mm</div>
                        <div>Aproveitamento: <b>${(ch.aproveitamento || 0).toFixed(1)}%</b></div>
                    </div>
                </div>
                <div class="stats">
                    <span>Peças: <b>${ch.pecas.length}</b></span>
                    <span>Material: <b>${ch.material_code || ch.material || '-'}</b></span>
                    <span>Sobras: <b>${(ch.retalhos || []).length}</b></span>
                </div>
                <svg class="chapa-svg" width="${svgW + 4}" height="${svgH + 4}" viewBox="-2 -2 ${W + 4} ${H + 4}">
                    <rect x="0" y="0" width="${W}" height="${H}" fill="#fafaf5" stroke="#333" stroke-width="2"/>`;
            if (ref > 0) html += `<rect x="${ref}" y="${ref}" width="${W - 2 * ref}" height="${H - 2 * ref}" fill="none" stroke="#c44" stroke-width="0.5" stroke-dasharray="4,2"/>`;

            for (const p of ch.pecas) {
                const px = p.x + ref, py = p.y + ref;
                html += `<rect x="${px}" y="${py}" width="${p.w}" height="${p.h}" fill="#d4e6f1" stroke="#2980b9" stroke-width="1"/>`;
                if (Math.min(p.w, p.h) > 60) {
                    html += `<text x="${px + p.w / 2}" y="${py + p.h / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(12, p.w / 8)}" font-family="Arial" fill="#333">${(p.desc || '').slice(0, 18)}</text>`;
                }
            }
            for (const r of (ch.retalhos || [])) {
                html += `<rect x="${r.x + ref}" y="${r.y + ref}" width="${r.w}" height="${r.h}" fill="#e8f5e9" stroke="#4caf50" stroke-width="0.5" stroke-dasharray="3,2"/>`;
            }
            html += `</svg>
                <table>
                    <thead><tr><th>#</th><th>Descrição</th><th>Dimensões</th><th>Material</th><th>Módulo</th><th>Pos. X,Y</th></tr></thead>
                    <tbody>`;
            ch.pecas.forEach((p, pi) => {
                const dbp = pecasMap[p.pecaId];
                html += `<tr><td>${pi + 1}</td><td>${p.desc || dbp?.descricao || '-'}</td><td>${p.w}×${p.h}mm</td><td>${p.material || ''}</td><td>${dbp?.modulo_desc || ''}</td><td>${Math.round(p.x)}, ${Math.round(p.y)}</td></tr>`;
            });
            html += `</tbody></table></div>`;
        }

        html += `</body></html>`;
        res.set('Content-Type', 'text/html');
        res.send(html);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// GRUPO 17: Predição de troca de ferramenta
// ═══════════════════════════════════════════════════════

router.get('/ferramentas/:id/predicao', requireAuth, (req, res) => {
    const tool = db.prepare('SELECT * FROM cnc_ferramentas WHERE id = ?').get(req.params.id);
    if (!tool) return res.status(404).json({ error: 'Ferramenta não encontrada' });

    const wearLogs = db.prepare('SELECT * FROM cnc_tool_wear_log WHERE ferramenta_id = ? ORDER BY criado_em DESC LIMIT 50').all(tool.id);
    const totalMetros = tool.metros_acumulados || 0;
    const vidaMaxMetros = (tool.ciclo_vida_horas || 100) * 60 * (tool.velocidade_corte || 4) / 1000; // horas * 60min * vel(m/min) / 1000
    const vidaRestantePct = vidaMaxMetros > 0 ? Math.max(0, 100 - (totalMetros / vidaMaxMetros * 100)) : 100;

    // Calcular taxa de desgaste recente (últimos 10 registros)
    const recentLogs = wearLogs.slice(0, 10);
    let taxaMetrosPorDia = 0;
    if (recentLogs.length >= 2) {
        const first = new Date(recentLogs[recentLogs.length - 1].criado_em);
        const last = new Date(recentLogs[0].criado_em);
        const dias = Math.max(1, (last - first) / (1000 * 60 * 60 * 24));
        const metrosRecentes = recentLogs.reduce((s, l) => s + (l.metros_lineares || 0), 0);
        taxaMetrosPorDia = metrosRecentes / dias;
    }

    const metrosRestantes = Math.max(0, vidaMaxMetros - totalMetros);
    const diasRestantes = taxaMetrosPorDia > 0 ? Math.round(metrosRestantes / taxaMetrosPorDia) : null;
    const dataEstimadaTroca = diasRestantes ? new Date(Date.now() + diasRestantes * 24 * 60 * 60 * 1000).toISOString() : null;

    // Alerta
    let alerta = 'ok';
    if (vidaRestantePct < 10) alerta = 'critico';
    else if (vidaRestantePct < 25) alerta = 'atencao';
    else if (vidaRestantePct < 50) alerta = 'medio';

    res.json({
        ferramenta: { id: tool.id, nome: tool.nome, codigo: tool.tool_code },
        metros_acumulados: Math.round(totalMetros * 100) / 100,
        vida_max_metros: Math.round(vidaMaxMetros),
        vida_restante_pct: Math.round(vidaRestantePct * 10) / 10,
        taxa_metros_dia: Math.round(taxaMetrosPorDia * 100) / 100,
        dias_restantes: diasRestantes,
        data_estimada_troca: dataEstimadaTroca,
        alerta,
        historico_recente: recentLogs.slice(0, 5).map(l => ({
            metros: l.metros_lineares, operacoes: l.num_operacoes, data: l.criado_em,
        })),
    });
});

// GET predição de todas ferramentas de uma máquina
router.get('/ferramentas/predicao-all/:maquinaId', requireAuth, (req, res) => {
    const tools = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').all(req.params.maquinaId);
    const results = tools.map(tool => {
        const totalMetros = tool.metros_acumulados || 0;
        const vidaMaxMetros = (tool.ciclo_vida_horas || 100) * 60 * (tool.velocidade_corte || 4) / 1000;
        const vidaRestantePct = vidaMaxMetros > 0 ? Math.max(0, 100 - (totalMetros / vidaMaxMetros * 100)) : 100;
        let alerta = 'ok';
        if (vidaRestantePct < 10) alerta = 'critico';
        else if (vidaRestantePct < 25) alerta = 'atencao';
        else if (vidaRestantePct < 50) alerta = 'medio';
        return {
            id: tool.id, nome: tool.nome, tool_code: tool.tool_code,
            metros_acumulados: Math.round(totalMetros * 100) / 100,
            vida_restante_pct: Math.round(vidaRestantePct * 10) / 10,
            alerta,
        };
    });
    res.json(results);
});

// ═══════════════════════════════════════════════════════
// GRUPO 18: Manutenção programada de ferramentas
// ═══════════════════════════════════════════════════════

router.get('/tool-manutencao', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT m.*, f.nome as ferramenta_nome, f.tool_code
        FROM cnc_tool_manutencao m
        LEFT JOIN cnc_ferramentas f ON m.ferramenta_id = f.id
        WHERE m.status != 'concluido' OR m.concluido_em > datetime('now', '-7 days')
        ORDER BY m.agendado_para ASC
    `).all();
    res.json(rows);
});

router.post('/tool-manutencao', requireAuth, (req, res) => {
    const { ferramenta_id, tipo, descricao, agendado_para } = req.body;
    db.prepare('INSERT INTO cnc_tool_manutencao (ferramenta_id, tipo, descricao, agendado_para, user_id) VALUES (?,?,?,?,?)')
        .run(ferramenta_id, tipo || 'afiacao', descricao || '', agendado_para || null, req.user.id);
    res.json({ ok: true });
});

router.put('/tool-manutencao/:id', requireAuth, (req, res) => {
    const { status, notas } = req.body;
    if (status === 'concluido') {
        db.prepare('UPDATE cnc_tool_manutencao SET status=?, notas=?, concluido_em=CURRENT_TIMESTAMP WHERE id=?')
            .run(status, notas || '', req.params.id);
        // Reset desgaste da ferramenta se for troca/afiação
        const man = db.prepare('SELECT * FROM cnc_tool_manutencao WHERE id = ?').get(req.params.id);
        if (man && (man.tipo === 'troca' || man.tipo === 'afiacao')) {
            db.prepare('UPDATE cnc_ferramentas SET metros_acumulados = 0, horas_uso = 0 WHERE id = ?').run(man.ferramenta_id);
        }
    } else {
        db.prepare('UPDATE cnc_tool_manutencao SET status=?, notas=? WHERE id=?').run(status || 'agendado', notas || '', req.params.id);
    }
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 19: Auditoria de consumo de material
// ═══════════════════════════════════════════════════════

router.post('/material-consumo/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ?').get(req.params.loteId);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        let plano;
        try { plano = JSON.parse(lote.plano_json || '{}'); } catch { return res.status(400).json({ error: 'Plano inválido' }); }

        db.prepare('DELETE FROM cnc_material_consumo WHERE lote_id = ?').run(lote.id);

        const registros = [];
        for (let ci = 0; ci < (plano.chapas || []).length; ci++) {
            const ch = plano.chapas[ci];
            const ref = ch.refilo || 0;
            const areaTotal = (ch.comprimento * ch.largura) / 1e6; // m²
            const areaUsada = ch.pecas.reduce((s, p) => s + (p.w * p.h), 0) / 1e6;
            const areaSobra = (ch.retalhos || []).reduce((s, r) => s + (r.w * r.h), 0) / 1e6;
            const areaRefugo = areaTotal - areaUsada - areaSobra;
            const aprov = areaTotal > 0 ? (areaUsada / areaTotal * 100) : 0;

            const chapaRef = ch.material_code ? db.prepare('SELECT id FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(ch.material_code) : null;

            db.prepare('INSERT INTO cnc_material_consumo (chapa_id, lote_id, chapa_idx, material_code, area_total_m2, area_usada_m2, area_sobra_m2, area_refugo_m2, aproveitamento, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
                .run(chapaRef?.id || null, lote.id, ci, ch.material_code || '', Math.round(areaTotal * 1e4) / 1e4, Math.round(areaUsada * 1e4) / 1e4, Math.round(areaSobra * 1e4) / 1e4, Math.round(areaRefugo * 1e4) / 1e4, Math.round(aprov * 10) / 10, req.user.id);

            registros.push({ chapa_idx: ci, material_code: ch.material_code, area_total_m2: areaTotal, area_usada_m2: areaUsada, aproveitamento: aprov });

            // Auto-debitar estoque
            if (chapaRef?.id) {
                db.prepare('UPDATE cnc_chapas SET estoque_qtd = MAX(0, estoque_qtd - 1) WHERE id = ?').run(chapaRef.id);
            }
        }

        res.json({ ok: true, registros });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/material-consumo/:loteId', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM cnc_material_consumo WHERE lote_id = ? ORDER BY chapa_idx').all(req.params.loteId);
    res.json(rows);
});

router.get('/material-consumo-historico', requireAuth, (req, res) => {
    const days = parseInt(req.query.days) || 30;
    const rows = db.prepare(`
        SELECT material_code, date(criado_em) as data,
            SUM(area_total_m2) as total_m2, SUM(area_usada_m2) as usada_m2,
            SUM(area_refugo_m2) as refugo_m2, AVG(aproveitamento) as aprov_medio,
            COUNT(*) as chapas
        FROM cnc_material_consumo
        WHERE criado_em > datetime('now', '-' || ? || ' days')
        GROUP BY material_code, date(criado_em)
        ORDER BY data DESC
    `).all(days);
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// GRUPO 20: Reserva de material no estoque
// ═══════════════════════════════════════════════════════

router.post('/reservar-material/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ?').get(req.params.loteId);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        let plano;
        try { plano = JSON.parse(lote.plano_json || '{}'); } catch { return res.status(400).json({ error: 'Plano inválido' }); }

        // Agrupar chapas por material
        const materialCount = {};
        for (const ch of (plano.chapas || [])) {
            const mc = ch.material_code || 'default';
            materialCount[mc] = (materialCount[mc] || 0) + 1;
        }

        const reservas = [];
        const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

        for (const [mc, qtd] of Object.entries(materialCount)) {
            const chapa = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(mc);
            if (!chapa) continue;

            // Verificar estoque disponível (descontando reservas existentes)
            const reservado = db.prepare("SELECT COALESCE(SUM(quantidade),0) as total FROM cnc_reserva_material WHERE chapa_id = ? AND status = 'reservado' AND expira_em > datetime('now')").get(chapa.id)?.total || 0;
            const disponivel = (chapa.estoque_qtd || 0) - reservado;

            if (disponivel < qtd) {
                reservas.push({ material: mc, necessario: qtd, disponivel, reservado: 0, alerta: `Estoque insuficiente: precisa ${qtd}, disponível ${disponivel}` });
                continue;
            }

            db.prepare(`INSERT INTO cnc_reserva_material (chapa_id, lote_id, quantidade, expira_em, user_id) VALUES (?,?,?,?,?)
                ON CONFLICT(chapa_id, lote_id) DO UPDATE SET quantidade=?, expira_em=?, status='reservado'`)
                .run(chapa.id, lote.id, qtd, expiraEm, req.user.id, qtd, expiraEm);

            reservas.push({ material: mc, necessario: qtd, disponivel, reservado: qtd });
        }

        res.json({ ok: true, reservas, expira_em: expiraEm });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/reservar-material/:loteId', requireAuth, (req, res) => {
    db.prepare("UPDATE cnc_reserva_material SET status = 'liberado' WHERE lote_id = ?").run(req.params.loteId);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 21: Backup automático
// ═══════════════════════════════════════════════════════

router.post('/backup', requireAuth, async (req, res) => {
    try {
        const { statSync } = await import('fs');
        const backupDir = join(__cncDirname, '..', 'backups');
        if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = join(backupDir, `ornato_cnc_${ts}.db`);

        await db.backup(backupFile);
        const stats = statSync(backupFile);
        db.prepare('INSERT INTO cnc_backups (tipo, arquivo, tamanho_bytes, user_id) VALUES (?,?,?,?)')
            .run(req.body.tipo || 'manual', backupFile, stats.size, req.user.id);
        res.json({ ok: true, arquivo: backupFile, tamanho: stats.size });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/backups', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM cnc_backups ORDER BY criado_em DESC LIMIT 20').all();
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// GRUPO 22: Performance de máquina
// ═══════════════════════════════════════════════════════

router.post('/maquina-performance', requireAuth, (req, res) => {
    const { maquina_id, lote_id, chapas_cortadas, pecas_cortadas, tempo_corte_min, tempo_ocioso_min, trocas_ferramenta, defeitos } = req.body;
    db.prepare(`INSERT INTO cnc_maquina_performance (maquina_id, lote_id, chapas_cortadas, pecas_cortadas, tempo_corte_min, tempo_ocioso_min, trocas_ferramenta, defeitos)
        VALUES (?,?,?,?,?,?,?,?)`).run(maquina_id, lote_id || null, chapas_cortadas || 0, pecas_cortadas || 0, tempo_corte_min || 0, tempo_ocioso_min || 0, trocas_ferramenta || 0, defeitos || 0);
    res.json({ ok: true });
});

router.get('/maquina-performance', requireAuth, (req, res) => {
    try {
        const logs = db.prepare(`
            SELECT mp.*, m.nome as maquina_nome, l.nome as lote_nome
            FROM cnc_maquina_performance mp
            LEFT JOIN cnc_maquinas m ON m.id = mp.maquina_id
            LEFT JOIN cnc_lotes l ON l.id = mp.lote_id
            WHERE l.user_id = ? OR l.user_id IS NULL
            ORDER BY mp.criado_em DESC LIMIT 100
        `).all(req.user.id);

        const totalChapas = logs.reduce((s, l) => s + Number(l.chapas_cortadas || 0), 0);
        const totalPecas = logs.reduce((s, l) => s + Number(l.pecas_cortadas || 0), 0);
        const totalTempo = logs.reduce((s, l) => s + Number(l.tempo_corte_min || 0), 0);
        const loteIds = [...new Set(logs.map(l => l.lote_id).filter(Boolean))];
        const lotesComAprov = db.prepare(`
            SELECT AVG(aproveitamento) as avg_aproveitamento
            FROM cnc_lotes
            WHERE user_id = ? AND aproveitamento > 0
              AND id IN (${loteIds.length ? loteIds.map(() => '?').join(',') : 'NULL'})
        `).get(req.user.id, ...loteIds);

        res.json({
            avg_tempo_min: totalChapas > 0 ? Math.round((totalTempo / totalChapas) * 10) / 10 : 0,
            pecas_hora: totalTempo > 0 ? Math.round((totalPecas / (totalTempo / 60)) * 10) / 10 : 0,
            avg_aproveitamento: Math.round(Number(lotesComAprov?.avg_aproveitamento || 0) * 10) / 10,
            logs: logs.map(l => ({
                ...l,
                tempo_min: l.tempo_corte_min,
                created_at: l.criado_em,
            })),
        });
    } catch (err) {
        console.error('maquina-performance error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/maquina-performance/:maquinaId', requireAuth, (req, res) => {
    const days = parseInt(req.query.days) || 30;
    const rows = db.prepare(`
        SELECT data_registro, SUM(chapas_cortadas) as chapas, SUM(pecas_cortadas) as pecas,
            SUM(tempo_corte_min) as tempo_corte, SUM(tempo_ocioso_min) as tempo_ocioso,
            SUM(trocas_ferramenta) as trocas, SUM(defeitos) as defeitos
        FROM cnc_maquina_performance
        WHERE maquina_id = ? AND data_registro > date('now', '-' || ? || ' days')
        GROUP BY data_registro ORDER BY data_registro DESC
    `).all(req.params.maquinaId, days);

    // Totais
    const totais = {
        chapas: rows.reduce((s, r) => s + r.chapas, 0),
        pecas: rows.reduce((s, r) => s + r.pecas, 0),
        tempo_corte: Math.round(rows.reduce((s, r) => s + r.tempo_corte, 0) * 10) / 10,
        tempo_ocioso: Math.round(rows.reduce((s, r) => s + r.tempo_ocioso, 0) * 10) / 10,
        trocas: rows.reduce((s, r) => s + r.trocas, 0),
        defeitos: rows.reduce((s, r) => s + r.defeitos, 0),
    };
    totais.eficiencia = (totais.tempo_corte + totais.tempo_ocioso) > 0
        ? Math.round(totais.tempo_corte / (totais.tempo_corte + totais.tempo_ocioso) * 1000) / 10 : 0;
    totais.pecas_por_hora = totais.tempo_corte > 0 ? Math.round(totais.pecas / (totais.tempo_corte / 60) * 10) / 10 : 0;

    res.json({ diario: rows, totais });
});

// ═══════════════════════════════════════════════════════
// GRUPO 23: Integração com Financeiro
// ═══════════════════════════════════════════════════════

router.get('/integracao-financeiro/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ?').get(req.params.loteId);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        // Custeio
        const custeio = db.prepare('SELECT * FROM cnc_custeio_peca WHERE lote_id = ?').all(lote.id);
        const custoMaterial = custeio.reduce((s, c) => s + c.custo_material, 0);
        const custoMaquina = custeio.reduce((s, c) => s + c.custo_maquina, 0);
        const custoBorda = custeio.reduce((s, c) => s + c.custo_borda, 0);

        // Consumo material
        const consumo = db.prepare('SELECT SUM(area_total_m2) as total, SUM(area_usada_m2) as usada, SUM(area_refugo_m2) as refugo FROM cnc_material_consumo WHERE lote_id = ?').get(lote.id);

        // Performance
        const perf = db.prepare('SELECT SUM(tempo_corte_min) as tempo_corte, SUM(trocas_ferramenta) as trocas FROM cnc_maquina_performance WHERE lote_id = ?').get(lote.id);

        res.json({
            lote: { id: lote.id, nome: lote.nome, cliente: lote.cliente, status: lote.status },
            custos: {
                material: Math.round(custoMaterial * 100) / 100,
                maquina: Math.round(custoMaquina * 100) / 100,
                borda: Math.round(custoBorda * 100) / 100,
                total: Math.round((custoMaterial + custoMaquina + custoBorda) * 100) / 100,
            },
            consumo: {
                area_total_m2: consumo?.total || 0,
                area_usada_m2: consumo?.usada || 0,
                area_refugo_m2: consumo?.refugo || 0,
                desperdicio_pct: consumo?.total ? Math.round((consumo.refugo || 0) / consumo.total * 1000) / 10 : 0,
            },
            producao: {
                tempo_corte_min: perf?.tempo_corte || 0,
                trocas_ferramenta: perf?.trocas || 0,
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// GRUPO 24: Preview etiquetas PDF
// ═══════════════════════════════════════════════════════

router.get('/etiquetas/:loteId/preview-pdf', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(lote.id);
        let plano = null;
        try { plano = JSON.parse(lote.plano_json || 'null'); } catch {}

        const limit = parseInt(req.query.limit) || 10;
        const previewPecas = pecas.slice(0, limit);

        const labels = previewPecas.map((p, idx) => {
            let chapaInfo = null;
            if (plano?.chapas) {
                for (let ci = 0; ci < plano.chapas.length; ci++) {
                    if (plano.chapas[ci].pecas.some(pp => pp.pecaId === p.id)) {
                        chapaInfo = { idx: ci + 1 };
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
                descricao: p.descricao, dimensoes: `${p.comprimento}×${p.largura}×${p.espessura}`,
                material: p.material || '', modulo: p.modulo_desc || '', bordas: bordas.join(' '),
                chapa: chapaInfo?.idx || '-', cliente: lote.cliente || '',
                codigo: p.persistent_id || p.upmcode || `P${p.id}`,
            };
        });

        res.json({ labels, total: pecas.length, preview_count: labels.length, lote: { nome: lote.nome, cliente: lote.cliente } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════
// GRUPO 25: Improvements #36-#42
// ═══════════════════════════════════════════════════════

// #36 — Optimization Comparison
router.post('/plano/:loteId/comparar', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote || !lote.plano_json) return res.status(400).json({ error: 'Sem plano' });
    const plano = JSON.parse(lote.plano_json);
    const chapas = plano.chapas || [];
    const stats = {
        total_chapas: chapas.length,
        total_pecas: chapas.reduce((s, c) => s + (c.pecas?.length || 0), 0),
        aproveitamento_medio: chapas.length > 0 ? chapas.reduce((s, c) => s + (c.aproveitamento || 0), 0) / chapas.length : 0,
        area_total_m2: chapas.reduce((s, c) => s + ((c.w || 0) * (c.h || 0)) / 1e6, 0),
        area_usada_m2: chapas.reduce((s, c) => s + (c.pecas || []).reduce((ps, p) => ps + (p.w * p.h) / 1e6, 0), 0),
        sobras: chapas.flatMap((c, ci) => (c.sobras || []).map(s => ({ chapa: ci, w: s.w, h: s.h }))),
        por_chapa: chapas.map((c, i) => ({
            idx: i, material: c.material, w: c.w, h: c.h,
            pecas: c.pecas?.length || 0,
            aproveitamento: c.aproveitamento || 0,
        })),
    };
    res.json(stats);
});

// #38 — Photo Upload for pieces (via QR scan)
router.post('/pecas/:pecaId/foto', requireAuth, (req, res) => {
    const { foto_base64, tipo } = req.body; // tipo: 'cortada', 'conferida', 'montada'
    if (!foto_base64) return res.status(400).json({ error: 'foto_base64 obrigatório' });
    const peca = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(req.params.pecaId);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    // Store in fotos_json column (array of {tipo, data, timestamp})
    let fotos = [];
    try { fotos = JSON.parse(peca.fotos_json || '[]'); } catch {}
    fotos.push({ tipo: tipo || 'geral', data: foto_base64.substring(0, 200000), timestamp: new Date().toISOString() });
    db.prepare('UPDATE cnc_pecas SET fotos_json = ? WHERE id = ?').run(JSON.stringify(fotos), req.params.pecaId);
    res.json({ ok: true, total_fotos: fotos.length });
});

router.get('/pecas/:pecaId/fotos', requireAuth, (req, res) => {
    const peca = db.prepare('SELECT fotos_json FROM cnc_pecas WHERE id = ?').get(req.params.pecaId);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    res.json(JSON.parse(peca.fotos_json || '[]'));
});

// #39 — Waste Dashboard (historical)
router.get('/dashboard/desperdicio', requireAuth, (req, res) => {
    const { meses } = req.query; // default 6
    const months = Number(meses) || 6;
    const lotes = db.prepare(`
        SELECT l.*, l.plano_json FROM cnc_lotes l
        WHERE l.user_id = ? AND l.plano_json IS NOT NULL
        AND l.criado_em > datetime('now', '-' || ? || ' months')
        ORDER BY l.criado_em DESC
    `).all(req.user.id, months);

    const byMonth = {};
    const byMaterial = {};

    for (const lote of lotes) {
        try {
            const plano = JSON.parse(lote.plano_json);
            const month = lote.criado_em?.substring(0, 7) || 'unknown';
            if (!byMonth[month]) byMonth[month] = { area_total: 0, area_usada: 0, chapas: 0, pecas: 0 };

            for (const ch of (plano.chapas || [])) {
                const areaChapa = (ch.w || 0) * (ch.h || 0) / 1e6;
                const areaUsada = (ch.pecas || []).reduce((s, p) => s + (p.w * p.h) / 1e6, 0);
                const mat = ch.material || 'Desconhecido';

                byMonth[month].area_total += areaChapa;
                byMonth[month].area_usada += areaUsada;
                byMonth[month].chapas++;
                byMonth[month].pecas += ch.pecas?.length || 0;

                if (!byMaterial[mat]) byMaterial[mat] = { area_total: 0, area_usada: 0, chapas: 0 };
                byMaterial[mat].area_total += areaChapa;
                byMaterial[mat].area_usada += areaUsada;
                byMaterial[mat].chapas++;
            }
        } catch {}
    }

    // Calculate waste percentages
    for (const k of Object.keys(byMonth)) {
        byMonth[k].desperdicio_pct = byMonth[k].area_total > 0
            ? ((1 - byMonth[k].area_usada / byMonth[k].area_total) * 100) : 0;
    }
    for (const k of Object.keys(byMaterial)) {
        byMaterial[k].desperdicio_pct = byMaterial[k].area_total > 0
            ? ((1 - byMaterial[k].area_usada / byMaterial[k].area_total) * 100) : 0;
    }

    res.json({ por_mes: byMonth, por_material: byMaterial, total_lotes: lotes.length });
});

// #40 — Cross-project grouping suggestion
router.get('/sugestao-agrupamento', requireAuth, (req, res) => {
    // Find pending lotes with similar materials that could be combined
    const lotes = db.prepare(`
        SELECT l.id, l.nome, l.status FROM cnc_lotes l
        WHERE l.user_id = ? AND l.status IN ('importado', 'otimizado')
        ORDER BY l.criado_em DESC LIMIT 20
    `).all(req.user.id);

    const materialMap = {};
    for (const lote of lotes) {
        const pecas = db.prepare('SELECT material_code, COUNT(*) as qty, SUM(comprimento*largura) as area FROM cnc_pecas WHERE lote_id = ? GROUP BY material_code').all(lote.id);
        for (const p of pecas) {
            if (!p.material_code) continue;
            if (!materialMap[p.material_code]) materialMap[p.material_code] = [];
            materialMap[p.material_code].push({ lote_id: lote.id, lote_nome: lote.nome, qty: p.qty, area_mm2: p.area });
        }
    }

    // Find materials shared across 2+ lotes
    const suggestions = [];
    for (const [mat, entries] of Object.entries(materialMap)) {
        if (entries.length >= 2) {
            const totalPecas = entries.reduce((s, e) => s + e.qty, 0);
            const totalArea = entries.reduce((s, e) => s + (e.area_mm2 || 0), 0) / 1e6;
            suggestions.push({
                material: mat,
                lotes: entries,
                total_pecas: totalPecas,
                total_area_m2: totalArea,
                economia_estimada: `${(totalArea * 0.05).toFixed(2)} m²`, // ~5% savings estimate
            });
        }
    }

    res.json({ suggestions: suggestions.sort((a, b) => b.total_pecas - a.total_pecas) });
});

// #41 — Cutting time prediction (ML-like)
router.get('/predicao-tempo', requireAuth, (req, res) => {
    // Use historical data to predict cutting time
    const history = db.prepare(`
        SELECT p.lote_id, COUNT(*) as n_pecas,
            SUM(p.comprimento * p.largura) as total_area,
            AVG(p.espessura) as avg_esp
        FROM cnc_pecas p
        JOIN cnc_maquina_performance mp ON mp.lote_id = p.lote_id
        GROUP BY p.lote_id
    `).all();

    // Simple linear regression: time = a * n_pecas + b * total_area + c
    // For now return average stats
    const perfLogs = db.prepare('SELECT * FROM cnc_maquina_performance ORDER BY created_at DESC LIMIT 100').all();
    const avgTimePerPeca = perfLogs.length > 0 ? perfLogs.reduce((s, l) => s + (l.tempo_min || 0), 0) / Math.max(1, perfLogs.reduce((s, l) => s + (l.pecas_cortadas || 1), 0)) : 2.5;

    res.json({
        avg_min_per_peca: avgTimePerPeca,
        total_registros: perfLogs.length,
        confianca: perfLogs.length > 20 ? 'alta' : perfLogs.length > 5 ? 'media' : 'baixa',
        modelo: 'linear_simples'
    });
});

// #42 — Smart remnant alerts
router.get('/retalhos-aproveitaveis', requireAuth, (req, res) => {
    // Find remnants from completed lotes that could fit pending pieces
    const lotesComPlano = db.prepare(`
        SELECT id, plano_json FROM cnc_lotes
        WHERE user_id = ? AND plano_json IS NOT NULL AND status IN ('otimizado', 'concluido')
        ORDER BY criado_em DESC LIMIT 10
    `).all(req.user.id);

    const remnants = [];
    for (const lote of lotesComPlano) {
        try {
            const plano = JSON.parse(lote.plano_json);
            for (const ch of (plano.chapas || [])) {
                for (const s of (ch.sobras || [])) {
                    if (s.w >= 200 && s.h >= 200) { // Min 200x200mm
                        remnants.push({ lote_id: lote.id, material: ch.material, w: s.w, h: s.h, area_m2: (s.w * s.h) / 1e6 });
                    }
                }
            }
        } catch {}
    }

    // Find pending pieces that could fit in remnants
    const pendingPecas = db.prepare(`
        SELECT p.* FROM cnc_pecas p
        JOIN cnc_lotes l ON l.id = p.lote_id
        WHERE l.user_id = ? AND l.status = 'importado'
    `).all(req.user.id);

    const matches = [];
    for (const rem of remnants) {
        const fits = pendingPecas.filter(p =>
            p.material_code === rem.material &&
            ((p.comprimento <= rem.w && p.largura <= rem.h) || (p.comprimento <= rem.h && p.largura <= rem.w))
        );
        if (fits.length > 0) {
            matches.push({ retalho: rem, pecas_que_cabem: fits.length, pecas: fits.slice(0, 5).map(f => ({ id: f.id, desc: f.descricao, dims: `${f.comprimento}x${f.largura}` })) });
        }
    }

    res.json({ total_retalhos: remnants.length, matches: matches.sort((a, b) => b.pecas_que_cabem - a.pecas_que_cabem), remnants: remnants.slice(0, 20) });
});

// ═══════════════════════════════════════════════════════════════════
// #44 — IMPORT PROMOB/POLYBOARD (XML + CSV)
// ═══════════════════════════════════════════════════════════════════

router.post('/lotes/importar-promob', requireAuth, (req, res) => {
    try {
        const { xmlContent, nome } = req.body;
        if (!xmlContent) return res.status(400).json({ error: 'xmlContent obrigatório' });

        const pieces = [];
        let currentModule = 'Módulo 1';
        const lines = xmlContent.split('\n');
        let inPiece = false;
        let pieceData = {};

        for (const line of lines) {
            const moduleName = line.match(/Module.*?name="([^"]+)"/i)?.[1]
                || line.match(/<Ambiente.*?nome="([^"]+)"/i)?.[1]
                || line.match(/<Modulo.*?descricao="([^"]+)"/i)?.[1];
            if (moduleName) currentModule = moduleName;

            if (/<(Piece|Peca|Part)\b/i.test(line)) {
                inPiece = true;
                pieceData = { modulo: currentModule };
            }

            if (inPiece) {
                const desc = line.match(/(?:description|descricao|nome)="([^"]+)"/i)?.[1];
                const comp = line.match(/(?:length|comprimento|largura_final)="([^"]+)"/i)?.[1];
                const larg = line.match(/(?:width|largura|altura_final)="([^"]+)"/i)?.[1];
                const esp = line.match(/(?:thickness|espessura)="([^"]+)"/i)?.[1];
                const mat = line.match(/(?:material|material_code)="([^"]+)"/i)?.[1];
                const qty = line.match(/(?:quantity|quantidade|qtd)="([^"]+)"/i)?.[1];
                const edge1 = line.match(/(?:edge1|borda1|fita_comp1)="([^"]+)"/i)?.[1];
                const edge2 = line.match(/(?:edge2|borda2|fita_comp2)="([^"]+)"/i)?.[1];
                const edge3 = line.match(/(?:edge3|borda3|fita_larg1)="([^"]+)"/i)?.[1];
                const edge4 = line.match(/(?:edge4|borda4|fita_larg2)="([^"]+)"/i)?.[1];
                if (desc) pieceData.descricao = desc;
                if (comp) pieceData.comprimento = parseFloat(comp);
                if (larg) pieceData.largura = parseFloat(larg);
                if (esp) pieceData.espessura = parseFloat(esp);
                if (mat) pieceData.material = mat;
                if (qty) pieceData.quantidade = parseInt(qty) || 1;
                if (edge1) pieceData.borda_frontal = edge1;
                if (edge2) pieceData.borda_traseira = edge2;
                if (edge3) pieceData.borda_dir = edge3;
                if (edge4) pieceData.borda_esq = edge4;
            }

            if (inPiece && /<\/(Piece|Peca|Part)>/i.test(line)) {
                inPiece = false;
                if (pieceData.comprimento && pieceData.largura) {
                    pieces.push({ ...pieceData, quantidade: pieceData.quantidade || 1 });
                }
            }
        }

        // Fallback CSV (Polyboard exports CSV with ;)
        if (pieces.length === 0 && xmlContent.includes(';')) {
            const csvLines = xmlContent.split('\n').filter(l => l.trim());
            if (csvLines.length > 1) {
                const header = csvLines[0].toLowerCase().split(';');
                for (let i = 1; i < csvLines.length; i++) {
                    const cols = csvLines[i].split(';');
                    if (cols.length >= 4) {
                        const findCol = (names) => { for (const n of names) { const idx = header.indexOf(n); if (idx >= 0) return cols[idx]; } return ''; };
                        pieces.push({
                            descricao: findCol(['descricao', 'description', 'peca', 'nome']) || `Peça ${i}`,
                            comprimento: parseFloat(findCol(['comprimento', 'comp', 'length', 'c'])) || 0,
                            largura: parseFloat(findCol(['largura', 'larg', 'width', 'l'])) || 0,
                            espessura: parseFloat(findCol(['espessura', 'esp', 'thickness', 'e'])) || 18,
                            material: findCol(['material', 'mat', 'chapa']) || '',
                            quantidade: parseInt(findCol(['quantidade', 'qtd', 'qty'])) || 1,
                            modulo: findCol(['modulo', 'module', 'ambiente']) || 'Módulo 1',
                        });
                    }
                }
            }
        }

        if (pieces.length === 0) return res.status(400).json({ error: 'Nenhuma peça encontrada. Formatos: Promob XML, Polyboard XML, CSV com ponto-e-vírgula.' });

        const loteNome = nome || `Import Promob ${new Date().toISOString().split('T')[0]}`;
        const r = db.prepare('INSERT INTO cnc_lotes (nome, user_id, status, origem, criado_em) VALUES (?,?,?,?,CURRENT_TIMESTAMP)')
            .run(loteNome, req.user.id, 'importado', 'promob');
        const loteId = r.lastInsertRowid;

        const stmt = db.prepare(`INSERT INTO cnc_pecas (lote_id, descricao, modulo_desc, comprimento, largura, espessura, material, material_code, quantidade, borda_frontal, borda_traseira, borda_dir, borda_esq, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`);
        const tx = db.transaction(() => {
            for (const p of pieces) {
                for (let q = 0; q < (p.quantidade || 1); q++) {
                    stmt.run(loteId, p.descricao || '', p.modulo || '', p.comprimento || 0, p.largura || 0, p.espessura || 18, p.material || '', p.material || '', 1, p.borda_frontal || '', p.borda_traseira || '', p.borda_dir || '', p.borda_esq || '');
                }
            }
        });
        tx();

        const totalPecas = db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(loteId).c;
        res.json({ ok: true, id: loteId, total_pecas: totalPecas, nome: loteNome });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Erro ao importar' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// #45 — API PÚBLICA + WEBHOOKS
// ═══════════════════════════════════════════════════════════════════

router.get('/api-publica/lote/:loteId/status', (req, res) => {
    const { token } = req.query;
    const cfg = db.prepare("SELECT value FROM config WHERE key = 'api_token'").get();
    if (!cfg || cfg.value !== token) return res.status(401).json({ error: 'Token inválido' });
    const lote = db.prepare('SELECT id, nome, status, criado_em FROM cnc_lotes WHERE id = ?').get(req.params.loteId);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const pecas = db.prepare('SELECT COUNT(*) as total FROM cnc_pecas WHERE lote_id = ?').get(lote.id);
    const conferidas = db.prepare("SELECT COUNT(*) as c FROM cnc_conferencia WHERE lote_id = ? AND status = 'ok'").get(lote.id);
    res.json({ lote: { ...lote, total_pecas: pecas.total, conferidas: conferidas?.c || 0 } });
});

router.post('/webhooks', requireAuth, (req, res) => {
    const { url, eventos } = req.body;
    if (!url) return res.status(400).json({ error: 'url obrigatório' });
    db.prepare('INSERT INTO cnc_webhooks (user_id, url, eventos, ativo, criado_em) VALUES (?,?,?,1,CURRENT_TIMESTAMP)')
        .run(req.user.id, url, JSON.stringify(eventos || ['*']));
    res.json({ ok: true });
});

router.get('/webhooks', requireAuth, (req, res) => {
    const hooks = db.prepare('SELECT * FROM cnc_webhooks WHERE user_id = ?').all(req.user.id);
    res.json(hooks);
});

router.delete('/webhooks/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_webhooks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// #46 — RELATÓRIO CLIENTE (produção por módulo)
// ═══════════════════════════════════════════════════════════════════

router.get('/relatorio-cliente/:loteId', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_desc, descricao').all(lote.id);
    const conferencia = db.prepare('SELECT * FROM cnc_conferencia WHERE lote_id = ?').all(lote.id);

    const modulos = {};
    for (const p of pecas) {
        const mod = p.modulo_desc || 'Geral';
        if (!modulos[mod]) modulos[mod] = { pecas: [], conferidas: 0, total: 0 };
        modulos[mod].pecas.push(p);
        modulos[mod].total++;
        if (conferencia.find(c => c.peca_idx === p.id && c.status === 'ok')) modulos[mod].conferidas++;
    }

    res.json({
        lote: { id: lote.id, nome: lote.nome, status: lote.status, criado_em: lote.criado_em },
        modulos: Object.entries(modulos).map(([nome, data]) => ({
            nome, ...data, progresso_pct: data.total > 0 ? (data.conferidas / data.total * 100) : 0,
        })),
        total_pecas: pecas.length,
        total_conferidas: conferencia.filter(c => c.status === 'ok').length,
    });
});

// ═══════════════════════════════════════════════════════════════════
// #47 — GUIA DE MONTAGEM (passo a passo por módulo)
// ═══════════════════════════════════════════════════════════════════

router.get('/guia-montagem/:loteId/:moduloDesc', requireAuth, (req, res) => {
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? AND modulo_desc = ? ORDER BY descricao')
        .all(req.params.loteId, decodeURIComponent(req.params.moduloDesc));

    const orderRules = [
        { pattern: /base|fundo.*inferior/i, order: 1, step: 'Posicionar a base na bancada' },
        { pattern: /lateral/i, order: 2, step: 'Fixar as laterais na base (minifix ou cavilha)' },
        { pattern: /divisor|divisoria/i, order: 3, step: 'Instalar divisórias internas' },
        { pattern: /prateleira|shelf/i, order: 4, step: 'Encaixar prateleiras' },
        { pattern: /traseira|fundo(?!.*inferior)/i, order: 5, step: 'Fixar a traseira (encaixe ou parafuso)' },
        { pattern: /tampo|topo/i, order: 6, step: 'Posicionar o tampo' },
        { pattern: /porta|door/i, order: 7, step: 'Instalar portas com dobradiças' },
        { pattern: /frente.*gaveta|drawer/i, order: 8, step: 'Montar e encaixar gavetas' },
    ];

    const steps = pecas.map(p => {
        const rule = orderRules.find(r => r.pattern.test(p.descricao || ''));
        const mach = (() => { try { const m = JSON.parse(p.machining_json || '{}'); return Array.isArray(m) ? m : m.workers ? Object.values(m.workers) : []; } catch { return []; } })();
        const holes35 = mach.filter(w => w.diameter >= 34 && w.diameter <= 36).length;
        const holes15 = mach.filter(w => w.diameter >= 14 && w.diameter <= 16).length;
        const holes8 = mach.filter(w => w.diameter >= 7 && w.diameter <= 9 && w.depth <= 20).length;
        const grooves = mach.filter(w => /groove|saw|canal/i.test(w.category || '')).length;

        return {
            peca_id: p.id, descricao: p.descricao,
            dimensoes: `${p.comprimento}x${p.largura}x${p.espessura}`,
            material: p.material, ordem: rule ? rule.order : 9,
            instrucao: rule ? rule.step : 'Instalar conforme projeto',
            ferragens: {
                dobradicas: Math.floor(holes35 / 3),
                minifix: holes15,
                cavilhas: Math.max(0, holes8 - holes15),
                canais: grooves,
            },
            bordas: [p.borda_frontal, p.borda_traseira, p.borda_dir, p.borda_esq].filter(b => b && b !== '-').length,
        };
    }).sort((a, b) => a.ordem - b.ordem);

    res.json({ modulo: decodeURIComponent(req.params.moduloDesc), steps, total_pecas: pecas.length });
});

// ═══════════════════════════════════════════════════════════════════
// #48 — RASTREIO DE ENTREGA (GPS + status)
// ═══════════════════════════════════════════════════════════════════

router.post('/rastreio-entrega', requireAuth, (req, res) => {
    const { volume_id, lote_id, tipo, lat, lng, observacao, motorista } = req.body;
    db.prepare(`INSERT INTO cnc_rastreio_entrega (volume_id, lote_id, tipo, lat, lng, observacao, motorista, created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .run(volume_id || null, lote_id || null, tipo || 'em_transito', lat || null, lng || null, observacao || '', motorista || '');
    const broadcast = req.app.locals.wsBroadcast;
    if (broadcast) broadcast('entrega_update', { volume_id, lote_id, tipo });
    res.json({ ok: true });
});

router.get('/rastreio-entrega/:loteId', requireAuth, (req, res) => {
    const events = db.prepare('SELECT * FROM cnc_rastreio_entrega WHERE lote_id = ? ORDER BY created_at DESC').all(req.params.loteId);
    res.json(events);
});

// ═══════════════════════════════════════════════════════════════════
// #49 — DASHBOARD DE PRODUÇÃO (cnc_production_stats)
// ═══════════════════════════════════════════════════════════════════

router.get('/stats/producao', requireAuth, (req, res) => {
    try {
        const { meses = 6 } = req.query;
        const numMeses = Math.min(24, Math.max(1, parseInt(meses) || 6));

        // Stats mensais dos últimos N meses
        const stats = db.prepare(`
            SELECT * FROM cnc_production_stats
            WHERE tipo_periodo = 'mensal'
            ORDER BY periodo DESC
            LIMIT ?
        `).all(numMeses).reverse();

        // Totais acumulados
        const totais = stats.reduce((acc, s) => ({
            chapas: acc.chapas + (s.chapas_cortadas || 0),
            pecas: acc.pecas + (s.pecas_produzidas || 0),
            metros: acc.metros + (s.metros_lineares || 0),
            custo: acc.custo + (s.custo_material || 0),
        }), { chapas: 0, pecas: 0, metros: 0, custo: 0 });

        const aprovMedioGeral = stats.length > 0
            ? stats.reduce((s, r) => s + (r.aproveitamento_medio || 0), 0) / stats.length
            : 0;

        // Contagem de lotes do período
        const periodoInicio = stats.length > 0 ? stats[0].periodo : new Date().toISOString().slice(0, 7);
        const lotesCount = db.prepare(
            "SELECT COUNT(*) as c FROM cnc_lotes WHERE status IN ('otimizado','concluido') AND substr(atualizado_em,1,7) >= ?"
        ).get(periodoInicio)?.c || 0;

        res.json({
            series: stats,
            totais: { ...totais, aproveitamento_medio: Math.round(aprovMedioGeral * 100) / 100 },
            lotes_periodo: lotesCount,
        });
    } catch (err) {
        console.error('[CNC stats/producao]', err);
        res.status(500).json({ error: 'Erro ao carregar stats de produção' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// #50 — ALERTA DE PREÇO DE MATERIAIS VENCIDO
// ═══════════════════════════════════════════════════════════════════

router.get('/materiais/alertas-preco', requireAuth, (req, res) => {
    try {
        // Materiais cujo preço está vencido (preco_atualizado_em + preco_validade_dias < hoje)
        const vencidos = db.prepare(`
            SELECT id, nome, descricao, preco, preco_atualizado_em, preco_validade_dias,
                   CAST(julianday('now') - julianday(COALESCE(preco_atualizado_em, criado_em)) AS INTEGER) as dias_desde_atualizacao
            FROM biblioteca
            WHERE preco > 0
              AND preco_validade_dias > 0
              AND (
                preco_atualizado_em IS NULL
                OR julianday('now') - julianday(preco_atualizado_em) > preco_validade_dias
              )
            ORDER BY dias_desde_atualizacao DESC
            LIMIT 50
        `).all();

        // Materiais prestes a vencer (nos próximos 7 dias)
        const prestes = db.prepare(`
            SELECT id, nome, preco, preco_atualizado_em, preco_validade_dias,
                   CAST(preco_validade_dias - (julianday('now') - julianday(preco_atualizado_em)) AS INTEGER) as dias_restantes
            FROM biblioteca
            WHERE preco > 0
              AND preco_validade_dias > 0
              AND preco_atualizado_em IS NOT NULL
              AND julianday('now') - julianday(preco_atualizado_em) BETWEEN (preco_validade_dias - 7) AND preco_validade_dias
            ORDER BY dias_restantes ASC
            LIMIT 20
        `).all();

        res.json({ vencidos, prestes_a_vencer: prestes, total_vencidos: vencidos.length });
    } catch (err) {
        console.error('[CNC materiais alertas-preco]', err);
        res.status(500).json({ error: 'Erro ao buscar alertas de preço' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// #51 — EXPORT DXF (Aspire/VCarve compatible, ASCII R12)
// ═══════════════════════════════════════════════════════════════════

router.get('/export-dxf/:loteId/chapa/:chapaIdx', requireAuth, (req, res) => {
    try {
        const loteId = req.params.loteId;
        const chapaIdx = parseInt(req.params.chapaIdx, 10);

        const lote = db.prepare('SELECT plano_json, user_id FROM cnc_lotes WHERE id = ?').get(loteId);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const plano = typeof lote.plano_json === 'string' ? JSON.parse(lote.plano_json) : lote.plano_json;

        // plano can be an array of chapas or an object with a chapas property
        const chapas = Array.isArray(plano) ? plano : (plano.chapas || []);
        if (chapaIdx < 0 || chapaIdx >= chapas.length) {
            return res.status(404).json({ error: 'Índice de chapa inválido' });
        }

        const chapa = chapas[chapaIdx];
        const largura = chapa.largura || chapa.w || 0;
        const comprimento = chapa.comprimento || chapa.h || chapa.l || 0;
        const refilo = chapa.refilo || 0;
        const pecas = chapa.pecas || [];
        const retalhos = chapa.retalhos || [];

        // ── DXF layer definitions ────────────────────────────────
        const layers = [
            { name: 'Chapa',    color: 7 },
            { name: 'Pecas',    color: 3 },
            { name: 'Contorno', color: 1 },
            { name: 'Furo',     color: 5 },
            { name: 'Rebaixo',  color: 4 },
            { name: 'Canal',    color: 6 },
            { name: 'Retalho',  color: 2 },
        ];

        // ── Helpers ──────────────────────────────────────────────
        const lwpoly = (layer, x1, y1, x2, y2) =>
            `0\nLWPOLYLINE\n8\n${layer}\n70\n1\n90\n4\n10\n${x1}\n20\n${y1}\n10\n${x2}\n20\n${y1}\n10\n${x2}\n20\n${y2}\n10\n${x1}\n20\n${y2}\n`;

        const circle = (layer, cx, cy, radius) =>
            `0\nCIRCLE\n8\n${layer}\n10\n${cx}\n20\n${cy}\n30\n0.0\n40\n${radius}\n`;

        // ── Build entity strings ─────────────────────────────────
        let entities = '';

        // Sheet boundary
        entities += lwpoly('Chapa', 0, 0, largura, comprimento);

        // Pieces
        for (const peca of pecas) {
            const x1 = (peca.x || 0) + refilo;
            const y1 = (peca.y || 0) + refilo;
            const x2 = x1 + (peca.w || 0);
            const y2 = y1 + (peca.h || 0);
            entities += lwpoly('Pecas',    x1, y1, x2, y2);
            entities += lwpoly('Contorno', x1, y1, x2, y2);

            // Optional drill holes
            if (Array.isArray(peca.furos)) {
                for (const furo of peca.furos) {
                    const cx = x1 + (furo.x || 0);
                    const cy = y1 + (furo.y || 0);
                    const r  = (furo.diametro || furo.d || 8) / 2;
                    entities += circle('Furo', cx, cy, r);
                }
            }

            // Optional rebaixos
            if (Array.isArray(peca.rebaixos)) {
                for (const rb of peca.rebaixos) {
                    const rx1 = x1 + (rb.x || 0);
                    const ry1 = y1 + (rb.y || 0);
                    entities += lwpoly('Rebaixo', rx1, ry1, rx1 + (rb.w || 0), ry1 + (rb.h || 0));
                }
            }

            // Optional canais
            if (Array.isArray(peca.canais)) {
                for (const canal of peca.canais) {
                    const cx1 = x1 + (canal.x || 0);
                    const cy1 = y1 + (canal.y || 0);
                    entities += lwpoly('Canal', cx1, cy1, cx1 + (canal.w || 0), cy1 + (canal.h || 0));
                }
            }
        }

        // Scrap zones
        for (const ret of retalhos) {
            const x1 = ret.x || 0;
            const y1 = ret.y || 0;
            const x2 = x1 + (ret.w || 0);
            const y2 = y1 + (ret.h || 0);
            entities += lwpoly('Retalho', x1, y1, x2, y2);
        }

        // ── Assemble DXF ─────────────────────────────────────────
        const layerDefs = layers
            .map(l => `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS`)
            .join('\n');

        const dxf =
`0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n` +
`0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.length}\n` +
`${layerDefs}\n` +
`0\nENDTAB\n0\nENDSEC\n` +
`0\nSECTION\n2\nENTITIES\n` +
entities +
`0\nENDSEC\n0\nEOF\n`;

        res.setHeader('Content-Type', 'application/dxf');
        res.setHeader('Content-Disposition', `attachment; filename="chapa_${chapaIdx + 1}.dxf"`);
        res.send(dxf);
    } catch (err) {
        console.error('[CNC export-dxf]', err);
        res.status(500).json({ error: 'Erro ao gerar DXF' });
    }
});

export default router;
