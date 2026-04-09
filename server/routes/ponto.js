import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

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

    const funcs = db.prepare('SELECT id FROM funcionarios WHERE ativo = 1').all();
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
      // Saldo acumulado de TODOS os meses anteriores
      const anterior = db.prepare(
        'SELECT COALESCE(SUM(saldo_minutos), 0) as total FROM ponto_registros WHERE funcionario_id = ? AND data < ?'
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
