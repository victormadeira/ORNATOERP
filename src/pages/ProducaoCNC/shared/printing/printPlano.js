// Extraído automaticamente de ProducaoCNC.jsx (linhas 2129-2305).

export function printPlano(plano, pecasMap, loteAtual, getModColor) {
    const modColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'];
    const isMulti = plano?.multi_lote && plano?.lotes_info?.length > 1;
    const getColor = (pecaId, pecaObj) => {
        if (isMulti && pecaObj?.cor) return pecaObj.cor;
        const piece = pecasMap[pecaId];
        if (!piece) return modColors[0];
        return modColors[(piece.modulo_id || 0) % modColors.length];
    };

    let chapasHtml = '';
    for (let ci = 0; ci < plano.chapas.length; ci++) {
        const ch = plano.chapas[ci];
        const maxPrintW = 700;
        const sc = Math.min(maxPrintW / ch.comprimento, 400 / ch.largura);
        const sw = ch.comprimento * sc;
        const sh = ch.largura * sc;
        const ref = ch.refilo || 0;

        let pecasSvg = '';
        for (let pi = 0; pi < ch.pecas.length; pi++) {
            const p = ch.pecas[pi];
            const px = (p.x + ref) * sc, py = (p.y + ref) * sc, pw = p.w * sc, ph = p.h * sc;
            const c = getColor(p.pecaId, p);
            const piece = pecasMap[p.pecaId];
            const hasBorda = piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira);
            pecasSvg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${c}20" stroke="${c}" stroke-width="1" rx="1"/>`;
            if (pw > 30 && ph > 14) pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2 - (pw > 40 && ph > 24 ? 4 : 0)}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(9, Math.min(pw / 8, ph / 3))}" fill="${c}" font-weight="600">${(piece?.descricao || `P${pi + 1}`).substring(0, Math.floor(pw / 5.5))}</text>`;
            if (pw > 40 && ph > 24) pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2 + 6}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(7, pw / 10)}" fill="${c}" opacity="0.7">${Math.round(p.w)} x ${Math.round(p.h)}</text>`;
            if (p.rotated && pw > 14 && ph > 14) pecasSvg += `<text x="${px + 6}" y="${py + 8}" font-size="6" fill="${c}" font-weight="700">R</text>`;
            if (hasBorda) {
                if (piece.borda_frontal) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px + pw}" y2="${py}" stroke="#ff6b35" stroke-width="2"/>`;
                if (piece.borda_traseira) pecasSvg += `<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="#ff6b35" stroke-width="2"/>`;
                if (piece.borda_esq) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py + ph}" stroke="#ff6b35" stroke-width="2"/>`;
                if (piece.borda_dir) pecasSvg += `<line x1="${px + pw}" y1="${py}" x2="${px + pw}" y2="${py + ph}" stroke="#ff6b35" stroke-width="2"/>`;
            }
            // Machining (usinagens) for print — clamped within piece bounds + clipPath
            if (piece?.machining_json && piece.machining_json !== '{}') {
                try {
                    const mach = JSON.parse(piece.machining_json);
                    if (mach.workers) {
                        const sX = pw / p.w, sY = ph / p.h;
                        const cX = v => Math.max(0, Math.min(v, pw));
                        const cY = v => Math.max(0, Math.min(v, ph));
                        const clipId = `pc${pi}`;
                        pecasSvg += `<defs><clipPath id="${clipId}"><rect x="${px}" y="${py}" width="${pw}" height="${ph}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
                        for (const [wk, w] of Object.entries(mach.workers)) {
                            if (w.position_x == null && !w.pos_start_for_line) continue;
                            let wx = 0, wy = 0;
                            if (w.position_x != null) {
                                if (p.rotated) { wx = cX(w.position_y * sX); wy = cY((p.w - w.position_x) * sY); }
                                else { wx = cX(w.position_x * sX); wy = cY(w.position_y * sY); }
                            }
                            if (w.category === 'Transfer_vertical_saw_cut' && w.pos_start_for_line) {
                                let sx2, sy2, ex2, ey2;
                                if (p.rotated) { sx2 = cX(w.pos_start_for_line.position_y * sX); sy2 = cY((p.w - w.pos_start_for_line.position_x) * sY); ex2 = cX(w.pos_end_for_line.position_y * sX); ey2 = cY((p.w - w.pos_end_for_line.position_x) * sY); }
                                else { sx2 = cX(w.pos_start_for_line.position_x * sX); sy2 = cY(w.pos_start_for_line.position_y * sY); ex2 = cX(w.pos_end_for_line.position_x * sX); ey2 = cY(w.pos_end_for_line.position_y * sY); }
                                pecasSvg += `<line x1="${px + sx2}" y1="${py + sy2}" x2="${px + ex2}" y2="${py + ey2}" stroke="#e11d48" stroke-width="${Math.max(0.8, (w.width_line || 3) * sY)}" opacity="0.45"/>`;
                            } else if (w.diameter && (w.quadrant === 'top' || w.quadrant === 'bottom')) {
                                const r2 = Math.max(1, (w.diameter / 2) * Math.min(sX, sY));
                                pecasSvg += `<circle cx="${px + wx}" cy="${py + wy}" r="${r2}" fill="${w.quadrant === 'top' ? '#e11d48' : '#7c3aed'}" opacity="0.5" stroke="${w.quadrant === 'top' ? '#be123c' : '#6d28d9'}" stroke-width="0.4"/>`;
                            }
                        }
                        pecasSvg += '</g>';
                    }
                } catch {}
            }
        }

        let retSvg = '';
        for (const r of (ch.retalhos || [])) {
            const rx = (r.x + ref) * sc, ry = (r.y + ref) * sc, rw = r.w * sc, rh = r.h * sc;
            const isAprov = Math.round(Math.max(r.w, r.h)) >= 200 && Math.round(Math.min(r.w, r.h)) >= 200;
            const sColor = isAprov ? '#22c55e' : '#9ca3af';
            retSvg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${sColor}15" stroke="${sColor}" stroke-width="${isAprov ? 1.5 : 0.8}" stroke-dasharray="${isAprov ? '6 3' : '2 2'}" opacity="${isAprov ? 0.8 : 0.5}"/>`;
            if (rw > 30 && rh > 12) {
                retSvg += `<text x="${rx + rw/2}" y="${ry + rh/2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(8, rw/8)}" fill="${sColor}" font-weight="700" stroke="#fff" stroke-width="2" paint-order="stroke">${Math.round(r.w)}x${Math.round(r.h)}</text>`;
            }
        }

        // Piece table — grouped by ambiente
        const ambGroupsPlano = new Map();
        for (let pi = 0; pi < ch.pecas.length; pi++) {
            const p = ch.pecas[pi];
            const piece = pecasMap[p.pecaId];
            const amb = piece?.ambiente || piece?.modulo_desc || 'Sem Ambiente';
            if (!ambGroupsPlano.has(amb)) ambGroupsPlano.set(amb, []);
            ambGroupsPlano.get(amb).push({ p, pi, piece });
        }

        let peçaRows = '';
        let gNum = 0;
        for (const [amb, items] of ambGroupsPlano) {
            const clientLabel = items[0].p.loteNome || items[0].p.cliente || loteAtual?.cliente || '';
            peçaRows += `<tr><td colspan="7" style="background:#f0f0f0;font-weight:700;font-size:10px;padding:4px 6px;border-top:2px solid #999;color:#333">▸ ${amb}${clientLabel ? ` <span style="font-weight:400;color:#888;font-size:9px">— ${clientLabel}</span>` : ''}</td></tr>`;
            for (const { p, piece } of items) {
                gNum++;
                const hasBorda = piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira);
                const bordas = [];
                if (piece?.borda_frontal) bordas.push(`F:${piece.borda_frontal}`);
                if (piece?.borda_traseira) bordas.push(`T:${piece.borda_traseira}`);
                if (piece?.borda_dir) bordas.push(`D:${piece.borda_dir}`);
                if (piece?.borda_esq) bordas.push(`E:${piece.borda_esq}`);
                const upmCode = piece?.upmcode || '';
                peçaRows += `<tr><td>${gNum}</td><td>${piece?.descricao || '#' + p.pecaId}${upmCode ? `<br><span style="font-size:8px;color:#999;font-family:monospace">${upmCode}</span>` : ''}</td><td style="font-size:9px">${piece?.modulo_desc || '-'}</td><td style="text-align:right;font-family:monospace">${Math.round(p.w)} x ${Math.round(p.h)}${piece?.espessura ? ' x ' + piece.espessura : ''}</td><td style="text-align:center">${p.rotated ? '90°' : '-'}</td><td style="text-align:center;font-size:9px;color:#92400e">${bordas.length > 0 ? bordas.join(' ') : '-'}</td></tr>`;
            }
        }

        chapasHtml += `
            <div class="page-break">
                <h3>Chapa ${ci + 1}: ${ch.material} <span style="font-weight:400;color:#888">(${ch.comprimento} x ${ch.largura} mm)</span></h3>
                <div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px">
                    <span><b>Aproveitamento:</b> ${ch.aproveitamento.toFixed(1)}%</span>
                    <span><b>Peças:</b> ${ch.pecas.length}</span>
                    <span><b>Retalhos:</b> ${(ch.retalhos?.length || 0)}</span>
                    ${ch.veio && ch.veio !== 'sem_veio' ? `<span style="color:#8b5cf6"><b>Veio:</b> ━ Com veio</span>` : ''}
                    ${ch.preco > 0 ? `<span><b>Preço:</b> R$${ch.preco.toFixed(2)}</span>` : ''}
                </div>
                <svg width="${sw + 4}" height="${sh + 4}" viewBox="-2 -2 ${sw + 4} ${sh + 4}" style="border:1px solid #ddd;border-radius:4px;background:#fafafa">
                    <rect x="0" y="0" width="${sw}" height="${sh}" fill="#fff" stroke="#ccc" stroke-width="1"/>
                    ${ref > 0 ? `<rect x="${ref * sc}" y="${ref * sc}" width="${sw - 2 * ref * sc}" height="${sh - 2 * ref * sc}" fill="none" stroke="#ccc" stroke-width="0.5" stroke-dasharray="3 2"/>` : ''}
                    ${pecasSvg}${retSvg}
                </svg>
                <table class="pt"><thead><tr><th>#</th><th>Peça</th><th>Módulo</th><th>C x L x E (mm)</th><th>Rot.</th><th>Bordas</th></tr></thead><tbody>${peçaRows}</tbody></table>
                ${ch.cortes?.length ? `<div style="margin-top:6px;font-size:10px;color:#666"><b>Sequência de Cortes:</b> ${ch.cortes.map(c => `${c.seq}. ${c.dir === 'Horizontal' ? '━' : '┃'} ${c.pos}mm`).join(' · ')}</div>` : ''}
            </div>`;
    }

    // Cost summary
    const byMat = {};
    for (const ch of plano.chapas) {
        const key = ch.material_code || ch.material;
        if (!byMat[key]) byMat[key] = { nome: ch.material, count: 0, preco: ch.preco || 0 };
        byMat[key].count++;
    }
    const mats = Object.values(byMat);
    const totalCost = mats.reduce((s, m) => s + m.count * m.preco, 0);
    let costHtml = '';
    if (totalCost > 0) {
        costHtml = `<div class="page-break"><h3>Resumo de Custos</h3><table class="pt"><thead><tr><th>Material</th><th>Qtd</th><th>Preço/Un</th><th>Subtotal</th></tr></thead><tbody>`;
        for (const m of mats) {
            costHtml += `<tr><td>${m.nome}</td><td style="text-align:center">${m.count}</td><td style="text-align:right">R$${m.preco.toFixed(2)}</td><td style="text-align:right;font-weight:600">R$${(m.count * m.preco).toFixed(2)}</td></tr>`;
        }
        costHtml += `<tr style="border-top:2px solid #333"><td colspan="3" style="font-weight:700">TOTAL</td><td style="text-align:right;font-weight:700;font-size:14px">R$ ${totalCost.toFixed(2)}</td></tr></tbody></table></div>`;
    }

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Plano de Corte — ${loteAtual.nome || 'Lote #' + loteAtual.id}</title>
    <style>
        body { font-family: -apple-system, Arial, sans-serif; margin: 20px; color: #333; font-size: 12px; }
        h2 { margin-bottom: 4px; } h3 { margin: 16px 0 6px; font-size: 14px; }
        .summary { display: flex; gap: 16px; margin-bottom: 16px; font-size: 13px; }
        .summary b { color: #e67e22; }
        .page-break { page-break-inside: avoid; margin-bottom: 20px; }
        .pt { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 8px; }
        .pt th, .pt td { border: 1px solid #ddd; padding: 3px 6px; text-align: left; }
        .pt th { background: #f5f5f5; font-weight: 600; }
        .pt tr:nth-child(even) { background: #fafafa; }
        @media print { body { margin: 10px; } .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e67e22;color:#fff;border:none;border-radius:6px">Imprimir</button></div>
    <h2>Plano de Corte — ${loteAtual.nome || 'Lote #' + loteAtual.id}</h2>
    <div class="summary">
        <span><b>${plano.chapas.length}</b> chapas</span>
        <span><b>${plano.chapas.reduce((s, c) => s + c.pecas.length, 0)}</b> peças</span>
        <span>Aproveitamento: <b>${(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / plano.chapas.length).toFixed(1)}%</b></span>
        ${totalCost > 0 ? `<span>Custo: <b>R$ ${totalCost.toFixed(2)}</b></span>` : ''}
    </div>
    ${chapasHtml}${costHtml}
    <div style="margin-top:20px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:6px">
        Gerado por Ornato ERP · ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
    </div>
    </body></html>`);
    win.document.close();
}

// ─── Folha de Produção CNC (per-chapa print — enhanced operator report) ────────────────
