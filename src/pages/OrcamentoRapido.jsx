import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Copy, Loader2, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { applyQuoteDiscount, buildQuoteLibrary, calculateQuote } from '../quoteCalculator';
import { buildQuickExtra, buildQuickItem, createQuickKitchenExample, listQuickPresets, rebuildQuickItem } from '../quickQuote';
import { addCatalogComponent, addLooseHardware, createCatalogBoxItem, normalizeHardwareUnit, updateCatalogItem } from '../quoteComposition';
import QuoteCompositionEditor from './QuoteCompositionEditor';
import QuoteCatalogBrowser from './QuoteCatalogBrowser';
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
            setExpandedItem(firstItem?.id || null);
            setCompositionErrors({});
            setMaterialUpdateErrors([]);
            setRowInputs({});
            setRowErrors({});
            if (next.id) setSavedMeta({ id: next.id, numero: next.numero });
            savedFingerprint.current = next.id ? JSON.stringify(next) : '';
        }).catch((error) => { if (active) setLoadError(error.message || error.error || 'Não foi possível carregar os cadastros.'); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [adapter, loadAttempt]);

    const catalog = useMemo(() => ({ caixas: setup?.caixas || [], componentes: setup?.componentes || [] }), [setup]);
    const presets = useMemo(() => listQuickPresets(catalog), [catalog]);
    const sheetOptions = useMemo(() => materialChoices(setup?.bibItems || []), [setup]);
    const hardwareOptions = useMemo(() => (setup?.bibItems || []).filter((item) => item.tipo === 'ferragem' || item.tipo === 'acessorio').map((item) => ({ id: item.cod || `bib_${item.id}`, nome: item.nome, unidade: item.unidade || 'un', categoria: cleanText(item.categoria) })), [setup]);
    const bib = useMemo(() => buildQuoteLibrary(setup?.bibItems || []), [setup]);
    const totals = useMemo(() => {
        try { return calculateQuote({ ambientes: draft.ambientes, taxas: draft.taxas, bib, padroes: draft.padroes, bibItems: setup?.bibItems || [], strictCatalog: true }); }
        catch (error) { return { valid: false, errors: [{ message: error.message || 'Não foi possível calcular este orçamento.' }], warnings: [] }; }
    }, [draft.ambientes, draft.taxas, draft.padroes, bib, setup]);
    const discount = useMemo(() => applyQuoteDiscount(number(totals.pvFinal), draft.pagamento?.desconto || { tipo: '%', valor: 0 }), [totals.pvFinal, draft.pagamento]);
    const activeRoom = draft.ambientes.find((room) => room.id === activeRoomId) || draft.ambientes[0];
    const allItems = draft.ambientes.flatMap((room) => room.itens || []);
    const selectedItem = activeRoom.itens?.find(item => item.id === selectedItemId) || activeRoom.itens?.find(item => item.quick?.group !== 'extras');
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
        setExpandedItem(id || null);
        if (expandedItem !== id) setCompositionErrors({});
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
    const addComponentToSelected = compDef => {
        if (!selectedItem) { setActionError('Selecione uma caixa ou móvel para adicionar o componente.'); return; }
        try {
            const matFrente = selectedItem.composition?.matFrente || selectedItem.componentes?.find(ci => ci.matExtComp)?.matExtComp || materials.matFrente;
            replaceCompositionItem(addCatalogComponent(selectedItem, compDef, { qtd: 1, matExtComp: matFrente }));
            selectItem(selectedItem.id);
        } catch (error) { setActionError(errorMessages(error).join(' ')); }
    };
    const addHardwareToSelected = hardware => {
        if (!selectedItem) { setActionError('Selecione uma caixa ou móvel para adicionar a ferragem.'); return; }
        try {
            replaceCompositionItem(addLooseHardware(selectedItem, hardware, { quantity: 1 }));
            selectItem(selectedItem.id);
        } catch (error) { setActionError(errorMessages(error).join(' ')); }
    };


    const addItem = (preset) => {
        try {
            const item = buildQuickItem(preset, preset.defaultDims, materials, { ordem: activeRoom.itens?.length || 0 });
            changeRoom(activeRoom.id, (room) => ({ ...room, itens: [...(room.itens || []), item] }));
            selectItem(item.id);
        } catch (error) { setActionError(errorMessages(error).join(' ')); }
    };

    const addExample = () => {
        try {
            const example = createQuickKitchenExample(catalog, materials);
            changeRoom(activeRoom.id, (room) => ({ ...room, itens: [...(room.itens || []), ...(example.itens || [])] }));
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
                    if (item.quick?.group === 'extras' || item._matCustom) return item;
                    return item.composition?.mode === 'catalog'
                        ? updateCatalogItem(item, { materials: nextMaterials })
                        : rebuildQuickItem(item, { materials: nextMaterials });
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
    };

    const restoreItem = () => {
        if (!undo) return;
        changeRoom(undo.roomId, (room) => { const itens = [...room.itens]; itens.splice(undo.index, 0, undo.item); return { ...room, itens }; });
        setUndo(null);
    };

    const addRoom = () => {
        const room = newRoom(`Ambiente ${draft.ambientes.length + 1}`);
        changeDraft({ ambientes: [...draft.ambientes, room] });
        setActiveRoomId(room.id);
        setExpandedItem(null);
        setSelectedItemId('');
        setCompositionErrors({});
    };

    const addExtra = () => {
        try {
            const item = buildQuickExtra({ tipo: extra.tipo, dims: { l: Number(extra.l), a: Number(extra.a) }, qtd: Number(extra.qtd), matId: extra.matId || materials.matFrente, ordem: activeRoom.itens?.length || 0 });
            changeRoom(activeRoom.id, (room) => ({ ...room, itens: [...(room.itens || []), item] }));
            setExtraError('');
        } catch (error) { setExtraError(errorMessages(error).join(' ')); }
    };

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
        {isDemo && <div className="oq-demo-banner"><span className="oq-demo-tag">DEMONSTRAÇÃO</span><span>Materiais e valores ilustrativos. Os dados são salvos somente neste navegador.</span></div>}
        <header className="oq-page-header">
            <div>{onBack && <button type="button" className="oq-back" onClick={onBack} disabled={saving}><ArrowLeft size={15} /> Orçamentos</button>}<div className="oq-title-row"><h1>Orçamento rápido</h1><span className="oq-version">COMPOSIÇÃO LIVRE</span></div><p>Caixas, componentes, puxadores e acessórios do catálogo, no mesmo orçamento.</p></div>
            <div className="oq-save-meta">{savedMeta ? <><span className="oq-saved-id">{savedMeta.numero ? `Orçamento ${savedMeta.numero}` : 'Orçamento salvo'}</span><span>{isDirty ? 'Alterações ainda não salvas' : <><Check size={13} /> Tudo salvo</>}</span></> : <><span className="oq-saved-id">Novo orçamento</span><span>Rascunho em edição</span></>}</div>
        </header>

        <div className="oq-workspace">
            <main className="oq-main">
                <section className="oq-panel oq-identification" aria-label="Cliente e projeto">
                    <Field label="Cliente" error={showValidation && !draft.clienteId ? 'Selecione um cliente.' : ''}><select value={draft.clienteId || ''} onChange={(event) => changeDraft({ clienteId: event.target.value })} aria-required="true"><option value="">Selecionar cliente</option>{(setup.clientes || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select>{!setup.clientes?.length && <span className="oq-field-hint">Cadastre o cliente no ERP para salvar a proposta.</span>}</Field>
                    <Field label="Nome do projeto" error={showValidation && !draft.projeto.trim() ? 'Informe o projeto.' : ''}><input value={draft.projeto} onChange={(event) => changeDraft({ projeto: event.target.value })} placeholder="Ex.: Cozinha · Apartamento Renascença" maxLength={180} aria-required="true" /></Field>
                </section>

                <section className="oq-panel oq-material-panel">
                    <div className="oq-section-heading"><div><span className="oq-step">01</span><h2>Materiais e ferragens</h2></div><span className="oq-section-caption">Padrão para todos os móveis</span></div>
                    <div className="oq-material-grid">{[['Corpo', 'matInt'], ['Fundo', 'matFundo'], ['Frentes', 'matFrente']].map(([label, key]) => <Field key={key} label={label}><select value={materials[key] || ''} onChange={(event) => applyMaterials(key, event.target.value)}><option value="">Selecionar material</option>{sheetOptions.map((material) => <option key={material.id} value={material.id}>{material.nome}{material.esp && !material.nome.includes(String(material.esp)) ? ` · ${material.esp} mm` : ''}{material.preco <= 0 ? ' · sem preço' : ''}</option>)}</select></Field>)}</div>
                    <div className="oq-hardware-grid">{[['Dobradiças', 'dobradica'], ['Corrediças', 'corredica'], ['Puxadores', 'puxador'], ['Articuladores', 'articulador']].map(([label, key]) => <Field key={key} label={label}><select value={draft.padroes?.[key] || ''} onChange={(event) => changeDraft({ padroes: { ...draft.padroes, [key]: event.target.value } })}><option value="">Padrão da receita</option>{key === 'puxador' && <option value="__none__">Sem puxador</option>}{hardwareOptions.filter((hardware) => hardware.categoria === key && (key === 'puxador' ? normalizeHardwareUnit(hardware.unidade) === 'un' : normalizeHardwareUnit(hardware.unidade) !== 'm')).map((hardware) => <option key={hardware.id} value={hardware.id}>{hardware.nome}</option>)}</select></Field>)}</div>
                    <p className="oq-panel-note">Você pode trocar materiais e ferragens individualmente em “Editar composição”. Puxadores por metro entram como acessórios com a metragem informada.</p>
                </section>

                <section className="oq-panel oq-composition">
                    <div className="oq-section-heading"><div><span className="oq-step">02</span><h2>Composição dos ambientes</h2></div><span className="oq-section-caption">Medidas em milímetros</span></div>
                    <div className="oq-room-tabs" role="tablist" aria-label="Ambientes">{draft.ambientes.map((room) => <button type="button" key={room.id} role="tab" aria-selected={room.id === activeRoom.id} className={room.id === activeRoom.id ? 'is-active' : ''} onClick={() => { setActiveRoomId(room.id); setExpandedItem(null); setSelectedItemId(''); setCompositionErrors({}); }}>{room.nome || 'Sem nome'}<span>{(room.itens || []).length}</span></button>)}<button type="button" className="oq-add-room" onClick={addRoom}><Plus size={14} /> Ambiente</button></div>
                    <div className="oq-room-toolbar"><Field label="Ambiente"><input value={activeRoom.nome} onChange={(event) => changeRoom(activeRoom.id, (room) => ({ ...room, nome: event.target.value }))} maxLength={100} aria-label="Nome do ambiente" /></Field><button type="button" className="oq-example-button" onClick={addExample}><Plus size={14} /> Adicionar cozinha de exemplo</button></div>

                    <QuoteCatalogBrowser catalog={catalog} presets={presets} bibItems={setup.bibItems || []} selectedItem={selectedItem} items={activeRoom.itens || []} onSelectItem={selectItem} onAddBox={addCatalogBox} onAddPreset={addItem} onAddComponent={addComponentToSelected} onAddHardware={addHardwareToSelected} />
                    <div className="oq-furniture-heading"><h3>Móveis deste ambiente</h3><span>Selecione um móvel para editar sua composição.</span></div>

                    {actionError && <div className="oq-action-error" role="alert">{actionError}</div>}
                    {undo && <div className="oq-undo"><span>{itemLabel(undo.item)} removido.</span><button type="button" onClick={restoreItem}><RotateCcw size={13} /> Desfazer</button></div>}

                    {!activeRoom.itens?.length ? <div className="oq-empty"><div className="oq-empty-mark" aria-hidden="true"><span /><span /></div><h3>Seu ambiente começa aqui</h3><p>Adicione uma caixa do catálogo e componha com portas, gavetas, puxadores e ferragens.</p><span>Você também pode adicionar uma cozinha de exemplo.</span></div> : <div className="oq-table-wrap"><table className="oq-items-table"><thead><tr><th>Móvel</th><th>Largura</th><th>Altura</th><th>Profund.</th><th>Qtd.</th><th className="oq-cost-heading" title="Materiais, fita e ferragens, considerando a quantidade da linha">Insumos</th><th><span className="oq-sr-only">Ações</span></th></tr></thead><tbody>{activeRoom.itens.map((item, index) => {
                        const inputs = rowInputs[item.id] || {};
                        const isExtra = item.quick?.group === 'extras';
                        const itemCost = readItemCost(totals, item.id);
                        const expanded = expandedItem === item.id;
                        const counts = item.quick?.counts || {};
                        return <ItemRows key={item.id} item={item} index={index} inputs={inputs} expanded={expanded} isExtra={isExtra} counts={counts} itemCost={itemCost} errors={rowErrors[item.id] || []} updateItem={updateItem} toggle={() => { if (expanded) { setExpandedItem(null); setCompositionErrors({}); } else selectItem(item.id); }} remove={() => removeItem(item)} duplicate={() => duplicateItem(item)} />;
                    })}</tbody></table></div>}

                    {compositionItem && <div className="oq-composition-detail"><QuoteCompositionEditor key={compositionItem.id} item={compositionItem} catalog={catalog} bibItems={setup.bibItems || []} materials={materials} padroes={draft.padroes} onChange={replaceCompositionItem} onValidationChange={onCompositionValidation} onClose={() => { setExpandedItem(null); setCompositionErrors({}); }} /></div>}

                    <details className="oq-extras"><summary><span><Plus size={16} /> Laterais, rodapés e fechamentos</span><ChevronDown size={16} /></summary><div className="oq-extra-content"><p>Adicione as peças complementares uma vez, com suas próprias medidas.</p><div className="oq-extra-grid"><Field label="Peça"><select value={extra.tipo} onChange={(event) => setExtra((prev) => ({ ...prev, tipo: event.target.value }))}><option value="lateral">Lateral de acabamento</option><option value="rodape">Rodapé</option><option value="fechamento">Fechamento</option></select></Field><Field label="Largura · mm"><input type="number" min="1" step="1" value={extra.l} onChange={(event) => setExtra((prev) => ({ ...prev, l: event.target.value }))} inputMode="numeric" /></Field><Field label="Altura · mm"><input type="number" min="1" step="1" value={extra.a} onChange={(event) => setExtra((prev) => ({ ...prev, a: event.target.value }))} inputMode="numeric" /></Field><Field label="Quantidade"><input type="number" min="1" step="1" value={extra.qtd} onChange={(event) => setExtra((prev) => ({ ...prev, qtd: event.target.value }))} inputMode="numeric" /></Field></div><div className="oq-extra-material"><Field label="Material da peça"><select value={extra.matId || ''} onChange={(event) => setExtra((prev) => ({ ...prev, matId: event.target.value }))}><option value="">Usar material das frentes</option>{sheetOptions.map((material) => <option key={material.id} value={material.id}>{material.nome}</option>)}</select></Field><button type="button" className="oq-button oq-button-dark" onClick={addExtra}><Plus size={15} /> Adicionar peça</button></div>{extraError && <p className="oq-field-error" role="alert">{extraError}</p>}</div></details>
                </section>

                <section className="oq-panel oq-notes"><Field label="Observações do orçamento" hint="Escopo, detalhes de acabamento e combinações com o cliente."><textarea rows={2} value={draft.obs || ''} onChange={(event) => changeDraft({ obs: event.target.value })} placeholder="Ex.: bancada e eletrodomésticos fornecidos pelo cliente." /></Field></section>
            </main>

            <aside className="oq-sidebar" aria-label="Resumo do orçamento">
                <section className="oq-summary"><div className="oq-summary-eyebrow">RESUMO DO ORÇAMENTO</div><div className="oq-summary-title"><h2>{draft.projeto || 'Seu projeto'}</h2><span>{furnitureCount} {furnitureCount === 1 ? 'móvel' : 'móveis'} · {draft.ambientes.length} {draft.ambientes.length === 1 ? 'ambiente' : 'ambientes'}</span></div><dl className="oq-cost-list">{costLines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{allItems.length ? money(value) : '—'}</dd></div>)}</dl><div className="oq-cost-total"><span>Custo de fabricação</span><strong>{allItems.length ? money(totals.custoReal) : '—'}</strong></div><div className="oq-sale-total"><span>Preço de venda</span><strong>{hasCalculation ? money(discount.pvComDesconto) : allItems.length ? 'Revisar cálculo' : 'R$ —'}</strong>{number(discount.descontoR) > 0 && <small>{money(totals.pvFinal)} antes do desconto de {money(discount.descontoR)}</small>}<p>{hasCalculation ? 'Atualizado com os materiais e as regras de preço selecionados.' : allItems.length ? 'Conclua as pendências para obter o preço.' : 'Adicione o primeiro móvel para calcular.'}</p></div><div className="oq-summary-actions"><button type="button" className="oq-button oq-button-light" onClick={() => save(false)} disabled={saving}>{saving ? <Loader2 size={16} className="oq-spin" /> : null}{saving ? 'Salvando…' : 'Salvar orçamento'}</button><button type="button" className="oq-button oq-button-outline-light" onClick={() => save(true)} disabled={saving}>{isDemo ? 'Ver proposta' : 'Abrir editor completo'}<ArrowUpRight size={16} /></button></div>{saveStatus && <p className="oq-save-success" role="status"><Check size={14} /> {saveStatus}</p>}</section>

                <details className="oq-panel oq-rates"><summary><span><SlidersHorizontal size={16} /> Taxas e desconto</span><ChevronDown size={16} /></summary><div className="oq-rates-content"><p>Percentuais usados na formação do preço.</p><div className="oq-rate-grid">{[['Impostos', 'imp'], ['Comissão', 'com'], ['Lucro configurado', 'lucro'], ['Instalação', 'inst'], ['Frete', 'frete']].map(([label, key]) => <Field key={key} label={label}><div className="oq-percent-input"><input type="number" min="0" step="0.1" value={draft.taxas[key] ?? ''} onChange={(event) => changeDraft({ taxas: { ...draft.taxas, [key]: event.target.value === '' ? '' : Number(event.target.value) } })} inputMode="decimal" /><span>%</span></div></Field>)}</div><div className="oq-discount"><span className="oq-label">Desconto comercial</span><div><select aria-label="Tipo de desconto" value={draft.pagamento?.desconto?.tipo || '%'} onChange={(event) => changeDraft({ pagamento: { ...draft.pagamento, desconto: { ...draft.pagamento?.desconto, tipo: event.target.value } } })}><option value="%">%</option><option value="R$">R$</option></select><input aria-label="Valor do desconto" type="number" min="0" step="0.1" value={draft.pagamento?.desconto?.valor ?? 0} onChange={(event) => changeDraft({ pagamento: { ...draft.pagamento, desconto: { ...draft.pagamento?.desconto, valor: event.target.value === '' ? '' : Number(event.target.value) } } })} inputMode="decimal" /></div></div><p className="oq-rate-footnote">“Lucro configurado” é um parâmetro de preço. Não representa a margem real apurada.</p></div></details>
                <PendingList messages={calculationErrors} />
                {warnings.length > 0 && <PendingList title="Premissas deste cálculo" messages={warnings} className="oq-warnings" />}
                <p className="oq-flow-note">{isDemo ? "Teste medidas e materiais; abra a proposta para conferir o resultado." : "O orçamento salvo segue para a proposta e o acompanhamento do projeto no ERP."}</p>
            </aside>
        </div>
    </div>;
}

function ItemRows({ item, index, inputs, expanded, isExtra, counts, itemCost, errors, updateItem, toggle, remove, duplicate }) {
    const label = itemLabel(item);
    const countLabel = isExtra ? 'Peça complementar' : item.composition?.mode === 'catalog' ? `${(item.componentes || []).length} componentes · composição livre` : [counts.doors ? `${counts.doors} ${counts.doors === 1 ? 'porta' : 'portas'}` : '', counts.drawers ? `${counts.drawers} ${counts.drawers === 1 ? 'gaveta' : 'gavetas'}` : '', counts.shelves ? `${counts.shelves} ${counts.shelves === 1 ? 'prateleira' : 'prateleiras'}` : ''].filter(Boolean).join(' · ');
    return <>
        <tr className={`oq-item-row ${expanded ? 'is-selected' : ''} ${errors.length ? 'has-error' : ''}`}>
            <td className="oq-item-name"><span className="oq-item-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{label}</strong>{!isExtra && <small className="oq-item-composition-summary">{countLabel}</small>}{isExtra ? <span className="oq-item-subtitle">{countLabel}</span> : <button type="button" onClick={toggle} aria-expanded={expanded}><span>Editar composição</span><ChevronDown size={12} /></button>}</div></td>
            {['l', 'a', 'p'].map((key) => <td key={key} data-label={{ l: 'Largura · mm', a: 'Altura · mm', p: 'Profundidade · mm' }[key]}><input type="number" min="1" step="1" inputMode="numeric" aria-label={`${label}: ${{ l: 'largura', a: 'altura', p: 'profundidade' }[key]} em milímetros`} value={isExtra && key === 'p' ? '' : inputs[key] ?? item.dims?.[key] ?? ''} placeholder={isExtra && key === 'p' ? '—' : undefined} disabled={isExtra && key === 'p'} onChange={(event) => updateItem(item, { [key]: event.target.value })} /></td>)}
            <td data-label="Quantidade"><input type="number" min="1" step="1" inputMode="numeric" aria-label={`${label}: quantidade`} value={inputs.qtd ?? item.qtd ?? 1} onChange={(event) => updateItem(item, { qtd: event.target.value })} /></td>
            <td className="oq-item-cost" data-label="Insumos">{!errors.length && itemCost != null ? money(itemCost) : '—'}</td>
            <td className="oq-item-actions"><button type="button" onClick={duplicate} title={`Duplicar ${label}`} aria-label={`Duplicar ${label}`}><Copy size={14} /></button><button type="button" onClick={remove} title={`Remover ${label}`} aria-label={`Remover ${label}`}><Trash2 size={14} /></button></td>
        </tr>

        {errors.length > 0 && <tr className="oq-row-error"><td colSpan={7}><span role="alert">{errors.join(' ')}</span></td></tr>}
    </>;
}
