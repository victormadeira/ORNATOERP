import { useMemo } from 'react';
import { R$, N, calcItemV2, calcPainelRipado, precoVenda, FERR_GROUPS } from '../engine';
import { Download, X, Layers, Package, Scissors, DollarSign } from 'lucide-react';
import { Z } from '../ui';
import api from '../api';

// ── Meios de pagamento (display) ────────────────────────────────────────────
const MEIO_LABEL = {
    pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
    cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
    boleto: 'Boleto', cheque: 'Cheque', '': 'Sem definir',
};

// ── Agrupar ferragens por tipo ──────────────────────────────────────────────
function groupFerragens(fa) {
    const groups = { 'Corrediças': [], 'Dobradiças': [], 'Puxadores': [], 'Outros': [] };
    Object.values(fa).forEach(f => {
        if (FERR_GROUPS.corredica.includes(f.id)) groups['Corrediças'].push(f);
        else if (FERR_GROUPS.dobradica.includes(f.id)) groups['Dobradiças'].push(f);
        else if (FERR_GROUPS.puxador.includes(f.id)) groups['Puxadores'].push(f);
        else groups['Outros'].push(f);
    });
    return groups;
}

// ── Calcular breakdown por ambiente ─────────────────────────────────────────
function calcAmbReports(ambientes, bib, padroes) {
    return ambientes.map(amb => {
        const ca = {}, fa = {}, fitaByMat = {};
        let fita = 0, custo = 0;
        (amb.itens || []).forEach(item => {
            try {
                const res = calcItemV2(
                    item.caixaDef, item.dims, item.mats,
                    (item.componentes || []).map(ci => ({
                        compDef: ci.compDef, qtd: ci.qtd || 1, vars: ci.vars || {},
                        matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                    })),
                    bib, padroes,
                );
                const coef = item.caixaDef?.coef || 0;
                const qtd = item.qtd || 1;
                const itemCusto = res.custo * (1 + coef) * qtd;
                custo += itemCusto;
                fita += res.fita * qtd;
                // Agregar fita por material
                Object.entries(res.fitaByMat || {}).forEach(([matId, v]) => {
                    if (!fitaByMat[matId]) fitaByMat[matId] = { metros: 0, preco: v.preco, matNome: ca[matId]?.mat?.nome || matId };
                    fitaByMat[matId].metros += v.metros * qtd;
                });
                Object.entries(res.chapas).forEach(([id, c]) => {
                    if (!ca[id]) ca[id] = { mat: c.mat, area: 0, n: 0 };
                    ca[id].area += c.area * qtd;
                    const perda = c.mat.perda_pct != null ? c.mat.perda_pct : 15;
                    const areaUtil = ((c.mat.larg * c.mat.alt) / 1e6) * (1 - perda / 100);
                    ca[id].n = areaUtil > 0 ? Math.ceil(ca[id].area / areaUtil) : 1;
                    // Resolver nome do material para fita
                    if (fitaByMat[id]) fitaByMat[id].matNome = c.mat.nome;
                });
                res.ferrList.forEach(f => {
                    if (!fa[f.id]) fa[f.id] = { ...f, qtd: 0 };
                    fa[f.id].qtd += f.qtd * qtd;
                });
            } catch (_) { }
        });
        // Painéis ripados — agregar chapas, fitas e substrato
        (amb.paineis || []).forEach(painel => {
            try {
                const bibFlat = bib ? Object.values(bib).flat() : [];
                const res = calcPainelRipado(painel, bibFlat);
                if (!res) return;
                const qtd = painel.qtd || 1;
                custo += res.custoMaterial * qtd;
                // Chapas das ripas verticais
                if (res.matV && res.chapasV > 0) {
                    const id = res.matV.id;
                    const areaV = res.mlV * (painel.wV || 40) / 1000 * qtd;
                    if (!ca[id]) ca[id] = { mat: res.matV, area: 0, n: 0 };
                    ca[id].area += areaV;
                    ca[id].n += res.chapasV * qtd;
                }
                // Chapas das ripas horizontais (muxarabi)
                if (res.matH && res.chapasH > 0) {
                    const id = res.matH.id;
                    const _wH = painel.mesmasRipas ? (painel.wV || 40) : (painel.wH || 40);
                    const areaH = res.mlH * _wH / 1000 * qtd;
                    if (!ca[id]) ca[id] = { mat: res.matH, area: 0, n: 0 };
                    ca[id].area += areaH;
                    ca[id].n += res.chapasH * qtd;
                }
                // Substrato
                if (res.matSub && painel.temSubstrato) {
                    const id = res.matSub.id;
                    if (!ca[id]) ca[id] = { mat: res.matSub, area: 0, n: 0 };
                    ca[id].area += res.areaSubstrato * qtd;
                    const perda = res.matSub.perda_pct != null ? res.matSub.perda_pct : 15;
                    const areaUtil = ((res.matSub.largura * res.matSub.altura) / 1e6) * (1 - perda / 100);
                    ca[id].n = areaUtil > 0 ? Math.ceil(ca[id].area / areaUtil) : 1;
                }
                // Fitas dos ripados
                if (res.fitaTotal > 0) {
                    const fitaMatId = res.matV?.id || 'ripa';
                    const fitasDB = bib?.fitas || [];
                    const fitaPreco = (res.matV?.fita_preco > 0) ? res.matV.fita_preco : (fitasDB[0]?.preco || 0.85);
                    if (!fitaByMat[fitaMatId]) fitaByMat[fitaMatId] = { metros: 0, preco: fitaPreco, matNome: res.matV?.nome || 'Ripado' };
                    fitaByMat[fitaMatId].metros += res.fitaTotal * qtd;
                    fita += res.fitaTotal * qtd;
                }
            } catch (_) { }
        });
        return { id: amb.id, nome: amb.nome, ca, fa, fita, fitaByMat, custo };
    });
}

// ── Componente: tabela de chapas ────────────────────────────────────────────
function TabelaChapas({ ca, title }) {
    const entries = Object.entries(ca);
    if (entries.length === 0) return null;
    return (
        <div style={{ marginBottom: 16 }}>
            {title && <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#555' }}>Material</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', color: '#555' }}>Espessura</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#555' }}>Área (m²)</th>
                        <th style={{ textAlign: 'center', padding: '6px 8px', color: '#555' }}>Chapas</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#555' }}>Unit.</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: '#555', fontWeight: 700 }}>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map(([id, c]) => (
                        <tr key={id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '5px 8px' }}>{c.mat.nome}</td>
                            <td style={{ textAlign: 'center', padding: '5px 8px', color: '#888' }}>{c.mat.esp}mm</td>
                            <td style={{ textAlign: 'right', padding: '5px 8px' }}>{N(c.area, 2)}</td>
                            <td style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 600, color: '#1a56db' }}>{c.n}</td>
                            <td style={{ textAlign: 'right', padding: '5px 8px', color: '#888' }}>{R$(c.mat.preco)}</td>
                            <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 600 }}>{R$(c.n * c.mat.preco)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Componente: tabela de ferragens ─────────────────────────────────────────
function TabelaFerragens({ fa }) {
    const groups = groupFerragens(fa);
    const hasAny = Object.values(groups).some(g => g.length > 0);
    if (!hasAny) return null;
    return (
        <div style={{ marginBottom: 16 }}>
            {Object.entries(groups).map(([grpName, items]) => {
                if (items.length === 0) return null;
                const grpTotal = items.reduce((s, f) => s + f.preco * f.qtd, 0);
                return (
                    <div key={grpName} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{grpName}</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #ddd' }}>
                                    <th style={{ textAlign: 'left', padding: '5px 8px', color: '#555' }}>Item</th>
                                    <th style={{ textAlign: 'center', padding: '5px 8px', color: '#555' }}>Qtd</th>
                                    <th style={{ textAlign: 'center', padding: '5px 8px', color: '#555' }}>Un.</th>
                                    <th style={{ textAlign: 'right', padding: '5px 8px', color: '#555' }}>Unit.</th>
                                    <th style={{ textAlign: 'right', padding: '5px 8px', color: '#555', fontWeight: 700 }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((f, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '5px 8px' }}>{f.nome}</td>
                                        <td style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 600 }}>{N(f.qtd, 0)}</td>
                                        <td style={{ textAlign: 'center', padding: '5px 8px', color: '#888' }}>{f.un}</td>
                                        <td style={{ textAlign: 'right', padding: '5px 8px', color: '#888' }}>{R$(f.preco)}</td>
                                        <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 600 }}>{R$(f.preco * f.qtd)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #ccc' }}>
                                    <td colSpan={4} style={{ padding: '5px 8px', fontWeight: 700, fontSize: 11, color: '#555' }}>Subtotal {grpName}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700, color: '#1a56db' }}>{R$(grpTotal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                );
            })}
        </div>
    );
}

// ── buildRelatorioHtml — HTML string completa para Puppeteer ────────────────
export function buildRelatorioHtml({ empresa, orcamento, ambientes, tot, taxas, pagamento, pvComDesconto, bib, padroes }) {
    const ambReports = calcAmbReports(ambientes, bib, padroes);
    const ferrGroups = groupFerragens(tot.fa);
    const custoFerragens = Object.values(tot.fa).reduce((s, f) => s + f.preco * f.qtd, 0);
    const custoChapas = Object.values(tot.ca).reduce((s, c) => s + c.n * c.mat.preco, 0);
    // Agregar fitaByMat de todos os ambientes
    const fitaByMatTotal = {};
    ambReports.forEach(a => {
        Object.entries(a.fitaByMat || {}).forEach(([matId, v]) => {
            if (!fitaByMatTotal[matId]) fitaByMatTotal[matId] = { metros: 0, preco: v.preco, matNome: v.matNome };
            fitaByMatTotal[matId].metros += v.metros;
        });
    });
    const descontoR = (pagamento?.desconto?.valor || 0) > 0
        ? (pagamento.desconto.tipo === '%' ? tot.pvFinal * (pagamento.desconto.valor / 100) : Math.min(pagamento.desconto.valor, tot.pvFinal))
        : 0;

    const renderChapasTable = (ca) => {
        const entries = Object.entries(ca);
        if (!entries.length) return '<p style="color:#999;font-size:12px">Sem chapas neste ambiente</p>';
        return `<table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="border-bottom:2px solid #ddd">
                <th style="text-align:left;padding:5px 8px;color:#555">Material</th>
                <th style="text-align:center;padding:5px 8px;color:#555">Esp.</th>
                <th style="text-align:right;padding:5px 8px;color:#555">Área (m²)</th>
                <th style="text-align:center;padding:5px 8px;color:#555">Chapas</th>
                <th style="text-align:right;padding:5px 8px;color:#555">Unit.</th>
                <th style="text-align:right;padding:5px 8px;color:#555;font-weight:700">Subtotal</th>
            </tr></thead><tbody>
            ${entries.map(([, c]) => `<tr style="border-bottom:1px solid #eee">
                <td style="padding:5px 8px">${c.mat.nome}</td>
                <td style="text-align:center;padding:5px 8px;color:#888">${c.mat.esp}mm</td>
                <td style="text-align:right;padding:5px 8px">${N(c.area, 2)}</td>
                <td style="text-align:center;padding:5px 8px;font-weight:600;color:#1a56db">${c.n}</td>
                <td style="text-align:right;padding:5px 8px;color:#888">${R$(c.mat.preco)}</td>
                <td style="text-align:right;padding:5px 8px;font-weight:600">${R$(c.n * c.mat.preco)}</td>
            </tr>`).join('')}
            </tbody></table>`;
    };

    const renderFerrGroup = (name, items) => {
        if (!items.length) return '';
        const total = items.reduce((s, f) => s + f.preco * f.qtd, 0);
        return `<div style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">${name}</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="border-bottom:2px solid #ddd">
                <th style="text-align:left;padding:5px 8px;color:#555">Item</th>
                <th style="text-align:center;padding:5px 8px;color:#555">Qtd</th>
                <th style="text-align:center;padding:5px 8px;color:#555">Un.</th>
                <th style="text-align:right;padding:5px 8px;color:#555">Unit.</th>
                <th style="text-align:right;padding:5px 8px;color:#555;font-weight:700">Subtotal</th>
            </tr></thead><tbody>
            ${items.map(f => `<tr style="border-bottom:1px solid #eee">
                <td style="padding:5px 8px">${f.nome}</td>
                <td style="text-align:center;padding:5px 8px;font-weight:600">${N(f.qtd, 0)}</td>
                <td style="text-align:center;padding:5px 8px;color:#888">${f.un}</td>
                <td style="text-align:right;padding:5px 8px;color:#888">${R$(f.preco)}</td>
                <td style="text-align:right;padding:5px 8px;font-weight:600">${R$(f.preco * f.qtd)}</td>
            </tr>`).join('')}
            </tbody>
            <tfoot><tr style="border-top:2px solid #ccc">
                <td colspan="4" style="padding:5px 8px;font-weight:700;font-size:11px;color:#555">Subtotal ${name}</td>
                <td style="text-align:right;padding:5px 8px;font-weight:700;color:#1a56db">${R$(total)}</td>
            </tr></tfoot></table></div>`;
    };

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, sans-serif; color: #333; line-height: 1.5; }
    .page { padding: 0; }
    .header { display:flex; justify-content:space-between; align-items:center; padding-bottom:16px; border-bottom:3px solid #1a56db; margin-bottom:24px; }
    .header-left { display:flex; align-items:center; gap:12px; }
    .header-right { text-align:right; font-size:11px; color:#666; }
    .title { font-size:18px; font-weight:800; color:#1a56db; }
    .section { margin-bottom:24px; page-break-inside:avoid; }
    .section-title { font-size:14px; font-weight:700; color:#1a56db; border-bottom:2px solid #e5e7eb; padding-bottom:6px; margin-bottom:12px; display:flex; align-items:center; gap:6px; }
    .amb-title { font-size:12px; font-weight:700; color:#374151; background:#f3f4f6; padding:6px 10px; border-radius:4px; margin-bottom:8px; }
    .summary-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .summary-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; }
    .summary-label { font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#64748b; margin-bottom:2px; }
    .summary-value { font-size:16px; font-weight:700; color:#1e293b; }
    .summary-value.primary { color:#1a56db; }
    .total-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #eee; font-size:12px; }
    .total-row.final { border-top:2px solid #1a56db; border-bottom:none; padding-top:10px; font-size:14px; font-weight:700; }
    .total-row .label { color:#555; }
    .total-row .value { font-weight:600; }
    .footer { margin-top:32px; padding-top:16px; border-top:1px solid #ddd; font-size:10px; color:#999; text-align:center; }
</style></head><body><div class="page">
    <div class="header">
        <div class="header-left">
            ${empresa?.logo_header_path ? `<img src="${empresa.logo_header_path}" style="height:40px;max-width:120px;object-fit:contain" />` : ''}
            <div>
                <div class="title">RELATÓRIO DE MATERIAIS</div>
                <div style="font-size:11px;color:#666">${empresa?.nome || ''}</div>
            </div>
        </div>
        <div class="header-right">
            <div style="font-weight:700">${orcamento?.numero || ''}</div>
            <div>Cliente: ${orcamento?.cliente_nome || ''}</div>
            <div>Projeto: ${orcamento?.projeto || ''}</div>
            <div>${new Date().toLocaleDateString('pt-BR')}</div>
        </div>
    </div>

    <!-- Chapas por Ambiente -->
    <div class="section">
        <div class="section-title">Chapas por Ambiente</div>
        ${ambReports.map(a => `
            <div class="amb-title">${a.nome} — Custo Material: ${R$(a.custo)}</div>
            ${renderChapasTable(a.ca)}
        `).join('')}
    </div>

    <!-- BOM Ferragens -->
    <div class="section">
        <div class="section-title">BOM — Ferragens</div>
        ${Object.entries(ferrGroups).map(([name, items]) => renderFerrGroup(name, items)).join('')}
    </div>

    <!-- Fita de Borda -->
    ${tot.ft > 0 ? `<div class="section">
        <div class="section-title">Fita de Borda</div>
        ${Object.keys(fitaByMatTotal).length > 0
            ? `<table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:#f5f5f5">
                    <th style="text-align:left;padding:5px 8px;color:#555">Material</th>
                    <th style="text-align:right;padding:5px 8px;color:#555">Metros</th>
                    <th style="text-align:right;padding:5px 8px;color:#555">R$/m</th>
                    <th style="text-align:right;padding:5px 8px;color:#555">Subtotal</th>
                </tr></thead>
                <tbody>
                ${Object.entries(fitaByMatTotal).map(([, v]) => `
                    <tr style="border-bottom:1px solid #eee">
                        <td style="padding:5px 8px">${v.matNome}</td>
                        <td style="text-align:right;padding:5px 8px">${N(v.metros, 1)} m</td>
                        <td style="text-align:right;padding:5px 8px">${R$(v.preco)}</td>
                        <td style="text-align:right;padding:5px 8px;font-weight:600">${R$(v.metros * v.preco)}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot><tr style="background:#f5f5f5;font-weight:700">
                    <td style="padding:5px 8px">Total</td>
                    <td style="text-align:right;padding:5px 8px">${N(tot.ft, 1)} m</td>
                    <td></td>
                    <td style="text-align:right;padding:5px 8px">${R$(Object.values(fitaByMatTotal).reduce((s,v)=>s+v.metros*v.preco,0))}</td>
                </tr></tfoot>
               </table>`
            : `<div style="font-size:13px;padding:8px 0">Total: <strong>${N(tot.ft, 1)} metros lineares</strong></div>`
        }
    </div>` : ''}

    <!-- Resumo de Custos -->
    <div class="section">
        <div class="section-title">Resumo de Custos</div>
        <div class="summary-grid">
            <div class="summary-box"><div class="summary-label">Material (Chapas)</div><div class="summary-value">${R$(custoChapas)}</div></div>
            <div class="summary-box"><div class="summary-label">Ferragens</div><div class="summary-value">${R$(custoFerragens)}</div></div>
            <div class="summary-box"><div class="summary-label">Mão de Obra</div><div class="summary-value">${R$(tot.custoMdo)}</div></div>
            <div class="summary-box"><div class="summary-label">Instalação</div><div class="summary-value">${R$(tot.custoInst)}</div></div>
        </div>
        <div style="margin-top:12px">
            <div class="total-row"><span class="label">Custo Material Total</span><span class="value">${R$(tot.cm)}</span></div>
            <div class="total-row"><span class="label">Custo Base (Material + MO + Inst.)</span><span class="value">${R$(tot.cb)}</span></div>
            <div class="total-row"><span class="label">Preço Venda (markup divisor)</span><span class="value">${R$(tot.pvFinal)}</span></div>
            ${descontoR > 0 ? `<div class="total-row"><span class="label" style="color:#ef4444">Desconto</span><span class="value" style="color:#ef4444">−${R$(descontoR)}</span></div>` : ''}
            <div class="total-row final"><span class="label">VALOR FINAL</span><span class="value primary">${R$(pvComDesconto)}</span></div>
        </div>
    </div>

    ${pagamento?.blocos?.length > 0 ? `<div class="section">
        <div class="section-title">Condições de Pagamento</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="border-bottom:2px solid #ddd">
            <th style="text-align:left;padding:5px 8px;color:#555">Descrição</th>
            <th style="text-align:center;padding:5px 8px;color:#555">%</th>
            <th style="text-align:center;padding:5px 8px;color:#555">Meio</th>
            <th style="text-align:center;padding:5px 8px;color:#555">Parcelas</th>
            <th style="text-align:right;padding:5px 8px;color:#555">Valor</th>
        </tr></thead><tbody>
        ${pagamento.blocos.map(b => {
        const vb = pvComDesconto * (b.percentual || 0) / 100;
        const np = Math.max(1, b.parcelas || 1);
        return `<tr style="border-bottom:1px solid #eee">
                <td style="padding:5px 8px">${b.descricao || '—'}</td>
                <td style="text-align:center;padding:5px 8px">${b.percentual}%</td>
                <td style="text-align:center;padding:5px 8px">${MEIO_LABEL[b.meio] || b.meio}</td>
                <td style="text-align:center;padding:5px 8px">${np > 1 ? `${np}×` : 'À vista'}</td>
                <td style="text-align:right;padding:5px 8px;font-weight:600">${np > 1 ? `${np}× ${R$(vb / np)}` : R$(vb)}</td>
            </tr>`;
    }).join('')}
        </tbody></table>
    </div>` : ''}

    <div class="footer">${empresa?.nome || ''} — ${empresa?.telefone || ''} — ${empresa?.email || ''} — Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
</div></body></html>`;
}

// ── Componente React (para renderizar in-tab no Novo.jsx) ───────────────────
export default function RelatorioMateriais({ empresa, orcamento, ambientes, tot, bib, padroes, taxas, pagamento, pvComDesconto, onClose, onPdf }) {
    const ambReports = useMemo(() => calcAmbReports(ambientes, bib, padroes), [ambientes, bib, padroes]);
    const custoFerragens = useMemo(() => Object.values(tot.fa).reduce((s, f) => s + f.preco * f.qtd, 0), [tot.fa]);
    const custoChapas = useMemo(() => Object.values(tot.ca).reduce((s, c) => s + c.n * c.mat.preco, 0), [tot.ca]);
    const fitaByMatTotal = useMemo(() => {
        const acc = {};
        ambReports.forEach(a => {
            Object.entries(a.fitaByMat || {}).forEach(([matId, v]) => {
                if (!acc[matId]) acc[matId] = { metros: 0, preco: v.preco, matNome: v.matNome };
                acc[matId].metros += v.metros;
            });
        });
        return acc;
    }, [ambReports]);
    const custoFita = useMemo(() =>
        Object.values(fitaByMatTotal).reduce((s, v) => s + v.metros * v.preco, 0) || 0,
        [fitaByMatTotal]);

    const isEmpty = ambientes.every(a => (a.itens || []).length === 0 && (a.paineis || []).length === 0);

    if (isEmpty) {
        return (
            <div className={Z.card} style={{ marginTop: 20 }}>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Package size={14} /> Relatório de Materiais
                    </h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)]"><X size={16} /></button>
                </div>
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>Adicione itens ao orçamento para gerar o relatório.</p>
            </div>
        );
    }

    return (
        <div className={Z.card} style={{ marginTop: 20 }}>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Package size={14} /> Relatório de Materiais
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={onPdf} className={`${Z.btn} text-xs py-1.5 px-3`}>
                        <Download size={13} /> Baixar PDF
                    </button>
                    <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)]"><X size={16} /></button>
                </div>
            </div>

            {/* Chapas por Ambiente */}
            <div className="mb-5">
                <div className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
                    <Layers size={13} /> CHAPAS POR AMBIENTE
                </div>
                {ambReports.map(a => (
                    <div key={a.id} className="mb-3">
                        <div className="text-xs font-semibold px-2 py-1 rounded mb-1.5" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                            {a.nome} — Custo Material: {R$(a.custo)}
                        </div>
                        <TabelaChapas ca={a.ca} />
                    </div>
                ))}
            </div>

            {/* BOM Ferragens */}
            {Object.keys(tot.fa).length > 0 && (
                <div className="mb-5">
                    <div className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: '#a855f7' }}>
                        <Package size={13} /> BOM — FERRAGENS
                    </div>
                    <TabelaFerragens fa={tot.fa} />
                </div>
            )}

            {/* Fita de Borda */}
            {tot.ft > 0 && (
                <div className="mb-5">
                    <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#f59e0b' }}>
                        <Scissors size={13} /> FITA DE BORDA
                    </div>
                    {Object.keys(fitaByMatTotal).length > 0 ? (
                        <table className="w-full text-xs">
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th className="text-left py-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Material</th>
                                    <th className="text-right py-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Metros</th>
                                    <th className="text-right py-1 font-semibold" style={{ color: 'var(--text-muted)' }}>R$/m</th>
                                    <th className="text-right py-1 font-semibold" style={{ color: 'var(--text-muted)' }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(fitaByMatTotal).map(([matId, v]) => (
                                    <tr key={matId} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td className="py-1.5" style={{ color: 'var(--text-primary)' }}>{v.matNome}</td>
                                        <td className="text-right py-1.5" style={{ color: 'var(--text-secondary)' }}>{N(v.metros, 1)} m</td>
                                        <td className="text-right py-1.5" style={{ color: 'var(--text-secondary)' }}>{R$(v.preco)}/m</td>
                                        <td className="text-right py-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>{R$(v.metros * v.preco)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid var(--border)' }}>
                                    <td className="py-1.5 font-bold" style={{ color: 'var(--text-primary)' }}>Total</td>
                                    <td className="text-right py-1.5 font-bold" style={{ color: 'var(--text-primary)' }}>{N(tot.ft, 1)} m</td>
                                    <td />
                                    <td className="text-right py-1.5 font-bold" style={{ color: 'var(--primary)' }}>{R$(custoFita)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Total: <strong>{N(tot.ft, 1)} metros lineares</strong>
                            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>(cadastre o Fita R$/m nos materiais para ver o detalhamento)</span>
                        </p>
                    )}
                </div>
            )}

            {/* Resumo de Custos */}
            <div className="mb-3">
                <div className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: '#16a34a' }}>
                    <DollarSign size={13} /> RESUMO DE CUSTOS
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    {[['Material (Chapas)', custoChapas], ['Ferragens', custoFerragens], ['Mão de Obra', tot.custoMdo], ['Instalação', tot.custoInst]].map(([l, v]) => (
                        <div key={l} className="rounded-lg p-3" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>{l}</div>
                            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{R$(v)}</div>
                        </div>
                    ))}
                </div>
                <div className="text-xs flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span>Custo Material Total</span><span className="font-semibold">{R$(tot.cm)}</span>
                    </div>
                    <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span>Custo Base (Material + MO + Inst.)</span><span className="font-semibold">{R$(tot.cb)}</span>
                    </div>
                    <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span>Preço Venda (markup)</span><span className="font-semibold">{R$(tot.pvFinal)}</span>
                    </div>
                    <div className="flex justify-between py-2 text-sm font-bold" style={{ borderTop: '2px solid var(--primary)', color: 'var(--primary)' }}>
                        <span>VALOR FINAL</span><span>{R$(pvComDesconto)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
