import { useState, useRef, useMemo, useEffect } from 'react';
import { Z, Ic, PageHeader, Modal } from '../ui';
import api from '../api';
import {
    Upload, FileJson, AlertTriangle, CheckCircle2, X,
    Sparkles, Package, Coins, ChevronRight, ClipboardPaste,
} from 'lucide-react';

const MAX_BYTES = 5 * 1024 * 1024;

const STEPS = [
    { id: 1, label: 'Upload' },
    { id: 2, label: 'Preview' },
    { id: 3, label: 'Concluído' },
];

export default function OrcImport({ clis, nav, reload, notify }) {
    const [step, setStep] = useState(1);
    const [inputMode, setInputMode] = useState('arquivo'); // 'arquivo' | 'colar'
    const [pastedText, setPastedText] = useState('');
    const [file, setFile] = useState(null);
    const [rawJson, setRawJson] = useState(null);
    const [preview, setPreview] = useState(null);
    const [parseError, setParseError] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [cid, setCid] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef(null);

    // Buscar config_taxas + biblioteca + escopo para calcular custos derivados
    const [taxas, setTaxas] = useState(null);
    const [bibliotecaCalc, setBibliotecaCalc] = useState({ chapas: [], acabamentos: [], ferragens: [] });
    const [escopoExtras, setEscopoExtras] = useState([]); // lista incluso[] com tipo='extra' tem preço unitário
    useEffect(() => {
        api.get('/config').then(setTaxas).catch(() => setTaxas(null));
        Promise.all([
            api.get('/biblioteca?tipo=material').catch(() => []),
            api.get('/biblioteca?tipo=acabamento').catch(() => []),
            api.get('/biblioteca?tipo=ferragem').catch(() => []),
            api.get('/config/empresa').catch(() => null),
        ]).then(([chapas, acabamentos, ferragens, empresa]) => {
            setBibliotecaCalc({ chapas, acabamentos, ferragens });
            try {
                const esc = empresa?.escopo_servicos_json
                    ? (typeof empresa.escopo_servicos_json === 'string' ? JSON.parse(empresa.escopo_servicos_json) : empresa.escopo_servicos_json)
                    : { incluso: [] };
                setEscopoExtras((esc.incluso || []).filter(x => x.tipo === 'extra' && x.preco_unitario));
            } catch { setEscopoExtras([]); }
        });
    }, []);

    // Custo-hora derivado de config_taxas (mesma fórmula de engine.calcCustoHora):
    // custoHora = sum(centro_custo) / (func × hDia × dias × eficiência)
    const custoHora = useMemo(() => {
        if (!taxas) return 0;
        const func = taxas.func_producao || 10;
        const hDia = taxas.horas_dia || 8.5;
        const dias = taxas.dias_uteis || taxas.centro_custo_dias_uteis || 22;
        const efic = (taxas.eficiencia || 75) / 100;
        let custoFixoMensal = 0;
        try {
            const linhas = JSON.parse(taxas.centro_custo_json || '[]');
            custoFixoMensal = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
        } catch { /* noop */ }
        const horasProdMes = func * hDia * dias * efic;
        return horasProdMes > 0 ? custoFixoMensal / horasProdMes : 0;
    }, [taxas]);

    // Multiplicador de taxas de venda (% somados): imp + com + frete + inst + lucro
    // Aplicado sobre o subtotal de custo (material + MDO) → preço de venda final.
    const taxasTotal = useMemo(() => {
        if (!taxas) return { pct: 0, breakdown: {} };
        const imp = Number(taxas.imp) || 0;
        const com = Number(taxas.com) || 0;
        const frete = Number(taxas.frete) || 0;
        const inst = Number(taxas.inst) || 0;
        const lucro = Number(taxas.lucro) || 0;
        const pct = imp + com + frete + inst + lucro;
        return { pct, breakdown: { imp, com, frete, inst, lucro } };
    }, [taxas]);

    const reset = () => {
        setStep(1);
        setInputMode('arquivo'); setPastedText('');
        setFile(null); setRawJson(null); setPreview(null); setParseError('');
        setCid(''); setLoading(false); setSaving(false);
        if (inputRef.current) inputRef.current.value = '';
    };

    // Núcleo: recebe texto JSON cru e leva ao Step 2 (preview)
    const processText = async (text, sourceLabel = 'JSON') => {
        setParseError(''); setLoading(true); setPreview(null);
        try {
            const sizeBytes = new Blob([text]).size;
            if (sizeBytes > MAX_BYTES) {
                setParseError(`${sourceLabel} excede 5MB (${(sizeBytes / 1024 / 1024).toFixed(1)}MB)`);
                setLoading(false); return;
            }
            let parsed;
            try { parsed = JSON.parse(text); }
            catch { setParseError(`${sourceLabel} inválido — não foi possível interpretar.`); setLoading(false); return; }

            const payload = Array.isArray(parsed) ? { ambientes: parsed } : parsed;
            if (!payload.ambientes || !Array.isArray(payload.ambientes) || payload.ambientes.length === 0) {
                setParseError('JSON não contém o campo "ambientes" (array) com pelo menos um ambiente.');
                setLoading(false); return;
            }
            setRawJson(payload);

            const resp = await api.post('/orcamentos/importar', { ambientes: payload.ambientes });
            if (!resp.ok) {
                setParseError(resp.error || 'Falha ao validar JSON');
                setLoading(false); return;
            }
            setPreview(resp);
            setStep(2);
        } catch (e) {
            setParseError(e.error || 'Erro ao processar JSON');
        }
        setLoading(false);
    };

    const handleFile = async (f) => {
        if (!f) return;
        setParseError('');
        if (!f.name.toLowerCase().endsWith('.json')) {
            setParseError('Arquivo precisa ter extensão .json'); return;
        }
        if (f.size > MAX_BYTES) {
            setParseError(`Arquivo excede 5MB (${(f.size / 1024 / 1024).toFixed(1)}MB)`); return;
        }
        setFile(f);
        const text = await f.text();
        await processText(text, 'Arquivo');
        if (parseError) setFile(null);
    };

    const handlePasted = async () => {
        const text = pastedText.trim();
        if (!text) { setParseError('Cole o JSON antes de validar.'); return; }
        setFile({ name: 'JSON colado', size: new Blob([text]).size });
        await processText(text, 'Texto colado');
    };

    const onDrop = (e) => {
        e.preventDefault(); setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
    };

    const cliente = useMemo(() => clis.find(c => c.id === Number(cid)), [clis, cid]);

    // Deriva custo_material a partir de uma decomposição estruturada (calculo).
    // Retorna { total, breakdown: { chapas, acabamentos, ferragens, extras } }
    const derivaCustoMaterial = useMemo(() => (calculo) => {
        if (!calculo || typeof calculo !== 'object') return null;
        const mkChapas = Number(taxas?.mk_chapas) || 1.45;
        const mkAcab   = Number(taxas?.mk_acabamentos) || 1.30;
        const mkFerr   = Number(taxas?.mk_ferragens) || 1.15;

        let chapas = 0;
        for (const c of calculo.chapas || []) {
            const row = bibliotecaCalc.chapas.find(x => x.cod === c.cod);
            const precoM2 = row ? Number(row.preco_m2_calc) || 0 : 0;
            chapas += (Number(c.m2) || 0) * precoM2 * mkChapas;
        }
        let acabamentos = 0;
        for (const a of calculo.acabamentos || []) {
            const row = bibliotecaCalc.acabamentos.find(x => x.cod === a.cod);
            const precoM2 = row ? Number(row.preco_m2) || 0 : 0;
            acabamentos += (Number(a.m2) || 0) * precoM2 * mkAcab;
        }
        let ferragens = 0;
        for (const f of calculo.ferragens || []) {
            const row = bibliotecaCalc.ferragens.find(x => x.cod === f.cod);
            const preco = row ? Number(row.preco) || 0 : 0;
            ferragens += (Number(f.qtd) || 0) * preco * mkFerr;
        }
        let extras = 0;
        const extrasDetalhe = [];
        for (const e of calculo.extras || []) {
            const row = escopoExtras.find(x => x.id === e.id);
            const preco = row ? Number(row.preco_unitario) || 0 : 0;
            const sub = (Number(e.qtd) || 0) * preco;
            extras += sub;
            extrasDetalhe.push({ id: e.id, nome: row?.nome || e.id, qtd: e.qtd, unidade: e.unidade || row?.unidade, preco, sub });
        }
        const total = chapas + acabamentos + ferragens + extras;
        return { total, breakdown: { chapas, acabamentos, ferragens, extras, extrasDetalhe } };
    }, [taxas, bibliotecaCalc, escopoExtras]);

    // Soma horas decomposto em fases
    const somaHorasCalculo = (calculo) => {
        if (!calculo?.horas) return 0;
        return Object.values(calculo.horas).reduce((s, v) => s + (Number(v) || 0), 0);
    };

    // Calcula valor_unitario derivado.
    // Prioridade: (1) override travado, (2) calculo (decomposição), (3) material+horas legacy.
    //   subtotalCusto = material + horas × custoHora
    //   valor = subtotalCusto × (1 + taxasTotal/100)
    const computeValorLivre = (ie) => {
        if (ie?._valor_trancado) {
            return Math.max(0, Number(ie._valor_override) || 0);
        }
        let mat, horas;
        if (ie?.calculo) {
            const der = derivaCustoMaterial(ie.calculo);
            mat = der ? der.total : 0;
            horas = somaHorasCalculo(ie.calculo);
        } else {
            mat = Math.max(0, Number(ie?._material ?? ie?.custo_material_estimado ?? 0));
            horas = Math.max(0, Number(ie?._horas ?? ie?.horas_mdo_estimadas ?? 0));
        }
        const subtotal = mat + horas * custoHora;
        return subtotal * (1 + taxasTotal.pct / 100);
    };

    // Hidrata campos auxiliares ao chegar do backend. Regras:
    //  • Tem 'calculo' (decomposição)?  → modo derivado (material vem do banco, horas vêm do calculo).
    //  • Tem custo_material/horas?      → modo legacy editável.
    //  • Só valor_unitario?             → modo override travado.
    //  • Nada?                          → modo legacy zerado (alerta âmbar).
    useEffect(() => {
        if (!preview?.ambientes) return;
        let mutated = false;
        const next = {
            ...preview,
            ambientes: preview.ambientes.map(amb => ({
                ...amb,
                itensEspeciais: (amb.itensEspeciais || []).map(ie => {
                    if (ie._hidratado) return ie;
                    mutated = true;
                    const temCalculo = !!ie.calculo;
                    const temBreakdown = !temCalculo && ((Number(ie.custo_material_estimado) || 0) > 0 || (Number(ie.horas_mdo_estimadas) || 0) > 0);
                    const valorLegacy = Number(ie.valor_unitario) || 0;
                    return {
                        ...ie,
                        _hidratado: true,
                        _modo_calc: temCalculo ? 'derivado' : 'legacy',
                        _material: Number(ie.custo_material_estimado) || 0,
                        _horas: Number(ie.horas_mdo_estimadas) || 0,
                        _valor_trancado: !temCalculo && !temBreakdown && valorLegacy > 0,
                        _valor_override: valorLegacy,
                    };
                }),
            })),
        };
        if (mutated) setPreview(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preview]);

    // Soma o valor de venda final dos livres (qtd × valor calculado/override)
    const totalLivres = useMemo(() => {
        if (!preview?.ambientes) return 0;
        return preview.ambientes.reduce((sum, amb) => {
            return sum + (amb.itensEspeciais || []).reduce((s2, ie) => {
                const v = computeValorLivre(ie);
                const q = Number(ie.qtd) || 1;
                return s2 + v * q;
            }, 0);
        }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preview, custoHora, taxasTotal]);

    // Atualiza um campo do breakdown de um livre. field ∈ { material, horas, override, lock }
    // Sempre recalcula valor_unitario e sincroniza com rawJson (o que vai pro backend).
    const setLivreField = (ambIdx, livreIdx, field, value) => {
        setPreview(p => {
            if (!p) return p;
            const next = {
                ...p,
                ambientes: p.ambientes.map((a, i) => {
                    if (i !== ambIdx) return a;
                    const ies = (a.itensEspeciais || []).map((ie, j) => {
                        if (j !== livreIdx) return ie;
                        let updated = { ...ie };
                        if (field === 'material') updated._material = Math.max(0, Number(value) || 0);
                        if (field === 'horas')    updated._horas    = Math.max(0, Number(value) || 0);
                        if (field === 'override') {
                            updated._valor_override = Math.max(0, Number(value) || 0);
                            updated._valor_trancado = true;
                        }
                        if (field === 'unlock') {
                            updated._valor_trancado = false;
                        }
                        // Edita uma fase do calculo.horas (ex: corte_cnc, montagem)
                        if (field?.startsWith('calc_horas:')) {
                            const fase = field.split(':')[1];
                            updated.calculo = {
                                ...(updated.calculo || {}),
                                horas: { ...(updated.calculo?.horas || {}), [fase]: Math.max(0, Number(value) || 0) },
                            };
                        }
                        // Recalcula e sincroniza valor_unitario do estado interno
                        const novoValor = computeValorLivre(updated);
                        updated.valor_unitario = novoValor;
                        updated.precoUnit = novoValor;
                        return updated;
                    });
                    return { ...a, itensEspeciais: ies };
                }),
            };
            // Sincroniza valor_unitario no rawJson (que é o que vai pro backend)
            setRawJson(r => {
                if (!r) return r;
                const liv = next.ambientes[ambIdx].itensEspeciais[livreIdx];
                const novoValor = liv.valor_unitario;
                return {
                    ...r,
                    ambientes: r.ambientes.map((a, i) => {
                        if (i !== ambIdx) return a;
                        let count = 0;
                        const itens = (a.itens || []).map(it => {
                            if (it.modo === 'livre') {
                                if (count === livreIdx) {
                                    count++;
                                    return { ...it, valor_unitario: novoValor };
                                }
                                count++;
                            }
                            return it;
                        });
                        return { ...a, itens };
                    }),
                };
            });
            return next;
        });
    };

    const importar = async () => {
        if (!cid) { notify('Selecione um cliente', 'error'); return; }
        setSaving(true);
        try {
            const body = {
                cliente_id: Number(cid),
                cliente_nome: cliente?.nome || '',
                ambientes: rawJson.ambientes,
                projeto: rawJson.projeto || '',
                endereco_obra: rawJson.endereco_obra || '',
                prazo_entrega: rawJson.prazo_entrega || '',
                validade_dias: rawJson.validade_dias || 15,
                obs: rawJson.obs || '',
            };
            const resp = await api.post('/orcamentos/importar-e-criar', body);
            if (!resp.ok || !resp.orcamento_id) throw new Error(resp.error || 'Resposta inválida');
            setStep(3);
            notify(`Orçamento ${resp.numero} criado — abrindo editor para você ajustar os preços`, 'success');
            if (typeof reload === 'function') reload();
            setTimeout(() => nav('novo', { id: resp.orcamento_id }), 600);
        } catch (e) {
            notify(e.error || e.message || 'Erro ao criar orçamento', 'error');
        }
        setSaving(false);
    };

    const warnings = preview?.warnings || [];

    return (
        <div className={Z.pg}>
            <PageHeader
                icon={Sparkles}
                title="Importar Orçamento via IA"
                subtitle="Carregue um JSON gerado externamente. Itens catálogo são recalculados automaticamente pelo sistema; itens livres usam o valor estimado pela IA — você pode ajustar inline antes de gravar."
            >
                <button onClick={() => nav('orcs')} className={Z.btn2}><X size={14} /> Cancelar</button>
            </PageHeader>

            <Stepper step={step} />

            {step === 1 && (
                <Step1Upload
                    inputMode={inputMode}
                    setInputMode={setInputMode}
                    pastedText={pastedText}
                    setPastedText={setPastedText}
                    handlePasted={handlePasted}
                    inputRef={inputRef}
                    dragOver={dragOver}
                    setDragOver={setDragOver}
                    onDrop={onDrop}
                    handleFile={handleFile}
                    loading={loading}
                    parseError={parseError}
                    notify={notify}
                />
            )}

            {step === 2 && preview && (
                <Step2Preview
                    file={file}
                    preview={preview}
                    warnings={warnings}
                    cid={cid}
                    setCid={setCid}
                    clis={clis}
                    saving={saving}
                    totalLivres={totalLivres}
                    custoHora={custoHora}
                    taxasTotal={taxasTotal}
                    onLivreFieldChange={setLivreField}
                    computeValorLivre={computeValorLivre}
                    onCancel={reset}
                    onConfirm={importar}
                />
            )}

            {step === 3 && (
                <div className="glass-card p-6 text-center">
                    <CheckCircle2 size={48} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Orçamento criado</h3>
                    <p style={{ color: 'var(--muted)' }}>Redirecionando para o editor…</p>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stepper visual
// ─────────────────────────────────────────────────────────────────────────────
function Stepper({ step }) {
    return (
        <div className="flex items-center justify-center gap-2 mb-6 flex-wrap" style={{ fontSize: 13 }}>
            {STEPS.map((s, i) => {
                const active = step === s.id;
                const done = step > s.id;
                return (
                    <div key={s.id} className="flex items-center gap-2">
                        <div
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 999,
                                background: active ? 'var(--primary)' : done ? 'var(--success-bg)' : 'var(--surface)',
                                color: active ? 'white' : done ? 'var(--success)' : 'var(--muted)',
                                fontWeight: 600,
                                border: `1px solid ${active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--border)'}`,
                            }}
                        >
                            {done ? <CheckCircle2 size={14} /> : <span style={{ fontSize: 12, opacity: 0.85 }}>{s.id}</span>}
                            {s.label}
                        </div>
                        {i < STEPS.length - 1 && <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
                    </div>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Upload (arquivo OU JSON colado) + botão para copiar prompt da IA
// ─────────────────────────────────────────────────────────────────────────────
function Step1Upload({
    inputMode, setInputMode,
    pastedText, setPastedText, handlePasted,
    inputRef, dragOver, setDragOver, onDrop, handleFile,
    loading, parseError, notify,
}) {
    const [showPromptModal, setShowPromptModal] = useState(false);

    return (
        <>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex gap-1" role="tablist" style={{ background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <TabBtn active={inputMode === 'arquivo'} onClick={() => setInputMode('arquivo')} icon={Upload} label="Arquivo .json" />
                    <TabBtn active={inputMode === 'colar'}   onClick={() => setInputMode('colar')}   icon={ClipboardPaste} label="Colar JSON" />
                </div>
                <button
                    onClick={() => setShowPromptModal(true)}
                    className={Z.btn2}
                    title="Gera um prompt pronto para colar no Claude / ChatGPT"
                >
                    <Sparkles size={13} /> Copiar prompt para IA
                </button>
            </div>

            {inputMode === 'arquivo' && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className="glass-card flex flex-col items-center justify-center text-center cursor-pointer transition-all"
                    style={{
                        padding: '48px 24px',
                        borderStyle: 'dashed',
                        borderWidth: 2,
                        borderColor: dragOver ? 'var(--primary)' : 'var(--border)',
                        background: dragOver ? 'var(--primary-bg)' : undefined,
                    }}
                >
                    <Upload size={42} style={{ color: 'var(--primary)', marginBottom: 12 }} />
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                        {loading ? 'Validando…' : 'Arraste o JSON aqui ou clique para selecionar'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                        Arquivos .json até 5MB
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".json,application/json"
                        style={{ display: 'none' }}
                        onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                </div>
            )}

            {inputMode === 'colar' && (
                <div className="glass-card p-4">
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        Cole o JSON gerado pela IA
                    </label>
                    <textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder='{ "projeto": "...", "ambientes": [ { "nome": "Cozinha", "itens": [ ... ] } ] }'
                        className={Z.inp}
                        spellCheck={false}
                        style={{
                            width: '100%',
                            minHeight: 320,
                            fontFamily: 'ui-monospace, Menlo, monospace',
                            fontSize: 12,
                            lineHeight: 1.5,
                            resize: 'vertical',
                        }}
                    />
                    <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {pastedText ? `${(new Blob([pastedText]).size / 1024).toFixed(1)} KB` : 'Vazio'}
                            {' · '}máx 5MB
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setPastedText('')} className={Z.btn2} disabled={!pastedText}>
                                Limpar
                            </button>
                            <button onClick={handlePasted} disabled={loading || !pastedText.trim()} className={Z.btn}>
                                {loading ? 'Validando…' : 'Validar JSON →'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {parseError && (
                <div className="glass-card p-3" style={{ borderLeft: '3px solid var(--danger)', marginTop: 12 }}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--danger)' }}>
                        <AlertTriangle size={16} /> {parseError}
                    </div>
                </div>
            )}

            {showPromptModal && (
                <PromptIAModal close={() => setShowPromptModal(false)} notify={notify} />
            )}
        </>
    );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
    return (
        <button
            onClick={onClick}
            role="tab"
            aria-selected={active}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                fontSize: 13, fontWeight: 600,
                borderRadius: 6,
                background: active ? 'var(--primary)' : 'transparent',
                color: active ? 'white' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
            }}
        >
            <Icon size={14} /> {label}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Preview
// ─────────────────────────────────────────────────────────────────────────────
function Step2Preview({ file, preview, warnings, cid, setCid, clis, saving, totalLivres, custoHora, taxasTotal, onLivreFieldChange, computeValorLivre, derivaCustoMaterial, onCancel, onConfirm }) {
    const stats = preview.stats || {};
    const hasLivreSemValor = useMemo(() => {
        return preview.ambientes.some(a =>
            (a.itensEspeciais || []).some(ie => !computeValorLivre(ie))
        );
    }, [preview, computeValorLivre]);

    return (
        <div className="flex flex-col gap-4">
            <div className="glass-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                        <FileJson size={18} style={{ color: 'var(--primary)' }} />
                        <strong>{file?.name}</strong>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            ({(file?.size / 1024).toFixed(1)} KB)
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-5 text-sm" style={{ marginBottom: 12 }}>
                    <Stat label="Ambientes" val={stats.ambientes || 0} icon={Package} />
                    <Stat label="Itens (catálogo)" val={stats.catalogo || 0} icon={CheckCircle2} color="var(--success)" />
                    <Stat label="Itens livres" val={stats.livre || 0} icon={Coins} color="#f59e0b" />
                    <Stat label="Componentes" val={stats.componentes || 0} />
                    <Stat label="Warnings" val={stats.warnings || 0} color={(stats.warnings || 0) > 0 ? '#f59e0b' : undefined} />
                    {(stats.livre || 0) > 0 && (
                        <Stat
                            label="Total estimado (livres)"
                            val={fmtBRL(totalLivres)}
                            icon={Coins}
                            color={hasLivreSemValor ? '#f59e0b' : 'var(--success)'}
                        />
                    )}
                </div>
                {hasLivreSemValor && (
                    <div style={{
                        fontSize: 12, padding: '6px 10px', marginBottom: 12,
                        background: '#fef3c7', color: '#92400e',
                        border: '1px solid #fcd34d', borderRadius: 6,
                    }}>
                        <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                        Há itens livres com valor zero. Edite o valor unitário diretamente nas tabelas abaixo antes de gravar — itens livres não são recalculados pelo sistema.
                    </div>
                )}
                <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                        Cliente *
                    </label>
                    <select value={cid} onChange={(e) => setCid(e.target.value)} className={Z.inp} style={{ maxWidth: 420 }}>
                        <option value="">— Selecionar cliente —</option>
                        {clis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </div>
            </div>

            {warnings.length > 0 && (
                <div className="glass-card p-4" style={{ borderLeft: '3px solid var(--warning)' }}>
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                        <strong>{warnings.length} aviso(s) de catálogo</strong>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                            — itens listados não foram resolvidos e ficarão de fora do orçamento
                        </span>
                    </div>
                    <ul style={{ fontSize: 13, listStyle: 'disc', paddingLeft: 20 }}>
                        {warnings.map((w, i) => <li key={i} style={{ marginBottom: 2 }}>{w}</li>)}
                    </ul>
                </div>
            )}

            {(custoHora > 0 || taxasTotal.pct > 0) && (stats.livre || 0) > 0 && (
                <div className="glass-card p-3" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--text)' }}>Parâmetros usados no cálculo de itens livres:</strong>
                    {' '}custo-hora oficina <strong style={{ color: 'var(--text)' }}>{fmtBRL(custoHora)}/h</strong>
                    {' · '}taxas de venda <strong style={{ color: 'var(--text)' }}>+{taxasTotal.pct.toFixed(1)}%</strong>
                    {' '}(imp {taxasTotal.breakdown.imp}% · com {taxasTotal.breakdown.com}% · frete {taxasTotal.breakdown.frete}% · inst {taxasTotal.breakdown.inst}% · lucro {taxasTotal.breakdown.lucro}%)
                </div>
            )}

            {preview.ambientes.map((amb, ai) => (
                <AmbientePreview
                    key={ai} amb={amb} ambIdx={ai}
                    custoHora={custoHora}
                    taxasTotal={taxasTotal}
                    onLivreFieldChange={onLivreFieldChange}
                    computeValorLivre={computeValorLivre}
                    derivaCustoMaterial={derivaCustoMaterial}
                />
            ))}

            <div className="flex items-center justify-end gap-3" style={{ marginTop: 8 }}>
                <button onClick={onCancel} className={Z.btn2}>Cancelar</button>
                <button
                    onClick={onConfirm}
                    disabled={saving || !cid}
                    className={Z.btn}
                    style={{ opacity: (saving || !cid) ? 0.5 : 1 }}
                >
                    {saving ? 'Importando…' : <><Ic.Plus /> Importar Orçamento</>}
                </button>
            </div>
        </div>
    );
}

function AmbientePreview({ amb, ambIdx, custoHora, taxasTotal, onLivreFieldChange, computeValorLivre, derivaCustoMaterial }) {
    const itens = amb.itens || [];
    const paineis = amb.paineis || [];
    const especiais = amb.itensEspeciais || [];

    // Linhas catálogo + painéis (sem edição inline)
    const linhasCatalogo = [
        ...itens.map(it => ({
            kind: 'caixa',
            nome: it.nome,
            tipo: it.caixaDef?.nome || '—',
            dims: `${it.dims.l}×${it.dims.a}×${it.dims.p}`,
            qtd: it.qtd,
            extra: (it.componentes || []).map(c => `${c.compDef?.nome || '?'}×${c.qtd}`).join(', ') || '—',
            material: [it.mats?.matInt, it.mats?.matExt].filter(Boolean).join(' / '),
        })),
        ...paineis.map(p => ({
            kind: 'painel',
            nome: p.nome,
            tipo: `Painel ${p.tipo}`,
            dims: `${p.L}×${p.A}`,
            qtd: p.qtd,
            extra: `ripa ${p.matRipaV || '?'} · substrato ${p.matSubstrato || '—'}`,
            material: '',
        })),
    ];

    return (
        <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>{amb.nome}</h3>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {itens.length} caixa(s) · {paineis.length} painel(éis) · {especiais.length} livre(s)
                </span>
            </div>

            {linhasCatalogo.length === 0 && especiais.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum item resolvido neste ambiente.</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                <th style={th}>Status</th>
                                <th style={th}>Nome</th>
                                <th style={th}>Tipo</th>
                                <th style={th}>Dims (mm)</th>
                                <th style={th}>Qtd</th>
                                <th style={{ ...th, width: 130 }}>Valor unit.</th>
                                <th style={th}>Detalhe</th>
                            </tr>
                        </thead>
                        <tbody>
                            {linhasCatalogo.map((l, i) => (
                                <tr key={`cat-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={td}><StatusChip kind={l.kind} /></td>
                                    <td style={td}>{l.nome}</td>
                                    <td style={td}>{l.tipo}</td>
                                    <td style={td}>{l.dims}</td>
                                    <td style={td}>{l.qtd}</td>
                                    <td style={{ ...td, color: 'var(--muted)', fontSize: 11 }}>auto (catálogo)</td>
                                    <td style={{ ...td, maxWidth: 360 }}>
                                        {l.material && <div style={{ fontSize: 11 }}>{l.material}</div>}
                                        {l.extra && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l.extra}</div>}
                                    </td>
                                </tr>
                            ))}
                            {especiais.map((ie, li) => (
                                <LivreRow
                                    key={`liv-${li}`}
                                    ie={ie}
                                    ambIdx={ambIdx}
                                    livreIdx={li}
                                    custoHora={custoHora}
                                    taxasTotal={taxasTotal}
                                    onChange={onLivreFieldChange}
                                    computeValorLivre={computeValorLivre}
                                    derivaCustoMaterial={derivaCustoMaterial}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function fmtBRL(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─────────────────────────────────────────────────────────────────────────────
// LivreRow — linha de item livre com breakdown editável (material/horas/valor)
// + memorial expandível abaixo
// ─────────────────────────────────────────────────────────────────────────────
function LivreRow({ ie, ambIdx, livreIdx, custoHora, taxasTotal, onChange, computeValorLivre, derivaCustoMaterial }) {
    const isDerivado = ie._modo_calc === 'derivado' && !!ie.calculo;
    const trancado = !!ie._valor_trancado;
    const valorFinal = computeValorLivre(ie);

    // Material e horas: dependem do modo
    let material, horas, derivado;
    if (isDerivado) {
        derivado = derivaCustoMaterial(ie.calculo);
        material = derivado?.total || 0;
        horas = Object.values(ie.calculo.horas || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    } else {
        material = Number(ie._material ?? ie.custo_material_estimado ?? 0);
        horas = Number(ie._horas ?? ie.horas_mdo_estimadas ?? 0);
    }
    const subtotalCusto = material + horas * custoHora;
    const total = valorFinal * (Number(ie.qtd) || 1);
    const semValor = !valorFinal;

    return (
        <>
            <tr style={{
                borderBottom: ie._memorial || ie.obs ? 'none' : '1px solid var(--border)',
                background: semValor ? '#fffbeb' : undefined,
            }}>
                <td style={td}><StatusChip kind="livre" /></td>
                <td style={td}>
                    {ie.nome}
                    {ie.complexidade && (
                        <span style={{
                            display: 'inline-block', marginLeft: 6,
                            fontSize: 9, padding: '1px 6px', borderRadius: 999,
                            background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)',
                            textTransform: 'uppercase', letterSpacing: 0.5,
                        }}>
                            {ie.complexidade}
                        </span>
                    )}
                </td>
                <td style={td}>Item livre</td>
                <td style={td}>{ie.L && ie.A ? `${ie.L}×${ie.A}` : '—'}</td>
                <td style={td}>{ie.qtd}</td>
                <td style={{ ...td, padding: '4px 6px', minWidth: 280 }}>
                    {/* Breakdown compacto: 3 inputs (material, horas, valor) lado a lado */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, alignItems: 'center' }}>
                        <BreakdownInput
                            label={isDerivado ? 'Material (derivado)' : 'Material'}
                            value={material}
                            onChange={(v) => onChange(ambIdx, livreIdx, 'material', v)}
                            disabled={trancado || isDerivado}
                            prefix="R$"
                            step={50}
                        />
                        <BreakdownInput
                            label={isDerivado ? 'MDO (Σ fases)' : 'MDO'}
                            value={horas}
                            onChange={(v) => onChange(ambIdx, livreIdx, 'horas', v)}
                            disabled={trancado || isDerivado}
                            suffix="h"
                            step={1}
                        />
                        <BreakdownInput
                            label={trancado ? 'Valor (travado)' : 'Valor (auto)'}
                            value={valorFinal}
                            onChange={(v) => onChange(ambIdx, livreIdx, 'override', v)}
                            prefix="R$"
                            step={100}
                            highlight={trancado}
                            invalid={semValor}
                        />
                    </div>
                    {/* Resumo da linha: subtotal + taxas + total qtd */}
                    {(material > 0 || horas > 0 || valorFinal > 0) && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                            {!trancado && (
                                <>
                                    custo: {fmtBRL(material)} + {horas}h×{fmtBRL(custoHora)} = {fmtBRL(subtotalCusto)}
                                    {' · '}× {(1 + taxasTotal.pct / 100).toFixed(2)} (taxas)
                                </>
                            )}
                            {trancado && (
                                <button
                                    onClick={() => onChange(ambIdx, livreIdx, 'unlock', null)}
                                    style={{
                                        background: 'none', border: 'none', padding: 0,
                                        color: 'var(--primary)', cursor: 'pointer',
                                        fontSize: 10, textDecoration: 'underline',
                                    }}
                                    title="Voltar a calcular automaticamente a partir de material + horas"
                                >
                                    ↺ recalcular automaticamente
                                </button>
                            )}
                            {(Number(ie.qtd) || 1) > 1 && valorFinal > 0 && (
                                <span> · × {ie.qtd} = <strong style={{ color: 'var(--text)' }}>{fmtBRL(total)}</strong></span>
                            )}
                        </div>
                    )}
                </td>
                <td style={{ ...td, maxWidth: 320, fontSize: 11, color: 'var(--muted)' }}>
                    {!ie._memorial && !ie.obs && '—'}
                </td>
            </tr>
            {/* Linha extra: decomposição derivada (apenas quando isDerivado) */}
            {isDerivado && derivado && (
                <tr style={{ borderBottom: 'none', background: semValor ? '#fffbeb' : 'var(--surface)' }}>
                    <td colSpan={7} style={{ padding: '6px 6px 6px 30px', fontSize: 11, lineHeight: 1.6 }}>
                        <strong style={{ color: 'var(--text)' }}>Decomposição:</strong>{' '}
                        <span style={{ color: 'var(--muted)' }}>chapas {fmtBRL(derivado.breakdown.chapas)} · acabamentos {fmtBRL(derivado.breakdown.acabamentos)} · ferragens {fmtBRL(derivado.breakdown.ferragens)} · extras {fmtBRL(derivado.breakdown.extras)} = <strong style={{ color: 'var(--text)' }}>{fmtBRL(material)}</strong></span>
                        {derivado.breakdown.extrasDetalhe.length > 0 && (
                            <span style={{ color: 'var(--muted)' }}>
                                {' '}| extras: {derivado.breakdown.extrasDetalhe.map(x => `${x.nome} ${x.qtd}${x.unidade === 'm_linear' ? 'ml' : x.unidade === 'm2' ? 'm²' : 'un'}=${fmtBRL(x.sub)}`).join(' · ')}
                            </span>
                        )}
                        {ie.calculo?.horas && Object.keys(ie.calculo.horas).length > 0 && (
                            <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ color: 'var(--muted)' }}>Horas por fase:</span>
                                {Object.entries(ie.calculo.horas).map(([fase, h]) => (
                                    <label key={fase} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fase}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.5"
                                            value={h}
                                            onChange={(e) => onChange(ambIdx, livreIdx, `calc_horas:${fase}`, e.target.value)}
                                            disabled={trancado}
                                            className={Z.inp}
                                            style={{ width: 50, fontSize: 10, padding: '2px 4px' }}
                                        />
                                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>h</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </td>
                </tr>
            )}
            {(ie._memorial || ie.obs) && (
                <tr style={{ borderBottom: '1px solid var(--border)', background: semValor ? '#fffbeb' : undefined }}>
                    <td colSpan={7} style={{ padding: '0 6px 8px 30px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Memorial:</span> {ie._memorial || ie.obs}
                    </td>
                </tr>
            )}
        </>
    );
}

function BreakdownInput({ label, value, onChange, disabled, prefix, suffix, step = 1, highlight, invalid }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {prefix && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{prefix}</span>}
                <input
                    type="number"
                    min="0"
                    step={step}
                    value={Math.round(value * 100) / 100}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className={Z.inp}
                    style={{
                        width: '100%', minWidth: 60,
                        fontSize: 11, padding: '3px 5px',
                        background: disabled ? 'var(--surface)' : undefined,
                        opacity: disabled ? 0.7 : 1,
                        borderColor: invalid ? 'var(--warning)' : (highlight ? 'var(--primary)' : undefined),
                        fontWeight: highlight ? 600 : undefined,
                    }}
                />
                {suffix && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{suffix}</span>}
            </span>
        </label>
    );
}

function StatusChip({ kind }) {
    if (kind === 'livre') {
        return (
            <span title="Item livre — valor manual" style={chipStyle('var(--warning)')}>
                <Coins size={11} /> livre
            </span>
        );
    }
    return (
        <span title="Resolvido no catálogo" style={chipStyle('var(--success)')}>
            <CheckCircle2 size={11} /> catálogo
        </span>
    );
}

function Stat({ label, val, icon: Icon, color }) {
    return (
        <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {Icon && <Icon size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: color || undefined }}>{val}</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: copiar prompt para IA (com briefing editável)
// ─────────────────────────────────────────────────────────────────────────────
function PromptIAModal({ close, notify }) {
    const [data, setData] = useState({
        caixas: [], comps: [],
        chapas: [], acabamentos: [], ferragens: [],
        config: null, empresa: null,
    });
    const [briefing, setBriefing] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get('/catalogo?tipo=caixa').catch(() => []),
            api.get('/catalogo?tipo=componente').catch(() => []),
            api.get('/biblioteca?tipo=material').catch(() => []),
            api.get('/biblioteca?tipo=acabamento').catch(() => []),
            api.get('/biblioteca?tipo=ferragem').catch(() => []),
            api.get('/config').catch(() => null),
            api.get('/config/empresa').catch(() => null),
        ]).then(([caixas, comps, chapas, acabamentos, ferragens, config, empresa]) => {
            setData({ caixas, comps, chapas, acabamentos, ferragens, config, empresa });
            setLoading(false);
        });
    }, []);

    const prompt = useMemo(
        () => buildPrompt({ ...data, briefing }),
        [data, briefing],
    );

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            notify('Prompt copiado para a área de transferência', 'success');
        } catch {
            notify('Não foi possível copiar — selecione e copie manualmente', 'error');
        }
    };

    return (
        <Modal title="Prompt para IA — Importar Orçamento" close={close} w={780}>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Preencha o briefing do projeto abaixo. O prompt completo (com instruções, catálogo
                atual e materiais válidos) é montado automaticamente. Cole-o no Claude / ChatGPT
                e anexe fotos/plantas se tiver.
            </p>

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Briefing do projeto
            </label>
            <textarea
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                placeholder="Cole aqui: descrição dos ambientes, fotos anexadas, medidas anotadas, observações do cliente"
                className={Z.inp}
                style={{ width: '100%', minHeight: 140, fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
            />

            <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
                    Pré-visualizar prompt completo ({prompt.length.toLocaleString('pt-BR')} caracteres)
                </summary>
                <pre style={{
                    marginTop: 8, padding: 12, borderRadius: 6,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    fontSize: 11, lineHeight: 1.5, maxHeight: 300, overflow: 'auto',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                    {loading ? 'Carregando catálogo…' : prompt}
                </pre>
            </details>

            <div className="flex items-center justify-end gap-2 mt-4">
                <button onClick={close} className={Z.btn2}>Fechar</button>
                <button onClick={copiar} disabled={loading} className={Z.btn}>
                    {loading ? 'Carregando…' : 'Copiar prompt'}
                </button>
            </div>
        </Modal>
    );
}

// ─── Helpers para resumir caixas e componentes do catálogo no prompt ───
function summarizeCaixa(c) {
    const dims = (c.dimsAplicaveis || []).join(', ') || 'L, A, P';
    const pecas = c.pecas || [];
    const tamps = c.tamponamentos || [];

    // Estrutura interna: laterais, topo, base, fundo, divisórias…
    const lat = pecas.filter(p => /lateral/i.test(p.nome || '')).length;
    const tem = (re) => pecas.some(p => re.test(p.nome || ''));
    const estrutura = [
        lat > 0 && `${lat} laterais`,
        tem(/topo/i)   && 'topo',
        tem(/base/i)   && 'base',
        tem(/fundo/i)  && 'fundo',
        tem(/divis/i)  && 'divisória',
        tem(/prate/i)  && 'prateleira embutida',
        tem(/cost/i)   && 'costas',
    ].filter(Boolean).join(' + ') || `${pecas.length} peça(s)`;

    // Faces com acabamento externo (tamponamento)
    const facesMap = { lat_esq: 'lat. esq', lat_dir: 'lat. dir', base: 'base', topo: 'topo', frente: 'frente' };
    const faces = tamps.map(t => facesMap[t.face] || t.face).filter(Boolean).join(', ');
    const acab = faces ? `acab. ext: ${faces}` : 'sem acab. externo';

    return `• ${c.nome} — ${c.cat || 'genérico'}\n  ${c.desc || '(sem descrição)'}\n  dims: ${dims} · estrutura: ${estrutura} · ${acab}`;
}

function summarizeComponente(comp, ferrLookup) {
    const dims = (comp.dimsAplicaveis || []).join(', ') || '—';
    const varsList = (comp.vars || []).map(v => {
        const range = (v.min !== undefined && v.max !== undefined) ? `${v.min}–${v.max}` : '';
        const def = v.default === 0 ? '= dim. da caixa' : v.default;
        const unit = v.unit && v.unit !== 'un' ? ` ${v.unit}` : '';
        return `    ${v.id} (${v.label}): ${range}${unit}, padrão ${def}`;
    }).join('\n');

    // Ferragens automáticas baseadas em sub_itens com defaultOn
    const subOn = (comp.sub_itens || []).filter(s => s.defaultOn);
    const ferrText = subOn.length === 0 ? '' : '\n  ferragens automáticas: ' + subOn.map(s => {
        const ferrNome = ferrLookup[s.ferrId] || s.nome || s.ferrId;
        return ferrNome;
    }).join(', ');

    const varsBlock = varsList ? `\n  vars:\n${varsList}` : '\n  (sem vars configuráveis — passe apenas qtd)';
    return `• ${comp.nome}\n  ${comp.desc || '(sem descrição)'}\n  dims aplicáveis: ${dims}${varsBlock}${ferrText}`;
}

function buildPrompt({ caixas, comps, chapas, acabamentos, ferragens, config, empresa, briefing }) {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const empresaNome = empresa?.nome || 'Ornato';
    const prazoPadrao = empresa?.prazo_padrao || '45 dias úteis';

    // Markups por categoria (default fallbacks se config não carregou)
    const mkChapas = Number(config?.mk_chapas) || 1.45;
    const mkAcab   = Number(config?.mk_acabamentos) || 1.30;
    const mkFerr   = Number(config?.mk_ferragens) || 1.15;

    // Lookup ferragem: ferrId (ex: 'dob110') → nome humano (ex: 'Dobradiça 110° Amort.')
    const ferrLookup = {};
    (ferragens || []).forEach(f => { if (f.cod) ferrLookup[f.cod] = f.nome; });

    // Caixas agrupadas por categoria, com estrutura completa
    const caixasOrdenadas = [...(caixas || [])].sort((a, b) => {
        const cmp = (a.cat || '').localeCompare(b.cat || '');
        return cmp !== 0 ? cmp : (a.nome || '').localeCompare(b.nome || '');
    });
    const caixasPorCat = {};
    for (const c of caixasOrdenadas) {
        const cat = c.cat || 'outros';
        (caixasPorCat[cat] = caixasPorCat[cat] || []).push(c);
    }
    const caixasBlock = Object.entries(caixasPorCat)
        .map(([cat, items]) => `── ${cat.toUpperCase()} (${items.length}) ──\n` + items.map(summarizeCaixa).join('\n\n'))
        .join('\n\n');

    const compsBlock = [...(comps || [])]
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
        .map(c => summarizeComponente(c, ferrLookup))
        .join('\n\n');

    // Escopo dos serviços (incluso vs por conta do cliente) — lido de empresa.escopo_servicos_json
    let escopoIncluso = '';
    let escopoForaEscopo = '';
    try {
        const escopo = empresa?.escopo_servicos_json
            ? (typeof empresa.escopo_servicos_json === 'string'
                ? JSON.parse(empresa.escopo_servicos_json)
                : empresa.escopo_servicos_json)
            : { incluso: [], por_conta_cliente: [] };
        escopoIncluso = (escopo.incluso || []).map(s => {
            const ref = s.ref_custo ? ` — referência: ${s.ref_custo}` : '';
            const obs = s.obs ? ` (${s.obs})` : '';
            return `• ${s.nome}${ref}${obs}`;
        }).join('\n');
        escopoForaEscopo = (escopo.por_conta_cliente || []).map(s => {
            const txt = s.obs_padrao ? ` → memorial: "${s.obs_padrao}"` : '';
            return `• ${s.nome}${txt}`;
        }).join('\n');
    } catch { /* fallback vazio */ }

    // Chapas: preço de venda por m² já com markup, ordenadas por espessura.
    // FORMATO: "cod: nome — R$ X/m²" (cod é o que a IA usa em chapas[].cod do calculo)
    const chapasLinhas = (chapas || [])
        .filter(c => (c.preco_m2_calc || 0) > 0)
        .sort((a, b) => (a.espessura || 0) - (b.espessura || 0))
        .map(c => {
            const venda = (c.preco_m2_calc * mkChapas).toFixed(0);
            return `• cod="${c.cod || c.nome}" — ${c.nome}: R$ ${venda}/m² (espessura ${c.espessura}mm, perda ${c.perda_pct}% inclusa)`;
        });

    // Acabamentos: preço de venda por m² já com markup
    const acabamentosLinhas = (acabamentos || [])
        .filter(a => (a.preco_m2 || 0) > 0)
        .sort((a, b) => (a.preco_m2 || 0) - (b.preco_m2 || 0))
        .map(a => {
            const venda = (a.preco_m2 * mkAcab).toFixed(0);
            return `• cod="${a.cod || a.nome}" — ${a.nome}: R$ ${venda}/m²`;
        });

    // Ferragens: filtrar para 5 categorias chave (dobradiça, corrediça, puxador, pistão, amortecedor)
    const FERR_KEYS = ['dobradiça', 'dobradica', 'corrediça', 'corredica', 'puxador', 'pistão', 'pistao', 'articulador', 'amortecedor'];
    const ferragensLinhas = (ferragens || [])
        .filter(f => {
            const cat = (f.categoria || '').toLowerCase();
            const nome = (f.nome || '').toLowerCase();
            return FERR_KEYS.some(k => cat.includes(k) || nome.includes(k));
        })
        .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || ''))
        .map(f => {
            const venda = ((f.preco || 0) * mkFerr).toFixed(2);
            return `• cod="${f.cod || f.nome}" — ${f.nome}: R$ ${venda}/${f.unidade || 'un'}`;
        });

    // Extras: lista vinda de empresa.escopo_servicos_json com tipo='extra' (preço unitário)
    let extrasLinhas = [];
    try {
        const escAll = empresa?.escopo_servicos_json
            ? (typeof empresa.escopo_servicos_json === 'string' ? JSON.parse(empresa.escopo_servicos_json) : empresa.escopo_servicos_json)
            : { incluso: [] };
        extrasLinhas = (escAll.incluso || [])
            .filter(x => x.tipo === 'extra' && x.preco_unitario)
            .map(x => `• id="${x.id}" — ${x.nome}: R$ ${x.preco_unitario}/${x.unidade === 'm_linear' ? 'm linear' : x.unidade === 'm2' ? 'm²' : 'un'}${x.obs ? ` (${x.obs})` : ''}`);
    } catch { /* noop */ }

    const briefBlock = briefing.trim() || '[Cole aqui: descrição dos ambientes, fotos anexadas, medidas anotadas, observações do cliente]';

    return `[GERADO AUTOMATICAMENTE PELO ${empresaNome.toUpperCase()} ERP em ${dataHoje}]

Você é um assistente especializado em marcenaria sob medida da ${empresaNome}.
Interprete o briefing abaixo (texto, fotos, plantas) e gere um JSON de orçamento
no formato exato esperado pelo nosso ERP.

═══ FORMATO DE SAÍDA (OBRIGATÓRIO) ═══

Devolva APENAS um bloco JSON válido, sem texto antes ou depois, sem cercas markdown:

{
  "projeto": "string (livre)",
  "endereco_obra": "string (opcional)",
  "prazo_entrega": "${prazoPadrao}",
  "validade_dias": 15,
  "ambientes": [
    {
      "nome": "string (ex: Cozinha, Sala, Quarto Casal)",
      "itens": [ /* mistura livre de itens 'catalogo' e 'livre' */ ]
    }
  ]
}

═══ DOIS MODOS DE ITEM ═══

(A) MODO CATÁLOGO — para móveis padrão que existem no nosso catálogo.
{
  "modo": "catalogo",
  "nome": "<um dos nomes EXATOS da lista de CAIXAS abaixo>",
  "dims": { "l": 1800, "a": 700, "p": 350 },   // larg, alt, prof em mm
  "qtd": 1,
  "mats": { "matInt": "<cod de chapa>", "matExt": "<cod de chapa OU acabamento>" },
  "componentes": [
    { "nome": "<um dos nomes EXATOS da lista de COMPONENTES>", "qtd": 1, "vars": { "nPortas": 3 } }
  ]
}

IMPORTANTE: o campo "nome" do item é o lookup contra o catálogo — use o nome
EXATO da lista de caixas, com a mesma capitalização e acentuação.
Para itens catálogo, NÃO inclua valor — o sistema recalcula automaticamente.

(B) MODO LIVRE — para qualquer móvel especial / sob medida atípico / peça que
NÃO se encaixa no catálogo (painéis monumentais, mesas orgânicas, móveis mistos
MDF + outros materiais).

A precificação é feita pelo SISTEMA — você fornece a DECOMPOSIÇÃO em quantidades
(m² de chapa, m² de acabamento, qtd de ferragens, qtd de extras, horas por fase
de produção). O sistema aplica os preços atuais do banco e o custo-hora real.

ESQUEMA DE DECOMPOSIÇÃO (PREFERIDO):
{
  "modo": "livre",
  "nome": "Painel Ripado Ondulado",
  "qtd": 1,
  "complexidade": "monumental",
  "calculo": {
    "chapas":      [ { "cod": "mdf18",      "m2": 8.96 } ],   // cod = código de chapa do catálogo
    "acabamentos": [ { "cod": "lam_freijo", "m2": 8.96 } ],   // cod = código de acabamento do catálogo
    "ferragens":   [ { "cod": "dob110",     "qtd": 6 } ],     // cod = código de ferragem do catálogo
    "extras":      [
      { "id": "led",                "qtd": 25, "unidade": "m_linear" },
      { "id": "transformador_led",  "qtd": 2,  "unidade": "un" }
    ],
    "horas": {
      "corte_cnc": 18,
      "fita_acabamento": 8,
      "montagem": 12,
      "instalacao": 6
    }
  },
  "_memorial": "Descrição técnica completa: dimensões em mm, lógica do cálculo (como chegou nos m² e nas horas), o que está por conta do cliente."
}

REGRAS:
• Use SEMPRE o schema de decomposição (campo "calculo") quando possível.
• Códigos em "chapas[].cod" e "acabamentos[].cod" devem casar EXATAMENTE com a
  TABELA DE PREÇOS abaixo. Se o material não estiver na tabela, declare como
  "extras[]" (ex.: vidro temperado, metalon, tamburato, LED).
• Códigos em "ferragens[].cod" devem casar com o CATÁLOGO DE FERRAGENS abaixo.
• "extras[].id" deve casar com a TABELA DE EXTRAS abaixo. Se algum extra não
  existir, descreva no _memorial e use o id mais próximo.
• "horas" decomposto em fases. Não some tudo num campo só. Faixas de referência
  por fase aparecem mais à frente no prompt.
• Dimensões em mm, quantidades inteiras ≥ 1.

ESQUEMA LEGADO (use SOMENTE se não conseguir decompor — não preferido):
{ "modo":"livre", "nome":"...", "qtd":1, "custo_material_estimado": 850,
  "horas_mdo_estimadas": 12, "complexidade":"alta", "_memorial":"..." }

═══ ESCOPO DOS NOSSOS SERVIÇOS ═══

Além de carcaças, painéis, portas, gavetas, prateleiras e ripados em MDF/MDP,
NÓS FORNECEMOS (incluir no custo_material_estimado, com referências de preço):

${escopoIncluso || '[lista de inclusos indisponível — consultar usuário]'}

NÃO ORÇAR — itens por conta do cliente (registrar no _memorial conforme texto padrão):

${escopoForaEscopo || '[lista de exclusões indisponível]'}

Para itens MISTOS (ex.: mesa com tampo de granito + carcaça MDF + suporte metalon):
• Orçar a parte MDF (catálogo ou livre normal).
• INCLUIR no custo_material_estimado os itens da lista "fornecemos" (metalon, vidro, espelho, etc.).
• REGISTRAR no _memorial o que é por conta do cliente, usando o texto padrão.

═══ CATÁLOGO DE CAIXAS DISPONÍVEIS (${(caixas||[]).length}) ═══

Cada caixa abaixo lista a estrutura interna (laterais/topo/base/fundo/etc.),
quais dimensões são aplicáveis (L=largura, A=altura, P=profundidade) e quais
faces têm acabamento externo. Use o NOME EXATO no campo "nome" do item.
Para "matInt" use chapa que combine com a estrutura interna; para "matExt"
use chapa OU acabamento que combine com as faces tamponadas.

${caixasBlock || '[catálogo de caixas indisponível — usar somente modo livre]'}

═══ CATÁLOGO DE COMPONENTES DISPONÍVEIS (${(comps||[]).length}) ═══

Vão dentro de "componentes": [...] de cada caixa modo:catalogo. Cada componente
define seu próprio conjunto de "vars" — passe SOMENTE as vars que aparecem na
ficha. Variáveis com padrão "= dim. da caixa" são herdadas automaticamente
quando você não informa (não precisa mandar). "qtd" no nível do componente
define quantos componentes você quer no item (ex: qtd: 3 = 3 portas).

${compsBlock || '[catálogo de componentes indisponível]'}

═══ TABELA DE PREÇOS DE VENDA — Marcenaria ${empresaNome} ═══

Os preços abaixo já têm markup de venda. Use os códigos EXATOS no schema de
decomposição: chapas[].cod, acabamentos[].cod, ferragens[].cod, extras[].id.

CHAPAS (calculo.chapas[].cod e mats.matInt em catálogo):
${chapasLinhas.length > 0 ? chapasLinhas.join('\n') : '[chapas indisponíveis]'}

ACABAMENTOS (calculo.acabamentos[].cod e mats.matExt em catálogo):
${acabamentosLinhas.length > 0 ? acabamentosLinhas.join('\n') : '[acabamentos indisponíveis]'}

FERRAGENS PRINCIPAIS (calculo.ferragens[].cod):
${ferragensLinhas.length > 0 ? ferragensLinhas.join('\n') : '[ferragens indisponíveis]'}

EXTRAS / SERVIÇOS QUE FORNECEMOS (calculo.extras[].id):
${extrasLinhas.length > 0 ? extrasLinhas.join('\n') : '[extras indisponíveis]'}

═══ COMO PREENCHER calculo PARA ITENS LIVRES ═══

REGRA DE OURO: você descreve QUANTIDADES (m², qtd, horas). O sistema aplica os
PREÇOS atuais do banco e calcula o custo total. Variância entre execuções deve
ser baixa porque os preços são fixos — só horas e m² variam.

1) chapas[]: liste as chapas usadas. Para cada uma, "cod" = código exato da
   tabela acima e "m2" = metragem total a ser cortada (já considere todas as
   peças do móvel: laterais, topo, base, fundo, frentes, portas, gavetas).
   Exemplo: balcão 1500×800×500mm com fundo MDF 15mm e carcaça MDF 18mm:
     - mdf18 ~5,2 m² (laterais + topo + base + frentes + prateleira)
     - mdf15 ~1,2 m² (fundo)

2) acabamentos[]: liste o(s) acabamento(s) externo(s). "m2" é a área aparente
   a revestir/laquear (apenas faces visíveis, não áreas internas).

3) ferragens[]: portas, gavetas, etc. Quantidades:
   - Cada porta: 2 dobradiças (até 1m de altura) ou 3 (1-1,6m) ou 4 (>1,6m); 1 puxador
   - Cada gaveta: 1 par de corrediça; 1 puxador
   - Portas suspensas: 1 pistão/articulador

4) extras[]: vidro, metalon, tamburato, alumínio, LED, transformador, trancas
   digitais, torre de tomadas. Use a unidade EXATA da tabela (m², m_linear, un).
   Exemplo: painel ripado com LED interno e=18mm:
     - led 4 m_linear · transformador_led 1 un

5) horas: decompose em fases. NÃO some tudo num campo só. Faixas por fase:

   ┌─────────────────────────┬──────────────────────────────────────┬──────────┐
   │ Fase                    │ Driver                               │  Faixa   │
   ├─────────────────────────┼──────────────────────────────────────┼──────────┤
   │ corte_cnc               │ m² de chapa cortado                  │  0,3–1h  │
   │                         │ + curvatura/onda CNC                 │  +50%    │
   │ fita_acabamento         │ m linear de borda                    │  0,1h/m  │
   │                         │ + colagem lâmina natural             │  1h/m²   │
   │                         │ + laqueamento                        │  2h/m²   │
   │ furacao                 │ qtd de pontos de ferragem            │  0,02h   │
   │ montagem                │ por módulo/caixa                     │   3–6h   │
   │                         │ + por porta extra                    │   +0,5h  │
   │                         │ + por gaveta extra                   │   +0,3h  │
   │ instalacao              │ móvel padrão (até 2m)                │   2–4h   │
   │                         │ móvel grande (2–5m)                  │   4–8h   │
   │                         │ monumento (>5m, instalação fábrica)  │   8–20h  │
   └─────────────────────────┴──────────────────────────────────────┴──────────┘

   Use APENAS as fases que se aplicam. Para móveis simples basta corte_cnc +
   montagem + instalacao.

═══ AMBIENTES PADRÃO ═══

Use nomes consistentes: "Cozinha", "Sala de Estar", "Sala de Jantar",
"Quarto Casal", "Quarto Solteiro", "Banheiro", "Lavabo", "Lavanderia",
"Escritório / Home Office", "Closet", "Hall", "Varanda Gourmet".
Para ambientes corporativos use o nome do espaço (ex: "Sala do Presidente",
"Recepção", "Copa Central").

═══ EXEMPLO MÍNIMO ═══

{
  "projeto": "Apto João — Cozinha",
  "endereco_obra": "Rua X, 123",
  "prazo_entrega": "${prazoPadrao}",
  "validade_dias": 15,
  "ambientes": [
    {
      "nome": "Cozinha",
      "itens": [
        {
          "modo": "catalogo",
          "nome": "Caixa Aérea",
          "dims": { "l": 1800, "a": 700, "p": 350 },
          "qtd": 1,
          "mats": { "matInt": "mdp15", "matExt": "lam_freijo" },
          "componentes": [
            { "nome": "Porta", "qtd": 1, "vars": { "nPortas": 3 } },
            { "nome": "Prateleira", "qtd": 2 }
          ]
        },
        {
          "modo": "livre",
          "nome": "Nicho ripado com iluminação embutida",
          "qtd": 1,
          "complexidade": "alta",
          "calculo": {
            "chapas":      [ { "cod": "mdf15", "m2": 0.72 } ],
            "acabamentos": [ { "cod": "lam_freijo", "m2": 0.72 } ],
            "ferragens":   [],
            "extras":      [
              { "id": "led", "qtd": 5, "unidade": "m_linear" },
              { "id": "transformador_led", "qtd": 1, "unidade": "un" }
            ],
            "horas": { "corte_cnc": 4, "fita_acabamento": 3, "montagem": 4, "instalacao": 3 }
          },
          "_memorial": "Painel 1800×400mm. Substrato MDF 15mm × 0,72m² + lâmina freijó × 0,72m². LED 5m + transformador. Sem ferragens (fixação por minifix). Total horas 14h (curvatura simples — sem onda complexa)."
        }
      ]
    }
  ]
}

═══ INSTRUÇÕES FINAIS ═══

1. Leia o briefing + qualquer mídia anexada.
2. Identifique cada ambiente e seus móveis.
3. Para cada móvel, escolha modo catalogo (padrão) ou modo livre (especial).
4. Aplique a regra de escopo (granito/metalon/vidro/tamburato fora).
5. Para livres, calcule valor_unitario seguindo a regra de precificação acima.
6. Se algum dado faltar (medida, material), use defaults razoáveis e mencione no
   _memorial: "confirmar medidas no local".
7. Devolva APENAS o JSON.

--- BRIEFING DO PROJETO ---
${briefBlock}
`;
}

const th = { padding: '8px 6px', fontSize: 12, fontWeight: 600, color: 'var(--muted)' };
const td = { padding: '6px', verticalAlign: 'top' };
const chipStyle = (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 999,
    fontSize: 11, fontWeight: 600,
    background: 'var(--surface)', color, border: `1px solid ${color}`,
});
