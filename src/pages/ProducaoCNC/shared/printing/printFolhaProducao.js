// Extraído automaticamente de ProducaoCNC.jsx (linhas 2306-2579).

export function printFolhaProducao(chapa, chapaIdx, pecasMap, loteAtual, getModColor, kerf, refilo, totalChapas) {
    const modColors = ['#5b7fa6', '#8b6e4e', '#6a8e6e', '#9e7b5c', '#7a8999', '#a67c52', '#6b8f8b', '#8a7d6d', '#5f7d8a', '#7d6b5e'];
    const getColor = (pecaId) => {
        const piece = pecasMap[pecaId];
        if (!piece) return modColors[0];
        return modColors[(piece.modulo_id || 0) % modColors.length];
    };

    const nPecas = chapa.pecas.length;
    const ref = chapa.refilo || refilo || 0;
    const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
    const totalCh = totalChapas || '?';

    // ─── Build SVG (high-res for print ~170mm on A4) ───
    const maxSvgW = 640;
    const maxSvgH = nPecas <= 12 ? 280 : 360;
    const sc = Math.min(maxSvgW / chapa.comprimento, maxSvgH / chapa.largura);
    const sw = Math.round(chapa.comprimento * sc);
    const sh = Math.round(chapa.largura * sc);

    let pecasSvg = '';
    for (let pi = 0; pi < nPecas; pi++) {
        const p = chapa.pecas[pi];
        const px = (p.x + ref) * sc, py = (p.y + ref) * sc, pw = p.w * sc, ph = p.h * sc;
        const c = getColor(p.pecaId);
        const piece = pecasMap[p.pecaId];
        const num = pi + 1;

        pecasSvg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${c}25" stroke="#1a1a1a" stroke-width="0.8"/>`;

        // Nome da peça (descrição) — só em peças grandes o suficiente. Helps operador
        // identificar visualmente sem cruzar com a tabela.
        if (pw > 70 && ph > 35 && piece?.descricao) {
            // Quebra em até 2 linhas se nome for longo
            const maxChars = Math.floor(pw / 4);
            const desc = piece.descricao;
            const truncated = desc.length > maxChars ? desc.substring(0, maxChars - 1) + '…' : desc;
            // Posição: acima do número central, sem sobrepor
            pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2 - 14}" text-anchor="middle" font-size="6.5" fill="#1a1a1a" font-weight="600">${truncated.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</text>`;
            // Subtítulo com upmcode/módulo se houver espaço
            if (piece.modulo_desc && ph > 60) {
                const modTxt = piece.modulo_desc.length > maxChars ? piece.modulo_desc.substring(0, maxChars - 1) + '…' : piece.modulo_desc;
                pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2 - 6}" text-anchor="middle" font-size="5" fill="#666" font-style="italic">${modTxt.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</text>`;
            }
        }

        // Dimension labels on pieces
        if (pw > 35 && ph > 14) {
            pecasSvg += `<text x="${px + pw / 2}" y="${py + ph - 3}" text-anchor="middle" font-size="5.5" fill="#555" font-family="monospace">${Math.round(p.w)}x${Math.round(p.h)}</text>`;
        }

        // Borders as colored lines
        if (piece?.borda_frontal) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px + pw}" y2="${py}" stroke="#d97706" stroke-width="2.5"/>`;
        if (piece?.borda_traseira) pecasSvg += `<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="#d97706" stroke-width="2.5"/>`;
        if (piece?.borda_esq) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py + ph}" stroke="#d97706" stroke-width="2.5"/>`;
        if (piece?.borda_dir) pecasSvg += `<line x1="${px + pw}" y1="${py}" x2="${px + pw}" y2="${py + ph}" stroke="#d97706" stroke-width="2.5"/>`;

        // Number circle — for small pieces, show number as tiny label above
        const numR = Math.min(12, Math.min(pw, ph) * 0.3);
        if (numR >= 5) {
            pecasSvg += `<circle cx="${px + pw / 2}" cy="${py + ph / 2}" r="${numR}" fill="#1a1a1a" opacity="0.85"/>`;
            pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(10, numR * 1.3)}" fill="#fff" font-weight="700">${num}</text>`;
        } else if (pw >= 8 && ph >= 8) {
            // Small piece — tiny number without circle
            pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2}" text-anchor="middle" dominant-baseline="central" font-size="4" fill="#1a1a1a" font-weight="800">${num}</text>`;
        }

        // Rotation indicator
        if (p.rotated && pw > 18 && ph > 18) {
            pecasSvg += `<text x="${px + 4}" y="${py + 9}" font-size="6" fill="#1a1a1a" font-weight="700" opacity="0.6">R</text>`;
        }
    }

    // Retalhos (remnants)
    let retSvg = '';
    for (const r of (chapa.retalhos || [])) {
        const rx = (r.x + ref) * sc, ry = (r.y + ref) * sc, rw = r.w * sc, rh = r.h * sc;
        retSvg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="#9ca3af" stroke-width="0.8" stroke-dasharray="4 2" opacity="0.5"/>`;
        if (rw > 30 && rh > 12) retSvg += `<text x="${rx + rw / 2}" y="${ry + rh / 2}" text-anchor="middle" dominant-baseline="central" font-size="6" fill="#9ca3af" opacity="0.7">${Math.round(r.w)}x${Math.round(r.h)}</text>`;
    }

    // Grain direction arrow
    let grainSvg = '';
    if (hasVeio) {
        const gx = sw - 50, gy = sh + 14;
        // Veio sempre segue comprimento (horizontal) — é só indicar que tem veio
        grainSvg = `<g transform="translate(${gx},${gy})"><line x1="0" y1="0" x2="30" y2="0" stroke="#555" stroke-width="1.2"/><polygon points="30,-3 36,0 30,3" fill="#555"/><text x="18" y="-5" text-anchor="middle" font-size="6" fill="#555">VEIO</text></g>`;
    }

    // Scale bar (100mm reference)
    const scaleBarPx = 100 * sc;
    const scaleBarSvg = `<g transform="translate(4,${sh + 10})"><line x1="0" y1="0" x2="${scaleBarPx}" y2="0" stroke="#333" stroke-width="1"/><line x1="0" y1="-3" x2="0" y2="3" stroke="#333" stroke-width="0.8"/><line x1="${scaleBarPx}" y1="-3" x2="${scaleBarPx}" y2="3" stroke="#333" stroke-width="0.8"/><text x="${scaleBarPx / 2}" y="9" text-anchor="middle" font-size="6" fill="#555">100mm</text></g>`;

    const svgBlock = `<svg width="${sw + 4}" height="${sh + 28}" viewBox="-2 -2 ${sw + 4} ${sh + 28}" style="border:1px solid #ccc;background:#fff">
        <rect x="0" y="0" width="${sw}" height="${sh}" fill="#eae5dc" stroke="#8a7d6d" stroke-width="1"/>
        ${ref > 0 ? `<rect x="${ref * sc}" y="${ref * sc}" width="${sw - 2 * ref * sc}" height="${sh - 2 * ref * sc}" fill="none" stroke="#b5a99a" stroke-width="0.5" stroke-dasharray="3 2"/>` : ''}
        ${pecasSvg}${retSvg}${grainSvg}${scaleBarSvg}
    </svg>`;

    // ─── Build piece table rows grouped by ambiente ───
    const bdCell = (val) => val ? `<td class="bd-yes">${val}</td>` : `<td class="bd-no">-</td>`;

    // Group pieces by ambiente for separator headers
    const groupedPieces = [];
    let currentAmbiente = null;
    const sortedPieces = chapa.pecas.map((p, idx) => ({ ...p, _origIdx: idx }));

    // Build groups
    const ambienteGroups = new Map();
    for (const p of sortedPieces) {
        const piece = pecasMap[p.pecaId];
        const amb = piece?.ambiente || piece?.modulo_desc || 'Sem Ambiente';
        if (!ambienteGroups.has(amb)) ambienteGroups.set(amb, []);
        ambienteGroups.get(amb).push(p);
    }

    let tableRows = '';
    let globalNum = 0;
    for (const [amb, pieces] of ambienteGroups) {
        const firstPiece = pecasMap[pieces[0].pecaId];
        const clientLabel = pieces[0].loteNome || pieces[0].cliente || loteAtual?.cliente || '';

        // Ambiente separator header
        tableRows += `<tr class="amb-header">
            <td colspan="9" style="background:#f0ede8;padding:5px 8px;font-weight:700;font-size:10px;color:#1a1a1a;border-top:2px solid #8a7d6d;letter-spacing:0.3px">
                <span style="color:#5b7fa6">▸</span> ${amb}${clientLabel ? ` <span style="font-weight:400;color:#888;font-size:9px">— ${clientLabel}</span>` : ''}
            </td>
        </tr>`;

        for (let pi = 0; pi < pieces.length; pi++) {
            const p = pieces[pi];
            globalNum++;
            const piece = pecasMap[p.pecaId];
            const bg = pi % 2 === 0 ? '#fff' : '#f8f7f5';
            const esp = piece?.espessura || '-';
            const upmCode = piece?.upmcode || '';
            tableRows += `<tr style="background:${bg}">
                <td style="text-align:center;font-weight:700;color:#1a1a1a">${globalNum}</td>
                <td>${piece?.descricao || '#' + p.pecaId}${upmCode ? `<br><span style="font-size:7px;color:#999;font-family:monospace">${upmCode}</span>` : ''}</td>
                <td style="font-size:9px;color:#666">${piece?.modulo_desc || '-'}</td>
                <td style="text-align:right;font-family:monospace;font-size:10px">${Math.round(p.w)} x ${Math.round(p.h)} x ${esp}</td>
                <td style="text-align:center">${p.rotated ? '90°' : '-'}</td>
                ${bdCell(piece?.borda_frontal)}
                ${bdCell(piece?.borda_traseira)}
                ${bdCell(piece?.borda_dir)}
                ${bdCell(piece?.borda_esq)}
            </tr>`;
        }
    }

    const tableBlock = `<table class="ft">
        <thead><tr><th style="width:28px">#</th><th>Descricao</th><th>Modulo</th><th style="width:88px">C x L x E</th><th style="width:36px">Rot.</th><th class="bh">F</th><th class="bh">T</th><th class="bh">D</th><th class="bh">E</th></tr></thead>
        <tbody>${tableRows}</tbody>
    </table>`;

    // ─── Machining operations summary ───
    let opFuros = 0, opRasgos = 0, opRebaixos = 0, opOutros = 0;
    const toolSet = new Map();
    for (let pi = 0; pi < nPecas; pi++) {
        const p = chapa.pecas[pi];
        const piece = pecasMap[p.pecaId];
        if (!piece) continue;
        let mach = {};
        try { mach = JSON.parse(piece.machining_json || '{}'); } catch { /* skip */ }
        const workers = mach.workers ? (Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers)) : [];
        for (const w of workers) {
            const cat = (w.category || w.tipo || '').toLowerCase();
            if (cat.includes('furo') || cat.includes('drill') || cat.includes('hole')) opFuros++;
            else if (cat.includes('rasgo') || cat.includes('slot') || cat.includes('groove')) opRasgos++;
            else if (cat.includes('rebaixo') || cat.includes('pocket') || cat.includes('recess')) opRebaixos++;
            else opOutros++;
            const tk = w.tool_code || w.ferramenta || cat || 'geral';
            if (!toolSet.has(tk)) toolSet.set(tk, { code: tk, tipo: w.category || w.tipo || '-', diametro: w.diameter || w.diametro || 0, rpm: w.rpm || 0, count: 0 });
            toolSet.get(tk).count++;
        }
    }
    const totalOps = opFuros + opRasgos + opRebaixos + opOutros;
    const estTime = Math.round((nPecas * 3 + totalOps * 1) / 60 * 10) / 10;

    // Tool setup table
    let toolTableHtml = '';
    if (toolSet.size > 0) {
        let toolRows = '';
        let ti = 0;
        for (const [, t] of toolSet) {
            ti++;
            const bg = ti % 2 === 0 ? '#fff' : '#f8f7f5';
            toolRows += `<tr style="background:${bg}"><td style="text-align:center;font-weight:700">T${String(ti).padStart(2, '0')}</td><td>${t.tipo}</td><td style="text-align:center">${t.diametro || '-'}</td><td style="text-align:center">${t.rpm || '-'}</td><td style="text-align:center;font-weight:600">${t.count}</td></tr>`;
        }
        toolTableHtml = `<div style="margin-top:10px"><div style="font-size:10px;font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;color:#555">Ferramentas</div><table class="ft"><thead><tr><th style="width:40px">Pos.</th><th>Tipo</th><th style="width:50px">Diam.</th><th style="width:50px">RPM</th><th style="width:40px">Ops</th></tr></thead><tbody>${toolRows}</tbody></table></div>`;
    }

    // Operations summary
    let opSummaryHtml = '';
    if (totalOps > 0) {
        opSummaryHtml = `<div style="margin-top:8px;display:flex;gap:16px;font-size:10px;flex-wrap:wrap;padding:6px 8px;border:1px solid #e5e5e5;border-radius:4px;background:#fafaf8">
            <span style="font-weight:700;color:#555">USINAGENS:</span>
            ${opFuros > 0 ? `<span>Furos: <b>${opFuros}</b></span>` : ''}
            ${opRasgos > 0 ? `<span>Rasgos: <b>${opRasgos}</b></span>` : ''}
            ${opRebaixos > 0 ? `<span>Rebaixos: <b>${opRebaixos}</b></span>` : ''}
            ${opOutros > 0 ? `<span>Outros: <b>${opOutros}</b></span>` : ''}
            <span style="margin-left:auto;color:#555">Tempo est.: <b>${estTime} min</b></span>
        </div>`;
    }

    // ─── Header info ───
    const headerHtml = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #1a1a1a">
            <div>
                <h2 style="margin:0 0 2px;font-size:16px;color:#1a1a1a;letter-spacing:0.5px">FOLHA DE PRODUCAO CNC</h2>
                <div style="font-size:11px;color:#666">${loteAtual?.nome || 'Lote #' + (loteAtual?.id || '')}${loteAtual?.cliente ? ' | ' + loteAtual.cliente : ''}</div>
            </div>
            <div style="text-align:right;font-size:11px;color:#444">
                <div style="font-weight:700;font-size:13px">Chapa ${chapaIdx + 1} / ${totalCh}</div>
                <div>${chapa.material}</div>
                <div style="font-family:monospace">${chapa.comprimento} x ${chapa.largura} mm</div>
                <div style="font-size:9px;color:#888">${new Date().toLocaleDateString('pt-BR')}</div>
            </div>
        </div>
        <div style="display:flex;gap:16px;margin-bottom:10px;font-size:10px;flex-wrap:wrap">
            <span><b>Pecas:</b> ${nPecas}</span>
            <span><b>Aproveitamento:</b> ${(chapa.aproveitamento || 0).toFixed(1)}%</span>
            ${hasVeio ? `<span><b>Veio:</b> Com veio</span>` : ''}
            ${kerf ? `<span><b>Kerf:</b> ${kerf}mm</span>` : ''}
            ${ref > 0 ? `<span><b>Refilo:</b> ${ref}mm</span>` : ''}
            ${chapa.is_retalho ? '<span style="color:#0e7490;font-weight:700">RETALHO</span>' : ''}
        </div>`;

    // ─── Footer ───
    const footerHtml = `<div style="margin-top:12px;padding-top:6px;border-top:1px solid #ddd;font-size:8px;color:#999;display:flex;justify-content:space-between">
        <span>${chapa.material} | ${chapa.comprimento}x${chapa.largura}mm | Aprov. ${(chapa.aproveitamento || 0).toFixed(1)}%</span>
        <span>Ornato ERP</span>
        <span>${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>`;

    // ─── Borda legend ───
    const bordaLegend = `<div style="margin-top:4px;font-size:8px;color:#92400e;display:flex;gap:10px;align-items:center">
        <span style="display:inline-block;width:14px;height:2px;background:#d97706;vertical-align:middle;margin-right:2px"></span> Fita de borda
        <span style="color:#666;margin-left:4px">F=Frontal T=Traseira D=Direita E=Esquerda</span>
    </div>`;

    // ─── Build page layout ───
    const needsPageBreak = nPecas > 12;
    let bodyHtml = `
        ${headerHtml}
        <div style="text-align:center;margin-bottom:6px">${svgBlock}</div>
        ${bordaLegend}
        ${opSummaryHtml}
        ${needsPageBreak ? '<div style="page-break-before:always;padding-top:8px">' : '<div style="margin-top:8px">'}
            ${needsPageBreak ? `<div style="font-size:11px;font-weight:700;margin-bottom:6px;color:#1a1a1a">Lista de Pecas - Chapa ${chapaIdx + 1}: ${chapa.material}</div>` : ''}
            ${tableBlock}
        </div>
        ${toolTableHtml}
        ${footerHtml}`;

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Folha de Producao CNC - Chapa ${chapaIdx + 1}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, 'Inter', Arial, sans-serif; margin: 16px; color: #333; font-size: 11px; }
        @page { size: A4 portrait; margin: 10mm; }
        .ft { width: 100%; border-collapse: collapse; font-size: 10px; }
        .ft th, .ft td { border: 1px solid #ddd; padding: 3px 5px; text-align: left; }
        .ft th { background: #f0ede8; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: #555; }
        .ft tr:hover { background: #f5f3ef !important; }
        .bh { text-align: center; width: 52px; background: #fef3c7 !important; color: #92400e; }
        .bd-yes { text-align: center; font-size: 9px; color: #92400e; font-weight: 600; background: #fffbeb; }
        .bd-no { text-align: center; font-size: 9px; color: #d1d5db; }
        .amb-header td { page-break-after: avoid; }
        .no-print { margin-bottom: 12px; }
        @media print {
            .no-print { display: none; }
            body { margin: 8px; }
            svg { max-width: 170mm !important; }
            .ft { page-break-inside: auto; }
            .ft tr { page-break-inside: avoid; }
        }
    </style></head><body>
    <div class="no-print">
        <button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer;background:#1e40af;color:#fff;border:none;border-radius:4px;font-weight:600">Imprimir</button>
        <span style="margin-left:12px;font-size:11px;color:#888">Chapa ${chapaIdx + 1}/${totalCh} | ${nPecas} pecas | ${totalOps} usinagens | A4 Retrato</span>
    </div>
    ${bodyHtml}
    </body></html>`);
    win.document.close();
}

// ═══════════════════════════════════════════════════════
// ABA 3: PLANO DE CORTE (com painel de configuração)
// ═══════════════════════════════════════════════════════
