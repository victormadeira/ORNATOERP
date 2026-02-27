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
        orc.aditivos = db.prepare('SELECT id, numero, kb_col, valor_venda, tipo, motivo_aditivo, criado_em FROM orcamentos WHERE parent_orc_id = ? ORDER BY criado_em ASC').all(id);
        // Valor consolidado: original + soma dos aditivos
        const somaAditivos = orc.aditivos.reduce((s, a) => s + (a.valor_venda || 0), 0);
        orc.valor_consolidado = (orc.valor_venda || 0) + somaAditivos;
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
    const { cliente_id, cliente_nome, projeto, ambiente, ambientes, mods, taxas, padroes, pagamento, obs, custo_material, valor_venda, status, kb_col, numero, data_vencimento, prazo_entrega, endereco_obra, validade_proposta } = req.body;
    if (!cliente_id) return res.status(400).json({ error: 'Cliente obrigatório' });

    // Store everything in mods_json — new format includes ambientes + taxas + padroes + pagamento + campos proposta
    const modsJson = ambientes
        ? JSON.stringify({ ambientes, taxas: taxas || null, projeto: projeto || '', padroes: padroes || null, pagamento: pagamento || null, prazo_entrega: prazo_entrega || '', endereco_obra: endereco_obra || '', validade_proposta: validade_proposta || '' })
        : JSON.stringify(mods || []);

    const result = db.prepare(`
    INSERT INTO orcamentos (user_id, cliente_id, cliente_nome, ambiente, mods_json, obs, custo_material, valor_venda, status, kb_col, numero, data_vencimento)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        req.user.id, cliente_id, cliente_nome || '', projeto || ambiente || '',
        modsJson, obs || '', custo_material || 0, valor_venda || 0,
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

    const { cliente_id, cliente_nome, projeto, ambiente, ambientes, mods, taxas, padroes, pagamento, obs, custo_material, valor_venda, status, kb_col, numero, data_vencimento, prazo_entrega, endereco_obra, validade_proposta } = req.body;

    let modsJson;
    if (ambientes) {
        modsJson = JSON.stringify({ ambientes, taxas: taxas || null, projeto: projeto || '', padroes: padroes || null, pagamento: pagamento || null, prazo_entrega: prazo_entrega || '', endereco_obra: endereco_obra || '', validade_proposta: validade_proposta || '' });
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
        custo_material ?? existing.custo_material,
        valor_venda ?? existing.valor_venda,
        status ?? existing.status,
        kb_col ?? existing.kb_col,
        numero ?? existing.numero,
        data_vencimento !== undefined ? data_vencimento : existing.data_vencimento,
        id
    );

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

    // Limpar registros dependentes em ordem
    const deleteRelated = db.transaction(() => {
        // 1. Acessos de proposta
        db.prepare('DELETE FROM proposta_acessos WHERE orc_id = ?').run(id);
        // 2. Tokens do portal
        db.prepare('DELETE FROM portal_tokens WHERE orc_id = ?').run(id);
        // 3. Follow-ups da IA
        db.prepare('DELETE FROM ia_followups WHERE orc_id = ?').run(id);
        // 4. Contas a receber sem projeto (se tiver projeto, já bloqueou acima)
        db.prepare('DELETE FROM contas_receber WHERE orc_id = ? AND projeto_id IS NULL').run(id);
        // 5. Aditivos filhos (e seus dependentes)
        const filhos = db.prepare('SELECT id FROM orcamentos WHERE parent_orc_id = ?').all(id);
        for (const f of filhos) {
            db.prepare('DELETE FROM proposta_acessos WHERE orc_id = ?').run(f.id);
            db.prepare('DELETE FROM portal_tokens WHERE orc_id = ?').run(f.id);
            db.prepare('DELETE FROM ia_followups WHERE orc_id = ?').run(f.id);
            db.prepare('DELETE FROM contas_receber WHERE orc_id = ? AND projeto_id IS NULL').run(f.id);
            db.prepare('DELETE FROM orcamentos WHERE id = ?').run(f.id);
        }
        // 6. O orçamento em si
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

    // ═══ Cascata: arquivo/perdido → mover aditivos junto ═══
    if (['arquivo', 'perdido'].includes(kb_col) && existing.tipo !== 'aditivo') {
        db.prepare('UPDATE orcamentos SET kb_col = ?, atualizado_em = CURRENT_TIMESTAMP WHERE parent_orc_id = ?').run(kb_col, id);
    }

    // ═══ Restaurar: se for pai saindo de arquivo/perdido, restaurar aditivos também ═══
    if (['arquivo', 'perdido'].includes(existing.kb_col) && !['arquivo', 'perdido'].includes(kb_col) && existing.tipo !== 'aditivo') {
        // Restaurar aditivos que estavam arquivados/perdidos junto com o pai
        db.prepare(`UPDATE orcamentos SET kb_col = ?, atualizado_em = CURRENT_TIMESTAMP
                    WHERE parent_orc_id = ? AND kb_col IN ('arquivo', 'perdido')`).run(kb_col, id);
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
                } catch (_) { /* erro ao recalcular BOM */ }

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

                // Popular materiais_orcados com BOM do orçamento
                try {
                    const materiaisJson = buildMateriaisOrcados(id);
                    if (materiaisJson && materiaisJson !== '[]') {
                        db.prepare('UPDATE projetos SET materiais_orcados = ? WHERE id = ?').run(materiaisJson, projId);
                    }
                } catch (_) { /* erro ao calcular BOM não impede criação */ }

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
