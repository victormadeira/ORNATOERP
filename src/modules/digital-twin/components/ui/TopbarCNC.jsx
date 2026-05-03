// @ts-check
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useCNCStore } from '../../store/useCNCStore.js';
import { useScan } from '../scanner/useScan.js';

const TAB_DEFS = [
  { id: 'render',  label: '3D',      icon: '◩' },
  { id: 'gcode',   label: 'G-Code',  icon: '{}' },
  { id: 'nesting', label: 'Nesting', icon: '▦' },
  { id: 'scan',    label: 'Scan',    icon: '⊡' },
];

/**
 * Topbar com branding, tabs, input de scan e botão de fechar.
 * @param {{ onClose?: () => void }} props
 */
export function TopbarCNC({ onClose }) {
  const activeTab = useCNCStore((s) => s.activeTab);
  const setActiveTab = useCNCStore((s) => s.setActiveTab);
  const { onScan } = useScan();
  const [code, setCode] = useState('');

  /** @param {React.FormEvent} e */
  const submitScan = (e) => {
    e.preventDefault();
    const v = code.trim();
    if (!v) return;
    onScan(v);
    setCode('');
  };

  return (
    <header className="dt-topbar">
      <div className="dt-brand">
        <div className="dt-brand-chip" aria-hidden="true">DT</div>
        <div>
          <div className="dt-brand-title">Digital Twin</div>
          <div className="dt-brand-sub">CNC · Ornato</div>
        </div>
      </div>

      <nav className="dt-tabs" role="tablist" aria-label="Seções do Digital Twin">
        {TAB_DEFS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`dt-tab ${activeTab === t.id ? 'dt-tab-active' : ''}`}
            onClick={() => setActiveTab(/** @type {any} */ (t.id))}
          >
            <span aria-hidden="true" className="dt-mono" style={{ fontSize: 11 }}>{t.icon}</span>
            <span className="dt-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="dt-topbar-right">
        <form className="dt-scan-wrap" onSubmit={submitScan} role="search">
          <input
            className="dt-scan-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Escanear ou digitar código"
            aria-label="Código da peça"
            autoComplete="off"
          />
          <button type="submit" className="dt-scan-btn">Buscar</button>
        </form>
        {onClose && (
          <button
            type="button"
            className="dt-icon-btn dt-icon-btn-danger"
            aria-label="Fechar Digital Twin"
            onClick={onClose}
            title="Fechar (ESC)"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
