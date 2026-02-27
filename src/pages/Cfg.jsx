import { useState, useEffect, useRef } from 'react';
import { Z, Ic } from '../ui';
import api from '../api';
import { useAuth } from '../auth';
import { DEFAULT_CONTRATO_TEMPLATE } from './ContratoHtml';
import { RefreshCw, Search, Smartphone, Check, CheckCircle2, XCircle, FlaskConical, Brain, Bot } from 'lucide-react';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// ── Logo Uploader ──────────────────────────────────────────────────────────
function ImageUploader({ label, image, onChange, disabled, hint }) {
    const inputRef = useRef();

    const handleFile = (file) => {
        if (!file) return;
        if (file.size > 600 * 1024) { alert('Imagem muito grande. Máximo: 600 KB.'); return; }
        const reader = new FileReader();
        reader.onload = (e) => onChange(e.target.result);
        reader.readAsDataURL(file);
    };

    const onDrop = (e) => {
        e.preventDefault();
        if (disabled) return;
        handleFile(e.dataTransfer.files[0]);
    };

    return (
        <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                {label}
            </label>
            <div
                onClick={() => !disabled && inputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                style={{
                    border: `2px dashed var(--border)`, borderRadius: 12, cursor: disabled ? 'default' : 'pointer',
                    padding: image ? '12px' : '28px 16px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 10, transition: 'border-color 0.2s', background: 'var(--bg-muted)',
                    minHeight: 100,
                }}
                className={disabled ? '' : 'hover:border-[var(--primary)]'}
            >
                {image ? (
                    <div style={{ position: 'relative', width: '100%', textAlign: 'center' }}>
                        <img src={image} alt={label} style={{ maxHeight: 70, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
                        {!disabled && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Clique para trocar</div>
                        )}
                    </div>
                ) : (
                    <>
                        <div style={{ color: 'var(--text-muted)', opacity: 0.5 }}><Ic.Image /></div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {disabled ? 'Sem imagem' : 'Clique ou arraste'}
                            </div>
                            {!disabled && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint || 'PNG, JPG, SVG · Máx. 600 KB'}</div>}
                        </div>
                    </>
                )}
            </div>
            {image && !disabled && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    style={{ marginTop: 8, fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    <Ic.X /> Remover
                </button>
            )}
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} />
        </div>
    );
}

// Backwards-compatible alias
function LogoUploader({ logo, onChange, disabled }) {
    return <ImageUploader label="Logo da Empresa" image={logo} onChange={onChange} disabled={disabled} />;
}

export default function Cfg({ taxas, reload, notify }) {
    const { isGerente } = useAuth();
    const [tx, st] = useState(taxas);
    const [emp, setEmp] = useState({
        nome: '', cnpj: '', endereco: '', cidade: '', estado: '', cep: '',
        telefone: '', email: '', site: '', logo: '', logo_sistema: '', logo_watermark: '', logo_watermark_opacity: 0.04,
        contrato_template: '',
        proposta_cor_primaria: '#1B2A4A', proposta_cor_accent: '#C9A96E',
        proposta_sobre: '', proposta_garantia: '', proposta_consideracoes: '', proposta_rodape: '',
        gdrive_credentials: '', gdrive_folder_id: '',
        gdrive_client_id: '', gdrive_client_secret: '',
        wa_instance_url: '', wa_instance_name: '', wa_api_key: '', wa_webhook_token: '',
        ia_provider: 'anthropic', ia_api_key: '', ia_model: 'claude-sonnet-4',
        ia_system_prompt: '', ia_temperatura: 0.7, ia_ativa: 0,
        upmobb_ativo: 0,
    });
    const [waStatus, setWaStatus] = useState(null);
    const [waQR, setWaQR] = useState(null);
    const [waChecking, setWaChecking] = useState(false);
    const [iaTestResult, setIaTestResult] = useState(null);
    const [iaTesting, setIaTesting] = useState(false);
    const [activeSection, setActiveSection] = useState('empresa');
    const [driveStatus, setDriveStatus] = useState(null);
    const [driveAuthCode, setDriveAuthCode] = useState('');
    const [driveAuthorizing, setDriveAuthorizing] = useState(false);

    useEffect(() => {
        api.get('/config/empresa').then(d => {
            setEmp({
                nome: d.nome || '', cnpj: d.cnpj || '', endereco: d.endereco || '',
                cidade: d.cidade || '', estado: d.estado || '', cep: d.cep || '',
                telefone: d.telefone || '', email: d.email || '', site: d.site || '',
                logo: d.logo_header_path || '',
                logo_sistema: d.logo_sistema || '',
                logo_watermark: d.logo_watermark_path || '',
                logo_watermark_opacity: d.logo_watermark_opacity ?? 0.04,
                contrato_template: d.contrato_template || '',
                proposta_cor_primaria: d.proposta_cor_primaria || '#1B2A4A',
                proposta_cor_accent: d.proposta_cor_accent || '#C9A96E',
                proposta_sobre: d.proposta_sobre || '',
                proposta_garantia: d.proposta_garantia || '',
                proposta_consideracoes: d.proposta_consideracoes || '',
                proposta_rodape: d.proposta_rodape || '',
                gdrive_credentials: d.gdrive_credentials || '',
                gdrive_folder_id: d.gdrive_folder_id || '',
                gdrive_client_id: d.gdrive_client_id || '',
                gdrive_client_secret: d.gdrive_client_secret || '',
                wa_instance_url: d.wa_instance_url || '',
                wa_instance_name: d.wa_instance_name || '',
                wa_api_key: d.wa_api_key || '',
                wa_webhook_token: d.wa_webhook_token || '',
                ia_provider: d.ia_provider || 'anthropic',
                ia_api_key: d.ia_api_key || '',
                ia_model: d.ia_model || 'claude-sonnet-4',
                ia_system_prompt: d.ia_system_prompt || '',
                ia_temperatura: d.ia_temperatura ?? 0.7,
                ia_ativa: d.ia_ativa ?? 0,
                upmobb_ativo: d.upmobb_ativo ?? 0,
            });
        }).catch(() => {});
    }, []);

    const totalTaxas = (tx.imp || 0) + (tx.com || 0) + (tx.mont || 0) + (tx.lucro || 0) + (tx.frete || 0);

    const saveTaxas = async () => {
        try {
            await api.put('/config', tx);
            await saveEmpresa(true); // também salva config empresa (upmobb toggle)
            notify("Taxas salvas!"); reload();
        }
        catch (ex) { notify(ex.error || "Erro ao salvar"); }
    };

    const saveEmpresa = async (silent = false) => {
        try {
            await api.put('/config/empresa', {
                ...emp,
                logo: emp.logo,
                logo_sistema: emp.logo_sistema,
                logo_watermark: emp.logo_watermark,
                logo_watermark_opacity: emp.logo_watermark_opacity,
                contrato_template: emp.contrato_template,
                proposta_cor_primaria: emp.proposta_cor_primaria,
                proposta_cor_accent: emp.proposta_cor_accent,
                proposta_sobre: emp.proposta_sobre,
                proposta_garantia: emp.proposta_garantia,
                proposta_consideracoes: emp.proposta_consideracoes,
                proposta_rodape: emp.proposta_rodape,
                gdrive_credentials: emp.gdrive_credentials,
                gdrive_folder_id: emp.gdrive_folder_id,
                gdrive_client_id: emp.gdrive_client_id,
                gdrive_client_secret: emp.gdrive_client_secret,
                wa_instance_url: emp.wa_instance_url,
                wa_instance_name: emp.wa_instance_name,
                wa_api_key: emp.wa_api_key,
                wa_webhook_token: emp.wa_webhook_token,
                ia_provider: emp.ia_provider,
                ia_api_key: emp.ia_api_key,
                ia_model: emp.ia_model,
                ia_system_prompt: emp.ia_system_prompt,
                ia_temperatura: emp.ia_temperatura,
                ia_ativa: emp.ia_ativa,
                upmobb_ativo: emp.upmobb_ativo,
            });
            if (!silent) notify("Dados salvos!");
        }
        catch (ex) { if (!silent) notify(ex.error || "Erro ao salvar"); }
    };

    const checkWaStatus = async () => {
        setWaChecking(true); setWaStatus(null);
        try {
            const s = await api.get('/whatsapp/status');
            setWaStatus(s);
        } catch { setWaStatus({ connected: false, error: 'Não foi possível conectar' }); }
        setWaChecking(false);
    };

    const getWaQR = async () => {
        setWaQR(null);
        try {
            const d = await api.get('/whatsapp/qrcode');
            setWaQR(d);
        } catch (e) { notify(e.error || 'Erro ao obter QR Code'); }
    };

    const testIA = async () => {
        setIaTesting(true); setIaTestResult(null);
        try {
            const d = await api.post('/ia/chat', { question: 'Responda apenas: "Conexão com IA funcionando!"' });
            setIaTestResult({ ok: true, msg: d.resposta || 'Conexão OK' });
        } catch (e) { setIaTestResult({ ok: false, msg: e.error || 'Erro ao conectar com IA' }); }
        setIaTesting(false);
    };

    const sectionBtn = (id, label, icon) => (
        <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${activeSection === id ? 'text-white' : 'hover:bg-[var(--bg-hover)]'}`}
            style={activeSection === id ? { background: 'var(--primary)' } : { color: 'var(--text-secondary)' }}
        >
            {icon} {label}
        </button>
    );

    return (
        <div className={Z.pg}>
            <div className="mb-6">
                <h1 className={Z.h1}>Configurações & Taxas</h1>
                <p className={Z.sub}>Configurações globais do sistema</p>
            </div>

            {/* Section tabs */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit flex-wrap" style={{ background: 'var(--bg-muted)' }}>
                {sectionBtn('empresa', 'Dados da Empresa', <Ic.Building />)}
                {sectionBtn('taxas', 'Taxas & Markup', <Ic.Sliders />)}
                {sectionBtn('proposta', 'Proposta Comercial', <Ic.File />)}
                {sectionBtn('contrato', 'Modelo de Contrato', <Ic.File />)}
                {sectionBtn('drive', 'Google Drive', <Ic.Folder />)}
                {sectionBtn('whatsapp', 'WhatsApp', <Ic.WhatsApp />)}
                {sectionBtn('ia', 'Inteligência Artificial', <Ic.Sparkles />)}
            </div>

            {/* ─── Dados da Empresa ─────────────────────────────── */}
            {activeSection === 'empresa' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Logo */}
                    <div className="lg:col-span-2">
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Identidade Visual</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '280px 280px 1fr', gap: 24, alignItems: 'start' }}>
                                <LogoUploader
                                    logo={emp.logo}
                                    onChange={logo => setEmp({ ...emp, logo })}
                                    disabled={!isGerente}
                                />
                                <ImageUploader
                                    label="Capa do Sistema"
                                    image={emp.logo_sistema}
                                    onChange={logo_sistema => setEmp({ ...emp, logo_sistema })}
                                    disabled={!isGerente}
                                    hint="Aparece na barra lateral e na tela de login"
                                />
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Como a logo é usada</div>
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        <li>Cabeçalho da <strong>Proposta Comercial</strong> enviada ao cliente</li>
                                        <li>Cabeçalho do <strong>Portal do Cliente</strong> (cronograma)</li>
                                        <li>Futuramente: Ordem de Serviço e Contrato</li>
                                    </ul>
                                    <div style={{ marginTop: 10, fontSize: 11 }}>
                                        Formatos aceitos: <strong>PNG, JPG, SVG, WebP</strong> · Máx. 600 KB<br />
                                        Recomendado: fundo transparente (PNG) ou branco, mín. 200×80 px
                                    </div>
                                    {emp.logo && (
                                        <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Preview na proposta</div>
                                            <div style={{ background: '#1379F0', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <img src={emp.logo} alt="Logo preview" style={{ height: 36, objectFit: 'contain', maxWidth: 120, background: 'transparent' }} />
                                                <div style={{ color: '#fff', fontSize: 12 }}>
                                                    <div style={{ fontWeight: 700 }}>{emp.nome || 'Nome da Empresa'}</div>
                                                    {emp.cnpj && <div style={{ opacity: 0.8, fontSize: 10 }}>CNPJ: {emp.cnpj}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={Z.card}>
                        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Identificação</h3>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className={Z.lbl}>Nome da Empresa / Marcenaria *</label>
                                <input value={emp.nome} onChange={e => setEmp({ ...emp, nome: e.target.value })}
                                    className={Z.inp} placeholder="Ex: Ornato Marcenaria" disabled={!isGerente} />
                            </div>
                            <div>
                                <label className={Z.lbl}>CNPJ</label>
                                <input value={emp.cnpj} onChange={e => setEmp({ ...emp, cnpj: e.target.value })}
                                    className={Z.inp} placeholder="00.000.000/0001-00" disabled={!isGerente} />
                            </div>
                            <div>
                                <label className={Z.lbl}>Telefone / WhatsApp</label>
                                <input value={emp.telefone} onChange={e => setEmp({ ...emp, telefone: e.target.value })}
                                    className={Z.inp} placeholder="(98) 99999-9999" disabled={!isGerente} />
                            </div>
                            <div>
                                <label className={Z.lbl}>E-mail</label>
                                <input type="email" value={emp.email} onChange={e => setEmp({ ...emp, email: e.target.value })}
                                    className={Z.inp} placeholder="contato@empresa.com" disabled={!isGerente} />
                            </div>
                            <div>
                                <label className={Z.lbl}>Site</label>
                                <input value={emp.site} onChange={e => setEmp({ ...emp, site: e.target.value })}
                                    className={Z.inp} placeholder="www.empresa.com" disabled={!isGerente} />
                            </div>
                        </div>
                    </div>

                    <div className={Z.card}>
                        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Endereço</h3>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className={Z.lbl}>Logradouro</label>
                                <input value={emp.endereco} onChange={e => setEmp({ ...emp, endereco: e.target.value })}
                                    className={Z.inp} placeholder="Rua, Av., Alameda..." disabled={!isGerente} />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className={Z.lbl}>Cidade</label>
                                    <input value={emp.cidade} onChange={e => setEmp({ ...emp, cidade: e.target.value })}
                                        className={Z.inp} placeholder="São Luís" disabled={!isGerente} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Estado</label>
                                    <select value={emp.estado} onChange={e => setEmp({ ...emp, estado: e.target.value })}
                                        className={Z.inp} disabled={!isGerente}>
                                        <option value="">UF</option>
                                        {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className={Z.lbl}>CEP</label>
                                <input value={emp.cep} onChange={e => setEmp({ ...emp, cep: e.target.value })}
                                    className={Z.inp} placeholder="00000-000" disabled={!isGerente} />
                            </div>
                        </div>

                        {/* Preview do cabeçalho */}
                        {emp.nome && (
                            <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                                    Preview — Cabeçalho da Proposta
                                </div>
                                <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--primary)', color: '#fff' }}>
                                    <div className="font-bold text-sm">{emp.nome}</div>
                                    {emp.cnpj && <div className="opacity-80 text-[10px]">CNPJ: {emp.cnpj}</div>}
                                    {(emp.cidade || emp.estado) && <div className="mt-1 opacity-85 flex items-center gap-1"><Ic.MapPin /> {[emp.cidade, emp.estado].filter(Boolean).join(', ')}</div>}
                                    {emp.telefone && <div className="opacity-85 flex items-center gap-1"><Ic.Phone /> {emp.telefone}</div>}
                                    {emp.email && <div className="opacity-85 flex items-center gap-1"><Ic.Mail /> {emp.email}</div>}
                                </div>
                            </div>
                        )}
                    </div>

                    {isGerente ? (
                        <div className="lg:col-span-2 flex justify-end">
                            <button onClick={saveEmpresa} className={Z.btn}>
                                <Ic.Check /> Salvar Dados da Empresa
                            </button>
                        </div>
                    ) : (
                        <div className="lg:col-span-2 text-[10px] text-amber-400/70 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
                            <Ic.AlertTriangle /> Somente Admin/Gerente pode alterar configurações
                        </div>
                    )}
                </div>
            )}

            {/* ─── Taxas & Markup ────────────────────────────────── */}
            {activeSection === 'taxas' && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Taxas (%)</h3>
                            <div className="rounded-lg px-3 py-2 mb-4 border-l-2 text-[10px]"
                                style={{ background: 'var(--bg-muted)', borderColor: 'var(--primary)', color: 'var(--text-secondary)' }}>
                                Preço de Venda = Custo × Coeficiente ÷ (1 − Σ taxas)
                            </div>
                            <div className="flex flex-col gap-3">
                                {[
                                    ["imp", "Impostos (Simples/Presumido)"],
                                    ["com", "Comissão Arq./Designer"],
                                    ["mont", "Montagem Terceirizada"],
                                    ["lucro", "Lucro Líquido"],
                                    ["frete", "Frete / Entrega"]
                                ].map(([k, l]) => (
                                    <div key={k}>
                                        <label className={Z.lbl}>{l}</label>
                                        <div className="flex items-center gap-2">
                                            <input type="number" value={tx[k]} step={0.5} disabled={!isGerente}
                                                onChange={e => st({ ...tx, [k]: parseFloat(e.target.value) || 0 })}
                                                className={`${Z.inp} flex-1`} />
                                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>%</span>
                                        </div>
                                    </div>
                                ))}
                                <div className="rounded-lg p-3 flex justify-between items-center" style={{ background: 'var(--bg-muted)' }}>
                                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Σ Total de Taxas</span>
                                    <span className={`font-bold text-lg ${totalTaxas >= 100 ? 'text-red-400' : ''}`}
                                        style={totalTaxas < 100 ? { color: 'var(--primary)' } : {}}>
                                        {totalTaxas.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Custos Operacionais</h3>
                            <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
                                Usados como referência padrão ao criar novos orçamentos.
                            </p>
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className={Z.lbl}>Mão de Obra (R$/m²)</label>
                                    <input type="number" value={tx.mdo} disabled={!isGerente}
                                        onChange={e => st({ ...tx, mdo: parseFloat(e.target.value) || 0 })}
                                        className={Z.inp} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Instalação (R$/m²)</label>
                                    <input type="number" value={tx.inst} disabled={!isGerente}
                                        onChange={e => st({ ...tx, inst: parseFloat(e.target.value) || 0 })}
                                        className={Z.inp} />
                                </div>
                            </div>
                            {!isGerente && (
                                <div className="mt-4 text-[10px] text-amber-400/70 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
                                    <Ic.AlertTriangle /> Somente Admin/Gerente pode alterar taxas
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Integrações de Orçamento ── */}
                    <div className={Z.card} style={{ marginTop: 20 }}>
                        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Integrações de Orçamento</h3>
                        <div className="flex items-center justify-between rounded-lg px-4 py-3"
                            style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>UpMobb</span>
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    Habilita a opcao de importar ambientes via JSON do UpMobb ao criar orcamentos.
                                </span>
                            </div>
                            <button
                                disabled={!isGerente}
                                onClick={() => setEmp({ ...emp, upmobb_ativo: emp.upmobb_ativo ? 0 : 1 })}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all"
                                style={{
                                    background: emp.upmobb_ativo ? '#22c55e20' : 'var(--bg-muted)',
                                    color: emp.upmobb_ativo ? '#22c55e' : 'var(--text-muted)',
                                    border: `1px solid ${emp.upmobb_ativo ? '#22c55e40' : 'var(--border)'}`,
                                }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: emp.upmobb_ativo ? '#22c55e' : 'var(--text-muted)',
                                }} />
                                {emp.upmobb_ativo ? 'Ativo' : 'Inativo'}
                            </button>
                        </div>
                    </div>

                    {isGerente && (
                        <div className="mt-5 flex justify-end">
                            <button onClick={saveTaxas} className={Z.btn}>
                                <Ic.Check /> Salvar Taxas
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* ─── Proposta Comercial ──────────────────────────────── */}
            {activeSection === 'proposta' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Col 1-2: Settings */}
                    <div className="lg:col-span-2 flex flex-col gap-5">
                        {/* Identidade Visual da Proposta */}
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Identidade Visual</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                <ImageUploader
                                    label="Logo do Cabeçalho"
                                    image={emp.logo}
                                    onChange={logo => setEmp({ ...emp, logo })}
                                    disabled={!isGerente}
                                    hint="Aparece no topo da proposta"
                                />
                                <ImageUploader
                                    label="Marca d'Água"
                                    image={emp.logo_watermark}
                                    onChange={logo_watermark => setEmp({ ...emp, logo_watermark })}
                                    disabled={!isGerente}
                                    hint="Imagem centralizada com transparência"
                                />
                            </div>
                            {emp.logo_watermark && (
                                <div className="mt-3">
                                    <label className={Z.lbl}>Opacidade da Marca d'Água</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range" min="0.01" max="0.15" step="0.01"
                                            value={emp.logo_watermark_opacity}
                                            onChange={e => setEmp({ ...emp, logo_watermark_opacity: parseFloat(e.target.value) })}
                                            disabled={!isGerente}
                                            style={{ flex: 1 }}
                                        />
                                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)', minWidth: 36 }}>
                                            {Math.round(emp.logo_watermark_opacity * 100)}%
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Cores */}
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Esquema de Cores</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label className={Z.lbl}>Cor Primária</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={emp.proposta_cor_primaria}
                                            onChange={e => setEmp({ ...emp, proposta_cor_primaria: e.target.value })}
                                            disabled={!isGerente}
                                            style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                                        />
                                        <input
                                            value={emp.proposta_cor_primaria}
                                            onChange={e => setEmp({ ...emp, proposta_cor_primaria: e.target.value })}
                                            className={Z.inp}
                                            disabled={!isGerente}
                                            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                                        />
                                    </div>
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Cabeçalho, títulos, destaques</div>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Cor de Destaque</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={emp.proposta_cor_accent}
                                            onChange={e => setEmp({ ...emp, proposta_cor_accent: e.target.value })}
                                            disabled={!isGerente}
                                            style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                                        />
                                        <input
                                            value={emp.proposta_cor_accent}
                                            onChange={e => setEmp({ ...emp, proposta_cor_accent: e.target.value })}
                                            className={Z.inp}
                                            disabled={!isGerente}
                                            style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                                        />
                                    </div>
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Detalhes dourados, linhas de destaque</div>
                                </div>
                            </div>
                            {/* Preview miniatura */}
                            <div className="mt-4 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: '#fff' }}>
                                <div style={{ padding: '10px 16px', borderBottom: `2.5px solid ${emp.proposta_cor_primaria}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {emp.logo && <img src={emp.logo} alt="" style={{ height: 30, objectFit: 'contain' }} />}
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: emp.proposta_cor_primaria, textTransform: 'uppercase' }}>{emp.nome || 'Nome da Empresa'}</div>
                                        {emp.cnpj && <div style={{ fontSize: 8, color: '#888' }}>CNPJ: {emp.cnpj}</div>}
                                    </div>
                                </div>
                                <div style={{ padding: '8px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: emp.proposta_cor_primaria, borderBottom: '1px solid #eee' }}>
                                    PROPOSTA N° ORN-2026-00001
                                </div>
                                <div style={{ padding: '6px 16px 8px', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888' }}>
                                    <span>Cliente: Maria Silva</span>
                                    <span>R$ 12.500,00</span>
                                </div>
                            </div>
                        </div>

                        {/* Textos */}
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Textos da Proposta</h3>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className={Z.lbl}>Sobre a Empresa (opcional)</label>
                                    <textarea
                                        value={emp.proposta_sobre}
                                        onChange={e => setEmp({ ...emp, proposta_sobre: e.target.value })}
                                        disabled={!isGerente}
                                        rows={3}
                                        placeholder="Breve apresentação da empresa. Ex: Há 15 anos transformando ambientes com móveis planejados de alta qualidade..."
                                        style={{
                                            width: '100%', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Aparece logo abaixo do cabeçalho. Deixe vazio para não exibir.
                                    </div>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Texto de Garantia</label>
                                    <textarea
                                        value={emp.proposta_garantia}
                                        onChange={e => setEmp({ ...emp, proposta_garantia: e.target.value })}
                                        disabled={!isGerente}
                                        rows={3}
                                        placeholder="Garantia de 5 (cinco) anos para defeitos de fabricação, em condições normais de uso..."
                                        style={{
                                            width: '100%', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Deixe vazio para usar o texto padrão de garantia.
                                    </div>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Considerações / Condições Gerais</label>
                                    <textarea
                                        value={emp.proposta_consideracoes}
                                        onChange={e => setEmp({ ...emp, proposta_consideracoes: e.target.value })}
                                        disabled={!isGerente}
                                        rows={3}
                                        placeholder="Os materiais e acabamentos poderão sofrer pequenas variações de tonalidade..."
                                        style={{
                                            width: '100%', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Deixe vazio para usar o texto padrão.
                                    </div>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Rodapé da Proposta (opcional)</label>
                                    <input
                                        value={emp.proposta_rodape}
                                        onChange={e => setEmp({ ...emp, proposta_rodape: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="Ex: Obrigado pela confiança! · Visite nosso showroom..."
                                        className={Z.inp}
                                    />
                                </div>
                            </div>
                        </div>

                        {isGerente && (
                            <div className="flex justify-end">
                                <button onClick={saveEmpresa} className={Z.btn}>
                                    <Ic.Check /> Salvar Configurações da Proposta
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Col 3: Info panel */}
                    <div>
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Como Funciona</h3>
                            <div className="flex flex-col gap-3 text-[11px]" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Logo do Cabeçalho</div>
                                    Aparece no canto superior esquerdo da proposta. Recomendado: PNG com fundo transparente.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Marca d'Água</div>
                                    Aparece centralizada no fundo da proposta com transparência. Se não definida, usa a logo do cabeçalho.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Cores</div>
                                    A cor primária define o cabeçalho e títulos. A cor de destaque é usada para detalhes e linhas decorativas.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Textos</div>
                                    Todos os textos são opcionais. Se deixados em branco, usam o texto padrão do sistema.
                                </div>
                            </div>
                        </div>
                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Paletas Sugeridas</h3>
                            <div className="flex flex-col gap-2">
                                {[
                                    { name: 'Navy & Gold', pri: '#1B2A4A', acc: '#C9A96E' },
                                    { name: 'Grafite & Cobre', pri: '#2D2D2D', acc: '#B7654A' },
                                    { name: 'Verde Floresta', pri: '#2D4A3E', acc: '#C4A882' },
                                    { name: 'Azul Moderno', pri: '#1a56db', acc: '#f59e0b' },
                                    { name: 'Preto Elegante', pri: '#111111', acc: '#D4AF37' },
                                ].map(p => (
                                    <button key={p.name} disabled={!isGerente}
                                        onClick={() => setEmp({ ...emp, proposta_cor_primaria: p.pri, proposta_cor_accent: p.acc })}
                                        className="flex items-center gap-2 p-2 rounded-lg border text-left transition-all hover:bg-[var(--bg-hover)] cursor-pointer"
                                        style={{ borderColor: 'var(--border)' }}>
                                        <div className="flex gap-1">
                                            <div style={{ width: 20, height: 20, borderRadius: 4, background: p.pri }} />
                                            <div style={{ width: 20, height: 20, borderRadius: 4, background: p.acc }} />
                                        </div>
                                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{p.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modelo de Contrato ──────────────────────────────── */}
            {activeSection === 'contrato' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2">
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Template do Contrato</h3>
                            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                                Edite o modelo de contrato. Use as variáveis ao lado para preencher dados automaticamente.
                            </p>
                            <textarea
                                value={emp.contrato_template || DEFAULT_CONTRATO_TEMPLATE}
                                onChange={e => setEmp({ ...emp, contrato_template: e.target.value })}
                                disabled={!isGerente}
                                rows={30}
                                style={{
                                    width: '100%', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6,
                                    padding: 14, borderRadius: 8, resize: 'vertical',
                                    background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                }}
                            />
                            <div className="flex gap-2 mt-3">
                                {isGerente && (
                                    <>
                                        <button onClick={saveEmpresa} className={Z.btn}>
                                            <Ic.Check /> Salvar Template
                                        </button>
                                        <button onClick={() => {
                                            setEmp({ ...emp, contrato_template: DEFAULT_CONTRATO_TEMPLATE });
                                            notify('Template restaurado ao padrão');
                                        }} className={Z.btn2}>
                                            <RefreshCw size={14} /> Restaurar Padrão
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Variáveis Disponíveis</h3>
                            <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
                                Use estas variáveis no template. Elas serão substituídas automaticamente ao gerar o contrato.
                            </p>
                            <div className="flex flex-col gap-3">
                                {[
                                    ['Empresa', [
                                        ['{empresa_nome}', 'Nome da empresa'],
                                        ['{empresa_cnpj}', 'CNPJ'],
                                        ['{empresa_endereco}', 'Endereço'],
                                        ['{empresa_cidade}', 'Cidade'],
                                        ['{empresa_estado}', 'Estado'],
                                        ['{empresa_telefone}', 'Telefone'],
                                        ['{empresa_email}', 'E-mail'],
                                    ]],
                                    ['Cliente', [
                                        ['{cliente_nome}', 'Nome do cliente'],
                                        ['{cliente_cpf}', 'CPF'],
                                        ['{cliente_cnpj}', 'CNPJ'],
                                        ['{cliente_endereco}', 'Endereço completo'],
                                        ['{cliente_cidade}', 'Cidade/Estado'],
                                        ['{cliente_telefone}', 'Telefone'],
                                        ['{cliente_email}', 'E-mail'],
                                    ]],
                                    ['Projeto', [
                                        ['{projeto_nome}', 'Nome do projeto'],
                                        ['{numero}', 'Nº da proposta'],
                                        ['{endereco_obra}', 'Endereço da obra'],
                                        ['{prazo_entrega}', 'Prazo de entrega'],
                                        ['{ambientes_lista}', 'Nomes dos ambientes'],
                                    ]],
                                    ['Financeiro', [
                                        ['{valor_total}', 'Valor total (R$)'],
                                        ['{valor_total_extenso}', 'Valor por extenso'],
                                        ['{parcelas_descricao}', 'Descrição das parcelas'],
                                        ['{desconto}', 'Desconto aplicado'],
                                    ]],
                                    ['Datas', [
                                        ['{data_hoje}', 'Data atual por extenso'],
                                    ]],
                                ].map(([grupo, vars]) => (
                                    <div key={grupo}>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{grupo}</div>
                                        <div className="flex flex-col gap-1">
                                            {vars.map(([v, desc]) => (
                                                <div key={v} className="flex items-center gap-2 text-[11px]">
                                                    <code className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: 'var(--bg-muted)', color: 'var(--primary)', border: '1px solid var(--border)' }}>{v}</code>
                                                    <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Google Drive ──────────────────────────────────── */}
            {activeSection === 'drive' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2">
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Google Drive (OAuth)</h3>
                            <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                Conecte sua conta Google para armazenar fotos de montagem, notas fiscais e arquivos de projetos diretamente no seu Google Drive.
                                Os arquivos ficam na sua conta pessoal, usando seu espaco de armazenamento.
                            </p>

                            <div className="flex flex-col gap-4">
                                {/* Passo 1: Client ID + Secret */}
                                <div className="font-bold text-[11px]" style={{ color: 'var(--text-secondary)' }}>Passo 1: Credenciais OAuth</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className={Z.lbl}>Client ID</label>
                                        <input
                                            value={emp.gdrive_client_id || ''}
                                            onChange={e => setEmp({ ...emp, gdrive_client_id: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="XXXXX.apps.googleusercontent.com"
                                            className={Z.inp}
                                            style={{ fontFamily: 'monospace', fontSize: 11 }}
                                        />
                                    </div>
                                    <div>
                                        <label className={Z.lbl}>Client Secret</label>
                                        <input
                                            value={emp.gdrive_client_secret || ''}
                                            onChange={e => setEmp({ ...emp, gdrive_client_secret: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="GOCSPX-..."
                                            className={Z.inp}
                                            type="password"
                                            style={{ fontFamily: 'monospace', fontSize: 11 }}
                                        />
                                    </div>
                                </div>

                                {/* Passo 2: ID da pasta */}
                                <div className="font-bold text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>Passo 2: Pasta raiz no Drive</div>
                                <div>
                                    <label className={Z.lbl}>ID da Pasta (da URL)</label>
                                    <input
                                        value={emp.gdrive_folder_id || ''}
                                        onChange={e => setEmp({ ...emp, gdrive_folder_id: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="1a2b3c4d5e6f..."
                                        className={Z.inp}
                                        style={{ fontFamily: 'monospace', fontSize: 11 }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Crie uma pasta "Ornato ERP" no seu Drive. O ID esta na URL: drive.google.com/drive/folders/<strong>ID_AQUI</strong>
                                    </div>
                                </div>

                                {isGerente && (
                                    <div className="flex justify-end">
                                        <button onClick={async () => { await saveEmpresa(); notify('Credenciais salvas!'); }} className={Z.btn}>
                                            <Ic.Check /> Salvar Credenciais
                                        </button>
                                    </div>
                                )}

                                {/* Passo 3: Autorizar */}
                                <div className="font-bold text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>Passo 3: Autorizar acesso</div>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={async () => {
                                            try {
                                                const r = await api.get('/drive/auth-url');
                                                window.open(r.url, '_blank');
                                            } catch (err) {
                                                notify(err.error || 'Salve o Client ID e Secret primeiro');
                                            }
                                        }}
                                        disabled={!emp.gdrive_client_id || !emp.gdrive_client_secret}
                                        className={Z.btn}
                                        style={{ opacity: (!emp.gdrive_client_id || !emp.gdrive_client_secret) ? 0.5 : 1 }}
                                    >
                                        <Ic.ExternalLink /> Abrir Autorizacao Google
                                    </button>
                                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        Clique acima, autorize no Google, e cole o codigo abaixo.
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            value={driveAuthCode}
                                            onChange={e => setDriveAuthCode(e.target.value)}
                                            placeholder="Cole o codigo de autorizacao aqui"
                                            className={Z.inp}
                                            style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                                        />
                                        <button
                                            onClick={async () => {
                                                if (!driveAuthCode.trim()) return;
                                                setDriveAuthorizing(true);
                                                try {
                                                    await api.post('/drive/auth-callback', { code: driveAuthCode.trim() });
                                                    notify('Google Drive autorizado com sucesso!');
                                                    setDriveAuthCode('');
                                                    // Testar conexao
                                                    const test = await api.get('/drive/test');
                                                    setDriveStatus(test);
                                                } catch (err) {
                                                    notify(err.error || 'Erro ao autorizar');
                                                }
                                                setDriveAuthorizing(false);
                                            }}
                                            disabled={!driveAuthCode.trim() || driveAuthorizing}
                                            className={Z.btn}
                                        >
                                            {driveAuthorizing ? 'Autorizando...' : 'Confirmar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Como Configurar</h3>
                            <div className="flex flex-col gap-3 text-[11px]" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>1. Ativar Google Drive API</div>
                                    Acesse <strong>console.cloud.google.com</strong>. No menu lateral, va em <strong>APIs e servicos {'>'} Biblioteca</strong>. Pesquise <strong>"Google Drive API"</strong> e clique em <strong>Ativar</strong>.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>2. Tela de Consentimento</div>
                                    Em <strong>APIs e servicos {'>'} Tela de consentimento OAuth</strong>, selecione <strong>"Externo"</strong> e preencha o nome do app (ex: "Ornato ERP"). Em <strong>Escopos</strong>, adicione <strong>drive.file</strong>. Em <strong>Usuarios de teste</strong>, adicione seu email Google.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>3. Criar Credenciais OAuth</div>
                                    Em <strong>Credenciais {'>'} Criar credenciais {'>'} ID do cliente OAuth</strong>. Tipo: <strong>"App para computador"</strong>. Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong>.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>4. Criar Pasta no Drive</div>
                                    No seu Google Drive, crie uma pasta (ex: "Ornato ERP"). Abra-a e copie o <strong>ID da URL</strong> (tudo depois de /folders/).
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>5. Configurar e Autorizar</div>
                                    Cole o Client ID, Client Secret e ID da pasta nos campos ao lado. Clique em <strong>Salvar</strong>, depois em <strong>"Abrir Autorizacao Google"</strong>. Autorize com sua conta e cole o codigo aqui.
                                </div>
                            </div>
                        </div>

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Status</h3>
                            <div className="flex items-center gap-2 text-sm">
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: driveStatus?.ok ? '#22c55e' : driveStatus === null ? '#f59e0b' : '#ef4444',
                                }} />
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    {driveStatus?.ok
                                        ? `Google Drive Ativo — ${driveStatus.folder_name || 'Conectado'}`
                                        : driveStatus?.error
                                            ? `Erro: ${driveStatus.error}`
                                            : 'Armazenamento Local'}
                                </span>
                            </div>
                            <button
                                onClick={async () => {
                                    try {
                                        const r = await api.get('/drive/test');
                                        setDriveStatus(r);
                                        notify(r.ok ? 'Conexao OK!' : (r.error || 'Falhou'));
                                    } catch { notify('Erro ao testar'); }
                                }}
                                className="text-[11px] mt-3 underline"
                                style={{ color: 'var(--primary)' }}
                            >
                                Testar Conexao
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── WhatsApp (Evolution API) ────────────────────────── */}
            {activeSection === 'whatsapp' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2">
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Integração WhatsApp — Evolution API</h3>
                            <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                Configure a conexão com a Evolution API para enviar e receber mensagens do WhatsApp diretamente pelo sistema.
                            </p>

                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className={Z.lbl}>URL da Instância</label>
                                    <input
                                        value={emp.wa_instance_url}
                                        onChange={e => setEmp({ ...emp, wa_instance_url: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="https://evolution.seudominio.com"
                                        className={Z.inp}
                                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        URL base da sua instância Evolution API (sem barra final)
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={Z.lbl}>Nome da Instância</label>
                                        <input
                                            value={emp.wa_instance_name}
                                            onChange={e => setEmp({ ...emp, wa_instance_name: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="ornato"
                                            className={Z.inp}
                                        />
                                    </div>
                                    <div>
                                        <label className={Z.lbl}>API Key</label>
                                        <input
                                            type="password"
                                            value={emp.wa_api_key}
                                            onChange={e => setEmp({ ...emp, wa_api_key: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="Chave de autenticação"
                                            className={Z.inp}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Webhook Token (Segurança)</label>
                                    <input
                                        value={emp.wa_webhook_token}
                                        onChange={e => setEmp({ ...emp, wa_webhook_token: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="Token para validar webhooks recebidos"
                                        className={Z.inp}
                                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Defina um token secreto. Configure o mesmo valor no webhook da Evolution API.
                                    </div>
                                </div>

                                {/* Webhook URL Info */}
                                <div className="rounded-lg p-3 border-l-2" style={{ background: 'var(--bg-muted)', borderColor: '#22c55e' }}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#22c55e' }}>URL do Webhook</div>
                                    <code className="text-xs" style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                        http://SEU_IP:3001/api/webhook/whatsapp
                                    </code>
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Configure esta URL no painel da Evolution API para receber mensagens.
                                    </div>
                                </div>
                            </div>

                            {/* Status & QR Code */}
                            <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                <div className="flex gap-2 flex-wrap">
                                    <button onClick={checkWaStatus} disabled={waChecking} className={Z.btn2}>
                                        {waChecking ? <><RefreshCw size={12} className="animate-spin" style={{ display: 'inline', marginRight: 4 }} /> Verificando...</> : <><Search size={12} style={{ display: 'inline', marginRight: 4 }} /> Verificar Conexão</>}
                                    </button>
                                    <button onClick={getWaQR} className={Z.btn2}>
                                        <Smartphone size={12} style={{ display: 'inline', marginRight: 4 }} /> Obter QR Code
                                    </button>
                                </div>

                                {waStatus && (
                                    <div className="mt-3 flex items-center gap-2">
                                        <div style={{
                                            width: 10, height: 10, borderRadius: '50%',
                                            background: waStatus.connected ? '#22c55e' : '#ef4444',
                                        }} />
                                        <span className="text-sm" style={{ color: waStatus.connected ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                                            {waStatus.connected ? 'Conectado' : 'Desconectado'}
                                        </span>
                                        {waStatus.error && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({waStatus.error})</span>}
                                    </div>
                                )}

                                {waQR && waQR.base64 && (
                                    <div className="mt-3 text-center">
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                                            Escaneie com o WhatsApp
                                        </div>
                                        <img src={`data:image/png;base64,${waQR.base64}`} alt="QR Code" style={{ maxWidth: 260, borderRadius: 12, margin: '0 auto', border: '1px solid var(--border)' }} />
                                    </div>
                                )}
                                {waQR && waQR.pairingCode && (
                                    <div className="mt-3 text-center">
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                                            Código de Pareamento
                                        </div>
                                        <div className="text-2xl font-mono font-bold tracking-widest" style={{ color: 'var(--primary)' }}>
                                            {waQR.pairingCode}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {isGerente && (
                                <div className="flex justify-end mt-4">
                                    <button onClick={saveEmpresa} className={Z.btn}>
                                        <Ic.Check /> Salvar Configurações WhatsApp
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Como Configurar</h3>
                            <div className="flex flex-col gap-3 text-[11px]" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>1. Instalar Evolution API</div>
                                    Via Docker: <code className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--primary)' }}>docker-compose up -d</code> com a imagem oficial da Evolution API.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>2. Criar Instância</div>
                                    No painel da Evolution, crie uma instância e copie a URL, nome e API Key.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>3. Configurar Webhook</div>
                                    No painel da instância, configure o webhook para:<br />
                                    <code className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--primary)' }}>http://SEU_IP:3001/api/webhook/whatsapp</code>
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>4. Parear WhatsApp</div>
                                    Clique em "Obter QR Code" e escaneie com o WhatsApp no celular.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>5. Testar</div>
                                    Envie uma mensagem para o número conectado. A mensagem deve aparecer na aba "WhatsApp" do sistema.
                                </div>
                            </div>
                        </div>

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Funcionalidades</h3>
                            <div className="flex flex-col gap-2 text-[11px]" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    <span>Receber mensagens em tempo real</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    <span>Resposta automática por IA</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    <span>Escalação para atendente humano</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    <span>Notas internas por conversa</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    <span>Vinculação automática com clientes CRM</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                                    <span>Sugestão de resposta por IA</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Inteligência Artificial ─────────────────────────── */}
            {activeSection === 'ia' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2">
                        <div className={Z.card}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>Configuração da IA</h3>
                                <button
                                    onClick={() => setEmp({ ...emp, ia_ativa: emp.ia_ativa ? 0 : 1 })}
                                    disabled={!isGerente}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer"
                                    style={{
                                        background: emp.ia_ativa ? '#22c55e20' : 'var(--bg-muted)',
                                        color: emp.ia_ativa ? '#22c55e' : 'var(--text-muted)',
                                        border: `1px solid ${emp.ia_ativa ? '#22c55e40' : 'var(--border)'}`,
                                    }}
                                >
                                    <div style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: emp.ia_ativa ? '#22c55e' : 'var(--text-muted)',
                                        transition: 'background 0.2s',
                                    }} />
                                    {emp.ia_ativa ? 'IA Ativa' : 'IA Inativa'}
                                </button>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={Z.lbl}>Provedor</label>
                                        <select
                                            value={emp.ia_provider}
                                            onChange={e => {
                                                const prov = e.target.value;
                                                const model = prov === 'anthropic' ? 'claude-sonnet-4' : 'gpt-4o';
                                                setEmp({ ...emp, ia_provider: prov, ia_model: model });
                                            }}
                                            disabled={!isGerente}
                                            className={Z.inp}
                                        >
                                            <option value="anthropic">Anthropic (Claude)</option>
                                            <option value="openai">OpenAI (GPT)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={Z.lbl}>Modelo</label>
                                        <select
                                            value={emp.ia_model}
                                            onChange={e => setEmp({ ...emp, ia_model: e.target.value })}
                                            disabled={!isGerente}
                                            className={Z.inp}
                                        >
                                            {emp.ia_provider === 'anthropic' ? (
                                                <>
                                                    <option value="claude-sonnet-4">Claude Sonnet 4</option>
                                                    <option value="claude-haiku-4">Claude Haiku 4</option>
                                                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (20250514)</option>
                                                </>
                                            ) : (
                                                <>
                                                    <option value="gpt-4o">GPT-4o</option>
                                                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                                                    <option value="gpt-4.1">GPT-4.1</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className={Z.lbl}>API Key</label>
                                    <input
                                        type="password"
                                        value={emp.ia_api_key}
                                        onChange={e => setEmp({ ...emp, ia_api_key: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder={emp.ia_provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                                        className={Z.inp}
                                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                </div>

                                <div>
                                    <label className={Z.lbl}>Temperatura ({emp.ia_temperatura})</label>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Preciso</span>
                                        <input
                                            type="range" min="0" max="1" step="0.05"
                                            value={emp.ia_temperatura}
                                            onChange={e => setEmp({ ...emp, ia_temperatura: parseFloat(e.target.value) })}
                                            disabled={!isGerente}
                                            style={{ flex: 1 }}
                                        />
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Criativo</span>
                                    </div>
                                </div>

                                <div>
                                    <label className={Z.lbl}>System Prompt Customizado (opcional)</label>
                                    <textarea
                                        value={emp.ia_system_prompt}
                                        onChange={e => setEmp({ ...emp, ia_system_prompt: e.target.value })}
                                        disabled={!isGerente}
                                        rows={5}
                                        placeholder="Instruções adicionais para a IA. Ex: Sempre responda em português formal. Mencione nossos diferenciais: madeira maciça, acabamento premium..."
                                        style={{
                                            width: '100%', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Esse prompt é adicionado ao contexto base da IA junto com os dados da empresa e a base de conhecimento.
                                    </div>
                                </div>

                                {/* Testar Conexão */}
                                <div className="flex gap-2 flex-wrap items-center">
                                    <button onClick={testIA} disabled={iaTesting} className={Z.btn2}>
                                        {iaTesting ? <><RefreshCw size={12} className="animate-spin" style={{ display: 'inline', marginRight: 4 }} /> Testando...</> : <><FlaskConical size={12} style={{ display: 'inline', marginRight: 4 }} /> Testar Conexão IA</>}
                                    </button>
                                    {iaTestResult && (
                                        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: iaTestResult.ok ? '#22c55e' : '#ef4444' }}>
                                            {iaTestResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {iaTestResult.msg}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {isGerente && (
                                <div className="flex justify-end mt-5">
                                    <button onClick={saveEmpresa} className={Z.btn}>
                                        <Ic.Check /> Salvar Configurações da IA
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Como Funciona</h3>
                            <div className="flex flex-col gap-3 text-[11px]" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Atendimento WhatsApp</div>
                                    Quando ativada, a IA responde automaticamente mensagens recebidas pelo WhatsApp. Se não souber responder, escala para um atendente humano.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Sugestão de Resposta</div>
                                    Na tela de chat, o atendente pode clicar em "Sugerir" para a IA gerar uma sugestão de resposta baseada no contexto da conversa.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Assistente CRM</div>
                                    Na página "Assistente IA", faça perguntas sobre seus clientes, orçamentos e pipeline. A IA consulta o CRM em tempo real.
                                </div>
                                <div>
                                    <div className="font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Follow-ups Inteligentes</div>
                                    A IA analisa orçamentos parados e sugere ações de follow-up para cada cliente, com prioridade e mensagem sugerida.
                                </div>
                            </div>
                        </div>

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Base de Conhecimento</h3>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                Para treinar a IA com informações específicas da sua empresa (FAQs, respostas padrão, políticas), acesse a página
                                <strong> Assistente IA → Base de Conhecimento</strong>.
                            </p>
                            <div className="mt-3 rounded-lg p-2.5" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    <Ic.Sparkles />
                                    <span>A IA usa automaticamente todos os dados do CRM + base de conhecimento</span>
                                </div>
                            </div>
                        </div>

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Provedores Suportados</h3>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: emp.ia_provider === 'anthropic' ? 'var(--bg-muted)' : 'transparent', border: emp.ia_provider === 'anthropic' ? '1px solid var(--border)' : '1px solid transparent' }}>
                                    <Brain size={20} style={{ color: 'var(--text-secondary)' }} />
                                    <div>
                                        <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Anthropic</div>
                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Claude Sonnet 4, Haiku 4</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: emp.ia_provider === 'openai' ? 'var(--bg-muted)' : 'transparent', border: emp.ia_provider === 'openai' ? '1px solid var(--border)' : '1px solid transparent' }}>
                                    <Bot size={20} style={{ color: 'var(--text-secondary)' }} />
                                    <div>
                                        <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>OpenAI</div>
                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>GPT-4o, GPT-4o Mini, GPT-4.1</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
