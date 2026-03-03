import { Router } from 'express';
import db from '../db.js';
import { requireAuth, canSeeAll } from '../auth.js';
import { randomBytes } from 'crypto';
import { buildMateriaisOrcados } from './estoque.js';
import { createNotification, logActivity } from '../services/notificacoes.js';

const router = Router();

// Helper: parse stored JSON field (backward compatible)
function parseOrcData(row) {
    if (!row) return row;
    try {
        const data = JSON.parse(row.mods_json || '{}');
        // New format: { ambientes, taxas, projeto, padroes, pagamento, prazo_entrega, endereco_obra, validade_proposta }
        if (data.ambientes) {
            row.ambientes = data.ambientes;
            row.taxas = data.taxas || null;
            row.projeto = data.projeto || row.ambiente || '';
            row.padroes = data.padroes || null;
            row.pagamento = data.pagamento || null;
            row.prazo_entrega = data.prazo_entrega || '';
            row.endereco_obra = data.endereco_obra || '';
            row.validade_proposta = data.validade_proposta || '';
            row.validade_dias = data.validade_dias || parseInt(data.validade_proposta) || 15;
            row.mods = []; // compat
        } else if (Array.isArray(data)) {
            // Legacy format: mods_json was just an array of modules
            row.mods = data;
            row.ambientes = [];
            row.taxas = null;
            row.padroes = null;
            row.pagamento = null;
            row.projeto = row.ambiente || '';
        } else {
            row.mods = [];
            row.ambientes = [];
            row.padroes = null;
            row.pagamento = null;
        }
    } catch (_) {
        row.mods = [];
        row.ambientes = [];
        row.padroes = null;
        row.pagamento = null;
    }
    return row;
}

// ═══════════════════════════════════════════════════════
// GET /api/orcamentos
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const sql = canSeeAll(req.user)
        ? `SELECT o.*, u.nome as criado_por FROM orcamentos o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.atualizado_em DESC`
        : `SELECT o.*, u.nome as criado_por FROM orcamentos o LEFT JOIN users u ON o.user_id = u.id WHERE o.user_id = ? ORDER BY o.atualizado_em DESC`;
    const params = canSeeAll(req.user) ? [] : [req.user.id];
    const rows = db.prepare(sql).all(...params);
    rows.forEach(r => parseOrcData(r));
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// POST /api/orcamentos/aditivo — criar aditivo vinculado
// ═══════════════════════════════════════════════════════
router.post('/aditivo', requireAuth, (req, res) => {
    const { parent_id, motivo } = req.body;
    if (!parent_id) return res.status(400).json({ error: 'parent_id obrigatório' });
    if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'Motivo/justificativa do aditivo é obrigatório' });

    const parent = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(parent_id);
    if (!parent) return res.status(404).json({ error: 'Orçamento pai não encontrado' });

    const LOCKED_COLS = ['ok', 'prod', 'done'];
    if (!LOCKED_COLS.includes(parent.kb_col)) {
        return res.status(400).json({ error: 'Só é possível criar aditivo de orçamento aprovado' });
    }

    // Contar aditivos existentes
    const count = db.prepare('SELECT COUNT(*) as n FROM orcamentos WHERE parent_orc_id = ?').get(parent_id).n;
    const adNum = `${parent.numero}-A${count + 1}`;

    // Copiar dados do pai (taxas, padrões), mas ambientes vazio
    let parentData = {};
    try { parentData = JSON.parse(parent.mods_json || '{}'); } catch (_) { }
    const modsJson = JSON.stringify({
        ambientes: [],
        taxas: parentData.taxas || null,
        projeto: parentData.projeto || parent.ambiente || '',
        padroes: parentData.padroes || null,
        pagamento: null,
        prazo_entrega: '',
        endereco_obra: parentData.endereco_obra || '',
        validade_proposta: '',
    });

    const result = db.prepare(`
        INSERT INTO orcamentos (user_id, cliente_id, cliente_nome, ambiente, mods_json, obs, custo_material, valor_venda, status, kb_col, numero, parent_orc_id, tipo, motivo_aditivo)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'rascunho', 'lead', ?, ?, 'aditivo', ?)
    `).run(
        req.user.id,
        parent.cliente_id,
        parent.cliente_nome || '',
        parentData.projeto || parent.ambiente || '',
        modsJson,
        `Aditivo do orçamento ${parent.numero}`,
        adNum,
        parent_id,
        motivo.trim()
    );

    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(result.lastInsertRowid);
    parseOrcData(orc);
    res.status(201).json(orc);
});

// ═══════════════════════════════════════════════════════
// GET /api/orcamentos/templates — listar templates de ambiente
// (DEVE ficar antes de /:id para não conflitar)
// ═══════════════════════════════════════════════════════
router.get('/templates', requireAuth, (req, res) => {
    const templates = db.prepare('SELECT * FROM ambiente_templates ORDER BY categoria, nome').all();
    res.json(templates);
});

// ═══════════════════════════════════════════════════════
// POST /api/orcamentos/templates — criar template de ambiente
// ═══════════════════════════════════════════════════════
router.post('/templates', requireAuth, (req, res) => {
    const { nome, descricao, categoria, json_data } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const result = db.prepare('INSERT INTO ambiente_templates (nome, descricao, categoria, json_data) VALUES (?, ?, ?, ?)')
        .run(nome, descricao || '', categoria || '', JSON.stringify(json_data || {}));
    res.json({ ok: true, id: Number(result.lastInsertRowid) });
});

// ═══════════════════════════════════════════════════════
// PUT /api/orcamentos/templates/:id — editar template
// ═══════════════════════════════════════════════════════
router.put('/templates/:id', requireAuth, (req, res) => {
    const { nome, descricao, categoria } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    db.prepare('UPDATE ambiente_templates SET nome = ?, descricao = ?, categoria = ? WHERE id = ?')
        .run(nome, descricao || '', categoria || '', parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// DELETE /api/orcamentos/templates/:id — deletar template
// ═══════════════════════════════════════════════════════
router.delete('/templates/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM ambiente_templates WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// POST /api/orcamentos/importar — importar JSON gerado pela IA
// Recebe formato simplificado e expande com catálogo real
// ═══════════════════════════════════════════════════════
router.post('/importar', requireAuth, (req, res) => {
    try {
        const { ambientes: ambientesIA } = req.body;
        if (!ambientesIA || !Array.isArray(ambientesIA) || ambientesIA.length === 0) {
            return res.status(400).json({ error: 'JSON inválido: campo "ambientes" (array) obrigatório' });
        }

        // Carregar catálogo completo
        const caixasDB = db.prepare("SELECT id, nome, json_data FROM modulos_custom WHERE tipo_item='caixa'").all();
        const compsDB = db.prepare("SELECT id, nome, json_data FROM modulos_custom WHERE tipo_item='componente'").all();

        const findCaixa = (nome) => {
            const n = (nome || '').toLowerCase().trim();
            return caixasDB.find(c => c.nome.toLowerCase().trim() === n);
        };
        const findComp = (nome) => {
            const n = (nome || '').toLowerCase().trim();
            return compsDB.find(c => c.nome.toLowerCase().trim() === n);
        };

        const uid = () => Math.random().toString(36).slice(2, 10);
        const warnings = [];
        const ambientesConvertidos = [];

        for (const ambIA of ambientesIA) {
            const amb = {
                id: uid(),
                nome: ambIA.nome || `Ambiente ${ambientesConvertidos.length + 1}`,
                tipo: 'calculadora',
                itens: [],
                paineis: [],
            };

            if (!ambIA.itens || !Array.isArray(ambIA.itens)) {
                warnings.push(`Ambiente "${amb.nome}": sem itens`);
                ambientesConvertidos.push(amb);
                continue;
            }

            for (const itemIA of ambIA.itens) {
                // ── Painel Ripado / Muxarabi → vai para paineis[], não itens[]
                const caixaNorm = (itemIA.caixa || '').toLowerCase().trim();
                const isPainel = caixaNorm === 'painel ripado' || caixaNorm === 'painel muxarabi' || caixaNorm === 'muxarabi';
                if (isPainel) {
                    const tipoP = caixaNorm.includes('muxarabi') ? 'muxarabi' : 'ripado';
                    amb.paineis.push({
                        id: uid(),
                        nome: itemIA.nome || (tipoP === 'muxarabi' ? 'Muxarabi' : 'Painel Ripado'),
                        tipo: tipoP,
                        L: itemIA.L || itemIA.largura || 2400,
                        A: itemIA.A || itemIA.altura || 2200,
                        qtd: itemIA.qtd || 1,
                        wV: itemIA.wV || 40, eV: itemIA.eV || 18, sV: itemIA.sV || 15,
                        wH: itemIA.wH || 40, eH: itemIA.eH || 18, sH: itemIA.sH || 15,
                        mesmasRipas: itemIA.mesmasRipas !== false,
                        temSubstrato: itemIA.temSubstrato !== false,
                        matRipaV: itemIA.matRipa || itemIA.matRipaV || '',
                        matRipaH: itemIA.matRipaH || '',
                        matSubstrato: itemIA.matSubstrato || '',
                    });
                    continue;
                }

                const cxRow = findCaixa(itemIA.caixa);
                if (!cxRow) {
                    warnings.push(`Caixa "${itemIA.caixa}" não encontrada no catálogo (ambiente: ${amb.nome})`);
                    continue;
                }
                const caixaDef = { db_id: cxRow.id, ...JSON.parse(cxRow.json_data) };
                const dimsAplic = caixaDef.dimsAplicaveis || ['L','A','P'];

                const dims = {
                    l: itemIA.largura || itemIA.L || 600,
                    a: dimsAplic.includes('A') ? (itemIA.altura || itemIA.A || (caixaDef.cat === 'especial' ? 2400 : 2200)) : 0,
                    p: dimsAplic.includes('P') ? (itemIA.profundidade || itemIA.P || 550) : 0,
                };

                const item = {
                    id: uid(),
                    caixaId: cxRow.id,
                    caixaDef: JSON.parse(JSON.stringify(caixaDef)),
                    nome: itemIA.nome || caixaDef.nome,
                    dims,
                    qtd: itemIA.qtd || 1,
                    mats: {
                        matInt: itemIA.matInt || itemIA.material_interno || 'mdf18',
                        matExt: itemIA.matExt || itemIA.material_externo || '',
                    },
                    componentes: [],
                };

                // Processar componentes
                if (itemIA.componentes && Array.isArray(itemIA.componentes)) {
                    for (const compIA of itemIA.componentes) {
                        const cpRow = findComp(compIA.nome || compIA.componente);
                        if (!cpRow) {
                            warnings.push(`Componente "${compIA.nome || compIA.componente}" não encontrado (item: ${item.nome})`);
                            continue;
                        }
                        const compDef = { db_id: cpRow.id, ...JSON.parse(cpRow.json_data) };

                        // Montar vars do componente
                        const vars = {};
                        if (compIA.vars) {
                            for (const [k, v] of Object.entries(compIA.vars)) { vars[k] = v; }
                        } else {
                            // Tentar mapear campos comuns
                            if (compIA.nPortas) vars.nPortas = compIA.nPortas;
                            if (compIA.Ap) vars.Ap = compIA.Ap;
                            if (compIA.ag) vars.ag = compIA.ag;
                            if (compIA.nBand) vars.nBand = compIA.nBand;
                        }

                        // Montar sub_itens (ativar/desativar ferragens)
                        const subItens = {};
                        (compDef.sub_itens || []).forEach(s => {
                            subItens[s.id] = s.defaultOn;
                        });
                        // Permitir override
                        if (compIA.subItens) {
                            for (const [k, v] of Object.entries(compIA.subItens)) { subItens[k] = v; }
                        }

                        item.componentes.push({
                            id: uid(),
                            compId: cpRow.id,
                            compDef: JSON.parse(JSON.stringify(compDef)),
                            qtd: compIA.qtd || 1,
                            vars,
                            matExtComp: compIA.matExtComp || compIA.material_frente || '',
                            subItens,
                        });
                    }
                }

                amb.itens.push(item);
            }

            ambientesConvertidos.push(amb);
        }

        res.json({
            ok: true,
            ambientes: ambientesConvertidos,
            warnings,
            stats: {
                ambientes: ambientesConvertidos.length,
                itens: ambientesConvertidos.reduce((s, a) => s + a.itens.length, 0),
                componentes: ambientesConvertidos.reduce((s, a) => s + a.itens.reduce((s2, i) => s2 + i.componentes.length, 0), 0),
            },
        });
    } catch (e) {
        console.error('Erro ao importar:', e);
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/orcamentos/:id
// ═══════════════════════════════════════════════════════
router.get('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const orc = db.prepare('SELECT o.*, u.nome as criado_por FROM orcamentos o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?').get(id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

    if (!canSeeAll(req.user) && orc.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    parseOrcData(orc);

    // Enriquecer com aditivos ou referência ao pai
    if (!orc.parent_orc_id) {
        // Orçamento original: incluir lista de aditivos com motivo e datas
        orc.aditivos = db.prepare("SELECT id, numero, kb_col, valor_venda, tipo, motivo_aditivo, criado_em FROM orcamentos WHERE parent_orc_id = ? AND tipo = 'aditivo' ORDER BY criado_em ASC").all(id);
        // Valor consolidado: original + soma dos aditivos
        const somaAditivos = orc.aditivos.reduce((s, a) => s + (a.valor_venda || 0), 0);
        orc.valor_consolidado = (orc.valor_venda || 0) + somaAditivos;
        // Versões: incluir todas as versões da cadeia
        const versoes = db.prepare(`
            SELECT id, numero, versao, versao_ativa, kb_col, valor_venda, custo_material, motivo_aditivo, criado_em
            FROM orcamentos WHERE parent_orc_id = ? AND tipo = 'versao' ORDER BY versao ASC
        `).all(id);
        if (versoes.length > 0) {
            orc.versoes = [{ id: orc.id, numero: orc.numero, versao: orc.versao || 1, versao_ativa: orc.versao_ativa ?? 1, kb_col: orc.kb_col, valor_venda: orc.valor_venda, custo_material: orc.custo_material, criado_em: orc.criado_em }, ...versoes];
        }
    } else if (orc.tipo === 'versao') {
        // Versão: incluir info da raiz + lista de versões
        const raiz = db.prepare('SELECT id, numero, cliente_nome, valor_venda, versao, versao_ativa, kb_col, custo_material, criado_em FROM orcamentos WHERE id = ?').get(orc.parent_orc_id);
        orc.parent_info = raiz || null;
        const versoes = db.prepare(`
            SELECT id, numero, versao, versao_ativa, kb_col, valor_venda, custo_material, motivo_aditivo, criado_em
            FROM orcamentos WHERE parent_orc_id = ? AND tipo = 'versao' ORDER BY versao ASC
        `).all(orc.parent_orc_id);
        orc.versoes = [{ id: raiz.id, numero: raiz.numero, versao: raiz.versao || 1, versao_ativa: raiz.versao_ativa ?? 1, kb_col: raiz.kb_col, valor_venda: raiz.valor_venda, custo_material: raiz.custo_material, criado_em: raiz.criado_em }, ...versoes];
        // Aditivos da versão ativa (se esta for a ativa)
        if (orc.versao_ativa) {
            orc.aditivos = db.prepare("SELECT id, numero, kb_col, valor_venda, tipo, motivo_aditivo, criado_em FROM orcamentos WHERE parent_orc_id = ? AND tipo = 'aditivo' ORDER BY criado_em ASC").all(id);
        }
    } else {
        // Aditivo: incluir info do pai
        const pai = db.prepare('SELECT id, numero, cliente_nome, valor_venda FROM orcamentos WHERE id = ?').get(orc.parent_orc_id);
        orc.parent_info = pai || null;
    }

    res.json(orc);
});

// ═══════════════════════════════════════════════════════
// GET /api/orcamentos/:id/aditivos
// ═══════════════════════════════════════════════════════
router.get('/:id/aditivos', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const rows = db.prepare('SELECT * FROM orcamentos WHERE parent_orc_id = ? ORDER BY criado_em ASC').all(id);
    rows.forEach(r => parseOrcData(r));
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// POST /api/orcamentos/:id/nova-versao — criar revisão
// ═══════════════════════════════════════════════════════
router.post('/:id/nova-versao', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { motivo } = req.body;

    const source = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!source) return res.status(404).json({ error: 'Orçamento não encontrado' });

    if (!canSeeAll(req.user) && source.user_id !== req.user.id)
        return res.status(403).json({ error: 'Sem permissão' });

    if (source.tipo === 'aditivo')
        return res.status(400).json({ error: 'Não é possível versionar um aditivo' });

    const LOCKED_COLS = ['ok', 'prod', 'done'];
    if (LOCKED_COLS.includes(source.kb_col))
        return res.status(400).json({ error: 'Orçamento aprovado — use Aditivo para alterações' });

    // Encontrar raiz da cadeia de versões
    const rootId = source.tipo === 'versao' ? source.parent_orc_id : source.id;
    const root = db.prepare('SELECT numero FROM orcamentos WHERE id = ?').get(rootId);

    const criarVersao = db.transaction(() => {
        // Calcular próxima versão DENTRO da transaction para evitar race condition
        const maxRow = db.prepare(`
            SELECT MAX(versao) as mv FROM orcamentos
            WHERE id = ? OR (parent_orc_id = ? AND tipo = 'versao')
        `).get(rootId, rootId);
        const novaVersao = (maxRow?.mv || 1) + 1;
        const novoNumero = `${root.numero}-R${novaVersao}`;

        // Marcar todas as versões da cadeia como substituídas
        db.prepare('UPDATE orcamentos SET versao_ativa = 0 WHERE id = ?').run(rootId);
        db.prepare("UPDATE orcamentos SET versao_ativa = 0 WHERE parent_orc_id = ? AND tipo = 'versao'").run(rootId);

        // Criar nova versão (cópia completa do source)
        const result = db.prepare(`
            INSERT INTO orcamentos (user_id, cliente_id, cliente_nome, ambiente, mods_json, obs,
                custo_material, valor_venda, status, kb_col, numero, data_vencimento,
                parent_orc_id, tipo, motivo_aditivo, versao, versao_ativa)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?, ?, ?, 'versao', ?, ?, 1)
        `).run(
            req.user.id, source.cliente_id, source.cliente_nome || '',
            source.ambiente, source.mods_json, source.obs || '',
            source.custo_material || 0, source.valor_venda || 0,
            source.kb_col || 'lead', novoNumero, source.data_vencimento || null,
            rootId, motivo || '', novaVersao
        );

        const newId = result.lastInsertRowid;

        // Migrar portal_tokens da cadeia para a nova versão
        db.prepare(`UPDATE portal_tokens SET orc_id = ? WHERE orc_id = ? OR orc_id IN (
            SELECT id FROM orcamentos WHERE parent_orc_id = ? AND tipo = 'versao'
        )`).run(newId, rootId, rootId);

        return { newId, novaVersao };
    });

    try {
        const { newId, novaVersao } = criarVersao();
        const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(newId);
        parseOrcData(orc);

        logActivity(req.user.id, req.user.nome, 'nova_versao',
            `Criou revisão ${novaVersao} do orçamento ${root.numero}`,
            newId, 'orcamento');

        res.status(201).json(orc);
    } catch (err) {
        console.error('Erro ao criar versão:', err);
        res.status(500).json({ error: 'Erro ao criar versão: ' + err.message });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/orcamentos/:id/ativar-versao — trocar versão ativa
// ═══════════════════════════════════════════════════════
router.put('/:id/ativar-versao', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

    if (!canSeeAll(req.user) && orc.user_id !== req.user.id)
        return res.status(403).json({ error: 'Sem permissão' });

    const LOCKED_COLS = ['ok', 'prod', 'done'];
    if (LOCKED_COLS.includes(orc.kb_col))
        return res.status(400).json({ error: 'Orçamento aprovado — não pode trocar versão ativa' });

    const rootId = orc.tipo === 'versao' ? orc.parent_orc_id : orc.id;

    const ativar = db.transaction(() => {
        // Desativar todas as versões da cadeia
        db.prepare('UPDATE orcamentos SET versao_ativa = 0 WHERE id = ?').run(rootId);
        db.prepare("UPDATE orcamentos SET versao_ativa = 0 WHERE parent_orc_id = ? AND tipo = 'versao'").run(rootId);
        // Ativar a versão selecionada
        db.prepare('UPDATE orcamentos SET versao_ativa = 1 WHERE id = ?').run(id);

        // Migrar portal_tokens para a versão ativa
        db.prepare(`UPDATE portal_tokens SET orc_id = ? WHERE orc_id = ? OR orc_id IN (
            SELECT id FROM orcamentos WHERE parent_orc_id = ? AND tipo = 'versao'
        )`).run(id, rootId, rootId);
    });

    try {
        ativar();
        logActivity(req.user.id, req.user.nome, 'ativar_versao',
            `Ativou versão ${orc.versao || 1} do orçamento ${orc.numero}`,
            id, 'orcamento');
        res.json({ ok: true, versao_ativa: id });
    } catch (err) {
        res.status(500).json({ error: 'Erro: ' + err.message });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/orcamentos/:id/versoes — listar versões
// ═══════════════════════════════════════════════════════
router.get('/:id/versoes', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const orc = db.prepare('SELECT id, tipo, parent_orc_id FROM orcamentos WHERE id = ?').get(id);
    if (!orc) return res.status(404).json({ error: 'Não encontrado' });

    const rootId = orc.tipo === 'versao' ? orc.parent_orc_id : orc.id;

    const versoes = db.prepare(`
        SELECT id, numero, versao, versao_ativa, kb_col, valor_venda, custo_material,
               motivo_aditivo, criado_em, atualizado_em
        FROM orcamentos
        WHERE (id = ? OR (parent_orc_id = ? AND tipo = 'versao'))
        ORDER BY versao ASC
    `).all(rootId, rootId);

    res.json(versoes);
});

// ═══════════════════════════════════════════════════════
// GET /api/orcamentos/:id/comparar/:id2 — dados para diff
// ═══════════════════════════════════════════════════════
router.get('/:id/comparar/:id2', requireAuth, (req, res) => {
    const id1 = parseInt(req.params.id);
    const id2 = parseInt(req.params.id2);

    const orc1 = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id1);
    const orc2 = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id2);
    if (!orc1 || !orc2) return res.status(404).json({ error: 'Orçamento não encontrado' });

    parseOrcData(orc1);
    parseOrcData(orc2);

    res.json({ v1: orc1, v2: orc2 });
});

// ═══════════════════════════════════════════════════════
// POST /api/orcamentos/:id/duplicar — cópia independente
// ═══════════════════════════════════════════════════════
router.post('/:id/duplicar', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const original = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!original) return res.status(404).json({ error: 'Orçamento não encontrado' });

    if (!canSeeAll(req.user) && original.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    // Copiar mods_json completo
    let modsData = {};
    try { modsData = JSON.parse(original.mods_json || '{}'); } catch (_) {}

    // Reset pagamento (parcelas) — cópia começa do zero
    modsData.pagamento = null;

    const modsJson = JSON.stringify(modsData);

    const result = db.prepare(`
        INSERT INTO orcamentos (user_id, cliente_id, cliente_nome, ambiente, mods_json, obs, custo_material, valor_venda, status, kb_col, numero, tipo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', 'lead', '', 'original')
    `).run(
        req.user.id,
        original.cliente_id,
        original.cliente_nome || '',
        modsData.projeto || original.ambiente || '',
        modsJson,
        original.obs ? `Cópia de ${original.numero || '#' + original.id}. ${original.obs}` : `Cópia de ${original.numero || '#' + original.id}`,
        original.custo_material || 0,
        original.valor_venda || 0
    );

    const newId = result.lastInsertRowid;
    // Auto-gerar número
    const ano = new Date().getFullYear();
    const autoNum = `ORN-${ano}-${String(newId).padStart(5, '0')}`;
    db.prepare('UPDATE orcamentos SET numero = ? WHERE id = ?').run(autoNum, newId);

    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(newId);
    parseOrcData(orc);

    logActivity(req.user.id, req.user.nome, 'duplicou_orcamento', `Duplicou orçamento ${original.numero || '#' + original.id} → ${autoNum}`, orc.id, 'orcamento');

    res.status(201).json(orc);
});

// ═══════════════════════════════════════════════════════
// POST /api/orcamentos
// ═══════════════════════════════════════════════════════
router.post('/', requireAuth, (req, res) => {
    const { cliente_id, cliente_nome, projeto, ambiente, ambientes, mods, taxas, padroes, pagamento, obs, custo_material, valor_venda, status, kb_col, numero, data_vencimento, prazo_entrega, endereco_obra, validade_proposta, validade_dias } = req.body;
    if (!cliente_id) return res.status(400).json({ error: 'Cliente obrigatório' });

    // Validar tipos numéricos
    const cm = Number(custo_material) || 0;
    const vv = Number(valor_venda) || 0;

    // Store everything in mods_json — new format includes ambientes + taxas + padroes + pagamento + campos proposta
    const modsJson = ambientes
        ? JSON.stringify({ ambientes, taxas: taxas || null, projeto: projeto || '', padroes: padroes || null, pagamento: pagamento || null, prazo_entrega: prazo_entrega || '', endereco_obra: endereco_obra || '', validade_proposta: validade_proposta || '', validade_dias: validade_dias || 15 })
        : JSON.stringify(mods || []);

    const result = db.prepare(`
    INSERT INTO orcamentos (user_id, cliente_id, cliente_nome, ambiente, mods_json, obs, custo_material, valor_venda, status, kb_col, numero, data_vencimento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        req.user.id, cliente_id, cliente_nome || '', projeto || ambiente || '',
        modsJson, obs || '', cm, vv,
        status || 'rascunho', kb_col || 'lead',
        numero || '', data_vencimento || null
    );

    const newId = result.lastInsertRowid;

    // Auto-gerar número sequencial se não fornecido (ORN-AAAA-NNNNN)
    if (!numero) {
        const ano = new Date().getFullYear();
        const autoNum = `ORN-${ano}-${String(newId).padStart(5, '0')}`;
        db.prepare('UPDATE orcamentos SET numero = ? WHERE id = ?').run(autoNum, newId);
    }

    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(newId);
    parseOrcData(orc);
    res.status(201).json(orc);
});

// ═══════════════════════════════════════════════════════
// PUT /api/orcamentos/:id
// ═══════════════════════════════════════════════════════
router.put('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado' });

    if (!canSeeAll(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    // ═══ Lock check: orçamento aprovado não pode ser editado sem force_unlock ═══
    const LOCKED_COLS = ['ok', 'prod', 'done'];
    if (LOCKED_COLS.includes(existing.kb_col) && !req.body.force_unlock) {
        return res.status(403).json({ error: 'Orçamento aprovado. Use o desbloqueio.', locked: true });
    }

    // ═══ Versão substituída não pode ser editada ═══
    if (existing.versao_ativa === 0) {
        return res.status(403).json({ error: 'Versão substituída — somente leitura', substituida: true });
    }

    const { cliente_id, cliente_nome, projeto, ambiente, ambientes, mods, taxas, padroes, pagamento, obs, custo_material, valor_venda, status, kb_col, numero, data_vencimento, prazo_entrega, endereco_obra, validade_proposta, validade_dias } = req.body;

    let modsJson;
    if (ambientes) {
        modsJson = JSON.stringify({ ambientes, taxas: taxas || null, projeto: projeto || '', padroes: padroes || null, pagamento: pagamento || null, prazo_entrega: prazo_entrega || '', endereco_obra: endereco_obra || '', validade_proposta: validade_proposta || '', validade_dias: validade_dias || 15 });
    } else if (mods) {
        modsJson = JSON.stringify(mods);
    } else {
        modsJson = existing.mods_json;
    }

    db.prepare(`
    UPDATE orcamentos SET
      cliente_id=?, cliente_nome=?, ambiente=?, mods_json=?, obs=?,
      custo_material=?, valor_venda=?, status=?, kb_col=?,
      numero=?, data_vencimento=?,
      atualizado_em=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
        cliente_id ?? existing.cliente_id,
        cliente_nome ?? existing.cliente_nome,
        projeto || ambiente || existing.ambiente,
        modsJson,
        obs ?? existing.obs,
        custo_material != null ? Number(custo_material) || 0 : existing.custo_material,
        valor_venda != null ? Number(valor_venda) || 0 : existing.valor_venda,
        status ?? existing.status,
        kb_col ?? existing.kb_col,
        numero ?? existing.numero,
        data_vencimento !== undefined ? data_vencimento : existing.data_vencimento,
        id
    );

    // uso_count atualizado apenas na criação (POST), não a cada save

    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    parseOrcData(orc);
    res.json(orc);
});

// ═══════════════════════════════════════════════════════
// DELETE /api/orcamentos/:id
// ═══════════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado' });

    if (!canSeeAll(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    // Verificar se tem projeto vinculado (não permitir exclusão)
    const projeto = db.prepare('SELECT id FROM projetos WHERE orc_id = ?').get(id);
    if (projeto) {
        return res.status(400).json({ error: 'Este orçamento possui um projeto vinculado. Remova o projeto antes de excluir o orçamento.' });
    }

    // Limpar registros dependentes em ordem (respeitar FKs)
    const cleanupOrc = (oid) => {
        // section_views depende de proposta_acessos — deletar primeiro
        db.prepare('DELETE FROM proposta_section_views WHERE orc_id = ?').run(oid);
        db.prepare('DELETE FROM proposta_acessos WHERE orc_id = ?').run(oid);
        db.prepare('DELETE FROM portal_tokens WHERE orc_id = ?').run(oid);
        db.prepare('DELETE FROM ia_followups WHERE orc_id = ?').run(oid);
        db.prepare('DELETE FROM contas_receber WHERE orc_id = ? AND projeto_id IS NULL').run(oid);
    };

    const deleteRelated = db.transaction(() => {
        // 1. Versões e aditivos filhos (e seus dependentes)
        const filhos = db.prepare('SELECT id FROM orcamentos WHERE parent_orc_id = ?').all(id);
        for (const f of filhos) {
            cleanupOrc(f.id);
            db.prepare('DELETE FROM orcamentos WHERE id = ?').run(f.id);
        }
        // 2. Limpar dependências do orçamento principal
        cleanupOrc(id);
        // 3. O orçamento em si
        db.prepare('DELETE FROM orcamentos WHERE id = ?').run(id);
    });

    try {
        deleteRelated();
        res.json({ ok: true });
    } catch (err) {
        console.error('Erro ao deletar orçamento:', err.message);
        res.status(500).json({ error: 'Erro ao remover orçamento: ' + err.message });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/orcamentos/:id/kanban — mover no pipeline
// ═══════════════════════════════════════════════════════
router.put('/:id/kanban', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { kb_col } = req.body;
    const existing = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado' });

    if (!canSeeAll(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    db.prepare('UPDATE orcamentos SET kb_col = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(kb_col, id);

    // ═══ Cascata: arquivo/perdido → mover aditivos e versões junto ═══
    if (['arquivo', 'perdido'].includes(kb_col) && existing.tipo !== 'aditivo') {
        db.prepare('UPDATE orcamentos SET kb_col = ?, atualizado_em = CURRENT_TIMESTAMP WHERE parent_orc_id = ?').run(kb_col, id);
    }

    // ═══ Restaurar: se for pai saindo de arquivo/perdido, restaurar filhos também ═══
    if (['arquivo', 'perdido'].includes(existing.kb_col) && !['arquivo', 'perdido'].includes(kb_col) && existing.tipo !== 'aditivo') {
        db.prepare(`UPDATE orcamentos SET kb_col = ?, atualizado_em = CURRENT_TIMESTAMP
                    WHERE parent_orc_id = ? AND kb_col IN ('arquivo', 'perdido')`).run(kb_col, id);
    }

    // ═══ Ao aprovar: arquivar versões substituídas da cadeia ═══
    if (kb_col === 'ok') {
        const rootId = existing.tipo === 'versao' ? existing.parent_orc_id : id;
        db.prepare(`UPDATE orcamentos SET kb_col = 'arquivo', atualizado_em = CURRENT_TIMESTAMP
                    WHERE versao_ativa = 0 AND tipo = 'versao' AND parent_orc_id = ?`).run(rootId);
        // Se a raiz também foi substituída, arquivá-la
        if (rootId !== id) {
            const raiz = db.prepare('SELECT versao_ativa FROM orcamentos WHERE id = ?').get(rootId);
            if (raiz && raiz.versao_ativa === 0) {
                db.prepare("UPDATE orcamentos SET kb_col = 'arquivo', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(rootId);
            }
        }
    }

    // ═══ Auto-criar projeto ao mover para "Aprovado" (ok) ═══
    let projeto_criado = null;
    if (kb_col === 'ok') {
        const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);

        // ═══ ADITIVO: vincular ao projeto do pai (não criar projeto novo) ═══
        if (orc.tipo === 'aditivo' && orc.parent_orc_id) {
            const projPai = db.prepare('SELECT id FROM projetos WHERE orc_id = ?').get(orc.parent_orc_id);
            if (projPai) {
                // Gerar contas a receber vinculadas ao projeto do pai (evitar duplicatas)
                const jaTemParcelas = db.prepare('SELECT id FROM contas_receber WHERE orc_id = ? AND auto_gerada = 1').get(orc.id);
                if (!jaTemParcelas) {
                    try {
                        const data = JSON.parse(orc.mods_json || '{}');
                        const pagamento = data.pagamento || { desconto: { tipo: '%', valor: 0 }, blocos: [] };
                        const desconto = pagamento.desconto?.valor || 0;
                        const valorBase = orc.valor_venda || 0;
                        const valorFinal = pagamento.desconto?.tipo === '%'
                            ? valorBase * (1 - desconto / 100)
                            : Math.max(0, valorBase - desconto);

                        if (pagamento.blocos && pagamento.blocos.length > 0 && valorFinal > 0) {
                            const stmtCR = db.prepare(`
                                INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento, meio_pagamento, auto_gerada)
                                VALUES (?, ?, ?, ?, ?, ?, 1)
                            `);
                            const MEIO_LABEL = {
                                pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
                                cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
                                boleto: 'Boleto', cheque: 'Cheque',
                            };
                            const hoje = new Date();
                            let parcNum = 0;
                            for (const bloco of pagamento.blocos) {
                                const valorBloco = valorFinal * ((bloco.percentual || 0) / 100);
                                const nParcelas = Math.max(1, bloco.parcelas || 1);
                                const valorParcela = Math.round((valorBloco / nParcelas) * 100) / 100;

                                for (let i = 0; i < nParcelas; i++) {
                                    parcNum++;
                                    const venc = new Date(hoje);
                                    venc.setMonth(venc.getMonth() + i);
                                    const descr = nParcelas > 1
                                        ? `Aditivo ${orc.numero} – ${bloco.descricao || 'Parcela'} ${i + 1}/${nParcelas}`
                                        : `Aditivo ${orc.numero} – ${bloco.descricao || `Pagamento ${parcNum}`}`;
                                    stmtCR.run(
                                        projPai.id, orc.id, descr, valorParcela,
                                        venc.toISOString().slice(0, 10),
                                        MEIO_LABEL[bloco.meio] || bloco.meio || ''
                                    );
                                }
                            }
                        }
                    } catch (_) { /* erro ao importar parcelas do aditivo */ }
                }

                // Recalcular materiais_orcados do projeto pai (inclui aditivos)
                try {
                    const materiaisJson = buildMateriaisOrcados(orc.parent_orc_id);
                    if (materiaisJson && materiaisJson !== '[]') {
                        db.prepare('UPDATE projetos SET materiais_orcados = ? WHERE id = ?').run(materiaisJson, projPai.id);
                    }
                } catch (_) { /* erro ao recalcular lista de materiais */ }

                projeto_criado = projPai.id;
            }
        } else {
            // ═══ ORÇAMENTO NORMAL: criar projeto novo ═══
            const jaTemProjeto = db.prepare('SELECT id FROM projetos WHERE orc_id = ?').get(id);
            if (!jaTemProjeto) {
                const token = randomBytes(16).toString('hex');

                const r = db.prepare(`
                    INSERT INTO projetos (user_id, orc_id, cliente_id, nome, descricao, status, token)
                    VALUES (?, ?, ?, ?, ?, 'nao_iniciado', ?)
                `).run(
                    req.user.id,
                    id,
                    orc.cliente_id || null,
                    `${orc.cliente_nome || 'Projeto'} – ${orc.ambiente || 'Novo'}`,
                    `Projeto criado automaticamente do orçamento ${orc.numero || '#' + id}`,
                    token
                );

                const projId = r.lastInsertRowid;
                projeto_criado = projId;

                // Etapas padrão
                const ETAPAS_PADRAO = [
                    'Medição e levantamento',
                    'Aprovação do projeto',
                    'Compra de materiais',
                    'Produção',
                    'Acabamento',
                    'Entrega e instalação',
                ];
                const stmtE = db.prepare('INSERT INTO etapas_projeto (projeto_id, nome, ordem) VALUES (?, ?, ?)');
                ETAPAS_PADRAO.forEach((nome, i) => stmtE.run(projId, nome, i));

                // Popular materiais_orcados (lista de materiais) do orçamento
                try {
                    const materiaisJson = buildMateriaisOrcados(id);
                    if (materiaisJson && materiaisJson !== '[]') {
                        db.prepare('UPDATE projetos SET materiais_orcados = ? WHERE id = ?').run(materiaisJson, projId);
                    }
                } catch (_) { /* erro ao calcular lista de materiais não impede criação */ }

                // Auto-importar parcelas do pagamento como contas a receber
                try {
                    const data = JSON.parse(orc.mods_json || '{}');
                    const pagamento = data.pagamento || { desconto: { tipo: '%', valor: 0 }, blocos: [] };
                    const desconto = pagamento.desconto?.valor || 0;
                    const valorBase = orc.valor_venda || 0;
                    const valorFinal = pagamento.desconto?.tipo === '%'
                        ? valorBase * (1 - desconto / 100)
                        : Math.max(0, valorBase - desconto);

                    if (pagamento.blocos && pagamento.blocos.length > 0 && valorFinal > 0) {
                        const stmtCR = db.prepare(`
                            INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento, meio_pagamento, auto_gerada)
                            VALUES (?, ?, ?, ?, ?, ?, 1)
                        `);
                        const MEIO_LABEL = {
                            pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
                            cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
                            boleto: 'Boleto', cheque: 'Cheque',
                        };
                        const hoje = new Date();
                        let parcNum = 0;
                        for (const bloco of pagamento.blocos) {
                            const valorBloco = valorFinal * ((bloco.percentual || 0) / 100);
                            const nParcelas = Math.max(1, bloco.parcelas || 1);
                            const valorParcela = Math.round((valorBloco / nParcelas) * 100) / 100;

                            for (let i = 0; i < nParcelas; i++) {
                                parcNum++;
                                const venc = new Date(hoje);
                                venc.setMonth(venc.getMonth() + i);
                                const descr = nParcelas > 1
                                    ? `${bloco.descricao || 'Parcela'} ${i + 1}/${nParcelas}`
                                    : bloco.descricao || `Pagamento ${parcNum}`;
                                stmtCR.run(
                                    projId, orc.id, descr, valorParcela,
                                    venc.toISOString().slice(0, 10),
                                    MEIO_LABEL[bloco.meio] || bloco.meio || ''
                                );
                            }
                        }
                    }
                } catch (_) { /* erro ao importar parcelas não impede criação */ }
            }
        }
    }

    // ═══ Log de atividade e notificações ═══
    try {
        const orc = db.prepare('SELECT numero, cliente_nome, ambiente, valor_venda FROM orcamentos WHERE id = ?').get(id);
        const label = orc?.numero || `#${id}`;
        const cliente = orc?.cliente_nome || '';

        logActivity(req.user.id, req.user.nome, 'mover_pipeline',
            `Moveu orçamento ${label} de ${cliente} para "${kb_col}"`,
            id, 'orcamento', { old_col: existing.kb_col, new_col: kb_col });

        if (kb_col === 'ok') {
            createNotification('orcamento_aprovado',
                `Orçamento aprovado: ${label}`,
                `${cliente} · ${orc?.ambiente || 'Projeto'}`,
                id, 'orcamento', cliente, req.user.id);
        }
        if (projeto_criado) {
            createNotification('projeto_criado',
                `Projeto criado: ${cliente || 'Novo projeto'}`,
                `Criado automaticamente do orçamento ${label}`,
                projeto_criado, 'projeto', cliente, req.user.id);
            logActivity(req.user.id, req.user.nome, 'criar',
                `Projeto criado automaticamente: ${cliente} (orç. ${label})`,
                projeto_criado, 'projeto', { orc_id: id });
        }
    } catch (_) { /* log não bloqueia */ }

    res.json({ ok: true, projeto_criado });
});

export default router;
