// ═══════════════════════════════════════════════════════
// SOFIA ESCALAÇÃO PÓS-HANDOFF
// 4 níveis, SLA diferenciado por temperatura do lead:
//   Nível 1 (alerta zero-custo): badge + WS broadcast
//   Nível 2 (holding template, zero LLM): mensagem-ponte
//   Nível 3 (retomada Sofia, modo limitado): pergunta prioridade
//   Nível 4 (abandono): marca como 'abandonada' para relatório
//
// Janela de envio: 9h-18h Seg-Sáb (reaproveita sofia.podeEnviarFollowup)
// ═══════════════════════════════════════════════════════

import db from '../db.js';
import evolution from './evolution.js';
import sofia from './sofia.js';

// ─── SLA (em minutos) por temperatura ───
// muito_quente >= 80, quente 60-79, morno 30-59, frio < 30
const SLA_POR_TEMPERATURA = {
    muito_quente: { n1: 30,  n2: 240,  n3: 720,  n4: 1440 }, // 30min / 4h / 12h / 24h
    quente:       { n1: 60,  n2: 480,  n3: 1080, n4: 1800 }, // 1h  / 8h  / 18h / 30h
    morno:        { n1: 120, n2: 720,  n3: 1440, n4: 2160 }, // 2h  / 12h / 24h / 36h
    frio:         { n1: 240, n2: 1440, n3: 2880, n4: 4320 }, // 4h  / 24h / 48h / 72h
};

export function classificarTemperatura(score) {
    const s = Number(score || 0);
    if (s >= 80) return 'muito_quente';
    if (s >= 60) return 'quente';
    if (s >= 30) return 'morno';
    return 'frio';
}

export function getSLA(temperatura, overrides = null) {
    const base = SLA_POR_TEMPERATURA[temperatura] || SLA_POR_TEMPERATURA.morno;
    if (overrides && typeof overrides === 'object' && overrides[temperatura]) {
        return { ...base, ...overrides[temperatura] };
    }
    return base;
}

function carregarConfig() {
    try {
        const cfg = db.prepare('SELECT escalacao_ativa, escalacao_config_json FROM empresa_config WHERE id = 1').get();
        if (!cfg) return { ativa: true, overrides: null };
        let overrides = null;
        try { overrides = JSON.parse(cfg.escalacao_config_json || '{}')?.sla || null; } catch {}
        return { ativa: cfg.escalacao_ativa !== 0, overrides };
    } catch {
        return { ativa: true, overrides: null };
    }
}

// ─── Texto holding (Nível 2) — interpolação pura ───
function textoHolding(nome) {
    const primeiroNome = (nome || '').trim().split(/\s+/)[0] || '';
    const vocativo = primeiroNome ? `, ${primeiroNome}` : '';
    return `Oi${vocativo}! Tô cuidando pra nossa equipe te retornar ainda hoje 🤍 Se quiser ir me contando mais sobre o que tá pensando pro seu projeto, vou adiantando pro time.`;
}

// ─── Texto retomada (Nível 3) — interpolação pura, sem LLM ───
function textoRetomada(nome) {
    const primeiroNome = (nome || '').trim().split(/\s+/)[0] || '';
    const vocativo = primeiroNome ? `, ${primeiroNome}` : '';
    return `Oi${vocativo}! Voltei pra te dar atenção enquanto a equipe chega. Não quero te deixar sem resposta 🤍 Rapidinho: esse projeto tem alguma prioridade? Tipo festa, mudança, entrega de obra — algo que faça a data importar?`;
}

function registrarEscalacao(conversaId, nivel, temperatura, score, motivo, mensagem, status = 'executado') {
    db.prepare(`
        INSERT INTO sofia_escalacoes (conversa_id, nivel, status, temperatura, score, motivo, mensagem, executado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(conversaId, nivel, status, temperatura, score, motivo, mensagem);
}

function minutosDesde(iso) {
    if (!iso) return null;
    return (Date.now() - new Date(iso).getTime()) / 60000;
}

// ─── Última mensagem do CLIENTE (entrada) ───
function ultimaMsgCliente(conversaId) {
    return db.prepare(`
        SELECT criado_em FROM chat_mensagens
        WHERE conversa_id = ? AND direcao = 'entrada'
        ORDER BY criado_em DESC LIMIT 1
    `).get(conversaId);
}

// ─── Última mensagem do HUMANO/IA (saída) ───
function ultimaMsgSaida(conversaId) {
    return db.prepare(`
        SELECT criado_em, remetente FROM chat_mensagens
        WHERE conversa_id = ? AND direcao = 'saida' AND interno = 0
        ORDER BY criado_em DESC LIMIT 1
    `).get(conversaId);
}

// ─── Cliente falou DEPOIS do handoff? Se sim, zerar escalação ───
function clienteFalouDepoisDoHandoff(conversa) {
    if (!conversa.handoff_em) return false;
    const ultCli = ultimaMsgCliente(conversa.id);
    if (!ultCli) return false;
    return new Date(ultCli.criado_em).getTime() > new Date(conversa.handoff_em).getTime();
}

// ─── Humano respondeu DEPOIS do handoff? ───
function humanoRespondeu(conversa) {
    if (!conversa.handoff_em) return false;
    const saida = db.prepare(`
        SELECT criado_em FROM chat_mensagens
        WHERE conversa_id = ? AND direcao = 'saida' AND remetente = 'humano' AND interno = 0
          AND criado_em > ?
        ORDER BY criado_em DESC LIMIT 1
    `).get(conversa.id, conversa.handoff_em);
    return !!saida;
}

// ─── Processar uma conversa ───
async function processarConversa(conversa, overrides) {
    const temperatura = classificarTemperatura(conversa.lead_score);
    const sla = getSLA(temperatura, overrides);

    // Pausas manuais
    if (conversa.aguardando_cliente === 1) return null;
    if (conversa.ia_bloqueada === 1) return null;
    if (conversa.abandonada === 1) return null;

    // Se cliente voltou a falar: humano reassume, zera escalação
    if (clienteFalouDepoisDoHandoff(conversa)) {
        if (conversa.escalacao_nivel > 0 || conversa.retomada_count > 0) {
            db.prepare(`UPDATE chat_conversas SET escalacao_nivel = 0, escalacao_ultima_em = NULL, retomada_count = 0 WHERE id = ?`).run(conversa.id);
        }
        return null;
    }

    // Se humano respondeu: handoff resolvido → limpar flag
    if (humanoRespondeu(conversa)) {
        db.prepare(`UPDATE chat_conversas SET handoff_em = NULL, escalacao_nivel = 0, escalacao_ultima_em = NULL, retomada_count = 0 WHERE id = ?`).run(conversa.id);
        return null;
    }

    // Quanto tempo desde handoff?
    const mins = minutosDesde(conversa.handoff_em);
    if (mins === null) return null;

    const nivelAtual = Number(conversa.escalacao_nivel || 0);
    const dest = conversa.wa_jid || conversa.wa_phone;

    // ─── Nível 4: abandono definitivo ───
    if (nivelAtual >= 3 && mins >= sla.n4) {
        db.prepare(`UPDATE chat_conversas SET escalacao_nivel = 4, escalacao_ultima_em = CURRENT_TIMESTAMP, abandonada = 1 WHERE id = ?`).run(conversa.id);
        registrarEscalacao(conversa.id, 4, temperatura, conversa.lead_score, 'timeout_final', '');
        return { nivel: 4, conversa_id: conversa.id };
    }

    // ─── Nível 3: retomada Sofia ───
    if (nivelAtual >= 2 && mins >= sla.n3) {
        if (!dest || dest.includes('@lid')) return null;
        if (!sofia.podeEnviarFollowup()) return null;
        if (Number(conversa.retomada_count || 0) >= 1) {
            // já enviou retomada antes — pula direto pra abandono no próximo ciclo
            db.prepare(`UPDATE chat_conversas SET escalacao_nivel = 3 WHERE id = ?`).run(conversa.id);
            return null;
        }
        const msg = textoRetomada(conversa.wa_name);
        try {
            await evolution.sendText(dest, msg);
            db.prepare(`
                INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
            `).run(conversa.id, msg);
            db.prepare(`UPDATE chat_conversas SET escalacao_nivel = 3, escalacao_ultima_em = CURRENT_TIMESTAMP, retomada_count = retomada_count + 1 WHERE id = ?`).run(conversa.id);
            registrarEscalacao(conversa.id, 3, temperatura, conversa.lead_score, 'retomada_sofia', msg);
            return { nivel: 3, conversa_id: conversa.id };
        } catch (e) {
            console.error(`[SofiaEsc] N3 erro conv=${conversa.id}:`, e.message);
            return null;
        }
    }

    // ─── Nível 2: holding template (zero LLM) ───
    if (nivelAtual >= 1 && mins >= sla.n2) {
        if (!dest || dest.includes('@lid')) return null;
        if (!sofia.podeEnviarFollowup()) return null;
        const msg = textoHolding(conversa.wa_name);
        try {
            await evolution.sendText(dest, msg);
            db.prepare(`
                INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
            `).run(conversa.id, msg);
            db.prepare(`UPDATE chat_conversas SET escalacao_nivel = 2, escalacao_ultima_em = CURRENT_TIMESTAMP WHERE id = ?`).run(conversa.id);
            registrarEscalacao(conversa.id, 2, temperatura, conversa.lead_score, 'holding_template', msg);
            return { nivel: 2, conversa_id: conversa.id };
        } catch (e) {
            console.error(`[SofiaEsc] N2 erro conv=${conversa.id}:`, e.message);
            return null;
        }
    }

    // ─── Nível 1: alerta zero-custo (badge + WS) ───
    if (nivelAtual === 0 && mins >= sla.n1) {
        db.prepare(`UPDATE chat_conversas SET escalacao_nivel = 1, escalacao_ultima_em = CURRENT_TIMESTAMP WHERE id = ?`).run(conversa.id);
        registrarEscalacao(conversa.id, 1, temperatura, conversa.lead_score, 'alerta_sem_resposta', '');
        return { nivel: 1, conversa_id: conversa.id, lead_score: conversa.lead_score, temperatura };
    }

    return null;
}

// ─── Loop principal ───
export async function processarEscalacoes(broadcast) {
    const { ativa, overrides } = carregarConfig();
    if (!ativa) return;

    const candidatas = db.prepare(`
        SELECT * FROM chat_conversas
        WHERE status = 'humano'
          AND handoff_em IS NOT NULL
          AND (abandonada IS NULL OR abandonada = 0)
          AND (aguardando_cliente IS NULL OR aguardando_cliente = 0)
    `).all();

    const resultados = [];
    for (const c of candidatas) {
        try {
            const r = await processarConversa(c, overrides);
            if (r) resultados.push(r);
        } catch (e) {
            console.error(`[SofiaEsc] erro conv=${c.id}:`, e.message);
        }
    }

    if (resultados.length > 0) {
        console.log(`[SofiaEsc] Processadas: ${resultados.length} escalações`, resultados.map(r => `#${r.conversa_id}→N${r.nivel}`).join(', '));
        if (typeof broadcast === 'function') {
            for (const r of resultados) {
                try { broadcast('sofia:escalacao', r); } catch {}
            }
        }
    }
}

// ─── Iniciar loop ───
export function iniciarSofiaEscalacao(app) {
    const broadcast = app?.locals?.wsBroadcast;
    setTimeout(() => processarEscalacoes(broadcast), 90 * 1000);  // 1ª em 90s
    setInterval(() => processarEscalacoes(broadcast), 15 * 60 * 1000); // a cada 15min
    console.log('  [OK] Sofia Escalação ativada (4 níveis, SLA por temperatura, loop 15min)');
}

export default {
    iniciarSofiaEscalacao,
    processarEscalacoes,
    classificarTemperatura,
    getSLA,
    SLA_POR_TEMPERATURA,
};
