import db from '../db.js';
import evolution from './evolution.js';
import zapi from './zapi.js';

// ═══════════════════════════════════════════════════════
// WA — Router de provider (evolution | zapi)
// Escolhe o provider ativo via empresa_config.wa_provider e
// expõe a mesma interface, pra o resto do sistema não se importar
// com qual provedor está rodando.
// ═══════════════════════════════════════════════════════

export function activeName() {
    try {
        return db.prepare('SELECT wa_provider FROM empresa_config WHERE id = 1').get()?.wa_provider || 'evolution';
    } catch {
        return 'evolution';
    }
}

export function active() {
    return activeName() === 'zapi' ? zapi : evolution;
}

export async function sendText(...args) { return active().sendText(...args); }
export async function sendMedia(...args) { return active().sendMedia(...args); }
export async function getConnectionStatus(...args) { return active().getConnectionStatus(...args); }
export function isConfigured() { return active().isConfigured(); }

// sendPresence (typing) só existe na Evolution — no-op silencioso nos outros
export async function sendPresence(...args) {
    const p = active();
    if (typeof p.sendPresence === 'function') return p.sendPresence(...args);
    return null;
}

export default { activeName, active, sendText, sendMedia, getConnectionStatus, isConfigured, sendPresence };
