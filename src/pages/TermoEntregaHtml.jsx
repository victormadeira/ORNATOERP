// ── Termo de Entrega — Template HTML para impressão ──────────────────────────
// Gera HTML completo do Termo de Entrega e Aceitação para impressão/PDF

const R = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDt = (s) => s ? new Date(s).toLocaleDateString('pt-BR') : '—';

// ── Resolver nome de material ─────────────────────────────────────────────────
function matNome(id, chapas, acabamentos) {
    if (!id) return '—';
    const c = (chapas || []).find(x => x.id === id);
    if (c) return c.nome;
    const a = (acabamentos || []).find(x => x.id === id);
    if (a) return a.nome;
    return id;
}

/**
 * buildTermoEntregaHtml(data)
 * @param {Object} data — retorno do endpoint /termo-entrega
 * @param {Object} config — { chapas, acabamentos, observacoes, ressalvas, garantiaTexto }
 * @returns {string} HTML completo para window.open + print
 */
export function buildTermoEntregaHtml(data, config = {}) {
    const { projeto, etapas, ocorrencias, ambientes, financeiro, empresa } = data;
    const { chapas = [], acabamentos = [], observacoes = '', ressalvas = '', garantiaTexto } = config;

    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const projNome = projeto.nome || '—';
    const clienteNome = projeto.cliente_nome || '—';
    const orcNumero = projeto.orc_numero || '';
    const enderecoObra = (() => {
        try {
            const d = JSON.parse(projeto.mods_json || '{}');
            return d.endereco_obra || '';
        } catch (_) { return ''; }
    })();

    // Etapas concluídas
    const etapasConcluidas = (etapas || []).filter(e => e.status === 'concluida');
    const etapasPendentes = (etapas || []).filter(e => e.status !== 'concluida');

    // Itens por ambiente
    const ambRows = (ambientes || []).map((amb, ai) => {
        const mods = amb.mods || [];
        return `
        <div class="amb">
            <div class="amb-hdr">
                <span>AMBIENTE ${ai + 1}: ${amb.nome || 'Sem nome'}</span>
                <span>${mods.length} módulo${mods.length !== 1 ? 's' : ''}</span>
            </div>
            <table class="mt">
                <thead><tr>
                    <th class="n">#</th>
                    <th>Descrição</th>
                    <th>Material</th>
                    <th class="dim">Dimensões (mm)</th>
                    <th class="n">Qtd</th>
                    <th class="n">✓</th>
                </tr></thead>
                <tbody>
                    ${mods.map((m, mi) => {
                        const matInt = matNome(m.matInt || m.mmInt, chapas, acabamentos);
                        const matExt = matNome(m.matExt || m.acabExt || m.mmExt, chapas, acabamentos);
                        return `<tr>
                            <td class="n">${mi + 1}</td>
                            <td class="nome"><strong>${m.nome || m.tipo || '—'}</strong></td>
                            <td class="text-xs">${matInt !== '—' ? `Int: ${matInt}` : ''}${matExt !== '—' ? `${matInt !== '—' ? '<br>' : ''}Ext: ${matExt}` : ''}</td>
                            <td class="dim">${m.l || 0} × ${m.a || 0} × ${m.p || 0}</td>
                            <td class="n">${m.qtd || 1}</td>
                            <td class="n">☐</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }).join('');

    // Se não tem ambientes, mostra mensagem
    const itensHtml = ambRows || `
        <div class="empty">Nenhum ambiente/módulo vinculado a este projeto.</div>
    `;

    // Checklist padrão
    const checklist = [
        'Todos os módulos instalados e nivelados',
        'Ferragens funcionando corretamente (dobradiças, puxadores, corrediças)',
        'Acabamento sem defeitos visíveis',
        'Medidas conferidas conforme orçamento',
        'Material e cor conforme aprovação do cliente',
        'Local limpo após instalação',
    ];

    // Garantia
    const garantia = garantiaTexto || 'Garantia de 5 (cinco) anos para defeitos de fabricação, em condições normais de uso. A garantia não cobre danos causados por mau uso, umidade excessiva, exposição direta ao sol ou modificações feitas por terceiros. Toda ferragem utilizada é de primeira linha.';

    // Ocorrências pendentes
    const ocorrHtml = (ocorrencias || []).length > 0 ? `
        <div class="section">
            <h3>PENDÊNCIAS / RESSALVAS</h3>
            <table class="mt">
                <thead><tr>
                    <th>Assunto</th>
                    <th>Descrição</th>
                    <th>Status</th>
                </tr></thead>
                <tbody>
                    ${ocorrencias.map(oc => `<tr>
                        <td class="nome"><strong>${oc.assunto}</strong></td>
                        <td>${oc.descricao || '—'}</td>
                        <td style="color:#ef4444;font-weight:600">${oc.status === 'aberto' ? 'Pendente' : oc.status}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
    ` : '';

    // Ressalvas manuais
    const ressalvasHtml = ressalvas ? `
        <div class="section ressalvas">
            <h3>RESSALVAS</h3>
            <p>${ressalvas.replace(/\n/g, '<br>')}</p>
        </div>
    ` : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Termo de Entrega — ${clienteNome} — ${projNome}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11px;padding:20px 24px;}
@page{margin:12mm 10mm;size:A4;}
@media print{.no-print{display:none!important;} body{padding:0;}}

.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #1a4fa0;padding-bottom:12px;margin-bottom:14px;}
.emp h1{font-size:15px;font-weight:bold;color:#1a4fa0;margin-bottom:3px;}
.emp p{font-size:9.5px;color:#555;line-height:1.5;}
.doc-info{text-align:right;}
.doc-info .title{font-size:16px;font-weight:bold;color:#1a4fa0;letter-spacing:0.5px;}
.doc-info .date{font-size:10px;color:#666;margin-top:3px;}

.info-box{background:#f4f7ff;border:1px solid #d8e2f5;border-radius:5px;padding:10px 14px;margin-bottom:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px 20px;}
.info-box .fi label{font-size:8.5px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:1px;}
.info-box .fi span{font-size:11px;font-weight:600;color:#111;}

.section{margin-bottom:14px;}
.section h3{font-size:11px;font-weight:bold;color:#1a4fa0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1.5px solid #d8e2f5;}

.amb{margin-bottom:12px;}
.amb-hdr{background:#1a4fa0;color:#fff;padding:5px 10px;border-radius:4px 4px 0 0;font-size:10px;font-weight:bold;display:flex;justify-content:space-between;}
.mt{width:100%;border-collapse:collapse;font-size:10px;}
.mt th{background:#e6edf8;color:#1a4fa0;padding:4px 7px;text-align:left;border:1px solid #ccd6ed;font-size:9px;}
.mt td{padding:4px 7px;border:1px solid #e2e2e2;vertical-align:middle;}
.mt tr:nth-child(even) td{background:#f8faff;}
.n{text-align:center;width:28px;}
.nome{min-width:110px;}
.dim{font-family:monospace;font-size:9.5px;white-space:nowrap;}
.text-xs{font-size:9px;line-height:1.4;}

.checklist{margin-bottom:14px;}
.checklist h3{font-size:11px;font-weight:bold;color:#1a4fa0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1.5px solid #d8e2f5;}
.check-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:10.5px;}
.check-box{width:14px;height:14px;border:1.5px solid #999;border-radius:2px;flex-shrink:0;}

.garantia{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:10px 14px;margin-bottom:14px;}
.garantia h3{font-size:11px;font-weight:bold;color:#16a34a;margin-bottom:6px;}
.garantia p{font-size:10px;line-height:1.6;color:#333;}

.financeiro{background:#fefce8;border:1px solid #fde68a;border-radius:5px;padding:10px 14px;margin-bottom:14px;}
.financeiro h3{font-size:11px;font-weight:bold;color:#ca8a04;margin-bottom:6px;}
.fin-row{display:flex;justify-content:space-between;padding:3px 0;font-size:10.5px;border-bottom:1px dashed #e5e7eb;}
.fin-row:last-child{border-bottom:none;}
.fin-row.total{font-weight:bold;font-size:12px;border-top:1.5px solid #ca8a04;margin-top:4px;padding-top:6px;}

.ressalvas{background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:10px 14px;}
.ressalvas h3{color:#dc2626!important;border-bottom-color:#fecaca!important;}
.ressalvas p{font-size:10px;line-height:1.6;color:#333;}

.obs{margin-bottom:14px;padding:10px 14px;border:1px solid #e5e7eb;border-radius:5px;background:#fafafa;}
.obs h3{font-size:10px;font-weight:bold;color:#666;margin-bottom:4px;}
.obs p{font-size:10px;line-height:1.6;color:#444;}

.assinaturas{display:flex;justify-content:space-between;gap:40px;margin-top:30px;padding-top:10px;}
.assin-box{flex:1;text-align:center;}
.assin-line{border-top:1px solid #333;margin-top:50px;padding-top:6px;}
.assin-box .nome{font-size:11px;font-weight:bold;color:#111;}
.assin-box .cargo{font-size:9px;color:#888;}
.assin-box .data{font-size:9px;color:#888;margin-top:4px;}

.empty{text-align:center;padding:20px;color:#999;font-style:italic;}

.footer-legal{margin-top:20px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:8.5px;color:#aaa;text-align:center;line-height:1.5;}

.print-btn{display:block;margin:22px auto 0;padding:10px 36px;background:#1a4fa0;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;}
.print-btn:hover{background:#1555c0;}
</style>
</head>
<body>

<!-- Cabeçalho -->
<div class="header">
    <div class="emp">
        ${(empresa.logo_header_path || empresa.logo) ? `<img src="${empresa.logo_header_path || empresa.logo}" alt="${empresa.nome}" style="height:36px;max-width:110px;object-fit:contain;display:block;margin-bottom:5px;">` : ''}
        <h1>${empresa.nome || 'Marcenaria'}</h1>
        <p>
            ${empresa.cnpj ? `CNPJ: ${empresa.cnpj}<br>` : ''}
            ${empresa.telefone ? `Tel: ${empresa.telefone}` : ''}
            ${empresa.email ? `&nbsp;&nbsp;Email: ${empresa.email}` : ''}
            ${(empresa.cidade || empresa.estado) ? `<br>${[empresa.cidade, empresa.estado].filter(Boolean).join(' — ')}` : ''}
        </p>
    </div>
    <div class="doc-info">
        <div class="title">TERMO DE ENTREGA</div>
        <div class="date">${orcNumero ? `Ref.: ${orcNumero}` : ''}</div>
        <div class="date">Data: ${dataHoje}</div>
    </div>
</div>

<!-- Dados do projeto -->
<div class="info-box">
    <div class="fi"><label>Cliente</label><span>${clienteNome}</span></div>
    <div class="fi"><label>Projeto</label><span>${projNome}</span></div>
    <div class="fi"><label>Valor Total</label><span style="color:#1a4fa0">${R(financeiro.valorTotal)}</span></div>
    ${enderecoObra ? `<div class="fi" style="grid-column:span 2"><label>Endereço da Obra</label><span>${enderecoObra}</span></div>` : ''}
    <div class="fi"><label>Data Início</label><span>${fmtDt(projeto.data_inicio)}</span></div>
</div>

<!-- Itens entregues por ambiente -->
<div class="section">
    <h3>ITENS ENTREGUES</h3>
    ${itensHtml}
</div>

<!-- Checklist de vistoria -->
<div class="checklist">
    <h3>CHECKLIST DE VISTORIA</h3>
    ${checklist.map(item => `
        <div class="check-item">
            <div class="check-box"></div>
            <span>${item}</span>
        </div>
    `).join('')}
</div>

${ocorrHtml}
${ressalvasHtml}

<!-- Garantia -->
<div class="garantia">
    <h3>GARANTIA</h3>
    <p>${garantia}</p>
</div>

<!-- Financeiro -->
<div class="financeiro">
    <h3>SITUAÇÃO FINANCEIRA</h3>
    <div class="fin-row">
        <span>Valor do projeto:</span>
        <span style="font-weight:600">${R(financeiro.valorTotal)}</span>
    </div>
    <div class="fin-row">
        <span>Valor pago:</span>
        <span style="font-weight:600;color:#16a34a">${R(financeiro.totalPago)}</span>
    </div>
    ${financeiro.totalPendente > 0 ? `
    <div class="fin-row">
        <span>Saldo pendente:</span>
        <span style="font-weight:600;color:#ef4444">${R(financeiro.totalPendente)}</span>
    </div>` : ''}
    <div class="fin-row total">
        <span>${financeiro.totalPendente > 0 ? 'SALDO A PAGAR' : 'QUITADO'}</span>
        <span style="color:${financeiro.totalPendente > 0 ? '#ef4444' : '#16a34a'}">${financeiro.totalPendente > 0 ? R(financeiro.totalPendente) : 'R$ 0,00'}</span>
    </div>
</div>

${observacoes ? `
<div class="obs">
    <h3>OBSERVAÇÕES</h3>
    <p>${observacoes.replace(/\n/g, '<br>')}</p>
</div>
` : ''}

<!-- Assinaturas -->
<div class="assinaturas">
    <div class="assin-box">
        <div class="assin-line">
            <div class="nome">${clienteNome}</div>
            <div class="cargo">Cliente / Contratante</div>
            <div class="data">Data: ____/____/________</div>
        </div>
    </div>
    <div class="assin-box">
        <div class="assin-line">
            <div class="nome">${empresa.nome || 'Representante'}</div>
            <div class="cargo">Representante da Empresa</div>
            <div class="data">Data: ____/____/________</div>
        </div>
    </div>
</div>

<div class="footer-legal">
    Este documento atesta a entrega e aceitação dos móveis e serviços descritos acima.
    Após a assinatura, a garantia passa a vigorar conforme os termos especificados.
    ${orcNumero ? `Ref. Orçamento: ${orcNumero}` : ''} · Projeto: ${projNome}
</div>

<button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>

</body>
</html>`;
}
