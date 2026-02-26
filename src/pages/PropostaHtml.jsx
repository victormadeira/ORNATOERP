import { R$, N, calcItemV2, calcPainelRipado, precoVenda, FERR_GROUPS } from '../engine';

// ── Meios de pagamento (display) ────────────────────────────────────────────
const MEIO_LABEL = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
    cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
    boleto: 'Boleto', cheque: 'Cheque', '': 'Sem definir',
};

// ── Defaults para textos configuráveis ──────────────────────────────────────
const DEFAULT_GARANTIA = 'Garantia de 5 (cinco) anos para defeitos de fabricação, em condições normais de uso. Toda ferragem utilizada na fabricação e montagem é de primeira linha. A garantia não cobre danos causados por mau uso, umidade excessiva ou exposição direta ao sol.';
const DEFAULT_CONSIDERACOES = 'Os materiais e acabamentos poderão sofrer pequenas variações de tonalidade conforme lote de fabricação. Eventuais alterações no projeto após aprovação poderão implicar em ajuste de prazo e valores. O local da obra deverá estar em condições adequadas para instalação (paredes rebocadas, piso instalado, pontos elétricos e hidráulicos finalizados).';

// ── Resolver nome de material pela bib ──────────────────────────────────────
function matNome(id, bib) {
    if (!id) return null;
    const chapas = bib?.chapas || [];
    const acabamentos = bib?.acabamentos || [];
    return chapas.find(c => c.id === id)?.nome
        || acabamentos.find(a => a.id === id)?.nome
        || id;
}

// ── Calcular custo por ambiente (mesma lógica do Novo.jsx) ──────────────────
function calcAmbCustos(ambientes, bib, padroes, taxas) {
    const results = [];
    ambientes.forEach(amb => {
        let ambCm = 0;
        const itemDetails = [];

        // ── Ambiente manual: linhas com valor de venda direto ──
        if (amb.tipo === 'manual') {
            (amb.linhas || []).forEach(ln => {
                const sub = (ln.qtd || 0) * (ln.valorUnit || 0);
                ambCm += sub;
                itemDetails.push({
                    nome: ln.descricao || 'Item manual',
                    dims: null,
                    qtd: ln.qtd || 1,
                    custo: sub,
                    componentes: [],
                    tipo: 'manual',
                    mats: {},
                });
            });
            results.push({ id: amb.id, nome: amb.nome, custo: ambCm, itens: itemDetails, manual: true });
            return;
        }

        // ── Ambiente calculadora (padrão) ──
        (amb.itens || []).forEach(item => {
            try {
                const res = calcItemV2(item.caixaDef, item.dims, item.mats, item.componentes.map(ci => ({
                    compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                    matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                })), bib, padroes);
                const coef = item.caixaDef?.coef || 0;
                const cc = res.custo * (1 + coef) * (item.qtd || 1);
                ambCm += cc;
                itemDetails.push({
                    nome: item.desc || item.caixaDef?.nome || 'Item',
                    dims: item.dims,
                    qtd: item.qtd || 1,
                    custo: cc,
                    componentes: item.componentes,
                    ajuste: item.ajuste,
                    tipo: 'modulo',
                    mats: item.mats || {},
                });
            } catch (_) { }
        });
        (amb.paineis || []).forEach(p => {
            try {
                const res = calcPainelRipado(p, bib);
                ambCm += res.custoMaterial * (p.qtd || 1);
                itemDetails.push({
                    nome: p.nome || `Painel ${p.tipo === 'muxarabi' ? 'Muxarabi' : 'Ripado'}`,
                    dims: { L: p.L, A: p.A },
                    qtd: p.qtd || 1,
                    custo: res.custoMaterial * (p.qtd || 1),
                    componentes: [],
                    tipo: 'painel',
                    mats: {},
                });
            } catch (_) { }
        });
        results.push({ id: amb.id, nome: amb.nome, custo: ambCm, itens: itemDetails, manual: false });
    });
    return results;
}

// ── Formatar data ───────────────────────────────────────────────────────────
function fmtDataExtenso() {
    const d = new Date();
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function fmtData() {
    return new Date().toLocaleDateString('pt-BR');
}

// ── buildPropostaHtml ───────────────────────────────────────────────────────
export function buildPropostaHtml({
    empresa, cliente, orcamento, ambientes, tot, taxas,
    pagamento, pvComDesconto, bib, padroes, nivel = 'geral',
    prazoEntrega, enderecoObra, validadeProposta,
}) {
    const ambCustos = calcAmbCustos(ambientes, bib, padroes, taxas);
    const totalCusto = ambCustos.reduce((s, a) => s + a.custo, 0);

    const descontoR = (pagamento?.desconto?.valor || 0) > 0
        ? (pagamento.desconto.tipo === '%' ? tot.pvFinal * (pagamento.desconto.valor / 100) : Math.min(pagamento.desconto.valor, tot.pvFinal))
        : 0;

    // Proporcional: valor de venda do ambiente
    // Manual = valor direto (já é preço de venda); Calculadora = proporcional do restante
    const manualTotalProp = ambCustos.filter(a => a.manual).reduce((s, a) => s + a.custo, 0);
    const calcCustoTotal = ambCustos.filter(a => !a.manual).reduce((s, a) => s + a.custo, 0);
    const calcPvPool = pvComDesconto - manualTotalProp; // valor a distribuir entre calculadoras

    const ambValores = ambCustos.map(a => {
        if (a.manual) {
            // Ambiente manual: valor de venda = valor das linhas (sem markup)
            // Desconto proporcional: mesma fração do total
            const fracDesc = tot.pvFinal > 0 ? a.custo / tot.pvFinal : 0;
            const ambVenda = a.custo - (descontoR * fracDesc);
            return {
                ...a,
                valorVenda: ambVenda,
                itens: a.itens.map(it => ({
                    ...it,
                    valorVenda: a.custo > 0 ? (it.custo / a.custo) * ambVenda : 0,
                })),
            };
        }
        // Ambiente calculadora: distribuir pool proporcional ao custo
        const ambVenda = calcCustoTotal > 0 ? (a.custo / calcCustoTotal) * calcPvPool : 0;
        return {
            ...a,
            valorVenda: ambVenda,
            itens: a.itens.map(it => ({
                ...it,
                valorVenda: calcCustoTotal > 0 ? (it.custo / calcCustoTotal) * calcPvPool : 0,
            })),
        };
    });

    // ── Config ──────────────────────────────────────────────────────────────
    const logoSrc = empresa?.logo_header_path || empresa?.logo || '';
    const watermarkSrc = empresa?.logo_watermark_path || empresa?.logo_watermark || '';
    const watermarkOpacity = empresa?.logo_watermark_opacity ?? 0.04;
    const corPrimaria = empresa?.proposta_cor_primaria || '#333333';
    const corAccent = empresa?.proposta_cor_accent || '#555555';

    const sobreEmpresa = empresa?.proposta_sobre || '';
    const txtGarantia = empresa?.proposta_garantia || DEFAULT_GARANTIA;
    const txtConsideracoes = empresa?.proposta_consideracoes || DEFAULT_CONSIDERACOES;
    const txtRodape = empresa?.proposta_rodape || '';

    const empresaNome = empresa?.nome || '';
    const empresaCnpj = empresa?.cnpj || '';
    const empresaEnd = [empresa?.endereco, empresa?.cidade ? `${empresa.cidade}/${empresa.estado || ''}` : ''].filter(Boolean).join(' - ');
    const empresaContato = [empresa?.telefone, empresa?.email].filter(Boolean);

    // ── Ambientes HTML ────────────────────────────────────────────────────────
    const ambientesHtml = ambValores.map(amb => {
        const showAmbValor = nivel !== 'geral';
        const showItemValor = nivel === 'detalhado';

        const itemsHtml = amb.itens.map(it => {
            const descParts = [];
            descParts.push(it.nome);
            if (it.dims) {
                const dimStr = [it.dims.L && `${it.dims.L}`, it.dims.A && `${it.dims.A}`, it.dims.P && `${it.dims.P}`].filter(Boolean).join(' × ');
                if (dimStr) descParts.push(`${dimStr} mm`);
            }

            // ── Acabamentos (materiais internos/externos) ──
            const acabParts = [];
            if (it.mats?.matExt) {
                const nomeExt = matNome(it.mats.matExt, bib);
                if (nomeExt) acabParts.push(`Externo: ${nomeExt}`);
            }
            if (it.mats?.matInt) {
                const nomeInt = matNome(it.mats.matInt, bib);
                if (nomeInt) acabParts.push(`Interno: ${nomeInt}`);
            }
            const acabHtml = acabParts.length > 0
                ? `<div class="item-acab">${acabParts.join(' · ')}</div>`
                : '';

            const compNames = (it.componentes || [])
                .map(c => {
                    const nome = c.compDef?.nome || c.nome || '';
                    const qtd = c.qtd || 1;
                    return qtd > 1 ? `${nome} (×${qtd})` : nome;
                })
                .filter(Boolean);

            const ferragensDB = bib?.ferragens || [];
            const ferragens = (it.componentes || []).flatMap(c => {
                const subDefs = c.compDef?.sub_itens || [];
                return Object.entries(c.subItens || {})
                    .filter(([, v]) => v && v !== 'nenhum' && v !== '' && v !== false)
                    .map(([siId]) => {
                        const si = subDefs.find(s => s.id === siId);
                        if (!si) return '';
                        // Resolver ferragem efetiva via padrões globais
                        let effId = si.ferrId;
                        for (const [grp, ids] of Object.entries(FERR_GROUPS)) {
                            if (ids.includes(si.ferrId) && padroes?.[grp]) { effId = padroes[grp]; break; }
                        }
                        const fe = ferragensDB.find(f => f.id === effId) || ferragensDB.find(f => f.id === si.ferrId);
                        return fe?.nome || si.nome || '';
                    })
                    .filter(Boolean);
            });

            const details = [...compNames, ...ferragens];
            const detailsHtml = details.length > 0
                ? `<div class="item-details">${details.join(' · ')}</div>`
                : '';

            const dimsLine = descParts.length > 1 ? ` <span class="dims">(${descParts[1]})</span>` : '';

            return `<tr>
                    <td class="td-desc">
                        <span class="item-name">${descParts[0]}</span>${dimsLine}
                        ${acabHtml}
                        ${detailsHtml}
                    </td>
                    <td class="td-qtd">${it.qtd}</td>
                    ${showItemValor ? `<td class="td-val">${R$(it.valorVenda)}</td>` : ''}
                    ${showItemValor ? `<td class="td-sub">${R$(it.valorVenda * it.qtd)}</td>` : ''}
                </tr>`;
        }).join('');

        return `
            <div class="amb-block">
                <div class="amb-title">${amb.nome || 'Ambiente'}</div>
                <table class="tb">
                    <thead>
                        <tr>
                            <th class="th-desc">DESCRIÇÃO</th>
                            <th class="th-qtd">QTD</th>
                            ${showItemValor ? '<th class="th-val">VALOR</th>' : ''}
                            ${showItemValor ? '<th class="th-sub">SUB-TOTAL</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                ${showAmbValor ? `
                    <div class="amb-total">
                        <span>Total ${amb.nome || 'Ambiente'}:</span>
                        <span>${R$(amb.valorVenda)}</span>
                    </div>
                ` : ''}
            </div>`;
    }).join('');

    // ── Resumo ──────────────────────────────────────────────────────────────
    const resumoHtml = `
        <div class="resumo">
            <table class="resumo-tb">
                ${descontoR > 0 ? `
                <tr>
                    <td class="r-label">VALOR DOS AMBIENTES</td>
                    <td class="r-value">${R$(tot.pvFinal)}</td>
                </tr>
                <tr class="r-desc">
                    <td class="r-label">DESCONTO (${pagamento.desconto.tipo === '%' ? N(pagamento.desconto.valor, 1) + '%' : R$(pagamento.desconto.valor)})</td>
                    <td class="r-value" style="color:#c0392b">- ${R$(descontoR)}</td>
                </tr>` : `
                <tr>
                    <td class="r-label">VALOR DOS AMBIENTES</td>
                    <td class="r-value">${R$(pvComDesconto)}</td>
                </tr>`}
                <tr class="r-total">
                    <td class="r-label">VALOR TOTAL</td>
                    <td class="r-value">${R$(pvComDesconto)}</td>
                </tr>
            </table>
        </div>`;

    // ── Pagamento ───────────────────────────────────────────────────────────
    const pagamentoHtml = (pagamento?.blocos || []).length > 0 ? `
        <div class="section">
            <div class="sec-title">CONDIÇÕES DE PAGAMENTO</div>
            <table class="tb pag-tb">
                <thead>
                    <tr>
                        <th style="text-align:left">ETAPA</th>
                        <th>MEIO</th>
                        <th>PARCELAS</th>
                        <th style="text-align:right">VALOR</th>
                    </tr>
                </thead>
                <tbody>
                    ${pagamento.blocos.map((b, i) => {
                        const val = pvComDesconto * ((Number(b.percentual) || 0) / 100);
                        const parc = Number(b.parcelas) || 1;
                        return `<tr>
                            <td style="text-align:left;font-weight:500">${b.descricao || `Pagamento ${i + 1}`} (${N(b.percentual, 0)}%)</td>
                            <td>${MEIO_LABEL[b.meio] || b.meio}</td>
                            <td>${parc > 1 ? `${parc}× de ${R$(val / parc)}` : 'À vista'}</td>
                            <td style="text-align:right;font-weight:600">${R$(val)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    ` : '';

    // ── Considerações ───────────────────────────────────────────────────────
    const condicoesHtml = `
        <div class="section">
            <div class="sec-title">CONSIDERAÇÕES FINAIS</div>
            ${txtGarantia ? `<p class="txt">${txtGarantia}</p>` : ''}
            <p class="txt">Prazo de entrega: <strong>${prazoEntrega || 'A combinar'}</strong> após aprovação do projeto.</p>
            <p class="txt">Validade desta proposta: <strong>${validadeProposta || '15 dias'}</strong>.</p>
            ${enderecoObra ? `<p class="txt">Local da obra: <strong>${enderecoObra}</strong>.</p>` : ''}
            ${txtConsideracoes ? `<p class="txt">${txtConsideracoes}</p>` : ''}
            ${orcamento.obs ? `<p class="txt"><strong>Observações:</strong> ${orcamento.obs}</p>` : ''}
        </div>`;

    // ── Sobre (opcional) ─────────────────────────────────────────────────────
    const sobreHtml = sobreEmpresa ? `
        <div class="sobre">${sobreEmpresa.replace(/\n/g, '<br>')}</div>` : '';

    // ── HTML ────────────────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
    @page {
        margin: 22mm 18mm 26mm 18mm;
        size: A4;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #333;
        font-size: 12px;
        line-height: 1.5;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    @media screen {
        body {
            padding: 40px 50px 60px;
            max-width: 860px;
            margin: 0 auto;
        }
    }

    /* ── Watermark ── */
    .wm {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        opacity: ${watermarkOpacity}; z-index: -1; pointer-events: none;
    }
    .wm img { width: 480px; height: auto; }

    /* ══════════ HEADER ══════════ */
    .header {
        display: flex;
        align-items: center;
        gap: 16px;
        padding-bottom: 12px;
        border-bottom: 2.5px solid ${corPrimaria};
        margin-bottom: 16px;
    }
    .header-logo img {
        max-height: 60px;
        max-width: 110px;
        object-fit: contain;
    }
    .header-info { flex: 1; }
    .h-detail {
        font-size: 10.5px; color: #666;
        line-height: 1.5; margin-top: 2px;
    }

    /* ══════════ PROPOSAL NUM + CLIENT ══════════ */
    .prop-num {
        font-size: 14px; font-weight: 700;
        color: ${corPrimaria};
        text-align: center;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid #ddd;
        letter-spacing: 1px;
    }

    .client-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 18px;
    }
    .client-col {}
    .client-col-r { text-align: right; }
    .c-field { font-size: 12px; margin-bottom: 2px; color: #444; }
    .c-field strong { color: #222; }

    /* ── Sobre ── */
    .sobre {
        font-size: 11px; color: #666;
        font-style: italic; line-height: 1.7;
        padding: 10px 14px; margin-bottom: 16px;
        border-left: 3px solid ${corAccent};
        background: #fafafa;
    }

    /* ══════════ AMBIENTE BLOCK ══════════ */
    .amb-block {
        margin-bottom: 20px;
        page-break-inside: avoid;
    }
    .amb-title {
        font-size: 13px; font-weight: 700;
        color: ${corPrimaria};
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        margin-bottom: 6px;
        padding: 5px 0;
    }

    /* ── Tables ── */
    .tb {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #aaa;
    }
    .tb th {
        font-size: 10px; font-weight: 700;
        color: #333;
        padding: 6px 10px;
        border: 1px solid #aaa;
        text-align: center;
        background: #f5f5f5;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .th-desc { text-align: left !important; }
    .th-qtd { width: 45px; }
    .th-val { width: 85px; }
    .th-sub { width: 95px; }

    .tb td {
        padding: 5px 10px;
        border-left: 1px solid #ccc;
        border-right: 1px solid #ccc;
        border-bottom: 1px solid #e0e0e0;
        vertical-align: top;
    }
    .td-desc { text-align: left; }
    .td-qtd { text-align: center; vertical-align: middle; color: #555; }
    .td-val { text-align: right; vertical-align: middle; white-space: nowrap; color: #444; }
    .td-sub { text-align: right; vertical-align: middle; white-space: nowrap; font-weight: 600; color: #222; }

    .item-name { font-weight: 600; color: #222; }
    .dims { font-size: 10px; color: #999; }
    .item-acab {
        font-size: 10px; color: ${corAccent};
        margin-top: 2px; line-height: 1.4;
        font-weight: 500;
    }
    .item-details {
        font-size: 10px; color: #777;
        margin-top: 2px; line-height: 1.5;
    }

    .amb-total {
        display: flex; justify-content: space-between;
        padding: 6px 10px;
        border: 1px solid #aaa; border-top: none;
        font-weight: 700; font-size: 12px;
        color: #222; background: #f5f5f5;
    }

    /* ══════════ RESUMO ══════════ */
    .resumo { margin: 22px 0 10px; }
    .resumo-tb { width: 100%; border-collapse: collapse; }
    .resumo-tb td { padding: 5px 10px; font-size: 12px; }
    .r-label { text-align: left; font-weight: 600; color: #333; border-bottom: 1px dotted #ccc; }
    .r-value { text-align: right; font-weight: 700; color: #222; border-bottom: 1px dotted #ccc; width: 130px; }
    .r-total td {
        font-size: 14px; font-weight: 800;
        border-bottom: 2.5px solid ${corPrimaria};
        padding-top: 8px; padding-bottom: 8px;
        color: ${corPrimaria};
    }
    .r-desc td { font-size: 11px; }

    /* ══════════ SECTIONS ══════════ */
    .section { margin: 20px 0; page-break-inside: avoid; }
    .sec-title {
        font-size: 13px; font-weight: 700;
        color: ${corPrimaria};
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .txt {
        font-size: 11.5px; color: #555;
        line-height: 1.7; margin-bottom: 5px;
    }

    /* ── Payment table ── */
    .pag-tb th { background: #f5f5f5; }
    .pag-tb td { text-align: center; font-size: 12px; }

    /* ══════════ SIGNATURE ══════════ */
    .sig-section { margin-top: 50px; page-break-inside: avoid; }
    .sig-date {
        font-size: 12px; color: #555;
        margin-bottom: 50px;
    }
    .sig-grid { display: flex; justify-content: space-between; gap: 80px; }
    .sig-block { flex: 1; text-align: center; }
    .sig-line { border-top: 1px solid #555; padding-top: 6px; }
    .sig-name { font-size: 12px; font-weight: 700; color: #222; }
    .sig-role { font-size: 10px; color: #888; margin-top: 1px; }
    .sig-doc { font-size: 8px; color: #bbb; margin-top: 2px; }

    /* ══════════ FOOTER ══════════ */
    .footer {
        margin-top: 24px; padding-top: 10px;
        border-top: 1px solid #ddd;
        text-align: center;
        font-size: 9px; color: #bbb;
        line-height: 1.6;
    }

</style></head><body>

    <!-- Watermark (só aparece se configurado) -->
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

    <!-- ═══ PROPOSAL NUMBER ═══ -->
    <div class="prop-num">PROPOSTA N° ${orcamento.numero || '—'}</div>

    <!-- ═══ CLIENT INFO ═══ -->
    <div class="client-row">
        <div class="client-col">
            <div class="c-field"><strong>Cliente:</strong> ${cliente?.nome || '—'}</div>
            ${(cliente?.cpf || cliente?.cnpj) ? `<div class="c-field"><strong>${cliente?.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}:</strong> ${cliente?.tipo_pessoa === 'juridica' ? (cliente?.cnpj || '—') : (cliente?.cpf || '—')}</div>` : ''}
            ${cliente?.telefone ? `<div class="c-field"><strong>Telefone:</strong> ${cliente.telefone}</div>` : ''}
            ${cliente?.email ? `<div class="c-field"><strong>Email:</strong> ${cliente.email}</div>` : ''}
        </div>
        <div class="client-col-r">
            ${orcamento.projeto ? `<div class="c-field"><strong>Projeto:</strong> ${orcamento.projeto}</div>` : ''}
            ${enderecoObra ? `<div class="c-field"><strong>Local da Obra:</strong> ${enderecoObra}</div>` : ''}
            <div class="c-field"><strong>Data:</strong> ${fmtData()}</div>
        </div>
    </div>

    <!-- ═══ SOBRE ═══ -->
    ${sobreHtml}

    <!-- ═══ AMBIENTES ═══ -->
    ${ambientesHtml}

    <!-- ═══ RESUMO ═══ -->
    ${resumoHtml}

    <!-- ═══ PAGAMENTO ═══ -->
    ${pagamentoHtml}

    <!-- ═══ CONSIDERAÇÕES ═══ -->
    ${condicoesHtml}

    <!-- ═══ ASSINATURA ═══ -->
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
        ${txtRodape ? `<div style="margin-bottom:3px">${txtRodape}</div>` : ''}
        <div>${empresaNome}${empresaContato.length > 0 ? ` · ${empresaContato.join(' · ')}` : ''}</div>
        <div>Documento gerado em ${fmtData()}</div>
    </div>

</body></html>`;
}
