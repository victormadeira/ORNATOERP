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

    const fmtH = (hrs) => { const m = Math.round(hrs * 60); const s = m < 0 ? '-' : ''; const a = Math.abs(m); return `${s}${Math.floor(a/60)}h${String(a%60).padStart(2,'0')}`; };
    const fmtMin = (mins) => { const s = mins < 0 ? '-' : ''; const a = Math.abs(mins); return `${s}${Math.floor(a/60)}h${String(a%60).padStart(2,'0')}`; };

    const statusColor = { normal:'#22c55e', atraso:'#f59e0b', falta:'#ef4444', atestado:'#3b82f6', ferias:'#818cf8', feriado:'#9ca3af', folga:'#d1d5db', compensacao:'#a855f7', futuro:'#e5e7eb' };
    const statusLabel = { normal:'Normal', atraso:'Atraso', falta:'Falta', atestado:'Atestado', ferias:'Férias', feriado:'Feriado', folga:'Folga', compensacao:'Comp.', futuro:'' };

    // ── Build HTML ──
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1a1a2e; background: #fff; }
  .page { page-break-after: always; padding: 0; position: relative; }
  .page:last-child { page-break-after: auto; }
  .hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: linear-gradient(135deg, ${COR} 0%, ${COR}dd 100%); color: #fff; border-radius: 10px; margin-bottom: 16px; }
  .hdr h1 { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
  .hdr .sub { font-size: 11px; opacity: 0.85; margin-top: 2px; }
  .hdr .periodo { font-size: 13px; font-weight: 700; text-align: right; }
  .hdr .empresa { font-size: 10px; opacity: 0.7; }
  .cards { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .card { flex: 1 1 0; min-width: 80px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 8px; text-align: center; }
  .card .val { font-size: 20px; font-weight: 800; line-height: 1; }
  .card .lbl { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-top: 4px; }
  .tbl { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .tbl th { background: ${COR}12; padding: 6px 8px; font-size: 9px; font-weight: 700; text-align: left; border-bottom: 2px solid ${COR}30; color: #334155; text-transform: uppercase; letter-spacing: 0.3px; }
  .tbl td { padding: 6px 8px; font-size: 10px; border-bottom: 1px solid #f1f5f9; }
  .tbl tr:nth-child(even) { background: #fafbfc; }
  .emp-hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: linear-gradient(135deg, ${COR} 0%, ${COR}cc 100%); color: #fff; border-radius: 10px; margin-bottom: 14px; }
  .emp-hdr h2 { font-size: 16px; font-weight: 800; }
  .emp-hdr .cargo { font-size: 10px; opacity: 0.8; margin-top: 2px; }
  .emp-hdr .banco-box { text-align: right; }
  .emp-hdr .banco-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
  .emp-hdr .banco-val { font-size: 22px; font-weight: 900; line-height: 1; margin-top: 2px; }
  .stats { display: flex; gap: 6px; margin-bottom: 12px; }
  .stat { flex: 1 1 0; padding: 8px 6px; border-radius: 8px; text-align: center; }
  .stat .sv { font-size: 16px; font-weight: 800; line-height: 1; }
  .stat .sl { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 3px; }
  .prog-wrap { margin-bottom: 12px; }
  .prog-label { display: flex; justify-content: space-between; font-size: 8px; color: #64748b; margin-bottom: 3px; font-weight: 600; }
  .prog-bar { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; }
  .prog-fill { height: 100%; border-radius: 5px; }
  .delays { padding: 10px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; margin-bottom: 12px; }
  .delays h4 { font-size: 10px; font-weight: 700; color: #92400e; margin-bottom: 6px; }
  .delay-item { display: inline-block; padding: 2px 8px; margin: 2px; font-size: 9px; background: #fff; border-radius: 4px; border: 1px solid #fde68a; }
  .dtbl { width: 100%; border-collapse: collapse; font-size: 8px; }
  .dtbl th { padding: 4px 4px; font-weight: 700; text-align: center; background: ${COR}10; border: 1px solid ${COR}20; color: #334155; }
  .dtbl td { padding: 3px 4px; text-align: center; border: 1px solid #f1f5f9; }
  .dtbl .weekend { background: #f8fafc; color: #94a3b8; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 8px; font-weight: 700; }
  .banco-detail { display: flex; gap: 10px; padding: 10px 14px; background: ${COR}08; border: 1px solid ${COR}25; border-radius: 8px; margin-bottom: 12px; align-items: center; }
  .banco-detail .bd-item { text-align: center; flex: 1; }
  .banco-detail .bd-val { font-size: 14px; font-weight: 800; }
  .banco-detail .bd-lbl { font-size: 7px; color: #64748b; text-transform: uppercase; font-weight: 600; }
  .banco-detail .bd-sep { font-size: 16px; color: #94a3b8; font-weight: 300; }
  .footer { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 7px; color: #94a3b8; padding: 6px; }
</style></head><body>`;

    // ══════════════════════════════════════════════════════
    // PAGE 1: RESUMO GERAL
    // ══════════════════════════════════════════════════════
    html += `<div class="page">
      <div class="hdr">
        <div><h1>Relatório de Ponto</h1><div class="sub">Resumo geral de todos os colaboradores</div></div>
        <div><div class="periodo">${nomeMes}</div><div class="empresa">${nomeEmpresa}</div></div>
      </div>

      <div class="cards">
        <div class="card"><div class="val" style="color:${COR}">${funcionarios.length}</div><div class="lbl">Colaboradores</div></div>
        <div class="card"><div class="val" style="color:#334155">${fmtH(totals.trabalhadas)}</div><div class="lbl">Horas Trabalhadas</div></div>
        <div class="card"><div class="val" style="color:${totals.saldo >= 0 ? '#22c55e' : '#ef4444'}">${fmtMin(totals.saldo)}</div><div class="lbl">Saldo Geral</div></div>
        <div class="card"><div class="val" style="color:#f59e0b">${totals.atrasos}</div><div class="lbl">Atrasos</div></div>
        <div class="card"><div class="val" style="color:#ef4444">${totals.faltas}</div><div class="lbl">Faltas</div></div>
        <div class="card"><div class="val" style="color:#3b82f6">${totals.atestados}</div><div class="lbl">Atestados</div></div>
      </div>

      <table class="tbl">
        <thead><tr>
          <th>Colaborador</th><th>Cargo</th><th style="text-align:center">Trab.</th><th style="text-align:center">Prev.</th>
          <th style="text-align:center">Saldo Mês</th><th style="text-align:center">Banco Acum.</th>
          <th style="text-align:center">Atrasos</th><th style="text-align:center">Faltas</th><th style="text-align:center">Atestados</th>
        </tr></thead>
        <tbody>`;

    empData.forEach(e => {
      const sColor = e.saldoMes >= 0 ? '#22c55e' : '#ef4444';
      const bColor = e.bancoTotal >= 0 ? '#22c55e' : '#ef4444';
      html += `<tr>
        <td style="font-weight:600">${e.func.nome}</td>
        <td style="color:#64748b">${e.func.cargo || '—'}</td>
        <td style="text-align:center;font-weight:600">${fmtH(e.trabalhadas)}</td>
        <td style="text-align:center;color:#64748b">${fmtH(e.previstas)}</td>
        <td style="text-align:center;font-weight:700;color:${sColor}">${e.saldoMes >= 0 ? '+' : ''}${fmtMin(e.saldoMes)}</td>
        <td style="text-align:center;font-weight:800;color:${bColor}">${e.bancoTotal >= 0 ? '+' : ''}${fmtMin(e.bancoTotal)}</td>
        <td style="text-align:center;color:${e.atrasos ? '#f59e0b' : '#94a3b8'};font-weight:600">${e.atrasos || '—'}</td>
        <td style="text-align:center;color:${e.faltas ? '#ef4444' : '#94a3b8'};font-weight:600">${e.faltas || '—'}</td>
        <td style="text-align:center;color:${e.atestados ? '#3b82f6' : '#94a3b8'};font-weight:600">${e.atestados || '—'}</td>
      </tr>`;
    });

    html += `</tbody></table>

      <!-- Mini gráfico de barras comparativo -->
      <div style="margin-top:8px">
        <div style="font-size:9px;font-weight:700;color:#334155;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Horas Trabalhadas vs Previstas</div>`;

    const maxH = Math.max(...empData.map(e => Math.max(e.trabalhadas, e.previstas)), 1);
    empData.forEach(e => {
      const pctT = Math.round((e.trabalhadas / maxH) * 100);
      const pctP = Math.round((e.previstas / maxH) * 100);
      const firstName = e.func.nome.split(' ')[0];
      html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="width:70px;font-size:9px;font-weight:600;text-align:right;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${firstName}</div>
        <div style="flex:1;position:relative;height:14px">
          <div style="position:absolute;top:0;left:0;height:7px;width:${pctP}%;background:#e2e8f0;border-radius:3px"></div>
          <div style="position:absolute;top:0;left:0;height:7px;width:${pctT}%;background:${e.trabalhadas >= e.previstas ? '#22c55e' : '#f59e0b'};border-radius:3px;opacity:0.85"></div>
          <div style="position:absolute;bottom:0;left:0;height:5px;line-height:5px;font-size:7px;color:#64748b">${fmtH(e.trabalhadas)} / ${fmtH(e.previstas)}</div>
        </div>
      </div>`;
    });

    html += `</div>
      <div class="footer">Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})} — ${nomeEmpresa}</div>
    </div>`;

    // ══════════════════════════════════════════════════════
    // PAGES 2+: UMA POR FUNCIONÁRIO
    // ══════════════════════════════════════════════════════
    empData.forEach((e, idx) => {
      const pctTrab = e.previstas > 0 ? Math.min(Math.round((e.trabalhadas / e.previstas) * 100), 150) : 0;
      const barColor = pctTrab > 100 ? '#22c55e' : COR;
      const extras = e.trabalhadas > e.previstas ? (e.trabalhadas - e.previstas) : 0;
      const deficit = e.previstas > e.trabalhadas ? (e.previstas - e.trabalhadas) : 0;

      html += `<div class="page">
        <!-- Employee header -->
        <div class="emp-hdr">
          <div>
            <h2>${e.func.nome}</h2>
            <div class="cargo">${e.func.cargo || 'Sem cargo definido'} ${e.func.cpf ? '| CPF: ' + e.func.cpf : ''}</div>
          </div>
          <div class="banco-box">
            <div class="banco-label">Banco de Horas</div>
            <div class="banco-val" style="color:${e.bancoTotal >= 0 ? '#4ade80' : '#f87171'}">${e.bancoTotal >= 0 ? '+' : ''}${fmtMin(e.bancoTotal)}</div>
          </div>
        </div>

        <!-- Banco decomposition -->
        <div class="banco-detail">
          <div class="bd-item">
            <div class="bd-val" style="color:${e.bhAnterior >= 0 ? '#22c55e' : '#ef4444'}">${e.bhAnterior >= 0 ? '+' : ''}${fmtMin(e.bhAnterior)}</div>
            <div class="bd-lbl">Meses Anteriores</div>
          </div>
          <div class="bd-sep">+</div>
          <div class="bd-item">
            <div class="bd-val" style="color:${e.saldoMes >= 0 ? '#22c55e' : '#ef4444'}">${e.saldoMes >= 0 ? '+' : ''}${fmtMin(e.saldoMes)}</div>
            <div class="bd-lbl">Saldo ${meses[mesNum-1]}</div>
          </div>
          <div class="bd-sep">=</div>
          <div class="bd-item">
            <div class="bd-val" style="color:${e.bancoTotal >= 0 ? '#22c55e' : '#ef4444'};font-size:18px">${e.bancoTotal >= 0 ? '+' : ''}${fmtMin(e.bancoTotal)}</div>
            <div class="bd-lbl">Acumulado Total</div>
          </div>
        </div>

        <!-- Stats cards -->
        <div class="stats">
          <div class="stat" style="background:#f0fdf4;border:1px solid #bbf7d0">
            <div class="sv" style="color:#16a34a">${fmtH(e.trabalhadas)}</div>
            <div class="sl" style="color:#16a34a">Trabalhadas</div>
          </div>
          <div class="stat" style="background:#f8fafc;border:1px solid #e2e8f0">
            <div class="sv" style="color:#475569">${fmtH(e.previstas)}</div>
            <div class="sl" style="color:#64748b">Previstas</div>
          </div>
          ${extras > 0 ? `<div class="stat" style="background:#f0fdf4;border:1px solid #bbf7d0">
            <div class="sv" style="color:#22c55e">+${fmtH(extras)}</div>
            <div class="sl" style="color:#16a34a">Extras</div>
          </div>` : ''}
          ${deficit > 0 ? `<div class="stat" style="background:#fef2f2;border:1px solid #fecaca">
            <div class="sv" style="color:#ef4444">-${fmtH(deficit)}</div>
            <div class="sl" style="color:#dc2626">Deficit</div>
          </div>` : ''}
          <div class="stat" style="background:#fffbeb;border:1px solid #fde68a">
            <div class="sv" style="color:#d97706">${e.atrasos}</div>
            <div class="sl" style="color:#92400e">Atrasos</div>
          </div>
          <div class="stat" style="background:#fef2f2;border:1px solid #fecaca">
            <div class="sv" style="color:#ef4444">${e.faltas}</div>
            <div class="sl" style="color:#dc2626">Faltas</div>
          </div>
          <div class="stat" style="background:#eff6ff;border:1px solid #bfdbfe">
            <div class="sv" style="color:#2563eb">${e.atestados}</div>
            <div class="sl" style="color:#1d4ed8">Atestados</div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="prog-wrap">
          <div class="prog-label">
            <span>Progresso: ${pctTrab}%</span>
            <span>${fmtH(e.trabalhadas)} / ${fmtH(e.previstas)}</span>
          </div>
          <div class="prog-bar">
            <div class="prog-fill" style="width:${Math.min(pctTrab, 100)}%;background:${barColor}"></div>
          </div>
        </div>`;

      // Atrasos detail
      if (e.atrasosDetail.length > 0) {
        html += `<div class="delays"><h4>Detalhamento de Atrasos (${e.atrasos})</h4><div>`;
        e.atrasosDetail.forEach(a => {
          const [,, dd] = a.data.split('-');
          html += `<span class="delay-item">${dd}/${String(mesNum).padStart(2,'0')} <strong style="color:#d97706">+${a.min}min</strong></span>`;
        });
        html += `</div></div>`;
      }

      // Day-by-day table
      html += `<table class="dtbl"><thead><tr>
        <th style="width:26px">Dia</th><th style="width:26px">DS</th><th>Status</th>
        <th>Entrada</th><th>Saída</th><th>Trab.</th><th>Prev.</th><th>Saldo</th>
      </tr></thead><tbody>`;

      e.diasDetail.forEach(dd => {
        if (dd.status === 'futuro') return;
        const isWe = dd.dow === 0 || dd.dow === 6;
        const cls = isWe ? ' class="weekend"' : '';
        const saldoD = dd.ht - dd.hp;
        const saldoDColor = saldoD >= 0 ? '#22c55e' : '#ef4444';
        const sc = statusColor[dd.status] || '#d1d5db';
        html += `<tr${cls}>
          <td style="font-weight:600">${String(dd.dia).padStart(2,'0')}</td>
          <td>${diasSemana[dd.dow]}</td>
          <td><span class="badge" style="background:${sc}20;color:${sc};border:1px solid ${sc}40">${statusLabel[dd.status] || dd.status}</span></td>
          <td>${dd.entrada || '—'}</td>
          <td>${dd.saida || '—'}</td>
          <td style="font-weight:600">${dd.ht ? fmtH(dd.ht) : '—'}</td>
          <td style="color:#64748b">${dd.hp ? fmtH(dd.hp) : '—'}</td>
          <td style="font-weight:700;color:${saldoDColor}">${dd.ht || dd.hp ? (saldoD >= 0 ? '+' : '') + fmtH(saldoD) : '—'}</td>
        </tr>`;
      });

      html += `</tbody></table>
        <div class="footer">Pág. ${idx + 2} — ${e.func.nome} — ${nomeMes} — ${nomeEmpresa}</div>
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
