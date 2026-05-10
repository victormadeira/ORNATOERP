/**
 * Tab Ferragens — Sprint-4 plumbing
 *
 * Lista as ferragens do módulo selecionado no SketchUp, agrupadas por tipo.
 *
 * Bridge:
 *   JS  →  callRuby('get_module_machining', { entity_id })
 *   Ruby → window.setModuleMachining({ pieces: [...] })
 *
 * Cada peça vem com `structural_ops` (array de labels: 'Dobradiça', 'Puxador',
 * 'Minifix', 'Cavilha', 'Corrediça', 'Sistema 32', 'Rasgo Fundo', etc).
 *
 * Sprint-4 mostra apenas a CONTAGEM agregada por tipo + lista por peça âncora.
 * Preview SVG / cotas / overrides ficam pra Sprint futuro.
 */

import { callRuby, getState } from '../app.js'
import { iconHTML } from '../icons.js'

export const meta = { phase: 'F1.4-plumbing' }

export function render(container, ctx) {
  const state = ctx.state
  const sel = state.selection

  if (!sel || sel.count === 0) {
    container.innerHTML = `
      <div class="empty-tab">
        <div class="icon-wrap">${iconHTML('ferragens', 22)}</div>
        <h2>Selecione um módulo</h2>
        <p>Selecione um módulo no SketchUp para ver suas ferragens
        (dobradiças, corrediças, puxadores, minifix, cavilhas, etc).</p>
      </div>
    `
    return
  }

  if (sel.count > 1) {
    container.innerHTML = `
      <div class="empty-tab">
        <div class="icon-wrap">${iconHTML('ferragens', 22)}</div>
        <h2>${sel.count} módulos selecionados</h2>
        <p>A listagem de ferragens em modo lote será habilitada num próximo sprint.
        Selecione apenas <strong>um módulo</strong> para ver as ferragens dele.</p>
      </div>
    `
    return
  }

  // Carrega ferragens do módulo (se ainda não tiver)
  const entityId = sel.items?.[0]?.entity_id || sel.entityId || sel.id || null
  const cache = state.moduleFerragens

  // Render container imediatamente (esqueleto), então solicita dados ao Ruby
  container.innerHTML = `
    <div class="ferragens-wrap" style="padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
      <div class="ferragens-head" style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--text);">Ferragens do módulo</span>
        <span style="font-size:11px;color:var(--text-mute);">${sel.label || ''}</span>
        <button id="ferragensReload" class="btn btn-ghost btn-sm" style="margin-left:auto;">
          ${iconHTML('layers', 12)} Atualizar
        </button>
      </div>
      <div id="ferragensBody" style="display:flex;flex-direction:column;gap:10px;"></div>
    </div>
  `

  document.getElementById('ferragensReload')?.addEventListener('click', () => {
    fetchFerragens(entityId)
  })

  const cacheValid = cache && cache.entityId === entityId
  if (!cacheValid) {
    fetchFerragens(entityId)
    renderBody({ loading: true })
  } else {
    renderBody({ loading: false, pieces: cache.pieces || [] })
  }
}

function fetchFerragens(entityId) {
  // Marca cache do entityId em flight pra não disparar de novo no próximo render
  const s = getState()
  s.moduleFerragens = { entityId, pieces: null, loading: true }
  const ok = callRuby('get_module_machining', { entity_id: entityId || 0 })
  if (!ok) {
    // Modo preview: mock pequeno
    setTimeout(() => {
      window.setModuleMachining({
        pieces: [
          { id: 'p1', name: 'Lateral esquerda', role: 'lateral_esq',
            structural_ops: ['Dobradiça', 'Minifix', 'Cavilha'], extra_ops: [] },
          { id: 'p2', name: 'Lateral direita', role: 'lateral_dir',
            structural_ops: ['Dobradiça', 'Minifix', 'Cavilha'], extra_ops: [] },
          { id: 'p3', name: 'Porta esquerda',  role: 'porta_esq',
            structural_ops: ['Dobradiça', 'Puxador'], extra_ops: [] },
          { id: 'p4', name: 'Porta direita',   role: 'porta_dir',
            structural_ops: ['Dobradiça', 'Puxador'], extra_ops: [] },
          { id: 'p5', name: 'Base inferior',   role: 'base',
            structural_ops: ['Minifix', 'Cavilha'], extra_ops: [] },
        ],
      })
    }, 120)
  }
  renderBody({ loading: true })
}

function renderBody({ loading, pieces }) {
  const body = document.getElementById('ferragensBody')
  if (!body) return

  if (loading) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-mute);font-size:12px;">Carregando ferragens…</div>`
    return
  }

  if (!pieces || pieces.length === 0) {
    body.innerHTML = `
      <div style="padding:24px;text-align:center;color:var(--text-mute);font-size:12px;">
        Nenhuma ferragem detectada neste módulo.
      </div>
    `
    return
  }

  // Agregação por tipo de ferragem
  const counter = new Map() // tipo → { count, pieces:Set<string> }
  pieces.forEach(p => {
    const ops = (p.structural_ops || []).concat((p.extra_ops || []).map(e => e.tipo || e.label || 'Extra'))
    ops.forEach(op => {
      if (!counter.has(op)) counter.set(op, { count: 0, pieces: new Set() })
      const c = counter.get(op)
      c.count++
      c.pieces.add(p.name)
    })
  })

  const aggregateRows = Array.from(counter.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([tipo, info]) => `
      <div class="ferragem-row" style="
        display:flex;align-items:center;gap:10px;
        padding:10px 12px;border:1px solid var(--border);
        border-radius:var(--r-md);background:var(--bg);
      ">
        <span style="
          width:28px;height:28px;border-radius:var(--r);
          display:flex;align-items:center;justify-content:center;
          background:var(--bg-soft);color:var(--accent);
        ">${iconHTML('ferragens', 14)}</span>
        <div style="flex:1;min-width:0;">
          <p style="font-size:13px;font-weight:600;color:var(--text);">${tipo}</p>
          <p style="font-size:10px;color:var(--text-mute);">
            em ${info.pieces.size} ${info.pieces.size === 1 ? 'peça' : 'peças'} ·
            ${Array.from(info.pieces).slice(0, 3).join(', ')}${info.pieces.size > 3 ? '…' : ''}
          </p>
        </div>
        <span style="
          font-size:14px;font-weight:700;color:var(--text);
          font-variant-numeric:tabular-nums;
          padding:3px 9px;border-radius:var(--r);
          background:var(--bg-soft);
        ">${info.count}</span>
      </div>
    `).join('')

  const piecesList = pieces.map(p => {
    const ops = (p.structural_ops || []).concat((p.extra_ops || []).map(e => e.tipo || e.label || 'Extra'))
    if (ops.length === 0) return ''
    return `
      <div style="
        display:flex;align-items:flex-start;gap:8px;
        padding:8px 0;border-top:1px solid var(--border);
      ">
        <div style="flex:1;min-width:0;">
          <p style="font-size:12px;font-weight:600;color:var(--text);">${p.name}</p>
          <p style="font-size:10px;color:var(--text-mute);">${p.role || ''}</p>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;max-width:60%;">
          ${ops.map(op => `
            <span style="
              font-size:10px;padding:2px 6px;
              border-radius:var(--r);background:var(--bg-soft);
              color:var(--text-2);font-weight:500;
            ">${op}</span>
          `).join('')}
        </div>
      </div>
    `
  }).join('')

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);">Resumo</p>
      ${aggregateRows}
    </div>
    <div style="display:flex;flex-direction:column;gap:0;margin-top:6px;">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);padding-bottom:4px;">Por peça</p>
      ${piecesList || `<p style="font-size:11px;color:var(--text-mute);">Nenhuma peça com ferragem.</p>`}
    </div>
  `
}
