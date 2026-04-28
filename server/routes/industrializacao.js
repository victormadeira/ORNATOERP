import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { parsePluginJSON } from './cnc.js';

const router = Router();

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/** Validate and parse integer path param; returns NaN on failure */
function paramInt(val) {
    const n = parseInt(val, 10);
    return Number.isFinite(n) ? n : NaN;
}

/** Escape LIKE special characters (SQLite) */
function escapeLike(str) {
    return String(str).replace(/[\\%_]/g, c => '\\' + c);
}

/**
 * Valid status transitions.
 * Key = current status, Value = allowed next statuses.
 * Empty array = terminal state (no further transitions via PUT /status).
 */
const STATUS_TRANSITIONS = {
    rascunho:    ['readiness', 'cancelada'],
    readiness:   ['otimizando', 'rascunho'],
    otimizando:  ['otimizada', 'readiness'],
    otimizada:   ['etiquetas', 'otimizando'],
    etiquetas:   ['gcode', 'otimizada'],
    gcode:       ['liberada', 'etiquetas'],
    liberada:    [],           // terminal — use /liberar endpoint
    cancelada:   [],           // terminal
};

// ═══════════════════════════════════════════════════════
// ORDENS DE PRODUÇÃO — CRUD
// ═══════════════════════════════════════════════════════

// Listar OPs (com filtros opcionais) — isolado por criado_por
router.get('/ordens', requireAuth, (req, res) => {
    try {
        const { projeto_id, status } = req.query;
        let sql = `
            SELECT op.*, p.nome as projeto_nome, o.cliente_nome,
                   l.nome as lote_nome, l.total_pecas, l.status as lote_status,
                   u.nome as criado_por_nome
            FROM ordens_producao op
            LEFT JOIN projetos p ON p.id = op.projeto_id
            LEFT JOIN orcamentos o ON o.id = p.orc_id
            LEFT JOIN cnc_lotes l ON l.id = op.lote_id
            LEFT JOIN users u ON u.id = op.criado_por
            WHERE op.criado_por = ?
        `;
        const params = [req.user.id];
        if (projeto_id) { sql += ' AND op.projeto_id = ?'; params.push(Number(projeto_id)); }
        if (status) { sql += ' AND op.status = ?'; params.push(status); }
        sql += ' ORDER BY op.criado_em DESC';
        const ordens = db.prepare(sql).all(...params);
        res.json(ordens);
    } catch (err) {
        console.error('Erro listar OPs:', err);
        res.status(500).json({ error: 'Erro ao listar ordens de produção' });
    }
});

// Criar OP a partir de projeto + lote
router.post('/ordens', requireAuth, (req, res) => {
    try {
        const { projeto_id, lote_id } = req.body;
        const projId = paramInt(projeto_id);
        if (isNaN(projId)) return res.status(400).json({ error: 'projeto_id inválido' });

        const createOP = db.transaction(() => {
            // Validate projeto belongs to this user
            const projeto = db.prepare('SELECT * FROM projetos WHERE id = ? AND user_id = ?').get(projId, req.user.id);
            if (!projeto) return { notFound: true };

            // Generate sequential OP number (inside transaction = atomic)
            const lastOP = db.prepare("SELECT numero FROM ordens_producao ORDER BY id DESC LIMIT 1").get();
            let seq = 1;
            if (lastOP?.numero) {
                const match = lastOP.numero.match(/OP-(\d+)/);
                if (match) seq = parseInt(match[1], 10) + 1;
            }
            const numero = `OP-${String(seq).padStart(4, '0')}`;

            // Fetch active project version
            const versao = db.prepare(
                'SELECT id FROM projeto_versoes WHERE projeto_id = ? AND ativa = 1 ORDER BY versao DESC LIMIT 1'
            ).get(projId);

            const result = db.prepare(`
                INSERT INTO ordens_producao (projeto_id, versao_id, lote_id, numero, status, criado_por)
                VALUES (?, ?, ?, ?, 'rascunho', ?)
            `).run(projId, versao?.id || null, lote_id ? Number(lote_id) : null, numero, req.user.id);

            return { id: Number(result.lastInsertRowid), numero };
        });

        const out = createOP();
        if (out?.notFound) return res.status(404).json({ error: 'Projeto não encontrado' });

        res.json({ ok: true, id: out.id, numero: out.numero });
    } catch (err) {
        console.error('Erro criar OP:', err);
        res.status(500).json({ error: 'Erro ao criar ordem de produção' });
    }
});

// Detalhe da OP — isolado por criado_por
router.get('/ordens/:id', requireAuth, (req, res) => {
    try {
        const id = paramInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const op = db.prepare(`
            SELECT op.*, p.nome as projeto_nome, o.cliente_nome, p.orc_id,
                   l.nome as lote_nome, l.total_pecas, l.status as lote_status,
                   l.plano_json, l.aproveitamento
            FROM ordens_producao op
            LEFT JOIN projetos p ON p.id = op.projeto_id
            LEFT JOIN orcamentos o ON o.id = p.orc_id
            LEFT JOIN cnc_lotes l ON l.id = op.lote_id
            WHERE op.id = ? AND op.criado_por = ?
        `).get(id, req.user.id);

        if (!op) return res.status(404).json({ error: 'OP não encontrada' });

        let pecas = [];
        if (op.lote_id) {
            pecas = db.prepare(
                'SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY material_code, modulo_desc, descricao'
            ).all(op.lote_id);
        }

        res.json({ ...op, pecas });
    } catch (err) {
        console.error('Erro detalhe OP:', err);
        res.status(500).json({ error: 'Erro ao carregar ordem de produção' });
    }
});

// ═══════════════════════════════════════════════════════
// READINESS — Verificar prontidão fabril
// ═══════════════════════════════════════════════════════

router.get('/ordens/:id/readiness', requireAuth, (req, res) => {
    try {
        const id = paramInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const op = db.prepare(`
            SELECT op.*, l.id as lote_id
            FROM ordens_producao op
            LEFT JOIN cnc_lotes l ON l.id = op.lote_id
            WHERE op.id = ? AND op.criado_por = ?
        `).get(id, req.user.id);
        if (!op) return res.status(404).json({ error: 'OP não encontrada' });

        const checks = [];

        // 1. Peças importadas?
        const pecasCount = op.lote_id
            ? db.prepare('SELECT COUNT(*) as c FROM cnc_pecas WHERE lote_id = ?').get(op.lote_id).c
            : 0;
        checks.push({
            id: 'pecas',
            label: 'Peças importadas',
            desc: `${pecasCount} peça(s) no lote`,
            status: pecasCount > 0 ? 'ok' : 'erro',
            icon: 'package',
        });

        // 2. Materiais cadastrados na biblioteca?
        if (op.lote_id) {
            const materiaisPecas = db.prepare(`
                SELECT DISTINCT material_code FROM cnc_pecas WHERE lote_id = ? AND material_code IS NOT NULL
            `).all(op.lote_id);

            const chapas = db.prepare('SELECT DISTINCT material_code FROM cnc_chapas').all();
            const chapasCodes = new Set(chapas.map(c => c.material_code));

            const semChapa = materiaisPecas.filter(m => !chapasCodes.has(m.material_code));
            checks.push({
                id: 'materiais',
                label: 'Chapas definidas',
                desc: semChapa.length === 0
                    ? `Todos os ${materiaisPecas.length} material(is) têm chapa cadastrada`
                    : `${semChapa.length} material(is) sem chapa: ${semChapa.map(m => m.material_code).join(', ')}`,
                status: semChapa.length === 0 ? 'ok' : 'aviso',
                icon: 'layers',
            });
        }

        // 3. Máquina CNC configurada?
        const maquinas = db.prepare('SELECT COUNT(*) as c FROM cnc_maquinas').get();
        checks.push({
            id: 'maquina',
            label: 'Máquina CNC configurada',
            desc: maquinas.c > 0 ? `${maquinas.c} máquina(s) disponível(is)` : 'Nenhuma máquina CNC cadastrada',
            status: maquinas.c > 0 ? 'ok' : 'aviso',
            icon: 'cpu',
        });

        // 4. Plano de corte otimizado?
        const lote = op.lote_id
            ? db.prepare('SELECT status, plano_json, aproveitamento FROM cnc_lotes WHERE id = ?').get(op.lote_id)
            : null;
        const otimizado = lote && lote.status !== 'importado' && lote.plano_json;
        checks.push({
            id: 'otimizacao',
            label: 'Plano de corte otimizado',
            desc: otimizado
                ? `Aproveitamento: ${lote.aproveitamento || '?'}%`
                : 'Plano de corte ainda não foi gerado',
            status: otimizado ? 'ok' : 'pendente',
            icon: 'scissors',
        });

        // 5. Template de etiqueta configurado? (filtrado por user)
        const templatePadrao = db.prepare(
            'SELECT COUNT(*) as c FROM cnc_etiqueta_templates WHERE padrao = 1 AND user_id = ?'
        ).get(req.user.id);
        checks.push({
            id: 'etiquetas',
            label: 'Template de etiquetas',
            desc: templatePadrao.c > 0 ? 'Template padrão configurado' : 'Nenhum template padrão definido',
            status: templatePadrao.c > 0 ? 'ok' : 'aviso',
            icon: 'tag',
        });

        const total = checks.length;
        const ok = checks.filter(c => c.status === 'ok').length;
        const erros = checks.filter(c => c.status === 'erro').length;
        const avisos = checks.filter(c => c.status === 'aviso').length;
        const pendentes = checks.filter(c => c.status === 'pendente').length;

        const readinessJson = JSON.stringify({ checks, total, ok, erros, avisos, pendentes, verificado_em: new Date().toISOString() });
        db.prepare('UPDATE ordens_producao SET readiness_json = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(readinessJson, op.id);

        res.json({ checks, total, ok, erros, avisos, pendentes });
    } catch (err) {
        console.error('Erro readiness:', err);
        res.status(500).json({ error: 'Erro ao verificar readiness' });
    }
});

// ═══════════════════════════════════════════════════════
// OTIMIZAR — Proxy para cnc/otimizar (mantém contexto OP)
// ═══════════════════════════════════════════════════════

router.post('/ordens/:id/otimizar', requireAuth, (req, res) => {
    try {
        const id = paramInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const op = db.prepare('SELECT * FROM ordens_producao WHERE id = ? AND criado_por = ?').get(id, req.user.id);
        if (!op) return res.status(404).json({ error: 'OP não encontrada' });
        if (!op.lote_id) return res.status(400).json({ error: 'OP sem lote vinculado' });

        res.json({ ok: true, lote_id: op.lote_id, message: 'Use POST /api/cnc/otimizar/' + op.lote_id });
    } catch (err) {
        console.error('Erro otimizar OP:', err);
        res.status(500).json({ error: 'Erro ao otimizar' });
    }
});

// ═══════════════════════════════════════════════════════
// ETIQUETAS — Proxy para cnc/etiquetas
// ═══════════════════════════════════════════════════════

router.get('/ordens/:id/etiquetas', requireAuth, (req, res) => {
    try {
        const id = paramInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const op = db.prepare('SELECT lote_id FROM ordens_producao WHERE id = ? AND criado_por = ?').get(id, req.user.id);
        if (!op) return res.status(404).json({ error: 'OP não encontrada' });
        if (!op.lote_id) return res.status(400).json({ error: 'OP sem lote vinculado' });

        const etiquetas = db.prepare(`
            SELECT p.*, l.nome as lote_nome, l.cliente
            FROM cnc_pecas p
            JOIN cnc_lotes l ON l.id = p.lote_id
            WHERE p.lote_id = ?
            ORDER BY p.material_code, p.modulo_desc, p.descricao
        `).all(op.lote_id);

        res.json(etiquetas);
    } catch (err) {
        console.error('Erro etiquetas OP:', err);
        res.status(500).json({ error: 'Erro ao carregar etiquetas' });
    }
});

// ═══════════════════════════════════════════════════════
// G-CODE — Proxy para cnc/gcode
// ═══════════════════════════════════════════════════════

router.post('/ordens/:id/gcode', requireAuth, (req, res) => {
    try {
        const id = paramInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const op = db.prepare('SELECT lote_id FROM ordens_producao WHERE id = ? AND criado_por = ?').get(id, req.user.id);
        if (!op) return res.status(404).json({ error: 'OP não encontrada' });
        if (!op.lote_id) return res.status(400).json({ error: 'OP sem lote vinculado' });

        res.json({ ok: true, lote_id: op.lote_id, message: 'Use POST /api/cnc/gcode/' + op.lote_id });
    } catch (err) {
        console.error('Erro gcode OP:', err);
        res.status(500).json({ error: 'Erro ao gerar G-code' });
    }
});

// ═══════════════════════════════════════════════════════
// LIBERAR — Muda status da OP para 'liberada'
// ═══════════════════════════════════════════════════════

router.post('/ordens/:id/liberar', requireAuth, (req, res) => {
    try {
        const id = paramInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const op = db.prepare('SELECT * FROM ordens_producao WHERE id = ? AND criado_por = ?').get(id, req.user.id);
        if (!op) return res.status(404).json({ error: 'OP não encontrada' });

        // Already released?
        if (op.status === 'liberada') return res.json({ ok: true, status: 'liberada' });
        if (op.status === 'cancelada') return res.status(400).json({ error: 'OP cancelada não pode ser liberada' });

        // Pre-release validations
        if (!op.lote_id) return res.status(400).json({ error: 'OP sem lote vinculado — industrialize primeiro' });

        const lote = db.prepare('SELECT status, plano_json FROM cnc_lotes WHERE id = ?').get(op.lote_id);
        if (!lote || lote.status === 'importado') {
            return res.status(400).json({ error: 'Plano de corte não foi otimizado ainda' });
        }
        if (!lote.plano_json) {
            return res.status(400).json({ error: 'Plano de corte está vazio — re-otimize o lote' });
        }

        db.prepare('UPDATE ordens_producao SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run('liberada', op.id);

        // Notificação (best-effort)
        try {
            db.prepare(`
                INSERT INTO notificacoes (tipo, titulo, mensagem, referencia_tipo, referencia_id, ativo)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(
                'op_liberada',
                `OP ${op.numero} liberada`,
                `A ordem de produção ${op.numero} foi liberada para o chão de fábrica.`,
                'ordem_producao', op.id
            );
        } catch (_) { /* non-critical */ }

        res.json({ ok: true, status: 'liberada' });
    } catch (err) {
        console.error('Erro liberar OP:', err);
        res.status(500).json({ error: 'Erro ao liberar ordem de produção' });
    }
});

// ═══════════════════════════════════════════════════════
// IMPORTAR JSON — Criar OP a partir de JSON do SketchUp
// ═══════════════════════════════════════════════════════

router.post('/ordens/from-json', requireAuth, (req, res) => {
    try {
        const { json, nome, projeto_id } = req.body;
        if (!json) return res.status(400).json({ error: 'JSON é obrigatório' });

        const { loteInfo, pecas } = parsePluginJSON(json);
        if (pecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça encontrada no JSON' });

        const importar = db.transaction(() => {
            // 1. Criar cnc_lote
            const loteNome = nome || loteInfo.projeto || `Import SketchUp ${new Date().toLocaleDateString('pt-BR')}`;
            const loteResult = db.prepare(`
                INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, codigo, vendedor, json_original, total_pecas, projeto_id, origem)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sketchup')
            `).run(
                req.user.id, loteNome, loteInfo.cliente, loteInfo.projeto,
                loteInfo.codigo, loteInfo.vendedor,
                typeof json === 'string' ? json : JSON.stringify(json),
                pecas.length, projeto_id ? Number(projeto_id) : null
            );
            const loteId = Number(loteResult.lastInsertRowid);

            // 2. Inserir peças
            const insertPeca = db.prepare(`
                INSERT INTO cnc_pecas (lote_id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
                  produto_final, material, material_code, espessura, comprimento, largura, quantidade,
                  borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento, upmdraw, usi_a, usi_b,
                  machining_json, observacao)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            `);
            for (const p of pecas) {
                insertPeca.run(
                    loteId, p.persistent_id, p.upmcode, p.descricao, p.modulo_desc, p.modulo_id,
                    p.produto_final, p.material, p.material_code, p.espessura, p.comprimento, p.largura,
                    p.quantidade, p.borda_dir, p.borda_esq, p.borda_frontal, p.borda_traseira,
                    p.acabamento, p.upmdraw, p.usi_a, p.usi_b, p.machining_json, p.observacao
                );
            }

            // 3. Resolver projeto_id — LIKE injection safe, filtrado por user
            let finalProjetoId = projeto_id ? Number(projeto_id) : null;
            if (!finalProjetoId && (loteInfo.projeto || loteInfo.cliente)) {
                const busca = loteInfo.projeto || loteInfo.cliente;
                const safeBusca = escapeLike(busca);
                const projExistente = db.prepare(
                    'SELECT id FROM projetos WHERE user_id = ? AND nome LIKE ? ESCAPE \'\\\' ORDER BY id DESC LIMIT 1'
                ).get(req.user.id, `%${safeBusca}%`);
                if (projExistente) finalProjetoId = projExistente.id;
            }

            // 4. Criar projeto automaticamente se necessário
            if (!finalProjetoId) {
                const projNome = loteInfo.projeto || loteInfo.cliente || loteNome;
                const projResult = db.prepare(`
                    INSERT INTO projetos (user_id, nome, descricao, status)
                    VALUES (?, ?, ?, 'em_andamento')
                `).run(req.user.id, projNome, 'Projeto criado automaticamente via importação SketchUp JSON');
                finalProjetoId = Number(projResult.lastInsertRowid);
                db.prepare('UPDATE cnc_lotes SET projeto_id = ? WHERE id = ?').run(finalProjetoId, loteId);
                // Log sem PII
                console.log(`[Industrialização] Projeto criado automaticamente (id=${finalProjetoId})`);
            }

            // 5. Gerar número OP — atômico dentro da transação
            const lastOP = db.prepare("SELECT numero FROM ordens_producao ORDER BY id DESC LIMIT 1").get();
            let seq = 1;
            if (lastOP?.numero) {
                const match = lastOP.numero.match(/OP-(\d+)/);
                if (match) seq = parseInt(match[1], 10) + 1;
            }
            const numero = `OP-${String(seq).padStart(4, '0')}`;

            // 6. Criar OP
            const opResult = db.prepare(`
                INSERT INTO ordens_producao (projeto_id, lote_id, numero, status, criado_por)
                VALUES (?, ?, ?, 'rascunho', ?)
            `).run(finalProjetoId, loteId, numero, req.user.id);

            return {
                opId: Number(opResult.lastInsertRowid),
                loteId,
                numero,
                finalProjetoId,
            };
        });

        const { opId, loteId, numero, finalProjetoId } = importar();

        const materiais = [...new Set(pecas.map(p => p.material_code).filter(Boolean))];
        const modulos = [...new Set(pecas.map(p => p.modulo_desc).filter(Boolean))];
        const temMachining = pecas.some(p => p.machining_json && p.machining_json !== '{}');

        // Log sem PII (sem nomes de cliente/projeto)
        console.log(`[Industrialização] OP ${numero} criada: ${pecas.length} peças, ${materiais.length} materiais, ${modulos.length} módulos, machining: ${temMachining}`);

        res.json({
            ok: true,
            op_id: opId,
            numero,
            lote_id: loteId,
            total_pecas: pecas.length,
            materiais: materiais.length,
            modulos: modulos.length,
            tem_machining: temMachining,
            cliente: loteInfo.cliente,
            projeto: loteInfo.projeto,
        });
    } catch (err) {
        console.error('Erro criar OP de JSON:', err);
        res.status(500).json({ error: 'Erro ao importar JSON: ' + err.message });
    }
});

// Atualizar status da OP — com validação de máquina de estados
router.put('/ordens/:id/status', requireAuth, (req, res) => {
    try {
        const id = paramInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const { status: novoStatus } = req.body;
        const todosValidos = Object.keys(STATUS_TRANSITIONS);
        if (!todosValidos.includes(novoStatus)) {
            return res.status(400).json({ error: `Status inválido. Válidos: ${todosValidos.join(', ')}` });
        }

        const op = db.prepare('SELECT * FROM ordens_producao WHERE id = ? AND criado_por = ?').get(id, req.user.id);
        if (!op) return res.status(404).json({ error: 'OP não encontrada' });

        const permitidos = STATUS_TRANSITIONS[op.status] ?? [];
        if (!permitidos.includes(novoStatus)) {
            return res.status(409).json({
                error: `Transição inválida: ${op.status} → ${novoStatus}. Permitidas: ${permitidos.join(', ') || '(nenhuma)'}`,
            });
        }

        db.prepare('UPDATE ordens_producao SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(novoStatus, id);
        res.json({ ok: true, status: novoStatus });
    } catch (err) {
        console.error('Erro status OP:', err);
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
});

export default router;
