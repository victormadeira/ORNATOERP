// ── Valor por extenso (PT-BR) ───────────────────────────────────────────────
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function extenso999(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const parts = [];
    const c = Math.floor(n / 100);
    const r = n % 100;
    if (c > 0) parts.push(CENTENAS[c]);
    if (r > 0) {
        if (r < 20) {
            parts.push(UNIDADES[r]);
        } else {
            const d = Math.floor(r / 10);
            const u = r % 10;
            parts.push(DEZENAS[d]);
            if (u > 0) parts.push(UNIDADES[u]);
        }
    }
    return parts.join(' e ');
}

export function valorExtenso(valor) {
    if (!valor || valor <= 0) return 'zero reais';
    const v = Math.round(valor * 100); // centavos totais
    const reais = Math.floor(v / 100);
    const centavos = v % 100;

    const partes = [];

    if (reais > 0) {
        if (reais >= 1000000) {
            const milhoes = Math.floor(reais / 1000000);
            const restoMilhao = reais % 1000000;
            partes.push(milhoes === 1 ? 'um milhão' : `${extenso999(milhoes)} milhões`);
            if (restoMilhao > 0) {
                const milhares = Math.floor(restoMilhao / 1000);
                const unidades = restoMilhao % 1000;
                if (milhares > 0) {
                    partes.push(milhares === 1 ? 'mil' : `${extenso999(milhares)} mil`);
                }
                if (unidades > 0) {
                    partes.push(extenso999(unidades));
                }
            }
        } else if (reais >= 1000) {
            const milhares = Math.floor(reais / 1000);
            const unidades = reais % 1000;
            partes.push(milhares === 1 ? 'mil' : `${extenso999(milhares)} mil`);
            if (unidades > 0) {
                partes.push(extenso999(unidades));
            }
        } else {
            partes.push(extenso999(reais));
        }
        partes.push(reais === 1 ? 'real' : 'reais');
    }

    if (centavos > 0) {
        if (reais > 0) partes.push('e');
        partes.push(extenso999(centavos));
        partes.push(centavos === 1 ? 'centavo' : 'centavos');
    }

    return partes.join(' ');
}

// ── Formatar data ───────────────────────────────────────────────────────────
function fmtData(d) {
    if (!d) return new Date().toLocaleDateString('pt-BR');
    if (d instanceof Date) return d.toLocaleDateString('pt-BR');
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

function fmtDataExtenso() {
    const d = new Date();
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// ── Meios de pagamento (display) ────────────────────────────────────────────
const MEIO_LABEL = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
    cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
    boleto: 'Boleto', cheque: 'Cheque', '': 'Sem definir',
};

// ── Template padrão do contrato ─────────────────────────────────────────────
export const DEFAULT_CONTRATO_TEMPLATE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MARCENARIA PLANEJADA

Pelo presente instrumento particular, as partes abaixo qualificadas:

CONTRATADA: {empresa_nome}, inscrita no CNPJ sob nº {empresa_cnpj}, com sede em {empresa_endereco}, {empresa_cidade}/{empresa_estado}, telefone {empresa_telefone}, e-mail {empresa_email}.

CONTRATANTE: {cliente_nome}, inscrito(a) no CPF/CNPJ sob nº {cliente_cpf}{cliente_cnpj}, residente em {cliente_endereco}, {cliente_cidade}, telefone {cliente_telefone}, e-mail {cliente_email}.

Celebram o presente contrato, mediante as seguintes cláusulas e condições:

CLÁUSULA 1ª — DO OBJETO
O presente contrato tem por objeto a fabricação e instalação de móveis planejados sob medida para o projeto "{projeto_nome}" (Proposta nº {numero}), compreendendo os seguintes ambientes: {ambientes_lista}.
Local da obra: {endereco_obra}.

CLÁUSULA 2ª — DO VALOR E FORMA DE PAGAMENTO
O valor total dos serviços é de {valor_total} ({valor_total_extenso}), a ser pago conforme condições abaixo:
{parcelas_descricao}
{desconto}

CLÁUSULA 3ª — DO PRAZO DE ENTREGA
O prazo para fabricação e instalação dos móveis é de {prazo_entrega}, contados a partir da aprovação do projeto e confirmação do pagamento da entrada (primeiro bloco de pagamento).
Eventuais atrasos causados por alterações solicitadas pelo CONTRATANTE serão acrescidos ao prazo original.

CLÁUSULA 4ª — DAS OBRIGAÇÕES DO CONTRATANTE
a) Efetuar os pagamentos nas datas e condições estipuladas;
b) Disponibilizar o local da obra em condições adequadas para a instalação (paredes rebocadas, piso instalado, pontos elétricos e hidráulicos finalizados);
c) Aprovar o projeto e eventuais alterações por escrito;
d) Comunicar à CONTRATADA sobre quaisquer irregularidades no local da obra.

CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATADA
a) Fabricar os móveis conforme projeto aprovado e especificações acordadas;
b) Utilizar materiais de primeira qualidade conforme especificado na proposta;
c) Realizar a instalação completa dos móveis no local indicado;
d) Cumprir os prazos estipulados, salvo caso fortuito ou força maior;
e) Fornecer garantia conforme Cláusula 6ª.

CLÁUSULA 6ª — DA GARANTIA
A CONTRATADA oferece garantia de 5 (cinco) anos para defeitos de fabricação, a contar da data de instalação, desde que:
a) Os móveis sejam utilizados em condições normais de uso;
b) Não tenham sido realizadas alterações ou reparos por terceiros;
c) As instruções de conservação e limpeza tenham sido seguidas.
A garantia não cobre danos causados por mau uso, umidade excessiva, exposição direta ao sol ou agentes químicos.

CLÁUSULA 7ª — DAS ALTERAÇÕES NO PROJETO
Qualquer alteração no projeto após aprovação deverá ser solicitada por escrito e poderá implicar em:
a) Alteração no prazo de entrega;
b) Alteração no valor total do contrato.
As alterações somente serão executadas após aprovação formal de ambas as partes.

CLÁUSULA 8ª — DA RESCISÃO
Em caso de rescisão por parte do CONTRATANTE, será devida multa de 20% (vinte por cento) sobre o valor total do contrato, além do pagamento integral dos serviços já executados e materiais já adquiridos.
Em caso de rescisão por parte da CONTRATADA, sem justa causa, esta devolverá os valores pagos, devidamente corrigidos, no prazo de 30 (trinta) dias.

CLÁUSULA 9ª — DO FORO
Fica eleito o foro da comarca de {empresa_cidade}/{empresa_estado} para dirimir quaisquer dúvidas oriundas do presente contrato.

E por estarem de acordo, as partes assinam o presente em duas vias de igual teor.

{empresa_cidade}, {data_hoje}.`;

// ── Substituir variáveis no template ────────────────────────────────────────
function replaceVars(template, vars) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        return vars[key] !== undefined ? vars[key] : match;
    });
}

// ── buildContratoHtml ───────────────────────────────────────────────────────
export function buildContratoHtml({
    empresa, cliente, orcamento, ambientes,
    pagamento, pvComDesconto, template,
    prazoEntrega, enderecoObra, propostaHtml,
}) {
    const descontoR = (pagamento?.desconto?.valor || 0) > 0
        ? (pagamento.desconto.tipo === '%' ? pvComDesconto / (1 - pagamento.desconto.valor / 100) * (pagamento.desconto.valor / 100) : pagamento.desconto.valor)
        : 0;

    // Gerar descrição das parcelas
    const parcelasDesc = (pagamento?.blocos || []).map((b, i) => {
        const val = pvComDesconto * ((Number(b.percentual) || 0) / 100);
        const parc = Number(b.parcelas) || 1;
        const meio = MEIO_LABEL[b.meio] || b.meio;
        const desc = b.descricao || `Pagamento ${i + 1}`;
        if (parc > 1) {
            return `- ${desc}: ${parc}× de R$ ${(val / parc).toFixed(2).replace('.', ',')} via ${meio} (${b.percentual}% = R$ ${val.toFixed(2).replace('.', ',')})`;
        }
        return `- ${desc}: R$ ${val.toFixed(2).replace('.', ',')} via ${meio} (${b.percentual}%)`;
    }).join('\n');

    const descontoDesc = descontoR > 0
        ? `Desconto concedido: ${pagamento.desconto.tipo === '%' ? pagamento.desconto.valor + '%' : 'R$ ' + pagamento.desconto.valor.toFixed(2).replace('.', ',')} (R$ ${descontoR.toFixed(2).replace('.', ',')}).`
        : '';

    const ambientesLista = ambientes.map(a => a.nome).filter(Boolean).join(', ') || '—';

    const vars = {
        empresa_nome: empresa?.nome || '_______________',
        empresa_cnpj: empresa?.cnpj || '_______________',
        empresa_endereco: empresa?.endereco || '_______________',
        empresa_cidade: empresa?.cidade || '_______________',
        empresa_estado: empresa?.estado || '_______________',
        empresa_telefone: empresa?.telefone || '_______________',
        empresa_email: empresa?.email || '_______________',
        cliente_nome: cliente?.nome || '_______________',
        cliente_cpf: cliente?.cpf || '',
        cliente_cnpj: cliente?.cnpj || '',
        cliente_endereco: [cliente?.endereco, cliente?.numero, cliente?.complemento, cliente?.bairro].filter(Boolean).join(', ') || '_______________',
        cliente_cidade: [cliente?.cidade, cliente?.estado].filter(Boolean).join('/') || '_______________',
        cliente_telefone: cliente?.telefone || '_______________',
        cliente_email: cliente?.email || '_______________',
        projeto_nome: orcamento?.projeto || '_______________',
        numero: orcamento?.numero || '_______________',
        endereco_obra: enderecoObra || '_______________',
        prazo_entrega: prazoEntrega || 'A combinar',
        validade_proposta: orcamento?.validadeProposta || '15 dias',
        valor_total: `R$ ${pvComDesconto.toFixed(2).replace('.', ',')}`,
        valor_total_extenso: valorExtenso(pvComDesconto),
        parcelas_descricao: parcelasDesc || 'A definir.',
        desconto: descontoDesc,
        ambientes_lista: ambientesLista,
        data_hoje: fmtDataExtenso(),
    };

    const tpl = template || DEFAULT_CONTRATO_TEMPLATE;
    const conteudo = replaceVars(tpl, vars);

    // ── Cores dinâmicas ──
    const corPrimaria = empresa?.proposta_cor_primaria || '#333333';
    const corAccent = empresa?.proposta_cor_accent || '#555555';

    // ── Logo e watermark ──
    const logoSrc = empresa?.logo_path || empresa?.logo || '';
    const watermarkSrc = empresa?.logo_watermark_path || empresa?.logo_watermark || '';
    const watermarkOpacity = empresa?.logo_watermark_opacity ?? 0.04;

    // ── Info empresa para header ──
    const empresaNome = empresa?.nome || '';
    const empresaCnpj = empresa?.cnpj || '';
    const empresaEnd = [empresa?.endereco, empresa?.cidade ? `${empresa.cidade}/${empresa.estado || ''}` : ''].filter(Boolean).join(', ');
    const empresaContato = [empresa?.telefone, empresa?.email].filter(Boolean);

    // Converter quebras de linha em HTML
    const conteudoHtml = conteudo
        .split('\n')
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            // Detectar cláusulas (títulos) e título do contrato
            if (/^CLÁUSULA\s+\d/i.test(trimmed) || /^CONTRATO DE /i.test(trimmed)) {
                return `<p class="clausula-titulo">${trimmed}</p>`;
            }
            // Itens com letra (a), b), etc)
            if (/^[a-z]\)/.test(trimmed)) {
                return `<p class="item-letra">${trimmed}</p>`;
            }
            // Linhas com "- " (parcelas)
            if (trimmed.startsWith('- ')) {
                return `<p class="item-parcela">• ${trimmed.slice(2)}</p>`;
            }
            return `<p class="texto">${trimmed}</p>`;
        })
        .join('\n');

    // ── Extrair corpo da proposta para anexo ──
    let anexoHtml = '';
    if (propostaHtml) {
        const bodyMatch = propostaHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const styleMatch = propostaHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        if (bodyMatch) {
            anexoHtml = `
    <div style="page-break-before: always"></div>
    <div class="anexo-header">ANEXO I — PROPOSTA COMERCIAL</div>
    <div class="anexo-sub">Parte integrante do contrato · Ref. Proposta nº ${orcamento?.numero || '—'}</div>
    ${styleMatch ? `<style>${styleMatch[1]}</style>` : ''}
    <div class="anexo-content">
        ${bodyMatch[1]}
    </div>`;
        }
    }

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
    @page { margin: 20mm 18mm; size: A4; }
    body {
        font-family: 'Segoe UI', Tahoma, Geneva, sans-serif;
        color: #333; line-height: 1.6;
        margin: 0; padding: 0;
    }

    /* ══════════ WATERMARK ══════════ */
    .wm {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        opacity: ${watermarkOpacity}; z-index: -1; pointer-events: none;
    }
    .wm img { width: 480px; height: auto; }

    /* ══════════ HEADER ══════════ */
    .header {
        display: flex; align-items: center;
        gap: 16px; padding-bottom: 12px;
        border-bottom: 2.5px solid ${corPrimaria};
        margin-bottom: 20px;
    }
    .header-logo img {
        max-height: 60px; max-width: 110px;
        object-fit: contain;
    }
    .header-info { flex: 1; }
    .h-detail {
        font-size: 10.5px; color: #666;
        line-height: 1.5; margin-top: 2px;
    }

    /* ══════════ TÍTULO ══════════ */
    .contrato-titulo {
        text-align: center; margin: 8px 0 4px;
        font-size: 15px; font-weight: 700;
        color: ${corPrimaria}; letter-spacing: 1px;
        text-transform: uppercase;
    }
    .contrato-sub {
        text-align: center; font-size: 10px;
        color: #888; margin-bottom: 20px;
    }

    /* ══════════ CONTEÚDO ══════════ */
    .content { margin-bottom: 10px; }
    .clausula-titulo {
        margin: 20px 0 6px; font-weight: 700;
        font-size: 12px; color: ${corPrimaria};
    }
    .texto {
        margin: 3px 0; font-size: 11.5px;
        line-height: 1.7; text-align: justify;
        color: #444;
    }
    .item-letra {
        margin: 2px 0 2px 24px;
        font-size: 11px; color: #444;
    }
    .item-parcela {
        margin: 2px 0 2px 16px;
        font-size: 11px; color: #444;
    }

    /* ══════════ ASSINATURAS ══════════ */
    .sig-section { margin-top: 50px; page-break-inside: avoid; }
    .sig-date {
        font-size: 12px; color: #555;
        margin-bottom: 50px;
    }
    .sig-grid {
        display: flex; justify-content: space-between;
        gap: 80px;
    }
    .sig-block { flex: 1; text-align: center; }
    .sig-line { border-top: 1px solid #555; padding-top: 6px; }
    .sig-name { font-size: 12px; font-weight: 700; color: #222; }
    .sig-role { font-size: 10px; color: #888; margin-top: 1px; }
    .sig-doc { font-size: 8px; color: #bbb; margin-top: 2px; }

    /* ══════════ FOOTER ══════════ */
    .footer {
        margin-top: 30px; text-align: center;
        font-size: 9px; color: #bbb;
        border-top: 1px solid #eee; padding-top: 8px;
    }

    /* ══════════ ANEXO ══════════ */
    .anexo-header {
        text-align: center; font-size: 14px;
        font-weight: 700; color: ${corPrimaria};
        letter-spacing: 1px; margin: 20px 0 4px;
        text-transform: uppercase;
    }
    .anexo-sub {
        text-align: center; font-size: 10px;
        color: #888; margin-bottom: 16px;
    }
    .anexo-content { }
</style></head><body>

    <!-- ═══ WATERMARK ═══ -->
    ${watermarkSrc ? `<div class="wm"><img src="${watermarkSrc}" /></div>` : ''}

    <!-- ═══ HEADER ═══ -->
    <div class="header">
        ${logoSrc ? `<div class="header-logo"><img src="${logoSrc}" /></div>` : ''}
        <div class="header-info">
            ${empresaCnpj ? `<div class="h-detail">CNPJ: ${empresaCnpj}</div>` : ''}
            ${empresaEnd ? `<div class="h-detail">${empresaEnd}</div>` : ''}
            ${empresaContato.length > 0 ? `<div class="h-detail">${empresaContato.join(' · ')}</div>` : ''}
        </div>
    </div>

    <!-- ═══ TÍTULO ═══ -->
    <div class="contrato-titulo">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</div>
    <div class="contrato-sub">${orcamento?.numero ? `Ref. Proposta nº ${orcamento.numero} · ` : ''}${fmtData()}</div>

    <!-- ═══ CONTEÚDO ═══ -->
    <div class="content">
        ${conteudoHtml}
    </div>

    <!-- ═══ ASSINATURAS ═══ -->
    <div class="sig-section">
        <div class="sig-date"><strong>${empresa?.cidade || ''}${empresa?.estado ? '/' + empresa.estado : ''}</strong>, ${fmtDataExtenso()}.</div>
        <div class="sig-grid">
            <div class="sig-block">
                <div class="sig-line">
                    <div class="sig-name">${empresaNome || 'CONTRATADA'}</div>
                    <div class="sig-role">CONTRATADA</div>
                    ${empresaCnpj ? `<div class="sig-doc">CNPJ: ${empresaCnpj}</div>` : ''}
                </div>
            </div>
            <div class="sig-block">
                <div class="sig-line">
                    <div class="sig-name">${cliente?.nome || 'CONTRATANTE'}</div>
                    <div class="sig-role">CONTRATANTE</div>
                    ${(cliente?.cpf || cliente?.cnpj) ? `<div class="sig-doc">${cliente?.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}: ${cliente?.tipo_pessoa === 'juridica' ? (cliente?.cnpj || '') : (cliente?.cpf || '')}</div>` : ''}
                </div>
            </div>
        </div>
    </div>

    <!-- ═══ FOOTER ═══ -->
    <div class="footer">
        Documento gerado em ${fmtData()} · ${empresa?.nome || ''} · ${empresa?.telefone || ''} · ${empresa?.email || ''}
    </div>

    <!-- ═══ ANEXO I — PROPOSTA ═══ -->
    ${anexoHtml}

</body></html>`;
}
