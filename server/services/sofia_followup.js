// ═══════════════════════════════════════════════════════
// SOFIA FOLLOW-UP — Cadência "rápido + 1 reforço"
// Toque 1: ~3h após o cliente sumir (recupera quem só se distraiu)
// Toque 2: ~24h após sumir (último puxão, sem insistir mais)
//
// REGRA DE OURO: só PUXA assunto em horário comercial (9h-18h Seg-Sáb).
// Responder mensagens que chegam é 24/7 — isso é tratado no webhook, não aqui.
// ═══════════════════════════════════════════════════════

import db from '../db.js';
import wa from './wa.js';
import sofia from './sofia.js';

const H3 = 3 * 60 * 60 * 1000;
const H24 = 24 * 60 * 60 * 1000;
const DIAS5 = 5 * 24 * 60 * 60 * 1000;

// ── Copy dos toques (sem bajulação, máx 1 emoji, voz da Sofia) ──
function montarToque1(nome, ambiente) {
    const oi = nome ? `Oi, ${nome}!` : 'Oi!';
    if (ambiente) {
        return `${oi} Sei que o dia corre 🤍 Quando puder, me conta um pouco mais sobre ${ambiente} que a gente continua de onde parou.`;
    }
    return `${oi} A gente começou a conversar e o dia deve ter puxado por aí 🤍 Quando puder, me conta qual projeto você tem em mente.`;
}

function montarToque2(nome, ambiente) {
    const oi = nome ? `Oi, ${nome}!` : 'Oi!';
    if (ambiente) {
        return `${oi} Não quero te perder de vista 🤍 Se ainda fizer sentido pensar no seu ${ambiente}, é só me chamar que retomo na hora. Se não for o momento, fico por aqui pra quando precisar.`;
    }
    return `${oi} Passando só pra deixar a porta aberta 🤍 Quando quiser pensar no seu projeto de marcenaria sob medida, é só me chamar que a gente continua.`;
}

export async function processarFollowups() {
    // Só PUXA assunto dentro do horário comercial (9h-18h Seg-Sáb, nunca domingo)
    if (!sofia.podeEnviarFollowup()) return;

    const candidatas = db.prepare(`
        SELECT cc.*,
               (SELECT criado_em FROM chat_mensagens WHERE conversa_id = cc.id AND direcao = 'entrada' ORDER BY criado_em DESC LIMIT 1) as ultima_entrada,
               (SELECT criado_em FROM chat_mensagens WHERE conversa_id = cc.id AND direcao = 'saida' ORDER BY criado_em DESC LIMIT 1) as ultima_saida
        FROM chat_conversas cc
        WHERE cc.status = 'ia' AND cc.ia_bloqueada = 0
    `).all();

    const agora = Date.now();
    let enviados = 0;

    for (const c of candidatas) {
        // Precisa ter conversado: o cliente mandou algo e a Sofia respondeu por último
        if (!c.ultima_saida || !c.ultima_entrada) continue;
        if (new Date(c.ultima_saida).getTime() <= new Date(c.ultima_entrada).getTime()) continue;

        // Tempo de silêncio do cliente (desde a última mensagem DELE)
        const silencioMs = agora - new Date(c.ultima_entrada).getTime();
        // Nunca perseguir conversas antigas — evita enxurrada em convos esquecidas
        if (silencioMs > DIAS5) continue;

        const etapa = Number(c.followup_etapa || 0);
        let toque = 0;
        if (etapa === 0 && silencioMs >= H3) toque = 1;       // 1º toque ~3h
        else if (etapa === 1 && silencioMs >= H24) toque = 2;  // 2º toque ~24h
        else continue;

        const dest = c.wa_jid || c.wa_phone;
        if (!dest || dest.includes('@lid')) continue;

        const leadDados = JSON.parse(c.lead_dados || '{}');
        const nome = leadDados.nome?.split(' ')[0] || (c.wa_name ? c.wa_name.split(' ')[0] : '');
        const ambientes = Array.isArray(leadDados.ambientes) ? leadDados.ambientes : [];
        const ambiente = (ambientes[0] || '').toString().replace(/_/g, ' ');

        const msg = toque === 1 ? montarToque1(nome, ambiente) : montarToque2(nome, ambiente);

        try {
            await wa.sendText(dest, msg);
            db.prepare(`
                INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, status_envio, criado_em)
                VALUES (?, 'saida', 'texto', ?, 'ia', 'enviado', CURRENT_TIMESTAMP)
            `).run(c.id, msg);
            db.prepare('UPDATE chat_conversas SET followup_etapa = ?, followup_em = CURRENT_TIMESTAMP WHERE id = ?')
              .run(toque, c.id);
            enviados++;
            console.log(`[SofiaFollowup] toque ${toque} → conv #${c.id} (${nome || c.wa_phone})`);
        } catch (e) {
            console.error(`[SofiaFollowup] erro conv ${c.id}:`, e.message);
        }
    }

    if (enviados > 0) console.log(`[SofiaFollowup] Total: ${enviados} follow-up(s) enviado(s)`);
}

// ═══ Loop de verificação a cada 15 minutos ═══
export function iniciarSofiaFollowup() {
    setTimeout(processarFollowups, 60 * 1000);       // 1ª execução em 60s
    setInterval(processarFollowups, 15 * 60 * 1000); // a cada 15 min
    console.log('  [OK] Sofia Follow-up ativado (toques ~3h e ~24h, só puxa em horário comercial, loop 15min)');
}
