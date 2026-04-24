// ═══════════════════════════════════════════════════════
// Inativos Watcher — cliente inativo 60+ dias (reativação)
// ═══════════════════════════════════════════════════════
// Detecta clientes que sumiram há 60+ dias FILTRANDO os que
// saíram insatisfeitos. Cria candidatos em reativacao_candidatos
// com status='pending' (preview).
//
// Em modo preview (default): usuário revisa e aprova no admin.
// Em modo auto (empresa_config.reativacao_auto=1): dispara
// webhook direto pro n8n (cuidado!).
//
// Loop: 1x/dia (24h). Cooldown por cliente: 90 dias.

import db from '../db.js';
import { dispatchOutbound } from './webhook_outbound.js';

const DIAS_INATIVO = 60;
const COOLDOWN_DIAS = 90;
const BATCH_SIZE = 25;

// Tokens negativos em notas/interações — indicam possível insatisfação
const TOKENS_NEGATIVOS = ['reclam', 'insatisf', 'chateado', 'irritad', 'bravo', 'nao quer', 'não quer', 'devolver', 'reembolso', 'processo', 'advogad'];

function clienteTemSinalRuim(clienteId) {
    // 1. Orçamento perdido nos últimos 180 dias
    const orcPerdido = db.prepare(`
        SELECT 1 FROM orcamentos
         WHERE cliente_id = ? AND kb_col = 'perdido'
           AND julianday('now') - julianday(atualizado_em) <= 180
         LIMIT 1
    `).get(clienteId);
    if (orcPerdido) return 'orcamento_perdido_recente';

    // 2. Conversa com IA bloqueada (abuso/spam/hostilidade)
    const bloqueada = db.prepare(`
        SELECT 1 FROM chat_conversas
         WHERE cliente_id = ? AND COALESCE(ia_bloqueada, 0) = 1
         LIMIT 1
    `).get(clienteId);
    if (bloqueada) return 'ia_bloqueada';

    // 3. Conversa abandonada (escalação chegou em N4)
    const abandonada = db.prepare(`
        SELECT 1 FROM chat_conversas
         WHERE cliente_id = ? AND COALESCE(abandonada, 0) = 1
         LIMIT 1
    `).get(clienteId);
    if (abandonada) return 'conversa_abandonada';

    // 4. Lead com motivo_perda preenchido
    try {
        const leadPerdido = db.prepare(`
            SELECT 1 FROM leads
             WHERE cliente_id = ? AND COALESCE(motivo_perda, '') != ''
             LIMIT 1
        `).get(clienteId);
        if (leadPerdido) return 'lead_com_motivo_perda';
    } catch (_) { /* tabela pode nao existir em ambientes antigos */ }

    // 5. Projeto cancelado nos últimos 365 dias
    try {
        const projCancel = db.prepare(`
            SELECT 1 FROM projetos
             WHERE cliente_id = ? AND status = 'cancelado'
               AND julianday('now') - julianday(COALESCE(atualizado_em, criado_em)) <= 365
             LIMIT 1
        `).get(clienteId);
        if (projCancel) return 'projeto_cancelado';
    } catch (_) {}

    // 6. Nota ou interação com tokens negativos (últimos 180d)
    try {
        const notas = db.prepare(`
            SELECT LOWER(conteudo) as t FROM cliente_notas
             WHERE cliente_id = ?
               AND julianday('now') - julianday(criado_em) <= 180
        `).all(clienteId);
        for (const n of notas) {
            if (TOKENS_NEGATIVOS.some(tok => (n.t || '').includes(tok))) {
                return 'nota_negativa';
            }
        }
    } catch (_) {}

    try {
        const inter = db.prepare(`
            SELECT LOWER(descricao) as t, LOWER(tipo) as tp FROM cliente_interacoes
             WHERE cliente_id = ?
               AND julianday('now') - julianday(data) <= 180
        `).all(clienteId);
        for (const i of inter) {
            if (i.tp === 'reclamacao') return 'interacao_reclamacao';
            if (TOKENS_NEGATIVOS.some(tok => (i.t || '').includes(tok))) return 'interacao_negativa';
        }
    } catch (_) {}

    return null;
}

function contextoHistorico(clienteId) {
    const ultOrc = db.prepare(`
        SELECT id, numero, valor_venda, ambiente, kb_col, criado_em
          FROM orcamentos WHERE cliente_id = ? ORDER BY id DESC LIMIT 1
    `).get(clienteId);
    const counts = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN kb_col = 'ok' THEN 1 ELSE 0 END) as aprovados
          FROM orcamentos WHERE cliente_id = ?
    `).get(clienteId) || {};
    let projetosConcluidos = 0;
    try {
        const r = db.prepare(`SELECT COUNT(*) as n FROM projetos WHERE cliente_id = ? AND status = 'concluido'`).get(clienteId);
        projetosConcluidos = r?.n || 0;
    } catch (_) {}
    const ultConv = db.prepare(`
        SELECT classificacao, lead_score FROM chat_conversas
         WHERE cliente_id = ? ORDER BY ultimo_msg_em DESC LIMIT 1
    `).get(clienteId);

    return {
        orcamentos_count: counts.total || 0,
        orcamentos_aprovados: counts.aprovados || 0,
        orcamento_aprovado: (counts.aprovados || 0) > 0,
        ultimo_orcamento_valor: ultOrc?.valor_venda || 0,
        ultimo_orcamento_numero: ultOrc?.numero || '',
        ultimo_ambiente: ultOrc?.ambiente || '',
        projetos_concluidos: projetosConcluidos,
        ultima_temperatura: ultConv?.classificacao || '',
        ultimo_score: ultConv?.lead_score || 0,
    };
}

async function processar() {
    try {
        // Candidatos: clientes com ultima_atividade > 60d atrás, cooldown respeitado, telefone ok
        const candidatos = db.prepare(`
            SELECT c.id, c.nome, c.tel, c.email, c.reativacao_disparada_em,
                   (SELECT MAX(ultimo_msg_em) FROM chat_conversas WHERE cliente_id = c.id) as ult_chat,
                   (SELECT MAX(atualizado_em) FROM orcamentos WHERE cliente_id = c.id) as ult_orc
              FROM clientes c
             WHERE COALESCE(c.tel, '') != ''
               AND (c.reativacao_disparada_em IS NULL
                    OR julianday('now') - julianday(c.reativacao_disparada_em) >= ?)
        `).all(COOLDOWN_DIAS);

        let criados = 0;
        let pulados = 0;
        const cfg = db.prepare('SELECT reativacao_auto FROM empresa_config WHERE id = 1').get() || {};
        const modoAuto = !!cfg.reativacao_auto;

        for (const c of candidatos) {
            const ultima = c.ult_chat || c.ult_orc;
            if (!ultima) { pulados++; continue; }
            const diasInativo = Math.floor((Date.now() - new Date(ultima).getTime()) / 864e5);
            if (diasInativo < DIAS_INATIVO) continue;

            const sinal = clienteTemSinalRuim(c.id);
            if (sinal) { pulados++; continue; }

            // Já tem candidato pending pra esse cliente?
            const ja = db.prepare(`
                SELECT id FROM reativacao_candidatos
                 WHERE cliente_id = ? AND status IN ('pending','aprovada') LIMIT 1
            `).get(c.id);
            if (ja) continue;

            const hist = contextoHistorico(c.id);
            const ultimoTipo = c.ult_chat && (!c.ult_orc || c.ult_chat >= c.ult_orc) ? 'chat' : 'orcamento';

            const payload = {
                cliente_id: c.id,
                nome: c.nome || '',
                telefone: c.tel,
                email: c.email || '',
                dias_inativo: diasInativo,
                ultimo_contato_em: ultima,
                ultimo_contato_tipo: ultimoTipo,
                historico: hist,
            };

            const r = db.prepare(`
                INSERT INTO reativacao_candidatos (cliente_id, payload_json, status)
                VALUES (?, ?, 'pending')
            `).run(c.id, JSON.stringify(payload));

            criados++;

            if (modoAuto) {
                await dispatchOutbound('cliente_inativo_60d', payload, {
                    referenciaId: c.id,
                    referenciaTipo: 'cliente',
                });
                db.prepare(`UPDATE reativacao_candidatos
                               SET status = 'disparada', decidido_em = CURRENT_TIMESTAMP,
                                   disparado_em = CURRENT_TIMESTAMP
                             WHERE id = ?`).run(r.lastInsertRowid);
                db.prepare('UPDATE clientes SET reativacao_disparada_em = CURRENT_TIMESTAMP WHERE id = ?').run(c.id);
            }

            if (criados >= BATCH_SIZE) break;
        }

        if (criados > 0) {
            console.log(`[Inativos] ${criados} candidato(s) criado(s) ${modoAuto ? '(modo AUTO — webhook disparado)' : '(modo PREVIEW — aguardando aprovação)'}. ${pulados} filtrado(s) por sinal negativo.`);
        }
    } catch (err) {
        console.error('[Inativos] erro:', err.message);
    }
}

export function iniciarInativosWatcher() {
    // Boot: aguarda 5min, depois roda 1x/dia (24h).
    setTimeout(processar, 5 * 60 * 1000);
    setInterval(processar, 24 * 60 * 60 * 1000);
    console.log('  [OK] Inativos Watcher ativado (60d+ inativo, 6 filtros de segurança, cooldown 90d, loop 24h)');
}

export default { iniciarInativosWatcher, processar };
