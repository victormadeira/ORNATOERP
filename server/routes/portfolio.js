import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'fs';
import multer from 'multer';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads', 'portfolio');
mkdirSync(UPLOADS_DIR, { recursive: true });

const portfolioStorage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (_, file, cb) => {
        const ext = file.mimetype === 'image/jpeg' ? 'jpg'
                  : file.mimetype === 'image/png'  ? 'png'
                  : file.mimetype === 'image/webp' ? 'webp'
                  : 'jpg';
        cb(null, `port-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    },
});
const portfolioUpload = multer({
    storage: portfolioStorage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB (já comprimido no client)
    fileFilter: (_, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
        cb(new Error('Tipo não permitido. Use JPG, PNG ou WebP.'));
    },
});

const router = Router();

// ═══════════════════════════════════════════════════════════════
// CONFIG pública do Portfolio — desacoplada da landing/proposta
// GET  /api/portfolio/config  — visual + textos do portfolio (sem auth)
// PUT  /api/portfolio/config  — salvar config (admin/gerente)
// ═══════════════════════════════════════════════════════════════
router.get('/config', (req, res) => {
    const row = db.prepare(`
        SELECT nome, telefone, instagram, facebook,
               logo_sistema, logo_header_path,
               portfolio_ativo, portfolio_logo,
               portfolio_tag, portfolio_titulo, portfolio_subtitulo,
               portfolio_cor_fundo, portfolio_cor_destaque,
               portfolio_wa_mensagem, portfolio_footer_texto, portfolio_cta_texto
        FROM empresa_config WHERE id = 1
    `).get();
    res.json(row || {});
});

router.put('/config', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const b = req.body || {};
    const fields = [
        'portfolio_ativo', 'portfolio_logo',
        'portfolio_tag', 'portfolio_titulo', 'portfolio_subtitulo',
        'portfolio_cor_fundo', 'portfolio_cor_destaque',
        'portfolio_wa_mensagem', 'portfolio_footer_texto', 'portfolio_cta_texto',
    ];
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
        if (f === 'portfolio_ativo') return b[f] === 0 || b[f] === false ? 0 : 1;
        return b[f] ?? '';
    });
    db.prepare(`UPDATE empresa_config SET ${setClause} WHERE id = 1`).run(...values);
    res.json({ ok: true });
});

// ── GET /api/portfolio — público (sem auth) ──────────────────────
router.get('/', (req, res) => {
    const rows = db.prepare(
        'SELECT id, titulo, designer, descricao, imagem, ordem, ambiente FROM portfolio WHERE ativo = 1 ORDER BY ordem ASC, id ASC'
    ).all();
    res.json(rows);
});

// ── POST /api/portfolio — criar item (admin/gerente) ─────────────
router.post('/', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { titulo, designer, descricao, imagem, ambiente } = req.body;
    if (!imagem) return res.status(400).json({ error: 'Imagem obrigatória' });

    const maxOrdem = db.prepare('SELECT COALESCE(MAX(ordem), 0) as m FROM portfolio').get().m;
    const info = db.prepare(
        'INSERT INTO portfolio (titulo, designer, descricao, imagem, ordem, ambiente) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(titulo || '', designer || '', descricao || '', imagem, maxOrdem + 1, ambiente || '');

    const row = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
});

// ── PUT /api/portfolio/:id — editar item (admin/gerente) ─────────
router.put('/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { titulo, designer, descricao, imagem, ambiente } = req.body;
    const row = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Item não encontrado' });

    db.prepare(
        'UPDATE portfolio SET titulo = ?, designer = ?, descricao = ?, ambiente = ? WHERE id = ?'
    ).run(titulo ?? row.titulo, designer ?? row.designer, descricao ?? row.descricao, ambiente ?? row.ambiente, req.params.id);

    if (imagem) {
        db.prepare('UPDATE portfolio SET imagem = ? WHERE id = ?').run(imagem, req.params.id);
    }

    res.json(db.prepare('SELECT * FROM portfolio WHERE id = ?').get(req.params.id));
});

// ── PUT /api/portfolio/reorder — reordenar em batch (admin/gerente) ──
router.put('/reorder', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids deve ser array' });

    const stmt = db.prepare('UPDATE portfolio SET ordem = ? WHERE id = ?');
    const tx = db.transaction(() => {
        ids.forEach((id, i) => stmt.run(i, id));
    });
    tx();
    res.json({ ok: true });
});

// ── DELETE /api/portfolio/:id — remover item (admin/gerente) ─────
router.delete('/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    db.prepare('DELETE FROM portfolio WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ── POST /api/portfolio/upload — salva foto como arquivo em disco ──────────
// Recebe multipart/form-data com campo "file"
// Retorna { url: '/uploads/portfolio/filename.jpg' }
router.post('/upload', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    portfolioUpload.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        res.json({ url: `/uploads/portfolio/${req.file.filename}` });
    });
});

// ── POST /api/portfolio/migrate — converte base64 existentes para arquivo ──
// Converte todos os itens do portfolio que ainda têm imagem em base64 para
// arquivos em disco, atualizando a URL no banco.
router.post('/migrate', requireAuth, requireRole('admin', 'gerente'), async (req, res) => {
    const rows = db.prepare('SELECT id, imagem FROM portfolio WHERE ativo = 1').all();
    let converted = 0;
    let skipped = 0;
    let errors = 0;
    let counter = 0;

    for (const row of rows) {
        if (!row.imagem || !row.imagem.startsWith('data:image/')) {
            skipped++;
            continue;
        }
        try {
            const match = row.imagem.match(/^data:image\/(\w+);base64,(.+)$/s);
            if (!match) { skipped++; continue; }
            const rawExt = match[1] === 'jpeg' ? 'jpg' : match[1] === 'svg+xml' ? 'svg' : match[1];
            const ext = ['jpg', 'png', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg';
            const buffer = Buffer.from(match[2], 'base64');
            const filename = `port-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
            writeFileSync(join(UPLOADS_DIR, filename), buffer);
            db.prepare('UPDATE portfolio SET imagem = ? WHERE id = ?').run(
                `/uploads/portfolio/${filename}`, row.id
            );
            converted++;
        } catch (e) {
            errors++;
        }
    }

    res.json({ ok: true, converted, skipped, errors });
});

export default router;
