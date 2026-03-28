import { Router } from 'express';
import { randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// APONTAMENTO DE PRODUÇÃO (QR Code)
// ═══════════════════════════════════════════════════════

// POST /api/producao-av/apontar — Iniciar ou finalizar etapa
router.post('/apontar', requireAuth, (req, res) => {
    const { projeto_id, modulo_id, modulo_nome, etapa, colaborador_id, acao } = req.body;
    if (!projeto_id || !etapa) return res.status(400).json({ error: 'projeto_id e etapa obrigatórios' });

    if (acao === 'iniciar') {
        const result = db.prepare(`INSERT INTO producao_apontamentos (projeto_id, modulo_id, modulo_nome, etapa, colaborador_id, inicio)
            VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)`)
            .run(projeto_id, modulo_id || '', modulo_nome || '', etapa, colaborador_id || null);
        res.json({ id: result.lastInsertRowid, acao: 'iniciado' });
    } else if (acao === 'finalizar') {
        const aberto = db.prepare(`SELECT id, inicio FROM producao_apontamentos
            WHERE projeto_id = ? AND modulo_id = ? AND etapa = ? AND fim IS NULL ORDER BY id DESC LIMIT 1`)
            .get(projeto_id, modulo_id || '', etapa);
        if (!aberto) return res.status(404).json({ error: 'Apontamento não encontrado' });
        const duracao = (Date.now() - new Date(aberto.inicio).getTime()) / 60000; // minutos
        db.prepare('UPDATE producao_apontamentos SET fim = CURRENT_TIMESTAMP, duracao_min = ? WHERE id = ?')
            .run(Math.round(duracao), aberto.id);
        res.json({ id: aberto.id, acao: 'finalizado', duracao_min: Math.round(duracao) });
    } else {
        res.status(400).json({ error: 'acao deve ser "iniciar" ou "finalizar"' });
    }
});

// GET /api/producao-av/painel — Dashboard TV Fábrica
router.get('/painel', requireAuth, (req, res) => {
    // Projetos em produção com etapa atual
    const projetos = db.prepare(`
        SELECT p.id, p.nome, p.status, p.data_vencimento, o.cliente_nome, o.valor_venda, o.numero
        FROM projetos p LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.status IN ('em_producao', 'nao_iniciado', 'em_andamento')
        ORDER BY p.data_vencimento ASC LIMIT 50
    `).all();

    projetos.forEach(proj => {
        // Etapa atual: último apontamento aberto ou mais recente
        const ultimaEtapa = db.prepare(`
            SELECT etapa, modulo_nome, inicio, fim, colaborador_id,
                   CASE WHEN fim IS NULL THEN 'em_andamento' ELSE 'concluido' END as status_etapa
            FROM producao_apontamentos WHERE projeto_id = ?
            ORDER BY id DESC LIMIT 5
        `).all(proj.id);
        proj.etapas_recentes = ultimaEtapa;

        // Progresso: % módulos com todas etapas concluídas
        const modulos = db.prepare(`SELECT DISTINCT modulo_id FROM producao_apontamentos WHERE projeto_id = ?`).all(proj.id);
        const modulosConcluidos = modulos.filter(m => {
            const pendente = db.prepare(`SELECT id FROM producao_apontamentos WHERE projeto_id = ? AND modulo_id = ? AND fim IS NULL`).get(proj.id, m.modulo_id);
            return !pendente;
        });
        proj.progresso = modulos.length > 0 ? Math.round((modulosConcluidos.length / modulos.length) * 100) : 0;

        // Dias até vencimento
        if (proj.data_vencimento) {
            proj.dias_restantes = Math.ceil((new Date(proj.data_vencimento) - new Date()) / 86400000);
        }
    });

    // Capacidade: horas usadas vs disponíveis esta semana
    const horasSemana = db.prepare(`
        SELECT SUM(duracao_min) / 60.0 as horas
        FROM producao_apontamentos
        WHERE inicio >= date('now', '-7 days') AND fim IS NOT NULL
    `).get()?.horas || 0;

    const cfg = db.prepare('SELECT func_producao, horas_dia, eficiencia FROM config_taxas WHERE id = 1').get();
    const capacidadeSemanal = (cfg?.func_producao || 10) * (cfg?.horas_dia || 8.5) * 5 * ((cfg?.eficiencia || 75) / 100);

    // Gargalos: etapas com mais tempo de espera
    const gargalos = db.prepare(`
        SELECT etapa, COUNT(*) as qtd_abertos
        FROM producao_apontamentos WHERE fim IS NULL
        GROUP BY etapa ORDER BY qtd_abertos DESC
    `).all();

    res.json({
        projetos,
        capacidade: { horasUsadas: Math.round(horasSemana * 10) / 10, capacidadeSemanal: Math.round(capacidadeSemanal), utilizacao: capacidadeSemanal > 0 ? Math.round((horasSemana / capacidadeSemanal) * 100) : 0 },
        gargalos,
    });
});

// GET /api/producao-av/capacidade — Capacidade da fábrica
router.get('/capacidade', requireAuth, (req, res) => {
    const cfg = db.prepare('SELECT func_producao, horas_dia, dias_uteis, eficiencia FROM config_taxas WHERE id = 1').get();
    const func = cfg?.func_producao || 10;
    const hDia = cfg?.horas_dia || 8.5;
    const dias = cfg?.dias_uteis || 22;
    const efic = (cfg?.eficiencia || 75) / 100;
    const capacidadeMensal = func * hDia * dias * efic;

    // Horas comprometidas (projetos aprovados/em produção)
    const projetos = db.prepare(`
        SELECT p.id, p.nome, o.valor_venda, o.mods_json
        FROM projetos p JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.status IN ('nao_iniciado', 'em_andamento', 'em_producao')
    `).all();

    // Horas já gastas este mês
    const horasGastas = db.prepare(`
        SELECT SUM(duracao_min) / 60.0 as h FROM producao_apontamentos
        WHERE inicio >= date('now', 'start of month') AND fim IS NOT NULL
    `).get()?.h || 0;

    // Férias e afastamentos do mês
    const ausencias = db.prepare(`
        SELECT SUM(dias) as total_dias FROM ferias_afastamentos
        WHERE data_inicio <= date('now', '+30 days') AND data_fim >= date('now')
    `).get()?.total_dias || 0;

    const capacidadeEfetiva = capacidadeMensal - (ausencias * hDia * efic);

    res.json({
        capacidadeMensal: Math.round(capacidadeMensal),
        capacidadeEfetiva: Math.round(capacidadeEfetiva),
        horasGastas: Math.round(horasGastas * 10) / 10,
        disponivel: Math.round(capacidadeEfetiva - horasGastas),
        projetosAtivos: projetos.length,
        ausenciasDias: ausencias,
    });
});

// ═══════════════════════════════════════════════════════
// QUALIDADE — Checklist antes de embalar
// ═══════════════════════════════════════════════════════

router.post('/qualidade', requireAuth, (req, res) => {
    const { projeto_id, modulo_id, modulo_nome, checklist_json, aprovado, obs, fotos_json } = req.body;
    const result = db.prepare(`INSERT INTO producao_qualidade (projeto_id, modulo_id, modulo_nome, checklist_json, aprovado, obs, fotos_json, conferido_por)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(projeto_id, modulo_id || '', modulo_nome || '', checklist_json || '[]', aprovado ? 1 : 0, obs || '', fotos_json || '[]', req.user.id);
    res.json({ id: result.lastInsertRowid });
});

router.get('/qualidade/:projetoId', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT q.*, u.nome as conferido_por_nome FROM producao_qualidade q LEFT JOIN users u ON u.id = q.conferido_por WHERE q.projeto_id = ? ORDER BY q.criado_em DESC').all(req.params.projetoId);
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// PRODUTIVIDADE INDIVIDUAL
// ═══════════════════════════════════════════════════════
router.get('/produtividade', requireAuth, (req, res) => {
    const { periodo = '30' } = req.query;
    const rows = db.prepare(`
        SELECT c.id, c.nome, pa.etapa,
               COUNT(pa.id) as tarefas,
               SUM(pa.duracao_min) as minutos_total,
               AVG(pa.duracao_min) as media_min
        FROM producao_apontamentos pa
        JOIN colaboradores c ON c.id = pa.colaborador_id
        WHERE pa.fim IS NOT NULL AND pa.inicio >= date('now', '-' || ? || ' days')
        GROUP BY c.id, pa.etapa
        ORDER BY c.nome, pa.etapa
    `).all(periodo);
    res.json(rows);
});

export default router;
