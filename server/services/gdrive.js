import { google } from 'googleapis';
import db from '../db.js';

// ═══════════════════════════════════════════════════════
// Google Drive Service — OAuth 2.0 (conta pessoal)
// ═══════════════════════════════════════════════════════

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function getRedirectUri() {
    const host = process.env.PUBLIC_URL || 'https://gestaoornato.com';
    return `${host}/api/drive/callback`;
}

// Cache do client autenticado
let _cachedClient = null;
let _cachedCreds = null;

// Cache de folder IDs (parentId:name → folderId)
const folderCache = new Map();

// ─── Config helpers ──────────────────────────────────
function getConfig() {
    return db.prepare(`
        SELECT gdrive_client_id, gdrive_client_secret, gdrive_refresh_token, gdrive_folder_id
        FROM empresa_config WHERE id = 1
    `).get() || {};
}

// ─── isConfigured ────────────────────────────────────
export function isConfigured() {
    const cfg = getConfig();
    return !!(cfg.gdrive_client_id && cfg.gdrive_client_secret && cfg.gdrive_refresh_token && cfg.gdrive_folder_id);
}

// ─── getAuthUrl ──────────────────────────────────────
export function getAuthUrl() {
    const cfg = getConfig();
    if (!cfg.gdrive_client_id || !cfg.gdrive_client_secret) return null;

    const oauth2 = new google.auth.OAuth2(cfg.gdrive_client_id, cfg.gdrive_client_secret, getRedirectUri());
    return oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
    });
}

// ─── exchangeCode ────────────────────────────────────
export async function exchangeCode(code) {
    const cfg = getConfig();
    if (!cfg.gdrive_client_id || !cfg.gdrive_client_secret) {
        throw new Error('Client ID e Client Secret devem ser configurados primeiro');
    }

    const oauth2 = new google.auth.OAuth2(cfg.gdrive_client_id, cfg.gdrive_client_secret, getRedirectUri());
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.refresh_token) {
        throw new Error('Refresh token nao recebido. Tente revogar o acesso em myaccount.google.com/permissions e autorizar novamente.');
    }

    // Salvar refresh token no banco
    db.prepare('UPDATE empresa_config SET gdrive_refresh_token = ? WHERE id = 1').run(tokens.refresh_token);

    // Invalidar cache
    _cachedClient = null;
    _cachedCreds = null;

    return { ok: true };
}

// ─── getClient (Drive v3) ────────────────────────────
export function getClient() {
    const cfg = getConfig();
    if (!cfg.gdrive_client_id || !cfg.gdrive_client_secret || !cfg.gdrive_refresh_token) return null;

    // Retorna cache se credenciais nao mudaram
    const credsKey = `${cfg.gdrive_client_id}:${cfg.gdrive_client_secret}:${cfg.gdrive_refresh_token}`;
    if (_cachedClient && _cachedCreds === credsKey) return _cachedClient;

    const oauth2 = new google.auth.OAuth2(cfg.gdrive_client_id, cfg.gdrive_client_secret, getRedirectUri());
    oauth2.setCredentials({ refresh_token: cfg.gdrive_refresh_token });

    _cachedClient = google.drive({ version: 'v3', auth: oauth2 });
    _cachedCreds = credsKey;
    return _cachedClient;
}

// ─── ensureFolder (idempotente) ──────────────────────
export async function ensureFolder(parentId, folderName) {
    const cacheKey = `${parentId}:${folderName}`;
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

    const drive = getClient();
    if (!drive) throw new Error('Google Drive nao configurado');

    // Buscar pasta existente
    const search = await drive.files.list({
        q: `'${parentId}' in parents and name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
    });

    if (search.data.files.length > 0) {
        const id = search.data.files[0].id;
        folderCache.set(cacheKey, id);
        return id;
    }

    // Criar pasta
    const created = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id',
    });

    folderCache.set(cacheKey, created.data.id);
    return created.data.id;
}

// ─── setupProjectFolders ─────────────────────────────
export async function setupProjectFolders(projetoId, nomeProjeto) {
    const cfg = getConfig();
    if (!cfg.gdrive_folder_id) throw new Error('Pasta raiz do Drive nao configurada');

    const rootId = cfg.gdrive_folder_id;
    const projetosId = await ensureFolder(rootId, 'Projetos');
    const projectId = await ensureFolder(projetosId, `Projeto ${projetoId} - ${nomeProjeto}`);
    const montadorId = await ensureFolder(projectId, 'Montador');
    const documentosId = await ensureFolder(projectId, 'Documentos');

    // Salvar folder ID no projeto
    db.prepare('UPDATE projetos SET gdrive_folder_id = ? WHERE id = ?').run(projectId, projetoId);

    return { projectFolderId: projectId, montadorFolderId: montadorId, documentosFolderId: documentosId };
}

// ─── setupFinanceiroFolders ──────────────────────────
export async function setupFinanceiroFolders() {
    const cfg = getConfig();
    if (!cfg.gdrive_folder_id) throw new Error('Pasta raiz do Drive nao configurada');

    const rootId = cfg.gdrive_folder_id;
    const financeiroId = await ensureFolder(rootId, 'Financeiro');
    const nfsId = await ensureFolder(financeiroId, 'NFs');
    const boletosId = await ensureFolder(financeiroId, 'Boletos');

    return { financeiroFolderId: financeiroId, nfsFolderId: nfsId, boletosFolderId: boletosId };
}

// ─── getProjectMontadorFolder ────────────────────────
export async function getProjectMontadorFolder(projetoId) {
    // Buscar projeto para ver se ja tem folder
    const proj = db.prepare('SELECT id, nome, gdrive_folder_id, cliente_id FROM projetos WHERE id = ?').get(projetoId);
    if (!proj) throw new Error('Projeto nao encontrado');

    // Buscar nome do cliente para a pasta
    let nomeProjeto = proj.nome;
    if (proj.cliente_id) {
        const cli = db.prepare('SELECT nome FROM clientes WHERE id = ?').get(proj.cliente_id);
        if (cli) nomeProjeto = cli.nome;
    }

    // Se ja tem folder no Drive, buscar a subpasta Montador
    if (proj.gdrive_folder_id && !proj.gdrive_folder_id.startsWith('local:')) {
        const montadorId = await ensureFolder(proj.gdrive_folder_id, 'Montador');
        return montadorId;
    }

    // Criar estrutura completa
    const folders = await setupProjectFolders(projetoId, nomeProjeto);
    return folders.montadorFolderId;
}

// ─── getProjectDocumentosFolder ──────────────────────
export async function getProjectDocumentosFolder(projetoId) {
    const proj = db.prepare('SELECT id, nome, gdrive_folder_id, cliente_id FROM projetos WHERE id = ?').get(projetoId);
    if (!proj) throw new Error('Projeto nao encontrado');

    let nomeProjeto = proj.nome;
    if (proj.cliente_id) {
        const cli = db.prepare('SELECT nome FROM clientes WHERE id = ?').get(proj.cliente_id);
        if (cli) nomeProjeto = cli.nome;
    }

    if (proj.gdrive_folder_id && !proj.gdrive_folder_id.startsWith('local:')) {
        return await ensureFolder(proj.gdrive_folder_id, 'Documentos');
    }

    const folders = await setupProjectFolders(projetoId, nomeProjeto);
    return folders.documentosFolderId;
}

// ─── uploadFile ──────────────────────────────────────
export async function uploadFile(parentFolderId, fileName, mimeType, buffer) {
    const drive = getClient();
    if (!drive) throw new Error('Google Drive nao configurado');

    const { Readable } = await import('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const resp = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [parentFolderId],
        },
        media: {
            mimeType: mimeType || 'application/octet-stream',
            body: stream,
        },
        fields: 'id, webViewLink, webContentLink, size',
    });

    return {
        id: resp.data.id,
        webViewLink: resp.data.webViewLink,
        webContentLink: resp.data.webContentLink,
        size: resp.data.size,
    };
}

// ─── downloadFile (stream) ───────────────────────────
export async function downloadFile(fileId) {
    const drive = getClient();
    if (!drive) throw new Error('Google Drive nao configurado');

    const resp = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );

    return resp.data; // readable stream
}

// ─── getFileMeta ─────────────────────────────────────
export async function getFileMeta(fileId) {
    const drive = getClient();
    if (!drive) throw new Error('Google Drive nao configurado');

    const resp = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, webViewLink',
    });

    return resp.data;
}

// ─── deleteFile ──────────────────────────────────────
export async function deleteFile(fileId) {
    const drive = getClient();
    if (!drive) throw new Error('Google Drive nao configurado');

    // Move para lixeira (nao deleta permanentemente)
    await drive.files.update({
        fileId,
        requestBody: { trashed: true },
    });
}

// ─── testConnection ──────────────────────────────────
export async function testConnection() {
    const drive = getClient();
    if (!drive) return { ok: false, error: 'Credenciais nao configuradas' };

    const cfg = getConfig();
    if (!cfg.gdrive_folder_id) return { ok: false, error: 'Pasta raiz nao configurada' };

    try {
        const folder = await drive.files.get({
            fileId: cfg.gdrive_folder_id,
            fields: 'id, name',
        });
        return { ok: true, folder_name: folder.data.name };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// ─── clearCache (para quando config muda) ────────────
export function clearCache() {
    _cachedClient = null;
    _cachedCreds = null;
    folderCache.clear();
}
