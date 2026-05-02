// ═══════════════════════════════════════════════════════
// EditorEtiquetas.jsx — Editor Visual de Etiquetas (Drag-and-Drop)
// Canvas SVG em mm, variáveis dinâmicas, templates salvos
// ═══════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { Z } from '../ui';
import {
  Tag, Type, Square, BarChart2, Layers, MousePointer, QrCode,
  ArrowLeft, PenTool, Save, Copy, Star, Trash2, Undo2, Redo2,
  ZoomIn, ZoomOut, Grid3X3, ChevronDown, ChevronRight, Plus, X,
  Move, Maximize2, RotateCw, Palette, AlignLeft, AlignCenter, AlignRight,
  Image, Map, Minus, Eye, Lock, Unlock
} from 'lucide-react';
import { qrcodeMatrix } from '../utils/qrcode';
import { code128Bars } from '../utils/code128';

// ─── Variáveis disponíveis ──────────────────────────────
const VARIAVEIS = [
  { key: 'controle',       label: 'Nº Controle',      grupo: 'Identificação', exemplo: '001' },
  { key: 'usi_a',          label: 'Usinagem A',        grupo: 'Identificação', exemplo: '325739A' },
  { key: 'usi_b',          label: 'Usinagem B',        grupo: 'Identificação', exemplo: '325739B' },
  { key: 'peca_id',        label: 'ID Peça',           grupo: 'Identificação', exemplo: '42' },
  { key: 'url_peca',       label: 'URL Peça (QR)',     grupo: 'Identificação', exemplo: '/p/42' },
  { key: 'material',       label: 'Material',          grupo: 'Material',      exemplo: 'MDF Branco TX 15mm' },
  { key: 'material_code',  label: 'Cód. Material',     grupo: 'Material',      exemplo: 'MDF_15.5_BRANCO_TX' },
  { key: 'espessura',      label: 'Espessura (mm)',    grupo: 'Material',      exemplo: '15.5' },
  { key: 'acabamento',     label: 'Acabamento',        grupo: 'Material',      exemplo: '2C+1L' },
  { key: 'comprimento',    label: 'Comprimento (mm)',  grupo: 'Dimensões',     exemplo: '694.5' },
  { key: 'largura',        label: 'Largura (mm)',      grupo: 'Dimensões',     exemplo: '550' },
  { key: 'dimensoes',      label: 'Comp × Larg',       grupo: 'Dimensões',     exemplo: '694.5 × 550' },
  { key: 'dimensoes_full', label: 'C × L × E',         grupo: 'Dimensões',     exemplo: '694.5 × 550 × 15.5' },
  { key: 'cliente',        label: 'Cliente',           grupo: 'Projeto',       exemplo: 'João Silva' },
  { key: 'projeto',        label: 'Projeto',           grupo: 'Projeto',       exemplo: 'Cozinha Planejada' },
  { key: 'codigo',         label: 'Código',            grupo: 'Projeto',       exemplo: 'ORN-2026-001' },
  { key: 'modulo_desc',    label: 'Módulo',            grupo: 'Módulo',        exemplo: 'Balcão 120cm' },
  { key: 'modulo_id',      label: 'ID Módulo',         grupo: 'Módulo',        exemplo: '1' },
  { key: 'descricao',      label: 'Descrição Peça',    grupo: 'Módulo',        exemplo: 'Lateral Direita' },
  { key: 'produto_final',  label: 'Produto Final',     grupo: 'Módulo',        exemplo: 'Armário Alto' },
  { key: 'quantidade',     label: 'Quantidade',        grupo: 'Módulo',        exemplo: '1' },
  { key: 'chapa',          label: 'Chapa',             grupo: 'Produção',      exemplo: '2' },
  { key: 'chapa_total',    label: 'Chapa N/Total',     grupo: 'Produção',      exemplo: '2 / 45' },
  { key: 'peca_indice',    label: 'Peça N/Total',      grupo: 'Produção',      exemplo: '12 / 80' },
  { key: 'lote',           label: 'Lote',              grupo: 'Produção',      exemplo: 'Lote Cozinha 01' },
  { key: 'data',           label: 'Data (DD/MM/AAAA)', grupo: 'Produção',      exemplo: '01/05/2026' },
  { key: 'data_curta',     label: 'Data curta (DD/MM)',grupo: 'Produção',      exemplo: '01/05' },
  { key: 'hora',           label: 'Hora (HH:MM)',      grupo: 'Produção',      exemplo: '14:32' },
  { key: 'data_hora',      label: 'Data + Hora',       grupo: 'Produção',      exemplo: '01/05 14:32' },
  { key: 'operador',       label: 'Operador',          grupo: 'Produção',      exemplo: 'João' },
  { key: 'posicao_chapa',  label: 'Posição na Chapa',  grupo: 'Produção',      exemplo: 'X120 Y450' },
  { key: 'fita_resumo',    label: 'Fita Resumo',       grupo: 'Bordas',        exemplo: 'CMBOR22x045 BRANCO_TX' },
  { key: 'bordas_count',   label: 'Total de fitas',    grupo: 'Bordas',        exemplo: '3' },
  { key: 'bordas_lados',   label: 'Lados com fita',    grupo: 'Bordas',        exemplo: 'F·T·D' },
  { key: 'borda_dir',      label: 'Borda Direita',     grupo: 'Bordas',        exemplo: 'CMBOR19X045BRANCO_TX' },
  { key: 'borda_esq',      label: 'Borda Esquerda',    grupo: 'Bordas',        exemplo: '' },
  { key: 'borda_frontal',  label: 'Borda Frontal',     grupo: 'Bordas',        exemplo: 'CMBOR22x045BRANCO_TX' },
  { key: 'borda_traseira', label: 'Borda Traseira',    grupo: 'Bordas',        exemplo: '' },
  { key: 'borda_cor_frontal',  label: 'Cor Fita Frontal',  grupo: 'Bordas', exemplo: 'Branco TX' },
  { key: 'borda_cor_traseira', label: 'Cor Fita Traseira', grupo: 'Bordas', exemplo: 'Branco TX' },
  { key: 'borda_cor_dir',  label: 'Cor Fita Direita',  grupo: 'Bordas',        exemplo: 'Carvalho' },
  { key: 'borda_cor_esq',  label: 'Cor Fita Esquerda', grupo: 'Bordas',        exemplo: 'Carvalho' },
  { key: 'observacao',     label: 'Observação',        grupo: 'Outros',        exemplo: '' },
  { key: 'rotacionada',    label: 'Rotacionada (R/-)', grupo: 'Outros',        exemplo: 'R' },
  { key: 'lado_ativo',     label: 'Lado Ativo (A/B)',  grupo: 'Outros',        exemplo: 'A' },
  { key: 'empresa_nome',   label: 'Nome Empresa',      grupo: 'Config',        exemplo: 'Móveis Ornato' },
];

const GRUPOS_VAR = [...new Set(VARIAVEIS.map(v => v.grupo))];

// ─── Helpers ────────────────────────────────────────────
const uid = () => 'el_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
const snap = (v, grid) => grid > 0 ? Math.round(v / grid) * grid : v;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function resolverVariavel(key, et, cfg) {
  if (!et) return VARIAVEIS.find(v => v.key === key)?.exemplo || '';
  if (key === 'empresa_nome') return cfg?.empresa_nome || '';
  if (key === 'dimensoes') return `${et.comprimento} × ${et.largura}`;
  if (key === 'dimensoes_full') return `${et.comprimento} × ${et.largura} × ${et.espessura || '?'}`;
  if (key === 'url_peca') {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/p/${et.pecaId || et.peca_id || '0'}`;
  }
  if (key === 'peca_id') return String(et.pecaId || et.peca_id || '');
  if (key === 'quantidade') return String(et.quantidade || 1);
  if (key === 'chapa') return et.chapa_idx != null ? String(Number(et.chapa_idx) + 1) : '';
  if (key === 'chapa_total') {
    const ci = et.chapa_idx != null ? Number(et.chapa_idx) + 1 : null;
    const tot = et.total_chapas || et.chapa_total || cfg?.lote_total_chapas || null;
    if (ci == null) return '';
    return tot ? `${ci} / ${tot}` : String(ci);
  }
  if (key === 'peca_indice') {
    const idx = et.peca_indice != null ? Number(et.peca_indice) + 1 : (et.controle ? Number(et.controle) : null);
    const tot = et.total_pecas || et.peca_total || cfg?.lote_total_pecas || null;
    if (idx == null) return '';
    return tot ? `${idx} / ${tot}` : String(idx);
  }
  if (key === 'lote') return et.lote || et.lote_nome || '';
  if (key === 'data') return new Date().toLocaleDateString('pt-BR');
  if (key === 'data_curta') {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  if (key === 'hora') {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  if (key === 'data_hora') {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  if (key === 'operador') return et.operador || cfg?.operador_padrao || '';
  if (key === 'posicao_chapa') {
    if (et.pos_x == null || et.pos_y == null) return '';
    return `X${Math.round(Number(et.pos_x))} Y${Math.round(Number(et.pos_y))}`;
  }
  if (key === 'rotacionada') return et.rotacionada ? 'R' : '';
  if (key === 'lado_ativo') return et.lado_ativo || '';
  if (key === 'borda_dir') return et.bordas?.dir || et.borda_dir || '';
  if (key === 'borda_esq') return et.bordas?.esq || et.borda_esq || '';
  if (key === 'borda_frontal') return et.bordas?.frontal || et.borda_frontal || '';
  if (key === 'borda_traseira') return et.bordas?.traseira || et.borda_traseira || '';
  if (key === 'bordas_count') {
    const b = et.bordas || et;
    return String(['frontal','traseira','dir','esq'].filter(k => (et.bordas?.[k] || et['borda_'+k])).length);
  }
  if (key === 'bordas_lados') {
    const sigla = { frontal: 'F', traseira: 'T', dir: 'D', esq: 'E' };
    return ['frontal','traseira','dir','esq']
      .filter(k => (et.bordas?.[k] || et['borda_'+k]))
      .map(k => sigla[k]).join('·');
  }
  return et[key] ?? '';
}

function resolverTexto(texto, et, cfg) {
  if (!texto) return '';
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k) => resolverVariavel(k, et, cfg));
}

function fitTextToBox(texto, el, isEditor) {
  const raw = texto || (isEditor ? (el.variavel ? `{{${el.variavel}}}` : 'Texto') : '');
  const baseSize = Number(el.fontSize || 3);
  const mode = el.fitMode || 'overflow';
  if (!raw) return { lines: [''], fontSize: baseSize };
  if (mode === 'overflow') return { lines: [raw], fontSize: baseSize };

  const charW = (size) => Math.max(0.1, size * 0.55);
  const maxChars = (size) => Math.max(1, Math.floor((el.w || 1) / charW(size)));

  if (mode === 'shrink') {
    const target = raw.length * charW(baseSize);
    const nextSize = target > el.w ? Math.max(1.2, Math.min(baseSize, (el.w / Math.max(raw.length * 0.55, 1)))) : baseSize;
    return { lines: [raw], fontSize: Math.round(nextSize * 10) / 10 };
  }

  if (mode === 'ellipsis') {
    const limit = maxChars(baseSize);
    const fitted = raw.length > limit ? raw.slice(0, Math.max(1, limit - 1)).trimEnd() + '…' : raw;
    return { lines: [fitted], fontSize: baseSize };
  }

  if (mode === 'wrap') {
    const lineHeight = baseSize * 1.15;
    const maxLines = Math.max(1, Number(el.maxLines || Math.floor((el.h || baseSize) / lineHeight) || 1));
    const limit = maxChars(baseSize);
    const words = raw.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (candidate.length <= limit) {
        cur = candidate;
      } else {
        if (cur) lines.push(cur);
        cur = word.length > limit ? word.slice(0, limit) : word;
      }
      if (lines.length >= maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (words.length && lines.length === maxLines) {
      const joined = lines.join(' ');
      if (joined.length < raw.length) lines[maxLines - 1] = lines[maxLines - 1].replace(/…?$/, '…');
    }
    return { lines: lines.length ? lines : [''], fontSize: baseSize };
  }

  return { lines: [raw], fontSize: baseSize };
}

// ─── Barcode SVG inline (Code128B padrão industrial) ────
function BarcodeGroup({ value, x, y, w, h }) {
  const str = String(value || '000');
  const { bars } = code128Bars(str, x, y, w, h);
  return (
    <g>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={y} width={Math.max(b.w, 0.1)} height={h * 0.75} fill="#000" />
      ))}
      <text x={x + w / 2} y={y + h * 0.95} fontSize={h * 0.2} textAnchor="middle" fill="#000" fontFamily="monospace">{str}</text>
    </g>
  );
}

// ─── Miniatura 2D da peça (usinagens, sem bordas) ───────
function MiniaturaPecaGroup({ x, y, w, h, et }) {
  const comp = Number(et?.comprimento) || 600;
  const larg = Number(et?.largura) || 400;
  const esp = Number(et?.espessura) || 18;
  const pad = 1;
  const scale = Math.min((w - pad * 2) / comp, (h - pad * 2) / larg);
  const pw = comp * scale;
  const ph = larg * scale;
  const ox = x + (w - pw) / 2;
  const oy = y + (h - ph) / 2;

  // Parse machining
  let workers = [];
  try {
    const mj = et?.machining_json;
    if (mj) {
      const d = typeof mj === 'string' ? JSON.parse(mj) : mj;
      workers = Array.isArray(d) ? d : d.workers ? (Array.isArray(d.workers) ? d.workers : Object.values(d.workers)) : [];
    }
  } catch { /* ignore */ }

  return (
    <g>
      {/* Peça */}
      <rect x={ox} y={oy} width={pw} height={ph} fill="#fff" stroke="#000" strokeWidth={0.3} />
      {/* Usinagens */}
      {workers.map((wk, i) => {
        const cx = ox + (wk.x || 0) / comp * pw;
        const cy = oy + (wk.y || 0) / larg * ph;
        const cat = (wk.category || '').toLowerCase();
        const isHole = /hole|furo/.test(cat);
        if (isHole) {
          const r = Math.max((wk.diameter || 8) / 2 * scale, 0.4);
          const isThrough = /transfer_hole$/.test(cat) || (wk.depth || 0) >= esp;
          return <circle key={i} cx={cx} cy={cy} r={r} fill={isThrough ? '#000' : 'none'} stroke="#000" strokeWidth={0.2} />;
        }
        const rw = Math.max((wk.length || 50) * scale, 1);
        const rh = Math.max((wk.width || 6) * scale, 0.4);
        return <rect key={i} x={cx - rw / 2} y={cy - rh / 2} width={rw} height={rh} fill="#666" stroke="#000" strokeWidth={0.15} />;
      })}
      {/* Dimensões mini */}
      <text x={ox + pw / 2} y={oy + ph + 1.2} fontSize={1.4} textAnchor="middle" fill="#000" fontFamily="monospace">{comp}×{larg}</text>
    </g>
  );
}

// ─── Minimapa real (posição da peça na chapa) ──────────
function MinimapaPecaGroup({ x, y, w, h, el, et }) {
  const corPeca = el.corPeca || '#e74c3c';
  const corOutras = el.corOutras || '#ddd';
  const corFundo = el.corFundo || '#fff';
  const corBorda = el.corBorda || '#333';

  // Se não tem dados de chapa, mostra placeholder
  const chapa = et?.chapa;
  if (!chapa || !et?.chapa_idx && et?.chapa_idx !== 0) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={corFundo} stroke={corBorda} strokeWidth={0.3} rx={0.3} />
        <text x={x + w / 2} y={y + h / 2 + 0.5} textAnchor="middle" fontSize={1.5} fill="#999">Sem plano</text>
      </g>
    );
  }

  const chapaW = chapa.w || 2750;
  const chapaH = chapa.h || 1850;
  const pad = 0.5;
  const scale = Math.min((w - pad * 2) / chapaW, (h - pad * 2) / chapaH);
  const sw = chapaW * scale;
  const sh = chapaH * scale;
  const ox = x + (w - sw) / 2;
  const oy = y + (h - sh) / 2;
  const pecaId = et.peca_id || et.pecaId;
  const instancia = et.instancia ?? 0;

  return (
    <g>
      {/* Chapa */}
      <rect x={ox} y={oy} width={sw} height={sh} fill={corFundo} stroke={corBorda} strokeWidth={0.2} />
      {/* Peças na chapa */}
      {(chapa.pecas || []).map((p, i) => {
        const isCurrent = p.id === pecaId && (p.instancia ?? 0) === instancia;
        const px = ox + p.x * scale;
        const py = oy + p.y * scale;
        const pw = p.w * scale;
        const ph = p.h * scale;
        return (
          <rect key={i} x={px} y={py} width={Math.max(pw, 0.3)} height={Math.max(ph, 0.3)}
            fill={isCurrent ? corPeca : corOutras}
            stroke={isCurrent ? '#000' : '#999'} strokeWidth={isCurrent ? 0.25 : 0.1}
            rx={0.1} />
        );
      })}
    </g>
  );
}

// ─── Diagrama de bordas SVG inline ──────────────────────
function DiagramaBordasGroup({ x, y, w, h, cor, et }) {
  const bordas = et?.bordas || et?.diagrama || {};
  const top = !!bordas.frontal || !!bordas.top;
  const bottom = !!bordas.traseira || !!bordas.bottom;
  const left = !!bordas.esq || !!bordas.left;
  const right = !!bordas.dir || !!bordas.right;
  const inativo = '#d1d5db';
  const bw = 1.2;
  return (
    <g>
      <rect x={x + bw} y={y + bw} width={w - 2 * bw} height={h - 2 * bw} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={0.2} />
      <rect x={x} y={y} width={w} height={bw} fill={top ? cor : inativo} rx={0.3} />
      <rect x={x} y={y + h - bw} width={w} height={bw} fill={bottom ? cor : inativo} rx={0.3} />
      <rect x={x} y={y} width={bw} height={h} fill={left ? cor : inativo} rx={0.3} />
      <rect x={x + w - bw} y={y} width={bw} height={h} fill={right ? cor : inativo} rx={0.3} />
    </g>
  );
}

// ─── Render de um elemento SVG ──────────────────────────
function ElementoSVG({ el, et, cfg, isEditor, selected, onMouseDown }) {
  const texto = el.tipo === 'texto' ? resolverTexto(el.texto || '', et, cfg) : '';
  const transform = el.rotacao ? `rotate(${el.rotacao} ${el.x + el.w / 2} ${el.y + el.h / 2})` : undefined;
  const cursor = isEditor ? 'move' : 'default';
  const handleDown = (e) => { e.stopPropagation(); onMouseDown?.(e, el.id); };
  const renderSelection = (e) => (
    <rect x={e.x - 0.3} y={e.y - 0.3} width={e.w + 0.6} height={e.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" rx={0.3} />
  );

  // ─── Visibilidade condicional ───────────────────
  // hideIfEmpty: oculta o elemento se o texto resolvido for vazio (texto)
  // ou se a variável referenciada (barcode/qrcode) for vazia.
  // Em modo editor SEMPRE mostra (com placeholder/preview), só esconde no print/preview real.
  if (!isEditor && el.hideIfEmpty) {
    if (el.tipo === 'texto' && (!texto || !texto.trim())) return null;
    if ((el.tipo === 'barcode' || el.tipo === 'qrcode') && el.barcodeVariavel) {
      const v = resolverVariavel(el.barcodeVariavel, et, cfg);
      if (!v || !String(v).trim()) return null;
    }
    if (el.tipo === 'imagem' && el.imagemUrl !== '{{logo_empresa}}' && !el.imagemUrl) return null;
  }

  switch (el.tipo) {
    case 'texto': {
      const anchorX = el.alinhamento === 'middle' ? el.x + el.w / 2 : el.alinhamento === 'end' ? el.x + el.w : el.x;
      const fitted = fitTextToBox(texto, el, isEditor);
      const lineHeight = fitted.fontSize * 1.15;
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }} opacity={el.opacity ?? 1}>
          {isEditor && selected && <rect x={el.x - 0.3} y={el.y - 0.3} width={el.w + 0.6} height={el.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" rx={0.3} />}
          <text
            x={anchorX}
            y={el.y + fitted.fontSize * 0.85}
            fontSize={fitted.fontSize}
            fontWeight={el.fontWeight || 400}
            fontFamily={el.fontFamily || 'Inter, sans-serif'}
            fill={el.cor || '#000'}
            textAnchor={el.alinhamento || 'start'}
            dominantBaseline="auto"
          >
            {fitted.lines.map((line, i) => (
              <tspan key={i} x={anchorX} dy={i === 0 ? 0 : lineHeight}>{line}</tspan>
            ))}
          </text>
        </g>
      );
    }
    case 'retangulo':
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }} opacity={el.opacity ?? 1}>
          <rect
            x={el.x} y={el.y} width={el.w} height={el.h}
            fill={el.preenchimento || 'none'}
            stroke={el.bordaCor || (el.preenchimento === 'none' ? '#999' : 'none')}
            strokeWidth={el.bordaLargura || 0.3}
            rx={el.raio || 0}
          />
          {isEditor && selected && <rect x={el.x - 0.3} y={el.y - 0.3} width={el.w + 0.6} height={el.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" />}
        </g>
      );
    case 'linha': {
      const orientation = el.orientacao || 'horizontal';
      const x1 = el.x;
      const y1 = el.y + (orientation === 'horizontal' ? el.h / 2 : 0);
      const x2 = el.x + (orientation === 'horizontal' ? el.w : 0);
      const y2 = el.y + (orientation === 'horizontal' ? el.h / 2 : el.h);
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }} opacity={el.opacity ?? 1}>
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={el.cor || '#333'}
            strokeWidth={el.espessura || 0.4}
            strokeDasharray={el.estilo === 'tracejada' ? '1.5,1' : el.estilo === 'pontilhada' ? '0.4,0.6' : undefined}
            strokeLinecap="round"
          />
          {isEditor && selected && <rect x={el.x - 0.3} y={el.y - 0.3} width={el.w + 0.6} height={el.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" />}
        </g>
      );
    }
    case 'barcode':
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }}>
          {isEditor && selected && <rect x={el.x - 0.3} y={el.y - 0.3} width={el.w + 0.6} height={el.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" />}
          <BarcodeGroup value={resolverVariavel(el.barcodeVariavel || 'controle', et, cfg)} x={el.x} y={el.y} w={el.w} h={el.h} />
        </g>
      );
    case 'qrcode': {
      const qrVal = resolverVariavel(el.barcodeVariavel || 'controle', et, cfg);
      const data = qrcodeMatrix(qrVal || 'QR');
      // Render nativo em SVG (sem dangerouslySetInnerHTML) — atributos
      // controlados pelo React, imune a XSS via cor/conteúdo do usuário.
      const corHex = /^#[0-9a-fA-F]{3,8}$/.test(el.cor || '') ? el.cor : '#000';
      const totalModules = data ? (data.size + data.margin * 2) : 1;
      const moduleSize = data ? Math.min(el.w, el.h) / totalModules : 0;
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }}>
          {isEditor && selected && <rect x={el.x - 0.3} y={el.y - 0.3} width={el.w + 0.6} height={el.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" />}
          <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="#fff" />
          {data && data.matrix.flatMap((row, r) =>
            row.map((v, c) => v === 1 ? (
              <rect
                key={`${r}-${c}`}
                x={el.x + (c + data.margin) * moduleSize}
                y={el.y + (r + data.margin) * moduleSize}
                width={moduleSize}
                height={moduleSize}
                fill={corHex}
              />
            ) : null).filter(Boolean)
          )}
        </g>
      );
    }
    case 'diagrama_bordas':
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }}>
          {isEditor && selected && <rect x={el.x - 0.3} y={el.y - 0.3} width={el.w + 0.6} height={el.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" />}
          <DiagramaBordasGroup x={el.x} y={el.y} w={el.w} h={el.h} cor={el.diagramaCor || 'var(--success)'} et={et} />
        </g>
      );
    case 'imagem': {
      const imgUrl = el.imagemUrl === '{{logo_empresa}}' ? (cfg?.logo_sistema || '') : (el.imagemUrl || '');
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }} opacity={el.opacity ?? 1}>
          {imgUrl ? (
            <image x={el.x} y={el.y} width={el.w} height={el.h}
              href={imgUrl} preserveAspectRatio={el.imagemFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'} />
          ) : (
            <g>
              <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="#f0f0f0" stroke="#ccc" strokeWidth={0.3} strokeDasharray="1 0.5" rx={0.5} />
              <text x={el.x + el.w / 2} y={el.y + el.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(el.w, el.h) * 0.25} fill="#999">Logo</text>
            </g>
          )}
          {isEditor && selected && renderSelection(el)}
        </g>
      );
    }
    case 'minimapa':
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }}>
          <MinimapaPecaGroup x={el.x} y={el.y} w={el.w} h={el.h} el={el} et={et} />
          {isEditor && selected && renderSelection(el)}
        </g>
      );
    case 'miniatura_peca':
      return (
        <g transform={transform} onMouseDown={handleDown} style={{ cursor }}>
          {isEditor && selected && <rect x={el.x - 0.3} y={el.y - 0.3} width={el.w + 0.6} height={el.h + 0.6} fill="none" stroke="#3b82f6" strokeWidth={0.3} strokeDasharray="1,0.5" />}
          <MiniaturaPecaGroup x={el.x} y={el.y} w={el.w} h={el.h} et={et} />
        </g>
      );
    default:
      return null;
  }
}

// ─── Selection Handles ──────────────────────────────────
function Handles({ el, onHandleDown }) {
  const sz = 1.2;
  const half = sz / 2;
  const pts = [
    { id: 'nw', cx: el.x, cy: el.y },
    { id: 'n', cx: el.x + el.w / 2, cy: el.y },
    { id: 'ne', cx: el.x + el.w, cy: el.y },
    { id: 'e', cx: el.x + el.w, cy: el.y + el.h / 2 },
    { id: 'se', cx: el.x + el.w, cy: el.y + el.h },
    { id: 's', cx: el.x + el.w / 2, cy: el.y + el.h },
    { id: 'sw', cx: el.x, cy: el.y + el.h },
    { id: 'w', cx: el.x, cy: el.y + el.h / 2 },
  ];
  return (
    <g>
      {pts.map(p => (
        <rect key={p.id} x={p.cx - half} y={p.cy - half} width={sz} height={sz}
          fill="#3b82f6" stroke="#fff" strokeWidth={0.2} rx={0.2}
          style={{ cursor: `${p.id}-resize` }}
          onMouseDown={e => { e.stopPropagation(); onHandleDown(e, p.id); }}
        />
      ))}
    </g>
  );
}

// ─── Grid Overlay ───────────────────────────────────────
function GridOverlay({ w, h, step }) {
  const lines = [];
  for (let x = step; x < w; x += step) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={h} stroke="#e5e7eb" strokeWidth={0.1} />);
  for (let y = step; y < h; y += step) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={w} y2={y} stroke="#e5e7eb" strokeWidth={0.1} />);
  return <g>{lines}</g>;
}

// ─── Reusable UI atoms ──────────────────────────────────
const SH = ({ children, icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 0 4px', marginBottom: 4 }}>
    {icon}
    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</span>
  </div>
);

const LBL = ({ children }) => (
  <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</label>
);

const Divider = () => <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />;

const Pill = ({ active, children, onClick, style }) => (
  <button
    onClick={onClick}
    style={{
      fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 600,
      border: '1px solid', cursor: 'pointer', transition: 'all .15s',
      background: active ? 'var(--primary)' : 'transparent',
      color: active ? '#fff' : 'var(--text-muted)',
      borderColor: active ? 'var(--primary)' : 'var(--border)',
      ...style,
    }}
  >
    {children}
  </button>
);

const IconBtn = ({ icon: Icon, label, onClick, active, size = 15, style }) => (
  <button
    onClick={onClick}
    title={label}
    style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 2, padding: '6px 4px', fontSize: 9, fontWeight: 600, borderRadius: 8,
      border: '1px solid', cursor: 'pointer', transition: 'all .15s', lineHeight: 1,
      background: active ? 'var(--primary)' : 'var(--bg-card)',
      color: active ? '#fff' : 'var(--text)',
      borderColor: active ? 'var(--primary)' : 'var(--border)',
      ...style,
    }}
  >
    <Icon size={size} />
    <span>{label}</span>
  </button>
);

// ═══════════════════════════════════════════════════════
// EDITOR PRINCIPAL
// ═══════════════════════════════════════════════════════

export default function EditorEtiquetas({ api, notify, etiquetaConfig, onBack, initialTemplateId, lotes = [], loteAtual = null }) {
  // ─── State ────────────────────────────────────────
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(null);
  const [elementos, setElementos] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [gridOn, setGridOn] = useState(true);
  const [gridSize] = useState(2);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [nomeEditar, setNomeEditar] = useState('');
  const [showNomeModal, setShowNomeModal] = useState(false);
  const [collapsedGrupos, setCollapsedGrupos] = useState({});
  const [rightTab, setRightTab] = useState('config'); // 'config' | 'elementos'
  const [autoComplete, setAutoComplete] = useState({ show: false, filter: '', cursorStart: 0, highlightIdx: 0 });
  const [clipboard, setClipboard] = useState(null); // copy/paste de elementos
  const [previewLoteId, setPreviewLoteId] = useState(loteAtual?.id || '');
  const [previewEtiquetas, setPreviewEtiquetas] = useState([]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const textoInputRef = useRef(null);

  const svgRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const canvasW = template?.largura || 100;
  const canvasH = template?.altura || 70;

  const selEl = useMemo(() => selecionado ? elementos.find(e => e.id === selecionado) : null, [selecionado, elementos]);
  const previewEtiqueta = previewEtiquetas[previewIdx] || null;

  // ─── Autocomplete para variáveis {{...}} ─────────
  const acFiltered = useMemo(() => {
    if (!autoComplete.show) return [];
    const f = autoComplete.filter.toLowerCase();
    return VARIAVEIS.filter(v => !f || v.key.toLowerCase().includes(f) || v.label.toLowerCase().includes(f));
  }, [autoComplete.show, autoComplete.filter]);

  const acGrouped = useMemo(() => {
    const grupos = [];
    const seen = new Set();
    for (const v of acFiltered) {
      if (!seen.has(v.grupo)) { seen.add(v.grupo); grupos.push(v.grupo); }
    }
    return grupos.map(g => ({ grupo: g, items: acFiltered.filter(v => v.grupo === g) }));
  }, [acFiltered]);

  // ─── Auto-zoom to fit canvas ────────────────────
  const autoZoom = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const padX = 40, padY = 40;
    const availW = container.clientWidth - padX;
    const availH = container.clientHeight - padY;
    if (availW <= 0 || availH <= 0) return;
    // Each mm = 5px at zoom 1.0
    const pxPerMm = 5;
    const fitW = availW / (canvasW * pxPerMm);
    const fitH = availH / (canvasH * pxPerMm);
    const fit = Math.min(fitW, fitH, 2.5);
    setZoom(Math.max(0.5, Math.round(fit * 4) / 4)); // round to 0.25
  }, [canvasW, canvasH]);

  // ─── Load templates ───────────────────────────────
  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.get('/cnc/etiqueta-templates');
      const list = Array.isArray(data) ? data : (data.data || []);
      setTemplates(list);
      if (!template && list.length > 0) {
        if (initialTemplateId) {
          loadTemplate(initialTemplateId);
        } else {
          const def = list.find(t => t.padrao) || list[0];
          loadTemplate(def.id);
        }
      }
    } catch (e) { console.error(e); }
  }, [api, initialTemplateId]);

  const loadTemplate = useCallback(async (id) => {
    try {
      const resp = await api.get(`/cnc/etiqueta-templates/${id}`);
      const data = resp.data || resp;
      if (typeof data.elementos === 'string') {
        try { data.elementos = JSON.parse(data.elementos); }
        catch { data.elementos = []; console.warn('[EditorEtiquetas] elementos JSON inválido — usando array vazio'); }
      }
      setTemplate(data);
      setElementos(data.elementos || []);
      setSelecionado(null);
      setDirty(false);
      setHistorico([data.elementos || []]);
      setHistIdx(0);
      // auto zoom after load
      requestAnimationFrame(() => requestAnimationFrame(autoZoom));
    } catch (e) { console.error(e); }
  }, [api, autoZoom]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    if (!previewLoteId) {
      setPreviewEtiquetas([]);
      setPreviewIdx(0);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    api.get(`/cnc/etiquetas/${previewLoteId}`)
      .then(data => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : Array.isArray(data?.labels) ? data.labels : [];
        const loteNome = lotes.find(l => Number(l.id) === Number(previewLoteId))?.nome || '';
        setPreviewEtiquetas(arr.map((et, i) => ({
          ...et,
          controle: et.controle || String(et.num || i + 1).padStart(3, '0'),
          descricao: et.descricao || et.upmcode || '',
          modulo_desc: et.modulo_desc || et.modulo || et.ambiente || '',
          lote: et.lote || et.lote_nome || loteNome,
          quantidade: et.quantidade || 1,
        })));
        setPreviewIdx(0);
      })
      .catch(() => {
        if (!cancelled) setPreviewEtiquetas([]);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [api, previewLoteId, lotes]);

  // Auto-zoom on mount and resize
  useEffect(() => {
    const ro = new ResizeObserver(() => autoZoom());
    if (canvasContainerRef.current) ro.observe(canvasContainerRef.current);
    return () => ro.disconnect();
  }, [autoZoom]);

  // ─── Undo/Redo ────────────────────────────────────
  const pushHistory = useCallback((newEls) => {
    setHistorico(prev => {
      const trimmed = prev.slice(0, histIdx + 1);
      const next = [...trimmed, JSON.parse(JSON.stringify(newEls))].slice(-50);
      setHistIdx(next.length - 1);
      return next;
    });
  }, [histIdx]);

  const undo = useCallback(() => {
    if (histIdx <= 0) return;
    const prev = histIdx - 1;
    setHistIdx(prev);
    setElementos(JSON.parse(JSON.stringify(historico[prev])));
    setDirty(true);
  }, [histIdx, historico]);

  const redo = useCallback(() => {
    if (histIdx >= historico.length - 1) return;
    const next = histIdx + 1;
    setHistIdx(next);
    setElementos(JSON.parse(JSON.stringify(historico[next])));
    setDirty(true);
  }, [histIdx, historico]);

  // ─── Update element helper ────────────────────────
  const updateEl = useCallback((id, changes) => {
    setElementos(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...changes } : e);
      pushHistory(next);
      setDirty(true);
      return next;
    });
  }, [pushHistory]);

  // ─── Autocomplete handlers (após updateEl) ───────
  const handleTextoChange = useCallback((e) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    updateEl(selEl?.id, { texto: val });

    // Detect {{ before cursor without closing }}
    const before = val.slice(0, cursor);
    const lastOpen = before.lastIndexOf('{{');
    const lastClose = before.lastIndexOf('}}');
    if (lastOpen !== -1 && lastOpen > lastClose) {
      const partial = before.slice(lastOpen + 2);
      if (!/\s/.test(partial) && partial.length <= 30) {
        setAutoComplete({ show: true, filter: partial, cursorStart: lastOpen, highlightIdx: 0 });
        return;
      }
    }
    setAutoComplete(ac => ac.show ? { show: false, filter: '', cursorStart: 0, highlightIdx: 0 } : ac);
  }, [selEl?.id, updateEl]);

  const acSelectVar = useCallback((varKey) => {
    if (!selEl || !textoInputRef.current) return;
    const input = textoInputRef.current;
    const val = input.value;
    const start = autoComplete.cursorStart;
    const cursor = input.selectionStart;
    const replacement = `{{${varKey}}}`;
    const newVal = val.slice(0, start) + replacement + val.slice(cursor);
    updateEl(selEl.id, { texto: newVal });
    setAutoComplete({ show: false, filter: '', cursorStart: 0, highlightIdx: 0 });
    // Restore focus and cursor position
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + replacement.length;
      input.setSelectionRange(pos, pos);
    });
  }, [selEl, autoComplete.cursorStart, updateEl]);

  const handleTextoKeyDown = useCallback((e) => {
    if (!autoComplete.show || acFiltered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutoComplete(ac => ({ ...ac, highlightIdx: Math.min(ac.highlightIdx + 1, acFiltered.length - 1) }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutoComplete(ac => ({ ...ac, highlightIdx: Math.max(ac.highlightIdx - 1, 0) }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      acSelectVar(acFiltered[autoComplete.highlightIdx]?.key);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAutoComplete({ show: false, filter: '', cursorStart: 0, highlightIdx: 0 });
    }
  }, [autoComplete.show, autoComplete.highlightIdx, acFiltered, acSelectVar]);

  const deleteEl = useCallback((id) => {
    setElementos(prev => {
      const next = prev.filter(e => e.id !== id);
      pushHistory(next);
      setDirty(true);
      if (selecionado === id) setSelecionado(null);
      return next;
    });
  }, [pushHistory, selecionado]);

  const addElement = useCallback((tipo, extra = {}) => {
    const defaults = {
      texto: { tipo: 'texto', x: 10, y: 10, w: 30, h: 5, texto: 'Texto', fontSize: 3, fontWeight: 400, cor: '#000000', alinhamento: 'start', fontFamily: 'Inter, sans-serif' },
      retangulo: { tipo: 'retangulo', x: 10, y: 10, w: 20, h: 10, preenchimento: 'none', bordaCor: '#000000', bordaLargura: 0.3, raio: 0 },
      linha: { tipo: 'linha', x: 5, y: 10, w: 40, h: 1, orientacao: 'horizontal', cor: '#333333', espessura: 0.4, estilo: 'continua' },
      barcode: { tipo: 'barcode', x: 10, y: 10, w: 30, h: 10, barcodeVariavel: 'controle' },
      qrcode: { tipo: 'qrcode', x: 10, y: 10, w: 15, h: 15, barcodeVariavel: 'controle', cor: '#000000' },
      diagrama_bordas: { tipo: 'diagrama_bordas', x: 10, y: 10, w: 18, h: 14, diagramaCor: 'var(--success)' },
      imagem: { tipo: 'imagem', x: 5, y: 5, w: 20, h: 15, imagemUrl: '', imagemFit: 'contain' },
      minimapa: { tipo: 'minimapa', x: 5, y: 5, w: 25, h: 18, corPeca: '#e74c3c', corOutras: '#ddd', corFundo: '#fff', corBorda: '#333' },
      miniatura_peca: { tipo: 'miniatura_peca', x: 5, y: 5, w: 20, h: 16 },
    };
    const el = { id: uid(), ...defaults[tipo], ...extra, zIndex: elementos.length + 1, rotacao: 0 };
    setElementos(prev => {
      const next = [...prev, el];
      pushHistory(next);
      setDirty(true);
      return next;
    });
    setSelecionado(el.id);
  }, [elementos, pushHistory]);

  const addVariavel = useCallback((varKey) => {
    const v = VARIAVEIS.find(vv => vv.key === varKey);
    if (!v) return;
    addElement('texto', {
      texto: `{{${varKey}}}`,
      variavel: varKey,
      w: Math.max(20, v.exemplo.length * 1.8),
      h: 4,
      fontSize: 2.5,
      fontWeight: 600,
    });
  }, [addElement]);

  const applyTemplate = useCallback((tipo) => {
    let w, h, els;
    if (tipo === 'padrao') {
      w = 100; h = 50;
      els = [
        { tipo: 'texto', x: 3, y: 3, w: 60, h: 5, texto: '{{descricao}}', fontSize: 3.5, fontWeight: 700, cor: '#000', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 9, w: 40, h: 4, texto: '{{material}}', fontSize: 2.5, fontWeight: 400, cor: '#555', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 14, w: 50, h: 4, texto: '{{comprimento}} x {{largura}} x {{espessura}}', fontSize: 2.8, fontWeight: 600, cor: '#000', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 20, w: 40, h: 4, texto: '{{modulo_desc}}', fontSize: 2.2, fontWeight: 400, cor: '#666', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 25, w: 40, h: 4, texto: 'Qtd: {{quantidade}}', fontSize: 2.5, fontWeight: 600, cor: '#000', alinhamento: 'start' },
        { tipo: 'diagrama_bordas', x: 3, y: 32, w: 14, h: 14, diagramaCor: 'var(--success)' },
        { tipo: 'barcode', x: 55, y: 3, w: 42, h: 12, barcodeVariavel: 'controle' },
        { tipo: 'qrcode', x: 75, y: 28, w: 18, h: 18, barcodeVariavel: 'controle', cor: '#000' },
        { tipo: 'texto', x: 55, y: 18, w: 42, h: 4, texto: '{{cliente}}', fontSize: 2.2, fontWeight: 400, cor: '#666', alinhamento: 'start' },
        { tipo: 'texto', x: 55, y: 23, w: 42, h: 4, texto: '{{projeto}}', fontSize: 2.2, fontWeight: 500, cor: '#333', alinhamento: 'start' },
      ];
    } else if (tipo === 'compacta') {
      w = 70; h = 40;
      els = [
        { tipo: 'texto', x: 2, y: 2, w: 40, h: 4, texto: '{{descricao}}', fontSize: 3, fontWeight: 700, cor: '#000', alinhamento: 'start' },
        { tipo: 'texto', x: 2, y: 7, w: 40, h: 3, texto: '{{comprimento}}x{{largura}}x{{espessura}}', fontSize: 2.5, fontWeight: 600, cor: '#000', alinhamento: 'start' },
        { tipo: 'texto', x: 2, y: 11, w: 40, h: 3, texto: '{{material}} · Qtd:{{quantidade}}', fontSize: 2, fontWeight: 400, cor: '#555', alinhamento: 'start' },
        { tipo: 'diagrama_bordas', x: 2, y: 16, w: 12, h: 12, diagramaCor: 'var(--success)' },
        { tipo: 'qrcode', x: 50, y: 2, w: 16, h: 16, barcodeVariavel: 'controle', cor: '#000' },
        { tipo: 'barcode', x: 16, y: 30, w: 52, h: 8, barcodeVariavel: 'controle' },
      ];
    } else if (tipo === 'completa') {
      w = 100; h = 70;
      els = [
        { tipo: 'imagem', x: 3, y: 2, w: 20, h: 10, imagemUrl: '{{logo_empresa}}', imagemFit: 'contain' },
        { tipo: 'texto', x: 25, y: 3, w: 50, h: 5, texto: '{{descricao}}', fontSize: 3.8, fontWeight: 700, cor: '#000', alinhamento: 'start' },
        { tipo: 'texto', x: 25, y: 9, w: 50, h: 4, texto: '{{material}}', fontSize: 2.5, fontWeight: 400, cor: '#555', alinhamento: 'start' },
        { tipo: 'retangulo', x: 2, y: 14, w: 96, h: 0.3, preenchimento: '#ddd', bordaCor: 'none', bordaLargura: 0 },
        { tipo: 'texto', x: 3, y: 17, w: 50, h: 5, texto: '{{comprimento}} x {{largura}} x {{espessura}} mm', fontSize: 3.2, fontWeight: 700, cor: '#000', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 23, w: 30, h: 4, texto: 'Módulo: {{modulo_desc}}', fontSize: 2.3, fontWeight: 400, cor: '#555', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 28, w: 30, h: 4, texto: 'Qtd: {{quantidade}}', fontSize: 2.8, fontWeight: 700, cor: '#000', alinhamento: 'start' },
        { tipo: 'texto', x: 40, y: 23, w: 30, h: 4, texto: '{{cliente}}', fontSize: 2.2, fontWeight: 400, cor: '#666', alinhamento: 'start' },
        { tipo: 'texto', x: 40, y: 28, w: 30, h: 4, texto: '{{projeto}}', fontSize: 2.2, fontWeight: 500, cor: '#333', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 34, w: 25, h: 3, texto: 'Fita Frontal: {{borda_cor_frontal}}', fontSize: 2, fontWeight: 400, cor: '#333', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 38, w: 25, h: 3, texto: 'Fita Traseira: {{borda_cor_traseira}}', fontSize: 2, fontWeight: 400, cor: '#333', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 42, w: 25, h: 3, texto: 'Fita Esquerda: {{borda_cor_esq}}', fontSize: 2, fontWeight: 400, cor: '#333', alinhamento: 'start' },
        { tipo: 'texto', x: 3, y: 46, w: 25, h: 3, texto: 'Fita Direita: {{borda_cor_dir}}', fontSize: 2, fontWeight: 400, cor: '#333', alinhamento: 'start' },
        { tipo: 'diagrama_bordas', x: 30, y: 34, w: 16, h: 16, diagramaCor: 'var(--success)' },
        { tipo: 'minimapa', x: 52, y: 34, w: 25, h: 18, corPeca: '#e74c3c', corOutras: '#ddd', corFundo: '#fff', corBorda: '#333' },
        { tipo: 'qrcode', x: 80, y: 17, w: 18, h: 18, barcodeVariavel: 'controle', cor: '#000' },
        { tipo: 'barcode', x: 3, y: 56, w: 75, h: 10, barcodeVariavel: 'controle' },
        { tipo: 'texto', x: 80, y: 56, w: 18, h: 10, texto: '{{controle}}', fontSize: 2.5, fontWeight: 600, cor: '#000', alinhamento: 'center' },
      ];
    } else return;
    const stamped = els.map((el, i) => ({ ...el, id: `tpl_${Date.now()}_${i}`, zIndex: i, rotacao: 0 }));
    setTemplate(prev => ({ ...prev, largura: w, altura: h }));
    setElementos(stamped);
    pushHistory(stamped);
    setSelecionado(null);
    setDirty(true);
    requestAnimationFrame(autoZoom);
  }, [pushHistory, autoZoom]);

  // ─── SVG coordinate conversion ────────────────────
  const svgPt = useCallback((e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvasW,
      y: ((e.clientY - rect.top) / rect.height) * canvasH,
    };
  }, [canvasW, canvasH]);

  // ─── Mouse handlers ───────────────────────────────
  const handleElementDown = useCallback((e, id) => {
    e.preventDefault();
    setSelecionado(id);
    const pt = svgPt(e);
    const el = elementos.find(el => el.id === id);
    if (!el) return;
    if (el.locked) return; // Elemento bloqueado: pode selecionar mas não arrastar
    setDragState({ id, startX: pt.x - el.x, startY: pt.y - el.y });
  }, [svgPt, elementos]);

  const handleHandleDown = useCallback((e, handle) => {
    e.preventDefault();
    if (!selEl || selEl.locked) return; // Bloqueado: ignora resize handles
    const pt = svgPt(e);
    setResizeState({ id: selEl.id, handle, startPt: pt, startEl: { x: selEl.x, y: selEl.y, w: selEl.w, h: selEl.h } });
  }, [svgPt, selEl]);

  const handleMouseMove = useCallback((e) => {
    const pt = svgPt(e);
    if (dragState) {
      let nx = pt.x - dragState.startX;
      let ny = pt.y - dragState.startY;
      if (gridOn) { nx = snap(nx, gridSize); ny = snap(ny, gridSize); }
      nx = clamp(nx, 0, canvasW - 2);
      ny = clamp(ny, 0, canvasH - 2);
      setElementos(prev => prev.map(el => el.id === dragState.id ? { ...el, x: nx, y: ny } : el));
    }
    if (resizeState) {
      const { handle, startPt, startEl } = resizeState;
      const dx = pt.x - startPt.x;
      const dy = pt.y - startPt.y;
      let { x, y, w, h } = startEl;
      if (handle.includes('e')) w = Math.max(3, startEl.w + dx);
      if (handle.includes('w')) { x = startEl.x + dx; w = Math.max(3, startEl.w - dx); }
      if (handle.includes('s')) h = Math.max(2, startEl.h + dy);
      if (handle.includes('n')) { y = startEl.y + dy; h = Math.max(2, startEl.h - dy); }
      if (gridOn) { x = snap(x, gridSize); y = snap(y, gridSize); w = snap(w, gridSize) || gridSize; h = snap(h, gridSize) || gridSize; }
      setElementos(prev => prev.map(el => el.id === resizeState.id ? { ...el, x, y, w, h } : el));
    }
  }, [dragState, resizeState, svgPt, gridOn, gridSize, canvasW, canvasH]);

  const handleMouseUp = useCallback(() => {
    if (dragState || resizeState) { pushHistory(elementos); setDirty(true); }
    setDragState(null);
    setResizeState(null);
  }, [dragState, resizeState, elementos, pushHistory]);

  // ─── Keyboard shortcuts ───────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selecionado) { deleteEl(selecionado); e.preventDefault(); }
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) { undo(); e.preventDefault(); }
      if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === 'y' && (e.ctrlKey || e.metaKey))) { redo(); e.preventDefault(); }
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        if (selEl) {
          e.preventDefault();
          addElement(selEl.tipo, { ...selEl, id: undefined, x: selEl.x + 3, y: selEl.y + 3, zIndex: elementos.length + 1 });
        }
      }
      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selEl) {
        e.preventDefault();
        setClipboard({ ...selEl });
      }
      if (e.key === 'v' && (e.ctrlKey || e.metaKey) && clipboard) {
        e.preventDefault();
        addElement(clipboard.tipo, { ...clipboard, id: undefined, x: Math.min(clipboard.x + 4, canvasW - clipboard.w), y: Math.min(clipboard.y + 4, canvasH - clipboard.h), zIndex: elementos.length + 1 });
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selecionado) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const dir = { ArrowUp: { y: -step }, ArrowDown: { y: step }, ArrowLeft: { x: -step }, ArrowRight: { x: step } }[e.key];
        updateEl(selecionado, {
          x: clamp((selEl?.x || 0) + (dir.x || 0), 0, canvasW - 2),
          y: clamp((selEl?.y || 0) + (dir.y || 0), 0, canvasH - 2),
        });
      }
      if (e.key === 'Escape') { setSelecionado(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selecionado, selEl, deleteEl, undo, redo, addElement, updateEl, elementos, canvasW, canvasH]);

  // ─── Save ─────────────────────────────────────────
  const salvar = async () => {
    if (!template) return;
    setSaving(true);
    try {
      await api.put(`/cnc/etiqueta-templates/${template.id}`, {
        nome: template.nome, largura: canvasW, altura: canvasH,
        colunas_impressao: template.colunas_impressao,
        margem_pagina: template.margem_pagina,
        gap_etiquetas: template.gap_etiquetas,
        offset_x: template.offset_x ?? 0,
        offset_y: template.offset_y ?? 0,
        elementos,
      });
      setDirty(false);
      notify?.('Template salvo!', 'success');
      loadTemplates();
    } catch (e) { notify?.('Erro ao salvar', 'error'); }
    setSaving(false);
  };

  const salvarComo = async (nome) => {
    setSaving(true);
    try {
      const resp = await api.post('/cnc/etiqueta-templates', {
        nome, largura: canvasW, altura: canvasH,
        colunas_impressao: template?.colunas_impressao || 2,
        margem_pagina: template?.margem_pagina || 8,
        gap_etiquetas: template?.gap_etiquetas || 4,
        offset_x: template?.offset_x ?? 0,
        offset_y: template?.offset_y ?? 0,
        elementos,
      });
      const newId = resp.id || resp.data?.id;
      setDirty(false);
      notify?.('Template criado!', 'success');
      await loadTemplates();
      if (newId) loadTemplate(newId);
    } catch (e) { notify?.('Erro ao criar', 'error'); }
    setSaving(false);
    setShowNomeModal(false);
  };

  const excluir = async () => {
    if (!template || !confirm('Excluir este template?')) return;
    try {
      await api.del(`/cnc/etiqueta-templates/${template.id}`);
      notify?.('Template excluído', 'success');
      setTemplate(null);
      setElementos([]);
      setSelecionado(null);
      loadTemplates();
    } catch (e) { notify?.('Erro ao excluir', 'error'); }
  };

  const duplicar = async () => {
    if (!template) return;
    try {
      const resp = await api.post(`/cnc/etiqueta-templates/${template.id}/duplicar`);
      const newId = resp.id || resp.data?.id;
      notify?.('Template duplicado!', 'success');
      await loadTemplates();
      if (newId) loadTemplate(newId);
    } catch (e) { notify?.('Erro ao duplicar', 'error'); }
  };

  const definirPadrao = async () => {
    if (!template) return;
    try {
      await api.put(`/cnc/etiqueta-templates/${template.id}/padrao`);
      notify?.('Definido como padrão!', 'success');
      loadTemplates();
    } catch (e) { notify?.('Erro', 'error'); }
  };

  // ─── Property helpers ──────────────────────────────
  const setTmpl = (k, v) => { setTemplate(prev => ({ ...prev, [k]: v })); setDirty(true); };

  const propInput = (label, field, type = 'number', opts = {}) => {
    if (!selEl) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <LBL>{label}</LBL>
        <input
          type={type}
          value={selEl[field] ?? opts.def ?? ''}
          onChange={e => updateEl(selEl.id, { [field]: type === 'number' ? Number(e.target.value) : e.target.value })}
          className={Z.inp}
          style={{ fontSize: 11, padding: '4px 6px', width: opts.w || '100%', ...(opts.style || {}) }}
          step={opts.step} min={opts.min} max={opts.max}
        />
      </div>
    );
  };

  const toggleGrupo = (g) => setCollapsedGrupos(prev => ({ ...prev, [g]: !prev[g] }));

  // ─── Alinhamento relativo ao canvas ──────────────
  const alinhar = useCallback((tipo) => {
    if (!selEl) return;
    const updates = {
      'left':    { x: 0 },
      'centerX': { x: Math.max(0, (canvasW - selEl.w) / 2) },
      'right':   { x: Math.max(0, canvasW - selEl.w) },
      'top':     { y: 0 },
      'centerY': { y: Math.max(0, (canvasH - selEl.h) / 2) },
      'bottom':  { y: Math.max(0, canvasH - selEl.h) },
    }[tipo];
    if (updates) updateEl(selEl.id, updates);
  }, [selEl, canvasW, canvasH, updateEl]);

  // ─── Validação de variáveis usadas no template ───
  const variaveisUsadas = useMemo(() => {
    const usadas = new Set();
    const validas = new Set(VARIAVEIS.map(v => v.key));
    const invalidas = new Set();
    for (const el of elementos) {
      const textos = [el.texto, el.barcodeVariavel, el.variavel].filter(Boolean);
      for (const t of textos) {
        const matches = String(t).matchAll(/\{\{(\w+)\}\}/g);
        for (const m of matches) {
          usadas.add(m[1]);
          if (!validas.has(m[1])) invalidas.add(m[1]);
        }
        if (validas.has(t)) usadas.add(t); // variavel direta (barcode)
      }
    }
    return { usadas: [...usadas].filter(k => validas.has(k)), invalidas: [...invalidas] };
  }, [elementos]);

  const templateChecks = useMemo(() => {
    const checks = [];
    const sample = previewEtiqueta || null;
    for (const el of elementos) {
      const nome = el.variavel || el.texto || el.barcodeVariavel || el.tipo;
      if (el.x < 0 || el.y < 0 || el.x + el.w > canvasW || el.y + el.h > canvasH) {
        checks.push({ tipo: 'erro', msg: `${nome}: elemento sai da etiqueta` });
      }
      if ((el.tipo === 'barcode' || el.tipo === 'qrcode') && Math.min(el.w, el.h) < 12) {
        checks.push({ tipo: 'aviso', msg: `${nome}: código pode ficar pequeno para leitura` });
      }
      if (el.tipo === 'texto') {
        const txt = resolverTexto(el.texto || '', sample, etiquetaConfig);
        const fontSize = Number(el.fontSize || 3);
        const estimated = txt.length * fontSize * 0.55;
        if ((el.fitMode || 'overflow') === 'overflow' && estimated > el.w) {
          checks.push({ tipo: 'aviso', msg: `${nome}: texto pode estourar a largura` });
        }
        if (txt && txt.length > 42 && !el.fitMode) {
          checks.push({ tipo: 'info', msg: `${nome}: considere auto-ajuste ou quebra de linha` });
        }
      }
      if (el.tipo === 'barcode') {
        const val = resolverVariavel(el.barcodeVariavel || 'controle', sample, etiquetaConfig);
        if (!val) checks.push({ tipo: 'erro', msg: `${nome}: barcode sem valor de dados` });
      }
    }
    for (const k of variaveisUsadas.invalidas) {
      checks.push({ tipo: 'erro', msg: `{{${k}}}: variável inexistente` });
    }
    if (!elementos.some(el => el.tipo === 'barcode' || el.tipo === 'qrcode')) {
      checks.push({ tipo: 'info', msg: 'Template sem barcode/QR de rastreio' });
    }
    return checks;
  }, [elementos, canvasW, canvasH, previewEtiqueta, etiquetaConfig, variaveisUsadas.invalidas]);

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════

  const canvasStyle = {
    width: canvasW * zoom * 5,
    height: canvasH * zoom * 5,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>

      {/* ══ HEADER BAR ═══════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Voltar */}
        {onBack && (
          <button onClick={onBack} className={Z.btn2}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6 }}>
            <ArrowLeft size={13} /> Voltar
          </button>
        )}

        {/* Separator */}
        {onBack && <div style={{ width: 1, height: 22, background: 'var(--border)' }} />}

        {/* Logo/title mini */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <PenTool size={14} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>Editor</span>
        </div>

        {/* Template selector */}
        <select
          value={template?.id || ''}
          onChange={e => loadTemplate(Number(e.target.value))}
          className={Z.inp}
          style={{ fontSize: 11, padding: '4px 8px', minWidth: 160, fontWeight: 600, borderRadius: 6 }}
        >
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.nome}{t.padrao ? ' [Padrao]' : ''}</option>
          ))}
        </select>

        {/* Preview com dados reais */}
        <select
          value={previewLoteId}
          onChange={e => setPreviewLoteId(e.target.value)}
          className={Z.inp}
          title="Lote usado para pré-visualizar dados reais"
          style={{ fontSize: 11, padding: '4px 8px', minWidth: 150, borderRadius: 6 }}
        >
          <option value="">Prévia exemplo</option>
          {lotes.map(l => (
            <option key={l.id} value={l.id}>{l.nome || l.codigo || `Lote ${l.id}`}</option>
          ))}
        </select>
        {previewLoteId && (
          <select
            value={previewIdx}
            onChange={e => setPreviewIdx(Number(e.target.value))}
            className={Z.inp}
            disabled={previewLoading || previewEtiquetas.length === 0}
            title="Peça usada na prévia"
            style={{ fontSize: 11, padding: '4px 8px', minWidth: 150, borderRadius: 6 }}
          >
            {previewLoading ? (
              <option>Carregando peças...</option>
            ) : previewEtiquetas.length === 0 ? (
              <option>Nenhuma peça</option>
            ) : previewEtiquetas.slice(0, 250).map((et, i) => (
              <option key={`${et.pecaId || et.peca_id || i}_${et.instancia || 0}`} value={i}>
                {et.controle || String(i + 1).padStart(3, '0')} · {et.descricao || et.modulo_desc || 'Peça'}
              </option>
            ))}
          </select>
        )}

        {/* Save button */}
        <button className={Z.btn} onClick={salvar} disabled={saving || !dirty}
          style={{ fontSize: 11, padding: '5px 12px', gap: 4, display: 'flex', alignItems: 'center', borderRadius: 6 }}>
          <Save size={12} /> {saving ? '...' : 'Salvar'}
        </button>
        {dirty && <span style={{ color: 'var(--warning)', fontSize: 16, lineHeight: 1 }}>●</span>}

        {/* Template actions dropdown area */}
        <div style={{ display: 'flex', gap: 1 }}>
          <button className={Z.btn2} style={{ fontSize: 10, padding: '4px 7px', borderRadius: '6px 0 0 6px' }}
            onClick={() => { setNomeEditar(''); setShowNomeModal(true); }} title="Salvar Como">
            <Copy size={11} />
          </button>
          <button className={Z.btn2} style={{ fontSize: 10, padding: '4px 7px', borderRadius: 0 }}
            onClick={duplicar} title="Duplicar">
            <Plus size={11} />
          </button>
          <button className={Z.btn2} style={{ fontSize: 10, padding: '4px 7px', borderRadius: 0 }}
            onClick={definirPadrao} title="Definir como Padrão">
            <Star size={11} />
          </button>
          <button className={Z.btn2} style={{ fontSize: 10, padding: '4px 7px', borderRadius: '0 6px 6px 0', color: 'var(--danger)' }}
            onClick={excluir} title="Excluir Template">
            <Trash2 size={11} />
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Undo/Redo */}
        <button className={Z.btn2} style={{ padding: '4px 7px', borderRadius: 6 }}
          onClick={undo} disabled={histIdx <= 0} title="Desfazer (Ctrl+Z)">
          <Undo2 size={13} />
        </button>
        <button className={Z.btn2} style={{ padding: '4px 7px', borderRadius: 6 }}
          onClick={redo} disabled={histIdx >= historico.length - 1} title="Refazer (Ctrl+Y)">
          <Redo2 size={13} />
        </button>

        {/* Info badge */}
        <div style={{
          fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
          background: 'var(--bg-muted)', padding: '3px 8px', borderRadius: 10,
        }}>
          {canvasW}×{canvasH}mm · {elementos.length} elem.
        </div>
        <div style={{
          fontSize: 10,
          color: templateChecks.some(c => c.tipo === 'erro') ? '#dc2626' : templateChecks.some(c => c.tipo === 'aviso') ? '#b45309' : '#15803d',
          fontWeight: 800,
          background: templateChecks.some(c => c.tipo === 'erro') ? '#fef2f2' : templateChecks.some(c => c.tipo === 'aviso') ? '#fffbeb' : '#f0fdf4',
          border: '1px solid',
          borderColor: templateChecks.some(c => c.tipo === 'erro') ? '#fecaca' : templateChecks.some(c => c.tipo === 'aviso') ? '#fde68a' : '#bbf7d0',
          padding: '3px 8px',
          borderRadius: 10,
        }}>
          {templateChecks.filter(c => c.tipo !== 'info').length || 0} alerta(s)
        </div>
      </div>

      {/* ══ MAIN AREA — 3 columns ═══════════════════════ */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── LEFT PANEL: Ferramentas + Variáveis ─────── */}
        <div style={{
          width: 200, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
          borderRight: '1px solid var(--border)', padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: 0,
          background: 'var(--bg-card)',
        }}>

          {/* Ferramentas de adição */}
          <SH icon={<Layers size={10} />}>Adicionar</SH>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginBottom: 6 }}>
            <IconBtn icon={Type} label="Texto" onClick={() => addElement('texto')} />
            <IconBtn icon={Square} label="Retângulo" onClick={() => addElement('retangulo')} />
            <IconBtn icon={Minus} label="Linha" onClick={() => addElement('linha')} />
            <IconBtn icon={BarChart2} label="Barcode" onClick={() => addElement('barcode')} />
            <IconBtn icon={QrCode} label="QR Code" onClick={() => addElement('qrcode')} />
            <IconBtn icon={Layers} label="Diagrama" onClick={() => addElement('diagrama_bordas')} />
            <IconBtn icon={Image} label="Imagem" onClick={() => addElement('imagem')} />
            <IconBtn icon={Map} label="Mini-mapa" onClick={() => addElement('minimapa')} />
            <IconBtn icon={Maximize2} label="Miniatura" onClick={() => addElement('miniatura_peca')} />
          </div>

          <Divider />

          {/* Variáveis — com grupos colapsáveis */}
          <SH icon={<Tag size={10} />}>Variáveis</SH>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
            Clique para adicionar ao canvas
          </div>

          {GRUPOS_VAR.map(g => {
            const collapsed = collapsedGrupos[g];
            const vars = VARIAVEIS.filter(v => v.grupo === g);
            return (
              <div key={g} style={{ marginBottom: 2 }}>
                <div
                  onClick={() => toggleGrupo(g)}
                  style={{
                    fontSize: 9, fontWeight: 800, color: 'var(--primary)', padding: '4px 4px',
                    textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 3, borderRadius: 4,
                    userSelect: 'none',
                  }}
                >
                  {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                  {g}
                  <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600 }}>({vars.length})</span>
                </div>
                {!collapsed && vars.map(v => (
                  <div
                    key={v.key}
                    onClick={() => addVariavel(v.key)}
                    style={{
                      fontSize: 10, padding: '3px 8px 3px 18px', cursor: 'pointer', borderRadius: 5,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'background 0.1s', marginBottom: 1,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    title={`Ex: ${v.exemplo}`}
                  >
                    <span style={{ fontWeight: 600 }}>{v.label}</span>
                    <Plus size={10} style={{ color: 'var(--primary)', opacity: 0.6 }} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── CENTER — Canvas ─────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Mini toolbar above canvas */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
            background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)',
            flexShrink: 0, fontSize: 11,
          }}>
            <button className={Z.btn2} style={{ padding: '2px 6px', borderRadius: 5 }}
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom -">
              <ZoomOut size={13} />
            </button>
            <span style={{ fontWeight: 700, minWidth: 40, textAlign: 'center', fontSize: 11 }}>{Math.round(zoom * 100)}%</span>
            <button className={Z.btn2} style={{ padding: '2px 6px', borderRadius: 5 }}
              onClick={() => setZoom(z => Math.min(3, z + 0.25))} title="Zoom +">
              <ZoomIn size={13} />
            </button>
            <button className={Z.btn2} style={{ padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 600 }}
              onClick={autoZoom} title="Ajustar ao espaço">
              <Maximize2 size={13} />
            </button>

            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontWeight: 600, fontSize: 10 }}>
              <input type="checkbox" checked={gridOn} onChange={e => setGridOn(e.target.checked)} style={{ width: 13, height: 13 }} />
              <Grid3X3 size={12} /> Grid {gridSize}mm
            </label>

            {/* Alignment toolbar — aparece quando há seleção */}
            {selEl && (
              <>
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                {/* Alinhamento horizontal */}
                {[
                  { id: 'left',    title: 'Alinhar à esquerda',  icon: '⬅' },
                  { id: 'centerX', title: 'Centralizar horizontal', icon: '↔' },
                  { id: 'right',   title: 'Alinhar à direita',   icon: '➡' },
                ].map(a => (
                  <button key={a.id} onClick={() => alinhar(a.id)} title={a.title}
                    className={Z.btn2} style={{ padding: '2px 5px', fontSize: 11, borderRadius: 4 }}>
                    {a.icon}
                  </button>
                ))}
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                {/* Alinhamento vertical */}
                {[
                  { id: 'top',     title: 'Alinhar ao topo',     icon: '⬆' },
                  { id: 'centerY', title: 'Centralizar vertical', icon: '↕' },
                  { id: 'bottom',  title: 'Alinhar à base',      icon: '⬇' },
                ].map(a => (
                  <button key={a.id} onClick={() => alinhar(a.id)} title={a.title}
                    className={Z.btn2} style={{ padding: '2px 5px', fontSize: 11, borderRadius: 4 }}>
                    {a.icon}
                  </button>
                ))}
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                {/* Copy */}
                <button onClick={() => setClipboard({ ...selEl })} title="Copiar elemento (Ctrl+C)"
                  className={Z.btn2} style={{ padding: '2px 6px', fontSize: 10, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Copy size={11} />
                </button>
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700 }}>
                  {selEl.tipo === 'texto' ? 'Texto' : selEl.tipo === 'retangulo' ? 'Retângulo' : selEl.tipo === 'barcode' ? 'Barcode' : selEl.tipo === 'qrcode' ? 'QR Code' : selEl.tipo === 'imagem' ? 'Imagem' : selEl.tipo === 'minimapa' ? 'Mini-mapa' : 'Diagrama'}
                  {selEl.variavel ? ` (${selEl.variavel})` : ''}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {Math.round(selEl.x * 10) / 10}, {Math.round(selEl.y * 10) / 10} — {Math.round(selEl.w * 10) / 10}×{Math.round(selEl.h * 10) / 10}mm
                </span>
              </>
            )}
            {/* Paste button — sempre visível quando há clipboard */}
            {clipboard && (
              <>
                <div style={{ flex: 1 }} />
                <button onClick={() => addElement(clipboard.tipo, { ...clipboard, id: undefined, x: Math.min(clipboard.x + 4, canvasW - clipboard.w), y: Math.min(clipboard.y + 4, canvasH - clipboard.h), zIndex: elementos.length + 1 })}
                  title="Colar elemento (Ctrl+V)"
                  className={Z.btn2} style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--primary)', fontWeight: 600 }}>
                  📋 Colar
                </button>
              </>
            )}
          </div>

          {/* Canvas area */}
          <div
            ref={canvasContainerRef}
            style={{
              flex: 1, overflow: 'auto',
              background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20, position: 'relative',
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasW} ${canvasH}`}
              style={{
                ...canvasStyle,
                background: '#fff',
                borderRadius: 2,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)',
                cursor: dragState ? 'grabbing' : 'default',
                flexShrink: 0,
              }}
              onMouseDown={(e) => { if (e.target === svgRef.current || e.target.tagName === 'line') setSelecionado(null); }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {gridOn && <GridOverlay w={canvasW} h={canvasH} step={gridSize} />}
              {[...elementos].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map(el => (
                <ElementoSVG
                  key={el.id}
                  el={el}
                  et={previewEtiqueta}
                  cfg={etiquetaConfig}
                  isEditor={true}
                  selected={selecionado === el.id}
                  onMouseDown={handleElementDown}
                />
              ))}
              {selEl && <Handles el={selEl} onHandleDown={handleHandleDown} />}
            </svg>
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────── */}
        <div style={{
          width: 250, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
          borderLeft: '1px solid var(--border)', background: 'var(--bg-card)',
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Right panel tabs */}
          {!selEl && (
            <div style={{
              display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              {[
                { key: 'config', label: 'Etiqueta', icon: <Tag size={11} /> },
                { key: 'elementos', label: 'Elementos', icon: <Layers size={11} /> },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setRightTab(tab.key)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    padding: '7px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    border: 'none', borderBottom: '2px solid',
                    borderBottomColor: rightTab === tab.key ? 'var(--primary)' : 'transparent',
                    color: rightTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                    background: 'transparent', textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ padding: '8px 10px', flex: 1 }}>

          {/* ──── Properties (quando tem seleção) ────── */}
          {selEl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Element header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 8px', background: 'var(--bg-muted)', borderRadius: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {selEl.tipo === 'texto' ? <><Type size={12} /> Texto</> :
                   selEl.tipo === 'retangulo' ? <><Square size={12} /> Retângulo</> :
                   selEl.tipo === 'barcode' ? <><BarChart2 size={12} /> Barcode</> :
                   selEl.tipo === 'qrcode' ? <><QrCode size={12} /> QR Code</> :
                   selEl.tipo === 'imagem' ? <><Image size={12} /> Imagem</> :
                   selEl.tipo === 'minimapa' ? <><Map size={12} /> Mini-mapa</> :
                   <><Layers size={12} /> Diagrama</>}
                </span>
                <button onClick={() => deleteEl(selEl.id)}
                  style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', borderRadius: 4 }}
                  title="Excluir (Delete)">
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Posição & Tamanho */}
              <SH icon={<Move size={10} />}>Posição & Tamanho</SH>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {propInput('X (mm)', 'x', 'number', { step: 0.5, min: 0 })}
                {propInput('Y (mm)', 'y', 'number', { step: 0.5, min: 0 })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {propInput('Largura', 'w', 'number', { step: 1, min: 2 })}
                {propInput('Altura', 'h', 'number', { step: 1, min: 2 })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                {propInput('Rotação°', 'rotacao', 'number', { step: 1, min: -360, max: 360 })}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <LBL>Camada</LBL>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className={Z.btn2} style={{ flex: 1, fontSize: 10, padding: '3px 0', borderRadius: 4 }}
                      onClick={() => updateEl(selEl.id, { zIndex: (selEl.zIndex || 0) + 1 })} title="Trazer para frente">↑</button>
                    <button className={Z.btn2} style={{ flex: 1, fontSize: 10, padding: '3px 0', borderRadius: 4 }}
                      onClick={() => updateEl(selEl.id, { zIndex: Math.max(0, (selEl.zIndex || 0) - 1) })} title="Enviar para trás">↓</button>
                  </div>
                </div>
              </div>
              {/* Rotação rápida */}
              <div style={{ display: 'flex', gap: 2 }}>
                {[0, 90, 180, 270].map(deg => (
                  <button key={deg} onClick={() => updateEl(selEl.id, { rotacao: deg })}
                    title={`Rotacionar ${deg}°`}
                    className={Z.btn2}
                    style={{ flex: 1, fontSize: 9, padding: '3px 0', borderRadius: 4, fontWeight: (selEl.rotacao || 0) === deg ? 800 : 500, background: (selEl.rotacao || 0) === deg ? 'var(--primary)' : undefined, color: (selEl.rotacao || 0) === deg ? '#fff' : undefined }}>
                    {deg}°
                  </button>
                ))}
                <button onClick={() => updateEl(selEl.id, { rotacao: ((selEl.rotacao || 0) + 90) % 360 })}
                  title="Girar +90°" className={Z.btn2} style={{ padding: '3px 6px', fontSize: 9, borderRadius: 4 }}>
                  ↻
                </button>
              </div>

              {/* ─── Comportamento (genérico para todos os tipos) ─── */}
              <Divider />
              <SH icon={<Eye size={10} />}>Comportamento</SH>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: selEl.hideIfEmpty ? 'rgba(34,197,94,0.1)' : 'transparent' }}>
                  <input type="checkbox" checked={!!selEl.hideIfEmpty}
                    onChange={e => updateEl(selEl.id, { hideIfEmpty: e.target.checked })} />
                  <span>Ocultar se vazio</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>(ex: borda_dir sem valor)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: selEl.locked ? 'rgba(239,68,68,0.1)' : 'transparent' }}>
                  <input type="checkbox" checked={!!selEl.locked}
                    onChange={e => updateEl(selEl.id, { locked: e.target.checked })} />
                  <span>Bloquear (não mover)</span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>(ex: logo, fundo)</span>
                </label>
                <div>
                  <LBL>Opacidade <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({Math.round((selEl.opacity ?? 1) * 100)}%)</span></LBL>
                  <input type="range" min={0.05} max={1} step={0.05}
                    value={selEl.opacity ?? 1}
                    onChange={e => updateEl(selEl.id, { opacity: Number(e.target.value) })}
                    style={{ width: '100%', marginTop: 2 }} />
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
                    Tip: 15-25% pra logo marca d'água. Em térmica, valores baixos viram pontilhado.
                  </div>
                </div>
              </div>

              {/* LINHA props */}
              {selEl.tipo === 'linha' && (
                <>
                  <Divider />
                  <SH icon={<Minus size={10} />}>Linha</SH>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <div>
                      <LBL>Orientação</LBL>
                      <select value={selEl.orientacao || 'horizontal'}
                        onChange={e => updateEl(selEl.id, { orientacao: e.target.value })}
                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', marginTop: 2, width: '100%' }}>
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical</option>
                      </select>
                    </div>
                    <div>
                      <LBL>Estilo</LBL>
                      <select value={selEl.estilo || 'continua'}
                        onChange={e => updateEl(selEl.id, { estilo: e.target.value })}
                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', marginTop: 2, width: '100%' }}>
                        <option value="continua">Contínua</option>
                        <option value="tracejada">Tracejada</option>
                        <option value="pontilhada">Pontilhada</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
                    {propInput('Espessura', 'espessura', 'number', { step: 0.1, min: 0.1, max: 5 })}
                    <div>
                      <LBL>Cor</LBL>
                      <input type="color" value={selEl.cor || '#333333'}
                        onChange={e => updateEl(selEl.id, { cor: e.target.value })}
                        style={{ width: '100%', height: 24, marginTop: 2, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 4 }} />
                    </div>
                  </div>
                </>
              )}

              {/* TEXT props */}
              {selEl.tipo === 'texto' && (
                <>
                  <Divider />
                  <SH icon={<Type size={10} />}>Texto & Variável</SH>
                  <select
                    value={selEl.variavel || ''}
                    onChange={e => {
                      const v = e.target.value;
                      updateEl(selEl.id, { variavel: v || null, texto: v ? `{{${v}}}` : selEl.texto });
                    }}
                    className={Z.inp}
                    style={{ fontSize: 11, padding: '4px 6px' }}
                  >
                    <option value="">— Texto estático —</option>
                    {GRUPOS_VAR.map(g => (
                      <optgroup key={g} label={g}>
                        {VARIAVEIS.filter(v => v.grupo === g).map(v => (
                          <option key={v.key} value={v.key}>{v.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div style={{ position: 'relative' }}>
                    <LBL>Conteúdo</LBL>
                    <input
                      ref={textoInputRef}
                      type="text" value={selEl.texto || ''}
                      onChange={handleTextoChange}
                      onKeyDown={handleTextoKeyDown}
                      onBlur={() => setTimeout(() => setAutoComplete(ac => ac.show ? { show: false, filter: '', cursorStart: 0, highlightIdx: 0 } : ac), 150)}
                      className={Z.inp}
                      style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}
                      placeholder="Texto ou {{variavel}}"
                    />
                    {autoComplete.show && acFiltered.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                        background: '#1e1e2e', border: '1px solid #444', borderRadius: 6,
                        maxHeight: 220, overflowY: 'auto', marginTop: 2,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}>
                        {acGrouped.map(g => (
                          <div key={g.grupo}>
                            <div style={{ padding: '4px 8px', fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #333' }}>
                              {g.grupo}
                            </div>
                            {g.items.map(v => {
                              const idx = acFiltered.indexOf(v);
                              return (
                                <div key={v.key}
                                  onMouseDown={e => { e.preventDefault(); acSelectVar(v.key); }}
                                  style={{
                                    padding: '5px 10px', cursor: 'pointer', fontSize: 11,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: idx === autoComplete.highlightIdx ? '#334' : 'transparent',
                                    color: idx === autoComplete.highlightIdx ? '#fff' : '#ccc',
                                  }}>
                                  <span><strong style={{ color: '#7cb3ff' }}>{`{{${v.key}}}`}</strong></span>
                                  <span style={{ fontSize: 10, color: '#888', marginLeft: 8 }}>{v.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Divider />
                  <SH icon={<Maximize2 size={10} />}>Comportamento no campo</SH>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 4 }}>
                    <div>
                      <LBL>Quando o texto for grande</LBL>
                      <select value={selEl.fitMode || 'overflow'}
                        onChange={e => updateEl(selEl.id, { fitMode: e.target.value })}
                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', marginTop: 2, width: '100%' }}>
                        <option value="overflow">Livre</option>
                        <option value="shrink">Reduzir fonte</option>
                        <option value="ellipsis">Cortar com reticências</option>
                        <option value="wrap">Quebrar linha</option>
                      </select>
                    </div>
                    <div>
                      <LBL>Linhas</LBL>
                      <input type="number" value={selEl.maxLines || 2}
                        onChange={e => updateEl(selEl.id, { maxLines: Number(e.target.value) })}
                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', marginTop: 2, width: '100%' }}
                        min={1} max={5} disabled={(selEl.fitMode || 'overflow') !== 'wrap'} />
                    </div>
                  </div>
                  <Divider />
                  <SH icon={<Palette size={10} />}>Tipografia</SH>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {propInput('Tamanho (mm)', 'fontSize', 'number', { step: 0.5, min: 1, max: 15 })}
                    <div>
                      <LBL>Peso</LBL>
                      <select value={selEl.fontWeight || 400}
                        onChange={e => updateEl(selEl.id, { fontWeight: Number(e.target.value) })}
                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', marginTop: 2, width: '100%' }}>
                        <option value={400}>Normal</option>
                        <option value={600}>Semi-bold</option>
                        <option value={700}>Bold</option>
                        <option value={800}>Extra-bold</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <LBL>Família</LBL>
                    <select value={selEl.fontFamily || 'Inter, sans-serif'}
                      onChange={e => updateEl(selEl.id, { fontFamily: e.target.value })}
                      className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', marginTop: 2, width: '100%' }}>
                      <option value="Inter, sans-serif">Inter (padrão)</option>
                      <option value="monospace">Monospace</option>
                      <option value="serif">Serif</option>
                      <option value="Arial, sans-serif">Arial</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <div>
                      <LBL>Cor</LBL>
                      <input type="color" value={selEl.cor || '#000000'}
                        onChange={e => updateEl(selEl.id, { cor: e.target.value })}
                        style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                    </div>
                    <div>
                      <LBL>Alinhamento</LBL>
                      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                        {[
                          { val: 'start', icon: <AlignLeft size={12} /> },
                          { val: 'middle', icon: <AlignCenter size={12} /> },
                          { val: 'end', icon: <AlignRight size={12} /> },
                        ].map(({ val, icon }) => (
                          <button key={val} className={Z.btn2}
                            style={{
                              flex: 1, padding: '4px 0', borderRadius: 5, display: 'flex', justifyContent: 'center',
                              background: selEl.alinhamento === val ? 'var(--primary)' : undefined,
                              color: selEl.alinhamento === val ? '#fff' : undefined,
                            }}
                            onClick={() => updateEl(selEl.id, { alinhamento: val })}>
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* RECTANGLE props */}
              {selEl.tipo === 'retangulo' && (
                <>
                  <Divider />
                  <SH icon={<Palette size={10} />}>Aparência</SH>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <div>
                      <LBL>Preenchimento</LBL>
                      <input type="color"
                        value={selEl.preenchimento === 'none' ? '#ffffff' : (selEl.preenchimento || '#ffffff')}
                        onChange={e => updateEl(selEl.id, { preenchimento: e.target.value })}
                        style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                    </div>
                    <div>
                      <LBL>Contorno</LBL>
                      <input type="color" value={selEl.bordaCor || '#000000'}
                        onChange={e => updateEl(selEl.id, { bordaCor: e.target.value })}
                        style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                    </div>
                  </div>
                  <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selEl.preenchimento === 'none'}
                      onChange={e => updateEl(selEl.id, { preenchimento: e.target.checked ? 'none' : '#ffffff' })} />
                    Sem preenchimento
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {propInput('Espessura', 'bordaLargura', 'number', { step: 0.1, min: 0, max: 3 })}
                    {propInput('Raio', 'raio', 'number', { step: 0.5, min: 0, max: 10 })}
                  </div>
                </>
              )}

              {/* BARCODE props */}
              {selEl.tipo === 'barcode' && (
                <>
                  <Divider />
                  <SH icon={<BarChart2 size={10} />}>Código de Barras</SH>
                  <div>
                    <LBL>Variável</LBL>
                    <select value={selEl.barcodeVariavel || 'controle'}
                      onChange={e => updateEl(selEl.id, { barcodeVariavel: e.target.value })}
                      className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}>
                      {VARIAVEIS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* QR CODE props */}
              {selEl.tipo === 'qrcode' && (
                <>
                  <Divider />
                  <SH icon={<QrCode size={10} />}>QR Code</SH>
                  <div>
                    <LBL>Variável</LBL>
                    <select value={selEl.barcodeVariavel || 'controle'}
                      onChange={e => updateEl(selEl.id, { barcodeVariavel: e.target.value })}
                      className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}>
                      {VARIAVEIS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <LBL>Cor</LBL>
                    <input type="color" value={selEl.cor || '#000000'}
                      onChange={e => updateEl(selEl.id, { cor: e.target.value })}
                      style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                  </div>
                </>
              )}

              {/* DIAGRAMA props */}
              {selEl.tipo === 'diagrama_bordas' && (
                <>
                  <Divider />
                  <SH icon={<Palette size={10} />}>Diagrama de Bordas</SH>
                  <div>
                    <LBL>Cor fitas ativas</LBL>
                    <input type="color" value={selEl.diagramaCor || 'var(--success)'}
                      onChange={e => updateEl(selEl.id, { diagramaCor: e.target.value })}
                      style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                  </div>
                </>
              )}

              {/* IMAGEM props */}
              {selEl.tipo === 'imagem' && (
                <>
                  <Divider />
                  <SH icon={<Image size={10} />}>Imagem / Logo</SH>
                  <div>
                    <LBL>URL da Imagem</LBL>
                    <input type="text" value={selEl.imagemUrl || ''}
                      onChange={e => updateEl(selEl.id, { imagemUrl: e.target.value })}
                      className={Z.inp}
                      style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}
                      placeholder="https://... ou {{logo_empresa}}" />
                  </div>
                  <button className={Z.btn2}
                    style={{ fontSize: 10, padding: '5px 8px', marginTop: 2, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    onClick={() => updateEl(selEl.id, { imagemUrl: '{{logo_empresa}}' })}>
                    <Image size={11} /> Usar Logo da Empresa
                  </button>
                  <div style={{ marginTop: 4 }}>
                    <LBL>Modo de ajuste</LBL>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {[{ val: 'contain', label: 'Contain' }, { val: 'cover', label: 'Cover' }].map(({ val, label }) => (
                        <button key={val} className={Z.btn2}
                          style={{
                            flex: 1, padding: '4px 0', fontSize: 10, borderRadius: 5,
                            background: (selEl.imagemFit || 'contain') === val ? 'var(--primary)' : undefined,
                            color: (selEl.imagemFit || 'contain') === val ? '#fff' : undefined,
                          }}
                          onClick={() => updateEl(selEl.id, { imagemFit: val })}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* MINIMAPA props */}
              {selEl.tipo === 'minimapa' && (
                <>
                  <Divider />
                  <SH icon={<Map size={10} />}>Mini-mapa da Chapa</SH>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <div>
                      <LBL>Peca destacada</LBL>
                      <input type="color" value={selEl.corPeca || '#e74c3c'}
                        onChange={e => updateEl(selEl.id, { corPeca: e.target.value })}
                        style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                    </div>
                    <div>
                      <LBL>Outras pecas</LBL>
                      <input type="color" value={selEl.corOutras || '#dddddd'}
                        onChange={e => updateEl(selEl.id, { corOutras: e.target.value })}
                        style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                    </div>
                    <div>
                      <LBL>Fundo</LBL>
                      <input type="color" value={selEl.corFundo || '#ffffff'}
                        onChange={e => updateEl(selEl.id, { corFundo: e.target.value })}
                        style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                    </div>
                    <div>
                      <LBL>Borda</LBL>
                      <input type="color" value={selEl.corBorda || '#333333'}
                        onChange={e => updateEl(selEl.id, { corBorda: e.target.value })}
                        style={{ width: '100%', height: 28, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', marginTop: 2 }} />
                    </div>
                  </div>
                </>
              )}

              {/* Duplicate button */}
              <Divider />
              <button className={Z.btn2}
                style={{ fontSize: 10, width: '100%', padding: '6px 0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                onClick={() => addElement(selEl.tipo, { ...selEl, id: undefined, x: selEl.x + 3, y: selEl.y + 3, zIndex: elementos.length + 1 })}>
                <Copy size={11} /> Duplicar Elemento (Ctrl+D)
              </button>
            </div>

          ) : rightTab === 'config' ? (
            /* ──── Config da etiqueta ──────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

              {/* Tamanho */}
              <SH icon={<Maximize2 size={10} />}>Tamanho da Etiqueta</SH>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                {[
                  { w: 100, h: 70, label: '100×70' },
                  { w: 100, h: 50, label: '100×50' },
                  { w: 90, h: 60, label: '90×60' },
                  { w: 80, h: 50, label: '80×50' },
                  { w: 70, h: 40, label: '70×40' },
                  { w: 105, h: 74, label: 'A7' },
                ].map(p => (
                  <Pill key={p.label} active={canvasW === p.w && canvasH === p.h}
                    onClick={() => { setTmpl('largura', p.w); setTmpl('altura', p.h); requestAnimationFrame(autoZoom); }}>
                    {p.label}
                  </Pill>
                ))}
              </div>
              <Divider />

              {/* Template presets */}
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Templates Prontos</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <button className={Z.btn2} style={{ fontSize: 10, padding: '4px 8px' }}
                    onClick={() => applyTemplate('padrao')}>
                    Padrao
                  </button>
                  <button className={Z.btn2} style={{ fontSize: 10, padding: '4px 8px' }}
                    onClick={() => applyTemplate('compacta')}>
                    Compacta
                  </button>
                  <button className={Z.btn2} style={{ fontSize: 10, padding: '4px 8px' }}
                    onClick={() => applyTemplate('completa')}>
                    Completa + Mapa
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                <div>
                  <LBL>Largura (mm)</LBL>
                  <input type="number" value={canvasW}
                    onChange={e => setTmpl('largura', Math.max(20, Number(e.target.value)))}
                    className={Z.inp} style={{ fontSize: 12, padding: '5px 8px', width: '100%', marginTop: 2, fontWeight: 700 }}
                    step={1} min={20} max={300} />
                </div>
                <div>
                  <LBL>Altura (mm)</LBL>
                  <input type="number" value={canvasH}
                    onChange={e => setTmpl('altura', Math.max(15, Number(e.target.value)))}
                    className={Z.inp} style={{ fontSize: 12, padding: '5px 8px', width: '100%', marginTop: 2, fontWeight: 700 }}
                    step={1} min={15} max={300} />
                </div>
              </div>

              <Divider />

              {/* Impressão */}
              <SH icon={<Grid3X3 size={10} />}>Impressão</SH>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                <div>
                  <LBL>Colunas</LBL>
                  <input type="number" value={template?.colunas_impressao || 2}
                    onChange={e => setTmpl('colunas_impressao', Number(e.target.value))}
                    className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2, fontWeight: 600 }}
                    min={1} max={4} />
                </div>
                <div>
                  <LBL>Margem</LBL>
                  <input type="number" value={template?.margem_pagina || 8}
                    onChange={e => setTmpl('margem_pagina', Number(e.target.value))}
                    className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}
                    min={0} max={25} />
                </div>
                <div>
                  <LBL>Gap</LBL>
                  <input type="number" value={template?.gap_etiquetas || 4}
                    onChange={e => setTmpl('gap_etiquetas', Number(e.target.value))}
                    className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}
                    min={0} max={20} />
                </div>
              </div>

              {/* Calibração da impressora — corrige deslocamento físico
                  da térmica (L42 Pro etc). Aplicado só no print real,
                  não no editor (origem 0,0 sempre). */}
              <SH icon={<Move size={10} />}>Calibração da impressora</SH>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
                <div>
                  <LBL>Offset X (mm)</LBL>
                  <input type="number" value={template?.offset_x ?? 0}
                    onChange={e => setTmpl('offset_x', Number(e.target.value))}
                    className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}
                    step={0.1} min={-10} max={10} />
                </div>
                <div>
                  <LBL>Offset Y (mm)</LBL>
                  <input type="number" value={template?.offset_y ?? 0}
                    onChange={e => setTmpl('offset_y', Number(e.target.value))}
                    className={Z.inp} style={{ fontSize: 11, padding: '4px 6px', width: '100%', marginTop: 2 }}
                    step={0.1} min={-10} max={10} />
                </div>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.3 }}>
                Se a impressão sair deslocada, ajuste aqui e teste. Valores positivos empurram conteúdo
                pra direita/baixo. Aplicado só no print, editor mostra origem 0,0.
              </div>

              <Divider />

              {/* Backup / portabilidade — exportar template como JSON pra versionar
                  ou importar entre instalações */}
              <SH icon={<Save size={10} />}>Backup do Template</SH>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
                <button className={Z.btn2} style={{ fontSize: 10, padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  onClick={() => {
                    if (!template) return;
                    const exportData = {
                      _format: 'ornato-etiqueta-v1',
                      nome: template.nome,
                      largura: template.largura,
                      altura: template.altura,
                      colunas_impressao: template.colunas_impressao,
                      margem_pagina: template.margem_pagina,
                      gap_etiquetas: template.gap_etiquetas,
                      offset_x: template.offset_x ?? 0,
                      offset_y: template.offset_y ?? 0,
                      elementos,
                      exported_at: new Date().toISOString(),
                    };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `etiqueta_${template.nome.replace(/[^a-z0-9]/gi, '_')}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    notify?.('Template exportado', 'success');
                  }}>
                  <ArrowLeft size={11} style={{ transform: 'rotate(-90deg)' }} /> Exportar JSON
                </button>
                <label className={Z.btn2} style={{ fontSize: 10, padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                  <ArrowLeft size={11} style={{ transform: 'rotate(90deg)' }} /> Importar JSON
                  <input type="file" accept="application/json,.json" style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        if (data._format !== 'ornato-etiqueta-v1') {
                          notify?.('Arquivo não é um template Ornato válido', 'error');
                          return;
                        }
                        if (!Array.isArray(data.elementos)) {
                          notify?.('Template sem elementos válidos', 'error');
                          return;
                        }
                        // Cria novo template a partir do JSON
                        const resp = await api.post('/cnc/etiqueta-templates', {
                          nome: (data.nome || 'Importado') + ' (importado)',
                          largura: data.largura || 100,
                          altura: data.altura || 70,
                          colunas_impressao: data.colunas_impressao || 2,
                          margem_pagina: data.margem_pagina || 8,
                          gap_etiquetas: data.gap_etiquetas || 4,
                          offset_x: data.offset_x || 0,
                          offset_y: data.offset_y || 0,
                          elementos: data.elementos.map(el => ({ ...el, id: uid() })), // regenera IDs
                        });
                        const newId = resp.id || resp.data?.id;
                        notify?.('Template importado!', 'success');
                        await loadTemplates();
                        if (newId) loadTemplate(newId);
                      } catch (err) {
                        console.error(err);
                        notify?.('Erro ao importar: arquivo inválido', 'error');
                      }
                      e.target.value = ''; // reset input
                    }} />
                </label>
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.3 }}>
                Backup ou compartilhamento entre instalações. Exporta tudo: dimensões,
                elementos, calibração, configuração de impressão.
              </div>

              <Divider />

              {/* Atalhos */}
              <SH icon={<MousePointer size={10} />}>Atalhos</SH>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.9, paddingLeft: 2 }}>
                {[
                  ['Clique', 'selecionar elemento'],
                  ['Arrastar', 'mover elemento'],
                  ['Handles', 'redimensionar'],
                  ['Delete', 'remover selecionado'],
                  ['Ctrl+C', 'copiar elemento'],
                  ['Ctrl+V', 'colar elemento'],
                  ['Ctrl+D', 'duplicar no lugar'],
                  ['Ctrl+Z/Y', 'desfazer/refazer'],
                  ['Setas', 'mover 1mm (Shift: 5mm)'],
                  ['⬅↔➡⬆↕⬇', 'alinhar ao canvas'],
                  ['Esc', 'deselecionar'],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 60 }}>{key}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>

          ) : (
            /* ──── Painel de Camadas (drag para reordenar zIndex) ──────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <SH icon={<Layers size={10} />}>Camadas ({elementos.length})</SH>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6, padding: '2px 4px' }}>
                Arraste pra reordenar · Topo da lista = camada superior
              </div>
              {elementos.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  Nenhum elemento.<br />Use os botões à esquerda para adicionar.
                </div>
              ) : (
                [...elementos].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)).map((el, idx, arr) => {
                  const elIcon = el.tipo === 'texto' ? <Type size={11} /> :
                    el.tipo === 'retangulo' ? <Square size={11} /> :
                    el.tipo === 'linha' ? <Minus size={11} /> :
                    el.tipo === 'barcode' ? <BarChart2 size={11} /> :
                    el.tipo === 'qrcode' ? <QrCode size={11} /> :
                    el.tipo === 'imagem' ? <Image size={11} /> :
                    el.tipo === 'minimapa' ? <Map size={11} /> :
                    <Layers size={11} />;
                  return (
                    <div
                      key={el.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('text/elId', el.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={e => {
                        e.preventDefault();
                        const draggedId = e.dataTransfer.getData('text/elId');
                        if (!draggedId || draggedId === el.id) return;
                        // Reordena pelo zIndex visual: pega zIndex do alvo e insere o arrastado nessa posição
                        const sorted = [...elementos].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
                        const targetIdx = sorted.findIndex(x => x.id === el.id);
                        const dragged = sorted.find(x => x.id === draggedId);
                        if (!dragged || targetIdx < 0) return;
                        const without = sorted.filter(x => x.id !== draggedId);
                        without.splice(targetIdx, 0, dragged);
                        // Reatribui zIndex do topo (n-1) pro fundo (0)
                        const next = elementos.map(orig => {
                            const newOrder = without.findIndex(x => x.id === orig.id);
                            return { ...orig, zIndex: newOrder >= 0 ? without.length - 1 - newOrder : (orig.zIndex || 0) };
                        });
                        setElementos(next);
                        pushHistory(next);
                        setDirty(true);
                      }}
                      onClick={() => setSelecionado(el.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', borderRadius: 6, cursor: 'grab',
                        background: selecionado === el.id ? 'var(--bg-hover)' : 'transparent',
                        border: '1px solid',
                        borderColor: selecionado === el.id ? 'var(--primary)' : 'transparent',
                        transition: 'all .1s',
                        opacity: el.opacity != null && el.opacity < 1 ? 0.7 : 1,
                      }}
                      onMouseEnter={e => { if (selecionado !== el.id) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                      onMouseLeave={e => { if (selecionado !== el.id) e.currentTarget.style.background = 'transparent'; }}
                      title={`${el.tipo} · zIndex ${el.zIndex || 0}${el.locked ? ' · BLOQUEADO' : ''}${el.hideIfEmpty ? ' · oculta se vazio' : ''}`}
                    >
                      <span style={{ color: 'var(--text-muted)', cursor: 'grab', fontSize: 11, lineHeight: 1 }}>⋮⋮</span>
                      {elIcon}
                      <span style={{ fontSize: 10, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {el.variavel || el.texto?.replace(/\{\{|\}\}/g, '') || el.tipo}
                      </span>
                      {el.hideIfEmpty && (
                        <span title="Oculta se vazio" style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(34,197,94,0.15)', color: '#16a34a', fontWeight: 700 }}>∅</span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); updateEl(el.id, { locked: !el.locked }); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: el.locked ? '#dc2626' : 'var(--text-muted)', borderRadius: 3 }}
                        title={el.locked ? 'Bloqueado — clique pra desbloquear' : 'Bloquear elemento'}>
                        {el.locked ? <Lock size={11} /> : <Unlock size={11} />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteEl(el.id); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)', borderRadius: 3 }}
                        title="Excluir">
                        <X size={11} />
                      </button>
                    </div>
                  );
                })
              )}

              {/* ── Painel de validação de variáveis ── */}
              {elementos.length > 0 && (
                <>
                  <Divider />
                  <SH icon={<Tag size={10} />}>Variáveis Utilizadas</SH>
                  {variaveisUsadas.invalidas.length > 0 && (
                    <div style={{ padding: '6px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#dc2626', marginBottom: 4, textTransform: 'uppercase' }}>
                        Variáveis inválidas
                      </div>
                      {variaveisUsadas.invalidas.map(k => (
                        <div key={k} style={{ fontSize: 10, color: '#991b1b', fontFamily: 'monospace', padding: '1px 0' }}>
                          {`{{${k}}}`} — não existe
                        </div>
                      ))}
                    </div>
                  )}
                  {variaveisUsadas.usadas.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {variaveisUsadas.usadas.map(k => {
                        const v = VARIAVEIS.find(v => v.key === k);
                        return (
                          <span key={k} title={v?.exemplo ? `Ex: ${v.exemplo}` : ''} style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 10,
                            background: 'rgba(var(--primary-rgb),0.1)',
                            color: 'var(--primary)', fontWeight: 600, fontFamily: 'monospace',
                          }}>
                            {k}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {variaveisUsadas.usadas.length === 0 && variaveisUsadas.invalidas.length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>
                      Nenhuma variável dinâmica em uso.
                    </div>
                  )}

                  <Divider />
                  <SH icon={<MousePointer size={10} />}>Validação do Template</SH>
                  {templateChecks.length === 0 ? (
                    <div style={{ padding: '6px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 10, color: '#166534', fontWeight: 700 }}>
                      Nenhum risco visual detectado.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {templateChecks.slice(0, 8).map((c, i) => (
                        <div key={i} style={{
                          padding: '5px 7px',
                          borderRadius: 6,
                          border: '1px solid',
                          borderColor: c.tipo === 'erro' ? '#fecaca' : c.tipo === 'aviso' ? '#fde68a' : '#dbeafe',
                          background: c.tipo === 'erro' ? '#fef2f2' : c.tipo === 'aviso' ? '#fffbeb' : '#eff6ff',
                          color: c.tipo === 'erro' ? '#991b1b' : c.tipo === 'aviso' ? '#92400e' : '#1d4ed8',
                          fontSize: 10,
                          lineHeight: 1.35,
                        }}>
                          <b>{c.tipo === 'erro' ? 'Erro' : c.tipo === 'aviso' ? 'Aviso' : 'Info'}:</b> {c.msg}
                        </div>
                      ))}
                      {templateChecks.length > 8 && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          +{templateChecks.length - 8} outro(s) ponto(s)
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* ══ Save As Modal ═══════════════════════════════ */}
      {showNomeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowNomeModal(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, minWidth: 380, boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Salvar Como...</h3>
            <input type="text" value={nomeEditar} onChange={e => setNomeEditar(e.target.value)}
              className={Z.inp} style={{ width: '100%', marginBottom: 12, fontSize: 13, padding: '8px 10px' }}
              placeholder="Nome do template" autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && nomeEditar.trim()) salvarComo(nomeEditar.trim()); }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className={Z.btn2} onClick={() => setShowNomeModal(false)}>Cancelar</button>
              <button className={Z.btn} onClick={() => nomeEditar.trim() && salvarComo(nomeEditar.trim())}>Criar Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// EtiquetaSVG — Renderiza uma etiqueta com dados reais
// (usado no preview e impressão)
// ═══════════════════════════════════════════════════════

export function EtiquetaSVG({ template, etiqueta, cfg, width, applyOffset = false }) {
  if (!template || !template.elementos) return null;
  // Offset de calibração só aplicado em impressão real (applyOffset=true).
  // No editor/preview o offset fica zerado pra UX consistente.
  const ox = applyOffset ? Number(template.offset_x) || 0 : 0;
  const oy = applyOffset ? Number(template.offset_y) || 0 : 0;
  const sortedEls = [...template.elementos].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  return (
    <svg
      viewBox={`0 0 ${template.largura} ${template.altura}`}
      width={width || template.largura * 5}
      height={width ? (width / template.largura) * template.altura : template.altura * 5}
      style={{ background: '#fff', borderRadius: 2 }}
    >
      <g transform={ox || oy ? `translate(${ox} ${oy})` : undefined}>
        {sortedEls.map(el => (
          <ElementoSVG key={el.id} el={el} et={etiqueta} cfg={cfg} isEditor={false} selected={false} />
        ))}
      </g>
    </svg>
  );
}

// Export constants for use in TabEtiquetas
export { VARIAVEIS, resolverVariavel, resolverTexto };
