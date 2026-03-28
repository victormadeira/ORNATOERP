import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { validateId, asyncHandler, requireFields, sanitize } from '../lib/validation.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// FORNECEDORES
// ═══════════════════════════════════════════════════════

router.get('/fornecedores', requireAuth, (req, res) => {
    const { busca, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM fornecedores WHERE ativo = 1';
    const params = [];
    if (busca) { sql += ' AND (nome LIKE ? OR cnpj LIKE ?)'; params.push(`%${busca}%`, `%${busca}%`); }
    sql += ' ORDER BY nome ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit) || 50, parseInt(offset) || 0);
    const rows = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) as c FROM fornecedores WHERE ativo = 1').get().c;
    res.json({ data: rows, total });
});

router.post('/fornecedores', requireAuth, (req, res) => {
    const { nome, cnpj, telefone, email, endereco, cidade, estado, contato, obs } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const result = db.prepare(`INSERT INTO fornecedores (nome, cnpj, telefone, email, endereco, cidade, estado, contato, obs) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(sanitize(nome, 255), cnpj || '', telefone || '', email || '', endereco || '', cidade || '', estado || '', contato || '', obs || '');
    res.json(db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/fornecedores/:id', requireAuth, (req, res) => {
    const { nome, cnpj, telefone, email, endereco, cidade, estado, contato, obs } = req.body;
    db.prepare(`UPDATE fornecedores SET nome=?, cnpj=?, telefone=?, email=?, endereco=?, cidade=?, estado=?, contato=?, obs=? WHERE id=?`)
        .run(nome || '', cnpj || '', telefone || '', email || '', endereco || '', cidade || '', estado || '', contato || '', obs || '', req.params.id);
    res.json(db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(req.params.id));
});

router.delete('/fornecedores/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    db.prepare('UPDATE fornecedores SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// LEITOR XML DE NF-e (a feature mágica)
// ═══════════════════════════════════════════════════════

// Parser de XML de NF-e brasileira (schema SEFAZ)
function parseNFeXML(xmlString) {
    // Regex-based parser para NF-e (não precisa de lib XML — campos são bem definidos)
    const get = (tag) => {
        const m = xmlString.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
        return m ? m[1].trim() : '';
    };
    const getAll = (tag) => {
        const matches = [];
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
        let m;
        while ((m = regex.exec(xmlString)) !== null) matches.push(m[1]);
        return matches;
    };

    // Dados do emitente (fornecedor)
    const emit = xmlString.match(/<emit>([\s\S]*?)<\/emit>/i)?.[1] || '';
    const fornecedor = {
        nome: emit.match(/<xNome>([^<]*)<\/xNome>/i)?.[1] || '',
        cnpj: emit.match(/<CNPJ>([^<]*)<\/CNPJ>/i)?.[1] || '',
        ie: emit.match(/<IE>([^<]*)<\/IE>/i)?.[1] || '',
        endereco: (() => {
            const end = emit.match(/<enderEmit>([\s\S]*?)<\/enderEmit>/i)?.[1] || '';
            return {
                logradouro: end.match(/<xLgr>([^<]*)<\/xLgr>/i)?.[1] || '',
                numero: end.match(/<nro>([^<]*)<\/nro>/i)?.[1] || '',
                bairro: end.match(/<xBairro>([^<]*)<\/xBairro>/i)?.[1] || '',
                cidade: end.match(/<xMun>([^<]*)<\/xMun>/i)?.[1] || '',
                uf: end.match(/<UF>([^<]*)<\/UF>/i)?.[1] || '',
                cep: end.match(/<CEP>([^<]*)<\/CEP>/i)?.[1] || '',
            };
        })(),
        telefone: emit.match(/<fone>([^<]*)<\/fone>/i)?.[1] || '',
    };

    // Dados da NF
    const ide = xmlString.match(/<ide>([\s\S]*?)<\/ide>/i)?.[1] || '';
    const nf = {
        numero: ide.match(/<nNF>([^<]*)<\/nNF>/i)?.[1] || '',
        serie: ide.match(/<serie>([^<]*)<\/serie>/i)?.[1] || '',
        dataEmissao: ide.match(/<dhEmi>([^<]*)<\/dhEmi>/i)?.[1]?.slice(0, 10) || '',
        cfop: '',
    };

    // Chave de acesso (44 dígitos)
    const chave = xmlString.match(/<chNFe>([^<]*)<\/chNFe>/i)?.[1]
        || xmlString.match(/Id="NFe(\d{44})"/)?.[1] || '';

    // Totais
    const totais = xmlString.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/i)?.[1] || '';
    const valorTotal = parseFloat(totais.match(/<vNF>([^<]*)<\/vNF>/i)?.[1] || '0');
    const valorFrete = parseFloat(totais.match(/<vFrete>([^<]*)<\/vFrete>/i)?.[1] || '0');
    const valorDesc = parseFloat(totais.match(/<vDesc>([^<]*)<\/vDesc>/i)?.[1] || '0');

    // Itens (produtos)
    const itensXml = getAll('det');
    const itens = itensXml.map(det => {
        const prod = det.match(/<prod>([\s\S]*?)<\/prod>/i)?.[1] || '';
        return {
            codigo: prod.match(/<cProd>([^<]*)<\/cProd>/i)?.[1] || '',
            descricao: prod.match(/<xProd>([^<]*)<\/xProd>/i)?.[1] || '',
            ncm: prod.match(/<NCM>([^<]*)<\/NCM>/i)?.[1] || '',
            cfop: prod.match(/<CFOP>([^<]*)<\/CFOP>/i)?.[1] || '',
            unidade: prod.match(/<uCom>([^<]*)<\/uCom>/i)?.[1] || 'UN',
            quantidade: parseFloat(prod.match(/<qCom>([^<]*)<\/qCom>/i)?.[1] || '0'),
            valorUnitario: parseFloat(prod.match(/<vUnCom>([^<]*)<\/vUnCom>/i)?.[1] || '0'),
            valorTotal: parseFloat(prod.match(/<vProd>([^<]*)<\/vProd>/i)?.[1] || '0'),
        };
    });

    if (itens.length > 0) nf.cfop = itens[0].cfop;

    return { fornecedor, nf, chave, valorTotal, valorFrete, valorDesc, itens };
}

// POST /api/compras/xml-upload — Upload e parse de XML de NF-e
router.post('/xml-upload', requireAuth, asyncHandler(async (req, res) => {
    const { xml, projeto_id, orc_id } = req.body;
    if (!xml) return res.status(400).json({ error: 'XML obrigatório' });

    let parsed;
    try {
        parsed = parseNFeXML(xml);
    } catch (err) {
        return res.status(400).json({ error: 'XML inválido: ' + err.message });
    }

    if (!parsed.itens.length) return res.status(400).json({ error: 'NF sem itens' });

    // Verificar duplicidade pela chave de acesso
    if (parsed.chave) {
        const dup = db.prepare('SELECT id FROM nf_entrada WHERE chave_acesso = ?').get(parsed.chave);
        if (dup) return res.status(409).json({ error: 'NF já importada', nf_id: dup.id });
    }

    // Auto-criar ou vincular fornecedor
    let fornecedorId = null;
    if (parsed.fornecedor.cnpj) {
        const existing = db.prepare('SELECT id FROM fornecedores WHERE cnpj = ?').get(parsed.fornecedor.cnpj);
        if (existing) {
            fornecedorId = existing.id;
        } else {
            const fEnd = parsed.fornecedor.endereco;
            const result = db.prepare(`INSERT INTO fornecedores (nome, cnpj, telefone, endereco, cidade, estado) VALUES (?,?,?,?,?,?)`)
                .run(parsed.fornecedor.nome, parsed.fornecedor.cnpj, parsed.fornecedor.telefone,
                    `${fEnd.logradouro}, ${fEnd.numero} - ${fEnd.bairro}`, fEnd.cidade, fEnd.uf);
            fornecedorId = result.lastInsertRowid;
        }
    }

    // Inserir NF
    const nfResult = db.prepare(`INSERT INTO nf_entrada
        (fornecedor_id, numero_nf, serie, chave_acesso, data_emissao, valor_total, valor_frete, valor_desconto, cfop, xml_raw, projeto_id, orc_id, criado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(fornecedorId, parsed.nf.numero, parsed.nf.serie, parsed.chave, parsed.nf.dataEmissao,
            parsed.valorTotal, parsed.valorFrete, parsed.valorDesc, parsed.nf.cfop, xml,
            projeto_id || null, orc_id || null, req.user.id);
    const nfId = nfResult.lastInsertRowid;

    // Inserir itens e tentar vincular com biblioteca
    const itensResult = parsed.itens.map(item => {
        // Buscar match na biblioteca por código ou nome similar
        let bibliotecaId = null;
        let match = db.prepare('SELECT id, nome, preco FROM biblioteca WHERE cod = ? AND tipo = ?').get(item.codigo, 'material');
        if (!match) {
            // Busca fuzzy por nome
            match = db.prepare("SELECT id, nome, preco FROM biblioteca WHERE tipo = 'material' AND nome LIKE ? LIMIT 1")
                .get(`%${item.descricao.split(' ').slice(0, 3).join('%')}%`);
        }
        if (match) bibliotecaId = match.id;

        const r = db.prepare(`INSERT INTO nf_entrada_itens
            (nf_id, codigo_produto, descricao, ncm, cfop, unidade, quantidade, valor_unitario, valor_total, biblioteca_id, vinculado)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
            .run(nfId, item.codigo, item.descricao, item.ncm, item.cfop, item.unidade,
                item.quantidade, item.valorUnitario, item.valorTotal, bibliotecaId, bibliotecaId ? 1 : 0);

        return {
            id: r.lastInsertRowid,
            ...item,
            biblioteca_id: bibliotecaId,
            biblioteca_nome: match?.nome || null,
            preco_anterior: match?.preco || null,
            diferenca_preco: match?.preco ? ((item.valorUnitario - match.preco) / match.preco * 100).toFixed(1) : null,
        };
    });

    res.json({
        nf_id: nfId,
        fornecedor: { id: fornecedorId, nome: parsed.fornecedor.nome, cnpj: parsed.fornecedor.cnpj },
        nf: parsed.nf,
        valor_total: parsed.valorTotal,
        itens: itensResult,
        itens_vinculados: itensResult.filter(i => i.biblioteca_id).length,
        itens_novos: itensResult.filter(i => !i.biblioteca_id).length,
    });
}));

// POST /api/compras/xml-processar — Aplicar preços/estoque da NF importada
router.post('/xml-processar', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { nf_id, acoes } = req.body;
    // acoes: [{ item_id, acao: 'atualizar_preco' | 'entrada_estoque' | 'ignorar', biblioteca_id }]
    if (!nf_id || !acoes) return res.status(400).json({ error: 'nf_id e acoes obrigatórios' });

    const nf = db.prepare('SELECT * FROM nf_entrada WHERE id = ?').get(nf_id);
    if (!nf) return res.status(404).json({ error: 'NF não encontrada' });

    let precosAtualizados = 0, estoqueEntradas = 0;

    const processar = db.transaction(() => {
        for (const acao of acoes) {
            const item = db.prepare('SELECT * FROM nf_entrada_itens WHERE id = ? AND nf_id = ?').get(acao.item_id, nf_id);
            if (!item) continue;

            const bibId = acao.biblioteca_id || item.biblioteca_id;
            if (!bibId) continue;

            if (acao.acao === 'atualizar_preco' || acao.acao === 'ambos') {
                db.prepare('UPDATE biblioteca SET preco = ?, preco_atualizado_em = ? WHERE id = ?')
                    .run(item.valor_unitario, new Date().toISOString().slice(0, 10), bibId);
                precosAtualizados++;
            }

            if (acao.acao === 'entrada_estoque' || acao.acao === 'ambos') {
                // Atualizar ou criar registro no estoque
                const est = db.prepare('SELECT id, quantidade FROM estoque WHERE material_id = ?').get(bibId);
                if (est) {
                    db.prepare('UPDATE estoque SET quantidade = quantidade + ? WHERE id = ?').run(item.quantidade, est.id);
                } else {
                    db.prepare('INSERT INTO estoque (material_id, quantidade) VALUES (?, ?)').run(bibId, item.quantidade);
                }
                // Registrar movimentação
                db.prepare(`INSERT INTO movimentacoes_estoque (material_id, tipo, quantidade, observacao, projeto_id) VALUES (?,?,?,?,?)`)
                    .run(bibId, 'entrada', item.quantidade, `NF ${nf.numero_nf} - ${item.descricao}`, nf.projeto_id);
                estoqueEntradas++;
            }

            // Marcar item como vinculado
            db.prepare('UPDATE nf_entrada_itens SET vinculado = 1, biblioteca_id = ? WHERE id = ?').run(bibId, acao.item_id);
        }

        db.prepare('UPDATE nf_entrada SET processado = 1, status = ? WHERE id = ?').run('processado', nf_id);
    });

    processar();
    res.json({ ok: true, precos_atualizados: precosAtualizados, estoque_entradas: estoqueEntradas });
});

// GET /api/compras/nf — Listar NFs importadas
router.get('/nf', requireAuth, (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    const rows = db.prepare(`
        SELECT n.*, f.nome as fornecedor_nome,
               (SELECT COUNT(*) FROM nf_entrada_itens WHERE nf_id = n.id) as total_itens
        FROM nf_entrada n LEFT JOIN fornecedores f ON f.id = n.fornecedor_id
        ORDER BY n.criado_em DESC LIMIT ? OFFSET ?
    `).all(parseInt(limit) || 50, parseInt(offset) || 0);
    res.json(rows);
});

// GET /api/compras/nf/:id — Detalhe de NF com itens
router.get('/nf/:id', requireAuth, (req, res) => {
    const nf = db.prepare('SELECT n.*, f.nome as fornecedor_nome FROM nf_entrada n LEFT JOIN fornecedores f ON f.id = n.fornecedor_id WHERE n.id = ?').get(req.params.id);
    if (!nf) return res.status(404).json({ error: 'NF não encontrada' });
    nf.itens = db.prepare(`
        SELECT ni.*, b.nome as biblioteca_nome, b.preco as biblioteca_preco
        FROM nf_entrada_itens ni LEFT JOIN biblioteca b ON b.id = ni.biblioteca_id
        WHERE ni.nf_id = ?
    `).all(nf.id);
    res.json(nf);
});

// ═══════════════════════════════════════════════════════
// ORDENS DE COMPRA
// ═══════════════════════════════════════════════════════

// POST /api/compras/ordens — Gerar ordem de compra a partir de orçamento
router.post('/ordens', requireAuth, (req, res) => {
    const { fornecedor_id, projeto_id, orc_id, itens = [], data_necessidade, obs } = req.body;

    const valorTotal = itens.reduce((s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0), 0);
    const numero = `OC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const result = db.prepare(`INSERT INTO ordens_compra (fornecedor_id, projeto_id, orc_id, numero, valor_total, data_necessidade, obs, criado_por)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(fornecedor_id || null, projeto_id || null, orc_id || null, numero, valorTotal, data_necessidade || null, obs || '', req.user.id);
    const ordemId = result.lastInsertRowid;

    for (const item of itens) {
        db.prepare(`INSERT INTO ordens_compra_itens (ordem_id, biblioteca_id, descricao, quantidade, unidade, valor_unitario, valor_total)
            VALUES (?,?,?,?,?,?,?)`)
            .run(ordemId, item.biblioteca_id || null, item.descricao || '', item.quantidade || 0, item.unidade || 'UN', item.valor_unitario || 0, (item.quantidade || 0) * (item.valor_unitario || 0));
    }

    res.json({ id: ordemId, numero });
});

router.get('/ordens', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT oc.*, f.nome as fornecedor_nome, p.nome as projeto_nome,
               (SELECT COUNT(*) FROM ordens_compra_itens WHERE ordem_id = oc.id) as total_itens
        FROM ordens_compra oc
        LEFT JOIN fornecedores f ON f.id = oc.fornecedor_id
        LEFT JOIN projetos p ON p.id = oc.projeto_id
        ORDER BY oc.criado_em DESC LIMIT 100
    `).all();
    res.json(rows);
});

router.get('/ordens/:id', requireAuth, (req, res) => {
    const ordem = db.prepare('SELECT oc.*, f.nome as fornecedor_nome FROM ordens_compra oc LEFT JOIN fornecedores f ON f.id = oc.fornecedor_id WHERE oc.id = ?').get(req.params.id);
    if (!ordem) return res.status(404).json({ error: 'Ordem não encontrada' });
    ordem.itens = db.prepare('SELECT * FROM ordens_compra_itens WHERE ordem_id = ?').all(ordem.id);
    res.json(ordem);
});

// ═══════════════════════════════════════════════════════
// RELATÓRIOS DE COMPRAS
// ═══════════════════════════════════════════════════════

// ABC de Materiais — 20/80
router.get('/relatorios/abc', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT ni.descricao, SUM(ni.valor_total) as total_gasto, SUM(ni.quantidade) as total_qtd,
               COUNT(DISTINCT ni.nf_id) as total_nfs, ni.biblioteca_id, b.nome as material_nome
        FROM nf_entrada_itens ni
        LEFT JOIN biblioteca b ON b.id = ni.biblioteca_id
        GROUP BY COALESCE(ni.biblioteca_id, ni.descricao)
        ORDER BY total_gasto DESC
    `).all();
    const totalGeral = rows.reduce((s, r) => s + r.total_gasto, 0);
    let acumulado = 0;
    const abc = rows.map(r => {
        acumulado += r.total_gasto;
        const pct = totalGeral > 0 ? (r.total_gasto / totalGeral) * 100 : 0;
        const pctAcum = totalGeral > 0 ? (acumulado / totalGeral) * 100 : 0;
        const classe = pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C';
        return { ...r, pct: +pct.toFixed(1), pctAcumulado: +pctAcum.toFixed(1), classe };
    });
    res.json({ abc, totalGeral });
});

// Histórico de preço de um material
router.get('/relatorios/historico-preco/:bibliotecaId', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT ni.valor_unitario, ni.quantidade, n.data_emissao, n.numero_nf, f.nome as fornecedor
        FROM nf_entrada_itens ni
        JOIN nf_entrada n ON n.id = ni.nf_id
        LEFT JOIN fornecedores f ON f.id = n.fornecedor_id
        WHERE ni.biblioteca_id = ?
        ORDER BY n.data_emissao ASC
    `).all(req.params.bibliotecaId);
    res.json(rows);
});

export default router;
