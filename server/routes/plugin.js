// ═══════════════════════════════════════════════════════
// Plugin Routes — Download, versão e auto-update
// Protegido com auth — plugin SketchUp autentica via JWT
// ═══════════════════════════════════════════════════════

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth } from '../auth.js';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

const PLUGINS_DIR = path.join(__dirname, '..', 'uploads', 'plugins');

// Carregar version.json (ou defaults)
function getVersionInfo() {
    const versionFile = path.join(PLUGINS_DIR, 'version.json');
    try {
        if (fs.existsSync(versionFile)) {
            return JSON.parse(fs.readFileSync(versionFile, 'utf8'));
        }
    } catch {}
    // Default se não existe
    return {
        version: '0.1.0',
        released_at: new Date().toISOString(),
        changelog: 'Versão inicial do plugin Ornato CNC para SketchUp.',
        min_sketchup: '2021',
        filename: 'ornato_cnc_0.1.0.rbz',
        size_mb: 0,
    };
}

// ─── GET /api/plugin/latest ─────────────────────────────
// Retorna info da versão mais recente
router.get('/latest', requireAuth, (req, res) => {
    const info = getVersionInfo();
    const host = req.get('host');
    const protocol = req.protocol;
    res.json({
        version: info.version,
        download_url: `${protocol}://${host}/api/plugin/download/${info.filename}`,
        filename: info.filename,
        size_mb: info.size_mb,
        released_at: info.released_at,
        changelog: info.changelog,
        min_sketchup: info.min_sketchup || '2021',
        features: [
            'Detecção automática de peças',
            '8 regras de furação (dobradiça, minifix, cavilha, System32, puxador, corrediça, fundo, prateleira)',
            '15 módulos paramétricos',
            'Ferragens 3D no modelo',
            'Edição manual de furos',
            '15 validações pré-export',
            'Catálogo Blum, Hettich, Hafele, Grass',
            'Biblioteca com 92 itens (móveis, ferragens, usinagens, materiais, bordas)',
            'Sync direto com Ornato ERP',
        ],
    });
});

// ─── GET /api/plugin/download/:filename ─────────────────
// Serve o arquivo .rbz para download
router.get('/download/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    // Segurança: só permite .rbz e sem path traversal
    if (!filename.endsWith('.rbz') || filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Arquivo inválido' });
    }
    const filePath = path.join(PLUGINS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado. Gere o .rbz com build.sh primeiro.' });
    }
    // Registrar download
    try {
        const logFile = path.join(PLUGINS_DIR, 'downloads.log');
        const entry = `${new Date().toISOString()} | ${req.ip} | ${filename}\n`;
        fs.appendFileSync(logFile, entry);
    } catch {}

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.sendFile(filePath);
});

// ─── POST /api/plugin/register ──────────────────────────
// Registra instalação do plugin (analytics)
router.post('/register', requireAuth, (req, res) => {
    const { version, sketchup_version, os, user_id } = req.body;
    try {
        const logFile = path.join(PLUGINS_DIR, 'installs.log');
        const entry = `${new Date().toISOString()} | v${version || '?'} | SKP${sketchup_version || '?'} | ${os || '?'} | ${req.ip}\n`;
        fs.appendFileSync(logFile, entry);
    } catch {}
    res.json({ ok: true, message: 'Instalação registrada' });
});

// ─── GET /api/plugin/check-update ───────────────────────
// Verifica se há atualização (chamado pelo plugin)
router.get('/check-update', requireAuth, (req, res) => {
    const { current_version } = req.query;
    const info = getVersionInfo();

    const hasUpdate = current_version && compareVersions(info.version, current_version) > 0;
    const host = req.get('host');
    const protocol = req.protocol;

    res.json({
        has_update: hasUpdate,
        latest_version: info.version,
        current_version: current_version || 'unknown',
        download_url: hasUpdate ? `${protocol}://${host}/api/plugin/download/${info.filename}` : null,
        changelog: hasUpdate ? info.changelog : null,
    });
});

// ─── Biblioteca de Módulos (pública, sem auth) ──────
// Base: ornato-plugin/biblioteca/ — servida pelo ERP

const BIBLIOTECA_DIR = path.join(__dirname, '..', '..', 'ornato-plugin', 'biblioteca');

const CATEGORIAS_MOVEIS = ['cozinha', 'dormitorio', 'banheiro', 'escritorio', 'closet', 'area_servico', 'comercial'];

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

// Mapeia id do módulo biblioteca → tipo Ruby builder
function resolveRubyType(id) {
    if (!id) return 'armario_base';
    const s = id.toLowerCase();
    if (s.startsWith('aereo') || s.includes('aereo')) return 'armario_aereo';
    if (s.startsWith('torre') || s.includes('torre')) return 'armario_torre';
    if (s.startsWith('gaveteiro')) return 'gaveteiro';
    if (s.startsWith('nicho') || s === 'paneleiro') return 'nicho';
    if (s.startsWith('canto') || s.includes('canto')) return 'coluna_canto';
    if (s.startsWith('sapateira')) return 'sapateira';
    if (s.startsWith('cabideiro')) return 'cabideiro';
    if (s.startsWith('prateleira')) return 'prateleira';
    if (s.startsWith('gaveta')) return 'gaveta';
    if (s.startsWith('porta_correr') || s.includes('correr')) return 'porta_correr';
    if (s.startsWith('porta')) return 'porta_abrir';
    if (s.startsWith('rodape')) return 'rodape';
    if (s.startsWith('divisoria')) return 'divisoria';
    if (s.startsWith('tamponamento')) return 'tamponamento';
    return 'armario_base'; // fallback genérico
}

function listModules(category) {
    const dir = path.join(BIBLIOTECA_DIR, 'moveis', category);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => readJsonFile(path.join(dir, f)))
        .filter(Boolean)
        .map(m => ({
            id: m.id,
            nome: m.nome,
            descricao: m.descricao,
            categoria: m.categoria,
            tags: m.tags,
            icone: m.icone,
            parametros: m.parametros,
            tipo_ruby: resolveRubyType(m.id),
        }));
}

// GET /api/plugin/biblioteca — índice de todas as categorias
router.get('/biblioteca', requireAuth, (req, res) => {
    const result = {};
    for (const cat of CATEGORIAS_MOVEIS) {
        const mods = listModules(cat);
        if (mods.length > 0) result[cat] = { count: mods.length, modulos: mods };
    }

    // Ferragens summary
    const ferragensDir = path.join(BIBLIOTECA_DIR, 'ferragens');
    let ferragensCount = 0;
    if (fs.existsSync(ferragensDir)) {
        const subdirs = fs.readdirSync(ferragensDir, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const sub of subdirs) {
            const files = fs.readdirSync(path.join(ferragensDir, sub.name)).filter(f => f.endsWith('.json'));
            ferragensCount += files.length;
        }
    }

    res.json({ moveis: result, ferragens_count: ferragensCount });
});

// GET /api/plugin/biblioteca/moveis — lista todos os módulos (todas as categorias)
router.get('/biblioteca/moveis', requireAuth, (req, res) => {
    const { categoria, search } = req.query;
    let all = [];
    const cats = categoria ? [categoria] : CATEGORIAS_MOVEIS;
    for (const cat of cats) {
        all = all.concat(listModules(cat));
    }
    if (search) {
        const q = search.toLowerCase();
        all = all.filter(m =>
            m.nome?.toLowerCase().includes(q) ||
            m.descricao?.toLowerCase().includes(q) ||
            m.tags?.some(t => t.toLowerCase().includes(q))
        );
    }
    res.json(all);
});

// GET /api/plugin/biblioteca/moveis/:id — detalhes completos de um módulo
router.get('/biblioteca/moveis/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (id.includes('..') || id.includes('/')) return res.status(400).json({ error: 'ID inválido' });

    for (const cat of CATEGORIAS_MOVEIS) {
        const filePath = path.join(BIBLIOTECA_DIR, 'moveis', cat, `${id}.json`);
        if (fs.existsSync(filePath)) {
            const data = readJsonFile(filePath);
            if (data) return res.json(data);
        }
    }
    res.status(404).json({ error: 'Módulo não encontrado' });
});

// GET /api/plugin/biblioteca/ferragens — lista ferragens
router.get('/biblioteca/ferragens', requireAuth, (req, res) => {
    const ferragensDir = path.join(BIBLIOTECA_DIR, 'ferragens');
    if (!fs.existsSync(ferragensDir)) return res.json([]);

    const result = [];
    const subdirs = fs.readdirSync(ferragensDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const sub of subdirs) {
        const files = fs.readdirSync(path.join(ferragensDir, sub.name)).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const data = readJsonFile(path.join(ferragensDir, sub.name, file));
            if (data) result.push({ id: data.id, nome: data.nome, marca: data.marca, modelo: data.modelo, categoria: data.categoria || sub.name });
        }
    }
    res.json(result);
});

// Comparar versões semver simples (1.2.3 > 1.2.2)
function compareVersions(a, b) {
    const pa = (a || '0.0.0').split('.').map(Number);
    const pb = (b || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}

// ═══════════════════════════════════════════════════════
// INTEGRAÇÃO PLUGIN ↔ ERP (Design → Orçamento)
// ═══════════════════════════════════════════════════════

// ─── GET /api/plugin/projeto/:id/info ───────────────────
// Retorna dados do orçamento/projeto para exibir no plugin
router.get('/projeto/:id/info', requireAuth, (req, res) => {
    const orc = db.prepare(
        `SELECT o.id, o.numero, o.cliente_nome, o.ambiente,
                o.valor_venda, o.status, o.criado_em,
                c.telefone as cliente_tel, c.email as cliente_email
         FROM orcamentos o
         LEFT JOIN clientes c ON o.cliente_id = c.id
         WHERE o.id = ?`
    ).get(req.params.id);

    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({
        id:           orc.id,
        numero:       orc.numero,
        cliente:      orc.cliente_nome,
        cliente_tel:  orc.cliente_tel,
        cliente_email: orc.cliente_email,
        ambiente:     orc.ambiente,
        valor_atual:  orc.valor_venda,
        status:       orc.status,
        criado_em:    orc.criado_em,
    });
});

// ─── POST /api/plugin/projeto/init ──────────────────────
// Inicia sessão de design — plugin envia numero/id do orçamento
// e recebe dados completos para exibir no painel
router.post('/projeto/init', requireAuth, (req, res) => {
    const { orc_id, numero } = req.body;

    let orc;
    if (orc_id) {
        orc = db.prepare(`SELECT * FROM orcamentos WHERE id = ?`).get(orc_id);
    } else if (numero) {
        orc = db.prepare(`SELECT * FROM orcamentos WHERE numero = ?`).get(numero);
    }

    if (!orc) {
        return res.status(404).json({ error: 'Orçamento não encontrado. Informe um número ou ID válido.' });
    }

    // Parse stored materials/modules from mods_json
    let ambientes = [];
    try {
        const data = JSON.parse(orc.mods_json || '{}');
        ambientes = data.ambientes || [];
    } catch (_) {}

    res.json({
        ok: true,
        projeto: {
            id:      orc.id,
            numero:  orc.numero,
            cliente: orc.cliente_nome,
            ambiente: orc.ambiente,
            status:  orc.status,
            valor_venda: orc.valor_venda,
            ambientes_count: ambientes.length,
        },
    });
});

// ─── POST /api/plugin/projeto/:id/bom ───────────────────
// Push BOM ao vivo — plugin envia lista de peças enquanto o
// usuário projeta; retorna custo estimado em tempo real
router.post('/projeto/:id/bom', requireAuth, (req, res) => {
    const { modulos, pecas, total_pecas, materiais } = req.body;
    const orc_id = req.params.id;

    // Verifica existência
    const orc = db.prepare(`SELECT id, mods_json FROM orcamentos WHERE id = ?`).get(orc_id);
    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Calcula custo estimado de material com base no estoque
    let custo_estimado = 0;
    const preco_por_peca = [];

    if (Array.isArray(pecas)) {
        pecas.forEach(p => {
            // Tenta encontrar material no estoque para precificação
            const mat = p.material ? db.prepare(
                `SELECT preco FROM estoque WHERE codigo = ? OR nome LIKE ? LIMIT 1`
            ).get(p.material, `%${p.material}%`) : null;

            const area_m2 = ((p.largura || 0) * (p.comprimento || p.altura || 0)) / 1_000_000;
            const preco_unit = mat?.preco || 0;
            const custo = area_m2 * preco_unit;
            custo_estimado += custo;
            preco_por_peca.push({ nome: p.nome, material: p.material, custo: custo.toFixed(2) });
        });
    }

    // Salva snapshot do BOM no orçamento (campo plugin_bom)
    try {
        db.prepare(
            `UPDATE orcamentos SET plugin_bom = ?, atualizado_em = datetime('now')
             WHERE id = ?`
        ).run(JSON.stringify({ modulos, pecas, total_pecas, materiais, custo_estimado, updated_at: new Date().toISOString() }), orc_id);
    } catch (_) {
        // plugin_bom column may not exist yet — ignore gracefully
    }

    res.json({
        ok: true,
        custo_estimado: custo_estimado.toFixed(2),
        total_pecas: total_pecas || (pecas?.length || 0),
        preco_por_peca: preco_por_peca.slice(0, 20), // top 20
    });
});

// ─── GET /api/plugin/projeto/:id/bom ────────────────────
// Retorna BOM salvo mais recente para um projeto
router.get('/projeto/:id/bom', requireAuth, (req, res) => {
    const orc = db.prepare(`SELECT plugin_bom FROM orcamentos WHERE id = ?`).get(req.params.id);
    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });
    const bom = orc.plugin_bom ? JSON.parse(orc.plugin_bom) : {};
    res.json(bom);
});

// ─── POST /api/plugin/projeto/:id/proposta ──────────────
// Cria/atualiza proposta a partir do design SketchUp
// Preenche ambientes + materiais do orçamento com os dados do plugin
router.post('/projeto/:id/proposta', requireAuth, (req, res) => {
    const { design_summary, modulos, pecas, imagem_base64 } = req.body;
    const orc_id = req.params.id;

    const orc = db.prepare(`SELECT * FROM orcamentos WHERE id = ?`).get(orc_id);
    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Montar novo ambiente do orçamento a partir do design
    let existingData = {};
    try { existingData = JSON.parse(orc.mods_json || '{}'); } catch (_) {}

    // Criar ambiente "SketchUp Design" com os módulos
    const novoAmbiente = {
        nome: design_summary?.ambiente || 'Design SketchUp',
        modulos: (modulos || []).map(m => ({
            id:          m.type || 'generico',
            nome:        m.label || m.name || m.type,
            largura:     m.params?.largura || 0,
            altura:      m.params?.altura || 0,
            profundidade: m.params?.profundidade || 0,
            material:    m.params?.material || '',
            quantidade:  1,
            preco:       0,
        })),
        pecas_total: pecas?.length || 0,
    };

    // Adicionar ou substituir ambiente SKP
    const ambientes = (existingData.ambientes || []).filter(a => a.nome !== 'Design SketchUp');
    ambientes.push(novoAmbiente);
    existingData.ambientes = ambientes;

    // Atualizar mods_json
    db.prepare(
        `UPDATE orcamentos SET mods_json = ?, atualizado_em = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(existingData), orc_id);

    // URL da proposta no ERP
    const host = req.get('host');
    const protocol = req.protocol;
    const proposta_url = `${protocol}://${host}/proposta/${orc.numero}`;

    res.json({
        ok: true,
        orc_id:      orc.id,
        numero:      orc.numero,
        proposta_url,
        ambientes_total: ambientes.length,
        modulos_inseridos: novoAmbiente.modulos.length,
    });
});

// ─── GET /api/plugin/health ─────────────────────────────
// Ping rápido para testar conectividade
router.get('/health', (req, res) => {
    res.json({ ok: true, server: 'Ornato ERP', time: new Date().toISOString() });
});

export default router;
