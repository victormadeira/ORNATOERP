import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';
import { createNotification, logActivity } from '../services/notificacoes.js';
import { calcularListaCorte, loadBiblioteca } from './producao.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as gdrive from '../services/gdrive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const router = Router();

// Helper: extrair nomes de ambientes do orçamento (mods_json pode ser objeto ou array)
function parseAmbientesFromOrc(orc) {
    const ambMap = new Map();
    try {
        const mods = orc.mods_json ? JSON.parse(orc.mods_json) : null;
        if (!mods) return [];

        // Formato objeto: {"ambientes":[{nome:"Cozinha",...},...]}
        if (!Array.isArray(mods) && mods.ambientes && Array.isArray(mods.ambientes)) {
            for (const amb of mods.ambientes) {
                if (amb.nome && !ambMap.has(amb.nome)) {
                    ambMap.set(amb.nome, { id: `amb_${Date.now()}_${ambMap.size}`, nome: amb.nome, status: 'aguardando' });
                }
            }
        }
        // Formato array de módulos: [{ambientes:[{nome:...}]},...]
        if (Array.isArray(mods)) {
            for (const mod of mods) {
                if (Array.isArray(mod.ambientes)) {
                    for (const amb of mod.ambientes) {
                        if (amb.nome && !ambMap.has(amb.nome)) {
                            ambMap.set(amb.nome, { id: `amb_${Date.now()}_${ambMap.size}`, nome: amb.nome, status: 'aguardando' });
                        }
                    }
                }
            }
        }
        // Fallback: campo "ambiente" direto no orçamento
        if (orc.ambiente && ambMap.size === 0) {
            ambMap.set(orc.ambiente, { id: `amb_${Date.now()}_0`, nome: orc.ambiente, status: 'aguardando' });
        }
    } catch (_) {}
    return [...ambMap.values()];
}

// ═══════════════════════════════════════════════════
// GET /api/projetos/users-list — lista de usuários para dropdown de responsável
// DEVE vir ANTES de /:id para evitar conflito de rota
// ═══════════════════════════════════════════════════
router.get('/users-list', requireAuth, (req, res) => {
    const users = db.prepare('SELECT id, nome, role FROM users WHERE ativo = 1 ORDER BY nome').all();
    res.json(users);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/portal/:token — acesso público (sem auth)
// DEVE vir ANTES de /:id para evitar conflito de rota
// ═══════════════════════════════════════════════════
router.get('/portal/:token', (req, res) => {
    const proj = db.prepare(`
        SELECT p.*, o.cliente_nome, o.valor_venda
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.token = ?
    `).get(req.params.token);

    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado ou link inválido' });

    // Notificar equipe quando cliente acessa o portal (rate-limit: 1 por projeto a cada 30 min)
    try {
        const recent = db.prepare(`
            SELECT id FROM notificacoes
            WHERE tipo = 'portal_visualizado' AND referencia_id = ?
              AND criado_em > datetime('now', '-30 minutes')
            LIMIT 1
        `).get(proj.id);
        if (!recent) {
            createNotification(
                'portal_visualizado',
                `Portal acessado: ${proj.nome}`,
                `${proj.cliente_nome || 'Cliente'} visualizou o portal do projeto`,
                proj.id, 'projeto', proj.cliente_nome || '', null
            );
        }
    } catch (_) {}

    const etapas = db.prepare(`
        SELECT e.*, u.nome as responsavel_nome
        FROM etapas_projeto e
        LEFT JOIN users u ON u.id = e.responsavel_id
        WHERE e.projeto_id = ? ORDER BY e.ordem, e.id
    `).all(proj.id);

    // Calcular status real do projeto a partir das etapas (garantia de consistência)
    let displayStatus = proj.status;
    if (etapas.length > 0) {
        const allDone = etapas.every(e => e.status === 'concluida');
        const anyStarted = etapas.some(e => e.status === 'em_andamento' || e.status === 'concluida' || e.status === 'atrasada');
        if (allDone) {
            displayStatus = 'concluido';
        } else if (anyStarted && (proj.status === 'nao_iniciado' || !proj.status)) {
            displayStatus = 'em_andamento';
        }
    }

    // Também persistir no banco para manter consistência
    if (displayStatus !== proj.status) {
        try { db.prepare('UPDATE projetos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(displayStatus, proj.id); } catch (_) {}
    }

    const ocorrencias = db.prepare(
        "SELECT * FROM ocorrencias_projeto WHERE projeto_id = ? AND status != 'interno' ORDER BY criado_em DESC"
    ).all(proj.id);

    const empresa = db.prepare(
        'SELECT nome, telefone, email, cidade, estado, cnpj, logo_header_path, proposta_cor_primaria, proposta_cor_accent FROM empresa_config WHERE id = 1'
    ).get() || {};

    // Portal v2: mensagens do chat
    const mensagens = db.prepare(`
        SELECT id, autor_tipo, autor_nome, conteudo, criado_em
        FROM portal_mensagens
        WHERE projeto_id = ? AND token = ?
        ORDER BY criado_em ASC
    `).all(proj.id, req.params.token);

    // Ambientes (somente se habilitado)
    let ambientes = [];
    if (proj.mostrar_ambientes_portal) {
        try { ambientes = proj.ambientes_json ? JSON.parse(proj.ambientes_json) : []; } catch (_) {}
    }

    res.json({
        projeto: {
            id: proj.id,
            nome: proj.nome,
            descricao: proj.descricao,
            status: displayStatus,
            data_inicio: proj.data_inicio,
            data_vencimento: proj.data_vencimento,
            cliente_nome: proj.cliente_nome,
            etapas,
            ocorrencias,
            mensagens,
            ambientes,
        },
        empresa,
    });
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/portal/:token/fotos — listar fotos do montador (público)
// ═══════════════════════════════════════════════════
router.get('/portal/:token/fotos', (req, res) => {
    const proj = db.prepare(`
        SELECT p.id FROM projetos p WHERE p.token = ?
    `).get(req.params.token);

    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const fotos = db.prepare(`
        SELECT id, nome_montador, ambiente, filename, criado_em
        FROM montador_fotos
        WHERE projeto_id = ? AND visivel_portal = 1
        ORDER BY criado_em DESC
    `).all(proj.id);

    const result = fotos.map(f => ({
        ...f,
        url: `/api/drive/arquivo/${proj.id}/montador/${f.filename}`,
    }));

    res.json(result);
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/portal/:token/mensagens — cliente envia mensagem (público)
// ═══════════════════════════════════════════════════
router.post('/portal/:token/mensagens', (req, res) => {
    const { token } = req.params;
    const { autor_nome, conteudo } = req.body;

    if (!conteudo || !conteudo.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });

    const proj = db.prepare('SELECT id FROM projetos WHERE token = ?').get(token);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const nomeCliente = (autor_nome || '').trim() || 'Cliente';
    const r = db.prepare(`
        INSERT INTO portal_mensagens (projeto_id, token, autor_tipo, autor_nome, conteudo)
        VALUES (?, ?, 'cliente', ?, ?)
    `).run(proj.id, token, nomeCliente, conteudo.trim());

    // Notificar equipe
    const projNome = db.prepare('SELECT nome FROM projetos WHERE id = ?').get(proj.id)?.nome || '';
    try {
        createNotification(
            'portal_mensagem',
            'Nova mensagem do cliente',
            `${nomeCliente} enviou mensagem no portal "${projNome}"`,
            proj.id, 'projeto'
        );
    } catch (_) { /* não bloqueia */ }

    const msg = db.prepare('SELECT * FROM portal_mensagens WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(msg);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/:id/mensagens-portal — listar mensagens do portal (auth)
// ═══════════════════════════════════════════════════
router.get('/:id/mensagens-portal', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const mensagens = db.prepare(`
        SELECT * FROM portal_mensagens WHERE projeto_id = ? ORDER BY criado_em ASC
    `).all(id);
    res.json(mensagens);
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/mensagens-portal — equipe responde (auth)
// ═══════════════════════════════════════════════════
router.post('/:id/mensagens-portal', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { conteudo } = req.body;
    if (!conteudo || !conteudo.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });

    const proj = db.prepare('SELECT id, token FROM projetos WHERE id = ?').get(id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
    if (!proj.token) return res.status(400).json({ error: 'Projeto sem token de portal' });

    const r = db.prepare(`
        INSERT INTO portal_mensagens (projeto_id, token, autor_tipo, autor_nome, conteudo)
        VALUES (?, ?, 'equipe', ?, ?)
    `).run(proj.id, proj.token, req.user.nome, conteudo.trim());

    // Marcar mensagens do cliente como lidas
    db.prepare(`UPDATE portal_mensagens SET lida = 1 WHERE projeto_id = ? AND autor_tipo = 'cliente' AND lida = 0`).run(proj.id);

    const msg = db.prepare('SELECT * FROM portal_mensagens WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(msg);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos — listar todos (auth)
// ═══════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT p.*, o.cliente_nome, o.ambiente as orc_nome, o.valor_venda,
            (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id) as total_etapas,
            (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id AND e.status = 'concluida') as etapas_concluidas,
            (SELECT COUNT(*) FROM ocorrencias_projeto oc WHERE oc.projeto_id = p.id AND oc.status = 'aberto') as ocorrencias_abertas,
            (SELECT COUNT(*) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status = 'pendente' AND cr.data_vencimento <= date('now')) as contas_vencidas
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        ORDER BY p.criado_em DESC
    `).all();
    res.json(rows);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/:id — projeto completo (auth)
// ═══════════════════════════════════════════════════
router.get('/:id', requireAuth, (req, res) => {
    const proj = db.prepare(`
        SELECT p.*, o.cliente_nome, o.valor_venda, o.custo_material, o.numero as orc_numero
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.id = ?
    `).get(parseInt(req.params.id));

    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const etapas = db.prepare(`
        SELECT e.*, u.nome as responsavel_nome
        FROM etapas_projeto e
        LEFT JOIN users u ON u.id = e.responsavel_id
        WHERE e.projeto_id = ? ORDER BY e.ordem, e.id
    `).all(proj.id);

    // Calcular status real do projeto a partir das etapas
    if (etapas.length > 0) {
        const allDone = etapas.every(e => e.status === 'concluida');
        const anyStarted = etapas.some(e => e.status === 'em_andamento' || e.status === 'concluida' || e.status === 'atrasada');
        let newStatus = null;
        if (allDone && proj.status !== 'concluido') {
            newStatus = 'concluido';
        } else if (anyStarted && proj.status === 'nao_iniciado') {
            newStatus = 'em_andamento';
        }
        if (newStatus) {
            try {
                db.prepare('UPDATE projetos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, proj.id);
                logActivity(req.user.id, req.user.nome, 'atualizar_status',
                    `Status do projeto "${proj.nome}" alterado automaticamente para ${newStatus}`,
                    proj.id, 'projeto', { status_anterior: proj.status, status_novo: newStatus, auto: true });
            } catch (_) {}
            proj.status = newStatus;
        }
    }

    const ocorrencias = db.prepare(
        'SELECT * FROM ocorrencias_projeto WHERE projeto_id = ? ORDER BY criado_em DESC'
    ).all(proj.id);

    // Parse ambientes JSON — se vazio e tem orçamento, importar ambientes automaticamente
    let ambientes_parsed = [];
    try { ambientes_parsed = proj.ambientes_json ? JSON.parse(proj.ambientes_json) : []; } catch (_) {}

    if (ambientes_parsed.length === 0 && proj.orc_id) {
        try {
            const orc = db.prepare('SELECT mods_json, ambiente FROM orcamentos WHERE id = ?').get(proj.orc_id);
            if (orc) {
                ambientes_parsed = parseAmbientesFromOrc(orc);
                if (ambientes_parsed.length > 0) {
                    db.prepare('UPDATE projetos SET ambientes_json = ? WHERE id = ?').run(JSON.stringify(ambientes_parsed), proj.id);
                }
            }
        } catch (_) {}
    }

    res.json({ ...proj, etapas, ocorrencias, ambientes_parsed });
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/:id/termo-entrega — dados para o termo
// ═══════════════════════════════════════════════════
router.get('/:id/termo-entrega', requireAuth, (req, res) => {
    try {
        const proj = db.prepare(`
            SELECT p.*, o.cliente_nome, o.valor_venda, o.custo_material, o.numero as orc_numero,
                   o.mods_json, o.ambiente as orc_ambiente
            FROM projetos p
            LEFT JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.id = ?
        `).get(parseInt(req.params.id));
        if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

        // Etapas do projeto
        const etapas = db.prepare(`
            SELECT e.*, u.nome as responsavel_nome
            FROM etapas_projeto e
            LEFT JOIN users u ON u.id = e.responsavel_id
            WHERE e.projeto_id = ? ORDER BY e.ordem, e.id
        `).all(proj.id);

        // Ocorrências abertas
        let ocorrencias = [];
        try {
            ocorrencias = db.prepare(
                'SELECT * FROM ocorrencias_projeto WHERE projeto_id = ? AND status = ? ORDER BY criado_em DESC'
            ).all(proj.id, 'aberto');
        } catch (_) {}

        // Financeiro: contas a receber do projeto
        const parcelas = db.prepare(
            'SELECT * FROM contas_receber WHERE projeto_id = ? ORDER BY data_vencimento'
        ).all(proj.id);
        const totalPago = parcelas.filter(p => p.status === 'pago').reduce((s, p) => s + (p.valor || 0), 0);
        const totalPendente = parcelas.filter(p => p.status === 'pendente').reduce((s, p) => s + (p.valor || 0), 0);

        // Parse ambientes do orçamento vinculado (suporta array de módulos e objeto legado)
        let ambientes = [];
        try {
            const mods = proj.mods_json ? JSON.parse(proj.mods_json) : [];
            if (Array.isArray(mods)) {
                const ambMap = new Map();
                for (const mod of mods) {
                    if (Array.isArray(mod.ambientes)) {
                        for (const amb of mod.ambientes) {
                            if (amb.nome && !ambMap.has(amb.nome)) {
                                ambMap.set(amb.nome, amb);
                            }
                        }
                    }
                }
                ambientes = [...ambMap.values()];
            } else if (mods && mods.ambientes) {
                ambientes = mods.ambientes;
            }
            if (proj.orc_ambiente && ambientes.length === 0) {
                ambientes = [{ nome: proj.orc_ambiente, itens: [] }];
            }
        } catch (_) {}

        // Dados da empresa
        const empresa = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get() || {};

        // Fotos do montador
        let fotos = [];
        try {
            fotos = db.prepare(
                'SELECT id, ambiente, filename, criado_em FROM montador_fotos WHERE projeto_id = ? ORDER BY criado_em DESC LIMIT 10'
            ).all(proj.id);
        } catch (_) {}

        // Fotos de entrega digital (por módulo)
        let entregaFotos = [];
        try {
            entregaFotos = db.prepare(
                'SELECT id, ambiente_idx, item_idx, filename, nota, criado_em, ambiente FROM entrega_fotos WHERE projeto_id = ? ORDER BY ambiente_idx, item_idx, criado_em'
            ).all(proj.id);
        } catch (_) {}

        res.json({
            projeto: proj,
            etapas,
            ocorrencias,
            ambientes,
            financeiro: { parcelas, totalPago, totalPendente, valorTotal: proj.valor_venda || 0 },
            empresa,
            fotos,
            entregaFotos: entregaFotos.map(f => ({ ...f, url: `/api/drive/arquivo/${proj.id}/entrega/${f.filename}` })),
        });
    } catch (ex) {
        console.error('Erro termo-entrega:', ex.message);
        res.status(500).json({ error: 'Erro ao carregar dados do termo: ' + ex.message });
    }
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/:id/entrega-fotos — listar fotos de entrega
// ═══════════════════════════════════════════════════
router.get('/:id/entrega-fotos', requireAuth, (req, res) => {
    try {
        const fotos = db.prepare(`
            SELECT id, ambiente_idx, item_idx, filename, nota, criado_em, ambiente
            FROM entrega_fotos WHERE projeto_id = ? ORDER BY ambiente_idx, item_idx, criado_em DESC
        `).all(parseInt(req.params.id));

        const result = fotos.map(f => ({
            ...f,
            url: `/api/drive/arquivo/${req.params.id}/entrega/${f.filename}`,
        }));
        res.json(result);
    } catch (ex) {
        console.error('Erro entrega-fotos list:', ex.message);
        res.status(500).json({ error: ex.message });
    }
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/entrega-fotos — upload foto de entrega (só gerente)
// ═══════════════════════════════════════════════════
router.post('/:id/entrega-fotos', requireAuth, async (req, res) => {
    try {
        const projeto_id = parseInt(req.params.id);
        const { filename, data, ambiente_idx, item_idx, nota, ambiente } = req.body;
        if (!filename || !data) return res.status(400).json({ error: 'Filename e data obrigatórios' });

        // Validar tipo de arquivo (apenas imagens)
        const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
        const ext = path.extname(filename).toLowerCase();
        if (!ALLOWED_EXTS.includes(ext)) return res.status(400).json({ error: `Tipo de arquivo não permitido (${ext}). Use: ${ALLOWED_EXTS.join(', ')}` });

        const timestamp = Date.now();
        const safeName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        const base64Data = data.includes(',') ? data.split(',')[1] : data;
        const buffer = Buffer.from(base64Data, 'base64');

        // Validar tamanho (máx 10MB)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (buffer.length > MAX_SIZE) return res.status(400).json({ error: `Arquivo muito grande (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB` });

        const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heif' };
        const mime = mimeMap[ext] || 'image/jpeg';

        let gdriveFileId = '';
        if (gdrive.isConfigured()) {
            try {
                const folderId = await gdrive.getProjectMontadorFolder(projeto_id);
                const result = await gdrive.uploadFile(folderId, safeName, mime, buffer);
                gdriveFileId = result.id;
            } catch (err) {
                console.error('Drive entrega upload erro:', err.message);
            }
        }

        if (!gdriveFileId) {
            const entregaDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, 'entrega');
            if (!fs.existsSync(entregaDir)) fs.mkdirSync(entregaDir, { recursive: true });
            fs.writeFileSync(path.join(entregaDir, safeName), buffer);
        }

        const insertResult = db.prepare(`
            INSERT INTO entrega_fotos (projeto_id, ambiente_idx, item_idx, filename, nota, gdrive_file_id, ambiente)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(projeto_id, ambiente_idx ?? 0, item_idx ?? null, safeName, nota || '', gdriveFileId, ambiente || '');

        res.json({ ok: true, id: Number(insertResult.lastInsertRowid), nome: safeName, url: `/api/drive/arquivo/${projeto_id}/entrega/${safeName}` });
    } catch (ex) {
        console.error('Erro entrega-fotos upload:', ex.message);
        res.status(500).json({ error: ex.message });
    }
});

// ═══════════════════════════════════════════════════
// DELETE /api/projetos/:id/entrega-fotos/:fotoId — deletar foto
// ═══════════════════════════════════════════════════
router.delete('/:id/entrega-fotos/:fotoId', requireAuth, async (req, res) => {
    try {
        const foto = db.prepare('SELECT * FROM entrega_fotos WHERE id = ? AND projeto_id = ?').get(
            parseInt(req.params.fotoId), parseInt(req.params.id)
        );
        if (!foto) return res.status(404).json({ error: 'Foto não encontrada' });

        if (foto.gdrive_file_id) {
            try { await gdrive.deleteFile(foto.gdrive_file_id); } catch (err) { console.error('Drive delete entrega erro:', err.message); }
        }

        const filePath = path.join(UPLOADS_DIR, `projeto_${foto.projeto_id}`, 'entrega', foto.filename);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch { }
        }

        db.prepare('DELETE FROM entrega_fotos WHERE id = ?').run(foto.id);
        res.json({ ok: true });
    } catch (ex) {
        console.error('Erro entrega-fotos delete:', ex.message);
        res.status(500).json({ error: ex.message });
    }
});

// ═══════════════════════════════════════════════════
// POST /api/projetos — criar projeto (auth)
// ═══════════════════════════════════════════════════
router.post('/', requireAuth, (req, res) => {
    const { orc_id, nome, descricao, data_inicio, data_vencimento, etapas } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const token = randomBytes(16).toString('hex');

    const r = db.prepare(`
        INSERT INTO projetos (user_id, orc_id, nome, descricao, data_inicio, data_vencimento, token)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id,
        orc_id ? parseInt(orc_id) : null,
        nome.trim(),
        descricao || '',
        data_inicio || null,
        data_vencimento || null,
        token
    );

    const projId = r.lastInsertRowid;

    // Inserir etapas iniciais se fornecidas
    if (Array.isArray(etapas) && etapas.length > 0) {
        const stmt = db.prepare(`
            INSERT INTO etapas_projeto (projeto_id, nome, descricao, data_inicio, data_vencimento, responsavel_id, ordem)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        etapas.forEach((e, i) =>
            stmt.run(projId, e.nome, e.descricao || '', e.data_inicio || null, e.data_vencimento || null, e.responsavel_id || null, i)
        );
    }

    // Inicializar ambientes a partir do orçamento vinculado
    if (orc_id) {
        try {
            const orc = db.prepare('SELECT mods_json, ambiente FROM orcamentos WHERE id = ?').get(parseInt(orc_id));
            if (orc) {
                const ambArr = parseAmbientesFromOrc(orc);
                if (ambArr.length > 0) {
                    db.prepare('UPDATE projetos SET ambientes_json = ? WHERE id = ?').run(JSON.stringify(ambArr), projId);
                }
            }
        } catch (_) { /* não bloqueia criação */ }
    }

    try {
        logActivity(req.user.id, req.user.nome, 'criar', `Criou projeto "${nome.trim()}"`, projId, 'projeto');
    } catch (_) { /* log não bloqueia */ }

    res.json({ id: projId, token });
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/duplicar — duplicar projeto (auth)
// ═══════════════════════════════════════════════════
router.post('/:id/duplicar', requireAuth, (req, res) => {
    const srcId = parseInt(req.params.id);
    const src = db.prepare('SELECT * FROM projetos WHERE id = ?').get(srcId);
    if (!src) return res.status(404).json({ error: 'Projeto não encontrado' });

    const token = randomBytes(24).toString('hex');
    const nome = (req.body.nome || `${src.nome} (cópia)`).trim();

    const r = db.prepare(`
        INSERT INTO projetos (user_id, orc_id, nome, descricao, data_inicio, data_vencimento, status, token)
        VALUES (?, ?, ?, ?, ?, ?, 'nao_iniciado', ?)
    `).run(req.user.id, src.orc_id, nome, src.descricao || '', req.body.data_inicio || null, req.body.data_vencimento || null, token);

    const newProjId = r.lastInsertRowid;

    // Copiar etapas (sem status, progresso e datas)
    const etapas = db.prepare('SELECT * FROM etapas_projeto WHERE projeto_id = ? ORDER BY ordem').all(srcId);
    const stmtEtapa = db.prepare(`
        INSERT INTO etapas_projeto (projeto_id, nome, descricao, data_inicio, data_vencimento, ordem, responsavel_id)
        VALUES (?, ?, ?, NULL, NULL, ?, ?)
    `);
    etapas.forEach(e => stmtEtapa.run(newProjId, e.nome, e.descricao || '', e.ordem, e.responsavel_id));

    try { logActivity(req.user.id, req.user.nome, 'criar', `Duplicou projeto "${src.nome}" → "${nome}"`, newProjId, 'projeto'); } catch (_) {}

    res.json({ id: newProjId, token });
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/templates — listar templates de etapas
// ═══════════════════════════════════════════════════
router.get('/templates/list', requireAuth, (req, res) => {
    const templates = db.prepare('SELECT * FROM etapas_templates ORDER BY nome').all();
    res.json(templates.map(t => ({ ...t, etapas: JSON.parse(t.etapas_json || '[]') })));
});

// POST /api/projetos/templates — salvar template
router.post('/templates', requireAuth, (req, res) => {
    const { nome, etapas } = req.body;
    if (!nome || !etapas?.length) return res.status(400).json({ error: 'Nome e etapas obrigatórios' });
    const r = db.prepare('INSERT INTO etapas_templates (nome, etapas_json) VALUES (?, ?)').run(nome, JSON.stringify(etapas));
    res.json({ id: r.lastInsertRowid });
});

// DELETE /api/projetos/templates/:id
router.delete('/templates/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM etapas_templates WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// PUT /api/projetos/:id — atualizar projeto (auth)
// ═══════════════════════════════════════════════════
router.put('/:id', requireAuth, (req, res) => {
    const { nome, descricao, status, data_inicio, data_vencimento, ambientes_json, mostrar_ambientes_portal } = req.body;
    const projId = parseInt(req.params.id);

    // Buscar status anterior para detectar mudança
    const anterior = db.prepare('SELECT status, nome FROM projetos WHERE id = ?').get(projId);

    db.prepare(`
        UPDATE projetos
        SET nome=?, descricao=?, status=?, data_inicio=?, data_vencimento=?,
            ambientes_json=COALESCE(?,ambientes_json), mostrar_ambientes_portal=COALESCE(?,mostrar_ambientes_portal),
            atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(nome, descricao || '', status, data_inicio || null, data_vencimento || null,
        ambientes_json !== undefined ? ambientes_json : null,
        mostrar_ambientes_portal !== undefined ? (mostrar_ambientes_portal ? 1 : 0) : null,
        projId);

    try {
        const label = nome || anterior?.nome || `#${projId}`;
        if (status && anterior && status !== anterior.status) {
            logActivity(req.user.id, req.user.nome, 'atualizar_status',
                `Alterou status do projeto "${label}" de ${anterior.status} para ${status}`,
                projId, 'projeto', { status_anterior: anterior.status, status_novo: status });
            if (status === 'concluido' || status === 'atrasado') {
                createNotification('projeto_status',
                    `Projeto ${status === 'concluido' ? 'concluído' : 'atrasado'}: ${label}`,
                    `Status alterado por ${req.user.nome}`,
                    projId, 'projeto', '', req.user.id);
            }
        } else {
            logActivity(req.user.id, req.user.nome, 'editar', `Editou projeto "${label}"`, projId, 'projeto');
        }
    } catch (_) { /* log não bloqueia */ }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/projetos/:id — excluir projeto (auth)
// ═══════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    try {
        const deleteProjeto = db.transaction(() => {
            // Ordem: respeitar FK dependencies (filhas antes de pais)
            db.prepare('DELETE FROM portal_mensagens WHERE projeto_id = ?').run(id);
            // contas_pagar tem FK para despesas_projeto → deletar contas_pagar ANTES
            db.prepare('DELETE FROM contas_pagar WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM despesas_projeto WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM contas_receber WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM movimentacoes_estoque WHERE projeto_id = ?').run(id);
            // montador_fotos tem FK para montador_tokens → deletar fotos ANTES
            db.prepare('DELETE FROM montador_fotos WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM montador_tokens WHERE projeto_id = ?').run(id);
            // apontamentos_horas tem FK para etapas_projeto → deletar apontamentos ANTES
            db.prepare('DELETE FROM apontamentos_horas WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM etapas_projeto WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM ocorrencias_projeto WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM entrega_fotos WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM projeto_arquivos WHERE projeto_id = ?').run(id);
            // Limpar notificações referenciando este projeto
            db.prepare("DELETE FROM notificacoes WHERE referencia_id = ? AND referencia_tipo = 'projeto'").run(id);
            db.prepare('DELETE FROM projetos WHERE id = ?').run(id);
        });
        deleteProjeto();
        res.json({ ok: true });
    } catch (err) {
        console.error('Erro ao excluir projeto:', err);
        res.status(500).json({ error: 'Erro ao excluir projeto' });
    }
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/etapas — adicionar etapa
// ═══════════════════════════════════════════════════
router.post('/:id/etapas', requireAuth, (req, res) => {
    const { nome, descricao, data_inicio, data_vencimento, responsavel_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const last = db.prepare(
        'SELECT COALESCE(MAX(ordem), -1) as m FROM etapas_projeto WHERE projeto_id = ?'
    ).get(parseInt(req.params.id));

    const r = db.prepare(`
        INSERT INTO etapas_projeto (projeto_id, nome, descricao, data_inicio, data_vencimento, responsavel_id, ordem)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        parseInt(req.params.id), nome, descricao || '',
        data_inicio || null, data_vencimento || null,
        responsavel_id || null, (last.m + 1)
    );
    res.json({ id: r.lastInsertRowid });
});

// ═══════════════════════════════════════════════════
// Helper: auto-atualizar status do projeto baseado nas etapas
// ═══════════════════════════════════════════════════
function autoUpdateProjectStatus(projetoId, userId, userName) {
    try {
        const projeto = db.prepare('SELECT id, nome, status FROM projetos WHERE id = ?').get(projetoId);
        if (!projeto) return projeto?.status;

        // Só age sobre nao_iniciado e em_andamento (respeita suspenso/atrasado como manuais)
        const autoStatuses = ['nao_iniciado', 'em_andamento'];
        if (!autoStatuses.includes(projeto.status)) return projeto.status;

        const etapas = db.prepare('SELECT status FROM etapas_projeto WHERE projeto_id = ?').all(projetoId);
        if (etapas.length === 0) return projeto.status;

        const allDone = etapas.every(e => e.status === 'concluida');
        const anyStarted = etapas.some(e => e.status === 'em_andamento' || e.status === 'concluida');

        let newStatus = null;
        if (allDone && projeto.status !== 'concluido') {
            newStatus = 'concluido';
        } else if (anyStarted && projeto.status === 'nao_iniciado') {
            newStatus = 'em_andamento';
        } else if (!anyStarted && !allDone && projeto.status === 'em_andamento') {
            const anyActive = etapas.some(e => e.status !== 'nao_iniciado' && e.status !== 'pendente');
            if (!anyActive) newStatus = 'nao_iniciado';
        }

        if (newStatus) {
            db.prepare('UPDATE projetos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, projetoId);
            try {
                logActivity(userId, userName, 'atualizar_status',
                    `Status do projeto "${projeto.nome}" alterado automaticamente para ${newStatus}`,
                    projetoId, 'projeto', { status_anterior: projeto.status, status_novo: newStatus, auto: true });
                if (newStatus === 'concluido') {
                    createNotification('projeto_status',
                        `Projeto concluído: ${projeto.nome}`,
                        'Todas as etapas foram concluídas',
                        projetoId, 'projeto', '', userId);
                }
            } catch (_) { /* log não bloqueia */ }
            return newStatus;
        }
        return projeto.status;
    } catch (err) {
        console.error('autoUpdateProjectStatus error:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════
// PUT /api/projetos/etapas/:etapa_id — atualizar etapa
// ═══════════════════════════════════════════════════
router.put('/etapas/:etapa_id', requireAuth, (req, res) => {
    const { nome, descricao, status, data_inicio, data_vencimento, ordem, responsavel_id, progresso, dependencia_id } = req.body;
    const etapaId = parseInt(req.params.etapa_id);

    // Buscar projeto_id antes de atualizar
    const etapaRow = db.prepare('SELECT projeto_id FROM etapas_projeto WHERE id = ?').get(etapaId);

    db.prepare(`
        UPDATE etapas_projeto
        SET nome=?, descricao=?, status=?, data_inicio=?, data_vencimento=?, ordem=?, responsavel_id=?, progresso=?, dependencia_id=?
        WHERE id=?
    `).run(
        nome, descricao || '', status,
        data_inicio || null, data_vencimento || null,
        ordem ?? 0, responsavel_id || null,
        progresso ?? 0, dependencia_id || null,
        etapaId
    );

    // Auto-atualizar status do projeto
    if (etapaRow) {
        autoUpdateProjectStatus(etapaRow.projeto_id, req.user.id, req.user.nome);
    }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/projetos/etapas/:etapa_id — excluir etapa
// ═══════════════════════════════════════════════════
router.delete('/etapas/:etapa_id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM etapas_projeto WHERE id=?').run(parseInt(req.params.etapa_id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/ocorrencias — adicionar ocorrência
// ═══════════════════════════════════════════════════
router.post('/:id/ocorrencias', requireAuth, (req, res) => {
    const { assunto, descricao, status: ocStatus } = req.body;
    if (!assunto) return res.status(400).json({ error: 'Assunto obrigatório' });

    const r = db.prepare(`
        INSERT INTO ocorrencias_projeto (projeto_id, assunto, descricao, autor, status)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        parseInt(req.params.id), assunto, descricao || '',
        req.user.nome, ocStatus || 'aberto'
    );
    res.json({ id: r.lastInsertRowid });
});

// ═══════════════════════════════════════════════════
// PUT /api/projetos/ocorrencias/:oc_id — atualizar status
// ═══════════════════════════════════════════════════
router.put('/ocorrencias/:oc_id', requireAuth, (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE ocorrencias_projeto SET status=? WHERE id=?')
        .run(status, parseInt(req.params.oc_id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// ETAPA 1 — Industrialização: Versões + Lotes + Ponte Orçamento→CNC
// ═══════════════════════════════════════════════════════════════════

// GET /api/projetos/:id/versoes — lista versões do projeto
router.get('/:id/versoes', requireAuth, (req, res) => {
    try {
        const versoes = db.prepare(`
            SELECT pv.*, o.cliente_nome, o.valor_venda, o.status as orc_status
            FROM projeto_versoes pv
            LEFT JOIN orcamentos o ON o.id = pv.orc_id
            WHERE pv.projeto_id = ?
            ORDER BY pv.versao DESC
        `).all(parseInt(req.params.id));
        res.json(versoes);
    } catch (err) {
        console.error('Erro ao listar versões:', err);
        res.status(500).json({ error: 'Erro ao listar versões' });
    }
});

// POST /api/projetos/:id/versoes — criar nova versão
router.post('/:id/versoes', requireAuth, (req, res) => {
    try {
        const projetoId = parseInt(req.params.id);
        const { tipo, orc_id, json_data, descricao } = req.body;

        // Calcular próximo número de versão
        const last = db.prepare('SELECT MAX(versao) as max FROM projeto_versoes WHERE projeto_id = ?').get(projetoId);
        const nextVersao = (last?.max || 0) + 1;

        // Desativar versões anteriores
        db.prepare('UPDATE projeto_versoes SET ativa = 0 WHERE projeto_id = ?').run(projetoId);

        const result = db.prepare(`
            INSERT INTO projeto_versoes (projeto_id, tipo, orc_id, json_data, descricao, versao, ativa, criado_por)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(projetoId, tipo || 'orcamento', orc_id || null, json_data || '', descricao || '', nextVersao, req.user.id);

        res.json({ id: Number(result.lastInsertRowid), versao: nextVersao });
    } catch (err) {
        console.error('Erro ao criar versão:', err);
        res.status(500).json({ error: 'Erro ao criar versão' });
    }
});

// GET /api/projetos/:id/lotes — lista lotes CNC vinculados ao projeto
router.get('/:id/lotes', requireAuth, (req, res) => {
    try {
        const lotes = db.prepare(`
            SELECT id, nome, cliente, projeto, status, total_pecas, total_chapas,
                   aproveitamento, origem, orc_id, criado_em, atualizado_em
            FROM cnc_lotes
            WHERE projeto_id = ?
            ORDER BY criado_em DESC
        `).all(parseInt(req.params.id));
        res.json(lotes);
    } catch (err) {
        console.error('Erro ao listar lotes:', err);
        res.status(500).json({ error: 'Erro ao listar lotes' });
    }
});

// POST /api/projetos/:id/industrializar — cria lote CNC a partir do orçamento do projeto
router.post('/:id/industrializar', requireAuth, (req, res) => {
    try {
        const projetoId = parseInt(req.params.id);

        // Buscar projeto com orçamento vinculado
        const projeto = db.prepare(`
            SELECT p.*, o.mods_json, o.cliente_nome, o.valor_venda, o.id as orc_id
            FROM projetos p
            LEFT JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.id = ?
        `).get(projetoId);

        if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });
        if (!projeto.orc_id) return res.status(400).json({ error: 'Projeto sem orçamento vinculado' });

        // Parse mods_json do orçamento
        let mods;
        try { mods = JSON.parse(projeto.mods_json || '{}'); } catch { mods = {}; }

        const ambientes = mods.ambientes || [];
        if (ambientes.length === 0) return res.status(400).json({ error: 'Orçamento sem ambientes/peças' });

        // Calcular lista de corte usando motor existente
        const bib = loadBiblioteca();
        const resultado = calcularListaCorte(mods, bib);

        if (!resultado.pecas || resultado.pecas.length === 0) {
            return res.status(400).json({ error: 'Nenhuma peça calculada a partir do orçamento' });
        }

        // Criar lote CNC vinculado ao projeto
        const loteNome = `${projeto.nome} — Industrialização`;
        const insertLote = db.prepare(`
            INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, codigo, vendedor, json_original, total_pecas, projeto_id, orc_id, origem)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'orcamento')
        `);
        const loteResult = insertLote.run(
            req.user.id, loteNome, projeto.cliente_nome || '', projeto.nome || '',
            '', '', JSON.stringify(mods), resultado.pecas.length,
            projetoId, projeto.orc_id
        );
        const loteId = loteResult.lastInsertRowid;

        // Inserir peças no formato cnc_pecas
        const insertPeca = db.prepare(`
            INSERT INTO cnc_pecas (lote_id, persistent_id, descricao, modulo_desc,
              material, material_code, espessura, comprimento, largura, quantidade,
              borda_frontal, acabamento, observacao)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);

        const insertMany = db.transaction((pecas) => {
            let idx = 0;
            for (const p of pecas) {
                idx++;
                const matCode = String(p.matId || '');
                insertPeca.run(
                    loteId,
                    `ORC_${projeto.orc_id}_${idx}`,       // persistent_id
                    p.nome || '',                           // descricao
                    `${p.ambiente || ''} — ${p.modulo || ''}`, // modulo_desc
                    p.matNome || '',                         // material
                    matCode,                                // material_code
                    p.espessura || 18,                      // espessura
                    p.largura || 0,                         // comprimento (no calc, largura é W)
                    p.altura || 0,                          // largura (no calc, altura é H)
                    p.qtd || 1,                             // quantidade
                    p.fita ? `${Math.round(p.fita)}m` : '', // borda simplificada
                    '',                                     // acabamento
                    `${p.tipo || 'caixa'} | ${p.ambiente || ''}` // observacao
                );
            }
        });
        insertMany(resultado.pecas);

        // Criar versão se não existir
        const versaoExiste = db.prepare('SELECT id FROM projeto_versoes WHERE projeto_id = ? AND orc_id = ?').get(projetoId, projeto.orc_id);
        if (!versaoExiste) {
            const lastV = db.prepare('SELECT MAX(versao) as max FROM projeto_versoes WHERE projeto_id = ?').get(projetoId);
            db.prepare(`
                INSERT INTO projeto_versoes (projeto_id, tipo, orc_id, descricao, versao, ativa, criado_por)
                VALUES (?, 'orcamento', ?, 'Versão do orçamento original', ?, 1, ?)
            `).run(projetoId, projeto.orc_id, (lastV?.max || 0) + 1, req.user.id);
        }

        // Notificar
        try {
            createNotification(
                'producao_iniciada',
                `Industrialização iniciada: ${projeto.nome}`,
                `${resultado.pecas.length} peças enviadas para produção`,
                projetoId, 'projeto', projeto.cliente_nome || '', req.user.id
            );
            logActivity(req.user.id, req.user.nome, 'industrializar',
                `Industrializou projeto ${projeto.nome} (${resultado.pecas.length} peças)`,
                projetoId, 'projeto');
        } catch (_) {}

        res.json({
            ok: true,
            lote_id: Number(loteId),
            total_pecas: resultado.pecas.length,
            nome: loteNome,
            chapas: Object.keys(resultado.chapas || {}).length,
        });
    } catch (err) {
        console.error('Erro ao industrializar:', err);
        res.status(500).json({ error: 'Erro ao industrializar projeto' });
    }
});

export default router;
