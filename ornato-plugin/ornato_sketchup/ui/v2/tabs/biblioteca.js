/**
 * Tab Biblioteca — F1.4 real (Sprint UX-5)
 *
 * Mostra catálogo de módulos do ERP (manifest + search + filters por ambiente/tipo)
 * e permite inserir um módulo no SketchUp com um clique.
 *
 * Bridge:
 *   HTTP → /api/library/manifest          (lista completa, cacheável)
 *          /api/library/search?q=…        (busca BM25 + facets)
 *          /api/library/filters           (categorias e tipos disponíveis)
 *   JS   → callRuby('insert_module_from_library', { module_id })
 *
 * UX baseada em UpMobb library_easy.html, mas grid-card (não árvore):
 *   - Search topo (debounce 250ms, BM25 quando q≥2)
 *   - Strip de categorias (cozinha, banheiro, dormitório, closet, …)
 *   - Strip de tipos (balcão, aéreo, coluna, gaveteiro, torre, …)
 *   - Grid de cards (24/página com “Carregar mais”)
 *   - Estados: idle/loading/error/empty/ready
 *
 * Limitações MVP: sem favoritos, sem histórico, sem preview hover,
 * sem filtro "cabe no vão". Endpoints `/api/library/autocomplete` e
 * `/api/library/manifest` (channel/version) ficam disponíveis para
 * próximos sprints.
 */

import { callRuby, getState } from '../app.js'
import { iconHTML } from '../icons.js'

export const meta = { phase: 'F1.4-real' }

/* ─── Estado local da tab (sobrevive entre re-renders) ─── */
const lib = {
  manifest: null,         // { modules: [...], library_version, channel, ... }
  loadingState: 'idle',   // 'idle' | 'loading' | 'ready' | 'error'
  error: null,
  modulesByCat: {},       // categoria → array<modulo>
  categories: [],         // [{ id, label, count }]
  typesByCategory: {},    // categoria → [{ id, label, count }]
  selectedCategory: null,
  selectedType: null,
  searchQuery: '',
  searchResults: null,    // null = sem busca ativa
  searching: false,
  page: 0,
  perPage: 24,
}

/* ─── Helpers ─── */
function htmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function debounce(fn, ms) {
  let t = null
  return (...args) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => { t = null; fn(...args) }, ms)
  }
}

function rerender() {
  const root = document.getElementById('mainBody')
  if (root) renderInto(root)
}

/* ─── Auth token (compartilhado com resto do ERP front) ─── */
function authHeaders() {
  const h = { 'Accept': 'application/json' }
  try {
    const tok = (typeof localStorage !== 'undefined') && localStorage.getItem('erp_token')
    if (tok) h['Authorization'] = `Bearer ${tok}`
  } catch (_e) { /* localStorage indisponível em alguns embeds */ }
  return h
}

function apiBase() {
  // Em embed SketchUp, JS roda em about:blank — usamos URL absoluta via state
  // ou fallback localhost. Permite override por window.ORNATO_API_BASE.
  if (typeof window !== 'undefined' && window.ORNATO_API_BASE) return window.ORNATO_API_BASE
  return '' // relativo (quando servido pelo próprio ERP)
}

/* ─── Indexação ─── */
function indexManifest(manifest) {
  const modules = Array.isArray(manifest?.modules) ? manifest.modules : []
  const byCat = {}
  const typesByCat = {}
  const catCounts = {}

  modules.forEach(m => {
    const cat = (m.category || m.categoria || 'outros').toLowerCase()
    const type = (m.type || m.tipo || '').toLowerCase() || null
    if (!byCat[cat]) byCat[cat] = []
    byCat[cat].push(m)
    catCounts[cat] = (catCounts[cat] || 0) + 1
    if (type) {
      if (!typesByCat[cat]) typesByCat[cat] = {}
      typesByCat[cat][type] = (typesByCat[cat][type] || 0) + 1
    }
  })

  lib.modulesByCat = byCat
  lib.categories = Object.keys(byCat).sort().map(id => ({
    id, label: capitalize(id), count: catCounts[id] || 0,
  }))
  lib.typesByCategory = {}
  Object.keys(typesByCat).forEach(cat => {
    lib.typesByCategory[cat] = Object.entries(typesByCat[cat])
      .map(([id, count]) => ({ id, label: capitalize(id), count }))
      .sort((a, b) => b.count - a.count)
  })

  // Seleção default: primeira categoria que tiver módulos
  if (!lib.selectedCategory && lib.categories.length) {
    lib.selectedCategory = lib.categories[0].id
  }
}

function capitalize(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')
}

/* ─── Fetch manifest ─── */
function fetchManifest() {
  if (lib.loadingState === 'loading') return
  lib.loadingState = 'loading'
  lib.error = null
  rerender()

  fetch(apiBase() + '/api/library/manifest', { headers: authHeaders() })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then(data => {
      lib.manifest = data
      indexManifest(data)
      lib.loadingState = 'ready'
      lib.page = 0
      rerender()
    })
    .catch(err => {
      console.warn('[Ornato] manifest fetch falhou:', err && err.message)
      // Modo preview/dev: mock minimal
      const mock = previewManifestMock()
      lib.manifest = mock
      indexManifest(mock)
      lib.loadingState = 'ready'
      lib.error = `Usando preview (offline): ${err && err.message || err}`
      rerender()
    })
}

function previewManifestMock() {
  const mk = (id, name, cat, type) => ({
    id, name, category: cat, type,
    channel: 'stable', version: '1.0.13', thumbnail_url: null,
    dims: { largura: 800, altura: 720, profundidade: 560 },
  })
  return {
    library_version: '1.0.13',
    channel: 'stable',
    modules: [
      mk('balcao_2_portas',   'Balcão 2 portas',   'cozinha',   'balcao'),
      mk('balcao_pia',        'Balcão pia',        'cozinha',   'balcao'),
      mk('balcao_cooktop',    'Balcão cooktop',    'cozinha',   'balcao'),
      mk('balcao_canto_l',    'Balcão canto L',    'cozinha',   'balcao'),
      mk('aereo_2_portas',    'Aéreo 2 portas',    'cozinha',   'aereo'),
      mk('aereo_basculante',  'Aéreo basculante',  'cozinha',   'aereo'),
      mk('coluna_forno',      'Coluna forno',      'cozinha',   'coluna'),
      mk('gaveteiro_4g',      'Gaveteiro 4 gav.',  'cozinha',   'gaveteiro'),
      mk('torre_geladeira',   'Torre geladeira',   'cozinha',   'torre'),
      mk('balcao_banheiro',   'Balcão banheiro',   'banheiro',  'balcao'),
      mk('espelheira',        'Espelheira',        'banheiro',  'aereo'),
      mk('guarda_roupa_3p',   'Guarda-roupa 3 portas', 'dormitorio', 'armario'),
      mk('cabeceira_simples', 'Cabeceira',         'dormitorio', 'cabeceira'),
      mk('closet_modulo_p',   'Closet módulo P',   'closet',    'modulo'),
    ],
  }
}

/* ─── Search ─── */
const debouncedSearch = debounce(_runSearch, 250)

function _runSearch(q) {
  if (!q || q.length < 2) {
    lib.searchResults = null
    lib.searching = false
    rerender()
    return
  }
  lib.searching = true
  rerender()
  fetch(apiBase() + '/api/library/search?q=' + encodeURIComponent(q), { headers: authHeaders() })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then(data => {
      lib.searchResults = Array.isArray(data?.results) ? data.results
                          : Array.isArray(data?.modules) ? data.modules
                          : []
      lib.searching = false
      rerender()
    })
    .catch(_err => {
      // Fallback: filtro local sobre o manifest
      const ql = q.toLowerCase()
      const all = (lib.manifest?.modules || [])
      lib.searchResults = all.filter(m =>
        (m.name || '').toLowerCase().includes(ql) ||
        (m.id || '').toLowerCase().includes(ql) ||
        (Array.isArray(m.tags) && m.tags.some(t => String(t).toLowerCase().includes(ql)))
      )
      lib.searching = false
      rerender()
    })
}

/* ─── Seleção dos itens visíveis (com filtros) ─── */
function currentItems() {
  if (lib.searchResults) return lib.searchResults

  const cat = lib.selectedCategory
  let items = cat ? (lib.modulesByCat[cat] || []) : (lib.manifest?.modules || [])

  if (lib.selectedType) {
    items = items.filter(m => (m.type || m.tipo || '').toLowerCase() === lib.selectedType)
  }
  return items
}

/* ─── Render principal ─── */
export function render(container, _ctx) {
  if (lib.loadingState === 'idle') {
    fetchManifest()
  }
  renderInto(container)
}

function renderInto(container) {
  if (!container) return

  if (lib.loadingState === 'idle' || lib.loadingState === 'loading') {
    container.innerHTML = renderLoading()
    return
  }
  if (lib.loadingState === 'error') {
    container.innerHTML = renderError()
    bindRetry(container)
    return
  }

  container.innerHTML = `
    <section class="lib-tab">
      ${renderHeader()}
      ${renderSearchBar()}
      ${renderCategoryStrip()}
      ${renderTypeStrip()}
      ${renderModuleGrid()}
      ${renderFooter()}
    </section>
  `
  bindHandlers(container)
}

function renderLoading() {
  // Skeleton: 8 cards cinza pulsando
  const cards = Array.from({ length: 8 }).map(() => `
    <div class="lib-card lib-card--skeleton">
      <div class="lib-thumb lib-skel"></div>
      <div class="lib-skel lib-skel--line"></div>
      <div class="lib-skel lib-skel--line lib-skel--short"></div>
    </div>
  `).join('')
  return `
    <section class="lib-tab">
      <div class="lib-header">
        <h2>Biblioteca</h2>
        <span class="lib-stats">Carregando catálogo…</span>
      </div>
      <div class="lib-grid">${cards}</div>
    </section>
  `
}

function renderError() {
  return `
    <section class="lib-tab">
      <div class="lib-header"><h2>Biblioteca</h2></div>
      <div class="lib-empty">
        <p>Não foi possível carregar a biblioteca.</p>
        <p class="lib-empty-detail">${htmlEscape(lib.error || 'Erro desconhecido')}</p>
        <button class="btn btn-primary" data-action="retry">Tentar novamente</button>
      </div>
    </section>
  `
}

function renderHeader() {
  const m = lib.manifest || {}
  const total = (m.modules || []).length
  const channel = m.channel || 'stable'
  const version = m.library_version || m.version || 'dev'
  return `
    <div class="lib-header">
      <h2>Biblioteca</h2>
      <span class="lib-stats">
        ${total} ${total === 1 ? 'módulo' : 'módulos'}
        · <span class="lib-channel">${htmlEscape(channel)}</span>
        · v${htmlEscape(version)}
      </span>
      <button class="btn btn-ghost btn-sm" data-action="refresh" title="Recarregar biblioteca">
        ${iconHTML('layers', 12)} Recarregar
      </button>
    </div>
  `
}

function renderSearchBar() {
  return `
    <div class="lib-search-wrap">
      <input type="search"
             class="lib-search"
             value="${htmlEscape(lib.searchQuery)}"
             placeholder="Buscar por nome ou tag…"
             data-action="search-input"
             autocomplete="off" />
      ${lib.searching ? '<span class="lib-search-spinner">…</span>' : ''}
      ${lib.searchResults ? `<button class="lib-search-clear" data-action="search-clear" title="Limpar busca">×</button>` : ''}
    </div>
  `
}

function renderCategoryStrip() {
  if (lib.searchResults) return '' // durante busca, esconde strip
  const cats = lib.categories
  if (!cats.length) return ''
  return `
    <div class="lib-strip lib-strip--cat" role="tablist">
      ${cats.map(c => `
        <button class="lib-chip ${c.id === lib.selectedCategory ? 'active' : ''}"
                data-action="select-cat" data-cat="${htmlEscape(c.id)}">
          ${htmlEscape(c.label)}
          <span class="lib-chip-count">${c.count}</span>
        </button>
      `).join('')}
    </div>
  `
}

function renderTypeStrip() {
  if (lib.searchResults) return ''
  const types = lib.typesByCategory[lib.selectedCategory] || []
  if (types.length <= 1) return '' // só mostra se há ≥2 tipos
  return `
    <div class="lib-strip lib-strip--type">
      <button class="lib-chip lib-chip--ghost ${!lib.selectedType ? 'active' : ''}"
              data-action="select-type" data-type="">
        Todos
      </button>
      ${types.map(t => `
        <button class="lib-chip lib-chip--ghost ${t.id === lib.selectedType ? 'active' : ''}"
                data-action="select-type" data-type="${htmlEscape(t.id)}">
          ${htmlEscape(t.label)}
          <span class="lib-chip-count">${t.count}</span>
        </button>
      `).join('')}
    </div>
  `
}

function renderModuleGrid() {
  const items = currentItems()
  if (!items.length) return renderEmpty()

  const limit = (lib.page + 1) * lib.perPage
  const visible = items.slice(0, limit)
  const remaining = items.length - visible.length

  return `
    <div class="lib-grid">${visible.map(renderCard).join('')}</div>
    ${remaining > 0 ? `
      <div class="lib-loadmore">
        <button class="btn btn-ghost" data-action="load-more">
          + ${remaining} ${remaining === 1 ? 'outro' : 'outros'} — Carregar mais
        </button>
      </div>
    ` : ''}
  `
}

function renderCard(m) {
  const id = htmlEscape(m.id || '')
  const name = htmlEscape(m.name || m.id || 'Sem nome')
  const cat = htmlEscape(m.category || m.categoria || '')
  const channel = htmlEscape(m.channel || 'stable')
  const dims = m.dims || m.dimensions || null
  const dimsLabel = dims ? `${dims.largura || dims.w || '?'}×${dims.altura || dims.h || '?'}` : ''
  const thumb = m.thumbnail_url
    ? `<img src="${htmlEscape(m.thumbnail_url)}" loading="lazy" alt=""/>`
    : `<span class="lib-thumb-fallback">${iconHTML('layers', 22)}</span>`

  return `
    <button class="lib-card" data-action="insert" data-id="${id}" title="Inserir ${name}">
      <div class="lib-thumb">${thumb}</div>
      <h3 class="lib-card-title">${name}</h3>
      <div class="lib-card-meta">
        ${cat ? `<span class="lib-card-cat">${cat}</span>` : ''}
        ${dimsLabel ? `<span class="lib-card-dims">${dimsLabel}</span>` : ''}
      </div>
      <span class="lib-badge lib-badge--${channel}">${channel}</span>
    </button>
  `
}

function renderEmpty() {
  if (lib.searchResults && lib.searchQuery) {
    return `<div class="lib-empty">
      <p>Nenhum módulo encontrado para “${htmlEscape(lib.searchQuery)}”.</p>
    </div>`
  }
  if (!lib.selectedCategory) {
    return `<div class="lib-empty"><p>Selecione um ambiente para ver módulos.</p></div>`
  }
  return `<div class="lib-empty"><p>Sem módulos nesta categoria.</p></div>`
}

function renderFooter() {
  return `
    <div class="lib-footer">
      <span>${iconHTML('info', 11)} Selecionou um módulo? Use as tabs Ferragens / Agregados para ajustes.</span>
    </div>
  `
}

/* ─── Bind ─── */
function bindRetry(container) {
  container.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
    lib.loadingState = 'idle'
    fetchManifest()
  })
}

function bindHandlers(container) {
  container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
    lib.loadingState = 'idle'
    lib.manifest = null
    lib.searchResults = null
    lib.searchQuery = ''
    fetchManifest()
  })

  const input = container.querySelector('[data-action="search-input"]')
  if (input) {
    input.addEventListener('input', (ev) => {
      lib.searchQuery = ev.target.value
      debouncedSearch(ev.target.value)
    })
  }

  container.querySelector('[data-action="search-clear"]')?.addEventListener('click', () => {
    lib.searchQuery = ''
    lib.searchResults = null
    lib.page = 0
    rerender()
  })

  container.querySelectorAll('[data-action="select-cat"]').forEach(btn => {
    btn.addEventListener('click', () => {
      lib.selectedCategory = btn.getAttribute('data-cat')
      lib.selectedType = null
      lib.page = 0
      rerender()
    })
  })

  container.querySelectorAll('[data-action="select-type"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-type') || null
      lib.selectedType = t || null
      lib.page = 0
      rerender()
    })
  })

  container.querySelector('[data-action="load-more"]')?.addEventListener('click', () => {
    lib.page += 1
    rerender()
  })

  container.querySelectorAll('[data-action="insert"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id')
      if (!id) return
      const ok = callRuby('insert_module_from_library', { module_id: id })
      if (window.showToast) {
        window.showToast(ok ? `Inserindo ${id}…` : `Bridge ausente (preview): ${id}`, ok ? 'info' : 'warn')
      }
    })
  })
}

/* ─── Setter global p/ ack do Ruby (futuro) ─── */
if (typeof window !== 'undefined' && !window.__ornatoLibrarySetters) {
  window.__ornatoLibrarySetters = true
  window.onLibraryModuleInserted = function (payload) {
    const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
    if (window.showToast) {
      window.showToast(
        p?.ok ? `Módulo inserido: ${p.module_id || ''}` : `Falha ao inserir: ${p?.error || 'erro'}`,
        p?.ok ? 'success' : 'error'
      )
    }
  }
}
