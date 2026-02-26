import db from '../db.js';

// ═══════════════════════════════════════════════════════
// AUTOMAÇÕES — Follow-up WhatsApp + Notificações
// ═══════════════════════════════════════════════════════

const REGRAS = [
    {
        id: 'lead_sem_contato',
        nome: 'Lead sem contato (24h)',
        sql: `
            SELECT o.id, o.cliente_nome, o.numero, c.tel, c.nome as c_nome
            FROM orcamentos o
            JOIN clientes c ON c.id = o.cliente_id
            WHERE o.kb_col = 'lead'
            AND julianday('now') - julianday(o.criado_em) > 1
            AND julianday('now') - julianday(o.criado_em) < 3
            AND o.id NOT IN (SELECT referencia_id FROM automacoes_log WHERE tipo = 'followup_lead' AND referencia_tipo = 'orcamento')
        `,
        mensagem: (r, emp) =>
            `Olá ${(r.c_nome || r.cliente_nome || '').split(' ')[0]}! 😊\n\nSou da ${emp}. Vi que você demonstrou interesse em nossos serviços de móveis planejados.\n\nPosso te ajudar com alguma informação sobre orçamento ou projeto?\n\nFicarei feliz em atender! 🪵`,
        logTipo: 'followup_lead',
    },
    {
        id: 'proposta_sem_resposta',
        nome: 'Proposta sem resposta (3 dias)',
        sql: `
            SELECT o.id, o.cliente_nome, o.numero, o.valor_venda, c.tel, c.nome as c_nome
            FROM orcamentos o
            JOIN clientes c ON c.id = o.cliente_id
            WHERE o.kb_col = 'env'
            AND julianday('now') - julianday(o.atualizado_em) > 3
            AND julianday('now') - julianday(o.atualizado_em) < 7
            AND o.id NOT IN (SELECT referencia_id FROM automacoes_log WHERE tipo = 'followup_proposta' AND referencia_tipo = 'orcamento')
        `,
        mensagem: (r, emp) =>
            `Olá ${(r.c_nome || r.cliente_nome || '').split(' ')[0]}! 👋\n\nEspero que esteja bem! Passando para saber se você teve a oportunidade de analisar nossa proposta (${r.numero}).\n\nSe tiver alguma dúvida ou quiser ajustar algo, estou à disposição!\n\n${emp} 🪵`,
        logTipo: 'followup_proposta',
    },
    {
        id: 'orcamento_aprovado',
        nome: 'Orçamento aprovado (parabéns)',
        sql: `
            SELECT o.id, o.cliente_nome, o.numero, c.tel, c.nome as c_nome
            FROM orcamentos o
            JOIN clientes c ON c.id = o.cliente_id
            WHERE o.kb_col = 'ok'
            AND julianday('now') - julianday(o.atualizado_em) < 1
            AND o.id NOT IN (SELECT referencia_id FROM automacoes_log WHERE tipo = 'followup_aprovado' AND referencia_tipo = 'orcamento')
        `,
        mensagem: (r, emp) =>
            `Parabéns ${(r.c_nome || r.cliente_nome || '').split(' ')[0]}! 🎉\n\nSeu projeto foi aprovado! Estamos muito felizes em fazer parte dessa realização.\n\nPróximos passos:\n✅ Medição final\n✅ Compra de materiais\n✅ Início da produção\n\nEm breve entraremos em contato com o cronograma detalhado.\n\n${emp} 🪵`,
        logTipo: 'followup_aprovado',
    },
    {
        id: 'projeto_concluido',
        nome: 'Projeto concluído (avaliação)',
        sql: `
            SELECT p.id, p.nome, o.cliente_nome, c.tel, c.nome as c_nome
            FROM projetos p
            JOIN orcamentos o ON o.id = p.orc_id
            JOIN clientes c ON c.id = COALESCE(p.cliente_id, o.cliente_id)
            WHERE p.status = 'concluido'
            AND julianday('now') - julianday(p.atualizado_em) < 2
            AND p.id NOT IN (SELECT referencia_id FROM automacoes_log WHERE tipo = 'followup_concluido' AND referencia_tipo = 'projeto')
        `,
        mensagem: (r, emp) =>
            `Olá ${(r.c_nome || r.cliente_nome || '').split(' ')[0]}! 😊\n\nEsperamos que esteja amando seus novos móveis!\n\nSua opinião é muito importante para nós. Poderia avaliar nosso trabalho no Google? Isso nos ajuda muito! ⭐\n\nSe precisar de qualquer ajuste, estamos à disposição.\n\nObrigado pela confiança!\n${emp} 🪵`,
        logTipo: 'followup_concluido',
    },
];

async function enviarWhatsApp(url, instanceName, apiKey, phone, text) {
    const phoneClean = phone.replace(/\D/g, '');
    const phoneNumber = phoneClean.startsWith('55') ? phoneClean : `55${phoneClean}`;

    if (phoneNumber.length < 12) return { ok: false, error: 'Telefone inválido' };

    try {
        const resp = await fetch(`${url}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({ number: phoneNumber, text }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

export function iniciarAutomacoes() {
    console.log('  ⚡ Automações de follow-up ativadas (intervalo: 1h)');

    // Executar a cada hora
    const interval = setInterval(executarRegras, 60 * 60 * 1000);

    // Primeira execução após 30 segundos (dar tempo do server iniciar)
    setTimeout(executarRegras, 30000);

    return interval;
}

async function executarRegras() {
    const emp = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();
    if (!emp?.wa_instance_url || !emp?.wa_api_key) {
        // WhatsApp não configurado, skip silencioso
        return;
    }

    const empNome = emp.nome || 'Nossa Marcenaria';
    let totalEnviados = 0;

    for (const regra of REGRAS) {
        try {
            const rows = db.prepare(regra.sql).all();
            for (const r of rows) {
                if (!r.tel) continue;

                const msg = regra.mensagem(r, empNome);
                const result = await enviarWhatsApp(emp.wa_instance_url, emp.wa_instance_name, emp.wa_api_key, r.tel, msg);

                // Registrar log
                const refId = regra.logTipo.includes('concluido') ? r.id : r.id;
                const refTipo = regra.logTipo.includes('concluido') ? 'projeto' : 'orcamento';

                db.prepare(`
                    INSERT INTO automacoes_log (tipo, referencia_id, referencia_tipo, descricao, status, erro)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    regra.logTipo, refId, refTipo,
                    `${regra.nome}: ${r.cliente_nome || r.c_nome} (${r.tel})`,
                    result.ok ? 'enviado' : 'erro',
                    result.error || ''
                );

                if (result.ok) totalEnviados++;

                // Delay entre envios para não sobrecarregar API
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (err) {
            console.error(`Erro na regra ${regra.id}:`, err.message);
        }
    }

    if (totalEnviados > 0) {
        console.log(`  ⚡ Automações: ${totalEnviados} follow-up(s) enviado(s)`);
    }
}

export default { iniciarAutomacoes };
