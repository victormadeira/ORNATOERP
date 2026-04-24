// ═══════════════════════════════════════════════════════════════
// Gerente Revisional IA — auditor diário da operação comercial
// ═══════════════════════════════════════════════════════════════
// Roda 1x por dia às 07:30. Analisa conversas ativas + propostas em aberto
// e devolve ações concretas pro gerente humano aprovar/ignorar.
//
// Modelo: Claude Haiku 4.5 (otimizado pra custo)
// Fonte principal: chat_conversas (não leads — CRM ainda não está em uso)
//
// Saída:
//   - gerente_relatorios (1 linha/dia)
//   - gerente_acoes (N linhas/dia)
//   - notificação interna se houver ações urgentes
// ═══════════════════════════════════════════════════════════════
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import { createNotification } from './notificacoes.js';

// Claude Haiku 4.5 — $0.80/M input, $4/M output
const MODEL_DEFAULT = 'claude-haiku-4-5-20251001';
const MAX_LEADS_ANALISADOS = 30;
const MAX_MSGS_POR_CONVERSA = 8;

// ═══════════════════════════════════════════════════════════════
// 1. COLETA DE CANDIDATOS (filtro SQL determinístico)
// ═══════════════════════════════════════════════════════════════
function coletarCandidatos() {
    // Conversas ativas que apresentam algum sinal de atenção
    const conversas = db.prepare(`
        SELECT
            c.id,
            c.cliente_id,
            c.wa_name,
            c.wa_phone,
            c.status,
            c.lead_qualificacao,
            c.lead_score,
            c.lead_dados,
            c.categoria,
            c.prioridade,
            c.ultimo_msg_em,
            c.aguardando_cliente,
            c.handoff_em,
            c.atribuido_user_id,
            c.escalacao_nivel,
            c.retomada_count,
            c.abandonada,
            c.lead_quente_disparado_em,
            cl.nome as cliente_nome,
            CAST((julianday('now') - julianday(c.ultimo_msg_em)) AS INTEGER) as dias_silencio
          FROM chat_conversas c
     LEFT JOIN clientes cl ON cl.id = c.cliente_id
         WHERE c.arquivada = 0
           AND c.ultimo_msg_em > datetime('now', '-30 days')
         ORDER BY c.ultimo_msg_em DESC
         LIMIT ?
    `).all(MAX_LEADS_ANALISADOS);

    // Pra cada conversa, anexa últimas msgs + orçamento mais recente + aberturas de proposta
    const enriched = conversas.map(conv => {
        const msgs = db.prepare(`
            SELECT direcao, conteudo, tipo, criado_em, remetente
              FROM chat_mensagens
             WHERE conversa_id = ?
             ORDER BY criado_em DESC
             LIMIT ?
        `).all(conv.id, MAX_MSGS_POR_CONVERSA).reverse();

        let orc = null;
        if (conv.cliente_id) {
            orc = db.prepare(`
                SELECT id, numero, valor_venda, status_proposta, status, criado_em, atualizado_em, aprovado_em
                  FROM orcamentos
                 WHERE cliente_id = ?
              ORDER BY atualizado_em DESC
                 LIMIT 1
            `).get(conv.cliente_id);
        }

        let acessos = [];
        if (orc) {
            acessos = db.prepare(`
                SELECT acessado_em, tempo_pagina, scroll_max, evento_tipo
                  FROM proposta_acessos
                 WHERE orc_id = ?
              ORDER BY acessado_em DESC
                 LIMIT 10
            `).all(orc.id);
        }

        return { ...conv, msgs, orc, acessos };
    });

    return enriched;
}

// ═══════════════════════════════════════════════════════════════
// 2. MÉTRICAS AGREGADAS (contexto executivo pra IA)
// ═══════════════════════════════════════════════════════════════
function coletarMetricas() {
    const m = {};
    m.conversas_ativas = db.prepare(
        "SELECT COUNT(*) as n FROM chat_conversas WHERE arquivada = 0 AND ultimo_msg_em > datetime('now','-30 days')"
    ).get().n;
    m.quentes = db.prepare(
        "SELECT COUNT(*) as n FROM chat_conversas WHERE arquivada = 0 AND lead_qualificacao = 'quente'"
    ).get().n;
    m.mornos = db.prepare(
        "SELECT COUNT(*) as n FROM chat_conversas WHERE arquivada = 0 AND lead_qualificacao = 'morno'"
    ).get().n;
    m.frios = db.prepare(
        "SELECT COUNT(*) as n FROM chat_conversas WHERE arquivada = 0 AND lead_qualificacao = 'frio'"
    ).get().n;
    m.msgs_7d = db.prepare(
        "SELECT COUNT(*) as n FROM chat_mensagens WHERE criado_em > datetime('now','-7 days')"
    ).get().n;
    m.msgs_saindo_7d = db.prepare(
        "SELECT COUNT(*) as n FROM chat_mensagens WHERE criado_em > datetime('now','-7 days') AND direcao = 'saida'"
    ).get().n;
    m.msgs_entrando_7d = db.prepare(
        "SELECT COUNT(*) as n FROM chat_mensagens WHERE criado_em > datetime('now','-7 days') AND direcao = 'entrada'"
    ).get().n;
    m.propostas_abertas = db.prepare(
        "SELECT COUNT(*) as n FROM orcamentos WHERE status IN ('enviado','aberto','visualizado') AND aprovado_em IS NULL AND criado_em > datetime('now','-60 days')"
    ).get().n;
    m.propostas_assinadas_7d = db.prepare(
        "SELECT COUNT(*) as n FROM orcamentos WHERE aprovado_em > datetime('now','-7 days')"
    ).get().n;
    return m;
}

// ═══════════════════════════════════════════════════════════════
// 3. SERIALIZAÇÃO COMPACTA (reduz tokens pro Haiku)
// ═══════════════════════════════════════════════════════════════
function resumirLead(c, idx) {
    const nome = c.cliente_nome || c.wa_name || `Contato ${c.wa_phone?.slice(-4)}`;
    const msgs = (c.msgs || []).map(m => {
        const quem = m.direcao === 'entrada' ? 'CLIENTE' : (m.remetente || 'SOFIA');
        const conteudo = (m.conteudo || '').slice(0, 180).replace(/\s+/g, ' ');
        return `  [${m.criado_em.slice(5, 16)}] ${quem}: ${conteudo}`;
    }).join('\n') || '  (sem histórico)';

    let orcLinha = '';
    if (c.orc) {
        const v = c.orc.valor_venda ? `R$ ${Math.round(c.orc.valor_venda).toLocaleString('pt-BR')}` : 's/ valor';
        const assinou = c.orc.aprovado_em ? `✓ assinada ${c.orc.aprovado_em.slice(0, 10)}` : 'não assinada';
        orcLinha = `\n  PROPOSTA #${c.orc.numero || c.orc.id}: ${v} · status=${c.orc.status_proposta || c.orc.status} · ${assinou}`;
        if (c.acessos && c.acessos.length) {
            const aberturas = c.acessos.length;
            const maxScroll = Math.max(...c.acessos.map(a => a.scroll_max || 0));
            orcLinha += ` · ABERTA ${aberturas}x · scroll-max ${maxScroll}%`;
        }
    }

    const quali = c.lead_qualificacao || 'novo';
    const score = c.lead_score || 0;
    const silencio = c.dias_silencio != null ? `${c.dias_silencio}d silêncio` : '—';
    const aguardando = c.aguardando_cliente ? ' · ⏳aguardando cliente' : '';
    const handoff = c.handoff_em ? ' · 👤em handoff' : '';
    const escalacao = c.escalacao_nivel ? ` · escalação nv${c.escalacao_nivel}` : '';

    return `
#${idx} · ${nome} (conv_id=${c.id})
  qualificação: ${quali} (score ${score}) · ${silencio}${aguardando}${handoff}${escalacao}${orcLinha}
${msgs}`.trim();
}

// ═══════════════════════════════════════════════════════════════
// 4. PROMPT DO GERENTE REVISIONAL
// ═══════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `Você é um GERENTE COMERCIAL SÊNIOR de uma marcenaria de alto padrão em São Luís/MA (Studio Ornato).

Sua missão: revisar a operação do dia e entregar uma LISTA CURTA de ações humanas urgentes que o gerente precisa tomar HOJE para não perder vendas. Você NÃO vende. Você diagnostica e recomenda.

PRINCÍPIOS DE REVISÃO:
1. Seja SELETIVO. Se o lead está OK, não reporte. Quantidade não é qualidade.
2. Seja ESPECÍFICO. Cada diagnóstico e ação deve mencionar dados concretos (valor da proposta, o que o cliente disse, quantos dias de silêncio).
3. Priorize SINAIS FORTES DE INTERESSE OU RISCO:
   - Proposta aberta 2+ vezes sem assinar (interesse alto, barreira presente)
   - Cliente respondeu e Sofia/equipe não deu continuidade
   - Lead qualificado como "quente" parado há 5+ dias
   - Objeção detectada (preço, cônjuge, prazo) sem tratativa
   - Cliente em handoff há muito tempo sem ação humana
   - Proposta recusada ou ignorada após alto engajamento
4. Prioridade ALTA = risco real de perder venda nesta semana.
   Prioridade MEDIA = atenção necessária mas não emergencial.
   Prioridade BAIXA = observação para registro.
5. Sugira MENSAGENS NATURAIS (tom Studio Ornato: premium, consultivo, sem emoji excessivo, máximo 4 linhas de WhatsApp). Evite clichê tipo "estamos à disposição".
6. IDENTIFIQUE PADRÕES: se 3 leads travaram pela mesma razão, reporte o padrão.

REGRAS DE TOM (Studio Ornato):
- Mensagens curtas, premium, calorosas mas não íntimas.
- Nunca dar preço, desconto, prazo garantido.
- Use nome do cliente com parcimônia.
- Evite emojis (no máximo 1, da paleta ✨ 🤍).

TIPOS DE AÇÃO válidos:
  followup_audio | followup_texto | followup_objecao | ligar | pausar | revisar_proposta | escalar_humano

SAÍDA OBRIGATÓRIA — JSON puro (sem markdown, sem texto antes/depois):
{
  "acoes": [
    {
      "conversa_id": 42,
      "nome_alvo": "Maria Santos",
      "prioridade": "alta" | "media" | "baixa",
      "tipo_acao": "followup_audio",
      "diagnostico": "Proposta R$48.700 aberta 3x sem assinar há 9 dias. Última mensagem dela: 'vou falar com meu marido'. Objeção conjugal não tratada.",
      "acao_sugerida": "Mandar áudio curto da equipe comercial direcionado ao cônjuge também, oferecendo esclarecer dúvidas dele direto.",
      "mensagem_sugerida": "Maria, lembrei do seu projeto hoje. Se o Pedro ficou com alguma dúvida, posso falar com ele direto — é comum a gente conversar com o casal junto antes de fechar. Me avisa que horário funciona."
    }
  ],
  "padroes": [
    "3 propostas travaram após exibição de valor — objeção de preço virando padrão da semana",
    "Leads do Instagram estão respondendo menos que leads de Indicação"
  ],
  "recomendacao": "Criar template de follow-up específico pra objeção de cônjuge — 2 leads nessa situação hoje."
}

Se nenhuma ação for necessária hoje, devolva { "acoes": [], "padroes": [], "recomendacao": "Operação sem pendências urgentes hoje." }`;

// ═══════════════════════════════════════════════════════════════
// 5. PARSING ROBUSTO DO JSON
// ═══════════════════════════════════════════════════════════════
function parseRespostaIA(raw) {
    if (!raw) return null;
    let txt = raw.trim();
    // remove cercas markdown se vierem
    if (txt.startsWith('```')) {
        txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }
    // extrai o primeiro bloco { ... }
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) txt = m[0];
    try {
        return JSON.parse(txt);
    } catch (e) {
        console.error('[Gerente] JSON inválido:', e.message, '\nRaw:', raw.slice(0, 500));
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. CÁLCULO DE CUSTO (Claude Haiku 4.5)
// ═══════════════════════════════════════════════════════════════
const PRECO_HAIKU = { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 };
function calcularCustoUSD(modelo, inTok, outTok) {
    // Haiku default — Sonnet custaria ~4x mais
    if (modelo.includes('sonnet')) {
        return (inTok * 3.0 / 1_000_000) + (outTok * 15.0 / 1_000_000);
    }
    return (inTok * PRECO_HAIKU.input) + (outTok * PRECO_HAIKU.output);
}

// ═══════════════════════════════════════════════════════════════
// 7. EXECUÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export async function rodarAgora({ forcado = false } = {}) {
    const iniciado = Date.now();

    // ═══ Anti-duplicação: só 1 relatório por dia, exceto se forcado ═══
    if (!forcado) {
        const hoje = db.prepare(
            "SELECT id FROM gerente_relatorios WHERE date(gerado_em) = date('now','localtime') LIMIT 1"
        ).get();
        if (hoje) {
            return { ok: false, motivo: 'ja_rodou_hoje', relatorio_id: hoje.id };
        }
    }

    // ═══ Configuração da IA ═══
    const cfg = db.prepare(
        'SELECT ia_provider, ia_api_key, ia_ativa FROM empresa_config WHERE id = 1'
    ).get();
    if (!cfg?.ia_ativa || !cfg?.ia_api_key) {
        return { ok: false, motivo: 'ia_nao_configurada' };
    }
    if (cfg.ia_provider !== 'anthropic') {
        return { ok: false, motivo: 'gerente_requer_anthropic' };
    }

    // ═══ Coleta de dados ═══
    const candidatos = coletarCandidatos();
    const metricas = coletarMetricas();

    if (!candidatos.length) {
        // Sem dados = sem relatório, mas registra uma entrada "vazia" pra histórico
        const r = db.prepare(`
            INSERT INTO gerente_relatorios (leads_analisados, resumo, recomendacao, modelo)
            VALUES (0, 'Nenhuma conversa ativa nos últimos 30 dias.', 'Operação sem dados pra analisar.', ?)
        `).run(MODEL_DEFAULT);
        return { ok: true, relatorio_id: r.lastInsertRowid, acoes: 0, vazio: true };
    }

    // ═══ Monta prompt ═══
    const contextoMetricas = `
CONTEXTO DO DIA (${new Date().toLocaleDateString('pt-BR')}):
- ${metricas.conversas_ativas} conversas ativas (quentes: ${metricas.quentes}, mornos: ${metricas.mornos}, frios: ${metricas.frios})
- Últimos 7 dias: ${metricas.msgs_saindo_7d} mensagens enviadas, ${metricas.msgs_entrando_7d} respostas
- Propostas abertas (não assinadas): ${metricas.propostas_abertas} · Assinadas últimos 7d: ${metricas.propostas_assinadas_7d}

LEADS PARA ANÁLISE (${candidatos.length} conversas):
${candidatos.map((c, i) => resumirLead(c, i + 1)).join('\n\n')}
`.trim();

    // ═══ Chamada LLM ═══
    const anthropic = new Anthropic({ apiKey: cfg.ia_api_key });
    let resposta, usage, erro = '';
    try {
        const r = await anthropic.messages.create({
            model: MODEL_DEFAULT,
            max_tokens: 3000,
            system: [
                {
                    type: 'text',
                    text: SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [{ role: 'user', content: contextoMetricas }],
            temperature: 0.3, // mais determinístico pra auditoria
        });
        resposta = r.content[0]?.text || '';
        usage = r.usage || {};
    } catch (err) {
        console.error('[Gerente Revisional] Erro LLM:', err.message);
        erro = err.message;
        const r = db.prepare(`
            INSERT INTO gerente_relatorios (leads_analisados, erro, modelo)
            VALUES (?, ?, ?)
        `).run(candidatos.length, erro, MODEL_DEFAULT);
        return { ok: false, motivo: 'erro_llm', erro, relatorio_id: r.lastInsertRowid };
    }

    // ═══ Parse ═══
    const parsed = parseRespostaIA(resposta);
    if (!parsed) {
        const r = db.prepare(`
            INSERT INTO gerente_relatorios (leads_analisados, erro, modelo, tokens_input, tokens_output)
            VALUES (?, ?, ?, ?, ?)
        `).run(candidatos.length, 'resposta_ia_nao_parseavel', MODEL_DEFAULT, usage.input_tokens || 0, usage.output_tokens || 0);
        return { ok: false, motivo: 'parse_falhou', relatorio_id: r.lastInsertRowid };
    }

    const acoes = Array.isArray(parsed.acoes) ? parsed.acoes : [];
    const padroes = Array.isArray(parsed.padroes) ? parsed.padroes : [];
    const recomendacao = parsed.recomendacao || '';

    const contarPrio = (p) => acoes.filter(a => (a.prioridade || '').toLowerCase() === p).length;
    const urgentes = contarPrio('alta');
    const media = contarPrio('media');
    const baixa = contarPrio('baixa');

    const resumo = `${acoes.length} ações sugeridas (${urgentes} urgentes) · ${candidatos.length} conversas analisadas.`;
    const custoUSD = calcularCustoUSD(MODEL_DEFAULT, usage.input_tokens || 0, usage.output_tokens || 0);

    // ═══ Persiste relatório + ações (transação) ═══
    const insertRel = db.prepare(`
        INSERT INTO gerente_relatorios (
            leads_analisados, acoes_urgentes, acoes_media, acoes_baixa,
            resumo, padroes_json, recomendacao,
            tokens_input, tokens_output, custo_usd, modelo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAcao = db.prepare(`
        INSERT INTO gerente_acoes (
            relatorio_id, conversa_id, cliente_id, orc_id, nome_alvo,
            prioridade, tipo_acao, diagnostico, acao_sugerida, mensagem_sugerida
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transacao = db.transaction(() => {
        const rel = insertRel.run(
            candidatos.length, urgentes, media, baixa,
            resumo, JSON.stringify(padroes), recomendacao,
            usage.input_tokens || 0, usage.output_tokens || 0, custoUSD, MODEL_DEFAULT
        );
        const relId = rel.lastInsertRowid;

        for (const a of acoes) {
            // Mapeia conversa → cliente → orçamento
            const conv = candidatos.find(c => c.id === Number(a.conversa_id));
            const cliente_id = conv?.cliente_id || null;
            const orc_id = conv?.orc?.id || null;
            const prio = ['alta', 'media', 'baixa'].includes((a.prioridade || '').toLowerCase())
                ? a.prioridade.toLowerCase() : 'media';

            insertAcao.run(
                relId,
                Number(a.conversa_id) || null,
                cliente_id,
                orc_id,
                String(a.nome_alvo || '').slice(0, 120),
                prio,
                String(a.tipo_acao || '').slice(0, 40),
                String(a.diagnostico || '').slice(0, 1000),
                String(a.acao_sugerida || '').slice(0, 1000),
                String(a.mensagem_sugerida || '').slice(0, 2000)
            );
        }
        return relId;
    });

    const relatorio_id = transacao();

    // ═══ Notificação interna se tiver urgência ═══
    if (urgentes > 0) {
        createNotification(
            'gerente_revisional',
            `🧐 Gerente Revisional: ${urgentes} ação${urgentes > 1 ? 'ões' : ''} urgente${urgentes > 1 ? 's' : ''} hoje`,
            resumo,
            relatorio_id,
            'gerente_relatorio',
            '',
            null
        );
    }

    const ms = Date.now() - iniciado;
    console.log(`[Gerente Revisional] ✓ ${acoes.length} ações (${urgentes} urg) em ${ms}ms — US$${custoUSD.toFixed(4)}`);

    return {
        ok: true,
        relatorio_id,
        acoes: acoes.length,
        urgentes, media, baixa,
        custo_usd: custoUSD,
        tempo_ms: ms,
    };
}

// ═══════════════════════════════════════════════════════════════
// 8. SCHEDULER — roda todo dia às 07:30 (exceto domingo)
// ═══════════════════════════════════════════════════════════════
function msAte0730() {
    const agora = new Date();
    const alvo = new Date();
    alvo.setHours(7, 30, 0, 0);
    if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
    // Pula domingo: se cair em domingo, agenda pra segunda
    if (alvo.getDay() === 0) alvo.setDate(alvo.getDate() + 1);
    return alvo.getTime() - agora.getTime();
}

export function iniciarGerenteRevisional() {
    const agendarProxima = () => {
        const delay = msAte0730();
        setTimeout(async () => {
            try {
                const r = await rodarAgora();
                if (!r.ok && r.motivo !== 'ja_rodou_hoje') {
                    console.warn(`[Gerente Revisional] run abortado: ${r.motivo}`);
                }
            } catch (err) {
                console.error('[Gerente Revisional] erro inesperado:', err.message);
            }
            agendarProxima(); // reagenda próxima
        }, delay);
    };

    // Catch-up ao bootar: se ainda não rodou hoje e já passou das 7:30, roda em 5min
    setTimeout(async () => {
        try {
            const hoje = db.prepare(
                "SELECT id FROM gerente_relatorios WHERE date(gerado_em) = date('now','localtime') LIMIT 1"
            ).get();
            const agora = new Date();
            const passou0730 = agora.getHours() > 7 || (agora.getHours() === 7 && agora.getMinutes() >= 30);
            const naoDomingo = agora.getDay() !== 0;
            if (!hoje && passou0730 && naoDomingo) {
                console.log('[Gerente Revisional] Catch-up: rodando relatório do dia...');
                await rodarAgora().catch(e => console.error('  catch-up falhou:', e.message));
            }
        } catch (_) { /* silent */ }
    }, 5 * 60 * 1000);

    agendarProxima();

    const h = Math.floor(msAte0730() / 3600000);
    const m = Math.floor((msAte0730() % 3600000) / 60000);
    console.log(`  [OK] Gerente Revisional IA ativado (próxima execução em ${h}h${m}m, modelo: ${MODEL_DEFAULT})`);
}

export default { rodarAgora, iniciarGerenteRevisional };
