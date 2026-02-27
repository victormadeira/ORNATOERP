import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { logActivity } from '../services/notificacoes.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const router = Router();

// ═══════════════════════════════════════════════════
// CATEGORIAS DE DESPESA
// ═══════════════════════════════════════════════════
const CATEGORIAS = [
    'material', 'mao_de_obra', 'transporte', 'terceirizado',
    'ferramentas', 'acabamento', 'instalacao', 'outros',
];

// ═══════════════════════════════════════════════════════════
// GET /api/financeiro/lembretes — contas vencidas/próximas (global, para badge)
// DEVE vir antes de /:projeto_id para evitar conflito
// ═══════════════════════════════════════════════════════════
router.get('/lembretes', requireAuth, (req, res) => {
    const vencidas = db.prepare(`
        SELECT cr.*, p.nome as projeto_nome
        FROM contas_receber cr
        JOIN projetos p ON p.id = cr.projeto_id
        WHERE cr.status = 'pendente' AND cr.data_vencimento < date('now')
        ORDER BY cr.data_vencimento ASC
    `).all();

    const proximas = db.prepare(`
        SELECT cr.*, p.nome as projeto_nome
        FROM contas_receber cr
        JOIN projetos p ON p.id = cr.projeto_id
        WHERE cr.status = 'pendente'
        AND cr.data_vencimento >= date('now')
        AND cr.data_vencimento <= date('now', '+7 days')
        ORDER BY cr.data_vencimento ASC
    `).all();

    res.json({
        vencidas: vencidas.length,
        proximas_7dias: proximas.length,
        total: vencidas.length + proximas.length,
        itens: [...vencidas.map(v => ({ ...v, tipo_alerta: 'vencida' })), ...proximas.map(v => ({ ...v, tipo_alerta: 'proxima' }))],
    });
});

// ═══════════════════════════════════════════════════
// CONTAS A PAGAR — CRUD completo
// ═══════════════════════════════════════════════════

const CATEGORIAS_PAGAR = [
    'material', 'mao_de_obra', 'aluguel', 'energia', 'agua',
    'internet', 'telefone', 'impostos', 'manutencao', 'transporte',
    'ferramentas', 'terceirizado', 'marketing', 'software', 'outros',
];

// GET /api/financeiro/pagar — listar contas a pagar com filtros
router.get('/pagar', requireAuth, (req, res) => {
    const { status, categoria, periodo_inicio, periodo_fim, projeto_id, pago_inicio, pago_fim } = req.query;
    let sql = `SELECT cp.*, p.nome as projeto_nome,
               (SELECT COUNT(*) FROM contas_pagar_anexos WHERE conta_pagar_id = cp.id) as anexos_count
               FROM contas_pagar cp LEFT JOIN projetos p ON p.id = cp.projeto_id WHERE 1=1`;
    const params = [];

    if (status) { sql += ' AND cp.status = ?'; params.push(status); }
    if (categoria) { sql += ' AND cp.categoria = ?'; params.push(categoria); }
    if (periodo_inicio) { sql += ' AND cp.data_vencimento >= ?'; params.push(periodo_inicio); }
    if (periodo_fim) { sql += ' AND cp.data_vencimento <= ?'; params.push(periodo_fim); }
    if (projeto_id) {
        if (projeto_id === '0') { sql += ' AND cp.projeto_id IS NULL'; }
        else { sql += ' AND cp.projeto_id = ?'; params.push(parseInt(projeto_id)); }
    }
    // Filtro por período de pagamento (para aba "Pagos/Arquivo")
    if (pago_inicio) { sql += ' AND cp.data_pagamento >= ?'; params.push(pago_inicio); }
    if (pago_fim) { sql += ' AND cp.data_pagamento <= ?'; params.push(pago_fim); }

    sql += ' ORDER BY cp.data_vencimento ASC, cp.criado_em DESC';

    const contas = db.prepare(sql).all(...params);

    // Marcar vencidas automaticamente
    const hoje = new Date().toISOString().slice(0, 10);
    contas.forEach(c => {
        if (c.status === 'pendente' && c.data_vencimento && c.data_vencimento < hoje) {
            c.vencida = true;
        }
    });

    res.json(contas);
});

// POST /api/financeiro/pagar — criar conta a pagar
router.post('/pagar', requireAuth, (req, res) => {
    const { descricao, valor, data_vencimento, categoria, fornecedor, meio_pagamento,
            codigo_barras, projeto_id, observacao, recorrente, frequencia, nf_numero, nf_chave } = req.body;
    if (!descricao || !valor) return res.status(400).json({ error: 'Descrição e valor obrigatórios' });

    const cat = CATEGORIAS_PAGAR.includes(categoria) ? categoria : 'outros';
    const r = db.prepare(`
        INSERT INTO contas_pagar (user_id, descricao, valor, data_vencimento, categoria, fornecedor,
                                  meio_pagamento, codigo_barras, projeto_id, observacao, recorrente, frequencia,
                                  nf_numero, nf_chave)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id, descricao, valor, data_vencimento || null, cat,
        fornecedor || '', meio_pagamento || '', codigo_barras || '',
        projeto_id ? parseInt(projeto_id) : null, observacao || '',
        recorrente ? 1 : 0, frequencia || '',
        nf_numero || '', nf_chave || ''
    );

    try {
        logActivity(req.user.id, req.user.nome, 'criar', `Criou conta a pagar "${descricao}" R$${Number(valor).toFixed(2)}`, r.lastInsertRowid, 'contas_pagar');
    } catch (_) { }

    res.json({ id: r.lastInsertRowid });
});

// POST /api/financeiro/pagar/parcelado — criar múltiplas parcelas de uma vez
router.post('/pagar/parcelado', requireAuth, (req, res) => {
    const { descricao, parcelas, categoria, fornecedor, meio_pagamento,
            codigo_barras, projeto_id, observacao, nf_numero, nf_chave } = req.body;

    if (!descricao || !parcelas || !Array.isArray(parcelas) || parcelas.length === 0) {
        return res.status(400).json({ error: 'Descrição e parcelas obrigatórias' });
    }

    const cat = CATEGORIAS_PAGAR.includes(categoria) ? categoria : 'outros';
    const total = parcelas.length;
    const ids = [];

    const stmt = db.prepare(`
        INSERT INTO contas_pagar (user_id, descricao, valor, data_vencimento, categoria, fornecedor,
                                  meio_pagamento, codigo_barras, projeto_id, observacao,
                                  parcela_num, parcela_total, grupo_parcela_id, nf_numero, nf_chave)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction(() => {
        for (let i = 0; i < total; i++) {
            const p = parcelas[i];
            const desc = `${descricao} (${i + 1}/${total})`;
            const r = stmt.run(
                req.user.id, desc, p.valor || 0, p.data_vencimento || null, cat,
                fornecedor || '', meio_pagamento || '', codigo_barras || '',
                projeto_id ? parseInt(projeto_id) : null, observacao || '',
                i + 1, total, null,
                nf_numero || '', nf_chave || ''
            );
            ids.push(r.lastInsertRowid);
        }

        // Definir grupo_parcela_id como o ID da primeira parcela
        if (ids.length > 0) {
            const grupoId = ids[0];
            const stmtGrupo = db.prepare('UPDATE contas_pagar SET grupo_parcela_id = ? WHERE id = ?');
            for (const id of ids) stmtGrupo.run(grupoId, id);
        }
    });

    insertAll();

    const valorTotal = parcelas.reduce((s, p) => s + (p.valor || 0), 0);
    try {
        logActivity(req.user.id, req.user.nome, 'criar', `Criou ${total} parcelas "${descricao}" R$${valorTotal.toFixed(2)}`, ids[0], 'contas_pagar');
    } catch (_) { }

    res.json({ ids, grupo_parcela_id: ids[0] });
});

// PUT /api/financeiro/pagar/:id — atualizar conta a pagar
router.put('/pagar/:id', requireAuth, (req, res) => {
    const { descricao, valor, data_vencimento, status, data_pagamento, categoria,
            fornecedor, meio_pagamento, codigo_barras, projeto_id, observacao,
            nf_numero, nf_chave } = req.body;

    const cat = CATEGORIAS_PAGAR.includes(categoria) ? categoria : undefined;
    const dataPgto = status === 'pago' && !data_pagamento
        ? new Date().toISOString().slice(0, 10)
        : (data_pagamento || null);

    db.prepare(`
        UPDATE contas_pagar
        SET descricao=?, valor=?, data_vencimento=?, status=?, data_pagamento=?,
            categoria=?, fornecedor=?, meio_pagamento=?, codigo_barras=?,
            projeto_id=?, observacao=?, nf_numero=?, nf_chave=?,
            atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(
        descricao, valor, data_vencimento || null, status || 'pendente', dataPgto,
        cat || 'outros', fornecedor || '', meio_pagamento || '', codigo_barras || '',
        projeto_id ? parseInt(projeto_id) : null, observacao || '',
        nf_numero || '', nf_chave || '',
        parseInt(req.params.id)
    );

    try {
        if (status === 'pago') {
            logActivity(req.user.id, req.user.nome, 'pagar', `Pagou conta "${descricao}" R$${Number(valor).toFixed(2)}`, parseInt(req.params.id), 'contas_pagar');
        }
    } catch (_) { }

    res.json({ ok: true });
});

// DELETE /api/financeiro/pagar/:id
router.delete('/pagar/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM contas_pagar WHERE id=?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// ANEXOS DE CONTAS A PAGAR
// ═══════════════════════════════════════════════════

// POST /api/financeiro/pagar/:id/anexos — upload base64
router.post('/pagar/:id/anexos', requireAuth, (req, res) => {
    const contaId = parseInt(req.params.id);
    const { arquivo, nome, tipo } = req.body;
    if (!arquivo || !nome) return res.status(400).json({ error: 'Arquivo e nome obrigatórios' });

    // Verificar que a conta existe
    const conta = db.prepare('SELECT id FROM contas_pagar WHERE id = ?').get(contaId);
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada' });

    // Criar diretório
    const dir = path.join(UPLOADS_DIR, 'financeiro', String(contaId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Sanitizar nome e salvar
    const safeName = nome.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ts = Date.now();
    const finalName = `${ts}_${safeName}`;
    const filePath = path.join(dir, finalName);

    const base64Data = arquivo.includes(',') ? arquivo.split(',')[1] : arquivo;
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    const r = db.prepare(`
        INSERT INTO contas_pagar_anexos (conta_pagar_id, user_id, nome, tipo, filename, tamanho)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(contaId, req.user.id, nome, tipo || 'boleto', finalName, buffer.length);

    res.json({ id: r.lastInsertRowid, filename: finalName, tamanho: buffer.length });
});

// GET /api/financeiro/pagar/:id/anexos — listar anexos da conta
router.get('/pagar/:id/anexos', requireAuth, (req, res) => {
    const contaId = parseInt(req.params.id);
    const anexos = db.prepare(`
        SELECT id, nome, tipo, filename, tamanho, criado_em FROM contas_pagar_anexos
        WHERE conta_pagar_id = ? ORDER BY criado_em DESC
    `).all(contaId);
    res.json(anexos);
});

// GET /api/financeiro/pagar/anexo/:contaId/:filename — servir arquivo
router.get('/pagar/anexo/:contaId/:filename', requireAuth, (req, res) => {
    const contaId = String(req.params.contaId).replace(/[^0-9]/g, '');
    const filename = path.basename(decodeURIComponent(req.params.filename));
    const filePath = path.join(UPLOADS_DIR, 'financeiro', contaId, filename);

    // Proteção contra path traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.pdf': 'application/pdf', '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
});

// DELETE /api/financeiro/pagar/anexos/:anexoId — deletar anexo
router.delete('/pagar/anexos/:anexoId', requireAuth, (req, res) => {
    const anexo = db.prepare('SELECT * FROM contas_pagar_anexos WHERE id = ?').get(parseInt(req.params.anexoId));
    if (!anexo) return res.status(404).json({ error: 'Anexo não encontrado' });

    // Deletar arquivo físico
    const filePath = path.join(UPLOADS_DIR, 'financeiro', String(anexo.conta_pagar_id), anexo.filename);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) { }

    db.prepare('DELETE FROM contas_pagar_anexos WHERE id = ?').run(parseInt(req.params.anexoId));
    res.json({ ok: true });
});

// GET /api/financeiro/pagar/resumo — resumo de contas a pagar
router.get('/pagar/resumo', requireAuth, (req, res) => {
    const total = db.prepare(`
        SELECT
            COALESCE(SUM(valor), 0) as total,
            COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as pago,
            COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) as pendente,
            COALESCE(SUM(CASE WHEN status = 'pendente' AND data_vencimento < date('now') THEN valor ELSE 0 END), 0) as vencido,
            COUNT(CASE WHEN status = 'pendente' AND data_vencimento < date('now') THEN 1 END) as qtd_vencidas,
            COALESCE(SUM(CASE WHEN status = 'pago' AND data_pagamento >= date('now', 'start of month') THEN valor ELSE 0 END), 0) as pago_mes,
            COALESCE(SUM(CASE WHEN status = 'pendente' AND data_vencimento >= date('now') AND data_vencimento <= date('now', '+7 days') THEN valor ELSE 0 END), 0) as vencer_7d,
            COUNT(CASE WHEN status = 'pendente' AND data_vencimento >= date('now') AND data_vencimento <= date('now', '+7 days') THEN 1 END) as qtd_vencer_7d
        FROM contas_pagar
    `).get();

    const porCategoria = db.prepare(`
        SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd
        FROM contas_pagar WHERE status = 'pendente'
        GROUP BY categoria ORDER BY total DESC
    `).all();

    res.json({ ...total, por_categoria: porCategoria });
});

// ═══════════════════════════════════════════════════
// CONTAS A RECEBER GLOBAL
// ═══════════════════════════════════════════════════

// GET /api/financeiro/receber — listar TODAS as contas a receber (global)
router.get('/receber', requireAuth, (req, res) => {
    const { status, projeto_id, periodo_inicio, periodo_fim } = req.query;
    let sql = `SELECT cr.*, p.nome as projeto_nome, p.token as projeto_token
               FROM contas_receber cr
               JOIN projetos p ON p.id = cr.projeto_id WHERE 1=1`;
    const params = [];

    if (status && status !== 'todos') { sql += ' AND cr.status = ?'; params.push(status); }
    if (projeto_id) { sql += ' AND cr.projeto_id = ?'; params.push(parseInt(projeto_id)); }
    if (periodo_inicio) { sql += ' AND cr.data_vencimento >= ?'; params.push(periodo_inicio); }
    if (periodo_fim) { sql += ' AND cr.data_vencimento <= ?'; params.push(periodo_fim); }

    sql += ' ORDER BY cr.data_vencimento ASC, cr.criado_em DESC';
    const contas = db.prepare(sql).all(...params);

    const hoje = new Date().toISOString().slice(0, 10);
    contas.forEach(c => {
        if (c.status === 'pendente' && c.data_vencimento && c.data_vencimento < hoje) {
            c.vencida = true;
        }
    });
    res.json(contas);
});

// POST /api/financeiro/receber — criar conta a receber global
router.post('/receber', requireAuth, (req, res) => {
    const { descricao, valor, data_vencimento, meio_pagamento, observacao,
            projeto_id, codigo_barras, nf_numero } = req.body;
    if (!descricao || !valor || !projeto_id) {
        return res.status(400).json({ error: 'Descrição, valor e projeto obrigatórios' });
    }
    const proj = db.prepare('SELECT id, orc_id FROM projetos WHERE id = ?').get(parseInt(projeto_id));
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const r = db.prepare(`
        INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento,
                                    meio_pagamento, observacao, codigo_barras, nf_numero, auto_gerada)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
        proj.id, proj.orc_id || null, descricao, parseFloat(valor),
        data_vencimento || null, meio_pagamento || '',
        observacao || '', codigo_barras || '', nf_numero || ''
    );
    try {
        logActivity(req.user.id, req.user.nome, 'criar', `Criou conta a receber "${descricao}" R$${Number(valor).toFixed(2)}`, r.lastInsertRowid, 'contas_receber');
    } catch (_) { }
    res.json({ id: r.lastInsertRowid });
});

// POST /api/financeiro/receber/parcelado — criar múltiplas parcelas a receber
router.post('/receber/parcelado', requireAuth, (req, res) => {
    const { descricao, parcelas, meio_pagamento, observacao,
            projeto_id, nf_numero } = req.body;
    if (!descricao || !parcelas || !Array.isArray(parcelas) || !projeto_id) {
        return res.status(400).json({ error: 'Descrição, parcelas e projeto obrigatórios' });
    }
    const proj = db.prepare('SELECT id, orc_id FROM projetos WHERE id = ?').get(parseInt(projeto_id));
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const total = parcelas.length;
    const ids = [];
    const stmt = db.prepare(`
        INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento,
                                    meio_pagamento, observacao, nf_numero,
                                    parcela_num, parcela_total, grupo_parcela_id, auto_gerada)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    db.transaction(() => {
        for (let i = 0; i < total; i++) {
            const p = parcelas[i];
            const desc = `${descricao} (${i + 1}/${total})`;
            const r = stmt.run(
                proj.id, proj.orc_id || null, desc, p.valor || 0,
                p.data_vencimento || null, meio_pagamento || '',
                observacao || '', nf_numero || '',
                i + 1, total, null
            );
            ids.push(r.lastInsertRowid);
        }
        if (ids.length > 0) {
            const grupoId = ids[0];
            const sg = db.prepare('UPDATE contas_receber SET grupo_parcela_id = ? WHERE id = ?');
            ids.forEach(id => sg.run(grupoId, id));
        }
    })();

    try {
        const valorTotal = parcelas.reduce((s, p) => s + (p.valor || 0), 0);
        logActivity(req.user.id, req.user.nome, 'criar', `Criou ${total} parcelas a receber "${descricao}" R$${valorTotal.toFixed(2)}`, ids[0], 'contas_receber');
    } catch (_) { }

    res.json({ ids, grupo_parcela_id: ids[0] });
});

// GET /api/financeiro/receber/resumo — resumo global de contas a receber
router.get('/receber/resumo', requireAuth, (req, res) => {
    const r = db.prepare(`
        SELECT
            COALESCE(SUM(valor), 0) as total,
            COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as recebido,
            COALESCE(SUM(CASE WHEN status != 'pago' THEN valor ELSE 0 END), 0) as pendente,
            COALESCE(SUM(CASE WHEN status != 'pago' AND data_vencimento < date('now') THEN valor ELSE 0 END), 0) as vencido,
            COUNT(CASE WHEN status != 'pago' AND data_vencimento < date('now') THEN 1 END) as qtd_vencidas,
            COALESCE(SUM(CASE WHEN status = 'pago' AND data_pagamento >= date('now', 'start of month') THEN valor ELSE 0 END), 0) as recebido_mes,
            COALESCE(SUM(CASE WHEN status != 'pago' AND data_vencimento >= date('now') AND data_vencimento <= date('now', '+7 days') THEN valor ELSE 0 END), 0) as vencer_7d
        FROM contas_receber
    `).get();
    res.json(r);
});

// ═══════════════════════════════════════════════════
// ARQUIVO DE NOTAS FISCAIS
// ═══════════════════════════════════════════════════

// GET /api/financeiro/nfs — lista todas as contas_pagar que têm NF + anexos tipo nota_fiscal
router.get('/nfs', requireAuth, (req, res) => {
    const { busca, periodo_inicio, periodo_fim } = req.query;

    let sql = `
        SELECT cp.id, cp.descricao, cp.valor, cp.data_vencimento, cp.data_pagamento,
               cp.status, cp.fornecedor, cp.categoria, cp.nf_numero, cp.nf_chave,
               cp.observacao, cp.projeto_id,
               p.nome as projeto_nome,
               (SELECT COUNT(*) FROM contas_pagar_anexos WHERE conta_pagar_id = cp.id AND tipo = 'nota_fiscal') as qtd_nf_anexos
        FROM contas_pagar cp
        LEFT JOIN projetos p ON p.id = cp.projeto_id
        WHERE (cp.nf_numero != '' OR cp.nf_chave != ''
               OR EXISTS(SELECT 1 FROM contas_pagar_anexos a WHERE a.conta_pagar_id = cp.id AND a.tipo = 'nota_fiscal'))
    `;
    const params = [];

    if (busca) {
        sql += ` AND (cp.nf_numero LIKE ? OR cp.nf_chave LIKE ? OR cp.fornecedor LIKE ? OR cp.descricao LIKE ?)`;
        const b = `%${busca}%`;
        params.push(b, b, b, b);
    }
    if (periodo_inicio) { sql += ' AND cp.data_vencimento >= ?'; params.push(periodo_inicio); }
    if (periodo_fim) { sql += ' AND cp.data_vencimento <= ?'; params.push(periodo_fim); }

    sql += ' ORDER BY cp.data_vencimento DESC, cp.criado_em DESC';
    const nfs = db.prepare(sql).all(...params);
    res.json(nfs);
});

// ═══════════════════════════════════════════════════
// FLUXO DE CAIXA
// ═══════════════════════════════════════════════════

// GET /api/financeiro/fluxo — fluxo de caixa mensal (12 meses)
router.get('/fluxo', requireAuth, (req, res) => {
    // Saídas realizadas por mês (contas_pagar pagas)
    const saidas = db.prepare(`
        SELECT strftime('%Y-%m', data_pagamento) as mes,
               COALESCE(SUM(valor), 0) as total
        FROM contas_pagar
        WHERE status = 'pago' AND data_pagamento IS NOT NULL
        AND data_pagamento >= date('now', '-11 months', 'start of month')
        GROUP BY mes ORDER BY mes ASC
    `).all();

    // Entradas realizadas por mês (contas_receber pagas)
    const entradas = db.prepare(`
        SELECT strftime('%Y-%m', data_pagamento) as mes,
               COALESCE(SUM(valor), 0) as total
        FROM contas_receber
        WHERE status = 'pago' AND data_pagamento IS NOT NULL
        AND data_pagamento >= date('now', '-11 months', 'start of month')
        GROUP BY mes ORDER BY mes ASC
    `).all();

    // Saídas previstas (pendentes futuros)
    const saidasPrev = db.prepare(`
        SELECT strftime('%Y-%m', data_vencimento) as mes,
               COALESCE(SUM(valor), 0) as total
        FROM contas_pagar
        WHERE status = 'pendente' AND data_vencimento >= date('now', 'start of month')
        AND data_vencimento < date('now', '+3 months')
        GROUP BY mes ORDER BY mes ASC
    `).all();

    // Entradas previstas (pendentes futuras)
    const entradasPrev = db.prepare(`
        SELECT strftime('%Y-%m', data_vencimento) as mes,
               COALESCE(SUM(valor), 0) as total
        FROM contas_receber
        WHERE status != 'pago' AND data_vencimento >= date('now', 'start of month')
        AND data_vencimento < date('now', '+3 months')
        GROUP BY mes ORDER BY mes ASC
    `).all();

    res.json({ saidas, entradas, saidas_previstas: saidasPrev, entradas_previstas: entradasPrev });
});

// ═══════════════════════════════════════════════════
// DESPESAS
// ═══════════════════════════════════════════════════

// GET /api/financeiro/:projeto_id/despesas
router.get('/:projeto_id/despesas', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const despesas = db.prepare(`
        SELECT d.*, u.nome as criado_por_nome
        FROM despesas_projeto d
        LEFT JOIN users u ON u.id = d.criado_por
        WHERE d.projeto_id = ?
        ORDER BY d.data DESC, d.criado_em DESC
    `).all(projeto_id);
    res.json(despesas);
});

// POST /api/financeiro/:projeto_id/despesas
router.post('/:projeto_id/despesas', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const { descricao, valor, data, categoria, fornecedor, observacao } = req.body;
    if (!descricao || !valor) return res.status(400).json({ error: 'Descrição e valor obrigatórios' });

    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    const r = db.prepare(`
        INSERT INTO despesas_projeto (projeto_id, descricao, valor, data, categoria, fornecedor, observacao, criado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projeto_id, descricao, valor, data || null, cat, fornecedor || '', observacao || '', req.user.id);

    try {
        const projNome = db.prepare('SELECT nome FROM projetos WHERE id = ?').get(projeto_id);
        logActivity(req.user.id, req.user.nome, 'registrar_despesa',
            `Registrou despesa "${descricao}" R$${Number(valor).toFixed(2)} no projeto "${projNome?.nome || projeto_id}"`,
            projeto_id, 'projeto', { despesa_id: r.lastInsertRowid, categoria: cat });
    } catch (_) { }

    res.json({ id: r.lastInsertRowid });
});

// PUT /api/financeiro/despesas/:id
router.put('/despesas/:id', requireAuth, (req, res) => {
    const { descricao, valor, data, categoria, fornecedor, observacao } = req.body;
    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    db.prepare(`
        UPDATE despesas_projeto
        SET descricao=?, valor=?, data=?, categoria=?, fornecedor=?, observacao=?
        WHERE id=?
    `).run(descricao, valor, data || null, cat, fornecedor || '', observacao || '', parseInt(req.params.id));
    res.json({ ok: true });
});

// DELETE /api/financeiro/despesas/:id
router.delete('/despesas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM despesas_projeto WHERE id=?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// CONTAS A RECEBER
// ═══════════════════════════════════════════════════

// GET /api/financeiro/:projeto_id/receber
router.get('/:projeto_id/receber', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const contas = db.prepare(`
        SELECT * FROM contas_receber
        WHERE projeto_id = ?
        ORDER BY data_vencimento ASC, criado_em ASC
    `).all(projeto_id);

    // Atualizar status de contas vencidas automaticamente
    const hoje = new Date().toISOString().slice(0, 10);
    contas.forEach(c => {
        if (c.status === 'pendente' && c.data_vencimento && c.data_vencimento < hoje) {
            c.status = 'atrasada';
        }
    });

    res.json(contas);
});

// POST /api/financeiro/:projeto_id/receber
router.post('/:projeto_id/receber', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const { descricao, valor, data_vencimento, meio_pagamento, observacao } = req.body;
    if (!descricao || !valor) return res.status(400).json({ error: 'Descrição e valor obrigatórios' });

    const proj = db.prepare('SELECT orc_id FROM projetos WHERE id = ?').get(projeto_id);

    const r = db.prepare(`
        INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento, meio_pagamento, observacao, auto_gerada)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(projeto_id, proj?.orc_id || null, descricao, valor, data_vencimento || null, meio_pagamento || '', observacao || '');

    res.json({ id: r.lastInsertRowid });
});

// PUT /api/financeiro/receber/:id — atualizar (marcar pago, editar, etc.)
router.put('/receber/:id', requireAuth, (req, res) => {
    const { descricao, valor, data_vencimento, status, data_pagamento, meio_pagamento, observacao } = req.body;

    // Se marcou como pago e não tem data de pagamento, usar hoje
    const dataPgto = status === 'pago' && !data_pagamento
        ? new Date().toISOString().slice(0, 10)
        : (data_pagamento || null);

    db.prepare(`
        UPDATE contas_receber
        SET descricao=?, valor=?, data_vencimento=?, status=?, data_pagamento=?, meio_pagamento=?, observacao=?
        WHERE id=?
    `).run(
        descricao, valor, data_vencimento || null, status || 'pendente',
        dataPgto, meio_pagamento || '', observacao || '',
        parseInt(req.params.id)
    );

    try {
        if (status === 'pago') {
            logActivity(req.user.id, req.user.nome, 'receber_pagamento',
                `Registrou recebimento "${descricao}" R$${Number(valor).toFixed(2)}`,
                parseInt(req.params.id), 'contas_receber');
        }
    } catch (_) { }

    res.json({ ok: true });
});

// DELETE /api/financeiro/receber/:id
router.delete('/receber/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM contas_receber WHERE id=?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// IMPORTAR PARCELAS DO ORÇAMENTO
// ═══════════════════════════════════════════════════
router.post('/:projeto_id/importar-parcelas', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const proj = db.prepare('SELECT * FROM projetos WHERE id = ?').get(projeto_id);
    if (!proj || !proj.orc_id) return res.status(400).json({ error: 'Projeto sem orçamento vinculado' });

    // Verificar se já importou
    const jaImportou = db.prepare(
        'SELECT COUNT(*) as c FROM contas_receber WHERE projeto_id = ? AND auto_gerada = 1'
    ).get(projeto_id);
    if (jaImportou.c > 0) return res.status(400).json({ error: 'Parcelas já importadas. Exclua as existentes primeiro.' });

    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(proj.orc_id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const data = JSON.parse(orc.mods_json || '{}');
    const pagamento = data.pagamento || { desconto: { tipo: '%', valor: 0 }, blocos: [] };

    const desconto = pagamento.desconto?.valor || 0;
    const valorBase = orc.valor_venda || 0;
    const valorFinal = pagamento.desconto?.tipo === '%'
        ? valorBase * (1 - desconto / 100)
        : Math.max(0, valorBase - desconto);

    if (!pagamento.blocos || pagamento.blocos.length === 0 || valorFinal <= 0) {
        return res.status(400).json({ error: 'Orçamento sem condições de pagamento definidas' });
    }

    const MEIO_LABEL = {
        pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
        cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
        boleto: 'Boleto', cheque: 'Cheque',
    };

    const stmt = db.prepare(`
        INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento, meio_pagamento, auto_gerada)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

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

            stmt.run(
                projeto_id, orc.id, descr, valorParcela,
                venc.toISOString().slice(0, 10),
                MEIO_LABEL[bloco.meio] || bloco.meio || ''
            );
        }
    }

    res.json({ ok: true, parcelas_criadas: parcNum });
});

// ═══════════════════════════════════════════════════
// RESUMO FINANCEIRO DO PROJETO
// ═══════════════════════════════════════════════════
router.get('/:projeto_id/resumo', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);

    const proj = db.prepare(`
        SELECT p.*, o.valor_venda, o.custo_material
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.id = ?
    `).get(projeto_id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Valor orçado (com desconto)
    let orcado = proj.valor_venda || 0;
    if (proj.orc_id) {
        try {
            const orc = db.prepare('SELECT mods_json FROM orcamentos WHERE id = ?').get(proj.orc_id);
            const data = JSON.parse(orc?.mods_json || '{}');
            const pag = data.pagamento || {};
            const desc = pag.desconto?.valor || 0;
            if (desc > 0) {
                orcado = pag.desconto?.tipo === '%'
                    ? orcado * (1 - desc / 100)
                    : Math.max(0, orcado - desc);
            }
        } catch (_) { }
    }

    // Despesas
    const despTotais = db.prepare(
        'SELECT COALESCE(SUM(valor), 0) as total FROM despesas_projeto WHERE projeto_id = ?'
    ).get(projeto_id);

    const despPorCategoria = db.prepare(
        'SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM despesas_projeto WHERE projeto_id = ? GROUP BY categoria ORDER BY total DESC'
    ).all(projeto_id);

    // Contas a receber
    const crTotais = db.prepare(`
        SELECT
            COALESCE(SUM(valor), 0) as total,
            COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as recebido,
            COALESCE(SUM(CASE WHEN status != 'pago' THEN valor ELSE 0 END), 0) as pendente,
            COALESCE(SUM(CASE WHEN status != 'pago' AND data_vencimento < date('now') THEN valor ELSE 0 END), 0) as vencido
        FROM contas_receber WHERE projeto_id = ?
    `).get(projeto_id);

    res.json({
        orcado: Math.round(orcado * 100) / 100,
        custo_material: proj.custo_material || 0,
        total_despesas: despTotais.total,
        total_receber: crTotais.total,
        total_recebido: crTotais.recebido,
        total_pendente: crTotais.pendente,
        total_vencido: crTotais.vencido,
        lucro_estimado: Math.round((orcado - despTotais.total) * 100) / 100,
        despesas_por_categoria: despPorCategoria,
    });
});

export default router;
