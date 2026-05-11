/**
 * Tab Internos — F1.4 real (Sprint UX-8)
 *
 * Browser de agregados (prateleira, divisória, gaveteiro, painel ripado)
 * com filtro "cabe no selecionado" e botão "Inserir" que ativa o
 * AimPlacementTool no Ruby pra usuário mirar num vão de módulo.
 *
 * Bridge:
 *   JS → Ruby:   callRuby('get_available_aggregates')      (opcional; fallback embed)
 *                callRuby('start_aim_placement', 'prateleira')
 *   Ruby → JS:   window.onAggregatesList({ aggregates: [...] })
 *
 * Estado:
 *   - cache.aggregates = lista de agregados disponíveis
 *   - cache.loadingState ∈ {idle|loading|ready|error}
 *   - cache.filter ∈ {all|fits_only}
 *   - cache.category ∈ {all|interior_bay|...}
 *
 * Compat-check "cabe no vão":
 *   - Se módulo selecionado e payload tem `compatible_aggregates`, usa.
 *   - Senão indefinido (mostra ℹ️ "Selecione módulo").
 *
 * Limitações MVP: não exibe parâmetros do agregado antes de inserir
 * (o AimPlacementTool fica responsável); thumbnails são emojis.
 */

import { callRuby, getState } from '../app.js'

export const meta = { phase: 'F1.4-real', icon: 'internos' }

/* ─── Estado local (sobrevive entre re-renders) ─── */
const cache = {
  aggregates: null,
  loadingState: 'idle',
  error: null,
  filter: 'all',          // 'all' | 'fits_only'
  category: 'all',        // 'all' | bay_target
}

const EMBEDDED_AGGREGATES = [
  {
    id: 'prateleira',
    nome: 'Prateleira',
    icon: '📚',
    descricao: 'Prateleira simples inserida em vão interno.',
    bay_target: 'interior_bay',
    min_bay: { largura: 200, altura: 80, profundidade: 200 },
  },
  {
    id: 'divisoria',
    nome: 'Divisória vertical',
    icon: '📐',
    descricao: 'Divide o vão em duas partes verticais.',
    bay_target: 'interior_bay',
    min_bay: { largura: 100, altura: 200, profundidade: 200 },
  },
  {
    id: 'gaveteiro_simples',
    nome: 'Gaveteiro 3 gavetas',
    icon: '📦',
    descricao: 'Gaveteiro com N frentes divididas igualmente no vão.',
    bay_target: 'interior_bay',
    min_bay: { largura: 250, altura: 200, profundidade: 350 },
  },
  {
    id: 'painel_ripado_cavilhado',
    nome: 'Painel Ripado Cavilhado',
    icon: '🪵',
    descricao: 'Painel decorativo com ripas verticais cavilhadas.',
    bay_target: 'interior_bay',
    min_bay: { largura: 300, altura: 400, profundidade: 30 },
  },
]

/* ─── Helpers ─── */
function htmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function rerender() {
  const root = document.getElementById('mainBody')
  if (root) renderInto(root)
}

function capitalize(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')
}

/* ─── Fetch ─── */
function fetchAggregates() {
  if (cache.loadingState === 'loading') return
  cache.loadingState = 'loading'
  cache.error = null
  rerender()

  const ok = callRuby('get_available_aggregates')
  if (!ok) {
    // Preview/dev: usa embed imediatamente
    cache.aggregates = EMBEDDED_AGGREGATES.slice()
    cache.loadingState = 'ready'
    rerender()
    return
  }

  // Fallback timeout: se Ruby não responder em 400ms, usa embed
  setTimeout(() => {
    if (cache.loadingState === 'loading') {
      cache.aggregates = EMBEDDED_AGGREGATES.slice()
      cache.loadingState = 'ready'
      cache.error = 'Usando catálogo embed (timeout do bridge)'
      rerender()
    }
  }, 400)
}

/* Setter global Ruby→JS (instalado uma vez) */
if (typeof window !== 'undefined' && !window.__ornatoInternosSetters) {
  window.__ornatoInternosSetters = true
  window.onAggregatesList = function (payload) {
    const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
    const list = Array.isArray(p?.aggregates) ? p.aggregates : []
    // Mescla com EMBEDDED só pra garantir icon nos cards (icon não vem do JSON)
    const iconMap = {}
    EMBEDDED_AGGREGATES.forEach(a => { iconMap[a.id] = a.icon })
    cache.aggregates = list.map(a => ({ ...a, icon: a.icon || iconMap[a.id] || '🔧' }))
    cache.loadingState = 'ready'
    cache.error = null
    rerender()
  }
}

/* ─── Compat-check ─── */
function checkFits(agg) {
  const state = getState()
  const sel = state.selection
  if (!sel || sel.count === 0) return null

  // 1) Payload do resolve_selection pode trazer compatible_aggregates
  const compat = sel.payload?.compatible_aggregates
              || sel.items?.[0]?.compatible_aggregates
  if (Array.isArray(compat) && compat.length) {
    return compat.some(c => (typeof c === 'string' ? c : c.id) === agg.id)
  }

  // 2) Fallback: usa bbox do item selecionado (se módulo) vs min_bay
  const item = sel.items?.[0]
  if (item && (item.type === 'modulo' || item.kind === 'module') && item.bbox) {
    const { largura, altura, profundidade } = item.bbox
    if (largura == null || altura == null || profundidade == null) return null
    const mb = agg.min_bay || {}
    return largura     >= (mb.largura     || 0)
        && altura      >= (mb.altura      || 0)
        && profundidade>= (mb.profundidade|| 0)
  }
  return null
}

/* ─── Itens filtrados ─── */
function currentItems() {
  const list = cache.aggregates || []
  return list.filter(a => {
    if (cache.category !== 'all' && (a.bay_target || 'interior_bay') !== cache.category) return false
    if (cache.filter === 'fits_only' && checkFits(a) !== true) return false
    return true
  })
}

function availableCategories() {
  const list = cache.aggregates || []
  const set = new Set()
  list.forEach(a => set.add(a.bay_target || 'interior_bay'))
  return Array.from(set).sort()
}

/* ─── Render ─── */
export function render(container, _ctx) {
  if (cache.loadingState === 'idle') fetchAggregates()
  renderInto(container)
}

function renderInto(container) {
  if (!container) return

  if (cache.loadingState === 'idle' || cache.loadingState === 'loading') {
    container.innerHTML = renderLoading()
    return
  }

  container.innerHTML = `
    <section class="int-tab">
      ${renderHeader()}
      ${renderHint()}
      ${renderFilters()}
      ${renderGrid()}
    </section>
  `
  bindHandlers(container)
}

function renderLoading() {
  const cards = Array.from({ length: 4 }).map(() => `
    <div class="int-card int-card--skeleton">
      <div class="int-thumb int-skel"></div>
      <div class="int-skel int-skel--line"></div>
      <div class="int-skel int-skel--line int-skel--short"></div>
    </div>
  `).join('')
  return `
    <section class="int-tab">
      <div class="int-header">
        <h2>Internos — Agregados</h2>
        <span class="int-stats">Carregando catálogo…</span>
      </div>
      <div class="int-grid">${cards}</div>
    </section>
  `
}

function renderHeader() {
  const total = (cache.aggregates || []).length
  return `
    <div class="int-header">
      <h2>Internos — Agregados</h2>
      <span class="int-stats">
        ${total} ${total === 1 ? 'agregado' : 'agregados'}
        ${cache.error ? `· <span class="int-warn" title="${htmlEscape(cache.error)}">⚠ offline</span>` : ''}
      </span>
      <button class="btn btn-ghost btn-sm" data-action="refresh" title="Recarregar agregados">↻ Recarregar</button>
    </div>
  `
}

function renderHint() {
  const state = getState()
  const sel = state.selection
  const hasModule = sel && sel.items?.some(i => i.type === 'modulo' || i.kind === 'module')

  if (!hasModule) {
    return `
      <div class="int-hint int-hint--info">
        ℹ Selecione um módulo no SketchUp para ver compatibilidade
        e inserir agregados nos vãos internos.
      </div>
    `
  }
  return `
    <div class="int-hint int-hint--ok">
      ✓ Módulo selecionado. Clique em "Inserir" e mire no vão desejado.
    </div>
  `
}

function renderFilters() {
  const cats = availableCategories()
  const showCat = cats.length > 1
  return `
    <div class="int-filters">
      <label class="int-toggle">
        <input type="checkbox" data-action="toggle-fits"
               ${cache.filter === 'fits_only' ? 'checked' : ''} />
        <span>Apenas cabe no selecionado</span>
      </label>
      ${showCat ? `
        <select class="int-select" data-action="select-category">
          <option value="all" ${cache.category === 'all' ? 'selected' : ''}>Todas categorias</option>
          ${cats.map(c => `
            <option value="${htmlEscape(c)}" ${cache.category === c ? 'selected' : ''}>${htmlEscape(capitalize(c))}</option>
          `).join('')}
        </select>
      ` : ''}
    </div>
  `
}

function renderGrid() {
  const items = currentItems()
  if (!items.length) {
    return `
      <div class="int-empty">
        ${cache.filter === 'fits_only'
          ? '<p>Nenhum agregado cabe no vão selecionado.</p><p class="int-empty-detail">Tente desativar o filtro ou selecionar um módulo maior.</p>'
          : '<p>Nenhum agregado disponível.</p>'}
      </div>
    `
  }
  return `<div class="int-grid">${items.map(renderCard).join('')}</div>`
}

function renderCard(agg) {
  const fits = checkFits(agg)
  let fitsHtml = '<span class="int-fits int-fits--unknown">ℹ Selecione módulo</span>'
  let disabled = false
  if (fits === true) {
    fitsHtml = '<span class="int-fits int-fits--ok">✓ Cabe</span>'
  } else if (fits === false) {
    fitsHtml = '<span class="int-fits int-fits--bad">✗ Vão pequeno</span>'
    disabled = true
  }

  const mb = agg.min_bay || {}
  const minLabel = `${mb.largura || '?'}×${mb.altura || '?'}×${mb.profundidade || '?'} mm`

  return `
    <button class="int-card ${disabled ? 'int-card--disabled' : ''}"
            data-action="insert" data-id="${htmlEscape(agg.id)}"
            ${disabled ? 'disabled' : ''}
            title="${htmlEscape(agg.descricao || agg.nome)}">
      <div class="int-thumb">${agg.icon || '🔧'}</div>
      <h3 class="int-card-title">${htmlEscape(agg.nome)}</h3>
      <p class="int-card-meta">Min: ${htmlEscape(minLabel)}</p>
      ${fitsHtml}
      <span class="int-card-action">${disabled ? 'Indisponível' : 'Inserir'}</span>
    </button>
  `
}

/* ─── Bind ─── */
function bindHandlers(container) {
  container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
    cache.aggregates = null
    cache.loadingState = 'idle'
    fetchAggregates()
  })

  container.querySelector('[data-action="toggle-fits"]')?.addEventListener('change', (ev) => {
    cache.filter = ev.target.checked ? 'fits_only' : 'all'
    rerender()
  })

  container.querySelector('[data-action="select-category"]')?.addEventListener('change', (ev) => {
    cache.category = ev.target.value || 'all'
    rerender()
  })

  container.querySelectorAll('[data-action="insert"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return
      const id = btn.getAttribute('data-id')
      if (!id) return
      const ok = callRuby('start_aim_placement', id)
      if (window.showToast) {
        window.showToast(
          ok ? `Mire no vão dentro do módulo para inserir ${id}` : `Bridge ausente (preview): ${id}`,
          ok ? 'info' : 'warn'
        )
      }
    })
  })
}

/* ─── Setter Ruby→JS pra ack do AimPlacementTool (futuro) ─── */
if (typeof window !== 'undefined' && !window.__ornatoInternosAckSetter) {
  window.__ornatoInternosAckSetter = true
  window.onAggregateInserted = function (payload) {
    const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
    if (window.showToast) {
      window.showToast(
        p?.ok ? `Agregado inserido: ${p.aggregate_id || ''}` : `Falha: ${p?.error || 'erro'}`,
        p?.ok ? 'success' : 'error'
      )
    }
  }
}
