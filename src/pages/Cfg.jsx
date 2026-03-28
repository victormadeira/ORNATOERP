import { useState, useEffect, useRef } from 'react';
import { Z, Ic } from '../ui';
import api from '../api';
import { useAuth } from '../auth';
import { applyPrimaryColor } from '../theme';
import { DEFAULT_CONTRATO_TEMPLATE } from './ContratoHtml';
import { RefreshCw, Search, Smartphone, Check, CheckCircle2, XCircle, FlaskConical, Brain, Bot, Download, Upload, Database, Images, ArrowUp, ArrowDown, Pencil, Trash2, Plus } from 'lucide-react';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const LANDING_SERVICOS_DEFAULT = [
    { titulo: 'Cozinhas planejadas', descricao: 'Projetos sob medida para cozinhas funcionais, elegantes e atemporais.' },
    { titulo: 'Closets e dormitórios', descricao: 'Soluções personalizadas para organização, conforto e acabamento premium.' },
    { titulo: 'Home office e living', descricao: 'Ambientes inteligentes com design sofisticado para trabalho e convivência.' },
];

const LANDING_DIFERENCIAIS_DEFAULT = [
    { titulo: 'Marcenaria de alto padrão', descricao: 'Materiais selecionados e execução técnica com acabamento impecável.' },
    { titulo: 'Atendimento consultivo', descricao: 'Entendemos sua rotina e traduzimos em soluções personalizadas.' },
    { titulo: 'Compromisso com prazo', descricao: 'Planejamento claro, acompanhamento próximo e entrega confiável.' },
];

const LANDING_ETAPAS_DEFAULT = [
    { titulo: 'Briefing e conceito', descricao: 'Levantamento do estilo de vida, necessidades e referências do projeto.' },
    { titulo: 'Projeto executivo', descricao: 'Detalhamento técnico, materiais e validação de cada ambiente.' },
    { titulo: 'Produção e instalação', descricao: 'Fabricação própria e montagem com padrão de acabamento Ornato.' },
];

const LANDING_PROVAS_DEFAULT = [
    { nome: 'Cliente Ornato', projeto: 'Cozinha Planejada', depoimento: 'Atendimento impecável e resultado além do esperado.' },
    { nome: 'Cliente Ornato', projeto: 'Closet Sob Medida', depoimento: 'Qualidade de acabamento excelente e instalação muito organizada.' },
    { nome: 'Cliente Ornato', projeto: 'Sala Integrada', depoimento: 'Projeto elegante, funcional e com execução no prazo combinado.' },
];

function parseJsonList(value, fallback) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

// ── Comprime imagem via canvas (max 1200px, JPEG 80%) ─────────────────────
function compressImage(file, maxW = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Se já é pequena o suficiente e não precisa resize, retorna direto
                if (img.width <= maxW && file.size <= 150 * 1024) {
                    resolve(e.target.result);
                    return;
                }
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ── Logo Uploader ──────────────────────────────────────────────────────────
function ImageUploader({ label, image, onChange, disabled, hint, maxSize = 2 * 1024 * 1024 }) {
    const inputRef = useRef();

    const handleFile = async (file) => {
        if (!file) return;
        if (file.size > maxSize) { alert(`Imagem muito grande. Máximo: ${Math.round(maxSize / 1024)} KB.`); return; }
        const compressed = await compressImage(file);
        onChange(compressed);
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
        sistema_cor_primaria: '#1379F0',
        contrato_template: '',
        proposta_cor_primaria: '#1B2A4A', proposta_cor_accent: '#C9A96E',
        proposta_sobre: '', proposta_garantia: '', proposta_consideracoes: '', proposta_rodape: '',
        gdrive_credentials: '', gdrive_folder_id: '',
        gdrive_client_id: '', gdrive_client_secret: '',
        wa_instance_url: '', wa_instance_name: '', wa_api_key: '', wa_webhook_token: '',
        ia_provider: 'anthropic', ia_api_key: '', ia_model: 'claude-sonnet-4',
        ia_system_prompt: '', ia_temperatura: 0.7, ia_ativa: 0,
        upmobb_ativo: 0,
        etapas_template_json: '[]',
        landing_ativo: 1,
        landing_titulo: 'Sua casa merece marcenaria de alto padrão, feita para durar e encantar.',
        landing_subtitulo: 'Marcenaria sob medida',
        landing_descricao: 'Projetamos, produzimos e instalamos ambientes sob medida com acabamento premium e atendimento consultivo.',
        landing_cta_primaria: 'Solicitar orçamento',
        landing_cta_secundaria: 'Falar no WhatsApp',
        landing_form_titulo: 'Solicite seu atendimento',
        landing_form_descricao: 'Preencha em 30 segundos e receba contato da nossa equipe para orçamento e orientação.',
        landing_cta_titulo: 'Vamos transformar seu ambiente?',
        landing_cta_descricao: 'Fale com a Ornato e receba um plano inicial personalizado para seu projeto.',
        landing_texto_rodape: '',
        landing_prova_titulo: 'Clientes que confiaram na Ornato',
        landing_provas_json: JSON.stringify(LANDING_PROVAS_DEFAULT),
        landing_logo: '',
        landing_hero_imagem: '',
        landing_hero_video_url: '',
        landing_hero_video_poster: '',
        landing_grafismo_imagem: '',
        landing_cor_fundo: '#1E1917',
        landing_cor_destaque: '#93614C',
        landing_cor_neutra: '#847974',
        landing_cor_clara: '#DDD2CC',
        landing_servicos_json: JSON.stringify(LANDING_SERVICOS_DEFAULT),
        landing_diferenciais_json: JSON.stringify(LANDING_DIFERENCIAIS_DEFAULT),
        landing_etapas_json: JSON.stringify(LANDING_ETAPAS_DEFAULT),
        centro_custo_json: '[]',
        centro_custo_dias_uteis: 22,
    });
    const [waStatus, setWaStatus] = useState(null);
    const [waQR, setWaQR] = useState(null);
    const [waChecking, setWaChecking] = useState(false);
    const [iaTestResult, setIaTestResult] = useState(null);
    const [iaTesting, setIaTesting] = useState(false);
    const [kbPrompt, setKbPrompt] = useState('');
    const [kbStats, setKbStats] = useState(null);
    const [kbLoading, setKbLoading] = useState(false);
    const [kbCopied, setKbCopied] = useState(false);
    const [activeSection, setActiveSection] = useState('empresa');
    const [driveStatus, setDriveStatus] = useState(null);
    const [driveAuthCode, setDriveAuthCode] = useState('');
    const [driveAuthorizing, setDriveAuthorizing] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
    const [backupResult, setBackupResult] = useState(null);
    const backupInputRef = useRef();
    const [portfolio, setPortfolio] = useState([]);
    const [portEdit, setPortEdit] = useState(null); // { titulo, designer, descricao, imagem } or null
    const portImgRef = useRef();

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
                sistema_cor_primaria: d.sistema_cor_primaria || '#1379F0',
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
                etapas_template_json: d.etapas_template_json || '[]',
                landing_ativo: d.landing_ativo ?? 1,
                landing_titulo: d.landing_titulo || 'Sua casa merece marcenaria de alto padrão, feita para durar e encantar.',
                landing_subtitulo: d.landing_subtitulo || 'Marcenaria sob medida',
                landing_descricao: d.landing_descricao || 'Projetamos, produzimos e instalamos ambientes sob medida com acabamento premium e atendimento consultivo.',
                landing_cta_primaria: d.landing_cta_primaria || 'Solicitar orçamento',
                landing_cta_secundaria: d.landing_cta_secundaria || 'Falar no WhatsApp',
                landing_form_titulo: d.landing_form_titulo || 'Solicite seu atendimento',
                landing_form_descricao: d.landing_form_descricao || 'Preencha em 30 segundos e receba contato da nossa equipe para orçamento e orientação.',
                landing_cta_titulo: d.landing_cta_titulo || 'Vamos transformar seu ambiente?',
                landing_cta_descricao: d.landing_cta_descricao || 'Fale com a Ornato e receba um plano inicial personalizado para seu projeto.',
                landing_texto_rodape: d.landing_texto_rodape || '',
                landing_prova_titulo: d.landing_prova_titulo || 'Clientes que confiaram na Ornato',
                landing_provas_json: d.landing_provas_json || JSON.stringify(LANDING_PROVAS_DEFAULT),
                landing_logo: d.landing_logo || '',
                landing_hero_imagem: d.landing_hero_imagem || '',
                landing_hero_video_url: d.landing_hero_video_url || '',
                landing_hero_video_poster: d.landing_hero_video_poster || '',
                landing_grafismo_imagem: d.landing_grafismo_imagem || '',
                landing_cor_fundo: d.landing_cor_fundo || '#1E1917',
                landing_cor_destaque: d.landing_cor_destaque || '#93614C',
                landing_cor_neutra: d.landing_cor_neutra || '#847974',
                landing_cor_clara: d.landing_cor_clara || '#DDD2CC',
                landing_servicos_json: d.landing_servicos_json || JSON.stringify(LANDING_SERVICOS_DEFAULT),
                landing_diferenciais_json: d.landing_diferenciais_json || JSON.stringify(LANDING_DIFERENCIAIS_DEFAULT),
                landing_etapas_json: d.landing_etapas_json || JSON.stringify(LANDING_ETAPAS_DEFAULT),
                centro_custo_json: d.centro_custo_json || '[]',
                centro_custo_dias_uteis: d.centro_custo_dias_uteis ?? 22,
            });
        }).catch(e => notify(e.error || 'Erro ao carregar configurações'));
        api.get('/portfolio').then(setPortfolio).catch(e => notify(e.error || 'Erro ao carregar portfolio'));
    }, []);

    const loadPortfolio = () => api.get('/portfolio').then(setPortfolio).catch(e => notify(e.error || 'Erro ao carregar portfolio'));

    const totalTaxas = (tx.imp || 0) + (tx.com || 0) + (tx.mont || 0) + (tx.lucro || 0) + (tx.frete || 0) + (tx.inst || 0);

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
                sistema_cor_primaria: emp.sistema_cor_primaria,
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
                etapas_template_json: emp.etapas_template_json,
                landing_ativo: emp.landing_ativo,
                landing_titulo: emp.landing_titulo,
                landing_subtitulo: emp.landing_subtitulo,
                landing_descricao: emp.landing_descricao,
                landing_cta_primaria: emp.landing_cta_primaria,
                landing_cta_secundaria: emp.landing_cta_secundaria,
                landing_form_titulo: emp.landing_form_titulo,
                landing_form_descricao: emp.landing_form_descricao,
                landing_cta_titulo: emp.landing_cta_titulo,
                landing_cta_descricao: emp.landing_cta_descricao,
                landing_texto_rodape: emp.landing_texto_rodape,
                landing_prova_titulo: emp.landing_prova_titulo,
                landing_provas_json: emp.landing_provas_json,
                landing_logo: emp.landing_logo,
                landing_hero_imagem: emp.landing_hero_imagem,
                landing_hero_video_url: emp.landing_hero_video_url,
                landing_hero_video_poster: emp.landing_hero_video_poster,
                landing_grafismo_imagem: emp.landing_grafismo_imagem,
                landing_cor_fundo: emp.landing_cor_fundo,
                landing_cor_destaque: emp.landing_cor_destaque,
                landing_cor_neutra: emp.landing_cor_neutra,
                landing_cor_clara: emp.landing_cor_clara,
                landing_servicos_json: emp.landing_servicos_json,
                landing_diferenciais_json: emp.landing_diferenciais_json,
                landing_etapas_json: emp.landing_etapas_json,
                centro_custo_json: emp.centro_custo_json,
                centro_custo_dias_uteis: emp.centro_custo_dias_uteis,
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

    const gerarBaseConhecimento = async () => {
        setKbLoading(true); setKbCopied(false);
        try {
            const d = await api.get('/ia/base-conhecimento');
            setKbPrompt(d.prompt);
            setKbStats(d.stats);
        } catch (e) { notify?.('Erro ao gerar base de conhecimento', 'error'); }
        setKbLoading(false);
    };

    const copiarBaseConhecimento = () => {
        navigator.clipboard.writeText(kbPrompt);
        setKbCopied(true);
        setTimeout(() => setKbCopied(false), 3000);
        notify?.('Base de conhecimento copiada!', 'success');
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

    const landingServicos = parseJsonList(emp.landing_servicos_json, LANDING_SERVICOS_DEFAULT);
    const landingDiferenciais = parseJsonList(emp.landing_diferenciais_json, LANDING_DIFERENCIAIS_DEFAULT);
    const landingEtapas = parseJsonList(emp.landing_etapas_json, LANDING_ETAPAS_DEFAULT);
    const landingProvas = parseJsonList(emp.landing_provas_json, LANDING_PROVAS_DEFAULT);
    const updateLandingList = (field, list) => setEmp(prev => ({ ...prev, [field]: JSON.stringify(list) }));
    const landingUrl = typeof window !== 'undefined' ? `${window.location.origin}/landingpage` : '/landingpage';

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
                {sectionBtn('landing', 'Landing Page', <Ic.Star />)}
                {sectionBtn('portfolio', 'Portfolio', <Images size={16} />)}
                {sectionBtn('etapas', 'Etapas do Projeto', <CheckCircle2 size={16} />)}
                {sectionBtn('custos', 'Centro de Custo', <Ic.Dollar />)}
                {sectionBtn('backup', 'Backup', <Database size={16} />)}
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
                                </div>
                            </div>

                            {/* Cor do Sistema (white-label) */}
                            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, fontSize: 13 }}>Cor do Sistema</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ position: 'relative' }}>
                                        <input type="color" value={emp.sistema_cor_primaria || '#1379F0'}
                                            onChange={e => {
                                                setEmp({ ...emp, sistema_cor_primaria: e.target.value });
                                                applyPrimaryColor(e.target.value);
                                            }}
                                            disabled={!isGerente}
                                            style={{ width: 44, height: 44, border: '2px solid var(--border)', borderRadius: 10, cursor: 'pointer', padding: 2, background: 'var(--bg-card)' }}
                                        />
                                    </div>
                                    <input value={emp.sistema_cor_primaria || '#1379F0'}
                                        onChange={e => {
                                            setEmp({ ...emp, sistema_cor_primaria: e.target.value });
                                            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) applyPrimaryColor(e.target.value);
                                        }}
                                        className={Z.inp} style={{ width: 110, fontSize: 13, fontFamily: 'monospace' }}
                                        disabled={!isGerente} placeholder="#1379F0"
                                    />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {['#1379F0', '#8B5CF6', '#059669', '#EA580C', '#DC2626', '#0891B2', '#4F46E5', '#D946EF'].map(c => (
                                            <button key={c} onClick={() => { setEmp({ ...emp, sistema_cor_primaria: c }); applyPrimaryColor(c); }}
                                                disabled={!isGerente}
                                                style={{
                                                    width: 28, height: 28, borderRadius: 8, background: c, border: emp.sistema_cor_primaria === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                                                    cursor: 'pointer', transition: 'all .15s',
                                                }}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Define a cor de botões, links e destaques em todo o sistema</span>
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
                        {/* ── Markups por Categoria ── */}
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Markups por Categoria</h3>
                            <div className="rounded-lg px-3 py-2 mb-4 border-l-2 text-[10px]"
                                style={{ background: 'var(--bg-muted)', borderColor: 'var(--primary)', color: 'var(--text-secondary)' }}>
                                Cada categoria tem seu multiplicador sobre o custo de compra. Ex: 1.45× = 45% de markup.
                            </div>
                            <div className="flex flex-col gap-3">
                                {[
                                    ["mk_chapas", "Chapas (MDF/MDP)", 1.45],
                                    ["mk_ferragens", "Ferragens", 1.15],
                                    ["mk_fita", "Fita de Borda", 1.45],
                                    ["mk_acabamentos", "Acabamentos", 1.30],
                                    ["mk_acessorios", "Acessórios", 1.20],
                                    ["mk_mdo", "Fator Mão de Obra", 0.80],
                                ].map(([k, l, def]) => (
                                    <div key={k}>
                                        <label className={Z.lbl}>{l}</label>
                                        <div className="flex items-center gap-2">
                                            <input type="number" value={tx[k] ?? def} step={0.05} min={0.1} disabled={!isGerente}
                                                onChange={e => st({ ...tx, [k]: parseFloat(e.target.value) || def })}
                                                className={`${Z.inp} flex-1`} />
                                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>×</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Simulador rápido */}
                            <div className="mt-4 rounded-lg p-3" style={{ background: 'var(--bg-muted)' }}>
                                <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Simulador (custo R$1.000 — cozinha típica)</div>
                                {(() => {
                                    const mk = {
                                        chapas: tx.mk_chapas ?? 1.45, ferragens: tx.mk_ferragens ?? 1.15,
                                        fita: tx.mk_fita ?? 1.45, acabamentos: tx.mk_acabamentos ?? 1.30,
                                        acessorios: tx.mk_acessorios ?? 1.20, mdo: tx.mk_mdo ?? 0.80,
                                    };
                                    const coef = 0.30;
                                    // Cozinha: 50% MDF, 30% ferr, 3% fita, 10% acab, 7% acess
                                    const ch = 500 * (1 + coef) * mk.chapas;
                                    const fe = 300 * mk.ferragens;
                                    const fi = 30 * (1 + coef) * mk.fita;
                                    const ac = 100 * (1 + coef) * mk.acabamentos;
                                    const as_ = 70 * mk.acessorios;
                                    const mdo = 500 * (1 + coef) * mk.mdo;
                                    const cp = ch + fe + fi + ac + as_ + mdo;
                                    const s = totalTaxas / 100;
                                    const pv = s < 1 ? cp / (1 - s) : cp;
                                    return (
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>PV estimado:</span>
                                            <span className="font-bold text-lg" style={{ color: 'var(--primary)' }}>
                                                R$ {pv.toFixed(0)} <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({(pv / 1000).toFixed(1)}×)</span>
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* ── Percentuais sobre PV (divisor) ── */}
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--primary)' }}>Percentuais sobre PV</h3>
                            <div className="rounded-lg px-3 py-2 mb-4 border-l-2 text-[10px]"
                                style={{ background: 'var(--bg-muted)', borderColor: 'var(--primary)', color: 'var(--text-secondary)' }}>
                                PV = Custo Produção ÷ (1 − Σ percentuais). Estes incidem sobre o preço de venda final.
                            </div>
                            <div className="flex flex-col gap-3">
                                {[
                                    ["imp", "Impostos (Simples/Presumido)"],
                                    ["com", "Comissão Arq./Designer"],
                                    ["lucro", "Lucro Líquido"],
                                    ["inst", "Instalação"],
                                    ["frete", "Frete / Entrega"],
                                    ["mont", "Montagem Terceirizada"],
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
                                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Σ Total Percentuais</span>
                                    <span className={`font-bold text-lg ${totalTaxas >= 100 ? 'text-red-400' : ''}`}
                                        style={totalTaxas < 100 ? { color: 'var(--primary)' } : {}}>
                                        {totalTaxas.toFixed(1)}%
                                    </span>
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
                                Cláusulas que começam com "CLAUSULA" serão formatadas como títulos. Linhas com "Paragrafo" ficam em destaque. Itens com "a)" ficam recuados.
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
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>
                                <Brain size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                                Base de Conhecimento IA
                            </h3>
                            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                Gera automaticamente um prompt completo com todo o catálogo de caixas, componentes, materiais e ferragens cadastrados no sistema. Use para alimentar qualquer IA externa.
                            </p>

                            <button onClick={gerarBaseConhecimento} disabled={kbLoading} className={Z.btn} style={{ width: '100%', justifyContent: 'center' }}>
                                {kbLoading
                                    ? <><RefreshCw size={13} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} /> Gerando...</>
                                    : <><Database size={13} style={{ display: 'inline', marginRight: 6 }} /> Gerar Base de Conhecimento</>
                                }
                            </button>

                            {kbStats && (
                                <div className="mt-3 flex gap-2 flex-wrap">
                                    {[
                                        { label: 'Caixas', val: kbStats.caixas, color: '#3b82f6' },
                                        { label: 'Componentes', val: kbStats.componentes, color: '#8b5cf6' },
                                        { label: 'Materiais', val: kbStats.materiais, color: '#22c55e' },
                                    ].map(s => (
                                        <span key={s.label} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: s.color + '15', color: s.color, border: `1px solid ${s.color}30` }}>
                                            {s.val} {s.label}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {kbPrompt && (
                                <div className="mt-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Prompt Gerado</label>
                                        <button onClick={copiarBaseConhecimento} className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md cursor-pointer" style={{ background: kbCopied ? '#22c55e15' : 'var(--bg-muted)', color: kbCopied ? '#22c55e' : 'var(--primary)', border: `1px solid ${kbCopied ? '#22c55e40' : 'var(--border)'}` }}>
                                            {kbCopied ? <><Check size={11} /> Copiado!</> : <><Ic.Copy /> Copiar</>}
                                        </button>
                                    </div>
                                    <textarea
                                        readOnly
                                        value={kbPrompt}
                                        rows={8}
                                        style={{
                                            width: '100%', fontSize: 10, lineHeight: 1.5, padding: 10, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-secondary)',
                                            border: '1px solid var(--border)', fontFamily: 'monospace',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        {(kbPrompt.length / 1000).toFixed(1)}K caracteres · Cole este prompt na IA de sua preferência
                                    </div>
                                </div>
                            )}

                            <div className="mt-3 rounded-lg p-2.5" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    <Ic.Sparkles />
                                    <span>Atualiza automaticamente com base nos itens cadastrados</span>
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

            {/* ─── Landing Page ─────────────────────────────────── */}
            {activeSection === 'landing' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2">
                        <div className={Z.card}>
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                                <div>
                                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Publicação da Landing</h3>
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Página pública em <strong>/landingpage</strong>, sem acesso ao ERP.
                                    </p>
                                </div>
                                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(emp.landing_ativo)}
                                        onChange={e => setEmp({ ...emp, landing_ativo: e.target.checked ? 1 : 0 })}
                                        disabled={!isGerente}
                                    />
                                    Landing ativa
                                </label>
                            </div>

                            <div className="rounded-lg p-3" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: 'var(--text-muted)' }}>URL pública</div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <code className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{landingUrl}</code>
                                    <button onClick={() => window.open('/landingpage', '_blank')} className={Z.btn2} style={{ padding: '6px 10px', fontSize: 11 }}>
                                        <Ic.ExternalLink /> Abrir
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Hero, CTA e Formulário</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="md:col-span-2">
                                    <label className={Z.lbl}>Subtítulo</label>
                                    <input className={Z.inp} value={emp.landing_subtitulo} onChange={e => setEmp({ ...emp, landing_subtitulo: e.target.value })} disabled={!isGerente} placeholder="Ex: Marcenaria sob medida" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={Z.lbl}>Título principal</label>
                                    <input className={Z.inp} value={emp.landing_titulo} onChange={e => setEmp({ ...emp, landing_titulo: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={Z.lbl}>Descrição curta</label>
                                    <textarea className={Z.inp} rows={3} value={emp.landing_descricao} onChange={e => setEmp({ ...emp, landing_descricao: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Texto botão principal</label>
                                    <input className={Z.inp} value={emp.landing_cta_primaria} onChange={e => setEmp({ ...emp, landing_cta_primaria: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Texto botão secundário</label>
                                    <input className={Z.inp} value={emp.landing_cta_secundaria} onChange={e => setEmp({ ...emp, landing_cta_secundaria: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Título do bloco final</label>
                                    <input className={Z.inp} value={emp.landing_cta_titulo} onChange={e => setEmp({ ...emp, landing_cta_titulo: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Descrição do bloco final</label>
                                    <input className={Z.inp} value={emp.landing_cta_descricao} onChange={e => setEmp({ ...emp, landing_cta_descricao: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Título do formulário</label>
                                    <input className={Z.inp} value={emp.landing_form_titulo} onChange={e => setEmp({ ...emp, landing_form_titulo: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Descrição do formulário</label>
                                    <input className={Z.inp} value={emp.landing_form_descricao} onChange={e => setEmp({ ...emp, landing_form_descricao: e.target.value })} disabled={!isGerente} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={Z.lbl}>Título da prova social</label>
                                    <input className={Z.inp} value={emp.landing_prova_titulo} onChange={e => setEmp({ ...emp, landing_prova_titulo: e.target.value })} disabled={!isGerente} placeholder="Ex: Clientes que confiaram na Ornato" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={Z.lbl}>Texto de rodapé da landing (opcional)</label>
                                    <input className={Z.inp} value={emp.landing_texto_rodape} onChange={e => setEmp({ ...emp, landing_texto_rodape: e.target.value })} disabled={!isGerente} placeholder="Ex: Ornato Studio | São Luís - MA" />
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="md:col-span-2">
                                        <label className={Z.lbl}>URL do vídeo institucional (opcional)</label>
                                        <input
                                            className={Z.inp}
                                            value={emp.landing_hero_video_url}
                                            onChange={e => setEmp({ ...emp, landing_hero_video_url: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="Ex: https://.../institucional.mp4 ou link do YouTube"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <ImageUploader
                                            label="Logo exclusiva da landing (opcional)"
                                            image={emp.landing_logo}
                                            onChange={landing_logo => setEmp({ ...emp, landing_logo })}
                                            disabled={!isGerente}
                                            hint="Se vazio, usa a logo padrão do sistema"
                                        />
                                    </div>
                                    <ImageUploader
                                        label="Imagem de destaque (fallback)"
                                        image={emp.landing_hero_imagem}
                                        onChange={landing_hero_imagem => setEmp({ ...emp, landing_hero_imagem })}
                                        disabled={!isGerente}
                                        hint="Usada quando não houver vídeo"
                                    />
                                    <ImageUploader
                                        label="Poster do vídeo (opcional)"
                                        image={emp.landing_hero_video_poster}
                                        onChange={landing_hero_video_poster => setEmp({ ...emp, landing_hero_video_poster })}
                                        disabled={!isGerente}
                                        hint="Capa exibida antes do vídeo iniciar"
                                    />
                                    <div className="md:col-span-2">
                                        <ImageUploader
                                            label="Grafismo de fundo (opcional)"
                                            image={emp.landing_grafismo_imagem}
                                            onChange={landing_grafismo_imagem => setEmp({ ...emp, landing_grafismo_imagem })}
                                            disabled={!isGerente}
                                            hint="Imagem escura para textura no hero (recomendado 1920x1080)"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Paleta da Landing</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    ['landing_cor_fundo', 'Fundo escuro', '#1E1917'],
                                    ['landing_cor_destaque', 'Destaque cobre', '#93614C'],
                                    ['landing_cor_neutra', 'Neutra/tipografia', '#847974'],
                                    ['landing_cor_clara', 'Clara/superfícies', '#DDD2CC'],
                                ].map(([field, label, fallback]) => (
                                    <div key={field}>
                                        <label className={Z.lbl}>{label}</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={emp[field] || fallback}
                                                onChange={e => setEmp({ ...emp, [field]: e.target.value })}
                                                disabled={!isGerente}
                                                style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent' }}
                                            />
                                            <input
                                                className={Z.inp}
                                                value={emp[field] || fallback}
                                                onChange={e => setEmp({ ...emp, [field]: e.target.value })}
                                                disabled={!isGerente}
                                                style={{ fontFamily: 'monospace' }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Diretriz Aplicada</h3>
                            <div className="text-[11px] leading-6" style={{ color: 'var(--text-muted)' }}>
                                A landing segue o manual Ornato com:
                                <ul style={{ margin: '8px 0 0 16px' }}>
                                    <li>paleta oficial digital (#DDD2CC, #93614C, #847974, #1E1917)</li>
                                    <li>estética sóbria e luxuosa com grafismos diagonais</li>
                                    <li>captação de leads integrada ao CRM</li>
                                    <li>rota pública isolada do ERP em <code>/landingpage</code></li>
                                </ul>
                            </div>
                            <div className="mt-3 text-[11px] rounded-lg p-2.5" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                Mantenha a copy curta e objetiva para aumentar conversão.
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Serviços</h3>
                            <div className="flex flex-col gap-2">
                                {landingServicos.map((item, idx) => (
                                    <div key={`serv-${idx}`} className="p-2 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        <input
                                            className={Z.inp}
                                            placeholder="Título"
                                            value={item.titulo || ''}
                                            onChange={e => {
                                                const next = landingServicos.map((s, i) => i === idx ? { ...s, titulo: e.target.value } : s);
                                                updateLandingList('landing_servicos_json', next);
                                            }}
                                            disabled={!isGerente}
                                        />
                                        <textarea
                                            className={Z.inp}
                                            rows={2}
                                            placeholder="Descrição"
                                            value={item.descricao || ''}
                                            onChange={e => {
                                                const next = landingServicos.map((s, i) => i === idx ? { ...s, descricao: e.target.value } : s);
                                                updateLandingList('landing_servicos_json', next);
                                            }}
                                            disabled={!isGerente}
                                            style={{ marginTop: 8 }}
                                        />
                                        {isGerente && (
                                            <button
                                                onClick={() => updateLandingList('landing_servicos_json', landingServicos.filter((_, i) => i !== idx))}
                                                className="text-[11px] mt-2"
                                                style={{ color: '#ef4444' }}
                                            >
                                                Remover
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {isGerente && (
                                <button onClick={() => updateLandingList('landing_servicos_json', [...landingServicos, { titulo: '', descricao: '' }])} className={Z.btn2} style={{ marginTop: 10, fontSize: 12 }}>
                                    <Plus size={14} /> Adicionar Serviço
                                </button>
                            )}
                        </div>

                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Diferenciais</h3>
                            <div className="flex flex-col gap-2">
                                {landingDiferenciais.map((item, idx) => (
                                    <div key={`dif-${idx}`} className="p-2 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        <input
                                            className={Z.inp}
                                            placeholder="Título"
                                            value={item.titulo || ''}
                                            onChange={e => {
                                                const next = landingDiferenciais.map((s, i) => i === idx ? { ...s, titulo: e.target.value } : s);
                                                updateLandingList('landing_diferenciais_json', next);
                                            }}
                                            disabled={!isGerente}
                                        />
                                        <textarea
                                            className={Z.inp}
                                            rows={2}
                                            placeholder="Descrição"
                                            value={item.descricao || ''}
                                            onChange={e => {
                                                const next = landingDiferenciais.map((s, i) => i === idx ? { ...s, descricao: e.target.value } : s);
                                                updateLandingList('landing_diferenciais_json', next);
                                            }}
                                            disabled={!isGerente}
                                            style={{ marginTop: 8 }}
                                        />
                                        {isGerente && (
                                            <button
                                                onClick={() => updateLandingList('landing_diferenciais_json', landingDiferenciais.filter((_, i) => i !== idx))}
                                                className="text-[11px] mt-2"
                                                style={{ color: '#ef4444' }}
                                            >
                                                Remover
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {isGerente && (
                                <button onClick={() => updateLandingList('landing_diferenciais_json', [...landingDiferenciais, { titulo: '', descricao: '' }])} className={Z.btn2} style={{ marginTop: 10, fontSize: 12 }}>
                                    <Plus size={14} /> Adicionar Diferencial
                                </button>
                            )}
                        </div>

                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Etapas de Atendimento</h3>
                            <div className="flex flex-col gap-2">
                                {landingEtapas.map((item, idx) => (
                                    <div key={`etp-${idx}`} className="p-2 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        <input
                                            className={Z.inp}
                                            placeholder={`Etapa ${idx + 1}`}
                                            value={item.titulo || ''}
                                            onChange={e => {
                                                const next = landingEtapas.map((s, i) => i === idx ? { ...s, titulo: e.target.value } : s);
                                                updateLandingList('landing_etapas_json', next);
                                            }}
                                            disabled={!isGerente}
                                        />
                                        <textarea
                                            className={Z.inp}
                                            rows={2}
                                            placeholder="Descrição"
                                            value={item.descricao || ''}
                                            onChange={e => {
                                                const next = landingEtapas.map((s, i) => i === idx ? { ...s, descricao: e.target.value } : s);
                                                updateLandingList('landing_etapas_json', next);
                                            }}
                                            disabled={!isGerente}
                                            style={{ marginTop: 8 }}
                                        />
                                        {isGerente && (
                                            <button
                                                onClick={() => updateLandingList('landing_etapas_json', landingEtapas.filter((_, i) => i !== idx))}
                                                className="text-[11px] mt-2"
                                                style={{ color: '#ef4444' }}
                                            >
                                                Remover
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {isGerente && (
                                <button onClick={() => updateLandingList('landing_etapas_json', [...landingEtapas, { titulo: '', descricao: '' }])} className={Z.btn2} style={{ marginTop: 10, fontSize: 12 }}>
                                    <Plus size={14} /> Adicionar Etapa
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-3">
                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Depoimentos (Prova Social)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {landingProvas.map((item, idx) => (
                                    <div key={`prv-${idx}`} className="p-2 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        <input
                                            className={Z.inp}
                                            placeholder="Nome do cliente"
                                            value={item.nome || ''}
                                            onChange={e => {
                                                const next = landingProvas.map((p, i) => i === idx ? { ...p, nome: e.target.value } : p);
                                                updateLandingList('landing_provas_json', next);
                                            }}
                                            disabled={!isGerente}
                                        />
                                        <input
                                            className={Z.inp}
                                            placeholder="Projeto"
                                            value={item.projeto || ''}
                                            onChange={e => {
                                                const next = landingProvas.map((p, i) => i === idx ? { ...p, projeto: e.target.value } : p);
                                                updateLandingList('landing_provas_json', next);
                                            }}
                                            disabled={!isGerente}
                                            style={{ marginTop: 8 }}
                                        />
                                        <textarea
                                            className={Z.inp}
                                            rows={3}
                                            placeholder="Depoimento"
                                            value={item.depoimento || ''}
                                            onChange={e => {
                                                const next = landingProvas.map((p, i) => i === idx ? { ...p, depoimento: e.target.value } : p);
                                                updateLandingList('landing_provas_json', next);
                                            }}
                                            disabled={!isGerente}
                                            style={{ marginTop: 8 }}
                                        />
                                        {isGerente && (
                                            <button
                                                onClick={() => updateLandingList('landing_provas_json', landingProvas.filter((_, i) => i !== idx))}
                                                className="text-[11px] mt-2"
                                                style={{ color: '#ef4444' }}
                                            >
                                                Remover
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {isGerente && (
                                <button
                                    onClick={() => updateLandingList('landing_provas_json', [...landingProvas, { nome: '', projeto: '', depoimento: '' }])}
                                    className={Z.btn2}
                                    style={{ marginTop: 10, fontSize: 12 }}
                                >
                                    <Plus size={14} /> Adicionar Depoimento
                                </button>
                            )}
                        </div>
                    </div>

                    {isGerente && (
                        <div className="lg:col-span-3 flex justify-end">
                            <button onClick={saveEmpresa} className={Z.btn}>
                                <Ic.Check /> Salvar Landing Page
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Backup do Sistema ──────────────────────────── */}
            {/* ─── Portfolio ────────────────────────────────────── */}
            {activeSection === 'portfolio' && (
                <div className="max-w-3xl">
                    <div className={Z.card}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <Images size={20} style={{ color: 'var(--primary)' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Portfolio</h3>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Fotos-vitrine que aparecem na apresentação para clientes</p>
                                </div>
                            </div>
                            {isGerente && !portEdit && (
                                <button
                                    onClick={() => setPortEdit({ titulo: '', designer: '', descricao: '', imagem: '' })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                    style={{ background: 'var(--primary)' }}
                                >
                                    <Plus size={14} /> Adicionar
                                </button>
                            )}
                        </div>

                        {/* Form add/edit */}
                        {portEdit && (
                            <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className={Z.lbl}>Título do Projeto</label>
                                        <input className={Z.inp} value={portEdit.titulo} onChange={e => setPortEdit({ ...portEdit, titulo: e.target.value })} placeholder="Ex: Cozinha Moderna" />
                                    </div>
                                    <div>
                                        <label className={Z.lbl}>Designer / Responsável</label>
                                        <input className={Z.inp} value={portEdit.designer} onChange={e => setPortEdit({ ...portEdit, designer: e.target.value })} placeholder="Ex: Grace Dantas" />
                                    </div>
                                </div>
                                <div className="mb-3">
                                    <label className={Z.lbl}>Descrição (opcional)</label>
                                    <textarea className={Z.inp} rows={2} value={portEdit.descricao} onChange={e => setPortEdit({ ...portEdit, descricao: e.target.value })} placeholder="Breve descrição do projeto..." />
                                </div>
                                <ImageUploader label="Foto do Projeto" image={portEdit.imagem} onChange={img => setPortEdit({ ...portEdit, imagem: img })} disabled={false} hint="Foto de alta qualidade · Máx. 600 KB" />
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={async () => {
                                            if (!portEdit.imagem) { notify?.('Adicione uma foto'); return; }
                                            try {
                                                if (portEdit.id) {
                                                    await api.put(`/portfolio/${portEdit.id}`, portEdit);
                                                } else {
                                                    await api.post('/portfolio', portEdit);
                                                }
                                                notify?.('Portfolio salvo!');
                                                setPortEdit(null);
                                                loadPortfolio();
                                            } catch (ex) { notify?.(ex.error || 'Erro ao salvar'); }
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                                        style={{ background: 'var(--primary)' }}
                                    >
                                        <Check size={14} /> {portEdit.id ? 'Atualizar' : 'Salvar'}
                                    </button>
                                    <button
                                        onClick={() => setPortEdit(null)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* List */}
                        {portfolio.length === 0 && !portEdit ? (
                            <div className="py-10 text-center text-xs rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                <Images size={28} className="mx-auto mb-2 opacity-40" />
                                Nenhuma foto no portfolio.<br />
                                <span className="opacity-70">Adicione fotos para exibir na apresentação da proposta.</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {portfolio.map((p, i) => (
                                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        <img src={p.imagem} alt={p.titulo} className="w-20 h-14 rounded-lg object-cover shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.titulo || 'Sem título'}</div>
                                            {p.designer && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.designer}</div>}
                                        </div>
                                        {isGerente && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={async () => {
                                                    if (i === 0) return;
                                                    const ids = portfolio.map(x => x.id);
                                                    [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]];
                                                    await api.put('/portfolio/reorder', { ids });
                                                    loadPortfolio();
                                                }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Mover para cima">
                                                    <ArrowUp size={14} />
                                                </button>
                                                <button onClick={async () => {
                                                    if (i === portfolio.length - 1) return;
                                                    const ids = portfolio.map(x => x.id);
                                                    [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
                                                    await api.put('/portfolio/reorder', { ids });
                                                    loadPortfolio();
                                                }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Mover para baixo">
                                                    <ArrowDown size={14} />
                                                </button>
                                                <button onClick={() => setPortEdit({ ...p })} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--primary)' }} title="Editar">
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={async () => {
                                                    if (!confirm('Remover esta foto do portfolio?')) return;
                                                    await api.del(`/portfolio/${p.id}`);
                                                    notify?.('Foto removida');
                                                    loadPortfolio();
                                                }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: '#ef4444' }} title="Excluir">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            Estas fotos aparecem na <strong>apresentação da proposta</strong> (link de experiência completa).
                            Recomendamos de 3 a 6 projetos com fotos de alta qualidade.
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ SEÇÃO: Etapas do Projeto ═══ */}
            {activeSection === 'etapas' && (() => {
                let tplEtapas = [];
                try { tplEtapas = JSON.parse(emp.etapas_template_json || '[]'); } catch { tplEtapas = []; }
                if (tplEtapas.length === 0) tplEtapas = [
                    { nome: 'Aprovação do Orçamento', duracao_dias: 3 },
                    { nome: 'Assinatura do Contrato', duracao_dias: 2 },
                    { nome: 'Medição in Loco', duracao_dias: 5 },
                    { nome: 'Aprovação do Caderno Técnico', duracao_dias: 7 },
                    { nome: 'Compra de Materiais', duracao_dias: 10 },
                    { nome: 'Produção', duracao_dias: 25 },
                    { nome: 'Acabamento', duracao_dias: 5 },
                    { nome: 'Montagem e Instalação', duracao_dias: 5 },
                ];

                const updateTpl = (newEtapas) => {
                    setEmp(prev => ({ ...prev, etapas_template_json: JSON.stringify(newEtapas) }));
                };
                const moveEtapa = (idx, dir) => {
                    const arr = [...tplEtapas];
                    const nIdx = idx + dir;
                    if (nIdx < 0 || nIdx >= arr.length) return;
                    [arr[idx], arr[nIdx]] = [arr[nIdx], arr[idx]];
                    updateTpl(arr);
                };
                const totalDias = tplEtapas.reduce((s, e) => s + (Number(e.duracao_dias) || 0), 0);

                return (
                    <div className="max-w-2xl">
                        <div className={Z.card}>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <CheckCircle2 size={20} style={{ color: 'var(--primary)' }} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Template Padrão de Etapas</h2>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        Etapas e durações aplicadas automaticamente ao criar um projeto
                                    </p>
                                </div>
                            </div>

                            <div className="mb-3 p-3 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-muted)' }}>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {tplEtapas.length} etapas | Duração total: <strong style={{ color: 'var(--text-primary)' }}>{totalDias} dias</strong>
                                </span>
                            </div>

                            {/* Lista de etapas */}
                            <div className="flex flex-col gap-1.5 mb-4">
                                {tplEtapas.map((etapa, i) => (
                                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        {/* Ordem / setas */}
                                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                                            <button onClick={() => moveEtapa(i, -1)} disabled={i === 0}
                                                className="p-0.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer disabled:opacity-20" style={{ color: 'var(--text-muted)' }} title="Mover para cima">
                                                <ArrowUp size={11} />
                                            </button>
                                            <button onClick={() => moveEtapa(i, 1)} disabled={i === tplEtapas.length - 1}
                                                className="p-0.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer disabled:opacity-20" style={{ color: 'var(--text-muted)' }} title="Mover para baixo">
                                                <ArrowDown size={11} />
                                            </button>
                                        </div>
                                        {/* Número */}
                                        <span className="text-[10px] font-bold w-5 text-center flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                                        {/* Nome */}
                                        <input
                                            value={etapa.nome}
                                            onChange={e => { const arr = [...tplEtapas]; arr[i] = { ...arr[i], nome: e.target.value }; updateTpl(arr); }}
                                            className={`${Z.inp} flex-1 text-xs`}
                                            placeholder="Nome da etapa"
                                        />
                                        {/* Duração */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <input
                                                type="number" min="1" max="365"
                                                value={etapa.duracao_dias || ''}
                                                onChange={e => { const arr = [...tplEtapas]; arr[i] = { ...arr[i], duracao_dias: parseInt(e.target.value) || 0 }; updateTpl(arr); }}
                                                className={`${Z.inp} w-16 text-xs text-center`}
                                                placeholder="Dias"
                                            />
                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>dias</span>
                                        </div>
                                        {/* Delete */}
                                        <button onClick={() => { const arr = tplEtapas.filter((_, j) => j !== i); updateTpl(arr); }}
                                            className="p-1 rounded hover:bg-red-50 cursor-pointer" style={{ color: '#ef4444' }} title="Excluir">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Botões */}
                            <div className="flex items-center justify-between">
                                <button onClick={() => {
                                    updateTpl([...tplEtapas, { nome: '', duracao_dias: 5 }]);
                                }} className={`${Z.btn2} text-xs`}>
                                    <Plus size={12} /> Adicionar etapa
                                </button>
                                <button onClick={() => { saveEmpresa(); }} className={`${Z.btn} text-xs`}>
                                    Salvar Template
                                </button>
                            </div>

                            <p className="text-[10px] mt-4" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Ao criar um novo projeto, basta informar a data de início. As datas de cada etapa serão calculadas automaticamente com base nas durações acima, em sequência.
                            </p>
                        </div>
                    </div>
                );
            })()}

            {/* ─── Centro de Custo ─────────────────────────────── */}
            {activeSection === 'custos' && (() => {
                let linhas = [];
                try { linhas = JSON.parse(emp.centro_custo_json || '[]'); } catch { linhas = []; }
                if (linhas.length === 0) linhas = [
                    { descricao: 'Aluguel', valor: 0 },
                    { descricao: 'Energia', valor: 0 },
                    { descricao: 'Funcionários (salários + encargos)', valor: 0 },
                    { descricao: 'Internet / Telefone', valor: 0 },
                    { descricao: 'Água', valor: 0 },
                    { descricao: 'Contador', valor: 0 },
                ];
                const diasUteis = emp.centro_custo_dias_uteis || 22;
                const totalMensal = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
                const custoDia = diasUteis > 0 ? totalMensal / diasUteis : 0;

                const updateLinhas = (newLinhas) => {
                    setEmp(prev => ({ ...prev, centro_custo_json: JSON.stringify(newLinhas) }));
                };

                return (
                    <div className="max-w-2xl">
                        <div className={Z.card}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <Ic.Dollar />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Centro de Custo Mensal</h2>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Custos fixos mensais da marcenaria. Usado como referência no painel comparativo do orçamento.</p>
                                </div>
                            </div>

                            {/* Summary bar */}
                            <div className="mb-4 p-3 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-muted)' }}>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {linhas.length} itens &middot; Total mensal: <strong style={{ color: 'var(--text-primary)' }}>R$ {totalMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                </span>
                                <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                                    R$ {custoDia.toFixed(2)}/dia
                                </span>
                            </div>

                            {/* Dias úteis */}
                            <div className="mb-4">
                                <label className={Z.lbl}>Dias úteis por mês</label>
                                <input type="number" min="1" max="31"
                                    value={diasUteis}
                                    onChange={e => setEmp(prev => ({ ...prev, centro_custo_dias_uteis: parseInt(e.target.value) || 22 }))}
                                    className={`${Z.inp} w-24`}
                                    disabled={!isGerente} />
                            </div>

                            {/* Editable lines */}
                            <div className="flex flex-col gap-1.5 mb-4">
                                {linhas.map((linha, i) => (
                                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        <input value={linha.descricao}
                                            onChange={e => {
                                                const arr = [...linhas];
                                                arr[i] = { ...arr[i], descricao: e.target.value };
                                                updateLinhas(arr);
                                            }}
                                            className={`${Z.inp} flex-1 text-xs`}
                                            placeholder="Descrição do custo" disabled={!isGerente} />
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>R$</span>
                                            <input type="number" min="0" step="50"
                                                value={linha.valor || ''}
                                                onChange={e => {
                                                    const arr = [...linhas];
                                                    arr[i] = { ...arr[i], valor: parseFloat(e.target.value) || 0 };
                                                    updateLinhas(arr);
                                                }}
                                                className={`${Z.inp} w-28 text-xs text-right`}
                                                placeholder="0,00" disabled={!isGerente} />
                                        </div>
                                        <button onClick={() => updateLinhas(linhas.filter((_, j) => j !== i))}
                                            className="p-1 rounded hover:opacity-70 cursor-pointer"
                                            style={{ color: 'var(--danger)' }}
                                            disabled={!isGerente} title="Excluir">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add + Save */}
                            <div className="flex items-center justify-between">
                                <button onClick={() => updateLinhas([...linhas, { descricao: '', valor: 0 }])}
                                    className={`${Z.btn2} text-xs`} disabled={!isGerente}>
                                    <Plus size={12} /> Adicionar item
                                </button>
                                <button onClick={async () => { await saveEmpresa(); await saveTaxas(); }}
                                    className={`${Z.btn} text-xs`} disabled={!isGerente}>
                                    Salvar Custos
                                </button>
                            </div>

                            <p className="text-[10px] mt-4" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                O custo/dia será usado no painel comparativo dos orçamentos: <strong>custo/dia × prazo de execução + material = referência</strong>.
                                Configure o prazo de execução em cada orçamento para ver a comparação.
                            </p>
                        </div>

                        {/* ── Fase 1: Custo-Hora da Fábrica ── */}
                        <div className={Z.card} style={{ marginTop: 20 }}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <Ic.Clock />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Custo-Hora da Fábrica</h2>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Calcula mão de obra pelo tempo real de produção, não pelo custo do material.</p>
                                </div>
                                <button
                                    onClick={() => { st(prev => ({ ...prev, custo_hora_ativo: prev.custo_hora_ativo ? 0 : 1 })); }}
                                    disabled={!isGerente}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all"
                                    style={{
                                        background: tx.custo_hora_ativo ? 'var(--primary)' : 'var(--bg-muted)',
                                        color: tx.custo_hora_ativo ? '#fff' : 'var(--text-muted)',
                                        border: '1px solid var(--border)',
                                    }}>
                                    {tx.custo_hora_ativo ? 'Ativo' : 'Inativo'}
                                </button>
                            </div>

                            {tx.custo_hora_ativo ? (
                                <div className="flex flex-col gap-4">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            ['func_producao', 'Funcionários produção', 10, ''],
                                            ['horas_dia', 'Horas/dia', 8.5, 'h'],
                                            ['dias_uteis', 'Dias úteis/mês', 22, ''],
                                            ['eficiencia', 'Eficiência (%)', 75, '%'],
                                        ].map(([k, l, def, suf]) => (
                                            <div key={k}>
                                                <label className={Z.lbl}>{l}</label>
                                                <div className="flex items-center gap-1">
                                                    <input type="number" value={tx[k] ?? def} step={k === 'horas_dia' ? 0.5 : 1}
                                                        onChange={e => st({ ...tx, [k]: parseFloat(e.target.value) || def })}
                                                        className={`${Z.inp} flex-1`} disabled={!isGerente} />
                                                    {suf && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{suf}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Custo-hora calculado */}
                                    {(() => {
                                        const func = tx.func_producao || 10;
                                        const hDia = tx.horas_dia || 8.5;
                                        const dias_ = tx.dias_uteis || 22;
                                        const efic = (tx.eficiencia || 75) / 100;
                                        const horasMes = func * hDia * dias_ * efic;
                                        const custoHoraCalc = horasMes > 0 ? totalMensal / horasMes : 0;
                                        return (
                                            <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-muted)' }}>
                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    {N(horasMes, 0)}h produtivas/mês
                                                </span>
                                                <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>
                                                    R$ {custoHoraCalc.toFixed(2)}/hora
                                                </span>
                                            </div>
                                        );
                                    })()}

                                    <div>
                                        <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>CNC (baseado em dimensões reais)</div>
                                        <div className="grid grid-cols-3 gap-2 mb-4">
                                            {[
                                                ['cnc_velocidade', 'Vel. avanço (mm/min)', 5000],
                                                ['cnc_overhead_peca', 'Overhead/peça (seg)', 20],
                                                ['cnc_overhead_chapa', 'Overhead/chapa (seg)', 300],
                                            ].map(([k, l, def]) => (
                                                <div key={k}>
                                                    <label className={Z.lbl}>{l}</label>
                                                    <input type="number" value={tx[k] ?? def} step={k === 'cnc_velocidade' ? 100 : 5} min={0}
                                                        onChange={e => st({ ...tx, [k]: parseFloat(e.target.value) || def })}
                                                        className={`${Z.inp} w-full`} disabled={!isGerente} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Fita de borda (baseado em dimensões reais)</div>
                                        <div className="grid grid-cols-2 gap-2 mb-4">
                                            {[
                                                ['fita_velocidade', 'Vel. fitagem (mm/min)', 500],
                                                ['fita_overhead_borda', 'Overhead/borda (seg)', 90],
                                            ].map(([k, l, def]) => (
                                                <div key={k}>
                                                    <label className={Z.lbl}>{l}</label>
                                                    <input type="number" value={tx[k] ?? def} step={k === 'fita_velocidade' ? 50 : 5} min={0}
                                                        onChange={e => st({ ...tx, [k]: parseFloat(e.target.value) || def })}
                                                        className={`${Z.inp} w-full`} disabled={!isGerente} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Demais operações</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                ['tempo_furacao', 'Furação (h/un) — ~1min', 0.017],
                                                ['tempo_montagem', 'Montagem base (h/caixa)', 0.25],
                                                ['tempo_montagem_porta', 'Montagem porta (h/porta)', 0.15],
                                                ['tempo_montagem_gaveta', 'Montagem gaveta (h/gaveta)', 0.25],
                                                ['tempo_montagem_prat', 'Montagem prateleira (h/un)', 0.05],
                                                ['tempo_acabamento', 'Acabamento (h/m²) — ~6m²/h', 0.17],
                                                ['tempo_embalagem', 'Embalagem (h/módulo)', 0.25],
                                                ['tempo_instalacao', 'Instalação (h/módulo) — ~45min', 0.75],
                                            ].map(([k, l, def]) => (
                                                <div key={k}>
                                                    <label className={Z.lbl}>{l}</label>
                                                    <input type="number" value={tx[k] ?? def} step={0.01} min={0}
                                                        onChange={e => st({ ...tx, [k]: parseFloat(e.target.value) || def })}
                                                        className={`${Z.inp} w-full`} disabled={!isGerente} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <p className="text-[10px]" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                        O tempo de <strong>CNC</strong> é calculado pelo perímetro real de cada peça ÷ velocidade de avanço + overhead (carregar chapa, etiquetar, etc.).
                                        O tempo de <strong>fita</strong> é calculado por nº de bordas × overhead (pegar, girar, destopar, limar) + metros ÷ velocidade de colagem.
                                        Demais operações usam tempo fixo por unidade. Tudo × custo/hora da fábrica.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-xs p-3 rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    Quando inativo, a mão de obra é calculada pelo fator multiplicador em Taxas & Markup ({(tx.mk_mdo ?? 0.80)}× sobre chapas).
                                </div>
                            )}
                        </div>

                        {/* ── Fase 2: Consumíveis ── */}
                        <div className={Z.card} style={{ marginTop: 20 }}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <Ic.Package />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Consumíveis</h2>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cola, minifix, parafusos, lixa e embalagem — custos invisíveis que somam 3-5% do projeto.</p>
                                </div>
                                <button
                                    onClick={() => { st(prev => ({ ...prev, consumiveis_ativo: prev.consumiveis_ativo ? 0 : 1 })); }}
                                    disabled={!isGerente}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all"
                                    style={{
                                        background: tx.consumiveis_ativo ? 'var(--primary)' : 'var(--bg-muted)',
                                        color: tx.consumiveis_ativo ? '#fff' : 'var(--text-muted)',
                                        border: '1px solid var(--border)',
                                    }}>
                                    {tx.consumiveis_ativo ? 'Ativo' : 'Inativo'}
                                </button>
                            </div>

                            {tx.consumiveis_ativo ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {[
                                        ['cons_cola_m2', 'Cola PVA/PUR (R$/m²)', 2.50],
                                        ['cons_minifix_un', 'Minifix/Cavilha (R$/junção)', 1.80],
                                        ['cons_parafuso_un', 'Parafusos (R$/ponto)', 0.35],
                                        ['cons_lixa_m2', 'Lixa/Abrasivo (R$/m²)', 1.20],
                                        ['cons_embalagem_mod', 'Embalagem (R$/módulo)', 15.00],
                                    ].map(([k, l, def]) => (
                                        <div key={k}>
                                            <label className={Z.lbl}>{l}</label>
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>R$</span>
                                                <input type="number" value={tx[k] ?? def} step={0.05} min={0}
                                                    onChange={e => st({ ...tx, [k]: parseFloat(e.target.value) || def })}
                                                    className={`${Z.inp} flex-1`} disabled={!isGerente} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs p-3 rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    Quando inativo, consumíveis não são incluídos no cálculo do orçamento.
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {activeSection === 'backup' && (
                <div className="max-w-2xl">
                    <div className={Z.card}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                <Database size={20} style={{ color: 'var(--primary)' }} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Backup do Sistema</h3>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Exportar e importar todos os dados do sistema</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            {/* Exportar */}
                            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <Download size={16} style={{ color: '#22c55e' }} />
                                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Exportar Backup</span>
                                </div>
                                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                                    Baixa um arquivo JSON com todos os dados: empresa, taxas, biblioteca, modulos,
                                    clientes, orcamentos, projetos, financeiro, estoque e mais.
                                </p>
                                <button
                                    onClick={async () => {
                                        setBackupLoading(true); setBackupResult(null);
                                        try {
                                            const resp = await fetch('/api/config/backup', {
                                                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                                            });
                                            if (!resp.ok) throw new Error('Erro ao gerar backup');
                                            const blob = await resp.blob();
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `ornato-backup-${new Date().toISOString().slice(0, 10)}.json`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                            setBackupResult({ ok: true, msg: 'Backup exportado com sucesso!' });
                                        } catch (e) {
                                            setBackupResult({ ok: false, msg: e.message || 'Erro ao exportar' });
                                        }
                                        setBackupLoading(false);
                                    }}
                                    disabled={backupLoading}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                                    style={{ background: '#22c55e' }}
                                >
                                    {backupLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                                    Exportar Backup
                                </button>
                            </div>

                            {/* Importar */}
                            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <Upload size={16} style={{ color: 'var(--primary)' }} />
                                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Importar Backup</span>
                                </div>
                                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                                    Restaurar dados a partir de um arquivo de backup JSON.
                                    Os dados atuais serao substituidos (exceto senhas de usuarios).
                                </p>
                                <input
                                    ref={backupInputRef}
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (!confirm(`Tem certeza que deseja importar o backup "${file.name}"?\n\nIsso vai SUBSTITUIR os dados atuais do sistema.`)) {
                                            e.target.value = '';
                                            return;
                                        }
                                        setBackupLoading(true); setBackupResult(null);
                                        try {
                                            const text = await file.text();
                                            const json = JSON.parse(text);
                                            const resp = await api.post('/config/backup', json);
                                            setBackupResult({ ok: true, msg: resp.mensagem || 'Backup importado com sucesso!' });
                                            if (reload) reload();
                                        } catch (err) {
                                            setBackupResult({ ok: false, msg: err.error || err.message || 'Erro ao importar backup' });
                                        }
                                        setBackupLoading(false);
                                        e.target.value = '';
                                    }}
                                />
                                <button
                                    onClick={() => backupInputRef.current?.click()}
                                    disabled={backupLoading}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                                    style={{ background: 'var(--primary)' }}
                                >
                                    {backupLoading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                                    Selecionar Arquivo JSON
                                </button>
                            </div>

                            {/* Resultado */}
                            {backupResult && (
                                <div className="flex items-center gap-2 p-3 rounded-lg text-sm" style={{
                                    background: backupResult.ok ? '#dcfce7' : '#fee2e2',
                                    color: backupResult.ok ? '#166534' : '#991b1b',
                                }}>
                                    {backupResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                                    {backupResult.msg}
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            <div className="font-semibold mb-1">O que e incluido no backup:</div>
                            <div className="grid grid-cols-2 gap-1">
                                <span>Dados da empresa</span><span>Taxas e markup</span>
                                <span>Biblioteca (materiais)</span><span>Modulos (caixas/componentes)</span>
                                <span>Clientes + interacoes</span><span>Orcamentos completos</span>
                                <span>Projetos + etapas</span><span>Financeiro (contas)</span>
                                <span>Estoque + movimentacoes</span><span>Chat + mensagens</span>
                                <span>Usuarios (sem senhas)</span><span>Configuracoes IA/WhatsApp</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
