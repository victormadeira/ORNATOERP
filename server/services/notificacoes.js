import db from '../db.js';

// ═══════════════════════════════════════════════════════
// HELPERS: Notificações + Log de Atividades
// ═══════════════════════════════════════════════════════

/**
 * Cria uma notificação visível a todos os usuários.
 */
export function createNotification(tipo, titulo, mensagem, referencia_id, referencia_tipo, referencia_extra = '', criado_por = null, expira_em = null) {
    try {
        const r = db.prepare(`
            INSERT INTO notificacoes (tipo, titulo, mensagem, referencia_id, referencia_tipo, referencia_extra, criado_por, expira_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tipo, titulo, mensagem || '', referencia_id || null, referencia_tipo || null, referencia_extra || '', criado_por, expira_em);
        return r.lastInsertRowid;
    } catch (err) {
        console.error('Erro ao criar notificação:', err.message);
        return null;
    }
}

/**
 * Registra uma atividade no log de auditoria.
 */
export function logActivity(user_id, user_nome, acao, descricao, referencia_id, referencia_tipo, detalhes = {}) {
    try {
        db.prepare(`
            INSERT INTO atividades (user_id, user_nome, acao, descricao, referencia_id, referencia_tipo, detalhes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(user_id, user_nome || 'Sistema', acao, descricao, referencia_id || null, referencia_tipo || null, JSON.stringify(detalhes));
    } catch (err) {
        console.error('Erro ao registrar atividade:', err.message);
    }
}

/**
 * Sincroniza notificações financeiras e de estoque com o estado atual do banco.
 * - Cria notificações para contas vencidas/próximas que ainda não têm
 * - Desativa notificações de contas já pagas
 * - Cria alertas de estoque baixo
 */
export function syncFinancialNotifications() {
    // 1. Desativar notificações de contas que já foram pagas ou não são mais pendentes
    db.prepare(`
        UPDATE notificacoes SET ativo = 0
        WHERE tipo IN ('financeiro_vencido', 'financeiro_proximo')
        AND ativo = 1
        AND referencia_tipo = 'contas_receber'
        AND referencia_id NOT IN (
            SELECT id FROM contas_receber WHERE status = 'pendente'
        )
    `).run();

    // 2. Promover 'financeiro_proximo' para 'financeiro_vencido' se já venceu
    const promover = db.prepare(`
        SELECT n.id, n.referencia_id FROM notificacoes n
        JOIN contas_receber cr ON cr.id = n.referencia_id
        WHERE n.tipo = 'financeiro_proximo' AND n.ativo = 1
        AND n.referencia_tipo = 'contas_receber'
        AND cr.data_vencimento < date('now')
    `).all();
    if (promover.length > 0) {
        const stmtUp = db.prepare('UPDATE notificacoes SET tipo = ?, titulo = REPLACE(titulo, \'Conta próxima\', \'Conta vencida\') WHERE id = ?');
        for (const p of promover) stmtUp.run('financeiro_vencido', p.id);
    }

    // 3. Criar notificações para contas vencidas sem notificação ativa
    const vencidas = db.prepare(`
        SELECT cr.id, cr.descricao, cr.valor, cr.data_vencimento, p.nome as projeto_nome
        FROM contas_receber cr
        JOIN projetos p ON p.id = cr.projeto_id
        WHERE cr.status = 'pendente'
        AND cr.data_vencimento < date('now')
        AND cr.id NOT IN (
            SELECT referencia_id FROM notificacoes
            WHERE tipo = 'financeiro_vencido' AND referencia_tipo = 'contas_receber' AND ativo = 1
        )
    `).all();

    const stmtInsert = db.prepare(`
        INSERT INTO notificacoes (tipo, titulo, mensagem, referencia_id, referencia_tipo, referencia_extra)
        VALUES (?, ?, ?, ?, 'contas_receber', ?)
    `);

    for (const v of vencidas) {
        stmtInsert.run(
            'financeiro_vencido',
            `Conta vencida: ${v.descricao}`,
            `R$ ${(v.valor || 0).toFixed(2)} · Venceu em ${v.data_vencimento} · ${v.projeto_nome}`,
            v.id,
            v.projeto_nome || ''
        );
    }

    // 4. Criar notificações para contas próximas (7 dias)
    const proximas = db.prepare(`
        SELECT cr.id, cr.descricao, cr.valor, cr.data_vencimento, p.nome as projeto_nome
        FROM contas_receber cr
        JOIN projetos p ON p.id = cr.projeto_id
        WHERE cr.status = 'pendente'
        AND cr.data_vencimento >= date('now')
        AND cr.data_vencimento <= date('now', '+7 days')
        AND cr.id NOT IN (
            SELECT referencia_id FROM notificacoes
            WHERE tipo IN ('financeiro_vencido', 'financeiro_proximo') AND referencia_tipo = 'contas_receber' AND ativo = 1
        )
    `).all();

    for (const p of proximas) {
        stmtInsert.run(
            'financeiro_proximo',
            `Conta próxima: ${p.descricao}`,
            `R$ ${(p.valor || 0).toFixed(2)} · Vence em ${p.data_vencimento} · ${p.projeto_nome}`,
            p.id,
            p.projeto_nome || ''
        );
    }

    // ─── CONTAS A PAGAR ───────────────────────────────────────────

    // 5. Desativar notificações de contas a pagar que já foram pagas
    db.prepare(`
        UPDATE notificacoes SET ativo = 0
        WHERE tipo IN ('pagar_vencido', 'pagar_proximo')
        AND ativo = 1
        AND referencia_tipo = 'contas_pagar'
        AND referencia_id NOT IN (
            SELECT id FROM contas_pagar WHERE status = 'pendente'
        )
    `).run();

    // 6. Promover 'pagar_proximo' para 'pagar_vencido' se já venceu
    const promoverPagar = db.prepare(`
        SELECT n.id, n.referencia_id FROM notificacoes n
        JOIN contas_pagar cp ON cp.id = n.referencia_id
        WHERE n.tipo = 'pagar_proximo' AND n.ativo = 1
        AND n.referencia_tipo = 'contas_pagar'
        AND cp.data_vencimento < date('now')
    `).all();
    if (promoverPagar.length > 0) {
        const stmtUpPagar = db.prepare("UPDATE notificacoes SET tipo = ?, titulo = REPLACE(titulo, 'próxima', 'vencida') WHERE id = ?");
        for (const p of promoverPagar) stmtUpPagar.run('pagar_vencido', p.id);
    }

    // 7. Criar notificações para contas a pagar vencidas sem alerta ativo
    const vencidasPagar = db.prepare(`
        SELECT cp.id, cp.descricao, cp.valor, cp.data_vencimento, cp.fornecedor,
               COALESCE(p.nome, '') as projeto_nome
        FROM contas_pagar cp
        LEFT JOIN projetos p ON p.id = cp.projeto_id
        WHERE cp.status = 'pendente'
        AND cp.data_vencimento < date('now')
        AND cp.id NOT IN (
            SELECT referencia_id FROM notificacoes
            WHERE tipo = 'pagar_vencido' AND referencia_tipo = 'contas_pagar' AND ativo = 1
        )
    `).all();

    const stmtInsertPagar = db.prepare(`
        INSERT INTO notificacoes (tipo, titulo, mensagem, referencia_id, referencia_tipo, referencia_extra)
        VALUES (?, ?, ?, ?, 'contas_pagar', ?)
    `);

    for (const v of vencidasPagar) {
        const ctx = v.fornecedor || v.projeto_nome || '';
        stmtInsertPagar.run(
            'pagar_vencido',
            `Conta a pagar vencida: ${v.descricao}`,
            `R$ ${(v.valor || 0).toFixed(2)} · Venceu em ${v.data_vencimento}${ctx ? ' · ' + ctx : ''}`,
            v.id,
            ctx
        );
    }

    // 8. Criar notificações para contas a pagar próximas (7 dias)
    const proximasPagar = db.prepare(`
        SELECT cp.id, cp.descricao, cp.valor, cp.data_vencimento, cp.fornecedor,
               COALESCE(p.nome, '') as projeto_nome
        FROM contas_pagar cp
        LEFT JOIN projetos p ON p.id = cp.projeto_id
        WHERE cp.status = 'pendente'
        AND cp.data_vencimento >= date('now')
        AND cp.data_vencimento <= date('now', '+7 days')
        AND cp.id NOT IN (
            SELECT referencia_id FROM notificacoes
            WHERE tipo IN ('pagar_vencido', 'pagar_proximo') AND referencia_tipo = 'contas_pagar' AND ativo = 1
        )
    `).all();

    for (const p of proximasPagar) {
        const ctx = p.fornecedor || p.projeto_nome || '';
        stmtInsertPagar.run(
            'pagar_proximo',
            `Conta a pagar próxima: ${p.descricao}`,
            `R$ ${(p.valor || 0).toFixed(2)} · Vence em ${p.data_vencimento}${ctx ? ' · ' + ctx : ''}`,
            p.id,
            ctx
        );
    }

    // ─── ESTOQUE ─────────────────────────────────────────────────

    // 9. Alertas de estoque baixo
    const estoqueBaixo = db.prepare(`
        SELECT e.material_id, b.nome, e.quantidade, e.quantidade_minima
        FROM estoque e
        JOIN biblioteca b ON b.id = e.material_id
        WHERE e.quantidade < e.quantidade_minima AND e.quantidade_minima > 0
        AND e.material_id NOT IN (
            SELECT referencia_id FROM notificacoes
            WHERE tipo = 'estoque_baixo' AND referencia_tipo = 'estoque' AND ativo = 1
        )
    `).all();

    for (const item of estoqueBaixo) {
        db.prepare(`
            INSERT INTO notificacoes (tipo, titulo, mensagem, referencia_id, referencia_tipo, referencia_extra)
            VALUES ('estoque_baixo', ?, ?, ?, 'estoque', ?)
        `).run(
            `Estoque baixo: ${item.nome}`,
            `Quantidade: ${item.quantidade} (mínimo: ${item.quantidade_minima})`,
            item.material_id,
            item.nome
        );
    }

    // 6. Desativar alertas de estoque que voltaram ao normal
    db.prepare(`
        UPDATE notificacoes SET ativo = 0
        WHERE tipo = 'estoque_baixo' AND ativo = 1 AND referencia_tipo = 'estoque'
        AND referencia_id NOT IN (
            SELECT e.material_id FROM estoque e
            WHERE e.quantidade < e.quantidade_minima AND e.quantidade_minima > 0
        )
    `).run();
}
