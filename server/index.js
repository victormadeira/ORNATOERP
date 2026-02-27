import express from 'express';
import cors from 'cors';
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

// Inicializa DB (efeito colateral — cria tabelas e seed)
import './db.js';
import { iniciarAutomacoes } from './services/automacoes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ═══ Rate Limiters ═══════════════════════════════════════════════════
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }, standardHeaders: true, legacyHeaders: false });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Limite de requisições excedido.' }, standardHeaders: true, legacyHeaders: false });

// ═══ Webhook ANTES do CORS (Evolution API envia de origem externa) ═══
app.use('/api/webhook', express.json(), webhookRoutes);

// ═══ Landing/Leads ANTES do CORS (endpoints públicos com rate limit) ═══
app.use('/api/leads', publicLimiter, express.json(), landingRoutes);

const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5175', 'http://127.0.0.1:5175'];
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '20mb' }));

// ═══════════════════════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════════════════════
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);
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

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
    console.error('Erro:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  MARCENARIA ERP — API Server`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`═══════════════════════════════════════════\n`);

    // Iniciar automações de follow-up
    iniciarAutomacoes();
});
