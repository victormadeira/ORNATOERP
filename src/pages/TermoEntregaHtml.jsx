// ── Termo de Entrega + Certificado de Garantia — Templates HTML ──────────────

const R = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDt = (s) => s ? new Date(s).toLocaleDateString('pt-BR') : '—';

/** Escapa caracteres HTML para prevenir XSS */
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function matNome(id, chapas, acabamentos) {
    if (!id) return '—';
    const c = (chapas || []).find(x => x.id === id);
    if (c) return esc(c.nome);
    const a = (acabamentos || []).find(x => x.id === id);
    if (a) return esc(a.nome);
    return esc(id);
}

// ── CSS compartilhado (cores dinâmicas da config) ────────────────────────────
function buildBaseCSS(cp, ca) {
    return `
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',Arial,Helvetica,sans-serif;color:#111;font-size:11px;padding:20px 24px;}
@page{margin:12mm 10mm;size:A4;}
@media print{.no-print{display:none!important;} body{padding:0;} .page-break{page-break-before:always;}}
*,*::before,*::after{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}

.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:0;pointer-events:none;}
.watermark img{width:340px;height:auto;}
.content-wrap{position:relative;z-index:1;}

.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid ${cp};padding-bottom:12px;margin-bottom:14px;}
.emp h1{font-size:15px;font-weight:bold;color:${cp};margin-bottom:3px;}
.emp p{font-size:9.5px;color:#555;line-height:1.5;}
.doc-info{text-align:right;}
.doc-info .title{font-size:16px;font-weight:bold;color:${cp};letter-spacing:0.5px;}
.doc-info .sub{font-size:11px;color:#444;font-weight:600;margin-top:2px;}
.doc-info .date{font-size:10px;color:#666;margin-top:3px;}

.info-box{background:${cp}08;border:1px solid ${cp}20;border-radius:5px;padding:10px 14px;margin-bottom:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px 20px;}
.info-box .fi label{font-size:8.5px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:1px;}
.info-box .fi span{font-size:11px;font-weight:600;color:#111;}

.section{margin-bottom:14px;}
.section h3{font-size:11px;font-weight:bold;color:${cp};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1.5px solid ${cp}25;}

.amb{margin-bottom:12px;}
.amb-hdr{background:${cp};color:#fff;padding:5px 10px;border-radius:4px 4px 0 0;font-size:10px;font-weight:bold;display:flex;justify-content:space-between;}
.mt{width:100%;border-collapse:collapse;font-size:10px;}
.mt th{background:${cp}10;color:${cp};padding:4px 7px;text-align:left;border:1px solid ${cp}20;font-size:9px;}
.mt td{padding:4px 7px;border:1px solid #e2e2e2;vertical-align:middle;}
.mt tr:nth-child(even) td{background:${cp}05;}
.n{text-align:center;width:28px;}
.nome{min-width:110px;}
.dim{font-family:monospace;font-size:9.5px;white-space:nowrap;}
.text-xs{font-size:9px;line-height:1.4;}

.checklist{margin-bottom:14px;}
.checklist h3{font-size:11px;font-weight:bold;color:${cp};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1.5px solid ${cp}25;}
.check-item{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:10.5px;border-bottom:1px solid #f0f0f0;}
.check-item:last-child{border-bottom:none;}
.check-item input[type="checkbox"]{width:15px;height:15px;accent-color:${cp};cursor:pointer;flex-shrink:0;}
.check-label{flex:1;min-width:180px;}
.check-obs{flex:1;max-width:260px;border:1px solid #ddd;border-radius:3px;padding:2px 6px;font-size:9.5px;font-family:inherit;color:#333;outline:none;}
.check-obs:focus{border-color:${cp};box-shadow:0 0 0 2px ${cp}15;}
.check-obs::placeholder{color:#bbb;font-style:italic;}

.item-cb{width:15px;height:15px;accent-color:${cp};cursor:pointer;}
.item-obs{width:100%;border:1px solid #ddd;border-radius:3px;padding:2px 5px;font-size:9px;font-family:inherit;color:#333;outline:none;min-width:80px;}
.item-obs:focus{border-color:${cp};box-shadow:0 0 0 2px ${cp}15;}
.item-obs::placeholder{color:#bbb;font-style:italic;}

.fill-tip{background:${cp}08;border:1px solid ${cp}20;border-radius:5px;padding:8px 14px;margin-bottom:14px;font-size:10px;color:${cp};display:flex;align-items:center;gap:8px;}
.fill-tip svg{flex-shrink:0;}
@media print{.fill-tip{display:none!important;} .check-obs,.item-obs{border-color:transparent!important;box-shadow:none!important;} .check-obs:empty::placeholder,.item-obs:empty::placeholder{color:transparent!important;}}

.garantia-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:10px 14px;margin-bottom:14px;}
.garantia-box h3{font-size:11px;font-weight:bold;color:#16a34a;margin-bottom:6px;}
.garantia-box p{font-size:10px;line-height:1.6;color:#333;}

.financeiro{background:${ca}10;border:1px solid ${ca}30;border-radius:5px;padding:10px 14px;margin-bottom:14px;}
.financeiro h3{font-size:11px;font-weight:bold;color:${ca};margin-bottom:6px;}
.fin-row{display:flex;justify-content:space-between;padding:3px 0;font-size:10.5px;border-bottom:1px dashed ${cp}15;}
.fin-row:last-child{border-bottom:none;}
.fin-row.total{font-weight:bold;font-size:12px;border-top:1.5px solid ${ca};margin-top:4px;padding-top:6px;}

.ressalvas{background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:10px 14px;margin-bottom:14px;}
.ressalvas h3{color:#dc2626!important;border-bottom-color:#fecaca!important;}
.ressalvas p{font-size:10px;line-height:1.6;color:#333;}

.foto-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;margin-bottom:10px;}
.foto-grid img{width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ddd;}
.foto-grid .foto-label{font-size:8px;color:#666;text-align:center;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.foto-section{margin-top:6px;padding:6px 10px;background:${cp}05;border:1px solid ${cp}12;border-radius:4px;}
.foto-section .foto-title{font-size:9px;font-weight:bold;color:${cp};margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;}

.obs{margin-bottom:14px;padding:10px 14px;border:1px solid ${cp}18;border-radius:5px;background:${cp}05;}
.obs h3{font-size:10px;font-weight:bold;color:${cp};margin-bottom:4px;}
.obs p{font-size:10px;line-height:1.6;color:#444;}

.assinaturas{display:flex;justify-content:space-between;gap:40px;margin-top:30px;padding-top:10px;}
.assin-box{flex:1;text-align:center;}
.assin-line{border-top:1px solid #333;margin-top:50px;padding-top:6px;}
.assin-box .nome{font-size:11px;font-weight:bold;color:#111;}
.assin-box .cargo{font-size:9px;color:#888;}
.assin-box .data{font-size:9px;color:#888;margin-top:4px;}

.empty{text-align:center;padding:20px;color:#999;font-style:italic;}
.footer-legal{margin-top:20px;padding-top:8px;border-top:1px solid ${cp}20;font-size:8.5px;color:#aaa;text-align:center;line-height:1.5;}
.print-btn{display:block;margin:16px auto 0;padding:10px 36px;background:${cp};color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;}
.print-btn:hover{opacity:.9;}
.btn-row{display:flex;justify-content:center;gap:12px;margin-top:16px;}
`;
}

// ── Helpers para extrair cores da config ──────────────────────────────────────
function extractColors(empresa) {
    return {
        cp: empresa?.proposta_cor_primaria || '#1B2A4A',
        ca: empresa?.proposta_cor_accent || '#C9A96E',
        logoSrc: empresa?.logo_header_path || empresa?.logo || '',
        watermarkSrc: empresa?.logo_watermark_path || empresa?.logo_watermark || '',
        watermarkOpacity: empresa?.logo_watermark_opacity ?? 0.04,
    };
}

function watermarkHtml(src, opacity) {
    if (!src) return '';
    return `<div class="watermark" style="opacity:${opacity}"><img src="${src}" /></div>`;
}

// ── Helpers de seções comuns ──────────────────────────────────────────────────
function headerHtml(empresa, docTitle, subtitle, dataHoje) {
    return `<div class="header">
    <div class="emp">
        ${(empresa.logo_header_path || empresa.logo) ? `<img src="${empresa.logo_header_path || empresa.logo}" alt="${esc(empresa.nome)}" style="height:36px;max-width:110px;object-fit:contain;display:block;margin-bottom:5px;">` : ''}
        <h1>${esc(empresa.nome) || 'Marcenaria'}</h1>
        <p>
            ${empresa.cnpj ? `CNPJ: ${esc(empresa.cnpj)}<br>` : ''}
            ${empresa.telefone ? `Tel: ${esc(empresa.telefone)}` : ''}
            ${empresa.email ? `&nbsp;&nbsp;Email: ${esc(empresa.email)}` : ''}
            ${(empresa.cidade || empresa.estado) ? `<br>${[empresa.cidade, empresa.estado].filter(Boolean).map(esc).join(' — ')}` : ''}
        </p>
    </div>
    <div class="doc-info">
        <div class="title">${esc(docTitle)}</div>
        ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
        <div class="date">Data: ${dataHoje}</div>
    </div>
</div>`;
}

function assinaturasHtml(clienteNome, empresaNome) {
    return `<div class="assinaturas">
    <div class="assin-box">
        <div class="assin-line">
            <div class="nome">${esc(clienteNome)}</div>
            <div class="cargo">Cliente / Contratante</div>
            <div class="data">Data: ____/____/________</div>
        </div>
    </div>
    <div class="assin-box">
        <div class="assin-line">
            <div class="nome">${esc(empresaNome) || 'Representante'}</div>
            <div class="cargo">Representante da Empresa</div>
            <div class="data">Data: ____/____/________</div>
        </div>
    </div>
</div>`;
}

function ambienteTable(amb, ai, chapas, acabamentos, entregaFotos = []) {
    // Suporta ambientes com .itens (Novo.jsx) ou .mods (legado)
    const itens = amb.itens || amb.mods || [];
    const ambFotos = entregaFotos.filter(f => f.ambiente_idx === ai);

    const fotosHtml = ambFotos.length > 0 ? `
        <div class="foto-section">
            <div class="foto-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Registro fotográfico da entrega</div>
            <div class="foto-grid">
                ${ambFotos.map(f => `<div>
                    <img src="${f.url}" alt="${esc(f.nota)}" title="${esc(f.nota) || `Ambiente ${ai + 1}, Item ${(f.item_idx ?? 0) + 1}`}">
                    ${f.nota ? `<div class="foto-label">${esc(f.nota)}</div>` : ''}
                </div>`).join('')}
            </div>
        </div>` : '';

    return `<div class="amb">
        <div class="amb-hdr">
            <span>AMBIENTE ${ai + 1}: ${esc(amb.nome) || 'Sem nome'}</span>
            <span>${itens.length} item${itens.length !== 1 ? 'ns' : ''}${ambFotos.length > 0 ? ` · ${ambFotos.length} foto${ambFotos.length !== 1 ? 's' : ''}` : ''}</span>
        </div>
        <table class="mt">
            <thead><tr>
                <th class="n">#</th>
                <th>Descrição</th>
                <th>Material</th>
                <th class="dim">Dimensões (mm)</th>
                <th class="n">Qtd</th>
                <th class="n" style="width:30px">OK</th>
                <th style="min-width:100px">Observação</th>
            </tr></thead>
            <tbody>
                ${itens.map((m, mi) => {
                    const matInt = matNome(m.mats?.matInt || m.matInt || m.mmInt, chapas, acabamentos);
                    const matExt = matNome(m.mats?.matExt || m.matExt || m.acabExt || m.mmExt, chapas, acabamentos);
                    const l = m.dims?.l || m.l || 0;
                    const a = m.dims?.a || m.a || 0;
                    const p = m.dims?.p || m.p || 0;
                    return `<tr>
                        <td class="n">${mi + 1}</td>
                        <td class="nome"><strong>${esc(m.nome || m.tipo) || '—'}</strong></td>
                        <td class="text-xs">${matInt !== '—' ? `Int: ${matInt}` : ''}${matExt !== '—' ? `${matInt !== '—' ? '<br>' : ''}Ext: ${matExt}` : ''}</td>
                        <td class="dim">${l} × ${a} × ${p}</td>
                        <td class="n">${m.qtd || 1}</td>
                        <td class="n"><input type="checkbox" class="item-cb" title="Marcar como entregue"></td>
                        <td><input type="text" class="item-obs" placeholder="Pendência..."></td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        ${fotosHtml}
    </div>`;
}

const CHECKLIST = [
    'Todos os módulos instalados e nivelados',
    'Ferragens funcionando corretamente (dobradiças, puxadores, corrediças)',
    'Acabamento sem defeitos visíveis (riscos, manchas, lascas)',
    'Medidas conferidas conforme orçamento aprovado',
    'Material e cor conforme aprovação do cliente',
    'Local limpo após instalação',
];

function checklistHtml(items) {
    return `<div class="checklist">
    <h3>CHECKLIST DE VISTORIA</h3>
    ${items.map(item => `<div class="check-item">
        <input type="checkbox" title="Marcar como conferido">
        <span class="check-label">${item}</span>
        <input type="text" class="check-obs" placeholder="Observação...">
    </div>`).join('')}
</div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. TERMO DE ENTREGA COMPLETO (todos os ambientes em 1 documento)
// ═════════════════════════════════════════════════════════════════════════════
export function buildTermoEntregaHtml(data, config = {}) {
    const { projeto, etapas, ocorrencias, ambientes, financeiro, empresa } = data;
    const { chapas = [], acabamentos = [], observacoes = '', ressalvas = '', garantiaTexto, entregaFotos = [] } = config;

    const { cp, ca, watermarkSrc, watermarkOpacity } = extractColors(empresa);

    const baseHref = typeof window !== 'undefined' ? window.location.origin : '';
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const clienteNome = esc(projeto.cliente_nome || '—');
    const projNome = esc(projeto.nome || '—');
    const orcNumero = esc(projeto.orc_numero || '');
    const enderecoObra = esc((() => { try { return JSON.parse(projeto.mods_json || '{}').endereco_obra || ''; } catch (_) { return ''; } })());

    const itensHtml = (ambientes || []).length > 0
        ? (ambientes || []).map((amb, ai) => ambienteTable(amb, ai, chapas, acabamentos, entregaFotos)).join('')
        : '<div class="empty">Nenhum ambiente/módulo vinculado a este projeto.</div>';

    const garantia = garantiaTexto || 'Garantia de 5 (cinco) anos para defeitos de fabricação, em condições normais de uso. A garantia não cobre danos causados por mau uso, umidade excessiva, exposição direta ao sol ou modificações feitas por terceiros.';

    const ocorrHtml = (ocorrencias || []).length > 0 ? `
        <div class="section ressalvas">
            <h3>PENDÊNCIAS / RESSALVAS</h3>
            <table class="mt"><thead><tr><th>Assunto</th><th>Descrição</th><th>Status</th></tr></thead><tbody>
            ${ocorrencias.map(oc => `<tr><td class="nome"><strong>${esc(oc.assunto)}</strong></td><td>${esc(oc.descricao) || '—'}</td><td style="color:#ef4444;font-weight:600">Pendente</td></tr>`).join('')}
            </tbody></table>
        </div>` : '';

    const ressalvasHtml = ressalvas ? `<div class="section ressalvas"><h3>RESSALVAS</h3><p>${esc(ressalvas).replace(/\n/g, '<br>')}</p></div>` : '';

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><base href="${baseHref}"/><title>Termo de Entrega — ${clienteNome}</title><style>${buildBaseCSS(cp, ca)}</style></head><body>

${watermarkHtml(watermarkSrc, watermarkOpacity)}
<div class="content-wrap">

${headerHtml(empresa, 'TERMO DE ENTREGA', orcNumero ? `Ref.: ${orcNumero}` : '', dataHoje)}

<div class="info-box">
    <div class="fi"><label>Cliente</label><span>${clienteNome}</span></div>
    <div class="fi"><label>Projeto</label><span>${projNome}</span></div>
    <div class="fi"><label>Valor Total</label><span style="color:${cp};font-weight:700">${R(financeiro.valorTotal)}</span></div>
    ${enderecoObra ? `<div class="fi" style="grid-column:span 2"><label>Endereço da Obra</label><span>${enderecoObra}</span></div>` : ''}
    <div class="fi"><label>Data Início</label><span>${fmtDt(projeto.data_inicio)}</span></div>
</div>

<div class="fill-tip no-print">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
    <span>Preencha os checkboxes e observações antes de imprimir. Os campos preenchidos serão preservados no PDF.</span>
</div>

<div class="section"><h3>ITENS ENTREGUES</h3>${itensHtml}</div>

${checklistHtml(CHECKLIST)}
${ocorrHtml}
${ressalvasHtml}

<div class="garantia-box"><h3>GARANTIA</h3><p>${garantia}</p></div>

<div class="financeiro">
    <h3>SITUAÇÃO FINANCEIRA</h3>
    <div class="fin-row"><span>Valor do projeto:</span><span style="font-weight:600">${R(financeiro.valorTotal)}</span></div>
    <div class="fin-row"><span>Valor pago:</span><span style="font-weight:600;color:#16a34a">${R(financeiro.totalPago)}</span></div>
    ${financeiro.totalPendente > 0 ? `<div class="fin-row"><span>Saldo pendente:</span><span style="font-weight:600;color:#ef4444">${R(financeiro.totalPendente)}</span></div>` : ''}
    <div class="fin-row total"><span>${financeiro.totalPendente > 0 ? 'SALDO A PAGAR' : 'QUITADO'}</span><span style="color:${financeiro.totalPendente > 0 ? '#ef4444' : '#16a34a'}">${financeiro.totalPendente > 0 ? R(financeiro.totalPendente) : 'R$ 0,00'}</span></div>
</div>

${observacoes ? `<div class="obs"><h3>OBSERVAÇÕES</h3><p>${esc(observacoes).replace(/\n/g, '<br>')}</p></div>` : ''}

${assinaturasHtml(clienteNome, empresa.nome)}

<div class="footer-legal">
    Este documento atesta a entrega e aceitação dos móveis e serviços descritos acima.
    Após a assinatura, a garantia passa a vigorar conforme os termos especificados.
    ${orcNumero ? `Ref. Orçamento: ${orcNumero} · ` : ''}Projeto: ${projNome}
</div>

</div><!-- content-wrap -->
<button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>
</body></html>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. TERMOS POR AMBIENTE (1 página por ambiente, cada um com assinatura)
// ═════════════════════════════════════════════════════════════════════════════
export function buildTermoPorAmbienteHtml(data, config = {}) {
    const { projeto, ocorrencias, ambientes, financeiro, empresa } = data;
    const { chapas = [], acabamentos = [], observacoes = '', ressalvas = '', entregaFotos = [] } = config;

    const { cp, ca, watermarkSrc, watermarkOpacity } = extractColors(empresa);

    const baseHref = typeof window !== 'undefined' ? window.location.origin : '';
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const clienteNome = esc(projeto.cliente_nome || '—');
    const projNome = esc(projeto.nome || '—');
    const orcNumero = esc(projeto.orc_numero || '');
    const enderecoObra = esc((() => { try { return JSON.parse(projeto.mods_json || '{}').endereco_obra || ''; } catch (_) { return ''; } })());

    if (!ambientes || ambientes.length === 0) {
        return buildTermoEntregaHtml(data, config); // fallback para termo único
    }

    const pages = ambientes.map((amb, ai) => {
        return `
${ai > 0 ? '<div class="page-break"></div>' : ''}

${headerHtml(empresa, 'TERMO DE ENTREGA', `Ambiente ${ai + 1} de ${ambientes.length} — ${esc(amb.nome) || 'Sem nome'}`, dataHoje)}

<div class="info-box">
    <div class="fi"><label>Cliente</label><span>${clienteNome}</span></div>
    <div class="fi"><label>Projeto</label><span>${projNome}</span></div>
    <div class="fi"><label>Ambiente</label><span style="color:${cp};font-weight:700">${esc(amb.nome) || 'Sem nome'}</span></div>
    ${enderecoObra ? `<div class="fi" style="grid-column:span 2"><label>Endereço da Obra</label><span>${enderecoObra}</span></div>` : ''}
    <div class="fi"><label>Ref.</label><span>${orcNumero || '—'}</span></div>
</div>

${ai === 0 ? `<div class="fill-tip no-print">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
    <span>Preencha os checkboxes e observações antes de imprimir.</span>
</div>` : ''}

<div class="section">
    <h3>ITENS ENTREGUES — ${(esc(amb.nome) || 'AMBIENTE').toUpperCase()}</h3>
    ${ambienteTable(amb, ai, chapas, acabamentos, entregaFotos)}
</div>

${checklistHtml(CHECKLIST)}

${observacoes ? `<div class="obs"><h3>OBSERVAÇÕES</h3><p>${esc(observacoes).replace(/\n/g, '<br>')}</p></div>` : ''}

${assinaturasHtml(clienteNome, empresa.nome)}

<div class="footer-legal">
    Termo de Entrega — Ambiente ${ai + 1}/${ambientes.length}: ${esc(amb.nome) || 'Sem nome'} · ${projNome} · ${orcNumero || ''}
</div>`;
    });

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><base href="${baseHref}"/><title>Termos por Ambiente — ${clienteNome}</title><style>${buildBaseCSS(cp, ca)}</style></head><body>
${watermarkHtml(watermarkSrc, watermarkOpacity)}
<div class="content-wrap">
${pages.join('\n')}
</div><!-- content-wrap -->
<button class="print-btn no-print" onclick="window.print()">Imprimir Todos / Salvar PDF</button>
</body></html>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. CERTIFICADO DE GARANTIA (documento separado)
// ═════════════════════════════════════════════════════════════════════════════
export function buildCertificadoGarantiaHtml(data, config = {}) {
    const { projeto, ambientes, empresa } = data;
    const { chapas = [], acabamentos = [], garantiaTexto } = config;

    const { cp, ca, watermarkSrc, watermarkOpacity } = extractColors(empresa);

    const baseHref = typeof window !== 'undefined' ? window.location.origin : '';
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const clienteNome = esc(projeto.cliente_nome || '—');
    const projNome = esc(projeto.nome || '—');
    const orcNumero = esc(projeto.orc_numero || '');

    const garantiaPeriodo = '5 (cinco) anos';
    const dataEntrega = dataHoje;

    // Lista de ambientes e itens
    const itensResumo = (ambientes || []).map((amb, ai) => {
        const itens = amb.itens || amb.mods || [];
        return `<tr>
            <td style="font-weight:600">${esc(amb.nome) || 'Ambiente ' + (ai + 1)}</td>
            <td>${itens.length} item${itens.length !== 1 ? 'ns' : ''}</td>
            <td>${itens.map(m => esc(m.nome || m.tipo) || '—').join(', ')}</td>
        </tr>`;
    }).join('');

    const garantiaCustom = garantiaTexto || '';

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><base href="${baseHref}"/>
<title>Certificado de Garantia — ${clienteNome}</title>
<style>
${buildBaseCSS(cp, ca)}
.cert-border{border:3px solid ${cp};border-radius:12px;padding:24px;margin-bottom:20px;}
.cert-title{text-align:center;margin-bottom:20px;}
.cert-title h2{font-size:22px;font-weight:bold;color:${cp};letter-spacing:1px;}
.cert-title .sub{font-size:12px;color:#555;margin-top:4px;}

.clause{margin-bottom:12px;}
.clause h4{font-size:11px;font-weight:bold;color:${cp};margin-bottom:4px;text-transform:uppercase;}
.clause p, .clause li{font-size:10.5px;line-height:1.7;color:#333;}
.clause ul{padding-left:18px;margin-top:4px;}
.clause li{margin-bottom:3px;}

.cuidados{background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:12px 14px;margin-bottom:14px;}
.cuidados h4{color:${ca};font-size:11px;font-weight:bold;margin-bottom:6px;text-transform:uppercase;}
.cuidados li{font-size:10px;line-height:1.7;color:#555;}
.cuidados ul{padding-left:16px;}

.exclusoes{background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:12px 14px;margin-bottom:14px;}
.exclusoes h4{color:#dc2626;font-size:11px;font-weight:bold;margin-bottom:6px;text-transform:uppercase;}
.exclusoes li{font-size:10px;line-height:1.7;color:#555;}
.exclusoes ul{padding-left:16px;}

.cert-badge{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;margin-bottom:14px;}
.cert-badge span{font-size:13px;font-weight:bold;color:#16a34a;}
</style></head><body>

${watermarkHtml(watermarkSrc, watermarkOpacity)}
<div class="content-wrap">

<div class="cert-border">

${headerHtml(empresa, 'CERTIFICADO DE GARANTIA', orcNumero ? `Ref.: ${orcNumero}` : '', dataHoje)}

<div class="cert-badge">
    <span>&#x2714; GARANTIA DE ${garantiaPeriodo.toUpperCase()} PARA DEFEITOS DE FABRICAÇÃO</span>
</div>

<div class="info-box">
    <div class="fi"><label>Cliente</label><span>${clienteNome}</span></div>
    <div class="fi"><label>Projeto</label><span>${projNome}</span></div>
    <div class="fi"><label>Data de Entrega</label><span>${dataEntrega}</span></div>
</div>

<!-- Itens cobertos -->
<div class="clause">
    <h4>Itens Cobertos pela Garantia</h4>
    ${itensResumo ? `<table class="mt"><thead><tr><th>Ambiente</th><th>Qtd</th><th>Itens</th></tr></thead><tbody>${itensResumo}</tbody></table>` : '<p>Todos os móveis e itens descritos no orçamento e termo de entrega.</p>'}
</div>

<!-- Cobertura -->
<div class="clause">
    <h4>O que a Garantia Cobre</h4>
    ${garantiaCustom ? `<p>${esc(garantiaCustom).replace(/\n/g, '<br>')}</p>` : `<ul>
        <li>Defeitos de fabricação em materiais e acabamentos</li>
        <li>Descolamento de bordas e chapas em condições normais de uso</li>
        <li>Ferragens (dobradiças, corrediças, puxadores) — funcionamento normal</li>
        <li>Empenamento de portas e painéis dentro dos limites técnicos do material</li>
        <li>Mão de obra para reparo dos itens cobertos</li>
    </ul>`}
</div>

<!-- Cuidados e boas práticas -->
<div class="cuidados">
    <h4>Cuidados e Boas Práticas de Conservação</h4>
    <ul>
        <li><strong>Limpeza:</strong> Use apenas pano macio levemente umedecido com água e sabão neutro. Seque imediatamente após.</li>
        <li><strong>Nunca use:</strong> Produtos abrasivos, esponjas de aço, álcool, thinner, cloro, desengordurantes ou similares.</li>
        <li><strong>Umidade:</strong> Evite contato prolongado com água ou líquidos. Seque imediatamente qualquer derramamento.</li>
        <li><strong>Calor:</strong> Não apoie objetos quentes diretamente sobre a superfície (use apoios/descansos de panela).</li>
        <li><strong>Peso:</strong> Respeite a capacidade de carga das prateleiras e gavetas. Não force portas ou gavetas.</li>
        <li><strong>Sol:</strong> Evite exposição direta e prolongada ao sol, que pode desbotar acabamentos e ressecar a madeira.</li>
        <li><strong>Ventilação:</strong> Mantenha o ambiente ventilado para evitar acúmulo de umidade.</li>
        <li><strong>Ferragens:</strong> Verifique e reaperte parafusos periodicamente. Lubrifique dobradiças e corrediças a cada 6 meses.</li>
        <li><strong>Instalação:</strong> Não instale móveis próximos a fontes de calor (fogão, forno) sem proteção adequada.</li>
    </ul>
</div>

<!-- Exclusões -->
<div class="exclusoes">
    <h4>O que a Garantia NÃO Cobre</h4>
    <ul>
        <li>Danos causados por mau uso, negligência ou uso inadequado dos móveis</li>
        <li>Danos por umidade excessiva, infiltrações ou contato prolongado com água</li>
        <li>Desgaste natural do acabamento pelo uso cotidiano</li>
        <li>Danos causados por produtos de limpeza abrasivos ou químicos</li>
        <li>Modificações, reparos ou intervenções realizadas por terceiros não autorizados</li>
        <li>Exposição direta ao sol, calor excessivo ou variações extremas de temperatura</li>
        <li>Danos decorrentes de transporte ou mudança após a instalação</li>
        <li>Danos causados por insetos, pragas ou animais domésticos</li>
        <li>Variações de tonalidade naturais da madeira e dos materiais</li>
        <li>Instalação elétrica ou hidráulica não relacionada aos móveis</li>
    </ul>
</div>

<!-- Condições -->
<div class="clause">
    <h4>Condições Gerais</h4>
    <ul>
        <li>A garantia tem validade de ${garantiaPeriodo} a partir da data de entrega.</li>
        <li>Para acionar a garantia, entre em contato informando o número deste certificado.</li>
        <li>A visita técnica será agendada em até 10 dias úteis após a solicitação.</li>
        <li>Este certificado só é válido com o Termo de Entrega devidamente assinado.</li>
        <li>A garantia é intransferível e vinculada ao endereço de instalação original.</li>
    </ul>
</div>

<!-- Contato -->
<div class="info-box" style="background:#f0fdf4;border-color:#bbf7d0;">
    <div class="fi"><label>Contato para Garantia</label><span>${esc(empresa.nome) || 'Marcenaria'}</span></div>
    <div class="fi"><label>Telefone</label><span>${esc(empresa.telefone) || '—'}</span></div>
    <div class="fi"><label>Email</label><span>${esc(empresa.email) || '—'}</span></div>
</div>

${assinaturasHtml(clienteNome, empresa.nome)}

<div class="footer-legal">
    Certificado de Garantia — ${projNome} · ${orcNumero || ''} · Emitido em ${dataHoje}
    <br>Este documento deve ser mantido junto ao Termo de Entrega para acionamento da garantia.
</div>

</div><!-- fim cert-border -->

</div><!-- content-wrap -->
<button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>
</body></html>`;
}
