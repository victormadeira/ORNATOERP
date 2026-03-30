import { R$, N, calcItemV2, calcPainelRipado, calcItemEspecial, TIPOS_ESPECIAIS, precoVenda, FERR_GROUPS, DB_FERRAGENS } from '../engine';

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
        let ambAvulso = 0;
        const itemDetails = [];

        // ── Ambiente manual: blocos descritivos ou linhas legadas ──
        if (amb.tipo === 'manual') {
            (amb.linhas || []).forEach(ln => {
                if (ln.tipo === 'bloco') {
                    const val = Number(ln.valor) || 0;
                    ambCm += val;
                    itemDetails.push({
                        nome: ln.titulo || 'Item',
                        descricaoBloco: ln.descricao || '',
                        marcador: ln.marcador || 'bullet',
                        dims: null,
                        qtd: 1,
                        custo: val,
                        componentes: [],
                        tipo: 'bloco',
                        mats: {},
                    });
                } else {
                    // Compatibilidade com linhas antigas
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
                }
            });
            results.push({ id: amb.id, nome: amb.nome, custo: ambCm, itens: itemDetails, manual: true });
            return;
        }

        // ── Ambiente calculadora (padrão) ──
        (amb.itens || []).forEach(item => {
            // Item avulso: valor direto, sem calcItemV2
            if (item.tipo === 'avulso') {
                const avValor = (Number(item.valor) || 0) * (item.qtd || 1);
                ambCm += avValor;
                ambAvulso += avValor;
                itemDetails.push({
                    nome: item.nome || 'Item avulso', dims: null, qtd: item.qtd || 1, custo: avValor,
                    componentes: [], tipo: 'avulso', mats: {}, desc: item.desc || '',
                    grupo_id: item.grupo_id || '',
                });
                return;
            }
            try {
                const res = calcItemV2(item.caixaDef, item.dims, item.mats, item.componentes.map(ci => ({
                    compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                    matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                })), bib, padroes);
                const coef = item.caixaDef?.coef || 0;
                let cc = res.custo * (1 + coef) * (item.qtd || 1);
                // ── Adicionar custo do ripado dentro do módulo ──
                if (item.ripado) {
                    try {
                        const ripCfg = { ...item.ripado, L: item.dims?.l || 0, A: item.dims?.a || 0 };
                        const ripRes = calcPainelRipado(ripCfg, bib);
                        if (ripRes) {
                            const rCoef = item.ripado.coefDificuldade ?? 1.3;
                            cc += ripRes.custoMaterial * rCoef * (item.qtd || 1);
                        }
                    } catch (_) { }
                }
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
                    grupo_id: item.grupo_id || '',
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
                    grupo_id: p.grupo_id || '',
                });
            } catch (_) { }
        });
        // ── Itens Especiais ──
        (amb.itensEspeciais || []).forEach(ie => {
            try {
                const res = calcItemEspecial(ie, bib?.raw || []);
                const tipoLabel = (TIPOS_ESPECIAIS.find(t => t.id === ie.tipo)?.nome) || ie.tipo;
                ambCm += res.custo;
                itemDetails.push({
                    nome: ie.nome || tipoLabel,
                    dims: ie.L > 0 && ie.A > 0 ? { l: ie.L, a: ie.A } : null,
                    qtd: ie.qtd || 1,
                    custo: res.custo,
                    componentes: [],
                    tipo: 'especial',
                    tipoEspecial: ie.tipo,
                    mats: {},
                    grupo_id: ie.grupo_id || '',
                });
            } catch (_) { }
        });
        results.push({ id: amb.id, nome: amb.nome, custo: ambCm, itens: itemDetails, manual: false, avulso: ambAvulso, grupos: amb.grupos || [] });
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

// ── Agrupar itens por grupos (pai/filhos) ───────────────────────────────────
function agruparItens(itens, grupos) {
    const result = [];
    const grupoMap = {};
    // Criar placeholders para cada grupo
    for (const g of (grupos || [])) {
        grupoMap[g.id] = { nome: g.nome || 'Grupo', qtd: 1, valorVenda: 0, _agrupado: true, _temFilho: false, dims: null, componentes: [], mats: {}, tipo: 'grupo', desc: '' };
        result.push(grupoMap[g.id]);
    }
    // Distribuir itens — grupo sempre qty 1, soma só o valor
    for (const it of itens) {
        const gid = (it.grupo_id || '').trim();
        if (gid && grupoMap[gid]) {
            grupoMap[gid].valorVenda += (it.valorVenda || 0);
            grupoMap[gid]._temFilho = true;
        } else {
            result.push(it);
        }
    }
    // Remover grupos vazios (sem filhos)
    return result.filter(it => !it._agrupado || it._temFilho);
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
    // Manual = valor direto (já é PV); Avulso = PV direto; Calculadora = proporcional do restante
    const manualTotalProp = ambCustos.filter(a => a.manual).reduce((s, a) => s + a.custo, 0);
    const avulsoTotalProp = ambCustos.reduce((s, a) => s + (a.avulso || 0), 0);
    // Custo de módulos/paineis/especiais (sem avulso)
    const calcCustoSemAvulso = ambCustos.filter(a => !a.manual).reduce((s, a) => s + a.custo - (a.avulso || 0), 0);
    // Fração de desconto proporcional
    const discountRatio = tot.pvFinal > 0 ? pvComDesconto / tot.pvFinal : 1;
    // Pool para distribuir proporcionalmente entre módulos (exclui manual e avulso)
    const calcPvPool = pvComDesconto - manualTotalProp * discountRatio - avulsoTotalProp * discountRatio;

    const ambValores = ambCustos.map(a => {
        if (a.manual) {
            // Ambiente manual: valor de venda = valor das linhas com desconto proporcional
            const ambVenda = a.custo * discountRatio;
            return {
                ...a,
                valorVenda: ambVenda,
                itens: a.itens.map(it => ({
                    ...it,
                    valorVenda: a.custo > 0 ? (it.custo / a.custo) * ambVenda : 0,
                })),
            };
        }
        // Ambiente calculadora: módulos proporcionais + avulsos diretos
        const ambAvulso = (a.avulso || 0) * discountRatio;
        const ambModuleCusto = a.custo - (a.avulso || 0);
        const moduleShare = calcCustoSemAvulso > 0 ? (ambModuleCusto / calcCustoSemAvulso) * calcPvPool : 0;
        const ambVenda = moduleShare + ambAvulso;
        return {
            ...a,
            valorVenda: ambVenda,
            itens: a.itens.map(it => ({
                ...it,
                valorVenda: it.tipo === 'avulso'
                    ? it.custo * discountRatio
                    : (calcCustoSemAvulso > 0 ? (it.custo / calcCustoSemAvulso) * calcPvPool : 0),
            })),
        };
    });

    // ── Config ──────────────────────────────────────────────────────────────
    const logoSrc = empresa?.logo_header_path || empresa?.logo || '';
    const watermarkSrc = empresa?.logo_watermark_path || empresa?.logo_watermark || '';
    const watermarkOpacity = empresa?.logo_watermark_opacity ?? 0.04;
    const corPrimaria = empresa?.proposta_cor_primaria || '#1B2A4A';
    const corAccent = empresa?.proposta_cor_accent || '#C9A96E';

    const sobreEmpresa = empresa?.proposta_sobre || '';
    const txtGarantia = empresa?.proposta_garantia || DEFAULT_GARANTIA;
    const txtConsideracoes = empresa?.proposta_consideracoes || DEFAULT_CONSIDERACOES;
    const txtRodape = empresa?.proposta_rodape || '';
    const txtIncluso = empresa?.proposta_incluso || 'Projeto 3D personalizado;Produção própria com maquinário industrial;Entrega e instalação no local;Acabamento premium e ferragens de primeira linha;Garantia de fábrica';

    const empresaNome = empresa?.nome || '';
    const empresaCnpj = empresa?.cnpj || '';
    const empresaEnd = [empresa?.endereco, empresa?.cidade ? `${empresa.cidade}/${empresa.estado || ''}` : ''].filter(Boolean).join(' - ');
    const empresaContato = [empresa?.telefone, empresa?.email].filter(Boolean);

    // ── Ambientes HTML ────────────────────────────────────────────────────────
    const ambientesHtml = ambValores.map((amb, ambIdx) => {
        const numLabel = String(ambIdx + 1).padStart(2, '0');
        const showAmbValor = nivel !== 'geral';
        const showItemValor = nivel === 'detalhado';

        const itensRender = agruparItens(amb.itens, amb.grupos);
        const itemsHtml = itensRender.map(it => {
            // ── Bloco descritivo: só linhas com marcadores (título é interno) ──
            if (it.tipo === 'bloco') {
                const lines = (it.descricaoBloco || '').split('\n').filter(l => l.trim());
                const marc = it.marcador || 'bullet';
                const linesHtml = lines.map((l, i) => {
                    const prefix = marc === 'bullet' ? '• ' : marc === 'number' ? `${i + 1}. ` : marc === 'dash' ? '— ' : '';
                    return `<div class="bloco-line">${prefix}${l.trim()}</div>`;
                }).join('');
                return `<tr>
                    <td class="td-desc">
                        ${linesHtml || '<span class="item-name">Item</span>'}
                    </td>
                    <td class="td-qtd">1</td>
                    ${showItemValor ? `<td class="td-val">${R$(it.valorVenda)}</td>` : ''}
                    ${showItemValor ? `<td class="td-sub">${R$(it.valorVenda)}</td>` : ''}
                </tr>`;
            }

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

            const ferragensDB = bib?.ferragens || DB_FERRAGENS;
            const ferragens = (it.componentes || []).flatMap(c => {
                const subDefs = c.compDef?.sub_itens || [];
                return Object.entries(c.subItens || {})
                    .filter(([, v]) => v && v !== 'nenhum' && v !== '' && v !== false)
                    .map(([siId]) => {
                        const si = subDefs.find(s => s.id === siId);
                        if (!si) return '';
                        // Resolver ferragem efetiva via padrões globais (por categoria)
                        let effId = si.ferrId;
                        const siCat = ferragensDB.find(f => f.id === si.ferrId)?.categoria?.toLowerCase() || '';
                        for (const [grp, cat] of Object.entries(FERR_GROUPS)) {
                            if (siCat === cat.toLowerCase() && padroes?.[grp]) { effId = padroes[grp]; break; }
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
                    ${showItemValor ? `<td class="td-val">${R$(it.valorVenda / (it.qtd || 1))}</td>` : ''}
                    ${showItemValor ? `<td class="td-sub">${R$(it.valorVenda)}</td>` : ''}
                </tr>`;
        }).join('');

        return `
            <div class="amb-block" data-section="amb_${amb.id}" data-section-nome="${numLabel} — ${amb.nome || 'Ambiente'}">
                <div class="amb-header">
                    <div class="amb-num">${numLabel}</div>
                    <div class="amb-name">${amb.nome || 'Ambiente'}</div>
                </div>
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
                        <span>Total ${numLabel} — ${amb.nome || 'Ambiente'}:</span>
                        <span>${R$(amb.valorVenda)}</span>
                    </div>
                ` : ''}
            </div>`;
    }).join('');

    // ── P2: O que está incluso (checklist) ─────────────────────────────────
    const inclusoItems = txtIncluso.split(';').map(s => s.trim()).filter(Boolean);
    const inclusoHtml = inclusoItems.length > 0 ? `
        <div class="incluso-section" data-section="incluso" data-section-nome="O que está incluso">
            <div class="invest-header">O que está incluso</div>
            <div class="incluso-grid">
                ${inclusoItems.map(item => `
                    <div class="incluso-item">
                        <span class="incluso-check">✓</span>
                        <span>${item}</span>
                    </div>
                `).join('')}
            </div>
        </div>` : '';

    // ── Resumo ──────────────────────────────────────────────────────────────
    const numAmbientes = ambValores.length;
    const custoDiario = pvComDesconto > 0 ? (pvComDesconto / (10 * 365)).toFixed(2) : null;
    const resumoHtml = `
        <div class="invest-section" data-section="resumo" data-section-nome="Resumo Financeiro">
            <div class="invest-header">Investimento</div>
            <table class="invest-table">
                <tr class="invest-divider">
                    <td class="invest-row-label">${numAmbientes} ambiente${numAmbientes > 1 ? 's' : ''} sob medida</td>
                    <td class="invest-row-value">${descontoR > 0 ? `<span class="invest-anchor">${R$(tot.pvFinal)}</span>` : R$(tot.pvFinal)}</td>
                </tr>
                ${descontoR > 0 ? `
                <tr class="invest-divider invest-row-discount">
                    <td class="invest-row-label">Condição especial (${pagamento.desconto.tipo === '%' ? N(pagamento.desconto.valor, 1) + '%' : R$(pagamento.desconto.valor)})</td>
                    <td class="invest-row-value">- ${R$(descontoR)}</td>
                </tr>` : ''}
                <tr class="invest-total">
                    <td class="invest-row-label">Investimento total</td>
                    <td class="invest-row-value">${R$(pvComDesconto)}</td>
                </tr>
            </table>
            ${descontoR > 0 ? `<div class="invest-savings">Você economiza ${R$(descontoR)} nesta proposta</div>` : ''}
            ${custoDiario ? `<div class="invest-daily">Apenas R$ ${custoDiario}/dia ao longo de 10 anos de uso</div>` : ''}
        </div>`;

    // ── Pagamento (reframing: facilidade, não condição) ─────────────────────
    const pagamentoHtml = (pagamento?.blocos || []).length > 0 ? `
        <div class="section" data-section="pagamento" data-section-nome="Formas de Pagamento">
            <div class="sec-title">FORMAS DE PAGAMENTO</div>
            <p class="txt" style="margin-bottom:10px">Facilitamos o pagamento para que você inicie seu projeto com tranquilidade:</p>
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

    // ── Garantia (risk reversal visual) ───────────────────────────────────
    const garantiaHtml = txtGarantia ? `
        <div class="section garantia-section">
            <div class="sec-title">SUA GARANTIA</div>
            <div class="garantia-box">
                <div class="garantia-header">
                    <svg class="garantia-shield" viewBox="0 0 24 24" fill="none" stroke="${corAccent}" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="${corAccent}" stroke-width="2"/></svg>
                    <span class="garantia-title">Seu investimento protegido</span>
                </div>
                <p class="txt" style="margin:0">${txtGarantia}</p>
            </div>
        </div>` : '';

    // ── Informações do projeto ───────────────────────────────────────────
    const infoProjetoHtml = `
        <div class="section" data-section="consideracoes" data-section-nome="Informações do Projeto">
            <div class="sec-title">INFORMAÇÕES DO PROJETO</div>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Prazo de entrega</div>
                    <div class="info-value">${prazoEntrega || 'A combinar'}</div>
                    <div class="info-sub">após aprovação do projeto</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Validade da proposta</div>
                    <div class="info-value">${validadeProposta || '15 dias'}</div>
                    ${orcamento.data_vencimento ? `<div class="info-sub">até ${new Date(orcamento.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
                    <div class="info-urgency">Valores sujeitos a reajuste de materiais após este prazo</div>
                </div>
                ${enderecoObra ? `<div class="info-item">
                    <div class="info-label">Local da obra</div>
                    <div class="info-value" style="font-size:12px">${enderecoObra}</div>
                </div>` : ''}
            </div>
            ${txtConsideracoes ? `<p class="txt" style="margin-top:14px">${txtConsideracoes}</p>` : ''}
            ${orcamento.obs ? `<p class="txt"><strong>Observações:</strong> ${orcamento.obs}</p>` : ''}
        </div>`;

    // ── Fechamento (última impressão emocional antes da assinatura) ──────
    const fechamentoHtml = `
        <div class="fechamento">
            Estamos prontos para transformar seu projeto em realidade.<br>
            Será um prazer atendê-lo.
        </div>`;

    // ── Sobre (opcional) ─────────────────────────────────────────────────────
    const sobreHtml = sobreEmpresa ? `
        <div class="sobre">${sobreEmpresa.replace(/\n/g, '<br>')}</div>` : '';

    // ── Derivar tons a partir das cores base (white-label safe) ─────────────
    const hexToRgb = (hex) => {
        const h = hex.replace('#', '');
        return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
    };
    const [pR, pG, pB] = hexToRgb(corPrimaria);
    const [aR, aG, aB] = hexToRgb(corAccent);
    // Derivados da primária
    const cpLight = `rgba(${pR},${pG},${pB},0.06)`;   // fundo sutil
    const cpMedium = `rgba(${pR},${pG},${pB},0.12)`;   // bordas suaves
    const cpStrong = `rgba(${pR},${pG},${pB},0.85)`;    // texto sobre fundo claro
    // Derivados do accent
    const caLight = `rgba(${aR},${aG},${aB},0.10)`;
    const caMedium = `rgba(${aR},${aG},${aB},0.25)`;

    // ── HTML ────────────────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
    @page {
        margin: 18mm 12mm 22mm 12mm;
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
            padding: 0;
            max-width: 860px;
            margin: 0 auto;
        }
    }
    @media screen and (max-width: 640px) {
        body { font-size: 11px !important; }
        .prop-header { padding: 0 14px !important; }
        .prop-header-top { flex-direction: column !important; text-align: center !important; gap: 10px !important; }
        .prop-header-right { text-align: center !important; }
        .prop-header-logo img { max-width: 120px !important; }
        .client-hero-name { font-size: 20px !important; }
        .content-body { padding: 20px 14px 32px !important; }
        table { font-size: 10px !important; }
        td, th { padding: 4px 6px !important; }
        .wm img { max-width: 200px !important; }
        h2 { font-size: 13px !important; }
        .c-field { font-size: 10px !important; }
        .info-grid { flex-direction: column !important; }
    }

    /* ══════════ HEADER UNIFICADO ══════════ */
    .prop-header {
        padding: 0 20px;
        margin-bottom: 0;
    }
    .prop-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 0 16px;
        border-bottom: 1px solid #eee;
    }
    .prop-header-logo img {
        max-height: 48px; max-width: 140px;
        object-fit: contain;
    }
    .prop-header-right {
        text-align: right;
    }
    .prop-header-num {
        font-size: 11px;
        font-weight: 700;
        color: ${corPrimaria};
        letter-spacing: 0.5px;
    }
    .prop-header-date {
        font-size: 10px;
        color: #999;
        margin-top: 2px;
    }
    .prop-header-empresa {
        font-size: 9.5px;
        color: #aaa;
        margin-top: 3px;
        line-height: 1.5;
    }

    /* ── Bloco do cliente (o coração da proposta) ── */
    .client-hero {
        padding: 22px 0 20px;
        text-align: center;
    }
    .client-hero-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 2.5px;
        color: #aaa;
        margin-bottom: 6px;
    }
    .client-hero-name {
        font-size: 24px;
        font-weight: 700;
        color: ${corPrimaria};
        line-height: 1.2;
        margin-bottom: 4px;
    }
    .client-hero-project {
        font-size: 13px;
        color: ${corAccent};
        font-weight: 500;
    }
    .client-hero-accent {
        width: 40px; height: 2.5px;
        background: ${corAccent};
        border-radius: 2px;
        margin: 16px auto 0;
    }

    /* ── Dados do cliente + empresa (discretos) ── */
    .client-data {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px;
        padding: 12px 0;
        border-top: 1px solid #eee;
        border-bottom: 1px solid #eee;
        margin-bottom: 0;
    }
    .client-data .c-field { font-size: 10.5px; margin-bottom: 2px; color: #777; }
    .client-data .c-field strong { color: #555; font-weight: 600; }

    /* ══════════ CONTENT BODY ══════════ */
    .content-body {
        padding: 18px 20px 36px;
    }

    /* ── Watermark ── */
    .wm {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        opacity: ${watermarkOpacity}; z-index: -1; pointer-events: none;
    }
    .wm img { width: 480px; height: auto; }

    /* ── Sobre ── */
    .sobre {
        font-size: 11px; color: #666;
        font-style: italic; line-height: 1.7;
        padding: 12px 16px; margin-bottom: 20px;
        border-left: 3px solid ${corAccent};
        background: ${caLight};
        border-radius: 0 6px 6px 0;
    }

    /* ══════════ AMBIENTE BLOCK ══════════ */
    .amb-block {
        margin-bottom: 24px;
        page-break-inside: avoid;
    }
    .amb-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 2px solid ${cpMedium};
    }
    .amb-num {
        font-size: 20px;
        font-weight: 800;
        color: ${corAccent};
        line-height: 1;
        min-width: 32px;
    }
    .amb-name {
        font-size: 13px; font-weight: 700;
        color: ${corPrimaria};
        text-transform: uppercase;
        letter-spacing: 1.5px;
    }

    /* ── Tables ── */
    .tb {
        width: 100%;
        border-collapse: collapse;
        border: none;
        border-radius: 4px;
        overflow: hidden;
    }
    .tb th {
        font-size: 9.5px; font-weight: 700;
        color: #fff;
        padding: 7px 10px;
        text-align: center;
        background: ${corPrimaria};
        text-transform: uppercase;
        letter-spacing: 0.8px;
        border: none;
    }
    .th-desc { text-align: left !important; }
    .th-qtd { width: 45px; }
    .th-val { width: 85px; }
    .th-sub { width: 95px; }

    .tb td {
        padding: 6px 10px;
        border-bottom: 1px solid #eee;
        vertical-align: top;
    }
    .tb tbody tr:nth-child(even) td { background: ${cpLight}; }
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
    .bloco-desc {
        margin-top: 4px; padding-left: 4px;
    }
    .bloco-line {
        font-size: 10.5px; color: #555;
        line-height: 1.7; padding: 0;
    }

    .amb-total {
        display: flex; justify-content: space-between;
        padding: 7px 12px;
        background: ${cpLight};
        border-top: 2px solid ${cpMedium};
        font-weight: 700; font-size: 12px;
        color: ${corPrimaria};
    }

    /* ══════════ INVESTIMENTO (RESUMO) ══════════ */
    .invest-section {
        margin: 28px 0 20px;
        page-break-inside: avoid;
    }
    .invest-header {
        font-size: 12px; font-weight: 700;
        color: ${corPrimaria};
        text-transform: uppercase;
        letter-spacing: 1.5px;
        padding-bottom: 6px;
        border-bottom: 2px solid ${cpMedium};
        margin-bottom: 12px;
    }
    .invest-table { width: 100%; border-collapse: collapse; }
    .invest-table td { padding: 6px 0; font-size: 12px; color: #555; }
    .invest-row-label { text-align: left; }
    .invest-row-value { text-align: right; font-weight: 600; color: #333; }
    .invest-row-discount .invest-row-value { color: ${corAccent}; }
    .invest-divider td { border-bottom: 1px solid #eee; }
    .invest-total {
        border-top: 2px solid ${corPrimaria};
    }
    .invest-total td {
        padding-top: 10px;
    }
    .invest-total .invest-row-label {
        font-size: 14px; font-weight: 700;
        color: ${corPrimaria};
    }
    .invest-total .invest-row-value {
        font-size: 20px; font-weight: 800;
        color: ${corPrimaria};
    }
    .invest-savings {
        margin-top: 8px;
        font-size: 11px;
        color: ${corAccent};
        font-weight: 600;
        text-align: right;
    }

    /* ══════════ SECTIONS ══════════ */
    .section { margin: 24px 0; page-break-inside: avoid; }
    .sec-title {
        font-size: 12px; font-weight: 700;
        color: ${corPrimaria};
        margin-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        padding-bottom: 6px;
        border-bottom: 2px solid ${cpMedium};
    }
    .txt {
        font-size: 11.5px; color: #555;
        line-height: 1.7; margin-bottom: 5px;
    }

    /* ── Payment table ── */
    .pag-tb th { background: ${corPrimaria}; color: #fff; border: none; }
    .pag-tb td { text-align: center; font-size: 12px; border-bottom: 1px solid #eee; }
    .pag-tb tbody tr:nth-child(even) td { background: ${cpLight}; }

    /* ══════════ GARANTIA (benefício visual) ══════════ */
    .garantia-box {
        background: ${caLight};
        border-left: 3px solid ${corAccent};
        border-radius: 0 6px 6px 0;
        padding: 12px 16px;
    }

    /* ══════════ INFO GRID ══════════ */
    .info-grid {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
    }
    .info-item {
        flex: 1;
        min-width: 140px;
        background: ${cpLight};
        border-radius: 6px;
        padding: 12px 14px;
        text-align: center;
    }
    .info-label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #888;
        margin-bottom: 4px;
        font-weight: 600;
    }
    .info-value {
        font-size: 15px;
        font-weight: 700;
        color: ${corPrimaria};
    }
    .info-sub {
        font-size: 10px;
        color: #999;
        margin-top: 2px;
    }

    /* ══════════ FECHAMENTO ══════════ */
    .fechamento {
        text-align: center;
        font-size: 13px;
        color: #666;
        font-style: italic;
        line-height: 1.8;
        margin: 32px 0 8px;
        padding: 16px 0;
        border-top: 1px solid #eee;
        border-bottom: 1px solid #eee;
    }

    /* ══════════ SIGNATURE ══════════ */
    .sig-section { margin-top: 60px; page-break-inside: avoid; }
    .sig-date {
        font-size: 12px; color: #555;
        margin-bottom: 80px;
    }
    .sig-grid { display: flex; justify-content: space-between; gap: 80px; }
    .sig-block { flex: 1; text-align: center; }
    .sig-line { border-top: 1.5px solid ${corPrimaria}; padding-top: 8px; }
    .sig-name { font-size: 12px; font-weight: 700; color: #222; }
    .sig-role { font-size: 10px; color: #888; margin-top: 2px; }
    .sig-doc { font-size: 8px; color: #bbb; margin-top: 2px; }

    /* ══════════ FOOTER ══════════ */
    .footer {
        margin-top: 28px; padding-top: 12px;
        border-top: 2px solid ${cpMedium};
        text-align: center;
        font-size: 9px; color: #aaa;
        line-height: 1.7;
    }
    .footer-brand {
        font-weight: 700;
        color: ${corPrimaria};
        font-size: 10px;
    }

    /* ══════════ P1: ANCORAGEM PREÇO ══════════ */
    .invest-anchor {
        text-decoration: line-through;
        color: #999;
        font-weight: 400;
        font-size: 11px;
    }

    /* ══════════ P2: INCLUSO CHECKLIST ══════════ */
    .incluso-section {
        margin: 24px 0 8px;
        page-break-inside: avoid;
    }
    .incluso-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 20px;
    }
    .incluso-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11.5px;
        color: #444;
        padding: 4px 0;
    }
    .incluso-check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: ${caLight};
        color: ${corAccent};
        font-size: 11px;
        font-weight: 700;
        flex-shrink: 0;
    }

    /* ══════════ P3: CUSTO DIÁRIO ══════════ */
    .invest-daily {
        margin-top: 6px;
        font-size: 10px;
        color: #888;
        text-align: right;
        font-style: italic;
    }

    /* ══════════ P4: RISK REVERSAL GARANTIA ══════════ */
    .garantia-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
    }
    .garantia-shield {
        width: 28px;
        height: 28px;
        flex-shrink: 0;
    }
    .garantia-title {
        font-size: 14px;
        font-weight: 700;
        color: ${corPrimaria};
    }

    /* ══════════ P5: URGÊNCIA VALIDADE ══════════ */
    .info-urgency {
        margin-top: 4px;
        font-size: 9px;
        color: ${corAccent};
        font-weight: 600;
    }

    /* ══════════ P6: FOOTER SOCIAL ══════════ */
    .footer-social {
        margin-top: 4px;
        font-size: 9px;
        color: #888;
    }

    @media print {
        .prop-header { padding: 0; }
    }

</style></head><body>

    <!-- Watermark (só aparece se configurado) -->
    ${watermarkSrc ? `<div class="wm"><img src="${watermarkSrc}" /></div>` : ''}

    <!-- ═══ HEADER UNIFICADO ═══ -->
    <div class="prop-header">
        <div class="prop-header-top">
            ${logoSrc ? `<div class="prop-header-logo"><img src="${logoSrc}" /></div>` : `<div style="font-size:16px;font-weight:700;color:${corPrimaria};letter-spacing:0.5px">${empresaNome}</div>`}
            <div class="prop-header-right">
                <div class="prop-header-num">Proposta N° ${orcamento.numero || '—'}${(orcamento.versao || 1) > 1 ? ` · Rev. ${orcamento.versao}` : ''}</div>
                <div class="prop-header-date">${fmtDataExtenso()}</div>
                <div class="prop-header-empresa">${[empresaCnpj ? `CNPJ ${empresaCnpj}` : '', empresaContato.join(' · ')].filter(Boolean).join(' · ')}</div>
            </div>
        </div>

        <!-- ═══ NOME DO CLIENTE (destaque central) ═══ -->
        <div class="client-hero">
            <div class="client-hero-label">Proposta comercial elaborada para</div>
            <div class="client-hero-name">${cliente?.nome || '—'}</div>
            ${orcamento.projeto ? `<div class="client-hero-project">${orcamento.projeto}</div>` : ''}
            <div class="client-hero-accent"></div>
        </div>

        <!-- ═══ DADOS DO CLIENTE (discretos) ═══ -->
        <div class="client-data">
            <div>
                ${(cliente?.cpf || cliente?.cnpj) ? `<div class="c-field"><strong>${cliente?.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}:</strong> ${cliente?.tipo_pessoa === 'juridica' ? (cliente?.cnpj || '—') : (cliente?.cpf || '—')}</div>` : ''}
                ${cliente?.telefone ? `<div class="c-field"><strong>Telefone:</strong> ${cliente.telefone}</div>` : ''}
                ${cliente?.email ? `<div class="c-field"><strong>Email:</strong> ${cliente.email}</div>` : ''}
            </div>
            <div style="text-align:right">
                ${enderecoObra ? `<div class="c-field"><strong>Local da obra:</strong> ${enderecoObra}</div>` : ''}
                ${empresaEnd ? `<div class="c-field">${empresaEnd}</div>` : ''}
            </div>
        </div>
    </div>

    <div class="content-body">

    <!-- ═══ SOBRE (autoridade — quem somos) ═══ -->
    ${sobreHtml}

    <!-- ═══ AMBIENTES (valor — o que você recebe) ═══ -->
    <div class="sec-title">SEU PROJETO</div>
    <p class="txt" style="margin-bottom:16px">Detalhamento dos ambientes e itens que compõem o projeto desenvolvido para você:</p>
    ${ambientesHtml}

    <!-- ═══ O QUE ESTÁ INCLUSO (valor percebido) ═══ -->
    ${inclusoHtml}

    <!-- ═══ INVESTIMENTO (preço — quanto custa) ═══ -->
    ${resumoHtml}

    <!-- ═══ PAGAMENTO (facilidade — como pagar) ═══ -->
    ${pagamentoHtml}

    <!-- ═══ GARANTIA (segurança — proteção) ═══ -->
    ${garantiaHtml}

    <!-- ═══ INFO PROJETO (prazo, validade, local) ═══ -->
    ${infoProjetoHtml}

    <!-- ═══ FECHAMENTO (emoção final positiva) ═══ -->
    ${fechamentoHtml}

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
        <div class="footer-brand">${empresaNome}</div>
        <div>${empresaContato.length > 0 ? `${empresaContato.join(' · ')}` : ''}</div>
        ${empresa?.instagram ? `<div class="footer-social">
            <span style="margin-right:4px">📷</span> @${empresa.instagram.replace(/^@/, '')}
        </div>` : ''}
    </div>

    </div><!-- /content-body -->

</body></html>`;
}
