import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as gdrive from '../services/gdrive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = Router();

// MIME types map
const MIME_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain', '.csv': 'text/csv',
};

function getMime(filename) {
    return MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

// ═══════════════════════════════════════════════════
// GET /api/drive/status — verifica se Drive está configurado
// ═══════════════════════════════════════════════════
router.get('/status', requireAuth, async (req, res) => {
    const configured = gdrive.isConfigured();
    if (!configured) {
        return res.json({ configured: false, connected: false, storage: 'local' });
    }
    const test = await gdrive.testConnection();
    res.json({ configured: true, connected: test.ok, folder_name: test.folder_name, error: test.error, storage: test.ok ? 'gdrive' : 'local' });
});

// ═══════════════════════════════════════════════════
// GET /api/drive/auth-url — gera URL de autorizacao Google
// ═══════════════════════════════════════════════════
router.get('/auth-url', requireAuth, (req, res) => {
    const url = gdrive.getAuthUrl();
    if (!url) return res.status(400).json({ error: 'Configure Client ID e Client Secret antes' });
    res.json({ url });
});

// ═══════════════════════════════════════════════════
// POST /api/drive/auth-callback — troca code por refresh token
// ═══════════════════════════════════════════════════
router.post('/auth-callback', requireAuth, async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Codigo de autorizacao obrigatorio' });

    try {
        await gdrive.exchangeCode(code.trim());
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// GET /api/drive/callback — OAuth redirect do Google
// ═══════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) {
        return res.send(`<html><body><h2>Erro na autorizacao</h2><p>${error}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
    }
    if (!code) {
        return res.status(400).send('<html><body><h2>Codigo nao recebido</h2></body></html>');
    }
    try {
        await gdrive.exchangeCode(code.trim());
        res.send(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8">
            <div style="text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
                <div style="font-size:48px;margin-bottom:16px">&#10004;</div>
                <h2 style="color:#22c55e;margin:0 0 8px">Google Drive Conectado!</h2>
                <p style="color:#666">Pode fechar esta aba e voltar ao sistema.</p>
                <script>setTimeout(()=>window.close(),3000)</script>
            </div></div></body></html>`);
    } catch (err) {
        res.status(400).send(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8">
            <div style="text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
                <div style="font-size:48px;margin-bottom:16px">&#10060;</div>
                <h2 style="color:#ef4444;margin:0 0 8px">Erro</h2>
                <p style="color:#666">${err.message}</p>
            </div></div></body></html>`);
    }
});

// ═══════════════════════════════════════════════════
// GET /api/drive/test — testa conexão (config UI)
// ═══════════════════════════════════════════════════
router.get('/test', requireAuth, async (req, res) => {
    try {
        const result = await gdrive.testConnection();
        res.json(result);
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// POST /api/drive/projeto/:id/criar-pasta — cria subpasta
// ═══════════════════════════════════════════════════
router.post('/projeto/:id/criar-pasta', requireAuth, async (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const proj = db.prepare('SELECT * FROM projetos WHERE id = ?').get(projeto_id);
    if (!proj) return res.status(404).json({ error: 'Projeto nao encontrado' });

    if (gdrive.isConfigured()) {
        try {
            let nomeProjeto = proj.nome;
            if (proj.cliente_id) {
                const cli = db.prepare('SELECT nome FROM clientes WHERE id = ?').get(proj.cliente_id);
                if (cli) nomeProjeto = cli.nome;
            }
            const folders = await gdrive.setupProjectFolders(projeto_id, nomeProjeto);
            return res.json({ ok: true, folder: folders.projectFolderId, storage: 'gdrive' });
        } catch (err) {
            console.error('Drive criar-pasta erro:', err.message);
        }
    }

    // Fallback local
    const projectDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
    db.prepare('UPDATE projetos SET gdrive_folder_id = ? WHERE id = ?').run(`local:projeto_${projeto_id}`, projeto_id);
    res.json({ ok: true, folder: `local:projeto_${projeto_id}`, storage: 'local' });
});

// ═══════════════════════════════════════════════════
// GET /api/drive/projeto/:id/arquivos — lista arquivos
// ═══════════════════════════════════════════════════
router.get('/projeto/:id/arquivos', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);

    // Arquivos do banco (com ou sem Drive)
    const dbFiles = db.prepare(`
        SELECT id, nome, filename, tipo, tamanho, gdrive_file_id, criado_em as data
        FROM projeto_arquivos WHERE projeto_id = ? ORDER BY criado_em DESC
    `).all(projeto_id);

    const dbFilenames = new Set(dbFiles.map(f => f.filename));

    // Arquivos locais que nao estao no banco (retrocompatibilidade)
    const projectDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`);
    let localFiles = [];
    if (fs.existsSync(projectDir)) {
        localFiles = fs.readdirSync(projectDir)
            .filter(f => !dbFilenames.has(f) && f !== 'montador' && !fs.statSync(path.join(projectDir, f)).isDirectory())
            .map(f => {
                const stat = fs.statSync(path.join(projectDir, f));
                return {
                    nome: f, filename: f, tamanho: stat.size,
                    data: stat.mtime.toISOString(),
                    tipo: path.extname(f).slice(1).toLowerCase(),
                    gdrive_file_id: '',
                };
            });
    }

    const all = [...dbFiles, ...localFiles].map(f => ({
        ...f,
        url: `/api/drive/arquivo/${projeto_id}/${encodeURIComponent(f.filename)}`,
    })).sort((a, b) => new Date(b.data) - new Date(a.data));

    res.json(all);
});

// ═══════════════════════════════════════════════════
// POST /api/drive/projeto/:id/upload — upload de arquivo
// ═══════════════════════════════════════════════════
router.post('/projeto/:id/upload', requireAuth, async (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const { filename, data } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'Filename e data (base64) obrigatorios' });

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');
    const mime = getMime(safeName);

    if (gdrive.isConfigured()) {
        try {
            const folderId = await gdrive.getProjectDocumentosFolder(projeto_id);
            const result = await gdrive.uploadFile(folderId, safeName, mime, buffer);

            db.prepare(`
                INSERT INTO projeto_arquivos (projeto_id, user_id, nome, filename, tipo, tamanho, gdrive_file_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(projeto_id, req.user.id, safeName, safeName, path.extname(safeName).slice(1), buffer.length, result.id);

            return res.json({ ok: true, nome: safeName, storage: 'gdrive' });
        } catch (err) {
            console.error('Drive upload erro:', err.message);
            // fallback para local
        }
    }

    // Local fallback
    const projectDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, safeName), buffer);

    db.prepare(`
        INSERT INTO projeto_arquivos (projeto_id, user_id, nome, filename, tipo, tamanho, gdrive_file_id)
        VALUES (?, ?, ?, ?, ?, ?, '')
    `).run(projeto_id, req.user.id, safeName, safeName, path.extname(safeName).slice(1), buffer.length);

    res.json({ ok: true, nome: safeName, storage: 'local' });
});

// ═══════════════════════════════════════════════════
// GET /api/drive/arquivo/:projeto_id/montador/:filename — foto montador (publico)
// DEVE vir ANTES da rota generica /:filename
// ═══════════════════════════════════════════════════
router.get('/arquivo/:projeto_id/montador/:filename', async (req, res) => {
    const projeto_id = String(req.params.projeto_id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = path.basename(decodeURIComponent(req.params.filename));

    // Verificar no banco se tem gdrive_file_id
    const foto = db.prepare('SELECT gdrive_file_id FROM montador_fotos WHERE projeto_id = ? AND filename = ?').get(projeto_id, filename);

    if (foto?.gdrive_file_id) {
        try {
            const meta = await gdrive.getFileMeta(foto.gdrive_file_id);
            const stream = await gdrive.downloadFile(foto.gdrive_file_id);
            res.setHeader('Content-Type', meta.mimeType || getMime(filename));
            res.setHeader('Cache-Control', 'public, max-age=86400');
            stream.on('error', (err) => { console.error('Stream montador erro:', err.message); if (!res.headersSent) res.status(500).end(); });
            stream.pipe(res);
            return;
        } catch (err) {
            console.error('Drive download montador erro:', err.message);
            // fallback para local
        }
    }

    // Local fallback
    const filePath = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, 'montador', filename);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) return res.status(403).json({ error: 'Acesso negado' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo nao encontrado' });

    res.setHeader('Content-Type', getMime(filename));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
});

// ═══════════════════════════════════════════════════
// GET /api/drive/arquivo/:projeto_id/entrega/:filename — foto entrega digital
// DEVE vir ANTES da rota generica :filename
// ═══════════════════════════════════════════════════
router.get('/arquivo/:projeto_id/entrega/:filename', async (req, res) => {
    const projeto_id = String(req.params.projeto_id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = path.basename(decodeURIComponent(req.params.filename));

    const foto = db.prepare('SELECT gdrive_file_id FROM entrega_fotos WHERE projeto_id = ? AND filename = ?').get(projeto_id, filename);

    if (foto?.gdrive_file_id) {
        try {
            const meta = await gdrive.getFileMeta(foto.gdrive_file_id);
            const stream = await gdrive.downloadFile(foto.gdrive_file_id);
            res.setHeader('Content-Type', meta.mimeType || getMime(filename));
            res.setHeader('Cache-Control', 'public, max-age=86400');
            stream.on('error', (err) => { console.error('Stream entrega erro:', err.message); if (!res.headersSent) res.status(500).end(); });
            stream.pipe(res);
            return;
        } catch (err) {
            console.error('Drive download entrega erro:', err.message);
        }
    }

    const filePath = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, 'entrega', filename);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) return res.status(403).json({ error: 'Acesso negado' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo nao encontrado' });

    res.setHeader('Content-Type', getMime(filename));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
});

// ═══════════════════════════════════════════════════
// GET /api/drive/arquivo/:projeto_id/:filename — servir arquivo
// ═══════════════════════════════════════════════════
router.get('/arquivo/:projeto_id/:filename', async (req, res) => {
    const projeto_id = String(req.params.projeto_id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = path.basename(decodeURIComponent(req.params.filename));

    // Verificar no banco
    const arq = db.prepare('SELECT gdrive_file_id FROM projeto_arquivos WHERE projeto_id = ? AND filename = ?').get(projeto_id, filename);

    if (arq?.gdrive_file_id) {
        try {
            const meta = await gdrive.getFileMeta(arq.gdrive_file_id);
            const stream = await gdrive.downloadFile(arq.gdrive_file_id);
            res.setHeader('Content-Type', meta.mimeType || getMime(filename));
            stream.on('error', (err) => { console.error('Stream download erro:', err.message); if (!res.headersSent) res.status(500).end(); });
            stream.pipe(res);
            return;
        } catch (err) {
            console.error('Drive download erro:', err.message);
        }
    }

    // Local fallback
    const filePath = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, filename);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) return res.status(403).json({ error: 'Acesso negado' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo nao encontrado' });

    res.setHeader('Content-Type', getMime(filename));
    res.sendFile(filePath);
});

// ═══════════════════════════════════════════════════
// DELETE /api/drive/arquivo/:projeto_id/:filename — excluir arquivo
// ═══════════════════════════════════════════════════
router.delete('/arquivo/:projeto_id/:filename', requireAuth, async (req, res) => {
    const projeto_id = String(req.params.projeto_id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = path.basename(decodeURIComponent(req.params.filename));

    // Verificar no banco
    const arq = db.prepare('SELECT id, gdrive_file_id FROM projeto_arquivos WHERE projeto_id = ? AND filename = ?').get(projeto_id, filename);

    if (arq?.gdrive_file_id) {
        try { await gdrive.deleteFile(arq.gdrive_file_id); } catch (err) { console.error('Drive delete erro:', err.message); }
    }
    if (arq) {
        db.prepare('DELETE FROM projeto_arquivos WHERE id = ?').run(arq.id);
    }

    // Deletar local se existir
    const filePath = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, filename);
    const resolved = path.resolve(filePath);
    if (resolved.startsWith(path.resolve(UPLOADS_DIR)) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    res.json({ ok: true });
});

export default router;
