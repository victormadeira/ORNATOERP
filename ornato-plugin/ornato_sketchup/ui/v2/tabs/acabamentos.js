/**
 * Tab Acabamentos — F1.4 real (Sprint UX-9)
 *
 * Browser de materiais/cores/frentes/bordas que aplica em peças/módulos
 * selecionados no SketchUp.
 *
 * Bridge:
 *   HTTP → /api/library/asset/chapas.json  (fallback: lista embedded)
 *   JS   → callRuby('edit_change_material', `${entity_id}|${code}`)
 *          callRuby('apply_swap', `${entity_id}|${variant_id}`)
 *          callRuby('edit_change_edges',   `${entity_id}|${JSON}`)
 *
 * UX em 3 sub-tabs:
 *   1) Materiais  — grid de chapas (49 SKUs) filtrável por espessura/tipo
 *   2) Frentes    — variantes de frente de gaveta (liso, fresado)
 *   3) Bordas     — toggle por face (frente/trás/topo/base) na peça selecionada
 *
 * Limitações MVP:
 *   - cores via fallback embedded (sem texture upload, sem swatch real)
 *   - sem preview 3D antes de aplicar (aplica direto via ComponentEditor)
 *   - bordas só para peças (não módulos)
 *   - frentes só funcionam em peças com role=drawer_front (validação no Ruby)
 */

import { callRuby, getState } from '../app.js'
import { iconHTML } from '../icons.js'

export const meta = { phase: 'F1.4-real', icon: 'acabamentos' }

/* ─── Estado local da tab ─── */
const acab = {
  materials: null,           // array completo das chapas
  loadingState: 'idle',      // 'idle' | 'loading' | 'ready' | 'error'
  error: null,
  activeSubTab: 'materials', // 'materials' | 'fronts' | 'edges'
  filter: 'all',             // 'all' | '6' | '12' | '15' | '18' | '25'
  pendingEdges: null,        // edits locais antes de aplicar
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

function rerender() {
  const root = document.getElementById('mainBody')
  if (root) renderInto(root)
}

function toast(msg, kind = 'info') {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(msg, kind)
  } else {
    console.log(`[Ornato/acab] ${kind}: ${msg}`)
  }
}

function authHeaders() {
  const h = { 'Accept': 'application/json' }
  try {
    const tok = (typeof localStorage !== 'undefined') && localStorage.getItem('erp_token')
    if (tok) h['Authorization'] = `Bearer ${tok}`
  } catch (_e) { /* ignora */ }
  return h
}

function apiBase() {
  if (typeof window !== 'undefined' && window.ORNATO_API_BASE) return window.ORNATO_API_BASE
  return ''
}

/* ─── Catálogo embedded de fallback ─── */
const EMBEDDED_MATERIALS = [
  { id: 'mdf_branco_tx_18', nome: 'MDF Branco TX 18mm', tipo: 'MDF', cor: 'Branco TX', espessura_nominal: 18, acabamento: 'texturizado', codigo_ornato: 'MDF18_BrancoTX' },
  { id: 'mdf_branco_tx_15', nome: 'MDF Branco TX 15mm', tipo: 'MDF', cor: 'Branco TX', espessura_nominal: 15, acabamento: 'texturizado', codigo_ornato: 'MDF15_BrancoTX' },
  { id: 'mdf_branco_tx_12', nome: 'MDF Branco TX 12mm', tipo: 'MDF', cor: 'Branco TX', espessura_nominal: 12, acabamento: 'texturizado', codigo_ornato: 'MDF12_BrancoTX' },
  { id: 'mdf_branco_tx_6',  nome: 'MDF Branco TX 6mm',  tipo: 'MDF', cor: 'Branco TX', espessura_nominal: 6,  acabamento: 'texturizado', codigo_ornato: 'MDF06_BrancoTX' },
  { id: 'mdf_cinza_18',     nome: 'MDF Cinza 18mm',     tipo: 'MDF', cor: 'Cinza',     espessura_nominal: 18, acabamento: 'liso',         codigo_ornato: 'MDF18_Cinza' },
  { id: 'mdf_preto_18',     nome: 'MDF Preto 18mm',     tipo: 'MDF', cor: 'Preto',     espessura_nominal: 18, acabamento: 'liso',         codigo_ornato: 'MDF18_Preto' },
  { id: 'mdf_cru_18',       nome: 'MDF Cru 18mm',       tipo: 'MDF', cor: 'Natural',   espessura_nominal: 18, acabamento: 'liso',         codigo_ornato: 'MDF18_Natural' },
  { id: 'mdf_lacado_18',    nome: 'MDF Lacado 18mm',    tipo: 'MDF', cor: 'Lacado',    espessura_nominal: 18, acabamento: 'lacado',       codigo_ornato: 'MDF18_Lacado' },
  { id: 'mdf_branco_tx_25', nome: 'MDF Branco TX 25mm', tipo: 'MDF', cor: 'Branco TX', espessura_nominal: 25, acabamento: 'texturizado', codigo_ornato: 'MDF25_BrancoTX' },
]

/* Heurística simples para preview de swatch (sem upload de textura ainda) */
function colorHexFor(m) {
  const c = String(m.cor || '').toLowerCase()
  if (c.includes('preto'))            return '#1a1a1a'
  if (c.includes('cinza'))            return '#9a9a9a'
  if (c.includes('lacado'))           return '#222222'
  if (c.includes('natural') || c.includes('cru')) return '#d4a574'
  if (c.includes('amadeirado') || c.includes('carvalho') || c.includes('nogueira')) return '#a87a4b'
  if (c.includes('branco'))           return '#f5f5f5'
  return '#cccccc'
}

/* Código aplicado pelo ComponentEditor — usa codigo_ornato se houver,
 * senão derive de tipo+espessura+cor (CamelCase). */
function materialCode(m) {
  if (m.codigo_ornato && /^[A-Z]/.test(m.codigo_ornato)) return m.codigo_ornato
  const tipo = (m.tipo || 'MDF').toUpperCase()
  const esp  = String(m.espessura_nominal || 18).padStart(2, '0')
  const cor  = String(m.cor || 'Branco')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
  return `${tipo}${esp}_${cor}`
}

/* ─── Fetch catálogo ─── */
function fetchMaterials() {
  if (acab.loadingState === 'loading') return
  acab.loadingState = 'loading'
  acab.error = null
  rerender()

  fetch(apiBase() + '/api/library/asset/chapas.json', { headers: authHeaders() })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then(data => {
      const arr = Array.isArray(data) ? data
                : Array.isArray(data?.materials) ? data.materials
                : Array.isArray(data?.chapas) ? data.chapas
                : EMBEDDED_MATERIALS
      acab.materials = arr
      acab.loadingState = 'ready'
      rerender()
    })
    .catch(err => {
      console.warn('[Ornato/acab] catálogo fetch falhou, usando embedded:', err && err.message)
      acab.materials = EMBEDDED_MATERIALS
      acab.error = `Catálogo offline (${err && err.message || err})`
      acab.loadingState = 'ready'
      rerender()
    })
}

/* ─── Filtro ─── */
function filteredMaterials() {
  const list = acab.materials || []
  if (acab.filter === 'all') return list
  const wanted = Number(acab.filter)
  return list.filter(m => Number(m.espessura_nominal) === wanted)
}

function availableThicknesses() {
  const set = new Set()
  ;(acab.materials || []).forEach(m => set.add(Number(m.espessura_nominal)))
  return Array.from(set).filter(Number.isFinite).sort((a, b) => a - b)
}

/* ─── Render principal ─── */
export function render(container, _ctx) {
  if (acab.loadingState === 'idle') {
    fetchMaterials()
  }
  renderInto(container)
}

function renderInto(container) {
  if (!container) return

  if (acab.loadingState === 'idle' || acab.loadingState === 'loading') {
    container.innerHTML = renderLoading()
    return
  }

  container.innerHTML = `
    <section class="acab-tab">
      ${renderHeader()}
      ${renderSubTabs()}
      ${acab.activeSubTab === 'materials' ? renderMaterials()
        : acab.activeSubTab === 'fronts' ? renderFronts()
        : renderEdges()}
      ${renderFooter()}
    </section>
  `
  bindHandlers(container)
}

function renderLoading() {
  const cards = Array.from({ length: 8 }).map(() => `
    <div class="acab-card acab-card--skeleton">
      <div class="acab-swatch acab-skel"></div>
      <div class="acab-skel acab-skel--line"></div>
    </div>
  `).join('')
  return `
    <section class="acab-tab">
      <div class="acab-header"><h2>Acabamentos</h2><span class="acab-stats">Carregando catálogo…</span></div>
      <div class="acab-grid">${cards}</div>
    </section>
  `
}

function selectionPiece() {
  const sel = getState().selection
  const item = sel?.items?.[0]
  return item || null
}

function renderHeader() {
  const item = selectionPiece()
  let hint = 'Selecione uma peça ou módulo no SketchUp para aplicar acabamento.'
  if (item) {
    const name = htmlEscape(item.name || item.label || `#${item.entity_id}`)
    if (item.type === 'peca') {
      hint = `Aplicando em peça: <strong>${name}</strong>`
    } else if (item.type === 'modulo') {
      hint = `Módulo selecionado: <strong>${name}</strong> — aplica no módulo inteiro`
    } else {
      hint = `<em>${htmlEscape(item.type || '?')}</em> selecionado — somente peças/módulos aceitam material`
    }
  }
  const stats = acab.materials ? `${acab.materials.length} chapas` : ''
  return `
    <div class="acab-header">
      <h2>Acabamentos</h2>
      <span class="acab-stats">${stats}</span>
      <button class="btn btn-ghost btn-sm" data-action="refresh" title="Recarregar catálogo">
        ${iconHTML('layers', 12)} Recarregar
      </button>
    </div>
    <p class="acab-hint">${hint}</p>
    ${acab.error ? `<p class="acab-warn">${htmlEscape(acab.error)}</p>` : ''}
  `
}

function renderSubTabs() {
  const tabs = [
    { id: 'materials', label: `Materiais (${(acab.materials || []).length})` },
    { id: 'fronts',    label: 'Frentes (2)' },
    { id: 'edges',     label: 'Bordas (4)' },
  ]
  return `
    <div class="acab-subtabs" role="tablist">
      ${tabs.map(t => `
        <button class="acab-subtab ${t.id === acab.activeSubTab ? 'active' : ''}"
                data-action="subtab" data-tab="${t.id}">${htmlEscape(t.label)}</button>
      `).join('')}
    </div>
  `
}

function renderMaterials() {
  const list = filteredMaterials()
  const item = selectionPiece()
  const current = item?.attrs?.material || item?.attrs?.material_code || null
  const thicknesses = availableThicknesses()

  return `
    <div class="acab-filters">
      <button class="acab-chip ${acab.filter === 'all' ? 'active' : ''}"
              data-action="filter" data-filter="all">Todos</button>
      ${thicknesses.map(t => `
        <button class="acab-chip ${String(t) === String(acab.filter) ? 'active' : ''}"
                data-action="filter" data-filter="${t}">${t}mm</button>
      `).join('')}
    </div>
    ${list.length === 0
      ? `<div class="acab-empty"><p>Sem chapas para este filtro.</p></div>`
      : `<div class="acab-grid">${list.map(m => renderMatCard(m, current)).join('')}</div>`}
  `
}

function renderMatCard(m, currentCode) {
  const code = materialCode(m)
  const isActive = currentCode && (code === currentCode || m.codigo_ornato === currentCode)
  return `
    <button class="acab-card ${isActive ? 'active' : ''}"
            data-action="apply-mat" data-code="${htmlEscape(code)}"
            title="${htmlEscape(m.nome || code)}">
      <div class="acab-swatch" style="background:${colorHexFor(m)}"></div>
      <strong class="acab-card-title">${htmlEscape(m.cor || m.nome || '—')}</strong>
      <small class="acab-card-meta">${htmlEscape(m.tipo || 'MDF')} · ${htmlEscape(String(m.espessura_nominal || ''))}mm</small>
      ${isActive ? '<span class="acab-badge">✓ Atual</span>' : ''}
    </button>
  `
}

function renderFronts() {
  const item = selectionPiece()
  const valid = item && item.type === 'peca'
  if (!valid) {
    return `<div class="acab-empty">
      <p>Selecione uma <strong>peça</strong> com papel de frente de gaveta (<code>drawer_front</code>).</p>
    </div>`
  }
  const fronts = [
    { id: 'liso',    label: 'Liso',              hint: 'Frente padrão, sem fresa' },
    { id: 'fresado', label: 'Fresado clássico',  hint: 'MDF18 lacado com fresa' },
  ]
  return `
    <div class="acab-grid">
      ${fronts.map(f => `
        <button class="acab-card" data-action="apply-front" data-variant="${htmlEscape(f.id)}">
          <div class="acab-swatch acab-swatch--front-${f.id}"></div>
          <strong class="acab-card-title">${htmlEscape(f.label)}</strong>
          <small class="acab-card-meta">${htmlEscape(f.hint)}</small>
        </button>
      `).join('')}
    </div>
  `
}

function renderEdges() {
  const item = selectionPiece()
  if (!item || item.type !== 'peca') {
    return `<div class="acab-empty">
      <p>Selecione uma <strong>peça</strong> para editar as bordas.</p>
    </div>`
  }
  const stored = (item.attrs && (item.attrs.bordas || item.attrs.edges)) || {}
  const current = acab.pendingEdges
    ? Object.assign({}, stored, acab.pendingEdges)
    : stored

  const sides = [
    { id: 'frente', label: 'Borda frontal' },
    { id: 'tras',   label: 'Borda traseira' },
    { id: 'topo',   label: 'Borda superior' },
    { id: 'base',   label: 'Borda inferior' },
  ]

  const dirty = !!acab.pendingEdges

  return `
    <div class="acab-edges">
      ${sides.map(s => `
        <label class="acab-edge-row">
          <input type="checkbox"
                 data-action="toggle-edge"
                 data-side="${s.id}"
                 ${current[s.id] ? 'checked' : ''} />
          <span>${htmlEscape(s.label)}</span>
        </label>
      `).join('')}
      <div class="acab-edges-actions">
        <button class="btn btn-primary btn-sm" data-action="apply-edges" ${dirty ? '' : 'disabled'}>
          Aplicar bordas
        </button>
        ${dirty ? `<button class="btn btn-ghost btn-sm" data-action="cancel-edges">Cancelar</button>` : ''}
      </div>
    </div>
  `
}

function renderFooter() {
  return `
    <div class="acab-footer">
      <span>${iconHTML('info', 11)} Acabamentos são aplicados via ComponentEditor — alterações são persistidas e o Inspector é atualizado.</span>
    </div>
  `
}

/* ─── Bind ─── */
function bindHandlers(container) {
  container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
    acab.materials = null
    acab.loadingState = 'idle'
    fetchMaterials()
  })

  container.querySelectorAll('[data-action="subtab"]').forEach(btn => {
    btn.addEventListener('click', () => {
      acab.activeSubTab = btn.getAttribute('data-tab') || 'materials'
      acab.pendingEdges = null
      rerender()
    })
  })

  container.querySelectorAll('[data-action="filter"]').forEach(btn => {
    btn.addEventListener('click', () => {
      acab.filter = btn.getAttribute('data-filter') || 'all'
      rerender()
    })
  })

  container.querySelectorAll('[data-action="apply-mat"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code')
      const item = selectionPiece()
      if (!item) { toast('Selecione uma peça ou módulo primeiro', 'warn'); return }
      if (item.type !== 'peca' && item.type !== 'modulo') {
        toast('Material só pode ser aplicado em peças ou módulos', 'warn'); return
      }
      if (!code) return
      const ok = callRuby('edit_change_material', `${item.entity_id}|${code}`)
      toast(ok ? `Aplicando ${code}…` : `Bridge ausente (preview): ${code}`, ok ? 'info' : 'warn')
    })
  })

  container.querySelectorAll('[data-action="apply-front"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const variant = btn.getAttribute('data-variant')
      const item = selectionPiece()
      if (!item || item.type !== 'peca') { toast('Selecione a frente de gaveta', 'warn'); return }
      const ok = callRuby('apply_swap', `${item.entity_id}|${variant}`)
      toast(ok ? `Aplicando frente "${variant}"…` : `Bridge ausente (preview): ${variant}`, ok ? 'info' : 'warn')
    })
  })

  container.querySelectorAll('[data-action="toggle-edge"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const side = cb.getAttribute('data-side')
      if (!side) return
      acab.pendingEdges = acab.pendingEdges || {}
      acab.pendingEdges[side] = !!cb.checked
      rerender()
    })
  })

  container.querySelector('[data-action="apply-edges"]')?.addEventListener('click', () => {
    const item = selectionPiece()
    if (!item || item.type !== 'peca' || !acab.pendingEdges) return
    const payload = JSON.stringify(acab.pendingEdges)
    const ok = callRuby('edit_change_edges', `${item.entity_id}|${payload}`)
    toast(ok ? 'Bordas aplicadas' : 'Bridge ausente (preview)', ok ? 'success' : 'warn')
    if (ok) acab.pendingEdges = null
    rerender()
  })

  container.querySelector('[data-action="cancel-edges"]')?.addEventListener('click', () => {
    acab.pendingEdges = null
    rerender()
  })
}

/* ─── Ack global do Ruby (refresh do Inspector quando muda material) ─── */
if (typeof window !== 'undefined' && !window.__ornatoAcabSetters) {
  window.__ornatoAcabSetters = true
  window.onMaterialChanged = function (payload) {
    try {
      const p = (typeof payload === 'string') ? JSON.parse(payload) : payload
      if (p && p.ok === false) {
        toast(`Falha: ${p.error || 'erro ao aplicar material'}`, 'error')
      } else {
        toast(`Material aplicado${p?.code ? ': ' + p.code : ''}`, 'success')
      }
    } catch (_e) { /* ignora */ }
  }
}
