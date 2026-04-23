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
  CREATE TABLE IF NOT EXISTS oficina_marceneiros (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT    NOT NULL,
    cor           TEXT    DEFAULT '#C9A96E',
    foto          TEXT    DEFAULT '',
    especialidade TEXT    DEFAULT '',
    ativo         INTEGER DEFAULT 1,
    posicao       INTEGER DEFAULT 0,
    criado_em     TEXT    DEFAULT (datetime('now'))
  );
`);

// ─── Migrations idempotentes ──────────────────────────────────
try {
  const cols = db.prepare(`PRAGMA table_info(oficina_tarefas)`).all().map(c => c.name);
  if (!cols.includes('marceneiro_id'))    db.exec(`ALTER TABLE oficina_tarefas ADD COLUMN marceneiro_id    INTEGER DEFAULT NULL`);
  if (!cols.includes('status'))           db.exec(`ALTER TABLE oficina_tarefas ADD COLUMN status           TEXT    DEFAULT 'pendente'`);
  if (!cols.includes('iniciado_em'))      db.exec(`ALTER TABLE oficina_tarefas ADD COLUMN iniciado_em      TEXT    DEFAULT NULL`);
  if (!cols.includes('bloqueio_motivo'))  db.exec(`ALTER TABLE oficina_tarefas ADD COLUMN bloqueio_motivo  TEXT    DEFAULT ''`);
  if (!cols.includes('tempo_total_min'))  db.exec(`ALTER TABLE oficina_tarefas ADD COLUMN tempo_total_min  INTEGER DEFAULT 0`);
} catch (e) { /* migration best-effort */ }

// ─── Tabela de templates de checklist por etapa ───────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS oficina_checklist_templates (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    etapa    TEXT    NOT NULL,
    texto    TEXT    NOT NULL,
    posicao  INTEGER DEFAULT 0
  );
`);

// Seed: templates padrão (só se tabela vazia)
const tplCount = db.prepare('SELECT COUNT(*) AS n FROM oficina_checklist_templates').get().n;
if (tplCount === 0) {
  const defaults = [
    ['corte',        'Conferir plano de corte'],
    ['corte',        'Cortar peças'],
    ['corte',        'Etiquetar peças'],
    ['corte',        'Organizar em carrinho'],
    ['cola_borda',   'Verificar fita disponível'],
    ['cola_borda',   'Colar bordas'],
    ['cola_borda',   'Refilar bordas'],
    ['pre_montagem', 'Conferir peças completas'],
    ['pre_montagem', 'Furar conforme projeto'],
    ['pre_montagem', 'Montar e conferir esquadro'],
    ['acabamento',   'Lixar superfícies'],
    ['acabamento',   'Aplicar acabamento'],
    ['acabamento',   'Conferir qualidade final'],
    ['expedicao',    'Embalar peças'],
    ['expedicao',    'Conferir lista de entrega'],
    ['expedicao',    'Registrar expedição'],
  ];
  const ins = db.prepare('INSERT INTO oficina_checklist_templates (etapa, texto, posicao) VALUES (?,?,?)');
  defaults.forEach(([etapa, texto], i) => ins.run(etapa, texto, i));
}

// ─── Helpers ──────────────────────────────────────────
const listQ = `
  SELECT t.*,
    m.nome AS marceneiro_nome,
    m.cor  AS marceneiro_cor,
    m.foto AS marceneiro_foto,
    (SELECT COUNT(*) FROM oficina_checklist  c WHERE c.tarefa_id = t.id)               AS checklist_total,
    (SELECT COUNT(*) FROM oficina_checklist  c WHERE c.tarefa_id = t.id AND c.feito=1) AS checklist_done,
    (SELECT COUNT(*) FROM oficina_anexos     a WHERE a.tarefa_id = t.id)               AS anexos_count,
    (SELECT COUNT(*) FROM oficina_comentarios k WHERE k.tarefa_id = t.id)              AS comentarios_count
  FROM oficina_tarefas t
  LEFT JOIN oficina_marceneiros m ON m.id = t.marceneiro_id
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
            etapa = 'corte', responsavel, marceneiro_id, cor = '#C9A96E', prazo } = req.body;
    if (!ambiente?.trim()) return res.status(400).json({ error: 'Ambiente obrigatório' });
    const maxPos = db.prepare('SELECT MAX(posicao) AS m FROM oficina_tarefas WHERE etapa = ?').get(etapa);
    const posicao = (maxPos?.m ?? -1) + 1;
    const r = db.prepare(`
      INSERT INTO oficina_tarefas
        (projeto_id,projeto_nome,cliente_nome,ambiente,descricao,etapa,responsavel,marceneiro_id,cor,prazo,posicao)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(projeto_id ?? null, projeto_nome ?? '', cliente_nome ?? '',
           ambiente.trim(), descricao ?? '', etapa, responsavel ?? '',
           marceneiro_id ?? null, cor, prazo ?? null, posicao);

    // Aplica template de checklist da etapa inicial (se houver)
    const tids = r.lastInsertRowid;
    const templates = db.prepare('SELECT * FROM oficina_checklist_templates WHERE etapa = ? ORDER BY posicao').all(etapa);
    if (templates.length > 0) {
      const ins = db.prepare('INSERT INTO oficina_checklist (tarefa_id, texto, posicao) VALUES (?,?,?)');
      templates.forEach((t, i) => ins.run(tids, t.texto, i));
    }

    res.json(db.prepare(listQ + ' WHERE t.id = ?').get(tids));
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
            etapa, responsavel, marceneiro_id, cor, prazo } = req.body;
    db.prepare(`
      UPDATE oficina_tarefas
      SET projeto_id=?,projeto_nome=?,cliente_nome=?,ambiente=?,descricao=?,
          etapa=?,responsavel=?,marceneiro_id=?,cor=?,prazo=?,atualizado_em=datetime('now')
      WHERE id=?
    `).run(projeto_id ?? null, projeto_nome ?? '', cliente_nome ?? '',
           ambiente ?? '', descricao ?? '', etapa ?? 'corte', responsavel ?? '',
           marceneiro_id ?? null, cor ?? '#C9A96E', prazo ?? null, req.params.id);
    res.json(db.prepare(listQ + ' WHERE t.id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:id/marceneiro — atribuir rápido ──────────
router.patch('/:id/marceneiro', (req, res) => {
  try {
    const { marceneiro_id } = req.body;
    db.prepare(`UPDATE oficina_tarefas SET marceneiro_id=?, atualizado_em=datetime('now') WHERE id=?`)
      .run(marceneiro_id ?? null, req.params.id);
    res.json(db.prepare(listQ + ' WHERE t.id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PATCH /:id/status — ação de produção ─────────────
// acao: 'iniciar' | 'pausar' | 'retomar' | 'bloquear' | 'desbloquear'
// motivo: obrigatório quando acao = 'bloquear'
router.patch('/:id/status', (req, res) => {
  try {
    const { acao, motivo = '' } = req.body;
    const tarefa = db.prepare('SELECT * FROM oficina_tarefas WHERE id = ?').get(req.params.id);
    if (!tarefa) return res.status(404).json({ error: 'Não encontrado' });

    let novoStatus = tarefa.status;
    let iniciado   = tarefa.iniciado_em;
    let bloqueioMotivo = tarefa.bloqueio_motivo;
    let tempoTotal = tarefa.tempo_total_min || 0;

    if (acao === 'iniciar' || acao === 'retomar') {
      novoStatus = 'ativo';
      if (!iniciado) iniciado = new Date().toISOString();  // só guarda 1ª vez
      bloqueioMotivo = '';
    } else if (acao === 'pausar') {
      // Acumula tempo (desde a última vez que ficou ativo)
      if (tarefa.status === 'ativo' && iniciado) {
        const minutes = Math.floor((Date.now() - new Date(iniciado)) / 60000);
        tempoTotal += Math.max(0, minutes);
      }
      novoStatus = 'pausado';
    } else if (acao === 'bloquear') {
      novoStatus = 'bloqueado';
      bloqueioMotivo = motivo || 'Sem motivo informado';
    } else if (acao === 'desbloquear') {
      novoStatus = tarefa.status === 'bloqueado' ? 'pausado' : tarefa.status;
      bloqueioMotivo = '';
    } else {
      return res.status(400).json({ error: `Ação desconhecida: ${acao}` });
    }

    db.prepare(`
      UPDATE oficina_tarefas
      SET status=?, iniciado_em=?, bloqueio_motivo=?, tempo_total_min=?, atualizado_em=datetime('now')
      WHERE id=?
    `).run(novoStatus, iniciado ?? null, bloqueioMotivo, tempoTotal, req.params.id);

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
    const { etapa, aplicar_template = true } = req.body;
    if (!etapa) return res.status(400).json({ error: 'etapa obrigatória' });
    const maxPos = db.prepare('SELECT MAX(posicao) AS m FROM oficina_tarefas WHERE etapa = ?').get(etapa);
    const posicao = (maxPos?.m ?? -1) + 1;
    // Reset status ao mover (novo estágio = pendente)
    db.prepare(`UPDATE oficina_tarefas SET etapa=?, posicao=?, status='pendente', atualizado_em=datetime('now') WHERE id=?`)
      .run(etapa, posicao, req.params.id);

    // Aplica template de checklist da nova etapa (se não tiver itens ainda para esta etapa)
    if (aplicar_template) {
      const templates = db.prepare('SELECT * FROM oficina_checklist_templates WHERE etapa = ? ORDER BY posicao').all(etapa);
      if (templates.length > 0) {
        // Verifica se já tem checklist; só adiciona se vazio
        const existentes = db.prepare('SELECT COUNT(*) AS n FROM oficina_checklist WHERE tarefa_id = ?').get(req.params.id).n;
        if (existentes === 0) {
          const ins = db.prepare('INSERT INTO oficina_checklist (tarefa_id, texto, posicao) VALUES (?,?,?)');
          templates.forEach((t, i) => ins.run(req.params.id, t.texto, i));
        }
      }
    }
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

// ═══════════════════════════════════════════════════════
// Marceneiros (equipe da oficina)
// ═══════════════════════════════════════════════════════

// GET lista — default só ativos, ?todos=1 retorna inativos também
router.get('/marceneiros/list', (req, res) => {
  try {
    const todos = req.query.todos === '1';
    const rows = db.prepare(
      `SELECT m.*,
         (SELECT COUNT(*) FROM oficina_tarefas t WHERE t.marceneiro_id = m.id) AS total_cards
       FROM oficina_marceneiros m
       ${todos ? '' : 'WHERE m.ativo = 1'}
       ORDER BY m.posicao, m.nome`
    ).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — cria
router.post('/marceneiros/list', (req, res) => {
  try {
    const { nome, cor = '#C9A96E', foto = '', especialidade = '' } = req.body;
    if (!nome?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    const maxPos = db.prepare('SELECT MAX(posicao) AS m FROM oficina_marceneiros').get();
    const r = db.prepare(
      `INSERT INTO oficina_marceneiros (nome, cor, foto, especialidade, posicao)
       VALUES (?,?,?,?,?)`
    ).run(nome.trim(), cor, foto, especialidade, (maxPos?.m ?? -1) + 1);
    res.json(db.prepare('SELECT * FROM oficina_marceneiros WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT — atualiza
router.put('/marceneiros/list/:id', (req, res) => {
  try {
    const { nome, cor, foto, especialidade, ativo } = req.body;
    db.prepare(
      `UPDATE oficina_marceneiros SET nome=?, cor=?, foto=?, especialidade=?, ativo=? WHERE id=?`
    ).run(nome ?? '', cor ?? '#C9A96E', foto ?? '', especialidade ?? '',
          ativo === undefined ? 1 : (ativo ? 1 : 0), req.params.id);
    res.json(db.prepare('SELECT * FROM oficina_marceneiros WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE — deleta (zera marceneiro_id das tarefas primeiro)
router.delete('/marceneiros/list/:id', (req, res) => {
  try {
    db.prepare('UPDATE oficina_tarefas SET marceneiro_id = NULL WHERE marceneiro_id = ?').run(req.params.id);
    db.prepare('DELETE FROM oficina_marceneiros WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// Templates de checklist por etapa
// ═══════════════════════════════════════════════════════════════

// GET todos os templates (agrupados por etapa no cliente)
router.get('/templates/checklist', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM oficina_checklist_templates ORDER BY etapa, posicao, id').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — cria template
router.post('/templates/checklist', (req, res) => {
  try {
    const { etapa, texto } = req.body;
    if (!etapa || !texto?.trim()) return res.status(400).json({ error: 'etapa e texto obrigatórios' });
    const maxPos = db.prepare('SELECT MAX(posicao) AS m FROM oficina_checklist_templates WHERE etapa = ?').get(etapa);
    const r = db.prepare('INSERT INTO oficina_checklist_templates (etapa, texto, posicao) VALUES (?,?,?)')
      .run(etapa, texto.trim(), (maxPos?.m ?? -1) + 1);
    res.json(db.prepare('SELECT * FROM oficina_checklist_templates WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT — atualiza
router.put('/templates/checklist/:tid', (req, res) => {
  try {
    const { texto } = req.body;
    db.prepare('UPDATE oficina_checklist_templates SET texto = ? WHERE id = ?').run(texto ?? '', req.params.tid);
    res.json(db.prepare('SELECT * FROM oficina_checklist_templates WHERE id = ?').get(req.params.tid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
router.delete('/templates/checklist/:tid', (req, res) => {
  try {
    db.prepare('DELETE FROM oficina_checklist_templates WHERE id = ?').run(req.params.tid);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — aplica manualmente o template de uma etapa a um card (zera checklist + recria)
router.post('/:id/aplicar-template', (req, res) => {
  try {
    const { etapa } = req.body;
    const templates = db.prepare('SELECT * FROM oficina_checklist_templates WHERE etapa = ? ORDER BY posicao').all(etapa);
    // Remove checklist atual
    db.prepare('DELETE FROM oficina_checklist WHERE tarefa_id = ?').run(req.params.id);
    const ins = db.prepare('INSERT INTO oficina_checklist (tarefa_id, texto, posicao) VALUES (?,?,?)');
    templates.forEach((t, i) => ins.run(req.params.id, t.texto, i));
    res.json({
      ok: true,
      checklist: db.prepare('SELECT * FROM oficina_checklist WHERE tarefa_id = ? ORDER BY posicao').all(req.params.id)
    });
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
