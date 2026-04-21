import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import clientesRoutes from './routes/clientes.js';
import orcamentosRoutes from './routes/orcamentos.js';
import configRoutes from './routes/config.js';
import catalogoRoutes from './routes/catalogo.js';
import bibliotecaRoutes from './routes/biblioteca.js';
import portalRoutes from './routes/portal.js';
import projetosRoutes from './routes/projetos.js';
import financeiroRoutes from './routes/financeiro.js';
import estoqueRoutes from './routes/estoque.js';
import driveRoutes from './routes/drive.js';
import montadorRoutes from './routes/montador.js';
import pdfRoutes from './routes/pdf.js';
import webhookRoutes from './routes/webhook.js';
import whatsappRoutes from './routes/whatsapp.js';
import iaRoutes from './routes/ia.js';
import recursosRoutes from './routes/recursos.js';
import dashboardRoutes from './routes/dashboard.js';
import landingRoutes from './routes/landing.js';
import producaoRoutes from './routes/producao.js';
import notificacoesRoutes from './routes/notificacoes.js';
import atividadesRoutes from './routes/atividades.js';
import cncRoutes from './routes/cnc.js';
import planoCorteRoutes from './routes/plano-corte.js';
import portfolioRoutes from './routes/portfolio.js';
import industrializacaoRoutes from './routes/industrializacao.js';
import assinaturasRoutes from './routes/assinaturas.js';
import comprasRoutes from './routes/compras.js';
import producaoAvRoutes from './routes/producao-avancada.js';
import gestaoAvRoutes from './routes/gestao-avancada.js';
import pluginRoutes from './routes/plugin.js';
import bibliotecaSkpRoutes from './routes/biblioteca-skp.js';
import searchRoutes from './routes/search.js';
import depoimentosRoutes from './routes/depoimentos.js';
import pontoRoutes from './routes/ponto.js';
import leadsRoutes from './routes/leads.js';
import extRoutes from './routes/ext.js';
import templatesRoutes from './routes/templates.js';
import digitalTwinRoutes from './routes/digital-twin.js';

// Inicializa DB (efeito colateral — cria tabelas e seed)
import './db.js';
import { iniciarAutomacoes } from './services/automacoes.js';
import { iniciarBackupDiario } from './services/backup.js';
import { iniciarSofiaFollowup } from './services/sofia_followup.js';
import { iniciarSofiaEscalacao } from './services/sofia_escalacao.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (Nginx reverse proxy envia X-Forwarded-For)
app.set('trust proxy', 1);

// ═══ Gzip compression (reduz ~70% do tráfego JSON) ═══
app.use(compression({ threshold: 1024 }));

// ═══ Rate Limiters ═══════════════════════════════════════════════════
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }, standardHeaders: true, legacyHeaders: false });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Limite de requisições excedido.' }, standardHeaders: true, legacyHeaders: false });
const sensitiveLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' }, standardHeaders: true, legacyHeaders: false });

// IA: cara em token — 30 chamadas/min por IP (cobre uso normal + um pouco de rajada)
const iaLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Muitas chamadas à IA. Aguarde 1 minuto.' }, standardHeaders: true, legacyHeaders: false });
// Uploads de mídia WhatsApp: 20/min — suficiente pra atendimento humano
const mediaLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: 'Muitos uploads. Aguarde 1 minuto.' }, standardHeaders: true, legacyHeaders: false });
// Backfill: operação cara (chama Evolution API múltiplas vezes) — 3/hora
const backfillLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: { error: 'Backfill só pode ser executado 3x por hora.' }, standardHeaders: true, legacyHeaders: false });

// ═══ Webhook ANTES do CORS (Evolution API envia de origem externa) ═══
// Limite maior pois Evolution pode enviar payloads com base64 de mídia
app.use('/api/webhook', express.json({ limit: '50mb' }), webhookRoutes);

// ═══ Landing endpoints públicos (sem CORS, com rate limit) ═══
app.use('/api/landing', publicLimiter, express.json(), landingRoutes);

const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5175', 'http://127.0.0.1:5175', 'https://gestaoornato.com', 'http://gestaoornato.com'];
app.use(cors({ origin: corsOrigins }));
// Rotas pesadas (CNC, plano-corte, importacao) precisam de body maior
app.use('/api/cnc', express.json({ limit: '50mb' }));
app.use('/api/plano-corte', express.json({ limit: '50mb' }));
app.use('/api/industrializacao', express.json({ limit: '20mb' }));
// Demais rotas: limite menor por seguranca
app.use(express.json({ limit: '5mb' }));

// ═══ Anti-cache para API (evita dados stale entre dispositivos) ═══
app.use('/api', (req, res, next) => {
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    });
    next();
});

// ═══ Security headers ═══
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
});

// ═══ Request logging — loga só /api lentas (>2s) ou com erro (>=500) ═══
app.use('/api', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        if (ms > 2000 || res.statusCode >= 500) {
            console.log(`[${res.statusCode}] ${req.method} ${req.originalUrl || req.path} ${ms}ms user=${req.user?.id || '-'}`);
        }
    });
    next();
});

// ═══════════════════════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════════════════════
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);

// Rate limit para operações sensíveis (DELETE)
app.delete('/api/projetos/*', sensitiveLimiter);
app.delete('/api/clientes/*', sensitiveLimiter);
app.delete('/api/orcamentos/*', sensitiveLimiter);
app.delete('/api/financeiro/*', sensitiveLimiter);
app.delete('/api/estoque/*', sensitiveLimiter);

// ═══ Rotas caras (IA / mídia / backfill) ═══════════════════════════
// IA: qualquer POST em /api/ia/* e sugestão/geração em whatsapp
app.use('/api/ia', iaLimiter);
app.post('/api/whatsapp/conversas/*/sugerir', iaLimiter);
// Uploads de mídia do chat
app.post('/api/whatsapp/conversas/*/enviar-midia', mediaLimiter);
// Backfill — chamada cara da Evolution
app.post('/api/whatsapp/backfill', backfillLimiter);
app.post('/api/whatsapp/conversas/*/backfill', backfillLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/orcamentos', orcamentosRoutes);
app.use('/api/config', configRoutes);
app.use('/api/catalogo', catalogoRoutes);
app.use('/api/biblioteca', bibliotecaRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/projetos', projetosRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/montador', montadorRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ia', iaRoutes);
app.use('/api/recursos', recursosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/producao', producaoRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/atividades', atividadesRoutes);
app.use('/api/cnc', cncRoutes);
app.use('/api/plano-corte', planoCorteRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/industrializacao', industrializacaoRoutes);
app.use('/api/assinaturas', assinaturasRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/producao-av', producaoAvRoutes);
app.use('/api/gestao', gestaoAvRoutes);
app.use('/api/plugin', pluginRoutes);
app.use('/api/biblioteca-skp', bibliotecaSkpRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/depoimentos', depoimentosRoutes);
app.use('/api/ponto', pontoRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/ext', extRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/digital-twin', digitalTwinRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// 404 para rotas /api/* não encontradas (antes do SPA fallback)
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado', path: req.path });
});

// ═══ Servir frontend (SPA) ═══════════════════════════════════════════════
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// Servir arquivos estáticos do build (JS, CSS, imagens, etc.)
app.use(express.static(distPath));

// Servir uploads (fotos expedição etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// SPA fallback: qualquer rota que não é /api → envia index.html
// Isso permite que o React lide com rotas como /orcs, /cli, /cfg etc.
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

// ═══ Error handler (4 args) — deve ficar por último ═══
// Middleware de erro registrado DEPOIS de todas as rotas.
// Captura qualquer next(err) vindo de qualquer rota /api/*.
app.use((err, req, res, next) => {
    const errorId = `E${Date.now().toString(36)}`;
    // Log estruturado sem derrubar o processo
    console.error(`[${errorId}] ${req.method} ${req.originalUrl || req.path} | user=${req.user?.id || '-'}`);
    console.error(err.stack || err);
    // Se a resposta já começou, delega ao default handler do express
    if (res.headersSent) return next(err);
    res.status(err.statusCode || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : (err.message || 'Erro interno'),
        errorId,
    });
});

// ═══ WebSocket Server (real-time updates) ═══
import { WebSocketServer } from 'ws';

const server = app.listen(PORT, () => {
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  MARCENARIA ERP — API Server`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`═══════════════════════════════════════════\n`);

    // Iniciar automações de follow-up
    iniciarAutomacoes();
    // Backup diário do banco para Google Drive (3h da manhã)
    iniciarBackupDiario();
    // Sofia Follow-up (WhatsApp — 24h após cliente sumir, janela 9h-18h Seg-Sáb)
    iniciarSofiaFollowup();
    // Sofia Escalação (pós-handoff: alerta → holding → retomada → abandono)
    iniciarSofiaEscalacao(app);
});

const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set();

wss.on('connection', (ws) => {
    wsClients.add(ws);
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
    ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }));
});

// Broadcast helper — importável por outros módulos via app.locals
app.locals.wsBroadcast = (type, data) => {
    const msg = JSON.stringify({ type, data, ts: new Date().toISOString() });
    for (const ws of wsClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
};
