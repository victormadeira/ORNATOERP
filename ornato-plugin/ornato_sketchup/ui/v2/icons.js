/**
 * Ícones SVG inline — Ornato Plugin v2
 * Stroke 1.5px, viewBox 24x24, currentColor (herda cor do parent)
 *
 * Uso: iconHTML('detalhes', 16)
 */

export const ICONS = {
  /* ─── Brand ─── */
  'ornato-mark': `
    <path d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5z" stroke-width="2"/>
    <path d="M8.4 9.25h7.2M8.4 12h7.2M8.4 14.75h5.4" stroke-width="1.55"/>`,

  /* ─── Tab icons (Tabler Icons v3.44.0, MIT, outline) ─── */
  detalhes: `
    <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/>
    <path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2"/>
    <path d="M9 17v-4"/>
    <path d="M12 17v-1"/>
    <path d="M15 17v-2"/>`,

  ambiente: `
    <path d="M3 5h11"/>
    <path d="M12 7l2 -2l-2 -2"/>
    <path d="M5 3l-2 2l2 2"/>
    <path d="M19 10v11"/>
    <path d="M17 19l2 2l2 -2"/>
    <path d="M21 12l-2 -2l-2 2"/>
    <path d="M3 12a2 2 0 0 1 2 -2h7a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2l0 -7"/>`,

  biblioteca: `
    <path d="M7 5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -10"/>
    <path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h2"/>`,

  internos: `
    <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/>
    <path d="M4 12h8"/>
    <path d="M12 15h8"/>
    <path d="M12 9h8"/>
    <path d="M12 4v16"/>`,

  acabamentos: `
    <path d="M19 3h-4a2 2 0 0 0 -2 2v12a4 4 0 0 0 8 0v-12a2 2 0 0 0 -2 -2"/>
    <path d="M13 7.35l-2 -2a2 2 0 0 0 -2.828 0l-2.828 2.828a2 2 0 0 0 0 2.828l9 9"/>
    <path d="M7.3 13h-2.3a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h12"/>
    <path d="M17 17l0 .01"/>`,

  ferragens: `
    <path d="M19.875 6.27c.7 .398 1.13 1.143 1.125 1.948v7.284c0 .809 -.443 1.555 -1.158 1.948l-6.75 4.27a2.27 2.27 0 0 1 -2.184 0l-6.75 -4.27a2.23 2.23 0 0 1 -1.158 -1.948v-7.285c0 -.809 .443 -1.554 1.158 -1.947l6.75 -3.98a2.33 2.33 0 0 1 2.25 0l6.75 3.98l-.033 0"/>
    <path d="M15.5 9.422c.312 .18 .503 .515 .5 .876v3.277c0 .364 -.197 .7 -.515 .877l-3 1.922a1 1 0 0 1 -.97 0l-3 -1.922a1 1 0 0 1 -.515 -.876v-3.278c0 -.364 .197 -.7 .514 -.877l3 -1.79c.311 -.174 .69 -.174 1 0l3 1.79h-.014l0 .001"/>`,

  /* Ferramenta vertical de usinagem — Tabler hammer-drill */
  usinagens: `
    <path d="M12 15v6"/>
    <path d="M16 5h4"/>
    <path d="M8 5h-4"/>
    <path d="M15 11h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1"/>
    <path d="M14 11h-4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1 -1v-3"/>`,

  validacao: `
    <path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"/>
    <path d="M15 19l2 2l4 -4"/>`,

  relatorios: `
    <path d="M5 4h14v16H5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
    <path d="M8 7h7M8 10h5M8 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="13.5" y="13.5" width="3.8" height="3.8" rx="0.3" stroke="currentColor" stroke-width="1.5" fill="none"/>
    <path d="M15.4 13.5v3.8M13.5 15.4h3.8" stroke="currentColor" stroke-width="1"/>
    <path d="M7.3 16.5h3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,

  producao: `
    <path d="M3 21h18"/>
    <path d="M5 21v-12l5 4v-4l5 4h4"/>
    <path d="M19 21v-8l-1.436 -9.574a.5 .5 0 0 0 -.495 -.426h-1.145a.5 .5 0 0 0 -.494 .418l-1.43 8.582"/>
    <path d="M9 17h1"/>
    <path d="M14 17h1"/>`,

  /* ─── Utility icons (lucide-style) ─── */
  'search': `<circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="m21 21-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,

  'chevron-right': `<path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'chevron-down':  `<path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'chevron-left':  `<path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'panel-left-open': `<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" stroke-width="2"/><path d="m14 9 3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'panel-left-close': `<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" stroke-width="2"/><path d="m16 15-3-3 3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'panel-right-close': `<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="15" y1="3" x2="15" y2="21" stroke="currentColor" stroke-width="2"/><path d="m8 9 3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'mouse-pointer': `<path d="m9 9 5 12 1.7-5.3L21 14Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/><path d="m13 13 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  'alert-triangle': `<path d="M12 2 L22 20 L2 20 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none"/>`,
  'plus':          `<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  'minimize':      `<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'layers':        `<path d="m12 2 9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'check-circle':  `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'paintbrush':    `<path d="M14 2c-1 0-2 1-2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2 2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a4 4 0 0 0 4-4v-3a2 2 0 0 1 2-2h2a2 2 0 0 0 2-2V4c0-1-1-2-2-2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'send':          `<path d="m22 2-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M22 2 11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  'download':      `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'lightbulb':     `<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3v1h6v-1c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'pencil':        `<path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'refresh':       `<path d="M21 12a9 9 0 0 1-15.5 6.3M3 12a9 9 0 0 1 15.5-6.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M21 4v5h-5M3 20v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  'x':             `<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  'spinner':       `<path d="M12 2a10 10 0 1 0 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  'settings':      `<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
}

export function iconHTML(name, size = 16) {
  const path = ICONS[name] ?? ICONS.detalhes
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}
