import { useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, Search, X } from 'lucide-react';
import './QuickFurniturePicker.css';

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const isTall = name => /\b(alta|alto|torre|roupeiro)\b/.test(normalize(name));
const boxDefaults = box => ({ l: 600, a: isTall(box.nome) ? 2100 : 720, p: 550 });
const dimensionsLabel = dims => `${dims.l} × ${dims.a} × ${dims.p} mm`;
const presetOrder = ['balcao2', 'gaveteiro3', 'aereo2', 'pia2', 'balcao1', 'aereo1', 'nicho'];

function presetLabel(preset) {
    if (!preset.family) return preset.label || 'Móvel pronto';
    if (preset.drawers) return `${preset.family} · ${preset.drawers} ${preset.drawers === 1 ? 'gaveta' : 'gavetas'}`;
    if (preset.doors) return `${preset.family} · ${preset.doors} ${preset.doors === 1 ? 'porta' : 'portas'}`;
    return preset.family;
}

function FurnitureGlyph({ preset, name }) {
    const tall = !preset && isTall(name);
    const drawers = preset?.drawers || /gavet/.test(normalize(name));
    const sink = /\bpia\b/.test(normalize(preset?.family || name));
    const doors = preset?.doors || 0;
    return <svg className="qfp-glyph" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <rect x={tall ? 16 : 6} y={tall ? 4 : 13} width={tall ? 24 : 44} height={tall ? 46 : 34} rx="2" />
        {tall ? <><path d="M16 27h24M35 17v5M35 33v5" /></> : drawers ? <><path d="M6 24h44M6 35h44M24 19h8M24 30h8M24 41h8" /></> : doors ? <>
            {doors > 1 && <path d="M28 14v32M23 27v7" />}
            <path d={doors > 1 ? 'M33 27v7' : 'M43 27v7'} />
        </> : <path d="M11 18h34v24H11Z" />}
        {sink && <path d="M18 13V9h20v4M27 9V5h6" />}
        {!tall && <path d="M10 47v4M46 47v4" />}
    </svg>;
}

/** Painel de seleção. Se usado em modal, o pai controla backdrop, Escape e foco. */
export default function QuickFurniturePicker({ catalog = {}, presets = [], onAddPreset, onAddBox, onClose }) {
    const titleId = useId();
    const searchId = useId();
    const [showBoxes, setShowBoxes] = useState(false);
    const [query, setQuery] = useState('');
    const availablePresets = useMemo(() => presets.filter(preset => preset.available && preset.defaultDims).sort((a, b) => {
        const aIndex = presetOrder.indexOf(a.id), bIndex = presetOrder.indexOf(b.id);
        return (aIndex < 0 ? presetOrder.length : aIndex) - (bIndex < 0 ? presetOrder.length : bIndex);
    }), [presets]);
    const boxes = useMemo(() => (catalog.caixas || []).filter(box => box?.nome), [catalog]);
    const filteredBoxes = useMemo(() => {
        const term = normalize(query);
        return boxes.filter(box => normalize(`${box.nome} ${box.cat || ''} ${box.descricao || ''}`).includes(term));
    }, [boxes, query]);

    return <section className="qfp-picker" aria-labelledby={titleId}>
        <header className="qfp-header">
            <div><h2 id={titleId}>{showBoxes ? 'Outras caixas' : 'Adicionar móvel'}</h2>
                <p>{showBoxes ? 'Escolha a caixa. Depois, personalize portas, gavetas e ferragens no móvel.' : 'Escolha um modelo pronto e ajuste as medidas no móvel.'}</p>
            </div>
            {onClose && <button className="qfp-close" type="button" aria-label="Fechar seletor de móveis" onClick={onClose}><X size={21} /></button>}
        </header>

        {showBoxes && <div className="qfp-box-tools">
            <button type="button" className="qfp-back" onClick={() => { setShowBoxes(false); setQuery(''); }}><ArrowLeft size={17} />Móveis prontos</button>
            <label className="qfp-search" htmlFor={searchId}><Search size={18} aria-hidden="true" /><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar caixa pelo nome…" aria-label="Buscar caixas do catálogo" /></label>
        </div>}

        <div className="qfp-content">
            <div className="qfp-options" aria-label={showBoxes ? 'Caixas do catálogo' : 'Modelos prontos'}>
                {showBoxes ? filteredBoxes.map((box, index) => {
                    const dims = boxDefaults(box);
                    return <button type="button" className="qfp-option" key={box.db_id ?? box.id ?? `${box.nome}-${index}`} onClick={() => onAddBox(box, dims)}>
                        <FurnitureGlyph name={box.nome} /><span className="qfp-option-copy"><strong>{box.nome}</strong><span>{dimensionsLabel(dims)}</span></span><Plus size={19} className="qfp-plus" aria-hidden="true" />
                    </button>;
                }) : availablePresets.map(preset => <button type="button" className="qfp-option" key={preset.id} onClick={() => onAddPreset(preset)}>
                    <FurnitureGlyph preset={preset} name={preset.label} /><span className="qfp-option-copy"><strong>{presetLabel(preset)}</strong><span>{dimensionsLabel(preset.defaultDims)}</span></span><Plus size={19} className="qfp-plus" aria-hidden="true" />
                </button>)}
            </div>
            {(showBoxes ? !filteredBoxes.length : !availablePresets.length) && <p className="qfp-empty" role="status">{showBoxes ? boxes.length ? 'Nenhuma caixa encontrada. Tente outro nome.' : 'Nenhuma caixa disponível no catálogo.' : 'Nenhum modelo pronto disponível. Confira as outras caixas do catálogo.'}</p>}
        </div>

        <footer className="qfp-footer">
            <p>Medidas iniciais: largura × altura × profundidade.</p>
            {showBoxes ? <span className="qfp-count" aria-live="polite">{filteredBoxes.length} {filteredBoxes.length === 1 ? 'caixa' : 'caixas'}</span> : <button type="button" className="qfp-other-boxes" onClick={() => setShowBoxes(true)}>Outras caixas<ArrowRight size={18} /></button>}
        </footer>
    </section>;
}
