import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { htmlToPdf } from '../pdf.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcHorasTrabalhadas(entrada, saida_almoco, volta_almoco, saida) {
  if (!entrada || !saida) return 0;
  const e = timeToMinutes(entrada);
  const sa = saida_almoco ? timeToMinutes(saida_almoco) : 0;
  const va = volta_almoco ? timeToMinutes(volta_almoco) : 0;
  const s = timeToMinutes(saida);
  let mins = s - e;
  if (sa && va) mins -= (va - sa);
  return Math.max(0, mins / 60);
}

function getJornadaDia(jornadaJson, dataStr) {
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const d = new Date(dataStr + 'T12:00:00');
  return jornadaJson[dias[d.getDay()]] || null;
}

function getHorasPrevistas(jornadaDia) {
  if (!jornadaDia) return 0;
  return calcHorasTrabalhadas(
    jornadaDia.entrada,
    jornadaDia.saida_almoco,
    jornadaDia.volta_almoco,
    jornadaDia.saida
  );
}

function getConfig() {
  const cfg = db.prepare('SELECT * FROM ponto_config WHERE id = 1').get();
  if (!cfg) return { jornada: {}, tolerancia_min: 5 };
  return {
    ...cfg,
    jornada: JSON.parse(cfg.jornada_json || '{}'),
  };
}

function isFeriado(dataStr) {
  return !!db.prepare('SELECT id FROM ponto_feriados WHERE data = ?').get(dataStr);
}

// ═══════════════════════════════════════════════════════
// FUNCIONÁRIOS CRUD
// ═══════════════════════════════════════════════════════

// GET /api/ponto/funcionarios — listar todos (ativos primeiro)
router.get('/funcionarios', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM funcionarios ORDER BY ativo DESC, nome ASC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ponto/funcionarios — criar
router.post('/funcionarios', requireAuth, (req, res) => {
  try {
    const { nome, cpf, cargo, data_admissao, salario_base } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = db.prepare(
      'INSERT INTO funcionarios (nome, cpf, cargo, data_admissao, salario_base) VALUES (?, ?, ?, ?, ?)'
    ).run(nome, cpf || null, cargo || null, data_admissao || null, salario_base || 0);
    const func = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(result.lastInsertRowid);
    res.json(func);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ponto/funcionarios/:id — atualizar
router.put('/funcionarios/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nome, cpf, cargo, data_admissao, salario_base, ativo } = req.body;
    db.prepare(
      'UPDATE funcionarios SET nome = ?, cpf = ?, cargo = ?, data_admissao = ?, salario_base = ?, ativo = ? WHERE id = ?'
    ).run(nome, cpf || null, cargo || null, data_admissao || null, salario_base || 0, ativo ?? 1, id);
    const func = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
    if (!func) return res.status(404).json({ error: 'Funcionário não encontrado' });
    res.json(func);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ponto/funcionarios/:id — soft delete
router.delete('/funcionarios/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.prepare('UPDATE funcionarios SET ativo = 0 WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// PONTO CONFIG
// ═══════════════════════════════════════════════════════

// GET /api/ponto/config
router.get('/config', requireAuth, (req, res) => {
  try {
    const cfg = getConfig();
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ponto/config
router.put('/config', requireAuth, (req, res) => {
  try {
    const { jornada_json, tolerancia_min } = req.body;
    const jsonStr = typeof jornada_json === 'string' ? jornada_json : JSON.stringify(jornada_json || {});
    db.prepare(
      'UPDATE ponto_config SET jornada_json = ?, tolerancia_min = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = 1'
    ).run(jsonStr, tolerancia_min ?? 5);
    const cfg = getConfig();
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// REGISTROS DE PONTO
// ═══════════════════════════════════════════════════════

// GET /api/ponto/registros?mes=2026-04&funcionario_id=1
router.get('/registros', requireAuth, (req, res) => {
  try {
    const { mes, funcionario_id } = req.query;
    if (!mes) return res.status(400).json({ error: 'Parâmetro "mes" é obrigatório (ex: 2026-04)' });

    const inicio = `${mes}-01`;
    // Calcular fim do mês
    const [ano, mesNum] = mes.split('-').map(Number);
    const ultimoDia = new Date(ano, mesNum, 0).getDate();
    const fim = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

    let sql = `SELECT r.*, f.nome as funcionario_nome
               FROM ponto_registros r
               JOIN funcionarios f ON f.id = r.funcionario_id
               WHERE r.data >= ? AND r.data <= ?`;
    const params = [inicio, fim];

    if (funcionario_id) {
      sql += ' AND r.funcionario_id = ?';
      params.push(parseInt(funcionario_id));
    }
    sql += ' ORDER BY r.data ASC, f.nome ASC';

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ponto/registros — upsert (criar ou atualizar)
router.post('/registros', requireAuth, (req, res) => {
  try {
    const { funcionario_id, data, entrada, saida_almoco, volta_almoco, saida, tipo, obs } = req.body;
    if (!funcionario_id || !data) return res.status(400).json({ error: 'funcionario_id e data são obrigatórios' });

    const tipoVal = tipo || 'normal';
    const cfg = getConfig();

    // Calcular horas
    let horas_trabalhadas = 0;
    let horas_previstas = 0;
    let saldo_minutos = 0;

    if (tipoVal === 'normal') {
      horas_trabalhadas = calcHorasTrabalhadas(entrada, saida_almoco, volta_almoco, saida);
    }

    // Horas previstas: 0 se for feriado, folga, ferias, etc.
    const tiposSemPrevista = ['feriado', 'folga', 'ferias'];
    if (!tiposSemPrevista.includes(tipoVal) && !isFeriado(data)) {
      const jornadaDia = getJornadaDia(cfg.jornada, data);
      horas_previstas = getHorasPrevistas(jornadaDia);
    }

    // Se tipo != normal, horas_previstas conta como prevista mas trabalhadas = 0
    // Exceção: atestado/compensação contam como trabalhadas = previstas
    if (tipoVal === 'atestado' || tipoVal === 'compensacao') {
      horas_trabalhadas = horas_previstas;
    }

    saldo_minutos = Math.round((horas_trabalhadas - horas_previstas) * 60);

    // Upsert
    const existing = db.prepare('SELECT id FROM ponto_registros WHERE funcionario_id = ? AND data = ?').get(funcionario_id, data);

    if (existing) {
      db.prepare(`UPDATE ponto_registros SET
        entrada = ?, saida_almoco = ?, volta_almoco = ?, saida = ?,
        tipo = ?, obs = ?, horas_trabalhadas = ?, horas_previstas = ?,
        saldo_minutos = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?`
      ).run(
        entrada || null, saida_almoco || null, volta_almoco || null, saida || null,
        tipoVal, obs || null, horas_trabalhadas, horas_previstas,
        saldo_minutos, existing.id
      );
      const updated = db.prepare('SELECT r.*, f.nome as funcionario_nome FROM ponto_registros r JOIN funcionarios f ON f.id = r.funcionario_id WHERE r.id = ?').get(existing.id);
      res.json(updated);
    } else {
      const result = db.prepare(`INSERT INTO ponto_registros
        (funcionario_id, data, entrada, saida_almoco, volta_almoco, saida, tipo, obs, horas_trabalhadas, horas_previstas, saldo_minutos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        funcionario_id, data,
        entrada || null, saida_almoco || null, volta_almoco || null, saida || null,
        tipoVal, obs || null, horas_trabalhadas, horas_previstas, saldo_minutos
      );
      const created = db.prepare('SELECT r.*, f.nome as funcionario_nome FROM ponto_registros r JOIN funcionarios f ON f.id = r.funcionario_id WHERE r.id = ?').get(result.lastInsertRowid);
      res.json(created);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ponto/registros/:id
router.delete('/registros/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM ponto_registros WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// POST /api/ponto/registros/lote — preencher mês inteiro com horário padrão
// ═══════════════════════════════════════════════════════

router.post('/registros/lote', requireAuth, (req, res) => {
  try {
    const { funcionario_id, mes, sobrescrever } = req.body;
    // mes = '2026-04'
    if (!funcionario_id || !mes) return res.status(400).json({ error: 'funcionario_id e mes são obrigatórios' });

    const cfg = getConfig();
    const func = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(funcionario_id);
    const [anoStr, mesStr] = mes.split('-');
    const ano = parseInt(anoStr);
    const mesNum = parseInt(mesStr);
    const diasNoMes = new Date(ano, mesNum, 0).getDate();
    const hoje = new Date();
    hoje.setHours(23, 59, 59);

    const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    let inseridos = 0, ignorados = 0;

    const insertStmt = db.prepare(`INSERT OR IGNORE INTO ponto_registros
      (funcionario_id, data, entrada, saida_almoco, volta_almoco, saida, tipo, obs, horas_trabalhadas, horas_previstas, saldo_minutos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const updateStmt = db.prepare(`UPDATE ponto_registros SET
      entrada=?, saida_almoco=?, volta_almoco=?, saida=?, tipo=?,
      horas_trabalhadas=?, horas_previstas=?, saldo_minutos=?, atualizado_em=CURRENT_TIMESTAMP
      WHERE funcionario_id=? AND data=?`);

    const existsStmt = db.prepare('SELECT id, tipo FROM ponto_registros WHERE funcionario_id=? AND data=?');

    const transaction = db.transaction(() => {
      for (let d = 1; d <= diasNoMes; d++) {
        const dataStr = `${ano}-${String(mesNum).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dateObj = new Date(dataStr + 'T12:00:00');

        // Não preencher datas futuras
        if (dateObj > hoje) { ignorados++; continue; }
        // Não preencher antes da admissão
        if (func?.data_admissao && dataStr < func.data_admissao) { ignorados++; continue; }

        const dow = dias[dateObj.getDay()];
        const jornadaDia = cfg.jornada[dow];

        // Dia sem jornada (folga) → pular
        if (!jornadaDia) { ignorados++; continue; }

        // Feriado → registrar como feriado
        const ehFeriado = isFeriado(dataStr);

        const existing = existsStmt.get(funcionario_id, dataStr);

        if (existing && !sobrescrever) {
          ignorados++;
          continue;
        }

        if (ehFeriado) {
          if (existing) {
            updateStmt.run(null, null, null, null, 'feriado', 0, 0, 0, funcionario_id, dataStr);
          } else {
            insertStmt.run(funcionario_id, dataStr, null, null, null, null, 'feriado', null, 0, 0, 0);
          }
          inseridos++;
          continue;
        }

        const horas_trabalhadas = calcHorasTrabalhadas(jornadaDia.entrada, jornadaDia.saida_almoco, jornadaDia.volta_almoco, jornadaDia.saida);
        const horas_previstas = horas_trabalhadas;
        const saldo = 0; // horário padrão = saldo zero

        if (existing) {
          updateStmt.run(
            jornadaDia.entrada, jornadaDia.saida_almoco, jornadaDia.volta_almoco, jornadaDia.saida,
            'normal', horas_trabalhadas, horas_previstas, saldo,
            funcionario_id, dataStr
          );
        } else {
          insertStmt.run(
            funcionario_id, dataStr,
            jornadaDia.entrada, jornadaDia.saida_almoco, jornadaDia.volta_almoco, jornadaDia.saida,
            'normal', null, horas_trabalhadas, horas_previstas, saldo
          );
        }
        inseridos++;
      }
    });

    transaction();

    res.json({ ok: true, inseridos, ignorados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ponto/registros/lote-todos — preencher mês pra TODOS funcionários ativos
router.post('/registros/lote-todos', requireAuth, (req, res) => {
  try {
    const { mes, sobrescrever } = req.body;
    if (!mes) return res.status(400).json({ error: 'mes é obrigatório' });

    const funcs = db.prepare('SELECT id, data_admissao FROM funcionarios WHERE ativo = 1').all();
    const cfg = getConfig();
    const [anoStr, mesStr] = mes.split('-');
    const ano = parseInt(anoStr);
    const mesNum = parseInt(mesStr);
    const diasNoMes = new Date(ano, mesNum, 0).getDate();
    const hoje = new Date();
    hoje.setHours(23, 59, 59);

    const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    let totalInseridos = 0;

    const insertStmt = db.prepare(`INSERT OR IGNORE INTO ponto_registros
      (funcionario_id, data, entrada, saida_almoco, volta_almoco, saida, tipo, obs, horas_trabalhadas, horas_previstas, saldo_minutos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const updateStmt = db.prepare(`UPDATE ponto_registros SET
      entrada=?, saida_almoco=?, volta_almoco=?, saida=?, tipo=?,
      horas_trabalhadas=?, horas_previstas=?, saldo_minutos=?, atualizado_em=CURRENT_TIMESTAMP
      WHERE funcionario_id=? AND data=?`);

    const existsStmt = db.prepare('SELECT id FROM ponto_registros WHERE funcionario_id=? AND data=?');

    const transaction = db.transaction(() => {
      for (const func of funcs) {
        for (let d = 1; d <= diasNoMes; d++) {
          const dataStr = `${ano}-${String(mesNum).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const dateObj = new Date(dataStr + 'T12:00:00');
          if (dateObj > hoje) continue;
          // Pular antes da admissão
          if (func.data_admissao && dataStr < func.data_admissao) continue;

          const dow = dias[dateObj.getDay()];
          const jornadaDia = cfg.jornada[dow];
          if (!jornadaDia) continue;

          const existing = existsStmt.get(func.id, dataStr);
          if (existing && !sobrescrever) continue;

          const ehFeriado = isFeriado(dataStr);

          if (ehFeriado) {
            if (existing) {
              updateStmt.run(null, null, null, null, 'feriado', 0, 0, 0, func.id, dataStr);
            } else {
              insertStmt.run(func.id, dataStr, null, null, null, null, 'feriado', null, 0, 0, 0);
            }
            totalInseridos++;
            continue;
          }

          const ht = calcHorasTrabalhadas(jornadaDia.entrada, jornadaDia.saida_almoco, jornadaDia.volta_almoco, jornadaDia.saida);

          if (existing) {
            updateStmt.run(jornadaDia.entrada, jornadaDia.saida_almoco, jornadaDia.volta_almoco, jornadaDia.saida, 'normal', ht, ht, 0, func.id, dataStr);
          } else {
            insertStmt.run(func.id, dataStr, jornadaDia.entrada, jornadaDia.saida_almoco, jornadaDia.volta_almoco, jornadaDia.saida, 'normal', null, ht, ht, 0);
          }
          totalInseridos++;
        }
      }
    });

    transaction();
    res.json({ ok: true, inseridos: totalInseridos, funcionarios: funcs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// RESUMO MENSAL
// ═══════════════════════════════════════════════════════

// GET /api/ponto/resumo?mes=2026-04
router.get('/resumo', requireAuth, (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: 'Parâmetro "mes" é obrigatório (ex: 2026-04)' });

    const inicio = `${mes}-01`;
    const [ano, mesNum] = mes.split('-').map(Number);
    const ultimoDia = new Date(ano, mesNum, 0).getDate();
    const fim = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

    const cfg = getConfig();

    // Buscar todos os funcionários ativos
    const funcionarios = db.prepare('SELECT * FROM funcionarios WHERE ativo = 1 ORDER BY nome').all();

    const resumo = funcionarios.map(func => {
      const registros = db.prepare(
        'SELECT * FROM ponto_registros WHERE funcionario_id = ? AND data >= ? AND data <= ? ORDER BY data'
      ).all(func.id, inicio, fim);

      let dias_trabalhados = 0;
      let horas_trabalhadas_total = 0;
      let horas_previstas_total = 0;
      let faltas = 0;
      let atestados = 0;
      let ferias = 0;
      let atrasos_count = 0;

      // Calcular horas previstas para dias úteis do mês inteiro (sem registro)
      // Primeiro, montar mapa de registros por data
      const registroMap = {};
      for (const r of registros) {
        registroMap[r.data] = r;
      }

      // Iterar todos os dias do mês
      for (let dia = 1; dia <= ultimoDia; dia++) {
        const dataStr = `${mes}-${String(dia).padStart(2, '0')}`;
        // Pular dias antes da admissão
        if (func.data_admissao && dataStr < func.data_admissao) continue;
        const jornadaDia = getJornadaDia(cfg.jornada, dataStr);
        const feriado = isFeriado(dataStr);
        const reg = registroMap[dataStr];

        // Se não tem jornada (fim de semana) e não tem registro, pular
        if (!jornadaDia && !reg) continue;
        // Se é feriado e não tem registro, pular
        if (feriado && !reg) continue;

        if (reg) {
          horas_trabalhadas_total += reg.horas_trabalhadas || 0;
          horas_previstas_total += reg.horas_previstas || 0;

          if (reg.tipo === 'normal' && reg.entrada) {
            dias_trabalhados++;
            // Verificar atraso
            if (jornadaDia && jornadaDia.entrada) {
              const diff = timeToMinutes(reg.entrada) - timeToMinutes(jornadaDia.entrada);
              if (diff > (cfg.tolerancia_min || 5)) atrasos_count++;
            }
          }
          if (reg.tipo === 'falta') faltas++;
          if (reg.tipo === 'atestado') atestados++;
          if (reg.tipo === 'ferias') ferias++;
        } else if (jornadaDia && !feriado) {
          // Dia útil sem registro = possível falta (apenas dias passados)
          const hoje = new Date().toISOString().split('T')[0];
          if (dataStr <= hoje) {
            horas_previstas_total += getHorasPrevistas(jornadaDia);
          }
        }
      }

      const saldo_banco_horas = Math.round((horas_trabalhadas_total - horas_previstas_total) * 60);
      const horas_extras = saldo_banco_horas > 0 ? saldo_banco_horas / 60 : 0;
      const horas_falta = saldo_banco_horas < 0 ? Math.abs(saldo_banco_horas) / 60 : 0;

      return {
        funcionario_id: func.id,
        funcionario_nome: func.nome,
        cargo: func.cargo,
        dias_trabalhados,
        horas_trabalhadas_total: Math.round(horas_trabalhadas_total * 100) / 100,
        horas_previstas_total: Math.round(horas_previstas_total * 100) / 100,
        horas_extras: Math.round(horas_extras * 100) / 100,
        horas_falta: Math.round(horas_falta * 100) / 100,
        saldo_banco_horas,
        faltas,
        atestados,
        ferias,
        atrasos_count,
      };
    });

    res.json(resumo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// BANCO DE HORAS ACUMULADO
// ═══════════════════════════════════════════════════════

// GET /api/ponto/banco-horas?mes=2026-04
// Retorna saldo acumulado (meses anteriores) + saldo do mês atual por funcionário
router.get('/banco-horas', requireAuth, (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: 'Parâmetro "mes" é obrigatório (ex: 2026-04)' });

    const inicioMes = `${mes}-01`;
    const [ano, mesNum] = mes.split('-').map(Number);
    const ultimoDia = new Date(ano, mesNum, 0).getDate();
    const fimMes = `${mes}-${String(ultimoDia).padStart(2, '0')}`;

    const funcionarios = db.prepare('SELECT * FROM funcionarios WHERE ativo = 1 ORDER BY nome').all();

    const result = funcionarios.map(func => {
      // Saldo acumulado de TODOS os meses anteriores (respeitando data de admissão)
      const admFilt = func.data_admissao ? ` AND data >= '${func.data_admissao}'` : '';
      const anterior = db.prepare(
        `SELECT COALESCE(SUM(saldo_minutos), 0) as total FROM ponto_registros WHERE funcionario_id = ? AND data < ?${admFilt}`
      ).get(func.id, inicioMes);

      // Saldo do mês atual
      const mesAtual = db.prepare(
        'SELECT COALESCE(SUM(saldo_minutos), 0) as total FROM ponto_registros WHERE funcionario_id = ? AND data >= ? AND data <= ?'
      ).get(func.id, inicioMes, fimMes);

      const saldo_anterior = anterior.total || 0;
      const saldo_mes = mesAtual.total || 0;
      const saldo_acumulado = saldo_anterior + saldo_mes;

      return {
        funcionario_id: func.id,
        funcionario_nome: func.nome,
        saldo_anterior,      // minutos acumulados até o mês passado
        saldo_mes,           // minutos do mês atual
        saldo_acumulado,     // total geral
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// RELATÓRIO PDF
// ═══════════════════════════════════════════════════════

router.get('/relatorio-pdf', requireAuth, async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: 'Parâmetro "mes" obrigatório (ex: 2026-04)' });

    const [ano, mesNum] = mes.split('-').map(Number);
    const ultimoDia = new Date(ano, mesNum, 0).getDate();
    const inicioMes = `${mes}-01`;
    const fimMes = `${mes}-${String(ultimoDia).padStart(2, '0')}`;
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const nomeMes = `${meses[mesNum - 1]} ${ano}`;
    const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    // Cor do sistema
    const empresa = db.prepare('SELECT nome, sistema_cor_primaria FROM empresa_config WHERE id = 1').get();
    const COR = empresa?.sistema_cor_primaria || '#1379F0';
    const nomeEmpresa = empresa?.nome || '${nomeEmpresa}';

    const cfg = getConfig();
    const funcionarios = db.prepare('SELECT * FROM funcionarios WHERE ativo = 1 ORDER BY nome').all();
    const feriados = db.prepare("SELECT * FROM ponto_feriados WHERE data >= ? AND data <= ?").all(inicioMes, fimMes);
    const feriadoSet = new Set(feriados.map(f => f.data));

    // Build data per employee
    const empData = funcionarios.map(func => {
      const registros = db.prepare(
        'SELECT * FROM ponto_registros WHERE funcionario_id = ? AND data >= ? AND data <= ? ORDER BY data'
      ).all(func.id, inicioMes, fimMes);

      const regMap = {};
      registros.forEach(r => { regMap[r.data] = r; });

      // Banco horas anterior
      const bhAnterior = db.prepare(
        'SELECT COALESCE(SUM(saldo_minutos), 0) as total FROM ponto_registros WHERE funcionario_id = ? AND data < ?'
      ).get(func.id, inicioMes).total || 0;

      let trabalhadas = 0, previstas = 0, atrasos = 0, faltas = 0, atestados = 0, feriasDias = 0;
      const diasDetail = []; // all days
      const atrasosDetail = [];

      for (let d = 1; d <= ultimoDia; d++) {
        const dataStr = `${mes}-${String(d).padStart(2, '0')}`;
        // Pular dias antes da admissão
        if (func.data_admissao && dataStr < func.data_admissao) continue;
        const dateObj = new Date(dataStr + 'T12:00:00');
        const dow = dateObj.getDay();
        const jornadaDia = getJornadaDia(cfg.jornada, dataStr);
        const ehFeriado = feriadoSet.has(dataStr);
        const reg = regMap[dataStr];

        const isOff = !jornadaDia || ehFeriado;
        const hp = isOff ? 0 : getHorasPrevistas(jornadaDia);
        let ht = 0;
        let tipo = 'folga';
        let status = 'folga';

        if (reg) {
          tipo = reg.tipo || 'normal';
          if (tipo === 'normal' || tipo === 'compensacao') {
            ht = calcHorasTrabalhadas(reg.entrada, reg.saida_almoco, reg.volta_almoco, reg.saida);
            if (jornadaDia && reg.entrada) {
              const diff = timeToMinutes(reg.entrada) - timeToMinutes(jornadaDia.entrada);
              if (diff > (cfg.tolerancia_min || 5)) {
                atrasos++;
                status = 'atraso';
                atrasosDetail.push({ data: dataStr, min: diff });
              } else {
                status = 'normal';
              }
            } else {
              status = 'normal';
            }
          } else if (tipo === 'atestado') {
            ht = hp; atestados++; status = 'atestado';
          } else if (tipo === 'ferias') {
            feriasDias++; status = 'ferias';
          } else if (tipo === 'falta') {
            faltas++; status = 'falta';
          } else if (tipo === 'feriado') {
            status = 'feriado';
          } else {
            status = tipo;
          }
        } else if (ehFeriado) {
          status = 'feriado'; tipo = 'feriado';
        } else if (!jornadaDia) {
          status = 'folga'; tipo = 'folga';
        } else {
          // Dia útil sem registro no passado = falta
          const hoje = new Date().toISOString().split('T')[0];
          if (dataStr <= hoje) { faltas++; status = 'falta'; tipo = 'falta'; }
          else { status = 'futuro'; tipo = 'futuro'; }
        }

        trabalhadas += ht;
        if (!['feriado', 'folga', 'ferias', 'futuro'].includes(status)) previstas += hp;

        diasDetail.push({
          dia: d, dow, dataStr, status, tipo,
          entrada: reg?.entrada || '', saida: reg?.saida || '',
          ht: Math.round(ht * 100) / 100,
          hp: Math.round(hp * 100) / 100,
        });
      }

      const saldoMes = Math.round((trabalhadas - previstas) * 60);
      const bancoTotal = bhAnterior + saldoMes;

      return {
        func, trabalhadas, previstas, atrasos, faltas, atestados, feriasDias,
        saldoMes, bhAnterior, bancoTotal,
        diasDetail, atrasosDetail,
      };
    });

    // Totals
    const totals = { trabalhadas: 0, previstas: 0, atrasos: 0, faltas: 0, atestados: 0 };
    empData.forEach(e => { totals.trabalhadas += e.trabalhadas; totals.previstas += e.previstas; totals.atrasos += e.atrasos; totals.faltas += e.faltas; totals.atestados += e.atestados; });
    totals.saldo = Math.round((totals.trabalhadas - totals.previstas) * 60);

    const fmtH = (hrs) => { const m = Math.round(hrs * 60); const s = m < 0 ? '−' : ''; const a = Math.abs(m); return `${s}${Math.floor(a/60)}h${String(a%60).padStart(2,'0')}`; };
    const fmtMin = (mins) => { const s = mins < 0 ? '−' : ''; const a = Math.abs(mins); return `${s}${Math.floor(a/60)}h${String(a%60).padStart(2,'0')}`; };
    const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase();

    // Paleta — identidade Ornato (grafite + cobre) com feedback semântico sóbrio
    const INK       = '#0E1116';
    const INK_SOFT  = '#1B1F26';
    const COBRE     = '#C9A96E';
    const COBRE_DK  = '#A8864D';
    const TEXT      = '#1D232B';
    const TEXT_2    = '#5B6472';
    const TEXT_3    = '#8B94A3';
    const LINE      = '#E6E9EF';
    const LINE_2    = '#F2F4F8';
    const BG_SOFT   = '#FAFBFD';
    const POS       = '#16A34A';
    const NEG       = '#DC2626';
    const WARN      = '#D97706';
    const INFO      = '#2563EB';
    const FERIAS    = '#7C3AED';
    const MUTED     = '#9CA3AF';

    const statusColor = { normal:POS, atraso:WARN, falta:NEG, atestado:INFO, ferias:FERIAS, feriado:MUTED, folga:MUTED, compensacao:'#8B5CF6', futuro:'#E5E7EB' };
    const statusLabel = { normal:'Normal', atraso:'Atraso', falta:'Falta', atestado:'Atestado', ferias:'Férias', feriado:'Feriado', folga:'Folga', compensacao:'Comp.', futuro:'' };

    const dataGeracao = new Date().toLocaleDateString('pt-BR');
    const horaGeracao = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // ── Build HTML ──
    let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<style>
  @page { size: A4 portrait; margin: 10mm 9mm 12mm 9mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    font-size: 10px; color: ${TEXT}; background: #fff;
    font-feature-settings: 'ss01', 'cv11'; -webkit-font-smoothing: antialiased;
  }
  .num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
  .page { page-break-after: always; position: relative; padding-bottom: 18px; }
  .page:last-child { page-break-after: auto; }

  /* Hero header */
  .hero {
    position: relative; padding: 22px 26px 20px; color: #fff; border-radius: 14px;
    background: linear-gradient(135deg, ${INK} 0%, ${INK_SOFT} 60%, #22262F 100%);
    overflow: hidden; margin-bottom: 16px;
  }
  .hero::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, ${COBRE} 0%, ${COBRE_DK} 100%); }
  .hero::after { content: ''; position: absolute; right: -80px; top: -80px; width: 240px; height: 240px; background: radial-gradient(circle, ${COBRE}22 0%, transparent 70%); border-radius: 50%; }
  .hero-inner { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
  .hero-kicker { font-size: 9px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: ${COBRE}; margin-bottom: 6px; }
  .hero h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; margin-bottom: 4px; }
  .hero .hero-sub { font-size: 10.5px; color: rgba(255,255,255,0.65); font-weight: 400; }
  .hero .hero-meta { text-align: right; }
  .hero .hero-periodo { font-size: 14px; font-weight: 700; color: #fff; letter-spacing: -0.2px; }
  .hero .hero-empresa { font-size: 9.5px; color: rgba(255,255,255,0.55); margin-top: 3px; font-weight: 500; }
  .hero .hero-divider { width: 32px; height: 1px; background: ${COBRE}; margin: 8px 0 0 auto; opacity: 0.6; }

  /* KPI cards */
  .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 16px; }
  .kpi { background: #fff; border: 1px solid ${LINE}; border-radius: 10px; padding: 11px 10px 10px 14px; position: relative; overflow: hidden; }
  .kpi::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; background: ${COBRE}; opacity: 0.9; }
  .kpi.k-pos::before { background: ${POS}; }
  .kpi.k-neg::before { background: ${NEG}; }
  .kpi.k-warn::before { background: ${WARN}; }
  .kpi.k-info::before { background: ${INFO}; }
  .kpi-label { font-size: 7.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: ${TEXT_3}; margin-bottom: 5px; }
  .kpi-value { font-size: 19px; font-weight: 800; color: ${TEXT}; line-height: 1; letter-spacing: -0.5px; }
  .kpi-value.pos { color: ${POS}; }
  .kpi-value.neg { color: ${NEG}; }
  .kpi-value.warn { color: ${WARN}; }
  .kpi-value.info { color: ${INFO}; }

  /* Section heading */
  .section-head { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; }
  .section-head::before { content: ''; width: 3px; height: 14px; background: ${COBRE}; border-radius: 2px; }
  .section-head h3 { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: ${TEXT}; }
  .section-head .sh-sub { font-size: 9.5px; color: ${TEXT_3}; font-weight: 500; margin-left: auto; }

  /* Tabela resumo */
  .tbl { width: 100%; border-collapse: collapse; }
  .tbl thead th {
    padding: 9px 10px; font-size: 8px; font-weight: 700; letter-spacing: 0.8px;
    text-transform: uppercase; color: ${TEXT_2}; text-align: left;
    border-bottom: 1.5px solid ${INK}; background: #fff;
  }
  .tbl tbody td { padding: 9px 10px; font-size: 10px; border-bottom: 1px solid ${LINE_2}; vertical-align: middle; }
  .tbl tbody tr:last-child td { border-bottom: 1px solid ${LINE}; }
  .tbl .tc { text-align: center; }
  .tbl .name { font-weight: 600; color: ${TEXT}; }
  .tbl .cargo { color: ${TEXT_3}; font-size: 9px; }
  .tbl .av { display: inline-flex; align-items: center; gap: 8px; }
  .tbl .av-ball {
    width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    font-size: 8.5px; font-weight: 700; color: #fff;
    background: linear-gradient(135deg, ${INK_SOFT}, ${INK});
    box-shadow: inset 0 0 0 1.5px ${COBRE}55;
  }
  .tbl .zero { color: ${TEXT_3}; }
  .tbl .strong-pos { color: ${POS}; font-weight: 700; }
  .tbl .strong-neg { color: ${NEG}; font-weight: 700; }

  /* Comparativo bar chart */
  .cmp { margin-top: 8px; padding: 14px 16px 4px; background: ${BG_SOFT}; border: 1px solid ${LINE}; border-radius: 12px; }
  .cmp-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px dashed ${LINE}; }
  .cmp-row:last-child { border-bottom: none; }
  .cmp-name { width: 90px; font-size: 9.5px; font-weight: 600; color: ${TEXT}; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cmp-bars { flex: 1; position: relative; height: 18px; }
  .cmp-prev { position: absolute; top: 2px; height: 6px; background: ${LINE}; border-radius: 3px; }
  .cmp-trab { position: absolute; top: 10px; height: 6px; border-radius: 3px; }
  .cmp-vals { width: 110px; font-size: 8.5px; color: ${TEXT_2}; text-align: left; }
  .cmp-vals .v-t { font-weight: 700; color: ${TEXT}; }
  .cmp-legend { display: flex; gap: 14px; justify-content: flex-end; margin-top: 8px; padding-top: 6px; border-top: 1px solid ${LINE_2}; font-size: 8px; color: ${TEXT_3}; font-weight: 600; }
  .cmp-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }

  /* Employee page */
  .emp-hero {
    position: relative; padding: 20px 24px; color: #fff; border-radius: 14px;
    background: linear-gradient(135deg, ${INK} 0%, ${INK_SOFT} 100%);
    overflow: hidden; margin-bottom: 14px;
  }
  .emp-hero::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: ${COBRE}; }
  .emp-hero::after { content: ''; position: absolute; right: -60px; bottom: -60px; width: 180px; height: 180px; background: radial-gradient(circle, ${COBRE}18 0%, transparent 70%); border-radius: 50%; }
  .emp-inner { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; gap: 18px; }
  .emp-id { display: flex; align-items: center; gap: 14px; }
  .emp-avatar { width: 46px; height: 46px; border-radius: 50%; background: linear-gradient(135deg, ${COBRE}, ${COBRE_DK}); color: ${INK}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; letter-spacing: -0.5px; box-shadow: 0 0 0 2px rgba(255,255,255,0.08); }
  .emp-id h2 { font-size: 17px; font-weight: 800; letter-spacing: -0.3px; line-height: 1.1; }
  .emp-id .emp-cargo { font-size: 9.5px; color: rgba(255,255,255,0.6); margin-top: 4px; font-weight: 500; }
  .emp-id .emp-cargo span { color: ${COBRE}; margin: 0 6px; }
  .emp-banco { text-align: right; padding-left: 16px; border-left: 1px solid rgba(255,255,255,0.1); }
  .emp-banco-kicker { font-size: 7.5px; letter-spacing: 1.5px; text-transform: uppercase; color: ${COBRE}; font-weight: 700; margin-bottom: 3px; }
  .emp-banco-val { font-size: 26px; font-weight: 900; letter-spacing: -1px; line-height: 1; }
  .emp-banco-val.pos { color: #4ADE80; }
  .emp-banco-val.neg { color: #F87171; }
  .emp-banco-sub { font-size: 8.5px; color: rgba(255,255,255,0.5); margin-top: 4px; font-weight: 500; }

  /* Decomposição do banco */
  .bk-flow { display: grid; grid-template-columns: 1fr 20px 1fr 20px 1.1fr; gap: 0; align-items: stretch; padding: 12px 8px; background: #fff; border: 1px solid ${LINE}; border-radius: 10px; margin-bottom: 12px; }
  .bk-item { text-align: center; padding: 4px 8px; }
  .bk-item .bk-lbl { font-size: 7.5px; letter-spacing: 0.8px; text-transform: uppercase; color: ${TEXT_3}; font-weight: 700; margin-bottom: 3px; }
  .bk-item .bk-val { font-size: 15px; font-weight: 800; letter-spacing: -0.3px; }
  .bk-total { background: ${BG_SOFT}; border-radius: 8px; margin: -4px 0; }
  .bk-total .bk-val { font-size: 17px; }
  .bk-total .bk-lbl { color: ${COBRE_DK}; }
  .bk-op { display: flex; align-items: center; justify-content: center; font-size: 16px; color: ${TEXT_3}; font-weight: 300; }

  /* Stats row */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(82px, 1fr)); gap: 7px; margin-bottom: 12px; }
  .stat { padding: 9px 10px; border-radius: 9px; background: #fff; border: 1px solid ${LINE}; position: relative; }
  .stat .s-top { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; }
  .stat .sv { font-size: 15px; font-weight: 800; color: ${TEXT}; letter-spacing: -0.3px; line-height: 1; }
  .stat .sv.pos { color: ${POS}; }
  .stat .sv.neg { color: ${NEG}; }
  .stat .sv.warn { color: ${WARN}; }
  .stat .sv.info { color: ${INFO}; }
  .stat .s-dot { width: 6px; height: 6px; border-radius: 50%; background: ${TEXT_3}; }
  .stat .s-dot.pos { background: ${POS}; }
  .stat .s-dot.neg { background: ${NEG}; }
  .stat .s-dot.warn { background: ${WARN}; }
  .stat .s-dot.info { background: ${INFO}; }
  .stat .sl { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.9px; color: ${TEXT_2}; margin-top: 5px; }

  /* Progresso */
  .prog { margin-bottom: 12px; padding: 10px 12px; background: #fff; border: 1px solid ${LINE}; border-radius: 9px; }
  .prog-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .prog-top .p-title { font-size: 8px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: ${TEXT_2}; }
  .prog-top .p-pct { font-size: 13px; font-weight: 800; color: ${TEXT}; letter-spacing: -0.3px; }
  .prog-top .p-pct .p-frac { font-size: 9px; color: ${TEXT_3}; font-weight: 600; margin-left: 6px; }
  .prog-bar { height: 6px; background: ${LINE}; border-radius: 3px; overflow: hidden; position: relative; }
  .prog-fill { height: 100%; border-radius: 3px; position: relative; }

  /* Atrasos */
  .delays { padding: 11px 14px; background: #FFFBEB; border: 1px solid #FCD97B; border-radius: 10px; margin-bottom: 12px; border-left: 3px solid ${WARN}; }
  .delays-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
  .delays-head h4 { font-size: 9.5px; font-weight: 700; color: #854D0E; letter-spacing: 0.5px; text-transform: uppercase; }
  .delays-head .d-count { font-size: 9px; font-weight: 700; color: ${WARN}; background: #fff; padding: 2px 8px; border-radius: 10px; border: 1px solid #FCD97B; }
  .delay-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; margin: 2px 3px 2px 0; font-size: 8.5px; background: #fff; border-radius: 14px; border: 1px solid #FCD97B; color: #78350F; }
  .delay-chip strong { color: ${WARN}; font-weight: 700; }

  /* Day-by-day table */
  .dtbl { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  .dtbl thead th {
    padding: 6px 5px; font-size: 7.5px; font-weight: 700; letter-spacing: 0.7px;
    text-transform: uppercase; text-align: center; color: ${TEXT_2};
    background: ${BG_SOFT}; border-bottom: 1.5px solid ${INK}; border-top: 1px solid ${LINE};
  }
  .dtbl thead th:first-child { border-top-left-radius: 6px; text-align: left; padding-left: 10px; }
  .dtbl thead th:last-child { border-top-right-radius: 6px; padding-right: 10px; }
  .dtbl tbody td { padding: 4.5px 5px; text-align: center; border-bottom: 1px solid ${LINE_2}; }
  .dtbl tbody td:first-child { text-align: left; padding-left: 10px; }
  .dtbl tbody td:last-child { padding-right: 10px; }
  .dtbl .d-num { font-weight: 700; color: ${TEXT}; }
  .dtbl .d-dow { font-size: 7.5px; color: ${TEXT_3}; font-weight: 600; text-transform: uppercase; }
  .dtbl tr.weekend td { background: ${BG_SOFT}; color: ${TEXT_3}; }
  .dtbl tr.weekend .d-num { color: ${TEXT_2}; }
  .dtbl .time { color: ${TEXT}; font-weight: 500; }
  .dtbl .time-empty { color: ${TEXT_3}; }

  /* Status pill */
  .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-size: 8px; font-weight: 700; letter-spacing: 0.2px; }
  .pill .pdot { width: 5px; height: 5px; border-radius: 50%; }

  /* Footer */
  .footer {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 2px 0; margin-top: 14px;
    font-size: 7.5px; color: ${TEXT_3}; font-weight: 500;
    border-top: 1px solid ${LINE};
  }
  .footer .f-brand { color: ${TEXT_2}; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
  .footer .f-brand span { color: ${COBRE_DK}; }
</style></head><body>`;

    // ══════════════════════════════════════════════════════
    // PAGE 1: RESUMO GERAL
    // ══════════════════════════════════════════════════════
    html += `<div class="page">
      <header class="hero">
        <div class="hero-inner">
          <div>
            <div class="hero-kicker">Relatório Mensal · Controle de Ponto</div>
            <h1>Resumo Consolidado</h1>
            <div class="hero-sub">${funcionarios.length} colaborador${funcionarios.length === 1 ? '' : 'es'} · ${ultimoDia} dias no período</div>
          </div>
          <div class="hero-meta">
            <div class="hero-periodo">${nomeMes}</div>
            <div class="hero-empresa">${nomeEmpresa}</div>
            <div class="hero-divider"></div>
          </div>
        </div>
      </header>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Colaboradores</div><div class="kpi-value num">${funcionarios.length}</div></div>
        <div class="kpi"><div class="kpi-label">Horas Trabalhadas</div><div class="kpi-value num">${fmtH(totals.trabalhadas)}</div></div>
        <div class="kpi ${totals.saldo >= 0 ? 'k-pos' : 'k-neg'}"><div class="kpi-label">Saldo Geral</div><div class="kpi-value num ${totals.saldo >= 0 ? 'pos' : 'neg'}">${totals.saldo >= 0 ? '+' : ''}${fmtMin(totals.saldo)}</div></div>
        <div class="kpi k-warn"><div class="kpi-label">Atrasos</div><div class="kpi-value num warn">${totals.atrasos}</div></div>
        <div class="kpi k-neg"><div class="kpi-label">Faltas</div><div class="kpi-value num neg">${totals.faltas}</div></div>
        <div class="kpi k-info"><div class="kpi-label">Atestados</div><div class="kpi-value num info">${totals.atestados}</div></div>
      </div>

      <div class="section-head"><h3>Colaboradores · visão individual</h3><span class="sh-sub">${empData.length} linha${empData.length === 1 ? '' : 's'}</span></div>

      <table class="tbl">
        <thead><tr>
          <th>Colaborador</th>
          <th>Cargo</th>
          <th class="tc">Trab.</th>
          <th class="tc">Prev.</th>
          <th class="tc">Saldo Mês</th>
          <th class="tc">Banco Acum.</th>
          <th class="tc">Atr.</th>
          <th class="tc">Falt.</th>
          <th class="tc">Atest.</th>
        </tr></thead>
        <tbody>`;

    empData.forEach(e => {
      const sClass = e.saldoMes >= 0 ? 'strong-pos' : 'strong-neg';
      const bClass = e.bancoTotal >= 0 ? 'strong-pos' : 'strong-neg';
      html += `<tr>
        <td><span class="av"><span class="av-ball">${initials(e.func.nome)}</span><span class="name">${e.func.nome}</span></span></td>
        <td class="cargo">${e.func.cargo || '—'}</td>
        <td class="tc num" style="font-weight:600">${fmtH(e.trabalhadas)}</td>
        <td class="tc num" style="color:${TEXT_3}">${fmtH(e.previstas)}</td>
        <td class="tc num ${sClass}">${e.saldoMes >= 0 ? '+' : ''}${fmtMin(e.saldoMes)}</td>
        <td class="tc num ${bClass}" style="font-weight:800">${e.bancoTotal >= 0 ? '+' : ''}${fmtMin(e.bancoTotal)}</td>
        <td class="tc num ${e.atrasos ? '' : 'zero'}" style="font-weight:600;${e.atrasos ? `color:${WARN}` : ''}">${e.atrasos || '—'}</td>
        <td class="tc num ${e.faltas ? '' : 'zero'}" style="font-weight:600;${e.faltas ? `color:${NEG}` : ''}">${e.faltas || '—'}</td>
        <td class="tc num ${e.atestados ? '' : 'zero'}" style="font-weight:600;${e.atestados ? `color:${INFO}` : ''}">${e.atestados || '—'}</td>
      </tr>`;
    });

    html += `</tbody></table>

      <div class="section-head"><h3>Horas Trabalhadas vs Previstas</h3><span class="sh-sub">comparativo mensal</span></div>
      <div class="cmp">`;

    const maxH = Math.max(...empData.map(e => Math.max(e.trabalhadas, e.previstas)), 1);
    empData.forEach(e => {
      const pctT = Math.min(Math.round((e.trabalhadas / maxH) * 100), 100);
      const pctP = Math.min(Math.round((e.previstas / maxH) * 100), 100);
      const firstName = e.func.nome.split(' ')[0];
      const barColor = e.trabalhadas >= e.previstas ? POS : WARN;
      html += `<div class="cmp-row">
        <div class="cmp-name">${firstName}</div>
        <div class="cmp-bars">
          <div class="cmp-prev" style="width:${pctP}%"></div>
          <div class="cmp-trab" style="width:${pctT}%;background:${barColor}"></div>
        </div>
        <div class="cmp-vals num"><span class="v-t">${fmtH(e.trabalhadas)}</span> / ${fmtH(e.previstas)}</div>
      </div>`;
    });

    html += `<div class="cmp-legend">
        <span><span class="dot" style="background:${LINE}"></span>Previsto</span>
        <span><span class="dot" style="background:${POS}"></span>Trabalhado (meta atingida)</span>
        <span><span class="dot" style="background:${WARN}"></span>Trabalhado (abaixo)</span>
      </div></div>

      <div class="footer">
        <div class="f-brand">Ornato<span> · ERP</span></div>
        <div>Gerado em ${dataGeracao} às ${horaGeracao} · ${nomeEmpresa}</div>
        <div>Pág. 1 / ${empData.length + 1}</div>
      </div>
    </div>`;

    // ══════════════════════════════════════════════════════
    // PAGES 2+: UMA POR FUNCIONÁRIO
    // ══════════════════════════════════════════════════════
    empData.forEach((e, idx) => {
      const pctTrab = e.previstas > 0 ? Math.min(Math.round((e.trabalhadas / e.previstas) * 100), 150) : 0;
      const barColor = pctTrab >= 100 ? POS : (pctTrab >= 90 ? COBRE : WARN);
      const extras = e.trabalhadas > e.previstas ? (e.trabalhadas - e.previstas) : 0;
      const deficit = e.previstas > e.trabalhadas ? (e.previstas - e.trabalhadas) : 0;
      const diasRegistrados = e.diasDetail.filter(d => d.status !== 'futuro').length;

      html += `<div class="page">
        <section class="emp-hero">
          <div class="emp-inner">
            <div class="emp-id">
              <div class="emp-avatar">${initials(e.func.nome)}</div>
              <div>
                <h2>${e.func.nome}</h2>
                <div class="emp-cargo">${e.func.cargo || 'Sem cargo'}${e.func.cpf ? `<span>·</span>CPF ${e.func.cpf}` : ''}<span>·</span>${nomeMes}</div>
              </div>
            </div>
            <div class="emp-banco">
              <div class="emp-banco-kicker">Banco de Horas</div>
              <div class="emp-banco-val num ${e.bancoTotal >= 0 ? 'pos' : 'neg'}">${e.bancoTotal >= 0 ? '+' : ''}${fmtMin(e.bancoTotal)}</div>
              <div class="emp-banco-sub">saldo acumulado</div>
            </div>
          </div>
        </section>

        <div class="bk-flow">
          <div class="bk-item">
            <div class="bk-lbl">Meses Anteriores</div>
            <div class="bk-val num" style="color:${e.bhAnterior >= 0 ? POS : NEG}">${e.bhAnterior >= 0 ? '+' : ''}${fmtMin(e.bhAnterior)}</div>
          </div>
          <div class="bk-op">+</div>
          <div class="bk-item">
            <div class="bk-lbl">Saldo ${meses[mesNum-1]}</div>
            <div class="bk-val num" style="color:${e.saldoMes >= 0 ? POS : NEG}">${e.saldoMes >= 0 ? '+' : ''}${fmtMin(e.saldoMes)}</div>
          </div>
          <div class="bk-op">=</div>
          <div class="bk-item bk-total">
            <div class="bk-lbl">Acumulado Total</div>
            <div class="bk-val num" style="color:${e.bancoTotal >= 0 ? POS : NEG}">${e.bancoTotal >= 0 ? '+' : ''}${fmtMin(e.bancoTotal)}</div>
          </div>
        </div>

        <div class="stats">
          <div class="stat"><div class="s-top"><div class="sv num pos">${fmtH(e.trabalhadas)}</div><div class="s-dot pos"></div></div><div class="sl">Trabalhadas</div></div>
          <div class="stat"><div class="s-top"><div class="sv num">${fmtH(e.previstas)}</div><div class="s-dot"></div></div><div class="sl">Previstas</div></div>
          ${extras > 0 ? `<div class="stat"><div class="s-top"><div class="sv num pos">+${fmtH(extras)}</div><div class="s-dot pos"></div></div><div class="sl">Extras</div></div>` : ''}
          ${deficit > 0 ? `<div class="stat"><div class="s-top"><div class="sv num neg">−${fmtH(deficit)}</div><div class="s-dot neg"></div></div><div class="sl">Déficit</div></div>` : ''}
          <div class="stat"><div class="s-top"><div class="sv num warn">${e.atrasos}</div><div class="s-dot warn"></div></div><div class="sl">Atrasos</div></div>
          <div class="stat"><div class="s-top"><div class="sv num neg">${e.faltas}</div><div class="s-dot neg"></div></div><div class="sl">Faltas</div></div>
          <div class="stat"><div class="s-top"><div class="sv num info">${e.atestados}</div><div class="s-dot info"></div></div><div class="sl">Atestados</div></div>
        </div>

        <div class="prog">
          <div class="prog-top">
            <div class="p-title">Cumprimento do mês</div>
            <div class="p-pct num">${pctTrab}<span style="font-size:10px;color:${TEXT_3}">%</span><span class="p-frac">${fmtH(e.trabalhadas)} / ${fmtH(e.previstas)}</span></div>
          </div>
          <div class="prog-bar">
            <div class="prog-fill" style="width:${Math.min(pctTrab, 100)}%;background:linear-gradient(90deg, ${barColor} 0%, ${barColor}cc 100%)"></div>
          </div>
        </div>`;

      // Atrasos detail
      if (e.atrasosDetail.length > 0) {
        html += `<div class="delays">
          <div class="delays-head">
            <h4>Detalhamento de Atrasos</h4>
            <span class="d-count num">${e.atrasos} ocorrência${e.atrasos === 1 ? '' : 's'}</span>
          </div>
          <div>`;
        e.atrasosDetail.forEach(a => {
          const [,, dd] = a.data.split('-');
          html += `<span class="delay-chip"><span class="num">${dd}/${String(mesNum).padStart(2,'0')}</span> <strong class="num">+${a.min}min</strong></span>`;
        });
        html += `</div></div>`;
      }

      // Day-by-day table
      html += `<div class="section-head"><h3>Agenda diária</h3><span class="sh-sub">${diasRegistrados} dia${diasRegistrados === 1 ? '' : 's'} registrado${diasRegistrados === 1 ? '' : 's'}</span></div>
      <table class="dtbl">
        <thead><tr>
          <th style="width:36px">Dia</th>
          <th style="width:32px">Sem</th>
          <th style="width:90px;text-align:left">Status</th>
          <th>Entrada</th>
          <th>Saída</th>
          <th>Trab.</th>
          <th>Prev.</th>
          <th>Saldo</th>
        </tr></thead><tbody>`;

      e.diasDetail.forEach(dd => {
        if (dd.status === 'futuro') return;
        const isWe = dd.dow === 0 || dd.dow === 6;
        const cls = isWe ? 'weekend' : '';
        const saldoD = dd.ht - dd.hp;
        const saldoDColor = saldoD >= 0 ? POS : NEG;
        const sc = statusColor[dd.status] || MUTED;
        html += `<tr${cls ? ` class="${cls}"` : ''}>
          <td><span class="d-num num">${String(dd.dia).padStart(2,'0')}</span></td>
          <td><span class="d-dow">${diasSemana[dd.dow]}</span></td>
          <td style="text-align:left"><span class="pill" style="background:${sc}15;color:${sc}"><span class="pdot" style="background:${sc}"></span>${statusLabel[dd.status] || dd.status}</span></td>
          <td class="${dd.entrada ? 'time num' : 'time-empty'}">${dd.entrada || '—'}</td>
          <td class="${dd.saida ? 'time num' : 'time-empty'}">${dd.saida || '—'}</td>
          <td class="num" style="font-weight:600">${dd.ht ? fmtH(dd.ht) : '<span class="time-empty">—</span>'}</td>
          <td class="num" style="color:${TEXT_3}">${dd.hp ? fmtH(dd.hp) : '—'}</td>
          <td class="num" style="font-weight:700;color:${saldoDColor}">${dd.ht || dd.hp ? (saldoD >= 0 ? '+' : '') + fmtH(saldoD) : '<span class="time-empty">—</span>'}</td>
        </tr>`;
      });

      html += `</tbody></table>
        <div class="footer">
          <div class="f-brand">Ornato<span> · ERP</span></div>
          <div>${e.func.nome} · ${nomeMes}</div>
          <div>Pág. ${idx + 2} / ${empData.length + 1}</div>
        </div>
      </div>`;
    });

    html += `</body></html>`;

    const pdfBuf = await htmlToPdf(html, {
      format: 'A4',
      margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="relatorio_ponto_${mes}.pdf"`,
      'Content-Length': pdfBuf.length,
    });
    res.send(pdfBuf);
  } catch (err) {
    console.error('Erro ao gerar relatório PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// IMPORTAR CSV
// ═══════════════════════════════════════════════════════

// POST /api/ponto/registros/importar — importa CSV de ponto
// Formato: Funcionario;Data;Entrada;Saida Almoco;Volta Almoco;Saida;Tipo;Obs
// Data formato: YYYY-MM-DD
router.post('/registros/importar', requireAuth, (req, res) => {
  try {
    const { csv } = req.body;
    if (!csv) return res.status(400).json({ error: 'Campo "csv" é obrigatório' });

    const lines = csv.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return res.status(400).json({ error: 'CSV deve ter pelo menos header + 1 linha' });

    // Pular header
    const header = lines[0].toLowerCase();
    const sep = header.includes(';') ? ';' : ',';

    // Carregar funcionários
    const funcs = db.prepare('SELECT * FROM funcionarios WHERE ativo = 1').all();
    const funcMap = {};
    funcs.forEach(f => { funcMap[f.nome.toLowerCase().trim()] = f; });

    const cfg = getConfig();
    let importados = 0, ignorados = 0, erros = [];

    const upsertStmt = db.prepare(`INSERT INTO ponto_registros
      (funcionario_id, data, entrada, saida_almoco, volta_almoco, saida, tipo, obs, horas_trabalhadas, horas_previstas, saldo_minutos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(funcionario_id, data) DO UPDATE SET
      entrada=excluded.entrada, saida_almoco=excluded.saida_almoco,
      volta_almoco=excluded.volta_almoco, saida=excluded.saida,
      tipo=excluded.tipo, obs=excluded.obs,
      horas_trabalhadas=excluded.horas_trabalhadas, horas_previstas=excluded.horas_previstas,
      saldo_minutos=excluded.saldo_minutos, atualizado_em=CURRENT_TIMESTAMP`);

    const transaction = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length < 6) { ignorados++; continue; }

        const [nome, dataStr, entrada, saidaAlm, voltaAlm, saida, tipoRaw, obsRaw] = cols;

        // Match funcionário
        const func = funcMap[nome.toLowerCase().trim()];
        if (!func) { erros.push(`Linha ${i + 1}: funcionário "${nome}" não encontrado`); ignorados++; continue; }

        // Validar data (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) { erros.push(`Linha ${i + 1}: data inválida "${dataStr}"`); ignorados++; continue; }

        const tipo = (tipoRaw || 'normal').toLowerCase().trim();
        const obs = obsRaw || null;
        const isTime = tipo === 'normal' || tipo === 'compensacao';

        const ent = isTime && entrada ? entrada : null;
        const sa = isTime && saidaAlm ? saidaAlm : null;
        const va = isTime && voltaAlm ? voltaAlm : null;
        const sd = isTime && saida ? saida : null;

        let ht = 0, hp = 0;
        if (isTime) ht = calcHorasTrabalhadas(ent, sa, va, sd);

        const tiposSemPrevista = ['feriado', 'folga', 'ferias'];
        if (!tiposSemPrevista.includes(tipo) && !isFeriado(dataStr)) {
          const jd = getJornadaDia(cfg.jornada, dataStr);
          hp = getHorasPrevistas(jd);
        }
        if (tipo === 'atestado' || tipo === 'compensacao') ht = hp;

        const saldoMin = Math.round((ht - hp) * 60);

        upsertStmt.run(func.id, dataStr, ent, sa, va, sd, tipo, obs, ht, hp, saldoMin);
        importados++;
      }
    });

    transaction();

    res.json({ ok: true, importados, ignorados, erros: erros.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// FERIADOS
// ═══════════════════════════════════════════════════════

// GET /api/ponto/feriados?ano=2026
router.get('/feriados', requireAuth, (req, res) => {
  try {
    const { ano } = req.query;
    let rows;
    if (ano) {
      rows = db.prepare("SELECT * FROM ponto_feriados WHERE data LIKE ? ORDER BY data").all(`${ano}-%`);
    } else {
      rows = db.prepare("SELECT * FROM ponto_feriados ORDER BY data").all();
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ponto/feriados
router.post('/feriados', requireAuth, (req, res) => {
  try {
    const { data, descricao } = req.body;
    if (!data || !descricao) return res.status(400).json({ error: 'data e descricao são obrigatórios' });
    const result = db.prepare('INSERT INTO ponto_feriados (data, descricao) VALUES (?, ?)').run(data, descricao);
    const feriado = db.prepare('SELECT * FROM ponto_feriados WHERE id = ?').get(result.lastInsertRowid);
    res.json(feriado);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Já existe um feriado nesta data' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ponto/feriados/:id
router.delete('/feriados/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM ponto_feriados WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
