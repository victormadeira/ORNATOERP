// ═══════════════════════════════════════════════════════
// Templates FIXOS para envio de links de assinatura
// ═══════════════════════════════════════════════════════
// Sem IA. Texto previsível, auditável, profissional.
// Editar aqui se quiser mudar tom — nunca é gerado dinamicamente.

function primeiroNome(nome) {
    return (nome || '').trim().split(/\s+/)[0] || '';
}

function rotuloTipo(tipo) {
    const map = {
        contrato: 'contrato',
        termo_entrega: 'termo de entrega',
        aditivo: 'aditivo contratual',
        proposta: 'proposta',
    };
    return map[tipo] || tipo || 'documento';
}

// ═══ 1. Envio inicial — quando o documento é criado/enviado pela 1ª vez ═══
export function mensagemEnvioInicial({ nome, empresa, tipo, url }) {
    const p = primeiroNome(nome);
    const emp = empresa || 'nossa equipe';
    const rot = rotuloTipo(tipo);
    return (
`Olá${p ? `, ${p}` : ''}! 👋

Seu ${rot} da *${emp}* está pronto para assinatura.

🔗 Link para assinar:
${url}

É rápido: abra no celular, confira o documento e assine com o dedo. Leva menos de 2 minutos.

Qualquer dúvida, é só responder esta mensagem.`
    );
}

// ═══ 2. Primeiro lembrete (24h após o envio, sem assinatura) ═══
export function mensagemLembrete1({ nome, empresa, tipo, url }) {
    const p = primeiroNome(nome);
    const emp = empresa || 'nossa equipe';
    const rot = rotuloTipo(tipo);
    return (
`Oi${p ? `, ${p}` : ''}! 🙂

Passando pra lembrar do seu ${rot} da *${emp}* que está pendente de assinatura.

🔗 ${url}

Se encontrar alguma dificuldade ou quiser ajustar algo antes de assinar, me avisa por aqui.`
    );
}

// ═══ 3. Segundo lembrete (48h após o 1º lembrete) ═══
export function mensagemLembrete2({ nome, empresa, tipo, url }) {
    const p = primeiroNome(nome);
    const emp = empresa || 'nossa equipe';
    const rot = rotuloTipo(tipo);
    return (
`${p ? `${p}, ` : ''}tudo bem?

Seu ${rot} da *${emp}* ainda está aguardando assinatura. Sem a assinatura, não conseguimos dar andamento no projeto.

🔗 ${url}

Se tiver alguma dúvida ou precisar de mais tempo, é só me avisar.`
    );
}

export default { mensagemEnvioInicial, mensagemLembrete1, mensagemLembrete2 };
