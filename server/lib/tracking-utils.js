// ═══════════════════════════════════════════════════════
// Tracking Utilities — compartilhado entre portal.js e assinaturas.js
// ═══════════════════════════════════════════════════════

// Parse user-agent para extrair dispositivo, navegador e OS
export function parseUA(ua) {
    if (!ua) return { dispositivo: 'Desconhecido', navegador: '', os_name: '' };
    let dispositivo = 'Desktop';
    if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) dispositivo = /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Mobile';
    let navegador = '';
    if (/Edg\//i.test(ua)) navegador = 'Edge';
    else if (/OPR|Opera/i.test(ua)) navegador = 'Opera';
    else if (/Chrome/i.test(ua)) navegador = 'Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) navegador = 'Safari';
    else if (/Firefox/i.test(ua)) navegador = 'Firefox';
    else navegador = 'Outro';
    const verMatch = ua.match(new RegExp(`${navegador === 'Edge' ? 'Edg' : navegador}\\/([\\d.]+)`));
    if (verMatch) navegador += ` ${verMatch[1].split('.')[0]}`;
    let os_name = '';
    if (/Windows NT 10/i.test(ua)) os_name = 'Windows 10/11';
    else if (/Windows/i.test(ua)) os_name = 'Windows';
    else if (/Mac OS X/i.test(ua)) os_name = ua.match(/iPhone|iPad/) ? 'iOS' : 'macOS';
    else if (/Android/i.test(ua)) { const v = ua.match(/Android\s([\d.]+)/); os_name = v ? `Android ${v[1]}` : 'Android'; }
    else if (/Linux/i.test(ua)) os_name = 'Linux';
    else os_name = 'Outro';
    return { dispositivo, navegador, os_name };
}

// Geolocalização por IP (ipinfo.io — 50k req/mês grátis)
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || 'f4a5ba70f05a1c';
export async function geolocateIP(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { cidade: 'Local', estado: '', pais: '', lat: null, lon: null };
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(`https://ipinfo.io/${ip}/json?token=${IPINFO_TOKEN}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return { cidade: '', estado: '', pais: '', lat: null, lon: null };
        const data = await resp.json();
        let lat = null, lon = null;
        if (data.loc) { const [la, lo] = data.loc.split(','); lat = parseFloat(la) || null; lon = parseFloat(lo) || null; }
        return { cidade: data.city || '', estado: data.region || '', pais: data.country || '', lat, lon };
    } catch {
        return { cidade: '', estado: '', pais: '', lat: null, lon: null };
    }
}

// Detectar acessos internos (mesmo IP/rede do ERP)
export function isInternalAccess(ip) {
    if (!ip) return false;
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(ip)) return true;
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) return true;
    return false;
}

// Extrair IP do request
export function getClientIP(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

// Validar CPF brasileiro (dígitos verificadores)
export function validarCPF(cpf) {
    const digits = (cpf || '').replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false; // todos iguais
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(digits[9]) !== check) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    return parseInt(digits[10]) === check;
}
