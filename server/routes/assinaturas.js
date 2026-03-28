import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth, optionalAuth } from '../auth.js';
import { createNotification } from '../services/notificacoes.js';
import { parseUA, geolocateIP, getClientIP, validarCPF } from '../lib/tracking-utils.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function gerarCodigoVerificacao() {
    // 8 caracteres alfanuméricos uppercase — fácil de ler/digitar
    for (let i = 0; i < 100; i++) {
        const code = randomBytes(4).toString('hex').toUpperCase();
        const exists = db.prepare('SELECT id FROM documento_assinaturas WHERE codigo_verificacao = ?').get(code);
        if (!exists) return code;
    }
    return randomBytes(6).toString('hex').toUpperCase(); // fallback
}

function hashDocumento(html) {
    return createHash('sha256').update(html, 'utf-8').digest('hex');
}

function hashAssinatura(hashDoc, cpf, timestamp, ip) {
    return createHash('sha256').update(`${hashDoc}|${cpf}|${timestamp}|${ip}`, 'utf-8').digest('hex');
}

function mascaraCPF(cpf) {
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length < 4) return '***';
    return `***.***.*${d.slice(-4, -2)}-${d.slice(-2)}`;
}

function mascaraIP(ip) {
    if (!ip) return '';
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
    return ip.slice(0, 10) + '...';
}

// ═══════════════════════════════════════════════════════
// AUTENTICADOS — Gestão de sessões de assinatura
// ═══════════════════════════════════════════════════════

// POST /api/assinaturas/criar — Criar sessão de assinatura
router.post('/criar', requireAuth, (req, res) => {
    const { orc_id, tipo_documento = 'contrato', html_documento, signatarios = [], expira_em } = req.body;
    if (!orc_id || !html_documento) return res.status(400).json({ error: 'orc_id e html_documento são obrigatórios' });
    if (!signatarios.length) return res.status(400).json({ error: 'Pelo menos 1 signatário é obrigatório' });

    const orc = db.prepare('SELECT id, numero FROM orcamentos WHERE id = ?').get(orc_id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const hash = hashDocumento(html_documento);
    const token = randomBytes(20).toString('hex');
    const codigo = gerarCodigoVerificacao();
    const expira = expira_em || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dias

    const docResult = db.prepare(`
        INSERT INTO documento_assinaturas (orc_id, tipo_documento, token, codigo_verificacao, html_documento, hash_documento, status, criado_por, expira_em)
        VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?, ?)
    `).run(orc_id, tipo_documento, token, codigo, html_documento, hash, req.user.id, expira);

    const docId = docResult.lastInsertRowid;
    const baseUrl = process.env.BASE_URL || '';

    const signatariosResult = signatarios.map((s, i) => {
        const sigToken = randomBytes(20).toString('hex');
        db.prepare(`
            INSERT INTO assinatura_signatarios (documento_id, papel, nome, cpf, email, telefone, token, ordem)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(docId, s.papel || 'contratante', s.nome || '', (s.cpf || '').replace(/\D/g, ''), s.email || '', s.telefone || '', sigToken, i);
        return { papel: s.papel, nome: s.nome, token: sigToken, signing_url: `${baseUrl}/assinar/${sigToken}` };
    });

    res.json({
        id: docId, token, codigo_verificacao: codigo, hash_documento: hash,
        signatarios: signatariosResult,
    });
});

// GET /api/assinaturas/documento/:orc_id — Listar sessões do orçamento
router.get('/documento/:orc_id', requireAuth, (req, res) => {
    const docs = db.prepare(`
        SELECT d.*, u.nome as criado_por_nome
        FROM documento_assinaturas d
        LEFT JOIN users u ON u.id = d.criado_por
        WHERE d.orc_id = ? ORDER BY d.criado_em DESC
    `).all(req.params.orc_id);

    docs.forEach(doc => {
        doc.signatarios = db.prepare(`
            SELECT id, papel, nome, cpf, token, status, assinado_em, cidade, estado
            FROM assinatura_signatarios WHERE documento_id = ?
        `).all(doc.id);
        doc.signatarios.forEach(s => { s.cpf_masked = mascaraCPF(s.cpf); });
    });

    res.json(docs);
});

// POST /api/assinaturas/:id/cancelar
router.post('/:id/cancelar', requireAuth, (req, res) => {
    const { motivo } = req.body;
    db.prepare(`
        UPDATE documento_assinaturas SET status='cancelado', cancelado_em=CURRENT_TIMESTAMP, cancelado_por=?, motivo_cancelamento=?
        WHERE id=? AND status IN ('pendente','parcial')
    `).run(req.user.id, motivo || '', req.params.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PÚBLICOS — Assinatura pelo cliente (sem auth)
// ═══════════════════════════════════════════════════════

// GET /api/assinaturas/public/:signerToken — Carregar página de assinatura
router.get('/public/:signerToken', async (req, res) => {
    const signer = db.prepare('SELECT * FROM assinatura_signatarios WHERE token = ?').get(req.params.signerToken);
    if (!signer) return res.status(404).json({ error: 'Link de assinatura inválido' });

    if (signer.status === 'assinado') return res.status(400).json({ error: 'Documento já assinado por este signatário', already_signed: true });

    const doc = db.prepare('SELECT * FROM documento_assinaturas WHERE id = ?').get(signer.documento_id);
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
    if (doc.status === 'cancelado') return res.status(400).json({ error: 'Documento cancelado' });
    if (doc.expira_em && new Date(doc.expira_em) < new Date()) return res.status(400).json({ error: 'Documento expirado' });

    const orc = db.prepare('SELECT numero, cliente_nome FROM orcamentos WHERE id = ?').get(doc.orc_id);
    const emp = db.prepare('SELECT nome, cnpj, telefone, logo_sistema, proposta_cor_primaria, proposta_cor_accent FROM empresa_config WHERE id = 1').get();

    // Todos os signatários (para mostrar status)
    const todosSig = db.prepare(`
        SELECT papel, nome, status, assinado_em FROM assinatura_signatarios WHERE documento_id = ?
    `).all(doc.id);

    res.json({
        documento: {
            tipo: doc.tipo_documento,
            hash: doc.hash_documento,
            codigo_verificacao: doc.codigo_verificacao,
            html: doc.html_documento,
            status: doc.status,
        },
        signatario: {
            nome: signer.nome,
            papel: signer.papel,
            cpf_masked: mascaraCPF(signer.cpf),
            cpf_ultimos4: (signer.cpf || '').slice(-4),
        },
        proposta: { numero: orc?.numero || '', cliente: orc?.cliente_nome || '' },
        empresa: {
            nome: emp?.nome || '',
            logo: emp?.logo_sistema || '',
            cor_primaria: emp?.proposta_cor_primaria || '#1B2A4A',
            cor_accent: emp?.proposta_cor_accent || '#C9A96E',
        },
        signatarios_status: todosSig,
    });
});

// POST /api/assinaturas/public/:signerToken/assinar — Submeter assinatura
router.post('/public/:signerToken/assinar', async (req, res) => {
    const { cpf, assinatura_img } = req.body;
    if (!cpf || !assinatura_img) return res.status(400).json({ error: 'CPF e assinatura são obrigatórios' });

    const signer = db.prepare('SELECT * FROM assinatura_signatarios WHERE token = ?').get(req.params.signerToken);
    if (!signer) return res.status(404).json({ error: 'Link de assinatura inválido' });
    if (signer.status === 'assinado') return res.status(400).json({ error: 'Já assinado' });

    const doc = db.prepare('SELECT * FROM documento_assinaturas WHERE id = ?').get(signer.documento_id);
    if (!doc || doc.status === 'cancelado') return res.status(400).json({ error: 'Documento indisponível' });
    if (doc.expira_em && new Date(doc.expira_em) < new Date()) return res.status(400).json({ error: 'Documento expirado' });

    // Validar CPF
    const cpfDigits = (cpf || '').replace(/\D/g, '');
    if (!validarCPF(cpfDigits)) return res.status(400).json({ error: 'CPF inválido' });
    if (cpfDigits !== signer.cpf.replace(/\D/g, '')) return res.status(400).json({ error: 'CPF não confere com o cadastrado' });

    // Validar assinatura (base64 PNG)
    if (!assinatura_img.startsWith('data:image/png;base64,')) return res.status(400).json({ error: 'Formato de assinatura inválido' });
    const imgSize = Buffer.byteLength(assinatura_img.split(',')[1] || '', 'base64');
    if (imgSize > 500 * 1024) return res.status(400).json({ error: 'Imagem da assinatura muito grande (max 500KB)' });

    // Verificar integridade do documento
    const hashAtual = hashDocumento(doc.html_documento);
    if (hashAtual !== doc.hash_documento) return res.status(500).json({ error: 'Integridade do documento comprometida' });

    // Coletar dados de auditoria
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '';
    const { dispositivo, navegador, os_name } = parseUA(ua);
    const geo = await geolocateIP(ip);
    const agora = new Date().toISOString();
    const hashSig = hashAssinatura(doc.hash_documento, cpfDigits, agora, ip);

    // Salvar assinatura (strip data URL prefix)
    const imgData = assinatura_img.split(',')[1] || '';
    db.prepare(`
        UPDATE assinatura_signatarios SET
            status='assinado', assinado_em=?, ip_assinatura=?, user_agent=?,
            dispositivo=?, navegador=?, os_name=?,
            cidade=?, estado=?, pais=?, lat=?, lon=?,
            assinatura_img=?, hash_assinatura=?
        WHERE id=?
    `).run(agora, ip, ua, dispositivo, navegador, os_name,
        geo.cidade, geo.estado, geo.pais, geo.lat, geo.lon,
        imgData, hashSig, signer.id);

    // Verificar se todos assinaram
    const pendentes = db.prepare(`
        SELECT COUNT(*) as c FROM assinatura_signatarios WHERE documento_id = ? AND status = 'pendente'
    `).get(doc.id);

    const novoStatus = pendentes.c === 0 ? 'concluido' : 'parcial';
    db.prepare(`UPDATE documento_assinaturas SET status=?${novoStatus === 'concluido' ? ', concluido_em=CURRENT_TIMESTAMP' : ''} WHERE id=?`).run(novoStatus, doc.id);

    // Notificação
    try {
        const orc = db.prepare('SELECT numero, cliente_nome FROM orcamentos WHERE id = ?').get(doc.orc_id);
        const totalSig = db.prepare('SELECT COUNT(*) as c FROM assinatura_signatarios WHERE documento_id = ?').get(doc.id);
        const assinados = totalSig.c - pendentes.c;
        createNotification(
            'assinatura',
            `${signer.nome} assinou o ${doc.tipo_documento}`,
            `${orc?.numero || ''} — ${assinados}/${totalSig.c} assinatura(s)${novoStatus === 'concluido' ? ' ✅ Completo!' : ''}`,
            doc.orc_id, 'orcamento', orc?.cliente_nome || '', null
        );
    } catch (_) {}

    res.json({
        success: true,
        status: novoStatus,
        codigo_verificacao: doc.codigo_verificacao,
        hash_assinatura: hashSig,
    });
});

// ═══════════════════════════════════════════════════════
// VERIFICAÇÃO PÚBLICA — Qualquer pessoa pode verificar
// ═══════════════════════════════════════════════════════

router.get('/verificar/:codigo', (req, res) => {
    const doc = db.prepare('SELECT * FROM documento_assinaturas WHERE codigo_verificacao = ?').get(req.params.codigo.toUpperCase());
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado', valido: false });

    const orc = db.prepare('SELECT numero, cliente_nome FROM orcamentos WHERE id = ?').get(doc.orc_id);
    const emp = db.prepare('SELECT nome, logo_sistema FROM empresa_config WHERE id = 1').get();

    const signatarios = db.prepare(`
        SELECT papel, nome, cpf, status, assinado_em, hash_assinatura, ip_assinatura, cidade, estado, dispositivo, navegador
        FROM assinatura_signatarios WHERE documento_id = ? ORDER BY ordem
    `).all(doc.id);

    res.json({
        valido: true,
        documento: {
            tipo: doc.tipo_documento,
            hash: doc.hash_documento,
            status: doc.status,
            criado_em: doc.criado_em,
            concluido_em: doc.concluido_em,
        },
        proposta: { numero: orc?.numero || '', cliente: orc?.cliente_nome || '' },
        empresa: { nome: emp?.nome || '', logo: emp?.logo_sistema || '' },
        signatarios: signatarios.map(s => ({
            papel: s.papel,
            nome: s.nome,
            cpf_masked: mascaraCPF(s.cpf),
            status: s.status,
            assinado_em: s.assinado_em,
            hash: s.hash_assinatura,
            ip_masked: mascaraIP(s.ip_assinatura),
            local: [s.cidade, s.estado].filter(Boolean).join('/'),
            dispositivo: `${s.dispositivo || ''} ${s.navegador || ''}`.trim(),
        })),
        lei: 'Assinatura eletrônica simples — Lei 14.063/2020, Art. 4º, I',
    });
});

export default router;
