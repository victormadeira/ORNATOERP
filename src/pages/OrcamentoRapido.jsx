import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Loader2, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { applyQuoteDiscount, buildQuoteLibrary, calculateQuote } from '../quoteCalculator';
import { buildQuickExtra, buildQuickItem, listQuickPresets, rebuildQuickItem } from '../quickQuote';
import { createCatalogBoxItem, normalizeHardwareUnit, updateCatalogItem } from '../quoteComposition';
import { getQuickItemControls, setQuickItemCount, setQuickItemHandle, setQuickItemFrontMaterial } from '../quickQuoteActions';
import QuoteCompositionEditor from './QuoteCompositionEditor';
import QuickFurnitureCard from './QuickFurnitureCard';
import QuickFurniturePicker from './QuickFurniturePicker';
import './OrcamentoRapido.css';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const uid = () => globalThis.crypto?.randomUUID?.() || `quick-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const cleanText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const newRoom = (name = 'Cozinha') => ({ id: uid(), nome: name, tipo: 'calculadora', itens: [], paineis: [], itensEspeciais: [], grupos: [], matExt: '', quick: { version: 1 } });
const emptyDraft = () => ({ clienteId: '', projeto: '', ambientes: [newRoom()], taxas: {}, padroes: {}, pagamento: { desconto: { tipo: '%', valor: 0 }, blocos: [] }, obs: '' });
const errorMessages = (error) => (Array.isArray(error?.errors) ? error.errors : [error]).map((entry) => typeof entry === 'string' ? entry : entry?.message || entry?.error || 'Não foi possível atualizar o móvel.');
const itemLabel = (item) => item.nome || item.quick?.label || item.caixaDef?.nome || 'Móvel';

function materialChoices(items) {
    return items.filter((item) => item.tipo === 'material' && item.unidade === 'chapa').map((item) => ({
        id: item.cod || `bib_${item.id}`,
        nome: item.nome,
        esp: number(item.espessura),
        preco: number(item.preco),
    }));
}

function initialMaterials(setup, draft) {
    if (draft.materials) return draft.materials;
    const choices = materialChoices(setup.bibItems || []);
    const first = draft.ambientes?.flatMap((room) => room.itens || []).find((item) => item.quick?.kind !== 'extra');
    const body = first?.mats?.matInt || choices.find((item) => item.esp === 18)?.id || choices.find((item) => item.esp === 15)?.id || choices[0]?.id || '';
    const back = first?.mats?.matFundo || choices.find((item) => item.esp === 6)?.id || choices.find((item) => item.esp > 0 && item.esp < 10)?.id || '';
    const front = first?.componentes?.find((item) => item.matExtComp)?.matExtComp || body;
    return { matInt: body, matFundo: back, matFrente: front };
}

function Field({ label, children, hint, error, className = '' }) {
    return <label className={`oq-field ${className}`}><span className="oq-label">{label}</span>{children}{hint && <span className="oq-field-hint">{hint}</span>}{error && <span className="oq-field-error">{error}</span>}</label>;
}

function PendingList({ title = 'Revise antes de salvar', messages, className = '' }) {
    if (!messages.length) return null;
    const unique = [...new Set(messages)];
    return <div className={`oq-pending ${className}`} role="status"><strong>{title}</strong><ul>{unique.slice(0, 4).map((message, i) => <li key={`${message}-${i}`}>{message}</li>)}</ul>{unique.length > 4 && <details><summary>Ver mais {unique.length - 4} pendências</summary><ul>{unique.slice(4).map((message, i) => <li key={`${message}-${i}`}>{message}</li>)}</ul></details>}</div>;
}

function readItemCost(totals, itemId) {
    if (totals?.errors?.some((error) => error.itemId === itemId)) return null;
    // custoItem já inclui a quantidade da linha; itemResults é por móvel.
    const lineCost = totals?.itemCostList?.find((item) => item.itemId === itemId)?.custoItem;
    return Number.isFinite(lineCost) ? lineCost : null;
}

export default function OrcamentoRapido({ adapter, onOpenEditor, onBack, notify }) {
    const [setup, setSetup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [draft, setDraft] = useState(emptyDraft);
    const [materials, setMaterials] = useState({ matInt: '', matFrente: '', matFundo: '' });
    const [activeRoomId, setActiveRoomId] = useState('');
    const [rowInputs, setRowInputs] = useState({});
    const [rowErrors, setRowErrors] = useState({});
    const [actionError, setActionError] = useState('');
    const [showValidation, setShowValidation] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedMeta, setSavedMeta] = useState(null);
    const [expandedItem, setExpandedItem] = useState(null);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [compositionErrors, setCompositionErrors] = useState({});
    const [materialUpdateErrors, setMaterialUpdateErrors] = useState([]);
    const [undo, setUndo] = useState(null);
    const [extra, setExtra] = useState({ tipo: 'lateral', l: 550, a: 720, qtd: 1, matId: '' });
    const [extraError, setExtraError] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);
    const [scrollTarget, setScrollTarget] = useState('');
    const savedFingerprint = useRef('');
    const savingRef = useRef(false);
    const isDemo = adapter?.mode === 'demo';

    useEffect(() => {
        let active = true;
        setLoading(true);
        setLoadError('');
        Promise.resolve().then(() => {
            if (!adapter?.loadSetup) throw new Error('A conexão com os cadastros não está disponível.');
            return adapter.loadSetup();
        }).then((data) => {
            if (!active) return;
            const initial = data.initialDraft || {};
            const next = { ...emptyDraft(), ...initial, taxas: { ...(data.taxas || {}), ...(initial.taxas || {}) }, padroes: { ...(data.padroes || {}), ...(initial.padroes || {}) } };
            next.projeto = String(next.projeto || '');
            next.ambientes = initial.ambientes?.length ? initial.ambientes : [newRoom()];
            next.pagamento = { desconto: { tipo: '%', valor: 0 }, blocos: [], ...(initial.pagamento || {}) };
            if (next.pagamento.desconto?.tipo === 'R') next.pagamento.desconto = { ...next.pagamento.desconto, tipo: 'R$' };
            const selectedMaterials = initialMaterials(data, next);
            setSetup(data);
            setDraft(next);
            setMaterials(selectedMaterials);
            setExtra((prev) => ({ ...prev, matId: selectedMaterials.matFrente || selectedMaterials.matInt }));
            setActiveRoomId(next.ambientes[0].id);
            const firstItem = next.ambientes[0].itens?.find(item => item.quick?.group !== 'extras');
            setSelectedItemId(firstItem?.id || '');
            setExpandedItem(null);
            setPickerOpen(false);
            setCompositionErrors({});
            setMaterialUpdateErrors([]);
            setRowInputs({});
            setRowErrors({});
            if (next.id) setSavedMeta({ id: next.id, numero: next.numero });
            savedFingerprint.current = next.id ? JSON.stringify(next) : '';
        }).catch((error) => { if (active) setLoadError(error.message || error.error || 'Não foi possível carregar os cadastros.'); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [adapter, loadAttempt]);

    useEffect(() => {
        if (!scrollTarget) return;
        const frame = requestAnimationFrame(() => {
            document.getElementById(`oq-furniture-${scrollTarget}`)?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            setScrollTarget('');
        });
        return () => cancelAnimationFrame(frame);
    }, [scrollTarget]);

    const catalog = useMemo(() => ({ caixas: setup?.caixas || [], componentes: setup?.componentes || [] }), [setup]);
    const presets = useMemo(() => listQuickPresets(catalog), [catalog]);
    const sheetOptions = useMemo(() => materialChoices(setup?.bibItems || []), [setup]);
    const frontOptions = useMemo(() => [...sheetOptions, ...(setup?.bibItems || []).filter(item => item.tipo === 'acabamento').map(item => ({ id: item.cod || `bib_${item.id}`, nome: item.nome, preco: number(item.preco_m2 ?? item.preco) }))], [sheetOptions, setup]);
    const hardwareOptions = useMemo(() => (setup?.bibItems || []).filter((item) => item.tipo === 'ferragem' || item.tipo === 'acessorio').map((item) => ({ id: item.cod || `bib_${item.id}`, nome: item.nome, unidade: item.unidade || 'un', categoria: cleanText(item.categoria) })), [setup]);
    const bib = useMemo(() => buildQuoteLibrary(setup?.bibItems || []), [setup]);
    const totals = useMemo(() => {
        try { return calculateQuote({ ambientes: draft.ambientes, taxas: draft.taxas, bib, padroes: draft.padroes, bibItems: setup?.bibItems || [], strictCatalog: true }); }
        catch (error) { return { valid: false, errors: [{ message: error.message || 'Não foi possível calcular este orçamento.' }], warnings: [] }; }
    }, [draft.ambientes, draft.taxas, draft.padroes, bib, setup]);
    const discount = useMemo(() => applyQuoteDiscount(number(totals.pvFinal), draft.pagamento?.desconto || { tipo: '%', valor: 0 }), [totals.pvFinal, draft.pagamento]);
    const activeRoom = draft.ambientes.find((room) => room.id === activeRoomId) || draft.ambientes[0];
    const allItems = draft.ambientes.flatMap((room) => room.itens || []);
    const compositionItem = activeRoom.itens?.find(item => item.id === expandedItem && item.quick?.group !== 'extras');
    const furnitureCount = allItems.filter((item) => item.quick?.group !== 'extras').reduce((sum, item) => sum + number(item.qtd || 1), 0);
    const calculationErrors = [...materialUpdateErrors, ...Object.values(compositionErrors).flat(), ...(totals.errors || []).map((error) => typeof error === 'string' ? error : error.message), ...(discount.errors || []).map((error) => typeof error === 'string' ? error : error.message), ...Object.values(rowErrors).flat()].filter(Boolean);
    const warnings = (totals.warnings || []).map((warning) => typeof warning === 'string' ? warning : warning.message).filter((message) => message && !calculationErrors.includes(message));
    const hasCalculation = allItems.length > 0 && calculationErrors.length === 0 && totals.valid !== false && discount.valid !== false;
    const currentFingerprint = JSON.stringify(draft);
    const isDirty = currentFingerprint !== savedFingerprint.current;
    const breakdown = totals.breakdown || {};
    const costLines = [
        ['Chapas e acabamentos', number(breakdown.chapasAdj) + number(breakdown.acabAdj)],
        ['Fitas de borda', number(breakdown.fitaAdj)],
        ['Ferragens e acessórios', number(breakdown.ferrVal) + number(breakdown.acessVal)],
        ['Mão de obra', number(breakdown.mdo)],
        ['Consumíveis', number(breakdown.consumiveisVal)],
    ];
    const extraCosts = number(totals.custoReal) - costLines.reduce((sum, [, value]) => sum + value, 0);
    if (Math.abs(extraCosts) > 0.01) costLines.push(['Outros ajustes de custo', extraCosts]);

    const changeDraft = (updates) => { setDraft((prev) => ({ ...prev, ...updates })); setSaveStatus(''); setActionError(''); };
    const changeRoom = (roomId, update) => { setDraft((prev) => ({ ...prev, ambientes: prev.ambientes.map((room) => room.id === roomId ? update(room) : room) })); setSaveStatus(''); setActionError(''); };

    const onCompositionValidation = useCallback((messages) => {
        if (!expandedItem) return;
        setCompositionErrors(prev => JSON.stringify(prev[expandedItem] || []) === JSON.stringify(messages || []) ? prev : { ...prev, [expandedItem]: messages || [] });
    }, [expandedItem]);
    const selectItem = id => {
        setSelectedItemId(id);
        setPickerOpen(false);
        setScrollTarget(id);
    };
    const replaceCompositionItem = item => {
        const previous = activeRoom.itens.find(entry => entry.id === item.id);
        if (previous && (previous.qtd !== item.qtd || ['l', 'a', 'p'].some(key => previous.dims?.[key] !== item.dims?.[key]))) {
            setRowInputs(prev => { const next = { ...prev }; delete next[item.id]; return next; });
            setRowErrors(prev => { const next = { ...prev }; delete next[item.id]; return next; });
        }
        changeRoom(activeRoom.id, room => ({ ...room, itens: room.itens.map(entry => entry.id === item.id ? item : entry) }));
    };
    const addCatalogBox = (caixaDef, dims) => {
        try {
            const item = createCatalogBoxItem(caixaDef, dims, materials, { ordem: activeRoom.itens?.length || 0 });
            changeRoom(activeRoom.id, room => ({ ...room, itens: [...(room.itens || []), item] }));
            selectItem(item.id);
        } catch (error) { setActionError(errorMessages(error).join(' ')); }
    };
    const addItem = (preset) => {
        try {
            const item = buildQuickItem(preset, preset.defaultDims, materials, { ordem: activeRoom.itens?.length || 0 });
            changeRoom(activeRoom.id, (room) => ({ ...room, itens: [...(room.itens || []), item] }));
            selectItem(item.id);
        } catch (error) { setActionError(errorMessages(error).join(' ')); }
    };

    const updateItem = (item, patch) => {
        const previousInputs = rowInputs[item.id] || {};
        const nextInputs = { ...previousInputs, ...patch };
        setRowInputs((prev) => ({ ...prev, [item.id]: nextInputs }));
        const dims = { l: nextInputs.l ?? item.dims?.l, a: nextInputs.a ?? item.dims?.a, p: nextInputs.p ?? item.dims?.p };
        try {
            const rebuild = item.composition?.mode === 'catalog' ? updateCatalogItem : rebuildQuickItem;
            const rebuilt = rebuild(item, {
                dims: { l: Number(dims.l), a: Number(dims.a), p: Number(dims.p) },
                qtd: Number(nextInputs.qtd ?? item.qtd ?? 1),
                ...(nextInputs.doorCount !== undefined ? { doorCount: Number(nextInputs.doorCount) } : {}),
                ...(nextInputs.shelfCount !== undefined ? { shelfCount: Number(nextInputs.shelfCount) } : {}),
                ...(nextInputs.drawerCount !== undefined ? { drawerCount: Number(nextInputs.drawerCount) } : {}),
            });
            changeRoom(activeRoom.id, (room) => ({ ...room, itens: room.itens.map((entry) => entry.id === item.id ? rebuilt : entry) }));
            setRowErrors((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
        } catch (error) { setRowErrors((prev) => ({ ...prev, [item.id]: errorMessages(error).map((message) => `${itemLabel(item)}: ${message}`) })); }
    };

    const applyMaterials = (field, value) => {
        const nextMaterials = { ...materials, [field]: value };
        setMaterials(nextMaterials);
        setActionError('');
        setMaterialUpdateErrors([]);
        try {
            const ambientes = draft.ambientes.map(room => ({
                ...room, matInt: nextMaterials.matInt, matExt: '',
                itens: (room.itens || []).map(item => {
                    if (item.quick?.group === 'extras') return item;
                    if (item._matCustom) {
                        return field === 'matFrente' && item.composition?.frontCustom === false
                            ? updateCatalogItem(item, { materials: { matFrente: nextMaterials.matFrente } })
                            : item;
                    }
                    const itemMaterials = { ...nextMaterials, ...(item.composition?.frontCustom ? { matFrente: item.composition.matFrente } : {}) };
                    return item.composition?.mode === 'catalog'
                        ? updateCatalogItem(item, { materials: itemMaterials })
                        : rebuildQuickItem(item, { materials: itemMaterials });
                }),
            }));
            changeDraft({ ambientes, materials: nextMaterials });
        } catch (error) {
            const messages = errorMessages(error);
            setMaterialUpdateErrors(messages);
            setActionError(messages.join(' '));
        }
    };

    const removeItem = (item) => {
        if (expandedItem === item.id) setExpandedItem(null);
        if (selectedItemId === item.id) setSelectedItemId('');
        setCompositionErrors(prev => { const next = { ...prev }; delete next[item.id]; return next; });
        setUndo({ roomId: activeRoom.id, item, index: activeRoom.itens.findIndex((entry) => entry.id === item.id) });
        changeRoom(activeRoom.id, (room) => ({ ...room, itens: room.itens.filter((entry) => entry.id !== item.id) }));
        setRowErrors((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
        setRowInputs((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
    };

    const duplicateItem = (item) => {
        const copy = JSON.parse(JSON.stringify(item));
        copy.id = uid();
        copy.componentes = (copy.componentes || []).map((component) => ({ ...component, id: uid() }));
        changeRoom(activeRoom.id, (room) => ({ ...room, itens: [...room.itens, copy] }));
        selectItem(copy.id);
    };

    const restoreItem = () => {
        if (!undo) return;
        changeRoom(undo.roomId, (room) => { const itens = [...room.itens]; itens.splice(undo.index, 0, undo.item); return { ...room, itens }; });
        setActiveRoomId(undo.roomId);
        selectItem(undo.item.id);
        setUndo(null);
    };

    const addRoom = () => {
        const room = newRoom(`Ambiente ${draft.ambientes.length + 1}`);
        changeDraft({ ambientes: [...draft.ambientes, room] });
        setActiveRoomId(room.id);
        setExpandedItem(null);
        setSelectedItemId('');
        setCompositionErrors({});
        setPickerOpen(false);
    };

    const addExtra = () => {
        try {
            const item = buildQuickExtra({ tipo: extra.tipo, dims: { l: Number(extra.l), a: Number(extra.a) }, qtd: Number(extra.qtd), matId: extra.matId || materials.matFrente, ordem: activeRoom.itens?.length || 0 });
            changeRoom(activeRoom.id, (room) => ({ ...room, itens: [...(room.itens || []), item] }));
            setExtraError('');
            selectItem(item.id);
        } catch (error) { setExtraError(errorMessages(error).join(' ')); }
    };

    const closeComposition = useCallback(() => { setExpandedItem(null); setCompositionErrors({}); }, []);
    const customizeItem = item => {
        setSelectedItemId(item.id);
        setExpandedItem(item.id);
        setCompositionErrors({});
    };
    const applyQuickChange = (item, operation) => {
        try { replaceCompositionItem(operation(item)); }
        catch (error) { setActionError(`${itemLabel(item)}: ${errorMessages(error).join(' ')}`); }
    };
    const controlsById = useMemo(() => Object.fromEntries((activeRoom.itens || []).map(item => [item.id,
        getQuickItemControls(item, catalog, setup?.bibItems || [], draft.padroes),
    ])), [activeRoom.itens, catalog, setup?.bibItems, draft.padroes]);

    const save = async (openEditor = false) => {
        if (savingRef.current || saving) return;
        setShowValidation(true);
        setActionError('');
        if (!draft.clienteId) { setActionError('Selecione o cliente deste orçamento.'); return; }
        if (!draft.projeto.trim()) { setActionError('Informe o nome do projeto.'); return; }
        if (draft.ambientes.some((room) => !room.nome?.trim())) { setActionError('Dê um nome a cada ambiente.'); return; }
        if (!allItems.length) { setActionError('Adicione ao menos um móvel ao orçamento.'); return; }
        if (!hasCalculation) { setActionError('Revise as pendências do cálculo antes de salvar.'); return; }
        if (!adapter?.saveQuote) { setActionError('Não foi possível conectar o salvamento.'); return; }
        savingRef.current = true;
        setSaving(true);
        try {
            const saved = await adapter.saveQuote({
                id: draft.id,
                clienteId: draft.clienteId,
                projeto: draft.projeto.trim(),
                ambientes: draft.ambientes,
                taxas: draft.taxas,
                padroes: draft.padroes,
                pagamento: draft.pagamento,
                totals: { ...totals, ...discount },
                obs: draft.obs,
                materials,
            });
            if (!saved?.id) throw new Error('O salvamento não retornou a identificação do orçamento.');
            const nextDraft = { ...draft, id: saved.id };
            savedFingerprint.current = JSON.stringify(nextDraft);
            setDraft((prev) => ({ ...prev, id: saved.id }));
            setSavedMeta(saved);
            setSaveStatus(isDemo ? 'Demonstração salva neste navegador.' : 'Orçamento salvo.');
            notify?.(isDemo ? 'Demonstração salva neste navegador.' : 'Orçamento salvo.');
            if (openEditor) onOpenEditor?.(saved);
        } catch (error) { setActionError(error.message || error.error || 'Não foi possível salvar. Seus dados continuam nesta tela.'); }
        finally { savingRef.current = false; setSaving(false); }
    };

    if (loading) return <div className="orcamento-rapido"><div className="oq-loading" role="status"><Loader2 size={24} className="oq-spin" /><h1>Preparando seu orçamento</h1><p>Carregando clientes, modelos e materiais.</p></div></div>;
    if (loadError) return <div className="orcamento-rapido"><div className="oq-loading"><h1>Não foi possível abrir os cadastros</h1><p>{loadError}</p><button type="button" className="oq-button oq-button-dark" onClick={() => setLoadAttempt((value) => value + 1)}>Tentar novamente</button>{onBack && <button type="button" className="oq-button oq-button-plain" onClick={onBack}>Voltar aos orçamentos</button>}</div></div>;

    return <div className="orcamento-rapido">
        <div className="oq-screen" inert={compositionItem ? '' : undefined}>
            {isDemo && <div className="oq-demo-banner"><strong>Demonstração</strong><span>Preços ilustrativos · salvamento neste navegador</span></div>}
            <header className="oq-page-header">
                <div>{onBack && <button type="button" className="oq-back" onClick={onBack} disabled={saving}><ArrowLeft size={15} /> Orçamentos</button>}<h1>Orçamento rápido</h1><p>Escolha o móvel e ajuste o que muda.</p></div>
                <div className="oq-save-meta"><strong>{savedMeta?.numero || (savedMeta ? 'Orçamento salvo' : 'Novo orçamento')}</strong><span>{savedMeta ? isDirty ? 'Alterações não salvas' : <><Check size={13} /> Salvo</> : 'Rascunho'}</span></div>
            </header>
            <div className="oq-workspace">
                <main className="oq-main">
                    <section className="oq-project" aria-label="Cliente e projeto">
                        <Field label="Cliente" error={showValidation && !draft.clienteId ? 'Selecione o cliente para salvar.' : ''}><select value={draft.clienteId || ''} onChange={event => changeDraft({ clienteId: event.target.value })} aria-required="true"><option value="">Selecionar cliente</option>{(setup.clientes || []).map(client => <option key={client.id} value={client.id}>{client.nome}</option>)}</select></Field>
                        <Field label="Projeto" error={showValidation && !draft.projeto.trim() ? 'Informe o projeto.' : ''}><input value={draft.projeto} onChange={event => changeDraft({ projeto: event.target.value })} placeholder="Ex.: Cozinha · Apartamento Renascença" maxLength={180} aria-required="true" /></Field>
                    </section>

                    <details className="oq-defaults">
                        <summary><span><SlidersHorizontal size={16} /> Padrões do orçamento</span><small>Materiais e ferragens</small><ChevronDown size={16} /></summary>
                        <div className="oq-defaults-content">
                            <div className="oq-material-grid">{[['Corpo', 'matInt'], ['Fundo', 'matFundo'], ['Frentes', 'matFrente']].map(([label, key]) => <Field key={key} label={label}><select value={materials[key] || ''} onChange={event => applyMaterials(key, event.target.value)}><option value="">Selecionar material</option>{(key === 'matFrente' ? frontOptions : sheetOptions).map(material => <option key={material.id} value={material.id}>{material.nome}{material.preco <= 0 ? ' · sem preço' : ''}</option>)}</select></Field>)}</div>
                            <div className="oq-hardware-grid">{[['Puxador', 'puxador'], ['Dobradiça', 'dobradica'], ['Corrediça', 'corredica'], ['Articulador', 'articulador']].map(([label, key]) => <Field key={key} label={label}><select value={draft.padroes?.[key] || ''} onChange={event => changeDraft({ padroes: { ...draft.padroes, [key]: event.target.value } })}><option value="">Padrão do modelo</option>{key === 'puxador' && <option value="__none__">Sem puxador</option>}{hardwareOptions.filter(hardware => hardware.categoria === key && (key === 'puxador' ? normalizeHardwareUnit(hardware.unidade) === 'un' : normalizeHardwareUnit(hardware.unidade) !== 'm')).map(hardware => <option key={hardware.id} value={hardware.id}>{hardware.nome}</option>)}</select></Field>)}</div>
                            <p className="oq-note">Cada móvel começa com estes padrões. As escolhas individuais são preservadas.</p>
                        </div>
                    </details>

                    <section className="oq-composition" aria-label="Móveis por ambiente">
                        <div className="oq-room-tabs" role="tablist" aria-label="Ambientes">{draft.ambientes.map(room => <button type="button" key={room.id} role="tab" aria-selected={room.id === activeRoom.id} className={room.id === activeRoom.id ? 'is-active' : ''} onClick={() => { setActiveRoomId(room.id); setSelectedItemId(room.itens?.[0]?.id || ''); setPickerOpen(false); }}>{room.nome || 'Sem nome'}<span>{(room.itens || []).length}</span></button>)}<button type="button" className="oq-add-room" onClick={addRoom}><Plus size={14} /> Ambiente</button></div>
                        <div className="oq-room-heading"><div><input className="oq-room-name" aria-label="Nome do ambiente" value={activeRoom.nome} onChange={event => changeRoom(activeRoom.id, room => ({ ...room, nome: event.target.value }))} maxLength={100} /><span>Medidas em milímetros</span></div><button type="button" className="oq-button oq-button-dark" aria-expanded={pickerOpen || !activeRoom.itens?.length} onClick={() => setPickerOpen(value => !value)}><Plus size={17} /> Adicionar móvel</button></div>

                        {actionError && <div className="oq-action-error" role="alert">{actionError}</div>}
                        {undo && <div className="oq-undo"><span>{itemLabel(undo.item)} removido.</span><button type="button" onClick={restoreItem}><RotateCcw size={14} /> Desfazer</button></div>}
                        {(pickerOpen || !activeRoom.itens?.length) && <QuickFurniturePicker catalog={catalog} presets={presets} onAddPreset={addItem} onAddBox={addCatalogBox} onClose={activeRoom.itens?.length ? () => setPickerOpen(false) : undefined} />}

                        <div className="oq-furniture-list">{(activeRoom.itens || []).map((item, index) => <div key={item.id} id={`oq-furniture-${item.id}`}>
                            <QuickFurnitureCard item={item} index={index} itemCost={readItemCost(totals, item.id)} inputs={rowInputs[item.id] || {}} errors={[...(rowErrors[item.id] || []), ...(totals.errors || []).filter(error => error.itemId === item.id).map(error => error.message)]} controls={controlsById[item.id]} materialOptions={frontOptions} handleOptions={controlsById[item.id]?.handle?.options || []} globalMaterials={materials} expanded={selectedItemId === item.id} onSelect={() => setSelectedItemId(selectedItemId === item.id ? '' : item.id)} onDimensions={patch => updateItem(item, patch)} onCount={(type, value) => applyQuickChange(item, current => setQuickItemCount(current, type, value, catalog, materials))} onHandle={choice => applyQuickChange(item, current => setQuickItemHandle(current, choice, setup.bibItems || []))} onFrontMaterial={choice => applyQuickChange(item, current => setQuickItemFrontMaterial(current, choice, materials))} onCustomize={item.quick?.group === 'extras' ? undefined : () => customizeItem(item)} onDuplicate={() => duplicateItem(item)} onRemove={() => removeItem(item)} />
                        </div>)}</div>

                        <details className="oq-extras"><summary><span><Plus size={15} /> Adicionar lateral, rodapé ou fechamento</span><ChevronDown size={16} /></summary><div className="oq-extra-content"><div className="oq-extra-grid"><Field label="Peça"><select value={extra.tipo} onChange={event => setExtra(prev => ({ ...prev, tipo: event.target.value }))}><option value="lateral">Lateral de acabamento</option><option value="rodape">Rodapé</option><option value="fechamento">Fechamento</option></select></Field><Field label="Largura · mm"><input type="number" min="1" step="1" value={extra.l} onChange={event => setExtra(prev => ({ ...prev, l: event.target.value }))} inputMode="numeric" /></Field><Field label="Altura · mm"><input type="number" min="1" step="1" value={extra.a} onChange={event => setExtra(prev => ({ ...prev, a: event.target.value }))} inputMode="numeric" /></Field><Field label="Quantidade"><input type="number" min="1" step="1" value={extra.qtd} onChange={event => setExtra(prev => ({ ...prev, qtd: event.target.value }))} inputMode="numeric" /></Field></div><div className="oq-extra-material"><Field label="Material"><select value={extra.matId || ''} onChange={event => setExtra(prev => ({ ...prev, matId: event.target.value }))}><option value="">Material das frentes</option>{sheetOptions.map(material => <option key={material.id} value={material.id}>{material.nome}</option>)}</select></Field><button type="button" className="oq-button oq-button-dark" onClick={addExtra}><Plus size={15} /> Adicionar peça</button></div>{extraError && <p className="oq-field-error" role="alert">{extraError}</p>}</div></details>
                    </section>

                    <details className="oq-observations"><summary>Observações do orçamento <ChevronDown size={16} /></summary><textarea aria-label="Observações do orçamento" rows={3} value={draft.obs || ''} onChange={event => changeDraft({ obs: event.target.value })} placeholder="Escopo, acabamentos e combinações com o cliente." /></details>
                </main>

                <aside className="oq-sidebar" aria-label="Resumo do orçamento">
                    <section className="oq-total-card"><span className="oq-total-label">Preço de venda</span><strong className="oq-price" aria-live="polite">{hasCalculation ? money(discount.pvComDesconto) : allItems.length ? 'Revisar cálculo' : 'R$ —'}</strong><p>{furnitureCount} {furnitureCount === 1 ? 'móvel' : 'móveis'} · {draft.ambientes.length} {draft.ambientes.length === 1 ? 'ambiente' : 'ambientes'}</p>{number(discount.descontoR) > 0 && <small>{money(totals.pvFinal)} antes do desconto</small>}<div className="oq-manufacture-cost"><span>Custo de fabricação</span><strong>{allItems.length ? money(totals.custoReal) : '—'}</strong></div><div className="oq-summary-actions"><button type="button" className="oq-button oq-button-dark" onClick={() => save(false)} disabled={saving}>{saving && <Loader2 size={16} className="oq-spin" />}{saving ? 'Salvando…' : 'Salvar orçamento'}</button><button type="button" className="oq-button" onClick={() => save(true)} disabled={saving}>{isDemo ? 'Ver proposta' : 'Continuar no ERP'}<ArrowUpRight size={16} /></button></div>{saveStatus && <p className="oq-save-success" role="status"><Check size={14} /> {saveStatus}</p>}</section>

                    <details className="oq-cost-details"><summary>Ver custos <ChevronDown size={16} /></summary><dl>{costLines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{allItems.length ? money(value) : '—'}</dd></div>)}</dl></details>
                    <details className="oq-rates"><summary>Taxas e desconto <ChevronDown size={16} /></summary><div className="oq-rates-content"><div className="oq-rate-grid">{[['Impostos', 'imp'], ['Comissão', 'com'], ['Lucro configurado', 'lucro'], ['Instalação', 'inst'], ['Frete', 'frete']].map(([label, key]) => <Field key={key} label={label}><div className="oq-percent-input"><input type="number" min="0" step="0.1" value={draft.taxas[key] ?? ''} onChange={event => changeDraft({ taxas: { ...draft.taxas, [key]: event.target.value === '' ? '' : Number(event.target.value) } })} inputMode="decimal" /><span>%</span></div></Field>)}</div><div className="oq-discount"><span className="oq-label">Desconto comercial</span><div><select aria-label="Tipo de desconto" value={draft.pagamento?.desconto?.tipo || '%'} onChange={event => changeDraft({ pagamento: { ...draft.pagamento, desconto: { ...draft.pagamento?.desconto, tipo: event.target.value } } })}><option value="%">%</option><option value="R$">R$</option></select><input aria-label="Valor do desconto" type="number" min="0" step="0.1" value={draft.pagamento?.desconto?.valor ?? 0} onChange={event => changeDraft({ pagamento: { ...draft.pagamento, desconto: { ...draft.pagamento?.desconto, valor: event.target.value === '' ? '' : Number(event.target.value) } } })} inputMode="decimal" /></div></div><p className="oq-note">Lucro configurado é um parâmetro de preço, não a margem real apurada.</p></div></details>
                    <PendingList messages={calculationErrors} />
                    {warnings.length > 0 && <details className="oq-assumptions"><summary>Premissas do cálculo <ChevronDown size={16} /></summary><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
                </aside>
            </div>
            <div className="oq-mobile-total"><div><span>Preço de venda</span><strong>{hasCalculation ? money(discount.pvComDesconto) : allItems.length ? 'Revisar cálculo' : 'R$ —'}</strong></div><button type="button" className="oq-button oq-button-dark" onClick={() => save(false)} disabled={saving}>{saving ? 'Salvando…' : 'Salvar orçamento'}</button></div>
        </div>
        {compositionItem && <CompositionDialog onClose={closeComposition} label={`Personalizar ${itemLabel(compositionItem)}`}><QuoteCompositionEditor key={compositionItem.id} item={compositionItem} catalog={catalog} bibItems={setup.bibItems || []} materials={materials} padroes={draft.padroes} onChange={replaceCompositionItem} onValidationChange={onCompositionValidation} onClose={closeComposition} /></CompositionDialog>}
    </div>;
}

function CompositionDialog({ children, onClose, label }) {
    const dialogRef = useRef(null);
    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const dialog = dialogRef.current;
        const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]')].filter(element => element.getClientRects().length);
        (focusable()[0] || dialog).focus();
        const handleKey = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
            if (event.key !== 'Tab') return;
            const elements = focusable();
            if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
            const first = elements[0], last = elements.at(-1);
            if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        };
        dialog.addEventListener('keydown', handleKey);
        return () => { dialog.removeEventListener('keydown', handleKey); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
    }, [onClose]);
    return <div className="oq-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="oq-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>;
}
