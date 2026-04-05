import { Router } from 'express';
import { requireAuth } from '../auth.js';
import crypto from 'crypto';

const router = Router();

// ═══════════════════════════════════════════════════════
// KERF CALCULATOR — física do material
// ═══════════════════════════════════════════════════════
const RAIO_MIN_PADRAO = { 6: 80, 9: 150, 12: 220, 15: 280, 18: 350, 25: 500 };

function calcularKerf(espessura, raioDesejado, raioMinMap) {
    const map = typeof raioMinMap === 'string' ? JSON.parse(raioMinMap || '{}') : (raioMinMap || {});
    const espKey = Math.round(espessura);
    const raioMin = map[espKey] || RAIO_MIN_PADRAO[espKey] || espessura * 19.4;

    if (raioDesejado < raioMin) {
        return {
            viavel: false, raio_minimo_mm: raioMin,
            erro: `Raio ${raioDesejado}mm abaixo do mínimo ${raioMin}mm para ${espessura}mm`
        };
    }
    const profundidade = Math.round(espessura * 0.85 * 10) / 10;
    const razao = raioDesejado / espessura;
    let espacamento = Math.round((espessura / (razao - 0.5)) * 100) / 100;
    espacamento = Math.max(espacamento, 4.5);
    const numCortes = Math.floor(1000 / espacamento);

    return {
        viavel: true, raio_minimo_mm: raioMin, raio_atingivel_mm: raioDesejado,
        espacamento_cortes_mm: espacamento, profundidade_corte_mm: profundidade,
        numero_cortes_estimado: numCortes, lado_kerf: 'interno'
    };
}

// ═══════════════════════════════════════════════════════
// FABRICABILIDADE — análise contra CNC
// ═══════════════════════════════════════════════════════
const CNC_DEFAULTS = { area_x: 2800, area_y: 1300, esp_max: 60 };

function analisarFabricabilidade(peca, material) {
    const problemas = [];
    const avisos = [];

    // Parse geometry
    let geo = {};
    try { geo = typeof peca.geometria_silhueta === 'string' ? JSON.parse(peca.geometria_silhueta) : peca.geometria_silhueta; } catch {}
    const bbx = peca.bounding_box_x || geo.width_mm || 0;
    const bby = peca.bounding_box_y || geo.height_mm || 0;
    const esp = peca.espessura || 18;
    const processo = peca.processo_fabricacao || 'corte_2d';
    const matTipo = material?.tipo || 'mdf';

    // Check CNC area
    if (bbx > CNC_DEFAULTS.area_x)
        problemas.push({ tipo: 'dimensao', severidade: 'erro', descricao: `Largura ${bbx}mm excede área CNC (${CNC_DEFAULTS.area_x}mm)` });
    if (bby > CNC_DEFAULTS.area_y)
        problemas.push({ tipo: 'dimensao', severidade: 'erro', descricao: `Altura ${bby}mm excede área CNC (${CNC_DEFAULTS.area_y}mm)` });
    if (esp > CNC_DEFAULTS.esp_max)
        problemas.push({ tipo: 'espessura', severidade: 'erro', descricao: `Espessura ${esp}mm excede máximo CNC (${CNC_DEFAULTS.esp_max}mm)` });

    // Material constraints
    if (matTipo === 'vidro' || matTipo === 'espelho') {
        let furos = [];
        try { furos = typeof peca.furos === 'string' ? JSON.parse(peca.furos) : (peca.furos || []); } catch {}
        if (furos.length > 0)
            problemas.push({ tipo: 'material', severidade: 'erro', descricao: 'Vidro/espelho não permite furos no CNC' });
        if (processo === 'kerf_bending')
            problemas.push({ tipo: 'processo', severidade: 'erro', descricao: 'Vidro/espelho não permite kerf bending' });
    }

    if (matTipo === 'madeira_macica') {
        if (processo === 'kerf_bending')
            problemas.push({ tipo: 'processo', severidade: 'erro', descricao: 'Madeira maciça não permite kerf bending' });
        if (processo === 'laminacao_vacuo')
            problemas.push({ tipo: 'processo', severidade: 'erro', descricao: 'Madeira maciça não permite laminação a vácuo' });
    }

    // Kerf bending validation
    if (processo === 'kerf_bending' && material) {
        if (!material.permite_kerf)
            problemas.push({ tipo: 'material', severidade: 'erro', descricao: `Material "${material.nome}" não permite kerf bending` });
    }

    // Warnings
    if (bbx > 2400 || bby > 1100)
        avisos.push({ tipo: 'dimensao', descricao: 'Peça grande — verificar aproveitamento da chapa' });
    if (esp < 6)
        avisos.push({ tipo: 'espessura', descricao: 'Espessura muito fina — risco de quebra no transporte' });
    if (processo === 'kerf_bending' && esp > 18)
        avisos.push({ tipo: 'processo', descricao: 'Kerf bending em espessura > 18mm pode ter resultado irregular' });

    const valido = problemas.length === 0;
    const score = valido ? (avisos.length === 0 ? 1.0 : 0.7) : 0;

    return { valido, score, problemas, avisos };
}

// ═══════════════════════════════════════════════════════
// GEOMETRIA — cálculos de área/bbox/perímetro
// ═══════════════════════════════════════════════════════
function calcularGeometria(geoStr) {
    let geo = {};
    try { geo = typeof geoStr === 'string' ? JSON.parse(geoStr) : geoStr; } catch {}
    const commands = geo.commands || [];
    if (!commands.length) return { area: 0, perimetro: 0, bbox_x: geo.width_mm || 0, bbox_y: geo.height_mm || 0 };

    // Convert bezier commands to points
    const pts = [];
    let cx = 0, cy = 0, startX = 0, startY = 0;
    for (const cmd of commands) {
        const c = (cmd.cmd || cmd.type || '').toUpperCase();
        if (c === 'M') { cx = cmd.x || 0; cy = cmd.y || 0; startX = cx; startY = cy; pts.push([cx, cy]); }
        else if (c === 'L') { cx = cmd.x || 0; cy = cmd.y || 0; pts.push([cx, cy]); }
        else if (c === 'C') {
            // Cubic bezier: sample 20 points
            const x0 = cx, y0 = cy;
            for (let t = 0.05; t <= 1; t += 0.05) {
                const mt = 1 - t;
                const x = mt * mt * mt * x0 + 3 * mt * mt * t * (cmd.x1 || 0) + 3 * mt * t * t * (cmd.x2 || 0) + t * t * t * (cmd.x || 0);
                const y = mt * mt * mt * y0 + 3 * mt * mt * t * (cmd.y1 || 0) + 3 * mt * t * t * (cmd.y2 || 0) + t * t * t * (cmd.y || 0);
                pts.push([x, y]);
            }
            cx = cmd.x || 0; cy = cmd.y || 0;
        }
        else if (c === 'Q') {
            const x0 = cx, y0 = cy;
            for (let t = 0.05; t <= 1; t += 0.05) {
                const mt = 1 - t;
                const x = mt * mt * x0 + 2 * mt * t * (cmd.x1 || 0) + t * t * (cmd.x || 0);
                const y = mt * mt * y0 + 2 * mt * t * (cmd.y1 || 0) + t * t * (cmd.y || 0);
                pts.push([x, y]);
            }
            cx = cmd.x || 0; cy = cmd.y || 0;
        }
        else if (c === 'Z') { if (pts.length > 0) pts.push([startX, startY]); cx = startX; cy = startY; }
    }

    if (pts.length < 3) return { area: 0, perimetro: 0, bbox_x: geo.width_mm || 0, bbox_y: geo.height_mm || 0 };

    // Shoelace area
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    area = Math.abs(area) / 2;

    // Perimeter
    let perim = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
        perim += Math.sqrt(dx * dx + dy * dy);
    }

    // Bounding box
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const bbox_x = Math.max(...xs) - Math.min(...xs);
    const bbox_y = Math.max(...ys) - Math.min(...ys);

    return { area: Math.round(area * 100) / 100, perimetro: Math.round(perim * 100) / 100, bbox_x: Math.round(bbox_x * 100) / 100, bbox_y: Math.round(bbox_y * 100) / 100 };
}

// ═══════════════════════════════════════════════════════
// MATERIAIS
// ═══════════════════════════════════════════════════════
router.get('/materiais', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const rows = db.prepare('SELECT * FROM materiais_modelagem WHERE ativo = 1 ORDER BY nome').all();
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// PROJETOS CRUD
// ═══════════════════════════════════════════════════════
router.get('/projetos', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const { status, q, page, per_page } = req.query;
    let sql = `SELECT pm.*, c.nome as cliente_nome,
               (SELECT COUNT(*) FROM pecas_modelagem WHERE projeto_id = pm.id) as num_pecas
               FROM projetos_modelagem pm
               LEFT JOIN clientes c ON c.id = pm.cliente_id
               WHERE pm.status != 'cancelado'`;
    const params = [];

    if (status) { sql += ' AND pm.status = ?'; params.push(status); }
    if (q) { sql += ' AND (pm.nome LIKE ? OR pm.codigo LIKE ? OR c.nome LIKE ?)'; const like = `%${q}%`; params.push(like, like, like); }
    sql += ' ORDER BY pm.atualizado_em DESC';

    if (page) {
        const p = Math.max(1, parseInt(page));
        const pp = Math.min(200, Math.max(1, parseInt(per_page) || 50));
        const countSql = sql.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM');
        const total = db.prepare(countSql).get(...params)?.total || 0;
        sql += ` LIMIT ? OFFSET ?`;
        params.push(pp, (p - 1) * pp);
        return res.json({ data: db.prepare(sql).all(...params), total, page: p, per_page: pp, total_pages: Math.ceil(total / pp) });
    }
    res.json(db.prepare(sql).all(...params));
});

router.post('/projetos', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const { nome, descricao, cliente_id, orcamento_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const ano = new Date().getFullYear();
    const last = db.prepare("SELECT codigo FROM projetos_modelagem WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1").get(`MOD-${ano}-%`);
    let seq = 1;
    if (last?.codigo) {
        const parts = last.codigo.split('-');
        seq = parseInt(parts[2] || '0') + 1;
    }
    const codigo = `MOD-${ano}-${String(seq).padStart(4, '0')}`;
    const token = crypto.randomUUID();

    const result = db.prepare(`INSERT INTO projetos_modelagem (user_id, nome, descricao, cliente_id, orcamento_id, codigo, link_token) VALUES (?,?,?,?,?,?,?)`).run(
        req.user.id, nome, descricao || '', cliente_id || null, orcamento_id || null, codigo, token
    );
    const proj = db.prepare('SELECT * FROM projetos_modelagem WHERE id = ?').get(result.lastInsertRowid);
    res.json(proj);
});

router.get('/projetos/:id', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const proj = db.prepare(`SELECT pm.*, c.nome as cliente_nome FROM projetos_modelagem pm LEFT JOIN clientes c ON c.id = pm.cliente_id WHERE pm.id = ?`).get(req.params.id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
    const pecas = db.prepare(`SELECT p.*, m.nome as material_nome, m.cor_hex as material_cor FROM pecas_modelagem p LEFT JOIN materiais_modelagem m ON m.id = p.material_id WHERE p.projeto_id = ? ORDER BY p.id`).all(req.params.id);
    res.json({ ...proj, pecas });
});

router.put('/projetos/:id', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const { nome, descricao, status } = req.body;
    const sets = [];
    const params = [];
    if (nome !== undefined) { sets.push('nome = ?'); params.push(nome); }
    if (descricao !== undefined) { sets.push('descricao = ?'); params.push(descricao); }
    if (status) { sets.push('status = ?'); params.push(status); }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push('atualizado_em = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    db.prepare(`UPDATE projetos_modelagem SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    const proj = db.prepare('SELECT * FROM projetos_modelagem WHERE id = ?').get(req.params.id);
    res.json(proj);
});

router.delete('/projetos/:id', requireAuth, (req, res) => {
    const db = req.app.get('db');
    db.prepare("UPDATE projetos_modelagem SET status = 'cancelado', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PEÇAS CRUD
// ═══════════════════════════════════════════════════════
router.post('/projetos/:pid/pecas', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const pid = req.params.pid;
    const { nome, material_id, espessura, geometria_silhueta, processo_fabricacao, furos, canaletas, bordas, notas_operador } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const geoStr = typeof geometria_silhueta === 'string' ? geometria_silhueta : JSON.stringify(geometria_silhueta || {});
    const geom = calcularGeometria(geoStr);
    const material = material_id ? db.prepare('SELECT * FROM materiais_modelagem WHERE id = ?').get(material_id) : null;

    const pecaData = {
        projeto_id: pid, nome, material_id: material_id || null, espessura: espessura || 18,
        geometria_silhueta: geoStr, bounding_box_x: geom.bbox_x, bounding_box_y: geom.bbox_y,
        area_real: geom.area, perimetro: geom.perimetro,
        processo_fabricacao: processo_fabricacao || 'corte_2d',
        furos: JSON.stringify(furos || []), canaletas: JSON.stringify(canaletas || []),
        bordas: JSON.stringify(bordas || {}), notas_operador: notas_operador || '',
    };

    const fab = analisarFabricabilidade(pecaData, material);
    pecaData.fabricabilidade = JSON.stringify(fab);

    const result = db.prepare(`INSERT INTO pecas_modelagem (projeto_id, nome, material_id, espessura, geometria_silhueta, bounding_box_x, bounding_box_y, area_real, perimetro, processo_fabricacao, furos, canaletas, bordas, fabricabilidade, notas_operador) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        pecaData.projeto_id, pecaData.nome, pecaData.material_id, pecaData.espessura, pecaData.geometria_silhueta,
        pecaData.bounding_box_x, pecaData.bounding_box_y, pecaData.area_real, pecaData.perimetro,
        pecaData.processo_fabricacao, pecaData.furos, pecaData.canaletas, pecaData.bordas, pecaData.fabricabilidade, pecaData.notas_operador
    );

    db.prepare('UPDATE projetos_modelagem SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(pid);
    const peca = db.prepare('SELECT p.*, m.nome as material_nome, m.cor_hex as material_cor FROM pecas_modelagem p LEFT JOIN materiais_modelagem m ON m.id = p.material_id WHERE p.id = ?').get(result.lastInsertRowid);
    res.json(peca);
});

router.get('/pecas/:id', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const peca = db.prepare('SELECT p.*, m.nome as material_nome, m.cor_hex as material_cor, m.tipo as material_tipo FROM pecas_modelagem p LEFT JOIN materiais_modelagem m ON m.id = p.material_id WHERE p.id = ?').get(req.params.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    res.json(peca);
});

router.put('/pecas/:id', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const peca = db.prepare('SELECT * FROM pecas_modelagem WHERE id = ?').get(req.params.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });

    const { nome, material_id, espessura, geometria_silhueta, processo_fabricacao, furos, canaletas, bordas, notas_operador, parametros_processo } = req.body;
    const sets = ['atualizado_em = CURRENT_TIMESTAMP'];
    const params = [];

    if (nome !== undefined) { sets.push('nome = ?'); params.push(nome); }
    if (material_id !== undefined) { sets.push('material_id = ?'); params.push(material_id); }
    if (espessura !== undefined) { sets.push('espessura = ?'); params.push(espessura); }
    if (processo_fabricacao !== undefined) { sets.push('processo_fabricacao = ?'); params.push(processo_fabricacao); }
    if (notas_operador !== undefined) { sets.push('notas_operador = ?'); params.push(notas_operador); }
    if (parametros_processo !== undefined) { sets.push('parametros_processo = ?'); params.push(typeof parametros_processo === 'string' ? parametros_processo : JSON.stringify(parametros_processo)); }
    if (furos !== undefined) { sets.push('furos = ?'); params.push(typeof furos === 'string' ? furos : JSON.stringify(furos)); }
    if (canaletas !== undefined) { sets.push('canaletas = ?'); params.push(typeof canaletas === 'string' ? canaletas : JSON.stringify(canaletas)); }
    if (bordas !== undefined) { sets.push('bordas = ?'); params.push(typeof bordas === 'string' ? bordas : JSON.stringify(bordas)); }

    if (geometria_silhueta !== undefined) {
        const geoStr = typeof geometria_silhueta === 'string' ? geometria_silhueta : JSON.stringify(geometria_silhueta);
        sets.push('geometria_silhueta = ?'); params.push(geoStr);
        const geom = calcularGeometria(geoStr);
        sets.push('bounding_box_x = ?', 'bounding_box_y = ?', 'area_real = ?', 'perimetro = ?');
        params.push(geom.bbox_x, geom.bbox_y, geom.area, geom.perimetro);
    }

    params.push(req.params.id);
    db.prepare(`UPDATE pecas_modelagem SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    // Recalculate fabricabilidade
    const updated = db.prepare('SELECT * FROM pecas_modelagem WHERE id = ?').get(req.params.id);
    const mat = updated.material_id ? db.prepare('SELECT * FROM materiais_modelagem WHERE id = ?').get(updated.material_id) : null;
    const fab = analisarFabricabilidade(updated, mat);
    db.prepare('UPDATE pecas_modelagem SET fabricabilidade = ? WHERE id = ?').run(JSON.stringify(fab), req.params.id);

    db.prepare('UPDATE projetos_modelagem SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(peca.projeto_id);
    const result = db.prepare('SELECT p.*, m.nome as material_nome, m.cor_hex as material_cor FROM pecas_modelagem p LEFT JOIN materiais_modelagem m ON m.id = p.material_id WHERE p.id = ?').get(req.params.id);
    res.json(result);
});

router.delete('/pecas/:id', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const peca = db.prepare('SELECT projeto_id FROM pecas_modelagem WHERE id = ?').get(req.params.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    db.prepare('DELETE FROM pecas_modelagem WHERE id = ?').run(req.params.id);
    db.prepare('UPDATE projetos_modelagem SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(peca.projeto_id);
    res.json({ ok: true });
});

router.post('/pecas/:id/duplicar', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const orig = db.prepare('SELECT * FROM pecas_modelagem WHERE id = ?').get(req.params.id);
    if (!orig) return res.status(404).json({ error: 'Peça não encontrada' });
    const result = db.prepare(`INSERT INTO pecas_modelagem (projeto_id, nome, material_id, espessura, geometria_silhueta, bounding_box_x, bounding_box_y, area_real, perimetro, processo_fabricacao, parametros_processo, furos, canaletas, bordas, fabricabilidade, notas_operador) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        orig.projeto_id, orig.nome + ' (cópia)', orig.material_id, orig.espessura, orig.geometria_silhueta,
        orig.bounding_box_x, orig.bounding_box_y, orig.area_real, orig.perimetro,
        orig.processo_fabricacao, orig.parametros_processo, orig.furos, orig.canaletas, orig.bordas, orig.fabricabilidade, orig.notas_operador
    );
    const dup = db.prepare('SELECT p.*, m.nome as material_nome, m.cor_hex as material_cor FROM pecas_modelagem p LEFT JOIN materiais_modelagem m ON m.id = p.material_id WHERE p.id = ?').get(result.lastInsertRowid);
    res.json(dup);
});

// ═══════════════════════════════════════════════════════
// KERF CALCULATOR endpoint
// ═══════════════════════════════════════════════════════
router.post('/kerf-calculator', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const { material_id, espessura_mm, raio_desejado_mm } = req.body;
    if (!espessura_mm || !raio_desejado_mm) return res.status(400).json({ error: 'espessura_mm e raio_desejado_mm obrigatórios' });

    let raioMinMap = {};
    if (material_id) {
        const mat = db.prepare('SELECT raio_min_kerf_mm, permite_kerf FROM materiais_modelagem WHERE id = ?').get(material_id);
        if (mat && !mat.permite_kerf) return res.json({ viavel: false, erro: 'Material não permite kerf bending' });
        if (mat?.raio_min_kerf_mm) raioMinMap = mat.raio_min_kerf_mm;
    }
    res.json(calcularKerf(espessura_mm, raio_desejado_mm, raioMinMap));
});

// ═══════════════════════════════════════════════════════
// FABRICABILIDADE endpoint
// ═══════════════════════════════════════════════════════
router.post('/fabricabilidade', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const { peca_id } = req.body;
    if (!peca_id) return res.status(400).json({ error: 'peca_id obrigatório' });
    const peca = db.prepare('SELECT * FROM pecas_modelagem WHERE id = ?').get(peca_id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    const mat = peca.material_id ? db.prepare('SELECT * FROM materiais_modelagem WHERE id = ?').get(peca.material_id) : null;
    const fab = analisarFabricabilidade(peca, mat);
    db.prepare('UPDATE pecas_modelagem SET fabricabilidade = ? WHERE id = ?').run(JSON.stringify(fab), peca_id);
    res.json(fab);
});

// ═══════════════════════════════════════════════════════
// LINK PÚBLICO — aprovação do cliente
// ═══════════════════════════════════════════════════════
router.post('/projetos/:id/link', requireAuth, (req, res) => {
    const db = req.app.get('db');
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE projetos_modelagem SET link_ativo = 1, link_expira_em = ?, status = 'aguardando_aprovacao', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(expira, req.params.id);
    const proj = db.prepare('SELECT link_token, link_expira_em FROM projetos_modelagem WHERE id = ?').get(req.params.id);
    res.json({ ok: true, token: proj.link_token, expira_em: proj.link_expira_em });
});

router.delete('/projetos/:id/link', requireAuth, (req, res) => {
    const db = req.app.get('db');
    db.prepare("UPDATE projetos_modelagem SET link_ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PÚBLICO (sem auth) — cliente vê e aprova
// ═══════════════════════════════════════════════════════
router.get('/public/:token', (req, res) => {
    const db = req.app.get('db');
    const proj = db.prepare(`SELECT pm.*, c.nome as cliente_nome FROM projetos_modelagem pm LEFT JOIN clientes c ON c.id = pm.cliente_id WHERE pm.link_token = ? AND pm.link_ativo = 1`).get(req.params.token);
    if (!proj) return res.status(404).json({ error: 'Link não encontrado ou expirado' });
    if (proj.link_expira_em && new Date(proj.link_expira_em) < new Date()) return res.status(410).json({ error: 'Link expirado' });

    const pecas = db.prepare(`SELECT p.*, m.nome as material_nome, m.cor_hex as material_cor FROM pecas_modelagem p LEFT JOIN materiais_modelagem m ON m.id = p.material_id WHERE p.projeto_id = ? ORDER BY p.id`).all(proj.id);

    // Return safe data (no internal IDs leaked)
    res.json({
        nome: proj.nome, descricao: proj.descricao, codigo: proj.codigo,
        status: proj.status, versao: proj.versao, cliente_nome: proj.cliente_nome,
        aprovado_por: proj.aprovado_por, aprovado_em: proj.aprovado_em,
        comentarios_cliente: proj.comentarios_cliente,
        pecas: pecas.map(p => ({
            nome: p.nome, espessura: p.espessura, material_nome: p.material_nome, material_cor: p.material_cor,
            geometria_silhueta: p.geometria_silhueta, bounding_box_x: p.bounding_box_x, bounding_box_y: p.bounding_box_y,
            area_real: p.area_real, processo_fabricacao: p.processo_fabricacao, furos: p.furos, canaletas: p.canaletas, bordas: p.bordas,
        })),
    });
});

router.post('/public/:token/aprovar', (req, res) => {
    const db = req.app.get('db');
    const { nome, comentarios } = req.body;
    const proj = db.prepare("SELECT id FROM projetos_modelagem WHERE link_token = ? AND link_ativo = 1").get(req.params.token);
    if (!proj) return res.status(404).json({ error: 'Link não encontrado' });
    db.prepare("UPDATE projetos_modelagem SET status = 'aprovado', aprovado_por = ?, aprovado_em = CURRENT_TIMESTAMP, comentarios_cliente = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(
        nome || 'Cliente', comentarios || '', proj.id
    );
    res.json({ ok: true, mensagem: 'Projeto aprovado com sucesso!' });
});

router.post('/public/:token/alteracao', (req, res) => {
    const db = req.app.get('db');
    const { nome, comentarios } = req.body;
    const proj = db.prepare("SELECT id FROM projetos_modelagem WHERE link_token = ? AND link_ativo = 1").get(req.params.token);
    if (!proj) return res.status(404).json({ error: 'Link não encontrado' });
    db.prepare("UPDATE projetos_modelagem SET status = 'em_revisao', comentarios_cliente = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?").run(
        `[${nome || 'Cliente'}]: ${comentarios || ''}`, proj.id
    );
    res.json({ ok: true, mensagem: 'Solicitação de alteração registrada!' });
});

export default router;
