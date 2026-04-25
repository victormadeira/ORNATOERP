import { useState, useEffect, useRef } from 'react';
import { Z, Ic } from '../ui';
import api from '../api';
import { useAuth } from '../auth';
import { applyPrimaryColor } from '../theme';
import { DEFAULT_CONTRATO_TEMPLATE } from './ContratoHtml';
import { RefreshCw, Search, Smartphone, Check, CheckCircle2, XCircle, FlaskConical, Brain, Bot, Download, Upload, Database, Images, ArrowUp, ArrowDown, Pencil, Trash2, Plus, PenTool, Shield, BellOff, AlertTriangle, Palette, ExternalLink, Bell, Clock, MessageCircle, Phone, MapPin, Zap } from 'lucide-react';

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
                    style={{ marginTop: 8, fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
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

export default function Cfg({ taxas, reload, notify, allMenuItems, menusOcultos, onMenusChange }) {
    const { isGerente } = useAuth();
    const [tx, st] = useState(taxas);
    const [emp, setEmp] = useState({
        nome: '', cnpj: '', endereco: '', cidade: '', estado: '', cep: '',
        telefone: '', email: '', site: '', logo: '', logo_sistema: '', logo_watermark: '', logo_watermark_opacity: 0.04,
        sistema_cor_primaria: '#1379F0',
        contrato_template: '',
        proposta_cor_primaria: '#1B2A4A', proposta_cor_accent: '#C9A96E',
        proposta_sobre: '', proposta_garantia: '', proposta_consideracoes: '', proposta_rodape: '', proposta_incluso: '',
        instagram: '', facebook: '', anos_experiencia: 0,
        projetos_entregues: 0, maquinas_industriais: 0, texto_institucional: '', desc_maquinas: '',
        responsavel_legal_nome: '', responsavel_legal_cpf: '', assinatura_empresa_img: '',
        portal_mostrar_pagamento: 0,
        gdrive_credentials: '', gdrive_folder_id: '',
        gdrive_client_id: '', gdrive_client_secret: '',
        wa_instance_url: '', wa_instance_name: '', wa_api_key: '', wa_webhook_token: '', wa_owner_phone: '',
        ia_provider: 'anthropic', ia_api_key: '', ia_api_key_anthropic: '', ia_api_key_gemini: '', ia_api_key_openai: '', ia_model: 'claude-sonnet-4',
        ia_system_prompt: '', ia_temperatura: 0.7, ia_ativa: 0, ia_blocked_phones: '',
        ia_sugestoes_ativa: 1,
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
        clarity_project_id: 'wed7zy3qnz',
        fb_pixel_id: '',
        google_ads_id: '',
        fb_access_token: '',
        n8n_webhook_url: '',
        n8n_webhook_secret: '',
        centro_custo_json: '[]',
        centro_custo_dias_uteis: 22,
    });
    const [waStatus, setWaStatus] = useState(null);
    const [waQR, setWaQR] = useState(null);
    const [waChecking, setWaChecking] = useState(false);
    const [iaTestResult, setIaTestResult] = useState(null);
    const [iaTesting, setIaTesting] = useState(false);
    const [iaUso, setIaUso] = useState(null);
    const [iaUsoLoading, setIaUsoLoading] = useState(false);
    const [iaPrompt, setIaPrompt] = useState(null); // { default, custom, usando }
    const [iaPromptDraft, setIaPromptDraft] = useState('');
    const [iaPromptLoading, setIaPromptLoading] = useState(false);
    const [iaPromptSaving, setIaPromptSaving] = useState(false);
    const [iaPromptMode, setIaPromptMode] = useState('view'); // view | edit | default
    const [iaPromptSaved, setIaPromptSaved] = useState(false);
    // Prospecção ativa
    const [prospeccao, setProspeccao] = useState(null); // { ativa, prompt, prompt_default, delay_min, followup_horas, estatisticas }
    const [prospeccaoDraft, setProspeccaoDraft] = useState({ ativa: false, prompt: '', delay_min: 2, followup_horas: 24 });
    const [prospeccaoLoading, setProspeccaoLoading] = useState(false);
    const [prospeccaoSaving, setProspeccaoSaving] = useState(false);
    const [prospeccaoSaved, setProspeccaoSaved] = useState(false);
    const [prospeccaoMode, setProspeccaoMode] = useState('view'); // view | edit | default
    // Automações n8n — reativação de clientes inativos (preview queue)
    const [reatItems, setReatItems] = useState([]);
    const [reatStats, setReatStats] = useState({});
    const [reatAuto, setReatAuto] = useState(false);
    const [reatLoading, setReatLoading] = useState(false);
    const [reatActionId, setReatActionId] = useState(null);
    // Sandbox de simulação
    const [simHistory, setSimHistory] = useState([]); // [{role:'user'|'assistant', content:''}]
    const [simInput, setSimInput] = useState('');
    const [simSending, setSimSending] = useState(false);
    const [simDossie, setSimDossie] = useState({});
    const [simScore, setSimScore] = useState(null); // { score, classificacao, tags, violations, detalhes }
    const [simBloqueado, setSimBloqueado] = useState(null); // { motivo } — uma vez bloqueada, nada mais vai pra API
    const [simOpen, setSimOpen] = useState(false);
    // Escalação pós-handoff
    const [escCfg, setEscCfg] = useState({ ativa: true, sla: null });
    const [escSaved, setEscSaved] = useState(false);
    // Tokens da extensão Chrome
    const [extTokens, setExtTokens] = useState([]);
    const [extNovoTokenNome, setExtNovoTokenNome] = useState('');
    const [extTokenRevelado, setExtTokenRevelado] = useState(null); // { id, token, nome }
    const [extLogs, setExtLogs] = useState([]);
    const [extLogsOpen, setExtLogsOpen] = useState(false);
    // Templates
    const [templates, setTemplates] = useState([]);
    const [tplEdit, setTplEdit] = useState(null); // { id?, titulo, conteudo, atalho, categoria, ativo }
    const [tplOpen, setTplOpen] = useState(false);
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
    const [driveBackups, setDriveBackups] = useState([]);
    const [driveBackupLoading, setDriveBackupLoading] = useState(false);
    const [portfolio, setPortfolio] = useState([]);
    const [portEdit, setPortEdit] = useState(null); // { titulo, designer, descricao, imagem, ambiente } or null
    const portImgRef = useRef();
    // Config visual/texto da página pública /portfolioornato (desacoplada da landing)
    const [portCfg, setPortCfg] = useState({
        portfolio_ativo: 1,
        portfolio_logo: '',
        portfolio_tag: 'Nosso trabalho',
        portfolio_titulo: 'Projetos que transformam ambientes em experiências',
        portfolio_subtitulo: 'Marcenaria sob medida com acabamento premium.\nCada projeto, único — feito especialmente para você.',
        portfolio_cor_fundo: '#1E1917',
        portfolio_cor_destaque: '#C9A96E',
        portfolio_wa_mensagem: '',
        portfolio_footer_texto: 'Marcenaria sob medida',
        portfolio_cta_texto: 'Solicitar projeto',
    });
    const [portCfgSaving, setPortCfgSaving] = useState(false);
    const [depoimentos, setDepoimentos] = useState([]);
    const [depEdit, setDepEdit] = useState(null); // { nome_cliente, texto, estrelas } or null
    const [fuColunas, setFuColunas] = useState([]);
    const [fuRegras, setFuRegras] = useState([]);
    const [fuForm, setFuForm] = useState({ coluna_id: '', tipo: 'whatsapp', horas_apos: 24, notas: '' });
    const [fuEditId, setFuEditId] = useState(null);

    const loadFollowUps = () => {
        Promise.all([
            api.get('/leads/colunas').catch(() => []),
            api.get('/follow-ups/regras').catch(() => []),
        ]).then(([cols, regs]) => {
            setFuColunas(Array.isArray(cols) ? cols : []);
            setFuRegras(Array.isArray(regs) ? regs : []);
        });
    };

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
                proposta_incluso: d.proposta_incluso || '',
                instagram: d.instagram || '',
                facebook: d.facebook || '',
                anos_experiencia: d.anos_experiencia || 0,
                projetos_entregues: d.projetos_entregues || 0,
                maquinas_industriais: d.maquinas_industriais || 0,
                texto_institucional: d.texto_institucional || '',
                desc_maquinas: d.desc_maquinas || '',
                responsavel_legal_nome: d.responsavel_legal_nome || '',
                responsavel_legal_cpf: d.responsavel_legal_cpf || '',
                assinatura_empresa_img: d.assinatura_empresa_img || '',
                portal_mostrar_pagamento: d.portal_mostrar_pagamento ?? 0,
                gdrive_credentials: d.gdrive_credentials || '',
                gdrive_folder_id: d.gdrive_folder_id || '',
                gdrive_client_id: d.gdrive_client_id || '',
                gdrive_client_secret: d.gdrive_client_secret || '',
                wa_instance_url: d.wa_instance_url || '',
                wa_instance_name: d.wa_instance_name || '',
                wa_api_key: d.wa_api_key || '',
                wa_webhook_token: d.wa_webhook_token || '',
                wa_owner_phone: d.wa_owner_phone || '',
                ia_provider: d.ia_provider || 'anthropic',
                ia_api_key: d.ia_api_key || '',
                ia_api_key_anthropic: d.ia_api_key_anthropic || '',
                ia_api_key_gemini: d.ia_api_key_gemini || '',
                ia_api_key_openai: d.ia_api_key_openai || '',
                ia_model: d.ia_model || 'claude-sonnet-4',
                ia_system_prompt: d.ia_system_prompt || '',
                ia_temperatura: d.ia_temperatura ?? 0.7,
                ia_ativa: d.ia_ativa ?? 0,
                ia_blocked_phones: d.ia_blocked_phones || '',
                ia_sugestoes_ativa: d.ia_sugestoes_ativa ?? 1,
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
                clarity_project_id: d.clarity_project_id ?? 'wed7zy3qnz',
                fb_pixel_id: d.fb_pixel_id || '',
                google_ads_id: d.google_ads_id || '',
                fb_access_token: d.fb_access_token || '',
                n8n_webhook_url: d.n8n_webhook_url || '',
                n8n_webhook_secret: d.n8n_webhook_secret || '',
                centro_custo_json: d.centro_custo_json || '[]',
                centro_custo_dias_uteis: d.centro_custo_dias_uteis ?? 22,
            });
        }).catch(e => notify(e.error || 'Erro ao carregar configurações'));
        api.get('/portfolio').then(setPortfolio).catch(e => notify(e.error || 'Erro ao carregar portfolio'));
        api.get('/portfolio/config').then(d => setPortCfg(prev => ({ ...prev, ...d }))).catch(() => {});
        api.get('/depoimentos').then(setDepoimentos).catch(() => {});
        api.get('/config/escalacao').then(d => setEscCfg({ ativa: d.ativa !== false, sla: d.sla || null })).catch(() => {});
        api.get('/ext/tokens').then(setExtTokens).catch(() => {});
        api.get('/templates').then(setTemplates).catch(() => {});
    }, []);

    const loadExtTokens = () => api.get('/ext/tokens').then(setExtTokens).catch(() => {});
    const loadExtLogs = () => api.get('/ext/logs?limit=100').then(setExtLogs).catch(() => {});
    const loadTemplates = () => api.get('/templates').then(setTemplates).catch(() => {});

    const salvarTemplate = async () => {
        if (!tplEdit || !tplEdit.titulo || !tplEdit.conteudo) {
            notify('Preencha título e conteúdo');
            return;
        }
        try {
            if (tplEdit.id) {
                await api.put(`/templates/${tplEdit.id}`, tplEdit);
            } else {
                await api.post('/templates', tplEdit);
            }
            setTplEdit(null);
            loadTemplates();
        } catch (e) {
            notify(e.error || 'Erro ao salvar template');
        }
    };

    const excluirTemplate = async (id) => {
        if (!confirm('Excluir este template?')) return;
        try {
            await api.delete(`/templates/${id}`);
            loadTemplates();
        } catch (e) {
            notify(e.error || 'Erro ao excluir');
        }
    };

    const baixarExtensao = async () => {
        try {
            const token = localStorage.getItem('erp_token');
            const r = await fetch('/api/ext/download-extension', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                notify(d.error || 'Erro ao baixar');
                return;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ornato-extension.zip';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            notify('Erro: ' + e.message);
        }
    };

    const criarExtToken = async () => {
        try {
            const r = await api.post('/ext/tokens', { nome: extNovoTokenNome || 'Minha extensão' });
            setExtTokenRevelado({ id: r.id, token: r.token, nome: r.nome });
            setExtNovoTokenNome('');
            loadExtTokens();
        } catch (e) {
            notify(e.error || 'Erro ao criar token');
        }
    };

    const revogarExtToken = async (id) => {
        if (!confirm('Revogar este token? A extensão que o usa vai parar de funcionar.')) return;
        try {
            await api.delete(`/ext/tokens/${id}`);
            loadExtTokens();
        } catch (e) {
            notify(e.error || 'Erro ao revogar');
        }
    };

    const salvarEscCfg = async () => {
        try {
            await api.put('/config/escalacao', escCfg);
            setEscSaved(true);
            setTimeout(() => setEscSaved(false), 2000);
        } catch (e) {
            notify(e.error || 'Erro ao salvar config de escalação');
        }
    };

    const loadPortfolio = () => api.get('/portfolio').then(setPortfolio).catch(e => notify(e.error || 'Erro ao carregar portfolio'));
    const loadDepoimentos = () => api.get('/depoimentos').then(setDepoimentos).catch(() => {});

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
                proposta_incluso: emp.proposta_incluso,
                instagram: emp.instagram,
                facebook: emp.facebook,
                anos_experiencia: emp.anos_experiencia,
                projetos_entregues: emp.projetos_entregues,
                maquinas_industriais: emp.maquinas_industriais,
                texto_institucional: emp.texto_institucional,
                desc_maquinas: emp.desc_maquinas,
                responsavel_legal_nome: emp.responsavel_legal_nome,
                responsavel_legal_cpf: emp.responsavel_legal_cpf,
                assinatura_empresa_img: emp.assinatura_empresa_img,
                portal_mostrar_pagamento: emp.portal_mostrar_pagamento,
                gdrive_credentials: emp.gdrive_credentials,
                gdrive_folder_id: emp.gdrive_folder_id,
                gdrive_client_id: emp.gdrive_client_id,
                gdrive_client_secret: emp.gdrive_client_secret,
                wa_instance_url: emp.wa_instance_url,
                wa_instance_name: emp.wa_instance_name,
                wa_api_key: emp.wa_api_key,
                wa_webhook_token: emp.wa_webhook_token,
                wa_owner_phone: emp.wa_owner_phone,
                ia_provider: emp.ia_provider,
                ia_api_key: emp.ia_api_key,
                ia_api_key_anthropic: emp.ia_api_key_anthropic,
                ia_api_key_gemini: emp.ia_api_key_gemini,
                ia_api_key_openai: emp.ia_api_key_openai,
                ia_model: emp.ia_model,
                ia_system_prompt: emp.ia_system_prompt,
                ia_temperatura: emp.ia_temperatura,
                ia_ativa: emp.ia_ativa,
                ia_blocked_phones: emp.ia_blocked_phones,
                ia_sugestoes_ativa: emp.ia_sugestoes_ativa,
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
                clarity_project_id: emp.clarity_project_id,
                fb_pixel_id: emp.fb_pixel_id,
                google_ads_id: emp.google_ads_id,
                fb_access_token: emp.fb_access_token,
                n8n_webhook_url: emp.n8n_webhook_url,
                n8n_webhook_secret: emp.n8n_webhook_secret,
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

    const loadIaUso = async () => {
        setIaUsoLoading(true);
        try {
            const d = await api.get('/ia/uso');
            setIaUso(d);
        } catch (e) { /* silencioso */ }
        setIaUsoLoading(false);
    };

    const loadIaPrompt = async () => {
        setIaPromptLoading(true);
        try {
            const d = await api.get('/ia/prompt');
            setIaPrompt(d);
            setIaPromptDraft(d.custom || d.default);
        } catch (e) { /* silencioso */ }
        setIaPromptLoading(false);
    };

    const saveIaPrompt = async () => {
        setIaPromptSaving(true);
        try {
            await api.put('/ia/prompt', { custom: iaPromptDraft });
            setIaPromptSaved(true);
            setTimeout(() => setIaPromptSaved(false), 2500);
            await loadIaPrompt();
            setIaPromptMode('view');
        } catch (e) { notify?.('Erro ao salvar prompt: ' + e.message, 'error'); }
        setIaPromptSaving(false);
    };

    // ═══ Sandbox de simulação ═══
    const simEnviar = async () => {
        if (!simInput.trim() || simSending) return;
        const texto = simInput.trim();
        const newHistory = [...simHistory, { role: 'user', content: texto }];

        // Uma vez bloqueada, nada mais vai pra API — cliente real nem veria resposta
        if (simBloqueado) {
            setSimHistory(newHistory);
            setSimInput('');
            return;
        }

        setSimHistory(newHistory);
        setSimInput('');
        setSimSending(true);
        try {
            const r = await api.post('/ia/simulate', {
                history: simHistory,
                message: texto,
                dossie_acumulado: simDossie,
            });
            if (r.bloqueado) {
                setSimBloqueado({ motivo: r.bloqueio_motivo });
                // NÃO adiciona bolha — em produção o cliente não recebe nada
                setSimScore({
                    score: 0,
                    classificacao: 'frio',
                    tags: r.tags || [],
                    violations: [],
                    detalhes: r.score_detalhes || [],
                    intencao: null,
                    sanitized: false,
                });
            } else {
                setSimHistory([...newHistory, { role: 'assistant', content: r.text }]);
                setSimDossie(r.dossie_acumulado || {});
                setSimScore({
                    score: r.score,
                    classificacao: r.classificacao,
                    tags: r.tags,
                    violations: r.violations,
                    detalhes: r.score_detalhes,
                    intencao: r.intencao,
                    sanitized: r.sanitized,
                });
                // IA decidiu silenciar via dossiê (troll detectado pela própria IA)
                if (r.dossie_acumulado?.ia_deve_silenciar) {
                    setSimBloqueado({ motivo: 'ia_silenciou_troll' });
                }
            }
        } catch (e) {
            setSimHistory([...newHistory, { role: 'assistant', content: `[erro: ${e.error || e.message}]` }]);
        }
        setSimSending(false);
    };

    const simResetar = () => {
        setSimHistory([]);
        setSimDossie({});
        setSimScore(null);
        setSimInput('');
        setSimBloqueado(null);
    };

    const loadProspeccao = async () => {
        setProspeccaoLoading(true);
        try {
            const d = await api.get('/ia/prospeccao');
            setProspeccao(d);
            setProspeccaoDraft({
                ativa: !!d.ativa,
                prompt: d.prompt || '',
                delay_min: d.delay_min ?? 2,
                followup_horas: d.followup_horas ?? 24,
            });
        } catch (e) { /* silencioso */ }
        setProspeccaoLoading(false);
    };

    const saveProspeccao = async () => {
        setProspeccaoSaving(true);
        try {
            await api.put('/ia/prospeccao', {
                ativa: prospeccaoDraft.ativa ? 1 : 0,
                prompt: prospeccaoDraft.prompt,
                delay_min: Number(prospeccaoDraft.delay_min) || 0,
                followup_horas: Number(prospeccaoDraft.followup_horas) || 24,
            });
            setProspeccaoSaved(true);
            setTimeout(() => setProspeccaoSaved(false), 2500);
            await loadProspeccao();
            setProspeccaoMode('view');
        } catch (e) { notify?.('Erro ao salvar prospecção: ' + (e.error || e.message), 'error'); }
        setProspeccaoSaving(false);
    };

    const loadReativacao = async () => {
        setReatLoading(true);
        try {
            const d = await api.get('/automacoes/reativacao/preview?status=pending&limit=100');
            setReatItems(d.items || []);
            setReatStats(d.stats || {});
            setReatAuto(!!d.reativacao_auto);
        } catch (e) { /* silencioso */ }
        setReatLoading(false);
    };

    const aprovarReat = async (id) => {
        setReatActionId(id);
        try {
            await api.post(`/automacoes/reativacao/preview/${id}/aprovar`);
            notify?.('Webhook disparado pro n8n', 'success');
            await loadReativacao();
        } catch (e) { notify?.('Erro: ' + (e.error || e.message), 'error'); }
        setReatActionId(null);
    };

    const rejeitarReat = async (id) => {
        const motivo = prompt('Motivo da rejeição (opcional):', '') || '';
        setReatActionId(id);
        try {
            await api.post(`/automacoes/reativacao/preview/${id}/rejeitar`, { motivo });
            await loadReativacao();
        } catch (e) { notify?.('Erro: ' + (e.error || e.message), 'error'); }
        setReatActionId(null);
    };

    const toggleReatAuto = async () => {
        try {
            await api.put('/automacoes/reativacao/config', { reativacao_auto: !reatAuto });
            setReatAuto(!reatAuto);
            notify?.(reatAuto ? 'Modo PREVIEW ativado' : 'Modo AUTO ativado — candidatos disparam direto', 'success');
        } catch (e) { notify?.('Erro: ' + (e.error || e.message), 'error'); }
    };

    const rodarScanReat = async () => {
        setReatLoading(true);
        try {
            await api.post('/automacoes/reativacao/scan');
            await loadReativacao();
            notify?.('Varredura executada', 'success');
        } catch (e) { notify?.('Erro: ' + (e.error || e.message), 'error'); }
        setReatLoading(false);
    };

    const resetProspeccaoPrompt = () => {
        if (!prospeccao?.prompt_default) return;
        if (!confirm('Substituir o prompt de prospecção pelo texto padrão? O texto atual será perdido ao salvar.')) return;
        setProspeccaoDraft(d => ({ ...d, prompt: prospeccao.prompt_default }));
        setProspeccaoMode('edit');
    };

    const resetIaPrompt = async () => {
        if (!confirm('Restaurar o prompt padrão da Sofia? Seu prompt customizado será apagado.')) return;
        setIaPromptSaving(true);
        try {
            await api.post('/ia/prompt/reset');
            await loadIaPrompt();
            setIaPromptMode('view');
            notify?.('Prompt restaurado para o padrão Sofia v2', 'success');
        } catch (e) { notify?.('Erro ao restaurar: ' + e.message, 'error'); }
        setIaPromptSaving(false);
    };

    useEffect(() => {
        if (activeSection === 'ia') {
            loadIaUso();
            loadIaPrompt();
            loadProspeccao();
        }
        if (activeSection === 'followups') {
            loadFollowUps();
        }
        if (activeSection === 'automacoes') {
            loadReativacao();
        }

    }, [activeSection]);

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
                {sectionBtn('automacoes', 'Automações n8n', <Zap size={16} />)}
                {sectionBtn('landing', 'Landing Page', <Ic.Star />)}
                {sectionBtn('portfolio', 'Portfolio', <Images size={16} />)}
                {sectionBtn('depoimentos', 'Depoimentos', <Ic.Star />)}
                {sectionBtn('followups', 'Follow-ups', <Bell size={16} />)}
                {sectionBtn('etapas', 'Etapas do Projeto', <CheckCircle2 size={16} />)}
                {sectionBtn('custos', 'Centro de Custo', <Ic.Dollar />)}
                {sectionBtn('modulos', 'Módulos', <Shield size={16} />)}
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
                                        {['#1379F0', '#8B5CF6', '#059669', '#EA580C', 'var(--danger-hover)', '#0891B2', '#4F46E5', '#D946EF'].map(c => (
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
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
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
                                    background: emp.upmobb_ativo ? 'var(--success-bg)' : 'var(--bg-muted)',
                                    color: emp.upmobb_ativo ? 'var(--success)' : 'var(--text-muted)',
                                    border: `1px solid ${emp.upmobb_ativo ? 'var(--success-border)' : 'var(--border)'}`,
                                }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: emp.upmobb_ativo ? 'var(--success)' : 'var(--text-muted)',
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
                                <div>
                                    <label className={Z.lbl}>O que está incluso (separado por ;)</label>
                                    <textarea
                                        value={emp.proposta_incluso}
                                        onChange={e => setEmp({ ...emp, proposta_incluso: e.target.value })}
                                        disabled={!isGerente}
                                        rows={2}
                                        placeholder="Projeto 3D personalizado;Produção própria;Entrega e instalação;Acabamento premium;Garantia de fábrica"
                                        style={{
                                            width: '100%', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Aparece como checklist visual antes do investimento na proposta.
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={Z.card}>
                            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--primary)' }}>Redes Sociais e Experiência</h3>
                            <div className="grid gap-3">
                                <div>
                                    <label className={Z.lbl}>Instagram (@usuario)</label>
                                    <input
                                        value={emp.instagram}
                                        onChange={e => setEmp({ ...emp, instagram: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="@ornatomarcenaria"
                                        className={Z.inp}
                                    />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Facebook (URL ou nome)</label>
                                    <input
                                        value={emp.facebook}
                                        onChange={e => setEmp({ ...emp, facebook: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="https://facebook.com/ornatomarcenaria"
                                        className={Z.inp}
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className={Z.lbl}>Anos de Experiência</label>
                                        <input
                                            type="number"
                                            value={emp.anos_experiencia}
                                            onChange={e => setEmp({ ...emp, anos_experiencia: parseInt(e.target.value) || 0 })}
                                            disabled={!isGerente}
                                            placeholder="0"
                                            className={Z.inp}
                                        />
                                    </div>
                                    <div>
                                        <label className={Z.lbl}>Projetos Entregues</label>
                                        <input
                                            type="number"
                                            value={emp.projetos_entregues}
                                            onChange={e => setEmp({ ...emp, projetos_entregues: parseInt(e.target.value) || 0 })}
                                            disabled={!isGerente}
                                            placeholder="0"
                                            className={Z.inp}
                                        />
                                    </div>
                                    <div>
                                        <label className={Z.lbl}>Máquinas Industriais</label>
                                        <input
                                            type="number"
                                            value={emp.maquinas_industriais}
                                            onChange={e => setEmp({ ...emp, maquinas_industriais: parseInt(e.target.value) || 0 })}
                                            disabled={!isGerente}
                                            placeholder="0"
                                            className={Z.inp}
                                        />
                                    </div>
                                </div>
                                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                    Estes números aparecem nos stats da apresentação da proposta.
                                </div>
                                <div>
                                    <label className={Z.lbl}>Descrição das Máquinas (opcional)</label>
                                    <input
                                        value={emp.desc_maquinas}
                                        onChange={e => setEmp({ ...emp, desc_maquinas: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="Ex: Centro Nesting, Centro de Furação, Coladeira Industrial..."
                                        className={Z.inp}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Texto complementar exibido abaixo do número de máquinas na apresentação.
                                    </div>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Texto Institucional — Quem Somos</label>
                                    <textarea
                                        value={emp.texto_institucional}
                                        onChange={e => setEmp({ ...emp, texto_institucional: e.target.value })}
                                        disabled={!isGerente}
                                        rows={3}
                                        placeholder="Somos especialistas em móveis planejados sob medida, unindo a precisão da tecnologia de ponta ao capricho da marcenaria fina tradicional..."
                                        style={{
                                            width: '100%', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Texto da seção "Quem Somos" na apresentação da proposta. Deixe vazio para usar o texto padrão.
                                    </div>
                                </div>

                                {/* ── Responsável Legal & Assinatura Digital ── */}
                                <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <Shield size={16} style={{ color: 'var(--primary)' }} />
                                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Responsável Legal — Assinatura Digital</span>
                                    </div>
                                    <div className="text-[10px] mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                        Dados do responsável legal para assinatura digital de contratos (Lei 14.063/2020). A assinatura desenhada abaixo será pré-aplicada como CONTRATADA nos contratos enviados para assinatura.
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                                        <div>
                                            <label className={Z.lbl}>Nome Completo</label>
                                            <input
                                                type="text"
                                                value={emp.responsavel_legal_nome}
                                                onChange={e => setEmp({ ...emp, responsavel_legal_nome: e.target.value })}
                                                disabled={!isGerente}
                                                placeholder="Nome do responsável legal"
                                                style={{
                                                    width: '100%', fontSize: 12, padding: '8px 12px', borderRadius: 8,
                                                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                                    border: '1px solid var(--border)',
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label className={Z.lbl}>CPF</label>
                                            <input
                                                type="text"
                                                value={emp.responsavel_legal_cpf}
                                                onChange={e => {
                                                    const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                                                    let f = d;
                                                    if (d.length > 9) f = d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9);
                                                    else if (d.length > 6) f = d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6);
                                                    else if (d.length > 3) f = d.slice(0,3)+'.'+d.slice(3);
                                                    setEmp({ ...emp, responsavel_legal_cpf: f });
                                                }}
                                                disabled={!isGerente}
                                                placeholder="000.000.000-00"
                                                style={{
                                                    width: '100%', fontSize: 12, padding: '8px 12px', borderRadius: 8,
                                                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                                    border: '1px solid var(--border)',
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={Z.lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <PenTool size={13} /> Assinatura da Empresa
                                        </label>

                                        {/* Preview da assinatura digital */}
                                        {emp.assinatura_empresa_img ? (
                                            <div style={{ marginBottom: 8 }}>
                                                <div style={{
                                                    background: '#fff', borderRadius: 10, padding: '12px 16px',
                                                    border: '1px solid var(--border)', display: 'inline-block',
                                                }}>
                                                    <img src={emp.assinatura_empresa_img} alt="Assinatura" style={{ maxHeight: 80, maxWidth: '100%' }} />
                                                </div>
                                                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <CheckCircle2 size={14} style={{ color: 'var(--success-hover)' }} />
                                                    <span style={{ fontSize: 11, color: 'var(--success-hover)', fontWeight: 500 }}>Assinatura digital gerada</span>
                                                    {isGerente && (
                                                        <button
                                                            onClick={() => setEmp({ ...emp, assinatura_empresa_img: '' })}
                                                            style={{
                                                                marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
                                                                background: 'none', border: 'none', textDecoration: 'underline',
                                                            }}
                                                        >
                                                            Refazer
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                {/* Preview ao vivo da assinatura digital */}
                                                <div style={{
                                                    background: '#fff', borderRadius: 10, padding: '20px 24px',
                                                    border: '2px solid var(--border)', textAlign: 'center', marginBottom: 10,
                                                    minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {emp.responsavel_legal_nome ? (
                                                        <span style={{
                                                            fontFamily: "'Dancing Script', 'Brush Script MT', 'Segoe Script', cursive",
                                                            fontSize: 28, color: '#1a1a2e', fontWeight: 700,
                                                            letterSpacing: 1,
                                                        }}>
                                                            {emp.responsavel_legal_nome}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                                                            Preencha o nome do responsavel legal acima
                                                        </span>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        const nome = emp.responsavel_legal_nome?.trim();
                                                        if (!nome) { notify('Preencha o nome do responsavel legal primeiro'); return; }
                                                        // Gerar assinatura digital via canvas oculto
                                                        const canvas = document.createElement('canvas');
                                                        const W = 400, H = 100;
                                                        const dpr = window.devicePixelRatio || 1;
                                                        canvas.width = W * dpr; canvas.height = H * dpr;
                                                        const ctx = canvas.getContext('2d');
                                                        ctx.scale(dpr, dpr);
                                                        // Fundo transparente
                                                        ctx.clearRect(0, 0, W, H);
                                                        // Texto com fonte cursiva
                                                        ctx.fillStyle = '#1a1a2e';
                                                        ctx.textAlign = 'center';
                                                        ctx.textBaseline = 'middle';
                                                        // Tentar fontes cursivas em ordem
                                                        const fontes = ["'Dancing Script'", "'Brush Script MT'", "'Segoe Script'", "cursive"];
                                                        let fontSize = 36;
                                                        // Ajustar tamanho se nome muito longo
                                                        if (nome.length > 20) fontSize = 28;
                                                        if (nome.length > 30) fontSize = 22;
                                                        ctx.font = `700 ${fontSize}px ${fontes.join(', ')}`;
                                                        ctx.fillText(nome, W / 2, H / 2);
                                                        // Linha sutil embaixo
                                                        ctx.strokeStyle = '#1a1a2e';
                                                        ctx.lineWidth = 0.5;
                                                        ctx.globalAlpha = 0.3;
                                                        ctx.beginPath();
                                                        ctx.moveTo(W * 0.15, H * 0.75);
                                                        ctx.lineTo(W * 0.85, H * 0.75);
                                                        ctx.stroke();
                                                        ctx.globalAlpha = 1;
                                                        const dataUrl = canvas.toDataURL('image/png');
                                                        setEmp(prev => ({ ...prev, assinatura_empresa_img: dataUrl }));
                                                        notify('Assinatura digital gerada! Salve as configuracoes para persistir.');
                                                    }}
                                                    disabled={!isGerente || !emp.responsavel_legal_nome?.trim()}
                                                    style={{
                                                        width: '100%', padding: '8px 16px', borderRadius: 8, border: 'none',
                                                        background: emp.responsavel_legal_nome?.trim() ? 'var(--primary)' : '#d1d5db',
                                                        color: '#fff', fontSize: 12, fontWeight: 600,
                                                        cursor: emp.responsavel_legal_nome?.trim() ? 'pointer' : 'not-allowed',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                    }}
                                                >
                                                    <Check size={14} /> Gerar Assinatura Digital
                                                </button>
                                                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                    Assinatura gerada automaticamente a partir do nome. Validade juridica conforme Lei 14.063/2020.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                                    <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: isGerente ? 'pointer' : 'default' }}>
                                        <input
                                            type="checkbox"
                                            checked={!!emp.portal_mostrar_pagamento}
                                            onChange={e => setEmp({ ...emp, portal_mostrar_pagamento: e.target.checked ? 1 : 0 })}
                                            disabled={!isGerente}
                                            style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                                        />
                                        <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-primary)' }}>Mostrar status de pagamento no Portal do Cliente</span>
                                    </label>
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
                                    { name: 'Azul Moderno', pri: '#1a56db', acc: 'var(--warning)' },
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
                                    background: driveStatus?.ok ? 'var(--success)' : driveStatus === null ? 'var(--warning)' : 'var(--danger)',
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

                                <div>
                                    <label className={Z.lbl}>Número para Notificações (Handoff)</label>
                                    <input
                                        value={emp.wa_owner_phone}
                                        onChange={e => setEmp({ ...emp, wa_owner_phone: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="5598991234567"
                                        className={Z.inp}
                                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Seu número pessoal no formato internacional (55 + DDD + número). Quando a IA precisar chamar um humano, você receberá um aviso aqui.
                                    </div>
                                </div>

                                {/* Webhook URL Info */}
                                <div className="rounded-lg p-3 border-l-2" style={{ background: 'var(--bg-muted)', borderColor: 'var(--success)' }}>
                                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--success)' }}>URL do Webhook</div>
                                    <code className="text-xs" style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                        {`${window.location.origin}/api/webhook/whatsapp`}
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
                                            background: waStatus.connected ? 'var(--success)' : 'var(--danger)',
                                        }} />
                                        <span className="text-sm" style={{ color: waStatus.connected ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
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
                                    <code className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--primary)' }}>{`${window.location.origin}/api/webhook/whatsapp`}</code>
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
                                    <Check size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                    <span>Receber mensagens em tempo real</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                    <span>Resposta automática por IA</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                    <span>Escalação para atendente humano</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                    <span>Notas internas por conversa</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                    <span>Vinculação automática com clientes CRM</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Check size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
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
                                        background: emp.ia_ativa ? 'var(--success-bg)' : 'var(--bg-muted)',
                                        color: emp.ia_ativa ? 'var(--success)' : 'var(--text-muted)',
                                        border: `1px solid ${emp.ia_ativa ? 'var(--success-border)' : 'var(--border)'}`,
                                    }}
                                >
                                    <div style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: emp.ia_ativa ? 'var(--success)' : 'var(--text-muted)',
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
                                                const model = prov === 'anthropic' ? 'claude-sonnet-4' : prov === 'openai' ? 'gpt-4o' : 'gemini-2.5-flash';
                                                setEmp({ ...emp, ia_provider: prov, ia_model: model });
                                            }}
                                            disabled={!isGerente}
                                            className={Z.inp}
                                        >
                                            <option value="anthropic">Anthropic (Claude)</option>
                                            <option value="openai">OpenAI (GPT)</option>
                                            <option value="gemini">Google Gemini</option>
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
                                                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 ⚡ (rápido, econômico)</option>
                                                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (balanceado)</option>
                                                    <option value="claude-sonnet-4">Claude Sonnet 4 (latest)</option>
                                                    <option value="claude-opus-4">Claude Opus 4 (máxima qualidade)</option>
                                                </>
                                            ) : emp.ia_provider === 'gemini' ? (
                                                <>
                                                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview 🆕 (mais capaz)</option>
                                                    <option value="gemini-2.5-flash">Gemini 2.5 Flash ⭐ (recomendado)</option>
                                                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (alta qualidade)</option>
                                                    <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (econômico, preview)</option>
                                                    <option value="gemini-2.0-flash">Gemini 2.0 Flash (estável, barato)</option>
                                                </>
                                            ) : (
                                                <>
                                                    <option value="gpt-4o-mini">GPT-4o Mini ⚡ (rápido, econômico)</option>
                                                    <option value="gpt-4.1-mini">GPT-4.1 Mini (mais novo, econômico)</option>
                                                    <option value="gpt-4o">GPT-4o (balanceado)</option>
                                                    <option value="gpt-4.1">GPT-4.1 (mais novo, capaz)</option>
                                                    <option value="o4-mini">o4-mini (raciocínio avançado)</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className={Z.lbl}>Chaves de API por Provider</label>
                                    <div className="flex items-center gap-2">
                                        <span className="w-24 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>Anthropic</span>
                                        <input
                                            type="password"
                                            value={emp.ia_api_key_anthropic}
                                            onChange={e => setEmp({ ...emp, ia_api_key_anthropic: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="sk-ant-..."
                                            className={Z.inp}
                                            style={{ fontFamily: 'monospace', fontSize: 12 }}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-24 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>Gemini</span>
                                        <input
                                            type="password"
                                            value={emp.ia_api_key_gemini}
                                            onChange={e => setEmp({ ...emp, ia_api_key_gemini: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="AIza..."
                                            className={Z.inp}
                                            style={{ fontFamily: 'monospace', fontSize: 12 }}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-24 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>OpenAI</span>
                                        <input
                                            type="password"
                                            value={emp.ia_api_key_openai}
                                            onChange={e => setEmp({ ...emp, ia_api_key_openai: e.target.value })}
                                            disabled={!isGerente}
                                            placeholder="sk-..."
                                            className={Z.inp}
                                            style={{ fontFamily: 'monospace', fontSize: 12 }}
                                        />
                                    </div>
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

                                <div>
                                    <label className={Z.lbl}>Números Bloqueados (não recebem IA)</label>
                                    <textarea
                                        value={emp.ia_blocked_phones}
                                        onChange={e => setEmp({ ...emp, ia_blocked_phones: e.target.value })}
                                        disabled={!isGerente}
                                        rows={3}
                                        placeholder="5598991234567, 5598987654321"
                                        style={{
                                            width: '100%', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                            resize: 'vertical', background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                            border: '1px solid var(--border)', fontFamily: 'monospace',
                                        }}
                                    />
                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Números separados por vírgula no formato internacional (55 + DDD + número). Funcionários, fornecedores e família que não devem receber resposta da IA. Grupos já são ignorados automaticamente.
                                    </div>
                                </div>

                                {/* Testar Conexão */}
                                <div className="flex gap-2 flex-wrap items-center">
                                    <button onClick={testIA} disabled={iaTesting} className={Z.btn2}>
                                        {iaTesting ? <><RefreshCw size={12} className="animate-spin" style={{ display: 'inline', marginRight: 4 }} /> Testando...</> : <><FlaskConical size={12} style={{ display: 'inline', marginRight: 4 }} /> Testar Conexão IA</>}
                                    </button>
                                    {iaTestResult && (
                                        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: iaTestResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                                            {iaTestResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {iaTestResult.msg}
                                        </span>
                                    )}
                                </div>

                                {/* Sugestões da IA — toggle do botão "Sugerir" em Mensagens */}
                                <div
                                    className="flex items-center justify-between gap-3 p-3 rounded-lg"
                                    style={{
                                        background: 'var(--bg-muted)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    <div style={{ flex: 1 }}>
                                        <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            Sugestões da IA na tela de Mensagens
                                        </div>
                                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                            Habilita o botão <strong>Sugerir</strong> ao lado do campo de mensagem (a IA analisa o histórico e propõe uma resposta pro atendente humano).
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setEmp({ ...emp, ia_sugestoes_ativa: emp.ia_sugestoes_ativa ? 0 : 1 })}
                                        disabled={!isGerente}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer"
                                        style={{
                                            background: emp.ia_sugestoes_ativa ? 'var(--success-bg)' : 'var(--bg-card)',
                                            color: emp.ia_sugestoes_ativa ? 'var(--success)' : 'var(--text-muted)',
                                            border: `1px solid ${emp.ia_sugestoes_ativa ? 'var(--success-border)' : 'var(--border)'}`,
                                        }}
                                    >
                                        <div style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: emp.ia_sugestoes_ativa ? 'var(--success)' : 'var(--text-muted)',
                                            transition: 'background 0.2s',
                                        }} />
                                        {emp.ia_sugestoes_ativa ? 'Ativado' : 'Desativado'}
                                    </button>
                                </div>
                            </div>

                            {/* ═══ Prompt de Treinamento da Sofia ═══ */}
                            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>Prompt de Treinamento da Sofia</h3>
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Documento completo que define identidade, regras, fluxo e guardrails da IA. Edite com cuidado — afeta todas as conversas novas.
                                        </div>
                                    </div>
                                    {iaPrompt && (
                                        <span className="text-[10px] px-2 py-1 rounded font-semibold" style={{
                                            background: iaPrompt.usando === 'custom' ? 'var(--warning-bg)' : 'var(--success-bg)',
                                            color: iaPrompt.usando === 'custom' ? 'var(--warning)' : 'var(--success)',
                                            border: `1px solid ${iaPrompt.usando === 'custom' ? 'var(--warning-border)' : 'var(--success-border)'}`,
                                        }}>
                                            {iaPrompt.usando === 'custom' ? 'CUSTOMIZADO' : 'PADRÃO v2'}
                                        </span>
                                    )}
                                </div>

                                {iaPromptLoading && !iaPrompt ? (
                                    <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>Carregando...</div>
                                ) : iaPrompt ? (
                                    <>
                                        <div className="flex gap-2 mb-3">
                                            <button
                                                onClick={() => { setIaPromptMode('edit'); setIaPromptDraft(iaPrompt.custom || iaPrompt.default); }}
                                                className={Z.btn2}
                                                style={{ fontSize: 11, background: iaPromptMode === 'edit' ? 'var(--primary)' : undefined, color: iaPromptMode === 'edit' ? 'white' : undefined }}
                                                disabled={!isGerente}
                                            >
                                                <Pencil size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                {iaPrompt.usando === 'custom' ? 'Editar customização' : 'Customizar'}
                                            </button>
                                            <button onClick={() => setIaPromptMode('default')} className={Z.btn2} style={{ fontSize: 11, background: iaPromptMode === 'default' ? 'var(--primary)' : undefined, color: iaPromptMode === 'default' ? 'white' : undefined }}>
                                                <Bot size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                Ver padrão Sofia v2
                                            </button>
                                            {iaPrompt.usando === 'custom' && isGerente && (
                                                <button onClick={resetIaPrompt} className={Z.btn2} style={{ fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger-border)' }} disabled={iaPromptSaving}>
                                                    <Trash2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                    Restaurar padrão
                                                </button>
                                            )}
                                        </div>

                                        {iaPromptMode === 'default' && (
                                            <div>
                                                <textarea
                                                    value={iaPrompt.default}
                                                    readOnly
                                                    rows={20}
                                                    style={{
                                                        width: '100%', fontSize: 11, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                                        background: 'var(--bg-muted)', color: 'var(--text-muted)',
                                                        border: '1px solid var(--border)', fontFamily: 'monospace', resize: 'vertical',
                                                    }}
                                                />
                                                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                    Apenas leitura — este é o prompt padrão Sofia v2 (hardcoded no sistema).
                                                </div>
                                            </div>
                                        )}

                                        {iaPromptMode === 'edit' && (
                                            <div>
                                                <textarea
                                                    value={iaPromptDraft}
                                                    onChange={e => setIaPromptDraft(e.target.value)}
                                                    rows={22}
                                                    disabled={!isGerente}
                                                    style={{
                                                        width: '100%', fontSize: 11, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                                        background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                                        border: '1px solid var(--border)', fontFamily: 'monospace', resize: 'vertical',
                                                    }}
                                                />
                                                <div className="flex items-center justify-between mt-2">
                                                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                        {iaPromptDraft.length.toLocaleString('pt-BR')} caracteres
                                                        {iaPromptSaved && <span className="ml-3" style={{ color: 'var(--success)' }}>Salvo</span>}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => { setIaPromptMode('view'); setIaPromptDraft(iaPrompt.custom || iaPrompt.default); }} className={Z.btn2} style={{ fontSize: 11 }}>Cancelar</button>
                                                        <button onClick={saveIaPrompt} className={Z.btn} style={{ fontSize: 11 }} disabled={iaPromptSaving || !isGerente}>
                                                            {iaPromptSaving ? 'Salvando...' : 'Salvar prompt customizado'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] mt-1" style={{ color: 'var(--warning-hover)' }}>
                                                    Atenção: se salvar customizado, este texto <strong>substitui</strong> o padrão Sofia v2 em todas as novas conversas. Use "Restaurar padrão" para voltar.
                                                </div>
                                            </div>
                                        )}

                                        {iaPromptMode === 'view' && (
                                            <div className="text-[11px] rounded-lg p-3" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                                {iaPrompt.usando === 'custom' ? (
                                                    <>Usando <strong style={{ color: 'var(--warning)' }}>prompt customizado</strong> ({iaPrompt.custom.length.toLocaleString('pt-BR')} caracteres). Clique em "Editar customização" para ajustar.</>
                                                ) : (
                                                    <>Usando <strong style={{ color: 'var(--success)' }}>prompt padrão Sofia v2</strong> ({iaPrompt.default.length.toLocaleString('pt-BR')} caracteres). Clique em "Customizar" para editar.</>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : null}
                            </div>

                            {/* ═══ Prospecção ativa ═══ */}
                            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                                            🎯 Prospecção ativa (pós-captura)
                                        </h3>
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Depois que o lead preenche o formulário da landing, a IA puxa conversa no WhatsApp com um script próprio (diferente da Sofia reativa). Se o cliente responder, a prospecção para e a Sofia assume.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setProspeccaoDraft(d => ({ ...d, ativa: !d.ativa }))}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                        disabled={!isGerente}
                                        style={{
                                            background: prospeccaoDraft.ativa ? 'var(--success-bg)' : 'var(--bg-muted)',
                                            color: prospeccaoDraft.ativa ? 'var(--success)' : 'var(--text-muted)',
                                            border: `1px solid ${prospeccaoDraft.ativa ? 'var(--success-border)' : 'var(--border)'}`,
                                        }}
                                    >
                                        {prospeccaoDraft.ativa ? 'Ativa' : 'Desligada'}
                                    </button>
                                </div>

                                {prospeccaoLoading && !prospeccao ? (
                                    <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>Carregando...</div>
                                ) : prospeccao ? (
                                    <>
                                        {prospeccao.estatisticas && (
                                            <div className="grid grid-cols-4 gap-2 mb-3">
                                                {[
                                                    ['Agendadas', prospeccao.estatisticas.pending ?? 0, 'var(--primary)'],
                                                    ['Enviadas', prospeccao.estatisticas.sent ?? 0, 'var(--success)'],
                                                    ['Canceladas', prospeccao.estatisticas.cancelled ?? 0, 'var(--warning)'],
                                                    ['Com erro', prospeccao.estatisticas.error ?? 0, 'var(--danger)'],
                                                ].map(([label, val, cor]) => (
                                                    <div key={label} className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
                                                        <div className="text-lg font-bold" style={{ color: cor }}>{val}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div>
                                                <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
                                                    Delay da 1ª mensagem (minutos)
                                                </label>
                                                <input
                                                    type="number" min={0} max={60}
                                                    value={prospeccaoDraft.delay_min}
                                                    onChange={e => setProspeccaoDraft(d => ({ ...d, delay_min: e.target.value }))}
                                                    disabled={!isGerente}
                                                    className="w-full px-3 py-1.5 rounded-lg text-xs"
                                                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                                />
                                                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Tempo entre captura e envio (0–60). Fora do horário comercial, reagenda pra manhã seguinte.</div>
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
                                                    Follow-up se não responder (horas)
                                                </label>
                                                <input
                                                    type="number" min={1} max={168}
                                                    value={prospeccaoDraft.followup_horas}
                                                    onChange={e => setProspeccaoDraft(d => ({ ...d, followup_horas: e.target.value }))}
                                                    disabled={!isGerente}
                                                    className="w-full px-3 py-1.5 rounded-lg text-xs"
                                                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                                />
                                                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>1 único follow-up depois da inicial (1–168h). Se cliente responder, nada é enviado.</div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mb-3">
                                            <button
                                                onClick={() => { setProspeccaoMode('edit'); }}
                                                className={Z.btn2}
                                                style={{ fontSize: 11, background: prospeccaoMode === 'edit' ? 'var(--primary)' : undefined, color: prospeccaoMode === 'edit' ? 'white' : undefined }}
                                                disabled={!isGerente}
                                            >
                                                <Pencil size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                Editar prompt
                                            </button>
                                            <button onClick={() => setProspeccaoMode('default')} className={Z.btn2} style={{ fontSize: 11, background: prospeccaoMode === 'default' ? 'var(--primary)' : undefined, color: prospeccaoMode === 'default' ? 'white' : undefined }}>
                                                <Bot size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                Ver padrão prospecção
                                            </button>
                                            {isGerente && (
                                                <button onClick={resetProspeccaoPrompt} className={Z.btn2} style={{ fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger-border)' }} disabled={prospeccaoSaving}>
                                                    <Trash2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                    Usar padrão
                                                </button>
                                            )}
                                        </div>

                                        {prospeccaoMode === 'default' && (
                                            <div>
                                                <textarea
                                                    value={prospeccao.prompt_default || ''}
                                                    readOnly
                                                    rows={18}
                                                    style={{
                                                        width: '100%', fontSize: 11, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                                        background: 'var(--bg-muted)', color: 'var(--text-muted)',
                                                        border: '1px solid var(--border)', fontFamily: 'monospace', resize: 'vertical',
                                                    }}
                                                />
                                                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                    Apenas leitura — prompt padrão de prospecção ativa (hardcoded no sistema).
                                                </div>
                                            </div>
                                        )}

                                        {prospeccaoMode === 'edit' && (
                                            <div>
                                                <textarea
                                                    value={prospeccaoDraft.prompt}
                                                    onChange={e => setProspeccaoDraft(d => ({ ...d, prompt: e.target.value }))}
                                                    placeholder="Deixe vazio pra usar o padrão do sistema..."
                                                    rows={18}
                                                    disabled={!isGerente}
                                                    style={{
                                                        width: '100%', fontSize: 11, lineHeight: 1.6, padding: 12, borderRadius: 8,
                                                        background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                                        border: '1px solid var(--border)', fontFamily: 'monospace', resize: 'vertical',
                                                    }}
                                                />
                                                <div className="text-[10px] mt-1" style={{ color: 'var(--warning-hover)' }}>
                                                    Este prompt é <strong>exclusivo da prospecção ativa</strong> — não afeta a Sofia reativa. Deixe em branco pra cair no padrão do sistema.
                                                </div>
                                            </div>
                                        )}

                                        {prospeccaoMode === 'view' && (
                                            <div className="text-[11px] rounded-lg p-3" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                                {prospeccaoDraft.prompt && prospeccaoDraft.prompt.trim()
                                                    ? <>Usando <strong style={{ color: 'var(--warning)' }}>prompt customizado</strong> ({prospeccaoDraft.prompt.length.toLocaleString('pt-BR')} caracteres).</>
                                                    : <>Usando <strong style={{ color: 'var(--success)' }}>prompt padrão</strong> de prospecção ativa.</>
                                                }
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mt-3">
                                            <button onClick={saveProspeccao} className={Z.btn} style={{ fontSize: 11 }} disabled={prospeccaoSaving || !isGerente}>
                                                {prospeccaoSaving ? 'Salvando...' : 'Salvar prospecção'}
                                            </button>
                                            {prospeccaoSaved && <span className="text-[11px]" style={{ color: 'var(--success)' }}>Salvo</span>}
                                        </div>
                                    </>
                                ) : null}
                            </div>

                            {/* ═══ Escalação pós-handoff ═══ */}
                            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                                            ⏱ Escalação pós-handoff
                                        </h3>
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Sofia cuida do lead se o humano demorar: alerta → holding (template) → retomada (1 pergunta) → abandono. Tempos variam por temperatura.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEscCfg({ ...escCfg, ativa: !escCfg.ativa })}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                        style={{
                                            background: escCfg.ativa ? 'var(--success-bg)' : 'var(--bg-muted)',
                                            color: escCfg.ativa ? 'var(--success)' : 'var(--text-muted)',
                                            border: `1px solid ${escCfg.ativa ? 'var(--success-border)' : 'var(--border)'}`,
                                        }}
                                    >
                                        {escCfg.ativa ? 'Ativa' : 'Desligada'}
                                    </button>
                                </div>

                                {escCfg.ativa && (
                                    <div className="rounded-lg p-3 text-[11px]" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                        <div className="grid grid-cols-5 gap-2 font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                                            <div>Temperatura</div>
                                            <div>N1 alerta</div>
                                            <div>N2 holding</div>
                                            <div>N3 retomada</div>
                                            <div>N4 abandono</div>
                                        </div>
                                        {[
                                            ['muito_quente', 'Muito quente (≥80)', '30min', '4h', '12h', '24h'],
                                            ['quente', 'Quente (60–79)', '1h', '8h', '18h', '30h'],
                                            ['morno', 'Morno (30–59)', '2h', '12h', '24h', '36h'],
                                            ['frio', 'Frio (<30)', '4h', '24h', '48h', '72h'],
                                        ].map(([key, label, n1, n2, n3, n4]) => (
                                            <div key={key} className="grid grid-cols-5 gap-2 py-1">
                                                <div>{label}</div>
                                                <div>{n1}</div>
                                                <div>{n2}</div>
                                                <div>{n3}</div>
                                                <div>{n4}</div>
                                            </div>
                                        ))}
                                        <div className="mt-3 pt-3 text-[10px]" style={{ borderTop: '1px solid var(--border)' }}>
                                            <strong>N1</strong> = badge + WS (zero custo). <strong>N2</strong> = template fixo (zero LLM). <strong>N3</strong> = 1 mensagem pedindo prioridade (zero LLM). <strong>N4</strong> = marca abandonada pra relatório. Só envia entre 9h-18h Seg-Sáb.
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-2 mt-3">
                                    <button onClick={salvarEscCfg} className={Z.btn2} style={{ fontSize: 11 }}>
                                        Salvar configuração
                                    </button>
                                    {escSaved && <span className="text-[11px]" style={{ color: 'var(--success)' }}>Salvo</span>}
                                </div>
                            </div>

                            {/* ═══ Extensão Chrome (tokens pessoais) ═══ */}
                            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                                            Extensão Chrome — WhatsApp Web Sidebar
                                        </h3>
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Cada pessoa faz <strong>login direto na extensão</strong> com o email e senha do ERP. O token é vinculado ao usuário e todas as ações ficam auditadas.
                                        </div>
                                    </div>
                                    <button onClick={baixarExtensao} className={Z.btn2} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                                        Baixar extensão (.zip)
                                    </button>
                                </div>

                                <div className="rounded-lg p-3 mb-3 text-[11px]" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Como instalar:</div>
                                    <ol style={{ paddingLeft: 16, lineHeight: 1.6 }}>
                                        <li>Clique em <strong>Baixar extensão</strong> acima e descompacte o .zip em uma pasta.</li>
                                        <li>Abra <code>chrome://extensions/</code> e ative <strong>Modo do desenvolvedor</strong> (canto superior direito).</li>
                                        <li>Clique em <strong>"Carregar sem compactação"</strong> e selecione a pasta descompactada.</li>
                                        <li>Clique no ícone da extensão no Chrome e faça <strong>login com seu email e senha do ERP</strong>.</li>
                                        <li>Abra <code>web.whatsapp.com</code> — o botão flutuante <strong>ORN</strong> aparece no canto inferior direito.</li>
                                        <li>Atalhos: <code>Ctrl+Shift+O</code> abre/fecha sidebar · digite <code>/atalho</code> + Tab no chat para inserir template.</li>
                                    </ol>
                                </div>

                                <div className="rounded-lg p-3 mb-3 text-[11px]" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-hover)' }}>
                                    <strong>Novidade:</strong> não é mais necessário gerar tokens manualmente — o login da extensão é feito com email + senha direto no popup. A tabela abaixo lista tokens ativos (sessões) para você revogar se perder acesso a algum dispositivo.
                                </div>

                                {extTokenRevelado && (
                                    <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)' }}>
                                        <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--warning-hover)' }}>
                                            Atenção: copie agora — este token não será mostrado de novo:
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-[10px] p-2 rounded break-all" style={{ background: 'var(--bg)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                                                {extTokenRevelado.token}
                                            </code>
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(extTokenRevelado.token); notify?.('Token copiado'); }}
                                                className={Z.btn2} style={{ fontSize: 11 }}
                                            >Copiar</button>
                                            <button onClick={() => setExtTokenRevelado(null)} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Fechar</button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-2 mb-3">
                                    <input
                                        type="text"
                                        placeholder="Nome (ex: Chrome Victor)"
                                        value={extNovoTokenNome}
                                        onChange={e => setExtNovoTokenNome(e.target.value)}
                                        className="flex-1 px-3 py-1.5 rounded-lg text-xs"
                                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                    />
                                    <button onClick={criarExtToken} className={Z.btn2} style={{ fontSize: 11 }}>
                                        + Gerar token
                                    </button>
                                </div>

                                <div className="rounded-lg" style={{ border: '1px solid var(--border)', overflow: 'hidden' }}>
                                    {extTokens.length === 0 ? (
                                        <div className="p-3 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
                                            Nenhum token gerado ainda.
                                        </div>
                                    ) : (
                                        <table className="w-full text-[11px]">
                                            <thead>
                                                <tr style={{ background: 'var(--bg-muted)' }}>
                                                    <th className="text-left p-2">Nome</th>
                                                    <th className="text-left p-2">Token</th>
                                                    <th className="text-left p-2">Último uso</th>
                                                    <th className="text-left p-2">Status</th>
                                                    <th className="p-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {extTokens.map(t => (
                                                    <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                                                        <td className="p-2">{t.nome}</td>
                                                        <td className="p-2"><code style={{ fontSize: 10 }}>{t.token_preview}</code></td>
                                                        <td className="p-2" style={{ color: 'var(--text-muted)' }}>
                                                            {t.ultimo_uso_em ? new Date(t.ultimo_uso_em).toLocaleString('pt-BR') : '—'}
                                                        </td>
                                                        <td className="p-2">
                                                            {t.revogado
                                                                ? <span style={{ color: 'var(--danger)' }}>Revogado</span>
                                                                : <span style={{ color: 'var(--success)' }}>Ativo</span>}
                                                        </td>
                                                        <td className="p-2 text-right">
                                                            {!t.revogado && (
                                                                <button onClick={() => revogarExtToken(t.id)} style={{ color: 'var(--danger)', fontSize: 11 }}>
                                                                    Revogar
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Logs de acesso */}
                                <div className="mt-3 flex items-center justify-between">
                                    <button
                                        onClick={() => { const next = !extLogsOpen; setExtLogsOpen(next); if (next) loadExtLogs(); }}
                                        className="text-[11px]"
                                        style={{ color: 'var(--primary)' }}
                                    >
                                        {extLogsOpen ? '▼' : '▶'} Logs de acesso da extensão
                                    </button>
                                    {extLogsOpen && (
                                        <button onClick={loadExtLogs} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>↻ Atualizar</button>
                                    )}
                                </div>
                                {extLogsOpen && (
                                    <div className="mt-2 rounded-lg" style={{ border: '1px solid var(--border)', maxHeight: 260, overflowY: 'auto' }}>
                                        {extLogs.length === 0 ? (
                                            <div className="p-3 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>Sem registros ainda.</div>
                                        ) : (
                                            <table className="w-full text-[10px]">
                                                <thead style={{ background: 'var(--bg-muted)', position: 'sticky', top: 0 }}>
                                                    <tr>
                                                        <th className="text-left p-2">Quando</th>
                                                        <th className="text-left p-2">Usuário</th>
                                                        <th className="text-left p-2">Tipo</th>
                                                        <th className="text-left p-2">Endpoint</th>
                                                        <th className="text-left p-2">IP</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {extLogs.map(l => (
                                                        <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                                                            <td className="p-2" style={{ whiteSpace: 'nowrap' }}>{new Date(l.criado_em).toLocaleString('pt-BR')}</td>
                                                            <td className="p-2">{l.user_nome || l.user_email || '—'}</td>
                                                            <td className="p-2">
                                                                <span style={{
                                                                    padding: '2px 6px', borderRadius: 4, fontSize: 9,
                                                                    background: l.tipo === 'login' ? 'var(--success-bg)' : l.tipo === 'download' ? 'var(--info-bg)' : 'var(--bg-muted)',
                                                                    color: l.tipo === 'login' ? 'var(--success)' : l.tipo === 'download' ? 'var(--info)' : 'var(--text-muted)',
                                                                }}>{l.tipo}</span>
                                                            </td>
                                                            <td className="p-2" style={{ fontFamily: 'monospace' }}>{l.method} {l.endpoint}</td>
                                                            <td className="p-2" style={{ color: 'var(--text-muted)' }}>{l.ip || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ═══ Templates de mensagem ═══ */}
                            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                                            Templates de mensagem
                                        </h3>
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Respostas rápidas para a equipe usar na extensão Chrome (atalho: digite <code>/atalho</code> no campo de busca).
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setTplEdit({ titulo: '', conteudo: '', atalho: '', categoria: 'geral', ativo: true })}
                                        className={Z.btn2} style={{ fontSize: 11 }}
                                    >+ Novo template</button>
                                </div>

                                {tplEdit && (
                                    <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--bg-muted)', border: '1px solid var(--primary)' }}>
                                        <div className="grid grid-cols-3 gap-2 mb-2">
                                            <input
                                                type="text" placeholder="Título" value={tplEdit.titulo}
                                                onChange={e => setTplEdit({ ...tplEdit, titulo: e.target.value })}
                                                className="px-2 py-1.5 rounded text-[11px] col-span-2"
                                                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                            />
                                            <input
                                                type="text" placeholder="Categoria" value={tplEdit.categoria}
                                                onChange={e => setTplEdit({ ...tplEdit, categoria: e.target.value })}
                                                className="px-2 py-1.5 rounded text-[11px]"
                                                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <input
                                            type="text" placeholder="Atalho (ex: saudacao)" value={tplEdit.atalho}
                                            onChange={e => setTplEdit({ ...tplEdit, atalho: e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase() })}
                                            className="w-full px-2 py-1.5 rounded text-[11px] mb-2"
                                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                                        />
                                        <textarea
                                            placeholder="Conteúdo da mensagem… Pode usar {nome} para substituir pelo nome do cliente."
                                            value={tplEdit.conteudo}
                                            onChange={e => setTplEdit({ ...tplEdit, conteudo: e.target.value })}
                                            rows={5}
                                            className="w-full px-2 py-1.5 rounded text-[11px] mb-2"
                                            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical' }}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button onClick={salvarTemplate} className={Z.btn2} style={{ fontSize: 11 }}>Salvar</button>
                                            <button onClick={() => setTplEdit(null)} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
                                            <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                <input type="checkbox" checked={!!tplEdit.ativo} onChange={e => setTplEdit({ ...tplEdit, ativo: e.target.checked })} />
                                                Ativo
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-lg" style={{ border: '1px solid var(--border)' }}>
                                    {templates.length === 0 ? (
                                        <div className="p-3 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>Nenhum template ainda.</div>
                                    ) : (
                                        templates.map(t => (
                                            <div key={t.id} className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <strong className="text-[12px]" style={{ color: 'var(--text-primary)' }}>{t.titulo}</strong>
                                                            {t.atalho && <code style={{ fontSize: 10, color: 'var(--primary)', background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: 3 }}>/{t.atalho}</code>}
                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.categoria}</span>
                                                            {t.usos > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {t.usos} usos</span>}
                                                            {!t.ativo && <span style={{ fontSize: 10, color: 'var(--danger)' }}>inativo</span>}
                                                        </div>
                                                        <div className="text-[11px]" style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                                                            {t.conteudo}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 ml-2">
                                                        <button onClick={() => setTplEdit({ ...t, ativo: !!t.ativo })} className="text-[11px]" style={{ color: 'var(--primary)' }}>Editar</button>
                                                        <button onClick={() => excluirTemplate(t.id)} className="text-[11px]" style={{ color: 'var(--danger)' }}>Excluir</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* ═══ Sandbox de Simulação ═══ */}
                            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                                            Sandbox — Testar Sofia sem afetar WhatsApp real
                                        </h3>
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Converse com a Sofia como se fosse um cliente. Nada é enviado pelo WhatsApp e nada é salvo nas conversas reais. Perfeito para validar antes de ativar.
                                        </div>
                                    </div>
                                    <button onClick={() => setSimOpen(!simOpen)} className={Z.btn2} style={{ fontSize: 11 }}>
                                        {simOpen ? 'Fechar sandbox' : 'Abrir sandbox'}
                                    </button>
                                </div>

                                {simOpen && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                        {/* Chat (2 cols) */}
                                        <div className="lg:col-span-2 rounded-lg overflow-hidden flex flex-col" style={{ border: '1px solid var(--border)', background: 'var(--bg-muted)', height: 500 }}>
                                            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                                                <div className="flex items-center gap-2">
                                                    <Bot size={14} style={{ color: 'var(--primary)' }} />
                                                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Sofia (simulação)</span>
                                                    {emp.ia_provider && (
                                                        <span style={{
                                                            fontSize: 10,
                                                            padding: '1px 6px',
                                                            borderRadius: 10,
                                                            background: emp.ia_provider === 'gemini' ? '#e8f5e9' : emp.ia_provider === 'openai' ? '#e3f2fd' : '#f3e5f5',
                                                            color: emp.ia_provider === 'gemini' ? '#2e7d32' : emp.ia_provider === 'openai' ? '#1565c0' : '#6a1b9a',
                                                            border: `1px solid ${emp.ia_provider === 'gemini' ? '#a5d6a7' : emp.ia_provider === 'openai' ? '#90caf9' : '#ce93d8'}`,
                                                            fontWeight: 600,
                                                        }}>
                                                            {emp.ia_provider === 'gemini' ? '✦ ' : emp.ia_provider === 'openai' ? '⊕ ' : '◆ '}
                                                            {emp.ia_model || emp.ia_provider}
                                                        </span>
                                                    )}
                                                </div>
                                                <button onClick={simResetar} className="text-[10px] px-2 py-1 rounded hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                                                    <Trash2 size={10} style={{ display: 'inline', marginRight: 3 }} /> Limpar
                                                </button>
                                            </div>

                                            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" style={{ scrollbarWidth: 'thin' }}>
                                                {simHistory.length === 0 && (
                                                    <div className="text-center mt-16 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                        Digite uma mensagem como se fosse um cliente.<br />
                                                        Exemplo: "Oi, vi o anúncio de vocês, quero saber sobre cozinha"
                                                    </div>
                                                )}
                                                {simHistory.map((m, i) => (
                                                    <div key={i} className={`max-w-[80%] rounded-lg px-3 py-2 text-[12px]`} style={{
                                                        background: m.role === 'user' ? '#dcf8c6' : 'var(--bg)',
                                                        color: '#222',
                                                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                                                        whiteSpace: 'pre-wrap',
                                                        lineHeight: 1.5,
                                                        border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                                                    }}>
                                                        {m.content}
                                                    </div>
                                                ))}
                                                {simSending && (
                                                    <div className="text-[11px] italic" style={{ color: 'var(--text-muted)', alignSelf: 'flex-start' }}>
                                                        Sofia está digitando...
                                                    </div>
                                                )}
                                                {simBloqueado && (
                                                    <div className="text-[10px] italic mt-2" style={{ color: 'var(--muted)', alignSelf: 'center', textAlign: 'center' }}>
                                                        · · · IA silenciada (sem gasto de tokens) · · ·
                                                    </div>
                                                )}
                                            </div>

                                            {simBloqueado && (
                                                <div className="px-3 py-2 text-[11px] flex items-center gap-2" style={{ background: 'var(--danger-bg)', borderTop: '1px solid var(--danger-border)', color: 'var(--danger)' }}>
                                                    <BellOff size={12} />
                                                    <span className="flex-1"><strong>IA silenciada.</strong> Motivo: <code style={{ fontFamily: 'monospace' }}>{simBloqueado.motivo}</code> — próximas mensagens do cliente NÃO chamam a API.</span>
                                                    <button onClick={simResetar} className="underline" style={{ color: 'var(--danger)' }}>resetar</button>
                                                </div>
                                            )}

                                            <div className="p-2 flex gap-2 items-center" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                                                <input
                                                    value={simInput}
                                                    onChange={e => setSimInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); simEnviar(); } }}
                                                    placeholder={simBloqueado ? 'Cliente continua mandando... (API não é chamada)' : 'Digite como cliente e pressione Enter...'}
                                                    disabled={simSending}
                                                    className={Z.inp}
                                                    style={{ fontSize: 12, flex: 1, opacity: simBloqueado ? 0.7 : 1 }}
                                                />
                                                <button onClick={simEnviar} disabled={simSending || !simInput.trim()} className={Z.btn} style={{ fontSize: 11 }}>
                                                    Enviar
                                                </button>
                                            </div>
                                        </div>

                                        {/* Painel de análise */}
                                        <div className="flex flex-col gap-3">
                                            {/* Score */}
                                            <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                                                <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Score do lead</div>
                                                {simScore ? (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-2xl font-bold" style={{
                                                                color: simScore.score >= 80 ? '#8b5cf6'
                                                                    : simScore.score >= 60 ? 'var(--success)'
                                                                        : simScore.score >= 30 ? 'var(--warning)' : 'var(--muted)',
                                                            }}>{simScore.score}</div>
                                                            <div className="text-[10px] font-semibold uppercase px-2 py-1 rounded" style={{
                                                                background: simScore.score >= 80 ? '#8b5cf620'
                                                                    : simScore.score >= 60 ? 'var(--success-bg)'
                                                                        : simScore.score >= 30 ? 'var(--warning-bg)' : 'var(--muted-bg)',
                                                                color: simScore.score >= 80 ? '#8b5cf6'
                                                                    : simScore.score >= 60 ? 'var(--success)'
                                                                        : simScore.score >= 30 ? 'var(--warning)' : 'var(--muted)',
                                                            }}>{(simScore.classificacao || 'frio').replace('_', ' ')}</div>
                                                        </div>
                                                        {simScore.detalhes && simScore.detalhes.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {simScore.detalhes.map((d, i) => (
                                                                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{d}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Sem dados ainda</div>
                                                )}
                                            </div>

                                            {/* Tags */}
                                            <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                                                <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Tags</div>
                                                {simScore && simScore.tags?.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {simScore.tags.map((t, i) => (
                                                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--primary)', color: 'white', opacity: 0.85 }}>{t}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>—</div>
                                                )}
                                            </div>

                                            {/* Intenção detectada */}
                                            {simScore && simScore.intencao && (
                                                <div className="rounded-lg p-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                                                    <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Intenção de compra</div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-lg font-bold" style={{
                                                            color: simScore.intencao.score >= 20 ? 'var(--success)'
                                                                : simScore.intencao.score >= 10 ? 'var(--warning)' : 'var(--muted)',
                                                        }}>+{simScore.intencao.score}</div>
                                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>/ 30</div>
                                                    </div>
                                                    {simScore.intencao.sinais && simScore.intencao.sinais.length > 0 && (
                                                        <div className="mt-2 flex flex-col gap-1">
                                                            {simScore.intencao.sinais.map((s, i) => (
                                                                <span key={i} className="text-[10px]" style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Violações de guardrails */}
                                            {simScore && simScore.violations?.length > 0 && (
                                                <div className="rounded-lg p-3" style={{ border: '1px solid var(--danger-border)', background: 'var(--danger-bg)' }}>
                                                    <div className="text-[10px] uppercase tracking-wide mb-2 font-semibold flex items-center gap-1" style={{ color: 'var(--danger)' }}><AlertTriangle size={11} /> Guardrails violados</div>
                                                    <div className="flex flex-col gap-1">
                                                        {simScore.violations.map((v, i) => (
                                                            <div key={i} className="text-[11px]" style={{ color: 'var(--danger)', fontFamily: 'monospace' }}>{v}</div>
                                                        ))}
                                                    </div>
                                                    {simScore.sanitized && (
                                                        <div className="text-[10px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>Resposta foi sanitizada automaticamente antes de exibir.</div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Dossiê */}
                                            <div className="rounded-lg p-3 flex-1" style={{ border: '1px solid var(--border)', background: 'var(--bg-muted)', maxHeight: 240, overflowY: 'auto' }}>
                                                <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Dossiê acumulado</div>
                                                {Object.keys(simDossie).length > 0 ? (
                                                    <pre className="text-[10px] whitespace-pre-wrap break-all" style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                                                        {JSON.stringify(simDossie, null, 2)}
                                                    </pre>
                                                ) : (
                                                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Nenhum dado coletado ainda</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ═══ Consumo / Gasto da IA ═══ */}
                            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>Consumo da IA</h3>
                                        {emp.ia_provider && (
                                            <span style={{
                                                fontSize: 10,
                                                padding: '1px 7px',
                                                borderRadius: 10,
                                                background: emp.ia_provider === 'gemini' ? '#e8f5e9' : emp.ia_provider === 'openai' ? '#e3f2fd' : '#f3e5f5',
                                                color: emp.ia_provider === 'gemini' ? '#2e7d32' : emp.ia_provider === 'openai' ? '#1565c0' : '#6a1b9a',
                                                border: `1px solid ${emp.ia_provider === 'gemini' ? '#a5d6a7' : emp.ia_provider === 'openai' ? '#90caf9' : '#ce93d8'}`,
                                                fontWeight: 600,
                                            }}>
                                                IA ativa: {emp.ia_model || emp.ia_provider}
                                            </span>
                                        )}
                                    </div>
                                    <button onClick={loadIaUso} disabled={iaUsoLoading} className={Z.btn2} style={{ fontSize: 11 }}>
                                        <RefreshCw size={11} className={iaUsoLoading ? 'animate-spin' : ''} style={{ display: 'inline', marginRight: 4 }} />
                                        Atualizar
                                    </button>
                                </div>

                                {iaUso ? (
                                    <>
                                        <div className="grid grid-cols-3 gap-3 mb-4">
                                            {[
                                                { lb: 'Hoje', d: iaUso.hoje, cor: 'var(--success)' },
                                                { lb: 'Este mês', d: iaUso.mes, cor: 'var(--info)' },
                                                { lb: 'Total geral', d: iaUso.total, cor: 'var(--primary)' },
                                            ].map(({ lb, d, cor }) => (
                                                <div key={lb} className="p-3 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                                    <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{lb}</div>
                                                    <div className="text-lg font-bold" style={{ color: cor }}>
                                                        US$ {(d?.custo_usd || 0).toFixed(4)}
                                                    </div>
                                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                        ≈ R$ {((d?.custo_usd || 0) * 5.5).toFixed(2)}
                                                    </div>
                                                    <div className="text-[10px] mt-1 flex gap-3" style={{ color: 'var(--text-secondary)' }}>
                                                        <span>{d?.chamadas || 0} chamadas</span>
                                                        <span>{((d?.input_tokens || 0) + (d?.output_tokens || 0)).toLocaleString('pt-BR')} tokens</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Detalhamento por modelo */}
                                        {iaUso.porModelo?.length > 0 && (
                                            <div className="mb-4">
                                                <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Gasto por modelo</div>
                                                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                                                    <table className="w-full text-[11px]">
                                                        <thead style={{ background: 'var(--bg-muted)' }}>
                                                            <tr>
                                                                <th className="text-left px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Modelo</th>
                                                                <th className="text-right px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Hoje</th>
                                                                <th className="text-right px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Este mês</th>
                                                                <th className="text-right px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Total</th>
                                                                <th className="text-right px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Chamadas</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {iaUso.porModelo.map((r, i) => {
                                                                const isAtivo = emp.ia_model && r.modelo === emp.ia_model;
                                                                return (
                                                                    <tr key={i} style={{
                                                                        borderTop: '1px solid var(--border)',
                                                                        background: isAtivo ? 'var(--primary-bg, rgba(19,121,240,0.04))' : 'transparent',
                                                                    }}>
                                                                        <td className="px-2 py-1.5 flex items-center gap-1.5">
                                                                            <span style={{ color: 'var(--text-secondary)' }}>{(r.modelo || '').split('-').slice(0, 3).join('-')}</span>
                                                                            {isAtivo && <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontWeight: 700 }}>ativo</span>}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>${(r.custo_usd_hoje || 0).toFixed(4)}</td>
                                                                        <td className="px-2 py-1.5 text-right font-semibold" style={{ color: isAtivo ? 'var(--primary)' : 'var(--text-primary)' }}>${(r.custo_usd_mes || 0).toFixed(4)}</td>
                                                                        <td className="px-2 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>${(r.custo_usd || 0).toFixed(4)}</td>
                                                                        <td className="px-2 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>{r.chamadas}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {iaUso.recentes?.length > 0 && (
                                            <div>
                                                <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Últimas chamadas</div>
                                                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', maxHeight: 260, overflowY: 'auto' }}>
                                                    <table className="w-full text-[11px]">
                                                        <thead style={{ background: 'var(--bg-muted)' }}>
                                                            <tr>
                                                                <th className="text-left px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Data</th>
                                                                <th className="text-left px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Modelo</th>
                                                                <th className="text-right px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>In</th>
                                                                <th className="text-right px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Out</th>
                                                                <th className="text-right px-2 py-1.5" style={{ color: 'var(--text-muted)' }}>Custo</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {iaUso.recentes.map((r, i) => {
                                                                const isAtivo = emp.ia_model && r.modelo === emp.ia_model;
                                                                return (
                                                                    <tr key={i} style={{
                                                                        borderTop: '1px solid var(--border)',
                                                                        background: isAtivo ? 'var(--primary-bg, rgba(19,121,240,0.04))' : 'transparent',
                                                                    }}>
                                                                        <td className="px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                                                                            {new Date(r.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 truncate" style={{ color: isAtivo ? 'var(--primary)' : 'var(--text-secondary)', maxWidth: 140, fontWeight: isAtivo ? 600 : 400 }}>{(r.modelo || '').split('-').slice(0, 3).join('-')}</td>
                                                                        <td className="px-2 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>{(r.input_tokens || 0).toLocaleString('pt-BR')}</td>
                                                                        <td className="px-2 py-1.5 text-right" style={{ color: 'var(--text-muted)' }}>{(r.output_tokens || 0).toLocaleString('pt-BR')}</td>
                                                                        <td className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>${(r.custo_usd || 0).toFixed(5)}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                                                    Preços estimados baseados na tabela oficial do provedor. Conversão R$ aproximada (1 USD ≈ R$ 5,50).
                                                </div>
                                            </div>
                                        )}

                                        {iaUso.total?.chamadas === 0 && (
                                            <div className="text-center py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                Nenhuma chamada registrada ainda. O consumo será exibido aqui conforme a IA for usada.
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-center py-4 text-xs" style={{ color: 'var(--text-muted)' }}>Carregando...</div>
                                )}
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
                                        { label: 'Caixas', val: kbStats.caixas, color: 'var(--info)' },
                                        { label: 'Componentes', val: kbStats.componentes, color: '#8b5cf6' },
                                        { label: 'Materiais', val: kbStats.materiais, color: 'var(--success)' },
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
                                        <button onClick={copiarBaseConhecimento} className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md cursor-pointer" style={{ background: kbCopied ? 'var(--success-bg)' : 'var(--bg-muted)', color: kbCopied ? 'var(--success)' : 'var(--primary)', border: `1px solid ${kbCopied ? 'var(--success-border)' : 'var(--border)'}` }}>
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
                                <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: emp.ia_provider === 'gemini' ? 'var(--bg-muted)' : 'transparent', border: emp.ia_provider === 'gemini' ? '1px solid var(--border)' : '1px solid transparent' }}>
                                    <Bot size={20} style={{ color: 'var(--text-secondary)' }} />
                                    <div>
                                        <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Google Gemini</div>
                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Gemini 2.0 Flash, 1.5 Flash, 1.5 Pro</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Automações n8n ─────────────────────────────── */}
            {activeSection === 'automacoes' && (
                <div className={Z.card}>
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h2 className="font-semibold text-lg flex items-center gap-2" style={{ color: 'var(--primary)' }}>
                                <Zap size={18} /> Automações n8n
                            </h2>
                            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                Eventos do ERP que disparam webhook pro seu n8n. Configure a URL em <strong>IA → Integrações</strong>.
                            </div>
                        </div>
                    </div>

                    {/* ═══ Eventos disparados automaticamente ═══ */}
                    <div className="rounded-lg p-3 mb-5 text-[11px]" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <div className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Eventos disparando hoje:</div>
                        <ul style={{ paddingLeft: 16, lineHeight: 1.8 }}>
                            <li><strong>lead_captado</strong> — assim que alguém preenche o formulário da landing</li>
                            <li><strong>proposta_enviada</strong> — quando o orçamento muda pra coluna "Enviado" no kanban</li>
                            <li><strong>lead_quente_silencioso</strong> — lead com score≥65 que parou de responder há 72h+ (cooldown 14 dias)</li>
                            <li><strong>cliente_inativo_60d</strong> — cliente sumido 60+ dias, com 6 filtros de segurança (abaixo)</li>
                        </ul>
                    </div>

                    {/* ═══ Reativação de clientes inativos ═══ */}
                    <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-sm" style={{ color: 'var(--primary)' }}>
                                    💤 Reativação de clientes inativos (60d+)
                                </h3>
                                <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                    Candidatos filtrados por 6 sinais de segurança: orçamento perdido, IA bloqueada, conversa abandonada, lead com motivo de perda, projeto cancelado e notas negativas.
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={rodarScanReat} className={Z.btn2} style={{ fontSize: 11 }} disabled={reatLoading}>
                                    <RefreshCw size={11} style={{ display: 'inline', marginRight: 4 }} />
                                    Varrer agora
                                </button>
                                <button
                                    type="button"
                                    onClick={toggleReatAuto}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                    disabled={!isGerente}
                                    style={{
                                        background: reatAuto ? 'var(--danger-bg)' : 'var(--success-bg)',
                                        color: reatAuto ? 'var(--danger)' : 'var(--success)',
                                        border: `1px solid ${reatAuto ? 'var(--danger-border)' : 'var(--success-border)'}`,
                                    }}
                                    title={reatAuto ? 'Modo AUTO: dispara direto sem aprovação manual' : 'Modo PREVIEW: aguarda aprovação manual antes de disparar'}
                                >
                                    {reatAuto ? 'Modo AUTO' : 'Modo PREVIEW'}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {[
                                ['Aguardando', reatStats.pending ?? 0, 'var(--warning)'],
                                ['Disparadas', reatStats.disparada ?? 0, 'var(--success)'],
                                ['Rejeitadas', reatStats.rejeitada ?? 0, 'var(--text-muted)'],
                                ['Aprovadas', reatStats.aprovada ?? 0, 'var(--primary)'],
                            ].map(([label, val, cor]) => (
                                <div key={label} className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
                                    <div className="text-lg font-bold" style={{ color: cor }}>{val}</div>
                                </div>
                            ))}
                        </div>

                        {reatLoading && !reatItems.length ? (
                            <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>Carregando...</div>
                        ) : reatItems.length === 0 ? (
                            <div className="rounded-lg p-6 text-center text-[12px]" style={{ background: 'var(--bg-muted)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                                Sem candidatos pendentes. A varredura roda 1x/dia automaticamente.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {reatItems.map(it => {
                                    const p = it.payload || {};
                                    const h = p.historico || {};
                                    return (
                                        <div key={it.id} className="rounded-lg p-3" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                                                        {p.nome || 'Sem nome'}
                                                        <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>
                                                            {p.telefone}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                        <span style={{ color: 'var(--warning)' }}>{p.dias_inativo}d inativo</span>
                                                        {' · último contato via '}{p.ultimo_contato_tipo}
                                                        {h.orcamento_aprovado && <span className="ml-2" style={{ color: 'var(--success)' }}>✓ virou cliente</span>}
                                                        {!h.orcamento_aprovado && h.orcamentos_count > 0 && <span className="ml-2">🔸 só lead ({h.orcamentos_count} orç)</span>}
                                                    </div>
                                                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                                        {h.ultimo_ambiente && <>{h.ultimo_ambiente} · </>}
                                                        {h.ultimo_orcamento_valor > 0 && <>R$ {Number(h.ultimo_orcamento_valor).toLocaleString('pt-BR')} · </>}
                                                        {h.projetos_concluidos > 0 && <>{h.projetos_concluidos} projeto(s) concluído(s) · </>}
                                                        {h.ultima_temperatura && <>temp: {h.ultima_temperatura}</>}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    <button
                                                        onClick={() => aprovarReat(it.id)}
                                                        disabled={reatActionId === it.id || !isGerente}
                                                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                                        style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}
                                                    >
                                                        <Check size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                        Disparar
                                                    </button>
                                                    <button
                                                        onClick={() => rejeitarReat(it.id)}
                                                        disabled={reatActionId === it.id || !isGerente}
                                                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                                        style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                                                    >
                                                        <XCircle size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                        Rejeitar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--primary)' }}>Microsoft Clarity</h3>
                            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                                Heatmap e gravação de sessões na landing, propostas e portal do cliente.{' '}
                                <a href="https://clarity.microsoft.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                                    Acessar dashboard
                                </a>
                            </p>
                            <label className={Z.lbl}>Project ID</label>
                            <input
                                className={Z.inp}
                                value={emp.clarity_project_id ?? ''}
                                onChange={e => setEmp({ ...emp, clarity_project_id: e.target.value })}
                                disabled={!isGerente}
                                placeholder="ex: wed7zy3qnz (deixe vazio para desativar)"
                                style={{ fontFamily: 'monospace' }}
                            />
                            <p className="text-[10.5px] mt-2" style={{ color: 'var(--text-muted)' }}>
                                O tracking não roda em <code>localhost</code> — só em produção.
                                {emp.clarity_project_id ? ' ✓ Ativo.' : ' ✗ Desativado.'}
                            </p>
                        </div>

                        <div className={Z.card + ' mt-4'}>
                            <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--primary)' }}>Meta Ads + Google Ads</h3>
                            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                                Rastreamento client-side (Pixel) + server-side (CAPI) — cobertura máxima mesmo com iOS 14+ e ad blockers.{' '}
                                <a href="https://business.facebook.com/events_manager" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                                    Gerenciador de Eventos
                                </a>
                            </p>
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className={Z.lbl}>Meta Pixel ID</label>
                                    <input
                                        className={Z.inp}
                                        value={emp.fb_pixel_id ?? ''}
                                        onChange={e => setEmp({ ...emp, fb_pixel_id: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="ex: 1234567890123456"
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        {emp.fb_pixel_id ? '✓ Pixel ativo na landing page.' : '✗ Pixel desativado.'}
                                    </p>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Access Token (CAPI)</label>
                                    <input
                                        className={Z.inp}
                                        value={emp.fb_access_token ?? ''}
                                        onChange={e => setEmp({ ...emp, fb_access_token: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="Token de acesso — Gerenciador de Eventos → Configurações → CAPI"
                                        style={{ fontFamily: 'monospace' }}
                                        type="password"
                                        autoComplete="off"
                                    />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        {emp.fb_access_token ? '✓ CAPI ativo — leads e vendas enviados server-side.' : '✗ CAPI desativado (só Pixel client-side).'}
                                    </p>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Google Ads ID <span style={{ fontWeight: 400, fontSize: '10px' }}>(opcional)</span></label>
                                    <input
                                        className={Z.inp}
                                        value={emp.google_ads_id ?? ''}
                                        onChange={e => setEmp({ ...emp, google_ads_id: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="ex: AW-12345678/AbCdEfGhIjKlMnOp"
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Conversion Label (Conversões → Detalhes → ID do evento). Dispara no envio do formulário da landing.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 p-2.5 rounded-lg text-[10.5px] leading-5" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                <strong>Meta Lead Ads (opcional):</strong> para receber leads do formulário nativo do Meta diretamente no sistema, configure o webhook em{' '}
                                <code>POST /api/leads/facebook</code> no Gerenciador de Formulários. Use o <em>Webhook Token</em> da aba WhatsApp como verify token.
                            </div>
                        </div>

                        {/* ═══ Integrações externas (n8n / Zapier / Make) ═══ */}
                        <div className={Z.card} style={{ marginTop: 20 }}>
                            <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--primary)' }}>Integrações externas (n8n)</h3>
                            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                                Ornato dispara um POST JSON assinado (HMAC-SHA256) sempre que um lead é captado.
                                Conecte n8n, Zapier ou Make para automatizar follow-up, planilhas, CRM, e-mail etc.
                            </p>
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className={Z.lbl}>URL do webhook</label>
                                    <input
                                        className={Z.inp}
                                        value={emp.n8n_webhook_url ?? ''}
                                        onChange={e => setEmp({ ...emp, n8n_webhook_url: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="https://n8n.seudominio.com/webhook/ornato-lead"
                                        style={{ fontFamily: 'monospace' }}
                                    />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        {emp.n8n_webhook_url ? '✓ Webhook ativo — cada lead será enviado em paralelo.' : '✗ Integração desligada (vazio = sem disparo).'}
                                    </p>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Secret (HMAC)</label>
                                    <input
                                        className={Z.inp}
                                        value={emp.n8n_webhook_secret ?? ''}
                                        onChange={e => setEmp({ ...emp, n8n_webhook_secret: e.target.value })}
                                        disabled={!isGerente}
                                        placeholder="Gere com: openssl rand -hex 32"
                                        style={{ fontFamily: 'monospace' }}
                                        type="password"
                                        autoComplete="off"
                                    />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Usado para assinar o header <code>X-Ornato-Signature: sha256=&lt;hmac&gt;</code>. No n8n, valide com um nó Crypto.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 p-2.5 rounded-lg text-[10.5px] leading-5" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                <strong>Payload:</strong> <code>{'{ event, timestamp, lead:{...}, attrib:{utm_*, gclid, fbclid, referrer} }'}</code>. Timeout 3s — se o n8n cair, o lead ainda é salvo normalmente no Ornato e a falha vai para <code>automacoes_log</code>.
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
                                                style={{ color: 'var(--danger)' }}
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
                                                style={{ color: 'var(--danger)' }}
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
                                                style={{ color: 'var(--danger)' }}
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
                                                style={{ color: 'var(--danger)' }}
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
                <div className="max-w-3xl space-y-5">

                    {/* ── Card 1: Aparência & textos da página pública ── */}
                    <div className={Z.card}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <Palette size={20} style={{ color: 'var(--primary)' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Página Pública · Aparência & Textos</h3>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        Config exclusiva da <code style={{ fontSize: 10 }}>/portfolioornato</code> — independente da proposta e landing
                                    </p>
                                </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer select-none" title="Ativar/desativar página pública">
                                <input
                                    type="checkbox"
                                    checked={portCfg.portfolio_ativo ? true : false}
                                    onChange={e => setPortCfg({ ...portCfg, portfolio_ativo: e.target.checked ? 1 : 0 })}
                                    disabled={!isGerente}
                                />
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ativo</span>
                            </label>
                        </div>

                        {/* Logo dedicado */}
                        <div className="mb-4">
                            <ImageUploader
                                label="Logo do Portfolio (opcional)"
                                image={portCfg.portfolio_logo}
                                onChange={portfolio_logo => setPortCfg({ ...portCfg, portfolio_logo })}
                                disabled={!isGerente}
                                hint="Se vazio, usa Logo do Sistema → Logo da Empresa"
                            />
                        </div>

                        {/* Hero textos */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                            <div>
                                <label className={Z.lbl}>Tag superior</label>
                                <input
                                    className={Z.inp}
                                    value={portCfg.portfolio_tag}
                                    onChange={e => setPortCfg({ ...portCfg, portfolio_tag: e.target.value })}
                                    placeholder="Nosso trabalho"
                                    disabled={!isGerente}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className={Z.lbl}>Título principal</label>
                                <input
                                    className={Z.inp}
                                    value={portCfg.portfolio_titulo}
                                    onChange={e => setPortCfg({ ...portCfg, portfolio_titulo: e.target.value })}
                                    placeholder="Projetos que transformam ambientes em experiências"
                                    disabled={!isGerente}
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className={Z.lbl}>Subtítulo (pode quebrar linha)</label>
                            <textarea
                                className={Z.inp}
                                rows={2}
                                value={portCfg.portfolio_subtitulo}
                                onChange={e => setPortCfg({ ...portCfg, portfolio_subtitulo: e.target.value })}
                                placeholder="Marcenaria sob medida com acabamento premium..."
                                disabled={!isGerente}
                            />
                        </div>

                        {/* Cores */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className={Z.lbl}>Cor de fundo</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={portCfg.portfolio_cor_fundo || '#1E1917'}
                                        onChange={e => setPortCfg({ ...portCfg, portfolio_cor_fundo: e.target.value })}
                                        disabled={!isGerente}
                                        style={{ width: 40, height: 38, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
                                    />
                                    <input
                                        className={Z.inp}
                                        value={portCfg.portfolio_cor_fundo}
                                        onChange={e => setPortCfg({ ...portCfg, portfolio_cor_fundo: e.target.value })}
                                        placeholder="#1E1917"
                                        disabled={!isGerente}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={Z.lbl}>Cor de destaque</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={portCfg.portfolio_cor_destaque || '#C9A96E'}
                                        onChange={e => setPortCfg({ ...portCfg, portfolio_cor_destaque: e.target.value })}
                                        disabled={!isGerente}
                                        style={{ width: 40, height: 38, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
                                    />
                                    <input
                                        className={Z.inp}
                                        value={portCfg.portfolio_cor_destaque}
                                        onChange={e => setPortCfg({ ...portCfg, portfolio_cor_destaque: e.target.value })}
                                        placeholder="#C9A96E"
                                        disabled={!isGerente}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* CTA + footer */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className={Z.lbl}>Texto do botão WhatsApp</label>
                                <input
                                    className={Z.inp}
                                    value={portCfg.portfolio_cta_texto}
                                    onChange={e => setPortCfg({ ...portCfg, portfolio_cta_texto: e.target.value })}
                                    placeholder="Solicitar projeto"
                                    disabled={!isGerente}
                                />
                            </div>
                            <div>
                                <label className={Z.lbl}>Frase do rodapé</label>
                                <input
                                    className={Z.inp}
                                    value={portCfg.portfolio_footer_texto}
                                    onChange={e => setPortCfg({ ...portCfg, portfolio_footer_texto: e.target.value })}
                                    placeholder="Marcenaria sob medida"
                                    disabled={!isGerente}
                                />
                            </div>
                        </div>

                        {/* WA template */}
                        <div className="mb-4">
                            <label className={Z.lbl}>
                                Mensagem padrão do WhatsApp (opcional)
                                <span className="font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                                    — use <code style={{ fontSize: 10 }}>{'{projeto}'}</code> e <code style={{ fontSize: 10 }}>{'{empresa}'}</code>
                                </span>
                            </label>
                            <textarea
                                className={Z.inp}
                                rows={3}
                                value={portCfg.portfolio_wa_mensagem}
                                onChange={e => setPortCfg({ ...portCfg, portfolio_wa_mensagem: e.target.value })}
                                placeholder={"Olá! Vi o projeto *{projeto}* no portfolio da {empresa} e gostaria de conversar sobre algo similar."}
                                disabled={!isGerente}
                            />
                        </div>

                        {/* Save button */}
                        {isGerente && (
                            <div className="flex justify-end">
                                <button
                                    disabled={portCfgSaving}
                                    onClick={async () => {
                                        setPortCfgSaving(true);
                                        try {
                                            await api.put('/portfolio/config', portCfg);
                                            notify?.('Configurações salvas!');
                                        } catch (e) {
                                            notify?.(e.error || 'Erro ao salvar');
                                        } finally {
                                            setPortCfgSaving(false);
                                        }
                                    }}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                                    style={{ background: 'var(--primary)', opacity: portCfgSaving ? 0.6 : 1 }}
                                >
                                    {portCfgSaving ? 'Salvando…' : 'Salvar aparência'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Card 2: Fotos do portfolio ── */}
                    <div className={Z.card}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <Images size={20} style={{ color: 'var(--primary)' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Fotos do Portfolio</h3>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Projetos exibidos na página pública e apresentação</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <a
                                    href="/portfolioornato"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                                    style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                                    title="Abrir página pública do portfolio"
                                >
                                    <ExternalLink size={13} /> Ver página
                                </a>
                                {isGerente && !portEdit && (
                                    <button
                                        onClick={() => setPortEdit({ titulo: '', designer: '', descricao: '', imagem: '', ambiente: '' })}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                        style={{ background: 'var(--primary)' }}
                                    >
                                        <Plus size={14} /> Adicionar
                                    </button>
                                )}
                            </div>
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
                                    <label className={Z.lbl}>Ambiente / Espaço</label>
                                    <select className={Z.inp} value={portEdit.ambiente || ''} onChange={e => setPortEdit({ ...portEdit, ambiente: e.target.value })}>
                                        <option value="">— Selecione —</option>
                                        <option value="Cozinha">Cozinha</option>
                                        <option value="Closet / Dormitório">Closet / Dormitório</option>
                                        <option value="Banheiro">Banheiro</option>
                                        <option value="Home Office">Home Office</option>
                                        <option value="Sala de Estar">Sala de Estar</option>
                                        <option value="Área Gourmet">Área Gourmet</option>
                                        <option value="Múltiplos Ambientes">Múltiplos Ambientes</option>
                                        <option value="Outro">Outro</option>
                                    </select>
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
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                {p.ambiente && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--primary)', color: '#fff', opacity: 0.85 }}>{p.ambiente}</span>}
                                                {p.designer && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.designer}</span>}
                                            </div>
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
                                                }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--danger)' }} title="Excluir">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 p-3 rounded-lg text-xs leading-5" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            Estas fotos aparecem na <strong>apresentação da proposta</strong> e na <strong>página pública de portfolio</strong>{' '}
                            (<code style={{ fontSize: 10 }}>/portfolioornato</code>). Recomendamos de 6 a 12 projetos com fotos de alta qualidade.
                            O campo <strong>Ambiente</strong> ativa o filtro por espaço na página pública.
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ SEÇÃO: Depoimentos ═══ */}
            {activeSection === 'depoimentos' && (
                <div className="max-w-3xl">
                    <div className={Z.card}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                    <Ic.Star style={{ color: 'var(--primary)' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Depoimentos</h3>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Depoimentos de clientes que aparecem na apresentação da proposta</p>
                                </div>
                            </div>
                            {isGerente && !depEdit && (
                                <button
                                    onClick={() => setDepEdit({ nome_cliente: '', texto: '', estrelas: 5 })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                    style={{ background: 'var(--primary)' }}
                                >
                                    <Plus size={14} /> Adicionar
                                </button>
                            )}
                        </div>

                        {/* Form add/edit */}
                        {depEdit && (
                            <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className={Z.lbl}>Nome do Cliente</label>
                                        <input className={Z.inp} value={depEdit.nome_cliente} onChange={e => setDepEdit({ ...depEdit, nome_cliente: e.target.value })} placeholder="Ex: Maria e João Silva" />
                                    </div>
                                    <div>
                                        <label className={Z.lbl}>Estrelas (1 a 5)</label>
                                        <div className="flex items-center gap-1 mt-1">
                                            {[1,2,3,4,5].map(n => (
                                                <button key={n} type="button" onClick={() => setDepEdit({ ...depEdit, estrelas: n })}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                                    <svg width="24" height="24" viewBox="0 0 24 24" fill={n <= (depEdit.estrelas || 5) ? 'var(--warning)' : '#e2e8f0'}>
                                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                                    </svg>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="mb-3">
                                    <label className={Z.lbl}>Depoimento</label>
                                    <textarea className={Z.inp} rows={3} value={depEdit.texto} onChange={e => setDepEdit({ ...depEdit, texto: e.target.value })} placeholder="O texto do depoimento do cliente..." />
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={async () => {
                                            if (!depEdit.texto?.trim()) { notify?.('Escreva o depoimento'); return; }
                                            try {
                                                if (depEdit.id) {
                                                    await api.put(`/depoimentos/${depEdit.id}`, depEdit);
                                                } else {
                                                    await api.post('/depoimentos', depEdit);
                                                }
                                                notify?.('Depoimento salvo!');
                                                setDepEdit(null);
                                                loadDepoimentos();
                                            } catch (ex) { notify?.(ex.error || 'Erro ao salvar'); }
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                                        style={{ background: 'var(--primary)' }}
                                    >
                                        <Check size={14} /> {depEdit.id ? 'Atualizar' : 'Salvar'}
                                    </button>
                                    <button
                                        onClick={() => setDepEdit(null)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* List */}
                        {depoimentos.length === 0 && !depEdit ? (
                            <div className="py-10 text-center text-xs rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                <Ic.Star className="mx-auto mb-2 opacity-40" />
                                Nenhum depoimento cadastrado.<br />
                                <span className="opacity-70">Adicione depoimentos de clientes para exibir na apresentação.</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {depoimentos.map((dep, i) => (
                                    <div key={dep.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="flex gap-0.5">
                                                    {[1,2,3,4,5].map(n => (
                                                        <svg key={n} width="14" height="14" viewBox="0 0 24 24" fill={n <= dep.estrelas ? 'var(--warning)' : '#e2e8f0'}>
                                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                                        </svg>
                                                    ))}
                                                </div>
                                                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{dep.nome_cliente || 'Cliente'}</span>
                                            </div>
                                            <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                                                &ldquo;{dep.texto.length > 120 ? dep.texto.slice(0, 120) + '...' : dep.texto}&rdquo;
                                            </p>
                                        </div>
                                        {isGerente && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={async () => {
                                                    if (i === 0) return;
                                                    const ids = depoimentos.map(x => x.id);
                                                    [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]];
                                                    await api.put('/depoimentos/reorder', { ids });
                                                    loadDepoimentos();
                                                }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Mover para cima">
                                                    <ArrowUp size={14} />
                                                </button>
                                                <button onClick={async () => {
                                                    if (i === depoimentos.length - 1) return;
                                                    const ids = depoimentos.map(x => x.id);
                                                    [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
                                                    await api.put('/depoimentos/reorder', { ids });
                                                    loadDepoimentos();
                                                }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Mover para baixo">
                                                    <ArrowDown size={14} />
                                                </button>
                                                <button onClick={() => setDepEdit({ ...dep })} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--primary)' }} title="Editar">
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={async () => {
                                                    if (!confirm('Remover este depoimento?')) return;
                                                    await api.del(`/depoimentos/${dep.id}`);
                                                    notify?.('Depoimento removido');
                                                    loadDepoimentos();
                                                }} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)]" style={{ color: 'var(--danger)' }} title="Excluir">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            Os depoimentos aparecem na <strong>apresentação da proposta</strong> (link de experiência completa).
                            Se nenhum depoimento estiver cadastrado, a seção não aparecerá.
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ SEÇÃO: Follow-ups automáticos ═══ */}
            {activeSection === 'followups' && (
                <div className="max-w-4xl">
                    <div className={Z.card}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,169,110,0.10)', border: '1px solid rgba(201,169,110,0.25)' }}>
                                <Bell size={20} style={{ color: '#C9A96E' }} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Follow-ups automáticos</h3>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Defina quando o sistema cria um lembrete de contato por estágio do funil</p>
                            </div>
                        </div>

                        {/* Form criar/editar regra */}
                        <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                                {fuEditId ? 'Editar regra' : 'Nova regra'}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                                <div>
                                    <label className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Estágio</label>
                                    <select
                                        value={fuForm.coluna_id}
                                        onChange={e => setFuForm(f => ({ ...f, coluna_id: e.target.value }))}
                                        className={Z.inp}
                                        style={{ fontSize: 12 }}
                                        disabled={!!fuEditId}
                                    >
                                        <option value="">Selecione…</option>
                                        {fuColunas.map(c => (
                                            <option key={c.id} value={c.id}>{c.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Canal</label>
                                    <select
                                        value={fuForm.tipo}
                                        onChange={e => setFuForm(f => ({ ...f, tipo: e.target.value }))}
                                        className={Z.inp}
                                        style={{ fontSize: 12 }}
                                    >
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="ligacao">Ligação</option>
                                        <option value="email">E-mail</option>
                                        <option value="visita">Visita</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Disparar após (horas)</label>
                                    <input
                                        type="number" min="1"
                                        value={fuForm.horas_apos}
                                        onChange={e => setFuForm(f => ({ ...f, horas_apos: e.target.value }))}
                                        className={Z.inp}
                                        style={{ fontSize: 12 }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>Notas (opcional)</label>
                                    <input
                                        type="text"
                                        value={fuForm.notas}
                                        onChange={e => setFuForm(f => ({ ...f, notas: e.target.value }))}
                                        placeholder="Mensagem sugerida…"
                                        className={Z.inp}
                                        style={{ fontSize: 12 }}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={async () => {
                                        if (!fuForm.coluna_id || !fuForm.horas_apos) { notify?.('Selecione o estágio e defina as horas'); return; }
                                        try {
                                            if (fuEditId) {
                                                await api.put(`/follow-ups/regras/${fuEditId}`, {
                                                    tipo: fuForm.tipo,
                                                    horas_apos: parseInt(fuForm.horas_apos),
                                                    notas: fuForm.notas,
                                                });
                                                notify?.('Regra atualizada');
                                            } else {
                                                await api.post('/follow-ups/regras', {
                                                    coluna_id: parseInt(fuForm.coluna_id),
                                                    tipo: fuForm.tipo,
                                                    horas_apos: parseInt(fuForm.horas_apos),
                                                    notas: fuForm.notas,
                                                });
                                                notify?.('Regra criada');
                                            }
                                            setFuForm({ coluna_id: '', tipo: 'whatsapp', horas_apos: 24, notas: '' });
                                            setFuEditId(null);
                                            loadFollowUps();
                                        } catch (e) { notify?.(e?.error || 'Erro ao salvar'); }
                                    }}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                                    style={{ background: 'var(--primary)' }}
                                >
                                    {fuEditId ? 'Salvar' : 'Criar regra'}
                                </button>
                                {fuEditId && (
                                    <button
                                        onClick={() => { setFuEditId(null); setFuForm({ coluna_id: '', tipo: 'whatsapp', horas_apos: 24, notas: '' }); }}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold"
                                        style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Lista de regras existentes */}
                        <div className="space-y-2">
                            {fuRegras.length === 0 ? (
                                <div className="text-center text-xs py-8" style={{ color: 'var(--text-muted)' }}>
                                    Nenhuma regra cadastrada. Crie uma para automatizar follow-ups.
                                </div>
                            ) : fuRegras.map(r => {
                                const TipoIcon = r.tipo === 'ligacao' ? Phone : r.tipo === 'visita' ? MapPin : r.tipo === 'email' ? Bell : MessageCircle;
                                return (
                                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', opacity: r.ativo ? 1 : 0.5 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: 3, background: r.coluna_cor || 'var(--muted)', flexShrink: 0 }} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{r.coluna_nome}</div>
                                            <div className="text-[11px] flex items-center gap-2 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                <TipoIcon size={10} />
                                                <span>{r.tipo}</span>
                                                <span>·</span>
                                                <Clock size={10} />
                                                <span>após {r.horas_apos}h</span>
                                                {r.notas && <><span>·</span><span className="truncate">{r.notas}</span></>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await api.put(`/follow-ups/regras/${r.id}`, { ativo: r.ativo ? 0 : 1 });
                                                    loadFollowUps();
                                                } catch (e) { notify?.(e?.error || 'Erro'); }
                                            }}
                                            className="px-2 py-1 rounded text-[10px] font-semibold"
                                            style={{ background: r.ativo ? 'var(--success)' : 'var(--bg-card)', color: r.ativo ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
                                        >
                                            {r.ativo ? 'Ativa' : 'Inativa'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setFuEditId(r.id);
                                                setFuForm({ coluna_id: r.coluna_id, tipo: r.tipo, horas_apos: r.horas_apos, notas: r.notas || '' });
                                            }}
                                            className="p-1.5 rounded hover:bg-[var(--bg-card)]"
                                            title="Editar"
                                        >
                                            <Pencil size={12} style={{ color: 'var(--text-muted)' }} />
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!confirm('Excluir esta regra?')) return;
                                                try {
                                                    await api.del(`/follow-ups/regras/${r.id}`);
                                                    loadFollowUps();
                                                    notify?.('Regra removida');
                                                } catch (e) { notify?.(e?.error || 'Erro'); }
                                            }}
                                            className="p-1.5 rounded hover:bg-[var(--bg-card)]"
                                            title="Excluir"
                                        >
                                            <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            Quando um lead é criado ou movido para um estágio com regra ativa, o sistema gera um follow-up automático para o responsável do lead. Eles aparecem no <strong>Dashboard</strong> e no <strong>Funil</strong>.
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
                                            className="p-1 rounded hover:bg-red-50 cursor-pointer" style={{ color: 'var(--danger)' }} title="Excluir">
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
                                                    {Math.round(horasMes)}h produtivas/mês
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

            {activeSection === 'modulos' && (
                <div className="max-w-2xl">
                    <div className={Z.card}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                                <Shield size={20} style={{ color: 'var(--primary)' }} />
                            </div>
                            <div>
                                <div className="text-base font-bold text-[var(--text-primary)]">Módulos do Sistema</div>
                                <div className="text-xs text-[var(--text-muted)]">Ative ou desative módulos do menu para todos os usuários</div>
                            </div>
                        </div>

                        <div className="text-[11px] text-[var(--text-muted)] mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
                            Módulos desativados ficam ocultos no menu lateral. Você pode reativá-los a qualquer momento. Itens essenciais (Dashboard, Configurações, Usuários) não podem ser desativados.
                        </div>

                        {(allMenuItems || []).map(group => {
                            if (!group.label) return null; // skip top/projetos_hub (no group label)
                            const PROTECTED = ['dash', 'cfg', 'users'];
                            return (
                                <div key={group.id} style={{ marginBottom: 16 }}>
                                    <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-2">
                                        {group.label}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {group.items.map(item => {
                                            const isProtected = PROTECTED.includes(item.id);
                                            const isHidden = (menusOcultos || []).includes(item.id);
                                            const ItemIcon = item.ic;
                                            return (
                                                <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{
                                                    background: isHidden ? 'var(--bg-muted)' : 'transparent',
                                                    opacity: isHidden ? 0.5 : 1,
                                                    border: '1px solid var(--border)',
                                                }}>
                                                    <div className="flex items-center gap-3">
                                                        {ItemIcon && <ItemIcon size={16} style={{ color: isHidden ? 'var(--text-muted)' : 'var(--primary)' }} />}
                                                        <span className="text-sm font-medium" style={{ color: isHidden ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                                            {item.lb}
                                                        </span>
                                                        {isProtected && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-muted)] font-semibold">ESSENCIAL</span>}
                                                    </div>
                                                    <button
                                                        disabled={isProtected}
                                                        onClick={async () => {
                                                            const current = menusOcultos || [];
                                                            const next = isHidden
                                                                ? current.filter(id => id !== item.id)
                                                                : [...current, item.id];
                                                            try {
                                                                await api.put('/config/menus', { menus_ocultos_json: JSON.stringify(next) });
                                                                onMenusChange?.();
                                                                notify?.(isHidden ? `${item.lb} ativado` : `${item.lb} desativado`);
                                                            } catch { notify?.('Erro ao salvar'); }
                                                        }}
                                                        className="relative w-10 h-5 rounded-full transition-colors"
                                                        style={{
                                                            background: isProtected ? 'var(--primary)' : (isHidden ? 'var(--border)' : 'var(--primary)'),
                                                            cursor: isProtected ? 'not-allowed' : 'pointer',
                                                            opacity: isProtected ? 0.6 : 1,
                                                        }}
                                                        title={isProtected ? 'Módulo essencial — não pode ser desativado' : (isHidden ? 'Clique para ativar' : 'Clique para desativar')}
                                                    >
                                                        <span className="absolute top-0.5 rounded-full w-4 h-4 bg-white shadow transition-all"
                                                            style={{ left: (isProtected || !isHidden) ? 22 : 2 }}
                                                        />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Itens top-level protegidos */}
                        <div style={{ marginBottom: 16 }}>
                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                                Fixos
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {[{ id: 'dash', lb: 'Dashboard' }, { id: 'proj', lb: 'Projetos' }].map(item => (
                                    <div key={item.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ border: '1px solid var(--border)' }}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium text-[var(--text-primary)]">{item.lb}</span>
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-muted)] text-[var(--text-muted)] font-semibold">ESSENCIAL</span>
                                        </div>
                                        <div className="relative w-10 h-5 rounded-full" style={{ background: 'var(--primary)', opacity: 0.6, cursor: 'not-allowed' }}>
                                            <span className="absolute top-0.5 rounded-full w-4 h-4 bg-white shadow" style={{ left: 22 }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                    <Download size={16} style={{ color: 'var(--success)' }} />
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
                                    style={{ background: 'var(--success)' }}
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
                                    background: backupResult.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
                                    color: backupResult.ok ? 'var(--success-hover)' : 'var(--danger-hover)',
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

                    {/* ── Backup Google Drive ── */}
                    <div className={Z.card} style={{ marginTop: 16 }}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#e8f5e9' }}>
                                <Database size={20} style={{ color: '#4caf50' }} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Backup Automatico — Google Drive</h3>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Backup diario do banco completo, comprimido e enviado ao Drive (3h da manha)</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            {/* Disparar backup manual */}
                            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Upload size={16} style={{ color: '#4caf50' }} />
                                            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Backup Manual</span>
                                        </div>
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            Envia uma copia do banco de dados para a pasta Backups no Google Drive agora.
                                        </p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            setDriveBackupLoading(true); setBackupResult(null);
                                            try {
                                                const resp = await api.post('/config/backup-drive');
                                                setBackupResult({ ok: true, msg: `Backup enviado: ${resp.fileName} (${resp.sizeMB} MB)` });
                                                // Recarregar lista
                                                api.get('/config/backup-drive').then(setDriveBackups).catch(() => {});
                                            } catch (e) {
                                                setBackupResult({ ok: false, msg: e.error || e.message || 'Erro ao fazer backup' });
                                            }
                                            setDriveBackupLoading(false);
                                        }}
                                        disabled={driveBackupLoading}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shrink-0"
                                        style={{ background: '#4caf50' }}
                                    >
                                        {driveBackupLoading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                                        Fazer Backup
                                    </button>
                                </div>
                            </div>

                            {/* Lista de backups no Drive */}
                            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Database size={16} style={{ color: 'var(--primary)' }} />
                                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Backups no Drive</span>
                                    </div>
                                    <button
                                        onClick={() => api.get('/config/backup-drive').then(setDriveBackups).catch(() => setDriveBackups([]))}
                                        className="text-xs px-2 py-1 rounded flex items-center gap-1"
                                        style={{ color: 'var(--primary)', background: 'var(--bg-hover)' }}
                                    >
                                        <RefreshCw size={12} /> Atualizar
                                    </button>
                                </div>
                                {driveBackups.length === 0 ? (
                                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                                        Clique em "Atualizar" para carregar os backups do Drive.
                                    </p>
                                ) : (
                                    <div className="space-y-1 max-h-60 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                        {driveBackups.map((b, i) => (
                                            <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{
                                                background: i === 0 ? 'var(--success-bg)' : 'transparent',
                                                border: i === 0 ? '1px solid #bbf7d0' : '1px solid transparent',
                                            }}>
                                                <div className="flex items-center gap-2">
                                                    <Database size={12} style={{ color: i === 0 ? 'var(--success-hover)' : 'var(--text-muted)' }} />
                                                    <span style={{ color: 'var(--text-primary)', fontWeight: i === 0 ? 600 : 400 }}>{b.name}</span>
                                                    {i === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--success-hover)', color: '#fff' }}>MAIS RECENTE</span>}
                                                </div>
                                                <div className="flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                                                    <span>{b.sizeMB} MB</span>
                                                    <span>{new Date(b.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                            Backup automatico roda diariamente as 3h. Mantem os ultimos 30 backups. O arquivo e o banco completo comprimido (.db.gz).
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
