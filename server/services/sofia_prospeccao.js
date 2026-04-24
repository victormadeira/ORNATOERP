// ═══════════════════════════════════════════════════════
// SOFIA PROSPECT — Prospecção ativa (outbound)
// Dispara 1ª mensagem ~2min após lead entrar + follow-up 24h depois.
// Respeita horário comercial. Para assim que o cliente responde.
// ═══════════════════════════════════════════════════════

import db from '../db.js';
import evolution from './evolution.js';
import sofia from './sofia.js';
import { callAI } from './ai.js';

function cfgProspeccao() {
    return db.prepare(
        'SELECT prospeccao_ativa, ia_prompt_prospeccao, prospeccao_delay_min, prospeccao_followup_horas, nome FROM empresa_config WHERE id = 1'
    ).get() || {};
}

// Calcula quando disparar a próxima msg, respeitando 9-18 Seg-Sáb.
// delayMin = 2 → +2 minutos. Se cair fora da janela, empurra pro próximo dia útil às 9h + 0-60min de jitter.
export function calcularAgendamento(delayMin = 2) {
    const agendadoMs = Date.now() + delayMin * 60 * 1000;
    let d = new Date(agendadoMs);

    // Checar se cai dentro da janela (TZ SP)
    while (true) {
        const spStr = d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const sp = new Date(spStr);
        const dia = sp.getDay();
        const hora = sp.getHours();

        if (dia === 0) {
            // Domingo → pular para segunda 9:00
            sp.setDate(sp.getDate() + 1);
            sp.setHours(9, Math.floor(Math.random() * 60), 0, 0);
            d = new Date(sp.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            return new Date(sp.getTime() - (sp.getTimezoneOffset() - new Date().getTimezoneOffset()) * 60000);
        }
        if (hora < 9) {
            sp.setHours(9, Math.floor(Math.random() * 60), 0, 0);
            return new Date(sp.getTime() - (sp.getTimezoneOffset() - new Date().getTimezoneOffset()) * 60000);
        }
        if (hora >= 18) {
            // Empurra pra próximo dia
            sp.setDate(sp.getDate() + 1);
            sp.setHours(9, Math.floor(Math.random() * 60), 0, 0);
            continue;
        }
        // Dentro da janela
        return d;
    }
}

// Cria task de prospecção inicial pra um lead recém-captado.
export function agendarProspeccaoInicial(clienteId, contexto = {}) {
    const cfg = cfgProspeccao();
    if (!cfg.prospeccao_ativa) return null;

    const delay = cfg.prospeccao_delay_min || 2;
    const quando = calcularAgendamento(delay);

    const r = db.prepare(`
        INSERT INTO prospeccao_tasks (cliente_id, tipo, status, agendado_para, mensagem_enviada, criado_em)
        VALUES (?, 'inicial', 'pending', ?, ?, CURRENT_TIMESTAMP)
    `).run(clienteId, quando.toISOString(), JSON.stringify(contexto || {}));

    console.log(`[Prospect] Task inicial #${r.lastInsertRowid} agendada p/ cliente ${clienteId} em ${quando.toISOString()}`);
    return r.lastInsertRowid;
}

// Cancela todas tasks pendentes de um cliente (ex: quando cliente respondeu).
export function cancelarTasksCliente(clienteId, motivo = 'cliente_respondeu') {
    const r = db.prepare(`
        UPDATE prospeccao_tasks
           SET status = 'cancelada', cancelado_em = CURRENT_TIMESTAMP, motivo_cancel = ?
         WHERE cliente_id = ? AND status = 'pending'
    `).run(motivo, clienteId);
    if (r.changes > 0) {
        console.log(`[Prospect] ${r.changes} task(s) cancelada(s) p/ cliente ${clienteId} (${motivo})`);
    }
    return r.changes;
}

// Gera texto da mensagem de prospecção via IA, usando prompt custom + dados do lead.
async function gerarMensagemProspeccao(cliente, contexto, tipo) {
    const cfg = cfgProspeccao();
    const promptBase = (cfg.ia_prompt_prospeccao || '').trim();
    if (!promptBase) {
        // Fallback: mensagem padrão simples (melhor do que falhar)
        const primeiroNome = (cliente.nome || '').split(' ')[0] || '';
        const empNome = cfg.nome || 'Studio Ornato';
        const saud = sofia.saudacaoAtual();
        if (tipo === 'followup1') {
            return `${saud}${primeiroNome ? ', ' + primeiroNome : ''}! Passando pra saber se faz sentido conversarmos sobre seu projeto de marcenaria. Se preferir continuar por aqui ou por telefone, só me dizer. ✨`;
        }
        return `${saud}${primeiroNome ? ', ' + primeiroNome : ''}! Aqui é a SofIA, da ${empNome}. Vi que você deixou seu contato no nosso site — quis dar um oi antes do nosso consultor te retornar. Posso te adiantar algumas perguntas pra agilizar o atendimento?`;
    }

    const ctx = contexto || {};
    const userMsg = `Tipo: ${tipo === 'followup1' ? 'FOLLOW-UP (segunda tentativa — cliente não respondeu na primeira)' : 'ABERTURA (primeira mensagem, prospecção ativa)'}
Cliente: ${cliente.nome || 'Cliente'}
Telefone: ${cliente.tel || ''}
${ctx.ambiente ? `Ambiente de interesse: ${ctx.ambiente}` : ''}
${ctx.bairro ? `Bairro: ${ctx.bairro}` : ''}
${ctx.estagio ? `Estágio do imóvel: ${ctx.estagio}` : ''}
${ctx.faixa_investimento ? `Faixa de investimento: ${ctx.faixa_investimento}` : ''}
${ctx.mensagem ? `Mensagem que deixou: ${ctx.mensagem}` : ''}

Gere APENAS o texto da mensagem que será enviada no WhatsApp. Sem aspas, sem comentários.`;

    try {
        const texto = await callAI(
            [{ role: 'user', content: userMsg }],
            promptBase,
            { temperature: 0.85, maxTokens: 400, contexto: `prospect_${tipo}` }
        );
        return (texto || '').trim();
    } catch (err) {
        console.error('[Prospect] Erro gerar mensagem IA:', err.message);
        return null;
    }
}

// Busca/cria conversa pra prospecção. Retorna { conversa, destJid }.
function prepararConversa(cliente) {
    const telLimpo = (cliente.tel || '').replace(/\D/g, '');
    if (!/^\d{10,13}$/.test(telLimpo)) return null;
    const phone = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;
    const jid = `${phone}@s.whatsapp.net`;

    let conv = db.prepare(
        'SELECT * FROM chat_conversas WHERE wa_phone = ? OR cliente_id = ? ORDER BY id DESC LIMIT 1'
    ).get(phone, cliente.id);

    if (!conv) {
        const r = db.prepare(`
            INSERT INTO chat_conversas (cliente_id, wa_phone, wa_jid, wa_name, status, nao_lidas, ultimo_msg_em)
            VALUES (?, ?, ?, ?, 'ia', 0, CURRENT_TIMESTAMP)
        `).run(cliente.id, phone, jid, cliente.nome || '', );
        conv = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(r.lastInsertRowid);
    }
    return { conversa: conv, destJid: jid, phone };
}

// Processa as tasks pendentes que já passaram do agendado_para.
export async function processarProspeccao() {
    const cfg = cfgProspeccao();
    if (!cfg.prospeccao_ativa) return;
    if (!sofia.podeEnviarFollowup()) return; // respeita janela 9-18 Seg-Sáb

    const tasks = db.prepare(`
        SELECT * FROM prospeccao_tasks
         WHERE status = 'pending' AND agendado_para <= datetime('now')
         ORDER BY agendado_para ASC
         LIMIT 10
    `).all();

    if (tasks.length === 0) return;

    let enviadas = 0;

    for (const task of tasks) {
        try {
            const cliente = db.prepare('SELECT id, nome, tel FROM clientes WHERE id = ?').get(task.cliente_id);
            if (!cliente) {
                db.prepare("UPDATE prospeccao_tasks SET status='cancelada', cancelado_em=CURRENT_TIMESTAMP, motivo_cancel='cliente_nao_existe' WHERE id=?").run(task.id);
                continue;
            }

            // Se cliente já respondeu desde a criação da task, cancelar
            if (task.conversa_id) {
                const respondeu = db.prepare(`
                    SELECT 1 FROM chat_mensagens
                     WHERE conversa_id = ? AND direcao = 'entrada' AND criado_em > ?
                     LIMIT 1
                `).get(task.conversa_id, task.criado_em);
                if (respondeu) {
                    db.prepare("UPDATE prospeccao_tasks SET status='cancelada', cancelado_em=CURRENT_TIMESTAMP, motivo_cancel='ja_respondeu' WHERE id=?").run(task.id);
                    continue;
                }
            }

            const prep = prepararConversa(cliente);
            if (!prep) {
                db.prepare("UPDATE prospeccao_tasks SET status='cancelada', cancelado_em=CURRENT_TIMESTAMP, motivo_cancel='tel_invalido' WHERE id=?").run(task.id);
                continue;
            }

            // Gerar mensagem com IA
            const contexto = (() => { try { return JSON.parse(task.mensagem_enviada || '{}'); } catch { return {}; } })();
            const texto = await gerarMensagemProspeccao(cliente, contexto, task.tipo);
            if (!texto) {
                // Não conseguiu gerar — deixar pending pra tentar de novo no próximo ciclo
                console.warn(`[Prospect] Task ${task.id} sem texto, reagendando +15min`);
                db.prepare("UPDATE prospeccao_tasks SET agendado_para=datetime('now','+15 minutes') WHERE id=?").run(task.id);
                continue;
            }

            // Enviar
            await evolution.sendText(prep.destJid, texto);

            // Persistir: mensagem + task + conversa
            db.prepare(`
                INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
            `).run(prep.conversa.id, texto);

            db.prepare(`
                UPDATE prospeccao_tasks
                   SET status='enviada', enviado_em=CURRENT_TIMESTAMP, conversa_id=?, mensagem_enviada=?
                 WHERE id=?
            `).run(prep.conversa.id, texto, task.id);

            db.prepare("UPDATE chat_conversas SET ultimo_msg_em=CURRENT_TIMESTAMP WHERE id=?").run(prep.conversa.id);

            enviadas++;
            console.log(`[Prospect] Enviado task #${task.id} (${task.tipo}) p/ ${cliente.nome}`);

            // Agendar follow-up (só se foi a inicial)
            if (task.tipo === 'inicial') {
                const horasFu = cfg.prospeccao_followup_horas || 24;
                const quandoFu = calcularAgendamento(horasFu * 60);
                db.prepare(`
                    INSERT INTO prospeccao_tasks (cliente_id, conversa_id, tipo, status, agendado_para, criado_em)
                    VALUES (?, ?, 'followup1', 'pending', ?, CURRENT_TIMESTAMP)
                `).run(cliente.id, prep.conversa.id, quandoFu.toISOString());
            }

        } catch (err) {
            console.error(`[Prospect] Erro task ${task.id}:`, err.message);
            // Reagendar em 30min em caso de falha transitória (ex: Evolution offline)
            try {
                db.prepare("UPDATE prospeccao_tasks SET agendado_para=datetime('now','+30 minutes') WHERE id=?").run(task.id);
            } catch (_) {}
        }
    }

    if (enviadas > 0) console.log(`[Prospect] Ciclo concluído — ${enviadas} mensagem(ns) enviada(s)`);
}

export function iniciarSofiaProspeccao() {
    setTimeout(processarProspeccao, 90 * 1000);
    setInterval(processarProspeccao, 2 * 60 * 1000);
    console.log('  [OK] Sofia Prospect ativado (janela 9h-18h Seg-Sáb, loop 2min)');
}

export default {
    agendarProspeccaoInicial,
    cancelarTasksCliente,
    processarProspeccao,
    iniciarSofiaProspeccao,
    calcularAgendamento,
};
