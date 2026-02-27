import db from '../db.js';
import { createNotification } from './notificacoes.js';

// ═══════════════════════════════════════════════════════
// AUTOMAÇÕES — Follow-up WhatsApp + Recorrência Financeira
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

// ═══════════════════════════════════════════════════════
// RECORRÊNCIA — Gerar contas a pagar recorrentes
// ═══════════════════════════════════════════════════════

function calcProximaData(dataAtual, frequencia) {
    const d = new Date(dataAtual + 'T12:00:00');
    switch (frequencia) {
        case 'semanal': d.setDate(d.getDate() + 7); break;
        case 'quinzenal': d.setDate(d.getDate() + 15); break;
        case 'mensal': d.setMonth(d.getMonth() + 1); break;
        case 'bimestral': d.setMonth(d.getMonth() + 2); break;
        case 'trimestral': d.setMonth(d.getMonth() + 3); break;
        case 'anual': d.setFullYear(d.getFullYear() + 1); break;
        default: d.setMonth(d.getMonth() + 1); break;
    }
    return d.toISOString().slice(0, 10);
}

function gerarContasRecorrentes() {
    try {
        // Buscar contas recorrentes cujo vencimento é em até 7 dias (ou já passou)
        // e que NÃO têm uma próxima conta já gerada com vencimento posterior
        const recorrentes = db.prepare(`
            SELECT cp.* FROM contas_pagar cp
            WHERE cp.recorrente = 1
            AND cp.frequencia != ''
            AND cp.data_vencimento <= date('now', '+7 days')
            AND NOT EXISTS (
                SELECT 1 FROM contas_pagar cp2
                WHERE cp2.recorrente = 1
                AND cp2.frequencia = cp.frequencia
                AND cp2.descricao = cp.descricao
                AND cp2.data_vencimento > cp.data_vencimento
                AND (
                    cp2.recorrencia_pai_id = cp.id
                    OR cp2.recorrencia_pai_id = cp.recorrencia_pai_id
                    OR (cp.recorrencia_pai_id IS NULL AND cp2.recorrencia_pai_id = cp.id)
                )
            )
        `).all();

        let geradas = 0;
        const stmt = db.prepare(`
            INSERT INTO contas_pagar (user_id, descricao, valor, data_vencimento, categoria, fornecedor,
                                      meio_pagamento, projeto_id, observacao, recorrente, frequencia, recorrencia_pai_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `);

        for (const cp of recorrentes) {
            const proximaData = calcProximaData(cp.data_vencimento, cp.frequencia);
            const paiId = cp.recorrencia_pai_id || cp.id;

            // Verificar se já existe conta com essa data para o mesmo "grupo"
            const jaExiste = db.prepare(`
                SELECT id FROM contas_pagar
                WHERE recorrencia_pai_id = ? AND data_vencimento = ?
            `).get(paiId, proximaData);

            if (jaExiste) continue;

            stmt.run(
                cp.user_id, cp.descricao, cp.valor, proximaData, cp.categoria,
                cp.fornecedor || '', cp.meio_pagamento || '',
                cp.projeto_id, cp.observacao || '',
                cp.frequencia, paiId
            );

            // Criar notificação
            const FREQ_LABELS = { semanal: 'semanal', quinzenal: 'quinzenal', mensal: 'mensal', bimestral: 'bimestral', trimestral: 'trimestral', anual: 'anual' };
            createNotification(
                'recorrencia_gerada',
                `Conta recorrente gerada: ${cp.descricao}`,
                `R$ ${cp.valor.toFixed(2)} · Vence em ${proximaData} · ${FREQ_LABELS[cp.frequencia] || cp.frequencia}`,
                cp.id, 'contas_pagar'
            );

            geradas++;
        }

        if (geradas > 0) {
            console.log(`  💰 Recorrência: ${geradas} conta(s) a pagar gerada(s)`);
        }
    } catch (err) {
        console.error('Erro ao gerar contas recorrentes:', err.message);
    }
}

export function iniciarAutomacoes() {
    console.log('  ⚡ Automações de follow-up + recorrência ativadas (intervalo: 1h)');

    // Executar a cada hora
    const interval = setInterval(executarRegras, 60 * 60 * 1000);

    // Primeira execução após 30 segundos (dar tempo do server iniciar)
    setTimeout(executarRegras, 30000);

    return interval;
}

async function executarRegras() {
    // ─── Recorrência financeira (sempre roda, independente de WhatsApp) ───
    gerarContasRecorrentes();

    // ─── Follow-ups WhatsApp (só se configurado) ───
    const emp = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();
    if (!emp?.wa_instance_url || !emp?.wa_api_key) {
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
