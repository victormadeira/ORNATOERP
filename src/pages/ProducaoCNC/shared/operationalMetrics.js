export function formatMinutes(value) {
    const n = Number(value || 0);
    if (!n) return '-';
    if (n < 60) return `${Math.round(n * 10) / 10} min`;
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    return `${h}h ${String(m).padStart(2, '0')}min`;
}

export function formatMeters(value) {
    const n = Number(value || 0);
    if (!n) return '-';
    return `${Math.round(n * 10) / 10} m`;
}

export function summarizePlanEconomics(plano) {
    const chapas = plano?.chapas || [];
    const totalChapas = chapas.length;
    const totalPecas = chapas.reduce((sum, ch) => sum + (ch.pecas?.length || 0), 0);
    const areaChapas = chapas.reduce((sum, ch) => sum + Number(ch.comprimento || ch.w || 0) * Number(ch.largura || ch.h || 0), 0);
    const areaPecas = chapas.reduce((sum, ch) => sum + (ch.pecas || []).reduce((acc, p) => acc + Number(p.w || 0) * Number(p.h || 0), 0), 0);
    const aproveitamento = areaChapas > 0 ? (areaPecas / areaChapas) * 100 : 0;
    const custoTotal = chapas.reduce((sum, ch) => sum + Number(ch.preco || ch.custo || 0), 0);
    const desperdicioM2 = Math.max(0, areaChapas - areaPecas) / 1e6;
    const retalhosUteis = chapas.reduce((sum, ch) => sum + (ch.retalhos || []).filter(r => Number(r.w || 0) >= 300 && Number(r.h || 0) >= 300).length, 0);
    const pecasPequenas = chapas.reduce((sum, ch) => sum + (ch.pecas || []).filter(p => Math.min(Number(p.w || 0), Number(p.h || 0)) < 180).length, 0);
    const score = Math.max(0, Math.min(100,
        Math.round(
            55
            + Math.min(35, aproveitamento * 0.35)
            + Math.min(7, retalhosUteis * 0.8)
            - Math.min(12, pecasPequenas * 0.25)
        )
    ));

    return {
        totalChapas,
        totalPecas,
        areaChapasM2: areaChapas / 1e6,
        areaPecasM2: areaPecas / 1e6,
        aproveitamento,
        custoTotal,
        desperdicioM2,
        retalhosUteis,
        pecasPequenas,
        score,
    };
}

function moveDistance(m) {
    return Math.hypot(Number(m.x2 || 0) - Number(m.x1 || 0), Number(m.y2 || 0) - Number(m.y1 || 0));
}

function normalizeAlert(alert) {
    const rawType = String(alert?.tipo || alert?.severity || '').toLowerCase();
    const msg = alert?.msg || alert?.message || String(alert || '');
    const severity = rawType.includes('erro') || rawType.includes('critico') || rawType.includes('critical')
        ? 'critical'
        : rawType.includes('aviso') || rawType.includes('warning')
            ? 'warning'
            : 'info';
    return { severity, msg, source: 'backend' };
}

export function analyzeGcodeOperational({ gcode, chapa, stats = {}, alertas = [], parsed }) {
    const issues = (alertas || []).map(normalizeAlert);
    const moves = parsed?.moves || [];
    const cutMoves = moves.filter(m => m.type !== 'G0' && !m.isZOnly);
    const rapidMoves = moves.filter(m => m.type === 'G0' && !m.isZOnly);
    const addIssue = (severity, msg, source = 'operacional') => issues.push({ severity, msg, source });

    if (!gcode) addIssue('critical', 'G-code não foi gerado.');
    if (!cutMoves.length) addIssue('critical', 'Nenhum movimento de corte foi detectado no arquivo.');

    const dims = chapa ? {
        w: Number(chapa.comprimento || chapa.w || 0),
        h: Number(chapa.largura || chapa.h || 0),
        refilo: Number(chapa.refilo || 0),
    } : null;

    if (moves.length && dims?.w && dims?.h) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of moves) {
            for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2]]) {
                if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
                minX = Math.min(minX, Number(x)); minY = Math.min(minY, Number(y));
                maxX = Math.max(maxX, Number(x)); maxY = Math.max(maxY, Number(y));
            }
        }
        const tol = 1.5;
        const fitsNormal = minX >= -tol && minY >= -tol && maxX <= dims.w + tol && maxY <= dims.h + tol;
        const fitsSwapped = minX >= -tol && minY >= -tol && maxX <= dims.h + tol && maxY <= dims.w + tol;
        if (!fitsNormal && !fitsSwapped) {
            addIssue('critical', `Trajetória fora dos limites da chapa: X ${minX.toFixed(1)}..${maxX.toFixed(1)}, Y ${minY.toFixed(1)}..${maxY.toFixed(1)}.`);
        }
        if (minX < -tol || minY < -tol) {
            addIssue('critical', `Movimento com coordenada negativa detectado: X min ${minX.toFixed(1)}, Y min ${minY.toFixed(1)}.`);
        }
        const effectiveMargin = Math.min(minX, minY, Math.min(dims.w - maxX, dims.h - maxY));
        if ((fitsNormal || fitsSwapped) && dims.refilo > 0 && effectiveMargin < dims.refilo * 0.35) {
            addIssue('warning', 'Trajetória muito próxima do refilo. Confira origem, fixação e área útil antes de enviar.');
        }
    }

    const contourIdx = moves.findIndex(m => /contorno/i.test(m.op || ''));
    const hasMachiningBeforeContour = moves.some((m, idx) => idx < contourIdx && m.type !== 'G0' && !/contorno/i.test(m.op || ''));
    const hasOtherMachining = moves.some(m => m.type !== 'G0' && !/contorno/i.test(m.op || ''));
    if (contourIdx >= 0 && hasOtherMachining && !hasMachiningBeforeContour) {
        addIssue('warning', 'Contorno aparece antes das demais usinagens. Prefira furos/rebaixos/rasgos antes de soltar a peça.');
    }

    const distRapid = Number(stats.dist_rapido_m || 0);
    const distCut = Number(stats.dist_corte_m || 0);
    const rapidRatio = distRapid + distCut > 0 ? distRapid / (distRapid + distCut) : 0;
    if (rapidRatio > 0.35) {
        addIssue('warning', `Deslocamento rápido alto (${Math.round(rapidRatio * 100)}% da rota). Vale reordenar operações/ferramentas.`);
    }
    if (Number(stats.trocas_ferramenta || 0) > 4) {
        addIssue('warning', `${stats.trocas_ferramenta} trocas de ferramenta. Agrupar operações pode reduzir tempo parado.`);
    }
    if (Number(stats.economia_rota_m || 0) > 0.5) {
        addIssue('info', `Rota otimizada economizou ${formatMeters(stats.economia_rota_m)} de deslocamento rápido.`);
    }

    const smallPieces = (chapa?.pecas || []).filter(p => Math.min(Number(p.w || 0), Number(p.h || 0)) < 180).length;
    if (smallPieces > 0) {
        addIssue('warning', `${smallPieces} peça(s) estreita(s)/pequena(s). Confira tabs, onion skin ou ordem de contorno.`);
    }

    const recommendations = [];
    if (Number(stats.economia_rota_pct || 0) > 0) recommendations.push(`Sequência atual reduziu ${stats.economia_rota_pct}% dos deslocamentos rápidos.`);
    if (rapidRatio > 0.25) recommendations.push('Rodar TSP/ordenação por proximidade antes de liberar a chapa.');
    if (smallPieces > 0) recommendations.push('Cortar peças pequenas no final e manter onion skin/tabs quando possível.');
    if (Number(stats.trocas_ferramenta || 0) > 2) recommendations.push('Agrupar por ferramenta quando não comprometer a fixação da peça.');
    if (!recommendations.length) recommendations.push('Plano sem sinais fortes de perda de tempo ou risco operacional.');

    const fallbackRapidMm = rapidMoves.reduce((sum, m) => sum + moveDistance(m), 0);
    const fallbackCutMm = cutMoves.reduce((sum, m) => sum + moveDistance(m), 0);
    const critical = issues.filter(i => i.severity === 'critical');
    const warning = issues.filter(i => i.severity === 'warning');
    const score = Math.max(0, Math.min(100, 100 - critical.length * 28 - warning.length * 7 - Math.max(0, rapidRatio - 0.22) * 35));

    return {
        score: Math.round(score),
        status: critical.length ? 'bloqueado' : warning.length ? 'atenção' : 'liberado',
        issues,
        critical,
        warning,
        info: issues.filter(i => i.severity === 'info'),
        recommendations,
        metrics: {
            cutMoves: cutMoves.length,
            rapidMoves: rapidMoves.length,
            rapidRatio,
            distRapidM: distRapid || Math.round(fallbackRapidMm / 100) / 10,
            distCutM: distCut || Math.round(fallbackCutMm / 100) / 10,
            estimatedMin: Number(stats.tempo_estimado_min || 0),
            routeSavedM: Number(stats.economia_rota_m || 0),
            routeSavedPct: Number(stats.economia_rota_pct || 0),
        },
    };
}
