// ═══════════════════════════════════════════════════════
// SOFIA — Guardrails, Scoring e Parser do Dossiê
// Utilitários para a IA de atendimento do Studio Ornato
// Baseado em: docs/SOFIA_PLAYBOOK_v1.md
// ═══════════════════════════════════════════════════════

// ═══ Whitelist de cidades atendidas ═══
export const CIDADES_WHITELIST = [
    'sao luis', 'são luís', 'slz', 'são luis', 'sao luís',
    'paço do lumiar', 'paco do lumiar',
    'são josé de ribamar', 'sao jose de ribamar', 'ribamar',
    'raposa',
];

// Cidades notoriamente fora (blacklist explícita — bonus de detecção)
export const CIDADES_BLACKLIST = [
    'timon', 'imperatriz', 'bacabal', 'caxias', 'chapadinha', 'santa ines',
    'santa inês', 'codo', 'codó', 'balsas', 'teresina', 'belem', 'belém',
    'fortaleza', 'recife', 'salvador', 'rio de janeiro', 'sao paulo',
    'são paulo', 'brasilia', 'brasília', 'pedreiras', 'carolina',
    'barra do corda', 'açailândia', 'acailandia', 'buriticupu',
];

// Bairros premium (score extra)
export const BAIRROS_PREMIUM = [
    'renascença', 'renascenca', 'calhau', 'cohama', 'cohajap',
    'ponta d\'areia', 'ponta dareia', 'ponta de areia', 'araçagy',
    'aracagy', 'península', 'peninsula',
];

// ═══ Normalização de texto ═══
function normalizar(txt) {
    return (txt || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ═══ Verificar se cidade está na whitelist ═══
export function cidadeDentroWhitelist(cidade) {
    if (!cidade) return null;
    const norm = normalizar(cidade);
    for (const c of CIDADES_WHITELIST) {
        const cn = normalizar(c);
        if (norm === cn || norm.includes(cn)) return true;
    }
    for (const c of CIDADES_BLACKLIST) {
        const cn = normalizar(c);
        if (norm === cn || norm.includes(cn)) return false;
    }
    return null; // desconhecida
}

// ═══ Verificar se bairro é premium ═══
export function bairroPremium(bairro) {
    if (!bairro) return false;
    const norm = normalizar(bairro);
    return BAIRROS_PREMIUM.some(b => norm.includes(normalizar(b)));
}

// ═══════════════════════════════════════════════════════
// GUARDRAILS — Detectar violações em respostas da Sofia
// ═══════════════════════════════════════════════════════

// Palavras/frases que a Sofia NUNCA pode dizer
const PALAVRAS_PROIBIDAS = [
    // Financeiras
    /\br\$\s*\d/i,
    /\d+\s*(mil|k)\s*(reais|r\$)/i,
    /\bpromo[çc][ãa]o\b/i,
    /\boferta\b/i,
    /\bdesconto\b/i,
    /\bgratuito\b/i,
    /\bgr[áa]tis\b/i,
    /a partir de\s*r?\$?\s*\d/i,
    /em m[ée]dia\b/i,
    /gira em torno\b/i,
    /mais ou menos\s*r?\$/i,
    /\bmais em conta\b/i,
    /\bmais barato\b/i,

    // Compromisso
    /\bsem compromisso\b/i,
    /\bgaranto que\b/i,
    /\bprometo que\b/i,
    /\bcom certeza (fica|vai ficar)\b/i,

    // Auto-revelação (proibido se apresentar como estas)
    /\bsou (um|uma)?\s*(rob[ôo]|chatbot|bot|intelig[êe]ncia artificial)\b/i,

    // Vocabulário errado
    /\bm[óo]veis planejados\b/i,
];

// Concorrentes (bloqueio)
const CONCORRENTES = [
    /\btodeschini\b/i,
    /\bfavorita\b/i,
    /\bd[’']artti\b/i,
    /\bdelln[ao]\b/i,
    /\bortobom\b/i,
];

// Gírias proibidas
const GIRIAS = [
    /\bblz\b/i,
    /\bvlw\b/i,
    /\bkkk+\b/i,
    /\brs+\b/i,
    /\bhaha+\b/i,
    /\bmano\b/i,
    /\bbora\b/i,
    /\bshow\b/i,
    /\bmassa\b/i,
    /\bt[ôo] ligado\b/i,
];

/**
 * Valida se a resposta da Sofia respeita as regras.
 * Retorna { ok: boolean, violations: string[] }
 */
export function validarResposta(texto) {
    const violations = [];

    for (const re of PALAVRAS_PROIBIDAS) {
        const m = texto.match(re);
        if (m) violations.push(`palavra_proibida: "${m[0]}"`);
    }
    for (const re of CONCORRENTES) {
        const m = texto.match(re);
        if (m) violations.push(`concorrente: "${m[0]}"`);
    }
    for (const re of GIRIAS) {
        const m = texto.match(re);
        if (m) violations.push(`giria: "${m[0]}"`);
    }

    // Limite de emojis (máximo 2 no total do texto todo — permite 1 por mensagem)
    const emojiCount = (texto.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2728}]/gu) || []).length;
    if (emojiCount > 4) violations.push(`emojis_excesso: ${emojiCount}`);

    return { ok: violations.length === 0, violations };
}

/**
 * Sanitiza resposta removendo violações simples (se possível).
 * Não consegue corrigir valores em R$ — essas requerem escalação.
 */
export function sanitizar(texto) {
    let out = texto;
    // Remove "sem compromisso" e fica neutro
    out = out.replace(/,?\s*sem compromisso\b/gi, '');
    // Troca "móveis planejados" por "marcenaria sob medida"
    out = out.replace(/m[óo]veis planejados/gi, 'marcenaria sob medida');
    // Remove gírias
    for (const re of GIRIAS) out = out.replace(re, '');
    return out.replace(/\s+/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
}

// ═══════════════════════════════════════════════════════
// PARSER do dossiê JSON emitido pela IA
// ═══════════════════════════════════════════════════════

/**
 * Extrai o bloco <dossie>...</dossie> da resposta da Sofia.
 * Retorna { textoLimpo, dossie } — textoLimpo é o que vai pro cliente.
 */
export function extrairDossie(respostaBruta) {
    const re = /<dossie>\s*([\s\S]*?)\s*<\/dossie>/i;
    const m = respostaBruta.match(re);

    let textoLimpo = respostaBruta.replace(re, '').trim();
    let dossie = null;

    if (m && m[1]) {
        try {
            const jsonStr = m[1].trim();
            if (jsonStr && jsonStr !== '{}') {
                dossie = JSON.parse(jsonStr);
            }
        } catch (e) {
            console.error('[Sofia] Falha ao parsear dossiê:', e.message, '| raw:', m[1].slice(0, 200));
        }
    }

    return { textoLimpo, dossie };
}

// ═══════════════════════════════════════════════════════
// SCORING de lead (0-100)
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// INTENÇÃO — Detectar sinais comportamentais de compra
// ═══════════════════════════════════════════════════════

const INTENCAO_ALTA = [
    /\bvou fechar\b/i, /\bquero fechar\b/i, /\bfechar com voc[êe]s?\b/i,
    /\best(ou|amos) cert[oa]\b/i, /\bcerteza que\b.*\b(fechar|contrat)/i,
    /\bdecidid[oa]\b/i, /\bcontratar voc[êe]s\b/i,
];
const INTENCAO_MEDIA = [
    /\bmand(a|e|em) (a )?proposta\b/i, /\bmand(a|e|em) (o )?or[çc]amento\b/i,
    /\bquando (voc[êe]s?|podemos|come[çc]a)\b/i, /\bpr[óo]ximo passo\b/i,
    /\bquanto tempo\b.*\b(pra|para) come[çc]ar\b/i,
    /\bvamos marcar\b/i, /\bagendar (visita|reuni[ãa]o)\b/i,
];
const INTENCAO_BAIXA = [
    /\bme interess(o|ei|a)\b/i, /\bgostei\b/i, /\bqual o passo\b/i,
    /\btenho interesse\b/i,
];

export function calcularIntencao(mensagensCliente = []) {
    if (!Array.isArray(mensagensCliente) || mensagensCliente.length === 0) {
        return { score: 0, sinais: [] };
    }
    const texto = mensagensCliente.join('\n');
    const sinais = [];
    let pts = 0;
    for (const re of INTENCAO_ALTA) {
        const m = texto.match(re);
        if (m) { pts += 20; sinais.push(`alta:"${m[0]}":+20`); break; }
    }
    for (const re of INTENCAO_MEDIA) {
        const m = texto.match(re);
        if (m) { pts += 15; sinais.push(`media:"${m[0]}":+15`); break; }
    }
    for (const re of INTENCAO_BAIXA) {
        const m = texto.match(re);
        if (m) { pts += 5; sinais.push(`baixa:"${m[0]}":+5`); break; }
    }
    return { score: Math.min(30, pts), sinais };
}

// Detecta se dossiê novo indica mudança para casa completa
function indicaCasaCompleta(dossie = {}) {
    if (dossie.casa_completa === true) return true;
    const ambs = (dossie.ambientes || []).map(a => String(a).toLowerCase());
    if (ambs.some(a => /completa|casa\s*toda|apartamento\s*inteiro|casa\s*inteira|todos os ambientes|residencia\s*completa|obra toda/.test(a))) return true;
    if (Number(dossie.quantidade_ambientes || 0) >= 5) return true;
    return false;
}

/**
 * Calcula score do lead baseado em dados coletados.
 * opts: { mensagensCliente: string[] } — histórico p/ detectar intenção
 * Retorna { score, classificacao, detalhes, intencao }
 */
export function calcularScore(dossie = {}, opts = {}) {
    let score = 0;
    const detalhes = [];

    const qtdAmbientes = Number(dossie.quantidade_ambientes || (Array.isArray(dossie.ambientes) ? dossie.ambientes.length : 0));
    const ambs = (dossie.ambientes || []).map(a => String(a).toLowerCase());
    const casaCompleta = indicaCasaCompleta(dossie);

    // Escopo (projeto residencial) — ambientes de maior ticket pontuam mais
    if (casaCompleta || qtdAmbientes >= 4 || ambs.some(a => /completo|residencia|apartamento\s*inteiro|casa\s*inteira/.test(a))) {
        score += 40; detalhes.push('residencia_completa:+40');
    } else if (qtdAmbientes >= 2) {
        score += 25; detalhes.push('multiplos_ambientes:+25');
    } else if (qtdAmbientes === 1) {
        // Ambiente único: diferenciar por ticket típico
        const temAltoTicket = ambs.some(a => /cozinha|closet|bat[ht]|banheiro|\barea\s*gourmet/.test(a));
        if (temAltoTicket) {
            score += 20; detalhes.push('ambiente_premium:+20'); // cozinha/closet/banheiro
        } else {
            score += 12; detalhes.push('ambiente_unico:+12'); // quarto/sala/home office
        }
    }

    // Comercial
    if (dossie.tipo_imovel === 'comercial') {
        score += 15; detalhes.push('comercial:+15');
    }

    // Tem projeto de arquiteto
    if (dossie.tem_projeto_arquiteto === true) {
        score += 20; detalhes.push('tem_arquiteto:+20');
    }

    // Bairro premium
    if (bairroPremium(dossie.bairro)) {
        score += 15; detalhes.push('bairro_premium:+15');
    }

    // Indicação
    if (dossie.origem_lead === 'indicacao') {
        score += 20; detalhes.push('indicacao:+20');
    }

    // Urgência
    if (dossie.urgencia === 'alta' || (dossie.prazo_dias && dossie.prazo_dias > 0 && dossie.prazo_dias < 60)) {
        score += 10; detalhes.push('urgencia_alta:+10');
    }
    if (dossie.prazo_dias && dossie.prazo_dias > 180) {
        score -= 10; detalhes.push('prazo_distante:-10');
    }

    // ═══ INTENÇÃO (via mensagens do cliente OU campo emitido pela IA) ═══
    const intencao = calcularIntencao(opts.mensagensCliente || []);
    const intencaoDaIA = Number(dossie.intencao_score || 0);
    const intencaoFinal = Math.max(intencao.score, Math.min(30, intencaoDaIA));
    if (intencaoFinal > 0) {
        score += intencaoFinal;
        detalhes.push(`intencao:+${intencaoFinal}`);
    }

    // Perguntas de preço (red flag) — decai 50% se houver intenção >= 15 (cliente virou a chave)
    const pp = Number(dossie.perguntas_preco || 0);
    if (pp >= 2) {
        const penal = intencaoFinal >= 15 ? -7 : -15;
        score += penal; detalhes.push(`pressao_preco:${penal}`);
    }

    // Red flags em geral
    if (Array.isArray(dossie.red_flags) && dossie.red_flags.length > 0) {
        score -= dossie.red_flags.length * 5;
        detalhes.push(`red_flags:-${dossie.red_flags.length * 5}`);
    }

    // Fora da whitelist = score zero (lead não vai pra comercial)
    if (dossie.dentro_whitelist === false) {
        score = 0;
        detalhes.push('fora_whitelist:score=0');
    }

    // Escopo inviável = score zero
    if (dossie.escopo_viavel === false) {
        score = 0;
        detalhes.push('escopo_invalido:score=0');
    }

    score = Math.max(0, Math.min(100, score));

    // ═══ OVERRIDES (piso garantido por sinais óbvios) ═══
    const cidadeLocal = dossie.dentro_whitelist === true
        || (typeof dossie.cidade === 'string' && cidadeDentroWhitelist(dossie.cidade) === true);
    const escopoViavel = dossie.escopo_viavel !== false;

    if (escopoViavel && dossie.dentro_whitelist !== false) {
        if (casaCompleta && cidadeLocal && intencaoFinal >= 20) {
            if (score < 65) { score = 65; detalhes.push('override:casa_completa+local+intencao_alta=65'); }
        } else if (casaCompleta && cidadeLocal) {
            if (score < 50) { score = 50; detalhes.push('override:casa_completa+local=50'); }
        } else if (intencaoFinal >= 20 && cidadeLocal) {
            if (score < 40) { score = 40; detalhes.push('override:intencao_alta+local=40'); }
        } else if (intencaoFinal >= 20 && casaCompleta) {
            if (score < 45) { score = 45; detalhes.push('override:intencao_alta+casa_completa=45'); }
        }
    }

    let classificacao = 'frio';
    if (score >= 80) classificacao = 'muito_quente';
    else if (score >= 60) classificacao = 'quente';
    else if (score >= 30) classificacao = 'morno';

    return { score, classificacao, detalhes, intencao: { score: intencaoFinal, sinais: intencao.sinais } };
}

// ═══════════════════════════════════════════════════════
// TAGS automáticas
// ═══════════════════════════════════════════════════════

export function gerarTags(dossie = {}, score = 0) {
    const tags = [];

    if (score >= 60) tags.push('lead_quente');
    else if (score >= 30) tags.push('lead_morno');
    else tags.push('lead_frio');

    if (dossie.tem_projeto_arquiteto === true) tags.push('tem_projeto');
    else if (dossie.tem_projeto_arquiteto === false) tags.push('sem_projeto');

    if (dossie.origem_lead === 'indicacao') tags.push('indicacao');
    if (dossie.origem_lead === 'meta_ads') tags.push('meta_ads');
    if (dossie.origem_lead === 'instagram') tags.push('instagram');

    if (dossie.dentro_whitelist === false) tags.push('fora_area');
    if (dossie.escopo_viavel === false) tags.push('escopo_pequeno_rejeitado');

    if (Number(dossie.perguntas_preco || 0) >= 2) tags.push('pressao_preco');

    if (dossie.tipo_imovel === 'comercial') tags.push('comercial');

    if (dossie.decisor === 'casal') tags.push('decisor_casal');

    return tags;
}

// ═══════════════════════════════════════════════════════
// SAUDAÇÃO dinâmica por horário
// ═══════════════════════════════════════════════════════

export function saudacaoAtual() {
    const hora = new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false,
    });
    const h = parseInt(hora, 10);
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
}

// ═══════════════════════════════════════════════════════
// HORÁRIO — Verificar se pode enviar follow-up
// Regras: Seg-Sáb, 09h-18h, nunca domingo, nunca fora da janela
// ═══════════════════════════════════════════════════════

export function podeEnviarFollowup() {
    const agora = new Date();
    // Converter para horário de SP
    const brT = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const diaSemana = brT.getDay(); // 0=dom, 1=seg ... 6=sab
    const hora = brT.getHours();

    if (diaSemana === 0) return false; // domingo
    if (hora < 9 || hora >= 18) return false; // fora da janela

    return true;
}

export function horarioHumanoAtivo() {
    // Humanos: Seg-Sex 7h30 às 17h30
    const agora = new Date();
    const brT = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const diaSemana = brT.getDay();
    const hora = brT.getHours();
    const min = brT.getMinutes();
    const horaDec = hora + min / 60;

    if (diaSemana === 0 || diaSemana === 6) return false; // domingo/sábado
    if (horaDec < 7.5 || horaDec >= 17.5) return false;
    return true;
}

// ═══════════════════════════════════════════════════════
// ESPELHAMENTO de tratamento (você vs senhor/a)
// ═══════════════════════════════════════════════════════

export function detectarTratamento(textoCliente) {
    if (!textoCliente) return null;
    const norm = normalizar(textoCliente);
    if (/\bsenhor\b|\bsenhora\b|\bsr\b|\bsra\b/.test(norm)) return 'formal';
    if (/\bvoce\b|\bvoces\b|\btu\b/.test(norm)) return 'informal';
    return null;
}

// ═══════════════════════════════════════════════════════
// MERGE de dossiês (atualiza só o que mudou)
// ═══════════════════════════════════════════════════════

export function mergeDossie(antigo = {}, novo = {}) {
    const merged = { ...(antigo || {}) };
    const novoIndicaCompleta = indicaCasaCompleta(novo || {});

    for (const [k, v] of Object.entries(novo || {})) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'string' && v === '') continue;

        // Reset de ambientes em mudança de escopo para casa completa
        if (k === 'ambientes' && novoIndicaCompleta && Array.isArray(v)) {
            merged[k] = v; // substitui, não concatena
            continue;
        }
        merged[k] = v;
    }

    if (novoIndicaCompleta) merged.casa_completa = true;

    // Ao detectar sinal forte de intenção no dossiê novo, não regride
    if (novo && typeof novo.intencao_score === 'number') {
        merged.intencao_score = Math.max(Number(antigo?.intencao_score || 0), novo.intencao_score);
    }

    return merged;
}

export default {
    CIDADES_WHITELIST, CIDADES_BLACKLIST, BAIRROS_PREMIUM,
    cidadeDentroWhitelist, bairroPremium,
    validarResposta, sanitizar,
    extrairDossie,
    calcularScore, gerarTags,
    saudacaoAtual, podeEnviarFollowup, horarioHumanoAtivo,
    detectarTratamento, mergeDossie,
};
