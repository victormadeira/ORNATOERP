import { useId } from 'react';
import { ChevronDown, Copy, Trash2 } from 'lucide-react';
import './QuickFurnitureCard.css';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const COUNT_LABELS = {
    doors: { label: 'Portas', singular: 'porta' },
    drawers: { label: 'Gavetas', singular: 'gaveta' },
    shelves: { label: 'Prateleiras', singular: 'prateleira' },
};

const optionId = (option) => String(option.id);
const shownValue = (value) => value === '' || value == null ? '—' : String(value);
const numericValue = (value) => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const nextStep = (value, direction, min = 0, max = Infinity) => {
    const current = numericValue(value);
    return Math.min(max, Math.max(min, current == null ? min : Math.trunc(current) + direction));
};

function CountStepper({ type, control, itemLabel, onChange, id }) {
    const { label, singular } = COUNT_LABELS[type];
    const value = numericValue(control.value);
    const min = control.min ?? 0;
    const max = control.max ?? Infinity;
    const locked = !control.editable || !onChange;
    const reason = control.reason || 'Ajuste este componente em Personalizar.';

    return <div className="qfc-field qfc-count-field" role="group" aria-labelledby={`${id}-label`} aria-describedby={locked ? `${id}-reason` : undefined}>
        <span className="qfc-label" id={`${id}-label`}>{label}</span>
        <div className={`qfc-stepper${locked ? ' is-locked' : ''}`}>
            <button type="button" className="qfc-step" disabled={locked || value != null && value <= min} onClick={() => onChange(type, nextStep(value, -1, min, max))} aria-label={`Remover uma ${singular} de ${itemLabel}`} title={locked ? reason : `Menos ${singular}`}>−</button>
            <output className="qfc-count-value" aria-live="polite" aria-atomic="true">{shownValue(control.value)}</output>
            <button type="button" className="qfc-step" disabled={locked || value != null && value >= max} onClick={() => onChange(type, nextStep(value, 1, min, max))} aria-label={`Adicionar uma ${singular} a ${itemLabel}`} title={locked ? reason : `Mais ${singular}`}>+</button>
        </div>
        {locked && <span className="qfc-sr-only" id={`${id}-reason`}>{reason}</span>}
    </div>;
}

/** Controlled card: the parent owns validation, rebuilding and persistence. */
export default function QuickFurnitureCard({
    item,
    index = 0,
    itemCost,
    errors = [],
    controls = {},
    materialOptions = [],
    handleOptions = [],
    globalMaterials = {},
    inputs = {},
    expanded = true,
    onSelect,
    onDimensions,
    onCount,
    onHandle,
    onFrontMaterial,
    onCustomize,
    onDuplicate,
    onRemove,
}) {
    const id = useId();
    const bodyId = `${id}-body`;
    const errorId = `${id}-errors`;
    const label = controls.label || item.nome || item.quick?.label || item.caixaDef?.nome || 'Móvel';
    const messages = [...new Set((errors || []).map((error) => typeof error === 'string' ? error : error?.message).filter(Boolean))];
    const hasErrors = messages.length > 0;
    const isExtra = item.quick?.kind === 'extra' || item.quick?.group === 'extras';
    const depthApplicable = !isExtra && item.caixaDef?.dimsAplicaveis?.includes('P') !== false;
    const values = { l: inputs.l ?? item.dims?.l ?? '', a: inputs.a ?? item.dims?.a ?? '', p: inputs.p ?? item.dims?.p ?? '', qtd: inputs.qtd ?? item.qtd ?? 1 };
    const dimensions = [values.l, values.a, ...(depthApplicable ? [values.p] : [])].map(shownValue).join(' × ');
    const quantity = numericValue(values.qtd);
    const counts = Object.entries(COUNT_LABELS).filter(([type]) => {
        const control = controls.counts?.[type];
        return control && control.applicable !== false && (control.applicable || control.editable || Number(control.value) > 0);
    });
    const front = controls.frontMaterial || {};
    const frontValue = front.mixed ? '__mixed__' : String(front.value ?? '');
    const frontEditable = Boolean(front.editable && onFrontMaterial);
    const frontExists = frontEditable || frontValue !== '' || (item.componentes || []).some((component) => component.compDef?.frente_externa?.ativa);
    const missingFront = frontValue !== '' && frontValue !== '__mixed__' && !materialOptions.some((option) => optionId(option) === frontValue);
    const defaultFront = materialOptions.find((option) => optionId(option) === String(globalMaterials.matFrente || ''));
    const handle = controls.handle || {};
    const handles = Array.isArray(handle.options) ? handle.options : handleOptions;
    const handleValue = handle.mixed ? '__mixed__' : String(handle.value ?? '');
    const handleEditable = Boolean(handle.editable && onHandle);
    const missingHandle = !['', '__mixed__', '__none__'].includes(handleValue) && !handles.some((option) => optionId(option) === handleValue);
    const cost = typeof itemCost === 'number' && Number.isFinite(itemCost) && !hasErrors ? currency.format(itemCost) : '—';

    return <article className={`quick-furniture-card${expanded ? ' is-expanded' : ''}${hasErrors ? ' has-errors' : ''}`} aria-label={label}>
        <header className="qfc-header">
            <button type="button" className="qfc-toggle" onClick={onSelect} disabled={!onSelect} aria-expanded={expanded} aria-controls={expanded ? bodyId : undefined} aria-label={`${expanded ? 'Recolher' : 'Abrir'} ${label}${hasErrors ? ', com pendências' : ''}`}>
                <span className="qfc-name"><span className="qfc-number">{String(index + 1).padStart(2, '0')}</span><span className="qfc-name-text" title={label}>{label}</span>{hasErrors && <span className="qfc-error-tag">Revisar</span>}</span>
                {!expanded && <span className="qfc-short-spec"><span>{dimensions} mm</span><span>{shownValue(values.qtd)} un.</span></span>}
                <span className="qfc-cost" title="Custo de materiais, fitas e ferragens, considerando a quantidade da linha"><span>Insumos</span><strong>{cost}</strong></span>
                {onSelect && <ChevronDown size={17} className="qfc-expand-icon" aria-hidden="true" />}
            </button>
            {expanded && <div className="qfc-actions">
                {onCustomize && <button type="button" className="qfc-customize" onClick={onCustomize}>Personalizar</button>}
                {onDuplicate && <button type="button" className="qfc-icon-button" onClick={onDuplicate} aria-label={`Duplicar ${label}`} title="Duplicar"><Copy size={17} aria-hidden="true" /></button>}
                {onRemove && <button type="button" className="qfc-icon-button" onClick={onRemove} aria-label={`Remover ${label}`} title="Remover"><Trash2 size={17} aria-hidden="true" /></button>}
            </div>}
        </header>

        {expanded && <div className="qfc-body" id={bodyId} aria-describedby={hasErrors ? errorId : undefined}>
            <div className="qfc-dimensions">
                {[['l', 'Largura'], ['a', 'Altura'], ['p', 'Profundidade']].map(([key, fieldLabel]) => {
                    const applicable = key !== 'p' || depthApplicable;
                    return <label className="qfc-field" key={key}>
                        <span className="qfc-label">{fieldLabel}</span>
                        <span className={`qfc-dimension-entry${applicable ? '' : ' is-inapplicable'}`}>
                            <input className="qfc-input" type="number" min="1" step="1" inputMode="numeric" value={applicable ? values[key] : ''} placeholder={applicable ? undefined : '—'} disabled={!applicable || !onDimensions} onChange={(event) => onDimensions({ [key]: event.target.value })} aria-label={`${label}: ${fieldLabel.toLowerCase()}${applicable ? ' em milímetros' : ' não se aplica'}`} />
                            {applicable && <span className="qfc-unit" aria-hidden="true">mm</span>}
                        </span>
                    </label>;
                })}
                <div className="qfc-field qfc-quantity" role="group" aria-labelledby={`${id}-quantity-label`}>
                    <label className="qfc-label" id={`${id}-quantity-label`} htmlFor={`${id}-quantity`}>Quantidade</label>
                    <div className="qfc-stepper">
                        <button type="button" className="qfc-step" disabled={!onDimensions || quantity != null && quantity <= 1} onClick={() => onDimensions({ qtd: String(nextStep(values.qtd, -1, 1)) })} aria-label={`Diminuir quantidade de ${label}`}>−</button>
                        <input className="qfc-input qfc-quantity-input" id={`${id}-quantity`} type="number" min="1" step="1" inputMode="numeric" value={values.qtd} disabled={!onDimensions} onChange={(event) => onDimensions({ qtd: event.target.value })} />
                        <button type="button" className="qfc-step" disabled={!onDimensions} onClick={() => onDimensions({ qtd: String(nextStep(values.qtd, 1, 1)) })} aria-label={`Aumentar quantidade de ${label}`}>+</button>
                    </div>
                </div>
            </div>

            {!isExtra && <div className="qfc-composition">
                {counts.length > 0 && <div className="qfc-counts">{counts.map(([type]) => <CountStepper key={type} type={type} control={controls.counts[type]} itemLabel={label} onChange={onCount} id={`${id}-${type}`} />)}</div>}
                <label className="qfc-field qfc-select-field">
                    <span className="qfc-label">Frentes</span>
                    <select className="qfc-select" value={frontValue} onChange={(event) => onFrontMaterial(event.target.value)} disabled={!frontEditable} aria-label={`${label}: material das frentes`} title={!frontEditable && frontExists ? 'Altere em Personalizar.' : undefined}>
                        <option value="">{frontExists ? `Padrão${defaultFront ? ` · ${defaultFront.nome}` : ' do orçamento'}` : 'Sem frente'}</option>
                        {frontValue === '__mixed__' && <option value="__mixed__" disabled>Materiais diferentes</option>}
                        {missingFront && <option value={frontValue} disabled>Material não cadastrado</option>}
                        {materialOptions.map((option) => <option key={optionId(option)} value={optionId(option)}>{option.nome}</option>)}
                    </select>
                </label>
                <label className="qfc-field qfc-select-field">
                    <span className="qfc-label">Puxador</span>
                    <select className="qfc-select" value={handleValue} onChange={(event) => onHandle(event.target.value)} disabled={!handleEditable} aria-label={`${label}: puxador`} title={!handleEditable ? handle.reason || 'Altere em Personalizar.' : undefined}>
                        <option value="">{handleEditable || handleValue || frontExists ? 'Padrão do orçamento' : 'Não se aplica'}</option>
                        <option value="__none__">Sem puxador</option>
                        {handleValue === '__mixed__' && <option value="__mixed__" disabled>Puxadores diferentes</option>}
                        {missingHandle && <option value={handleValue} disabled>Puxador não cadastrado</option>}
                        {handles.map((option) => <option key={optionId(option)} value={optionId(option)}>{option.nome}</option>)}
                    </select>
                </label>
            </div>}

            {hasErrors && <div className="qfc-errors" id={errorId} role="alert"><ul>{messages.map((message) => <li key={message}>{message}</li>)}</ul></div>}
        </div>}
    </article>;
}
