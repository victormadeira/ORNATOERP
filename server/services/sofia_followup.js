// ═══════════════════════════════════════════════════════
// SOFIA FOLLOW-UP — Mensagem única 24h após cliente sumir
// Respeita janela 9h-18h Seg-Sáb (nunca domingo)
// ═══════════════════════════════════════════════════════

import db from '../db.js';
import evolution from './evolution.js';
import sofia from './sofia.js';

// Idempotência: registra quais conversas já receberam follow-up
function jaReceberauFollowup(conversaId) {
    const row = db.prepare(
        "SELECT 1 FROM chat_mensagens WHERE conversa_id = ? AND remetente = 'ia' AND conteudo LIKE '%Ficou alguma d\u00favida%' LIMIT 1"
    ).get(conversaId);
    return !!row;
}

export async function processarFollowups() {
    // Só roda dentro da janela permitida
    if (!sofia.podeEnviarFollowup()) return;

    // Conversas em modo IA, com última mensagem do cliente há 24-48h, sem resposta do cliente depois
    const candidatas = db.prepare(`
        SELECT cc.*,
               (SELECT criado_em FROM chat_mensagens WHERE conversa_id = cc.id AND direcao = 'entrada' ORDER BY criado_em DESC LIMIT 1) as ultima_entrada,
               (SELECT criado_em FROM chat_mensagens WHERE conversa_id = cc.id AND direcao = 'saida' ORDER BY criado_em DESC LIMIT 1) as ultima_saida,
               (SELECT conteudo FROM chat_mensagens WHERE conversa_id = cc.id AND direcao = 'saida' ORDER BY criado_em DESC LIMIT 1) as ultima_saida_texto
        FROM chat_conversas cc
        WHERE cc.status = 'ia'
    `).all();

    const agora = Date.now();
    const H24 = 24 * 60 * 60 * 1000;
    const H48 = 48 * 60 * 60 * 1000;

    let enviados = 0;

    for (const c of candidatas) {
        // Nunca enviou mensagem saída? Não é candidata (não houve conversa ainda)
        if (!c.ultima_saida) continue;
        if (!c.ultima_entrada) continue;
        // Última mensagem foi da IA (cliente sumiu após nossa resposta)
        if (new Date(c.ultima_saida).getTime() <= new Date(c.ultima_entrada).getTime()) continue;

        const idade = agora - new Date(c.ultima_saida).getTime();
        if (idade < H24 || idade > H48) continue;

        if (jaReceberauFollowup(c.id)) continue;

        // Precisa ter JID válido pra envio
        const dest = c.wa_jid || c.wa_phone;
        if (!dest || dest.includes('@lid')) continue;

        // Texto personalizado
        const nome = c.wa_name ? c.wa_name.split(' ')[0] : '';
        const saudacao = sofia.saudacaoAtual();
        const msg = `${saudacao}${nome ? ', ' + nome : ''}! Ficou alguma dúvida do nosso último contato? Se quiser, retomo de onde paramos. ✨`;

        try {
            await evolution.sendText(dest, msg);
            db.prepare(`
                INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
            `).run(c.id, msg);
            enviados++;
            console.log(`[SofiaFollowup] Enviado para conv #${c.id} (${nome || c.wa_phone})`);
        } catch (e) {
            console.error(`[SofiaFollowup] Erro enviar conv ${c.id}:`, e.message);
        }
    }

    if (enviados > 0) console.log(`[SofiaFollowup] Total: ${enviados} follow-up(s) enviado(s)`);
}

// ═══ Inicia loop de verificação a cada 30 minutos ═══
export function iniciarSofiaFollowup() {
    // Primeira execução em 60s
    setTimeout(processarFollowups, 60 * 1000);
    // Repete a cada 30 min
    setInterval(processarFollowups, 30 * 60 * 1000);
    console.log('  [OK] Sofia Follow-up ativado (janela 9h-18h Seg-Sáb, loop 30min)');
}

export default { processarFollowups, iniciarSofiaFollowup };
