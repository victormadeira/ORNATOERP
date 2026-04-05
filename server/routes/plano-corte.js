import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { loadBiblioteca, calcularListaCorte } from './producao.js';
import {
    MaxRectsBin, GuillotineBin, ShelfBin, SkylineBin,
    scoreResult, verifyNoOverlaps, repairOverlaps, compactBin,
    runNestingPass, runFillFirst, runStripPacking,
    clipAndKeep, gerarSequenciaCortes,
} from '../lib/nesting-engine.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/plano-corte/orcamentos — Listar orçamentos
// ═══════════════════════════════════════════════════════
router.get('/orcamentos', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT o.id, o.numero, o.cliente_nome, o.ambiente, o.valor_venda,
                   o.custo_material, o.kb_col, o.atualizado_em, o.mods_json,
                   p.id as projeto_id, p.nome as projeto_nome, p.status as projeto_status
            FROM orcamentos o
            LEFT JOIN projetos p ON p.orc_id = o.id
            WHERE (o.tipo IS NULL OR o.tipo != 'aditivo')
            ORDER BY o.atualizado_em DESC
        `).all();

        // Filtrar apenas os que têm ambientes com módulos
        const result = rows
            .filter(r => {
                try {
                    const mods = JSON.parse(r.mods_json || '{}');
                    const ambientes = mods.ambientes || [];
                    return ambientes.some(a => (a.itens?.length || 0) + (a.modulos?.length || 0) > 0);
                } catch { return false; }
            })
            .map(r => ({
                id: r.id,
                numero: r.numero,
                cliente_nome: r.cliente_nome,
                ambiente: r.ambiente,
                valor_venda: r.valor_venda,
                custo_material: r.custo_material,
                kb_col: r.kb_col,
                atualizado_em: r.atualizado_em,
                projeto_id: r.projeto_id,
                projeto_nome: r.projeto_nome,
                projeto_status: r.projeto_status,
                // Contar ambientes e módulos
                n_ambientes: (() => {
                    try {
                        const mods = JSON.parse(r.mods_json || '{}');
                        return (mods.ambientes || []).length;
                    } catch { return 0; }
                })(),
                n_modulos: (() => {
                    try {
                        const mods = JSON.parse(r.mods_json || '{}');
                        return (mods.ambientes || []).reduce((s, a) =>
                            s + (a.itens?.length || 0) + (a.modulos?.length || 0), 0);
                    } catch { return 0; }
                })(),
            }));

        res.json(result);
    } catch (e) {
        console.error('plano-corte/orcamentos error:', e);
        res.status(500).json({ error: 'Erro ao listar orçamentos' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/plano-corte/orcamento/:id/pecas — Extrair peças
// ═══════════════════════════════════════════════════════
router.get('/orcamento/:id/pecas', requireAuth, (req, res) => {
    try {
        const orcId = parseInt(req.params.id);
        const orc = db.prepare('SELECT id, numero, cliente_nome, ambiente, mods_json FROM orcamentos WHERE id = ?').get(orcId);
        if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

        const mods = JSON.parse(orc.mods_json || '{}');
        const bib = loadBiblioteca();

        // Incluir aditivos
        const aditivos = db.prepare(`
            SELECT mods_json FROM orcamentos
            WHERE parent_orc_id = ? AND tipo = 'aditivo' AND versao_ativa = 1
        `).all(orcId);

        // Consolidar mods: adicionar ambientes dos aditivos
        for (const ad of aditivos) {
            try {
                const adMods = JSON.parse(ad.mods_json || '{}');
                (adMods.ambientes || []).forEach(a => {
                    if (!mods.ambientes) mods.ambientes = [];
                    mods.ambientes.push({ ...a, nome: `${a.nome} (Aditivo)` });
                });
            } catch { /* ignore */ }
        }

        const result = calcularListaCorte(mods, bib);

        // Agrupar peças por material
        const porMaterial = {};
        for (const p of result.pecas) {
            if (!porMaterial[p.matId]) {
                const mat = bib.chapas.find(c => c.id === p.matId);
                porMaterial[p.matId] = {
                    matId: p.matId,
                    matNome: p.matNome,
                    espessura: p.espessura,
                    chapaLarg: mat?.larg || 2750,
                    chapaAlt: mat?.alt || 1850,
                    preco: mat?.preco || 0,
                    pecas: [],
                };
            }
            porMaterial[p.matId].pecas.push(p);
        }

        // Expandir peças por qtd para contagem real
        let totalPecas = 0;
        for (const g of Object.values(porMaterial)) {
            let groupTotal = 0;
            for (const p of g.pecas) {
                groupTotal += p.qtd || 1;
            }
            g.totalPecas = groupTotal;
            totalPecas += groupTotal;
        }

        res.json({
            orcamento: { id: orc.id, numero: orc.numero, cliente_nome: orc.cliente_nome, ambiente: orc.ambiente },
            materiais: Object.values(porMaterial),
            totalPecas,
            chapas: result.chapas,
            fita: result.fita,
        });
    } catch (e) {
        console.error('plano-corte/pecas error:', e);
        res.status(500).json({ error: 'Erro ao extrair peças' });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/plano-corte/otimizar — Otimizar plano de corte
// ═══════════════════════════════════════════════════════
router.post('/otimizar', requireAuth, (req, res) => {
    try {
        const { orcamento_id, config = {} } = req.body;
        if (!orcamento_id) return res.status(400).json({ error: 'orcamento_id obrigatório' });

        const orc = db.prepare('SELECT id, numero, cliente_nome, ambiente, mods_json FROM orcamentos WHERE id = ?').get(orcamento_id);
        if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

        const mods = JSON.parse(orc.mods_json || '{}');
        const bib = loadBiblioteca();

        // Incluir aditivos
        const aditivos = db.prepare(`
            SELECT mods_json FROM orcamentos
            WHERE parent_orc_id = ? AND tipo = 'aditivo' AND versao_ativa = 1
        `).all(orcamento_id);

        for (const ad of aditivos) {
            try {
                const adMods = JSON.parse(ad.mods_json || '{}');
                (adMods.ambientes || []).forEach(a => {
                    if (!mods.ambientes) mods.ambientes = [];
                    mods.ambientes.push({ ...a, nome: `${a.nome} (Aditivo)` });
                });
            } catch { /* ignore */ }
        }

        // Extrair peças
        const listaCorte = calcularListaCorte(mods, bib);

        // Configuração
        const kerf = config.kerf ?? 4;
        const refilo = config.refilo ?? 10;
        const permitirRotacao = config.permitir_rotacao !== false;
        const modo = config.modo || 'guilhotina';
        const direcaoCorte = config.direcao_corte || 'auto';
        const considerarSobra = config.considerar_sobra !== false;
        const sobraMinW = config.sobra_min_largura ?? 300;
        const sobraMinH = config.sobra_min_comprimento ?? 600;

        // Agrupar peças por material
        const groups = {};
        for (const peca of listaCorte.pecas) {
            const key = peca.matId;
            if (!groups[key]) {
                const mat = bib.chapas.find(c => c.id === key);
                groups[key] = {
                    matId: key,
                    matNome: peca.matNome,
                    espessura: peca.espessura,
                    chapaW: mat?.larg || 2750,
                    chapaH: mat?.alt || 1850,
                    preco: mat?.preco || 0,
                    pieces: [],
                };
            }
            // Expandir por qtd
            const qtd = peca.qtd || 1;
            for (let q = 0; q < qtd; q++) {
                groups[key].pieces.push({
                    ref: {
                        nome: peca.nome,
                        ambiente: peca.ambiente,
                        modulo: peca.modulo,
                        tipo: peca.tipo,
                        fita_lados: peca.fita_lados || null,
                        instance: q,
                    },
                    w: peca.largura,
                    h: peca.altura,
                    allowRotate: permitirRotacao,
                    area: peca.largura * peca.altura,
                    perim: 2 * (peca.largura + peca.altura),
                    maxSide: Math.max(peca.largura, peca.altura),
                    diff: Math.abs(peca.largura - peca.altura),
                });
            }
        }

        // Otimizar cada grupo de material
        const planoChapas = [];
        let totalPecas = 0;
        let totalChapas = 0;
        let custoTotal = 0;
        let areaUtilTotal = 0;
        let areaChapaTotal = 0;
        const materiaisResumo = {};

        for (const [matId, group] of Object.entries(groups)) {
            const { chapaW, chapaH, pieces, preco, matNome, espessura } = group;
            const effW = chapaW - 2 * refilo;
            const effH = chapaH - 2 * refilo;

            if (effW <= 0 || effH <= 0 || pieces.length === 0) continue;

            // Filtrar peças que cabem na chapa
            const validPieces = pieces.filter(p => {
                const fits = (p.w <= effW && p.h <= effH) || (permitirRotacao && p.h <= effW && p.w <= effH);
                if (!fits) console.warn(`Peça ${p.ref.nome} (${p.w}x${p.h}) não cabe na chapa ${matNome} (${effW}x${effH})`);
                return fits;
            });

            if (validPieces.length === 0) continue;

            // Mapear binType
            const binType = modo === 'maxrects' ? 'maxrects' : 'guillotine';
            const spacing = kerf;

            // Multi-pass otimização
            const sortStrategies = [
                (a, b) => b.area - a.area,
                (a, b) => b.maxSide - a.maxSide,
                (a, b) => b.h - a.h || b.w - a.w,
                (a, b) => b.w - a.w || b.h - a.h,
                (a, b) => b.perim - a.perim,
                (a, b) => b.diff - a.diff,
            ];
            const heuristics = ['BSSF', 'BAF', 'BLSF', 'BL', 'CP'];

            let bestBins = null;
            let bestScore = { score: Infinity };
            let bestStrategy = '';

            // Phase 1: greedy multi-pass
            for (const sortFn of sortStrategies) {
                const sorted = [...validPieces].sort(sortFn);
                for (const h of heuristics) {
                    for (const bt of [binType, 'shelf']) {
                        const bins = runNestingPass(sorted, effW, effH, spacing, h, bt, kerf, direcaoCorte);
                        const sc = scoreResult(bins);
                        if (sc.score < bestScore.score) {
                            bestScore = sc; bestBins = bins;
                            bestStrategy = `nesting+${h}+${bt}`;
                        }
                    }
                }
            }

            // Phase 2: fill-first
            for (const sortFn of sortStrategies.slice(0, 3)) {
                const sorted = [...validPieces].sort(sortFn);
                for (const h of ['BSSF', 'BAF']) {
                    const bins = runFillFirst(sorted, effW, effH, spacing, h, binType, kerf, direcaoCorte);
                    const sc = scoreResult(bins);
                    if (sc.score < bestScore.score) {
                        bestScore = sc; bestBins = bins;
                        bestStrategy = `fillFirst+${h}`;
                    }
                }
            }

            // Phase 3: strip packing
            const stripBins = runStripPacking(validPieces, effW, effH, kerf, spacing, 'auto');
            const stripSc = scoreResult(stripBins);
            if (stripSc.score < bestScore.score) {
                bestScore = stripSc; bestBins = stripBins;
                bestStrategy = 'stripPacking';
            }

            // Verificar e reparar
            if (bestBins && !verifyNoOverlaps(bestBins)) {
                bestBins = repairOverlaps(bestBins, effW, effH, spacing, binType, kerf, direcaoCorte);
            }
            if (bestBins) {
                for (const bin of bestBins) compactBin(bin, effW, effH, kerf);
            }

            if (!bestBins || bestBins.length === 0) continue;

            // Converter bins para formato de plano
            const areaChapa = (chapaW * chapaH) / 1e6; // m²
            let matChapas = 0;

            for (let bi = 0; bi < bestBins.length; bi++) {
                const bin = bestBins[bi];
                const occ = bin.occupancy();
                matChapas++;

                const pecasPlano = bin.usedRects.map((r, pi) => {
                    const px = Math.round(r.x) + refilo;
                    const py = Math.round(r.y) + refilo;
                    const pw = Math.round(r.realW || r.w);
                    const ph = Math.round(r.realH || r.h);
                    return {
                        pecaId: pi,
                        nome: r.pieceRef?.nome || `Peça ${pi}`,
                        ambiente: r.pieceRef?.ambiente || '',
                        modulo: r.pieceRef?.modulo || '',
                        tipo: r.pieceRef?.tipo || '',
                        fita: r.pieceRef?.fita_lados || null,
                        x: px, y: py, w: pw, h: ph,
                        rotated: !!r.rotated,
                    };
                });

                // Calcular sobras
                let retalhos = [];
                if (considerarSobra && bin.freeRects) {
                    retalhos = clipAndKeep(bin.freeRects, sobraMinW, sobraMinH)
                        .map(r => ({
                            x: Math.round(r.x) + refilo,
                            y: Math.round(r.y) + refilo,
                            w: Math.round(r.w),
                            h: Math.round(r.h),
                        }));
                }

                // ── Overlap detection & logging ──
                let overlapCount = 0;
                for (let a = 0; a < pecasPlano.length; a++) {
                    for (let b = a + 1; b < pecasPlano.length; b++) {
                        const pa = pecasPlano[a], pb = pecasPlano[b];
                        if (pa.x < pb.x + pb.w && pa.x + pa.w > pb.x && pa.y < pb.y + pb.h && pa.y + pa.h > pb.y) {
                            overlapCount++;
                            if (overlapCount <= 3) {
                                console.warn(`  [OVERLAP] Chapa ${planoChapas.length}: "${pa.nome}" (${pa.x},${pa.y} ${pa.w}x${pa.h}) vs "${pb.nome}" (${pb.x},${pb.y} ${pb.w}x${pb.h})`);
                            }
                        }
                    }
                }
                if (overlapCount > 0) console.warn(`  [OVERLAP] Total: ${overlapCount} sobreposicoes na chapa ${planoChapas.length}`);

                // Sequência de cortes
                const cortes = bin.cuts ? gerarSequenciaCortes(bin) : [];

                planoChapas.push({
                    idx: planoChapas.length,
                    material: matNome,
                    material_code: matId,
                    espessura,
                    comprimento: chapaW,
                    largura: chapaH,
                    preco,
                    refilo,
                    kerf,
                    aproveitamento: Math.round(occ * 100) / 100,
                    pecas: pecasPlano,
                    retalhos,
                    cortes,
                });
            }

            totalPecas += validPieces.length;
            totalChapas += matChapas;
            custoTotal += matChapas * preco;
            areaChapaTotal += matChapas * areaChapa;
            areaUtilTotal += validPieces.reduce((s, p) => s + (p.w * p.h) / 1e6, 0);

            materiaisResumo[matId] = {
                material: matNome,
                espessura,
                total_pecas: validPieces.length,
                total_chapas: matChapas,
                preco_unitario: preco,
                custo_total: matChapas * preco,
                estrategia: bestStrategy,
                aproveitamento: bestScore.avgOccupancy ? Math.round(bestScore.avgOccupancy * 100) / 100 : 0,
            };
        }

        const aproveitamentoGeral = areaChapaTotal > 0
            ? Math.round((areaUtilTotal / areaChapaTotal) * 10000) / 100
            : 0;

        res.json({
            ok: true,
            orcamento: {
                id: orc.id,
                numero: orc.numero,
                cliente_nome: orc.cliente_nome,
                ambiente: orc.ambiente,
            },
            plano: {
                chapas: planoChapas,
                materiais: materiaisResumo,
            },
            resumo: {
                total_pecas: totalPecas,
                total_chapas: totalChapas,
                aproveitamento: aproveitamentoGeral,
                custo_chapas: Math.round(custoTotal * 100) / 100,
                area_util_m2: Math.round(areaUtilTotal * 100) / 100,
                area_chapas_m2: Math.round(areaChapaTotal * 100) / 100,
                desperdicio_m2: Math.round((areaChapaTotal - areaUtilTotal) * 100) / 100,
            },
        });
    } catch (e) {
        console.error('plano-corte/otimizar error:', e);
        res.status(500).json({ error: 'Erro ao otimizar plano de corte: ' + e.message });
    }
});

export default router;
