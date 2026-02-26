import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import db from '../db.js';

// ═══════════════════════════════════════════════════════
// SERVIÇO DE IA — Abstração Anthropic / OpenAI
// ═══════════════════════════════════════════════════════

function getConfig() {
    const cfg = db.prepare(
        'SELECT ia_provider, ia_api_key, ia_model, ia_system_prompt, ia_temperatura, ia_ativa FROM empresa_config WHERE id = 1'
    ).get();
    return cfg || {};
}

function getContextEntries() {
    return db.prepare('SELECT tipo, titulo, conteudo FROM ia_contexto WHERE ativo = 1').all();
}

// ═══ Construir system prompt com contexto da empresa ═══
function buildSystemPrompt(customInstructions = '') {
    const empresa = db.prepare(
        'SELECT nome, telefone, email, site, endereco, cidade, estado FROM empresa_config WHERE id = 1'
    ).get();
    const contextos = getContextEntries();

    let system = `Você é um assistente de atendimento da marcenaria "${empresa?.nome || 'Ornato'}".`;
    system += `\nTelefone: ${empresa?.telefone || ''}. Email: ${empresa?.email || ''}. Site: ${empresa?.site || ''}.`;
    system += `\nLocalização: ${empresa?.endereco || ''}, ${empresa?.cidade || ''}-${empresa?.estado || ''}.`;
    system += `\n\nVocê deve responder em português brasileiro, ser educado e profissional.`;
    system += `\nQuando não souber responder algo específico, diga que vai verificar com a equipe.`;
    system += `\nSeja conciso nas respostas — o cliente está no WhatsApp, então mensagens curtas funcionam melhor.`;

    // Adicionar entradas de treinamento
    for (const ctx of contextos) {
        system += `\n\n[${ctx.tipo.toUpperCase()}${ctx.titulo ? ': ' + ctx.titulo : ''}]\n${ctx.conteudo}`;
    }

    // System prompt customizado do config
    const cfg = getConfig();
    if (cfg.ia_system_prompt) {
        system += `\n\nINSTRUÇÕES ADICIONAIS:\n${cfg.ia_system_prompt}`;
    }

    if (customInstructions) {
        system += `\n\n${customInstructions}`;
    }

    return system;
}

// ═══ Chamada unificada para IA (Anthropic ou OpenAI) ═══
export async function callAI(messages, systemPrompt, options = {}) {
    const cfg = getConfig();
    if (!cfg.ia_api_key) throw new Error('API key da IA não configurada');

    const temperature = options.temperature ?? cfg.ia_temperatura ?? 0.7;
    const maxTokens = options.maxTokens ?? 1024;

    if (cfg.ia_provider === 'openai') {
        const openai = new OpenAI({ apiKey: cfg.ia_api_key });
        const response = await openai.chat.completions.create({
            model: cfg.ia_model || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
            temperature,
            max_tokens: maxTokens,
        });
        return response.choices[0]?.message?.content || '';
    }

    // Default: Anthropic
    const anthropic = new Anthropic({ apiKey: cfg.ia_api_key });
    const response = await anthropic.messages.create({
        model: cfg.ia_model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
        })),
        temperature,
    });
    return response.content[0]?.text || '';
}

// ═══ Processar mensagem recebida do WhatsApp via IA ═══
export async function processIncomingMessage(conversa, messageText) {
    const cfg = getConfig();
    if (!cfg.ia_ativa || !cfg.ia_api_key) return null;

    // Últimas 20 mensagens para contexto
    const recentMsgs = db.prepare(`
        SELECT direcao, remetente, conteudo FROM chat_mensagens
        WHERE conversa_id = ? AND interno = 0
        ORDER BY criado_em DESC LIMIT 20
    `).all(conversa.id).reverse();

    // Info do cliente se vinculado
    let clientInfo = '';
    if (conversa.cliente_id) {
        const cli = db.prepare('SELECT nome, tel, email, cidade, obs FROM clientes WHERE id = ?').get(conversa.cliente_id);
        if (cli) {
            clientInfo = `\nCliente: ${cli.nome}. Tel: ${cli.tel}. Email: ${cli.email}. Cidade: ${cli.cidade}.`;
            if (cli.obs) clientInfo += ` Obs: ${cli.obs}`;
        }
        // Orçamentos do cliente
        const orcs = db.prepare(
            "SELECT numero, ambiente, valor_venda, kb_col FROM orcamentos WHERE cliente_id = ? ORDER BY atualizado_em DESC LIMIT 5"
        ).all(conversa.cliente_id);
        if (orcs.length > 0) {
            clientInfo += '\nOrçamentos do cliente:';
            orcs.forEach(o => {
                clientInfo += `\n  - ${o.numero}: ${o.ambiente}, R$${o.valor_venda}, etapa=${o.kb_col}`;
            });
        }
    }

    const system = buildSystemPrompt(
        `${clientInfo}\n\nIMPORTANTE: Se a pergunta for muito complexa, sobre preços específicos que você não sabe, ou se o cliente pedir explicitamente para falar com alguém da equipe, responda EXATAMENTE "ESCALAR_HUMANO" (apenas isso, sem mais nada) para transferir o atendimento para um humano.`
    );

    // Montar mensagens para a IA
    const aiMessages = recentMsgs.map(m => ({
        role: m.direcao === 'entrada' ? 'user' : 'assistant',
        content: m.conteudo,
    }));
    aiMessages.push({ role: 'user', content: messageText });

    try {
        const response = await callAI(aiMessages, system);

        if (response.trim() === 'ESCALAR_HUMANO') {
            return { action: 'escalate', text: null };
        }

        return { action: 'respond', text: response };
    } catch (err) {
        console.error('[AI] Erro ao processar mensagem:', err.message);
        return null;
    }
}

// ═══ Sugerir resposta para o atendente humano ═══
export async function suggestResponse(conversaId) {
    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(conversaId);
    if (!conversa) throw new Error('Conversa não encontrada');

    const recentMsgs = db.prepare(`
        SELECT direcao, remetente, conteudo FROM chat_mensagens
        WHERE conversa_id = ? AND interno = 0
        ORDER BY criado_em DESC LIMIT 20
    `).all(conversaId).reverse();

    let clientInfo = '';
    if (conversa.cliente_id) {
        const cli = db.prepare('SELECT nome, tel, email, cidade FROM clientes WHERE id = ?').get(conversa.cliente_id);
        if (cli) clientInfo = `\nCliente: ${cli.nome}. Cidade: ${cli.cidade}.`;
    }

    const system = buildSystemPrompt(
        `${clientInfo}\n\nVocê está sugerindo uma resposta para o atendente humano. Escreva a mensagem como se fosse o atendente respondendo ao cliente. Seja direto, natural e profissional. Não use frases como "Eu sugiro que...".`
    );

    const aiMessages = recentMsgs.map(m => ({
        role: m.direcao === 'entrada' ? 'user' : 'assistant',
        content: m.conteudo,
    }));

    return callAI(aiMessages, system);
}

// ═══ Consulta livre sobre dados do CRM ═══
export async function queryCRM(question) {
    const totalClientes = db.prepare('SELECT COUNT(*) as c FROM clientes').get().c;
    const totalOrcs = db.prepare('SELECT COUNT(*) as c FROM orcamentos').get().c;
    const totalProjetos = db.prepare('SELECT COUNT(*) as c FROM projetos').get().c;

    const orcsByStatus = db.prepare(
        "SELECT kb_col, COUNT(*) as c, SUM(valor_venda) as total FROM orcamentos GROUP BY kb_col"
    ).all();

    const recentOrcs = db.prepare(`
        SELECT o.numero, o.cliente_nome, o.ambiente, o.valor_venda, o.kb_col, o.criado_em, o.atualizado_em
        FROM orcamentos o ORDER BY o.atualizado_em DESC LIMIT 20
    `).all();

    const recentClients = db.prepare(`
        SELECT c.nome, c.tel, c.email, c.cidade, c.criado_em,
               (SELECT COUNT(*) FROM orcamentos WHERE cliente_id = c.id) as total_orcs,
               (SELECT SUM(valor_venda) FROM orcamentos WHERE cliente_id = c.id) as total_valor
        FROM clientes c ORDER BY c.criado_em DESC LIMIT 30
    `).all();

    const projetos = db.prepare(`
        SELECT p.nome, p.status, p.cliente_id, c.nome as cliente_nome,
               (SELECT SUM(valor) FROM despesas_projeto WHERE projeto_id = p.id) as total_despesas
        FROM projetos p LEFT JOIN clientes c ON c.id = p.cliente_id
        ORDER BY p.criado_em DESC LIMIT 15
    `).all();

    const system = `Você é um assistente de CRM inteligente para uma marcenaria planejada. Responda perguntas sobre clientes, orçamentos e projetos com base nos dados fornecidos. Responda em português brasileiro. Seja conciso e direto, use bullet points quando apropriado.

DADOS DO CRM:
- Total clientes: ${totalClientes}
- Total orçamentos: ${totalOrcs}
- Total projetos: ${totalProjetos}

Orçamentos por etapa do funil:
${orcsByStatus.map(o => `  ${o.kb_col}: ${o.c} orçamento(s), total R$${(o.total || 0).toFixed(2)}`).join('\n')}

Últimos orçamentos:
${recentOrcs.map(o => `  ${o.numero} | ${o.cliente_nome} | ${o.ambiente} | R$${o.valor_venda} | ${o.kb_col} | atualizado: ${o.atualizado_em}`).join('\n')}

Clientes:
${recentClients.map(c => `  ${c.nome} | ${c.cidade} | ${c.total_orcs} orç. | R$${(c.total_valor || 0).toFixed(2)} total`).join('\n')}

Projetos:
${projetos.map(p => `  ${p.nome} | ${p.status} | Cliente: ${p.cliente_nome || '?'} | Despesas: R$${(p.total_despesas || 0).toFixed(2)}`).join('\n')}`;

    return callAI([{ role: 'user', content: question }], system, { maxTokens: 2048 });
}

// ═══ Gerar sugestões de follow-up ═══
export async function generateFollowups() {
    // Orçamentos parados há mais de 3 dias em etapas ativas do funil
    const staleOrcs = db.prepare(`
        SELECT o.id, o.numero, o.cliente_id, o.cliente_nome, o.ambiente, o.valor_venda, o.kb_col, o.atualizado_em,
               CAST(julianday('now') - julianday(o.atualizado_em) AS INTEGER) as dias_parado
        FROM orcamentos o
        WHERE o.kb_col IN ('lead', 'orc', 'env', 'neg')
        AND julianday('now') - julianday(o.atualizado_em) > 3
        ORDER BY dias_parado DESC
        LIMIT 30
    `).all();

    if (staleOrcs.length === 0) return [];

    // Limpar follow-ups antigos pendentes antes de gerar novos
    db.prepare("DELETE FROM ia_followups WHERE status = 'pendente' AND criado_em < datetime('now', '-7 days')").run();

    const system = `Você é um assistente de CRM. Analise orçamentos parados e sugira follow-ups. Para cada orçamento, gere uma sugestão curta e direta de ação (mensagem de WhatsApp ou ligação). Responda APENAS com um JSON array válido, sem markdown, sem backticks:
[{"orc_id": N, "cliente_id": N, "tipo": "followup", "prioridade": "alta|media|baixa", "mensagem": "texto da sugestão"}]`;

    const userMsg = `Orçamentos parados:\n${staleOrcs.map(o =>
        `ID:${o.id} | ClienteID:${o.cliente_id} | ${o.cliente_nome} | ${o.ambiente} | R$${o.valor_venda} | Etapa: ${o.kb_col} | Parado há ${o.dias_parado} dias`
    ).join('\n')}`;

    const response = await callAI([{ role: 'user', content: userMsg }], system, { maxTokens: 4096, temperature: 0.5 });

    try {
        // Tentar parsear JSON (pode vir com backticks)
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const suggestions = JSON.parse(cleaned);

        const stmt = db.prepare(
            'INSERT INTO ia_followups (cliente_id, orc_id, tipo, mensagem, prioridade) VALUES (?, ?, ?, ?, ?)'
        );
        const inserted = [];
        for (const s of suggestions) {
            if (!s.mensagem) continue;
            const r = stmt.run(s.cliente_id, s.orc_id, s.tipo || 'followup', s.mensagem, s.prioridade || 'media');
            inserted.push({ id: r.lastInsertRowid, ...s });
        }
        return inserted;
    } catch (e) {
        console.error('[AI] Erro ao parsear follow-ups:', e.message);
        return [];
    }
}

export default {
    callAI, processIncomingMessage, suggestResponse,
    queryCRM, generateFollowups, buildSystemPrompt,
};
