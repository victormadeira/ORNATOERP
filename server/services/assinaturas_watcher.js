// ═══════════════════════════════════════════════════════
// Assinaturas Watcher — follow-up automático de assinaturas pendentes
// ═══════════════════════════════════════════════════════
// Fluxo (sem IA — templates FIXOS):
//   + 24h após envio inicial e ainda não assinou → 1º lembrete
//   + 48h após 1º lembrete → 2º lembrete
//   + 72h após 2º lembrete → escala pro gerente (notificação interna, NÃO manda mensagem)
//
// Respeita janela 9h-18h, Seg-Sáb (mesmo horário da Sofia).
// Loop: 30min. Apenas signatários que já tiveram `enviado_em` preenchido
// (ou seja, foram enviados via o endpoint oficial — fluxo wa.me manual não é rastreado).

import db from '../db.js';
import evolution from './evolution.js';
import sofia from './sofia.js';
import { mensagemLembrete1, mensagemLembrete2 } from './assinaturas_templates.js';
import { createNotification } from './notificacoes.js';

const H24 = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;
const H72 = 72 * 60 * 60 * 1000;
const BATCH_SIZE = 20;

async function enviarLembrete(signer, doc, empresa, baseUrl, tipoLembrete) {
    const tel = (signer.telefone || '').replace(/\D/g, '');
    if (!tel) return { ok: false, motivo: 'sem_telefone' };
    if (!evolution.isConfigured()) return { ok: false, motivo: 'evolution_nao_configurado' };

    const url = `${baseUrl}/assinar/${signer.token}`;
    const builder = tipoLembrete === 'lembrete_1' ? mensagemLembrete1 : mensagemLembrete2;
    const texto = builder({ nome: signer.nome, empresa: empresa?.nome || '', tipo: doc.tipo_documento, url });

    try {
        await evolution.sendText(evolution.formatPhone(tel), texto);
        const col = tipoLembrete === 'lembrete_1' ? 'lembrete_1_em' : 'lembrete_2_em';
        db.prepare(`UPDATE assinatura_signatarios SET ${col} = CURRENT_TIMESTAMP WHERE id = ?`).run(signer.id);
        return { ok: true };
    } catch (err) {
        console.error(`[Assinaturas Watcher] Erro ao enviar ${tipoLembrete} pro signer ${signer.id}:`, err.message);
        return { ok: false, motivo: err.message };
    }
}

async function escalarGerente(signer, doc) {
    try {
        const orc = db.prepare('SELECT numero, cliente_nome FROM orcamentos WHERE id = ?').get(doc.orc_id);
        createNotification(
            'assinatura',
            `Assinatura pendente há 5+ dias: ${signer.nome}`,
            `${orc?.numero || ''} — ${orc?.cliente_nome || ''} não respondeu a 2 lembretes. Entre em contato manualmente.`,
            doc.orc_id, 'orcamento', orc?.cliente_nome || '', null
        );
        db.prepare('UPDATE assinatura_signatarios SET escalado_em = CURRENT_TIMESTAMP WHERE id = ?').run(signer.id);
        return { ok: true };
    } catch (err) {
        console.error(`[Assinaturas Watcher] Erro ao escalar signer ${signer.id}:`, err.message);
        return { ok: false };
    }
}

export async function processar() {
    try {
        if (!sofia.podeEnviarFollowup()) return; // fora da janela 9-18 seg-sáb

        // Candidatos: signatários pendentes, com enviado_em preenchido, documento não cancelado/expirado
        const rows = db.prepare(`
            SELECT s.id, s.documento_id, s.nome, s.telefone, s.token, s.status,
                   s.enviado_em, s.lembrete_1_em, s.lembrete_2_em, s.escalado_em,
                   d.tipo_documento, d.status as doc_status, d.expira_em, d.orc_id
              FROM assinatura_signatarios s
              JOIN documento_assinaturas d ON d.id = s.documento_id
             WHERE s.status = 'pendente'
               AND s.enviado_em IS NOT NULL
               AND d.status IN ('pendente','parcial')
               AND (d.expira_em IS NULL OR d.expira_em > CURRENT_TIMESTAMP)
             ORDER BY s.enviado_em ASC
             LIMIT ?
        `).all(BATCH_SIZE);

        if (!rows.length) return;

        const empresa = db.prepare('SELECT nome FROM empresa_config WHERE id = 1').get() || {};
        const baseUrl = process.env.BASE_URL || '';
        const agora = Date.now();
        let acoes = 0;

        for (const s of rows) {
            const doc = { id: s.documento_id, tipo_documento: s.tipo_documento, orc_id: s.orc_id };
            const idadeEnvio = agora - new Date(s.enviado_em).getTime();

            // Caso 1: ainda sem 1º lembrete e já passou 24h
            if (!s.lembrete_1_em && idadeEnvio >= H24) {
                const r = await enviarLembrete(s, doc, empresa, baseUrl, 'lembrete_1');
                if (r.ok) acoes++;
                continue;
            }

            // Caso 2: 1º lembrete já saiu, ainda sem 2º, e já passou 48h desde o 1º
            if (s.lembrete_1_em && !s.lembrete_2_em) {
                const idade1 = agora - new Date(s.lembrete_1_em).getTime();
                if (idade1 >= H48) {
                    const r = await enviarLembrete(s, doc, empresa, baseUrl, 'lembrete_2');
                    if (r.ok) acoes++;
                    continue;
                }
            }

            // Caso 3: 2º lembrete saiu, ainda sem escalação, e já passou 72h desde o 2º
            if (s.lembrete_2_em && !s.escalado_em) {
                const idade2 = agora - new Date(s.lembrete_2_em).getTime();
                if (idade2 >= H72) {
                    const r = await escalarGerente(s, doc);
                    if (r.ok) acoes++;
                }
            }
        }

        if (acoes > 0) {
            console.log(`[Assinaturas Watcher] ${acoes} ação(ões) executada(s) (lembretes/escalações).`);
        }
    } catch (err) {
        console.error('[Assinaturas Watcher] erro:', err.message);
    }
}

export function iniciarAssinaturasWatcher() {
    // Warmup 3min, depois loop 30min.
    setTimeout(processar, 3 * 60 * 1000);
    setInterval(processar, 30 * 60 * 1000);
    console.log('  [OK] Assinaturas Watcher ativado (lembretes em 24h/72h/5d, janela 9h-18h Seg-Sáb, loop 30min)');
}

export default { iniciarAssinaturasWatcher, processar };
