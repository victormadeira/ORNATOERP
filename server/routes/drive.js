import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

// Garante que o diretório de uploads existe
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = Router();

// ═══════════════════════════════════════════════════
// GET /api/drive/status — verifica se Drive está configurado
// ═══════════════════════════════════════════════════
router.get('/status', requireAuth, (req, res) => {
    const cfg = db.prepare('SELECT gdrive_credentials, gdrive_folder_id FROM empresa_config WHERE id = 1').get();
    const configured = !!(cfg?.gdrive_credentials && cfg?.gdrive_folder_id);
    res.json({ configured, has_credentials: !!cfg?.gdrive_credentials, has_folder: !!cfg?.gdrive_folder_id });
});

// ═══════════════════════════════════════════════════
// POST /api/drive/projeto/:id/criar-pasta — cria subpasta no Drive
// (por agora, cria uma pasta local; quando o Google Drive for configurado, migrará)
// ═══════════════════════════════════════════════════
router.post('/projeto/:id/criar-pasta', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const proj = db.prepare('SELECT * FROM projetos WHERE id = ?').get(projeto_id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Criar diretório local para o projeto
    const projectDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    // Salvar referência (no futuro será o ID da pasta no Google Drive)
    db.prepare('UPDATE projetos SET gdrive_folder_id = ? WHERE id = ?')
        .run(`local:projeto_${projeto_id}`, projeto_id);

    res.json({ ok: true, folder: `local:projeto_${projeto_id}` });
});

// ═══════════════════════════════════════════════════
// GET /api/drive/projeto/:id/arquivos — lista arquivos
// ═══════════════════════════════════════════════════
router.get('/projeto/:id/arquivos', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const projectDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`);

    if (!fs.existsSync(projectDir)) return res.json([]);

    const files = fs.readdirSync(projectDir).map(f => {
        const stat = fs.statSync(path.join(projectDir, f));
        return {
            nome: f,
            tamanho: stat.size,
            data: stat.mtime.toISOString(),
            tipo: path.extname(f).slice(1).toLowerCase(),
            url: `/api/drive/arquivo/${projeto_id}/${encodeURIComponent(f)}`,
        };
    }).sort((a, b) => new Date(b.data) - new Date(a.data));

    res.json(files);
});

// ═══════════════════════════════════════════════════
// POST /api/drive/projeto/:id/upload — upload de arquivo (base64)
// ═══════════════════════════════════════════════════
router.post('/projeto/:id/upload', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const { filename, data } = req.body;

    if (!filename || !data) return res.status(400).json({ error: 'Filename e data (base64) obrigatórios' });

    const projectDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    // Sanitizar nome do arquivo
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(projectDir, safeName);

    // Extrair dados base64 (pode vir como "data:image/png;base64,XXXX")
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    res.json({ ok: true, nome: safeName });
});

// ═══════════════════════════════════════════════════
// GET /api/drive/arquivo/:projeto_id/:filename — servir arquivo
// ═══════════════════════════════════════════════════
router.get('/arquivo/:projeto_id/:filename', (req, res) => {
    const projeto_id = String(req.params.projeto_id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = path.basename(decodeURIComponent(req.params.filename));
    const filePath = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, filename);

    // Proteção contra path traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.pdf': 'application/pdf', '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.txt': 'text/plain', '.csv': 'text/csv',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.sendFile(filePath);
});

// ═══════════════════════════════════════════════════
// DELETE /api/drive/arquivo/:projeto_id/:filename — excluir arquivo
// ═══════════════════════════════════════════════════
router.delete('/arquivo/:projeto_id/:filename', requireAuth, (req, res) => {
    const projeto_id = String(req.params.projeto_id).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = path.basename(decodeURIComponent(req.params.filename));
    const filePath = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, filename);

    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

    fs.unlinkSync(filePath);
    res.json({ ok: true });
});

export default router;
