/**
 * Ornato Plugin v2 — App principal
 * Vanilla JS modular, sem build step. Funciona em HtmlDialog do SketchUp.
 *
 * Arquitetura:
 *  - state: objeto mutável central, com observers
 *  - render(): re-renderiza topbar, nav, submenu, main, inspector, statusbar
 *  - tabs/<id>.js: cada tab exporta { render(container, ctx), submenu, primaryAction }
 *  - bridge ↔ Ruby: window.sketchup?.callRuby() — opcional
 */

import { tabs, getTab, primaryActionByTab } from './tabs/index.js'
import { iconHTML, ICONS } from './icons.js'

/* ═══════════════════════════════════════════════════════════
 *  STATE
 * ═══════════════════════════════════════════════════════════ */

const state = {
  /** id da tab ativa (default biblioteca) */
  activeTab: 'biblioteca',
  /** map tabId → submenuId ativo */
  submenuByTab: {
    projeto: 'cliente',
    ambiente: 'paredes',
    biblioteca: 'cozinha',
    internos: 'gavetas',
    acabamentos: 'mdf',
    ferragens: 'dobradicas',
    usinagens: 'furacao',
    validacao: 'resumo',
    producao: 'envio',
  },
  /** ambiente ativo (multi-ambientes por projeto) */
  ambienteId: 'cozinha',
  /** Seleção do SketchUp (preenchida via window.onSelectionChanged).
   *  Shape: { count, multi, items: [{ entity_id, type, name, attrs, bbox }], type_counts, label } */
  selection: { count: 0, items: [], multi: false, label: null },
  /** Cache de detalhes carregados sob demanda por entity_id */
  detailsCache: {},          // { [entity_id]: { type, data, loadedAt } }
  detailsLoading: {},        // { [entity_id]: true } — em flight
  /** sync com nuvem */
  syncStatus: 'online', // online | offline | syncing | error
  /** estado responsivo (medido a cada resize) */
  width: window.innerWidth,
  /** UI flags */
  navExpanded: window.innerWidth >= 720,
  showInspector: window.innerWidth >= 720,
  /** Overlays */
  paletteOpen: false,
  configOpen: false,
  composicaoOpen: false,
  conflictsOpen: false,
  /** Modo Foco */
  focusMode: false,
  /** Tema (persistido) */
  theme: localStorage.getItem('ornato.theme') || 'light',
  /** Shop config carregada do Ruby (null = ainda não carregou) */
  shopConfig: null,
  shopConfigLoading: false,
  shopConfigError: null,
  /** Status de sincronização com ERP (Sprint SHOP-3) */
  shopConfigSync: null, // { profile, version, last_sync_at, cached, ok? }
  shopConfigSyncing: false,
  /** Overrides locais (Sprint SHOP-5) — chaves do to_expr_params */
  shopOverrides: {},
  /** Seções colapsadas no drawer (default: todas abertas) */
  shopDrawerCollapsed: {},
  /** Inputs em modo override-edit no drawer ({key: 'editing'|'idle'}) */
  shopOverrideEditing: {},
  /** Cache do último módulo selecionado (id + ferragens) */
  moduleFerragens: null, // { entity_id, pieces: [...] } ou null
  moduleFerragensLoading: false,
}

/* ═══════════════════════════════════════════════════════════
 *  RUBY BRIDGE — callRuby + window.callbacks
 * ═══════════════════════════════════════════════════════════
 * Padrão usado pelo dialog_controller.rb existente:
 *   - JS chama  window.sketchup.<callback_name>(arg_string)
 *   - Ruby responde via  dialog.execute_script("window.<setter>(<json>)")
 *
 * Aqui expomos:
 *   - callRuby(name, arg)  → fire-and-forget (Ruby usa setters globais)
 *   - window.setShopConfig(payload) → recebe { config, catalog }
 *   - window.setModuleMachining(payload) → recebe { pieces: [...] }
 *   - window.showToast(msg, kind) → toast simples (logs por enquanto)
 */
export function callRuby(name, arg) {
  try {
    if (window.sketchup && typeof window.sketchup[name] === 'function') {
      // Ruby exige string única — serializa objetos como JSON
      const payload = (arg === undefined || arg === null)
        ? ''
        : (typeof arg === 'string' ? arg : JSON.stringify(arg))
      window.sketchup[name](payload)
      return true
    }
    console.warn(`[Ornato] callRuby('${name}') — bridge ausente (preview/dev?)`)
    return false
  } catch (e) {
    console.error(`[Ornato] callRuby('${name}') ERRO:`, e)
    return false
  }
}

/* Setters globais que o Ruby chama via execute_script */
window.setShopConfig = function (payload) {
  // payload pode vir como string JSON ou já como objeto
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  setState({
    shopConfig: p?.config || p || {},
    shopConfigLoading: false,
    shopConfigError: null,
  })
}

window.onShopConfigSync = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  setState({
    shopConfigSync: p || null,
    shopConfigSyncing: false,
  })
  if (p && p.ok !== false) {
    // após sync bem-sucedida, recarrega config
    state.shopConfig = null
    ensureShopConfigLoaded()
  }
}

window.onShopConfigStatus = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  setState({ shopConfigSync: p || null })
}

window.onShopOverrides = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  setState({ shopOverrides: p || {} })
}

window.onModuleSnapshotRefresh = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  if (p && p.ok) {
    window.showToast(`Snapshot atualizado · v${p.version}`, 'success')
  } else {
    window.showToast(`Falha ao atualizar snapshot${p?.error ? ': ' + p.error : ''}`, 'error')
  }
}

/* ── UI v2 Inspector contextual ───────────────────────────────
 * Ruby chama window.onSelectionChanged(payload) sempre que a
 * seleção do SketchUp muda. Payload:
 *   { count, multi, items: [{ entity_id, type, name, attrs, bbox }], type_counts }
 */
window.onSelectionChanged = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  const sel = p && typeof p === 'object' ? p : { count: 0, items: [] }
  // label de fallback (usado pelo statusbar/chip de seleção)
  if (!sel.label) {
    if (sel.count === 0) sel.label = null
    else if (sel.count === 1) sel.label = sel.items?.[0]?.name || sel.items?.[0]?.type || 'item'
    else sel.label = `${sel.count} itens`
  }
  setState({ selection: sel })
}

window.onModuleDetails = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  if (!p || !p.entity_id) return
  state.detailsCache[p.entity_id] = { type: 'modulo', data: p, loadedAt: Date.now() }
  delete state.detailsLoading[p.entity_id]
  render()
}

window.onPieceDetails = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  if (!p || !p.entity_id) return
  state.detailsCache[p.entity_id] = { type: 'peca', data: p, loadedAt: Date.now() }
  delete state.detailsLoading[p.entity_id]
  render()
}

window.onAggregateDetails = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  if (!p || !p.entity_id) return
  state.detailsCache[p.entity_id] = { type: 'agregado', data: p, loadedAt: Date.now() }
  delete state.detailsLoading[p.entity_id]
  render()
}

window.setModuleMachining = function (payload) {
  const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
  const prev = state.moduleFerragens || {}
  setState({
    moduleFerragens: {
      entityId: prev.entityId ?? null,
      pieces:   p?.pieces || [],
    },
    moduleFerragensLoading: false,
  })
}

window.showToast = function (msg, kind = 'info') {
  // Toast minimal — substituir por componente real depois
  console.log(`[Ornato Toast · ${kind}] ${msg}`)
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `
    position:fixed;bottom:48px;left:50%;transform:translateX(-50%);
    background:${kind === 'success' ? '#16a34a' : kind === 'error' ? '#dc2626' : '#1a1f29'};
    color:white;padding:8px 14px;border-radius:8px;font-size:12px;
    box-shadow:0 12px 36px rgba(15,23,42,0.18);z-index:9999;font-family:inherit;
  `
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2400)
}

/* Helper: hidrata shopConfig no boot (e on-demand quando drawer abrir) */
function ensureShopConfigLoaded() {
  if (state.shopConfig || state.shopConfigLoading) return
  state.shopConfigLoading = true
  const ok = callRuby('get_shop_config')
  // pede também overrides + status (Sprint SHOP-5)
  callRuby('get_shop_overrides')
  callRuby('get_shop_config_status')
  if (!ok) {
    // Modo preview/dev: usa mock mínimo pra UI ser navegável
    setState({
      shopConfig: PREVIEW_SHOP_CONFIG_MOCK,
      shopConfigLoading: false,
      shopConfigError: null,
      shopConfigSync: state.shopConfigSync || { profile: 'preview', version: 'dev', last_sync_at: null, cached: false },
      shopOverrides: state.shopOverrides || {},
    })
  }
}

/* Mock só pra preview.html (sem Ruby) — espelha shape de FACTORY_DEFAULTS (subset) */
const PREVIEW_SHOP_CONFIG_MOCK = {
  dobradica: {
    modelo: 'blum_clip_top',
    angulo: 110,
    cup_dia: 35.0,
    cup_depth: 13.5,
    edge_offset: 22.0,
  },
  system32: {
    ativo: false,
    spacing: 32.0,
  },
  pino_prateleira: {
    espacamento: 32.0,
    profundidade: 12.0,
    diametro: 5.0,
  },
  folgas: {
    porta_abrir: { lateral_ext: 2.0, lateral_int: 1.5, entre_modulos: 3.0 },
    prateleira:  { traseira: 20.0 },
  },
}

/* ═══════════════════════════════════════════════════════════
 *  MOCKS (substituir por dados reais do Ruby bridge depois)
 * ═══════════════════════════════════════════════════════════ */

export const projectMock = {
  cliente: 'Família Silva',
  pieces: 42,
  area: 8.3,
  valor: 4280,
}

export const ambientesMock = [
  { id: 'cozinha',     label: 'Cozinha',           pieces: 42, valor: 4280 },
  { id: 'dorm-casal',  label: 'Dormitório casal',  pieces: 28, valor: 3120 },
  { id: 'dorm-filhos', label: 'Dormitório filhos', pieces: 18, valor: 1980 },
  { id: 'banheiro',    label: 'Banheiro suíte',    pieces: 12, valor: 1450 },
  { id: 'gourmet',     label: 'Área gourmet',      pieces: 22, valor: 2860 },
]

export const conflictsMock = [
  { id: 'c1', severity: 'warn',  title: 'Furação conflitante', detail: 'Módulo M-014 e M-015 têm furação na mesma face.' },
  { id: 'c2', severity: 'error', title: 'Material ausente',     detail: 'Painel "Lateral cozinha" sem material atribuído.' },
]

/* ═══════════════════════════════════════════════════════════
 *  STATE HELPERS
 * ═══════════════════════════════════════════════════════════ */

function setState(partial) {
  // Quando mudar a seleção, invalida cache de ferragens do módulo
  if (partial.selection && partial.selection !== state.selection) {
    state.moduleFerragens = null
  }
  Object.assign(state, partial)
  render()
}

/* Solicita detalhes ao Ruby para item selecionado (se ainda não no cache).
 * Type-aware: dispara o callback certo (`get_module_details`, etc). */
function ensureSelectionDetailsLoaded(item) {
  if (!item || !item.entity_id) return null
  const id = item.entity_id
  const cached = state.detailsCache[id]
  if (cached && cached.type === item.type) return cached.data
  if (state.detailsLoading[id]) return null
  state.detailsLoading[id] = true

  const arg = { entity_id: id }
  let ok = false
  if (item.type === 'modulo')        ok = callRuby('get_module_details', arg)
  else if (item.type === 'peca')     ok = callRuby('get_piece_details',  arg)
  else if (item.type === 'agregado') ok = callRuby('get_aggregate_details', arg)
  else if (item.type === 'ferragem') ok = callRuby('get_piece_details',  arg) // fallback

  if (!ok) {
    // Modo preview/dev: produz mock minimal e injeta direto no cache
    setTimeout(() => {
      const mock = makePreviewDetailsMock(item)
      state.detailsCache[id] = { type: item.type, data: mock, loadedAt: Date.now() }
      delete state.detailsLoading[id]
      render()
    }, 80)
  }
  return null
}

function makePreviewDetailsMock(item) {
  const id = item.entity_id
  const name = item.name || item.type
  const bbox = item.bbox || { w: 800, h: 720, d: 560 }
  switch (item.type) {
    case 'modulo':
      return {
        ok: true, entity_id: id, name, module_type: 'armario_2_portas_inferior',
        params: { largura: bbox.w, altura: bbox.h, profundidade: bbox.d, n_portas: 2 },
        ferragens_counts: { dobradica: 4, minifix: 6, puxador: 2 },
        ferragens_total: 12,
        agregados_count: 1,
        children: [
          { entity_id: 'mock_p1', tipo: 'peca', name: 'Lateral esq', role: 'lateral_esq' },
          { entity_id: 'mock_p2', tipo: 'peca', name: 'Lateral dir', role: 'lateral_dir' },
          { entity_id: 'mock_a1', tipo: 'agregado', name: 'Prateleira interna', aggregate_id: 'prateleira', bay_id: 'bay_1' },
        ],
        shop_profile: 'preview', shop_version: 'dev',
      }
    case 'peca':
      return {
        ok: true, entity_id: id, name, role: item.attrs?.role || 'generic',
        dims: { largura: bbox.w, altura: bbox.h, espessura: 18 },
        material: 'MDF Branco TX 18mm',
        bordas: { frente: 'fita_2mm', tras: 'fita_05mm', topo: 'fita_05mm', base: 'fita_05mm' },
        origin: [0, 0, 0],
        extra_ops: [],
      }
    case 'ferragem':
      return {
        ok: true, entity_id: id, name, role: 'ferragem',
        regra: item.attrs?.regra || 'dobradica',
        componente_3d: item.attrs?.componente_3d || 'blum_clip_top.skp',
        anchor_role: item.attrs?.anchor_role || 'lateral',
      }
    case 'agregado':
      return {
        ok: true, entity_id: id, name,
        aggregate_id: item.attrs?.aggregate_id || 'prateleira',
        bay_id: item.attrs?.bay_id || 'bay_1',
        params: { altura: 360 },
        bay_dims: bbox,
      }
    default:
      return { ok: true, entity_id: id, name, raw_attrs: item.attrs || {} }
  }
}

export function getState() { return state }

export function getCurrentAmbiente() {
  return ambientesMock.find(a => a.id === state.ambienteId) ?? ambientesMock[0]
}

/* ═══════════════════════════════════════════════════════════
 *  RENDER
 * ═══════════════════════════════════════════════════════════ */

function render() {
  applyTheme()
  renderBreadcrumb()
  renderNavSidebar()
  renderSubmenu()
  renderMain()
  renderInspector()
  renderStatusBar()
  renderOverlays()
  syncFocusMode()
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme)
}

function syncFocusMode() {
  document.body.classList.toggle('focus-mode', state.focusMode)
}

/* ─── Breadcrumb (topbar) ─── */
function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb')
  if (!el) return
  const compact = state.width < 520
  const amb = getCurrentAmbiente()
  if (compact) {
    el.innerHTML = `
      <button class="ambiente-chip" data-action="ambiente-picker" title="Projeto: ${projectMock.cliente} · ${amb.label}">
        <span style="max-width:80px;overflow:hidden;text-overflow:ellipsis;">${amb.label}</span>
        ${iconHTML('chevron-down', 10)}
      </button>`
  } else {
    el.innerHTML = `
      <button class="proj-chip" title="Projeto: ${projectMock.cliente}">
        <span style="overflow:hidden;text-overflow:ellipsis;font-weight:500">${projectMock.cliente}</span>
      </button>
      <span class="sep">${iconHTML('chevron-right', 12)}</span>
      <button class="ambiente-chip" data-action="ambiente-picker">
        <span>${amb.label}</span>
        ${iconHTML('chevron-down', 12)}
      </button>`
  }
  // futuro: bind do popover do ambiente
}

/* ─── Nav sidebar (10 tabs) ─── */
function renderNavSidebar() {
  const el = document.getElementById('navSidebar')
  if (!el) return
  el.classList.toggle('expanded', state.navExpanded && state.width >= 720)
  el.innerHTML = `
    ${tabs.map(t => `
      <button class="nav-item ${state.activeTab === t.id ? 'active' : ''}"
              data-tab="${t.id}"
              title="${t.label} (${t.hotkey})">
        ${iconHTML(t.icon, 16)}
        <span class="nav-label">${t.label}</span>
        <span class="nav-key">${t.hotkey}</span>
      </button>
    `).join('')}
    <button class="toggle" data-action="toggle-nav" title="${state.navExpanded ? 'Recolher' : 'Expandir'}">
      ${iconHTML(state.navExpanded ? 'panel-left-close' : 'panel-left-open', 14)}
    </button>
  `
  el.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setState({ activeTab: btn.dataset.tab }))
  })
  el.querySelector('[data-action="toggle-nav"]')?.addEventListener('click', () => {
    setState({ navExpanded: !state.navExpanded })
  })
}

/* ─── Submenu (col 2, ≥520px) ─── */
function renderSubmenu() {
  const el = document.getElementById('submenu')
  if (!el) return
  if (state.width < 520) { el.style.display = 'none'; return }
  el.style.display = 'flex'
  const tab = getTab(state.activeTab)
  const activeSub = state.submenuByTab[state.activeTab]
  el.innerHTML = `
    <div class="submenu-head">
      <span class="label">${tab.label}</span>
    </div>
    <div class="submenu-list">
      ${tab.submenu.map(item => `
        <button class="submenu-item ${activeSub === item.id ? 'active' : ''}" data-sub="${item.id}">
          <span class="label">${item.label}</span>
          ${item.badge ? `<span class="badge">${item.badge}</span>` : ''}
          ${typeof item.count === 'number' ? `<span class="count">${item.count}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `
  el.querySelectorAll('[data-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.submenuByTab[state.activeTab] = btn.dataset.sub
      render()
    })
  })
}

/* ─── Main (col 3) ─── */
function renderMain() {
  const el = document.getElementById('main')
  if (!el) return
  const tab = getTab(state.activeTab)
  const subId = state.submenuByTab[state.activeTab]
  const sub = tab.submenu.find(s => s.id === subId)
  const compact = state.width < 520

  // header
  let headerHTML = `
    <div class="main-head">
      <div class="tab-icon">${iconHTML(tab.icon, 14)}</div>
      <div class="title-area">
        ${compact
          ? `<button class="sub-name" data-action="sub-picker">${sub?.label ?? '—'}${typeof sub?.count === 'number' ? ` <span class="sub-count">${sub.count}</span>` : ''} ${iconHTML('chevron-down', 12)}</button>`
          : `<span class="tab-label">${tab.label}</span>
             <span class="sub-name">${sub?.label ?? '—'}</span>
             ${typeof sub?.count === 'number' ? `<span class="sub-count">${sub.count} ${sub.count === 1 ? 'item' : 'itens'}</span>` : ''}`
        }
      </div>
      <div class="actions">
        <button class="btn btn-ghost" title="Filtros">${iconHTML('layers', 12)} ${compact ? '' : 'Filtros'}</button>
        ${renderPrimaryAction(tab.id, compact)}
      </div>
    </div>
  `

  // body via render() da tab
  const tabModule = tab.module
  let bodyHTML = `<div class="main-body" id="mainBody"></div>`

  el.innerHTML = `<div class="focus-banner">
      <span>Modo Foco</span>
      <button data-action="exit-focus">${iconHTML('minimize', 12)} Sair</button>
    </div>` + headerHTML + bodyHTML

  // render do conteúdo da tab
  const body = document.getElementById('mainBody')
  if (body && tabModule?.render) {
    tabModule.render(body, { state, sub })
  } else if (body) {
    body.innerHTML = renderEmptyTab(tab, sub)
  }

  // bind exit-focus
  el.querySelector('[data-action="exit-focus"]')?.addEventListener('click', () => {
    setState({ focusMode: false })
  })
}

function renderPrimaryAction(tabId, compact) {
  const a = primaryActionByTab[tabId]
  if (!a) return ''
  const cls = a.tone === 'primary' ? 'btn-primary' : 'btn-dark'
  return `<button class="btn ${cls}" title="${a.label}">
    ${iconHTML(a.icon, 12)} ${compact ? '' : a.label}
  </button>`
}

function renderEmptyTab(tab, sub) {
  return `
    <div class="empty-tab">
      <div class="icon-wrap">${iconHTML(tab.icon, 22)}</div>
      <h2>${sub?.label ?? tab.label}</h2>
      <p>Conteúdo desta tab será implementado na Fase 2 (Engenharia de modelagem). Por agora, a estrutura do plugin está pronta com 10 tabs, Composição contextual, ⌘K e atalhos.</p>
    </div>
  `
}

/* ─── Inspector (col 4, ≥720px) ─── */
function renderInspector() {
  const el = document.getElementById('inspector')
  if (!el) return
  if (state.width < 720 || !state.showInspector) { el.style.display = 'none'; return }
  el.style.display = 'flex'
  const sel = state.selection || { count: 0, items: [] }
  const item = (sel.count === 1) ? (sel.items?.[0] || null) : null

  // Dispara fetch de detalhes (lazy) quando há seleção single
  if (item && item.entity_id) ensureSelectionDetailsLoaded(item)

  const headTitle =
    sel.count === 0 ? 'Resumo do ambiente' :
    sel.count === 1 ? inspectorTitleForItem(item) :
    `${sel.count} selecionados`

  let body
  if (sel.count === 0)        body = renderInspectorEmpty()
  else if (sel.count > 1)     body = renderInspectorMulti(sel)
  else {
    switch (item?.type) {
      case 'modulo':    body = renderInspectorModule(item);    break
      case 'peca':      body = renderInspectorPiece(item);     break
      case 'ferragem':  body = renderInspectorHardware(item);  break
      case 'agregado':  body = renderInspectorAggregate(item); break
      default:          body = renderInspectorUnknown(item);   break
    }
  }

  el.innerHTML = `
    <div class="inspector-head">
      <span class="label">${headTitle}</span>
      <button class="icon-btn" data-action="hide-inspector" title="Recolher">${iconHTML('panel-right-close', 12)}</button>
    </div>
    <div class="inspector-body">${body}</div>
  `
  el.querySelector('[data-action="hide-inspector"]')?.addEventListener('click', () => {
    setState({ showInspector: false })
  })
  el.querySelectorAll('[data-action="open-composicao"]').forEach(btn => {
    btn.addEventListener('click', () => setState({ composicaoOpen: true }))
  })
  el.querySelectorAll('[data-go-tab]').forEach(btn => {
    btn.addEventListener('click', () => setState({ activeTab: btn.dataset.goTab }))
  })
  el.querySelectorAll('[data-toggle-insp-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleInspSection
      const next = { ...(state.inspSectionsCollapsed || {}), [id]: !(state.inspSectionsCollapsed?.[id]) }
      setState({ inspSectionsCollapsed: next })
    })
  })
}

function inspectorTitleForItem(item) {
  if (!item) return 'Propriedades'
  const map = { modulo: 'Módulo', peca: 'Peça', ferragem: 'Ferragem', agregado: 'Agregado', unknown: 'Item' }
  return map[item.type] || 'Propriedades'
}

/* ── Helpers de seções colapsáveis no Inspector v2 ── */
function inspSection(id, title, contentHTML, opts = {}) {
  const collapsed = !!(state.inspSectionsCollapsed?.[id])
  const hint = opts.hint ? `<span class="insp-section-hint">${opts.hint}</span>` : ''
  return `
    <div class="insp-section">
      <button class="insp-section-toggle" data-toggle-insp-section="${id}"
        style="display:flex;align-items:center;gap:6px;width:100%;background:none;border:0;padding:0;cursor:pointer;text-align:left;">
        ${iconHTML(collapsed ? 'chevron-right' : 'chevron-down', 10)}
        <span class="insp-section-title" style="margin:0;">${title}</span>
        ${hint}
      </button>
      <div class="insp-section-body" style="${collapsed ? 'display:none;' : 'display:block;margin-top:6px;'}">
        ${contentHTML}
      </div>
    </div>
  `
}

function inspLoadingBlock(label = 'Carregando…') {
  return `<div style="padding:12px;text-align:center;color:var(--text-mute);font-size:11px;">${label}</div>`
}

function inspKVRow(key, val) {
  return `<div class="insp-row">
    <span style="font-size:10px;color:var(--text-mute);min-width:90px;">${key}</span>
    <span style="font-size:12px;color:var(--text);font-weight:500;font-variant-numeric:tabular-nums;">${val ?? '—'}</span>
  </div>`
}

function renderInspectorEmpty() {
  const amb = getCurrentAmbiente()
  return `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg-soft);padding:10px;">
        <p style="font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text-faint);">Ambiente atual</p>
        <p style="font-size:14px;font-weight:600;color:var(--text);margin-top:2px;">${amb.label}</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg);padding:10px;">
          <p style="font-size:9px;font-weight:600;text-transform:uppercase;color:var(--text-faint);">Peças</p>
          <p style="font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text);">${amb.pieces}</p>
        </div>
        <div style="border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg);padding:10px;">
          <p style="font-size:9px;font-weight:600;text-transform:uppercase;color:var(--text-faint);">Custo est.</p>
          <p style="font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text);">${formatCurrency(amb.valor)}</p>
        </div>
      </div>
      <div style="border:1px dashed var(--border-2);border-radius:var(--r-md);background:var(--bg-soft);padding:14px;text-align:center;">
        ${iconHTML('mouse-pointer', 18)}
        <p style="font-size:11px;font-weight:600;color:var(--text-2);margin-top:8px;">Selecione um módulo no SketchUp</p>
        <p style="font-size:10px;line-height:1.5;color:var(--text-mute);margin-top:2px;">O painel mostra propriedades, internos, ferragens e custo do que está selecionado.</p>
      </div>
    </div>
  `
}

/* ── Module Inspector (selecionou um módulo Ornato) ── */
function renderInspectorModule(item) {
  const cache = state.detailsCache?.[item.entity_id]
  const data = cache?.data
  const bbox = item.bbox || {}
  const dims = data?.params || bbox
  const L = dims.largura ?? bbox.w ?? '—'
  const A = dims.altura ?? bbox.h ?? '—'
  const P = dims.profundidade ?? bbox.d ?? '—'

  // Seção: parâmetros
  const paramsHTML = data?.params
    ? Object.entries(data.params)
        .filter(([k]) => !['largura','altura','profundidade'].includes(k))
        .slice(0, 12)
        .map(([k, v]) => inspKVRow(k, typeof v === 'object' ? JSON.stringify(v) : String(v)))
        .join('') || `<p style="font-size:11px;color:var(--text-mute);">Sem parâmetros expostos.</p>`
    : inspLoadingBlock()

  // Seção: ferragens (counts)
  const counts = data?.ferragens_counts || {}
  const ferragensHTML = data
    ? (Object.keys(counts).length === 0
        ? `<p style="font-size:11px;color:var(--text-mute);">Sem ferragens automáticas neste módulo.</p>`
        : Object.entries(counts).map(([tipo, qtd]) => `
          <div class="insp-row">
            ${iconHTML('ferragens', 12)}
            <span style="flex:1;">${qtd}× ${tipo}</span>
          </div>`).join('') +
          `<button class="btn btn-ghost" data-go-tab="ferragens" style="margin-top:6px;width:100%;">
            ${iconHTML('chevron-right', 12)} Ver tab Ferragens
          </button>`)
    : inspLoadingBlock()

  // Seção: agregados filhos
  const children = data?.children || []
  const aggChildren = children.filter(c => c.tipo === 'agregado')
  const agregadosHTML = data
    ? (aggChildren.length === 0
        ? `<p style="font-size:11px;color:var(--text-mute);">Nenhum agregado.</p>`
        : aggChildren.map(c => `
          <div class="insp-row" style="gap:6px;">
            ${iconHTML('layers', 12)}
            <span style="flex:1;">${c.aggregate_id || c.name || 'agregado'}</span>
            <span style="font-size:10px;color:var(--text-mute);">${c.bay_id || ''}</span>
          </div>`).join(''))
    : inspLoadingBlock()

  // Seção: shop profile
  const shopHTML = data
    ? (data.shop_profile
        ? `<div class="insp-row" style="gap:6px;">
            ${iconHTML('settings', 12)}
            <span style="flex:1;">Profile <strong>${data.shop_profile}</strong> ${data.shop_version ? `<span style="color:var(--text-mute);">v${data.shop_version}</span>` : ''}</span>
          </div>`
        : `<p style="font-size:11px;color:var(--text-mute);">Sem snapshot de Padrão Marcenaria gravado.</p>`)
    : inspLoadingBlock()

  return `
    <div class="insp-module">
      <div class="module-preview"></div>
      <p style="font-size:13px;font-weight:600;color:var(--text);margin-top:8px">${data?.name || item.name || 'Módulo'}</p>
      <p style="font-size:10px;font-variant-numeric:tabular-nums;color:var(--text-mute)">
        ${data?.module_type || '—'} · #${item.entity_id}
      </p>

      <div class="insp-section">
        <p class="insp-section-title">Dimensões</p>
        <div class="insp-dims">
          <div class="dim-cell"><span class="dim-key">L</span><span class="dim-val">${L}</span></div>
          <div class="dim-cell"><span class="dim-key">A</span><span class="dim-val">${A}</span></div>
          <div class="dim-cell"><span class="dim-key">P</span><span class="dim-val">${P}</span></div>
        </div>
      </div>

      ${inspSection('mod-params', 'Parâmetros', paramsHTML)}
      ${inspSection('mod-ferr', 'Ferragens', ferragensHTML, { hint: data ? `${data.ferragens_total || 0} itens` : '' })}
      ${inspSection('mod-agg', 'Agregados filhos', agregadosHTML, { hint: data ? `${aggChildren.length}` : '' })}
      ${inspSection('mod-shop', 'Padrão Marcenaria', shopHTML)}

      <button class="btn btn-primary insp-cta" data-action="open-composicao">
        ${iconHTML('layers', 14)} Abrir Composição ${iconHTML('chevron-right', 12)}
      </button>
      <div class="insp-secondary">
        <button class="btn btn-ghost" title="Reaplicar config (read-only no MVP)">${iconHTML('refresh', 12)} Rebuild</button>
        <button class="btn btn-ghost" title="Repintar">${iconHTML('paintbrush', 12)} Repaint</button>
      </div>
    </div>
  `
}

/* ── Piece Inspector (selecionou uma peça interna) ── */
function renderInspectorPiece(item) {
  const cache = state.detailsCache?.[item.entity_id]
  const data = cache?.data
  if (!data) return `<div class="insp-module">${inspLoadingBlock('Carregando peça…')}</div>`

  const dims = data.dims || {}
  const L = dims.largura || dims.w || item.bbox?.w || '—'
  const A = dims.altura || dims.h || item.bbox?.h || '—'
  const E = dims.espessura || dims.t || '—'

  const idHTML = `
    <div class="insp-list">
      ${inspKVRow('Role',       data.role || '—')}
      ${inspKVRow('Espessura',  `${E} mm`)}
      ${inspKVRow('Material',   data.material || 'sem material')}
    </div>
  `
  const bordas = data.bordas || {}
  const bordasHTML = (typeof bordas === 'object' && Object.keys(bordas).length)
    ? Object.entries(bordas).map(([face, fita]) =>
        `<div class="insp-row"><span style="font-size:10px;color:var(--text-mute);min-width:60px;">${face}</span><span style="font-size:11px;">${fita || '—'}</span></div>`
      ).join('')
    : `<p style="font-size:11px;color:var(--text-mute);">Sem bordas configuradas.</p>`

  const origin = data.origin || []
  const posHTML = `<div class="insp-list">
    ${inspKVRow('X', origin[0] != null ? `${origin[0]} mm` : '—')}
    ${inspKVRow('Y', origin[1] != null ? `${origin[1]} mm` : '—')}
    ${inspKVRow('Z', origin[2] != null ? `${origin[2]} mm` : '—')}
  </div>`

  const ops = data.extra_ops || []
  const usinHTML = ops.length === 0
    ? `<p style="font-size:11px;color:var(--text-mute);">Sem usinagens extra registradas nesta peça.</p>`
    : ops.map((op, i) => `
        <div class="insp-row">
          ${iconHTML('usinagens', 12)}
          <span style="flex:1;">${op.tipo || op.label || 'op'}</span>
          <span style="font-size:10px;color:var(--text-mute);">${op.diametro ? `Ø${op.diametro}` : ''}</span>
        </div>`).join('')

  return `
    <div class="insp-module">
      <p style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;">${data.role || 'peça'}</p>
      <p style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px;">${data.name || item.name || 'Peça'}</p>
      <p style="font-size:10px;font-variant-numeric:tabular-nums;color:var(--text-mute);">${L}×${A}×${E} mm · #${item.entity_id}</p>

      ${inspSection('peca-id',     'Identidade',  idHTML)}
      ${inspSection('peca-bordas', 'Bordas',      bordasHTML)}
      ${inspSection('peca-pos',    'Posição',     posHTML)}
      ${inspSection('peca-usin',   'Usinagens',   usinHTML, { hint: `${ops.length}` })}

      <div class="insp-secondary">
        <button class="btn btn-ghost" disabled title="Edit em sprint Reflow">${iconHTML('paintbrush', 12)} Material</button>
        <button class="btn btn-ghost" disabled title="Edit em sprint Reflow">${iconHTML('pencil', 12)} Bordas</button>
      </div>
    </div>
  `
}

/* ── Hardware Inspector (selecionou ferragem 3D dentro do módulo) ── */
function renderInspectorHardware(item) {
  const cache = state.detailsCache?.[item.entity_id]
  const data = cache?.data || {}
  const attrs = item.attrs || {}

  const headHTML = `
    <p style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;">Ferragem</p>
    <p style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px;">${attrs.regra || data.regra || item.name || 'ferragem'}</p>
    <p style="font-size:10px;color:var(--text-mute);">${attrs.componente_3d || data.componente_3d || ''} · #${item.entity_id}</p>
  `

  const anchorHTML = `<div class="insp-list">
    ${inspKVRow('Âncora', attrs.anchor_role || data.anchor_role || '—')}
    ${inspKVRow('Preserve drillings', attrs.preserve_drillings ? 'sim' : 'não')}
  </div>`

  const opsHTML = (data.extra_ops && data.extra_ops.length)
    ? data.extra_ops.map(op => `
        <div class="insp-row">
          ${iconHTML('usinagens', 12)}
          <span style="flex:1;">${op.tipo || op.label || 'op'}</span>
          <span style="font-size:10px;color:var(--text-mute);">${op.diametro ? `Ø${op.diametro}` : ''} ${op.profundidade ? `· ${op.profundidade}mm` : ''}</span>
        </div>`).join('')
    : `<p style="font-size:11px;color:var(--text-mute);">Furação gerada automaticamente pela regra <strong>${attrs.regra || '—'}</strong>. Detalhes na tab Usinagens.</p>`

  return `
    <div class="insp-module">
      ${headHTML}
      ${inspSection('ferr-anchor', 'Âncora', anchorHTML)}
      ${inspSection('ferr-ops',    'Furação gerada', opsHTML)}
      <div class="insp-secondary">
        <button class="btn btn-ghost" data-go-tab="ferragens">${iconHTML('chevron-right', 12)} Ver tab Ferragens</button>
        <button class="btn btn-ghost" disabled title="Trocar variante em sprint Reflow">${iconHTML('layers', 12)} Trocar</button>
      </div>
    </div>
  `
}

/* ── Aggregate Inspector (selecionou agregado dentro de uma bay) ── */
function renderInspectorAggregate(item) {
  const cache = state.detailsCache?.[item.entity_id]
  const data = cache?.data
  if (!data) return `<div class="insp-module">${inspLoadingBlock('Carregando agregado…')}</div>`

  const bayHTML = `<div class="insp-list">
    ${inspKVRow('Bay ID', data.bay_id || '—')}
    ${inspKVRow('Largura', data.bay_dims?.w ? `${data.bay_dims.w} mm` : '—')}
    ${inspKVRow('Altura',  data.bay_dims?.h ? `${data.bay_dims.h} mm` : '—')}
    ${inspKVRow('Profund.',data.bay_dims?.d ? `${data.bay_dims.d} mm` : '—')}
  </div>`

  const params = data.params || {}
  const paramsHTML = Object.keys(params).length === 0
    ? `<p style="font-size:11px;color:var(--text-mute);">Sem parâmetros editáveis.</p>`
    : Object.entries(params).map(([k, v]) =>
        inspKVRow(k, typeof v === 'object' ? JSON.stringify(v) : String(v))).join('')

  return `
    <div class="insp-module">
      <p style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;">Agregado</p>
      <p style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px;">${data.aggregate_id || data.name || 'agregado'}</p>
      <p style="font-size:10px;color:var(--text-mute);">#${item.entity_id}</p>

      ${inspSection('agg-bay',    'Bay info',  bayHTML)}
      ${inspSection('agg-params', 'Parâmetros do agregado', paramsHTML)}

      <div class="insp-secondary">
        <button class="btn btn-ghost" disabled title="Mover/Remover em sprint Reflow">${iconHTML('layers', 12)} Mover</button>
        <button class="btn btn-ghost" disabled title="Remover em sprint Reflow">${iconHTML('chevron-right', 12)} Remover</button>
      </div>
    </div>
  `
}

/* ── Unknown / não-Ornato ── */
function renderInspectorUnknown(item) {
  return `
    <div class="insp-module">
      <p style="font-size:11px;font-weight:600;color:var(--text-mute);text-transform:uppercase;letter-spacing:.06em;">Sem metadados Ornato</p>
      <p style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px;">${item?.name || 'Entidade'}</p>
      <p style="font-size:10px;color:var(--text-mute);">#${item?.entity_id || '—'}</p>
      <p style="font-size:11px;color:var(--text-2);margin-top:10px;">
        Esta entidade não pertence a um módulo Ornato. Selecione um módulo, peça,
        ferragem ou agregado dentro de um módulo gerado pelo plugin.
      </p>
    </div>
  `
}

/* ── Multi-selection Inspector ── */
function renderInspectorMulti(sel) {
  const counts = sel.type_counts || {}
  const summary = Object.entries(counts)
    .map(([t, n]) => `${n} ${pluralLabel(t, n)}`)
    .join(', ') || `${sel.count} itens`

  return `
    <div class="insp-multi">
      <div class="multi-banner">
        <p class="multi-count">${sel.count}</p>
        <p class="multi-label">itens selecionados</p>
      </div>
      <p style="font-size:11px;color:var(--text-2);text-align:center;margin-top:-6px;">${summary}</p>

      <button class="btn btn-primary insp-cta" data-action="open-composicao">
        ${iconHTML('layers', 14)} Composição em lote ${iconHTML('chevron-right', 12)}
      </button>

      <p class="insp-section-title" style="margin-top:8px">Ações em lote</p>
      <div class="insp-list">
        ${[
          { label: 'Aplicar acabamento', icon: 'paintbrush' },
          { label: 'Trocar ferragem',     icon: 'ferragens'  },
          { label: 'Atribuir material',   icon: 'acabamentos'},
          { label: 'Repaint',             icon: 'paintbrush' },
          { label: 'Selecionar similares',icon: 'mouse-pointer' },
        ].map(a => `
          <button class="insp-action-row" disabled title="Edição em batch chega no sprint Reflow">
            ${iconHTML(a.icon, 14)}<span>${a.label}</span>${iconHTML('chevron-right', 12)}
          </button>
        `).join('')}
      </div>
    </div>
  `
}

function pluralLabel(type, n) {
  const map = {
    modulo: ['módulo', 'módulos'],
    peca:   ['peça', 'peças'],
    ferragem: ['ferragem', 'ferragens'],
    agregado: ['agregado', 'agregados'],
    unknown:  ['item', 'itens'],
  }
  const [s, p] = map[type] || [type, type + 's']
  return n === 1 ? s : p
}

/* ─── Status bar ─── */
function renderStatusBar() {
  const el = document.getElementById('statusbar')
  if (!el) return
  const compact = state.width < 520
  const amb = getCurrentAmbiente()
  const sel = state.selection
  const errors = conflictsMock.filter(c => c.severity === 'error').length
  const warns = conflictsMock.filter(c => c.severity === 'warn').length
  const total = errors + warns

  el.innerHTML = `
    <button class="selection-chip" data-has-selection="${sel.count > 0}" title="${sel.count > 0 ? `Selecionado: ${sel.label}` : 'Nada selecionado no SketchUp'}">
      ${iconHTML('mouse-pointer', 12)}
      ${sel.count > 0
        ? `<span style="font-weight:600">${sel.count}</span>${compact ? '' : `<span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;font-weight:normal;">${sel.label}</span>`}`
        : (compact ? '' : '<span>nada selecionado</span>')}
    </button>
    <span class="sep"></span>
    <span class="stat"><span class="stat-value">${amb.pieces}</span><span class="stat-label">peças</span></span>
    ${compact ? '' : `<span class="sep"></span><span class="stat"><span class="stat-value">${amb.area?.toFixed?.(1) ?? '8.3'}</span><span class="stat-label">m²</span></span>`}
    <span class="sep"></span>
    <button class="budget-chip" data-action="open-budget" title="Abrir orçamento (em Produção)">
      <span class="stat-label">orç.</span>
      <span class="stat-value bold">${formatCurrency(amb.valor)}</span>
      ${iconHTML('chevron-right', 12)}
    </button>
    ${compact ? '' : `
      <span class="sep"></span>
      <button class="conflicts-chip" data-has-conflicts="${total > 0}" data-action="toggle-conflicts">
        ${iconHTML('alert-triangle', 12)}
        ${total > 0 ? `<span><span style="font-weight:600">${total}</span> ${total === 1 ? 'conflito' : 'conflitos'}</span>` : '<span>sem conflitos</span>'}
      </button>
    `}
    <div class="right">
      ${compact ? '' : `<span class="version">v0.4.0 · Ornato · SketchUp Plugin</span>`}
    </div>
  `
  el.querySelector('[data-action="open-budget"]')?.addEventListener('click', () => {
    state.activeTab = 'producao'
    state.submenuByTab.producao = 'orcamento'
    render()
  })
  el.querySelector('[data-action="toggle-conflicts"]')?.addEventListener('click', () => {
    setState({ conflictsOpen: !state.conflictsOpen })
    // futuro: abrir overlay-anchor com a lista
  })
}

/* ═══════════════════════════════════════════════════════════
 *  OVERLAYS — Command Palette, Configurações, Composição, Conflitos
 * ═══════════════════════════════════════════════════════════ */

function renderOverlays() {
  renderCommandPalette()
  renderConfigDrawer()
  renderComposicaoDrawer()
  renderConflictsAnchor()
}

/* ─── ⌘K Command Palette ─── */
function renderCommandPalette() {
  const el = document.getElementById('overlayCommandPalette')
  if (!el) return
  if (!state.paletteOpen) { el.hidden = true; el.innerHTML = ''; return }
  el.hidden = false
  el.className = 'overlay palette'
  const commands = buildPaletteCommands()
  el.innerHTML = `
    <div class="overlay-backdrop" data-close></div>
    <div class="palette-panel">
      <div class="palette-input">
        ${iconHTML('search', 14)}
        <input id="paletteInput" autofocus placeholder="Buscar tab, módulo, ação ou comando…" />
        <kbd>esc</kbd>
      </div>
      <div class="palette-list" id="paletteList">
        ${commands.map((c, i) => paletteItemHTML(c, i)).join('')}
      </div>
      <div class="palette-foot">
        <span><kbd>↑↓</kbd> navegar</span>
        <span><kbd>↵</kbd> selecionar</span>
        <span><kbd>esc</kbd> fechar</span>
      </div>
    </div>
  `
  el.querySelector('[data-close]')?.addEventListener('click', () => setState({ paletteOpen: false }))
  bindPalette()
}

function buildPaletteCommands() {
  const cmds = []
  // Tabs
  tabs.forEach(t => cmds.push({
    type: 'tab', id: t.id, label: `Ir para ${t.label}`, hint: `Tab · atalho ${t.hotkey}`, icon: t.icon,
    run: () => setState({ activeTab: t.id, paletteOpen: false }),
  }))
  // Ações globais
  cmds.push({ type: 'action', id: 'config', label: 'Abrir Configurações Globais', hint: '⌘,', icon: 'settings',
    run: () => setState({ configOpen: true, paletteOpen: false }) })
  cmds.push({ type: 'action', id: 'focus', label: state.focusMode ? 'Sair do Modo Foco' : 'Entrar no Modo Foco', hint: 'F', icon: 'minimize',
    run: () => setState({ focusMode: !state.focusMode, paletteOpen: false }) })
  cmds.push({ type: 'action', id: 'theme', label: state.theme === 'light' ? 'Mudar para Modo Escuro' : 'Mudar para Modo Claro', hint: 'T', icon: 'lightbulb',
    run: () => {
      const next = state.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('ornato.theme', next)
      setState({ theme: next, paletteOpen: false })
    },
  })
  cmds.push({ type: 'action', id: 'toggle-sel', label: state.selection.count === 0 ? 'Simular: 1 módulo selecionado' : 'Simular: nada selecionado',
    hint: 'mock SketchUp bridge', icon: 'mouse-pointer',
    run: () => {
      // Mock cycler: 0 → 1 módulo → 1 peça → 1 ferragem → 5 mistos → 0
      const cycle = [
        { count: 0, items: [], multi: false, label: null },
        { count: 1, multi: false,
          items: [{ entity_id: 'mock_m1', type: 'modulo', name: 'Módulo inferior 2 portas',
                    bbox: { w: 800, h: 720, d: 560 }, attrs: {} }],
          type_counts: { modulo: 1 }, label: 'Módulo inferior 2 portas' },
        { count: 1, multi: false,
          items: [{ entity_id: 'mock_p1', type: 'peca', name: 'Lateral esquerda',
                    bbox: { w: 18, h: 720, d: 560 }, attrs: { role: 'lateral_esq' } }],
          type_counts: { peca: 1 }, label: 'Lateral esquerda' },
        { count: 1, multi: false,
          items: [{ entity_id: 'mock_h1', type: 'ferragem', name: 'Clip Top Blumotion',
                    bbox: { w: 35, h: 35, d: 35 },
                    attrs: { regra: 'dobradica', componente_3d: 'blum_clip_top.skp', anchor_role: 'lateral' } }],
          type_counts: { ferragem: 1 }, label: 'Clip Top Blumotion' },
        { count: 5, multi: true,
          items: [
            { entity_id: 'mock_p2', type: 'peca',     name: 'Porta esq', bbox: {} },
            { entity_id: 'mock_p3', type: 'peca',     name: 'Porta dir', bbox: {} },
            { entity_id: 'mock_p4', type: 'peca',     name: 'Lateral',   bbox: {} },
            { entity_id: 'mock_m2', type: 'modulo',   name: 'Módulo',    bbox: {} },
            { entity_id: 'mock_h2', type: 'ferragem', name: 'Dobradiça', bbox: {} },
          ],
          type_counts: { peca: 3, modulo: 1, ferragem: 1 }, label: '5 itens' },
      ]
      const cur = state.selection?.count || 0
      const idx = cycle.findIndex(c => c.count === cur && (c.items[0]?.type === state.selection?.items?.[0]?.type))
      const sel = cycle[(idx + 1) % cycle.length]
      setState({ selection: sel, paletteOpen: false })
    }})
  return cmds
}

function paletteItemHTML(c, i) {
  return `<button class="palette-item ${i === 0 ? 'focused' : ''}" data-cmd="${c.id}">
    <span class="palette-icon">${iconHTML(c.icon, 14)}</span>
    <span class="palette-text">
      <span class="palette-label">${c.label}</span>
      <span class="palette-hint">${c.hint}</span>
    </span>
    <span class="palette-type">${c.type}</span>
  </button>`
}

function bindPalette() {
  const list = document.getElementById('paletteList')
  const input = document.getElementById('paletteInput')
  if (!list || !input) return
  let cmds = buildPaletteCommands()
  let focused = 0

  function refresh(filter = '') {
    const f = filter.toLowerCase().trim()
    cmds = buildPaletteCommands().filter(c => !f || c.label.toLowerCase().includes(f) || c.hint.toLowerCase().includes(f))
    if (cmds.length === 0) {
      list.innerHTML = `<div class="palette-empty">Nenhum resultado para "${filter}"</div>`
      return
    }
    focused = 0
    list.innerHTML = cmds.map((c, i) => paletteItemHTML(c, i)).join('')
    list.querySelectorAll('[data-cmd]').forEach((btn, i) => {
      btn.addEventListener('mouseenter', () => {
        list.querySelectorAll('.palette-item').forEach(b => b.classList.remove('focused'))
        btn.classList.add('focused')
        focused = i
      })
      btn.addEventListener('click', () => cmds[i].run())
    })
  }

  input.addEventListener('input', e => refresh(e.target.value))
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); focused = Math.min(focused + 1, cmds.length - 1); paintFocus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focused = Math.max(focused - 1, 0); paintFocus() }
    else if (e.key === 'Enter') { e.preventDefault(); cmds[focused]?.run() }
  })

  function paintFocus() {
    const items = list.querySelectorAll('.palette-item')
    items.forEach((b, i) => b.classList.toggle('focused', i === focused))
    items[focused]?.scrollIntoView({ block: 'nearest' })
  }

  refresh('')
}

/* ─── Config Drawer (Sprint SHOP-5) ─────────────────────────
 * Drawer rico que exibe profile sincronizado do ERP (read-only por
 * default — fonte da verdade é o ERP) com possibilidade de override
 * pontual local por chave (Sketchup.write_default 'shop_overrides').
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ Profile: <name> v<n> · sync há Xmin  [↻]    │
 *   │ <N overrides locais ativos>                  │
 *   ├──────────────────────────────────────────────┤
 *   │ ▼ Folgas e Bordas                            │
 *   │   folga_porta_lateral  2.0 mm        [✏]    │
 *   │   folga_porta_int      1.5 mm  OVRD  [↶]    │
 *   │ ▶ Fundos e Recuos                            │
 *   │ ▶ Rodapé e Espessuras                        │
 *   │ ▶ System 32                                  │
 *   │ ▶ Cavilha                                    │
 *   │ ▶ Hardware Padrão                            │
 *   │ ▶ Materiais                                  │
 *   ├──────────────────────────────────────────────┤
 *   │ [Atualizar módulo] [Limpar overrides] [×]   │
 *   └──────────────────────────────────────────────┘
 */
const SHOP_DRAWER_SECTIONS = [
  {
    id: 'folgas',
    label: 'Folgas e Bordas',
    icon: 'layers',
    fields: [
      { key: 'folga_porta_lateral',  label: 'Porta ↔ lateral externa', unit: 'mm', step: 0.1 },
      { key: 'folga_porta_int',      label: 'Entre portas (por lado)', unit: 'mm', step: 0.1 },
      { key: 'folga_entre_modulos',  label: 'Entre módulos (por lado)', unit: 'mm', step: 0.1 },
      { key: 'folga_porta_topo',     label: 'Porta ↔ topo',            unit: 'mm', step: 0.1 },
      { key: 'folga_porta_base',     label: 'Porta ↔ base',            unit: 'mm', step: 0.1 },
      { key: 'folga_correr_topo',    label: 'Correr ↔ topo',           unit: 'mm', step: 0.1 },
      { key: 'folga_correr_base',    label: 'Correr ↔ base',           unit: 'mm', step: 0.1 },
    ],
  },
  {
    id: 'fundos',
    label: 'Fundos e Recuos',
    icon: 'acabamentos',
    fields: [
      { key: 'rasgo_profundidade',   label: 'Profundidade rasgo fundo', unit: 'mm', step: 0.5 },
      { key: 'rasgo_recuo',          label: 'Recuo do rasgo (offset)',  unit: 'mm', step: 0.5 },
      { key: 'folga_prat_traseira',  label: 'Recuo prateleira ↔ fundo', unit: 'mm', step: 0.5 },
      { key: 'fundo_metodo',         label: 'Método do fundo',          type: 'text' },
    ],
  },
  {
    id: 'rodape',
    label: 'Rodapé e Espessuras',
    icon: 'usinagens',
    fields: [
      { key: 'espessura_carcaca',    label: 'Espessura da carcaça',     unit: 'mm', step: 1 },
      { key: 'espessura_fundo',      label: 'Espessura do fundo',       unit: 'mm', step: 1 },
      { key: 'espessura_frente',     label: 'Espessura da frente',      unit: 'mm', step: 1 },
    ],
  },
  {
    id: 'system32',
    label: 'System 32',
    icon: 'ferragens',
    fields: [
      { key: 'sys32_ativo',          label: 'System 32 ativo',          type: 'checkbox' },
      { key: 'sys32_dia',            label: 'Diâmetro do furo',         unit: 'mm', step: 0.5 },
      { key: 'sys32_spacing',        label: 'Espaçamento',              unit: 'mm', step: 1 },
      { key: 'sys32_front_offset',   label: 'Offset frente',            unit: 'mm', step: 1 },
      { key: 'sys32_top_margin',     label: 'Margem superior',          unit: 'mm', step: 1 },
    ],
  },
  {
    id: 'cavilha',
    label: 'Cavilha',
    icon: 'ferragens',
    fields: [
      { key: 'cavilha_dia',          label: 'Diâmetro',                 unit: 'mm', step: 0.5 },
      { key: 'cavilha_depth',        label: 'Profundidade (por peça)',  unit: 'mm', step: 0.5 },
      { key: 'cavilha_spacing',      label: 'Espaçamento',              unit: 'mm', step: 1 },
      { key: 'cavilha_min_edge',     label: 'Distância mín. da borda',  unit: 'mm', step: 1 },
    ],
  },
  {
    id: 'hardware',
    label: 'Hardware Padrão',
    icon: 'ferragens',
    fields: [
      { key: 'dobradica_edge_offset', label: 'Dobradiça · edge offset', unit: 'mm', step: 0.5 },
      { key: 'dobradica_cup_dia',    label: 'Dobradiça · diâmetro copa', unit: 'mm', step: 0.5 },
      { key: 'dobradica_cup_depth',  label: 'Dobradiça · prof. copa',   unit: 'mm', step: 0.1 },
      { key: 'minifix_spacing',      label: 'Minifix · spacing',        unit: 'mm', step: 1 },
      { key: 'puxador_espacamento',  label: 'Puxador · espaçamento',    unit: 'mm', step: 1 },
      { key: 'puxador_recuo',        label: 'Puxador · recuo',          unit: 'mm', step: 1 },
    ],
  },
  {
    id: 'materiais',
    label: 'Materiais',
    icon: 'acabamentos',
    fields: [
      { key: 'sobreposicao_reta',        label: 'Sobreposição reta',        unit: 'mm', step: 0.5 },
      { key: 'sobreposicao_curva',       label: 'Sobreposição curva',       unit: 'mm', step: 0.5 },
      { key: 'sobreposicao_sup_curva',   label: 'Sobreposição super curva', unit: 'mm', step: 0.5 },
    ],
  },
]

/** Espelha (subset) o que ShopConfig.to_expr_params produz no Ruby —
 * usado pelo modo preview (sem bridge) e como fallback de leitura. */
function deriveExprParams(cfg) {
  if (!cfg) return {}
  const f  = cfg.folgas || {}
  const pa = f.porta_abrir  || {}
  const pc = f.porta_correr || {}
  const pr = f.prateleira   || {}
  const dob = cfg.dobradica  || {}
  const sob = cfg.sobreposicao || {}
  const mf  = cfg.minifix    || {}
  const cv  = cfg.cavilha    || {}
  const s32 = cfg.system32   || {}
  const rf  = cfg.rasgo_fundo || {}
  const pu  = cfg.puxador    || {}
  return {
    espessura_carcaca: cfg.espessura_carcaca_padrao ?? 18,
    espessura_fundo:   cfg.espessura_fundo_padrao ?? 6,
    espessura_frente:  cfg.espessura_frente_padrao ?? 18,
    fundo_metodo:      cfg.fundo_metodo_padrao ?? 'rasgo',
    folga_porta_lateral:  pa.lateral_ext   ?? 2.0,
    folga_porta_int:      pa.lateral_int   ?? 1.5,
    folga_entre_modulos:  pa.entre_modulos ?? 3.0,
    folga_porta_topo:     pa.topo          ?? 2.0,
    folga_porta_base:     pa.base          ?? 2.0,
    folga_correr_topo:    pc.topo          ?? 3.0,
    folga_correr_base:    pc.base          ?? 3.0,
    folga_prat_traseira:  pr.traseira      ?? 20.0,
    rasgo_profundidade:   rf.profundidade  ?? 6.0,
    rasgo_recuo:          rf.recuo         ?? 15.0,
    dobradica_edge_offset: dob.edge_offset ?? 22.0,
    dobradica_cup_dia:    dob.cup_dia      ?? 35.0,
    dobradica_cup_depth:  dob.cup_depth    ?? 13.5,
    sobreposicao_reta:        sob.reta        ?? 16.0,
    sobreposicao_curva:       sob.curva       ?? 8.0,
    sobreposicao_sup_curva:   sob.super_curva ?? 0.0,
    minifix_spacing:      mf.spacing       ?? 128.0,
    cavilha_dia:          cv.dia           ?? 8.0,
    cavilha_depth:        cv.depth         ?? 15.0,
    cavilha_spacing:      cv.spacing       ?? 96.0,
    cavilha_min_edge:     cv.min_edge      ?? 32.0,
    sys32_ativo:          s32.ativo        ?? false,
    sys32_dia:            s32.dia          ?? 5.0,
    sys32_spacing:        s32.spacing      ?? 32.0,
    sys32_front_offset:   s32.front_offset ?? 37.0,
    sys32_top_margin:     s32.top_margin   ?? 37.0,
    puxador_espacamento:  pu.espacamento   ?? 128,
    puxador_recuo:        pu.recuo         ?? 37.0,
  }
}

/** "sync há Xmin" formatter */
function formatSyncAge(timestamp) {
  if (!timestamp) return 'nunca'
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - Number(timestamp)))
  if (sec < 60) return `há ${sec}s`
  if (sec < 3600) return `há ${Math.floor(sec / 60)}min`
  if (sec < 86400) return `há ${Math.floor(sec / 3600)}h`
  return `há ${Math.floor(sec / 86400)}d`
}

function renderConfigDrawer() {
  const el = document.getElementById('overlayConfig')
  if (!el) return
  if (!state.configOpen) { el.hidden = true; el.innerHTML = ''; return }
  el.hidden = false
  el.className = 'overlay drawer-right'

  // Hidrata config no Ruby ao abrir
  ensureShopConfigLoaded()

  const cfg       = state.shopConfig
  const loading   = state.shopConfigLoading
  const sync      = state.shopConfigSync || {}
  const overrides = state.shopOverrides || {}
  const editing   = state.shopOverrideEditing || {}
  const collapsed = state.shopDrawerCollapsed || {}
  const baseExpr  = deriveExprParams(cfg)
  const overrideCount = Object.keys(overrides).length
  const profileLabel  = sync.profile || (cfg ? 'Local' : '—')
  const versionLabel  = sync.version != null ? `v${sync.version}` : ''
  const ageLabel      = `sync ${formatSyncAge(sync.last_sync_at)}`
  const sections = SHOP_DRAWER_SECTIONS

  el.innerHTML = `
    <div class="overlay-backdrop" data-close></div>
    <div class="panel" style="display:flex;flex-direction:column;height:100%;">
      <header class="drawer-head" style="flex-direction:column;align-items:stretch;gap:6px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="drawer-icon">${iconHTML('settings', 16)}</span>
          <div style="flex:1;min-width:0;">
            <p class="drawer-title" style="display:flex;align-items:center;gap:6px;">
              ${profileLabel}
              ${versionLabel ? `<span style="font-size:10px;font-weight:600;color:var(--text-mute);background:var(--bg-2);padding:1px 6px;border-radius:8px;">${versionLabel}</span>` : ''}
            </p>
            <p class="drawer-sub" style="display:flex;align-items:center;gap:6px;">
              <span>${ageLabel}</span>
              ${overrideCount > 0 ? `<span style="color:#d97706;font-weight:700;">· ${overrideCount} override${overrideCount > 1 ? 's' : ''} local${overrideCount > 1 ? 'is' : ''}</span>` : ''}
            </p>
          </div>
          <button class="icon-btn" data-action="cfg-sync" title="Sincronizar agora" ${state.shopConfigSyncing ? 'disabled' : ''}>
            ${iconHTML(state.shopConfigSyncing ? 'spinner' : 'send', 14)}
          </button>
          <button class="icon-btn" data-close title="Fechar">${iconHTML('chevron-right', 14)}</button>
        </div>
      </header>

      <div class="drawer-body" style="flex:1;overflow-y:auto;">
        ${loading || !cfg
          ? `<div style="padding:24px;text-align:center;color:var(--text-mute);font-size:12px;">Carregando configuração…</div>`
          : sections.map(sec => renderShopSection(sec, baseExpr, overrides, editing, collapsed)).join('')
        }
      </div>

      <footer class="drawer-foot drawer-actions" style="display:flex;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid var(--border);flex-wrap:wrap;">
        <button class="btn btn-ghost" data-action="cfg-refresh-module" ${state.selection?.count ? '' : 'disabled'} title="${state.selection?.count ? 'Reaplica config atual ao módulo selecionado' : 'Selecione um módulo no SketchUp'}">
          ${iconHTML('refresh', 12)} Atualizar módulo
        </button>
        <button class="btn btn-ghost" data-action="cfg-clear-overrides" ${overrideCount ? '' : 'disabled'}>
          ${iconHTML('chevron-right', 12)} Limpar overrides${overrideCount ? ` (${overrideCount})` : ''}
        </button>
        <span style="margin-left:auto;">
          <button class="btn btn-primary" data-close>${iconHTML('check-circle', 12)} Fechar</button>
        </span>
      </footer>
    </div>
  `

  // ── Bindings ──
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => setState({ configOpen: false })))

  el.querySelector('[data-action="cfg-sync"]')?.addEventListener('click', () => {
    state.shopConfigSyncing = true
    const ok = callRuby('sync_shop_config')
    if (!ok) {
      // preview: simula resposta
      setTimeout(() => {
        window.onShopConfigSync({ ok: true, profile: 'Marcenaria João', version: 'preview', last_sync_at: Math.floor(Date.now()/1000), cached: true })
      }, 400)
    }
    render()
  })

  el.querySelector('[data-action="cfg-refresh-module"]')?.addEventListener('click', () => {
    const id = state.selection?.items?.[0]?.entity_id || state.selection?.entityId
    if (!id) { window.showToast('Selecione um módulo no SketchUp primeiro', 'error'); return }
    callRuby('refresh_module_shop_snapshot', String(id))
  })

  el.querySelector('[data-action="cfg-clear-overrides"]')?.addEventListener('click', () => {
    if (!confirm(`Remover ${overrideCount} override(s) local(is)?`)) return
    const ok = callRuby('clear_all_shop_overrides')
    if (!ok) {
      // preview
      setState({ shopOverrides: {} })
    }
  })

  // Toggle de colapsar seção
  el.querySelectorAll('[data-toggle-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleSection
      const next = { ...collapsed, [id]: !collapsed[id] }
      setState({ shopDrawerCollapsed: next })
    })
  })

  // Lápis → entra em modo edit
  el.querySelectorAll('[data-edit-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.editKey
      setState({ shopOverrideEditing: { ...editing, [k]: true } })
      // foca o input recém-renderizado
      requestAnimationFrame(() => {
        const inp = el.querySelector(`[data-override-input="${k}"]`)
        if (inp) { inp.focus(); inp.select?.() }
      })
    })
  })

  // ✓ salva override / X cancela / ↶ remove override existente
  el.querySelectorAll('[data-confirm-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.confirmKey
      const inp = el.querySelector(`[data-override-input="${k}"]`)
      if (!inp) return
      let value
      if (inp.type === 'checkbox')      value = inp.checked
      else if (inp.type === 'number')   value = inp.value === '' ? null : parseFloat(inp.value)
      else                              value = inp.value
      const ok = callRuby('set_shop_config_override', { key: k, value })
      if (!ok) {
        // preview
        setState({
          shopOverrides: { ...overrides, [k]: value },
          shopOverrideEditing: { ...editing, [k]: false },
        })
      } else {
        setState({ shopOverrideEditing: { ...editing, [k]: false } })
      }
    })
  })

  el.querySelectorAll('[data-cancel-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.cancelKey
      setState({ shopOverrideEditing: { ...editing, [k]: false } })
    })
  })

  el.querySelectorAll('[data-clear-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.clearKey
      const ok = callRuby('clear_shop_config_override', k)
      if (!ok) {
        const next = { ...overrides }; delete next[k]
        setState({ shopOverrides: next })
      }
    })
  })
}

/* Renderiza uma seção colapsável do drawer */
function renderShopSection(sec, baseExpr, overrides, editing, collapsed) {
  const isCollapsed = !!collapsed[sec.id]
  const overrideCountInSec = sec.fields.filter(f => overrides[f.key] !== undefined).length
  const body = isCollapsed ? '' : `
    <div class="cfg-section-body" style="padding:4px 16px 12px;">
      ${sec.fields.map(f => renderShopField(f, baseExpr, overrides, editing)).join('')}
    </div>
  `
  return `
    <div class="cfg-section" style="border-bottom:1px solid var(--border);">
      <button data-toggle-section="${sec.id}" style="width:100%;display:flex;align-items:center;gap:8px;padding:12px 16px;background:none;border:none;cursor:pointer;text-align:left;">
        <span style="display:inline-block;transition:transform .15s;${isCollapsed ? '' : 'transform:rotate(90deg);'}">
          ${iconHTML('chevron-right', 12)}
        </span>
        <span class="drawer-row-icon">${iconHTML(sec.icon, 14)}</span>
        <span style="font-size:12px;font-weight:700;color:var(--text);flex:1;">${sec.label}</span>
        ${overrideCountInSec ? `<span style="font-size:10px;font-weight:700;color:#d97706;background:rgba(217,119,6,.12);padding:2px 6px;border-radius:8px;">${overrideCountInSec} OVRD</span>` : ''}
      </button>
      ${body}
    </div>
  `
}

/* Renderiza um field individual (read-only, override ativo, ou em edição) */
function renderShopField(f, baseExpr, overrides, editing) {
  const baseValue   = baseExpr[f.key]
  const hasOverride = Object.prototype.hasOwnProperty.call(overrides, f.key)
  const overrideVal = overrides[f.key]
  const displayVal  = hasOverride ? overrideVal : baseValue
  const isEditing   = !!editing[f.key]
  const inputType   = f.type === 'checkbox' ? 'checkbox' : (f.type === 'text' ? 'text' : 'number')

  // Modo edição inline
  if (isEditing) {
    const initialValue = displayVal == null ? '' : displayVal
    const inputHTML = inputType === 'checkbox'
      ? `<input data-override-input="${f.key}" type="checkbox" ${initialValue ? 'checked' : ''} style="margin-left:auto;" />`
      : `<input data-override-input="${f.key}" type="${inputType}" ${f.step != null ? `step="${f.step}"` : ''} value="${initialValue}" style="width:90px;height:26px;padding:0 6px;border:1px solid var(--accent);border-radius:var(--r);background:var(--bg);font:inherit;font-size:12px;color:var(--text);margin-left:auto;" />`
    return `
      <div class="cfg-row" style="display:flex;align-items:center;gap:6px;padding:6px 0;font-size:12px;color:var(--text-2);">
        <span style="flex:1;min-width:0;">
          <span style="display:block;font-weight:600;color:var(--text);">${f.label}</span>
          <span style="display:block;font-size:10px;color:var(--text-faint);font-family:ui-monospace,monospace;">{shop.${f.key}}</span>
        </span>
        ${inputHTML}
        ${f.unit ? `<span style="font-size:10px;color:var(--text-faint);">${f.unit}</span>` : ''}
        <button class="icon-btn" data-confirm-key="${f.key}" title="Salvar override local" style="color:#16a34a;">${iconHTML('check-circle', 12)}</button>
        <button class="icon-btn" data-cancel-key="${f.key}" title="Cancelar">${iconHTML('x', 12)}</button>
      </div>
    `
  }

  // Modo display (read-only ou com override visível)
  const valueLabel = inputType === 'checkbox'
    ? (displayVal ? 'sim' : 'não')
    : (displayVal == null ? '—' : String(displayVal))
  const baseLabel = inputType === 'checkbox'
    ? (baseValue ? 'sim' : 'não')
    : (baseValue == null ? '—' : String(baseValue))

  return `
    <div class="cfg-row" style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;color:var(--text-2);">
      <span style="flex:1;min-width:0;">
        <span style="display:block;font-weight:600;color:var(--text);">${f.label}</span>
        <span style="display:block;font-size:10px;color:var(--text-faint);font-family:ui-monospace,monospace;">{shop.${f.key}}</span>
      </span>
      ${hasOverride
        ? `<span style="display:flex;align-items:center;gap:6px;">
             <span style="text-decoration:line-through;color:var(--text-faint);font-size:11px;">${baseLabel}${f.unit ? ' ' + f.unit : ''}</span>
             <span style="font-weight:700;color:#d97706;">${valueLabel}${f.unit ? ' ' + f.unit : ''}</span>
             <span style="font-size:9px;font-weight:800;color:#d97706;background:rgba(217,119,6,.15);padding:1px 5px;border-radius:6px;letter-spacing:.04em;">OVRD</span>
           </span>`
        : `<span style="font-weight:600;color:var(--text);">${valueLabel}${f.unit ? ' ' + f.unit : ''}</span>`
      }
      ${hasOverride
        ? `<button class="icon-btn" data-clear-key="${f.key}" title="Remover override (volta ao padrão do ERP)">${iconHTML('x', 12)}</button>`
        : `<button class="icon-btn" data-edit-key="${f.key}" title="Override local desta chave">${iconHTML('pencil', 12)}</button>`
      }
    </div>
  `
}

/* ─── Composição Drawer ─── */
function renderComposicaoDrawer() {
  const el = document.getElementById('overlayComposicao')
  if (!el) return
  if (!state.composicaoOpen) { el.hidden = true; el.innerHTML = ''; return }
  el.hidden = false
  el.className = 'overlay drawer-right'
  const isLote = state.selection.count > 1
  el.innerHTML = `
    <div class="overlay-backdrop" data-close></div>
    <div class="panel wide">
      <header class="drawer-head composicao-head">
        <span class="drawer-icon" style="background:var(--accent);color:white">${iconHTML('layers', 16)}</span>
        <div>
          <p class="drawer-title">
            Composição
            ${isLote ? `<span class="lote-tag">LOTE · ${state.selection.count}</span>` : ''}
          </p>
          <p class="drawer-sub">${isLote ? `${state.selection.count} módulos selecionados` : 'Módulo inferior 2 portas'}</p>
        </div>
        <button class="icon-btn" data-close>${iconHTML('chevron-right', 14)}</button>
      </header>
      <div class="drawer-body">
        ${isLote ? `
          <div class="banner-warn">
            <strong>Modo lote:</strong> alterações serão aplicadas aos ${state.selection.count} módulos selecionados.
            Componentes incompatíveis serão ignorados.
          </div>
        ` : `
          <div class="comp-preview">
            <div class="module-preview small"></div>
            <div>
              <p class="comp-title">800 × 720 × 560 mm</p>
              <p class="comp-meta">M-002 · Cozinha · base inferior</p>
              <p class="comp-tip">6 componentes editáveis</p>
            </div>
          </div>
        `}

        ${composicaoSection('Estrutura', '1', [
          { label: 'Caixa do módulo', value: 'MDF Branco TX 18mm', meta: 'Duratex · BR-TX', color: '#fafafa' },
        ])}
        ${composicaoSection('Frentes', '2', [
          { label: 'Porta esquerda', value: 'Branco TX', meta: 'MDF 18mm · liso', color: '#fafafa' },
          { label: 'Porta direita',  value: 'Branco TX', meta: 'MDF 18mm · liso', color: '#fafafa' },
        ], 'Trocar todas em massa')}
        ${composicaoSection('Ferragens', '2', [
          { label: '4× Dobradiças', value: 'Clip Top Blumotion', meta: 'Blum · soft-close 110°' },
          { label: '2× Puxadores',  value: 'Cava Black',         meta: 'Esquadrias · 128mm · alumínio' },
        ])}
        ${composicaoSection('Internos', '1', [
          { label: 'Prateleira interna', value: 'Fixa MDF 15mm', meta: 'Apoio em cavilha' },
        ], '+ Adicionar interno')}

        <div class="cost-card big">
          <p class="cost-label">Custo estimado</p>
          <p class="cost-value">R$ 312,40</p>
        </div>
      </div>
      <footer class="drawer-foot drawer-actions">
        <button class="btn btn-ghost" data-close>Cancelar</button>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-ghost">Salvar como variação</button>
          <button class="btn btn-primary">${iconHTML('check-circle', 12)} ${isLote ? `Aplicar nos ${state.selection.count}` : 'Aplicar mudanças'}</button>
        </div>
      </footer>
    </div>
  `
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => setState({ composicaoOpen: false })))
}

function composicaoSection(title, count, items, extraAction) {
  return `
    <div class="comp-section">
      <div class="comp-section-head">
        <span class="comp-section-title">${title} <span class="comp-section-count">· ${count}</span></span>
        ${extraAction ? `<button class="comp-section-action">${extraAction}</button>` : ''}
      </div>
      <div class="comp-section-body">
        ${items.map(i => `
          <div class="comp-item">
            <span class="comp-swatch" ${i.color ? `style="background:${i.color}"` : ''}>${i.color ? '' : iconHTML('ferragens', 12)}</span>
            <div class="comp-item-text">
              <p class="comp-item-label">${i.label}</p>
              <p class="comp-item-value">${i.value} <span class="comp-item-meta">· ${i.meta}</span></p>
            </div>
            <button class="btn btn-ghost btn-sm">trocar ${iconHTML('chevron-down', 11)}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

/* ─── Conflicts anchor (bottom-right popover) ─── */
function renderConflictsAnchor() {
  const el = document.getElementById('overlayConflicts')
  if (!el) return
  if (!state.conflictsOpen) { el.hidden = true; el.innerHTML = ''; return }
  el.hidden = false
  el.innerHTML = `
    <div class="panel">
      <header class="conflicts-head">
        ${iconHTML('alert-triangle', 14)}
        <span class="conflicts-title">Conflitos do projeto</span>
        <span class="conflicts-count">${conflictsMock.length}</span>
        <button class="icon-btn" data-close>${iconHTML('chevron-right', 12)}</button>
      </header>
      <ul class="conflicts-list">
        ${conflictsMock.map(c => `
          <li class="conflicts-item">
            <span class="conflicts-dot ${c.severity}"></span>
            <div class="conflicts-text">
              <p class="conflicts-name">${c.title}</p>
              <p class="conflicts-detail">${c.detail}</p>
            </div>
            <button class="btn btn-ghost btn-sm">ver</button>
          </li>
        `).join('')}
      </ul>
    </div>
  `
  el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => setState({ conflictsOpen: false })))
}

/* ═══════════════════════════════════════════════════════════
 *  KEYBOARD SHORTCUTS
 * ═══════════════════════════════════════════════════════════ */

function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return

    if (e.key === 'Escape') {
      if (state.paletteOpen) setState({ paletteOpen: false })
      if (state.configOpen) setState({ configOpen: false })
      if (state.composicaoOpen) setState({ composicaoOpen: false })
      if (state.conflictsOpen) setState({ conflictsOpen: false })
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      setState({ paletteOpen: true })
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      setState({ configOpen: true })
      return
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      const t = tabs.find(tt => tt.hotkey === e.key)
      if (t) { setState({ activeTab: t.id }); return }
      if (e.key.toLowerCase() === 'f') { setState({ focusMode: !state.focusMode }); return }
      if (e.key.toLowerCase() === 'e' && state.selection.count > 0) {
        setState({ composicaoOpen: true })
        return
      }
      if (e.key.toLowerCase() === 't') {
        // Toggle tema (atalho dev)
        const next = state.theme === 'light' ? 'dark' : 'light'
        localStorage.setItem('ornato.theme', next)
        setState({ theme: next })
        return
      }
    }
  })
}

/* ═══════════════════════════════════════════════════════════
 *  TOPBAR ACTIONS
 * ═══════════════════════════════════════════════════════════ */

function bindTopbar() {
  document.getElementById('btnConfig')?.addEventListener('click', () => setState({ configOpen: true }))
  document.getElementById('btnSearch')?.addEventListener('click', () => setState({ paletteOpen: true }))
  document.getElementById('btnFocus')?.addEventListener('click', () => setState({ focusMode: !state.focusMode }))
  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    // TODO: bridge com Ruby — sketchup.callRuby('refresh_selection')
    console.log('[Ornato] refresh selection (bridge Ruby pendente)')
  })
}

/* ═══════════════════════════════════════════════════════════
 *  RESIZE
 * ═══════════════════════════════════════════════════════════ */

function bindResize() {
  let timer = null
  window.addEventListener('resize', () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const w = window.innerWidth
      const next = { width: w }
      // Auto-defaults por breakpoint
      if (w >= 720) {
        if (!state.navExpanded) next.navExpanded = true
        if (!state.showInspector) next.showInspector = true
      } else {
        if (state.navExpanded) next.navExpanded = false
        if (state.showInspector) next.showInspector = false
      }
      setState(next)
    }, 60)
  })
}

/* ═══════════════════════════════════════════════════════════
 *  UTILS
 * ═══════════════════════════════════════════════════════════ */

export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

/* ═══════════════════════════════════════════════════════════
 *  BOOT
 * ═══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  bindTopbar()
  bindKeyboard()
  bindResize()
  render()
  // futuro: aguardar primeiro callback do Ruby para hidratar com dados reais
  console.log('[Ornato] panel v2 ready')
})
