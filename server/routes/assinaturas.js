import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth, optionalAuth } from '../auth.js';
import { createNotification } from '../services/notificacoes.js';
import { parseUA, geolocateIP, getClientIP, validarCPF } from '../lib/tracking-utils.js';
import { htmlToPdf } from '../pdf.js';
import evolution from '../services/evolution.js';
import { mensagemEnvioInicial } from '../services/assinaturas_templates.js';
import * as gdrive from '../services/gdrive.js';

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
            SELECT id, papel, nome, cpf, telefone, token, status, assinado_em, cidade, estado,
                   enviado_em, enviado_via, lembrete_1_em, lembrete_2_em, escalado_em
            FROM assinatura_signatarios WHERE documento_id = ?
        `).all(doc.id);
        doc.signatarios.forEach(s => { s.cpf_masked = mascaraCPF(s.cpf); });
    });

    res.json(docs);
});

// ═══════════════════════════════════════════════════════
// POST /api/assinaturas/signer/:signerId/enviar-whatsapp
// Envia link de assinatura direto via Evolution API (WhatsApp oficial da loja).
// Sem IA — template fixo. Marca enviado_em pra habilitar follow-up automático.
// ═══════════════════════════════════════════════════════
router.post('/signer/:signerId/enviar-whatsapp', requireAuth, async (req, res) => {
    try {
        const signer = db.prepare('SELECT * FROM assinatura_signatarios WHERE id = ?').get(req.params.signerId);
        if (!signer) return res.status(404).json({ error: 'Signatário não encontrado' });
        if (signer.status === 'assinado') return res.status(400).json({ error: 'Signatário já assinou' });

        const doc = db.prepare('SELECT * FROM documento_assinaturas WHERE id = ?').get(signer.documento_id);
        if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
        if (doc.status === 'cancelado') return res.status(400).json({ error: 'Documento cancelado' });
        if (doc.expira_em && new Date(doc.expira_em) < new Date()) return res.status(400).json({ error: 'Documento expirado' });

        const tel = (signer.telefone || '').replace(/\D/g, '');
        if (!tel) return res.status(400).json({ error: 'Signatário sem telefone cadastrado' });

        if (!evolution.isConfigured()) {
            return res.status(400).json({ error: 'WhatsApp (Evolution API) não configurado — use o envio manual' });
        }

        const emp = db.prepare('SELECT nome FROM empresa_config WHERE id = 1').get();
        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        const url = `${baseUrl}/assinar/${signer.token}`;

        const texto = mensagemEnvioInicial({
            nome: signer.nome,
            empresa: emp?.nome || '',
            tipo: doc.tipo_documento,
            url,
        });

        const dest = evolution.formatPhone(tel);
        await evolution.sendText(dest, texto);

        db.prepare(`
            UPDATE assinatura_signatarios
               SET enviado_em = CURRENT_TIMESTAMP, enviado_via = 'whatsapp', enviado_por = ?
             WHERE id = ?
        `).run(req.user.id, signer.id);

        res.json({ ok: true, enviado_em: new Date().toISOString() });
    } catch (err) {
        console.error('[assinaturas/enviar-whatsapp] Erro:', err);
        // Não expor err.message ao cliente — pode conter detalhes de infra (API keys, endpoints)
        const clientMsg = err?.status === 400 ? 'Número inválido ou não está no WhatsApp' : 'Erro ao enviar mensagem via WhatsApp';
        res.status(500).json({ error: clientMsg });
    }
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
    try {
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
    } catch (err) {
        console.error('Assinatura public GET erro:', err);
        res.status(500).json({ error: 'Erro ao carregar dados da assinatura' });
    }
});

// POST /api/assinaturas/public/:signerToken/assinar — Submeter assinatura
router.post('/public/:signerToken/assinar', async (req, res) => {
    try {
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

        // Salvar assinatura e atualizar status do documento em transação atômica
        // (evita race condition: dois signatários assinando simultaneamente marcam status errado)
        const imgData = assinatura_img.split(',')[1] || '';
        const { novoStatus, pendentes } = db.transaction(() => {
            db.prepare(`
                UPDATE assinatura_signatarios SET
                    status='assinado', assinado_em=?, ip_assinatura=?, user_agent=?,
                    dispositivo=?, navegador=?, os_name=?,
                    cidade=?, estado=?, pais=?, lat=?, lon=?,
                    assinatura_img=?, hash_assinatura=?
                WHERE id=? AND status = 'pendente'
            `).run(agora, ip, ua, dispositivo, navegador, os_name,
                geo.cidade, geo.estado, geo.pais, geo.lat, geo.lon,
                imgData, hashSig, signer.id);

            const pendentes = db.prepare(
                `SELECT COUNT(*) as c FROM assinatura_signatarios WHERE documento_id = ? AND status = 'pendente'`
            ).get(doc.id);

            const novoStatus = pendentes.c === 0 ? 'concluido' : 'parcial';
            db.prepare(
                `UPDATE documento_assinaturas SET status=?${novoStatus === 'concluido' ? ', concluido_em=CURRENT_TIMESTAMP' : ''} WHERE id=?`
            ).run(novoStatus, doc.id);

            return { novoStatus, pendentes };
        })();

        // Notificação in-app
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

            // WhatsApp para o criador do documento quando 100% dos signatários concluírem
            if (novoStatus === 'concluido' && doc.criado_por) {
                (async () => {
                    try {
                        if (!evolution.isConfigured()) return;
                        const criador = db.prepare('SELECT telefone FROM users WHERE id = ?').get(doc.criado_por);
                        const tel = (criador?.telefone || '').replace(/\D/g, '');
                        if (!tel) return;
                        const dest = evolution.formatPhone(tel);
                        const msg = [
                            `✅ *Documento assinado por todos!*`,
                            ``,
                            `📄 ${doc.tipo_documento.charAt(0).toUpperCase() + doc.tipo_documento.slice(1)} *${orc?.numero || doc.id}*`,
                            orc?.cliente_nome ? `👤 Cliente: ${orc.cliente_nome}` : '',
                            `📝 Último signatário: ${signer.nome}`,
                            ``,
                            `Todos os ${totalSig.c} signatário(s) concluíram. O documento está disponível no sistema.`,
                        ].filter(Boolean).join('\n');
                        await evolution.sendText(dest, msg);
                    } catch (wErr) {
                        // Non-critical: não deve derrubar a resposta de sucesso
                        console.error('[assinaturas] Erro ao notificar criador via WhatsApp:', wErr.message);
                    }
                })();

                // Google Drive — arquivar PDF do documento concluído
                (async () => {
                    try {
                        if (!gdrive.isConfigured()) return;
                        const pdfBuffer = await htmlToPdf(doc.html_documento);
                        const safeName = `Contrato_${orc?.numero || doc.id}_${orc?.cliente_nome || 'cliente'}_${new Date().toISOString().slice(0, 10)}.pdf`
                            .replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                        const folderId = db.prepare('SELECT gdrive_folder_id FROM empresa_config WHERE id = 1').get()?.gdrive_folder_id;
                        if (!folderId) return;
                        const result = await gdrive.uploadFile(folderId, safeName, 'application/pdf', pdfBuffer);
                        // Salvar file_id no documento para referência futura
                        db.prepare('UPDATE documento_assinaturas SET gdrive_file_id = ? WHERE id = ?')
                            .run(result?.id || '', doc.id);
                        console.log(`[assinaturas] Drive: ${safeName} → ${result?.id}`);
                    } catch (driveErr) {
                        console.error('[assinaturas] Erro ao arquivar no Drive:', driveErr.message);
                    }
                })();
            }
        } catch (_) {}

        res.json({
            success: true,
            status: novoStatus,
            documento_id: doc.id,
            codigo_verificacao: doc.codigo_verificacao,
            hash_assinatura: hashSig,
            nome: signer.nome,
        });
    } catch (err) {
        console.error('Assinatura assinar erro:', err);
        res.status(500).json({ error: 'Erro ao processar assinatura' });
    }
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

// ═══════════════════════════════════════════════════════
// GET /api/assinaturas/comprovante-publico/:codigo — PDF via código de verificação (sem auth)
// ═══════════════════════════════════════════════════════

router.get('/comprovante-publico/:codigo', async (req, res) => {
    try {
        const doc = db.prepare('SELECT * FROM documento_assinaturas WHERE codigo_verificacao = ?').get(req.params.codigo.toUpperCase());
        if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
        if (doc.status !== 'concluido') return res.status(400).json({ error: 'Documento ainda não foi assinado' });
        // Gerar HTML do comprovante via handler interno
        const fakeRes = {
            _json: null,
            _status: 200,
            json(data) { this._json = data; return this; },
            status(code) { this._status = code; return this; },
        };
        req.params.docId = String(doc.id);
        comprovanteHandler(req, fakeRes);
        if (!fakeRes._json?.html) return res.status(500).json({ error: 'Erro ao gerar HTML' });
        // Converter HTML para PDF
        const pdfBuffer = await htmlToPdf(fakeRes._json.html, {});
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length,
            'Content-Disposition': `inline; filename="Contrato-Assinado-${doc.codigo_verificacao}.pdf"`,
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('[assinaturas/comprovante-publico] Erro:', err);
        res.status(500).json({ error: 'Erro ao gerar comprovante' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/assinaturas/comprovante/:docId — HTML para PDF comprovante
// ═══════════════════════════════════════════════════════

function comprovanteHandler(req, res) {
    try {
        const doc = db.prepare('SELECT * FROM documento_assinaturas WHERE id = ?').get(req.params.docId);
        if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });

        const orc = db.prepare('SELECT numero, cliente_nome FROM orcamentos WHERE id = ?').get(doc.orc_id);
        const emp = db.prepare('SELECT nome, cnpj, telefone, logo_sistema, proposta_cor_primaria, proposta_cor_accent FROM empresa_config WHERE id = 1').get();

        const signatarios = db.prepare(`
            SELECT papel, nome, cpf, status, assinado_em, hash_assinatura, ip_assinatura, user_agent, dispositivo, navegador, os_name, cidade, estado, pais, assinatura_img
            FROM assinatura_signatarios WHERE documento_id = ? ORDER BY ordem
        `).all(doc.id);

        const cor1 = emp?.proposta_cor_primaria || '#1B2A4A';
        const cor2 = emp?.proposta_cor_accent || '#C9A96E';
        const baseUrl = process.env.BASE_URL || '';

        const sigHtml = signatarios.map(s => {
            const cpfMask = mascaraCPF(s.cpf);
            const ipMask = mascaraIP(s.ip_assinatura);
            const local = [s.cidade, s.estado, s.pais].filter(Boolean).join(', ');
            const assinadoEm = s.assinado_em ? new Date(s.assinado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
            const sigImg = s.assinatura_img ? `<div style="margin:12px 0;text-align:center"><img src="data:image/png;base64,${s.assinatura_img}" style="max-width:280px;max-height:80px;border:1px solid #e5e7eb;border-radius:8px" /></div>` : '';

            return `
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:12px;${s.status === 'assinado' ? 'border-left:4px solid #22c55e' : 'border-left:4px solid #fbbf24'}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <div>
                        <strong style="font-size:14px">${s.nome}</strong>
                        <span style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-left:8px">${s.papel}</span>
                    </div>
                    <span style="font-size:11px;font-weight:700;color:${s.status === 'assinado' ? '#166534' : '#854d0e'};background:${s.status === 'assinado' ? '#dcfce7' : '#fef9c3'};padding:2px 10px;border-radius:6px">
                        ${s.status === 'assinado' ? 'ASSINADO' : 'PENDENTE'}
                    </span>
                </div>
                ${s.status === 'assinado' ? `
                ${sigImg}
                <table style="width:100%;font-size:11px;color:#374151;border-collapse:collapse">
                    <tr><td style="padding:3px 0;color:#6b7280;width:140px">Data/Hora:</td><td><strong>${assinadoEm}</strong></td></tr>
                    <tr><td style="padding:3px 0;color:#6b7280">CPF:</td><td style="font-family:monospace">${cpfMask}</td></tr>
                    <tr><td style="padding:3px 0;color:#6b7280">IP:</td><td style="font-family:monospace">${ipMask}</td></tr>
                    <tr><td style="padding:3px 0;color:#6b7280">Dispositivo:</td><td>${s.dispositivo || ''} — ${s.navegador || ''} — ${s.os_name || ''}</td></tr>
                    ${local ? `<tr><td style="padding:3px 0;color:#6b7280">Localização:</td><td>${local}</td></tr>` : ''}
                    <tr><td style="padding:3px 0;color:#6b7280">Hash assinatura:</td><td style="font-family:monospace;font-size:9px;word-break:break-all">${s.hash_assinatura || '—'}</td></tr>
                </table>` : '<p style="font-size:12px;color:#6b7280;margin:8px 0 0">Aguardando assinatura</p>'}
            </div>`;
        }).join('');

        const criadoEm = doc.criado_em ? new Date(doc.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
        const concluidoEm = doc.concluido_em ? new Date(doc.concluido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
        const verificarUrl = `${baseUrl}/verificar/${doc.codigo_verificacao}`;

        // Extrair o conteúdo do body do contrato original (remover <html>, <head>, <body> wrappers)
        let contratoBody = doc.html_documento || '';
        const bodyMatch = contratoBody.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) contratoBody = bodyMatch[1];
        // Extrair estilos do contrato original para preservar formatação
        let contratoStyles = '';
        const styleMatches = (doc.html_documento || '').match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
        if (styleMatches) contratoStyles = styleMatches.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n');

        // Injetar assinatura do cliente na sig-img-area do CONTRATANTE
        const sigAssinado = signatarios.find(s => s.papel === 'contratante' && s.status === 'assinado' && s.assinatura_img);
        if (sigAssinado) {
            // Novo formato: sig-img-area vazia antes do sig-line do CONTRATANTE
            contratoBody = contratoBody.replace(
                /(<div class="sig-img-area">\s*<\/div>\s*<div class="sig-line">\s*<div class="sig-name">[^<]*<\/div>\s*<div class="sig-role">CONTRATANTE<\/div>)/i,
                `<div class="sig-img-area"><img src="data:image/png;base64,${sigAssinado.assinatura_img}" style="max-height:60px;max-width:180px" /></div><div class="sig-line"><div class="sig-name">${sigAssinado.nome}</div><div class="sig-role">CONTRATANTE</div>`
            );
            // Fallback: formato antigo sem sig-img-area
            if (!contratoBody.includes(`base64,${sigAssinado.assinatura_img.slice(0, 20)}`)) {
                contratoBody = contratoBody.replace(
                    /(<div class="sig-block">\s*)(<div class="sig-line">\s*<div class="sig-name">[^<]*<\/div>\s*<div class="sig-role">CONTRATANTE<\/div>)/i,
                    `$1<div style="height:70px;display:flex;align-items:flex-end;justify-content:center"><img src="data:image/png;base64,${sigAssinado.assinatura_img}" style="max-height:60px;max-width:180px" /></div>$2`
                );
            }
        }

        // Namespace CSS do contrato para evitar conflito com comprovante
        const nsContratoStyles = contratoStyles
            .replace(/@page\s*\{[^}]*\}/g, '') // remover @page do contrato
            .replace(/\bbody\s*\{/g, '.doc-contrato {') // body → .doc-contrato
            .replace(/\.wm\b/g, '.doc-contrato .wm')
            .replace(/\.header\b/g, '.doc-contrato .c-header')
            .replace(/\.content\b/g, '.doc-contrato .c-content');

        // Namespace body do contrato (renomear classes para não conflitar)
        let nsContratoBody = contratoBody
            .replace(/class="header"/g, 'class="c-header"')
            .replace(/class="content"/g, 'class="c-content"');

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            @page { size: A4; margin: 18mm 16mm; }
            body { font-family: 'Inter', 'Segoe UI', sans-serif; color: #1f2937; margin: 0; padding: 0; font-size: 12px; line-height: 1.5; }
            /* ── Comprovante (Parte 1) ── */
            .comp-header { background: ${cor1}; color: #fff; padding: 20px 28px; display: flex; align-items: center; gap: 16px; }
            .comp-header img { height: 36px; }
            .comp-content { padding: 28px; }
            .comp-section { margin-bottom: 20px; }
            .comp-section-title { font-size: 13px; font-weight: 700; color: ${cor1}; border-bottom: 2px solid ${cor2}; padding-bottom: 5px; margin-bottom: 12px; }
            .comp-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            .comp-info-item { font-size: 11px; }
            .comp-info-label { color: #6b7280; }
            .comp-info-value { font-weight: 600; }
            .comp-footer { margin-top: 28px; padding-top: 14px; border-top: 2px solid ${cor2}; text-align: center; font-size: 10px; color: #6b7280; }
            .comp-verify-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 14px; text-align: center; margin-top: 18px; }
            .comp-verify-code { font-size: 22px; font-weight: 800; letter-spacing: 4px; color: ${cor1}; font-family: monospace; }
            .page-break { page-break-before: always; }
            /* ── Barra + Footer do contrato ── */
            .contrato-bar { background: ${cor1}; color: #fff; padding: 6px 20px; display: flex; align-items: center; gap: 8px; font-size: 9px; margin: 0; }
            .contrato-bar svg { flex-shrink: 0; }
            .contrato-footer { border-top: 1.5px solid ${cor2}; padding: 8px 20px; text-align: center; font-size: 8px; color: #6b7280; }
            /* ── Contrato embutido (namespaced) ── */
            .doc-contrato { margin: 0; padding: 0; }
            .doc-contrato .wm { display: none; }
            ${nsContratoStyles}
        </style></head><body>
            <!-- ═══ PARTE 1: COMPROVANTE DE ASSINATURA ═══ -->
            <div class="comp-header">
                ${emp?.logo_sistema ? `<img src="${emp.logo_sistema}" alt="" />` : ''}
                <div>
                    <div style="font-size:15px;font-weight:700">${emp?.nome || 'Empresa'}</div>
                    <div style="font-size:10px;opacity:0.8">Comprovante de Assinatura Eletrônica</div>
                </div>
            </div>
            <div class="comp-content">
                <div class="comp-section">
                    <div class="comp-section-title">Dados do Documento</div>
                    <div class="comp-info-grid">
                        <div class="comp-info-item"><span class="comp-info-label">Tipo:</span> <span class="comp-info-value">${doc.tipo_documento === 'contrato' ? 'Contrato' : doc.tipo_documento}</span></div>
                        <div class="comp-info-item"><span class="comp-info-label">Proposta:</span> <span class="comp-info-value">${orc?.numero || '—'} — ${orc?.cliente_nome || '—'}</span></div>
                        <div class="comp-info-item"><span class="comp-info-label">Criado em:</span> <span class="comp-info-value">${criadoEm}</span></div>
                        <div class="comp-info-item"><span class="comp-info-label">Concluído em:</span> <span class="comp-info-value">${concluidoEm}</span></div>
                        <div class="comp-info-item"><span class="comp-info-label">Status:</span> <span class="comp-info-value" style="color:${doc.status === 'concluido' ? '#166534' : '#854d0e'}">${doc.status === 'concluido' ? 'ASSINADO' : doc.status.toUpperCase()}</span></div>
                        <div class="comp-info-item"><span class="comp-info-label">Código:</span> <span class="comp-info-value" style="font-family:monospace">${doc.codigo_verificacao}</span></div>
                    </div>
                    <div style="margin-top:8px;font-size:10px">
                        <span class="comp-info-label">Hash SHA-256:</span>
                        <span style="font-family:monospace;font-size:8px;word-break:break-all;margin-left:4px">${doc.hash_documento}</span>
                    </div>
                </div>

                <div class="comp-section">
                    <div class="comp-section-title">Signatários</div>
                    ${sigHtml}
                </div>

                <div class="comp-verify-box">
                    <div style="font-size:10px;color:#6b7280;margin-bottom:3px">Código de Verificação</div>
                    <div class="comp-verify-code">${doc.codigo_verificacao}</div>
                    <div style="font-size:9px;color:#6b7280;margin-top:6px">
                        Verifique a autenticidade em: <strong>${verificarUrl}</strong>
                    </div>
                </div>

                <div class="comp-footer">
                    <p style="margin:0 0 3px"><strong>Assinatura eletrônica simples</strong> — Lei 14.063/2020, Art. 4º, I</p>
                    <p style="margin:0;font-size:9px">Este documento possui validade jurídica conforme legislação brasileira. Integridade verificável pelo hash SHA-256.</p>
                </div>
            </div>

            <!-- ═══ PARTE 2: CONTRATO ORIGINAL ═══ -->
            <div class="page-break"></div>
            <div class="contrato-bar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Documento assinado eletronicamente · Código: <strong>${doc.codigo_verificacao}</strong> · Hash: ${doc.hash_documento.slice(0, 16)}…</span>
            </div>
            <div class="doc-contrato">
                ${nsContratoBody}
            </div>
            <div class="contrato-footer">
                <p style="margin:0">Documento assinado eletronicamente — Lei 14.063/2020 — Código: <strong style="letter-spacing:1px">${doc.codigo_verificacao}</strong> — ${concluidoEm}</p>
            </div>
        </body></html>`;

        res.json({ html });
    } catch (err) {
        console.error('[assinaturas/comprovante] Erro:', err);
        res.status(500).json({ error: 'Erro ao gerar comprovante' });
    }
}

router.get('/comprovante/:docId', requireAuth, comprovanteHandler);

export default router;
