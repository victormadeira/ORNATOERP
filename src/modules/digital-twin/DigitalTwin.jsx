// @ts-check
import React, { useEffect, useMemo, useState } from 'react';
import './digital-twin.css';

import { useCNCStore } from './store/useCNCStore.js';
import { apiListPieces, apiGCode, apiNesting } from './api.js';

import { TopbarCNC } from './components/ui/TopbarCNC.jsx';
import { SidebarLeft } from './components/ui/SidebarLeft.jsx';
import { SidebarRight } from './components/ui/SidebarRight.jsx';
import { PieceBadge } from './components/ui/PieceBadge.jsx';
import { LayerToggle } from './components/ui/LayerToggle.jsx';

import { PieceViewer } from './components/3d/PieceViewer.jsx';
import { QRScanner } from './components/scanner/QRScanner.jsx';
import { useScan } from './components/scanner/useScan.js';

import { NestingCanvas } from './components/nesting/NestingCanvas.jsx';
import { NestingStats } from './components/nesting/NestingStats.jsx';

/**
 * Digital Twin CNC — módulo único com 4 tabs.
 * Substitui as páginas ProducaoCNC, PlanoCorte, ScanPeca3D, Industrializacao (partes 3D).
 *
 * @param {{ notify?: (msg: string, type?: string) => void, nav?: (page: string) => void }} props
 */
export default function DigitalTwin({ notify, nav }) {
  const activeTab = useCNCStore((s) => s.activeTab);
  const activePiece = useCNCStore((s) => s.activePiece);
  const gcodeText = useCNCStore((s) => s.gcodeText);
  const layers = useCNCStore((s) => s.layers);
  const error = useCNCStore((s) => s.error);
  const pieces = useCNCStore((s) => s.pieces);
  const setPieces = useCNCStore((s) => s.setPieces);
  const setPiece = useCNCStore((s) => s.setPiece);
  const setGCode = useCNCStore((s) => s.setGCode);
  const setActiveTab = useCNCStore((s) => s.setActiveTab);
  const setLoading = useCNCStore((s) => s.setLoading);

  const { onScan } = useScan();

  // Carrega peças do backend ao montar (fallback: mocks)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiListPieces()
      .then(({ pieces: list, source }) => {
        if (cancelled) return;
        setPieces(list, source);
        if (list.length > 0 && !useCNCStore.getState().activePiece) {
          const first = list[0];
          setPiece(first);
          apiGCode(first.id)
            .then(({ gcode }) => { if (!cancelled) setGCode(gcode); })
            .catch(() => { /* noop */ });
        }
      })
      .catch((err) => {
        console.error('[DigitalTwin] load pieces failed', err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC fecha
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape' && nav) nav('dash');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  // Toast simples pra erros vindos do store
  useEffect(() => {
    if (error && notify) notify(error, 'error');
  }, [error, notify]);

  const handleClose = () => { if (nav) nav('dash'); };

  return (
    <div className="dt-shell">
      <TopbarCNC onClose={nav ? handleClose : undefined} />
      <SidebarLeft />
      <main className="dt-main">
        <MainContent
          activeTab={activeTab}
          activePiece={activePiece}
          gcodeText={gcodeText}
          layers={layers}
          pieces={pieces}
          onScan={onScan}
          onCloseScan={() => setActiveTab('render')}
        />
      </main>
      <SidebarRight />
    </div>
  );
}

/**
 * @param {{
 *   activeTab: string,
 *   activePiece: any | null,
 *   gcodeText: string | null,
 *   layers: any,
 *   pieces: any[],
 *   onScan: (code: string) => any,
 *   onCloseScan: () => void,
 * }} props
 */
function MainContent({ activeTab, activePiece, gcodeText, layers, pieces, onScan, onCloseScan }) {
  // --- RENDER TAB ---
  if (activeTab === 'render') {
    if (!activePiece) return <EmptyState label="Selecione uma peça para visualizar em 3D" />;
    return (
      <>
        <div className="dt-canvas-wrap">
          <PieceViewer
            piece={activePiece}
            gcodeText={layers.gcode ? gcodeText : null}
            layers={layers}
          />
        </div>
        <PieceBadge piece={activePiece} />
        <LayerToggle />
      </>
    );
  }

  // --- G-CODE TAB ---
  if (activeTab === 'gcode') {
    if (!activePiece) return <EmptyState label="Selecione uma peça para ver o G-Code" />;
    return <GCodeView piece={activePiece} gcodeText={gcodeText} />;
  }

  // --- NESTING TAB ---
  if (activeTab === 'nesting') {
    return <NestingView pieces={pieces} />;
  }

  // --- SCAN TAB ---
  if (activeTab === 'scan') {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: '20px 0' }}>
        <QRScanner onScan={onScan} onClose={onCloseScan} />
      </div>
    );
  }

  return <EmptyState label="Tab inválida" />;
}

/**
 * @param {{ label: string }} props
 */
function EmptyState({ label }) {
  return (
    <div className="dt-empty">
      <div className="dt-empty-icon" aria-hidden="true">◩</div>
      <div className="dt-empty-title">Digital Twin pronto</div>
      <div className="dt-empty-sub">{label}</div>
    </div>
  );
}

/**
 * Editor read-only de G-Code com highlight básico.
 * @param {{ piece: any, gcodeText: string | null }} props
 */
function GCodeView({ piece, gcodeText }) {
  const [copied, setCopied] = useState(false);

  if (!gcodeText) {
    return (
      <div className="dt-empty">
        <div className="dt-empty-icon" aria-hidden="true">{'{ }'}</div>
        <div className="dt-empty-title">G-Code não disponível</div>
        <div className="dt-empty-sub">A peça {piece.id} não tem programa associado.</div>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(gcodeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  const lines = gcodeText.split(/\r?\n/);

  return (
    <div style={{ position: 'absolute', inset: 16, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PieceBadge piece={piece} />
        <button type="button" className="dt-scan-btn" onClick={copy} style={{ marginLeft: 'auto' }}>
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
      <pre
        className="dt-mono"
        style={{
          flex: 1,
          margin: 0,
          padding: 16,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'auto',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--text-primary)',
        }}
      >
        {lines.map((ln, i) => (
          <GCodeLine key={i} n={i + 1} line={ln} />
        ))}
      </pre>
    </div>
  );
}

/** @param {{ n: number, line: string }} props */
function GCodeLine({ n, line }) {
  const trimmed = line.trim();
  let color = 'var(--text-primary)';
  if (/^\(/.test(trimmed)) color = 'var(--text-muted)';
  else if (/^G0\b/.test(trimmed.toUpperCase())) color = 'var(--dt-g0, #E0513F)';
  else if (/^G1\b/.test(trimmed.toUpperCase())) color = 'var(--dt-g1, #2E7FD6)';
  else if (/^G[23]\b/.test(trimmed.toUpperCase())) color = 'var(--dt-g2, #3D9B47)';
  else if (/^M\d+/.test(trimmed.toUpperCase())) color = 'var(--text-muted)';

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 34, textAlign: 'right', userSelect: 'none' }}>
        {n}
      </span>
      <span style={{ color }}>{line || '\u00a0'}</span>
    </div>
  );
}

/**
 * Nesting view: busca resultado no backend, fallback client-side.
 * @param {{ pieces: any[] }} props
 */
function NestingView({ pieces }) {
  const [result, setResult] = useState(/** @type {any|null} */ (null));
  const [loading, setLoading] = useState(false);

  const nestingInput = useMemo(() => pieces.map((p) => ({
    pieceId: p.id,
    width: p.width,
    height: p.height,
    quantity: 1,
    allowRotation: true,
    material: p.material,
  })), [pieces]);

  useEffect(() => {
    if (nestingInput.length === 0) return;
    let cancelled = false;
    setLoading(true);
    apiNesting(nestingInput)
      .then(({ result: r }) => { if (!cancelled) setResult(r); })
      .catch((err) => { console.error('[nesting]', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nestingInput]);

  if (loading && !result) {
    return (
      <div className="dt-nest-wrap">
        <div className="dt-skeleton" style={{ width: '92%', maxWidth: 1100, aspectRatio: '2750 / 1840' }} />
      </div>
    );
  }

  if (!result) {
    return <EmptyState label="Sem peças para otimizar" />;
  }

  return (
    <>
      <div className="dt-nest-controls">
        <NestingStats result={result} />
      </div>
      <div className="dt-nest-wrap">
        {Array.from({ length: result.sheetsUsed }, (_, i) => (
          <div key={i} className="dt-nest-sheet-wrap">
            <div
              className="dt-nest-sheet"
              style={{
                width: 'min(92%, 1100px)',
                aspectRatio: `${result.config.sheetWidth} / ${result.config.sheetHeight}`,
              }}
            >
              <NestingCanvas
                sheetIndex={i}
                placed={result.placed}
                pieces={nestingInput}
                config={result.config}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
