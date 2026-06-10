import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import evolution from './evolution.js';

// ═══════════════════════════════════════════════════════
// FOTO DE PERFIL DO WHATSAPP — cache local em /uploads
// A Evolution devolve uma URL temporária do CDN do WhatsApp;
// baixamos 1x e servimos do nosso disco (estático, sem auth,
// mesmo padrão das mídias de mensagem).
// ═══════════════════════════════════════════════════════

const __dirname = dirname(fileURLToPath(import.meta.url));
const AVATARS_DIR = join(__dirname, '..', 'uploads', 'whatsapp', 'avatars');
mkdirSync(AVATARS_DIR, { recursive: true });

// Colunas novas (migração lazy/idempotente — db.js tem WIP concorrente,
// mesmo padrão usado em ia_auditoria_preco)
for (const sql of [
    "ALTER TABLE chat_conversas ADD COLUMN wa_avatar TEXT DEFAULT ''",
    'ALTER TABLE chat_conversas ADD COLUMN wa_avatar_em DATETIME',
    "ALTER TABLE chat_mensagens ADD COLUMN media_nome TEXT DEFAULT ''",
    "ALTER TABLE chat_mensagens ADD COLUMN media_mime TEXT DEFAULT ''",
]) {
    try { db.exec(sql); } catch { /* coluna já existe */ }
}

const REFRESH_DIAS = 7;           // re-busca foto a cada 7 dias
const _inFlight = new Set();      // evita buscas duplicadas concorrentes

// Baixa e cacheia a foto de perfil de UMA conversa. Silencioso em erro.
// Retorna o path local ('' se o contato não tem foto).
export async function refreshAvatar(conversaId) {
    if (_inFlight.has(conversaId)) return null;
    _inFlight.add(conversaId);
    try {
        const conv = db.prepare('SELECT id, wa_phone, wa_jid FROM chat_conversas WHERE id = ?').get(conversaId);
        if (!conv) return null;
        const dest = conv.wa_jid || conv.wa_phone;
        if (!dest || !evolution.isConfigured()) return null;

        const url = await evolution.fetchProfilePicUrl(dest).catch(() => '');
        if (!url) {
            // Contato sem foto (ou privacidade) — registra a tentativa pra não re-buscar já
            db.prepare("UPDATE chat_conversas SET wa_avatar = '', wa_avatar_em = CURRENT_TIMESTAMP WHERE id = ?").run(conv.id);
            return '';
        }

        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`download avatar: HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100 || buf.length > 3_000_000) throw new Error(`tamanho inesperado: ${buf.length}b`);

        const filename = `conv_${conv.id}.jpg`;
        writeFileSync(join(AVATARS_DIR, filename), buf);
        // ?v= timestamp quebra cache do browser quando a foto muda
        const localPath = `/uploads/whatsapp/avatars/${filename}?v=${Date.now()}`;
        db.prepare('UPDATE chat_conversas SET wa_avatar = ?, wa_avatar_em = CURRENT_TIMESTAMP WHERE id = ?').run(localPath, conv.id);
        return localPath;
    } catch (e) {
        console.warn(`[WA-Avatar] conv ${conversaId}: ${e.message}`);
        return null;
    } finally {
        _inFlight.delete(conversaId);
    }
}

// Atualiza (em background) os avatares vencidos/ausentes de uma lista de conversas.
// Chamado fire-and-forget no GET /conversas — nunca bloqueia a resposta.
export function sweepStale(conversas, maxPorChamada = 6) {
    if (!evolution.isConfigured()) return;
    const agora = Date.now();
    const vencidos = (conversas || []).filter(c => {
        if (!c.wa_phone && !c.wa_jid) return false;
        if (!c.wa_avatar_em) return true; // nunca buscou
        const em = new Date(c.wa_avatar_em.endsWith?.('Z') ? c.wa_avatar_em : c.wa_avatar_em + 'Z').getTime();
        // arquivo sumiu do disco (ex.: deploy limpo) → re-busca mesmo dentro da janela
        if (c.wa_avatar) {
            const file = c.wa_avatar.split('?')[0].split('/').pop();
            if (file && !existsSync(join(AVATARS_DIR, file))) return true;
        }
        return (agora - em) > REFRESH_DIAS * 86400000;
    }).slice(0, maxPorChamada);

    for (const c of vencidos) {
        refreshAvatar(c.id).catch(() => {});
    }
}

export default { refreshAvatar, sweepStale };
