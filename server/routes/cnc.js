import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import {
    MaxRectsBin, SkylineBin, GuillotineBin, ShelfBin,
    intersects, isContainedIn, pruneFreeList, clipRect, clipAndKeep,
    classifyBySize, scoreResult, verifyNoOverlaps, repairOverlaps, compactBin,
    runNestingPass, runFillFirst, runStripPacking, runBRKGA, ruinAndRecreate,
    gerarSequenciaCortes, setVacuumAware, getVacuumAware,
    optimizeLastBin, crossBinOptimize,
} from '../lib/nesting-engine.js';
import { isPythonAvailable, callPython } from '../lib/python-bridge.js';

const router = Router();

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

router.put('/pecas/:id', requireAuth, (req, res) => {
    const { observacao, comprimento, largura } = req.body;
    const peca = db.prepare('SELECT p.id FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(req.params.id, req.user.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    const updates = [];
    const vals = [];
    if (observacao !== undefined) { updates.push('observacao = ?'); vals.push(observacao); }
    if (comprimento !== undefined) { updates.push('comprimento = ?'); vals.push(comprimento); }
    if (largura !== undefined) { updates.push('largura = ?'); vals.push(largura); }
    if (updates.length === 0) return res.json({ ok: true });
    vals.push(req.params.id);
    db.prepare(`UPDATE cnc_pecas SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
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

                    // Atualizar posicoes das pecas no DB
                    for (const pecaInfo of chapaInfo.pecas) {
                        if (pecaInfo.instancia === 0) {
                            updatePeca.run(chapaIdx, pecaInfo.x + refilo, pecaInfo.y + refilo, pecaInfo.rotated ? 1 : 0, pecaInfo.pecaId, lote.id);
                        }
                    }

                    // Criar retalhos no DB
                    if (considerarSobra) {
                        for (const s of chapaInfo.retalhos) {
                            const w = Math.round(Math.max(s.w, s.h));
                            const h = Math.round(Math.min(s.w, s.h));
                            if (w >= sobraMinH && h >= sobraMinW) {
                                db.prepare(`INSERT INTO cnc_retalhos (user_id, chapa_ref_id, nome, material_code, espessura_real, comprimento, largura, origem_lote)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                                    req.user.id, chapa.id || null,
                                    `Retalho ${w}x${h}`, group.material_code, group.espessura, w, h, String(lote.id)
                                );
                            }
                        }
                    }

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
            chapas: [], retalhos: [], materiais: {}, modo: binType, multi_lote: true, lote_ids: loteIds, grupo_otimizacao: grupoId,
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

            // Expandir peças com rastreio de lote_id
            const expanded = [];
            for (const p of group.pieces) {
                const allowRotate = temVeio ? false : (permitirRotacao != null ? permitirRotacao : true);
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
                        plano.chapas.push(chapaInfo);
                        retalhosUsados.push(ret.id);
                        db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(ret.id);
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

            const binTypesToTry = [binType];
            if (!binTypesToTry.includes('guillotine')) binTypesToTry.push('guillotine');
            if (!binTypesToTry.includes('shelf')) binTypesToTry.push('shelf');
            if (!binTypesToTry.includes('maxrects')) binTypesToTry.push('maxrects');
            if (!binTypesToTry.includes('skyline')) binTypesToTry.push('skyline');

            const sortStrategies = [
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

            // FASE 2: Portfolio multi-pass
            for (const bt of binTypesToTry) {
                for (const strat of sortStrategies) {
                    const sorted = [...pecasRestantes].sort(strat.fn);
                    for (const h of heuristics) {
                        const bins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                        const sc = scoreResult(bins);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = bins; bestStrategyName = `${strat.name}+${h}+${bt}`; bestBinType = bt; }
                        totalCombinacoes++;
                    }
                }
            }

            // FASE 2.5: Strip packing
            {
                const stripBins = runStripPacking(pecasRestantes, binW, binH, kerf);
                const sc = scoreResult(stripBins);
                if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = stripBins; bestStrategyName = 'strip_packing'; bestBinType = 'strip'; }
                totalCombinacoes++;
            }

            // FASE 3: R&R
            const rrIter = Math.max(maxIter, 500);
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
            for (const bin of bestBins) compactBin(bin, binW, binH, kerf);

            const maxTeoricoAprov = totalPieceArea / (bestBins.length * sheetArea) * 100;
            console.log(`  [Nesting Multi] ${groupKey}: ${pecasRestantes.length} peças (${lotes.length} lotes) → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}% (${bestStrategyName})`);

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
                        db.prepare(`INSERT INTO cnc_retalhos (user_id, chapa_ref_id, nome, material_code, espessura_real, comprimento, largura, origem_lote)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                            req.user.id, chapa.id || null,
                            `Retalho ${Math.max(w, h)}x${Math.min(w, h)}`,
                            group.material_code, group.espessura,
                            Math.max(w, h), Math.min(w, h), loteIds.join(',')
                        );
                    }
                }

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

        // ── Snapshot transacional antes de ações críticas ──
        const SNAPSHOT_ACTIONS = ['move_to_sheet', 'from_transfer', 'reoptimize_unlocked',
            'lock_sheet', 'unlock_sheet', 'compact', 're_optimize', 'ajustar_sobra',
            'marcar_refugo', 'merge_sobras'];
        if (SNAPSHOT_ACTIONS.includes(action)) {
            db.prepare('INSERT INTO cnc_plano_versions (lote_id, user_id, plano_json, acao_origem) VALUES (?, ?, ?, ?)')
                .run(lote.id, req.user.id, lote.plano_json, action);
            db.prepare(`DELETE FROM cnc_plano_versions WHERE lote_id = ? AND id NOT IN
                (SELECT id FROM cnc_plano_versions WHERE lote_id = ? ORDER BY id DESC LIMIT 50)`)
                .run(lote.id, lote.id);
        }

        // ── Gate de trava por chapa ──
        const SHEET_GATED_ACTIONS = ['move', 'rotate', 'to_transfer', 'compact', 're_optimize', 'ajustar_sobra', 'marcar_refugo', 'merge_sobras'];
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

            // Validar limites
            const ref = chapa.refilo || 0;
            const clampedX = Math.max(0, Math.min(chapa.comprimento - 2 * ref - peca.w, x));
            const clampedY = Math.max(0, Math.min(chapa.largura - 2 * ref - peca.h, y));

            const testPeca = { ...peca, x: clampedX, y: clampedY };
            const moveKerf = chapa.kerf || 0;
            const collision = checkCollision(testPeca, chapa.pecas, pecaIdx, moveKerf);

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

            // Verificar colisão pós-rotação
            const rotKerf = chapa.kerf || 0;
            const collision = checkCollision(peca, chapa.pecas, pecaIdx, rotKerf);
            if (collision.collides) {
                const pos = findNonCollidingPosition(peca, chapa.pecas, pecaIdx, chapa.comprimento, chapa.largura, ref, rotKerf);
                if (pos) { peca.x = pos.x; peca.y = pos.y; }
                else {
                    // Reverter
                    peca.w = newH; peca.h = newW; peca.rotated = !peca.rotated;
                    return res.status(400).json({ error: 'Sem espaço para rotacionar (colisão)' });
                }
            }

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

        // ═══ ACTION: re_optimize ══════════════════════════════════════
        } else if (action === 're_optimize') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const ref = chapa.refilo || 0;
            const usableW = chapa.comprimento - 2 * ref;
            const usableH = chapa.largura - 2 * ref;
            const kerfVal = plano.config?.kerf || 4;
            const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';

            // Separar locked vs livres
            const locked = chapa.pecas.filter(p => p.locked);
            const free = chapa.pecas.filter(p => !p.locked);

            // Preparar peças para nesting
            const pieces = free.map((p, i) => ({
                ref: { pecaId: p.pecaId, instancia: p.instancia || 0 },
                w: p.w, h: p.h, area: p.w * p.h,
                perim: 2 * (p.w + p.h), maxSide: Math.max(p.w, p.h),
                diff: Math.abs(p.w - p.h),
                allowRotate: !hasVeio,
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
            });
            controle++;
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
    return ord;
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

    const fmt = (n) => Number(n).toFixed(dec);
    const refilo = chapa.refilo || 10;
    const alertas = [];
    const missingTools = new Set();
    const espChapa = chapa.espessura_real || 18.5;

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
        const rotated = pp.rotated || false;
        const compOrig = pDb.comprimento, largOrig = pDb.largura;
        const esp = pDb.espessura || 18.5;
        const areaCm2 = (pW * pH) / 100;
        const cls = pp.classificacao || 'normal';
        const isPeq = areaCm2 < feedAreaMax;

        // Parse machining
        let mach = {};
        try { mach = JSON.parse(pDb.machining_json || '{}'); } catch (_) {}

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

            if (tc && !toolMap[tc]) missingTools.add(tc);
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

            // ─── Tool-Agnostic Machining ───
            // Se a ferramenta especificada não existe, tentar encontrar qualquer fresa disponível
            let effectiveTool = tool;
            let toolAdapted = false;
            if (!effectiveTool && tc) {
                // Buscar alternativa: qualquer fresa no magazine
                const alternatives = Object.values(toolMap).filter(t =>
                    t.tipo === 'fresa' || t.tipo_corte === 'fresa_reta' || t.tipo_corte === 'fresa_compressao' || t.tipo === 'broca'
                );
                if (alternatives.length > 0) {
                    // Para rasgo: preferir fresa menor que a largura do rasgo
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

            const profExtra = effectiveTool?.profundidade_extra ?? profExtraMaq;
            const depthTotal = Number(w.depth ?? 5) + profExtra;
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
                const stepOver = toolDiamEf * 0.7;
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

            const isHole = tipo.includes('hole') || tipo === 'transfer_hole';
            const isCut = tipo.includes('saw') || tipo.includes('cut') || tipo === 'transfer_vertical_saw_cut';
            const isPocket = tipo.includes('pocket') || tipo.includes('rebaixo');
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
            });
        }

        // ═══ CONTORNO AUTOMÁTICO da peça ═══
        if (contTool) {
            const cR = contTool.diametro / 2;
            const profExtra = contTool.profundidade_extra ?? profExtraMaq;
            const depthTotal = esp + profExtra;
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
                        const holeDepth = esp + profExtra;
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
            const depthTotal = espChapa + profExtra;
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
        if (a.toolCode !== b.toolCode) return (a.toolCode || '').localeCompare(b.toolCode || '');
        return 0;
    });

    const sortedOps = [];
    let gs = 0;
    for (let i = 0; i <= allOps.length; i++) {
        const newGrp = i === allOps.length ||
            allOps[i].fase !== allOps[gs].fase ||
            allOps[i].prioridade !== allOps[gs].prioridade ||
            allOps[i].toolCode !== allOps[gs].toolCode;
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
                // Contorno circular: posicionar na borda do furo, G2 volta completa
                const cutR = r - toolR;  // Compensação do raio da fresa

                for (let pi = 0; pi < op.passes.length; pi++) {
                    const zTarget = zCut(op.passes[pi]);
                    if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                    emit(`G0 X${fmt(cx + cutR)} Y${fmt(cy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    // G2 volta completa: endpoint = startpoint, I = -cutR, J = 0
                    emit(`G2 X${fmt(cx + cutR)} Y${fmt(cy)} I${fmt(-cutR)} J0 F${op.velCorte}`);
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
                const firstEdgeLen = dirCorte === 'climb'
                    ? Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2)
                    : Math.sqrt((p3.x - p0.x) ** 2 + (p3.y - p0.y) ** 2);
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
                        // Rampa ao longo da primeira aresta do contorno
                        const nextPt = dirCorte === 'climb' ? p1 : p0;
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
                    if (dirCorte === 'climb') {
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    }

                    // 5. Lead-out: sair do contorno
                    emit(`G1 X${fmt(entryX)} Y${fmt(entryY)} F${op.velCorte}`);

                } else {
                    // ─── SEM LEAD-IN: entrada direta no P0 ───
                    emit(`G0 X${fmt(p0.x)} Y${fmt(p0.y)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa && rampLen > 5) {
                        // Rampa ao longo da primeira aresta do contorno
                        const nextPt = dirCorte === 'climb' ? p1 : p3;
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

                    // Direção do contorno
                    if (dirCorte === 'climb') {
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
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
            L.push(`${cmt} Furo: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} Prof=${fmt(op.depthTotal)}`);
            emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
            emit(`G0 Z${fmt(zApproach())}`);
            for (let pi = 0; pi < op.passes.length; pi++) {
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length}`);
                emit(`G1 Z${fmt(zCut(op.passes[pi]))} F${velMergulho}`);
                if (pi < op.passes.length - 1) emit(`G0 Z${fmt(zApproach())}`);
            }
            // Retração: usar zRapid entre furos consecutivos da mesma ferramenta
            const nextOpH = sortedOps[sortedOps.indexOf(op) + 1];
            const fastRetractH = nextOpH && nextOpH.opType === 'hole' && nextOpH.toolCode === op.toolCode;
            emit(`G0 Z${fmt(fastRetractH ? zRapid() : zSafe())}`);
            L.push('');

        } else if (op.opType === 'groove') {
            const x2 = op.absX2 ?? op.absX, y2 = op.absY2 ?? op.absY;
            const grooveLen = Math.sqrt((x2 - op.absX) ** 2 + (y2 - op.absY) ** 2);
            const gOffsets = op.grooveMultiPass ? op.grooveOffsets : [0];

            if (op.grooveMultiPass) {
                L.push(`${cmt} Rasgo MULTI-PASS: ${op.pecaDesc} Larg=${op.grooveWidth}mm Fresa=D${op.toolDiam}mm (${gOffsets.length} passadas laterais)`);
            } else {
                L.push(`${cmt} Rasgo: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} -> X${fmt(x2)} Y${fmt(y2)} Prof=${fmt(op.depthTotal)} L=${fmt(grooveLen)}`);
            }
            if (op.toolAdapted) L.push(`${cmt}   FERRAMENTA ADAPTADA: usando ${op.toolNome} (D${op.toolDiam}mm)`);

            // Calcular vetor perpendicular ao rasgo para offsets laterais
            let perpX = 0, perpY = 0;
            if (grooveLen > 0.01) {
                const dx = x2 - op.absX, dy = y2 - op.absY;
                perpX = -dy / grooveLen; // perpendicular normalizado
                perpY = dx / grooveLen;
            }

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada Z ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // Multi-pass lateral: cada offset lateral em cada profundidade
                for (let li = 0; li < gOffsets.length; li++) {
                    const off = gOffsets[li];
                    const sx = op.absX + perpX * off;
                    const sy = op.absY + perpY * off;
                    const ex = x2 + perpX * off;
                    const ey = y2 + perpY * off;

                    if (gOffsets.length > 1) L.push(`${cmt}   Lateral ${li + 1}/${gOffsets.length} offset=${fmt(off)}mm`);

                    emit(`G0 X${fmt(sx)} Y${fmt(sy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa && grooveLen > 10) {
                        const rampLen = Math.min(grooveLen * 0.3, 20);
                        const ratio = rampLen / grooveLen;
                        const rampEndX = sx + (ex - sx) * ratio;
                        const rampEndY = sy + (ey - sy) * ratio;
                        emit(`G1 X${fmt(rampEndX)} Y${fmt(rampEndY)} Z${fmt(zTarget)} F${velMergulho}`);
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
            L.push(`${cmt} Pocket: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} ${pw}x${ph} Prof=${fmt(op.depthTotal)}`);
            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                if (pw > toolDiam * 1.2 && ph > toolDiam * 1.2) {
                    // ─── Zigzag clearing para pockets maiores que a fresa ───
                    const stepOver = toolDiam * 0.7;
                    const toolR = toolDiam / 2;
                    const ox = Number(op.absX), oy = Number(op.absY);
                    const startX = ox + toolR, startY = oy + toolR;
                    const endX = ox + pw - toolR, endY = oy + ph - toolR;

                    emit(`G0 X${fmt(startX)} Y${fmt(startY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa) {
                        // Rampa em zigzag: desce ao longo da primeira linha do zigzag
                        const rampLen = Math.min(Math.abs(endY - startY) * 0.3, 20);
                        const rampEndY = startY + rampLen;
                        emit(`G1 X${fmt(startX)} Y${fmt(rampEndY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 X${fmt(startX)} Y${fmt(startY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // Zigzag em Y com passo em X
                    let cx = startX;
                    let dir = 1;
                    while (cx <= endX + 0.01) {
                        const ty = dir === 1 ? endY : startY;
                        emit(`G1 X${fmt(cx)} Y${fmt(ty)} F${op.velCorte}`);
                        cx += stepOver;
                        if (cx <= endX + 0.01) {
                            emit(`G1 X${fmt(Math.min(cx, endX))} Y${fmt(ty)} F${op.velCorte}`);
                        }
                        dir *= -1;
                    }

                    // Perímetro final (acabamento)
                    L.push(`${cmt}   Perimetro acabamento`);
                    emit(`G1 X${fmt(ox)} Y${fmt(oy)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox + pw)} Y${fmt(oy)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox + pw)} Y${fmt(oy + ph)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox)} Y${fmt(oy + ph)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox)} Y${fmt(oy)} F${op.velCorte}`);
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

                if (dirCorte === 'climb') {
                    emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${os.velFinal}`);
                } else {
                    emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${os.velFinal}`);
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

    return {
        gcode: L.join('\n'),
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
            usar_lead_in: usarLeadIn,
            tempo_estimado_min: Math.round((totalOps * 3 + trocas * 12) / 60),
        },
        alertas,
        ferramentas_faltando: [...missingTools],
        contorno_tool: contTool ? { codigo: contTool.codigo, nome: contTool.nome, diametro: contTool.diametro } : null,
    };
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
        const result = generateGcodeForChapa(chapa, chapaIdx, ctx.pecasDb, ctx.maquina, ctx.toolMap, ctx.usinagemTipos, ctx.cfg);

        if (result.ferramentas_faltando.length > 0) {
            return res.json({
                ok: false, ...result, extensao: ctx.extensao,
                error: `Ferramentas faltando: ${result.ferramentas_faltando.join(', ')}`,
            });
        }

        const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(chapaIdx + 1).padStart(2, '0')}`;
        const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + ctx.extensao;

        res.json({ ok: true, ...result, extensao: ctx.extensao, filename, chapa_idx: chapaIdx });
    } catch (err) {
        console.error('Erro G-code chapa:', err);
        res.status(500).json({ error: 'Erro ao gerar G-code' });
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
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
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
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
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
            original.z_aproximacao_rapida ?? 5.0, original.ordenar_contornos || 'menor_primeiro');

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
    const { codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao } = req.body;
    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    const r = db.prepare(`INSERT INTO cnc_usinagem_tipos (user_id, codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, codigo, nome, categoria_match || '', diametro_match ?? null, prioridade ?? 5, fase || 'interna', tool_code_padrao || '', profundidade_padrao ?? null, largura_padrao ?? null);
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
    res.json({ id: Number(r.lastInsertRowid) });
});

router.delete('/retalhos/:id', requireAuth, (req, res) => {
    db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
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
        atualizado_em=CURRENT_TIMESTAMP WHERE id=1`).run(
        c.espaco_pecas ?? 7,
        c.peca_min_largura ?? 200, c.peca_min_comprimento ?? 200,
        c.considerar_sobra ?? 1, c.sobra_min_largura ?? 300, c.sobra_min_comprimento ?? 600,
        c.kerf_padrao ?? 4, c.usar_guilhotina ?? 1, c.usar_retalhos ?? 1, c.iteracoes_otimizador ?? 300
    );
    res.json({ ok: true });
});

export default router;
