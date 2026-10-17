import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Layers3, Package, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, Wrench, X } from 'lucide-react';
import {
    addCatalogComponent, addLooseHardware, duplicateCatalogComponent,
    getBoxParts, getComponentHardware, removeCatalogComponent, removeLooseHardware,
    normalizeHardwareUnit,
    setBoxPartEnabled, setComponentHardware, updateCatalogComponent,
    updateCatalogItem, updateLooseHardware,
} from '../quoteComposition';
import './QuoteCompositionEditor.css';

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const catalogId = (entry) => entry.cod || `bib_${entry.id}`;
const asMessages = (error) => (Array.isArray(error?.errors) ? error.errors : [error]).map((entry) => typeof entry === 'string' ? entry : entry?.message || 'Não foi possível atualizar a composição.');
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const isLoose = (component) => component.composition?.kind === 'loose-hardware';
const componentName = (component) => component.compDef?.nome || 'Componente';
const sameId = (first, second) => String(first) === String(second);

function Field({ label, hint, children, className = '' }) {
    return <label className={`qce-field ${className}`}>
        <span className="qce-label">{label}</span>
        {children}
        {hint && <span className="qce-hint">{hint}</span>}
    </label>;
}

/** Guarda o texto ainda inválido no campo e informa o pai para bloquear a saída. */
function NumericField({ fieldId, label, errorLabel, value, onCommit, onFieldError, min = 0, max, integer = false, step, unit, allowEmpty = false, emptyValue = 0, placeholder, hint }) {
    const [text, setText] = useState(value == null ? '' : String(value));
    const [error, setError] = useState('');
    useEffect(() => {
        setText(value == null ? '' : String(value));
        setError('');
        onFieldError(fieldId, '');
    }, [value, fieldId, onFieldError]);

    const commit = (raw) => {
        setText(raw);
        let message = '';
        const empty = raw.trim() === '';
        const next = empty && allowEmpty ? emptyValue : Number(raw);
        const automatic = allowEmpty && (empty || (next === 0 && emptyValue === 0));
        if (empty && !allowEmpty) message = 'Informe um valor.';
        else if (!automatic && (!Number.isFinite(next) || next < min || (max != null && next > max) || (integer && !Number.isInteger(next)))) {
            message = `${integer ? 'Use um número inteiro' : 'Use um número'} ${max != null ? `entre ${min} e ${max}` : `a partir de ${min}`}.`;
        }
        if (!message) message = onCommit(next) || '';
        setError(message);
        onFieldError(fieldId, message ? `${errorLabel || label}: ${message}` : '');
    };

    return <Field label={label} hint={hint} className={error ? 'has-error' : ''}>
        <span className="qce-number-wrap">
            <input type="number" value={text} min={min} max={max} step={step ?? (integer ? 1 : 'any')}
                inputMode={integer ? 'numeric' : 'decimal'} placeholder={placeholder}
                aria-invalid={Boolean(error)} aria-label={errorLabel || label}
                onChange={(event) => commit(event.target.value)}
                onBlur={() => { if (text.trim() === '' && !allowEmpty) commit(text); }} />
            {unit && <span className="qce-unit">{unit}</span>}
        </span>
        {error && <span className="qce-field-error" role="alert">{error}</span>}
    </Field>;
}

function MaterialOptions({ options, value }) {
    const missing = value && !options.some((option) => sameId(option.id, value));
    return <>
        {missing && <option value={value}>Cadastro indisponível · {value}</option>}
        {options.map((option) => <option key={option.id} value={option.id}>{option.nome}{option.price <= 0 ? ' · sem preço' : ''}</option>)}
    </>;
}

function hardwareCategory(slot, component, hardwareItems) {
    const source = hardwareItems.find((entry) => sameId(entry.id, slot.defaultFerrId)) || slot.hardware;
    if (source?.categoria) return normalize(source.categoria);
    const definition = component.compDef?.sub_itens?.find((entry) => sameId(entry.id, slot.subItemId || slot.id));
    const name = normalize(`${definition?.nome || ''} ${definition?.id || ''}`);
    if (name.includes('puxador')) return 'puxador';
    if (name.includes('dobrad')) return 'dobradica';
    if (name.includes('corred')) return 'corredica';
    if (name.includes('articul')) return 'articulador';
    return '';
}

function HardwareSlot({ slot, component, hardwareItems, onUpdate }) {
    const id = slot.subItemId || slot.id;
    const category = hardwareCategory(slot, component, hardwareItems);
    const handle = category === 'puxador';
    const original = hardwareItems.find((entry) => sameId(entry.id, slot.defaultFerrId));
    const originalUnit = normalizeHardwareUnit(original?.unidade || original?.un);
    const choices = hardwareItems.filter((entry) => originalUnit && normalizeHardwareUnit(entry.unidade || entry.un) === originalUnit && (!category || normalize(entry.categoria) === category));
    const override = component.subItensOvr?.[id] || '';
    const configured = slot.configuredEnabled ?? (component.subItens?.[id] ?? component.compDef?.sub_itens?.find((entry) => sameId(entry.id, id))?.defaultOn ?? false);
    const effective = slot.hardware;
    const missingOverride = override && !choices.some((entry) => sameId(entry.id, override));
    const description = slot.enabled
        ? effective?.nome || `Cadastro indisponível · ${slot.effectiveFerrId || slot.defaultFerrId}`
        : slot.source === 'global' ? 'Padrão do orçamento: sem puxador' : handle ? 'Sem puxador neste componente' : 'Não incluída neste componente';

    return <div className={`qce-hardware-slot ${slot.enabled ? '' : 'is-off'} ${handle ? 'is-handle' : ''}`}>
        <div className="qce-hardware-name">
            {!handle && <button type="button" className="qce-check-button" role="switch" aria-checked={Boolean(configured)}
                aria-label={`${configured ? 'Desativar' : 'Ativar'} ${slot.nome}`} onClick={() => onUpdate(id, { enabled: !configured })}>
                {configured && <Check size={13} />}
            </button>}
            <div><strong>{handle ? 'Puxador' : slot.nome}</strong><span>{description}</span></div>
            {slot.enabled && effective && <span className="qce-hardware-price">{Number(effective.preco) > 0 ? `${money(effective.preco)}/${slot.unit || effective.unidade || effective.un || 'un'}` : 'Sem preço'}</span>}
        </div>
        <select aria-label={`${componentName(component)}: ${handle ? 'puxador' : slot.nome}`}
            disabled={!handle && !configured}
            value={handle && !configured ? '__disabled__' : override || '__inherit__'}
            onChange={(event) => {
                const value = event.target.value;
                onUpdate(id, value === '__disabled__' ? { enabled: false } : { enabled: true, ferrId: value === '__inherit__' ? '' : value });
            }}>
            <option value="__inherit__">Herdar padrão do orçamento / modelo</option>
            {handle && <option value="__disabled__">Sem puxador neste componente</option>}
            {missingOverride && <option value={override}>{hardwareItems.find((entry) => sameId(entry.id, override))?.nome || `Cadastro indisponível · ${override}`} · revisar unidade/cadastro</option>}
            {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.nome} · {normalizeHardwareUnit(entry.unidade || entry.un)}{entry.preco <= 0 ? ' · sem preço' : ''}</option>)}
        </select>
        {handle && <p className="qce-hardware-unit-note">Perfis de puxador por metro podem ser adicionados em Ferragens avulsas, com a metragem desejada.</p>}
    </div>;
}

export default function QuoteCompositionEditor({ item, onChange, catalog = {}, bibItems = [], materials = {}, padroes = {}, onClose, onValidationChange }) {
    const [expanded, setExpanded] = useState(() => new Set((item?.componentes || []).filter((entry) => !isLoose(entry)).map((entry) => entry.id)));
    const [componentSearch, setComponentSearch] = useState('');
    const [hardwareSearch, setHardwareSearch] = useState('');
    const [hardwareId, setHardwareId] = useState('');
    const [hardwareQuantity, setHardwareQuantity] = useState('1');
    const [fieldErrors, setFieldErrors] = useState({});
    const [actionError, setActionError] = useState('');
    const [status, setStatus] = useState('');
    const validationCallback = useRef(onValidationChange);
    const knownComponentIds = useRef(new Set((item?.componentes || []).map((entry) => entry.id)));
    validationCallback.current = onValidationChange;

    useEffect(() => { validationCallback.current?.(Object.values(fieldErrors)); }, [fieldErrors]);
    useEffect(() => () => { validationCallback.current?.([]); }, []);
    useEffect(() => {
        const added = (item?.componentes || []).filter((entry) => !isLoose(entry) && !knownComponentIds.current.has(entry.id)).map((entry) => entry.id);
        knownComponentIds.current = new Set((item?.componentes || []).map((entry) => entry.id));
        if (added.length) setExpanded((previous) => new Set([...previous, ...added]));
    }, [item?.componentes]);

    const setFieldError = useCallback((key, message) => {
        setFieldErrors((previous) => {
            if ((previous[key] || '') === message) return previous;
            const next = { ...previous };
            if (message) next[key] = message;
            else delete next[key];
            return next;
        });
    }, []);

    const sheetOptions = useMemo(() => bibItems.filter((entry) => entry.tipo === 'material' && entry.unidade === 'chapa').map((entry) => ({ id: catalogId(entry), nome: entry.nome, price: Number(entry.preco) })), [bibItems]);
    const frontOptions = useMemo(() => [
        ...sheetOptions,
        ...bibItems.filter((entry) => entry.tipo === 'acabamento').map((entry) => ({ id: catalogId(entry), nome: entry.nome, price: Number(entry.preco_m2 ?? entry.preco) })),
    ], [bibItems, sheetOptions]);
    const hardwareItems = useMemo(() => bibItems.filter((entry) => entry.tipo === 'ferragem' || entry.tipo === 'acessorio').map((entry) => ({ ...entry, id: catalogId(entry), raw: entry })), [bibItems]);
    const catalogComponents = useMemo(() => (catalog.componentes || []).filter((entry) => entry && entry.db_id != null), [catalog.componentes]);
    const filteredComponents = useMemo(() => {
        const query = normalize(componentSearch).trim();
        return catalogComponents.filter((entry) => !query || normalize(`${entry.nome} ${entry.desc || entry.descricao || ''} ${entry.cat || ''}`).includes(query));
    }, [catalogComponents, componentSearch]);
    const filteredHardware = useMemo(() => {
        const query = normalize(hardwareSearch).trim();
        return hardwareItems.filter((entry) => !query || normalize(`${entry.nome} ${entry.categoria || ''}`).includes(query));
    }, [hardwareItems, hardwareSearch]);

    const components = (item?.componentes || []).filter((entry) => !isLoose(entry));
    const looseHardware = (item?.componentes || []).filter(isLoose);
    const boxParts = item ? getBoxParts(item) : [];
    const inheritedFront = item?.composition?.matFrente || (item?.componentes || []).find((entry) => entry.matExtComp)?.matExtComp || materials.matFrente || '';
    const itemMaterials = {
        matInt: item?.mats?.matInt || materials.matInt || '',
        matFundo: item?.mats?.matFundo || materials.matFundo || '',
        matExt: item?.mats?.matExt || '',
        matFrente: inheritedFront,
    };
    const selectedHardware = hardwareItems.find((entry) => sameId(entry.id, hardwareId));
    const chosenUnit = normalizeHardwareUnit(selectedHardware?.unidade || selectedHardware?.un || 'un');
    const hasPanelParts = boxParts.some((entry) => entry.source === 'tamponamentos');
    const hasOwnMaterials = Boolean(item?._matCustom || item?.composition?.frontCustom);

    const apply = (operation, success = '') => {
        try {
            const next = operation(item);
            onChange(next);
            setActionError('');
            if (success) setStatus(success);
            return '';
        } catch (error) {
            const message = asMessages(error).join(' ');
            setActionError(message);
            return message;
        }
    };

    const changeGeneralMaterial = (field, value) => apply((current) => {
        const frontCustom = field === 'matFrente' ? true : current.composition?.frontCustom ?? Boolean(current._matCustom);
        const next = updateCatalogItem(current, { materials: { ...itemMaterials, [field]: value }, matCustom: true });
        next.composition = { ...next.composition, frontCustom };
        return next;
    });

    const useBudgetMaterials = () => apply((current) => {
        const next = updateCatalogItem(current, { materials: { ...materials, matExt: materials.matExt || '' }, matCustom: false });
        next.composition = { ...next.composition, frontCustom: false };
        return next;
    }, 'Materiais do orçamento aplicados a este móvel.');

    const applyComponent = (component, updates) => apply((current) => updateCatalogComponent(current, component.id, updates));
    const addComponent = (definition) => {
        let addedId;
        const error = apply((current) => {
            const next = addCatalogComponent(current, definition, { matExtComp: itemMaterials.matFrente, matCustom: false });
            addedId = next.componentes.find((entry) => !current.componentes?.some((old) => old.id === entry.id))?.id;
            return next;
        }, `${definition.nome} adicionado ao móvel.`);
        if (!error && addedId) setExpanded((previous) => new Set([...previous, addedId]));
    };
    const duplicateComponent = (component) => {
        let addedId;
        const error = apply((current) => {
            const next = duplicateCatalogComponent(current, component.id);
            addedId = next.componentes.find((entry) => !current.componentes.some((old) => old.id === entry.id))?.id;
            return next;
        }, `${componentName(component)} duplicado.`);
        if (!error && addedId) setExpanded((previous) => new Set([...previous, addedId]));
    };
    const removeComponent = (component) => {
        const error = apply((current) => isLoose(component) ? removeLooseHardware(current, component.id) : removeCatalogComponent(current, component.id), `${componentName(component)} removido.`);
        if (!error) {
            setFieldErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${component.id}:`))));
            setExpanded((previous) => { const next = new Set(previous); next.delete(component.id); return next; });
        }
    };
    const addHardware = () => {
        if (!selectedHardware) { setActionError('Escolha a ferragem que deseja adicionar.'); return; }
        if (!hardwareQuantity.trim()) { setActionError('Informe a quantidade da ferragem.'); return; }
        apply((current) => addLooseHardware(current, selectedHardware.raw, { quantity: Number(hardwareQuantity) }), `${selectedHardware.nome} adicionado ao móvel.`);
    };

    if (!item) return null;

    return <section className="quote-composition-editor" aria-label={`Composição de ${item.nome || item.caixaDef?.nome || 'móvel'}`}>
        <header className="qce-header">
            <div className="qce-header-icon"><SlidersHorizontal size={22} /></div>
            <div className="qce-header-title"><span>MÓVEL SELECIONADO</span><h2>{item.nome || item.caixaDef?.nome || 'Composição do móvel'}</h2><p>Configure a estrutura, as frentes e cada ferragem deste móvel.</p></div>
            <div className="qce-header-meta"><span>{item.dims?.l} × {item.dims?.a} × {item.dims?.p} mm</span><strong>{item.qtd || 1} {Number(item.qtd || 1) === 1 ? 'móvel no orçamento' : 'móveis no orçamento'}</strong></div>
            {onClose && <button type="button" className="qce-icon-button qce-close" onClick={onClose} aria-label="Fechar edição da composição" title="Fechar composição"><X size={19} /></button>}
        </header>

        <div className="qce-content">
            {actionError && <div className="qce-alert" role="alert">{actionError}<button type="button" onClick={() => setActionError('')} aria-label="Fechar aviso"><X size={15} /></button></div>}
            {status && !actionError && <div className="qce-status" role="status"><Check size={14} />{status}</div>}

            <section className="qce-section">
                <div className="qce-section-heading"><div><span className="qce-step">01</span><h3>Corpo e materiais</h3></div><span className="qce-tag">{hasOwnMaterials ? 'Materiais deste móvel' : 'Padrão do orçamento'}</span></div>
                <div className="qce-body-grid">
                    <Field label="Identificação do móvel" className="qce-name-field"><input value={item.nome || item.caixaDef?.nome || ''} maxLength={160} onChange={(event) => apply((current) => updateCatalogItem(current, { nome: event.target.value }))} /></Field>
                    {[['Corpo', 'matInt'], ['Fundo', 'matFundo'], ['Frentes', 'matFrente']].map(([label, field]) => <Field key={field} label={label}>
                        <select value={itemMaterials[field]} onChange={(event) => changeGeneralMaterial(field, event.target.value)}>
                            <option value="">Selecionar material</option>
                            <MaterialOptions options={field === 'matFrente' ? frontOptions : sheetOptions} value={itemMaterials[field]} />
                        </select>
                    </Field>)}
                    {hasPanelParts && <Field label="Tamponamentos da receita" hint="As peças externas entram no cálculo quando há material selecionado.">
                        <select value={itemMaterials.matExt} onChange={(event) => changeGeneralMaterial('matExt', event.target.value)}>
                            <option value="">Sem tamponamento</option><MaterialOptions options={frontOptions} value={itemMaterials.matExt} />
                        </select>
                    </Field>}
                </div>
                <div className="qce-material-footer"><p>O material das frentes pode ser personalizado novamente em cada componente.</p>{hasOwnMaterials && <button type="button" className="qce-text-button" onClick={useBudgetMaterials}><RotateCcw size={13} /> Usar padrão do orçamento</button>}</div>
                {boxParts.length > 0 && <details className="qce-box-parts"><summary><span>Peças que compõem a caixa <b>{boxParts.filter((entry) => entry.enabled).length}</b></span><ChevronDown size={15} /></summary>
                    <div className="qce-parts-grid">{boxParts.map((entry) => <label key={`${entry.source}:${entry.pieceId || entry.id}`} className={`qce-part-option ${entry.enabled ? '' : 'is-off'}`}>
                        <input type="checkbox" checked={Boolean(entry.enabled)} onChange={(event) => apply((current) => setBoxPartEnabled(current, entry.pieceId || entry.id, event.target.checked, { source: entry.source }))} />
                        <span><strong>{entry.part?.nome || entry.pieceId || entry.id}</strong><small>{entry.source === 'tamponamentos' ? 'Tamponamento' : `${entry.part?.qtd ?? 1} ${(entry.part?.qtd ?? 1) === 1 ? 'peça' : 'peças'}`}{entry.enabled ? '' : ' · não incluída'}</small></span>
                    </label>)}</div>
                </details>}
            </section>

            <section className="qce-section qce-components-section">
                <div className="qce-section-heading"><div><span className="qce-step">02</span><h3>Componentes do móvel</h3><span className="qce-count">{components.length}</span></div><span className="qce-section-note">Quantidades por móvel</span></div>
                <div className="qce-component-catalog">
                    <div className="qce-catalog-heading"><strong><Plus size={15} /> Adicionar componente</strong><span>{catalogComponents.length} no catálogo</span></div>
                    <div className="qce-search"><Search size={16} /><input aria-label="Buscar componente no catálogo" placeholder="Buscar porta, gaveta, prateleira, divisória…" value={componentSearch} onChange={(event) => setComponentSearch(event.target.value)} />{componentSearch && <button type="button" aria-label="Limpar busca de componentes" onClick={() => setComponentSearch('')}><X size={14} /></button>}</div>
                    <div className="qce-catalog-list">{filteredComponents.slice(0, 60).map((definition) => <button type="button" key={definition.db_id} onClick={() => addComponent(definition)} title={`Adicionar ${definition.nome}`}>
                        <Package size={18} /><span><strong>{definition.nome}</strong>{(definition.desc || definition.descricao) && <small>{definition.desc || definition.descricao}</small>}</span><Plus size={16} />
                    </button>)}{!filteredComponents.length && <p className="qce-empty-catalog">{catalogComponents.length ? 'Nenhum componente corresponde à busca.' : 'O catálogo ainda não tem componentes cadastrados.'}</p>}</div>
                    {filteredComponents.length > 60 && <p className="qce-search-hint">Mostrando 60 de {filteredComponents.length}. Use a busca para localizar o componente.</p>}
                </div>

                <div className="qce-component-list">{components.map((component, index) => {
                    const definition = component.compDef || {};
                    const slots = getComponentHardware(item, component.id, bibItems, padroes);
                    const handleSlots = slots.filter((slot) => hardwareCategory(slot, component, hardwareItems) === 'puxador');
                    const otherSlots = slots.filter((slot) => hardwareCategory(slot, component, hardwareItems) !== 'puxador');
                    const isExpanded = expanded.has(component.id);
                    const componentErrors = Object.keys(fieldErrors).filter((key) => key.startsWith(`${component.id}:`)).length;
                    const ownFront = component.composition?.matCustom ?? Boolean(component.matExtComp && component.matExtComp !== inheritedFront);
                    const dimFields = [['dimL', 'L', 'Largura', item.dims?.l], ['dimA', 'A', 'Altura', item.dims?.a], ['dimP', 'P', 'Profundidade', item.dims?.p]].filter(([, axis]) => (definition.dimsAplicaveis || ['L', 'A', 'P']).includes(axis));
                    return <article key={component.id} className={`qce-component-card ${componentErrors ? 'has-error' : ''}`}>
                        <header className="qce-component-header"><button type="button" className="qce-component-toggle" aria-expanded={isExpanded} onClick={() => setExpanded((previous) => { const next = new Set(previous); if (next.has(component.id)) next.delete(component.id); else next.add(component.id); return next; })}>
                            <span className="qce-component-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{componentName(component)}</strong><small>{(definition.pecas || []).length > 0 ? 'Corpo / peças internas' : definition.frente_externa?.ativa ? 'Frente externa' : 'Componente'}{slots.length ? ` · ${slots.length} ${slots.length === 1 ? 'ferragem configurável' : 'ferragens configuráveis'}` : ''}</small></span>{componentErrors > 0 && <b className="qce-error-badge">Revisar</b>}<ChevronDown size={17} className={isExpanded ? 'is-rotated' : ''} />
                        </button><div className="qce-component-actions"><button type="button" className="qce-icon-button" onClick={() => duplicateComponent(component)} aria-label={`Duplicar ${componentName(component)}`} title="Duplicar componente"><Copy size={15} /></button><button type="button" className="qce-icon-button" onClick={() => removeComponent(component)} aria-label={`Remover ${componentName(component)}`} title="Remover componente"><Trash2 size={15} /></button></div></header>
                        <div className="qce-component-content" hidden={!isExpanded}>
                            <div className="qce-component-basics">
                                <NumericField fieldId={`${component.id}:qtd`} label="Quantidade" errorLabel={`${componentName(component)} · quantidade`} value={component.qtd ?? 1} min={1} integer unit="por móvel" onCommit={(value) => applyComponent(component, { qtd: value })} onFieldError={setFieldError} />
                                {definition.frente_externa?.ativa && <Field label="Material da frente">
                                    <select value={ownFront ? component.matExtComp : '__inherit__'} onChange={(event) => applyComponent(component, { matExtComp: event.target.value === '__inherit__' ? inheritedFront : event.target.value, matCustom: event.target.value !== '__inherit__' })}>
                                        <option value="__inherit__">Padrão do móvel · {frontOptions.find((entry) => sameId(entry.id, inheritedFront))?.nome || 'selecione nas frentes'}</option>
                                        <MaterialOptions options={frontOptions} value={component.matExtComp} />
                                    </select>
                                </Field>}
                            </div>
                            {(definition.vars || []).length > 0 && <div className="qce-variable-grid">{definition.vars.map((variable) => {
                                const automatic = Boolean(definition.varsDeriv?.[variable.id]);
                                const raw = component.vars?.[variable.id];
                                const value = raw === 0 && automatic ? '' : raw ?? (automatic ? '' : variable.default);
                                const integer = ['un', 'und', 'unidade', 'par', 'pares'].includes(normalize(variable.unit));
                                return <NumericField key={variable.id} fieldId={`${component.id}:var:${variable.id}`} label={variable.label || variable.id} errorLabel={`${componentName(component)} · ${variable.label || variable.id}`} value={value}
                                    min={variable.min ?? 0} max={variable.max} integer={integer} unit={variable.unit} allowEmpty={automatic} placeholder={automatic ? 'Automático' : undefined} hint={automatic ? 'Vazio acompanha as medidas do móvel.' : undefined}
                                    onCommit={(next) => applyComponent(component, { vars: { ...(component.vars || {}), [variable.id]: next } })} onFieldError={setFieldError} />;
                            })}</div>}
                            {handleSlots.map((slot) => <HardwareSlot key={slot.subItemId || slot.id} slot={slot} component={component} hardwareItems={hardwareItems} onUpdate={(id, updates) => apply((current) => setComponentHardware(current, component.id, id, updates))} />)}
                            {definition.frente_externa?.ativa && !handleSlots.length && <div className="qce-no-handle"><Wrench size={14} /><span>Este componente não possui puxador na receita. Você pode adicioná-lo em “Ferragens avulsas”.</span></div>}
                            {otherSlots.length > 0 && <div className="qce-component-hardware"><h4><Wrench size={14} /> Ferragens do componente</h4>{otherSlots.map((slot) => <HardwareSlot key={slot.subItemId || slot.id} slot={slot} component={component} hardwareItems={hardwareItems} onUpdate={(id, updates) => apply((current) => setComponentHardware(current, component.id, id, updates))} />)}<p className="qce-hint">As quantidades destas ferragens acompanham a composição e suas medidas.</p></div>}
                            {(dimFields.length > 0 || (definition.pecas || []).length > 0) && <details className="qce-component-options"><summary><span><SlidersHorizontal size={14} /> Medidas e materiais próprios</span><ChevronDown size={15} /></summary>
                                <div className="qce-option-content"><p>Deixe as medidas vazias para acompanhar a caixa.</p>
                                    <div className="qce-variable-grid">{dimFields.map(([field, , label, fallback]) => <NumericField key={field} fieldId={`${component.id}:${field}`} label={label} errorLabel={`${componentName(component)} · ${label.toLowerCase()}`} value={component[field] > 0 ? component[field] : ''} min={1} allowEmpty placeholder={fallback ? `Auto · ${fallback}` : 'Automático'} unit="mm" onCommit={(value) => applyComponent(component, { [field]: value })} onFieldError={setFieldError} />)}</div>
                                    {(definition.pecas || []).length > 0 && <div className="qce-inner-materials">{[['Corpo do componente', 'matIntInst', 'Corpo do móvel'], ['Exterior do componente', 'matExtInst', 'Exterior do móvel']].map(([label, field, fallback]) => <Field key={field} label={label}>
                                        <select value={component[field] || ''} onChange={(event) => applyComponent(component, { [field]: event.target.value })}><option value="">{fallback}</option><MaterialOptions options={field === 'matIntInst' ? sheetOptions : frontOptions} value={component[field]} /></select>
                                    </Field>)}</div>}
                                </div>
                            </details>}
                        </div>
                    </article>;
                })}{!components.length && <div className="qce-empty-components"><Layers3 size={25} /><div><strong>Caixa pronta para receber componentes</strong><p>Adicione portas, gavetas, prateleiras ou qualquer componente do catálogo.</p></div></div>}</div>
            </section>

            <section className="qce-section qce-loose-section">
                <div className="qce-section-heading"><div><span className="qce-step">03</span><h3>Ferragens avulsas</h3><span className="qce-count">{looseHardware.length}</span></div><Wrench size={17} /></div>
                <p className="qce-section-description">Puxadores, pés, perfis, kits e acessórios adicionais, com quantidade por móvel.</p>
                {looseHardware.length > 0 && <div className="qce-loose-list">{looseHardware.map((component) => {
                    const currentId = component.composition?.hardwareId || component.compDef?.sub_itens?.[0]?.ferrId;
                    const hardware = hardwareItems.find((entry) => sameId(entry.id, currentId));
                    const unit = normalizeHardwareUnit(component.composition?.unit || hardware?.unidade || hardware?.un || 'un');
                    return <div key={component.id} className="qce-loose-row">
                        <Field label="Ferragem"><select value={currentId || ''} onChange={(event) => {
                            const selected = hardwareItems.find((entry) => sameId(entry.id, event.target.value));
                            if (selected) apply((current) => updateLooseHardware(current, component.id, { hardware: selected.raw }));
                        }}>{!hardware && <option value={currentId || ''}>Cadastro indisponível · {currentId}</option>}{hardwareItems.map((entry) => <option key={entry.id} value={entry.id}>{entry.nome}</option>)}</select></Field>
                        <NumericField fieldId={`${component.id}:quantity`} label="Quantidade" errorLabel={`${hardware?.nome || componentName(component)} · quantidade`} value={component.vars?.quantidade ?? 1} min={unit === 'm' ? 0.001 : 1} integer={unit !== 'm'} unit={unit} onCommit={(quantity) => apply((current) => updateLooseHardware(current, component.id, { quantity }))} onFieldError={setFieldError} />
                        <div className="qce-loose-unit-price"><span>Preço cadastrado</span><strong>{hardware && Number(hardware.preco) > 0 ? money(hardware.preco) : 'Sem preço'}<small>/{unit}</small></strong></div>
                        <button type="button" className="qce-icon-button" onClick={() => removeComponent(component)} aria-label={`Remover ${hardware?.nome || componentName(component)}`} title="Remover ferragem"><Trash2 size={16} /></button>
                    </div>;
                })}</div>}
                <div className="qce-add-hardware">
                    <div className="qce-search"><Search size={16} /><input aria-label="Buscar ferragem avulsa" placeholder="Buscar puxador, perfil, pé ou acessório…" value={hardwareSearch} onChange={(event) => setHardwareSearch(event.target.value)} />{hardwareSearch && <button type="button" aria-label="Limpar busca de ferragens" onClick={() => setHardwareSearch('')}><X size={14} /></button>}</div>
                    <div className="qce-hardware-add-grid"><Field label="Ferragem do catálogo"><select value={hardwareId} onChange={(event) => setHardwareId(event.target.value)}><option value="">Selecionar ferragem</option>{selectedHardware && !filteredHardware.some((entry) => sameId(entry.id, hardwareId)) && <option value={hardwareId}>{selectedHardware.nome}</option>}{filteredHardware.map((entry) => <option key={entry.id} value={entry.id}>{entry.nome}{entry.preco <= 0 ? ' · sem preço' : ''}</option>)}</select></Field><Field label="Quantidade"><span className="qce-number-wrap"><input type="number" min={chosenUnit === 'm' ? 0.001 : 1} step={chosenUnit === 'm' ? 'any' : 1} value={hardwareQuantity} inputMode={chosenUnit === 'm' ? 'decimal' : 'numeric'} onChange={(event) => setHardwareQuantity(event.target.value)} /><span className="qce-unit">{chosenUnit}</span></span></Field><button type="button" className="qce-button qce-button-dark" onClick={addHardware} disabled={!hardwareItems.length}><Plus size={16} /> Adicionar ferragem</button></div>
                    {selectedHardware && <p className="qce-hint">{Number(selectedHardware.preco) > 0 ? `${money(selectedHardware.preco)} por ${chosenUnit}, conforme o cadastro.` : 'Esta ferragem ainda está sem preço no cadastro.'} A quantidade será multiplicada pela quantidade de móveis da linha.</p>}
                    {!hardwareItems.length && <p className="qce-hint">Cadastre ferragens e acessórios para disponibilizá-los aqui.</p>}
                </div>
            </section>
        </div>
        <footer className="qce-footer"><span><Check size={14} /> As alterações entram no orçamento automaticamente.</span>{Object.keys(fieldErrors).length > 0 && <strong role="status">Revise {Object.keys(fieldErrors).length} {Object.keys(fieldErrors).length === 1 ? 'campo' : 'campos'} antes de salvar.</strong>}{onClose && <button type="button" className="qce-button" onClick={onClose}>Concluir composição</button>}</footer>
    </section>;
}
