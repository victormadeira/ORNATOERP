/**
 * Tab Usinagens — F1.4-real
 *
 * Visualização técnica das operações CNC (furos, rasgos, pockets) extraídas
 * via Ornato::Machining::MachiningInterpreter + FerragemDrillingCollector,
 * com relatório de colisões do DrillingCollisionDetector.
 *
 * Bridge:
 *   JS  → callRuby('get_module_machining', { entity_id })
 *   Ruby → window.setModuleMachining({ pieces, ops, collisions })
 *
 * Ações:
 *   - Export UPM JSON  (callRuby 'export_json')
 *   - Export DXF       (callRuby 'export_dxf' — DxfExporter gera 1 arquivo por peça)
 *   - Ir pra peça      (callRuby 'select_entity_in_model')
 *   - Ignorar colisão  (callRuby 'ignore_validation_issue')
 *
 * NÃO modifica engines (MachiningInterpreter, DrillingCollisionDetector,
 * DxfExporter), wps_source/, biblioteca/, ou outros tabs.
 */

import { callRuby, getState, htmlEscape } from '../app.js'
import { iconHTML } from '../icons.js'

export const meta = { phase: 'F1.4-real' }

// Estado local da tab (UI-only — não vai pro state global)
const ui = {
  expanded:   {},   // { peca_id: bool }
  ignoredColl: new Set(), // ids de colisão ocultadas localmente
}

export function render(container, ctx) {
  const state = ctx.state
  const sel = state.selection

  if (!sel || sel.count === 0) {
    container.innerHTML = renderHint(
      'Selecione um módulo no SketchUp pra ver as operações de usinagem'
    )
    return
  }

  if (sel.count > 1) {
    container.innerHTML = renderHint(
      `${sel.count} módulos selecionados. Selecione apenas um módulo pra ver as usinagens.`
    )
    return
  }

  const entityId = sel.items?.[0]?.entity_id || sel.entityId || sel.id || null
  const cache = state.moduleFerragens

  container.innerHTML = `
    <div class="usi-wrap" style="padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
      <header class="usi-head" style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--text);">Usinagens — Operações CNC</span>
        <span style="font-size:11px;color:var(--text-mute);">${htmlEscape(sel.label || '')}</span>
        <button id="usiReload" class="btn btn-ghost btn-sm" style="margin-left:auto;" title="Recarregar">
          ${iconHTML('layers', 12)} Atualizar
        </button>
      </header>
      <div id="usiBody" style="display:flex;flex-direction:column;gap:14px;"></div>
    </div>
  `

  document.getElementById('usiReload')?.addEventListener('click', () => {
    fetchMachining(entityId)
  })

  const cacheValid = cache && cache.entityId === entityId && Array.isArray(cache.ops)
  if (!cacheValid) {
    fetchMachining(entityId)
    renderBody({ loading: true })
  } else {
    renderBody({ loading: false, data: cache })
  }
}

function renderHint(msg) {
  return `
    <div class="empty-tab" style="padding:40px 24px;text-align:center;">
      <div class="icon-wrap" style="margin-bottom:12px;">${iconHTML('usinagens', 22)}</div>
      <p style="font-size:13px;color:var(--text-mute);max-width:360px;margin:0 auto;">${htmlEscape(msg)}</p>
    </div>
  `
}

function fetchMachining(entityId) {
  const s = getState()
  s.moduleFerragens = {
    entityId,
    pieces: null,
    ops: null,
    collisions: { collisions: [], stats: {} },
    loading: true,
  }
  const ok = callRuby('get_module_machining', { entity_id: entityId || 0 })
  if (!ok) {
    // Modo preview: mock pequeno
    setTimeout(() => {
      window.setModuleMachining({
        pieces: [
          { id: 'p1', name: 'Lateral esquerda', role: 'lateral_esq', structural_ops: [], extra_ops: [] },
          { id: 'p2', name: 'Lateral direita',  role: 'lateral_dir', structural_ops: [], extra_ops: [] },
        ],
        ops: [
          { op_id: 'o1', peca_id: 'p1', peca_name: 'Lateral esquerda', category: 'hole',
            tipo_ornato: 'Sistema 32', diameter: 5, depth: 11, side: 'topside', x_mm: 37 },
          { op_id: 'o2', peca_id: 'p1', peca_name: 'Lateral esquerda', category: 'hole',
            tipo_ornato: 'Minifix',    diameter: 8, depth: 15, side: 'edge_back', x_mm: 9 },
          { op_id: 'o3', peca_id: 'p2', peca_name: 'Lateral direita',  category: 'pocket',
            tipo_ornato: 'Rasgo Fundo', diameter: 8, depth: 8, side: 'underside', x_mm: 50 },
        ],
        collisions: {
          collisions: [
            { _id: 'c1', tipo: 'overlap_xy', severity: 'error',
              message: 'Sys32 #3 e Minifix #1 sobrepõem 1.2mm em Lateral esquerda',
              op_a: { peca_id: 'p1' }, op_b: { peca_id: 'p1' },
              distance_mm: 1.2, min_safe_mm: 6.5 },
          ],
          stats: { ops_total: 3, ops_with_issues: 2, by_severity: { error: 1, warning: 0 } },
        },
      })
    }, 120)
  }
}

function renderBody({ loading, data }) {
  const body = document.getElementById('usiBody')
  if (!body) return

  if (loading) {
    body.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--text-mute);font-size:12px;">
        Carregando operações de usinagem…
      </div>
    `
    return
  }

  const ops    = data?.ops || []
  const colls  = (data?.collisions?.collisions || [])
                   .filter(c => !ui.ignoredColl.has(c._id))

  if (ops.length === 0) {
    body.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--text-mute);font-size:12px;">
        Nenhuma operação CNC detectada neste módulo.
        <br><small>Configure ferragens em <strong>Ferragens</strong> pra gerar furações automáticas.</small>
      </div>
    `
    return
  }

  body.innerHTML = `
    ${renderSummary(ops, colls)}
    ${renderCollisions(colls)}
    ${renderByPiece(ops)}
    ${renderActions()}
  `

  wireBodyEvents()
}

function renderSummary(ops, colls) {
  const byCat = ops.reduce((acc, op) => {
    acc[op.category] = (acc[op.category] || 0) + 1
    return acc
  }, {})
  const pieces = new Set(ops.map(o => o.peca_id)).size
  const collCount = colls.length

  return `
    <section class="usi-summary" style="
      background:var(--bg-soft);padding:12px 14px;border-radius:var(--r-md);
      border:1px solid var(--border);
    ">
      <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 6px;">
        <strong>${ops.length}</strong> operações em <strong>${pieces}</strong> ${pieces === 1 ? 'peça' : 'peças'}
      </p>
      <div class="usi-counts" style="display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--text-2);">
        <span>${categoryIcon('hole')} ${byCat.hole || 0} furos</span>
        <span>${categoryIcon('pocket')} ${byCat.pocket || 0} rasgos</span>
        <span>${categoryIcon('groove')} ${byCat.groove || 0} grooves</span>
        <span>${categoryIcon('cutout')} ${byCat.cutout || 0} recortes</span>
        ${collCount > 0
          ? `<span style="color:#f59e0b;font-weight:600;">⚠ ${collCount} ${collCount === 1 ? 'colisão' : 'colisões'}</span>`
          : `<span style="color:#22c55e;font-weight:600;">✓ Sem colisões</span>`}
      </div>
    </section>
  `
}

function renderCollisions(colls) {
  if (!colls.length) return ''
  return `
    <section class="usi-collisions" style="display:flex;flex-direction:column;gap:6px;">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);">
        Colisões detectadas
      </p>
      ${colls.map(c => {
        const severe = (c.severity || '').toString()
        const color  = severe === 'error' ? '#ef4444' : '#f59e0b'
        const icon   = severe === 'error' ? '🔴' : '🟡'
        const opA    = c.op_a?.peca_id || c.peca_id || ''
        return `
          <div class="usi-coll" style="
            padding:10px 12px;border-left:3px solid ${color};
            background:var(--bg);border:1px solid var(--border);
            border-radius:var(--r-md);
          ">
            <p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 4px;">
              ${icon} ${htmlEscape((severe || 'info').toUpperCase())} · ${htmlEscape(c.tipo || c.kind || 'colisao')}
            </p>
            <p style="font-size:11px;color:var(--text-2);margin:0;">${htmlEscape(c.message || '')}</p>
            ${(c.distance_mm != null && c.min_safe_mm != null) ? `
              <p style="font-size:10px;color:var(--text-mute);margin:4px 0 0;">
                Distância: ${Number(c.distance_mm).toFixed(2)}mm
                · mínimo seguro: ${Number(c.min_safe_mm).toFixed(2)}mm
              </p>` : ''}
            <div class="usi-coll-actions" style="display:flex;gap:6px;margin-top:8px;">
              ${opA ? `<button class="btn btn-ghost btn-sm" data-act="goto" data-pid="${htmlEscape(opA)}">
                Ir pra peça
              </button>` : ''}
              <button class="btn btn-ghost btn-sm" data-act="ignore" data-cid="${htmlEscape(c._id || '')}">
                Ignorar
              </button>
            </div>
          </div>
        `
      }).join('')}
    </section>
  `
}

function renderByPiece(ops) {
  const byPiece = ops.reduce((acc, op) => {
    (acc[op.peca_id] = acc[op.peca_id] || []).push(op)
    return acc
  }, {})

  return `
    <section class="usi-pieces" style="display:flex;flex-direction:column;gap:4px;">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);">
        Por peça
      </p>
      ${Object.entries(byPiece).map(([pid, list]) => {
        const exp = ui.expanded[pid]
        const name = list[0].peca_name || pid
        return `
          <div class="usi-piece" style="border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg);">
            <button class="usi-piece-header" data-act="toggle" data-pid="${htmlEscape(pid)}" style="
              width:100%;display:flex;align-items:center;gap:8px;
              padding:9px 12px;background:none;border:none;cursor:pointer;
              text-align:left;font-size:12px;color:var(--text);
            ">
              <span style="color:var(--text-mute);">${exp ? '▾' : '▸'}</span>
              <strong style="flex:1;">${htmlEscape(name)}</strong>
              <span style="font-size:11px;color:var(--text-mute);">${list.length} ${list.length === 1 ? 'op' : 'ops'}</span>
            </button>
            ${exp ? `
              <ul class="usi-ops-list" style="
                list-style:none;margin:0;padding:0 12px 10px 28px;
                display:flex;flex-direction:column;gap:4px;
                border-top:1px solid var(--border);padding-top:8px;
              ">
                ${list.map(op => `
                  <li style="font-size:11px;color:var(--text-2);display:flex;align-items:center;gap:6px;">
                    <span>${categoryIcon(op.category)}</span>
                    <span style="font-weight:500;color:var(--text);">${htmlEscape(op.tipo_ornato || op.category)}</span>
                    <span style="color:var(--text-mute);">
                      Ø${Number(op.diameter || 0).toFixed(1)}×${Number(op.depth || 0).toFixed(1)}mm
                    </span>
                    ${op.side ? `<span style="
                      font-size:10px;padding:1px 6px;border-radius:var(--r);
                      background:var(--bg-soft);color:var(--text-2);
                    ">${htmlEscape(op.side)}</span>` : ''}
                    ${op.x_mm != null ? `<span style="color:var(--text-faint);font-size:10px;">
                      x=${Number(op.x_mm).toFixed(1)}
                    </span>` : ''}
                  </li>
                `).join('')}
              </ul>` : ''}
          </div>
        `
      }).join('')}
    </section>
  `
}

function renderActions() {
  return `
    <div class="usi-actions" style="display:flex;gap:8px;flex-wrap:wrap;padding-top:4px;">
      <button class="btn btn-secondary btn-sm" data-act="export-upm">
        ${iconHTML('layers', 12)} Export UPM JSON
      </button>
      <button class="btn btn-secondary btn-sm" data-act="export-dxf">
        ${iconHTML('layers', 12)} Export DXF (por peça)
      </button>
    </div>
  `
}

function wireBodyEvents() {
  const body = document.getElementById('usiBody')
  if (!body) return

  body.querySelectorAll('[data-act="toggle"]').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.getAttribute('data-pid')
      ui.expanded[pid] = !ui.expanded[pid]
      const cache = getState().moduleFerragens
      renderBody({ loading: false, data: cache })
    })
  })

  body.querySelectorAll('[data-act="goto"]').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.getAttribute('data-pid')
      callRuby('select_entity_in_model', { entity_id: pid })
    })
  })

  body.querySelectorAll('[data-act="ignore"]').forEach(el => {
    el.addEventListener('click', () => {
      const cid = el.getAttribute('data-cid')
      if (cid) {
        ui.ignoredColl.add(cid)
        callRuby('ignore_validation_issue', { issue_id: cid, reason: 'manual_ignore_usinagens_tab' })
        if (window.showToast) window.showToast('Colisão ignorada', 'info')
      }
      const cache = getState().moduleFerragens
      renderBody({ loading: false, data: cache })
    })
  })

  body.querySelector('[data-act="export-upm"]')?.addEventListener('click', () => {
    callRuby('export_json')
    if (window.showToast) window.showToast('Export UPM JSON iniciado', 'info')
  })

  body.querySelector('[data-act="export-dxf"]')?.addEventListener('click', () => {
    callRuby('export_dxf')
    if (window.showToast) window.showToast('Export DXF iniciado — 1 arquivo por peça', 'info')
  })
}

function categoryIcon(cat) {
  switch (cat) {
    case 'hole':   return '🔵'
    case 'pocket': return '🟣'
    case 'groove': return '🟢'
    case 'cutout': return '🟡'
    default:       return '⚪'
  }
}
