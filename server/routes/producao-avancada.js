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
    const rawProjetos = db.prepare(`
        SELECT p.id, p.nome, p.status, p.data_vencimento, o.cliente_nome, o.valor_venda, o.numero, o.mods_json
        FROM projetos p LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.status IN ('em_producao', 'nao_iniciado', 'em_andamento')
        ORDER BY p.data_vencimento ASC LIMIT 50
    `).all();

    let totalModulosGeral = 0;
    let totalConcluidosGeral = 0;

    const projetos = rawProjetos.map(proj => {
        // Etapa atual: último apontamento aberto ou mais recente
        const ultimaEtapa = db.prepare(`
            SELECT etapa, modulo_nome, inicio, fim, colaborador_id,
                   CASE WHEN fim IS NULL THEN 'em_andamento' ELSE 'concluido' END as status_etapa
            FROM producao_apontamentos WHERE projeto_id = ?
            ORDER BY id DESC LIMIT 5
        `).all(proj.id);

        // Etapa atual (último apontamento em aberto, ou último concluído)
        const etapaAberta = ultimaEtapa.find(e => e.status_etapa === 'em_andamento');
        const etapa_atual = etapaAberta ? etapaAberta.etapa : (ultimaEtapa.length > 0 ? ultimaEtapa[0].etapa : 'Aguardando');

        // Contar módulos do orçamento
        let modulos_total = 0;
        try {
            const mods = JSON.parse(proj.mods_json || '{}');
            const ambientes = mods.ambientes || [];
            ambientes.forEach(amb => {
                if (amb.itens) modulos_total += amb.itens.reduce((s, it) => s + (it.qtd || 1), 0);
                if (amb.linhas) modulos_total += amb.linhas.length;
            });
        } catch(e) {}
        if (modulos_total === 0) modulos_total = 1; // fallback

        // Progresso: % módulos com todas etapas concluídas
        const modulosApontados = db.prepare(`SELECT DISTINCT modulo_id FROM producao_apontamentos WHERE projeto_id = ?`).all(proj.id);
        const modulosConcluidos = modulosApontados.filter(m => {
            const pendente = db.prepare(`SELECT id FROM producao_apontamentos WHERE projeto_id = ? AND modulo_id = ? AND fim IS NULL`).get(proj.id, m.modulo_id);
            return !pendente;
        }).length;
        const progresso_modulos = modulos_total > 0 ? Math.round((modulosConcluidos / modulos_total) * 100) : 0;

        totalModulosGeral += modulos_total;
        totalConcluidosGeral += modulosConcluidos;

        return {
            id: proj.id,
            nome: proj.nome,
            status: proj.status,
            data_entrega: proj.data_vencimento,
            cliente: proj.cliente_nome || 'Sem cliente',
            numero: proj.numero,
            etapa_atual,
            etapas_recentes: ultimaEtapa,
            progresso_modulos,
            modulos_total,
            modulos_concluidos: modulosConcluidos,
        };
    });

    // Capacidade: horas usadas vs disponíveis esta semana
    const horasSemana = db.prepare(`
        SELECT SUM(duracao_min) / 60.0 as horas
        FROM producao_apontamentos
        WHERE inicio >= date('now', '-7 days') AND fim IS NOT NULL
    `).get()?.horas || 0;

    const cfg = db.prepare('SELECT func_producao, horas_dia, eficiencia FROM config_taxas WHERE id = 1').get();
    const funcProducao = cfg?.func_producao || 10;
    const horasDia = cfg?.horas_dia || 8.5;
    const eficiencia = cfg?.eficiencia || 75;
    const capacidadeSemanal = funcProducao * horasDia * 5 * (eficiencia / 100);

    // Gargalos: etapas com mais tempo de espera
    const rawGargalos = db.prepare(`
        SELECT etapa, COUNT(*) as qtd_abertos
        FROM producao_apontamentos WHERE fim IS NULL
        GROUP BY etapa ORDER BY qtd_abertos DESC
    `).all();

    const gargalos = rawGargalos.map(g => ({
        nome: g.etapa,
        estacao: g.etapa,
        motivo: `${g.qtd_abertos} tarefa${g.qtd_abertos > 1 ? 's' : ''} pendente${g.qtd_abertos > 1 ? 's' : ''}`,
        projetos_aguardando: g.qtd_abertos,
    }));

    // Resumo
    const projetosAtrasados = projetos.filter(p => {
        if (!p.data_entrega) return false;
        return Math.ceil((new Date(p.data_entrega + 'T12:00:00') - new Date()) / 86400000) < 0;
    }).length;

    res.json({
        projetos,
        capacidade: {
            horas_usadas: Math.round(horasSemana * 10) / 10,
            horas_disponiveis: Math.round(capacidadeSemanal),
            utilizacao: capacidadeSemanal > 0 ? Math.round((horasSemana / capacidadeSemanal) * 100) : 0,
            por_estacao: [],
        },
        gargalos,
        resumo: {
            projetos_ativos: projetos.length,
            projetos_atrasados: projetosAtrasados,
            modulos_total: totalModulosGeral,
            modulos_concluidos: totalConcluidosGeral,
        },
    });
});

// GET /api/producao-av/apontamentos — Listar apontamentos de um projeto
router.get('/apontamentos', requireAuth, (req, res) => {
    const { projeto_id } = req.query;
    if (!projeto_id) return res.json([]);
    const rows = db.prepare(`
        SELECT id, projeto_id, modulo_id, modulo_nome, etapa, colaborador_id, inicio, fim, duracao_min
        FROM producao_apontamentos WHERE projeto_id = ?
        ORDER BY id DESC LIMIT 100
    `).all(projeto_id);
    res.json(rows);
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
