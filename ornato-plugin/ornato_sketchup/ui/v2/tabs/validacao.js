/**
 * Tab Validação — Central de problemas (Sprint Q)
 *
 * Lista issues detectadas pelo Ornato::Validation::ValidationRunner.
 * Cada issue tem: severity, title, description, entity_id, auto_fix_*.
 *
 * Bridge:
 *   JS  →  callRuby('run_validation')
 *          callRuby('select_entity_in_model', { entity_id })
 *          callRuby('auto_fix_issue', { entity_id, action, payload })
 *          callRuby('ignore_validation_issue', { issue_id, reason })
 *          callRuby('get_ignored_issues')
 *   Ruby → window.setValidationReport({ run_at, total, by_severity, issues })
 *          window.onEntitySelected({ ok, entity_id })
 *          window.onAutoFixDone({ ok, action, entity_id })
 *          window.onIssueIgnored({ ok, token, id })
 *          window.setIgnoredIssues({ ignored: [...] })
 */

import { callRuby, getState, render } from '../app.js'
import { iconHTML } from '../icons.js'

export const meta = { phase: 'F-SprintQ' }

const SEV_ICON = { error: '🔴', warning: '🟡', info: '🟢' }
const SEV_LABEL = { error: 'erro', warning: 'alerta', info: 'info' }

// Cache local da última execução
let lastReport = null
let activeFilters = { error: true, warning: true, info: true, ignored: false }
// Regras preliminares (placeholder) ficam OFF por default — usuário precisa
// optar explicitamente por ver resultados que podem ter falsos positivos.
let showPreliminary = false
let expanded = new Set()

// Setters globais (idempotentes — só uma instalação por sessão)
function installSetters() {
  if (window.__ornatoValidationSettersInstalled) return
  window.__ornatoValidationSettersInstalled = true

  window.setValidationReport = (report) => {
    lastReport = report || { issues: [], by_severity: {}, total: 0 }
    const s = getState && getState()
    if (s) s.validationReport = lastReport
    rerender()
  }
  window.onEntitySelected = (r) => {
    if (window.showToast) window.showToast(r?.ok ? 'Selecionado no modelo' : 'Não foi possível selecionar', r?.ok ? 'ok' : 'warn')
  }
  window.onAutoFixDone = (r) => {
    if (window.showToast) window.showToast(r?.ok ? 'Correção aplicada' : `Falha: ${r?.error || ''}`, r?.ok ? 'ok' : 'error')
    if (r?.ok) callRuby('run_validation')
  }
  window.onIssueIgnored = (r) => {
    if (window.showToast) window.showToast(r?.ok ? 'Issue ignorada' : 'Erro ao ignorar', r?.ok ? 'ok' : 'error')
    if (r?.ok) callRuby('run_validation')
  }
  window.setIgnoredIssues = () => { /* reservado */ }
}

function rerender() {
  const root = document.getElementById('mainContent') || document.querySelector('[data-tab="validacao"]')
  if (root) renderInto(root)
}

export function render(container, _ctx) {
  installSetters()
  if (!lastReport) {
    callRuby('run_validation')
  }
  renderInto(container)
}

function renderInto(container) {
  const r = lastReport
  if (!r) {
    container.innerHTML = `
      <div class="empty-tab" style="padding:24px;text-align:center;color:var(--text-mute);">
        <p>Carregando validação…</p>
      </div>`
    return
  }

  const errs = r.by_severity?.error || 0
  const warns = r.by_severity?.warning || 0
  const infos = r.by_severity?.info || 0

  const filtered = (r.issues || []).filter(i => {
    if (i.placeholder && !showPreliminary) return false
    if (i.ignored && !activeFilters.ignored) return false
    if (!i.ignored && !activeFilters[i.severity]) return false
    return true
  })

  const preliminaryCount = (r.issues || []).filter(i => i.placeholder).length

  container.innerHTML = `
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:13px;font-weight:700;">Validação</span>
        <span style="font-size:11px;color:var(--text-mute);">· ${r.total} ${r.total === 1 ? 'problema' : 'problemas'}</span>
        <button id="valReload" class="btn btn-ghost btn-sm" style="margin-left:auto;">
          ${iconHTML('layers', 12)} Re-rodar
        </button>
      </div>

      <div style="display:flex;gap:10px;font-size:12px;">
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r);background:var(--bg-soft);">
          🔴 <strong style="font-variant-numeric:tabular-nums;">${errs}</strong> erros
        </span>
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r);background:var(--bg-soft);">
          🟡 <strong style="font-variant-numeric:tabular-nums;">${warns}</strong> alertas
        </span>
        <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r);background:var(--bg-soft);">
          🟢 <strong style="font-variant-numeric:tabular-nums;">${infos}</strong> infos
        </span>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;align-items:center;">
        ${filterChip('error', '🔴 Erros')}
        ${filterChip('warning', '🟡 Alertas')}
        ${filterChip('info', '🟢 Infos')}
        ${filterChip('ignored', '⊝ Ignorados')}
        <label title="Regras preliminares (placeholder) podem gerar falsos positivos/negativos — exibidas apenas sob demanda."
          style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
                 border:1px dashed ${showPreliminary ? 'var(--accent)' : 'var(--border)'};
                 background:${showPreliminary ? 'var(--bg-soft)' : 'transparent'};
                 cursor:pointer;font-weight:${showPreliminary ? 600 : 400};user-select:none;">
          <input type="checkbox" id="valShowPrelim" ${showPreliminary ? 'checked' : ''}
            style="margin:0;width:12px;height:12px;cursor:pointer;">
          🧪 Mostrar regras preliminares${preliminaryCount > 0 ? ` (${preliminaryCount})` : ''}
        </label>
      </div>

      <div id="valIssues" style="display:flex;flex-direction:column;gap:10px;">
        ${filtered.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-mute);font-size:12px;">Nenhum problema com os filtros atuais.</div>`
          : filtered.map(renderIssueCard).join('')}
      </div>
    </div>
  `

  document.getElementById('valReload')?.addEventListener('click', () => callRuby('run_validation'))

  document.getElementById('valShowPrelim')?.addEventListener('change', (ev) => {
    showPreliminary = !!ev.target.checked
    rerender()
  })

  container.querySelectorAll('[data-filter]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.getAttribute('data-filter')
      activeFilters[k] = !activeFilters[k]
      rerender()
    })
  })

  container.querySelectorAll('[data-issue-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-issue-toggle')
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id)
      rerender()
    })
  })

  container.querySelectorAll('[data-action="select"]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation()
      const eid = parseInt(el.getAttribute('data-entity-id'), 10) || 0
      callRuby('select_entity_in_model', { entity_id: eid })
    })
  })

  container.querySelectorAll('[data-action="autofix"]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation()
      const eid = parseInt(el.getAttribute('data-entity-id'), 10) || 0
      const action = el.getAttribute('data-fix-action')
      const payload = JSON.parse(el.getAttribute('data-fix-payload') || '{}')
      callRuby('auto_fix_issue', { entity_id: eid, action, payload })
    })
  })

  container.querySelectorAll('[data-action="ignore"]').forEach(el => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation()
      const id = el.getAttribute('data-issue-id')
      const reason = window.prompt('Justificativa para ignorar este problema:', '')
      if (reason !== null) callRuby('ignore_validation_issue', { issue_id: id, reason })
    })
  })
}

function filterChip(key, label) {
  const on = !!activeFilters[key]
  return `
    <button data-filter="${key}" class="btn btn-sm" style="
      padding:4px 10px;border-radius:999px;
      border:1px solid ${on ? 'var(--accent)' : 'var(--border)'};
      background:${on ? 'var(--bg-soft)' : 'transparent'};
      color:var(--text);font-weight:${on ? 600 : 400};
    ">${on ? '✓ ' : ''}${label}</button>
  `
}

function renderIssueCard(issue) {
  const isOpen = expanded.has(issue.id)
  const sev = issue.severity || 'info'
  const icon = SEV_ICON[sev] || '•'
  const ignored = !!issue.ignored
  const preliminary = !!issue.placeholder
  const fix = issue.auto_fix_available && !preliminary
  const fixLabel = fix ? labelForAction(issue.auto_fix_action, issue.auto_fix_payload) : 'Manual'
  const safePayload = JSON.stringify(issue.auto_fix_payload || {}).replace(/'/g, '&#39;')
  const path = (issue.entity_path || []).join(' · ')
  const prelimTip = 'Esta regra é preliminar — pode ter falsos positivos/negativos'

  const borderStyle = preliminary ? 'dashed' : 'solid'
  const cardTitle = preliminary ? `title="${prelimTip}"` : ''

  return `
    <div data-issue-toggle="${issue.id}" ${cardTitle} class="${preliminary ? 'issue-preliminar' : ''}" style="
      border:1px ${borderStyle} ${preliminary ? '#E89623' : 'var(--border)'};border-radius:var(--r-md);
      background:${preliminary ? 'rgba(255, 220, 130, 0.10)' : 'var(--bg)'};overflow:hidden;cursor:pointer;
      ${ignored ? 'opacity:0.55;' : ''}
    ">
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;">
        <span style="font-size:14px;line-height:1;flex-shrink:0;">${icon}</span>
        <div style="flex:1;min-width:0;">
          <p style="font-size:13px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${preliminary ? `<span title="${prelimTip}" style="
              font-size:9px;font-weight:800;letter-spacing:0.05em;
              padding:2px 7px;border-radius:var(--r);
              background:#E89623;color:#fff;
              text-transform:uppercase;flex-shrink:0;">PRELIMINAR</span>` : ''}
            <span>${escapeHtml(issue.title)}</span>
          </p>
          <p style="font-size:11px;color:var(--text-mute);">${escapeHtml(path) || `<span style="opacity:.6;">sem caminho</span>`}</p>
        </div>
        <span style="font-size:10px;padding:2px 8px;border-radius:var(--r);
          background:${fix ? 'var(--bg-soft)' : 'transparent'};
          color:${fix ? 'var(--accent)' : 'var(--text-mute)'};
          font-weight:600;flex-shrink:0;">
          ${fix ? '🔧 ' : ''}${escapeHtml(fixLabel)}
        </span>
      </div>
      ${isOpen ? `
        <div style="padding:0 12px 12px 36px;display:flex;flex-direction:column;gap:8px;">
          <p style="font-size:12px;color:var(--text-2);">${escapeHtml(issue.description || '')}</p>
          ${preliminary ? `<p style="font-size:11px;color:var(--text-mute);font-style:italic;">
            🧪 ${prelimTip}.
          </p>` : ''}
          ${ignored ? `<p style="font-size:11px;color:var(--text-mute);"><em>Ignorada — token ${escapeHtml(issue.ignore_token?.token || '')}</em></p>` : ''}
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${issue.entity_id ? `
              <button data-action="select" data-entity-id="${issue.entity_id}" class="btn btn-ghost btn-sm">
                📍 Selecionar no modelo
              </button>` : ''}
            ${preliminary ? `
              <button disabled
                title="Auto-fix indisponível para regras preliminares"
                class="btn btn-ghost btn-sm"
                style="opacity:0.5;cursor:not-allowed;">
                🔧 Auto-fix indisponível
              </button>` : (fix && !ignored ? `
              <button data-action="autofix"
                data-entity-id="${issue.entity_id || 0}"
                data-fix-action="${escapeHtml(issue.auto_fix_action)}"
                data-fix-payload='${safePayload}'
                class="btn btn-primary btn-sm">
                🔧 ${escapeHtml(fixLabel)}
              </button>` : '')}
            ${!ignored ? `
              <button data-action="ignore" data-issue-id="${escapeHtml(issue.id)}" class="btn btn-ghost btn-sm">
                ⊝ Ignorar
              </button>` : ''}
          </div>
        </div>
      ` : ''}
    </div>
  `
}

function labelForAction(action, payload) {
  switch (action) {
    case 'apply_default_material': return `Aplicar ${payload?.material || 'MDF default'}`
    case 'apply_default_hardware': return `Aplicar ${payload?.rule || 'ferragem'}`
    case 'remove_duplicate_drilling': return 'Remover duplicado'
    case 'cache_module_offline': return 'Cache offline'
    default: return action || 'Auto-fix'
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
