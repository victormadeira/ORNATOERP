// ═══════════════════════════════════════════════════════
// Oficina — Kanban de Produção (chão de fábrica)
// ═══════════════════════════════════════════════════════
import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// ─── Schema (cria tabelas se não existirem) ────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS oficina_tarefas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id    INTEGER,
    projeto_nome  TEXT    NOT NULL DEFAULT '',
    cliente_nome  TEXT    NOT NULL DEFAULT '',
    ambiente      TEXT    NOT NULL,
    descricao     TEXT    DEFAULT '',
    etapa         TEXT    NOT NULL DEFAULT 'corte',
    responsavel   TEXT    DEFAULT '',
    cor           TEXT    DEFAULT '#C9A96E',
    prazo         TEXT    DEFAULT NULL,
    posicao       INTEGER DEFAULT 0,
    criado_em     TEXT    DEFAULT (datetime('now')),
    atualizado_em TEXT    DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS oficina_checklist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tarefa_id  INTEGER NOT NULL REFERENCES oficina_tarefas(id) ON DELETE CASCADE,
    texto      TEXT    NOT NULL,
    feito      INTEGER DEFAULT 0,
    posicao    INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS oficina_comentarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tarefa_id  INTEGER NOT NULL REFERENCES oficina_tarefas(id) ON DELETE CASCADE,
    autor      TEXT    NOT NULL DEFAULT 'Equipe',
    conteudo   TEXT    NOT NULL,
    criado_em  TEXT    DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS oficina_anexos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tarefa_id  INTEGER NOT NULL REFERENCES oficina_tarefas(id) ON DELETE CASCADE,
    nome       TEXT    NOT NULL,
    url        TEXT    NOT NULL,
    tipo       TEXT    DEFAULT 'link',
    criado_em  TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Helpers ──────────────────────────────────────────
const listQ = `
  SELECT t.*,
    (SELECT COUNT(*) FROM oficina_checklist  c WHERE c.tarefa_id = t.id)               AS checklist_total,
    (SELECT COUNT(*) FROM oficina_checklist  c WHERE c.tarefa_id = t.id AND c.feito=1) AS checklist_done,
    (SELECT COUNT(*) FROM oficina_anexos     a WHERE a.tarefa_id = t.id)               AS anexos_count,
    (SELECT COUNT(*) FROM oficina_comentarios k WHERE k.tarefa_id = t.id)              AS comentarios_count
  FROM oficina_tarefas t
`;

// ─── GET / — lista todas as tarefas ───────────────────
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(listQ + ' ORDER BY t.etapa, t.posicao, t.id').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST / — cria tarefa ─────────────────────────────
router.post('/', (req, res) => {
  try {
    const { projeto_id, projeto_nome, cliente_nome, ambiente, descricao,
            etapa = 'corte', responsavel, cor = '#C9A96E', prazo } = req.body;
    if (!ambiente?.trim()) return res.status(400).json({ error: 'Ambiente obrigatório' });
    const maxPos = db.prepare('SELECT MAX(posicao) AS m FROM oficina_tarefas WHERE etapa = ?').get(etapa);
    const posicao = (maxPos?.m ?? -1) + 1;
    const r = db.prepare(`
      INSERT INTO oficina_tarefas
        (projeto_id,projeto_nome,cliente_nome,ambiente,descricao,etapa,responsavel,cor,prazo,posicao)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(projeto_id ?? null, projeto_nome ?? '', cliente_nome ?? '',
           ambiente.trim(), descricao ?? '', etapa, responsavel ?? '',
           cor, prazo ?? null, posicao);
    res.json(db.prepare(listQ + ' WHERE t.id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /:id — detalhe completo ──────────────────────
router.get('/:id', (req, res) => {
  try {
    const t = db.prepare('SELECT * FROM oficina_tarefas WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Não encontrado' });
    t.checklist   = db.prepare('SELECT * FROM oficina_checklist   WHERE tarefa_id = ? ORDER BY posicao, id').all(t.id);
    t.comentarios = db.prepare('SELECT * FROM oficina_comentarios WHERE tarefa_id = ? ORDER BY criado_em').all(t.id);
    t.anexos      = db.prepare('SELECT * FROM oficina_anexos      WHERE tarefa_id = ? ORDER BY criado_em').all(t.id);
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PUT /:id — atualiza tarefa ───────────────────────
router.put('/:id', (req, res) => {
  try {
    const { projeto_id, projeto_nome, cliente_nome, ambiente, descricao,
            etapa, responsavel, cor, prazo } = req.body;
    db.prepare(`
      UPDATE oficina_tarefas
      SET projeto_id=?,projeto_nome=?,cliente_nome=?,ambiente=?,descricao=?,
          etapa=?,responsavel=?,cor=?,prazo=?,atualizado_em=datetime('now')
      WHERE id=?
    `).run(projeto_id ?? null, projeto_nome ?? '', cliente_nome ?? '',
           ambiente ?? '', descricao ?? '', etapa ?? 'corte', responsavel ?? '',
           cor ?? '#C9A96E', prazo ?? null, req.params.id);
    res.json(db.prepare(listQ + ' WHERE t.id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DELETE /:id ──────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM oficina_tarefas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:id/etapa — move coluna ──────────────────
router.patch('/:id/etapa', (req, res) => {
  try {
    const { etapa } = req.body;
    if (!etapa) return res.status(400).json({ error: 'etapa obrigatória' });
    const maxPos = db.prepare('SELECT MAX(posicao) AS m FROM oficina_tarefas WHERE etapa = ?').get(etapa);
    const posicao = (maxPos?.m ?? -1) + 1;
    db.prepare(`UPDATE oficina_tarefas SET etapa=?,posicao=?,atualizado_em=datetime('now') WHERE id=?`)
      .run(etapa, posicao, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Checklist ────────────────────────────────────────
router.post('/:id/checklist', (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ error: 'Texto obrigatório' });
    const maxPos = db.prepare('SELECT MAX(posicao) AS m FROM oficina_checklist WHERE tarefa_id = ?').get(req.params.id);
    const r = db.prepare('INSERT INTO oficina_checklist (tarefa_id,texto,posicao) VALUES (?,?,?)')
      .run(req.params.id, texto.trim(), (maxPos?.m ?? -1) + 1);
    res.json(db.prepare('SELECT * FROM oficina_checklist WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/checklist/:cid', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM oficina_checklist WHERE id = ?').get(req.params.cid);
    if (!item) return res.status(404).json({ error: 'Não encontrado' });
    db.prepare('UPDATE oficina_checklist SET feito=? WHERE id=?').run(item.feito ? 0 : 1, req.params.cid);
    res.json(db.prepare('SELECT * FROM oficina_checklist WHERE id = ?').get(req.params.cid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/checklist/:cid', (req, res) => {
  try {
    db.prepare('DELETE FROM oficina_checklist WHERE id = ?').run(req.params.cid);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Comentários ─────────────────────────────────────
router.post('/:id/comentarios', (req, res) => {
  try {
    const { autor, conteudo } = req.body;
    if (!conteudo?.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });
    const r = db.prepare('INSERT INTO oficina_comentarios (tarefa_id,autor,conteudo) VALUES (?,?,?)')
      .run(req.params.id, autor || 'Equipe', conteudo.trim());
    res.json(db.prepare('SELECT * FROM oficina_comentarios WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/comentarios/:cid', (req, res) => {
  try {
    db.prepare('DELETE FROM oficina_comentarios WHERE id = ?').run(req.params.cid);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Anexos ───────────────────────────────────────────
router.post('/:id/anexos', (req, res) => {
  try {
    const { nome, url, tipo = 'link' } = req.body;
    if (!url?.trim()) return res.status(400).json({ error: 'URL obrigatória' });
    const r = db.prepare('INSERT INTO oficina_anexos (tarefa_id,nome,url,tipo) VALUES (?,?,?,?)')
      .run(req.params.id, nome || url, url.trim(), tipo);
    res.json(db.prepare('SELECT * FROM oficina_anexos WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/anexos/:aid', (req, res) => {
  try {
    db.prepare('DELETE FROM oficina_anexos WHERE id = ?').run(req.params.aid);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Utilitário: projetos para autocomplete ───────────
router.get('/util/projetos', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.nome, c.nome AS cliente_nome
      FROM projetos p LEFT JOIN clientes c ON c.id = p.cliente_id
      ORDER BY p.criado_em DESC LIMIT 60
    `).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
