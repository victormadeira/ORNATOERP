/**
 * DXF Import Parser for CNC pieces.
 *
 * Reads a DXF file (Promob, AutoCAD, etc.) and extracts rectangular pieces
 * with dimensions, optional machining circles (holes), and layer-based
 * material/edge detection.
 *
 * Strategy:
 * 1. Extract all closed rectangles (LWPOLYLINE with 4 vertices or LINE-based)
 * 2. Group by layer name for material classification
 * 3. Extract circles as drilling operations (holes)
 * 4. Match circles to their containing rectangle
 */

import DxfParser from 'dxf-parser';

/**
 * Parse DXF content and return pieces + machining.
 * @param {string} dxfContent - Raw DXF file text
 * @param {object} opts - Options
 * @param {number} opts.defaultThickness - Default piece thickness (mm)
 * @param {string} opts.defaultMaterial - Default material code
 * @returns {{ pieces: Array, warnings: string[] }}
 */
export function parseDxf(dxfContent, opts = {}) {
    const { defaultThickness = 18, defaultMaterial = '' } = opts;

    const parser = new DxfParser();
    let dxf;
    try {
        dxf = parser.parseSync(dxfContent);
    } catch (err) {
        throw new Error(`Erro ao parsear DXF: ${err.message}`);
    }

    if (!dxf || !dxf.entities || dxf.entities.length === 0) {
        throw new Error('DXF vazio ou sem entidades');
    }

    const warnings = [];
    const rectangles = [];
    const circles = [];
    const lines = [];

    // Collect entities
    for (const entity of dxf.entities) {
        const layer = entity.layer || '0';

        if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            const verts = entity.vertices || [];
            if (verts.length >= 4 && entity.shape) {
                // Closed polyline — check if rectangular
                const rect = extractRectFromVertices(verts);
                if (rect) {
                    rectangles.push({ ...rect, layer });
                }
            } else if (verts.length >= 4) {
                const rect = extractRectFromVertices(verts);
                if (rect) {
                    rectangles.push({ ...rect, layer });
                }
            }
        } else if (entity.type === 'LINE') {
            lines.push({
                x1: entity.vertices?.[0]?.x || entity.start?.x || 0,
                y1: entity.vertices?.[0]?.y || entity.start?.y || 0,
                x2: entity.vertices?.[1]?.x || entity.end?.x || 0,
                y2: entity.vertices?.[1]?.y || entity.end?.y || 0,
                layer,
            });
        } else if (entity.type === 'CIRCLE') {
            circles.push({
                cx: entity.center?.x || 0,
                cy: entity.center?.y || 0,
                r: entity.radius || 0,
                layer,
            });
        } else if (entity.type === 'ARC') {
            // Arcs can be part of contours — skip for now, warn
            // (could be pocketed pieces)
        } else if (entity.type === 'INSERT') {
            // Block reference — may contain pieces
            if (dxf.blocks && dxf.blocks[entity.name]) {
                const block = dxf.blocks[entity.name];
                const bx = entity.position?.x || 0;
                const by = entity.position?.y || 0;
                for (const be of (block.entities || [])) {
                    if (be.type === 'LWPOLYLINE' || be.type === 'POLYLINE') {
                        const verts = (be.vertices || []).map(v => ({ x: v.x + bx, y: v.y + by }));
                        const rect = extractRectFromVertices(verts);
                        if (rect) rectangles.push({ ...rect, layer: be.layer || layer });
                    } else if (be.type === 'CIRCLE') {
                        circles.push({
                            cx: (be.center?.x || 0) + bx,
                            cy: (be.center?.y || 0) + by,
                            r: be.radius || 0,
                            layer: be.layer || layer,
                        });
                    }
                }
            }
        }
    }

    // Try to form rectangles from LINE entities (4 lines forming a closed rect)
    if (rectangles.length === 0 && lines.length >= 4) {
        const lineRects = extractRectsFromLines(lines);
        rectangles.push(...lineRects);
    }

    if (rectangles.length === 0) {
        warnings.push('Nenhuma peça retangular encontrada no DXF');
        return { pieces: [], warnings };
    }

    // Filter out very large rects (likely sheet outlines)
    const MAX_DIM = 3200; // Max single piece dimension (mm)
    const validRects = rectangles.filter(r => r.w <= MAX_DIM && r.h <= MAX_DIM);
    if (validRects.length < rectangles.length) {
        warnings.push(`${rectangles.length - validRects.length} retângulo(s) ignorado(s) por serem muito grandes (chapas)`);
    }

    // Deduplicate similar rects (same pos/size)
    const deduped = deduplicateRects(validRects);

    // Match circles to rectangles (holes inside piece bounds)
    const pieces = deduped.map((rect, idx) => {
        const holes = circles.filter(c =>
            c.cx >= rect.x - 1 && c.cx <= rect.x + rect.w + 1 &&
            c.cy >= rect.y - 1 && c.cy <= rect.y + rect.h + 1
        );

        const workers = holes.map(h => ({
            category: 'transfer_hole',
            face: 'top',
            x: Math.round((h.cx - rect.x) * 10) / 10,
            y: Math.round((h.cy - rect.y) * 10) / 10,
            depth: defaultThickness,
            diameter: Math.round(h.r * 2 * 10) / 10,
            tool_code: '',
        }));

        // Infer material from layer name
        const materialFromLayer = inferMaterialFromLayer(rect.layer);

        return {
            persistent_id: `DXF_${idx + 1}_${Date.now()}`,
            descricao: `Peça DXF ${idx + 1}`,
            modulo_desc: rect.layer !== '0' ? rect.layer : '',
            material: materialFromLayer || defaultMaterial,
            material_code: materialFromLayer || defaultMaterial,
            espessura: defaultThickness,
            comprimento: Math.round(Math.max(rect.w, rect.h) * 10) / 10,
            largura: Math.round(Math.min(rect.w, rect.h) * 10) / 10,
            quantidade: 1,
            borda_dir: '', borda_esq: '', borda_frontal: '', borda_traseira: '',
            acabamento: '',
            machining_json: workers.length > 0 ? JSON.stringify({ workers }) : null,
            observacao: `Importado de DXF (layer: ${rect.layer})`,
        };
    });

    return { pieces, warnings };
}

function extractRectFromVertices(verts) {
    if (verts.length < 4) return null;
    const xs = verts.map(v => v.x);
    const ys = verts.map(v => v.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX;
    const h = maxY - minY;

    if (w < 10 || h < 10) return null; // Too small

    // Check if actually rectangular (all vertices on bounding box edges)
    const tolerance = Math.max(w, h) * 0.02;
    const isRect = verts.every(v =>
        (Math.abs(v.x - minX) < tolerance || Math.abs(v.x - maxX) < tolerance) &&
        (Math.abs(v.y - minY) < tolerance || Math.abs(v.y - maxY) < tolerance)
    );

    if (!isRect && verts.length === 4) {
        // Could still be a rectangle rotated — check if opposing sides are equal
        return null; // Skip non-axis-aligned for now
    }

    return { x: minX, y: minY, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10, layer: '' };
}

function extractRectsFromLines(lines) {
    // Group horizontal and vertical lines, try to match rectangles
    const rects = [];
    const horiz = lines.filter(l => Math.abs(l.y1 - l.y2) < 0.5);
    const vert = lines.filter(l => Math.abs(l.x1 - l.x2) < 0.5);

    for (const h1 of horiz) {
        const minX = Math.min(h1.x1, h1.x2);
        const maxX = Math.max(h1.x1, h1.x2);
        const y1 = h1.y1;

        // Find parallel horizontal line
        for (const h2 of horiz) {
            if (h2 === h1) continue;
            const y2 = h2.y1;
            if (Math.abs(y2 - y1) < 10) continue;
            const h2minX = Math.min(h2.x1, h2.x2);
            const h2maxX = Math.max(h2.x1, h2.x2);
            if (Math.abs(h2minX - minX) > 1 || Math.abs(h2maxX - maxX) > 1) continue;

            // Found a rectangle candidate
            const w = maxX - minX;
            const h = Math.abs(y2 - y1);
            if (w > 10 && h > 10) {
                rects.push({ x: minX, y: Math.min(y1, y2), w, h, layer: h1.layer });
            }
        }
    }

    return deduplicateRects(rects);
}

function deduplicateRects(rects) {
    const result = [];
    for (const r of rects) {
        const dup = result.find(e =>
            Math.abs(e.x - r.x) < 1 && Math.abs(e.y - r.y) < 1 &&
            Math.abs(e.w - r.w) < 1 && Math.abs(e.h - r.h) < 1
        );
        if (!dup) result.push(r);
    }
    return result;
}

function inferMaterialFromLayer(layer) {
    if (!layer) return '';
    const l = layer.toLowerCase();
    if (/mdf/i.test(l)) {
        const thMatch = l.match(/(\d+\.?\d*)\s*mm/);
        const th = thMatch ? thMatch[1] : '18';
        if (/branc/i.test(l)) return `MDF_${th}_BRANCO`;
        if (/preto|black/i.test(l)) return `MDF_${th}_PRETO`;
        return `MDF_${th}`;
    }
    if (/mdp/i.test(l)) return 'MDP_15';
    if (/comp|compensado/i.test(l)) return 'COMPENSADO_18';
    return '';
}
