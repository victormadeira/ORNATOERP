import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGzip } from 'zlib';
import { Readable } from 'stream';
import db from '../db.js';
import * as gdrive from './gdrive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '..', 'marcenaria.db');

const MAX_BACKUPS = 30;

// ─── Backup do banco para o Google Drive ─────────────
export async function backupToDrive() {
    if (!gdrive.isConfigured()) {
        throw new Error('Google Drive não configurado');
    }

    // 1. Ler o banco de dados
    const dbBuffer = readFileSync(DB_PATH);

    // 2. Comprimir com gzip
    const compressed = await gzipBuffer(dbBuffer);

    // 3. Garantir pasta Backups no Drive
    const drive = gdrive.getClient();
    if (!drive) throw new Error('Falha ao obter client do Drive');

    const cfg = db.prepare('SELECT gdrive_folder_id FROM empresa_config WHERE id = 1').get() || {};
    if (!cfg.gdrive_folder_id) throw new Error('Pasta raiz do Drive não configurada');

    const backupsFolderId = await gdrive.ensureFolder(cfg.gdrive_folder_id, 'Backups');

    // 4. Nome com data/hora
    const now = new Date();
    const ts = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const fileName = `backup-${ts}.db.gz`;

    // 5. Upload
    const result = await gdrive.uploadFile(backupsFolderId, fileName, 'application/gzip', compressed);

    // 6. Limpar backups antigos (manter últimos MAX_BACKUPS)
    await cleanOldBackups(drive, backupsFolderId);

    const sizeMB = (compressed.length / 1024 / 1024).toFixed(2);
    console.log(`[Backup] ${fileName} enviado ao Drive (${sizeMB} MB)`);

    return {
        ok: true,
        fileName,
        fileId: result.id,
        sizeMB: parseFloat(sizeMB),
        timestamp: now.toISOString(),
    };
}

// ─── Listar backups existentes ───────────────────────
export async function listBackups() {
    if (!gdrive.isConfigured()) return [];

    const drive = gdrive.getClient();
    if (!drive) return [];

    const cfg = db.prepare('SELECT gdrive_folder_id FROM empresa_config WHERE id = 1').get() || {};
    if (!cfg.gdrive_folder_id) return [];

    const backupsFolderId = await gdrive.ensureFolder(cfg.gdrive_folder_id, 'Backups');

    const resp = await drive.files.list({
        q: `'${backupsFolderId}' in parents and trashed = false`,
        fields: 'files(id, name, size, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 50,
    });

    return resp.data.files.map(f => ({
        id: f.id,
        name: f.name,
        sizeMB: (parseInt(f.size || '0') / 1024 / 1024).toFixed(2),
        date: f.createdTime,
    }));
}

// ─── Cron: agendar backup diário ─────────────────────
let _backupTimer = null;
let _backupInterval = null;

export function iniciarBackupDiario() {
    if (_backupTimer || _backupInterval) return;

    // Calcular ms até às 3h da manhã
    const agora = new Date();
    const proxima3h = new Date(agora);
    proxima3h.setHours(3, 0, 0, 0);
    if (proxima3h <= agora) proxima3h.setDate(proxima3h.getDate() + 1);

    const msAte3h = proxima3h - agora;
    console.log(`[Backup] Próximo backup automático em ${Math.round(msAte3h / 60000)} min`);

    // Primeiro disparo: às 3h
    _backupTimer = setTimeout(() => {
        executarBackupSilencioso();
        // Depois: a cada 24h
        _backupInterval = setInterval(executarBackupSilencioso, 24 * 60 * 60 * 1000);
    }, msAte3h);
}

async function executarBackupSilencioso() {
    try {
        await backupToDrive();
    } catch (err) {
        console.error('[Backup] Erro no backup automático:', err.message);
    }
}

// ─── Helpers ─────────────────────────────────────────
function gzipBuffer(buffer) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const gzip = createGzip({ level: 6 });
        const input = new Readable();
        input.push(buffer);
        input.push(null);
        input.pipe(gzip);
        gzip.on('data', chunk => chunks.push(chunk));
        gzip.on('end', () => resolve(Buffer.concat(chunks)));
        gzip.on('error', reject);
    });
}

async function cleanOldBackups(drive, folderId) {
    try {
        const resp = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
            pageSize: 100,
        });

        const files = resp.data.files;
        if (files.length <= MAX_BACKUPS) return;

        const toDelete = files.slice(MAX_BACKUPS);
        for (const f of toDelete) {
            await drive.files.update({ fileId: f.id, requestBody: { trashed: true } });
            console.log(`[Backup] Removido backup antigo: ${f.name}`);
        }
    } catch (err) {
        console.error('[Backup] Erro ao limpar backups antigos:', err.message);
    }
}
